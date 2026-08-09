'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION_VERSION = '20260808225424';
const MIGRATION_NAME = `${MIGRATION_VERSION}_canonical_category_label_reconciliation.sql`;
const MIGRATION_PATH = path.join(ROOT, 'supabase/migrations', MIGRATION_NAME);
const PROJECT_CONFIG = path.join(ROOT, 'supabase/config.toml');
const REQUIRED_CLI_VERSION = '2.105.0';

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    input: options.input,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error) fail(`${options.label || command} failed: ${result.error.message}`);
  if (!options.allowFailure && result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    fail(`${options.label || command} exited with status ${result.status}.`);
  }
  return result;
}

function commandLineArgument(argument) {
  if (!/^[A-Za-z0-9_:\-./@?=]+$/.test(argument)) {
    fail(`Unsafe Windows command argument for local CLI proof: ${argument}`);
  }
  return argument;
}

function runSupabase(args, options = {}) {
  if (process.platform !== 'win32') {
    return run('supabase', args, { ...options, label: options.label || 'Supabase CLI' });
  }
  const executable = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
  const commandLine = ['supabase.cmd', ...args].map(commandLineArgument).join(' ');
  return run(executable, ['/d', '/s', '/c', commandLine], {
    ...options,
    label: options.label || 'Supabase CLI',
  });
}

function resolveLocalRuntime() {
  const config = fs.readFileSync(PROJECT_CONFIG, 'utf8');
  const project = config.match(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m);
  if (!project) fail('Unable to resolve the local Supabase project_id safely.');
  const container = `supabase_db_${project[1]}`;
  const inspect = run(
    'docker',
    ['inspect', '--format', '{{.State.Running}}', container],
    { label: 'local Supabase container probe' },
  );
  if (inspect.stdout.trim() !== 'true') fail(`Local database ${container} is not running.`);

  const version = runSupabase(['--version'], { label: 'Supabase CLI version probe' })
    .stdout.trim();
  if (version !== REQUIRED_CLI_VERSION) {
    fail(`This proof is frozen for Supabase CLI ${REQUIRED_CLI_VERSION}; received ${version}.`);
  }

  const status = runSupabase(['status', '-o', 'json'], {
    label: 'local Supabase status probe',
  });
  let statusJson;
  try {
    statusJson = JSON.parse(status.stdout);
  } catch (_error) {
    fail('Supabase status did not return valid JSON.');
  }
  const databaseUrl = new URL(statusJson.DB_URL);
  if (
    databaseUrl.protocol !== 'postgresql:'
    || !['127.0.0.1', 'localhost'].includes(databaseUrl.hostname)
    || databaseUrl.username !== 'postgres'
    || databaseUrl.pathname !== '/postgres'
  ) {
    fail('Refusing CLI proof because Supabase DB_URL is not the local postgres database.');
  }
  return { container, databaseUrl };
}

function checkedDatabaseName(kind) {
  const suffix = `${process.pid}_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
  const name = `kc_label_push_${kind}_${suffix}`;
  if (!/^kc_label_push_(?:success|failure)_[a-z0-9_]+$/.test(name) || name.length > 63) {
    fail(`Unsafe disposable database name: ${name}`);
  }
  return name;
}

function databaseUrlFor(baseUrl, database) {
  if (!/^kc_label_push_(?:success|failure)_[a-z0-9_]+$/.test(database)) {
    fail(`Refusing to build URL for unsafe database name: ${database}`);
  }
  const target = new URL(baseUrl.toString());
  target.pathname = `/${database}`;
  return target.toString();
}

function dockerDatabase(container, database, action) {
  if (!/^kc_label_push_(?:success|failure)_[a-z0-9_]+$/.test(database)) {
    fail(`Refusing ${action} for unsafe database name: ${database}`);
  }
  if (action === 'create') {
    run('docker', ['exec', container, 'createdb', '-U', 'postgres', database], {
      label: `create disposable database ${database}`,
    });
    return;
  }
  if (action === 'drop') {
    run(
      'docker',
      ['exec', container, 'dropdb', '--if-exists', '--force', '-U', 'postgres', database],
      { label: `drop disposable database ${database}` },
    );
    return;
  }
  fail(`Unknown disposable database action: ${action}`);
}

function runPsql(container, database, sql, capture = false) {
  const args = ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database];
  if (capture) args.push('-A', '-t', '-q');
  return run('docker', args, {
    input: sql,
    label: `psql in disposable database ${database}`,
  }).stdout.trim();
}

function schemaDump(container) {
  const dump = run(
    'docker',
    ['exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '--no-owner', '--no-privileges'],
    { label: 'schema-only dump of reset local database' },
  ).stdout;
  // `realtime.list_changes` carries a superuser-only function GUC in the
  // local image. It is irrelevant to this posts migration and the local
  // `postgres` role cannot restore that one attribute into another database.
  return dump.replace(/^\s+SET log_min_messages TO 'fatal'\r?\n/gm, '');
}

function installSchema(container, database, dump) {
  runPsql(container, database, dump);
  runPsql(container, database, `
    truncate table supabase_migrations.schema_migrations;
    create or replace function public.kc_feed_category_key(p_module text, p_value text)
    returns text language sql stable set search_path = ''
    as $sentinel$ select 'kc-cli-push-sentinel-key'::text $sentinel$;
    create or replace function public.kc_feed_category_label(p_module text, p_category text)
    returns text language sql stable set search_path = ''
    as $sentinel$ select 'kc-cli-push-sentinel-label'::text $sentinel$;
    create or replace function public.kc_canonicalize_post_feed_fields()
    returns trigger language plpgsql set search_path = ''
    as $sentinel$
    begin
      perform 'kc-cli-push-sentinel-trigger';
      return new;
    end;
    $sentinel$;
  `);
}

function readState(container, database) {
  const output = runPsql(container, database, `
    select pg_catalog.jsonb_build_object(
      'ledger', (
        select pg_catalog.count(*)
        from supabase_migrations.schema_migrations
        where version = '${MIGRATION_VERSION}'
      ),
      'posts', (select pg_catalog.count(*) from public.posts),
      'functions', (
        select pg_catalog.jsonb_object_agg(
          procedure_row.oid::regprocedure::text,
          pg_catalog.pg_get_functiondef(procedure_row.oid)
          order by procedure_row.oid::regprocedure::text
        )
        from pg_catalog.pg_proc procedure_row
        join pg_catalog.pg_namespace namespace_row
          on namespace_row.oid = procedure_row.pronamespace
        where namespace_row.nspname = 'public'
          and procedure_row.proname in (
            'kc_feed_category_key',
            'kc_feed_category_label',
            'kc_canonicalize_post_feed_fields'
          )
      ),
      'trigger', (
        select pg_catalog.jsonb_build_object(
          'enabled', trigger_row.tgenabled,
          'definition', pg_catalog.pg_get_triggerdef(trigger_row.oid, true),
          'function', trigger_row.tgfoid::regprocedure::text,
          'type', trigger_row.tgtype,
          'columns', trigger_row.tgattr::text,
          'qual', trigger_row.tgqual
        )
        from pg_catalog.pg_trigger trigger_row
        where trigger_row.tgrelid = 'public.posts'::regclass
          and trigger_row.tgname = 'trg_posts_canonicalize_feed_fields'
          and trigger_row.tgisinternal is false
      )
    )::text;
  `, true);
  try {
    return JSON.parse(output);
  } catch (_error) {
    fail(`State probe for ${database} did not return one JSON object.`);
  }
}

function prepareWorkdir(parent, name, migration) {
  const workdir = path.join(parent, name);
  const supabase = path.join(workdir, 'supabase');
  const migrations = path.join(supabase, 'migrations');
  fs.mkdirSync(migrations, { recursive: true });
  fs.copyFileSync(PROJECT_CONFIG, path.join(supabase, 'config.toml'));
  fs.writeFileSync(path.join(migrations, MIGRATION_NAME), migration, 'utf8');
  return workdir;
}

function removeWorkdir(directory) {
  const resolved = path.resolve(directory);
  const tempRoot = path.resolve(os.tmpdir());
  if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith('kc-label-cli-push-')) {
    fail(`Refusing to remove unexpected temporary directory: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function cleanupResources(container, databases, temporaryRoot) {
  const errors = [];
  const ownedDatabases = databases.filter(Boolean);

  for (const database of ownedDatabases) {
    try {
      dockerDatabase(container, database, 'drop');
    } catch (error) {
      errors.push(`drop ${database}: ${error.message}`);
    }
  }

  if (temporaryRoot) {
    try {
      removeWorkdir(temporaryRoot);
    } catch (error) {
      errors.push(`remove ${temporaryRoot}: ${error.message}`);
    }
  }

  if (ownedDatabases.length > 0) {
    const databaseLiterals = ownedDatabases.map((database) => `'${database}'`).join(',');
    try {
      const remaining = Number(runPsql(
        container,
        'postgres',
        `select pg_catalog.count(*) from pg_catalog.pg_database where datname in (${databaseLiterals});`,
        true,
      ));
      if (remaining !== 0) errors.push(`disposable database postcondition: remaining=${remaining}`);
    } catch (error) {
      errors.push(`database cleanup postcondition: ${error.message}`);
    }
  }

  if (temporaryRoot && fs.existsSync(temporaryRoot)) {
    errors.push(`temporary directory cleanup postcondition: ${temporaryRoot} still exists`);
  }

  if (errors.length > 0) {
    fail(`CLI-push cleanup failed: ${errors.join('; ')}`);
  }
}

function assertSentinel(state, label) {
  const definitions = Object.values(state.functions || {}).join('\n');
  if (
    state.ledger !== 0
    || state.posts !== 0
    || !definitions.includes('kc-cli-push-sentinel-key')
    || !definitions.includes('kc-cli-push-sentinel-label')
    || !definitions.includes('kc-cli-push-sentinel-trigger')
    || state.trigger?.enabled !== 'O'
  ) {
    fail(`${label} is not the exact sentinel baseline.`);
  }
}

function main() {
  const { container, databaseUrl } = resolveLocalRuntime();
  const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');
  const migrationHash = crypto.createHash('sha256').update(migration).digest('hex');
  const mutantSuffix = `

do $cli_push_atomicity_mutant$
begin
  raise exception using
    errcode = 'PZ901',
    message = 'forced post-DDL category label CLI push failure';
end;
$cli_push_atomicity_mutant$;
`;
  const mutant = migration + mutantSuffix;
  if (!mutant.startsWith(migration)) fail('Mutant migration does not preserve the verbatim source prefix.');

  let temporaryRoot = null;
  let successDatabase = null;
  let failureDatabase = null;
  let primaryError = null;

  try {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-label-cli-push-'));
    const successWorkdir = prepareWorkdir(temporaryRoot, 'success', migration);
    const failureWorkdir = prepareWorkdir(temporaryRoot, 'failure', mutant);
    successDatabase = checkedDatabaseName('success');
    failureDatabase = checkedDatabaseName('failure');
    const dump = schemaDump(container);

    dockerDatabase(container, successDatabase, 'create');
    dockerDatabase(container, failureDatabase, 'create');
    installSchema(container, successDatabase, dump);
    installSchema(container, failureDatabase, dump);

    const successSentinel = readState(container, successDatabase);
    const failureSentinel = readState(container, failureDatabase);
    assertSentinel(successSentinel, 'Success database');
    assertSentinel(failureSentinel, 'Failure database');
    if (JSON.stringify(successSentinel) !== JSON.stringify(failureSentinel)) {
      fail('Disposable databases did not start from byte-identical sentinel state.');
    }

    runSupabase([
      'db', 'push', '--db-url', databaseUrlFor(databaseUrl, successDatabase),
      '--include-all', '--yes',
    ], { cwd: successWorkdir, label: 'verbatim local Supabase CLI db push' });
    const success = readState(container, successDatabase);
    const successDefinitions = Object.values(success.functions || {}).join('\n');
    if (
      success.ledger !== 1
      || success.posts !== 0
      || successDefinitions.includes('kc-cli-push-sentinel')
      || !successDefinitions.includes('canonical category pair')
      || !successDefinitions.includes("when 'academicas' then 'academicos'")
      || success.trigger?.enabled !== 'O'
    ) {
      fail('Verbatim CLI push did not install one canonical migration atomically.');
    }

    const failurePush = runSupabase([
      'db', 'push', '--db-url', databaseUrlFor(databaseUrl, failureDatabase),
      '--include-all', '--yes',
    ], { cwd: failureWorkdir, label: 'mutant local Supabase CLI db push', allowFailure: true });
    const failureOutput = `${failurePush.stdout || ''}\n${failurePush.stderr || ''}`;
    if (failurePush.status === 0 || !failureOutput.includes('forced post-DDL category label CLI push failure')) {
      fail('Mutant CLI push did not fail at the versioned post-DDL marker.');
    }
    const failure = readState(container, failureDatabase);
    if (JSON.stringify(failure) !== JSON.stringify(failureSentinel)) {
      fail(
        'Failed CLI push did not roll back ledger, functions, trigger and rows byte-for-byte: ' +
        `before=${JSON.stringify(failureSentinel)} after=${JSON.stringify(failure)}`,
      );
    }

    process.stdout.write(
      `Supabase CLI ${REQUIRED_CLI_VERSION} db-push atomicity proof passed: ` +
      `verbatim sha256=${migrationHash}, success ledger=1, mutant PZ901 ledger=0 and sentinel rollback exact.\n`,
    );
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      cleanupResources(container, [successDatabase, failureDatabase], temporaryRoot);
    } catch (cleanupError) {
      if (primaryError) {
        primaryError.message += `; ${cleanupError.message}`;
      } else {
        primaryError = cleanupError;
      }
    }
  }

  if (primaryError) throw primaryError;
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
}

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PROOF_PATH = path.join(
  ROOT,
  'tests/sql/canonical-category-label-reconciliation-replay-proof.sql',
);
const MIGRATION_PATH = path.join(
  ROOT,
  'supabase/migrations/20260808225424_canonical_category_label_reconciliation.sql',
);
const REQUIRED_TRIGGERS = [
  'kc_active_session_write_guard',
  'kc_posts_set_updated_at',
  'trg_posts_canonicalize_feed_fields',
];
const RESET_LOCAL_WITH_SUPABASE = process.argv.includes('--supabase-reset');

function fail(message) {
  throw new Error(message);
}

function validateArguments() {
  const unknown = process.argv.slice(2).filter((argument) => argument !== '--supabase-reset');
  if (unknown.length) fail(`Unknown runner argument: ${unknown.join(', ')}`);
}

function resolveLocalContainer() {
  const config = fs.readFileSync(
    path.join(ROOT, 'supabase/config.toml'),
    'utf8',
  );
  const project = config.match(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m);
  if (!project) fail('Unable to resolve the local Supabase project_id safely.');

  const container = `supabase_db_${project[1]}`;
  const inspect = spawnSync(
    'docker',
    ['inspect', '--format', '{{.State.Running}}', container],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 },
  );
  if (inspect.status !== 0 || inspect.stdout.trim() !== 'true') {
    fail(`Local Supabase database container ${container} is not running.`);
  }
  return container;
}

function runPsql(container, label, sql, capture = false) {
  const args = [
    'exec',
    '-i',
    container,
    'psql',
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    'postgres',
  ];
  if (capture) args.push('-A', '-t', '-q');

  const result = spawnSync('docker', args, {
    cwd: ROOT,
    input: sql,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });

  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    fail(`${label} failed in the local container ${container}.`);
  }
  return result.stdout.trim();
}

function readState(container) {
  const triggerList = REQUIRED_TRIGGERS.map((name) => `'${name}'`).join(',');
  const output = runPsql(
    container,
    'canonical category label state probe',
    `select pg_catalog.jsonb_build_object(
      'database', pg_catalog.current_database(),
      'posts', (select pg_catalog.count(*) from public.posts),
      'triggers', (
        select coalesce(
          pg_catalog.jsonb_object_agg(
            trigger_row.tgname,
            pg_catalog.jsonb_build_object(
              'enabled', trigger_row.tgenabled,
              'function', trigger_row.tgfoid::regprocedure::text,
              'type', trigger_row.tgtype,
              'columns', trigger_row.tgattr::text,
              'qual', trigger_row.tgqual
            )
            order by trigger_row.tgname
          ),
          '{}'::jsonb
        )
        from pg_catalog.pg_trigger trigger_row
        where trigger_row.tgrelid = 'public.posts'::regclass
          and trigger_row.tgname in (${triggerList})
          and trigger_row.tgisinternal is false
      ),
      'functions', (
        select coalesce(
          pg_catalog.jsonb_object_agg(
            procedure_row.oid::regprocedure::text,
            pg_catalog.pg_get_functiondef(procedure_row.oid)
            order by procedure_row.oid::regprocedure::text
          ),
          '{}'::jsonb
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
      'migrationApplied', exists (
        select 1
        from supabase_migrations.schema_migrations migration_row
        where migration_row.version = '20260808225424'
      )
    )::text;`,
    true,
  );

  try {
    return JSON.parse(output);
  } catch (_error) {
    fail('Local state probe did not return one JSON object.');
  }
}

function resetWithSupabaseCli() {
  const executable = process.platform === 'win32'
    ? (process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe')
    : 'supabase';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'supabase.cmd db reset --local --no-seed --yes']
    : ['db', 'reset', '--local', '--no-seed', '--yes'];
  const result = spawnSync(
    executable,
    args,
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    fail(
      'Supabase CLI failed to reset the explicitly selected local database' +
      `${result.error ? `: ${result.error.message}` : '.'}`,
    );
  }
}

function assertSafeInitialState(state) {
  if (state.database !== 'postgres') {
    fail(`Expected local database postgres, received ${state.database}.`);
  }
  if (state.posts !== 0) {
    fail(
      'Replay proof is local-only and requires an empty posts table; ' +
      `found posts=${state.posts}.`,
    );
  }
  for (const trigger of REQUIRED_TRIGGERS) {
    if (state.triggers?.[trigger]?.enabled !== 'O') {
      fail(`Required local trigger ${trigger} is absent or not enabled.`);
    }
  }
}

function buildProof() {
  const proof = fs.readFileSync(PROOF_PATH, 'utf8');
  const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');
  const includePattern = /^\\ir \.\.\/\.\.\/supabase\/migrations\/20260808225424_canonical_category_label_reconciliation\.sql\s*$/gm;
  const includes = proof.match(includePattern) || [];

  if (includes.length !== 4) {
    fail(`Expected exactly 4 category label migration includes, found ${includes.length}.`);
  }
  if (!/^\\set ON_ERROR_STOP on\s/m.test(proof)) {
    fail('Replay proof must enable psql ON_ERROR_STOP.');
  }
  if (!/^begin;\s*$/im.test(proof) || !/\brollback;\s*$/i.test(proof)) {
    fail('Replay proof must run inside an explicit begin/rollback boundary.');
  }
  if (/\bcommit\s*;/i.test(proof) || /^\\(?:connect|c)\b/im.test(proof)) {
    fail('Replay proof may not commit or change database connections.');
  }

  const unsafe = [
    /postgres(?:ql)?:\/\//i,
    /\b(?:DATABASE_URL|SUPABASE_DB_URL|SUPABASE_ACCESS_TOKEN)\b/,
    /\bsupabase\s+(?:db\s+push|migration\s+repair)\b/i,
  ];
  for (const pattern of unsafe) {
    if (pattern.test(proof) || pattern.test(migration)) {
      fail(`Replay artifacts contain forbidden remote/deployment text: ${pattern}.`);
    }
  }
  if ([...(proof + migration)].some((character) => {
    const codepoint = character.codePointAt(0);
    return codepoint === 0x00c3 || codepoint === 0x00c2 || codepoint === 0xfffd;
  })) {
    fail('Replay artifacts contain a mojibake or replacement-character literal.');
  }

  const expanded = proof.replace(
    includePattern,
    () => `\n-- begin category label migration include\n${migration}\n-- end category label migration include`,
  );
  if (/^\\i(?:r|nclude)?\b/im.test(expanded)) {
    fail('Replay proof contains an unexpected psql include directive.');
  }
  return expanded;
}

function assertRolledBack(before, after) {
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    fail(
      'Replay proof did not restore the exact local row/trigger/function state: ' +
      `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
    );
  }
}

function main() {
  validateArguments();
  let container = resolveLocalContainer();
  let before = readState(container);
  assertSafeInitialState(before);

  if (RESET_LOCAL_WITH_SUPABASE) {
    process.stdout.write(
      'Resetting the already-empty local Supabase database to execute every migration verbatim...\n',
    );
    resetWithSupabaseCli();
    container = resolveLocalContainer();
    before = readState(container);
    assertSafeInitialState(before);
    if (before.migrationApplied !== true) {
      fail('Supabase CLI reset did not record migration 20260808225424 in the local ledger.');
    }
  }

  let primaryError = null;
  try {
    runPsql(container, 'canonical category label replay proof', buildProof());
  } catch (error) {
    primaryError = error;
  }

  try {
    assertRolledBack(before, readState(container));
  } catch (rollbackError) {
    if (!primaryError) primaryError = rollbackError;
    else process.stderr.write(`Rollback verification failed: ${rollbackError.message}\n`);
  }

  if (primaryError) throw primaryError;
  process.stdout.write(
    'Canonical category label reconciliation proof passed for 87 repaired and ' +
    '47 canonical published rows, with trigger, price, fixed-point, mutant and rollback checks.\n',
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
}

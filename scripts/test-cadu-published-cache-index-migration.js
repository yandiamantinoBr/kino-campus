'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION_PATH = path.join(
  ROOT,
  'supabase/migrations/20260806090000_cadu_published_cache_index.sql',
);
const PROOF_PATH = path.join(
  ROOT,
  'tests/sql/cadu-published-cache-index-replay-proof.sql',
);
const CACHE_INDEX = 'posts_cadu_published_cache_idx';
const CREATED_INDEX = 'posts_cadu_published_created_idx';
const EXPECTED = Object.freeze({
  [CACHE_INDEX]: Object.freeze({
    definition: "CREATE INDEX posts_cadu_published_cache_idx ON public.posts USING btree (id) WHERE (status = 'published'::text)",
    options: '0',
    comment: 'cadu: cache publicado do curador/format ordena por id (status published)',
  }),
  [CREATED_INDEX]: Object.freeze({
    definition: "CREATE INDEX posts_cadu_published_created_idx ON public.posts USING btree (created_at DESC, id DESC) WHERE (status = 'published'::text)",
    options: '3 3',
    comment: 'cadu: regeneracao do cache publicado ordena por created_at desc',
  }),
});

function fail(message) {
  throw new Error(message);
}

function spawnSupabase(args, options) {
  if (process.platform === 'win32') {
    return spawnSync(
      process.env.ComSpec || 'cmd.exe',
      ['/d', '/s', '/c', 'supabase.cmd', ...args],
      options,
    );
  }
  return spawnSync('supabase', args, options);
}

function resolveLocalTarget() {
  const config = fs.readFileSync(
    path.join(ROOT, 'supabase/config.toml'),
    'utf8',
  );
  const project = config.match(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m);
  if (!project) fail('Unable to resolve the local Supabase project_id safely.');
  const dbSection = config.match(
    /^\[db\]\s*\r?\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m,
  );
  const port = dbSection && dbSection[1].match(/^port\s*=\s*([0-9]+)\s*$/m);
  if (!port || Number(port[1]) < 1024 || Number(port[1]) > 65535) {
    fail('Unable to resolve a safe local Supabase database port.');
  }

  const container = `supabase_db_${project[1]}`;
  const inspect = spawnSync(
    'docker',
    ['inspect', '--format', '{{.State.Running}}', container],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 },
  );
  if (inspect.status !== 0 || inspect.stdout.trim() !== 'true') {
    fail(`Local Supabase database container ${container} is not running.`);
  }
  return { container, port: Number(port[1]) };
}

function runPsql(container, label, sql, options = {}) {
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
    options.database || 'postgres',
  ];
  if (options.capture) args.push('-A', '-t', '-q');

  const result = spawnSync('docker', args, {
    cwd: ROOT,
    input: sql,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;

  if (options.expectFailure) {
    if (result.status === 0) fail(`${label} unexpectedly succeeded.`);
    if (!output.includes(options.sqlstate) || !output.includes(options.message)) {
      fail(
        `${label} failed for an unexpected reason. Expected ${options.sqlstate} ` +
        `and ${JSON.stringify(options.message)}; output=${output.slice(0, 2000)}`,
      );
    }
    return output;
  }

  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    fail(`${label} failed in the local container ${container}.`);
  }
  return result.stdout.trim();
}

function readState(container) {
  const output = runPsql(
    container,
    'cadu published cache index state probe',
    `select pg_catalog.jsonb_build_object(
      'database', pg_catalog.current_database(),
      'posts', (select pg_catalog.count(*) from public.posts),
      'ledger', (
        select pg_catalog.count(*)
        from supabase_migrations.schema_migrations
        where version = '20260806090000'
      ),
      'indexes', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'oid', index_metadata.indexrelid,
            'name', index_relation.relname,
            'definition', pg_catalog.pg_get_indexdef(index_metadata.indexrelid),
            'predicate', pg_catalog.pg_get_expr(
              index_metadata.indpred,
              index_metadata.indrelid,
              false
            ),
            'keys', index_metadata.indkey::text,
            'opclasses', index_metadata.indclass::text,
            'options', index_metadata.indoption::text,
            'collations', index_metadata.indcollation::text,
            'valid', index_metadata.indisvalid,
            'ready', index_metadata.indisready,
            'live', index_metadata.indislive,
            'comment', pg_catalog.obj_description(index_metadata.indexrelid, 'pg_class')
          ) order by index_relation.relname
        )
        from pg_catalog.pg_index index_metadata
        join pg_catalog.pg_class index_relation
          on index_relation.oid = index_metadata.indexrelid
        join pg_catalog.pg_namespace index_namespace
          on index_namespace.oid = index_relation.relnamespace
        where index_namespace.nspname = 'public'
          and index_relation.relname in ('${CACHE_INDEX}', '${CREATED_INDEX}')
      ), '[]'::jsonb)
    )::text;`,
    { capture: true },
  );

  try {
    return JSON.parse(output);
  } catch (_error) {
    fail('Local index state probe did not return one JSON object.');
  }
}

function assertSafeBaseline(state) {
  if (state.database !== 'postgres') {
    fail(`Expected local database postgres, received ${state.database}.`);
  }
  if (state.posts !== 0) {
    fail(`Index proof requires an empty local posts table; found ${state.posts} rows.`);
  }
  if (state.ledger !== 1) {
    fail(`Expected one local 20260806090000 ledger row, found ${state.ledger}.`);
  }
  if (!Array.isArray(state.indexes) || state.indexes.length !== 2) {
    fail(`Expected two baseline cache indexes, found ${JSON.stringify(state.indexes)}.`);
  }

  for (const index of state.indexes) {
    const expected = EXPECTED[index.name];
    if (!expected) fail(`Unexpected baseline index ${index.name}.`);
    if (
      index.definition !== expected.definition ||
      index.predicate !== "(status = 'published'::text)" ||
      index.options !== expected.options ||
      index.valid !== true ||
      index.ready !== true ||
      index.live !== true ||
      index.comment !== expected.comment
    ) {
      fail(`Baseline index ${index.name} is not exact: ${JSON.stringify(index)}.`);
    }
  }
}

function expandProof(migration) {
  const proof = fs.readFileSync(PROOF_PATH, 'utf8');
  const includePattern = /^\\ir \.\.\/\.\.\/supabase\/migrations\/20260806090000_cadu_published_cache_index\.sql\s*$/gm;
  const includes = proof.match(includePattern) || [];
  if (includes.length !== 2) {
    fail(`Expected exactly 2 cache-index migration includes, found ${includes.length}.`);
  }
  if (!/^\\set ON_ERROR_STOP on\s/m.test(proof) || !/\brollback;\s*$/i.test(proof)) {
    fail('Cache-index replay proof must enable ON_ERROR_STOP and end in ROLLBACK.');
  }
  if (/\bcommit\s*;/i.test(proof) || /^\\(?:connect|c)\b/im.test(proof)) {
    fail('Cache-index replay proof may not commit or change database connections.');
  }

  const expanded = proof.replace(
    includePattern,
    () => `\n-- begin cache-index migration include\n${migration}` +
      '\n-- end cache-index migration include',
  );
  if (/^\\i(?:r|nclude)?\b/im.test(expanded)) {
    fail('Cache-index replay proof contains an unexpected psql include directive.');
  }
  return expanded;
}

function wrongHomonymSql(migration, spec) {
  return `\\set ON_ERROR_STOP on
\\set VERBOSITY verbose
begin;
drop index public.${spec.name};
${spec.createWrong};
${migration}
rollback;
`;
}

function assertRolledBack(before, after, label) {
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    fail(
      `${label} did not restore the exact local index/ledger state: ` +
      `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
    );
  }
}

function runDatabaseUtility(container, utility, database) {
  if (!/^kc_cadu_cache_atomic_[a-z0-9_]+$/.test(database)) {
    fail(`Refusing unsafe disposable database name ${database}.`);
  }
  const args = ['exec', container, utility, '-U', 'postgres'];
  if (utility === 'dropdb') args.push('--if-exists', '--force');
  args.push(database);
  const result = spawnSync('docker', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    fail(`${utility} failed for disposable local database ${database}.`);
  }
}

function assertCliVersion() {
  const result = spawnSupabase(['--version'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  const version = (result.stdout || '').trim();
  if (result.status !== 0 || version !== '2.105.0') {
    fail(
      `Atomicity proof requires Supabase CLI 2.105.0; found ` +
      `${JSON.stringify(version || '<unavailable>')}.`,
    );
  }
}

function createDisposableWorkdir(migration, suffix, forceFailure) {
  const tempRoot = path.resolve(os.tmpdir());
  const workdir = fs.mkdtempSync(
    path.join(tempRoot, `kino-cadu-cache-index-${suffix}-`),
  );
  if (!path.resolve(workdir).startsWith(`${tempRoot}${path.sep}`)) {
    fail(`Refusing unsafe disposable workdir ${workdir}.`);
  }

  const supabaseDir = path.join(workdir, 'supabase');
  const migrationsDir = path.join(supabaseDir, 'migrations');
  fs.mkdirSync(migrationsDir, { recursive: true });
  fs.copyFileSync(
    path.join(ROOT, 'supabase/config.toml'),
    path.join(supabaseDir, 'config.toml'),
  );
  fs.writeFileSync(
    path.join(migrationsDir, '20260806080000_atomicity_bootstrap.sql'),
    `create table public.posts (
  id uuid primary key,
  title text,
  status text not null,
  created_at timestamptz not null
);\n`,
    'utf8',
  );
  const forcedFailure = forceFailure
    ? `\ndo $forced_atomicity_failure$\nbegin\n  raise exception using\n    errcode = 'P8699',\n    message = 'forced post-DDL atomicity failure';\nend;\n$forced_atomicity_failure$;\n`
    : '';
  fs.writeFileSync(
    path.join(
      migrationsDir,
      '20260806090000_cadu_published_cache_index.sql',
    ),
    `${migration.trimEnd()}\n${forcedFailure}`,
    'utf8',
  );
  return workdir;
}

function removeDisposableWorkdir(workdir) {
  const tempRoot = path.resolve(os.tmpdir());
  const resolved = path.resolve(workdir);
  if (
    !resolved.startsWith(`${tempRoot}${path.sep}`) ||
    !path.basename(resolved).startsWith('kino-cadu-cache-index-')
  ) {
    fail(`Refusing unsafe disposable workdir cleanup ${resolved}.`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function runLocalCliPush(workdir, port, database, expectFailure) {
  const localUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/${database}`;
  const args = [
    '--workdir',
    workdir,
    'db',
    'push',
    '--db-url',
    localUrl,
    '--include-all',
    '--yes',
  ];
  if (args.includes('--linked') || !localUrl.includes('@127.0.0.1:')) {
    fail('Disposable CLI proof refused a non-local database target.');
  }
  const result = spawnSupabase(args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (expectFailure) {
    if (result.status === 0 || !output.includes('forced post-DDL atomicity failure')) {
      fail('Disposable CLI failure case did not fail at the forced post-DDL gate.');
    }
  } else if (result.status !== 0) {
    fail(
      `Disposable local CLI push failed: ` +
      output.replaceAll(localUrl, '<local-db-url>').slice(0, 2000),
    );
  }
  return output;
}

function readDisposableState(container, database) {
  const output = runPsql(
    container,
    `disposable CLI state probe for ${database}`,
    `select pg_catalog.jsonb_build_object(
      'bootstrap_ledger', (
        select pg_catalog.count(*)
        from supabase_migrations.schema_migrations
        where version = '20260806080000'
      ),
      'target_ledger', (
        select pg_catalog.count(*)
        from supabase_migrations.schema_migrations
        where version = '20260806090000'
      ),
      'indexes', (
        select pg_catalog.count(*)
        from pg_catalog.pg_class index_relation
        join pg_catalog.pg_namespace index_namespace
          on index_namespace.oid = index_relation.relnamespace
        where index_namespace.nspname = 'public'
          and index_relation.relname in ('${CACHE_INDEX}', '${CREATED_INDEX}')
      )
    )::text;`,
    { capture: true, database },
  );
  try {
    return JSON.parse(output);
  } catch (_error) {
    fail(`Disposable CLI state probe for ${database} was not JSON.`);
  }
}

function disposableStateMatches(actual, expected) {
  return Object.entries(expected).every(([key, value]) => actual[key] === value);
}

function proveCliAtomicity(target, migration) {
  assertCliVersion();
  const nonce = `${process.pid}_${Date.now().toString(36)}`.toLowerCase();
  const cases = [
    { suffix: 'success', database: `kc_cadu_cache_atomic_ok_${nonce}`, failure: false },
    { suffix: 'failure', database: `kc_cadu_cache_atomic_fail_${nonce}`, failure: true },
  ];

  for (const proofCase of cases) {
    const workdir = createDisposableWorkdir(
      migration,
      proofCase.suffix,
      proofCase.failure,
    );
    let databaseCreated = false;
    try {
      runDatabaseUtility(target.container, 'createdb', proofCase.database);
      databaseCreated = true;
      runLocalCliPush(
        workdir,
        target.port,
        proofCase.database,
        proofCase.failure,
      );
      const state = readDisposableState(target.container, proofCase.database);
      const expected = proofCase.failure
        ? { bootstrap_ledger: 1, target_ledger: 0, indexes: 0 }
        : { bootstrap_ledger: 1, target_ledger: 1, indexes: 2 };
      if (!disposableStateMatches(state, expected)) {
        fail(
          `Disposable CLI ${proofCase.suffix} state mismatch: ` +
          `expected=${JSON.stringify(expected)} actual=${JSON.stringify(state)}`,
        );
      }
      if (!proofCase.failure) {
        runLocalCliPush(workdir, target.port, proofCase.database, false);
        const replay = readDisposableState(target.container, proofCase.database);
        if (!disposableStateMatches(replay, expected)) {
          fail('Disposable CLI idempotent replay changed DDL or ledger state.');
        }
      }
    } finally {
      if (databaseCreated) {
        runDatabaseUtility(
          target.container,
          'dropdb',
          proofCase.database,
        );
      }
      removeDisposableWorkdir(workdir);
    }
  }
}

function main() {
  const target = resolveLocalTarget();
  const { container } = target;
  const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');
  const before = readState(container);
  assertSafeBaseline(before);

  runPsql(
    container,
    'cadu published cache index success/idempotence proof',
    expandProof(migration),
  );
  assertRolledBack(before, readState(container), 'Success/idempotence proof');

  const negativeCases = [
    {
      name: CACHE_INDEX,
      createWrong:
        `create index ${CACHE_INDEX} on public.posts (title) where status = 'published'`,
      sqlstate: 'P8601',
      message: `${CACHE_INDEX} has an unexpected definition`,
    },
    {
      name: CREATED_INDEX,
      createWrong:
        `create index ${CREATED_INDEX} on public.posts (created_at, id desc) where status = 'published'`,
      sqlstate: 'P8602',
      message: `${CREATED_INDEX} has an unexpected definition`,
    },
  ];

  for (const negative of negativeCases) {
    runPsql(
      container,
      `wrong homonym rejection for ${negative.name}`,
      wrongHomonymSql(migration, negative),
      {
        expectFailure: true,
        sqlstate: negative.sqlstate,
        message: negative.message,
      },
    );
    assertRolledBack(
      before,
      readState(container),
      `Wrong homonym proof for ${negative.name}`,
    );
  }

  proveCliAtomicity(target, migration);

  process.stdout.write(
    'Cadu published cache index proof passed: exact creation, idempotence, ' +
    'wrong-homonym rollback and Supabase CLI 2.105.0 DDL/ledger atomicity ' +
    'verified locally.\n',
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
}

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PROOF_PATH = path.join(
  ROOT,
  'tests/sql/semantic-post-reclassification-replay-proof.sql',
);
const MIGRATION_PATH = path.join(
  ROOT,
  'supabase/migrations/20260808152900_semantic_post_reclassification.sql',
);
const REQUIRED_TRIGGERS = [
  'kc_posts_set_updated_at',
  'trg_audit_posts_status',
  'trg_posts_canonicalize_feed_fields',
];

function fail(message) {
  throw new Error(message);
}

function resolveLocalDatabase() {
  const config = fs.readFileSync(
    path.join(ROOT, 'supabase/config.toml'),
    'utf8',
  );
  const project = config.match(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m);
  if (!project) fail('Unable to resolve the local Supabase project_id safely.');

  const container = `supabase_db_${project[1]}`;
  const inspect = spawnSync(
    'docker',
    ['inspect', '--format', '{{json .Config.Env}}', container],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 },
  );
  if (inspect.status !== 0) {
    fail(`Local Supabase database container ${container} is not available.`);
  }

  let environment;
  try {
    environment = JSON.parse(inspect.stdout.trim());
  } catch (_error) {
    fail(`Unable to inspect local database container ${container} safely.`);
  }
  const passwordEntry = environment.find(entry =>
    entry.startsWith('POSTGRES_PASSWORD='),
  );
  if (!passwordEntry) fail('Local Supabase database password is unavailable.');

  return {
    container,
    password: passwordEntry.slice('POSTGRES_PASSWORD='.length),
  };
}

function runPsql(database, label, sql, capture = false) {
  const args = [
    'exec',
    '-i',
    '-e',
    'PGPASSWORD',
    database.container,
    'psql',
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'supabase_admin',
    '-d',
    'postgres',
  ];
  if (capture) args.push('-A', '-t', '-q');

  const result = spawnSync('docker', args, {
    cwd: ROOT,
    input: sql,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, PGPASSWORD: database.password },
  });

  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    fail(`${label} failed in the local container ${database.container}.`);
  }
  return result.stdout.trim();
}

function readState(database) {
  const triggerList = REQUIRED_TRIGGERS.map(name => `'${name}'`).join(',');
  const output = runPsql(
    database,
    'semantic migration state probe',
    `select pg_catalog.jsonb_build_object(
      'database', pg_catalog.current_database(),
      'user', current_user,
      'canSetReplicationRole', pg_catalog.has_parameter_privilege(
        current_user,
        'session_replication_role',
        'set'
      ),
      'replicationRole', pg_catalog.current_setting('session_replication_role'),
      'posts', (select pg_catalog.count(*) from public.posts),
      'audits', (select pg_catalog.count(*) from public.audit_log),
      'triggers', (
        select coalesce(
          pg_catalog.jsonb_object_agg(tgname, tgenabled order by tgname),
          '{}'::jsonb
        )
        from pg_catalog.pg_trigger
        where tgrelid = 'public.posts'::regclass
          and tgname in (${triggerList})
          and tgisinternal is false
      )
    )::text;`,
    true,
  );

  try {
    return JSON.parse(output);
  } catch (_error) {
    fail('Local semantic state probe did not return one JSON object.');
  }
}

function assertSafeInitialState(state) {
  if (state.database !== 'postgres' || state.user !== 'supabase_admin') {
    fail(`Expected local postgres as supabase_admin; received ${JSON.stringify(state)}.`);
  }
  if (
    state.canSetReplicationRole !== true ||
    state.replicationRole !== 'origin'
  ) {
    fail('Safe fixture setup requires local session_replication_role control.');
  }
  if (state.posts !== 0) {
    fail(`Semantic replay proof requires an empty posts table; found ${state.posts}.`);
  }
  for (const trigger of REQUIRED_TRIGGERS) {
    if (state.triggers?.[trigger] !== 'O') {
      fail(`Required local trigger ${trigger} is absent or not enabled in origin mode.`);
    }
  }
}

function buildProof() {
  const proof = fs.readFileSync(PROOF_PATH, 'utf8');
  const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');
  const includePattern = /^\\ir \.\.\/\.\.\/supabase\/migrations\/20260808152900_semantic_post_reclassification\.sql\s*$/gm;
  const includes = proof.match(includePattern) || [];

  if (includes.length !== 4) {
    fail(`Expected exactly 4 semantic migration includes, found ${includes.length}.`);
  }
  if (!/^\\set ON_ERROR_STOP on\s/m.test(proof)) {
    fail('Semantic replay proof must enable psql ON_ERROR_STOP.');
  }
  if (!/\bbegin;\s/i.test(proof) || !/\brollback;\s*$/i.test(proof)) {
    fail('Semantic replay proof must begin a transaction and end in ROLLBACK.');
  }
  if (/\bcommit\s*;/i.test(proof) || /^\\(?:connect|c)\b/im.test(proof)) {
    fail('Semantic replay proof may not commit or change database connections.');
  }
  if (/^\s*alter\s+table\s+public\.posts\s+(?:disable|enable)\s+trigger/im.test(proof)) {
    fail('Semantic replay proof may not mutate persistent trigger state.');
  }
  for (const required of [
    "set_config('session_replication_role', 'replica', true)",
    "set_config('session_replication_role', 'origin', true)",
    'lock table public.posts in share row exclusive mode',
    'MIXED_SOURCE_TARGET_RUN',
    'TRIGGER_GUARD_MUTANTS',
    'old-category-arrays',
    'old-module-arrays',
    'removed-alias',
    'deadline-root-missing',
    'deadline-root-json-null',
    'deadline-dates-missing',
    'deadline-dates-json-null',
    "when sqlstate 'KC003'",
    "'alter table %I.%I disable trigger %I'",
    'if v_after is distinct from v_before then',
  ]) {
    if (!proof.includes(required)) fail(`Semantic replay proof is missing ${required}.`);
  }

  const expanded = proof.replace(
    includePattern,
    () => `\n-- begin semantic migration include\n${migration}\n-- end semantic migration include`,
  );
  if (/^\\i(?:r|nclude)?\b/im.test(expanded)) {
    fail('Semantic replay proof contains an unexpected psql include directive.');
  }
  return expanded;
}

function assertRolledBack(before, after) {
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    fail(
      'Semantic replay proof did not restore exact local row/audit/trigger state: ' +
      `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
    );
  }
}

function main() {
  const database = resolveLocalDatabase();
  const before = readState(database);
  assertSafeInitialState(before);

  let primaryError = null;
  try {
    runPsql(database, 'semantic post reclassification replay proof', buildProof());
  } catch (error) {
    primaryError = error;
  }

  try {
    assertRolledBack(before, readState(database));
  } catch (rollbackError) {
    if (!primaryError) primaryError = rollbackError;
    else process.stderr.write(`Rollback verification failed: ${rollbackError.message}\n`);
  }

  if (primaryError) throw primaryError;
  process.stdout.write(
    'Semantic post reclassification proof passed: source, target, mixed state, ' +
    'unique fingerprints, exact mutants, triggers, audit and rollback verified.\n',
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
}

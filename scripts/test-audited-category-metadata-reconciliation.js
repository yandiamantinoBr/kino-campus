'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PROOF_PATH = path.join(
  ROOT,
  'tests/sql/audited-category-metadata-reconciliation-replay-proof.sql',
);
const MIGRATION_PATH = path.join(
  ROOT,
  'supabase/migrations/20260808152850_audited_category_metadata_reconciliation.sql',
);
const AUDITED_IDS = [
  '2c139f6c-8d05-43f6-b242-85980428e0d7',
  'ce24a542-294c-4048-b0ea-2f2b4a435fe2',
];
const REQUIRED_TRIGGERS = [
  'kc_posts_set_updated_at',
  'trg_posts_canonicalize_feed_fields',
];

function fail(message) {
  throw new Error(message);
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

  const result = spawnSync(
    'docker',
    args,
    {
      cwd: ROOT,
      input: sql,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    fail(`${label} failed in the local container ${container}.`);
  }
  return result.stdout.trim();
}

function readState(container) {
  const idList = AUDITED_IDS.map((id) => `'${id}'::uuid`).join(',');
  const triggerList = REQUIRED_TRIGGERS.map((name) => `'${name}'`).join(',');
  const output = runPsql(
    container,
    'audited reconciliation state probe',
    `select pg_catalog.jsonb_build_object(
      'database', pg_catalog.current_database(),
      'posts', (select pg_catalog.count(*) from public.posts),
      'audited', (
        select pg_catalog.count(*)
        from public.posts
        where id in (${idList})
      ),
      'triggers', (
        select coalesce(
          pg_catalog.jsonb_object_agg(tgname, tgenabled order by tgname),
          '{}'::jsonb
        )
        from pg_catalog.pg_trigger
        where tgrelid = 'public.posts'::regclass
          and tgname in (${triggerList})
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

function assertSafeInitialState(state) {
  if (state.database !== 'postgres') {
    fail(`Expected local database postgres, received ${state.database}.`);
  }
  if (state.posts !== 0 || state.audited !== 0) {
    fail(
      'Replay proof is local-only and requires an empty posts table; ' +
      `found posts=${state.posts}, audited=${state.audited}.`,
    );
  }
  for (const trigger of REQUIRED_TRIGGERS) {
    if (state.triggers?.[trigger] !== 'O') {
      fail(`Required local trigger ${trigger} is absent or not enabled.`);
    }
  }
}

function buildProof() {
  const proof = fs.readFileSync(PROOF_PATH, 'utf8');
  const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');
  const includePattern = /^\\ir \.\.\/\.\.\/supabase\/migrations\/20260808152850_audited_category_metadata_reconciliation\.sql\s*$/gm;
  const includes = proof.match(includePattern) || [];

  if (includes.length !== 3) {
    fail(`Expected exactly 3 audited migration includes, found ${includes.length}.`);
  }
  if (!/^\\set ON_ERROR_STOP on\s/m.test(proof)) {
    fail('Replay proof must enable psql ON_ERROR_STOP.');
  }
  if (!/\brollback;\s*$/i.test(proof)) {
    fail('Replay proof must end with an explicit rollback.');
  }
  if (/\bcommit\s*;/i.test(proof) || /^\\(?:connect|c)\b/im.test(proof)) {
    fail('Replay proof may not commit or change database connections.');
  }

  const expanded = proof.replace(
    includePattern,
    () => `\n-- begin audited migration include\n${migration}\n-- end audited migration include`,
  );
  if (/^\\i(?:r|nclude)?\b/im.test(expanded)) {
    fail('Replay proof contains an unexpected psql include directive.');
  }
  return expanded;
}

function assertRolledBack(before, after) {
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    fail(
      'Replay proof did not restore the exact local row/trigger state after rollback: ' +
      `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
    );
  }
}

function main() {
  const container = resolveLocalContainer();
  const before = readState(container);
  assertSafeInitialState(before);

  let primaryError = null;
  try {
    runPsql(container, 'audited category metadata replay proof', buildProof());
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
    'Audited category metadata reconciliation proof passed with triggers, ' +
    'price, updated_at, idempotence, drift rejection and verified rollback.\n',
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
}

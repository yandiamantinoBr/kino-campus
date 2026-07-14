'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const config = fs.readFileSync(
  path.join(ROOT, 'supabase', 'config.toml'),
  'utf8',
);
const projectMatch = config.match(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m);

if (!projectMatch) {
  throw new Error('Unable to resolve a safe Supabase project_id from config.toml.');
}

const container = `supabase_db_${projectMatch[1]}`;
const files = [
  'tests/sql/cadu-phase-a-linked-schema-fixture.sql',
  'supabase/migrations/20260713183000_cadu_unit_meta_cas_rpc.sql',
  'supabase/migrations/20260713184500_cadu_metadata_contract_probe.sql',
];

function runSql(label, sql) {
  const result = spawnSync(
    'docker',
    [
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
    ],
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
    throw new Error(`${label} failed in ${container}.`);
  }
}

let primaryError = null;
try {
  for (const relativePath of files) {
    runSql(relativePath, fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
  }

  runSql(
    'Phase-A linked-schema assertions',
    String.raw`do $assert$
declare
  v_contract jsonb;
begin
  select public.kc_cadu_metadata_contract() into v_contract;

  if (v_contract ->> 'ready')::boolean is distinct from true then
    raise exception 'Phase-A contract is not ready after linked-schema upgrade: %',
      v_contract;
  end if;
  if (
    select (revision, source, tier, note, updated_at) is distinct from (
      1::bigint,
      'legacy-admin-ui'::text,
      2::smallint,
      'preserve me'::text,
      '2026-07-13T12:00:00Z'::timestamptz
    )
    from public.kc_unit_meta
    where unit_id = 'legacy-upgrade-fixture'
  ) is distinct from false then
    raise exception 'Legacy metadata row was not preserved with revision 1';
  end if;
  if (
    select pg_catalog.count(*) <> 1
    from pg_catalog.pg_policy
    where polrelid = 'public.kc_unit_meta'::regclass
  ) then
    raise exception 'Legacy metadata policies were not reconciled';
  end if;
  if pg_catalog.to_regclass('public.idx_kc_unit_meta_updated_by') is null then
    raise exception 'Metadata foreign-key covering index was not restored';
  end if;
  if pg_catalog.has_any_column_privilege(
      'anon', 'public.kc_unit_meta', 'insert,update'
    )
    or pg_catalog.has_any_column_privilege(
      'authenticated', 'public.kc_unit_meta', 'insert,update'
    ) then
    raise exception 'A browser role retained direct metadata writes';
  end if;
  if pg_catalog.has_function_privilege(
      'anon', 'public.kc_unit_meta_touch()', 'execute'
    )
    or pg_catalog.has_function_privilege(
      'authenticated', 'public.kc_unit_meta_touch()', 'execute'
    ) then
    raise exception 'A browser role retained trigger-function execution';
  end if;
end;
$assert$;`,
  );
} catch (error) {
  primaryError = error;
} finally {
  try {
    runSql(
      'Phase-A fixture cleanup',
      "delete from public.kc_unit_meta where unit_id = 'legacy-upgrade-fixture';",
    );
  } catch (cleanupError) {
    if (!primaryError) primaryError = cleanupError;
    else process.stderr.write(`Cleanup warning: ${cleanupError.message}\n`);
  }
}

if (primaryError) throw primaryError;

process.stdout.write(
  'Phase-A linked-schema upgrade proof passed with preserved metadata and ready contract.\n',
);

begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(88);

select extensions.has_table('public', 'caronas_locations', 'caronas location table exists');
select extensions.has_table('public', 'kc_unit_meta', 'Cadu unit metadata table exists');
select extensions.has_column('public', 'kc_unit_meta', 'revision', 'unit metadata exposes a CAS revision');
select extensions.col_not_null('public', 'kc_unit_meta', 'revision', 'unit metadata revision is mandatory');
select extensions.col_default_is('public', 'kc_unit_meta', 'revision', '1', 'unit metadata revision starts at one');
select extensions.ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.kc_unit_meta'::regclass
      and conname = 'kc_unit_meta_revision_positive'
      and contype = 'c'
  ),
  'unit metadata revision stays positive'
);
select extensions.has_index('public', 'caronas_locations', 'idx_caronas_loc_zone', 'caronas zone index exists');
select extensions.has_index('public', 'kc_unit_meta', 'idx_kc_unit_meta_updated_by', 'unit metadata foreign key has a covering index');
select extensions.is((select count(*)::integer from public.caronas_locations), 57, 'all canonical caronas locations are seeded');
select extensions.is((select count(*)::integer from public.caronas_locations where zone_key = 'custom'), 0, 'custom locations are not seeded');

select extensions.ok((select relrowsecurity from pg_class where oid = 'public.caronas_locations'::regclass), 'caronas locations has RLS enabled');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.kc_unit_meta'::regclass), 'unit metadata has RLS enabled');
select extensions.is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'caronas_locations'), 1, 'caronas locations has one select policy');
select extensions.is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'kc_unit_meta'), 1, 'unit metadata has only the compatibility read policy');

select extensions.ok(has_table_privilege('anon', 'public.caronas_locations', 'select'), 'anon can read caronas locations');
select extensions.ok(not has_table_privilege('anon', 'public.caronas_locations', 'insert,update,delete'), 'anon cannot write caronas locations');
select extensions.ok(not has_table_privilege('authenticated', 'public.caronas_locations', 'insert,update,delete'), 'authenticated cannot write caronas locations directly');
select extensions.ok(not has_function_privilege('anon', 'public.kc_increment_location_usage(text)', 'execute'), 'anon cannot increment location usage');
select extensions.ok(has_function_privilege('authenticated', 'public.kc_increment_location_usage(text)', 'execute'), 'authenticated can increment location usage');
select extensions.ok(not has_function_privilege('anon', 'public.kc_upsert_custom_location(text,text)', 'execute'), 'anon cannot create custom locations');
select extensions.ok(has_function_privilege('authenticated', 'public.kc_upsert_custom_location(text,text)', 'execute'), 'authenticated can create custom locations');
select extensions.ok(
  (select prosecdef from pg_proc where oid = 'kc_private.kc_increment_location_usage(text)'::regprocedure),
  'private location implementation is security definer'
);
select extensions.ok(
  not (select prosecdef from pg_proc where oid = 'public.kc_increment_location_usage(text)'::regprocedure),
  'public location wrapper is security invoker'
);

select extensions.ok(has_table_privilege('anon', 'public.kc_unit_meta', 'select'), 'anon can read unit metadata');
select extensions.ok(not has_column_privilege('anon', 'public.kc_unit_meta', 'unit_id', 'insert'), 'anon cannot insert unit metadata');
select extensions.ok(has_table_privilege('authenticated', 'public.kc_unit_meta', 'select'), 'authenticated can read unit metadata');
select extensions.ok(not has_column_privilege('authenticated', 'public.kc_unit_meta', 'unit_id', 'insert'), 'authenticated cannot insert unit metadata directly');
select extensions.ok(not has_column_privilege('authenticated', 'public.kc_unit_meta', 'tier', 'update'), 'authenticated cannot update unit metadata directly');
select extensions.ok(not has_table_privilege('authenticated', 'public.kc_unit_meta', 'delete'), 'authenticated cannot delete unit metadata directly');
select extensions.ok(not has_function_privilege('authenticated', 'public.kc_unit_meta_touch()', 'execute'), 'trigger function is not directly executable by authenticated');
select extensions.has_trigger('public', 'kc_unit_meta', 'kc_unit_meta_touch', 'unit metadata revision trigger exists');
select extensions.ok(not has_function_privilege('authenticated', 'public.kc_cadu_upsert_source_override(text,integer,text,boolean,bigint,jsonb)', 'execute'), 'authenticated cannot execute stable Cadu CAS');
select extensions.ok(not has_function_privilege('authenticated', 'public.kc_cadu_upsert_legacy_override(text,text,integer,text,boolean,bigint)', 'execute'), 'authenticated cannot execute legacy Cadu CAS');
select extensions.ok(has_function_privilege('service_role', 'public.kc_cadu_upsert_source_override(text,integer,text,boolean,bigint,jsonb)', 'execute'), 'service role can execute stable Cadu CAS');
select extensions.ok(has_function_privilege('service_role', 'public.kc_cadu_upsert_legacy_override(text,text,integer,text,boolean,bigint)', 'execute'), 'service role can execute legacy Cadu CAS');
select extensions.ok(has_table_privilege('service_role', 'public.kc_unit_meta', 'select,insert,update'), 'service role retains only the phase-A DML needed by old and new Cadu APIs');
select extensions.ok(not has_table_privilege('service_role', 'public.kc_unit_meta', 'delete,truncate,references,trigger'), 'service role cannot perform destructive or DDL-adjacent table operations');
select extensions.ok(
  not has_table_privilege('anon', 'public.kc_unit_meta', 'maintain')
  and not has_table_privilege('authenticated', 'public.kc_unit_meta', 'maintain')
  and not has_table_privilege('service_role', 'public.kc_unit_meta', 'maintain'),
  'browser and transitional service roles cannot maintain the metadata table'
);
select extensions.ok(
  not (select prosecdef from pg_proc where oid = 'public.kc_cadu_upsert_source_override(text,integer,text,boolean,bigint,jsonb)'::regprocedure),
  'stable Cadu CAS is security invoker during transition'
);
select extensions.ok(
  not (select prosecdef from pg_proc where oid = 'public.kc_cadu_upsert_legacy_override(text,text,integer,text,boolean,bigint)'::regprocedure),
  'legacy Cadu CAS is security invoker during transition'
);
select extensions.is(
  (select provolatile::text from pg_proc where oid = 'public.kc_cadu_upsert_source_override(text,integer,text,boolean,bigint,jsonb)'::regprocedure),
  'v',
  'stable Cadu CAS is volatile'
);
select extensions.ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.kc_cadu_upsert_source_override(text,integer,text,boolean,bigint,jsonb)'::regprocedure),
  'stable Cadu CAS has an empty search path'
);
select extensions.has_function(
  'public',
  'kc_cadu_metadata_contract',
  array[]::text[],
  'Cadu metadata deployment contract probe exists'
);
select extensions.ok(
  has_function_privilege('service_role', 'public.kc_cadu_metadata_contract()', 'execute'),
  'service role can execute the metadata deployment contract probe'
);
select extensions.ok(
  not has_function_privilege('anon', 'public.kc_cadu_metadata_contract()', 'execute'),
  'anon cannot execute the metadata deployment contract probe'
);
select extensions.ok(
  not has_function_privilege('authenticated', 'public.kc_cadu_metadata_contract()', 'execute'),
  'authenticated cannot execute the metadata deployment contract probe'
);
select extensions.ok(
  not (select prosecdef from pg_proc where oid = 'public.kc_cadu_metadata_contract()'::regprocedure),
  'metadata deployment contract probe is security invoker'
);
select extensions.is(
  (select provolatile::text from pg_proc where oid = 'public.kc_cadu_metadata_contract()'::regprocedure),
  's',
  'metadata deployment contract probe is stable'
);
select extensions.ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.kc_cadu_metadata_contract()'::regprocedure),
  'metadata deployment contract probe has an empty search path'
);

set local role service_role;
select extensions.is(
  public.kc_cadu_metadata_contract(),
  '{
    "contractVersion": "cadu-unit-meta-cas-v1",
    "phase": "phase-a",
    "ready": true,
    "checks": {
      "metadataTable": true,
      "revisionColumn": true,
      "revisionConstraint": true,
      "touchTrigger": true,
      "stableRpc": true,
      "legacyRpc": true,
      "browserWritesRevoked": true,
      "legacyReadsPreserved": true,
      "serviceRolePhaseA": true
    }
  }'::jsonb,
  'metadata deployment contract reports the complete phase-A boundary ready'
);
reset role;

savepoint cadu_probe_cross_platform_eol;
do $probe$
declare
  v_definition text;
begin
  for v_definition in
    select pg_catalog.pg_get_functiondef(function_row.oid)
    from pg_catalog.pg_proc as function_row
    where function_row.oid in (
      'public.kc_unit_meta_touch()'::regprocedure,
      'public.kc_cadu_upsert_source_override(text,integer,text,boolean,bigint,jsonb)'::regprocedure,
      'public.kc_cadu_upsert_legacy_override(text,text,integer,text,boolean,bigint)'::regprocedure
    )
  loop
    execute pg_catalog.replace(
      pg_catalog.replace(v_definition, E'\r\n', E'\n'),
      E'\n',
      E'\r\n'
    );
  end loop;
end;
$probe$;
select extensions.is(
  (public.kc_cadu_metadata_contract() ->> 'ready')::boolean,
  true,
  'metadata contract normalizes CRLF function bodies before integrity hashing'
);
rollback to savepoint cadu_probe_cross_platform_eol;
release savepoint cadu_probe_cross_platform_eol;

savepoint cadu_probe_legacy_select_grant;
revoke select on public.kc_unit_meta from anon;
select extensions.is(
  (public.kc_cadu_metadata_contract() #>> '{checks,legacyReadsPreserved}')::boolean,
  false,
  'metadata contract rejects a missing legacy browser SELECT grant'
);
rollback to savepoint cadu_probe_legacy_select_grant;
release savepoint cadu_probe_legacy_select_grant;

savepoint cadu_probe_legacy_select_policy;
drop policy kc_unit_meta_select_public on public.kc_unit_meta;
select extensions.is(
  (public.kc_cadu_metadata_contract() #>> '{checks,legacyReadsPreserved}')::boolean,
  false,
  'metadata contract rejects a missing legacy browser SELECT policy'
);
rollback to savepoint cadu_probe_legacy_select_policy;
release savepoint cadu_probe_legacy_select_policy;

savepoint cadu_probe_service_role_column_reference;
grant references (unit_id) on public.kc_unit_meta to service_role;
select extensions.is(
  (public.kc_cadu_metadata_contract() #>> '{checks,serviceRolePhaseA}')::boolean,
  false,
  'metadata contract rejects service-role REFERENCES granted at column scope'
);
rollback to savepoint cadu_probe_service_role_column_reference;
release savepoint cadu_probe_service_role_column_reference;

savepoint cadu_probe_unit_id_uniqueness;
alter table public.kc_unit_meta drop constraint kc_unit_meta_pkey;
select extensions.is(
  (public.kc_cadu_metadata_contract() #>> '{checks,metadataTable}')::boolean,
  false,
  'metadata contract rejects a table without a unit_id conflict arbiter'
);
rollback to savepoint cadu_probe_unit_id_uniqueness;
release savepoint cadu_probe_unit_id_uniqueness;

savepoint cadu_probe_extra_constraint;
alter table public.kc_unit_meta
  add constraint kc_unit_meta_probe_block_source
  check (pg_catalog.char_length(source) < 3);
select extensions.is(
  (public.kc_cadu_metadata_contract() #>> '{checks,metadataTable}')::boolean,
  false,
  'metadata contract rejects an extra constraint that can block RPC writes'
);
rollback to savepoint cadu_probe_extra_constraint;
release savepoint cadu_probe_extra_constraint;

savepoint cadu_probe_extra_column;
alter table public.kc_unit_meta add column probe_required text not null;
select extensions.is(
  (public.kc_cadu_metadata_contract() #>> '{checks,metadataTable}')::boolean,
  false,
  'metadata contract rejects an extra required column omitted by the RPC insert'
);
rollback to savepoint cadu_probe_extra_column;
release savepoint cadu_probe_extra_column;

savepoint cadu_probe_extra_index;
create unique index kc_unit_meta_probe_unique_tier
  on public.kc_unit_meta (tier);
select extensions.is(
  (public.kc_cadu_metadata_contract() #>> '{checks,metadataTable}')::boolean,
  false,
  'metadata contract rejects an extra unique index that can block RPC writes'
);
rollback to savepoint cadu_probe_extra_index;
release savepoint cadu_probe_extra_index;

savepoint cadu_probe_column_acl;
grant insert (unit_id, tier, note) on public.kc_unit_meta to authenticated;
select extensions.is(
  (public.kc_cadu_metadata_contract() #>> '{checks,browserWritesRevoked}')::boolean,
  false,
  'metadata contract rejects browser writes granted at column scope'
);
rollback to savepoint cadu_probe_column_acl;
release savepoint cadu_probe_column_acl;

savepoint cadu_probe_rls;
alter table public.kc_unit_meta disable row level security;
select extensions.is(
  (public.kc_cadu_metadata_contract() #>> '{checks,browserWritesRevoked}')::boolean,
  false,
  'metadata contract rejects a metadata table with RLS disabled'
);
rollback to savepoint cadu_probe_rls;
release savepoint cadu_probe_rls;

savepoint cadu_probe_write_policy;
create policy kc_unit_meta_probe_bad_insert
  on public.kc_unit_meta for insert to authenticated with check (true);
select extensions.is(
  (public.kc_cadu_metadata_contract() #>> '{checks,browserWritesRevoked}')::boolean,
  false,
  'metadata contract rejects browser write policies even without a matching grant'
);
rollback to savepoint cadu_probe_write_policy;
release savepoint cadu_probe_write_policy;

savepoint cadu_probe_constraint_body;
alter table public.kc_unit_meta drop constraint kc_unit_meta_revision_positive;
alter table public.kc_unit_meta
  add constraint kc_unit_meta_revision_positive check (revision < 1000000);
select extensions.is(
  (public.kc_cadu_metadata_contract() #>> '{checks,revisionConstraint}')::boolean,
  false,
  'metadata contract rejects a same-name revision constraint with different semantics'
);
rollback to savepoint cadu_probe_constraint_body;
release savepoint cadu_probe_constraint_body;

savepoint cadu_probe_trigger_body;
create or replace function public.kc_unit_meta_touch()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.revision := 1;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;
select extensions.is(
  (public.kc_cadu_metadata_contract() #>> '{checks,touchTrigger}')::boolean,
  false,
  'metadata contract rejects a same-OID trigger function with broken revision semantics'
);
rollback to savepoint cadu_probe_trigger_body;
release savepoint cadu_probe_trigger_body;

savepoint cadu_probe_stable_rpc_body;
create or replace function public.kc_cadu_upsert_source_override(
  p_source_id text,
  p_tier integer,
  p_note text,
  p_expected_exists boolean,
  p_expected_revision bigint,
  p_expected_meta_revisions jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;
select extensions.is(
  (public.kc_cadu_metadata_contract() #>> '{checks,stableRpc}')::boolean,
  false,
  'metadata contract rejects a same-signature CAS RPC with a different body'
);
rollback to savepoint cadu_probe_stable_rpc_body;
release savepoint cadu_probe_stable_rpc_body;

savepoint cadu_probe_stable_rpc_argument_names;
do $probe$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.kc_cadu_upsert_source_override(text,integer,text,boolean,bigint,jsonb)'::regprocedure
  ) into v_definition;
  execute 'drop function public.kc_cadu_upsert_source_override(text,integer,text,boolean,bigint,jsonb)';
  execute pg_catalog.replace(v_definition, 'p_source_id text', 'x_source_id text');
  execute 'revoke all on function public.kc_cadu_upsert_source_override(text,integer,text,boolean,bigint,jsonb) from public, anon, authenticated';
  execute 'grant execute on function public.kc_cadu_upsert_source_override(text,integer,text,boolean,bigint,jsonb) to service_role';
end;
$probe$;
select extensions.is(
  (public.kc_cadu_metadata_contract() #>> '{checks,stableRpc}')::boolean,
  false,
  'metadata contract rejects renamed stable RPC arguments used by PostgREST named calls'
);
rollback to savepoint cadu_probe_stable_rpc_argument_names;
release savepoint cadu_probe_stable_rpc_argument_names;

savepoint cadu_probe_legacy_rpc_argument_names;
do $probe$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.kc_cadu_upsert_legacy_override(text,text,integer,text,boolean,bigint)'::regprocedure
  ) into v_definition;
  execute 'drop function public.kc_cadu_upsert_legacy_override(text,text,integer,text,boolean,bigint)';
  execute pg_catalog.replace(v_definition, 'p_unit_id text', 'x_unit_id text');
  execute 'revoke all on function public.kc_cadu_upsert_legacy_override(text,text,integer,text,boolean,bigint) from public, anon, authenticated';
  execute 'grant execute on function public.kc_cadu_upsert_legacy_override(text,text,integer,text,boolean,bigint) to service_role';
end;
$probe$;
select extensions.is(
  (public.kc_cadu_metadata_contract() #>> '{checks,legacyRpc}')::boolean,
  false,
  'metadata contract rejects renamed legacy RPC arguments used by PostgREST named calls'
);
rollback to savepoint cadu_probe_legacy_rpc_argument_names;
release savepoint cadu_probe_legacy_rpc_argument_names;

savepoint cadu_probe_rpc_overloads;
create function public.kc_cadu_upsert_source_override(p_source_id text)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$ select pg_catalog.jsonb_build_object('sourceId', p_source_id) $$;
create function public.kc_cadu_upsert_legacy_override(p_unit_id text)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$ select pg_catalog.jsonb_build_object('unitId', p_unit_id) $$;
select extensions.ok(
  not (public.kc_cadu_metadata_contract() #>> '{checks,stableRpc}')::boolean
  and not (public.kc_cadu_metadata_contract() #>> '{checks,legacyRpc}')::boolean,
  'metadata contract rejects overloaded PostgREST RPC names'
);
rollback to savepoint cadu_probe_rpc_overloads;
release savepoint cadu_probe_rpc_overloads;

savepoint cadu_probe_stable_rpc_extra_config;
alter function public.kc_cadu_upsert_source_override(text,integer,text,boolean,bigint,jsonb)
  set role = 'anon';
select extensions.is(
  (public.kc_cadu_metadata_contract() #>> '{checks,stableRpc}')::boolean,
  false,
  'metadata contract rejects extra RPC configuration that changes execution privileges'
);
rollback to savepoint cadu_probe_stable_rpc_extra_config;
release savepoint cadu_probe_stable_rpc_extra_config;

set local role authenticated;
select extensions.lives_ok(
  $$select public.kc_increment_location_usage('campus-samambaia')$$,
  'authenticated wrapper increments a canonical location'
);
select extensions.lives_ok(
  $$select public.kc_upsert_custom_location('custom-pgtap-local', 'Local pgTAP')$$,
  'authenticated wrapper creates a validated custom location'
);
reset role;

select extensions.is(
  (select usage_count from public.caronas_locations where key = 'custom-pgtap-local'),
  1,
  'custom location starts with one use'
);

set local role authenticated;
select extensions.throws_ok(
  $$select public.kc_upsert_custom_location('campus-samambaia', 'Invalid overwrite')$$,
  '22023',
  'INVALID_CUSTOM_LOCATION',
  'custom location RPC rejects non-custom keys'
);
reset role;

set local role authenticated;
select extensions.throws_ok(
  $$insert into public.kc_unit_meta (unit_id, tier, note)
    values ('PGTAP-DIRECT', 2, 'blocked')$$,
  '42501',
  'permission denied for table kc_unit_meta',
  'authenticated cannot bypass the Cadu RPC with direct DML'
);
reset role;

set local role service_role;
select extensions.is(
  (public.kc_cadu_upsert_source_override(
    'web.pgtap', 2, 'created', false, null,
    (select coalesce(jsonb_object_agg(unit_id, revision), '{}'::jsonb) from public.kc_unit_meta)
  )->>'revision')::bigint,
  1::bigint,
  'stable Cadu CAS creates revision one'
);
select extensions.is(
  (public.kc_cadu_upsert_source_override(
    'web.pgtap', 3, 'updated', true, 1, null
  )->>'revision')::bigint,
  2::bigint,
  'stable Cadu CAS increments the revision'
);
select extensions.throws_ok(
  $$select public.kc_cadu_upsert_source_override(
    'web.pgtap', 1, 'stale', true, 1, null
  )$$,
  'PT412',
  'SOURCE_OVERRIDE_PRECONDITION_FAILED',
  'stable Cadu CAS rejects a stale revision'
);
select extensions.throws_ok(
  $$select public.kc_cadu_upsert_source_override(
    'web.pgtap', 1, 'duplicate create', false, null,
    (select coalesce(jsonb_object_agg(unit_id, revision), '{}'::jsonb) from public.kc_unit_meta)
  )$$,
  'PT412',
  'SOURCE_OVERRIDE_PRECONDITION_FAILED',
  'stable Cadu CAS rejects an unexpected existing row'
);
select extensions.throws_ok(
  $$select public.kc_cadu_upsert_source_override(
    'web.pgtap.missing', 1, 'missing', true, 1, null
  )$$,
  'PT412',
  'SOURCE_OVERRIDE_PRECONDITION_FAILED',
  'stable Cadu CAS rejects an unexpected absent row'
);
select extensions.throws_ok(
  $$select public.kc_cadu_upsert_source_override(
    'web.pgtap.snapshot-stale', 1, 'stale snapshot', false, null, '{}'::jsonb
  )$$,
  'PT412',
  'SOURCE_OVERRIDE_PRECONDITION_FAILED',
  'stable creation rejects a metadata snapshot changed after the API read'
);
select extensions.throws_ok(
  $$select public.kc_cadu_upsert_source_override(
    'web.pgtap.snapshot-missing', 1, 'missing snapshot', false, null, null
  )$$,
  '22023',
  'INVALID_EXPECTED_STATE',
  'stable creation requires an explicit metadata revision snapshot'
);
select extensions.throws_ok(
  $$select public.kc_cadu_upsert_source_override(
    'web.pgtap.invalid', 1, E'unsafe\001control', false, null,
    (select coalesce(jsonb_object_agg(unit_id, revision), '{}'::jsonb) from public.kc_unit_meta)
  )$$,
  '22023',
  'INVALID_NOTE',
  'stable Cadu CAS rejects prompt-breaking control characters'
);
select extensions.is(
  public.kc_cadu_upsert_source_override(
    'web.pgtap.multiline', 2, E'line one\n\tline two', false, null,
    (select coalesce(jsonb_object_agg(unit_id, revision), '{}'::jsonb) from public.kc_unit_meta)
  )->>'note',
  E'line one\n\tline two',
  'stable Cadu CAS preserves safe multiline notes'
);
select extensions.is(
  public.kc_cadu_upsert_source_override(
    'web.pgtap.tombstone', null, null, false, null,
    (select coalesce(jsonb_object_agg(unit_id, revision), '{}'::jsonb) from public.kc_unit_meta)
  )->>'created',
  'true',
  'stable Cadu CAS preserves an explicit tombstone as a present row'
);
select extensions.is(
  (public.kc_cadu_upsert_legacy_override(
    'PGTAP-LEGACY', 'web.pgtap.bridge', 2, 'legacy', false, null
  )->>'revision')::bigint,
  1::bigint,
  'legacy Cadu CAS creates revision one'
);
select extensions.is(
  (public.kc_cadu_upsert_source_override(
    'web.pgtap.bridge', 1, 'stable', false, null,
    (select coalesce(jsonb_object_agg(unit_id, revision), '{}'::jsonb) from public.kc_unit_meta)
  )->>'revision')::bigint,
  1::bigint,
  'stable adjudication can follow a serialized legacy write'
);
select extensions.throws_ok(
  $$select public.kc_cadu_upsert_legacy_override(
    'PGTAP-LEGACY', 'web.pgtap.bridge', 3, 'shadowed', true, 1
  )$$,
  'PT409',
  'LEGACY_OVERRIDE_SHADOWED_BY_STABLE_SOURCE',
  'legacy Cadu CAS rejects a row shadowed by a stable override'
);
reset role;

select extensions.is(
  (select jsonb_build_object(
    'tier', tier,
    'note', note,
    'revision', revision
  ) from public.kc_unit_meta where unit_id = 'web.pgtap'),
  '{"tier": 3, "note": "updated", "revision": 2}'::jsonb,
  'stale stable writes leave the committed value unchanged'
);
select extensions.ok(
  exists (
    select 1
    from public.kc_unit_meta
    where unit_id = 'web.pgtap.tombstone'
      and tier is null
      and note is null
      and revision = 1
  ),
  'stable tombstone remains distinguishable from absence'
);

select * from extensions.finish();

rollback;

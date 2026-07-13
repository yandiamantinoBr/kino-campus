begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(61);

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

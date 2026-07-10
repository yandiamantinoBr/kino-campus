begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(37);

select extensions.has_table('public', 'caronas_locations', 'caronas location table exists');
select extensions.has_table('public', 'kc_unit_meta', 'Cadu unit metadata table exists');
select extensions.has_index('public', 'caronas_locations', 'idx_caronas_loc_zone', 'caronas zone index exists');
select extensions.has_index('public', 'kc_unit_meta', 'idx_kc_unit_meta_updated_by', 'unit metadata foreign key has a covering index');
select extensions.is((select count(*)::integer from public.caronas_locations), 57, 'all canonical caronas locations are seeded');
select extensions.is((select count(*)::integer from public.caronas_locations where zone_key = 'custom'), 0, 'custom locations are not seeded');

select extensions.ok((select relrowsecurity from pg_class where oid = 'public.caronas_locations'::regclass), 'caronas locations has RLS enabled');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.kc_unit_meta'::regclass), 'unit metadata has RLS enabled');
select extensions.is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'caronas_locations'), 1, 'caronas locations has one select policy');
select extensions.is((select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'kc_unit_meta'), 4, 'unit metadata has select and admin write policies');
select extensions.is(
  (select count(*)::integer
   from pg_policies
   where schemaname = 'public'
     and tablename = 'kc_unit_meta'
     and cmd in ('INSERT', 'UPDATE', 'DELETE')
     and concat_ws(' ', qual, with_check) like '%SELECT auth.uid()%'),
  3,
  'unit metadata admin policies use an auth uid initplan'
);

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
select extensions.ok(has_column_privilege('authenticated', 'public.kc_unit_meta', 'unit_id', 'insert'), 'authenticated admin path can insert unit ids');
select extensions.ok(not has_column_privilege('authenticated', 'public.kc_unit_meta', 'updated_at', 'insert'), 'authenticated cannot override unit insert timestamp');
select extensions.ok(has_column_privilege('authenticated', 'public.kc_unit_meta', 'tier', 'update'), 'authenticated admin path can update tier');
select extensions.ok(not has_column_privilege('authenticated', 'public.kc_unit_meta', 'updated_at', 'update'), 'authenticated cannot override unit update timestamp');
select extensions.ok(has_table_privilege('authenticated', 'public.kc_unit_meta', 'delete'), 'authenticated admin path can delete after RLS check');
select extensions.ok(not has_function_privilege('authenticated', 'public.kc_unit_meta_touch()', 'execute'), 'trigger function is not directly executable by authenticated');
select extensions.has_trigger('public', 'kc_unit_meta', 'kc_unit_meta_touch', 'unit metadata update trigger exists');

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

insert into auth.users (id)
values ('00000000-0000-4000-8000-000000000111');
insert into public.profiles (id, is_admin, full_name)
values ('00000000-0000-4000-8000-000000000111', true, 'pgTAP Admin');
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000111","role":"authenticated"}',
  true
);

set local role authenticated;
select extensions.lives_ok(
  $$insert into public.kc_unit_meta (unit_id, tier, note, updated_by)
    values ('PGTAP', 2, 'created', '00000000-0000-4000-8000-000000000111')$$,
  'admin can insert unit metadata'
);
select extensions.lives_ok(
  $$update public.kc_unit_meta set tier = 3, note = 'updated' where unit_id = 'PGTAP'$$,
  'admin can update unit metadata'
);
select extensions.lives_ok(
  $$delete from public.kc_unit_meta where unit_id = 'PGTAP'$$,
  'admin can delete unit metadata'
);
reset role;

select extensions.is(
  (select count(*)::integer from public.kc_unit_meta where unit_id = 'PGTAP'),
  0,
  'admin delete removes the test override'
);

select * from extensions.finish();

rollback;

begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(10);

select extensions.ok(
  (select count(*) >= 40 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'kc_admin_%'),
  'the active schema exposes the expected administrative RPC family'
);
select extensions.is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'kc_admin_%' and has_function_privilege('anon', p.oid, 'execute')),
  0,
  'anonymous callers cannot execute administrative RPCs'
);
select extensions.is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'kc_admin_%' and not has_function_privilege('authenticated', p.oid, 'execute')),
  0,
  'authenticated callers can reach administrative RPC authorization checks'
);
select extensions.ok(
  (select prosecdef from pg_proc where oid = 'public.kc_admin_save_banner(jsonb)'::regprocedure),
  'banner save implementation remains a definer function'
);
select extensions.ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.kc_admin_save_banner(jsonb)'::regprocedure),
  'banner save fixes its search path'
);
select extensions.ok(
  (select prosrc not like '%v_old%' from pg_proc where oid = 'public.kc_admin_save_banner(jsonb)'::regprocedure),
  'banner save has no discarded pre-update read'
);

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-000000000444', 'banner-admin@example.test');
insert into public.profiles (id, is_admin, full_name)
values ('00000000-0000-4000-8000-000000000444', true, 'Banner Contract Admin');

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000444","role":"authenticated"}',
  true
);
set local role authenticated;

select extensions.throws_ok(
  $$select public.kc_admin_save_banner('{"id":"00000000-0000-4000-8000-000000000999","title":"Ausente"}'::jsonb)$$,
  'P0002',
  'Banner não encontrado.',
  'updating an unknown banner fails explicitly'
);
select extensions.ok(
  (public.kc_admin_save_banner('{"title":"Banner de contrato","subtitle":"Original"}'::jsonb)).id is not null,
  'an administrator can create a banner'
);
select extensions.is(
  (
    public.kc_admin_save_banner(
      jsonb_build_object(
        'id', (select id from public.hero_banners where title = 'Banner de contrato' limit 1),
        'subtitle', 'Atualizado'
      )
    )
  ).subtitle,
  'Atualizado',
  'an administrator can update an existing banner'
);

reset role;

select extensions.is(
  (select count(*)::integer from public.hero_banner_audit where changed_by = '00000000-0000-4000-8000-000000000444'),
  2,
  'successful create and update operations each write an audit event'
);

select * from extensions.finish();

rollback;

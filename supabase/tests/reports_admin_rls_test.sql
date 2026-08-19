begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(7);

select extensions.is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'reports'
      and policyname in ('reports_select_admins', 'reports_update_admin')
  ),
  2,
  'reports keeps select and update admin policies'
);

select extensions.is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'audit_log'
      and policyname = 'audit_log_select_admin'
  ),
  1,
  'audit log keeps its admin select policy'
);

select extensions.ok(
  (
    select pg_catalog.bool_and(roles = array['authenticated']::name[])
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and (
        (tablename = 'reports' and policyname in ('reports_select_admins', 'reports_update_admin'))
        or (tablename = 'audit_log' and policyname = 'audit_log_select_admin')
      )
  ),
  'moderation admin policies only target authenticated callers'
);

select extensions.ok(
  (
    select pg_catalog.bool_and(
      qual like '%kc_is_admin%'
      and qual not like '%profiles%'
    )
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and (
        (tablename = 'reports' and policyname in ('reports_select_admins', 'reports_update_admin'))
        or (tablename = 'audit_log' and policyname = 'audit_log_select_admin')
      )
  ),
  'admin policy predicates use the canonical helper without profiles joins'
);

select extensions.ok(
  (
    select with_check like '%kc_is_admin%'
      and with_check not like '%profiles%'
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'reports'
      and policyname = 'reports_update_admin'
  ),
  'reports updates recheck canonical admin authorization'
);

select extensions.ok(
  not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'reports'
      and roles && array['anon', 'public']::name[]
  ),
  'reports has no select policy applicable to anon or public'
);

select extensions.ok(
  not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'audit_log'
      and roles && array['anon', 'public']::name[]
  ),
  'audit log has no select policy applicable to anon or public'
);

select * from extensions.finish();

rollback;

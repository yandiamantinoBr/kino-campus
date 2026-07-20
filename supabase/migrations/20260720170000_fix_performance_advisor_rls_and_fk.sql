-- 20260720170000_fix_performance_advisor_rls_and_fk.sql
-- Performance Advisor fixes:
-- 1) WARN auth_rls_initplan on public.kc_invited_emails
-- 2) INFO unindexed_foreign_keys on public.search_queries(user_id)
--
-- Approach for (1): move auth.uid()/auth.jwt() into STABLE helpers so RLS
-- policies only call (select helper()) — InitPlan once per statement. The
-- linter still flags bare auth.* inside policy expressions even when nested.
--
-- Intentionally NOT dropping unused_index INFO findings: many cover FKs or
-- low-traffic admin/privacy tables; dropping would hurt rare write paths.

begin;

-- ---------------------------------------------------------------------------
-- Helpers: stable, invoker, no search_path surprises
-- ---------------------------------------------------------------------------
create or replace function public.kc_request_uid()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $fn$
  select auth.uid();
$fn$;

create or replace function public.kc_request_email()
returns text
language sql
stable
security invoker
set search_path = ''
as $fn$
  select lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
$fn$;

revoke all on function public.kc_request_uid() from public, anon;
revoke all on function public.kc_request_email() from public, anon;
grant execute on function public.kc_request_uid() to authenticated, service_role;
grant execute on function public.kc_request_email() to authenticated, service_role;

comment on function public.kc_request_uid() is
  'STABLE InitPlan-friendly auth.uid() wrapper for RLS policies.';
comment on function public.kc_request_email() is
  'STABLE InitPlan-friendly JWT email claim for invited-email RLS.';

-- ---------------------------------------------------------------------------
-- RLS policies without bare auth.* in the policy text
-- ---------------------------------------------------------------------------
drop policy if exists kc_invited_emails_select_visible
  on public.kc_invited_emails;
create policy kc_invited_emails_select_visible
  on public.kc_invited_emails
  for select
  to authenticated
  using (
    (select public.kc_is_admin((select public.kc_request_uid())))
    or lower(btrim(email)) = (select public.kc_request_email())
  );

drop policy if exists kc_invited_emails_insert_admin
  on public.kc_invited_emails;
create policy kc_invited_emails_insert_admin
  on public.kc_invited_emails
  for insert
  to authenticated
  with check ((select public.kc_is_admin((select public.kc_request_uid()))));

drop policy if exists kc_invited_emails_update_admin
  on public.kc_invited_emails;
create policy kc_invited_emails_update_admin
  on public.kc_invited_emails
  for update
  to authenticated
  using ((select public.kc_is_admin((select public.kc_request_uid()))))
  with check ((select public.kc_is_admin((select public.kc_request_uid()))));

drop policy if exists kc_invited_emails_delete_admin
  on public.kc_invited_emails;
create policy kc_invited_emails_delete_admin
  on public.kc_invited_emails
  for delete
  to authenticated
  using ((select public.kc_is_admin((select public.kc_request_uid()))));

-- ---------------------------------------------------------------------------
-- Cover search_queries.user_id FK
-- ---------------------------------------------------------------------------
create index if not exists idx_search_queries_user_id
  on public.search_queries (user_id);

comment on index public.idx_search_queries_user_id is
  'Covers search_queries_user_id_fkey for auth.users cascade/set-null paths.';

commit;

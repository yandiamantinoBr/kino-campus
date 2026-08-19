-- Keep moderation tables private while removing legacy policy joins against
-- profiles. The public helper is an invoker facade over the audited private
-- admin check, so policy callers do not need direct access to profiles.
--
-- Deliberately does not add table grants or reporter self-read access.

begin;

drop policy if exists reports_select_admins on public.reports;
create policy reports_select_admins
  on public.reports
  for select
  to authenticated
  using ((select public.kc_is_admin((select auth.uid()))));

drop policy if exists reports_update_admin on public.reports;
create policy reports_update_admin
  on public.reports
  for update
  to authenticated
  using ((select public.kc_is_admin((select auth.uid()))))
  with check ((select public.kc_is_admin((select auth.uid()))));

drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin
  on public.audit_log
  for select
  to authenticated
  using ((select public.kc_is_admin((select auth.uid()))));

commit;

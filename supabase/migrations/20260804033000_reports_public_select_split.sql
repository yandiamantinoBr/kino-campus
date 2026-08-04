-- 2026-08-04 (Yan): the same anti-pattern that broke banners_read for anon
-- visitors (PR #799, commit 8fda59cb) is also present on the public
-- reports moderation table.
--
-- Repro: an anon request to
--   GET /rest/v1/reports?select=id&limit=1
-- returns:
--   {"code":"42501","message":"permission denied for table reports"}
--
-- Cause: the legacy policy was
--
--   create policy reports_select_admins on public.reports
--     for select to public
--     using ( (select profiles.is_admin from profiles where id = auth.uid()) );
--
-- Same shape as the old banners_read: the inner query becomes a join
-- against profiles when auth.uid() is null, profiles is RLS-locked,
-- the planner trips on 42501 against profiles and the whole policy
-- becomes unusable. Because the role list is `to public` (not `to
-- authenticated`), even the anon path tries to evaluate the policy and
-- the entire SELECT path falls over.
--
-- Fix: drop reports_select_admins and reports_update_admin, replace
-- with one select + one update that go through public.kc_is_admin() —
-- which is SECURITY DEFINER and bypasses the profiles RLS, so the
-- admin check can resolve auth.uid() without dragging the locked table
-- into the query. The admin path is now strictly authenticated, the
-- `to public` exposure goes away.
--
-- audit_log_select_admin had the same shape but its target table is
-- audit_log (admin-only telemetry, never reached by anon endpoints)
-- and is currently failing 401/42501 for anon as expected. We still
-- refactor it to kc_is_admin() for consistency, since any policy
-- that mentions profiles.is_admin directly is fragile against future
-- profiles-RLS changes.

begin;

drop policy if exists reports_select_admins on public.reports;
drop policy if exists reports_update_admin on public.reports;

create policy reports_admin_select
  on public.reports for select to authenticated
  using (public.kc_is_admin(auth.uid()));

create policy reports_admin_update
  on public.reports for update to authenticated
  using (public.kc_is_admin(auth.uid()))
  with check (public.kc_is_admin(auth.uid()));

-- reports is a moderation table; the user that filed the report can
-- also see it (and only the rows they filed). This uses the user's
-- own id, so it does not need kc_is_admin().
drop policy if exists reports_select_own on public.reports;
create policy reports_select_own
  on public.reports for select to authenticated
  using (reporter_id = auth.uid());

drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin
  on public.audit_log for select to authenticated
  using (public.kc_is_admin(auth.uid()));

commit;

-- ============================================================
-- KinoCampus - v9.3.3.0
-- Supabase operational hardening: RLS initplan + multiple permissive + FK index coverage
--
-- Targeted advisor findings addressed in this migration:
--   - auth_rls_initplan
--   - multiple_permissive_policies
--   - unindexed_foreign_keys
--
-- Scope intentionally limited to:
--   - public.notifications
--   - public.post_view_events
--   - public.kc_invited_emails
-- ============================================================

begin;

-- ------------------------------------------------------------------
-- 1. Foreign key index coverage
-- ------------------------------------------------------------------

create index if not exists idx_kc_invited_emails_invited_by
  on public.kc_invited_emails (invited_by);

create index if not exists idx_post_view_events_user_id
  on public.post_view_events (user_id);

-- ------------------------------------------------------------------
-- 2. notifications: wrap auth.uid() with SELECT to enable initplan
-- ------------------------------------------------------------------

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
  on public.notifications for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own
  on public.notifications for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- ------------------------------------------------------------------
-- 3. post_view_events: initplan + single SELECT policy for author/admin
-- ------------------------------------------------------------------

drop policy if exists post_view_events_insert on public.post_view_events;
create policy post_view_events_insert
  on public.post_view_events for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists post_view_events_select_author on public.post_view_events;
drop policy if exists post_view_events_select_admin on public.post_view_events;
drop policy if exists post_view_events_select_visible on public.post_view_events;
create policy post_view_events_select_visible
  on public.post_view_events for select
  to authenticated
  using (
    public.kc_is_admin((select auth.uid()))
    or exists (
      select 1
      from public.posts p
      where p.id = post_view_events.post_id
        and p.author_id = (select auth.uid())
    )
  );

-- ------------------------------------------------------------------
-- 4. kc_invited_emails: initplan + split admin writes from unified SELECT
-- ------------------------------------------------------------------

drop policy if exists "kc_invited_emails_admin_all" on public.kc_invited_emails;
drop policy if exists "kc_invited_emails_self_read" on public.kc_invited_emails;
drop policy if exists "kc_invited_emails_select_visible" on public.kc_invited_emails;
drop policy if exists "kc_invited_emails_insert_admin" on public.kc_invited_emails;
drop policy if exists "kc_invited_emails_update_admin" on public.kc_invited_emails;
drop policy if exists "kc_invited_emails_delete_admin" on public.kc_invited_emails;

create policy "kc_invited_emails_select_visible"
  on public.kc_invited_emails for select
  to authenticated
  using (
    public.kc_is_admin((select auth.uid()))
    or lower(trim(email)) = (
      select lower(trim(u.email))
      from auth.users u
      where u.id = (select auth.uid())
    )
  );

create policy "kc_invited_emails_insert_admin"
  on public.kc_invited_emails for insert
  to authenticated
  with check (public.kc_is_admin((select auth.uid())));

create policy "kc_invited_emails_update_admin"
  on public.kc_invited_emails for update
  to authenticated
  using (public.kc_is_admin((select auth.uid())))
  with check (public.kc_is_admin((select auth.uid())));

create policy "kc_invited_emails_delete_admin"
  on public.kc_invited_emails for delete
  to authenticated
  using (public.kc_is_admin((select auth.uid())));

commit;

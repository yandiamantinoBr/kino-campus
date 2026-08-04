-- 2026-08-04 (Yan): split banners_read into two policies so visitors
-- (anon role) can see the live hero_banners rows.
--
-- Repro: an anon request to
--   GET /rest/v1/hero_banners?is_active=eq.true&order=sort_order.asc
-- was returning:
--   {"code":"42501","message":"permission denied for table profiles"}
--
-- Cause: the existing `banners_read` policy was:
--
--   create policy banners_read on public.hero_banners
--     for select to public
--     using (
--       (is_active = true)
--       or exists (
--         select 1 from profiles
--         where profiles.id = (select auth.uid()) and profiles.is_admin = true
--       )
--     );
--
-- For the anon role, auth.uid() is null, so the inner query becomes
--   select 1 from profiles where profiles.id = null
-- which the planner rewrites as a join against profiles. That join hits
-- the profiles RLS, which only lets anon read rows where profile_public is
-- true (and most admin profiles are not), so the EXISTS clause becomes
-- false for anon. Worse, the rewrite path is what raises 42501 against
-- profiles, and the entire banners_read policy becomes unusable for anon.
-- The JS layer then falls back to the static mockup slides baked into
-- index.html, which is the bug reported today.
--
-- Fix: drop the combined policy and replace it with two narrower ones.
--   1. banners_anon_authenticated_select_active — visible to anon and
--      authenticated, only active rows. No join against profiles, no
--      dependency on auth.uid(), so the planner cannot drag in a denied
--      table. This is what visitors see.
--   2. banners_admin_select_all — visible to authenticated callers, every
--      row (active + inactive). The admin check goes through
--      public.kc_is_admin(auth.uid()), which is SECURITY DEFINER and
--      bypasses the profiles RLS, so the policy can resolve auth.uid()
--      without dragging in the denied table.
--
-- The other banners_*_admin policies already restrict to the same admin
-- helper and need no change. The kc_active_session_restrictive policy
-- stays untouched and only applies to authenticated callers.

begin;

drop policy if exists banners_read on public.hero_banners;

create policy banners_anon_authenticated_select_active
  on public.hero_banners
  for select
  to anon, authenticated
  using (is_active = true);

create policy banners_admin_select_all
  on public.hero_banners
  for select
  to authenticated
  using (public.kc_is_admin(auth.uid()));

commit;

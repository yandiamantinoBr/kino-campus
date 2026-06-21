-- Kino Campus — V8.2.10.0
-- Consolidate duplicated RLS policies per role/action with equivalent OR semantics.

begin;

-- ============================================================
-- public.comments (DELETE authenticated)
-- ============================================================
drop policy if exists comments_delete_admin on public.comments;
drop policy if exists comments_delete_own on public.comments;
create policy comments_delete_authenticated
  on public.comments for delete
  to authenticated
  using (
    (select auth.uid()) = author_id
    or (select is_admin from public.profiles where id = (select auth.uid())) = true
  );

-- ============================================================
-- public.posts (SELECT authenticated)
-- Keep public (anon) read for published posts and consolidate auth read paths.
-- ============================================================
drop policy if exists posts_select_admin on public.posts;
drop policy if exists posts_select_published on public.posts;

create policy posts_select_published
  on public.posts for select
  to anon
  using (status = 'published');

create policy posts_select_authenticated
  on public.posts for select
  to authenticated
  using (
    status = 'published'
    or (select auth.uid()) = author_id
    or (select is_admin from public.profiles where id = (select auth.uid())) = true
  );

-- ============================================================
-- public.posts (UPDATE authenticated)
-- Consolidate own/admin update rights with explicit WITH CHECK to avoid privilege drift.
-- ============================================================
drop policy if exists posts_update_own on public.posts;
drop policy if exists posts_update_status_admin on public.posts;
create policy posts_update_authenticated
  on public.posts for update
  to authenticated
  using (
    (select auth.uid()) = author_id
    or (select is_admin from public.profiles where id = (select auth.uid())) = true
  )
  with check (
    (select auth.uid()) = author_id
    or (select is_admin from public.profiles where id = (select auth.uid())) = true
  );

-- ============================================================
-- public.posts (DELETE authenticated)
-- ============================================================
drop policy if exists posts_delete_admin on public.posts;
drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_authenticated
  on public.posts for delete
  to authenticated
  using (
    (
      (select auth.uid()) = author_id
      and status in ('published', 'pending')
    )
    or (select is_admin from public.profiles where id = (select auth.uid())) = true
  );

-- ============================================================
-- public.post_media (SELECT)
-- Remove overlap: keep public/auth read via single select policy,
-- and split owner write policy by action (no implicit SELECT grant).
-- ============================================================
drop policy if exists post_media_select_public on public.post_media;
create policy post_media_select_public
  on public.post_media for select
  to anon, authenticated
  using (true);

drop policy if exists post_media_write_own on public.post_media;

create policy post_media_insert_own
  on public.post_media for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.posts p
      where p.id = post_media.post_id
        and p.author_id = (select auth.uid())
    )
  );

create policy post_media_update_own
  on public.post_media for update
  to authenticated
  using (
    exists (
      select 1
      from public.posts p
      where p.id = post_media.post_id
        and p.author_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.posts p
      where p.id = post_media.post_id
        and p.author_id = (select auth.uid())
    )
  );

create policy post_media_delete_own
  on public.post_media for delete
  to authenticated
  using (
    exists (
      select 1
      from public.posts p
      where p.id = post_media.post_id
        and p.author_id = (select auth.uid())
    )
  );

commit;

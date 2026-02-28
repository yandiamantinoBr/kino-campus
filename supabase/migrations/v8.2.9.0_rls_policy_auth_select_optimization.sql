-- Kino Campus — V8.2.9.0
-- RLS policy optimization: wrap auth helpers in SELECT to avoid per-row re-evaluation.
-- Functional semantics are intentionally unchanged.

begin;

-- ============================================================
-- public.profiles
-- ============================================================
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles for insert
with check ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles for update
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- ============================================================
-- public.posts
-- ============================================================
drop policy if exists posts_delete_admin on public.posts;
create policy posts_delete_admin
on public.posts for delete
using (
  (select auth.uid()) is not null
  and exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and is_admin = true
  )
);

drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own
on public.posts for delete
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = author_id
);

drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own
on public.posts for insert
with check ((select auth.uid()) = author_id);

drop policy if exists posts_select_admin on public.posts;
create policy posts_select_admin
  on public.posts for select
  to authenticated
  using (
    (select is_admin from public.profiles where id = (select auth.uid())) = true
  );

drop policy if exists posts_select_published on public.posts;
create policy posts_select_published
on public.posts for select
using (
  status = 'published'
  or ((select auth.uid()) is not null and (select auth.uid()) = author_id)
);

drop policy if exists posts_update_own on public.posts;
create policy posts_update_own
on public.posts for update
using ((select auth.uid()) = author_id)
with check ((select auth.uid()) = author_id);

drop policy if exists posts_update_status_admin on public.posts;
create policy posts_update_status_admin
  on public.posts for update
  to authenticated
  using (
    (select is_admin from public.profiles where id = (select auth.uid())) = true
  )
  with check (
    (select is_admin from public.profiles where id = (select auth.uid())) = true
  );

-- ============================================================
-- public.post_media
-- ============================================================
drop policy if exists post_media_write_own on public.post_media;
create policy post_media_write_own
on public.post_media for all
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

-- ============================================================
-- public.reports
-- ============================================================
drop policy if exists reports_insert_authenticated on public.reports;
create policy reports_insert_authenticated
on public.reports for insert
to authenticated
with check (
  (select auth.uid()) = reporter_id
);

drop policy if exists reports_select_admins on public.reports;
create policy reports_select_admins
  on public.reports for select
  using (
    (select is_admin from public.profiles where id = (select auth.uid())) = true
  );

drop policy if exists reports_update_admin on public.reports;
create policy reports_update_admin
  on public.reports for update
  to authenticated
  using (
    (select is_admin from public.profiles where id = (select auth.uid())) = true
  )
  with check (
    (select is_admin from public.profiles where id = (select auth.uid())) = true
  );

-- ============================================================
-- public.comments
-- ============================================================
drop policy if exists comments_delete_admin on public.comments;
create policy comments_delete_admin
  on public.comments for delete
  to authenticated
  using (
    (select is_admin from public.profiles where id = (select auth.uid())) = true
  );

drop policy if exists comments_delete_own on public.comments;
create policy comments_delete_own
  on public.comments for delete
  to authenticated
  using ((select auth.uid()) = author_id);

drop policy if exists comments_insert_auth on public.comments;
create policy comments_insert_auth
  on public.comments for insert
  to authenticated
  with check ((select auth.uid()) = author_id);

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own
  on public.comments for update
  to authenticated
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);

-- ============================================================
-- public.post_votes
-- ============================================================
drop policy if exists post_votes_delete_own on public.post_votes;
create policy post_votes_delete_own
  on public.post_votes for delete
  to authenticated
  using ((select auth.uid()) = voter_id);

drop policy if exists post_votes_insert_auth on public.post_votes;
create policy post_votes_insert_auth
  on public.post_votes for insert
  to authenticated
  with check ((select auth.uid()) = voter_id);

-- ============================================================
-- public.audit_log
-- ============================================================
drop policy if exists audit_log_insert_trigger_only on public.audit_log;
create policy audit_log_insert_trigger_only
  on public.audit_log for insert
  to authenticated
  with check (
    pg_trigger_depth() > 0
    and (actor_id = (select auth.uid()) or actor_id is null)
  );

drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin
  on public.audit_log for select
  to authenticated
  using (
    (select is_admin from public.profiles where id = (select auth.uid())) = true
  );

-- ============================================================
-- public.comment_likes
-- ============================================================
drop policy if exists comment_likes_delete_own on public.comment_likes;
create policy comment_likes_delete_own
  on public.comment_likes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists comment_likes_insert_own on public.comment_likes;
create policy comment_likes_insert_own
  on public.comment_likes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

commit;

-- Kino Campus — V8.2.10.1
-- Recreate posts DELETE policies with explicit authenticated role scoping
-- and initplan-friendly auth helpers.

begin;

-- Remove consolidated policy if present.
drop policy if exists posts_delete_authenticated on public.posts;

-- Recreate split DELETE policies with explicit role and optimized predicates.
drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own
  on public.posts for delete
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = author_id
    and status in ('published', 'pending')
  );

drop policy if exists posts_delete_admin on public.posts;
create policy posts_delete_admin
  on public.posts for delete
  to authenticated
  using (
    (select auth.uid()) is not null
    and (
      select is_admin
      from public.profiles
      where id = (select auth.uid())
    ) = true
  );

commit;

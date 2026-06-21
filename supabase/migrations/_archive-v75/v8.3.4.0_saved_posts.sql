-- Kino Campus -- V8.3.4.0
-- Saved posts per user:
--   - favorite
--   - later
--   - highlight
--
-- Public visibility:
--   - only highlight rows
--   - only when the related post is still published

begin;

create table if not exists public.saved_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  post_id uuid not null,
  kind text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_posts_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint saved_posts_post_id_fkey foreign key (post_id) references public.posts(id) on delete cascade,
  constraint saved_posts_user_post_unique unique (user_id, post_id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'saved_posts_kind_check'
      and conrelid = 'public.saved_posts'::regclass
  ) then
    alter table public.saved_posts
      add constraint saved_posts_kind_check
      check (kind in ('favorite', 'later', 'highlight'));
  end if;
end $$;

create index if not exists saved_posts_user_id_idx on public.saved_posts (user_id);
create index if not exists saved_posts_post_id_idx on public.saved_posts (post_id);
create index if not exists saved_posts_user_kind_updated_idx on public.saved_posts (user_id, kind, updated_at desc);
create index if not exists saved_posts_kind_updated_idx on public.saved_posts (kind, updated_at desc);

drop trigger if exists trg_saved_posts_set_updated_at on public.saved_posts;
create trigger trg_saved_posts_set_updated_at
  before update on public.saved_posts
  for each row execute function public.kc_set_updated_at();

alter table public.saved_posts enable row level security;

drop policy if exists saved_posts_select_own on public.saved_posts;
drop policy if exists saved_posts_select_public_highlights on public.saved_posts;
drop policy if exists saved_posts_insert_own on public.saved_posts;
drop policy if exists saved_posts_update_own on public.saved_posts;
drop policy if exists saved_posts_delete_own on public.saved_posts;

create policy saved_posts_select_own
  on public.saved_posts for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy saved_posts_select_public_highlights
  on public.saved_posts for select
  to anon, authenticated
  using (
    kind = 'highlight'
    and exists (
      select 1
      from public.posts p
      where p.id = saved_posts.post_id
        and p.status = 'published'
    )
  );

create policy saved_posts_insert_own
  on public.saved_posts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy saved_posts_update_own
  on public.saved_posts for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy saved_posts_delete_own
  on public.saved_posts for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on table public.saved_posts to anon, authenticated;
grant insert, update, delete on table public.saved_posts to authenticated;
grant all on table public.saved_posts to service_role;

commit;

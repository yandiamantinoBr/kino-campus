-- Kino Campus -- V8.3.4.1
-- Extensoes de perfil + saved_posts multiestado
--   - profiles.bio
--   - avatar path dedicado em kino-media/profile-avatars/{userId}/...
--   - saved_posts com unicidade por (user_id, post_id, kind)
--   - RPCs agregadas para salvos e destaques

begin;

alter table if exists public.profiles
  add column if not exists bio text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_bio_length_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_bio_length_check
      check (bio is null or char_length(bio) <= 200);
  end if;
end $$;

do $storage_policies$
begin
  execute 'drop policy if exists storage_kino_media_profile_avatar_insert on storage.objects';
  execute $sql$
    create policy storage_kino_media_profile_avatar_insert
    on storage.objects for insert
    to authenticated
    with check (
      bucket_id = 'kino-media'
      and auth.role() = 'authenticated'
      and (storage.foldername(name))[1] = 'profile-avatars'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
  $sql$;

  execute 'drop policy if exists storage_kino_media_profile_avatar_update on storage.objects';
  execute $sql$
    create policy storage_kino_media_profile_avatar_update
    on storage.objects for update
    to authenticated
    using (
      bucket_id = 'kino-media'
      and auth.uid() = owner
      and (storage.foldername(name))[1] = 'profile-avatars'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
    with check (
      bucket_id = 'kino-media'
      and auth.uid() = owner
      and (storage.foldername(name))[1] = 'profile-avatars'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
  $sql$;

  execute 'drop policy if exists storage_kino_media_profile_avatar_delete on storage.objects';
  execute $sql$
    create policy storage_kino_media_profile_avatar_delete
    on storage.objects for delete
    to authenticated
    using (
      bucket_id = 'kino-media'
      and auth.uid() = owner
      and (storage.foldername(name))[1] = 'profile-avatars'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
  $sql$;
exception
  when insufficient_privilege then
    raise notice 'Skipping storage.objects avatar policies in migration v8.3.4.1. Run supabase/manual/v8.3.4.1_profile_avatar_storage_policies.sql in the Supabase SQL Editor as a project owner/admin.';
end;
$storage_policies$;

alter table if exists public.saved_posts
  drop constraint if exists saved_posts_user_post_unique;

alter table if exists public.saved_posts
  drop constraint if exists saved_posts_user_post_kind_unique;

alter table if exists public.saved_posts
  add constraint saved_posts_user_post_kind_unique unique (user_id, post_id, kind);

create index if not exists saved_posts_user_post_kind_idx
  on public.saved_posts (user_id, post_id, kind);

create or replace function public.kc_get_my_saved_posts(
  p_kind text default null,
  p_page integer default 1,
  p_limit integer default 12
)
returns table (
  post_uuid uuid,
  legacy_id text,
  title text,
  created_at timestamptz,
  status text,
  module text,
  category text,
  saved_at timestamptz,
  save_kinds text[]
)
language sql
stable
as $$
  with normalized as (
    select nullif(lower(trim(coalesce(p_kind, ''))), '') as kind_filter,
           greatest(coalesce(p_page, 1), 1) as page_number,
           least(greatest(coalesce(p_limit, 12), 1), 50) as page_size
  ),
  grouped as (
    select
      sp.post_id,
      max(coalesce(sp.updated_at, sp.created_at)) as saved_at,
      array_agg(distinct sp.kind order by sp.kind) as save_kinds
    from public.saved_posts sp
    cross join normalized n
    where sp.user_id = auth.uid()
      and (n.kind_filter is null or sp.kind = n.kind_filter)
    group by sp.post_id
  )
  select
    p.id as post_uuid,
    coalesce(p.legacy_id::text, p.id::text) as legacy_id,
    p.title,
    p.created_at,
    p.status,
    p.module,
    p.category,
    g.saved_at,
    g.save_kinds
  from grouped g
  join public.posts p on p.id = g.post_id
  cross join normalized n
  order by g.saved_at desc, p.created_at desc
  limit (select page_size from normalized)
  offset ((select page_number from normalized) - 1) * (select page_size from normalized);
$$;

create or replace function public.kc_get_my_saved_posts_count(
  p_kind text default null
)
returns bigint
language sql
stable
as $$
  with normalized as (
    select nullif(lower(trim(coalesce(p_kind, ''))), '') as kind_filter
  )
  select count(*)
  from (
    select sp.post_id
    from public.saved_posts sp
    cross join normalized n
    where sp.user_id = auth.uid()
      and (n.kind_filter is null or sp.kind = n.kind_filter)
    group by sp.post_id
  ) grouped;
$$;

create or replace function public.kc_get_profile_highlights(
  p_profile_id uuid,
  p_page integer default 1,
  p_limit integer default 12
)
returns table (
  post_uuid uuid,
  legacy_id text,
  title text,
  created_at timestamptz,
  status text,
  module text,
  category text,
  saved_at timestamptz,
  save_kinds text[]
)
language sql
stable
as $$
  with normalized as (
    select greatest(coalesce(p_page, 1), 1) as page_number,
           least(greatest(coalesce(p_limit, 12), 1), 50) as page_size
  ),
  grouped as (
    select
      sp.post_id,
      max(coalesce(sp.updated_at, sp.created_at)) as saved_at
    from public.saved_posts sp
    where sp.user_id = p_profile_id
      and sp.kind = 'highlight'
    group by sp.post_id
  )
  select
    p.id as post_uuid,
    coalesce(p.legacy_id::text, p.id::text) as legacy_id,
    p.title,
    p.created_at,
    p.status,
    p.module,
    p.category,
    g.saved_at,
    array['highlight']::text[] as save_kinds
  from grouped g
  join public.posts p on p.id = g.post_id
  cross join normalized n
  where p.status = 'published'
  order by g.saved_at desc, p.created_at desc
  limit (select page_size from normalized)
  offset ((select page_number from normalized) - 1) * (select page_size from normalized);
$$;

create or replace function public.kc_get_profile_highlights_count(
  p_profile_id uuid
)
returns bigint
language sql
stable
as $$
  select count(*)
  from (
    select sp.post_id
    from public.saved_posts sp
    join public.posts p on p.id = sp.post_id
    where sp.user_id = p_profile_id
      and sp.kind = 'highlight'
      and p.status = 'published'
    group by sp.post_id
  ) grouped;
$$;

grant execute on function public.kc_get_my_saved_posts(text, integer, integer) to authenticated;
grant execute on function public.kc_get_my_saved_posts_count(text) to authenticated;
grant execute on function public.kc_get_profile_highlights(uuid, integer, integer) to anon, authenticated;
grant execute on function public.kc_get_profile_highlights_count(uuid) to anon, authenticated;

commit;

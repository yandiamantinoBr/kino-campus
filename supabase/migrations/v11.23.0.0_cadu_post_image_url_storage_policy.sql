-- KinoCampus v11.23.0.0
-- Cadu publisher: canonical post image URL + authenticated Storage upload path.
--
-- Context:
-- - Cadu publishes from a trusted authenticated account, but remote UFG/Even3/Instagram
--   pages do not always expose an OG image that Kino can recover later.
-- - Storage uploads must be allowed by storage.objects RLS even when kino-media is public.
--
-- This migration keeps the existing post_media gallery contract and adds a direct
-- posts.image_url fallback for hero/cover rendering.

begin;

insert into storage.buckets (id, name, public)
values ('kino-media', 'kino-media', true)
on conflict (id) do update set public = true;

alter table if exists public.posts
  add column if not exists image_url text;

comment on column public.posts.image_url is
  'Canonical cover image URL for feed/detail fallback. Mirrors post_media cover when available.';

update public.posts
   set image_url = nullif(coalesce(
     metadata->>'cover_url',
     metadata->>'coverUrl',
     metadata->>'image_url',
     metadata->>'imageUrl'
   ), '')
 where image_url is null
   and metadata is not null
   and nullif(coalesce(
     metadata->>'cover_url',
     metadata->>'coverUrl',
     metadata->>'image_url',
     metadata->>'imageUrl'
   ), '') is not null;

with cover_media as (
  select distinct on (m.post_id)
         m.post_id,
         m.url
    from public.post_media m
   where nullif(m.url, '') is not null
   order by m.post_id, m.is_cover desc, coalesce(m.sort_order, 0), m.created_at asc
)
update public.posts p
   set image_url = cover_media.url
  from cover_media
 where p.id = cover_media.post_id
   and nullif(p.image_url, '') is null;

update public.posts
   set metadata = jsonb_set(
     jsonb_set(coalesce(metadata, '{}'::jsonb), '{image_url}', to_jsonb(image_url), true),
     '{cover_url}',
     to_jsonb(image_url),
     true
   )
 where nullif(image_url, '') is not null
   and (
     nullif(metadata->>'image_url', '') is null
     or nullif(metadata->>'cover_url', '') is null
   );

grant select (image_url) on table public.posts to anon, authenticated, service_role;
grant insert (image_url), update (image_url) on table public.posts to authenticated, service_role;

alter table if exists storage.objects enable row level security;

drop policy if exists storage_kino_media_cadu_post_media_insert on storage.objects;
create policy storage_kino_media_cadu_post_media_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'kino-media'
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'gif', 'webp')
    and octet_length(name) < 512
    and (storage.foldername(name))[1] = 'post-media'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

commit;

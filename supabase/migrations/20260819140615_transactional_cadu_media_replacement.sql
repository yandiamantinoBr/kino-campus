-- Atomically replace the canonical Cadu post cover/gallery. This closes the
-- Edge Function's former UPDATE -> DELETE -> INSERT partial-success window.

begin;

create or replace function public.kc_cadu_replace_post_media(
  p_post_id uuid,
  p_image_urls text[],
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author_id uuid;
  v_url_count integer;
begin
  if p_post_id is null then
    raise exception using errcode = '22023', message = 'POST_ID_REQUIRED';
  end if;

  v_url_count := coalesce(pg_catalog.cardinality(p_image_urls), 0);
  if v_url_count < 1 or v_url_count > 5 then
    raise exception using errcode = '22023', message = 'IMAGE_COUNT_INVALID';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(p_image_urls) as candidate(url)
    where candidate.url is null
      or pg_catalog.btrim(candidate.url) = ''
      or candidate.url !~* '^https://'
  ) then
    raise exception using errcode = '22023', message = 'IMAGE_URL_INVALID';
  end if;

  if (
    select pg_catalog.count(distinct pg_catalog.btrim(candidate.url))
    from pg_catalog.unnest(p_image_urls) as candidate(url)
  ) <> v_url_count then
    raise exception using errcode = '22023', message = 'IMAGE_URL_DUPLICATE';
  end if;

  -- Serialize all replacement calls for the same post, then lock the row.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_post_id::text, 20260819)
  );

  select p.author_id
    into v_author_id
  from public.posts p
  where p.id = p_post_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'POST_NOT_FOUND';
  end if;

  if v_author_id is distinct from '2345582d-8bf7-4393-aa0d-f9953d0e02ca'::uuid then
    raise exception using errcode = '42501', message = 'CADU_POST_REQUIRED';
  end if;

  update public.posts
  set
    image_url = pg_catalog.btrim(p_image_urls[1]),
    metadata = coalesce(p_metadata, '{}'::jsonb)
  where id = p_post_id;

  delete from public.post_media
  where post_id = p_post_id;

  insert into public.post_media (post_id, url, is_cover, sort_order)
  select
    p_post_id,
    pg_catalog.btrim(image.url),
    image.ordinality = 1,
    image.ordinality - 1
  from pg_catalog.unnest(p_image_urls) with ordinality as image(url, ordinality);

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'post_id', p_post_id,
    'image_count', v_url_count,
    'cover_url', pg_catalog.btrim(p_image_urls[1])
  );
end;
$$;

revoke all on function public.kc_cadu_replace_post_media(uuid, text[], jsonb)
  from public, anon, authenticated;
grant execute on function public.kc_cadu_replace_post_media(uuid, text[], jsonb)
  to service_role;

comment on function public.kc_cadu_replace_post_media(uuid, text[], jsonb) is
  'Service-role-only atomic cover/gallery replacement for posts owned by the canonical Cadu identity.';

commit;

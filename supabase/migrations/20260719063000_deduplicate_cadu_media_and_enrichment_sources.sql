-- Remove historical Cadu enrichment amplification and make media attachment
-- idempotent. The keeper preserves a cover row first, then the lowest display
-- order and oldest row. No distinct image URL is removed.

with ranked_media as (
  select
    id,
    row_number() over (
      partition by post_id, url
      order by is_cover desc, sort_order asc, created_at asc, id asc
    ) as duplicate_rank
  from public.post_media
), deleted_media as (
  delete from public.post_media pm
  using ranked_media ranked
  where pm.id = ranked.id
    and ranked.duplicate_rank > 1
  returning pm.id
)
select count(*) from deleted_media;

create unique index if not exists post_media_post_id_url_uidx
  on public.post_media (post_id, url);

-- The duplicate enrichment stage historically appended the same source once
-- per run. Collapse by normalized URL while preferring an official/event
-- entry over an update label. Entries without a URL are retained by JSON
-- identity, so this cleanup cannot discard unrelated metadata.
-- Keep updated_at stable: this is storage normalization, not new content.
alter table public.posts disable trigger kc_posts_set_updated_at;

with compacted_sources as (
  select
    p.id,
    coalesce((
      select jsonb_agg(chosen.entry order by chosen.ordinality)
      from (
        select distinct on (source_key)
          entry,
          ordinality
        from (
          select
            source.entry,
            source.ordinality,
            coalesce(
              nullif(lower(rtrim(btrim(case
                when jsonb_typeof(source.entry) = 'string' then source.entry #>> '{}'
                when jsonb_typeof(source.entry) = 'object' then
                  coalesce(source.entry->>'url', source.entry->>'value', '')
                else ''
              end), '/')), ''),
              'json:' || md5(source.entry::text)
            ) as source_key,
            case lower(coalesce(source.entry->>'type', ''))
              when 'official' then 0
              when 'event' then 1
              when 'source' then 1
              else 2
            end as source_priority
          from jsonb_array_elements(p.metadata->'enrichment_sources')
            with ordinality as source(entry, ordinality)
        ) normalized
        order by source_key, source_priority, ordinality
      ) chosen
    ), '[]'::jsonb) as enrichment_sources
  from public.posts p
  where jsonb_typeof(p.metadata->'enrichment_sources') = 'array'
)
update public.posts p
set metadata = jsonb_set(
  coalesce(p.metadata, '{}'::jsonb),
  '{enrichment_sources}',
  compacted.enrichment_sources,
  true
)
from compacted_sources compacted
where p.id = compacted.id
  and p.metadata->'enrichment_sources' is distinct from compacted.enrichment_sources;

alter table public.posts enable trigger kc_posts_set_updated_at;

comment on index public.post_media_post_id_url_uidx is
  'Prevents repeated Cadu enrichment runs from attaching the same media URL to one post.';

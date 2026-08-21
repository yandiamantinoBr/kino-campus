-- Promote the pre-contract Tags surface to the editable contract without
-- deleting or reclassifying legacy taxonomy.  Historical `tags`/`tagKeys`
-- were used for both human tags and Cadu-generated facets, so a textual
-- heuristic would lose intent.  We copy the normalized labels into the new
-- pair, retain the legacy pair verbatim, and let the UI present one deduped
-- editable view.
--
-- Existing lists above 6/12 are grandfathered: they remain readable and do
-- not block unrelated edits.  Any active change to such a list must bring it
-- within the current caller limit.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.kc_normalize_post_user_tags()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.metadata, '{}'::jsonb);
  v_old_meta jsonb := '{}'::jsonb;
  v_item jsonb;
  v_label text;
  v_key text;
  v_tags text[] := array[]::text[];
  v_tag_keys text[] := array[]::text[];
  v_seen jsonb := '{}'::jsonb;
  v_limit integer := 6;
  v_privileged boolean := false;
  v_user_tags_changed boolean := tg_op = 'INSERT';
begin
  if jsonb_typeof(v_meta) <> 'object' then
    raise exception 'post_user_tags_metadata_must_be_object'
      using errcode = '22023', hint = 'metadata precisa ser um objeto JSON.';
  end if;

  -- A maioria das APIs atualiza metadata parcialmente. Ausência de userTags
  -- não é uma exclusão ativa; uma limpeza explícita usa userTags: [].
  if tg_op = 'UPDATE' then
    v_old_meta := coalesce(old.metadata, '{}'::jsonb);
    if jsonb_typeof(v_old_meta) <> 'object' then v_old_meta := '{}'::jsonb; end if;
    if not (v_meta ? 'userTags') and v_old_meta ? 'userTags' then
      v_meta := jsonb_set(v_meta, '{userTags}', v_old_meta->'userTags', true);
      if v_old_meta ? 'userTagKeys' then
        v_meta := jsonb_set(v_meta, '{userTagKeys}', v_old_meta->'userTagKeys', true);
      end if;
    end if;
    v_user_tags_changed := v_meta->'userTags' is distinct from v_old_meta->'userTags';
  end if;

  if not (v_meta ? 'userTags') then
    if v_meta ? 'userTagKeys' then
      raise exception 'post_user_tag_keys_require_user_tags'
        using errcode = '22023', hint = 'Envie userTags; userTagKeys é derivado no servidor.';
    end if;
    new.metadata := v_meta;
    return new;
  end if;

  if jsonb_typeof(v_meta->'userTags') <> 'array' then
    raise exception 'post_user_tags_must_be_array'
      using errcode = '22023', hint = 'userTags precisa ser uma lista de textos.';
  end if;

  v_privileged := coalesce(auth.role(), '') = 'service_role'
    or public.kc_is_admin(auth.uid());
  if not v_privileged and new.author_id is not null then
    v_privileged := coalesce(kc_private.kc_is_trusted_publisher(new.author_id), false);
  end if;
  v_limit := case when v_privileged then 12 else 6 end;

  for v_item in select value from jsonb_array_elements(v_meta->'userTags') as value loop
    if jsonb_typeof(v_item) <> 'string' then
      raise exception 'post_user_tag_must_be_text'
        using errcode = '22023', hint = 'Cada tag precisa ser um texto.';
    end if;

    v_label := regexp_replace(btrim(v_item #>> '{}'), '\s+', ' ', 'g');
    if v_label = '' then continue; end if;
    if char_length(v_label) > 60 then
      raise exception 'post_user_tag_too_long'
        using errcode = '22023', hint = 'Cada tag pode ter no máximo 60 caracteres.';
    end if;

    v_key := regexp_replace(
      regexp_replace(lower(public.kc_unaccent(v_label)), '[^a-z0-9]+', '-', 'g'),
      '(^-+|-+$)', '', 'g'
    );
    if v_key = '' then
      raise exception 'post_user_tag_invalid'
        using errcode = '22023', hint = 'Use ao menos uma letra ou número em cada tag.';
    end if;
    v_key := left(v_key, 60);

    if not (v_seen ? v_key) then
      v_seen := v_seen || jsonb_build_object(v_key, true);
      v_tags := array_append(v_tags, v_label);
      v_tag_keys := array_append(v_tag_keys, v_key);
    end if;
  end loop;

  -- A historical import may contain a longer list.  It is valid to preserve
  -- it during unrelated edits, but an insert or any active tag mutation must
  -- satisfy the normal 6/12 ceiling.
  if cardinality(v_tags) > v_limit and v_user_tags_changed then
    raise exception 'post_user_tag_limit_exceeded'
      using errcode = '22023',
            detail = format('received=%s limit=%s', cardinality(v_tags), v_limit),
            hint = format('O limite é de %s tags adicionais para este autor.', v_limit);
  end if;

  v_meta := jsonb_set(v_meta, '{userTags}', to_jsonb(v_tags), true);
  v_meta := jsonb_set(v_meta, '{userTagKeys}', to_jsonb(v_tag_keys), true);
  new.metadata := v_meta;
  return new;
end;
$$;

comment on function public.kc_normalize_post_user_tags() is
  'Normalizes metadata.userTags/userTagKeys, preserves omitted values on partial edits, enforces 6 regular or 12 privileged tags on active changes, and retains imported historical lists until explicitly changed.';

-- The legacy and canonical pairs can contain the same values after this
-- import.  Build one normalized union so FTS and the trigram feed index do
-- not award duplicate weight to a post simply because it was migrated.
create or replace function public.kc_posts_search_tags_text(p_metadata jsonb)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  with source_values as (
    select value, ordinality as position
    from jsonb_array_elements_text(
      case when jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)->'tags') = 'array'
        then coalesce(p_metadata, '{}'::jsonb)->'tags'
        else '[]'::jsonb
      end
    ) with ordinality
    union all
    select value, ordinality + 1000
    from jsonb_array_elements_text(
      case when jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)->'tagKeys') = 'array'
        then coalesce(p_metadata, '{}'::jsonb)->'tagKeys'
        else '[]'::jsonb
      end
    ) with ordinality
    union all
    select value, ordinality + 2000
    from jsonb_array_elements_text(
      case when jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)->'userTags') = 'array'
        then coalesce(p_metadata, '{}'::jsonb)->'userTags'
        else '[]'::jsonb
      end
    ) with ordinality
    union all
    select value, ordinality + 3000
    from jsonb_array_elements_text(
      case when jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)->'userTagKeys') = 'array'
        then coalesce(p_metadata, '{}'::jsonb)->'userTagKeys'
        else '[]'::jsonb
      end
    ) with ordinality
  ), normalized as (
    select
      value,
      position,
      regexp_replace(
        regexp_replace(lower(public.kc_unaccent(btrim(value))), '[^a-z0-9]+', '-', 'g'),
        '(^-+|-+$)', '', 'g'
      ) as canonical_key
    from source_values
    where btrim(value) <> ''
  ), deduplicated as (
    select distinct on (canonical_key) value, position
    from normalized
    where canonical_key <> ''
    order by canonical_key, position
  )
  select coalesce(string_agg(value, ' ' order by position), '')
  from deduplicated
$$;

create or replace function public.kc_posts_feed_metadata_search_text(p_metadata jsonb)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(concat_ws(
    ' ',
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'categoria'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'category'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'categoriaLabel'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'categoryLabel'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'subcategoria'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'subcategory'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'subcategoriaLabel'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'subcategoryLabel'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'localizacao'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'location'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'condicao'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'origem'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'destino'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'horario'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'area'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'areaLabel'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'workMode'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'workModeLabel'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'modalidadeTrabalho'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'regimeContratacao'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'employmentType'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'employmentTypeLabel'),
    public.kc_posts_search_tags_text(p_metadata),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'housingFeatureLabels'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'housingFeatureKeys'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'caronasFeatureLabels'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'caronasFeatureKeys'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'features'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'marcadoresMoradia'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'marcadoresCarona')
  ));
$$;

-- Keep this migration invisible to feed recency/audit semantics.  The access
-- exclusive lock serializes concurrent writes; DDL is transactional, so all
-- user triggers are restored if any validation or data step fails.
alter table public.posts disable trigger user;

with legacy_tags as (
  select
    p.id,
    coalesce(jsonb_agg(deduplicated.label order by deduplicated.position)
      filter (where deduplicated.tag_key <> ''), '[]'::jsonb) as user_tags,
    coalesce(jsonb_agg(deduplicated.tag_key order by deduplicated.position)
      filter (where deduplicated.tag_key <> ''), '[]'::jsonb) as user_tag_keys
  from public.posts p
  left join lateral (
    select distinct on (clean.tag_key)
      clean.label,
      clean.tag_key,
      clean.position
    from (
      select
        regexp_replace(btrim(item.value #>> '{}'), '\s+', ' ', 'g') as label,
        left(
          regexp_replace(
            regexp_replace(lower(public.kc_unaccent(btrim(item.value #>> '{}'))), '[^a-z0-9]+', '-', 'g'),
            '(^-+|-+$)', '', 'g'
          ),
          60
        ) as tag_key,
        item.position
      from jsonb_array_elements(
        case
          when jsonb_typeof(coalesce(p.metadata, '{}'::jsonb)->'tags') = 'array'
            then coalesce(p.metadata, '{}'::jsonb)->'tags'
          else '[]'::jsonb
        end
      ) with ordinality as item(value, position)
      where jsonb_typeof(item.value) = 'string'
    ) clean
    where clean.label <> ''
      and char_length(clean.label) <= 60
      and clean.tag_key <> ''
    order by clean.tag_key, clean.position
  ) deduplicated on true
  where jsonb_typeof(coalesce(p.metadata, '{}'::jsonb)) = 'object'
    and jsonb_typeof(coalesce(p.metadata, '{}'::jsonb)->'tags') = 'array'
    and not (coalesce(p.metadata, '{}'::jsonb) ? 'userTags')
  group by p.id
)
update public.posts p
set metadata = jsonb_set(
  jsonb_set(coalesce(p.metadata, '{}'::jsonb), '{userTags}', legacy_tags.user_tags, true),
  '{userTagKeys}', legacy_tags.user_tag_keys, true
)
from legacy_tags
where p.id = legacy_tags.id;

alter table public.posts enable trigger user;

-- Functional indexes retain previous values when an IMMUTABLE function is
-- replaced.  Rebuild atomically after both the function change and data copy.
reindex index public.idx_posts_fts;
reindex index public.idx_posts_feed_cursor_search_trgm;

comment on function public.kc_posts_search_tags_text(jsonb) is
  'Search text for legacy and user-managed post tags, deduplicated by canonical key so migration does not inflate ranking.';
comment on function public.kc_posts_feed_metadata_search_text(jsonb) is
  'Allowlisted public metadata mirrored from browser feed search, with a deduplicated union of legacy and user-managed post tags.';

commit;

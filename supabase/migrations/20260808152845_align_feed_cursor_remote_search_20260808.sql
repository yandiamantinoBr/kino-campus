-- Align feed cursor search with the browser-side post haystack.
--
-- The existing kc_posts_search_document() / idx_posts_fts contract remains
-- untouched. It cannot be the authoritative feed predicate: Portuguese FTS
-- does not preserve the browser's literal substring semantics (for example,
-- "camp" must match "campus"). The normalized browser-equivalent document is
-- therefore backed by pg_trgm. Metadata keys are an explicit allowlist:
-- serializing metadata itself would index private values and JSON key names,
-- producing false-positive matches.

create or replace function public.kc_posts_feed_normalize_search_text(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    lower(public.kc_unaccent(coalesce(p_value, ''))),
    '[^a-z0-9]+',
    ' ',
    'g'
  ));
$$;

create or replace function public.kc_posts_feed_search_value(p_value jsonb)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_value is null then ''
    when jsonb_typeof(p_value) in ('string', 'number', 'boolean') then p_value #>> '{}'
    when jsonb_typeof(p_value) = 'array' then coalesce((
      select string_agg(item #>> '{}', ' ' order by ordinal)
      from jsonb_array_elements(p_value) with ordinality as values_list(item, ordinal)
      where jsonb_typeof(item) in ('string', 'number', 'boolean')
    ), '')
    else ''
  end;
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
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'tags'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'tagKeys'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'housingFeatureLabels'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'housingFeatureKeys'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'caronasFeatureLabels'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'caronasFeatureKeys'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'features'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'marcadoresMoradia'),
    public.kc_posts_feed_search_value(coalesce(p_metadata, '{}'::jsonb)->'marcadoresCarona')
  ));
$$;

create or replace function public.kc_posts_feed_search_text(
  p_title text,
  p_description text,
  p_category text,
  p_location text,
  p_metadata jsonb
)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select public.kc_posts_feed_normalize_search_text(concat_ws(
    ' ',
    p_title,
    p_description,
    p_category,
    p_location,
    public.kc_posts_feed_metadata_search_text(p_metadata)
  ));
$$;

create index if not exists idx_posts_feed_cursor_search_trgm
  on public.posts using gin (
    public.kc_posts_feed_search_text(
      title,
      description,
      category,
      location,
      metadata
    ) extensions.gin_trgm_ops
  )
  where legacy_id is null;

comment on function public.kc_posts_feed_normalize_search_text(text)
  is 'Accent-insensitive feed normalization that treats punctuation and taxonomy slug separators as spaces.';
comment on function public.kc_posts_feed_search_value(jsonb)
  is 'Returns only scalar/array scalar values supplied by an explicitly selected public metadata field.';
comment on function public.kc_posts_feed_metadata_search_text(jsonb)
  is 'Allowlisted public metadata values mirrored from the browser feed search haystack; JSON key names and unrelated values are excluded.';
comment on function public.kc_posts_feed_search_text(text, text, text, text, jsonb)
  is 'Allowlisted, accent-insensitive feed text preserving browser substring semantics; indexed with pg_trgm.';

revoke all on function public.kc_posts_feed_normalize_search_text(text) from public;
revoke all on function public.kc_posts_feed_search_value(jsonb) from public;
revoke all on function public.kc_posts_feed_metadata_search_text(jsonb) from public;
revoke all on function public.kc_posts_feed_search_text(text, text, text, text, jsonb) from public;
grant execute on function public.kc_posts_feed_normalize_search_text(text)
  to anon, authenticated, service_role;
grant execute on function public.kc_posts_feed_search_value(jsonb)
  to anon, authenticated, service_role;
grant execute on function public.kc_posts_feed_metadata_search_text(jsonb)
  to anon, authenticated, service_role;
grant execute on function public.kc_posts_feed_search_text(text, text, text, text, jsonb)
  to anon, authenticated, service_role;

create or replace function public.kc_get_feed_cursor(
  p_module text default null::text,
  p_modules text[] default null::text[],
  p_category text default null::text,
  p_subcategory text default null::text,
  p_tag text default null::text,
  p_q text default null::text,
  p_sort_by text default 'recentes'::text,
  p_limit integer default 12,
  p_cursor text default null::text,
  p_request_params jsonb default null::jsonb
) returns jsonb
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 12), 50));
  v_sort text := case
    when lower(coalesce(p_sort_by, 'recentes')) = 'votos' then 'votos'
    when lower(coalesce(p_sort_by, 'recentes')) = 'comentados' then 'comentados'
    else 'recentes'
  end;
  v_module_list text[] := array[]::text[];
  v_cursor_json jsonb := null;
  v_cursor_created timestamptz := null;
  v_cursor_id uuid := null;
  v_cursor_highlight double precision := 0;
  v_cursor_votos integer := 0;
  v_cursor_last_comment timestamptz := null;
  v_cursor_effective timestamptz := null;
  v_cursor_status_priority integer := 1;
  v_posts jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_cursor text := null;
  v_date_preset text := null;
  v_price_min numeric := null;
  v_price_max numeric := null;
  v_search_text text := public.kc_posts_feed_normalize_search_text(p_q);
  v_search_like_pattern text := '%' || replace(
    replace(
      replace(v_search_text, E'\\', E'\\\\'),
      '%', E'\\%'
    ),
    '_', E'\\_'
  ) || '%';
  v_reader_role text := coalesce(auth.role(), 'anon');
  v_reader_uid uuid := auth.uid();
  v_reader_is_admin boolean := false;
begin
  if v_reader_role = 'authenticated' and v_reader_uid is not null then
    v_reader_is_admin := public.kc_is_admin(v_reader_uid);
  end if;

  if p_modules is not null and array_length(p_modules, 1) > 0 then
    select array_agg(lower(trim(value))) into v_module_list
      from unnest(p_modules) as value
     where nullif(trim(value), '') is not null;
  elsif nullif(trim(coalesce(p_module, '')), '') is not null then
    v_module_list := array[lower(trim(p_module))];
  end if;

  if p_request_params is not null then
    v_date_preset := nullif(trim(coalesce(p_request_params->>'datePreset', p_request_params->>'date_preset', '')), '');
    begin
      v_price_min := nullif(trim(coalesce(p_request_params->>'priceMin', p_request_params->>'price_min', '')), '')::numeric;
    exception when others then
      v_price_min := null;
    end;
    begin
      v_price_max := nullif(trim(coalesce(p_request_params->>'priceMax', p_request_params->>'price_max', '')), '')::numeric;
    exception when others then
      v_price_max := null;
    end;
  end if;

  if nullif(trim(coalesce(p_cursor, '')), '') is not null then
    begin
      v_cursor_json := convert_from(decode(p_cursor, 'base64'), 'utf8')::jsonb;
      v_cursor_created := nullif(v_cursor_json->>'created_at', '')::timestamptz;
      v_cursor_id := nullif(v_cursor_json->>'id', '')::uuid;
      v_cursor_highlight := coalesce(nullif(v_cursor_json->>'highlight_score', '')::double precision, 0);
      v_cursor_votos := coalesce(nullif(v_cursor_json->>'votos', '')::integer, 0);
      v_cursor_last_comment := nullif(v_cursor_json->>'last_comment_at', '')::timestamptz;
      v_cursor_effective := coalesce(
        nullif(v_cursor_json->>'effective_at', '')::timestamptz,
        nullif(v_cursor_json->>'bumped_at', '')::timestamptz,
        v_cursor_created
      );
      v_cursor_status_priority := coalesce(nullif(v_cursor_json->>'status_priority', '')::integer, 1);
    exception when others then
      v_cursor_json := null;
    end;
  end if;

  with base_candidates as not materialized (
    select
      p.id,
      p.legacy_id,
      p.author_id,
      p.title,
      p.description,
      p.price,
      p.location,
      p.module,
      p.category,
      p.status,
      p.visibility,
      case when p.status = 'closed' then 0 else 1 end as status_priority,
      coalesce(p.metadata, '{}'::jsonb) as metadata,
      p.created_at,
      coalesce(p.votos, 0) as votos,
      coalesce(p.highlight_score, 0) as highlight_score,
      p.bumped_at,
      coalesce(p.bumped_at, p.created_at) as effective_at,
      p.last_comment_at
    from public.posts p
    where p.legacy_id is null
      and p.status in ('published', 'closed')
      -- Preserve kc_can_read_post semantics under the published/closed
      -- predicate while resolving role, uid and admin status only once.
      and (
        (
          v_reader_role = 'authenticated'
          and (
            coalesce(p.visibility, 'public') in ('public', 'community')
            or p.author_id = v_reader_uid
            or v_reader_is_admin
          )
        )
        or (v_reader_role <> 'authenticated' and coalesce(p.visibility, 'public') = 'public')
      )
      and (coalesce(array_length(v_module_list, 1), 0) = 0 or lower(coalesce(p.module, '')) = any(v_module_list))
      and (p_category is null or lower(coalesce(p.category, '')) = lower(p_category))
      and (
        p_subcategory is null
        or lower(coalesce(
          p.metadata->>'subcategory',
          p.metadata->>'subcategoria',
          p.metadata->>'subcategoryKey',
          p.metadata->>'subcategoriaKey',
          ''
        )) = lower(p_subcategory)
      )
      and (
        p_tag is null
        or coalesce(p.metadata->'tagKeys', '[]'::jsonb) @> jsonb_build_array(lower(p_tag))
      )
      and (
        p_request_params is null
        or p_request_params = '{}'::jsonb
        or public.kc_matches_feed_request_params(
          p.module,
          p.category,
          coalesce(
            p.metadata->>'subcategory',
            p.metadata->>'subcategoria',
            p.metadata->>'subcategoryKey',
            p.metadata->>'subcategoriaKey',
            ''
          ),
          p.title,
          p.description,
          p.metadata,
          coalesce((
            select profile.verified
            from public.profiles profile
            where profile.id = p.author_id
          ), false),
          p_request_params
        )
      )
      and (
        v_date_preset is null
        or public.kc_feed_matches_date_preset(
          p.module,
          p.created_at,
          p.metadata,
          v_date_preset
        )
      )
      and (v_price_min is null or (p.price is not null and p.price >= v_price_min))
      and (v_price_max is null or (p.price is not null and p.price <= v_price_max))
      and (
        v_cursor_json is null
        or (
          v_sort = 'votos'
          and row(case when p.status = 'closed' then 0 else 1 end, coalesce(p.highlight_score, 0), coalesce(p.votos, 0), p.created_at, p.id)
              < row(v_cursor_status_priority, v_cursor_highlight, v_cursor_votos, v_cursor_created, v_cursor_id)
        )
        or (
          v_sort = 'comentados'
          and p.last_comment_at is not null
          and row(p.last_comment_at, p.created_at, p.id)
              < row(v_cursor_last_comment, v_cursor_created, v_cursor_id)
        )
        or (
          v_sort = 'recentes'
          and row(coalesce(p.bumped_at, p.created_at), p.created_at, p.id)
              < row(v_cursor_effective, v_cursor_created, v_cursor_id)
        )
      )
      and (v_sort <> 'comentados' or p.last_comment_at is not null)
  ),
  filtered as (
    -- Mutually exclusive branches keep the no-query hot path identical to the
    -- previous cursor and expose LIKE as a top-level trigram condition in the
    -- search path, including after PostgreSQL switches to a generic plan.
    select *
    from base_candidates
    where v_search_text = ''

    union all

    select *
    from base_candidates
    where v_search_text <> ''
      and public.kc_posts_feed_search_text(
        title,
        description,
        category,
        location,
        metadata
      ) like v_search_like_pattern escape E'\\'
      -- position() remains the authoritative browser-equivalent predicate.
      and position(
        v_search_text in public.kc_posts_feed_search_text(
          title,
          description,
          category,
          location,
          metadata
        )
      ) > 0
  ),
  limited as materialized (
    select *
    from filtered
    order by
      case when v_sort = 'votos' then status_priority end desc nulls last,
      case when v_sort = 'votos' then highlight_score end desc nulls last,
      case when v_sort = 'votos' then votos end desc nulls last,
      case when v_sort = 'comentados' then last_comment_at end desc nulls last,
      case when v_sort = 'recentes' then effective_at end desc nulls last,
      created_at desc,
      id desc
    limit v_limit + 1
  ),
  kept as materialized (
    select *
    from limited
    order by
      case when v_sort = 'votos' then status_priority end desc nulls last,
      case when v_sort = 'votos' then highlight_score end desc nulls last,
      case when v_sort = 'votos' then votos end desc nulls last,
      case when v_sort = 'comentados' then last_comment_at end desc nulls last,
      case when v_sort = 'recentes' then effective_at end desc nulls last,
      created_at desc,
      id desc
    limit v_limit
  ),
  cursor_row as (
    select *
    from kept
    order by
      case when v_sort = 'votos' then status_priority end desc nulls last,
      case when v_sort = 'votos' then highlight_score end desc nulls last,
      case when v_sort = 'votos' then votos end desc nulls last,
      case when v_sort = 'comentados' then last_comment_at end desc nulls last,
      case when v_sort = 'recentes' then effective_at end desc nulls last,
      created_at desc,
      id desc
    offset greatest(v_limit - 1, 0)
    limit 1
  ),
  enriched as (
    select
      kept.*,
      case
        when pr.id is null then null
        else jsonb_build_object(
          'id', pr.id,
          'display_name', pr.display_name,
          'full_name', pr.full_name,
          'avatar_url', pr.avatar_url,
          'verified', coalesce(pr.verified, false)
        )
      end as profile_payload,
      coalesce(pm.items, '[]'::jsonb) as media_payload,
      coalesce(cc.comment_count, 0) as comment_count
    from kept
    left join public.profiles pr on pr.id = kept.author_id
    left join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('id', m.id, 'url', m.url, 'is_cover', m.is_cover)
          order by m.is_cover desc, m.id asc
        ),
        '[]'::jsonb
      ) as items
      from public.post_media m
      where m.post_id = kept.id
    ) pm on true
    left join lateral (
      select count(*)::int as comment_count
      from public.comments c
      where c.post_id = kept.id
    ) cc on true
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', enriched.id,
          'legacy_id', enriched.legacy_id,
          'author_id', enriched.author_id,
          'title', enriched.title,
          'description', enriched.description,
          'price', enriched.price,
          'location', enriched.location,
          'module', enriched.module,
          'category', enriched.category,
          'status', enriched.status,
          'visibility', enriched.visibility,
          'metadata', enriched.metadata,
          'created_at', enriched.created_at,
          'votos', enriched.votos,
          'highlight_score', enriched.highlight_score,
          'bumped_at', enriched.bumped_at,
          'effective_at', enriched.effective_at,
          'last_comment_at', enriched.last_comment_at,
          'profiles', enriched.profile_payload,
          'post_media', enriched.media_payload,
          'comments', jsonb_build_array(jsonb_build_object('count', enriched.comment_count))
        )
        order by
          case when v_sort = 'votos' then enriched.status_priority end desc nulls last,
          case when v_sort = 'votos' then enriched.highlight_score end desc nulls last,
          case when v_sort = 'votos' then enriched.votos end desc nulls last,
          case when v_sort = 'comentados' then enriched.last_comment_at end desc nulls last,
          case when v_sort = 'recentes' then enriched.effective_at end desc nulls last,
          enriched.created_at desc,
          enriched.id desc
      ),
      '[]'::jsonb
    ),
    (select count(*) > v_limit from limited),
    case
      when (select count(*) > v_limit from limited) then (
        select encode(
          convert_to(
            jsonb_build_object(
              'sort', v_sort,
              'status_priority', cursor_row.status_priority,
              'highlight_score', cursor_row.highlight_score,
              'votos', cursor_row.votos,
              'last_comment_at', cursor_row.last_comment_at,
              'effective_at', cursor_row.effective_at,
              'bumped_at', cursor_row.bumped_at,
              'created_at', cursor_row.created_at,
              'id', cursor_row.id
            )::text,
            'utf8'
          ),
          'base64'
        )
        from cursor_row
      )
      else null
    end
    into v_posts, v_has_more, v_next_cursor
  from enriched;

  return jsonb_build_object(
    'ok', true,
    'posts', coalesce(v_posts, '[]'::jsonb),
    'hasMore', coalesce(v_has_more, false),
    'has_more', coalesce(v_has_more, false),
    'nextCursor', v_next_cursor,
    'next_cursor', v_next_cursor
  );
end;
$$;

comment on function public.kc_get_feed_cursor(
  text, text[], text, text, text, text, text, integer, text, jsonb
) is 'Cursor feed with bounded enrichment and accent-insensitive indexed search across content, taxonomy, location and metadata.';

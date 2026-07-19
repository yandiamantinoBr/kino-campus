-- Performance hardening for the two highest-cost public read RPCs, plus a
-- database-level idempotency guard for Cadu publications.
--
-- The function signatures, return payloads and grants are intentionally kept
-- unchanged.  Media/comment enrichment now runs only for the page selected by
-- LIMIT, and FTS uses the exact immutable expression behind idx_posts_fts.

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

  with filtered as (
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
        coalesce(nullif(btrim(p_q), ''), null) is null
        or p.title ilike '%' || btrim(p_q) || '%'
        or p.description ilike '%' || btrim(p_q) || '%'
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
) is 'Cursor feed with bounded post-selection before profile/media/comment payload enrichment.';

create or replace function public.kc_search_posts_fts(
  p_q text default null::text,
  p_terms text[] default null::text[],
  p_module text default null::text,
  p_category text default null::text,
  p_subcategory text default null::text,
  p_limit integer default 50
) returns setof jsonb
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 50));
  v_terms text[] := array(
    select distinct lower(btrim(public.kc_unaccent(term)))
    from unnest(coalesce(p_terms, array[]::text[])) as term
    where term is not null and btrim(term) <> ''
  );
  v_fuzzy_terms text[] := array(
    select distinct lower(btrim(public.kc_unaccent(term)))
    from regexp_split_to_table(coalesce(p_q, ''), '\s+') as term
    where term is not null and btrim(term) <> ''
  );
  v_query_text text := null;
  v_query tsquery := null;
begin
  if coalesce(btrim(p_q), '') = '' then
    return;
  end if;

  if coalesce(array_length(v_terms, 1), 0) = 0 then
    v_terms := array[lower(btrim(public.kc_unaccent(p_q)))];
  end if;

  if coalesce(array_length(v_fuzzy_terms, 1), 0) = 0 then
    v_fuzzy_terms := array[lower(btrim(public.kc_unaccent(p_q)))];
  end if;

  select string_agg('(' || prepared.query_text || ')', ' | ')
    into v_query_text
  from (
    select nullif(plainto_tsquery('portuguese', term)::text, '') as query_text
    from unnest(v_terms) as term
  ) as prepared
  where prepared.query_text is not null;

  if coalesce(v_query_text, '') = '' then
    return;
  end if;

  v_query := v_query_text::tsquery;

  return query
  with fts_source as (
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
      coalesce(p.metadata, '{}'::jsonb) as metadata,
      p.created_at,
      coalesce(p.votos, 0) as votos,
      coalesce(p.highlight_score, 0)::double precision as highlight_score,
      p.bumped_at,
      p.last_comment_at,
      public.kc_posts_search_document(p.title, p.description, p.category, p.metadata) as search_document,
      lower(public.kc_unaccent(concat_ws(
        ' ',
        p.title,
        p.module,
        p.category,
        public.kc_posts_search_subcategory(p.metadata),
        public.kc_posts_search_tags_text(p.metadata)
      ))) as fuzzy_text
    from public.posts p
    where p.legacy_id is null
      and (p_module is null or lower(coalesce(p.module, '')) = lower(p_module))
      and (
        p_category is null
        or lower(public.kc_unaccent(coalesce(p.category, ''))) = lower(public.kc_unaccent(p_category))
      )
      and (
        p_subcategory is null
        or lower(public.kc_unaccent(public.kc_posts_search_subcategory(p.metadata)))
          = lower(public.kc_unaccent(p_subcategory))
      )
      -- Keep this expression byte-for-byte compatible with idx_posts_fts.
      and public.kc_posts_search_document(p.title, p.description, p.category, p.metadata) @@ v_query
  ),
  fts_matches as materialized (
    select
      fts_source.*,
      ts_rank_cd(fts_source.search_document, v_query) as search_rank,
      coalesce(fuzzy.fuzzy_sim, 0)::double precision as fuzzy_sim,
      true as is_fts
    from fts_source
    left join lateral (
      select max(extensions.word_similarity(term, fts_source.fuzzy_text)) as fuzzy_sim
      from unnest(v_fuzzy_terms) as term
      where length(term) >= 4
    ) fuzzy on true
    order by
      ts_rank_cd(fts_source.search_document, v_query) desc,
      coalesce(fuzzy.fuzzy_sim, 0) desc,
      fts_source.created_at desc,
      fts_source.id desc
    limit v_limit
  ),
  fts_count as (
    select count(*)::int as value from fts_matches
  ),
  fuzzy_source as (
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
      coalesce(p.metadata, '{}'::jsonb) as metadata,
      p.created_at,
      coalesce(p.votos, 0) as votos,
      coalesce(p.highlight_score, 0)::double precision as highlight_score,
      p.bumped_at,
      p.last_comment_at,
      lower(public.kc_unaccent(concat_ws(
        ' ',
        p.title,
        p.module,
        p.category,
        public.kc_posts_search_subcategory(p.metadata),
        public.kc_posts_search_tags_text(p.metadata)
      ))) as fuzzy_text
    from fts_count
    cross join lateral (
      select candidate.*
      from public.posts candidate
      where fts_count.value < v_limit
        and candidate.legacy_id is null
        and (p_module is null or lower(coalesce(candidate.module, '')) = lower(p_module))
        and (
          p_category is null
          or lower(public.kc_unaccent(coalesce(candidate.category, ''))) = lower(public.kc_unaccent(p_category))
        )
        and (
          p_subcategory is null
          or lower(public.kc_unaccent(public.kc_posts_search_subcategory(candidate.metadata)))
            = lower(public.kc_unaccent(p_subcategory))
        )
        and not exists (select 1 from fts_matches where fts_matches.id = candidate.id)
    ) p
  ),
  fuzzy_matches as materialized (
    select
      fuzzy_source.id,
      fuzzy_source.legacy_id,
      fuzzy_source.author_id,
      fuzzy_source.title,
      fuzzy_source.description,
      fuzzy_source.price,
      fuzzy_source.location,
      fuzzy_source.module,
      fuzzy_source.category,
      fuzzy_source.status,
      fuzzy_source.visibility,
      fuzzy_source.metadata,
      fuzzy_source.created_at,
      fuzzy_source.votos,
      fuzzy_source.highlight_score,
      fuzzy_source.bumped_at,
      fuzzy_source.last_comment_at,
      null::tsvector as search_document,
      fuzzy_source.fuzzy_text,
      0::real as search_rank,
      fuzzy.fuzzy_sim::double precision as fuzzy_sim,
      false as is_fts
    from fuzzy_source
    cross join lateral (
      select coalesce(max(extensions.word_similarity(term, fuzzy_source.fuzzy_text)), 0) as fuzzy_sim
      from unnest(v_fuzzy_terms) as term
      where length(term) >= 4
    ) fuzzy
    where fuzzy.fuzzy_sim >= 0.68
    order by fuzzy.fuzzy_sim desc, fuzzy_source.created_at desc, fuzzy_source.id desc
    limit greatest(v_limit - (select value from fts_count), 0)
  ),
  selected as materialized (
    select * from fts_matches
    union all
    select * from fuzzy_matches
  ),
  enriched as (
    select
      selected.*,
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
    from selected
    left join public.profiles pr on pr.id = selected.author_id
    left join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'url', m.url,
            'is_cover', m.is_cover
          )
          order by m.is_cover desc, m.id asc
        ),
        '[]'::jsonb
      ) as items
      from public.post_media m
      where m.post_id = selected.id
    ) pm on true
    left join lateral (
      select count(*)::int as comment_count
      from public.comments c
      where c.post_id = selected.id
    ) cc on true
  )
  select jsonb_build_object(
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
    'last_comment_at', enriched.last_comment_at,
    'profiles', enriched.profile_payload,
    'post_media', enriched.media_payload,
    'comments', jsonb_build_array(jsonb_build_object('count', enriched.comment_count))
  )
  from enriched
  order by
    enriched.is_fts desc,
    enriched.search_rank desc,
    enriched.fuzzy_sim desc,
    enriched.created_at desc,
    enriched.id desc
  limit v_limit;
end;
$$;

comment on function public.kc_search_posts_fts(
  text, text[], text, text, text, integer
) is 'Index-first Portuguese FTS; fuzzy matching only fills remaining slots and payload enrichment runs after LIMIT.';

-- Abort loudly instead of silently choosing a winner if historical active
-- duplicates ever appear before the unique index is installed.
do $$
declare
  v_duplicates jsonb;
begin
  select jsonb_agg(to_jsonb(sample))
    into v_duplicates
  from (
    select
      author_id,
      btrim(metadata->>'source_id') as source_id,
      count(*) as row_count,
      array_agg(id order by created_at, id) as post_ids
    from public.posts
    where status in ('published', 'closed', 'pending')
      and author_id is not null
      and nullif(btrim(metadata->>'source_id'), '') is not null
    group by author_id, btrim(metadata->>'source_id')
    having count(*) > 1
    order by count(*) desc, author_id, btrim(metadata->>'source_id')
    limit 20
  ) sample;

  if v_duplicates is not null then
    raise exception using
      errcode = '23505',
      message = 'Cannot install posts_active_author_source_id_uidx: active Cadu source_id duplicates exist.',
      detail = v_duplicates::text,
      hint = 'Resolve each active duplicate group explicitly, then rerun the migration.';
  end if;
end;
$$;

create unique index if not exists posts_active_author_source_id_uidx
  on public.posts (author_id, (btrim(metadata->>'source_id')))
  where status in ('published', 'closed', 'pending')
    and author_id is not null
    and nullif(btrim(metadata->>'source_id'), '') is not null;

comment on index public.posts_active_author_source_id_uidx is
  'Race-safe Cadu idempotency for active posts; deleted/hidden/expired history remains unconstrained.';

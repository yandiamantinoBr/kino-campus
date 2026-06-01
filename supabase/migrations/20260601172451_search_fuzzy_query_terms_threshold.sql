-- KinoCampus 2026-06-01
-- Tighten server-side fuzzy search after validating production data.
--
-- Exact FTS still receives the expanded synonym terms sent by the client.
-- Fuzzy pg_trgm matching, however, must use only the user's raw query terms:
-- semantic expansions such as "congresso" are useful as exact terms, but are
-- too broad for fuzzy matching ("congresso" can look similar to "ingresso").

begin;

create or replace function public.kc_search_posts_fts(
  p_q text default null,
  p_terms text[] default null,
  p_module text default null,
  p_category text default null,
  p_subcategory text default null,
  p_limit integer default 50
)
returns setof jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
DECLARE
  v_limit INT := GREATEST(1, LEAST(COALESCE(p_limit, 50), 50));
  v_terms TEXT[] := ARRAY(
    SELECT DISTINCT lower(btrim(public.kc_unaccent(term)))
    FROM unnest(COALESCE(p_terms, ARRAY[]::TEXT[])) AS term
    WHERE term IS NOT NULL AND btrim(term) <> ''
  );
  v_fuzzy_terms TEXT[] := ARRAY(
    SELECT DISTINCT lower(btrim(public.kc_unaccent(term)))
    FROM regexp_split_to_table(COALESCE(p_q, ''), '\s+') AS term
    WHERE term IS NOT NULL AND btrim(term) <> ''
  );
  v_query_text TEXT := NULL;
  v_query tsquery := NULL;
BEGIN
  IF COALESCE(btrim(p_q), '') = '' THEN
    RETURN;
  END IF;

  IF COALESCE(array_length(v_terms, 1), 0) = 0 THEN
    v_terms := ARRAY[lower(btrim(public.kc_unaccent(p_q)))];
  END IF;

  IF COALESCE(array_length(v_fuzzy_terms, 1), 0) = 0 THEN
    v_fuzzy_terms := ARRAY[lower(btrim(public.kc_unaccent(p_q)))];
  END IF;

  SELECT string_agg('(' || prepared.query_text || ')', ' | ')
  INTO v_query_text
  FROM (
    SELECT NULLIF(plainto_tsquery('portuguese', term)::TEXT, '') AS query_text
    FROM unnest(v_terms) AS term
  ) AS prepared
  WHERE prepared.query_text IS NOT NULL;

  IF COALESCE(v_query_text, '') = '' THEN
    RETURN;
  END IF;

  v_query := v_query_text::tsquery;

  RETURN QUERY
  WITH ranked AS (
    SELECT
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
      COALESCE(p.metadata, '{}'::jsonb) AS metadata,
      p.created_at,
      COALESCE(p.votos, 0) AS votos,
      COALESCE(p.highlight_score, 0)::DOUBLE PRECISION AS highlight_score,
      p.bumped_at,
      p.last_comment_at,
      public.kc_posts_search_document(p.title, p.description, p.category, COALESCE(p.metadata, '{}'::jsonb)) AS search_document,
      lower(public.kc_unaccent(concat_ws(
        ' ',
        p.title,
        p.module,
        p.category,
        public.kc_posts_search_subcategory(COALESCE(p.metadata, '{}'::jsonb)),
        public.kc_posts_search_tags_text(COALESCE(p.metadata, '{}'::jsonb))
      ))) AS fuzzy_text,
      CASE
        WHEN pr.id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'id', pr.id,
          'display_name', pr.display_name,
          'full_name', pr.full_name,
          'avatar_url', pr.avatar_url,
          'verified', COALESCE(pr.verified, false)
        )
      END AS profile_payload,
      COALESCE(pm.items, '[]'::jsonb) AS media_payload,
      COALESCE(cc.comment_count, 0) AS comment_count
    FROM public.posts AS p
    LEFT JOIN public.profiles AS pr
      ON pr.id = p.author_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'url', m.url,
            'is_cover', m.is_cover
          )
          ORDER BY m.is_cover DESC, m.id ASC
        ),
        '[]'::jsonb
      ) AS items
      FROM public.post_media AS m
      WHERE m.post_id = p.id
    ) AS pm ON TRUE
    LEFT JOIN LATERAL (
      SELECT count(*)::INT AS comment_count
      FROM public.comments AS c
      WHERE c.post_id = p.id
    ) AS cc ON TRUE
    WHERE p.legacy_id IS NULL
      AND (p_module IS NULL OR lower(COALESCE(p.module, '')) = lower(p_module))
      AND (
        p_category IS NULL
        OR lower(public.kc_unaccent(COALESCE(p.category, ''))) = lower(public.kc_unaccent(p_category))
      )
      AND (
        p_subcategory IS NULL
        OR lower(public.kc_unaccent(public.kc_posts_search_subcategory(COALESCE(p.metadata, '{}'::jsonb))))
          = lower(public.kc_unaccent(p_subcategory))
      )
  ),
  matched AS (
    SELECT
      ranked.*,
      ts_rank_cd(ranked.search_document, v_query) AS search_rank,
      (
        SELECT COALESCE(max(extensions.word_similarity(t, ranked.fuzzy_text)), 0)
        FROM unnest(v_fuzzy_terms) AS t
        WHERE length(t) >= 4
      ) AS fuzzy_sim,
      (ranked.search_document @@ v_query) AS is_fts
    FROM ranked
    WHERE ranked.search_document @@ v_query
       OR EXISTS (
         SELECT 1 FROM unnest(v_fuzzy_terms) AS t
         WHERE length(t) >= 4
           AND extensions.word_similarity(t, ranked.fuzzy_text) >= 0.68
       )
  )
  SELECT jsonb_build_object(
    'id', matched.id,
    'legacy_id', matched.legacy_id,
    'author_id', matched.author_id,
    'title', matched.title,
    'description', matched.description,
    'price', matched.price,
    'location', matched.location,
    'module', matched.module,
    'category', matched.category,
    'status', matched.status,
    'visibility', matched.visibility,
    'metadata', matched.metadata,
    'created_at', matched.created_at,
    'votos', matched.votos,
    'highlight_score', matched.highlight_score,
    'bumped_at', matched.bumped_at,
    'last_comment_at', matched.last_comment_at,
    'profiles', matched.profile_payload,
    'post_media', matched.media_payload,
    'comments', jsonb_build_array(jsonb_build_object('count', matched.comment_count))
  )
  FROM matched
  ORDER BY matched.is_fts DESC, matched.search_rank DESC, matched.fuzzy_sim DESC, matched.created_at DESC, matched.id DESC
  LIMIT v_limit;
END;
$function$;

create or replace function kc_private.kc_admin_search_trends_classified(
  p_limit integer default 10,
  p_since timestamptz default null
)
returns table (
  term text,
  count bigint,
  module text,
  module_confidence numeric
)
language sql
security definer
set search_path = 'public'
as $$
  with trends as (
    select lower(btrim(sq.term)) as term, count(*)::bigint as count
    from public.search_queries sq
    where sq.created_at >= coalesce(p_since, now() - interval '30 days')
      and length(btrim(sq.term)) >= 1
    group by lower(btrim(sq.term))
    order by count desc
    limit greatest(coalesce(p_limit, 10), 1)
  ),
  posts_semantic as (
    select
      p.id,
      p.module,
      p.title,
      p.description,
      lower(public.kc_unaccent(concat_ws(
        ' ',
        p.title,
        p.module,
        p.category,
        public.kc_posts_search_subcategory(coalesce(p.metadata, '{}'::jsonb)),
        public.kc_posts_search_tags_text(coalesce(p.metadata, '{}'::jsonb))
      ))) as fuzzy_text
    from public.posts p
    where p.status in ('published', 'closed')
  ),
  matched as (
    select t.term, p.module, count(*)::bigint as posts
    from trends t
    join posts_semantic p
      on length(t.term) >= 3
     and (
       p.title ilike '%' || t.term || '%'
       or p.description ilike '%' || t.term || '%'
       or (length(t.term) >= 4 and extensions.word_similarity(t.term, p.fuzzy_text) >= 0.68)
     )
    group by t.term, p.module
  ),
  ranked as (
    select
      term, module, posts,
      sum(posts) over (partition by term) as total_posts,
      row_number() over (partition by term order by posts desc, module asc) as rn
    from matched
  )
  select
    t.term,
    t.count,
    r.module,
    case when r.module is not null and r.total_posts > 0
         then round(r.posts::numeric / r.total_posts, 2)
         else null end as module_confidence
  from trends t
  left join ranked r on r.term = t.term and r.rn = 1
  order by t.count desc, t.term asc;
$$;

commit;

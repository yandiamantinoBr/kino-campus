-- ============================================================
-- KinoCampus v9.2.0.0 - Busca Server-Side FTS
-- ============================================================
--
-- Entregas:
--   - extensao unaccent
--   - indice GIN ponderado para posts
--   - RPC kc_search_posts_fts
--
-- Regras:
--   - sinonimos continuam expandidos no client
--   - getPosts() permanece legado/estavel
--   - busca usa titulo, tags, descricao, categoria e subcategoria
-- ============================================================

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.kc_unaccent(input_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT public.unaccent('unaccent'::regdictionary, COALESCE(input_text, ''))
$$;

CREATE OR REPLACE FUNCTION public.kc_posts_search_subcategory(p_metadata JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(
    COALESCE(p_metadata, '{}'::jsonb)->>'subcategoria',
    COALESCE(p_metadata, '{}'::jsonb)->>'subcategory',
    COALESCE(p_metadata, '{}'::jsonb)->>'subcategoriaKey',
    COALESCE(p_metadata, '{}'::jsonb)->>'subcategoryKey',
    ''
  )
$$;

CREATE OR REPLACE FUNCTION public.kc_posts_search_tags_text(p_metadata JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT trim(BOTH ' ' FROM concat_ws(
    ' ',
    COALESCE((
      SELECT string_agg(value, ' ')
      FROM jsonb_array_elements_text(COALESCE(COALESCE(p_metadata, '{}'::jsonb)->'tags', '[]'::jsonb)) AS value
    ), ''),
    COALESCE((
      SELECT string_agg(value, ' ')
      FROM jsonb_array_elements_text(COALESCE(COALESCE(p_metadata, '{}'::jsonb)->'tagKeys', '[]'::jsonb)) AS value
    ), '')
  ))
$$;

CREATE OR REPLACE FUNCTION public.kc_posts_search_document(
  p_title TEXT,
  p_description TEXT,
  p_category TEXT,
  p_metadata JSONB
)
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT
    setweight(to_tsvector('portuguese', public.kc_unaccent(COALESCE(p_title, ''))), 'A')
    || setweight(to_tsvector('portuguese', public.kc_unaccent(public.kc_posts_search_tags_text(p_metadata))), 'B')
    || setweight(to_tsvector('portuguese', public.kc_unaccent(COALESCE(p_description, ''))), 'C')
    || setweight(to_tsvector('portuguese', public.kc_unaccent(COALESCE(p_category, ''))), 'D')
    || setweight(to_tsvector('portuguese', public.kc_unaccent(public.kc_posts_search_subcategory(p_metadata))), 'D')
$$;

CREATE INDEX IF NOT EXISTS idx_posts_fts
ON public.posts
USING GIN (public.kc_posts_search_document(title, description, category, metadata))
WHERE legacy_id IS NULL;

CREATE OR REPLACE FUNCTION public.kc_search_posts_fts(
  p_q TEXT DEFAULT NULL,
  p_terms TEXT[] DEFAULT NULL,
  p_module TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_subcategory TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS SETOF JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_limit INT := GREATEST(1, LEAST(COALESCE(p_limit, 50), 50));
  v_terms TEXT[] := ARRAY(
    SELECT DISTINCT lower(btrim(public.kc_unaccent(term)))
    FROM unnest(COALESCE(p_terms, ARRAY[]::TEXT[])) AS term
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
      ts_rank_cd(ranked.search_document, v_query) AS search_rank
    FROM ranked
    WHERE ranked.search_document @@ v_query
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
  ORDER BY matched.search_rank DESC, matched.created_at DESC, matched.id DESC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kc_search_posts_fts(TEXT, TEXT[], TEXT, TEXT, TEXT, INT) TO anon;
GRANT EXECUTE ON FUNCTION public.kc_search_posts_fts(TEXT, TEXT[], TEXT, TEXT, TEXT, INT) TO authenticated;

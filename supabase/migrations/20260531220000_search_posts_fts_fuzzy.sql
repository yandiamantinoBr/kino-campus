-- KinoCampus 2026-05-31
-- Busca pública tolerante a erros de digitação (produção).
--
-- A busca de produção é o RPC kc_search_posts_fts (full-text search por lexemas):
-- termos digitados errado ("conpex") não casam o lexema certo ("conpeex"). Os
-- sinônimos já chegam via p_terms (expansão no cliente), mas faltava o fuzzy.
--
-- Esta migration adiciona um caminho FUZZY por trigrama (pg_trgm word_similarity
-- sobre o título — que tem índice trigram), ANEXADO ao FTS: os matches exatos do
-- FTS continuam idênticos e no topo; matches só-fuzzy entram depois, ordenados pela
-- similaridade. word_similarity vive no schema `extensions` (search_path da função
-- é 'public'), por isso a chamada é qualificada. create or replace (assinatura igual).

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
      ts_rank_cd(ranked.search_document, v_query) AS search_rank,
      (
        SELECT COALESCE(max(extensions.word_similarity(t, COALESCE(ranked.title, ''))), 0)
        FROM unnest(v_terms) AS t
        WHERE length(t) >= 4
      ) AS fuzzy_sim,
      (ranked.search_document @@ v_query) AS is_fts
    FROM ranked
    WHERE ranked.search_document @@ v_query
       OR EXISTS (
         SELECT 1 FROM unnest(v_terms) AS t
         WHERE length(t) >= 4
           AND extensions.word_similarity(t, COALESCE(ranked.title, '')) >= 0.5
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

commit;

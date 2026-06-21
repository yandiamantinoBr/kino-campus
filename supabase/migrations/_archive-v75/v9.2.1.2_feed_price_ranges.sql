-- ============================================================
-- KinoCampus v9.2.1.2 - Faixas de preco no feed incremental
-- ============================================================
--
-- Objetivo:
--   - Adicionar suporte server-side a priceMin / priceMax no
--     kc_get_feed_cursor
--   - Preservar kc_matches_feed_request_params como helper
--     exclusivamente textual/categorial
--   - Manter ordenacao, cursor e contrato JSON atuais
-- ============================================================

CREATE OR REPLACE FUNCTION public.kc_feed_parse_numeric_text(p_value TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_clean TEXT := regexp_replace(COALESCE(p_value, ''), '[^0-9,.\-]', '', 'g');
BEGIN
  IF v_clean = '' THEN
    RETURN NULL;
  END IF;

  IF position(',' IN v_clean) > 0 AND position('.' IN v_clean) > 0 THEN
    IF strpos(v_clean, ',') > strpos(v_clean, '.') THEN
      v_clean := replace(v_clean, '.', '');
      v_clean := replace(v_clean, ',', '.');
    ELSE
      v_clean := replace(v_clean, ',', '');
    END IF;
  ELSIF position(',' IN v_clean) > 0 THEN
    v_clean := replace(v_clean, ',', '.');
  END IF;

  BEGIN
    RETURN NULLIF(v_clean, '')::NUMERIC;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.kc_get_feed_cursor(
  p_module         TEXT DEFAULT NULL,
  p_modules        TEXT[] DEFAULT NULL,
  p_category       TEXT DEFAULT NULL,
  p_subcategory    TEXT DEFAULT NULL,
  p_tag            TEXT DEFAULT NULL,
  p_q              TEXT DEFAULT NULL,
  p_sort_by        TEXT DEFAULT 'recentes',
  p_limit          INT DEFAULT 12,
  p_cursor         TEXT DEFAULT NULL,
  p_request_params JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
STABLE
AS $$
DECLARE
  v_limit INT := GREATEST(1, LEAST(COALESCE(p_limit, 12), 50));
  v_sort TEXT := CASE
    WHEN lower(coalesce(p_sort_by, 'recentes')) = 'votos' THEN 'votos'
    WHEN lower(coalesce(p_sort_by, 'recentes')) = 'comentados' THEN 'comentados'
    ELSE 'recentes'
  END;
  v_module_list TEXT[] := ARRAY[]::TEXT[];
  v_cursor_json JSONB := NULL;
  v_cursor_created TIMESTAMPTZ := NULL;
  v_cursor_id UUID := NULL;
  v_cursor_highlight DOUBLE PRECISION := 0;
  v_cursor_votos INTEGER := 0;
  v_cursor_last_comment TIMESTAMPTZ := NULL;
  v_cursor_bumped TIMESTAMPTZ := NULL;
  v_price_min NUMERIC := public.kc_feed_parse_numeric_text(COALESCE(p_request_params->>'priceMin', ''));
  v_price_max NUMERIC := public.kc_feed_parse_numeric_text(COALESCE(p_request_params->>'priceMax', ''));
  v_price_swap NUMERIC := NULL;
  v_posts JSONB := '[]'::JSONB;
  v_has_more BOOLEAN := FALSE;
  v_next_cursor TEXT := NULL;
BEGIN
  IF v_price_min IS NOT NULL AND v_price_max IS NOT NULL AND v_price_max < v_price_min THEN
    v_price_swap := v_price_min;
    v_price_min := v_price_max;
    v_price_max := v_price_swap;
  END IF;

  v_module_list := ARRAY(
    SELECT DISTINCT lower(trim(value))
    FROM unnest(
      CASE
        WHEN p_modules IS NOT NULL AND array_length(p_modules, 1) > 0 THEN p_modules
        WHEN p_module IS NOT NULL AND btrim(p_module) <> '' THEN ARRAY[p_module]
        ELSE ARRAY[]::TEXT[]
      END
    ) AS value
    WHERE value IS NOT NULL AND btrim(value) <> ''
  );

  IF p_cursor IS NOT NULL AND btrim(p_cursor) <> '' THEN
    BEGIN
      v_cursor_json := convert_from(decode(p_cursor, 'base64'), 'utf8')::JSONB;
      IF coalesce(v_cursor_json->>'sort', '') <> v_sort THEN
        RETURN jsonb_build_object('ok', false, 'error', 'INVALID_CURSOR');
      END IF;
      v_cursor_created := NULLIF(v_cursor_json->>'created_at', '')::TIMESTAMPTZ;
      v_cursor_id := NULLIF(v_cursor_json->>'id', '')::UUID;

      IF v_sort = 'votos' THEN
        v_cursor_highlight := COALESCE((v_cursor_json->>'highlight_score')::DOUBLE PRECISION, 0);
        v_cursor_votos := COALESCE((v_cursor_json->>'votos')::INTEGER, 0);
      ELSIF v_sort = 'comentados' THEN
        v_cursor_last_comment := NULLIF(v_cursor_json->>'last_comment_at', '')::TIMESTAMPTZ;
      ELSE
        v_cursor_bumped := NULLIF(v_cursor_json->>'bumped_at', '')::TIMESTAMPTZ;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_CURSOR');
    END;
  END IF;

  IF v_sort = 'votos' THEN
    WITH filtered AS (
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
        COALESCE(p.highlight_score, 0)::DOUBLE PRECISION AS sort_highlight,
        p.bumped_at,
        p.last_comment_at,
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
      FROM public.posts p
      LEFT JOIN public.profiles pr
        ON pr.id = p.author_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object('id', m.id, 'url', m.url, 'is_cover', m.is_cover)
            ORDER BY m.is_cover DESC, m.id ASC
          ),
          '[]'::jsonb
        ) AS items
        FROM public.post_media m
        WHERE m.post_id = p.id
      ) pm ON TRUE
      LEFT JOIN LATERAL (
        SELECT count(*)::INT AS comment_count
        FROM public.comments c
        WHERE c.post_id = p.id
      ) cc ON TRUE
      WHERE p.legacy_id IS NULL
        AND (COALESCE(array_length(v_module_list, 1), 0) = 0 OR lower(COALESCE(p.module, '')) = ANY(v_module_list))
        AND (p_category IS NULL OR lower(COALESCE(p.category, '')) = lower(p_category))
        AND (
          p_subcategory IS NULL
          OR lower(COALESCE(
            p.metadata->>'subcategory',
            p.metadata->>'subcategoria',
            p.metadata->>'subcategoryKey',
            p.metadata->>'subcategoriaKey',
            ''
          )) = lower(p_subcategory)
        )
        AND (
          p_tag IS NULL
          OR COALESCE(p.metadata->'tagKeys', '[]'::jsonb) @> jsonb_build_array(lower(p_tag))
        )
        AND (
          COALESCE(NULLIF(btrim(p_q), ''), NULL) IS NULL
          OR p.title ILIKE '%' || btrim(p_q) || '%'
          OR p.description ILIKE '%' || btrim(p_q) || '%'
        )
        AND public.kc_matches_feed_request_params(
          p.module,
          p.category,
          COALESCE(
            p.metadata->>'subcategory',
            p.metadata->>'subcategoria',
            p.metadata->>'subcategoryKey',
            p.metadata->>'subcategoriaKey',
            ''
          ),
          p.title,
          p.description,
          COALESCE(p.metadata, '{}'::jsonb),
          COALESCE(pr.verified, false),
          p_request_params
        )
        AND (v_price_min IS NULL OR (p.price IS NOT NULL AND p.price >= v_price_min))
        AND (v_price_max IS NULL OR (p.price IS NOT NULL AND p.price <= v_price_max))
        AND (
          v_cursor_json IS NULL
          OR ROW(COALESCE(p.highlight_score, 0)::DOUBLE PRECISION, COALESCE(p.votos, 0), p.created_at, p.id)
             < ROW(v_cursor_highlight, v_cursor_votos, v_cursor_created, v_cursor_id)
        )
      ORDER BY COALESCE(p.highlight_score, 0) DESC, COALESCE(p.votos, 0) DESC, p.created_at DESC, p.id DESC
      LIMIT v_limit + 1
    ),
    kept AS (
      SELECT * FROM filtered
      ORDER BY sort_highlight DESC, votos DESC, created_at DESC, id DESC
      LIMIT v_limit
    ),
    extra AS (
      SELECT count(*) > v_limit AS has_more FROM filtered
    ),
    cursor_row AS (
      SELECT * FROM kept
      ORDER BY sort_highlight DESC, votos DESC, created_at DESC, id DESC
      OFFSET GREATEST(v_limit - 1, 0)
      LIMIT 1
    )
    SELECT
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', kept.id,
            'legacy_id', kept.legacy_id,
            'author_id', kept.author_id,
            'title', kept.title,
            'description', kept.description,
            'price', kept.price,
            'location', kept.location,
            'module', kept.module,
            'category', kept.category,
            'status', kept.status,
            'visibility', kept.visibility,
            'metadata', kept.metadata,
            'created_at', kept.created_at,
            'votos', kept.votos,
            'highlight_score', kept.sort_highlight,
            'bumped_at', kept.bumped_at,
            'last_comment_at', kept.last_comment_at,
            'profiles', kept.profile_payload,
            'post_media', kept.media_payload,
            'comments', jsonb_build_array(jsonb_build_object('count', kept.comment_count))
          )
          ORDER BY kept.sort_highlight DESC, kept.votos DESC, kept.created_at DESC, kept.id DESC
        ),
        '[]'::jsonb
      ),
      COALESCE((SELECT has_more FROM extra), FALSE),
      CASE
        WHEN COALESCE((SELECT has_more FROM extra), FALSE) THEN (
          SELECT encode(
            convert_to(
              jsonb_build_object(
                'sort', 'votos',
                'highlight_score', cursor_row.sort_highlight,
                'votos', cursor_row.votos,
                'created_at', cursor_row.created_at,
                'id', cursor_row.id
              )::TEXT,
              'utf8'
            ),
            'base64'
          )
          FROM cursor_row
        )
        ELSE NULL
      END
    INTO v_posts, v_has_more, v_next_cursor
    FROM kept;
  ELSIF v_sort = 'comentados' THEN
    WITH filtered AS (
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
        p.highlight_score,
        p.bumped_at,
        p.last_comment_at,
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
      FROM public.posts p
      LEFT JOIN public.profiles pr
        ON pr.id = p.author_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object('id', m.id, 'url', m.url, 'is_cover', m.is_cover)
            ORDER BY m.is_cover DESC, m.id ASC
          ),
          '[]'::jsonb
        ) AS items
        FROM public.post_media m
        WHERE m.post_id = p.id
      ) pm ON TRUE
      LEFT JOIN LATERAL (
        SELECT count(*)::INT AS comment_count
        FROM public.comments c
        WHERE c.post_id = p.id
      ) cc ON TRUE
      WHERE p.legacy_id IS NULL
        AND p.last_comment_at IS NOT NULL
        AND (COALESCE(array_length(v_module_list, 1), 0) = 0 OR lower(COALESCE(p.module, '')) = ANY(v_module_list))
        AND (p_category IS NULL OR lower(COALESCE(p.category, '')) = lower(p_category))
        AND (
          p_subcategory IS NULL
          OR lower(COALESCE(
            p.metadata->>'subcategory',
            p.metadata->>'subcategoria',
            p.metadata->>'subcategoryKey',
            p.metadata->>'subcategoriaKey',
            ''
          )) = lower(p_subcategory)
        )
        AND (
          p_tag IS NULL
          OR COALESCE(p.metadata->'tagKeys', '[]'::jsonb) @> jsonb_build_array(lower(p_tag))
        )
        AND (
          COALESCE(NULLIF(btrim(p_q), ''), NULL) IS NULL
          OR p.title ILIKE '%' || btrim(p_q) || '%'
          OR p.description ILIKE '%' || btrim(p_q) || '%'
        )
        AND public.kc_matches_feed_request_params(
          p.module,
          p.category,
          COALESCE(
            p.metadata->>'subcategory',
            p.metadata->>'subcategoria',
            p.metadata->>'subcategoryKey',
            p.metadata->>'subcategoriaKey',
            ''
          ),
          p.title,
          p.description,
          COALESCE(p.metadata, '{}'::jsonb),
          COALESCE(pr.verified, false),
          p_request_params
        )
        AND (v_price_min IS NULL OR (p.price IS NOT NULL AND p.price >= v_price_min))
        AND (v_price_max IS NULL OR (p.price IS NOT NULL AND p.price <= v_price_max))
        AND (
          v_cursor_json IS NULL
          OR ROW(p.last_comment_at, p.created_at, p.id)
             < ROW(v_cursor_last_comment, v_cursor_created, v_cursor_id)
        )
      ORDER BY p.last_comment_at DESC, p.created_at DESC, p.id DESC
      LIMIT v_limit + 1
    ),
    kept AS (
      SELECT * FROM filtered
      ORDER BY last_comment_at DESC, created_at DESC, id DESC
      LIMIT v_limit
    ),
    extra AS (
      SELECT count(*) > v_limit AS has_more FROM filtered
    ),
    cursor_row AS (
      SELECT * FROM kept
      ORDER BY last_comment_at DESC, created_at DESC, id DESC
      OFFSET GREATEST(v_limit - 1, 0)
      LIMIT 1
    )
    SELECT
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', kept.id,
            'legacy_id', kept.legacy_id,
            'author_id', kept.author_id,
            'title', kept.title,
            'description', kept.description,
            'price', kept.price,
            'location', kept.location,
            'module', kept.module,
            'category', kept.category,
            'status', kept.status,
            'visibility', kept.visibility,
            'metadata', kept.metadata,
            'created_at', kept.created_at,
            'votos', kept.votos,
            'highlight_score', kept.highlight_score,
            'bumped_at', kept.bumped_at,
            'last_comment_at', kept.last_comment_at,
            'profiles', kept.profile_payload,
            'post_media', kept.media_payload,
            'comments', jsonb_build_array(jsonb_build_object('count', kept.comment_count))
          )
          ORDER BY kept.last_comment_at DESC, kept.created_at DESC, kept.id DESC
        ),
        '[]'::jsonb
      ),
      COALESCE((SELECT has_more FROM extra), FALSE),
      CASE
        WHEN COALESCE((SELECT has_more FROM extra), FALSE) THEN (
          SELECT encode(
            convert_to(
              jsonb_build_object(
                'sort', 'comentados',
                'last_comment_at', cursor_row.last_comment_at,
                'created_at', cursor_row.created_at,
                'id', cursor_row.id
              )::TEXT,
              'utf8'
            ),
            'base64'
          )
          FROM cursor_row
        )
        ELSE NULL
      END
    INTO v_posts, v_has_more, v_next_cursor
    FROM kept;
  ELSE
    WITH filtered AS (
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
        p.highlight_score,
        COALESCE(p.bumped_at, '1970-01-01 00:00:00+00'::timestamptz) AS sort_bumped,
        p.bumped_at,
        p.last_comment_at,
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
      FROM public.posts p
      LEFT JOIN public.profiles pr
        ON pr.id = p.author_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object('id', m.id, 'url', m.url, 'is_cover', m.is_cover)
            ORDER BY m.is_cover DESC, m.id ASC
          ),
          '[]'::jsonb
        ) AS items
        FROM public.post_media m
        WHERE m.post_id = p.id
      ) pm ON TRUE
      LEFT JOIN LATERAL (
        SELECT count(*)::INT AS comment_count
        FROM public.comments c
        WHERE c.post_id = p.id
      ) cc ON TRUE
      WHERE p.legacy_id IS NULL
        AND (COALESCE(array_length(v_module_list, 1), 0) = 0 OR lower(COALESCE(p.module, '')) = ANY(v_module_list))
        AND (p_category IS NULL OR lower(COALESCE(p.category, '')) = lower(p_category))
        AND (
          p_subcategory IS NULL
          OR lower(COALESCE(
            p.metadata->>'subcategory',
            p.metadata->>'subcategoria',
            p.metadata->>'subcategoryKey',
            p.metadata->>'subcategoriaKey',
            ''
          )) = lower(p_subcategory)
        )
        AND (
          p_tag IS NULL
          OR COALESCE(p.metadata->'tagKeys', '[]'::jsonb) @> jsonb_build_array(lower(p_tag))
        )
        AND (
          COALESCE(NULLIF(btrim(p_q), ''), NULL) IS NULL
          OR p.title ILIKE '%' || btrim(p_q) || '%'
          OR p.description ILIKE '%' || btrim(p_q) || '%'
        )
        AND public.kc_matches_feed_request_params(
          p.module,
          p.category,
          COALESCE(
            p.metadata->>'subcategory',
            p.metadata->>'subcategoria',
            p.metadata->>'subcategoryKey',
            p.metadata->>'subcategoriaKey',
            ''
          ),
          p.title,
          p.description,
          COALESCE(p.metadata, '{}'::jsonb),
          COALESCE(pr.verified, false),
          p_request_params
        )
        AND (v_price_min IS NULL OR (p.price IS NOT NULL AND p.price >= v_price_min))
        AND (v_price_max IS NULL OR (p.price IS NOT NULL AND p.price <= v_price_max))
        AND (
          v_cursor_json IS NULL
          OR ROW(COALESCE(p.bumped_at, '1970-01-01 00:00:00+00'::timestamptz), p.created_at, p.id)
             < ROW(COALESCE(v_cursor_bumped, '1970-01-01 00:00:00+00'::timestamptz), v_cursor_created, v_cursor_id)
        )
      ORDER BY p.bumped_at DESC NULLS LAST, p.created_at DESC, p.id DESC
      LIMIT v_limit + 1
    ),
    kept AS (
      SELECT * FROM filtered
      ORDER BY sort_bumped DESC, created_at DESC, id DESC
      LIMIT v_limit
    ),
    extra AS (
      SELECT count(*) > v_limit AS has_more FROM filtered
    ),
    cursor_row AS (
      SELECT * FROM kept
      ORDER BY sort_bumped DESC, created_at DESC, id DESC
      OFFSET GREATEST(v_limit - 1, 0)
      LIMIT 1
    )
    SELECT
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', kept.id,
            'legacy_id', kept.legacy_id,
            'author_id', kept.author_id,
            'title', kept.title,
            'description', kept.description,
            'price', kept.price,
            'location', kept.location,
            'module', kept.module,
            'category', kept.category,
            'status', kept.status,
            'visibility', kept.visibility,
            'metadata', kept.metadata,
            'created_at', kept.created_at,
            'votos', kept.votos,
            'highlight_score', kept.highlight_score,
            'bumped_at', kept.bumped_at,
            'last_comment_at', kept.last_comment_at,
            'profiles', kept.profile_payload,
            'post_media', kept.media_payload,
            'comments', jsonb_build_array(jsonb_build_object('count', kept.comment_count))
          )
          ORDER BY kept.sort_bumped DESC, kept.created_at DESC, kept.id DESC
        ),
        '[]'::jsonb
      ),
      COALESCE((SELECT has_more FROM extra), FALSE),
      CASE
        WHEN COALESCE((SELECT has_more FROM extra), FALSE) THEN (
          SELECT encode(
            convert_to(
              jsonb_build_object(
                'sort', 'recentes',
                'bumped_at', cursor_row.bumped_at,
                'created_at', cursor_row.created_at,
                'id', cursor_row.id
              )::TEXT,
              'utf8'
            ),
            'base64'
          )
          FROM cursor_row
        )
        ELSE NULL
      END
    INTO v_posts, v_has_more, v_next_cursor
    FROM kept;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'posts', COALESCE(v_posts, '[]'::jsonb),
    'next_cursor', v_next_cursor,
    'has_more', COALESCE(v_has_more, FALSE)
  );
END;
$$;

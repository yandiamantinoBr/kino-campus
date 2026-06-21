-- ============================================================
-- KinoCampus 2026-06-05 - Frequency cap no payload de anuncios
-- ============================================================
-- Exposes frequency_cap_per_session so the public renderer can
-- respect the per-session limit configured in the Admin.
-- ============================================================

DROP FUNCTION IF EXISTS public.kc_get_feed_ads(TEXT, TEXT, TEXT, TEXT, INTEGER);

CREATE FUNCTION public.kc_get_feed_ads(
  p_page_path TEXT DEFAULT '/',
  p_module_key TEXT DEFAULT '',
  p_search_query TEXT DEFAULT '',
  p_placement TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 6
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  advertiser_name TEXT,
  sponsor_label TEXT,
  title TEXT,
  description TEXT,
  image_url TEXT,
  cta_label TEXT,
  target_url TEXT,
  campaign_type TEXT,
  placements TEXT[],
  module_keys TEXT[],
  tags TEXT[],
  priority INTEGER,
  frequency_cap_per_session INTEGER,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH params AS (
    SELECT
      lower(trim(coalesce(p_module_key, ''))) AS module_key,
      lower(trim(coalesce(p_placement, ''))) AS placement_key,
      lower(trim(coalesce(p_search_query, ''))) AS q,
      greatest(1, least(coalesce(p_limit, 6), 12)) AS row_limit
  )
  SELECT
    c.id,
    c.name,
    c.advertiser_name,
    c.sponsor_label,
    c.title,
    c.description,
    c.image_url,
    c.cta_label,
    c.target_url,
    c.campaign_type,
    c.placements,
    c.module_keys,
    c.tags,
    c.priority,
    c.frequency_cap_per_session,
    c.starts_at,
    c.ends_at
  FROM public.ad_campaigns c
  CROSS JOIN params p
  WHERE c.status = 'active'
    AND (c.starts_at IS NULL OR c.starts_at <= now())
    AND (c.ends_at IS NULL OR c.ends_at >= now())
    AND (
      p.placement_key = ''
      OR p.placement_key = ANY (SELECT lower(x) FROM unnest(c.placements) AS x)
    )
    AND (
      cardinality(c.module_keys) = 0
      OR p.module_key = ''
      OR p.module_key = ANY (SELECT lower(x) FROM unnest(c.module_keys) AS x)
    )
  ORDER BY
    CASE
      WHEN p.q <> '' AND EXISTS (
        SELECT 1
        FROM unnest(c.tags || c.module_keys) AS term
        WHERE lower(term) LIKE '%' || p.q || '%' OR p.q LIKE '%' || lower(term) || '%'
      ) THEN 1
      ELSE 0
    END DESC,
    c.priority DESC,
    c.updated_at DESC
  LIMIT (SELECT row_limit FROM params);
$$;

REVOKE ALL ON FUNCTION public.kc_get_feed_ads(TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kc_get_feed_ads(TEXT, TEXT, TEXT, TEXT, INTEGER) TO anon, authenticated;

COMMENT ON FUNCTION public.kc_get_feed_ads(TEXT, TEXT, TEXT, TEXT, INTEGER)
  IS 'Retorna campanhas ativas e contextuais para placements de feed, incluindo frequency_cap_per_session, sem dados pessoais.';

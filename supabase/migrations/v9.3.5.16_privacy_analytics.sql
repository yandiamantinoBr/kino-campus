-- ============================================================
-- KinoCampus v9.3.5.16 - Privacidade, consentimento e analytics admin
-- ============================================================
--
-- Coleta opcional e agregável para administradores:
-- - sem cookies crus, IP bruto, user-agent bruto, e-mail ou token;
-- - session_id recebido do cliente é salvo apenas como SHA-256;
-- - inserts públicos passam por RPCs validadas;
-- - leitura detalhada somente para administradores.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.privacy_analytics_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name   TEXT NOT NULL CHECK (event_name IN (
    'search',
    'category_click',
    'post_open',
    'banner_impression',
    'banner_click',
    'help_open',
    'help_submit',
    'report_submit'
  )),
  session_hash TEXT NOT NULL,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  page_path    TEXT NOT NULL DEFAULT '/',
  entity_type  TEXT,
  entity_id    TEXT,
  module_key   TEXT,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.privacy_consent_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_hash        TEXT NOT NULL,
  user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  consent_version     TEXT NOT NULL,
  preferences_enabled BOOLEAN NOT NULL DEFAULT false,
  analytics_enabled   BOOLEAN NOT NULL DEFAULT false,
  source              TEXT NOT NULL DEFAULT 'user',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_privacy_analytics_events_created_at
  ON public.privacy_analytics_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_privacy_analytics_events_event_created
  ON public.privacy_analytics_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_privacy_analytics_events_page_created
  ON public.privacy_analytics_events (page_path, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_privacy_analytics_events_entity
  ON public.privacy_analytics_events (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_privacy_analytics_events_session
  ON public.privacy_analytics_events (session_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_privacy_consent_events_created_at
  ON public.privacy_consent_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_privacy_consent_events_session
  ON public.privacy_consent_events (session_hash, created_at DESC);

ALTER TABLE public.privacy_analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_consent_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.privacy_analytics_events FROM PUBLIC;
REVOKE ALL ON TABLE public.privacy_analytics_events FROM anon;
REVOKE ALL ON TABLE public.privacy_analytics_events FROM authenticated;
REVOKE ALL ON TABLE public.privacy_consent_events FROM PUBLIC;
REVOKE ALL ON TABLE public.privacy_consent_events FROM anon;
REVOKE ALL ON TABLE public.privacy_consent_events FROM authenticated;

GRANT SELECT ON public.privacy_analytics_events TO authenticated;
GRANT SELECT ON public.privacy_consent_events TO authenticated;

DROP POLICY IF EXISTS privacy_analytics_events_select_admin ON public.privacy_analytics_events;
CREATE POLICY privacy_analytics_events_select_admin
  ON public.privacy_analytics_events
  FOR SELECT TO authenticated
  USING (public.kc_is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS privacy_consent_events_select_admin ON public.privacy_consent_events;
CREATE POLICY privacy_consent_events_select_admin
  ON public.privacy_consent_events
  FOR SELECT TO authenticated
  USING (public.kc_is_admin((SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.kc_track_privacy_event(
  p_event_name TEXT,
  p_session_id TEXT,
  p_page_path TEXT DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id TEXT DEFAULT NULL,
  p_module_key TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_name TEXT := lower(trim(coalesce(p_event_name, '')));
  v_session_id TEXT := trim(coalesce(p_session_id, ''));
  v_page_path TEXT := left(coalesce(nullif(trim(p_page_path), ''), '/'), 180);
  v_metadata JSONB := coalesce(p_metadata, '{}'::jsonb);
BEGIN
  IF v_event_name NOT IN (
    'search',
    'category_click',
    'post_open',
    'banner_impression',
    'banner_click',
    'help_open',
    'help_submit',
    'report_submit'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_EVENT');
  END IF;

  IF length(v_session_id) < 12 OR length(v_session_id) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  END IF;

  IF jsonb_typeof(v_metadata) IS DISTINCT FROM 'object' OR length(v_metadata::text) > 4000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_METADATA');
  END IF;

  v_metadata := v_metadata
    - ARRAY['cookie', 'cookies', 'token', 'access_token', 'refresh_token', 'password', 'authorization', 'secret', 'email', 'ip', 'user_agent', 'ua', 'jwt'];

  INSERT INTO public.privacy_analytics_events (
    event_name,
    session_hash,
    user_id,
    page_path,
    entity_type,
    entity_id,
    module_key,
    metadata
  )
  VALUES (
    v_event_name,
    encode(digest(v_session_id, 'sha256'), 'hex'),
    auth.uid(),
    CASE WHEN v_page_path LIKE '/%' THEN v_page_path ELSE '/' || v_page_path END,
    nullif(left(trim(coalesce(p_entity_type, '')), 64), ''),
    nullif(left(trim(coalesce(p_entity_id, '')), 128), ''),
    nullif(left(trim(coalesce(p_module_key, '')), 64), ''),
    jsonb_strip_nulls(v_metadata)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.kc_track_privacy_event(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kc_track_privacy_event(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.kc_record_privacy_consent(
  p_session_id TEXT,
  p_consent_version TEXT,
  p_preferences BOOLEAN,
  p_analytics BOOLEAN,
  p_source TEXT DEFAULT 'user'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session_id TEXT := trim(coalesce(p_session_id, ''));
BEGIN
  IF length(v_session_id) < 12 OR length(v_session_id) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  END IF;

  INSERT INTO public.privacy_consent_events (
    session_hash,
    user_id,
    consent_version,
    preferences_enabled,
    analytics_enabled,
    source
  )
  VALUES (
    encode(digest(v_session_id, 'sha256'), 'hex'),
    auth.uid(),
    left(trim(coalesce(p_consent_version, 'unknown')), 32),
    coalesce(p_preferences, false),
    coalesce(p_analytics, false),
    left(trim(coalesce(p_source, 'user')), 48)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.kc_record_privacy_consent(TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kc_record_privacy_consent(TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.kc_admin_privacy_analytics(
  p_since TIMESTAMPTZ DEFAULT NULL,
  p_event_name TEXT DEFAULT 'all',
  p_page_path TEXT DEFAULT 'all',
  p_module_key TEXT DEFAULT 'all',
  p_limit INTEGER DEFAULT 500,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_since TIMESTAMPTZ := coalesce(p_since, now() - INTERVAL '30 days');
  v_event_name TEXT := nullif(lower(trim(coalesce(p_event_name, 'all'))), 'all');
  v_page_path TEXT := nullif(trim(coalesce(p_page_path, 'all')), 'all');
  v_module_key TEXT := nullif(trim(coalesce(p_module_key, 'all')), 'all');
  v_limit INTEGER := least(greatest(coalesce(p_limit, 500), 1), 1000);
  v_offset INTEGER := greatest(coalesce(p_offset, 0), 0);
  v_result JSONB;
BEGIN
  IF v_uid IS NULL OR NOT public.kc_is_admin(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  WITH filtered AS MATERIALIZED (
    SELECT *
    FROM public.privacy_analytics_events e
    WHERE e.created_at >= v_since
      AND (v_event_name IS NULL OR e.event_name = v_event_name)
      AND (v_page_path IS NULL OR e.page_path = v_page_path)
      AND (v_module_key IS NULL OR e.module_key = v_module_key)
  ),
  consent_filtered AS MATERIALIZED (
    SELECT *
    FROM public.privacy_consent_events c
    WHERE c.created_at >= v_since
  )
  SELECT jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'since', v_since,
    'totals', jsonb_build_object(
      'events', (SELECT count(*) FROM filtered),
      'sessions', (SELECT count(DISTINCT session_hash) FROM filtered),
      'searches', (SELECT count(*) FROM public.search_queries sq WHERE sq.created_at >= v_since),
      'banner_impressions', (SELECT count(*) FROM filtered WHERE event_name = 'banner_impression'),
      'banner_clicks', (SELECT count(*) FROM filtered WHERE event_name = 'banner_click'),
      'help_submits', (SELECT count(*) FROM filtered WHERE event_name = 'help_submit'),
      'report_submits', (SELECT count(*) FROM filtered WHERE event_name = 'report_submit')
    ),
    'consent', jsonb_build_object(
      'updates', (SELECT count(*) FROM consent_filtered),
      'analytics_accepted', (SELECT count(*) FROM consent_filtered WHERE analytics_enabled IS TRUE),
      'analytics_rejected', (SELECT count(*) FROM consent_filtered WHERE analytics_enabled IS FALSE),
      'preferences_accepted', (SELECT count(*) FROM consent_filtered WHERE preferences_enabled IS TRUE)
    ),
    'by_event', coalesce((
      SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.events DESC, row_data.event_name)
      FROM (
        SELECT event_name, count(*)::BIGINT AS events, count(DISTINCT session_hash)::BIGINT AS sessions
        FROM filtered
        GROUP BY event_name
      ) row_data
    ), '[]'::jsonb),
    'by_page', coalesce((
      SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.events DESC, row_data.page_path)
      FROM (
        SELECT page_path, count(*)::BIGINT AS events, count(DISTINCT session_hash)::BIGINT AS sessions
        FROM filtered
        GROUP BY page_path
        ORDER BY events DESC
        LIMIT 30
      ) row_data
    ), '[]'::jsonb),
    'daily', coalesce((
      SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.day)
      FROM (
        SELECT date_trunc('day', created_at)::DATE AS day,
               count(*)::BIGINT AS events,
               count(DISTINCT session_hash)::BIGINT AS sessions
        FROM filtered
        GROUP BY 1
        ORDER BY 1
      ) row_data
    ), '[]'::jsonb),
    'banners', coalesce((
      SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.ctr DESC, row_data.clicks DESC, row_data.impressions DESC)
      FROM (
        SELECT coalesce(nullif(entity_id, ''), metadata->>'entity_label', 'banner') AS entity_id,
               max(coalesce(metadata->>'entity_label', entity_id, 'Banner')) AS label,
               count(*) FILTER (WHERE event_name = 'banner_impression')::BIGINT AS impressions,
               count(*) FILTER (WHERE event_name = 'banner_click')::BIGINT AS clicks,
               CASE
                 WHEN count(*) FILTER (WHERE event_name = 'banner_impression') = 0 THEN 0
                 ELSE round(((count(*) FILTER (WHERE event_name = 'banner_click'))::NUMERIC / NULLIF((count(*) FILTER (WHERE event_name = 'banner_impression'))::NUMERIC, 0)) * 100, 2)
               END AS ctr
        FROM filtered
        WHERE entity_type = 'banner'
        GROUP BY coalesce(nullif(entity_id, ''), metadata->>'entity_label', 'banner')
      ) row_data
    ), '[]'::jsonb),
    'rows', coalesce((
      SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.created_at DESC)
      FROM (
        SELECT created_at,
               event_name,
               page_path,
               entity_type,
               entity_id,
               module_key,
               metadata
        FROM filtered
        ORDER BY created_at DESC
        LIMIT v_limit OFFSET v_offset
      ) row_data
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.kc_admin_privacy_analytics(TIMESTAMPTZ, TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kc_admin_privacy_analytics(TIMESTAMPTZ, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.kc_prune_old_analytics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_search_deleted BIGINT := 0;
  v_audit_deleted BIGINT := 0;
  v_views_deleted BIGINT := 0;
  v_privacy_deleted BIGINT := 0;
  v_consent_deleted BIGINT := 0;
BEGIN
  DELETE FROM public.search_queries
  WHERE created_at < now() - INTERVAL '6 months';
  GET DIAGNOSTICS v_search_deleted = ROW_COUNT;

  DELETE FROM public.audit_log
  WHERE created_at < now() - INTERVAL '1 year';
  GET DIAGNOSTICS v_audit_deleted = ROW_COUNT;

  DELETE FROM public.post_view_events
  WHERE created_at < now() - INTERVAL '6 months';
  GET DIAGNOSTICS v_views_deleted = ROW_COUNT;

  DELETE FROM public.privacy_analytics_events
  WHERE created_at < now() - INTERVAL '6 months';
  GET DIAGNOSTICS v_privacy_deleted = ROW_COUNT;

  DELETE FROM public.privacy_consent_events
  WHERE created_at < now() - INTERVAL '6 months';
  GET DIAGNOSTICS v_consent_deleted = ROW_COUNT;

  BEGIN
    INSERT INTO public.audit_log (action, entity_type, entity_id, actor_id, payload)
    VALUES (
      'analytics_pruned',
      'system',
      gen_random_uuid(),
      NULL,
      jsonb_build_object(
        'search_queries_deleted', v_search_deleted,
        'audit_log_deleted', v_audit_deleted,
        'post_view_events_deleted', v_views_deleted,
        'privacy_analytics_events_deleted', v_privacy_deleted,
        'privacy_consent_events_deleted', v_consent_deleted,
        'pruned_at', now()::TEXT
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'search_queries_deleted', v_search_deleted,
    'audit_log_deleted', v_audit_deleted,
    'post_view_events_deleted', v_views_deleted,
    'privacy_analytics_events_deleted', v_privacy_deleted,
    'privacy_consent_events_deleted', v_consent_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.kc_prune_old_analytics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kc_prune_old_analytics() FROM authenticated;

COMMENT ON TABLE public.privacy_analytics_events IS 'Eventos opcionais e agregáveis do KinoCampus; session_id é armazenado apenas como hash.';
COMMENT ON TABLE public.privacy_consent_events IS 'Histórico agregado de consentimento, sem valores de cookies ou tokens.';

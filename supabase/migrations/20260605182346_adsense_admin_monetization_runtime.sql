-- ============================================================
-- KinoCampus 2026-06-05 - Monetizacao admin e AdSense controlado
-- ============================================================
-- Camada aditiva:
-- - configuracao admin-only de rede de anuncios;
-- - RPC publica sanitizada para slots de feed;
-- - overview agregado para Dashboard;
-- - campanhas tambem registram audit_log canonico.
-- ============================================================


CREATE SCHEMA IF NOT EXISTS kc_private;
GRANT USAGE ON SCHEMA kc_private TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.ad_network_settings (
  id                  TEXT PRIMARY KEY DEFAULT 'default'
    CHECK (id = 'default'),
  provider            TEXT NOT NULL DEFAULT 'direct'
    CHECK (provider IN ('direct', 'adsense', 'hybrid')),
  status              TEXT NOT NULL DEFAULT 'disabled'
    CHECK (status IN ('disabled', 'testing', 'active')),
  adsense_client_id   TEXT NOT NULL DEFAULT 'ca-pub-2776499020194231',
  auto_ads_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  placement_modes     JSONB NOT NULL DEFAULT jsonb_build_object(
    'feed_inline', 'direct_only',
    'feed_aside_top', 'direct_only',
    'feed_aside_sticky', 'direct_only'
  ),
  adsense_slots       JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes               TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.ad_network_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ad_network_settings FROM PUBLIC;
REVOKE ALL ON TABLE public.ad_network_settings FROM anon;
REVOKE ALL ON TABLE public.ad_network_settings FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ad_network_settings TO authenticated;
GRANT ALL ON public.ad_network_settings TO service_role;

DROP POLICY IF EXISTS ad_network_settings_admin_all ON public.ad_network_settings;
CREATE POLICY ad_network_settings_admin_all
  ON public.ad_network_settings
  FOR ALL
  TO authenticated
  USING (public.kc_is_admin((SELECT auth.uid())))
  WITH CHECK (public.kc_is_admin((SELECT auth.uid())));

INSERT INTO public.ad_network_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public._trg_ad_network_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ad_network_settings_updated_at ON public.ad_network_settings;
CREATE TRIGGER trg_ad_network_settings_updated_at
  BEFORE INSERT OR UPDATE ON public.ad_network_settings
  FOR EACH ROW EXECUTE FUNCTION public._trg_ad_network_settings_updated_at();

CREATE OR REPLACE FUNCTION public._trg_ad_network_settings_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  BEGIN
    PERFORM public.audit_log_insert(
      'ad_network_settings_updated',
      'ad_network_settings',
      '00000000-0000-0000-0000-000000000000'::uuid,
      jsonb_build_object(
        'provider', NEW.provider,
        'status', NEW.status,
        'auto_ads_enabled', NEW.auto_ads_enabled,
        'placement_modes', NEW.placement_modes,
        'has_adsense_client_id', NEW.adsense_client_id <> '',
        'slot_keys', (
          SELECT coalesce(jsonb_agg(key ORDER BY key), '[]'::jsonb)
          FROM jsonb_object_keys(NEW.adsense_slots) AS key
        )
      ),
      auth.uid()
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ad_network_settings_audit ON public.ad_network_settings;
CREATE TRIGGER trg_ad_network_settings_audit
  AFTER UPDATE ON public.ad_network_settings
  FOR EACH ROW EXECUTE FUNCTION public._trg_ad_network_settings_audit();

CREATE OR REPLACE FUNCTION public._trg_ad_campaigns_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_action TEXT;
  v_payload JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_payload := to_jsonb(NEW);
    INSERT INTO public.ad_campaign_audit (campaign_id, action, changed_by, snapshot)
    VALUES (NEW.id, v_action, auth.uid(), v_payload);
    BEGIN
      PERFORM public.audit_log_insert('ad_campaign_created', 'ad_campaigns', NEW.id, v_payload, auth.uid());
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := CASE
      WHEN NEW.status = 'archived' AND OLD.status IS DISTINCT FROM 'archived' THEN 'archive'
      ELSE 'update'
    END;
    v_payload := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
    INSERT INTO public.ad_campaign_audit (campaign_id, action, changed_by, snapshot)
    VALUES (NEW.id, v_action, auth.uid(), v_payload);
    BEGIN
      PERFORM public.audit_log_insert(
        CASE
          WHEN NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN 'ad_campaign_activated'
          WHEN NEW.status = 'paused' AND OLD.status IS DISTINCT FROM 'paused' THEN 'ad_campaign_paused'
          WHEN NEW.status = 'archived' AND OLD.status IS DISTINCT FROM 'archived' THEN 'ad_campaign_archived'
          ELSE 'ad_campaign_updated'
        END,
        'ad_campaigns',
        NEW.id,
        v_payload,
        auth.uid()
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_payload := to_jsonb(OLD);
    INSERT INTO public.ad_campaign_audit (campaign_id, action, changed_by, snapshot)
    VALUES (OLD.id, 'delete', auth.uid(), v_payload);
    BEGIN
      PERFORM public.audit_log_insert('ad_campaign_archived', 'ad_campaigns', OLD.id, v_payload, auth.uid());
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_ad_campaigns_audit ON public.ad_campaigns;
CREATE TRIGGER trg_ad_campaigns_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION public._trg_ad_campaigns_audit();

CREATE OR REPLACE FUNCTION kc_private.kc_get_feed_ad_config(
  p_page_path TEXT DEFAULT '/',
  p_module_key TEXT DEFAULT '',
  p_placement TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settings public.ad_network_settings;
  v_path TEXT := left(coalesce(nullif(trim(p_page_path), ''), '/'), 180);
  v_placement TEXT := nullif(lower(trim(coalesce(p_placement, ''))), '');
  v_blocked BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_settings
  FROM public.ad_network_settings
  WHERE id = 'default';

  IF NOT FOUND OR v_settings.status <> 'active' THEN
    RETURN jsonb_build_object('ok', true, 'enabled', false, 'reason', 'disabled');
  END IF;

  v_blocked := v_path ~* '/(admin/|product\.html|_product\.html|create-post\.html|my-posts\.html|profile\.html|settings\.html|mensagens\.html|account-setup\.html|auth-callback\.html|privacidade\.html|termos\.html|ajuda\.html|transparencia\.html)';
  IF v_blocked THEN
    RETURN jsonb_build_object('ok', true, 'enabled', false, 'reason', 'blocked_page');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'enabled', true,
    'provider', v_settings.provider,
    'status', v_settings.status,
    'adsense_client_id', v_settings.adsense_client_id,
    'auto_ads_enabled', v_settings.auto_ads_enabled,
    'placement_modes', v_settings.placement_modes,
    'adsense_slots', CASE
      WHEN v_placement IS NULL THEN v_settings.adsense_slots
      ELSE jsonb_build_object(v_placement, v_settings.adsense_slots -> v_placement)
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kc_get_feed_ad_config(
  p_page_path TEXT DEFAULT '/',
  p_module_key TEXT DEFAULT '',
  p_placement TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT kc_private.kc_get_feed_ad_config($1, $2, $3)
$$;

REVOKE ALL ON FUNCTION kc_private.kc_get_feed_ad_config(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kc_private.kc_get_feed_ad_config(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.kc_get_feed_ad_config(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kc_get_feed_ad_config(TEXT, TEXT, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.kc_admin_get_ad_network_settings()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_settings public.ad_network_settings;
BEGIN
  IF v_uid IS NULL OR NOT public.kc_is_admin(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_settings
  FROM public.ad_network_settings
  WHERE id = 'default';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'settings', null);
  END IF;

  RETURN jsonb_build_object('ok', true, 'settings', to_jsonb(v_settings));
END;
$$;

REVOKE ALL ON FUNCTION public.kc_admin_get_ad_network_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kc_admin_get_ad_network_settings() TO authenticated;

CREATE OR REPLACE FUNCTION public.kc_admin_save_ad_network_settings(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_client TEXT := left(trim(coalesce(p_data->>'adsense_client_id', 'ca-pub-2776499020194231')), 80);
  v_auto_ads BOOLEAN := CASE WHEN lower(coalesce(p_data->>'auto_ads_enabled', 'false')) IN ('true', 't', '1', 'yes', 'on') THEN true ELSE false END;
  v_row public.ad_network_settings;
BEGIN
  IF v_uid IS NULL OR NOT public.kc_is_admin(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  IF v_client <> '' AND v_client !~ '^ca-pub-[0-9]{10,30}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ADSENSE_CLIENT_ID');
  END IF;

  INSERT INTO public.ad_network_settings (
    id, provider, status, adsense_client_id, auto_ads_enabled,
    placement_modes, adsense_slots, notes
  )
  VALUES (
    'default',
    CASE WHEN p_data->>'provider' IN ('direct','adsense','hybrid') THEN p_data->>'provider' ELSE 'direct' END,
    CASE WHEN p_data->>'status' IN ('disabled','testing','active') THEN p_data->>'status' ELSE 'disabled' END,
    v_client,
    v_auto_ads,
    coalesce(p_data->'placement_modes', jsonb_build_object(
      'feed_inline', 'direct_only',
      'feed_aside_top', 'direct_only',
      'feed_aside_sticky', 'direct_only'
    )),
    coalesce(p_data->'adsense_slots', '{}'::jsonb),
    left(trim(coalesce(p_data->>'notes', '')), 1000)
  )
  ON CONFLICT (id) DO UPDATE SET
    provider = EXCLUDED.provider,
    status = EXCLUDED.status,
    adsense_client_id = EXCLUDED.adsense_client_id,
    auto_ads_enabled = EXCLUDED.auto_ads_enabled,
    placement_modes = EXCLUDED.placement_modes,
    adsense_slots = EXCLUDED.adsense_slots,
    notes = EXCLUDED.notes
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'settings', to_jsonb(v_row));
END;
$$;

REVOKE ALL ON FUNCTION public.kc_admin_save_ad_network_settings(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kc_admin_save_ad_network_settings(JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.kc_admin_ads_overview(p_since TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_since TIMESTAMPTZ := coalesce(p_since, now() - interval '30 days');
  v_settings public.ad_network_settings;
  v_impressions BIGINT := 0;
  v_clicks BIGINT := 0;
BEGIN
  IF v_uid IS NULL OR NOT public.kc_is_admin(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_settings FROM public.ad_network_settings WHERE id = 'default';

  SELECT
    count(*) FILTER (WHERE event_name = 'ad_impression'),
    count(*) FILTER (WHERE event_name = 'ad_click')
  INTO v_impressions, v_clicks
  FROM public.privacy_analytics_events
  WHERE created_at >= v_since
    AND entity_type = 'ad_campaign'
    AND event_name IN ('ad_impression', 'ad_click');

  RETURN jsonb_build_object(
    'ok', true,
    'since', v_since,
    'settings', CASE WHEN v_settings.id IS NULL THEN NULL ELSE to_jsonb(v_settings) END,
    'campaigns', jsonb_build_object(
      'total', (SELECT count(*) FROM public.ad_campaigns),
      'active', (SELECT count(*) FROM public.ad_campaigns WHERE status = 'active'),
      'paused', (SELECT count(*) FROM public.ad_campaigns WHERE status = 'paused'),
      'draft', (SELECT count(*) FROM public.ad_campaigns WHERE status = 'draft'),
      'expired_active', (
        SELECT count(*) FROM public.ad_campaigns
        WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at < now()
      ),
      'active_without_impressions', (
        SELECT count(*)
        FROM public.ad_campaigns c
        WHERE c.status = 'active'
          AND NOT EXISTS (
            SELECT 1
            FROM public.privacy_analytics_events e
            WHERE e.entity_type = 'ad_campaign'
              AND e.entity_id = c.id::text
              AND e.event_name = 'ad_impression'
              AND e.created_at >= v_since
          )
      )
    ),
    'metrics', jsonb_build_object(
      'impressions', coalesce(v_impressions, 0),
      'clicks', coalesce(v_clicks, 0),
      'ctr', CASE WHEN coalesce(v_impressions, 0) = 0 THEN 0
                  ELSE round((coalesce(v_clicks, 0)::numeric / nullif(v_impressions, 0)::numeric) * 100, 2)
             END
    ),
    'expired_active', (
      SELECT count(*) FROM public.ad_campaigns
      WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at < now()
    ),
    'active_without_impressions', (
      SELECT count(*)
      FROM public.ad_campaigns c
      WHERE c.status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM public.privacy_analytics_events e
          WHERE e.entity_type = 'ad_campaign'
            AND e.entity_id = c.id::text
            AND e.event_name = 'ad_impression'
            AND e.created_at >= v_since
        )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.kc_admin_ads_overview(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kc_admin_ads_overview(TIMESTAMPTZ) TO authenticated;


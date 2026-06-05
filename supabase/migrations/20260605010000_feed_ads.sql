-- ============================================================
-- KinoCampus v9.3.6.0 - Anuncios contextuais de feed
-- ============================================================
-- Camada aditiva para monetizacao direta/contextual:
-- - preserva hero_banners;
-- - permite anuncios rotulados em feeds;
-- - usa RLS e RPCs security invoker;
-- - expande analytics opcional para ad_impression/ad_click.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.privacy_analytics_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name   TEXT NOT NULL CHECK (event_name IN (
    'search',
    'category_click',
    'post_open',
    'banner_impression',
    'banner_click',
    'ad_impression',
    'ad_click',
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

CREATE INDEX IF NOT EXISTS idx_privacy_analytics_events_created_at
  ON public.privacy_analytics_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_privacy_analytics_events_event_created
  ON public.privacy_analytics_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_privacy_analytics_events_page_created
  ON public.privacy_analytics_events (page_path, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_privacy_analytics_events_entity
  ON public.privacy_analytics_events (entity_type, entity_id, created_at DESC);

ALTER TABLE public.privacy_analytics_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.privacy_analytics_events FROM PUBLIC;
REVOKE ALL ON TABLE public.privacy_analytics_events FROM anon;
REVOKE ALL ON TABLE public.privacy_analytics_events FROM authenticated;
GRANT SELECT ON public.privacy_analytics_events TO authenticated;
GRANT INSERT ON public.privacy_analytics_events TO anon, authenticated;

DROP POLICY IF EXISTS privacy_analytics_events_select_admin ON public.privacy_analytics_events;
CREATE POLICY privacy_analytics_events_select_admin
  ON public.privacy_analytics_events
  FOR SELECT TO authenticated
  USING (public.kc_is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS privacy_analytics_events_insert_public ON public.privacy_analytics_events;
CREATE POLICY privacy_analytics_events_insert_public
  ON public.privacy_analytics_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    session_hash ~ '^[a-f0-9]{64}$'
    AND page_path LIKE '/%'
    AND length(page_path) <= 180
    AND (user_id IS NULL OR user_id = (SELECT auth.uid()))
    AND jsonb_typeof(metadata) = 'object'
    AND NOT (metadata ?| ARRAY['cookie', 'cookies', 'token', 'access_token', 'refresh_token', 'password', 'authorization', 'secret', 'email', 'ip', 'user_agent', 'ua', 'jwt'])
  );

CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                       TEXT NOT NULL,
  advertiser_name            TEXT NOT NULL DEFAULT '',
  sponsor_label              TEXT NOT NULL DEFAULT '',
  title                      TEXT NOT NULL,
  description                TEXT NOT NULL DEFAULT '',
  image_url                  TEXT NOT NULL DEFAULT '',
  cta_label                  TEXT NOT NULL DEFAULT 'Saiba mais',
  target_url                 TEXT NOT NULL,
  status                     TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  campaign_type              TEXT NOT NULL DEFAULT 'direct'
    CHECK (campaign_type IN ('direct', 'adsense_fallback')),
  placements                 TEXT[] NOT NULL DEFAULT ARRAY['feed_inline']::TEXT[],
  module_keys                TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  tags                       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  priority                   INTEGER NOT NULL DEFAULT 0,
  starts_at                  TIMESTAMPTZ,
  ends_at                    TIMESTAMPTZ,
  frequency_cap_per_session  INTEGER NOT NULL DEFAULT 4,
  billing_model              TEXT NOT NULL DEFAULT 'sponsorship',
  notes                      TEXT NOT NULL DEFAULT '',
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                 UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by                 UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.ad_campaign_audit (
  id           BIGSERIAL PRIMARY KEY,
  campaign_id  UUID REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  action       TEXT NOT NULL CHECK (action IN ('create', 'update', 'archive', 'delete')),
  changed_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot     JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status_dates
  ON public.ad_campaigns (status, starts_at, ends_at, priority DESC);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_placements
  ON public.ad_campaigns USING gin (placements);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_modules
  ON public.ad_campaigns USING gin (module_keys);

CREATE INDEX IF NOT EXISTS idx_ad_campaign_audit_campaign
  ON public.ad_campaign_audit (campaign_id, changed_at DESC);

ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaign_audit ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.ad_campaigns TO anon, authenticated;
GRANT SELECT ON public.ad_campaign_audit TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ad_campaigns TO authenticated;
GRANT INSERT ON public.ad_campaign_audit TO authenticated;

DROP POLICY IF EXISTS ad_campaigns_read_active ON public.ad_campaigns;
CREATE POLICY ad_campaigns_read_active
  ON public.ad_campaigns
  FOR SELECT
  USING (
    status = 'active'
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  );

DROP POLICY IF EXISTS ad_campaigns_admin_all ON public.ad_campaigns;
CREATE POLICY ad_campaigns_admin_all
  ON public.ad_campaigns
  FOR ALL
  TO authenticated
  USING (public.kc_is_admin((SELECT auth.uid())))
  WITH CHECK (public.kc_is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS ad_campaign_audit_admin_read ON public.ad_campaign_audit;
CREATE POLICY ad_campaign_audit_admin_read
  ON public.ad_campaign_audit
  FOR SELECT
  TO authenticated
  USING (public.kc_is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS ad_campaign_audit_admin_insert ON public.ad_campaign_audit;
CREATE POLICY ad_campaign_audit_admin_insert
  ON public.ad_campaign_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (public.kc_is_admin((SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public._trg_ad_campaigns_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  IF TG_OP = 'INSERT' AND NEW.created_by IS NULL THEN
    NEW.created_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ad_campaigns_updated_at ON public.ad_campaigns;
CREATE TRIGGER trg_ad_campaigns_updated_at
  BEFORE INSERT OR UPDATE ON public.ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION public._trg_ad_campaigns_updated_at();

CREATE OR REPLACE FUNCTION public._trg_ad_campaigns_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.ad_campaign_audit (campaign_id, action, changed_by, snapshot)
    VALUES (NEW.id, 'create', auth.uid(), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.ad_campaign_audit (campaign_id, action, changed_by, snapshot)
    VALUES (
      NEW.id,
      CASE WHEN NEW.status = 'archived' AND OLD.status IS DISTINCT FROM 'archived' THEN 'archive' ELSE 'update' END,
      auth.uid(),
      jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.ad_campaign_audit (campaign_id, action, changed_by, snapshot)
    VALUES (OLD.id, 'delete', auth.uid(), to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_ad_campaigns_audit ON public.ad_campaigns;
CREATE TRIGGER trg_ad_campaigns_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION public._trg_ad_campaigns_audit();

CREATE OR REPLACE FUNCTION public.kc_get_feed_ads(
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

CREATE OR REPLACE FUNCTION public.kc_admin_list_ad_campaigns()
RETURNS SETOF public.ad_campaigns
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM public.ad_campaigns
  WHERE public.kc_is_admin((SELECT auth.uid()))
  ORDER BY
    CASE status
      WHEN 'active' THEN 0
      WHEN 'paused' THEN 1
      WHEN 'draft' THEN 2
      ELSE 3
    END,
    priority DESC,
    updated_at DESC;
$$;

REVOKE ALL ON FUNCTION public.kc_admin_list_ad_campaigns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kc_admin_list_ad_campaigns() TO authenticated;

CREATE OR REPLACE FUNCTION public.kc_admin_save_ad_campaign(p_data JSONB)
RETURNS public.ad_campaigns
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_id UUID := NULLIF(p_data->>'id', '')::UUID;
  v_row public.ad_campaigns;
  v_placements TEXT[] := COALESCE(
    ARRAY(SELECT lower(trim(value)) FROM jsonb_array_elements_text(COALESCE(p_data->'placements', '[]'::jsonb)) WHERE trim(value) <> ''),
    ARRAY[]::TEXT[]
  );
  v_modules TEXT[] := COALESCE(
    ARRAY(SELECT lower(trim(value)) FROM jsonb_array_elements_text(COALESCE(p_data->'module_keys', '[]'::jsonb)) WHERE trim(value) <> ''),
    ARRAY[]::TEXT[]
  );
  v_tags TEXT[] := COALESCE(
    ARRAY(SELECT lower(trim(value)) FROM jsonb_array_elements_text(COALESCE(p_data->'tags', '[]'::jsonb)) WHERE trim(value) <> ''),
    ARRAY[]::TEXT[]
  );
BEGIN
  IF NOT public.kc_is_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  IF cardinality(v_placements) = 0 THEN
    v_placements := ARRAY['feed_inline']::TEXT[];
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.ad_campaigns (
      name, advertiser_name, sponsor_label, title, description, image_url,
      cta_label, target_url, status, campaign_type, placements, module_keys,
      tags, priority, starts_at, ends_at, frequency_cap_per_session,
      billing_model, notes
    )
    VALUES (
      left(trim(COALESCE(p_data->>'name', 'Campanha sem nome')), 140),
      left(trim(COALESCE(p_data->>'advertiser_name', '')), 140),
      left(trim(COALESCE(p_data->>'sponsor_label', 'Patrocinado')), 80),
      left(trim(COALESCE(p_data->>'title', '')), 160),
      left(trim(COALESCE(p_data->>'description', '')), 320),
      left(trim(COALESCE(p_data->>'image_url', '')), 600),
      left(trim(COALESCE(p_data->>'cta_label', 'Saiba mais')), 60),
      left(trim(COALESCE(p_data->>'target_url', '')), 600),
      CASE WHEN p_data->>'status' IN ('draft','active','paused','archived') THEN p_data->>'status' ELSE 'draft' END,
      CASE WHEN p_data->>'campaign_type' IN ('direct','adsense_fallback') THEN p_data->>'campaign_type' ELSE 'direct' END,
      v_placements,
      v_modules,
      v_tags,
      COALESCE((p_data->>'priority')::INTEGER, 0),
      NULLIF(p_data->>'starts_at', '')::TIMESTAMPTZ,
      NULLIF(p_data->>'ends_at', '')::TIMESTAMPTZ,
      GREATEST(0, COALESCE((p_data->>'frequency_cap_per_session')::INTEGER, 4)),
      left(trim(COALESCE(p_data->>'billing_model', 'sponsorship')), 80),
      left(trim(COALESCE(p_data->>'notes', '')), 1000)
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.ad_campaigns
    SET
      name = left(trim(COALESCE(p_data->>'name', name)), 140),
      advertiser_name = left(trim(COALESCE(p_data->>'advertiser_name', advertiser_name)), 140),
      sponsor_label = left(trim(COALESCE(p_data->>'sponsor_label', sponsor_label)), 80),
      title = left(trim(COALESCE(p_data->>'title', title)), 160),
      description = left(trim(COALESCE(p_data->>'description', description)), 320),
      image_url = left(trim(COALESCE(p_data->>'image_url', image_url)), 600),
      cta_label = left(trim(COALESCE(p_data->>'cta_label', cta_label)), 60),
      target_url = left(trim(COALESCE(p_data->>'target_url', target_url)), 600),
      status = CASE WHEN p_data->>'status' IN ('draft','active','paused','archived') THEN p_data->>'status' ELSE status END,
      campaign_type = CASE WHEN p_data->>'campaign_type' IN ('direct','adsense_fallback') THEN p_data->>'campaign_type' ELSE campaign_type END,
      placements = v_placements,
      module_keys = v_modules,
      tags = v_tags,
      priority = COALESCE((p_data->>'priority')::INTEGER, priority),
      starts_at = NULLIF(p_data->>'starts_at', '')::TIMESTAMPTZ,
      ends_at = NULLIF(p_data->>'ends_at', '')::TIMESTAMPTZ,
      frequency_cap_per_session = GREATEST(0, COALESCE((p_data->>'frequency_cap_per_session')::INTEGER, frequency_cap_per_session)),
      billing_model = left(trim(COALESCE(p_data->>'billing_model', billing_model)), 80),
      notes = left(trim(COALESCE(p_data->>'notes', notes)), 1000)
    WHERE id = v_id
    RETURNING * INTO v_row;
  END IF;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'campaign_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.kc_admin_save_ad_campaign(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kc_admin_save_ad_campaign(JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.kc_admin_archive_ad_campaign(p_campaign_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.kc_is_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.ad_campaigns
  SET status = 'archived'
  WHERE id = p_campaign_id;

  RETURN jsonb_build_object('ok', FOUND);
END;
$$;

REVOKE ALL ON FUNCTION public.kc_admin_archive_ad_campaign(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kc_admin_archive_ad_campaign(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.kc_admin_ad_campaign_audit(p_campaign_id UUID)
RETURNS TABLE (
  id BIGINT,
  campaign_id UUID,
  action TEXT,
  changed_at TIMESTAMPTZ,
  editor_name TEXT,
  snapshot JSONB
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    a.id,
    a.campaign_id,
    a.action,
    a.changed_at,
    COALESCE(p.display_name, p.full_name, 'Administrador') AS editor_name,
    a.snapshot
  FROM public.ad_campaign_audit a
  LEFT JOIN public.profiles p ON p.id = a.changed_by
  WHERE public.kc_is_admin((SELECT auth.uid()))
    AND (p_campaign_id IS NULL OR a.campaign_id = p_campaign_id)
  ORDER BY a.changed_at DESC
  LIMIT 800;
$$;

REVOKE ALL ON FUNCTION public.kc_admin_ad_campaign_audit(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kc_admin_ad_campaign_audit(UUID) TO authenticated;

ALTER TABLE public.privacy_analytics_events
  DROP CONSTRAINT IF EXISTS privacy_analytics_events_event_name_check;

ALTER TABLE public.privacy_analytics_events
  ADD CONSTRAINT privacy_analytics_events_event_name_check
  CHECK (event_name IN (
    'search',
    'category_click',
    'post_open',
    'banner_impression',
    'banner_click',
    'ad_impression',
    'ad_click',
    'help_open',
    'help_submit',
    'report_submit'
  ));

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
SECURITY INVOKER
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
    'ad_impression',
    'ad_click',
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
    encode(extensions.digest(v_session_id, 'sha256'), 'hex'),
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

COMMENT ON TABLE public.ad_campaigns IS 'Campanhas de anuncios contextuais exibidos em feeds do KinoCampus.';
COMMENT ON FUNCTION public.kc_get_feed_ads(TEXT, TEXT, TEXT, TEXT, INTEGER) IS 'Retorna campanhas ativas e contextuais para placements de feed, sem dados pessoais.';

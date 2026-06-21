-- ============================================================
-- KinoCampus 2026-06-05 - Indices de FKs para anuncios
-- ============================================================
-- Corrige advisors de performance sem alterar contratos.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_created_by
  ON public.ad_campaigns (created_by);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_updated_by
  ON public.ad_campaigns (updated_by);

CREATE INDEX IF NOT EXISTS idx_ad_campaign_audit_changed_by
  ON public.ad_campaign_audit (changed_by);

CREATE INDEX IF NOT EXISTS idx_ad_network_settings_updated_by
  ON public.ad_network_settings (updated_by);

CREATE INDEX IF NOT EXISTS idx_privacy_analytics_events_user_id
  ON public.privacy_analytics_events (user_id)
  WHERE user_id IS NOT NULL;

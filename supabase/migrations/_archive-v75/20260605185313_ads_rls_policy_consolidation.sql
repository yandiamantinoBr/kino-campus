DROP POLICY IF EXISTS ad_campaigns_read_active ON public.ad_campaigns;
DROP POLICY IF EXISTS ad_campaigns_admin_all ON public.ad_campaigns;
DROP POLICY IF EXISTS ad_campaigns_read_active_anon ON public.ad_campaigns;
DROP POLICY IF EXISTS ad_campaigns_read_authenticated ON public.ad_campaigns;
DROP POLICY IF EXISTS ad_campaigns_admin_insert ON public.ad_campaigns;
DROP POLICY IF EXISTS ad_campaigns_admin_update ON public.ad_campaigns;
DROP POLICY IF EXISTS ad_campaigns_admin_delete ON public.ad_campaigns;

CREATE POLICY ad_campaigns_read_active_anon
  ON public.ad_campaigns
  FOR SELECT
  TO anon
  USING (
    status = 'active'
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  );

CREATE POLICY ad_campaigns_read_authenticated
  ON public.ad_campaigns
  FOR SELECT
  TO authenticated
  USING (
    (
      status = 'active'
      AND (starts_at IS NULL OR starts_at <= now())
      AND (ends_at IS NULL OR ends_at >= now())
    )
    OR public.kc_is_admin((SELECT auth.uid()))
  );

CREATE POLICY ad_campaigns_admin_insert
  ON public.ad_campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (public.kc_is_admin((SELECT auth.uid())));

CREATE POLICY ad_campaigns_admin_update
  ON public.ad_campaigns
  FOR UPDATE
  TO authenticated
  USING (public.kc_is_admin((SELECT auth.uid())))
  WITH CHECK (public.kc_is_admin((SELECT auth.uid())));

CREATE POLICY ad_campaigns_admin_delete
  ON public.ad_campaigns
  FOR DELETE
  TO authenticated
  USING (public.kc_is_admin((SELECT auth.uid())));

-- v76.db-load-relief: partial feed indexes + throttle highlight cron
--
-- Context (2026-07-11 production incident):
--   Free-tier Postgres went UNHEALTHY under concurrent home/module load.
--   Logs: 503/504 on /rest/v1/posts, statement_timeout (57014), connection lost,
--   and cron job startup timeouts for notification dispatch.
--
-- Goals (safe, non-breaking):
--   1) Partial indexes matching real feed filters (legacy_id IS NULL + published/closed)
--   2) Reduce hourly highlight_score full recompute pressure (hourly -> every 6h)
--
-- Does NOT change RPC contracts, RLS policies, or application schemas.

-- ── Feed-oriented partial indexes ───────────────────────────────────────────
-- Main rails filter: legacy_id IS NULL AND status IN ('published','closed')
-- and sort by highlight_score / created_at / bumped_at / last_comment_at.

CREATE INDEX IF NOT EXISTS posts_feed_module_created_idx
  ON public.posts (module, created_at DESC, id)
  WHERE legacy_id IS NULL AND status IN ('published', 'closed');

CREATE INDEX IF NOT EXISTS posts_feed_module_highlight_idx
  ON public.posts (module, highlight_score DESC, votos DESC, created_at DESC, id)
  WHERE legacy_id IS NULL AND status IN ('published', 'closed');

CREATE INDEX IF NOT EXISTS posts_feed_module_bumped_idx
  ON public.posts (module, bumped_at DESC NULLS LAST, created_at DESC, id)
  WHERE legacy_id IS NULL AND status IN ('published', 'closed');

CREATE INDEX IF NOT EXISTS posts_feed_module_last_comment_idx
  ON public.posts (module, last_comment_at DESC NULLS LAST, created_at DESC, id)
  WHERE legacy_id IS NULL
    AND status IN ('published', 'closed')
    AND last_comment_at IS NOT NULL;

-- Cross-module home "destaques" / recentes (module is null in cursor RPC)
CREATE INDEX IF NOT EXISTS posts_feed_all_highlight_idx
  ON public.posts (highlight_score DESC, votos DESC, created_at DESC, id)
  WHERE legacy_id IS NULL AND status IN ('published', 'closed');

CREATE INDEX IF NOT EXISTS posts_feed_all_created_idx
  ON public.posts (created_at DESC, id)
  WHERE legacy_id IS NULL AND status IN ('published', 'closed');

-- ── Cron: highlight refresh every 6 hours (was hourly in v9.3.5.17) ─────────
-- Score still updates on engagement triggers; time-decay runs off-peak enough.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kc-refresh-highlight-scores') THEN
    PERFORM cron.unschedule('kc-refresh-highlight-scores');
  END IF;
EXCEPTION
  WHEN invalid_schema_name THEN
    -- pg_cron not available in local/sandbox
    NULL;
  WHEN undefined_table THEN
    -- pg_cron not available in local/sandbox
    NULL;
  WHEN undefined_function THEN
    NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'kc-refresh-highlight-scores',
    '15 */6 * * *',  -- every 6 hours at :15
    $cron$ SELECT public.kc_refresh_highlight_scores(); $cron$
  );
EXCEPTION
  WHEN invalid_schema_name THEN
    -- pg_cron not available in local/sandbox
    NULL;
  WHEN undefined_table THEN
    NULL;
  WHEN undefined_function THEN
    NULL;
END $$;

COMMENT ON INDEX public.posts_feed_module_created_idx IS
  'v76 load relief: module feed recentes (legacy_id null, published/closed)';
COMMENT ON INDEX public.posts_feed_module_highlight_idx IS
  'v76 load relief: module feed destaques / highlight_score';
COMMENT ON INDEX public.posts_feed_all_highlight_idx IS
  'v76 load relief: home cross-module destaques';

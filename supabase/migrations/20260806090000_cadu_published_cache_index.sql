-- v78 cadu: partial indexes for the published-post cache used by the curator
-- and the format/publish stages.
--
-- Context (2026-08-06 incident, run 3cd1deef): the REST query
--   /rest/v1/posts?select=id,title,metadata&status=eq.published&order=id.asc
-- with Prefer: count=exact timed out 4x (12s each) during a transient Supabase
-- slowdown, aborting the whole pipeline at the curator stage.
--
-- These partial indexes keep the cache query (id ordering) and the cache
-- regenerator (created_at ordering) on the published subset without touching
-- feed contracts, RLS or application schemas.

CREATE INDEX IF NOT EXISTS posts_cadu_published_cache_idx
  ON public.posts (id)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS posts_cadu_published_created_idx
  ON public.posts (created_at DESC, id DESC)
  WHERE status = 'published';

COMMENT ON INDEX public.posts_cadu_published_cache_idx IS
  'cadu: cache publicado do curador/format ordena por id (status published)';
COMMENT ON INDEX public.posts_cadu_published_created_idx IS
  'cadu: regeneracao do cache publicado ordena por created_at desc';

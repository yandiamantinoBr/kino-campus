-- ============================================================
-- KinoCampus v9.3.1.0 — Analytics de Post para Autores
-- ============================================================
--
--  Novidades:
--    1. posts.view_count (contagem denormalizada de visualizacoes)
--    2. post_view_events (eventos granulares de visualizacao)
--    3. kc_track_view() — registra view com anti-spam 1/user/post/hora
--    4. kc_get_post_analytics() — metricas por post (autor-only)
--    5. kc_prune_old_analytics() — retencao com post_view_events
--    6. idx_audit_log_created_at (pendente de v9.0.4)
-- ============================================================

-- ── 1. Nova coluna view_count em posts ──────────────────────
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;

-- ── 2. Tabela post_view_events ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_view_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. Indices ──────────────────────────────────────────────
-- Anti-spam dedup: usuario ja viu este post na ultima hora?
CREATE INDEX IF NOT EXISTS idx_post_view_events_dedup
  ON public.post_view_events (post_id, user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Contagem por post
CREATE INDEX IF NOT EXISTS idx_post_view_events_post_id
  ON public.post_view_events (post_id);

-- Retencao/cleanup
CREATE INDEX IF NOT EXISTS idx_post_view_events_created_at
  ON public.post_view_events (created_at);

-- Ordenacao futura por views
CREATE INDEX IF NOT EXISTS idx_posts_view_count
  ON public.posts (view_count DESC)
  WHERE status = 'published';

-- Indice pendente de v9.0.4 para cleanup de audit_log
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON public.audit_log (created_at);

-- ── 4. RLS em post_view_events ──────────────────────────────
ALTER TABLE public.post_view_events ENABLE ROW LEVEL SECURITY;

-- Usuarios autenticados podem inserir suas proprias views
CREATE POLICY post_view_events_insert ON public.post_view_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Autores podem ler views dos seus proprios posts
CREATE POLICY post_view_events_select_author ON public.post_view_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_view_events.post_id
        AND p.author_id = auth.uid()
    )
  );

-- Admins podem ler tudo
CREATE POLICY post_view_events_select_admin ON public.post_view_events
  FOR SELECT TO authenticated
  USING (public.kc_is_admin(auth.uid()));

-- ── 5. RPC kc_track_view ────────────────────────────────────
-- Anti-spam: 1 view por usuario por post por hora.
-- Self-views (autor vendo proprio post) nao contam.
CREATE OR REPLACE FUNCTION public.kc_track_view(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id     UUID;
  v_post_exists BOOLEAN;
  v_is_author   BOOLEAN;
  v_recent      BOOLEAN;
  v_new_count   INTEGER;
BEGIN
  -- Requer autenticacao
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  END IF;

  -- Post deve existir e estar publicado
  SELECT EXISTS(
    SELECT 1 FROM public.posts WHERE id = p_post_id AND status = 'published'
  ) INTO v_post_exists;

  IF NOT v_post_exists THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;

  -- Ignorar self-view (autor vendo proprio post)
  SELECT EXISTS(
    SELECT 1 FROM public.posts WHERE id = p_post_id AND author_id = v_user_id
  ) INTO v_is_author;

  IF v_is_author THEN
    RETURN jsonb_build_object('ok', true, 'code', 'SELF_VIEW', 'counted', false);
  END IF;

  -- Anti-spam: checar se ja visualizou na ultima hora
  SELECT EXISTS(
    SELECT 1 FROM public.post_view_events
    WHERE post_id = p_post_id
      AND user_id = v_user_id
      AND created_at > now() - INTERVAL '1 hour'
  ) INTO v_recent;

  IF v_recent THEN
    RETURN jsonb_build_object('ok', true, 'code', 'COOLDOWN', 'counted', false);
  END IF;

  -- Inserir evento de view
  INSERT INTO public.post_view_events (post_id, user_id)
  VALUES (p_post_id, v_user_id);

  -- Incrementar contador denormalizado
  UPDATE public.posts
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = p_post_id
  RETURNING view_count INTO v_new_count;

  RETURN jsonb_build_object('ok', true, 'counted', true, 'view_count', v_new_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.kc_track_view(UUID) TO authenticated;

-- ── 6. RPC kc_get_post_analytics ────────────────────────────
-- Retorna metricas completas de um post. Apenas autor ou admin.
CREATE OR REPLACE FUNCTION public.kc_get_post_analytics(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id    UUID;
  v_post       RECORD;
  v_comments   BIGINT := 0;
  v_saves      BIGINT := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  END IF;

  -- Buscar post
  SELECT id, author_id, votos, coupon_clicks, share_count, view_count,
         highlight_score, created_at, status
  INTO v_post
  FROM public.posts
  WHERE id = p_post_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;

  -- Apenas autor ou admin
  IF v_post.author_id <> v_user_id
     AND NOT public.kc_is_admin(v_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  -- Contar comentarios
  SELECT COUNT(*) INTO v_comments
  FROM public.comments
  WHERE post_id = p_post_id;

  -- Contar saves (todos os tipos)
  SELECT COUNT(*) INTO v_saves
  FROM public.saved_posts
  WHERE post_id = p_post_id;

  RETURN jsonb_build_object(
    'ok',            true,
    'post_id',       v_post.id,
    'status',        v_post.status,
    'views',         COALESCE(v_post.view_count, 0),
    'votos',         COALESCE(v_post.votos, 0),
    'comments',      v_comments,
    'shares',        COALESCE(v_post.share_count, 0),
    'coupon_clicks', COALESCE(v_post.coupon_clicks, 0),
    'saves',         v_saves,
    'highlight_score', COALESCE(v_post.highlight_score, 0),
    'created_at',    v_post.created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.kc_get_post_analytics(UUID) TO authenticated;

-- ── 7. kc_prune_old_analytics (criar/recriar) ──────────────
-- Inclui post_view_events (6 meses), search_queries (6 meses),
-- audit_log (1 ano). Substitui versao anterior se existir.
CREATE OR REPLACE FUNCTION public.kc_prune_old_analytics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_search_deleted BIGINT := 0;
  v_audit_deleted  BIGINT := 0;
  v_views_deleted  BIGINT := 0;
BEGIN
  -- Purgar search_queries > 6 meses
  DELETE FROM public.search_queries
  WHERE created_at < now() - INTERVAL '6 months';
  GET DIAGNOSTICS v_search_deleted = ROW_COUNT;

  -- Purgar audit_log > 1 ano
  DELETE FROM public.audit_log
  WHERE created_at < now() - INTERVAL '1 year';
  GET DIAGNOSTICS v_audit_deleted = ROW_COUNT;

  -- Purgar post_view_events > 6 meses
  DELETE FROM public.post_view_events
  WHERE created_at < now() - INTERVAL '6 months';
  GET DIAGNOSTICS v_views_deleted = ROW_COUNT;

  -- Registrar a operacao no audit_log
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
        'pruned_at', now()::TEXT
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'search_queries_deleted', v_search_deleted,
    'audit_log_deleted', v_audit_deleted,
    'post_view_events_deleted', v_views_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.kc_prune_old_analytics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kc_prune_old_analytics() FROM authenticated;

-- ── 8. pg_cron: purgar analytics mensalmente ────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('kc-prune-analytics'); EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule(
      'kc-prune-analytics',
      '0 4 1 * *',
      'SELECT public.kc_prune_old_analytics()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

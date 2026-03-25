-- ============================================================
-- KinoCampus v8.4.0.1 — Algoritmo de Destaques (highlight_score)
-- ============================================================
--
--  Fórmula do score:
--    score = (
--      votos          * 10   +
--      saves_highlight * 8   +
--      saves_favorite  * 5   +
--      comments_count  * 3   +
--      comment_recency_bonus (5 se < 24h, 3 se < 7d, 0)
--      coupon_clicks   * 4   +
--      share_count     * 2
--    ) / (1 + idade_em_semanas)   ← decaimento temporal
--
--  Colunas novas em posts:
--    - highlight_score  FLOAT   (atualizado via triggers + pg_cron)
--    - coupon_clicks    INT     (incrementado por kc_track_coupon_click)
--    - share_count      INT     (incrementado por kc_track_share)
-- ============================================================

-- ── 1. Novas colunas ─────────────────────────────────────────

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS highlight_score FLOAT   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_clicks   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS share_count     INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS posts_highlight_score_idx
  ON public.posts (highlight_score DESC)
  WHERE status = 'published';

-- ── 2. kc_compute_highlight_score ────────────────────────────

CREATE OR REPLACE FUNCTION public.kc_compute_highlight_score(p_post_id UUID)
RETURNS FLOAT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_votos          INT     := 0;
  v_coupon_clicks  INT     := 0;
  v_share_count    INT     := 0;
  v_created_at     TIMESTAMPTZ;
  v_saves_hl       BIGINT  := 0;
  v_saves_fav      BIGINT  := 0;
  v_comments       BIGINT  := 0;
  v_last_comment   TIMESTAMPTZ;
  v_comment_bonus  INT     := 0;
  v_age_weeks      FLOAT;
  v_score          FLOAT;
BEGIN
  -- Dados do post
  SELECT
    COALESCE(votos, 0),
    COALESCE(coupon_clicks, 0),
    COALESCE(share_count, 0),
    created_at
  INTO v_votos, v_coupon_clicks, v_share_count, v_created_at
  FROM public.posts
  WHERE id = p_post_id;

  IF NOT FOUND THEN RETURN 0; END IF;

  -- Saves por kind
  SELECT COUNT(*) INTO v_saves_hl
  FROM public.saved_posts
  WHERE post_id = p_post_id AND kind = 'highlight';

  SELECT COUNT(*) INTO v_saves_fav
  FROM public.saved_posts
  WHERE post_id = p_post_id AND kind = 'favorite';

  -- Comentários
  BEGIN
    SELECT COUNT(*), MAX(created_at)
    INTO v_comments, v_last_comment
    FROM public.comments
    WHERE post_id = p_post_id;
  EXCEPTION WHEN OTHERS THEN
    v_comments := 0; v_last_comment := NULL;
  END;

  -- Bônus por recência de comentário
  IF v_last_comment IS NOT NULL THEN
    IF v_last_comment > now() - INTERVAL '24 hours' THEN
      v_comment_bonus := 5;
    ELSIF v_last_comment > now() - INTERVAL '7 days' THEN
      v_comment_bonus := 3;
    END IF;
  END IF;

  -- Decaimento temporal: 1 / (1 + idade_em_semanas)
  v_age_weeks := EXTRACT(EPOCH FROM (now() - v_created_at)) / 604800.0;
  IF v_age_weeks < 0 THEN v_age_weeks := 0; END IF;

  v_score := (
    (v_votos * 10)
    + (v_saves_hl * 8)
    + (v_saves_fav * 5)
    + (v_comments * 3)
    + v_comment_bonus
    + (v_coupon_clicks * 4)
    + (v_share_count * 2)
  )::FLOAT / (1.0 + v_age_weeks);

  RETURN GREATEST(v_score, 0);
END;
$$;

-- ── 3. kc_refresh_highlight_scores ───────────────────────────
-- Recalcula scores para posts publicados recentes (últimos 60 dias).
-- Chamado pelo pg_cron a cada 6 horas.

CREATE OR REPLACE FUNCTION public.kc_refresh_highlight_scores()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE public.posts p
  SET highlight_score = public.kc_compute_highlight_score(p.id),
      updated_at      = now()
  WHERE p.status = 'published'
    AND p.created_at > now() - INTERVAL '60 days';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok',           true,
    'updated_count', v_updated,
    'ran_at',        now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.kc_refresh_highlight_scores() TO authenticated;

-- ── 4. kc_track_coupon_click ─────────────────────────────────
-- Incrementa coupon_clicks atomicamente (chamado pelo JS do produto).

CREATE OR REPLACE FUNCTION public.kc_track_coupon_click(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_clicks INT;
BEGIN
  UPDATE public.posts
  SET coupon_clicks = COALESCE(coupon_clicks, 0) + 1,
      highlight_score = public.kc_compute_highlight_score(id),
      updated_at = now()
  WHERE id = p_post_id
    AND status = 'published'
  RETURNING coupon_clicks INTO v_new_clicks;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;

  RETURN jsonb_build_object('ok', true, 'coupon_clicks', v_new_clicks);
END;
$$;

GRANT EXECUTE ON FUNCTION public.kc_track_coupon_click(UUID) TO authenticated, anon;

-- ── 5. kc_track_share ────────────────────────────────────────
-- Incrementa share_count atomicamente.

CREATE OR REPLACE FUNCTION public.kc_track_share(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_shares INT;
BEGIN
  UPDATE public.posts
  SET share_count = COALESCE(share_count, 0) + 1,
      highlight_score = public.kc_compute_highlight_score(id),
      updated_at = now()
  WHERE id = p_post_id
    AND status = 'published'
  RETURNING share_count INTO v_new_shares;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;

  RETURN jsonb_build_object('ok', true, 'share_count', v_new_shares);
END;
$$;

GRANT EXECUTE ON FUNCTION public.kc_track_share(UUID) TO authenticated, anon;

-- ── 6. Trigger: atualiza highlight_score ao votar ─────────────
-- Disparado AFTER INSERT/UPDATE/DELETE em post_votes

CREATE OR REPLACE FUNCTION public.kc_trigger_update_highlight_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id UUID;
BEGIN
  v_post_id := COALESCE(NEW.post_id, OLD.post_id);
  IF v_post_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  UPDATE public.posts
  SET highlight_score = public.kc_compute_highlight_score(v_post_id)
  WHERE id = v_post_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger em post_votes (já existe a tabela)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'post_votes') THEN
    DROP TRIGGER IF EXISTS trg_post_votes_highlight_score ON public.post_votes;
    CREATE TRIGGER trg_post_votes_highlight_score
      AFTER INSERT OR UPDATE OR DELETE ON public.post_votes
      FOR EACH ROW EXECUTE FUNCTION public.kc_trigger_update_highlight_score();
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Trigger em saved_posts
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'saved_posts') THEN
    DROP TRIGGER IF EXISTS trg_saved_posts_highlight_score ON public.saved_posts;
    CREATE TRIGGER trg_saved_posts_highlight_score
      AFTER INSERT OR DELETE ON public.saved_posts
      FOR EACH ROW EXECUTE FUNCTION public.kc_trigger_update_highlight_score();
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Trigger em comments
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'comments') THEN
    DROP TRIGGER IF EXISTS trg_comments_highlight_score ON public.comments;
    CREATE TRIGGER trg_comments_highlight_score
      AFTER INSERT OR DELETE ON public.comments
      FOR EACH ROW EXECUTE FUNCTION public.kc_trigger_update_highlight_score();
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ── 7. Calcula score inicial para todos os posts publicados ───
UPDATE public.posts
SET highlight_score = public.kc_compute_highlight_score(id)
WHERE status = 'published';

-- ── 8. pg_cron: refresh a cada 6 horas ───────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('kc-refresh-highlight-scores');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'kc-refresh-highlight-scores',
      '0 */6 * * *',
      'SELECT public.kc_refresh_highlight_scores()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- KinoCampus v8.4.0.2 — Detecção de publicações duplicadas
-- ============================================================
--
--  - Habilita extensão pg_trgm para similaridade de texto
--  - Cria índice GIN em posts.title para busca eficiente
--  - kc_check_duplicate_post(user_id, module, title, threshold)
--      → retorna posts do mesmo autor/módulo com título similar
-- ============================================================

-- ── 1. Extensão pg_trgm ──────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 2. Índice GIN para similaridade de títulos ───────────────
CREATE INDEX IF NOT EXISTS posts_title_trgm_idx
  ON public.posts USING GIN (title gin_trgm_ops)
  WHERE status IN ('published', 'hidden', 'expired');

-- ── 3. kc_check_duplicate_post ───────────────────────────────
-- Retorna posts do mesmo autor e módulo com título similar ao informado.
-- threshold: 0.0–1.0 (0.45 = 45% de similaridade, recomendado)
CREATE OR REPLACE FUNCTION public.kc_check_duplicate_post(
  p_user_id  UUID,
  p_module   TEXT,
  p_title    TEXT,
  p_threshold FLOAT DEFAULT 0.45
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_candidates JSONB;
BEGIN
  -- Apenas o próprio usuário pode verificar seus próprios posts
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR v_caller_id != p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  IF p_title IS NULL OR trim(p_title) = '' THEN
    RETURN jsonb_build_object('ok', true, 'candidates', '[]'::JSONB);
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',         id,
      'title',      title,
      'status',     status,
      'module',     module,
      'created_at', created_at,
      'similarity', ROUND((similarity(title, p_title))::NUMERIC, 2)
    )
    ORDER BY similarity(title, p_title) DESC
  ), '[]'::JSONB)
  INTO v_candidates
  FROM public.posts
  WHERE author_id = p_user_id
    AND module    = p_module
    AND status IN ('published', 'hidden', 'expired')
    AND similarity(title, p_title) >= p_threshold;

  RETURN jsonb_build_object(
    'ok',         true,
    'candidates', v_candidates
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.kc_check_duplicate_post(UUID, TEXT, TEXT, FLOAT) TO authenticated;

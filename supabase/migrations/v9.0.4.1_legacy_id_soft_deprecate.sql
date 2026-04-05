-- ============================================================
-- KinoCampus v9.0.4.1 — Deprecação Soft de legacy_id
-- ============================================================
--
--  Contexto:
--    A coluna posts.legacy_id foi criada em v8.2.7.0 para
--    importação de posts do protótipo v6/v7. Desde v9.0, novos
--    posts não recebem legacy_id. A coluna ainda é lida pelo
--    adapter (30+ referências) e pelo endpoint OG.
--
--  Esta migration NÃO remove a coluna — apenas:
--    1. Documenta a depreciação via COMMENT ON COLUMN
--    2. Cria RPC kc_admin_legacy_id_stats() para monitorar uso
--
--  Remoção da coluna só ocorrerá quando 0 posts com legacy_id
--  restarem (verificar via kc_admin_legacy_id_stats).
-- ============================================================

-- ── 1. Marcar coluna como deprecated ─────────────────────────

COMMENT ON COLUMN public.posts.legacy_id IS
  '[DEPRECATED v9.0.4] ID legado da importação v6/v7. '
  'Não atribuído a novos posts desde v9.0. '
  'Verificar uso via kc_admin_legacy_id_stats() antes de remover.';

-- ── 2. kc_admin_legacy_id_stats ──────────────────────────────
-- RPC somente admin — retorna métricas de uso de legacy_id
-- para embasar decisão de remoção futura.

CREATE OR REPLACE FUNCTION public.kc_admin_legacy_id_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_total_posts     BIGINT;
  v_with_legacy     BIGINT;
  v_without_legacy  BIGINT;
  v_oldest_legacy   TIMESTAMPTZ;
  v_newest_legacy   TIMESTAMPTZ;
  v_by_module       JSONB;
BEGIN
  -- Somente admin pode consultar
  IF NOT public.kc_is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ADMIN_ONLY');
  END IF;

  -- Contagens gerais
  SELECT count(*) INTO v_total_posts FROM public.posts;
  SELECT count(*) INTO v_with_legacy FROM public.posts WHERE legacy_id IS NOT NULL;
  v_without_legacy := v_total_posts - v_with_legacy;

  -- Range de datas dos posts com legacy_id
  SELECT min(created_at), max(created_at)
  INTO v_oldest_legacy, v_newest_legacy
  FROM public.posts
  WHERE legacy_id IS NOT NULL;

  -- Distribuição por módulo
  SELECT COALESCE(jsonb_object_agg(module, cnt), '{}'::JSONB)
  INTO v_by_module
  FROM (
    SELECT module, count(*) AS cnt
    FROM public.posts
    WHERE legacy_id IS NOT NULL
    GROUP BY module
    ORDER BY cnt DESC
  ) sub;

  RETURN jsonb_build_object(
    'ok', true,
    'total_posts', v_total_posts,
    'with_legacy_id', v_with_legacy,
    'without_legacy_id', v_without_legacy,
    'pct_legacy', CASE
      WHEN v_total_posts > 0
      THEN round((v_with_legacy::NUMERIC / v_total_posts) * 100, 1)
      ELSE 0
    END,
    'oldest_legacy_post', v_oldest_legacy,
    'newest_legacy_post', v_newest_legacy,
    'by_module', v_by_module,
    'safe_to_remove', (v_with_legacy = 0)
  );
END;
$$;

-- Somente admin (via authenticated + kc_is_admin check interno)
GRANT EXECUTE ON FUNCTION public.kc_admin_legacy_id_stats() TO authenticated;

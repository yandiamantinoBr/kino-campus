-- ============================================================
-- KinoCampus v9.0.4.0 — Retenção de Analytics
-- ============================================================
--
--  Novidades:
--    - kc_prune_old_analytics()  : purga search_queries (>6 meses)
--                                  e audit_log (>1 ano)
--    - pg_cron job mensal às 04:00 UTC (dia 1 de cada mês)
--    - Índice em search_queries(created_at) para DELETE eficiente
--    - Índice em audit_log(created_at) para DELETE eficiente
-- ============================================================

-- ── 1. Índices para DELETE eficiente ─────────────────────────
-- O DELETE com WHERE created_at < ... precisa de index scan, não seq scan.

CREATE INDEX IF NOT EXISTS idx_search_queries_created_at
  ON public.search_queries (created_at);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON public.audit_log (created_at);

-- ── 2. kc_prune_old_analytics ────────────────────────────────
-- Remove registros antigos para evitar crescimento ilimitado.
-- search_queries: 6 meses | audit_log: 1 ano

CREATE OR REPLACE FUNCTION public.kc_prune_old_analytics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search_deleted BIGINT := 0;
  v_audit_deleted  BIGINT := 0;
BEGIN
  -- Purgar search_queries com mais de 6 meses
  DELETE FROM public.search_queries
  WHERE created_at < now() - INTERVAL '6 months';
  GET DIAGNOSTICS v_search_deleted = ROW_COUNT;

  -- Purgar audit_log com mais de 1 ano
  DELETE FROM public.audit_log
  WHERE created_at < now() - INTERVAL '1 year';
  GET DIAGNOSTICS v_audit_deleted = ROW_COUNT;

  -- Registrar a própria operação de limpeza no audit_log
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
        'pruned_at', now()::TEXT
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'search_queries_deleted', v_search_deleted,
    'audit_log_deleted', v_audit_deleted
  );
END;
$$;

-- Permissão: somente service_role (pg_cron) pode executar
-- Não conceder a authenticated — limpeza é tarefa do sistema
REVOKE ALL ON FUNCTION public.kc_prune_old_analytics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kc_prune_old_analytics() FROM authenticated;

-- ── 3. pg_cron: purgar analytics mensalmente ─────────────────
-- Executa no dia 1 de cada mês às 04:00 UTC
-- Requer extensão pg_cron habilitada no Supabase Dashboard

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Remove job anterior se existir
    PERFORM cron.unschedule('kc-prune-analytics');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.schedule(
      'kc-prune-analytics',
      '0 4 1 * *',
      'SELECT public.kc_prune_old_analytics()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

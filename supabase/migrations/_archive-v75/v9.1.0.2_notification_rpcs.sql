-- ============================================================
-- KinoCampus v9.1.0.2 — RPCs de Notificação
-- ============================================================
--
--  RPCs:
--    - kc_get_notifications       → lista paginada de notificações
--    - kc_mark_notifications_read → marcar como lidas (por IDs)
--    - kc_mark_all_notifications_read → marcar todas como lidas
--    - kc_unread_notification_count → contagem de não-lidas
--    - kc_prune_old_notifications → limpar > 90 dias (pg_cron)
-- ============================================================

-- ── 1. kc_get_notifications ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.kc_get_notifications(
  p_limit  INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_rows    JSONB;
  v_total   BIGINT;
  v_unread  BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED');
  END IF;

  -- Buscar notificações
  SELECT COALESCE(jsonb_agg(row_to_json(n)::JSONB ORDER BY n.created_at DESC), '[]'::JSONB)
  INTO v_rows
  FROM (
    SELECT id, type, title, body, data, read, created_at
    FROM public.notifications
    WHERE user_id = v_user_id
    ORDER BY created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) n;

  -- Contagem total
  SELECT count(*)
  INTO v_total
  FROM public.notifications
  WHERE user_id = v_user_id;

  -- Contagem de não-lidas
  SELECT count(*)
  INTO v_unread
  FROM public.notifications
  WHERE user_id = v_user_id AND read = false;

  RETURN jsonb_build_object(
    'ok', true,
    'notifications', v_rows,
    'total', v_total,
    'unread', v_unread
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.kc_get_notifications(INT, INT) TO authenticated;

-- ── 2. kc_mark_notifications_read ────────────────────────────

CREATE OR REPLACE FUNCTION public.kc_mark_notifications_read(p_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_updated BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED');
  END IF;

  UPDATE public.notifications
  SET read = true
  WHERE id = ANY(p_ids)
    AND user_id = v_user_id
    AND read = false;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'updated', v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.kc_mark_notifications_read(UUID[]) TO authenticated;

-- ── 3. kc_mark_all_notifications_read ────────────────────────

CREATE OR REPLACE FUNCTION public.kc_mark_all_notifications_read()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_updated BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED');
  END IF;

  UPDATE public.notifications
  SET read = true
  WHERE user_id = v_user_id AND read = false;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'updated', v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.kc_mark_all_notifications_read() TO authenticated;

-- ── 4. kc_unread_notification_count ──────────────────────────

CREATE OR REPLACE FUNCTION public.kc_unread_notification_count()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RETURN 0; END IF;

  RETURN (
    SELECT count(*)
    FROM public.notifications
    WHERE user_id = v_user_id AND read = false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.kc_unread_notification_count() TO authenticated;

-- ── 5. kc_prune_old_notifications ────────────────────────────
-- Remove notificações lidas com mais de 90 dias.

CREATE OR REPLACE FUNCTION public.kc_prune_old_notifications()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted BIGINT;
BEGIN
  DELETE FROM public.notifications
  WHERE created_at < now() - INTERVAL '90 days'
    AND read = true;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.kc_prune_old_notifications() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kc_prune_old_notifications() FROM authenticated;

-- ── 6. pg_cron: limpar notificações mensalmente ──────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.unschedule('kc-prune-notifications');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.schedule(
      'kc-prune-notifications',
      '0 5 1 * *',
      'SELECT public.kc_prune_old_notifications()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- KinoCampus - Admin configurable post flood limits
--
-- Adds an administrator-managed posting cadence limit used by the
-- kc_anti_spam_gate() trigger. The existing post_limits table still controls
-- how many published posts can remain active. This migration controls how many
-- posts a user can create inside a rolling time window.

BEGIN;

CREATE TABLE IF NOT EXISTS public.post_flood_limits (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_id        UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  module         TEXT,
  max_posts      INT NOT NULL DEFAULT 3 CHECK (max_posts >= 0 AND max_posts <= 1000),
  window_minutes INT NOT NULL DEFAULT 60 CHECK (window_minutes >= 1 AND window_minutes <= 10080)
);

COMMENT ON TABLE public.post_flood_limits IS
  'Limite de ritmo de criacao de posts por usuario/modulo. user_id=NULL significa global; module=NULL significa todos os modulos.';
COMMENT ON COLUMN public.post_flood_limits.max_posts IS
  'Maximo de posts criados dentro da janela movel configurada.';
COMMENT ON COLUMN public.post_flood_limits.window_minutes IS
  'Tamanho da janela movel, em minutos, usada pelo anti-spam de criacao.';

CREATE INDEX IF NOT EXISTS post_flood_limits_user_id_idx ON public.post_flood_limits(user_id);
CREATE INDEX IF NOT EXISTS post_flood_limits_module_idx ON public.post_flood_limits(module);
CREATE UNIQUE INDEX IF NOT EXISTS post_flood_limits_unique_scope_idx
  ON public.post_flood_limits (
    COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::UUID),
    COALESCE(module, '__all__')
  );
CREATE INDEX IF NOT EXISTS idx_posts_author_created_module_desc
  ON public.posts (author_id, created_at DESC, module);

ALTER TABLE public.post_flood_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS post_flood_limits_select ON public.post_flood_limits;
CREATE POLICY post_flood_limits_select
  ON public.post_flood_limits FOR SELECT
  TO authenticated
  USING (
    user_id IS NULL
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin IS TRUE
    )
  );

DROP POLICY IF EXISTS post_flood_limits_insert_admin ON public.post_flood_limits;
CREATE POLICY post_flood_limits_insert_admin
  ON public.post_flood_limits FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin IS TRUE
    )
  );

DROP POLICY IF EXISTS post_flood_limits_update_admin ON public.post_flood_limits;
CREATE POLICY post_flood_limits_update_admin
  ON public.post_flood_limits FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin IS TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin IS TRUE
    )
  );

DROP POLICY IF EXISTS post_flood_limits_delete_admin ON public.post_flood_limits;
CREATE POLICY post_flood_limits_delete_admin
  ON public.post_flood_limits FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin IS TRUE
    )
  );

CREATE OR REPLACE FUNCTION public.kc_count_recent_posts(
  p_user_id UUID,
  p_module TEXT DEFAULT NULL,
  p_window_minutes INT DEFAULT 60
)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COUNT(*)
  FROM public.posts p
  WHERE p.author_id = p_user_id
    AND p.created_at > now() - make_interval(mins => GREATEST(1, COALESCE(p_window_minutes, 60)))
    AND (NULLIF(BTRIM(p_module), '') IS NULL OR p.module = NULLIF(BTRIM(p_module), ''));
$$;

CREATE OR REPLACE FUNCTION public.kc_get_post_flood_limit(
  p_user_id UUID,
  p_module TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_module TEXT := NULLIF(BTRIM(p_module), '');
  v_limit RECORD;
BEGIN
  SELECT pfl.max_posts, pfl.window_minutes, pfl.user_id, pfl.module
    INTO v_limit
    FROM public.post_flood_limits pfl
   WHERE (pfl.user_id = p_user_id OR pfl.user_id IS NULL)
     AND (pfl.module IS NOT DISTINCT FROM v_module OR pfl.module IS NULL)
   ORDER BY CASE
     WHEN pfl.user_id = p_user_id AND pfl.module IS NOT DISTINCT FROM v_module THEN 1
     WHEN pfl.user_id = p_user_id AND pfl.module IS NULL THEN 2
     WHEN pfl.user_id IS NULL AND pfl.module IS NOT DISTINCT FROM v_module THEN 3
     WHEN pfl.user_id IS NULL AND pfl.module IS NULL THEN 4
     ELSE 5
   END
   LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'max_posts', v_limit.max_posts,
      'window_minutes', v_limit.window_minutes,
      'user_id', v_limit.user_id,
      'module', v_limit.module,
      'source', CASE
        WHEN v_limit.user_id IS NOT NULL AND v_limit.module IS NOT NULL THEN 'user_module'
        WHEN v_limit.user_id IS NOT NULL THEN 'user'
        WHEN v_limit.module IS NOT NULL THEN 'module'
        ELSE 'global'
      END
    );
  END IF;

  RETURN jsonb_build_object(
    'max_posts', 3,
    'window_minutes', 60,
    'user_id', NULL,
    'module', NULL,
    'source', 'fallback'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kc_check_post_flood_limit(
  p_user_id UUID,
  p_module TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit JSONB;
  v_max_posts INT;
  v_window_minutes INT;
  v_count BIGINT;
  v_reset_at TIMESTAMPTZ;
  v_module TEXT := NULLIF(BTRIM(p_module), '');
BEGIN
  v_limit := public.kc_get_post_flood_limit(p_user_id, v_module);
  v_max_posts := COALESCE((v_limit->>'max_posts')::INT, 3);
  v_window_minutes := COALESCE((v_limit->>'window_minutes')::INT, 60);
  v_count := public.kc_count_recent_posts(p_user_id, v_module, v_window_minutes);

  SELECT MIN(p.created_at) + make_interval(mins => v_window_minutes)
    INTO v_reset_at
    FROM public.posts p
   WHERE p.author_id = p_user_id
     AND p.created_at > now() - make_interval(mins => v_window_minutes)
     AND (v_module IS NULL OR p.module = v_module);

  RETURN jsonb_build_object(
    'ok', v_count < v_max_posts,
    'limit', v_max_posts,
    'max_posts', v_max_posts,
    'count', v_count,
    'remaining', GREATEST(0, v_max_posts - v_count),
    'window_minutes', v_window_minutes,
    'reset_at', v_reset_at,
    'module', v_module,
    'source', v_limit->>'source'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kc_admin_set_post_flood_limit(
  p_user_id UUID DEFAULT NULL,
  p_module TEXT DEFAULT NULL,
  p_max_posts INT DEFAULT 3,
  p_window_minutes INT DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id UUID;
  v_is_admin BOOLEAN;
  v_module TEXT := NULLIF(BTRIM(p_module), '');
  v_rows_updated INT;
  v_limit_id UUID;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Autenticacao necessaria.');
  END IF;

  SELECT p.is_admin INTO v_is_admin FROM public.profiles p WHERE p.id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas administradores podem configurar limites.');
  END IF;

  IF p_max_posts < 0 OR p_max_posts > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_VALUE', 'message', 'Limite deve estar entre 0 e 1000.');
  END IF;

  IF p_window_minutes < 1 OR p_window_minutes > 10080 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_WINDOW', 'message', 'Janela deve estar entre 1 minuto e 7 dias.');
  END IF;

  UPDATE public.post_flood_limits
     SET max_posts = p_max_posts,
         window_minutes = p_window_minutes,
         updated_at = now(),
         created_by = v_admin_id
   WHERE (p_user_id IS NULL AND user_id IS NULL OR user_id = p_user_id)
     AND (v_module IS NULL AND module IS NULL OR module = v_module)
   RETURNING id INTO v_limit_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    INSERT INTO public.post_flood_limits (user_id, module, max_posts, window_minutes, created_by)
    VALUES (p_user_id, v_module, p_max_posts, p_window_minutes, v_admin_id)
    RETURNING id INTO v_limit_id;
  END IF;

  BEGIN
    INSERT INTO public.audit_log (action, entity_type, entity_id, actor_id, payload)
    VALUES (
      'post_flood_limit_changed',
      'post_flood_limits',
      v_limit_id,
      v_admin_id,
      jsonb_build_object(
        'user_id', p_user_id,
        'module', v_module,
        'max_posts', p_max_posts,
        'window_minutes', p_window_minutes
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'Limite de ritmo configurado com sucesso.',
    'id', v_limit_id,
    'user_id', p_user_id,
    'module', v_module,
    'max_posts', p_max_posts,
    'window_minutes', p_window_minutes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kc_admin_get_post_flood_limits()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id UUID;
  v_is_admin BOOLEAN;
  v_limits JSONB;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT p.is_admin INTO v_is_admin FROM public.profiles p WHERE p.id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', pfl.id,
      'user_id', pfl.user_id,
      'module', pfl.module,
      'max_posts', pfl.max_posts,
      'window_minutes', pfl.window_minutes,
      'created_at', pfl.created_at,
      'updated_at', pfl.updated_at,
      'user_name', COALESCE(p.display_name, p.full_name, '—')
    )
    ORDER BY pfl.user_id NULLS FIRST, pfl.module NULLS FIRST, pfl.window_minutes
  )
  INTO v_limits
  FROM public.post_flood_limits pfl
  LEFT JOIN public.profiles p ON p.id = pfl.user_id;

  RETURN jsonb_build_object('ok', true, 'limits', COALESCE(v_limits, '[]'::JSONB));
END;
$$;

CREATE OR REPLACE FUNCTION public.kc_admin_delete_post_flood_limit(
  p_limit_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id UUID;
  v_is_admin BOOLEAN;
  v_deleted RECORD;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT p.is_admin INTO v_is_admin FROM public.profiles p WHERE p.id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  DELETE FROM public.post_flood_limits
   WHERE id = p_limit_id
   RETURNING * INTO v_deleted;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Limite de ritmo nao encontrado.');
  END IF;

  BEGIN
    INSERT INTO public.audit_log (action, entity_type, entity_id, actor_id, payload)
    VALUES (
      'post_flood_limit_deleted',
      'post_flood_limits',
      v_deleted.id,
      v_admin_id,
      jsonb_build_object(
        'user_id', v_deleted.user_id,
        'module', v_deleted.module,
        'max_posts', v_deleted.max_posts,
        'window_minutes', v_deleted.window_minutes
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('ok', true, 'code', 'OK', 'message', 'Limite de ritmo removido.');
END;
$$;

CREATE OR REPLACE FUNCTION public.kc_anti_spam_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_flood_check JSONB;
  v_url_count INTEGER := 0;
  v_approved_count INTEGER := 0;
  v_profile_created_at TIMESTAMPTZ;
  v_flood_limit INT := 3;
  v_flood_count INT := 0;
  v_flood_window INT := 60;
BEGIN
  v_flood_check := public.kc_check_post_flood_limit(NEW.author_id, NEW.module);
  v_flood_limit := COALESCE((v_flood_check->>'limit')::INT, 3);
  v_flood_count := COALESCE((v_flood_check->>'count')::INT, 0);
  v_flood_window := COALESCE((v_flood_check->>'window_minutes')::INT, 60);

  IF NOT COALESCE((v_flood_check->>'ok')::BOOLEAN, true) THEN
    RAISE EXCEPTION 'flood_limit_exceeded'
      USING HINT = format(
              'Limite de %s publicacoes a cada %s minutos atingido. Aguarde antes de publicar novamente.',
              v_flood_limit,
              v_flood_window
            ),
            DETAIL = v_flood_check::TEXT,
            ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(m[1])
    INTO v_url_count
    FROM regexp_matches(
      COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.title, ''),
      'https?://[^\s)>\]"'']+',
      'gi'
    ) AS m;

  IF v_url_count > 3 THEN
    NEW.status := 'pending';
    NEW.moderation_reason := 'link_spam';
  END IF;

  SELECT p.created_at
    INTO v_profile_created_at
    FROM public.profiles p
   WHERE p.id = NEW.author_id;

  IF v_profile_created_at IS NOT NULL AND v_profile_created_at > now() - interval '7 days' THEN
    SELECT COUNT(*)
      INTO v_approved_count
      FROM public.posts p
     WHERE p.author_id = NEW.author_id
       AND p.status = 'published';

    IF v_approved_count = 0 THEN
      NEW.status := 'pending';
      NEW.moderation_reason := COALESCE(NEW.moderation_reason, 'new_user_scrutiny');
    END IF;
  END IF;

  IF NEW.status = 'pending' THEN
    BEGIN
      INSERT INTO public.audit_log (action, entity_type, entity_id, actor_id, payload)
      VALUES (
        'post_auto_moderated',
        'posts',
        NEW.id,
        NEW.author_id,
        jsonb_build_object(
          'reason', NEW.moderation_reason,
          'original_status', 'published',
          'new_status', 'pending',
          'module', NEW.module,
          'flood_limit', v_flood_limit,
          'flood_count', v_flood_count,
          'flood_window_minutes', v_flood_window
        )
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kc_count_recent_posts(UUID, TEXT, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kc_get_post_flood_limit(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kc_check_post_flood_limit(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kc_admin_set_post_flood_limit(UUID, TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kc_admin_get_post_flood_limits() TO authenticated;
GRANT EXECUTE ON FUNCTION public.kc_admin_delete_post_flood_limit(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.kc_anti_spam_gate() FROM anon, authenticated;

COMMIT;

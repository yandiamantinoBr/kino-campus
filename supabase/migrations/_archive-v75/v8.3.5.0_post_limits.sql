-- ============================================================
-- KinoCampus v8.3.5.0 — Limite de publicações ativas por usuário
-- ============================================================
--
-- O que faz:
--   1. Tabela `post_limits` — configuração de limite de publicações
--      ativas por usuário e/ou módulo (NULL = global).
--   2. Funções auxiliares (SECURITY DEFINER):
--      - kc_count_active_posts(user_id, module)  → BIGINT
--      - kc_get_post_limit(user_id, module)       → INT
--      - kc_check_post_limit(user_id, module)     → JSONB
--   3. RPC do usuário:
--      - kc_toggle_post_status(post_id)           → JSONB
--        Alterna entre 'published' ↔ 'hidden' no próprio anúncio.
--        Bloqueia reativação se o usuário já atingiu o limite.
--   4. RPCs do admin (verificam is_admin):
--      - kc_admin_set_post_limit(user_id, module, max_active) → JSONB
--      - kc_admin_get_post_limits()                           → JSONB
--      - kc_admin_delete_post_limit(limit_id)                 → JSONB
--      - kc_admin_get_user_active_posts_count(user_id)        → JSONB
--
-- Prioridade de limite (mais específico ganha):
--   1. user_id + module    (override individual por módulo)
--   2. user_id + NULL      (override individual geral)
--   3. NULL  + module      (padrão do módulo)
--   4. NULL  + NULL        (padrão global)
--   5. hardcoded = 5       (fallback se tabela vazia)
-- ============================================================

-- ── 1. Tabela post_limits ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_limits (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_id     UUID        REFERENCES public.profiles(id) ON DELETE CASCADE,
  module      TEXT,
  max_active  INT         NOT NULL DEFAULT 5
                          CHECK (max_active >= 0 AND max_active <= 1000)
);

COMMENT ON TABLE  public.post_limits IS 'Limite de publicações ativas por usuário/módulo. user_id=NULL significa global. module=NULL significa todos os módulos.';
COMMENT ON COLUMN public.post_limits.user_id IS 'NULL = aplica a todos os usuários (global).';
COMMENT ON COLUMN public.post_limits.module IS 'NULL = aplica a todos os módulos.';
COMMENT ON COLUMN public.post_limits.max_active IS 'Máximo de publicações com status=published permitidas.';

-- Índices para lookup rápido
CREATE INDEX IF NOT EXISTS post_limits_user_id_idx ON public.post_limits(user_id);
CREATE INDEX IF NOT EXISTS post_limits_module_idx  ON public.post_limits(module);

-- ── 2. RLS ──────────────────────────────────────────────────
ALTER TABLE public.post_limits ENABLE ROW LEVEL SECURITY;

-- Admins têm acesso total
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'post_limits' AND policyname = 'post_limits_admin_all'
  ) THEN
    CREATE POLICY post_limits_admin_all ON public.post_limits
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND is_admin = TRUE
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND is_admin = TRUE
        )
      );
  END IF;
END $$;

-- Usuários podem ver o próprio limite e o global
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'post_limits' AND policyname = 'post_limits_select_self'
  ) THEN
    CREATE POLICY post_limits_select_self ON public.post_limits
      FOR SELECT TO authenticated
      USING (user_id = auth.uid() OR user_id IS NULL);
  END IF;
END $$;

-- ── 3. kc_count_active_posts ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.kc_count_active_posts(
  p_user_id UUID,
  p_module  TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)
  FROM public.posts
  WHERE author_id = p_user_id
    AND status    = 'published'
    AND (p_module IS NULL OR module = p_module);
$$;

-- ── 4. kc_get_post_limit ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kc_get_post_limit(
  p_user_id UUID,
  p_module  TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT;
BEGIN
  -- Prioridade 1: user + module
  IF p_module IS NOT NULL THEN
    SELECT max_active INTO v_limit
    FROM public.post_limits
    WHERE user_id = p_user_id AND module = p_module
    LIMIT 1;
    IF FOUND THEN RETURN v_limit; END IF;
  END IF;

  -- Prioridade 2: user + all modules
  SELECT max_active INTO v_limit
  FROM public.post_limits
  WHERE user_id = p_user_id AND module IS NULL
  LIMIT 1;
  IF FOUND THEN RETURN v_limit; END IF;

  -- Prioridade 3: global + module
  IF p_module IS NOT NULL THEN
    SELECT max_active INTO v_limit
    FROM public.post_limits
    WHERE user_id IS NULL AND module = p_module
    LIMIT 1;
    IF FOUND THEN RETURN v_limit; END IF;
  END IF;

  -- Prioridade 4: global default
  SELECT max_active INTO v_limit
  FROM public.post_limits
  WHERE user_id IS NULL AND module IS NULL
  LIMIT 1;
  IF FOUND THEN RETURN v_limit; END IF;

  -- Prioridade 5: hardcoded
  RETURN 5;
END;
$$;

-- ── 5. kc_check_post_limit ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kc_check_post_limit(
  p_user_id UUID,
  p_module  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit BIGINT;
  v_count BIGINT;
BEGIN
  v_limit := kc_get_post_limit(p_user_id, p_module);
  v_count := kc_count_active_posts(p_user_id, p_module);

  RETURN jsonb_build_object(
    'ok',        v_count < v_limit,
    'limit',     v_limit,
    'count',     v_count,
    'remaining', GREATEST(0, v_limit - v_count)
  );
END;
$$;

-- ── 6. kc_toggle_post_status ─────────────────────────────────
-- RPC para o próprio autor alternar published ↔ hidden.
-- Bloqueia reativação quando o usuário está no limite.
CREATE OR REPLACE FUNCTION public.kc_toggle_post_status(
  p_post_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID;
  v_post      RECORD;
  v_new_status TEXT;
  v_check     JSONB;
BEGIN
  -- Autenticação
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'AUTH_REQUIRED',
      'message', 'Autenticação necessária para alterar o status da publicação.'
    );
  END IF;

  -- Lê o post (bypassa RLS para o autor ver o próprio post oculto)
  PERFORM set_config('row_security', 'off', TRUE);
  SELECT id, author_id, status, module
  INTO v_post
  FROM public.posts
  WHERE id = p_post_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'POST_NOT_FOUND',
      'message', 'Publicação não encontrada.'
    );
  END IF;

  -- Apenas o autor pode alternar
  IF v_post.author_id != v_user_id THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'FORBIDDEN',
      'message', 'Apenas o autor pode alterar o status desta publicação.'
    );
  END IF;

  -- Verifica se o status atual é manipulável pelo usuário
  IF v_post.status NOT IN ('published', 'hidden') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'INVALID_STATUS',
      'message', 'Esta publicação está em um estado que não permite ativação/desativação pelo autor (status: ' || v_post.status || ').'
    );
  END IF;

  -- Determina o novo status
  IF v_post.status = 'published' THEN
    -- Desabilitar: sempre permitido
    v_new_status := 'hidden';
  ELSE
    -- Reativar: verifica limite
    v_check := kc_check_post_limit(v_user_id, v_post.module);
    IF NOT (v_check->>'ok')::BOOLEAN THEN
      RETURN jsonb_build_object(
        'ok',      false,
        'code',    'LIMIT_REACHED',
        'message', 'Você já tem o máximo de publicações ativas permitidas (' || (v_check->>'limit') || '). Desabilite ou exclua outra publicação antes de reativar esta.',
        'limit',   (v_check->>'limit')::INT,
        'count',   (v_check->>'count')::INT,
        'module',  v_post.module
      );
    END IF;
    v_new_status := 'published';
  END IF;

  -- Aplica o novo status
  UPDATE public.posts
  SET status = v_new_status, updated_at = now()
  WHERE id = p_post_id;

  -- Registra no audit_log (falha silenciosamente se tabela não existir)
  BEGIN
    INSERT INTO public.audit_log (action, entity_type, entity_id, actor_id, payload)
    VALUES (
      'post_status_changed',
      'posts',
      p_post_id,
      v_user_id,
      jsonb_build_object(
        'old_status', v_post.status,
        'new_status', v_new_status,
        'source', 'user_toggle'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- audit_log ausente não bloqueia a operação
    NULL;
  END;

  RETURN jsonb_build_object(
    'ok',         true,
    'code',       'OK',
    'new_status', v_new_status,
    'message',    CASE
                    WHEN v_new_status = 'hidden'
                    THEN 'Publicação desabilitada com sucesso. Ela não aparece mais nos feeds.'
                    ELSE 'Publicação reativada com sucesso.'
                  END
  );
END;
$$;

-- Permissão de execução para usuários autenticados
GRANT EXECUTE ON FUNCTION public.kc_toggle_post_status(UUID) TO authenticated;

-- ── 7. kc_admin_set_post_limit ───────────────────────────────
CREATE OR REPLACE FUNCTION public.kc_admin_set_post_limit(
  p_user_id   UUID DEFAULT NULL,
  p_module    TEXT DEFAULT NULL,
  p_max_active INT DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id  UUID;
  v_is_admin  BOOLEAN;
  v_rows_updated INT;
BEGIN
  -- Admin check
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Autenticação necessária.');
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas administradores podem configurar limites.');
  END IF;

  IF p_max_active < 0 OR p_max_active > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_VALUE', 'message', 'Limite deve estar entre 0 e 1000.');
  END IF;

  -- Upsert manual (evita problema de UNIQUE com NULLs no PostgreSQL)
  UPDATE public.post_limits
  SET max_active = p_max_active,
      updated_at = now(),
      created_by = v_admin_id
  WHERE (p_user_id IS NULL     AND user_id IS NULL     OR user_id = p_user_id)
    AND (p_module  IS NULL     AND module  IS NULL     OR module  = p_module);

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    INSERT INTO public.post_limits (user_id, module, max_active, created_by)
    VALUES (p_user_id, p_module, p_max_active, v_admin_id);
  END IF;

  -- Audit log
  BEGIN
    INSERT INTO public.audit_log (action, entity_type, entity_id, actor_id, payload)
    VALUES (
      'post_limit_changed',
      'post_limits',
      COALESCE(p_user_id, '00000000-0000-0000-0000-000000000000'::UUID),
      v_admin_id,
      jsonb_build_object(
        'user_id',    p_user_id,
        'module',     p_module,
        'max_active', p_max_active
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object(
    'ok',        true,
    'code',      'OK',
    'message',   'Limite configurado com sucesso.',
    'user_id',   p_user_id,
    'module',    p_module,
    'max_active', p_max_active
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.kc_admin_set_post_limit(UUID, TEXT, INT) TO authenticated;

-- ── 8. kc_admin_get_post_limits ──────────────────────────────
CREATE OR REPLACE FUNCTION public.kc_admin_get_post_limits()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
  v_is_admin BOOLEAN;
  v_limits   JSONB;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',         pl.id,
      'user_id',    pl.user_id,
      'module',     pl.module,
      'max_active', pl.max_active,
      'created_at', pl.created_at,
      'updated_at', pl.updated_at,
      'user_name',  COALESCE(p.display_name, p.full_name, '—')
    )
    ORDER BY pl.user_id NULLS FIRST, pl.module NULLS FIRST
  )
  INTO v_limits
  FROM public.post_limits pl
  LEFT JOIN public.profiles p ON p.id = pl.user_id;

  RETURN jsonb_build_object(
    'ok',     true,
    'limits', COALESCE(v_limits, '[]'::JSONB)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.kc_admin_get_post_limits() TO authenticated;

-- ── 9. kc_admin_delete_post_limit ────────────────────────────
CREATE OR REPLACE FUNCTION public.kc_admin_delete_post_limit(
  p_limit_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
  v_is_admin BOOLEAN;
  v_rows_deleted INT;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  DELETE FROM public.post_limits WHERE id = p_limit_id;
  GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;

  IF v_rows_deleted = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Limite não encontrado.');
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'OK', 'message', 'Limite removido.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.kc_admin_delete_post_limit(UUID) TO authenticated;

-- ── 10. kc_admin_get_user_active_posts_count ─────────────────
-- Retorna a contagem de publicações ativas de um usuário específico
-- junto com o limite efetivo, para exibição no painel admin.
CREATE OR REPLACE FUNCTION public.kc_admin_get_user_active_posts_count(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id  UUID;
  v_is_admin  BOOLEAN;
  v_count     BIGINT;
  v_limit     INT;
  v_user_name TEXT;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  SELECT COALESCE(display_name, full_name, 'Usuário') INTO v_user_name
  FROM public.profiles WHERE id = p_user_id;

  v_count := kc_count_active_posts(p_user_id, NULL);
  v_limit := kc_get_post_limit(p_user_id, NULL);

  RETURN jsonb_build_object(
    'ok',        true,
    'user_id',   p_user_id,
    'user_name', COALESCE(v_user_name, '—'),
    'count',     v_count,
    'limit',     v_limit,
    'remaining', GREATEST(0, v_limit - v_count),
    'at_limit',  v_count >= v_limit
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.kc_admin_get_user_active_posts_count(UUID) TO authenticated;

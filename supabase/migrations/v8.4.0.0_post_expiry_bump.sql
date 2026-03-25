-- ============================================================
-- KinoCampus v8.4.0.0 — Expiração automática (30 dias) + Impulsionar
-- ============================================================
--
--  Novidades:
--    - posts.expires_at    : quando o post expira (created_at + 30 dias)
--    - posts.bumped_at     : última vez que o post foi impulsionado
--    - status 'expired'    : posts expirados ficam invisíveis (como 'hidden')
--    - kc_expire_old_posts()  : expira posts com expires_at <= now()
--    - kc_renew_post()        : renova post (expired|hidden → published + 30 dias)
--    - kc_bump_post()         : impulsiona post (cooldown 7 dias)
--    - kc_toggle_post_status: atualizado para aceitar 'expired' como reativável
--    - pg_cron: job diário às 03:00 UTC para expirar posts
-- ============================================================

-- ── 1. Novas colunas em posts ────────────────────────────────

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bumped_at   TIMESTAMPTZ;

-- Popula expires_at para posts existentes publicados (30 dias a partir da criação)
UPDATE public.posts
SET expires_at = created_at + INTERVAL '30 days'
WHERE expires_at IS NULL
  AND status IN ('published', 'pending');

-- Cria índice para o job de expiração ser eficiente
CREATE INDEX IF NOT EXISTS posts_expires_at_idx
  ON public.posts (expires_at)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS posts_bumped_at_idx
  ON public.posts (bumped_at DESC NULLS LAST)
  WHERE status = 'published';

-- ── 2. Adicionar 'expired' à constraint de status ────────────

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_status_check;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_status_check
  CHECK (status IN ('published', 'pending', 'hidden', 'deleted', 'expired'));

-- ── 3. kc_expire_old_posts ───────────────────────────────────
-- Job diário: expira posts publicados cujo expires_at já passou.
CREATE OR REPLACE FUNCTION public.kc_expire_old_posts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_count INT;
  v_expired_ids   UUID[];
BEGIN
  -- Coleta IDs antes de atualizar (para audit_log)
  SELECT ARRAY(
    SELECT id FROM public.posts
    WHERE status = 'published'
      AND expires_at IS NOT NULL
      AND expires_at <= now()
  ) INTO v_expired_ids;

  -- Expira os posts
  UPDATE public.posts
  SET status     = 'expired',
      updated_at = now()
  WHERE status    = 'published'
    AND expires_at IS NOT NULL
    AND expires_at <= now();

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;

  -- Audit log para cada post expirado (silencioso se tabela não existir)
  IF v_expired_count > 0 THEN
    BEGIN
      INSERT INTO public.audit_log (action, entity_type, entity_id, actor_id, payload)
      SELECT
        'post_expired',
        'posts',
        id,
        NULL,
        jsonb_build_object('source', 'pg_cron', 'expires_at', expires_at)
      FROM public.posts
      WHERE id = ANY(v_expired_ids);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok',            true,
    'expired_count', v_expired_count,
    'ran_at',        now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.kc_expire_old_posts() TO authenticated;

-- ── 4. kc_renew_post ─────────────────────────────────────────
-- Renova um post expirado ou oculto: published + 30 dias a partir de agora.
-- Verifica limite de publicações ativas antes de renovar.
CREATE OR REPLACE FUNCTION public.kc_renew_post(
  p_post_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID;
  v_post       RECORD;
  v_check      JSONB;
  v_expires_at TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED',
      'message', 'Autenticação necessária.');
  END IF;

  -- Lê o post bypassando RLS (dono pode ver próprios posts hidden/expired)
  PERFORM set_config('row_security', 'off', TRUE);
  SELECT id, author_id, status, module
  INTO v_post
  FROM public.posts
  WHERE id = p_post_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND',
      'message', 'Publicação não encontrada.');
  END IF;

  IF v_post.author_id != v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN',
      'message', 'Apenas o autor pode renovar esta publicação.');
  END IF;

  IF v_post.status NOT IN ('expired', 'hidden') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATUS',
      'message', 'Apenas publicações expiradas ou desabilitadas podem ser renovadas (status atual: ' || v_post.status || ').');
  END IF;

  -- Verifica limite de publicações ativas
  v_check := kc_check_post_limit(v_user_id, v_post.module);
  IF NOT (v_check->>'ok')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'ok',      false,
      'code',    'LIMIT_REACHED',
      'message', 'Você já tem o máximo de publicações ativas (' || (v_check->>'limit') || '). Desabilite ou exclua outra antes de renovar esta.',
      'limit',   (v_check->>'limit')::INT,
      'count',   (v_check->>'count')::INT,
      'module',  v_post.module
    );
  END IF;

  v_expires_at := now() + INTERVAL '30 days';

  UPDATE public.posts
  SET status     = 'published',
      expires_at = v_expires_at,
      updated_at = now()
  WHERE id = p_post_id;

  -- Audit log
  BEGIN
    INSERT INTO public.audit_log (action, entity_type, entity_id, actor_id, payload)
    VALUES (
      'post_renewed',
      'posts',
      p_post_id,
      v_user_id,
      jsonb_build_object(
        'old_status',   v_post.status,
        'new_status',   'published',
        'expires_at',   v_expires_at,
        'source',       'user_renew'
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'ok',         true,
    'code',       'OK',
    'new_status', 'published',
    'expires_at', v_expires_at,
    'message',    'Publicação renovada com sucesso! Fica disponível por mais 30 dias.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.kc_renew_post(UUID) TO authenticated;

-- ── 5. kc_bump_post ──────────────────────────────────────────
-- Impulsiona o post para o topo dos Recentes.
-- Cooldown: 7 dias entre impulsos.
CREATE OR REPLACE FUNCTION public.kc_bump_post(
  p_post_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id         UUID;
  v_post            RECORD;
  v_cooldown_days   INT := 7;
  v_next_bump_at    TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED',
      'message', 'Autenticação necessária.');
  END IF;

  PERFORM set_config('row_security', 'off', TRUE);
  SELECT id, author_id, status, bumped_at
  INTO v_post
  FROM public.posts
  WHERE id = p_post_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND',
      'message', 'Publicação não encontrada.');
  END IF;

  IF v_post.author_id != v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN',
      'message', 'Apenas o autor pode impulsionar esta publicação.');
  END IF;

  IF v_post.status != 'published' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATUS',
      'message', 'Apenas publicações ativas podem ser impulsionadas.');
  END IF;

  -- Verifica cooldown
  IF v_post.bumped_at IS NOT NULL
     AND v_post.bumped_at > now() - (v_cooldown_days || ' days')::INTERVAL THEN
    v_next_bump_at := v_post.bumped_at + (v_cooldown_days || ' days')::INTERVAL;
    RETURN jsonb_build_object(
      'ok',              false,
      'code',            'COOLDOWN_ACTIVE',
      'message',         'Você já impulsionou este anúncio recentemente. Próximo impulso disponível em ' ||
                         to_char(v_next_bump_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || '.',
      'next_bump_at',    v_next_bump_at,
      'cooldown_days',   v_cooldown_days
    );
  END IF;

  UPDATE public.posts
  SET bumped_at  = now(),
      updated_at = now()
  WHERE id = p_post_id;

  -- Audit log
  BEGIN
    INSERT INTO public.audit_log (action, entity_type, entity_id, actor_id, payload)
    VALUES (
      'post_bumped',
      'posts',
      p_post_id,
      v_user_id,
      jsonb_build_object('bumped_at', now(), 'source', 'user_bump')
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'ok',            true,
    'code',          'OK',
    'bumped_at',     now(),
    'next_bump_at',  now() + (v_cooldown_days || ' days')::INTERVAL,
    'message',       'Anúncio impulsionado! Ele aparece agora no topo dos Recentes.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.kc_bump_post(UUID) TO authenticated;

-- ── 6. Atualizar kc_toggle_post_status para aceitar 'expired' ─

CREATE OR REPLACE FUNCTION public.kc_toggle_post_status(
  p_post_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID;
  v_post       RECORD;
  v_new_status TEXT;
  v_check      JSONB;
  v_expires_at TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED',
      'message', 'Autenticação necessária para alterar o status da publicação.');
  END IF;

  PERFORM set_config('row_security', 'off', TRUE);
  SELECT id, author_id, status, module, expires_at
  INTO v_post
  FROM public.posts
  WHERE id = p_post_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND',
      'message', 'Publicação não encontrada.');
  END IF;

  IF v_post.author_id != v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN',
      'message', 'Apenas o autor pode alterar o status desta publicação.');
  END IF;

  -- Posts expirados devem ser renovados via kc_renew_post, não toggleados
  IF v_post.status = 'expired' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'USE_RENEW',
      'message', 'Esta publicação está expirada. Use "Renovar publicação" para reativá-la.');
  END IF;

  IF v_post.status NOT IN ('published', 'hidden') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATUS',
      'message', 'Esta publicação está em um estado que não permite ativação/desativação (status: ' || v_post.status || ').');
  END IF;

  IF v_post.status = 'published' THEN
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
    -- Renova expires_at ao reativar
    v_expires_at := now() + INTERVAL '30 days';
  END IF;

  UPDATE public.posts
  SET status     = v_new_status,
      expires_at = CASE WHEN v_new_status = 'published' THEN v_expires_at ELSE v_post.expires_at END,
      updated_at = now()
  WHERE id = p_post_id;

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
        'source',     'user_toggle'
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'ok',         true,
    'code',       'OK',
    'new_status', v_new_status,
    'expires_at', CASE WHEN v_new_status = 'published' THEN v_expires_at ELSE NULL END,
    'message',    CASE
                    WHEN v_new_status = 'hidden'
                    THEN 'Anúncio desabilitado. Ele não aparece mais nos feeds.'
                    ELSE 'Anúncio reativado! Fica disponível por 30 dias.'
                  END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.kc_toggle_post_status(UUID) TO authenticated;

-- ── 7. pg_cron: expirar posts diariamente ────────────────────
-- Requer extensão pg_cron habilitada no Supabase Dashboard
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Remove job anterior se existir
    PERFORM cron.unschedule('kc-expire-old-posts');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.schedule(
      'kc-expire-old-posts',
      '0 3 * * *',
      'SELECT public.kc_expire_old_posts()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Kino Campus — v9.3.2.0
-- Moderação Automática Anti-Spam
--
-- Escopo:
--   1) Coluna posts.moderation_reason TEXT — registra razão da auto-moderação
--   2) Trigger BEFORE INSERT em public.posts com 3 verificações em cascata:
--      a) Flood control — max 3 posts/hora (hard block — RAISE EXCEPTION)
--      b) Link spam — >3 URLs externas → status='pending', moderation_reason='link_spam'
--      c) New user trust — conta <7 dias + 0 posts aprovados → status='pending', reason='new_user_scrutiny'
--   3) Index parcial para consulta de flood control
--   4) Revogar EXECUTE da função trigger de anon/authenticated
--   5) Registro em audit_log para posts auto-moderados
--
-- Notas de design:
--   - Flood control é hard block (RAISE EXCEPTION 'flood_limit_exceeded')
--   - Link spam e new user trust são soft gates (post criado como 'pending')
--   - RLS já esconde posts 'pending' de outros usuários (autor e admin podem ver)
--   - SECURITY DEFINER + SET search_path = '' (padrão v9.2.3)
--   - Trigger ordering: trg_anti_spam_gate < trg_set_post_expires_at (alfabético)

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────────
-- 1) Coluna moderation_reason em posts
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT DEFAULT NULL;

COMMENT ON COLUMN public.posts.moderation_reason IS
  'Razão da auto-moderação: flood_control, link_spam, new_user_scrutiny. NULL = sem moderação automática.';

-- ──────────────────────────────────────────────────────────────────────────────
-- 2) Função trigger anti-spam
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.kc_anti_spam_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_recent_count   INTEGER := 0;
  v_url_count      INTEGER := 0;
  v_approved_count INTEGER := 0;
  v_profile_created_at TIMESTAMPTZ;
BEGIN

  -- ── Verificação 1: Flood control (max 3 posts/hora) ─────────────────────
  -- Hard block: levanta exceção que o frontend mapeia para FLOOD_LIMIT
  SELECT COUNT(*)
    INTO v_recent_count
    FROM public.posts
   WHERE author_id = NEW.author_id
     AND created_at > now() - interval '1 hour';

  IF v_recent_count >= 3 THEN
    RAISE EXCEPTION 'flood_limit_exceeded'
      USING HINT    = 'Limite de 3 publicações por hora atingido. Aguarde antes de publicar novamente.',
            ERRCODE = 'P0001';
  END IF;

  -- ── Verificação 2: Link spam (>3 URLs externas) ──────────────────────────
  -- Soft gate: post criado como 'pending' para revisão do admin
  SELECT COUNT(m[1])
    INTO v_url_count
    FROM regexp_matches(
      COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.title, ''),
      'https?://[^\s)>\]"'']+',
      'gi'
    ) AS m;

  IF v_url_count > 3 THEN
    NEW.status            := 'pending';
    NEW.moderation_reason := 'link_spam';
  END IF;

  -- ── Verificação 3: New user trust score ─────────────────────────────────
  -- Conta <7 dias + 0 posts aprovados → soft gate
  SELECT p.created_at
    INTO v_profile_created_at
    FROM public.profiles p
   WHERE p.id = NEW.author_id;

  IF v_profile_created_at IS NOT NULL AND v_profile_created_at > now() - interval '7 days' THEN
    SELECT COUNT(*)
      INTO v_approved_count
      FROM public.posts
     WHERE author_id = NEW.author_id
       AND status = 'published';

    IF v_approved_count = 0 THEN
      NEW.status            := 'pending';
      -- Só define razão se link_spam não a definiu (mais específica)
      NEW.moderation_reason := COALESCE(NEW.moderation_reason, 'new_user_scrutiny');
    END IF;
  END IF;

  -- ── Registro em audit_log para posts auto-moderados ─────────────────────
  IF NEW.status = 'pending' THEN
    BEGIN
      INSERT INTO public.audit_log (action, entity_type, entity_id, actor_id, payload)
      VALUES (
        'post_auto_moderated',
        'posts',
        NEW.id,
        NEW.author_id,
        jsonb_build_object(
          'reason',          NEW.moderation_reason,
          'original_status', 'published',
          'new_status',      'pending',
          'module',          NEW.module
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- Falha no audit_log não bloqueia a criação do post
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3) Trigger na tabela posts
-- ──────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_anti_spam_gate ON public.posts;

CREATE TRIGGER trg_anti_spam_gate
  BEFORE INSERT ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.kc_anti_spam_gate();

-- ──────────────────────────────────────────────────────────────────────────────
-- 4) Index para flood control (consulta por author_id + created_at recente)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_posts_author_created_desc
  ON public.posts (author_id, created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────────
-- 5) Revogar EXECUTE da função trigger (chamada apenas pelo trigger)
-- ──────────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.kc_anti_spam_gate() FROM anon, authenticated;

COMMIT;

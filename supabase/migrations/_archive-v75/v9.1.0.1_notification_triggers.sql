-- ============================================================
-- KinoCampus v9.1.0.1 — Triggers de Notificação
-- ============================================================
--
--  Triggers:
--    - kc_notify_on_comment    → notifica autor do post quando recebe comentário
--    - kc_notify_on_vote       → notifica autor do post quando recebe voto positivo
--    - kc_notify_on_post_expire → notifica autor quando seu post expira
-- ============================================================

-- ── 1. kc_notify_on_comment ──────────────────────────────────
-- Disparado após INSERT em comments.
-- Notifica o autor do post (ignora se o comentário é do próprio autor).

CREATE OR REPLACE FUNCTION public.kc_notify_on_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post      RECORD;
  v_commenter RECORD;
  v_title     TEXT;
  v_body      TEXT;
BEGIN
  -- Buscar o post comentado
  SELECT id, author_id, title, module
  INTO v_post
  FROM public.posts
  WHERE id = NEW.post_id;

  -- Se post não existe ou autor é o próprio comentarista, ignorar
  IF v_post IS NULL OR v_post.author_id = NEW.author_id THEN
    RETURN NEW;
  END IF;

  -- Buscar nome do comentarista
  SELECT display_name
  INTO v_commenter
  FROM public.profiles
  WHERE id = NEW.author_id;

  v_title := COALESCE(v_commenter.display_name, 'Alguém') || ' comentou no seu post';
  v_body  := left(NEW.content, 120);

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_post.author_id,
    'comment_on_post',
    v_title,
    v_body,
    jsonb_build_object(
      'post_id', v_post.id::TEXT,
      'post_title', left(v_post.title, 80),
      'comment_id', NEW.id::TEXT,
      'actor_id', NEW.author_id::TEXT,
      'actor_name', COALESCE(v_commenter.display_name, ''),
      'module', v_post.module
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Falha silenciosa — notificação não deve quebrar o fluxo principal
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kc_trigger_notify_on_comment ON public.comments;
CREATE TRIGGER kc_trigger_notify_on_comment
  AFTER INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.kc_notify_on_comment();

-- ── 2. kc_notify_on_vote ─────────────────────────────────────
-- Disparado após INSERT em post_votes.
-- Notifica o autor do post quando recebe voto positivo (ignora self-vote e downvotes).

CREATE OR REPLACE FUNCTION public.kc_notify_on_vote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post  RECORD;
  v_voter RECORD;
  v_title TEXT;
BEGIN
  -- Apenas votos positivos geram notificação
  IF NEW.direction <> 'up' THEN
    RETURN NEW;
  END IF;

  -- Buscar o post votado
  SELECT id, author_id, title, module
  INTO v_post
  FROM public.posts
  WHERE id = NEW.post_id;

  -- Se post não existe ou voto é do próprio autor, ignorar
  IF v_post IS NULL OR v_post.author_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Buscar nome do votante
  SELECT display_name
  INTO v_voter
  FROM public.profiles
  WHERE id = NEW.user_id;

  v_title := COALESCE(v_voter.display_name, 'Alguém') || ' votou no seu post';

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_post.author_id,
    'vote_on_post',
    v_title,
    left(v_post.title, 120),
    jsonb_build_object(
      'post_id', v_post.id::TEXT,
      'post_title', left(v_post.title, 80),
      'actor_id', NEW.user_id::TEXT,
      'actor_name', COALESCE(v_voter.display_name, ''),
      'module', v_post.module
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kc_trigger_notify_on_vote ON public.post_votes;
CREATE TRIGGER kc_trigger_notify_on_vote
  AFTER INSERT ON public.post_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.kc_notify_on_vote();

-- ── 3. kc_notify_on_post_expire ──────────────────────────────
-- Chamado por kc_expire_old_posts (não é trigger automático).
-- Criamos uma versão que notifica o autor quando o post expira.
-- Precisamos atualizar kc_expire_old_posts para chamar esta função.

CREATE OR REPLACE FUNCTION public.kc_notify_on_post_expire(p_post_id UUID, p_author_id UUID, p_title TEXT, p_module TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    p_author_id,
    'post_expired',
    'Seu post expirou',
    left(p_title, 120),
    jsonb_build_object(
      'post_id', p_post_id::TEXT,
      'post_title', left(p_title, 80),
      'module', p_module
    )
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- ── 4. Atualizar kc_expire_old_posts para notificar ──────────
-- Recria a função para incluir notificações de expiração.

CREATE OR REPLACE FUNCTION public.kc_expire_old_posts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count   BIGINT := 0;
  v_expired RECORD;
BEGIN
  -- Loop por posts a expirar, notificando cada autor
  FOR v_expired IN
    SELECT id, author_id, title, module
    FROM public.posts
    WHERE status = 'published'
      AND expires_at IS NOT NULL
      AND expires_at <= now()
  LOOP
    -- Atualizar status
    UPDATE public.posts
    SET status = 'expired', updated_at = now()
    WHERE id = v_expired.id;

    v_count := v_count + 1;

    -- Notificar autor (silencioso em caso de erro)
    BEGIN
      PERFORM public.kc_notify_on_post_expire(
        v_expired.id,
        v_expired.author_id,
        v_expired.title,
        v_expired.module
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  -- Audit log
  IF v_count > 0 THEN
    BEGIN
      INSERT INTO public.audit_log (action, entity_type, entity_id, payload)
      VALUES (
        'posts_expired',
        'system',
        gen_random_uuid(),
        jsonb_build_object('count', v_count, 'ran_at', now()::TEXT)
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'expired_count', v_count);
END;
$$;

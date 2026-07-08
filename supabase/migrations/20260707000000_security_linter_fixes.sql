-- ============================================================================
-- 20260707000000_security_linter_fixes.sql
-- V76.59 — Correção de 3 warnings de segurança do Supabase Database Linter
--
-- Problemas corrigidos:
-- 1. function_search_path_mutable: kc_unit_meta_touch sem SET search_path
-- 2. authenticated_security_definer_function_executable: kc_chat_set_message_reply
-- 3. authenticated_security_definer_function_executable: kc_chat_toggle_reaction
--
-- Padrão aplicado (igual às demais funções kc_chat_*):
-- - public schema: wrapper SECURITY INVOKER, LANGUAGE sql, SET search_path=''
-- - kc_private schema: implementação SECURITY DEFINER, SET search_path=''
-- ============================================================================

-- ============================================================================
-- FIX 1: kc_unit_meta_touch — adicionar SET search_path = '' (trigger function)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.kc_unit_meta_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
begin
    new.updated_at = now();
    return new;
end;
$$;


-- ============================================================================
-- FIX 2: kc_chat_set_message_reply — mover SECURITY DEFINER para kc_private
-- ============================================================================

-- 2a. Implementação SECURITY DEFINER em kc_private
CREATE OR REPLACE FUNCTION kc_private.kc_chat_set_message_reply(
  p_message_id uuid,
  p_reply_to_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  v_user uuid := auth.uid();
  v_msg public.chat_messages%rowtype;
  v_reply_conversation uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  select * into v_msg
  from public.chat_messages
  where id = p_message_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'message_not_found');
  end if;

  if v_msg.sender_id <> v_user then
    return jsonb_build_object('ok', false, 'error', 'not_sender');
  end if;

  if v_msg.deleted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_deleted');
  end if;

  if p_reply_to_id is not null then
    select conversation_id into v_reply_conversation
    from public.chat_messages
    where id = p_reply_to_id
      and deleted_at is null;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'reply_message_not_found');
    end if;

    if v_reply_conversation <> v_msg.conversation_id then
      return jsonb_build_object('ok', false, 'error', 'reply_wrong_conversation');
    end if;
  end if;

  update public.chat_messages
  set reply_to_id = p_reply_to_id
  where id = p_message_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- kc_private precisa de EXECUTE para authenticated (o wrapper INVOKER roda como authenticated)
GRANT EXECUTE ON FUNCTION kc_private.kc_chat_set_message_reply(uuid, uuid) TO authenticated;

-- 2b. Wrapper public SECURITY INVOKER (delegação simples para kc_private)
DROP FUNCTION IF EXISTS public.kc_chat_set_message_reply(uuid, uuid);
CREATE FUNCTION public.kc_chat_set_message_reply(
  p_message_id uuid,
  p_reply_to_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  select kc_private.kc_chat_set_message_reply($1, $2);
$$;

GRANT EXECUTE ON FUNCTION public.kc_chat_set_message_reply(uuid, uuid) TO authenticated;


-- ============================================================================
-- FIX 3: kc_chat_toggle_reaction — mover SECURITY DEFINER para kc_private
-- ============================================================================

-- 3a. Implementação SECURITY DEFINER em kc_private
CREATE OR REPLACE FUNCTION kc_private.kc_chat_toggle_reaction(
  p_message_id uuid,
  p_emoji text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  v_user uuid := auth.uid();
  v_existing record;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;
  if p_emoji not in ('👍','❤️','😂','😮','😢','👏') then
    return jsonb_build_object('ok', false, 'error', 'invalid_emoji');
  end if;
  -- Verifica se o usuário é participante da conversa da mensagem
  if not exists (
    select 1 from public.chat_messages m
    join public.chat_conversations c on c.id = m.conversation_id
    where m.id = p_message_id
      and v_user in (c.participant_low, c.participant_high)
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_a_participant');
  end if;
  -- Verifica se já existe
  select * into v_existing from public.chat_reactions
    where message_id = p_message_id and user_id = v_user and emoji = p_emoji;
  if found then
    delete from public.chat_reactions where id = v_existing.id;
    return jsonb_build_object('ok', true, 'action', 'removed');
  else
    insert into public.chat_reactions (message_id, user_id, emoji)
      values (p_message_id, v_user, p_emoji);
    return jsonb_build_object('ok', true, 'action', 'added');
  end if;
end;
$$;

-- kc_private precisa de EXECUTE para authenticated (o wrapper INVOKER roda como authenticated)
GRANT EXECUTE ON FUNCTION kc_private.kc_chat_toggle_reaction(uuid, text) TO authenticated;

-- 3b. Wrapper public SECURITY INVOKER (delegação simples para kc_private)
DROP FUNCTION IF EXISTS public.kc_chat_toggle_reaction(uuid, text);
CREATE FUNCTION public.kc_chat_toggle_reaction(
  p_message_id uuid,
  p_emoji text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  select kc_private.kc_chat_toggle_reaction($1, $2);
$$;

GRANT EXECUTE ON FUNCTION public.kc_chat_toggle_reaction(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

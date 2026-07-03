-- 20260703175720_harden_chat_anon_execute.sql
-- Ajustes de segurança/compatibilidade para mensagens:
-- 1. remove execução anon de RPCs de chat que dependem de auth.uid();
-- 2. cria RPC para gravar reply_to_id sem depender de UPDATE direto em chat_messages.

create or replace function public.kc_chat_set_message_reply(
  p_message_id uuid,
  p_reply_to_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

comment on function public.kc_chat_set_message_reply(uuid, uuid) is
  'v9.3.5.24: define reply_to_id de mensagem própria validando auth.uid() e mesma conversa.';

revoke all on function public.kc_chat_set_message_reply(uuid, uuid) from public, anon, authenticated;
grant execute on function public.kc_chat_set_message_reply(uuid, uuid) to authenticated;

-- Essas RPCs já validam auth.uid(); anon não precisa executá-las.
revoke all on function public.kc_chat_list_messages(uuid, integer, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.kc_chat_list_messages(uuid, integer, timestamp with time zone) to authenticated;

revoke all on function public.kc_chat_toggle_reaction(uuid, text) from public, anon, authenticated;
grant execute on function public.kc_chat_toggle_reaction(uuid, text) to authenticated;

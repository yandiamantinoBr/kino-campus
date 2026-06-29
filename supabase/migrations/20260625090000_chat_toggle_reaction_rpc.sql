-- 20260625090000_chat_toggle_reaction_rpc.sql
-- RPC kc_chat_toggle_reaction: insere/remove reação usando auth.uid() internamente.
-- Espelha o que foi aplicado em produção via Management API.

create or replace function public.kc_chat_toggle_reaction(
  p_message_id uuid,
  p_emoji text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  if not exists (
    select 1 from public.chat_messages m
    join public.chat_conversations c on c.id = m.conversation_id
    where m.id = p_message_id
      and v_user in (c.participant_low, c.participant_high)
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_a_participant');
  end if;
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

revoke all on function public.kc_chat_toggle_reaction(uuid, text) from public;
grant execute on function public.kc_chat_toggle_reaction(uuid, text) to authenticated;

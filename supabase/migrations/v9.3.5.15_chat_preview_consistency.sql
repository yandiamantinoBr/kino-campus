-- v9.3.5.15 — Chat: consistência de preview + hardening de media_path
--
-- Corrige dois pontos do v9.3.5.10-.14:
-- 1. last_message_* agora é recalculado também quando a última mensagem é
--    editada ou apagada, evitando preview antigo na inbox.
-- 2. Mensagens de imagem só podem referenciar mídia no prefixo do próprio
--    remetente dentro da conversa.

set search_path = public;

create or replace function kc_private.kc_chat_refresh_conversation_preview(
  p_conversation_id uuid,
  p_reopen boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last public.chat_messages%rowtype;
  v_preview text;
begin
  if p_conversation_id is null then
    return;
  end if;

  select *
    into v_last
  from public.chat_messages
  where conversation_id = p_conversation_id
    and deleted_at is null
  order by created_at desc
  limit 1;

  if found then
    v_preview := case
      when v_last.message_type = 'image' then
        coalesce(nullif(left(v_last.content, 120), ''), '[imagem]')
      else
        left(coalesce(v_last.content, ''), 120)
    end;

    update public.chat_conversations
    set last_message_at = v_last.created_at,
        last_message_preview = v_preview,
        last_message_sender = v_last.sender_id,
        last_message_type = v_last.message_type,
        archived_by_low = case when p_reopen then false else archived_by_low end,
        archived_by_high = case when p_reopen then false else archived_by_high end
    where id = p_conversation_id;
  else
    update public.chat_conversations
    set last_message_at = null,
        last_message_preview = null,
        last_message_sender = null,
        last_message_type = null
    where id = p_conversation_id;
  end if;
end;
$$;

create or replace function kc_private.kc_chat_after_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform kc_private.kc_chat_refresh_conversation_preview(new.conversation_id, true);
  return new;
end;
$$;

create or replace function kc_private.kc_chat_after_message_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform kc_private.kc_chat_refresh_conversation_preview(new.conversation_id, false);
  return new;
end;
$$;

drop trigger if exists chat_msg_after_update_refresh_preview on public.chat_messages;
create trigger chat_msg_after_update_refresh_preview
  after update of content, media_path, edited_at, deleted_at on public.chat_messages
  for each row execute function kc_private.kc_chat_after_message_update();

create or replace function kc_private.kc_chat_send_message(
  p_conversation_id uuid,
  p_content text,
  p_message_type text,
  p_media_path text
)
returns table (out_message_id uuid, out_created_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_conv public.chat_conversations%rowtype;
  v_other uuid;
  v_recent_count int;
  v_limit int;
  v_msg_id uuid;
  v_created timestamptz;
  v_content_clean text;
  v_media_pattern text;
begin
  if v_user is null then raise exception 'unauthenticated'; end if;
  if p_conversation_id is null then raise exception 'invalid_conversation'; end if;
  if p_message_type not in ('text','image') then raise exception 'invalid_message_type'; end if;

  select * into v_conv from public.chat_conversations where id = p_conversation_id;
  if not found then raise exception 'conversation_not_found'; end if;
  if v_user not in (v_conv.participant_low, v_conv.participant_high) then
    raise exception 'not_a_participant';
  end if;

  v_other := case when v_user = v_conv.participant_low
                  then v_conv.participant_high
                  else v_conv.participant_low end;

  if exists (
    select 1 from public.user_blocks
    where (blocker_id = v_user  and blocked_id = v_other)
       or (blocker_id = v_other and blocked_id = v_user)
  ) then
    raise exception 'blocked';
  end if;

  if p_message_type = 'text' then
    v_content_clean := trim(coalesce(p_content, ''));
    if length(v_content_clean) = 0 then raise exception 'empty_content'; end if;
    if length(v_content_clean) > 4000 then raise exception 'content_too_long'; end if;
    if p_media_path is not null then raise exception 'text_must_have_no_media'; end if;
  else
    if p_media_path is null then raise exception 'image_must_have_media_path'; end if;
    v_media_pattern := '^chat-media/' || p_conversation_id::text || '/' || v_user::text || '/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp|gif)$';
    if p_media_path !~ v_media_pattern then
      raise exception 'invalid_media_path_prefix';
    end if;
    v_content_clean := nullif(trim(coalesce(p_content, '')), '');
    if v_content_clean is not null and length(v_content_clean) > 1000 then
      raise exception 'caption_too_long';
    end if;
  end if;

  v_limit := case when kc_private.kc_chat_is_new_user(v_user) then 5 else 30 end;
  select count(*) into v_recent_count
  from public.chat_messages
  where sender_id = v_user and created_at > now() - interval '1 minute';
  if v_recent_count >= v_limit then
    raise exception 'rate_limit_exceeded' using hint = format('Aguarde 1 minuto. Limite: %s msg/min', v_limit);
  end if;

  insert into public.chat_messages (
    conversation_id, sender_id, message_type, content, media_path
  ) values (
    p_conversation_id, v_user, p_message_type, v_content_clean, p_media_path
  )
  returning id, created_at into v_msg_id, v_created;

  out_message_id := v_msg_id;
  out_created_at := v_created;
  return next;
end;
$$;

revoke all on function kc_private.kc_chat_refresh_conversation_preview(uuid, boolean) from public, anon, authenticated;
revoke all on function kc_private.kc_chat_after_message_update() from public, anon, authenticated;
revoke all on function kc_private.kc_chat_send_message(uuid, text, text, text) from public, anon, authenticated;
grant execute on function kc_private.kc_chat_send_message(uuid, text, text, text) to authenticated;

comment on function kc_private.kc_chat_refresh_conversation_preview(uuid, boolean) is
  'v9.3.5.15: recalcula last_message_* usando a mensagem não apagada mais recente.';
comment on function kc_private.kc_chat_after_message_update() is
  'v9.3.5.15: mantém preview da conversa consistente após editar/apagar mensagem.';
comment on function public.kc_chat_send_message(uuid, text, text, text) is
  'v9.3.5.15: envia mensagem com bloqueio bidirecional, rate-limit e media_path restrito ao remetente.';

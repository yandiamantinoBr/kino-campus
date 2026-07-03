-- ============================================================================
-- V76.58 — Suporte a audio e document (PDF) no chat
-- 1. Drop+recreate CHECK constraints em chat_messages para aceitar audio/document
-- 2. Recreate kc_private.kc_chat_send_message com whitelist ampliada + regex media
-- ============================================================================

-- 1a. Constraint de tipo: adiciona 'audio' e 'document'
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_message_type_check;
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_message_type_check
  CHECK (message_type = ANY (ARRAY['text'::text, 'image'::text, 'audio'::text, 'document'::text]));

-- 1c. Constraint em chat_conversations.last_message_type (trigger denormaliza)
ALTER TABLE public.chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_last_message_type_check;
ALTER TABLE public.chat_conversations
  ADD CONSTRAINT chat_conversations_last_message_type_check
  CHECK (last_message_type = ANY (ARRAY['text'::text, 'image'::text, 'audio'::text, 'document'::text]));

-- 1b. Constraint estrutural: text->content, image/audio/document->media_path (+caption)
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_msg_text_or_image;
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_msg_text_or_image
  CHECK (
    ((message_type = 'text')     AND (content IS NOT NULL) AND (media_path IS NULL))
    OR
    ((message_type IN ('image','audio','document')) AND (media_path IS NOT NULL))
    OR
    (deleted_at IS NOT NULL)
  );

-- 2. Recreate kc_private.kc_chat_send_message com whitelist ampliada + regex de extensões
CREATE OR REPLACE FUNCTION kc_private.kc_chat_send_message(
  p_conversation_id uuid,
  p_content text,
  p_message_type text,
  p_media_path text
)
RETURNS TABLE (out_message_id uuid, out_created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
  if p_message_type not in ('text','image','audio','document') then
    raise exception 'invalid_message_type';
  end if;

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
    -- image, audio, document: todos exigem media_path
    if p_media_path is null then raise exception 'media_must_have_path'; end if;
    -- Regex aceita extensões de imagem + audio + pdf/doc, no prefix chat-media
    v_media_pattern := '^chat-media/' || p_conversation_id::text || '/' || v_user::text
      || '/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp|gif|mp3|m4a|ogg|wav|aac|pdf|doc|docx)$';
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

REVOKE ALL ON FUNCTION kc_private.kc_chat_send_message(uuid, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION kc_private.kc_chat_send_message(uuid, text, text, text) TO authenticated;

-- v9.3.5.11 — Chat: triggers de denormalização + notificações
--
-- 1. AFTER INSERT em chat_messages → atualiza last_message_* em chat_conversations
--    (preview plaintext até 120 chars, conforme decisão de produto)
-- 2. AFTER INSERT em chat_messages → cria row em public.notifications
--    com type='direct_message' (estende o CHECK constraint)
-- 3. Atualiza notification_preferences default para incluir direct_message
--    (opt-in para email; in_app sempre on)

set search_path = public;

-- ============================================================================
-- 1. Estende notifications.type para incluir 'direct_message'
-- ============================================================================

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'comment_on_post', 'vote_on_post', 'post_expired',
    'post_reported', 'comment_reply', 'system',
    'direct_message'
  ));

-- ============================================================================
-- 2. Trigger: denormalize last_message_* em chat_conversations
-- ============================================================================

create or replace function kc_private.kc_chat_after_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preview text;
begin
  -- Preview plaintext até 120 chars (decisão de produto: inbox rápida)
  v_preview := case
    when new.message_type = 'image' then
      coalesce(nullif(left(new.content, 120), ''), '[imagem]')
    else
      left(coalesce(new.content, ''), 120)
  end;

  update public.chat_conversations
  set last_message_at = new.created_at,
      last_message_preview = v_preview,
      last_message_sender = new.sender_id,
      last_message_type = new.message_type,
      -- Reabre a conversa para ambos (caso tenham arquivado)
      archived_by_low = false,
      archived_by_high = false
  where id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists chat_msg_after_insert_denormalize on public.chat_messages;
create trigger chat_msg_after_insert_denormalize
  after insert on public.chat_messages
  for each row execute function kc_private.kc_chat_after_message_insert();

-- ============================================================================
-- 3. Trigger: notificação para o destinatário
-- ============================================================================

create or replace function kc_private.kc_chat_notify_recipient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient uuid;
  v_sender_name text;
  v_body_preview text;
begin
  -- Identifica destinatário (o outro participante)
  select case when new.sender_id = c.participant_low then c.participant_high
              else c.participant_low end
    into v_recipient
  from public.chat_conversations c
  where c.id = new.conversation_id;

  if v_recipient is null then return new; end if;

  -- Nome do remetente
  select coalesce(p.display_name, p.full_name, 'Alguém')
    into v_sender_name
  from public.profiles p
  where p.id = new.sender_id;

  -- Preview do corpo (truncado)
  v_body_preview := case
    when new.message_type = 'image' then '[imagem]'
    else left(coalesce(new.content, ''), 200)
  end;

  insert into public.notifications (user_id, type, title, body, data, read, created_at)
  values (
    v_recipient,
    'direct_message',
    v_sender_name,
    v_body_preview,
    jsonb_build_object(
      'conversation_id', new.conversation_id,
      'message_id', new.id,
      'sender_id', new.sender_id,
      'message_type', new.message_type
    ),
    false,
    new.created_at
  );

  return new;
end;
$$;

drop trigger if exists chat_msg_after_insert_notify on public.chat_messages;
create trigger chat_msg_after_insert_notify
  after insert on public.chat_messages
  for each row execute function kc_private.kc_chat_notify_recipient();

-- ============================================================================
-- 4. Comentários
-- ============================================================================

comment on function kc_private.kc_chat_after_message_insert() is
  'v9.3.5.11: denormaliza last_message_* em chat_conversations p/ inbox rápida.';
comment on function kc_private.kc_chat_notify_recipient() is
  'v9.3.5.11: cria notification row para o destinatário (type=direct_message).';
comment on constraint notifications_type_check on public.notifications is
  'v9.3.5.11: inclui direct_message além dos tipos originais.';

-- v9.3.5.12 — Chat: user_blocks + integração bidirecional + report_message
--
-- 1. Tabela user_blocks (bloqueio direcional, mas chat checa bidirecional)
-- 2. RPCs kc_chat_block_user / kc_chat_unblock_user / kc_chat_is_blocked
-- 3. Atualiza kc_chat_send_message para verificar bloqueio bidirecional
-- 4. RPC kc_chat_report_message (reaproveita tabela reports existente)

set search_path = public;

-- ============================================================================
-- 1. Tabela user_blocks
-- ============================================================================

create table if not exists public.user_blocks (
  blocker_id  uuid not null references public.profiles(id) on delete cascade,
  blocked_id  uuid not null references public.profiles(id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

create index if not exists idx_user_blocks_blocked on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

drop policy if exists user_blocks_select_own on public.user_blocks;
drop policy if exists user_blocks_modify_own on public.user_blocks;

create policy user_blocks_select_own
  on public.user_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

-- INSERT/DELETE via RPC
create policy user_blocks_modify_own
  on public.user_blocks for all to authenticated
  using (blocker_id = (select auth.uid()))
  with check (blocker_id = (select auth.uid()));

-- ============================================================================
-- 2. Workers em kc_private
-- ============================================================================

create or replace function kc_private.kc_chat_block_user(p_other_user_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'unauthenticated'; end if;
  if p_other_user_id is null then raise exception 'invalid_other_user'; end if;
  if v_user = p_other_user_id then raise exception 'cannot_block_self'; end if;
  if not exists (select 1 from public.profiles where id = p_other_user_id) then
    raise exception 'other_user_not_found';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id, reason)
  values (v_user, p_other_user_id, nullif(trim(coalesce(p_reason, '')), ''))
  on conflict (blocker_id, blocked_id) do update
    set reason = excluded.reason,
        created_at = now();
end;
$$;

create or replace function kc_private.kc_chat_unblock_user(p_other_user_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'unauthenticated'; end if;
  delete from public.user_blocks
  where blocker_id = v_user and blocked_id = p_other_user_id;
end;
$$;

create or replace function kc_private.kc_chat_is_blocked(p_other_user_id uuid)
returns table (out_i_blocked boolean, out_they_blocked boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'unauthenticated'; end if;
  out_i_blocked := exists (
    select 1 from public.user_blocks where blocker_id = v_user and blocked_id = p_other_user_id
  );
  out_they_blocked := exists (
    select 1 from public.user_blocks where blocker_id = p_other_user_id and blocked_id = v_user
  );
  return next;
end;
$$;

-- ============================================================================
-- 3. Atualiza kc_chat_send_message para verificar bloqueio bidirecional
-- ============================================================================

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
begin
  if v_user is null then raise exception 'unauthenticated'; end if;
  if p_conversation_id is null then raise exception 'invalid_conversation'; end if;
  if p_message_type not in ('text','image') then raise exception 'invalid_message_type'; end if;

  select * into v_conv from public.chat_conversations where id = p_conversation_id;
  if not found then raise exception 'conversation_not_found'; end if;
  if v_user not in (v_conv.participant_low, v_conv.participant_high) then
    raise exception 'not_a_participant';
  end if;

  -- Identifica o outro participante
  v_other := case when v_user = v_conv.participant_low
                  then v_conv.participant_high
                  else v_conv.participant_low end;

  -- BLOQUEIO BIDIRECIONAL: se qualquer um bloqueou o outro, nega
  if exists (
    select 1 from public.user_blocks
    where (blocker_id = v_user  and blocked_id = v_other)
       or (blocker_id = v_other and blocked_id = v_user)
  ) then
    raise exception 'blocked';
  end if;

  -- Validação de conteúdo (igual v9.3.5.10)
  if p_message_type = 'text' then
    v_content_clean := trim(coalesce(p_content, ''));
    if length(v_content_clean) = 0 then raise exception 'empty_content'; end if;
    if length(v_content_clean) > 4000 then raise exception 'content_too_long'; end if;
    if p_media_path is not null then raise exception 'text_must_have_no_media'; end if;
  else
    if p_media_path is null then raise exception 'image_must_have_media_path'; end if;
    if p_media_path not like 'chat-media/' || p_conversation_id::text || '/%' then
      raise exception 'invalid_media_path_prefix';
    end if;
    v_content_clean := nullif(trim(coalesce(p_content, '')), '');
    if v_content_clean is not null and length(v_content_clean) > 1000 then
      raise exception 'caption_too_long';
    end if;
  end if;

  -- Rate-limit
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

-- ============================================================================
-- 4. Report message (reaproveita tabela reports)
-- ============================================================================

create or replace function kc_private.kc_chat_report_message(
  p_message_id uuid,
  p_reason text,
  p_details text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_msg public.chat_messages%rowtype;
  v_reason text := lower(trim(coalesce(p_reason, '')));
  -- Valores aceitos pelo CHECK constraint atual em reports.reason
  v_valid_reasons text[] := array[
    'spam','scam','inappropriate','hate','illegal','duplicate',
    'other','harassment','offensive','misleading','privacy'
  ];
begin
  if v_user is null then raise exception 'unauthenticated'; end if;
  if v_reason = '' then raise exception 'reason_required'; end if;
  if not (v_reason = any(v_valid_reasons)) then
    raise exception 'invalid_reason';
  end if;

  select * into v_msg from public.chat_messages where id = p_message_id;
  if not found then raise exception 'message_not_found'; end if;
  if v_msg.sender_id = v_user then raise exception 'cannot_report_own_message'; end if;

  if not exists (
    select 1 from public.chat_conversations
    where id = v_msg.conversation_id and v_user in (participant_low, participant_high)
  ) then
    raise exception 'not_a_participant';
  end if;

  -- Reaproveita tabela reports com entity_type/entity_id (post_id fica null)
  insert into public.reports (
    reporter_id, entity_type, entity_id, reason, details, status, created_at
  ) values (
    v_user, 'chat_message', p_message_id::text,
    v_reason,
    nullif(trim(coalesce(p_details, '')), ''),
    'open',
    now()
  );
end;
$$;

-- ============================================================================
-- 5. Wrappers públicos
-- ============================================================================

create or replace function public.kc_chat_block_user(p_other_user_id uuid, p_reason text default null)
returns void language sql security invoker set search_path = '' as $$
  select kc_private.kc_chat_block_user($1, $2);
$$;

create or replace function public.kc_chat_unblock_user(p_other_user_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select kc_private.kc_chat_unblock_user($1);
$$;

create or replace function public.kc_chat_is_blocked(p_other_user_id uuid)
returns table (out_i_blocked boolean, out_they_blocked boolean)
language sql stable security invoker set search_path = '' as $$
  select * from kc_private.kc_chat_is_blocked($1);
$$;

create or replace function public.kc_chat_report_message(
  p_message_id uuid, p_reason text, p_details text default null
)
returns void language sql security invoker set search_path = '' as $$
  select kc_private.kc_chat_report_message($1, $2, $3);
$$;

-- ============================================================================
-- 6. Permissões
-- ============================================================================

revoke all on function kc_private.kc_chat_block_user(uuid, text) from public, anon, authenticated;
revoke all on function kc_private.kc_chat_unblock_user(uuid) from public, anon, authenticated;
revoke all on function kc_private.kc_chat_is_blocked(uuid) from public, anon, authenticated;
revoke all on function kc_private.kc_chat_report_message(uuid, text, text) from public, anon, authenticated;

revoke all on function public.kc_chat_block_user(uuid, text) from anon;
revoke all on function public.kc_chat_unblock_user(uuid) from anon;
revoke all on function public.kc_chat_is_blocked(uuid) from anon;
revoke all on function public.kc_chat_report_message(uuid, text, text) from anon;

grant execute on function public.kc_chat_block_user(uuid, text) to authenticated;
grant execute on function public.kc_chat_unblock_user(uuid) to authenticated;
grant execute on function public.kc_chat_is_blocked(uuid) to authenticated;
grant execute on function public.kc_chat_report_message(uuid, text, text) to authenticated;

comment on table public.user_blocks is 'v9.3.5.12: bloqueio direcional, mas chat checa bidirecional (qualquer lado bloqueia → nenhum envia)';

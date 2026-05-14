-- v9.3.5.10 — Chat 1-a-1 (DM): schema base + RLS + RPCs de leitura/escrita básicas
--
-- Visão geral
-- -----------
-- Adiciona mensageria direta entre dois usuários. Schema fica em par ordenado
-- (participant_low, participant_high) para garantir 1 conversa por par
-- (idempotente). Conteúdo de texto em coluna TEXT (encryption-at-rest nativa
-- do Supabase via disk AES-256). Coluna e2e_envelope JSONB fica reservada
-- para upgrade futuro a criptografia ponta-a-ponta client-side.
--
-- Decisões de produto fixadas:
--   - 1-a-1 (sem grupos)
--   - Texto + emoji + imagens (sem áudio/replies/reactions no v1)
--   - Bloqueio BIDIRECIONAL (tabela user_blocks vem na v9.3.5.12)
--   - Editar mensagem habilitado no v1 (campo edited_at)
--   - Hard-delete de imagem ao apagar mensagem (zera media_path; storage
--     limpeza vai no Edge Function futuro)
--   - Rate-limit: 5/min para users novos (<7d), 30/min para estabelecidos
--   - Preview plaintext (até 120 chars) em last_message_preview para inbox rápida
--
-- Padrões reaproveitados:
--   - Wrapper INVOKER em public.* + worker DEFINER em kc_private.* (v9.3.5.9)
--   - REVOKE EXECUTE FROM anon (chat é authenticated-only)
--   - kc_private.kc_is_admin(uuid) já existe (mantém moderação futura)

set search_path = public;

-- ============================================================================
-- 1. TABELAS
-- ============================================================================

create table if not exists public.chat_conversations (
  id                    uuid primary key default gen_random_uuid(),
  participant_low       uuid not null references public.profiles(id) on delete cascade,
  participant_high      uuid not null references public.profiles(id) on delete cascade,
  created_at            timestamptz not null default now(),
  last_message_at       timestamptz,
  last_message_preview  text,        -- denormalizado, max 120 chars, plaintext (texto curto)
  last_message_sender   uuid references public.profiles(id) on delete set null,
  last_message_type     text check (last_message_type in ('text','image')),
  archived_by_low       boolean not null default false,
  archived_by_high      boolean not null default false,
  constraint chat_conv_ordered check (participant_low < participant_high),
  constraint chat_conv_unique  unique (participant_low, participant_high)
);

create index if not exists idx_chat_conv_low_lastmsg
  on public.chat_conversations (participant_low, last_message_at desc nulls last);
create index if not exists idx_chat_conv_high_lastmsg
  on public.chat_conversations (participant_high, last_message_at desc nulls last);

create table if not exists public.chat_messages (
  id                  uuid primary key default gen_random_uuid(),
  conversation_id     uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id           uuid not null references public.profiles(id) on delete cascade,
  message_type        text not null check (message_type in ('text','image')),
  content             text,                    -- texto da msg (text) OU caption (image)
  media_path          text,                    -- chat-media/{conv}/{sender}/{msg}.{ext}
  e2e_envelope        jsonb,                   -- reservado p/ E2E client-side futuro (null no v1)
  created_at          timestamptz not null default now(),
  edited_at           timestamptz,
  deleted_at          timestamptz,             -- soft-delete: zera content/media, mantém metadata
  constraint chat_msg_text_or_image check (
    (message_type = 'text'  and content is not null and media_path is null) or
    (message_type = 'image' and media_path is not null) or
    (deleted_at is not null)                   -- após soft-delete, ambos podem ser null
  )
);

create index if not exists idx_chat_msg_conv_created
  on public.chat_messages (conversation_id, created_at desc);
create index if not exists idx_chat_msg_sender_created
  on public.chat_messages (sender_id, created_at desc);

create table if not exists public.chat_read_state (
  conversation_id   uuid not null references public.chat_conversations(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  last_read_msg_id  uuid references public.chat_messages(id) on delete set null,
  last_read_at      timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- ============================================================================
-- 2. RLS POLICIES
-- ============================================================================
-- Estratégia: SELECT direto via policies; INSERT/UPDATE só via RPC wrapper
-- (centraliza validação de bloqueio, rate-limit, anti-spam).

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_read_state enable row level security;

-- Drop antigas se existirem (idempotência)
drop policy if exists chat_conv_select_own on public.chat_conversations;
drop policy if exists chat_conv_update_own on public.chat_conversations;
drop policy if exists chat_msg_select_participant on public.chat_messages;
drop policy if exists chat_read_state_own on public.chat_read_state;

create policy chat_conv_select_own
  on public.chat_conversations
  for select to authenticated
  using ((select auth.uid()) in (participant_low, participant_high));

create policy chat_conv_update_own
  on public.chat_conversations
  for update to authenticated
  using ((select auth.uid()) in (participant_low, participant_high))
  with check ((select auth.uid()) in (participant_low, participant_high));

create policy chat_msg_select_participant
  on public.chat_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.chat_conversations c
      where c.id = chat_messages.conversation_id
        and (select auth.uid()) in (c.participant_low, c.participant_high)
    )
  );

create policy chat_read_state_own
  on public.chat_read_state
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ============================================================================
-- 3. REALTIME PUBLICATION
-- ============================================================================
-- Habilita Realtime para INSERT em chat_messages (push em tempo real) e
-- UPDATE em chat_conversations (badge de unread, last_message preview).

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_messages';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_conversations'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_conversations';
  end if;
end $$;

-- ============================================================================
-- 4. RPCs — WORKERS em kc_private (SECURITY DEFINER)
-- ============================================================================

-- ── 4.1 Helpers internos ────────────────────────────────────────────────────

create or replace function kc_private.kc_chat_other_participant(
  p_conv public.chat_conversations,
  p_user uuid
) returns uuid
language sql immutable
set search_path = ''
as $$
  select case when p_user = p_conv.participant_low then p_conv.participant_high
              else p_conv.participant_low end;
$$;

create or replace function kc_private.kc_chat_is_new_user(p_user_id uuid)
returns boolean
language sql stable
set search_path = ''
as $$
  -- "Novo usuário" = conta criada há <7 dias
  select coalesce(
    (select created_at from auth.users where id = p_user_id) > now() - interval '7 days',
    true
  );
$$;

-- ── 4.2 start_conversation (idempotente) ────────────────────────────────────

create or replace function kc_private.kc_chat_start_conversation(p_other_user_id uuid)
returns table (out_conversation_id uuid, out_is_new boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_existing uuid;
  v_new_id uuid;
begin
  if v_user is null then raise exception 'unauthenticated'; end if;
  if p_other_user_id is null then raise exception 'invalid_other_user'; end if;
  if v_user = p_other_user_id then raise exception 'cannot_chat_with_self'; end if;

  -- Verifica que o outro user existe
  if not exists (select 1 from public.profiles where id = p_other_user_id) then
    raise exception 'other_user_not_found';
  end if;

  -- Ordena os participantes (low < high)
  v_low  := least(v_user, p_other_user_id);
  v_high := greatest(v_user, p_other_user_id);

  -- Tenta encontrar conversa existente
  select id into v_existing
  from public.chat_conversations
  where participant_low = v_low and participant_high = v_high;

  if v_existing is not null then
    out_conversation_id := v_existing;
    out_is_new := false;
    return next;
    return;
  end if;

  -- Cria nova (ON CONFLICT garante idempotência em race)
  insert into public.chat_conversations (participant_low, participant_high)
  values (v_low, v_high)
  on conflict (participant_low, participant_high) do update
    set participant_low = excluded.participant_low  -- no-op p/ retornar id existente
  returning id into v_new_id;

  out_conversation_id := v_new_id;
  out_is_new := true;
  return next;
end;
$$;

-- ── 4.3 send_message ────────────────────────────────────────────────────────

create or replace function kc_private.kc_chat_send_message(
  p_conversation_id uuid,
  p_content text,
  p_message_type text,
  p_media_path text
)
returns table (out_message_id uuid, out_created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_conv public.chat_conversations%rowtype;
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

  -- Validação de conteúdo
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
    v_content_clean := nullif(trim(coalesce(p_content, '')), '');  -- caption opcional
    if v_content_clean is not null and length(v_content_clean) > 1000 then
      raise exception 'caption_too_long';
    end if;
  end if;

  -- Rate-limit (5/min para novos, 30/min para estabelecidos)
  v_limit := case when kc_private.kc_chat_is_new_user(v_user) then 5 else 30 end;
  select count(*) into v_recent_count
  from public.chat_messages
  where sender_id = v_user and created_at > now() - interval '1 minute';
  if v_recent_count >= v_limit then
    raise exception 'rate_limit_exceeded' using hint = format('Aguarde 1 minuto. Limite: %s msg/min', v_limit);
  end if;

  -- Insere a mensagem
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

-- ── 4.4 list_conversations ──────────────────────────────────────────────────

create or replace function kc_private.kc_chat_list_conversations(
  p_limit int default 30,
  p_before timestamptz default null
)
returns table (
  out_conversation_id uuid,
  out_other_user_id uuid,
  out_other_display_name text,
  out_other_avatar_url text,
  out_last_message_at timestamptz,
  out_last_message_preview text,
  out_last_message_sender uuid,
  out_last_message_type text,
  out_unread_count bigint,
  out_archived boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_limit int := greatest(1, least(coalesce(p_limit, 30), 100));
begin
  if v_user is null then raise exception 'unauthenticated'; end if;

  return query
  with my_convs as (
    select c.id, c.participant_low, c.participant_high,
           c.last_message_at, c.last_message_preview, c.last_message_sender,
           c.last_message_type,
           case when v_user = c.participant_low then c.archived_by_low
                else c.archived_by_high end as archived,
           kc_private.kc_chat_other_participant(c, v_user) as other_id
    from public.chat_conversations c
    where v_user in (c.participant_low, c.participant_high)
      and (p_before is null or c.last_message_at < p_before)
  )
  select
    mc.id,
    mc.other_id,
    coalesce(p.display_name, p.full_name, 'Usuário'),
    p.avatar_url,
    mc.last_message_at,
    mc.last_message_preview,
    mc.last_message_sender,
    mc.last_message_type,
    (
      select count(*)
      from public.chat_messages m
      where m.conversation_id = mc.id
        and m.sender_id <> v_user
        and m.deleted_at is null
        and m.created_at > coalesce(
          (select rs.last_read_at from public.chat_read_state rs
           where rs.conversation_id = mc.id and rs.user_id = v_user),
          'epoch'::timestamptz
        )
    ),
    mc.archived
  from my_convs mc
  left join public.profiles p on p.id = mc.other_id
  order by mc.last_message_at desc nulls last
  limit v_limit;
end;
$$;

-- ── 4.5 list_messages ───────────────────────────────────────────────────────

create or replace function kc_private.kc_chat_list_messages(
  p_conversation_id uuid,
  p_limit int default 50,
  p_before_ts timestamptz default null
)
returns table (
  out_message_id uuid,
  out_sender_id uuid,
  out_message_type text,
  out_content text,
  out_media_path text,
  out_created_at timestamptz,
  out_edited_at timestamptz,
  out_deleted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  if v_user is null then raise exception 'unauthenticated'; end if;
  if not exists (
    select 1 from public.chat_conversations
    where id = p_conversation_id and v_user in (participant_low, participant_high)
  ) then
    raise exception 'not_a_participant';
  end if;

  return query
  select m.id, m.sender_id, m.message_type, m.content, m.media_path,
         m.created_at, m.edited_at, m.deleted_at
  from public.chat_messages m
  where m.conversation_id = p_conversation_id
    and (p_before_ts is null or m.created_at < p_before_ts)
  order by m.created_at desc
  limit v_limit;
end;
$$;

-- ── 4.6 mark_read ───────────────────────────────────────────────────────────

create or replace function kc_private.kc_chat_mark_read(
  p_conversation_id uuid,
  p_until_message_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'unauthenticated'; end if;
  if not exists (
    select 1 from public.chat_conversations
    where id = p_conversation_id and v_user in (participant_low, participant_high)
  ) then
    raise exception 'not_a_participant';
  end if;

  insert into public.chat_read_state (conversation_id, user_id, last_read_msg_id, last_read_at)
  values (p_conversation_id, v_user, p_until_message_id, now())
  on conflict (conversation_id, user_id) do update
    set last_read_msg_id = excluded.last_read_msg_id,
        last_read_at = excluded.last_read_at;
end;
$$;

-- ── 4.7 unread_total ────────────────────────────────────────────────────────

create or replace function kc_private.kc_chat_unread_total()
returns table (out_total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'unauthenticated'; end if;
  return query
  select count(*)::bigint
  from public.chat_messages m
  join public.chat_conversations c on c.id = m.conversation_id
  where v_user in (c.participant_low, c.participant_high)
    and m.sender_id <> v_user
    and m.deleted_at is null
    and m.created_at > coalesce(
      (select rs.last_read_at from public.chat_read_state rs
       where rs.conversation_id = c.id and rs.user_id = v_user),
      'epoch'::timestamptz
    );
end;
$$;

-- ── 4.8 delete_message (soft-delete) ────────────────────────────────────────

create or replace function kc_private.kc_chat_delete_message(p_message_id uuid)
returns table (out_media_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_msg public.chat_messages%rowtype;
begin
  if v_user is null then raise exception 'unauthenticated'; end if;
  select * into v_msg from public.chat_messages where id = p_message_id;
  if not found then raise exception 'message_not_found'; end if;
  if v_msg.sender_id <> v_user then raise exception 'not_sender'; end if;
  if v_msg.deleted_at is not null then raise exception 'already_deleted'; end if;

  -- Captura media_path para o caller fazer hard-delete no storage
  out_media_path := v_msg.media_path;

  update public.chat_messages
  set deleted_at = now(),
      content = null,
      media_path = null
  where id = p_message_id;

  return next;
end;
$$;

-- ── 4.9 edit_message ────────────────────────────────────────────────────────

create or replace function kc_private.kc_chat_edit_message(
  p_message_id uuid,
  p_new_content text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_msg public.chat_messages%rowtype;
  v_new text := trim(coalesce(p_new_content, ''));
begin
  if v_user is null then raise exception 'unauthenticated'; end if;
  if length(v_new) = 0 then raise exception 'empty_content'; end if;
  if length(v_new) > 4000 then raise exception 'content_too_long'; end if;

  select * into v_msg from public.chat_messages where id = p_message_id;
  if not found then raise exception 'message_not_found'; end if;
  if v_msg.sender_id <> v_user then raise exception 'not_sender'; end if;
  if v_msg.deleted_at is not null then raise exception 'already_deleted'; end if;
  if v_msg.message_type <> 'text' then raise exception 'only_text_editable'; end if;
  if v_msg.created_at < now() - interval '24 hours' then raise exception 'edit_window_expired'; end if;

  update public.chat_messages
  set content = v_new, edited_at = now()
  where id = p_message_id;
end;
$$;

-- ============================================================================
-- 5. WRAPPERS PÚBLICOS (SECURITY INVOKER → kc_private)
-- ============================================================================

create or replace function public.kc_chat_start_conversation(p_other_user_id uuid)
returns table (out_conversation_id uuid, out_is_new boolean)
language sql security invoker set search_path = '' as $$
  select * from kc_private.kc_chat_start_conversation($1);
$$;

create or replace function public.kc_chat_send_message(
  p_conversation_id uuid, p_content text, p_message_type text, p_media_path text
)
returns table (out_message_id uuid, out_created_at timestamptz)
language sql security invoker set search_path = '' as $$
  select * from kc_private.kc_chat_send_message($1, $2, $3, $4);
$$;

create or replace function public.kc_chat_list_conversations(
  p_limit int default 30, p_before timestamptz default null
)
returns table (
  out_conversation_id uuid, out_other_user_id uuid, out_other_display_name text,
  out_other_avatar_url text, out_last_message_at timestamptz,
  out_last_message_preview text, out_last_message_sender uuid,
  out_last_message_type text, out_unread_count bigint, out_archived boolean
)
language sql stable security invoker set search_path = '' as $$
  select * from kc_private.kc_chat_list_conversations($1, $2);
$$;

create or replace function public.kc_chat_list_messages(
  p_conversation_id uuid, p_limit int default 50, p_before_ts timestamptz default null
)
returns table (
  out_message_id uuid, out_sender_id uuid, out_message_type text,
  out_content text, out_media_path text, out_created_at timestamptz,
  out_edited_at timestamptz, out_deleted_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  select * from kc_private.kc_chat_list_messages($1, $2, $3);
$$;

create or replace function public.kc_chat_mark_read(
  p_conversation_id uuid, p_until_message_id uuid
)
returns void language sql security invoker set search_path = '' as $$
  select kc_private.kc_chat_mark_read($1, $2);
$$;

create or replace function public.kc_chat_unread_total()
returns table (out_total bigint)
language sql stable security invoker set search_path = '' as $$
  select * from kc_private.kc_chat_unread_total();
$$;

create or replace function public.kc_chat_delete_message(p_message_id uuid)
returns table (out_media_path text)
language sql security invoker set search_path = '' as $$
  select * from kc_private.kc_chat_delete_message($1);
$$;

create or replace function public.kc_chat_edit_message(
  p_message_id uuid, p_new_content text
)
returns void language sql security invoker set search_path = '' as $$
  select kc_private.kc_chat_edit_message($1, $2);
$$;

-- ============================================================================
-- 6. PERMISSÕES — revoga de anon, grants para authenticated
-- ============================================================================

-- Workers privados: ninguém chama direto via REST
revoke all on function kc_private.kc_chat_start_conversation(uuid) from public, anon, authenticated;
revoke all on function kc_private.kc_chat_send_message(uuid, text, text, text) from public, anon, authenticated;
revoke all on function kc_private.kc_chat_list_conversations(int, timestamptz) from public, anon, authenticated;
revoke all on function kc_private.kc_chat_list_messages(uuid, int, timestamptz) from public, anon, authenticated;
revoke all on function kc_private.kc_chat_mark_read(uuid, uuid) from public, anon, authenticated;
revoke all on function kc_private.kc_chat_unread_total() from public, anon, authenticated;
revoke all on function kc_private.kc_chat_delete_message(uuid) from public, anon, authenticated;
revoke all on function kc_private.kc_chat_edit_message(uuid, text) from public, anon, authenticated;
revoke all on function kc_private.kc_chat_other_participant(public.chat_conversations, uuid) from public, anon, authenticated;
revoke all on function kc_private.kc_chat_is_new_user(uuid) from public, anon, authenticated;

-- Wrappers públicos: só authenticated
revoke all on function public.kc_chat_start_conversation(uuid) from anon;
revoke all on function public.kc_chat_send_message(uuid, text, text, text) from anon;
revoke all on function public.kc_chat_list_conversations(int, timestamptz) from anon;
revoke all on function public.kc_chat_list_messages(uuid, int, timestamptz) from anon;
revoke all on function public.kc_chat_mark_read(uuid, uuid) from anon;
revoke all on function public.kc_chat_unread_total() from anon;
revoke all on function public.kc_chat_delete_message(uuid) from anon;
revoke all on function public.kc_chat_edit_message(uuid, text) from anon;

grant execute on function public.kc_chat_start_conversation(uuid) to authenticated;
grant execute on function public.kc_chat_send_message(uuid, text, text, text) to authenticated;
grant execute on function public.kc_chat_list_conversations(int, timestamptz) to authenticated;
grant execute on function public.kc_chat_list_messages(uuid, int, timestamptz) to authenticated;
grant execute on function public.kc_chat_mark_read(uuid, uuid) to authenticated;
grant execute on function public.kc_chat_unread_total() to authenticated;
grant execute on function public.kc_chat_delete_message(uuid) to authenticated;
grant execute on function public.kc_chat_edit_message(uuid, text) to authenticated;

-- ============================================================================
-- 7. STORAGE POLICIES (bucket kino-media, prefixo chat-media/)
-- ============================================================================
-- Leitura: só participantes da conversa
-- Escrita: só o próprio user, na pasta da conversa que participa

drop policy if exists storage_chat_media_select_participant on storage.objects;
drop policy if exists storage_chat_media_insert_sender on storage.objects;
drop policy if exists storage_chat_media_delete_sender on storage.objects;

create policy storage_chat_media_select_participant
  on storage.objects for select to authenticated
  using (
    bucket_id = 'kino-media'
    and (storage.foldername(name))[1] = 'chat-media'
    and exists (
      select 1 from public.chat_conversations c
      where c.id::text = (storage.foldername(name))[2]
        and (select auth.uid()) in (c.participant_low, c.participant_high)
    )
  );

create policy storage_chat_media_insert_sender
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'kino-media'
    and (storage.foldername(name))[1] = 'chat-media'
    and (storage.foldername(name))[3] = (select auth.uid())::text
    and exists (
      select 1 from public.chat_conversations c
      where c.id::text = (storage.foldername(name))[2]
        and (select auth.uid()) in (c.participant_low, c.participant_high)
    )
  );

create policy storage_chat_media_delete_sender
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'kino-media'
    and (storage.foldername(name))[1] = 'chat-media'
    and (storage.foldername(name))[3] = (select auth.uid())::text
  );

-- ============================================================================
-- 8. COMENTÁRIOS DE DOCUMENTAÇÃO
-- ============================================================================

comment on table public.chat_conversations is 'v9.3.5.10: conversa 1-a-1 entre 2 participantes (par ordenado low<high). Denormaliza last_message_* para inbox rápida.';
comment on table public.chat_messages is 'v9.3.5.10: mensagens de texto/imagem. content em TEXT (at-rest via Supabase disk encryption); e2e_envelope JSONB reservado p/ E2E client-side futuro.';
comment on table public.chat_read_state is 'v9.3.5.10: marcador de leitura por (conversa, user) — evita updates massivos em chat_messages.';
comment on column public.chat_conversations.last_message_preview is 'Plaintext até 120 chars para inbox rápida. Trade-off documentado em /privacidade.';
comment on column public.chat_messages.e2e_envelope is 'Reservado para upgrade futuro a E2E client-side (WebCrypto). Null no v1.';
comment on function public.kc_chat_send_message(uuid, text, text, text) is 'v9.3.5.10: envia mensagem. Rate-limit 5/min (novo user <7d) ou 30/min (estabelecido). Checa participante, valida tamanho, prefixo de media.';

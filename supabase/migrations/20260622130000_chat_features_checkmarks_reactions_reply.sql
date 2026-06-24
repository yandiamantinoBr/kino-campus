-- 20260622130000_chat_features_checkmarks_reactions_reply.sql
-- KinoCampus — V76.53: features de chat aplicadas em produção
--
-- Espelha no ambiente local as 3 features aplicadas em produção (wacyrkwhkvzwkqpolrbg)
-- via Management API em 2026-06-22: confirmação de leitura, reações emoji e reply/quote.
-- Aplicada aditivamente; nenhuma mudança destrutiva. Validada em banco descartável
-- antes de ir a produção e provada aqui via db reset.

-- ═══════════════════════════════════════════════════════════════════════════
-- Colunas read_at e reply_to_id em chat_messages
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.chat_messages
  add column if not exists read_at timestamptz;

alter table public.chat_messages
  add column if not exists reply_to_id uuid references public.chat_messages(id) on delete set null;

comment on column public.chat_messages.read_at is 'Timestamp de leitura pelo destinatário (NULL = não lida). Setado por trigger quando o destinatário marca a conversa como lida.';
comment on column public.chat_messages.reply_to_id is 'ID da mensagem original respondida (NULL = não é resposta). ON DELETE SET NULL preserva a resposta se a original for apagada.';

create index if not exists chat_messages_reply_to_id_idx
  on public.chat_messages (reply_to_id)
  where reply_to_id is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- Trigger: marcar read_at quando conversa é lida
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.kc_chat_mark_messages_read()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_messages
    set read_at = greatest(coalesce(read_at, now()), coalesce(new.last_read_at, now()))
    where conversation_id = new.conversation_id
      and sender_id <> new.user_id
      and read_at is null;
  return new;
end;
$$;

drop trigger if exists trg_chat_mark_messages_read on public.chat_read_state;
create trigger trg_chat_mark_messages_read
  after insert or update of last_read_msg_id, last_read_at on public.chat_read_state
  for each row execute function public.kc_chat_mark_messages_read();

-- ═══════════════════════════════════════════════════════════════════════════
-- Tabela chat_reactions + RLS
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.chat_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint chat_reactions_unique unique (message_id, user_id, emoji),
  constraint chat_reactions_emoji_allowlist check (
    emoji in ('👍','❤️','😂','😮','😢','👏')
  )
);

comment on table public.chat_reactions is 'Reações emoji em mensagens de chat. ON DELETE CASCADE: se a mensagem ou o usuário for removido, a reação some.';

create index if not exists chat_reactions_message_id_idx on public.chat_reactions (message_id);
create index if not exists chat_reactions_user_id_idx on public.chat_reactions (user_id);

alter table public.chat_reactions enable row level security;

drop policy if exists chat_reactions_select_participant on public.chat_reactions;
create policy chat_reactions_select_participant
  on public.chat_reactions for select
  using (
    exists (
      select 1 from public.chat_messages m
      join public.chat_conversations c on c.id = m.conversation_id
      where m.id = chat_reactions.message_id
        and (c.participant_low = (select auth.uid()) or c.participant_high = (select auth.uid()))
    )
  );

drop policy if exists chat_reactions_upsert_own on public.chat_reactions;
create policy chat_reactions_upsert_own
  on public.chat_reactions for insert
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.chat_messages m
      join public.chat_conversations c on c.id = m.conversation_id
      where m.id = chat_reactions.message_id
        and (c.participant_low = (select auth.uid()) or c.participant_high = (select auth.uid()))
    )
  );

drop policy if exists chat_reactions_delete_own on public.chat_reactions;
create policy chat_reactions_delete_own
  on public.chat_reactions for delete
  using (user_id = (select auth.uid()));

revoke all on public.chat_reactions from public, anon;
grant select, insert, delete on public.chat_reactions to authenticated;
grant all on public.chat_reactions to service_role;

alter publication supabase_realtime add table public.chat_reactions;

-- ═══════════════════════════════════════════════════════════════════════════
-- RPCs kc_chat_list_messages atualizados (retornam read_at, reply_to_id, reactions)
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists kc_private.kc_chat_list_messages(uuid, integer, timestamptz);
create or replace function kc_private.kc_chat_list_messages(
  p_conversation_id uuid,
  p_limit integer default 50,
  p_before_ts timestamptz default null
) returns table (
  out_message_id uuid, out_sender_id uuid, out_message_type text, out_content text,
  out_media_path text, out_created_at timestamptz, out_edited_at timestamptz,
  out_deleted_at timestamptz, out_read_at timestamptz, out_reply_to_id uuid,
  out_reactions jsonb
)
language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  if v_user is null then raise exception 'unauthenticated'; end if;
  if not exists (
    select 1 from public.chat_conversations
    where id = p_conversation_id and v_user in (participant_low, participant_high)
  ) then raise exception 'not_a_participant'; end if;
  return query
  select m.id, m.sender_id, m.message_type, m.content, m.media_path,
         m.created_at, m.edited_at, m.deleted_at, m.read_at, m.reply_to_id,
         coalesce((
           select jsonb_agg(jsonb_build_object('emoji', r.emoji, 'user_id', r.user_id, 'created_at', r.created_at))
           from public.chat_reactions r where r.message_id = m.id
         ), '[]'::jsonb)
  from public.chat_messages m
  where m.conversation_id = p_conversation_id
    and (p_before_ts is null or m.created_at < p_before_ts)
  order by m.created_at desc limit v_limit;
end;
$function$;

drop function if exists public.kc_chat_list_messages(uuid, integer, timestamptz);
create or replace function public.kc_chat_list_messages(
  p_conversation_id uuid,
  p_limit integer default 50,
  p_before_ts timestamptz default null
) returns table (
  out_message_id uuid, out_sender_id uuid, out_message_type text, out_content text,
  out_media_path text, out_created_at timestamptz, out_edited_at timestamptz,
  out_deleted_at timestamptz, out_read_at timestamptz, out_reply_to_id uuid,
  out_reactions jsonb
)
language sql stable security invoker set search_path = ''
as $function$
  select * from kc_private.kc_chat_list_messages($1, $2, $3);
$function$;

revoke all on function public.kc_chat_list_messages(uuid, integer, timestamptz) from public;
grant execute on function public.kc_chat_list_messages(uuid, integer, timestamptz) to authenticated, anon;

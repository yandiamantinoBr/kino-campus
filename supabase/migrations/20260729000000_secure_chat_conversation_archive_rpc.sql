begin;

create schema if not exists kc_private;

-- EXPAND PHASE: archiving is a per-participant preference and the RPC below is
-- the preferred contract. Older clients still issue a direct table UPDATE, so
-- that path remains temporarily available behind an own-side column guard.
-- CONTRACT PHASE DEFERRED: after compatible clients have adopted this RPC,
-- revoke authenticated UPDATE, remove chat_conv_update_own and drop the legacy
-- guard trigger/function in a later migration backed by adoption evidence.
create or replace function kc_private.kc_chat_set_conversation_archived(
  p_conversation_id uuid,
  p_archived boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation public.chat_conversations%rowtype;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;
  if not public.kc_is_current_session_active() then
    raise exception 'session_inactive';
  end if;
  if p_conversation_id is null then
    raise exception 'invalid_conversation';
  end if;
  if p_archived is null then
    raise exception 'invalid_archived';
  end if;

  select conversation_row.*
  into v_conversation
  from public.chat_conversations as conversation_row
  where conversation_row.id = p_conversation_id
    and (
      conversation_row.participant_low = v_user_id
      or conversation_row.participant_high = v_user_id
    )
  for update;

  if not found then
    raise exception 'conversation_not_found';
  end if;

  if v_conversation.participant_low = v_user_id then
    update public.chat_conversations as conversation_row
    set archived_by_low = p_archived
    where conversation_row.id = p_conversation_id;
  elsif v_conversation.participant_high = v_user_id then
    update public.chat_conversations as conversation_row
    set archived_by_high = p_archived
    where conversation_row.id = p_conversation_id;
  else
    -- Defensive fail-closed branch. Keep the same response used above so this
    -- endpoint never becomes an existence oracle for another user's chat.
    raise exception 'conversation_not_found';
  end if;

  return jsonb_build_object(
    'ok', true,
    'conversation_id', p_conversation_id,
    'archived', p_archived
  );
end;
$$;

create or replace function public.kc_chat_set_conversation_archived(
  p_conversation_id uuid,
  p_archived boolean
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select kc_private.kc_chat_set_conversation_archived($1, $2)
$$;

revoke all on function kc_private.kc_chat_set_conversation_archived(
  uuid,
  boolean
)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_chat_set_conversation_archived(
  uuid,
  boolean
)
  to authenticated;

revoke all on function public.kc_chat_set_conversation_archived(
  uuid,
  boolean
)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_chat_set_conversation_archived(
  uuid,
  boolean
)
  to authenticated;

-- Compatibility policy for clients published before the archive RPC. The
-- restrictive active-session policy/statement trigger already protect this
-- table; repeat the session predicate here so the compatibility boundary is
-- explicit and independently testable.
drop policy if exists chat_conv_update_own
  on public.chat_conversations;
create policy chat_conv_update_own
  on public.chat_conversations
  for update
  to authenticated
  using (
    public.kc_is_current_session_active()
    and (select auth.uid()) in (participant_low, participant_high)
  )
  with check (
    public.kc_is_current_session_active()
    and (select auth.uid()) in (participant_low, participant_high)
  );

-- RLS cannot compare OLD and NEW by itself. Keep the legacy table grant without
-- reopening participant IDs or server-owned preview fields: a direct browser
-- UPDATE may change only the caller's own archive flag. SECURITY DEFINER RPCs
-- and internal roles retain their existing server-owned update behavior.
create or replace function kc_private.kc_guard_legacy_chat_archive_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if current_user <> 'authenticated'::name then
    return new;
  end if;

  if v_user_id is null
     or not public.kc_is_current_session_active() then
    raise exception using
      errcode = '42501',
      message = 'AUTH_SESSION_NOT_ACTIVE';
  end if;

  if v_user_id = old.participant_low then
    if (to_jsonb(new) - 'archived_by_low')
       is distinct from
       (to_jsonb(old) - 'archived_by_low') then
      raise exception using
        errcode = '42501',
        message = 'CHAT_LEGACY_UPDATE_RESTRICTED';
    end if;
  elsif v_user_id = old.participant_high then
    if (to_jsonb(new) - 'archived_by_high')
       is distinct from
       (to_jsonb(old) - 'archived_by_high') then
      raise exception using
        errcode = '42501',
        message = 'CHAT_LEGACY_UPDATE_RESTRICTED';
    end if;
  else
    raise exception using
      errcode = '42501',
      message = 'CHAT_LEGACY_UPDATE_RESTRICTED';
  end if;

  return new;
end;
$$;

revoke all on function kc_private.kc_guard_legacy_chat_archive_update()
  from public, anon, authenticated, service_role;

drop trigger if exists kc_chat_legacy_archive_update_guard
  on public.chat_conversations;
create trigger kc_chat_legacy_archive_update_guard
before update on public.chat_conversations
for each row
execute function kc_private.kc_guard_legacy_chat_archive_update();

revoke update on table public.chat_conversations
  from public, anon;
grant update on table public.chat_conversations
  to authenticated;
grant update on table public.chat_conversations
  to service_role;

comment on function public.kc_chat_set_conversation_archived(uuid, boolean) is
  'Arquiva ou desarquiva apenas o lado do participante autenticado com sessao ativa; contrato preferencial durante a fase expand.';

notify pgrst, 'reload schema';

commit;

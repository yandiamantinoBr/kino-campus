-- ============================================================================
-- KinoCampus - materializa DSR tambem para Help autenticado legado
-- ============================================================================
-- Problema: tickets account_deletion criados logados (antes do DSR atomico)
-- ja tem help.user_id, mas nao tem data_subject_request_id / identity_source.
-- A materializacao 12000 recusava user_id is not null com
-- ERASURE_IDENTITY_DSR_NOT_UNIQUE, e o painel admin so oferecia vinculo
-- quando user_id era nulo. Resultado: moderador via o painel LGPD sem
-- conseguir diagnosticar, ocultar ou excluir.
--
-- Correcao: permitir materializar DSR quando help.user_id e nulo OU
-- confere com o titular resolvido pelo e-mail (legado autenticado).
-- ============================================================================

begin;

create or replace function
  kc_private.kc_materialize_anonymous_erasure_dsr(
    p_help_request_id uuid,
    p_account_email text,
    p_actor_id uuid,
    p_actor_session_id uuid
  )
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_email text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_account_email, ''))
  );
  v_target_user_id uuid;
  v_locked_auth_user_id uuid;
  v_account_count integer := 0;
  v_dsr_count integer := 0;
  v_dsr_id uuid;
  v_protocol text;
  v_subject_hash text;
  v_idempotency_key text;
  v_help public.help_requests%rowtype;
  v_help_kind text;
  v_was_authenticated_help boolean := false;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'SERVICE_ROLE_REQUIRED';
  end if;

  if p_help_request_id is null
     or p_actor_id is null
     or p_actor_session_id is null
     or pg_catalog.char_length(v_email) < 3
     or pg_catalog.char_length(v_email) > 254
     or v_email !~
       '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception using
      errcode = '22023',
      message = 'ERASURE_IDENTITY_LINK_INPUT_INVALID';
  end if;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.min(user_row.id::text)::uuid
  into v_account_count, v_target_user_id
  from auth.users user_row
  where user_row.deleted_at is null
    and pg_catalog.lower(
      pg_catalog.btrim(coalesce(user_row.email, ''))
    ) = v_email;

  if v_account_count <> 1 or v_target_user_id is null then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_IDENTITY_ACCOUNT_NOT_UNIQUE';
  end if;

  perform kc_private.kc_lock_privacy_subject(v_target_user_id);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'kc_erasure_help:' || p_help_request_id::text,
      0
    )
  );

  perform kc_private.kc_assert_active_admin_session(
    p_actor_id,
    p_actor_session_id
  );

  select user_row.id
  into v_locked_auth_user_id
  from auth.users user_row
  where user_row.id = v_target_user_id
    and user_row.deleted_at is null
    and pg_catalog.lower(
      pg_catalog.btrim(coalesce(user_row.email, ''))
    ) = v_email
  for share;

  select pg_catalog.count(*)::integer
  into v_account_count
  from auth.users user_row
  where user_row.deleted_at is null
    and pg_catalog.lower(
      pg_catalog.btrim(coalesce(user_row.email, ''))
    ) = v_email;

  if v_locked_auth_user_id is null or v_account_count <> 1 then
    raise exception using
      errcode = '40001',
      message = 'ERASURE_IDENTITY_ACCOUNT_CHANGED';
  end if;

  perform 1
  from public.profiles profile_row
  where profile_row.id = v_target_user_id
  for share;
  if not found then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_IDENTITY_PROFILE_MISSING';
  end if;

  select help_row.*
  into v_help
  from public.help_requests help_row
  where help_row.id = p_help_request_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'ERASURE_IDENTITY_HELP_NOT_FOUND';
  end if;

  v_help_kind := pg_catalog.lower(
    pg_catalog.btrim(coalesce(v_help.metadata ->> 'request_kind', ''))
  );
  if v_help.type is distinct from 'account_access'
     or v_help.topic is distinct from 'onboarding_settings'
     or v_help.subtopic is distinct from 'account_deletion'
     or v_help_kind not in ('', 'account_erasure')
     or pg_catalog.lower(
       pg_catalog.btrim(coalesce(v_help.contact_email, ''))
     ) <> v_email
     or (
       v_help.user_id is not null
       and v_help.user_id <> v_target_user_id
     ) then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_IDENTITY_HELP_MISMATCH';
  end if;

  v_was_authenticated_help := v_help.user_id is not null;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.min(request_row.id::text)::uuid
  into v_dsr_count, v_dsr_id
  from public.data_subject_requests request_row
  where request_row.help_request_id = p_help_request_id;

  if v_dsr_count > 1 then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_IDENTITY_DSR_NOT_UNIQUE';
  end if;

  if v_dsr_count = 1 and v_dsr_id is not null then
    return v_dsr_id;
  end if;

  -- Authenticated legacy is allowed: Help already has the owner UUID and no DSR.
  -- Anonymous path remains the original (user_id is null).

  if v_help.status not in ('new', 'triaged', 'in_progress') then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_IDENTITY_HELP_STATE_INVALID';
  end if;

  if nullif(
    pg_catalog.btrim(
      coalesce(v_help.metadata ->> 'data_subject_request_id', '')
    ),
    ''
  ) is not null then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_IDENTITY_DSR_MISMATCH';
  end if;

  if exists (
    select 1
    from kc_private.account_erasure_ticket_identity_links link_row
    where link_row.help_request_id = p_help_request_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_IDENTITY_LINK_CONFLICT';
  end if;

  if exists (
    select 1
    from kc_private.account_erasure_subject_closures closure_row
    where closure_row.subject_key_hash =
      kc_private.kc_privacy_subject_key(v_target_user_id)
      and closure_row.state in ('closing', 'completed')
  ) then
    raise exception using
      errcode = '55000',
      message = 'ERASURE_IDENTITY_SUBJECT_CLOSED';
  end if;

  if exists (
    select 1
    from public.data_subject_requests request_row
    where request_row.user_id = v_target_user_id
      and request_row.request_kind = 'account_erasure'
      and request_row.status in (
        'received',
        'processing',
        'ready',
        'pending_confirmation',
        'failed',
        'partial_failure'
      )
  ) or exists (
    select 1
    from public.account_erasure_requests workflow_row
    where workflow_row.user_id = v_target_user_id
      and workflow_row.help_request_id is distinct from p_help_request_id
      and workflow_row.status not in ('erased', 'cancelled')
  ) then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_IDENTITY_SUBJECT_CONFLICT';
  end if;

  v_dsr_id := extensions.gen_random_uuid();
  v_protocol := 'KC-DSR-'
    || pg_catalog.to_char(
      v_now at time zone 'UTC',
      'YYYYMMDD'
    )
    || '-'
    || pg_catalog.upper(
      pg_catalog.substr(
        pg_catalog.replace(v_dsr_id::text, '-', ''),
        1,
        16
      )
    );
  v_subject_hash :=
    pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  v_idempotency_key :=
    pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.data_subject_requests (
    id,
    protocol,
    user_id,
    help_request_id,
    subject_hash,
    request_kind,
    status,
    idempotency_key,
    requested_format,
    request_source,
    export_schema_version,
    scope
  ) values (
    v_dsr_id,
    v_protocol,
    v_target_user_id,
    p_help_request_id,
    v_subject_hash,
    'account_erasure',
    'received',
    v_idempotency_key,
    'json',
    case when v_was_authenticated_help then 'help' else 'help' end,
    1,
    pg_catalog.jsonb_build_array(
      'account',
      'profile',
      'authored_content',
      'interactions',
      'communications',
      'preferences',
      'consents',
      'storage_objects',
      'linked_identifiers'
    )
  );

  insert into public.data_subject_request_events (
    request_id,
    actor_user_id,
    status,
    event_type,
    public_message
  ) values (
    v_dsr_id,
    p_actor_id,
    'received',
    'created',
    case
      when v_was_authenticated_help then
        'Solicitacao legada autenticada protocolada e vinculada a conta.'
      else
        'Solicitacao anonima verificada, recebida e protocolada.'
    end
  );

  return v_dsr_id;
exception
  when unique_violation then
    raise exception using
      errcode = '40001',
      message = 'ERASURE_IDENTITY_DSR_MATERIALIZATION_CONFLICT';
end;
$$;

comment on function
  kc_private.kc_materialize_anonymous_erasure_dsr(
    uuid, text, uuid, uuid
  ) is
  'Materializa um unico DSR opaco para Help de exclusao (anonimo ou autenticado legado sem DSR), sob locks de titular/Help e sessao administrativa ativa; sem EXECUTE direto por papeis de API.';

notify pgrst, 'reload schema';

commit;

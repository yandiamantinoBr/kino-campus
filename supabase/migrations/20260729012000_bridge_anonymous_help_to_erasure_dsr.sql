-- ============================================================================
-- KinoCampus - ponte atomica de Help anonimo para DSR de exclusao
-- ============================================================================
-- Contratos:
--   * zero DSR em um Help anonimo canonico materializa exatamente um pedido;
--   * um DSR existente continua sendo validado/reutilizado pelo binder estrito;
--   * mais de um DSR, identidade ambigua ou estado avancado falham fechados;
--   * protocolo, subject_hash e idempotency_key sao aleatorios e server-side;
--   * o lock global do titular precede Help, DSR e workflow;
--   * materializacao, vinculo, workflow, ledger e eventos sao uma transacao.
-- ============================================================================

begin;

-- Preserva sem reescrever a implementacao estrita da 09000. Ela deixa o schema
-- exposto e perde o grant direto de service_role; somente o wrapper abaixo,
-- tambem SECURITY DEFINER e service-only, consegue alcanca-la.
alter function
  public.kc_link_verified_help_request_to_account_erasure(
    uuid, text, uuid, uuid, text, text, timestamptz
  )
  rename to kc_link_verified_help_request_to_account_erasure_strict_v1;

alter function
  public.kc_link_verified_help_request_to_account_erasure_strict_v1(
    uuid, text, uuid, uuid, text, text, timestamptz
  )
  set schema kc_private;

revoke all on function
  kc_private.kc_link_verified_help_request_to_account_erasure_strict_v1(
    uuid, text, uuid, uuid, text, text, timestamptz
  )
  from public, anon, authenticated, service_role;

comment on function
  kc_private.kc_link_verified_help_request_to_account_erasure_strict_v1(
    uuid, text, uuid, uuid, text, text, timestamptz
  ) is
  'Folha privada da 09000: valida/reutiliza um unico DSR e vincula Help, workflow, ledger e eventos; sem EXECUTE direto por papeis de API.';

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

  -- Mesma ordem global da 04000/07000/09000. O binder estrito reentra nesses
  -- locks na sequencia e entao adquire DSR e workflow.
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

  -- O caminho de um DSR permanece integralmente sob a validacao da folha
  -- estrita. Este helper nao promove nem corrige essa linha.
  if v_dsr_count = 1 and v_dsr_id is not null then
    return v_dsr_id;
  end if;

  if v_help.user_id is not null then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_IDENTITY_DSR_NOT_UNIQUE';
  end if;

  if v_help.status not in ('new', 'triaged', 'in_progress') then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_IDENTITY_HELP_STATE_INVALID';
  end if;

  -- Um UUID fornecido em metadata nunca vira autoridade para materializacao.
  -- Ausencia de DSR no banco com ponte declarada no Help e inconsistencia.
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
    'help',
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
    'Solicitacao anonima verificada, recebida e protocolada.'
  );

  return v_dsr_id;
exception
  when unique_violation then
    raise exception using
      errcode = '40001',
      message = 'ERASURE_IDENTITY_DSR_MATERIALIZATION_CONFLICT';
end;
$$;

revoke all on function
  kc_private.kc_materialize_anonymous_erasure_dsr(
    uuid, text, uuid, uuid
  )
  from public, anon, authenticated, service_role;

comment on function
  kc_private.kc_materialize_anonymous_erasure_dsr(
    uuid, text, uuid, uuid
  ) is
  'Materializa um unico DSR opaco para Help anonimo canonico, sob titular/Help locks e sessao administrativa ativa; sem EXECUTE direto por papeis de API.';

create or replace function
  public.kc_link_verified_help_request_to_account_erasure(
    p_help_request_id uuid,
    p_account_email text,
    p_actor_id uuid,
    p_actor_session_id uuid,
    p_verification_channel text,
    p_attestation_sha256 text,
    p_verified_at timestamptz
  )
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_channel text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_verification_channel, ''))
  );
  v_attestation_hash text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_attestation_sha256, ''))
  );
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'SERVICE_ROLE_REQUIRED';
  end if;

  if p_help_request_id is null
     or p_actor_id is null
     or p_actor_session_id is null
     or v_channel not in (
       'verified_email_challenge',
       'support_mailbox_reply',
       'identity_document_review',
       'in_person_verification'
     )
     or v_attestation_hash !~ '^[a-f0-9]{64}$'
     or p_verified_at is null
     or p_verified_at < v_now - interval '30 days'
     or p_verified_at > v_now + interval '5 minutes' then
    raise exception using
      errcode = '22023',
      message = 'ERASURE_IDENTITY_LINK_INPUT_INVALID';
  end if;

  perform kc_private.kc_materialize_anonymous_erasure_dsr(
    p_help_request_id,
    p_account_email,
    p_actor_id,
    p_actor_session_id
  );

  return
    kc_private.kc_link_verified_help_request_to_account_erasure_strict_v1(
      p_help_request_id,
      p_account_email,
      p_actor_id,
      p_actor_session_id,
      p_verification_channel,
      p_attestation_sha256,
      p_verified_at
    );
end;
$$;

revoke all on function
  public.kc_link_verified_help_request_to_account_erasure(
    uuid, text, uuid, uuid, text, text, timestamptz
  )
  from public, anon, authenticated;
grant execute on function
  public.kc_link_verified_help_request_to_account_erasure(
    uuid, text, uuid, uuid, text, text, timestamptz
  )
  to service_role;

comment on function
  public.kc_link_verified_help_request_to_account_erasure(
    uuid, text, uuid, uuid, text, text, timestamptz
  ) is
  'Service-only: materializa zero DSR ou reutiliza exatamente um e executa o binder estrito atomico com identidade administrativa verificada.';

notify pgrst, 'reload schema';

commit;

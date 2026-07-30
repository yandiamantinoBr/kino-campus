-- Account erasure release gate:
--   * the irreversible workflow claim, owner-cancellable DSR transition and
--     subject closure now succeed or roll back as one PostgreSQL transaction;
--   * a durable, claim-bound checkpoint makes the non-transactional Auth
--     deletion recoverable without trusting a replacement e-mail address.
--
-- This migration is expand-only. The previous RPC signature remains available
-- during rollout; capability version 5 tells the new Edge worker when it is safe
-- to use the stronger contract.

begin;

alter table public.account_erasure_requests
  add column if not exists auth_delete_state text,
  add column if not exists auth_delete_intent_token uuid,
  add column if not exists auth_delete_target_user_id uuid,
  add column if not exists auth_delete_intent_at timestamptz,
  add column if not exists auth_delete_confirmed_at timestamptz;

alter table public.account_erasure_requests
  drop constraint if exists account_erasure_auth_delete_checkpoint_check;
alter table public.account_erasure_requests
  add constraint account_erasure_auth_delete_checkpoint_check
  check (
    (
      auth_delete_state is null
      and auth_delete_intent_token is null
      and auth_delete_target_user_id is null
      and auth_delete_intent_at is null
      and auth_delete_confirmed_at is null
    )
    or (
      auth_delete_state = 'intent_recorded'
      and auth_delete_intent_token is not null
      and auth_delete_target_user_id is not null
      and auth_delete_intent_at is not null
      and auth_delete_confirmed_at is null
    )
    or (
      auth_delete_state = 'confirmed_absent'
      and auth_delete_intent_token is not null
      and auth_delete_target_user_id is not null
      and auth_delete_intent_at is not null
      and auth_delete_confirmed_at is not null
    )
  );

create unique index if not exists
  account_erasure_requests_auth_delete_intent_token_uidx
  on public.account_erasure_requests (auth_delete_intent_token)
  where auth_delete_intent_token is not null;

comment on column public.account_erasure_requests.auth_delete_state is
  'Durable checkpoint for the non-transactional Auth deletion boundary. Null after postconditions no longer need UUID-based repair.';
comment on column public.account_erasure_requests.auth_delete_target_user_id is
  'Temporary target UUID retained without an Auth FK only while an Auth deletion outcome still needs reconciliation.';

create or replace function public.kc_claim_account_erasure_irreversible_operation_v2(
  p_request_id uuid,
  p_expected_status text,
  p_expected_version integer,
  p_actor_id uuid,
  p_actor_session_id uuid,
  p_data_subject_request_id uuid,
  p_expected_data_subject_status text,
  p_ttl_seconds integer default 300
)
returns table (
  out_request_id uuid,
  out_claim_token uuid,
  out_operation_version integer,
  out_claim_expires_at timestamptz,
  out_data_subject_request_id uuid,
  out_data_subject_request_status text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_claim record;
  v_workflow public.account_erasure_requests%rowtype;
  v_dsr public.data_subject_requests%rowtype;
  v_transitioned public.data_subject_requests%rowtype;
  v_expected_dsr_status text :=
    pg_catalog.lower(pg_catalog.btrim(coalesce(p_expected_data_subject_status, '')));
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  -- The existing function owns the copy gate, subject advisory lock, workflow
  -- CAS/lease and closure write. Because PostgreSQL function calls are not
  -- autonomous transactions, any DSR error below rolls all of those effects
  -- back with this outer RPC statement.
  select *
  into v_claim
  from public.kc_claim_account_erasure_irreversible_operation(
    p_request_id,
    p_expected_status,
    p_expected_version,
    p_actor_id,
    p_actor_session_id,
    p_ttl_seconds
  );

  select workflow_row.*
  into v_workflow
  from public.account_erasure_requests workflow_row
  where workflow_row.id = p_request_id
  for update;

  if not found
     or v_workflow.operation_claim_token is distinct from
       v_claim.out_claim_token
     or v_workflow.operation_version is distinct from
       v_claim.out_operation_version then
    raise exception using
      errcode = '40001',
      message = 'ERASURE_ATOMIC_CLAIM_LOST';
  end if;

  if v_workflow.data_subject_request_id is distinct from
     p_data_subject_request_id then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_ATOMIC_DSR_LINK_MISMATCH';
  end if;

  if p_data_subject_request_id is null then
    if v_expected_dsr_status <> '' then
      raise exception using
        errcode = '22023',
        message = 'ERASURE_ATOMIC_DSR_STATUS_WITHOUT_LINK';
    end if;
  else
    if v_expected_dsr_status = '' then
      raise exception using
        errcode = '22023',
        message = 'ERASURE_ATOMIC_DSR_EXPECTED_STATUS_REQUIRED';
    end if;

    select request_row.*
    into v_dsr
    from public.data_subject_requests request_row
    where request_row.id = p_data_subject_request_id
    for update;

    if not found
       or v_dsr.request_kind <> 'account_erasure'
       or v_dsr.user_id is distinct from v_workflow.user_id then
      raise exception using
        errcode = '23514',
        message = 'ERASURE_ATOMIC_DSR_SUBJECT_MISMATCH';
    end if;
    if v_dsr.status <> v_expected_dsr_status then
      raise exception using
        errcode = '40001',
        message = 'ERASURE_ATOMIC_DSR_STATUS_CONFLICT';
    end if;
    if v_dsr.status in ('cancelled', 'completed', 'expired') then
      raise exception using
        errcode = '23514',
        message = 'ERASURE_ATOMIC_DSR_TERMINAL';
    end if;

    if v_dsr.status = 'processing' then
      v_transitioned := v_dsr;
    else
      v_transitioned := kc_private.kc_transition_data_subject_request(
        v_dsr.id,
        v_dsr.status,
        'processing',
        p_actor_id,
        'status_changed',
        'Exclusao confirmada e em processamento.'
      );
    end if;
  end if;

  out_request_id := v_claim.out_request_id;
  out_claim_token := v_claim.out_claim_token;
  out_operation_version := v_claim.out_operation_version;
  out_claim_expires_at := v_claim.out_claim_expires_at;
  out_data_subject_request_id := p_data_subject_request_id;
  out_data_subject_request_status := case
    when p_data_subject_request_id is null then null
    else v_transitioned.status
  end;
  return next;
end;
$$;

revoke all on function
  public.kc_claim_account_erasure_irreversible_operation_v2(
    uuid, text, integer, uuid, uuid, uuid, text, integer
  )
  from public, anon, authenticated;
grant execute on function
  public.kc_claim_account_erasure_irreversible_operation_v2(
    uuid, text, integer, uuid, uuid, uuid, text, integer
  )
  to service_role;

create or replace function
  public.kc_checkpoint_account_erasure_auth_delete_intent(
    p_workflow_id uuid,
    p_operation_claim_token uuid,
    p_expected_version integer,
    p_actor_id uuid,
    p_actor_session_id uuid,
    p_target_user_id uuid,
    p_core_inventory jsonb,
    p_checkpoint jsonb
  )
returns public.account_erasure_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_workflow public.account_erasure_requests%rowtype;
  v_intent_token uuid;
  v_intent_at timestamptz;
  v_result public.account_erasure_requests%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_workflow_id is null
     or p_operation_claim_token is null
     or p_expected_version is null
     or p_actor_id is null
     or p_actor_session_id is null
     or p_target_user_id is null
     or pg_catalog.jsonb_typeof(coalesce(p_core_inventory, 'null'::jsonb)) <>
       'object'
     or pg_catalog.jsonb_typeof(coalesce(p_checkpoint, 'null'::jsonb)) <>
       'object'
     or pg_catalog.octet_length(p_core_inventory::text) > 8388608
     or pg_catalog.octet_length(p_checkpoint::text) > 1048576 then
    raise exception using
      errcode = '22023',
      message = 'ERASURE_AUTH_DELETE_CHECKPOINT_ARGUMENTS_INVALID';
  end if;

  perform kc_private.kc_assert_active_admin_session(
    p_actor_id,
    p_actor_session_id
  );

  select workflow_row.*
  into v_workflow
  from public.account_erasure_requests workflow_row
  where workflow_row.id = p_workflow_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'ERASURE_WORKFLOW_NOT_FOUND';
  end if;
  if v_workflow.operation_claim_token is distinct from
       p_operation_claim_token
     or v_workflow.operation_version <> p_expected_version
     or v_workflow.operation_claimed_by is distinct from p_actor_id
     or v_workflow.operation_claim_session_id is distinct from
       p_actor_session_id
     or v_workflow.operation_claim_expires_at is null
     or v_workflow.operation_claim_expires_at <=
       pg_catalog.clock_timestamp() then
    raise exception using
      errcode = '40001',
      message = 'ERASURE_OPERATION_CLAIM_INVALID';
  end if;
  if v_workflow.status <> 'confirmed' then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_AUTH_DELETE_INTENT_STATUS_INVALID';
  end if;
  if v_workflow.user_id is distinct from p_target_user_id
     and v_workflow.auth_delete_target_user_id is distinct from
       p_target_user_id then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_AUTH_DELETE_TARGET_MISMATCH';
  end if;
  if v_workflow.metadata #>> '{identity_assurance,verified}' <> 'true'
     or v_workflow.metadata #>> '{identity_assurance,target_user_id}' <>
       p_target_user_id::text then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_AUTH_DELETE_IDENTITY_NOT_VERIFIED';
  end if;
  if not exists (
    select 1
    from kc_private.account_erasure_subject_closures closure_row
    where closure_row.workflow_id = v_workflow.id
      and closure_row.subject_key_hash =
        kc_private.kc_privacy_subject_key(p_target_user_id)
      and closure_row.state in ('closing', 'completed')
  ) then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_AUTH_DELETE_CLOSURE_NOT_VERIFIED';
  end if;
  if v_workflow.data_subject_request_id is not null
     and not exists (
       select 1
       from public.data_subject_requests request_row
       where request_row.id = v_workflow.data_subject_request_id
         and request_row.request_kind = 'account_erasure'
         and request_row.user_id = p_target_user_id
         and request_row.status = 'processing'
     ) then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_AUTH_DELETE_DSR_NOT_PROCESSING';
  end if;
  if v_workflow.auth_delete_state is null
     and not exists (
       select 1
       from auth.users user_row
       where user_row.id = p_target_user_id
     ) then
    raise exception using
      errcode = 'P0002',
      message = 'ERASURE_AUTH_USER_NOT_PRESENT_AT_INTENT';
  end if;
  if v_workflow.auth_delete_target_user_id is not null
     and v_workflow.auth_delete_target_user_id <> p_target_user_id then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_AUTH_DELETE_CHECKPOINT_TARGET_CONFLICT';
  end if;

  v_intent_token := coalesce(
    v_workflow.auth_delete_intent_token,
    extensions.gen_random_uuid()
  );
  v_intent_at := coalesce(
    v_workflow.auth_delete_intent_at,
    pg_catalog.clock_timestamp()
  );

  update public.account_erasure_requests workflow_row
  set
    auth_delete_state = coalesce(
      workflow_row.auth_delete_state,
      'intent_recorded'
    ),
    auth_delete_intent_token = v_intent_token,
    auth_delete_target_user_id = p_target_user_id,
    auth_delete_intent_at = v_intent_at,
    metadata = workflow_row.metadata
      || pg_catalog.jsonb_build_object(
        'auth_delete_checkpoint',
        p_checkpoint || pg_catalog.jsonb_build_object(
          'schema_version', 1,
          'intent_recorded_at', v_intent_at
        ),
        'core_inventory', p_core_inventory,
        'repair_target_user_id', p_target_user_id,
        'auth_delete_intent_recorded_at', v_intent_at
      ),
    updated_at = pg_catalog.clock_timestamp()
  where workflow_row.id = v_workflow.id
  returning workflow_row.* into v_result;

  return v_result;
end;
$$;

revoke all on function
  public.kc_checkpoint_account_erasure_auth_delete_intent(
    uuid, uuid, integer, uuid, uuid, uuid, jsonb, jsonb
  )
  from public, anon, authenticated;
grant execute on function
  public.kc_checkpoint_account_erasure_auth_delete_intent(
    uuid, uuid, integer, uuid, uuid, uuid, jsonb, jsonb
  )
  to service_role;

create or replace function
  public.kc_account_erasure_auth_delete_recovery_status(
    p_workflow_id uuid
  )
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_workflow public.account_erasure_requests%rowtype;
  v_identity_verified boolean;
  v_closure_verified boolean;
  v_inventory_ready boolean;
  v_auth_user_present boolean;
  v_ok boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  select workflow_row.*
  into v_workflow
  from public.account_erasure_requests workflow_row
  where workflow_row.id = p_workflow_id;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'error', 'ERASURE_WORKFLOW_NOT_FOUND'
    );
  end if;

  v_identity_verified :=
    v_workflow.auth_delete_target_user_id is not null
    and v_workflow.metadata #>> '{identity_assurance,verified}' = 'true'
    and v_workflow.metadata #>> '{identity_assurance,target_user_id}' =
      v_workflow.auth_delete_target_user_id::text;
  v_closure_verified :=
    v_workflow.auth_delete_target_user_id is not null
    and exists (
      select 1
      from kc_private.account_erasure_subject_closures closure_row
      where closure_row.workflow_id = v_workflow.id
        and closure_row.subject_key_hash =
          kc_private.kc_privacy_subject_key(
            v_workflow.auth_delete_target_user_id
          )
        and closure_row.state in ('closing', 'completed')
    );
  v_inventory_ready :=
    pg_catalog.jsonb_typeof(
      coalesce(v_workflow.metadata -> 'core_inventory', 'null'::jsonb)
    ) = 'object';
  v_auth_user_present :=
    v_workflow.auth_delete_target_user_id is not null
    and exists (
      select 1
      from auth.users user_row
      where user_row.id = v_workflow.auth_delete_target_user_id
    );
  v_ok :=
    v_workflow.auth_delete_state in ('intent_recorded', 'confirmed_absent')
    and v_workflow.auth_delete_intent_token is not null
    and v_workflow.auth_delete_target_user_id is not null
    and v_workflow.auth_delete_intent_at is not null
    and v_identity_verified
    and v_closure_verified
    and v_inventory_ready;

  return pg_catalog.jsonb_build_object(
    'ok', v_ok,
    'error', case
      when v_workflow.auth_delete_state is null
        then 'ERASURE_AUTH_DELETE_CHECKPOINT_MISSING'
      when not v_identity_verified
        then 'ERASURE_AUTH_DELETE_IDENTITY_NOT_VERIFIED'
      when not v_closure_verified
        then 'ERASURE_AUTH_DELETE_CLOSURE_NOT_VERIFIED'
      when not v_inventory_ready
        then 'ERASURE_AUTH_DELETE_INVENTORY_NOT_READY'
      else null
    end,
    'checkpoint_state', v_workflow.auth_delete_state,
    'intent_token', v_workflow.auth_delete_intent_token,
    'target_user_id', v_workflow.auth_delete_target_user_id,
    'intent_at', v_workflow.auth_delete_intent_at,
    'confirmed_at', v_workflow.auth_delete_confirmed_at,
    'identity_verified', v_identity_verified,
    'closure_verified', v_closure_verified,
    'core_inventory_ready', v_inventory_ready,
    'auth_user_present', v_auth_user_present
  );
end;
$$;

revoke all on function
  public.kc_account_erasure_auth_delete_recovery_status(uuid)
  from public, anon, authenticated;
grant execute on function
  public.kc_account_erasure_auth_delete_recovery_status(uuid)
  to service_role;

create or replace function
  public.kc_confirm_account_erasure_auth_deleted(
    p_workflow_id uuid,
    p_operation_claim_token uuid,
    p_expected_version integer,
    p_actor_id uuid,
    p_actor_session_id uuid,
    p_intent_token uuid
  )
returns public.account_erasure_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_workflow public.account_erasure_requests%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_failure_stage text;
  v_result public.account_erasure_requests%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  perform kc_private.kc_assert_active_admin_session(
    p_actor_id,
    p_actor_session_id
  );

  select workflow_row.*
  into v_workflow
  from public.account_erasure_requests workflow_row
  where workflow_row.id = p_workflow_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'ERASURE_WORKFLOW_NOT_FOUND';
  end if;
  if v_workflow.operation_claim_token is distinct from
       p_operation_claim_token
     or v_workflow.operation_version <> p_expected_version
     or v_workflow.operation_claimed_by is distinct from p_actor_id
     or v_workflow.operation_claim_session_id is distinct from
       p_actor_session_id
     or v_workflow.operation_claim_expires_at is null
     or v_workflow.operation_claim_expires_at <= v_now then
    raise exception using
      errcode = '40001',
      message = 'ERASURE_OPERATION_CLAIM_INVALID';
  end if;
  if v_workflow.auth_delete_state not in (
       'intent_recorded',
       'confirmed_absent'
     )
     or v_workflow.auth_delete_intent_token is distinct from p_intent_token
     or v_workflow.auth_delete_target_user_id is null then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_AUTH_DELETE_CHECKPOINT_INVALID';
  end if;
  if v_workflow.metadata #>> '{identity_assurance,verified}' <> 'true'
     or v_workflow.metadata #>> '{identity_assurance,target_user_id}' <>
       v_workflow.auth_delete_target_user_id::text then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_AUTH_DELETE_IDENTITY_NOT_VERIFIED';
  end if;
  if not exists (
    select 1
    from kc_private.account_erasure_subject_closures closure_row
    where closure_row.workflow_id = v_workflow.id
      and closure_row.subject_key_hash =
        kc_private.kc_privacy_subject_key(
          v_workflow.auth_delete_target_user_id
        )
      and closure_row.state in ('closing', 'completed')
  ) then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_AUTH_DELETE_CLOSURE_NOT_VERIFIED';
  end if;
  if exists (
    select 1
    from auth.users user_row
    where user_row.id = v_workflow.auth_delete_target_user_id
  ) then
    raise exception using
      errcode = '55000',
      message = 'ERASURE_AUTH_USER_STILL_PRESENT';
  end if;

  v_failure_stage := case
    when v_workflow.metadata ->> 'auth_deleted' = 'true'
      then coalesce(
        nullif(v_workflow.metadata ->> 'failure_stage', ''),
        'postconditions'
      )
    else 'postconditions'
  end;

  update public.account_erasure_requests workflow_row
  set
    status = case
      when workflow_row.status = 'erased' then 'erased'
      else 'partial_failure'
    end,
    auth_delete_state = 'confirmed_absent',
    auth_delete_confirmed_at = coalesce(
      workflow_row.auth_delete_confirmed_at,
      v_now
    ),
    metadata = workflow_row.metadata
      || pg_catalog.jsonb_build_object(
        'auth_deleted', true,
        'auth_delete_confirmed_at',
          coalesce(workflow_row.auth_delete_confirmed_at, v_now),
        'failure_stage', v_failure_stage,
        'retryable', workflow_row.status <> 'erased',
        'repair_target_user_id',
          workflow_row.auth_delete_target_user_id
      ),
    updated_at = v_now
  where workflow_row.id = v_workflow.id
  returning workflow_row.* into v_result;

  return v_result;
end;
$$;

revoke all on function
  public.kc_confirm_account_erasure_auth_deleted(
    uuid, uuid, integer, uuid, uuid, uuid
  )
  from public, anon, authenticated;
grant execute on function
  public.kc_confirm_account_erasure_auth_deleted(
    uuid, uuid, integer, uuid, uuid, uuid
  )
  to service_role;

create or replace function public.kc_account_erasure_capabilities()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_guard_coverage jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  v_guard_coverage := public.kc_active_session_guard_coverage();
  return pg_catalog.jsonb_build_object(
    'version', 5,
    'write_quiescence',
      coalesce((v_guard_coverage ->> 'ok')::boolean, false),
    'chat_preserving_delete', true,
    'cadu_set_null', true,
    'unit_meta_set_null', true,
    'community_content_preserving_delete', true,
    'safety_records_preserving_delete', true,
    'audit_identifier_redaction', true,
    'audit_personal_email_redaction', true,
    'help_request_redaction_postcondition', true,
    'pre_erasure_copy_gate', true,
    'export_artifact_erasure_purge', true,
    'encrypted_completion_outbox', true,
    'durable_subject_closure', true,
    'renewable_operation_lease', true,
    'admin_session_bound_claims', true,
    'atomic_workflow_upsert', true,
    'atomic_irreversible_dsr_transition', true,
    'durable_auth_delete_checkpoint', true
  );
end;
$$;

revoke all on function public.kc_account_erasure_capabilities()
  from public, anon, authenticated;
grant execute on function public.kc_account_erasure_capabilities()
  to service_role;

comment on function
  public.kc_claim_account_erasure_irreversible_operation_v2(
    uuid, text, integer, uuid, uuid, uuid, text, integer
  ) is
  'Expand-only v2 claim: workflow lease, copy gate, DSR processing CAS and subject closure share one transaction.';
comment on function
  public.kc_checkpoint_account_erasure_auth_delete_intent(
    uuid, uuid, integer, uuid, uuid, uuid, jsonb, jsonb
  ) is
  'Persists the verified target and repair inventory immediately before the external Auth delete call.';
comment on function
  public.kc_confirm_account_erasure_auth_deleted(
    uuid, uuid, integer, uuid, uuid, uuid
  ) is
  'Marks Auth absence only after the database confirms the checkpoint target no longer exists; leaves a retryable postcondition state.';

commit;

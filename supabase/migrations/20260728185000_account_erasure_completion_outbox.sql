begin;

create table kc_private.account_erasure_completion_outbox (
  workflow_id uuid primary key
    references public.account_erasure_requests(id) on delete cascade,
  data_subject_request_id uuid
    references public.data_subject_requests(id) on delete cascade,
  recipient_ciphertext text,
  recipient_nonce text,
  key_version text not null,
  algorithm text not null default 'AES-256-GCM',
  status text not null default 'staged',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  delivery_claim_token uuid,
  delivery_claimed_at timestamptz,
  accepted_at timestamptz,
  constraint account_erasure_completion_outbox_algorithm_check
    check (algorithm = 'AES-256-GCM'),
  constraint account_erasure_completion_outbox_status_check
    check (status in ('staged', 'accepted')),
  constraint account_erasure_completion_outbox_key_version_check
    check (key_version ~ '^[A-Za-z0-9._-]{1,64}$'),
  constraint account_erasure_completion_outbox_attempt_count_check
    check (attempt_count >= 0),
  constraint account_erasure_completion_outbox_attempt_state_check
    check (
      (attempt_count = 0 and last_attempt_at is null)
      or (attempt_count > 0 and last_attempt_at is not null)
    ),
  constraint account_erasure_completion_outbox_claim_state_check
    check (
      (delivery_claim_token is null and delivery_claimed_at is null)
      or (
        status = 'staged'
        and delivery_claim_token is not null
        and delivery_claimed_at is not null
      )
    ),
  constraint account_erasure_completion_outbox_ttl_check
    check (expires_at > created_at),
  constraint account_erasure_completion_outbox_payload_check
    check (
      (
        status = 'staged'
        and recipient_ciphertext ~ '^[A-Za-z0-9_-]+$'
        and pg_catalog.char_length(recipient_ciphertext) between 32 and 2048
        and recipient_nonce ~ '^[A-Za-z0-9_-]{16}$'
        and accepted_at is null
      )
      or
      (
        status = 'accepted'
        and recipient_ciphertext is null
        and recipient_nonce is null
        and accepted_at is not null
      )
    )
);

create index account_erasure_completion_outbox_expires_idx
  on kc_private.account_erasure_completion_outbox (expires_at, workflow_id);

revoke all on table kc_private.account_erasure_completion_outbox
  from public, anon, authenticated, service_role;

create or replace function kc_private.kc_assert_erasure_operation_claim(
  p_workflow_id uuid,
  p_operation_claim_token uuid,
  p_required_status text default null
)
returns public.account_erasure_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_workflow public.account_erasure_requests%rowtype;
begin
  select *
  into v_workflow
  from public.account_erasure_requests workflow
  where workflow.id = p_workflow_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ERASURE_WORKFLOW_NOT_FOUND';
  end if;
  if v_workflow.operation_claim_token is distinct from p_operation_claim_token
     or v_workflow.operation_claim_expires_at is null
     or v_workflow.operation_claim_expires_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode = '40001', message = 'ERASURE_OPERATION_CLAIM_INVALID';
  end if;
  if p_required_status is not null and v_workflow.status <> p_required_status then
    raise exception using errcode = 'P0001', message = 'ERASURE_WORKFLOW_STATUS_INVALID';
  end if;
  return v_workflow;
end;
$$;

revoke all on function kc_private.kc_assert_erasure_operation_claim(uuid, uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.kc_account_erasure_completion_outbox_status(
  p_workflow_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row kc_private.account_erasure_completion_outbox%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  delete from kc_private.account_erasure_completion_outbox outbox
  where outbox.workflow_id = p_workflow_id
    and outbox.expires_at <= pg_catalog.clock_timestamp();

  select *
  into v_row
  from kc_private.account_erasure_completion_outbox outbox
  where outbox.workflow_id = p_workflow_id;

  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'status', 'missing',
      'expires_at', null,
      'key_version', null
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'status', v_row.status,
    'expires_at', v_row.expires_at,
    'key_version', v_row.key_version
  );
end;
$$;

revoke all on function public.kc_account_erasure_completion_outbox_status(uuid)
  from public, anon, authenticated;
grant execute on function public.kc_account_erasure_completion_outbox_status(uuid)
  to service_role;

create or replace function public.kc_stage_account_erasure_completion_outbox(
  p_workflow_id uuid,
  p_operation_claim_token uuid,
  p_data_subject_request_id uuid,
  p_recipient_ciphertext text,
  p_recipient_nonce text,
  p_key_version text,
  p_ttl_seconds integer default 21600
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_workflow public.account_erasure_requests%rowtype;
  v_existing kc_private.account_erasure_completion_outbox%rowtype;
  v_expires_at timestamptz;
  v_stored boolean := false;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds < 900 or p_ttl_seconds > 86400 then
    raise exception using errcode = '22023', message = 'COMPLETION_OUTBOX_TTL_INVALID';
  end if;
  if p_recipient_ciphertext is null
     or p_recipient_nonce is null
     or p_key_version is null
     or p_recipient_ciphertext !~ '^[A-Za-z0-9_-]+$'
     or pg_catalog.char_length(p_recipient_ciphertext) not between 32 and 2048
     or p_recipient_nonce !~ '^[A-Za-z0-9_-]{16}$'
     or p_key_version !~ '^[A-Za-z0-9._-]{1,64}$' then
    raise exception using errcode = '22023', message = 'COMPLETION_OUTBOX_PAYLOAD_INVALID';
  end if;

  v_workflow := kc_private.kc_assert_erasure_operation_claim(
    p_workflow_id,
    p_operation_claim_token,
    null
  );
  if v_workflow.status not in ('partial_failure', 'failed')
     or v_workflow.metadata ->> 'auth_deleted' <> 'true' then
    raise exception using errcode = 'P0001', message = 'COMPLETION_OUTBOX_STAGE_NOT_ALLOWED';
  end if;
  if v_workflow.data_subject_request_id is distinct from p_data_subject_request_id then
    raise exception using errcode = 'P0001', message = 'COMPLETION_OUTBOX_DSR_MISMATCH';
  end if;
  if p_data_subject_request_id is not null and not exists (
    select 1
    from public.data_subject_requests request_row
    where request_row.id = p_data_subject_request_id
      and request_row.help_request_id = v_workflow.help_request_id
      and request_row.status in ('processing', 'partial_failure')
  ) then
    raise exception using errcode = 'P0001', message = 'COMPLETION_OUTBOX_DSR_NOT_READY';
  end if;

  delete from kc_private.account_erasure_completion_outbox outbox
  where outbox.workflow_id = p_workflow_id
    and outbox.expires_at <= pg_catalog.clock_timestamp();

  select *
  into v_existing
  from kc_private.account_erasure_completion_outbox outbox
  where outbox.workflow_id = p_workflow_id
  for update;

  if found then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'status', v_existing.status,
      'stored', false,
      'expires_at', v_existing.expires_at,
      'key_version', v_existing.key_version
    );
  end if;

  v_expires_at := pg_catalog.clock_timestamp() +
    pg_catalog.make_interval(secs => p_ttl_seconds);
  insert into kc_private.account_erasure_completion_outbox (
    workflow_id,
    data_subject_request_id,
    recipient_ciphertext,
    recipient_nonce,
    key_version,
    expires_at
  ) values (
    p_workflow_id,
    p_data_subject_request_id,
    p_recipient_ciphertext,
    p_recipient_nonce,
    p_key_version,
    v_expires_at
  );
  v_stored := true;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'status', 'staged',
    'stored', v_stored,
    'expires_at', v_expires_at,
    'key_version', p_key_version
  );
end;
$$;

revoke all on function public.kc_stage_account_erasure_completion_outbox(
  uuid, uuid, uuid, text, text, text, integer
) from public, anon, authenticated;
grant execute on function public.kc_stage_account_erasure_completion_outbox(
  uuid, uuid, uuid, text, text, text, integer
) to service_role;

create or replace function public.kc_claim_account_erasure_completion_outbox(
  p_workflow_id uuid,
  p_operation_claim_token uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_workflow public.account_erasure_requests%rowtype;
  v_row kc_private.account_erasure_completion_outbox%rowtype;
  v_delivery_claim_token uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  v_workflow := kc_private.kc_assert_erasure_operation_claim(
    p_workflow_id,
    p_operation_claim_token,
    'erased'
  );
  if v_workflow.metadata ->> 'notification_pending' <> 'true' then
    raise exception using errcode = 'P0001', message = 'COMPLETION_NOTIFICATION_NOT_PENDING';
  end if;
  if v_workflow.data_subject_request_id is not null and not exists (
    select 1
    from public.data_subject_requests request_row
    where request_row.id = v_workflow.data_subject_request_id
      and request_row.status = 'completed'
  ) then
    raise exception using errcode = 'P0001', message = 'COMPLETION_OUTBOX_DSR_NOT_FINAL';
  end if;
  if v_workflow.help_request_id is null or not exists (
    select 1
    from public.help_requests help_row
    where help_row.id = v_workflow.help_request_id
      and help_row.status = 'resolved'
      and help_row.contact_email like '%@redacted.kinocampus.local'
      and help_row.subject = 'Solicitacao LGPD atendida'
      and help_row.message = 'Conteudo removido por solicitacao LGPD.'
      and help_row.metadata -> 'lgpd_erasure' ->> 'contact_redacted' = 'true'
  ) then
    raise exception using errcode = 'P0001', message = 'COMPLETION_OUTBOX_HELP_NOT_REDACTED';
  end if;

  select *
  into v_row
  from kc_private.account_erasure_completion_outbox outbox
  where outbox.workflow_id = p_workflow_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'COMPLETION_OUTBOX_NOT_FOUND';
  end if;
  if v_row.expires_at <= pg_catalog.clock_timestamp() then
    delete from kc_private.account_erasure_completion_outbox
    where workflow_id = p_workflow_id;
    -- Returning (instead of raising) is intentional: an exception would roll
    -- back the deletion and retain expired ciphertext indefinitely.
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'status', 'expired',
      'recipient_ciphertext', null,
      'recipient_nonce', null,
      'key_version', v_row.key_version,
      'delivery_claim_token', null,
      'accepted_at', null,
      'expires_at', v_row.expires_at
    );
  end if;
  if v_row.status = 'accepted' then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'status', 'accepted',
      'recipient_ciphertext', null,
      'recipient_nonce', null,
      'key_version', v_row.key_version,
      'delivery_claim_token', null,
      'accepted_at', v_row.accepted_at,
      'expires_at', v_row.expires_at
    );
  end if;
  if v_row.delivery_claim_token is not null
     and v_row.delivery_claimed_at >
       pg_catalog.clock_timestamp() - pg_catalog.make_interval(secs => 900) then
    raise exception using
      errcode = '55P03',
      message = 'COMPLETION_OUTBOX_DELIVERY_ALREADY_CLAIMED';
  end if;

  v_delivery_claim_token := extensions.gen_random_uuid();
  update kc_private.account_erasure_completion_outbox outbox
  set attempt_count = outbox.attempt_count + 1,
      last_attempt_at = pg_catalog.clock_timestamp(),
      delivery_claim_token = v_delivery_claim_token,
      delivery_claimed_at = pg_catalog.clock_timestamp()
  where outbox.workflow_id = p_workflow_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'status', 'staged',
    'recipient_ciphertext', v_row.recipient_ciphertext,
    'recipient_nonce', v_row.recipient_nonce,
    'key_version', v_row.key_version,
    'delivery_claim_token', v_delivery_claim_token,
    'accepted_at', null,
    'expires_at', v_row.expires_at
  );
end;
$$;

revoke all on function public.kc_claim_account_erasure_completion_outbox(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.kc_claim_account_erasure_completion_outbox(uuid, uuid)
  to service_role;

create or replace function public.kc_accept_account_erasure_completion_delivery(
  p_workflow_id uuid,
  p_operation_claim_token uuid,
  p_delivery_claim_token uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_accepted_at timestamptz := pg_catalog.clock_timestamp();
  v_count bigint;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  perform kc_private.kc_assert_erasure_operation_claim(
    p_workflow_id,
    p_operation_claim_token,
    'erased'
  );

  update kc_private.account_erasure_completion_outbox outbox
  set status = 'accepted',
      recipient_ciphertext = null,
      recipient_nonce = null,
      accepted_at = v_accepted_at,
      delivery_claim_token = null,
      delivery_claimed_at = null
  where outbox.workflow_id = p_workflow_id
    and outbox.status = 'staged'
    and outbox.delivery_claim_token = p_delivery_claim_token
    and outbox.expires_at > v_accepted_at;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception using errcode = '40001', message = 'COMPLETION_OUTBOX_ACCEPT_CONFLICT';
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'status', 'accepted',
    'accepted_at', v_accepted_at,
    'ciphertext_deleted', true
  );
end;
$$;

revoke all on function public.kc_accept_account_erasure_completion_delivery(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.kc_accept_account_erasure_completion_delivery(uuid, uuid, uuid)
  to service_role;

create or replace function public.kc_release_account_erasure_completion_delivery(
  p_workflow_id uuid,
  p_operation_claim_token uuid,
  p_delivery_claim_token uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count bigint;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  perform kc_private.kc_assert_erasure_operation_claim(
    p_workflow_id,
    p_operation_claim_token,
    'erased'
  );

  update kc_private.account_erasure_completion_outbox outbox
  set delivery_claim_token = null,
      delivery_claimed_at = null
  where outbox.workflow_id = p_workflow_id
    and outbox.status = 'staged'
    and outbox.delivery_claim_token = p_delivery_claim_token;
  get diagnostics v_count = row_count;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'released', v_count = 1
  );
end;
$$;

revoke all on function public.kc_release_account_erasure_completion_delivery(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.kc_release_account_erasure_completion_delivery(uuid, uuid, uuid)
  to service_role;

create or replace function public.kc_discard_account_erasure_completion_outbox(
  p_workflow_id uuid,
  p_operation_claim_token uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count bigint;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  perform kc_private.kc_assert_erasure_operation_claim(
    p_workflow_id,
    p_operation_claim_token,
    null
  );

  delete from kc_private.account_erasure_completion_outbox outbox
  where outbox.workflow_id = p_workflow_id;
  get diagnostics v_count = row_count;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'deleted', v_count,
    'ciphertext_deleted', true
  );
end;
$$;

revoke all on function public.kc_discard_account_erasure_completion_outbox(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.kc_discard_account_erasure_completion_outbox(uuid, uuid)
  to service_role;

create or replace function kc_private.kc_purge_expired_account_erasure_completion_outbox(
  p_limit integer default 500
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if p_limit < 1 or p_limit > 5000 then
    raise exception using errcode = '22023', message = 'PURGE_LIMIT_INVALID';
  end if;
  with candidates as (
    select outbox.workflow_id
    from kc_private.account_erasure_completion_outbox outbox
    where outbox.expires_at <= pg_catalog.clock_timestamp()
    order by outbox.expires_at, outbox.workflow_id
    limit p_limit
    for update skip locked
  )
  delete from kc_private.account_erasure_completion_outbox outbox
  using candidates
  where outbox.workflow_id = candidates.workflow_id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function kc_private.kc_purge_expired_account_erasure_completion_outbox(integer)
  from public, anon, authenticated, service_role;

create or replace function public.kc_purge_expired_account_erasure_completion_outbox(
  p_limit integer default 500
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  v_deleted := kc_private.kc_purge_expired_account_erasure_completion_outbox(p_limit);
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'purged', v_deleted,
    'ciphertext_retained', false
  );
end;
$$;

revoke all on function public.kc_purge_expired_account_erasure_completion_outbox(integer)
  from public, anon, authenticated;
grant execute on function public.kc_purge_expired_account_erasure_completion_outbox(integer)
  to service_role;

create table kc_private.account_erasure_completion_outbox_schedule_state (
  singleton boolean primary key default true check (singleton),
  cron_available boolean not null,
  scheduled boolean not null,
  job_id bigint,
  schedule text not null default '11 * * * *',
  checked_at timestamptz not null default now(),
  operational_alert text
);

revoke all on table kc_private.account_erasure_completion_outbox_schedule_state
  from public, anon, authenticated, service_role;

do $$
declare
  v_job_id bigint;
  v_existing boolean := false;
begin
  if to_regclass('cron.job') is null
     or to_regprocedure('cron.schedule(text,text,text)') is null then
    insert into kc_private.account_erasure_completion_outbox_schedule_state (
      singleton, cron_available, scheduled, job_id, operational_alert
    ) values (
      true, false, false, null, 'PG_CRON_UNAVAILABLE_COMPLETION_OUTBOX_PURGE_NOT_SCHEDULED'
    )
    on conflict (singleton) do update set
      cron_available = excluded.cron_available,
      scheduled = excluded.scheduled,
      job_id = excluded.job_id,
      checked_at = now(),
      operational_alert = excluded.operational_alert;
    raise warning 'PG_CRON_UNAVAILABLE_COMPLETION_OUTBOX_PURGE_NOT_SCHEDULED';
    return;
  end if;

  execute
    'select exists (select 1 from cron.job where jobname = $1)'
    into v_existing
    using 'kc-erasure-completion-outbox-purge-hourly';
  if v_existing then
    execute 'select cron.unschedule($1)'
      using 'kc-erasure-completion-outbox-purge-hourly';
  end if;

  execute 'select cron.schedule($1, $2, $3)'
    into v_job_id
    using
      'kc-erasure-completion-outbox-purge-hourly',
      '11 * * * *',
      'select kc_private.kc_purge_expired_account_erasure_completion_outbox(500);';

  insert into kc_private.account_erasure_completion_outbox_schedule_state (
    singleton, cron_available, scheduled, job_id, operational_alert
  ) values (
    true, true, true, v_job_id, null
  )
  on conflict (singleton) do update set
    cron_available = excluded.cron_available,
    scheduled = excluded.scheduled,
    job_id = excluded.job_id,
    checked_at = now(),
    operational_alert = excluded.operational_alert;
end;
$$;

comment on table kc_private.account_erasure_completion_outbox is
  'Short-lived AES-GCM ciphertext for the final erasure recipient. The encryption key remains outside PostgreSQL; ciphertext is nulled on SMTP acceptance and purged on TTL.';

-- Publish the outbox contract only after its table, gates, CAS acceptance and
-- TTL purge exist. The Edge worker refuses irreversible work on older shapes.
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
    'version', 3,
    'write_quiescence', coalesce((v_guard_coverage ->> 'ok')::boolean, false),
    'chat_preserving_delete', true,
    'cadu_set_null', true,
    'unit_meta_set_null', true,
    'community_content_preserving_delete', true,
    'safety_records_preserving_delete', true,
    'audit_identifier_redaction', true,
    'encrypted_completion_outbox', true
  );
end;
$$;

revoke all on function public.kc_account_erasure_capabilities()
  from public, anon, authenticated;
grant execute on function public.kc_account_erasure_capabilities()
  to service_role;

commit;

-- Durable, storage-first retention for LGPD data-export supplements.
--
-- The database only claims work and records CAS state. Object deletion remains
-- in a dedicated Edge worker because deleting storage.objects directly would
-- bypass the Storage API and can orphan the backing object.

begin;

-- pg_net persists request headers in net.http_request_queue until its worker
-- consumes and deletes the row. Only a short-lived HMAC signature, timestamp
-- and unique nonce enter that queue; the reusable Vault secret never does.
-- Extension-owned pg_net ACLs remain managed by Supabase. Configuration and
-- dispatch fail closed if browser roles can read decrypted Vault values.

-- Defense in depth: even if a permissive Storage policy is added later, browser
-- roles cannot read or mutate the private export bucket. service_role bypasses
-- RLS and is used only inside the two export Edge Functions.
drop policy if exists storage_data_exports_deny_browser_access
  on storage.objects;
create policy storage_data_exports_deny_browser_access
  on storage.objects
  as restrictive
  for all
  to anon, authenticated
  using (bucket_id <> 'kino-data-exports')
  with check (bucket_id <> 'kino-data-exports');

-- Recover every expired build lease, including a worker that uploaded the
-- object and crashed before finalize. Active requests are rebuilt after the
-- object is removed; closed requests are permanently purged.
create or replace function kc_private.kc_claim_expired_data_export_artifacts(
  p_limit integer default 50,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := coalesce(p_limit, 50);
  v_candidate kc_private.data_export_artifacts%rowtype;
  v_claimed kc_private.data_export_artifacts%rowtype;
  v_rebuild_after_cleanup boolean;
  v_claims jsonb := '[]'::jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_actor_id is not null and not public.kc_is_admin(p_actor_id) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if v_limit < 1 or v_limit > 100 then
    raise exception using
      errcode = '22023',
      message = 'EXPORT_PURGE_BATCH_LIMIT_INVALID';
  end if;

  for v_candidate in
    select artifact_row.*
    from kc_private.data_export_artifacts artifact_row
    where (
      artifact_row.status = 'ready'
      and artifact_row.expires_at <= now()
    ) or (
      artifact_row.status = 'download_reserved'
      and artifact_row.expires_at <= now()
      and coalesce(
        artifact_row.download_expires_at,
        '-infinity'::timestamptz
      ) <= now()
    ) or (
      artifact_row.status = 'delivered'
      and artifact_row.delivered_at <= now() - interval '1 hour'
    ) or (
      artifact_row.status = 'failed'
      and artifact_row.failed_at <= now() - interval '24 hours'
    ) or (
      artifact_row.status = 'claimed'
      and artifact_row.claim_expires_at <= now()
    ) or artifact_row.status = 'expired'
      or (
        artifact_row.status = 'purging'
        and artifact_row.purge_reason is distinct from 'account_erasure'
        and artifact_row.updated_at <= now() - interval '15 minutes'
      )
    order by coalesce(
      artifact_row.claim_expires_at,
      artifact_row.expires_at,
      artifact_row.delivered_at,
      artifact_row.failed_at,
      artifact_row.updated_at
    ) asc, artifact_row.id asc
    for update skip locked
    limit v_limit
  loop
    v_rebuild_after_cleanup :=
      v_candidate.status = 'claimed'
      and exists (
        select 1
        from public.data_subject_requests request_row
        where request_row.id = v_candidate.request_id
          and request_row.user_id = v_candidate.owner_user_id
          and request_row.status in ('ready', 'partial_failure')
      )
      and not exists (
        select 1
        from public.account_erasure_requests erasure_row
        where erasure_row.user_id = v_candidate.owner_user_id
          and erasure_row.status in (
            'confirmed',
            'reversible_applied',
            'erased',
            'partial_failure'
          )
      );

    update kc_private.data_export_artifacts artifact_row
    set
      status = 'purging',
      row_version = artifact_row.row_version + 1,
      claim_token_hash = null,
      claimed_by = null,
      claimed_at = null,
      claim_expires_at = null,
      upload_authorized_at = null,
      download_token_hash = null,
      download_session_id = null,
      download_reserved_at = null,
      download_expires_at = null,
      last_error_code = case
        when v_rebuild_after_cleanup
          then 'EXPORT_STALE_CLAIM_CLEANUP'
        else artifact_row.last_error_code
      end,
      purge_reason = 'retention',
      purge_erasure_request_id = null,
      updated_at = now()
    where artifact_row.id = v_candidate.id
      and artifact_row.row_version = v_candidate.row_version
      and artifact_row.status = v_candidate.status
      and (
        v_candidate.status <> 'claimed'
        or artifact_row.claim_expires_at <= now()
      )
    returning * into v_claimed;

    if not found then
      raise exception using
        errcode = '40001',
        message = 'EXPORT_ARTIFACT_PURGE_CLAIM_CONFLICT';
    end if;

    v_claims := v_claims || jsonb_build_array(jsonb_build_object(
      'artifact_ref', v_claimed.artifact_ref,
      'version', v_claimed.row_version,
      'bucket_id', v_claimed.bucket_id,
      'object_path', v_claimed.object_path,
      'recovery_mode', case
        when v_rebuild_after_cleanup then 'rebuild_after_cleanup'
        else 'purge'
      end
    ));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'claimed_count', jsonb_array_length(v_claims),
    'artifacts', v_claims,
    'metadata_retained_until_storage_confirmation', true
  );
end;
$$;

-- Complete the Storage-first CAS. A stale build for an active request remains
-- retryable and keeps its processor matrix; ordinary retention minimizes the
-- row exactly as before.
create or replace function kc_private.kc_purge_data_export_artifact(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact kc_private.data_export_artifacts%rowtype;
  v_rebuild_after_cleanup boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_actor_id is not null and not public.kc_is_admin(p_actor_id) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_artifact_ref !~ '^KEA-[A-F0-9]{32}$'
     or p_expected_version is null then
    raise exception using
      errcode = '22023',
      message = 'EXPORT_ARTIFACT_PURGE_INVALID';
  end if;

  select artifact_row.*
    into v_artifact
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  if v_artifact.row_version <> p_expected_version then
    raise exception using
      errcode = '40001',
      message = 'EXPORT_ARTIFACT_VERSION_CONFLICT';
  end if;
  if v_artifact.status <> 'purging' then
    raise exception using
      errcode = '23514',
      message = 'EXPORT_ARTIFACT_PURGE_NOT_CLAIMED';
  end if;
  if v_artifact.object_path is not null
     and exists (
       select 1
       from storage.objects object_row
       where object_row.bucket_id = v_artifact.bucket_id
         and object_row.name = v_artifact.object_path
     ) then
    raise exception using
      errcode = '23514',
      message = 'EXPORT_ARTIFACT_OBJECT_STILL_PRESENT';
  end if;

  v_rebuild_after_cleanup :=
    v_artifact.last_error_code = 'EXPORT_STALE_CLAIM_CLEANUP'
    and exists (
      select 1
      from public.data_subject_requests request_row
      where request_row.id = v_artifact.request_id
        and request_row.user_id = v_artifact.owner_user_id
        and request_row.status in ('ready', 'partial_failure')
    );

  delete from kc_private.data_export_media_refs media_row
  where media_row.artifact_id = v_artifact.id;

  if v_rebuild_after_cleanup then
    update kc_private.data_export_artifacts artifact_row
    set
      status = 'failed',
      row_version = artifact_row.row_version + 1,
      claim_token_hash = null,
      claimed_by = null,
      claimed_at = null,
      claim_expires_at = null,
      upload_authorized_at = null,
      download_token_hash = null,
      download_session_id = null,
      download_reserved_at = null,
      download_expires_at = null,
      sha256 = null,
      byte_size = null,
      manifest = '{}'::jsonb,
      ready_at = null,
      expires_at = null,
      delivered_at = null,
      failed_at = now(),
      last_error_code = 'EXPORT_STALE_CLAIM_REBUILD_REQUIRED',
      purge_reason = null,
      purge_erasure_request_id = null,
      purged_at = null,
      updated_at = now()
    where artifact_row.id = v_artifact.id
      and artifact_row.row_version = p_expected_version
      and artifact_row.status = 'purging'
      and artifact_row.last_error_code = 'EXPORT_STALE_CLAIM_CLEANUP'
    returning * into v_artifact;
    if not found then
      raise exception using
        errcode = '40001',
        message = 'EXPORT_ARTIFACT_PURGE_CLAIM_CONFLICT';
    end if;

    update public.help_requests help_row
    set metadata = coalesce(help_row.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'export_artifact_status', 'failed',
        'export_artifact_error', 'EXPORT_STALE_CLAIM_REBUILD_REQUIRED',
        'export_artifact_recovered_at', now()
      )
    from public.data_subject_requests request_row
    where request_row.id = v_artifact.request_id
      and help_row.id = request_row.help_request_id;

    return kc_private.kc_data_export_artifact_shape(v_artifact)
      || jsonb_build_object(
        'requires_rebuild', true,
        'storage_cleanup_completed', true
      );
  end if;

  delete from kc_private.data_export_processor_tasks task_row
  where task_row.artifact_id = v_artifact.id;

  update kc_private.data_export_artifacts artifact_row
  set
    status = 'purged',
    row_version = artifact_row.row_version + 1,
    owner_user_id = null,
    object_path = null,
    claim_token_hash = null,
    claimed_by = null,
    claimed_at = null,
    claim_expires_at = null,
    upload_authorized_at = null,
    download_token_hash = null,
    download_session_id = null,
    download_reserved_at = null,
    download_expires_at = null,
    sha256 = null,
    byte_size = null,
    manifest = '{}'::jsonb,
    last_error_code = null,
    purged_at = now(),
    updated_at = now()
  where artifact_row.id = v_artifact.id
    and artifact_row.row_version = p_expected_version
    and artifact_row.status = 'purging'
  returning * into v_artifact;
  if not found then
    raise exception using
      errcode = '40001',
      message = 'EXPORT_ARTIFACT_PURGE_CLAIM_CONFLICT';
  end if;

  return kc_private.kc_data_export_artifact_shape(v_artifact)
    || jsonb_build_object(
      'requires_rebuild', false,
      'storage_cleanup_completed', true
    );
end;
$$;

create table kc_private.data_export_retention_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  request_nonce uuid not null unique,
  request_signed_at timestamptz not null,
  source text not null,
  requested_limit integer not null,
  status text not null default 'running',
  claimed_count integer not null default 0,
  purged_count integer not null default 0,
  failed_count integer not null default 0,
  failure_codes jsonb not null default '[]'::jsonb,
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint data_export_retention_runs_source_check
    check (source ~ '^[a-z][a-z0-9_]{2,31}$'),
  constraint data_export_retention_runs_limit_check
    check (requested_limit between 1 and 100),
  constraint data_export_retention_runs_status_check
    check (status in ('running', 'succeeded', 'partial_failure', 'failed')),
  constraint data_export_retention_runs_counts_check
    check (
      claimed_count between 0 and 100
      and purged_count between 0 and 100
      and failed_count between 0 and 100
      and purged_count + failed_count <= claimed_count
    ),
  constraint data_export_retention_runs_failure_codes_check
    check (jsonb_typeof(failure_codes) = 'array'),
  constraint data_export_retention_runs_error_check
    check (
      error_code is null
      or error_code ~ '^[A-Z][A-Z0-9_]{2,63}$'
    ),
  constraint data_export_retention_runs_finish_check
    check (
      (status = 'running' and finished_at is null)
      or (status <> 'running' and finished_at is not null)
    )
);

create index data_export_retention_runs_started_idx
  on kc_private.data_export_retention_runs (started_at desc);
create index data_export_retention_runs_running_idx
  on kc_private.data_export_retention_runs (started_at)
  where status = 'running';
alter table kc_private.data_export_retention_runs enable row level security;
revoke all on table kc_private.data_export_retention_runs
  from public, anon, authenticated, service_role;

create table kc_private.data_export_retention_alerts (
  code text primary key,
  active boolean not null default true,
  occurrence_count bigint not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_run_id uuid references kc_private.data_export_retention_runs(id)
    on delete set null,
  resolved_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  constraint data_export_retention_alerts_code_check
    check (code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  constraint data_export_retention_alerts_count_check
    check (occurrence_count > 0),
  constraint data_export_retention_alerts_details_check
    check (jsonb_typeof(details) = 'object'),
  constraint data_export_retention_alerts_resolution_check
    check (
      (active and resolved_at is null)
      or (not active and resolved_at is not null)
    )
);

create index data_export_retention_alerts_active_idx
  on kc_private.data_export_retention_alerts (last_seen_at desc)
  where active;
alter table kc_private.data_export_retention_alerts enable row level security;
revoke all on table kc_private.data_export_retention_alerts
  from public, anon, authenticated, service_role;

create table kc_private.data_export_retention_schedule_state (
  singleton boolean primary key default true check (singleton),
  cron_available boolean not null default false,
  pg_net_available boolean not null default false,
  vault_available boolean not null default false,
  vault_acl_safe boolean not null default false,
  project_ref_configured boolean not null default false,
  endpoint_configured boolean not null default false,
  secret_configured boolean not null default false,
  scheduled boolean not null default false,
  purge_job_id bigint,
  monitor_job_id bigint,
  purge_schedule text not null default '*/15 * * * *',
  monitor_schedule text not null default '7 * * * *',
  configured_at timestamptz,
  checked_at timestamptz not null default now(),
  last_dispatch_at timestamptz,
  last_request_id bigint,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  consecutive_failures integer not null default 0,
  operational_alert text,
  constraint data_export_retention_schedule_failure_count_check
    check (consecutive_failures >= 0)
);

alter table kc_private.data_export_retention_schedule_state
  enable row level security;
revoke all on table kc_private.data_export_retention_schedule_state
  from public, anon, authenticated, service_role;
insert into kc_private.data_export_retention_schedule_state (singleton)
values (true);

create or replace function
  kc_private.kc_data_export_retention_vault_acl_safe()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if pg_catalog.to_regnamespace('vault') is null
     or pg_catalog.to_regclass('vault.decrypted_secrets') is null then
    return false;
  end if;

  return not exists (
    select 1
    from (
      values ('anon'::name), ('authenticated'::name)
    ) role_row(role_name)
    where pg_catalog.has_schema_privilege(
        role_row.role_name,
        'vault',
        'usage'
      )
      or pg_catalog.has_table_privilege(
        role_row.role_name,
        pg_catalog.to_regclass('vault.decrypted_secrets'),
        'select'
      )
      or pg_catalog.has_any_column_privilege(
        role_row.role_name,
        pg_catalog.to_regclass('vault.decrypted_secrets'),
        'select'
      )
  );
end;
$$;

create or replace function kc_private.kc_set_data_export_retention_alert(
  p_code text,
  p_active boolean,
  p_run_id uuid default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_was_active boolean;
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  v_audit_entity_id uuid;
begin
  if v_code !~ '^[A-Z][A-Z0-9_]{2,63}$'
     or p_active is null
     or jsonb_typeof(v_details) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'EXPORT_RETENTION_ALERT_INVALID';
  end if;
  v_audit_entity_id := pg_catalog.md5(
    'kc:data-export-retention-alert:' || v_code
  )::uuid;

  select alert_row.active
    into v_was_active
  from kc_private.data_export_retention_alerts alert_row
  where alert_row.code = v_code
  for update;

  if p_active then
    insert into kc_private.data_export_retention_alerts (
      code,
      active,
      occurrence_count,
      first_seen_at,
      last_seen_at,
      last_run_id,
      resolved_at,
      details
    ) values (
      v_code,
      true,
      1,
      now(),
      now(),
      p_run_id,
      null,
      v_details
    )
    on conflict (code) do update set
      active = true,
      occurrence_count =
        kc_private.data_export_retention_alerts.occurrence_count + 1,
      last_seen_at = now(),
      last_run_id = excluded.last_run_id,
      resolved_at = null,
      details = excluded.details;

    if not found or not coalesce(v_was_active, false) then
      perform kc_private.kc_insert_audit_log(
        'data_export_retention_alert_opened',
        'data_export_retention',
        v_audit_entity_id,
        jsonb_build_object(
          'code', v_code,
          'run_id', p_run_id
        ) || v_details,
        null
      );
    end if;
    return;
  end if;

  update kc_private.data_export_retention_alerts alert_row
  set
    active = false,
    last_seen_at = now(),
    last_run_id = coalesce(p_run_id, alert_row.last_run_id),
    resolved_at = now(),
    details = v_details
  where alert_row.code = v_code
    and alert_row.active;

  if found then
    perform kc_private.kc_insert_audit_log(
      'data_export_retention_alert_resolved',
      'data_export_retention',
      v_audit_entity_id,
      jsonb_build_object(
        'code', v_code,
        'run_id', p_run_id
      ) || v_details,
      null
    );
  end if;
end;
$$;

create or replace function kc_private.kc_begin_data_export_retention_run(
  p_source text default 'pg_cron',
  p_requested_limit integer default 50,
  p_request_nonce uuid default null,
  p_request_signed_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text := lower(trim(coalesce(p_source, 'pg_cron')));
  v_limit integer := coalesce(p_requested_limit, 50);
  v_run_id uuid;
  v_existing_status text;
  v_stale_count integer := 0;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if v_source !~ '^[a-z][a-z0-9_]{2,31}$'
     or v_limit < 1
     or v_limit > 100
     or p_request_nonce is null
     or p_request_signed_at is null
     or abs(extract(epoch from (now() - p_request_signed_at))) > 300 then
    raise exception using
      errcode = '22023',
      message = 'EXPORT_RETENTION_RUN_INVALID';
  end if;

  update kc_private.data_export_retention_runs run_row
  set
    status = 'failed',
    error_code = 'EXPORT_RETENTION_RUN_STALE',
    finished_at = now()
  where run_row.status = 'running'
    and run_row.started_at <= now() - interval '30 minutes';
  get diagnostics v_stale_count = row_count;

  if v_stale_count > 0 then
    perform kc_private.kc_set_data_export_retention_alert(
      'EXPORT_RETENTION_RUN_STALE',
      true,
      null,
      jsonb_build_object('stale_run_count', v_stale_count)
    );
  end if;

  insert into kc_private.data_export_retention_runs (
    request_nonce,
    request_signed_at,
    source,
    requested_limit
  ) values (
    p_request_nonce,
    p_request_signed_at,
    v_source,
    v_limit
  )
  on conflict (request_nonce) do nothing
  returning id into v_run_id;

  if v_run_id is null then
    select run_row.id, run_row.status
      into v_run_id, v_existing_status
    from kc_private.data_export_retention_runs run_row
    where run_row.request_nonce = p_request_nonce;
    return jsonb_build_object(
      'ok', true,
      'run_id', v_run_id,
      'status', v_existing_status,
      'reused_existing', true
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'run_id', v_run_id,
    'started_at', now(),
    'reused_existing', false
  );
end;
$$;

create or replace function public.kc_begin_data_export_retention_run(
  p_source text default 'pg_cron',
  p_requested_limit integer default 50,
  p_request_nonce uuid default null,
  p_request_signed_at timestamptz default null
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_begin_data_export_retention_run($1, $2, $3, $4);
$$;

create or replace function kc_private.kc_finish_data_export_retention_run(
  p_run_id uuid,
  p_status text,
  p_claimed_count integer,
  p_purged_count integer,
  p_failed_count integer,
  p_failure_codes jsonb default '[]'::jsonb,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_failure_codes jsonb := coalesce(p_failure_codes, '[]'::jsonb);
  v_error_code text := nullif(upper(trim(coalesce(p_error_code, ''))), '');
  v_has_backlog boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_run_id is null
     or v_status not in ('succeeded', 'partial_failure', 'failed')
     or coalesce(p_claimed_count, -1) not between 0 and 100
     or coalesce(p_purged_count, -1) not between 0 and 100
     or coalesce(p_failed_count, -1) not between 0 and 100
     or p_purged_count + p_failed_count > p_claimed_count
     or jsonb_typeof(v_failure_codes) <> 'array'
     or jsonb_array_length(v_failure_codes) > 100
     or (
       v_error_code is not null
       and v_error_code !~ '^[A-Z][A-Z0-9_]{2,63}$'
     ) then
    raise exception using
      errcode = '22023',
      message = 'EXPORT_RETENTION_RUN_RESULT_INVALID';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(v_failure_codes) code_row(value)
    where code_row.value !~ '^[A-Z][A-Z0-9_]{2,63}$'
  ) then
    raise exception using
      errcode = '22023',
      message = 'EXPORT_RETENTION_RUN_RESULT_INVALID';
  end if;

  update kc_private.data_export_retention_runs run_row
  set
    status = v_status,
    claimed_count = p_claimed_count,
    purged_count = p_purged_count,
    failed_count = p_failed_count,
    failure_codes = v_failure_codes,
    error_code = v_error_code,
    finished_at = now()
  where run_row.id = p_run_id
    and run_row.status = 'running';
  if not found then
    raise exception using
      errcode = '40001',
      message = 'EXPORT_RETENTION_RUN_CAS_CONFLICT';
  end if;

  if v_status = 'succeeded' and p_failed_count = 0 then
    update kc_private.data_export_retention_schedule_state state_row
    set
      last_success_at = now(),
      consecutive_failures = 0,
      operational_alert = null,
      checked_at = now()
    where state_row.singleton;
  else
    update kc_private.data_export_retention_schedule_state state_row
    set
      last_failure_at = now(),
      consecutive_failures = state_row.consecutive_failures + 1,
      operational_alert = coalesce(
        v_error_code,
        'EXPORT_RETENTION_PURGE_PARTIAL_FAILURE'
      ),
      checked_at = now()
    where state_row.singleton;
  end if;

  select exists (
    select 1
    from kc_private.data_export_artifacts artifact_row
    where (
      artifact_row.status = 'claimed'
      and artifact_row.claim_expires_at <= now()
    ) or (
      artifact_row.status = 'purging'
      and artifact_row.purge_reason = 'retention'
    )
  )
  into v_has_backlog;

  if v_status <> 'succeeded' or p_failed_count > 0 then
    perform kc_private.kc_set_data_export_retention_alert(
      'EXPORT_RETENTION_PURGE_FAILURE',
      true,
      p_run_id,
      jsonb_build_object(
        'status', v_status,
        'claimed_count', p_claimed_count,
        'purged_count', p_purged_count,
        'failed_count', p_failed_count,
        'failure_codes', v_failure_codes,
        'error_code', v_error_code
      )
    );
  elsif not v_has_backlog then
    perform kc_private.kc_set_data_export_retention_alert(
      'EXPORT_RETENTION_PURGE_FAILURE',
      false,
      p_run_id,
      jsonb_build_object('recovered', true)
    );
    perform kc_private.kc_set_data_export_retention_alert(
      'EXPORT_RETENTION_RUN_STALE',
      false,
      p_run_id,
      jsonb_build_object('recovered', true)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'run_id', p_run_id,
    'status', v_status,
    'alert_active', v_status <> 'succeeded' or p_failed_count > 0,
    'backlog_present', v_has_backlog
  );
end;
$$;

create or replace function public.kc_finish_data_export_retention_run(
  p_run_id uuid,
  p_status text,
  p_claimed_count integer,
  p_purged_count integer,
  p_failed_count integer,
  p_failure_codes jsonb default '[]'::jsonb,
  p_error_code text default null
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_finish_data_export_retention_run(
    $1, $2, $3, $4, $5, $6, $7
  );
$$;

create or replace function kc_private.kc_monitor_data_export_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state kc_private.data_export_retention_schedule_state%rowtype;
  v_stale_run_count integer := 0;
  v_stale_backlog_count integer := 0;
  v_health_stale boolean := false;
begin
  select state_row.*
    into v_state
  from kc_private.data_export_retention_schedule_state state_row
  where state_row.singleton
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'EXPORT_RETENTION_SCHEDULE_STATE_MISSING';
  end if;

  update kc_private.data_export_retention_runs run_row
  set
    status = 'failed',
    error_code = 'EXPORT_RETENTION_RUN_STALE',
    finished_at = now()
  where run_row.status = 'running'
    and run_row.started_at <= now() - interval '30 minutes';
  get diagnostics v_stale_run_count = row_count;

  select count(*)::integer
    into v_stale_backlog_count
  from kc_private.data_export_artifacts artifact_row
  where (
    artifact_row.status = 'claimed'
    and artifact_row.claim_expires_at <= now() - interval '30 minutes'
  ) or (
    artifact_row.status = 'purging'
    and artifact_row.purge_reason = 'retention'
    and artifact_row.updated_at <= now() - interval '30 minutes'
  );

  v_health_stale :=
    not (
      v_state.cron_available
      and v_state.pg_net_available
      and v_state.vault_available
      and v_state.vault_acl_safe
      and v_state.project_ref_configured
      and v_state.endpoint_configured
      and v_state.secret_configured
      and v_state.scheduled
    )
    or (
      v_state.configured_at is not null
      and v_state.configured_at <= now() - interval '1 hour'
      and (
        v_state.last_success_at is null
        or v_state.last_success_at <= now() - interval '2 hours'
      )
    );

  perform kc_private.kc_set_data_export_retention_alert(
    'EXPORT_RETENTION_SCHEDULE_UNHEALTHY',
    v_health_stale,
    null,
    jsonb_build_object(
      'configured', v_state.endpoint_configured
        and v_state.secret_configured
        and v_state.project_ref_configured,
      'vault_acl_safe', v_state.vault_acl_safe,
      'scheduled', v_state.scheduled,
      'last_success_stale', v_state.last_success_at is null
        or v_state.last_success_at <= now() - interval '2 hours'
    )
  );
  perform kc_private.kc_set_data_export_retention_alert(
    'EXPORT_RETENTION_RUN_STALE',
    v_stale_run_count > 0,
    null,
    jsonb_build_object('stale_run_count', v_stale_run_count)
  );
  perform kc_private.kc_set_data_export_retention_alert(
    'EXPORT_RETENTION_BACKLOG_STALE',
    v_stale_backlog_count > 0,
    null,
    jsonb_build_object('stale_backlog_count', v_stale_backlog_count)
  );

  update kc_private.data_export_retention_schedule_state state_row
  set
    checked_at = now(),
    operational_alert = case
      when v_health_stale then 'EXPORT_RETENTION_SCHEDULE_UNHEALTHY'
      when v_stale_run_count > 0 then 'EXPORT_RETENTION_RUN_STALE'
      when v_stale_backlog_count > 0 then 'EXPORT_RETENTION_BACKLOG_STALE'
      else state_row.operational_alert
    end
  where state_row.singleton;

  return jsonb_build_object(
    'ok', not v_health_stale
      and v_stale_run_count = 0
      and v_stale_backlog_count = 0,
    'health_stale', v_health_stale,
    'stale_run_count', v_stale_run_count,
    'stale_backlog_count', v_stale_backlog_count
  );
end;
$$;

-- Reads the endpoint, exact project-ref and dedicated authentication secret
-- only at execution time from Supabase Vault. No value is copied to an
-- application table.
create or replace function kc_private.kc_trigger_data_export_retention(
  p_limit integer default 50,
  p_source text default 'pg_cron'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := coalesce(p_limit, 50);
  v_source text := lower(trim(coalesce(p_source, 'pg_cron')));
  v_function_url text;
  v_retention_secret text;
  v_project_ref text;
  v_request_id bigint;
  v_body jsonb;
  v_body_hash text;
  v_timestamp text;
  v_nonce uuid;
  v_signed_path constant text :=
    '/functions/v1/kc-data-export-retention';
  v_canonical_request text;
  v_signature text;
begin
  if v_limit < 1
     or v_limit > 100
     or v_source !~ '^[a-z][a-z0-9_]{2,31}$' then
    raise exception using
      errcode = '22023',
      message = 'EXPORT_RETENTION_TRIGGER_INVALID';
  end if;
  if to_regclass('vault.decrypted_secrets') is null
     or to_regprocedure(
       'net.http_post(text,jsonb,jsonb,jsonb,integer)'
     ) is null then
    update kc_private.data_export_retention_schedule_state state_row
    set
      last_failure_at = now(),
      consecutive_failures = state_row.consecutive_failures + 1,
      operational_alert = 'EXPORT_RETENTION_TRANSPORT_UNAVAILABLE',
      checked_at = now()
    where state_row.singleton;
    perform kc_private.kc_set_data_export_retention_alert(
      'EXPORT_RETENTION_SCHEDULE_UNHEALTHY',
      true,
      null,
      jsonb_build_object('transport_available', false)
    );
    return null;
  end if;
  if not kc_private.kc_data_export_retention_vault_acl_safe() then
    update kc_private.data_export_retention_schedule_state state_row
    set
      last_failure_at = now(),
      consecutive_failures = state_row.consecutive_failures + 1,
      operational_alert = 'EXPORT_RETENTION_VAULT_ACL_UNSAFE',
      checked_at = now()
    where state_row.singleton;
    perform kc_private.kc_set_data_export_retention_alert(
      'EXPORT_RETENTION_SCHEDULE_UNHEALTHY',
      true,
      null,
      jsonb_build_object('vault_acl_safe', false)
    );
    return null;
  end if;

  execute $vault$
    select
      max(secret_row.decrypted_secret) filter (
        where secret_row.name =
          'kc_data_export_retention_function_url'
      ),
      max(secret_row.decrypted_secret) filter (
        where secret_row.name =
          'kc_data_export_retention_secret'
      ),
      max(secret_row.decrypted_secret) filter (
        where secret_row.name =
          'kc_data_export_retention_project_ref'
      )
    from vault.decrypted_secrets secret_row
    where secret_row.name in (
      'kc_data_export_retention_function_url',
      'kc_data_export_retention_secret',
      'kc_data_export_retention_project_ref'
    )
  $vault$
  into v_function_url, v_retention_secret, v_project_ref;

  if v_project_ref is null
     or v_project_ref !~ '^[a-z0-9]{20}$'
     or v_function_url is distinct from (
       'https://'
       || v_project_ref
       || '.supabase.co/functions/v1/kc-data-export-retention'
     )
     or v_retention_secret is null
     or char_length(v_retention_secret) < 32
     or char_length(v_retention_secret) > 256 then
    update kc_private.data_export_retention_schedule_state state_row
    set
      last_failure_at = now(),
      consecutive_failures = state_row.consecutive_failures + 1,
      operational_alert = 'EXPORT_RETENTION_VAULT_CONFIGURATION_INVALID',
      checked_at = now()
    where state_row.singleton;
    perform kc_private.kc_set_data_export_retention_alert(
      'EXPORT_RETENTION_SCHEDULE_UNHEALTHY',
      true,
      null,
      jsonb_build_object('vault_configuration_valid', false)
    );
    return null;
  end if;

  v_body := jsonb_build_object(
    'action', 'purge_expired',
    'limit', v_limit,
    'source', v_source
  );
  v_timestamp :=
    floor(extract(epoch from clock_timestamp()))::bigint::text;
  v_nonce := extensions.gen_random_uuid();
  v_body_hash := encode(
    extensions.digest(v_body::text, 'sha256'),
    'hex'
  );
  v_canonical_request :=
    'POST' || chr(10)
    || v_signed_path || chr(10)
    || v_timestamp || chr(10)
    || v_nonce::text || chr(10)
    || v_body_hash;
  v_signature := encode(
    extensions.hmac(
      v_canonical_request,
      v_retention_secret,
      'sha256'
    ),
    'hex'
  );

  begin
    execute $net$
      select net.http_post(
        url := $1,
        body := $2,
        headers := $3,
        timeout_milliseconds := 10000
      )
    $net$
    into v_request_id
    using
      v_function_url,
      v_body,
      jsonb_build_object(
        'Content-Type', 'application/json',
        'x-kc-signature-version', 'v1',
        'x-kc-signed-path', v_signed_path,
        'x-kc-timestamp', v_timestamp,
        'x-kc-nonce', v_nonce::text,
        'x-kc-signature', v_signature
      );

    update kc_private.data_export_retention_schedule_state state_row
    set
      last_dispatch_at = now(),
      last_request_id = v_request_id,
      checked_at = now()
    where state_row.singleton;
    return v_request_id;
  exception
    when others then
      update kc_private.data_export_retention_schedule_state state_row
      set
        last_failure_at = now(),
        consecutive_failures = state_row.consecutive_failures + 1,
        operational_alert =
          'EXPORT_RETENTION_DISPATCH_FAILED:' || sqlstate,
        checked_at = now()
      where state_row.singleton;
      perform kc_private.kc_set_data_export_retention_alert(
        'EXPORT_RETENTION_SCHEDULE_UNHEALTHY',
        true,
        null,
        jsonb_build_object(
          'dispatch_failed', true,
          'sqlstate', sqlstate
        )
      );
      return null;
  end;
end;
$$;

-- Idempotently schedules both the worker and an in-database watchdog. The
-- function intentionally leaves a durable alert when extensions or Vault
-- values are absent, so deployment cannot report a false green state.
create or replace function kc_private.kc_configure_data_export_retention_schedule()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cron_job_relation pg_catalog.regclass :=
    pg_catalog.to_regclass('cron.job');
  v_cron_schedule_proc pg_catalog.regprocedure :=
    pg_catalog.to_regprocedure('cron.schedule(text,text,text)');
  v_cron_unschedule_proc pg_catalog.regprocedure :=
    pg_catalog.to_regprocedure('cron.unschedule(text)');
  v_cron_available boolean :=
    v_cron_job_relation is not null
    and v_cron_schedule_proc is not null
    and v_cron_unschedule_proc is not null;
  v_cron_schedule_call text;
  v_cron_unschedule_call text;
  v_pg_net_available boolean :=
    to_regprocedure(
      'net.http_post(text,jsonb,jsonb,jsonb,integer)'
    ) is not null;
  v_vault_available boolean :=
    to_regclass('vault.decrypted_secrets') is not null;
  v_vault_acl_safe boolean :=
    kc_private.kc_data_export_retention_vault_acl_safe();
  v_function_url text;
  v_retention_secret text;
  v_project_ref text;
  v_project_ref_configured boolean := false;
  v_endpoint_configured boolean := false;
  v_secret_configured boolean := false;
  v_purge_job_id bigint;
  v_monitor_job_id bigint;
  v_existing boolean;
  v_alert text;
  v_schedule_error text;
begin
  if v_cron_available then
    select
      pg_catalog.format(
        '%I.%I',
        schedule_namespace.nspname,
        schedule_proc.proname
      ),
      pg_catalog.format(
        '%I.%I',
        unschedule_namespace.nspname,
        unschedule_proc.proname
      )
      into v_cron_schedule_call, v_cron_unschedule_call
    from pg_catalog.pg_proc schedule_proc
    join pg_catalog.pg_namespace schedule_namespace
      on schedule_namespace.oid = schedule_proc.pronamespace
    cross join pg_catalog.pg_proc unschedule_proc
    join pg_catalog.pg_namespace unschedule_namespace
      on unschedule_namespace.oid = unschedule_proc.pronamespace
    where schedule_proc.oid = v_cron_schedule_proc
      and unschedule_proc.oid = v_cron_unschedule_proc;

    v_cron_available :=
      v_cron_schedule_call is not null
      and v_cron_unschedule_call is not null;
  end if;

  if v_vault_available then
    execute $vault$
      select
        max(secret_row.decrypted_secret) filter (
          where secret_row.name =
            'kc_data_export_retention_function_url'
        ),
        max(secret_row.decrypted_secret) filter (
          where secret_row.name =
            'kc_data_export_retention_secret'
        ),
        max(secret_row.decrypted_secret) filter (
          where secret_row.name =
            'kc_data_export_retention_project_ref'
        )
      from vault.decrypted_secrets secret_row
      where secret_row.name in (
        'kc_data_export_retention_function_url',
        'kc_data_export_retention_secret',
        'kc_data_export_retention_project_ref'
      )
    $vault$
    into v_function_url, v_retention_secret, v_project_ref;
  end if;

  v_project_ref_configured := coalesce(
    v_project_ref ~ '^[a-z0-9]{20}$',
    false
  );
  v_endpoint_configured :=
    v_project_ref_configured
    and v_function_url is not distinct from (
      'https://'
      || v_project_ref
      || '.supabase.co/functions/v1/kc-data-export-retention'
    );
  v_secret_configured :=
    v_retention_secret is not null
    and char_length(v_retention_secret) between 32 and 256;

  if v_cron_available then
    begin
      foreach v_alert in array array[
        'kc-data-export-retention-purge',
        'kc-data-export-retention-monitor'
      ]
      loop
        execute pg_catalog.format(
          'select exists (select 1 from %s where jobname = $1)',
          v_cron_job_relation
        )
          into v_existing
          using v_alert;
        if v_existing then
          execute pg_catalog.format(
            'select %s($1)',
            v_cron_unschedule_call
          )
            using v_alert;
        end if;
      end loop;

      execute pg_catalog.format(
        'select %s($1, $2, $3)',
        v_cron_schedule_call
      )
        into v_monitor_job_id
        using
          'kc-data-export-retention-monitor',
          '7 * * * *',
          'select kc_private.kc_monitor_data_export_retention();';
    exception
      when others then
        v_schedule_error :=
          'EXPORT_RETENTION_MONITOR_SCHEDULE_FAILED:' || sqlstate;
        v_monitor_job_id := null;
    end;
  end if;

  if v_schedule_error is not null then
    v_alert := v_schedule_error;
  elsif not v_cron_available then
    v_alert := 'PG_CRON_UNAVAILABLE_EXPORT_RETENTION_NOT_SCHEDULED';
  elsif not v_pg_net_available then
    v_alert := 'PG_NET_UNAVAILABLE_EXPORT_RETENTION_NOT_SCHEDULED';
  elsif not v_vault_available then
    v_alert := 'VAULT_UNAVAILABLE_EXPORT_RETENTION_NOT_SCHEDULED';
  elsif not v_vault_acl_safe then
    v_alert := 'EXPORT_RETENTION_VAULT_ACL_UNSAFE';
  elsif not v_project_ref_configured then
    v_alert := 'EXPORT_RETENTION_PROJECT_REF_NOT_CONFIGURED';
  elsif not v_endpoint_configured then
    v_alert := 'EXPORT_RETENTION_ENDPOINT_NOT_CONFIGURED';
  elsif not v_secret_configured then
    v_alert := 'EXPORT_RETENTION_SECRET_NOT_CONFIGURED';
  else
    begin
      execute pg_catalog.format(
        'select %s($1, $2, $3)',
        v_cron_schedule_call
      )
        into v_purge_job_id
        using
          'kc-data-export-retention-purge',
          '*/15 * * * *',
          'select kc_private.kc_trigger_data_export_retention(50, ''pg_cron'');';
      v_alert := null;
    exception
      when others then
        v_alert := 'EXPORT_RETENTION_CRON_SCHEDULE_FAILED:' || sqlstate;
    end;
  end if;

  insert into kc_private.data_export_retention_schedule_state (
    singleton,
    cron_available,
    pg_net_available,
    vault_available,
    vault_acl_safe,
    project_ref_configured,
    endpoint_configured,
    secret_configured,
    scheduled,
    purge_job_id,
    monitor_job_id,
    configured_at,
    checked_at,
    operational_alert
  ) values (
    true,
    v_cron_available,
    v_pg_net_available,
    v_vault_available,
    v_vault_acl_safe,
    v_project_ref_configured,
    v_endpoint_configured,
    v_secret_configured,
    v_purge_job_id is not null and v_monitor_job_id is not null,
    v_purge_job_id,
    v_monitor_job_id,
    case
      when v_purge_job_id is not null and v_monitor_job_id is not null
        then now()
      else null
    end,
    now(),
    v_alert
  )
  on conflict (singleton) do update set
    cron_available = excluded.cron_available,
    pg_net_available = excluded.pg_net_available,
    vault_available = excluded.vault_available,
    vault_acl_safe = excluded.vault_acl_safe,
    project_ref_configured = excluded.project_ref_configured,
    endpoint_configured = excluded.endpoint_configured,
    secret_configured = excluded.secret_configured,
    scheduled = excluded.scheduled,
    purge_job_id = excluded.purge_job_id,
    monitor_job_id = excluded.monitor_job_id,
    configured_at = excluded.configured_at,
    checked_at = excluded.checked_at,
    operational_alert = excluded.operational_alert;

  perform kc_private.kc_set_data_export_retention_alert(
    'EXPORT_RETENTION_SCHEDULE_UNHEALTHY',
    v_alert is not null,
    null,
    jsonb_build_object(
      'cron_available', v_cron_available,
      'pg_net_available', v_pg_net_available,
      'vault_available', v_vault_available,
      'vault_acl_safe', v_vault_acl_safe,
      'project_ref_configured', v_project_ref_configured,
      'endpoint_configured', v_endpoint_configured,
      'secret_configured', v_secret_configured,
      'scheduled', v_purge_job_id is not null
        and v_monitor_job_id is not null,
      'error_code', v_alert
    )
  );

  if v_alert is not null then
    raise warning '%', v_alert;
  end if;

  return jsonb_build_object(
    'ok', v_alert is null,
    'cron_available', v_cron_available,
    'pg_net_available', v_pg_net_available,
    'vault_available', v_vault_available,
    'vault_acl_safe', v_vault_acl_safe,
    'project_ref_configured', v_project_ref_configured,
    'endpoint_configured', v_endpoint_configured,
    'secret_configured', v_secret_configured,
    'scheduled', v_purge_job_id is not null
      and v_monitor_job_id is not null,
    'operational_alert', v_alert
  );
end;
$$;

create or replace function
  kc_private.kc_data_export_retention_configuration_status(
    p_expected_project_ref text
  )
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_state kc_private.data_export_retention_schedule_state%rowtype;
  v_cron_job_relation pg_catalog.regclass :=
    pg_catalog.to_regclass('cron.job');
  v_function_url text;
  v_retention_secret text;
  v_project_ref text;
  v_expected_project_ref text :=
    nullif(lower(trim(coalesce(p_expected_project_ref, ''))), '');
  v_purge_job_configured boolean := false;
  v_monitor_job_configured boolean := false;
  v_vault_acl_safe boolean := false;
  v_project_ref_configured boolean := false;
  v_expected_project_ref_valid boolean := false;
  v_project_ref_matches_expected boolean := false;
  v_endpoint_configured boolean := false;
  v_secret_configured boolean := false;
begin
  select state_row.*
    into v_state
  from kc_private.data_export_retention_schedule_state state_row
  where state_row.singleton;
  if not found then
    return jsonb_build_object('ok', false, 'state_present', false);
  end if;

  if to_regclass('vault.decrypted_secrets') is not null then
    execute $vault$
      select
        max(secret_row.decrypted_secret) filter (
          where secret_row.name =
            'kc_data_export_retention_function_url'
        ),
        max(secret_row.decrypted_secret) filter (
          where secret_row.name =
            'kc_data_export_retention_secret'
        ),
        max(secret_row.decrypted_secret) filter (
          where secret_row.name =
            'kc_data_export_retention_project_ref'
        )
      from vault.decrypted_secrets secret_row
      where secret_row.name in (
        'kc_data_export_retention_function_url',
        'kc_data_export_retention_secret',
        'kc_data_export_retention_project_ref'
      )
    $vault$
    into v_function_url, v_retention_secret, v_project_ref;
  end if;

  v_vault_acl_safe :=
    kc_private.kc_data_export_retention_vault_acl_safe();
  v_project_ref_configured := coalesce(
    v_project_ref ~ '^[a-z0-9]{20}$',
    false
  );
  v_expected_project_ref_valid :=
    v_expected_project_ref is null
    or v_expected_project_ref ~ '^[a-z0-9]{20}$';
  v_project_ref_matches_expected :=
    v_expected_project_ref is null
    or (
      v_expected_project_ref_valid
      and v_project_ref is not distinct from v_expected_project_ref
    );
  v_endpoint_configured :=
    v_project_ref_configured
    and v_function_url is not distinct from (
      'https://'
      || v_project_ref
      || '.supabase.co/functions/v1/kc-data-export-retention'
    );
  v_secret_configured :=
    v_retention_secret is not null
    and char_length(v_retention_secret) between 32 and 256;

  if v_cron_job_relation is not null then
    execute pg_catalog.format($cron$
      select
        count(*) filter (
          where job_row.jobid = $1
            and job_row.jobname = 'kc-data-export-retention-purge'
            and job_row.schedule = '*/15 * * * *'
            and job_row.command =
              'select kc_private.kc_trigger_data_export_retention(50, ''pg_cron'');'
            and job_row.active
        ) = 1,
        count(*) filter (
          where job_row.jobid = $2
            and job_row.jobname = 'kc-data-export-retention-monitor'
            and job_row.schedule = '7 * * * *'
            and job_row.command =
              'select kc_private.kc_monitor_data_export_retention();'
            and job_row.active
        ) = 1
      from %s job_row
      where job_row.jobid in ($1, $2)
    $cron$, v_cron_job_relation)
    into v_purge_job_configured, v_monitor_job_configured
    using v_state.purge_job_id, v_state.monitor_job_id;
  end if;

  return jsonb_build_object(
    'ok',
      v_state.cron_available
      and v_state.pg_net_available
      and v_state.vault_available
      and v_state.vault_acl_safe
      and v_state.project_ref_configured
      and v_state.endpoint_configured
      and v_state.secret_configured
      and v_state.scheduled
      and v_state.operational_alert is null
      and v_vault_acl_safe
      and v_project_ref_configured
      and v_expected_project_ref_valid
      and v_project_ref_matches_expected
      and v_endpoint_configured
      and v_secret_configured
      and v_purge_job_configured
      and v_monitor_job_configured,
    'state_present', true,
    'cron_available', v_state.cron_available,
    'pg_net_available', v_state.pg_net_available,
    'vault_available', v_state.vault_available,
    'vault_acl_safe',
      v_state.vault_acl_safe and v_vault_acl_safe,
    'project_ref_configured',
      v_state.project_ref_configured and v_project_ref_configured,
    'expected_project_ref_valid', v_expected_project_ref_valid,
    'project_ref_matches_expected', v_project_ref_matches_expected,
    'endpoint_configured',
      v_state.endpoint_configured and v_endpoint_configured,
    'secret_configured',
      v_state.secret_configured and v_secret_configured,
    'purge_job_configured', v_purge_job_configured,
    'monitor_job_configured', v_monitor_job_configured,
    'operational_alert_present', v_state.operational_alert is not null
  );
end;
$$;

create or replace function
  kc_private.kc_data_export_retention_configuration_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select kc_private.kc_data_export_retention_configuration_status(null::text);
$$;

revoke all on function
  kc_private.kc_data_export_retention_vault_acl_safe()
  from public, anon, authenticated, service_role;
revoke all on function
  kc_private.kc_set_data_export_retention_alert(text, boolean, uuid, jsonb)
  from public, anon, authenticated, service_role;

revoke all on function
  kc_private.kc_begin_data_export_retention_run(
    text, integer, uuid, timestamptz
  )
  from public, anon, authenticated, service_role;
grant execute on function
  kc_private.kc_begin_data_export_retention_run(
    text, integer, uuid, timestamptz
  )
  to service_role;
revoke all on function
  public.kc_begin_data_export_retention_run(
    text, integer, uuid, timestamptz
  )
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_begin_data_export_retention_run(
    text, integer, uuid, timestamptz
  )
  to service_role;

revoke all on function
  kc_private.kc_finish_data_export_retention_run(
    uuid, text, integer, integer, integer, jsonb, text
  )
  from public, anon, authenticated, service_role;
grant execute on function
  kc_private.kc_finish_data_export_retention_run(
    uuid, text, integer, integer, integer, jsonb, text
  )
  to service_role;
revoke all on function
  public.kc_finish_data_export_retention_run(
    uuid, text, integer, integer, integer, jsonb, text
  )
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_finish_data_export_retention_run(
    uuid, text, integer, integer, integer, jsonb, text
  )
  to service_role;

revoke all on function kc_private.kc_monitor_data_export_retention()
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_monitor_data_export_retention()
  to service_role;
revoke all on function
  kc_private.kc_trigger_data_export_retention(integer, text)
  from public, anon, authenticated, service_role;
grant execute on function
  kc_private.kc_trigger_data_export_retention(integer, text)
  to service_role;
revoke all on function
  kc_private.kc_configure_data_export_retention_schedule()
  from public, anon, authenticated, service_role;
grant execute on function
  kc_private.kc_configure_data_export_retention_schedule()
  to service_role;
revoke all on function
  kc_private.kc_data_export_retention_configuration_status()
  from public, anon, authenticated, service_role;
grant execute on function
  kc_private.kc_data_export_retention_configuration_status()
  to service_role;
revoke all on function
  kc_private.kc_data_export_retention_configuration_status(text)
  from public, anon, authenticated, service_role;
grant execute on function
  kc_private.kc_data_export_retention_configuration_status(text)
  to service_role;

-- Reassert the existing artifact RPC ACL after replacing its implementation.
revoke all on function
  kc_private.kc_claim_expired_data_export_artifacts(integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  kc_private.kc_claim_expired_data_export_artifacts(integer, uuid)
  to service_role;
revoke all on function
  public.kc_claim_expired_data_export_artifacts(integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_claim_expired_data_export_artifacts(integer, uuid)
  to service_role;
revoke all on function
  kc_private.kc_purge_data_export_artifact(text, bigint, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  kc_private.kc_purge_data_export_artifact(text, bigint, uuid)
  to service_role;
revoke all on function
  public.kc_purge_data_export_artifact(text, bigint, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_purge_data_export_artifact(text, bigint, uuid)
  to service_role;

comment on table kc_private.data_export_retention_runs is
  'PII-free execution log for the automatic Storage-first export retention worker.';
comment on table kc_private.data_export_retention_alerts is
  'Durable operational alerts for retention failures; details contain codes and counts only.';
comment on table kc_private.data_export_retention_schedule_state is
  'Fail-closed proof of pg_cron, pg_net, browser Vault ACL, exact project-ref and Vault configuration without persisting decrypted secrets.';
comment on function
  kc_private.kc_data_export_retention_vault_acl_safe() is
  'Proves browser roles cannot read decrypted Vault values.';
comment on function
  kc_private.kc_configure_data_export_retention_schedule() is
  'Idempotently configures the purge and watchdog jobs through cron.schedule; reads but never returns Vault values.';

select kc_private.kc_configure_data_export_retention_schedule();

commit;

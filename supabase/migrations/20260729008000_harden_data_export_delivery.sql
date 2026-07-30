-- Harden assisted export delivery without removing any rollout-compatible RPC.
--
-- This expand-only migration:
--   * binds every owner delivery mutation to a non-expired auth session;
--   * permits safe re-downloads while the private artifact is retained;
--   * caps media rehydration at a batch-signable size;
--   * distinguishes an attested out-of-band processor delivery from content
--     actually embedded in the JSON export;
--   * restores the actor-only retention wrappers used by the previous worker
--     when exactly one active administrator session can be proven.

begin;

alter table kc_private.data_export_artifacts
  add column if not exists download_return_status text,
  add column if not exists delivery_count integer not null default 0;

comment on column kc_private.data_export_artifacts.download_return_status is
  'Terminal state restored if a short download reservation expires. Only ready or delivered while status=download_reserved.';
comment on column kc_private.data_export_artifacts.delivery_count is
  'Number of successfully consumed owner delivery reservations. Retries that lose the row-version CAS are not counted.';

update kc_private.data_export_artifacts artifact_row
set download_return_status = case
  when artifact_row.delivered_at is not null then 'delivered'
  else 'ready'
end
where artifact_row.status = 'download_reserved'
  and artifact_row.download_return_status is null;

update kc_private.data_export_artifacts artifact_row
set delivery_count = 1
where artifact_row.delivery_count = 0
  and artifact_row.delivered_at is not null;

alter table kc_private.data_export_artifacts
  drop constraint if exists data_export_artifacts_download_return_check;
alter table kc_private.data_export_artifacts
  add constraint data_export_artifacts_download_return_check
  check (
    (
      status = 'download_reserved'
      and download_return_status in ('ready', 'delivered')
    )
    or (
      status <> 'download_reserved'
      and download_return_status is null
    )
  );

alter table kc_private.data_export_artifacts
  drop constraint if exists data_export_artifacts_delivery_count_check;
alter table kc_private.data_export_artifacts
  add constraint data_export_artifacts_delivery_count_check
  check (delivery_count >= 0);

create or replace function kc_private.kc_normalize_data_export_download_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.status = 'purged'
     and new.status = 'queued' then
    new.delivery_count := 0;
  end if;
  if new.status = 'download_reserved' then
    if new.download_return_status is null then
      if tg_op = 'UPDATE' and old.status in ('ready', 'delivered') then
        new.download_return_status := old.status;
      elsif new.delivered_at is not null then
        new.download_return_status := 'delivered';
      else
        new.download_return_status := 'ready';
      end if;
    end if;
  else
    new.download_return_status := null;
  end if;
  return new;
end;
$$;

drop trigger if exists data_export_artifact_download_state_normalization
  on kc_private.data_export_artifacts;
create trigger data_export_artifact_download_state_normalization
before insert or update on kc_private.data_export_artifacts
for each row
execute function kc_private.kc_normalize_data_export_download_state();

revoke all on function
  kc_private.kc_normalize_data_export_download_state()
  from public, anon, authenticated, service_role;

alter table kc_private.data_export_processor_tasks
  add column if not exists delivery_attested boolean not null default false,
  add column if not exists delivery_channel text,
  add column if not exists delivered_out_of_band_at timestamptz;

comment on column kc_private.data_export_processor_tasks.delivery_attested is
  'True only after an administrator explicitly attests that the processor data was delivered outside the Kino JSON export.';
comment on column kc_private.data_export_processor_tasks.delivery_channel is
  'Sanitized delivery channel enum; never a destination, address, URL, filename, credential, or processor payload.';
comment on column kc_private.data_export_processor_tasks.delivered_out_of_band_at is
  'Administrator-attested time of external delivery. Does not imply that processor content is present in the JSON artifact.';

alter table kc_private.data_export_processor_tasks
  drop constraint if exists data_export_processor_tasks_evidence_check;

-- Legacy "supplied" evidence did not prove that a separate delivery happened.
-- Fail closed: invalidate any still-retained artifact and require a new,
-- explicitly attested export workflow instead of exposing a misleading bundle.
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
  failed_at = pg_catalog.clock_timestamp(),
  last_error_code = 'EXPORT_PROCESSOR_REATTESTATION_REQUIRED',
  updated_at = pg_catalog.clock_timestamp()
where artifact_row.status not in ('purging', 'purged')
  and exists (
    select 1
    from kc_private.data_export_processor_tasks task_row
    where task_row.artifact_id = artifact_row.id
      and task_row.status = 'sanitized_disclosure'
      and task_row.delivery_attested is false
  );

update kc_private.data_export_processor_tasks task_row
set
  status = 'manual_follow_up',
  evidence_hash = null,
  resolved_by = null,
  resolved_at = null,
  delivery_attested = false,
  delivery_channel = null,
  delivered_out_of_band_at = null,
  updated_at = pg_catalog.clock_timestamp()
where task_row.status = 'sanitized_disclosure'
  and task_row.delivery_attested is false;

alter table kc_private.data_export_processor_tasks
  add constraint data_export_processor_tasks_evidence_check
  check (
    (
      status = 'sanitized_disclosure'
      and coalesce(evidence_hash ~ '^[a-f0-9]{64}$', false)
      and resolved_at is not null
      and delivery_attested is true
      and delivery_channel in (
        'support_mailbox',
        'secure_file_transfer',
        'provider_portal',
        'in_person'
      )
      and delivered_out_of_band_at is not null
    )
    or (
      status = 'no_account_data'
      and coalesce(evidence_hash ~ '^[a-f0-9]{64}$', false)
      and resolved_at is not null
      and delivery_attested is false
      and delivery_channel is null
      and delivered_out_of_band_at is null
    )
    or (
      status not in ('sanitized_disclosure', 'no_account_data')
      and evidence_hash is null
      and delivery_attested is false
      and delivery_channel is null
      and delivered_out_of_band_at is null
    )
  );

-- Shared owner-session assertion. FOR SHARE blocks expiry/revocation changes
-- until the delivery transaction commits, and clock_timestamp avoids a stale
-- transaction-start timestamp during a long Edge request.
create or replace function kc_private.kc_assert_active_data_export_owner_session(
  p_user_id uuid,
  p_session_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null or p_session_id is null then
    raise exception using
      errcode = '22023',
      message = 'EXPORT_OWNER_SESSION_REQUIRED';
  end if;

  perform 1
  from auth.sessions session_row
  where session_row.id = p_session_id
    and session_row.user_id = p_user_id
    and (
      session_row.not_after is null
      or session_row.not_after > pg_catalog.clock_timestamp()
    )
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'SESSION_NOT_ACTIVE';
  end if;
end;
$$;

revoke all on function
  kc_private.kc_assert_active_data_export_owner_session(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function kc_private.kc_data_export_owner_delivery_is_eligible(
  p_request_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_request_id is not null
    and p_user_id is not null
    and exists (
      select 1
      from auth.users user_row
      where user_row.id = p_user_id
    )
    and exists (
      select 1
      from public.data_subject_requests request_row
      where request_row.id = p_request_id
        and request_row.user_id = p_user_id
        and request_row.request_kind in (
          'data_access_copy',
          'data_portability'
        )
        and request_row.status in (
          'ready',
          'partial_failure',
          'completed'
        )
    )
    and not exists (
      select 1
      from public.data_subject_requests erasure_row
      where erasure_row.user_id = p_user_id
        and erasure_row.request_kind = 'account_erasure'
        and erasure_row.status in (
          'received',
          'processing',
          'ready',
          'pending_confirmation',
          'failed',
          'partial_failure'
        )
    );
$$;

revoke all on function
  kc_private.kc_data_export_owner_delivery_is_eligible(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function kc_private.kc_data_export_artifact_shape(
  p_artifact kc_private.data_export_artifacts
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'artifact_ref', p_artifact.artifact_ref,
    'status', p_artifact.status,
    'format', p_artifact.format,
    'version', p_artifact.row_version,
    'sha256', p_artifact.sha256,
    'byte_size', p_artifact.byte_size,
    'manifest', p_artifact.manifest,
    'ready_at', p_artifact.ready_at,
    'expires_at', p_artifact.expires_at,
    'download_available', (
      p_artifact.status in ('ready', 'delivered')
      and p_artifact.expires_at > now()
    ),
    'recovery_available', (
      p_artifact.status in ('ready', 'download_reserved', 'expired')
      and coalesce(p_artifact.expires_at, '-infinity'::timestamptz) <= now()
      and (
        p_artifact.status <> 'download_reserved'
        or coalesce(
          p_artifact.download_expires_at,
          '-infinity'::timestamptz
        ) <= now()
      )
    ),
    'delivered_at', p_artifact.delivered_at,
    'delivery_count', p_artifact.delivery_count,
    'failed_at', p_artifact.failed_at,
    'last_error_code', p_artifact.last_error_code,
    'created_at', p_artifact.created_at,
    'updated_at', p_artifact.updated_at,
    'blocking_processor_count', (
      select count(*)
      from kc_private.data_export_processor_tasks task_row
      where task_row.artifact_id = p_artifact.id
        and task_row.status = 'manual_follow_up'
    ),
    'processors', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'processor', task_row.processor,
          'treatment', task_row.treatment,
          'status', task_row.status,
          'evidence_sha256', task_row.evidence_hash,
          'resolved_at', task_row.resolved_at,
          'content_in_export', task_row.status = 'automated',
          'delivery_mode', case
            when task_row.status = 'sanitized_disclosure'
              then 'out_of_band'
            else null
          end,
          'delivery_channel', case
            when task_row.status = 'sanitized_disclosure'
              then task_row.delivery_channel
            else null
          end,
          'delivered_at', case
            when task_row.status = 'sanitized_disclosure'
              then task_row.delivered_out_of_band_at
            else null
          end,
          'disclosure', case
            when task_row.status = 'sanitized_disclosure' then
              'Dados deste operador foram entregues separadamente; nenhum conteudo do operador esta incluido neste arquivo JSON.'
            when task_row.status = 'no_account_data' then
              'O operador confirmou que nao localizou dados vinculados a esta conta; nenhum conteudo do operador esta incluido neste arquivo JSON.'
            else null
          end
        )
        order by task_row.processor
      )
      from kc_private.data_export_processor_tasks task_row
      where task_row.artifact_id = p_artifact.id
    ), '[]'::jsonb)
  );
$$;

revoke all on function
  kc_private.kc_data_export_artifact_shape(kc_private.data_export_artifacts)
  from public, anon, authenticated, service_role;

-- New explicit processor-delivery contract. The evidence reference is hashed;
-- only a small enum and timestamp are disclosed in the export. No external
-- bundle or processor content is accepted by this RPC.
create or replace function kc_private.kc_record_data_export_processor_evidence_v2(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid,
  p_processor text,
  p_outcome text,
  p_evidence_reference text,
  p_delivery_attested boolean,
  p_delivery_channel text,
  p_delivered_out_of_band_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact kc_private.data_export_artifacts%rowtype;
  v_processor text := lower(trim(coalesce(p_processor, '')));
  v_outcome text := lower(trim(coalesce(p_outcome, '')));
  v_reference text := trim(coalesce(p_evidence_reference, ''));
  v_channel text := lower(trim(coalesce(p_delivery_channel, '')));
  v_owner_user_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     or p_actor_id is null
     or not public.kc_is_admin(p_actor_id) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_artifact_ref !~ '^KEA-[A-F0-9]{32}$'
     or p_expected_version is null
     or v_processor !~ '^[a-z0-9][a-z0-9_]{2,79}$'
     or v_outcome not in ('supplied_out_of_band', 'no_account_data')
     or char_length(v_reference) < 8
     or char_length(v_reference) > 500 then
    raise exception using
      errcode = '22023',
      message = 'EXPORT_PROCESSOR_EVIDENCE_INVALID';
  end if;

  if v_outcome = 'supplied_out_of_band' then
    if p_delivery_attested is distinct from true
       or v_channel not in (
         'support_mailbox',
         'secure_file_transfer',
         'provider_portal',
         'in_person'
       )
       or p_delivered_out_of_band_at is null
       or p_delivered_out_of_band_at < v_now - interval '365 days'
       or p_delivered_out_of_band_at > v_now + interval '5 minutes' then
      raise exception using
        errcode = '22023',
        message = 'EXPORT_PROCESSOR_DELIVERY_ATTESTATION_INVALID';
    end if;
  elsif p_delivery_attested is distinct from false
        or coalesce(v_channel, '') <> ''
        or p_delivered_out_of_band_at is not null then
    raise exception using
      errcode = '22023',
      message = 'EXPORT_PROCESSOR_DELIVERY_ATTESTATION_INVALID';
  end if;

  select artifact_row.owner_user_id
    into v_owner_user_id
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref;
  if not found or v_owner_user_id is null then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  perform kc_private.kc_lock_privacy_subject(v_owner_user_id);

  select artifact_row.*
    into v_artifact
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  if v_artifact.row_version <> p_expected_version
     or v_artifact.status not in ('queued', 'failed') then
    raise exception using
      errcode = '40001',
      message = 'EXPORT_ARTIFACT_VERSION_CONFLICT';
  end if;
  if v_artifact.owner_user_id is distinct from v_owner_user_id
     or not kc_private.kc_data_export_subject_is_eligible(
       v_artifact.request_id,
       v_owner_user_id
     ) then
    raise exception using
      errcode = '23514',
      message = 'EXPORT_SUBJECT_NOT_ELIGIBLE';
  end if;

  update kc_private.data_export_processor_tasks task_row
  set
    status = case
      when v_outcome = 'supplied_out_of_band'
        then 'sanitized_disclosure'
      else 'no_account_data'
    end,
    evidence_hash = encode(
      extensions.digest(
        convert_to(
          'kc:data-export-processor-evidence:v2|'
            || v_artifact.artifact_ref
            || '|'
            || v_processor
            || '|'
            || v_reference,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ),
    resolved_by = p_actor_id,
    resolved_at = v_now,
    delivery_attested = v_outcome = 'supplied_out_of_band',
    delivery_channel = case
      when v_outcome = 'supplied_out_of_band' then v_channel
      else null
    end,
    delivered_out_of_band_at = case
      when v_outcome = 'supplied_out_of_band'
        then p_delivered_out_of_band_at
      else null
    end,
    updated_at = v_now
  where task_row.artifact_id = v_artifact.id
    and task_row.processor = v_processor
    and task_row.status = 'manual_follow_up';
  if not found then
    raise exception using
      errcode = '23514',
      message = 'EXPORT_PROCESSOR_NOT_PENDING';
  end if;

  update kc_private.data_export_artifacts artifact_row
  set
    row_version = artifact_row.row_version + 1,
    last_error_code = null,
    failed_at = null,
    updated_at = v_now
  where artifact_row.id = v_artifact.id
  returning * into v_artifact;

  return kc_private.kc_data_export_artifact_shape(v_artifact);
end;
$$;

revoke all on function
  kc_private.kc_record_data_export_processor_evidence_v2(
    text, bigint, uuid, text, text, text, boolean, text, timestamptz
  )
  from public, anon, authenticated, service_role;

-- Old callers cannot silently translate "supplied" into "included". They may
-- still record the no-data outcome during the expand window.
create or replace function kc_private.kc_record_data_export_processor_evidence(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid,
  p_processor text,
  p_outcome text,
  p_evidence_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outcome text := lower(trim(coalesce(p_outcome, '')));
begin
  if v_outcome in ('supplied', 'sanitized_disclosure') then
    raise exception using
      errcode = '23514',
      message = 'EXPORT_PROCESSOR_OUT_OF_BAND_ATTESTATION_REQUIRED';
  end if;
  return kc_private.kc_record_data_export_processor_evidence_v2(
    p_artifact_ref,
    p_expected_version,
    p_actor_id,
    p_processor,
    v_outcome,
    p_evidence_reference,
    false,
    null,
    null
  );
end;
$$;

revoke all on function
  kc_private.kc_record_data_export_processor_evidence(
    text, bigint, uuid, text, text, text
  )
  from public, anon, authenticated, service_role;

create or replace function public.kc_record_data_export_processor_evidence(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid,
  p_actor_session_id uuid,
  p_processor text,
  p_outcome text,
  p_evidence_reference text,
  p_delivery_attested boolean,
  p_delivery_channel text,
  p_delivered_out_of_band_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform kc_private.kc_assert_active_data_export_admin_session(
    p_actor_id,
    p_actor_session_id
  );
  return kc_private.kc_record_data_export_processor_evidence_v2(
    p_artifact_ref,
    p_expected_version,
    p_actor_id,
    p_processor,
    p_outcome,
    p_evidence_reference,
    p_delivery_attested,
    p_delivery_channel,
    p_delivered_out_of_band_at
  );
end;
$$;

revoke all on function
  public.kc_record_data_export_processor_evidence(
    text, bigint, uuid, uuid, text, text, text, boolean, text, timestamptz
  )
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_record_data_export_processor_evidence(
    text, bigint, uuid, uuid, text, text, text, boolean, text, timestamptz
  )
  to service_role;

comment on function public.kc_record_data_export_processor_evidence(
  text, bigint, uuid, uuid, text, text, text, boolean, text, timestamptz
) is
  'Records only hashed evidence plus explicit out-of-band delivery attestation. Browser-supplied processor bundles are not accepted.';

-- Cap media before a claim continuation reaches the legacy private worker.
-- The private worker is not executable by service_role; this session-bound
-- public wrapper is the sole supported surface.
create or replace function public.kc_store_data_export_media_refs(
  p_artifact_ref text,
  p_expected_version bigint,
  p_claim_token text,
  p_media_refs jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(coalesce(p_media_refs, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_media_refs) > 100 then
    raise exception using
      errcode = '22023',
      message = 'EXPORT_MEDIA_SIGNING_LIMIT_EXCEEDED';
  end if;
  perform kc_private.kc_bind_or_assert_data_export_claim_session(
    p_artifact_ref,
    p_expected_version,
    p_claim_token
  );
  return kc_private.kc_store_data_export_media_refs(
    p_artifact_ref,
    p_expected_version,
    p_claim_token,
    p_media_refs
  );
end;
$$;

-- A ready artifact and a previously delivered artifact use the same
-- short-lived reservation. download_return_status preserves the state that
-- must be restored if the Edge request fails or times out.
create or replace function kc_private.kc_reserve_data_export_artifact_download(
  p_artifact_ref text,
  p_expected_version bigint,
  p_user_id uuid,
  p_session_id uuid,
  p_ttl_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact kc_private.data_export_artifacts%rowtype;
  v_token text;
  v_ttl integer := coalesce(p_ttl_seconds, 120);
  v_media_ref_count integer;
  v_manifest_media_ref_count integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_artifact_ref !~ '^KEA-[A-F0-9]{32}$'
     or p_expected_version is null
     or p_user_id is null
     or p_session_id is null
     or v_ttl < 30
     or v_ttl > 180 then
    raise exception using
      errcode = '22023',
      message = 'EXPORT_DOWNLOAD_RESERVATION_INVALID';
  end if;

  perform kc_private.kc_lock_privacy_subject(p_user_id);
  perform kc_private.kc_assert_active_data_export_owner_session(
    p_user_id,
    p_session_id
  );

  select artifact_row.*
    into v_artifact
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref
  for update;
  if not found or v_artifact.owner_user_id is distinct from p_user_id then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  if v_artifact.row_version <> p_expected_version then
    raise exception using
      errcode = '40001',
      message = 'EXPORT_ARTIFACT_VERSION_CONFLICT';
  end if;
  if not kc_private.kc_data_export_owner_delivery_is_eligible(
    v_artifact.request_id,
    p_user_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'EXPORT_SUBJECT_NOT_ELIGIBLE';
  end if;
  if v_artifact.status not in ('ready', 'delivered')
     or v_artifact.expires_at is null
     or v_artifact.expires_at <= pg_catalog.clock_timestamp()
     or v_artifact.object_path is null
     or v_artifact.sha256 is null
     or v_artifact.byte_size is null
     or not exists (
       select 1
       from storage.objects object_row
       where object_row.bucket_id = v_artifact.bucket_id
         and object_row.name = v_artifact.object_path
     ) then
    raise exception using
      errcode = '23514',
      message = 'EXPORT_ARTIFACT_NOT_READY';
  end if;

  select count(*)::integer
    into v_media_ref_count
  from kc_private.data_export_media_refs media_row
  where media_row.artifact_id = v_artifact.id
    and media_row.owner_user_id = p_user_id;

  begin
    v_manifest_media_ref_count :=
      (v_artifact.manifest ->> 'media_ref_count')::integer;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception using
        errcode = '23514',
        message = 'EXPORT_MEDIA_MANIFEST_INVALID';
  end;
  if v_manifest_media_ref_count is null
     or v_manifest_media_ref_count <> v_media_ref_count then
    raise exception using
      errcode = '23514',
      message = 'EXPORT_MEDIA_MANIFEST_MISMATCH';
  end if;
  if v_media_ref_count > 100 then
    raise exception using
      errcode = '54000',
      message = 'EXPORT_MEDIA_SIGNING_LIMIT_EXCEEDED';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  update kc_private.data_export_artifacts artifact_row
  set
    status = 'download_reserved',
    download_return_status = v_artifact.status,
    row_version = artifact_row.row_version + 1,
    download_token_hash = encode(
      extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
      'hex'
    ),
    download_session_id = p_session_id,
    download_reserved_at = pg_catalog.clock_timestamp(),
    download_expires_at =
      pg_catalog.clock_timestamp() + make_interval(secs => v_ttl),
    updated_at = pg_catalog.clock_timestamp()
  where artifact_row.id = v_artifact.id
  returning * into v_artifact;

  return jsonb_build_object(
    'artifact_ref', v_artifact.artifact_ref,
    'version', v_artifact.row_version,
    'bucket_id', v_artifact.bucket_id,
    'object_path', v_artifact.object_path,
    'format', v_artifact.format,
    'sha256', v_artifact.sha256,
    'byte_size', v_artifact.byte_size,
    'media_ref_count', v_media_ref_count,
    'download_token', v_token,
    'download_expires_at', v_artifact.download_expires_at
  );
end;
$$;

create or replace function kc_private.kc_read_data_export_media_refs_for_download(
  p_artifact_ref text,
  p_expected_version bigint,
  p_user_id uuid,
  p_session_id uuid,
  p_download_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact kc_private.data_export_artifacts%rowtype;
  v_media_ref_count integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_artifact_ref !~ '^KEA-[A-F0-9]{32}$'
     or p_expected_version is null
     or p_user_id is null
     or p_session_id is null
     or p_download_token !~ '^[a-f0-9]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'EXPORT_MEDIA_REF_READ_INVALID';
  end if;

  perform kc_private.kc_lock_privacy_subject(p_user_id);
  perform kc_private.kc_assert_active_data_export_owner_session(
    p_user_id,
    p_session_id
  );

  select artifact_row.*
    into v_artifact
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref
  for update;
  if not found or v_artifact.owner_user_id is distinct from p_user_id then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  if not kc_private.kc_data_export_owner_delivery_is_eligible(
    v_artifact.request_id,
    p_user_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'EXPORT_SUBJECT_NOT_ELIGIBLE';
  end if;
  if v_artifact.row_version <> p_expected_version
     or v_artifact.status <> 'download_reserved'
     or v_artifact.download_session_id is distinct from p_session_id
     or v_artifact.download_expires_at <= pg_catalog.clock_timestamp()
     or v_artifact.download_token_hash <> encode(
       extensions.digest(convert_to(p_download_token, 'UTF8'), 'sha256'),
       'hex'
     ) then
    raise exception using
      errcode = '40001',
      message = 'EXPORT_DOWNLOAD_CONSUME_CONFLICT';
  end if;

  select count(*)::integer
    into v_media_ref_count
  from kc_private.data_export_media_refs media_row
  where media_row.artifact_id = v_artifact.id
    and media_row.owner_user_id = p_user_id;
  if v_media_ref_count > 100 then
    raise exception using
      errcode = '54000',
      message = 'EXPORT_MEDIA_SIGNING_LIMIT_EXCEEDED';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'media_ref', media_row.media_ref,
        'bucket_id', media_row.bucket_id,
        'object_path', media_row.object_path
      )
      order by media_row.media_ref
    )
    from kc_private.data_export_media_refs media_row
    where media_row.artifact_id = v_artifact.id
      and media_row.owner_user_id = p_user_id
  ), '[]'::jsonb);
end;
$$;

create or replace function kc_private.kc_consume_data_export_artifact_download(
  p_artifact_ref text,
  p_expected_version bigint,
  p_user_id uuid,
  p_session_id uuid,
  p_download_token text,
  p_observed_sha256 text,
  p_observed_byte_size bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact kc_private.data_export_artifacts%rowtype;
  v_request public.data_subject_requests%rowtype;
  v_is_redownload boolean;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_artifact_ref !~ '^KEA-[A-F0-9]{32}$'
     or p_expected_version is null
     or p_user_id is null
     or p_session_id is null
     or p_download_token !~ '^[a-f0-9]{64}$'
     or lower(coalesce(p_observed_sha256, '')) !~ '^[a-f0-9]{64}$'
     or p_observed_byte_size is null then
    raise exception using
      errcode = '22023',
      message = 'EXPORT_DOWNLOAD_CONSUME_INVALID';
  end if;

  perform kc_private.kc_lock_privacy_subject(p_user_id);
  perform kc_private.kc_assert_active_data_export_owner_session(
    p_user_id,
    p_session_id
  );

  select artifact_row.*
    into v_artifact
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref
  for update;
  if not found or v_artifact.owner_user_id is distinct from p_user_id then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  if not kc_private.kc_data_export_owner_delivery_is_eligible(
    v_artifact.request_id,
    p_user_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'EXPORT_SUBJECT_NOT_ELIGIBLE';
  end if;
  if v_artifact.row_version <> p_expected_version
     or v_artifact.status <> 'download_reserved'
     or v_artifact.download_return_status not in ('ready', 'delivered')
     or v_artifact.download_session_id is distinct from p_session_id
     or v_artifact.download_expires_at <= v_now
     or v_artifact.download_token_hash <> encode(
       extensions.digest(convert_to(p_download_token, 'UTF8'), 'sha256'),
       'hex'
     )
     or v_artifact.sha256 <> lower(p_observed_sha256)
     or v_artifact.byte_size <> p_observed_byte_size then
    raise exception using
      errcode = '40001',
      message = 'EXPORT_DOWNLOAD_CONSUME_CONFLICT';
  end if;

  v_is_redownload := v_artifact.download_return_status = 'delivered';
  select request_row.*
    into v_request
  from public.data_subject_requests request_row
  where request_row.id = v_artifact.request_id
    and request_row.user_id = p_user_id
  for update;
  if not found
     or (
       not v_is_redownload
       and v_request.status not in ('ready', 'partial_failure')
     )
     or (
       v_is_redownload
       and v_request.status <> 'completed'
     ) then
    raise exception using
      errcode = '23514',
      message = 'EXPORT_REQUEST_NOT_DELIVERABLE';
  end if;

  update kc_private.data_export_artifacts artifact_row
  set
    status = 'delivered',
    row_version = artifact_row.row_version + 1,
    download_token_hash = null,
    download_session_id = null,
    download_reserved_at = null,
    download_expires_at = null,
    delivered_at = coalesce(artifact_row.delivered_at, v_now),
    delivery_count = artifact_row.delivery_count + 1,
    updated_at = v_now
  where artifact_row.id = v_artifact.id
    and artifact_row.row_version = p_expected_version
    and artifact_row.status = 'download_reserved'
  returning * into v_artifact;
  if not found then
    raise exception using
      errcode = '40001',
      message = 'EXPORT_DOWNLOAD_CONSUME_CONFLICT';
  end if;

  if not v_is_redownload then
    update public.data_subject_requests request_row
    set
      status = 'completed',
      completed_at = coalesce(request_row.completed_at, v_now)
    where request_row.id = v_request.id;
  end if;

  insert into public.data_subject_request_events (
    request_id,
    actor_user_id,
    status,
    event_type,
    public_message
  ) values (
    v_request.id,
    p_user_id,
    'completed',
    'downloaded',
    case
      when v_is_redownload then
        'Nova copia do complemento foi entregue ao titular autenticado.'
      else
        'Copia integral suplementar entregue ao titular autenticado.'
    end
  );

  update public.help_requests help_row
  set
    status = 'archived',
    metadata = coalesce(help_row.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'data_subject_request_status', 'completed',
        'manual_supplement_required', false,
        'export_artifact_status', 'delivered',
        'export_artifact_delivered_at', v_artifact.delivered_at,
        'export_artifact_last_downloaded_at', v_now,
        'export_artifact_delivery_count', v_artifact.delivery_count
      )
  where help_row.id = v_request.help_request_id;

  return kc_private.kc_data_export_artifact_shape(v_artifact);
end;
$$;

-- Metadata reads recover an abandoned reservation deterministically. A
-- re-download returns to delivered, never to ready; an initially-ready
-- reservation returns to ready only while its retention deadline is live.
create or replace function kc_private.kc_read_data_export_artifact_for_owner(
  p_request_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact kc_private.data_export_artifacts%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  select artifact_row.*
    into v_artifact
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.request_id = p_request_id
    and artifact_row.owner_user_id = p_user_id
  for update;
  if not found then
    return null;
  end if;
  if v_artifact.status = 'download_reserved'
     and coalesce(
       v_artifact.download_expires_at,
       '-infinity'::timestamptz
     ) <= pg_catalog.clock_timestamp() then
    update kc_private.data_export_artifacts artifact_row
    set
      status = case
        when artifact_row.download_return_status = 'delivered'
          then 'delivered'
        when artifact_row.expires_at > pg_catalog.clock_timestamp()
          then 'ready'
        else 'expired'
      end,
      row_version = artifact_row.row_version + 1,
      download_token_hash = null,
      download_session_id = null,
      download_reserved_at = null,
      download_expires_at = null,
      updated_at = pg_catalog.clock_timestamp()
    where artifact_row.id = v_artifact.id
    returning * into v_artifact;
  end if;
  return kc_private.kc_data_export_artifact_shape(v_artifact);
end;
$$;

-- Direct delivery transitions use the same active-session semantics.
create or replace function kc_private.kc_transition_data_subject_request_for_active_session(
  p_request_id uuid,
  p_expected_status text,
  p_new_status text,
  p_user_id uuid,
  p_session_id uuid,
  p_event_type text,
  p_public_message text
)
returns public.data_subject_requests
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_request_id is null or p_user_id is null or p_session_id is null then
    raise exception using
      errcode = '22023',
      message = 'DSR_SESSION_TRANSITION_ARGUMENTS_REQUIRED';
  end if;

  perform kc_private.kc_assert_active_data_export_owner_session(
    p_user_id,
    p_session_id
  );
  perform 1
  from public.data_subject_requests request_row
  where request_row.id = p_request_id
    and request_row.user_id = p_user_id
    and request_row.request_kind in ('data_access_copy', 'data_portability')
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'DSR_NOT_FOUND';
  end if;

  return kc_private.kc_transition_data_subject_request(
    p_request_id,
    p_expected_status,
    p_new_status,
    null,
    p_event_type,
    p_public_message
  );
end;
$$;

-- Public Edge surfaces remain service-role-only. SECURITY DEFINER lets those
-- narrowly scoped wrappers call the now non-executable private workers.
create or replace function public.kc_reserve_data_export_artifact_download(
  p_artifact_ref text,
  p_expected_version bigint,
  p_user_id uuid,
  p_session_id uuid,
  p_ttl_seconds integer default 120
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select kc_private.kc_reserve_data_export_artifact_download(
    $1, $2, $3, $4, $5
  );
$$;

create or replace function public.kc_read_data_export_media_refs_for_download(
  p_artifact_ref text,
  p_expected_version bigint,
  p_user_id uuid,
  p_session_id uuid,
  p_download_token text
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select kc_private.kc_read_data_export_media_refs_for_download(
    $1, $2, $3, $4, $5
  );
$$;

create or replace function public.kc_consume_data_export_artifact_download(
  p_artifact_ref text,
  p_expected_version bigint,
  p_user_id uuid,
  p_session_id uuid,
  p_download_token text,
  p_observed_sha256 text,
  p_observed_byte_size bigint
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select kc_private.kc_consume_data_export_artifact_download(
    $1, $2, $3, $4, $5, $6, $7
  );
$$;

create or replace function public.kc_read_data_export_artifact_for_owner(
  p_request_id uuid,
  p_user_id uuid
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select kc_private.kc_read_data_export_artifact_for_owner($1, $2);
$$;

create or replace function public.kc_transition_data_subject_request_for_active_session(
  p_request_id uuid,
  p_expected_status text,
  p_new_status text,
  p_user_id uuid,
  p_session_id uuid,
  p_event_type text,
  p_public_message text
)
returns public.data_subject_requests
language sql
volatile
security definer
set search_path = ''
as $$
  select kc_private.kc_transition_data_subject_request_for_active_session(
    $1, $2, $3, $4, $5, $6, $7
  );
$$;

-- A successful first delivery does not shorten the advertised retention
-- window. Manual and automatic purge become eligible only after expires_at;
-- account erasure still uses its separate immediate, subject-locked path.
create or replace function kc_private.kc_claim_data_export_artifact_purge(
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
  v_now timestamptz := pg_catalog.clock_timestamp();
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
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  if v_artifact.row_version <> p_expected_version then
    raise exception using
      errcode = '40001',
      message = 'EXPORT_ARTIFACT_VERSION_CONFLICT';
  end if;
  if v_artifact.status = 'purging' then
    if v_artifact.purge_reason = 'account_erasure' then
      raise exception using
        errcode = '23514',
        message = 'EXPORT_ARTIFACT_NOT_PURGEABLE';
    end if;
    return kc_private.kc_data_export_artifact_shape(v_artifact)
      || jsonb_build_object(
        'bucket_id', v_artifact.bucket_id,
        'object_path', v_artifact.object_path
      );
  end if;
  if v_artifact.status not in ('failed', 'expired')
     and not (
       v_artifact.status = 'delivered'
       and coalesce(v_artifact.expires_at, 'infinity'::timestamptz) <= v_now
     )
     and not (
       v_artifact.status = 'ready'
       and v_artifact.expires_at <= v_now
     )
     and not (
       v_artifact.status = 'download_reserved'
       and v_artifact.expires_at <= v_now
       and coalesce(
         v_artifact.download_expires_at,
         '-infinity'::timestamptz
       ) <= v_now
     ) then
    raise exception using
      errcode = '23514',
      message = 'EXPORT_ARTIFACT_NOT_PURGEABLE';
  end if;

  update kc_private.data_export_artifacts artifact_row
  set
    status = 'purging',
    row_version = artifact_row.row_version + 1,
    claim_token_hash = null,
    download_token_hash = null,
    download_session_id = null,
    download_reserved_at = null,
    download_expires_at = null,
    purge_reason = case
      when p_actor_id is null then 'retention'
      else 'manual'
    end,
    purge_erasure_request_id = null,
    updated_at = v_now
  where artifact_row.id = v_artifact.id
  returning * into v_artifact;

  return kc_private.kc_data_export_artifact_shape(v_artifact)
    || jsonb_build_object(
      'bucket_id', v_artifact.bucket_id,
      'object_path', v_artifact.object_path
    );
end;
$$;

-- Preserve the 03000 stale-claim recovery contract while changing delivered
-- retention from "one hour after delivery" to the user-visible expires_at.
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
  v_now timestamptz := pg_catalog.clock_timestamp();
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
      and artifact_row.expires_at <= v_now
    ) or (
      artifact_row.status = 'download_reserved'
      and artifact_row.expires_at <= v_now
      and coalesce(
        artifact_row.download_expires_at,
        '-infinity'::timestamptz
      ) <= v_now
    ) or (
      artifact_row.status = 'delivered'
      and coalesce(
        artifact_row.expires_at,
        'infinity'::timestamptz
      ) <= v_now
    ) or (
      artifact_row.status = 'failed'
      and artifact_row.failed_at <= v_now - interval '24 hours'
    ) or (
      artifact_row.status = 'claimed'
      and artifact_row.claim_expires_at <= v_now
    ) or artifact_row.status = 'expired'
      or (
        artifact_row.status = 'purging'
        and artifact_row.purge_reason is distinct from 'account_erasure'
        and artifact_row.updated_at <= v_now - interval '15 minutes'
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
      updated_at = v_now
    where artifact_row.id = v_candidate.id
      and artifact_row.row_version = v_candidate.row_version
      and artifact_row.status = v_candidate.status
      and (
        v_candidate.status <> 'claimed'
        or artifact_row.claim_expires_at <= v_now
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

-- CONTRACT DEFERRED: restore expand-only actor compatibility for retention.
-- Null actor remains the unambiguous machine worker; an actor resolves exactly
-- one active session and then delegates to the stronger overload.
create or replace function public.kc_claim_expired_data_export_artifacts(
  p_limit integer default 50,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  if p_actor_id is null then
    return kc_private.kc_claim_expired_data_export_artifacts(p_limit, null);
  end if;
  v_session_id :=
    kc_private.kc_resolve_legacy_data_export_admin_session(p_actor_id);
  return public.kc_claim_expired_data_export_artifacts(
    p_limit,
    p_actor_id,
    v_session_id
  );
end;
$$;

create or replace function public.kc_claim_data_export_artifact_purge(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  if p_actor_id is null then
    return kc_private.kc_claim_data_export_artifact_purge(
      p_artifact_ref,
      p_expected_version,
      null
    );
  end if;
  v_session_id :=
    kc_private.kc_resolve_legacy_data_export_admin_session(p_actor_id);
  return public.kc_claim_data_export_artifact_purge(
    p_artifact_ref,
    p_expected_version,
    p_actor_id,
    v_session_id
  );
end;
$$;

create or replace function public.kc_purge_data_export_artifact(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  if p_actor_id is null then
    return kc_private.kc_purge_data_export_artifact(
      p_artifact_ref,
      p_expected_version,
      null
    );
  end if;
  v_session_id :=
    kc_private.kc_resolve_legacy_data_export_admin_session(p_actor_id);
  return public.kc_purge_data_export_artifact(
    p_artifact_ref,
    p_expected_version,
    p_actor_id,
    v_session_id
  );
end;
$$;

comment on function public.kc_claim_expired_data_export_artifacts(
  integer, uuid
) is
  'CONTRACT DEFERRED: null actor is machine retention; actor-only compatibility requires exactly one active non-expired administrator session.';
comment on function public.kc_claim_data_export_artifact_purge(
  text, bigint, uuid
) is
  'CONTRACT DEFERRED: null actor is machine retention; actor-only compatibility requires exactly one active non-expired administrator session.';
comment on function public.kc_purge_data_export_artifact(
  text, bigint, uuid
) is
  'CONTRACT DEFERRED: null actor is machine retention; actor-only compatibility requires exactly one active non-expired administrator session.';

-- Reassert the complete ACL surface after replacements.
revoke all on function
  public.kc_store_data_export_media_refs(text, bigint, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_store_data_export_media_refs(text, bigint, text, jsonb)
  to service_role;

revoke all on function
  kc_private.kc_reserve_data_export_artifact_download(
    text, bigint, uuid, uuid, integer
  )
  from public, anon, authenticated, service_role;
revoke all on function
  kc_private.kc_read_data_export_media_refs_for_download(
    text, bigint, uuid, uuid, text
  )
  from public, anon, authenticated, service_role;
revoke all on function
  kc_private.kc_consume_data_export_artifact_download(
    text, bigint, uuid, uuid, text, text, bigint
  )
  from public, anon, authenticated, service_role;
revoke all on function
  kc_private.kc_read_data_export_artifact_for_owner(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function
  kc_private.kc_transition_data_subject_request_for_active_session(
    uuid, text, text, uuid, uuid, text, text
  )
  from public, anon, authenticated, service_role;

revoke all on function
  public.kc_reserve_data_export_artifact_download(
    text, bigint, uuid, uuid, integer
  )
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_reserve_data_export_artifact_download(
    text, bigint, uuid, uuid, integer
  )
  to service_role;
revoke all on function
  public.kc_read_data_export_media_refs_for_download(
    text, bigint, uuid, uuid, text
  )
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_read_data_export_media_refs_for_download(
    text, bigint, uuid, uuid, text
  )
  to service_role;
revoke all on function
  public.kc_consume_data_export_artifact_download(
    text, bigint, uuid, uuid, text, text, bigint
  )
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_consume_data_export_artifact_download(
    text, bigint, uuid, uuid, text, text, bigint
  )
  to service_role;
revoke all on function
  public.kc_read_data_export_artifact_for_owner(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_read_data_export_artifact_for_owner(uuid, uuid)
  to service_role;
revoke all on function
  public.kc_transition_data_subject_request_for_active_session(
    uuid, text, text, uuid, uuid, text, text
  )
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_transition_data_subject_request_for_active_session(
    uuid, text, text, uuid, uuid, text, text
  )
  to service_role;

revoke all on function
  public.kc_claim_expired_data_export_artifacts(integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_claim_expired_data_export_artifacts(integer, uuid)
  to service_role;
revoke all on function
  public.kc_claim_data_export_artifact_purge(text, bigint, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_claim_data_export_artifact_purge(text, bigint, uuid)
  to service_role;
revoke all on function
  public.kc_purge_data_export_artifact(text, bigint, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_purge_data_export_artifact(text, bigint, uuid)
  to service_role;

notify pgrst, 'reload schema';

commit;

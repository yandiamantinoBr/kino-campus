begin;

-- Long-running assisted exports must remain bound to the exact administrator
-- session that claimed them. A user JWT is validated by the Edge Function,
-- while every privileged database step revalidates and locks both the admin
-- profile and auth session for the duration of the transaction.
alter table kc_private.data_export_artifacts
  add column if not exists claimed_session_id uuid;

comment on column kc_private.data_export_artifacts.claimed_session_id is
  'Administrator auth.sessions.id bound to the active build lease. Never exposed in public artifact shapes.';

create or replace function kc_private.kc_clear_inactive_export_claim_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'claimed'
     or new.claimed_by is null
     or new.claim_token_hash is null then
    new.claimed_session_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists data_export_artifact_claim_session_cleanup
  on kc_private.data_export_artifacts;
create trigger data_export_artifact_claim_session_cleanup
before insert or update on kc_private.data_export_artifacts
for each row
execute function kc_private.kc_clear_inactive_export_claim_session();

revoke all on function
  kc_private.kc_clear_inactive_export_claim_session()
  from public, anon, authenticated, service_role;

create or replace function kc_private.kc_assert_active_data_export_admin_session(
  p_actor_id uuid,
  p_actor_session_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_actor_id is null or p_actor_session_id is null then
    raise exception using
      errcode = '22023',
      message = 'EXPORT_ADMIN_SESSION_REQUIRED';
  end if;

  perform 1
  from public.profiles profile_row
  where profile_row.id = p_actor_id
    and profile_row.is_admin is true
  for share;
  if not found then
    raise exception using
      errcode = '42501',
      message = 'EXPORT_ADMIN_REQUIRED';
  end if;

  perform 1
  from auth.sessions session_row
  where session_row.id = p_actor_session_id
    and session_row.user_id = p_actor_id
    and (
      session_row.not_after is null
      or session_row.not_after > pg_catalog.clock_timestamp()
    )
  for share;
  if not found then
    raise exception using
      errcode = '42501',
      message = 'EXPORT_ADMIN_SESSION_NOT_ACTIVE';
  end if;
end;
$$;

revoke all on function
  kc_private.kc_assert_active_data_export_admin_session(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Supabase keeps time-boxed sessions for progressive cleanup after they have
-- expired. Owner RLS/RPC guards must therefore check not_after as well as row
-- existence. The public security-invoker wrapper and its ACL remain unchanged.
create or replace function kc_private.kc_is_current_session_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'true'
    and coalesce(auth.jwt() ->> 'session_id', '') ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and exists (
      select 1
      from auth.sessions session_row
      where session_row.id = (auth.jwt() ->> 'session_id')::uuid
        and session_row.user_id = auth.uid()
        and (
          session_row.not_after is null
          or session_row.not_after > now()
        )
    );
$$;

-- Account-erasure admin work uses the same non-expired session semantics and
-- shared row locks as export work. FOR SHARE blocks non-key changes such as
-- is_admin=false or not_after updates until the privileged transaction ends.
create or replace function kc_private.kc_assert_active_admin_session(
  p_actor_id uuid,
  p_actor_session_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_actor_id is null or p_actor_session_id is null then
    raise exception using
      errcode = '22023',
      message = 'ERASURE_ADMIN_SESSION_REQUIRED';
  end if;

  perform 1
  from public.profiles profile_row
  where profile_row.id = p_actor_id
    and profile_row.is_admin is true
  for share;
  if not found then
    raise exception using
      errcode = '42501',
      message = 'ERASURE_ADMIN_REQUIRED';
  end if;

  perform 1
  from auth.sessions session_row
  where session_row.id = p_actor_session_id
    and session_row.user_id = p_actor_id
    and (
      session_row.not_after is null
      or session_row.not_after > pg_catalog.clock_timestamp()
    )
  for share;
  if not found then
    raise exception using
      errcode = '42501',
      message = 'ERASURE_ADMIN_SESSION_NOT_ACTIVE';
  end if;
end;
$$;

revoke all on function kc_private.kc_assert_active_admin_session(uuid, uuid)
  from public, anon, authenticated, service_role;

-- CONTRACT DEFERRED: actor-only Edge deployments cannot prove which browser
-- session originated their service-role call. During the expand window they
-- are accepted only when the administrator has exactly one non-expired
-- session. Ambiguity fails closed; the contract migration must remove these
-- compatibility wrappers after every Edge deployment sends session_id.
create or replace function kc_private.kc_resolve_legacy_data_export_admin_session(
  p_actor_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session_ids uuid[];
  v_session_id uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'SERVICE_ROLE_REQUIRED';
  end if;

  select coalesce(
    pg_catalog.array_agg(candidate.session_id order by candidate.session_id),
    '{}'::uuid[]
  )
    into v_session_ids
  from (
    select session_row.id as session_id
    from auth.sessions session_row
    where session_row.user_id = p_actor_id
      and (
        session_row.not_after is null
        or session_row.not_after > pg_catalog.clock_timestamp()
      )
    order by session_row.id
    limit 2
  ) candidate;

  if pg_catalog.cardinality(v_session_ids) = 0 then
    raise exception using
      errcode = '42501',
      message = 'EXPORT_ADMIN_SESSION_NOT_ACTIVE';
  end if;
  if pg_catalog.cardinality(v_session_ids) <> 1 then
    raise exception using
      errcode = '42501',
      message = 'EXPORT_ADMIN_SESSION_AMBIGUOUS';
  end if;

  v_session_id := v_session_ids[1];
  perform kc_private.kc_assert_active_data_export_admin_session(
    p_actor_id,
    v_session_id
  );
  return v_session_id;
end;
$$;

revoke all on function
  kc_private.kc_resolve_legacy_data_export_admin_session(uuid)
  from public, anon, authenticated, service_role;

-- Claims already in flight when the expand migration lands receive an exact
-- session only when it is unambiguous and their lease is still live. Claims
-- that cannot be proven are released to an explicit retryable failure instead
-- of remaining permanently uncontinuable with claimed_session_id null.
with unambiguous_active_sessions as (
  select
    artifact_row.id as artifact_id,
    (
      pg_catalog.array_agg(session_row.id order by session_row.id)
    )[1] as session_id
  from kc_private.data_export_artifacts artifact_row
  join public.profiles profile_row
    on profile_row.id = artifact_row.claimed_by
   and profile_row.is_admin is true
  join auth.sessions session_row
    on session_row.user_id = artifact_row.claimed_by
   and (
     session_row.not_after is null
     or session_row.not_after > pg_catalog.clock_timestamp()
   )
  where artifact_row.status = 'claimed'
    and artifact_row.claimed_session_id is null
    and artifact_row.claim_token_hash is not null
    and artifact_row.claim_expires_at > pg_catalog.clock_timestamp()
  group by artifact_row.id
  having pg_catalog.count(*) = 1
)
update kc_private.data_export_artifacts artifact_row
set
  claimed_session_id = active_session.session_id,
  updated_at = now()
from unambiguous_active_sessions active_session
where artifact_row.id = active_session.artifact_id;

update kc_private.data_export_artifacts artifact_row
set
  status = 'failed',
  row_version = artifact_row.row_version + 1,
  claim_token_hash = null,
  claimed_by = null,
  claimed_at = null,
  claim_expires_at = null,
  upload_authorized_at = null,
  failed_at = now(),
  last_error_code = 'EXPORT_SESSION_BINDING_MIGRATION_RETRY',
  updated_at = now()
where artifact_row.status = 'claimed'
  and artifact_row.claimed_session_id is null;

-- Entry points that initiate or inspect admin work receive the session
-- explicitly. Actor-only signatures remain temporarily executable below under
-- the CONTRACT DEFERRED single-session guard.
create or replace function public.kc_admin_read_data_export_artifact(
  p_help_request_id uuid,
  p_artifact_ref text,
  p_actor_id uuid,
  p_actor_session_id uuid
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
  return kc_private.kc_admin_read_data_export_artifact(
    p_help_request_id,
    p_artifact_ref,
    p_actor_id
  );
end;
$$;

create or replace function public.kc_record_data_export_processor_evidence(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid,
  p_actor_session_id uuid,
  p_processor text,
  p_outcome text,
  p_evidence_reference text
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
  return kc_private.kc_record_data_export_processor_evidence(
    p_artifact_ref,
    p_expected_version,
    p_actor_id,
    p_processor,
    p_outcome,
    p_evidence_reference
  );
end;
$$;

create or replace function public.kc_link_verified_help_request_to_data_export(
  p_help_request_id uuid,
  p_account_email text,
  p_request_kind text,
  p_actor_id uuid,
  p_actor_session_id uuid,
  p_verification_channel text,
  p_attestation_sha256 text,
  p_verified_at timestamptz,
  p_processors jsonb default '[]'::jsonb
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
  return kc_private.kc_link_verified_help_request_to_data_export(
    p_help_request_id,
    p_account_email,
    p_request_kind,
    p_actor_id,
    p_verification_channel,
    p_attestation_sha256,
    p_verified_at,
    p_processors
  );
end;
$$;

create or replace function public.kc_recover_expired_data_export_artifact(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid,
  p_actor_session_id uuid,
  p_ttl_seconds integer default 604800
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
  return kc_private.kc_recover_expired_data_export_artifact(
    p_artifact_ref,
    p_expected_version,
    p_actor_id,
    p_ttl_seconds
  );
end;
$$;

create or replace function public.kc_claim_data_export_artifact(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid,
  p_actor_session_id uuid,
  p_lease_seconds integer default 900
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_claim_version bigint;
begin
  perform kc_private.kc_assert_active_data_export_admin_session(
    p_actor_id,
    p_actor_session_id
  );
  v_result := kc_private.kc_claim_data_export_artifact(
    p_artifact_ref,
    p_expected_version,
    p_actor_id,
    p_lease_seconds
  );
  v_claim_version := (v_result ->> 'version')::bigint;

  update kc_private.data_export_artifacts artifact_row
  set
    claimed_session_id = p_actor_session_id,
    updated_at = now()
  where artifact_row.artifact_ref = p_artifact_ref
    and artifact_row.status = 'claimed'
    and artifact_row.claimed_by = p_actor_id
    and artifact_row.row_version = v_claim_version;
  if not found then
    raise exception using
      errcode = '40001',
      message = 'EXPORT_ARTIFACT_CLAIM_CONFLICT';
  end if;
  return v_result;
end;
$$;

-- CONTRACT DEFERRED: expand-only compatibility for the previous Edge
-- deployment. Each actor-only wrapper requires exactly one active session and
-- delegates to the session-bound signature. Remove these overloads in a later
-- contract migration after deployment convergence has been verified.
create or replace function public.kc_admin_read_data_export_artifact(
  p_help_request_id uuid,
  p_artifact_ref text,
  p_actor_id uuid
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
  v_session_id :=
    kc_private.kc_resolve_legacy_data_export_admin_session(p_actor_id);
  return public.kc_admin_read_data_export_artifact(
    p_help_request_id,
    p_artifact_ref,
    p_actor_id,
    v_session_id
  );
end;
$$;

create or replace function public.kc_record_data_export_processor_evidence(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid,
  p_processor text,
  p_outcome text,
  p_evidence_reference text
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
  v_session_id :=
    kc_private.kc_resolve_legacy_data_export_admin_session(p_actor_id);
  return public.kc_record_data_export_processor_evidence(
    p_artifact_ref,
    p_expected_version,
    p_actor_id,
    v_session_id,
    p_processor,
    p_outcome,
    p_evidence_reference
  );
end;
$$;

create or replace function public.kc_link_verified_help_request_to_data_export(
  p_help_request_id uuid,
  p_account_email text,
  p_request_kind text,
  p_actor_id uuid,
  p_verification_channel text,
  p_attestation_sha256 text,
  p_verified_at timestamptz,
  p_processors jsonb default '[]'::jsonb
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
  v_session_id :=
    kc_private.kc_resolve_legacy_data_export_admin_session(p_actor_id);
  return public.kc_link_verified_help_request_to_data_export(
    p_help_request_id,
    p_account_email,
    p_request_kind,
    p_actor_id,
    v_session_id,
    p_verification_channel,
    p_attestation_sha256,
    p_verified_at,
    p_processors
  );
end;
$$;

create or replace function public.kc_recover_expired_data_export_artifact(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid,
  p_ttl_seconds integer default 604800
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
  v_session_id :=
    kc_private.kc_resolve_legacy_data_export_admin_session(p_actor_id);
  return public.kc_recover_expired_data_export_artifact(
    p_artifact_ref,
    p_expected_version,
    p_actor_id,
    v_session_id,
    p_ttl_seconds
  );
end;
$$;

create or replace function public.kc_claim_data_export_artifact(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid,
  p_lease_seconds integer default 900
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
  v_session_id :=
    kc_private.kc_resolve_legacy_data_export_admin_session(p_actor_id);
  return public.kc_claim_data_export_artifact(
    p_artifact_ref,
    p_expected_version,
    p_actor_id,
    v_session_id,
    p_lease_seconds
  );
end;
$$;

comment on function public.kc_admin_read_data_export_artifact(
  uuid, text, uuid
) is
  'CONTRACT DEFERRED: actor-only Edge compatibility; requires exactly one active non-expired administrator session.';
comment on function public.kc_record_data_export_processor_evidence(
  text, bigint, uuid, text, text, text
) is
  'CONTRACT DEFERRED: actor-only Edge compatibility; requires exactly one active non-expired administrator session.';
comment on function public.kc_link_verified_help_request_to_data_export(
  uuid, text, text, uuid, text, text, timestamptz, jsonb
) is
  'CONTRACT DEFERRED: actor-only Edge compatibility; requires exactly one active non-expired administrator session.';
comment on function public.kc_recover_expired_data_export_artifact(
  text, bigint, uuid, integer
) is
  'CONTRACT DEFERRED: actor-only Edge compatibility; requires exactly one active non-expired administrator session.';
comment on function public.kc_claim_data_export_artifact(
  text, bigint, uuid, integer
) is
  'CONTRACT DEFERRED: actor-only Edge compatibility; requires exactly one active non-expired administrator session.';

-- A pre-expand claim can have claimed_session_id null. Its first continuation
-- may bind exactly one active session, but only under the same artifact
-- version/token/status/lease CAS that authorizes the private worker. New claims
-- already carry the exact JWT session supplied by the Edge Function.
create or replace function kc_private.kc_bind_or_assert_data_export_claim_session(
  p_artifact_ref text,
  p_expected_version bigint,
  p_claim_token text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_actor_session_id uuid;
  v_claim_token_hash text;
  v_claim_expires_at timestamptz;
  v_row_version bigint;
  v_status text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'SERVICE_ROLE_REQUIRED';
  end if;

  if p_expected_version is null
     or p_claim_token !~ '^[a-f0-9]{64}$' then
    raise exception using
      errcode = '40001',
      message = 'EXPORT_ARTIFACT_CLAIM_CONFLICT';
  end if;

  select
    artifact_row.claimed_by,
    artifact_row.claimed_session_id,
    artifact_row.claim_token_hash,
    artifact_row.claim_expires_at,
    artifact_row.row_version,
    artifact_row.status
    into
      v_actor_id,
      v_actor_session_id,
      v_claim_token_hash,
      v_claim_expires_at,
      v_row_version,
      v_status
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;

  if v_row_version <> p_expected_version
     or v_status <> 'claimed'
     or v_claim_expires_at is null
     or v_claim_expires_at <= pg_catalog.clock_timestamp()
     or v_claim_token_hash is distinct from encode(
       extensions.digest(convert_to(p_claim_token, 'UTF8'), 'sha256'),
       'hex'
     ) then
    raise exception using
      errcode = '40001',
      message = 'EXPORT_ARTIFACT_CLAIM_CONFLICT';
  end if;

  if v_actor_session_id is null then
    v_actor_session_id :=
      kc_private.kc_resolve_legacy_data_export_admin_session(v_actor_id);

    update kc_private.data_export_artifacts artifact_row
    set claimed_session_id = v_actor_session_id
    where artifact_row.artifact_ref = p_artifact_ref
      and artifact_row.row_version = p_expected_version
      and artifact_row.status = 'claimed'
      and artifact_row.claimed_by = v_actor_id
      and artifact_row.claimed_session_id is null
      and artifact_row.claim_expires_at > pg_catalog.clock_timestamp()
      and artifact_row.claim_token_hash = encode(
        extensions.digest(convert_to(p_claim_token, 'UTF8'), 'sha256'),
        'hex'
      );
    if not found then
      raise exception using
        errcode = '40001',
        message = 'EXPORT_ARTIFACT_CLAIM_CONFLICT';
    end if;
  end if;

  perform kc_private.kc_assert_active_data_export_admin_session(
    v_actor_id,
    v_actor_session_id
  );
end;
$$;

revoke all on function
  kc_private.kc_bind_or_assert_data_export_claim_session(text, bigint, text)
  from public, anon, authenticated, service_role;

-- Every token-bound continuation checks the session stored by the claim. The
-- share locks prevent session revocation/admin demotion from committing in
-- the middle of the corresponding database mutation.
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

create or replace function public.kc_authorize_data_export_artifact_upload(
  p_artifact_ref text,
  p_expected_version bigint,
  p_claim_token text,
  p_lease_seconds integer default 1800
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform kc_private.kc_bind_or_assert_data_export_claim_session(
    p_artifact_ref,
    p_expected_version,
    p_claim_token
  );
  return kc_private.kc_authorize_data_export_artifact_upload(
    p_artifact_ref,
    p_expected_version,
    p_claim_token,
    p_lease_seconds
  );
end;
$$;

create or replace function public.kc_finalize_data_export_artifact(
  p_artifact_ref text,
  p_expected_version bigint,
  p_claim_token text,
  p_sha256 text,
  p_byte_size bigint,
  p_manifest jsonb,
  p_ttl_seconds integer default 604800
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform kc_private.kc_bind_or_assert_data_export_claim_session(
    p_artifact_ref,
    p_expected_version,
    p_claim_token
  );
  return kc_private.kc_finalize_data_export_artifact(
    p_artifact_ref,
    p_expected_version,
    p_claim_token,
    p_sha256,
    p_byte_size,
    p_manifest,
    p_ttl_seconds
  );
end;
$$;

create or replace function public.kc_fail_data_export_artifact(
  p_artifact_ref text,
  p_expected_version bigint,
  p_claim_token text,
  p_error_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- Abandonment is intentionally session-independent: after logout or admin
  -- demotion the claim token plus row-version CAS may only move the artifact
  -- to failed. It cannot authorize content, upload, finalize, or purge.
  return kc_private.kc_fail_data_export_artifact(
    p_artifact_ref,
    p_expected_version,
    p_claim_token,
    p_error_code
  );
end;
$$;

-- Machine retention is deliberately represented by actor/session both null.
-- Interactive admin purges use the overloads below and remain session-bound.
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
begin
  if p_actor_id is not null then
    raise exception using
      errcode = '22023',
      message = 'EXPORT_ADMIN_SESSION_REQUIRED';
  end if;
  return kc_private.kc_claim_expired_data_export_artifacts(p_limit, null);
end;
$$;

create or replace function public.kc_claim_expired_data_export_artifacts(
  p_limit integer,
  p_actor_id uuid,
  p_actor_session_id uuid
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
  return kc_private.kc_claim_expired_data_export_artifacts(
    p_limit,
    p_actor_id
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
begin
  if p_actor_id is not null then
    raise exception using
      errcode = '22023',
      message = 'EXPORT_ADMIN_SESSION_REQUIRED';
  end if;
  return kc_private.kc_claim_data_export_artifact_purge(
    p_artifact_ref,
    p_expected_version,
    null
  );
end;
$$;

create or replace function public.kc_claim_data_export_artifact_purge(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid,
  p_actor_session_id uuid
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
  return kc_private.kc_claim_data_export_artifact_purge(
    p_artifact_ref,
    p_expected_version,
    p_actor_id
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
begin
  if p_actor_id is not null then
    raise exception using
      errcode = '22023',
      message = 'EXPORT_ADMIN_SESSION_REQUIRED';
  end if;
  return kc_private.kc_purge_data_export_artifact(
    p_artifact_ref,
    p_expected_version,
    null
  );
end;
$$;

create or replace function public.kc_purge_data_export_artifact(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid,
  p_actor_session_id uuid
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
  return kc_private.kc_purge_data_export_artifact(
    p_artifact_ref,
    p_expected_version,
    p_actor_id
  );
end;
$$;

-- The owner-executed public wrappers above are the only service-role surface.
-- Direct execution of their legacy private workers is removed to prevent a
-- caller from bypassing session validation.
revoke all on function
  kc_private.kc_admin_read_data_export_artifact(uuid, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function
  kc_private.kc_record_data_export_processor_evidence(
    text, bigint, uuid, text, text, text
  )
  from public, anon, authenticated, service_role;
revoke all on function
  kc_private.kc_link_verified_help_request_to_data_export(
    uuid, text, text, uuid, text, text, timestamptz, jsonb
  )
  from public, anon, authenticated, service_role;
revoke all on function
  kc_private.kc_recover_expired_data_export_artifact(
    text, bigint, uuid, integer
  )
  from public, anon, authenticated, service_role;
revoke all on function
  kc_private.kc_claim_data_export_artifact(text, bigint, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function
  kc_private.kc_store_data_export_media_refs(text, bigint, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  kc_private.kc_authorize_data_export_artifact_upload(
    text, bigint, text, integer
  )
  from public, anon, authenticated, service_role;
revoke all on function
  kc_private.kc_finalize_data_export_artifact(
    text, bigint, text, text, bigint, jsonb, integer
  )
  from public, anon, authenticated, service_role;
revoke all on function
  kc_private.kc_fail_data_export_artifact(text, bigint, text, text)
  from public, anon, authenticated, service_role;
revoke all on function
  kc_private.kc_claim_expired_data_export_artifacts(integer, uuid)
  from public, anon, authenticated, service_role;
revoke all on function
  kc_private.kc_claim_data_export_artifact_purge(text, bigint, uuid)
  from public, anon, authenticated, service_role;
revoke all on function
  kc_private.kc_purge_data_export_artifact(text, bigint, uuid)
  from public, anon, authenticated, service_role;

revoke all on function
  public.kc_admin_read_data_export_artifact(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function
  public.kc_admin_read_data_export_artifact(uuid, text, uuid)
  to service_role;
revoke all on function
  public.kc_record_data_export_processor_evidence(
    text, bigint, uuid, text, text, text
  )
  from public, anon, authenticated;
grant execute on function
  public.kc_record_data_export_processor_evidence(
    text, bigint, uuid, text, text, text
  )
  to service_role;
revoke all on function
  public.kc_link_verified_help_request_to_data_export(
    uuid, text, text, uuid, text, text, timestamptz, jsonb
  )
  from public, anon, authenticated;
grant execute on function
  public.kc_link_verified_help_request_to_data_export(
    uuid, text, text, uuid, text, text, timestamptz, jsonb
  )
  to service_role;
revoke all on function
  public.kc_recover_expired_data_export_artifact(
    text, bigint, uuid, integer
  )
  from public, anon, authenticated;
grant execute on function
  public.kc_recover_expired_data_export_artifact(
    text, bigint, uuid, integer
  )
  to service_role;
revoke all on function
  public.kc_claim_data_export_artifact(text, bigint, uuid, integer)
  from public, anon, authenticated;
grant execute on function
  public.kc_claim_data_export_artifact(text, bigint, uuid, integer)
  to service_role;

revoke all on function
  public.kc_admin_read_data_export_artifact(uuid, text, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_admin_read_data_export_artifact(uuid, text, uuid, uuid)
  to service_role;
revoke all on function
  public.kc_record_data_export_processor_evidence(
    text, bigint, uuid, uuid, text, text, text
  )
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_record_data_export_processor_evidence(
    text, bigint, uuid, uuid, text, text, text
  )
  to service_role;
revoke all on function
  public.kc_link_verified_help_request_to_data_export(
    uuid, text, text, uuid, uuid, text, text, timestamptz, jsonb
  )
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_link_verified_help_request_to_data_export(
    uuid, text, text, uuid, uuid, text, text, timestamptz, jsonb
  )
  to service_role;
revoke all on function
  public.kc_recover_expired_data_export_artifact(
    text, bigint, uuid, uuid, integer
  )
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_recover_expired_data_export_artifact(
    text, bigint, uuid, uuid, integer
  )
  to service_role;
revoke all on function
  public.kc_claim_data_export_artifact(text, bigint, uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_claim_data_export_artifact(text, bigint, uuid, uuid, integer)
  to service_role;

revoke all on function
  public.kc_store_data_export_media_refs(text, bigint, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_store_data_export_media_refs(text, bigint, text, jsonb)
  to service_role;
revoke all on function
  public.kc_authorize_data_export_artifact_upload(
    text, bigint, text, integer
  )
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_authorize_data_export_artifact_upload(
    text, bigint, text, integer
  )
  to service_role;
revoke all on function
  public.kc_finalize_data_export_artifact(
    text, bigint, text, text, bigint, jsonb, integer
  )
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_finalize_data_export_artifact(
    text, bigint, text, text, bigint, jsonb, integer
  )
  to service_role;
revoke all on function
  public.kc_fail_data_export_artifact(text, bigint, text, text)
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_fail_data_export_artifact(text, bigint, text, text)
  to service_role;

revoke all on function
  public.kc_claim_expired_data_export_artifacts(integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_claim_expired_data_export_artifacts(integer, uuid)
  to service_role;
revoke all on function
  public.kc_claim_expired_data_export_artifacts(integer, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_claim_expired_data_export_artifacts(integer, uuid, uuid)
  to service_role;
revoke all on function
  public.kc_claim_data_export_artifact_purge(text, bigint, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_claim_data_export_artifact_purge(text, bigint, uuid)
  to service_role;
revoke all on function
  public.kc_claim_data_export_artifact_purge(text, bigint, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_claim_data_export_artifact_purge(text, bigint, uuid, uuid)
  to service_role;
revoke all on function
  public.kc_purge_data_export_artifact(text, bigint, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_purge_data_export_artifact(text, bigint, uuid)
  to service_role;
revoke all on function
  public.kc_purge_data_export_artifact(text, bigint, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_purge_data_export_artifact(text, bigint, uuid, uuid)
  to service_role;

comment on function public.kc_claim_data_export_artifact(
  text, bigint, uuid, uuid, integer
) is
  'Claims an assisted export for one active admin session and persists that session on the lease.';
comment on function public.kc_fail_data_export_artifact(
  text, bigint, text, text
) is
  'Abandonment-only cleanup: service_role may use claim token plus row-version CAS after session revocation; never authorizes export content, upload, finalize, or purge.';

notify pgrst, 'reload schema';

commit;

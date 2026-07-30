-- ============================================================================
-- KinoCampus - EXPAND: Turnstile-protected guest privacy Help gateway
-- ============================================================================
-- Safe rollout order:
--   1. apply this EXPAND migration;
--   2. configure and deploy kc-create-privacy-help-guest;
--   3. release the frontend caller and complete a production canary;
--   4. only then promote the pending CONTRACT template with a fresh timestamp.
--
-- This step intentionally preserves anon EXECUTE on the existing privacy RPC
-- so older frontend assets keep working during cache propagation. The new
-- bridge itself is service-role-only from its first transaction.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.kc_create_privacy_help_guest_v1(
  p_payload jsonb
)
returns table (
  out_id uuid,
  out_created_at timestamptz,
  out_notification_claim text,
  out_notification_claim_expires_at timestamptz,
  out_data_subject_request jsonb,
  out_protocol text,
  out_reused_existing boolean,
  out_idempotency_replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_original_jwt_claims text;
  v_guest_payload jsonb;
  v_created record;
begin
  if coalesce(auth.jwt() ->> 'role', auth.role(), '') <>
      'service_role' then
    raise exception using
      errcode = '42501',
      message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_payload is null
     or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'HELP_IDEMPOTENCY_PAYLOAD_INVALID';
  end if;

  -- The Edge Function is not an identity provider. Force the database worker
  -- into its unowned guest branch even if a malicious body supplies account
  -- expectations. The challenge token never enters p_payload or PostgreSQL.
  v_guest_payload :=
    (p_payload - 'expected_user_id')
    || pg_catalog.jsonb_build_object(
      'expected_auth_state',
      'anonymous'
    );
  v_original_jwt_claims := coalesce(
    nullif(
      pg_catalog.current_setting('request.jwt.claims', true),
      ''
    ),
    '{}'
  );
  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"anon"}',
    true
  );

  begin
    select *
      into strict v_created
    from kc_private.kc_create_privacy_help_request_v1(
      v_guest_payload
    );
  exception
    when others then
      perform pg_catalog.set_config(
        'request.jwt.claims',
        v_original_jwt_claims,
        true
      );
      raise;
  end;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    v_original_jwt_claims,
    true
  );

  if v_created.out_notification_claim is not null
     or v_created.out_notification_claim_expires_at is not null
     or v_created.out_data_subject_request is not null
     or v_created.out_protocol is not null then
    raise exception using
      errcode = '55000',
      message = 'HELP_GUEST_RESPONSE_INTEGRITY_ERROR';
  end if;

  out_id := v_created.out_id;
  out_created_at := v_created.out_created_at;
  out_notification_claim := null;
  out_notification_claim_expires_at := null;
  out_data_subject_request := null;
  out_protocol := null;
  out_reused_existing := v_created.out_reused_existing;
  out_idempotency_replayed := v_created.out_idempotency_replayed;
  return next;
end;
$$;

revoke all on function
  public.kc_create_privacy_help_guest_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.kc_create_privacy_help_guest_v1(jsonb)
  to service_role;

comment on function
  public.kc_create_privacy_help_guest_v1(jsonb) is
  'EXPAND bridge restricted to service_role for the Turnstile-validated Edge gateway. Forces an unowned guest Help and never accepts browser identity or returns a notification claim/DSR.';

-- Executable rollout assertions: the bridge is closed to browser roles while
-- the old anon path remains available until the separate CONTRACT migration.
do $migration$
declare
  v_bridge_hardened boolean;
begin
  select
    procedure_row.prosecdef
      and procedure_row.proconfig @> array['search_path=""']
    into v_bridge_hardened
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid =
    'public.kc_create_privacy_help_guest_v1(jsonb)'::regprocedure;

  if not coalesce(v_bridge_hardened, false)
     or pg_catalog.has_function_privilege(
       'anon',
       'public.kc_create_privacy_help_guest_v1(jsonb)',
       'execute'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.kc_create_privacy_help_guest_v1(jsonb)',
       'execute'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.kc_create_privacy_help_guest_v1(jsonb)',
       'execute'
     ) then
    raise exception using
      errcode = '55000',
      message = 'HELP_GUEST_GATEWAY_EXPAND_ACL_INVALID';
  end if;

  if not pg_catalog.has_function_privilege(
    'anon',
    'public.kc_create_privacy_help_request_v1(jsonb)',
    'execute'
  ) then
    raise exception using
      errcode = '55000',
      message = 'HELP_GUEST_GATEWAY_EXPAND_BROKE_LEGACY_CANARY';
  end if;
end;
$migration$;

notify pgrst, 'reload schema';

commit;

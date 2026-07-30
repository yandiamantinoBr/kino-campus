-- ============================================================================
-- KinoCampus - CONTRACT: close direct guest privacy Help creation
-- ============================================================================
-- DO NOT APPLY WITH THE EXPAND RELEASE.
--
-- Operational prerequisite: apply only after all of the following are true:
--   * 20260729203000_help_privacy_guest_gateway_expand.sql is in production;
--   * kc-create-privacy-help-guest is configured and ACTIVE;
--   * the frontend Turnstile path passed its production canary;
--   * old cached frontend assets have crossed the documented compatibility
--     window or are otherwise prevented from submitting the privacy route.
--
-- This migration is intentionally separate so rollout can be reversed before
-- closing the old path. Once applied, plain PostgREST anon cannot bypass the
-- server-side challenge. Authenticated and service-role callers remain intact.
-- At promotion time, rename this template with a fresh 14-digit timestamp that
-- is later than every migration already present remotely. Never reuse the
-- template's creation time as migration history.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $migration$
begin
  if pg_catalog.to_regprocedure(
    'public.kc_create_privacy_help_guest_v1(jsonb)'
  ) is null
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.kc_create_privacy_help_guest_v1(jsonb)',
       'execute'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'public.kc_create_privacy_help_guest_v1(jsonb)',
       'execute'
     )
     or not pg_catalog.has_function_privilege(
       'anon',
       'public.kc_create_privacy_help_request_v1(jsonb)',
       'execute'
     ) then
    raise exception using
      errcode = '55000',
      message = 'HELP_GUEST_GATEWAY_CONTRACT_PRECONDITION_FAILED';
  end if;
end;
$migration$;

revoke execute on function
  public.kc_create_privacy_help_request_v1(jsonb)
  from public, anon;
grant execute on function
  public.kc_create_privacy_help_request_v1(jsonb)
  to authenticated, service_role;

comment on function
  public.kc_create_privacy_help_request_v1(jsonb) is
  'CONTRACT: privacy create RPC for the authenticated database role. Supabase Anonymous Auth remains disabled and is rejected by the global active-session pre-request; plain PostgREST anon is closed and browser guests must pass Turnstile through kc-create-privacy-help-guest.';

do $migration$
begin
  if pg_catalog.has_function_privilege(
    'anon',
    'public.kc_create_privacy_help_request_v1(jsonb)',
    'execute'
  )
     or not pg_catalog.has_function_privilege(
       'authenticated',
       'public.kc_create_privacy_help_request_v1(jsonb)',
       'execute'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.kc_create_privacy_help_request_v1(jsonb)',
       'execute'
     )
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
      message = 'HELP_GUEST_GATEWAY_CONTRACT_ACL_INVALID';
  end if;
end;
$migration$;

notify pgrst, 'reload schema';

commit;

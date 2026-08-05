-- 20260805120000_security_definer_advisor_invoker_wrappers.sql
-- KinoCampus -- clear Supabase Security Advisor WARNs 0028/0029 for intentional RPCs
--
-- Context (export: Supabase Performance Security Lints wacyrkwhkvzwkqpolrbg, 34 WARNs):
--   * anon_security_definer_function_executable (13)
--   * authenticated_security_definer_function_executable (21)
--
-- Cause: public SECURITY DEFINER functions with EXECUTE for anon/authenticated are
-- always flagged by the advisor, even when the privilege elevation is intentional.
--
-- Fix pattern (already used for analytics / chat / admin_save_banner):
--   1. Move the privileged body to kc_private as *_impl (SECURITY DEFINER)
--   2. Keep a public SECURITY INVOKER thin wrapper with the original name/signature
--   3. GRANT EXECUTE on the private impl only to the roles that call the wrapper
--
-- PostgREST does not expose kc_private, so private DEFINER workers are not REST RPCs.
-- Client contracts (RPC names, args, return shapes) stay unchanged.
--
-- Help/privacy entrypoints already had private workers; public facades are switched
-- from DEFINER to INVOKER and private EXECUTE is opened for the API roles that need them.

begin;

create schema if not exists kc_private;
revoke all on schema kc_private from public;
grant usage on schema kc_private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Helpers: rename public DEFINER body into kc_private and leave a public INVOKER
-- ---------------------------------------------------------------------------

-- Fail closed if any expected public entrypoint is missing or a private impl
-- already exists (prevents partial re-apply / drift).
do $$
declare
  missing text[] := array[]::text[];
  collision text[] := array[]::text[];
  required_public text[] := array[
    'public.kc_check_post_limit(uuid,text)',
    'public.kc_admin_list_banners()',
    'public.kc_admin_banner_audit(uuid)',
    'public.kc_get_user_rating_summary(uuid)',
    'public.kc_get_user_rating_state(uuid,uuid)',
    'public.kc_get_profile_access_state(uuid)',
    'public.kc_home_category_post_counts()',
    'public.kc_track_coupon_click(uuid)',
    'public.kc_track_share(uuid)',
    'public.kc_track_home_category_affinity(text,jsonb)',
    'public.kc_list_home_category_affinity(text,integer,integer)',
    'public.kc_merge_home_category_affinity(text)',
    'public.kc_mark_invite_used()',
    'public.kc_is_admin(uuid)',
    'public.kc_is_operator(uuid)',
    'public.kc_enforce_active_session_pre_request()',
    'public.kc_create_help_request(jsonb)',
    'public.kc_create_help_request_with_notification_claim(jsonb)',
    'public.kc_create_help_request_with_notification_claim_v2(jsonb)',
    'public.kc_create_privacy_help_request_v1(jsonb)',
    'public.kc_recover_privacy_help_request_v1(jsonb)'
  ];
  required_private_absent text[] := array[
    'kc_private.kc_check_post_limit_impl(uuid,text)',
    'kc_private.kc_admin_list_banners_impl()',
    'kc_private.kc_admin_banner_audit_impl(uuid)',
    'kc_private.kc_get_user_rating_summary_impl(uuid)',
    'kc_private.kc_get_user_rating_state_impl(uuid,uuid)',
    'kc_private.kc_get_profile_access_state_impl(uuid)',
    'kc_private.kc_home_category_post_counts_impl()',
    'kc_private.kc_track_coupon_click_impl(uuid)',
    'kc_private.kc_track_share_impl(uuid)',
    'kc_private.kc_track_home_category_affinity_impl(text,jsonb)',
    'kc_private.kc_list_home_category_affinity_impl(text,integer,integer)',
    'kc_private.kc_merge_home_category_affinity_impl(text)',
    'kc_private.kc_mark_invite_used_impl()',
    'kc_private.kc_is_admin_impl(uuid)',
    'kc_private.kc_is_operator_impl(uuid)',
    'kc_private.kc_enforce_active_session_pre_request_impl()'
  ];
  sig text;
begin
  foreach sig in array required_public loop
    if to_regprocedure(sig) is null then
      missing := array_append(missing, sig);
    end if;
  end loop;

  foreach sig in array required_private_absent loop
    if to_regprocedure(sig) is not null then
      collision := array_append(collision, sig);
    end if;
  end loop;

  if cardinality(missing) > 0 then
    raise exception
      'security-definer invoker migration missing public RPCs: %',
      array_to_string(missing, ', ');
  end if;

  if cardinality(collision) > 0 then
    raise exception
      'security-definer invoker migration private impl already exists: %',
      array_to_string(collision, ', ');
  end if;
end;
$$;

-- ---- move privileged bodies ------------------------------------------------

alter function public.kc_check_post_limit(uuid, text)
  rename to kc_check_post_limit_impl;
alter function public.kc_check_post_limit_impl(uuid, text)
  set schema kc_private;

alter function public.kc_admin_list_banners()
  rename to kc_admin_list_banners_impl;
alter function public.kc_admin_list_banners_impl()
  set schema kc_private;

alter function public.kc_admin_banner_audit(uuid)
  rename to kc_admin_banner_audit_impl;
alter function public.kc_admin_banner_audit_impl(uuid)
  set schema kc_private;

alter function public.kc_get_user_rating_summary(uuid)
  rename to kc_get_user_rating_summary_impl;
alter function public.kc_get_user_rating_summary_impl(uuid)
  set schema kc_private;

alter function public.kc_get_user_rating_state(uuid, uuid)
  rename to kc_get_user_rating_state_impl;
alter function public.kc_get_user_rating_state_impl(uuid, uuid)
  set schema kc_private;

alter function public.kc_get_profile_access_state(uuid)
  rename to kc_get_profile_access_state_impl;
alter function public.kc_get_profile_access_state_impl(uuid)
  set schema kc_private;

alter function public.kc_home_category_post_counts()
  rename to kc_home_category_post_counts_impl;
alter function public.kc_home_category_post_counts_impl()
  set schema kc_private;

alter function public.kc_track_coupon_click(uuid)
  rename to kc_track_coupon_click_impl;
alter function public.kc_track_coupon_click_impl(uuid)
  set schema kc_private;

alter function public.kc_track_share(uuid)
  rename to kc_track_share_impl;
alter function public.kc_track_share_impl(uuid)
  set schema kc_private;

alter function public.kc_track_home_category_affinity(text, jsonb)
  rename to kc_track_home_category_affinity_impl;
alter function public.kc_track_home_category_affinity_impl(text, jsonb)
  set schema kc_private;

alter function public.kc_list_home_category_affinity(text, integer, integer)
  rename to kc_list_home_category_affinity_impl;
alter function public.kc_list_home_category_affinity_impl(text, integer, integer)
  set schema kc_private;

alter function public.kc_merge_home_category_affinity(text)
  rename to kc_merge_home_category_affinity_impl;
alter function public.kc_merge_home_category_affinity_impl(text)
  set schema kc_private;

alter function public.kc_mark_invite_used()
  rename to kc_mark_invite_used_impl;
alter function public.kc_mark_invite_used_impl()
  set schema kc_private;

-- Operator first: is_admin body may still call public.kc_is_operator during
-- the brief window after rename; recreate public wrappers immediately after.
alter function public.kc_is_operator(uuid)
  rename to kc_is_operator_impl;
alter function public.kc_is_operator_impl(uuid)
  set schema kc_private;

alter function public.kc_is_admin(uuid)
  rename to kc_is_admin_impl;
alter function public.kc_is_admin_impl(uuid)
  set schema kc_private;

alter function public.kc_enforce_active_session_pre_request()
  rename to kc_enforce_active_session_pre_request_impl;
alter function public.kc_enforce_active_session_pre_request_impl()
  set schema kc_private;

-- Point the admin helper at the private operator impl so the body no longer
-- depends on the public INVOKER facade (which does not exist yet at rename time
-- and would add a needless hop later).
create or replace function kc_private.kc_is_admin_impl(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
begin
  if v_role <> 'service_role'
     and (
       v_actor_id is null
       or p_user_id is distinct from v_actor_id
     ) then
    return false;
  end if;

  return coalesce(
    (
      select profile_row.is_admin
      from public.profiles as profile_row
      where profile_row.id = p_user_id
    ),
    false
  )
  or kc_private.kc_is_operator_impl(p_user_id);
end;
$$;

-- ---- public INVOKER wrappers (stable client contracts) ---------------------

create function public.kc_is_operator(p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select kc_private.kc_is_operator_impl(p_user_id);
$$;

create function public.kc_is_admin(p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select kc_private.kc_is_admin_impl(p_user_id);
$$;

create function public.kc_check_post_limit(
  p_user_id uuid,
  p_module text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select kc_private.kc_check_post_limit_impl(p_user_id, p_module);
$$;

create function public.kc_admin_list_banners()
returns setof public.hero_banners
language sql
stable
security invoker
set search_path = ''
as $$
  select * from kc_private.kc_admin_list_banners_impl();
$$;

create function public.kc_admin_banner_audit(p_banner_id uuid)
returns table (
  id bigint,
  action text,
  changed_at timestamptz,
  editor_name text,
  snapshot jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_admin_banner_audit_impl(p_banner_id);
$$;

create function public.kc_get_user_rating_summary(p_target_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select kc_private.kc_get_user_rating_summary_impl(p_target_user_id);
$$;

create function public.kc_get_user_rating_state(
  p_target_user_id uuid,
  p_context_post_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select kc_private.kc_get_user_rating_state_impl(
    p_target_user_id,
    p_context_post_id
  );
$$;

create function public.kc_get_profile_access_state(p_profile_id uuid)
returns table (
  "exists" boolean,
  profile_public boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_get_profile_access_state_impl(p_profile_id);
$$;

create function public.kc_home_category_post_counts()
returns table (
  module_key text,
  category_key text,
  count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_home_category_post_counts_impl();
$$;

create function public.kc_track_coupon_click(p_post_id uuid)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_track_coupon_click_impl(p_post_id);
$$;

create function public.kc_track_share(p_post_id uuid)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_track_share_impl(p_post_id);
$$;

create function public.kc_track_home_category_affinity(
  p_session_id text default null,
  p_events jsonb default '[]'::jsonb
)
returns integer
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_track_home_category_affinity_impl(
    p_session_id,
    p_events
  );
$$;

create function public.kc_list_home_category_affinity(
  p_session_id text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  module_key text,
  category_key text,
  score numeric,
  interactions_count bigint,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_list_home_category_affinity_impl(
    p_session_id,
    p_limit,
    p_offset
  );
$$;

create function public.kc_merge_home_category_affinity(
  p_session_id text default null
)
returns integer
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_merge_home_category_affinity_impl(p_session_id);
$$;

create function public.kc_mark_invite_used()
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  perform kc_private.kc_mark_invite_used_impl();
end;
$$;

create function public.kc_enforce_active_session_pre_request()
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform kc_private.kc_enforce_active_session_pre_request_impl();
end;
$$;

-- ---- help/privacy public facades: DEFINER -> INVOKER ------------------------
-- Private workers already exist; only the public security mode changes.

create or replace function public.kc_create_help_request(
  p_payload jsonb
)
returns table (
  out_id uuid,
  out_created_at timestamptz
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if kc_private.kc_is_privacy_help_route_v1(p_payload) then
    raise exception using
      errcode = '22023',
      message = 'HELP_PRIVACY_IDEMPOTENT_RPC_REQUIRED';
  end if;
  return query
  select *
  from kc_private.kc_create_help_request(p_payload);
end;
$$;

create or replace function
  public.kc_create_help_request_with_notification_claim(
    p_payload jsonb
  )
returns table (
  out_id uuid,
  out_created_at timestamptz,
  out_notification_claim text,
  out_notification_claim_expires_at timestamptz
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if kc_private.kc_is_privacy_help_route_v1(p_payload) then
    raise exception using
      errcode = '22023',
      message = 'HELP_PRIVACY_IDEMPOTENT_RPC_REQUIRED';
  end if;
  return query
  select *
  from
    kc_private.kc_create_help_request_with_notification_claim(
      p_payload
    );
end;
$$;

create or replace function
  public.kc_create_help_request_with_notification_claim_v2(
    p_payload jsonb
  )
returns table (
  out_id uuid,
  out_created_at timestamptz,
  out_notification_claim text,
  out_notification_claim_expires_at timestamptz,
  out_data_subject_request jsonb,
  out_protocol text,
  out_reused_existing boolean
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if kc_private.kc_is_privacy_help_route_v1(p_payload) then
    raise exception using
      errcode = '22023',
      message = 'HELP_PRIVACY_IDEMPOTENT_RPC_REQUIRED';
  end if;
  return query
  select *
  from
    kc_private.kc_create_help_request_with_notification_claim_v2(
      p_payload
    );
end;
$$;

create or replace function
  public.kc_create_privacy_help_request_v1(
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
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_create_privacy_help_request_v1($1);
$$;

create or replace function
  public.kc_recover_privacy_help_request_v1(
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
  out_idempotency_replayed boolean,
  out_recovery_state text
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_recover_privacy_help_request_v1($1);
$$;

-- ---------------------------------------------------------------------------
-- Grants: public wrappers keep the product surface surface; private impls open only
-- to the roles that must execute the INVOKER wrapper.
-- ---------------------------------------------------------------------------

-- public wrappers
revoke all on function public.kc_is_admin(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_is_admin(uuid)
  to anon, authenticated, service_role;

revoke all on function public.kc_is_operator(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_is_operator(uuid)
  to anon, authenticated, service_role;

revoke all on function public.kc_check_post_limit(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_check_post_limit(uuid, text)
  to authenticated, service_role;

revoke all on function public.kc_admin_list_banners()
  from public, anon, authenticated, service_role;
grant execute on function public.kc_admin_list_banners()
  to authenticated, service_role;

revoke all on function public.kc_admin_banner_audit(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_admin_banner_audit(uuid)
  to authenticated, service_role;

revoke all on function public.kc_get_user_rating_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_get_user_rating_summary(uuid)
  to anon, authenticated, service_role;

revoke all on function public.kc_get_user_rating_state(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_get_user_rating_state(uuid, uuid)
  to authenticated, service_role;

revoke all on function public.kc_get_profile_access_state(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_get_profile_access_state(uuid)
  to anon, authenticated, service_role;

revoke all on function public.kc_home_category_post_counts()
  from public, anon, authenticated, service_role;
grant execute on function public.kc_home_category_post_counts()
  to anon, authenticated, service_role;

revoke all on function public.kc_track_coupon_click(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_track_coupon_click(uuid)
  to anon, authenticated, service_role;

revoke all on function public.kc_track_share(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_track_share(uuid)
  to anon, authenticated, service_role;

revoke all on function public.kc_track_home_category_affinity(text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_track_home_category_affinity(text, jsonb)
  to authenticated;

revoke all on function public.kc_list_home_category_affinity(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_list_home_category_affinity(text, integer, integer)
  to authenticated;

revoke all on function public.kc_merge_home_category_affinity(text)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_merge_home_category_affinity(text)
  to authenticated;

revoke all on function public.kc_mark_invite_used()
  from public, anon, authenticated, service_role;
grant execute on function public.kc_mark_invite_used()
  to authenticated, service_role;

revoke all on function public.kc_enforce_active_session_pre_request()
  from public, anon, authenticated, service_role, authenticator;
grant execute on function public.kc_enforce_active_session_pre_request()
  to anon, authenticated, service_role, authenticator;

revoke all on function public.kc_create_help_request(jsonb)
  from public;
grant execute on function public.kc_create_help_request(jsonb)
  to anon, authenticated, service_role;

revoke all on function
  public.kc_create_help_request_with_notification_claim(jsonb)
  from public;
grant execute on function
  public.kc_create_help_request_with_notification_claim(jsonb)
  to anon, authenticated, service_role;

revoke all on function
  public.kc_create_help_request_with_notification_claim_v2(jsonb)
  from public;
grant execute on function
  public.kc_create_help_request_with_notification_claim_v2(jsonb)
  to anon, authenticated, service_role;

revoke all on function public.kc_create_privacy_help_request_v1(jsonb)
  from public;
grant execute on function public.kc_create_privacy_help_request_v1(jsonb)
  to anon, authenticated, service_role;

revoke all on function public.kc_recover_privacy_help_request_v1(jsonb)
  from public;
grant execute on function public.kc_recover_privacy_help_request_v1(jsonb)
  to anon, authenticated, service_role;

-- private impls (INVOKER callers need EXECUTE)
revoke all on function kc_private.kc_is_admin_impl(uuid)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_is_admin_impl(uuid)
  to anon, authenticated, service_role;

revoke all on function kc_private.kc_is_operator_impl(uuid)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_is_operator_impl(uuid)
  to anon, authenticated, service_role;

revoke all on function kc_private.kc_check_post_limit_impl(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_check_post_limit_impl(uuid, text)
  to authenticated, service_role;

revoke all on function kc_private.kc_admin_list_banners_impl()
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_admin_list_banners_impl()
  to authenticated, service_role;

revoke all on function kc_private.kc_admin_banner_audit_impl(uuid)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_admin_banner_audit_impl(uuid)
  to authenticated, service_role;

revoke all on function kc_private.kc_get_user_rating_summary_impl(uuid)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_get_user_rating_summary_impl(uuid)
  to anon, authenticated, service_role;

revoke all on function kc_private.kc_get_user_rating_state_impl(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_get_user_rating_state_impl(uuid, uuid)
  to authenticated, service_role;

revoke all on function kc_private.kc_get_profile_access_state_impl(uuid)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_get_profile_access_state_impl(uuid)
  to anon, authenticated, service_role;

revoke all on function kc_private.kc_home_category_post_counts_impl()
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_home_category_post_counts_impl()
  to anon, authenticated, service_role;

revoke all on function kc_private.kc_track_coupon_click_impl(uuid)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_track_coupon_click_impl(uuid)
  to anon, authenticated, service_role;

revoke all on function kc_private.kc_track_share_impl(uuid)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_track_share_impl(uuid)
  to anon, authenticated, service_role;

revoke all on function
  kc_private.kc_track_home_category_affinity_impl(text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  kc_private.kc_track_home_category_affinity_impl(text, jsonb)
  to authenticated;

revoke all on function
  kc_private.kc_list_home_category_affinity_impl(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function
  kc_private.kc_list_home_category_affinity_impl(text, integer, integer)
  to authenticated;

revoke all on function
  kc_private.kc_merge_home_category_affinity_impl(text)
  from public, anon, authenticated, service_role;
grant execute on function
  kc_private.kc_merge_home_category_affinity_impl(text)
  to authenticated;

revoke all on function kc_private.kc_mark_invite_used_impl()
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_mark_invite_used_impl()
  to authenticated, service_role;

revoke all on function
  kc_private.kc_enforce_active_session_pre_request_impl()
  from public, anon, authenticated, service_role, authenticator;
grant execute on function
  kc_private.kc_enforce_active_session_pre_request_impl()
  to anon, authenticated, service_role, authenticator;

-- Help private workers: open EXECUTE for the roles that call the INVOKER wrappers
revoke all on function kc_private.kc_create_help_request(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_create_help_request(jsonb)
  to anon, authenticated, service_role;

revoke all on function
  kc_private.kc_create_help_request_with_notification_claim(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  kc_private.kc_create_help_request_with_notification_claim(jsonb)
  to anon, authenticated, service_role;

revoke all on function
  kc_private.kc_create_help_request_with_notification_claim_v2(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  kc_private.kc_create_help_request_with_notification_claim_v2(jsonb)
  to anon, authenticated, service_role;

revoke all on function
  kc_private.kc_create_privacy_help_request_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  kc_private.kc_create_privacy_help_request_v1(jsonb)
  to anon, authenticated, service_role;

revoke all on function
  kc_private.kc_recover_privacy_help_request_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  kc_private.kc_recover_privacy_help_request_v1(jsonb)
  to anon, authenticated, service_role;

-- Public facades still need the privacy-route helper for the guard branch.
-- Keep it non-executable by API roles if the helper is only used by owner
-- code paths inside other DEFINER workers... But public INVOKER help facades
-- call it directly, so grant EXECUTE to the same API roles.
do $$
begin
  if to_regprocedure('kc_private.kc_is_privacy_help_route_v1(jsonb)') is not null then
    execute $sql$
      revoke all on function kc_private.kc_is_privacy_help_route_v1(jsonb)
        from public, anon, authenticated, service_role
    $sql$;
    execute $sql$
      grant execute on function kc_private.kc_is_privacy_help_route_v1(jsonb)
        to anon, authenticated, service_role
    $sql$;
  end if;
end;
$$;

comment on function public.kc_is_admin(uuid) is
  'SECURITY INVOKER facade over kc_private.kc_is_admin_impl. Used by RLS and RPCs; private body remains SECURITY DEFINER with self-only probe guard.';
comment on function public.kc_is_operator(uuid) is
  'SECURITY INVOKER facade over kc_private.kc_is_operator_impl.';
comment on function public.kc_enforce_active_session_pre_request() is
  'PostgREST pre-request INVOKER facade. Emergency rollback: ALTER ROLE authenticator RESET pgrst.db_pre_request; NOTIFY pgrst, ''reload config''.';
comment on function public.kc_create_help_request(jsonb) is
  'SECURITY INVOKER facade for generic Help; privacy routes require kc_create_privacy_help_request_v1.';
comment on function public.kc_create_help_request_with_notification_claim(jsonb) is
  'SECURITY INVOKER facade for Help notification claims; privacy routes require kc_create_privacy_help_request_v1.';
comment on function public.kc_create_help_request_with_notification_claim_v2(jsonb) is
  'SECURITY INVOKER facade for Help v2; privacy routes require kc_create_privacy_help_request_v1.';
comment on function public.kc_create_privacy_help_request_v1(jsonb) is
  'SECURITY INVOKER facade for LGPD Help create/replay; body lives in kc_private.';
comment on function public.kc_recover_privacy_help_request_v1(jsonb) is
  'SECURITY INVOKER facade for LGPD Help recovery; body lives in kc_private.';

-- Keep PostgREST pre-request wired after the rename/recreate.
alter role authenticator
  set pgrst.db_pre_request = 'public.kc_enforce_active_session_pre_request';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';

commit;

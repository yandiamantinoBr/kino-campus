begin;

-- ---------------------------------------------------------------------------
-- profiles: table-level grants override column-level restrictions. Remove the
-- broad ACL and rebuild only the access required by the current application.
-- E-mail remains server/admin-only and anonymous users receive no DML grants.
--
-- The existing row visibility policies are intentionally preserved here. A
-- separate migration is required to replace the broad authenticated SELECT
-- policy after every owner/public/admin consumer has moved to sanitized RPCs.
-- ---------------------------------------------------------------------------

revoke all on table public.profiles from anon, authenticated;

grant select (
  id,
  display_name,
  full_name,
  avatar_url,
  bio,
  verified,
  rating_avg,
  rating_count,
  created_at,
  updated_at,
  onboarding_completed_at,
  affiliation,
  gender_identity,
  gender_identity_custom,
  race_color,
  profile_public,
  contact_primary_method,
  contact_cta_enabled,
  social_links,
  social_visibility
) on table public.profiles to anon;

grant select (
  id,
  display_name,
  full_name,
  avatar_url,
  avatar_path,
  bio,
  verified,
  is_admin,
  rating_avg,
  rating_count,
  created_at,
  updated_at,
  onboarding_completed_at,
  affiliation,
  gender_identity,
  gender_identity_custom,
  race_color,
  profile_public,
  contact_primary_method,
  contact_cta_enabled,
  social_links,
  social_visibility
) on table public.profiles to authenticated;

grant insert (
  id,
  display_name,
  full_name,
  avatar_url,
  avatar_path,
  bio,
  onboarding_completed_at,
  affiliation,
  gender_identity,
  gender_identity_custom,
  race_color,
  profile_public,
  contact_primary_method,
  contact_cta_enabled,
  social_links,
  social_visibility
) on table public.profiles to authenticated;

-- PostgREST upserts include the conflict key in the generated UPDATE statement,
-- so id must remain grantable. RLS USING/WITH CHECK still pins the row to
-- auth.uid() and prevents changing ownership.
grant update (
  id,
  display_name,
  full_name,
  avatar_url,
  avatar_path,
  bio,
  onboarding_completed_at,
  affiliation,
  gender_identity,
  gender_identity_custom,
  race_color,
  profile_public,
  contact_primary_method,
  contact_cta_enabled,
  social_links,
  social_visibility
) on table public.profiles to authenticated;

-- A recipient may read the row that authorizes their non-institutional e-mail.
-- Keep that onboarding check working while withholding internal notes/admin IDs.
-- The baseline ACL is broader than SELECT; revoke everything because RLS does
-- not protect TRUNCATE, REFERENCES or TRIGGER privileges.
revoke all on table public.kc_invited_emails from anon, authenticated;
grant select (
  email,
  invited_at,
  used_at,
  expires_at
) on table public.kc_invited_emails to authenticated;

-- The baseline policy joined auth.users, which ordinary authenticated callers
-- cannot read. Use the signed JWT e-mail claim instead so the invited person
-- can verify only their own row without exposing auth.users or internal fields.
drop policy if exists kc_invited_emails_select_visible
  on public.kc_invited_emails;
create policy kc_invited_emails_select_visible
  on public.kc_invited_emails
  for select
  to authenticated
  using (
    public.kc_is_admin((select auth.uid()))
    or lower(btrim(email)) = lower(
      btrim(coalesce((select auth.jwt()->>'email'), ''))
    )
  );

-- ---------------------------------------------------------------------------
-- Admin-only profile autocomplete. The public facade is SECURITY INVOKER; the
-- privileged worker lives outside the exposed API schema and validates the
-- authenticated administrator before reading profiles.email.
-- ---------------------------------------------------------------------------

create schema if not exists kc_private;
revoke all on schema kc_private from public;
grant usage on schema kc_private to authenticated, service_role;

create or replace function kc_private.kc_admin_search_profiles_for_limits(
  p_query text,
  p_limit integer default 8
)
returns table (
  out_id uuid,
  out_full_name text,
  out_display_name text,
  out_email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_query text := left(btrim(coalesce(p_query, '')), 120);
  v_limit integer := greatest(1, least(coalesce(p_limit, 8), 20));
begin
  if v_role <> 'service_role'
     and (v_uid is null or not public.kc_is_admin(v_uid)) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if char_length(v_query) < 2 then
    return;
  end if;

  return query
  select
    profile_row.id,
    profile_row.full_name,
    profile_row.display_name,
    profile_row.email
  from public.profiles as profile_row
  where position(lower(v_query) in lower(coalesce(profile_row.full_name, ''))) > 0
     or position(lower(v_query) in lower(coalesce(profile_row.display_name, ''))) > 0
     or position(lower(v_query) in lower(coalesce(profile_row.email, ''))) > 0
  order by
    case
      when lower(coalesce(profile_row.email, '')) = lower(v_query) then 0
      when lower(coalesce(profile_row.display_name, '')) = lower(v_query) then 1
      when lower(coalesce(profile_row.full_name, '')) = lower(v_query) then 2
      else 3
    end,
    coalesce(
      nullif(profile_row.display_name, ''),
      nullif(profile_row.full_name, ''),
      profile_row.email,
      profile_row.id::text
    )
  limit v_limit;
end;
$$;

create or replace function public.kc_admin_search_profiles_for_limits(
  p_query text,
  p_limit integer default 8
)
returns table (
  out_id uuid,
  out_full_name text,
  out_display_name text,
  out_email text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_admin_search_profiles_for_limits($1, $2)
$$;

revoke all on function
  kc_private.kc_admin_search_profiles_for_limits(text, integer)
  from public, anon, authenticated, service_role;
revoke all on function
  public.kc_admin_search_profiles_for_limits(text, integer)
  from public, anon, authenticated, service_role;

grant execute on function
  kc_private.kc_admin_search_profiles_for_limits(text, integer)
  to authenticated, service_role;
grant execute on function
  public.kc_admin_search_profiles_for_limits(text, integer)
  to authenticated, service_role;

comment on function public.kc_admin_search_profiles_for_limits(text, integer) is
  'SECURITY INVOKER admin facade for moderation autocomplete; profile e-mail never receives a direct table grant.';

-- ---------------------------------------------------------------------------
-- External-access decisions become idempotent. Replaying the same decision
-- returns the original row and lets the Edge Function recover its persisted
-- delivery result. An opposite decision remains a conflict.
-- ---------------------------------------------------------------------------

create or replace function kc_private.kc_admin_decide_external_access(
  p_id uuid,
  p_decision text,
  p_note text default null
)
returns table (
  out_id uuid,
  out_admin_status text,
  out_admin_decided_at timestamptz,
  out_contact_email text,
  out_requester_name text,
  out_metadata jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_row public.help_requests%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  if not public.kc_is_admin(v_user) then
    raise exception 'not_authorized';
  end if;

  if v_decision not in ('approved', 'rejected') then
    raise exception 'invalid_decision';
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_admin_note';
  end if;

  select request_row.*
  into v_row
  from public.help_requests as request_row
  where request_row.id = p_id
    and (
      request_row.type = 'external_access'
      or request_row.metadata->>'request_kind' = 'external_access'
    )
  for update;

  if not found then
    raise exception 'help_request_not_found_or_not_pending';
  end if;

  if v_row.admin_status = 'pending' then
    update public.help_requests
    set admin_status = v_decision,
        admin_decided_at = now(),
        admin_decided_by = v_user,
        admin_note = v_note
    where id = p_id
    returning * into v_row;
  elsif v_row.admin_status <> v_decision then
    raise exception 'help_request_not_found_or_not_pending';
  end if;

  return query
  select
    v_row.id,
    v_row.admin_status,
    v_row.admin_decided_at,
    v_row.contact_email,
    nullif(v_row.metadata->>'requester_name', ''),
    v_row.metadata;
end;
$$;

revoke all on function
  kc_private.kc_admin_decide_external_access(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function
  kc_private.kc_admin_decide_external_access(uuid, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Delivery claim + compare-and-swap completion.
--
-- Persisting the decision alone is not enough: two concurrent Edge Function
-- calls could both observe a missing delivery result and send two messages.
-- This worker decides and claims the delivery while holding the same row lock.
-- Only the caller whose UUID is stored in metadata may perform the side effect.
-- ---------------------------------------------------------------------------

create or replace function kc_private.kc_admin_claim_external_access_delivery(
  p_id uuid,
  p_decision text,
  p_note text,
  p_claim_id uuid
)
returns table (
  out_id uuid,
  out_admin_status text,
  out_admin_decided_at timestamptz,
  out_contact_email text,
  out_requester_name text,
  out_metadata jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_delivery_key text;
  v_delivery jsonb := '{}'::jsonb;
  v_status text := '';
  v_row public.help_requests%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  if not public.kc_is_admin(v_user) then
    raise exception 'not_authorized';
  end if;

  if v_decision not in ('approved', 'rejected') then
    raise exception 'invalid_decision';
  end if;

  if p_claim_id is null then
    raise exception 'invalid_delivery_claim';
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_admin_note';
  end if;

  select request_row.*
  into v_row
  from public.help_requests as request_row
  where request_row.id = p_id
    and (
      request_row.type = 'external_access'
      or request_row.metadata->>'request_kind' = 'external_access'
    )
  for update;

  if not found then
    raise exception 'help_request_not_found_or_not_pending';
  end if;

  if v_row.admin_status = 'pending' then
    update public.help_requests
    set admin_status = v_decision,
        admin_decided_at = now(),
        admin_decided_by = v_user,
        admin_note = v_note
    where id = p_id
    returning * into v_row;
  elsif v_row.admin_status <> v_decision then
    raise exception 'help_request_not_found_or_not_pending';
  end if;

  v_delivery_key := case
    when v_decision = 'approved' then 'invite_email'
    else 'rejection_email'
  end;
  v_delivery := coalesce(v_row.metadata->v_delivery_key, '{}'::jsonb);
  v_status := lower(coalesce(v_delivery->>'status', ''));

  -- Terminal results and an in-flight claim owned by another request are
  -- returned unchanged. This is deliberately at-most-once: an interrupted
  -- provider call stays visible as "processing" for manual review instead of
  -- risking a duplicate e-mail on an automatic retry.
  if v_status in ('sent', 'link_generated', 'failed')
     or (
       v_status = 'processing'
       and coalesce(v_delivery->>'claim_id', '') <> p_claim_id::text
     ) then
    return query
    select
      v_row.id,
      v_row.admin_status,
      v_row.admin_decided_at,
      v_row.contact_email,
      nullif(v_row.metadata->>'requester_name', ''),
      v_row.metadata;
    return;
  end if;

  if v_status <> 'processing' then
    update public.help_requests
    set metadata = jsonb_set(
      coalesce(v_row.metadata, '{}'::jsonb),
      array[v_delivery_key],
      jsonb_build_object(
        'status', 'processing',
        'claim_id', p_claim_id::text,
        'claimed_at', now(),
        'claimed_by', v_user::text
      ),
      true
    )
    where id = p_id
    returning * into v_row;
  end if;

  return query
  select
    v_row.id,
    v_row.admin_status,
    v_row.admin_decided_at,
    v_row.contact_email,
    nullif(v_row.metadata->>'requester_name', ''),
    v_row.metadata;
end;
$$;

create or replace function public.kc_admin_claim_external_access_delivery(
  p_id uuid,
  p_decision text,
  p_note text,
  p_claim_id uuid
)
returns table (
  out_id uuid,
  out_admin_status text,
  out_admin_decided_at timestamptz,
  out_contact_email text,
  out_requester_name text,
  out_metadata jsonb
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_admin_claim_external_access_delivery($1, $2, $3, $4)
$$;

create or replace function kc_private.kc_complete_external_access_delivery(
  p_id uuid,
  p_decision text,
  p_claim_id uuid,
  p_delivery jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_delivery_key text;
  v_delivery_status text;
  v_current_delivery jsonb := '{}'::jsonb;
  v_row public.help_requests%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not_authorized';
  end if;

  if p_id is null or p_claim_id is null then
    raise exception 'invalid_delivery_completion';
  end if;

  if v_decision not in ('approved', 'rejected') then
    raise exception 'invalid_decision';
  end if;

  if jsonb_typeof(coalesce(p_delivery, 'null'::jsonb)) <> 'object'
     or octet_length(p_delivery::text) > 32768 then
    raise exception 'invalid_delivery_result';
  end if;

  v_delivery_status := lower(coalesce(p_delivery->>'status', ''));
  if v_delivery_status not in ('sent', 'link_generated', 'failed') then
    raise exception 'invalid_delivery_status';
  end if;

  v_delivery_key := case
    when v_decision = 'approved' then 'invite_email'
    else 'rejection_email'
  end;

  select request_row.*
  into v_row
  from public.help_requests as request_row
  where request_row.id = p_id
    and request_row.admin_status = v_decision
    and (
      request_row.type = 'external_access'
      or request_row.metadata->>'request_kind' = 'external_access'
    )
  for update;

  if not found then
    return false;
  end if;

  v_current_delivery := coalesce(v_row.metadata->v_delivery_key, '{}'::jsonb);
  if lower(coalesce(v_current_delivery->>'status', '')) <> 'processing'
     or coalesce(v_current_delivery->>'claim_id', '') <> p_claim_id::text then
    return false;
  end if;

  update public.help_requests
  set metadata = jsonb_set(
    coalesce(v_row.metadata, '{}'::jsonb),
    array[v_delivery_key],
    p_delivery
      || jsonb_build_object(
        'claim_id', p_claim_id::text,
        'completed_at', now()
      ),
    true
  )
  where id = p_id;

  return true;
end;
$$;

create or replace function public.kc_complete_external_access_delivery(
  p_id uuid,
  p_decision text,
  p_claim_id uuid,
  p_delivery jsonb
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select kc_private.kc_complete_external_access_delivery($1, $2, $3, $4)
$$;

revoke all on function
  kc_private.kc_admin_claim_external_access_delivery(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function
  public.kc_admin_claim_external_access_delivery(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function
  kc_private.kc_complete_external_access_delivery(uuid, text, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  public.kc_complete_external_access_delivery(uuid, text, uuid, jsonb)
  from public, anon, authenticated, service_role;

grant execute on function
  kc_private.kc_admin_claim_external_access_delivery(uuid, text, text, uuid)
  to authenticated, service_role;
grant execute on function
  public.kc_admin_claim_external_access_delivery(uuid, text, text, uuid)
  to authenticated, service_role;
grant execute on function
  kc_private.kc_complete_external_access_delivery(uuid, text, uuid, jsonb)
  to service_role;
grant execute on function
  public.kc_complete_external_access_delivery(uuid, text, uuid, jsonb)
  to service_role;

comment on function
  public.kc_admin_claim_external_access_delivery(uuid, text, text, uuid) is
  'Atomically persists an external-access decision and claims its one delivery side effect.';
comment on function
  public.kc_complete_external_access_delivery(uuid, text, uuid, jsonb) is
  'Service-role compare-and-swap completion for a claimed external-access delivery.';

-- ---------------------------------------------------------------------------
-- Stable audit export snapshot. The regular six-argument RPC remains available
-- for interactive pagination. This exact seven-argument overload freezes an
-- upper timestamp and therefore prevents new audit events from shifting offset
-- pages while a PDF/XLSX export is being assembled.
-- ---------------------------------------------------------------------------

create or replace function kc_private.kc_admin_list_audit_logs_impl(
  p_entity_type text,
  p_action text,
  p_actor_query text,
  p_limit integer,
  p_offset integer,
  p_since timestamptz,
  p_until timestamptz
)
returns table (
  id uuid,
  created_at timestamptz,
  action text,
  entity_type text,
  entity_id text,
  actor_id uuid,
  payload jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_entity text := lower(trim(coalesce(p_entity_type, 'all')));
  v_action text := lower(trim(coalesce(p_action, 'all')));
  v_actor_query text := lower(nullif(trim(coalesce(p_actor_query, '')), ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 500));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_role <> 'service_role'
     and (v_uid is null or not public.kc_is_admin(v_uid)) then
    raise insufficient_privilege using message = 'admin access required';
  end if;

  return query
  select
    audit_row.id,
    audit_row.created_at,
    audit_row.action,
    audit_row.entity_type,
    audit_row.entity_id::text,
    audit_row.actor_id,
    audit_row.payload
  from public.audit_log as audit_row
  left join public.profiles as actor_profile
    on actor_profile.id = audit_row.actor_id
  where (v_entity = 'all' or lower(audit_row.entity_type) = v_entity)
    and (v_action = 'all' or lower(audit_row.action) = v_action)
    and (
      v_actor_query is null
      or position(v_actor_query in lower(coalesce(audit_row.actor_id::text, ''))) > 0
      or position(v_actor_query in lower(coalesce(actor_profile.display_name, ''))) > 0
      or position(v_actor_query in lower(coalesce(actor_profile.full_name, ''))) > 0
    )
    and (p_since is null or audit_row.created_at >= p_since)
    and (p_until is null or audit_row.created_at <= p_until)
  order by audit_row.created_at desc, audit_row.id desc
  offset v_offset
  limit v_limit;
end;
$$;

create or replace function public.kc_admin_list_audit_logs(
  p_entity_type text,
  p_action text,
  p_actor_query text,
  p_limit integer,
  p_offset integer,
  p_since timestamptz,
  p_until timestamptz
)
returns table (
  id uuid,
  created_at timestamptz,
  action text,
  entity_type text,
  entity_id text,
  actor_id uuid,
  payload jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_admin_list_audit_logs_impl(
    $1, $2, $3, $4, $5, $6, $7
  )
$$;

revoke all on function
  kc_private.kc_admin_list_audit_logs_impl(
    text, text, text, integer, integer, timestamptz, timestamptz
  )
  from public, anon, authenticated, service_role;
revoke all on function
  public.kc_admin_list_audit_logs(
    text, text, text, integer, integer, timestamptz, timestamptz
  )
  from public, anon, authenticated, service_role;

grant execute on function
  kc_private.kc_admin_list_audit_logs_impl(
    text, text, text, integer, integer, timestamptz, timestamptz
  )
  to authenticated, service_role;
grant execute on function
  public.kc_admin_list_audit_logs(
    text, text, text, integer, integer, timestamptz, timestamptz
  )
  to authenticated, service_role;

comment on function
  public.kc_admin_list_audit_logs(
    text, text, text, integer, integer, timestamptz, timestamptz
  ) is
  'Admin audit export snapshot with stable timestamp bound and deterministic created_at/id ordering.';

notify pgrst, 'reload schema';

commit;

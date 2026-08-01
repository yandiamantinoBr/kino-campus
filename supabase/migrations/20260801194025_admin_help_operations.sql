-- Admin help operations: one authoritative queue projection, audited triage,
-- and reconciliation between the external-access delivery workflow and the
-- generic help queue. Existing RPCs remain intact for rollback compatibility.

create or replace function kc_private.kc_admin_help_queue_summary()
returns table (
  urgent_count bigint,
  in_progress_count bigint,
  external_pending_count bigint,
  waiting_over_24h_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'NOT_AUTHENTICATED';
  end if;

  if not public.kc_is_admin(v_uid) then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;

  return query
  select
    count(*) filter (
      where request_row.priority = 'urgent'
        and request_row.status not in ('resolved', 'archived')
    ),
    count(*) filter (
      where request_row.status = 'in_progress'
    ),
    count(*) filter (
      where (
        request_row.type = 'external_access'
        or request_row.metadata->>'request_kind' = 'external_access'
      )
        and request_row.admin_status = 'pending'
    ),
    count(*) filter (
      where request_row.status in ('new', 'triaged', 'in_progress')
        and request_row.created_at < now() - interval '24 hours'
    )
  from public.help_requests request_row;
end;
$$;

create or replace function public.kc_admin_help_queue_summary()
returns table (
  urgent_count bigint,
  in_progress_count bigint,
  external_pending_count bigint,
  waiting_over_24h_count bigint
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_admin_help_queue_summary()
$$;

create or replace function kc_private.kc_admin_list_help_requests_v2(
  p_status text default null,
  p_type text default null,
  p_priority text default null,
  p_query text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  type text,
  topic text,
  subtopic text,
  subject text,
  message text,
  priority text,
  status text,
  page_path text,
  contact_email text,
  allow_contact boolean,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  author_name text,
  admin_status text,
  admin_decided_at timestamptz,
  admin_decided_by uuid,
  admin_note text,
  total_count bigint,
  urgent_count bigint,
  in_progress_count bigint,
  external_pending_count bigint,
  waiting_over_24h_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status text := nullif(lower(btrim(coalesce(p_status, ''))), '');
  v_type text := nullif(lower(btrim(coalesce(p_type, ''))), '');
  v_priority text := nullif(lower(btrim(coalesce(p_priority, ''))), '');
  v_query text := nullif(lower(btrim(coalesce(p_query, ''))), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'NOT_AUTHENTICATED';
  end if;

  if not public.kc_is_admin(v_uid) then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;

  if v_status is not null
     and v_status not in ('new', 'triaged', 'in_progress', 'resolved', 'archived') then
    raise exception using errcode = '22023', message = 'HELP_STATUS_INVALID';
  end if;

  if v_priority is not null
     and v_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception using errcode = '22023', message = 'HELP_PRIORITY_INVALID';
  end if;

  if v_query is not null and char_length(v_query) > 200 then
    raise exception using errcode = '22023', message = 'HELP_QUERY_TOO_LONG';
  end if;

  return query
  with filtered as materialized (
    select
      request_row.*,
      coalesce(profile_row.display_name, profile_row.full_name, profile_row.email, 'Usuario')
        as resolved_author_name
    from public.help_requests request_row
    left join public.profiles profile_row
      on profile_row.id = request_row.user_id
    where (v_status is null or request_row.status = v_status)
      and (v_type is null or request_row.type = v_type)
      and (v_priority is null or request_row.priority = v_priority)
      and (
        v_query is null
        or position(
          v_query in lower(concat_ws(
            ' ',
            request_row.subject,
            request_row.message,
            request_row.contact_email,
            request_row.page_path,
            request_row.type,
            request_row.topic,
            request_row.subtopic
          ))
        ) > 0
      )
  ), global_stats as materialized (
    select *
    from kc_private.kc_admin_help_queue_summary()
  )
  select
    filtered.id,
    filtered.user_id,
    filtered.type,
    filtered.topic,
    filtered.subtopic,
    filtered.subject,
    filtered.message,
    filtered.priority,
    filtered.status,
    filtered.page_path,
    filtered.contact_email,
    filtered.allow_contact,
    filtered.metadata,
    filtered.created_at,
    filtered.updated_at,
    filtered.resolved_author_name,
    filtered.admin_status,
    filtered.admin_decided_at,
    filtered.admin_decided_by,
    filtered.admin_note,
    count(*) over(),
    global_stats.urgent_count,
    global_stats.in_progress_count,
    global_stats.external_pending_count,
    global_stats.waiting_over_24h_count
  from filtered
  cross join global_stats
  order by filtered.created_at desc, filtered.id desc
  limit v_limit
  offset v_offset;
end;
$$;

create or replace function public.kc_admin_list_help_requests_v2(
  p_status text default null,
  p_type text default null,
  p_priority text default null,
  p_query text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  type text,
  topic text,
  subtopic text,
  subject text,
  message text,
  priority text,
  status text,
  page_path text,
  contact_email text,
  allow_contact boolean,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  author_name text,
  admin_status text,
  admin_decided_at timestamptz,
  admin_decided_by uuid,
  admin_note text,
  total_count bigint,
  urgent_count bigint,
  in_progress_count bigint,
  external_pending_count bigint,
  waiting_over_24h_count bigint
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_admin_list_help_requests_v2($1, $2, $3, $4, $5, $6)
$$;

create or replace function kc_private.kc_admin_triage_help_request(
  p_id uuid,
  p_status text,
  p_priority text,
  p_expected_updated_at timestamptz default null
)
returns table (
  out_id uuid,
  out_status text,
  out_priority text,
  out_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_priority text := lower(btrim(coalesce(p_priority, '')));
  v_previous_status text;
  v_previous_priority text;
  v_row public.help_requests%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'NOT_AUTHENTICATED';
  end if;

  if not public.kc_is_admin(v_uid) then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;

  if p_id is null then
    raise exception using errcode = '22023', message = 'HELP_REQUEST_INVALID';
  end if;

  if v_status not in ('new', 'triaged', 'in_progress', 'resolved', 'archived') then
    raise exception using errcode = '22023', message = 'HELP_STATUS_INVALID';
  end if;

  if v_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception using errcode = '22023', message = 'HELP_PRIORITY_INVALID';
  end if;

  select request_row.*
  into v_row
  from public.help_requests request_row
  where request_row.id = p_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'HELP_REQUEST_NOT_FOUND';
  end if;

  if p_expected_updated_at is not null
     and v_row.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'HELP_REQUEST_STALE';
  end if;

  v_previous_status := v_row.status;
  v_previous_priority := v_row.priority;

  if v_row.status is distinct from v_status
     or v_row.priority is distinct from v_priority then
    update public.help_requests
    set status = v_status,
        priority = v_priority
    where id = p_id
    returning * into v_row;

    insert into public.audit_log (
      actor_id,
      action,
      entity_type,
      entity_id,
      payload
    )
    values (
      v_uid,
      'help_request_triaged',
      'help_requests',
      p_id,
      jsonb_build_object(
        'previous_status', v_previous_status,
        'next_status', v_status,
        'previous_priority', v_previous_priority,
        'next_priority', v_priority,
        'request_type', v_row.type
      )
    );
  end if;

  return query
  select v_row.id, v_row.status, v_row.priority, v_row.updated_at;
end;
$$;

create or replace function public.kc_admin_triage_help_request(
  p_id uuid,
  p_status text,
  p_priority text,
  p_expected_updated_at timestamptz default null
)
returns table (
  out_id uuid,
  out_status text,
  out_priority text,
  out_updated_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_admin_triage_help_request($1, $2, $3, $4)
$$;

-- A delivery decision is already operational work even before the provider
-- returns. Move the generic queue to in-progress in the same row-locked
-- transaction as the at-most-once delivery claim. This avoids leaving future
-- interrupted deliveries mislabeled as new.
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
  v_delivery_status text := '';
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
  from public.help_requests request_row
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
        admin_note = v_note,
        status = case
          when v_row.status in ('resolved', 'archived') then v_row.status
          else 'in_progress'
        end
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
  v_delivery_status := lower(coalesce(v_delivery->>'status', ''));

  -- A terminal result or a claim owned by another request is replayed without
  -- another provider side effect. The generic state was already reconciled by
  -- completion or by the migration backfill below.
  if v_delivery_status in ('sent', 'link_generated', 'failed')
     or (
       v_delivery_status = 'processing'
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

  if v_delivery_status <> 'processing' then
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
        ),
        status = case
          when v_row.status in ('resolved', 'archived') then v_row.status
          else 'in_progress'
        end
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

-- Delivery completion is the authority for the generic help-queue state.
-- A confirmed e-mail resolves the ticket; a manual link or failed/uncertain
-- provider result remains visible as in progress. Explicit terminal triage is
-- preserved so this worker never reopens a ticket closed by an administrator.
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
  v_previous_help_status text;
  v_next_help_status text;
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
  from public.help_requests request_row
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

  v_previous_help_status := v_row.status;
  v_next_help_status := case
    when v_row.status in ('resolved', 'archived') then v_row.status
    when v_delivery_status = 'sent' then 'resolved'
    else 'in_progress'
  end;

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
      ),
      status = v_next_help_status
  where id = p_id;

  if v_previous_help_status is distinct from v_next_help_status then
    insert into public.audit_log (
      actor_id,
      action,
      entity_type,
      entity_id,
      payload
    )
    values (
      v_row.admin_decided_by,
      'external_access_help_status_reconciled',
      'help_requests',
      p_id,
      jsonb_build_object(
        'previous_status', v_previous_help_status,
        'next_status', v_next_help_status,
        'admin_status', v_decision,
        'delivery_status', v_delivery_status,
        'source', 'delivery_completion'
      )
    );
  end if;

  return true;
end;
$$;

-- Repair only obviously stale queue states. Pending decisions and explicit
-- terminal triage are deliberately untouched.
with candidates as (
  select
    request_row.id,
    request_row.admin_decided_by,
    request_row.admin_status,
    request_row.status as previous_status,
    lower(coalesce(
      case
        when request_row.admin_status = 'approved'
          then request_row.metadata->'invite_email'->>'status'
        when request_row.admin_status = 'rejected'
          then request_row.metadata->'rejection_email'->>'status'
        else null
      end,
      ''
    )) as delivery_status
  from public.help_requests request_row
  where request_row.status = 'new'
    and request_row.admin_status in ('approved', 'rejected')
    and (
      request_row.type = 'external_access'
      or request_row.metadata->>'request_kind' = 'external_access'
    )
), repaired as (
  update public.help_requests request_row
  set status = case
    when candidates.delivery_status = 'sent' then 'resolved'
    else 'in_progress'
  end
  from candidates
  where request_row.id = candidates.id
    and candidates.delivery_status in ('sent', 'link_generated', 'failed', 'processing')
  returning
    request_row.id,
    candidates.admin_decided_by,
    candidates.admin_status,
    candidates.previous_status,
    request_row.status as next_status,
    candidates.delivery_status
)
insert into public.audit_log (
  actor_id,
  action,
  entity_type,
  entity_id,
  payload
)
select
  repaired.admin_decided_by,
  'external_access_help_status_reconciled',
  'help_requests',
  repaired.id,
  jsonb_build_object(
    'previous_status', repaired.previous_status,
    'next_status', repaired.next_status,
    'admin_status', repaired.admin_status,
    'delivery_status', repaired.delivery_status,
    'source', 'migration_backfill'
  )
from repaired;

revoke all on function
  kc_private.kc_admin_help_queue_summary()
  from public, anon, authenticated, service_role;
revoke all on function
  public.kc_admin_help_queue_summary()
  from public, anon, authenticated, service_role;
revoke all on function
  kc_private.kc_admin_list_help_requests_v2(text, text, text, text, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function
  public.kc_admin_list_help_requests_v2(text, text, text, text, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function
  kc_private.kc_admin_triage_help_request(uuid, text, text, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function
  public.kc_admin_triage_help_request(uuid, text, text, timestamptz)
  from public, anon, authenticated, service_role;

grant execute on function
  kc_private.kc_admin_help_queue_summary()
  to authenticated, service_role;
grant execute on function
  public.kc_admin_help_queue_summary()
  to authenticated, service_role;
grant execute on function
  kc_private.kc_admin_list_help_requests_v2(text, text, text, text, integer, integer)
  to authenticated, service_role;
grant execute on function
  public.kc_admin_list_help_requests_v2(text, text, text, text, integer, integer)
  to authenticated, service_role;
grant execute on function
  kc_private.kc_admin_triage_help_request(uuid, text, text, timestamptz)
  to authenticated, service_role;
grant execute on function
  public.kc_admin_triage_help_request(uuid, text, text, timestamptz)
  to authenticated, service_role;

comment on function
  public.kc_admin_help_queue_summary() is
  'Admin-only aggregate help queue counters without ticket content or contact data.';
comment on function
  public.kc_admin_list_help_requests_v2(text, text, text, text, integer, integer) is
  'Admin-only help queue with server-side filters, external workflow state, and aggregate counters.';
comment on function
  public.kc_admin_triage_help_request(uuid, text, text, timestamptz) is
  'Admin-only optimistic help triage mutation with an append-only audit event.';
comment on function
  public.kc_admin_claim_external_access_delivery(uuid, text, text, uuid) is
  'Atomically persists an external-access decision, marks generic help in progress, and claims its one delivery side effect.';
comment on function
  public.kc_complete_external_access_delivery(uuid, text, uuid, jsonb) is
  'Service-role CAS completion for external-access delivery; also reconciles the generic help queue state.';

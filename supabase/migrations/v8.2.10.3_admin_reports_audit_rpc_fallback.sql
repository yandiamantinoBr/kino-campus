-- v8.2.10.3
-- Fallback RPCs para listagem administrativa de denúncias e audit log
-- em ambientes com RLS mais restritiva no client.

create or replace function public.kc_admin_list_reports(
  p_status text default 'open',
  p_reason text default 'all',
  p_limit integer default 200
)
returns table (
  id uuid,
  created_at timestamptz,
  reason text,
  details text,
  status text,
  post_id uuid,
  reporter_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text := lower(coalesce(p_status, 'open'));
  v_reason text := lower(coalesce(p_reason, 'all'));
begin
  if v_uid is null or not public.kc_is_admin(v_uid) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    r.id,
    r.created_at,
    r.reason,
    r.details,
    r.status,
    r.post_id,
    r.reporter_id
  from public.reports r
  where (v_status = 'all' or lower(r.status) = v_status)
    and (v_reason = 'all' or lower(r.reason) = v_reason)
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$$;

revoke all on function public.kc_admin_list_reports(text, text, integer) from public;
grant execute on function public.kc_admin_list_reports(text, text, integer) to authenticated, service_role;

create or replace function public.kc_admin_list_audit_logs(
  p_entity_type text default 'all',
  p_action text default 'all',
  p_actor_query text default null,
  p_limit integer default 50
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
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_entity text := lower(coalesce(p_entity_type, 'all'));
  v_action text := lower(coalesce(p_action, 'all'));
  v_actor_query text := lower(nullif(trim(coalesce(p_actor_query, '')), ''));
begin
  if v_uid is null or not public.kc_is_admin(v_uid) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    a.id,
    a.created_at,
    a.action,
    a.entity_type,
    a.entity_id,
    a.actor_id,
    a.payload
  from public.audit_log a
  where (v_entity = 'all' or lower(a.entity_type) = v_entity)
    and (v_action = 'all' or lower(a.action) = v_action)
    and (
      v_actor_query is null
      or cast(a.actor_id as text) ilike '%' || v_actor_query || '%'
    )
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 500));
end;
$$;

revoke all on function public.kc_admin_list_audit_logs(text, text, text, integer) from public;
grant execute on function public.kc_admin_list_audit_logs(text, text, text, integer) to authenticated, service_role;

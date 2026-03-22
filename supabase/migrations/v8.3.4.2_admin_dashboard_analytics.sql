-- v8.3.4.2
-- Dashboard admin: corrige paginação/filtro do audit log em fallback RPC
-- e adiciona série diária consolidada para o painel analítico.

begin;

drop function if exists public.kc_admin_list_audit_logs(text, text, text, integer);

create or replace function public.kc_admin_list_audit_logs(
  p_entity_type text default 'all',
  p_action text default 'all',
  p_actor_query text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_since timestamptz default null
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
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
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
    a.entity_id::text,
    a.actor_id,
    a.payload
  from public.audit_log a
  where (v_entity = 'all' or lower(a.entity_type) = v_entity)
    and (v_action = 'all' or lower(a.action) = v_action)
    and (
      v_actor_query is null
      or cast(a.actor_id as text) ilike '%' || v_actor_query || '%'
    )
    and (p_since is null or a.created_at >= p_since)
  order by a.created_at desc
  offset v_offset
  limit greatest(1, least(coalesce(p_limit, 50), 500));
end;
$$;

revoke all on function public.kc_admin_list_audit_logs(text, text, text, integer, integer, timestamptz) from public;
grant execute on function public.kc_admin_list_audit_logs(text, text, text, integer, integer, timestamptz) to authenticated, service_role;

drop function if exists public.kc_admin_dashboard_daily_metrics(timestamptz);

create or replace function public.kc_admin_dashboard_daily_metrics(
  p_since timestamptz default null
)
returns table (
  day date,
  posts_count bigint,
  comments_count bigint,
  searches_count bigint,
  votes_count bigint,
  admin_actions_count bigint
)
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select coalesce(date_trunc('day', p_since), date_trunc('day', now() - interval '29 days'))::date as start_day,
           date_trunc('day', now())::date as end_day
  ),
  calendar as (
    select generate_series(start_day, end_day, interval '1 day')::date as day
    from bounds
  ),
  posts as (
    select date_trunc('day', created_at)::date as day, count(*)::bigint as total
    from public.posts
    where created_at >= (select start_day::timestamptz from bounds)
    group by 1
  ),
  comments as (
    select date_trunc('day', created_at)::date as day, count(*)::bigint as total
    from public.comments
    where created_at >= (select start_day::timestamptz from bounds)
    group by 1
  ),
  searches as (
    select date_trunc('day', created_at)::date as day, count(*)::bigint as total
    from public.search_queries
    where created_at >= (select start_day::timestamptz from bounds)
    group by 1
  ),
  votes as (
    select date_trunc('day', created_at)::date as day, count(*)::bigint as total
    from public.post_votes
    where created_at >= (select start_day::timestamptz from bounds)
    group by 1
  ),
  actions as (
    select date_trunc('day', created_at)::date as day, count(*)::bigint as total
    from public.audit_log
    where created_at >= (select start_day::timestamptz from bounds)
    group by 1
  )
  select
    c.day,
    coalesce(p.total, 0) as posts_count,
    coalesce(cm.total, 0) as comments_count,
    coalesce(s.total, 0) as searches_count,
    coalesce(v.total, 0) as votes_count,
    coalesce(a.total, 0) as admin_actions_count
  from calendar c
  left join posts p on p.day = c.day
  left join comments cm on cm.day = c.day
  left join searches s on s.day = c.day
  left join votes v on v.day = c.day
  left join actions a on a.day = c.day
  order by c.day asc;
$$;

revoke all on function public.kc_admin_dashboard_daily_metrics(timestamptz) from public;
grant execute on function public.kc_admin_dashboard_daily_metrics(timestamptz) to authenticated, service_role;

comment on function public.kc_admin_list_audit_logs(text, text, text, integer, integer, timestamptz) is
  'Lista audit logs administrativos com filtros, paginação real via offset e corte temporal opcional.';

comment on function public.kc_admin_dashboard_daily_metrics(timestamptz) is
  'Retorna buckets diários do dashboard admin para posts, comentários, buscas, votos e ações administrativas.';

commit;

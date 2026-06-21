-- KinoCampus 2026-05-31
-- Estende kc_admin_dashboard_daily_metrics com 3 novas séries diárias:
--   saves_count   (public.saved_posts)
--   reports_count (public.reports)
--   signups_count (public.profiles)
--
-- Objetivo: dar mais séries ao gráfico diário do Dashboard Admin (revisão profunda
-- — Fase C), tornando a legenda interativa/buscável de fato útil.
--
-- Mantém EXATAMENTE o padrão de hardening vigente em produção:
--   • wrapper public  → LANGUAGE sql, INVOKER, search_path = ''  (delega ao privado)
--   • implementação   → kc_private, LANGUAGE sql, SECURITY DEFINER, search_path = 'public'
-- Como o tipo de retorno muda (mais colunas), as duas funções são recriadas
-- (drop + create) e os privilégios são reaplicados como antes
-- (authenticated + service_role; anon sem acesso; usage de kc_private só authenticated).

begin;

drop function if exists public.kc_admin_dashboard_daily_metrics(timestamptz);
drop function if exists kc_private.kc_admin_dashboard_daily_metrics(timestamptz);

create function kc_private.kc_admin_dashboard_daily_metrics(
  p_since timestamptz default null
)
returns table (
  day date,
  posts_count bigint,
  comments_count bigint,
  searches_count bigint,
  votes_count bigint,
  admin_actions_count bigint,
  saves_count bigint,
  reports_count bigint,
  signups_count bigint
)
language sql
security definer
set search_path = 'public'
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
  ),
  saves as (
    select date_trunc('day', created_at)::date as day, count(*)::bigint as total
    from public.saved_posts
    where created_at >= (select start_day::timestamptz from bounds)
    group by 1
  ),
  reports as (
    select date_trunc('day', created_at)::date as day, count(*)::bigint as total
    from public.reports
    where created_at >= (select start_day::timestamptz from bounds)
    group by 1
  ),
  signups as (
    select date_trunc('day', created_at)::date as day, count(*)::bigint as total
    from public.profiles
    where created_at >= (select start_day::timestamptz from bounds)
    group by 1
  )
  select
    c.day,
    coalesce(p.total, 0)  as posts_count,
    coalesce(cm.total, 0) as comments_count,
    coalesce(s.total, 0)  as searches_count,
    coalesce(v.total, 0)  as votes_count,
    coalesce(a.total, 0)  as admin_actions_count,
    coalesce(sv.total, 0) as saves_count,
    coalesce(rp.total, 0) as reports_count,
    coalesce(sg.total, 0) as signups_count
  from calendar c
  left join posts p     on p.day  = c.day
  left join comments cm on cm.day = c.day
  left join searches s  on s.day  = c.day
  left join votes v     on v.day  = c.day
  left join actions a   on a.day  = c.day
  left join saves sv    on sv.day = c.day
  left join reports rp  on rp.day = c.day
  left join signups sg  on sg.day = c.day
  order by c.day asc;
$$;

create function public.kc_admin_dashboard_daily_metrics(
  p_since timestamptz default null
)
returns table (
  day date,
  posts_count bigint,
  comments_count bigint,
  searches_count bigint,
  votes_count bigint,
  admin_actions_count bigint,
  saves_count bigint,
  reports_count bigint,
  signups_count bigint
)
language sql
set search_path = ''
as $$
  select * from kc_private.kc_admin_dashboard_daily_metrics($1)
$$;

revoke all on function kc_private.kc_admin_dashboard_daily_metrics(timestamptz) from public, anon;
grant execute on function kc_private.kc_admin_dashboard_daily_metrics(timestamptz) to authenticated, service_role;

revoke all on function public.kc_admin_dashboard_daily_metrics(timestamptz) from public, anon;
grant execute on function public.kc_admin_dashboard_daily_metrics(timestamptz) to authenticated, service_role;

comment on function public.kc_admin_dashboard_daily_metrics(timestamptz) is
  'Buckets diários do Dashboard Admin: posts, comentários, buscas, votos, ações admin, salvamentos, denúncias e cadastros. Wrapper INVOKER (search_path='''') → kc_private (SECURITY DEFINER).';

commit;

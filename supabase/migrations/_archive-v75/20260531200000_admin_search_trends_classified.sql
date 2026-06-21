-- KinoCampus 2026-05-31
-- Tendências de busca: classificação data-driven termo → módulo.
--
-- Problema: hoje a classificação é só por dicionário de palavras-chave no cliente,
-- e a maioria dos termos (eventos, cursos, siglas) não recebe módulo/badge.
-- Solução: associar cada termo ao MÓDULO DOMINANTE entre os POSTS que casam com
-- ele (conteúdo real = campo semântico). O dicionário vira só reserva no cliente.
--
-- Padrão de hardening: wrapper público (INVOKER, search_path='') → kc_private
-- (SECURITY DEFINER, search_path='public'). Read-only, admin via gate da página.

begin;

drop function if exists public.kc_admin_search_trends_classified(integer, timestamptz);
drop function if exists kc_private.kc_admin_search_trends_classified(integer, timestamptz);

create function kc_private.kc_admin_search_trends_classified(
  p_limit integer default 10,
  p_since timestamptz default null
)
returns table (
  term text,
  count bigint,
  module text,
  module_confidence numeric
)
language sql
security definer
set search_path = 'public'
as $$
  with trends as (
    select lower(btrim(sq.term)) as term, count(*)::bigint as count
    from public.search_queries sq
    where sq.created_at >= coalesce(p_since, now() - interval '30 days')
      and length(btrim(sq.term)) >= 1
    group by lower(btrim(sq.term))
    order by count desc
    limit greatest(coalesce(p_limit, 10), 1)
  ),
  matched as (
    select t.term, p.module, count(*)::bigint as posts
    from trends t
    join public.posts p
      on p.status in ('published', 'closed')
     and length(t.term) >= 3
     and (p.title ilike '%' || t.term || '%' or p.description ilike '%' || t.term || '%')
    group by t.term, p.module
  ),
  ranked as (
    select
      term, module, posts,
      sum(posts) over (partition by term) as total_posts,
      row_number() over (partition by term order by posts desc, module asc) as rn
    from matched
  )
  select
    t.term,
    t.count,
    r.module,
    case when r.module is not null and r.total_posts > 0
         then round(r.posts::numeric / r.total_posts, 2)
         else null end as module_confidence
  from trends t
  left join ranked r on r.term = t.term and r.rn = 1
  order by t.count desc, t.term asc;
$$;

create function public.kc_admin_search_trends_classified(
  p_limit integer default 10,
  p_since timestamptz default null
)
returns table (
  term text,
  count bigint,
  module text,
  module_confidence numeric
)
language sql
set search_path = ''
as $$
  select * from kc_private.kc_admin_search_trends_classified($1, $2)
$$;

revoke all on function kc_private.kc_admin_search_trends_classified(integer, timestamptz) from public, anon;
grant execute on function kc_private.kc_admin_search_trends_classified(integer, timestamptz) to authenticated, service_role;

revoke all on function public.kc_admin_search_trends_classified(integer, timestamptz) from public, anon;
grant execute on function public.kc_admin_search_trends_classified(integer, timestamptz) to authenticated, service_role;

comment on function public.kc_admin_search_trends_classified(integer, timestamptz) is
  'Top termos de busca + módulo dominante entre os posts que casam com o termo (classificação por conteúdo). Wrapper INVOKER (search_path='''') -> kc_private (SECURITY DEFINER).';

commit;

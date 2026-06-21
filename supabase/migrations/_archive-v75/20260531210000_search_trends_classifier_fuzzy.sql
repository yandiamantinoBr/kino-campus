-- KinoCampus 2026-05-31
-- Tendências de busca: classificador tolerante a erros de digitação.
--
-- Antes, o casamento termo↔posts era só por ilike (substring), então termos
-- digitados errado ("conpex") não casavam o post certo ("CONPEEX") e ficavam
-- sem módulo. Agora, além do ilike, usa-se word_similarity (pg_trgm) sobre o
-- título — que tem índice trigram — para tolerar typos.
--
-- word_similarity('conpex', '23º CONPEEX 2026 ...') = 0.714 (real), enquanto
-- ruído fica <= 0.43 → limiar 0.5 separa bem. word_similarity vive no schema
-- `extensions`, por isso a chamada é qualificada. Assinatura inalterada →
-- create or replace (sem recriar wrapper público nem regrants).

begin;

create or replace function kc_private.kc_admin_search_trends_classified(
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
     and (
       p.title ilike '%' || t.term || '%'
       or p.description ilike '%' || t.term || '%'
       or (length(t.term) >= 4 and extensions.word_similarity(t.term, coalesce(p.title, '')) >= 0.5)
     )
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

commit;

-- Kino Campus -- V9.3.5.1
-- Abas personalizadas para kc-feed-tabs (após o divider).
-- Combina afinidade pessoal (home_category_affinity) com sinal global de
-- relevância (highlight_score médio dos últimos 14 dias), recência e volume.
-- Retorna até p_limit pares (módulo, categoria) ranqueados.
--
-- Pesos do score:
--   0.45 * affinity   (interações pessoais do usuário)
--   0.25 * highlight  (relevância global do módulo+categoria, 14 d)
--   0.15 * recency    (bônus se houver post nas últimas 48 h / 7 d)
--   0.10 * volume     (volume de publicações ativas, log-normalizado)
--   0.05 * residual   (constante leve; diversidade real aplicada no client)
--
-- Anônimo (auth.uid() is null) ou sem histórico: termo de afinidade zerado;
-- ranking cai naturalmente em "trending global".
--
-- Labels, hrefs e ícones são resolvidos no client (assets/js/boot/kc-tab-catalog.js)
-- a partir de (out_module_key, out_category_key) — backend agnóstico de UI.

begin;

drop function if exists public.kc_get_personalized_tabs(text, integer);

create or replace function public.kc_get_personalized_tabs(
  p_session_id text default null,
  p_limit integer default 8
)
returns table (
  out_tab_key text,
  out_module_key text,
  out_category_key text,
  out_score numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_session text := nullif(trim(coalesce(p_session_id, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 8), 30));
begin
  return query
  with
  affinity_raw as (
    select
      hca.module_key as a_module,
      coalesce(nullif(hca.category_key, ''), '') as a_category,
      sum(hca.score)::numeric as aff_score
    from public.home_category_affinity hca
    where (v_user is not null and hca.owner_kind = 'user' and hca.user_id = v_user)
       or (v_session is not null and hca.owner_kind = 'session' and hca.session_id = v_session)
    group by hca.module_key, coalesce(nullif(hca.category_key, ''), '')
  ),
  highlights_raw as (
    select
      p.module as h_module,
      coalesce(nullif(p.category, ''), '') as h_category,
      avg(coalesce(p.highlight_score, 0))::numeric as hi_score,
      count(*)::numeric as volume,
      max(p.created_at) as last_post_at
    from public.posts p
    where p.created_at > now() - interval '14 days'
      and coalesce(p.status, 'published') = 'published'
      and p.module is not null
    group by p.module, coalesce(nullif(p.category, ''), '')
  ),
  combined as (
    select
      coalesce(a.a_module, h.h_module) as c_module,
      coalesce(a.a_category, h.h_category, '') as c_category,
      coalesce(a.aff_score, 0) as aff,
      coalesce(h.hi_score, 0) as hi,
      coalesce(h.volume, 0) as vol,
      h.last_post_at
    from affinity_raw a
    full outer join highlights_raw h
      on h.h_module = a.a_module
     and coalesce(h.h_category, '') = coalesce(a.a_category, '')
    where coalesce(a.a_module, h.h_module) is not null
  ),
  normalized as (
    select
      c.c_module,
      c.c_category,
      case when max(c.aff) over () > 0 then c.aff / max(c.aff) over () else 0 end as aff_n,
      case when max(c.hi)  over () > 0 then c.hi  / max(c.hi)  over () else 0 end as hi_n,
      case
        when c.last_post_at is not null and c.last_post_at > now() - interval '48 hours' then 1.0
        when c.last_post_at is not null and c.last_post_at > now() - interval '7 days'  then 0.5
        else 0
      end as recency_n,
      case when max(c.vol) over () > 0 then ln(1 + c.vol) / nullif(ln(1 + max(c.vol) over ()), 0) else 0 end as vol_n
    from combined c
  )
  select
    case when n.c_category is null or n.c_category = ''
         then n.c_module
         else n.c_module || ':' || n.c_category end as out_tab_key,
    n.c_module as out_module_key,
    nullif(n.c_category, '') as out_category_key,
    (
      0.45 * n.aff_n
      + 0.25 * n.hi_n
      + 0.15 * n.recency_n
      + 0.10 * coalesce(n.vol_n, 0)
      + 0.05 * 1.0
    )::numeric as out_score
  from normalized n
  order by out_score desc nulls last, n.c_module asc, n.c_category asc
  limit v_limit;
end;
$$;

revoke all on function public.kc_get_personalized_tabs(text, integer) from public;
grant execute on function public.kc_get_personalized_tabs(text, integer) to anon, authenticated;

comment on function public.kc_get_personalized_tabs(text, integer) is
  'V9.3.5.1: top N pares (modulo, categoria) personalizados para kc-feed-tabs. '
  'Combina home_category_affinity (45%), highlight_score medio 14d (25%), recencia (15%), '
  'volume log-normalizado (10%) e residual (5%). Anonimos podem informar p_session_id; '
  'usuarios autenticados ignoram p_session_id e usam auth.uid().';

commit;

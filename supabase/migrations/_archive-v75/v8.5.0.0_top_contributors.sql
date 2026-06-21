-- ============================================================
-- KinoCampus — V8.5.0.0
-- Feature: Top Contribuidores — ranking de engajamento
--
-- Cria função kc_get_top_contributors que agrega métricas de
-- engajamento dos usuários (posts, votos, comentários, cupons,
-- shares) e retorna um ranking JSONB filtrado por período e módulo.
--
-- Scoring:
--   Publicações criadas ...... 15 pts cada
--   Votos positivos .......... 10 pts cada
--   Comentários escritos .....  5 pts cada
--   Cliques em cupons ........  4 pts cada
--   Compartilhamentos ........  3 pts cada
--   Posts deletados com report  -50 pts (penalidade)
-- ============================================================

begin;

-- ──────────────────────────────────────────────────────────────
-- 1. Indexes de suporte (idempotentes)
-- ──────────────────────────────────────────────────────────────

create index if not exists idx_posts_author_created
  on public.posts (author_id, created_at)
  where status != 'deleted';

create index if not exists idx_comments_author_created
  on public.comments (author_id, created_at);

-- ──────────────────────────────────────────────────────────────
-- 2. Função principal
-- ──────────────────────────────────────────────────────────────

create or replace function public.kc_get_top_contributors(
  p_period  text default 'month',   -- 'day', 'week', 'month'
  p_module  text default null,      -- NULL = todos os módulos
  p_limit   int  default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since  timestamptz;
  v_result jsonb;
begin
  -- Calcular início do período
  v_since := case p_period
    when 'day'   then now() - interval '1 day'
    when 'week'  then now() - interval '7 days'
    when 'month' then now() - interval '30 days'
    else now() - interval '30 days'
  end;

  with user_posts as (
    select
      author_id,
      count(*)                          as posts_count,
      coalesce(sum(votos), 0)           as total_votes,
      coalesce(sum(coupon_clicks), 0)   as total_coupon_clicks,
      coalesce(sum(share_count), 0)     as total_shares
    from public.posts
    where created_at >= v_since
      and status not in ('deleted')
      and (p_module is null or module = p_module)
    group by author_id
  ),
  user_comments as (
    select author_id, count(*) as comments_count
    from public.comments
    where created_at >= v_since
    group by author_id
  ),
  user_penalties as (
    -- Penalidade: posts deletados que possuem denúncias fechadas
    select p.author_id, count(distinct p.id) as penalty_count
    from public.posts p
    inner join public.reports r on r.post_id = p.id and r.status = 'closed'
    where p.status = 'deleted'
      and p.created_at >= v_since
      and (p_module is null or p.module = p_module)
    group by p.author_id
  ),
  scores as (
    select
      coalesce(up.author_id, uc.author_id) as user_id,
      coalesce(up.posts_count, 0)          as posts_count,
      coalesce(up.total_votes, 0)          as votes_received,
      coalesce(uc.comments_count, 0)       as comments_count,
      coalesce(up.total_coupon_clicks, 0)  as coupon_clicks,
      coalesce(up.total_shares, 0)         as share_count,
      coalesce(pen.penalty_count, 0)       as penalties,
      greatest(0,
        coalesce(up.posts_count, 0)         * 15 +
        coalesce(up.total_votes, 0)         * 10 +
        coalesce(uc.comments_count, 0)      *  5 +
        coalesce(up.total_coupon_clicks, 0) *  4 +
        coalesce(up.total_shares, 0)        *  3
        - coalesce(pen.penalty_count, 0)    * 50
      ) as score
    from user_posts up
    full outer join user_comments uc on up.author_id = uc.author_id
    left join user_penalties pen on coalesce(up.author_id, uc.author_id) = pen.author_id
  ),
  ranked as (
    select
      s.*,
      pr.display_name,
      pr.avatar_url,
      row_number() over (order by s.score desc, s.posts_count desc) as rank
    from scores s
    inner join public.profiles pr on pr.id = s.user_id
    where s.score > 0
    order by s.score desc, s.posts_count desc
    limit p_limit
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user_id',        r.user_id,
      'display_name',   r.display_name,
      'avatar_url',     r.avatar_url,
      'rank',           r.rank,
      'score',          r.score,
      'posts_count',    r.posts_count,
      'votes_received', r.votes_received,
      'comments_count', r.comments_count,
      'coupon_clicks',  r.coupon_clicks,
      'share_count',    r.share_count,
      'penalties',      r.penalties
    ) order by r.rank
  ), '[]'::jsonb) into v_result
  from ranked r;

  return v_result;
end;
$$;

-- ──────────────────────────────────────────────────────────────
-- 3. Permissões
-- ──────────────────────────────────────────────────────────────

revoke all on function public.kc_get_top_contributors(text, text, int) from public;
grant execute on function public.kc_get_top_contributors(text, text, int)
  to authenticated, anon, service_role;

commit;

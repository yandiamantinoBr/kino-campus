-- KinoCampus 2026-05-31
-- RPC agregada do Dashboard Admin: kc_admin_dashboard_overview
--
-- Objetivo: substituir ~19 consultas do cliente (loadMetrics) por UMA chamada
-- server-side, agregando todos os KPIs da janela atual e da anterior (para os
-- deltas %) + sessões ativas (15 min) + bloco de privacidade do dashboard
-- (eventos/sessões reais de search_queries + post_view_events).
--
-- Segurança: SECURITY DEFINER + gate public.kc_is_admin(auth.uid()) + search_path=''
-- (padrão das RPCs admin). Read-only (apenas COUNTs). Bypassa RLS de forma segura
-- porque só admins executam e o retorno é agregado (sem linhas individuais).

begin;

create or replace function public.kc_admin_dashboard_overview(
  p_since timestamptz default null,
  p_until timestamptz default null,
  p_prev_since timestamptz default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_since timestamptz := coalesce(p_since, now() - interval '30 days');
  v_until timestamptz := coalesce(p_until, now());
  v_prev_since timestamptz := coalesce(p_prev_since, v_since - (coalesce(p_until, now()) - coalesce(p_since, now() - interval '30 days')));
  v_active_since timestamptz := now() - interval '15 minutes';
begin
  if v_uid is null or not public.kc_is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Acesso restrito a administradores.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'since', v_since,
    'until', v_until,
    'prev_since', v_prev_since,
    'reports', jsonb_build_object(
      'open',  (select count(*) from public.reports r where r.status = 'open' and r.created_at >= v_since),
      'total', (select count(*) from public.reports r where r.created_at >= v_since)
    ),
    'posts', jsonb_build_object(
      'total',        (select count(*) from public.posts),
      'visible',      (select count(*) from public.posts where status in ('published', 'closed')),
      'created',      (select count(*) from public.posts where created_at >= v_since),
      'edited',       (select count(*) from public.posts where updated_at >= v_since and created_at < v_since),
      'hidden',       (select count(*) from public.posts where status = 'hidden' and updated_at >= v_since),
      'deleted',      (select count(*) from public.posts where status = 'deleted' and updated_at >= v_since),
      'prev_created', (select count(*) from public.posts where created_at >= v_prev_since and created_at < v_since)
    ),
    'engagement', jsonb_build_object(
      'comments',      (select count(*) from public.comments where created_at >= v_since),
      'votes',         (select count(*) from public.post_votes where created_at >= v_since),
      'saves',         (select count(*) from public.saved_posts where created_at >= v_since),
      'prev_comments', (select count(*) from public.comments where created_at >= v_prev_since and created_at < v_since),
      'prev_votes',    (select count(*) from public.post_votes where created_at >= v_prev_since and created_at < v_since),
      'prev_saves',    (select count(*) from public.saved_posts where created_at >= v_prev_since and created_at < v_since)
    ),
    'users', jsonb_build_object(
      'total',    (select count(*) from public.profiles),
      'new',      (select count(*) from public.profiles where created_at >= v_since),
      'prev_new', (select count(*) from public.profiles where created_at >= v_prev_since and created_at < v_since)
    ),
    'privacy', jsonb_build_object(
      'searches',   (select count(*) from public.search_queries where created_at >= v_since),
      'post_views', (select count(*) from public.post_view_events where created_at >= v_since),
      'events',     (select count(*) from public.search_queries where created_at >= v_since)
                  + (select count(*) from public.post_view_events where created_at >= v_since),
      'sessions',   (select count(distinct s) from (
                       select session_id as s from public.search_queries where created_at >= v_since and session_id is not null
                       union
                       select session_id as s from public.post_view_events where created_at >= v_since and session_id is not null
                     ) sess)
    ),
    'active_15m', (select count(distinct s) from (
                     select session_id as s from public.search_queries where created_at >= v_active_since and session_id is not null
                     union
                     select session_id as s from public.post_view_events where created_at >= v_active_since and session_id is not null
                   ) act)
  );
end;
$$;

revoke all on function public.kc_admin_dashboard_overview(timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.kc_admin_dashboard_overview(timestamptz, timestamptz, timestamptz) to authenticated, service_role;

commit;

-- Reconcile the privacy runtime that diverged between the local baseline and
-- production. This migration is intentionally idempotent: production already
-- has privacy_analytics_events, while a clean local reset also has the consent
-- table and RPCs.

begin;

create table if not exists public.privacy_analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (event_name in (
    'search',
    'category_click',
    'post_open',
    'banner_impression',
    'banner_click',
    'ad_impression',
    'ad_click',
    'help_open',
    'help_submit',
    'report_submit'
  )),
  session_hash text not null,
  user_id uuid references auth.users(id) on delete set null,
  page_path text not null default '/',
  entity_type text,
  entity_id text,
  module_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.privacy_consent_events (
  id uuid primary key default gen_random_uuid(),
  session_hash text not null,
  user_id uuid references auth.users(id) on delete set null,
  consent_version text not null,
  preferences_enabled boolean not null default false,
  analytics_enabled boolean not null default false,
  source text not null default 'user',
  created_at timestamptz not null default now()
);

create index if not exists idx_privacy_analytics_events_created_at
  on public.privacy_analytics_events (created_at desc);
create index if not exists idx_privacy_analytics_events_event_created
  on public.privacy_analytics_events (event_name, created_at desc);
create index if not exists idx_privacy_analytics_events_page_created
  on public.privacy_analytics_events (page_path, created_at desc);
create index if not exists idx_privacy_analytics_events_entity
  on public.privacy_analytics_events (entity_type, entity_id, created_at desc);
create index if not exists idx_privacy_analytics_events_session
  on public.privacy_analytics_events (session_hash, created_at desc);
create index if not exists idx_privacy_analytics_events_user_id
  on public.privacy_analytics_events (user_id) where user_id is not null;
create index if not exists idx_privacy_consent_events_created_at
  on public.privacy_consent_events (created_at desc);
create index if not exists idx_privacy_consent_events_session
  on public.privacy_consent_events (session_hash, created_at desc);
create index if not exists idx_privacy_consent_events_user_id
  on public.privacy_consent_events (user_id) where user_id is not null;

alter table public.privacy_analytics_events enable row level security;
alter table public.privacy_consent_events enable row level security;

drop policy if exists privacy_analytics_events_insert_public on public.privacy_analytics_events;
create policy privacy_analytics_events_insert_public
  on public.privacy_analytics_events
  for insert to anon, authenticated
  with check (
    session_hash ~ '^[a-f0-9]{64}$'
    and page_path like '/%'
    and length(page_path) <= 180
    and (user_id is null or user_id = (select auth.uid()))
    and jsonb_typeof(metadata) = 'object'
    and not metadata ?| array[
      'cookie', 'cookies', 'token', 'access_token', 'refresh_token',
      'password', 'authorization', 'secret', 'email', 'ip',
      'user_agent', 'ua', 'jwt'
    ]
  );

drop policy if exists privacy_analytics_events_select_admin on public.privacy_analytics_events;
create policy privacy_analytics_events_select_admin
  on public.privacy_analytics_events
  for select to authenticated
  using (public.kc_is_admin((select auth.uid())));

drop policy if exists privacy_consent_events_insert_public on public.privacy_consent_events;
create policy privacy_consent_events_insert_public
  on public.privacy_consent_events
  for insert to anon, authenticated
  with check (
    session_hash ~ '^[a-f0-9]{64}$'
    and (user_id is null or user_id = (select auth.uid()))
    and length(consent_version) between 1 and 32
    and length(source) between 1 and 48
  );

drop policy if exists privacy_consent_events_select_admin on public.privacy_consent_events;
create policy privacy_consent_events_select_admin
  on public.privacy_consent_events
  for select to authenticated
  using (public.kc_is_admin((select auth.uid())));

revoke all on table public.privacy_analytics_events from public, anon, authenticated;
revoke all on table public.privacy_consent_events from public, anon, authenticated;

grant insert (
  event_name, session_hash, user_id, page_path, entity_type, entity_id,
  module_key, metadata
) on public.privacy_analytics_events to anon, authenticated;
grant select on public.privacy_analytics_events to authenticated;

grant insert (
  session_hash, user_id, consent_version, preferences_enabled,
  analytics_enabled, source
) on public.privacy_consent_events to anon, authenticated;
grant select on public.privacy_consent_events to authenticated;

grant all on table public.privacy_analytics_events to service_role;
grant all on table public.privacy_consent_events to service_role;

create or replace function public.kc_record_privacy_consent(
  p_session_id text,
  p_consent_version text,
  p_preferences boolean,
  p_analytics boolean,
  p_source text default 'user'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session_id text := trim(coalesce(p_session_id, ''));
begin
  if length(v_session_id) < 12 or length(v_session_id) > 128 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  insert into public.privacy_consent_events (
    session_hash,
    user_id,
    consent_version,
    preferences_enabled,
    analytics_enabled,
    source
  )
  values (
    encode(extensions.digest(v_session_id, 'sha256'), 'hex'),
    auth.uid(),
    left(coalesce(nullif(trim(p_consent_version), ''), 'unknown'), 32),
    coalesce(p_preferences, false),
    coalesce(p_analytics, false),
    left(coalesce(nullif(trim(p_source), ''), 'user'), 48)
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.kc_admin_privacy_analytics(
  p_since timestamptz default null,
  p_event_name text default 'all',
  p_page_path text default 'all',
  p_module_key text default 'all',
  p_limit integer default 500,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_since timestamptz := coalesce(p_since, now() - interval '30 days');
  v_event_name text := nullif(lower(trim(coalesce(p_event_name, 'all'))), 'all');
  v_page_path text := nullif(trim(coalesce(p_page_path, 'all')), 'all');
  v_module_key text := nullif(trim(coalesce(p_module_key, 'all')), 'all');
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 1000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if v_uid is null or not public.kc_is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  with filtered as materialized (
    select *
    from public.privacy_analytics_events e
    where e.created_at >= v_since
      and (v_event_name is null or e.event_name = v_event_name)
      and (v_page_path is null or e.page_path = v_page_path)
      and (v_module_key is null or e.module_key = v_module_key)
  ),
  consent_filtered as materialized (
    select *
    from public.privacy_consent_events c
    where c.created_at >= v_since
  )
  select jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'since', v_since,
    'totals', jsonb_build_object(
      'events', (select count(*) from filtered),
      'sessions', (select count(distinct session_hash) from filtered),
      'searches', (select count(*) from public.search_queries sq where sq.created_at >= v_since),
      'banner_impressions', (select count(*) from filtered where event_name = 'banner_impression'),
      'banner_clicks', (select count(*) from filtered where event_name = 'banner_click'),
      'help_submits', (select count(*) from filtered where event_name = 'help_submit'),
      'report_submits', (select count(*) from filtered where event_name = 'report_submit')
    ),
    'consent', jsonb_build_object(
      'updates', (select count(*) from consent_filtered),
      'analytics_accepted', (select count(*) from consent_filtered where analytics_enabled is true),
      'analytics_rejected', (select count(*) from consent_filtered where analytics_enabled is false),
      'preferences_accepted', (select count(*) from consent_filtered where preferences_enabled is true)
    ),
    'by_event', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.events desc, row_data.event_name)
      from (
        select event_name, count(*)::bigint as events, count(distinct session_hash)::bigint as sessions
        from filtered
        group by event_name
      ) row_data
    ), '[]'::jsonb),
    'by_page', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.events desc, row_data.page_path)
      from (
        select page_path, count(*)::bigint as events, count(distinct session_hash)::bigint as sessions
        from filtered
        group by page_path
        order by events desc
        limit 30
      ) row_data
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.day)
      from (
        select date_trunc('day', created_at)::date as day,
               count(*)::bigint as events,
               count(distinct session_hash)::bigint as sessions
        from filtered
        group by 1
        order by 1
      ) row_data
    ), '[]'::jsonb),
    'banners', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.ctr desc, row_data.clicks desc, row_data.impressions desc)
      from (
        select coalesce(nullif(entity_id, ''), metadata->>'entity_label', 'banner') as entity_id,
               max(coalesce(metadata->>'entity_label', entity_id, 'Banner')) as label,
               count(*) filter (where event_name = 'banner_impression')::bigint as impressions,
               count(*) filter (where event_name = 'banner_click')::bigint as clicks,
               case
                 when count(*) filter (where event_name = 'banner_impression') = 0 then 0
                 else round(((count(*) filter (where event_name = 'banner_click'))::numeric
                   / nullif((count(*) filter (where event_name = 'banner_impression'))::numeric, 0)) * 100, 2)
               end as ctr
        from filtered
        where entity_type = 'banner'
        group by coalesce(nullif(entity_id, ''), metadata->>'entity_label', 'banner')
      ) row_data
    ), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc)
      from (
        select created_at, event_name, page_path, entity_type, entity_id, module_key, metadata
        from filtered
        order by created_at desc
        limit v_limit offset v_offset
      ) row_data
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.kc_prune_old_analytics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_search_deleted bigint := 0;
  v_audit_deleted bigint := 0;
  v_views_deleted bigint := 0;
  v_privacy_deleted bigint := 0;
  v_consent_deleted bigint := 0;
begin
  delete from public.search_queries where created_at < now() - interval '6 months';
  get diagnostics v_search_deleted = row_count;

  delete from public.audit_log where created_at < now() - interval '1 year';
  get diagnostics v_audit_deleted = row_count;

  delete from public.post_view_events where created_at < now() - interval '6 months';
  get diagnostics v_views_deleted = row_count;

  delete from public.privacy_analytics_events where created_at < now() - interval '6 months';
  get diagnostics v_privacy_deleted = row_count;

  delete from public.privacy_consent_events where created_at < now() - interval '6 months';
  get diagnostics v_consent_deleted = row_count;

  begin
    insert into public.audit_log (action, entity_type, entity_id, actor_id, payload)
    values (
      'analytics_pruned',
      'system',
      gen_random_uuid(),
      null,
      jsonb_build_object(
        'search_queries_deleted', v_search_deleted,
        'audit_log_deleted', v_audit_deleted,
        'post_view_events_deleted', v_views_deleted,
        'privacy_analytics_events_deleted', v_privacy_deleted,
        'privacy_consent_events_deleted', v_consent_deleted,
        'pruned_at', now()::text
      )
    );
  exception when others then null;
  end;

  return jsonb_build_object(
    'ok', true,
    'search_queries_deleted', v_search_deleted,
    'audit_log_deleted', v_audit_deleted,
    'post_view_events_deleted', v_views_deleted,
    'privacy_analytics_events_deleted', v_privacy_deleted,
    'privacy_consent_events_deleted', v_consent_deleted
  );
end;
$$;

revoke all on function public.kc_track_privacy_event(text, text, text, text, text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_track_privacy_event(text, text, text, text, text, text, jsonb)
  to anon, authenticated, service_role;

revoke all on function public.kc_record_privacy_consent(text, text, boolean, boolean, text)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_record_privacy_consent(text, text, boolean, boolean, text)
  to anon, authenticated, service_role;

revoke all on function public.kc_admin_privacy_analytics(timestamptz, text, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_admin_privacy_analytics(timestamptz, text, text, text, integer, integer)
  to authenticated, service_role;

revoke all on function public.kc_prune_old_analytics()
  from public, anon, authenticated, service_role;
grant execute on function public.kc_prune_old_analytics() to service_role;

comment on table public.privacy_analytics_events is
  'Eventos opcionais e agregaveis do KinoCampus; session_id e armazenado apenas como hash.';
comment on table public.privacy_consent_events is
  'Historico agregado de consentimento, sem valores de cookies ou tokens.';

commit;

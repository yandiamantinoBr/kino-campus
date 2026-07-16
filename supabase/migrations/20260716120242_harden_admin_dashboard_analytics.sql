-- Admin dashboard analytics correctness and security hardening.
--
-- Public RPC names remain stable for PostgREST. Privileged reads live in the
-- non-exposed kc_private schema and every public facade is SECURITY INVOKER.

begin;

create schema if not exists kc_private;
revoke all on schema kc_private from public;
grant usage on schema kc_private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Privacy consent runtime: production drift can leave this table/RPC absent.
-- ---------------------------------------------------------------------------

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

create index if not exists idx_privacy_consent_events_created_at
  on public.privacy_consent_events (created_at desc);
create index if not exists idx_privacy_consent_events_session
  on public.privacy_consent_events (session_hash, created_at desc);
create index if not exists idx_privacy_consent_events_user_id
  on public.privacy_consent_events (user_id)
  where user_id is not null;

-- Dashboard predicates and deterministic keyset ordering. Existing single
-- column indexes remain useful; these composite indexes match the actual
-- status/time and join/time access patterns used below.
create index if not exists idx_reports_status_created_at
  on public.reports (status, created_at desc);
create index if not exists idx_posts_status_created_at
  on public.posts (status, created_at desc);
create index if not exists idx_posts_status_updated_at
  on public.posts (status, updated_at desc);
create index if not exists idx_profiles_created_at
  on public.profiles (created_at desc);
create index if not exists idx_post_votes_created_at
  on public.post_votes (created_at desc);
create index if not exists idx_saved_posts_created_at
  on public.saved_posts (created_at desc);
create index if not exists idx_comment_likes_created_at
  on public.comment_likes (created_at desc);
create index if not exists idx_comments_post_created_at
  on public.comments (post_id, created_at desc, author_id);
create index if not exists idx_post_view_events_session_created_at
  on public.post_view_events (session_id, created_at desc)
  where session_id is not null;
create index if not exists idx_privacy_analytics_events_module_created
  on public.privacy_analytics_events (module_key, created_at desc)
  where module_key is not null;
create index if not exists audit_log_created_at_id_desc_idx
  on public.audit_log (created_at desc, id desc);

alter table public.privacy_consent_events enable row level security;

-- Consent writes are RPC-only. Remove every drifted INSERT policy so a future
-- table grant cannot accidentally reopen an unvalidated write path.
do $$
declare
  v_policy record;
begin
  for v_policy in
    select policy_row.polname
    from pg_catalog.pg_policy as policy_row
    where policy_row.polrelid = 'public.privacy_consent_events'::regclass
      and policy_row.polcmd = 'a'
  loop
    execute format(
      'drop policy %I on public.privacy_consent_events',
      v_policy.polname
    );
  end loop;
end;
$$;

drop policy if exists privacy_consent_events_select_admin
  on public.privacy_consent_events;
create policy privacy_consent_events_select_admin
  on public.privacy_consent_events
  for select
  to authenticated
  using (public.kc_is_admin((select auth.uid())));

revoke all privileges on table public.privacy_consent_events
  from public, anon, authenticated;
revoke insert (
  id, session_hash, user_id, consent_version, preferences_enabled,
  analytics_enabled, source, created_at
) on table public.privacy_consent_events
  from public, anon, authenticated;
grant select on table public.privacy_consent_events to authenticated;
grant all privileges on table public.privacy_consent_events to service_role;

create or replace function kc_private.kc_record_privacy_consent_impl(
  p_session_id text,
  p_consent_version text,
  p_preferences boolean,
  p_analytics boolean,
  p_source text default 'user'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session_id text := trim(coalesce(p_session_id, ''));
  v_consent_version text := trim(coalesce(p_consent_version, ''));
  v_source text := lower(trim(coalesce(p_source, '')));
  v_consent_date date;
  v_session_hash text;
  v_recent_count integer;
begin
  if v_session_id !~ '^[A-Za-z0-9_-]{12,128}$' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  if v_consent_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_VERSION');
  end if;

  begin
    v_consent_date := v_consent_version::date;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      return jsonb_build_object('ok', false, 'code', 'INVALID_VERSION');
  end;

  if to_char(v_consent_date, 'YYYY-MM-DD') <> v_consent_version then
    return jsonb_build_object('ok', false, 'code', 'INVALID_VERSION');
  end if;

  if v_source not in ('user', 'accept_all', 'reject_optional', 'custom') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SOURCE');
  end if;

  v_session_hash := encode(
    extensions.digest(v_session_id, 'sha256'),
    'hex'
  );

  -- Serialize one ephemeral session at a time so deduplication and rate
  -- limiting stay correct even when multiple tabs persist consent together.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_session_hash, 0)
  );

  if exists (
    select 1
    from public.privacy_consent_events as consent_row
    where consent_row.session_hash = v_session_hash
      and consent_row.consent_version = v_consent_version
      and consent_row.preferences_enabled = coalesce(p_preferences, false)
      and consent_row.analytics_enabled = coalesce(p_analytics, false)
      and consent_row.source = v_source
      and consent_row.created_at >= now() - interval '10 seconds'
  ) then
    return jsonb_build_object(
      'ok', true,
      'deduplicated', true
    );
  end if;

  select count(*)::integer
  into v_recent_count
  from public.privacy_consent_events as consent_row
  where consent_row.session_hash = v_session_hash
    and consent_row.created_at >= now() - interval '1 hour';

  if v_recent_count >= 20 then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED');
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
    v_session_hash,
    auth.uid(),
    v_consent_version,
    coalesce(p_preferences, false),
    coalesce(p_analytics, false),
    v_source
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.kc_record_privacy_consent(
  p_session_id text,
  p_consent_version text,
  p_preferences boolean,
  p_analytics boolean,
  p_source text default 'user'
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_record_privacy_consent_impl(
    $1, $2, $3, $4, $5
  )
$$;

-- ---------------------------------------------------------------------------
-- Analytics retention: production may still have the pre-privacy cron body.
-- Keep the public name used by pg_cron, but reconcile every retained source.
-- ---------------------------------------------------------------------------

create or replace function public.kc_prune_old_analytics()
returns jsonb
language plpgsql
volatile
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
  delete from public.search_queries
  where created_at < now() - interval '6 months';
  get diagnostics v_search_deleted = row_count;

  delete from public.audit_log
  where created_at < now() - interval '1 year';
  get diagnostics v_audit_deleted = row_count;

  delete from public.post_view_events
  where created_at < now() - interval '6 months';
  get diagnostics v_views_deleted = row_count;

  delete from public.privacy_analytics_events
  where created_at < now() - interval '6 months';
  get diagnostics v_privacy_deleted = row_count;

  delete from public.privacy_consent_events
  where created_at < now() - interval '6 months';
  get diagnostics v_consent_deleted = row_count;

  begin
    insert into public.audit_log (
      action,
      entity_type,
      entity_id,
      actor_id,
      payload
    )
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
  exception when others then
    null;
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

-- ---------------------------------------------------------------------------
-- Detailed privacy analytics: private privileged implementation + public API.
-- ---------------------------------------------------------------------------

create or replace function kc_private.kc_admin_privacy_analytics_impl(
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
  v_role text := coalesce(auth.role(), '');
  v_since timestamptz := coalesce(p_since, now() - interval '30 days');
  v_event_name text := nullif(lower(trim(coalesce(p_event_name, 'all'))), 'all');
  v_page_path text := nullif(trim(coalesce(p_page_path, 'all')), 'all');
  v_module_key text := nullif(trim(coalesce(p_module_key, 'all')), 'all');
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 1000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if v_role <> 'service_role'
     and (v_uid is null or not public.kc_is_admin(v_uid)) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  with filtered as materialized (
    select event_row.*
    from public.privacy_analytics_events as event_row
    where event_row.created_at >= v_since
      and (v_event_name is null or event_row.event_name = v_event_name)
      and (v_page_path is null or event_row.page_path = v_page_path)
      and (v_module_key is null or event_row.module_key = v_module_key)
  ),
  canonical_searches as materialized (
    select search_row.id
    from public.search_queries as search_row
    where search_row.created_at >= v_since
      and (v_event_name is null or v_event_name = 'search')
      and (
        v_page_path is null
        or lower(ltrim(v_page_path, '/')) = 'search-results.html'
      )
      and v_module_key is null
  ),
  consent_filtered as materialized (
    select consent_row.*
    from public.privacy_consent_events as consent_row
    where consent_row.created_at >= v_since
  )
  select jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'since', v_since,
    'totals', jsonb_build_object(
      'events', (select count(*) from filtered),
      'sessions', (select count(distinct session_hash) from filtered),
      'searches', (
        select count(*) from canonical_searches
      ),
      'banner_impressions', (
        select count(*) from filtered where event_name = 'banner_impression'
      ),
      'banner_clicks', (
        select count(*) from filtered where event_name = 'banner_click'
      ),
      'help_submits', (
        select count(*) from filtered where event_name = 'help_submit'
      ),
      'report_submits', (
        select count(*) from filtered where event_name = 'report_submit'
      )
    ),
    'consent', jsonb_build_object(
      'updates', (select count(*) from consent_filtered),
      'analytics_accepted', (
        select count(*) from consent_filtered where analytics_enabled is true
      ),
      'analytics_rejected', (
        select count(*) from consent_filtered where analytics_enabled is false
      ),
      'preferences_accepted', (
        select count(*) from consent_filtered where preferences_enabled is true
      )
    ),
    'by_event', coalesce((
      select jsonb_agg(
        to_jsonb(event_summary)
        order by event_summary.events desc, event_summary.event_name
      )
      from (
        select
          event_name,
          count(*)::bigint as events,
          count(distinct session_hash)::bigint as sessions
        from filtered
        group by event_name
      ) as event_summary
    ), '[]'::jsonb),
    'by_page', coalesce((
      select jsonb_agg(
        to_jsonb(page_summary)
        order by page_summary.events desc, page_summary.page_path
      )
      from (
        select
          page_path,
          count(*)::bigint as events,
          count(distinct session_hash)::bigint as sessions
        from filtered
        group by page_path
        order by events desc
        limit 30
      ) as page_summary
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(to_jsonb(day_summary) order by day_summary.day)
      from (
        select
          (created_at at time zone 'America/Sao_Paulo')::date as day,
          count(*)::bigint as events,
          count(distinct session_hash)::bigint as sessions
        from filtered
        group by 1
        order by 1
      ) as day_summary
    ), '[]'::jsonb),
    'banners', coalesce((
      select jsonb_agg(
        to_jsonb(banner_summary)
        order by banner_summary.ctr desc,
          banner_summary.clicks desc,
          banner_summary.impressions desc
      )
      from (
        select
          coalesce(
            nullif(entity_id, ''),
            metadata ->> 'entity_label',
            'banner'
          ) as entity_id,
          max(coalesce(metadata ->> 'entity_label', entity_id, 'Banner')) as label,
          count(*) filter (
            where event_name = 'banner_impression'
          )::bigint as impressions,
          count(*) filter (
            where event_name = 'banner_click'
          )::bigint as clicks,
          case
            when count(*) filter (
              where event_name = 'banner_impression'
            ) = 0 then 0
            else round(
              (
                count(*) filter (where event_name = 'banner_click')
              )::numeric
              / nullif(
                (
                  count(*) filter (where event_name = 'banner_impression')
                )::numeric,
                0
              ) * 100,
              2
            )
          end as ctr
        from filtered
        where entity_type = 'banner'
        group by coalesce(
          nullif(entity_id, ''),
          metadata ->> 'entity_label',
          'banner'
        )
      ) as banner_summary
    ), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(
        to_jsonb(event_detail)
        order by event_detail.created_at desc
      )
      from (
        select
          created_at,
          event_name,
          page_path,
          entity_type,
          entity_id,
          module_key,
          metadata
        from filtered
        order by created_at desc
        limit v_limit
        offset v_offset
      ) as event_detail
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
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
language sql
stable
security invoker
set search_path = ''
as $$
  select kc_private.kc_admin_privacy_analytics_impl(
    $1, $2, $3, $4, $5, $6
  )
$$;

-- ---------------------------------------------------------------------------
-- Dashboard overview: period-correct totals and global open-report backlog.
-- ---------------------------------------------------------------------------

create or replace function kc_private.kc_admin_dashboard_overview_impl(
  p_since timestamptz default null,
  p_until timestamptz default null,
  p_prev_since timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_until timestamptz := coalesce(p_until, now());
  v_since timestamptz := least(
    coalesce(p_since, v_until - interval '30 days'),
    v_until
  );
  v_prev_since timestamptz := least(
    coalesce(p_prev_since, v_since - (v_until - v_since)),
    v_since
  );
  v_active_since timestamptz := now() - interval '15 minutes';
begin
  if v_role <> 'service_role'
     and (v_uid is null or not public.kc_is_admin(v_uid)) then
    return jsonb_build_object(
      'ok', false,
      'code', 'FORBIDDEN',
      'message', 'Acesso restrito a administradores.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'since', v_since,
    'until', v_until,
    'prev_since', v_prev_since,
    'reports', jsonb_build_object(
      'open', (
        select count(*)
        from public.reports as report_row
        where report_row.status = 'open'
      ),
      'total', (
        select count(*)
        from public.reports as report_row
        where report_row.created_at >= v_since
          and report_row.created_at < v_until
      ),
      'period_total', (
        select count(*)
        from public.reports as report_row
        where report_row.created_at >= v_since
          and report_row.created_at < v_until
      )
    ),
    'posts', jsonb_build_object(
      'total', (select count(*) from public.posts),
      'visible', (
        select count(*)
        from public.posts
        where status in ('published', 'closed')
      ),
      'created', (
        select count(*)
        from public.posts
        where created_at >= v_since
          and created_at < v_until
      ),
      'edited', (
        select count(*)
        from public.posts
        where updated_at >= v_since
          and updated_at < v_until
          and created_at < v_since
      ),
      'hidden', (
        select count(*)
        from public.posts
        where status = 'hidden'
          and updated_at >= v_since
          and updated_at < v_until
      ),
      'deleted', (
        select count(*)
        from public.posts
        where status = 'deleted'
          and updated_at >= v_since
          and updated_at < v_until
      ),
      'prev_created', (
        select count(*)
        from public.posts
        where created_at >= v_prev_since
          and created_at < v_since
      )
    ),
    'engagement', jsonb_build_object(
      'comments', (
        select count(*)
        from public.comments
        where created_at >= v_since
          and created_at < v_until
      ),
      'votes', (
        select count(*)
        from public.post_votes
        where created_at >= v_since
          and created_at < v_until
      ),
      'saves', (
        select count(*)
        from public.saved_posts
        where created_at >= v_since
          and created_at < v_until
      ),
      'prev_comments', (
        select count(*)
        from public.comments
        where created_at >= v_prev_since
          and created_at < v_since
      ),
      'prev_votes', (
        select count(*)
        from public.post_votes
        where created_at >= v_prev_since
          and created_at < v_since
      ),
      'prev_saves', (
        select count(*)
        from public.saved_posts
        where created_at >= v_prev_since
          and created_at < v_since
      )
    ),
    'users', jsonb_build_object(
      'total', (select count(*) from public.profiles),
      'new', (
        select count(*)
        from public.profiles
        where created_at >= v_since
          and created_at < v_until
      ),
      'prev_new', (
        select count(*)
        from public.profiles
        where created_at >= v_prev_since
          and created_at < v_since
      )
    ),
    'searches', (
      select count(*)
      from public.search_queries
      where created_at >= v_since
        and created_at < v_until
    ),
    'privacy', jsonb_build_object(
      'searches', (
        select count(*)
        from public.search_queries
        where created_at >= v_since
          and created_at < v_until
      ),
      'post_views', (
        select count(*)
        from public.post_view_events
        where created_at >= v_since
          and created_at < v_until
      ),
      'events', (
        (
          select count(*)
          from public.search_queries
          where created_at >= v_since
            and created_at < v_until
        )
        + (
          select count(*)
          from public.post_view_events
          where created_at >= v_since
            and created_at < v_until
        )
      ),
      'sessions', (
        select count(distinct session_key)
        from (
          select 'session:' || search_row.session_id as session_key
          from public.search_queries as search_row
          where search_row.created_at >= v_since
            and search_row.created_at < v_until
            and search_row.session_id is not null
          union all
          select coalesce(
            'session:' || view_row.session_id,
            'user:' || view_row.user_id::text
          ) as session_key
          from public.post_view_events as view_row
          where view_row.created_at >= v_since
            and view_row.created_at < v_until
            and (view_row.session_id is not null or view_row.user_id is not null)
        ) as operational_sessions
      )
    ),
    'active_15m', (
      select count(distinct session_key)
      from (
        select 'session:' || search_row.session_id as session_key
        from public.search_queries as search_row
        where search_row.created_at >= v_active_since
          and search_row.created_at < now()
          and search_row.session_id is not null
        union all
        select coalesce(
          'session:' || view_row.session_id,
          'user:' || view_row.user_id::text
        ) as session_key
        from public.post_view_events as view_row
        where view_row.created_at >= v_active_since
          and view_row.created_at < now()
          and (view_row.session_id is not null or view_row.user_id is not null)
      ) as active_operational_sessions
    )
  );
end;
$$;

create or replace function public.kc_admin_dashboard_overview(
  p_since timestamptz default null,
  p_until timestamptz default null,
  p_prev_since timestamptz default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select kc_private.kc_admin_dashboard_overview_impl($1, $2, $3)
$$;

-- ---------------------------------------------------------------------------
-- Daily pulse: 13 complete series, fixed N buckets and Sao Paulo calendar days.
-- ---------------------------------------------------------------------------

drop function if exists public.kc_admin_dashboard_daily_metrics(timestamptz);
drop function if exists kc_private.kc_admin_dashboard_daily_metrics(timestamptz);
drop function if exists kc_private.kc_admin_dashboard_daily_metrics_impl(timestamptz);

create function kc_private.kc_admin_dashboard_daily_metrics_impl(
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
  signups_count bigint,
  post_views_count bigint,
  comment_likes_count bigint,
  sessions_count bigint,
  ad_clicks_count bigint,
  ad_impressions_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_end_day date := (now() at time zone 'America/Sao_Paulo')::date;
  v_since_day date := coalesce(
    (p_since at time zone 'America/Sao_Paulo')::date,
    (now() at time zone 'America/Sao_Paulo')::date - 29
  );
  v_day_count integer;
  v_start_day date;
  v_start_at timestamptz;
  v_end_exclusive timestamptz;
begin
  if v_role <> 'service_role'
     and (v_uid is null or not public.kc_is_admin(v_uid)) then
    raise insufficient_privilege using message = 'admin access required';
  end if;

  v_day_count := greatest(
    1,
    least(3660, (v_end_day - least(v_since_day, v_end_day)) + 1)
  );
  v_start_day := v_end_day - (v_day_count - 1);
  v_start_at := v_start_day::timestamp
    at time zone 'America/Sao_Paulo';
  v_end_exclusive := (v_end_day + 1)::timestamp
    at time zone 'America/Sao_Paulo';

  return query
  with calendar as (
    select generate_series(
      v_start_day,
      v_end_day,
      interval '1 day'
    )::date as day
  ),
  posts_by_day as (
    select
      (created_at at time zone 'America/Sao_Paulo')::date as day,
      count(*)::bigint as total
    from public.posts
    where created_at >= v_start_at
      and created_at < v_end_exclusive
    group by 1
  ),
  comments_by_day as (
    select
      (created_at at time zone 'America/Sao_Paulo')::date as day,
      count(*)::bigint as total
    from public.comments
    where created_at >= v_start_at
      and created_at < v_end_exclusive
    group by 1
  ),
  searches_by_day as (
    select
      (created_at at time zone 'America/Sao_Paulo')::date as day,
      count(*)::bigint as total
    from public.search_queries
    where created_at >= v_start_at
      and created_at < v_end_exclusive
    group by 1
  ),
  votes_by_day as (
    select
      (created_at at time zone 'America/Sao_Paulo')::date as day,
      count(*)::bigint as total
    from public.post_votes
    where created_at >= v_start_at
      and created_at < v_end_exclusive
    group by 1
  ),
  admin_actions_by_day as (
    select
      (created_at at time zone 'America/Sao_Paulo')::date as day,
      count(*)::bigint as total
    from public.audit_log
    where created_at >= v_start_at
      and created_at < v_end_exclusive
    group by 1
  ),
  saves_by_day as (
    select
      (created_at at time zone 'America/Sao_Paulo')::date as day,
      count(*)::bigint as total
    from public.saved_posts
    where created_at >= v_start_at
      and created_at < v_end_exclusive
    group by 1
  ),
  reports_by_day as (
    select
      (created_at at time zone 'America/Sao_Paulo')::date as day,
      count(*)::bigint as total
    from public.reports
    where created_at >= v_start_at
      and created_at < v_end_exclusive
    group by 1
  ),
  signups_by_day as (
    select
      (created_at at time zone 'America/Sao_Paulo')::date as day,
      count(*)::bigint as total
    from public.profiles
    where created_at >= v_start_at
      and created_at < v_end_exclusive
    group by 1
  ),
  comment_likes_by_day as (
    select
      (created_at at time zone 'America/Sao_Paulo')::date as day,
      count(*)::bigint as total
    from public.comment_likes
    where created_at >= v_start_at
      and created_at < v_end_exclusive
    group by 1
  ),
  post_views_by_day as (
    select
      (created_at at time zone 'America/Sao_Paulo')::date as day,
      count(*)::bigint as total
    from public.post_view_events
    where created_at >= v_start_at
      and created_at < v_end_exclusive
    group by 1
  ),
  operational_session_events as (
    select
      (created_at at time zone 'America/Sao_Paulo')::date as day,
      'session:' || session_id as session_key
    from public.search_queries
    where created_at >= v_start_at
      and created_at < v_end_exclusive
      and session_id is not null
    union all
    select
      (created_at at time zone 'America/Sao_Paulo')::date as day,
      coalesce(
        'session:' || session_id,
        'user:' || user_id::text
      ) as session_key
    from public.post_view_events
    where created_at >= v_start_at
      and created_at < v_end_exclusive
      and (session_id is not null or user_id is not null)
  ),
  sessions_by_day as (
    select
      session_event.day,
      count(distinct session_event.session_key)::bigint as total
    from operational_session_events as session_event
    group by session_event.day
  ),
  ads_by_day as (
    select
      (created_at at time zone 'America/Sao_Paulo')::date as day,
      count(*) filter (
        where event_name = 'ad_click'
      )::bigint as ad_clicks,
      count(*) filter (
        where event_name = 'ad_impression'
      )::bigint as ad_impressions
    from public.privacy_analytics_events
    where created_at >= v_start_at
      and created_at < v_end_exclusive
      and event_name in ('ad_click', 'ad_impression')
    group by 1
  )
  select
    calendar.day,
    coalesce(posts_by_day.total, 0)::bigint,
    coalesce(comments_by_day.total, 0)::bigint,
    coalesce(searches_by_day.total, 0)::bigint,
    coalesce(votes_by_day.total, 0)::bigint,
    coalesce(admin_actions_by_day.total, 0)::bigint,
    coalesce(saves_by_day.total, 0)::bigint,
    coalesce(reports_by_day.total, 0)::bigint,
    coalesce(signups_by_day.total, 0)::bigint,
    coalesce(post_views_by_day.total, 0)::bigint,
    coalesce(comment_likes_by_day.total, 0)::bigint,
    coalesce(sessions_by_day.total, 0)::bigint,
    coalesce(ads_by_day.ad_clicks, 0)::bigint,
    coalesce(ads_by_day.ad_impressions, 0)::bigint
  from calendar
  left join posts_by_day using (day)
  left join comments_by_day using (day)
  left join searches_by_day using (day)
  left join votes_by_day using (day)
  left join admin_actions_by_day using (day)
  left join saves_by_day using (day)
  left join reports_by_day using (day)
  left join signups_by_day using (day)
  left join comment_likes_by_day using (day)
  left join post_views_by_day using (day)
  left join sessions_by_day using (day)
  left join ads_by_day using (day)
  order by calendar.day;
end;
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
  signups_count bigint,
  post_views_count bigint,
  comment_likes_count bigint,
  sessions_count bigint,
  ad_clicks_count bigint,
  ad_impressions_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_admin_dashboard_daily_metrics_impl($1)
$$;

-- ---------------------------------------------------------------------------
-- Public contributor ranking: quarter/year and module-correct comments.
-- ---------------------------------------------------------------------------

create or replace function kc_private.kc_get_top_contributors_impl(
  p_period text default 'month',
  p_module text default null,
  p_limit integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_jwt_role text := coalesce(nullif(auth.jwt() ->> 'role', ''), 'anon');
  v_period text := lower(trim(coalesce(p_period, 'month')));
  v_module text := nullif(trim(coalesce(p_module, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 100));
  v_since timestamptz;
  v_is_admin boolean;
  v_is_authenticated boolean;
  v_result jsonb;
begin
  v_is_admin := v_jwt_role = 'service_role'
    or (v_uid is not null and public.kc_is_admin(v_uid));
  v_is_authenticated := v_is_admin or v_jwt_role = 'authenticated';

  v_since := case v_period
    when 'day' then now() - interval '1 day'
    when 'week' then now() - interval '7 days'
    when 'month' then now() - interval '30 days'
    when 'quarter' then now() - interval '90 days'
    when 'year' then now() - interval '365 days'
    else now() - interval '30 days'
  end;

  with eligible_profiles as materialized (
    select
      profile_row.id,
      profile_row.display_name,
      profile_row.avatar_url
    from public.profiles as profile_row
    where v_is_authenticated
      or profile_row.profile_public is true
  ),
  visible_posts as materialized (
    select post_row.*
    from public.posts as post_row
    where post_row.author_id is not null
      and (v_module is null or post_row.module = v_module)
      and (
        v_is_admin
        or (
          post_row.status in ('published', 'closed')
          and (
            (
              v_is_authenticated
              and post_row.visibility in ('public', 'community')
            )
            or (
              not v_is_authenticated
              and post_row.visibility = 'public'
            )
          )
        )
      )
  ),
  period_posts as materialized (
    select post_row.*
    from visible_posts as post_row
    where post_row.created_at >= v_since
      and post_row.created_at <= now()
  ),
  user_posts as (
    select
      post_row.author_id,
      count(*)::bigint as posts_count,
      -- This is the current hot-minus-cold balance on posts created in the
      -- selected period, preserving the existing votes_received contract.
      coalesce(sum(post_row.votos), 0)::bigint as total_votes,
      coalesce(sum(post_row.coupon_clicks), 0)::bigint as total_coupon_clicks,
      coalesce(sum(post_row.share_count), 0)::bigint as total_shares
    from period_posts as post_row
    inner join eligible_profiles as profile_row
      on profile_row.id = post_row.author_id
    group by post_row.author_id
  ),
  user_comments as (
    select
      comment_row.author_id,
      count(*)::bigint as comments_count
    from public.comments as comment_row
    inner join visible_posts as comment_post
      on comment_post.id = comment_row.post_id
    inner join eligible_profiles as profile_row
      on profile_row.id = comment_row.author_id
    where comment_row.created_at >= v_since
      and comment_row.created_at <= now()
      and comment_row.author_id is not null
    group by comment_row.author_id
  ),
  user_penalties as (
    select
      post_row.author_id,
      count(distinct post_row.id)::bigint as penalty_count
    from public.posts as post_row
    inner join public.reports as report_row
      on report_row.post_id = post_row.id
      and report_row.status = 'closed'
    where v_is_admin
      and post_row.status = 'deleted'
      and post_row.created_at >= v_since
      and post_row.created_at <= now()
      and post_row.author_id is not null
      and (v_module is null or post_row.module = v_module)
    group by post_row.author_id
  ),
  scores as (
    select
      coalesce(user_posts.author_id, user_comments.author_id) as user_id,
      coalesce(user_posts.posts_count, 0)::bigint as posts_count,
      coalesce(user_posts.total_votes, 0)::bigint as votes_received,
      coalesce(user_comments.comments_count, 0)::bigint as comments_count,
      coalesce(user_posts.total_coupon_clicks, 0)::bigint as coupon_clicks,
      coalesce(user_posts.total_shares, 0)::bigint as share_count,
      case
        when v_is_admin then coalesce(user_penalties.penalty_count, 0)
        else 0
      end::bigint as penalties,
      greatest(
        0,
        coalesce(user_posts.posts_count, 0) * 15
          + coalesce(user_posts.total_votes, 0) * 10
          + coalesce(user_comments.comments_count, 0) * 5
          + coalesce(user_posts.total_coupon_clicks, 0) * 4
          + coalesce(user_posts.total_shares, 0) * 3
          - case
              when v_is_admin
                then coalesce(user_penalties.penalty_count, 0) * 50
              else 0
            end
      )::bigint as score
    from user_posts
    full outer join user_comments
      on user_posts.author_id = user_comments.author_id
    left join user_penalties
      on coalesce(user_posts.author_id, user_comments.author_id)
        = user_penalties.author_id
  ),
  ranked as (
    select
      scores.*,
      coalesce(
        nullif(trim(profile_row.display_name), ''),
        U&'Usu\00E1rio'
      ) as display_name,
      profile_row.avatar_url,
      row_number() over (
        order by scores.score desc, scores.posts_count desc, scores.user_id
      ) as rank
    from scores
    inner join eligible_profiles as profile_row
      on profile_row.id = scores.user_id
    where scores.score > 0
    order by scores.score desc, scores.posts_count desc, scores.user_id
    limit v_limit
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user_id', ranked.user_id,
      'display_name', ranked.display_name,
      'avatar_url', ranked.avatar_url,
      'rank', ranked.rank,
      'score', ranked.score,
      'posts_count', ranked.posts_count,
      'votes_received', ranked.votes_received,
      'comments_count', ranked.comments_count,
      'coupon_clicks', ranked.coupon_clicks,
      'share_count', ranked.share_count,
      'penalties', ranked.penalties
    )
    order by ranked.rank
  ), '[]'::jsonb)
  into v_result
  from ranked;

  return v_result;
end;
$$;

create or replace function public.kc_get_top_contributors(
  p_period text default 'month',
  p_module text default null,
  p_limit integer default 10
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select kc_private.kc_get_top_contributors_impl($1, $2, $3)
$$;

-- ---------------------------------------------------------------------------
-- Audit log: private admin worker and actor search by UUID or profile name.
-- ---------------------------------------------------------------------------

create or replace function kc_private.kc_admin_list_audit_logs_impl(
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
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_entity text := lower(trim(coalesce(p_entity_type, 'all')));
  v_action text := lower(trim(coalesce(p_action, 'all')));
  v_actor_query text := lower(nullif(trim(coalesce(p_actor_query, '')), ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 500));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_role <> 'service_role'
     and (v_uid is null or not public.kc_is_admin(v_uid)) then
    raise insufficient_privilege using message = 'admin access required';
  end if;

  return query
  select
    audit_row.id,
    audit_row.created_at,
    audit_row.action,
    audit_row.entity_type,
    audit_row.entity_id::text,
    audit_row.actor_id,
    audit_row.payload
  from public.audit_log as audit_row
  left join public.profiles as actor_profile
    on actor_profile.id = audit_row.actor_id
  where (v_entity = 'all' or lower(audit_row.entity_type) = v_entity)
    and (v_action = 'all' or lower(audit_row.action) = v_action)
    and (
      v_actor_query is null
      or position(v_actor_query in lower(coalesce(audit_row.actor_id::text, ''))) > 0
      or position(v_actor_query in lower(coalesce(actor_profile.display_name, ''))) > 0
      or position(v_actor_query in lower(coalesce(actor_profile.full_name, ''))) > 0
    )
    and (p_since is null or audit_row.created_at >= p_since)
  order by audit_row.created_at desc, audit_row.id desc
  offset v_offset
  limit v_limit;
end;
$$;

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
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_admin_list_audit_logs_impl(
    $1, $2, $3, $4, $5, $6
  )
$$;

-- Prior migrations deployed privileged workers under the public RPC names.
-- The new facades above call only the *_impl workers, so every stale overload
-- can be revoked and removed without cascading to the stable public contract.
do $$
declare
  v_orphan record;
begin
  for v_orphan in
    select format(
      '%I.%I(%s)',
      namespace_row.nspname,
      procedure_row.proname,
      pg_get_function_identity_arguments(procedure_row.oid)
    ) as signature
    from pg_catalog.pg_proc as procedure_row
    inner join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'kc_private'
      and procedure_row.proname in (
        'kc_get_top_contributors',
        'kc_admin_list_audit_logs'
      )
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      v_orphan.signature
    );
    execute format('drop function %s', v_orphan.signature);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Explicit least-privilege ACLs. No SECURITY DEFINER function is exposed in
-- public, avoiding database-linter warnings for anon/authenticated execution.
-- ---------------------------------------------------------------------------

revoke all on function kc_private.kc_record_privacy_consent_impl(
  text, text, boolean, boolean, text
) from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_record_privacy_consent_impl(
  text, text, boolean, boolean, text
) to anon, authenticated, service_role;

revoke all on function public.kc_record_privacy_consent(
  text, text, boolean, boolean, text
) from public, anon, authenticated, service_role;
grant execute on function public.kc_record_privacy_consent(
  text, text, boolean, boolean, text
) to anon, authenticated, service_role;

revoke all on function public.kc_prune_old_analytics()
  from public, anon, authenticated, service_role;
grant execute on function public.kc_prune_old_analytics()
  to service_role;

revoke all on function kc_private.kc_admin_privacy_analytics_impl(
  timestamptz, text, text, text, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_admin_privacy_analytics_impl(
  timestamptz, text, text, text, integer, integer
) to authenticated, service_role;

revoke all on function public.kc_admin_privacy_analytics(
  timestamptz, text, text, text, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.kc_admin_privacy_analytics(
  timestamptz, text, text, text, integer, integer
) to authenticated, service_role;

revoke all on function kc_private.kc_admin_dashboard_overview_impl(
  timestamptz, timestamptz, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_admin_dashboard_overview_impl(
  timestamptz, timestamptz, timestamptz
) to authenticated, service_role;

revoke all on function public.kc_admin_dashboard_overview(
  timestamptz, timestamptz, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.kc_admin_dashboard_overview(
  timestamptz, timestamptz, timestamptz
) to authenticated, service_role;

revoke all on function kc_private.kc_admin_dashboard_daily_metrics_impl(
  timestamptz
) from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_admin_dashboard_daily_metrics_impl(
  timestamptz
) to authenticated, service_role;

revoke all on function public.kc_admin_dashboard_daily_metrics(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_admin_dashboard_daily_metrics(timestamptz)
  to authenticated, service_role;

revoke all on function kc_private.kc_get_top_contributors_impl(
  text, text, integer
) from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_get_top_contributors_impl(
  text, text, integer
) to anon, authenticated, service_role;

revoke all on function public.kc_get_top_contributors(text, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_get_top_contributors(text, text, integer)
  to anon, authenticated, service_role;

revoke all on function kc_private.kc_admin_list_audit_logs_impl(
  text, text, text, integer, integer, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_admin_list_audit_logs_impl(
  text, text, text, integer, integer, timestamptz
) to authenticated, service_role;

revoke all on function public.kc_admin_list_audit_logs(
  text, text, text, integer, integer, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.kc_admin_list_audit_logs(
  text, text, text, integer, integer, timestamptz
) to authenticated, service_role;

comment on table public.privacy_consent_events is
  'Historico agregado de consentimento; armazena apenas hash de sessao e escolhas booleanas.';
comment on function public.kc_record_privacy_consent(
  text, text, boolean, boolean, text
) is
  'SECURITY INVOKER facade for validated, deduplicated and rate-limited consent recording in kc_private.';
comment on function public.kc_admin_privacy_analytics(
  timestamptz, text, text, text, integer, integer
) is
  'SECURITY INVOKER facade for admin-gated privacy analytics in kc_private.';
comment on function public.kc_admin_dashboard_overview(
  timestamptz, timestamptz, timestamptz
) is
  'SECURITY INVOKER facade for period-correct admin dashboard totals.';
comment on function public.kc_admin_dashboard_daily_metrics(timestamptz) is
  'Thirteen Sao Paulo calendar-day series for the admin operational pulse.';
comment on function public.kc_get_top_contributors(text, text, integer) is
  'Caller-aware contributor ranking: anonymous public data, authenticated community data and complete admin visibility.';
comment on function public.kc_admin_list_audit_logs(
  text, text, text, integer, integer, timestamptz
) is
  'Admin audit log with pagination and actor UUID/display/full-name search.';

notify pgrst, 'reload schema';

commit;

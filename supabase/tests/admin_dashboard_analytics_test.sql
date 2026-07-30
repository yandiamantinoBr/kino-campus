begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(92);

select extensions.has_table(
  'public',
  'privacy_consent_events',
  'privacy consent events table exists'
);
select extensions.ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.privacy_consent_events'::regclass
  ),
  'privacy consent events has RLS enabled'
);
select extensions.has_index(
  'public',
  'privacy_consent_events',
  'idx_privacy_consent_events_user_id',
  'privacy consent user foreign key has a covering index'
);
select extensions.has_index(
  'public',
  'reports',
  'idx_reports_status_created_at',
  'report backlog and period filters have a composite index'
);
select extensions.has_index(
  'public',
  'posts',
  'idx_posts_status_updated_at',
  'post status and moderation-time filters have a composite index'
);
select extensions.has_index(
  'public',
  'audit_log',
  'audit_log_created_at_id_desc_idx',
  'audit pagination has a deterministic created-at and id index'
);
select extensions.has_index(
  'public',
  'comment_likes',
  'idx_comment_likes_created_at',
  'daily comment-like aggregation has a temporal index'
);
select extensions.has_index(
  'public',
  'privacy_analytics_events',
  'idx_privacy_analytics_events_module_created',
  'privacy module and period filters have a partial composite index'
);

select extensions.is(
  (
    select count(*)::integer
    from pg_proc as procedure_row
    where procedure_row.oid = any (array[
      'public.kc_record_privacy_consent(text,text,boolean,boolean,text)'::regprocedure,
      'public.kc_admin_privacy_analytics(timestamptz,text,text,text,integer,integer)'::regprocedure,
      'public.kc_admin_dashboard_overview(timestamptz,timestamptz,timestamptz)'::regprocedure,
      'public.kc_admin_dashboard_daily_metrics(timestamptz)'::regprocedure,
      'public.kc_get_top_contributors(text,text,integer)'::regprocedure,
      'public.kc_admin_list_audit_logs(text,text,text,integer,integer,timestamptz)'::regprocedure
    ]::oid[])
      and procedure_row.prosecdef
  ),
  0,
  'all exposed dashboard and privacy RPCs are security invoker'
);
select extensions.is(
  (
    select count(*)::integer
    from pg_proc as procedure_row
    where procedure_row.oid = any (array[
      'kc_private.kc_record_privacy_consent_impl(text,text,boolean,boolean,text)'::regprocedure,
      'kc_private.kc_admin_privacy_analytics_impl(timestamptz,text,text,text,integer,integer)'::regprocedure,
      'kc_private.kc_admin_dashboard_overview_impl(timestamptz,timestamptz,timestamptz)'::regprocedure,
      'kc_private.kc_admin_dashboard_daily_metrics_impl(timestamptz)'::regprocedure,
      'kc_private.kc_get_top_contributors_impl(text,text,integer)'::regprocedure,
      'kc_private.kc_admin_list_audit_logs_impl(text,text,text,integer,integer,timestamptz)'::regprocedure
    ]::oid[])
      and procedure_row.prosecdef
  ),
  6,
  'privileged implementations are security definer in kc_private'
);
select extensions.is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc as procedure_row
    inner join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'kc_private'
      and procedure_row.proname = 'kc_get_top_contributors'
  ),
  0,
  'stale private contributor workers under the public RPC name are removed'
);
select extensions.is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc as procedure_row
    inner join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'kc_private'
      and procedure_row.proname = 'kc_admin_list_audit_logs'
  ),
  0,
  'stale private audit workers under the public RPC name are removed'
);
select extensions.is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc as procedure_row
    inner join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'kc_private'
      and procedure_row.proname in (
        'kc_get_top_contributors',
        'kc_admin_list_audit_logs'
      )
      and (
        has_function_privilege('anon', procedure_row.oid, 'execute')
        or has_function_privilege(
          'authenticated',
          procedure_row.oid,
          'execute'
        )
        or has_function_privilege(
          'service_role',
          procedure_row.oid,
          'execute'
        )
      )
  ),
  0,
  'no caller retains execute access to an orphan dashboard worker'
);
select extensions.ok(
  (
    select prosrc like '%kc_private.kc_record_privacy_consent_impl%'
    from pg_proc
    where oid =
      'public.kc_record_privacy_consent(text,text,boolean,boolean,text)'::regprocedure
  ),
  'consent facade delegates to the private validated implementation'
);
select extensions.ok(
  coalesce(current_setting('pgrst.db_schemas', true), '')
    !~ '(^|,)[[:space:]]*kc_private([[:space:]]*,|$)',
  'kc_private is not exposed through PostgREST'
);
select extensions.ok(
  (
    select proconfig @> array['search_path=""']
    from pg_proc
    where oid =
      'public.kc_admin_dashboard_overview(timestamptz,timestamptz,timestamptz)'::regprocedure
  ),
  'dashboard overview facade fixes its search path'
);
select extensions.ok(
  (
    select prosrc like '%kc_private.kc_admin_dashboard_overview_impl%'
    from pg_proc
    where oid =
      'public.kc_admin_dashboard_overview(timestamptz,timestamptz,timestamptz)'::regprocedure
  ),
  'dashboard overview facade delegates to the private implementation'
);
select extensions.ok(
  (
    select prosrc like '%kc_private.kc_admin_dashboard_daily_metrics_impl%'
    from pg_proc
    where oid =
      'public.kc_admin_dashboard_daily_metrics(timestamptz)'::regprocedure
  ),
  'daily metrics facade delegates to the private implementation'
);
select extensions.ok(
  (
    select prosrc like '%America/Sao_Paulo%'
    from pg_proc
    where oid =
      'kc_private.kc_admin_dashboard_daily_metrics_impl(timestamptz)'::regprocedure
  ),
  'daily metrics use the Sao Paulo reporting timezone'
);
select extensions.ok(
  (
    select prosrc like '%actor_profile.display_name%'
      and prosrc like '%actor_profile.full_name%'
      and prosrc like '%audit_row.id desc%'
    from pg_proc
    where oid =
      'kc_private.kc_admin_list_audit_logs_impl(text,text,text,integer,integer,timestamptz)'::regprocedure
  ),
  'audit actor search covers names and deterministic id ordering'
);
select extensions.is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'privacy_consent_events'
      and cmd = 'INSERT'
  ),
  0,
  'privacy consent has no direct insert policy'
);
select extensions.ok(
  not has_table_privilege(
    'anon',
    'public.privacy_consent_events',
    'insert'
  ),
  'anonymous callers cannot insert consent rows directly'
);
select extensions.ok(
  not has_table_privilege(
    'authenticated',
    'public.privacy_consent_events',
    'insert'
  ),
  'signed-in callers cannot insert consent rows directly'
);

select extensions.ok(
  has_function_privilege(
    'anon',
    'public.kc_record_privacy_consent(text,text,boolean,boolean,text)',
    'execute'
  ),
  'anonymous callers can record consent through the validated RPC'
);
select extensions.ok(
  has_function_privilege(
    'anon',
    'public.kc_get_top_contributors(text,text,integer)',
    'execute'
  ),
  'anonymous callers retain access to the public contributor ranking'
);
select extensions.ok(
  not has_function_privilege(
    'anon',
    'public.kc_admin_dashboard_overview(timestamptz,timestamptz,timestamptz)',
    'execute'
  ),
  'anonymous callers cannot execute dashboard overview'
);
select extensions.ok(
  not has_function_privilege(
    'anon',
    'public.kc_admin_dashboard_daily_metrics(timestamptz)',
    'execute'
  ),
  'anonymous callers cannot execute daily dashboard metrics'
);
select extensions.ok(
  not has_function_privilege(
    'anon',
    'kc_private.kc_admin_privacy_analytics_impl(timestamptz,text,text,text,integer,integer)',
    'execute'
  ),
  'anonymous callers cannot execute private admin privacy analytics'
);
select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.kc_admin_list_audit_logs(text,text,text,integer,integer,timestamptz)',
    'execute'
  ),
  'authenticated callers can reach the audit RPC admin gate'
);

insert into public.privacy_analytics_events (
  id,
  event_name,
  session_hash,
  page_path,
  created_at
)
values
  (
    '00000000-0000-4000-8000-0000000005a1',
    'search',
    repeat('1', 64),
    '/search-results.html',
    now() - interval '7 months'
  ),
  (
    '00000000-0000-4000-8000-0000000005a2',
    'search',
    repeat('2', 64),
    '/search-results.html',
    now() - interval '1 day'
  );

insert into public.privacy_consent_events (
  id,
  session_hash,
  consent_version,
  source,
  created_at
)
values
  (
    '00000000-0000-4000-8000-0000000005a3',
    repeat('3', 64),
    '2026-01-01',
    'user',
    now() - interval '7 months'
  ),
  (
    '00000000-0000-4000-8000-0000000005a4',
    repeat('4', 64),
    '2026-07-01',
    'user',
    now() - interval '1 day'
  );

set local role service_role;

select extensions.is(
  public.kc_prune_old_analytics() ->> 'ok',
  'true',
  'service role can execute the analytics retention cleanup'
);

reset role;

select extensions.ok(
  not exists (
    select 1
    from public.privacy_analytics_events
    where id = '00000000-0000-4000-8000-0000000005a1'
  )
    and exists (
      select 1
      from public.privacy_analytics_events
      where id = '00000000-0000-4000-8000-0000000005a2'
    )
    and not exists (
      select 1
      from public.privacy_consent_events
      where id = '00000000-0000-4000-8000-0000000005a3'
    )
    and exists (
      select 1
      from public.privacy_consent_events
      where id = '00000000-0000-4000-8000-0000000005a4'
    ),
  'retention removes privacy rows older than six months and keeps recent rows'
);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000551', 'dashboard-admin@example.test'),
  ('00000000-0000-4000-8000-000000000552', 'dashboard-actor@example.test'),
  ('00000000-0000-4000-8000-000000000553', 'dashboard-commenter@example.test'),
  ('00000000-0000-4000-8000-000000000554', 'dashboard-user@example.test'),
  ('00000000-0000-4000-8000-000000000555', 'dashboard-private@example.test'),
  ('00000000-0000-4000-8000-000000000556', 'dashboard-nameless@example.test');

insert into auth.sessions (id, user_id)
values
  (
    '10000000-0000-4000-8000-000000000551',
    '00000000-0000-4000-8000-000000000551'
  ),
  (
    '10000000-0000-4000-8000-000000000554',
    '00000000-0000-4000-8000-000000000554'
  );

insert into public.profiles (
  id,
  full_name,
  display_name,
  is_admin,
  profile_public,
  created_at
)
values
  (
    '00000000-0000-4000-8000-000000000551',
    'Dashboard Contract Admin',
    'Dashboard Admin',
    true,
    false,
    now() - interval '400 days'
  ),
  (
    '00000000-0000-4000-8000-000000000552',
    'Audit Actor Unique',
    'Dashboard Author',
    false,
    true,
    now() - interval '400 days'
  ),
  (
    '00000000-0000-4000-8000-000000000553',
    'Dashboard Commenter',
    'Scoped Commenter',
    false,
    true,
    now() - interval '400 days'
  ),
  (
    '00000000-0000-4000-8000-000000000554',
    'Dashboard Non Admin',
    'Non Admin',
    false,
    false,
    now() - interval '400 days'
  ),
  (
    '00000000-0000-4000-8000-000000000555',
    'Private Ranking Legal Name',
    'Private Ranker',
    false,
    false,
    now() - interval '400 days'
  ),
  (
    '00000000-0000-4000-8000-000000000556',
    'Sensitive Legal Name Must Stay Private',
    null,
    false,
    true,
    now() - interval '400 days'
  );

insert into public.posts (
  id,
  author_id,
  title,
  module,
  status,
  visibility,
  votos,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-4000-8000-000000000561',
    '00000000-0000-4000-8000-000000000552',
    'Quarter contributor post',
    'dashboard-alpha',
    'published',
    'public',
    3,
    now() - interval '60 days',
    now() - interval '60 days'
  ),
  (
    '00000000-0000-4000-8000-000000000562',
    '00000000-0000-4000-8000-000000000552',
    'Current dashboard post',
    'dashboard-beta',
    'published',
    'community',
    0,
    now() - interval '2 days',
    now() - interval '2 days'
  ),
  (
    '00000000-0000-4000-8000-000000000563',
    '00000000-0000-4000-8000-000000000555',
    'Authenticated community ranking post',
    'dashboard-private',
    'published',
    'community',
    2,
    now() - interval '2 days',
    now() - interval '2 days'
  ),
  (
    '00000000-0000-4000-8000-000000000564',
    '00000000-0000-4000-8000-000000000555',
    'Admin-only hidden ranking post',
    'dashboard-private',
    'hidden',
    'community',
    1,
    now() - interval '1 day',
    now() - interval '1 day'
  ),
  (
    '00000000-0000-4000-8000-000000000565',
    '00000000-0000-4000-8000-000000000552',
    'Deleted penalized ranking post',
    'dashboard-alpha',
    'deleted',
    'public',
    0,
    now() - interval '2 days',
    now() - interval '1 day'
  ),
  (
    '00000000-0000-4000-8000-000000000566',
    '00000000-0000-4000-8000-000000000556',
    'Public post without display name',
    'dashboard-alpha',
    'published',
    'public',
    0,
    now() - interval '2 days',
    now() - interval '2 days'
  ),
  (
    '00000000-0000-4000-8000-000000000567',
    '00000000-0000-4000-8000-000000000552',
    'Public closed ranking post',
    'dashboard-closed',
    'closed',
    'public',
    0,
    now() - interval '2 days',
    now() - interval '2 days'
  );

update public.posts
set
  coupon_clicks = 2,
  share_count = 1
where id = '00000000-0000-4000-8000-000000000561';

update public.posts
set
  votos = 99,
  coupon_clicks = 88,
  share_count = 77
where id = '00000000-0000-4000-8000-000000000565';

insert into public.comments (
  id,
  post_id,
  author_id,
  author_name,
  body,
  created_at
)
values
  (
    '00000000-0000-4000-8000-000000000571',
    '00000000-0000-4000-8000-000000000561',
    '00000000-0000-4000-8000-000000000553',
    'Scoped Commenter',
    'Module-scoped ranking comment',
    now() - interval '10 days'
  ),
  (
    '00000000-0000-4000-8000-000000000572',
    '00000000-0000-4000-8000-000000000565',
    '00000000-0000-4000-8000-000000000553',
    'Scoped Commenter',
    'Deleted-post comment must not earn ranking points',
    now() - interval '1 day'
  ),
  (
    '00000000-0000-4000-8000-000000000573',
    '00000000-0000-4000-8000-000000000564',
    '00000000-0000-4000-8000-000000000553',
    'Scoped Commenter',
    'Hidden-post comment remains visible to administrators',
    now() - interval '12 hours'
  );

insert into public.reports (
  id,
  post_id,
  reporter_id,
  reason,
  status,
  entity_type,
  created_at
)
values
  (
    '00000000-0000-4000-8000-000000000581',
    '00000000-0000-4000-8000-000000000561',
    '00000000-0000-4000-8000-000000000554',
    'other',
    'open',
    'post',
    now() - interval '120 days'
  ),
  (
    '00000000-0000-4000-8000-000000000582',
    '00000000-0000-4000-8000-000000000562',
    '00000000-0000-4000-8000-000000000554',
    'other',
    'closed',
    'post',
    now() - interval '2 days'
  ),
  (
    '00000000-0000-4000-8000-000000000583',
    '00000000-0000-4000-8000-000000000565',
    '00000000-0000-4000-8000-000000000554',
    'other',
    'closed',
    'post',
    now() - interval '1 day'
  );

insert into public.audit_log (
  id,
  actor_id,
  action,
  entity_type,
  entity_id,
  payload,
  created_at
)
values
  (
    '00000000-0000-4000-8000-000000000591',
    '00000000-0000-4000-8000-000000000552',
    'dashboard_contract_action',
    'dashboard_contract',
    '00000000-0000-4000-8000-000000000562',
    '{"source":"pgTAP"}'::jsonb,
    now() - interval '1 hour'
  ),
  (
    '00000000-0000-4000-8000-000000000592',
    '00000000-0000-4000-8000-000000000552',
    'dashboard_order',
    'dashboard_contract',
    '00000000-0000-4000-8000-000000000562',
    '{"order":1}'::jsonb,
    now() - interval '30 minutes'
  ),
  (
    '00000000-0000-4000-8000-000000000593',
    '00000000-0000-4000-8000-000000000552',
    'dashboard_order',
    'dashboard_contract',
    '00000000-0000-4000-8000-000000000562',
    '{"order":2}'::jsonb,
    now() - interval '30 minutes'
  );

insert into public.search_queries (
  term,
  user_id,
  session_id,
  created_at
)
values
  (
    'dashboard canonical query',
    null,
    repeat('c', 64),
    now() - interval '2 hours'
  ),
  (
    'dashboard active query',
    null,
    repeat('d', 64),
    now() - interval '5 minutes'
  );

insert into public.post_view_events (
  post_id,
  user_id,
  session_id,
  created_at
)
values
  (
    '00000000-0000-4000-8000-000000000562',
    null,
    repeat('c', 64),
    now() - interval '90 minutes'
  ),
  (
    '00000000-0000-4000-8000-000000000562',
    '00000000-0000-4000-8000-000000000554',
    null,
    now() - interval '1 hour'
  ),
  (
    '00000000-0000-4000-8000-000000000562',
    null,
    repeat('e', 64),
    now() - interval '5 minutes'
  );

insert into public.privacy_analytics_events (
  event_name,
  session_hash,
  page_path,
  entity_type,
  entity_id,
  module_key,
  metadata,
  created_at
)
values
  (
    'search',
    repeat('a', 64),
    '/search-results.html',
    null,
    null,
    null,
    '{"source":"search"}'::jsonb,
    now() - interval '2 hours'
  ),
  (
    'post_open',
    repeat('a', 64),
    '/produto.html',
    'post',
    '00000000-0000-4000-8000-000000000562',
    'dashboard-beta',
    '{}'::jsonb,
    now() - interval '90 minutes'
  ),
  (
    'ad_click',
    repeat('b', 64),
    '/',
    'ad_campaign',
    '00000000-0000-4000-8000-000000000599',
    null,
    '{}'::jsonb,
    (
      (now() at time zone 'America/Sao_Paulo')::date::timestamp
        + interval '30 minutes'
    ) at time zone 'America/Sao_Paulo'
  ),
  (
    'ad_impression',
    repeat('b', 64),
    '/',
    'ad_campaign',
    '00000000-0000-4000-8000-000000000599',
    null,
    '{}'::jsonb,
    (
      (
        (now() at time zone 'America/Sao_Paulo')::date - 1
      )::timestamp + interval '23 hours 30 minutes'
    ) at time zone 'America/Sao_Paulo'
  ),
  (
    'ad_click',
    repeat('c', 64),
    '/',
    'banner',
    '00000000-0000-4000-8000-0000000005a1',
    null,
    '{"fixture":"ghost_banner_ad_click"}'::jsonb,
    (
      (now() at time zone 'America/Sao_Paulo')::date::timestamp
        + interval '45 minutes'
    ) at time zone 'America/Sao_Paulo'
  ),
  (
    'ad_impression',
    repeat('d', 64),
    '/',
    'ad_campaign',
    '00000000-0000-4000-8000-0000000005a2',
    null,
    '{}'::jsonb,
    (
      (now() at time zone 'America/Sao_Paulo')::date::timestamp
        + interval '1 hour'
    ) at time zone 'America/Sao_Paulo'
  ),
  (
    'ad_impression',
    repeat('e', 64),
    '/',
    'banner',
    '00000000-0000-4000-8000-0000000005a3',
    null,
    '{"fixture":"wrong_entity_type"}'::jsonb,
    (
      (now() at time zone 'America/Sao_Paulo')::date::timestamp
        + interval '1 hour 15 minutes'
    ) at time zone 'America/Sao_Paulo'
  ),
  (
    'banner_click',
    repeat('f', 64),
    '/',
    'banner',
    '00000000-0000-4000-8000-0000000005a4',
    null,
    '{}'::jsonb,
    (
      (now() at time zone 'America/Sao_Paulo')::date::timestamp
        + interval '1 hour 30 minutes'
    ) at time zone 'America/Sao_Paulo'
  ),
  (
    'banner_click',
    repeat('g', 64),
    '/',
    'ad_campaign',
    '00000000-0000-4000-8000-0000000005a5',
    null,
    '{"fixture":"wrong_entity_type"}'::jsonb,
    (
      (now() at time zone 'America/Sao_Paulo')::date::timestamp
        + interval '1 hour 45 minutes'
    ) at time zone 'America/Sao_Paulo'
  ),
  (
    'banner_impression',
    repeat('h', 64),
    '/',
    'banner',
    '00000000-0000-4000-8000-0000000005a6',
    null,
    '{}'::jsonb,
    (
      (now() at time zone 'America/Sao_Paulo')::date::timestamp
        + interval '2 hours'
    ) at time zone 'America/Sao_Paulo'
  ),
  (
    'banner_impression',
    repeat('i', 64),
    '/',
    'ad_campaign',
    '00000000-0000-4000-8000-0000000005a7',
    null,
    '{"fixture":"wrong_entity_type"}'::jsonb,
    (
      (now() at time zone 'America/Sao_Paulo')::date::timestamp
        + interval '2 hours 15 minutes'
    ) at time zone 'America/Sao_Paulo'
  );

insert into public.privacy_consent_events (
  session_hash,
  user_id,
  consent_version,
  preferences_enabled,
  analytics_enabled,
  source,
  created_at
)
select
  encode(
    extensions.digest('dashboard_rate_session', 'sha256'),
    'hex'
  ),
  null,
  '2026-07-14',
  false,
  false,
  'user',
  now() - (rate_row * interval '1 minute')
from generate_series(1, 20) as rate_row;

set local role anon;

select extensions.is(
  public.kc_record_privacy_consent(
    'dashboard_session_123',
    '2026-07-14',
    true,
    true,
    'accept_all'
  ) ->> 'ok',
  'true',
  'anonymous consent recording succeeds'
);
select extensions.is(
  public.kc_record_privacy_consent(
    'dashboard_session_123',
    '2026-07-14',
    true,
    true,
    'accept_all'
  ) ->> 'deduplicated',
  'true',
  'repeated identical consent is deduplicated'
);
select extensions.is(
  public.kc_record_privacy_consent(
    'dashboard_invalid_date',
    '2026-02-30',
    true,
    true,
    'user'
  ) ->> 'code',
  'INVALID_VERSION',
  'consent version must be a real ISO calendar date'
);
select extensions.is(
  public.kc_record_privacy_consent(
    'dashboard_invalid_source',
    '2026-07-14',
    true,
    true,
    'banner'
  ) ->> 'code',
  'INVALID_SOURCE',
  'consent source must be in the explicit allowlist'
);
select extensions.is(
  public.kc_record_privacy_consent(
    'dashboard_rate_session',
    '2026-07-14',
    false,
    false,
    'user'
  ) ->> 'code',
  'RATE_LIMITED',
  'consent recording is rate limited per hashed session'
);
select extensions.throws_ok(
  $$insert into public.privacy_consent_events (
      session_hash,
      consent_version,
      source
    ) values (
      repeat('f', 64),
      '2026-07-14',
      'user'
    )$$,
  '42501',
  'permission denied for table privacy_consent_events',
  'anonymous callers cannot bypass the consent RPC with a direct insert'
);
select extensions.ok(
  exists (
    select 1
    from public.kc_get_top_contributors(
      'quarter',
      'dashboard-alpha',
      100
    ) as ranking_payload,
    lateral jsonb_array_elements(ranking_payload) as contributor
    where contributor ->> 'user_id' =
      '00000000-0000-4000-8000-000000000552'
  ),
  'quarter ranking includes a post created sixty days ago'
);
select extensions.ok(
  not exists (
    select 1
    from public.kc_get_top_contributors(
      'month',
      'dashboard-alpha',
      100
    ) as ranking_payload,
    lateral jsonb_array_elements(ranking_payload) as contributor
    where contributor ->> 'user_id' =
      '00000000-0000-4000-8000-000000000552'
  ),
  'month ranking excludes a post created sixty days ago'
);
select extensions.ok(
  exists (
    select 1
    from public.kc_get_top_contributors(
      'year',
      'dashboard-alpha',
      100
    ) as ranking_payload,
    lateral jsonb_array_elements(ranking_payload) as contributor
    where contributor ->> 'user_id' =
      '00000000-0000-4000-8000-000000000552'
  ),
  'year ranking includes the sixty-day contributor'
);
select extensions.ok(
  exists (
    select 1
    from public.kc_get_top_contributors(
      'month',
      'dashboard-alpha',
      100
    ) as ranking_payload,
    lateral jsonb_array_elements(ranking_payload) as contributor
    where contributor ->> 'user_id' =
      '00000000-0000-4000-8000-000000000553'
      and (contributor ->> 'comments_count')::bigint = 1
  ),
  'module-scoped comments contribute to the matching module'
);
select extensions.ok(
  not exists (
    select 1
    from public.kc_get_top_contributors(
      'month',
      'dashboard-beta',
      100
    ) as ranking_payload,
    lateral jsonb_array_elements(ranking_payload) as contributor
    where contributor ->> 'user_id' =
      '00000000-0000-4000-8000-000000000553'
  ),
  'module-scoped comments do not leak into another module'
);
select extensions.ok(
  not exists (
    select 1
    from public.kc_get_top_contributors(
      'month',
      'dashboard-private',
      100
    ) as ranking_payload,
    lateral jsonb_array_elements(ranking_payload) as contributor
    where contributor ->> 'user_id' =
      '00000000-0000-4000-8000-000000000555'
  ),
  'anonymous ranking excludes private profiles and community-only posts'
);
select extensions.ok(
  exists (
    select 1
    from public.kc_get_top_contributors(
      'month',
      'dashboard-closed',
      100
    ) as ranking_payload,
    lateral jsonb_array_elements(ranking_payload) as contributor
    where contributor ->> 'user_id' =
      '00000000-0000-4000-8000-000000000552'
  ),
  'anonymous ranking includes closed public posts from public profiles'
);
select extensions.is(
  (
    select contributor ->> 'display_name'
    from public.kc_get_top_contributors(
      'month',
      'dashboard-alpha',
      100
    ) as ranking_payload,
    lateral jsonb_array_elements(ranking_payload) as contributor
    where contributor ->> 'user_id' =
      '00000000-0000-4000-8000-000000000556'
  ),
  U&'Usu\00E1rio',
  'public ranking never falls back to the private full name'
);
select extensions.is(
  (
    select (contributor ->> 'penalties')::bigint
    from public.kc_get_top_contributors(
      'quarter',
      'dashboard-alpha',
      100
    ) as ranking_payload,
    lateral jsonb_array_elements(ranking_payload) as contributor
    where contributor ->> 'user_id' =
      '00000000-0000-4000-8000-000000000552'
  ),
  0::bigint,
  'anonymous ranking never exposes moderation penalties'
);

reset role;

select extensions.is(
  (
    select count(*)::bigint
    from public.privacy_consent_events
    where session_hash = encode(
      extensions.digest('dashboard_session_123', 'sha256'),
      'hex'
    )
  ),
  1::bigint,
  'consent RPC stores only the SHA-256 session hash'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000551","role":"authenticated","session_id":"10000000-0000-4000-8000-000000000551"}',
  true
);
set local role authenticated;

select extensions.is(
  (
    select (contributor ->> 'posts_count')::bigint
    from public.kc_get_top_contributors(
      'month',
      'dashboard-private',
      100
    ) as ranking_payload,
    lateral jsonb_array_elements(ranking_payload) as contributor
    where contributor ->> 'user_id' =
      '00000000-0000-4000-8000-000000000555'
  ),
  2::bigint,
  'admin ranking includes published and hidden posts from private profiles'
);
select extensions.is(
  (
    select (contributor ->> 'comments_count')::bigint
    from public.kc_get_top_contributors(
      'month',
      'dashboard-private',
      100
    ) as ranking_payload,
    lateral jsonb_array_elements(ranking_payload) as contributor
    where contributor ->> 'user_id' =
      '00000000-0000-4000-8000-000000000553'
  ),
  1::bigint,
  'admin ranking preserves comments attached to hidden posts'
);
select extensions.is(
  (
    select (contributor ->> 'posts_count')::bigint
    from public.kc_get_top_contributors(
      'quarter',
      'dashboard-alpha',
      100
    ) as ranking_payload,
    lateral jsonb_array_elements(ranking_payload) as contributor
    where contributor ->> 'user_id' =
      '00000000-0000-4000-8000-000000000552'
  ),
  1::bigint,
  'admin ranking excludes deleted posts from positive post totals'
);
select extensions.is(
  (
    select (contributor ->> 'coupon_clicks')::bigint
    from public.kc_get_top_contributors(
      'quarter',
      'dashboard-alpha',
      100
    ) as ranking_payload,
    lateral jsonb_array_elements(ranking_payload) as contributor
    where contributor ->> 'user_id' =
      '00000000-0000-4000-8000-000000000552'
  ),
  2::bigint,
  'admin ranking excludes coupon clicks from deleted posts'
);
select extensions.is(
  (
    select (contributor ->> 'share_count')::bigint
    from public.kc_get_top_contributors(
      'quarter',
      'dashboard-alpha',
      100
    ) as ranking_payload,
    lateral jsonb_array_elements(ranking_payload) as contributor
    where contributor ->> 'user_id' =
      '00000000-0000-4000-8000-000000000552'
  ),
  1::bigint,
  'admin ranking excludes shares from deleted posts'
);
select extensions.is(
  (
    select (contributor ->> 'comments_count')::bigint
    from public.kc_get_top_contributors(
      'quarter',
      'dashboard-alpha',
      100
    ) as ranking_payload,
    lateral jsonb_array_elements(ranking_payload) as contributor
    where contributor ->> 'user_id' =
      '00000000-0000-4000-8000-000000000553'
  ),
  1::bigint,
  'admin ranking excludes comments attached to deleted posts'
);
select extensions.is(
  (
    select (contributor ->> 'penalties')::bigint
    from public.kc_get_top_contributors(
      'quarter',
      'dashboard-alpha',
      100
    ) as ranking_payload,
    lateral jsonb_array_elements(ranking_payload) as contributor
    where contributor ->> 'user_id' =
      '00000000-0000-4000-8000-000000000552'
  ),
  1::bigint,
  'admin ranking includes moderation penalties'
);
select extensions.is(
  (
    select (contributor ->> 'votes_received')::bigint
    from public.kc_get_top_contributors(
      'quarter',
      'dashboard-alpha',
      100
    ) as ranking_payload,
    lateral jsonb_array_elements(ranking_payload) as contributor
    where contributor ->> 'user_id' =
      '00000000-0000-4000-8000-000000000552'
  ),
  3::bigint,
  'ranking votes_received preserves the current hot-minus-cold post balance'
);

select extensions.is(
  (
    public.kc_admin_dashboard_overview(
      now() - interval '7 days',
      now() + interval '1 second',
      now() - interval '14 days'
    ) -> 'reports' ->> 'open'
  )::bigint,
  (select count(*) from public.reports where status = 'open')::bigint,
  'overview open reports equals the complete current backlog'
);
select extensions.is(
  (
    public.kc_admin_dashboard_overview(
      now() - interval '7 days',
      now() + interval '1 second',
      now() - interval '14 days'
    ) -> 'reports' ->> 'total'
  )::bigint,
  (
    select count(*)
    from public.reports
    where created_at >= now() - interval '7 days'
      and created_at < now() + interval '1 second'
  )::bigint,
  'overview report total is scoped to the requested period'
);
select extensions.is(
  (
    public.kc_admin_dashboard_overview(
      now() - interval '7 days',
      now() + interval '1 second',
      now() - interval '14 days'
    ) -> 'privacy' ->> 'events'
  )::bigint,
  (
    (
      select count(*)
      from public.search_queries
      where created_at >= now() - interval '7 days'
        and created_at < now() + interval '1 second'
    )
    + (
      select count(*)
      from public.post_view_events
      where created_at >= now() - interval '7 days'
        and created_at < now() + interval '1 second'
    )
  )::bigint,
  'overview operational event total combines searches and post views'
);
select extensions.is(
  (
    public.kc_admin_dashboard_overview(
      now() - interval '7 days',
      now() + interval '1 second',
      now() - interval '14 days'
    ) -> 'privacy' ->> 'sessions'
  )::bigint,
  (
    select count(distinct session_key)
    from (
      select 'session:' || session_id as session_key
      from public.search_queries
      where created_at >= now() - interval '7 days'
        and created_at < now() + interval '1 second'
        and session_id is not null
      union all
      select coalesce(
        'session:' || session_id,
        'user:' || user_id::text
      )
      from public.post_view_events
      where created_at >= now() - interval '7 days'
        and created_at < now() + interval '1 second'
        and (session_id is not null or user_id is not null)
    ) as operational_sessions
  )::bigint,
  'overview sessions deduplicate operational search and post-view identities'
);
select extensions.is(
  (
    public.kc_admin_dashboard_overview(
      now() - interval '7 days',
      now() + interval '1 second',
      now() - interval '14 days'
    ) ->> 'searches'
  )::bigint,
  (
    select count(*)
    from public.search_queries
    where created_at >= now() - interval '7 days'
      and created_at < now() + interval '1 second'
  )::bigint,
  'overview search KPI matches the canonical search_queries source'
);
select extensions.is(
  (
    public.kc_admin_dashboard_overview(
      now() - interval '7 days',
      now() + interval '1 second',
      now() - interval '14 days'
    ) -> 'privacy' ->> 'searches'
  )::bigint,
  (
    select count(*)
    from public.search_queries
    where created_at >= now() - interval '7 days'
      and created_at < now() + interval '1 second'
  )::bigint,
  'overview privacy searches use the canonical search source'
);
select extensions.is(
  (
    public.kc_admin_dashboard_overview(
      now() - interval '7 days',
      now() + interval '1 second',
      now() - interval '14 days'
    ) -> 'privacy' ->> 'post_views'
  )::bigint,
  (
    select count(*)
    from public.post_view_events
    where created_at >= now() - interval '7 days'
      and created_at < now() + interval '1 second'
  )::bigint,
  'overview post views use the operational post_view_events source'
);
select extensions.is(
  (
    public.kc_admin_dashboard_overview(
      now() - interval '7 days',
      now() + interval '1 second',
      now() - interval '14 days'
    ) ->> 'active_15m'
  )::bigint,
  (
    select count(distinct session_key)
    from (
      select 'session:' || session_id as session_key
      from public.search_queries
      where created_at >= now() - interval '15 minutes'
        and created_at < now()
        and session_id is not null
      union all
      select coalesce(
        'session:' || session_id,
        'user:' || user_id::text
      )
      from public.post_view_events
      where created_at >= now() - interval '15 minutes'
        and created_at < now()
        and (session_id is not null or user_id is not null)
    ) as active_sessions
  )::bigint,
  'active fifteen-minute users come from operational search and view sources'
);
select extensions.is(
  (
    select count(*)::integer
    from public.kc_admin_dashboard_daily_metrics(
      (
        (now() at time zone 'America/Sao_Paulo')::date - 6
      )::timestamp at time zone 'America/Sao_Paulo'
    )
  ),
  7,
  'seven requested days produce exactly seven calendar buckets'
);
select extensions.is(
  (
    select count(*)::integer
    from public.kc_admin_dashboard_daily_metrics(null)
  ),
  30,
  'null daily period defaults to exactly thirty Sao Paulo calendar days'
);
select extensions.ok(
  (
    select bool_and(bucket_count = requested_days)
    from (
      select
        period.requested_days,
        (
          select count(*)::integer
          from public.kc_admin_dashboard_daily_metrics(
            (
              (
                now() at time zone 'America/Sao_Paulo'
              )::date - (period.requested_days - 1)
            )::timestamp at time zone 'America/Sao_Paulo'
          )
        ) as bucket_count
      from (
        values (1), (7), (30), (90), (365)
      ) as period(requested_days)
    ) as checked_periods
  ),
  'dashboard periods produce exactly 1, 7, 30, 90 and 365 buckets'
);
select extensions.is(
  (
    select count(*)::integer
    from public.kc_admin_dashboard_daily_metrics(now() - interval '7 days')
      as metric_row,
    lateral jsonb_object_keys(to_jsonb(metric_row) - 'day')
    where metric_row.day = (
      now() at time zone 'America/Sao_Paulo'
    )::date
  ),
  13,
  'daily pulse returns all thirteen metric series'
);
select extensions.is(
  (
    select sum(metric_row.post_views_count)::bigint
    from public.kc_admin_dashboard_daily_metrics(
      (
        (now() at time zone 'America/Sao_Paulo')::date - 6
      )::timestamp at time zone 'America/Sao_Paulo'
    ) as metric_row
  ),
  (
    select count(*)::bigint
    from public.post_view_events
    where created_at >= (
      (
        (now() at time zone 'America/Sao_Paulo')::date - 6
      )::timestamp at time zone 'America/Sao_Paulo'
    )
      and created_at < (
        (
          (now() at time zone 'America/Sao_Paulo')::date + 1
        )::timestamp at time zone 'America/Sao_Paulo'
      )
  ),
  'daily post views come from post_view_events'
);
select extensions.is(
  (
    select sum(metric_row.sessions_count)::bigint
    from public.kc_admin_dashboard_daily_metrics(
      (
        (now() at time zone 'America/Sao_Paulo')::date - 6
      )::timestamp at time zone 'America/Sao_Paulo'
    ) as metric_row
  ),
  (
    select coalesce(sum(day_sessions.total), 0)::bigint
    from (
      select
        session_event.day,
        count(distinct session_event.session_key)::bigint as total
      from (
        select
          (created_at at time zone 'America/Sao_Paulo')::date as day,
          'session:' || session_id as session_key
        from public.search_queries
        where created_at >= (
          (
            (now() at time zone 'America/Sao_Paulo')::date - 6
          )::timestamp at time zone 'America/Sao_Paulo'
        )
          and created_at < (
            (
              (now() at time zone 'America/Sao_Paulo')::date + 1
            )::timestamp at time zone 'America/Sao_Paulo'
          )
          and session_id is not null
        union all
        select
          (created_at at time zone 'America/Sao_Paulo')::date,
          coalesce(
            'session:' || session_id,
            'user:' || user_id::text
          )
        from public.post_view_events
        where created_at >= (
          (
            (now() at time zone 'America/Sao_Paulo')::date - 6
          )::timestamp at time zone 'America/Sao_Paulo'
        )
          and created_at < (
            (
              (now() at time zone 'America/Sao_Paulo')::date + 1
            )::timestamp at time zone 'America/Sao_Paulo'
          )
          and (session_id is not null or user_id is not null)
      ) as session_event
      group by session_event.day
    ) as day_sessions
  ),
  'daily sessions combine canonical searches and post views'
);
select extensions.is(
  (
    select metric_row.ad_clicks_count
    from public.kc_admin_dashboard_daily_metrics(now() - interval '7 days')
      as metric_row
    where metric_row.day = (
      now() at time zone 'America/Sao_Paulo'
    )::date
  ),
  (
    select count(*)::bigint
    from public.privacy_analytics_events
    where event_name = 'ad_click'
      and entity_type = 'ad_campaign'
      and (created_at at time zone 'America/Sao_Paulo')::date = (
        now() at time zone 'America/Sao_Paulo'
      )::date
  ),
  'daily ad clicks require the canonical campaign entity type'
);
select extensions.is(
  (
    select metric_row.ad_impressions_count
    from public.kc_admin_dashboard_daily_metrics(now() - interval '7 days')
      as metric_row
    where metric_row.day = (
      now() at time zone 'America/Sao_Paulo'
    )::date
  ),
  (
    select count(*)::bigint
    from public.privacy_analytics_events
    where event_name = 'ad_impression'
      and entity_type = 'ad_campaign'
      and (created_at at time zone 'America/Sao_Paulo')::date = (
        now() at time zone 'America/Sao_Paulo'
      )::date
  ),
  'daily ad impressions require the canonical campaign entity type'
);
select extensions.is(
  (
    public.kc_admin_privacy_analytics(
      now() - interval '7 days',
      'all',
      'all',
      'all',
      1000,
      0
    ) -> 'totals' ->> 'banner_clicks'
  )::bigint,
  (
    select count(*)::bigint
    from public.privacy_analytics_events
    where event_name = 'banner_click'
      and entity_type = 'banner'
      and created_at >= now() - interval '7 days'
  ),
  'banner click totals require the canonical banner entity type'
);
select extensions.is(
  (
    public.kc_admin_privacy_analytics(
      now() - interval '7 days',
      'all',
      'all',
      'all',
      1000,
      0
    ) -> 'totals' ->> 'banner_impressions'
  )::bigint,
  (
    select count(*)::bigint
    from public.privacy_analytics_events
    where event_name = 'banner_impression'
      and entity_type = 'banner'
      and created_at >= now() - interval '7 days'
  ),
  'banner impression totals require the canonical banner entity type'
);
select extensions.ok(
  not exists (
    select 1
    from jsonb_array_elements(
      public.kc_admin_privacy_analytics(
        now() - interval '7 days',
        'all',
        'all',
        'all',
        1000,
        0
      ) -> 'banners'
    ) as banner_row
    where banner_row ->> 'entity_id' =
      '00000000-0000-4000-8000-0000000005a1'
  ),
  'banner aggregate excludes ad clicks mislabeled with banner entity type'
);
select extensions.is(
  (
    public.kc_admin_privacy_analytics(
      now() - interval '7 days',
      'all',
      'all',
      'all',
      1000,
      0
    ) -> 'totals' ->> 'searches'
  )::bigint,
  (
    select count(*)::bigint
    from public.search_queries
    where created_at >= now() - interval '7 days'
  ),
  'detailed privacy analytics uses canonical search_queries totals'
);
select extensions.is(
  (
    public.kc_admin_privacy_analytics(
      now() - interval '7 days',
      'search',
      'all',
      'all',
      1000,
      0
    ) -> 'totals' ->> 'searches'
  )::bigint,
  (
    select count(*)::bigint
    from public.search_queries
    where created_at >= now() - interval '7 days'
  ),
  'canonical searches are included when the event filter is search'
);
select extensions.is(
  (
    public.kc_admin_privacy_analytics(
      now() - interval '7 days',
      'post_open',
      'all',
      'all',
      1000,
      0
    ) -> 'totals' ->> 'searches'
  )::bigint,
  0::bigint,
  'canonical searches are excluded for a non-search event filter'
);
select extensions.is(
  (
    public.kc_admin_privacy_analytics(
      now() - interval '7 days',
      'all',
      '/search-results.html',
      'all',
      1000,
      0
    ) -> 'totals' ->> 'searches'
  )::bigint,
  (
    select count(*)::bigint
    from public.search_queries
    where created_at >= now() - interval '7 days'
  ),
  'canonical searches accept the normalized search results path'
);
select extensions.is(
  (
    public.kc_admin_privacy_analytics(
      now() - interval '7 days',
      'all',
      'search-results.html',
      'all',
      1000,
      0
    ) -> 'totals' ->> 'searches'
  )::bigint,
  (
    select count(*)::bigint
    from public.search_queries
    where created_at >= now() - interval '7 days'
  ),
  'canonical searches retain slashless legacy path compatibility'
);
select extensions.is(
  (
    public.kc_admin_privacy_analytics(
      now() - interval '7 days',
      'all',
      '/produto.html',
      'all',
      1000,
      0
    ) -> 'totals' ->> 'searches'
  )::bigint,
  0::bigint,
  'canonical searches are excluded for unrelated page filters'
);
select extensions.is(
  (
    public.kc_admin_privacy_analytics(
      now() - interval '7 days',
      'all',
      'all',
      'dashboard-beta',
      1000,
      0
    ) -> 'totals' ->> 'searches'
  )::bigint,
  0::bigint,
  'canonical searches are excluded when a module filter is active'
);
select extensions.is(
  (
    public.kc_admin_privacy_analytics(
      now() - interval '7 days',
      'all',
      'all',
      'all',
      1000,
      0
    ) -> 'totals' ->> 'sessions'
  )::bigint,
  (
    select count(distinct session_hash)
    from public.privacy_analytics_events
    where created_at >= now() - interval '7 days'
  )::bigint,
  'detailed privacy analytics returns distinct hashed sessions'
);
select extensions.is(
  (
    select count(*)::integer
    from public.kc_admin_list_audit_logs(
      'all',
      'all',
      'audit actor unique',
      50,
      0,
      now() - interval '1 day'
    )
    where id = '00000000-0000-4000-8000-000000000591'
  ),
  1,
  'audit actor filter matches full name'
);
select extensions.is(
  (
    select count(*)::integer
    from public.kc_admin_list_audit_logs(
      'all',
      'all',
      '00000000-0000-4000-8000-000000000552',
      50,
      0,
      now() - interval '1 day'
    )
    where id = '00000000-0000-4000-8000-000000000591'
  ),
  1,
  'audit actor filter still matches UUID'
);
select extensions.results_eq(
  $$select id
    from public.kc_admin_list_audit_logs(
      'dashboard_contract',
      'dashboard_order',
      null,
      2,
      0,
      now() - interval '1 day'
    )$$,
  $$values
    ('00000000-0000-4000-8000-000000000593'::uuid),
    ('00000000-0000-4000-8000-000000000592'::uuid)$$,
  'audit rows with the same timestamp are ordered by id descending'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000554","role":"authenticated","session_id":"10000000-0000-4000-8000-000000000554"}',
  true
);
set local role authenticated;

select extensions.is(
  (
    select (contributor ->> 'posts_count')::bigint
    from public.kc_get_top_contributors(
      'month',
      'dashboard-private',
      100
    ) as ranking_payload,
    lateral jsonb_array_elements(ranking_payload) as contributor
    where contributor ->> 'user_id' =
      '00000000-0000-4000-8000-000000000555'
  ),
  1::bigint,
  'non-admin signed-in ranking sees community posts but excludes hidden posts'
);
select extensions.is(
  (
    select (contributor ->> 'penalties')::bigint
    from public.kc_get_top_contributors(
      'quarter',
      'dashboard-alpha',
      100
    ) as ranking_payload,
    lateral jsonb_array_elements(ranking_payload) as contributor
    where contributor ->> 'user_id' =
      '00000000-0000-4000-8000-000000000552'
  ),
  0::bigint,
  'non-admin signed-in ranking does not expose penalties'
);
select extensions.throws_ok(
  $$insert into public.privacy_consent_events (
      session_hash,
      consent_version,
      source
    ) values (
      repeat('9', 64),
      '2026-07-14',
      'user'
    )$$,
  '42501',
  'permission denied for table privacy_consent_events',
  'signed-in callers cannot bypass the consent RPC with a direct insert'
);

select extensions.is(
  public.kc_admin_dashboard_overview(
    now() - interval '7 days',
    now(),
    now() - interval '14 days'
  ) ->> 'code',
  'FORBIDDEN',
  'non-admin overview calls are denied'
);
select extensions.is(
  public.kc_admin_privacy_analytics(
    now() - interval '7 days',
    'all',
    'all',
    'all',
    10,
    0
  ) ->> 'code',
  'FORBIDDEN',
  'non-admin privacy analytics calls are denied'
);
select extensions.throws_ok(
  $$select count(*) from public.kc_admin_dashboard_daily_metrics(now() - interval '7 days')$$,
  '42501',
  'admin access required',
  'non-admin daily metric calls are denied'
);
select extensions.throws_ok(
  $$select count(*) from public.kc_admin_list_audit_logs('all', 'all', null, 10, 0, null)$$,
  '42501',
  'admin access required',
  'non-admin audit calls are denied'
);

select * from extensions.finish();

rollback;

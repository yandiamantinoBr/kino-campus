begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(30);

select extensions.has_table('public', 'search_queries', 'search analytics table exists');
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.search_queries'::regclass),
  'search queries has RLS enabled'
);
select extensions.is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'search_queries'),
  1,
  'search queries keeps only the admin select policy'
);
select extensions.ok(
  not has_table_privilege('anon', 'public.search_queries', 'insert'),
  'anon cannot insert search queries directly'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.search_queries', 'insert'),
  'authenticated cannot insert search queries directly'
);
select extensions.ok(
  has_function_privilege('anon', 'public.kc_ingest_search_queries(text,jsonb)', 'execute'),
  'anon can execute validated search ingestion'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.kc_ingest_search_queries(text,jsonb)', 'execute'),
  'authenticated can execute validated search ingestion'
);
select extensions.ok(
  not has_function_privilege('service_role', 'public.kc_ingest_search_queries(text,jsonb)', 'execute'),
  'service role is not an undocumented search ingestion caller'
);
select extensions.ok(
  has_function_privilege('anon', 'public.kc_track_privacy_event(text,text,text,text,text,text,jsonb)', 'execute'),
  'anon can execute validated privacy event ingestion'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.kc_track_privacy_event(text,text,text,text,text,text,jsonb)', 'execute'),
  'authenticated can execute validated privacy event ingestion'
);
select extensions.ok(
  not has_function_privilege('service_role', 'public.kc_track_privacy_event(text,text,text,text,text,text,jsonb)', 'execute'),
  'service role is not an undocumented privacy event ingestion caller'
);
select extensions.ok(
  to_regprocedure('kc_private.kc_admin_search_trends(integer,timestamp with time zone)') is null
  or not has_function_privilege(
    'authenticated',
    'kc_private.kc_admin_search_trends(integer,timestamp with time zone)',
    'execute'
  ),
  'authenticated cannot execute the private search trends worker'
);
select extensions.ok(
  to_regprocedure('kc_private.kc_admin_search_trends_classified(integer,timestamp with time zone)') is null
  or not has_function_privilege(
    'authenticated',
    'kc_private.kc_admin_search_trends_classified(integer,timestamp with time zone)',
    'execute'
  ),
  'authenticated cannot execute the private classified trends worker'
);

select extensions.is(
  (public.kc_ingest_search_queries(
    'pgtapsafesession20260714',
    '[{"term":"auditoria busca segura"}]'::jsonb
  ) ->> 'inserted'),
  '1',
  'a valid search is ingested'
);
select extensions.ok(
  exists (
    select 1
    from public.search_queries query_row
    where query_row.term = 'auditoria busca segura'
      and query_row.user_id is null
      and query_row.session_id = encode(
        extensions.digest('pgtapsafesession20260714', 'sha256'),
        'hex'
      )
      and query_row.session_id <> 'pgtapsafesession20260714'
      and query_row.created_at between transaction_timestamp() - interval '5 seconds' and now() + interval '5 seconds'
  ),
  'search identity and timestamp are fixed by the server'
);
select extensions.is(
  public.kc_ingest_search_queries(
    'pgtapscalarsession20260714',
    '[5,"bad",null,{"term":"segunda busca valida"}]'::jsonb
  ),
  '{"ok": true, "inserted": 1, "rejected": 3}'::jsonb,
  'scalar batch entries are rejected without raising'
);
select extensions.is(
  public.kc_ingest_search_queries(
    'pgtapsensitivesession20260714',
    jsonb_build_array(
      jsonb_build_object('term', 'procure fulano 11 99999-9999'),
      jsonb_build_object('term', 'edital 2026 para fulano 11 99999-9999 protocolo 123456'),
      jsonb_build_object('term', 'example.io'),
      jsonb_build_object('term', 'foo(example.com)'),
      jsonb_build_object('term', 'veja(https://example.com/segredo)'),
      jsonb_build_object('term', 'access_token=abc123'),
      jsonb_build_object('term', E'termo\u0001controle')
    )
  ),
  '{"ok": true, "inserted": 0, "rejected": 7}'::jsonb,
  'contact, URL, credential and control patterns are never persisted'
);
select extensions.is(
  public.kc_track_privacy_event(
    'search', 'pgtapinvalidmetadata20260714', '/', null, null, null, '[]'::jsonb
  ) ->> 'code',
  'INVALID_METADATA',
  'array metadata is rejected without raising'
);
select extensions.is(
  public.kc_track_privacy_event(
    'search', 'pgtapinvalidmetadata20260714', '/', null, null, null, '"scalar"'::jsonb
  ) ->> 'code',
  'INVALID_METADATA',
  'scalar metadata is rejected without raising'
);
select extensions.is(
  public.kc_track_privacy_event(
    'search',
    'pgtapprivacysearch20260714',
    '/profile.html?q=segredo',
    'profile',
    'caller-controlled-id',
    'caller-module',
    '{"value":"termo bruto","source":"results-submit","query_length_bucket":"9_16"}'::jsonb
  ) ->> 'ok',
  'true',
  'aggregate search event is accepted'
);
select extensions.ok(
  exists (
    select 1
    from public.privacy_analytics_events event_row
    where event_row.session_hash = encode(
      extensions.digest('pgtapprivacysearch20260714', 'sha256'),
      'hex'
    )
      and event_row.event_name = 'search'
      and event_row.user_id is null
      and event_row.entity_type is null
      and event_row.entity_id is null
      and event_row.module_key is null
      and event_row.page_path = '/search-results.html'
      and event_row.metadata = '{"source":"results-submit","query_length_bucket":"9_16"}'::jsonb
      and not (event_row.metadata ?| array['value', 'term', 'q', 'query', 'search_term'])
  ),
  'search privacy event contains only aggregate allowlisted fields'
);

select extensions.is(
  public.kc_track_privacy_event(
  'ad_click',
  'pgtapprivacysensitivemeta20260714',
  '/11999999999',
  'ad_campaign',
  '11 99999-9999',
  'eventos',
  jsonb_build_object(
    'source', 'feed_inline',
    'href', 'javascript:alert(1)',
    'entity_label', 'Contato 11 99999-9999',
    'reason', repeat('A', 40)
  )
  ) ->> 'ok',
  'true',
  'privacy RPC accepts the aggregate part of a mixed payload'
);
select extensions.ok(
  exists (
    select 1
    from public.privacy_analytics_events event_row
    where event_row.session_hash = encode(
      extensions.digest('pgtapprivacysensitivemeta20260714', 'sha256'),
      'hex'
    )
      and event_row.event_name = 'ad_click'
      and event_row.page_path = '/'
      and event_row.entity_id is null
      and event_row.metadata = '{"source":"feed_inline"}'::jsonb
  ),
  'privacy RPC discards phone, opaque token and arbitrary destination values'
);

select extensions.is(
  public.kc_ingest_search_queries(
    'pgtapratelimitsession20260714',
    (select jsonb_agg(jsonb_build_object('term', 'busca lote a ' || item)) from generate_series(1, 12) item)
  ) ->> 'inserted',
  '12',
  'first rate-limit batch is accepted'
);
select extensions.is(
  public.kc_ingest_search_queries(
    'pgtapratelimitsession20260714',
    (select jsonb_agg(jsonb_build_object('term', 'busca lote b ' || item)) from generate_series(1, 12) item)
  ) ->> 'inserted',
  '12',
  'second rate-limit batch is accepted'
);
select extensions.is(
  public.kc_ingest_search_queries(
    'pgtapratelimitsession20260714',
    '[{"term":"busca excedente"}]'::jsonb
  ) ->> 'code',
  'RATE_LIMITED',
  'session rate limit blocks the next burst'
);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000551', 'search-nonadmin@example.test'),
  ('00000000-0000-4000-8000-000000000552', 'search-admin@example.test');
insert into public.profiles (id, is_admin, full_name)
values
  ('00000000-0000-4000-8000-000000000551', false, 'Search Contract Member'),
  ('00000000-0000-4000-8000-000000000552', true, 'Search Contract Admin');

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000551","role":"authenticated"}',
  true
);
set local role authenticated;
select extensions.throws_ok(
  $$select * from public.kc_admin_search_trends(10, now() - interval '30 days')$$,
  '42501',
  'admin access required',
  'non-admin cannot read raw search trends'
);
select extensions.throws_ok(
  $$select * from public.kc_admin_search_trends_classified(10, now() - interval '30 days')$$,
  '42501',
  'admin access required',
  'non-admin cannot read classified raw search trends'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000552","role":"authenticated"}',
  true
);
set local role authenticated;
select extensions.lives_ok(
  $$select * from public.kc_admin_search_trends(10, now() - interval '30 days')$$,
  'admin can read raw search trends'
);
select extensions.lives_ok(
  $$select * from public.kc_admin_search_trends_classified(10, now() - interval '30 days')$$,
  'admin can read classified search trends'
);
reset role;

select * from extensions.finish();

rollback;

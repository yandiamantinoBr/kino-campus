begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(20);

select extensions.has_table(
  'public',
  'privacy_analytics_events',
  'privacy analytics event table exists'
);
select extensions.has_table(
  'public',
  'privacy_consent_events',
  'privacy consent event table exists'
);
select extensions.has_index(
  'public',
  'privacy_consent_events',
  'idx_privacy_consent_events_user_id',
  'consent user foreign key has a covering index'
);

select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.privacy_analytics_events'::regclass),
  'privacy analytics events has RLS enabled'
);
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.privacy_consent_events'::regclass),
  'privacy consent events has RLS enabled'
);
select extensions.is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'privacy_analytics_events'),
  1,
  'privacy analytics events keeps only the admin select policy'
);
select extensions.is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'privacy_consent_events'),
  2,
  'privacy consent events has insert and admin select policies'
);

select extensions.ok(
  not has_table_privilege('anon', 'public.privacy_analytics_events', 'select'),
  'anon cannot read privacy analytics events'
);
select extensions.ok(
  not has_column_privilege('anon', 'public.privacy_analytics_events', 'event_name', 'insert'),
  'anon cannot bypass the validated analytics RPC with direct inserts'
);
select extensions.ok(
  not has_column_privilege('anon', 'public.privacy_analytics_events', 'created_at', 'insert'),
  'anon cannot override analytics event timestamps'
);
select extensions.ok(
  not has_table_privilege('anon', 'public.privacy_consent_events', 'select'),
  'anon cannot read privacy consent events'
);
select extensions.ok(
  has_column_privilege('anon', 'public.privacy_consent_events', 'session_hash', 'insert'),
  'anon can insert validated consent columns through the invoker RPC'
);
select extensions.ok(
  not has_column_privilege('anon', 'public.privacy_consent_events', 'created_at', 'insert'),
  'anon cannot override consent timestamps'
);
select extensions.ok(
  has_table_privilege('authenticated', 'public.privacy_consent_events', 'select'),
  'authenticated users can reach admin-select RLS evaluation'
);

select extensions.ok(
  has_function_privilege('anon', 'public.kc_track_privacy_event(text,text,text,text,text,text,jsonb)', 'execute'),
  'anon can execute validated analytics tracking RPC'
);
select extensions.ok(
  has_function_privilege('anon', 'public.kc_record_privacy_consent(text,text,boolean,boolean,text)', 'execute'),
  'anon can execute validated consent RPC'
);
select extensions.ok(
  not has_function_privilege('anon', 'public.kc_admin_privacy_analytics(timestamptz,text,text,text,integer,integer)', 'execute'),
  'anon cannot execute admin privacy analytics RPC'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.kc_admin_privacy_analytics(timestamptz,text,text,text,integer,integer)', 'execute'),
  'authenticated users can reach the RPC admin authorization check'
);
select extensions.ok(
  not has_function_privilege('authenticated', 'public.kc_prune_old_analytics()', 'execute'),
  'authenticated users cannot execute retention cleanup'
);
select extensions.ok(
  has_function_privilege('service_role', 'public.kc_prune_old_analytics()', 'execute'),
  'service role can execute retention cleanup'
);

select * from extensions.finish();

rollback;

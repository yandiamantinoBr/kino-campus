begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(7);

select extensions.ok(
  to_regprocedure('public.kc_trigger_notification_dispatch(text,integer,boolean,text)') is not null,
  'notification dispatcher trigger exists'
);
select extensions.ok(
  (select prosecdef from pg_proc where oid = 'public.kc_trigger_notification_dispatch(text,integer,boolean,text)'::regprocedure),
  'notification dispatcher trigger remains security definer'
);
select extensions.is(
  (select proconfig from pg_proc where oid = 'public.kc_trigger_notification_dispatch(text,integer,boolean,text)'::regprocedure),
  array['search_path=""']::text[],
  'notification dispatcher trigger pins an empty search path'
);
select extensions.ok(
  (select prosrc like '%timeout_milliseconds := 30000%' from pg_proc where oid = 'public.kc_trigger_notification_dispatch(text,integer,boolean,text)'::regprocedure),
  'notification dispatcher waits up to 30 seconds for the async response'
);
select extensions.ok(
  not has_function_privilege('anon', 'public.kc_trigger_notification_dispatch(text,integer,boolean,text)', 'execute'),
  'anon cannot trigger privileged notification dispatch'
);
select extensions.ok(
  not has_function_privilege('authenticated', 'public.kc_trigger_notification_dispatch(text,integer,boolean,text)', 'execute'),
  'authenticated users cannot trigger privileged notification dispatch'
);
select extensions.ok(
  has_function_privilege('service_role', 'public.kc_trigger_notification_dispatch(text,integer,boolean,text)', 'execute'),
  'service role can trigger notification dispatch'
);

select * from extensions.finish();

rollback;

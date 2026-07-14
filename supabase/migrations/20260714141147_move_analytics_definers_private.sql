-- Keep privileged analytics implementations out of PostgREST's exposed
-- schemas. Public RPC names remain stable, but are SECURITY INVOKER wrappers.

begin;

create schema if not exists kc_private;
revoke all on schema kc_private from public;
grant usage on schema kc_private to anon, authenticated, service_role;

-- Fail atomically on drift. Renaming preserves the already-tested bodies,
-- validation, rate limits and admin authorization checks byte-for-byte.
do $$
begin
  if to_regprocedure('public.kc_ingest_search_queries(text,jsonb)') is null
     or to_regprocedure(
       'public.kc_track_privacy_event(text,text,text,text,text,text,jsonb)'
     ) is null
     or to_regprocedure(
       'public.kc_admin_search_trends(integer,timestamp with time zone)'
     ) is null
     or to_regprocedure(
       'public.kc_admin_search_trends_classified(integer,timestamp with time zone)'
     ) is null then
    raise exception 'analytics RPC boundary migration requires all public functions';
  end if;

  if to_regprocedure('kc_private.kc_ingest_search_queries_impl(text,jsonb)') is not null
     or to_regprocedure(
       'kc_private.kc_track_privacy_event_impl(text,text,text,text,text,text,jsonb)'
     ) is not null
     or to_regprocedure(
       'kc_private.kc_admin_search_trends_impl(integer,timestamp with time zone)'
     ) is not null
     or to_regprocedure(
       'kc_private.kc_admin_search_trends_classified_impl(integer,timestamp with time zone)'
     ) is not null then
    raise exception 'analytics private implementation already exists';
  end if;
end;
$$;

alter function public.kc_ingest_search_queries(text, jsonb)
  rename to kc_ingest_search_queries_impl;
alter function public.kc_ingest_search_queries_impl(text, jsonb)
  set schema kc_private;

alter function public.kc_track_privacy_event(
  text, text, text, text, text, text, jsonb
) rename to kc_track_privacy_event_impl;
alter function public.kc_track_privacy_event_impl(
  text, text, text, text, text, text, jsonb
) set schema kc_private;

alter function public.kc_admin_search_trends(integer, timestamptz)
  rename to kc_admin_search_trends_impl;
alter function public.kc_admin_search_trends_impl(integer, timestamptz)
  set schema kc_private;

alter function public.kc_admin_search_trends_classified(integer, timestamptz)
  rename to kc_admin_search_trends_classified_impl;
alter function public.kc_admin_search_trends_classified_impl(integer, timestamptz)
  set schema kc_private;

create function public.kc_ingest_search_queries(
  p_session_id text,
  p_entries jsonb
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_ingest_search_queries_impl($1, $2)
$$;

create function public.kc_track_privacy_event(
  p_event_name text,
  p_session_id text,
  p_page_path text default null,
  p_entity_type text default null,
  p_entity_id text default null,
  p_module_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_track_privacy_event_impl(
    $1, $2, $3, $4, $5, $6, $7
  )
$$;

create function public.kc_admin_search_trends(
  p_limit integer default 10,
  p_since timestamptz default null
)
returns table(term text, count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select result.term, result.count
  from kc_private.kc_admin_search_trends_impl($1, $2) as result
$$;

create function public.kc_admin_search_trends_classified(
  p_limit integer default 10,
  p_since timestamptz default null
)
returns table(
  term text,
  count bigint,
  module text,
  module_confidence numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    result.term,
    result.count,
    result.module,
    result.module_confidence
  from kc_private.kc_admin_search_trends_classified_impl($1, $2) as result
$$;

revoke all on function kc_private.kc_ingest_search_queries_impl(text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_ingest_search_queries_impl(text, jsonb)
  to anon, authenticated;

revoke all on function kc_private.kc_track_privacy_event_impl(
  text, text, text, text, text, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_track_privacy_event_impl(
  text, text, text, text, text, text, jsonb
) to anon, authenticated;

revoke all on function kc_private.kc_admin_search_trends_impl(
  integer, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_admin_search_trends_impl(
  integer, timestamptz
) to authenticated;

revoke all on function kc_private.kc_admin_search_trends_classified_impl(
  integer, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_admin_search_trends_classified_impl(
  integer, timestamptz
) to authenticated;

revoke all on function public.kc_ingest_search_queries(text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_ingest_search_queries(text, jsonb)
  to anon, authenticated;

revoke all on function public.kc_track_privacy_event(
  text, text, text, text, text, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.kc_track_privacy_event(
  text, text, text, text, text, text, jsonb
) to anon, authenticated;

revoke all on function public.kc_admin_search_trends(integer, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_admin_search_trends(integer, timestamptz)
  to authenticated;

revoke all on function public.kc_admin_search_trends_classified(
  integer, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.kc_admin_search_trends_classified(
  integer, timestamptz
) to authenticated;

comment on function public.kc_ingest_search_queries(text, jsonb) is
  'SECURITY INVOKER facade for validated search ingestion in the non-exposed kc_private schema.';
comment on function public.kc_track_privacy_event(
  text, text, text, text, text, text, jsonb
) is
  'SECURITY INVOKER facade for privacy-event ingestion in the non-exposed kc_private schema.';
comment on function public.kc_admin_search_trends(integer, timestamptz) is
  'SECURITY INVOKER facade for admin-authorized search trends in kc_private.';
comment on function public.kc_admin_search_trends_classified(
  integer, timestamptz
) is
  'SECURITY INVOKER facade for admin-authorized classified search trends in kc_private.';

notify pgrst, 'reload schema';

commit;

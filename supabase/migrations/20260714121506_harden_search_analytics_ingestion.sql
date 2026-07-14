-- Harden internal-search analytics ingestion and remove attributable/sensitive
-- legacy data. Public clients may write only through the two validated RPCs.

begin;

-- Remove legacy rows that could expose credentials, contact details or URLs.
-- The predicates are evaluated in-database; migration operators do not need to
-- inspect the terms themselves.
delete from public.search_queries
where created_at > now() + interval '5 minutes'
   or term ~ '[[:cntrl:]]'
   or term ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
   or term ~* '(https?://|www\.|([[:alnum:]-]+\.)+[[:alpha:]]{2,63}([^[:alnum:]_-]|$))'
   or term ~* '(access[_ -]?token|refresh[_ -]?token|id[_ -]?token|authorization|password|senha|otp|magiclink|api[_ -]?key)[[:space:]]*[:=]'
   or term ~ '[A-Za-z0-9_-]{32,}'
   or term ~ '[0-9]([+() .-]*[0-9]){7,14}';

-- Existing identifiers are made non-attributable before constraints are added.
update public.search_queries
set user_id = null
where user_id is not null;

update public.search_queries
set session_id = encode(extensions.digest(session_id, 'sha256'), 'hex')
where session_id is not null
  and session_id !~ '^[a-f0-9]{64}$';

-- Search events in the optional event log keep only aggregate dimensions. Raw
-- terms were duplicated in metadata.value by old clients and are removed here.
update public.privacy_analytics_events
set metadata = jsonb_strip_nulls(
  ((case when jsonb_typeof(metadata) = 'object' then metadata else '{}'::jsonb end)
    - array['value', 'term', 'q', 'query', 'search_term'])
  || jsonb_build_object(
    'query_length_bucket',
    case
      when length(coalesce(metadata ->> 'value', '')) between 2 and 4 then '2_4'
      when length(coalesce(metadata ->> 'value', '')) between 5 and 8 then '5_8'
      when length(coalesce(metadata ->> 'value', '')) between 9 and 16 then '9_16'
      when length(coalesce(metadata ->> 'value', '')) between 17 and 32 then '17_32'
      when length(coalesce(metadata ->> 'value', '')) > 32 then '33_plus'
      else null
    end
  )
),
user_id = null
where event_name = 'search';

update public.privacy_analytics_events
set metadata = metadata - array[
  'cookie', 'cookies', 'token', 'access_token', 'refresh_token', 'id_token',
  'password', 'senha', 'authorization', 'secret', 'email', 'phone', 'telefone',
  'ip', 'user_agent', 'ua', 'jwt', 'session_id', 'user_id'
]
where metadata ?| array[
  'cookie', 'cookies', 'token', 'access_token', 'refresh_token', 'id_token',
  'password', 'senha', 'authorization', 'secret', 'email', 'phone', 'telefone',
  'ip', 'user_agent', 'ua', 'jwt', 'session_id', 'user_id'
];

-- Rebuild every legacy metadata object from an event-specific allowlist. Nested
-- values, arbitrary keys and scalar values with obvious sensitive patterns are
-- discarded instead of being carried forward from the permissive old RPC.
update public.privacy_analytics_events as event_row
set metadata = coalesce((
  select jsonb_object_agg(
    item.key,
    to_jsonb(
      case
        when item.key = 'href'
          then left(regexp_replace(item.value #>> '{}', '[?#].*$', ''), 260)
        when item.key = 'entity_label'
          then left(regexp_replace(item.value #>> '{}', '[[:cntrl:]]+', '', 'g'), 180)
        else left(regexp_replace(item.value #>> '{}', '[[:cntrl:]]+', '', 'g'), 80)
      end
    )
  )
  from jsonb_each(
    case
      when jsonb_typeof(event_row.metadata) = 'object' then event_row.metadata
      else '{}'::jsonb
    end
  ) as item(key, value)
  where jsonb_typeof(item.value) = 'string'
    and item.key = any (
      case
        when event_row.event_name = 'search'
          then array['source', 'query_length_bucket']
        when event_row.event_name in ('category_click', 'post_open')
          then array['source', 'module_key', 'module', 'category_key', 'category']
        when event_row.event_name in ('banner_impression', 'banner_click', 'ad_impression', 'ad_click')
          then array['source', 'status', 'module_key', 'module', 'entity_label', 'period']
        else array['source', 'status', 'reason', 'category', 'module_key', 'module', 'consent_source']
      end
    )
    and (item.value #>> '{}') !~ '[[:cntrl:]]'
    and (item.value #>> '{}') !~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
    and (item.value #>> '{}') !~* '(https?://|www\.|javascript:|data:)'
    and (item.value #>> '{}') !~* '(access[_ -]?token|refresh[_ -]?token|id[_ -]?token|authorization|password|senha|otp|magiclink|api[_ -]?key)[[:space:]]*[:=]'
    and (item.value #>> '{}') !~ '[0-9]([+() .-]*[0-9]){7,14}'
    and (item.value #>> '{}') !~ '[A-Za-z0-9_-]{32,}'
), '{}'::jsonb);

update public.privacy_analytics_events
set entity_type = null,
    entity_id = null,
    module_key = null,
    page_path = '/search-results.html',
    user_id = null
where event_name = 'search';

delete from public.privacy_analytics_events
where created_at > now() + interval '5 minutes';

alter table public.search_queries
  drop constraint if exists search_queries_user_id_anonymous_check,
  drop constraint if exists search_queries_session_hash_check,
  drop constraint if exists search_queries_safe_term_check;

alter table public.search_queries
  add constraint search_queries_user_id_anonymous_check
    check (user_id is null),
  add constraint search_queries_session_hash_check
    check (session_id is null or session_id ~ '^[a-f0-9]{64}$'),
  add constraint search_queries_safe_term_check
    check (
      term !~ '[[:cntrl:]]'
      and term !~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
      and term !~* '(https?://|www\.|([[:alnum:]-]+\.)+[[:alpha:]]{2,63}([^[:alnum:]_-]|$))'
      and term !~* '(access[_ -]?token|refresh[_ -]?token|id[_ -]?token|authorization|password|senha|otp|magiclink|api[_ -]?key)[[:space:]]*[:=]'
      and term !~ '[A-Za-z0-9_-]{32,}'
      and term !~ '[0-9]([+() .-]*[0-9]){7,14}'
    );

drop index if exists public.idx_search_queries_user_id;
create index if not exists idx_search_queries_session_created_at
  on public.search_queries (session_id, created_at desc)
  where session_id is not null;

-- Remove every direct INSERT policy, including drifted policies with names that
-- differ from the baseline. ACL revocation below is the primary enforcement;
-- removing the policies prevents an accidental future GRANT from reopening it.
do $$
declare
  v_policy record;
begin
  for v_policy in
    select pol.polname
    from pg_catalog.pg_policy pol
    where pol.polrelid = 'public.search_queries'::regclass
      and pol.polcmd = 'a'
  loop
    execute format('drop policy %I on public.search_queries', v_policy.polname);
  end loop;

  for v_policy in
    select pol.polname
    from pg_catalog.pg_policy pol
    where pol.polrelid = 'public.privacy_analytics_events'::regclass
      and pol.polcmd = 'a'
  loop
    execute format('drop policy %I on public.privacy_analytics_events', v_policy.polname);
  end loop;
end;
$$;

revoke all privileges on table public.search_queries
  from public, anon, authenticated;
revoke insert (id, term, user_id, session_id, created_at)
  on table public.search_queries from public, anon, authenticated;
grant select on table public.search_queries to authenticated;
grant all privileges on table public.search_queries to service_role;

revoke all privileges on table public.privacy_analytics_events
  from public, anon, authenticated;
revoke insert (
  id, event_name, session_hash, user_id, page_path, entity_type, entity_id,
  module_key, metadata, created_at
) on table public.privacy_analytics_events from public, anon, authenticated;
grant select on table public.privacy_analytics_events to authenticated;
grant all privileges on table public.privacy_analytics_events to service_role;

create or replace function public.kc_ingest_search_queries(
  p_session_id text,
  p_entries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id text := trim(coalesce(p_session_id, ''));
  v_session_hash text;
  v_entry jsonb;
  v_raw_term text;
  v_term text;
  v_batch_size integer;
  v_recent_minute integer;
  v_recent_day integer;
  v_inserted integer := 0;
  v_rejected integer := 0;
begin
  if v_session_id !~ '^[A-Za-z0-9_-]{12,128}$' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  if jsonb_typeof(p_entries) is distinct from 'array' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_BATCH');
  end if;

  v_batch_size := jsonb_array_length(p_entries);
  if v_batch_size < 1 or v_batch_size > 12 or length(p_entries::text) > 4096 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_BATCH');
  end if;

  v_session_hash := encode(extensions.digest(v_session_id, 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_session_hash, 0));

  select
    count(*) filter (where sq.created_at >= now() - interval '1 minute')::integer,
    count(*) filter (where sq.created_at >= now() - interval '24 hours')::integer
  into v_recent_minute, v_recent_day
  from public.search_queries sq
  where sq.session_id = v_session_hash
    and sq.created_at >= now() - interval '24 hours';

  if v_recent_minute + v_batch_size > 24
     or v_recent_day + v_batch_size > 300 then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED');
  end if;

  for v_entry in select value from jsonb_array_elements(p_entries)
  loop
    if jsonb_typeof(v_entry) is distinct from 'object' then
      v_rejected := v_rejected + 1;
      continue;
    end if;

    if exists (
      select 1
      from jsonb_object_keys(v_entry) as supplied(key)
      where supplied.key <> 'term'
    ) then
      v_rejected := v_rejected + 1;
      continue;
    end if;

    v_raw_term := coalesce(v_entry ->> 'term', '');
    v_term := regexp_replace(trim(v_raw_term), '[[:space:]]+', ' ', 'g');

    if v_raw_term ~ '[[:cntrl:]]'
       or length(v_term) < 2 or length(v_term) > 160
       or v_term ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
       or v_term ~* '(https?://|www\.|([[:alnum:]-]+\.)+[[:alpha:]]{2,63}([^[:alnum:]_-]|$))'
       or v_term ~* '(access[_ -]?token|refresh[_ -]?token|id[_ -]?token|authorization|password|senha|otp|magiclink|api[_ -]?key)[[:space:]]*[:=]'
       or v_term ~ '[A-Za-z0-9_-]{32,}'
       or v_term ~ '[0-9]([+() .-]*[0-9]){7,14}' then
      v_rejected := v_rejected + 1;
      continue;
    end if;

    if exists (
      select 1
      from public.search_queries sq
      where sq.session_id = v_session_hash
        and lower(sq.term) = lower(v_term)
        and sq.created_at >= now() - interval '5 seconds'
    ) then
      v_rejected := v_rejected + 1;
      continue;
    end if;

    insert into public.search_queries (term, session_id, user_id)
    values (v_term, v_session_hash, null);
    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'rejected', v_rejected
  );
end;
$$;

-- Replace the permissive legacy implementation. The RPC owns identifiers and
-- timestamps, applies a metadata allowlist and never attributes search events.
create or replace function public.kc_track_privacy_event(
  p_event_name text,
  p_session_id text,
  p_page_path text default null,
  p_entity_type text default null,
  p_entity_id text default null,
  p_module_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_name text := lower(trim(coalesce(p_event_name, '')));
  v_session_id text := trim(coalesce(p_session_id, ''));
  v_session_hash text;
  v_page_path text;
  v_entity_type text;
  v_entity_id text;
  v_module_key text;
  v_raw_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_metadata jsonb := '{}'::jsonb;
  v_allowed_keys text[];
  v_recent_minute integer;
  v_recent_hour integer;
begin
  if v_event_name not in (
    'search', 'category_click', 'post_open', 'banner_impression', 'banner_click',
    'ad_impression', 'ad_click', 'help_open', 'help_submit', 'report_submit'
  ) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_EVENT');
  end if;

  if v_session_id !~ '^[A-Za-z0-9_-]{12,128}$' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  if jsonb_typeof(v_raw_metadata) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_METADATA');
  end if;

  if length(v_raw_metadata::text) > 4000 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_METADATA');
  end if;

  if exists (
    select 1
    from jsonb_each(v_raw_metadata) as item(key, value)
    where jsonb_typeof(item.value) <> 'string'
  ) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_METADATA');
  end if;

  v_page_path := left(
    split_part(split_part(coalesce(nullif(trim(p_page_path), ''), '/'), '?', 1), '#', 1),
    180
  );
  if v_page_path !~ '^/[A-Za-z0-9_./~-]*$'
     or v_page_path ~ '[0-9]([+() .-]*[0-9]){7,14}'
     or v_page_path ~ '[A-Za-z0-9_-]{32,}' then
    v_page_path := '/';
  end if;

  v_entity_type := lower(trim(coalesce(p_entity_type, '')));
  if v_entity_type !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then
    v_entity_type := null;
  end if;

  v_entity_id := regexp_replace(trim(coalesce(p_entity_id, '')), '[[:cntrl:]]+', '', 'g');
  if length(v_entity_id) < 1 or length(v_entity_id) > 128
     or v_entity_id ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
     or v_entity_id ~* '(https?://|access[_ -]?token|refresh[_ -]?token|password|senha|authorization)' then
    v_entity_id := null;
  end if;

  if v_entity_id ~ '[0-9]([+() .-]*[0-9]){7,14}'
     or (
       v_entity_id ~ '[A-Za-z0-9_-]{32,}'
       and v_entity_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     ) then
    v_entity_id := null;
  end if;

  v_module_key := lower(trim(coalesce(p_module_key, '')));
  if v_module_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then
    v_module_key := null;
  end if;

  v_allowed_keys := case
    when v_event_name = 'search'
      then array['source', 'query_length_bucket']
    when v_event_name in ('category_click', 'post_open')
      then array['source', 'module_key', 'module', 'category_key', 'category']
    when v_event_name in ('banner_impression', 'banner_click', 'ad_impression', 'ad_click')
      then array['source', 'status', 'module_key', 'module', 'entity_label', 'period']
    else array['source', 'status', 'reason', 'category', 'module_key', 'module', 'consent_source']
  end;

  select coalesce(
    jsonb_object_agg(
      item.key,
      to_jsonb(
        case
          when item.key = 'entity_label'
            then left(regexp_replace(item.value, '[[:cntrl:]]+', '', 'g'), 180)
          else left(regexp_replace(item.value, '[[:cntrl:]]+', '', 'g'), 80)
        end
      )
    ),
    '{}'::jsonb
  )
  into v_metadata
  from jsonb_each_text(v_raw_metadata) as item(key, value)
  where item.key = any (v_allowed_keys)
    and item.value <> ''
    and item.value !~ '[[:cntrl:]]'
    and item.value !~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
    and item.value !~* '(https?://|www\.|javascript:|data:)'
    and item.value !~* '(access[_ -]?token|refresh[_ -]?token|id[_ -]?token|authorization|password|senha|otp|magiclink|api[_ -]?key)[[:space:]]*[:=]'
    and item.value !~ '[0-9]([+() .-]*[0-9]){7,14}'
    and item.value !~ '[A-Za-z0-9_-]{32,}';

  if v_event_name = 'search' then
    v_metadata := jsonb_strip_nulls(jsonb_build_object(
      'source', case
        when lower(coalesce(v_metadata ->> 'source', '')) in (
          'dropdown-item', 'results-load', 'results-submit', 'search'
        ) then lower(v_metadata ->> 'source')
        else 'search'
      end,
      'query_length_bucket', case
        when v_metadata ->> 'query_length_bucket' in (
          '2_4', '5_8', '9_16', '17_32', '33_plus'
        ) then v_metadata ->> 'query_length_bucket'
        else null
      end
    ));
    v_page_path := '/search-results.html';
    v_entity_type := null;
    v_entity_id := null;
    v_module_key := null;
  end if;

  v_session_hash := encode(extensions.digest(v_session_id, 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_session_hash, 1));

  select
    count(*) filter (where e.created_at >= now() - interval '1 minute')::integer,
    count(*) filter (where e.created_at >= now() - interval '1 hour')::integer
  into v_recent_minute, v_recent_hour
  from public.privacy_analytics_events e
  where e.session_hash = v_session_hash
    and e.created_at >= now() - interval '1 hour';

  if v_recent_minute >= 60 or v_recent_hour >= 500 then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED');
  end if;

  insert into public.privacy_analytics_events (
    event_name, session_hash, user_id, page_path, entity_type, entity_id,
    module_key, metadata
  ) values (
    v_event_name,
    v_session_hash,
    case when v_event_name = 'search' then null else auth.uid() end,
    v_page_path,
    v_entity_type,
    v_entity_id,
    v_module_key,
    v_metadata
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.kc_ingest_search_queries(text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_ingest_search_queries(text, jsonb)
  to anon, authenticated;

revoke all on function public.kc_track_privacy_event(text, text, text, text, text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_track_privacy_event(text, text, text, text, text, text, jsonb)
  to anon, authenticated;

-- Raw internal-search trends are admin-only. Page routing is not an
-- authorization boundary, so both public wrappers enforce kc_is_admin and
-- direct execution of drifted private workers is removed.
create or replace function public.kc_admin_search_trends(
  p_limit integer default 10,
  p_since timestamptz default null
)
returns table(term text, count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 100);
begin
  if v_uid is null or not public.kc_is_admin(v_uid) then
    raise insufficient_privilege using message = 'admin access required';
  end if;

  return query
  select lower(sq.term), count(*)::bigint
  from public.search_queries sq
  where sq.created_at >= coalesce(p_since, now() - interval '30 days')
  group by lower(sq.term)
  order by count(*) desc, lower(sq.term)
  limit v_limit;
end;
$$;

create or replace function public.kc_admin_search_trends_classified(
  p_limit integer default 10,
  p_since timestamptz default null
)
returns table(term text, count bigint, module text, module_confidence numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 100);
begin
  if v_uid is null or not public.kc_is_admin(v_uid) then
    raise insufficient_privilege using message = 'admin access required';
  end if;

  if to_regprocedure(
    'kc_private.kc_admin_search_trends_classified(integer,timestamp with time zone)'
  ) is not null then
    return query execute
      'select result.term, result.count, result.module, result.module_confidence
       from kc_private.kc_admin_search_trends_classified($1, $2) as result'
      using v_limit, p_since;
  else
    -- Clean resets do not include the archived classifier worker. Preserve the
    -- admin trend report with explicit null classification instead of failing.
    return query
    select lower(sq.term), count(*)::bigint, null::text, null::numeric
    from public.search_queries sq
    where sq.created_at >= coalesce(p_since, now() - interval '30 days')
    group by lower(sq.term)
    order by count(*) desc, lower(sq.term)
    limit v_limit;
  end if;
end;
$$;

revoke all on function public.kc_admin_search_trends(integer, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_admin_search_trends(integer, timestamptz)
  to authenticated;

revoke all on function public.kc_admin_search_trends_classified(integer, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_admin_search_trends_classified(integer, timestamptz)
  to authenticated;

do $$
begin
  if to_regprocedure('kc_private.kc_admin_search_trends(integer,timestamp with time zone)') is not null then
    revoke all on function kc_private.kc_admin_search_trends(integer, timestamptz)
      from public, anon, authenticated, service_role;
  end if;

  if to_regprocedure('kc_private.kc_admin_search_trends_classified(integer,timestamp with time zone)') is not null then
    revoke all on function kc_private.kc_admin_search_trends_classified(integer, timestamptz)
      from public, anon, authenticated, service_role;
  end if;
end;
$$;

comment on function public.kc_ingest_search_queries(text, jsonb) is
  'Ingestao consentida de buscas: lote validado, sessao SHA-256, sem user_id, PII/URL/credencial rejeitada e rate limit por sessao.';
comment on function public.kc_track_privacy_event(text, text, text, text, text, text, jsonb) is
  'Eventos opcionais via allowlist; busca armazena apenas origem/faixa de tamanho e nunca termo bruto ou user_id.';
comment on table public.search_queries is
  'Termos internos de busca consentida para tendencias admin; sem user_id, sessao somente em hash, padroes sensiveis rejeitados, retencao de 6 meses.';
comment on column public.search_queries.session_id is
  'Hash SHA-256 da sessao efemera de busca; o identificador bruto nunca e persistido.';
comment on column public.search_queries.user_id is
  'Coluna legada mantida por compatibilidade e obrigada a NULL por constraint.';

commit;

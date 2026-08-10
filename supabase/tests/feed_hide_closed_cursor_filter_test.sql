begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(81);

select extensions.ok(
  to_regprocedure('public.kc_feed_parse_lifecycle_timestamp(text,text)') is not null,
  'safe lifecycle timestamp parser exists'
);
select extensions.ok(
  to_regprocedure('public.kc_feed_first_lifecycle_timestamp(jsonb,text)') is not null,
  'ordered lifecycle timestamp resolver exists'
);
select extensions.ok(
  to_regprocedure('public.kc_feed_post_is_closed_or_ended(text,text,jsonb,timestamptz,timestamptz)') is not null,
  'module-aware closed/ended classifier exists'
);
select extensions.ok(
  to_regprocedure('public.kc_get_feed_cursor(text,text[],text,text,text,text,text,integer,text,jsonb)') is not null,
  'cursor RPC signature remains unchanged'
);

select extensions.ok(
  not (
    select prosecdef
    from pg_proc
    where oid = 'public.kc_feed_parse_lifecycle_timestamp(text,text)'::regprocedure
  ),
  'lifecycle parser remains security invoker'
);
select extensions.ok(
  not (
    select prosecdef
    from pg_proc
    where oid = 'public.kc_feed_first_lifecycle_timestamp(jsonb,text)'::regprocedure
  ),
  'ordered lifecycle resolver remains security invoker'
);
select extensions.ok(
  not (
    select prosecdef
    from pg_proc
    where oid = 'public.kc_feed_post_is_closed_or_ended(text,text,jsonb,timestamptz,timestamptz)'::regprocedure
  ),
  'closed/ended classifier remains security invoker'
);
select extensions.ok(
  has_function_privilege('anon', 'public.kc_feed_parse_lifecycle_timestamp(text,text)', 'execute'),
  'anon can execute the parser needed by the public cursor'
);
select extensions.ok(
  has_function_privilege('anon', 'public.kc_feed_first_lifecycle_timestamp(jsonb,text)', 'execute'),
  'anon can execute the ordered resolver needed by the public cursor'
);
select extensions.ok(
  has_function_privilege('anon', 'public.kc_feed_post_is_closed_or_ended(text,text,jsonb,timestamptz,timestamptz)', 'execute'),
  'anon can execute the classifier needed by the public cursor'
);
select extensions.is(
  (
    select provolatile::text
    from pg_proc
    where oid = 'public.kc_feed_post_is_closed_or_ended(text,text,jsonb,timestamptz,timestamptz)'::regprocedure
  ),
  's',
  'closed/ended classifier is declared stable'
);

select extensions.is(
  public.kc_feed_parse_lifecycle_timestamp('2026-08-10', 'end'),
  '2026-08-11 02:59:59.999999+00'::timestamptz,
  'ISO date-only end uses the full America/Sao_Paulo calendar day'
);
select extensions.is(
  public.kc_feed_parse_lifecycle_timestamp('10/08/2026', 'end'),
  '2026-08-11 02:59:59.999999+00'::timestamptz,
  'Brazilian date-only end uses the full America/Sao_Paulo calendar day'
);
select extensions.is(
  public.kc_feed_parse_lifecycle_timestamp('2026-08-10 12:00:00', 'start'),
  '2026-08-10 15:00:00+00'::timestamptz,
  'naive timestamp is interpreted in America/Sao_Paulo'
);
select extensions.is(
  public.kc_feed_parse_lifecycle_timestamp('2026-08-10T12:00:00-03:00', 'start'),
  '2026-08-10 15:00:00+00'::timestamptz,
  'timestamp with an explicit offset preserves its instant'
);
select extensions.ok(
  public.kc_feed_parse_lifecycle_timestamp('2026-02-30', 'end') is null,
  'invalid date fails open as null instead of raising or expiring a post'
);
select extensions.is(
  public.kc_feed_first_lifecycle_timestamp(
    '["not-a-date", "2026-08-10"]'::jsonb,
    'end'
  ),
  '2026-08-11 02:59:59.999999+00'::timestamptz,
  'ordered resolver skips an invalid alias and uses the next valid value'
);

select extensions.ok(
  (
    select bool_and(public.kc_feed_post_is_closed_or_ended(
      status_value,
      'eventos',
      '{}'::jsonb,
      null,
      '2026-08-10 15:00:00+00'::timestamptz
    ))
    from unnest(array[
      'closed', 'expired', 'ended', 'encerrado', 'encerrada', 'cancelled',
      'canceled', 'cancelado', 'cancelada', 'finalizado', 'finalizada',
      'deleted', 'hidden', 'archived'
    ]) as terminal(status_value)
  ),
  'all browser-canonical explicit terminal statuses are closed/ended regardless of dates'
);
select extensions.ok(
  public.kc_feed_post_is_closed_or_ended(
    'published',
    'moradia',
    '{"expired":true}'::jsonb,
    null,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'metadata expired boolean true is explicit lifecycle evidence'
);
select extensions.ok(
  not public.kc_feed_post_is_closed_or_ended(
    'published',
    'moradia',
    '{"expired":"true"}'::jsonb,
    null,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'metadata expired string is not coerced beyond browser boolean semantics'
);
select extensions.ok(
  public.kc_feed_post_is_closed_or_ended(
    'published',
    'moradia',
    '{"isClosed":true}'::jsonb,
    null,
    '2026-08-10 15:00:00+00'::timestamptz
  )
  and public.kc_feed_post_is_closed_or_ended(
    'published',
    'moradia',
    '{"is_closed":true}'::jsonb,
    null,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'metadata isClosed boolean aliases are explicit lifecycle evidence'
);
select extensions.ok(
  not public.kc_feed_post_is_closed_or_ended(
    'published',
    'moradia',
    '{"isClosed":"true","is_closed":"true"}'::jsonb,
    null,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'metadata isClosed strings fail open instead of being coerced'
);
select extensions.ok(
  public.kc_feed_post_is_closed_or_ended(
    'published',
    'eventos',
    '{"eventStatus":"closed","data_evento":"2026-09-01"}'::jsonb,
    null,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'eventStatus closes a future event explicitly'
);
select extensions.ok(
  public.kc_feed_post_is_closed_or_ended(
    'published',
    'eventos',
    '{"dates":{"event_status":"ended","eventStartsAt":"2026-09-01"}}'::jsonb,
    null,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'nested dates.event_status closes a future event explicitly'
);
select extensions.ok(
  public.kc_feed_post_is_closed_or_ended(
    'published',
    'oportunidades',
    '{"applicationStatus":"expired","applicationDeadline":"2026-09-01"}'::jsonb,
    null,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'applicationStatus closes a future opportunity explicitly'
);
select extensions.ok(
  public.kc_feed_post_is_closed_or_ended(
    'published',
    'oportunidades',
    '{"dates":{"application_status":"cancelled","applicationDeadline":"2026-09-01"}}'::jsonb,
    null,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'nested dates.application_status closes a future opportunity explicitly'
);
select extensions.ok(
  not public.kc_feed_post_is_closed_or_ended(
    'published',
    'oportunidades',
    '{"eventStatus":"closed"}'::jsonb,
    null,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'eventStatus does not leak into opportunity lifecycle semantics'
);
select extensions.ok(
  not public.kc_feed_post_is_closed_or_ended(
    'published',
    'eventos',
    '{"applicationStatus":"closed"}'::jsonb,
    null,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'applicationStatus does not leak into event lifecycle semantics'
);
select extensions.ok(
  public.kc_feed_post_is_closed_or_ended(
    'published',
    'moradia',
    '{"expiresAt":"2026-08-20"}'::jsonb,
    '2026-08-01 00:00:00+00'::timestamptz,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'typed posts.expires_at keeps priority over remaining metadata expiry aliases'
);
select extensions.ok(
  not public.kc_feed_post_is_closed_or_ended(
    'published',
    'moradia',
    '{"expiresAt":"2026-08-01","dates":{"activeUntil":"2026-08-20"}}'::jsonb,
    '2026-08-01 00:00:00+00'::timestamptz,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'nested activeUntil future wins over typed and metadata expiry conflicts'
);
select extensions.ok(
  public.kc_feed_post_is_closed_or_ended(
    'published',
    'moradia',
    '{"expirationDate":"2026-08-01"}'::jsonb,
    null,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'expirationDate alias matches the browser expiry contract'
);
select extensions.ok(
  public.kc_feed_post_is_closed_or_ended(
    'published',
    'eventos',
    '{"data_evento":"2026-08-01","data_fim_evento":"2026-08-02"}'::jsonb,
    null,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'event uses its explicit end date'
);
select extensions.ok(
  not public.kc_feed_post_is_closed_or_ended(
    'published',
    'eventos',
    '{"data_evento":"2026-08-20"}'::jsonb,
    '2026-08-01 00:00:00+00'::timestamptz,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'future event start wins over a stale generic expires_at'
);
select extensions.ok(
  public.kc_feed_post_is_closed_or_ended(
    'published',
    'eventos',
    '{"event_date_detected":"2026-08-01"}'::jsonb,
    null,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'legacy event_date_detected root alias remains supported'
);
select extensions.ok(
  not public.kc_feed_post_is_closed_or_ended(
    'published',
    'eventos',
    '{"dates":{"event_date_detected":"2026-08-20"}}'::jsonb,
    null,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'nested event_date_detected alias follows the same event policy'
);
select extensions.ok(
  public.kc_feed_post_is_closed_or_ended(
    'published',
    'eventos',
    '{}'::jsonb,
    '2026-08-01 00:00:00+00'::timestamptz,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'event without a realization date falls back to generic expires_at'
);
select extensions.ok(
  not public.kc_feed_post_is_closed_or_ended(
    'published',
    'eventos',
    '{"data_fim_evento":"invalid","dates":{"eventStartsAt":"2026-08-20"}}'::jsonb,
    '2026-08-01 00:00:00+00'::timestamptz,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'invalid event end skips safely to a valid nested future start'
);
select extensions.ok(
  public.kc_feed_post_is_closed_or_ended(
    'published',
    'eventos',
    '{"dates":{"eventEndsAt":"2026-08-02"}}'::jsonb,
    null,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'nested event end alias is classified'
);
select extensions.ok(
  public.kc_feed_post_is_closed_or_ended(
    'published',
    'oportunidades',
    '{"applicationDeadline":"2026-08-01","expiresAt":"2026-09-01"}'::jsonb,
    null,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'past opportunity deadline wins over a future generic expiry'
);
select extensions.ok(
  not public.kc_feed_post_is_closed_or_ended(
    'published',
    'oportunidades',
    '{"dates":{"applicationDeadline":"2026-08-20"}}'::jsonb,
    '2026-08-01 00:00:00+00'::timestamptz,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'future nested opportunity deadline wins over a stale expires_at'
);
select extensions.ok(
  not public.kc_feed_post_is_closed_or_ended(
    'published',
    'oportunidades',
    '{"applicationDeadline":"invalid","dates":{"deadlineAt":"2026-08-20"}}'::jsonb,
    '2026-08-01 00:00:00+00'::timestamptz,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'invalid opportunity deadline skips to the next valid deadline alias'
);
select extensions.ok(
  public.kc_feed_post_is_closed_or_ended(
    'published',
    'caronas',
    '{"departureAt":"2026-08-01","expiresAt":"2026-09-01"}'::jsonb,
    null,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'past ride departure wins over a future generic expiry'
);
select extensions.ok(
  not public.kc_feed_post_is_closed_or_ended(
    'published',
    'caronas',
    '{"dates":{"departureAt":"2026-08-20"}}'::jsonb,
    '2026-08-01 00:00:00+00'::timestamptz,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'future nested ride departure wins over a stale expires_at'
);
select extensions.ok(
  public.kc_feed_post_is_closed_or_ended(
    'published',
    'caronas',
    '{}'::jsonb,
    '2026-08-01 00:00:00+00'::timestamptz,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'ride without a departure falls back to generic expires_at'
);
select extensions.ok(
  public.kc_feed_post_is_closed_or_ended(
    'published',
    'moradia',
    '{"validUntil":"2026-08-01"}'::jsonb,
    null,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'generic module uses its expiry alias'
);
select extensions.ok(
  not public.kc_feed_post_is_closed_or_ended(
    'published',
    'moradia',
    '{"validUntil":"invalid"}'::jsonb,
    null,
    '2026-08-10 15:00:00+00'::timestamptz
  ),
  'invalid generic expiry fails open as active'
);
select extensions.ok(
  not exists (
    select 1
    from unnest(array[
      'epoch', 'now', 'today', 'yesterday', 'tomorrow',
      'infinity', '-infinity', 'allballs'
    ]) as invalid_literal(value)
    where public.kc_feed_parse_lifecycle_timestamp(invalid_literal.value, 'end') is not null
  ),
  'PostgreSQL contextual timestamp literals fail open like the browser parser'
);
select extensions.ok(
  (
    select position('v_match_request_params' in prosrc) > 0
      and position('p_request_params - ''hideClosed'' - ''hide_closed'' - ''closed''' in prosrc) > 0
    from pg_proc
    where oid = 'public.kc_get_feed_cursor(text,text[],text,text,text,text,text,integer,text,jsonb)'::regprocedure
  ),
  'cursor strips lifecycle-only controls before the generic request matcher'
);
select extensions.ok(
  not public.kc_feed_post_is_closed_or_ended(
    'published',
    'eventos',
    '{"data_evento":"2026-08-10"}'::jsonb,
    null,
    '2026-08-11 02:00:00+00'::timestamptz
  ),
  'date-only event remains active until the local Sao Paulo day ends'
);

select extensions.ok(
  (
    select position('kc_feed_post_is_closed_or_ended' in prosrc) > 0
      and position('kc_feed_post_is_closed_or_ended' in prosrc) < position('limit v_limit + 1' in prosrc)
    from pg_proc
    where oid = 'public.kc_get_feed_cursor(text,text[],text,text,text,text,text,integer,text,jsonb)'::regprocedure
  ),
  'cursor applies lifecycle filtering before its bounded limit'
);
select extensions.ok(
  (
    select prosrc like '%''expires_at'', enriched.expires_at%'
    from pg_proc
    where oid = 'public.kc_get_feed_cursor(text,text[],text,text,text,text,text,integer,text,jsonb)'::regprocedure
  ),
  'cursor payload projects typed expires_at evidence'
);

select extensions.ok(
  to_regprocedure('public.kc_search_posts_fts(text,text[],text,text,text,integer,boolean)') is not null,
  'search RPC exposes one lifecycle-aware seven-argument identity'
);
select extensions.ok(
  to_regprocedure('public.kc_search_posts_fts(text,text[],text,text,text,integer)') is null,
  'legacy six-argument identity was removed to avoid default-overload ambiguity'
);
select extensions.ok(
  not (
    select prosecdef
    from pg_proc
    where oid = 'public.kc_search_posts_fts(text,text[],text,text,text,integer,boolean)'::regprocedure
  ),
  'search RPC remains security invoker'
);
select extensions.ok(
  has_function_privilege(
    'anon',
    'public.kc_search_posts_fts(text,text[],text,text,text,integer,boolean)',
    'execute'
  ),
  'anon can execute the lifecycle-aware search RPC'
);
select extensions.ok(
  (
    select prosrc like '%least(coalesce(p_limit, 50), 120)%'
    from pg_proc
    where oid = 'public.kc_search_posts_fts(text,text[],text,text,text,integer,boolean)'::regprocedure
  ),
  'search RPC raises its bounded result cap from 50 to 120'
);
select extensions.ok(
  (
    select (
      length(prosrc) - length(replace(prosrc, 'kc_feed_post_is_closed_or_ended', ''))
    ) / length('kc_feed_post_is_closed_or_ended') >= 2
    from pg_proc
    where oid = 'public.kc_search_posts_fts(text,text[],text,text,text,integer,boolean)'::regprocedure
  ),
  'both FTS and fuzzy candidate sources apply lifecycle filtering before their limits'
);
select extensions.ok(
  (
    select prosrc like '%''expires_at'', enriched.expires_at%'
    from pg_proc
    where oid = 'public.kc_search_posts_fts(text,text[],text,text,text,integer,boolean)'::regprocedure
  ),
  'search payload projects typed expires_at evidence'
);

set local session_replication_role = replica;

insert into public.posts (
  id,
  author_id,
  title,
  description,
  module,
  category,
  status,
  visibility,
  metadata,
  expires_at,
  created_at
)
values
  (
    '10000000-0000-4000-8000-000000000100',
    null,
    'kc-hide-closed-contract closed',
    'cursor lifecycle fixture',
    'eventos',
    'academico',
    'closed',
    'public',
    jsonb_build_object('data_evento', (current_date + 30)::text),
    null,
    now() - interval '1 minute'
  ),
  (
    '10000000-0000-4000-8000-000000000101',
    null,
    'kc-hide-closed-contract past event',
    'cursor lifecycle fixture',
    'eventos',
    'academico',
    'published',
    'public',
    jsonb_build_object('data_evento', (current_date - 10)::text),
    null,
    now() - interval '2 minutes'
  ),
  (
    '10000000-0000-4000-8000-000000000102',
    null,
    'kc-hide-closed-contract event status',
    'cursor lifecycle fixture',
    'eventos',
    'academico',
    'published',
    'public',
    jsonb_build_object(
      'eventStatus', 'closed',
      'data_evento', (current_date + 20)::text
    ),
    null,
    now() - interval '2 minutes 10 seconds'
  ),
  (
    '10000000-0000-4000-8000-000000000106',
    null,
    'kc-hide-closed-contract expired flag',
    'cursor lifecycle fixture',
    'eventos',
    'academico',
    'published',
    'public',
    jsonb_build_object(
      'expired', true,
      'data_evento', (current_date + 21)::text
    ),
    null,
    now() - interval '2 minutes 20 seconds'
  ),
  (
    '10000000-0000-4000-8000-000000000103',
    null,
    'kc-hide-closed-contract active one',
    'cursor lifecycle fixture',
    'eventos',
    'academico',
    'published',
    'public',
    jsonb_build_object('data_evento', (current_date + 10)::text),
    now() - interval '10 days',
    now() - interval '3 minutes'
  ),
  (
    '10000000-0000-4000-8000-000000000104',
    null,
    'kc-hide-closed-contract active two',
    'cursor lifecycle fixture',
    'eventos',
    'academico',
    'published',
    'public',
    jsonb_build_object(
      'data_evento', (current_date + 11)::text,
      'data_fim_evento', (current_date + 12)::text
    ),
    null,
    now() - interval '4 minutes'
  ),
  (
    '10000000-0000-4000-8000-000000000105',
    null,
    'kc-hide-closed-contract active three',
    'cursor lifecycle fixture',
    'eventos',
    'academico',
    'published',
    'public',
    jsonb_build_object(
      'dates',
      jsonb_build_object('eventEndsAt', (current_date + 13)::text)
    ),
    null,
    now() - interval '5 minutes'
  );

insert into public.posts (
  id,
  author_id,
  title,
  description,
  module,
  category,
  status,
  visibility,
  metadata,
  expires_at,
  created_at
)
values
  (
    '10000000-0000-4000-8000-000000000110',
    null,
    'kc-hide-application-contract direct status',
    'cursor application lifecycle fixture',
    'oportunidades',
    'estagio',
    'published',
    'public',
    jsonb_build_object(
      'applicationStatus', 'closed',
      'applicationDeadline', (current_date + 20)::text
    ),
    null,
    now() - interval '1 minute'
  ),
  (
    '10000000-0000-4000-8000-000000000111',
    null,
    'kc-hide-application-contract nested status',
    'cursor application lifecycle fixture',
    'oportunidades',
    'estagio',
    'published',
    'public',
    jsonb_build_object(
      'dates',
      jsonb_build_object(
        'application_status', 'ended',
        'applicationDeadline', (current_date + 20)::text
      )
    ),
    null,
    now() - interval '2 minutes'
  ),
  (
    '10000000-0000-4000-8000-000000000112',
    null,
    'kc-hide-application-contract active',
    'cursor application lifecycle fixture',
    'oportunidades',
    'estagio',
    'published',
    'public',
    jsonb_build_object('applicationDeadline', (current_date + 20)::text),
    null,
    now() - interval '3 minutes'
  );

insert into public.posts (
  author_id,
  title,
  description,
  module,
  category,
  status,
  visibility,
  metadata,
  expires_at,
  created_at
)
select
  null,
  'capacitymarkerkinosearch ' || sample.value::text,
  'search cap fixture',
  'moradia',
  'quarto',
  'published',
  'public',
  '{}'::jsonb,
  now() + interval '30 days',
  now() - make_interval(secs => sample.value)
from generate_series(1, 61) as sample(value);

set local session_replication_role = origin;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select extensions.is(
  public.kc_get_feed_cursor(
    p_module => 'eventos',
    p_q => 'kc-hide-closed-contract',
    p_sort_by => 'recentes',
    p_limit => 2,
    p_request_params => '{}'::jsonb
  ) #>> '{posts,0,id}',
  '10000000-0000-4000-8000-000000000100',
  'default cursor keeps the newest explicitly closed post visible'
);
select extensions.is(
  public.kc_get_feed_cursor(
    p_module => 'eventos',
    p_q => 'kc-hide-closed-contract',
    p_sort_by => 'recentes',
    p_limit => 2,
    p_request_params => '{}'::jsonb
  ) #>> '{posts,1,id}',
  '10000000-0000-4000-8000-000000000101',
  'default cursor keeps a temporally ended event visible'
);
select extensions.is(
  jsonb_array_length((public.kc_get_feed_cursor(
    p_module => 'eventos',
    p_q => 'kc-hide-closed-contract',
    p_sort_by => 'recentes',
    p_limit => 2,
    p_request_params => '{"hideClosed":true}'::jsonb
  ))->'posts'),
  2,
  'hideClosed fills the first page with active rows after pre-limit filtering'
);
select extensions.is(
  public.kc_get_feed_cursor(
    p_module => 'eventos',
    p_q => 'kc-hide-closed-contract',
    p_sort_by => 'recentes',
    p_limit => 2,
    p_request_params => '{"hideClosed":true}'::jsonb
  ) #>> '{posts,0,id}',
  '10000000-0000-4000-8000-000000000103',
  'hideClosed first active row is ordered after filtering'
);
select extensions.is(
  public.kc_get_feed_cursor(
    p_module => 'eventos',
    p_q => 'kc-hide-closed-contract',
    p_sort_by => 'recentes',
    p_limit => 2,
    p_request_params => '{"hideClosed":true}'::jsonb
  ) #>> '{posts,1,id}',
  '10000000-0000-4000-8000-000000000104',
  'hideClosed second active row is ordered after filtering'
);
select extensions.is(
  (public.kc_get_feed_cursor(
    p_module => 'eventos',
    p_q => 'kc-hide-closed-contract',
    p_sort_by => 'recentes',
    p_limit => 2,
    p_request_params => '{"hideClosed":true}'::jsonb
  )->>'hasMore')::boolean,
  true,
  'hideClosed hasMore reflects remaining active rows only'
);
select extensions.ok(
  (public.kc_get_feed_cursor(
    p_module => 'eventos',
    p_q => 'kc-hide-closed-contract',
    p_sort_by => 'recentes',
    p_limit => 2,
    p_request_params => '{"hideClosed":true}'::jsonb
  ) #> '{posts,0}') ? 'expires_at',
  'active cursor payload includes expires_at'
);
select extensions.ok(
  nullif(public.kc_get_feed_cursor(
    p_module => 'eventos',
    p_q => 'kc-hide-closed-contract',
    p_sort_by => 'recentes',
    p_limit => 2,
    p_request_params => '{"hideClosed":true}'::jsonb
  )->>'nextCursor', '') is not null,
  'hideClosed returns a cursor when another active page exists'
);
select extensions.is(
  jsonb_array_length((public.kc_get_feed_cursor(
    p_module => 'eventos',
    p_q => 'kc-hide-closed-contract',
    p_sort_by => 'recentes',
    p_limit => 2,
    p_cursor => public.kc_get_feed_cursor(
      p_module => 'eventos',
      p_q => 'kc-hide-closed-contract',
      p_sort_by => 'recentes',
      p_limit => 2,
      p_request_params => '{"hideClosed":true}'::jsonb
    )->>'nextCursor',
    p_request_params => '{"hideClosed":true}'::jsonb
  ))->'posts'),
  1,
  'hideClosed second page contains only the remaining active row'
);
select extensions.is(
  public.kc_get_feed_cursor(
    p_module => 'eventos',
    p_q => 'kc-hide-closed-contract',
    p_sort_by => 'recentes',
    p_limit => 2,
    p_cursor => public.kc_get_feed_cursor(
      p_module => 'eventos',
      p_q => 'kc-hide-closed-contract',
      p_sort_by => 'recentes',
      p_limit => 2,
      p_request_params => '{"hideClosed":true}'::jsonb
    )->>'nextCursor',
    p_request_params => '{"hideClosed":true}'::jsonb
  ) #>> '{posts,0,id}',
  '10000000-0000-4000-8000-000000000105',
  'hideClosed cursor continuity returns the third active row'
);
select extensions.is(
  (public.kc_get_feed_cursor(
    p_module => 'eventos',
    p_q => 'kc-hide-closed-contract',
    p_sort_by => 'recentes',
    p_limit => 2,
    p_cursor => public.kc_get_feed_cursor(
      p_module => 'eventos',
      p_q => 'kc-hide-closed-contract',
      p_sort_by => 'recentes',
      p_limit => 2,
      p_request_params => '{"hideClosed":true}'::jsonb
    )->>'nextCursor',
    p_request_params => '{"hideClosed":true}'::jsonb
  )->>'hasMore')::boolean,
  false,
  'hideClosed second page has no phantom continuation'
);
select extensions.is(
  jsonb_array_length((public.kc_get_feed_cursor(
    p_module => 'eventos',
    p_q => 'kc-hide-closed-contract',
    p_sort_by => 'recentes',
    p_limit => 2,
    p_request_params => '{"hide_closed":true}'::jsonb
  ))->'posts'),
  2,
  'snake_case hide_closed request alias is accepted'
);
select extensions.is(
  jsonb_array_length((public.kc_get_feed_cursor(
    p_module => 'eventos',
    p_q => 'kc-hide-closed-contract',
    p_sort_by => 'recentes',
    p_limit => 2,
    p_request_params => '{"closed":1}'::jsonb
  ))->'posts'),
  2,
  'canonical closed request alias is accepted'
);
select extensions.is(
  public.kc_get_feed_cursor(
    p_module => 'eventos',
    p_q => 'kc-hide-closed-contract',
    p_sort_by => 'recentes',
    p_limit => 2,
    p_request_params => '{"hideClosed":false}'::jsonb
  ) #>> '{posts,0,id}',
  '10000000-0000-4000-8000-000000000100',
  'explicit false leaves ended posts visible'
);

select extensions.is(
  (
    select count(*)::integer
    from public.kc_search_posts_fts(
      'kc-hide-closed-contract',
      array['kc-hide-closed-contract'],
      'eventos',
      null,
      null,
      120
    )
  ),
  7,
  'six-argument search calls remain source-compatible through p_hide_closed default false'
);
select extensions.is(
  (
    select count(*)::integer
    from public.kc_search_posts_fts(
      'kc-hide-closed-contract',
      array['kc-hide-closed-contract'],
      'eventos',
      null,
      null,
      120,
      true
    )
  ),
  3,
  'search hideClosed filters ended rows before its bounded result sets'
);
select extensions.is(
  (
    select count(*)::integer
    from public.kc_search_posts_fts(
      'kc-hide-closed-contract',
      array['kc-hide-closed-contract'],
      'eventos',
      null,
      null,
      2,
      true
    )
  ),
  2,
  'search hideClosed fills a short page from active rows after pre-limit filtering'
);
select extensions.ok(
  not exists (
    select 1
    from public.kc_search_posts_fts(
      'kc-hide-closed-contract',
      array['kc-hide-closed-contract'],
      'eventos',
      null,
      null,
      120,
      true
    ) as result
    where result->>'id' in (
      '10000000-0000-4000-8000-000000000100',
      '10000000-0000-4000-8000-000000000101',
      '10000000-0000-4000-8000-000000000102',
      '10000000-0000-4000-8000-000000000106'
    )
  ),
  'search hideClosed excludes both explicit and temporal endings'
);
select extensions.ok(
  exists (
    select 1
    from public.kc_search_posts_fts(
      'kc-hide-closed-contract',
      array['kc-hide-closed-contract'],
      'eventos',
      null,
      null,
      120,
      true
    ) as result
    where result->>'id' = '10000000-0000-4000-8000-000000000103'
  ),
  'search keeps a future event despite its stale generic expires_at'
);
select extensions.ok(
  (
    select result ? 'expires_at'
    from public.kc_search_posts_fts(
      'kc-hide-closed-contract',
      array['kc-hide-closed-contract'],
      'eventos',
      null,
      null,
      120,
      true
    ) as result
    where result->>'id' = '10000000-0000-4000-8000-000000000103'
    limit 1
  ),
  'search result includes expires_at for client-side lifecycle parity'
);
select extensions.is(
  (
    select count(*)::integer
    from public.kc_search_posts_fts(
      'capacitymarkerkinosearch',
      array['capacitymarkerkinosearch'],
      'moradia',
      null,
      null,
      120,
      true
    )
  ),
  61,
  'search can return more than the former 50-row cap up to the requested 120'
);
select extensions.is(
  public.kc_get_feed_cursor(
    p_module => 'oportunidades',
    p_q => 'kc-hide-application-contract',
    p_sort_by => 'recentes',
    p_limit => 2,
    p_request_params => '{"hideClosed":true}'::jsonb
  ) #>> '{posts,0,id}',
  '10000000-0000-4000-8000-000000000112',
  'cursor pre-limit filter removes direct and nested application statuses'
);
select extensions.is(
  (
    select count(*)::integer
    from public.kc_search_posts_fts(
      'kc-hide-application-contract',
      array['kc-hide-application-contract'],
      'oportunidades',
      null,
      null,
      120,
      true
    )
  ),
  1,
  'search pre-limit filter removes direct and nested application statuses'
);

reset role;

select * from extensions.finish();

rollback;

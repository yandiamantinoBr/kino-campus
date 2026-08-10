-- Hide ended feed posts before cursor pagination so page size, hasMore and
-- nextCursor remain truthful for every module/filter combination.

create or replace function public.kc_feed_parse_lifecycle_timestamp(
  p_value text,
  p_boundary text default 'end'::text
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_raw text := btrim(coalesce(p_value, ''));
  v_boundary text := public.kc_feed_slug_key(p_boundary);
  v_match text[];
  v_date date;
  v_local_timestamp timestamp without time zone;
  v_result timestamptz;
begin
  if v_raw = '' then
    return null;
  end if;

  -- PostgreSQL accepts contextual literals (for example "now" and "epoch")
  -- that JavaScript intentionally rejects. Keep malformed metadata fail-open.
  if lower(v_raw) in (
    'epoch', 'now', 'today', 'yesterday', 'tomorrow',
    'infinity', '-infinity', 'allballs'
  ) then
    return null;
  end if;

  -- Preserve epoch values supported by the browser policy.
  if v_raw ~ '^[0-9]{10}$' then
    begin
      v_result := pg_catalog.to_timestamp(v_raw::double precision);
      return case when pg_catalog.isfinite(v_result) then v_result else null end;
    exception when others then
      return null;
    end;
  end if;
  if v_raw ~ '^[0-9]{13}$' then
    begin
      v_result := pg_catalog.to_timestamp(v_raw::double precision / 1000.0);
      return case when pg_catalog.isfinite(v_result) then v_result else null end;
    exception when others then
      return null;
    end;
  end if;

  -- Date-only values represent the whole local calendar day.
  if v_raw ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    begin
      v_date := v_raw::date;
    exception when others then
      return null;
    end;

    v_local_timestamp := v_date::timestamp;
    if v_boundary in ('end', 'fim') then
      v_local_timestamp := v_local_timestamp + interval '1 day' - interval '1 microsecond';
    end if;
    return v_local_timestamp at time zone 'America/Sao_Paulo';
  end if;

  -- The public/Cadu pipeline also emits Brazilian date-only literals.
  v_match := pg_catalog.regexp_match(
    v_raw,
    '^([0-9]{1,2})[\\/.-]([0-9]{1,2})[\\/.-]([0-9]{4})$'
  );
  if v_match is not null then
    begin
      v_date := pg_catalog.make_date(v_match[3]::integer, v_match[2]::integer, v_match[1]::integer);
    exception when others then
      return null;
    end;

    v_local_timestamp := v_date::timestamp;
    if v_boundary in ('end', 'fim') then
      v_local_timestamp := v_local_timestamp + interval '1 day' - interval '1 microsecond';
    end if;
    return v_local_timestamp at time zone 'America/Sao_Paulo';
  end if;

  begin
    -- Zoned ISO values retain their declared instant. Naive timestamps are
    -- interpreted in the platform's business timezone, never the DB session TZ.
    if v_raw ~* '(z|utc|gmt|[+-][0-9]{2}(:?[0-9]{2})?)$' then
      v_result := v_raw::timestamptz;
    else
      v_local_timestamp := v_raw::timestamp without time zone;
      v_result := v_local_timestamp at time zone 'America/Sao_Paulo';
    end if;
    return case when pg_catalog.isfinite(v_result) then v_result else null end;
  exception when others then
    return null;
  end;
end;
$$;

create or replace function public.kc_feed_first_lifecycle_timestamp(
  p_values jsonb,
  p_boundary text default 'end'::text
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_value jsonb;
  v_raw text;
  v_parsed timestamptz;
begin
  if p_values is null or jsonb_typeof(p_values) <> 'array' then
    return null;
  end if;

  for v_value in
    select item.value
    from jsonb_array_elements(p_values) with ordinality as item(value, position)
    order by item.position
  loop
    if jsonb_typeof(v_value) not in ('string', 'number') then
      continue;
    end if;

    v_raw := v_value #>> '{}';
    v_parsed := public.kc_feed_parse_lifecycle_timestamp(v_raw, p_boundary);
    if v_parsed is not null then
      return v_parsed;
    end if;
  end loop;

  return null;
end;
$$;

create or replace function public.kc_feed_post_is_closed_or_ended(
  p_status text,
  p_module text,
  p_metadata jsonb,
  p_expires_at timestamptz,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_status text := public.kc_feed_slug_key(p_status);
  v_module text := public.kc_feed_slug_key(p_module);
  v_meta jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_now timestamptz := coalesce(p_now, now());
  v_closed_statuses text[] := array[
    'closed', 'expired', 'ended', 'encerrado', 'encerrada', 'cancelled',
    'canceled', 'cancelado', 'cancelada', 'finalizado', 'finalizada',
    'deleted', 'hidden', 'archived'
  ];
  v_module_status text;
  v_generic_end timestamptz;
  v_end timestamptz;
  v_start timestamptz;
begin
  if v_status = any(v_closed_statuses) then
    return true;
  end if;

  -- Boolean-only parity with the browser helper. String values such as
  -- "true" are not accepted as lifecycle evidence.
  if coalesce(v_meta->'expired' = 'true'::jsonb, false)
     or coalesce(v_meta->'isExpired' = 'true'::jsonb, false)
     or coalesce(v_meta->'is_expired' = 'true'::jsonb, false)
     or coalesce(v_meta->'isClosed' = 'true'::jsonb, false)
     or coalesce(v_meta->'is_closed' = 'true'::jsonb, false) then
    return true;
  end if;

  if v_module in ('eventos', 'evento', 'events', 'event') then
    v_module_status := public.kc_feed_slug_key(coalesce(
      nullif(btrim(v_meta->>'eventStatus'), ''),
      nullif(btrim(v_meta->>'event_status'), ''),
      nullif(btrim(v_meta #>> '{dates,eventStatus}'), ''),
      nullif(btrim(v_meta #>> '{dates,event_status}'), '')
    ));
    if v_module_status = any(v_closed_statuses) then
      return true;
    end if;
  elsif v_module in ('oportunidades', 'oportunidade', 'opportunities', 'opportunity') then
    v_module_status := public.kc_feed_slug_key(coalesce(
      nullif(btrim(v_meta->>'applicationStatus'), ''),
      nullif(btrim(v_meta->>'application_status'), ''),
      nullif(btrim(v_meta #>> '{dates,applicationStatus}'), ''),
      nullif(btrim(v_meta #>> '{dates,application_status}'), '')
    ));
    if v_module_status = any(v_closed_statuses) then
      return true;
    end if;
  end if;

  -- Match the stabilized browser/ranking policy: activeUntil aliases first,
  -- then the typed posts.expires_at column, then metadata expiry aliases.
  v_generic_end := public.kc_feed_first_lifecycle_timestamp(
    jsonb_build_array(
      v_meta->>'activeUntil',
      v_meta->>'active_until',
      v_meta #>> '{dates,activeUntil}',
      v_meta #>> '{dates,active_until}'
    ),
    'end'
  );
  if v_generic_end is null then
    v_generic_end := p_expires_at;
  end if;
  if v_generic_end is null then
    v_generic_end := public.kc_feed_first_lifecycle_timestamp(
      jsonb_build_array(
        v_meta->>'expiresAt',
        v_meta->>'expires_at',
        v_meta->>'validUntil',
        v_meta->>'valid_until',
        v_meta->>'validThrough',
        v_meta->>'data_encerramento',
        v_meta->>'expirationDate',
        v_meta->>'expiration_date',
        v_meta #>> '{dates,expiresAt}',
        v_meta #>> '{dates,expires_at}',
        v_meta #>> '{dates,validUntil}',
        v_meta #>> '{dates,valid_until}'
      ),
      'end'
    );
  end if;

  if v_module in ('eventos', 'evento', 'events', 'event') then
    v_end := public.kc_feed_first_lifecycle_timestamp(
      jsonb_build_array(
        v_meta->>'eventEndsAt',
        v_meta->>'event_ends_at',
        v_meta->>'eventEnd',
        v_meta->>'event_end',
        v_meta->>'endsAt',
        v_meta->>'ends_at',
        v_meta->>'endAt',
        v_meta->>'end_at',
        v_meta->>'dataFimEvento',
        v_meta->>'data_fim_evento',
        v_meta->>'dataFim',
        v_meta->>'data_fim',
        v_meta->>'dateEnd',
        v_meta->>'date_end',
        v_meta->>'dateEndAt',
        v_meta->>'date_end_at',
        v_meta #>> '{dates,eventEndsAt}',
        v_meta #>> '{dates,event_ends_at}',
        v_meta #>> '{dates,eventEnd}',
        v_meta #>> '{dates,event_end}',
        v_meta #>> '{dates,dateEnd}',
        v_meta #>> '{dates,date_end}'
      ),
      'end'
    );

    if v_end is null then
      v_start := public.kc_feed_first_lifecycle_timestamp(
        jsonb_build_array(
          v_meta->>'eventStartsAt',
          v_meta->>'event_starts_at',
          v_meta->>'eventStart',
          v_meta->>'event_start',
          v_meta->>'startsAt',
          v_meta->>'starts_at',
          v_meta->>'startAt',
          v_meta->>'start_at',
          v_meta->>'dataInicioEvento',
          v_meta->>'data_inicio_evento',
          v_meta->>'dataEvento',
          v_meta->>'data_evento',
          v_meta->>'eventDate',
          v_meta->>'event_date',
          v_meta->>'event_date_detected',
          v_meta->>'dateStart',
          v_meta->>'date_start',
          v_meta->>'date',
          v_meta->>'data',
          v_meta #>> '{dates,eventStartsAt}',
          v_meta #>> '{dates,event_starts_at}',
          v_meta #>> '{dates,eventStart}',
          v_meta #>> '{dates,event_start}',
          v_meta #>> '{dates,dateStart}',
          v_meta #>> '{dates,dataEvento}',
          v_meta #>> '{dates,data_evento}',
          v_meta #>> '{dates,event_date_detected}'
        ),
        'start'
      );

      if v_start is not null then
        v_end := (
          (v_start at time zone 'America/Sao_Paulo')::date::timestamp
          + interval '1 day'
          - interval '1 microsecond'
        ) at time zone 'America/Sao_Paulo';
      else
        -- Only an event with no valid realization date may fall back to the
        -- generic post expiry. A stale registration expiry cannot hide it.
        v_end := v_generic_end;
      end if;
    end if;
  elsif v_module in ('oportunidades', 'oportunidade', 'opportunities', 'opportunity') then
    v_end := public.kc_feed_first_lifecycle_timestamp(
      jsonb_build_array(
        v_meta->>'applicationDeadline',
        v_meta->>'application_deadline',
        v_meta->>'applicationDeadlineAt',
        v_meta->>'application_deadline_at',
        v_meta->>'deadlineAt',
        v_meta->>'deadline_at',
        v_meta->>'deadlineDate',
        v_meta->>'deadline_date',
        v_meta->>'deadline',
        v_meta->>'dataLimite',
        v_meta->>'data_limite',
        v_meta->>'inscricoesAte',
        v_meta->>'inscricoes_ate',
        v_meta->>'prazoInscricao',
        v_meta->>'prazo_inscricao',
        v_meta->>'submissionDeadline',
        v_meta->>'submission_deadline',
        v_meta->>'prazo',
        v_meta #>> '{dates,applicationDeadline}',
        v_meta #>> '{dates,application_deadline}',
        v_meta #>> '{dates,deadlineAt}',
        v_meta #>> '{dates,deadline_at}',
        v_meta #>> '{dates,deadlineDate}',
        v_meta #>> '{dates,deadline}',
        v_meta #>> '{dates,submissionDeadline}',
        v_meta #>> '{dates,submission_deadline}'
      ),
      'end'
    );
    if v_end is null then
      v_end := v_generic_end;
    end if;
  elsif v_module in ('caronas', 'carona', 'rides', 'ride') then
    v_end := public.kc_feed_first_lifecycle_timestamp(
      jsonb_build_array(
        v_meta->>'departureAt',
        v_meta->>'departure_at',
        v_meta->>'rideDate',
        v_meta->>'ride_date',
        v_meta->>'dataCarona',
        v_meta->>'data_carona',
        v_meta->>'departureDate',
        v_meta->>'departure_date',
        v_meta->>'dataViagem',
        v_meta->>'data_viagem',
        v_meta->>'date',
        v_meta->>'data',
        v_meta #>> '{dates,departureAt}',
        v_meta #>> '{dates,departure_at}',
        v_meta #>> '{dates,rideDate}',
        v_meta #>> '{dates,ride_date}'
      ),
      'end'
    );
    if v_end is null then
      v_end := v_generic_end;
    end if;
  else
    v_end := v_generic_end;
  end if;

  -- Missing/invalid lifecycle evidence is intentionally fail-open.
  return v_end is not null and v_end < v_now;
end;
$$;

comment on function public.kc_feed_parse_lifecycle_timestamp(text, text)
  is 'Safely parses lifecycle timestamps; date-only values use the full America/Sao_Paulo calendar day and invalid values return null.';
comment on function public.kc_feed_first_lifecycle_timestamp(jsonb, text)
  is 'Returns the first valid scalar lifecycle timestamp from an ordered JSON array.';
comment on function public.kc_feed_post_is_closed_or_ended(text, text, jsonb, timestamptz, timestamptz)
  is 'Module-aware terminal classifier used by cursor feeds: event realization, opportunity deadline, ride departure, then safe generic expiry fallbacks.';

revoke all on function public.kc_feed_parse_lifecycle_timestamp(text, text) from public;
revoke all on function public.kc_feed_first_lifecycle_timestamp(jsonb, text) from public;
revoke all on function public.kc_feed_post_is_closed_or_ended(text, text, jsonb, timestamptz, timestamptz) from public;

grant execute on function public.kc_feed_parse_lifecycle_timestamp(text, text)
  to anon, authenticated, service_role;
grant execute on function public.kc_feed_first_lifecycle_timestamp(jsonb, text)
  to anon, authenticated, service_role;
grant execute on function public.kc_feed_post_is_closed_or_ended(text, text, jsonb, timestamptz, timestamptz)
  to anon, authenticated, service_role;

create or replace function public.kc_get_feed_cursor(
  p_module text default null::text,
  p_modules text[] default null::text[],
  p_category text default null::text,
  p_subcategory text default null::text,
  p_tag text default null::text,
  p_q text default null::text,
  p_sort_by text default 'recentes'::text,
  p_limit integer default 12,
  p_cursor text default null::text,
  p_request_params jsonb default null::jsonb
) returns jsonb
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 12), 50));
  v_sort text := case
    when lower(coalesce(p_sort_by, 'recentes')) = 'votos' then 'votos'
    when lower(coalesce(p_sort_by, 'recentes')) = 'comentados' then 'comentados'
    else 'recentes'
  end;
  v_module_list text[] := array[]::text[];
  v_cursor_json jsonb := null;
  v_cursor_created timestamptz := null;
  v_cursor_id uuid := null;
  v_cursor_highlight double precision := 0;
  v_cursor_votos integer := 0;
  v_cursor_last_comment timestamptz := null;
  v_cursor_effective timestamptz := null;
  v_cursor_status_priority integer := 1;
  v_posts jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_cursor text := null;
  v_date_preset text := null;
  v_price_min numeric := null;
  v_price_max numeric := null;
  v_hide_closed boolean := false;
  v_match_request_params jsonb := '{}'::jsonb;
  v_search_text text := public.kc_posts_feed_normalize_search_text(p_q);
  v_search_like_pattern text := '%' || replace(
    replace(
      replace(v_search_text, E'\\', E'\\\\'),
      '%', E'\\%'
    ),
    '_', E'\\_'
  ) || '%';
  v_reader_role text := coalesce(auth.role(), 'anon');
  v_reader_uid uuid := auth.uid();
  v_reader_is_admin boolean := false;
begin
  if v_reader_role = 'authenticated' and v_reader_uid is not null then
    v_reader_is_admin := public.kc_is_admin(v_reader_uid);
  end if;

  if p_modules is not null and array_length(p_modules, 1) > 0 then
    select array_agg(lower(trim(value))) into v_module_list
      from unnest(p_modules) as value
     where nullif(trim(value), '') is not null;
  elsif nullif(trim(coalesce(p_module, '')), '') is not null then
    v_module_list := array[lower(trim(p_module))];
  end if;

  if p_request_params is not null then
    v_match_request_params := p_request_params - 'hideClosed' - 'hide_closed' - 'closed';
    v_date_preset := nullif(trim(coalesce(p_request_params->>'datePreset', p_request_params->>'date_preset', '')), '');
    v_hide_closed := public.kc_feed_jsonb_bool(coalesce(
      nullif(p_request_params->'hideClosed', 'null'::jsonb),
      nullif(p_request_params->'hide_closed', 'null'::jsonb),
      p_request_params->'closed'
    ));
    begin
      v_price_min := nullif(trim(coalesce(p_request_params->>'priceMin', p_request_params->>'price_min', '')), '')::numeric;
    exception when others then
      v_price_min := null;
    end;
    begin
      v_price_max := nullif(trim(coalesce(p_request_params->>'priceMax', p_request_params->>'price_max', '')), '')::numeric;
    exception when others then
      v_price_max := null;
    end;
  end if;

  if nullif(trim(coalesce(p_cursor, '')), '') is not null then
    begin
      v_cursor_json := convert_from(decode(p_cursor, 'base64'), 'utf8')::jsonb;
      v_cursor_created := nullif(v_cursor_json->>'created_at', '')::timestamptz;
      v_cursor_id := nullif(v_cursor_json->>'id', '')::uuid;
      v_cursor_highlight := coalesce(nullif(v_cursor_json->>'highlight_score', '')::double precision, 0);
      v_cursor_votos := coalesce(nullif(v_cursor_json->>'votos', '')::integer, 0);
      v_cursor_last_comment := nullif(v_cursor_json->>'last_comment_at', '')::timestamptz;
      v_cursor_effective := coalesce(
        nullif(v_cursor_json->>'effective_at', '')::timestamptz,
        nullif(v_cursor_json->>'bumped_at', '')::timestamptz,
        v_cursor_created
      );
      v_cursor_status_priority := coalesce(nullif(v_cursor_json->>'status_priority', '')::integer, 1);
    exception when others then
      v_cursor_json := null;
    end;
  end if;

  with base_candidates as not materialized (
    select
      p.id,
      p.legacy_id,
      p.author_id,
      p.title,
      p.description,
      p.price,
      p.location,
      p.module,
      p.category,
      p.status,
      p.visibility,
      p.expires_at,
      case when p.status = 'closed' then 0 else 1 end as status_priority,
      coalesce(p.metadata, '{}'::jsonb) as metadata,
      p.created_at,
      coalesce(p.votos, 0) as votos,
      coalesce(p.highlight_score, 0) as highlight_score,
      p.bumped_at,
      coalesce(p.bumped_at, p.created_at) as effective_at,
      p.last_comment_at
    from public.posts p
    where p.legacy_id is null
      and p.status in ('published', 'closed')
      and (
        not v_hide_closed
        or not public.kc_feed_post_is_closed_or_ended(
          p.status,
          p.module,
          p.metadata,
          p.expires_at
        )
      )
      -- Preserve kc_can_read_post semantics under the published/closed
      -- predicate while resolving role, uid and admin status only once.
      and (
        (
          v_reader_role = 'authenticated'
          and (
            coalesce(p.visibility, 'public') in ('public', 'community')
            or p.author_id = v_reader_uid
            or v_reader_is_admin
          )
        )
        or (v_reader_role <> 'authenticated' and coalesce(p.visibility, 'public') = 'public')
      )
      and (coalesce(array_length(v_module_list, 1), 0) = 0 or lower(coalesce(p.module, '')) = any(v_module_list))
      and (p_category is null or lower(coalesce(p.category, '')) = lower(p_category))
      and (
        p_subcategory is null
        or lower(coalesce(
          p.metadata->>'subcategory',
          p.metadata->>'subcategoria',
          p.metadata->>'subcategoryKey',
          p.metadata->>'subcategoriaKey',
          ''
        )) = lower(p_subcategory)
      )
      and (
        p_tag is null
        or coalesce(p.metadata->'tagKeys', '[]'::jsonb) @> jsonb_build_array(lower(p_tag))
      )
      and (
        v_match_request_params = '{}'::jsonb
        or public.kc_matches_feed_request_params(
          p.module,
          p.category,
          coalesce(
            p.metadata->>'subcategory',
            p.metadata->>'subcategoria',
            p.metadata->>'subcategoryKey',
            p.metadata->>'subcategoriaKey',
            ''
          ),
          p.title,
          p.description,
          p.metadata,
          coalesce((
            select profile.verified
            from public.profiles profile
            where profile.id = p.author_id
          ), false),
          v_match_request_params
        )
      )
      and (
        v_date_preset is null
        or public.kc_feed_matches_date_preset(
          p.module,
          p.created_at,
          p.metadata,
          v_date_preset
        )
      )
      and (v_price_min is null or (p.price is not null and p.price >= v_price_min))
      and (v_price_max is null or (p.price is not null and p.price <= v_price_max))
      and (
        v_cursor_json is null
        or (
          v_sort = 'votos'
          and row(case when p.status = 'closed' then 0 else 1 end, coalesce(p.highlight_score, 0), coalesce(p.votos, 0), p.created_at, p.id)
              < row(v_cursor_status_priority, v_cursor_highlight, v_cursor_votos, v_cursor_created, v_cursor_id)
        )
        or (
          v_sort = 'comentados'
          and p.last_comment_at is not null
          and row(p.last_comment_at, p.created_at, p.id)
              < row(v_cursor_last_comment, v_cursor_created, v_cursor_id)
        )
        or (
          v_sort = 'recentes'
          and row(coalesce(p.bumped_at, p.created_at), p.created_at, p.id)
              < row(v_cursor_effective, v_cursor_created, v_cursor_id)
        )
      )
      and (v_sort <> 'comentados' or p.last_comment_at is not null)
  ),
  filtered as (
    -- Mutually exclusive branches keep the no-query hot path identical to the
    -- previous cursor and expose LIKE as a top-level trigram condition in the
    -- search path, including after PostgreSQL switches to a generic plan.
    select *
    from base_candidates
    where v_search_text = ''

    union all

    select *
    from base_candidates
    where v_search_text <> ''
      and public.kc_posts_feed_search_text(
        title,
        description,
        category,
        location,
        metadata
      ) like v_search_like_pattern escape E'\\'
      -- position() remains the authoritative browser-equivalent predicate.
      and position(
        v_search_text in public.kc_posts_feed_search_text(
          title,
          description,
          category,
          location,
          metadata
        )
      ) > 0
  ),
  limited as materialized (
    select *
    from filtered
    order by
      case when v_sort = 'votos' then status_priority end desc nulls last,
      case when v_sort = 'votos' then highlight_score end desc nulls last,
      case when v_sort = 'votos' then votos end desc nulls last,
      case when v_sort = 'comentados' then last_comment_at end desc nulls last,
      case when v_sort = 'recentes' then effective_at end desc nulls last,
      created_at desc,
      id desc
    limit v_limit + 1
  ),
  kept as materialized (
    select *
    from limited
    order by
      case when v_sort = 'votos' then status_priority end desc nulls last,
      case when v_sort = 'votos' then highlight_score end desc nulls last,
      case when v_sort = 'votos' then votos end desc nulls last,
      case when v_sort = 'comentados' then last_comment_at end desc nulls last,
      case when v_sort = 'recentes' then effective_at end desc nulls last,
      created_at desc,
      id desc
    limit v_limit
  ),
  cursor_row as (
    select *
    from kept
    order by
      case when v_sort = 'votos' then status_priority end desc nulls last,
      case when v_sort = 'votos' then highlight_score end desc nulls last,
      case when v_sort = 'votos' then votos end desc nulls last,
      case when v_sort = 'comentados' then last_comment_at end desc nulls last,
      case when v_sort = 'recentes' then effective_at end desc nulls last,
      created_at desc,
      id desc
    offset greatest(v_limit - 1, 0)
    limit 1
  ),
  enriched as (
    select
      kept.*,
      case
        when pr.id is null then null
        else jsonb_build_object(
          'id', pr.id,
          'display_name', pr.display_name,
          'full_name', pr.full_name,
          'avatar_url', pr.avatar_url,
          'verified', coalesce(pr.verified, false)
        )
      end as profile_payload,
      coalesce(pm.items, '[]'::jsonb) as media_payload,
      coalesce(cc.comment_count, 0) as comment_count
    from kept
    left join public.profiles pr on pr.id = kept.author_id
    left join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('id', m.id, 'url', m.url, 'is_cover', m.is_cover)
          order by m.is_cover desc, m.id asc
        ),
        '[]'::jsonb
      ) as items
      from public.post_media m
      where m.post_id = kept.id
    ) pm on true
    left join lateral (
      select count(*)::int as comment_count
      from public.comments c
      where c.post_id = kept.id
    ) cc on true
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', enriched.id,
          'legacy_id', enriched.legacy_id,
          'author_id', enriched.author_id,
          'title', enriched.title,
          'description', enriched.description,
          'price', enriched.price,
          'location', enriched.location,
          'module', enriched.module,
          'category', enriched.category,
          'status', enriched.status,
          'visibility', enriched.visibility,
          'expires_at', enriched.expires_at,
          'metadata', enriched.metadata,
          'created_at', enriched.created_at,
          'votos', enriched.votos,
          'highlight_score', enriched.highlight_score,
          'bumped_at', enriched.bumped_at,
          'effective_at', enriched.effective_at,
          'last_comment_at', enriched.last_comment_at,
          'profiles', enriched.profile_payload,
          'post_media', enriched.media_payload,
          'comments', jsonb_build_array(jsonb_build_object('count', enriched.comment_count))
        )
        order by
          case when v_sort = 'votos' then enriched.status_priority end desc nulls last,
          case when v_sort = 'votos' then enriched.highlight_score end desc nulls last,
          case when v_sort = 'votos' then enriched.votos end desc nulls last,
          case when v_sort = 'comentados' then enriched.last_comment_at end desc nulls last,
          case when v_sort = 'recentes' then enriched.effective_at end desc nulls last,
          enriched.created_at desc,
          enriched.id desc
      ),
      '[]'::jsonb
    ),
    (select count(*) > v_limit from limited),
    case
      when (select count(*) > v_limit from limited) then (
        select encode(
          convert_to(
            jsonb_build_object(
              'sort', v_sort,
              'status_priority', cursor_row.status_priority,
              'highlight_score', cursor_row.highlight_score,
              'votos', cursor_row.votos,
              'last_comment_at', cursor_row.last_comment_at,
              'effective_at', cursor_row.effective_at,
              'bumped_at', cursor_row.bumped_at,
              'created_at', cursor_row.created_at,
              'id', cursor_row.id
            )::text,
            'utf8'
          ),
          'base64'
        )
        from cursor_row
      )
      else null
    end
    into v_posts, v_has_more, v_next_cursor
  from enriched;

  return jsonb_build_object(
    'ok', true,
    'posts', coalesce(v_posts, '[]'::jsonb),
    'hasMore', coalesce(v_has_more, false),
    'has_more', coalesce(v_has_more, false),
    'nextCursor', v_next_cursor,
    'next_cursor', v_next_cursor
  );
end;
$$;

comment on function public.kc_get_feed_cursor(
  text, text[], text, text, text, text, text, integer, text, jsonb
) is 'Cursor feed with bounded enrichment, accent-insensitive indexed search and optional pre-pagination hideClosed lifecycle filtering.';


-- Replace the six-argument identity rather than leaving two default-compatible
-- overloads that PostgREST could consider ambiguous. Calls that omit the new
-- final argument remain source-compatible through its default value.
drop function if exists public.kc_search_posts_fts(
  text, text[], text, text, text, integer
);

create or replace function public.kc_search_posts_fts(
  p_q text default null::text,
  p_terms text[] default null::text[],
  p_module text default null::text,
  p_category text default null::text,
  p_subcategory text default null::text,
  p_limit integer default 50,
  p_hide_closed boolean default false
) returns setof jsonb
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 120));
  v_terms text[] := array(
    select distinct lower(btrim(public.kc_unaccent(term)))
    from unnest(coalesce(p_terms, array[]::text[])) as term
    where term is not null and btrim(term) <> ''
  );
  v_fuzzy_terms text[] := array(
    select distinct lower(btrim(public.kc_unaccent(term)))
    from regexp_split_to_table(coalesce(p_q, ''), '\s+') as term
    where term is not null and btrim(term) <> ''
  );
  v_query_text text := null;
  v_query tsquery := null;
begin
  if coalesce(btrim(p_q), '') = '' then
    return;
  end if;

  if coalesce(array_length(v_terms, 1), 0) = 0 then
    v_terms := array[lower(btrim(public.kc_unaccent(p_q)))];
  end if;

  if coalesce(array_length(v_fuzzy_terms, 1), 0) = 0 then
    v_fuzzy_terms := array[lower(btrim(public.kc_unaccent(p_q)))];
  end if;

  select string_agg('(' || prepared.query_text || ')', ' | ')
    into v_query_text
  from (
    select nullif(plainto_tsquery('portuguese', term)::text, '') as query_text
    from unnest(v_terms) as term
  ) as prepared
  where prepared.query_text is not null;

  if coalesce(v_query_text, '') = '' then
    return;
  end if;

  v_query := v_query_text::tsquery;

  return query
  with fts_source as (
    select
      p.id,
      p.legacy_id,
      p.author_id,
      p.title,
      p.description,
      p.price,
      p.location,
      p.module,
      p.category,
      p.status,
      p.visibility,
      p.expires_at,
      coalesce(p.metadata, '{}'::jsonb) as metadata,
      p.created_at,
      coalesce(p.votos, 0) as votos,
      coalesce(p.highlight_score, 0)::double precision as highlight_score,
      p.bumped_at,
      p.last_comment_at,
      public.kc_posts_search_document(p.title, p.description, p.category, p.metadata) as search_document,
      lower(public.kc_unaccent(concat_ws(
        ' ',
        p.title,
        p.module,
        p.category,
        public.kc_posts_search_subcategory(p.metadata),
        public.kc_posts_search_tags_text(p.metadata)
      ))) as fuzzy_text
    from public.posts p
    where p.legacy_id is null
      and (
        not coalesce(p_hide_closed, false)
        or not public.kc_feed_post_is_closed_or_ended(
          p.status,
          p.module,
          p.metadata,
          p.expires_at
        )
      )
      and (p_module is null or lower(coalesce(p.module, '')) = lower(p_module))
      and (
        p_category is null
        or lower(public.kc_unaccent(coalesce(p.category, ''))) = lower(public.kc_unaccent(p_category))
      )
      and (
        p_subcategory is null
        or lower(public.kc_unaccent(public.kc_posts_search_subcategory(p.metadata)))
          = lower(public.kc_unaccent(p_subcategory))
      )
      -- Keep this expression byte-for-byte compatible with idx_posts_fts.
      and public.kc_posts_search_document(p.title, p.description, p.category, p.metadata) @@ v_query
  ),
  fts_matches as materialized (
    select
      fts_source.*,
      ts_rank_cd(fts_source.search_document, v_query) as search_rank,
      coalesce(fuzzy.fuzzy_sim, 0)::double precision as fuzzy_sim,
      true as is_fts
    from fts_source
    left join lateral (
      select max(extensions.word_similarity(term, fts_source.fuzzy_text)) as fuzzy_sim
      from unnest(v_fuzzy_terms) as term
      where length(term) >= 4
    ) fuzzy on true
    order by
      ts_rank_cd(fts_source.search_document, v_query) desc,
      coalesce(fuzzy.fuzzy_sim, 0) desc,
      fts_source.created_at desc,
      fts_source.id desc
    limit v_limit
  ),
  fts_count as (
    select count(*)::int as value from fts_matches
  ),
  fuzzy_source as (
    select
      p.id,
      p.legacy_id,
      p.author_id,
      p.title,
      p.description,
      p.price,
      p.location,
      p.module,
      p.category,
      p.status,
      p.visibility,
      p.expires_at,
      coalesce(p.metadata, '{}'::jsonb) as metadata,
      p.created_at,
      coalesce(p.votos, 0) as votos,
      coalesce(p.highlight_score, 0)::double precision as highlight_score,
      p.bumped_at,
      p.last_comment_at,
      lower(public.kc_unaccent(concat_ws(
        ' ',
        p.title,
        p.module,
        p.category,
        public.kc_posts_search_subcategory(p.metadata),
        public.kc_posts_search_tags_text(p.metadata)
      ))) as fuzzy_text
    from fts_count
    cross join lateral (
      select candidate.*
      from public.posts candidate
      where fts_count.value < v_limit
        and candidate.legacy_id is null
        and (
          not coalesce(p_hide_closed, false)
          or not public.kc_feed_post_is_closed_or_ended(
            candidate.status,
            candidate.module,
            candidate.metadata,
            candidate.expires_at
          )
        )
        and (p_module is null or lower(coalesce(candidate.module, '')) = lower(p_module))
        and (
          p_category is null
          or lower(public.kc_unaccent(coalesce(candidate.category, ''))) = lower(public.kc_unaccent(p_category))
        )
        and (
          p_subcategory is null
          or lower(public.kc_unaccent(public.kc_posts_search_subcategory(candidate.metadata)))
            = lower(public.kc_unaccent(p_subcategory))
        )
        and not exists (select 1 from fts_matches where fts_matches.id = candidate.id)
    ) p
  ),
  fuzzy_matches as materialized (
    select
      fuzzy_source.id,
      fuzzy_source.legacy_id,
      fuzzy_source.author_id,
      fuzzy_source.title,
      fuzzy_source.description,
      fuzzy_source.price,
      fuzzy_source.location,
      fuzzy_source.module,
      fuzzy_source.category,
      fuzzy_source.status,
      fuzzy_source.visibility,
      fuzzy_source.expires_at,
      fuzzy_source.metadata,
      fuzzy_source.created_at,
      fuzzy_source.votos,
      fuzzy_source.highlight_score,
      fuzzy_source.bumped_at,
      fuzzy_source.last_comment_at,
      null::tsvector as search_document,
      fuzzy_source.fuzzy_text,
      0::real as search_rank,
      fuzzy.fuzzy_sim::double precision as fuzzy_sim,
      false as is_fts
    from fuzzy_source
    cross join lateral (
      select coalesce(max(extensions.word_similarity(term, fuzzy_source.fuzzy_text)), 0) as fuzzy_sim
      from unnest(v_fuzzy_terms) as term
      where length(term) >= 4
    ) fuzzy
    where fuzzy.fuzzy_sim >= 0.68
    order by fuzzy.fuzzy_sim desc, fuzzy_source.created_at desc, fuzzy_source.id desc
    limit greatest(v_limit - (select value from fts_count), 0)
  ),
  selected as materialized (
    select * from fts_matches
    union all
    select * from fuzzy_matches
  ),
  enriched as (
    select
      selected.*,
      case
        when pr.id is null then null
        else jsonb_build_object(
          'id', pr.id,
          'display_name', pr.display_name,
          'full_name', pr.full_name,
          'avatar_url', pr.avatar_url,
          'verified', coalesce(pr.verified, false)
        )
      end as profile_payload,
      coalesce(pm.items, '[]'::jsonb) as media_payload,
      coalesce(cc.comment_count, 0) as comment_count
    from selected
    left join public.profiles pr on pr.id = selected.author_id
    left join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'url', m.url,
            'is_cover', m.is_cover
          )
          order by m.is_cover desc, m.id asc
        ),
        '[]'::jsonb
      ) as items
      from public.post_media m
      where m.post_id = selected.id
    ) pm on true
    left join lateral (
      select count(*)::int as comment_count
      from public.comments c
      where c.post_id = selected.id
    ) cc on true
  )
  select jsonb_build_object(
    'id', enriched.id,
    'legacy_id', enriched.legacy_id,
    'author_id', enriched.author_id,
    'title', enriched.title,
    'description', enriched.description,
    'price', enriched.price,
    'location', enriched.location,
    'module', enriched.module,
    'category', enriched.category,
    'status', enriched.status,
    'visibility', enriched.visibility,
    'expires_at', enriched.expires_at,
    'metadata', enriched.metadata,
    'created_at', enriched.created_at,
    'votos', enriched.votos,
    'highlight_score', enriched.highlight_score,
    'bumped_at', enriched.bumped_at,
    'last_comment_at', enriched.last_comment_at,
    'profiles', enriched.profile_payload,
    'post_media', enriched.media_payload,
    'comments', jsonb_build_array(jsonb_build_object('count', enriched.comment_count))
  )
  from enriched
  order by
    enriched.is_fts desc,
    enriched.search_rank desc,
    enriched.fuzzy_sim desc,
    enriched.created_at desc,
    enriched.id desc
  limit v_limit;
end;
$$;

comment on function public.kc_search_posts_fts(
  text, text[], text, text, text, integer, boolean
) is 'Index-first Portuguese FTS with a 120-row cap, optional pre-limit hide-closed lifecycle filtering and fuzzy backfill.';

revoke all on function public.kc_search_posts_fts(
  text, text[], text, text, text, integer, boolean
) from public;
grant execute on function public.kc_search_posts_fts(
  text, text[], text, text, text, integer, boolean
) to anon, authenticated, service_role;

-- Explicit replay-safe semantic repair for 49 production posts audited on 2026-08-08.
--
-- This migration intentionally contains no classifier or fuzzy rule. Every row
-- has one full UUID, one audited source state and one reviewed target state.
-- An existing row is accepted only when it is still in the audited source
-- state or is already in the complete target state produced below. Any third
-- state aborts before the first write. A completely empty posts table is a safe
-- schema-replay no-op; every nonempty database must contain all 49 audited UUIDs.

drop table if exists pg_temp.kc_semantic_post_reclassification_20260808;

create temporary table kc_semantic_post_reclassification_20260808 (
  id uuid primary key,
  current_module text not null,
  current_category text not null,
  current_status text not null,
  target_module text not null,
  target_category text not null,
  target_category_label text not null,
  target_status text not null,
  touch_event_dates boolean not null default false,
  target_event_start date,
  target_event_end date,
  touch_deadline boolean not null default false,
  target_deadline date,
  current_touched_fingerprint jsonb,
  target_touched_fingerprint jsonb,
  constraint kc_semantic_event_dates_pair_check check (
    not touch_event_dates
    or (target_event_start is null and target_event_end is null)
    or (
      target_event_start is not null
      and target_event_end is not null
      and target_event_end >= target_event_start
    )
  )
) on commit drop;

create or replace function pg_temp.kc_semantic_rewrite_text_array_20260808(
  p_value jsonb,
  p_remove_values text[],
  p_required_value text
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_result jsonb := '[]'::jsonb;
  v_item jsonb;
  v_text text;
  v_inserted boolean := false;
begin
  if jsonb_typeof(p_value) <> 'array' then
    raise exception using
      errcode = 'P0001',
      message = 'semantic post reclassification aborted: tags and tagKeys must be JSON arrays when present';
  end if;

  for v_item in
    select item.value
    from jsonb_array_elements(p_value) item(value)
  loop
    if jsonb_typeof(v_item) = 'string' then
      v_text := v_item #>> '{}';
      if v_text = any(coalesce(p_remove_values, array[]::text[]))
         or v_text is not distinct from p_required_value then
        if not v_inserted and coalesce(p_required_value, '') <> '' then
          v_result := v_result || jsonb_build_array(to_jsonb(p_required_value));
          v_inserted := true;
        end if;
        continue;
      end if;
    end if;

    -- Preserve unrelated entries byte-for-byte and in their original order.
    v_result := v_result || jsonb_build_array(v_item);
  end loop;

  if coalesce(p_required_value, '') <> ''
     and not v_inserted then
    v_result := v_result || jsonb_build_array(to_jsonb(p_required_value));
  end if;

  return v_result;
end;
$function$;

create or replace function pg_temp.kc_semantic_post_metadata_20260808(
  p_metadata jsonb,
  p_current_category text,
  p_target_module text,
  p_target_category text,
  p_target_category_label text,
  p_clear_incompatible_module_fields boolean,
  p_touch_event_dates boolean,
  p_target_event_start date,
  p_target_event_end date,
  p_touch_deadline boolean,
  p_target_deadline date
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_meta jsonb := case
    when jsonb_typeof(p_metadata) = 'object' then p_metadata
    else '{}'::jsonb
  end;
  v_dates jsonb;
  v_start text := p_target_event_start::text;
  v_end text := p_target_event_end::text;
  v_deadline text := p_target_deadline::text;
  v_remove_tags text[];
  v_remove_tag_keys text[];
begin
  v_remove_tags := array_remove(array[
    p_current_category,
    v_meta->>'category',
    v_meta->>'categoria',
    v_meta->>'categoryLabel',
    v_meta->>'categoriaLabel'
  ], null);
  v_remove_tag_keys := array_remove(array[
    p_current_category,
    v_meta->>'category',
    v_meta->>'categoryKey',
    v_meta->>'categoriaKey'
  ], null);

  if p_clear_incompatible_module_fields and p_target_module = 'eventos' then
    v_remove_tags := v_remove_tags || array_remove(array[
      v_meta->>'areaKey', v_meta->>'areaLabel', v_meta->>'area',
      v_meta->>'workMode', v_meta->>'workModeLabel', v_meta->>'work_mode',
      v_meta->>'modalidadeTrabalho', v_meta->>'modalidade',
      v_meta->>'employmentType', v_meta->>'employmentTypeLabel',
      v_meta->>'employment_type', v_meta->>'regimeContratacao',
      v_meta->>'opportunityType', v_meta->>'opportunityTypeKey',
      v_meta->>'opportunity_type',
      v_meta->>'subcategory', v_meta->>'subcategoryKey', v_meta->>'subcategoryLabel',
      v_meta->>'subcategoria', v_meta->>'subcategoriaKey', v_meta->>'subcategoriaLabel'
    ], null);
    v_remove_tag_keys := v_remove_tag_keys || v_remove_tags;
  elsif p_clear_incompatible_module_fields and p_target_module = 'oportunidades' then
    v_remove_tags := v_remove_tags || array_remove(array[
      v_meta->>'eventType', v_meta->>'event_type',
      v_meta->>'eventMode', v_meta->>'event_mode',
      v_meta->>'eventLocation', v_meta->>'event_location'
    ], null);
    v_remove_tag_keys := v_remove_tag_keys || v_remove_tags;
  end if;

  v_meta := jsonb_set(
    v_meta,
    '{tags}',
    pg_temp.kc_semantic_rewrite_text_array_20260808(
      coalesce(v_meta->'tags', '[]'::jsonb),
      v_remove_tags,
      p_target_category_label
    ),
    true
  );
  v_meta := jsonb_set(
    v_meta,
    '{tagKeys}',
    pg_temp.kc_semantic_rewrite_text_array_20260808(
      coalesce(v_meta->'tagKeys', '[]'::jsonb),
      v_remove_tag_keys,
      p_target_category
    ),
    true
  );

  v_meta := jsonb_set(v_meta, '{category}', to_jsonb(p_target_category), true);
  v_meta := jsonb_set(v_meta, '{categoryKey}', to_jsonb(p_target_category), true);
  v_meta := jsonb_set(v_meta, '{categoriaKey}', to_jsonb(p_target_category), true);
  v_meta := jsonb_set(v_meta, '{categoryLabel}', to_jsonb(p_target_category_label), true);
  v_meta := jsonb_set(v_meta, '{categoria}', to_jsonb(p_target_category_label), true);
  v_meta := jsonb_set(v_meta, '{categoriaLabel}', to_jsonb(p_target_category_label), true);
  v_meta := jsonb_set(v_meta, '{module}', to_jsonb(p_target_module), true);

  if v_meta ? 'moduleKey' then
    v_meta := jsonb_set(v_meta, '{moduleKey}', to_jsonb(p_target_module), false);
  end if;

  if p_clear_incompatible_module_fields and p_target_module = 'oportunidades' then
    -- Event-only fields are invalid after an Eventos -> Oportunidades move.
    v_meta := v_meta
      - 'date_start' - 'date_end'
      - 'data_evento' - 'dataEvento' - 'data_inicio_evento' - 'dataInicioEvento' - 'data'
      - 'data_fim_evento' - 'dataFimEvento' - 'data_fim' - 'dataFim'
      - 'eventStartsAt' - 'eventEndsAt'
      - 'eventStart' - 'eventEnd' - 'eventTime' - 'event_time'
      - 'event_starts_at' - 'event_ends_at'
      - 'event_start' - 'event_end' - 'event_date' - 'eventDate'
      - 'hora_evento' - 'horaEvento' - 'hora'
      - 'eventType' - 'event_type'
      - 'eventMode' - 'event_mode'
      - 'eventLocation' - 'event_location';

    if jsonb_typeof(v_meta->'dates') = 'object' then
      v_meta := jsonb_set(
        v_meta,
        '{dates}',
        (v_meta->'dates')
          - 'eventStartsAt' - 'eventEndsAt'
          - 'event_starts_at' - 'event_ends_at'
          - 'eventStart' - 'eventEnd',
        false
      );
    end if;
  elsif p_clear_incompatible_module_fields and p_target_module = 'eventos' then
    -- Opportunity-only fields are invalid after Oportunidades -> Eventos.
    v_meta := v_meta
      - 'areaKey' - 'areaLabel' - 'area' - 'areaAtuacao' - 'area_atuacao'
      - 'workMode' - 'workModeLabel' - 'work_mode' - 'modalidadeTrabalho' - 'modalidade'
      - 'employmentType' - 'employmentTypeLabel' - 'employment_type' - 'regimeContratacao'
      - 'remuneracao' - 'salary' - 'salario' - 'benefits' - 'beneficios'
      - 'opportunityType' - 'opportunityTypeKey' - 'opportunity_type'
      - 'subcategory' - 'subcategoryKey' - 'subcategoryLabel'
      - 'subcategoria' - 'subcategoriaKey' - 'subcategoriaLabel';
  end if;

  if p_touch_event_dates then
    v_dates := case
      when jsonb_typeof(v_meta->'dates') = 'object' then v_meta->'dates'
      else '{}'::jsonb
    end;

    if p_target_event_start is null then
      v_meta := v_meta
        - 'date_start' - 'date_end'
        - 'data_evento' - 'dataEvento' - 'data_inicio_evento' - 'dataInicioEvento' - 'data'
        - 'data_fim_evento' - 'dataFimEvento' - 'data_fim' - 'dataFim'
        - 'eventStartsAt' - 'eventEndsAt'
        - 'eventStart' - 'eventEnd'
        - 'event_starts_at' - 'event_ends_at'
        - 'event_start' - 'event_end'
        - 'event_date' - 'eventDate';
      v_dates := v_dates
        - 'eventStartsAt' - 'eventEndsAt'
        - 'event_starts_at' - 'event_ends_at'
        - 'eventStart' - 'eventEnd';
    else
      -- Canonical feed aliases.
      v_meta := jsonb_set(v_meta, '{date_start}', to_jsonb(v_start), true);
      v_meta := jsonb_set(v_meta, '{date_end}', to_jsonb(v_end), true);
      v_meta := jsonb_set(v_meta, '{data_evento}', to_jsonb(v_start), true);
      v_meta := jsonb_set(v_meta, '{data_fim_evento}', to_jsonb(v_end), true);

      -- Existing/runtime aliases are synchronized rather than allowed to drift.
      v_meta := jsonb_set(v_meta, '{eventStartsAt}', to_jsonb(v_start), true);
      v_meta := jsonb_set(v_meta, '{eventEndsAt}', to_jsonb(v_end), true);
      v_meta := jsonb_set(v_meta, '{event_starts_at}', to_jsonb(v_start), true);
      v_meta := jsonb_set(v_meta, '{event_ends_at}', to_jsonb(v_end), true);
      if v_meta ? 'dataEvento' then
        v_meta := jsonb_set(v_meta, '{dataEvento}', to_jsonb(v_start), false);
      end if;
      if v_meta ? 'data_inicio_evento' then
        v_meta := jsonb_set(v_meta, '{data_inicio_evento}', to_jsonb(v_start), false);
      end if;
      if v_meta ? 'dataInicioEvento' then
        v_meta := jsonb_set(v_meta, '{dataInicioEvento}', to_jsonb(v_start), false);
      end if;
      if v_meta ? 'dataFimEvento' then
        v_meta := jsonb_set(v_meta, '{dataFimEvento}', to_jsonb(v_end), false);
      end if;
      if v_meta ? 'data' then
        v_meta := jsonb_set(v_meta, '{data}', to_jsonb(v_start), false);
      end if;
      if v_meta ? 'data_fim' then
        v_meta := jsonb_set(v_meta, '{data_fim}', to_jsonb(v_end), false);
      end if;
      if v_meta ? 'dataFim' then
        v_meta := jsonb_set(v_meta, '{dataFim}', to_jsonb(v_end), false);
      end if;
      if v_meta ? 'event_start' then
        v_meta := jsonb_set(v_meta, '{event_start}', to_jsonb(v_start), false);
      end if;
      if v_meta ? 'eventStart' then
        v_meta := jsonb_set(v_meta, '{eventStart}', to_jsonb(v_start), false);
      end if;
      if v_meta ? 'event_end' then
        v_meta := jsonb_set(v_meta, '{event_end}', to_jsonb(v_end), false);
      end if;
      if v_meta ? 'eventEnd' then
        v_meta := jsonb_set(v_meta, '{eventEnd}', to_jsonb(v_end), false);
      end if;
      if v_meta ? 'event_date' then
        v_meta := jsonb_set(v_meta, '{event_date}', to_jsonb(v_start), false);
      end if;
      if v_meta ? 'eventDate' then
        v_meta := jsonb_set(v_meta, '{eventDate}', to_jsonb(v_start), false);
      end if;

      v_dates := jsonb_set(v_dates, '{eventStartsAt}', to_jsonb(v_start), true);
      v_dates := jsonb_set(v_dates, '{eventEndsAt}', to_jsonb(v_end), true);
    end if;

    v_meta := jsonb_set(v_meta, '{dates}', v_dates, true);
  end if;

  if p_touch_deadline then
    v_dates := case
      when jsonb_typeof(v_meta->'dates') = 'object' then v_meta->'dates'
      else '{}'::jsonb
    end;

    if p_target_deadline is null then
      v_meta := v_meta
        - 'deadline_date' - 'deadlineDate'
        - 'deadline_at' - 'deadlineAt'
        - 'application_deadline' - 'applicationDeadline'
        - 'inscricoes_ate' - 'inscricoesAte'
        - 'prazo_inscricao' - 'prazoInscricao'
        - 'submission_deadline' - 'submissionDeadline';
      v_dates := v_dates - 'applicationDeadline' - 'application_deadline';
    else
      v_meta := jsonb_set(v_meta, '{deadline_date}', to_jsonb(v_deadline), true);
      v_meta := jsonb_set(v_meta, '{deadlineDate}', to_jsonb(v_deadline), true);
      v_meta := jsonb_set(v_meta, '{deadline_at}', to_jsonb(v_deadline), true);
      v_meta := jsonb_set(v_meta, '{deadlineAt}', to_jsonb(v_deadline), true);
      v_meta := jsonb_set(v_meta, '{application_deadline}', to_jsonb(v_deadline), true);
      v_meta := jsonb_set(v_meta, '{applicationDeadline}', to_jsonb(v_deadline), true);
      if v_meta ? 'inscricoes_ate' then
        v_meta := jsonb_set(v_meta, '{inscricoes_ate}', to_jsonb(v_deadline), false);
      end if;
      if v_meta ? 'inscricoesAte' then
        v_meta := jsonb_set(v_meta, '{inscricoesAte}', to_jsonb(v_deadline), false);
      end if;
      if v_meta ? 'prazo_inscricao' then
        v_meta := jsonb_set(v_meta, '{prazo_inscricao}', to_jsonb(v_deadline), false);
      end if;
      if v_meta ? 'prazoInscricao' then
        v_meta := jsonb_set(v_meta, '{prazoInscricao}', to_jsonb(v_deadline), false);
      end if;
      if v_meta ? 'submission_deadline' then
        v_meta := jsonb_set(v_meta, '{submission_deadline}', to_jsonb(v_deadline), false);
      end if;
      if v_meta ? 'submissionDeadline' then
        v_meta := jsonb_set(v_meta, '{submissionDeadline}', to_jsonb(v_deadline), false);
      end if;

      v_dates := jsonb_set(v_dates, '{applicationDeadline}', to_jsonb(v_deadline), true);
    end if;

    v_meta := jsonb_set(v_meta, '{dates}', v_dates, true);
  end if;

  return v_meta;
end;
$function$;

create or replace function pg_temp.kc_semantic_touched_fingerprint_20260808(
  p_metadata jsonb,
  p_target_module text,
  p_clear_incompatible_module_fields boolean,
  p_touch_event_dates boolean,
  p_touch_deadline boolean
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_meta jsonb := case
    when jsonb_typeof(p_metadata) = 'object' then p_metadata
    else '{}'::jsonb
  end;
  v_root_keys text[] := array[
    'category', 'categoryKey', 'module', 'categoriaKey', 'moduleKey',
    'categoryLabel', 'categoria', 'categoriaLabel', 'tags', 'tagKeys'
  ];
  v_dates_keys text[] := array[]::text[];
  v_root jsonb;
  v_dates jsonb := '{}'::jsonb;
  v_result jsonb;
  v_touch_dates_object boolean := false;
  v_dates_type text;
begin
  if p_clear_incompatible_module_fields and p_target_module = 'oportunidades' then
    v_root_keys := v_root_keys || array[
      'date_start', 'date_end',
      'data_evento', 'dataEvento', 'data_inicio_evento', 'dataInicioEvento', 'data',
      'data_fim_evento', 'dataFimEvento', 'data_fim', 'dataFim',
      'eventStartsAt', 'eventEndsAt',
      'eventStart', 'eventEnd', 'eventTime', 'event_time',
      'event_starts_at', 'event_ends_at',
      'event_start', 'event_end', 'event_date', 'eventDate',
      'hora_evento', 'horaEvento', 'hora',
      'eventType', 'event_type', 'eventMode', 'event_mode',
      'eventLocation', 'event_location'
    ];
    v_dates_keys := v_dates_keys || array[
      'eventStartsAt', 'eventEndsAt', 'event_starts_at', 'event_ends_at', 'eventStart', 'eventEnd'
    ];
    v_touch_dates_object := true;
  elsif p_clear_incompatible_module_fields and p_target_module = 'eventos' then
    v_root_keys := v_root_keys || array[
      'areaKey', 'areaLabel', 'area', 'areaAtuacao', 'area_atuacao',
      'workMode', 'workModeLabel', 'work_mode', 'modalidadeTrabalho', 'modalidade',
      'employmentType', 'employmentTypeLabel', 'employment_type', 'regimeContratacao',
      'remuneracao', 'salary', 'salario', 'benefits', 'beneficios',
      'opportunityType', 'opportunityTypeKey', 'opportunity_type',
      'subcategory', 'subcategoryKey', 'subcategoryLabel',
      'subcategoria', 'subcategoriaKey', 'subcategoriaLabel'
    ];
  end if;

  if p_touch_event_dates then
    v_root_keys := v_root_keys || array[
      'date_start', 'date_end',
      'data_evento', 'dataEvento', 'data_inicio_evento', 'dataInicioEvento', 'data',
      'data_fim_evento', 'dataFimEvento', 'data_fim', 'dataFim',
      'eventStartsAt', 'eventEndsAt',
      'eventStart', 'eventEnd',
      'event_starts_at', 'event_ends_at',
      'event_start', 'event_end', 'event_date', 'eventDate'
    ];
    v_dates_keys := v_dates_keys || array[
      'eventStartsAt', 'eventEndsAt', 'event_starts_at', 'event_ends_at', 'eventStart', 'eventEnd'
    ];
    v_touch_dates_object := true;
  end if;

  if p_touch_deadline then
    v_root_keys := v_root_keys || array[
      'deadline_date', 'deadlineDate', 'deadline_at', 'deadlineAt',
      'application_deadline', 'applicationDeadline',
      'inscricoes_ate', 'inscricoesAte', 'prazo_inscricao', 'prazoInscricao',
      'submission_deadline', 'submissionDeadline'
    ];
    v_dates_keys := v_dates_keys || array['applicationDeadline', 'application_deadline'];
    v_touch_dates_object := true;
  end if;

  select coalesce(jsonb_object_agg(entry.key, entry.value order by entry.key), '{}'::jsonb)
    into v_root
  from jsonb_each(v_meta) entry
  where entry.key = any(v_root_keys);

  v_result := jsonb_build_object('root', v_root);

  if v_touch_dates_object then
    if not (v_meta ? 'dates') then
      v_dates_type := 'missing';
    else
      v_dates_type := coalesce(jsonb_typeof(v_meta->'dates'), 'json-null');
      if jsonb_typeof(v_meta->'dates') = 'object' then
        select coalesce(jsonb_object_agg(entry.key, entry.value order by entry.key), '{}'::jsonb)
          into v_dates
        from jsonb_each(v_meta->'dates') entry
        where entry.key = any(v_dates_keys);
      end if;
    end if;

    v_result := v_result || jsonb_build_object(
      'dates', v_dates,
      'datesType', v_dates_type
    );
  end if;

  return v_result;
end;
$function$;

-- Rebuild only the audited metadata surface from its captured fingerprint.
-- This is intentionally independent from the live target row: it lets the
-- migration derive one immutable target fingerprint from the audited source.
create or replace function pg_temp.kc_semantic_metadata_from_touched_fingerprint_20260808(
  p_fingerprint jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_meta jsonb;
  v_dates_type text;
begin
  if jsonb_typeof(p_fingerprint) <> 'object'
     or jsonb_typeof(p_fingerprint->'root') <> 'object' then
    raise exception using
      errcode = 'P0001',
      message = 'semantic post reclassification internal error: invalid audited touched fingerprint';
  end if;

  v_meta := p_fingerprint->'root';
  v_dates_type := p_fingerprint->>'datesType';

  if v_dates_type = 'object' then
    if jsonb_typeof(p_fingerprint->'dates') <> 'object' then
      raise exception using
        errcode = 'P0001',
        message = 'semantic post reclassification internal error: invalid audited dates fingerprint';
    end if;
    v_meta := jsonb_set(v_meta, '{dates}', p_fingerprint->'dates', true);
  elsif v_dates_type = 'json-null' then
    v_meta := jsonb_set(v_meta, '{dates}', 'null'::jsonb, true);
  elsif v_dates_type is not null and v_dates_type <> 'missing' then
    raise exception using
      errcode = 'P0001',
      message = format(
        'semantic post reclassification internal error: unsupported audited dates type %s',
        v_dates_type
      );
  end if;

  return v_meta;
end;
$function$;

insert into pg_temp.kc_semantic_post_reclassification_20260808 (
  id,
  current_module,
  current_category,
  current_status,
  target_module,
  target_category,
  target_category_label,
  target_status,
  touch_event_dates,
  target_event_start,
  target_event_end,
  touch_deadline,
  target_deadline
)
values
  -- Eventos reclassificados como congressos.
  ('fbfaeb0f-a7f5-4ba0-a410-ca1f9b1dccbb'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'congressos', 'Congressos', 'published', false, null, null, false, null),
  ('19f52e45-7942-474a-9076-015be4e2af48'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'congressos', 'Congressos', 'published', true, date '2026-08-27', date '2026-08-29', false, null),
  ('6b92fc98-312b-423a-b309-b90d2e7592d2'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'congressos', 'Congressos', 'published', false, null, null, false, null),
  ('2b150e53-dc80-459a-93e5-1ae2bc918adc'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'congressos', 'Congressos', 'published', false, null, null, false, null),
  ('150cadb3-1821-4b39-893b-93deac7b06b6'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'congressos', 'Congressos', 'published', false, null, null, false, null),
  ('752300fd-d5d1-4873-8ca4-62a19d0f04c2'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'congressos', 'Congressos', 'published', true, date '2026-08-24', date '2026-08-24', true, date '2026-08-25'),
  ('a8a3f0e5-c461-4a2b-bf94-2a1c5e2d7e39'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'congressos', 'Congressos', 'published', false, null, null, false, null),
  ('3b3f1ae3-f0ee-41f3-9a33-3e6193464016'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'congressos', 'Congressos', 'published', false, null, null, false, null),
  ('6ce3f580-960f-4138-837f-bac6df0a9498'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'congressos', 'Congressos', 'published', false, null, null, false, null),
  ('b0c85d6b-1289-48b1-9248-ea6c8081fbf2'::uuid, 'eventos', 'culturais', 'published', 'eventos', 'congressos', 'Congressos', 'published', false, null, null, false, null),
  ('ac5714e1-eb5e-4d30-984e-0244ee1b05e0'::uuid, 'eventos', 'culturais', 'published', 'eventos', 'congressos', 'Congressos', 'published', true, date '2026-09-16', date '2026-09-19', true, date '2026-09-03'),
  ('bcbee373-c92b-4cc2-a290-9f0ab81518e2'::uuid, 'eventos', 'culturais', 'published', 'eventos', 'congressos', 'Congressos', 'published', false, null, null, false, null),
  ('944a8198-4823-4661-afcb-1a6faef1259c'::uuid, 'eventos', 'culturais', 'published', 'eventos', 'congressos', 'Congressos', 'published', true, date '2026-10-07', date '2026-10-09', true, null),
  ('176fc9f3-052d-44f1-a251-afd895bfc1a7'::uuid, 'eventos', 'workshops', 'published', 'eventos', 'congressos', 'Congressos', 'published', true, date '2026-11-25', date '2026-11-27', true, null),
  ('d8715365-d49c-4bb7-b331-5faa4f1cc458'::uuid, 'eventos', 'workshops', 'published', 'eventos', 'congressos', 'Congressos', 'published', true, date '2026-10-21', date '2026-10-23', true, date '2026-09-30'),
  ('e02fc2b9-12b4-458d-a8dc-95b9c0510b49'::uuid, 'eventos', 'workshops', 'published', 'eventos', 'congressos', 'Congressos', 'published', false, null, null, false, null),

  -- Eventos reclassificados em outros subtópicos canônicos.
  ('ebeaf871-371c-4f9b-8169-824e2da86ba3'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'cursos', 'Cursos', 'published', false, null, null, false, null),
  ('899359eb-b411-4b1f-95c4-234e88c49041'::uuid, 'eventos', 'culturais', 'published', 'eventos', 'cursos', 'Cursos', 'published', true, date '2026-08-08', date '2026-11-28', true, date '2026-08-04'),
  ('0f601a58-f4a0-46a7-9810-a28b5564e67c'::uuid, 'eventos', 'culturais', 'published', 'eventos', 'cursos', 'Cursos', 'published', false, null, null, false, null),
  ('7038c22d-fe66-49f6-a2a2-ec086f4f9a20'::uuid, 'eventos', 'workshops', 'published', 'eventos', 'cursos', 'Cursos', 'published', false, null, null, false, null),
  ('ba140334-470b-4655-a9c1-994ba64e4c28'::uuid, 'eventos', 'workshops', 'published', 'eventos', 'cursos', 'Cursos', 'published', true, date '2026-09-01', date '2026-09-24', true, date '2026-08-27'),
  ('a59449cb-ca81-4545-a147-32a6dbd2c852'::uuid, 'eventos', 'workshops', 'published', 'eventos', 'cursos', 'Cursos', 'published', true, date '2026-08-17', date '2026-08-28', true, date '2026-08-13'),
  ('5c601845-a26e-46d5-94c0-ba67a50e3ccd'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'palestras', 'Palestras', 'published', false, null, null, false, null),
  ('a246c601-e693-4d7b-a07b-99e0cb617616'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'culturais', 'Culturais', 'published', false, null, null, false, null),
  ('09460066-0e96-45b9-81b4-7ff2e564c6aa'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'culturais', 'Culturais', 'published', false, null, null, false, null),
  ('495b4856-d68a-49bc-89a4-79a16c2c3a7f'::uuid, 'eventos', 'workshops', 'published', 'eventos', 'academicos', 'Acadêmicos', 'published', false, null, null, false, null),
  ('cb2ce3c1-df2c-43ec-a75d-f251ea61473a'::uuid, 'eventos', 'culturais', 'published', 'eventos', 'academicos', 'Acadêmicos', 'published', false, null, null, false, null),

  -- Correções explícitas de módulo ou estado editorial.
  ('2764dfda-1cf3-4aa1-b255-49248415c9e2'::uuid, 'eventos', 'academicos', 'published', 'oportunidades', 'concursos', 'Concursos', 'published', true, null, null, true, date '2026-08-31'),
  ('b9b214e9-30a2-4a83-8037-e17ca2b8c5d1'::uuid, 'eventos', 'workshops', 'published', 'oportunidades', 'pesquisa', 'Pesquisa', 'published', true, null, null, true, date '2026-08-21'),
  ('14c43a7f-395c-4ee0-8d11-9ddf76667586'::uuid, 'eventos', 'workshops', 'published', 'oportunidades', 'pesquisa', 'Pesquisa', 'published', true, null, null, true, date '2026-08-14'),
  ('84f595c9-e601-412b-bf10-263284bbe81d'::uuid, 'oportunidades', 'editais', 'published', 'eventos', 'congressos', 'Congressos', 'published', true, date '2026-09-15', date '2026-09-15', true, null),
  ('e9a826be-a1e3-43eb-aece-85742c10e255'::uuid, 'oportunidades', 'estagios', 'published', 'eventos', 'palestras', 'Palestras', 'published', true, date '2026-08-13', date '2026-08-13', true, null),
  ('f75602ca-76a2-4cea-b368-3e45cc995816'::uuid, 'oportunidades', 'editais', 'published', 'oportunidades', 'editais', 'Editais', 'closed', true, date '2026-08-25', date '2026-08-27', true, date '2026-06-01'),
  ('b6fff52c-93ad-4579-8a9d-86a8d9d1dea4'::uuid, 'eventos', 'workshops', 'published', 'eventos', 'workshops', 'Workshops', 'hidden', true, null, null, true, null),
  ('31715ae7-9cd9-4fda-adb2-6541da6fec64'::uuid, 'oportunidades', 'monitoria', 'published', 'oportunidades', 'monitoria', 'Monitoria', 'hidden', false, null, null, true, null),
  ('953bb526-e5f5-4e36-a59c-7b102e344518'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'academicos', 'Acadêmicos', 'hidden', true, null, null, true, date '2026-06-05'),

  -- Oportunidades reclassificadas em categorias canônicas.
  ('50a3e363-76ed-4bc6-b8fd-ab4b79faa857'::uuid, 'oportunidades', 'empregos', 'published', 'oportunidades', 'pesquisa', 'Pesquisa', 'published', false, null, null, false, null),
  ('1917e659-5151-4650-bfa2-6ec20fd5e81b'::uuid, 'oportunidades', 'empregos', 'published', 'oportunidades', 'pesquisa', 'Pesquisa', 'published', false, null, null, false, null),
  ('a8a66d60-0a03-4606-907a-15e48f9f687b'::uuid, 'oportunidades', 'empregos', 'published', 'oportunidades', 'concursos', 'Concursos', 'published', false, null, null, false, null),
  ('3ae523bb-c15b-4d36-a494-1ca43ae95aa3'::uuid, 'oportunidades', 'empregos', 'published', 'oportunidades', 'concursos', 'Concursos', 'published', false, null, null, false, null),
  ('ebb3c886-ac26-4022-bf9e-f3ce31d9fbbe'::uuid, 'oportunidades', 'estagios', 'published', 'oportunidades', 'monitoria', 'Monitoria', 'published', false, null, null, false, null),
  ('c848f243-077b-4dc8-bf52-86572af7f5fb'::uuid, 'oportunidades', 'monitoria', 'published', 'oportunidades', 'cursos-capacitacoes', 'Cursos e capacitações', 'published', false, null, null, false, null),
  ('577ea0ba-a7ad-4f01-8a05-fbd0a4b4fbe4'::uuid, 'oportunidades', 'monitoria', 'published', 'oportunidades', 'cursos-capacitacoes', 'Cursos e capacitações', 'published', false, null, null, false, null),
  ('fffdc11c-2855-4a8d-9cb2-c10cad863888'::uuid, 'oportunidades', 'monitoria', 'published', 'oportunidades', 'cursos-capacitacoes', 'Cursos e capacitações', 'published', false, null, null, false, null),
  ('498e0054-31f1-458b-8953-3179decdd033'::uuid, 'oportunidades', 'pesquisa', 'published', 'oportunidades', 'cursos-capacitacoes', 'Cursos e capacitações', 'published', false, null, null, false, null),
  ('ca10120d-7e9b-42f7-971a-db9861540a5b'::uuid, 'oportunidades', 'pesquisa', 'published', 'oportunidades', 'cursos-capacitacoes', 'Cursos e capacitações', 'published', false, null, null, false, null),
  ('080f8237-a8fe-4200-b53a-946b7ea934a3'::uuid, 'oportunidades', 'pesquisa', 'published', 'oportunidades', 'cursos-capacitacoes', 'Cursos e capacitações', 'published', false, null, null, false, null),
  ('858c8b0b-007b-402d-a7e8-0ad1d753d87e'::uuid, 'oportunidades', 'pesquisa', 'published', 'oportunidades', 'voluntariado', 'Voluntariado', 'published', false, null, null, false, null),
  ('4bc906fb-0f5f-463e-bcbd-26c6329a995e'::uuid, 'oportunidades', 'voluntariado', 'published', 'oportunidades', 'bolsas', 'Bolsas', 'published', false, null, null, false, null);

-- Audited touched-field fingerprints recaptured read-only from production on
-- 2026-08-08 after migration 20260808152843. Only keys that this migration may
-- overwrite or delete are represented, including category labels and tag
-- arrays. This deliberately ignores unrelated volatile metadata.
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","eeca","Academicos"],"tagKeys":["ufg","eeca","academicos"],"categoria":"Academicos","categoryKey":"academicos","categoriaKey":"academicos","categoryLabel":"Academicos"}}'::jsonb where id = 'fbfaeb0f-a7f5-4ba0-a410-ca1f9b1dccbb'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","fefd","Academicos"],"tagKeys":["ufg","fefd","academicos"],"date_end":"2026-08-29","categoria":"Academicos","date_start":"2026-08-27","categoryKey":"academicos","data_evento":"2026-08-29","categoriaKey":"academicos","categoryLabel":"Academicos","data_fim_evento":"2026-08-29"},"dates":{"eventEndsAt":"2026-08-29","eventStartsAt":"2026-08-27"},"datesType":"object"}'::jsonb where id = '19f52e45-7942-474a-9076-015be4e2af48'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","fanut","Workshops"],"tagKeys":["ufg","fanut","congressos"],"categoria":"Congressos","categoryKey":"congressos","categoriaKey":"congressos","categoryLabel":"Workshops"}}'::jsonb where id = '6b92fc98-312b-423a-b309-b90d2e7592d2'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","fefd","Academicos"],"tagKeys":["ufg","fefd","academicos"],"categoria":"Academicos","categoryKey":"academicos","categoriaKey":"academicos","categoryLabel":"Academicos"}}'::jsonb where id = '2b150e53-dc80-459a-93e5-1ae2bc918adc'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["Acadêmicos"],"tagKeys":["academicos"],"categoria":"Acadêmicos","categoryKey":"academicos","categoriaKey":"academicos","categoryLabel":"Acadêmicos"}}'::jsonb where id = '150cadb3-1821-4b39-893b-93deac7b06b6'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"data":"2026-08-20","date_end":"2026-08-25","categoria":"Acadêmicos","date_start":"2026-08-24","categoryKey":"academicos","data_evento":"2026-08-20","categoriaKey":"academicos","deadline_date":null},"dates":{},"datesType":"object"}'::jsonb where id = '752300fd-d5d1-4873-8ca4-62a19d0f04c2'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["Acadêmicos"],"tagKeys":["academicos"],"categoria":"Acadêmicos","categoryKey":"academicos","categoriaKey":"academicos","categoryLabel":"Acadêmicos"}}'::jsonb where id = 'a8a3f0e5-c461-4a2b-bf94-2a1c5e2d7e39'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","ufg","Academicos"],"tagKeys":["ufg","academicos"],"category":"academicos","categoria":"Academicos","categoryKey":"academicos","categoriaKey":"academicos","categoryLabel":"Academicos"}}'::jsonb where id = '3b3f1ae3-f0ee-41f3-9a33-3e6193464016'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["Acadêmicos"],"tagKeys":["academicos"],"categoria":"Acadêmicos","categoryKey":"academicos","categoriaKey":"academicos","categoryLabel":"Acadêmicos"}}'::jsonb where id = '6ce3f580-960f-4138-837f-bac6df0a9498'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["Culturais"],"tagKeys":["culturais"],"category":"culturais","categoria":"Culturais","categoryKey":"culturais","categoriaKey":"culturais","categoryLabel":"Culturais"}}'::jsonb where id = 'b0c85d6b-1289-48b1-9248-ea6c8081fbf2'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","iptsp","Culturais"],"tagKeys":["ufg","iptsp","culturais"],"categoria":"Culturais","categoryKey":"culturais","data_evento":"2026-09-03","categoriaKey":"culturais","categoryLabel":"Culturais","deadline_date":"03/09/2026","data_fim_evento":"2026-09-19"},"dates":{},"datesType":"missing"}'::jsonb where id = 'ac5714e1-eb5e-4d30-984e-0244ee1b05e0'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","cepae","Culturais"],"tagKeys":["ufg","cepae","culturais"],"categoria":"Culturais","categoryKey":"culturais","categoriaKey":"culturais","categoryLabel":"Culturais"}}'::jsonb where id = 'bcbee373-c92b-4cc2-a290-9f0ab81518e2'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","ppgcom","Culturais"],"tagKeys":["ufg","ppgcom","culturais"],"categoria":"Culturais","categoryKey":"culturais","data_evento":"2026-10-09","categoriaKey":"culturais","categoryLabel":"Culturais","deadline_date":"09/10/2026","data_fim_evento":"2026-10-09"},"dates":{},"datesType":"missing"}'::jsonb where id = '944a8198-4823-4661-afcb-1a6faef1259c'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","ig:@ppgeo.ufg","Workshops"],"tagKeys":["ufg","ig-ppgeo-ufg","workshops"],"categoria":"Workshops","categoryKey":"workshops","data_evento":"2026-11-27","categoriaKey":"workshops","categoryLabel":"Workshops","deadline_date":"27/11/2026","data_fim_evento":"2026-11-27"},"dates":{},"datesType":"missing"}'::jsonb where id = '176fc9f3-052d-44f1-a251-afd895bfc1a7'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","ime","Workshops"],"tagKeys":["ufg","ime","workshops"],"categoria":"Workshops","categoryKey":"workshops","data_evento":"2026-09-30","categoriaKey":"workshops","categoryLabel":"Workshops","deadline_date":"30/09/2026","data_fim_evento":"2026-10-23"},"dates":{"eventEndsAt":"2026-10-23","eventStartsAt":"2026-10-21","applicationDeadline":"2026-09-30"},"datesType":"object"}'::jsonb where id = 'd8715365-d49c-4bb7-b331-5faa4f1cc458'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["Workshops"],"tagKeys":["workshops"],"categoria":"Workshops","categoryKey":"workshops","categoriaKey":"workshops","categoryLabel":"Workshops"}}'::jsonb where id = 'e02fc2b9-12b4-458d-a8dc-95b9c0510b49'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["Acadêmicos"],"tagKeys":["academicos"],"categoria":"Acadêmicos","categoryKey":"academicos","categoriaKey":"academicos","categoryLabel":"Acadêmicos"}}'::jsonb where id = 'ebeaf871-371c-4f9b-8169-824e2da86ba3'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","fe","Estagios","Artes","Hibrido"],"tagKeys":["ufg","fe","estagios","artes","hibrido"],"date_end":"2026-11-28","categoria":"Estagios","date_start":"2026-08-08","categoryKey":"estagios","categoriaKey":"estagios","categoryLabel":"Estagios","deadline_date":null},"dates":{"eventEndsAt":"2026-11-28","eventStartsAt":"2026-08-08","applicationDeadline":"2026-08-04"},"datesType":"object"}'::jsonb where id = '899359eb-b411-4b1f-95c4-234e88c49041'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","ppgmtsp","Culturais"],"tagKeys":["ufg","ppgmtsp","culturais"],"categoria":"Culturais","categoryKey":"culturais","categoriaKey":"culturais","categoryLabel":"Culturais"}}'::jsonb where id = '0f601a58-f4a0-46a7-9810-a28b5564e67c'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["Workshops"],"tagKeys":["workshops"],"categoria":"Workshops","categoryKey":"workshops","categoriaKey":"workshops","categoryLabel":"Workshops"}}'::jsonb where id = '7038c22d-fe66-49f6-a2a2-ec086f4f9a20'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","idiomassemfronteiras","Workshops"],"tagKeys":["ufg","idiomassemfronteiras","workshops"],"categoria":"Workshops","categoryKey":"workshops","data_evento":"2026-08-27","categoriaKey":"workshops","categoryLabel":"Workshops","deadline_date":"27/08/2026","data_fim_evento":"2026-09-24"},"dates":{},"datesType":"missing"}'::jsonb where id = 'ba140334-470b-4655-a9c1-994ba64e4c28'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["Workshops"],"tagKeys":["workshops"],"date_end":"2026-08-28","categoria":"Workshops","date_start":"2026-08-17","categoryKey":"workshops","data_evento":"2026-08-28","categoriaKey":"workshops","categoryLabel":"Workshops","deadline_date":null,"data_fim_evento":"2026-08-28"},"dates":{"eventEndsAt":"2026-08-28","eventStartsAt":"2026-08-17","applicationDeadline":"2026-08-13"},"datesType":"object"}'::jsonb where id = 'a59449cb-ca81-4545-a147-32a6dbd2c852'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","propessoas","Academicos"],"tagKeys":["ufg","propessoas","academicos"],"categoria":"Academicos","categoryKey":"academicos","categoriaKey":"academicos","categoryLabel":"Academicos"}}'::jsonb where id = '5c601845-a26e-46d5-94c0-ba67a50e3ccd'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["Acadêmicos"],"tagKeys":["academicos"],"categoria":"Acadêmicos","categoryKey":"academicos","categoriaKey":"academicos","categoryLabel":"Acadêmicos"}}'::jsonb where id = 'a246c601-e693-4d7b-a07b-99e0cb617616'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","eventos","Academicos"],"tagKeys":["ufg","eventos","academicos"],"category":"academicos","categoria":"Academicos","categoryKey":"academicos","categoriaKey":"academicos","categoryLabel":"Academicos"}}'::jsonb where id = '09460066-0e96-45b9-81b4-7ff2e564c6aa'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","ig:@campusgoiasufg","Workshops"],"tagKeys":["ufg","ig-campusgoiasufg","workshops"],"categoria":"Workshops","categoryKey":"workshops","categoriaKey":"workshops","categoryLabel":"Workshops"}}'::jsonb where id = '495b4856-d68a-49bc-89a4-79a16c2c3a7f'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","ig:@iqufg","Culturais"],"tagKeys":["ufg","ig-iqufg","culturais"],"categoria":"Culturais","categoryKey":"culturais","categoriaKey":"culturais","categoryLabel":"Culturais"}}'::jsonb where id = 'cb2ce3c1-df2c-43ec-a75d-f251ea61473a'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["edital","premio","saude","inovacao","pesquisa","peter-muranyi","UFG","Academicos"],"tagKeys":["edital","premio","saude","inovacao","pesquisa","peter-muranyi","ufg","academicos"],"categoria":"Academicos","categoryKey":"academicos","data_evento":"2026-08-31","hora_evento":"","categoriaKey":"academicos","categoryLabel":"Academicos","deadline_date":"31/08/2026","data_fim_evento":""},"dates":{},"datesType":"missing"}'::jsonb where id = '2764dfda-1cf3-4aa1-b255-49248415c9e2'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","ppgda","Workshops"],"tagKeys":["ufg","ppgda","workshops"],"categoria":"Workshops","categoryKey":"workshops","data_evento":"2026-08-21","hora_evento":"","categoriaKey":"workshops","categoryLabel":"Workshops","deadline_date":"21/08/2026","data_fim_evento":""},"dates":{},"datesType":"missing"}'::jsonb where id = 'b9b214e9-30a2-4a83-8037-e17ca2b8c5d1'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","profmat","Workshops"],"tagKeys":["ufg","profmat","workshops"],"categoria":"Workshops","categoryKey":"workshops","data_evento":"2026-08-14","hora_evento":"","categoriaKey":"workshops","categoryLabel":"Workshops","deadline_date":"14/08/2026","data_fim_evento":"2026-08-14"},"dates":{"eventStartsAt":"2026-08-14"},"datesType":"object"}'::jsonb where id = '14c43a7f-395c-4ee0-8d11-9ddf76667586'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"area":"Saude","tags":["UFG","ig:@fanutufg","Editais","Saude","Presencial"],"areaKey":"saude","tagKeys":["ufg","ig-fanutufg","editais","saude","presencial"],"workMode":"presencial","areaLabel":"Saude","categoria":"Editais","categoryKey":"editais","remuneracao":"","categoriaKey":"editais","categoryLabel":"Editais","deadline_date":"2026-09-15","workModeLabel":"Presencial","employmentType":"","opportunityType":"","regimeContratacao":"","modalidadeTrabalho":"Presencial","employmentTypeLabel":"","subcategory":"saude","subcategoryLabel":"Saude","subcategoria":"Saude","subcategoriaKey":"saude"},"dates":{},"datesType":"missing"}'::jsonb where id = '84f595c9-e601-412b-bf10-263284bbe81d'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"area":"Direito","tags":["UFG","ig:@direitoufg","Estagios","Direito","Presencial"],"areaKey":"direito","tagKeys":["ufg","ig-direitoufg","estagios","direito","presencial"],"workMode":"presencial","areaLabel":"Direito","categoria":"Estagios","categoryKey":"estagios","remuneracao":"","categoriaKey":"estagios","categoryLabel":"Estagios","deadline_date":"2026-08-13","workModeLabel":"Presencial","employmentType":"","opportunityType":"","regimeContratacao":"","modalidadeTrabalho":"Presencial","employmentTypeLabel":"","subcategory":"direito","subcategoryLabel":"Direito","subcategoria":"Direito","subcategoriaKey":"direito"},"dates":{},"datesType":"missing"}'::jsonb where id = 'e9a826be-a1e3-43eb-aece-85742c10e255'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","direito","Workshops"],"tagKeys":["editais","ufg","direito"],"categoria":"Editais","categoryKey":"editais","data_evento":"2026-08-27","categoriaKey":"editais","categoryLabel":"Workshops","deadline_date":"27/08/2026","data_fim_evento":""},"dates":{},"datesType":"object"}'::jsonb where id = 'f75602ca-76a2-4cea-b368-3e45cc995816'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","ufg","Workshops"],"tagKeys":["ufg","workshops"],"category":"workshops","categoria":"Workshops","categoryKey":"workshops","data_evento":"2027-07-04","categoriaKey":"workshops","categoryLabel":"Workshops","deadline_date":"04/07/2027","data_fim_evento":""},"dates":{},"datesType":"missing"}'::jsonb where id = 'b6fff52c-93ad-4579-8a9d-86a8d9d1dea4'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","ig:@iqufg","Monitoria","Artes","Presencial"],"tagKeys":["ufg","ig-iqufg","monitoria","artes","presencial"],"categoria":"Monitoria","categoryKey":"monitoria","categoriaKey":"monitoria","categoryLabel":"Monitoria","deadline_date":"2026-10-25"},"dates":{},"datesType":"missing"}'::jsonb where id = '31715ae7-9cd9-4fda-adb2-6541da6fec64'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"data":"2026-08-15","tags":["UFG","prpg","Pesquisa","Presencial"],"tagKeys":["academicos","ufg","prpg","presencial"],"categoria":"Acadêmicos","categoryKey":"academicos","data_evento":"2026-08-15","categoriaKey":"academicos","categoryLabel":"Pesquisa"},"dates":{"eventEndsAt":null,"eventStartsAt":"2026-11-30","applicationDeadline":"2026-06-05"},"datesType":"object"}'::jsonb where id = '953bb526-e5f5-4e36-a59c-7b102e344518'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","prpi","Empregos","Pesquisa","Presencial"],"tagKeys":["ufg","prpi","empregos","pesquisa","presencial"],"categoria":"Empregos","categoryKey":"empregos","categoriaKey":"empregos","categoryLabel":"Empregos"}}'::jsonb where id = '50a3e363-76ed-4bc6-b8fd-ab4b79faa857'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","fefd","Empregos","Pesquisa","Presencial"],"tagKeys":["ufg","fefd","empregos","pesquisa","presencial"],"categoria":"Empregos","categoryKey":"empregos","categoriaKey":"empregos","categoryLabel":"Empregos"}}'::jsonb where id = '1917e659-5151-4650-bfa2-6ec20fd5e81b'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","ig:@institutoverbenaufg","Empregos","Academica","Presencial"],"tagKeys":["ufg","ig-institutoverbenaufg","empregos","academica","presencial"],"categoria":"Empregos","categoryKey":"empregos","categoriaKey":"empregos","categoryLabel":"Empregos"}}'::jsonb where id = 'a8a66d60-0a03-4606-907a-15e48f9f687b'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","ig:@institutoverbenaufg","Empregos","Academica","Presencial"],"tagKeys":["ufg","ig-institutoverbenaufg","empregos","academica","presencial"],"categoria":"Empregos","categoryKey":"empregos","categoriaKey":"empregos","categoryLabel":"Empregos"}}'::jsonb where id = '3ae523bb-c15b-4d36-a494-1ca43ae95aa3'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","ig:@fafilufg","Estagios","Academica","Presencial"],"tagKeys":["ufg","ig-fafilufg","estagios","academica","presencial"],"categoria":"Estagios","categoryKey":"estagios","categoriaKey":"estagios","categoryLabel":"Estagios"}}'::jsonb where id = 'ebb3c886-ac26-4022-bf9e-f3ce31d9fbbe'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","iptsp","Monitoria","Saude","Remoto"],"tagKeys":["ufg","iptsp","monitoria","saude","remoto"],"categoria":"Monitoria","categoryKey":"monitoria","categoriaKey":"monitoria","categoryLabel":"Monitoria"}}'::jsonb where id = 'c848f243-077b-4dc8-bf52-86572af7f5fb'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","fen","Monitoria","Saude","Presencial"],"tagKeys":["ufg","fen","monitoria","saude","presencial"],"categoria":"Monitoria","categoryKey":"monitoria","categoriaKey":"monitoria","categoryLabel":"Monitoria"}}'::jsonb where id = '577ea0ba-a7ad-4f01-8a05-fbd0a4b4fbe4'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["Monitoria","Saúde","Presencial"],"tagKeys":["monitoria","saude","presencial"],"category":"monitoria","categoria":"Monitoria","categoryKey":"monitoria","categoriaKey":"monitoria","categoryLabel":"Monitoria"}}'::jsonb where id = 'fffdc11c-2855-4a8d-9cb2-c10cad863888'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","ig:@posufg","Pesquisa","Tecnologia","Presencial"],"tagKeys":["ufg","ig-posufg","pesquisa","tecnologia","presencial"],"categoria":"Pesquisa","categoryKey":"pesquisa","categoriaKey":"pesquisa","categoryLabel":"Pesquisa"}}'::jsonb where id = '498e0054-31f1-458b-8953-3179decdd033'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","iptsp","Pesquisa","Remoto"],"tagKeys":["ufg","iptsp","pesquisa","remoto"],"categoria":"Pesquisa","categoryKey":"pesquisa","categoriaKey":"pesquisa","categoryLabel":"Pesquisa"}}'::jsonb where id = 'ca10120d-7e9b-42f7-971a-db9861540a5b'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","iesa","Pesquisa","Remoto"],"tagKeys":["ufg","iesa","pesquisa","remoto"],"categoria":"Pesquisa","categoryKey":"pesquisa","categoriaKey":"pesquisa","categoryLabel":"Pesquisa"}}'::jsonb where id = '080f8237-a8fe-4200-b53a-946b7ea934a3'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["UFG","ig:@lapigufg","Pesquisa","Academica","Presencial"],"tagKeys":["ufg","ig-lapigufg","pesquisa","academica","presencial"],"categoria":"Pesquisa","categoryKey":"pesquisa","categoriaKey":"pesquisa","categoryLabel":"Pesquisa"}}'::jsonb where id = '858c8b0b-007b-402d-a7e8-0ad1d753d87e'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"tags":["Voluntariado","Marketing","Presencial"],"tagKeys":["voluntariado","marketing","presencial"],"categoria":"Voluntariado","categoryKey":"voluntariado","categoriaKey":"voluntariado","categoryLabel":"Voluntariado"}}'::jsonb where id = '4bc906fb-0f5f-463e-bcbd-26c6329a995e'::uuid;

do $audited_source_fingerprint_guard$
begin
  if (select count(*) from pg_temp.kc_semantic_post_reclassification_20260808) <> 49
     or exists (
       select 1
       from pg_temp.kc_semantic_post_reclassification_20260808
       where current_touched_fingerprint is null
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'semantic post reclassification internal error: expected exactly 49 audited source fingerprints';
  end if;
end;
$audited_source_fingerprint_guard$;

-- Freeze one target fingerprint per UUID from the embedded audited source.
-- No live public.posts metadata participates in this computation.
update pg_temp.kc_semantic_post_reclassification_20260808 spec
set target_touched_fingerprint = pg_temp.kc_semantic_touched_fingerprint_20260808(
  pg_temp.kc_semantic_post_metadata_20260808(
    pg_temp.kc_semantic_metadata_from_touched_fingerprint_20260808(
      spec.current_touched_fingerprint
    ),
    spec.current_category,
    spec.target_module,
    spec.target_category,
    spec.target_category_label,
    spec.current_module <> spec.target_module,
    spec.touch_event_dates,
    spec.target_event_start,
    spec.target_event_end,
    spec.touch_deadline,
    spec.target_deadline
  ),
  spec.target_module,
  spec.current_module <> spec.target_module,
  spec.touch_event_dates,
  spec.touch_deadline
);

alter table pg_temp.kc_semantic_post_reclassification_20260808
  alter column current_touched_fingerprint set not null,
  alter column target_touched_fingerprint set not null;

create or replace function pg_temp.kc_assert_semantic_post_triggers_20260808()
returns void
language plpgsql
set search_path = ''
as $trigger_guard$
declare
  v_trigger_name text;
  v_enabled "char";
begin
  for v_trigger_name in
    select trigger_name
    from unnest(array[
      'kc_posts_set_updated_at',
      'trg_audit_posts_status',
      'trg_posts_canonicalize_feed_fields'
    ]::text[]) trigger_name
    order by trigger_name
  loop
    select trigger_row.tgenabled
      into v_enabled
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = pg_catalog.to_regclass('public.posts')
      and trigger_row.tgname = v_trigger_name
      and trigger_row.tgisinternal is false;

    if not found or v_enabled not in ('O', 'A') then
      raise exception using
        errcode = 'KC003',
        message = format(
          'semantic post reclassification aborted: required enabled trigger %s on public.posts',
          v_trigger_name
        );
    end if;
  end loop;
end;
$trigger_guard$;

-- Lock and validate all 49 rows before performing any update. The audited
-- source branch includes a fingerprint of every field this migration can touch;
-- the target branch compares an independent fingerprint generated only from the
-- audited source. A partial
-- target or any touched-field drift is therefore a third state and fails closed.
create or replace function pg_temp.kc_assert_semantic_post_states_20260808()
returns void
language plpgsql
set search_path = ''
as $validation$
declare
  v_spec record;
  v_post record;
  v_current_fingerprint jsonb;
  v_is_current boolean;
  v_is_target boolean;
  v_existing_posts bigint;
  v_found_posts integer := 0;
begin
  perform pg_temp.kc_assert_semantic_post_triggers_20260808();

  if (select count(*) from pg_temp.kc_semantic_post_reclassification_20260808) <> 49
     or exists (
       select 1
       from pg_temp.kc_semantic_post_reclassification_20260808
       where current_touched_fingerprint is null
          or target_touched_fingerprint is null
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'semantic post reclassification internal error: expected exactly 49 complete specifications';
  end if;

  select count(*) into v_existing_posts from public.posts;
  if v_existing_posts = 0 then
    return;
  end if;

  for v_spec in
    select *
    from pg_temp.kc_semantic_post_reclassification_20260808
    order by id
  loop
    select p.module, p.category, p.status, p.metadata
      into v_post
    from public.posts p
    where p.id = v_spec.id
    for update;

    if not found then
      raise exception using
        errcode = 'KC002',
        message = format(
          'semantic post reclassification aborted: expected all 49 audited posts; missing %s',
          v_spec.id
        );
    end if;

    v_found_posts := v_found_posts + 1;

    v_current_fingerprint := pg_temp.kc_semantic_touched_fingerprint_20260808(
      v_post.metadata,
      v_spec.target_module,
      v_spec.current_module <> v_spec.target_module,
      v_spec.touch_event_dates,
      v_spec.touch_deadline
    );

    v_is_current :=
      v_post.module = v_spec.current_module
      and v_post.category = v_spec.current_category
      and v_post.status = v_spec.current_status
      and v_current_fingerprint is not distinct from v_spec.current_touched_fingerprint;

    v_is_target :=
      v_post.module = v_spec.target_module
      and v_post.category = v_spec.target_category
      and v_post.status = v_spec.target_status
      and v_current_fingerprint is not distinct from v_spec.target_touched_fingerprint;

    if v_is_current is not true and v_is_target is not true then
      raise exception using
        errcode = 'KC001',
        message = format(
          'semantic post reclassification aborted: unexpected state for %s; got %s/%s/%s, expected audited %s/%s/%s or complete target %s/%s/%s',
          v_spec.id,
          coalesce(v_post.module, '<null>'),
          coalesce(v_post.category, '<null>'),
          coalesce(v_post.status, '<null>'),
          v_spec.current_module,
          v_spec.current_category,
          v_spec.current_status,
          v_spec.target_module,
          v_spec.target_category,
          v_spec.target_status
        );
    end if;
  end loop;

  if v_found_posts <> 49 then
    raise exception using
      errcode = 'KC002',
      message = format(
        'semantic post reclassification aborted: expected 49 audited posts, found %s',
        v_found_posts
      );
  end if;

  return;
end;
$validation$;

select pg_temp.kc_assert_semantic_post_states_20260808();

update public.posts p
set
  module = spec.target_module,
  category = spec.target_category,
  status = spec.target_status,
  metadata = pg_temp.kc_semantic_post_metadata_20260808(
    p.metadata,
    spec.current_category,
    spec.target_module,
    spec.target_category,
    spec.target_category_label,
    spec.current_module <> spec.target_module,
    spec.touch_event_dates,
    spec.target_event_start,
    spec.target_event_end,
    spec.touch_deadline,
    spec.target_deadline
  )
from pg_temp.kc_semantic_post_reclassification_20260808 spec
where p.id = spec.id
  and (
    p.module is distinct from spec.target_module
    or p.category is distinct from spec.target_category
    or p.status is distinct from spec.target_status
    or pg_temp.kc_semantic_touched_fingerprint_20260808(
      p.metadata,
      spec.target_module,
      spec.current_module <> spec.target_module,
      spec.touch_event_dates,
      spec.touch_deadline
    ) is distinct from spec.target_touched_fingerprint
  );

do $postcondition$
declare
  v_spec record;
  v_post record;
  v_current_fingerprint jsonb;
  v_existing_posts bigint;
  v_found_posts integer := 0;
begin
  perform pg_temp.kc_assert_semantic_post_triggers_20260808();

  select count(*) into v_existing_posts from public.posts;
  if v_existing_posts = 0 then
    return;
  end if;

  for v_spec in
    select *
    from pg_temp.kc_semantic_post_reclassification_20260808
    order by id
  loop
    select p.module, p.category, p.status, p.metadata
      into v_post
    from public.posts p
    where p.id = v_spec.id;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = format(
          'semantic post reclassification postcondition missing audited post %s',
          v_spec.id
        );
    end if;

    v_found_posts := v_found_posts + 1;

    v_current_fingerprint := pg_temp.kc_semantic_touched_fingerprint_20260808(
      v_post.metadata,
      v_spec.target_module,
      v_spec.current_module <> v_spec.target_module,
      v_spec.touch_event_dates,
      v_spec.touch_deadline
    );

    if v_post.module is distinct from v_spec.target_module
       or v_post.category is distinct from v_spec.target_category
       or v_post.status is distinct from v_spec.target_status
       or v_current_fingerprint is distinct from v_spec.target_touched_fingerprint then
      raise exception using
        errcode = 'P0001',
        message = format(
          'semantic post reclassification postcondition failed for %s',
          v_spec.id
        );
    end if;
  end loop;

  if v_found_posts <> 49 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'semantic post reclassification postcondition expected 49 audited posts, found %s',
        v_found_posts
      );
  end if;
end;
$postcondition$;

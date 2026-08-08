-- Explicit replay-safe semantic repair for 49 production posts audited on 2026-08-08.
--
-- This migration intentionally contains no classifier or fuzzy rule. Every row
-- has one full UUID, one audited source state and one reviewed target state.
-- An existing row is accepted only when it is still in the audited source
-- state or is already in the complete target state produced below. Any third
-- state aborts before the first write. Missing production UUIDs are skipped so
-- schema replay remains safe in previews, tests and freshly reset databases.

drop table if exists pg_temp.kc_semantic_post_reclassification_20260808;

create temporary table kc_semantic_post_reclassification_20260808 (
  id uuid primary key,
  current_module text not null,
  current_category text not null,
  current_status text not null,
  target_module text not null,
  target_category text not null,
  target_status text not null,
  touch_event_dates boolean not null default false,
  target_event_start date,
  target_event_end date,
  touch_deadline boolean not null default false,
  target_deadline date,
  current_touched_fingerprint jsonb,
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

create or replace function pg_temp.kc_semantic_post_metadata_20260808(
  p_metadata jsonb,
  p_target_module text,
  p_target_category text,
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
begin
  v_meta := jsonb_set(v_meta, '{category}', to_jsonb(p_target_category), true);
  v_meta := jsonb_set(v_meta, '{categoryKey}', to_jsonb(p_target_category), true);
  v_meta := jsonb_set(v_meta, '{module}', to_jsonb(p_target_module), true);

  if v_meta ? 'categoriaKey' then
    v_meta := jsonb_set(v_meta, '{categoriaKey}', to_jsonb(p_target_category), false);
  end if;
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
      - 'gratuito'
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
      - 'opportunityType' - 'opportunityTypeKey' - 'opportunity_type';
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
  v_root_keys text[] := array['category', 'categoryKey', 'module', 'categoriaKey', 'moduleKey'];
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
      'hora_evento', 'horaEvento', 'hora', 'gratuito',
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
      'opportunityType', 'opportunityTypeKey', 'opportunity_type'
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

insert into pg_temp.kc_semantic_post_reclassification_20260808 (
  id,
  current_module,
  current_category,
  current_status,
  target_module,
  target_category,
  target_status,
  touch_event_dates,
  target_event_start,
  target_event_end,
  touch_deadline,
  target_deadline
)
values
  -- Eventos reclassificados como congressos.
  ('fbfaeb0f-a7f5-4ba0-a410-ca1f9b1dccbb'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'congressos', 'published', false, null, null, false, null),
  ('19f52e45-7942-474a-9076-015be4e2af48'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'congressos', 'published', true, date '2026-08-27', date '2026-08-29', false, null),
  ('6b92fc98-312b-423a-b309-b90d2e7592d2'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'congressos', 'published', false, null, null, false, null),
  ('2b150e53-dc80-459a-93e5-1ae2bc918adc'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'congressos', 'published', false, null, null, false, null),
  ('150cadb3-1821-4b39-893b-93deac7b06b6'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'congressos', 'published', false, null, null, false, null),
  ('752300fd-d5d1-4873-8ca4-62a19d0f04c2'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'congressos', 'published', true, date '2026-08-24', date '2026-08-24', true, date '2026-08-25'),
  ('a8a3f0e5-c461-4a2b-bf94-2a1c5e2d7e39'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'congressos', 'published', false, null, null, false, null),
  ('3b3f1ae3-f0ee-41f3-9a33-3e6193464016'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'congressos', 'published', false, null, null, false, null),
  ('6ce3f580-960f-4138-837f-bac6df0a9498'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'congressos', 'published', false, null, null, false, null),
  ('b0c85d6b-1289-48b1-9248-ea6c8081fbf2'::uuid, 'eventos', 'culturais', 'published', 'eventos', 'congressos', 'published', false, null, null, false, null),
  ('ac5714e1-eb5e-4d30-984e-0244ee1b05e0'::uuid, 'eventos', 'culturais', 'published', 'eventos', 'congressos', 'published', true, date '2026-09-16', date '2026-09-19', true, date '2026-09-03'),
  ('bcbee373-c92b-4cc2-a290-9f0ab81518e2'::uuid, 'eventos', 'culturais', 'published', 'eventos', 'congressos', 'published', false, null, null, false, null),
  ('944a8198-4823-4661-afcb-1a6faef1259c'::uuid, 'eventos', 'culturais', 'published', 'eventos', 'congressos', 'published', true, date '2026-10-07', date '2026-10-09', true, null),
  ('176fc9f3-052d-44f1-a251-afd895bfc1a7'::uuid, 'eventos', 'workshops', 'published', 'eventos', 'congressos', 'published', true, date '2026-11-25', date '2026-11-27', true, null),
  ('d8715365-d49c-4bb7-b331-5faa4f1cc458'::uuid, 'eventos', 'workshops', 'published', 'eventos', 'congressos', 'published', true, date '2026-10-21', date '2026-10-23', true, date '2026-09-30'),
  ('e02fc2b9-12b4-458d-a8dc-95b9c0510b49'::uuid, 'eventos', 'workshops', 'published', 'eventos', 'congressos', 'published', false, null, null, false, null),

  -- Eventos reclassificados em outros subtópicos canônicos.
  ('ebeaf871-371c-4f9b-8169-824e2da86ba3'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'cursos', 'published', false, null, null, false, null),
  ('899359eb-b411-4b1f-95c4-234e88c49041'::uuid, 'eventos', 'culturais', 'published', 'eventos', 'cursos', 'published', true, date '2026-08-08', date '2026-11-28', true, date '2026-08-04'),
  ('0f601a58-f4a0-46a7-9810-a28b5564e67c'::uuid, 'eventos', 'culturais', 'published', 'eventos', 'cursos', 'published', false, null, null, false, null),
  ('7038c22d-fe66-49f6-a2a2-ec086f4f9a20'::uuid, 'eventos', 'workshops', 'published', 'eventos', 'cursos', 'published', false, null, null, false, null),
  ('ba140334-470b-4655-a9c1-994ba64e4c28'::uuid, 'eventos', 'workshops', 'published', 'eventos', 'cursos', 'published', true, date '2026-09-01', date '2026-09-24', true, date '2026-08-27'),
  ('a59449cb-ca81-4545-a147-32a6dbd2c852'::uuid, 'eventos', 'workshops', 'published', 'eventos', 'cursos', 'published', true, date '2026-08-17', date '2026-08-28', true, date '2026-08-13'),
  ('5c601845-a26e-46d5-94c0-ba67a50e3ccd'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'palestras', 'published', false, null, null, false, null),
  ('a246c601-e693-4d7b-a07b-99e0cb617616'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'culturais', 'published', false, null, null, false, null),
  ('09460066-0e96-45b9-81b4-7ff2e564c6aa'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'culturais', 'published', false, null, null, false, null),
  ('495b4856-d68a-49bc-89a4-79a16c2c3a7f'::uuid, 'eventos', 'workshops', 'published', 'eventos', 'academicos', 'published', false, null, null, false, null),
  ('cb2ce3c1-df2c-43ec-a75d-f251ea61473a'::uuid, 'eventos', 'culturais', 'published', 'eventos', 'academicos', 'published', false, null, null, false, null),

  -- Correções explícitas de módulo ou estado editorial.
  ('2764dfda-1cf3-4aa1-b255-49248415c9e2'::uuid, 'eventos', 'academicos', 'published', 'oportunidades', 'concursos', 'published', true, null, null, true, date '2026-08-31'),
  ('b9b214e9-30a2-4a83-8037-e17ca2b8c5d1'::uuid, 'eventos', 'workshops', 'published', 'oportunidades', 'pesquisa', 'published', true, null, null, true, date '2026-08-21'),
  ('14c43a7f-395c-4ee0-8d11-9ddf76667586'::uuid, 'eventos', 'workshops', 'published', 'oportunidades', 'pesquisa', 'published', true, null, null, true, date '2026-08-14'),
  ('84f595c9-e601-412b-bf10-263284bbe81d'::uuid, 'oportunidades', 'editais', 'published', 'eventos', 'congressos', 'published', true, date '2026-09-15', date '2026-09-15', true, null),
  ('e9a826be-a1e3-43eb-aece-85742c10e255'::uuid, 'oportunidades', 'estagios', 'published', 'eventos', 'palestras', 'published', true, date '2026-08-13', date '2026-08-13', true, null),
  ('f75602ca-76a2-4cea-b368-3e45cc995816'::uuid, 'oportunidades', 'editais', 'published', 'oportunidades', 'editais', 'closed', true, date '2026-08-25', date '2026-08-27', true, date '2026-06-01'),
  ('b6fff52c-93ad-4579-8a9d-86a8d9d1dea4'::uuid, 'eventos', 'workshops', 'published', 'eventos', 'workshops', 'hidden', true, null, null, true, null),
  ('31715ae7-9cd9-4fda-adb2-6541da6fec64'::uuid, 'oportunidades', 'monitoria', 'published', 'oportunidades', 'monitoria', 'hidden', false, null, null, true, null),
  ('953bb526-e5f5-4e36-a59c-7b102e344518'::uuid, 'eventos', 'academicos', 'published', 'eventos', 'academicos', 'hidden', true, null, null, true, date '2026-06-05'),

  -- Oportunidades reclassificadas em categorias canônicas.
  ('50a3e363-76ed-4bc6-b8fd-ab4b79faa857'::uuid, 'oportunidades', 'empregos', 'published', 'oportunidades', 'pesquisa', 'published', false, null, null, false, null),
  ('1917e659-5151-4650-bfa2-6ec20fd5e81b'::uuid, 'oportunidades', 'empregos', 'published', 'oportunidades', 'pesquisa', 'published', false, null, null, false, null),
  ('a8a66d60-0a03-4606-907a-15e48f9f687b'::uuid, 'oportunidades', 'empregos', 'published', 'oportunidades', 'concursos', 'published', false, null, null, false, null),
  ('3ae523bb-c15b-4d36-a494-1ca43ae95aa3'::uuid, 'oportunidades', 'empregos', 'published', 'oportunidades', 'concursos', 'published', false, null, null, false, null),
  ('ebb3c886-ac26-4022-bf9e-f3ce31d9fbbe'::uuid, 'oportunidades', 'estagios', 'published', 'oportunidades', 'monitoria', 'published', false, null, null, false, null),
  ('c848f243-077b-4dc8-bf52-86572af7f5fb'::uuid, 'oportunidades', 'monitoria', 'published', 'oportunidades', 'cursos-capacitacoes', 'published', false, null, null, false, null),
  ('577ea0ba-a7ad-4f01-8a05-fbd0a4b4fbe4'::uuid, 'oportunidades', 'monitoria', 'published', 'oportunidades', 'cursos-capacitacoes', 'published', false, null, null, false, null),
  ('fffdc11c-2855-4a8d-9cb2-c10cad863888'::uuid, 'oportunidades', 'monitoria', 'published', 'oportunidades', 'cursos-capacitacoes', 'published', false, null, null, false, null),
  ('498e0054-31f1-458b-8953-3179decdd033'::uuid, 'oportunidades', 'pesquisa', 'published', 'oportunidades', 'cursos-capacitacoes', 'published', false, null, null, false, null),
  ('ca10120d-7e9b-42f7-971a-db9861540a5b'::uuid, 'oportunidades', 'pesquisa', 'published', 'oportunidades', 'cursos-capacitacoes', 'published', false, null, null, false, null),
  ('080f8237-a8fe-4200-b53a-946b7ea934a3'::uuid, 'oportunidades', 'pesquisa', 'published', 'oportunidades', 'cursos-capacitacoes', 'published', false, null, null, false, null),
  ('858c8b0b-007b-402d-a7e8-0ad1d753d87e'::uuid, 'oportunidades', 'pesquisa', 'published', 'oportunidades', 'voluntariado', 'published', false, null, null, false, null),
  ('4bc906fb-0f5f-463e-bcbd-26c6329a995e'::uuid, 'oportunidades', 'voluntariado', 'published', 'oportunidades', 'bolsas', 'published', false, null, null, false, null);

-- Audited touched-field fingerprints captured read-only from production on
-- 2026-08-08. Only keys that this migration may overwrite or delete are
-- represented. This deliberately ignores unrelated volatile metadata.
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"academicos","categoriaKey":"academicos"}}'::jsonb where id = 'fbfaeb0f-a7f5-4ba0-a410-ca1f9b1dccbb'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"academicos","categoriaKey":"academicos","date_start":"2026-08-27","date_end":"2026-08-29","data_evento":"2026-08-29","data_fim_evento":"2026-08-29"},"dates":{"eventStartsAt":"2026-08-27","eventEndsAt":"2026-08-29"},"datesType":"object"}'::jsonb where id = '19f52e45-7942-474a-9076-015be4e2af48'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"congressos","categoriaKey":"congressos"}}'::jsonb where id = '6b92fc98-312b-423a-b309-b90d2e7592d2'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"academicos","categoriaKey":"academicos"}}'::jsonb where id = '2b150e53-dc80-459a-93e5-1ae2bc918adc'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"academicos","categoriaKey":"academicos"}}'::jsonb where id = '150cadb3-1821-4b39-893b-93deac7b06b6'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"academicos","categoriaKey":"academicos","date_start":"2026-08-24","date_end":"2026-08-25","data_evento":"2026-08-20","data":"2026-08-20","deadline_date":null},"dates":{},"datesType":"object"}'::jsonb where id = '752300fd-d5d1-4873-8ca4-62a19d0f04c2'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"academicos","categoriaKey":"academicos"}}'::jsonb where id = 'a8a3f0e5-c461-4a2b-bf94-2a1c5e2d7e39'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"academicos","categoriaKey":"academicos"}}'::jsonb where id = '3b3f1ae3-f0ee-41f3-9a33-3e6193464016'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"academicos","categoriaKey":"academicos"}}'::jsonb where id = '6ce3f580-960f-4138-837f-bac6df0a9498'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"culturais","categoriaKey":"culturais"}}'::jsonb where id = 'b0c85d6b-1289-48b1-9248-ea6c8081fbf2'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"culturais","categoriaKey":"culturais","data_evento":"2026-09-03","data_fim_evento":"2026-09-19","deadline_date":"03/09/2026"},"dates":{},"datesType":"missing"}'::jsonb where id = 'ac5714e1-eb5e-4d30-984e-0244ee1b05e0'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"culturais","categoriaKey":"culturais"}}'::jsonb where id = 'bcbee373-c92b-4cc2-a290-9f0ab81518e2'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"culturais","categoriaKey":"culturais","data_evento":"2026-10-09","data_fim_evento":"2026-10-09","deadline_date":"09/10/2026"},"dates":{},"datesType":"missing"}'::jsonb where id = '944a8198-4823-4661-afcb-1a6faef1259c'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"workshops","categoriaKey":"workshops","data_evento":"2026-11-27","data_fim_evento":"2026-11-27","deadline_date":"27/11/2026"},"dates":{},"datesType":"missing"}'::jsonb where id = '176fc9f3-052d-44f1-a251-afd895bfc1a7'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"workshops","categoriaKey":"workshops","data_evento":"2026-09-30","data_fim_evento":"2026-10-23","deadline_date":"30/09/2026"},"dates":{"eventStartsAt":"2026-10-21","eventEndsAt":"2026-10-23","applicationDeadline":"2026-09-30"},"datesType":"object"}'::jsonb where id = 'd8715365-d49c-4bb7-b331-5faa4f1cc458'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"workshops","categoriaKey":"workshops"}}'::jsonb where id = 'e02fc2b9-12b4-458d-a8dc-95b9c0510b49'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"academicos","categoriaKey":"academicos"}}'::jsonb where id = 'ebeaf871-371c-4f9b-8169-824e2da86ba3'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"estagios","categoriaKey":"estagios","date_start":"2026-08-08","date_end":"2026-11-28","deadline_date":null},"dates":{"eventStartsAt":"2026-08-08","eventEndsAt":"2026-11-28","applicationDeadline":"2026-08-04"},"datesType":"object"}'::jsonb where id = '899359eb-b411-4b1f-95c4-234e88c49041'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"culturais","categoriaKey":"culturais"}}'::jsonb where id = '0f601a58-f4a0-46a7-9810-a28b5564e67c'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"workshops","categoriaKey":"workshops"}}'::jsonb where id = '7038c22d-fe66-49f6-a2a2-ec086f4f9a20'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"workshops","categoriaKey":"workshops","data_evento":"2026-08-27","data_fim_evento":"2026-09-24","deadline_date":"27/08/2026"},"dates":{},"datesType":"missing"}'::jsonb where id = 'ba140334-470b-4655-a9c1-994ba64e4c28'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"workshops","categoriaKey":"workshops","date_start":"2026-08-17","date_end":"2026-08-28","data_evento":"2026-08-28","data_fim_evento":"2026-08-28","deadline_date":null},"dates":{"eventStartsAt":"2026-08-17","eventEndsAt":"2026-08-28","applicationDeadline":"2026-08-13"},"datesType":"object"}'::jsonb where id = 'a59449cb-ca81-4545-a147-32a6dbd2c852'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"academicos","categoriaKey":"academicos"}}'::jsonb where id = '5c601845-a26e-46d5-94c0-ba67a50e3ccd'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"academicos","categoriaKey":"academicos"}}'::jsonb where id = 'a246c601-e693-4d7b-a07b-99e0cb617616'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"academicos","categoriaKey":"academicos"}}'::jsonb where id = '09460066-0e96-45b9-81b4-7ff2e564c6aa'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"workshops","categoriaKey":"workshops"}}'::jsonb where id = '495b4856-d68a-49bc-89a4-79a16c2c3a7f'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"culturais","categoriaKey":"culturais"}}'::jsonb where id = 'cb2ce3c1-df2c-43ec-a75d-f251ea61473a'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"academicos","categoriaKey":"academicos","data_evento":"2026-08-31","data_fim_evento":"","hora_evento":"","gratuito":true,"deadline_date":"31/08/2026"},"dates":{},"datesType":"missing"}'::jsonb where id = '2764dfda-1cf3-4aa1-b255-49248415c9e2'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"workshops","categoriaKey":"workshops","data_evento":"2026-08-21","data_fim_evento":"","hora_evento":"","gratuito":true,"deadline_date":"21/08/2026"},"dates":{},"datesType":"missing"}'::jsonb where id = 'b9b214e9-30a2-4a83-8037-e17ca2b8c5d1'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"workshops","categoriaKey":"workshops","data_evento":"2026-08-14","data_fim_evento":"2026-08-14","hora_evento":"","gratuito":true,"deadline_date":"14/08/2026"},"dates":{"eventStartsAt":"2026-08-14"},"datesType":"object"}'::jsonb where id = '14c43a7f-395c-4ee0-8d11-9ddf76667586'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"editais","categoriaKey":"editais","areaKey":"saude","areaLabel":"Saude","area":"Saude","workMode":"presencial","workModeLabel":"Presencial","modalidadeTrabalho":"Presencial","employmentType":"","employmentTypeLabel":"","regimeContratacao":"","remuneracao":"","opportunityType":"","deadline_date":"2026-09-15"},"dates":{},"datesType":"missing"}'::jsonb where id = '84f595c9-e601-412b-bf10-263284bbe81d'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"estagios","categoriaKey":"estagios","areaKey":"direito","areaLabel":"Direito","area":"Direito","workMode":"presencial","workModeLabel":"Presencial","modalidadeTrabalho":"Presencial","employmentType":"","employmentTypeLabel":"","regimeContratacao":"","remuneracao":"","opportunityType":"","deadline_date":"2026-08-13"},"dates":{},"datesType":"missing"}'::jsonb where id = 'e9a826be-a1e3-43eb-aece-85742c10e255'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"editais","categoriaKey":"editais","data_evento":"2026-08-27","data_fim_evento":"","deadline_date":"27/08/2026"},"dates":{},"datesType":"object"}'::jsonb where id = 'f75602ca-76a2-4cea-b368-3e45cc995816'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"workshops","categoriaKey":"workshops","data_evento":"2027-07-04","data_fim_evento":"","deadline_date":"04/07/2027"},"dates":{},"datesType":"missing"}'::jsonb where id = 'b6fff52c-93ad-4579-8a9d-86a8d9d1dea4'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"monitoria","categoriaKey":"monitoria","deadline_date":"2026-10-25"},"dates":{},"datesType":"missing"}'::jsonb where id = '31715ae7-9cd9-4fda-adb2-6541da6fec64'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"academicos","categoriaKey":"academicos","data_evento":"2026-08-15","data":"2026-08-15"},"dates":{"eventStartsAt":"2026-11-30","eventEndsAt":null,"applicationDeadline":"2026-06-05"},"datesType":"object"}'::jsonb where id = '953bb526-e5f5-4e36-a59c-7b102e344518'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"empregos","categoriaKey":"empregos"}}'::jsonb where id = '50a3e363-76ed-4bc6-b8fd-ab4b79faa857'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"empregos","categoriaKey":"empregos"}}'::jsonb where id = '1917e659-5151-4650-bfa2-6ec20fd5e81b'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"empregos","categoriaKey":"empregos"}}'::jsonb where id = 'a8a66d60-0a03-4606-907a-15e48f9f687b'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"empregos","categoriaKey":"empregos"}}'::jsonb where id = '3ae523bb-c15b-4d36-a494-1ca43ae95aa3'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"estagios","categoriaKey":"estagios"}}'::jsonb where id = 'ebb3c886-ac26-4022-bf9e-f3ce31d9fbbe'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"monitoria","categoriaKey":"monitoria"}}'::jsonb where id = 'c848f243-077b-4dc8-bf52-86572af7f5fb'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"monitoria","categoriaKey":"monitoria"}}'::jsonb where id = '577ea0ba-a7ad-4f01-8a05-fbd0a4b4fbe4'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"monitoria","categoriaKey":"monitoria"}}'::jsonb where id = 'fffdc11c-2855-4a8d-9cb2-c10cad863888'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"pesquisa","categoriaKey":"pesquisa"}}'::jsonb where id = '498e0054-31f1-458b-8953-3179decdd033'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"pesquisa","categoriaKey":"pesquisa"}}'::jsonb where id = 'ca10120d-7e9b-42f7-971a-db9861540a5b'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"pesquisa","categoriaKey":"pesquisa"}}'::jsonb where id = '080f8237-a8fe-4200-b53a-946b7ea934a3'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"pesquisa","categoriaKey":"pesquisa"}}'::jsonb where id = '858c8b0b-007b-402d-a7e8-0ad1d753d87e'::uuid;
update pg_temp.kc_semantic_post_reclassification_20260808 set current_touched_fingerprint = '{"root":{"categoryKey":"voluntariado","categoriaKey":"voluntariado"}}'::jsonb where id = '4bc906fb-0f5f-463e-bcbd-26c6329a995e'::uuid;

-- Lock and validate all 49 rows before performing any update. The audited
-- source branch includes a fingerprint of every field this migration can touch;
-- the target branch compares the complete fixed-point transformation. A partial
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
  v_expected_metadata jsonb;
  v_is_current boolean;
  v_is_target boolean;
begin
  if (select count(*) from pg_temp.kc_semantic_post_reclassification_20260808) <> 49
     or exists (
       select 1
       from pg_temp.kc_semantic_post_reclassification_20260808
       where current_touched_fingerprint is null
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'semantic post reclassification internal error: expected exactly 49 complete specifications';
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
      continue;
    end if;

    v_expected_metadata := pg_temp.kc_semantic_post_metadata_20260808(
      v_post.metadata,
      v_spec.target_module,
      v_spec.target_category,
      v_spec.current_module <> v_spec.target_module,
      v_spec.touch_event_dates,
      v_spec.target_event_start,
      v_spec.target_event_end,
      v_spec.touch_deadline,
      v_spec.target_deadline
    );

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
      and v_post.metadata is not distinct from v_expected_metadata;

    if not v_is_current and not v_is_target then
      raise exception using
        errcode = 'P0001',
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
    spec.target_module,
    spec.target_category,
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
    or p.metadata is distinct from pg_temp.kc_semantic_post_metadata_20260808(
      p.metadata,
      spec.target_module,
      spec.target_category,
      spec.current_module <> spec.target_module,
      spec.touch_event_dates,
      spec.target_event_start,
      spec.target_event_end,
      spec.touch_deadline,
      spec.target_deadline
    )
  );

do $postcondition$
declare
  v_spec record;
  v_post record;
  v_expected_metadata jsonb;
begin
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
      continue;
    end if;

    v_expected_metadata := pg_temp.kc_semantic_post_metadata_20260808(
      v_post.metadata,
      v_spec.target_module,
      v_spec.target_category,
      v_spec.current_module <> v_spec.target_module,
      v_spec.touch_event_dates,
      v_spec.target_event_start,
      v_spec.target_event_end,
      v_spec.touch_deadline,
      v_spec.target_deadline
    );

    if v_post.module is distinct from v_spec.target_module
       or v_post.category is distinct from v_spec.target_category
       or v_post.status is distinct from v_spec.target_status
       or v_post.metadata is distinct from v_expected_metadata then
      raise exception using
        errcode = 'P0001',
        message = format(
          'semantic post reclassification postcondition failed for %s',
          v_spec.id
        );
    end if;
  end loop;
end;
$postcondition$;

\set ON_ERROR_STOP on

-- Transactional production-only preflight and proof. Run from psql after the
-- schema migrations are present and while the 49 audited rows are still either
-- in their captured source state or in the complete target state. Nothing is
-- persisted: both migration runs and every assertion are rolled back.
begin;

create temporary table kc_semantic_post_reclassification_expected_20260808 (
  id uuid primary key,
  module text not null,
  category text not null,
  status text not null
) on commit drop;

insert into pg_temp.kc_semantic_post_reclassification_expected_20260808 (id, module, category, status)
values
  ('fbfaeb0f-a7f5-4ba0-a410-ca1f9b1dccbb'::uuid, 'eventos', 'congressos', 'published'),
  ('19f52e45-7942-474a-9076-015be4e2af48'::uuid, 'eventos', 'congressos', 'published'),
  ('6b92fc98-312b-423a-b309-b90d2e7592d2'::uuid, 'eventos', 'congressos', 'published'),
  ('2b150e53-dc80-459a-93e5-1ae2bc918adc'::uuid, 'eventos', 'congressos', 'published'),
  ('150cadb3-1821-4b39-893b-93deac7b06b6'::uuid, 'eventos', 'congressos', 'published'),
  ('752300fd-d5d1-4873-8ca4-62a19d0f04c2'::uuid, 'eventos', 'congressos', 'published'),
  ('a8a3f0e5-c461-4a2b-bf94-2a1c5e2d7e39'::uuid, 'eventos', 'congressos', 'published'),
  ('3b3f1ae3-f0ee-41f3-9a33-3e6193464016'::uuid, 'eventos', 'congressos', 'published'),
  ('6ce3f580-960f-4138-837f-bac6df0a9498'::uuid, 'eventos', 'congressos', 'published'),
  ('b0c85d6b-1289-48b1-9248-ea6c8081fbf2'::uuid, 'eventos', 'congressos', 'published'),
  ('ac5714e1-eb5e-4d30-984e-0244ee1b05e0'::uuid, 'eventos', 'congressos', 'published'),
  ('bcbee373-c92b-4cc2-a290-9f0ab81518e2'::uuid, 'eventos', 'congressos', 'published'),
  ('944a8198-4823-4661-afcb-1a6faef1259c'::uuid, 'eventos', 'congressos', 'published'),
  ('176fc9f3-052d-44f1-a251-afd895bfc1a7'::uuid, 'eventos', 'congressos', 'published'),
  ('d8715365-d49c-4bb7-b331-5faa4f1cc458'::uuid, 'eventos', 'congressos', 'published'),
  ('e02fc2b9-12b4-458d-a8dc-95b9c0510b49'::uuid, 'eventos', 'congressos', 'published'),
  ('ebeaf871-371c-4f9b-8169-824e2da86ba3'::uuid, 'eventos', 'cursos', 'published'),
  ('899359eb-b411-4b1f-95c4-234e88c49041'::uuid, 'eventos', 'cursos', 'published'),
  ('0f601a58-f4a0-46a7-9810-a28b5564e67c'::uuid, 'eventos', 'cursos', 'published'),
  ('7038c22d-fe66-49f6-a2a2-ec086f4f9a20'::uuid, 'eventos', 'cursos', 'published'),
  ('ba140334-470b-4655-a9c1-994ba64e4c28'::uuid, 'eventos', 'cursos', 'published'),
  ('a59449cb-ca81-4545-a147-32a6dbd2c852'::uuid, 'eventos', 'cursos', 'published'),
  ('5c601845-a26e-46d5-94c0-ba67a50e3ccd'::uuid, 'eventos', 'palestras', 'published'),
  ('a246c601-e693-4d7b-a07b-99e0cb617616'::uuid, 'eventos', 'culturais', 'published'),
  ('09460066-0e96-45b9-81b4-7ff2e564c6aa'::uuid, 'eventos', 'culturais', 'published'),
  ('495b4856-d68a-49bc-89a4-79a16c2c3a7f'::uuid, 'eventos', 'academicos', 'published'),
  ('cb2ce3c1-df2c-43ec-a75d-f251ea61473a'::uuid, 'eventos', 'academicos', 'published'),
  ('2764dfda-1cf3-4aa1-b255-49248415c9e2'::uuid, 'oportunidades', 'concursos', 'published'),
  ('b9b214e9-30a2-4a83-8037-e17ca2b8c5d1'::uuid, 'oportunidades', 'pesquisa', 'published'),
  ('14c43a7f-395c-4ee0-8d11-9ddf76667586'::uuid, 'oportunidades', 'pesquisa', 'published'),
  ('84f595c9-e601-412b-bf10-263284bbe81d'::uuid, 'eventos', 'congressos', 'published'),
  ('e9a826be-a1e3-43eb-aece-85742c10e255'::uuid, 'eventos', 'palestras', 'published'),
  ('f75602ca-76a2-4cea-b368-3e45cc995816'::uuid, 'oportunidades', 'editais', 'closed'),
  ('b6fff52c-93ad-4579-8a9d-86a8d9d1dea4'::uuid, 'eventos', 'workshops', 'hidden'),
  ('31715ae7-9cd9-4fda-adb2-6541da6fec64'::uuid, 'oportunidades', 'monitoria', 'hidden'),
  ('953bb526-e5f5-4e36-a59c-7b102e344518'::uuid, 'eventos', 'academicos', 'hidden'),
  ('50a3e363-76ed-4bc6-b8fd-ab4b79faa857'::uuid, 'oportunidades', 'pesquisa', 'published'),
  ('1917e659-5151-4650-bfa2-6ec20fd5e81b'::uuid, 'oportunidades', 'pesquisa', 'published'),
  ('a8a66d60-0a03-4606-907a-15e48f9f687b'::uuid, 'oportunidades', 'concursos', 'published'),
  ('3ae523bb-c15b-4d36-a494-1ca43ae95aa3'::uuid, 'oportunidades', 'concursos', 'published'),
  ('ebb3c886-ac26-4022-bf9e-f3ce31d9fbbe'::uuid, 'oportunidades', 'monitoria', 'published'),
  ('c848f243-077b-4dc8-bf52-86572af7f5fb'::uuid, 'oportunidades', 'cursos-capacitacoes', 'published'),
  ('577ea0ba-a7ad-4f01-8a05-fbd0a4b4fbe4'::uuid, 'oportunidades', 'cursos-capacitacoes', 'published'),
  ('fffdc11c-2855-4a8d-9cb2-c10cad863888'::uuid, 'oportunidades', 'cursos-capacitacoes', 'published'),
  ('498e0054-31f1-458b-8953-3179decdd033'::uuid, 'oportunidades', 'cursos-capacitacoes', 'published'),
  ('ca10120d-7e9b-42f7-971a-db9861540a5b'::uuid, 'oportunidades', 'cursos-capacitacoes', 'published'),
  ('080f8237-a8fe-4200-b53a-946b7ea934a3'::uuid, 'oportunidades', 'cursos-capacitacoes', 'published'),
  ('858c8b0b-007b-402d-a7e8-0ad1d753d87e'::uuid, 'oportunidades', 'voluntariado', 'published'),
  ('4bc906fb-0f5f-463e-bcbd-26c6329a995e'::uuid, 'oportunidades', 'bolsas', 'published');

do $production_preflight$
declare
  v_found integer;
begin
  select count(*)
    into v_found
  from pg_temp.kc_semantic_post_reclassification_expected_20260808 expected
  join public.posts p on p.id = expected.id;

  if v_found <> 49 then
    raise exception 'semantic production preflight failed: expected 49 audited UUIDs, found %', v_found;
  end if;
end;
$production_preflight$;

\ir ../../supabase/migrations/20260808140000_semantic_post_reclassification.sql
\ir ../../supabase/migrations/20260808140000_semantic_post_reclassification.sql

do $proof$
declare
  v_matched integer;
begin
  if (select count(*) from pg_temp.kc_semantic_post_reclassification_expected_20260808) <> 49 then
    raise exception 'semantic proof fixture must contain exactly 49 targets';
  end if;

  select count(*)
    into v_matched
  from pg_temp.kc_semantic_post_reclassification_expected_20260808 expected
  join public.posts p
    on p.id = expected.id
   and p.module = expected.module
   and p.category = expected.category
   and p.status = expected.status
  where p.metadata->>'category' = expected.category
    and p.metadata->>'categoryKey' = expected.category
    and p.metadata->>'module' = expected.module;

  if v_matched <> 49 then
    raise exception 'semantic proof failed: expected 49 complete target identities, got %', v_matched;
  end if;

  if not exists (
    select 1 from public.posts p
    where p.id = '19f52e45-7942-474a-9076-015be4e2af48'::uuid
      and p.metadata->>'data_evento' = '2026-08-27'
      and p.metadata->>'data_fim_evento' = '2026-08-29'
      and p.metadata#>>'{dates,eventStartsAt}' = '2026-08-27'
      and p.metadata#>>'{dates,eventEndsAt}' = '2026-08-29'
  ) then
    raise exception 'semantic proof failed: congress interval aliases are inconsistent';
  end if;

  if exists (
    select 1
    from public.posts p
    where p.id = any(array[
      '2764dfda-1cf3-4aa1-b255-49248415c9e2'::uuid,
      'b9b214e9-30a2-4a83-8037-e17ca2b8c5d1'::uuid,
      '14c43a7f-395c-4ee0-8d11-9ddf76667586'::uuid
    ])
      and (
        p.metadata ?| array[
          'date_start', 'date_end', 'data_evento', 'dataEvento',
          'data_inicio_evento', 'dataInicioEvento', 'data',
          'data_fim_evento', 'dataFimEvento', 'data_fim', 'dataFim',
          'eventStartsAt', 'eventEndsAt', 'event_starts_at', 'event_ends_at',
          'eventStart', 'eventEnd', 'eventTime', 'event_time',
          'event_start', 'event_end', 'event_date', 'eventDate',
          'hora_evento', 'horaEvento', 'hora', 'gratuito',
          'eventType', 'event_type', 'eventMode', 'event_mode',
          'eventLocation', 'event_location'
        ]
        or coalesce(p.metadata->'dates', '{}'::jsonb) ?| array[
          'eventStartsAt', 'eventEndsAt', 'event_starts_at', 'event_ends_at',
          'eventStart', 'eventEnd'
        ]
      )
  ) then
    raise exception 'semantic proof failed: event-to-opportunity cleanup is incomplete';
  end if;

  if exists (
    select 1
    from public.posts p
    where p.id = any(array[
      '84f595c9-e601-412b-bf10-263284bbe81d'::uuid,
      'e9a826be-a1e3-43eb-aece-85742c10e255'::uuid
    ])
      and p.metadata ?| array[
        'areaKey', 'areaLabel', 'area', 'areaAtuacao', 'area_atuacao',
        'workMode', 'workModeLabel', 'work_mode', 'modalidadeTrabalho', 'modalidade',
        'employmentType', 'employmentTypeLabel', 'employment_type', 'regimeContratacao',
        'remuneracao', 'salary', 'salario', 'benefits', 'beneficios',
        'opportunityType', 'opportunityTypeKey', 'opportunity_type'
      ]
  ) then
    raise exception 'semantic proof failed: opportunity-to-event cleanup is incomplete';
  end if;

  if not exists (
    select 1 from public.posts p
    where p.id = '2764dfda-1cf3-4aa1-b255-49248415c9e2'::uuid
      and p.metadata->>'deadline_date' = '2026-08-31'
      and p.metadata#>>'{dates,applicationDeadline}' = '2026-08-31'
  ) then
    raise exception 'semantic proof failed: opportunity deadline aliases are inconsistent';
  end if;

  if not exists (
    select 1 from public.posts p
    where p.id = '84f595c9-e601-412b-bf10-263284bbe81d'::uuid
      and p.metadata->>'data_evento' = '2026-09-15'
      and p.metadata->>'data_fim_evento' = '2026-09-15'
      and not (p.metadata ?| array[
        'deadline_date', 'deadlineDate', 'deadline_at', 'deadlineAt',
        'application_deadline', 'applicationDeadline',
        'inscricoes_ate', 'inscricoesAte', 'prazo_inscricao', 'prazoInscricao',
        'submission_deadline', 'submissionDeadline'
      ])
      and not (coalesce(p.metadata->'dates', '{}'::jsonb) ?| array[
        'applicationDeadline', 'application_deadline'
      ])
  ) then
    raise exception 'semantic proof failed: opportunity-to-event dates are inconsistent';
  end if;

  if not exists (
    select 1 from public.posts p
    where p.id = 'f75602ca-76a2-4cea-b368-3e45cc995816'::uuid
      and p.status = 'closed'
      and p.metadata->>'data_evento' = '2026-08-25'
      and p.metadata->>'data_fim_evento' = '2026-08-27'
      and p.metadata->>'deadline_date' = '2026-06-01'
  ) then
    raise exception 'semantic proof failed: closed SEREX dates are inconsistent';
  end if;

  if not exists (
    select 1 from public.posts p
    where p.id = 'b6fff52c-93ad-4579-8a9d-86a8d9d1dea4'::uuid
      and p.status = 'hidden'
      and not (p.metadata ?| array[
        'date_start', 'date_end', 'data_evento', 'data_fim_evento',
        'deadline_date', 'deadlineDate'
      ])
      and not (coalesce(p.metadata->'dates', '{}'::jsonb) ?| array[
        'eventStartsAt', 'eventEndsAt', 'applicationDeadline'
      ])
  ) then
    raise exception 'semantic proof failed: fabricated electoral dates remain';
  end if;
end;
$proof$;

-- Recreate one audited source triple while drifting a touched metadata field.
-- The nested exception block rolls the mutation back and proves the source
-- fingerprint guard, rather than only the module/category/status guard, aborts.
do $drift_proof$
begin
  begin
    update public.posts
    set
      module = 'eventos',
      category = 'academicos',
      status = 'published',
      metadata = jsonb_set(
        jsonb_set(
          metadata - 'category' - 'module' - 'moduleKey',
          '{categoryKey}',
          '"drifted"'::jsonb,
          true
        ),
        '{categoriaKey}',
        '"academicos"'::jsonb,
        true
      )
    where id = 'fbfaeb0f-a7f5-4ba0-a410-ca1f9b1dccbb'::uuid;

    perform pg_temp.kc_assert_semantic_post_states_20260808();

    raise exception using
      errcode = 'P0002',
      message = 'semantic drift proof failed: touched-field drift was accepted';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like 'semantic post reclassification aborted: unexpected state%' then
        raise;
      end if;
  end;

  -- The failed assertion rolled the drift fixture back to the complete target.
  perform pg_temp.kc_assert_semantic_post_states_20260808();
end;
$drift_proof$;

rollback;

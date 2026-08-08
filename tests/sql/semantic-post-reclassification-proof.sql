\set ON_ERROR_STOP on

-- Transactional production-only preflight and proof. Run from psql after the
-- schema migrations are present and while the 49 audited rows are still either
-- in their captured source state or in the complete target state. Nothing is
-- persisted: both migration runs and every assertion are rolled back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $production_session_guard$
begin
  if current_setting('session_replication_role') <> 'origin' then
    raise exception 'semantic production proof requires session_replication_role=origin';
  end if;
  if (
    select count(*)
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = pg_catalog.to_regclass('public.posts')
      and trigger_row.tgname = any(array[
        'kc_posts_set_updated_at',
        'trg_audit_posts_status',
        'trg_posts_canonicalize_feed_fields'
      ]::text[])
      and trigger_row.tgenabled = 'O'
      and trigger_row.tgisinternal is false
  ) <> 3 then
    raise exception 'semantic production proof requires the exact three enabled origin posts triggers';
  end if;
end;
$production_session_guard$;

-- The rollout procedure freezes writers; this lock makes that invariant
-- enforceable for the complete snapshot/migration/rollback proof window.
lock table public.posts in share row exclusive mode;

create temporary table kc_semantic_post_reclassification_expected_20260808 (
  id uuid primary key,
  module text not null,
  category text not null,
  category_label text not null,
  status text not null
) on commit drop;

insert into pg_temp.kc_semantic_post_reclassification_expected_20260808 (
  id, module, category, category_label, status
)
values
  ('fbfaeb0f-a7f5-4ba0-a410-ca1f9b1dccbb'::uuid, 'eventos', 'congressos', 'Congressos', 'published'),
  ('19f52e45-7942-474a-9076-015be4e2af48'::uuid, 'eventos', 'congressos', 'Congressos', 'published'),
  ('6b92fc98-312b-423a-b309-b90d2e7592d2'::uuid, 'eventos', 'congressos', 'Congressos', 'published'),
  ('2b150e53-dc80-459a-93e5-1ae2bc918adc'::uuid, 'eventos', 'congressos', 'Congressos', 'published'),
  ('150cadb3-1821-4b39-893b-93deac7b06b6'::uuid, 'eventos', 'congressos', 'Congressos', 'published'),
  ('752300fd-d5d1-4873-8ca4-62a19d0f04c2'::uuid, 'eventos', 'congressos', 'Congressos', 'published'),
  ('a8a3f0e5-c461-4a2b-bf94-2a1c5e2d7e39'::uuid, 'eventos', 'congressos', 'Congressos', 'published'),
  ('3b3f1ae3-f0ee-41f3-9a33-3e6193464016'::uuid, 'eventos', 'congressos', 'Congressos', 'published'),
  ('6ce3f580-960f-4138-837f-bac6df0a9498'::uuid, 'eventos', 'congressos', 'Congressos', 'published'),
  ('b0c85d6b-1289-48b1-9248-ea6c8081fbf2'::uuid, 'eventos', 'congressos', 'Congressos', 'published'),
  ('ac5714e1-eb5e-4d30-984e-0244ee1b05e0'::uuid, 'eventos', 'congressos', 'Congressos', 'published'),
  ('bcbee373-c92b-4cc2-a290-9f0ab81518e2'::uuid, 'eventos', 'congressos', 'Congressos', 'published'),
  ('944a8198-4823-4661-afcb-1a6faef1259c'::uuid, 'eventos', 'congressos', 'Congressos', 'published'),
  ('176fc9f3-052d-44f1-a251-afd895bfc1a7'::uuid, 'eventos', 'congressos', 'Congressos', 'published'),
  ('d8715365-d49c-4bb7-b331-5faa4f1cc458'::uuid, 'eventos', 'congressos', 'Congressos', 'published'),
  ('e02fc2b9-12b4-458d-a8dc-95b9c0510b49'::uuid, 'eventos', 'congressos', 'Congressos', 'published'),
  ('ebeaf871-371c-4f9b-8169-824e2da86ba3'::uuid, 'eventos', 'cursos', 'Cursos', 'published'),
  ('899359eb-b411-4b1f-95c4-234e88c49041'::uuid, 'eventos', 'cursos', 'Cursos', 'published'),
  ('0f601a58-f4a0-46a7-9810-a28b5564e67c'::uuid, 'eventos', 'cursos', 'Cursos', 'published'),
  ('7038c22d-fe66-49f6-a2a2-ec086f4f9a20'::uuid, 'eventos', 'cursos', 'Cursos', 'published'),
  ('ba140334-470b-4655-a9c1-994ba64e4c28'::uuid, 'eventos', 'cursos', 'Cursos', 'published'),
  ('a59449cb-ca81-4545-a147-32a6dbd2c852'::uuid, 'eventos', 'cursos', 'Cursos', 'published'),
  ('5c601845-a26e-46d5-94c0-ba67a50e3ccd'::uuid, 'eventos', 'palestras', 'Palestras', 'published'),
  ('a246c601-e693-4d7b-a07b-99e0cb617616'::uuid, 'eventos', 'culturais', 'Culturais', 'published'),
  ('09460066-0e96-45b9-81b4-7ff2e564c6aa'::uuid, 'eventos', 'culturais', 'Culturais', 'published'),
  ('495b4856-d68a-49bc-89a4-79a16c2c3a7f'::uuid, 'eventos', 'academicos', 'Acadêmicos', 'published'),
  ('cb2ce3c1-df2c-43ec-a75d-f251ea61473a'::uuid, 'eventos', 'academicos', 'Acadêmicos', 'published'),
  ('2764dfda-1cf3-4aa1-b255-49248415c9e2'::uuid, 'oportunidades', 'concursos', 'Concursos', 'published'),
  ('b9b214e9-30a2-4a83-8037-e17ca2b8c5d1'::uuid, 'oportunidades', 'pesquisa', 'Pesquisa', 'published'),
  ('14c43a7f-395c-4ee0-8d11-9ddf76667586'::uuid, 'oportunidades', 'pesquisa', 'Pesquisa', 'published'),
  ('84f595c9-e601-412b-bf10-263284bbe81d'::uuid, 'eventos', 'congressos', 'Congressos', 'published'),
  ('e9a826be-a1e3-43eb-aece-85742c10e255'::uuid, 'eventos', 'palestras', 'Palestras', 'published'),
  ('f75602ca-76a2-4cea-b368-3e45cc995816'::uuid, 'oportunidades', 'editais', 'Editais', 'closed'),
  ('b6fff52c-93ad-4579-8a9d-86a8d9d1dea4'::uuid, 'eventos', 'workshops', 'Workshops', 'hidden'),
  ('31715ae7-9cd9-4fda-adb2-6541da6fec64'::uuid, 'oportunidades', 'monitoria', 'Monitoria', 'hidden'),
  ('953bb526-e5f5-4e36-a59c-7b102e344518'::uuid, 'eventos', 'academicos', 'Acadêmicos', 'hidden'),
  ('50a3e363-76ed-4bc6-b8fd-ab4b79faa857'::uuid, 'oportunidades', 'pesquisa', 'Pesquisa', 'published'),
  ('1917e659-5151-4650-bfa2-6ec20fd5e81b'::uuid, 'oportunidades', 'pesquisa', 'Pesquisa', 'published'),
  ('a8a66d60-0a03-4606-907a-15e48f9f687b'::uuid, 'oportunidades', 'concursos', 'Concursos', 'published'),
  ('3ae523bb-c15b-4d36-a494-1ca43ae95aa3'::uuid, 'oportunidades', 'concursos', 'Concursos', 'published'),
  ('ebb3c886-ac26-4022-bf9e-f3ce31d9fbbe'::uuid, 'oportunidades', 'monitoria', 'Monitoria', 'published'),
  ('c848f243-077b-4dc8-bf52-86572af7f5fb'::uuid, 'oportunidades', 'cursos-capacitacoes', 'Cursos e capacitações', 'published'),
  ('577ea0ba-a7ad-4f01-8a05-fbd0a4b4fbe4'::uuid, 'oportunidades', 'cursos-capacitacoes', 'Cursos e capacitações', 'published'),
  ('fffdc11c-2855-4a8d-9cb2-c10cad863888'::uuid, 'oportunidades', 'cursos-capacitacoes', 'Cursos e capacitações', 'published'),
  ('498e0054-31f1-458b-8953-3179decdd033'::uuid, 'oportunidades', 'cursos-capacitacoes', 'Cursos e capacitações', 'published'),
  ('ca10120d-7e9b-42f7-971a-db9861540a5b'::uuid, 'oportunidades', 'cursos-capacitacoes', 'Cursos e capacitações', 'published'),
  ('080f8237-a8fe-4200-b53a-946b7ea934a3'::uuid, 'oportunidades', 'cursos-capacitacoes', 'Cursos e capacitações', 'published'),
  ('858c8b0b-007b-402d-a7e8-0ad1d753d87e'::uuid, 'oportunidades', 'voluntariado', 'Voluntariado', 'published'),
  ('4bc906fb-0f5f-463e-bcbd-26c6329a995e'::uuid, 'oportunidades', 'bolsas', 'Bolsas', 'published');

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

create temporary table kc_semantic_pre_rows_20260808 on commit drop as
select
  p.id,
  p.module,
  p.category,
  p.status,
  p.metadata,
  p.updated_at,
  to_jsonb(p) as row_json
from public.posts p
join pg_temp.kc_semantic_post_reclassification_expected_20260808 expected using (id);

create temporary table kc_semantic_status_baseline_20260808 on commit drop as
select status, count(*)::bigint as row_count
from public.posts
group by status;

create temporary table kc_semantic_total_baseline_20260808 on commit drop as
select count(*)::bigint as row_count from public.posts;

create temporary table kc_semantic_audit_baseline_ids_20260808 on commit drop as
select a.id
from public.audit_log a
join pg_temp.kc_semantic_post_reclassification_expected_20260808 expected
  on expected.id = a.entity_id;

-- FIRST_PRODUCTION_RUN
\ir ../../supabase/migrations/20260808152900_semantic_post_reclassification.sql

create temporary table kc_semantic_pre_states_20260808 on commit drop as
select
  pre.id,
  pre.updated_at,
  pre.row_json,
  spec.current_status,
  spec.target_status,
  (
    pre.module = spec.current_module
    and pre.category = spec.current_category
    and pre.status = spec.current_status
    and fingerprint.value is not distinct from spec.current_touched_fingerprint
  ) as was_source,
  (
    pre.module = spec.target_module
    and pre.category = spec.target_category
    and pre.status = spec.target_status
    and fingerprint.value is not distinct from spec.target_touched_fingerprint
  ) as was_target
from pg_temp.kc_semantic_pre_rows_20260808 pre
join pg_temp.kc_semantic_post_reclassification_20260808 spec using (id)
cross join lateral (
  select pg_temp.kc_semantic_touched_fingerprint_20260808(
    pre.metadata,
    spec.target_module,
    spec.current_module <> spec.target_module,
    spec.touch_event_dates,
    spec.touch_deadline
  ) as value
) fingerprint;

do $pre_state_matrix$
begin
  if (select count(*) from pg_temp.kc_semantic_pre_states_20260808) <> 49
     or exists (
       select 1
       from pg_temp.kc_semantic_pre_states_20260808
       where was_source is not true and was_target is not true
          or was_source is true and was_target is true
     ) then
    raise exception 'semantic production proof failed: pre-state matrix is not exactly source xor target';
  end if;
end;
$pre_state_matrix$;

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
    and p.metadata->>'categoriaKey' = expected.category
    and p.metadata->>'categoryLabel' = expected.category_label
    and p.metadata->>'categoria' = expected.category_label
    and p.metadata->>'categoriaLabel' = expected.category_label
    and p.metadata->>'module' = expected.module;

  if v_matched <> 49 then
    raise exception 'semantic proof failed: expected 49 complete target identities, got %', v_matched;
  end if;

  if (
    select count(*)
    from public.posts p
    join pg_temp.kc_semantic_post_reclassification_20260808 spec using (id)
    where pg_temp.kc_semantic_touched_fingerprint_20260808(
      p.metadata,
      spec.target_module,
      spec.current_module <> spec.target_module,
      spec.touch_event_dates,
      spec.touch_deadline
    ) is not distinct from spec.target_touched_fingerprint
  ) <> 49 then
    raise exception 'semantic proof failed: expected 49 exact independent target fingerprints';
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
          'hora_evento', 'horaEvento', 'hora',
          'eventType', 'event_type', 'eventMode', 'event_mode',
          'eventLocation', 'event_location'
        ]
        or coalesce(p.metadata->'dates', '{}'::jsonb) ?| array[
          'eventStartsAt', 'eventEndsAt', 'event_starts_at', 'event_ends_at',
          'eventStart', 'eventEnd'
        ]
        or p.metadata->'gratuito' is distinct from 'true'::jsonb
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
      and (
        p.metadata ?| array[
          'areaKey', 'areaLabel', 'area', 'areaAtuacao', 'area_atuacao',
          'workMode', 'workModeLabel', 'work_mode', 'modalidadeTrabalho', 'modalidade',
          'employmentType', 'employmentTypeLabel', 'employment_type', 'regimeContratacao',
          'remuneracao', 'salary', 'salario', 'benefits', 'beneficios',
          'opportunityType', 'opportunityTypeKey', 'opportunity_type',
          'subcategory', 'subcategoryKey', 'subcategoryLabel',
          'subcategoria', 'subcategoriaKey', 'subcategoriaLabel'
        ]
        or coalesce(p.metadata->'tags', '[]'::jsonb) ?| array['Saude', 'Direito', 'Presencial']
        or coalesce(p.metadata->'tagKeys', '[]'::jsonb) ?| array['saude', 'direito', 'presencial']
      )
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

  if exists (
    select 1
    from public.posts p
    join pg_temp.kc_semantic_post_reclassification_expected_20260808 expected using (id)
    where jsonb_typeof(p.metadata->'tags') <> 'array'
      or not (p.metadata->'tags' @> jsonb_build_array(expected.category_label))
  ) then
    raise exception 'semantic proof failed: a target category label is missing from tags';
  end if;

  if exists (
    select 1
    from public.posts p
    join pg_temp.kc_semantic_post_reclassification_expected_20260808 expected using (id)
    where jsonb_typeof(p.metadata->'tagKeys') <> 'array'
      or not (p.metadata->'tagKeys' @> jsonb_build_array(expected.category))
  ) then
    raise exception 'semantic proof failed: a target category key is missing from tagKeys';
  end if;
end;
$proof$;

do $status_and_cardinality_proof$
declare
  v_total bigint;
  v_status text;
  v_expected_status_count bigint;
  v_actual_status_count bigint;
  v_expected_audit_count integer;
  v_new_audit_count integer;
  v_all_new_audit_count integer;
begin
  select count(*) into v_total from public.posts;
  if v_total <> (select row_count from pg_temp.kc_semantic_total_baseline_20260808) then
    raise exception 'semantic proof failed: total post cardinality changed';
  end if;

  for v_status in
    select status from pg_temp.kc_semantic_status_baseline_20260808
    union
    select current_status from pg_temp.kc_semantic_pre_states_20260808
    union
    select target_status from pg_temp.kc_semantic_pre_states_20260808
  loop
    select
      coalesce((
        select row_count
        from pg_temp.kc_semantic_status_baseline_20260808
        where status = v_status
      ), 0)
      - count(*) filter (
          where was_source is true and current_status = v_status
        )
      + count(*) filter (
          where was_source is true and target_status = v_status
        )
      into v_expected_status_count
    from pg_temp.kc_semantic_pre_states_20260808;

    select count(*) into v_actual_status_count
    from public.posts
    where status = v_status;

    if v_actual_status_count <> v_expected_status_count then
      raise exception
        'semantic proof failed: dynamic status projection for % expected %, got %',
        v_status,
        v_expected_status_count,
        v_actual_status_count;
    end if;
  end loop;

  if exists (
    select 1
    from public.posts p
    join pg_temp.kc_semantic_pre_states_20260808 pre using (id)
    where (
      pre.was_source is true
      and (p.updated_at > pre.updated_at) is not true
    ) or (
      pre.was_target is true
      and to_jsonb(p) is distinct from pre.row_json
    )
  ) then
    raise exception 'semantic proof failed: source/target updated_at projection is not exact';
  end if;

  select count(*) into v_expected_audit_count
  from pg_temp.kc_semantic_pre_states_20260808
  where was_source is true
    and current_status <> target_status;

  select count(*) into v_new_audit_count
  from public.audit_log a
  join pg_temp.kc_semantic_pre_states_20260808 pre
    on pre.id = a.entity_id
  left join pg_temp.kc_semantic_audit_baseline_ids_20260808 baseline
    on baseline.id = a.id
  where baseline.id is null
    and pre.was_source is true
    and pre.current_status <> pre.target_status
    and a.action = 'post_status_changed'
    and a.entity_type = 'posts'
    and a.payload#>>'{before,status}' = pre.current_status
    and a.payload#>>'{after,status}' = pre.target_status;

  select count(*) into v_all_new_audit_count
  from public.audit_log a
  join pg_temp.kc_semantic_pre_states_20260808 pre
    on pre.id = a.entity_id
  left join pg_temp.kc_semantic_audit_baseline_ids_20260808 baseline
    on baseline.id = a.id
  where baseline.id is null;

  if v_new_audit_count <> v_expected_audit_count
     or v_all_new_audit_count <> v_expected_audit_count then
    raise exception
      'semantic proof failed: dynamic audit projection expected %, matching %, total %',
      v_expected_audit_count,
      v_new_audit_count,
      v_all_new_audit_count;
  end if;
end;
$status_and_cardinality_proof$;

create temporary table kc_semantic_target_snapshot_20260808 on commit drop as
select p.id, to_jsonb(p) as row_json
from public.posts p
join pg_temp.kc_semantic_post_reclassification_expected_20260808 expected using (id);

create temporary table kc_semantic_audit_snapshot_20260808 on commit drop as
select coalesce(jsonb_agg(to_jsonb(a) order by a.id), '[]'::jsonb) as audit_json
from public.audit_log a
join pg_temp.kc_semantic_post_reclassification_expected_20260808 expected
  on expected.id = a.entity_id;

-- FIXED_POINT_PRODUCTION_REPLAY
\ir ../../supabase/migrations/20260808152900_semantic_post_reclassification.sql

do $fixed_point_proof$
begin
  if exists (
    select 1
    from public.posts p
    join pg_temp.kc_semantic_target_snapshot_20260808 snapshot using (id)
    where to_jsonb(p) is distinct from snapshot.row_json
  ) then
    raise exception 'semantic production proof failed: replay changed a complete target row';
  end if;
  if (
    select coalesce(jsonb_agg(to_jsonb(a) order by a.id), '[]'::jsonb)
    from public.audit_log a
    join pg_temp.kc_semantic_post_reclassification_expected_20260808 expected
      on expected.id = a.entity_id
  ) is distinct from (select audit_json from pg_temp.kc_semantic_audit_snapshot_20260808) then
    raise exception 'semantic production proof failed: replay produced audit side effects';
  end if;
end;
$fixed_point_proof$;

-- Complete-target mutants are explicit third states. They run with the three
-- real origin triggers enabled; each nested block rolls back its UPDATE and
-- every trigger side effect after the expected assertion failure.
do $drift_proof$
declare
  v_id uuid;
  v_case text;
  v_expected_message text;
begin
  foreach v_case in array array[
    'label-drift',
    'label-missing',
    'label-json-null',
    'old-category-arrays',
    'old-module-arrays',
    'removed-alias',
    'module-sql-null'
  ]
  loop
    v_id := case
      when v_case = 'old-module-arrays' then '84f595c9-e601-412b-bf10-263284bbe81d'::uuid
      when v_case = 'removed-alias' then '752300fd-d5d1-4873-8ca4-62a19d0f04c2'::uuid
      else 'fbfaeb0f-a7f5-4ba0-a410-ca1f9b1dccbb'::uuid
    end;

    begin
      update public.posts
      set
        module = case when v_case = 'module-sql-null' then null else module end,
        metadata = case v_case
          when 'label-drift' then jsonb_set(metadata, '{categoryLabel}', '"drifted"'::jsonb, true)
          when 'label-missing' then metadata - 'categoryLabel'
          when 'label-json-null' then jsonb_set(metadata, '{categoryLabel}', 'null'::jsonb, true)
          when 'old-category-arrays' then jsonb_set(
            jsonb_set(
              metadata,
              '{tags}',
              coalesce(metadata->'tags', '[]'::jsonb) || jsonb_build_array('Academicos'),
              true
            ),
            '{tagKeys}',
            coalesce(metadata->'tagKeys', '[]'::jsonb) || jsonb_build_array('academicos'),
            true
          )
          when 'old-module-arrays' then jsonb_set(
            jsonb_set(
              metadata,
              '{tags}',
              coalesce(metadata->'tags', '[]'::jsonb) || jsonb_build_array('Saude'),
              true
            ),
            '{tagKeys}',
            coalesce(metadata->'tagKeys', '[]'::jsonb) || jsonb_build_array('saude'),
            true
          )
          when 'removed-alias' then metadata - 'data'
          else metadata
        end
      where id = v_id;

      select format(
        'semantic post reclassification aborted: unexpected state for %s; got %s/%s/%s, expected audited %s/%s/%s or complete target %s/%s/%s',
        spec.id,
        coalesce(p.module, '<null>'),
        coalesce(p.category, '<null>'),
        coalesce(p.status, '<null>'),
        spec.current_module,
        spec.current_category,
        spec.current_status,
        spec.target_module,
        spec.target_category,
        spec.target_status
      ) into v_expected_message
      from public.posts p
      join pg_temp.kc_semantic_post_reclassification_20260808 spec using (id)
      where p.id = v_id;

      perform pg_temp.kc_assert_semantic_post_states_20260808();
      raise exception using errcode = 'P0002', message = format('semantic drift proof failed: %s was accepted', v_case);
    exception
      when sqlstate 'KC001' then
        if sqlerrm <> v_expected_message then
          raise;
        end if;
    end;
  end loop;

  if exists (
    select 1
    from public.posts p
    join pg_temp.kc_semantic_target_snapshot_20260808 snapshot using (id)
    where to_jsonb(p) is distinct from snapshot.row_json
  ) then
    raise exception 'semantic drift proof failed: a rejected drift left residual writes';
  end if;
  perform pg_temp.kc_assert_semantic_post_states_20260808();
end;
$drift_proof$;

rollback;

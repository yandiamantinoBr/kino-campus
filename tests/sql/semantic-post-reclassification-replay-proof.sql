\set ON_ERROR_STOP on

-- Executable local PostgreSQL matrix. It reconstructs every audited source
-- fingerprint, proves the first run and replay, and rolls everything back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $local_session_guard$
begin
  if current_setting('session_replication_role') <> 'origin' then
    raise exception 'semantic replay proof requires session_replication_role=origin';
  end if;
  if pg_catalog.has_parameter_privilege(
       current_user,
       'session_replication_role',
       'set'
     ) is not true then
    raise exception 'semantic replay proof requires SET privilege for session_replication_role';
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
    raise exception 'semantic replay proof requires the exact three enabled local posts triggers';
  end if;
end;
$local_session_guard$;

-- The proof temporarily suppresses origin triggers only in its own session to
-- build exact audited fixtures. This lock prevents concurrent local writers.
lock table public.posts in share row exclusive mode;

do $empty_guard$
begin
  if exists (select 1 from public.posts) then
    raise exception 'semantic replay proof requires an empty public.posts table';
  end if;
end;
$empty_guard$;

-- EMPTY_REPLAY: a reset/preview schema remains a no-op.
\ir ../../supabase/migrations/20260808152900_semantic_post_reclassification.sql

create temporary table kc_semantic_spec_snapshot_20260808 on commit drop as
select * from pg_temp.kc_semantic_post_reclassification_20260808;

create temporary table kc_semantic_category_labels_20260808 (
  module text not null,
  category text not null,
  label text not null,
  primary key (module, category)
) on commit drop;

insert into pg_temp.kc_semantic_category_labels_20260808 values
  ('eventos', 'academicos', 'Acadêmicos'),
  ('eventos', 'palestras', 'Palestras'),
  ('eventos', 'congressos', 'Congressos'),
  ('eventos', 'cursos', 'Cursos'),
  ('eventos', 'culturais', 'Culturais'),
  ('eventos', 'workshops', 'Workshops'),
  ('oportunidades', 'editais', 'Editais'),
  ('oportunidades', 'concursos', 'Concursos'),
  ('oportunidades', 'bolsas', 'Bolsas'),
  ('oportunidades', 'monitoria', 'Monitoria'),
  ('oportunidades', 'pesquisa', 'Pesquisa'),
  ('oportunidades', 'cursos-capacitacoes', 'Cursos e capacitações'),
  ('oportunidades', 'voluntariado', 'Voluntariado');

do $matrix_shape$
begin
  if (select count(*) from pg_temp.kc_semantic_spec_snapshot_20260808) <> 49 then
    raise exception 'semantic matrix: expected 49 specifications';
  end if;
  if exists (
    select 1
    from pg_temp.kc_semantic_spec_snapshot_20260808
    where current_touched_fingerprint is null
       or target_touched_fingerprint is null
  ) then
    raise exception 'semantic matrix: source and independent target fingerprints must be complete';
  end if;
  if (select count(*) from pg_temp.kc_semantic_spec_snapshot_20260808
      where current_module <> target_module) <> 5 then
    raise exception 'semantic matrix: expected exactly 5 module moves';
  end if;
  if (select count(*) from pg_temp.kc_semantic_spec_snapshot_20260808
      where current_module <> target_module or current_category <> target_category) <> 45 then
    raise exception 'semantic matrix: expected exactly 45 taxonomy changes';
  end if;
  if (select count(*) from pg_temp.kc_semantic_spec_snapshot_20260808
      where current_status <> target_status) <> 4 then
    raise exception 'semantic matrix: expected exactly 4 status changes';
  end if;
  if (select count(*) from pg_temp.kc_semantic_spec_snapshot_20260808 where target_status = 'published') <> 45
     or (select count(*) from pg_temp.kc_semantic_spec_snapshot_20260808 where target_status = 'hidden') <> 3
     or (select count(*) from pg_temp.kc_semantic_spec_snapshot_20260808 where target_status = 'closed') <> 1 then
    raise exception 'semantic matrix: unexpected 45/3/1 target status distribution';
  end if;
  if exists (
    select 1
    from pg_temp.kc_semantic_spec_snapshot_20260808 s
    left join pg_temp.kc_semantic_category_labels_20260808 l
      on l.module = s.target_module and l.category = s.target_category
    where l.label is null or l.label is distinct from s.target_category_label
  ) then
    raise exception 'semantic matrix: target labels disagree with independent taxonomy map';
  end if;
  if exists (select 1 from public.posts) then
    raise exception 'semantic matrix: empty replay created production UUIDs';
  end if;
end;
$matrix_shape$;

do $array_rewrite_contract$
begin
  if pg_temp.kc_semantic_rewrite_text_array_20260808(
       '["keep","keep","Old","Target","tail"]'::jsonb,
       array['Old'],
       'Target'
     ) is distinct from '["keep","keep","Target","tail"]'::jsonb then
    raise exception 'semantic matrix: tag rewrite changed order or unrelated duplicates';
  end if;
end;
$array_rewrite_contract$;

create or replace function pg_temp.kc_semantic_source_metadata_20260808(
  p_fingerprint jsonb,
  p_id uuid
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_meta jsonb := coalesce(p_fingerprint->'root', '{}'::jsonb);
  v_dates_type text := p_fingerprint->>'datesType';
begin
  if v_dates_type = 'object' then
    v_meta := jsonb_set(v_meta, '{dates}', coalesce(p_fingerprint->'dates', '{}'::jsonb), true);
  elsif v_dates_type = 'json-null' then
    v_meta := jsonb_set(v_meta, '{dates}', 'null'::jsonb, true);
  elsif v_dates_type is not null and v_dates_type <> 'missing' then
    raise exception 'semantic matrix: unsupported dates type %', v_dates_type;
  end if;

  -- Audited live value intentionally excluded from the touched fingerprint:
  -- gratuito is valid in both source Eventos and target Oportunidades.
  if p_id = any(array[
    '2764dfda-1cf3-4aa1-b255-49248415c9e2'::uuid,
    'b9b214e9-30a2-4a83-8037-e17ca2b8c5d1'::uuid,
    '14c43a7f-395c-4ee0-8d11-9ddf76667586'::uuid
  ]) then
    v_meta := jsonb_set(v_meta, '{gratuito}', 'true'::jsonb, true);
  end if;

  return v_meta || jsonb_build_object('_semantic_proof_sentinel', p_id::text);
end;
$function$;

-- PARTIAL_CARDINALITY: one audited source in a nonempty database must fail.
do $partial_cardinality$
declare
  v_spec record;
  v_expected_missing uuid;
begin
  select * into v_spec from pg_temp.kc_semantic_spec_snapshot_20260808 order by id limit 1;
  select id into v_expected_missing
  from pg_temp.kc_semantic_spec_snapshot_20260808
  where id <> v_spec.id
  order by id
  limit 1;
  begin
    perform set_config('session_replication_role', 'replica', true);
    insert into public.posts (id, title, description, module, category, status, visibility, metadata)
    values (
      v_spec.id,
      'semantic partial-cardinality fixture',
      'rolled back by proof',
      v_spec.current_module,
      v_spec.current_category,
      v_spec.current_status,
      'public',
      pg_temp.kc_semantic_source_metadata_20260808(v_spec.current_touched_fingerprint, v_spec.id)
    );
    perform set_config('session_replication_role', 'origin', true);
    perform pg_temp.kc_assert_semantic_post_states_20260808();
    raise exception using errcode = 'P0002', message = 'semantic matrix: partial cardinality was accepted';
  exception
    when sqlstate 'KC002' then
      if sqlerrm <> format(
        'semantic post reclassification aborted: expected all 49 audited posts; missing %s',
        v_expected_missing
      ) then
        raise;
      end if;
  end;
end;
$partial_cardinality$;

select set_config('session_replication_role', 'replica', true);
insert into public.posts (
  id, title, description, module, category, status, visibility, metadata, created_at, updated_at
)
select
  s.id,
  'semantic proof ' || s.id::text,
  'isolated semantic source fixture',
  s.current_module,
  s.current_category,
  s.current_status,
  'public',
  pg_temp.kc_semantic_source_metadata_20260808(s.current_touched_fingerprint, s.id),
  timestamptz '2000-01-01 00:00:00+00',
  timestamptz '2000-01-01 00:00:00+00'
from pg_temp.kc_semantic_spec_snapshot_20260808 s;
select set_config('session_replication_role', 'origin', true);

create temporary table kc_semantic_source_rows_20260808 on commit drop as
select p.* from public.posts p join pg_temp.kc_semantic_spec_snapshot_20260808 s using (id);

-- MISSING_ONE_CARDINALITY: a 48/49 production-like set must also fail closed.
do $missing_one_cardinality$
declare
  v_missing uuid := 'fbfaeb0f-a7f5-4ba0-a410-ca1f9b1dccbb'::uuid;
begin
  begin
    perform set_config('session_replication_role', 'replica', true);
    delete from public.posts where id = v_missing;
    perform set_config('session_replication_role', 'origin', true);
    perform pg_temp.kc_assert_semantic_post_states_20260808();
    raise exception using errcode = 'P0002', message = 'semantic matrix: 48/49 cardinality was accepted';
  exception
    when sqlstate 'KC002' then
      if sqlerrm <> format(
        'semantic post reclassification aborted: expected all 49 audited posts; missing %s',
        v_missing
      ) then
        raise;
      end if;
  end;

  perform pg_temp.kc_assert_semantic_post_states_20260808();
end;
$missing_one_cardinality$;

-- FIRST_FULL_RUN: all 49 exact audited sources reach their complete targets.
\ir ../../supabase/migrations/20260808152900_semantic_post_reclassification.sql

do $target_matrix$
declare
  v_audit_count integer;
begin
  if (
    select count(*)
    from public.posts p
    join pg_temp.kc_semantic_spec_snapshot_20260808 s using (id)
    join pg_temp.kc_semantic_category_labels_20260808 l
      on l.module = s.target_module and l.category = s.target_category
    where p.module is not distinct from s.target_module
      and p.category is not distinct from s.target_category
      and p.status is not distinct from s.target_status
      and p.metadata->>'module' = s.target_module
      and p.metadata->>'category' = s.target_category
      and p.metadata->>'categoryKey' = s.target_category
      and p.metadata->>'categoriaKey' = s.target_category
      and p.metadata->>'categoryLabel' = l.label
      and p.metadata->>'categoria' = l.label
      and p.metadata->>'categoriaLabel' = l.label
      and p.metadata->>'_semantic_proof_sentinel' = p.id::text
  ) <> 49 then
    raise exception 'semantic matrix: expected 49 complete targets with synchronized labels';
  end if;

  if (
    select count(*)
    from public.posts p
    join pg_temp.kc_semantic_spec_snapshot_20260808 s using (id)
    where pg_temp.kc_semantic_touched_fingerprint_20260808(
      p.metadata,
      s.target_module,
      s.current_module <> s.target_module,
      s.touch_event_dates,
      s.touch_deadline
    ) is not distinct from s.target_touched_fingerprint
  ) <> 49 then
    raise exception 'semantic matrix: expected 49 exact independent target fingerprints';
  end if;

  if (select count(*) from public.posts where status = 'published') <> 45
     or (select count(*) from public.posts where status = 'hidden') <> 3
     or (select count(*) from public.posts where status = 'closed') <> 1 then
    raise exception 'semantic matrix: target status counts are not 45 published / 3 hidden / 1 closed';
  end if;

  if (select count(*) from public.posts p join pg_temp.kc_semantic_source_rows_20260808 b using (id)
      where p.updated_at > b.updated_at) <> 49 then
    raise exception 'semantic matrix: first run did not update exactly 49 rows';
  end if;

  select count(*) into v_audit_count
  from public.audit_log a
  join pg_temp.kc_semantic_spec_snapshot_20260808 s on s.id = a.entity_id
  where s.current_status <> s.target_status
    and a.action = 'post_status_changed'
    and a.entity_type = 'posts'
    and a.payload#>>'{before,status}' = s.current_status
    and a.payload#>>'{after,status}' = s.target_status;
  if v_audit_count <> 4 then
    raise exception 'semantic matrix: expected exactly four audited status transitions, got %', v_audit_count;
  end if;
end;
$target_matrix$;

do $tag_and_move_matrix$
begin
  if exists (
    select 1
    from public.posts p
    join pg_temp.kc_semantic_spec_snapshot_20260808 s using (id)
    join pg_temp.kc_semantic_source_rows_20260808 b using (id)
    where jsonb_typeof(p.metadata->'tags') <> 'array'
      or not (p.metadata->'tags' @> jsonb_build_array(s.target_category_label))
  ) then
    raise exception 'semantic matrix: a target category label is missing from tags';
  end if;
  if exists (
    select 1
    from public.posts p
    join pg_temp.kc_semantic_spec_snapshot_20260808 s using (id)
    join pg_temp.kc_semantic_source_rows_20260808 b using (id)
    where jsonb_typeof(p.metadata->'tagKeys') <> 'array'
      or not (p.metadata->'tagKeys' @> jsonb_build_array(s.target_category))
  ) then
    raise exception 'semantic matrix: a target category key is missing from tagKeys';
  end if;
  if exists (
    select 1
    from public.posts p
    join pg_temp.kc_semantic_spec_snapshot_20260808 s using (id)
    join pg_temp.kc_semantic_source_rows_20260808 b using (id)
    where s.current_category <> s.target_category
      and (
        (
          b.metadata->>'categoria' is distinct from s.target_category_label
          and coalesce(p.metadata->'tags', '[]'::jsonb) @> jsonb_build_array(b.metadata->>'categoria')
        )
        or (
          b.metadata->>'categoryLabel' is distinct from s.target_category_label
          and coalesce(p.metadata->'tags', '[]'::jsonb) @> jsonb_build_array(b.metadata->>'categoryLabel')
        )
        or coalesce(p.metadata->'tagKeys', '[]'::jsonb) @> jsonb_build_array(s.current_category)
      )
  ) then
    raise exception 'semantic matrix: stale source category remains in tags or tagKeys';
  end if;

  if (
    select count(*)
    from public.posts p
    join pg_temp.kc_semantic_spec_snapshot_20260808 s using (id)
    where s.current_module <> s.target_module
      and p.module = s.target_module
      and p.category = s.target_category
  ) <> 5 then
    raise exception 'semantic matrix: expected exactly five completed module moves';
  end if;

  if exists (
    select 1 from public.posts p
    where p.id = any(array[
      '2764dfda-1cf3-4aa1-b255-49248415c9e2'::uuid,
      'b9b214e9-30a2-4a83-8037-e17ca2b8c5d1'::uuid,
      '14c43a7f-395c-4ee0-8d11-9ddf76667586'::uuid
    ]) and (
      p.metadata ?| array['date_start','date_end','data_evento','data_fim_evento','eventStartsAt','eventEndsAt','hora_evento','eventType','eventMode','eventLocation']
      or coalesce(p.metadata->'dates', '{}'::jsonb) ?| array['eventStartsAt','eventEndsAt']
      or p.metadata->'gratuito' is distinct from 'true'::jsonb
    )
  ) then
    raise exception 'semantic matrix: event-to-opportunity cleanup or gratuito preservation failed';
  end if;

  if exists (
    select 1 from public.posts p
    where p.id = any(array[
      '84f595c9-e601-412b-bf10-263284bbe81d'::uuid,
      'e9a826be-a1e3-43eb-aece-85742c10e255'::uuid
    ]) and (
      p.metadata ?| array[
        'areaKey','areaLabel','area','workMode','workModeLabel','modalidadeTrabalho',
        'employmentType','employmentTypeLabel','regimeContratacao','remuneracao',
        'opportunityType','subcategory','subcategoryKey','subcategoryLabel',
        'subcategoria','subcategoriaKey','subcategoriaLabel'
      ]
      or coalesce(p.metadata->'tags', '[]'::jsonb) ?| array['Saude','Direito','Presencial']
      or coalesce(p.metadata->'tagKeys', '[]'::jsonb) ?| array['saude','direito','presencial']
    )
  ) then
    raise exception 'semantic matrix: opportunity-to-event cleanup is incomplete';
  end if;
end;
$tag_and_move_matrix$;

-- MIXED_SOURCE_TARGET_RUN: a deterministic subset returns to its exact source
-- while the remaining rows stay at the complete target. Only source rows may
-- update, and only their real status transitions may emit audit entries.
create temporary table kc_semantic_mixed_source_ids_20260808 (
  id uuid primary key
) on commit drop;

insert into pg_temp.kc_semantic_mixed_source_ids_20260808 (id)
select id
from (
  select
    id,
    row_number() over (order by id) as row_number
  from pg_temp.kc_semantic_spec_snapshot_20260808
  where current_status = target_status
) stable_sources
where row_number % 2 = 0
union
select 'f75602ca-76a2-4cea-b368-3e45cc995816'::uuid;

do $mixed_fixture_shape$
declare
  v_sources integer;
  v_status_transitions integer;
begin
  select count(*) into v_sources
  from pg_temp.kc_semantic_mixed_source_ids_20260808;
  select count(*) into v_status_transitions
  from pg_temp.kc_semantic_mixed_source_ids_20260808 mixed
  join pg_temp.kc_semantic_spec_snapshot_20260808 spec using (id)
  where spec.current_status <> spec.target_status;

  if v_sources <= 0 or v_sources >= 49 then
    raise exception 'semantic matrix: mixed fixture must contain source and target rows';
  end if;
  if v_status_transitions <> 1 then
    raise exception 'semantic matrix: mixed fixture must contain exactly one pending status transition';
  end if;
end;
$mixed_fixture_shape$;

select set_config('session_replication_role', 'replica', true);
update public.posts p
set
  module = source.module,
  category = source.category,
  status = source.status,
  metadata = source.metadata,
  updated_at = source.updated_at
from pg_temp.kc_semantic_source_rows_20260808 source
join pg_temp.kc_semantic_mixed_source_ids_20260808 mixed using (id)
where p.id = source.id;
select set_config('session_replication_role', 'origin', true);

create temporary table kc_semantic_mixed_baseline_20260808 on commit drop as
select
  p.id,
  mixed.id is not null as was_source,
  p.updated_at,
  to_jsonb(p) as row_json
from public.posts p
join pg_temp.kc_semantic_spec_snapshot_20260808 spec using (id)
left join pg_temp.kc_semantic_mixed_source_ids_20260808 mixed using (id);

create temporary table kc_semantic_mixed_audit_baseline_ids_20260808 on commit drop as
select audit.id
from public.audit_log audit
join pg_temp.kc_semantic_spec_snapshot_20260808 spec
  on spec.id = audit.entity_id;

\ir ../../supabase/migrations/20260808152900_semantic_post_reclassification.sql

do $mixed_source_target_matrix$
declare
  v_expected_audits integer;
  v_matching_audits integer;
  v_all_new_audits integer;
begin
  if (
    select count(*)
    from public.posts p
    join pg_temp.kc_semantic_spec_snapshot_20260808 spec using (id)
    where pg_temp.kc_semantic_touched_fingerprint_20260808(
      p.metadata,
      spec.target_module,
      spec.current_module <> spec.target_module,
      spec.touch_event_dates,
      spec.touch_deadline
    ) is not distinct from spec.target_touched_fingerprint
      and p.module = spec.target_module
      and p.category = spec.target_category
      and p.status = spec.target_status
  ) <> 49 then
    raise exception 'semantic matrix: mixed run did not converge to 49 exact targets';
  end if;

  if exists (
    select 1
    from public.posts p
    join pg_temp.kc_semantic_mixed_baseline_20260808 baseline using (id)
    where (
      baseline.was_source
      and (p.updated_at > baseline.updated_at) is not true
    ) or (
      not baseline.was_source
      and to_jsonb(p) is distinct from baseline.row_json
    )
  ) then
    raise exception 'semantic matrix: mixed run updated the wrong source/target row set';
  end if;

  select count(*) into v_expected_audits
  from pg_temp.kc_semantic_mixed_source_ids_20260808 mixed
  join pg_temp.kc_semantic_spec_snapshot_20260808 spec using (id)
  where spec.current_status <> spec.target_status;

  select count(*) into v_matching_audits
  from public.audit_log audit
  join pg_temp.kc_semantic_mixed_source_ids_20260808 mixed
    on mixed.id = audit.entity_id
  join pg_temp.kc_semantic_spec_snapshot_20260808 spec
    on spec.id = mixed.id
  left join pg_temp.kc_semantic_mixed_audit_baseline_ids_20260808 baseline
    on baseline.id = audit.id
  where baseline.id is null
    and spec.current_status <> spec.target_status
    and audit.action = 'post_status_changed'
    and audit.entity_type = 'posts'
    and audit.payload#>>'{before,status}' = spec.current_status
    and audit.payload#>>'{after,status}' = spec.target_status;

  select count(*) into v_all_new_audits
  from public.audit_log audit
  join pg_temp.kc_semantic_spec_snapshot_20260808 spec
    on spec.id = audit.entity_id
  left join pg_temp.kc_semantic_mixed_audit_baseline_ids_20260808 baseline
    on baseline.id = audit.id
  where baseline.id is null;

  if v_expected_audits <> 1
     or v_matching_audits <> v_expected_audits
     or v_all_new_audits <> v_expected_audits then
    raise exception 'semantic matrix: mixed run audit projection is not exact';
  end if;
end;
$mixed_source_target_matrix$;

create temporary table kc_semantic_target_snapshot_20260808 on commit drop as
select p.id, to_jsonb(p) as row_json
from public.posts p join pg_temp.kc_semantic_spec_snapshot_20260808 s using (id);

create temporary table kc_semantic_audit_snapshot_20260808 on commit drop as
select coalesce(jsonb_agg(to_jsonb(a) order by a.id), '[]'::jsonb) as audit_json
from public.audit_log a
join pg_temp.kc_semantic_spec_snapshot_20260808 s on s.id = a.entity_id;

-- FIXED_POINT_REPLAY: complete targets must not change rows, timestamps or audit.
\ir ../../supabase/migrations/20260808152900_semantic_post_reclassification.sql

do $fixed_point$
begin
  if exists (
    select 1
    from public.posts p
    join pg_temp.kc_semantic_target_snapshot_20260808 snapshot using (id)
    where to_jsonb(p) is distinct from snapshot.row_json
  ) then
    raise exception 'semantic matrix: replay changed a complete target row';
  end if;
  if (
    select coalesce(jsonb_agg(to_jsonb(a) order by a.id), '[]'::jsonb)
    from public.audit_log a
    join pg_temp.kc_semantic_spec_snapshot_20260808 s on s.id = a.entity_id
  ) is distinct from (select audit_json from pg_temp.kc_semantic_audit_snapshot_20260808) then
    raise exception 'semantic matrix: replay produced audit side effects';
  end if;
end;
$fixed_point$;

-- TRIGGER_GUARD_MUTANTS: each required trigger is disabled in its own nested
-- subtransaction. The expected KC003 abort rolls that DDL back before the
-- handler runs, so every iteration must observe the trigger restored to O.
do $trigger_guard_mutants$
declare
  v_trigger_name text;
  v_expected_message text;
  v_enabled "char";
  v_before jsonb;
  v_after jsonb;
begin
  select coalesce(
    jsonb_object_agg(trigger_row.tgname, trigger_row.tgenabled::text order by trigger_row.tgname),
    '{}'::jsonb
  )
    into v_before
  from pg_catalog.pg_trigger trigger_row
  where trigger_row.tgrelid = pg_catalog.to_regclass('public.posts')
    and trigger_row.tgname = any(array[
      'kc_posts_set_updated_at',
      'trg_audit_posts_status',
      'trg_posts_canonicalize_feed_fields'
    ]::text[])
    and trigger_row.tgisinternal is false;

  if v_before is distinct from '{
    "kc_posts_set_updated_at": "O",
    "trg_audit_posts_status": "O",
    "trg_posts_canonicalize_feed_fields": "O"
  }'::jsonb then
    raise exception 'semantic matrix: trigger mutant baseline must contain exactly three O triggers, got %', v_before;
  end if;

  foreach v_trigger_name in array array[
    'kc_posts_set_updated_at',
    'trg_audit_posts_status',
    'trg_posts_canonicalize_feed_fields'
  ]::text[]
  loop
    v_expected_message := pg_catalog.format(
      'semantic post reclassification aborted: required enabled trigger %s on public.posts',
      v_trigger_name
    );

    begin
      execute pg_catalog.format(
        'alter table %I.%I disable trigger %I',
        'public',
        'posts',
        v_trigger_name
      );

      select trigger_row.tgenabled
        into v_enabled
      from pg_catalog.pg_trigger trigger_row
      where trigger_row.tgrelid = pg_catalog.to_regclass('public.posts')
        and trigger_row.tgname = v_trigger_name
        and trigger_row.tgisinternal is false;

      if not found or v_enabled <> 'D' then
        raise exception 'semantic matrix: trigger mutant did not disable %', v_trigger_name;
      end if;

      perform pg_temp.kc_assert_semantic_post_states_20260808();
      raise exception using
        errcode = 'P0002',
        message = pg_catalog.format(
          'semantic matrix: disabled trigger %s was accepted',
          v_trigger_name
        );
    exception
      when sqlstate 'KC003' then
        if sqlerrm <> v_expected_message then
          raise;
        end if;
    end;

    select trigger_row.tgenabled
      into v_enabled
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = pg_catalog.to_regclass('public.posts')
      and trigger_row.tgname = v_trigger_name
      and trigger_row.tgisinternal is false;

    if not found or v_enabled <> 'O' then
      raise exception 'semantic matrix: failed KC003 mutant did not restore trigger % to O', v_trigger_name;
    end if;
  end loop;

  select coalesce(
    jsonb_object_agg(trigger_row.tgname, trigger_row.tgenabled::text order by trigger_row.tgname),
    '{}'::jsonb
  )
    into v_after
  from pg_catalog.pg_trigger trigger_row
  where trigger_row.tgrelid = pg_catalog.to_regclass('public.posts')
    and trigger_row.tgname = any(array[
      'kc_posts_set_updated_at',
      'trg_audit_posts_status',
      'trg_posts_canonicalize_feed_fields'
    ]::text[])
    and trigger_row.tgisinternal is false;

  if v_after is distinct from v_before then
    raise exception 'semantic matrix: trigger mutant state changed: before %, after %', v_before, v_after;
  end if;

  perform pg_temp.kc_assert_semantic_post_states_20260808();
end;
$trigger_guard_mutants$;

-- DRIFT_GUARDS: mutate complete targets, never source fixtures. Old category
-- arrays, old module arrays, removed conditional aliases and incomplete/null
-- deadline aliases must all be rejected.
do $drift_guards$
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
    'deadline-root-missing',
    'deadline-root-json-null',
    'deadline-dates-missing',
    'deadline-dates-json-null',
    'module-sql-null',
    'category-sql-null'
  ]
  loop
    v_id := case
      when v_case = 'old-module-arrays' then '84f595c9-e601-412b-bf10-263284bbe81d'::uuid
      when v_case in (
        'removed-alias',
        'deadline-root-missing',
        'deadline-root-json-null',
        'deadline-dates-missing',
        'deadline-dates-json-null'
      ) then '752300fd-d5d1-4873-8ca4-62a19d0f04c2'::uuid
      else 'fbfaeb0f-a7f5-4ba0-a410-ca1f9b1dccbb'::uuid
    end;

    begin
      perform set_config('session_replication_role', 'replica', true);

      update public.posts
      set
        module = case when v_case = 'module-sql-null' then null else module end,
        category = case when v_case = 'category-sql-null' then null else category end,
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
          when 'deadline-root-missing' then metadata - 'deadline_date'
          when 'deadline-root-json-null' then jsonb_set(
            metadata,
            '{deadline_date}',
            'null'::jsonb,
            true
          )
          when 'deadline-dates-missing' then metadata #- '{dates,applicationDeadline}'
          when 'deadline-dates-json-null' then jsonb_set(
            metadata,
            '{dates,applicationDeadline}',
            'null'::jsonb,
            true
          )
          else metadata
        end
      where id = v_id;

      perform set_config('session_replication_role', 'origin', true);

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
      join pg_temp.kc_semantic_spec_snapshot_20260808 spec using (id)
      where p.id = v_id;

      perform pg_temp.kc_assert_semantic_post_states_20260808();
      raise exception using errcode = 'P0002', message = format('semantic matrix: drift case %s was accepted', v_case);
    exception
      when sqlstate 'KC001' then
        if sqlerrm <> v_expected_message then
          raise;
        end if;
    end;
  end loop;

  begin
    perform pg_temp.kc_semantic_rewrite_text_array_20260808(
      '"invalid"'::jsonb,
      array['source'],
      'target'
    );
    raise exception using errcode = 'P0002', message = 'semantic matrix: non-array tags were accepted';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'semantic post reclassification aborted: tags and tagKeys must be JSON arrays when present' then
        raise;
      end if;
  end;

  if exists (
    select 1
    from public.posts p
    join pg_temp.kc_semantic_target_snapshot_20260808 snapshot using (id)
    where to_jsonb(p) is distinct from snapshot.row_json
  ) then
    raise exception 'semantic matrix: a failed drift guard left residual writes';
  end if;

  perform pg_temp.kc_assert_semantic_post_states_20260808();
end;
$drift_guards$;

rollback;

\set ON_ERROR_STOP on

\if :{?kc_expected_state}
\else
\set kc_expected_state source
\endif

-- Production-safe proof: lock and snapshot the audited denominator, execute
-- the real migration, verify every protected surface, then roll everything
-- back. This file never commits or changes connections/replication role.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
lock table public.posts in share row exclusive mode;

create temporary table kc_category_label_proof_mode_20260808
on commit drop
as
select :'kc_expected_state'::text as expected_state;

create temporary table kc_category_label_production_before_20260808
on commit drop
as
select p.*
from public.posts p
where p.status = 'published';

do $initial_denominator$
declare
  v_rows bigint;
  v_expected_state text;
begin
  select expected_state
  into strict v_expected_state
  from pg_temp.kc_category_label_proof_mode_20260808;

  if v_expected_state not in ('source', 'target') then
    raise exception using
      errcode = 'KQ000',
      message = pg_catalog.format(
        'kc_expected_state must be source or target, received %s',
        v_expected_state
      );
  end if;

  select pg_catalog.count(*)
  into v_rows
  from pg_temp.kc_category_label_production_before_20260808;

  if (v_rows = 134) is not true then
    raise exception using
      errcode = 'KQ001',
      message = pg_catalog.format(
        'production proof requires the audited 134 published rows, found %s',
        v_rows
      );
  end if;
end;
$initial_denominator$;

\ir ../../supabase/migrations/20260808225424_canonical_category_label_reconciliation.sql

-- The standalone migration resets its session settings for reset-CLI
-- compatibility. Re-establish bounded waits for this proof's postconditions.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $production_postcondition$
declare
  v_spec_rows bigint;
  v_snapshot_spec_rows bigint;
  v_source_before bigint;
  v_target_before bigint;
  v_target_rows bigint;
  v_preserved_spec_rows bigint;
  v_timestamp_rows bigint;
  v_control_rows bigint;
  v_published_rows bigint;
  v_global_exact bigint;
  v_outside_registry bigint;
  v_expected_state text;
begin
  select expected_state
  into strict v_expected_state
  from pg_temp.kc_category_label_proof_mode_20260808;

  select pg_catalog.count(*)
  into v_spec_rows
  from pg_temp.kc_category_label_reconciliation_20260808;

  select pg_catalog.count(*)
  into v_snapshot_spec_rows
  from pg_temp.kc_category_label_production_before_20260808 snapshot
  join pg_temp.kc_category_label_reconciliation_20260808 spec
    on spec.id = snapshot.id
  where snapshot.module = spec.expected_module
    and snapshot.category = spec.expected_category
    and snapshot.status = spec.expected_status
    and snapshot.visibility = spec.expected_visibility
    and snapshot.price is not distinct from spec.expected_price
    and pg_catalog.jsonb_typeof(snapshot.metadata) = 'object';

  select
    pg_catalog.count(*) filter (
      where pg_temp.kc_category_surface_fingerprint_20260808(snapshot.metadata) =
        spec.source_touched_fingerprint
    ),
    pg_catalog.count(*) filter (
      where pg_temp.kc_category_surface_fingerprint_20260808(snapshot.metadata) =
        spec.target_touched_fingerprint
    )
  into v_source_before, v_target_before
  from pg_temp.kc_category_label_production_before_20260808 snapshot
  join pg_temp.kc_category_label_reconciliation_20260808 spec
    on spec.id = snapshot.id;

  select pg_catalog.count(*)
  into v_target_rows
  from public.posts p
  join pg_temp.kc_category_label_reconciliation_20260808 spec on spec.id = p.id
  where p.module = spec.expected_module
    and p.category = spec.expected_category
    and p.status = spec.expected_status
    and p.visibility = spec.expected_visibility
    and p.price is not distinct from spec.expected_price
    and pg_temp.kc_category_surface_fingerprint_20260808(p.metadata) =
      spec.target_touched_fingerprint;

  select pg_catalog.count(*)
  into v_preserved_spec_rows
  from public.posts p
  join pg_temp.kc_category_label_production_before_20260808 snapshot
    on snapshot.id = p.id
  join pg_temp.kc_category_label_reconciliation_20260808 spec
    on spec.id = p.id
  where pg_catalog.to_jsonb(p) - array['metadata','updated_at']::text[] =
      pg_catalog.to_jsonb(snapshot) - array['metadata','updated_at']::text[]
    and p.metadata - array[
      'category','categoryKey','categoriaKey',
      'categoryLabel','categoria','categoriaLabel'
    ]::text[] = snapshot.metadata - array[
      'category','categoryKey','categoriaKey',
      'categoryLabel','categoria','categoriaLabel'
    ]::text[];

  select pg_catalog.count(*)
  into v_timestamp_rows
  from public.posts p
  join pg_temp.kc_category_label_production_before_20260808 snapshot
    on snapshot.id = p.id
  join pg_temp.kc_category_label_reconciliation_20260808 spec
    on spec.id = p.id
  where (
      pg_temp.kc_category_surface_fingerprint_20260808(snapshot.metadata) =
        spec.source_touched_fingerprint
      and p.updated_at is distinct from snapshot.updated_at
    ) or (
      pg_temp.kc_category_surface_fingerprint_20260808(snapshot.metadata) =
        spec.target_touched_fingerprint
      and p.updated_at is not distinct from snapshot.updated_at
    );

  select pg_catalog.count(*)
  into v_control_rows
  from public.posts p
  join pg_temp.kc_category_label_production_before_20260808 snapshot
    on snapshot.id = p.id
  left join pg_temp.kc_category_label_reconciliation_20260808 spec
    on spec.id = p.id
  where spec.id is null
    and pg_catalog.to_jsonb(p) = pg_catalog.to_jsonb(snapshot);

  select pg_catalog.count(*)
  into v_published_rows
  from public.posts p
  where p.status = 'published';

  select
    pg_catalog.count(*) filter (
      where p.module = public.kc_feed_slug_key(p.module)
        and p.category = public.kc_feed_category_key(p.module, p.category)
        and public.kc_feed_category_label(p.module, p.category) is not null
        and pg_catalog.jsonb_typeof(p.metadata) = 'object'
        and pg_temp.kc_category_surface_fingerprint_20260808(p.metadata) =
          pg_temp.kc_expected_category_surface_20260808(
            p.category,
            public.kc_feed_category_label(p.module, p.category)
          )
    ),
    pg_catalog.count(*) filter (
      where public.kc_feed_category_label(p.module, p.category) is null
    )
  into v_global_exact, v_outside_registry
  from public.posts p
  where p.status = 'published';

  if (
    v_spec_rows = 87
    and v_snapshot_spec_rows = 87
    and (
      (v_expected_state = 'source' and v_source_before = 87 and v_target_before = 0)
      or
      (v_expected_state = 'target' and v_source_before = 0 and v_target_before = 87)
    )
    and v_target_rows = 87
    and v_preserved_spec_rows = 87
    and v_timestamp_rows = 87
    and v_control_rows = 47
    and v_published_rows = 134
    and v_global_exact = 134
    and v_outside_registry = 0
  ) is not true then
    raise exception using
      errcode = 'KQ002',
      message = pg_catalog.format(
        'production proof failed: mode=%s spec=%s snapshot=%s sources=%s prior_targets=%s targets=%s preserved=%s timestamps=%s controls=%s published=%s exact=%s outside=%s',
        v_expected_state,
        v_spec_rows,
        v_snapshot_spec_rows,
        v_source_before,
        v_target_before,
        v_target_rows,
        v_preserved_spec_rows,
        v_timestamp_rows,
        v_control_rows,
        v_published_rows,
        v_global_exact,
        v_outside_registry
      );
  end if;

  if (
    select pg_catalog.count(*)
    from pg_temp.kc_category_label_reconciliation_20260808
    where expected_price = 0
  ) <> 76
     or (
       select pg_catalog.count(*)
       from pg_temp.kc_category_label_reconciliation_20260808
       where expected_price is null
     ) <> 9
     or (
       select price
       from public.posts
       where id = '0ac23479-325c-428f-80d7-28431217bbde'::uuid
     ) <> 300
     or (
       select price
       from public.posts
       where id = '2569361d-d799-463c-88af-2fb0a7f6bb90'::uuid
     ) <> 13671.34 then
    raise exception using
      errcode = 'KQ003',
      message = 'production proof detected price distribution drift';
  end if;

  if not exists (
    select 1
    from public.posts p
    where p.id = '4b39baaf-996b-49ca-a603-b122066946dd'::uuid
      and p.module = 'oportunidades'
      and p.category = 'bolsas'
      and p.status = 'published'
      and p.visibility = 'public'
      and p.price = 0
      and p.metadata->>'category' = 'bolsas'
      and p.metadata->>'categoryKey' = 'bolsas'
      and p.metadata->>'categoriaKey' = 'bolsas'
      and p.metadata->>'categoryLabel' = 'Bolsas'
      and p.metadata->>'categoria' = 'Bolsas'
      and p.metadata->>'categoriaLabel' = 'Bolsas'
  ) then
    raise exception using
      errcode = 'KQ004',
      message = 'Passe Livre structural row did not reach its exact six-surface target';
  end if;

  perform pg_temp.kc_assert_category_label_triggers_20260808();
end;
$production_postcondition$;

rollback;

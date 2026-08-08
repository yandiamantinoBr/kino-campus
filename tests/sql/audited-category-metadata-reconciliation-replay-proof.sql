\set ON_ERROR_STOP on

-- Local-only proof. The dedicated runner resolves the local Supabase Docker
-- container, requires an empty posts table and verifies rollback afterward.
begin;

do $guard$
declare
  v_posts bigint;
  v_enabled_triggers bigint;
begin
  select pg_catalog.count(*) into v_posts from public.posts;
  if (v_posts = 0) is not true then
    raise exception using
      errcode = 'P8510',
      message = pg_catalog.format(
        'category metadata reconciliation proof requires an empty local posts table, found %s rows',
        v_posts
      );
  end if;

  if (
    pg_catalog.current_setting('session_replication_role') = 'origin'
  ) is not true then
    raise exception using
      errcode = 'P8511',
      message = 'category metadata reconciliation proof requires origin trigger mode';
  end if;

  select pg_catalog.count(*)
  into v_enabled_triggers
  from pg_catalog.pg_trigger
  where tgrelid = 'public.posts'::regclass
    and tgname in (
      'kc_posts_set_updated_at',
      'trg_posts_canonicalize_feed_fields'
    )
    and tgenabled = 'O';

  if (v_enabled_triggers = 2) is not true then
    raise exception using
      errcode = 'P8512',
      message = pg_catalog.format(
        'category metadata reconciliation proof requires both update triggers enabled, found %s',
        v_enabled_triggers
      );
  end if;
end;
$guard$;

create temporary table kc_reconciliation_trigger_snapshot_20260808 as
select tgname, tgenabled
from pg_catalog.pg_trigger
where tgrelid = 'public.posts'::regclass
  and tgname in (
    'kc_posts_set_updated_at',
    'trg_posts_canonicalize_feed_fields'
  );

-- Empty reset/preview replay is a no-op.
\ir ../../supabase/migrations/20260808152850_audited_category_metadata_reconciliation.sql

-- The source metadata intentionally predates the canonicalization trigger.
-- Use session-local replica mode instead of globally disabling table triggers.
set local session_replication_role = replica;
insert into public.posts (
  id,
  title,
  module,
  category,
  status,
  visibility,
  price,
  created_at,
  updated_at,
  metadata
)
values
  (
    '2c139f6c-8d05-43f6-b242-85980428e0d7'::uuid,
    'audited category metadata reconciliation fixture',
    'oportunidades',
    'bolsas',
    'published',
    'public',
    0,
    '2026-08-01T00:00:00Z'::timestamptz,
    '2026-08-01T00:00:00Z'::timestamptz,
    '{"categoryKey":"pesquisa","categoriaKey":"pesquisa","categoryLabel":"Pesquisa","categoria":"Pesquisa"}'::jsonb
  ),
  (
    'ce24a542-294c-4048-b0ea-2f2b4a435fe2'::uuid,
    'audited category metadata reconciliation fixture two',
    'eventos',
    'congressos',
    'published',
    'public',
    0,
    '2026-08-01T00:00:00Z'::timestamptz,
    '2026-08-01T00:00:00Z'::timestamptz,
    '{"categoryKey":"academicos","categoriaKey":"academicos","categoryLabel":"Academicos","categoria":"Academicos"}'::jsonb
  );
set local session_replication_role = origin;

create temporary table kc_reconciliation_source_snapshot_20260808 as
select id, visibility, price, updated_at, metadata
from public.posts
where id in (
  '2c139f6c-8d05-43f6-b242-85980428e0d7'::uuid,
  'ce24a542-294c-4048-b0ea-2f2b4a435fe2'::uuid
);

\ir ../../supabase/migrations/20260808152850_audited_category_metadata_reconciliation.sql

do $target_assertion$
declare
  v_target_rows bigint;
  v_preserved_prices bigint;
  v_advanced_timestamps bigint;
  v_preserved_triggers bigint;
begin
  select pg_catalog.count(*)
  into v_target_rows
  from public.posts
  where (
    id = '2c139f6c-8d05-43f6-b242-85980428e0d7'::uuid
    and module = 'oportunidades'
    and category = 'bolsas'
    and status = 'published'
    and visibility = 'public'
    and metadata->>'category' = 'bolsas'
    and metadata->>'categoryKey' = 'bolsas'
    and metadata->>'categoriaKey' = 'bolsas'
    and metadata->>'categoryLabel' = 'Bolsas'
    and metadata->>'categoria' = 'Bolsas'
    and metadata->>'categoriaLabel' = 'Bolsas'
  ) or (
    id = 'ce24a542-294c-4048-b0ea-2f2b4a435fe2'::uuid
    and module = 'eventos'
    and category = 'congressos'
    and status = 'published'
    and visibility = 'public'
    and metadata->>'category' = 'congressos'
    and metadata->>'categoryKey' = 'congressos'
    and metadata->>'categoriaKey' = 'congressos'
    and metadata->>'categoryLabel' = 'Congressos'
    and metadata->>'categoria' = 'Congressos'
    and metadata->>'categoriaLabel' = 'Congressos'
  );

  if (v_target_rows = 2) is not true then
    raise exception using
      errcode = 'P8520',
      message = 'category metadata reconciliation complete audited set did not reach the target';
  end if;

  select pg_catalog.count(*)
  into v_preserved_prices
  from public.posts p
  join pg_temp.kc_reconciliation_source_snapshot_20260808 snapshot
    on snapshot.id = p.id
  where p.price is not distinct from snapshot.price
    and p.visibility is not distinct from snapshot.visibility;

  if (v_preserved_prices = 2) is not true then
    raise exception using
      errcode = 'P8521',
      message = 'category metadata reconciliation changed price or visibility';
  end if;

  select pg_catalog.count(*)
  into v_advanced_timestamps
  from public.posts p
  join pg_temp.kc_reconciliation_source_snapshot_20260808 snapshot
    on snapshot.id = p.id
  where p.updated_at > snapshot.updated_at;

  if (v_advanced_timestamps = 2) is not true then
    raise exception using
      errcode = 'P8522',
      message = 'category metadata reconciliation did not fire updated_at for both source rows';
  end if;

  select pg_catalog.count(*)
  into v_preserved_triggers
  from pg_catalog.pg_trigger trigger_row
  join pg_temp.kc_reconciliation_trigger_snapshot_20260808 snapshot
    on snapshot.tgname = trigger_row.tgname
   and snapshot.tgenabled = trigger_row.tgenabled
  where trigger_row.tgrelid = 'public.posts'::regclass;

  if (v_preserved_triggers = 2) is not true then
    raise exception using
      errcode = 'P8523',
      message = 'category metadata reconciliation changed posts trigger state';
  end if;
end;
$target_assertion$;

create temporary table kc_reconciliation_target_snapshot_20260808 as
select id, visibility, price, updated_at, metadata
from public.posts
where id in (
  '2c139f6c-8d05-43f6-b242-85980428e0d7'::uuid,
  'ce24a542-294c-4048-b0ea-2f2b4a435fe2'::uuid
);

\ir ../../supabase/migrations/20260808152850_audited_category_metadata_reconciliation.sql

do $rerun_assertion$
declare
  v_unchanged_rows bigint;
begin
  select pg_catalog.count(*)
  into v_unchanged_rows
  from public.posts p
  join pg_temp.kc_reconciliation_target_snapshot_20260808 snapshot
    on snapshot.id = p.id
  where p.visibility is not distinct from snapshot.visibility
    and p.price is not distinct from snapshot.price
    and p.updated_at is not distinct from snapshot.updated_at
    and p.metadata is not distinct from snapshot.metadata;

  if (v_unchanged_rows = 2) is not true then
    raise exception using
      errcode = 'P8530',
      message = 'category metadata reconciliation idempotent rerun changed the target';
  end if;
end;
$rerun_assertion$;

-- Recreate a third state without globally disabling triggers. The assertion
-- catches only the migration's dedicated unexpected-state SQLSTATE and exact
-- message; an unrelated error cannot make this proof pass.
set local session_replication_role = replica;
update public.posts
set metadata = jsonb_set(metadata, '{categoryKey}', '"drifted"'::jsonb, true)
where id = '2c139f6c-8d05-43f6-b242-85980428e0d7'::uuid;
set local session_replication_role = origin;

do $drift_assertion$
declare
  v_message text;
begin
  begin
    perform pg_temp.kc_run_category_metadata_reconciliation_20260808();
    raise exception using
      errcode = 'P8599',
      message = 'category metadata reconciliation drifted source state was accepted';
  exception
    when sqlstate 'P8503' then
      get stacked diagnostics v_message = message_text;
      if v_message is distinct from
        'category metadata reconciliation aborted: unexpected state for post 2c139f6c-8d05-43f6-b242-85980428e0d7'
      then
        raise exception using
          errcode = 'P8598',
          message = pg_catalog.format(
            'category metadata reconciliation returned an unexpected drift error: %s',
            v_message
          );
      end if;
  end;
end;
$drift_assertion$;

do $no_partial_write_assertion$
begin
  if (
    select pg_catalog.count(*) = 1
    from public.posts p
    join pg_temp.kc_reconciliation_target_snapshot_20260808 snapshot
      on snapshot.id = p.id
    where p.id = 'ce24a542-294c-4048-b0ea-2f2b4a435fe2'::uuid
      and p.visibility is not distinct from snapshot.visibility
      and p.price is not distinct from snapshot.price
      and p.updated_at is not distinct from snapshot.updated_at
      and p.metadata is not distinct from snapshot.metadata
  ) is not true then
    raise exception using
      errcode = 'P8540',
      message = 'category metadata reconciliation wrote another row before rejecting drift';
  end if;
end;
$no_partial_write_assertion$;

rollback;

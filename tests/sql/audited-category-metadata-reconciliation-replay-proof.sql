\set ON_ERROR_STOP on

-- Isolated proof. It uses the two audited production UUIDs only inside a
-- transaction that is always rolled back.
begin;

do $guard$
begin
  if exists (
    select 1
    from public.posts
    where id in (
      '2c139f6c-8d05-43f6-b242-85980428e0d7'::uuid,
      'ce24a542-294c-4048-b0ea-2f2b4a435fe2'::uuid
    )
  ) then
    raise exception 'category metadata reconciliation proof requires an isolated database';
  end if;
end;
$guard$;

-- Missing production UUIDs are a safe no-op.
\ir ../../supabase/migrations/20260808152850_audited_category_metadata_reconciliation.sql

alter table public.posts disable trigger user;
insert into public.posts (id, title, module, category, status, visibility, metadata)
values
  (
    '2c139f6c-8d05-43f6-b242-85980428e0d7'::uuid,
    'audited category metadata reconciliation fixture',
    'oportunidades',
    'bolsas',
    'published',
    'public',
    '{"categoryKey":"pesquisa","categoriaKey":"pesquisa","categoryLabel":"Pesquisa","categoria":"Pesquisa"}'::jsonb
  ),
  (
    'ce24a542-294c-4048-b0ea-2f2b4a435fe2'::uuid,
    'audited category metadata reconciliation fixture two',
    'eventos',
    'congressos',
    'published',
    'public',
    '{"categoryKey":"academicos","categoriaKey":"academicos","categoryLabel":"Academicos","categoria":"Academicos"}'::jsonb
  );
alter table public.posts enable trigger user;

\ir ../../supabase/migrations/20260808152850_audited_category_metadata_reconciliation.sql

do $target_assertion$
begin
  if (select count(*)
      from public.posts
      where (
        id = '2c139f6c-8d05-43f6-b242-85980428e0d7'::uuid
        and module = 'oportunidades'
        and category = 'bolsas'
        and status = 'published'
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
        and metadata->>'category' = 'congressos'
        and metadata->>'categoryKey' = 'congressos'
        and metadata->>'categoriaKey' = 'congressos'
        and metadata->>'categoryLabel' = 'Congressos'
        and metadata->>'categoria' = 'Congressos'
        and metadata->>'categoriaLabel' = 'Congressos'
      )) <> 2 then
    raise exception 'category metadata reconciliation complete audited set did not reach the target';
  end if;

  if not exists (
    select 1
    from public.posts
    where id = '2c139f6c-8d05-43f6-b242-85980428e0d7'::uuid
      and module = 'oportunidades'
      and category = 'bolsas'
      and status = 'published'
      and metadata->>'category' = 'bolsas'
      and metadata->>'categoryKey' = 'bolsas'
      and metadata->>'categoriaKey' = 'bolsas'
      and metadata->>'categoryLabel' = 'Bolsas'
      and metadata->>'categoria' = 'Bolsas'
      and metadata->>'categoriaLabel' = 'Bolsas'
  ) then
    raise exception 'category metadata reconciliation first audited row did not reach the target';
  end if;
end;
$target_assertion$;

create temporary table kc_reconciliation_target_snapshot_20260808 as
select id, metadata
from public.posts
where id in (
  '2c139f6c-8d05-43f6-b242-85980428e0d7'::uuid,
  'ce24a542-294c-4048-b0ea-2f2b4a435fe2'::uuid
);

\ir ../../supabase/migrations/20260808152850_audited_category_metadata_reconciliation.sql

do $rerun_assertion$
begin
  if (select count(*)
    from public.posts p
    join pg_temp.kc_reconciliation_target_snapshot_20260808 snapshot on snapshot.id = p.id
    where p.id in (
        '2c139f6c-8d05-43f6-b242-85980428e0d7'::uuid,
        'ce24a542-294c-4048-b0ea-2f2b4a435fe2'::uuid
      )
      and p.metadata is not distinct from snapshot.metadata
  ) <> 2 then
    raise exception 'category metadata reconciliation idempotent rerun changed the target';
  end if;
end;
$rerun_assertion$;

-- Recreate a third state and exercise the reusable preflight assertion.
alter table public.posts disable trigger user;
update public.posts
set metadata = jsonb_set(metadata, '{categoryKey}', '"drifted"'::jsonb, true)
where id = '2c139f6c-8d05-43f6-b242-85980428e0d7'::uuid;
alter table public.posts enable trigger user;

do $drift_assertion$
declare
  v_rejected boolean := false;
begin
  begin
    perform pg_temp.kc_run_category_metadata_reconciliation_20260808();
  exception when raise_exception then
    v_rejected := true;
  end;

  if not v_rejected then
    raise exception 'category metadata reconciliation drifted source state was accepted';
  end if;
end;
$drift_assertion$;

rollback;

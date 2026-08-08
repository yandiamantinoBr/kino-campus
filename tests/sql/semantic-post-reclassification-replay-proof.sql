\set ON_ERROR_STOP on

-- Isolated replay proof for reset/preview databases. This intentionally uses
-- one audited UUID as a synthetic subset fixture, always inside a rollback.
begin;

create temporary table kc_semantic_replay_ids_20260808 (id uuid primary key) on commit drop;
insert into pg_temp.kc_semantic_replay_ids_20260808 (id)
values
  ('fbfaeb0f-a7f5-4ba0-a410-ca1f9b1dccbb'::uuid),
  ('19f52e45-7942-474a-9076-015be4e2af48'::uuid),
  ('6b92fc98-312b-423a-b309-b90d2e7592d2'::uuid),
  ('2b150e53-dc80-459a-93e5-1ae2bc918adc'::uuid),
  ('150cadb3-1821-4b39-893b-93deac7b06b6'::uuid),
  ('752300fd-d5d1-4873-8ca4-62a19d0f04c2'::uuid),
  ('a8a3f0e5-c461-4a2b-bf94-2a1c5e2d7e39'::uuid),
  ('3b3f1ae3-f0ee-41f3-9a33-3e6193464016'::uuid),
  ('6ce3f580-960f-4138-837f-bac6df0a9498'::uuid),
  ('b0c85d6b-1289-48b1-9248-ea6c8081fbf2'::uuid),
  ('ac5714e1-eb5e-4d30-984e-0244ee1b05e0'::uuid),
  ('bcbee373-c92b-4cc2-a290-9f0ab81518e2'::uuid),
  ('944a8198-4823-4661-afcb-1a6faef1259c'::uuid),
  ('176fc9f3-052d-44f1-a251-afd895bfc1a7'::uuid),
  ('d8715365-d49c-4bb7-b331-5faa4f1cc458'::uuid),
  ('e02fc2b9-12b4-458d-a8dc-95b9c0510b49'::uuid),
  ('ebeaf871-371c-4f9b-8169-824e2da86ba3'::uuid),
  ('899359eb-b411-4b1f-95c4-234e88c49041'::uuid),
  ('0f601a58-f4a0-46a7-9810-a28b5564e67c'::uuid),
  ('7038c22d-fe66-49f6-a2a2-ec086f4f9a20'::uuid),
  ('ba140334-470b-4655-a9c1-994ba64e4c28'::uuid),
  ('a59449cb-ca81-4545-a147-32a6dbd2c852'::uuid),
  ('5c601845-a26e-46d5-94c0-ba67a50e3ccd'::uuid),
  ('a246c601-e693-4d7b-a07b-99e0cb617616'::uuid),
  ('09460066-0e96-45b9-81b4-7ff2e564c6aa'::uuid),
  ('495b4856-d68a-49bc-89a4-79a16c2c3a7f'::uuid),
  ('cb2ce3c1-df2c-43ec-a75d-f251ea61473a'::uuid),
  ('2764dfda-1cf3-4aa1-b255-49248415c9e2'::uuid),
  ('b9b214e9-30a2-4a83-8037-e17ca2b8c5d1'::uuid),
  ('14c43a7f-395c-4ee0-8d11-9ddf76667586'::uuid),
  ('84f595c9-e601-412b-bf10-263284bbe81d'::uuid),
  ('e9a826be-a1e3-43eb-aece-85742c10e255'::uuid),
  ('f75602ca-76a2-4cea-b368-3e45cc995816'::uuid),
  ('b6fff52c-93ad-4579-8a9d-86a8d9d1dea4'::uuid),
  ('31715ae7-9cd9-4fda-adb2-6541da6fec64'::uuid),
  ('953bb526-e5f5-4e36-a59c-7b102e344518'::uuid),
  ('50a3e363-76ed-4bc6-b8fd-ab4b79faa857'::uuid),
  ('1917e659-5151-4650-bfa2-6ec20fd5e81b'::uuid),
  ('a8a66d60-0a03-4606-907a-15e48f9f687b'::uuid),
  ('3ae523bb-c15b-4d36-a494-1ca43ae95aa3'::uuid),
  ('ebb3c886-ac26-4022-bf9e-f3ce31d9fbbe'::uuid),
  ('c848f243-077b-4dc8-bf52-86572af7f5fb'::uuid),
  ('577ea0ba-a7ad-4f01-8a05-fbd0a4b4fbe4'::uuid),
  ('fffdc11c-2855-4a8d-9cb2-c10cad863888'::uuid),
  ('498e0054-31f1-458b-8953-3179decdd033'::uuid),
  ('ca10120d-7e9b-42f7-971a-db9861540a5b'::uuid),
  ('080f8237-a8fe-4200-b53a-946b7ea934a3'::uuid),
  ('858c8b0b-007b-402d-a7e8-0ad1d753d87e'::uuid),
  ('4bc906fb-0f5f-463e-bcbd-26c6329a995e'::uuid);

do $empty_guard$
begin
  if exists (
    select 1
    from public.posts p
    join pg_temp.kc_semantic_replay_ids_20260808 ids on ids.id = p.id
  ) then
    raise exception 'semantic replay proof requires an isolated database without the 49 production UUIDs';
  end if;
end;
$empty_guard$;

-- All 49 UUIDs are absent: migration must be a no-op, not a deployment error.
\ir ../../supabase/migrations/20260808140000_semantic_post_reclassification.sql

do $empty_assertion$
begin
  if exists (
    select 1
    from public.posts p
    join pg_temp.kc_semantic_replay_ids_20260808 ids on ids.id = p.id
  ) then
    raise exception 'semantic replay proof failed: empty replay unexpectedly created production posts';
  end if;
end;
$empty_assertion$;

alter table public.posts disable trigger user;
insert into public.posts (id, title, module, category, status, visibility, metadata)
values (
  'fbfaeb0f-a7f5-4ba0-a410-ca1f9b1dccbb'::uuid,
  'semantic replay subset fixture',
  'eventos',
  'academicos',
  'published',
  'public',
  '{"categoryKey":"academicos","categoriaKey":"academicos"}'::jsonb
);
alter table public.posts enable trigger user;

-- One source row exists and 48 are absent: only the subset row is repaired.
\ir ../../supabase/migrations/20260808140000_semantic_post_reclassification.sql

do $subset_assertion$
begin
  if not exists (
    select 1
    from public.posts p
    where p.id = 'fbfaeb0f-a7f5-4ba0-a410-ca1f9b1dccbb'::uuid
      and p.module = 'eventos'
      and p.category = 'congressos'
      and p.status = 'published'
      and p.metadata->>'category' = 'congressos'
      and p.metadata->>'categoryKey' = 'congressos'
      and p.metadata->>'categoriaKey' = 'congressos'
      and p.metadata->>'module' = 'eventos'
  ) then
    raise exception 'semantic replay proof failed: subset replay did not reach the complete target';
  end if;
end;
$subset_assertion$;

create temporary table kc_semantic_subset_snapshot_20260808 on commit drop as
select module, category, status, metadata
from public.posts
where id = 'fbfaeb0f-a7f5-4ba0-a410-ca1f9b1dccbb'::uuid;

-- Complete target plus 48 absent rows: rerun must be a fixed point.
\ir ../../supabase/migrations/20260808140000_semantic_post_reclassification.sql

do $idempotency_assertion$
begin
  if exists (
    select 1
    from public.posts p
    cross join pg_temp.kc_semantic_subset_snapshot_20260808 snapshot
    where p.id = 'fbfaeb0f-a7f5-4ba0-a410-ca1f9b1dccbb'::uuid
      and (
        p.module is distinct from snapshot.module
        or p.category is distinct from snapshot.category
        or p.status is distinct from snapshot.status
        or p.metadata is distinct from snapshot.metadata
      )
  ) then
    raise exception 'semantic replay proof failed: subset replay changed the complete target';
  end if;
end;
$idempotency_assertion$;

-- Same audited source triple, but one touched key has drifted: fail closed.
do $drift_assertion$
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
      message = 'semantic replay proof failed: subset touched-field drift was accepted';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like 'semantic post reclassification aborted: unexpected state%' then
        raise;
      end if;
  end;

  perform pg_temp.kc_assert_semantic_post_states_20260808();
end;
$drift_assertion$;

rollback;

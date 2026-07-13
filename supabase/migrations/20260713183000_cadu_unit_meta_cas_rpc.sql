-- Transactional compare-and-swap boundary for Cadu source metadata.
--
-- Phase A of the rollout keeps direct service_role table privileges solely so
-- the currently deployed Cadu API remains compatible until it switches both
-- stable and legacy writes to these RPCs. Browser JWT roles lose direct write
-- access now. Phase B must first move the implementation behind a narrowly
-- granted private SECURITY DEFINER boundary (or a dedicated writer role),
-- then revoke service_role table DML after the RPC-only release is verified.
-- Revoking DML while these public wrappers remain SECURITY INVOKER would also
-- break the RPCs and is therefore explicitly not a valid standalone change.

begin;

alter table public.kc_unit_meta
  add column if not exists revision bigint not null default 1;

do $constraint$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.kc_unit_meta'::regclass
      and conname = 'kc_unit_meta_revision_positive'
  ) then
    alter table public.kc_unit_meta
      add constraint kc_unit_meta_revision_positive check (revision > 0);
  end if;
end
$constraint$;

create or replace function public.kc_unit_meta_touch()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
  else
    new.revision := old.revision + 1;
  end if;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

drop trigger if exists kc_unit_meta_touch on public.kc_unit_meta;
create trigger kc_unit_meta_touch
  before insert or update on public.kc_unit_meta
  for each row execute function public.kc_unit_meta_touch();

create or replace function public.kc_cadu_upsert_source_override(
  p_source_id text,
  p_tier integer,
  p_note text,
  p_expected_exists boolean,
  p_expected_revision bigint,
  p_expected_meta_revisions jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_source_id text := pg_catalog.btrim(coalesce(p_source_id, ''));
  v_row public.kc_unit_meta%rowtype;
  v_created boolean;
  v_meta_revisions jsonb;
begin
  if v_source_id !~ '^(web|ig)\.[a-z0-9][a-z0-9._-]{0,190}$' then
    raise exception using errcode = '22023', message = 'INVALID_SOURCE_ID';
  end if;
  if p_tier is not null and p_tier not between 1 and 3 then
    raise exception using errcode = '22023', message = 'INVALID_TIER';
  end if;
  if p_note is not null and (
    pg_catalog.char_length(p_note) > 500
    or p_note ~ E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_NOTE';
  end if;
  if p_expected_exists is null
     or (p_expected_exists and (p_expected_revision is null or p_expected_revision < 1))
     or (not p_expected_exists and p_expected_revision is not null)
     or (p_expected_exists and p_expected_meta_revisions is not null)
     or (
       not p_expected_exists
       and pg_catalog.jsonb_typeof(p_expected_meta_revisions) is distinct from 'object'
     ) then
    raise exception using errcode = '22023', message = 'INVALID_EXPECTED_STATE';
  end if;

  -- Stable and resolved-legacy writes use the same lock subject. Each RPC
  -- acquires exactly one transaction lock before any row lock or DML.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'kino-campus:cadu-source:v1:' || v_source_id,
      20260713::bigint
    )
  );

  if p_expected_exists then
    update public.kc_unit_meta as meta
       set tier = p_tier::smallint,
           note = p_note,
           updated_by = null,
           source = 'cadu-api-v2'
     where meta.unit_id = v_source_id
       and meta.revision = p_expected_revision
    returning meta.* into v_row;
    if not found then
      raise sqlstate 'PT412' using
        message = 'SOURCE_OVERRIDE_PRECONDITION_FAILED',
        detail = 'The stable override is absent or its revision changed.',
        hint = 'Reload the source registry and retry with the latest ETag.';
    end if;
    v_created := false;
  else
    -- A first stable write shadows every legacy row resolved to this source.
    -- Compare the complete revision map observed by the API while holding the
    -- source lock so a legacy writer that won the lock cannot be overwritten
    -- by a stale projection. Unrelated changes may conservatively cause 412.
    select coalesce(
      pg_catalog.jsonb_object_agg(meta.unit_id, meta.revision),
      '{}'::jsonb
    )
      into v_meta_revisions
      from public.kc_unit_meta as meta;
    if v_meta_revisions is distinct from p_expected_meta_revisions then
      raise sqlstate 'PT412' using
        message = 'SOURCE_OVERRIDE_PRECONDITION_FAILED',
        detail = 'The metadata revision snapshot changed before stable creation.',
        hint = 'Reload the source registry and retry with the latest ETag.';
    end if;

    insert into public.kc_unit_meta as meta
      (unit_id, tier, note, updated_by, source)
    values
      (v_source_id, p_tier::smallint, p_note, null, 'cadu-api-v2')
    on conflict (unit_id) do nothing
    returning meta.* into v_row;
    if not found then
      raise sqlstate 'PT412' using
        message = 'SOURCE_OVERRIDE_PRECONDITION_FAILED',
        detail = 'The stable override already exists.',
        hint = 'Reload the source registry and retry with the latest ETag.';
    end if;
    v_created := true;
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'created', v_created,
    'sourceId', v_row.unit_id,
    'tier', v_row.tier,
    'note', v_row.note,
    'revision', v_row.revision,
    'updatedAt', v_row.updated_at,
    'source', v_row.source
  );
end;
$$;

create or replace function public.kc_cadu_upsert_legacy_override(
  p_unit_id text,
  p_resolved_source_id text,
  p_tier integer,
  p_note text,
  p_expected_exists boolean,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_unit_id text := pg_catalog.btrim(coalesce(p_unit_id, ''));
  v_source_id text := case
    when p_resolved_source_id is null then null
    else pg_catalog.btrim(p_resolved_source_id)
  end;
  v_lock_subject text;
  v_row public.kc_unit_meta%rowtype;
  v_created boolean;
begin
  if v_unit_id = ''
     or pg_catalog.char_length(v_unit_id) > 500
     or v_unit_id ~ '[[:cntrl:]]'
     or v_unit_id ~* '^(web|ig)\.' then
    raise exception using errcode = '22023', message = 'INVALID_LEGACY_UNIT_ID';
  end if;
  if v_source_id is not null
     and v_source_id !~ '^(web|ig)\.[a-z0-9][a-z0-9._-]{0,190}$' then
    raise exception using errcode = '22023', message = 'INVALID_RESOLVED_SOURCE_ID';
  end if;
  if p_tier is not null and p_tier not between 1 and 3 then
    raise exception using errcode = '22023', message = 'INVALID_TIER';
  end if;
  if p_note is not null and (
    pg_catalog.char_length(p_note) > 500
    or p_note ~ E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_NOTE';
  end if;
  if p_expected_exists is null
     or (p_expected_exists and (p_expected_revision is null or p_expected_revision < 1))
     or (not p_expected_exists and p_expected_revision is not null) then
    raise exception using errcode = '22023', message = 'INVALID_EXPECTED_STATE';
  end if;

  v_lock_subject := case
    when v_source_id is not null
      then 'kino-campus:cadu-source:v1:' || v_source_id
    else 'kino-campus:cadu-legacy:v1:' || v_unit_id
  end;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_lock_subject, 20260713::bigint)
  );

  -- A stable tombstone still shadows the legacy identity. This check runs
  -- inside the same critical section used by stable creation.
  if v_source_id is not null
     and exists (
       select 1
       from public.kc_unit_meta as stable
       where stable.unit_id = v_source_id
     ) then
    raise sqlstate 'PT409' using
      message = 'LEGACY_OVERRIDE_SHADOWED_BY_STABLE_SOURCE',
      detail = 'A stable override exists for the resolved source id.',
      hint = 'Write through the stable source endpoint instead.';
  end if;

  if p_expected_exists then
    update public.kc_unit_meta as meta
       set tier = p_tier::smallint,
           note = p_note,
           updated_by = null,
           source = 'cadu-api-legacy-v2'
     where meta.unit_id = v_unit_id
       and meta.revision = p_expected_revision
    returning meta.* into v_row;
    if not found then
      raise sqlstate 'PT412' using
        message = 'LEGACY_OVERRIDE_PRECONDITION_FAILED',
        detail = 'The legacy override is absent or its revision changed.',
        hint = 'Reload the sites metadata and retry with the latest ETag.';
    end if;
    v_created := false;
  else
    insert into public.kc_unit_meta as meta
      (unit_id, tier, note, updated_by, source)
    values
      (v_unit_id, p_tier::smallint, p_note, null, 'cadu-api-legacy-v2')
    on conflict (unit_id) do nothing
    returning meta.* into v_row;
    if not found then
      raise sqlstate 'PT412' using
        message = 'LEGACY_OVERRIDE_PRECONDITION_FAILED',
        detail = 'The legacy override already exists.',
        hint = 'Reload the sites metadata and retry with the latest ETag.';
    end if;
    v_created := true;
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'created', v_created,
    'unitId', v_row.unit_id,
    'resolvedSourceId', v_source_id,
    'tier', v_row.tier,
    'note', v_row.note,
    'revision', v_row.revision,
    'updatedAt', v_row.updated_at,
    'source', v_row.source
  );
end;
$$;

-- Browser JWTs use the authenticated Cadu proxy and no longer write this
-- table directly. The single public read policy remains for compatibility.
drop policy if exists kc_unit_meta_insert_admin on public.kc_unit_meta;
drop policy if exists kc_unit_meta_update_admin on public.kc_unit_meta;
drop policy if exists kc_unit_meta_delete_admin on public.kc_unit_meta;

revoke all on table public.kc_unit_meta from public, anon, authenticated, service_role;
revoke insert (unit_id, tier, note, updated_at, updated_by, source, revision),
       update (unit_id, tier, note, updated_at, updated_by, source, revision)
  on public.kc_unit_meta from anon, authenticated;
grant select on public.kc_unit_meta to anon, authenticated;

-- Transitional direct DML for the old server-side Cadu release only. Browser
-- roles cannot inherit it. DELETE/TRUNCATE/REFERENCES/TRIGGER remain revoked.
-- Phase B replaces the invoker implementation before it removes these grants;
-- the two changes must ship atomically with rollback.
grant select, insert, update on table public.kc_unit_meta to service_role;

revoke all on function public.kc_cadu_upsert_source_override(text, integer, text, boolean, bigint, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_cadu_upsert_source_override(text, integer, text, boolean, bigint, jsonb)
  to service_role;

revoke all on function public.kc_cadu_upsert_legacy_override(text, text, integer, text, boolean, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_cadu_upsert_legacy_override(text, text, integer, text, boolean, bigint)
  to service_role;

comment on column public.kc_unit_meta.revision is
  'Database-managed monotonic CAS revision for Cadu metadata writes.';
comment on function public.kc_cadu_upsert_source_override(text, integer, text, boolean, bigint, jsonb) is
  'Atomic service-role-only CAS create/update of a stable Cadu source override.';
comment on function public.kc_cadu_upsert_legacy_override(text, text, integer, text, boolean, bigint) is
  'Atomic service-role-only CAS write for a legacy Cadu identity, serialized with its stable source.';

notify pgrst, 'reload schema';

commit;

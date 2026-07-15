-- Keep the stable-source ETag and the transactional metadata boundary aligned.
--
-- The source projection includes legacy-collision state.  The original Phase A
-- RPC compared the metadata revision snapshot only while creating a stable row;
-- an update could therefore commit after a concurrent legacy insert/removal and
-- return a representation different from the If-Match the caller validated.

begin;

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
     or pg_catalog.jsonb_typeof(p_expected_meta_revisions) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'INVALID_EXPECTED_STATE';
  end if;

  -- Stable and resolved-legacy writes share this source-scoped lock.  Compare
  -- all other observed revisions while the lock is held.  Excluding the stable
  -- row itself avoids duplicating p_expected_revision while still detecting any
  -- insertion, update or removal that can alter collision/deferred projection.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'kino-campus:cadu-source:v1:' || v_source_id,
      20260713::bigint
    )
  );

  select coalesce(
    pg_catalog.jsonb_object_agg(meta.unit_id, meta.revision),
    '{}'::jsonb
  )
    into v_meta_revisions
    from public.kc_unit_meta as meta
   where meta.unit_id <> v_source_id;

  if v_meta_revisions is distinct from p_expected_meta_revisions then
    raise sqlstate 'PT412' using
      message = 'SOURCE_OVERRIDE_PRECONDITION_FAILED',
      detail = 'The metadata revision snapshot changed before the stable write.',
      hint = 'Reload the source registry and retry with the latest ETag.';
  end if;

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

revoke all on function public.kc_cadu_upsert_source_override(text, integer, text, boolean, bigint, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_cadu_upsert_source_override(text, integer, text, boolean, bigint, jsonb)
  to service_role;

comment on function public.kc_cadu_upsert_source_override(text, integer, text, boolean, bigint, jsonb) is
  'Atomic service-role-only CAS write of a stable Cadu override, including the observed collision revision snapshot.';

notify pgrst, 'reload schema';

commit;

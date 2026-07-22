-- Expand phase: add a source-metadata snapshot CAS to review resolution.
--
-- Keep the five-argument v1 overload temporarily so the currently deployed
-- cadu-api remains available while the v2 caller rolls out. A later contract
-- migration removes v1 after production has switched to this six-argument
-- boundary.

begin;

create or replace function public.kc_resolve_institutional_source_review(
  p_review_id uuid,
  p_expected_source_revision text,
  p_decision text,
  p_resolution_note text,
  p_resolved_by uuid,
  p_expected_meta_revisions jsonb
)
returns table (
  id uuid,
  source_id text,
  source_revision text,
  state text,
  resolved_by uuid,
  resolved_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id text;
  v_meta_revisions jsonb;
  v_review public.cadu_institutional_source_reviews%rowtype;
begin
  if p_resolved_by is null or not public.kc_is_admin(p_resolved_by) then
    raise exception 'cadu_review_resolver_is_not_admin' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected', 'superseded') then
    raise exception 'cadu_review_resolution_is_invalid' using errcode = '22023';
  end if;
  if p_resolution_note is not null and (
    pg_catalog.length(p_resolution_note) > 1000
    or p_resolution_note ~ E'[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
  ) then
    raise exception 'cadu_review_resolution_note_is_invalid' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(p_expected_meta_revisions) is distinct from 'object'
     or exists (
       select 1
       from pg_catalog.jsonb_each(p_expected_meta_revisions) as expected(unit_id, revision)
       where expected.unit_id = ''
          or pg_catalog.jsonb_typeof(expected.revision) is distinct from 'number'
          or expected.revision::text !~ '^[1-9][0-9]*$'
     ) then
    raise exception 'cadu_review_expected_metadata_is_invalid' using errcode = '22023';
  end if;

  select review.source_id
    into v_source_id
    from public.cadu_institutional_source_reviews as review
   where review.id = p_review_id;
  if not found then
    raise exception 'cadu_review_not_found' using errcode = 'P0002';
  end if;

  -- Share the exact source-scoped lock used by stable and legacy override CAS
  -- writes. The projection checked by cadu-api cannot change between its read
  -- and this terminal transition without producing PT412.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'kino-campus:cadu-source:v1:' || v_source_id,
      20260713::bigint
    )
  );

  select review.* into v_review
  from public.cadu_institutional_source_reviews as review
  where review.id = p_review_id
  for update;
  if not found then
    raise exception 'cadu_review_not_found' using errcode = 'P0002';
  end if;
  if v_review.source_id is distinct from v_source_id then
    raise exception 'cadu_review_source_identity_changed' using errcode = '40001';
  end if;
  if v_review.source_revision is distinct from p_expected_source_revision then
    raise exception 'cadu_review_source_revision_conflict' using errcode = '40001';
  end if;

  select coalesce(
    pg_catalog.jsonb_object_agg(meta.unit_id, meta.revision),
    '{}'::jsonb
  )
    into v_meta_revisions
    from public.kc_unit_meta as meta;

  if v_meta_revisions is distinct from p_expected_meta_revisions then
    raise sqlstate 'PT412' using
      message = 'CADU_REVIEW_METADATA_PRECONDITION_FAILED',
      detail = 'The source metadata revision snapshot changed before review resolution.',
      hint = 'Reload the source registry and review queue before deciding.';
  end if;

  if v_review.state <> 'pending' then
    if v_review.state = p_decision
       and v_review.resolution_note is not distinct from p_resolution_note then
      return query select
        v_review.id, v_review.source_id, v_review.source_revision,
        v_review.state, v_review.resolved_by, v_review.resolved_at, true;
      return;
    end if;
    raise exception 'cadu_review_resolution_conflict' using errcode = '23505';
  end if;

  update public.cadu_institutional_source_reviews as review
  set state = p_decision,
      resolved_by = p_resolved_by,
      resolved_at = pg_catalog.clock_timestamp(),
      resolution_note = p_resolution_note
  where review.id = p_review_id
  returning review.* into v_review;

  insert into public.audit_log (
    action, entity_type, entity_id, actor_id, payload
  ) values (
    'cadu_institutional_source_review_' || p_decision,
    'cadu_institutional_source_reviews',
    v_review.id,
    p_resolved_by,
    pg_catalog.jsonb_build_object(
      'state', v_review.state,
      'source_id', v_review.source_id,
      'source_revision', v_review.source_revision,
      'resolution_note', v_review.resolution_note
    )
  );

  return query select
    v_review.id, v_review.source_id, v_review.source_revision,
    v_review.state, v_review.resolved_by, v_review.resolved_at, false;
end;
$$;

revoke all on function public.kc_resolve_institutional_source_review(
  uuid, text, text, text, uuid, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.kc_resolve_institutional_source_review(
  uuid, text, text, text, uuid, jsonb
) to service_role;

comment on function public.kc_resolve_institutional_source_review(
  uuid, text, text, text, uuid, jsonb
) is 'Atomic admin review resolution with a source-scoped metadata snapshot CAS.';

notify pgrst, 'reload schema';

commit;

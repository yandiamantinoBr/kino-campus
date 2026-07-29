begin;

-- Redact only a JSON string whose complete value is the target UUID. Substrings,
-- keys, numbers, booleans and unrelated UUIDs are deliberately left untouched.
create or replace function kc_private.kc_redact_exact_json_string(
  p_value jsonb,
  p_target text
)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_type text;
  v_result jsonb;
begin
  if p_value is null then
    return null;
  end if;

  v_type := pg_catalog.jsonb_typeof(p_value);
  if v_type = 'string' then
    if p_value = pg_catalog.to_jsonb(p_target) then
      return pg_catalog.to_jsonb('[redacted-account-identifier]'::text);
    end if;
    return p_value;
  end if;

  if v_type = 'array' then
    select coalesce(
      pg_catalog.jsonb_agg(
        kc_private.kc_redact_exact_json_string(element.value, p_target)
        order by element.ordinality
      ),
      '[]'::jsonb
    )
    into v_result
    from pg_catalog.jsonb_array_elements(p_value) with ordinality as element(value, ordinality);
    return v_result;
  end if;

  if v_type = 'object' then
    select coalesce(
      pg_catalog.jsonb_object_agg(
        member.key,
        kc_private.kc_redact_exact_json_string(member.value, p_target)
      ),
      '{}'::jsonb
    )
    into v_result
    from pg_catalog.jsonb_each(p_value) as member(key, value);
    return v_result;
  end if;

  return p_value;
end;
$$;

revoke all on function kc_private.kc_redact_exact_json_string(jsonb, text)
  from public, anon, authenticated, service_role;

-- Read-only preflight/postcondition. The scan remains in PostgreSQL so the Edge
-- worker never downloads entire audit tables or creates a 10k-row blind spot.
create or replace function public.kc_account_audit_identifier_inventory(
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_target text := p_user_id::text;
  v_audit_log_rows bigint;
  v_ad_campaign_audit_rows bigint;
  v_hero_banner_audit_rows bigint;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null then
    raise exception using errcode = '22004', message = 'USER_ID_REQUIRED';
  end if;

  select count(*)
  into v_audit_log_rows
  from public.audit_log audit_row
  where audit_row.actor_id = p_user_id
     or audit_row.entity_id = p_user_id
     or kc_private.kc_redact_exact_json_string(audit_row.payload, v_target)
        is distinct from audit_row.payload;

  select count(*)
  into v_ad_campaign_audit_rows
  from public.ad_campaign_audit audit_row
  where audit_row.changed_by = p_user_id
     or kc_private.kc_redact_exact_json_string(audit_row.snapshot, v_target)
        is distinct from audit_row.snapshot;

  select count(*)
  into v_hero_banner_audit_rows
  from public.hero_banner_audit audit_row
  where audit_row.changed_by = p_user_id
     or kc_private.kc_redact_exact_json_string(audit_row.snapshot, v_target)
        is distinct from audit_row.snapshot;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'audit_log_rows', v_audit_log_rows,
    'ad_campaign_audit_rows', v_ad_campaign_audit_rows,
    'hero_banner_audit_rows', v_hero_banner_audit_rows,
    'identifiers_remaining',
      v_audit_log_rows + v_ad_campaign_audit_rows + v_hero_banner_audit_rows > 0
  );
end;
$$;

revoke all on function public.kc_account_audit_identifier_inventory(uuid)
  from public, anon, authenticated;
grant execute on function public.kc_account_audit_identifier_inventory(uuid)
  to service_role;

-- Inventory and redaction happen under one transaction and table lock. Any
-- cardinality, integrity or zero-residual failure raises and rolls back all
-- three tables together.
create or replace function public.kc_redact_account_audit_identifiers(
  p_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_target text := p_user_id::text;
  v_audit_log_ids uuid[] := '{}'::uuid[];
  v_ad_campaign_audit_ids bigint[] := '{}'::bigint[];
  v_hero_banner_audit_ids bigint[] := '{}'::bigint[];
  v_audit_log_integrity_before jsonb := '[]'::jsonb;
  v_ad_campaign_integrity_before jsonb := '[]'::jsonb;
  v_hero_banner_integrity_before jsonb := '[]'::jsonb;
  v_audit_log_integrity_after jsonb := '[]'::jsonb;
  v_ad_campaign_integrity_after jsonb := '[]'::jsonb;
  v_hero_banner_integrity_after jsonb := '[]'::jsonb;
  v_inventory_digest text;
  v_count bigint;
  v_identifiers_remaining boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null then
    raise exception using errcode = '22004', message = 'USER_ID_REQUIRED';
  end if;

  lock table public.audit_log in share row exclusive mode;
  lock table public.ad_campaign_audit in share row exclusive mode;
  lock table public.hero_banner_audit in share row exclusive mode;

  select
    coalesce(pg_catalog.array_agg(audit_row.id order by audit_row.id), '{}'::uuid[]),
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', audit_row.id,
          'action', audit_row.action,
          'entity_type', audit_row.entity_type,
          'created_at', audit_row.created_at
        )
        order by audit_row.id
      ),
      '[]'::jsonb
    )
  into v_audit_log_ids, v_audit_log_integrity_before
  from public.audit_log audit_row
  where audit_row.actor_id = p_user_id
     or audit_row.entity_id = p_user_id
     or kc_private.kc_redact_exact_json_string(audit_row.payload, v_target)
        is distinct from audit_row.payload;

  select
    coalesce(pg_catalog.array_agg(audit_row.id order by audit_row.id), '{}'::bigint[]),
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', audit_row.id,
          'campaign_id', audit_row.campaign_id,
          'action', audit_row.action,
          'changed_at', audit_row.changed_at
        )
        order by audit_row.id
      ),
      '[]'::jsonb
    )
  into v_ad_campaign_audit_ids, v_ad_campaign_integrity_before
  from public.ad_campaign_audit audit_row
  where audit_row.changed_by = p_user_id
     or kc_private.kc_redact_exact_json_string(audit_row.snapshot, v_target)
        is distinct from audit_row.snapshot;

  select
    coalesce(pg_catalog.array_agg(audit_row.id order by audit_row.id), '{}'::bigint[]),
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', audit_row.id,
          'banner_id', audit_row.banner_id,
          'action', audit_row.action,
          'changed_at', audit_row.changed_at
        )
        order by audit_row.id
      ),
      '[]'::jsonb
    )
  into v_hero_banner_audit_ids, v_hero_banner_integrity_before
  from public.hero_banner_audit audit_row
  where audit_row.changed_by = p_user_id
     or kc_private.kc_redact_exact_json_string(audit_row.snapshot, v_target)
        is distinct from audit_row.snapshot;

  v_inventory_digest := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        v_audit_log_integrity_before::text || '|' ||
        v_ad_campaign_integrity_before::text || '|' ||
        v_hero_banner_integrity_before::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  update public.audit_log audit_row
  set actor_id = case when audit_row.actor_id = p_user_id then null else audit_row.actor_id end,
      entity_id = case
        when audit_row.entity_id = p_user_id then extensions.gen_random_uuid()
        else audit_row.entity_id
      end,
      payload = kc_private.kc_redact_exact_json_string(audit_row.payload, v_target)
  where audit_row.id = any(v_audit_log_ids);
  get diagnostics v_count = row_count;
  if v_count <> pg_catalog.cardinality(v_audit_log_ids) then
    raise exception using errcode = 'P0001', message = 'AUDIT_LOG_CARDINALITY_MISMATCH';
  end if;

  update public.ad_campaign_audit audit_row
  set changed_by = case when audit_row.changed_by = p_user_id then null else audit_row.changed_by end,
      snapshot = kc_private.kc_redact_exact_json_string(audit_row.snapshot, v_target)
  where audit_row.id = any(v_ad_campaign_audit_ids);
  get diagnostics v_count = row_count;
  if v_count <> pg_catalog.cardinality(v_ad_campaign_audit_ids) then
    raise exception using errcode = 'P0001', message = 'AD_CAMPAIGN_AUDIT_CARDINALITY_MISMATCH';
  end if;

  update public.hero_banner_audit audit_row
  set changed_by = case when audit_row.changed_by = p_user_id then null else audit_row.changed_by end,
      snapshot = kc_private.kc_redact_exact_json_string(audit_row.snapshot, v_target)
  where audit_row.id = any(v_hero_banner_audit_ids);
  get diagnostics v_count = row_count;
  if v_count <> pg_catalog.cardinality(v_hero_banner_audit_ids) then
    raise exception using errcode = 'P0001', message = 'HERO_BANNER_AUDIT_CARDINALITY_MISMATCH';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', audit_row.id,
        'action', audit_row.action,
        'entity_type', audit_row.entity_type,
        'created_at', audit_row.created_at
      )
      order by audit_row.id
    ),
    '[]'::jsonb
  )
  into v_audit_log_integrity_after
  from public.audit_log audit_row
  where audit_row.id = any(v_audit_log_ids);

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', audit_row.id,
        'campaign_id', audit_row.campaign_id,
        'action', audit_row.action,
        'changed_at', audit_row.changed_at
      )
      order by audit_row.id
    ),
    '[]'::jsonb
  )
  into v_ad_campaign_integrity_after
  from public.ad_campaign_audit audit_row
  where audit_row.id = any(v_ad_campaign_audit_ids);

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', audit_row.id,
        'banner_id', audit_row.banner_id,
        'action', audit_row.action,
        'changed_at', audit_row.changed_at
      )
      order by audit_row.id
    ),
    '[]'::jsonb
  )
  into v_hero_banner_integrity_after
  from public.hero_banner_audit audit_row
  where audit_row.id = any(v_hero_banner_audit_ids);

  if v_audit_log_integrity_before is distinct from v_audit_log_integrity_after
     or v_ad_campaign_integrity_before is distinct from v_ad_campaign_integrity_after
     or v_hero_banner_integrity_before is distinct from v_hero_banner_integrity_after then
    raise exception using errcode = 'P0001', message = 'AUDIT_EVENT_INTEGRITY_MISMATCH';
  end if;

  select exists (
    select 1
    from public.audit_log audit_row
    where audit_row.actor_id = p_user_id
       or audit_row.entity_id = p_user_id
       or kc_private.kc_redact_exact_json_string(audit_row.payload, v_target)
          is distinct from audit_row.payload
  ) or exists (
    select 1
    from public.ad_campaign_audit audit_row
    where audit_row.changed_by = p_user_id
       or kc_private.kc_redact_exact_json_string(audit_row.snapshot, v_target)
          is distinct from audit_row.snapshot
  ) or exists (
    select 1
    from public.hero_banner_audit audit_row
    where audit_row.changed_by = p_user_id
       or kc_private.kc_redact_exact_json_string(audit_row.snapshot, v_target)
          is distinct from audit_row.snapshot
  )
  into v_identifiers_remaining;

  if v_identifiers_remaining then
    raise exception using errcode = 'P0001', message = 'AUDIT_IDENTIFIER_REDACTION_INCOMPLETE';
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'audit_log_rows', pg_catalog.cardinality(v_audit_log_ids),
    'ad_campaign_audit_rows', pg_catalog.cardinality(v_ad_campaign_audit_ids),
    'hero_banner_audit_rows', pg_catalog.cardinality(v_hero_banner_audit_ids),
    'inventory_digest', v_inventory_digest,
    'identifiers_remaining', false,
    'events_preserved', true
  );
end;
$$;

revoke all on function public.kc_redact_account_audit_identifiers(uuid)
  from public, anon, authenticated;
grant execute on function public.kc_redact_account_audit_identifiers(uuid)
  to service_role;

-- Extend the worker capability gate only after both RPCs and their transaction
-- boundary exist.
create or replace function public.kc_account_erasure_capabilities()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_guard_coverage jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  v_guard_coverage := public.kc_active_session_guard_coverage();

  return pg_catalog.jsonb_build_object(
    'version', 2,
    'write_quiescence', coalesce((v_guard_coverage ->> 'ok')::boolean, false),
    'chat_preserving_delete', true,
    'cadu_set_null', true,
    'unit_meta_set_null', true,
    'community_content_preserving_delete', true,
    'safety_records_preserving_delete', true,
    'audit_identifier_redaction', true
  );
end;
$$;

revoke all on function public.kc_account_erasure_capabilities()
  from public, anon, authenticated;
grant execute on function public.kc_account_erasure_capabilities()
  to service_role;

comment on function public.kc_redact_account_audit_identifiers(uuid) is
  'Service-role-only atomic LGPD redaction for exact account UUID values in audit payloads/snapshots while preserving event cardinality and immutable event metadata.';

commit;

begin;

-- ============================================================================
-- Account erasure: fail-closed copy gate, audit e-mail pseudonymization and
-- atomic help-request redaction.
-- ============================================================================

create or replace function kc_private.kc_redact_exact_email_json_string(
  p_value jsonb,
  p_target_email text,
  p_replacement text
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
    if pg_catalog.lower(pg_catalog.btrim(p_value #>> '{}')) = p_target_email then
      return pg_catalog.to_jsonb(p_replacement);
    end if;
    return p_value;
  end if;

  if v_type = 'array' then
    select coalesce(
      pg_catalog.jsonb_agg(
        kc_private.kc_redact_exact_email_json_string(
          element.value,
          p_target_email,
          p_replacement
        )
        order by element.ordinality
      ),
      '[]'::jsonb
    )
    into v_result
    from pg_catalog.jsonb_array_elements(p_value)
      with ordinality as element(value, ordinality);
    return v_result;
  end if;

  if v_type = 'object' then
    select coalesce(
      pg_catalog.jsonb_object_agg(
        member.key,
        kc_private.kc_redact_exact_email_json_string(
          member.value,
          p_target_email,
          p_replacement
        )
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

revoke all on function kc_private.kc_redact_exact_email_json_string(jsonb, text, text)
  from public, anon, authenticated, service_role;

-- Remove raw addresses written by older invite-revocation implementations.
-- The predicate is deliberately narrow: only the known action/entity/key is
-- changed, while every other audit event and payload member is preserved.
update public.audit_log audit_row
set payload = (audit_row.payload - 'email') || pg_catalog.jsonb_build_object(
  'email_hash',
  pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.lower(pg_catalog.btrim(audit_row.payload ->> 'email')),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),
  'email_redacted',
  true
)
where audit_row.action = 'invite_revoked'
  and audit_row.entity_type = 'invites'
  and pg_catalog.jsonb_typeof(audit_row.payload -> 'email') = 'string'
  and pg_catalog.btrim(audit_row.payload ->> 'email') <> '';

update public.audit_log audit_row
set payload = (audit_row.payload - 'email') || pg_catalog.jsonb_build_object(
  'email_redacted',
  true
)
where audit_row.action = 'invite_revoked'
  and audit_row.entity_type = 'invites'
  and pg_catalog.jsonb_typeof(audit_row.payload -> 'email') = 'string';

create or replace function kc_private.kc_admin_revoke_invite(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  v_email_hash text;
  v_deleted integer := 0;
begin
  if v_role <> 'service_role'
     and (v_admin_id is null or not public.kc_is_admin(v_admin_id)) then
    raise exception using errcode = '42501', message = 'UNAUTHORIZED';
  end if;

  if v_email = ''
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_EMAIL');
  end if;

  v_email_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_email, 'UTF8'), 'sha256'),
    'hex'
  );

  delete from public.kc_invited_emails invite_row
  where pg_catalog.lower(pg_catalog.btrim(invite_row.email)) = v_email;
  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    perform kc_private.kc_insert_audit_log(
      'invite_revoked',
      'invites',
      extensions.gen_random_uuid(),
      pg_catalog.jsonb_build_object(
        'email_hash', v_email_hash,
        'email_redacted', true,
        'deleted_count', v_deleted
      ),
      v_admin_id
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'email_hash', v_email_hash,
    'deleted_count', v_deleted
  );
end;
$$;

revoke all on function kc_private.kc_admin_revoke_invite(text)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_admin_revoke_invite(text)
  to service_role, authenticated;

create or replace function public.kc_account_audit_email_inventory(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  v_rows bigint;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if v_email = ''
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = '22023', message = 'VALID_EMAIL_REQUIRED';
  end if;

  select count(*)
  into v_rows
  from public.audit_log audit_row
  where kc_private.kc_redact_exact_email_json_string(
    audit_row.payload,
    v_email,
    '[redacted-account-email]'
  ) is distinct from audit_row.payload;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'audit_log_rows', v_rows,
    'emails_remaining', v_rows > 0
  );
end;
$$;

revoke all on function public.kc_account_audit_email_inventory(text)
  from public, anon, authenticated;
grant execute on function public.kc_account_audit_email_inventory(text)
  to service_role;

create or replace function public.kc_redact_account_audit_emails(
  p_email text,
  p_subject_hash text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  v_replacement text;
  v_ids uuid[] := '{}'::uuid[];
  v_integrity_before jsonb := '[]'::jsonb;
  v_integrity_after jsonb := '[]'::jsonb;
  v_count bigint;
  v_remaining boolean;
  v_inventory_digest text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if v_email = ''
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or coalesce(p_subject_hash, '') !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'AUDIT_EMAIL_REDACTION_ARGUMENTS_INVALID';
  end if;

  v_replacement := '[redacted-account-email:' || pg_catalog.left(p_subject_hash, 16) || ']';
  lock table public.audit_log in share row exclusive mode;

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
  into v_ids, v_integrity_before
  from public.audit_log audit_row
  where kc_private.kc_redact_exact_email_json_string(
    audit_row.payload,
    v_email,
    v_replacement
  ) is distinct from audit_row.payload;

  v_inventory_digest := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(v_integrity_before::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  update public.audit_log audit_row
  set payload = kc_private.kc_redact_exact_email_json_string(
    audit_row.payload,
    v_email,
    v_replacement
  )
  where audit_row.id = any(v_ids);
  get diagnostics v_count = row_count;
  if v_count <> pg_catalog.cardinality(v_ids) then
    raise exception using errcode = 'P0001', message = 'AUDIT_EMAIL_CARDINALITY_MISMATCH';
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
  into v_integrity_after
  from public.audit_log audit_row
  where audit_row.id = any(v_ids);

  if v_integrity_before is distinct from v_integrity_after then
    raise exception using errcode = 'P0001', message = 'AUDIT_EMAIL_EVENT_INTEGRITY_MISMATCH';
  end if;

  select exists (
    select 1
    from public.audit_log audit_row
    where kc_private.kc_redact_exact_email_json_string(
      audit_row.payload,
      v_email,
      v_replacement
    ) is distinct from audit_row.payload
  )
  into v_remaining;
  if v_remaining then
    raise exception using errcode = 'P0001', message = 'AUDIT_EMAIL_REDACTION_INCOMPLETE';
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'audit_log_rows', pg_catalog.cardinality(v_ids),
    'inventory_digest', v_inventory_digest,
    'emails_remaining', false,
    'events_preserved', true
  );
end;
$$;

revoke all on function public.kc_redact_account_audit_emails(text, text)
  from public, anon, authenticated;
grant execute on function public.kc_redact_account_audit_emails(text, text)
  to service_role;

create or replace function kc_private.kc_account_help_redaction_metadata(
  p_subject_hash text,
  p_receipt jsonb
)
returns jsonb
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'request_kind', 'account_erasure',
    'lgpd_erasure', pg_catalog.jsonb_build_object(
      'request_id', nullif(pg_catalog.btrim(coalesce($2 ->> 'request_id', '')), ''),
      'subject_hash', $1,
      'erased_at', nullif(pg_catalog.btrim(coalesce($2 ->> 'erased_at', '')), ''),
      'contact_redacted', true,
      'content_redacted', true,
      'postcondition_version', 2
    )
  );
$$;

revoke all on function kc_private.kc_account_help_redaction_metadata(text, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.kc_account_help_redaction_inventory(
  p_help_request_ids uuid[],
  p_subject_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_expected integer;
  v_found bigint;
  v_remaining bigint;
  v_redacted_email text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if coalesce(p_subject_hash, '') !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'SUBJECT_HASH_INVALID';
  end if;

  select coalesce(pg_catalog.array_agg(distinct item), '{}'::uuid[])
  into v_ids
  from pg_catalog.unnest(coalesce(p_help_request_ids, '{}'::uuid[])) item;
  v_expected := pg_catalog.cardinality(v_ids);
  v_redacted_email := 'lgpd-' || pg_catalog.left(p_subject_hash, 12)
    || '@redacted.kinocampus.local';

  select
    count(help_row.id),
    count(*) filter (
      where help_row.id is null
         or help_row.user_id is not null
         or help_row.type <> 'account_access'
         or help_row.topic <> 'onboarding_settings'
         or help_row.subtopic is distinct from 'account_deletion'
         or help_row.subject <> 'Solicitacao LGPD atendida'
         or help_row.message <> 'Conteudo removido por solicitacao LGPD.'
         or help_row.priority <> 'normal'
         or help_row.status <> 'resolved'
         or help_row.page_path is not null
         or help_row.contact_email <> v_redacted_email
         or help_row.allow_contact
         or help_row.admin_status <> 'na'
         or help_row.admin_decided_at is not null
         or help_row.admin_decided_by is not null
         or help_row.admin_note is not null
         or help_row.metadata ->> 'request_kind' <> 'account_erasure'
         or coalesce(
           help_row.metadata -> 'lgpd_erasure' ->> 'request_id',
           ''
         ) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         or help_row.metadata -> 'lgpd_erasure' ->> 'subject_hash' <> p_subject_hash
         or nullif(
           pg_catalog.btrim(
             coalesce(help_row.metadata -> 'lgpd_erasure' ->> 'erased_at', '')
           ),
           ''
         ) is null
         or help_row.metadata -> 'lgpd_erasure' ->> 'contact_redacted' <> 'true'
         or help_row.metadata -> 'lgpd_erasure' ->> 'content_redacted' <> 'true'
         or help_row.metadata -> 'lgpd_erasure' ->> 'postcondition_version' <> '2'
         or (help_row.metadata - array['request_kind', 'lgpd_erasure']::text[]) <> '{}'::jsonb
         or (
           coalesce(help_row.metadata -> 'lgpd_erasure', '{}'::jsonb)
             - array[
               'request_id',
               'subject_hash',
               'erased_at',
               'contact_redacted',
               'content_redacted',
               'postcondition_version'
             ]::text[]
         ) <> '{}'::jsonb
    )
  into v_found, v_remaining
  from pg_catalog.unnest(v_ids) expected(id)
  left join public.help_requests help_row on help_row.id = expected.id;

  return pg_catalog.jsonb_build_object(
    'ok', v_found = v_expected and v_remaining = 0,
    'expected_rows', v_expected,
    'found_rows', v_found,
    'personal_fields_remaining', v_remaining,
    'postcondition_version', 2
  );
end;
$$;

revoke all on function public.kc_account_help_redaction_inventory(uuid[], text)
  from public, anon, authenticated;
grant execute on function public.kc_account_help_redaction_inventory(uuid[], text)
  to service_role;

create or replace function public.kc_redact_account_help_requests(
  p_help_request_ids uuid[],
  p_subject_hash text,
  p_receipt jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_expected integer;
  v_locked integer;
  v_updated integer;
  v_redacted_email text;
  v_inventory jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if coalesce(p_subject_hash, '') !~ '^[a-f0-9]{64}$'
     or pg_catalog.jsonb_typeof(coalesce(p_receipt, '{}'::jsonb)) <> 'object'
     or nullif(pg_catalog.btrim(coalesce(p_receipt ->> 'request_id', '')), '') is null
     or nullif(pg_catalog.btrim(coalesce(p_receipt ->> 'erased_at', '')), '') is null then
    raise exception using errcode = '22023', message = 'HELP_REDACTION_ARGUMENTS_INVALID';
  end if;

  select coalesce(pg_catalog.array_agg(distinct item), '{}'::uuid[])
  into v_ids
  from pg_catalog.unnest(coalesce(p_help_request_ids, '{}'::uuid[])) item;
  v_expected := pg_catalog.cardinality(v_ids);
  if v_expected = 0 then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'expected_rows', 0,
      'found_rows', 0,
      'rows_redacted', 0,
      'personal_fields_remaining', 0,
      'postcondition_version', 2
    );
  end if;

  select count(*)
  into v_locked
  from (
    select help_row.id
    from public.help_requests help_row
    where help_row.id = any(v_ids)
    for update
  ) locked_rows;
  if v_locked <> v_expected then
    raise exception using errcode = 'P0001', message = 'HELP_REDACTION_TARGET_MISSING';
  end if;

  v_redacted_email := 'lgpd-' || pg_catalog.left(p_subject_hash, 12)
    || '@redacted.kinocampus.local';
  update public.help_requests help_row
  set user_id = null,
      type = 'account_access',
      topic = 'onboarding_settings',
      subtopic = 'account_deletion',
      subject = 'Solicitacao LGPD atendida',
      message = 'Conteudo removido por solicitacao LGPD.',
      priority = 'normal',
      status = 'resolved',
      page_path = null,
      contact_email = v_redacted_email,
      allow_contact = false,
      metadata = kc_private.kc_account_help_redaction_metadata(
        p_subject_hash,
        p_receipt
      ),
      admin_status = 'na',
      admin_decided_at = null,
      admin_decided_by = null,
      admin_note = null,
      updated_at = pg_catalog.clock_timestamp()
  where help_row.id = any(v_ids);
  get diagnostics v_updated = row_count;
  if v_updated <> v_expected then
    raise exception using errcode = 'P0001', message = 'HELP_REDACTION_CARDINALITY_MISMATCH';
  end if;

  v_inventory := public.kc_account_help_redaction_inventory(v_ids, p_subject_hash);
  if coalesce((v_inventory ->> 'ok')::boolean, false) is not true then
    raise exception using
      errcode = 'P0001',
      message = 'HELP_REDACTION_POSTCONDITION_FAILED',
      detail = v_inventory::text;
  end if;

  return v_inventory || pg_catalog.jsonb_build_object('rows_redacted', v_updated);
end;
$$;

revoke all on function public.kc_redact_account_help_requests(uuid[], text, jsonb)
  from public, anon, authenticated;
grant execute on function public.kc_redact_account_help_requests(uuid[], text, jsonb)
  to service_role;

create or replace function kc_private.kc_guard_account_erasure_dsr_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workflow public.account_erasure_requests%rowtype;
begin
  if new.request_kind <> 'account_erasure'
     or new.status <> 'completed'
     or old.status = 'completed' then
    return new;
  end if;

  select *
  into v_workflow
  from public.account_erasure_requests workflow_row
  where workflow_row.data_subject_request_id = new.id
  order by workflow_row.created_at desc
  limit 1;

  if not found or v_workflow.status <> 'erased' then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_DSR_WORKFLOW_NOT_FINAL';
  end if;
  if v_workflow.help_request_id is null or not exists (
    select 1
    from public.help_requests help_row
    where help_row.id = v_workflow.help_request_id
      and help_row.user_id is null
      and help_row.type = 'account_access'
      and help_row.topic = 'onboarding_settings'
      and help_row.subtopic = 'account_deletion'
      and help_row.subject = 'Solicitacao LGPD atendida'
      and help_row.message = 'Conteudo removido por solicitacao LGPD.'
      and help_row.priority = 'normal'
      and help_row.status = 'resolved'
      and help_row.page_path is null
      and help_row.contact_email =
        'lgpd-' || pg_catalog.left(v_workflow.email_hash, 12)
          || '@redacted.kinocampus.local'
      and help_row.allow_contact is false
      and help_row.admin_status = 'na'
      and help_row.admin_decided_at is null
      and help_row.admin_decided_by is null
      and help_row.admin_note is null
      and help_row.metadata ->> 'request_kind' = 'account_erasure'
      and help_row.metadata -> 'lgpd_erasure' ->> 'request_id' =
        v_workflow.id::text
      and help_row.metadata -> 'lgpd_erasure' ->> 'subject_hash' =
        v_workflow.email_hash
      and nullif(
        pg_catalog.btrim(
          coalesce(help_row.metadata -> 'lgpd_erasure' ->> 'erased_at', '')
        ),
        ''
      ) is not null
      and help_row.metadata -> 'lgpd_erasure' ->> 'contact_redacted' = 'true'
      and help_row.metadata -> 'lgpd_erasure' ->> 'content_redacted' = 'true'
      and help_row.metadata -> 'lgpd_erasure' ->> 'postcondition_version' = '2'
      and (
        help_row.metadata - array['request_kind', 'lgpd_erasure']::text[]
      ) = '{}'::jsonb
      and (
        coalesce(help_row.metadata -> 'lgpd_erasure', '{}'::jsonb)
          - array[
            'request_id',
            'subject_hash',
            'erased_at',
            'contact_redacted',
            'content_redacted',
            'postcondition_version'
          ]::text[]
      ) = '{}'::jsonb
  ) then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_DSR_HELP_REDACTION_NOT_VERIFIED';
  end if;

  return new;
end;
$$;

revoke all on function kc_private.kc_guard_account_erasure_dsr_completion()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_guard_account_erasure_dsr_completion
  on public.data_subject_requests;
create trigger trg_guard_account_erasure_dsr_completion
before update of status on public.data_subject_requests
for each row execute function kc_private.kc_guard_account_erasure_dsr_completion();

create or replace function kc_private.kc_account_erasure_copy_gate_status(
  p_workflow_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_workflow public.account_erasure_requests%rowtype;
  v_help public.help_requests%rowtype;
  v_preference text;
  v_effective_preference text;
  v_decision jsonb;
  v_explicit_copy_id uuid;
  v_copy public.data_subject_requests%rowtype;
  v_downloaded_at timestamptz;
begin
  select *
  into v_workflow
  from public.account_erasure_requests workflow_row
  where workflow_row.id = p_workflow_id;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'ERASURE_REQUEST_NOT_FOUND');
  end if;

  select *
  into v_help
  from public.help_requests help_row
  where help_row.id = v_workflow.help_request_id;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'ERASURE_HELP_REQUEST_REQUIRED');
  end if;

  v_preference := pg_catalog.lower(
    pg_catalog.btrim(coalesce(v_help.metadata ->> 'export_before_erasure', ''))
  );
  v_effective_preference := v_preference;
  v_decision := coalesce(v_workflow.metadata -> 'pre_erasure_copy_decision', '{}'::jsonb);

  if v_preference = 'need_guidance' or v_preference = '' then
    if v_decision ->> 'attested' <> 'true'
       or coalesce(v_decision ->> 'reference_hash', '') !~ '^[a-f0-9]{64}$'
       or coalesce(v_decision ->> 'decided_by', '') !~
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or nullif(pg_catalog.btrim(coalesce(v_decision ->> 'decided_at', '')), '') is null then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'preference', coalesce(nullif(v_preference, ''), 'legacy_unspecified'),
        'error', 'ERASURE_COPY_GUIDANCE_DECISION_REQUIRED'
      );
    end if;
    v_effective_preference := v_decision ->> 'decision';
  end if;

  if v_effective_preference = 'no_copy_needed' then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'preference', coalesce(nullif(v_preference, ''), 'legacy_unspecified'),
      'effective_preference', v_effective_preference,
      'copy_required', false,
      'decision_recorded', v_preference in ('need_guidance', '')
    );
  end if;
  if v_effective_preference <> 'request_copy_first' then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'preference', coalesce(nullif(v_preference, ''), 'legacy_unspecified'),
      'error', 'ERASURE_COPY_PREFERENCE_INVALID'
    );
  end if;

  begin
    v_explicit_copy_id := coalesce(
      nullif(v_workflow.metadata ->> 'pre_erasure_copy_request_id', '')::uuid,
      nullif(v_help.metadata ->> 'pre_erasure_copy_request_id', '')::uuid
    );
  exception when invalid_text_representation then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'preference', v_preference,
      'error', 'ERASURE_COPY_REQUEST_LINK_INVALID'
    );
  end;

  if v_explicit_copy_id is not null then
    select *
    into v_copy
    from public.data_subject_requests request_row
    where request_row.id = v_explicit_copy_id
      and request_row.user_id = v_workflow.user_id
      and request_row.request_kind in ('data_access_copy', 'data_portability')
    limit 1;
  else
    select request_row.*
    into v_copy
    from public.data_subject_requests request_row
    where request_row.user_id = v_workflow.user_id
      and request_row.request_kind in ('data_access_copy', 'data_portability')
      and exists (
        select 1
        from public.data_subject_request_events event_row
        where event_row.request_id = request_row.id
          and event_row.event_type = 'downloaded'
      )
    order by request_row.completed_at desc nulls last, request_row.created_at desc
    limit 1;
  end if;

  if v_copy.id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'preference', v_preference,
      'effective_preference', v_effective_preference,
      'copy_required', true,
      'error', 'ERASURE_COPY_REQUEST_NOT_LINKED'
    );
  end if;

  select max(event_row.created_at)
  into v_downloaded_at
  from public.data_subject_request_events event_row
  where event_row.request_id = v_copy.id
    and event_row.event_type = 'downloaded';

  if v_copy.status <> 'completed' or v_downloaded_at is null then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'preference', v_preference,
      'effective_preference', v_effective_preference,
      'copy_required', true,
      'copy_request_id', v_copy.id,
      'copy_request_status', v_copy.status,
      'error', 'ERASURE_COPY_NOT_PROVEN_DELIVERED'
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'preference', v_preference,
    'effective_preference', v_effective_preference,
    'copy_required', true,
    'copy_request_id', v_copy.id,
    'copy_request_kind', v_copy.request_kind,
    'copy_request_status', v_copy.status,
    'delivery_event', 'downloaded',
    'delivered_at', v_downloaded_at
  );
end;
$$;

revoke all on function kc_private.kc_account_erasure_copy_gate_status(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.kc_account_erasure_copy_gate_status(p_workflow_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  return kc_private.kc_account_erasure_copy_gate_status(p_workflow_id);
end;
$$;

revoke all on function public.kc_account_erasure_copy_gate_status(uuid)
  from public, anon, authenticated;
grant execute on function public.kc_account_erasure_copy_gate_status(uuid)
  to service_role;

create or replace function public.kc_record_account_erasure_copy_decision(
  p_workflow_id uuid,
  p_actor_id uuid,
  p_decision text,
  p_reference_hash text,
  p_decided_at timestamptz,
  p_attested boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_help_id uuid;
  v_preference text;
  v_decision text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_decision, '')));
  v_result jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_actor_id is null or not public.kc_is_admin(p_actor_id) then
    raise exception using errcode = '42501', message = 'ERASURE_ADMIN_REQUIRED';
  end if;
  if v_decision not in ('request_copy_first', 'no_copy_needed')
     or coalesce(p_reference_hash, '') !~ '^[a-f0-9]{64}$'
     or p_decided_at is null
     or p_decided_at > pg_catalog.clock_timestamp() + interval '5 minutes'
     or p_attested is not true then
    raise exception using errcode = '22023', message = 'ERASURE_COPY_DECISION_EVIDENCE_INVALID';
  end if;

  select workflow_row.user_id, workflow_row.help_request_id
  into v_user_id, v_help_id
  from public.account_erasure_requests workflow_row
  where workflow_row.id = p_workflow_id;
  if not found or v_user_id is null then
    raise exception using errcode = 'P0002', message = 'ERASURE_REQUEST_NOT_FOUND';
  end if;

  perform kc_private.kc_lock_privacy_subject(v_user_id);

  select pg_catalog.lower(
    pg_catalog.btrim(coalesce(help_row.metadata ->> 'export_before_erasure', ''))
  )
  into v_preference
  from public.help_requests help_row
  where help_row.id = v_help_id;
  if not found or v_preference not in ('need_guidance', '') then
    raise exception using errcode = '22023', message = 'ERASURE_COPY_DECISION_NOT_APPLICABLE';
  end if;

  update public.account_erasure_requests workflow_row
  set metadata = pg_catalog.jsonb_set(
        workflow_row.metadata,
        '{pre_erasure_copy_decision}',
        pg_catalog.jsonb_build_object(
          'decision', v_decision,
          'reference_hash', p_reference_hash,
          'decided_at', p_decided_at,
          'decided_by', p_actor_id,
          'attested', true
        ),
        true
      ),
      processed_by = p_actor_id,
      updated_at = pg_catalog.clock_timestamp()
  where workflow_row.id = p_workflow_id
    and workflow_row.status not in ('erased', 'cancelled');
  if not found then
    raise exception using errcode = '40001', message = 'ERASURE_COPY_DECISION_STATE_CONFLICT';
  end if;

  v_result := kc_private.kc_account_erasure_copy_gate_status(p_workflow_id);
  return v_result || pg_catalog.jsonb_build_object('decision_recorded', true);
end;
$$;

revoke all on function public.kc_record_account_erasure_copy_decision(
  uuid, uuid, text, text, timestamptz, boolean
) from public, anon, authenticated;
grant execute on function public.kc_record_account_erasure_copy_decision(
  uuid, uuid, text, text, timestamptz, boolean
) to service_role;

create or replace function public.kc_claim_account_erasure_irreversible_operation(
  p_request_id uuid,
  p_expected_status text,
  p_expected_version integer,
  p_actor_id uuid,
  p_ttl_seconds integer default 300
)
returns table (
  out_request_id uuid,
  out_claim_token uuid,
  out_operation_version integer,
  out_claim_expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_gate jsonb;
  v_claim record;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  select workflow_row.user_id
  into v_user_id
  from public.account_erasure_requests workflow_row
  where workflow_row.id = p_request_id;
  if not found or v_user_id is null then
    raise exception using errcode = 'P0002', message = 'ERASURE_REQUEST_NOT_FOUND';
  end if;

  -- Shared with export generation/consumption. Holding this transaction lock
  -- makes the gate validation and irreversible workflow claim one critical
  -- section per data subject.
  perform kc_private.kc_lock_privacy_subject(v_user_id);
  v_gate := kc_private.kc_account_erasure_copy_gate_status(p_request_id);
  if coalesce((v_gate ->> 'ok')::boolean, false) is not true then
    raise exception using
      errcode = 'P0001',
      message = coalesce(v_gate ->> 'error', 'ERASURE_COPY_GATE_FAILED'),
      detail = v_gate::text;
  end if;

  select *
  into v_claim
  from kc_private.kc_claim_account_erasure_operation(
    p_request_id,
    p_expected_status,
    p_expected_version,
    p_actor_id,
    p_ttl_seconds
  );

  update public.account_erasure_requests workflow_row
  set metadata = pg_catalog.jsonb_set(
        workflow_row.metadata,
        '{pre_erasure_copy_gate}',
        v_gate || pg_catalog.jsonb_build_object(
          'checked_at', pg_catalog.clock_timestamp(),
          'checked_by', p_actor_id
        ),
        true
      ),
      updated_at = pg_catalog.clock_timestamp()
  where workflow_row.id = p_request_id
    and workflow_row.operation_claim_token = v_claim.out_claim_token
    and workflow_row.operation_version = v_claim.out_operation_version;
  if not found then
    raise exception using errcode = '40001', message = 'ERASURE_COPY_GATE_CLAIM_CONFLICT';
  end if;

  out_request_id := v_claim.out_request_id;
  out_claim_token := v_claim.out_claim_token;
  out_operation_version := v_claim.out_operation_version;
  out_claim_expires_at := v_claim.out_claim_expires_at;
  return next;
end;
$$;

revoke all on function public.kc_claim_account_erasure_irreversible_operation(
  uuid, text, integer, uuid, integer
) from public, anon, authenticated;
grant execute on function public.kc_claim_account_erasure_irreversible_operation(
  uuid, text, integer, uuid, integer
) to service_role;

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
    'version', 3,
    'write_quiescence', coalesce((v_guard_coverage ->> 'ok')::boolean, false),
    'chat_preserving_delete', true,
    'cadu_set_null', true,
    'unit_meta_set_null', true,
    'community_content_preserving_delete', true,
    'safety_records_preserving_delete', true,
    'audit_identifier_redaction', true,
    'audit_personal_email_redaction', true,
    'help_request_redaction_postcondition', true,
    'pre_erasure_copy_gate', true,
    'export_artifact_erasure_purge', true,
    'encrypted_completion_outbox', true
  );
end;
$$;

revoke all on function public.kc_account_erasure_capabilities()
  from public, anon, authenticated;
grant execute on function public.kc_account_erasure_capabilities()
  to service_role;

comment on function public.kc_redact_account_help_requests(uuid[], text, jsonb) is
  'Atomically minimizes linked help tickets and verifies every free-text, contact, admin-note and metadata postcondition before returning.';
comment on function public.kc_claim_account_erasure_irreversible_operation(uuid, text, integer, uuid, integer) is
  'Acquires the shared per-subject privacy lock, proves any requested copy was delivered, records the link and only then claims irreversible erasure.';

commit;

begin;

select extensions.plan(23);

select extensions.ok(
  to_regprocedure('public.kc_claim_account_erasure_irreversible_operation(uuid,text,integer,uuid,uuid,integer)') is not null,
  'irreversible erasure has a dedicated session-bound database claim'
);
select extensions.ok(
  to_regprocedure('public.kc_redact_account_help_requests(uuid[],text,jsonb)') is not null,
  'help request redaction RPC exists'
);
select extensions.ok(
  to_regprocedure('public.kc_account_audit_email_inventory(text)') is not null,
  'audit e-mail inventory RPC exists'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.kc_redact_account_help_requests(uuid[],text,jsonb)',
    'execute'
  ),
  'authenticated callers cannot redact help requests'
);

insert into auth.users (id, email)
values
  ('91000000-0000-4000-8000-000000000001', 'privacy-admin@example.test'),
  ('91000000-0000-4000-8000-000000000002', 'copy-before-erasure@example.test');

insert into public.profiles (id, full_name, is_admin)
values
  ('91000000-0000-4000-8000-000000000001', 'Privacy Admin', true),
  ('91000000-0000-4000-8000-000000000002', 'Privacy Subject', false);

insert into auth.sessions (id, user_id)
values (
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001'
);

insert into public.help_requests (
  id,
  user_id,
  type,
  topic,
  subtopic,
  subject,
  message,
  priority,
  status,
  page_path,
  contact_email,
  allow_contact,
  metadata,
  admin_status,
  admin_decided_at,
  admin_decided_by,
  admin_note
)
values (
  '91000000-0000-4000-8000-000000000010',
  '91000000-0000-4000-8000-000000000002',
  'account_access',
  'onboarding_settings',
  'account_deletion',
  'Excluir minha conta',
  'Quero excluir minha conta e todos os dados.',
  'high',
  'in_progress',
  '/settings.html?email=copy-before-erasure@example.test',
  'copy-before-erasure@example.test',
  true,
  pg_catalog.jsonb_build_object(
    'request_kind', 'account_erasure',
    'account_email', 'copy-before-erasure@example.test',
    'export_before_erasure', 'request_copy_first',
    'free_text', 'personal detail'
  ),
  'approved',
  now(),
  '91000000-0000-4000-8000-000000000001',
  'Contains an internal personal note'
);

insert into public.data_subject_requests (
  id,
  protocol,
  user_id,
  help_request_id,
  subject_hash,
  request_kind,
  status,
  idempotency_key,
  requested_format,
  request_source,
  scope
)
values
  (
    '91000000-0000-4000-8000-000000000020',
    'KC-DSR-20260728-AAAAAAAAAAAAAAAA',
    '91000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000010',
    repeat('a', 64),
    'account_erasure',
    'pending_confirmation',
    'erasure:test:0001',
    'json',
    'help',
    '[]'::jsonb
  ),
  (
    '91000000-0000-4000-8000-000000000021',
    'KC-DSR-20260728-BBBBBBBBBBBBBBBB',
    '91000000-0000-4000-8000-000000000002',
    null,
    repeat('b', 64),
    'data_access_copy',
    'ready',
    'copy:test:0000001',
    'json',
    'settings',
    '[]'::jsonb
  );

insert into public.account_erasure_requests (
  id,
  help_request_id,
  user_id,
  email_hash,
  status,
  data_subject_request_id,
  operation_version,
  metadata
)
values (
  '91000000-0000-4000-8000-000000000030',
  '91000000-0000-4000-8000-000000000010',
  '91000000-0000-4000-8000-000000000002',
  repeat('a', 64),
  'pending_confirmation',
  '91000000-0000-4000-8000-000000000020',
  1,
  pg_catalog.jsonb_build_object(
    'pre_erasure_copy_request_id',
    '91000000-0000-4000-8000-000000000021'
  )
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select extensions.is(
  public.kc_account_erasure_copy_gate_status(
    '91000000-0000-4000-8000-000000000030'
  ) ->> 'error',
  'ERASURE_COPY_NOT_PROVEN_DELIVERED',
  'copy-first gate rejects a ready but undelivered copy'
);

select extensions.throws_ok(
  $$
    select *
    from public.kc_claim_account_erasure_irreversible_operation(
      '91000000-0000-4000-8000-000000000030',
      'pending_confirmation',
      1,
      '91000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000001',
      300
    )
  $$,
  'P0001',
  'ERASURE_COPY_NOT_PROVEN_DELIVERED',
  'irreversible claim fails before a requested copy has delivery proof'
);
select extensions.throws_ok(
  $$
    update public.data_subject_requests
    set status = 'completed',
        completed_at = now()
    where id = '91000000-0000-4000-8000-000000000020'
  $$,
  '23514',
  'ERASURE_DSR_WORKFLOW_NOT_FINAL',
  'account-erasure DSR cannot complete before workflow/help postconditions'
);

reset role;

update public.data_subject_requests
set status = 'completed',
    completed_at = now()
where id = '91000000-0000-4000-8000-000000000021';

insert into public.data_subject_request_events (
  request_id,
  actor_user_id,
  status,
  event_type,
  public_message
)
values (
  '91000000-0000-4000-8000-000000000021',
  '91000000-0000-4000-8000-000000000002',
  'completed',
  'downloaded',
  'Copia baixada pelo titular.'
);

set local role service_role;

select extensions.is(
  (
    public.kc_account_erasure_copy_gate_status(
      '91000000-0000-4000-8000-000000000030'
    ) ->> 'ok'
  )::boolean,
  true,
  'copy-first gate accepts only completed copy plus downloaded event'
);

update public.help_requests
set metadata = pg_catalog.jsonb_set(
  metadata,
  '{export_before_erasure}',
  '"need_guidance"'::jsonb,
  true
)
where id = '91000000-0000-4000-8000-000000000010';

select extensions.is(
  public.kc_account_erasure_copy_gate_status(
    '91000000-0000-4000-8000-000000000030'
  ) ->> 'error',
  'ERASURE_COPY_GUIDANCE_DECISION_REQUIRED',
  'need-guidance remains fail-closed without a recorded decision'
);
select extensions.is(
  (
    public.kc_record_account_erasure_copy_decision(
      '91000000-0000-4000-8000-000000000030',
      '91000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000001',
      'no_copy_needed',
      repeat('c', 64),
      now(),
      true
    ) ->> 'decision_recorded'
  )::boolean,
  true,
  'an attested guidance decision is recorded without its raw reference'
);
select extensions.is(
  (
    public.kc_account_erasure_copy_gate_status(
      '91000000-0000-4000-8000-000000000030'
    ) ->> 'copy_required'
  )::boolean,
  false,
  'recorded no-copy guidance decision resolves the irreversible gate'
);

select extensions.is(
  (
    public.kc_redact_account_help_requests(
      array['91000000-0000-4000-8000-000000000010'::uuid],
      repeat('a', 64),
      pg_catalog.jsonb_build_object(
        'request_id', '91000000-0000-4000-8000-000000000030',
        'erased_at', now()
      )
    ) ->> 'ok'
  )::boolean,
  true,
  'help redaction RPC returns a verified postcondition'
);

select extensions.ok(
  (
    select admin_note is null
    from public.help_requests
    where id = '91000000-0000-4000-8000-000000000010'
  ),
  'help redaction removes admin_note'
);
select extensions.ok(
  (
    select page_path is null and allow_contact is false and user_id is null
    from public.help_requests
    where id = '91000000-0000-4000-8000-000000000010'
  ),
  'help redaction removes path/contact/user linkage'
);
select extensions.is(
  (
    select metadata - array['request_kind', 'lgpd_erasure']::text[]
    from public.help_requests
    where id = '91000000-0000-4000-8000-000000000010'
  ),
  '{}'::jsonb,
  'help redaction leaves no unapproved top-level metadata'
);
select extensions.is(
  (
    select metadata -> 'lgpd_erasure' ->> 'postcondition_version'
    from public.help_requests
    where id = '91000000-0000-4000-8000-000000000010'
  ),
  '2',
  'help redaction records its postcondition version'
);

insert into public.audit_log (id, action, entity_type, entity_id, payload)
values (
  '91000000-0000-4000-8000-000000000040',
  'legacy_personal_payload',
  'test',
  '91000000-0000-4000-8000-000000000041',
  '{"nested":{"email":"copy-before-erasure@example.test"},"preserve":"yes"}'::jsonb
);

select extensions.is(
  (
    public.kc_account_audit_email_inventory(
      'copy-before-erasure@example.test'
    ) ->> 'audit_log_rows'
  )::integer,
  1,
  'audit inventory finds historical personal e-mail recursively'
);
select extensions.is(
  (
    public.kc_redact_account_audit_emails(
      'copy-before-erasure@example.test',
      repeat('a', 64)
    ) ->> 'ok'
  )::boolean,
  true,
  'audit e-mail redaction verifies zero residuals'
);
select extensions.is(
  (
    public.kc_account_audit_email_inventory(
      'copy-before-erasure@example.test'
    ) ->> 'audit_log_rows'
  )::integer,
  0,
  'audit e-mail postcondition reports zero rows'
);
select extensions.ok(
  (
    select payload -> 'nested' ->> 'email' <> 'copy-before-erasure@example.test'
      and payload ->> 'preserve' = 'yes'
    from public.audit_log
    where id = '91000000-0000-4000-8000-000000000040'
  ),
  'audit redaction preserves unrelated payload members'
);

reset role;

insert into public.kc_invited_emails (email, invited_by, note)
values (
  'invite-privacy@example.test',
  '91000000-0000-4000-8000-000000000001',
  'privacy test'
);

set local role service_role;

select extensions.is(
  (
    public.kc_admin_revoke_invite('invite-privacy@example.test')
      ->> 'deleted_count'
  )::integer,
  1,
  'invite revoke still removes the invite'
);
select extensions.ok(
  (
    select not (payload ? 'email')
      and payload ->> 'email_hash' ~ '^[a-f0-9]{64}$'
    from public.audit_log
    where action = 'invite_revoked'
      and entity_type = 'invites'
    order by created_at desc
    limit 1
  ),
  'invite revoke audit stores only a pseudonymous hash'
);
select extensions.ok(
  (
    select payload ->> 'email_redacted' = 'true'
    from public.audit_log
    where action = 'invite_revoked'
      and entity_type = 'invites'
    order by created_at desc
    limit 1
  ),
  'invite revoke audit marks the address as redacted'
);

select * from extensions.finish();
rollback;

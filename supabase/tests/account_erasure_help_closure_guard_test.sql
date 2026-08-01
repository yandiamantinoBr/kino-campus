begin;

create extension if not exists pgtap with schema extensions;

select extensions.no_plan();

select extensions.has_trigger(
  'public',
  'help_requests',
  'trg_guard_account_erasure_help_status',
  'account-erasure help closure has a database authority guard'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000991","role":"service_role"}',
  true
);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000990', 'closure-target@example.test'),
  ('00000000-0000-4000-8000-000000000991', 'closure-admin@example.test');

insert into public.profiles (id, email, full_name, is_admin)
values
  (
    '00000000-0000-4000-8000-000000000990',
    'closure-target@example.test',
    'Closure Target',
    false
  ),
  (
    '00000000-0000-4000-8000-000000000991',
    'closure-admin@example.test',
    'Closure Admin',
    true
  );

insert into auth.sessions (id, user_id)
values (
  '10000000-0000-4000-8000-000000000991',
  '00000000-0000-4000-8000-000000000991'
);

insert into public.help_requests (
  id,
  user_id,
  type,
  topic,
  subtopic,
  subject,
  message,
  status,
  contact_email,
  metadata
)
select
  fixture.id,
  '00000000-0000-4000-8000-000000000990',
  'account_access',
  'onboarding_settings',
  'account_deletion',
  'Exclusao da conta',
  'Solicito a exclusao integral da minha conta.',
  'in_progress',
  'closure-target@example.test',
  '{"request_kind":"account_erasure"}'::jsonb
from (
  values
    ('11000000-0000-4000-8000-000000000991'::uuid),
    ('12000000-0000-4000-8000-000000000991'::uuid),
    ('13000000-0000-4000-8000-000000000991'::uuid),
    ('14000000-0000-4000-8000-000000000991'::uuid),
    ('15000000-0000-4000-8000-000000000991'::uuid)
) fixture(id);

insert into public.account_erasure_requests (
  id,
  help_request_id,
  user_id,
  email_hash,
  status,
  processed_by,
  metadata
)
values
  (
    '21000000-0000-4000-8000-000000000991',
    '11000000-0000-4000-8000-000000000991',
    '00000000-0000-4000-8000-000000000990',
    repeat('a', 64),
    'diagnosed',
    '00000000-0000-4000-8000-000000000991',
    '{}'::jsonb
  ),
  (
    '22000000-0000-4000-8000-000000000991',
    '12000000-0000-4000-8000-000000000991',
    '00000000-0000-4000-8000-000000000990',
    repeat('b', 64),
    'erased',
    '00000000-0000-4000-8000-000000000991',
    '{"auth_deleted":true,"notification_pending":true,"retryable":true,"completion_email_status":"draft_only"}'::jsonb
  ),
  (
    '23000000-0000-4000-8000-000000000991',
    '13000000-0000-4000-8000-000000000991',
    '00000000-0000-4000-8000-000000000990',
    repeat('c', 64),
    'erased',
    '00000000-0000-4000-8000-000000000991',
    '{"auth_deleted":true,"notification_pending":false,"retryable":false,"completion_email_status":"sent"}'::jsonb
  ),
  (
    '24000000-0000-4000-8000-000000000991',
    '14000000-0000-4000-8000-000000000991',
    '00000000-0000-4000-8000-000000000990',
    repeat('d', 64),
    'cancelled',
    '00000000-0000-4000-8000-000000000991',
    '{}'::jsonb
  ),
  (
    '25000000-0000-4000-8000-000000000991',
    '15000000-0000-4000-8000-000000000991',
    '00000000-0000-4000-8000-000000000990',
    repeat('e', 64),
    'partial_failure',
    '00000000-0000-4000-8000-000000000991',
    '{"auth_deleted":true,"notification_pending":true,"retryable":true}'::jsonb
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
  scope,
  cancelled_at
)
values (
  '31000000-0000-4000-8000-000000000991',
  'KC-DSR-20260801-CCCCCCCCCCCCCCCC',
  '00000000-0000-4000-8000-000000000990',
  '14000000-0000-4000-8000-000000000991',
  repeat('f', 64),
  'account_erasure',
  'cancelled',
  'closure-cancelled-0001',
  'json',
  'help',
  '[]'::jsonb,
  now()
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000991","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000991"}',
  true
);
set local role authenticated;

select extensions.throws_ok(
  $$update public.help_requests
    set status = 'resolved'
    where id = '11000000-0000-4000-8000-000000000991'$$,
  '23514',
  'ERASURE_HELP_MUST_REMAIN_OPEN',
  'admin cannot resolve an erasure ticket before workflow completion'
);

select extensions.throws_ok(
  $$update public.help_requests
    set status = 'archived',
        type = 'question',
        topic = 'other',
        subtopic = null,
        metadata = '{}'::jsonb
    where id = '11000000-0000-4000-8000-000000000991'$$,
  '23514',
  'ERASURE_HELP_MUST_REMAIN_OPEN',
  'one update cannot erase erasure markers and bypass the closure guard'
);

select extensions.throws_ok(
  $$update public.help_requests
    set status = 'resolved',
        metadata = metadata || jsonb_build_object(
          'data_subject_request_id',
          '31000000-0000-4000-8000-000000000991'
        )
    where id = '11000000-0000-4000-8000-000000000991'$$,
  '23514',
  'ERASURE_HELP_MUST_REMAIN_OPEN',
  'metadata cannot borrow another cancelled DSR to bypass the closure guard'
);

select extensions.throws_ok(
  $$update public.help_requests
    set status = 'resolved'
    where id = '12000000-0000-4000-8000-000000000991'$$,
  '23514',
  'ERASURE_HELP_MUST_REMAIN_OPEN',
  'core erasure without final receipt delivery remains open'
);

select extensions.lives_ok(
  $$update public.help_requests
    set status = 'resolved'
    where id = '13000000-0000-4000-8000-000000000991'$$,
  'admin can resolve after automatic final receipt delivery is authoritative'
);

select extensions.lives_ok(
  $$update public.help_requests
    set status = 'archived'
    where id = '14000000-0000-4000-8000-000000000991'$$,
  'admin can archive after formal workflow cancellation'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000991","role":"service_role"}',
  true
);
set local role service_role;

select extensions.lives_ok(
  $$update public.help_requests
    set user_id = null,
        subject = 'Solicitacao LGPD atendida',
        message = 'Conteudo removido por solicitacao LGPD.',
        status = 'resolved',
        page_path = null,
        contact_email = 'lgpd-eeeeeeeeeeee@redacted.kinocampus.local',
        allow_contact = false,
        metadata = jsonb_build_object(
          'request_kind', 'account_erasure',
          'lgpd_erasure', jsonb_build_object(
            'request_id', '25000000-0000-4000-8000-000000000991',
            'subject_hash', repeat('e', 64),
            'erased_at', now(),
            'contact_redacted', true,
            'content_redacted', true,
            'postcondition_version', 2
          )
        ),
        admin_status = 'na',
        admin_decided_at = null,
        admin_decided_by = null,
        admin_note = null
    where id = '15000000-0000-4000-8000-000000000991'$$,
  'service-role redaction can remove ticket PII before notification delivery'
);

select extensions.finish();

rollback;

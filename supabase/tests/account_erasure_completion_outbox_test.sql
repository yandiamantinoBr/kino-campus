begin;

create extension if not exists pgtap with schema extensions;

select extensions.no_plan();

select extensions.has_table(
  'kc_private',
  'account_erasure_completion_outbox',
  'encrypted completion outbox is private'
);
select extensions.ok(
  not has_table_privilege(
    'service_role',
    'kc_private.account_erasure_completion_outbox',
    'select,insert,update,delete'
  ),
  'service role cannot inspect ciphertext outside gated RPCs'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.kc_claim_account_erasure_completion_outbox(uuid,uuid)',
    'execute'
  ),
  'browser clients cannot claim encrypted recipients'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.kc_claim_account_erasure_completion_outbox(uuid,uuid)',
    'execute'
  ),
  'service role can claim the outbox through the final-state gate'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.kc_release_account_erasure_completion_delivery(uuid,uuid,uuid)',
    'execute'
  ),
  'browser clients cannot release a delivery CAS claim'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.kc_stage_account_erasure_completion_outbox(uuid,uuid,uuid,text,text,text,integer)',
    'execute'
  ),
  'browser clients cannot stage encrypted recipients'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.kc_accept_account_erasure_completion_delivery(uuid,uuid,uuid)',
    'execute'
  ),
  'browser clients cannot assert SMTP acceptance'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.kc_purge_expired_account_erasure_completion_outbox(integer)',
    'execute'
  ),
  'browser clients cannot invoke the outbox retention worker'
);
select extensions.ok(
  (
    select count(*) = 1
      and bool_and(
        (cron_available and scheduled and operational_alert is null)
        or (
          not cron_available
          and not scheduled
          and operational_alert =
            'PG_CRON_UNAVAILABLE_COMPLETION_OUTBOX_PURGE_NOT_SCHEDULED'
        )
      )
    from kc_private.account_erasure_completion_outbox_schedule_state
  ),
  'migration records either the hourly purge or an explicit operational alert'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000982","role":"service_role"}',
  true
);
set local role service_role;

select extensions.is(
  public.kc_account_erasure_capabilities() ->> 'encrypted_completion_outbox',
  'true',
  'capability gate advertises the encrypted completion outbox only after the migration'
);
select extensions.is(
  (public.kc_account_erasure_capabilities() ->> 'version')::integer,
  5,
  'capability version includes atomic DSR claim and durable Auth delete recovery'
);

reset role;

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000981', 'outbox-target@example.test'),
  ('00000000-0000-4000-8000-000000000982', 'outbox-admin@example.test');

insert into public.profiles (id, email, full_name, is_admin)
values
  (
    '00000000-0000-4000-8000-000000000981',
    'outbox-target@example.test',
    'Outbox Target',
    false
  ),
  (
    '00000000-0000-4000-8000-000000000982',
    'outbox-admin@example.test',
    'Outbox Admin',
    true
  );

insert into auth.sessions (id, user_id)
values (
  '10000000-0000-4000-8000-000000000982',
  '00000000-0000-4000-8000-000000000982'
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
) values (
  '10000000-0000-4000-8000-000000000981',
  '00000000-0000-4000-8000-000000000981',
  'account_access',
  'onboarding_settings',
  'account_deletion',
  'Exclusao da conta',
  'Solicito a exclusao integral da minha conta.',
  'in_progress',
  'outbox-target@example.test',
  '{"request_kind":"account_erasure"}'::jsonb
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
  request_source
) values (
  '20000000-0000-4000-8000-000000000981',
  'KC-DSR-20260728-ABCDEF0123456789',
  '00000000-0000-4000-8000-000000000981',
  '10000000-0000-4000-8000-000000000981',
  repeat('a', 64),
  'account_erasure',
  'partial_failure',
  'outbox-erasure-fixture-981',
  'json',
  'settings'
);

insert into public.account_erasure_requests (
  id,
  help_request_id,
  data_subject_request_id,
  user_id,
  email_hash,
  status,
  processed_by,
  metadata,
  operation_version,
  operation_claim_token,
  operation_claimed_at,
  operation_claim_expires_at,
  operation_claimed_by,
  operation_claim_session_id
) values (
  '30000000-0000-4000-8000-000000000981',
  '10000000-0000-4000-8000-000000000981',
  '20000000-0000-4000-8000-000000000981',
  '00000000-0000-4000-8000-000000000981',
  repeat('b', 64),
  'partial_failure',
  '00000000-0000-4000-8000-000000000982',
  '{"auth_deleted":true,"notification_pending":true}'::jsonb,
  2,
  '40000000-0000-4000-8000-000000000981',
  now(),
  now() + interval '15 minutes',
  '00000000-0000-4000-8000-000000000982',
  '10000000-0000-4000-8000-000000000982'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000982","role":"service_role"}',
  true
);
set local role service_role;

select extensions.is(
  public.kc_stage_account_erasure_completion_outbox(
    '30000000-0000-4000-8000-000000000981',
    '40000000-0000-4000-8000-000000000981',
    '20000000-0000-4000-8000-000000000981',
    repeat('A', 64),
    repeat('B', 16),
    'v1',
    3600
  ) ->> 'status',
  'staged',
  'ciphertext is staged before Help redaction while the core is already erased'
);
select extensions.throws_ok(
  $$select public.kc_claim_account_erasure_completion_outbox(
    '30000000-0000-4000-8000-000000000981',
    '40000000-0000-4000-8000-000000000981'
  )$$,
  'P0001',
  'ERASURE_WORKFLOW_STATUS_INVALID',
  'recipient retrieval is blocked before workflow and DSR finalization'
);

reset role;

select extensions.ok(
  (
    select recipient_ciphertext = repeat('A', 64)
      and recipient_nonce = repeat('B', 16)
      and position('outbox-target@example.test' in recipient_ciphertext) = 0
    from kc_private.account_erasure_completion_outbox
    where workflow_id = '30000000-0000-4000-8000-000000000981'
  ),
  'database stores ciphertext/nonce only and never the raw recipient'
);

update public.help_requests
set user_id = null,
    type = 'account_access',
    topic = 'onboarding_settings',
    subtopic = 'account_deletion',
    subject = 'Solicitacao LGPD atendida',
    message = 'Conteudo removido por solicitacao LGPD.',
    priority = 'normal',
    status = 'resolved',
    page_path = null,
    contact_email = 'lgpd-bbbbbbbbbbbb@redacted.kinocampus.local',
    allow_contact = false,
    metadata = jsonb_build_object(
      'request_kind', 'account_erasure',
      'lgpd_erasure', jsonb_build_object(
        'request_id', '30000000-0000-4000-8000-000000000981',
        'subject_hash', repeat('b', 64),
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
where id = '10000000-0000-4000-8000-000000000981';
update public.account_erasure_requests
set status = 'erased',
    metadata = '{"auth_deleted":true,"notification_pending":true}'::jsonb
where id = '30000000-0000-4000-8000-000000000981';
update public.data_subject_requests
set status = 'processing'
where id = '20000000-0000-4000-8000-000000000981';
update public.data_subject_requests
set status = 'completed',
    completed_at = now()
where id = '20000000-0000-4000-8000-000000000981';

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000982","role":"service_role"}',
  true
);
set local role service_role;

create temporary table pg_temp.account_erasure_outbox_claims (
  attempt integer primary key,
  result jsonb not null
);

insert into pg_temp.account_erasure_outbox_claims (attempt, result)
select
  1,
  public.kc_claim_account_erasure_completion_outbox(
    '30000000-0000-4000-8000-000000000981',
    '40000000-0000-4000-8000-000000000981'
  );

select extensions.is(
  (
    select result ->> 'status'
    from pg_temp.account_erasure_outbox_claims
    where attempt = 1
  ),
  'staged',
  'first SMTP attempt receives a staged ciphertext through its delivery claim'
);
select extensions.throws_ok(
  $$select public.kc_claim_account_erasure_completion_outbox(
    '30000000-0000-4000-8000-000000000981',
    '40000000-0000-4000-8000-000000000981'
  )$$,
  '55P03',
  'COMPLETION_OUTBOX_DELIVERY_ALREADY_CLAIMED',
  'a concurrent retry cannot replace a live delivery claim'
);
select extensions.throws_ok(
  $$select public.kc_accept_account_erasure_completion_delivery(
    '30000000-0000-4000-8000-000000000981',
    '40000000-0000-4000-8000-000000000981',
    '50000000-0000-4000-8000-000000000981'
  )$$,
  '40001',
  'COMPLETION_OUTBOX_ACCEPT_CONFLICT',
  'SMTP acceptance is CAS-bound to the delivery claim token'
);
select extensions.is(
  public.kc_release_account_erasure_completion_delivery(
    '30000000-0000-4000-8000-000000000981',
    '40000000-0000-4000-8000-000000000981',
    (
      select (result ->> 'delivery_claim_token')::uuid
      from pg_temp.account_erasure_outbox_claims
      where attempt = 1
    )
  ),
  '{"ok":true,"released":true}'::jsonb,
  'an SMTP failure releases only its matching delivery claim'
);

insert into pg_temp.account_erasure_outbox_claims (attempt, result)
select
  2,
  public.kc_claim_account_erasure_completion_outbox(
    '30000000-0000-4000-8000-000000000981',
    '40000000-0000-4000-8000-000000000981'
  );

select extensions.ok(
  (
    select
      first_claim.result ->> 'delivery_claim_token'
        <> retry_claim.result ->> 'delivery_claim_token'
      and retry_claim.result ->> 'recipient_ciphertext' = repeat('A', 64)
      and retry_claim.result ->> 'recipient_nonce' = repeat('B', 16)
    from pg_temp.account_erasure_outbox_claims first_claim
    join pg_temp.account_erasure_outbox_claims retry_claim on retry_claim.attempt = 2
    where first_claim.attempt = 1
  ),
  'a refreshed retry receives a new CAS token without exposing or rewriting the recipient'
);

select extensions.is(
  public.kc_accept_account_erasure_completion_delivery(
    '30000000-0000-4000-8000-000000000981',
    '40000000-0000-4000-8000-000000000981',
    (
      select (result ->> 'delivery_claim_token')::uuid
      from pg_temp.account_erasure_outbox_claims
      where attempt = 2
    )
  ) - 'accepted_at',
  '{"ok":true,"status":"accepted","ciphertext_deleted":true}'::jsonb,
  'SMTP acceptance atomically removes ciphertext while retaining retry evidence'
);

select extensions.is(
  public.kc_claim_account_erasure_completion_outbox(
    '30000000-0000-4000-8000-000000000981',
    '40000000-0000-4000-8000-000000000981'
  ) ->> 'status',
  'accepted',
  'a refreshed retry observes prior SMTP acceptance and does not resend'
);

reset role;

select extensions.ok(
  (
    select status = 'accepted'
      and recipient_ciphertext is null
      and recipient_nonce is null
      and accepted_at is not null
    from kc_private.account_erasure_completion_outbox
    where workflow_id = '30000000-0000-4000-8000-000000000981'
  ),
  'no recipient ciphertext remains after provider acceptance'
);

update kc_private.account_erasure_completion_outbox
set created_at = now() - interval '3 minutes',
    last_attempt_at = now() - interval '2 minutes',
    accepted_at = now() - interval '90 seconds',
    expires_at = now() - interval '1 minute'
where workflow_id = '30000000-0000-4000-8000-000000000981';

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000982","role":"service_role"}',
  true
);
set local role service_role;

select extensions.is(
  public.kc_purge_expired_account_erasure_completion_outbox(100),
  '{"ok":true,"purged":1,"ciphertext_retained":false}'::jsonb,
  'TTL purge deletes expired staged or accepted outbox rows'
);

reset role;

select extensions.is(
  (
    select count(*)::integer
    from kc_private.account_erasure_completion_outbox
    where workflow_id = '30000000-0000-4000-8000-000000000981'
  ),
  0,
  'no outbox row remains after TTL purge'
);

insert into kc_private.account_erasure_completion_outbox (
  workflow_id,
  data_subject_request_id,
  recipient_ciphertext,
  recipient_nonce,
  key_version,
  created_at,
  expires_at
) values (
  '30000000-0000-4000-8000-000000000981',
  '20000000-0000-4000-8000-000000000981',
  repeat('C', 64),
  repeat('D', 16),
  'v1',
  now() - interval '2 minutes',
  now() - interval '1 minute'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000982","role":"service_role"}',
  true
);
set local role service_role;

select extensions.ok(
  (
    select result ->> 'status' = 'expired'
      and (result ->> 'ok')::boolean = false
      and result -> 'recipient_ciphertext' = 'null'::jsonb
      and result -> 'recipient_nonce' = 'null'::jsonb
    from (
      select public.kc_claim_account_erasure_completion_outbox(
        '30000000-0000-4000-8000-000000000981',
        '40000000-0000-4000-8000-000000000981'
      ) as result
    ) expired_claim
  ),
  'claiming an expired row returns no ciphertext instead of raising and rolling back its deletion'
);

reset role;

select extensions.is(
  (
    select count(*)::integer
    from kc_private.account_erasure_completion_outbox
    where workflow_id = '30000000-0000-4000-8000-000000000981'
  ),
  0,
  'expired claim path commits the ciphertext deletion'
);

select extensions.finish();

rollback;

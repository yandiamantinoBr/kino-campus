begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

select extensions.ok(
  pg_catalog.to_regprocedure(
    'public.kc_link_verified_help_request_to_account_erasure(uuid,text,uuid,uuid,text,text,timestamptz)'
  ) is not null,
  'verified account-erasure identity binder exists'
);
select extensions.ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.kc_link_verified_help_request_to_account_erasure(uuid,text,uuid,uuid,text,text,timestamptz)',
    'execute'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.kc_link_verified_help_request_to_account_erasure(uuid,text,uuid,uuid,text,text,timestamptz)',
    'execute'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'public.kc_link_verified_help_request_to_account_erasure(uuid,text,uuid,uuid,text,text,timestamptz)',
    'execute'
  ),
  'only service_role can execute the identity binder'
);
select extensions.ok(
  not pg_catalog.has_table_privilege(
    'authenticated',
    'public.account_erasure_requests',
    'select'
  )
  and pg_catalog.has_table_privilege(
    'service_role',
    'public.account_erasure_requests',
    'select'
  ),
  'browser workflow SELECT is revoked while service_role remains operational'
);
select extensions.ok(
  not pg_catalog.has_any_column_privilege(
    'authenticated',
    'public.account_erasure_requests',
    'select,insert,update,references'
  )
  and not pg_catalog.has_any_column_privilege(
    'anon',
    'public.account_erasure_requests',
    'select,insert,update,references'
  ),
  'browser workflow column grants are revoked as well as table grants'
);
select extensions.ok(
  not exists (
    select 1
    from pg_catalog.pg_policy policy_row
    where policy_row.polrelid =
      'public.account_erasure_requests'::regclass
      and policy_row.polcmd = 'r'
      and (
        policy_row.polroles = array[0::oid]
        or policy_row.polroles && array[
          (
            select role_row.oid
            from pg_catalog.pg_roles role_row
            where role_row.rolname = 'authenticated'
          )
        ]::oid[]
      )
  ),
  'no authenticated SELECT policy remains on the operational workflow'
);
select extensions.ok(
  not pg_catalog.has_table_privilege(
    'service_role',
    'kc_private.account_erasure_ticket_identity_links',
    'select'
  )
  and not pg_catalog.has_table_privilege(
    'authenticated',
    'kc_private.account_erasure_ticket_identity_links',
    'select'
  ),
  'identity evidence ledger is reachable only through its definer binder'
);
select extensions.ok(
  not exists (
    select 1
    from information_schema.columns column_row
    where column_row.table_schema = 'kc_private'
      and column_row.table_name =
        'account_erasure_ticket_identity_links'
      and column_row.column_name in (
        'account_email',
        'email',
        'identity_reference',
        'reference',
        'raw_reference'
      )
  ),
  'private evidence ledger has no raw e-mail or reference column'
);
select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'public.kc_link_verified_help_request_to_account_erasure(uuid,text,uuid,uuid,text,text,timestamptz)'::regprocedure
  ) like '%kc_materialize_anonymous_erasure_dsr%'
  and pg_catalog.pg_get_functiondef(
    'kc_private.kc_materialize_anonymous_erasure_dsr(uuid,text,uuid,uuid)'::regprocedure
  ) like '%kc_assert_active_admin_session%'
  and pg_catalog.pg_get_functiondef(
    'kc_private.kc_materialize_anonymous_erasure_dsr(uuid,text,uuid,uuid)'::regprocedure
  ) like '%kc_lock_privacy_subject%'
  and pg_catalog.pg_get_functiondef(
    'kc_private.kc_link_verified_help_request_to_account_erasure_strict_v1(uuid,text,uuid,uuid,text,text,timestamptz)'::regprocedure
  ) like '%ERASURE_IDENTITY_ACCOUNT_NOT_UNIQUE%',
  'bridge and strict binder prove active session, subject lock and unique Auth account'
);
select extensions.ok(
  pg_catalog.pg_get_functiondef(
    'kc_private.kc_normalize_authenticated_privacy_help_email()'::regprocedure
  ) like '%new.user_id is null%',
  'authenticated Help normalization preserves the null-owner redaction path'
);
select extensions.ok(
  (
    select
      pg_catalog.strpos(
        function_definition,
        'request_row.idempotency_key = v_idempotency_key'
      ) > 0
      and pg_catalog.strpos(
        function_definition,
        '''reuse_reason'', ''idempotency_key'''
      ) > pg_catalog.strpos(
        function_definition,
        'request_row.idempotency_key = v_idempotency_key'
      )
      and pg_catalog.strpos(
        function_definition,
        '''reuse_reason'', ''idempotency_key'''
      ) < pg_catalog.strpos(
        function_definition,
        'PRIVACY_SUBJECT_IRREVERSIBLY_CLOSING'
      )
    from (
      select pg_catalog.pg_get_functiondef(
        'kc_private.kc_create_data_subject_request_v2(text,text,text,text)'::regprocedure
      ) as function_definition
    ) definition
  ),
  'terminal idempotency lookup and sanitized return precede closure handling'
);

insert into auth.users (id, email)
values
  (
    '99000000-0000-4000-8000-000000000001',
    'identity-link-admin@example.test'
  ),
  (
    '99000000-0000-4000-8000-000000000002',
    'identity-link-target@example.test'
  ),
  (
    '99000000-0000-4000-8000-000000000003',
    'identity-link-terminal@example.test'
  ),
  (
    '99000000-0000-4000-8000-000000000004',
    'identity-link-closed@example.test'
  ),
  (
    '99000000-0000-4000-8000-000000000005',
    'identity-link-second-admin@example.test'
  ),
  (
    '99000000-0000-4000-8000-000000000006',
    'identity-link-cancelled-retry@example.test'
  ),
  (
    '99000000-0000-4000-8000-000000000007',
    'identity-link-completed-retry@example.test'
  );

insert into public.profiles (id, email, full_name, is_admin)
values
  (
    '99000000-0000-4000-8000-000000000001',
    'identity-link-admin@example.test',
    'Identity Link Admin',
    true
  ),
  (
    '99000000-0000-4000-8000-000000000002',
    'identity-link-target@example.test',
    'Identity Link Target',
    false
  ),
  (
    '99000000-0000-4000-8000-000000000003',
    'identity-link-terminal@example.test',
    'Identity Link Terminal Target',
    false
  ),
  (
    '99000000-0000-4000-8000-000000000004',
    'identity-link-closed@example.test',
    'Identity Link Closed Target',
    false
  ),
  (
    '99000000-0000-4000-8000-000000000005',
    'identity-link-second-admin@example.test',
    'Identity Link Second Admin',
    true
  ),
  (
    '99000000-0000-4000-8000-000000000006',
    'identity-link-cancelled-retry@example.test',
    'Identity Link Cancelled Retry Target',
    false
  ),
  (
    '99000000-0000-4000-8000-000000000007',
    'identity-link-completed-retry@example.test',
    'Identity Link Completed Retry Target',
    false
  );

insert into auth.sessions (id, user_id)
values
  (
    '99100000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000001'
  ),
  (
    '99100000-0000-4000-8000-000000000005',
    '99000000-0000-4000-8000-000000000005'
  ),
  (
    '99100000-0000-4000-8000-000000000006',
    '99000000-0000-4000-8000-000000000006'
  ),
  (
    '99100000-0000-4000-8000-000000000007',
    '99000000-0000-4000-8000-000000000007'
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
values
  (
    '99200000-0000-4000-8000-000000000002',
    null,
    'account_access',
    'onboarding_settings',
    'account_deletion',
    'Excluir conta legada',
    'Solicitacao anonima legada com DSR ainda sem titular.',
    'new',
    'identity-link-target@example.test',
    '{
      "request_kind":"account_erasure",
      "account_email":"third-party-payload@example.test"
    }'::jsonb
  ),
  (
    '99200000-0000-4000-8000-000000000003',
    null,
    'account_access',
    'onboarding_settings',
    'account_deletion',
    'Excluir conta terminal',
    'Solicitacao terminal nao pode receber identidade posteriormente.',
    'in_progress',
    'identity-link-terminal@example.test',
    '{"request_kind":"account_erasure"}'::jsonb
  ),
  (
    '99200000-0000-4000-8000-000000000004',
    null,
    'account_access',
    'onboarding_settings',
    'account_deletion',
    'Excluir conta ja fechada',
    'Solicitacao nao pode cruzar a barreira irreversivel do titular.',
    'in_progress',
    'identity-link-closed@example.test',
    '{"request_kind":"account_erasure"}'::jsonb
  ),
  (
    '99200000-0000-4000-8000-000000000005',
    '99000000-0000-4000-8000-000000000002',
    'account_access',
    'onboarding_settings',
    'account_deletion',
    'Excluir conta autenticada',
    'Payload autenticado nao pode escolher outro e-mail operacional.',
    'new',
    'third-party-contact@example.test',
    '{
      "request_kind":"account_erasure",
      "account_email":"third-party-payload@example.test"
    }'::jsonb
  );

select extensions.ok(
  (
    select help_row.contact_email =
        'identity-link-target@example.test'
      and help_row.metadata ->> 'account_email' =
        'identity-link-target@example.test'
      and help_row.metadata::text not like
        '%third-party-payload@example.test%'
      and help_row.contact_email <>
        'third-party-contact@example.test'
    from public.help_requests help_row
    where help_row.id =
      '99200000-0000-4000-8000-000000000005'
  ),
  'authenticated privacy Help ignores third-party account_email/contact payload'
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
    '99300000-0000-4000-8000-000000000002',
    'KC-DSR-20260729-AAAA000000000902',
    null,
    '99200000-0000-4000-8000-000000000002',
    repeat('2', 64),
    'account_erasure',
    'received',
    'identity-link-target-0902',
    'json',
    'help',
    '[]'::jsonb
  ),
  (
    '99300000-0000-4000-8000-000000000003',
    'KC-DSR-20260729-BBBB000000000903',
    null,
    '99200000-0000-4000-8000-000000000003',
    repeat('3', 64),
    'account_erasure',
    'completed',
    'identity-link-terminal-0903',
    'json',
    'help',
    '[]'::jsonb
  ),
  (
    '99300000-0000-4000-8000-000000000004',
    'KC-DSR-20260729-CCCC000000000904',
    null,
    '99200000-0000-4000-8000-000000000004',
    repeat('4', 64),
    'account_erasure',
    'received',
    'identity-link-closed-0904',
    'json',
    'help',
    '[]'::jsonb
  ),
  (
    '99300000-0000-4000-8000-000000000006',
    'KC-DSR-20260729-DDDD000000000906',
    '99000000-0000-4000-8000-000000000006',
    null,
    repeat('6', 64),
    'account_erasure',
    'cancelled',
    'terminal-cancelled-erasure-0906',
    'json',
    'settings',
    '[]'::jsonb
  ),
  (
    '99300000-0000-4000-8000-000000000007',
    'KC-DSR-20260729-EEEE000000000907',
    '99000000-0000-4000-8000-000000000007',
    null,
    repeat('7', 64),
    'account_erasure',
    'completed',
    'terminal-completed-erasure-0907',
    'json',
    'settings',
    '[]'::jsonb
  );

insert into public.account_erasure_requests (
  id,
  help_request_id,
  data_subject_request_id,
  user_id,
  email_hash,
  status,
  metadata
)
values
  (
    '99400000-0000-4000-8000-000000000002',
    '99200000-0000-4000-8000-000000000002',
    '99300000-0000-4000-8000-000000000002',
    null,
    repeat('a', 64),
    'diagnosed',
    '{}'::jsonb
  ),
  (
    '99400000-0000-4000-8000-000000000004',
    '99200000-0000-4000-8000-000000000004',
    '99300000-0000-4000-8000-000000000004',
    '99000000-0000-4000-8000-000000000004',
    repeat('b', 64),
    'diagnosed',
    '{}'::jsonb
  );

insert into kc_private.account_erasure_subject_closures (
  subject_key_hash,
  workflow_id,
  state,
  claimed_at,
  completed_at,
  updated_at
)
values (
  kc_private.kc_privacy_subject_key(
    '99000000-0000-4000-8000-000000000004'
  ),
  '99400000-0000-4000-8000-000000000004',
  'closing',
  pg_catalog.clock_timestamp(),
  null,
  pg_catalog.clock_timestamp()
);

select set_config(
  'request.jwt.claims',
  '{
    "sub":"99000000-0000-4000-8000-000000000006",
    "role":"authenticated",
    "session_id":"99100000-0000-4000-8000-000000000006",
    "is_anonymous":false
  }',
  true
);
set local role authenticated;

select extensions.throws_ok(
  $$select public.kc_create_data_subject_request_v2(
    'account_erasure',
    'terminal-cancelled-erasure-0906',
    'xml',
    'settings'
  )$$,
  '22023',
  'DSR_UNSUPPORTED_FORMAT',
  'terminal idempotency replay does not bypass payload validation'
);

select extensions.ok(
  (
    with retry_result as (
      select public.kc_create_data_subject_request_v2(
        'account_erasure',
        'terminal-cancelled-erasure-0906',
        'json',
        'settings'
      ) as value
    )
    select
      (value ->> 'reused_existing')::boolean
      and value ->> 'reuse_reason' = 'idempotency_key'
      and value #>> '{request,status}' = 'cancelled'
      and value #>> '{request,protocol}' =
        'KC-DSR-20260729-DDDD000000000906'
      and not (value -> 'request' ? 'user_id')
      and not (value -> 'request' ? 'subject_hash')
      and not (value -> 'request' ? 'idempotency_key')
    from retry_result
  ),
  'same idempotency key recovers a cancelled erasure without private fields'
);

reset role;
select extensions.ok(
  (
    select request_row.status = 'cancelled'
      and request_row.cancelled_at is null
    from public.data_subject_requests request_row
    where request_row.id =
      '99300000-0000-4000-8000-000000000006'
  )
  and (
    select pg_catalog.count(*) = 1
    from public.data_subject_requests request_row
    where request_row.user_id =
        '99000000-0000-4000-8000-000000000006'
      and request_row.request_kind = 'account_erasure'
  ),
  'cancelled retry neither reopens nor duplicates the terminal request'
);

set local role authenticated;
select extensions.ok(
  (
    with new_request as (
      select public.kc_create_data_subject_request_v2(
        'account_erasure',
        'terminal-cancelled-new-key-0906',
        'json',
        'settings'
      ) as value
    )
    select
      not (value ->> 'reused_existing')::boolean
      and value ->> 'reuse_reason' is null
      and value #>> '{request,status}' = 'received'
      and value #>> '{request,protocol}' <>
        'KC-DSR-20260729-DDDD000000000906'
    from new_request
  ),
  'a new key may create a new erasure after a cancelled terminal request'
);

reset role;
select extensions.ok(
  (
    select pg_catalog.count(*) = 2
    from public.data_subject_requests request_row
    where request_row.user_id =
        '99000000-0000-4000-8000-000000000006'
      and request_row.request_kind = 'account_erasure'
  )
  and (
    select request_row.status = 'cancelled'
    from public.data_subject_requests request_row
    where request_row.id =
      '99300000-0000-4000-8000-000000000006'
  ),
  'new-key creation preserves the earlier cancelled request unchanged'
);

select set_config(
  'request.jwt.claims',
  '{
    "sub":"99000000-0000-4000-8000-000000000007",
    "role":"authenticated",
    "session_id":"99100000-0000-4000-8000-000000000007",
    "is_anonymous":false
  }',
  true
);
set local role authenticated;

select extensions.ok(
  (
    with retry_result as (
      select public.kc_create_data_subject_request_v2(
        'account_erasure',
        'terminal-completed-erasure-0907',
        'json',
        'settings'
      ) as value
    )
    select
      (value ->> 'reused_existing')::boolean
      and value ->> 'reuse_reason' = 'idempotency_key'
      and value #>> '{request,status}' = 'completed'
      and value #>> '{request,protocol}' =
        'KC-DSR-20260729-EEEE000000000907'
      and not (value -> 'request' ? 'user_id')
      and not (value -> 'request' ? 'subject_hash')
      and not (value -> 'request' ? 'idempotency_key')
    from retry_result
  ),
  'same idempotency key recovers a completed erasure without private fields'
);

reset role;
select extensions.ok(
  (
    select request_row.status = 'completed'
    from public.data_subject_requests request_row
    where request_row.id =
      '99300000-0000-4000-8000-000000000007'
  )
  and (
    select pg_catalog.count(*) = 1
    from public.data_subject_requests request_row
    where request_row.user_id =
        '99000000-0000-4000-8000-000000000007'
      and request_row.request_kind = 'account_erasure'
  ),
  'completed retry neither reopens nor duplicates the terminal request'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"99000000-0000-4000-8000-000000000001","role":"service_role"}',
  true
);
set local role service_role;

select extensions.throws_ok(
  $$select public.kc_link_verified_help_request_to_account_erasure(
    '99200000-0000-4000-8000-000000000002',
    'missing-identity@example.test',
    '99000000-0000-4000-8000-000000000001',
    '99100000-0000-4000-8000-000000000001',
    'support_mailbox_reply',
    repeat('a', 64),
    now() - interval '1 minute'
  )$$,
  '23514',
  'ERASURE_IDENTITY_ACCOUNT_NOT_UNIQUE',
  'zero Auth users for the supplied e-mail fails closed'
);

select extensions.throws_ok(
  $$select public.kc_link_verified_help_request_to_account_erasure(
    '99200000-0000-4000-8000-000000000002',
    'identity-link-target@example.test',
    '99000000-0000-4000-8000-000000000001',
    '99100000-0000-4000-8000-000000000099',
    'support_mailbox_reply',
    repeat('a', 64),
    now() - interval '1 minute'
  )$$,
  '42501',
  'ERASURE_ADMIN_SESSION_NOT_ACTIVE',
  'an inactive administrator session cannot bind identity'
);

select extensions.is(
  (
    select request_row.user_id
    from public.data_subject_requests request_row
    where request_row.id =
      '99300000-0000-4000-8000-000000000002'
  ),
  null::uuid,
  'failed session proof leaves the legacy DSR unbound'
);

select extensions.throws_ok(
  $$select public.kc_link_verified_help_request_to_account_erasure(
    '99200000-0000-4000-8000-000000000003',
    'identity-link-terminal@example.test',
    '99000000-0000-4000-8000-000000000001',
    '99100000-0000-4000-8000-000000000001',
    'support_mailbox_reply',
    repeat('b', 64),
    now() - interval '1 minute'
  )$$,
  '23514',
  'ERASURE_IDENTITY_DSR_STATE_INVALID',
  'a terminal DSR cannot be rebound'
);

select extensions.throws_ok(
  $$select public.kc_link_verified_help_request_to_account_erasure(
    '99200000-0000-4000-8000-000000000004',
    'identity-link-closed@example.test',
    '99000000-0000-4000-8000-000000000001',
    '99100000-0000-4000-8000-000000000001',
    'support_mailbox_reply',
    repeat('c', 64),
    now() - interval '1 minute'
  )$$,
  '55000',
  'ERASURE_IDENTITY_SUBJECT_CLOSED',
  'a durable subject closure blocks a new identity link'
);

create temporary table kc_identity_link_test_state (
  key text primary key,
  value jsonb not null
) on commit drop;

insert into kc_identity_link_test_state (key, value)
values (
  'first_link',
  public.kc_link_verified_help_request_to_account_erasure(
    '99200000-0000-4000-8000-000000000002',
    'identity-link-target@example.test',
    '99000000-0000-4000-8000-000000000001',
    '99100000-0000-4000-8000-000000000001',
    'support_mailbox_reply',
    repeat('d', 64),
    now() - interval '1 minute'
  )
);

select extensions.ok(
  (
    select (value ->> 'ok')::boolean
      and (value ->> 'linked')::boolean
      and not (value ->> 'idempotent')::boolean
      and value ->> 'protocol' =
        'KC-DSR-20260729-AAAA000000000902'
      and value ->> 'data_subject_request_status' = 'received'
      and value ->> 'workflow_status' = 'diagnosed'
      and value::text !~
        '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      and value::text not like '%identity-link-target@example.test%'
    from kc_identity_link_test_state
    where key = 'first_link'
  ),
  'binder returns only a safe protocol/status projection'
);

select extensions.ok(
  (
    select help_row.user_id =
        '99000000-0000-4000-8000-000000000002'
      and help_row.status = 'in_progress'
      and help_row.metadata ->> 'identity_attestation_hash' =
        repeat('d', 64)
      and help_row.metadata ->> 'identity_source' =
        'admin_verified_anonymous_erasure'
      and help_row.metadata ->> 'account_email' =
        'identity-link-target@example.test'
      and help_row.metadata::text not like
        '%third-party-payload@example.test%'
    from public.help_requests help_row
    where help_row.id =
      '99200000-0000-4000-8000-000000000002'
  ),
  'Help is atomically bound using hash-only evidence'
);

select extensions.ok(
  (
    select request_row.user_id =
      '99000000-0000-4000-8000-000000000002'
    from public.data_subject_requests request_row
    where request_row.id =
      '99300000-0000-4000-8000-000000000002'
  )
  and (
    select workflow_row.user_id =
        '99000000-0000-4000-8000-000000000002'
      and workflow_row.data_subject_request_id =
        '99300000-0000-4000-8000-000000000002'
      and workflow_row.email_hash = repeat('2', 64)
      and workflow_row.metadata
        #>> '{identity_assurance,target_user_id}' =
          '99000000-0000-4000-8000-000000000002'
      and workflow_row.metadata
        #>> '{identity_assurance,evidence,reference_hash}' =
          repeat('d', 64)
    from public.account_erasure_requests workflow_row
    where workflow_row.id =
      '99400000-0000-4000-8000-000000000002'
  ),
  'DSR and workflow receive one coherent internal subject binding'
);

reset role;
select extensions.ok(
  (
    select link_row.owner_user_id =
        '99000000-0000-4000-8000-000000000002'
      and link_row.attestation_hash = repeat('d', 64)
      and link_row.verification_channel = 'support_mailbox_reply'
    from kc_private.account_erasure_ticket_identity_links link_row
    where link_row.help_request_id =
      '99200000-0000-4000-8000-000000000002'
  ),
  'private immutable ledger stores only the verification hash and channel'
);
set local role service_role;

select extensions.is(
  (
    select pg_catalog.count(*)::integer
    from public.data_subject_request_events event_row
    where event_row.request_id =
      '99300000-0000-4000-8000-000000000002'
      and event_row.public_message =
        'Identidade validada; solicitacao vinculada a conta confirmada.'
  ),
  1,
  'the first link emits one public-safe DSR event'
);
select extensions.is(
  (
    select pg_catalog.count(*)::integer
    from public.audit_log audit_row
    where audit_row.entity_id =
      '99400000-0000-4000-8000-000000000002'
      and audit_row.action = 'lgpd_erasure_identity_linked'
  ),
  1,
  'the first link emits one hash-only audit event'
);

insert into kc_identity_link_test_state (key, value)
values (
  'replayed_link',
  public.kc_link_verified_help_request_to_account_erasure(
    '99200000-0000-4000-8000-000000000002',
    'identity-link-target@example.test',
    '99000000-0000-4000-8000-000000000001',
    '99100000-0000-4000-8000-000000000001',
    'support_mailbox_reply',
    repeat('d', 64),
    now() - interval '1 minute'
  )
);

select extensions.ok(
  (
    select (value ->> 'ok')::boolean
      and (value ->> 'linked')::boolean
      and (value ->> 'idempotent')::boolean
    from kc_identity_link_test_state
    where key = 'replayed_link'
  ),
  'an exact retry is explicitly idempotent'
);

reset role;
select extensions.ok(
  (
    select pg_catalog.count(*) = 1
    from kc_private.account_erasure_ticket_identity_links link_row
    where link_row.help_request_id =
      '99200000-0000-4000-8000-000000000002'
  )
  and (
    select pg_catalog.count(*) = 1
    from public.data_subject_request_events event_row
    where event_row.request_id =
      '99300000-0000-4000-8000-000000000002'
      and event_row.public_message =
        'Identidade validada; solicitacao vinculada a conta confirmada.'
  )
  and (
    select pg_catalog.count(*) = 1
    from public.audit_log audit_row
    where audit_row.entity_id =
      '99400000-0000-4000-8000-000000000002'
      and audit_row.action = 'lgpd_erasure_identity_linked'
  ),
  'idempotent replay creates no duplicate link, event or audit row'
);

set local role service_role;
select extensions.throws_ok(
  $$select public.kc_link_verified_help_request_to_account_erasure(
    '99200000-0000-4000-8000-000000000002',
    'identity-link-target@example.test',
    '99000000-0000-4000-8000-000000000005',
    '99100000-0000-4000-8000-000000000005',
    'support_mailbox_reply',
    repeat('d', 64),
    now() - interval '1 minute'
  )$$,
  '23514',
  'ERASURE_IDENTITY_LINK_CONFLICT',
  'a different administrator cannot impersonate the original retry actor'
);

select extensions.throws_ok(
  $$select public.kc_link_verified_help_request_to_account_erasure(
    '99200000-0000-4000-8000-000000000002',
    'identity-link-target@example.test',
    '99000000-0000-4000-8000-000000000001',
    '99100000-0000-4000-8000-000000000001',
    'support_mailbox_reply',
    repeat('e', 64),
    now() - interval '1 minute'
  )$$,
  '23514',
  'ERASURE_IDENTITY_LINK_CONFLICT',
  'a retry with different evidence fails closed'
);

select extensions.ok(
  (
    select (redaction_result ->> 'ok')::boolean
      and (redaction_result ->> 'rows_redacted')::integer = 1
    from (
      select public.kc_redact_account_help_requests(
        array['99200000-0000-4000-8000-000000000002'::uuid],
        repeat('2', 64),
        pg_catalog.jsonb_build_object(
          'request_id', '99400000-0000-4000-8000-000000000002',
          'erased_at', pg_catalog.clock_timestamp()
        )
      ) as redaction_result
    ) redaction
  ),
  'service redaction still succeeds with the authenticated email trigger'
);

select extensions.ok(
  (
    select help_row.user_id is null
      and help_row.contact_email =
        'lgpd-222222222222@redacted.kinocampus.local'
      and help_row.metadata ->> 'account_email' is null
      and help_row.metadata
        #>> '{lgpd_erasure,contact_redacted}' = 'true'
    from public.help_requests help_row
    where help_row.id =
      '99200000-0000-4000-8000-000000000002'
  ),
  'normalization trigger never reintroduces Auth email during Help redaction'
);

reset role;
select set_config('request.jwt.claims', '{}', true);
select extensions.finish();
rollback;

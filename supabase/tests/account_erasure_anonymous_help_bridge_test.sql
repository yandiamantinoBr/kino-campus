begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

select extensions.ok(
  pg_catalog.to_regprocedure(
    'public.kc_link_verified_help_request_to_account_erasure(uuid,text,uuid,uuid,text,text,timestamptz)'
  ) is not null
  and pg_catalog.to_regprocedure(
    'kc_private.kc_materialize_anonymous_erasure_dsr(uuid,text,uuid,uuid)'
  ) is not null
  and pg_catalog.to_regprocedure(
    'kc_private.kc_link_verified_help_request_to_account_erasure_strict_v1(uuid,text,uuid,uuid,text,text,timestamptz)'
  ) is not null,
  'public bridge and both private leaves exist'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.kc_link_verified_help_request_to_account_erasure(uuid,text,uuid,uuid,text,text,timestamptz)',
    'execute'
  )
  and not pg_catalog.has_function_privilege(
    'service_role',
    'kc_private.kc_materialize_anonymous_erasure_dsr(uuid,text,uuid,uuid)',
    'execute'
  )
  and not pg_catalog.has_function_privilege(
    'service_role',
    'kc_private.kc_link_verified_help_request_to_account_erasure_strict_v1(uuid,text,uuid,uuid,text,text,timestamptz)',
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
  'only the public wrapper is executable by service_role'
);

select extensions.ok(
  (
    select
      procedure_row.prosecdef
      and procedure_row.proconfig @> array['search_path=""']
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid = pg_catalog.to_regprocedure(
      'kc_private.kc_materialize_anonymous_erasure_dsr(uuid,text,uuid,uuid)'
    )
  )
  and (
    select
      procedure_row.prosecdef
      and procedure_row.proconfig @> array['search_path=""']
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid = pg_catalog.to_regprocedure(
      'public.kc_link_verified_help_request_to_account_erasure(uuid,text,uuid,uuid,text,text,timestamptz)'
    )
  ),
  'bridge functions are SECURITY DEFINER with an empty search_path'
);

select extensions.ok(
  (
    select
      pg_catalog.strpos(
        function_definition,
        'kc_materialize_anonymous_erasure_dsr'
      ) > 0
      and pg_catalog.strpos(
        function_definition,
        'kc_materialize_anonymous_erasure_dsr'
      ) < pg_catalog.strpos(
        function_definition,
        'kc_link_verified_help_request_to_account_erasure_strict_v1'
      )
    from (
      select pg_catalog.pg_get_functiondef(
        'public.kc_link_verified_help_request_to_account_erasure(uuid,text,uuid,uuid,text,text,timestamptz)'::regprocedure
      ) as function_definition
    ) definition
  ),
  'materialization precedes the strict binder inside one wrapper call'
);

select extensions.ok(
  (
    select
      function_definition like '%kc_lock_privacy_subject%'
      and function_definition like '%kc_assert_active_admin_session%'
      and function_definition like '%for update%'
      and function_definition like '%extensions.gen_random_bytes(32)%'
      and function_definition like '%ERASURE_IDENTITY_DSR_NOT_UNIQUE%'
      and function_definition like '%ERASURE_IDENTITY_SUBJECT_CONFLICT%'
      and function_definition not like
        '%metadata ->> ''account_email''%'
    from (
      select pg_catalog.pg_get_functiondef(
        'kc_private.kc_materialize_anonymous_erasure_dsr(uuid,text,uuid,uuid)'::regprocedure
      ) as function_definition
    ) definition
  ),
  'materializer uses trusted locks/session/randomness and ignores account_email metadata'
);

insert into auth.users (id, email)
values
  (
    '9a000000-0000-4000-8000-000000000001',
    'anonymous-bridge-admin@example.test'
  ),
  (
    '9a000000-0000-4000-8000-000000000002',
    'anonymous-bridge-zero@example.test'
  ),
  (
    '9a000000-0000-4000-8000-000000000003',
    'anonymous-bridge-existing@example.test'
  ),
  (
    '9a000000-0000-4000-8000-000000000004',
    'anonymous-bridge-duplicate@example.test'
  ),
  (
    '9a000000-0000-4000-8000-000000000005',
    'anonymous-bridge-forged@example.test'
  ),
  (
    '9a000000-0000-4000-8000-000000000006',
    'anonymous-bridge-conflict@example.test'
  ),
  (
    '9a000000-0000-4000-8000-000000000007',
    'anonymous-bridge-authenticated@example.test'
  ),
  (
    '9a000000-0000-4000-8000-000000000008',
    'anonymous-bridge-rollback@example.test'
  ),
  (
    '9a000000-0000-4000-8000-000000000009',
    'anonymous-bridge-closed@example.test'
  );

insert into public.profiles (id, email, full_name, is_admin)
values
  (
    '9a000000-0000-4000-8000-000000000001',
    'anonymous-bridge-admin@example.test',
    'Anonymous Bridge Admin',
    true
  ),
  (
    '9a000000-0000-4000-8000-000000000002',
    'anonymous-bridge-zero@example.test',
    'Anonymous Bridge Zero',
    false
  ),
  (
    '9a000000-0000-4000-8000-000000000003',
    'anonymous-bridge-existing@example.test',
    'Anonymous Bridge Existing',
    false
  ),
  (
    '9a000000-0000-4000-8000-000000000004',
    'anonymous-bridge-duplicate@example.test',
    'Anonymous Bridge Duplicate',
    false
  ),
  (
    '9a000000-0000-4000-8000-000000000005',
    'anonymous-bridge-forged@example.test',
    'Anonymous Bridge Forged',
    false
  ),
  (
    '9a000000-0000-4000-8000-000000000006',
    'anonymous-bridge-conflict@example.test',
    'Anonymous Bridge Conflict',
    false
  ),
  (
    '9a000000-0000-4000-8000-000000000007',
    'anonymous-bridge-authenticated@example.test',
    'Anonymous Bridge Authenticated',
    false
  ),
  (
    '9a000000-0000-4000-8000-000000000008',
    'anonymous-bridge-rollback@example.test',
    'Anonymous Bridge Rollback',
    false
  ),
  (
    '9a000000-0000-4000-8000-000000000009',
    'anonymous-bridge-closed@example.test',
    'Anonymous Bridge Closed',
    false
  );

insert into auth.sessions (id, user_id)
values (
  '9a100000-0000-4000-8000-000000000001',
  '9a000000-0000-4000-8000-000000000001'
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
    '9a200000-0000-4000-8000-000000000002',
    null,
    'account_access',
    'onboarding_settings',
    'account_deletion',
    'Excluir conta pelo Help',
    'Pedido anonimo ainda sem DSR.',
    'new',
    'anonymous-bridge-zero@example.test',
    '{
      "request_kind":"account_erasure",
      "account_email":"browser-metadata-is-not-authority@example.test"
    }'::jsonb
  ),
  (
    '9a200000-0000-4000-8000-000000000003',
    null,
    'account_access',
    'onboarding_settings',
    'account_deletion',
    'Excluir conta com DSR',
    'Pedido anonimo com DSR existente.',
    'new',
    'anonymous-bridge-existing@example.test',
    '{"request_kind":"account_erasure"}'::jsonb
  ),
  (
    '9a200000-0000-4000-8000-000000000004',
    null,
    'account_access',
    'onboarding_settings',
    'account_deletion',
    'Excluir conta ambigua',
    'Pedido anonimo com dois DSRs.',
    'new',
    'anonymous-bridge-duplicate@example.test',
    '{"request_kind":"account_erasure"}'::jsonb
  ),
  (
    '9a200000-0000-4000-8000-000000000005',
    null,
    'account_access',
    'onboarding_settings',
    'account_deletion',
    'Excluir conta com metadata forjada',
    'Pedido anonimo sem DSR real.',
    'new',
    'anonymous-bridge-forged@example.test',
    '{
      "request_kind":"account_erasure",
      "data_subject_request_id":"9affffff-ffff-4fff-8fff-ffffffffffff"
    }'::jsonb
  ),
  (
    '9a200000-0000-4000-8000-000000000006',
    null,
    'account_access',
    'onboarding_settings',
    'account_deletion',
    'Excluir conta com conflito',
    'Pedido anonimo concorrente com outro DSR aberto.',
    'new',
    'anonymous-bridge-conflict@example.test',
    '{"request_kind":"account_erasure"}'::jsonb
  ),
  (
    '9a200000-0000-4000-8000-000000000007',
    '9a000000-0000-4000-8000-000000000007',
    'account_access',
    'onboarding_settings',
    'account_deletion',
    'Excluir conta autenticada sem DSR',
    'Linha autenticada nao usa a ponte anonima.',
    'new',
    'third-party@example.test',
    '{"request_kind":"account_erasure"}'::jsonb
  ),
  (
    '9a200000-0000-4000-8000-000000000008',
    null,
    'account_access',
    'onboarding_settings',
    'account_deletion',
    'Excluir conta com workflow avancado',
    'Toda materializacao deve reverter se o binder estrito falhar.',
    'new',
    'anonymous-bridge-rollback@example.test',
    '{"request_kind":"account_erasure"}'::jsonb
  ),
  (
    '9a200000-0000-4000-8000-000000000009',
    null,
    'account_access',
    'onboarding_settings',
    'account_deletion',
    'Excluir conta com fechamento duravel',
    'Nenhum DSR pode atravessar a barreira irreversivel.',
    'new',
    'anonymous-bridge-closed@example.test',
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
  request_source,
  scope
)
values
  (
    '9a300000-0000-4000-8000-000000000003',
    'KC-DSR-20260729-AAAB000000000003',
    null,
    '9a200000-0000-4000-8000-000000000003',
    repeat('3', 64),
    'account_erasure',
    'received',
    'anonymous-bridge-existing-1203',
    'json',
    'help',
    '[]'::jsonb
  ),
  (
    '9a300000-0000-4000-8000-000000000041',
    'KC-DSR-20260729-AAAB000000000041',
    null,
    '9a200000-0000-4000-8000-000000000004',
    repeat('4', 64),
    'account_erasure',
    'received',
    'anonymous-bridge-duplicate-a-1204',
    'json',
    'help',
    '[]'::jsonb
  ),
  (
    '9a300000-0000-4000-8000-000000000042',
    'KC-DSR-20260729-AAAB000000000042',
    null,
    '9a200000-0000-4000-8000-000000000004',
    repeat('5', 64),
    'account_erasure',
    'received',
    'anonymous-bridge-duplicate-b-1204',
    'json',
    'help',
    '[]'::jsonb
  ),
  (
    '9a300000-0000-4000-8000-000000000006',
    'KC-DSR-20260729-AAAB000000000006',
    '9a000000-0000-4000-8000-000000000006',
    null,
    repeat('6', 64),
    'account_erasure',
    'received',
    'anonymous-bridge-conflicting-open-1206',
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
  metadata
)
values (
  '9a400000-0000-4000-8000-000000000008',
  '9a200000-0000-4000-8000-000000000008',
  null,
  repeat('8', 64),
  'confirmed',
  '{}'::jsonb
), (
  '9a400000-0000-4000-8000-000000000009',
  '9a200000-0000-4000-8000-000000000009',
  '9a000000-0000-4000-8000-000000000009',
  repeat('9', 64),
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
    '9a000000-0000-4000-8000-000000000009'
  ),
  '9a400000-0000-4000-8000-000000000009',
  'closing',
  pg_catalog.clock_timestamp(),
  null,
  pg_catalog.clock_timestamp()
);

select set_config(
  'request.jwt.claims',
  '{
    "sub":"9a000000-0000-4000-8000-000000000001",
    "role":"service_role"
  }',
  true
);
set local role service_role;

create temporary table kc_anonymous_bridge_test_state (
  key text primary key,
  value jsonb not null
) on commit drop;

insert into kc_anonymous_bridge_test_state (key, value)
values (
  'zero_dsr_link',
  public.kc_link_verified_help_request_to_account_erasure(
    '9a200000-0000-4000-8000-000000000002',
    'anonymous-bridge-zero@example.test',
    '9a000000-0000-4000-8000-000000000001',
    '9a100000-0000-4000-8000-000000000001',
    'support_mailbox_reply',
    repeat('a', 64),
    now() - interval '1 minute'
  )
);

select extensions.ok(
  (
    select
      (value ->> 'ok')::boolean
      and (value ->> 'linked')::boolean
      and not (value ->> 'idempotent')::boolean
      and value ->> 'data_subject_request_status' = 'received'
      and value ->> 'workflow_status' = 'diagnosed'
      and value ->> 'protocol' ~
        '^KC-DSR-[0-9]{8}-[A-F0-9]{16}$'
      and value::text !~*
        '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      and value::text not like
        '%anonymous-bridge-zero@example.test%'
    from kc_anonymous_bridge_test_state
    where key = 'zero_dsr_link'
  ),
  'zero-DSR anonymous Help returns only the safe binder projection'
);

reset role;
select extensions.ok(
  (
    select
      pg_catalog.count(*) = 1
      and pg_catalog.bool_and(
        request_row.user_id =
          '9a000000-0000-4000-8000-000000000002'
        and request_row.request_kind = 'account_erasure'
        and request_row.status = 'received'
        and request_row.requested_format = 'json'
        and request_row.request_source = 'help'
        and request_row.protocol ~
          '^KC-DSR-[0-9]{8}-[A-F0-9]{16}$'
        and request_row.subject_hash ~ '^[a-f0-9]{64}$'
        and request_row.idempotency_key ~ '^[a-f0-9]{64}$'
        and request_row.subject_hash <> request_row.idempotency_key
        and request_row.subject_hash <> repeat('a', 64)
        and request_row.idempotency_key <> repeat('a', 64)
        and request_row.scope = '[
          "account",
          "profile",
          "authored_content",
          "interactions",
          "communications",
          "preferences",
          "consents",
          "storage_objects",
          "linked_identifiers"
        ]'::jsonb
      )
    from public.data_subject_requests request_row
    where request_row.help_request_id =
      '9a200000-0000-4000-8000-000000000002'
  ),
  'materialized DSR has server-generated opaque identifiers and canonical scope'
);

select extensions.ok(
  (
    select
      pg_catalog.count(*) = 2
      and pg_catalog.count(*) filter (
        where event_row.event_type = 'created'
          and event_row.actor_user_id =
            '9a000000-0000-4000-8000-000000000001'
      ) = 1
      and pg_catalog.count(*) filter (
        where event_row.event_type = 'status_changed'
      ) = 1
    from public.data_subject_request_events event_row
    join public.data_subject_requests request_row
      on request_row.id = event_row.request_id
    where request_row.help_request_id =
      '9a200000-0000-4000-8000-000000000002'
  )
  and exists (
    select 1
    from public.account_erasure_requests workflow_row
    join public.data_subject_requests request_row
      on request_row.id = workflow_row.data_subject_request_id
    where request_row.help_request_id =
        '9a200000-0000-4000-8000-000000000002'
      and workflow_row.user_id =
        '9a000000-0000-4000-8000-000000000002'
      and workflow_row.status = 'diagnosed'
  )
  and exists (
    select 1
    from kc_private.account_erasure_ticket_identity_links link_row
    where link_row.help_request_id =
      '9a200000-0000-4000-8000-000000000002'
  ),
  'DSR creation, link event, workflow and immutable ledger commit together'
);

set local role service_role;
insert into kc_anonymous_bridge_test_state (key, value)
values (
  'zero_dsr_replay',
  public.kc_link_verified_help_request_to_account_erasure(
    '9a200000-0000-4000-8000-000000000002',
    'anonymous-bridge-zero@example.test',
    '9a000000-0000-4000-8000-000000000001',
    '9a100000-0000-4000-8000-000000000001',
    'support_mailbox_reply',
    repeat('a', 64),
    now() - interval '1 minute'
  )
);

select extensions.ok(
  (
    select
      (value ->> 'idempotent')::boolean
    from kc_anonymous_bridge_test_state
    where key = 'zero_dsr_replay'
  ),
  'exact retry is explicitly idempotent'
);

reset role;
select extensions.ok(
  (
    select pg_catalog.count(*) = 1
    from public.data_subject_requests request_row
    where request_row.help_request_id =
      '9a200000-0000-4000-8000-000000000002'
  )
  and (
    select pg_catalog.count(*) = 2
    from public.data_subject_request_events event_row
    join public.data_subject_requests request_row
      on request_row.id = event_row.request_id
    where request_row.help_request_id =
      '9a200000-0000-4000-8000-000000000002'
  )
  and (
    select pg_catalog.count(*) = 1
    from kc_private.account_erasure_ticket_identity_links link_row
    where link_row.help_request_id =
      '9a200000-0000-4000-8000-000000000002'
  ),
  'retry creates no duplicate DSR, event or identity ledger row'
);

set local role service_role;
insert into kc_anonymous_bridge_test_state (key, value)
values (
  'existing_dsr_link',
  public.kc_link_verified_help_request_to_account_erasure(
    '9a200000-0000-4000-8000-000000000003',
    'anonymous-bridge-existing@example.test',
    '9a000000-0000-4000-8000-000000000001',
    '9a100000-0000-4000-8000-000000000001',
    'verified_email_challenge',
    repeat('b', 64),
    now() - interval '2 minutes'
  )
);

select extensions.ok(
  (
    select
      value ->> 'protocol' = 'KC-DSR-20260729-AAAB000000000003'
      and not (value ->> 'idempotent')::boolean
    from kc_anonymous_bridge_test_state
    where key = 'existing_dsr_link'
  ),
  'one existing DSR is validated and reused'
);

reset role;
select extensions.ok(
  (
    select
      pg_catalog.count(*) = 1
      and pg_catalog.bool_and(
        request_row.id =
          '9a300000-0000-4000-8000-000000000003'
        and request_row.user_id =
          '9a000000-0000-4000-8000-000000000003'
      )
    from public.data_subject_requests request_row
    where request_row.help_request_id =
      '9a200000-0000-4000-8000-000000000003'
  ),
  'reuse neither replaces nor duplicates the existing DSR'
);

set local role service_role;
select extensions.throws_ok(
  $$select public.kc_link_verified_help_request_to_account_erasure(
    '9a200000-0000-4000-8000-000000000004',
    'anonymous-bridge-duplicate@example.test',
    '9a000000-0000-4000-8000-000000000001',
    '9a100000-0000-4000-8000-000000000001',
    'support_mailbox_reply',
    repeat('c', 64),
    now() - interval '1 minute'
  )$$,
  '23514',
  'ERASURE_IDENTITY_DSR_NOT_UNIQUE',
  'more than one DSR fails closed'
);

select extensions.throws_ok(
  $$select public.kc_link_verified_help_request_to_account_erasure(
    '9a200000-0000-4000-8000-000000000005',
    'anonymous-bridge-forged@example.test',
    '9a000000-0000-4000-8000-000000000001',
    '9a100000-0000-4000-8000-000000000001',
    'support_mailbox_reply',
    repeat('d', 64),
    now() - interval '1 minute'
  )$$,
  '23514',
  'ERASURE_IDENTITY_DSR_MISMATCH',
  'a browser-supplied DSR id is never materialization authority'
);

select extensions.throws_ok(
  $$select public.kc_link_verified_help_request_to_account_erasure(
    '9a200000-0000-4000-8000-000000000006',
    'anonymous-bridge-conflict@example.test',
    '9a000000-0000-4000-8000-000000000001',
    '9a100000-0000-4000-8000-000000000001',
    'support_mailbox_reply',
    repeat('e', 64),
    now() - interval '1 minute'
  )$$,
  '23514',
  'ERASURE_IDENTITY_SUBJECT_CONFLICT',
  'an existing open erasure for the subject blocks materialization'
);

select extensions.throws_ok(
  $$select public.kc_link_verified_help_request_to_account_erasure(
    '9a200000-0000-4000-8000-000000000007',
    'anonymous-bridge-authenticated@example.test',
    '9a000000-0000-4000-8000-000000000001',
    '9a100000-0000-4000-8000-000000000001',
    'support_mailbox_reply',
    repeat('f', 64),
    now() - interval '1 minute'
  )$$,
  '23514',
  'ERASURE_IDENTITY_DSR_NOT_UNIQUE',
  'zero-DSR materialization is limited to anonymous Help'
);

select extensions.throws_ok(
  $$select public.kc_link_verified_help_request_to_account_erasure(
    '9a200000-0000-4000-8000-000000000008',
    'anonymous-bridge-rollback@example.test',
    '9a000000-0000-4000-8000-000000000001',
    '9a100000-0000-4000-8000-000000000001',
    'support_mailbox_reply',
    repeat('1', 64),
    now() - interval '1 minute'
  )$$,
  '23514',
  'ERASURE_IDENTITY_WORKFLOW_STATE_INVALID',
  'strict binder failure rolls back the materialized DSR'
);

select extensions.throws_ok(
  $$select public.kc_link_verified_help_request_to_account_erasure(
    '9a200000-0000-4000-8000-000000000009',
    'anonymous-bridge-closed@example.test',
    '9a000000-0000-4000-8000-000000000001',
    '9a100000-0000-4000-8000-000000000001',
    'support_mailbox_reply',
    repeat('2', 64),
    now() - interval '1 minute'
  )$$,
  '55000',
  'ERASURE_IDENTITY_SUBJECT_CLOSED',
  'durable subject closure blocks zero-DSR materialization'
);

reset role;
select extensions.ok(
  not exists (
    select 1
    from public.data_subject_requests request_row
    where request_row.help_request_id in (
      '9a200000-0000-4000-8000-000000000005',
      '9a200000-0000-4000-8000-000000000006',
      '9a200000-0000-4000-8000-000000000007',
      '9a200000-0000-4000-8000-000000000008',
      '9a200000-0000-4000-8000-000000000009'
    )
  )
  and (
    select workflow_row.status = 'confirmed'
      and workflow_row.data_subject_request_id is null
    from public.account_erasure_requests workflow_row
    where workflow_row.id =
      '9a400000-0000-4000-8000-000000000008'
  )
  and not exists (
    select 1
    from kc_private.account_erasure_ticket_identity_links link_row
    where link_row.help_request_id in (
      '9a200000-0000-4000-8000-000000000005',
      '9a200000-0000-4000-8000-000000000006',
      '9a200000-0000-4000-8000-000000000007',
      '9a200000-0000-4000-8000-000000000008',
      '9a200000-0000-4000-8000-000000000009'
    )
  ),
  'failed branches leave no DSR, workflow mutation or ledger residue'
);

select extensions.finish();
rollback;

begin;

create extension if not exists pgtap with schema extensions;

select extensions.no_plan();

select extensions.has_table(
  'kc_private',
  'account_erasure_subject_closures',
  'durable private subject-closure table exists'
);
select extensions.has_column(
  'public',
  'account_erasure_requests',
  'operation_claim_session_id',
  'workflow claim records the administrator session'
);
select extensions.ok(
  to_regprocedure(
    'public.kc_renew_account_erasure_operation(uuid,uuid,integer,uuid,uuid,integer)'
  ) is not null,
  'service-only heartbeat RPC exists'
);
select extensions.ok(
  to_regprocedure(
    'public.kc_upsert_account_erasure_workflow(uuid,uuid,uuid,text,text,uuid,uuid,jsonb,jsonb)'
  ) is not null,
  'atomic workflow upsert RPC exists'
);
select extensions.ok(
  not has_function_privilege(
    'service_role',
    'public.kc_claim_account_erasure_operation(uuid,text,integer,uuid,integer)',
    'execute'
  ),
  'legacy claim that cannot prove an administrator session is revoked'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.kc_claim_account_erasure_operation(uuid,text,integer,uuid,uuid,integer)',
    'execute'
  ),
  'session-bound claim is service-role callable'
);
select extensions.ok(
  not has_function_privilege(
    'service_role',
    'kc_private.kc_transition_data_subject_request(uuid,text,text,uuid,text,text)',
    'execute'
  ),
  'service role cannot bypass DSR session checks through the private transition'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.kc_transition_data_subject_request_for_admin_session(uuid,text,text,uuid,uuid,text,text)',
    'execute'
  ),
  'session-bound administrator DSR transition is service-role callable'
);
select extensions.ok(
  not has_function_privilege(
    'service_role',
    'public.kc_record_account_erasure_copy_decision(uuid,uuid,text,text,timestamptz,boolean)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.kc_record_account_erasure_copy_decision(uuid,uuid,uuid,text,text,timestamptz,boolean)',
    'execute'
  ),
  'copy guidance decisions require the session-bound signature'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'kc_private.kc_create_data_subject_request(text,text,text,text)',
    'execute'
  ),
  'authenticated callers cannot bypass v2 through the legacy private creator'
);
select extensions.ok(
  not has_table_privilege(
    'authenticated',
    'public.account_erasure_requests',
    'select'
  ),
  'authenticated administrators must use the service-only Edge projection'
);
select extensions.ok(
  not has_table_privilege(
    'authenticated',
    'public.account_erasure_requests',
    'insert,update,delete'
  ),
  'browser roles cannot mutate erasure workflow state directly'
);
select extensions.ok(
  not exists (
    select 1
    from pg_catalog.pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'account_erasure_requests'
      and policy_row.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and policy_row.permissive = 'PERMISSIVE'
      and 'authenticated'::name = any(policy_row.roles)
  ),
  'no permissive authenticated write policy remains on erasure workflows'
);
select extensions.ok(
  (
    select procedure_row.prosrc like '%kc_lock_privacy_subject(new.user_id)%'
      and procedure_row.prosrc like '%PRIVACY_SUBJECT_IRREVERSIBLY_CLOSING%'
    from pg_proc procedure_row
    where procedure_row.oid =
      'kc_private.kc_guard_dsr_against_erasure_closure()'::regprocedure
  ),
  'the DSR insert guard shares the per-subject transaction lock'
);
select extensions.ok(
  (
    select procedure_row.prosrc like '%pg_advisory_xact_lock%'
      and procedure_row.prosrc like '%for update%'
      and procedure_row.prosrc like '%ERASURE_WORKFLOW_UPSERT_CONFLICT%'
    from pg_proc procedure_row
    where procedure_row.oid =
      'public.kc_upsert_account_erasure_workflow(uuid,uuid,uuid,text,text,uuid,uuid,jsonb,jsonb)'::regprocedure
  ),
  'workflow creation is serialized and revalidated under row lock'
);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000a01', 'lease-admin@example.test'),
  ('00000000-0000-4000-8000-000000000a02', 'canonical-copy@example.test'),
  ('00000000-0000-4000-8000-000000000a03', 'closing-subject@example.test');

insert into public.profiles (id, email, full_name, is_admin)
values
  (
    '00000000-0000-4000-8000-000000000a01',
    'lease-admin@example.test',
    'Lease Admin',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000a02',
    'canonical-copy@example.test',
    'Canonical Copy',
    false
  ),
  (
    '00000000-0000-4000-8000-000000000a03',
    'closing-subject@example.test',
    'Closing Subject',
    false
  );

insert into auth.sessions (id, user_id)
values
  (
    '10000000-0000-4000-8000-000000000a01',
    '00000000-0000-4000-8000-000000000a01'
  ),
  (
    '10000000-0000-4000-8000-000000000a02',
    '00000000-0000-4000-8000-000000000a02'
  ),
  (
    '10000000-0000-4000-8000-000000000a03',
    '00000000-0000-4000-8000-000000000a03'
  );

create temporary table kc_closure_lease_test_state (
  key text primary key,
  value jsonb not null
) on commit drop;
grant select, insert, update on kc_closure_lease_test_state
  to authenticated, service_role;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000a02","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000a02"}',
  true
);
set local role authenticated;

insert into kc_closure_lease_test_state (key, value)
values (
  'copy_first',
  public.kc_create_data_subject_request_v2(
    'data_access_copy',
    'closure-copy-first-0001',
    'json',
    'settings'
  )
);
insert into kc_closure_lease_test_state (key, value)
values (
  'copy_reload',
  public.kc_create_data_subject_request_v2(
    'data_access_copy',
    'closure-copy-reload-0002',
    'json',
    'settings'
  )
);

select extensions.is(
  (
    select value #>> '{request,id}'
    from kc_closure_lease_test_state
    where key = 'copy_reload'
  ),
  (
    select value #>> '{request,id}'
    from kc_closure_lease_test_state
    where key = 'copy_first'
  ),
  'reload with another idempotency key returns the canonical open copy'
);
select extensions.is(
  (
    select value ->> 'reuse_reason'
    from kc_closure_lease_test_state
    where key = 'copy_reload'
  ),
  'open_data_access_copy',
  'canonical recovery explains why the request was reused'
);
select extensions.is(
  (
    select (
      public.kc_create_data_subject_request(
        'data_access_copy',
        'closure-copy-legacy-0003',
        'json',
        'settings'
      )
    ).id::text
  ),
  (
    select value #>> '{request,id}'
    from kc_closure_lease_test_state
    where key = 'copy_first'
  ),
  'legacy public creator delegates to canonical v2 behavior'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

select extensions.is(
  (
    select count(*)::integer
    from public.data_subject_requests request_row
    where request_row.user_id =
      '00000000-0000-4000-8000-000000000a02'
      and request_row.request_kind = 'data_access_copy'
      and request_row.status in (
        'received',
        'processing',
        'ready',
        'failed',
        'partial_failure'
      )
  ),
  1,
  'canonical retries create exactly one open copy row'
);

update public.data_subject_requests request_row
set
  created_at = pg_catalog.clock_timestamp() - interval '1 hour',
  status = 'ready',
  ready_at = pg_catalog.clock_timestamp() - interval '30 minutes',
  expires_at = pg_catalog.clock_timestamp() - interval '1 minute'
where request_row.id = (
  select (value #>> '{request,id}')::uuid
  from kc_closure_lease_test_state
  where key = 'copy_first'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000a02","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000a02"}',
  true
);
set local role authenticated;

insert into kc_closure_lease_test_state (key, value)
values (
  'copy_expired_ready_reload',
  public.kc_create_data_subject_request_v2(
    'data_access_copy',
    'closure-copy-expired-ready-0003',
    'json',
    'settings'
  )
);
select extensions.is(
  (
    select value #>> '{request,id}'
    from kc_closure_lease_test_state
    where key = 'copy_expired_ready_reload'
  ),
  (
    select value #>> '{request,id}'
    from kc_closure_lease_test_state
    where key = 'copy_first'
  ),
  'an expired ready window reuses the canonical protocol on the first retry'
);
select extensions.ok(
  (
    select (value #>> '{request,expires_at}')::timestamptz >
      pg_catalog.clock_timestamp() + interval '14 minutes'
      and value #>> '{request,status}' = 'ready'
      and value ->> 'reuse_reason' =
        'open_data_access_copy_ready_window_renewed'
    from kc_closure_lease_test_state
    where key = 'copy_expired_ready_reload'
  ),
  'the canonical ready window is renewed atomically before it is returned'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

select extensions.is(
  (
    select count(*)::integer
    from public.data_subject_requests request_row
    where request_row.user_id =
      '00000000-0000-4000-8000-000000000a02'
      and request_row.request_kind = 'data_access_copy'
  ),
  1,
  'window renewal does not consume a new request or bypass creation quotas'
);
select extensions.throws_ok(
  $$
    insert into public.data_subject_requests (
      protocol,
      user_id,
      subject_hash,
      request_kind,
      status,
      idempotency_key,
      requested_format,
      request_source,
      scope
    ) values (
      'KC-DSR-20260729-AAAA000000000001',
      '00000000-0000-4000-8000-000000000a02',
      repeat('a', 64),
      'data_access_copy',
      'received',
      'closure-copy-bypass-0004',
      'json',
      'api',
      '[]'::jsonb
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "data_subject_requests_one_open_export_kind_per_user_uidx"',
  'partial uniqueness rejects a concurrent direct-insert bypass'
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
  '20000000-0000-4000-8000-000000000a03',
  '00000000-0000-4000-8000-000000000a03',
  'account_access',
  'onboarding_settings',
  'account_deletion',
  'Excluir conta',
  'Pedido autenticado de exclusao.',
  'in_progress',
  'closing-subject@example.test',
  '{
    "request_kind":"account_erasure",
    "identity_source":"authenticated_account",
    "export_before_erasure":"no_copy_needed"
  }'::jsonb
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
) values (
  '30000000-0000-4000-8000-000000000a03',
  'KC-DSR-20260729-BBBB000000000003',
  '00000000-0000-4000-8000-000000000a03',
  '20000000-0000-4000-8000-000000000a03',
  repeat('b', 64),
  'account_erasure',
  'pending_confirmation',
  'closure-erasure-0003',
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
  operation_version,
  metadata
) values (
  '40000000-0000-4000-8000-000000000a03',
  '20000000-0000-4000-8000-000000000a03',
  '30000000-0000-4000-8000-000000000a03',
  '00000000-0000-4000-8000-000000000a03',
  repeat('c', 64),
  'pending_confirmation',
  1,
  '{}'::jsonb
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000a01","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000a01"}',
  true
);
set local role authenticated;

select extensions.throws_ok(
  $$
    select workflow_row.status
    from public.account_erasure_requests workflow_row
    where workflow_row.id =
      '40000000-0000-4000-8000-000000000a03'
  $$,
  '42501',
  'permission denied for table account_erasure_requests',
  'an active administrator cannot bypass the service-only Edge projection'
);
select extensions.throws_ok(
  $$
    update public.account_erasure_requests
    set
      status = 'erased',
      erased_at = pg_catalog.clock_timestamp()
    where id = '40000000-0000-4000-8000-000000000a03'
  $$,
  '42501',
  'permission denied for table account_erasure_requests',
  'an administrator cannot forge erasure completion through direct UPDATE'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000a01","role":"service_role"}',
  true
);
set local role service_role;

select extensions.throws_ok(
  $$
    select public.kc_transition_data_subject_request(
      '30000000-0000-4000-8000-000000000a03',
      'pending_confirmation',
      'processing',
      '00000000-0000-4000-8000-000000000a01',
      'status_changed',
      'Tentativa sem sessao.'
    )
  $$,
  '42501',
  'DSR_ADMIN_SESSION_REQUIRED',
  'legacy DSR transition refuses to attribute an administrator without a session'
);

insert into kc_closure_lease_test_state (key, value)
select
  'irreversible_claim',
  pg_catalog.to_jsonb(claim_row)
from public.kc_claim_account_erasure_irreversible_operation(
  '40000000-0000-4000-8000-000000000a03',
  'pending_confirmation',
  1,
  '00000000-0000-4000-8000-000000000a01',
  '10000000-0000-4000-8000-000000000a01',
  300
) claim_row;

reset role;
select set_config('request.jwt.claims', '{}', true);

select extensions.is(
  (
    select closure_row.state
    from kc_private.account_erasure_subject_closures closure_row
    where closure_row.workflow_id =
      '40000000-0000-4000-8000-000000000a03'
  ),
  'closing',
  'irreversible claim persists the subject closure in the same transaction'
);
select extensions.throws_ok(
  $$
    insert into public.data_subject_requests (
      protocol,
      user_id,
      subject_hash,
      request_kind,
      status,
      idempotency_key,
      requested_format,
      request_source,
      scope
    ) values (
      'KC-DSR-20260729-CCCC000000000003',
      '00000000-0000-4000-8000-000000000a03',
      repeat('d', 64),
      'data_portability',
      'received',
      'closure-portability-0003',
      'json',
      'api',
      '[]'::jsonb
    )
  $$,
  '55000',
  'PRIVACY_SUBJECT_IRREVERSIBLY_CLOSING',
  'a direct concurrent insert cannot pass after closure commit'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000a03","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000a03"}',
  true
);
set local role authenticated;
select extensions.throws_ok(
  $$
    select public.kc_create_data_subject_request_v2(
      'data_portability',
      'closure-owner-retry-0003',
      'json',
      'settings'
    )
  $$,
  '55000',
  'PRIVACY_SUBJECT_IRREVERSIBLY_CLOSING',
  'authenticated v2 fails closed after irreversible closure'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000a01","role":"service_role"}',
  true
);
set local role service_role;

select extensions.lives_ok(
  format(
    $heartbeat$
      select public.kc_renew_account_erasure_operation(
        '40000000-0000-4000-8000-000000000a03',
        %L::uuid,
        %s,
        '00000000-0000-4000-8000-000000000a01',
        '10000000-0000-4000-8000-000000000a01',
        300
      )
    $heartbeat$,
    (
      select value ->> 'out_claim_token'
      from kc_closure_lease_test_state
      where key = 'irreversible_claim'
    ),
    (
      select value ->> 'out_operation_version'
      from kc_closure_lease_test_state
      where key = 'irreversible_claim'
    )
  ),
  'heartbeat renews a live claim with matching token/version/actor/session'
);
select extensions.throws_ok(
  format(
    $heartbeat$
      select public.kc_renew_account_erasure_operation(
        '40000000-0000-4000-8000-000000000a03',
        %L::uuid,
        %s,
        '00000000-0000-4000-8000-000000000a01',
        '10000000-0000-4000-8000-00000000ffff',
        300
      )
    $heartbeat$,
    (
      select value ->> 'out_claim_token'
      from kc_closure_lease_test_state
      where key = 'irreversible_claim'
    ),
    (
      select value ->> 'out_operation_version'
      from kc_closure_lease_test_state
      where key = 'irreversible_claim'
    )
  ),
  '42501',
  'ERASURE_ADMIN_SESSION_NOT_ACTIVE',
  'heartbeat rejects a missing/revoked administrator session'
);
select extensions.lives_ok(
  $$
    update public.account_erasure_requests workflow_row
    set metadata = workflow_row.metadata || '{"heartbeat_test":true}'::jsonb
    where workflow_row.id = '40000000-0000-4000-8000-000000000a03'
  $$,
  'claimed workflow update succeeds while its stored lease/session are active'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

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
  '20000000-0000-4000-8000-000000000a04',
  '00000000-0000-4000-8000-000000000a02',
  'account_access',
  'onboarding_settings',
  'account_deletion',
  'Workflow atomico',
  'Teste de idempotencia do workflow.',
  'new',
  'canonical-copy@example.test',
  '{"request_kind":"account_erasure"}'::jsonb
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000a01","role":"service_role"}',
  true
);
set local role service_role;

insert into kc_closure_lease_test_state (key, value)
select
  'workflow_first',
  pg_catalog.to_jsonb(workflow_row)
from public.kc_upsert_account_erasure_workflow(
  '20000000-0000-4000-8000-000000000a04',
  null,
  '00000000-0000-4000-8000-000000000a02',
  repeat('e', 64),
  'example.test',
  '00000000-0000-4000-8000-000000000a01',
  '10000000-0000-4000-8000-000000000a01',
  '{"profiles":1}'::jsonb,
  '{"source":"pgtap"}'::jsonb
) workflow_row;
insert into kc_closure_lease_test_state (key, value)
select
  'workflow_retry',
  pg_catalog.to_jsonb(workflow_row)
from public.kc_upsert_account_erasure_workflow(
  '20000000-0000-4000-8000-000000000a04',
  null,
  '00000000-0000-4000-8000-000000000a02',
  repeat('e', 64),
  'example.test',
  '00000000-0000-4000-8000-000000000a01',
  '10000000-0000-4000-8000-000000000a01',
  '{"profiles":1}'::jsonb,
  '{"source":"pgtap_retry"}'::jsonb
) workflow_row;

select extensions.is(
  (
    select value ->> 'id'
    from kc_closure_lease_test_state
    where key = 'workflow_retry'
  ),
  (
    select value ->> 'id'
    from kc_closure_lease_test_state
    where key = 'workflow_first'
  ),
  'atomic workflow retries return the same canonical row'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

select extensions.throws_ok(
  $$
    insert into public.account_erasure_requests (
      help_request_id,
      user_id,
      email_hash,
      status,
      metadata
    ) values (
      '20000000-0000-4000-8000-000000000a04',
      '00000000-0000-4000-8000-000000000a02',
      repeat('f', 64),
      'diagnosed',
      '{}'::jsonb
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "account_erasure_requests_canonical_help_uidx"',
  'partial unique index rejects a concurrent workflow insert bypass'
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
  '20000000-0000-4000-8000-000000000a05',
  '00000000-0000-4000-8000-000000000a02',
  'account_access',
  'onboarding_settings',
  'account_deletion',
  'Lease expirada',
  'Fixture de lease expirada.',
  'in_progress',
  'canonical-copy@example.test',
  '{"request_kind":"account_erasure"}'::jsonb
);

insert into public.account_erasure_requests (
  id,
  help_request_id,
  user_id,
  email_hash,
  status,
  operation_version,
  operation_claim_token,
  operation_claimed_at,
  operation_claim_expires_at,
  operation_claimed_by,
  operation_claim_session_id,
  metadata
) values (
  '40000000-0000-4000-8000-000000000a05',
  '20000000-0000-4000-8000-000000000a05',
  '00000000-0000-4000-8000-000000000a02',
  repeat('1', 64),
  'failed',
  2,
  '50000000-0000-4000-8000-000000000a05',
  now() - interval '2 hours',
  now() - interval '1 hour',
  '00000000-0000-4000-8000-000000000a01',
  '10000000-0000-4000-8000-000000000a01',
  '{}'::jsonb
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000a01","role":"service_role"}',
  true
);
set local role service_role;

select extensions.throws_ok(
  $$
    update public.account_erasure_requests workflow_row
    set metadata = '{"must_not_write":true}'::jsonb
    where workflow_row.id = '40000000-0000-4000-8000-000000000a05'
  $$,
  '40001',
  'ERASURE_OPERATION_LEASE_EXPIRED',
  'workflow updates fail closed after lease expiry'
);
select extensions.throws_ok(
  $$
    select public.kc_renew_account_erasure_operation(
      '40000000-0000-4000-8000-000000000a05',
      '50000000-0000-4000-8000-000000000a05',
      2,
      '00000000-0000-4000-8000-000000000a01',
      '10000000-0000-4000-8000-000000000a01',
      300
    )
  $$,
  '40001',
  'ERASURE_OPERATION_CLAIM_INVALID',
  'heartbeat cannot resurrect an expired lease'
);

select * from extensions.finish();

rollback;

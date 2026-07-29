begin;

create extension if not exists pgtap with schema extensions;

select extensions.no_plan();
select set_config(
  'request.jwt.claims',
  '{"sub":"97000000-0000-4000-8000-000000000001","role":"service_role"}',
  true
);

select extensions.ok(
  to_regprocedure(
    'public.kc_claim_account_erasure_irreversible_operation_v2(uuid,text,integer,uuid,uuid,uuid,text,integer)'
  ) is not null,
  'atomic irreversible claim RPC exists'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.kc_claim_account_erasure_irreversible_operation_v2(uuid,text,integer,uuid,uuid,uuid,text,integer)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.kc_claim_account_erasure_irreversible_operation_v2(uuid,text,integer,uuid,uuid,uuid,text,integer)',
    'execute'
  ),
  'only service_role can invoke the atomic irreversible claim'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.kc_checkpoint_account_erasure_auth_delete_intent(uuid,uuid,integer,uuid,uuid,uuid,jsonb,jsonb)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.kc_checkpoint_account_erasure_auth_delete_intent(uuid,uuid,integer,uuid,uuid,uuid,jsonb,jsonb)',
    'execute'
  ),
  'only service_role can persist the Auth deletion checkpoint'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.kc_confirm_account_erasure_auth_deleted(uuid,uuid,integer,uuid,uuid,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.kc_confirm_account_erasure_auth_deleted(uuid,uuid,integer,uuid,uuid,uuid)',
    'execute'
  ),
  'only service_role can confirm Auth absence'
);
select extensions.is(
  (public.kc_account_erasure_capabilities() ->> 'version')::integer,
  5,
  'capability version advertises the new release gate'
);
select extensions.ok(
  (public.kc_account_erasure_capabilities()
    ->> 'atomic_irreversible_dsr_transition')::boolean
  and (public.kc_account_erasure_capabilities()
    ->> 'durable_auth_delete_checkpoint')::boolean,
  'capabilities expose both atomicity and recovery guarantees'
);

insert into auth.users (id, email)
values
  (
    '97000000-0000-4000-8000-000000000001',
    'atomic-erasure-admin@example.test'
  ),
  (
    '97000000-0000-4000-8000-000000000002',
    'atomic-erasure-cancelled@example.test'
  ),
  (
    '97000000-0000-4000-8000-000000000003',
    'atomic-erasure-target@example.test'
  );

insert into public.profiles (id, email, full_name, is_admin)
values
  (
    '97000000-0000-4000-8000-000000000001',
    'atomic-erasure-admin@example.test',
    'Atomic Erasure Admin',
    true
  ),
  (
    '97000000-0000-4000-8000-000000000002',
    'atomic-erasure-cancelled@example.test',
    'Cancelled Erasure Target',
    false
  ),
  (
    '97000000-0000-4000-8000-000000000003',
    'atomic-erasure-target@example.test',
    'Recoverable Erasure Target',
    false
  );

insert into auth.sessions (id, user_id)
values
  (
    '98000000-0000-4000-8000-000000000001',
    '97000000-0000-4000-8000-000000000001'
  ),
  (
    '98000000-0000-4000-8000-000000000002',
    '97000000-0000-4000-8000-000000000002'
  ),
  (
    '98000000-0000-4000-8000-000000000003',
    '97000000-0000-4000-8000-000000000003'
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
    '97100000-0000-4000-8000-000000000002',
    '97000000-0000-4000-8000-000000000002',
    'account_access',
    'onboarding_settings',
    'account_deletion',
    'Excluir conta cancelada',
    'Pedido autenticado cancelado antes do claim.',
    'in_progress',
    'atomic-erasure-cancelled@example.test',
    '{
      "request_kind":"account_erasure",
      "identity_source":"authenticated_account",
      "export_before_erasure":"no_copy_needed"
    }'::jsonb
  ),
  (
    '97100000-0000-4000-8000-000000000003',
    '97000000-0000-4000-8000-000000000003',
    'account_access',
    'onboarding_settings',
    'account_deletion',
    'Excluir conta recuperavel',
    'Pedido autenticado com checkpoint.',
    'in_progress',
    'atomic-erasure-target@example.test',
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
)
values
  (
    '97200000-0000-4000-8000-000000000002',
    'KC-DSR-20260729-AAAA000000000702',
    '97000000-0000-4000-8000-000000000002',
    '97100000-0000-4000-8000-000000000002',
    repeat('a', 64),
    'account_erasure',
    'pending_confirmation',
    'atomic-erasure-cancel-race-0702',
    'json',
    'settings',
    '[]'::jsonb
  ),
  (
    '97200000-0000-4000-8000-000000000003',
    'KC-DSR-20260729-BBBB000000000703',
    '97000000-0000-4000-8000-000000000003',
    '97100000-0000-4000-8000-000000000003',
    repeat('b', 64),
    'account_erasure',
    'pending_confirmation',
    'atomic-erasure-recovery-0703',
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
)
values
  (
    '97300000-0000-4000-8000-000000000002',
    '97100000-0000-4000-8000-000000000002',
    '97200000-0000-4000-8000-000000000002',
    '97000000-0000-4000-8000-000000000002',
    repeat('c', 64),
    'pending_confirmation',
    1,
    '{}'::jsonb
  ),
  (
    '97300000-0000-4000-8000-000000000003',
    '97100000-0000-4000-8000-000000000003',
    '97200000-0000-4000-8000-000000000003',
    '97000000-0000-4000-8000-000000000003',
    repeat('d', 64),
    'pending_confirmation',
    1,
    '{}'::jsonb
  );

create temporary table kc_atomic_erasure_test_state (
  key text primary key,
  value jsonb not null
) on commit drop;
grant select, insert, update on kc_atomic_erasure_test_state to service_role;

-- The owner wins the race after an administrator read pending_confirmation.
select set_config(
  'request.jwt.claims',
  '{"sub":"97000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false,"session_id":"98000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;
select public.kc_cancel_data_subject_request(
  'KC-DSR-20260729-AAAA000000000702'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"97000000-0000-4000-8000-000000000001","role":"service_role"}',
  true
);
set local role service_role;

select extensions.throws_ok(
  $$
    select *
    from public.kc_claim_account_erasure_irreversible_operation_v2(
      '97300000-0000-4000-8000-000000000002',
      'pending_confirmation',
      1,
      '97000000-0000-4000-8000-000000000001',
      '98000000-0000-4000-8000-000000000001',
      '97200000-0000-4000-8000-000000000002',
      'pending_confirmation',
      300
    )
  $$,
  '40001',
  'ERASURE_ATOMIC_DSR_STATUS_CONFLICT',
  'a stale admin claim loses to owner cancellation'
);
reset role;
select extensions.is(
  (
    select count(*)::integer
    from kc_private.account_erasure_subject_closures closure_row
    where closure_row.workflow_id =
      '97300000-0000-4000-8000-000000000002'
  ),
  0,
  'DSR conflict rolls the subject closure back'
);
select extensions.is(
  (
    select workflow_row.operation_claim_token
    from public.account_erasure_requests workflow_row
    where workflow_row.id =
      '97300000-0000-4000-8000-000000000002'
  ),
  null::uuid,
  'DSR conflict rolls the workflow lease back'
);
select extensions.is(
  (
    select request_row.status
    from public.data_subject_requests request_row
    where request_row.id =
      '97200000-0000-4000-8000-000000000002'
  ),
  'cancelled',
  'the owner cancellation remains terminal'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"97000000-0000-4000-8000-000000000001","role":"service_role"}',
  true
);
set local role service_role;
insert into kc_atomic_erasure_test_state (key, value)
select
  'atomic_claim',
  pg_catalog.to_jsonb(claim_row)
from public.kc_claim_account_erasure_irreversible_operation_v2(
  '97300000-0000-4000-8000-000000000003',
  'pending_confirmation',
  1,
  '97000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000001',
  '97200000-0000-4000-8000-000000000003',
  'pending_confirmation',
  300
) claim_row;

reset role;
select extensions.is(
  (
    select request_row.status
    from public.data_subject_requests request_row
    where request_row.id =
      '97200000-0000-4000-8000-000000000003'
  ),
  'processing',
  'successful atomic claim transitions the linked DSR'
);
select extensions.is(
  (
    select closure_row.state
    from kc_private.account_erasure_subject_closures closure_row
    where closure_row.workflow_id =
      '97300000-0000-4000-8000-000000000003'
  ),
  'closing',
  'successful atomic claim persists closure'
);
select extensions.is(
  (
    select count(*)::integer
    from public.data_subject_request_events event_row
    where event_row.request_id =
      '97200000-0000-4000-8000-000000000003'
      and event_row.status = 'processing'
      and event_row.event_type = 'status_changed'
  ),
  1,
  'the atomic DSR transition records one public event'
);

update public.account_erasure_requests workflow_row
set
  status = 'confirmed',
  metadata = workflow_row.metadata || pg_catalog.jsonb_build_object(
    'identity_assurance',
    pg_catalog.jsonb_build_object(
      'verified', true,
      'source', 'linked_authenticated_data_subject_request',
      'help_user_id', '97000000-0000-4000-8000-000000000003',
      'target_user_id', '97000000-0000-4000-8000-000000000003'
    )
  )
where workflow_row.id = '97300000-0000-4000-8000-000000000003';

select set_config(
  'request.jwt.claims',
  '{"sub":"97000000-0000-4000-8000-000000000001","role":"service_role"}',
  true
);
set local role service_role;
insert into kc_atomic_erasure_test_state (key, value)
select
  'checkpoint',
  pg_catalog.to_jsonb(
    public.kc_checkpoint_account_erasure_auth_delete_intent(
      '97300000-0000-4000-8000-000000000003',
      (
        select (value ->> 'out_claim_token')::uuid
        from kc_atomic_erasure_test_state
        where key = 'atomic_claim'
      ),
      (
        select (value ->> 'out_operation_version')::integer
        from kc_atomic_erasure_test_state
        where key = 'atomic_claim'
      ),
      '97000000-0000-4000-8000-000000000001',
      '98000000-0000-4000-8000-000000000001',
      '97000000-0000-4000-8000-000000000003',
      '{
        "postIds":[],
        "authoredCommentIds":[],
        "authoredReportIds":[],
        "conversationIds":[],
        "targetChatMessageIds":[],
        "thirdPartyChatMessageIds":[],
        "receivedRatingIds":[],
        "receivedBlockIds":[],
        "behavioralRowIds":{"privacy_events":[]}
      }'::jsonb,
      '{"schema_version":1,"counts":{},"storage_removed_count":0}'::jsonb
    )
  );

select extensions.is(
  (
    select value ->> 'auth_delete_state'
    from kc_atomic_erasure_test_state
    where key = 'checkpoint'
  ),
  'intent_recorded',
  'checkpoint is durable before the external Auth call'
);
select extensions.is(
  (
    select value ->> 'auth_delete_target_user_id'
    from kc_atomic_erasure_test_state
    where key = 'checkpoint'
  ),
  '97000000-0000-4000-8000-000000000003',
  'checkpoint binds the exact verified target UUID'
);
select extensions.ok(
  (
    public.kc_account_erasure_auth_delete_recovery_status(
      '97300000-0000-4000-8000-000000000003'
    ) ->> 'auth_user_present'
  )::boolean,
  'recovery proof reports that Auth still contains the target'
);
select extensions.throws_ok(
  format(
    $confirm$
      select public.kc_confirm_account_erasure_auth_deleted(
        '97300000-0000-4000-8000-000000000003',
        %L::uuid,
        %s,
        '97000000-0000-4000-8000-000000000001',
        '98000000-0000-4000-8000-000000000001',
        %L::uuid
      )
    $confirm$,
    (
      select value ->> 'out_claim_token'
      from kc_atomic_erasure_test_state
      where key = 'atomic_claim'
    ),
    (
      select value ->> 'out_operation_version'
      from kc_atomic_erasure_test_state
      where key = 'atomic_claim'
    ),
    (
      select value ->> 'auth_delete_intent_token'
      from kc_atomic_erasure_test_state
      where key = 'checkpoint'
    )
  ),
  '55000',
  'ERASURE_AUTH_USER_STILL_PRESENT',
  'provider success cannot be recorded while the checkpoint target still exists'
);

-- Simulate a deleteUser call that committed even though its HTTP response was
-- lost. Auth FKs null the public subject columns; checkpoint columns have no FK
-- and must survive for the next administrator request.
reset role;
delete from auth.users user_row
where user_row.id = '97000000-0000-4000-8000-000000000003';
select set_config(
  'request.jwt.claims',
  '{"sub":"97000000-0000-4000-8000-000000000001","role":"service_role"}',
  true
);
set local role service_role;

select extensions.ok(
  (
    select workflow_row.user_id is null
      and workflow_row.auth_delete_target_user_id =
        '97000000-0000-4000-8000-000000000003'
    from public.account_erasure_requests workflow_row
    where workflow_row.id =
      '97300000-0000-4000-8000-000000000003'
  ),
  'checkpoint target survives Auth FK cleanup'
);
select extensions.ok(
  (
    public.kc_account_erasure_auth_delete_recovery_status(
      '97300000-0000-4000-8000-000000000003'
    ) ->> 'ok'
  )::boolean
  and not (
    public.kc_account_erasure_auth_delete_recovery_status(
      '97300000-0000-4000-8000-000000000003'
    ) ->> 'auth_user_present'
  )::boolean,
  'identity, closure and inventory prove a safe absent-user recovery'
);

select public.kc_confirm_account_erasure_auth_deleted(
  '97300000-0000-4000-8000-000000000003',
  (
    select (value ->> 'out_claim_token')::uuid
    from kc_atomic_erasure_test_state
    where key = 'atomic_claim'
  ),
  (
    select (value ->> 'out_operation_version')::integer
    from kc_atomic_erasure_test_state
    where key = 'atomic_claim'
  ),
  '97000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000001',
  (
    select (value ->> 'auth_delete_intent_token')::uuid
    from kc_atomic_erasure_test_state
    where key = 'checkpoint'
  )
);

select extensions.ok(
  (
    select workflow_row.status = 'partial_failure'
      and workflow_row.auth_delete_state = 'confirmed_absent'
      and workflow_row.auth_delete_confirmed_at is not null
      and workflow_row.metadata ->> 'auth_deleted' = 'true'
      and workflow_row.metadata ->> 'failure_stage' = 'postconditions'
      and workflow_row.metadata ->> 'repair_target_user_id' =
        '97000000-0000-4000-8000-000000000003'
    from public.account_erasure_requests workflow_row
    where workflow_row.id =
      '97300000-0000-4000-8000-000000000003'
  ),
  'confirmed absence becomes a durable retryable postcondition state'
);

reset role;
select set_config('request.jwt.claims', '{}', true);
select extensions.finish();
rollback;

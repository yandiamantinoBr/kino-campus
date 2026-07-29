begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select extensions.no_plan();

select extensions.has_column(
  'kc_private',
  'data_export_artifacts',
  'claimed_session_id',
  'assisted export claims persist the exact administrator session'
);

select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.kc_claim_data_export_artifact(text,bigint,uuid,integer)',
    'execute'
  ),
  'the actor-only claim remains available during the expand deployment'
);

select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.kc_claim_data_export_artifact(text,bigint,uuid,integer)',
    'execute'
  ),
  'browser roles cannot execute the deferred actor-only claim'
);

select extensions.ok(
  coalesce(
    pg_catalog.obj_description(
      'public.kc_claim_data_export_artifact(text,bigint,uuid,integer)'::regprocedure,
      'pg_proc'
    ),
    ''
  ) like 'CONTRACT DEFERRED:%',
  'the actor-only claim is marked for a later contract migration'
);

select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.kc_claim_data_export_artifact(text,bigint,uuid,uuid,integer)',
    'execute'
  ),
  'service role can call the exact-session claim signature'
);

select extensions.ok(
  not has_function_privilege(
    'service_role',
    'kc_private.kc_claim_data_export_artifact(text,bigint,uuid,integer)',
    'execute'
  ),
  'service role cannot bypass the public session-bound claim wrappers'
);

select extensions.ok(
  not has_function_privilege(
    'service_role',
    'kc_private.kc_resolve_legacy_data_export_admin_session(uuid)',
    'execute'
  ),
  'service role cannot directly invoke the deferred session resolver'
);

select extensions.ok(
  not has_function_privilege(
    'service_role',
    'kc_private.kc_bind_or_assert_data_export_claim_session(text,bigint,text)',
    'execute'
  ),
  'service role cannot directly bind a claim session'
);

select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.kc_claim_expired_data_export_artifacts(integer,uuid)',
    'execute'
  ),
  'the actorless machine-retention signature remains callable'
);

select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.kc_claim_expired_data_export_artifacts(integer,uuid,uuid)',
    'execute'
  ),
  'interactive retention batches have a session-bound overload'
);

select extensions.ok(
  coalesce(
    pg_catalog.obj_description(
      'public.kc_fail_data_export_artifact(text,bigint,text,text)'::regprocedure,
      'pg_proc'
    ),
    ''
  ) like 'Abandonment-only cleanup:%',
  'claim failure is explicitly limited to token-and-CAS abandonment'
);

select extensions.ok(
  not exists (
    select 1
    from kc_private.data_export_artifacts artifact_row
    where artifact_row.status = 'claimed'
      and artifact_row.claimed_session_id is null
  ),
  'the migration leaves no pre-existing claim permanently unbound'
);

insert into auth.users (id, email)
values
  (
    '00000000-0000-4000-8000-000000000781',
    'export-session-owner@example.test'
  ),
  (
    '00000000-0000-4000-8000-000000000783',
    'export-session-admin@example.test'
  );

insert into auth.sessions (id, user_id, not_after)
values
  (
    '10000000-0000-4000-8000-000000000783',
    '00000000-0000-4000-8000-000000000783',
    null
  ),
  (
    '20000000-0000-4000-8000-000000000783',
    '00000000-0000-4000-8000-000000000783',
    now() - interval '1 minute'
  );

insert into public.profiles (
  id,
  full_name,
  display_name,
  email,
  is_admin,
  profile_public
)
values
  (
    '00000000-0000-4000-8000-000000000781',
    'Export Session Owner',
    'Export Owner',
    'export-session-owner@example.test',
    false,
    false
  ),
  (
    '00000000-0000-4000-8000-000000000783',
    'Export Session Admin',
    'Export Admin',
    'export-session-admin@example.test',
    true,
    false
  )
on conflict (id) do update set
  is_admin = excluded.is_admin;

insert into public.data_subject_requests (
  id,
  protocol,
  user_id,
  subject_hash,
  request_kind,
  status,
  idempotency_key,
  request_source,
  scope
)
values (
  '20000000-0000-4000-8000-000000000781',
  'KC-DSR-20260729-0000000000000781',
  '00000000-0000-4000-8000-000000000781',
  repeat('a', 64),
  'data_access_copy',
  'partial_failure',
  'session-binding-export-000781',
  'settings',
  '["profile"]'::jsonb
);

create temporary table kc_export_session_test_state (
  key text primary key,
  value jsonb not null
);
grant select, insert, update, delete
  on kc_export_session_test_state
  to service_role;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000783',
    'role', 'authenticated',
    'session_id', '20000000-0000-4000-8000-000000000783'
  )::text,
  true
);
set local role authenticated;

select extensions.is(
  public.kc_is_current_session_active(),
  false,
  'owner RPC guards reject a retained time-boxed session after not_after'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000783","role":"service_role"}',
  true
);
set local role service_role;

select extensions.throws_ok(
  $$select public.kc_admin_read_data_export_artifact(
    null,
    null,
    '00000000-0000-4000-8000-000000000783',
    '20000000-0000-4000-8000-000000000783'
  )$$,
  '42501',
  'EXPORT_ADMIN_SESSION_NOT_ACTIVE',
  'export admin RPC rejects a retained time-boxed session'
);

select extensions.throws_ok(
  $$select public.kc_transition_data_subject_request_for_admin_session(
    '20000000-0000-4000-8000-000000000781',
    'partial_failure',
    'ready',
    '00000000-0000-4000-8000-000000000783',
    '20000000-0000-4000-8000-000000000783',
    'export_ready',
    'ready'
  )$$,
  '42501',
  'ERASURE_ADMIN_SESSION_NOT_ACTIVE',
  'account-erasure admin guard rejects a retained time-boxed session'
);

reset role;
insert into auth.sessions (id, user_id)
values (
  '30000000-0000-4000-8000-000000000783',
  '00000000-0000-4000-8000-000000000783'
);
set local role service_role;

select extensions.throws_ok(
  $$select public.kc_admin_read_data_export_artifact(
    null,
    null,
    '00000000-0000-4000-8000-000000000783'
  )$$,
  '42501',
  'EXPORT_ADMIN_SESSION_AMBIGUOUS',
  'deferred actor-only wrappers fail closed when multiple sessions are active'
);

reset role;
delete from auth.sessions
where id = '30000000-0000-4000-8000-000000000783';
set local role service_role;

insert into kc_export_session_test_state (key, value)
select
  'artifact',
  public.kc_enqueue_data_export_artifact(
    '20000000-0000-4000-8000-000000000781',
    '00000000-0000-4000-8000-000000000781',
    jsonb_build_array(
      jsonb_build_object(
        'processor',
        'supabase_db_auth_storage',
        'treatment',
        'automated_export',
        'status',
        'automated'
      )
    )
  );

insert into kc_export_session_test_state (key, value)
select
  'claim',
  public.kc_claim_data_export_artifact(
    (select value ->> 'artifact_ref'
     from kc_export_session_test_state
     where key = 'artifact'),
    ((select value ->> 'version'
      from kc_export_session_test_state
      where key = 'artifact'))::bigint,
    '00000000-0000-4000-8000-000000000783',
    900
  );

reset role;
select extensions.ok(
  (
    select artifact_row.claimed_by =
        '00000000-0000-4000-8000-000000000783'::uuid
      and artifact_row.claimed_session_id =
        '10000000-0000-4000-8000-000000000783'::uuid
      and artifact_row.status = 'claimed'
    from kc_private.data_export_artifacts artifact_row
    where artifact_row.artifact_ref = (
      select value ->> 'artifact_ref'
      from kc_export_session_test_state
      where key = 'claim'
    )
  ),
  'the deferred actor-only claim resolves and persists one live session'
);

-- Simulate a claim created immediately before the expand migration. The first
-- continuation must bind it using token/version/status/lease CAS.
update kc_private.data_export_artifacts artifact_row
set claimed_session_id = null
where artifact_row.artifact_ref = (
  select value ->> 'artifact_ref'
  from kc_export_session_test_state
  where key = 'claim'
);
set local role service_role;

select extensions.lives_ok(
  $$select public.kc_store_data_export_media_refs(
    (select value ->> 'artifact_ref'
     from kc_export_session_test_state
     where key = 'claim'),
    ((select value ->> 'version'
      from kc_export_session_test_state
      where key = 'claim'))::bigint,
    (select value ->> 'claim_token'
     from kc_export_session_test_state
     where key = 'claim'),
    '[]'::jsonb
  )$$,
  'a valid pre-expand claim lazily binds its only active admin session'
);

reset role;
select extensions.ok(
  (
    select artifact_row.claimed_session_id =
      '10000000-0000-4000-8000-000000000783'::uuid
    from kc_private.data_export_artifacts artifact_row
    where artifact_row.artifact_ref = (
      select value ->> 'artifact_ref'
      from kc_export_session_test_state
      where key = 'claim'
    )
  ),
  'lazy compatibility binding is persisted on the claim'
);

delete from auth.sessions
where id = '10000000-0000-4000-8000-000000000783';
set local role service_role;

select extensions.throws_ok(
  $$select public.kc_authorize_data_export_artifact_upload(
    (select value ->> 'artifact_ref'
     from kc_export_session_test_state
     where key = 'claim'),
    ((select value ->> 'version'
      from kc_export_session_test_state
      where key = 'claim'))::bigint,
    (select value ->> 'claim_token'
     from kc_export_session_test_state
     where key = 'claim'),
    1800
  )$$,
  '42501',
  'EXPORT_ADMIN_SESSION_NOT_ACTIVE',
  'revoking the bound admin session blocks content-producing continuation'
);

select extensions.lives_ok(
  $$select public.kc_fail_data_export_artifact(
    (select value ->> 'artifact_ref'
     from kc_export_session_test_state
     where key = 'claim'),
    ((select value ->> 'version'
      from kc_export_session_test_state
      where key = 'claim'))::bigint,
    (select value ->> 'claim_token'
     from kc_export_session_test_state
     where key = 'claim'),
    'SESSION_NOT_ACTIVE'
  )$$,
  'token-and-version CAS can abandon a claim after session revocation'
);

reset role;
select extensions.ok(
  (
    select artifact_row.status = 'failed'
      and artifact_row.claimed_session_id is null
      and artifact_row.claim_token_hash is null
    from kc_private.data_export_artifacts artifact_row
    where artifact_row.artifact_ref = (
      select value ->> 'artifact_ref'
      from kc_export_session_test_state
      where key = 'claim'
    )
  ),
  'abandonment records failure and clears all active session/token capability'
);

-- Concurrent proof: the session assertion keeps a FOR SHARE lock on the
-- profile row, so a non-key is_admin=false update must wait for its transaction.
select extensions.dblink_connect(
  'kc_export_lock_a',
  pg_catalog.format(
    'hostaddr=%s port=5432 dbname=%s user=postgres password=postgres',
    pg_catalog.host(pg_catalog.inet_server_addr()),
    current_database()
  )
);
select extensions.dblink_connect(
  'kc_export_lock_b',
  pg_catalog.format(
    'hostaddr=%s port=5432 dbname=%s user=postgres password=postgres',
    pg_catalog.host(pg_catalog.inet_server_addr()),
    current_database()
  )
);

select extensions.dblink_exec(
  'kc_export_lock_a',
  $remote$
    delete from auth.sessions
    where id = '10000000-0000-4000-8000-000000000791';
  $remote$
);
select extensions.dblink_exec(
  'kc_export_lock_a',
  $remote$
    delete from public.profiles
    where id = '00000000-0000-4000-8000-000000000791';
  $remote$
);
select extensions.dblink_exec(
  'kc_export_lock_a',
  $remote$
    delete from auth.users
    where id = '00000000-0000-4000-8000-000000000791';
  $remote$
);
select extensions.dblink_exec(
  'kc_export_lock_a',
  $remote$
    insert into auth.users (id, email)
    values (
      '00000000-0000-4000-8000-000000000791',
      'export-lock-admin@example.test'
    );
  $remote$
);
select extensions.dblink_exec(
  'kc_export_lock_a',
  $remote$
    insert into public.profiles (
      id,
      full_name,
      display_name,
      email,
      is_admin,
      profile_public
    ) values (
      '00000000-0000-4000-8000-000000000791',
      'Export Lock Admin',
      'Export Lock Admin',
      'export-lock-admin@example.test',
      true,
      false
    );
  $remote$
);
select extensions.dblink_exec(
  'kc_export_lock_a',
  $remote$
    insert into auth.sessions (id, user_id)
    values (
      '10000000-0000-4000-8000-000000000791',
      '00000000-0000-4000-8000-000000000791'
    );
  $remote$
);

select extensions.dblink_exec('kc_export_lock_a', 'begin');
select extensions.dblink_exec(
  'kc_export_lock_a',
  $remote$
    set request.jwt.claims =
      '{"sub":"00000000-0000-4000-8000-000000000791","role":"service_role"}';
  $remote$
);
select extensions.dblink_exec(
  'kc_export_lock_a',
  $remote$
    do $lock$
    begin
      perform kc_private.kc_assert_active_data_export_admin_session(
        '00000000-0000-4000-8000-000000000791',
        '10000000-0000-4000-8000-000000000791'
      );
    end;
    $lock$;
  $remote$
);

select extensions.is(
  extensions.dblink_send_query(
    'kc_export_lock_b',
    $remote$
      update public.profiles
      set is_admin = false
      where id = '00000000-0000-4000-8000-000000000791'
      returning is_admin
    $remote$
  ),
  1,
  'concurrent admin demotion query was dispatched'
);
select pg_catalog.pg_sleep(0.1);
select extensions.is(
  extensions.dblink_is_busy('kc_export_lock_b'),
  1,
  'FOR SHARE keeps concurrent admin demotion blocked'
);
select extensions.dblink_exec('kc_export_lock_a', 'commit');
select extensions.is(
  (
    select demoted.is_admin
    from extensions.dblink_get_result('kc_export_lock_b')
      as demoted(is_admin boolean)
  ),
  false,
  'admin demotion completes only after the privileged transaction releases'
);

select extensions.dblink_exec(
  'kc_export_lock_a',
  $remote$
    delete from auth.sessions
    where id = '10000000-0000-4000-8000-000000000791';
  $remote$
);
select extensions.dblink_exec(
  'kc_export_lock_a',
  $remote$
    delete from public.profiles
    where id = '00000000-0000-4000-8000-000000000791';
  $remote$
);
select extensions.dblink_exec(
  'kc_export_lock_a',
  $remote$
    delete from auth.users
    where id = '00000000-0000-4000-8000-000000000791';
  $remote$
);
select extensions.dblink_disconnect('kc_export_lock_a');
select extensions.dblink_disconnect('kc_export_lock_b');

set local role service_role;
select extensions.throws_ok(
  $$select public.kc_claim_expired_data_export_artifacts(
    1,
    '00000000-0000-4000-8000-000000000783'
  )$$,
  '42501',
  'EXPORT_ADMIN_SESSION_NOT_ACTIVE',
  'actor-only retention resolves a live session and fails closed when none remains'
);

select extensions.lives_ok(
  $$select public.kc_claim_expired_data_export_artifacts(1, null)$$,
  'actorless scheduled retention remains compatible'
);

reset role;
select * from extensions.finish();

rollback;

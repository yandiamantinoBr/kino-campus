begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select extensions.no_plan();

select extensions.has_table(
  'kc_private',
  'help_privacy_submission_idempotency',
  'privacy Help idempotency state is private'
);
select extensions.has_table(
  'kc_private',
  'help_privacy_guest_rate_buckets',
  'guest privacy Help circuit-breaker state is private'
);
select extensions.has_function(
  'public',
  'kc_create_privacy_help_request_v1',
  array['jsonb'],
  'scoped privacy Help RPC exists'
);
select extensions.has_function(
  'public',
  'kc_recover_privacy_help_request_v1',
  array['jsonb'],
  'PII-free privacy Help recovery RPC exists'
);
select extensions.ok(
  not pg_catalog.has_table_privilege(
    'anon',
    'kc_private.help_privacy_submission_idempotency',
    'select,insert,update,delete'
  )
  and not pg_catalog.has_table_privilege(
    'authenticated',
    'kc_private.help_privacy_submission_idempotency',
    'select,insert,update,delete'
  )
  and not pg_catalog.has_table_privilege(
    'service_role',
    'kc_private.help_privacy_submission_idempotency',
    'select,insert,update,delete'
  ),
  'no API role can inspect or mutate the private replay map'
);
select extensions.ok(
  not pg_catalog.has_table_privilege(
    'anon',
    'kc_private.help_privacy_guest_rate_buckets',
    'select,insert,update,delete'
  )
  and not pg_catalog.has_table_privilege(
    'authenticated',
    'kc_private.help_privacy_guest_rate_buckets',
    'select,insert,update,delete'
  )
  and not pg_catalog.has_table_privilege(
    'service_role',
    'kc_private.help_privacy_guest_rate_buckets',
    'select,insert,update,delete'
  )
  and (
    select table_row.relrowsecurity
    from pg_catalog.pg_class table_row
    where table_row.oid =
      'kc_private.help_privacy_guest_rate_buckets'::regclass
  ),
  'guest circuit breaker has RLS and no API-role table privileges'
);
select extensions.has_pk(
  'kc_private',
  'help_privacy_guest_rate_buckets',
  'guest circuit breaker has one transactional row per time window'
);
select extensions.ok(
  (
    select
      pg_catalog.pg_get_constraintdef(constraint_row.oid)
        like '%attempts >= 1%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid)
        like '%attempts <= 10000%'
      and constraint_row.convalidated
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid =
      'kc_private.help_privacy_guest_rate_buckets'::regclass
      and constraint_row.conname =
        'help_privacy_guest_rate_attempts_check'
  ),
  'guest circuit-breaker CHECK permits only the documented 1..10000 budget'
);
select extensions.ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.kc_create_privacy_help_request_v1(jsonb)',
    'execute'
  )
  and (
    (
      pg_catalog.has_function_privilege(
        'anon',
        'public.kc_create_privacy_help_request_v1(jsonb)',
        'execute'
      )
      and coalesce(
        pg_catalog.obj_description(
          'public.kc_create_privacy_help_request_v1(jsonb)'::regprocedure,
          'pg_proc'
        ),
        ''
      ) not like 'CONTRACT:%'
    )
    or (
      not pg_catalog.has_function_privilege(
        'anon',
        'public.kc_create_privacy_help_request_v1(jsonb)',
        'execute'
      )
      and coalesce(
        pg_catalog.obj_description(
          'public.kc_create_privacy_help_request_v1(jsonb)'::regprocedure,
          'pg_proc'
        ),
        ''
      ) like 'CONTRACT:%'
    )
  )
  and pg_catalog.has_function_privilege(
    'anon',
    'public.kc_recover_privacy_help_request_v1(jsonb)',
    'execute'
  )
  and pg_catalog.has_function_privilege(
    'authenticated',
    'public.kc_recover_privacy_help_request_v1(jsonb)',
    'execute'
  ),
  'create ACL matches its declared rollout phase and recovery stays public'
);
select extensions.ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'kc_private.kc_create_privacy_help_request_v1(jsonb)',
    'execute'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'kc_private.kc_create_privacy_help_request_v1(jsonb)',
    'execute'
  )
  and not pg_catalog.has_function_privilege(
    'service_role',
    'kc_private.kc_create_privacy_help_request_v1(jsonb)',
    'execute'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'kc_private.kc_recover_privacy_help_request_v1(jsonb)',
    'execute'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'kc_private.kc_recover_privacy_help_request_v1(jsonb)',
    'execute'
  )
  and not pg_catalog.has_function_privilege(
    'service_role',
    'kc_private.kc_recover_privacy_help_request_v1(jsonb)',
    'execute'
  ),
  'private create and recovery workers stay closed to every API role'
);
select extensions.ok(
  not exists (
    select 1
    from (
      values ('anon'), ('authenticated'), ('service_role')
    ) as role_row(role_name)
    cross join (
      values
        ('kc_private.kc_create_help_request(jsonb)'),
        (
          'kc_private.kc_create_help_request_with_notification_claim(jsonb)'
        ),
        (
          'kc_private.kc_create_help_request_with_notification_claim_v2(jsonb)'
        ),
        (
          'kc_private.kc_help_request_v2_20260729_idempotency_base(jsonb)'
        ),
        ('kc_private.kc_is_privacy_help_route_v1(jsonb)')
    ) as function_row(signature)
    where pg_catalog.has_function_privilege(
      role_row.role_name,
      function_row.signature,
      'execute'
    )
  ),
  'all legacy Help workers and trusted helpers are private to database code'
);
select extensions.has_function(
  'kc_private',
  'kc_assert_current_authenticated_session_active',
  array[]::text[],
  'authenticated privacy Help session-lock helper exists'
);
select extensions.ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'kc_private.kc_assert_current_authenticated_session_active()',
    'execute'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'kc_private.kc_assert_current_authenticated_session_active()',
    'execute'
  )
  and not pg_catalog.has_function_privilege(
    'service_role',
    'kc_private.kc_assert_current_authenticated_session_active()',
    'execute'
  ),
  'authenticated session-lock helper is private to database workers'
);
select extensions.ok(
  (
    select
      procedure_row.prosecdef
      and procedure_row.proconfig @> array['search_path=""']
      and procedure_row.prosrc like '%from auth.users user_row%'
      and procedure_row.prosrc like '%join auth.sessions session_row%'
      and procedure_row.prosrc like
        '%coalesce(user_row.is_anonymous, false) is false%'
      and procedure_row.prosrc like '%user_row.deleted_at is null%'
      and procedure_row.prosrc like '%session_row.id = v_session_id::uuid%'
      and procedure_row.prosrc like '%session_row.not_after%'
      and procedure_row.prosrc like
        '%for share of user_row, session_row%'
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid = pg_catalog.to_regprocedure(
      'kc_private.kc_assert_current_authenticated_session_active()'
    )
  ),
  'authenticated helper locks the exact live real-user and session rows'
);
select extensions.ok(
  (
    select pg_catalog.bool_and(
      procedure_row.prosrc like
        '%kc_assert_current_authenticated_session_active()%'
      and pg_catalog.strpos(
        procedure_row.prosrc,
        'kc_assert_current_authenticated_session_active()'
      ) < pg_catalog.strpos(
        procedure_row.prosrc,
        'pg_advisory_xact_lock'
      )
    )
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid in (
      pg_catalog.to_regprocedure(
        'kc_private.kc_create_privacy_help_request_v1(jsonb)'
      ),
      pg_catalog.to_regprocedure(
        'kc_private.kc_recover_privacy_help_request_v1(jsonb)'
      )
    )
  ),
  'authenticated create and recovery lock session rows before replay or miss work'
);
select extensions.ok(
  (
    select pg_catalog.bool_and(procedure_row.prosecdef)
      and pg_catalog.bool_and(
        procedure_row.proconfig @> array['search_path=""']
      )
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid in (
      pg_catalog.to_regprocedure(
        'public.kc_create_privacy_help_request_v1(jsonb)'
      ),
      pg_catalog.to_regprocedure(
        'public.kc_recover_privacy_help_request_v1(jsonb)'
      )
    )
  ),
  'public RPC wrappers are SECURITY DEFINER with an empty search_path'
);
select extensions.ok(
  (
    select
      pg_catalog.bool_and(procedure_row.prosecdef)
      and pg_catalog.bool_and(
        procedure_row.proconfig @> array['search_path=""']
      )
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid in (
      'public.kc_create_help_request(jsonb)'::regprocedure,
      (
        'public.kc_create_help_request_with_notification_claim(jsonb)'
      )::regprocedure,
      (
        'public.kc_create_help_request_with_notification_claim_v2(jsonb)'
      )::regprocedure
    )
  ),
  'legacy public Help entrypoints are hardened SECURITY DEFINER facades'
);
select extensions.ok(
  (
    select
      table_row.relrowsecurity
      and not table_row.relforcerowsecurity
    from pg_catalog.pg_class table_row
    join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = table_row.relnamespace
    where namespace_row.nspname = 'kc_private'
      and table_row.relname =
        'help_privacy_submission_idempotency'
  ),
  'private replay table has RLS as defense in depth'
);
select extensions.has_index(
  'kc_private',
  'help_privacy_submission_idempotency',
  'help_privacy_submission_idempotency_caller_user_idx',
  'Auth deletion has a supporting replay-map FK index'
);
select extensions.has_index(
  'kc_private',
  'help_privacy_submission_idempotency',
  'help_privacy_submission_idempotency_dsr_idx',
  'DSR purge has a supporting replay-map FK index'
);
select extensions.has_index(
  'kc_private',
  'help_privacy_recovery_rate_buckets',
  'help_privacy_recovery_rate_caller_user_idx',
  'Auth deletion has a supporting recovery-bucket FK index'
);
select extensions.has_index(
  'kc_private',
  'help_privacy_recovery_rate_buckets',
  'help_privacy_recovery_rate_window_idx',
  'daily bucket cleanup has a supporting time index'
);
select extensions.ok(
  (
    select
      procedure_row.prosecdef
      and procedure_row.proconfig @> array['search_path=""']
      and pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(procedure_row.oid),
        'pg_advisory_xact_lock'
      ) > 0
      and pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(procedure_row.oid),
        'pg_advisory_xact_lock'
      ) < pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(procedure_row.oid),
        'kc_help_request_v2_20260729_idempotency_base'
      )
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid = pg_catalog.to_regprocedure(
      'kc_private.kc_create_privacy_help_request_v1(jsonb)'
    )
  ),
  'SECURITY DEFINER worker locks the key before the legacy create worker'
);
select extensions.ok(
  (
    select
      procedure_row.prosecdef
      and procedure_row.proconfig @> array['search_path=""']
      and pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(procedure_row.oid),
        'pg_advisory_xact_lock'
      ) > 0
      and pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(procedure_row.oid),
        'pg_advisory_xact_lock'
      ) < pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(procedure_row.oid),
        'from kc_private.help_privacy_submission_idempotency'
      )
      and pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(procedure_row.oid),
        'from public.data_subject_requests'
      ) < pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(procedure_row.oid),
        'from public.help_requests'
      )
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid = pg_catalog.to_regprocedure(
      'kc_private.kc_recover_privacy_help_request_v1(jsonb)'
    )
  ),
  'recovery serializes by key and locks DSR before Help in purge-compatible order'
);
select extensions.ok(
  (
    select pg_catalog.pg_get_constraintdef(constraint_row.oid)
      ~ 'lifecycle_state = ''committed''::text.*payload_fingerprint IS NOT NULL.*auth_state = ''authenticated''::text.*data_subject_request_id IS NOT NULL.*response_protocol IS NOT NULL.*auth_state = ''anonymous''::text.*data_subject_request_id IS NULL.*response_protocol IS NULL.*lifecycle_state = ''retired''::text.*payload_fingerprint IS NULL'
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class table_row
      on table_row.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = table_row.relnamespace
    where namespace_row.nspname = 'kc_private'
      and table_row.relname =
        'help_privacy_submission_idempotency'
      and constraint_row.conname =
        'help_privacy_submission_response_shape_check'
      and constraint_row.contype = 'c'
      and constraint_row.convalidated
  ),
  'table CHECK prevents impossible authenticated and anonymous receipt shapes'
);
select extensions.ok(
  (
    select pg_catalog.pg_get_constraintdef(constraint_row.oid)
      like '%KC-DSR-[0-9]{8}-[A-F0-9]{16}%'
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid =
      'kc_private.help_privacy_submission_idempotency'::regclass
      and constraint_row.conname =
        'help_privacy_submission_response_protocol_check'
      and constraint_row.convalidated
  ),
  'table CHECK validates the persisted public protocol format'
);

-- Concurrent proof: once an authenticated privacy transaction validates the
-- exact session, revocation must wait until its FOR SHARE lock is released.
select extensions.dblink_connect(
  'kc_privacy_session_lock_a',
  pg_catalog.format(
    'hostaddr=%s port=5432 dbname=%s user=postgres password=postgres',
    pg_catalog.host(pg_catalog.inet_server_addr()),
    pg_catalog.current_database()
  )
);
select extensions.dblink_connect(
  'kc_privacy_session_lock_b',
  pg_catalog.format(
    'hostaddr=%s port=5432 dbname=%s user=postgres password=postgres',
    pg_catalog.host(pg_catalog.inet_server_addr()),
    pg_catalog.current_database()
  )
);
select extensions.dblink_exec(
  'kc_privacy_session_lock_a',
  $remote$
    delete from auth.sessions
    where id = '8c100000-0000-4000-8000-000000000001';
  $remote$
);
select extensions.dblink_exec(
  'kc_privacy_session_lock_a',
  $remote$
    delete from auth.users
    where id = '8c000000-0000-4000-8000-000000000001';
  $remote$
);
select extensions.dblink_exec(
  'kc_privacy_session_lock_a',
  $remote$
    insert into auth.users (id, email, is_anonymous)
    values (
      '8c000000-0000-4000-8000-000000000001',
      'privacy-session-lock@example.test',
      false
    );
  $remote$
);
select extensions.dblink_exec(
  'kc_privacy_session_lock_a',
  $remote$
    insert into auth.sessions (id, user_id)
    values (
      '8c100000-0000-4000-8000-000000000001',
      '8c000000-0000-4000-8000-000000000001'
    );
  $remote$
);
select extensions.dblink_exec(
  'kc_privacy_session_lock_a',
  'begin'
);
select extensions.dblink_exec(
  'kc_privacy_session_lock_a',
  $remote$
    set request.jwt.claims =
      '{"sub":"8c000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"8c100000-0000-4000-8000-000000000001","is_anonymous":false}';
  $remote$
);
select extensions.dblink_exec(
  'kc_privacy_session_lock_a',
  $remote$
    do $lock$
    begin
      perform
        kc_private.kc_assert_current_authenticated_session_active();
    end;
    $lock$;
  $remote$
);
select extensions.is(
  extensions.dblink_send_query(
    'kc_privacy_session_lock_b',
    $remote$
      delete from auth.sessions
      where id = '8c100000-0000-4000-8000-000000000001'
      returning id
    $remote$
  ),
  1,
  'concurrent authenticated-session revocation query was dispatched'
);
select pg_catalog.pg_sleep(0.1);
select extensions.is(
  extensions.dblink_is_busy('kc_privacy_session_lock_b'),
  1,
  'FOR SHARE keeps concurrent session revocation blocked'
);
select extensions.dblink_exec(
  'kc_privacy_session_lock_a',
  'commit'
);
select extensions.is(
  (
    select revoked.id
    from extensions.dblink_get_result(
      'kc_privacy_session_lock_b'
    ) as revoked(id uuid)
  ),
  '8c100000-0000-4000-8000-000000000001'::uuid,
  'session revocation completes only after the privacy transaction releases'
);
-- SET is session-scoped on this dblink connection. Clear the simulated browser
-- JWT before fixture cleanup so the cascaded public-table guards evaluate the
-- maintenance operation itself, not the intentionally revoked test session.
select extensions.dblink_exec(
  'kc_privacy_session_lock_a',
  'reset request.jwt.claims'
);
select extensions.dblink_exec(
  'kc_privacy_session_lock_a',
  $remote$
    delete from auth.users
    where id = '8c000000-0000-4000-8000-000000000001';
  $remote$
);
select extensions.dblink_disconnect('kc_privacy_session_lock_a');
select extensions.dblink_disconnect('kc_privacy_session_lock_b');

create temporary table privacy_help_idempotency_fixture (
  label text primary key,
  response jsonb not null
) on commit drop;
grant select, insert, update on table
  pg_temp.privacy_help_idempotency_fixture
  to anon, authenticated, service_role;

create temporary table privacy_legacy_guard_baseline
on commit drop
as
select
  (select pg_catalog.count(*) from public.help_requests) as help_count,
  (
    select pg_catalog.count(*)
    from public.data_subject_requests
  ) as dsr_count,
  (
    select pg_catalog.count(*)
    from kc_private.help_privacy_submission_idempotency
  ) as replay_count;

-- Every legacy public entrypoint rejects every canonical privacy subtype for
-- both browser Auth states before any Help, DSR or replay-map write.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"anon"}',
  true
);
set local role anon;
with legacy_rpc(rpc_name) as (
  values
    ('public.kc_create_help_request'),
    ('public.kc_create_help_request_with_notification_claim'),
    ('public.kc_create_help_request_with_notification_claim_v2')
),
privacy_route(subtopic) as (
  values
    ('account_data_copy'),
    ('account_data_portability'),
    ('account_deletion')
)
select extensions.throws_ok(
  pg_catalog.format(
    'select * from %s(%L::jsonb)',
    legacy_rpc.rpc_name,
    pg_catalog.jsonb_build_object(
      'expected_auth_state', 'anonymous',
      'type', 'account_access',
      'topic', 'onboarding_settings',
      'subtopic', privacy_route.subtopic,
      'subject', 'Bypass legado anonimo',
      'message', 'A rota legada deve exigir o worker idempotente.',
      'priority', 'normal',
      'contact_email', 'privacy-legacy-bypass@example.test'
    )::text
  ),
  '22023',
  'HELP_PRIVACY_IDEMPOTENT_RPC_REQUIRED',
  pg_catalog.format(
    '%s rejects anonymous %s privacy bypass',
    legacy_rpc.rpc_name,
    privacy_route.subtopic
  )
)
from legacy_rpc
cross join privacy_route;
reset role;

insert into auth.users (id, email)
values (
  '89000000-0000-4000-8000-000000000001',
  'privacy-legacy-auth@example.test'
);
insert into public.profiles (id, email, full_name, is_admin)
values (
  '89000000-0000-4000-8000-000000000001',
  'privacy-legacy-auth@example.test',
  'Privacy Legacy Auth',
  false
);
insert into auth.sessions (id, user_id)
values (
  '89100000-0000-4000-8000-000000000001',
  '89000000-0000-4000-8000-000000000001'
);
select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', '89000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'session_id', '89100000-0000-4000-8000-000000000001',
    'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
with legacy_rpc(rpc_name) as (
  values
    ('public.kc_create_help_request'),
    ('public.kc_create_help_request_with_notification_claim'),
    ('public.kc_create_help_request_with_notification_claim_v2')
),
privacy_route(subtopic) as (
  values
    ('account_data_copy'),
    ('account_data_portability'),
    ('account_deletion')
)
select extensions.throws_ok(
  pg_catalog.format(
    'select * from %s(%L::jsonb)',
    legacy_rpc.rpc_name,
    pg_catalog.jsonb_build_object(
      'expected_auth_state', 'authenticated',
      'expected_user_id',
        '89000000-0000-4000-8000-000000000001',
      'type', 'account_access',
      'topic', 'onboarding_settings',
      'subtopic', privacy_route.subtopic,
      'subject', 'Bypass legado autenticado',
      'message', 'A rota legada deve exigir o worker idempotente.',
      'priority', 'normal',
      'contact_email', 'privacy-legacy-bypass@example.test'
    )::text
  ),
  '22023',
  'HELP_PRIVACY_IDEMPOTENT_RPC_REQUIRED',
  pg_catalog.format(
    '%s rejects authenticated %s privacy bypass',
    legacy_rpc.rpc_name,
    privacy_route.subtopic
  )
)
from legacy_rpc
cross join privacy_route;
reset role;

select extensions.ok(
  (
    select
      baseline.help_count =
        (select pg_catalog.count(*) from public.help_requests)
      and baseline.dsr_count =
        (select pg_catalog.count(*) from public.data_subject_requests)
      and baseline.replay_count = (
        select pg_catalog.count(*)
        from kc_private.help_privacy_submission_idempotency
      )
    from pg_temp.privacy_legacy_guard_baseline baseline
  ),
  'all legacy privacy bypass attempts leave Help, DSR and replay state unchanged'
);

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
delete from auth.users
where id = '89000000-0000-4000-8000-000000000001';

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"anon"}',
  true
);
set local role anon;
select extensions.lives_ok(
  $test$
    select *
    from public.kc_create_help_request(
      pg_catalog.jsonb_build_object(
        'type', 'question',
        'topic', 'platform_use',
        'subject', 'Ajuda generica v0',
        'message', 'O fluxo generico continua compativel com a RPC v0.',
        'priority', 'normal',
        'contact_email', 'generic-v0-compatible@example.test'
      )
    )
  $test$,
  'legacy v0 remains available for generic Help'
);
select extensions.lives_ok(
  $test$
    select *
    from public.kc_create_help_request_with_notification_claim(
      pg_catalog.jsonb_build_object(
        'type', 'question',
        'topic', 'platform_use',
        'subject', 'Ajuda generica v1',
        'message', 'O fluxo generico continua compativel com a RPC v1.',
        'priority', 'normal',
        'contact_email', 'generic-v1-compatible@example.test'
      )
    )
  $test$,
  'legacy notification v1 remains available for generic Help'
);
select extensions.lives_ok(
  $test$
    select *
    from public.kc_create_help_request_with_notification_claim_v2(
      pg_catalog.jsonb_build_object(
        'expected_auth_state', 'anonymous',
        'type', 'question',
        'topic', 'platform_use',
        'subject', 'Ajuda generica v2',
        'message', 'O fluxo generico continua compativel com a RPC v2.',
        'priority', 'normal',
        'contact_email', 'generic-v2-compatible@example.test'
      )
    )
  $test$,
  'legacy v2 remains available for generic Help'
);
select extensions.lives_ok(
  $test$
    select *
    from public.kc_create_help_request(
      pg_catalog.jsonb_build_object(
        'type', 'external_access',
        'topic', 'non_institutional_email',
        'subtopic', 'has_context',
        'subject', 'Acesso externo v0',
        'message', 'Acesso externo continua compativel com a RPC v0.',
        'contact_email', 'external-v0-compatible@example.test'
      )
    )
  $test$,
  'legacy v0 remains available for external access'
);
select extensions.lives_ok(
  $test$
    select *
    from public.kc_create_help_request_with_notification_claim(
      pg_catalog.jsonb_build_object(
        'type', 'external_access',
        'topic', 'non_institutional_email',
        'subtopic', 'has_context',
        'subject', 'Acesso externo v1',
        'message', 'Acesso externo continua compativel com a RPC v1.',
        'contact_email', 'external-v1-compatible@example.test'
      )
    )
  $test$,
  'legacy notification v1 remains available for external access'
);
select extensions.lives_ok(
  $test$
    select *
    from public.kc_create_help_request_with_notification_claim_v2(
      pg_catalog.jsonb_build_object(
        'expected_auth_state', 'anonymous',
        'type', 'external_access',
        'topic', 'non_institutional_email',
        'subtopic', 'has_context',
        'subject', 'Acesso externo v2',
        'message', 'Acesso externo continua compativel com a RPC v2.',
        'contact_email', 'external-v2-compatible@example.test'
      )
    )
  $test$,
  'legacy v2 remains available for external access'
);
reset role;

-- Anonymous browser without an Auth uid.
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"anon"}',
  true
);
set local role anon;

insert into pg_temp.privacy_help_idempotency_fixture (label, response)
select
  'anonymous_first',
  pg_catalog.to_jsonb(result)
from public.kc_create_privacy_help_request_v1(
  pg_catalog.jsonb_build_object(
    'expected_auth_state', 'anonymous',
    'expected_user_id', null,
    'idempotency_key', repeat('a', 64),
    'type', '  ACCOUNT_ACCESS ',
    'topic', ' Onboarding_Settings  ',
    'subtopic', ' ACCOUNT_DELETION ',
    'subject', 'Excluir conta anonima',
    'message', 'Pedido anonimo idempotente para excluir conta e dados.',
    'priority', 'normal',
    'page_path', '/ajuda.html',
    'contact_email', 'privacy-idempotency-anon@example.test',
    'allow_contact', true,
    'metadata', pg_catalog.jsonb_build_object(
      'request_kind', 'data_access_copy',
      'account_email', 'privacy-idempotency-anon@example.test',
      'export_before_erasure', 'not_now',
      'source', 'help_form',
      'record_state', 'retention_purged',
      'retention_purged_at', pg_catalog.now(),
      'lgpd_erasure', pg_catalog.jsonb_build_object(
        'content_redacted', true,
        'contact_redacted', true
      ),
      'unexpected_client_namespace', 'must_be_dropped'
    )
  )
) result;

reset role;
select extensions.is(
  kc_private.kc_cleanup_privacy_help_tombstones_v1(100),
  0,
  'client lifecycle markers cannot make cleanup delete a fresh guest map'
);
select extensions.ok(
  (
    select
      help_row.metadata ->> 'request_kind' = 'account_erasure'
      and help_row.metadata ->> 'source' = 'help_form'
      and not (
        help_row.metadata ?| array[
          'record_state',
          'retention_purged_at',
          'lgpd_erasure',
          'unexpected_client_namespace'
        ]
      )
    from public.help_requests help_row
    join kc_private.help_privacy_submission_idempotency entry_row
      on entry_row.help_request_id = help_row.id
    where help_row.contact_email =
      'privacy-idempotency-anon@example.test'
  ),
  'privacy metadata allowlist drops lifecycle and unknown client namespaces'
);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"anon"}',
  true
);
set local role anon;
insert into pg_temp.privacy_help_idempotency_fixture (label, response)
select
  'anonymous_replay',
  pg_catalog.to_jsonb(result)
from public.kc_create_privacy_help_request_v1(
  pg_catalog.jsonb_build_object(
    'expected_auth_state', 'anonymous',
    'expected_user_id', null,
    'idempotency_key', repeat('a', 64),
    'type', 'account_access',
    'topic', 'onboarding_settings',
    'subtopic', 'account_deletion',
    'subject', 'Excluir conta anonima',
    'message', 'Pedido anonimo idempotente para excluir conta e dados.',
    'priority', 'normal',
    'page_path', '/ajuda.html',
    'contact_email', 'privacy-idempotency-anon@example.test',
    'allow_contact', true,
    'metadata', pg_catalog.jsonb_build_object(
      'source', 'help_form',
      'export_before_erasure', 'not_now',
      'account_email', 'privacy-idempotency-anon@example.test',
      'request_kind', 'account_erasure'
    )
  )
) result;

reset role;
select extensions.is(
  (
    select bucket_row.attempts
    from kc_private.help_privacy_guest_rate_buckets bucket_row
    where bucket_row.window_started_at =
      pg_catalog.date_trunc('hour', pg_catalog.now())
  ),
  1,
  'guest replay does not consume another global circuit-breaker slot'
);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"anon"}',
  true
);
set local role anon;
insert into pg_temp.privacy_help_idempotency_fixture (label, response)
select
  'anonymous_recovery',
  pg_catalog.to_jsonb(result)
from public.kc_recover_privacy_help_request_v1(
  pg_catalog.jsonb_build_object(
    'expected_auth_state', 'anonymous',
    'expected_user_id', null,
    'source_auth_state', 'anonymous',
    'request_kind', 'account_erasure',
    'idempotency_key', repeat('a', 64)
  )
) result;

insert into pg_temp.privacy_help_idempotency_fixture (label, response)
select
  'guest_recover_before_delayed_create',
  pg_catalog.to_jsonb(result)
from public.kc_recover_privacy_help_request_v1(
  pg_catalog.jsonb_build_object(
    'expected_auth_state', 'anonymous',
    'expected_user_id', null,
    'source_auth_state', 'anonymous',
    'request_kind', 'account_erasure',
    'idempotency_key', repeat('e', 64)
  )
) result;

insert into pg_temp.privacy_help_idempotency_fixture (label, response)
select
  'guest_delayed_create',
  pg_catalog.to_jsonb(result)
from public.kc_create_privacy_help_request_v1(
  pg_catalog.jsonb_build_object(
    'expected_auth_state', 'anonymous',
    'expected_user_id', null,
    'idempotency_key', repeat('e', 64),
    'type', 'account_access',
    'topic', 'onboarding_settings',
    'subtopic', 'account_deletion',
    'subject', 'Create visitante atrasado',
    'message', 'A chave deve ser preservada ate este create chegar.',
    'priority', 'normal',
    'contact_email', 'privacy-delayed-guest@example.test',
    'metadata', pg_catalog.jsonb_build_object(
      'request_kind', 'account_erasure'
    )
  )
) result;

insert into pg_temp.privacy_help_idempotency_fixture (label, response)
select
  'guest_recover_after_delayed_create',
  pg_catalog.to_jsonb(result)
from public.kc_recover_privacy_help_request_v1(
  pg_catalog.jsonb_build_object(
    'expected_auth_state', 'anonymous',
    'expected_user_id', null,
    'source_auth_state', 'anonymous',
    'request_kind', 'account_erasure',
    'idempotency_key', repeat('e', 64)
  )
) result;

reset role;

select extensions.ok(
  (
    select
      first_row.response ->> 'out_id' =
        replay_row.response ->> 'out_id'
      and not (
        first_row.response ->> 'out_idempotency_replayed'
      )::boolean
      and (
        replay_row.response ->> 'out_idempotency_replayed'
      )::boolean
      and first_row.response -> 'out_notification_claim' = 'null'::jsonb
      and replay_row.response -> 'out_notification_claim' = 'null'::jsonb
      and first_row.response -> 'out_protocol' = 'null'::jsonb
      and replay_row.response -> 'out_protocol' = 'null'::jsonb
    from pg_temp.privacy_help_idempotency_fixture first_row
    join pg_temp.privacy_help_idempotency_fixture replay_row
      on replay_row.label = 'anonymous_replay'
    where first_row.label = 'anonymous_first'
  ),
  'anonymous retry replays the same Help id without claim or DSR disclosure'
);
select extensions.ok(
  (
    select
      first_row.response ->> 'out_id' =
        recovered_row.response ->> 'out_id'
      and recovered_row.response ->> 'out_recovery_state' =
        'recovered'
      and (
        recovered_row.response ->> 'out_idempotency_replayed'
      )::boolean
    from pg_temp.privacy_help_idempotency_fixture first_row
    join pg_temp.privacy_help_idempotency_fixture recovered_row
      on recovered_row.label = 'anonymous_recovery'
    where first_row.label = 'anonymous_first'
  ),
  'guest committed receipt is recovered by key and request kind without PII'
);
select extensions.ok(
  (
    select
      before_row.response ->> 'out_recovery_state' = 'ambiguous'
      and before_row.response -> 'out_id' = 'null'::jsonb
      and delayed_row.response ->> 'out_id' =
        after_row.response ->> 'out_id'
      and after_row.response ->> 'out_recovery_state' = 'recovered'
      and (
        after_row.response ->> 'out_idempotency_replayed'
      )::boolean
    from pg_temp.privacy_help_idempotency_fixture before_row
    join pg_temp.privacy_help_idempotency_fixture delayed_row
      on delayed_row.label = 'guest_delayed_create'
    join pg_temp.privacy_help_idempotency_fixture after_row
      on after_row.label = 'guest_recover_after_delayed_create'
    where before_row.label = 'guest_recover_before_delayed_create'
  ),
  'guest recover-before-delayed-create stays ambiguous, keeps the key, then recovers'
);
select extensions.is(
  (
    select pg_catalog.count(*)::integer
    from public.help_requests help_row
    where help_row.contact_email =
      'privacy-delayed-guest@example.test'
  ),
  1,
  'guest adversarial ordering creates exactly one Help'
);
select extensions.is(
  (
    select bucket_row.attempts
    from kc_private.help_privacy_guest_rate_buckets bucket_row
    where bucket_row.window_started_at =
      pg_catalog.date_trunc('hour', pg_catalog.now())
  ),
  2,
  'a second new guest Help consumes exactly one global slot'
);
select extensions.ok(
  (
    select pg_catalog.count(*) = 1
    from public.help_requests help_row
    where help_row.contact_email =
      'privacy-idempotency-anon@example.test'
  )
  and (
    select pg_catalog.count(*) = 1
    from kc_private.help_privacy_submission_idempotency entry_row
    join public.help_requests help_row
      on help_row.id = entry_row.help_request_id
    where help_row.contact_email =
      'privacy-idempotency-anon@example.test'
  ),
  'anonymous replay creates exactly one Help row and one replay-map row'
);
select extensions.is(
  (
    select
      help_row.type || ':' ||
      help_row.topic || ':' ||
      help_row.subtopic
    from public.help_requests help_row
    where help_row.contact_email =
      'privacy-idempotency-anon@example.test'
  ),
  'account_access:onboarding_settings:account_deletion',
  'classification and persisted Help use the same canonical route values'
);
select extensions.is(
  (
    select help_row.metadata ->> 'request_kind'
    from public.help_requests help_row
    where help_row.contact_email =
      'privacy-idempotency-anon@example.test'
  ),
  'account_erasure',
  'guest metadata cannot override the request kind derived from the route'
);
select extensions.ok(
  (
    select
      entry_row.key_hash <>
        repeat('a', 64)
      and entry_row.key_hash =
        pg_catalog.encode(
          extensions.digest(
            pg_catalog.convert_to(repeat('a', 64), 'UTF8'),
            'sha256'
          ),
          'hex'
        )
      and entry_row.payload_fingerprint ~ '^[a-f0-9]{64}$'
      and entry_row.caller_scope_hash ~ '^[a-f0-9]{64}$'
      and pg_catalog.to_jsonb(entry_row)::text not like
        '%privacy-idempotency-anon@example.test%'
      and pg_catalog.to_jsonb(entry_row)::text not like
        '%' || repeat('a', 64) || '%'
    from kc_private.help_privacy_submission_idempotency entry_row
    join public.help_requests help_row
      on help_row.id = entry_row.help_request_id
    where help_row.contact_email =
      'privacy-idempotency-anon@example.test'
  ),
  'private state stores hashes and safe response fields, never raw key or email'
);

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"anon"}',
  true
);
set local role anon;
select extensions.throws_ok(
  $test$
    select *
    from public.kc_create_privacy_help_request_v1(
      pg_catalog.jsonb_build_object(
        'expected_auth_state', 'anonymous',
        'expected_user_id', null,
        'idempotency_key', repeat('a', 64),
        'type', 'account_access',
        'topic', 'onboarding_settings',
        'subtopic', 'account_deletion',
        'subject', 'Excluir conta anonima',
        'message', 'Conteudo diferente sob a mesma chave opaca.',
        'priority', 'normal',
        'page_path', '/ajuda.html',
        'contact_email', 'privacy-idempotency-anon@example.test',
        'allow_contact', true,
        'metadata', pg_catalog.jsonb_build_object(
          'account_email', 'privacy-idempotency-anon@example.test',
          'export_before_erasure', 'not_now'
        )
      )
    )
  $test$,
  '22023',
  'HELP_IDEMPOTENCY_PAYLOAD_CONFLICT',
  'same anonymous key with a different canonical payload fails explicitly'
);
reset role;
select extensions.is(
  (
    select pg_catalog.count(*)::integer
    from public.help_requests help_row
    where help_row.contact_email =
      'privacy-idempotency-anon@example.test'
  ),
  1,
  'anonymous payload conflict leaves the original Help as the only row'
);

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"anon"}',
  true
);
set local role anon;
select extensions.throws_ok(
  $test$
    select *
    from public.kc_create_privacy_help_request_v1(
      pg_catalog.jsonb_build_object(
        'expected_auth_state', 'anonymous',
        'expected_user_id', null,
        'idempotency_key', repeat('d', 64),
        'type', 'account_access',
        'topic', 'onboarding_settings',
        'subtopic', 'account_deletion',
        'subject', 'Payload anonimo grande',
        'message', 'Este pedido deve falhar antes de calcular o digest.',
        'priority', 'normal',
        'contact_email', 'privacy-idempotency-large@example.test',
        'metadata', pg_catalog.jsonb_build_object(
          'blob', repeat('x', 17000)
        )
      )
    )
  $test$,
  '22023',
  'HELP_IDEMPOTENCY_PAYLOAD_TOO_LARGE',
  'oversized anonymous metadata fails before hashing and creation'
);
reset role;
select extensions.is(
  (
    select pg_catalog.count(*)::integer
    from public.help_requests help_row
    where help_row.contact_email =
      'privacy-idempotency-large@example.test'
  ),
  0,
  'oversized payload leaves no Help row'
);

insert into kc_private.help_privacy_guest_rate_buckets (
  window_started_at,
  attempts,
  updated_at
) values (
  pg_catalog.date_trunc('hour', pg_catalog.now()),
  9999,
  pg_catalog.now()
)
on conflict (window_started_at)
do update set
  attempts = excluded.attempts,
  updated_at = excluded.updated_at;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"anon"}',
  true
);
set local role anon;
insert into pg_temp.privacy_help_idempotency_fixture (label, response)
select
  'guest_global_budget_10000',
  pg_catalog.to_jsonb(result)
from public.kc_create_privacy_help_request_v1(
  pg_catalog.jsonb_build_object(
    'expected_auth_state', 'anonymous',
    'expected_user_id', null,
    'idempotency_key', repeat('1', 64),
    'type', 'account_access',
    'topic', 'onboarding_settings',
    'subtopic', 'account_data_copy',
    'subject', 'Ultimo slot global visitante',
    'message', 'Pedido com e-mail rotacionado que ocupa o ultimo slot.',
    'priority', 'normal',
    'contact_email', 'privacy-guest-budget-10000@example.test',
    'metadata', pg_catalog.jsonb_build_object(
      'account_email', 'privacy-guest-budget-10000@example.test',
      'data_scope', 'all_account_data',
      'data_copy_format', 'structured'
    )
  )
) result;
select extensions.throws_ok(
  $test$
    select *
    from public.kc_create_privacy_help_request_v1(
      pg_catalog.jsonb_build_object(
        'expected_auth_state', 'anonymous',
        'expected_user_id', null,
        'idempotency_key', repeat('2', 64),
        'type', 'account_access',
        'topic', 'onboarding_settings',
        'subtopic', 'account_data_copy',
        'subject', 'Rotacao visitante bloqueada',
        'message', 'Outro e-mail nao deve contornar o budget global.',
        'priority', 'normal',
        'contact_email', 'privacy-guest-budget-10001@example.test',
        'metadata', pg_catalog.jsonb_build_object(
          'account_email', 'privacy-guest-budget-10001@example.test',
          'data_scope', 'all_account_data',
          'data_copy_format', 'structured'
        )
      )
    )
  $test$,
  'P0001',
  'HELP_RATE_LIMIT_1H',
  'the 10001st new guest privacy Help fails closed despite e-mail rotation'
);
reset role;
select extensions.ok(
  (
    select bucket_row.attempts = 10000
    from kc_private.help_privacy_guest_rate_buckets bucket_row
    where bucket_row.window_started_at =
      pg_catalog.date_trunc('hour', pg_catalog.now())
  )
  and (
    select pg_catalog.count(*) = 1
    from public.help_requests help_row
    where help_row.contact_email =
      'privacy-guest-budget-10000@example.test'
  )
  and (
    select pg_catalog.count(*) = 0
    from public.help_requests help_row
    where help_row.contact_email =
      'privacy-guest-budget-10001@example.test'
  )
  and not exists (
    select 1
    from kc_private.help_privacy_submission_idempotency entry_row
    where entry_row.key_hash = pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(repeat('2', 64), 'UTF8'),
        'sha256'
      ),
      'hex'
    )
  ),
  'guest circuit breaker increments atomically and rejected rotation writes nothing'
);

-- Two Supabase anonymous Auth identities cannot replay each other's key.
insert into auth.users (id, email, is_anonymous)
values
  (
    '8a000000-0000-4000-8000-000000000001',
    'privacy-idempotency-anon-a@example.test',
    true
  ),
  (
    '8a000000-0000-4000-8000-000000000002',
    'privacy-idempotency-anon-b@example.test',
    true
  );
insert into public.profiles (id, email, full_name, is_admin)
values
  (
    '8a000000-0000-4000-8000-000000000001',
    'privacy-idempotency-anon-a@example.test',
    'Privacy Anonymous A',
    false
  ),
  (
    '8a000000-0000-4000-8000-000000000002',
    'privacy-idempotency-anon-b@example.test',
    'Privacy Anonymous B',
    false
  );
insert into auth.sessions (id, user_id)
values
  (
    '8a100000-0000-4000-8000-000000000001',
    '8a000000-0000-4000-8000-000000000001'
  ),
  (
    '8a100000-0000-4000-8000-000000000002',
    '8a000000-0000-4000-8000-000000000002'
  );

select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', '8a000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'is_anonymous', true,
    'session_id', '8a100000-0000-4000-8000-000000000001'
  )::text,
  true
);
set local role authenticated;
insert into pg_temp.privacy_help_idempotency_fixture (label, response)
select
  'anonymous_auth_a_retired_before_delayed_create',
  pg_catalog.to_jsonb(result)
from public.kc_recover_privacy_help_request_v1(
  pg_catalog.jsonb_build_object(
    'expected_auth_state', 'anonymous',
    'expected_user_id', null,
    'source_auth_state', 'anonymous',
    'request_kind', 'account_erasure',
    'idempotency_key', repeat('f', 64)
  )
) result;
select extensions.throws_ok(
  $test$
    select *
    from public.kc_create_privacy_help_request_v1(
      pg_catalog.jsonb_build_object(
        'expected_auth_state', 'anonymous',
        'expected_user_id', null,
        'idempotency_key', repeat('f', 64),
        'type', 'account_access',
        'topic', 'onboarding_settings',
        'subtopic', 'account_deletion',
        'subject', 'Create atrasado bloqueado',
        'message', 'O tombstone deve bloquear este create atrasado.',
        'priority', 'normal',
        'contact_email', 'privacy-retired-delayed@example.test'
      )
    )
  $test$,
  '22023',
  'HELP_IDEMPOTENCY_KEY_RETIRED',
  'uid recovery tombstone blocks a delayed create before Help'
);
insert into pg_temp.privacy_help_idempotency_fixture (label, response)
select
  'anonymous_auth_a',
  pg_catalog.to_jsonb(result)
from public.kc_create_privacy_help_request_v1(
  pg_catalog.jsonb_build_object(
    'expected_auth_state', 'anonymous',
    'expected_user_id', null,
    'idempotency_key', repeat('b', 64),
    'type', 'account_access',
    'topic', 'onboarding_settings',
    'subtopic', 'account_deletion',
    'subject', 'Excluir conta anonima A',
    'message', 'Pedido da primeira identidade anonima autenticada.',
    'priority', 'normal',
    'page_path', '/ajuda.html',
    'contact_email', 'privacy-idempotency-anon-a@example.test',
    'allow_contact', true,
    'metadata', pg_catalog.jsonb_build_object(
      'request_kind', 'data_access_copy',
      'account_email', 'privacy-idempotency-anon-a@example.test',
      'export_before_erasure', 'not_now'
    )
  )
) result;
reset role;
select extensions.ok(
  (
    select
      fixture_row.response ->> 'out_recovery_state' = 'retired'
      and fixture_row.response -> 'out_id' = 'null'::jsonb
    from pg_temp.privacy_help_idempotency_fixture fixture_row
    where fixture_row.label =
      'anonymous_auth_a_retired_before_delayed_create'
  )
  and (
    select pg_catalog.count(*) = 0
    from public.help_requests help_row
    where help_row.contact_email =
      'privacy-retired-delayed@example.test'
  ),
  'retired response commits while its delayed create leaves no Help'
);

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
update auth.users
set is_anonymous = false
where id = '8a000000-0000-4000-8000-000000000001';
select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', '8a000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'is_anonymous', false,
    'session_id', '8a100000-0000-4000-8000-000000000001'
  )::text,
  true
);
set local role authenticated;
insert into pg_temp.privacy_help_idempotency_fixture (label, response)
select
  'anonymous_auth_a_upgraded_same_uid',
  pg_catalog.to_jsonb(result)
from public.kc_recover_privacy_help_request_v1(
  pg_catalog.jsonb_build_object(
    'expected_auth_state', 'authenticated',
    'expected_user_id',
      '8a000000-0000-4000-8000-000000000001',
    'source_auth_state', 'anonymous',
    'request_kind', 'account_erasure',
    'idempotency_key', repeat('b', 64)
  )
) result;
reset role;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
update auth.users
set is_anonymous = true
where id = '8a000000-0000-4000-8000-000000000001';
select extensions.ok(
  (
    select
      original_row.response ->> 'out_id' =
        upgraded_row.response ->> 'out_id'
      and upgraded_row.response ->> 'out_recovery_state' =
        'recovered'
      and upgraded_row.response -> 'out_data_subject_request' =
        'null'::jsonb
      and upgraded_row.response -> 'out_protocol' = 'null'::jsonb
      and (
        select help_row.metadata ->> 'request_kind'
        from public.help_requests help_row
        where help_row.id = (
          original_row.response ->> 'out_id'
        )::uuid
      ) = 'account_erasure'
    from pg_temp.privacy_help_idempotency_fixture original_row
    join pg_temp.privacy_help_idempotency_fixture upgraded_row
      on upgraded_row.label =
        'anonymous_auth_a_upgraded_same_uid'
    where original_row.label = 'anonymous_auth_a'
  ),
  'anonymous Auth upgraded in place recovers the unowned Help by same UUID'
);
select extensions.is(
  (
    select bucket_row.attempts
    from kc_private.help_privacy_guest_rate_buckets bucket_row
    where bucket_row.window_started_at =
      pg_catalog.date_trunc('hour', pg_catalog.now())
  ),
  10000,
  'Supabase anonymous-uid create/recovery does not consume the guest budget'
);

select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', '8a000000-0000-4000-8000-000000000002',
    'role', 'authenticated',
    'is_anonymous', true,
    'session_id', '8a100000-0000-4000-8000-000000000002'
  )::text,
  true
);
set local role authenticated;
insert into pg_temp.privacy_help_idempotency_fixture (label, response)
select
  'anonymous_auth_b_cross_scope_recovery',
  pg_catalog.to_jsonb(result)
from public.kc_recover_privacy_help_request_v1(
  pg_catalog.jsonb_build_object(
    'expected_auth_state', 'anonymous',
    'expected_user_id', null,
    'source_auth_state', 'anonymous',
    'request_kind', 'account_erasure',
    'idempotency_key', repeat('b', 64)
  )
) result;
insert into pg_temp.privacy_help_idempotency_fixture (label, response)
select
  'anonymous_auth_b_unknown_recovery',
  pg_catalog.to_jsonb(result)
from public.kc_recover_privacy_help_request_v1(
  pg_catalog.jsonb_build_object(
    'expected_auth_state', 'anonymous',
    'expected_user_id', null,
    'source_auth_state', 'anonymous',
    'request_kind', 'account_erasure',
    'idempotency_key', repeat('9', 64)
  )
) result;
select extensions.throws_ok(
  $test$
    select *
    from public.kc_create_privacy_help_request_v1(
      pg_catalog.jsonb_build_object(
        'expected_auth_state', 'anonymous',
        'expected_user_id', null,
        'idempotency_key', repeat('b', 64),
        'type', 'account_access',
        'topic', 'onboarding_settings',
        'subtopic', 'account_deletion',
        'subject', 'Excluir conta anonima A',
        'message', 'Pedido da primeira identidade anonima autenticada.',
        'priority', 'normal',
        'page_path', '/ajuda.html',
        'contact_email', 'privacy-idempotency-anon-a@example.test',
        'allow_contact', true,
        'metadata', pg_catalog.jsonb_build_object(
          'account_email', 'privacy-idempotency-anon-a@example.test',
          'export_before_erasure', 'not_now'
        )
      )
    )
  $test$,
  '22023',
  'HELP_IDEMPOTENCY_KEY_INVALID',
  'another anonymous Auth identity receives only the generic invalid-key error'
);
select extensions.throws_ok(
  $test$
    select *
    from public.kc_create_privacy_help_request_v1(
      pg_catalog.jsonb_build_object(
        'expected_auth_state', 'anonymous',
        'expected_user_id', null,
        'idempotency_key', 'not-a-valid-key',
        'type', 'account_access',
        'topic', 'onboarding_settings',
        'subtopic', 'account_deletion',
        'subject', 'Excluir conta anonima B',
        'message', 'Pedido da segunda identidade anonima autenticada.',
        'priority', 'normal',
        'page_path', '/ajuda.html',
        'contact_email', 'privacy-idempotency-anon-b@example.test',
        'allow_contact', true,
        'metadata', pg_catalog.jsonb_build_object(
          'account_email', 'privacy-idempotency-anon-b@example.test',
          'export_before_erasure', 'not_now'
        )
      )
    )
  $test$,
  '22023',
  'HELP_IDEMPOTENCY_KEY_INVALID',
  'cross-caller conflict is indistinguishable from a malformed key'
);
reset role;
select extensions.ok(
  (
    select
      cross_row.response = unknown_row.response
      and cross_row.response ->> 'out_recovery_state' = 'retired'
      and cross_row.response -> 'out_id' = 'null'::jsonb
    from pg_temp.privacy_help_idempotency_fixture cross_row
    join pg_temp.privacy_help_idempotency_fixture unknown_row
      on unknown_row.label = 'anonymous_auth_b_unknown_recovery'
    where cross_row.label =
      'anonymous_auth_b_cross_scope_recovery'
  ),
  'cross-scope and unknown uid recovery have identical non-oracle responses'
);
select extensions.is(
  (
    select bucket_row.attempts
    from kc_private.help_privacy_recovery_rate_buckets bucket_row
    where bucket_row.caller_scope_hash = pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          'anonymous:8a000000-0000-4000-8000-000000000002',
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
      and bucket_row.window_started_at =
        pg_catalog.date_trunc('hour', pg_catalog.now())
  ),
  2,
  'unknown and cross-scope recovery consume the same per-uid rate bucket'
);
select extensions.ok(
  (
    select pg_catalog.count(*) = 1
    from public.help_requests help_row
    where help_row.contact_email in (
      'privacy-idempotency-anon-a@example.test',
      'privacy-idempotency-anon-b@example.test'
    )
  ),
  'cross-caller retries create no duplicate or second-caller Help'
);

delete from auth.sessions
where id = '8a100000-0000-4000-8000-000000000001';
select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', '8a000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'is_anonymous', true,
    'session_id', '8a100000-0000-4000-8000-000000000001'
  )::text,
  true
);
set local role authenticated;
select extensions.throws_ok(
  $test$
    select *
    from public.kc_create_privacy_help_request_v1(
      pg_catalog.jsonb_build_object(
        'expected_auth_state', 'anonymous',
        'expected_user_id', null,
        'idempotency_key', repeat('b', 64),
        'type', 'account_access',
        'topic', 'onboarding_settings',
        'subtopic', 'account_deletion',
        'subject', 'Excluir conta anonima A',
        'message', 'Pedido da primeira identidade anonima autenticada.',
        'priority', 'normal',
        'page_path', '/ajuda.html',
        'contact_email', 'privacy-idempotency-anon-a@example.test',
        'allow_contact', true,
        'metadata', pg_catalog.jsonb_build_object(
          'account_email', 'privacy-idempotency-anon-a@example.test',
          'export_before_erasure', 'not_now'
        )
      )
    )
  $test$,
  '42501',
  'AUTH_SESSION_NOT_ACTIVE',
  'revoked Supabase anonymous session cannot replay an accepted key'
);
reset role;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);

-- Authenticated owner: replay must preserve both Help and DSR response.
insert into auth.users (id, email)
values (
  '8b000000-0000-4000-8000-000000000001',
  'privacy-idempotency-owner@example.test'
);
insert into public.profiles (id, email, full_name, is_admin)
values (
  '8b000000-0000-4000-8000-000000000001',
  'privacy-idempotency-owner@example.test',
  'Privacy Idempotency Owner',
  false
);
insert into auth.sessions (id, user_id)
values (
  '8b100000-0000-4000-8000-000000000001',
  '8b000000-0000-4000-8000-000000000001'
);

select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', '8b000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'session_id', '8b100000-0000-4000-8000-000000000001',
    'is_anonymous', false
  )::text,
  true
);
set local role authenticated;

insert into pg_temp.privacy_help_idempotency_fixture (label, response)
select
  'authenticated_first',
  pg_catalog.to_jsonb(result)
from public.kc_create_privacy_help_request_v1(
  pg_catalog.jsonb_build_object(
    'expected_auth_state', 'authenticated',
    'expected_user_id',
      '8b000000-0000-4000-8000-000000000001',
    'idempotency_key', repeat('c', 64),
    'type', 'account_access',
    'topic', 'onboarding_settings',
    'subtopic', 'account_data_copy',
    'subject', 'Copiar dados autenticados',
    'message', 'Pedido autenticado idempotente de copia dos dados.',
    'priority', 'normal',
    'page_path', '/ajuda.html',
    'contact_email', 'privacy-idempotency-owner@example.test',
    'allow_contact', true,
    'metadata', pg_catalog.jsonb_build_object(
      'request_kind', 'account_erasure',
      'account_email', 'privacy-idempotency-owner@example.test',
      'data_scope', 'all_account_data',
      'data_copy_format', 'structured'
    )
  )
) result;

reset role;
select extensions.is(
  (
    select bucket_row.attempts
    from kc_private.help_privacy_guest_rate_buckets bucket_row
    where bucket_row.window_started_at =
      pg_catalog.date_trunc('hour', pg_catalog.now())
  ),
  10000,
  'authenticated privacy create does not consume the guest budget'
);
update public.data_subject_requests request_row
set status = 'partial_failure'
where request_row.id = (
  select (
    fixture_row.response
      -> 'out_data_subject_request'
      ->> 'id'
  )::uuid
  from pg_temp.privacy_help_idempotency_fixture fixture_row
  where fixture_row.label = 'authenticated_first'
);

select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', '8b000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'session_id', '8b100000-0000-4000-8000-000000000001',
    'is_anonymous', false
  )::text,
  true
);
set local role authenticated;

insert into pg_temp.privacy_help_idempotency_fixture (label, response)
select
  'authenticated_replay',
  pg_catalog.to_jsonb(result)
from public.kc_recover_privacy_help_request_v1(
  pg_catalog.jsonb_build_object(
    'expected_auth_state', 'authenticated',
    'expected_user_id',
      '8b000000-0000-4000-8000-000000000001',
    'source_auth_state', 'authenticated',
    'request_kind', 'data_access_copy',
    'idempotency_key', repeat('c', 64),
    'client_transport_hint', 'must_be_ignored'
  )
) result;

reset role;

select extensions.ok(
  (
    select
      first_row.response ->> 'out_id' =
        replay_row.response ->> 'out_id'
      and first_row.response ->> 'out_protocol' =
        replay_row.response ->> 'out_protocol'
      and first_row.response
        -> 'out_data_subject_request'
        ->> 'status' = 'ready'
      and replay_row.response
        -> 'out_data_subject_request'
        ->> 'status' = 'partial_failure'
      and first_row.response -> 'out_data_subject_request'
        <> replay_row.response -> 'out_data_subject_request'
      and not (
        first_row.response ->> 'out_idempotency_replayed'
      )::boolean
      and (
        replay_row.response ->> 'out_idempotency_replayed'
      )::boolean
      and replay_row.response ->> 'out_recovery_state' = 'recovered'
      and first_row.response ->> 'out_protocol' ~
        '^KC-DSR-[0-9]{8}-[A-F0-9]{16}$'
    from pg_temp.privacy_help_idempotency_fixture first_row
    join pg_temp.privacy_help_idempotency_fixture replay_row
      on replay_row.label = 'authenticated_replay'
    where first_row.label = 'authenticated_first'
  ),
  'authenticated replay returns the same Help and a fresh safe DSR projection'
);
select extensions.ok(
  (
    select
      replay_row.response -> 'out_data_subject_request' =
        (
          pg_catalog.to_jsonb(request_row)
            - 'user_id'
            - 'subject_hash'
            - 'idempotency_key'
        )
      and not (
        replay_row.response
          -> 'out_data_subject_request'
          ?| array['user_id', 'subject_hash', 'idempotency_key']
      )
    from pg_temp.privacy_help_idempotency_fixture replay_row
    join public.data_subject_requests request_row
      on request_row.id = (
        replay_row.response
          -> 'out_data_subject_request'
          ->> 'id'
      )::uuid
    where replay_row.label = 'authenticated_replay'
  ),
  'authenticated replay reprojects current DSR state without private fields'
);
select extensions.ok(
  (
    select pg_catalog.count(*) = 1
    from public.help_requests help_row
    where help_row.user_id =
      '8b000000-0000-4000-8000-000000000001'
      and help_row.type = 'account_access'
      and help_row.metadata ->> 'request_kind' =
        'data_access_copy'
  )
  and (
    select pg_catalog.count(*) = 1
    from public.data_subject_requests request_row
    where request_row.user_id =
      '8b000000-0000-4000-8000-000000000001'
      and request_row.request_kind = 'data_access_copy'
  ),
  'authenticated replay creates one Help and one DSR'
);

select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', '8b000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'session_id', '8b100000-0000-4000-8000-000000000001',
    'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select extensions.throws_ok(
  $test$
    select *
    from public.kc_create_privacy_help_request_v1(
      pg_catalog.jsonb_build_object(
        'expected_auth_state', 'authenticated',
        'expected_user_id',
          '8b000000-0000-4000-8000-000000000001',
        'idempotency_key', repeat('c', 64),
        'type', 'account_access',
        'topic', 'onboarding_settings',
        'subtopic', 'account_data_copy',
        'subject', 'Copiar dados autenticados',
        'message', 'Mensagem autenticada alterada apos a primeira criacao.',
        'priority', 'normal',
        'page_path', '/ajuda.html',
        'contact_email', 'privacy-idempotency-owner@example.test',
        'allow_contact', true,
        'metadata', pg_catalog.jsonb_build_object(
          'account_email', 'privacy-idempotency-owner@example.test',
          'data_scope', 'all_account_data',
          'data_copy_format', 'structured'
        )
      )
    )
  $test$,
  '22023',
  'HELP_IDEMPOTENCY_PAYLOAD_CONFLICT',
  'same authenticated key with changed payload fails explicitly'
);
reset role;

select extensions.ok(
  (
    select pg_catalog.count(*) = 1
    from public.help_requests help_row
    where help_row.user_id =
      '8b000000-0000-4000-8000-000000000001'
      and help_row.type = 'account_access'
  )
  and (
    select pg_catalog.count(*) = 1
    from public.data_subject_requests request_row
    where request_row.user_id =
      '8b000000-0000-4000-8000-000000000001'
      and request_row.request_kind = 'data_access_copy'
  ),
  'authenticated payload conflict creates no Help or DSR duplicate'
);

-- Sequential revocation proof: both replay paths must revalidate and lock the
-- exact live session before consulting either committed state or a miss.
delete from auth.sessions
where id = '8b100000-0000-4000-8000-000000000001';
select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', '8b000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'session_id', '8b100000-0000-4000-8000-000000000001',
    'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
select extensions.throws_ok(
  $test$
    select *
    from public.kc_create_privacy_help_request_v1(
      pg_catalog.jsonb_build_object(
        'expected_auth_state', 'authenticated',
        'expected_user_id',
          '8b000000-0000-4000-8000-000000000001',
        'idempotency_key', repeat('c', 64),
        'type', 'account_access',
        'topic', 'onboarding_settings',
        'subtopic', 'account_data_copy',
        'subject', 'Copiar dados autenticados',
        'message', 'Pedido autenticado idempotente de copia dos dados.',
        'priority', 'normal',
        'page_path', '/ajuda.html',
        'contact_email', 'privacy-idempotency-owner@example.test',
        'allow_contact', true,
        'metadata', pg_catalog.jsonb_build_object(
          'account_email', 'privacy-idempotency-owner@example.test',
          'data_scope', 'all_account_data',
          'data_copy_format', 'structured'
        )
      )
    )
  $test$,
  '42501',
  'AUTH_SESSION_NOT_ACTIVE',
  'revoked authenticated session cannot replay through create'
);
select extensions.throws_ok(
  $test$
    select *
    from public.kc_recover_privacy_help_request_v1(
      pg_catalog.jsonb_build_object(
        'expected_auth_state', 'authenticated',
        'expected_user_id',
          '8b000000-0000-4000-8000-000000000001',
        'source_auth_state', 'authenticated',
        'request_kind', 'data_access_copy',
        'idempotency_key', repeat('8', 64)
      )
    )
  $test$,
  '42501',
  'AUTH_SESSION_NOT_ACTIVE',
  'revoked authenticated session cannot probe a recovery miss'
);
reset role;
insert into auth.sessions (id, user_id)
values (
  '8b100000-0000-4000-8000-000000000001',
  '8b000000-0000-4000-8000-000000000001'
);

-- The canonical daily purge must retire stale replay state without preserving
-- a second copy of the DSR or the Help PII.
update kc_private.help_privacy_submission_idempotency entry_row
set retired_at = pg_catalog.now() - interval '91 days'
where entry_row.key_hash = pg_catalog.encode(
  extensions.digest(
    pg_catalog.convert_to(repeat('f', 64), 'UTF8'),
    'sha256'
  ),
  'hex'
);
update public.data_subject_requests request_row
set
  status = 'completed',
  completed_at = pg_catalog.now(),
  created_at = pg_catalog.now() - interval '2 days',
  retention_until = pg_catalog.now() - interval '1 day'
where request_row.user_id =
  '8b000000-0000-4000-8000-000000000001'
  and request_row.request_kind = 'data_access_copy';

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
set local role service_role;
insert into pg_temp.privacy_help_idempotency_fixture (label, response)
select
  'canonical_purge',
  public.kc_purge_expired_data_subject_requests(100);
reset role;

select extensions.ok(
  (
    select
      (fixture_row.response ->> 'purged_requests')::integer >= 1
      and (
        fixture_row.response
        ->> 'purged_privacy_help_state_rows'
      )::integer >= 1
    from pg_temp.privacy_help_idempotency_fixture fixture_row
    where fixture_row.label = 'canonical_purge'
  ),
  'canonical DSR purge also cleans expired privacy Help replay state'
);
select extensions.ok(
  not exists (
    select 1
    from public.data_subject_requests request_row
    where request_row.user_id =
      '8b000000-0000-4000-8000-000000000001'
      and request_row.request_kind = 'data_access_copy'
  )
  and not exists (
    select 1
    from kc_private.help_privacy_submission_idempotency entry_row
    where entry_row.key_hash in (
      pg_catalog.encode(
        extensions.digest(
          pg_catalog.convert_to(repeat('c', 64), 'UTF8'),
          'sha256'
        ),
        'hex'
      ),
      pg_catalog.encode(
        extensions.digest(
          pg_catalog.convert_to(repeat('f', 64), 'UTF8'),
          'sha256'
        ),
        'hex'
      )
    )
  )
  and exists (
    select 1
    from public.help_requests help_row
    where help_row.id = (
      select (
        fixture_row.response ->> 'out_id'
      )::uuid
      from pg_temp.privacy_help_idempotency_fixture fixture_row
      where fixture_row.label = 'authenticated_first'
    )
      and help_row.user_id is null
      and help_row.metadata ->> 'record_state' =
        'retention_purged'
      and help_row.contact_email like 'purged-%@invalid.local'
  ),
  'purge deletes DSR and replay mappings while retaining only a redacted Help'
);

select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', '8b000000-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'session_id', '8b100000-0000-4000-8000-000000000001',
    'is_anonymous', false
  )::text,
  true
);
set local role authenticated;
insert into pg_temp.privacy_help_idempotency_fixture (label, response)
select
  'authenticated_recovery_after_purge',
  pg_catalog.to_jsonb(result)
from public.kc_recover_privacy_help_request_v1(
  pg_catalog.jsonb_build_object(
    'expected_auth_state', 'authenticated',
    'expected_user_id',
      '8b000000-0000-4000-8000-000000000001',
    'source_auth_state', 'authenticated',
    'request_kind', 'data_access_copy',
    'idempotency_key', repeat('c', 64)
  )
) result;
reset role;
select extensions.ok(
  (
    select
      fixture_row.response ->> 'out_recovery_state' = 'retired'
      and fixture_row.response -> 'out_id' = 'null'::jsonb
      and fixture_row.response
        -> 'out_data_subject_request' = 'null'::jsonb
      and fixture_row.response -> 'out_protocol' = 'null'::jsonb
    from pg_temp.privacy_help_idempotency_fixture fixture_row
    where fixture_row.label =
      'authenticated_recovery_after_purge'
  ),
  'post-purge recovery returns only a safe retired receipt without DSR data'
);

-- Rate-bucket cleanup is bounded independently and can make progress over
-- successive invocations instead of issuing an unbounded backlog delete.
insert into kc_private.help_privacy_recovery_rate_buckets (
  caller_scope_hash,
  caller_user_id,
  window_started_at,
  attempts,
  updated_at
)
select
  pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        'anonymous:8a000000-0000-4000-8000-000000000002',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),
  '8a000000-0000-4000-8000-000000000002'::uuid,
  pg_catalog.date_trunc(
    'hour',
    pg_catalog.now() - pg_catalog.make_interval(days => age_row.days_old)
  ),
  1,
  pg_catalog.now() - pg_catalog.make_interval(days => age_row.days_old)
from (values (3), (4), (5)) as age_row(days_old);
insert into kc_private.help_privacy_guest_rate_buckets (
  window_started_at,
  attempts,
  updated_at
)
select
  pg_catalog.date_trunc(
    'hour',
    pg_catalog.now() - pg_catalog.make_interval(days => age_row.days_old)
  ),
  1,
  pg_catalog.now() - pg_catalog.make_interval(days => age_row.days_old)
from (values (3), (4), (5)) as age_row(days_old);

create temporary table privacy_help_cleanup_fixture (
  step text primary key,
  removed integer not null
) on commit drop;
insert into pg_temp.privacy_help_cleanup_fixture (step, removed)
values (
  'first',
  kc_private.kc_cleanup_privacy_help_tombstones_v1(1)
);
select extensions.ok(
  (
    select cleanup_row.removed = 2
    from pg_temp.privacy_help_cleanup_fixture cleanup_row
    where cleanup_row.step = 'first'
  )
  and (
    select pg_catalog.count(*) = 2
    from kc_private.help_privacy_recovery_rate_buckets bucket_row
    where bucket_row.caller_user_id =
      '8a000000-0000-4000-8000-000000000002'
      and bucket_row.window_started_at <
        pg_catalog.now() - interval '2 days'
  )
  and (
    select pg_catalog.count(*) = 2
    from kc_private.help_privacy_guest_rate_buckets bucket_row
    where bucket_row.window_started_at <
      pg_catalog.now() - interval '2 days'
  ),
  'first cleanup removes at most one expired row from each rate class'
);
insert into pg_temp.privacy_help_cleanup_fixture (step, removed)
values (
  'second',
  kc_private.kc_cleanup_privacy_help_tombstones_v1(1)
);
select extensions.ok(
  (
    select cleanup_row.removed = 2
    from pg_temp.privacy_help_cleanup_fixture cleanup_row
    where cleanup_row.step = 'second'
  )
  and (
    select pg_catalog.count(*) = 1
    from kc_private.help_privacy_recovery_rate_buckets bucket_row
    where bucket_row.caller_user_id =
      '8a000000-0000-4000-8000-000000000002'
      and bucket_row.window_started_at <
        pg_catalog.now() - interval '2 days'
  )
  and (
    select pg_catalog.count(*) = 1
    from kc_private.help_privacy_guest_rate_buckets bucket_row
    where bucket_row.window_started_at <
      pg_catalog.now() - interval '2 days'
  ),
  'next cleanup continues both bounded rate-bucket backlogs'
);

delete from auth.users
where id in (
  '8a000000-0000-4000-8000-000000000001',
  '8a000000-0000-4000-8000-000000000002'
);
select extensions.ok(
  not exists (
    select 1
    from kc_private.help_privacy_submission_idempotency entry_row
    where entry_row.caller_user_id in (
      '8a000000-0000-4000-8000-000000000001',
      '8a000000-0000-4000-8000-000000000002'
    )
  )
  and not exists (
    select 1
    from kc_private.help_privacy_recovery_rate_buckets bucket_row
    where bucket_row.caller_user_id in (
      '8a000000-0000-4000-8000-000000000001',
      '8a000000-0000-4000-8000-000000000002'
    )
  )
  and (
    select pg_catalog.count(*) >= 2
    from kc_private.help_privacy_submission_idempotency entry_row
    where entry_row.auth_state = 'anonymous'
      and entry_row.caller_user_id is null
      and entry_row.caller_scope_hash = pg_catalog.encode(
        extensions.digest(
          pg_catalog.convert_to('anonymous:guest', 'UTF8'),
          'sha256'
        ),
        'hex'
      )
  ),
  'Auth deletion cascades uid state while preserving real guest replay maps'
);

select extensions.finish();
rollback;

begin;

create extension if not exists pgtap with schema extensions;

select extensions.no_plan();

select extensions.has_table(
  'kc_private',
  'help_request_notification_claims',
  'notification ownership claims are stored in the private schema'
);
select extensions.has_function(
  'public',
  'kc_create_help_request_with_notification_claim',
  array['jsonb'],
  'atomic help-request creation RPC exists'
);
select extensions.has_function(
  'public',
  'kc_claim_help_request_notification',
  array['uuid', 'text', 'uuid', 'uuid', 'integer'],
  'service-only notification reservation RPC exists'
);
select extensions.has_function(
  'public',
  'kc_complete_help_request_notification',
  array['uuid', 'uuid', 'boolean', 'jsonb'],
  'service-only notification CAS completion RPC exists'
);
select extensions.ok(
  not has_table_privilege(
    'service_role',
    'kc_private.help_request_notification_claims',
    'select,insert,update,delete'
  ),
  'even service_role cannot inspect claim digests outside gated RPCs'
);
select extensions.ok(
  has_function_privilege(
    'anon',
    'public.kc_create_help_request_with_notification_claim(jsonb)',
    'execute'
  ),
  'anonymous applicants can atomically create an external-access request'
);
select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.kc_create_help_request_with_notification_claim(jsonb)',
    'execute'
  ),
  'authenticated applicants can atomically create a request'
);
select extensions.ok(
  not has_function_privilege(
    'anon',
    'public.kc_claim_help_request_notification(uuid,text,uuid,uuid,integer)',
    'execute'
  ),
  'browser anon role cannot reserve privileged delivery directly'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.kc_claim_help_request_notification(uuid,text,uuid,uuid,integer)',
    'execute'
  ),
  'browser authenticated role cannot reserve privileged delivery directly'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.kc_claim_help_request_notification(uuid,text,uuid,uuid,integer)',
    'execute'
  ),
  'service role can reserve delivery through the authorization gate'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.kc_complete_help_request_notification(uuid,uuid,boolean,jsonb)',
    'execute'
  ),
  'browser roles cannot assert SMTP completion'
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
            'PG_CRON_UNAVAILABLE_HELP_CLAIM_PURGE_NOT_SCHEDULED'
        )
      )
    from kc_private.help_notification_retention_schedule_state
  ),
  'migration records a purge schedule or an explicit operational alert'
);

create temporary table help_notification_test_fixture (
  label text primary key,
  help_request_id uuid not null,
  raw_claim text,
  claim_expires_at timestamptz
) on commit drop;
grant select, insert, update on table pg_temp.help_notification_test_fixture
  to anon, authenticated, service_role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

insert into pg_temp.help_notification_test_fixture (
  label,
  help_request_id,
  raw_claim,
  claim_expires_at
)
select
  'anonymous',
  result.out_id,
  result.out_notification_claim,
  result.out_notification_claim_expires_at
from public.kc_create_help_request_with_notification_claim(
  jsonb_build_object(
    'type', 'external_access',
    'topic', 'non_institutional_email',
    'subtopic', 'has_context',
    'subject', 'Acesso externo anonimo',
    'message', 'Solicitacao anonima valida para testar notificacao segura.',
    'contact_email', 'help-claim-anon@example.test',
    'metadata', jsonb_build_object(
      'request_kind', 'external_access',
      'requester_name', 'Applicant Anonymous'
    )
  )
) result;

reset role;

select extensions.is(
  (
    select length(raw_claim)
    from pg_temp.help_notification_test_fixture
    where label = 'anonymous'
  ),
  64,
  'raw claim contains 256 random bits encoded as lowercase hex'
);
select extensions.ok(
  (
    select claim_expires_at > now()
       and claim_expires_at <= now() + interval '16 minutes'
    from pg_temp.help_notification_test_fixture
    where label = 'anonymous'
  ),
  'raw claim has a short bounded lifetime'
);
select extensions.ok(
  (
    select stored.claim_hash <> fixture.raw_claim
       and stored.claim_hash = encode(
         extensions.digest(convert_to(fixture.raw_claim, 'UTF8'), 'sha256'
       ),
       'hex')
       and stored.owner_id is null
    from kc_private.help_request_notification_claims stored
    join pg_temp.help_notification_test_fixture fixture
      on fixture.help_request_id = stored.help_request_id
    where fixture.label = 'anonymous'
  ),
  'database stores only the digest and records anonymous ownership'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"service_role"}',
  true
);
set local role service_role;

select extensions.throws_ok(
  $test$
    select *
    from public.kc_claim_help_request_notification(
      (
        select help_request_id
        from pg_temp.help_notification_test_fixture
        where label = 'anonymous'
      ),
      repeat('0', 64),
      null,
      '10000000-0000-4000-8000-000000001001',
      120
    )
  $test$,
  '42501',
  'NOTIFICATION_CLAIM_INVALID',
  'a wrong anonymous proof cannot reserve delivery'
);

select extensions.is(
  (
    select out_state
    from public.kc_claim_help_request_notification(
      (
        select help_request_id
        from pg_temp.help_notification_test_fixture
        where label = 'anonymous'
      ),
      (
        select raw_claim
        from pg_temp.help_notification_test_fixture
        where label = 'anonymous'
      ),
      null,
      '10000000-0000-4000-8000-000000001001',
      120
    )
  ),
  'claimed',
  'the correct anonymous proof atomically reserves delivery'
);

select extensions.throws_ok(
  $test$
    select *
    from public.kc_claim_help_request_notification(
      (
        select help_request_id
        from pg_temp.help_notification_test_fixture
        where label = 'anonymous'
      ),
      (
        select raw_claim
        from pg_temp.help_notification_test_fixture
        where label = 'anonymous'
      ),
      null,
      '10000000-0000-4000-8000-000000001002',
      120
    )
  $test$,
  '55P03',
  'NOTIFICATION_DELIVERY_BUSY',
  'a concurrent claimant cannot acquire an active lease'
);

select extensions.is(
  public.kc_complete_help_request_notification(
    (
      select help_request_id
      from pg_temp.help_notification_test_fixture
      where label = 'anonymous'
    ),
    '10000000-0000-4000-8000-000000001099',
    true,
    '{}'::jsonb
  ),
  false,
  'a stale or forged lease cannot complete delivery'
);

select extensions.is(
  public.kc_complete_help_request_notification(
    (
      select help_request_id
      from pg_temp.help_notification_test_fixture
      where label = 'anonymous'
    ),
    '10000000-0000-4000-8000-000000001001',
    false,
    jsonb_build_object(
      'admin_notification',
      jsonb_build_object(
        'status', 'failed',
        'provider', 'hostinger_smtp',
        'error_code', 'SMTP_PROVIDER_ERROR',
        'to', 'must-not-be-persisted@example.test',
        'error_message', 'must not be persisted'
      ),
      'ack_email',
      jsonb_build_object('status', 'skipped')
    )
  ),
  true,
  'failed provider acceptance releases the lease for a retry'
);

reset role;

select extensions.is(
  (
    select status
    from kc_private.help_request_notification_claims
    where help_request_id = (
      select help_request_id
      from pg_temp.help_notification_test_fixture
      where label = 'anonymous'
    )
  ),
  'failed',
  'failed delivery remains non-terminal'
);
select extensions.ok(
  (
    select last_result::text not like '%must-not-be-persisted%'
       and last_result::text not like '%error_message%'
    from kc_private.help_request_notification_claims
    where help_request_id = (
      select help_request_id
      from pg_temp.help_notification_test_fixture
      where label = 'anonymous'
    )
  ),
  'completion strips destinations and raw provider errors'
);

set local role service_role;

select extensions.is(
  (
    select out_attempt
    from public.kc_claim_help_request_notification(
      (
        select help_request_id
        from pg_temp.help_notification_test_fixture
        where label = 'anonymous'
      ),
      (
        select raw_claim
        from pg_temp.help_notification_test_fixture
        where label = 'anonymous'
      ),
      null,
      '10000000-0000-4000-8000-000000001002',
      120
    )
  ),
  2,
  'same proof can retry only after an explicit failure'
);

select extensions.is(
  public.kc_complete_help_request_notification(
    (
      select help_request_id
      from pg_temp.help_notification_test_fixture
      where label = 'anonymous'
    ),
    '10000000-0000-4000-8000-000000001002',
    true,
    jsonb_build_object(
      'admin_notification',
      jsonb_build_object(
        'status', 'sent',
        'provider', 'hostinger_smtp',
        'accepted_at', '2026-07-28T21:00:00Z'
      ),
      'ack_email',
      jsonb_build_object('status', 'sent', 'provider', 'hostinger_smtp')
    )
  ),
  true,
  'matching CAS lease records provider acceptance'
);
select extensions.is(
  (
    select out_state
    from public.kc_claim_help_request_notification(
      (
        select help_request_id
        from pg_temp.help_notification_test_fixture
        where label = 'anonymous'
      ),
      (
        select raw_claim
        from pg_temp.help_notification_test_fixture
        where label = 'anonymous'
      ),
      null,
      '10000000-0000-4000-8000-000000001003',
      120
    )
  ),
  'already_sent',
  'replay with the valid proof is idempotent and does not send again'
);

reset role;

select extensions.is(
  (
    select attempt_count
    from kc_private.help_request_notification_claims
    where help_request_id = (
      select help_request_id
      from pg_temp.help_notification_test_fixture
      where label = 'anonymous'
    )
  ),
  2,
  'terminal replay does not increment the attempt counter'
);

reset role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
insert into pg_temp.help_notification_test_fixture (
  label,
  help_request_id,
  raw_claim,
  claim_expires_at
)
select
  'expired',
  result.out_id,
  result.out_notification_claim,
  result.out_notification_claim_expires_at
from public.kc_create_help_request_with_notification_claim(
  jsonb_build_object(
    'type', 'external_access',
    'topic', 'partnership_access',
    'subtopic', 'partner_project',
    'subject', 'Acesso externo expirado',
    'message', 'Solicitacao valida cujo claim sera expirado pelo teste.',
    'contact_email', 'help-claim-expired@example.test'
  )
) result;
reset role;

update kc_private.help_request_notification_claims
set claim_expires_at = now() - interval '1 minute'
where help_request_id = (
  select help_request_id
  from pg_temp.help_notification_test_fixture
  where label = 'expired'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"service_role"}',
  true
);
set local role service_role;
select extensions.throws_ok(
  $test$
    select *
    from public.kc_claim_help_request_notification(
      (
        select help_request_id
        from pg_temp.help_notification_test_fixture
        where label = 'expired'
      ),
      (
        select raw_claim
        from pg_temp.help_notification_test_fixture
        where label = 'expired'
      ),
      null,
      '10000000-0000-4000-8000-000000001004',
      120
    )
  $test$,
  'P0001',
  'NOTIFICATION_CLAIM_EXPIRED',
  'expired proof cannot reserve delivery'
);
reset role;

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000001011', 'help-claim-owner@example.test'),
  ('00000000-0000-4000-8000-000000001012', 'help-claim-other@example.test');
insert into public.profiles (id, email, full_name, is_admin)
values
  (
    '00000000-0000-4000-8000-000000001011',
    'help-claim-owner@example.test',
    'Help Claim Owner',
    false
  ),
  (
    '00000000-0000-4000-8000-000000001012',
    'help-claim-other@example.test',
    'Help Claim Other',
    false
  );
insert into auth.sessions (id, user_id)
values (
  '20000000-0000-4000-8000-000000001011',
  '00000000-0000-4000-8000-000000001011'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000001011',
    'role', 'authenticated',
    'session_id', '20000000-0000-4000-8000-000000001011'
  )::text,
  true
);
set local role authenticated;
insert into pg_temp.help_notification_test_fixture (
  label,
  help_request_id,
  raw_claim,
  claim_expires_at
)
select
  'owner',
  result.out_id,
  result.out_notification_claim,
  result.out_notification_claim_expires_at
from public.kc_create_help_request_with_notification_claim(
  jsonb_build_object(
    'type', 'external_access',
    'topic', 'non_institutional_email',
    'subtopic', 'has_context',
    'subject', 'Acesso externo autenticado',
    'message', 'Solicitacao autenticada valida para testar ownership.',
    'contact_email', 'help-claim-owner@example.test'
  )
) result;
reset role;

select extensions.is(
  (
    select owner_id
    from kc_private.help_request_notification_claims
    where help_request_id = (
      select help_request_id
      from pg_temp.help_notification_test_fixture
      where label = 'owner'
    )
  ),
  '00000000-0000-4000-8000-000000001011'::uuid,
  'authenticated creation binds delivery to the exact account'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"service_role"}',
  true
);
set local role service_role;
select extensions.throws_ok(
  $test$
    select *
    from public.kc_claim_help_request_notification(
      (
        select help_request_id
        from pg_temp.help_notification_test_fixture
        where label = 'owner'
      ),
      null,
      '00000000-0000-4000-8000-000000001012',
      '10000000-0000-4000-8000-000000001011',
      120
    )
  $test$,
  '42501',
  'NOTIFICATION_CLAIM_INVALID',
  'a different authenticated account cannot reserve the notification'
);
select extensions.is(
  (
    select out_state
    from public.kc_claim_help_request_notification(
      (
        select help_request_id
        from pg_temp.help_notification_test_fixture
        where label = 'owner'
      ),
      null,
      '00000000-0000-4000-8000-000000001011',
      '10000000-0000-4000-8000-000000001012',
      120
    )
  ),
  'claimed',
  'the exact authenticated owner can reserve without exposing the raw claim'
);
reset role;

delete from auth.sessions
where id = '20000000-0000-4000-8000-000000001011';
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000001011',
    'role', 'authenticated',
    'session_id', '20000000-0000-4000-8000-000000001011'
  )::text,
  true
);
set local role authenticated;
select extensions.throws_ok(
  $test$
    select *
    from public.kc_create_help_request_with_notification_claim(
      jsonb_build_object(
        'type', 'external_access',
        'topic', 'non_institutional_email',
        'subject', 'Sessao revogada',
        'message', 'Esta criacao deve falhar porque a sessao foi revogada.',
        'contact_email', 'help-claim-owner@example.test'
      )
    )
  $test$,
  '42501',
  'AUTH_SESSION_NOT_ACTIVE',
  'revoked authenticated session cannot create a claimed request'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

select * from extensions.finish();
rollback;

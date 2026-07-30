begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

select extensions.has_function(
  'public',
  'kc_create_privacy_help_guest_v1',
  array['jsonb'],
  'EXPAND installs the service-only guest privacy bridge'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.kc_create_privacy_help_guest_v1(jsonb)',
    'execute'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'public.kc_create_privacy_help_guest_v1(jsonb)',
    'execute'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.kc_create_privacy_help_guest_v1(jsonb)',
    'execute'
  ),
  'EXPAND bridge is executable only by service_role'
);

select extensions.ok(
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
  ),
  'direct create ACL matches the declared EXPAND or CONTRACT phase'
);

select extensions.ok(
  (
    select
      procedure_row.prosecdef
      and procedure_row.proconfig @> array['search_path=""']
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid =
      'public.kc_create_privacy_help_guest_v1(jsonb)'::regprocedure
  ),
  'EXPAND bridge is SECURITY DEFINER with an empty search_path'
);

create temporary table privacy_help_guest_gateway_fixture (
  response jsonb not null
) on commit drop;
grant select, insert on table
  pg_temp.privacy_help_guest_gateway_fixture
  to service_role;

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
set local role service_role;

insert into pg_temp.privacy_help_guest_gateway_fixture (response)
select pg_catalog.to_jsonb(result)
from public.kc_create_privacy_help_guest_v1(
  pg_catalog.jsonb_build_object(
    -- Malicious identity expectations must be ignored by the bridge.
    'expected_auth_state', 'authenticated',
    'expected_user_id',
      '9c000000-0000-4000-8000-000000000001',
    'idempotency_key', '  ' || repeat('D', 64) || '  ',
    'type', 'account_access',
    'topic', 'onboarding_settings',
    'subtopic', 'account_data_copy',
    'subject', 'Copia guest protegida',
    'message',
      'Pedido guest criado apenas depois da validacao Edge do Turnstile.',
    'priority', 'normal',
    'page_path', '/ajuda.html',
    'contact_email', 'privacy-turnstile-guest@example.test',
    'allow_contact', true,
    'metadata', pg_catalog.jsonb_build_object(
      'request_kind', 'data_access_copy',
      'account_email', 'privacy-turnstile-guest@example.test',
      'source', 'help_form',
      'data_scope', 'all_account_data',
      'data_copy_format', 'structured'
    )
  )
) result;

reset role;
select pg_catalog.set_config('request.jwt.claims', '{}', true);

select extensions.ok(
  (
    select
      fixture_row.response ->> 'out_id' is not null
      and fixture_row.response -> 'out_notification_claim' = 'null'::jsonb
      and fixture_row.response
        -> 'out_notification_claim_expires_at' = 'null'::jsonb
      and fixture_row.response
        -> 'out_data_subject_request' = 'null'::jsonb
      and fixture_row.response -> 'out_protocol' = 'null'::jsonb
      and fixture_row.response
        ->> 'out_idempotency_replayed' = 'false'
    from pg_temp.privacy_help_guest_gateway_fixture fixture_row
  ),
  'service bridge returns only the unowned guest Help receipt'
);

select extensions.ok(
  (
    select
      help_row.user_id is null
      and entry_row.auth_state = 'anonymous'
      and entry_row.caller_user_id is null
      and entry_row.data_subject_request_id is null
      and entry_row.response_protocol is null
    from public.help_requests help_row
    join kc_private.help_privacy_submission_idempotency entry_row
      on entry_row.help_request_id = help_row.id
    where help_row.contact_email =
      'privacy-turnstile-guest@example.test'
  ),
  'malicious account expectations cannot turn a guest bridge call into ownership'
);

select extensions.is(
  (
    select pg_catalog.count(*)::integer
    from public.help_requests help_row
    where help_row.contact_email =
      'privacy-turnstile-guest@example.test'
  ),
  1,
  'EXPAND bridge creates exactly one Help row'
);

select * from extensions.finish();
rollback;

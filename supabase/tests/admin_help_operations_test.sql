begin;

create extension if not exists pgtap with schema extensions;

select extensions.no_plan();

select extensions.has_function(
  'public',
  'kc_admin_help_queue_summary',
  array[]::text[],
  'PII-free admin help queue summary exists'
);
select extensions.has_function(
  'public',
  'kc_admin_list_help_requests_v2',
  array['text', 'text', 'text', 'text', 'integer', 'integer'],
  'admin help queue v2 projection exists'
);
select extensions.has_function(
  'public',
  'kc_admin_triage_help_request',
  array['uuid', 'text', 'text', 'timestamp with time zone'],
  'audited admin help triage RPC exists'
);
select extensions.ok(
  not has_function_privilege(
    'anon',
    'public.kc_admin_help_queue_summary()',
    'execute'
  ),
  'anonymous clients cannot read administrative help counters'
);
select extensions.ok(
  not has_function_privilege(
    'anon',
    'public.kc_admin_list_help_requests_v2(text,text,text,text,integer,integer)',
    'execute'
  ),
  'anonymous clients cannot list the administrative help queue'
);
select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.kc_admin_list_help_requests_v2(text,text,text,text,integer,integer)',
    'execute'
  ),
  'authenticated admins can enter the guarded help queue RPC'
);
select extensions.ok(
  not has_function_privilege(
    'anon',
    'public.kc_admin_triage_help_request(uuid,text,text,timestamp with time zone)',
    'execute'
  ),
  'anonymous clients cannot mutate help triage'
);

insert into auth.users (id, email)
values (
  '00000000-0000-4000-8000-000000000981',
  'help-operations-admin@example.test'
);

insert into public.profiles (id, email, full_name, is_admin)
values (
  '00000000-0000-4000-8000-000000000981',
  'help-operations-admin@example.test',
  'Help Operations Admin',
  true
);

insert into auth.sessions (id, user_id)
values (
  '10000000-0000-4000-8000-000000000981',
  '00000000-0000-4000-8000-000000000981'
);

insert into public.help_requests (
  id,
  type,
  topic,
  subject,
  message,
  priority,
  status,
  contact_email,
  metadata,
  admin_status,
  created_at
)
values
  (
    '11000000-0000-4000-8000-000000000981',
    'platform_issue',
    'bugs_crashes',
    'Falha de navegacao administrativa',
    'A pagina administrativa nao conclui a navegacao esperada.',
    'high',
    'new',
    'help-operations-requester@example.test',
    '{}'::jsonb,
    'na',
    now() - interval '2 days'
  ),
  (
    '12000000-0000-4000-8000-000000000981',
    'external_access',
    'non_institutional_email',
    'Acesso externo aguardando decisao',
    'Solicitacao valida ainda aguardando decisao administrativa.',
    'normal',
    'new',
    'help-operations-pending@example.test',
    '{"request_kind":"external_access"}'::jsonb,
    'pending',
    now() - interval '3 days'
  ),
  (
    '13000000-0000-4000-8000-000000000981',
    'external_access',
    'non_institutional_email',
    'Acesso externo com entrega em curso',
    'Solicitacao aprovada com entrega protegida por compare-and-swap.',
    'normal',
    'new',
    'help-operations-approved@example.test',
    '{"request_kind":"external_access","invite_email":{"status":"processing","claim_id":"23000000-0000-4000-8000-000000000981"}}'::jsonb,
    'approved',
    now() - interval '2 days'
  );

create temporary table help_operations_fixture (
  help_request_id uuid primary key,
  initial_updated_at timestamptz not null
) on commit drop;
grant select on table pg_temp.help_operations_fixture to authenticated, service_role;

insert into pg_temp.help_operations_fixture (help_request_id, initial_updated_at)
select id, updated_at
from public.help_requests
where id = '11000000-0000-4000-8000-000000000981';

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000981","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000981"}',
  true
);
set local role authenticated;

select extensions.is(
  (
    select count(*)::integer
    from public.kc_admin_list_help_requests_v2(
      null,
      'platform_issue',
      'high',
      'navegacao',
      25,
      0
    )
  ),
  1,
  'v2 projection applies type, priority, and text filters on the server'
);

select extensions.is(
  (
    select waiting_over_24h_count::integer
    from public.kc_admin_help_queue_summary()
  ),
  3,
  'summary RPC returns global counters without a ticket row'
);

select extensions.is(
  (
    select waiting_over_24h_count::integer
    from public.kc_admin_list_help_requests_v2(
      null,
      'platform_issue',
      'high',
      'navegacao',
      25,
      0
    )
    limit 1
  ),
  3,
  'operational counters remain global while the visible queue is filtered'
);

select extensions.is(
  (
    select waiting_over_24h_count::integer
    from public.kc_admin_list_help_requests_v2(null, null, null, null, 25, 0)
    limit 1
  ),
  3,
  'v2 projection reports the complete filtered waiting-over-24h count'
);

select extensions.is(
  (
    select external_pending_count::integer
    from public.kc_admin_list_help_requests_v2(null, null, null, null, 25, 0)
    limit 1
  ),
  1,
  'v2 projection distinguishes pending external-access decisions'
);

select extensions.is(
  (
    select result.out_status
    from public.kc_admin_triage_help_request(
      '11000000-0000-4000-8000-000000000981',
      'in_progress',
      'urgent',
      (
        select initial_updated_at
        from pg_temp.help_operations_fixture
        where help_request_id = '11000000-0000-4000-8000-000000000981'
      )
    ) result
  ),
  'in_progress',
  'admin triage updates the help request through the guarded RPC'
);

select extensions.is(
  (
    select result.out_admin_status
    from public.kc_admin_claim_external_access_delivery(
      '12000000-0000-4000-8000-000000000981',
      'approved',
      'Validated in pgTAP',
      '22000000-0000-4000-8000-000000000981'
    ) result
  ),
  'approved',
  'an external-access decision atomically claims its delivery'
);

reset role;

select extensions.is(
  (
    select status
    from public.help_requests
    where id = '12000000-0000-4000-8000-000000000981'
  ),
  'in_progress',
  'a claimed external-access delivery cannot remain mislabeled as new'
);

select extensions.ok(
  exists (
    select 1
    from public.audit_log event_row
    where event_row.entity_id = '11000000-0000-4000-8000-000000000981'
      and event_row.action = 'help_request_triaged'
      and event_row.payload->>'previous_status' = 'new'
      and event_row.payload->>'next_status' = 'in_progress'
      and event_row.payload->>'previous_priority' = 'high'
      and event_row.payload->>'next_priority' = 'urgent'
  ),
  'triage writes a non-PII append-only audit event with the real before/after state'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000981","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000981"}',
  true
);
set local role authenticated;

select extensions.throws_ok(
  $test$
    select *
    from public.kc_admin_triage_help_request(
      '11000000-0000-4000-8000-000000000981',
      'resolved',
      'urgent',
      (
        select initial_updated_at - interval '1 second'
        from pg_temp.help_operations_fixture
        where help_request_id = '11000000-0000-4000-8000-000000000981'
      )
    )
  $test$,
  '40001',
  'HELP_REQUEST_STALE',
  'stale admin tabs cannot overwrite newer triage'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000981","role":"service_role"}',
  true
);
set local role service_role;

select extensions.ok(
  public.kc_complete_external_access_delivery(
    '13000000-0000-4000-8000-000000000981',
    'approved',
    '23000000-0000-4000-8000-000000000981',
    '{"status":"sent","provider":"test"}'::jsonb
  ),
  'claimed external-access delivery can complete once'
);

reset role;

select extensions.is(
  (
    select status
    from public.help_requests
    where id = '13000000-0000-4000-8000-000000000981'
  ),
  'resolved',
  'a confirmed external-access e-mail resolves the generic help queue item'
);

select extensions.ok(
  exists (
    select 1
    from public.audit_log event_row
    where event_row.entity_id = '13000000-0000-4000-8000-000000000981'
      and event_row.action = 'external_access_help_status_reconciled'
      and event_row.payload->>'source' = 'delivery_completion'
      and event_row.payload->>'next_status' = 'resolved'
  ),
  'delivery reconciliation is recorded without contact data'
);

select * from extensions.finish();

rollback;

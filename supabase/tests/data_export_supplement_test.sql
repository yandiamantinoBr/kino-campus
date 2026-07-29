begin;

create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

select extensions.has_index(
  'public',
  'data_subject_requests',
  'data_subject_requests_one_open_erasure_per_user_uidx',
  'one-open-erasure uniqueness is enforced in the database'
);
select extensions.has_table(
  'kc_private',
  'data_export_artifacts',
  'supplement artifact metadata is private'
);
select extensions.has_table(
  'kc_private',
  'data_export_processor_tasks',
  'processor evidence matrix is private'
);
select extensions.has_column(
  'kc_private',
  'data_export_artifacts',
  'download_return_status',
  'download reservations persist the state they must restore'
);
select extensions.has_column(
  'kc_private',
  'data_export_artifacts',
  'delivery_count',
  'successful supplement deliveries are counted'
);
select extensions.has_column(
  'kc_private',
  'data_export_processor_tasks',
  'delivery_attested',
  'external processor delivery requires an explicit attestation'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.kc_record_data_export_processor_evidence(text,bigint,uuid,uuid,text,text,text,boolean,text,timestamptz)',
    'execute'
  )
    and not has_function_privilege(
      'authenticated',
      'public.kc_record_data_export_processor_evidence(text,bigint,uuid,uuid,text,text,text,boolean,text,timestamptz)',
      'execute'
    ),
  'only service role can call the explicit out-of-band attestation overload'
);
select extensions.ok(
  (
    select prosrc like '%not_after%'
      and prosrc like '%clock_timestamp%'
      and prosrc like '%for share%'
      and prosrc not like '%for key share%'
    from pg_proc
    where oid =
      'kc_private.kc_assert_active_data_export_owner_session(uuid,uuid)'::regprocedure
  ),
  'owner delivery mutations lock only a non-expired exact session with FOR SHARE'
);
select extensions.has_table(
  'kc_private',
  'data_export_media_refs',
  'supplement media paths are held in a private opaque-ref map'
);
select extensions.has_table(
  'kc_private',
  'data_export_ticket_identity_links',
  'verified anonymous ticket links have a private audit record'
);
select extensions.ok(
  not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_attribute attribute_row
      on attribute_row.attrelid = constraint_row.conrelid
     and attribute_row.attnum = any(constraint_row.conkey)
    where constraint_row.conrelid =
      'kc_private.data_export_ticket_identity_links'::regclass
      and constraint_row.contype = 'u'
      and attribute_row.attname = 'request_id'
  ),
  'multiple verified Helps may reference the same canonical export request'
);
select extensions.has_table(
  'kc_private',
  'data_export_retention_runs',
  'retention worker executions have a private durable run log'
);
select extensions.has_table(
  'kc_private',
  'data_export_retention_alerts',
  'retention failures have a private durable alert log'
);
select extensions.is(
  (
    select public
    from storage.buckets
    where id = 'kino-data-exports'
  ),
  false,
  'supplement bucket is private'
);
select extensions.is(
  (
    select file_size_limit
    from storage.buckets
    where id = 'kino-data-exports'
  ),
  16777216::bigint,
  'supplement bucket enforces the Edge-safe 16 MiB ceiling'
);
select extensions.is(
  (
    select allowed_mime_types
    from storage.buckets
    where id = 'kino-data-exports'
  ),
  array['application/json']::text[],
  'supplement bucket accepts JSON only'
);
select extensions.is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'storage_data_exports_owner_%'
  ),
  0,
  'browser roles have no direct artifact object policy'
);
select extensions.ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'storage_data_exports_deny_browser_access'
      and permissive = 'RESTRICTIVE'
  ),
  'a restrictive Storage policy denies browser access to export objects'
);
select extensions.ok(
  not has_table_privilege(
    'authenticated',
    'kc_private.data_export_artifacts',
    'select,insert,update,delete'
  ),
  'authenticated cannot inspect private artifact metadata'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.kc_claim_data_export_artifact(text,bigint,uuid,integer)',
    'execute'
  ),
  'browser cannot claim an artifact'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.kc_claim_data_export_artifact(text,bigint,uuid,uuid,integer)',
    'execute'
  )
    and has_function_privilege(
      'service_role',
      'public.kc_claim_data_export_artifact(text,bigint,uuid,integer)',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'public.kc_claim_data_export_artifact(text,bigint,uuid,integer)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'public.kc_claim_data_export_artifact(text,bigint,uuid,integer)',
      'execute'
    )
    and obj_description(
      'public.kc_claim_data_export_artifact(text,bigint,uuid,integer)'::regprocedure,
      'pg_proc'
    ) like 'CONTRACT DEFERRED:%'
    and pg_get_functiondef(
      'public.kc_claim_data_export_artifact(text,bigint,uuid,integer)'::regprocedure
    ) like '%kc_resolve_legacy_data_export_admin_session%',
  'session-bound claim expands alongside one guarded legacy Edge signature'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.kc_begin_data_export_retention_run(text,integer,uuid,timestamptz)',
    'execute'
  )
    and has_function_privilege(
      'service_role',
      'public.kc_begin_data_export_retention_run(text,integer,uuid,timestamptz)',
      'execute'
  ),
  'only service role can create a retention worker run'
);
select extensions.is(
  kc_private.kc_data_export_retention_vault_acl_safe(),
  (
    select not exists (
      select 1
      from (
        values
          ('anon'::name),
          ('authenticated'::name)
      ) role_row(role_name)
      where has_schema_privilege(role_row.role_name, 'vault', 'usage')
        or has_table_privilege(
          role_row.role_name,
          'vault.decrypted_secrets',
          'select'
        )
        or has_any_column_privilege(
          role_row.role_name,
          'vault.decrypted_secrets',
          'select'
        )
    )
  ),
  'the retention ACL probe covers browser access to decrypted Vault values'
);
select extensions.ok(
  case
    when kc_private.kc_data_export_retention_vault_acl_safe() then true
    else
      kc_private.kc_trigger_data_export_retention(1, 'test') is null
      and exists (
        select 1
        from kc_private.data_export_retention_schedule_state state_row
        where state_row.singleton
          and state_row.operational_alert =
            'EXPORT_RETENTION_VAULT_ACL_UNSAFE'
      )
      and exists (
        select 1
        from kc_private.data_export_retention_alerts alert_row
        where alert_row.code = 'EXPORT_RETENTION_SCHEDULE_UNHEALTHY'
          and alert_row.active
      )
  end,
  'unsafe browser Vault ACLs prevent dispatch and open a durable alert'
);
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
select public.kc_begin_data_export_retention_run(
  'test',
  1,
  '31000000-0000-4000-8000-000000000001',
  now()
);
select public.kc_begin_data_export_retention_run(
  'test',
  1,
  '31000000-0000-4000-8000-000000000001',
  now()
);
select extensions.is(
  (
    select count(*)::integer
    from kc_private.data_export_retention_runs run_row
    where run_row.request_nonce =
      '31000000-0000-4000-8000-000000000001'
  ),
  1,
  'a signed-request nonce is processed at most once'
);
select set_config('request.jwt.claims', '{}', true);
select kc_private.kc_set_data_export_retention_alert(
  'EXPORT_RETENTION_TEST_ALERT',
  true,
  null,
  '{"test_only":true}'::jsonb
);
select extensions.ok(
  exists (
    select 1
    from public.audit_log audit_row
    where audit_row.action = 'data_export_retention_alert_opened'
      and audit_row.entity_type = 'data_export_retention'
      and audit_row.entity_id = md5(
        'kc:data-export-retention-alert:EXPORT_RETENTION_TEST_ALERT'
      )::uuid
      and audit_row.entity_id is not null
  ),
  'retention alerts use a stable non-PII audit entity identifier'
);
select kc_private.kc_set_data_export_retention_alert(
  'EXPORT_RETENTION_TEST_ALERT',
  false,
  null,
  '{"test_only":true}'::jsonb
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.kc_read_data_export_media_refs_for_download(text,bigint,uuid,uuid,text)',
    'execute'
  ),
  'browser roles cannot resolve private supplement media refs'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.kc_authorize_data_export_artifact_upload(text,bigint,text,integer)',
    'execute'
  ),
  'browser roles cannot authorize an artifact upload'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.kc_link_verified_help_request_to_data_export(uuid,text,text,uuid,uuid,text,text,timestamptz,jsonb)',
    'execute'
  ),
  'browser roles cannot link a help ticket to an account'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.kc_link_verified_help_request_to_data_export(uuid,text,text,uuid,uuid,text,text,timestamptz,jsonb)',
    'execute'
  )
    and has_function_privilege(
      'service_role',
      'public.kc_link_verified_help_request_to_data_export(uuid,text,text,uuid,text,text,timestamptz,jsonb)',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'public.kc_link_verified_help_request_to_data_export(uuid,text,text,uuid,text,text,timestamptz,jsonb)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'public.kc_link_verified_help_request_to_data_export(uuid,text,text,uuid,text,text,timestamptz,jsonb)',
      'execute'
    )
    and obj_description(
      'public.kc_link_verified_help_request_to_data_export(uuid,text,text,uuid,text,text,timestamptz,jsonb)'::regprocedure,
      'pg_proc'
    ) like 'CONTRACT DEFERRED:%'
    and pg_get_functiondef(
      'public.kc_link_verified_help_request_to_data_export(uuid,text,text,uuid,text,text,timestamptz,jsonb)'::regprocedure
    ) like '%kc_resolve_legacy_data_export_admin_session%',
  'verified ticket link expands session binding without breaking prior Edge'
);
select extensions.ok(
  (
    select prosrc like '%pg_advisory_xact_lock%'
      and prosrc like '%kc_privacy_subject:%'
    from pg_proc
    where oid = 'kc_private.kc_lock_privacy_subject(uuid)'::regprocedure
  ),
  'privacy workflows share one transaction-level subject lock contract'
);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000761', 'supplement-owner@example.test'),
  ('00000000-0000-4000-8000-000000000762', 'supplement-other@example.test'),
  ('00000000-0000-4000-8000-000000000763', 'supplement-admin@example.test'),
  ('00000000-0000-4000-8000-000000000764', 'form-owner@example.test'),
  ('00000000-0000-4000-8000-000000000765', 'verified-ticket@example.test');

insert into public.profiles (id, email, full_name, is_admin)
values
  ('00000000-0000-4000-8000-000000000761', 'supplement-owner@example.test', 'Supplement Owner', false),
  ('00000000-0000-4000-8000-000000000762', 'supplement-other@example.test', 'Supplement Other', false),
  ('00000000-0000-4000-8000-000000000763', 'supplement-admin@example.test', 'Supplement Admin', true),
  ('00000000-0000-4000-8000-000000000764', 'form-owner@example.test', 'Form Owner', false),
  ('00000000-0000-4000-8000-000000000765', 'verified-ticket@example.test', 'Verified Ticket Owner', false);

insert into auth.sessions (id, user_id)
values
  ('10000000-0000-4000-8000-000000000761', '00000000-0000-4000-8000-000000000761'),
  ('10000000-0000-4000-8000-000000000762', '00000000-0000-4000-8000-000000000762'),
  ('10000000-0000-4000-8000-000000000763', '00000000-0000-4000-8000-000000000763'),
  ('10000000-0000-4000-8000-000000000764', '00000000-0000-4000-8000-000000000764'),
  ('10000000-0000-4000-8000-000000000765', '00000000-0000-4000-8000-000000000765');
insert into auth.sessions (id, user_id, not_after)
values (
  '10000000-0000-4000-8000-000000000766',
  '00000000-0000-4000-8000-000000000761',
  clock_timestamp() - interval '1 hour'
);

create temporary table kc_supplement_test_state (
  key text primary key,
  value jsonb not null
) on commit drop;
grant select, insert, update, delete on kc_supplement_test_state to anon, authenticated, service_role;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000761","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000761"}',
  true
);
set local role authenticated;

insert into kc_supplement_test_state (key, value)
select 'erasure_first', public.kc_create_data_subject_request_v2(
  'account_erasure',
  'supplement_erasure_key_0001',
  'json',
  'settings'
);
insert into kc_supplement_test_state (key, value)
select 'erasure_replay', public.kc_create_data_subject_request_v2(
  'account_erasure',
  'supplement_erasure_key_0002',
  'json',
  'settings'
);

select extensions.is(
  (select value ->> 'reused_existing' from kc_supplement_test_state where key = 'erasure_replay'),
  'true',
  'a second open erasure request reuses the canonical protocol'
);
select extensions.is(
  (
    select count(*)::integer
    from public.data_subject_requests
    where request_kind = 'account_erasure'
  ),
  1,
  'replay does not create a duplicate erasure row'
);
select extensions.is(
  (
    select value #>> '{request,protocol}'
    from kc_supplement_test_state
    where key = 'erasure_first'
  ),
  (
    select value #>> '{request,protocol}'
    from kc_supplement_test_state
    where key = 'erasure_replay'
  ),
  'replay returns the same erasure protocol'
);

reset role;
select extensions.throws_ok(
  $$insert into public.data_subject_requests (
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
    'KC-DSR-20260728-ABCDEF0123456789',
    '00000000-0000-4000-8000-000000000761',
    repeat('b', 64),
    'account_erasure',
    'received',
    'supplement_parallel_bypass_0001',
    'json',
    'api',
    '[]'::jsonb
  )$$,
  '23505',
  'duplicate key value violates unique constraint "data_subject_requests_one_open_erasure_per_user_uidx"',
  'the partial unique index rejects a concurrent bypass insert'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000761","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000761"}',
  true
);
set local role authenticated;

select public.kc_cancel_data_subject_request(
  (select value #>> '{request,protocol}' from kc_supplement_test_state where key = 'erasure_first')
);
insert into kc_supplement_test_state (key, value)
select 'erasure_active', public.kc_create_data_subject_request_v2(
  'account_erasure',
  'supplement_erasure_key_0003',
  'json',
  'settings'
);
select extensions.is(
  (
    select count(*)::integer
    from public.data_subject_requests
    where request_kind = 'account_erasure'
      and status in (
        'received',
        'processing',
        'ready',
        'pending_confirmation',
        'failed',
        'partial_failure'
      )
  ),
  1,
  'a terminal erasure releases exactly one new open request'
);

insert into kc_supplement_test_state (key, value)
select 'copy', public.kc_create_data_subject_request_v2(
  'data_access_copy',
  'supplement_copy_key_0001',
  'json',
  'settings'
);
insert into kc_supplement_test_state (key, value)
select 'revocation_copy', public.kc_create_data_subject_request_v2(
  'data_portability',
  'supplement_revocation_key_0001',
  'json',
  'settings'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;

select public.kc_transition_data_subject_request(
  ((select value #>> '{request,id}' from kc_supplement_test_state where key = 'copy'))::uuid,
  'received',
  'ready',
  null,
  'status_changed',
  'Exportacao pronta para teste seguro.'
);
select public.kc_transition_data_subject_request(
  ((select value #>> '{request,id}' from kc_supplement_test_state where key = 'revocation_copy'))::uuid,
  'received',
  'ready',
  null,
  'status_changed',
  'Portabilidade pronta para teste de revogacao.'
);
select extensions.throws_ok(
  $$select public.kc_enqueue_data_export_artifact(
    ((select value #>> '{request,id}' from kc_supplement_test_state where key = 'copy'))::uuid,
    '00000000-0000-4000-8000-000000000761',
    '[{"processor":"supabase_db_auth_storage","treatment":"automated_core_subject_workflow","status":"automated"}]'::jsonb
  )$$,
  '23514',
  'EXPORT_SUBJECT_NOT_ELIGIBLE',
  'an open erasure request blocks supplement enqueue for the same subject'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000761","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000761"}',
  true
);
set local role authenticated;
select public.kc_cancel_data_subject_request(
  (select value #>> '{request,protocol}' from kc_supplement_test_state where key = 'erasure_active')
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;

insert into kc_supplement_test_state (key, value)
select 'artifact', public.kc_enqueue_data_export_artifact(
  ((select value #>> '{request,id}' from kc_supplement_test_state where key = 'copy'))::uuid,
  '00000000-0000-4000-8000-000000000761',
  '[{"processor":"supabase_db_auth_storage","treatment":"automated_core_subject_workflow","status":"automated"},{"processor":"manual_operator","treatment":"subject_data_review","status":"manual_follow_up"}]'::jsonb
);

select extensions.throws_ok(
  $$update public.help_requests
    set status = 'archived'
    where id = (
      select help_request_id
      from public.data_subject_requests
      where id = (
        (
          select value #>> '{request,id}'
          from kc_supplement_test_state
          where key = 'copy'
        )
      )::uuid
    )$$,
  '23514',
  'DSR_HELP_MUST_REMAIN_OPEN',
  'generic help triage cannot close an unresolved supplement'
);

select extensions.throws_ok(
  $$select public.kc_claim_data_export_artifact(
    (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
    1,
    '00000000-0000-4000-8000-000000000763',
    '10000000-0000-4000-8000-000000000763',
    900
  )$$,
  '23514',
  'EXPORT_PROCESSORS_PENDING',
  'a manual processor blocks artifact claim and automatic completion'
);

select extensions.throws_ok(
  $$select public.kc_record_data_export_processor_evidence(
    (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
    1,
    '00000000-0000-4000-8000-000000000763',
    '10000000-0000-4000-8000-000000000763',
    'manual_operator',
    'supplied',
    'SUPPORT-TICKET-LEGACY-0001'
  )$$,
  '23514',
  'EXPORT_PROCESSOR_OUT_OF_BAND_ATTESTATION_REQUIRED',
  'legacy supplied cannot imply that processor content was included'
);

select public.kc_record_data_export_processor_evidence(
  (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
  1,
  '00000000-0000-4000-8000-000000000763',
  '10000000-0000-4000-8000-000000000763',
  'manual_operator',
  'supplied_out_of_band',
  'SUPPORT-TICKET-TEST-0001',
  true,
  'secure_file_transfer',
  clock_timestamp()
);
reset role;
select extensions.ok(
  (
    select task_row.status = 'sanitized_disclosure'
      and task_row.evidence_hash ~ '^[a-f0-9]{64}$'
      and task_row.evidence_hash = encode(
        extensions.digest(
          convert_to(
            'kc:data-export-processor-evidence:v2|'
              || artifact_row.artifact_ref
              || '|manual_operator|SUPPORT-TICKET-TEST-0001',
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
      and task_row.resolved_at is not null
      and task_row.delivery_attested is true
      and task_row.delivery_channel = 'secure_file_transfer'
      and task_row.delivered_out_of_band_at is not null
    from kc_private.data_export_processor_tasks task_row
    join kc_private.data_export_artifacts artifact_row
      on artifact_row.id = task_row.artifact_id
    where artifact_row.artifact_ref = (
      select value ->> 'artifact_ref'
      from kc_supplement_test_state
      where key = 'artifact'
    )
      and task_row.processor = 'manual_operator'
  ),
  'operator evidence becomes an attested external disclosure without persisted content'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;
insert into kc_supplement_test_state (key, value)
select 'claim', public.kc_claim_data_export_artifact(
  (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
  2,
  '00000000-0000-4000-8000-000000000763',
  '10000000-0000-4000-8000-000000000763',
  900
);

select extensions.ok(
  (
    select (processor.value ->> 'content_in_export')::boolean is false
      and processor.value ->> 'delivery_mode' = 'out_of_band'
      and processor.value ->> 'delivery_channel' = 'secure_file_transfer'
      and processor.value ->> 'delivered_at' is not null
      and not (
        processor.value ?| array[
          'bundle',
          'external_bundle',
          'processor_data',
          'processor_payload',
          'records',
          'content'
        ]
      )
      and state_row.value::text not like '%SUPPORT-TICKET-TEST-0001%'
    from kc_supplement_test_state state_row
    cross join lateral jsonb_array_elements(
      state_row.value -> 'processors'
    ) processor(value)
    where state_row.key = 'claim'
      and processor.value ->> 'processor' = 'manual_operator'
  ),
  'owner-safe artifact projection exposes only out-of-band attestation metadata'
);

select extensions.throws_ok(
  $$select public.kc_claim_data_export_artifact(
    (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
    2,
    '00000000-0000-4000-8000-000000000763',
    '10000000-0000-4000-8000-000000000763',
    900
  )$$,
  '40001',
  'EXPORT_ARTIFACT_VERSION_CONFLICT',
  'claim replay with a stale CAS version is rejected'
);

select extensions.throws_ok(
  $$select public.kc_store_data_export_media_refs(
    'KEA-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    1,
    repeat('a', 64),
    (
      select jsonb_agg(jsonb_build_object(
        'media_ref',
        'KEM-' || lpad(to_hex(item), 32, '0'),
        'object_path',
        'unused'
      ))
      from generate_series(1, 101) item
    )
  )$$,
  '22023',
  'EXPORT_MEDIA_SIGNING_LIMIT_EXCEEDED',
  'media signing cap fails before claim continuation or Storage work'
);

select extensions.throws_ok(
  $$select public.kc_store_data_export_media_refs(
    (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
    ((select value ->> 'version' from kc_supplement_test_state where key = 'claim'))::bigint,
    (select value ->> 'claim_token' from kc_supplement_test_state where key = 'claim'),
    '[{"media_ref":"KEM-0123456789ABCDEF0123456789ABCDEF","object_path":"chat-media/00000000-0000-4000-8000-000000000999/00000000-0000-4000-8000-000000000762/file.jpg"}]'::jsonb
  )$$,
  '22023',
  'EXPORT_MEDIA_REF_INVALID',
  'a supplement cannot map an attachment path owned by another account'
);
select extensions.lives_ok(
  $$select public.kc_store_data_export_media_refs(
    (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
    ((select value ->> 'version' from kc_supplement_test_state where key = 'claim'))::bigint,
    (select value ->> 'claim_token' from kc_supplement_test_state where key = 'claim'),
    '[]'::jsonb
  )$$,
  'a claim can atomically record an empty safe media-ref set'
);

reset role;
insert into storage.objects (bucket_id, name, owner_id)
select
  artifact_row.bucket_id,
  artifact_row.object_path,
  artifact_row.owner_user_id::text
from kc_private.data_export_artifacts artifact_row
where artifact_row.artifact_ref = (
  select value ->> 'artifact_ref'
  from kc_supplement_test_state
  where key = 'artifact'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;
select extensions.throws_ok(
  $$select public.kc_finalize_data_export_artifact(
    (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
    ((select value ->> 'version' from kc_supplement_test_state where key = 'claim'))::bigint,
    (select value ->> 'claim_token' from kc_supplement_test_state where key = 'claim'),
    repeat('a', 64),
    1,
    '{"schema_version":1,"category_count":1,"category_counts":{"profile":1},"processor_outcomes":[],"media_ref_count":0,"signed_urls_embedded":false,"completeness":"complete"}'::jsonb,
    3600
  )$$,
  '23514',
  'EXPORT_PROCESSOR_OUTCOMES_INVALID',
  'finalize rejects a global complete claim without every processor disclosure'
);

insert into kc_supplement_test_state (key, value)
select 'finalized', public.kc_finalize_data_export_artifact(
  (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
  ((select value ->> 'version' from kc_supplement_test_state where key = 'claim'))::bigint,
  (select value ->> 'claim_token' from kc_supplement_test_state where key = 'claim'),
  repeat('a', 64),
  1,
  jsonb_build_object(
    'schema_version', 1,
    'category_count', 1,
    'category_counts', '{"profile":1}'::jsonb,
    'processor_outcomes', (
      select jsonb_agg(
        jsonb_build_object(
          'processor', task_row ->> 'processor',
          'treatment', task_row ->> 'treatment',
          'outcome', case task_row ->> 'status'
            when 'automated' then 'included_in_core_export'
            when 'sanitized_disclosure' then 'sanitized_disclosure'
            when 'no_account_data' then 'no_account_data'
            when 'not_configured' then 'not_configured'
            when 'not_account_linked' then 'not_account_linked'
          end,
          'evidence_sha256', task_row ->> 'evidence_sha256',
          'resolved_at', task_row ->> 'resolved_at'
        )
        order by task_row ->> 'processor'
      )
      from jsonb_array_elements(
        (
          select value -> 'processors'
          from kc_supplement_test_state
          where key = 'claim'
        )
      ) task_row
    ),
    'media_ref_count', 0,
    'signed_urls_embedded', false,
    'completeness', 'complete'
  ),
  3600
);
select extensions.ok(
  (
    select value ->> 'status' = 'ready'
      and (value ->> 'expires_at')::timestamptz > now() + interval '55 minutes'
      and value #>> '{manifest,signed_urls_embedded}' = 'false'
      and jsonb_array_length(value #> '{manifest,processor_outcomes}') = 2
    from kc_supplement_test_state
    where key = 'finalized'
  ),
  'finalize stores a usable window and the exact sanitized processor outcomes'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000761","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000761"}',
  true
);
set local role authenticated;
insert into kc_supplement_test_state (key, value)
select 'delivery_blocking_erasure', public.kc_create_data_subject_request_v2(
  'account_erasure',
  'supplement_delivery_erasure_0001',
  'json',
  'settings'
);
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;
select extensions.throws_ok(
  $$select public.kc_reserve_data_export_artifact_download(
    (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
    4,
    '00000000-0000-4000-8000-000000000761',
    '10000000-0000-4000-8000-000000000761',
    120
  )$$,
  '23514',
  'EXPORT_SUBJECT_NOT_ELIGIBLE',
  'an active account erasure blocks the initial supplement delivery'
);
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000761","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000761"}',
  true
);
set local role authenticated;
select public.kc_cancel_data_subject_request(
  (
    select value #>> '{request,protocol}'
    from kc_supplement_test_state
    where key = 'delivery_blocking_erasure'
  )
);
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;

select extensions.throws_ok(
  $$select public.kc_reserve_data_export_artifact_download(
    (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
    4,
    '00000000-0000-4000-8000-000000000761',
    '10000000-0000-4000-8000-000000000766',
    120
  )$$,
  '42501',
  'SESSION_NOT_ACTIVE',
  'an existing but expired auth.sessions row cannot reserve a download'
);

select extensions.throws_ok(
  $$select public.kc_reserve_data_export_artifact_download(
    (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
    4,
    '00000000-0000-4000-8000-000000000762',
    '10000000-0000-4000-8000-000000000762',
    120
  )$$,
  'P0002',
  'EXPORT_ARTIFACT_NOT_FOUND',
  'another user cannot reserve the owner artifact'
);

reset role;
update kc_private.data_export_artifacts artifact_row
set expires_at = now() - interval '1 second'
where artifact_row.artifact_ref = (
  select value ->> 'artifact_ref'
  from kc_supplement_test_state
  where key = 'artifact'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;
select extensions.throws_ok(
  $$select public.kc_reserve_data_export_artifact_download(
    (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
    4,
    '00000000-0000-4000-8000-000000000761',
    '10000000-0000-4000-8000-000000000761',
    120
  )$$,
  '23514',
  'EXPORT_ARTIFACT_NOT_READY',
  'an expired artifact cannot be reserved'
);
insert into kc_supplement_test_state (key, value)
select 'recovered', public.kc_recover_expired_data_export_artifact(
  (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
  4,
  '00000000-0000-4000-8000-000000000763',
  '10000000-0000-4000-8000-000000000763',
  604800
);
select extensions.ok(
  (
    select value ->> 'status' = 'ready'
      and (value ->> 'version')::bigint = 5
      and value ->> 'reused_existing' = 'true'
      and (value ->> 'expires_at')::timestamptz > now() + interval '6 days 23 hours'
    from kc_supplement_test_state
    where key = 'recovered'
  ),
  'an expired intact artifact is recovered without rebuilding and receives seven usable days'
);
select extensions.is(
  (
    public.kc_recover_expired_data_export_artifact(
      (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
      5,
      '00000000-0000-4000-8000-000000000763',
      '10000000-0000-4000-8000-000000000763',
      604800
    ) ->> 'version'
  )::bigint,
  5::bigint,
  'recovery replay is idempotent while the renewed artifact remains ready'
);

reset role;
update kc_private.data_export_artifacts artifact_row
set expires_at = now() + interval '1 second'
where artifact_row.artifact_ref = (
  select value ->> 'artifact_ref'
  from kc_supplement_test_state
  where key = 'artifact'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;

insert into kc_supplement_test_state (key, value)
select 'reservation', public.kc_reserve_data_export_artifact_download(
  (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
  5,
  '00000000-0000-4000-8000-000000000761',
  '10000000-0000-4000-8000-000000000761',
  120
);
reset role;
select extensions.ok(
  (
    select (value ->> 'download_expires_at')::timestamptz >
        now() + interval '110 seconds'
      and (value ->> 'download_expires_at')::timestamptz > (
        select artifact_row.expires_at
        from kc_private.data_export_artifacts artifact_row
        where artifact_row.artifact_ref = value ->> 'artifact_ref'
      )
    from kc_supplement_test_state
    where key = 'reservation'
  ),
  'a near-expiry artifact receives the full download reservation window'
);

reset role;
delete from auth.sessions
where id = '10000000-0000-4000-8000-000000000761';
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;
select extensions.throws_ok(
  $$select public.kc_consume_data_export_artifact_download(
    (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
    6,
    '00000000-0000-4000-8000-000000000761',
    '10000000-0000-4000-8000-000000000761',
    (select value ->> 'download_token' from kc_supplement_test_state where key = 'reservation'),
    repeat('a', 64),
    1
  )$$,
  '42501',
  'SESSION_NOT_ACTIVE',
  'session revocation between reserve and consume prevents completion'
);
select extensions.throws_ok(
  $$select public.kc_transition_data_subject_request_for_active_session(
    ((select value #>> '{request,id}' from kc_supplement_test_state where key = 'revocation_copy'))::uuid,
    'ready',
    'completed',
    '00000000-0000-4000-8000-000000000761',
    '10000000-0000-4000-8000-000000000761',
    'downloaded',
    'Entrega que deve falhar apos revogacao.'
  )$$,
  '42501',
  'SESSION_NOT_ACTIVE',
  'revocation after build prevents the direct export transition to completed'
);

reset role;
select extensions.is(
  (
    select status
    from public.data_subject_requests
    where id = ((select value #>> '{request,id}' from kc_supplement_test_state where key = 'copy'))::uuid
  ),
  'ready',
  'revoked mid-delivery leaves the request non-completed'
);
select extensions.is(
  (
    select status
    from public.data_subject_requests
    where id = ((select value #>> '{request,id}' from kc_supplement_test_state where key = 'revocation_copy'))::uuid
  ),
  'ready',
  'revoked after build leaves the direct export ready and returns no completion'
);
insert into auth.sessions (id, user_id)
values (
  '10000000-0000-4000-8000-000000000761',
  '00000000-0000-4000-8000-000000000761'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;
select extensions.lives_ok(
  $$select public.kc_consume_data_export_artifact_download(
    (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
    6,
    '00000000-0000-4000-8000-000000000761',
    '10000000-0000-4000-8000-000000000761',
    (select value ->> 'download_token' from kc_supplement_test_state where key = 'reservation'),
    repeat('a', 64),
    1
  )$$,
  'active owner session can atomically prove full delivery'
);
select extensions.throws_ok(
  $$select public.kc_consume_data_export_artifact_download(
    (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
    6,
    '00000000-0000-4000-8000-000000000761',
    '10000000-0000-4000-8000-000000000761',
    (select value ->> 'download_token' from kc_supplement_test_state where key = 'reservation'),
    repeat('a', 64),
    1
  )$$,
  '40001',
  'EXPORT_DOWNLOAD_CONSUME_CONFLICT',
  'a consumed download token cannot be replayed after the row-version CAS advances'
);

reset role;
select extensions.is(
  (
    select status
    from public.data_subject_requests
    where id = ((select value #>> '{request,id}' from kc_supplement_test_state where key = 'copy'))::uuid
  ),
  'completed',
  'only proven owner delivery completes the DSR'
);
select extensions.is(
  (
    select status
    from public.help_requests
    where id = (
      select help_request_id
      from public.data_subject_requests
      where id = ((select value #>> '{request,id}' from kc_supplement_test_state where key = 'copy'))::uuid
    )
  ),
  'archived',
  'help ticket closes only after proven full delivery'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000761","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000761"}',
  true
);
set local role authenticated;
insert into kc_supplement_test_state (key, value)
select 'redownload_blocking_erasure', public.kc_create_data_subject_request_v2(
  'account_erasure',
  'supplement_redownload_erasure_0001',
  'json',
  'settings'
);
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;
select extensions.throws_ok(
  $$select public.kc_reserve_data_export_artifact_download(
    (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
    7,
    '00000000-0000-4000-8000-000000000761',
    '10000000-0000-4000-8000-000000000761',
    120
  )$$,
  '23514',
  'EXPORT_SUBJECT_NOT_ELIGIBLE',
  'an active account erasure also blocks supplement redownload'
);
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000761","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000761"}',
  true
);
set local role authenticated;
select public.kc_cancel_data_subject_request(
  (
    select value #>> '{request,protocol}'
    from kc_supplement_test_state
    where key = 'redownload_blocking_erasure'
  )
);

reset role;
update kc_private.data_export_artifacts artifact_row
set expires_at = clock_timestamp() + interval '1 hour'
where artifact_row.artifact_ref = (
  select value ->> 'artifact_ref'
  from kc_supplement_test_state
  where key = 'artifact'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;
insert into kc_supplement_test_state (key, value)
select 'redownload_abandoned', public.kc_reserve_data_export_artifact_download(
  (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
  7,
  '00000000-0000-4000-8000-000000000761',
  '10000000-0000-4000-8000-000000000761',
  120
);
reset role;
update kc_private.data_export_artifacts artifact_row
set download_expires_at = clock_timestamp() - interval '1 second'
where artifact_row.artifact_ref = (
  select value ->> 'artifact_ref'
  from kc_supplement_test_state
  where key = 'artifact'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;
select public.kc_read_data_export_artifact_for_owner(
  ((select value #>> '{request,id}' from kc_supplement_test_state where key = 'copy'))::uuid,
  '00000000-0000-4000-8000-000000000761'
);
reset role;
select extensions.ok(
  (
    select artifact_row.status = 'delivered'
      and artifact_row.row_version = 9
      and artifact_row.delivery_count = 1
      and artifact_row.download_return_status is null
      and artifact_row.download_token_hash is null
      and artifact_row.download_session_id is null
    from kc_private.data_export_artifacts artifact_row
    where artifact_row.artifact_ref = (
      select value ->> 'artifact_ref'
      from kc_supplement_test_state
      where key = 'artifact'
    )
  ),
  'an expired re-download reservation restores delivered rather than ready'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;
insert into kc_supplement_test_state (key, value)
select 'redownload', public.kc_reserve_data_export_artifact_download(
  (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
  9,
  '00000000-0000-4000-8000-000000000761',
  '10000000-0000-4000-8000-000000000761',
  120
);
select public.kc_consume_data_export_artifact_download(
  (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
  ((select value ->> 'version' from kc_supplement_test_state where key = 'redownload'))::bigint,
  '00000000-0000-4000-8000-000000000761',
  '10000000-0000-4000-8000-000000000761',
  (select value ->> 'download_token' from kc_supplement_test_state where key = 'redownload'),
  repeat('a', 64),
  1
);
reset role;
select extensions.ok(
  (
    select request_row.status = 'completed'
      and artifact_row.status = 'delivered'
      and artifact_row.delivery_count = 2
      and (
        select count(*)
        from public.data_subject_request_events event_row
        where event_row.request_id = request_row.id
          and event_row.event_type = 'downloaded'
      ) = 2
    from public.data_subject_requests request_row
    join kc_private.data_export_artifacts artifact_row
      on artifact_row.request_id = request_row.id
    where request_row.id = (
      (select value #>> '{request,id}' from kc_supplement_test_state where key = 'copy')
    )::uuid
  ),
  'a successful re-download preserves completed and records exactly one event'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000762","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000762"}',
  true
);
set local role authenticated;
insert into kc_supplement_test_state (key, value)
select 'erasure_purge_copy', public.kc_create_data_subject_request_v2(
  'data_access_copy',
  'supplement_erasure_purge_copy_0001',
  'json',
  'settings'
);
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;
select public.kc_transition_data_subject_request(
  ((select value #>> '{request,id}' from kc_supplement_test_state where key = 'erasure_purge_copy'))::uuid,
  'received',
  'ready',
  null,
  'status_changed',
  'Exportacao secundaria pronta.'
);
insert into kc_supplement_test_state (key, value)
select 'erasure_purge_artifact', public.kc_enqueue_data_export_artifact(
  ((select value #>> '{request,id}' from kc_supplement_test_state where key = 'erasure_purge_copy'))::uuid,
  '00000000-0000-4000-8000-000000000762',
  '[{"processor":"supabase_db_auth_storage","treatment":"automated_core_subject_workflow","status":"automated"}]'::jsonb
);
insert into kc_supplement_test_state (key, value)
select 'erasure_build_claim', public.kc_claim_data_export_artifact(
  (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'erasure_purge_artifact'),
  1,
  '00000000-0000-4000-8000-000000000763',
  '10000000-0000-4000-8000-000000000763',
  900
);
insert into kc_supplement_test_state (key, value)
select 'erasure_upload_authorization', public.kc_authorize_data_export_artifact_upload(
  (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'erasure_purge_artifact'),
  ((select value ->> 'version' from kc_supplement_test_state where key = 'erasure_build_claim'))::bigint,
  (select value ->> 'claim_token' from kc_supplement_test_state where key = 'erasure_build_claim'),
  1800
);
select extensions.ok(
  (
    select value ->> 'upload_authorized_at' is not null
      and (value ->> 'claim_expires_at')::timestamptz > now() + interval '29 minutes'
    from kc_supplement_test_state
    where key = 'erasure_upload_authorization'
  ),
  'the pre-upload CAS renews a thirty-minute lease under the subject lock'
);
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000762","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000762"}',
  true
);
set local role authenticated;
insert into kc_supplement_test_state (key, value)
select 'erasure_purge_request', public.kc_create_data_subject_request_v2(
  'account_erasure',
  'supplement_erasure_purge_request_0001',
  'json',
  'settings'
);
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;
select public.kc_transition_data_subject_request_for_admin_session(
  ((select value #>> '{request,id}' from kc_supplement_test_state where key = 'erasure_purge_request'))::uuid,
  'received',
  'processing',
  '00000000-0000-4000-8000-000000000763',
  '10000000-0000-4000-8000-000000000763',
  'status_changed',
  'Exclusao secundaria confirmada.'
);
reset role;
insert into public.account_erasure_requests (
  id,
  help_request_id,
  user_id,
  email_hash,
  status,
  data_subject_request_id,
  retention_until
) values (
  '20000000-0000-4000-8000-000000000762',
  (
    select (value #>> '{request,help_request_id}')::uuid
    from kc_supplement_test_state
    where key = 'erasure_purge_request'
  ),
  '00000000-0000-4000-8000-000000000762',
  repeat('c', 64),
  'confirmed',
  (
    select (value #>> '{request,id}')::uuid
    from kc_supplement_test_state
    where key = 'erasure_purge_request'
  ),
  now() + interval '5 years'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;
insert into kc_supplement_test_state (key, value)
select 'erasure_blocked_artifact_claims', public.kc_claim_data_export_artifacts_for_erasure(
  '00000000-0000-4000-8000-000000000762',
  '20000000-0000-4000-8000-000000000762',
  100
);
select extensions.ok(
  (
    select value ->> 'claimed_count' = '0'
      and value ->> 'blocked_active_claim_count' = '1'
      and value ->> 'has_more' = 'true'
      and (value ->> 'retry_after')::timestamptz > now()
    from kc_supplement_test_state
    where key = 'erasure_blocked_artifact_claims'
  ),
  'erasure waits instead of purging metadata while an authorized upload lease is active'
);
reset role;
update kc_private.data_export_artifacts artifact_row
set claim_expires_at = now() - interval '1 second'
where artifact_row.artifact_ref = (
  select value ->> 'artifact_ref'
  from kc_supplement_test_state
  where key = 'erasure_purge_artifact'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;
insert into kc_supplement_test_state (key, value)
select 'erasure_artifact_claims', public.kc_claim_data_export_artifacts_for_erasure(
  '00000000-0000-4000-8000-000000000762',
  '20000000-0000-4000-8000-000000000762',
  100
);
select extensions.is(
  (
    select value ->> 'claimed_count'
    from kc_supplement_test_state
    where key = 'erasure_artifact_claims'
  ),
  '1',
  'confirmed erasure atomically claims every outstanding export artifact'
);
select extensions.lives_ok(
  $$select public.kc_complete_data_export_artifact_erasure_purge(
    (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'erasure_purge_artifact'),
    (
      select (value #>> '{artifacts,0,version}')::bigint
      from kc_supplement_test_state
      where key = 'erasure_artifact_claims'
    ),
    '20000000-0000-4000-8000-000000000762'
  )$$,
  'erasure completes an artifact purge only after its Storage object is absent'
);
reset role;
select extensions.ok(
  (
    select artifact_row.status = 'purged'
      and artifact_row.owner_user_id is null
      and artifact_row.object_path is null
      and artifact_row.sha256 is null
      and artifact_row.byte_size is null
      and artifact_row.manifest = '{}'::jsonb
      and not exists (
        select 1
        from kc_private.data_export_processor_tasks task_row
        where task_row.artifact_id = artifact_row.id
      )
    from kc_private.data_export_artifacts artifact_row
    where artifact_row.artifact_ref = (
      select value ->> 'artifact_ref'
      from kc_supplement_test_state
      where key = 'erasure_purge_artifact'
    )
  ),
  'erasure purge minimizes artifact metadata and removes processor evidence'
);

update kc_private.data_export_artifacts artifact_row
set
  delivered_at = now() - interval '2 hours',
  expires_at = now() + interval '1 hour'
where artifact_row.artifact_ref = (
  select value ->> 'artifact_ref'
  from kc_supplement_test_state
  where key = 'artifact'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;
insert into kc_supplement_test_state (key, value)
select 'purge_before_expiry', public.kc_claim_expired_data_export_artifacts(
  10,
  '00000000-0000-4000-8000-000000000763',
  '10000000-0000-4000-8000-000000000763'
);
select extensions.is(
  (
    select value ->> 'claimed_count'
    from kc_supplement_test_state
    where key = 'purge_before_expiry'
  ),
  '0',
  'ordinary retention preserves a delivered artifact for redownload until expires_at'
);
reset role;
update kc_private.data_export_artifacts artifact_row
set expires_at = now() - interval '1 second'
where artifact_row.artifact_ref = (
  select value ->> 'artifact_ref'
  from kc_supplement_test_state
  where key = 'artifact'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;
insert into kc_supplement_test_state (key, value)
select 'purge_batch', public.kc_claim_expired_data_export_artifacts(
  10,
  '00000000-0000-4000-8000-000000000763',
  '10000000-0000-4000-8000-000000000763'
);
select extensions.is(
  (
    select value ->> 'claimed_count'
    from kc_supplement_test_state
    where key = 'purge_batch'
  ),
  '1',
  'the automatable purge safely claims one retention-eligible artifact'
);
select extensions.throws_ok(
  $$select public.kc_purge_data_export_artifact(
    (select value ->> 'artifact_ref' from kc_supplement_test_state where key = 'artifact'),
    (
      select (value #>> '{artifacts,0,version}')::bigint
      from kc_supplement_test_state
      where key = 'purge_batch'
    ),
    '00000000-0000-4000-8000-000000000763',
    '10000000-0000-4000-8000-000000000763'
  )$$,
  '23514',
  'EXPORT_ARTIFACT_OBJECT_STILL_PRESENT',
  'metadata purge is rejected until Storage confirms object deletion'
);
reset role;
select extensions.ok(
  (
    select artifact_row.status = 'purging'
      and artifact_row.object_path is not null
      and artifact_row.sha256 is not null
      and exists (
        select 1
        from storage.objects object_row
        where object_row.bucket_id = artifact_row.bucket_id
          and object_row.name = artifact_row.object_path
      )
    from kc_private.data_export_artifacts artifact_row
    where artifact_row.artifact_ref = (
      select value ->> 'artifact_ref'
      from kc_supplement_test_state
      where key = 'artifact'
    )
  ),
  'purge claim preserves metadata and object reference until Storage deletion is confirmed'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000764","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000764"}',
  true
);
set local role authenticated;

select extensions.throws_ok(
  $$
    select *
    from public.kc_create_help_request_with_notification_claim_v2(
      pg_catalog.jsonb_build_object(
        'type', 'question',
        'topic', 'publishing_navigation',
        'subject', 'Rascunho visitante apos login',
        'message', 'Este rascunho visitante deve falhar antes de qualquer gravacao.',
        'priority', 'normal',
        'page_path', '/ajuda.html',
        'contact_email', 'form-owner@example.test',
        'allow_contact', true,
        'metadata', '{}'::jsonb
      )
    )
  $$,
  '42501',
  'AUTH_ACCOUNT_CHANGED',
  'legacy guest draft is rejected if an authenticated account appeared before the RPC'
);
select extensions.ok(
  not exists (
    select 1
    from public.help_requests help_row
    where help_row.subject = 'Rascunho visitante apos login'
  ),
  'guest to account rejection leaves no Help row behind'
);
select extensions.throws_ok(
  $$
    select *
    from public.kc_create_help_request_with_notification_claim_v2(
      pg_catalog.jsonb_build_object(
        'expected_auth_state', 'anonymous',
        'type', 'question',
        'topic', 'publishing_navigation',
        'subject', 'Estado visitante apos login',
        'message', 'O estado anonimo divergente deve falhar antes da gravacao.',
        'priority', 'normal',
        'page_path', '/ajuda.html',
        'contact_email', 'form-owner@example.test',
        'allow_contact', true,
        'metadata', '{}'::jsonb
      )
    )
  $$,
  '42501',
  'AUTH_ACCOUNT_CHANGED',
  'explicit anonymous expectation is rejected after an account appears'
);

select extensions.throws_ok(
  $$
    select *
    from public.kc_create_help_request_with_notification_claim_v2(
      pg_catalog.jsonb_build_object(
        'expected_auth_state', 'authenticated',
        'expected_user_id',
          '00000000-0000-4000-8000-000000000761',
        'type', 'account_access',
        'topic', 'onboarding_settings',
        'subtopic', 'account_data_portability',
        'subject', 'Troca de conta nao deve persistir',
        'message', 'Este pedido deve falhar antes de qualquer gravacao.',
        'priority', 'normal',
        'page_path', '/ajuda.html',
        'contact_email', 'form-owner@example.test',
        'allow_contact', true,
        'metadata', '{}'::jsonb
      )
    )
  $$,
  '42501',
  'AUTH_ACCOUNT_CHANGED',
  'a divergent expected_user_id fails before creating a privacy request'
);
select extensions.ok(
  not exists (
    select 1
    from public.help_requests help_row
    where help_row.subject = 'Troca de conta nao deve persistir'
  )
  and not exists (
    select 1
    from public.data_subject_requests request_row
    where request_row.user_id =
      '00000000-0000-4000-8000-000000000764'
      and request_row.request_kind = 'data_portability'
  ),
  'AUTH_ACCOUNT_CHANGED leaves neither Help nor DSR behind'
);

insert into kc_supplement_test_state (key, value)
select 'authenticated_help_form', to_jsonb(created)
from public.kc_create_help_request_with_notification_claim_v2(
  jsonb_build_object(
    'expected_auth_state', 'authenticated',
    'expected_user_id', '00000000-0000-4000-8000-000000000764',
    'type', 'account_access',
    'topic', 'onboarding_settings',
    'subtopic', 'account_data_copy',
    'subject', 'Copia autenticada pelo formulario',
    'message', 'Quero uma copia integral dos dados da minha conta.',
    'priority', 'normal',
    'page_path', '/ajuda.html',
    'contact_email', 'form-owner@example.test',
    'allow_contact', true,
    'metadata', '{}'::jsonb
  )
) created;
insert into kc_supplement_test_state (key, value)
select 'authenticated_help_form_replay', to_jsonb(created)
from public.kc_create_help_request_with_notification_claim_v2(
  jsonb_build_object(
    'expected_auth_state', 'authenticated',
    'expected_user_id', '00000000-0000-4000-8000-000000000764',
    'type', 'account_access',
    'topic', 'onboarding_settings',
    'subtopic', 'account_data_copy',
    'subject', 'Copia autenticada pelo formulario',
    'message', 'Quero uma copia integral dos dados da minha conta.',
    'priority', 'normal',
    'page_path', '/ajuda.html',
    'contact_email', 'form-owner@example.test',
    'allow_contact', true,
    'metadata', '{}'::jsonb
  )
) created;
select extensions.ok(
  (
    select first.value ->> 'out_protocol' ~ '^KC-DSR-[0-9]{8}-[A-F0-9]{16}$'
      and first.value #>> '{out_data_subject_request,status}' = 'ready'
      and replay.value ->> 'out_protocol' = first.value ->> 'out_protocol'
      and replay.value ->> 'out_reused_existing' = 'true'
    from kc_supplement_test_state first
    cross join kc_supplement_test_state replay
    where first.key = 'authenticated_help_form'
      and replay.key = 'authenticated_help_form_replay'
  ),
  'authenticated privacy form creation atomically returns and reuses a downloadable DSR protocol'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000765","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000765"}',
  true
);
set local role authenticated;
insert into kc_supplement_test_state (key, value)
select 'verified_ticket_canonical_request',
  public.kc_create_data_subject_request_v2(
    'data_portability',
    'verified_ticket_canonical_0001',
    'json',
    'settings'
  );

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"anon","is_anonymous":true}',
  true
);
set local role anon;
insert into kc_supplement_test_state (key, value)
select 'anonymous_help_form', to_jsonb(created)
from public.kc_create_help_request_with_notification_claim_v2(
  jsonb_build_object(
    'expected_auth_state', 'anonymous',
    'type', 'account_access',
    'topic', 'onboarding_settings',
    'subtopic', 'account_data_portability',
    'subject', 'Portabilidade por atendimento',
    'message', 'Preciso da portabilidade dos dados vinculados a minha conta.',
    'priority', 'normal',
    'page_path', '/ajuda.html',
    'contact_email', 'verified-ticket@example.test',
    'allow_contact', true,
    'metadata', '{}'::jsonb
  )
) created;
reset role;
select extensions.ok(
  (
    select form.value ->> 'out_protocol' is null
      and help_row.user_id is null
      and help_row.metadata ->> 'request_kind' = 'data_portability'
    from kc_supplement_test_state form
    join public.help_requests help_row
      on help_row.id = (form.value ->> 'out_id')::uuid
    where form.key = 'anonymous_help_form'
  ),
  'anonymous privacy form creation remains an unlinked help reference pending verification'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;
insert into kc_supplement_test_state (key, value)
select 'verified_ticket_link', public.kc_link_verified_help_request_to_data_export(
  (
    select (value ->> 'out_id')::uuid
    from kc_supplement_test_state
    where key = 'anonymous_help_form'
  ),
  'verified-ticket@example.test',
  'data_portability',
  '00000000-0000-4000-8000-000000000763',
  '10000000-0000-4000-8000-000000000763',
  'verified_email_challenge',
  repeat('d', 64),
  transaction_timestamp() - interval '1 minute',
  '[{"processor":"supabase_db_auth_storage","treatment":"automated_core_subject_workflow","status":"automated"}]'::jsonb
);
insert into kc_supplement_test_state (key, value)
select 'verified_ticket_link_replay', public.kc_link_verified_help_request_to_data_export(
  (
    select (value ->> 'out_id')::uuid
    from kc_supplement_test_state
    where key = 'anonymous_help_form'
  ),
  'verified-ticket@example.test',
  'data_portability',
  '00000000-0000-4000-8000-000000000763',
  '10000000-0000-4000-8000-000000000763',
  'verified_email_challenge',
  repeat('d', 64),
  transaction_timestamp() - interval '1 minute',
  '[{"processor":"supabase_db_auth_storage","treatment":"automated_core_subject_workflow","status":"automated"}]'::jsonb
);
select extensions.ok(
  (
    select linked.value #>> '{request,status}' = 'partial_failure'
      and linked.value #>> '{artifact,status}' = 'queued'
      and linked.value ->> 'reused_existing' = 'true'
      and replay.value ->> 'reused_existing' = 'true'
      and replay.value #>> '{request,id}' = linked.value #>> '{request,id}'
      and linked.value #>> '{request,id}' =
        canonical.value #>> '{request,id}'
    from kc_supplement_test_state linked
    cross join kc_supplement_test_state replay
    cross join kc_supplement_test_state canonical
    where linked.key = 'verified_ticket_link'
      and replay.key = 'verified_ticket_link_replay'
      and canonical.key = 'verified_ticket_canonical_request'
  ),
  'verified anonymous ticket linking reuses the canonical DSR and queues one artifact'
);
select extensions.is(
  (
    select count(*)::integer
    from public.data_subject_requests request_row
    where request_row.user_id =
      '00000000-0000-4000-8000-000000000765'
      and request_row.request_kind = 'data_portability'
      and request_row.status in (
        'received',
        'processing',
        'ready',
        'failed',
        'partial_failure'
      )
  ),
  1,
  'settings plus a verified Help never create a second open portability request'
);
select extensions.ok(
  not has_table_privilege(
    'service_role',
    'kc_private.data_export_ticket_identity_links',
    'select'
  ),
  'service role cannot inspect private ticket attestation rows directly'
);

reset role;

select extensions.ok(
  (
    select link_row.attestation_hash = repeat('d', 64)
      and link_row.owner_user_id = '00000000-0000-4000-8000-000000000765'
      and help_row.user_id = link_row.owner_user_id
      and help_row.metadata ->> 'identity_attestation_recorded' = 'true'
    from kc_private.data_export_ticket_identity_links link_row
    join public.help_requests help_row
      on help_row.id = link_row.help_request_id
    where link_row.help_request_id = (
      select (value ->> 'out_id')::uuid
      from kc_supplement_test_state
      where key = 'anonymous_help_form'
    )
  ),
  'the verified link stores only the attestation hash in the private audit table'
);

set local role service_role;

select extensions.throws_ok(
  $$select public.kc_link_verified_help_request_to_data_export(
    (
      select (value ->> 'out_id')::uuid
      from kc_supplement_test_state
      where key = 'anonymous_help_form'
    ),
    'missing-account@example.test',
    'data_portability',
    '00000000-0000-4000-8000-000000000763',
    '10000000-0000-4000-8000-000000000763',
    'verified_email_challenge',
    repeat('e', 64),
    transaction_timestamp() - interval '1 minute',
    '[{"processor":"supabase_db_auth_storage","treatment":"automated_core_subject_workflow","status":"automated"}]'::jsonb
  )$$,
  '23514',
  'EXPORT_TICKET_IDENTITY_NOT_VERIFIED',
  'ticket, email and account mismatches use one non-oracular failure'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000764","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000764"}',
  true
);
set local role authenticated;
insert into kc_supplement_test_state (key, value)
select 'crash_after_upload_request', public.kc_create_data_subject_request_v2(
  'data_portability',
  'supplement_crash_after_upload_0001',
  'json',
  'settings'
);
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;
select public.kc_transition_data_subject_request(
  (
    select (value #>> '{request,id}')::uuid
    from kc_supplement_test_state
    where key = 'crash_after_upload_request'
  ),
  'received',
  'ready',
  null,
  'status_changed',
  'Portabilidade principal pronta; suplemento pendente.'
);
insert into kc_supplement_test_state (key, value)
select 'crash_after_upload_artifact', public.kc_enqueue_data_export_artifact(
  (
    select (value #>> '{request,id}')::uuid
    from kc_supplement_test_state
    where key = 'crash_after_upload_request'
  ),
  '00000000-0000-4000-8000-000000000764',
  '[{"processor":"supabase_db_auth_storage","treatment":"automated_core_subject_workflow","status":"automated"}]'::jsonb
);
insert into kc_supplement_test_state (key, value)
select 'crash_after_upload_claim', public.kc_claim_data_export_artifact(
  (
    select value ->> 'artifact_ref'
    from kc_supplement_test_state
    where key = 'crash_after_upload_artifact'
  ),
  (
    select (value ->> 'version')::bigint
    from kc_supplement_test_state
    where key = 'crash_after_upload_artifact'
  ),
  '00000000-0000-4000-8000-000000000763',
  '10000000-0000-4000-8000-000000000763',
  900
);
insert into kc_supplement_test_state (key, value)
select 'crash_after_upload_authorized', public.kc_authorize_data_export_artifact_upload(
  (
    select value ->> 'artifact_ref'
    from kc_supplement_test_state
    where key = 'crash_after_upload_artifact'
  ),
  (
    select (value ->> 'version')::bigint
    from kc_supplement_test_state
    where key = 'crash_after_upload_claim'
  ),
  (
    select value ->> 'claim_token'
    from kc_supplement_test_state
    where key = 'crash_after_upload_claim'
  ),
  1800
);
reset role;
insert into storage.objects (bucket_id, name, owner_id)
select
  artifact_row.bucket_id,
  artifact_row.object_path,
  artifact_row.owner_user_id::text
from kc_private.data_export_artifacts artifact_row
where artifact_row.artifact_ref = (
  select value ->> 'artifact_ref'
  from kc_supplement_test_state
  where key = 'crash_after_upload_artifact'
);
update kc_private.data_export_artifacts artifact_row
set
  claim_expires_at = now() - interval '1 second',
  upload_authorized_at = now() - interval '31 minutes'
where artifact_row.artifact_ref = (
  select value ->> 'artifact_ref'
  from kc_supplement_test_state
  where key = 'crash_after_upload_artifact'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;
insert into kc_supplement_test_state (key, value)
select 'crash_after_upload_purge_claim',
  public.kc_claim_expired_data_export_artifacts(
    100,
    '00000000-0000-4000-8000-000000000763',
    '10000000-0000-4000-8000-000000000763'
  );
select extensions.ok(
  exists (
    select 1
    from kc_supplement_test_state state_row
    cross join lateral jsonb_array_elements(
      state_row.value -> 'artifacts'
    ) claimed(value)
    where state_row.key = 'crash_after_upload_purge_claim'
      and claimed.value ->> 'artifact_ref' = (
        select artifact_state.value ->> 'artifact_ref'
        from kc_supplement_test_state artifact_state
        where artifact_state.key = 'crash_after_upload_artifact'
      )
      and claimed.value ->> 'recovery_mode' =
        'rebuild_after_cleanup'
  ),
  'an expired upload claim is recovered even while its DSR remains active'
);
select extensions.throws_ok(
  $$select public.kc_finalize_data_export_artifact(
    (
      select value ->> 'artifact_ref'
      from kc_supplement_test_state
      where key = 'crash_after_upload_artifact'
    ),
    (
      select (value ->> 'version')::bigint
      from kc_supplement_test_state
      where key = 'crash_after_upload_claim'
    ),
    (
      select value ->> 'claim_token'
      from kc_supplement_test_state
      where key = 'crash_after_upload_claim'
    ),
    repeat('f', 64),
    1,
    '{"schema_version":1,"category_count":0,"category_counts":{},"processor_outcomes":[],"media_ref_count":0,"signed_urls_embedded":false,"completeness":"complete"}'::jsonb,
    3600
  )$$,
  '40001',
  'EXPORT_ARTIFACT_CLAIM_CONFLICT',
  'the stale worker loses claim authority after retention takes ownership'
);
select extensions.throws_ok(
  $$select public.kc_purge_data_export_artifact(
    (
      select value ->> 'artifact_ref'
      from kc_supplement_test_state
      where key = 'crash_after_upload_artifact'
    ),
    (
      select (claimed.value ->> 'version')::bigint
      from kc_supplement_test_state state_row
      cross join lateral jsonb_array_elements(
        state_row.value -> 'artifacts'
      ) claimed(value)
      where state_row.key = 'crash_after_upload_purge_claim'
        and claimed.value ->> 'artifact_ref' = (
          select artifact_state.value ->> 'artifact_ref'
          from kc_supplement_test_state artifact_state
          where artifact_state.key = 'crash_after_upload_artifact'
        )
    ),
    '00000000-0000-4000-8000-000000000763',
    '10000000-0000-4000-8000-000000000763'
  )$$,
  '23514',
  'EXPORT_ARTIFACT_OBJECT_STILL_PRESENT',
  'crash recovery cannot clear metadata before Storage deletion'
);
reset role;
-- The managed local Storage schema blocks direct DELETE even inside pgTAP.
-- Moving this synthetic row away from the tracked key models the Storage API's
-- already-verified removal while keeping the test transaction rollback-only.
update storage.objects object_row
set name = 'test-cleaned/' || object_row.id::text
where object_row.bucket_id = 'kino-data-exports'
  and object_row.name = (
    select artifact_row.object_path
    from kc_private.data_export_artifacts artifact_row
    where artifact_row.artifact_ref = (
      select value ->> 'artifact_ref'
      from kc_supplement_test_state
      where key = 'crash_after_upload_artifact'
    )
  );
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000763","role":"service_role"}',
  true
);
set local role service_role;
insert into kc_supplement_test_state (key, value)
select 'crash_after_upload_recovered',
  public.kc_purge_data_export_artifact(
    (
      select value ->> 'artifact_ref'
      from kc_supplement_test_state
      where key = 'crash_after_upload_artifact'
    ),
    (
      select (claimed.value ->> 'version')::bigint
      from kc_supplement_test_state state_row
      cross join lateral jsonb_array_elements(
        state_row.value -> 'artifacts'
      ) claimed(value)
      where state_row.key = 'crash_after_upload_purge_claim'
        and claimed.value ->> 'artifact_ref' = (
          select artifact_state.value ->> 'artifact_ref'
          from kc_supplement_test_state artifact_state
          where artifact_state.key = 'crash_after_upload_artifact'
        )
    ),
    '00000000-0000-4000-8000-000000000763',
    '10000000-0000-4000-8000-000000000763'
  );
reset role;
select extensions.ok(
  (
    select artifact_row.status = 'failed'
      and artifact_row.last_error_code =
        'EXPORT_STALE_CLAIM_REBUILD_REQUIRED'
      and artifact_row.object_path is not null
      and artifact_row.sha256 is null
      and artifact_row.byte_size is null
      and artifact_row.claim_token_hash is null
      and recovered.value ->> 'requires_rebuild' = 'true'
      and exists (
        select 1
        from kc_private.data_export_processor_tasks task_row
        where task_row.artifact_id = artifact_row.id
          and task_row.processor = 'supabase_db_auth_storage'
      )
    from kc_private.data_export_artifacts artifact_row
    cross join kc_supplement_test_state recovered
    where recovered.key = 'crash_after_upload_recovered'
      and artifact_row.artifact_ref = (
        select value ->> 'artifact_ref'
        from kc_supplement_test_state
        where key = 'crash_after_upload_artifact'
      )
  ),
  'Storage cleanup leaves an active request rebuildable without stale bytes'
);
set local role service_role;
select extensions.lives_ok(
  $$select public.kc_claim_data_export_artifact(
    (
      select value ->> 'artifact_ref'
      from kc_supplement_test_state
      where key = 'crash_after_upload_artifact'
    ),
    (
      select (value ->> 'version')::bigint
      from kc_supplement_test_state
      where key = 'crash_after_upload_recovered'
    ),
    '00000000-0000-4000-8000-000000000763',
    '10000000-0000-4000-8000-000000000763',
    900
  )$$,
  'the cleaned active export can be claimed for a safe rebuild'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000765","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000765"}',
  true
);
set local role authenticated;
select public.kc_cancel_data_subject_request(
  (
    select value #>> '{request,protocol}'
    from kc_supplement_test_state
    where key = 'verified_ticket_link'
  )
);
reset role;
select extensions.ok(
  (
    select request_row.status = 'cancelled'
      and artifact_row.status = 'purging'
      and artifact_row.object_path is not null
      and artifact_row.purge_reason = 'retention'
    from public.data_subject_requests request_row
    join kc_private.data_export_artifacts artifact_row
      on artifact_row.request_id = request_row.id
    where request_row.id = (
      select (value #>> '{request,id}')::uuid
      from kc_supplement_test_state
      where key = 'verified_ticket_link'
    )
  ),
  'a partial-failure supplement can be cancelled and queues storage-first purge without dropping its path'
);

select extensions.is(
  public.kc_active_session_guard_coverage() ->> 'ok',
  'true',
  'active-session guard coverage remains complete after the new migration'
);

select * from extensions.finish();
rollback;

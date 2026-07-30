begin;

create extension if not exists pgtap with schema extensions;

select extensions.no_plan();

select extensions.has_table(
  'public',
  'data_subject_requests',
  'data subject request table exists'
);
select extensions.has_table(
  'public',
  'data_subject_request_events',
  'data subject request public event table exists'
);
select extensions.has_table(
  'kc_private',
  'data_subject_request_purge_aggregates',
  'retention aggregate is private'
);
select extensions.has_table(
  'kc_private',
  'data_subject_request_retention_schedule_state',
  'retention scheduler state is private'
);
select extensions.has_index(
  'public',
  'data_subject_requests',
  'data_subject_requests_owner_kind_idempotency_uidx',
  'owner-kind idempotency has a unique index'
);
select extensions.has_index(
  'public',
  'data_subject_requests',
  'data_subject_requests_admin_queue_idx',
  'admin queue has a covering index'
);
select extensions.has_index(
  'public',
  'account_erasure_requests',
  'account_erasure_requests_claim_token_uidx',
  'erasure operation claims are unique'
);

select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.data_subject_requests'::regclass),
  'data subject requests has RLS enabled'
);
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.data_subject_request_events'::regclass),
  'data subject request events has RLS enabled'
);
select extensions.is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'data_subject_requests'
  ),
  3,
  'request table has owner/admin policies plus the global restrictive gate'
);
select extensions.is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'data_subject_request_events'
  ),
  2,
  'event table has owner/admin select plus the global restrictive gate'
);

select extensions.ok(
  not has_table_privilege('anon', 'public.data_subject_requests', 'select'),
  'anonymous callers cannot read request protocols'
);
select extensions.ok(
  not has_table_privilege('anon', 'public.data_subject_requests', 'insert,update,delete'),
  'anonymous callers cannot mutate request protocols'
);
select extensions.ok(
  has_table_privilege('authenticated', 'public.data_subject_requests', 'select'),
  'authenticated callers can reach owner RLS'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.data_subject_requests', 'insert,update,delete'),
  'authenticated callers cannot forge request state through the Data API'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.data_subject_request_events', 'insert,update,delete'),
  'authenticated callers cannot forge request history'
);
select extensions.ok(
  not has_table_privilege(
    'authenticated',
    'kc_private.data_subject_request_purge_aggregates',
    'select,insert,update,delete'
  ),
  'browser roles cannot inspect private retention aggregates'
);
select extensions.ok(
  not has_table_privilege(
    'service_role',
    'kc_private.data_subject_request_retention_schedule_state',
    'select,insert,update,delete'
  ),
  'API service role cannot inspect the private scheduler state directly'
);

select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.kc_create_data_subject_request(text,text,text,text)',
    'execute'
  ),
  'authenticated callers can create a validated request'
);
select extensions.ok(
  not has_function_privilege(
    'anon',
    'public.kc_create_data_subject_request(text,text,text,text)',
    'execute'
  ),
  'anonymous callers cannot create an authenticated request'
);
select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.kc_cancel_data_subject_request(text)',
    'execute'
  ),
  'authenticated callers can invoke owner-checked cancellation'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.kc_reserve_data_subject_download(uuid,uuid,integer,integer)',
    'execute'
  ),
  'download reservations are not callable by browser roles'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.kc_reserve_data_subject_download(uuid,uuid,integer,integer)',
    'execute'
  ),
  'service role can reserve a bounded download'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.kc_claim_account_erasure_operation(uuid,text,integer,uuid,integer)',
    'execute'
  ),
  'browser roles cannot claim an erasure operation'
);
select extensions.ok(
  not has_function_privilege(
    'service_role',
    'public.kc_claim_account_erasure_operation(uuid,text,integer,uuid,integer)',
    'execute'
  ),
  'legacy claim without an administrator session is revoked'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.kc_claim_account_erasure_operation(uuid,text,integer,uuid,uuid,integer)',
    'execute'
  ),
  'service role can claim through the session-bound contract'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.kc_revoke_user_sessions_for_erasure(uuid)',
    'execute'
  ),
  'browser roles cannot revoke arbitrary sessions'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.kc_revoke_user_sessions_for_erasure(uuid)',
    'execute'
  ),
  'service role can revoke target refresh sessions'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.kc_transition_data_subject_request(uuid,text,text,uuid,text,text)',
    'execute'
  ),
  'browser roles cannot transition DSR workflow state'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.kc_transition_data_subject_request(uuid,text,text,uuid,text,text)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'kc_private.kc_transition_data_subject_request(uuid,text,text,uuid,text,text)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.kc_transition_data_subject_request_for_admin_session(uuid,text,text,uuid,uuid,text,text)',
    'execute'
  ),
  'service role uses public transition wrappers and cannot bypass session checks privately'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.kc_account_erasure_capabilities()',
    'execute'
  ),
  'browser roles cannot probe the hard-delete capability gate'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.kc_account_erasure_capabilities()',
    'execute'
  ),
  'service role can probe the hard-delete capability gate'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.kc_active_session_guard_coverage()',
    'execute'
  ),
  'service role can monitor stale-session guard coverage'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.kc_purge_expired_data_subject_requests(integer)',
    'execute'
  ),
  'browser roles cannot purge retained DSR records'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.kc_purge_expired_data_subject_requests(integer)',
    'execute'
  ),
  'service role can invoke the retention purge facade'
);
select extensions.ok(
  not has_function_privilege(
    'service_role',
    'kc_private.kc_purge_expired_data_subject_requests(integer)',
    'execute'
  ),
  'the cron purge core is not directly granted to API roles'
);
select extensions.ok(
  (
    select permissive = 'RESTRICTIVE'
      and roles = array['authenticated'::name]
      and qual like '%kc_is_current_session_active%'
      and with_check like '%kc_is_current_session_active%'
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'kc_storage_active_session_restrictive'
  ),
  'all Storage buckets have a restrictive active-session policy for read and write'
);
select extensions.ok(
  (
    select
      bucket_row.public is false
      and bucket_row.file_size_limit = 15728640
      and bucket_row.allowed_mime_types @> array[
        'image/jpeg',
        'audio/mpeg',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ]::text[]
    from storage.buckets bucket_row
    where bucket_row.id = 'kino-chat-media'
  ),
  'chat media bucket is private with the server-side size and MIME allowlist'
);
select extensions.is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'storage_kino_chat_media_select_participant',
        'storage_kino_chat_media_insert_sender',
        'storage_kino_chat_media_update_sender',
        'storage_kino_chat_media_delete_sender'
      )
      and coalesce(qual, with_check, '') like '%kc_is_current_session_active%'
  ),
  4,
  'private chat bucket policies all require an active session'
);
select extensions.is(
  (
    select count(*)::integer
    from pg_policies as policy_row
    join (
      values
        ('storage_chat_media_select_participant'::name, 'SELECT'::text),
        ('storage_chat_media_insert_sender'::name, 'INSERT'::text),
        ('storage_chat_media_update_sender'::name, 'UPDATE'::text),
        ('storage_chat_media_delete_sender'::name, 'DELETE'::text)
    ) as expected_policy(policyname, command_name)
      on expected_policy.policyname = policy_row.policyname
     and expected_policy.command_name = policy_row.cmd
    where policy_row.schemaname = 'storage'
      and policy_row.tablename = 'objects'
      and policy_row.permissive = 'PERMISSIVE'
      and policy_row.roles = array['authenticated'::name]
      and coalesce(policy_row.qual, policy_row.with_check, '')
        like '%kc_is_current_session_active%'
      and concat_ws(' ', policy_row.qual, policy_row.with_check)
        like '%kino-media%'
      and concat_ws(' ', policy_row.qual, policy_row.with_check)
        like '%chat-media%'
      and concat_ws(' ', policy_row.qual, policy_row.with_check)
        like '%cardinality%'
      and concat_ws(' ', policy_row.qual, policy_row.with_check)
        like '%participant_low%'
      and concat_ws(' ', policy_row.qual, policy_row.with_check)
        like '%participant_high%'
  ),
  4,
  'expand phase preserves strict legacy read/write policies until contract'
);
select extensions.ok(
  (
    select
      count(*) = 3
      and bool_and(
        concat_ws(' ', policy_row.qual, policy_row.with_check)
          like '%auth.uid%'
        and concat_ws(' ', policy_row.qual, policy_row.with_check)
          like '%foldername%'
        and (
          policy_row.cmd <> 'UPDATE'
          or (
            policy_row.qual like '%auth.uid%'
            and policy_row.with_check like '%auth.uid%'
          )
        )
      )
    from pg_policies as policy_row
    where policy_row.schemaname = 'storage'
      and policy_row.tablename = 'objects'
      and policy_row.policyname in (
        'storage_chat_media_insert_sender',
        'storage_chat_media_update_sender',
        'storage_chat_media_delete_sender'
      )
  ),
  'legacy writes remain sender-bound and UPDATE validates old and new paths'
);
select extensions.ok(
  (
    select qual like '%kc_is_current_session_active%'
    from pg_policies
    where schemaname = 'public'
      and tablename = 'data_subject_requests'
      and policyname = 'data_subject_requests_select_owner_or_admin'
  ),
  'owner/admin DSR reads require an active auth session'
);
select extensions.ok(
  (
    select qual like '%kc_is_current_session_active%'
    from pg_policies
    where schemaname = 'public'
      and tablename = 'data_subject_request_events'
      and policyname = 'data_subject_request_events_select_owner_or_admin'
  ),
  'owner/admin DSR event reads require an active auth session'
);

select extensions.ok(
  not (
    select prosecdef
    from pg_proc
    where oid = 'public.kc_create_data_subject_request(text,text,text,text)'::regprocedure
  ),
  'public create RPC is an invoker wrapper'
);
select extensions.ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'kc_private.kc_create_data_subject_request(text,text,text,text)'::regprocedure
  ),
  'private create worker is a definer'
);
select extensions.ok(
  (
    select proconfig @> array['search_path=""']
    from pg_proc
    where oid = 'kc_private.kc_create_data_subject_request(text,text,text,text)'::regprocedure
  ),
  'private create worker fixes search_path'
);
select extensions.ok(
  (
    select prosrc like '%from auth.users%'
      and prosrc like '%auth.uid()%'
      and prosrc not like '%p_email%'
    from pg_proc
    where oid = 'kc_private.kc_create_data_subject_request(text,text,text,text)'::regprocedure
  ),
  'create worker derives identity and e-mail server-side'
);
select extensions.ok(
  (
    select prosrc like '%account_data_copy%'
      and prosrc like '%account_data_portability%'
      and prosrc like '%account_deletion%'
    from pg_proc
    where oid = 'kc_private.kc_create_data_subject_request(text,text,text,text)'::regprocedure
  ),
  'help tickets use canonical privacy subtopics'
);
select extensions.ok(
  (
    select prosrc like '%extensions.gen_random_bytes(32)%'
      and prosrc not like '%extensions.digest(convert_to(v_uid::text%'
      and prosrc not like '%extensions.digest(convert_to(v_email%'
    from pg_proc
    where oid = 'kc_private.kc_create_data_subject_request(text,text,text,text)'::regprocedure
  ),
  'receipt subject token is random and not derived from UUID or e-mail'
);
select extensions.ok(
  (
    select prosrc like '%jsonb_build_array(%'
      and prosrc like '%media_manifest%'
      and prosrc like '%storage_objects%'
    from pg_proc
    where oid = 'kc_private.kc_create_data_subject_request(text,text,text,text)'::regprocedure
  ),
  'create worker persists an explicit canonical scope'
);
select extensions.ok(
  (
    select prosrc like '%pg_advisory_xact_lock%'
      and prosrc like '%interval ''5 minutes''%'
      and prosrc like '%interval ''24 hours''%'
    from pg_proc
    where oid = 'kc_private.kc_create_data_subject_request(text,text,text,text)'::regprocedure
  ),
  'create worker serializes idempotency and rate limits'
);
select extensions.ok(
  (
    select prosrc like '%pg_advisory_xact_lock%'
      and prosrc like '%download_attempted%'
    from pg_proc
    where oid = 'kc_private.kc_reserve_data_subject_download(uuid,uuid,integer,integer)'::regprocedure
  ),
  'download attempt reservation is atomic'
);
select extensions.ok(
  (
    select prosrc like '%for update%'
      and prosrc like '%ERASURE_VERSION_CONFLICT%'
      and prosrc like '%ERASURE_STATUS_CONFLICT%'
    from pg_proc
    where oid = 'kc_private.kc_claim_account_erasure_operation(uuid,text,integer,uuid,uuid,integer)'::regprocedure
  ),
  'erasure claim checks status and optimistic version under a row lock'
);
select extensions.ok(
  (
    select prosrc like '%update public.data_subject_requests%'
      and prosrc like '%insert into public.data_subject_request_events%'
      and prosrc like '%DSR_STATUS_CONFLICT%'
      and prosrc like '%DSR_TERMINAL_STATE%'
    from pg_proc
    where oid =
      'kc_private.kc_transition_data_subject_request(uuid,text,text,uuid,text,text)'::regprocedure
  ),
  'DSR transition worker performs CAS state update and event insert atomically'
);
select extensions.ok(
  (
    select prosrc like
      '%[89ab][0-9a-f]{3}-[0-9a-f]{12}%'
      and prosrc like '%from auth.sessions%'
    from pg_proc
    where oid = 'kc_private.kc_is_current_session_active()'::regprocedure
  ),
  'active-session helper validates the complete UUID and auth.sessions row'
);
select extensions.ok(
  (
    select prosrc like '%delete from auth.sessions%'
      and prosrc like '%delete from auth.refresh_tokens%'
      and prosrc like '%token_row.user_id = p_user_id::text%'
      and prosrc like '%token_row.session_id = any(v_session_ids)%'
      and prosrc like '%SESSION_REVOCATION_INCOMPLETE%'
      and prosrc like '%refresh_tokens_deleted%'
      and prosrc like '%SERVICE_ROLE_REQUIRED%'
    from pg_proc
    where oid = 'kc_private.kc_revoke_user_sessions_for_erasure(uuid)'::regprocedure
  ),
  'session revocation counts sessions and refresh tokens behind a service-role gate'
);
select extensions.ok(
  (
    select base_row.prosrc like
        '%status in (''completed'', ''cancelled'', ''expired'')%'
      and base_row.prosrc not like
        '%status in (''completed'', ''cancelled'', ''failed'', ''partial_failure'', ''expired'')%'
      and base_row.prosrc like '%overdue_unresolved_requests%'
      and base_row.prosrc like '%contact_email = ''purged-''%'
      and wrapper_row.prosrc like
        '%kc_purge_expired_data_subject_requests_privacy_base%'
      and wrapper_row.prosrc like
        '%kc_cleanup_privacy_help_tombstones_v1%'
    from pg_proc base_row
    cross join pg_proc wrapper_row
    where base_row.oid =
      'kc_private.kc_purge_expired_data_subject_requests_privacy_base(integer)'::regprocedure
      and wrapper_row.oid =
        'kc_private.kc_purge_expired_data_subject_requests(integer)'::regprocedure
  ),
  'retention purge base redacts tickets while its wrapper adds bounded privacy-state cleanup'
);
select extensions.ok(
  (
    select base_row.prosrc like
        '%from public.account_erasure_requests%'
      and base_row.prosrc like '%status in (''erased'', ''cancelled'')%'
      and base_row.prosrc like '%overdue_unresolved_erasure_requests%'
      and base_row.prosrc like '%purged_erasure_requests%'
      and wrapper_row.prosrc like
        '%kc_purge_expired_data_subject_requests_privacy_base%'
    from pg_proc base_row
    cross join pg_proc wrapper_row
    where base_row.oid =
      'kc_private.kc_purge_expired_data_subject_requests_privacy_base(integer)'::regprocedure
      and wrapper_row.oid =
        'kc_private.kc_purge_expired_data_subject_requests(integer)'::regprocedure
  ),
  'retention purge base keeps erasure semantics behind the compatible wrapper'
);
select extensions.ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'account_erasure_requests'
      and column_name = 'retention_until'
      and is_nullable = 'NO'
  ),
  'account erasure operations have a mandatory retention deadline'
);
select extensions.ok(
  exists (
    select 1
    from pg_db_role_setting role_setting,
      lateral unnest(role_setting.setconfig) setting_value
    where role_setting.setrole = 'authenticator'::regrole
      and setting_value =
        'pgrst.db_pre_request=public.kc_enforce_active_session_pre_request'
  ),
  'PostgREST authenticator installs the fail-closed pre-request hook'
);
select extensions.ok(
  (
    with app_tables as (
      select class_row.oid
      from pg_class class_row
      join pg_namespace namespace_row
        on namespace_row.oid = class_row.relnamespace
      where namespace_row.nspname = 'public'
        and class_row.relkind in ('r', 'p')
        and not exists (
          select 1
          from pg_depend dependency_row
          where dependency_row.classid = 'pg_class'::regclass
            and dependency_row.objid = class_row.oid
            and dependency_row.deptype = 'e'
        )
    )
    select not exists (
      select 1
      from app_tables table_row
      where not exists (
        select 1
        from pg_trigger trigger_row
        where trigger_row.tgrelid = table_row.oid
          and trigger_row.tgname = 'kc_active_session_write_guard'
          and not trigger_row.tgisinternal
      )
    )
  ),
  'every public application table has the stale-session write trigger'
);
select extensions.ok(
  (
    select pg_get_constraintdef(oid) like '%confirmation_delivery_failed%'
      and pg_get_constraintdef(oid) like '%confirmed%'
      and pg_get_constraintdef(oid) like '%partial_failure%'
    from pg_constraint
    where conrelid = 'public.account_erasure_requests'::regclass
      and conname = 'account_erasure_requests_status_check'
  ),
  'erasure status constraint contains hardened states without removing legacy states'
);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000751', 'dsr-owner@example.test'),
  ('00000000-0000-4000-8000-000000000752', 'dsr-other@example.test'),
  ('00000000-0000-4000-8000-000000000753', 'dsr-admin@example.test');

insert into public.profiles (id, email, full_name, is_admin)
values
  ('00000000-0000-4000-8000-000000000751', 'dsr-owner@example.test', 'DSR Owner', false),
  ('00000000-0000-4000-8000-000000000752', 'dsr-other@example.test', 'DSR Other', false),
  ('00000000-0000-4000-8000-000000000753', 'dsr-admin@example.test', 'DSR Admin', true);

insert into auth.sessions (id, user_id)
values
  ('10000000-0000-4000-8000-000000000751', '00000000-0000-4000-8000-000000000751'),
  ('10000000-0000-4000-8000-000000000752', '00000000-0000-4000-8000-000000000752'),
  ('10000000-0000-4000-8000-000000000753', '00000000-0000-4000-8000-000000000753');

insert into auth.refresh_tokens (token, user_id, session_id)
values
  (
    'pgtap-dsr-refresh-token-752',
    '00000000-0000-4000-8000-000000000752',
    '10000000-0000-4000-8000-000000000752'
  ),
  (
    'pgtap-dsr-orphan-refresh-token-752',
    '00000000-0000-4000-8000-000000000752',
    null
  );

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000751","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000751"}',
  true
);
set local role authenticated;

select extensions.lives_ok(
  $$select public.kc_create_data_subject_request(
    'data_access_copy',
    'dsr_copy_idempotency_0001',
    'json',
    'settings'
  )$$,
  'owner can create a data-copy request'
);
select extensions.is(
  (
    select count(*)::integer
    from public.data_subject_requests
    where user_id = '00000000-0000-4000-8000-000000000751'
      and request_kind = 'data_access_copy'
  ),
  1,
  'owner sees the created request through RLS'
);
select extensions.ok(
  (
    select
      subject_hash ~ '^[a-f0-9]{64}$'
      and subject_hash <> encode(
        extensions.digest(
          convert_to('00000000-0000-4000-8000-000000000751', 'UTF8'),
          'sha256'
        ),
        'hex'
      )
    from public.data_subject_requests
    where user_id = '00000000-0000-4000-8000-000000000751'
      and request_kind = 'data_access_copy'
  ),
  'known public profile UUID cannot reproduce the opaque receipt token'
);
select extensions.is(
  (
    select count(*)::integer
    from public.help_requests
    where user_id = '00000000-0000-4000-8000-000000000751'
      and subtopic = 'account_data_copy'
  ),
  1,
  'request atomically creates a canonical help ticket'
);
select extensions.lives_ok(
  $$select public.kc_create_data_subject_request(
    'data_access_copy',
    'dsr_copy_idempotency_0001',
    'json',
    'settings'
  )$$,
  'retry with the same idempotency key succeeds'
);
select extensions.is(
  (
    select count(*)::integer
    from public.data_subject_requests
    where user_id = '00000000-0000-4000-8000-000000000751'
      and request_kind = 'data_access_copy'
  ),
  1,
  'idempotent retry does not duplicate the protocol'
);
select extensions.lives_ok(
  $$select public.kc_create_data_subject_request(
    'data_access_copy',
    'dsr_copy_idempotency_0002',
    'json',
    'settings'
  )$$,
  'a new key recovers the already-open canonical request after reload'
);

select extensions.lives_ok(
  $$select public.kc_create_help_request(
    jsonb_build_object(
      'type', 'question',
      'topic', 'platform_use',
      'subject', 'Prioridade urgente',
      'message', 'Mensagem valida para testar prioridade urgente.',
      'contact_email', 'dsr-owner@example.test',
      'priority', 'urgent'
    )
  )$$,
  'help RPC accepts a client-requested urgent priority'
);
select extensions.lives_ok(
  $$select public.kc_create_help_request(
    jsonb_build_object(
      'type', 'report',
      'topic', 'security',
      'subject', 'Incidente de seguranca',
      'message', 'Mensagem valida para o fluxo estruturado de seguranca.',
      'contact_email', 'dsr-owner@example.test',
      'priority', 'urgent'
    )
  )$$,
  'structured security report can receive effective urgent priority'
);
select extensions.lives_ok(
  $$select public.kc_create_help_request(
    jsonb_build_object(
      'type', 'question',
      'topic', 'platform_use',
      'subtopic', 'account_deletion',
      'subject', 'Metadata nao confiavel',
      'message', 'Mensagem valida para testar metadata nao confiavel.',
      'contact_email', 'dsr-owner@example.test',
      'metadata', jsonb_build_object('request_kind', 'account_erasure')
    )
  )$$,
  'noncanonical help tuple ignores spoofed privacy request_kind'
);
select extensions.throws_ok(
  $$select public.kc_create_help_request(
    jsonb_build_object(
      'type', 'account_access',
      'topic', 'onboarding_settings',
      'subtopic', 'account_data_portability',
      'subject', 'Classificacao canonica',
      'message', 'Mensagem valida para testar classificacao canonica.',
      'contact_email', 'dsr-owner@example.test',
      'metadata', jsonb_build_object('request_kind', 'account_erasure')
    )
  )$$,
  '22023',
  'HELP_PRIVACY_IDEMPOTENT_RPC_REQUIRED',
  'legacy Help RPC rejects a canonical privacy tuple'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000753","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000753"}',
  true
);
select extensions.lives_ok(
  $$select * from public.kc_create_privacy_help_request_v1(
    jsonb_build_object(
      'expected_auth_state', 'authenticated',
      'expected_user_id', '00000000-0000-4000-8000-000000000753',
      'idempotency_key', repeat('9', 64),
      'type', 'account_access',
      'topic', 'onboarding_settings',
      'subtopic', 'account_data_portability',
      'subject', 'Classificacao canonica',
      'message', 'Mensagem valida para testar classificacao canonica.',
      'contact_email', 'dsr-admin@example.test',
      'metadata', jsonb_build_object('request_kind', 'account_erasure')
    )
  )$$,
  'idempotent privacy RPC derives the canonical request_kind'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000751","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000751"}',
  true
);

reset role;

select extensions.is(
  (
    select priority
    from public.help_requests
    where contact_email = 'dsr-owner@example.test'
      and subject = 'Prioridade urgente'
    order by created_at desc
    limit 1
  ),
  'high',
  'unstructured client urgency is capped at high'
);
select extensions.is(
  (
    select metadata ->> 'requested_priority'
    from public.help_requests
    where contact_email = 'dsr-owner@example.test'
      and subject = 'Prioridade urgente'
    order by created_at desc
    limit 1
  ),
  'urgent',
  'requested urgency remains an informational metadata field'
);
select extensions.is(
  (
    select priority
    from public.help_requests
    where contact_email = 'dsr-owner@example.test'
      and subject = 'Incidente de seguranca'
    order by created_at desc
    limit 1
  ),
  'urgent',
  'only the canonical security-report tuple has effective urgent priority'
);
select extensions.is(
  (
    select metadata ? 'request_kind'
    from public.help_requests
    where subject = 'Metadata nao confiavel'
    order by created_at desc
    limit 1
  ),
  false,
  'spoofed request_kind is removed outside canonical privacy tuples'
);
select extensions.is(
  (
    select metadata ->> 'request_kind'
    from public.help_requests
    where subject = 'Classificacao canonica'
    order by created_at desc
    limit 1
  ),
  'data_portability',
  'canonical tuple derives request_kind server-side'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000751","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000751"}',
  true
);
set local role authenticated;

select extensions.lives_ok(
  $$select public.kc_cancel_data_subject_request(
    (
      select protocol
      from public.data_subject_requests
      where request_kind = 'data_access_copy'
      order by created_at desc
      limit 1
    )
  )$$,
  'owner can cancel an export before processing'
);
select extensions.lives_ok(
  $$select public.kc_create_data_subject_request(
    'account_erasure',
    'dsr_erasure_idempotency_0001',
    'json',
    'settings'
  )$$,
  'owner can create an account-erasure request'
);

reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000753","role":"service_role"}',
  true
);
set local role service_role;

select extensions.lives_ok(
  $$select public.kc_transition_data_subject_request_for_admin_session(
    (
      select id
      from public.data_subject_requests
      where request_kind = 'account_erasure'
      order by created_at desc
      limit 1
    ),
    'received',
    'processing',
    '00000000-0000-4000-8000-000000000753',
    '10000000-0000-4000-8000-000000000753',
    'status_changed',
    'Aplicando medidas reversiveis.'
  )$$,
  'service transition atomically moves erasure to processing'
);
select extensions.lives_ok(
  $$select public.kc_transition_data_subject_request_for_admin_session(
    (
      select id
      from public.data_subject_requests
      where request_kind = 'account_erasure'
      order by created_at desc
      limit 1
    ),
    'processing',
    'pending_confirmation',
    '00000000-0000-4000-8000-000000000753',
    '10000000-0000-4000-8000-000000000753',
    'status_changed',
    'Confirmacao do titular pendente.'
  )$$,
  'service transition atomically moves erasure to confirmation'
);

reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000751","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000751"}',
  true
);
set local role authenticated;

select extensions.lives_ok(
  $$select public.kc_cancel_data_subject_request(
    (
      select protocol
      from public.data_subject_requests
      where request_kind = 'account_erasure'
      order by created_at desc
      limit 1
    )
  )$$,
  'owner cancellation blocks irreversible erasure while restoration remains tracked'
);

reset role;

select extensions.is(
  (
    select status
    from public.help_requests
    where subtopic = 'account_data_copy'
    order by created_at asc
    limit 1
  ),
  'archived',
  'simple export cancellation archives its generated help ticket'
);
select extensions.ok(
  (
    select help_row.status = 'in_progress'
      and help_row.priority in ('high', 'urgent')
      and help_row.metadata ->> 'reversible_restore_required' = 'true'
      and help_row.metadata ? 'cancellation_requested_at'
    from public.help_requests help_row
    join public.data_subject_requests request_row
      on request_row.help_request_id = help_row.id
    where request_row.request_kind = 'account_erasure'
    order by request_row.created_at desc
    limit 1
  ),
  'pending erasure cancellation keeps help open and marks reversible restoration'
);
select extensions.is(
  (
    select count(*)::integer
    from public.data_subject_request_events event_row
    join public.data_subject_requests request_row
      on request_row.id = event_row.request_id
    where request_row.request_kind = 'account_erasure'
  ),
  4,
  'created, processing, confirmation and cancellation events are all recorded'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000753","role":"service_role"}',
  true
);
set local role service_role;
select extensions.throws_ok(
  $$select public.kc_transition_data_subject_request_for_admin_session(
    (
      select id
      from public.data_subject_requests
      where request_kind = 'account_erasure'
      order by created_at desc
      limit 1
    ),
    'cancelled',
    'processing',
    '00000000-0000-4000-8000-000000000753',
    '10000000-0000-4000-8000-000000000753',
    'status_changed',
    'Transicao terminal indevida.'
  )$$,
  '23514',
  'DSR_TERMINAL_STATE',
  'cancelled DSR cannot be operated again'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000752","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000752"}',
  true
);
set local role authenticated;

select extensions.is(
  (
    select count(*)::integer
    from public.data_subject_requests
    where user_id = '00000000-0000-4000-8000-000000000751'
  ),
  0,
  'a different authenticated user cannot read the owner request'
);
select extensions.lives_ok(
  $$select public.kc_create_data_subject_request(
    'data_portability',
    'dsr_other_portability_0001',
    'json',
    'settings'
  )$$,
  'second user can create a request while its session is active'
);
select extensions.lives_ok(
  $$insert into public.search_preferences (user_id)
    values ('00000000-0000-4000-8000-000000000752')$$,
  'second user can create a direct-RLS fixture while its session is active'
);

reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000753","role":"service_role"}',
  true
);
set local role service_role;
select extensions.is(
  public.kc_active_session_guard_coverage() ->> 'ok',
  'true',
  'runtime guard coverage reports no missing public trigger or RLS policy'
);
select extensions.throws_ok(
  $$select public.kc_reserve_data_subject_download(
    (
      select id
      from public.data_subject_requests
      where user_id = '00000000-0000-4000-8000-000000000751'
        and request_kind = 'data_access_copy'
      limit 1
    ),
    '00000000-0000-4000-8000-000000000751',
    5,
    900
  )$$,
  '23514',
  'DSR_DOWNLOAD_NOT_AVAILABLE',
  'download reservation rejects a cancelled or otherwise unavailable export'
);
select extensions.lives_ok(
  $$select public.kc_transition_data_subject_request_for_admin_session(
    (
      select id
      from public.data_subject_requests
      where user_id = '00000000-0000-4000-8000-000000000752'
        and request_kind = 'data_portability'
      limit 1
    ),
    'received',
    'ready',
    '00000000-0000-4000-8000-000000000753',
    '10000000-0000-4000-8000-000000000753',
    'status_changed',
    'Exportacao pronta em transacao unica.'
  )$$,
  'export reservation moves directly from received to ready atomically'
);
select extensions.ok(
  (
    select status = 'ready'
      and ready_at is not null
      and expires_at between ready_at + interval '14 minutes'
        and ready_at + interval '16 minutes'
    from public.data_subject_requests
    where user_id = '00000000-0000-4000-8000-000000000752'
      and request_kind = 'data_portability'
    limit 1
  ),
  'atomic ready transition sets the bounded download window'
);
select extensions.is(
  public.kc_revoke_user_sessions_for_erasure(
    '00000000-0000-4000-8000-000000000752'
  ),
  '{"ok":true,"sessions_deleted":1,"refresh_tokens_deleted":2}'::jsonb,
  'session revocation deletes both session-linked and user-only refresh tokens'
);
select extensions.is(
  public.kc_revoke_user_sessions_for_erasure(
    '00000000-0000-4000-8000-000000000752'
  ),
  '{"ok":true,"sessions_deleted":0,"refresh_tokens_deleted":0}'::jsonb,
  'session revocation is idempotent'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000752","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000752"}',
  true
);
set local role authenticated;
select extensions.is(
  public.kc_is_current_session_active(),
  false,
  'a JWT whose auth.sessions row was removed is stale'
);
select extensions.is(
  (
    select count(*)::integer
    from public.data_subject_requests
    where user_id = '00000000-0000-4000-8000-000000000752'
  ),
  0,
  'stale JWT cannot read even its own DSR protocol through RLS'
);
select extensions.throws_ok(
  $$select public.kc_create_data_subject_request(
    'data_access_copy',
    'dsr_stale_session_0001',
    'json',
    'settings'
  )$$,
  '42501',
  'DSR_AUTH_REQUIRED',
  'stale JWT cannot create another DSR through the owner RPC'
);
select extensions.throws_ok(
  $$select public.kc_cancel_data_subject_request(
    'KC-DSR-20000101-0000000000000000'
  )$$,
  '42501',
  'DSR_AUTH_REQUIRED',
  'stale JWT is rejected before owner cancellation lookup'
);
select extensions.throws_ok(
  $$select public.kc_enforce_active_session_pre_request()$$,
  '42501',
  'AUTH_SESSION_NOT_ACTIVE',
  'PostgREST pre-request hook rejects a revoked authenticated session'
);
select extensions.throws_ok(
  $$insert into public.search_preferences (user_id)
    values ('00000000-0000-4000-8000-000000000752')$$,
  '42501',
  'AUTH_SESSION_NOT_ACTIVE',
  'global statement trigger rejects direct INSERT with a stale JWT'
);
select extensions.throws_ok(
  $$update public.search_preferences
    set preferences = preferences
    where user_id = '00000000-0000-4000-8000-000000000752'$$,
  '42501',
  'AUTH_SESSION_NOT_ACTIVE',
  'global statement trigger rejects direct UPDATE with a stale JWT'
);
select extensions.throws_ok(
  $$delete from public.search_preferences
    where user_id = '00000000-0000-4000-8000-000000000752'$$,
  '42501',
  'AUTH_SESSION_NOT_ACTIVE',
  'global statement trigger rejects direct DELETE with a stale JWT'
);
reset role;
select set_config('request.jwt.claims', '{}', true);

insert into public.account_erasure_requests (
  id,
  user_id,
  email_hash,
  status,
  operation_version
) values (
  '00000000-0000-4000-8000-000000000754',
  '00000000-0000-4000-8000-000000000751',
  repeat('a', 64),
  'confirmed',
  1
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000753","role":"service_role"}',
  true
);
set local role service_role;

select extensions.lives_ok(
  $$select public.kc_claim_account_erasure_operation(
    '00000000-0000-4000-8000-000000000754',
    'confirmed',
    1,
    '00000000-0000-4000-8000-000000000753',
    '10000000-0000-4000-8000-000000000753',
    300
  )$$,
  'service role can claim a confirmed erasure with the expected version'
);
select extensions.is(
  public.kc_account_erasure_capabilities(),
  '{
    "version": 5,
    "write_quiescence": true,
    "chat_preserving_delete": true,
    "cadu_set_null": true,
    "unit_meta_set_null": true,
    "community_content_preserving_delete": true,
    "safety_records_preserving_delete": true,
    "audit_identifier_redaction": true,
    "audit_personal_email_redaction": true,
    "help_request_redaction_postcondition": true,
    "pre_erasure_copy_gate": true,
    "export_artifact_erasure_purge": true,
    "encrypted_completion_outbox": true,
    "durable_subject_closure": true,
    "renewable_operation_lease": true,
    "admin_session_bound_claims": true,
    "atomic_workflow_upsert": true,
    "atomic_irreversible_dsr_transition": true,
    "durable_auth_delete_checkpoint": true
  }'::jsonb,
  'erasure capability RPC returns the exact fail-closed feature shape'
);

reset role;

select extensions.is(
  (
    select operation_version
    from public.account_erasure_requests
    where id = '00000000-0000-4000-8000-000000000754'
  ),
  2,
  'claim atomically increments the operation version'
);
select extensions.ok(
  (
    select operation_claim_token is not null
      and operation_claim_expires_at > operation_claimed_at
      and operation_claimed_by = '00000000-0000-4000-8000-000000000753'
      and operation_claim_session_id = '10000000-0000-4000-8000-000000000753'
    from public.account_erasure_requests
    where id = '00000000-0000-4000-8000-000000000754'
  ),
  'claim records a bounded token and responsible administrator'
);

insert into public.help_requests (
  id,
  user_id,
  type,
  topic,
  subtopic,
  subject,
  message,
  priority,
  status,
  contact_email,
  allow_contact,
  metadata
) values (
  '00000000-0000-4000-8000-000000000763',
  '00000000-0000-4000-8000-000000000751',
  'account_access',
  'onboarding_settings',
  'account_deletion',
  'Exclusao operacional detalhada',
  'Registro operacional que deve ser redigido antes da purga.',
  'high',
  'archived',
  'erasure-purge-owner@example.test',
  false,
  jsonb_build_object(
    'request_kind', 'account_erasure',
    'operation_id', '00000000-0000-4000-8000-000000000764'
  )
);

insert into public.account_erasure_requests (
  id,
  help_request_id,
  user_id,
  email_hash,
  status,
  counts,
  receipt,
  metadata,
  retention_until,
  requested_at,
  created_at,
  updated_at
) values (
  '00000000-0000-4000-8000-000000000764',
  '00000000-0000-4000-8000-000000000763',
  '00000000-0000-4000-8000-000000000751',
  repeat('d', 64),
  'erased',
  '{"profiles":1}'::jsonb,
  '{"internal":"must disappear"}'::jsonb,
  '{"email":"erasure-purge-owner@example.test"}'::jsonb,
  '2021-01-01 00:00:00+00',
  '2020-01-01 00:00:00+00',
  '2020-01-01 00:00:00+00',
  '2020-01-02 00:00:00+00'
), (
  '00000000-0000-4000-8000-000000000765',
  null,
  '00000000-0000-4000-8000-000000000751',
  repeat('e', 64),
  'failed',
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  '2021-01-01 00:00:00+00',
  '2020-01-01 00:00:00+00',
  '2020-01-01 00:00:00+00',
  '2020-01-02 00:00:00+00'
);

insert into public.help_requests (
  id,
  user_id,
  type,
  topic,
  subtopic,
  subject,
  message,
  priority,
  status,
  contact_email,
  allow_contact,
  metadata
) values (
  '00000000-0000-4000-8000-000000000760',
  '00000000-0000-4000-8000-000000000751',
  'account_access',
  'onboarding_settings',
  'account_data_copy',
  'KC-DSR-20200101-ABCDEF0123456789',
  'Protocolo KC-DSR-20200101-ABCDEF0123456789 para purge-owner@example.test.',
  'normal',
  'archived',
  'purge-owner@example.test',
  false,
  jsonb_build_object(
    'protocol', 'KC-DSR-20200101-ABCDEF0123456789',
    'data_subject_request_id', '00000000-0000-4000-8000-000000000761',
    'request_kind', 'data_access_copy'
  )
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
  export_schema_version,
  scope,
  completed_at,
  retention_until,
  created_at,
  updated_at
) values (
  '00000000-0000-4000-8000-000000000761',
  'KC-DSR-20200101-ABCDEF0123456789',
  '00000000-0000-4000-8000-000000000751',
  '00000000-0000-4000-8000-000000000760',
  repeat('b', 64),
  'data_access_copy',
  'completed',
  'purge_completed_0001',
  'json',
  'settings',
  1,
  '["profile"]'::jsonb,
  '2020-01-02 00:00:00+00',
  '2021-01-01 00:00:00+00',
  '2020-01-01 00:00:00+00',
  '2020-01-02 00:00:00+00'
), (
  '00000000-0000-4000-8000-000000000762',
  'KC-DSR-20200101-ABCDEF0123456790',
  '00000000-0000-4000-8000-000000000751',
  null,
  repeat('c', 64),
  'data_portability',
  'failed',
  'purge_unresolved_0001',
  'json',
  'settings',
  1,
  '["profile"]'::jsonb,
  null,
  '2021-01-01 00:00:00+00',
  '2020-01-01 00:00:00+00',
  '2020-01-02 00:00:00+00'
);

insert into public.data_subject_request_events (
  request_id,
  status,
  event_type,
  public_message
) values (
  '00000000-0000-4000-8000-000000000761',
  'completed',
  'downloaded',
  'Evento que deve ser removido com o DSR.'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000753","role":"service_role"}',
  true
);
set local role service_role;

select extensions.is(
  (public.kc_purge_expired_data_subject_requests(100) ->> 'purged_requests')::integer,
  1,
  'retention purge removes only terminal resolved DSR rows'
);
select extensions.is(
  (
    public.kc_purge_expired_data_subject_requests(100)
    ->> 'purged_erasure_requests'
  )::integer,
  0,
  'a second purge proves the resolved erasure was removed atomically in the first run'
);
select extensions.ok(
  (
    with result as (
      select public.kc_purge_expired_data_subject_requests(100) as value
    )
    select
      (value ->> 'purged_requests')::integer = 0
      and (value ->> 'purged_erasure_requests')::integer = 0
      and (value ->> 'overdue_unresolved_dsr_requests')::integer >= 1
      and (value ->> 'overdue_unresolved_erasure_requests')::integer >= 1
      and (value ->> 'has_operational_alert')::boolean
    from result
  ),
  'retention purge is idempotent and alerts on unresolved overdue requests'
);

reset role;

select extensions.is(
  (
    select count(*)::integer
    from public.data_subject_requests
    where id = '00000000-0000-4000-8000-000000000761'
  ),
  0,
  'purged DSR no longer exists'
);
select extensions.is(
  (
    select count(*)::integer
    from public.data_subject_request_events
    where request_id = '00000000-0000-4000-8000-000000000761'
  ),
  0,
  'purged DSR events are removed by the same transaction'
);
select extensions.is(
  (
    select count(*)::integer
    from public.data_subject_requests
    where id = '00000000-0000-4000-8000-000000000762'
      and status = 'failed'
  ),
  1,
  'unresolved failed DSR is retained for review despite overdue retention'
);
select extensions.is(
  (
    select count(*)::integer
    from public.account_erasure_requests
    where id = '00000000-0000-4000-8000-000000000764'
  ),
  0,
  'resolved expired account-erasure operation is purged'
);
select extensions.is(
  (
    select count(*)::integer
    from public.account_erasure_requests
    where id = '00000000-0000-4000-8000-000000000765'
      and status = 'failed'
  ),
  1,
  'failed expired account-erasure operation is retained for review'
);
select extensions.ok(
  (
    select
      help_row.user_id is null
      and help_row.contact_email <> 'erasure-purge-owner@example.test'
      and help_row.contact_email like 'purged-%@invalid.local'
      and position('00000000-0000-4000-8000-000000000764' in
        help_row.subject || help_row.message || help_row.metadata::text) = 0
      and position('erasure-purge-owner@example.test' in
        help_row.subject || help_row.message || help_row.metadata::text) = 0
      and help_row.metadata ->> 'record_state' = 'retention_purged'
    from public.help_requests help_row
    where help_row.id = '00000000-0000-4000-8000-000000000763'
  ),
  'erasure-linked help ticket is redacted before operation purge'
);
select extensions.is(
  (
    select purged_request_count
    from kc_private.data_subject_request_purge_aggregates
    where request_kind = 'account_erasure'
      and final_status = 'erased'
      and period_month = '2020-01-01'::date
  ),
  1::bigint,
  'private aggregate records only a non-identifying erasure count'
);
select extensions.ok(
  (
    select
      help_row.user_id is null
      and help_row.contact_email <> 'purge-owner@example.test'
      and help_row.contact_email like 'purged-%@invalid.local'
      and position('KC-DSR-20200101-ABCDEF0123456789' in
        help_row.subject || help_row.message || help_row.metadata::text) = 0
      and position('00000000-0000-4000-8000-000000000761' in
        help_row.subject || help_row.message || help_row.metadata::text) = 0
      and position('purge-owner@example.test' in
        help_row.subject || help_row.message || help_row.metadata::text) = 0
      and help_row.metadata ->> 'record_state' = 'retention_purged'
    from public.help_requests help_row
    where help_row.id = '00000000-0000-4000-8000-000000000760'
  ),
  'linked help ticket is redacted without protocol, DSR UUID or original e-mail'
);
select extensions.ok(
  (
    select scheduled
      or operational_alert is not null
    from kc_private.data_subject_request_retention_schedule_state
    where singleton
  ),
  'retention scheduler is either installed or exposes a durable operational alert'
);

select * from extensions.finish();

rollback;

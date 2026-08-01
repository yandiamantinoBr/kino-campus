-- Read-only production preflight for privacy, account erasure and data export.
-- Every returned column is a required boolean capability. Callers must reject
-- an empty response, a non-boolean value or any value other than true.
select
  pg_catalog.to_regclass(
    'public.account_erasure_requests'
  ) is not null as account_erasure_requests,
  pg_catalog.to_regclass('public.data_subject_requests') is not null
    as data_subject_requests,
  pg_catalog.to_regclass('public.data_subject_request_events') is not null
    as data_subject_request_events,
  pg_catalog.to_regclass('kc_private.data_export_artifacts') is not null
    as data_export_artifacts,
  pg_catalog.to_regclass('kc_private.data_export_processor_tasks') is not null
    as data_export_processor_tasks,
  pg_catalog.to_regclass(
    'kc_private.data_export_ticket_identity_links'
  ) is not null as data_export_ticket_identity_links,
  pg_catalog.to_regclass(
    'kc_private.account_erasure_ticket_identity_links'
  ) is not null as account_erasure_ticket_identity_links,
  pg_catalog.to_regclass('kc_private.data_export_media_refs') is not null
    as data_export_media_refs,
  pg_catalog.to_regclass(
    'kc_private.data_export_retention_runs'
  ) is not null as data_export_retention_runs,
  pg_catalog.to_regclass(
    'kc_private.data_export_retention_alerts'
  ) is not null as data_export_retention_alerts,
  pg_catalog.to_regclass(
    'kc_private.data_export_retention_schedule_state'
  ) is not null as data_export_retention_schedule_state,
  pg_catalog.to_regclass(
    'kc_private.data_subject_request_retention_schedule_state'
  ) is not null as data_subject_request_retention_schedule_state,
  pg_catalog.to_regclass(
    'kc_private.account_erasure_completion_outbox'
  ) is not null as account_erasure_completion_outbox,
  pg_catalog.to_regclass(
    'kc_private.account_erasure_completion_outbox_schedule_state'
  ) is not null as account_erasure_completion_outbox_schedule_state,
  pg_catalog.to_regclass(
    'kc_private.help_request_notification_claims'
  ) is not null as help_request_notification_claims,
  pg_catalog.to_regclass(
    'kc_private.help_notification_retention_schedule_state'
  ) is not null as help_notification_retention_schedule_state,
  pg_catalog.to_regclass(
    'public.post_engagement_rate_windows'
  ) is not null as post_engagement_rate_windows,
  pg_catalog.to_regprocedure(
    'public.kc_account_erasure_capabilities()'
  ) is not null
    and coalesce(
      pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'public.kc_account_erasure_capabilities()'
        )
      ) ~ $contract$'version'[[:space:]]*,[[:space:]]*5$contract$
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'public.kc_account_erasure_capabilities()'
        )
      ) like '%''pre_erasure_copy_gate'', true%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'public.kc_account_erasure_capabilities()'
        )
      ) like '%''export_artifact_erasure_purge'', true%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'public.kc_account_erasure_capabilities()'
        )
      ) like '%''encrypted_completion_outbox'', true%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'public.kc_account_erasure_capabilities()'
        )
      ) like '%''durable_subject_closure'', true%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'public.kc_account_erasure_capabilities()'
        )
      ) like '%''renewable_operation_lease'', true%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'public.kc_account_erasure_capabilities()'
        )
      ) like '%''admin_session_bound_claims'', true%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'public.kc_account_erasure_capabilities()'
        )
      ) like '%''atomic_workflow_upsert'', true%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'public.kc_account_erasure_capabilities()'
        )
      ) like '%''atomic_irreversible_dsr_transition'', true%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'public.kc_account_erasure_capabilities()'
        )
      ) like '%''durable_auth_delete_checkpoint'', true%',
      false
    ) as erasure_capabilities_v5,
  not coalesce(
    pg_catalog.has_table_privilege(
      'authenticated',
      'public.account_erasure_requests',
      'select'
    ),
    false
  )
    and not coalesce(
      pg_catalog.has_any_column_privilege(
        'authenticated',
        'public.account_erasure_requests',
        'select'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_table_privilege(
        'authenticated',
        'public.account_erasure_requests',
        'insert'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_table_privilege(
        'authenticated',
        'public.account_erasure_requests',
        'update'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_table_privilege(
        'authenticated',
        'public.account_erasure_requests',
        'delete'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_any_column_privilege(
        'authenticated',
        'public.account_erasure_requests',
        'insert'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_any_column_privilege(
        'authenticated',
        'public.account_erasure_requests',
        'update'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_table_privilege(
        'anon',
        'public.account_erasure_requests',
        'select'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_any_column_privilege(
        'anon',
        'public.account_erasure_requests',
        'select'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_table_privilege(
        'anon',
        'public.account_erasure_requests',
        'insert'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_table_privilege(
        'anon',
        'public.account_erasure_requests',
        'update'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_table_privilege(
        'anon',
        'public.account_erasure_requests',
        'delete'
      ),
      false
    )
    and coalesce(
      pg_catalog.has_table_privilege(
        'service_role',
        'public.account_erasure_requests',
        'select'
      ),
      false
    )
    and coalesce(
      pg_catalog.has_table_privilege(
        'service_role',
        'public.account_erasure_requests',
        'insert'
      ),
      false
    )
    and coalesce(
      pg_catalog.has_table_privilege(
        'service_role',
        'public.account_erasure_requests',
        'update'
      ),
      false
    )
    and coalesce(
      pg_catalog.has_table_privilege(
        'service_role',
        'public.account_erasure_requests',
        'delete'
      ),
      false
    )
    and coalesce(
      (
        select class_row.relrowsecurity
        from pg_catalog.pg_class class_row
        where class_row.oid = 'public.account_erasure_requests'::regclass
      ),
      false
    )
    and not exists (
      select 1
      from pg_catalog.pg_policy policy_row
      where policy_row.polrelid =
          'public.account_erasure_requests'::regclass
        and policy_row.polpermissive
        and policy_row.polcmd in ('r', 'a', 'w', 'd', '*')
        and (
          policy_row.polroles = array[0::oid]
          or policy_row.polroles && array[
            (
              select role_row.oid
              from pg_catalog.pg_roles role_row
              where role_row.rolname = 'authenticated'
            ),
            (
              select role_row.oid
              from pg_catalog.pg_roles role_row
              where role_row.rolname = 'anon'
            )
          ]::oid[]
        )
    ) as account_erasure_browser_acl_revoked,
  coalesce(
    (
      select
        procedure_row.prosecdef
        and procedure_row.proconfig @> array['search_path=""']
        and not pg_catalog.has_function_privilege(
          'service_role',
          procedure_row.oid,
          'execute'
        )
        and exists (
          select 1
          from pg_catalog.pg_trigger trigger_row
          where trigger_row.tgrelid = 'public.help_requests'::regclass
            and trigger_row.tgname =
              'trg_guard_account_erasure_help_status'
            and trigger_row.tgfoid = procedure_row.oid
            and not trigger_row.tgisinternal
            and trigger_row.tgenabled <> 'D'
        )
        and pg_catalog.pg_get_functiondef(procedure_row.oid) like
          '%ERASURE_HELP_MUST_REMAIN_OPEN%'
        and pg_catalog.pg_get_functiondef(procedure_row.oid) like
          '%completion_email_status%'
        and pg_catalog.pg_get_functiondef(procedure_row.oid) like
          '%sent_manual%'
        and pg_catalog.pg_get_functiondef(procedure_row.oid) like
          '%retention_purged%'
      from pg_catalog.pg_proc procedure_row
      where procedure_row.oid = pg_catalog.to_regprocedure(
        'kc_private.kc_guard_account_erasure_help_status()'
      )
    ),
    false
  ) as account_erasure_help_closure_guarded,
  pg_catalog.to_regprocedure(
    'public.kc_link_verified_help_request_to_account_erasure(uuid,text,uuid,uuid,text,text,timestamptz)'
  ) is not null
    and pg_catalog.to_regprocedure(
      'kc_private.kc_materialize_anonymous_erasure_dsr(uuid,text,uuid,uuid)'
    ) is not null
    and pg_catalog.to_regprocedure(
      'kc_private.kc_link_verified_help_request_to_account_erasure_strict_v1(uuid,text,uuid,uuid,text,text,timestamptz)'
    ) is not null
    and coalesce(
      (
        select procedure_row.prosecdef
          and procedure_row.proconfig = array['search_path=""']
        from pg_catalog.pg_proc procedure_row
        where procedure_row.oid = pg_catalog.to_regprocedure(
          'public.kc_link_verified_help_request_to_account_erasure(uuid,text,uuid,uuid,text,text,timestamptz)'
        )
      ),
      false
    )
    and coalesce(
      (
        select pg_catalog.bool_and(
          procedure_row.prosecdef
          and procedure_row.proconfig = array['search_path=""']
        )
        from pg_catalog.pg_proc procedure_row
        where procedure_row.oid in (
          pg_catalog.to_regprocedure(
            'kc_private.kc_materialize_anonymous_erasure_dsr(uuid,text,uuid,uuid)'
          ),
          pg_catalog.to_regprocedure(
            'kc_private.kc_link_verified_help_request_to_account_erasure_strict_v1(uuid,text,uuid,uuid,text,text,timestamptz)'
          )
        )
      ),
      false
    )
    and coalesce(
      pg_catalog.has_function_privilege(
        'service_role',
        pg_catalog.to_regprocedure(
          'public.kc_link_verified_help_request_to_account_erasure(uuid,text,uuid,uuid,text,text,timestamptz)'
        ),
        'execute'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_function_privilege(
        'service_role',
        pg_catalog.to_regprocedure(
          'kc_private.kc_materialize_anonymous_erasure_dsr(uuid,text,uuid,uuid)'
        ),
        'execute'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_function_privilege(
        'service_role',
        pg_catalog.to_regprocedure(
          'kc_private.kc_link_verified_help_request_to_account_erasure_strict_v1(uuid,text,uuid,uuid,text,text,timestamptz)'
        ),
        'execute'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_function_privilege(
        'authenticated',
        pg_catalog.to_regprocedure(
          'public.kc_link_verified_help_request_to_account_erasure(uuid,text,uuid,uuid,text,text,timestamptz)'
        ),
        'execute'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_function_privilege(
        'anon',
        pg_catalog.to_regprocedure(
          'public.kc_link_verified_help_request_to_account_erasure(uuid,text,uuid,uuid,text,text,timestamptz)'
        ),
        'execute'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_table_privilege(
        'service_role',
        'kc_private.account_erasure_ticket_identity_links',
        'select'
      ),
      false
    )
    and pg_catalog.to_regprocedure(
      'kc_private.kc_normalize_authenticated_privacy_help_email()'
    ) is not null
    and not coalesce(
      pg_catalog.has_function_privilege(
        'service_role',
        pg_catalog.to_regprocedure(
          'kc_private.kc_normalize_authenticated_privacy_help_email()'
        ),
        'execute'
      ),
      false
    )
    and exists (
      select 1
      from pg_catalog.pg_trigger trigger_row
      where trigger_row.tgrelid = 'public.help_requests'::regclass
        and trigger_row.tgname =
          'trg_normalize_authenticated_privacy_help_email'
        and trigger_row.tgfoid = pg_catalog.to_regprocedure(
          'kc_private.kc_normalize_authenticated_privacy_help_email()'
        )
        and not trigger_row.tgisinternal
        and trigger_row.tgenabled <> 'D'
    )
    and pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'kc_private.kc_normalize_authenticated_privacy_help_email()'
      )
    ) like '%new.user_id is null%'
    and not exists (
      select 1
      from information_schema.columns column_row
      where column_row.table_schema = 'kc_private'
        and column_row.table_name =
          'account_erasure_ticket_identity_links'
        and column_row.column_name in (
          'account_email',
          'email',
          'identity_reference',
          'reference',
          'raw_reference'
        )
    )
    and coalesce(
      pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'public.kc_link_verified_help_request_to_account_erasure(uuid,text,uuid,uuid,text,text,timestamptz)'
        )
      ) like '%auth.jwt()%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'public.kc_link_verified_help_request_to_account_erasure(uuid,text,uuid,uuid,text,text,timestamptz)'
        )
      ) like '%kc_materialize_anonymous_erasure_dsr%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'public.kc_link_verified_help_request_to_account_erasure(uuid,text,uuid,uuid,text,text,timestamptz)'
        )
      ) like '%kc_link_verified_help_request_to_account_erasure_strict_v1%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_materialize_anonymous_erasure_dsr(uuid,text,uuid,uuid)'
        )
      ) like '%kc_assert_active_admin_session%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_materialize_anonymous_erasure_dsr(uuid,text,uuid,uuid)'
        )
      ) like '%kc_lock_privacy_subject%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_link_verified_help_request_to_account_erasure_strict_v1(uuid,text,uuid,uuid,text,text,timestamptz)'
        )
      ) like '%ERASURE_IDENTITY_ACCOUNT_NOT_UNIQUE%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_link_verified_help_request_to_account_erasure_strict_v1(uuid,text,uuid,uuid,text,text,timestamptz)'
        )
      ) like '%attestation_hash%',
      false
    ) as account_erasure_identity_binder_safe,
  coalesce(
    (
      select
        wrapper_definition like '%auth.jwt()%'
        and pg_catalog.strpos(
          wrapper_definition,
          'kc_materialize_anonymous_erasure_dsr'
        ) > 0
        and pg_catalog.strpos(
          wrapper_definition,
          'kc_materialize_anonymous_erasure_dsr'
        ) < pg_catalog.strpos(
          wrapper_definition,
          'kc_link_verified_help_request_to_account_erasure_strict_v1'
        )
        and materializer_definition like
          '%ERASURE_IDENTITY_DSR_NOT_UNIQUE%'
        and materializer_definition like
          '%ERASURE_IDENTITY_DSR_MISMATCH%'
        and materializer_definition like
          '%ERASURE_IDENTITY_SUBJECT_CONFLICT%'
        and materializer_definition like
          '%extensions.gen_random_bytes(32)%'
        and materializer_definition like
          '%insert into public.data_subject_request_events%'
        and materializer_definition not like
          '%metadata ->> ''account_email''%'
        and strict_definition like
          '%account_erasure_ticket_identity_links%'
    from (
      select
        pg_catalog.pg_get_functiondef(
          pg_catalog.to_regprocedure(
            'public.kc_link_verified_help_request_to_account_erasure(uuid,text,uuid,uuid,text,text,timestamptz)'
          )
        ) as wrapper_definition,
        pg_catalog.pg_get_functiondef(
          pg_catalog.to_regprocedure(
            'kc_private.kc_materialize_anonymous_erasure_dsr(uuid,text,uuid,uuid)'
          )
        ) as materializer_definition,
        pg_catalog.pg_get_functiondef(
          pg_catalog.to_regprocedure(
            'kc_private.kc_link_verified_help_request_to_account_erasure_strict_v1(uuid,text,uuid,uuid,text,text,timestamptz)'
          )
        ) as strict_definition
    ) definitions
    ),
    false
  ) as anonymous_erasure_help_bridge_safe,
  pg_catalog.to_regprocedure(
    'kc_private.kc_create_data_subject_request_v2(text,text,text,text)'
  ) is not null
    and coalesce(
      (
        select
          pg_catalog.strpos(
            function_definition,
            'request_row.idempotency_key = v_idempotency_key'
          ) > 0
          and pg_catalog.strpos(
            function_definition,
            '''reuse_reason'', ''idempotency_key'''
          ) > pg_catalog.strpos(
            function_definition,
            'request_row.idempotency_key = v_idempotency_key'
          )
          and pg_catalog.strpos(
            function_definition,
            '''reuse_reason'', ''idempotency_key'''
          ) < pg_catalog.strpos(
            function_definition,
            'PRIVACY_SUBJECT_IRREVERSIBLY_CLOSING'
          )
          and function_definition like '%- ''user_id''%'
          and function_definition like '%- ''subject_hash''%'
          and function_definition like '%- ''idempotency_key''%'
        from (
          select pg_catalog.pg_get_functiondef(
            pg_catalog.to_regprocedure(
              'kc_private.kc_create_data_subject_request_v2(text,text,text,text)'
            )
          ) as function_definition
        ) definition
      ),
      false
    ) as terminal_dsr_idempotency_replay,
  pg_catalog.to_regprocedure(
    'public.kc_redact_account_audit_identifiers(uuid)'
  ) is not null as audit_identifier_redaction,
  pg_catalog.to_regprocedure(
    'public.kc_redact_account_audit_emails(text,text)'
  ) is not null as audit_email_redaction,
  pg_catalog.to_regprocedure(
    'public.kc_redact_account_help_requests(uuid[],text,jsonb)'
  ) is not null as help_request_redaction,
  pg_catalog.to_regprocedure(
    'public.kc_claim_account_erasure_irreversible_operation(uuid,text,integer,uuid,integer)'
  ) is not null as irreversible_erasure_claim,
  pg_catalog.to_regprocedure(
    'public.kc_transition_data_subject_request(uuid,text,text,uuid,text,text)'
  ) is not null as request_transition,
  pg_catalog.to_regprocedure(
    'public.kc_transition_data_subject_request_for_active_session(uuid,text,text,uuid,uuid,text,text)'
  ) is not null as active_session_request_transition,
  pg_catalog.to_regprocedure(
    'public.kc_claim_data_export_artifact(text,bigint,uuid,uuid,integer)'
  ) is not null as data_export_claim,
  exists (
    select 1
    from pg_catalog.pg_attribute attribute_row
    where attribute_row.attrelid =
        'kc_private.data_export_artifacts'::regclass
      and attribute_row.attname = 'claimed_session_id'
      and attribute_row.atttypid = 'uuid'::regtype
      and not attribute_row.attisdropped
  )
    and exists (
      select 1
      from pg_catalog.pg_trigger trigger_row
      where trigger_row.tgrelid =
          'kc_private.data_export_artifacts'::regclass
        and trigger_row.tgname =
          'data_export_artifact_claim_session_cleanup'
        and trigger_row.tgfoid = pg_catalog.to_regprocedure(
          'kc_private.kc_clear_inactive_export_claim_session()'
        )
        and not trigger_row.tgisinternal
        and trigger_row.tgenabled <> 'D'
    )
    and pg_catalog.to_regprocedure(
      'kc_private.kc_assert_active_data_export_admin_session(uuid,uuid)'
    ) is not null
    and not coalesce(
      pg_catalog.has_function_privilege(
        'service_role',
        pg_catalog.to_regprocedure(
          'kc_private.kc_assert_active_data_export_admin_session(uuid,uuid)'
        ),
        'execute'
      ),
      false
    ) as data_export_claim_session_binding,
  not exists (
    select 1
    from (
      values
        (
          'public.kc_admin_read_data_export_artifact(uuid,text,uuid,uuid)'
        ),
        (
          'public.kc_record_data_export_processor_evidence(text,bigint,uuid,uuid,text,text,text)'
        ),
        (
          'public.kc_record_data_export_processor_evidence(text,bigint,uuid,uuid,text,text,text,boolean,text,timestamptz)'
        ),
        (
          'public.kc_link_verified_help_request_to_data_export(uuid,text,text,uuid,uuid,text,text,timestamptz,jsonb)'
        ),
        (
          'public.kc_recover_expired_data_export_artifact(text,bigint,uuid,uuid,integer)'
        ),
        (
          'public.kc_claim_data_export_artifact(text,bigint,uuid,uuid,integer)'
        ),
        (
          'public.kc_claim_expired_data_export_artifacts(integer,uuid,uuid)'
        ),
        (
          'public.kc_claim_data_export_artifact_purge(text,bigint,uuid,uuid)'
        ),
        (
          'public.kc_purge_data_export_artifact(text,bigint,uuid,uuid)'
        )
    ) signature_row(signature)
    where pg_catalog.to_regprocedure(signature_row.signature) is null
      or not coalesce(
        pg_catalog.has_function_privilege(
          'service_role',
          pg_catalog.to_regprocedure(signature_row.signature),
          'execute'
        ),
        false
      )
      or coalesce(
        pg_catalog.has_function_privilege(
          'anon',
          pg_catalog.to_regprocedure(signature_row.signature),
          'execute'
        ),
        false
      )
      or coalesce(
        pg_catalog.has_function_privilege(
          'authenticated',
          pg_catalog.to_regprocedure(signature_row.signature),
          'execute'
        ),
        false
      )
  ) as session_bound_data_export_admin_rpcs,
  not exists (
    select 1
    from (
      values
        (
          'public.kc_admin_read_data_export_artifact(uuid,text,uuid)'
        ),
        (
          'public.kc_record_data_export_processor_evidence(text,bigint,uuid,text,text,text)'
        ),
        (
          'public.kc_link_verified_help_request_to_data_export(uuid,text,text,uuid,text,text,timestamptz,jsonb)'
        ),
        (
          'public.kc_recover_expired_data_export_artifact(text,bigint,uuid,integer)'
        ),
        (
          'public.kc_claim_data_export_artifact(text,bigint,uuid,integer)'
        ),
        (
          'public.kc_claim_expired_data_export_artifacts(integer,uuid)'
        ),
        (
          'public.kc_claim_data_export_artifact_purge(text,bigint,uuid)'
        ),
        (
          'public.kc_purge_data_export_artifact(text,bigint,uuid)'
        )
    ) signature_row(signature)
    where pg_catalog.to_regprocedure(signature_row.signature) is null
      or not coalesce(
        pg_catalog.has_function_privilege(
          'service_role',
          pg_catalog.to_regprocedure(signature_row.signature),
          'execute'
        ),
        false
      )
      or coalesce(
        pg_catalog.has_function_privilege(
          'anon',
          pg_catalog.to_regprocedure(signature_row.signature),
          'execute'
        ),
        false
      )
      or coalesce(
        pg_catalog.has_function_privilege(
          'authenticated',
          pg_catalog.to_regprocedure(signature_row.signature),
          'execute'
        ),
        false
      )
      or coalesce(
        pg_catalog.obj_description(
          pg_catalog.to_regprocedure(signature_row.signature)::oid,
          'pg_proc'
        ),
        ''
      ) not like 'CONTRACT DEFERRED:%'
      or pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(signature_row.signature)
      ) not like '%kc_resolve_legacy_data_export_admin_session%'
  )
    and exists (
      select 1
      from pg_catalog.pg_proc procedure_row
      where procedure_row.oid = pg_catalog.to_regprocedure(
          'kc_private.kc_resolve_legacy_data_export_admin_session(uuid)'
        )
        and procedure_row.prosecdef
        and lower(pg_catalog.pg_get_functiondef(procedure_row.oid))
          like '%auth.sessions%'
        and lower(pg_catalog.pg_get_functiondef(procedure_row.oid))
          like '%not_after%'
        and lower(pg_catalog.pg_get_functiondef(procedure_row.oid))
          like '%clock_timestamp()%'
        and lower(pg_catalog.pg_get_functiondef(procedure_row.oid))
          like '%cardinality(v_session_ids) <> 1%'
        and lower(pg_catalog.pg_get_functiondef(procedure_row.oid))
          like '%kc_assert_active_data_export_admin_session%'
    )
    and exists (
      select 1
      from pg_catalog.pg_proc procedure_row
      where procedure_row.oid = pg_catalog.to_regprocedure(
          'kc_private.kc_assert_active_data_export_admin_session(uuid,uuid)'
        )
        and procedure_row.prosecdef
        and lower(pg_catalog.pg_get_functiondef(procedure_row.oid))
          like '%for share%'
    )
    and not exists (
      select 1
      from (
        values
          ('anon'::name),
          ('authenticated'::name),
          ('service_role'::name)
      ) role_row(role_name)
      where coalesce(
        pg_catalog.has_function_privilege(
          role_row.role_name,
          pg_catalog.to_regprocedure(
            'kc_private.kc_resolve_legacy_data_export_admin_session(uuid)'
          ),
          'execute'
        ),
        false
      )
    ) as legacy_data_export_admin_compatibility_guarded,
  not exists (
    select 1
    from (
      values
        (
          'kc_private.kc_admin_read_data_export_artifact(uuid,text,uuid)'
        ),
        (
          'kc_private.kc_record_data_export_processor_evidence(text,bigint,uuid,text,text,text)'
        ),
        (
          'kc_private.kc_record_data_export_processor_evidence_v2(text,bigint,uuid,text,text,text,boolean,text,timestamptz)'
        ),
        (
          'kc_private.kc_link_verified_help_request_to_data_export(uuid,text,text,uuid,text,text,timestamptz,jsonb)'
        ),
        (
          'kc_private.kc_recover_expired_data_export_artifact(text,bigint,uuid,integer)'
        ),
        (
          'kc_private.kc_claim_data_export_artifact(text,bigint,uuid,integer)'
        ),
        (
          'kc_private.kc_store_data_export_media_refs(text,bigint,text,jsonb)'
        ),
        (
          'kc_private.kc_authorize_data_export_artifact_upload(text,bigint,text,integer)'
        ),
        (
          'kc_private.kc_finalize_data_export_artifact(text,bigint,text,text,bigint,jsonb,integer)'
        ),
        (
          'kc_private.kc_fail_data_export_artifact(text,bigint,text,text)'
        ),
        (
          'kc_private.kc_claim_expired_data_export_artifacts(integer,uuid)'
        ),
        (
          'kc_private.kc_claim_data_export_artifact_purge(text,bigint,uuid)'
        ),
        (
          'kc_private.kc_purge_data_export_artifact(text,bigint,uuid)'
        ),
        (
          'kc_private.kc_resolve_legacy_data_export_admin_session(uuid)'
        ),
        (
          'kc_private.kc_bind_or_assert_data_export_claim_session(text,bigint,text)'
        ),
        (
          'kc_private.kc_assert_active_data_export_owner_session(uuid,uuid)'
        ),
        (
          'kc_private.kc_data_export_owner_delivery_is_eligible(uuid,uuid)'
        ),
        (
          'kc_private.kc_data_export_artifact_shape(kc_private.data_export_artifacts)'
        ),
        (
          'kc_private.kc_reserve_data_export_artifact_download(text,bigint,uuid,uuid,integer)'
        ),
        (
          'kc_private.kc_read_data_export_media_refs_for_download(text,bigint,uuid,uuid,text)'
        ),
        (
          'kc_private.kc_consume_data_export_artifact_download(text,bigint,uuid,uuid,text,text,bigint)'
        ),
        (
          'kc_private.kc_read_data_export_artifact_for_owner(uuid,uuid)'
        ),
        (
          'kc_private.kc_transition_data_subject_request_for_active_session(uuid,text,text,uuid,uuid,text,text)'
        )
    ) signature_row(signature)
    cross join (
      values
        ('anon'::name),
        ('authenticated'::name),
        ('service_role'::name)
    ) role_row(role_name)
    where pg_catalog.to_regprocedure(signature_row.signature) is null
      or coalesce(
        pg_catalog.has_function_privilege(
          role_row.role_name,
          pg_catalog.to_regprocedure(signature_row.signature),
          'execute'
        ),
        false
      )
  ) as private_data_export_workers_closed,
  pg_catalog.to_regprocedure(
    'kc_private.kc_bind_or_assert_data_export_claim_session(text,bigint,text)'
  ) is not null
    and not exists (
      select 1
      from (
        values
          (
            'public.kc_store_data_export_media_refs(text,bigint,text,jsonb)'
          ),
          (
            'public.kc_authorize_data_export_artifact_upload(text,bigint,text,integer)'
          ),
          (
            'public.kc_finalize_data_export_artifact(text,bigint,text,text,bigint,jsonb,integer)'
          )
      ) signature_row(signature)
      where pg_catalog.to_regprocedure(signature_row.signature) is null
        or pg_catalog.pg_get_functiondef(
          pg_catalog.to_regprocedure(signature_row.signature)
        ) not like '%kc_bind_or_assert_data_export_claim_session%'
    )
    and pg_catalog.to_regprocedure(
      'public.kc_fail_data_export_artifact(text,bigint,text,text)'
    ) is not null
    and coalesce(
      pg_catalog.has_function_privilege(
        'service_role',
        pg_catalog.to_regprocedure(
          'public.kc_fail_data_export_artifact(text,bigint,text,text)'
        ),
        'execute'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_function_privilege(
        'anon',
        pg_catalog.to_regprocedure(
          'public.kc_fail_data_export_artifact(text,bigint,text,text)'
        ),
        'execute'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_function_privilege(
        'authenticated',
        pg_catalog.to_regprocedure(
          'public.kc_fail_data_export_artifact(text,bigint,text,text)'
        ),
        'execute'
      ),
      false
    )
    and lower(
      coalesce(
        pg_catalog.obj_description(
          pg_catalog.to_regprocedure(
            'public.kc_fail_data_export_artifact(text,bigint,text,text)'
          )::oid,
          'pg_proc'
        ),
        ''
      )
    ) like '%abandonment-only%'
    as data_export_continuation_session_guards,
  pg_catalog.to_regprocedure(
    'public.kc_finalize_data_export_artifact(text,bigint,text,text,bigint,jsonb,integer)'
  ) is not null as data_export_finalize,
  pg_catalog.to_regprocedure(
    'public.kc_consume_data_export_artifact_download(text,bigint,uuid,uuid,text,text,bigint)'
  ) is not null as data_export_consume,
  (
    select count(*) = 2
    from pg_catalog.pg_attribute attribute_row
    where attribute_row.attrelid =
        'kc_private.data_export_artifacts'::regclass
      and attribute_row.attname in (
        'download_return_status',
        'delivery_count'
      )
      and not attribute_row.attisdropped
  )
    and (
      select count(*) = 3
      from pg_catalog.pg_attribute attribute_row
      where attribute_row.attrelid =
          'kc_private.data_export_processor_tasks'::regclass
        and attribute_row.attname in (
          'delivery_attested',
          'delivery_channel',
          'delivered_out_of_band_at'
        )
        and not attribute_row.attisdropped
    )
    and pg_catalog.to_regprocedure(
      'kc_private.kc_assert_active_data_export_owner_session(uuid,uuid)'
    ) is not null
    and lower(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'kc_private.kc_assert_active_data_export_owner_session(uuid,uuid)'
      )
    )) like '%not_after%'
    and lower(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'kc_private.kc_assert_active_data_export_owner_session(uuid,uuid)'
      )
    )) like '%clock_timestamp()%'
    and lower(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'kc_private.kc_assert_active_data_export_owner_session(uuid,uuid)'
      )
    )) like '%for share%'
    and lower(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'kc_private.kc_data_export_owner_delivery_is_eligible(uuid,uuid)'
      )
    )) like '%request_kind = ''account_erasure''%'
    and lower(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'kc_private.kc_data_export_owner_delivery_is_eligible(uuid,uuid)'
      )
    )) like '%not exists%'
    and not exists (
      select 1
      from (
        values
          (
            'kc_private.kc_reserve_data_export_artifact_download(text,bigint,uuid,uuid,integer)'
          ),
          (
            'kc_private.kc_read_data_export_media_refs_for_download(text,bigint,uuid,uuid,text)'
          ),
          (
            'kc_private.kc_consume_data_export_artifact_download(text,bigint,uuid,uuid,text,text,bigint)'
          )
      ) session_function(signature)
      where lower(pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(session_function.signature)
      )) not like '%kc_assert_active_data_export_owner_session%'
    )
    and lower(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'kc_private.kc_reserve_data_export_artifact_download(text,bigint,uuid,uuid,integer)'
      )
    )) like '%v_media_ref_count > 100%'
    and lower(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.kc_store_data_export_media_refs(text,bigint,text,jsonb)'
      )
    )) like '%jsonb_array_length(p_media_refs) > 100%'
    and coalesce(
      pg_catalog.has_function_privilege(
        'service_role',
        pg_catalog.to_regprocedure(
          'public.kc_store_data_export_media_refs(text,bigint,text,jsonb)'
        ),
        'execute'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_function_privilege(
        'authenticated',
        pg_catalog.to_regprocedure(
          'public.kc_store_data_export_media_refs(text,bigint,text,jsonb)'
        ),
        'execute'
      ),
      false
    )
    and lower(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'kc_private.kc_reserve_data_export_artifact_download(text,bigint,uuid,uuid,integer)'
      )
    )) like '%status not in (''ready'', ''delivered'')%'
    and lower(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'kc_private.kc_read_data_export_artifact_for_owner(uuid,uuid)'
      )
    )) like '%download_return_status = ''delivered''%'
    and lower(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'kc_private.kc_claim_expired_data_export_artifacts(integer,uuid)'
      )
    )) like '%artifact_row.status = ''delivered''%artifact_row.expires_at%'
    and lower(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'kc_private.kc_claim_expired_data_export_artifacts(integer,uuid)'
      )
    )) not like '%delivered_at <= v_now - interval ''1 hour''%'
    and pg_catalog.to_regprocedure(
      'public.kc_record_data_export_processor_evidence(text,bigint,uuid,uuid,text,text,text,boolean,text,timestamptz)'
    ) is not null
    and lower(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'kc_private.kc_record_data_export_processor_evidence_v2(text,bigint,uuid,text,text,text,boolean,text,timestamptz)'
      )
    )) like '%supplied_out_of_band%'
    and lower(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'kc_private.kc_record_data_export_processor_evidence_v2(text,bigint,uuid,text,text,text,boolean,text,timestamptz)'
      )
    )) like '%delivery_attested%'
    and coalesce(
      pg_catalog.has_function_privilege(
        'service_role',
        pg_catalog.to_regprocedure(
          'public.kc_record_data_export_processor_evidence(text,bigint,uuid,uuid,text,text,text,boolean,text,timestamptz)'
        ),
        'execute'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_function_privilege(
        'authenticated',
        pg_catalog.to_regprocedure(
          'public.kc_record_data_export_processor_evidence(text,bigint,uuid,uuid,text,text,text,boolean,text,timestamptz)'
        ),
        'execute'
      ),
      false
    ) as hardened_data_export_delivery,
  pg_catalog.to_regprocedure(
    'public.kc_claim_data_export_artifacts_for_erasure(uuid,uuid,integer)'
  ) is not null as data_export_erasure_claim,
  pg_catalog.to_regprocedure(
    'public.kc_complete_data_export_artifact_erasure_purge(text,bigint,uuid)'
  ) is not null as data_export_erasure_complete,
  pg_catalog.to_regprocedure(
    'public.kc_release_data_export_artifact_erasure_purge(text,bigint,uuid,text)'
  ) is not null as data_export_erasure_release,
  pg_catalog.to_regprocedure(
    'public.kc_create_help_request_with_notification_claim(jsonb)'
  ) is not null as help_request_create_with_claim,
  pg_catalog.to_regprocedure(
    'public.kc_create_help_request_with_notification_claim_v2(jsonb)'
  ) is not null as help_request_create_with_claim_v2,
  coalesce(
    pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'kc_private.kc_create_help_request_with_notification_claim_v2(jsonb)'
      )
    ) like '%HELP_PRIVACY_IDEMPOTENT_RPC_REQUIRED%'
    and pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'kc_private.kc_help_request_v2_20260729_idempotency_base(jsonb)'
      )
    ) like '%expected_auth_state%'
    and pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'kc_private.kc_help_request_v2_20260729_idempotency_base(jsonb)'
      )
    ) like '%AUTH_ACCOUNT_CHANGED%'
    and pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'kc_private.kc_help_request_v2_20260729_idempotency_base(jsonb)'
      )
    ) like '%kc_is_current_session_active%'
    and pg_catalog.to_regprocedure(
      'kc_private.kc_help_request_v2_20260729_idempotency_base(jsonb)'
    ) is not null,
    false
  ) as help_request_expected_auth_state_bound,
  coalesce(
    (
      pg_catalog.to_regclass(
        'kc_private.help_privacy_submission_idempotency'
      ) is not null
      and pg_catalog.to_regclass(
        'kc_private.help_privacy_recovery_rate_buckets'
      ) is not null
      and pg_catalog.to_regclass(
        'kc_private.help_privacy_guest_rate_buckets'
      ) is not null
      and coalesce(
        (
          select replay_class.relrowsecurity
          from pg_catalog.pg_class replay_class
          where replay_class.oid = pg_catalog.to_regclass(
            'kc_private.help_privacy_submission_idempotency'
          )
        ),
        false
      )
      and coalesce(
        (
          select rate_class.relrowsecurity
          from pg_catalog.pg_class rate_class
          where rate_class.oid = pg_catalog.to_regclass(
            'kc_private.help_privacy_recovery_rate_buckets'
          )
        ),
        false
      )
      and coalesce(
        (
          select guest_rate_class.relrowsecurity
          from pg_catalog.pg_class guest_rate_class
          where guest_rate_class.oid = pg_catalog.to_regclass(
            'kc_private.help_privacy_guest_rate_buckets'
          )
        ),
        false
      )
      and not exists (
        -- Direct privacy create is intentionally absent here: anon EXECUTE is
        -- valid only during EXPAND. Its authenticated/service invariants and
        -- phase-dependent anon ACL are enforced by
        -- privacy_help_guest_gateway_acl_phase_safe below.
        select 1
        from (
          values
            ('key_hash'),
            ('payload_fingerprint'),
            ('caller_scope_hash'),
            ('caller_user_id'),
            ('auth_state'),
            ('request_kind'),
            ('lifecycle_state'),
            ('help_request_id'),
            ('response_created_at'),
            ('data_subject_request_id'),
            ('response_protocol'),
            ('response_reused_existing'),
            ('retired_at'),
            ('created_at')
        ) expected_column(column_name)
        where not exists (
          select 1
          from information_schema.columns column_row
          where column_row.table_schema = 'kc_private'
            and column_row.table_name =
              'help_privacy_submission_idempotency'
            and column_row.column_name = expected_column.column_name
        )
      )
      and not exists (
        select 1
        from (
          values
            ('caller_scope_hash'),
            ('caller_user_id'),
            ('window_started_at'),
            ('attempts'),
            ('updated_at')
        ) expected_column(column_name)
        where not exists (
          select 1
          from information_schema.columns column_row
          where column_row.table_schema = 'kc_private'
            and column_row.table_name =
              'help_privacy_recovery_rate_buckets'
            and column_row.column_name = expected_column.column_name
        )
      )
      and not exists (
        select 1
        from (
          values
            ('window_started_at'),
            ('attempts'),
            ('updated_at')
        ) expected_column(column_name)
        where not exists (
          select 1
          from information_schema.columns column_row
          where column_row.table_schema = 'kc_private'
            and column_row.table_name =
              'help_privacy_guest_rate_buckets'
            and column_row.column_name = expected_column.column_name
        )
      )
      and not exists (
        select 1
        from information_schema.columns column_row
        where column_row.table_schema = 'kc_private'
          and column_row.table_name in (
            'help_privacy_submission_idempotency',
            'help_privacy_recovery_rate_buckets',
            'help_privacy_guest_rate_buckets'
          )
          and column_row.column_name in (
            'idempotency_key',
            'raw_key',
            'payload',
            'subject',
            'message',
            'contact_email',
            'account_email'
          )
      )
      and not exists (
        select 1
        from (
          values
            ('anon'::name),
            ('authenticated'::name),
            ('service_role'::name)
        ) role_row(role_name)
        cross join (
          values
            (
              pg_catalog.to_regclass(
                'kc_private.help_privacy_submission_idempotency'
              )
            ),
            (
              pg_catalog.to_regclass(
                'kc_private.help_privacy_recovery_rate_buckets'
              )
            ),
            (
              pg_catalog.to_regclass(
                'kc_private.help_privacy_guest_rate_buckets'
              )
            )
        ) table_row(table_oid)
        where coalesce(
          pg_catalog.has_table_privilege(
            role_row.role_name,
            table_row.table_oid,
            'select'
          ),
          false
        )
          or coalesce(
            pg_catalog.has_table_privilege(
              role_row.role_name,
              table_row.table_oid,
              'insert'
            ),
            false
          )
          or coalesce(
            pg_catalog.has_table_privilege(
              role_row.role_name,
              table_row.table_oid,
              'update'
            ),
            false
          )
          or coalesce(
            pg_catalog.has_table_privilege(
              role_row.role_name,
              table_row.table_oid,
              'delete'
            ),
            false
          )
      )
      and (
        select pg_catalog.count(*) = 3
        from pg_catalog.pg_constraint constraint_row
        where constraint_row.conrelid = pg_catalog.to_regclass(
          'kc_private.help_privacy_submission_idempotency'
        )
          and constraint_row.contype = 'f'
          and constraint_row.confdeltype = 'c'
          and constraint_row.confrelid in (
            pg_catalog.to_regclass('auth.users'),
            pg_catalog.to_regclass('public.help_requests'),
            pg_catalog.to_regclass('public.data_subject_requests')
          )
      )
      and (
        select pg_catalog.count(*) = 1
        from pg_catalog.pg_constraint constraint_row
        where constraint_row.conrelid = pg_catalog.to_regclass(
          'kc_private.help_privacy_recovery_rate_buckets'
        )
          and constraint_row.contype = 'f'
          and constraint_row.confdeltype = 'c'
          and constraint_row.confrelid =
            pg_catalog.to_regclass('auth.users')
      )
      and not exists (
        select 1
        from (
          values
            ('help_privacy_submission_response_shape_check'),
            ('help_privacy_submission_response_protocol_check')
        ) expected_constraint(constraint_name)
        where not exists (
          select 1
          from pg_catalog.pg_constraint constraint_row
          where constraint_row.conrelid = pg_catalog.to_regclass(
            'kc_private.help_privacy_submission_idempotency'
          )
            and constraint_row.conname =
              expected_constraint.constraint_name
            and constraint_row.contype = 'c'
            and constraint_row.convalidated
        )
      )
      and exists (
        select 1
        from pg_catalog.pg_constraint constraint_row
        where constraint_row.conrelid = pg_catalog.to_regclass(
          'kc_private.help_privacy_recovery_rate_buckets'
        )
          and constraint_row.conname =
            'help_privacy_recovery_rate_attempts_check'
          and constraint_row.contype = 'c'
          and constraint_row.convalidated
          and pg_catalog.pg_get_constraintdef(
            constraint_row.oid,
            true
          ) like '%attempts >= 1%'
          and pg_catalog.pg_get_constraintdef(
            constraint_row.oid,
            true
          ) like '%attempts <= 25%'
      )
      and exists (
        select 1
        from pg_catalog.pg_constraint constraint_row
        where constraint_row.conrelid = pg_catalog.to_regclass(
          'kc_private.help_privacy_guest_rate_buckets'
        )
          and constraint_row.conname =
            'help_privacy_guest_rate_attempts_check'
          and constraint_row.contype = 'c'
          and constraint_row.convalidated
          and pg_catalog.pg_get_constraintdef(
            constraint_row.oid,
            true
          ) like '%attempts >= 1%'
          and pg_catalog.pg_get_constraintdef(
            constraint_row.oid,
            true
          ) like '%attempts <= 10000%'
      )
    ),
    false
  ) as privacy_help_idempotency_schema_safe,
  coalesce(
    (
      select pg_catalog.bool_and(index_requirement.present)
      from (
        values
          (
            'kc_private.help_privacy_submission_idempotency',
            'caller_user_id'
          ),
          (
            'kc_private.help_privacy_submission_idempotency',
            'data_subject_request_id'
          ),
          (
            'kc_private.help_privacy_recovery_rate_buckets',
            'caller_user_id'
          ),
          (
            'kc_private.help_privacy_recovery_rate_buckets',
            'window_started_at'
          )
      ) expected_index(table_name, column_name)
      cross join lateral (
        select exists (
          select 1
          from pg_catalog.pg_index index_row
          join pg_catalog.pg_attribute attribute_row
            on attribute_row.attrelid = index_row.indrelid
           and attribute_row.attnum = index_row.indkey[0]
          where index_row.indrelid =
              pg_catalog.to_regclass(expected_index.table_name)
            and index_row.indisvalid
            and index_row.indisready
            and attribute_row.attname = expected_index.column_name
        ) as present
      ) index_requirement
    ),
    false
  ) as privacy_help_idempotency_fk_indexes,
  coalesce(
    (
      pg_catalog.to_regprocedure(
        'public.kc_create_privacy_help_request_v1(jsonb)'
      ) is not null
      and pg_catalog.to_regprocedure(
        'public.kc_recover_privacy_help_request_v1(jsonb)'
      ) is not null
      and pg_catalog.to_regprocedure(
        'public.kc_create_help_request(jsonb)'
      ) is not null
      and pg_catalog.to_regprocedure(
        'public.kc_create_help_request_with_notification_claim(jsonb)'
      ) is not null
      and pg_catalog.to_regprocedure(
        'public.kc_create_help_request_with_notification_claim_v2(jsonb)'
      ) is not null
      and pg_catalog.to_regprocedure(
        'kc_private.kc_is_privacy_help_route_v1(jsonb)'
      ) is not null
      and pg_catalog.to_regprocedure(
        'kc_private.kc_assert_current_authenticated_session_active()'
      ) is not null
      and pg_catalog.to_regprocedure(
        'kc_private.kc_privacy_help_metadata_v1(jsonb,text)'
      ) is not null
      and coalesce(
        (
          select pg_catalog.bool_and(
            procedure_row.prosecdef
            and procedure_row.proconfig = array['search_path=""']
          )
          from pg_catalog.pg_proc procedure_row
          where procedure_row.oid in (
            pg_catalog.to_regprocedure(
              'public.kc_create_privacy_help_request_v1(jsonb)'
            ),
            pg_catalog.to_regprocedure(
              'public.kc_recover_privacy_help_request_v1(jsonb)'
            ),
            pg_catalog.to_regprocedure(
              'public.kc_create_help_request(jsonb)'
            ),
            pg_catalog.to_regprocedure(
              'public.kc_create_help_request_with_notification_claim(jsonb)'
            ),
            pg_catalog.to_regprocedure(
              'public.kc_create_help_request_with_notification_claim_v2(jsonb)'
            ),
            pg_catalog.to_regprocedure(
              'kc_private.kc_assert_current_authenticated_session_active()'
            )
          )
        ),
        false
      )
      and not exists (
        select 1
        from (
          values
            ('anon'::name),
            ('authenticated'::name),
            ('service_role'::name)
        ) role_row(role_name)
        cross join (
          values
            (
              pg_catalog.to_regprocedure(
                'public.kc_recover_privacy_help_request_v1(jsonb)'
              )
            ),
            (
              pg_catalog.to_regprocedure(
                'public.kc_create_help_request(jsonb)'
              )
            ),
            (
              pg_catalog.to_regprocedure(
                'public.kc_create_help_request_with_notification_claim(jsonb)'
              )
            ),
            (
              pg_catalog.to_regprocedure(
                'public.kc_create_help_request_with_notification_claim_v2(jsonb)'
              )
            )
        ) procedure_row(procedure_oid)
        where not coalesce(
          pg_catalog.has_function_privilege(
            role_row.role_name,
            procedure_row.procedure_oid,
            'execute'
          ),
          false
        )
      )
      and not exists (
        select 1
        from pg_catalog.pg_proc procedure_row
        cross join lateral pg_catalog.aclexplode(
          coalesce(
            procedure_row.proacl,
            pg_catalog.acldefault('f', procedure_row.proowner)
          )
        ) acl_row
        where procedure_row.oid in (
          pg_catalog.to_regprocedure(
            'public.kc_create_privacy_help_request_v1(jsonb)'
          ),
          pg_catalog.to_regprocedure(
            'public.kc_recover_privacy_help_request_v1(jsonb)'
          ),
          pg_catalog.to_regprocedure(
            'public.kc_create_help_request(jsonb)'
          ),
          pg_catalog.to_regprocedure(
            'public.kc_create_help_request_with_notification_claim(jsonb)'
          ),
          pg_catalog.to_regprocedure(
            'public.kc_create_help_request_with_notification_claim_v2(jsonb)'
          )
        )
          and acl_row.grantee = 0
          and acl_row.privilege_type = 'EXECUTE'
      )
      and not exists (
        select 1
        from (
          values
            ('anon'::name),
            ('authenticated'::name),
            ('service_role'::name)
        ) role_row(role_name)
        cross join (
          values
            (
              'kc_private.kc_create_privacy_help_request_v1(jsonb)'
            ),
            (
              'kc_private.kc_recover_privacy_help_request_v1(jsonb)'
            ),
            (
              'kc_private.kc_help_request_v2_20260729_idempotency_base(jsonb)'
            ),
            (
              'kc_private.kc_create_help_request(jsonb)'
            ),
            (
              'kc_private.kc_create_help_request_with_notification_claim(jsonb)'
            ),
            (
              'kc_private.kc_create_help_request_with_notification_claim_v2(jsonb)'
            ),
            (
              'kc_private.kc_is_privacy_help_route_v1(jsonb)'
            ),
            (
              'kc_private.kc_privacy_help_metadata_v1(jsonb,text)'
            ),
            (
              'kc_private.kc_privacy_help_payload_fingerprint(jsonb)'
            ),
            (
              'kc_private.kc_assert_current_anonymous_session_active()'
            ),
            (
              'kc_private.kc_assert_current_authenticated_session_active()'
            ),
            (
              'kc_private.kc_cleanup_privacy_help_tombstones_v1(integer)'
            ),
            (
              'kc_private.kc_drop_privacy_help_replay_after_redaction_v1()'
            )
        ) procedure_row(procedure_name)
        where pg_catalog.to_regprocedure(
          procedure_row.procedure_name
        ) is null
          or coalesce(
            pg_catalog.has_function_privilege(
              role_row.role_name,
              pg_catalog.to_regprocedure(
                procedure_row.procedure_name
              ),
              'execute'
            ),
            false
          )
      )
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_assert_current_authenticated_session_active()'
        )
      ) like '%auth.uid()%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_assert_current_authenticated_session_active()'
        )
      ) like '%auth.jwt() ->> ''session_id''%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_assert_current_authenticated_session_active()'
        )
      ) like '%from auth.users user_row%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_assert_current_authenticated_session_active()'
        )
      ) like '%join auth.sessions session_row%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_assert_current_authenticated_session_active()'
        )
      ) like '%session_row.user_id = user_row.id%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_assert_current_authenticated_session_active()'
        )
      ) like '%user_row.id = v_uid%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_assert_current_authenticated_session_active()'
        )
      ) like '%coalesce(user_row.is_anonymous, false) is false%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_assert_current_authenticated_session_active()'
        )
      ) like '%user_row.deleted_at is null%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_assert_current_authenticated_session_active()'
        )
      ) like '%session_row.id = v_session_id::uuid%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_assert_current_authenticated_session_active()'
        )
      ) like '%session_row.not_after is null%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_assert_current_authenticated_session_active()'
        )
      ) like '%session_row.not_after > pg_catalog.clock_timestamp()%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_assert_current_authenticated_session_active()'
        )
      ) like '%for share of user_row, session_row%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_assert_current_authenticated_session_active()'
        )
      ) like '%AUTH_SESSION_NOT_ACTIVE%'
      and coalesce(
        (
          select pg_catalog.bool_and(
            pg_catalog.strpos(
              procedure_row.prosrc,
              'if v_expected_auth_state = ''authenticated'' then'
            ) > 0
            and pg_catalog.strpos(
              procedure_row.prosrc,
              'kc_assert_current_authenticated_session_active()'
            ) > pg_catalog.strpos(
              procedure_row.prosrc,
              'if v_expected_auth_state = ''authenticated'' then'
            )
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
        false
      )
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_create_privacy_help_request_v1(jsonb)'
        )
      ) like '%privacy-help-idempotency:%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_create_privacy_help_request_v1(jsonb)'
        )
      ) like '%kc_help_request_v2_20260729_idempotency_base%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_create_privacy_help_request_v1(jsonb)'
        )
      ) like '%kc_privacy_help_metadata_v1%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_privacy_help_payload_fingerprint(jsonb)'
        )
      ) like '%kc_privacy_help_metadata_v1%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_privacy_help_metadata_v1(jsonb,text)'
        )
      ) like '%''route''%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_privacy_help_metadata_v1(jsonb,text)'
        )
      ) like '%''source''%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_privacy_help_metadata_v1(jsonb,text)'
        )
      ) like '%''account_email''%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_privacy_help_metadata_v1(jsonb,text)'
        )
      ) not like '%''record_state''%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_privacy_help_metadata_v1(jsonb,text)'
        )
      ) not like '%''lgpd_erasure''%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_recover_privacy_help_request_v1(jsonb)'
        )
      ) like '%help_privacy_recovery_rate_buckets%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_recover_privacy_help_request_v1(jsonb)'
        )
      ) like '%out_recovery_state := ''recovered''%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_recover_privacy_help_request_v1(jsonb)'
        )
      ) like '%out_recovery_state := ''retired''%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_recover_privacy_help_request_v1(jsonb)'
        )
      ) like '%out_recovery_state := ''ambiguous''%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_create_help_request_with_notification_claim_v2(jsonb)'
        )
      ) like '%HELP_PRIVACY_IDEMPOTENT_RPC_REQUIRED%'
      and coalesce(
        (
          select pg_catalog.bool_and(
            pg_catalog.pg_get_functiondef(procedure_row.oid)
              like '%kc_is_privacy_help_route_v1%'
            and pg_catalog.pg_get_functiondef(procedure_row.oid)
              like '%HELP_PRIVACY_IDEMPOTENT_RPC_REQUIRED%'
          )
          from pg_catalog.pg_proc procedure_row
          where procedure_row.oid in (
            pg_catalog.to_regprocedure(
              'public.kc_create_help_request(jsonb)'
            ),
            pg_catalog.to_regprocedure(
              'public.kc_create_help_request_with_notification_claim(jsonb)'
            ),
            pg_catalog.to_regprocedure(
              'public.kc_create_help_request_with_notification_claim_v2(jsonb)'
            )
          )
        ),
        false
      )
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_is_privacy_help_route_v1(jsonb)'
        )
      ) like '%account_data_copy%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_is_privacy_help_route_v1(jsonb)'
        )
      ) like '%account_data_portability%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_is_privacy_help_route_v1(jsonb)'
        )
      ) like '%account_deletion%'
    ),
    false
  ) as privacy_help_idempotency_rpc_safe,
  coalesce(
    (
      pg_catalog.to_regprocedure(
        'public.kc_create_privacy_help_guest_v1(jsonb)'
      ) is not null
      and (
        select procedure_row.prosecdef
          and procedure_row.proconfig @> array['search_path=""']
        from pg_catalog.pg_proc procedure_row
        where procedure_row.oid = pg_catalog.to_regprocedure(
          'public.kc_create_privacy_help_guest_v1(jsonb)'
        )
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
      )
      and pg_catalog.has_function_privilege(
        'service_role',
        'public.kc_create_privacy_help_guest_v1(jsonb)',
        'execute'
      )
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'public.kc_create_privacy_help_guest_v1(jsonb)'
        )
      ) like '%p_payload - ''expected_user_id''%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'public.kc_create_privacy_help_guest_v1(jsonb)'
        )
      ) like '%''expected_auth_state'',%''anonymous''%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'public.kc_create_privacy_help_guest_v1(jsonb)'
        )
      ) like '%''{"role":"anon"}''%'
    ),
    false
  ) as privacy_help_guest_gateway_bridge_safe,
  coalesce(
    (
      pg_catalog.to_regprocedure(
        'public.kc_create_privacy_help_request_v1(jsonb)'
      ) is not null
      and pg_catalog.has_function_privilege(
        'authenticated',
        'public.kc_create_privacy_help_request_v1(jsonb)',
        'execute'
      )
      and pg_catalog.has_function_privilege(
        'service_role',
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
              pg_catalog.to_regprocedure(
                'public.kc_create_privacy_help_request_v1(jsonb)'
              ),
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
              pg_catalog.to_regprocedure(
                'public.kc_create_privacy_help_request_v1(jsonb)'
              ),
              'pg_proc'
            ),
            ''
          ) like 'CONTRACT:%'
        )
      )
    ),
    false
  ) as privacy_help_guest_gateway_acl_phase_safe,
  coalesce(
    (
      pg_catalog.to_regprocedure(
        'kc_private.kc_cleanup_privacy_help_tombstones_v1(integer)'
      ) is not null
      and pg_catalog.to_regprocedure(
        'kc_private.kc_purge_expired_data_subject_requests_privacy_base(integer)'
      ) is not null
      and pg_catalog.to_regprocedure(
        'kc_private.kc_purge_expired_data_subject_requests(integer)'
      ) is not null
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_cleanup_privacy_help_tombstones_v1(integer)'
        )
      ) like '%interval ''90 days''%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_cleanup_privacy_help_tombstones_v1(integer)'
        )
      ) like '%interval ''2 days''%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_cleanup_privacy_help_tombstones_v1(integer)'
        )
      ) like '%help_privacy_guest_rate_buckets%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_cleanup_privacy_help_tombstones_v1(integer)'
        )
      ) like '%for update skip locked%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_purge_expired_data_subject_requests(integer)'
        )
      ) like
        '%kc_purge_expired_data_subject_requests_privacy_base%'
      and pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'kc_private.kc_purge_expired_data_subject_requests(integer)'
        )
      ) like '%kc_cleanup_privacy_help_tombstones_v1%'
      and exists (
        select 1
        from pg_catalog.pg_trigger trigger_row
        where trigger_row.tgrelid =
            pg_catalog.to_regclass('public.help_requests')
          and trigger_row.tgname =
            'kc_drop_privacy_help_replay_after_redaction'
          and trigger_row.tgfoid = pg_catalog.to_regprocedure(
            'kc_private.kc_drop_privacy_help_replay_after_redaction_v1()'
          )
          and not trigger_row.tgisinternal
          and trigger_row.tgenabled <> 'D'
      )
    ),
    false
  ) as privacy_help_idempotency_retention_safe,
  pg_catalog.to_regprocedure(
    'public.kc_link_verified_help_request_to_data_export(uuid,text,text,uuid,uuid,text,text,timestamptz,jsonb)'
  ) is not null as verified_help_request_data_export_link,
  not exists (
    select 1
    from pg_catalog.pg_index index_row
    join pg_catalog.pg_attribute attribute_row
      on attribute_row.attrelid = index_row.indrelid
     and attribute_row.attname = 'request_id'
    where index_row.indrelid =
        'kc_private.data_export_ticket_identity_links'::regclass
      and index_row.indisunique
      and index_row.indnkeyatts = 1
      and index_row.indkey[0] = attribute_row.attnum
  )
    and exists (
      select 1
      from pg_catalog.pg_constraint constraint_row
      join pg_catalog.pg_attribute attribute_row
        on attribute_row.attrelid = constraint_row.conrelid
       and attribute_row.attname = 'help_request_id'
      where constraint_row.conrelid =
          'kc_private.data_export_ticket_identity_links'::regclass
        and constraint_row.contype = 'p'
        and constraint_row.conkey = array[
          attribute_row.attnum
        ]::smallint[]
    )
    and pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'kc_private.kc_link_verified_help_request_to_data_export(uuid,text,text,uuid,text,text,timestamptz,jsonb)'
      )
    ) like '%''reused_existing''%'
    as verified_help_ticket_canonical_reuse,
  pg_catalog.to_regprocedure(
    'public.kc_authorize_data_export_artifact_upload(text,bigint,text,integer)'
  ) is not null as data_export_upload_reauthorization,
  pg_catalog.to_regprocedure(
    'public.kc_begin_data_export_retention_run(text,integer,uuid,timestamptz)'
  ) is not null
    and pg_catalog.to_regprocedure(
      'public.kc_finish_data_export_retention_run(uuid,text,integer,integer,integer,jsonb,text)'
    ) is not null
    and pg_catalog.to_regprocedure(
      'kc_private.kc_trigger_data_export_retention(integer,text)'
    ) is not null
    and pg_catalog.to_regprocedure(
      'kc_private.kc_monitor_data_export_retention()'
    ) is not null
    and pg_catalog.to_regprocedure(
      'kc_private.kc_data_export_retention_configuration_status()'
    ) is not null
    and pg_catalog.to_regprocedure(
      'kc_private.kc_data_export_retention_configuration_status(text)'
    ) is not null
    and pg_catalog.to_regprocedure(
      'kc_private.kc_data_export_retention_vault_acl_safe()'
    ) is not null as data_export_retention_automation,
  not coalesce(
    pg_catalog.has_function_privilege(
      'anon',
      pg_catalog.to_regprocedure(
        'public.kc_claim_expired_data_export_artifacts(integer,uuid)'
      ),
      'execute'
    ),
    false
  )
    and not coalesce(
      pg_catalog.has_function_privilege(
        'authenticated',
        pg_catalog.to_regprocedure(
          'public.kc_claim_expired_data_export_artifacts(integer,uuid)'
        ),
        'execute'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_function_privilege(
        'anon',
        pg_catalog.to_regprocedure(
          'public.kc_purge_data_export_artifact(text,bigint,uuid)'
        ),
        'execute'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_function_privilege(
        'authenticated',
        pg_catalog.to_regprocedure(
          'public.kc_purge_data_export_artifact(text,bigint,uuid)'
        ),
        'execute'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_function_privilege(
        'anon',
        pg_catalog.to_regprocedure(
          'public.kc_begin_data_export_retention_run(text,integer,uuid,timestamptz)'
        ),
        'execute'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_function_privilege(
        'authenticated',
        pg_catalog.to_regprocedure(
          'public.kc_begin_data_export_retention_run(text,integer,uuid,timestamptz)'
        ),
        'execute'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_function_privilege(
        'anon',
        pg_catalog.to_regprocedure(
          'public.kc_finish_data_export_retention_run(uuid,text,integer,integer,integer,jsonb,text)'
        ),
        'execute'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_function_privilege(
        'authenticated',
        pg_catalog.to_regprocedure(
          'public.kc_finish_data_export_retention_run(uuid,text,integer,integer,integer,jsonb,text)'
        ),
        'execute'
      ),
      false
    )
    and coalesce(
      pg_catalog.has_function_privilege(
        'service_role',
        pg_catalog.to_regprocedure(
          'public.kc_claim_expired_data_export_artifacts(integer,uuid)'
        ),
        'execute'
      ),
      false
    )
    and coalesce(
      pg_catalog.has_function_privilege(
        'service_role',
        pg_catalog.to_regprocedure(
          'public.kc_purge_data_export_artifact(text,bigint,uuid)'
        ),
        'execute'
      ),
      false
    )
    and coalesce(
      pg_catalog.has_function_privilege(
        'service_role',
        pg_catalog.to_regprocedure(
          'public.kc_begin_data_export_retention_run(text,integer,uuid,timestamptz)'
        ),
        'execute'
      ),
      false
    )
    and coalesce(
      pg_catalog.has_function_privilege(
        'service_role',
        pg_catalog.to_regprocedure(
          'public.kc_finish_data_export_retention_run(uuid,text,integer,integer,integer,jsonb,text)'
        ),
        'execute'
      ),
      false
    ) as data_export_retention_rpc_acl,
  not coalesce(
    pg_catalog.has_table_privilege(
      'anon',
      'kc_private.data_export_retention_runs',
      'select,insert,update,delete'
    ),
    false
  )
    and not coalesce(
      pg_catalog.has_table_privilege(
        'authenticated',
        'kc_private.data_export_retention_runs',
        'select,insert,update,delete'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_table_privilege(
        'service_role',
        'kc_private.data_export_retention_runs',
        'select,insert,update,delete'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_table_privilege(
        'anon',
        'kc_private.data_export_retention_alerts',
        'select,insert,update,delete'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_table_privilege(
        'authenticated',
        'kc_private.data_export_retention_alerts',
        'select,insert,update,delete'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_table_privilege(
        'service_role',
        'kc_private.data_export_retention_alerts',
        'select,insert,update,delete'
      ),
      false
    ) as data_export_retention_table_acl,
  pg_catalog.to_regclass('vault.decrypted_secrets') is not null
    and not exists (
      select 1
      from (
        values
          ('anon'::name),
          ('authenticated'::name)
      ) role_row(role_name)
      where pg_catalog.has_schema_privilege(
          role_row.role_name,
          pg_catalog.to_regnamespace('vault'),
          'usage'
        )
        or pg_catalog.has_table_privilege(
          role_row.role_name,
          pg_catalog.to_regclass('vault.decrypted_secrets'),
          'select'
        )
        or pg_catalog.has_any_column_privilege(
          role_row.role_name,
          pg_catalog.to_regclass('vault.decrypted_secrets'),
          'select'
        )
    ) as data_export_retention_vault_browser_acl,
  coalesce(
    (
      kc_private.kc_data_export_retention_configuration_status(
        '__KC_EXPECTED_PROJECT_REF__'
      )
        ->> 'ok'
    )::boolean,
    false
  ) as data_export_retention_schedule_configured,
  case
    when pg_catalog.to_regclass('cron.job') is null then false
    else coalesce(
      pg_catalog.xpath_exists(
        '/table/row',
        pg_catalog.query_to_xml(
          $schedule$
            select 1
            from cron.job job_row
            join kc_private.data_subject_request_retention_schedule_state
              state_row
              on state_row.singleton
             and state_row.job_id = job_row.jobid
            where state_row.cron_available
              and state_row.scheduled
              and state_row.schedule = '17 3 * * *'
              and state_row.operational_alert is null
              and job_row.jobname = 'kc-dsr-retention-purge-daily'
              and job_row.schedule = '17 3 * * *'
              and job_row.command =
                'select kc_private.kc_purge_expired_data_subject_requests(500);'
              and job_row.active
          $schedule$,
          true,
          false,
          ''
        )
      ),
      false
    )
  end as data_subject_request_retention_schedule_configured,
  case
    when pg_catalog.to_regclass('cron.job') is null then false
    else coalesce(
      pg_catalog.xpath_exists(
        '/table/row',
        pg_catalog.query_to_xml(
          $schedule$
            select 1
            from cron.job job_row
            join kc_private.account_erasure_completion_outbox_schedule_state
              state_row
              on state_row.singleton
             and state_row.job_id = job_row.jobid
            where state_row.cron_available
              and state_row.scheduled
              and state_row.schedule = '11 * * * *'
              and state_row.operational_alert is null
              and job_row.jobname =
                'kc-erasure-completion-outbox-purge-hourly'
              and job_row.schedule = '11 * * * *'
              and job_row.command =
                'select kc_private.kc_purge_expired_account_erasure_completion_outbox(500);'
              and job_row.active
          $schedule$,
          true,
          false,
          ''
        )
      ),
      false
    )
  end as account_erasure_outbox_schedule_configured,
  case
    when pg_catalog.to_regclass('cron.job') is null then false
    else coalesce(
      pg_catalog.xpath_exists(
        '/table/row',
        pg_catalog.query_to_xml(
          $schedule$
            select 1
            from cron.job job_row
            join kc_private.help_notification_retention_schedule_state
              state_row
              on state_row.singleton
             and state_row.job_id = job_row.jobid
            where state_row.cron_available
              and state_row.scheduled
              and state_row.schedule = '41 3 * * *'
              and state_row.operational_alert is null
              and job_row.jobname =
                'kc-help-notification-claim-purge-daily'
              and job_row.schedule = '41 3 * * *'
              and job_row.command =
                'select kc_private.kc_purge_help_request_notification_claims(500);'
              and job_row.active
          $schedule$,
          true,
          false,
          ''
        )
      ),
      false
    )
  end as help_notification_retention_schedule_configured,
  pg_catalog.to_regprocedure(
    'public.kc_claim_help_request_notification(uuid,text,uuid,uuid,integer)'
  ) is not null as help_request_notification_claim,
  pg_catalog.to_regprocedure(
    'public.kc_complete_help_request_notification(uuid,uuid,boolean,jsonb)'
  ) is not null as help_request_notification_complete,
  pg_catalog.to_regprocedure(
    'public.kc_revoke_user_sessions_for_erasure(uuid)'
  ) is not null as session_revocation,
  pg_catalog.to_regprocedure(
    'public.kc_is_current_session_active()'
  ) is not null as active_session_rpc,
  pg_catalog.to_regprocedure(
    'kc_private.kc_get_feed_ad_config(text,text,text)'
  ) is not null as private_feed_ad_worker,
  pg_catalog.to_regprocedure(
    'kc_private.kc_get_personalized_tabs(text,integer)'
  ) is not null as private_personalized_tabs_worker,
  pg_catalog.to_regprocedure(
    'kc_private.kc_chat_start_conversation(uuid)'
  ) is not null as private_chat_start_worker,
  pg_catalog.to_regprocedure(
    'kc_private.kc_chat_send_message(uuid,text,text,text)'
  ) is not null as private_chat_send_worker,
  pg_catalog.to_regprocedure(
    'public.kc_chat_set_conversation_archived(uuid,boolean)'
  ) is not null
    and pg_catalog.to_regprocedure(
      'kc_private.kc_chat_set_conversation_archived(uuid,boolean)'
    ) is not null
    and coalesce(
      pg_catalog.has_function_privilege(
        'authenticated',
        pg_catalog.to_regprocedure(
          'public.kc_chat_set_conversation_archived(uuid,boolean)'
        ),
        'execute'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_function_privilege(
        'anon',
        pg_catalog.to_regprocedure(
          'public.kc_chat_set_conversation_archived(uuid,boolean)'
        ),
        'execute'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_function_privilege(
        'anon',
        pg_catalog.to_regprocedure(
          'kc_private.kc_chat_set_conversation_archived(uuid,boolean)'
        ),
        'execute'
      ),
      false
    )
    and coalesce(
      pg_catalog.has_function_privilege(
        'authenticated',
        pg_catalog.to_regprocedure(
          'kc_private.kc_chat_set_conversation_archived(uuid,boolean)'
        ),
        'execute'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_function_privilege(
        'service_role',
        pg_catalog.to_regprocedure(
          'public.kc_chat_set_conversation_archived(uuid,boolean)'
        ),
        'execute'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_function_privilege(
        'service_role',
        pg_catalog.to_regprocedure(
          'kc_private.kc_chat_set_conversation_archived(uuid,boolean)'
        ),
        'execute'
      ),
      false
    )
    and coalesce(
      pg_catalog.has_schema_privilege(
        'authenticated',
        'kc_private',
        'usage'
      ),
      false
    ) as owner_bound_chat_archive_rpc,
  coalesce(
    pg_catalog.has_table_privilege(
      'authenticated',
      'public.chat_conversations',
      'update'
    ),
    false
  )
    and not coalesce(
      pg_catalog.has_table_privilege(
        'anon',
        'public.chat_conversations',
        'update'
      ),
      false
    )
    and coalesce(
      pg_catalog.has_table_privilege(
        'service_role',
        'public.chat_conversations',
        'update'
      ),
      false
    )
    and exists (
      select 1
      from pg_catalog.pg_policy policy_row
      where policy_row.polrelid = 'public.chat_conversations'::regclass
        and policy_row.polname = 'chat_conv_update_own'
        and policy_row.polpermissive
        and policy_row.polcmd = 'w'
        and policy_row.polroles @> array[
          (
            select role_row.oid
            from pg_catalog.pg_roles role_row
            where role_row.rolname = 'authenticated'
          )
        ]::oid[]
        and pg_catalog.pg_get_expr(
          policy_row.polqual,
          policy_row.polrelid
        ) like '%kc_is_current_session_active()%'
        and pg_catalog.pg_get_expr(
          policy_row.polqual,
          policy_row.polrelid
        ) like '%participant_low%'
        and pg_catalog.pg_get_expr(
          policy_row.polqual,
          policy_row.polrelid
        ) like '%participant_high%'
        and pg_catalog.pg_get_expr(
          policy_row.polwithcheck,
          policy_row.polrelid
        ) like '%kc_is_current_session_active()%'
    )
    and exists (
      select 1
      from pg_catalog.pg_trigger trigger_row
      where trigger_row.tgrelid = 'public.chat_conversations'::regclass
        and trigger_row.tgname = 'kc_chat_legacy_archive_update_guard'
        and trigger_row.tgfoid = pg_catalog.to_regprocedure(
          'kc_private.kc_guard_legacy_chat_archive_update()'
        )
        and not trigger_row.tgisinternal
        and trigger_row.tgenabled <> 'D'
    )
    and exists (
      select 1
      from pg_catalog.pg_proc procedure_row
      where procedure_row.oid = pg_catalog.to_regprocedure(
          'kc_private.kc_guard_legacy_chat_archive_update()'
        )
        and not procedure_row.prosecdef
        and pg_catalog.pg_get_functiondef(procedure_row.oid)
          like '%CHAT_LEGACY_UPDATE_RESTRICTED%'
        and pg_catalog.pg_get_functiondef(procedure_row.oid)
          like '%to_jsonb(new) - ''archived_by_low''%'
        and pg_catalog.pg_get_functiondef(procedure_row.oid)
          like '%to_jsonb(new) - ''archived_by_high''%'
    )
    and not exists (
      select 1
      from (
        values
          ('anon'::name),
          ('authenticated'::name),
          ('service_role'::name)
      ) role_row(role_name)
      where coalesce(
        pg_catalog.has_function_privilege(
          role_row.role_name,
          pg_catalog.to_regprocedure(
            'kc_private.kc_guard_legacy_chat_archive_update()'
          ),
          'execute'
        ),
        false
      )
    ) as legacy_chat_archive_update_guarded,
  pg_catalog.to_regprocedure(
    'kc_private.kc_reactivate_post(uuid)'
  ) is not null as private_reactivate_post_worker,
  not coalesce(
    pg_catalog.has_function_privilege(
      'anon',
      pg_catalog.to_regprocedure('public.kc_admin_list_banners()'),
      'execute'
    ),
    false
  ) as anonymous_banner_admin_denied,
  not coalesce(
    pg_catalog.has_function_privilege(
      'anon',
      pg_catalog.to_regprocedure('public.kc_check_post_limit(uuid,text)'),
      'execute'
    ),
    false
  ) as anonymous_post_limit_oracle_denied,
  not coalesce(
    pg_catalog.has_function_privilege(
      'anon',
      pg_catalog.to_regprocedure('public.kc_get_user_rating_state(uuid,uuid)'),
      'execute'
    ),
    false
  ) as anonymous_rating_state_denied,
  not coalesce(
    pg_catalog.has_function_privilege(
      'anon',
      pg_catalog.to_regprocedure(
        'public.kc_track_home_category_affinity(text,jsonb)'
      ),
      'execute'
    ),
    false
  ) as anonymous_affinity_write_denied,
  not coalesce(
    pg_catalog.has_function_privilege(
      'anon',
      pg_catalog.to_regprocedure('public.kc_chat_start_conversation(uuid)'),
      'execute'
    ),
    false
  ) as anonymous_chat_worker_denied,
  not exists (
    select 1
    from pg_catalog.pg_class class_row
    join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = class_row.relnamespace
    where namespace_row.nspname = 'public'
      and class_row.relkind in ('r', 'p')
      and not exists (
        select 1
        from pg_catalog.pg_depend dependency_row
        where dependency_row.classid = 'pg_class'::regclass
          and dependency_row.objid = class_row.oid
          and dependency_row.deptype = 'e'
      )
      and not exists (
        select 1
        from pg_catalog.pg_trigger trigger_row
        where trigger_row.tgrelid = class_row.oid
          and trigger_row.tgname = 'kc_active_session_write_guard'
          and not trigger_row.tgisinternal
      )
  ) as active_session_write_triggers,
  not exists (
    select 1
    from pg_catalog.pg_class class_row
    join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = class_row.relnamespace
    where namespace_row.nspname = 'public'
      and class_row.relkind in ('r', 'p')
      and class_row.relrowsecurity
      and not exists (
        select 1
        from pg_catalog.pg_policy policy_row
        where policy_row.polrelid = class_row.oid
          and policy_row.polname = 'kc_active_session_restrictive'
          and not policy_row.polpermissive
      )
  ) as active_session_restrictive_policies,
  exists (
    select 1
    from pg_catalog.pg_roles role_row,
      unnest(coalesce(role_row.rolconfig, array[]::text[])) setting
    where role_row.rolname = 'authenticator'
      and setting =
        'pgrst.db_pre_request=public.kc_enforce_active_session_pre_request'
  ) as postgrest_active_session_barrier,
  coalesce(
    pg_catalog.to_regprocedure(
      'public.kc_enforce_active_session_pre_request()'
    ) is not null
    and pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.kc_enforce_active_session_pre_request()'
      )
    ) like '%auth.jwt() ->> ''role''%'
    and pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.kc_enforce_active_session_pre_request()'
      )
    ) like '%kc_is_current_session_active()%'
    and pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.kc_enforce_active_session_pre_request()'
      )
    ) not like '%request.path%'
    and pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.kc_enforce_active_session_pre_request()'
      )
    ) not like '%is_anonymous%',
    false
  ) as postgrest_active_session_barrier_strict,
  exists (
    select 1
    from pg_catalog.pg_policy policy_row
    where policy_row.polrelid = 'storage.objects'::regclass
      and policy_row.polname = 'kc_storage_active_session_restrictive'
      and not policy_row.polpermissive
  ) as storage_active_session_barrier,
  exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.chat_messages'::regclass
      and trigger_row.tgname = 'chat_msg_after_insert_denormalize'
      and not trigger_row.tgisinternal
  ) as chat_preview_insert_trigger,
  exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.chat_messages'::regclass
      and trigger_row.tgname = 'chat_msg_after_update_refresh_preview'
      and not trigger_row.tgisinternal
  ) as chat_preview_update_trigger,
  exists (
    select 1
    from storage.buckets bucket_row
    where bucket_row.id = 'kino-chat-media'
      and bucket_row.public = false
  ) as private_chat_media_bucket,
  not exists (
    select 1
    from (
      values
        (
          'storage_chat_media_select_participant'::name,
          'r'::"char",
          'kino-media'::text
        ),
        (
          'storage_chat_media_insert_sender'::name,
          'a'::"char",
          'kino-media'::text
        ),
        (
          'storage_chat_media_update_sender'::name,
          'w'::"char",
          'kino-media'::text
        ),
        (
          'storage_chat_media_delete_sender'::name,
          'd'::"char",
          'kino-media'::text
        ),
        (
          'storage_kino_chat_media_select_participant'::name,
          'r'::"char",
          'kino-chat-media'::text
        ),
        (
          'storage_kino_chat_media_insert_sender'::name,
          'a'::"char",
          'kino-chat-media'::text
        ),
        (
          'storage_kino_chat_media_update_sender'::name,
          'w'::"char",
          'kino-chat-media'::text
        ),
        (
          'storage_kino_chat_media_delete_sender'::name,
          'd'::"char",
          'kino-chat-media'::text
        )
    ) expected_policy(policy_name, command, bucket_name)
    left join pg_catalog.pg_policy policy_row
      on policy_row.polrelid = 'storage.objects'::regclass
     and policy_row.polname = expected_policy.policy_name
    where policy_row.oid is null
      or not policy_row.polpermissive
      or policy_row.polcmd <> expected_policy.command
      or not (
        policy_row.polroles @> array[
          (
            select role_row.oid
            from pg_catalog.pg_roles role_row
            where role_row.rolname = 'authenticated'
          )
        ]::oid[]
      )
      or (
        coalesce(
          pg_catalog.pg_get_expr(
            policy_row.polqual,
            policy_row.polrelid
          ),
          ''
        )
        || ' '
        || coalesce(
          pg_catalog.pg_get_expr(
            policy_row.polwithcheck,
            policy_row.polrelid
          ),
          ''
        )
      ) not like '%kc_is_current_session_active()%'
      or (
        coalesce(
          pg_catalog.pg_get_expr(
            policy_row.polqual,
            policy_row.polrelid
          ),
          ''
        )
        || ' '
        || coalesce(
          pg_catalog.pg_get_expr(
            policy_row.polwithcheck,
            policy_row.polrelid
          ),
          ''
        )
      ) not like '%' || expected_policy.bucket_name || '%'
      or (
        coalesce(
          pg_catalog.pg_get_expr(
            policy_row.polqual,
            policy_row.polrelid
          ),
          ''
        )
        || ' '
        || coalesce(
          pg_catalog.pg_get_expr(
            policy_row.polwithcheck,
            policy_row.polrelid
          ),
          ''
        )
      ) not like '%chat-media%'
      or (
        coalesce(
          pg_catalog.pg_get_expr(
            policy_row.polqual,
            policy_row.polrelid
          ),
          ''
        )
        || ' '
        || coalesce(
          pg_catalog.pg_get_expr(
            policy_row.polwithcheck,
            policy_row.polrelid
          ),
          ''
        )
      ) not like '%chat_conversations%'
      or (
        coalesce(
          pg_catalog.pg_get_expr(
            policy_row.polqual,
            policy_row.polrelid
          ),
          ''
        )
        || ' '
        || coalesce(
          pg_catalog.pg_get_expr(
            policy_row.polwithcheck,
            policy_row.polrelid
          ),
          ''
        )
      ) not like '%cardinality(storage.foldername(name)) = 3%'
      or (
        coalesce(
          pg_catalog.pg_get_expr(
            policy_row.polqual,
            policy_row.polrelid
          ),
          ''
        )
        || ' '
        || coalesce(
          pg_catalog.pg_get_expr(
            policy_row.polwithcheck,
            policy_row.polrelid
          ),
          ''
        )
      ) not like '%auth.uid()%'
      or (
        expected_policy.command in ('a', 'w', 'd')
        and (
          coalesce(
            pg_catalog.pg_get_expr(
              policy_row.polqual,
              policy_row.polrelid
            ),
            ''
          )
          || ' '
          || coalesce(
            pg_catalog.pg_get_expr(
              policy_row.polwithcheck,
              policy_row.polrelid
            ),
            ''
          )
        ) not like '%storage.foldername(name))[3]%'
      )
  )
    and not exists (
      select 1
      from pg_catalog.pg_policy policy_row
      where policy_row.polrelid = 'storage.objects'::regclass
        and policy_row.polname in (
          'storage_chat_media_insert_participant',
          'storage_chat_media_update_participant',
          'storage_chat_media_delete_participant'
        )
    ) as chat_media_expand_compatibility_policies,
  exists (
    select 1
    from storage.buckets bucket_row
    where bucket_row.id = 'kino-data-exports'
      and bucket_row.public = false
      and bucket_row.file_size_limit = 16777216
      and bucket_row.allowed_mime_types = array['application/json']::text[]
  ) as private_data_export_bucket,
  exists (
    select 1
    from pg_catalog.pg_policy policy_row
    where policy_row.polrelid = 'storage.objects'::regclass
      and policy_row.polname =
        'storage_data_exports_deny_browser_access'
      and not policy_row.polpermissive
      and policy_row.polcmd = '*'
      and policy_row.polroles @> array[
        (select role_row.oid
         from pg_catalog.pg_roles role_row
         where role_row.rolname = 'anon'),
        (select role_row.oid
         from pg_catalog.pg_roles role_row
         where role_row.rolname = 'authenticated')
      ]::oid[]
      and pg_catalog.pg_get_expr(
        policy_row.polqual,
        policy_row.polrelid
      ) like '%bucket_id <> ''kino-data-exports''%'
      and pg_catalog.pg_get_expr(
        policy_row.polwithcheck,
        policy_row.polrelid
      ) like '%bucket_id <> ''kino-data-exports''%'
  ) as data_export_bucket_browser_deny_policy,
  not exists (
    select 1
    from pg_catalog.pg_policy policy_row
    where policy_row.polrelid = 'storage.objects'::regclass
      and policy_row.polpermissive
      and policy_row.polcmd in ('r', '*')
      and (
        policy_row.polroles = array[0::oid]
        or policy_row.polroles && array[
          (select role_row.oid
           from pg_catalog.pg_roles role_row
           where role_row.rolname = 'anon'),
          (select role_row.oid
           from pg_catalog.pg_roles role_row
           where role_row.rolname = 'authenticated')
        ]::oid[]
      )
      and pg_catalog.pg_get_expr(
        policy_row.polqual,
        policy_row.polrelid
      ) like '%kino-data-exports%'
  ) as no_permissive_browser_export_read_policy;

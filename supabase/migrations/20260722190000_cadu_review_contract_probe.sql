-- Read-only deployment contract for the Cadu institutional-source review queue.
-- The OpenClaw readiness endpoint calls this service-role-only RPC before an
-- image is promoted. The probe reads catalogs/ACLs only and never reads or
-- mutates editorial rows.

begin;

create or replace function public.kc_cadu_review_contract()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with objects as (
    select
      pg_catalog.to_regclass(
        'public.cadu_institutional_source_reviews'
      ) as review_table,
      pg_catalog.to_regprocedure(
        'public.kc_create_institutional_source_review(uuid,text,text,text,text,text,text,text,text,text,text,text,smallint,text,text)'
      ) as create_rpc,
      pg_catalog.to_regprocedure(
        'public.kc_resolve_institutional_source_review(uuid,text,text,text,uuid,jsonb)'
      ) as resolve_rpc,
      pg_catalog.to_regprocedure(
        'kc_private.kc_guard_cadu_institutional_review()'
      ) as guard_rpc,
      pg_catalog.to_regprocedure('public.kc_is_admin(uuid)') as is_admin_rpc,
      pg_catalog.to_regprocedure('kc_private.kc_is_admin(uuid)') as private_is_admin_rpc,
      pg_catalog.to_regnamespace('kc_private') as private_schema,
      pg_catalog.to_regclass('public.profiles') as profiles_table,
      pg_catalog.to_regclass('public.kc_trusted_publishers') as trusted_publishers_table,
      pg_catalog.to_regclass('public.audit_log') as audit_log_table,
      pg_catalog.to_regclass('public.kc_unit_meta') as unit_meta_table
  ), contract as (
    select
      objects.review_table is not null
      and exists (
        select 1
        from pg_catalog.pg_class as table_row
        join pg_catalog.pg_namespace as schema_row
          on schema_row.oid = table_row.relnamespace
        where table_row.oid = objects.review_table
          and schema_row.nspname = 'public'
          and table_row.relname = 'cadu_institutional_source_reviews'
          and table_row.relkind = 'r'
          and table_row.relpersistence = 'p'
          and table_row.relrowsecurity
          and not table_row.relispartition
          and not table_row.relhasrules
          and (
            select pg_catalog.count(*)
            from pg_catalog.pg_attribute as attribute
            where attribute.attrelid = table_row.oid
              and attribute.attnum > 0
              and not attribute.attisdropped
          ) = 22
          and not exists (
            select 1
            from (
              values
                ('id'::name, 'pg_catalog.uuid'::regtype, true, 'gen_random_uuid()'::text),
                ('requested_by'::name, 'pg_catalog.uuid'::regtype, true, null::text),
                ('source_id'::name, 'pg_catalog.text'::regtype, true, null::text),
                ('source_url'::name, 'pg_catalog.text'::regtype, true, null::text),
                ('content_url'::name, 'pg_catalog.text'::regtype, true, null::text),
                ('instagram_handle'::name, 'pg_catalog.text'::regtype, false, null::text),
                ('content_kind'::name, 'pg_catalog.text'::regtype, true, '''institutional_site''::text'::text),
                ('intent'::name, 'pg_catalog.text'::regtype, true, '''review''::text'::text),
                ('idempotency_key'::name, 'pg_catalog.text'::regtype, true, null::text),
                ('source_revision'::name, 'pg_catalog.text'::regtype, true, null::text),
                ('registry_sha256'::name, 'pg_catalog.text'::regtype, true, null::text),
                ('name'::name, 'pg_catalog.text'::regtype, true, null::text),
                ('note'::name, 'pg_catalog.text'::regtype, false, null::text),
                ('tier'::name, 'pg_catalog.int2'::regtype, false, null::text),
                ('category'::name, 'pg_catalog.text'::regtype, true, null::text),
                ('origin'::name, 'pg_catalog.text'::regtype, true, '''cadu-admin-map-ufg''::text'::text),
                ('state'::name, 'pg_catalog.text'::regtype, true, '''pending''::text'::text),
                ('resolved_by'::name, 'pg_catalog.uuid'::regtype, false, null::text),
                ('resolved_at'::name, 'pg_catalog.timestamptz'::regtype, false, null::text),
                ('resolution_note'::name, 'pg_catalog.text'::regtype, false, null::text),
                ('created_at'::name, 'pg_catalog.timestamptz'::regtype, true, 'now()'::text),
                ('updated_at'::name, 'pg_catalog.timestamptz'::regtype, true, 'now()'::text)
            ) as expected(attname, atttypid, attnotnull, default_expression)
            where not exists (
              select 1
              from pg_catalog.pg_attribute as attribute
              left join pg_catalog.pg_attrdef as default_row
                on default_row.adrelid = attribute.attrelid
               and default_row.adnum = attribute.attnum
              where attribute.attrelid = table_row.oid
                and attribute.attname = expected.attname
                and attribute.atttypid = expected.atttypid
                and attribute.attnotnull = expected.attnotnull
                and attribute.attnum > 0
                and not attribute.attisdropped
                and attribute.attgenerated = ''
                and attribute.attidentity = ''
                and pg_catalog.pg_get_expr(
                  default_row.adbin, default_row.adrelid
                ) is not distinct from expected.default_expression
            )
          )
      ) as review_table,
      objects.review_table is not null
      and not exists (
        select 1
        from (
          values
            ('cadu_institutional_source_reviews_pkey'::name, 'p'::"char", '4c6419b3704337bbfe50f018842a9ad3'::text),
            ('cadu_institutional_source_reviews_requested_by_fkey'::name, 'f'::"char", 'bba57d430de472cabc23a1ac507090c1'::text),
            ('cadu_institutional_source_reviews_resolved_by_fkey'::name, 'f'::"char", '115e0895f1aab38e44ca37a06610701b'::text),
            ('cadu_institutional_source_reviews_source_id_check'::name, 'c'::"char", 'cc6feb87d52182162b1d38d649d27c5a'::text),
            ('cadu_institutional_source_reviews_urls_check'::name, 'c'::"char", '59d4b09c24865dcf2872bacf9c220037'::text),
            ('cadu_institutional_source_reviews_instagram_check'::name, 'c'::"char", 'face69c221a644dbaf13b15ef7662e84'::text),
            ('cadu_institutional_source_reviews_contract_check'::name, 'c'::"char", '7c357039cf5616a8fe03aa47c4fbb7f7'::text),
            ('cadu_institutional_source_reviews_state_check'::name, 'c'::"char", 'e33a08ef726ec64556d1df6b009fc2c1'::text),
            ('cadu_institutional_source_reviews_resolution_note_control_check'::name, 'c'::"char", '80dbdf7a2cdf423ab16b0f17f5e52bf9'::text)
        ) as expected(conname, contype, definition_hash)
        where not exists (
          select 1
          from pg_catalog.pg_constraint as constraint_row
          where constraint_row.conrelid = objects.review_table
            and constraint_row.conname = expected.conname
            and constraint_row.contype = expected.contype
            and constraint_row.convalidated
            and not constraint_row.condeferrable
            and pg_catalog.md5(
              pg_catalog.pg_get_constraintdef(constraint_row.oid, true)
            ) = expected.definition_hash
        )
      )
      and (
        select pg_catalog.count(*) = 9
        from pg_catalog.pg_constraint as constraint_row
        where constraint_row.conrelid = objects.review_table
      )
      and not exists (
        select 1
        from pg_catalog.pg_constraint as constraint_row
        where constraint_row.conrelid = objects.review_table
          and not constraint_row.convalidated
      ) as review_constraints,
      objects.review_table is not null
      and not exists (
        select 1
        from (
          values
            ('cadu_institutional_source_reviews_pkey'::name, true, 'd3264eeccf68fd2d10c5caf67b87853b'::text),
            ('cadu_institutional_reviews_idempotency_uq'::name, true, '9970120a7b1524d0c82b2501075f4895'::text),
            ('cadu_institutional_reviews_source_revision_uq'::name, true, '1d07c702a87f76e8c0379d4f695f772e'::text),
            ('cadu_institutional_reviews_one_pending_source_uq'::name, true, 'bfd75d69e3a902993c51503384a72f8d'::text),
            ('cadu_institutional_reviews_state_created_idx'::name, false, '2c1ce670067fa03661c8dea5c494709d'::text),
            ('cadu_institutional_reviews_requester_created_idx'::name, false, '3f31f0b256632a30b74ee9a0c2c78d27'::text),
            ('cadu_institutional_reviews_resolved_by_idx'::name, false, '71f175debb208a01167231e97088d24f'::text)
        ) as expected(index_name, unique_index, definition_hash)
        where not exists (
          select 1
          from pg_catalog.pg_index as index_meta
          join pg_catalog.pg_class as index_row
            on index_row.oid = index_meta.indexrelid
          where index_meta.indrelid = objects.review_table
            and index_row.relname = expected.index_name
            and index_meta.indisunique = expected.unique_index
            and index_meta.indisvalid
            and index_meta.indisready
            and index_meta.indislive
            and index_meta.indimmediate
            and pg_catalog.md5(
              pg_catalog.pg_get_indexdef(index_meta.indexrelid)
            ) = expected.definition_hash
        )
      )
      and (
        select pg_catalog.count(*) = 7
        from pg_catalog.pg_index as index_meta
        where index_meta.indrelid = objects.review_table
      ) as review_indexes,
      objects.review_table is not null
      and (
        select pg_catalog.count(*) = 1
        from pg_catalog.pg_policy as policy_row
        where policy_row.polrelid = objects.review_table
      )
      and exists (
        select 1
        from pg_catalog.pg_policy as policy_row
        join pg_catalog.pg_roles as authenticated_role
          on authenticated_role.rolname = 'authenticated'
        where policy_row.polrelid = objects.review_table
          and policy_row.polname = 'cadu_institutional_source_reviews_admin_select'
          and policy_row.polpermissive
          and policy_row.polcmd = 'r'
          and policy_row.polroles = array[authenticated_role.oid]
          and policy_row.polwithcheck is null
          and pg_catalog.pg_get_expr(
            policy_row.polqual, policy_row.polrelid
          ) = 'public.kc_is_admin(( SELECT auth.uid() AS uid))'
      ) as review_rls_policy,
      objects.review_table is not null
      and not pg_catalog.has_table_privilege('anon', objects.review_table, 'select')
      and not pg_catalog.has_table_privilege('anon', objects.review_table, 'insert')
      and not pg_catalog.has_table_privilege('anon', objects.review_table, 'update')
      and not pg_catalog.has_table_privilege('anon', objects.review_table, 'delete')
      and not pg_catalog.has_table_privilege('anon', objects.review_table, 'truncate')
      and not pg_catalog.has_table_privilege('anon', objects.review_table, 'references')
      and not pg_catalog.has_table_privilege('anon', objects.review_table, 'trigger')
      and pg_catalog.has_table_privilege(
        'authenticated', objects.review_table, 'select'
      )
      and not pg_catalog.has_table_privilege('authenticated', objects.review_table, 'insert')
      and not pg_catalog.has_table_privilege('authenticated', objects.review_table, 'update')
      and not pg_catalog.has_table_privilege('authenticated', objects.review_table, 'delete')
      and not pg_catalog.has_table_privilege('authenticated', objects.review_table, 'truncate')
      and not pg_catalog.has_table_privilege('authenticated', objects.review_table, 'references')
      and not pg_catalog.has_table_privilege('authenticated', objects.review_table, 'trigger')
      and objects.review_table is not null
      and pg_catalog.has_table_privilege(
        'service_role', objects.review_table, 'select'
      )
      and not pg_catalog.has_table_privilege('service_role', objects.review_table, 'insert')
      and not pg_catalog.has_table_privilege('service_role', objects.review_table, 'update')
      and not pg_catalog.has_table_privilege('service_role', objects.review_table, 'delete')
      and not pg_catalog.has_table_privilege('service_role', objects.review_table, 'truncate')
      and not pg_catalog.has_table_privilege('service_role', objects.review_table, 'references')
      and not pg_catalog.has_table_privilege('service_role', objects.review_table, 'trigger')
      as review_table_acl,
      objects.guard_rpc is not null
      and (
        select pg_catalog.count(*)
        from pg_catalog.pg_trigger as trigger_row
        where trigger_row.tgrelid = objects.review_table
          and not trigger_row.tgisinternal
      ) = 1
      and exists (
        select 1
        from pg_catalog.pg_trigger as trigger_row
        join pg_catalog.pg_proc as function_row
          on function_row.oid = trigger_row.tgfoid
        where trigger_row.tgrelid = objects.review_table
          and trigger_row.tgname = 'trg_guard_cadu_institutional_review'
          and trigger_row.tgfoid = objects.guard_rpc
          and not trigger_row.tgisinternal
          and trigger_row.tgenabled = 'O'
          and trigger_row.tgtype = 19
          and not function_row.prosecdef
          and function_row.prorettype = 'pg_catalog.trigger'::regtype
          and function_row.proconfig = array['search_path=""']
          and pg_catalog.md5(function_row.prosrc) = '6fe3f699c9890efcc91b9e293947e94c'
          and not pg_catalog.has_function_privilege(
            'anon', function_row.oid, 'execute'
          )
          and not pg_catalog.has_function_privilege(
            'authenticated', function_row.oid, 'execute'
          )
          and not pg_catalog.has_function_privilege(
            'service_role', function_row.oid, 'execute'
          )
      ) as review_guard_trigger,
      objects.create_rpc is not null
      and exists (
        select 1
        from pg_catalog.pg_proc as function_row
        join pg_catalog.pg_language as language_row
          on language_row.oid = function_row.prolang
        where function_row.oid = objects.create_rpc
          and function_row.prokind = 'f'
          and function_row.pronargs = 15
          and function_row.proargnames[1:15] = array[
            'p_requested_by', 'p_source_id', 'p_source_url', 'p_content_url',
            'p_instagram_handle', 'p_content_kind', 'p_intent',
            'p_idempotency_key', 'p_source_revision', 'p_registry_sha256',
            'p_name', 'p_note', 'p_tier', 'p_category', 'p_origin'
          ]::text[]
          and function_row.prorettype = 'pg_catalog.record'::regtype
          and function_row.proretset
          and pg_catalog.pg_get_function_result(function_row.oid) =
            'TABLE(id uuid, requested_by uuid, source_id text, source_url text, content_url text, instagram_handle text, content_kind text, intent text, idempotency_key text, source_revision text, registry_sha256 text, name text, note text, tier smallint, category text, origin text, state text, created_at timestamp with time zone, replayed boolean)'
          and function_row.prosecdef
          and not function_row.proisstrict
          and function_row.provolatile = 'v'
          and function_row.proparallel = 'u'
          and function_row.proconfig = array['search_path=""']
          and language_row.lanname = 'plpgsql'
          and pg_catalog.md5(function_row.prosrc) = '27981f09aa4544ce99a79af95d75bf4f'
          and pg_catalog.has_function_privilege(
            'service_role', function_row.oid, 'execute'
          )
          and not pg_catalog.has_function_privilege(
            'anon', function_row.oid, 'execute'
          )
          and not pg_catalog.has_function_privilege(
            'authenticated', function_row.oid, 'execute'
          )
          and (
            select pg_catalog.count(*)
            from pg_catalog.pg_proc as named_function
            join pg_catalog.pg_namespace as named_schema
              on named_schema.oid = named_function.pronamespace
            where named_schema.nspname = 'public'
              and named_function.proname = 'kc_create_institutional_source_review'
          ) = 1
      ) as review_create_rpc,
      objects.resolve_rpc is not null
      and exists (
        select 1
        from pg_catalog.pg_proc as function_row
        join pg_catalog.pg_language as language_row
          on language_row.oid = function_row.prolang
        where function_row.oid = objects.resolve_rpc
          and function_row.prokind = 'f'
          and function_row.pronargs = 6
          and function_row.proargnames[1:6] = array[
            'p_review_id', 'p_expected_source_revision', 'p_decision',
            'p_resolution_note', 'p_resolved_by', 'p_expected_meta_revisions'
          ]::text[]
          and function_row.prorettype = 'pg_catalog.record'::regtype
          and function_row.proretset
          and pg_catalog.pg_get_function_result(function_row.oid) =
            'TABLE(id uuid, source_id text, source_revision text, state text, resolved_by uuid, resolved_at timestamp with time zone, replayed boolean)'
          and function_row.prosecdef
          and not function_row.proisstrict
          and function_row.provolatile = 'v'
          and function_row.proparallel = 'u'
          and function_row.proconfig = array['search_path=""']
          and language_row.lanname = 'plpgsql'
          and pg_catalog.md5(function_row.prosrc) = '5bd65941d02b332477e77289361b6ff4'
          and pg_catalog.has_function_privilege(
            'service_role', function_row.oid, 'execute'
          )
          and not pg_catalog.has_function_privilege(
            'anon', function_row.oid, 'execute'
          )
          and not pg_catalog.has_function_privilege(
            'authenticated', function_row.oid, 'execute'
          )
          and (
            select pg_catalog.count(*)
            from pg_catalog.pg_proc as named_function
            join pg_catalog.pg_namespace as named_schema
              on named_schema.oid = named_function.pronamespace
            where named_schema.nspname = 'public'
              and named_function.proname = 'kc_resolve_institutional_source_review'
          ) = 1
      ) as review_resolve_rpc,
      objects.is_admin_rpc is not null
      and objects.private_is_admin_rpc is not null
      and objects.private_schema is not null
      and objects.profiles_table is not null
      and objects.trusted_publishers_table is not null
      and objects.audit_log_table is not null
      and objects.unit_meta_table is not null
      and not exists (
        select 1
        from rows from (
          pg_catalog.unnest(array[
            objects.profiles_table::oid,
            objects.trusted_publishers_table::oid,
            objects.audit_log_table::oid,
            objects.audit_log_table::oid,
            objects.audit_log_table::oid,
            objects.audit_log_table::oid,
            objects.audit_log_table::oid,
            objects.unit_meta_table::oid,
            objects.unit_meta_table::oid
          ]::oid[]),
          pg_catalog.unnest(array[
            'id'::name, 'user_id'::name, 'action'::name,
            'entity_type'::name, 'entity_id'::name, 'actor_id'::name,
            'payload'::name, 'unit_id'::name, 'revision'::name
          ]::name[]),
          pg_catalog.unnest(array[
            'pg_catalog.uuid'::regtype::oid,
            'pg_catalog.uuid'::regtype::oid,
            'pg_catalog.text'::regtype::oid,
            'pg_catalog.text'::regtype::oid,
            'pg_catalog.uuid'::regtype::oid,
            'pg_catalog.uuid'::regtype::oid,
            'pg_catalog.jsonb'::regtype::oid,
            'pg_catalog.text'::regtype::oid,
            'pg_catalog.int8'::regtype::oid
          ]::oid[])
        ) as expected(relation_oid, column_name, column_type)
        where not exists (
          select 1
          from pg_catalog.pg_attribute as attribute
          where attribute.attrelid = expected.relation_oid
            and attribute.attname = expected.column_name
            and attribute.atttypid = expected.column_type
            and attribute.attnum > 0
            and not attribute.attisdropped
        )
      )
      and exists (
        select 1
        from pg_catalog.pg_proc as function_row
        join pg_catalog.pg_language as language_row
          on language_row.oid = function_row.prolang
        where function_row.oid = objects.is_admin_rpc
          and function_row.prokind = 'f'
          and function_row.pronargs = 1
          and function_row.proargnames[1:1] = array['p_user_id']::text[]
          and function_row.prorettype = 'pg_catalog.bool'::regtype
          and not function_row.prosecdef
          and not function_row.proisstrict
          and function_row.provolatile = 's'
          and function_row.proparallel = 'u'
          and function_row.proconfig = array['search_path=""']
          and language_row.lanname = 'sql'
          and pg_catalog.md5(function_row.prosrc) = 'e7c29240b8ce7b8668a94fc4224ffa50'
          and pg_catalog.has_function_privilege('anon', function_row.oid, 'execute')
          and pg_catalog.has_function_privilege('authenticated', function_row.oid, 'execute')
          and pg_catalog.has_function_privilege('service_role', function_row.oid, 'execute')
      )
      and exists (
        select 1
        from pg_catalog.pg_proc as function_row
        join pg_catalog.pg_language as language_row
          on language_row.oid = function_row.prolang
        where function_row.oid = objects.private_is_admin_rpc
          and function_row.prokind = 'f'
          and function_row.pronargs = 1
          and function_row.prorettype = 'pg_catalog.bool'::regtype
          and function_row.prosecdef
          and not function_row.proisstrict
          and function_row.provolatile = 's'
          and function_row.proparallel = 'u'
          and function_row.proconfig = array['search_path=public']
          and language_row.lanname = 'sql'
          and pg_catalog.md5(function_row.prosrc) = 'c8035d23002514bc8d90ae96f6d1a1d2'
          and pg_catalog.has_function_privilege('anon', function_row.oid, 'execute')
          and pg_catalog.has_function_privilege('authenticated', function_row.oid, 'execute')
          and pg_catalog.has_function_privilege('service_role', function_row.oid, 'execute')
      )
      and pg_catalog.has_schema_privilege('anon', objects.private_schema, 'usage')
      and pg_catalog.has_schema_privilege('authenticated', objects.private_schema, 'usage')
      and pg_catalog.has_schema_privilege('service_role', objects.private_schema, 'usage')
      and not exists (
        select 1
        from pg_catalog.pg_class as relation_row
        where relation_row.oid = any(array[
          objects.review_table::oid,
          objects.profiles_table::oid,
          objects.trusted_publishers_table::oid,
          objects.audit_log_table::oid,
          objects.unit_meta_table::oid
        ]::oid[])
          and pg_catalog.pg_get_userbyid(relation_row.relowner) <> 'postgres'
      )
      and not exists (
        select 1
        from pg_catalog.pg_proc as function_row
        where function_row.oid = any(array[
          objects.guard_rpc::oid,
          objects.create_rpc::oid,
          objects.resolve_rpc::oid,
          objects.is_admin_rpc::oid,
          objects.private_is_admin_rpc::oid
        ]::oid[])
          and pg_catalog.pg_get_userbyid(function_row.proowner) <> 'postgres'
      ) as review_dependencies
    from objects
  ), evaluated as (
    select
      contract.*,
      review_table
      and review_constraints
      and review_indexes
      and review_rls_policy
      and review_table_acl
      and review_guard_trigger
      and review_create_rpc
      and review_resolve_rpc
      and review_dependencies as ready
    from contract
  )
  select pg_catalog.jsonb_build_object(
    'contractVersion', 'cadu-institutional-review-v1',
    'ready', ready,
    'checks', pg_catalog.jsonb_build_object(
      'reviewTable', review_table,
      'reviewConstraints', review_constraints,
      'reviewIndexes', review_indexes,
      'reviewRlsPolicy', review_rls_policy,
      'reviewTableAcl', review_table_acl,
      'reviewGuardTrigger', review_guard_trigger,
      'reviewCreateRpc', review_create_rpc,
      'reviewResolveRpc', review_resolve_rpc,
      'reviewDependencies', review_dependencies
    )
  )
  from evaluated;
$$;

revoke all on function public.kc_cadu_review_contract()
  from public, anon, authenticated, service_role;
grant execute on function public.kc_cadu_review_contract()
  to service_role;

comment on function public.kc_cadu_review_contract() is
  'Read-only service-role deployment probe for the Cadu institutional-source review queue.';

notify pgrst, 'reload schema';

commit;

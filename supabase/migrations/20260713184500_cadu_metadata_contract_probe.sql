-- Read-only deployment contract for the Cadu metadata CAS boundary.
--
-- The OpenClaw rollout calls this service-role-only RPC before promoting a
-- candidate image to last-good.  The probe reads PostgreSQL catalogs and ACLs
-- only: it never reads editorial rows and cannot mutate metadata.

begin;

create or replace function public.kc_cadu_metadata_contract()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with contract as (
    select
      exists (
        select 1
        from pg_catalog.pg_class as table_row
        join pg_catalog.pg_namespace as schema_row
          on schema_row.oid = table_row.relnamespace
        where table_row.oid = 'public.kc_unit_meta'::regclass
          and schema_row.nspname = 'public'
          and table_row.relname = 'kc_unit_meta'
          and table_row.relkind = 'r'
          and table_row.relpersistence = 'p'
          and not table_row.relispartition
          and not table_row.relhasrules
          and (
            select pg_catalog.count(*)
            from pg_catalog.pg_attribute as live_attribute
            where live_attribute.attrelid = table_row.oid
              and live_attribute.attnum > 0
              and not live_attribute.attisdropped
          ) = 7
          and not exists (
            select 1
            from (
              values
                ('unit_id'::name, 'pg_catalog.text'::regtype, true, null::text),
                ('tier'::name, 'pg_catalog.int2'::regtype, false, null::text),
                ('note'::name, 'pg_catalog.text'::regtype, false, null::text),
                ('updated_at'::name, 'pg_catalog.timestamptz'::regtype, true, 'now()'::text),
                ('updated_by'::name, 'pg_catalog.uuid'::regtype, false, null::text),
                ('source'::name, 'pg_catalog.text'::regtype, true, '''admin-ui''::text'::text),
                ('revision'::name, 'pg_catalog.int8'::regtype, true, '1'::text)
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
          and exists (
            select 1
            from pg_catalog.pg_attribute as unit_id_attribute
            join pg_catalog.pg_constraint as identity_constraint
              on identity_constraint.conrelid = unit_id_attribute.attrelid
            join pg_catalog.pg_index as identity_index
              on identity_index.indexrelid = identity_constraint.conindid
            where unit_id_attribute.attrelid = table_row.oid
              and unit_id_attribute.attname = 'unit_id'
              and identity_constraint.contype in ('p', 'u')
              and identity_constraint.convalidated
              and not identity_constraint.condeferrable
              and identity_constraint.conkey =
                array[unit_id_attribute.attnum]::smallint[]
              and identity_index.indisunique
              and identity_index.indisvalid
              and identity_index.indisready
              and identity_index.indimmediate
              and identity_index.indnkeyatts = 1
              and identity_index.indnatts = 1
              and identity_index.indpred is null
              and identity_index.indexprs is null
          )
          and (
            select pg_catalog.array_agg(
              constraint_row.conname::text || '|' ||
              constraint_row.contype::text || '|' ||
              constraint_row.convalidated::text || '|' ||
              constraint_row.condeferrable::text || '|' ||
              constraint_row.condeferred::text || '|' ||
              pg_catalog.pg_get_constraintdef(constraint_row.oid, true)
              order by constraint_row.conname
            )
            from pg_catalog.pg_constraint as constraint_row
            where constraint_row.conrelid = table_row.oid
          ) = array[
            'kc_unit_meta_pkey|p|true|false|false|PRIMARY KEY (unit_id)',
            'kc_unit_meta_revision_positive|c|true|false|false|CHECK (revision > 0)',
            'kc_unit_meta_tier_check|c|true|false|false|CHECK (tier >= 1 AND tier <= 3)',
            'kc_unit_meta_updated_by_fkey|f|true|false|false|FOREIGN KEY (updated_by) REFERENCES auth.users(id)'
          ]::text[]
          and (
            select pg_catalog.array_agg(
              index_row.relname::text || '|' ||
              index_meta.indisunique::text || '|' ||
              index_meta.indisprimary::text || '|' ||
              index_meta.indisvalid::text || '|' ||
              index_meta.indisready::text || '|' ||
              index_meta.indislive::text || '|' ||
              index_meta.indimmediate::text || '|' ||
              pg_catalog.pg_get_indexdef(index_meta.indexrelid)
              order by index_row.relname
            )
            from pg_catalog.pg_index as index_meta
            join pg_catalog.pg_class as index_row
              on index_row.oid = index_meta.indexrelid
            where index_meta.indrelid = table_row.oid
          ) = array[
            'idx_kc_unit_meta_tier|false|false|true|true|true|true|CREATE INDEX idx_kc_unit_meta_tier ON public.kc_unit_meta USING btree (tier) WHERE (tier IS NOT NULL)',
            'idx_kc_unit_meta_updated_by|false|false|true|true|true|true|CREATE INDEX idx_kc_unit_meta_updated_by ON public.kc_unit_meta USING btree (updated_by) WHERE (updated_by IS NOT NULL)',
            'kc_unit_meta_pkey|true|true|true|true|true|true|CREATE UNIQUE INDEX kc_unit_meta_pkey ON public.kc_unit_meta USING btree (unit_id)'
          ]::text[]
          and not exists (
            select 1
            from pg_catalog.pg_rewrite as rewrite_row
            where rewrite_row.ev_class = table_row.oid
          )
      ) as metadata_table,
      exists (
        select 1
        from pg_catalog.pg_attribute as attribute
        join pg_catalog.pg_attrdef as default_row
          on default_row.adrelid = attribute.attrelid
         and default_row.adnum = attribute.attnum
        where attribute.attrelid = 'public.kc_unit_meta'::regclass
          and attribute.attname = 'revision'
          and attribute.atttypid = 'pg_catalog.int8'::regtype
          and attribute.attnotnull
          and attribute.attnum > 0
          and not attribute.attisdropped
          and pg_catalog.pg_get_expr(
            default_row.adbin, default_row.adrelid
          ) = '1'
      ) as revision_column,
      exists (
        select 1
        from pg_catalog.pg_constraint as constraint_row
        where constraint_row.conrelid = 'public.kc_unit_meta'::regclass
          and constraint_row.conname = 'kc_unit_meta_revision_positive'
          and constraint_row.contype = 'c'
          and constraint_row.convalidated
          and pg_catalog.pg_get_constraintdef(
            constraint_row.oid, true
          ) = 'CHECK (revision > 0)'
      ) as revision_constraint,
      exists (
        select 1
        from pg_catalog.pg_trigger as trigger_row
        join pg_catalog.pg_proc as function_row
          on function_row.oid = trigger_row.tgfoid
        join pg_catalog.pg_language as language_row
          on language_row.oid = function_row.prolang
        where trigger_row.tgrelid = 'public.kc_unit_meta'::regclass
          and trigger_row.tgname = 'kc_unit_meta_touch'
          and trigger_row.tgfoid = pg_catalog.to_regprocedure(
            'public.kc_unit_meta_touch()'
          )
          and not trigger_row.tgisinternal
          and trigger_row.tgenabled = 'O'
          and trigger_row.tgtype = 23
          and trigger_row.tgqual is null
          and trigger_row.tgnargs = 0
          and trigger_row.tgoldtable is null
          and trigger_row.tgnewtable is null
          and function_row.prokind = 'f'
          and function_row.pronargs = 0
          and function_row.pronargdefaults = 0
          and function_row.proargnames is null
          and function_row.proargmodes is null
          and function_row.proallargtypes is null
          and function_row.proargdefaults is null
          and function_row.provariadic = 0
          and function_row.prorettype = 'pg_catalog.trigger'::regtype
          and not function_row.proretset
          and not function_row.prosecdef
          and not function_row.proisstrict
          and function_row.provolatile = 'v'
          and function_row.proparallel = 'u'
          and function_row.proconfig = array['search_path=""']
          and language_row.lanname = 'plpgsql'
          and pg_catalog.md5(
            pg_catalog.replace(
              pg_catalog.replace(function_row.prosrc, E'\r\n', E'\n'),
              E'\r',
              E'\n'
            )
          ) =
            'f62c2001b838efab4de4985b6a9e4fc1'
          and not pg_catalog.has_function_privilege(
            'anon', function_row.oid, 'execute'
          )
          and not pg_catalog.has_function_privilege(
            'authenticated', function_row.oid, 'execute'
          )
          and not exists (
            select 1
            from pg_catalog.pg_trigger as other_trigger
            where other_trigger.tgrelid = trigger_row.tgrelid
              and not other_trigger.tgisinternal
              and other_trigger.oid <> trigger_row.oid
          )
      ) as touch_trigger,
      exists (
        select 1
        from pg_catalog.pg_proc as function_row
        join pg_catalog.pg_language as language_row
          on language_row.oid = function_row.prolang
        where function_row.oid = pg_catalog.to_regprocedure(
            'public.kc_cadu_upsert_source_override(text,integer,text,boolean,bigint,jsonb)'
          )
          and function_row.prokind = 'f'
          and function_row.pronargs = 6
          and function_row.pronargdefaults = 0
          and function_row.proargnames = array[
            'p_source_id',
            'p_tier',
            'p_note',
            'p_expected_exists',
            'p_expected_revision',
            'p_expected_meta_revisions'
          ]::text[]
          and function_row.proargmodes is null
          and function_row.proallargtypes is null
          and function_row.proargdefaults is null
          and function_row.provariadic = 0
          and function_row.prorettype = 'pg_catalog.jsonb'::regtype
          and not function_row.proretset
          and not function_row.prosecdef
          and not function_row.proisstrict
          and function_row.provolatile = 'v'
          and function_row.proparallel = 'u'
          and function_row.proconfig = array['search_path=""']
          and language_row.lanname = 'plpgsql'
          and pg_catalog.md5(
            pg_catalog.replace(
              pg_catalog.replace(function_row.prosrc, E'\r\n', E'\n'),
              E'\r',
              E'\n'
            )
          ) =
            '7326c723f5eba96059ed69c959d2c4a8'
          and (
            select pg_catalog.count(*)
            from pg_catalog.pg_proc as named_function
            join pg_catalog.pg_namespace as named_schema
              on named_schema.oid = named_function.pronamespace
            where named_schema.nspname = 'public'
              and named_function.proname = 'kc_cadu_upsert_source_override'
          ) = 1
          and pg_catalog.has_function_privilege(
            'service_role', function_row.oid, 'execute'
          )
          and not pg_catalog.has_function_privilege(
            'anon', function_row.oid, 'execute'
          )
          and not pg_catalog.has_function_privilege(
            'authenticated', function_row.oid, 'execute'
          )
      ) as stable_rpc,
      exists (
        select 1
        from pg_catalog.pg_proc as function_row
        join pg_catalog.pg_language as language_row
          on language_row.oid = function_row.prolang
        where function_row.oid = pg_catalog.to_regprocedure(
            'public.kc_cadu_upsert_legacy_override(text,text,integer,text,boolean,bigint)'
          )
          and function_row.prokind = 'f'
          and function_row.pronargs = 6
          and function_row.pronargdefaults = 0
          and function_row.proargnames = array[
            'p_unit_id',
            'p_resolved_source_id',
            'p_tier',
            'p_note',
            'p_expected_exists',
            'p_expected_revision'
          ]::text[]
          and function_row.proargmodes is null
          and function_row.proallargtypes is null
          and function_row.proargdefaults is null
          and function_row.provariadic = 0
          and function_row.prorettype = 'pg_catalog.jsonb'::regtype
          and not function_row.proretset
          and not function_row.prosecdef
          and not function_row.proisstrict
          and function_row.provolatile = 'v'
          and function_row.proparallel = 'u'
          and function_row.proconfig = array['search_path=""']
          and language_row.lanname = 'plpgsql'
          and pg_catalog.md5(
            pg_catalog.replace(
              pg_catalog.replace(function_row.prosrc, E'\r\n', E'\n'),
              E'\r',
              E'\n'
            )
          ) =
            'd42bfede3b7399d16b647e26004eedf2'
          and (
            select pg_catalog.count(*)
            from pg_catalog.pg_proc as named_function
            join pg_catalog.pg_namespace as named_schema
              on named_schema.oid = named_function.pronamespace
            where named_schema.nspname = 'public'
              and named_function.proname = 'kc_cadu_upsert_legacy_override'
          ) = 1
          and pg_catalog.has_function_privilege(
            'service_role', function_row.oid, 'execute'
          )
          and not pg_catalog.has_function_privilege(
            'anon', function_row.oid, 'execute'
          )
          and not pg_catalog.has_function_privilege(
            'authenticated', function_row.oid, 'execute'
          )
      ) as legacy_rpc,
      (
        select table_row.relrowsecurity
          and not anon_role.rolsuper
          and not anon_role.rolbypassrls
          and not authenticated_role.rolsuper
          and not authenticated_role.rolbypassrls
          and not pg_catalog.has_any_column_privilege(
            'anon', table_row.oid, 'insert'
          )
          and not pg_catalog.has_any_column_privilege(
            'anon', table_row.oid, 'update'
          )
          and not pg_catalog.has_any_column_privilege(
            'anon', table_row.oid, 'references'
          )
          and not pg_catalog.has_table_privilege(
            'anon', table_row.oid, 'delete'
          )
          and not pg_catalog.has_table_privilege(
            'anon', table_row.oid, 'truncate'
          )
          and not pg_catalog.has_table_privilege(
            'anon', table_row.oid, 'trigger'
          )
          and not pg_catalog.has_table_privilege(
            'anon', table_row.oid, 'maintain'
          )
          and not pg_catalog.has_any_column_privilege(
            'authenticated', table_row.oid, 'insert'
          )
          and not pg_catalog.has_any_column_privilege(
            'authenticated', table_row.oid, 'update'
          )
          and not pg_catalog.has_any_column_privilege(
            'authenticated', table_row.oid, 'references'
          )
          and not pg_catalog.has_table_privilege(
            'authenticated', table_row.oid, 'delete'
          )
          and not pg_catalog.has_table_privilege(
            'authenticated', table_row.oid, 'truncate'
          )
          and not pg_catalog.has_table_privilege(
            'authenticated', table_row.oid, 'trigger'
          )
          and not pg_catalog.has_table_privilege(
            'authenticated', table_row.oid, 'maintain'
          )
          and not exists (
            select 1
            from pg_catalog.pg_policy as policy_row
            where policy_row.polrelid = table_row.oid
              and policy_row.polcmd in ('a', 'w', 'd', '*')
          )
        from pg_catalog.pg_class as table_row
        join pg_catalog.pg_roles as anon_role
          on anon_role.rolname = 'anon'
        join pg_catalog.pg_roles as authenticated_role
          on authenticated_role.rolname = 'authenticated'
        where table_row.oid = 'public.kc_unit_meta'::regclass
      ) as browser_writes_revoked,
      (
        select pg_catalog.has_table_privilege(
            'anon', table_row.oid, 'select'
          )
          and pg_catalog.has_table_privilege(
            'authenticated', table_row.oid, 'select'
          )
          and (
            select pg_catalog.count(*)
            from pg_catalog.pg_policy as policy_count
            where policy_count.polrelid = table_row.oid
          ) = 1
          and exists (
            select 1
            from pg_catalog.pg_policy as policy_row
            where policy_row.polrelid = table_row.oid
              and policy_row.polname = 'kc_unit_meta_select_public'
              and policy_row.polpermissive
              and policy_row.polcmd = 'r'
              and policy_row.polroles @>
                array[anon_role.oid, authenticated_role.oid]
              and policy_row.polroles <@
                array[anon_role.oid, authenticated_role.oid]
              and pg_catalog.pg_get_expr(
                policy_row.polqual, policy_row.polrelid
              ) = 'true'
              and policy_row.polwithcheck is null
          )
        from pg_catalog.pg_class as table_row
        join pg_catalog.pg_roles as anon_role
          on anon_role.rolname = 'anon'
        join pg_catalog.pg_roles as authenticated_role
          on authenticated_role.rolname = 'authenticated'
        where table_row.oid = 'public.kc_unit_meta'::regclass
      ) as legacy_reads_preserved,
      (
        select not service_role_row.rolsuper
          and service_role_row.rolbypassrls
          and service_role_row.rolinherit
          and pg_catalog.has_table_privilege(
            'service_role', 'public.kc_unit_meta', 'select'
          )
          and pg_catalog.has_table_privilege(
            'service_role', 'public.kc_unit_meta', 'insert'
          )
          and pg_catalog.has_table_privilege(
            'service_role', 'public.kc_unit_meta', 'update'
          )
          and not pg_catalog.has_table_privilege(
            'service_role', 'public.kc_unit_meta', 'delete'
          )
          and not pg_catalog.has_table_privilege(
            'service_role', 'public.kc_unit_meta', 'truncate'
          )
          and not pg_catalog.has_table_privilege(
            'service_role', 'public.kc_unit_meta', 'references'
          )
          and not pg_catalog.has_any_column_privilege(
            'service_role', 'public.kc_unit_meta', 'references'
          )
          and not pg_catalog.has_table_privilege(
            'service_role', 'public.kc_unit_meta', 'trigger'
          )
          and not pg_catalog.has_table_privilege(
            'service_role', 'public.kc_unit_meta', 'maintain'
          )
        from pg_catalog.pg_roles as service_role_row
        where service_role_row.rolname = 'service_role'
      ) as service_role_phase_a
  ), evaluated as (
    select
      contract.*,
      metadata_table
      and revision_column
      and revision_constraint
      and touch_trigger
      and stable_rpc
      and legacy_rpc
      and browser_writes_revoked
      and legacy_reads_preserved
      and service_role_phase_a as ready
    from contract
  )
  select pg_catalog.jsonb_build_object(
    'contractVersion', 'cadu-unit-meta-cas-v1',
    'phase', 'phase-a',
    'ready', ready,
    'checks', pg_catalog.jsonb_build_object(
      'metadataTable', metadata_table,
      'revisionColumn', revision_column,
      'revisionConstraint', revision_constraint,
      'touchTrigger', touch_trigger,
      'stableRpc', stable_rpc,
      'legacyRpc', legacy_rpc,
      'browserWritesRevoked', browser_writes_revoked,
      'legacyReadsPreserved', legacy_reads_preserved,
      'serviceRolePhaseA', service_role_phase_a
    )
  )
  from evaluated;
$$;

revoke all on function public.kc_cadu_metadata_contract()
  from public, anon, authenticated, service_role;
grant execute on function public.kc_cadu_metadata_contract()
  to service_role;

comment on function public.kc_cadu_metadata_contract() is
  'Read-only service-role deployment probe for the Cadu unit metadata CAS contract.';

notify pgrst, 'reload schema';

commit;

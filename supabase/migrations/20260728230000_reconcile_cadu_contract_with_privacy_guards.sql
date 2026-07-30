-- Reconcile the strict CADU metadata probe with two reviewed privacy changes:
-- the erasure-safe FK action and the global active-session guard artifacts.
--
-- The probe remains fail-closed. It allows only the exact restrictive policy
-- and statement trigger installed by the privacy migration; any other browser
-- write policy, trigger, constraint, index, column, grant, or body drift still
-- makes the deployment contract report not ready.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = pg_catalog;

do $migration$
declare
  v_probe_oid oid := pg_catalog.to_regprocedure(
    'public.kc_cadu_metadata_contract()'
  );
  v_definition text;
  v_contract jsonb;
  v_index integer;
  v_old_count integer;
  v_new_count integer;
  v_old_snippets text[] := array[
$old_fk$            'kc_unit_meta_updated_by_fkey|f|true|false|false|FOREIGN KEY (updated_by) REFERENCES auth.users(id)'$old_fk$,
$old_trigger$          and not exists (
            select 1
            from pg_catalog.pg_trigger as other_trigger
            where other_trigger.tgrelid = trigger_row.tgrelid
              and not other_trigger.tgisinternal
              and other_trigger.oid <> trigger_row.oid
          )
      ) as touch_trigger,$old_trigger$,
$old_write_policy$          and not exists (
            select 1
            from pg_catalog.pg_policy as policy_row
            where policy_row.polrelid = table_row.oid
              and policy_row.polcmd in ('a', 'w', 'd', '*')
          )
        from pg_catalog.pg_class as table_row$old_write_policy$,
$old_read_policy$          and (
            select pg_catalog.count(*)
            from pg_catalog.pg_policy as policy_count
            where policy_count.polrelid = table_row.oid
          ) = 1
          and exists (
            select 1
            from pg_catalog.pg_policy as policy_row
            where policy_row.polrelid = table_row.oid
              and policy_row.polname = 'kc_unit_meta_select_public'$old_read_policy$
  ];
  v_new_snippets text[] := array[
$new_fk$            'kc_unit_meta_updated_by_fkey|f|true|false|false|FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL'$new_fk$,
$new_trigger$          and exists (
            select 1
            from pg_catalog.pg_trigger as required_session_trigger
            where required_session_trigger.tgrelid = trigger_row.tgrelid
              and required_session_trigger.tgname =
                'kc_active_session_write_guard'
              and not required_session_trigger.tgisinternal
              and required_session_trigger.tgenabled = 'O'
              and required_session_trigger.tgtype = 30
              and required_session_trigger.tgqual is null
              and required_session_trigger.tgnargs = 0
              and required_session_trigger.tgoldtable is null
              and required_session_trigger.tgnewtable is null
              and required_session_trigger.tgfoid =
                pg_catalog.to_regprocedure(
                  'kc_private.kc_guard_active_session_dml()'
                )
          )
          and not exists (
            select 1
            from pg_catalog.pg_trigger as other_trigger
            where other_trigger.tgrelid = trigger_row.tgrelid
              and not other_trigger.tgisinternal
              and other_trigger.oid <> trigger_row.oid
              and not (
                other_trigger.tgname = 'kc_active_session_write_guard'
                and other_trigger.tgenabled = 'O'
                and other_trigger.tgtype = 30
                and other_trigger.tgqual is null
                and other_trigger.tgnargs = 0
                and other_trigger.tgoldtable is null
                and other_trigger.tgnewtable is null
                and other_trigger.tgfoid = pg_catalog.to_regprocedure(
                  'kc_private.kc_guard_active_session_dml()'
                )
              )
          )
      ) as touch_trigger,$new_trigger$,
$new_write_policy$          and not exists (
            select 1
            from pg_catalog.pg_policy as policy_row
            where policy_row.polrelid = table_row.oid
              and policy_row.polcmd in ('a', 'w', 'd', '*')
              and not (
                policy_row.polname = 'kc_active_session_restrictive'
                and not policy_row.polpermissive
                and policy_row.polcmd = '*'
                and policy_row.polroles @> array[authenticated_role.oid]
                and policy_row.polroles <@ array[authenticated_role.oid]
                and pg_catalog.pg_get_expr(
                  policy_row.polqual, policy_row.polrelid
                ) = 'public.kc_is_current_session_active()'
                and pg_catalog.pg_get_expr(
                  policy_row.polwithcheck, policy_row.polrelid
                ) = 'public.kc_is_current_session_active()'
              )
          )
        from pg_catalog.pg_class as table_row$new_write_policy$,
$new_read_policy$          and (
            select pg_catalog.count(*)
            from pg_catalog.pg_policy as policy_count
            where policy_count.polrelid = table_row.oid
          ) = 2
          and exists (
            select 1
            from pg_catalog.pg_policy as session_policy
            where session_policy.polrelid = table_row.oid
              and session_policy.polname = 'kc_active_session_restrictive'
              and not session_policy.polpermissive
              and session_policy.polcmd = '*'
              and session_policy.polroles @> array[authenticated_role.oid]
              and session_policy.polroles <@ array[authenticated_role.oid]
              and pg_catalog.pg_get_expr(
                session_policy.polqual, session_policy.polrelid
              ) = 'public.kc_is_current_session_active()'
              and pg_catalog.pg_get_expr(
                session_policy.polwithcheck, session_policy.polrelid
              ) = 'public.kc_is_current_session_active()'
          )
          and exists (
            select 1
            from pg_catalog.pg_policy as policy_row
            where policy_row.polrelid = table_row.oid
              and policy_row.polname = 'kc_unit_meta_select_public'$new_read_policy$
  ];
begin
  if v_probe_oid is null then
    raise exception 'CADU_METADATA_CONTRACT_ROUTINE_MISSING';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as procedure_row
    join pg_catalog.pg_language as language_row
      on language_row.oid = procedure_row.prolang
    where procedure_row.oid = v_probe_oid
      and procedure_row.prokind = 'f'
      and procedure_row.pronargs = 0
      and procedure_row.pronargdefaults = 0
      and procedure_row.proargnames is null
      and procedure_row.proargmodes is null
      and procedure_row.proallargtypes is null
      and procedure_row.proargdefaults is null
      and procedure_row.provariadic = 0
      and procedure_row.prorettype = 'pg_catalog.jsonb'::regtype
      and not procedure_row.proretset
      and not procedure_row.prosecdef
      and not procedure_row.proisstrict
      and procedure_row.provolatile = 's'
      and procedure_row.proparallel = 'u'
      and procedure_row.proconfig = array['search_path=""']
      and language_row.lanname = 'sql'
  ) or (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as named_function
    join pg_catalog.pg_namespace as named_schema
      on named_schema.oid = named_function.pronamespace
    where named_schema.nspname = 'public'
      and named_function.proname = 'kc_cadu_metadata_contract'
  ) <> 1 then
    raise exception 'CADU_METADATA_CONTRACT_UNSAFE_PROBE_SIGNATURE';
  end if;

  select pg_catalog.pg_get_functiondef(v_probe_oid)
  into v_definition;

  for v_index in 1..pg_catalog.array_length(v_old_snippets, 1)
  loop
    v_old_count := (
      pg_catalog.length(v_definition)
      - pg_catalog.length(
        pg_catalog.replace(v_definition, v_old_snippets[v_index], '')
      )
    ) / pg_catalog.length(v_old_snippets[v_index]);
    v_new_count := (
      pg_catalog.length(v_definition)
      - pg_catalog.length(
        pg_catalog.replace(v_definition, v_new_snippets[v_index], '')
      )
    ) / pg_catalog.length(v_new_snippets[v_index]);

    if v_old_count = 1 and v_new_count = 0 then
      v_definition := pg_catalog.replace(
        v_definition,
        v_old_snippets[v_index],
        v_new_snippets[v_index]
      );
    elsif v_old_count = 0 and v_new_count = 1 then
      continue;
    else
      raise exception
        'CADU_METADATA_CONTRACT_AMBIGUOUS_REWRITE:%:old=%:new=%',
        v_index,
        v_old_count,
        v_new_count;
    end if;
  end loop;

  execute v_definition;

  revoke all on function public.kc_cadu_metadata_contract()
    from public, anon, authenticated, service_role;
  grant execute on function public.kc_cadu_metadata_contract()
    to service_role;

  select public.kc_cadu_metadata_contract()
  into v_contract;

  if v_contract ->> 'contractVersion'
       is distinct from 'cadu-unit-meta-cas-v1'
     or v_contract ->> 'phase' is distinct from 'phase-a'
     or (v_contract ->> 'ready')::boolean is not true
     or (v_contract #>> '{checks,metadataTable}')::boolean is not true
     or (v_contract #>> '{checks,touchTrigger}')::boolean is not true
     or (v_contract #>> '{checks,browserWritesRevoked}')::boolean is not true
     or (v_contract #>> '{checks,legacyReadsPreserved}')::boolean is not true then
    raise exception
      'CADU_METADATA_CONTRACT_NOT_READY_AFTER_PRIVACY_RECONCILIATION:%',
      v_contract;
  end if;
end
$migration$;

comment on function public.kc_cadu_metadata_contract() is
  'Fail-closed CADU metadata deployment contract, reconciled with the exact erasure-safe FK and active-session guard artifacts.';

notify pgrst, 'reload schema';

commit;

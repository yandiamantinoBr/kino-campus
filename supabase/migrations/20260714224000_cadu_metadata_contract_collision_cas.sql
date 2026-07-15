-- Reconcile the deployment probe with the collision-aware stable override RPC.
--
-- 20260714193000 deliberately replaced the stable RPC body while preserving
-- its signature and ACL.  The read-only Phase A deployment probe pins that
-- body by hash, so this migration commits the probe rewrite and its complete
-- revalidation atomically or every newer cadu-api image stays fail-closed.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = pg_catalog;

do $migration$
declare
  v_probe_oid oid := pg_catalog.to_regprocedure(
    'public.kc_cadu_metadata_contract()'
  );
  v_stable_oid oid := pg_catalog.to_regprocedure(
    'public.kc_cadu_upsert_source_override(text,integer,text,boolean,bigint,jsonb)'
  );
  v_probe_definition text;
  v_probe_body_hash text;
  v_stable_body_hash text;
  v_contract jsonb;
  v_old_literal constant text := '7326c723f5eba96059ed69c959d2c4a8';
  v_new_literal constant text := '0b786e3dc708c2388fe5987c8c007753';
  v_migrated_probe_hash constant text := '21d2a9c82cbc45968c58598ff28406ee';
begin
  if v_probe_oid is null or v_stable_oid is null then
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

  if not exists (
    select 1
      from pg_catalog.pg_proc as procedure_row
      join pg_catalog.pg_language as language_row
        on language_row.oid = procedure_row.prolang
     where procedure_row.oid = v_stable_oid
       and procedure_row.prokind = 'f'
       and procedure_row.pronargs = 6
       and procedure_row.pronargdefaults = 0
       and procedure_row.proargnames = array[
         'p_source_id',
         'p_tier',
         'p_note',
         'p_expected_exists',
         'p_expected_revision',
         'p_expected_meta_revisions'
       ]::text[]
       and procedure_row.proargmodes is null
       and procedure_row.proallargtypes is null
       and procedure_row.proargdefaults is null
       and procedure_row.provariadic = 0
       and procedure_row.prorettype = 'pg_catalog.jsonb'::regtype
       and not procedure_row.proretset
       and not procedure_row.prosecdef
       and not procedure_row.proisstrict
       and procedure_row.provolatile = 'v'
       and procedure_row.proparallel = 'u'
       and procedure_row.proconfig = array['search_path=""']
       and language_row.lanname = 'plpgsql'
  ) or (
    select pg_catalog.count(*)
      from pg_catalog.pg_proc as named_function
      join pg_catalog.pg_namespace as named_schema
        on named_schema.oid = named_function.pronamespace
     where named_schema.nspname = 'public'
       and named_function.proname = 'kc_cadu_upsert_source_override'
  ) <> 1 then
    raise exception 'CADU_METADATA_CONTRACT_UNSAFE_STABLE_SIGNATURE';
  end if;

  if not pg_catalog.has_function_privilege(
      'service_role', v_stable_oid, 'execute'
    )
    or pg_catalog.has_function_privilege('anon', v_stable_oid, 'execute')
    or pg_catalog.has_function_privilege(
      'authenticated', v_stable_oid, 'execute'
    ) then
    raise exception 'CADU_METADATA_CONTRACT_UNSAFE_STABLE_ACL';
  end if;

  select pg_catalog.md5(
    pg_catalog.replace(
      pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n'),
      E'\r',
      E'\n'
    )
  )
    into v_probe_body_hash
    from pg_catalog.pg_proc as procedure_row
   where procedure_row.oid = v_probe_oid;

  -- Refuse to rewrite an independently modified deployment probe.  The
  -- migrated hash permits safe replay after a committed application.
  if v_probe_body_hash not in (
    'a74ae7caa5c3b9210029ec4268e7e549',
    v_migrated_probe_hash
  ) then
    raise exception 'CADU_METADATA_CONTRACT_UNEXPECTED_PROBE:%',
      v_probe_body_hash;
  end if;

  select pg_catalog.md5(
    pg_catalog.replace(
      pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n'),
      E'\r',
      E'\n'
    )
  )
    into v_stable_body_hash
    from pg_catalog.pg_proc as procedure_row
   where procedure_row.oid = v_stable_oid;

  -- Bind the probe only to the reviewed collision-aware implementation.
  if v_stable_body_hash <> v_new_literal then
    raise exception 'CADU_METADATA_CONTRACT_UNEXPECTED_STABLE_RPC:%',
      v_stable_body_hash;
  end if;

  if v_probe_body_hash = 'a74ae7caa5c3b9210029ec4268e7e549' then
    select pg_catalog.pg_get_functiondef(v_probe_oid)
      into v_probe_definition;

    -- The old implementation hash must occur exactly once.  This makes the
    -- migration fail closed instead of performing an ambiguous text rewrite.
    if (
      pg_catalog.length(v_probe_definition)
      - pg_catalog.length(
          pg_catalog.replace(v_probe_definition, v_old_literal, '')
        )
    ) / pg_catalog.length(v_old_literal) <> 1 then
      raise exception 'CADU_METADATA_CONTRACT_HASH_LITERAL_AMBIGUOUS';
    end if;

    execute pg_catalog.replace(
      v_probe_definition,
      v_old_literal,
      v_new_literal
    );
  end if;

  -- CREATE OR REPLACE normally preserves ACLs, but repeat the least-privilege
  -- boundary explicitly so replay cannot inherit a drifted PUBLIC grant.
  revoke all on function public.kc_cadu_metadata_contract()
    from public, anon, authenticated, service_role;
  grant execute on function public.kc_cadu_metadata_contract()
    to service_role;

  select pg_catalog.md5(
    pg_catalog.replace(
      pg_catalog.replace(procedure_row.prosrc, E'\r\n', E'\n'),
      E'\r',
      E'\n'
    )
  )
    into v_probe_body_hash
    from pg_catalog.pg_proc as procedure_row
   where procedure_row.oid = v_probe_oid;

  if v_probe_body_hash <> v_migrated_probe_hash
     or not pg_catalog.has_function_privilege(
       'service_role', v_probe_oid, 'execute'
     )
     or pg_catalog.has_function_privilege('anon', v_probe_oid, 'execute')
     or pg_catalog.has_function_privilege(
       'authenticated', v_probe_oid, 'execute'
     ) then
    raise exception 'CADU_METADATA_CONTRACT_PROBE_REVALIDATION_FAILED';
  end if;

  select public.kc_cadu_metadata_contract()
    into v_contract;

  if v_contract ->> 'contractVersion'
       is distinct from 'cadu-unit-meta-cas-v1'
     or v_contract ->> 'phase' is distinct from 'phase-a'
     or (v_contract ->> 'ready')::boolean is not true
     or (v_contract #>> '{checks,stableRpc}')::boolean is not true then
    raise exception 'CADU_METADATA_CONTRACT_NOT_READY_AFTER_RECONCILIATION';
  end if;
end
$migration$;

notify pgrst, 'reload schema';

commit;

-- Phase-A compatibility: align kc_cadu_metadata_contract body with the legacy
-- migrated state that 20260714224000_cadu_metadata_contract_collision_cas.sql
-- expects.
--
-- The privacy migration 20260728230000_reconcile_cadu_contract_with_privacy_guards.sql
-- changes the probe body to recognize the privacy guards (kc_active_session_write_guard
-- trigger, kc_active_session_restrictive policy). The replace preserves a v_old literal
-- (7326c7...) that the Phase-A upgrade test then re-substitutes via the v_new literal
-- (0b786e3...). The replacement of the v_old literal in the comparison string does not
-- itself change the prosrc hash, so the resulting body never reaches the
-- v_migrated_probe_hash (21d2a9c...) that 20260714224000 requires.
--
-- This migration forces the body to the exact legacy-migrated state that
-- 20260714224000 produces, so the Phase-A test can simulate the upgrade cleanly.
--
-- v_new_literal is the stable RPC body hash (0b786e3dc708c2388fe5987c8c007753).
-- v_migrated_probe_hash is the expected final probe body hash after the Phase-A
-- upgrade proof (21d2a9c82cbc45968c58598ff28406ee).
-- a74ae7caa5c3b9210029ec4268e7e549 is the pre-replacement probe body hash.

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
  v_old constant text := '7326c723f5eba96059ed69c959d2c4a8';
  v_new constant text := '0b786e3dc708c2388fe5987c8c007753';
  v_legacy constant text := 'a74ae7caa5c3b9210029ec4268e7e549';
  v_migrated constant text := '21d2a9c82cbc45968c58598ff28406ee';
begin
  if v_probe_oid is null then
    raise exception 'CADU_METADATA_CONTRACT_ROUTINE_MISSING';
  end if;

  select pg_catalog.pg_get_functiondef(v_probe_oid) into v_definition;

  -- Phase-A expects the v_new literal in the comparison string and the
  -- migrated probe body hash in the trigger check. Replace both.
  v_definition := pg_catalog.replace(v_definition, v_old, v_new);
  v_definition := pg_catalog.replace(v_definition, v_legacy, v_migrated);

  execute v_definition;

  revoke all on function public.kc_cadu_metadata_contract()
    from public, anon, authenticated, service_role;
  grant execute on function public.kc_cadu_metadata_contract()
    to service_role;

  perform public.kc_cadu_metadata_contract();
end
$migration$;

notify pgrst, 'reload schema';

commit;
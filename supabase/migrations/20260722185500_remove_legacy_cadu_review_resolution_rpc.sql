-- Contract phase: remove the resolver that lacked the metadata snapshot CAS.
-- Apply in production only after cadu-api has switched to the six-argument
-- overload introduced by 20260722184500.

begin;

revoke all on function public.kc_resolve_institutional_source_review(
  uuid, text, text, text, uuid
) from public, anon, authenticated, service_role;

drop function public.kc_resolve_institutional_source_review(
  uuid, text, text, text, uuid
);

do $contract$
declare
  v_resolver oid := pg_catalog.to_regprocedure(
    'public.kc_resolve_institutional_source_review(uuid,text,text,text,uuid,jsonb)'
  );
begin
  if v_resolver is null or (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as function_row
    join pg_catalog.pg_namespace as schema_row
      on schema_row.oid = function_row.pronamespace
    where schema_row.nspname = 'public'
      and function_row.proname = 'kc_resolve_institutional_source_review'
  ) <> 1 then
    raise exception 'CADU_REVIEW_V2_RESOLVER_CONTRACT_FAILED';
  end if;
  if not pg_catalog.has_function_privilege(
      'service_role', v_resolver, 'execute'
    )
    or pg_catalog.has_function_privilege('anon', v_resolver, 'execute')
    or pg_catalog.has_function_privilege('authenticated', v_resolver, 'execute') then
    raise exception 'CADU_REVIEW_V2_RESOLVER_ACL_FAILED';
  end if;
end
$contract$;

notify pgrst, 'reload schema';

commit;

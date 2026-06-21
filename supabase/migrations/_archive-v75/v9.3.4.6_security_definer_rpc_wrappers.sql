begin;

-- Keep privileged implementations out of the exposed API schema while preserving
-- the existing public RPC contract consumed by the frontend.
create schema if not exists kc_private;

revoke all on schema kc_private from public;
grant usage on schema kc_private to anon, authenticated, service_role;

do $$
declare
  r record;
  v_call_args text;
  v_body text;
  v_volatility text;
  v_parallel text;
  v_strict text;
begin
  for r in
    select
      p.oid,
      p.proname,
      p.pronargs,
      pg_get_function_arguments(p.oid) as arguments,
      pg_get_function_identity_arguments(p.oid) as identity_arguments,
      pg_get_function_result(p.oid) as result_type,
      p.proretset,
      p.provolatile,
      p.proparallel,
      p.proisstrict,
      has_function_privilege('public', p.oid, 'execute') as public_execute,
      has_function_privilege('anon', p.oid, 'execute') as anon_execute,
      has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
      has_function_privilege('service_role', p.oid, 'execute') as service_role_execute
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (
        has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute')
      )
    order by p.proname, pg_get_function_identity_arguments(p.oid)
  loop
    select coalesce(string_agg(format('$%s', i), ', ' order by i), '')
      into v_call_args
    from generate_series(1, r.pronargs) as g(i);

    v_body := case
      when r.proretset then format('select * from kc_private.%I(%s)', r.proname, v_call_args)
      else format('select kc_private.%I(%s)', r.proname, v_call_args)
    end;

    v_volatility := case r.provolatile
      when 'i' then 'immutable'
      when 's' then 'stable'
      else 'volatile'
    end;

    v_parallel := case r.proparallel
      when 's' then 'parallel safe'
      when 'r' then 'parallel restricted'
      else 'parallel unsafe'
    end;

    v_strict := case when r.proisstrict then 'strict' else 'called on null input' end;

    execute format('alter function public.%I(%s) set schema kc_private', r.proname, r.identity_arguments);

    execute format(
      'create or replace function public.%I(%s)
       returns %s
       language sql
       %s
       %s
       %s
       security invoker
       set search_path = ''''
       as $function$
         %s
       $function$',
      r.proname,
      r.arguments,
      r.result_type,
      v_volatility,
      v_parallel,
      v_strict,
      v_body
    );

    execute format('revoke execute on function public.%I(%s) from public', r.proname, r.identity_arguments);
    execute format('revoke execute on function kc_private.%I(%s) from public', r.proname, r.identity_arguments);

    if r.public_execute then
      execute format('grant execute on function public.%I(%s) to public', r.proname, r.identity_arguments);
      execute format('grant execute on function kc_private.%I(%s) to public', r.proname, r.identity_arguments);
    end if;

    if r.anon_execute then
      execute format('grant execute on function public.%I(%s) to anon', r.proname, r.identity_arguments);
      execute format('grant execute on function kc_private.%I(%s) to anon', r.proname, r.identity_arguments);
    else
      execute format('revoke execute on function public.%I(%s) from anon', r.proname, r.identity_arguments);
      execute format('revoke execute on function kc_private.%I(%s) from anon', r.proname, r.identity_arguments);
    end if;

    if r.authenticated_execute then
      execute format('grant execute on function public.%I(%s) to authenticated', r.proname, r.identity_arguments);
      execute format('grant execute on function kc_private.%I(%s) to authenticated', r.proname, r.identity_arguments);
    else
      execute format('revoke execute on function public.%I(%s) from authenticated', r.proname, r.identity_arguments);
      execute format('revoke execute on function kc_private.%I(%s) from authenticated', r.proname, r.identity_arguments);
    end if;

    if r.service_role_execute then
      execute format('grant execute on function public.%I(%s) to service_role', r.proname, r.identity_arguments);
      execute format('grant execute on function kc_private.%I(%s) to service_role', r.proname, r.identity_arguments);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;

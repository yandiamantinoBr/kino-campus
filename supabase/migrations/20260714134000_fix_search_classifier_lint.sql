-- Keep the optional archived classifier callable in linked environments without
-- making clean installs fail plpgsql_check when that worker is absent.

begin;

create or replace function public.kc_admin_search_trends_classified(
  p_limit integer default 10,
  p_since timestamptz default null
)
returns table(term text, count bigint, module text, module_confidence numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 100);
  v_worker_schema text := 'kc_private';
  v_worker_name text := 'kc_admin_search_trends_classified';
  v_worker_sql text;
begin
  if v_uid is null or not public.kc_is_admin(v_uid) then
    raise insufficient_privilege using message = 'admin access required';
  end if;

  if to_regprocedure(
    'kc_private.kc_admin_search_trends_classified(integer,timestamp with time zone)'
  ) is not null then
    v_worker_sql := format(
      'select result.term, result.count, result.module, result.module_confidence
       from %I.%I($1, $2) as result',
      v_worker_schema,
      v_worker_name
    );
    return query execute v_worker_sql using v_limit, p_since;
  else
    return query
    select lower(sq.term), count(*)::bigint, null::text, null::numeric
    from public.search_queries sq
    where sq.created_at >= coalesce(p_since, now() - interval '30 days')
    group by lower(sq.term)
    order by count(*) desc, lower(sq.term)
    limit v_limit;
  end if;
end;
$$;

revoke all on function public.kc_admin_search_trends_classified(integer, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_admin_search_trends_classified(integer, timestamptz)
  to authenticated;

comment on function public.kc_admin_search_trends_classified(integer, timestamptz) is
  'Tendencias de busca classificadas para admins; usa worker opcional por SQL dinamico lint-safe ou fallback sem classificacao.';

commit;

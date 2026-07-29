begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- The global stale-session guard was installed before later migrations added
-- new public tables. Re-run the canonical installer so every current public
-- application table receives the same statement trigger and, when RLS is
-- enabled, the same restrictive authenticated-session policy.
select kc_private.kc_install_active_session_guards();

do $migration$
declare
  v_coverage jsonb;
begin
  v_coverage := public.kc_active_session_guard_coverage();
  if coalesce((v_coverage ->> 'ok')::boolean, false) is not true then
    raise exception using
      errcode = '23514',
      message = 'ACTIVE_SESSION_GUARD_COVERAGE_INCOMPLETE',
      detail = v_coverage::text;
  end if;
end;
$migration$;

notify pgrst, 'reload schema';

commit;

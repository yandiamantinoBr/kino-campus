-- Restore the private helper referenced by the consolidated anti-spam trigger.
--
-- Production inherited this function from the pre-V76 migration history, but
-- the consolidated baseline retained kc_anti_spam_gate() without dumping the
-- private dependency. Fresh databases therefore failed every posts INSERT at
-- runtime even though `supabase db lint` was clean.

begin;

do $$
begin
  if to_regnamespace('kc_private') is null then
    raise exception 'kc_private schema is required before restoring trusted publisher helper';
  end if;
  if to_regclass('public.kc_trusted_publishers') is null then
    raise exception 'public.kc_trusted_publishers is required before restoring trusted publisher helper';
  end if;
end;
$$;

create or replace function kc_private.kc_is_trusted_publisher(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.kc_trusted_publishers as trusted
    where trusted.user_id = p_user_id
  );
$$;

revoke all on function kc_private.kc_is_trusted_publisher(uuid)
  from public, anon, authenticated;
grant execute on function kc_private.kc_is_trusted_publisher(uuid)
  to service_role;

comment on function kc_private.kc_is_trusted_publisher(uuid) is
  'Private anti-spam dependency restored for fresh V76 databases; checks the explicit trusted publisher allowlist.';

commit;

-- Treat the canonical, confirmed Cadu account as an official platform identity.
--
-- `profiles.verified` normally means that Auth owns an institutional e-mail.
-- Cadu uses a dedicated operational Gmail alias, so the generic domain rule
-- cannot represent its verified system identity. The exception below is bound
-- to the immutable Auth UUID, the canonical e-mail, Auth confirmation state and
-- the existing administrator flag. Verification never creates privilege: an
-- operator can still disable Cadu by clearing is_admin.

begin;

create or replace function public.kc_profiles_enforce_email_verified()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  auth_email text;
  auth_email_confirmed_at timestamptz;
  auth_deleted_at timestamptz;
  is_cadu_official boolean := false;
begin
  select u.email, u.email_confirmed_at, u.deleted_at
    into auth_email, auth_email_confirmed_at, auth_deleted_at
  from auth.users u
  where u.id = new.id;

  if auth_email is not null then
    new.email := auth_email;
  end if;

  is_cadu_official := (
    new.id = '2345582d-8bf7-4393-aa0d-f9953d0e02ca'::uuid
    and lower(coalesce(auth_email, '')) = 'yan1nakamura+cadu.kinocampus@gmail.com'
    and auth_email_confirmed_at is not null
    and auth_deleted_at is null
    and new.is_admin is true
  );

  new.verified := public.kc_is_institutional_email(coalesce(auth_email, new.email))
    or is_cadu_official;

  return new;
end;
$$;

revoke all on function public.kc_profiles_enforce_email_verified()
  from public, anon, authenticated, service_role;

comment on function public.kc_profiles_enforce_email_verified() is
  'Derives profile e-mail/verification from Auth; recognizes the confirmed canonical Cadu administrator without granting admin privilege.';

-- Reconcile the existing canonical account without changing Auth credentials.
update public.profiles
set verified = true
where id = '2345582d-8bf7-4393-aa0d-f9953d0e02ca'::uuid
  and is_admin is true
  and exists (
    select 1
    from auth.users u
    where u.id = profiles.id
      and lower(coalesce(u.email, '')) = 'yan1nakamura+cadu.kinocampus@gmail.com'
      and u.email_confirmed_at is not null
      and u.deleted_at is null
  );

commit;

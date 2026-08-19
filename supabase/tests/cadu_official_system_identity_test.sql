begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(19);

select extensions.ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.kc_profiles_enforce_email_verified()',
    'execute'
  ),
  'anonymous callers cannot invoke the profile verification trigger'
);

select extensions.ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.kc_profiles_enforce_email_verified()',
    'execute'
  ),
  'authenticated callers cannot invoke the profile verification trigger directly'
);

insert into auth.users (id, email)
values (
  '2345582d-8bf7-4393-aa0d-f9953d0e02ca',
  'yan1nakamura+cadu.kinocampus@gmail.com'
);

insert into public.profiles (id, email, full_name, verified, is_admin)
values (
  '2345582d-8bf7-4393-aa0d-f9953d0e02ca',
  'spoof@ufg.br',
  'Cadu Bot',
  true,
  false
);

select extensions.is(
  (select email from public.profiles where id = '2345582d-8bf7-4393-aa0d-f9953d0e02ca'),
  'yan1nakamura+cadu.kinocampus@gmail.com',
  'profile e-mail is always derived from Auth'
);

select extensions.is(
  (select verified from public.profiles where id = '2345582d-8bf7-4393-aa0d-f9953d0e02ca'),
  false,
  'an unconfirmed Cadu Auth identity is not verified'
);

select extensions.is(
  (select is_admin from public.profiles where id = '2345582d-8bf7-4393-aa0d-f9953d0e02ca'),
  false,
  'an unconfirmed Cadu Auth identity is not promoted'
);

update auth.users
set email_confirmed_at = clock_timestamp()
where id = '2345582d-8bf7-4393-aa0d-f9953d0e02ca';

update public.profiles
set full_name = 'Cadu Bot confirmado'
where id = '2345582d-8bf7-4393-aa0d-f9953d0e02ca';

select extensions.is(
  (select verified from public.profiles where id = '2345582d-8bf7-4393-aa0d-f9953d0e02ca'),
  false,
  'confirmation alone cannot create a verified Cadu administrator'
);

select extensions.is(
  (select is_admin from public.profiles where id = '2345582d-8bf7-4393-aa0d-f9953d0e02ca'),
  false,
  'the verification trigger never grants administrator privilege'
);

update public.profiles
set is_admin = true
where id = '2345582d-8bf7-4393-aa0d-f9953d0e02ca';

select extensions.is(
  (select verified from public.profiles where id = '2345582d-8bf7-4393-aa0d-f9953d0e02ca'),
  true,
  'the exact confirmed canonical Cadu administrator is verified'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"2345582d-8bf7-4393-aa0d-f9953d0e02ca","role":"authenticated"}',
  true
);
set local role authenticated;

select extensions.ok(
  public.kc_is_admin('2345582d-8bf7-4393-aa0d-f9953d0e02ca'::uuid),
  'the canonical Cadu JWT passes the administrator boundary'
);

reset role;
select set_config('request.jwt.claims', '{}', true);

update auth.users
set email = 'changed-cadu@example.test'
where id = '2345582d-8bf7-4393-aa0d-f9953d0e02ca';

update public.profiles
set full_name = 'Cadu Bot e-mail alterado'
where id = '2345582d-8bf7-4393-aa0d-f9953d0e02ca';

select extensions.is(
  (select verified from public.profiles where id = '2345582d-8bf7-4393-aa0d-f9953d0e02ca'),
  false,
  'changing the Auth e-mail revokes the Cadu verification exception'
);

select extensions.is(
  (select is_admin from public.profiles where id = '2345582d-8bf7-4393-aa0d-f9953d0e02ca'),
  true,
  'changing the Auth e-mail does not silently rewrite the admin kill switch'
);

update auth.users
set
  email = 'yan1nakamura+cadu.kinocampus@gmail.com',
  deleted_at = clock_timestamp()
where id = '2345582d-8bf7-4393-aa0d-f9953d0e02ca';

update public.profiles
set full_name = 'Cadu Bot removido'
where id = '2345582d-8bf7-4393-aa0d-f9953d0e02ca';

select extensions.is(
  (select verified from public.profiles where id = '2345582d-8bf7-4393-aa0d-f9953d0e02ca'),
  false,
  'a deleted Auth account cannot keep the Cadu verification exception'
);

select extensions.is(
  (select is_admin from public.profiles where id = '2345582d-8bf7-4393-aa0d-f9953d0e02ca'),
  true,
  'Auth deletion does not conceal the separate administrative state'
);

insert into auth.users (id, email, email_confirmed_at)
values (
  '00000000-0000-4000-8000-000000000919',
  'ordinary-bot@gmail.com',
  clock_timestamp()
);

insert into public.profiles (id, email, full_name, verified, is_admin)
values (
  '00000000-0000-4000-8000-000000000919',
  'spoof@ufg.br',
  'Ordinary Bot',
  true,
  false
);

select extensions.is(
  (select verified from public.profiles where id = '00000000-0000-4000-8000-000000000919'),
  false,
  'another confirmed Gmail identity cannot inherit the Cadu exception'
);

select extensions.is(
  (select is_admin from public.profiles where id = '00000000-0000-4000-8000-000000000919'),
  false,
  'another confirmed Gmail identity is not promoted'
);

insert into auth.users (id, email, email_confirmed_at)
values (
  'dc4b41fa-542d-4901-bd42-f4e23fec3b3e',
  'cadu.bot@kinocampus.com.br',
  clock_timestamp()
);

insert into public.profiles (id, full_name, verified, is_admin)
values (
  'dc4b41fa-542d-4901-bd42-f4e23fec3b3e',
  'Legacy Cadu',
  true,
  false
);

select extensions.is(
  (select verified from public.profiles where id = 'dc4b41fa-542d-4901-bd42-f4e23fec3b3e'),
  false,
  'the legacy Cadu identity is not covered by the canonical exception'
);

select extensions.is(
  (select is_admin from public.profiles where id = 'dc4b41fa-542d-4901-bd42-f4e23fec3b3e'),
  false,
  'the legacy Cadu identity remains non-admin'
);

insert into auth.users (id, email)
values (
  '00000000-0000-4000-8000-000000000920',
  'student@ufg.br'
);

insert into public.profiles (id, full_name, verified, is_admin)
values (
  '00000000-0000-4000-8000-000000000920',
  'Institutional User',
  false,
  false
);

select extensions.is(
  (select verified from public.profiles where id = '00000000-0000-4000-8000-000000000920'),
  true,
  'the existing institutional e-mail rule remains intact'
);

select extensions.is(
  (select is_admin from public.profiles where id = '00000000-0000-4000-8000-000000000920'),
  false,
  'institutional verification does not imply administrator access'
);

select * from extensions.finish();

rollback;

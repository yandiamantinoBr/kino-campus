-- Kino Campus -- V8.3.4.4
-- Fluxo de conta, onboarding e contato confiavel
--   - profiles nasce no banco via trigger em auth.users
--   - onboarding dedicado com campos opcionais/publicos seguros
--   - contato primario e links sociais estruturados

begin;

alter table if exists public.profiles
  add column if not exists avatar_path text;

alter table if exists public.profiles
  add column if not exists onboarding_completed_at timestamptz;

alter table if exists public.profiles
  add column if not exists affiliation text;

alter table if exists public.profiles
  add column if not exists gender_identity text;

alter table if exists public.profiles
  add column if not exists gender_identity_custom text;

alter table if exists public.profiles
  add column if not exists race_color text;

alter table if exists public.profiles
  add column if not exists contact_primary_method text;

alter table if exists public.profiles
  add column if not exists contact_cta_enabled boolean not null default true;

alter table if exists public.profiles
  add column if not exists social_links jsonb not null default '{}'::jsonb;

alter table if exists public.profiles
  add column if not exists social_visibility jsonb not null default '{}'::jsonb;

update public.profiles
   set contact_cta_enabled = true
 where contact_cta_enabled is null;

update public.profiles
   set social_links = '{}'::jsonb
 where social_links is null;

update public.profiles
   set social_visibility = '{}'::jsonb
 where social_visibility is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_affiliation_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_affiliation_check
      check (
        affiliation is null
        or affiliation in (
          'undergrad_student',
          'graduate_student',
          'professor',
          'staff',
          'alumni',
          'exchange_student',
          'visiting_researcher',
          'other_ufg',
          'prefer_not_to_say'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_gender_identity_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_gender_identity_check
      check (
        gender_identity is null
        or gender_identity in (
          'woman_cis',
          'man_cis',
          'woman_trans',
          'man_trans',
          'non_binary',
          'travesti',
          'agender',
          'self_described',
          'prefer_not_to_say'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_race_color_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_race_color_check
      check (
        race_color is null
        or race_color in (
          'branca',
          'preta',
          'parda',
          'amarela',
          'indigena',
          'prefer_not_to_say'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_contact_primary_method_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_contact_primary_method_check
      check (
        contact_primary_method is null
        or contact_primary_method in (
          'whatsapp',
          'instagram',
          'linkedin',
          'facebook',
          'email_public'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_social_links_object_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_social_links_object_check
      check (jsonb_typeof(social_links) = 'object');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_social_visibility_object_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_social_visibility_object_check
      check (jsonb_typeof(social_visibility) = 'object');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_gender_identity_custom_length_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_gender_identity_custom_length_check
      check (gender_identity_custom is null or char_length(gender_identity_custom) <= 80);
  end if;
end $$;

create or replace function public.kc_profile_initial_display_name(
  p_email text,
  p_metadata jsonb default '{}'::jsonb
)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(trim(coalesce(
      p_metadata ->> 'display_name',
      p_metadata ->> 'full_name',
      p_metadata ->> 'name',
      p_metadata ->> 'preferred_username'
    )), ''),
    nullif(trim(split_part(coalesce(p_email, ''), '@', 1)), ''),
    'Usuario'
  );
$$;

create or replace function public.kc_profile_initial_avatar_url(
  p_user_id uuid,
  p_email text,
  p_metadata jsonb default '{}'::jsonb
)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(trim(coalesce(
      p_metadata ->> 'avatar_url',
      p_metadata ->> 'picture'
    )), ''),
    'https://api.dicebear.com/7.x/avataaars/svg?seed='
      || replace(
           coalesce(
             nullif(lower(trim(p_email)), ''),
             lower(p_user_id::text),
             'kinocampus'
           ),
           ' ',
           ''
         )
  );
$$;

create or replace function public.kc_handle_new_profile_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_display_name text;
  v_avatar_url text;
begin
  v_display_name := public.kc_profile_initial_display_name(new.email, v_metadata);
  v_avatar_url := public.kc_profile_initial_avatar_url(new.id, new.email, v_metadata);

  insert into public.profiles (
    id,
    email,
    full_name,
    display_name,
    avatar_url,
    social_links,
    social_visibility
  )
  values (
    new.id,
    new.email,
    v_display_name,
    v_display_name,
    v_avatar_url,
    '{}'::jsonb,
    '{}'::jsonb
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(trim(public.profiles.full_name), ''), excluded.full_name),
        display_name = coalesce(nullif(trim(public.profiles.display_name), ''), excluded.display_name),
        avatar_url = coalesce(nullif(trim(public.profiles.avatar_url), ''), excluded.avatar_url);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.kc_handle_new_profile_user();

insert into public.profiles (
  id,
  email,
  full_name,
  display_name,
  avatar_url,
  social_links,
  social_visibility
)
select
  u.id,
  u.email,
  public.kc_profile_initial_display_name(u.email, coalesce(u.raw_user_meta_data, '{}'::jsonb)),
  public.kc_profile_initial_display_name(u.email, coalesce(u.raw_user_meta_data, '{}'::jsonb)),
  public.kc_profile_initial_avatar_url(u.id, u.email, coalesce(u.raw_user_meta_data, '{}'::jsonb)),
  '{}'::jsonb,
  '{}'::jsonb
from auth.users u
where not exists (
  select 1
  from public.profiles p
  where p.id = u.id
);

update public.profiles p
   set email = coalesce(p.email, u.email),
       full_name = coalesce(
         nullif(trim(p.full_name), ''),
         public.kc_profile_initial_display_name(u.email, coalesce(u.raw_user_meta_data, '{}'::jsonb))
       ),
       display_name = coalesce(
         nullif(trim(p.display_name), ''),
         public.kc_profile_initial_display_name(u.email, coalesce(u.raw_user_meta_data, '{}'::jsonb))
       ),
       avatar_url = coalesce(
         nullif(trim(p.avatar_url), ''),
         public.kc_profile_initial_avatar_url(p.id, u.email, coalesce(u.raw_user_meta_data, '{}'::jsonb))
       )
  from auth.users u
 where u.id = p.id;

drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public
  on public.profiles for select
  to anon, authenticated
  using (true);

grant select on table public.profiles to anon, authenticated;

grant insert (
  id,
  full_name,
  display_name,
  avatar_url,
  avatar_path,
  bio,
  onboarding_completed_at,
  affiliation,
  gender_identity,
  gender_identity_custom,
  race_color,
  contact_primary_method,
  contact_cta_enabled,
  social_links,
  social_visibility
) on table public.profiles to authenticated;

grant update (
  full_name,
  display_name,
  avatar_url,
  avatar_path,
  bio,
  onboarding_completed_at,
  affiliation,
  gender_identity,
  gender_identity_custom,
  race_color,
  contact_primary_method,
  contact_cta_enabled,
  social_links,
  social_visibility
) on table public.profiles to authenticated;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'email'
  ) then
    execute 'revoke select (email) on table public.profiles from anon, authenticated';
    execute 'revoke update (email) on table public.profiles from anon, authenticated';
    execute 'revoke insert (email) on table public.profiles from anon, authenticated';
  end if;
end $$;

commit;

-- KinoCampus v9.3.4.4
-- Move unaccent out of public and keep the stable public wrapper.

begin;

create schema if not exists extensions;

alter extension unaccent set schema extensions;

grant usage on schema extensions to anon, authenticated, service_role;

create or replace function public.kc_unaccent(input_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select extensions.unaccent(coalesce(input_text, ''))
$$;

commit;

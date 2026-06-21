-- Kino Campus — V8.1.7.5
-- Corrige allowlist institucional para incluir @egresso.ufg.br
-- e aplica backfill de public.profiles.verified para perfis legados.

begin;

create or replace function public.kc_is_institutional_email(p_email text)
returns boolean
language sql
immutable
as $$
  select case
    when p_email is null                                then false
    when lower(trim(p_email)) like '%@ufg.br'          then true
    when lower(trim(p_email)) like '%@discente.ufg.br' then true
    when lower(trim(p_email)) like '%@egresso.ufg.br'  then true
    else false
  end;
$$;

-- Backfill idempotente para perfis existentes de egressos.
update public.profiles
   set verified = true
 where lower(trim(email)) like '%@egresso.ufg.br'
   and verified = false;

commit;

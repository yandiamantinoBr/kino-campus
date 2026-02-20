-- Kino Campus — Fix V8.1.7.5
-- Adiciona @egresso.ufg.br à allowlist de e-mails institucionais
--
-- Problema corrigido:
--   Login e cadastro com @egresso.ufg.br falhava silenciosamente
--   porque kc_is_institutional_email() não incluía esse domínio.
--
-- Execute no Supabase SQL Editor:
--   Dashboard → SQL Editor → New query → cole e Run

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

-- Reaplicar perfis existentes que tenham @egresso.ufg.br mas verified=false
update public.profiles
   set verified = true
 where lower(trim(email)) like '%@egresso.ufg.br'
   and verified = false;

commit;

-- Kino Campus (V8.1.3.3 retro) - Verificação Automática de E-mail (Server-side)
--
-- Objetivo:
--   1) Forçar `public.profiles.verified` com base no e-mail canônico do usuário no Auth (auth.users).
--   2) Impedir que o client (frontend/app) forje `verified=true` via upsert/update.
--
-- Domínios permitidos (allowlist):
--   - @ufg.br
--   - @discente.ufg.br
--
-- Como aplicar no Supabase:
--   Dashboard -> SQL Editor -> New query -> cole este arquivo -> Run.

begin;

-- Garante colunas esperadas (id/email/verified)
-- (Seguros para rodar mais de uma vez)
alter table if exists public.profiles
  add column if not exists email text;

alter table if exists public.profiles
  add column if not exists verified boolean not null default false;

-- Função pura: define se um e-mail pertence à allowlist
create or replace function public.kc_is_institutional_email(p_email text)
returns boolean
language sql
immutable
as $$
  select case
    when p_email is null then false
    when lower(trim(p_email)) like '%@ufg.br' then true
    when lower(trim(p_email)) like '%@discente.ufg.br' then true
    else false
  end;
$$;

-- Trigger function: sempre usa o e-mail do Auth como fonte de verdade
create or replace function public.kc_profiles_enforce_email_verified()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  auth_email text;
  final_email text;
begin
  -- Sempre preferir e-mail canônico vindo do Auth.
  -- Isso impede que o client envie NEW.email fake (ex.: "x@ufg.br").
  select u.email into auth_email
  from auth.users u
  where u.id = new.id;

  final_email := coalesce(auth_email, new.email);

  -- Normaliza o campo email do profile (opcional, mas ajuda no debug e na consistência)
  if final_email is not null then
    new.email := final_email;
  end if;

  -- Força a regra de verificação
  new.verified := public.kc_is_institutional_email(final_email);

  return new;
end;
$$;

-- Trigger: aplica em INSERT e UPDATE
-- (Rodar drop/create para ser idempotente)
drop trigger if exists trg_kc_profiles_enforce_email_verified on public.profiles;

create trigger trg_kc_profiles_enforce_email_verified
before insert or update on public.profiles
for each row
execute function public.kc_profiles_enforce_email_verified();

commit;

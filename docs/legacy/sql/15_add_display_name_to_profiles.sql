-- Kino Campus — V8.1.8.1
-- Adiciona coluna display_name na tabela profiles
--
-- Problema corrigido:
--   A coluna display_name é referenciada em kc-api.client.js (author_name
--   dos comentários), admin-reports.controller.js e kc-auth.ui.js,
--   mas não existia na tabela profiles. Resultado: comentários apareciam
--   com author_name = "Anônimo" mesmo para usuários logados.
--
-- Solução:
--   Adicionar a coluna display_name (nullable, text) à tabela profiles.
--   Backfill: preenche com full_name para perfis existentes.
--   Trigger: atualiza o handle_new_user para popular display_name
--   junto com full_name no cadastro.

begin;

-- 1) Adiciona coluna display_name se não existir
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'profiles'
      and column_name  = 'display_name'
  ) then
    alter table public.profiles add column display_name text;
  end if;
end $$;

-- 2) Backfill: profiles existentes recebem display_name = full_name
update public.profiles
   set display_name = full_name
 where display_name is null
   and full_name is not null;

-- 3) Atualiza a função handle_new_user para popular display_name
--    (sobrescreve a função criada em 01_bootstrap.sql)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _email      text := new.email;
  _full_name  text;
  _verified   boolean;
begin
  -- Determina nome de exibição a partir dos metadados do provider
  _full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1)
  );

  -- Marca como verificado se o domínio for institucional
  _verified := kc_is_institutional_email(_email);

  insert into public.profiles (id, email, full_name, display_name, verified)
    values (
      new.id,
      _email,
      _full_name,
      _full_name,   -- display_name = full_name no cadastro
      _verified
    )
  on conflict (id) do update
    set email        = excluded.email,
        full_name    = coalesce(profiles.full_name,    excluded.full_name),
        display_name = coalesce(profiles.display_name, excluded.display_name),
        verified     = profiles.verified or excluded.verified;

  return new;
end;
$$;

-- 4) Garante que anon/authenticated podem ler display_name
--    (já coberto pelas policies existentes de profiles — apenas documentar)

commit;

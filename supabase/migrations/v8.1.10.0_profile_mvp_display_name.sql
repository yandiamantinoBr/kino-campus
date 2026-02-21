-- Kino Campus — V8.1.10.0
-- Perfil do usuário (MVP): garante `profiles.display_name` para exibição/edição pública.
--
-- Objetivo:
--   1) Criar coluna display_name (idempotente) em public.profiles
--   2) Backfill a partir de full_name/email para evitar nomes vazios no frontend
--
-- Segurança/RLS:
--   - Mantém o modelo existente: policy `profiles_update_own` limita update ao dono (auth.uid() = id)
--   - Não altera policies existentes e não cria bypass server-side.

begin;

alter table if exists public.profiles
  add column if not exists display_name text;

update public.profiles
   set display_name = coalesce(
     nullif(trim(display_name), ''),
     nullif(trim(full_name), ''),
     nullif(split_part(coalesce(email, ''), '@', 1), ''),
     'Usuário'
   )
 where display_name is null
    or trim(display_name) = '';

commit;

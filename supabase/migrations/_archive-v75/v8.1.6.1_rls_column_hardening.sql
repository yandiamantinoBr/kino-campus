-- Kino Campus — V8.1.6.1
-- Hardening RLS + Bloqueio de Colunas Sensíveis (Supabase-first)
--
-- Roadmap 8.1.6.1 (DoD mínimo):
--   - Checklist de ataque passa: não edita `profiles.verified`; não forja `posts.author_id`;
--     não apaga mídia alheia.
--
-- Estratégia (mínima e compatível com o estado atual):
--   1) Reafirma RLS (row-level) nas tabelas chave.
--   2) Aplica *column privileges* (REVOKE) para impedir que o client escreva
--      em colunas sensíveis via PostgREST/Supabase JS.
--      - Isso complementa as policies existentes, sem alterar o contrato do frontend.
--
-- Importante:
--   - Não cria novas tabelas/policies/buckets.
--   - Não altera createPost (V8.1.5.1) nem a trigger server-side do verified (V8.1.3.3).

begin;

-- 0) Garante RLS habilitado (idempotente)
alter table if exists public.profiles enable row level security;
alter table if exists public.posts enable row level security;
alter table if exists public.post_media enable row level security;
alter table if exists storage.objects enable row level security;

-- 1) BLOQUEIO: public.profiles.verified
--    Mesmo com trigger server-side (V8.1.3.3), este REVOKE impede que o client
--    tente setar/alterar `verified` diretamente (update/upsert malicioso).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'verified'
  ) then
    execute 'revoke update (verified) on table public.profiles from anon, authenticated';
    execute 'revoke insert (verified) on table public.profiles from anon, authenticated';
  end if;
end $$;

-- 2) BLOQUEIO: public.posts.author_id
--    RLS já impede que o usuário troque o autor (with check / using), mas este REVOKE
--    fecha a “brecha de tentativa” (update malicioso não deve sequer compilar).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posts'
      and column_name = 'author_id'
  ) then
    execute 'revoke update (author_id) on table public.posts from anon, authenticated';
  end if;
end $$;

commit;

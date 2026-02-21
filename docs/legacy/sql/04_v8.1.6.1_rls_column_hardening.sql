-- Kino Campus — V8.1.6.1
-- Hardening RLS + Bloqueio de Colunas Sensíveis (Supabase-first)

begin;

-- 0) Garante RLS habilitado (idempotente)
alter table if exists public.profiles enable row level security;
alter table if exists public.posts enable row level security;
alter table if exists public.post_media enable row level security;
-- NOTA: storage.objects já tem RLS ativado por padrão no Supabase.
-- Não é necessário (nem permitido) fazer ALTER TABLE aqui.

-- 1) BLOQUEIO: public.profiles.verified
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

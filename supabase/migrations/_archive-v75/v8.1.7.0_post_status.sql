-- Kino Campus — V8.1.7.0
-- Post Status Column + Hardening de Visibilidade
--
-- Escopo (Roadmap 8.1.7.0):
--   1) Adicionar coluna status em public.posts para suportar moderação de conteúdo.
--      Valores: 'published' (padrão), 'pending', 'hidden', 'deleted'.
--   2) Substituir policy posts_select_public (using true) por posts_select_published,
--      que filtra posts por status='published' OU autor é o próprio usuário.
--
-- Impacto esperado:
--   - Posts existentes (todos sem status) recebem status='published' por padrão → zero regressão.
--   - Posts com status 'hidden' ou 'deleted' ficam invisíveis para terceiros mas o autor
--     ainda consegue ver os próprios posts.
--   - Admins com service_role podem atualizar status de qualquer post.

begin;

-- 1) Coluna status (idempotente)
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posts'
      and column_name = 'status'
  ) then
    alter table public.posts
      add column status text not null default 'published';
  end if;
end $$;

-- 2) Constraint de valores permitidos (idempotente)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'posts_status_check'
      and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_status_check
      check (status in ('published', 'pending', 'hidden', 'deleted'));
  end if;
end $$;

-- 3) Index para queries de feed filtradas por status
create index if not exists posts_status_idx on public.posts (status);

-- 4) Substituir policy de SELECT pública:
--    Antes: using (true) — exibia todos os posts indiscriminadamente.
--    Depois: apenas posts publicados OU onde o usuário autenticado é o autor.
drop policy if exists posts_select_public on public.posts;
drop policy if exists posts_select_published on public.posts;

create policy posts_select_published
on public.posts for select
using (
  status = 'published'
  or (auth.uid() is not null and auth.uid() = author_id)
);

-- 5) Garantir que service_role pode atualizar status para moderação
grant update (status) on table public.posts to service_role;

commit;

-- Kino Campus — V8.1.7.0
-- Coluna status em posts + policy de visibilidade refinada

begin;

-- 1) Coluna status
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'status'
  ) then
    alter table public.posts add column status text not null default 'published';
  end if;
end $$;

-- 2) Constraint
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'posts_status_check' and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_status_check
      check (status in ('published','pending','hidden','deleted'));
  end if;
end $$;

-- 3) Índice para queries de feed
create index if not exists posts_status_idx on public.posts (status);

-- 4) Policy refinada: apenas posts 'published' são públicos
--    Exceção: o próprio autor vê seus posts independente do status
drop policy if exists posts_select_public     on public.posts;
drop policy if exists posts_select_published  on public.posts;

create policy posts_select_published
  on public.posts for select
  using (
    status = 'published'
    or auth.uid() = author_id
  );

-- 5) service_role pode atualizar status (para moderação)
grant update (status) on table public.posts to service_role;

commit;

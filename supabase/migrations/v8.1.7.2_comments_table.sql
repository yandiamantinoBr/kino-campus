-- Kino Campus — V8.1.7.2
-- Tabela public.comments (migração de localStorage → Supabase)
--
-- Escopo:
--   1) Criar tabela public.comments com campos equivalentes ao contrato localStorage
--   2) RLS/policies:
--        SELECT: leitura pública (qualquer um pode ver comentários de posts published)
--        INSERT: authenticated, author_id = auth.uid()
--        UPDATE: apenas o próprio autor (editar comentário) ou admin
--        DELETE: apenas o próprio autor ou admin
--   3) Índices para queries de feed (por post_id, por created_at)
--
-- Obs: o campo author_name é denormalizado por conveniência de leitura sem JOIN
-- mas deve ser populado a partir de profiles.display_name no INSERT via KCAPI.

begin;

create extension if not exists pgcrypto;

-- 1) Tabela
create table if not exists public.comments (
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  post_id      uuid        not null references public.posts(id) on delete cascade,
  author_id    uuid        not null references public.profiles(id) on delete cascade,
  author_name  text        not null default 'Anônimo',
  body         text        not null,
  likes        integer     not null default 0
);

-- 2) Constraints
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'comments_body_nonempty' and conrelid = 'public.comments'::regclass
  ) then
    alter table public.comments
      add constraint comments_body_nonempty check (char_length(trim(body)) > 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'comments_body_maxlen' and conrelid = 'public.comments'::regclass
  ) then
    alter table public.comments
      add constraint comments_body_maxlen check (char_length(body) <= 2000);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'comments_likes_nonneg' and conrelid = 'public.comments'::regclass
  ) then
    alter table public.comments
      add constraint comments_likes_nonneg check (likes >= 0);
  end if;
end $$;

-- 3) Índices
create index if not exists comments_post_id_idx      on public.comments (post_id);
create index if not exists comments_author_id_idx    on public.comments (author_id);
create index if not exists comments_created_at_idx   on public.comments (created_at desc);

-- 4) RLS
alter table public.comments enable row level security;

drop policy if exists comments_select_public    on public.comments;
drop policy if exists comments_insert_auth      on public.comments;
drop policy if exists comments_update_own       on public.comments;
drop policy if exists comments_delete_own       on public.comments;

-- SELECT público: qualquer um lê comentários
create policy comments_select_public
  on public.comments for select
  using (true);

-- INSERT: apenas authenticated, com author_id validado
create policy comments_insert_auth
  on public.comments for insert
  to authenticated
  with check (auth.uid() = author_id);

-- UPDATE: autor edita o próprio comentário
create policy comments_update_own
  on public.comments for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

-- DELETE: autor remove o próprio comentário
create policy comments_delete_own
  on public.comments for delete
  to authenticated
  using (auth.uid() = author_id);

-- 5) Privileges
grant select on table public.comments to anon, authenticated;
grant insert, update, delete on table public.comments to authenticated;
grant all on table public.comments to service_role;

-- 6) Função RPC para incrementar likes de um comentário de forma atômica
--    Chamada via KCAPI.likeComment(commentId) → client.rpc('increment_comment_likes', ...)
create or replace function public.increment_comment_likes(comment_uuid uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_likes integer;
begin
  update public.comments
     set likes = likes + 1
   where id = comment_uuid
  returning likes into new_likes;
  return coalesce(new_likes, 0);
end;
$$;

-- Permite que authenticated chame a função via RPC
grant execute on function public.increment_comment_likes(uuid) to authenticated;

commit;

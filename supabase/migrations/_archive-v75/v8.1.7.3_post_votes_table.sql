-- Kino Campus — V8.1.7.3
-- Tabela public.post_votes (migração de votos client-side → Supabase)
--
-- Escopo:
--   1) Criar tabela public.post_votes para persistir votos por usuário
--   2) Unique constraint (post_id, voter_id): um voto por usuário por post
--   3) Trigger que atualiza posts.votos automaticamente ao inserir/deletar votos
--   4) RLS/policies:
--        SELECT: authenticated (ver próprio voto)
--        INSERT: authenticated, voter_id = auth.uid()
--        DELETE: authenticated, voter_id = auth.uid() (toggle/undo)

begin;

-- 1) Tabela
create table if not exists public.post_votes (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  post_id     uuid        not null references public.posts(id) on delete cascade,
  voter_id    uuid        not null references public.profiles(id) on delete cascade,
  direction   text        not null,
  unique (post_id, voter_id)
);

-- 2) Constraint de direção
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'post_votes_direction_check' and conrelid = 'public.post_votes'::regclass
  ) then
    alter table public.post_votes
      add constraint post_votes_direction_check
      check (direction in ('hot', 'cold'));
  end if;
end $$;

-- 3) Índices
create index if not exists post_votes_post_id_idx   on public.post_votes (post_id);
create index if not exists post_votes_voter_id_idx  on public.post_votes (voter_id);

-- 4) Trigger que sincroniza posts.votos com a contagem de votos 'hot' - 'cold'
create or replace function public.sync_post_votes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_score integer;
begin
  select coalesce(
    (select count(*) filter (where direction = 'hot') -
            count(*) filter (where direction = 'cold')
     from public.post_votes
     where post_id = coalesce(new.post_id, old.post_id)),
    0
  ) into new_score;

  update public.posts
     set votos = new_score
   where id = coalesce(new.post_id, old.post_id);

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_post_votes on public.post_votes;
create trigger trg_sync_post_votes
  after insert or delete on public.post_votes
  for each row execute function public.sync_post_votes_count();

-- 5) RLS
alter table public.post_votes enable row level security;

drop policy if exists post_votes_select_own    on public.post_votes;
drop policy if exists post_votes_insert_auth   on public.post_votes;
drop policy if exists post_votes_delete_own    on public.post_votes;

-- SELECT: cada usuário vê apenas seu próprio voto (para marcar botão ativo)
create policy post_votes_select_own
  on public.post_votes for select
  to authenticated
  using (auth.uid() = voter_id);

-- INSERT: authenticated, voter_id deve = auth.uid()
create policy post_votes_insert_auth
  on public.post_votes for insert
  to authenticated
  with check (auth.uid() = voter_id);

-- DELETE: somente o próprio votante pode remover (toggle)
create policy post_votes_delete_own
  on public.post_votes for delete
  to authenticated
  using (auth.uid() = voter_id);

-- 6) Privileges
grant select, insert, delete on table public.post_votes to authenticated;
grant all on table public.post_votes to service_role;
revoke all on table public.post_votes from anon;

-- 7) Coluna votos em posts (caso não exista ainda)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'votos'
  ) then
    alter table public.posts add column votos integer not null default 0;
  end if;
end $$;

commit;

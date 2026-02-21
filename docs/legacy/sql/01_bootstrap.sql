-- ============================================================
-- KINO CAMPUS — Bootstrap V8.1.2.3 (Schema Base)
-- Execute este arquivo PRIMEIRO, antes de qualquer migration.
-- SQL Editor: https://supabase.com/dashboard/project/wacyrkwhkvzwkqpolrbg/sql/new
-- ============================================================

begin;

-- Extensões necessárias
create extension if not exists pgcrypto;

-- ============================================================
-- FUNÇÃO: atualizar updated_at automaticamente
-- ============================================================
create or replace function public.kc_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- TABELA: public.profiles
-- ============================================================
create table if not exists public.profiles (
  id          uuid        primary key references auth.users(id) on delete cascade,
  full_name   text,
  avatar_url  text,
  email       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.kc_set_updated_at();

-- ============================================================
-- FUNÇÃO + TRIGGER: criar profile automaticamente ao registrar
-- ============================================================
create or replace function public.kc_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.kc_handle_new_user();

-- ============================================================
-- TABELA: public.posts
-- ============================================================
create table if not exists public.posts (
  id          uuid        primary key default gen_random_uuid(),
  legacy_id   text        unique,
  author_id   uuid        references public.profiles(id) on delete set null,
  title       text        not null,
  description text,
  price       numeric,
  location    text,
  module      text,
  category    text,
  metadata    jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists posts_updated_at on public.posts;
create trigger posts_updated_at
  before update on public.posts
  for each row execute function public.kc_set_updated_at();

-- ============================================================
-- TABELA: public.post_media
-- ============================================================
create table if not exists public.post_media (
  id          uuid        primary key default gen_random_uuid(),
  post_id     uuid        not null references public.posts(id) on delete cascade,
  url         text        not null,
  is_cover    boolean     not null default false,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
alter table public.profiles  enable row level security;
alter table public.posts     enable row level security;
alter table public.post_media enable row level security;

-- PROFILES: leitura pública
drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public
  on public.profiles for select using (true);

-- PROFILES: insert do próprio usuário
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- PROFILES: update do próprio usuário
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- POSTS: leitura pública (será refinada em v8.1.7.0 para status=published)
drop policy if exists posts_select_public on public.posts;
create policy posts_select_public
  on public.posts for select using (true);

-- POSTS: insert pelo próprio autor
drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own
  on public.posts for insert
  to authenticated
  with check (auth.uid() = author_id);

-- POSTS: update pelo próprio autor
drop policy if exists posts_update_own on public.posts;
create policy posts_update_own
  on public.posts for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

-- POSTS: delete pelo próprio autor
drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own
  on public.posts for delete
  to authenticated
  using (auth.uid() = author_id);

-- POST_MEDIA: leitura pública
drop policy if exists post_media_select_public on public.post_media;
create policy post_media_select_public
  on public.post_media for select using (true);

-- POST_MEDIA: escrita pelo autor do post
drop policy if exists post_media_write_own on public.post_media;
create policy post_media_write_own
  on public.post_media for all
  to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_media.post_id
        and p.author_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_media.post_id
        and p.author_id = auth.uid()
    )
  );

-- ============================================================
-- GRANTS
-- ============================================================
grant select on public.profiles, public.posts, public.post_media to anon;
grant select, insert, update, delete on public.profiles, public.posts, public.post_media to authenticated;
grant all on public.profiles, public.posts, public.post_media to service_role;

-- ============================================================
-- STORAGE: bucket kino-media
-- ============================================================
insert into storage.buckets (id, name, public)
values ('kino-media', 'kino-media', true)
on conflict (id) do nothing;

-- Leitura pública das imagens
-- NOTA: storage.objects já tem RLS ativado por padrão no Supabase.
-- Não é necessário (nem permitido) fazer ALTER TABLE aqui.

drop policy if exists storage_kino_media_public_read on storage.objects;
create policy storage_kino_media_public_read
  on storage.objects for select
  using (bucket_id = 'kino-media');

-- Delete pelo dono do arquivo
drop policy if exists storage_kino_media_owner_delete_base on storage.objects;
create policy storage_kino_media_owner_delete_base
  on storage.objects for delete
  using (bucket_id = 'kino-media' and auth.uid() = owner);

commit;

-- ============================================================
-- Verificação: deve retornar as 3 tabelas criadas
-- ============================================================
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;

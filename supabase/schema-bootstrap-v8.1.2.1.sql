-- Kino Campus (V8.1.2.1) — Supabase Schema Bootstrap
-- Objetivo: criar as tabelas base (profiles/posts/post_media) + RLS + policies + Storage bucket.
-- Uso: cole este script no Supabase SQL Editor e execute.

-- 0) Extensões (gen_random_uuid)
create extension if not exists pgcrypto;

-- 1) PROFILES (vinculado ao auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  email text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at helper
create or replace function public.kc_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists kc_profiles_set_updated_at on public.profiles;
create trigger kc_profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.kc_set_updated_at();

-- 2) POSTS (contrato central do protótipo)
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  -- Compatibilidade: IDs numéricos (seed) e u_* (localStorage)
  legacy_id text unique,
  author_id uuid references public.profiles(id) on delete set null,

  title text not null,
  description text,
  price numeric,
  location text,

  module text,
  category text,

  -- Campos variáveis por módulo (caronas/moradia/eventos/etc)
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists kc_posts_set_updated_at on public.posts;
create trigger kc_posts_set_updated_at
before update on public.posts
for each row execute procedure public.kc_set_updated_at();

create index if not exists posts_module_idx on public.posts (module);
create index if not exists posts_category_idx on public.posts (category);
create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_metadata_gin_idx on public.posts using gin (metadata);

-- 3) POST_MEDIA (cover + galeria)
create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  url text not null,
  is_cover boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists post_media_post_id_idx on public.post_media (post_id);

-- 4) RLS (Row Level Security)
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;

-- PROFILES policies
drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public
on public.profiles for select
using (true);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles for insert
with check (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- POSTS policies
drop policy if exists posts_select_public on public.posts;
create policy posts_select_public
on public.posts for select
using (true);

drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own
on public.posts for insert
with check (auth.uid() = author_id);

drop policy if exists posts_update_own on public.posts;
create policy posts_update_own
on public.posts for update
using (auth.uid() = author_id)
with check (auth.uid() = author_id);

drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own
on public.posts for delete
using (auth.uid() = author_id);

-- POST_MEDIA policies (escrita somente do dono do post)
drop policy if exists post_media_select_public on public.post_media;
create policy post_media_select_public
on public.post_media for select
using (true);

drop policy if exists post_media_write_own on public.post_media;
create policy post_media_write_own
on public.post_media for all
using (
  exists (
    select 1
    from public.posts p
    where p.id = post_media.post_id
      and p.author_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.posts p
    where p.id = post_media.post_id
      and p.author_id = auth.uid()
  )
);

-- 5) (Opcional, recomendado) Auto-criar profile ao registrar usuário
create or replace function public.kc_handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url',
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists kc_on_auth_user_created on auth.users;
create trigger kc_on_auth_user_created
after insert on auth.users
for each row execute procedure public.kc_handle_new_user();

-- 6) Storage (bucket kino-media)
-- Observação: Storage já existe no Supabase. Este bloco cria bucket + policies.
insert into storage.buckets (id, name, public)
values ('kino-media', 'kino-media', true)
on conflict (id) do update set public = excluded.public;

alter table storage.objects enable row level security;

drop policy if exists storage_kino_media_public_read on storage.objects;
create policy storage_kino_media_public_read
on storage.objects for select
using (bucket_id = 'kino-media');

drop policy if exists storage_kino_media_auth_write on storage.objects;
create policy storage_kino_media_auth_write
on storage.objects for insert
with check (bucket_id = 'kino-media' and auth.role() = 'authenticated');

drop policy if exists storage_kino_media_owner_update on storage.objects;
create policy storage_kino_media_owner_update
on storage.objects for update
using (bucket_id = 'kino-media' and auth.uid() = owner)
with check (bucket_id = 'kino-media' and auth.uid() = owner);

drop policy if exists storage_kino_media_owner_delete on storage.objects;
create policy storage_kino_media_owner_delete
on storage.objects for delete
using (bucket_id = 'kino-media' and auth.uid() = owner);

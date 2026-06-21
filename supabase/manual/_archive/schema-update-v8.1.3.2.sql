-- Kino Campus (V8.1.3.2) — Schema Update
-- Objetivo: adicionar o campo de confiança/verificação ao perfil.
-- Uso: cole este script no Supabase SQL Editor e execute.

alter table if exists public.profiles
  add column if not exists verified boolean not null default false;

-- Opcional: índice para consultas por verificados (não necessário no MVP)
-- create index if not exists profiles_verified_idx on public.profiles (verified);

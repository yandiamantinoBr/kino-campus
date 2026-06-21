-- Kino Campus — V8.2.9.0
-- Security hardening:
--   1) Fix mutable search_path warnings in key public functions.
--   2) Move pg_net extension out of public schema when relocatable.

begin;

-- 1) Trigger helper for updated_at: pin search_path.
create or replace function public.kc_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2) Institutional email validator: pin search_path to pg_catalog.
--    Keeps current allowlist behavior (ufg/discente/egresso).
create or replace function public.kc_is_institutional_email(p_email text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_email is null                                then false
    when lower(trim(p_email)) like '%@ufg.br'          then true
    when lower(trim(p_email)) like '%@discente.ufg.br' then true
    when lower(trim(p_email)) like '%@egresso.ufg.br'  then true
    else false
  end;
$$;

-- 3) Votes sync trigger function: pin search_path.
create or replace function public.sync_post_votes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_id uuid;
begin
  v_post_id := coalesce(new.post_id, old.post_id);
  if v_post_id is null then
    return null;
  end if;

  update public.posts
  set votos = (
    select coalesce(
      sum(case when direction = 'hot' then 1 when direction = 'cold' then -1 else 0 end),
      0
    )
    from public.post_votes
    where post_id = v_post_id
  )
  where id = v_post_id;

  return null;
end;
$$;

-- 4) pg_net extension should not live in public.
create schema if not exists extensions;

do $$
declare
  v_in_public boolean;
  v_relocatable boolean;
begin
  select (n.nspname = 'public'), e.extrelocatable
    into v_in_public, v_relocatable
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_net';

  if v_in_public and v_relocatable then
    execute 'alter extension pg_net set schema extensions';
  end if;
end
$$;

commit;

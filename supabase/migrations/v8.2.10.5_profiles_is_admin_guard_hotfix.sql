-- v8.2.10.5
-- Hotfix da guarda de is_admin:
-- corrige a lógica de privilégio da v8.2.10.4 para não depender de SECURITY DEFINER.

begin;

create or replace function public.kc_profiles_guard_is_admin()
returns trigger
language plpgsql
set search_path = public, auth
as $$
begin
  -- Preserva is_admin em updates iniciados por clientes comuns (JWT authenticated/anon)
  -- e permite alteração apenas por contexto administrativo real.
  if tg_op = 'UPDATE' then
    if not (
      current_user in ('postgres', 'supabase_admin')
      or auth.role() = 'service_role'
    ) then
      new.is_admin := old.is_admin;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_kc_profiles_guard_is_admin on public.profiles;
create trigger trg_kc_profiles_guard_is_admin
before update on public.profiles
for each row
execute function public.kc_profiles_guard_is_admin();

commit;

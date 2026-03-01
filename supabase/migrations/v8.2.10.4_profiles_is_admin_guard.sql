-- v8.2.10.4
-- Protege a coluna public.profiles.is_admin contra sobrescrita acidental pelo client.
--
-- Contexto:
-- - Fluxos de upsert de perfil (frontend) podem atualizar full_name/avatar/email com frequência.
-- - Qualquer payload indevido contendo is_admin=false pode rebaixar administradores.
--
-- Regra:
-- - Em UPDATE, se a sessão NÃO for privilegiada (postgres/supabase_admin/service_role),
--   o valor NEW.is_admin é forçado para OLD.is_admin.
-- - INSERT mantém comportamento atual (default false), a promoção para admin continua manual
--   via SQL administrativo.

begin;

create or replace function public.kc_profiles_guard_is_admin()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text := current_user;
begin
  -- Apenas em UPDATE: preservar is_admin para sessões não privilegiadas.
  if tg_op = 'UPDATE' then
    if v_role not in ('postgres', 'supabase_admin', 'service_role') then
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

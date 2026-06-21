-- KinoCampus 2026-05-31
-- Revisão profunda /admin/ (rodada 2): persistência por administrador das
-- preferências do gráfico "Pulso diário" (quais séries exibir + cor de cada +
-- ordem). Guardado no servidor para acompanhar o admin entre dispositivos.
--
-- prefs (jsonb) = { "visible": [keys], "colors": { key: "#hex" }, "order": [keys] }
--
-- Segurança: tabela com RLS owner-only + gate de admin; RPCs SECURITY INVOKER
-- (respeitam a RLS, sem acender o advisor de SECURITY DEFINER) com gate explícito.

begin;

create table if not exists public.kc_admin_chart_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.kc_admin_chart_prefs enable row level security;

-- A linha pertence ao próprio admin: ele é o único que lê/escreve, e só se for admin.
drop policy if exists kc_admin_chart_prefs_select on public.kc_admin_chart_prefs;
create policy kc_admin_chart_prefs_select on public.kc_admin_chart_prefs
  for select to authenticated
  using (user_id = (select auth.uid()) and public.kc_is_admin((select auth.uid())));

drop policy if exists kc_admin_chart_prefs_insert on public.kc_admin_chart_prefs;
create policy kc_admin_chart_prefs_insert on public.kc_admin_chart_prefs
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.kc_is_admin((select auth.uid())));

drop policy if exists kc_admin_chart_prefs_update on public.kc_admin_chart_prefs;
create policy kc_admin_chart_prefs_update on public.kc_admin_chart_prefs
  for update to authenticated
  using (user_id = (select auth.uid()) and public.kc_is_admin((select auth.uid())))
  with check (user_id = (select auth.uid()) and public.kc_is_admin((select auth.uid())));

revoke all on table public.kc_admin_chart_prefs from anon;
grant select, insert, update on table public.kc_admin_chart_prefs to authenticated;

-- Lê as preferências do admin atual (ou objeto vazio).
create or replace function public.kc_admin_get_chart_prefs()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_prefs jsonb;
begin
  if v_uid is null or not public.kc_is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  select prefs into v_prefs from public.kc_admin_chart_prefs where user_id = v_uid;
  return jsonb_build_object('ok', true, 'prefs', coalesce(v_prefs, '{}'::jsonb));
end;
$$;

-- Salva (upsert) as preferências do admin atual.
create or replace function public.kc_admin_save_chart_prefs(p_prefs jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.kc_is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if p_prefs is null or jsonb_typeof(p_prefs) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'INVALID');
  end if;
  insert into public.kc_admin_chart_prefs (user_id, prefs, updated_at)
    values (v_uid, p_prefs, now())
    on conflict (user_id) do update set prefs = excluded.prefs, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.kc_admin_get_chart_prefs() from public, anon;
grant execute on function public.kc_admin_get_chart_prefs() to authenticated, service_role;
revoke all on function public.kc_admin_save_chart_prefs(jsonb) from public, anon;
grant execute on function public.kc_admin_save_chart_prefs(jsonb) to authenticated, service_role;

comment on table public.kc_admin_chart_prefs is
  'Preferências por administrador do gráfico do Dashboard (séries visíveis, cores e ordem). RLS owner-only + gate de admin.';

commit;

-- ============================================================
-- KinoCampus - Preferências de busca e descoberta (conta)
-- ============================================================
-- Preferências explícitas de personalização de busca/ranking,
-- sincronizadas entre dispositivos (não só localStorage).
-- ============================================================

begin;

create or replace function public.kc_default_search_preferences()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'version', 1,
    'mode', 'standard',
    'modules', '[]'::jsonb,
    'features', '{}'::jsonb,
    'localAffinityConsent', false,
    'consent', jsonb_build_object(
      'purpose', 'search-personalization-v1',
      'granted', false,
      'source', 'settings',
      'updatedAt', null
    ),
    'updatedAt', null
  );
$$;

comment on function public.kc_default_search_preferences() is
  'Payload JSONB padrão das preferências de busca (modo não personalizado).';

create table if not exists public.search_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  preferences jsonb not null default public.kc_default_search_preferences(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint search_preferences_preferences_object_check
    check (jsonb_typeof(preferences) = 'object')
);

comment on table public.search_preferences is
  'Preferências privadas de busca/descoberta por usuário (módulos, assuntos e consentimento de afinidade).';

comment on column public.search_preferences.preferences is
  'JSONB: mode, modules[], features{}, localAffinityConsent, consent, updatedAt.';

drop trigger if exists trg_search_preferences_set_updated_at on public.search_preferences;
create trigger trg_search_preferences_set_updated_at
before update on public.search_preferences
for each row execute function public.kc_set_updated_at();

alter table public.search_preferences enable row level security;

drop policy if exists search_preferences_select_own on public.search_preferences;
create policy search_preferences_select_own
  on public.search_preferences for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists search_preferences_insert_own on public.search_preferences;
create policy search_preferences_insert_own
  on public.search_preferences for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists search_preferences_update_own on public.search_preferences;
create policy search_preferences_update_own
  on public.search_preferences for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists search_preferences_delete_own on public.search_preferences;
create policy search_preferences_delete_own
  on public.search_preferences for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.search_preferences to authenticated;

commit;

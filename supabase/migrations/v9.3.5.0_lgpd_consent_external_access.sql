-- KinoCampus -- V9.3.5.0
-- LGPD: aceite legal, cookies e solicitação de acesso externo

begin;

alter table public.help_requests
  drop constraint if exists help_requests_type_check;

alter table public.help_requests
  add constraint help_requests_type_check check (
    type in (
      'question',
      'complaint',
      'praise',
      'platform_issue',
      'account_access',
      'external_access',
      'report',
      'suggestion_praise'
    )
  );

alter table public.help_requests
  drop constraint if exists help_requests_topic_check;

alter table public.help_requests
  add constraint help_requests_topic_check check (
    topic in (
      'platform_use',
      'posts',
      'profile',
      'contact',
      'payment_benefit',
      'security',
      'other',
      'publishing_navigation',
      'modules_filters',
      'profile_contact',
      'bugs_crashes',
      'slow_performance',
      'search_filters',
      'create_edit_post',
      'login_signup',
      'email_confirmation',
      'password',
      'onboarding_settings',
      'non_institutional_email',
      'partnership_access',
      'post',
      'profile_user',
      'inappropriate_contact',
      'general_experience',
      'specific_module',
      'community'
    )
  );

create table if not exists public.user_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now(),
  source text not null default 'kc-auth-card',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_legal_acceptances_versions_check check (
    char_length(terms_version) between 4 and 40
    and char_length(privacy_version) between 4 and 40
  ),
  constraint user_legal_acceptances_source_check check (char_length(source) between 2 and 80),
  constraint user_legal_acceptances_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint user_legal_acceptances_unique_version unique (user_id, terms_version, privacy_version)
);

create index if not exists user_legal_acceptances_user_created_idx
  on public.user_legal_acceptances (user_id, created_at desc);

drop trigger if exists trg_user_legal_acceptances_set_updated_at on public.user_legal_acceptances;
create trigger trg_user_legal_acceptances_set_updated_at
  before update on public.user_legal_acceptances
  for each row execute function public.kc_set_updated_at();

alter table public.user_legal_acceptances enable row level security;

drop policy if exists user_legal_acceptances_select_own_or_admin on public.user_legal_acceptances;
create policy user_legal_acceptances_select_own_or_admin
  on public.user_legal_acceptances
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.kc_is_admin(auth.uid())
  );

drop policy if exists user_legal_acceptances_insert_own on public.user_legal_acceptances;
create policy user_legal_acceptances_insert_own
  on public.user_legal_acceptances
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_legal_acceptances_update_own_or_admin on public.user_legal_acceptances;
create policy user_legal_acceptances_update_own_or_admin
  on public.user_legal_acceptances
  for update
  to authenticated
  using (
    user_id = auth.uid()
    or public.kc_is_admin(auth.uid())
  )
  with check (
    user_id = auth.uid()
    or public.kc_is_admin(auth.uid())
  );

grant select, insert, update on public.user_legal_acceptances to authenticated;

commit;

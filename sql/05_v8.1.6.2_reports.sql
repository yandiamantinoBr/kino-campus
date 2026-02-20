-- Kino Campus — V8.1.6.2
-- Tabela public.reports + Privacy Hardening

begin;

-- 1) Tabela de denúncias
create table if not exists public.reports (
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  post_id      uuid        not null references public.posts(id) on delete cascade,
  reporter_id  uuid        not null references public.profiles(id) on delete cascade,
  reason       text        not null,
  details      text,
  status       text        not null default 'open'
);

-- 2) Constraints
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reports_reason_check' and conrelid = 'public.reports'::regclass
  ) then
    alter table public.reports
      add constraint reports_reason_check
      check (reason in ('spam','scam','inappropriate','hate','illegal','duplicate','other'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reports_status_check' and conrelid = 'public.reports'::regclass
  ) then
    alter table public.reports
      add constraint reports_status_check
      check (status in ('open','closed'));
  end if;
end $$;

-- 3) Unique: mesmo usuário não pode ter 2 reports abertos para o mesmo post
create unique index if not exists reports_unique_open_per_user_post
  on public.reports (post_id, reporter_id)
  where status = 'open';

-- 4) RLS
alter table public.reports enable row level security;

-- INSERT: apenas authenticated, reporter_id = auth.uid()
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own
  on public.reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);

-- Nenhuma policy SELECT/UPDATE/DELETE para anon/authenticated
-- (apenas service_role acessa, além dos admins que adicionaremos em v8.1.7.4)

-- 5) Privileges: revogar SELECT de anon/authenticated
revoke select on table public.reports from anon;
revoke select on table public.reports from authenticated;
grant insert on table public.reports to authenticated;
grant all on table public.reports to service_role;

-- 6) Privacy: bloquear acesso ao e-mail dos profiles via client
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'email'
  ) then
    execute 'revoke select (email) on table public.profiles from anon, authenticated';
  end if;
end $$;

commit;

-- Kino Campus — V8.1.6.2
-- Denunciar Post (Reports) + Hardening de Privacidade (profiles.email)
--
-- Escopo (Roadmap 8.1.6.2):
--   1) Criar tabela public.reports (mínima, auditável)
--   2) RLS/policies robustas:
--        - INSERT: apenas authenticated e com reporter_id = auth.uid()
--        - SELECT: não público (somente service_role)
--   3) Anti-spam mínimo: impedir denúncias repetidas "open" do mesmo usuário para o mesmo post
--   4) Privacidade: impedir exposição de public.profiles.email via SELECT/JOIN no client
--        - REVOKE SELECT(email) para anon/authenticated (defesa em profundidade)
--
-- Observação importante:
--   - Este script NÃO muda a policy pública de profiles (que permanece útil para nome/avatar/verified).
--     Ele apenas remove a capacidade do client de ler o campo email.
--   - O frontend deve evitar selecionar `profiles.email` (feito no patch 8.1.6.2).

begin;

-- UUID helper (idempotente)
create extension if not exists pgcrypto;

-- 1) REPORTS — tabela
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  post_id uuid not null references public.posts(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,

  reason text not null,
  details text,
  status text not null default 'open'
);

-- 1.1) Constraints (idempotentes)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reports_reason_check'
      and conrelid = 'public.reports'::regclass
  ) then
    alter table public.reports
      add constraint reports_reason_check
      check (reason in ('spam', 'scam', 'inappropriate', 'hate', 'illegal', 'duplicate', 'other'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reports_status_check'
      and conrelid = 'public.reports'::regclass
  ) then
    alter table public.reports
      add constraint reports_status_check
      check (status in ('open', 'closed'));
  end if;
end $$;

-- 1.2) Indexes (anti-spam mínimo + performance)
create unique index if not exists reports_unique_open_post_reporter
  on public.reports (post_id, reporter_id)
  where (status = 'open');

create index if not exists reports_post_id_idx on public.reports (post_id);
create index if not exists reports_reporter_id_idx on public.reports (reporter_id);
create index if not exists reports_created_at_idx on public.reports (created_at desc);

-- 2) RLS + policies
alter table public.reports enable row level security;

drop policy if exists reports_insert_authenticated on public.reports;
drop policy if exists reports_select_service_role on public.reports;

-- INSERT: authenticated, sem forjar reporter_id
create policy reports_insert_authenticated
on public.reports for insert
to authenticated
with check (
  auth.uid() = reporter_id
);

-- SELECT: apenas service_role (não expor no client)
create policy reports_select_service_role
on public.reports for select
to service_role
using (true);

-- 2.1) Privileges (defesa em profundidade)
revoke all on table public.reports from anon, authenticated;
grant insert on table public.reports to authenticated;
grant all on table public.reports to service_role;

-- 3) PRIVACIDADE — bloquear SELECT em profiles.email para anon/authenticated
--    Guardado para rodar mesmo se a coluna ainda não existir.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'email'
  ) then
    execute 'revoke select (email) on table public.profiles from anon, authenticated';
  end if;
end $$;

commit;

-- Kino Campus — V8.1.11.0
-- Observabilidade: Audit Log (moderacao/compliance)
--
-- Objetivos:
--   1) Criar public.audit_log com payload minimo util.
--   2) Registrar automaticamente eventos criticos via triggers:
--      - mudanca de status de post
--      - fechamento de report
--      - delete de post (soft/hard)
--   3) Endurecer acesso com RLS admin-only para leitura e insert apenas via trigger.

begin;

create extension if not exists pgcrypto;

-- 1) Tabela principal de auditoria
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 1.1) Indices para leitura operacional
create index if not exists audit_log_created_at_desc_idx
  on public.audit_log (created_at desc);

create index if not exists audit_log_entity_idx
  on public.audit_log (entity_type, entity_id);

create index if not exists audit_log_actor_created_at_desc_idx
  on public.audit_log (actor_id, created_at desc);

-- 2) RLS e privilegios
alter table public.audit_log enable row level security;

drop policy if exists audit_log_select_admin on public.audit_log;
drop policy if exists audit_log_insert_trigger_only on public.audit_log;

-- Leitura somente para administradores autenticados.
create policy audit_log_select_admin
  on public.audit_log for select
  to authenticated
  using (
    (select is_admin from public.profiles where id = auth.uid()) = true
  );

-- INSERT permitido apenas em contexto de trigger (pg_trigger_depth > 0).
-- actor_id precisa bater com auth.uid() quando existir sessao de usuario.
create policy audit_log_insert_trigger_only
  on public.audit_log for insert
  to authenticated
  with check (
    pg_trigger_depth() > 0
    and (actor_id = auth.uid() or actor_id is null)
  );

revoke all on table public.audit_log from anon, authenticated;
grant select, insert on table public.audit_log to authenticated;
grant all on table public.audit_log to service_role;

-- 3) Funcao utilitaria de insert para padronizar payload/auditoria
create or replace function public.audit_log_insert(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb default '{}'::jsonb,
  p_actor_id uuid default auth.uid()
)
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (p_actor_id, p_action, p_entity_type, p_entity_id, coalesce(p_payload, '{}'::jsonb));
end;
$$;

-- 4) Trigger: posts.status mudou
create or replace function public.trg_audit_posts_status()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  v_payload := jsonb_build_object(
    'before', jsonb_build_object('status', old.status),
    'after', jsonb_build_object('status', new.status)
  );

  if new.legacy_id is not null then
    v_payload := v_payload || jsonb_build_object('legacy_id', new.legacy_id);
  end if;

  -- Soft-delete gera somente post_deleted (evita duplicidade com post_status_changed).
  if old.status is distinct from 'deleted' and new.status = 'deleted' then
    perform public.audit_log_insert(
      'post_deleted',
      'posts',
      new.id,
      v_payload,
      auth.uid()
    );
  else
    perform public.audit_log_insert(
      'post_status_changed',
      'posts',
      new.id,
      v_payload,
      auth.uid()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_audit_posts_status on public.posts;
create trigger trg_audit_posts_status
  after update of status on public.posts
  for each row
  execute function public.trg_audit_posts_status();

-- 5) Trigger: report fechado (status open -> closed)
create or replace function public.trg_audit_reports_status_closed()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  if old.status is distinct from new.status
     and old.status is distinct from 'closed'
     and new.status = 'closed' then

    v_payload := jsonb_build_object(
      'before', jsonb_build_object('status', old.status),
      'after', jsonb_build_object('status', new.status),
      'reason', new.reason,
      'post_id', new.post_id
    );

    perform public.audit_log_insert(
      'report_closed',
      'reports',
      new.id,
      v_payload,
      auth.uid()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_audit_reports_status_closed on public.reports;
create trigger trg_audit_reports_status_closed
  after update of status on public.reports
  for each row
  execute function public.trg_audit_reports_status_closed();

-- 6) Trigger: delete fisico de post
create or replace function public.trg_audit_posts_delete()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  -- Se ja foi soft-delete antes, nao duplicar post_deleted no delete fisico.
  if old.status = 'deleted' then
    return old;
  end if;

  v_payload := jsonb_build_object(
    'deleted', true,
    'old_status', old.status
  );

  if old.legacy_id is not null then
    v_payload := v_payload || jsonb_build_object('legacy_id', old.legacy_id);
  end if;

  perform public.audit_log_insert(
    'post_deleted',
    'posts',
    old.id,
    v_payload,
    auth.uid()
  );

  return old;
end;
$$;

drop trigger if exists trg_audit_posts_delete on public.posts;
create trigger trg_audit_posts_delete
  after delete on public.posts
  for each row
  execute function public.trg_audit_posts_delete();

commit;

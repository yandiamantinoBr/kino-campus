-- KinoCampus v9.1.0.3 — Tabela de Convites para Usuários Externos
--
-- Objetivo:
--   Permitir que administradores convidem usuários com e-mail não-institucional
--   (ex: @gmail.com, @outlook.com) para a plataforma KinoCampus.
--
-- Fluxo:
--   1. Admin chama a Edge Function `kc-invite-user` passando o e-mail
--   2. A Edge Function adiciona o e-mail nesta tabela e chama admin.inviteUserByEmail()
--   3. O usuário recebe o e-mail com link para /auth-callback.html
--   4. O auth-callback processa normalmente → onboarding → plataforma
--
-- Como aplicar:
--   Supabase Dashboard → SQL Editor → New query → cole este arquivo → Run

begin;

-- ── Tabela principal ─────────────────────────────────────────────────────────

create table if not exists public.kc_invited_emails (
  email        text        primary key,
  invited_by   uuid        references public.profiles(id) on delete set null,
  note         text,
  invited_at   timestamptz not null default now(),
  used_at      timestamptz,
  expires_at   timestamptz not null default (now() + interval '7 days')
);

comment on table  public.kc_invited_emails             is 'Convites para usuários com e-mail não-institucional enviados por admins.';
comment on column public.kc_invited_emails.email       is 'E-mail do convidado (chave primária, normalizado em minúsculas).';
comment on column public.kc_invited_emails.invited_by  is 'ID do admin que enviou o convite.';
comment on column public.kc_invited_emails.note        is 'Motivo ou observação sobre o convite (uso interno).';
comment on column public.kc_invited_emails.used_at     is 'Preenchido quando o usuário conclui o onboarding.';
comment on column public.kc_invited_emails.expires_at  is 'Data de expiração do convite (padrão: 7 dias).';

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.kc_invited_emails enable row level security;

-- Admins podem gerenciar todos os convites
drop policy if exists "kc_invited_emails_admin_all" on public.kc_invited_emails;
create policy "kc_invited_emails_admin_all"
  on public.kc_invited_emails
  for all
  to authenticated
  using  (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Usuário autenticado pode ler o próprio convite (para marcar como usado)
drop policy if exists "kc_invited_emails_self_read" on public.kc_invited_emails;
create policy "kc_invited_emails_self_read"
  on public.kc_invited_emails
  for select
  to authenticated
  using (
    lower(trim(email)) = (
      select lower(trim(u.email))
      from auth.users u
      where u.id = auth.uid()
    )
  );

-- ── RPCs ─────────────────────────────────────────────────────────────────────

-- Verifica se um e-mail está na lista de convidados (usado por outros processos)
create or replace function public.kc_is_invited_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.kc_invited_emails
    where lower(trim(email))   = lower(trim(p_email))
      and expires_at            > now()
  );
$$;

-- Admin: adicionar convite manualmente (sem enviar o e-mail — para uso via SQL ou testes)
create or replace function public.kc_admin_add_invite(
  p_email text,
  p_note  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
begin
  select is_admin into v_is_admin
  from public.profiles
  where id = auth.uid();

  if not coalesce(v_is_admin, false) then
    raise exception 'UNAUTHORIZED: apenas administradores podem convidar usuários';
  end if;

  insert into public.kc_invited_emails (email, invited_by, note)
  values (lower(trim(p_email)), auth.uid(), p_note)
  on conflict (email) do update
    set invited_by = excluded.invited_by,
        note       = coalesce(excluded.note, kc_invited_emails.note),
        invited_at = now(),
        expires_at = now() + interval '7 days',
        used_at    = null;

  return jsonb_build_object('ok', true, 'email', lower(trim(p_email)));
end;
$$;

-- Admin: listar todos os convites
create or replace function public.kc_admin_get_invites()
returns table (
  email      text,
  invited_by uuid,
  note       text,
  invited_at timestamptz,
  used_at    timestamptz,
  expires_at timestamptz,
  is_expired boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and is_admin = true
  ) then
    raise exception 'UNAUTHORIZED';
  end if;

  return query
  select
    i.email,
    i.invited_by,
    i.note,
    i.invited_at,
    i.used_at,
    i.expires_at,
    (i.expires_at <= now()) as is_expired
  from public.kc_invited_emails i
  order by i.invited_at desc;
end;
$$;

-- Usuário: marcar o próprio convite como usado (chamado após onboarding)
create or replace function public.kc_mark_invite_used()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  select lower(trim(u.email)) into v_email
  from auth.users u
  where u.id = auth.uid();

  update public.kc_invited_emails
  set used_at = now()
  where lower(trim(email)) = v_email
    and used_at is null;
end;
$$;

-- Admin: revogar convite
create or replace function public.kc_admin_revoke_invite(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and is_admin = true
  ) then
    raise exception 'UNAUTHORIZED';
  end if;

  delete from public.kc_invited_emails
  where lower(trim(email)) = lower(trim(p_email));

  return jsonb_build_object('ok', true, 'email', lower(trim(p_email)));
end;
$$;

commit;

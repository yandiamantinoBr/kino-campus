-- KinoCampus 2026-05-30
-- Cadu trusted publisher: allowlist + isencao dos soft gates do anti-spam.
--
-- Objetivo:
--   Permitir que contas de publicacao CONFIAVEIS (ex.: Cadu/OpenClaw) publiquem
--   conteudo oficial da UFG sem cair em 'pending' por link_spam (>3 URLs, comum
--   em editais com varios PDFs) ou new_user_scrutiny. O controle de flood (ritmo)
--   e MANTIDO como rede de seguranca — o Cadu ja tem limite generoso em
--   public.post_flood_limits.
--
-- Notas de seguranca:
--   - Allowlist EXPLICITA por user_id (nao um role amplo) -> menor superficie.
--   - Apenas admin gerencia a allowlist (RLS). Helper interno em kc_private.
--   - O gate continua valendo integralmente para todos os outros usuarios.
--   - Mantem SECURITY DEFINER + SET search_path = '' (padrao das funcoes do gate).

begin;

-- ──────────────────────────────────────────────────────────────────────────────
-- 1) Registro de publicadores confiaveis (allowlist)
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists public.kc_trusted_publishers (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  label      text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

comment on table public.kc_trusted_publishers is
  'Allowlist de contas de publicacao automatica confiaveis (ex.: Cadu). Isenta apenas os soft gates do anti-spam (link_spam, new_user_scrutiny). O flood control (ritmo) continua valendo.';

alter table public.kc_trusted_publishers enable row level security;

drop policy if exists kc_trusted_publishers_admin_select on public.kc_trusted_publishers;
create policy kc_trusted_publishers_admin_select
  on public.kc_trusted_publishers for select
  to authenticated
  using (public.kc_is_admin((select auth.uid())));

drop policy if exists kc_trusted_publishers_admin_write on public.kc_trusted_publishers;
create policy kc_trusted_publishers_admin_write
  on public.kc_trusted_publishers for all
  to authenticated
  using (public.kc_is_admin((select auth.uid())))
  with check (public.kc_is_admin((select auth.uid())));

-- ──────────────────────────────────────────────────────────────────────────────
-- 2) Helper interno usado pelo trigger (SECURITY DEFINER, ignora RLS da tabela)
-- ──────────────────────────────────────────────────────────────────────────────

create or replace function kc_private.kc_is_trusted_publisher(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.kc_trusted_publishers tp
     where tp.user_id = p_user_id
  );
$$;

revoke all on function kc_private.kc_is_trusted_publisher(uuid) from public, anon, authenticated;
grant execute on function kc_private.kc_is_trusted_publisher(uuid) to authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3) Recriar o gate anti-spam preservando o comportamento atual, com isencao
--    dos SOFT gates para bots confiaveis. (Mantem o flood control para todos.)
-- ──────────────────────────────────────────────────────────────────────────────

create or replace function public.kc_anti_spam_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_flood_check jsonb;
  v_url_count integer := 0;
  v_approved_count integer := 0;
  v_profile_created_at timestamptz;
  v_flood_limit int := 3;
  v_flood_count int := 0;
  v_flood_window int := 60;
  v_trusted boolean := false;
begin
  -- ── Verificacao 1: Flood control (vale para TODOS, inclusive bots) ──────────
  v_flood_check := kc_private.kc_compute_post_flood_check(new.author_id, new.module);
  v_flood_limit := coalesce((v_flood_check->>'limit')::int, 3);
  v_flood_count := coalesce((v_flood_check->>'count')::int, 0);
  v_flood_window := coalesce((v_flood_check->>'window_minutes')::int, 60);

  if not coalesce((v_flood_check->>'ok')::boolean, true) then
    raise exception 'flood_limit_exceeded'
      using hint = format(
              'Limite de %s publicacoes a cada %s minutos atingido. Aguarde antes de publicar novamente.',
              v_flood_limit,
              v_flood_window
            ),
            detail = v_flood_check::text,
            errcode = 'P0001';
  end if;

  -- ── Isencao: bots confiaveis (allowlist) pulam os soft gates abaixo ─────────
  v_trusted := kc_private.kc_is_trusted_publisher(new.author_id);
  if v_trusted then
    return new;
  end if;

  -- ── Verificacao 2: Link spam (>3 URLs externas) -> soft gate ────────────────
  select count(m[1])
    into v_url_count
    from regexp_matches(
      coalesce(new.description, '') || ' ' || coalesce(new.title, ''),
      'https?://[^\s)>\]"'']+',
      'gi'
    ) as m;

  if v_url_count > 3 then
    new.status := 'pending';
    new.moderation_reason := 'link_spam';
  end if;

  -- ── Verificacao 3: New user trust score -> soft gate ────────────────────────
  select p.created_at
    into v_profile_created_at
    from public.profiles p
   where p.id = new.author_id;

  if v_profile_created_at is not null and v_profile_created_at > now() - interval '7 days' then
    select count(*)
      into v_approved_count
      from public.posts p
     where p.author_id = new.author_id
       and p.status = 'published';

    if v_approved_count = 0 then
      new.status := 'pending';
      new.moderation_reason := coalesce(new.moderation_reason, 'new_user_scrutiny');
    end if;
  end if;

  -- ── Registro em audit_log para posts auto-moderados ─────────────────────────
  if new.status = 'pending' then
    begin
      insert into public.audit_log (action, entity_type, entity_id, actor_id, payload)
      values (
        'post_auto_moderated',
        'posts',
        new.id,
        new.author_id,
        jsonb_build_object(
          'reason', new.moderation_reason,
          'original_status', 'published',
          'new_status', 'pending',
          'module', new.module,
          'flood_limit', v_flood_limit,
          'flood_count', v_flood_count,
          'flood_window_minutes', v_flood_window
        )
      );
    exception when others then
      null;
    end;
  end if;

  return new;
end;
$$;

revoke execute on function public.kc_anti_spam_gate() from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4) Seed: conta do Cadu (idempotente)
-- ──────────────────────────────────────────────────────────────────────────────

-- Defensivo: so insere se o perfil do Cadu existir (no-op em branches de
-- preview sem esse perfil; ativo em producao). Idempotente.
insert into public.kc_trusted_publishers (user_id, label)
select '2345582d-8bf7-4393-aa0d-f9953d0e02ca', 'Cadu (OpenClaw) — curador UFG'
where exists (
  select 1 from public.profiles where id = '2345582d-8bf7-4393-aa0d-f9953d0e02ca'
)
on conflict (user_id) do nothing;

commit;

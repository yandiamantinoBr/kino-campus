-- Kino Campus — V8.4.2.0
-- Denúncias de Comentários (Comment Reports)
--
-- Escopo:
--   1) Torna public.reports.post_id nullable para suportar denúncias de
--      entidades além de posts (ex: comentários).
--   2) Adiciona colunas entity_type (default 'post') e entity_id (text)
--      para identificação genérica da entidade denunciada.
--   3) Adiciona constraint de integridade: post_id OR entity_id deve estar
--      preenchido (ambos não podem ser nulos ao mesmo tempo).
--   4) Expande o check constraint de reason para incluir as novas categorias
--      adequadas a comentários: 'harassment', 'offensive', 'misleading', 'privacy'.
--   5) Atualiza o unique index anti-spam para funcionar com ambos os tipos.
--   6) Mantém retrocompatibilidade total com denúncias de posts existentes.
--
-- Retrocompatibilidade:
--   - Registros existentes com post_id preenchido continuam válidos.
--   - entity_type = 'post' por padrão (compatível com fluxo atual).
--   - RLS e rate-limit não precisam de mudança (reporter_id ainda está presente).

begin;

-- ─── 1) Tornar post_id nullable ─────────────────────────────────────────────

alter table public.reports
  alter column post_id drop not null;

-- ─── 2) Adicionar colunas entity_type e entity_id ────────────────────────────

alter table public.reports
  add column if not exists entity_type text not null default 'post';

alter table public.reports
  add column if not exists entity_id text;

-- Preencher entity_id com post_id existente (cast para text) nos registros legados
update public.reports
  set entity_id = post_id::text
  where entity_id is null and post_id is not null;

-- ─── 3) Constraint de integridade: pelo menos um ID deve existir ─────────────

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reports_entity_not_null'
      and conrelid = 'public.reports'::regclass
  ) then
    alter table public.reports
      add constraint reports_entity_not_null
      check (post_id is not null or entity_id is not null);
  end if;
end $$;

-- ─── 4) Expandir reason check constraint ────────────────────────────────────

-- Remove constraint antiga (se existir) e recria com valores ampliados
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'reports_reason_check'
      and conrelid = 'public.reports'::regclass
  ) then
    alter table public.reports drop constraint reports_reason_check;
  end if;
end $$;

alter table public.reports
  add constraint reports_reason_check
  check (reason in (
    -- Razões originais (posts)
    'spam',
    'scam',
    'inappropriate',
    'hate',
    'illegal',
    'duplicate',
    'other',
    -- Novas razões (comentários)
    'harassment',
    'offensive',
    'misleading',
    'privacy'
  ));

-- ─── 5) Atualizar index único anti-spam ──────────────────────────────────────

-- Remove o index antigo (só cobria post_id)
drop index if exists reports_unique_open_post_reporter;

-- Novo index para denúncias de posts (entity_type = 'post')
create unique index if not exists reports_unique_open_post_reporter
  on public.reports (post_id, reporter_id)
  where (status = 'open' and post_id is not null);

-- Novo index para denúncias de comentários (entity_type = 'comment')
create unique index if not exists reports_unique_open_comment_reporter
  on public.reports (entity_id, reporter_id)
  where (status = 'open' and entity_type = 'comment' and entity_id is not null);

-- ─── 6) Indexes adicionais de performance ────────────────────────────────────

create index if not exists reports_entity_type_idx on public.reports (entity_type);
create index if not exists reports_entity_id_idx   on public.reports (entity_id);

-- ─── 7) Garantir grants (idempotente) ────────────────────────────────────────

grant insert on table public.reports to authenticated;
grant all    on table public.reports to service_role;

commit;

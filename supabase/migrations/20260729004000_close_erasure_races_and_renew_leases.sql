-- ============================================================================
-- KinoCampus - fechamento atomico do titular e leases renovaveis de exclusao
-- ============================================================================
-- Contratos:
--   * o inicio irreversivel persiste uma barreira sob kc_lock_privacy_subject;
--   * nenhum novo DSR ou artefato de exportacao atravessa essa barreira;
--   * claims administrativos vinculam token, versao, ator e sessao ativa;
--   * heartbeat renova somente uma lease ainda vigente e com a mesma identidade;
--   * toda escrita em workflow claimed falha fechada se a lease/sessao expirou;
--   * criacao de workflow e recuperacao de DSR aberto sao atomicas/idempotentes.
-- ============================================================================

begin;

alter table public.account_erasure_requests
  add column if not exists operation_claim_session_id uuid;

create table if not exists kc_private.account_erasure_subject_closures (
  subject_key_hash text primary key,
  workflow_id uuid not null unique
    references public.account_erasure_requests(id) on delete cascade,
  state text not null default 'closing',
  claimed_at timestamptz not null default pg_catalog.clock_timestamp(),
  completed_at timestamptz,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint account_erasure_subject_closures_hash_check
    check (subject_key_hash ~ '^[a-f0-9]{64}$'),
  constraint account_erasure_subject_closures_state_check
    check (state in ('closing', 'completed')),
  constraint account_erasure_subject_closures_completed_check
    check (
      (state = 'closing' and completed_at is null)
      or (state = 'completed' and completed_at is not null)
    )
);

comment on table kc_private.account_erasure_subject_closures is
  'Barreira pseudonimizada e duravel criada atomically com o primeiro claim irreversivel. Impede novos DSRs/exports mesmo se o worker falhar.';

revoke all on table kc_private.account_erasure_subject_closures
  from public, anon, authenticated, service_role;

create or replace function kc_private.kc_privacy_subject_key(p_user_id uuid)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(p_user_id::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function kc_private.kc_privacy_subject_key(uuid)
  from public, anon, authenticated, service_role;

-- Recupera barreiras de operacoes irreversiveis iniciadas antes desta migracao.
-- repair_target_user_id existe apenas durante reparo parcial e permite cobrir
-- uma operacao cujo FK user_id ja foi limpo pelo delete de Auth.
with candidates as (
  select
    workflow_row.id as workflow_id,
    case
      when workflow_row.user_id is not null then workflow_row.user_id
      when coalesce(workflow_row.metadata ->> 'repair_target_user_id', '') ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (workflow_row.metadata ->> 'repair_target_user_id')::uuid
      else null
    end as target_user_id,
    workflow_row.status,
    workflow_row.updated_at
  from public.account_erasure_requests workflow_row
  where workflow_row.metadata ? 'pre_erasure_copy_gate'
     or workflow_row.metadata ->> 'auth_deleted' = 'true'
     or workflow_row.status = 'erased'
),
ranked as (
  select
    candidate.*,
    pg_catalog.row_number() over (
      partition by kc_private.kc_privacy_subject_key(candidate.target_user_id)
      order by
        case when candidate.status = 'erased' then 0 else 1 end,
        candidate.updated_at desc,
        candidate.workflow_id desc
    ) as subject_position
  from candidates candidate
  where candidate.target_user_id is not null
)
insert into kc_private.account_erasure_subject_closures (
  subject_key_hash,
  workflow_id,
  state,
  claimed_at,
  completed_at,
  updated_at
)
select
  kc_private.kc_privacy_subject_key(ranked.target_user_id),
  ranked.workflow_id,
  case when ranked.status = 'erased' then 'completed' else 'closing' end,
  ranked.updated_at,
  case when ranked.status = 'erased' then ranked.updated_at else null end,
  ranked.updated_at
from ranked
where ranked.subject_position = 1
on conflict (subject_key_hash) do nothing;

-- Claims emitidos pelo contrato antigo nao tinham session_id. Eles nao podem
-- ser promovidos implicitamente; sao invalidados e o caller deve reclamar.
update public.account_erasure_requests workflow_row
set
  operation_claim_token = null,
  operation_claimed_at = null,
  operation_claim_expires_at = null,
  operation_claimed_by = null,
  operation_claim_session_id = null,
  operation_version = case
    when workflow_row.operation_version < 2147483647
      then workflow_row.operation_version + 1
    else workflow_row.operation_version
  end,
  updated_at = pg_catalog.clock_timestamp()
where workflow_row.operation_claim_token is not null
  and workflow_row.operation_claim_session_id is null;

alter table public.account_erasure_requests
  drop constraint if exists account_erasure_claim_fields_check;

alter table public.account_erasure_requests
  add constraint account_erasure_claim_fields_check
  check (
    (
      operation_claim_token is null
      and operation_claimed_at is null
      and operation_claim_expires_at is null
      and operation_claimed_by is null
      and operation_claim_session_id is null
    )
    or (
      operation_claim_token is not null
      and operation_claimed_at is not null
      and operation_claim_expires_at is not null
      and operation_claimed_by is not null
      and operation_claim_session_id is not null
    )
  );

comment on column public.account_erasure_requests.operation_claim_session_id is
  'Sessao administrativa que adquiriu a lease. E revalidada no banco em claim, heartbeat, update e finalizacao.';

create or replace function kc_private.kc_assert_active_admin_session(
  p_actor_id uuid,
  p_actor_session_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_actor_id is null or p_actor_session_id is null then
    raise exception using
      errcode = '22023',
      message = 'ERASURE_ADMIN_SESSION_REQUIRED';
  end if;

  perform 1
  from public.profiles profile_row
  where profile_row.id = p_actor_id
    and profile_row.is_admin is true
  for share;
  if not found then
    raise exception using
      errcode = '42501',
      message = 'ERASURE_ADMIN_REQUIRED';
  end if;

  perform 1
  from auth.sessions session_row
  where session_row.id = p_actor_session_id
    and session_row.user_id = p_actor_id
  for share;
  if not found then
    raise exception using
      errcode = '42501',
      message = 'ERASURE_ADMIN_SESSION_NOT_ACTIVE';
  end if;
end;
$$;

revoke all on function kc_private.kc_assert_active_admin_session(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Um update direto com service_role nao pode contornar a lease. O trigger
-- permite apenas: claim novo/substituicao expirada, heartbeat com identidade
-- imutavel, update claimed com lease vigente, ou release ainda vigente.
create or replace function kc_private.kc_guard_account_erasure_claim_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_new_claim boolean := old.operation_claim_token is null
    and new.operation_claim_token is not null;
  v_release boolean := old.operation_claim_token is not null
    and new.operation_claim_token is null;
  v_same_claim boolean := old.operation_claim_token is not null
    and new.operation_claim_token = old.operation_claim_token;
  v_takeover boolean := old.operation_claim_token is not null
    and new.operation_claim_token is not null
    and new.operation_claim_token <> old.operation_claim_token;
begin
  if old.operation_claim_token is null
     and new.operation_claim_token is null then
    return new;
  end if;

  if v_new_claim then
    perform kc_private.kc_assert_active_admin_session(
      new.operation_claimed_by,
      new.operation_claim_session_id
    );
    if new.operation_version <> old.operation_version + 1
       or new.operation_claimed_at is null
       or new.operation_claim_expires_at is null
       or new.operation_claim_expires_at <= v_now
       or new.operation_claim_expires_at >
          v_now + pg_catalog.make_interval(secs => 900) then
      raise exception using
        errcode = '40001',
        message = 'ERASURE_OPERATION_CLAIM_INVALID';
    end if;
    return new;
  end if;

  if v_takeover then
    if old.operation_claim_expires_at is null
       or old.operation_claim_expires_at > v_now then
      raise exception using
        errcode = '55P03',
        message = 'ERASURE_OPERATION_ALREADY_CLAIMED';
    end if;
    perform kc_private.kc_assert_active_admin_session(
      new.operation_claimed_by,
      new.operation_claim_session_id
    );
    if new.operation_version <> old.operation_version + 1
       or new.operation_claimed_at is null
       or new.operation_claim_expires_at is null
       or new.operation_claim_expires_at <= v_now
       or new.operation_claim_expires_at >
          v_now + pg_catalog.make_interval(secs => 900) then
      raise exception using
        errcode = '40001',
        message = 'ERASURE_OPERATION_CLAIM_INVALID';
    end if;
    return new;
  end if;

  if old.operation_claim_expires_at is null
     or old.operation_claim_expires_at <= v_now then
    raise exception using
      errcode = '40001',
      message = 'ERASURE_OPERATION_LEASE_EXPIRED';
  end if;

  perform kc_private.kc_assert_active_admin_session(
    old.operation_claimed_by,
    old.operation_claim_session_id
  );

  if v_release then
    if new.operation_claimed_at is not null
       or new.operation_claim_expires_at is not null
       or new.operation_claimed_by is not null
       or new.operation_claim_session_id is not null
       or new.operation_version <> old.operation_version then
      raise exception using
        errcode = '40001',
        message = 'ERASURE_OPERATION_RELEASE_INVALID';
    end if;
    return new;
  end if;

  if v_same_claim then
    if new.operation_version <> old.operation_version
       or new.operation_claimed_at is distinct from old.operation_claimed_at
       or new.operation_claimed_by is distinct from old.operation_claimed_by
       or new.operation_claim_session_id is distinct from old.operation_claim_session_id
       or new.operation_claim_expires_at is null
       or new.operation_claim_expires_at < old.operation_claim_expires_at
       or new.operation_claim_expires_at >
          v_now + pg_catalog.make_interval(secs => 900) then
      raise exception using
        errcode = '40001',
        message = 'ERASURE_OPERATION_CLAIM_MUTATION_INVALID';
    end if;
    return new;
  end if;

  raise exception using
    errcode = '40001',
    message = 'ERASURE_OPERATION_CLAIM_INVALID';
end;
$$;

revoke all on function kc_private.kc_guard_account_erasure_claim_update()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_account_erasure_claim_update_guard
  on public.account_erasure_requests;
create trigger trg_account_erasure_claim_update_guard
before update on public.account_erasure_requests
for each row
execute function kc_private.kc_guard_account_erasure_claim_update();

create or replace function kc_private.kc_mark_account_erasure_closure_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'erased'
     and old.status is distinct from new.status then
    update kc_private.account_erasure_subject_closures closure_row
    set
      state = 'completed',
      completed_at = coalesce(
        closure_row.completed_at,
        new.erased_at,
        pg_catalog.clock_timestamp()
      ),
      updated_at = pg_catalog.clock_timestamp()
    where closure_row.workflow_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function kc_private.kc_mark_account_erasure_closure_completed()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_account_erasure_closure_completed
  on public.account_erasure_requests;
create trigger trg_account_erasure_closure_completed
after update of status on public.account_erasure_requests
for each row
execute function kc_private.kc_mark_account_erasure_closure_completed();

-- Consolida protocolos abertos duplicados de copia/portabilidade antes de
-- instalar a barreira unica. O mais antigo permanece canonico; os demais ficam
-- auditaveis como cancelados e seus artefatos tornam-se inelegiveis.
create temporary table kc_duplicate_open_export_requests
on commit drop
as
select
  duplicate_row.id,
  duplicate_row.help_request_id,
  duplicate_row.canonical_id
from (
  select
    request_row.id,
    request_row.help_request_id,
    pg_catalog.first_value(request_row.id) over (
      partition by request_row.user_id, request_row.request_kind
      order by request_row.created_at asc, request_row.id asc
    ) as canonical_id,
    pg_catalog.row_number() over (
      partition by request_row.user_id, request_row.request_kind
      order by request_row.created_at asc, request_row.id asc
    ) as position
  from public.data_subject_requests request_row
  where request_row.user_id is not null
    and request_row.request_kind in ('data_access_copy', 'data_portability')
    and request_row.status in (
      'received',
      'processing',
      'ready',
      'failed',
      'partial_failure'
    )
) duplicate_row
where duplicate_row.position > 1;

update public.data_subject_requests request_row
set
  status = 'cancelled',
  cancelled_at = coalesce(
    request_row.cancelled_at,
    pg_catalog.clock_timestamp()
  )
from kc_duplicate_open_export_requests duplicate_row
where request_row.id = duplicate_row.id;

insert into public.data_subject_request_events (
  request_id,
  actor_user_id,
  status,
  event_type,
  public_message
)
select
  duplicate_row.id,
  null,
  'cancelled',
  'cancelled',
  'Protocolo duplicado consolidado no pedido aberto ja existente.'
from kc_duplicate_open_export_requests duplicate_row;

update public.help_requests help_row
set
  status = 'archived',
  metadata = coalesce(help_row.metadata, '{}'::jsonb)
    || pg_catalog.jsonb_build_object(
      'data_subject_request_status', 'cancelled',
      'duplicate_request_consolidated', true,
      'canonical_data_subject_request_id', duplicate_row.canonical_id,
      'duplicate_request_consolidated_at', pg_catalog.clock_timestamp()
    )
from kc_duplicate_open_export_requests duplicate_row
where help_row.id = duplicate_row.help_request_id;

create unique index if not exists
  data_subject_requests_one_open_export_kind_per_user_uidx
on public.data_subject_requests (user_id, request_kind)
where user_id is not null
  and request_kind in ('data_access_copy', 'data_portability')
  and status in (
    'received',
    'processing',
    'ready',
    'failed',
    'partial_failure'
  );

comment on index public.data_subject_requests_one_open_export_kind_per_user_uidx is
  'Um protocolo aberto canonico por titular e direito de copia/portabilidade; retries e reloads recuperam a mesma solicitacao.';

create or replace function kc_private.kc_guard_dsr_against_erasure_closure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null then
    return new;
  end if;

  perform kc_private.kc_lock_privacy_subject(new.user_id);
  if exists (
    select 1
    from kc_private.account_erasure_subject_closures closure_row
    where closure_row.subject_key_hash =
      kc_private.kc_privacy_subject_key(new.user_id)
      and closure_row.state in ('closing', 'completed')
  ) then
    raise exception using
      errcode = '55000',
      message = 'PRIVACY_SUBJECT_IRREVERSIBLY_CLOSING';
  end if;
  return new;
end;
$$;

revoke all on function kc_private.kc_guard_dsr_against_erasure_closure()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_guard_dsr_against_erasure_closure
  on public.data_subject_requests;
create trigger trg_guard_dsr_against_erasure_closure
before insert on public.data_subject_requests
for each row
execute function kc_private.kc_guard_dsr_against_erasure_closure();

-- Mantem o corpo v2 anterior como implementacao base e coloca a recuperacao
-- canonica/barreira no unico ponto de entrada autenticado.
alter function kc_private.kc_create_data_subject_request_v2(
  text, text, text, text
)
rename to kc_create_data_subject_request_v2_20260728_base;

revoke all on function kc_private.kc_create_data_subject_request_v2_20260728_base(
  text, text, text, text
) from public, anon, authenticated, service_role;

create or replace function kc_private.kc_create_data_subject_request_v2(
  p_request_kind text,
  p_idempotency_key text,
  p_requested_format text default 'json',
  p_request_source text default 'settings'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_request_kind text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_request_kind, ''))
  );
  v_existing public.data_subject_requests%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_reuse_reason text;
begin
  if v_uid is null
     or coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true'
     or not kc_private.kc_is_current_session_active() then
    raise exception using errcode = '42501', message = 'DSR_AUTH_REQUIRED';
  end if;

  if v_request_kind not in (
    'data_access_copy',
    'data_portability',
    'account_erasure'
  ) then
    raise exception using
      errcode = '22023',
      message = 'DSR_INVALID_REQUEST_KIND';
  end if;

  perform kc_private.kc_lock_privacy_subject(v_uid);
  if exists (
    select 1
    from kc_private.account_erasure_subject_closures closure_row
    where closure_row.subject_key_hash =
      kc_private.kc_privacy_subject_key(v_uid)
      and closure_row.state in ('closing', 'completed')
  ) then
    raise exception using
      errcode = '55000',
      message = 'PRIVACY_SUBJECT_IRREVERSIBLY_CLOSING';
  end if;

  if v_request_kind in ('data_access_copy', 'data_portability') then
    select request_row.*
    into v_existing
    from public.data_subject_requests request_row
    where request_row.user_id = v_uid
      and request_row.request_kind = v_request_kind
      and request_row.status in (
        'received',
        'processing',
        'ready',
        'failed',
        'partial_failure'
      )
    order by request_row.created_at asc, request_row.id asc
    limit 1
    for update;

    if found then
      v_reuse_reason := 'open_' || v_request_kind;
      -- O frontend prepara apenas received/failed. Se a janela ready venceu
      -- antes deste clique, renove o mesmo protocolo sob o lock do titular,
      -- alinhado ao criador Help v2, para o primeiro retry ja ser utilizavel.
      if v_existing.status = 'ready'
         and coalesce(
           v_existing.expires_at,
           '-infinity'::timestamptz
         ) <= v_now then
        update public.data_subject_requests request_row
        set
          ready_at = coalesce(request_row.ready_at, v_now),
          expires_at = v_now + interval '15 minutes'
        where request_row.id = v_existing.id
          and request_row.user_id = v_uid
          and request_row.request_kind = v_request_kind
          and request_row.status = 'ready'
          and coalesce(
            request_row.expires_at,
            '-infinity'::timestamptz
          ) <= v_now
        returning request_row.* into v_existing;
        if not found then
          raise exception using
            errcode = '40001',
            message = 'DSR_CANONICAL_EXPORT_CHANGED';
        end if;
        v_reuse_reason := v_reuse_reason || '_ready_window_renewed';
      end if;

      return pg_catalog.jsonb_build_object(
        'request',
          pg_catalog.to_jsonb(v_existing)
            - 'user_id'
            - 'subject_hash'
            - 'idempotency_key',
        'reused_existing', true,
        'reuse_reason', v_reuse_reason
      );
    end if;
  end if;

  -- Somente criacoes novas chegam ao corpo base, que preserva validacao,
  -- idempotencia e os limites de cinco minutos/dez pedidos em 24 horas.
  return kc_private.kc_create_data_subject_request_v2_20260728_base(
    p_request_kind,
    p_idempotency_key,
    p_requested_format,
    p_request_source
  );
end;
$$;

revoke all on function kc_private.kc_create_data_subject_request_v2(
  text, text, text, text
) from public, anon;
grant execute on function kc_private.kc_create_data_subject_request_v2(
  text, text, text, text
) to authenticated;

create or replace function public.kc_create_data_subject_request_v2(
  p_request_kind text,
  p_idempotency_key text,
  p_requested_format text default 'json',
  p_request_source text default 'settings'
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_create_data_subject_request_v2($1, $2, $3, $4);
$$;

revoke all on function public.kc_create_data_subject_request_v2(
  text, text, text, text
) from public, anon;
grant execute on function public.kc_create_data_subject_request_v2(
  text, text, text, text
) to authenticated;

-- O endpoint legado permanece compativel, mas delega integralmente ao v2.
-- O helper privado antigo deixa de ser diretamente executavel por authenticated.
revoke all on function kc_private.kc_create_data_subject_request(
  text, text, text, text
) from public, anon, authenticated, service_role;

create or replace function public.kc_create_data_subject_request(
  p_request_kind text,
  p_idempotency_key text,
  p_requested_format text default 'json',
  p_request_source text default 'settings'
)
returns public.data_subject_requests
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_response jsonb;
  v_request_id uuid;
  v_result public.data_subject_requests%rowtype;
begin
  v_response := kc_private.kc_create_data_subject_request_v2(
    p_request_kind,
    p_idempotency_key,
    p_requested_format,
    p_request_source
  );
  v_request_id := nullif(v_response #>> '{request,id}', '')::uuid;

  select request_row.*
  into v_result
  from public.data_subject_requests request_row
  where request_row.id = v_request_id
    and request_row.user_id = auth.uid();
  if not found then
    raise exception using errcode = 'P0002', message = 'DSR_NOT_FOUND';
  end if;
  return v_result;
end;
$$;

revoke all on function public.kc_create_data_subject_request(
  text, text, text, text
) from public, anon;
grant execute on function public.kc_create_data_subject_request(
  text, text, text, text
) to authenticated;

create or replace function kc_private.kc_data_export_subject_is_eligible(
  p_request_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_request_id is not null
    and p_user_id is not null
    and not exists (
      select 1
      from kc_private.account_erasure_subject_closures closure_row
      where closure_row.subject_key_hash =
        kc_private.kc_privacy_subject_key(p_user_id)
        and closure_row.state in ('closing', 'completed')
    )
    and exists (
      select 1
      from auth.users user_row
      where user_row.id = p_user_id
    )
    and exists (
      select 1
      from public.data_subject_requests request_row
      where request_row.id = p_request_id
        and request_row.user_id = p_user_id
        and request_row.request_kind in (
          'data_access_copy',
          'data_portability'
        )
        and request_row.status in ('ready', 'partial_failure')
    )
    and not exists (
      select 1
      from public.data_subject_requests erasure_row
      where erasure_row.user_id = p_user_id
        and erasure_row.request_kind = 'account_erasure'
        and erasure_row.status in (
          'received',
          'processing',
          'ready',
          'pending_confirmation',
          'failed',
          'partial_failure'
        )
    );
$$;

revoke all on function kc_private.kc_data_export_subject_is_eligible(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Claim administrativo v2: o overload exige a sessao original do operador.
create or replace function kc_private.kc_claim_account_erasure_operation(
  p_request_id uuid,
  p_expected_status text,
  p_expected_version integer,
  p_actor_id uuid,
  p_actor_session_id uuid,
  p_ttl_seconds integer default 300
)
returns table (
  out_request_id uuid,
  out_claim_token uuid,
  out_operation_version integer,
  out_claim_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.account_erasure_requests%rowtype;
  v_claim_token uuid := extensions.gen_random_uuid();
  v_claimed_at timestamptz := pg_catalog.clock_timestamp();
  v_ttl_seconds integer := coalesce(p_ttl_seconds, 300);
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_request_id is null
     or p_actor_id is null
     or p_actor_session_id is null
     or p_expected_version is null
     or nullif(pg_catalog.btrim(coalesce(p_expected_status, '')), '') is null then
    raise exception using
      errcode = '22023',
      message = 'ERASURE_CLAIM_ARGUMENTS_REQUIRED';
  end if;
  if v_ttl_seconds < 30 or v_ttl_seconds > 900 then
    raise exception using
      errcode = '22023',
      message = 'ERASURE_CLAIM_TTL_INVALID';
  end if;

  perform kc_private.kc_assert_active_admin_session(
    p_actor_id,
    p_actor_session_id
  );

  select request_row.*
  into v_row
  from public.account_erasure_requests request_row
  where request_row.id = p_request_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'ERASURE_REQUEST_NOT_FOUND';
  end if;
  if v_row.status <> p_expected_status then
    raise exception using
      errcode = '40001',
      message = 'ERASURE_STATUS_CONFLICT',
      detail = v_row.status;
  end if;
  if v_row.operation_version <> p_expected_version then
    raise exception using
      errcode = '40001',
      message = 'ERASURE_VERSION_CONFLICT',
      detail = v_row.operation_version::text;
  end if;
  if v_row.operation_claim_token is not null
     and v_row.operation_claim_expires_at > v_claimed_at then
    raise exception using
      errcode = '55P03',
      message = 'ERASURE_OPERATION_ALREADY_CLAIMED';
  end if;

  update public.account_erasure_requests request_row
  set
    operation_claim_token = v_claim_token,
    operation_claimed_at = v_claimed_at,
    operation_claim_expires_at = v_claimed_at
      + pg_catalog.make_interval(secs => v_ttl_seconds),
    operation_claimed_by = p_actor_id,
    operation_claim_session_id = p_actor_session_id,
    operation_version = request_row.operation_version + 1
  where request_row.id = p_request_id
  returning
    request_row.id,
    request_row.operation_claim_token,
    request_row.operation_version,
    request_row.operation_claim_expires_at
  into
    out_request_id,
    out_claim_token,
    out_operation_version,
    out_claim_expires_at;

  return next;
end;
$$;

create or replace function public.kc_claim_account_erasure_operation(
  p_request_id uuid,
  p_expected_status text,
  p_expected_version integer,
  p_actor_id uuid,
  p_actor_session_id uuid,
  p_ttl_seconds integer default 300
)
returns table (
  out_request_id uuid,
  out_claim_token uuid,
  out_operation_version integer,
  out_claim_expires_at timestamptz
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_claim_account_erasure_operation(
    $1, $2, $3, $4, $5, $6
  );
$$;

revoke all on function kc_private.kc_claim_account_erasure_operation(
  uuid, text, integer, uuid, uuid, integer
) from public, anon, authenticated;
grant execute on function kc_private.kc_claim_account_erasure_operation(
  uuid, text, integer, uuid, uuid, integer
) to service_role;
revoke all on function public.kc_claim_account_erasure_operation(
  uuid, text, integer, uuid, uuid, integer
) from public, anon, authenticated;
grant execute on function public.kc_claim_account_erasure_operation(
  uuid, text, integer, uuid, uuid, integer
) to service_role;

-- O contrato antigo nao consegue provar a sessao do administrador e deixa de
-- ser executavel. A assinatura permanece no catalogo para falhar de forma
-- explicita em clientes desatualizados em vez de cair em ator confiado.
revoke all on function kc_private.kc_claim_account_erasure_operation(
  uuid, text, integer, uuid, integer
) from public, anon, authenticated, service_role;
revoke all on function public.kc_claim_account_erasure_operation(
  uuid, text, integer, uuid, integer
) from public, anon, authenticated, service_role;

create or replace function public.kc_claim_account_erasure_irreversible_operation(
  p_request_id uuid,
  p_expected_status text,
  p_expected_version integer,
  p_actor_id uuid,
  p_actor_session_id uuid,
  p_ttl_seconds integer default 300
)
returns table (
  out_request_id uuid,
  out_claim_token uuid,
  out_operation_version integer,
  out_claim_expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_gate jsonb;
  v_claim record;
  v_closure_written boolean := false;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_actor_session_id is null then
    raise exception using
      errcode = '22023',
      message = 'ERASURE_ADMIN_SESSION_REQUIRED';
  end if;

  select workflow_row.user_id
  into v_user_id
  from public.account_erasure_requests workflow_row
  where workflow_row.id = p_request_id;
  if not found or v_user_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'ERASURE_REQUEST_NOT_FOUND';
  end if;

  -- Esta e a mesma chave adquirida no wrapper/trigger de criacao de DSR.
  perform kc_private.kc_lock_privacy_subject(v_user_id);

  -- Revalida a linha depois de obter o lock de titular.
  perform 1
  from public.account_erasure_requests workflow_row
  where workflow_row.id = p_request_id
    and workflow_row.user_id = v_user_id
  for update;
  if not found then
    raise exception using
      errcode = '40001',
      message = 'ERASURE_SUBJECT_CHANGED';
  end if;

  perform kc_private.kc_assert_active_admin_session(
    p_actor_id,
    p_actor_session_id
  );

  v_gate := kc_private.kc_account_erasure_copy_gate_status(p_request_id);
  if coalesce((v_gate ->> 'ok')::boolean, false) is not true then
    raise exception using
      errcode = 'P0001',
      message = coalesce(
        v_gate ->> 'error',
        'ERASURE_COPY_GATE_FAILED'
      ),
      detail = v_gate::text;
  end if;

  select *
  into v_claim
  from kc_private.kc_claim_account_erasure_operation(
    p_request_id,
    p_expected_status,
    p_expected_version,
    p_actor_id,
    p_actor_session_id,
    p_ttl_seconds
  );

  insert into kc_private.account_erasure_subject_closures (
    subject_key_hash,
    workflow_id,
    state,
    claimed_at,
    completed_at,
    updated_at
  ) values (
    kc_private.kc_privacy_subject_key(v_user_id),
    p_request_id,
    'closing',
    pg_catalog.clock_timestamp(),
    null,
    pg_catalog.clock_timestamp()
  )
  on conflict (subject_key_hash) do update
  set
    state = case
      when account_erasure_subject_closures.state = 'completed'
        then 'completed'
      else 'closing'
    end,
    completed_at = case
      when account_erasure_subject_closures.state = 'completed'
        then account_erasure_subject_closures.completed_at
      else null
    end,
    updated_at = pg_catalog.clock_timestamp()
  where account_erasure_subject_closures.workflow_id =
    excluded.workflow_id;
  v_closure_written := found;

  if not v_closure_written then
    raise exception using
      errcode = '55000',
      message = 'ERASURE_SUBJECT_ALREADY_CLOSING';
  end if;

  update public.account_erasure_requests workflow_row
  set
    metadata = pg_catalog.jsonb_set(
      workflow_row.metadata,
      '{pre_erasure_copy_gate}',
      v_gate || pg_catalog.jsonb_build_object(
        'checked_at', pg_catalog.clock_timestamp(),
        'checked_by', p_actor_id,
        'closure_persisted', true
      ),
      true
    ),
    updated_at = pg_catalog.clock_timestamp()
  where workflow_row.id = p_request_id
    and workflow_row.operation_claim_token = v_claim.out_claim_token
    and workflow_row.operation_version =
      v_claim.out_operation_version
    and workflow_row.operation_claimed_by = p_actor_id
    and workflow_row.operation_claim_session_id =
      p_actor_session_id
    and workflow_row.operation_claim_expires_at >
      pg_catalog.clock_timestamp();
  if not found then
    raise exception using
      errcode = '40001',
      message = 'ERASURE_COPY_GATE_CLAIM_CONFLICT';
  end if;

  out_request_id := v_claim.out_request_id;
  out_claim_token := v_claim.out_claim_token;
  out_operation_version := v_claim.out_operation_version;
  out_claim_expires_at := v_claim.out_claim_expires_at;
  return next;
end;
$$;

revoke all on function public.kc_claim_account_erasure_irreversible_operation(
  uuid, text, integer, uuid, uuid, integer
) from public, anon, authenticated;
grant execute on function public.kc_claim_account_erasure_irreversible_operation(
  uuid, text, integer, uuid, uuid, integer
) to service_role;
revoke all on function public.kc_claim_account_erasure_irreversible_operation(
  uuid, text, integer, uuid, integer
) from public, anon, authenticated, service_role;

create or replace function kc_private.kc_renew_account_erasure_operation(
  p_request_id uuid,
  p_operation_claim_token uuid,
  p_expected_version integer,
  p_actor_id uuid,
  p_actor_session_id uuid,
  p_ttl_seconds integer default 300
)
returns table (
  out_request_id uuid,
  out_claim_token uuid,
  out_operation_version integer,
  out_claim_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.account_erasure_requests%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_ttl_seconds integer := coalesce(p_ttl_seconds, 300);
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_request_id is null
     or p_operation_claim_token is null
     or p_expected_version is null
     or p_actor_id is null
     or p_actor_session_id is null then
    raise exception using
      errcode = '22023',
      message = 'ERASURE_HEARTBEAT_ARGUMENTS_REQUIRED';
  end if;
  if v_ttl_seconds < 30 or v_ttl_seconds > 900 then
    raise exception using
      errcode = '22023',
      message = 'ERASURE_CLAIM_TTL_INVALID';
  end if;

  perform kc_private.kc_assert_active_admin_session(
    p_actor_id,
    p_actor_session_id
  );

  select workflow_row.*
  into v_row
  from public.account_erasure_requests workflow_row
  where workflow_row.id = p_request_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'ERASURE_REQUEST_NOT_FOUND';
  end if;

  if v_row.operation_claim_token is distinct from
       p_operation_claim_token
     or v_row.operation_version <> p_expected_version
     or v_row.operation_claimed_by is distinct from p_actor_id
     or v_row.operation_claim_session_id is distinct from
       p_actor_session_id
     or v_row.operation_claim_expires_at is null
     or v_row.operation_claim_expires_at <= v_now then
    raise exception using
      errcode = '40001',
      message = 'ERASURE_OPERATION_CLAIM_INVALID';
  end if;

  update public.account_erasure_requests workflow_row
  set
    operation_claim_expires_at = greatest(
      workflow_row.operation_claim_expires_at,
      v_now + pg_catalog.make_interval(secs => v_ttl_seconds)
    ),
    updated_at = v_now
  where workflow_row.id = p_request_id
    and workflow_row.operation_claim_token =
      p_operation_claim_token
    and workflow_row.operation_version = p_expected_version
    and workflow_row.operation_claimed_by = p_actor_id
    and workflow_row.operation_claim_session_id =
      p_actor_session_id
    and workflow_row.operation_claim_expires_at > v_now
  returning
    workflow_row.id,
    workflow_row.operation_claim_token,
    workflow_row.operation_version,
    workflow_row.operation_claim_expires_at
  into
    out_request_id,
    out_claim_token,
    out_operation_version,
    out_claim_expires_at;
  if not found then
    raise exception using
      errcode = '40001',
      message = 'ERASURE_OPERATION_CLAIM_INVALID';
  end if;

  return next;
end;
$$;

create or replace function public.kc_renew_account_erasure_operation(
  p_request_id uuid,
  p_operation_claim_token uuid,
  p_expected_version integer,
  p_actor_id uuid,
  p_actor_session_id uuid,
  p_ttl_seconds integer default 300
)
returns table (
  out_request_id uuid,
  out_claim_token uuid,
  out_operation_version integer,
  out_claim_expires_at timestamptz
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_renew_account_erasure_operation(
    $1, $2, $3, $4, $5, $6
  );
$$;

revoke all on function kc_private.kc_renew_account_erasure_operation(
  uuid, uuid, integer, uuid, uuid, integer
) from public, anon, authenticated;
grant execute on function kc_private.kc_renew_account_erasure_operation(
  uuid, uuid, integer, uuid, uuid, integer
) to service_role;
revoke all on function public.kc_renew_account_erasure_operation(
  uuid, uuid, integer, uuid, uuid, integer
) from public, anon, authenticated;
grant execute on function public.kc_renew_account_erasure_operation(
  uuid, uuid, integer, uuid, uuid, integer
) to service_role;

-- Todos os RPCs de finalizacao/outbox que usam este assert passam a validar
-- tambem a sessao/administrador gravados no claim, na mesma transacao.
create or replace function kc_private.kc_assert_erasure_operation_claim(
  p_workflow_id uuid,
  p_operation_claim_token uuid,
  p_required_status text default null
)
returns public.account_erasure_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_workflow public.account_erasure_requests%rowtype;
begin
  select *
  into v_workflow
  from public.account_erasure_requests workflow
  where workflow.id = p_workflow_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'ERASURE_WORKFLOW_NOT_FOUND';
  end if;
  if v_workflow.operation_claim_token is distinct from
       p_operation_claim_token
     or v_workflow.operation_claim_expires_at is null
     or v_workflow.operation_claim_expires_at <=
       pg_catalog.clock_timestamp()
     or v_workflow.operation_claimed_by is null
     or v_workflow.operation_claim_session_id is null then
    raise exception using
      errcode = '40001',
      message = 'ERASURE_OPERATION_CLAIM_INVALID';
  end if;

  perform kc_private.kc_assert_active_admin_session(
    v_workflow.operation_claimed_by,
    v_workflow.operation_claim_session_id
  );

  if p_required_status is not null
     and v_workflow.status <> p_required_status then
    raise exception using
      errcode = 'P0001',
      message = 'ERASURE_WORKFLOW_STATUS_INVALID';
  end if;
  return v_workflow;
end;
$$;

revoke all on function kc_private.kc_assert_erasure_operation_claim(
  uuid, uuid, text
) from public, anon, authenticated, service_role;

-- Reconcilia workflows historicamente duplicados sem apagar auditoria. O mais
-- recente permanece canonico; os demais ficam marcados e fora do indice unico.
with ranked as (
  select
    workflow_row.id,
    pg_catalog.first_value(workflow_row.id) over (
      partition by workflow_row.help_request_id
      order by workflow_row.created_at desc, workflow_row.id desc
    ) as canonical_id,
    pg_catalog.row_number() over (
      partition by workflow_row.help_request_id
      order by workflow_row.created_at desc, workflow_row.id desc
    ) as position
  from public.account_erasure_requests workflow_row
  where workflow_row.help_request_id is not null
    and not (workflow_row.metadata ? 'superseded_by')
)
update public.account_erasure_requests workflow_row
set
  metadata = workflow_row.metadata || pg_catalog.jsonb_build_object(
    'superseded_by', ranked.canonical_id,
    'superseded_at', pg_catalog.clock_timestamp(),
    'superseded_reason', 'duplicate_help_workflow_reconciled'
  ),
  updated_at = pg_catalog.clock_timestamp()
from ranked
where workflow_row.id = ranked.id
  and ranked.position > 1;

create unique index if not exists
  account_erasure_requests_canonical_help_uidx
on public.account_erasure_requests (help_request_id)
where help_request_id is not null
  and not (metadata ? 'superseded_by');

comment on index public.account_erasure_requests_canonical_help_uidx is
  'Um unico workflow canonico por ticket; linhas historicas superseded permanecem auditaveis.';

create or replace function public.kc_upsert_account_erasure_workflow(
  p_help_request_id uuid,
  p_data_subject_request_id uuid,
  p_user_id uuid,
  p_email_hash text,
  p_target_email_domain text,
  p_actor_id uuid,
  p_actor_session_id uuid,
  p_counts jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns public.account_erasure_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_help public.help_requests%rowtype;
  v_dsr public.data_subject_requests%rowtype;
  v_existing public.account_erasure_requests%rowtype;
  v_dsr_workflow_id uuid;
  v_closure_workflow_id uuid;
  v_result public.account_erasure_requests%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_help_request_id is null
     or p_actor_id is null
     or p_actor_session_id is null
     or coalesce(p_email_hash, '') !~ '^[a-f0-9]{64}$'
     or pg_catalog.jsonb_typeof(coalesce(p_counts, 'null'::jsonb)) <> 'object'
     or pg_catalog.jsonb_typeof(coalesce(p_metadata, 'null'::jsonb)) <> 'object'
     or p_metadata ? 'superseded_by'
     or (
       p_target_email_domain is not null
       and (
         pg_catalog.char_length(p_target_email_domain) > 120
         or p_target_email_domain !~
           '^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$'
       )
     ) then
    raise exception using
      errcode = '22023',
      message = 'ERASURE_WORKFLOW_ARGUMENTS_INVALID';
  end if;

  if p_user_id is not null then
    perform kc_private.kc_lock_privacy_subject(p_user_id);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'kc_erasure_help:' || p_help_request_id::text,
      0
    )
  );
  perform kc_private.kc_assert_active_admin_session(
    p_actor_id,
    p_actor_session_id
  );

  select help_row.*
  into v_help
  from public.help_requests help_row
  where help_row.id = p_help_request_id
  for share;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'ERASURE_HELP_REQUEST_NOT_FOUND';
  end if;
  if v_help.user_id is not null
     and p_user_id is not null
     and v_help.user_id <> p_user_id then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_WORKFLOW_TARGET_MISMATCH';
  end if;

  if p_data_subject_request_id is not null then
    select request_row.*
    into v_dsr
    from public.data_subject_requests request_row
    where request_row.id = p_data_subject_request_id
    for share;
    if not found
       or v_dsr.request_kind <> 'account_erasure'
       or v_dsr.help_request_id is distinct from p_help_request_id
       or (
         p_user_id is not null
         and v_dsr.user_id is distinct from p_user_id
       ) then
      raise exception using
        errcode = '23514',
        message = 'ERASURE_WORKFLOW_DSR_MISMATCH';
    end if;
  end if;

  select workflow_row.*
  into v_existing
  from public.account_erasure_requests workflow_row
  where workflow_row.help_request_id = p_help_request_id
    and not (workflow_row.metadata ? 'superseded_by')
  order by workflow_row.created_at desc, workflow_row.id desc
  limit 1
  for update;

  if p_data_subject_request_id is not null then
    select workflow_row.id
    into v_dsr_workflow_id
    from public.account_erasure_requests workflow_row
    where workflow_row.data_subject_request_id =
      p_data_subject_request_id
      and not (workflow_row.metadata ? 'superseded_by')
    limit 1;
    if v_dsr_workflow_id is not null
       and (
         v_existing.id is null
         or v_dsr_workflow_id <> v_existing.id
       ) then
      raise exception using
        errcode = '23514',
        message = 'ERASURE_WORKFLOW_DSR_ALREADY_LINKED';
    end if;
  end if;

  if p_user_id is not null then
    select closure_row.workflow_id
    into v_closure_workflow_id
    from kc_private.account_erasure_subject_closures closure_row
    where closure_row.subject_key_hash =
      kc_private.kc_privacy_subject_key(p_user_id);
    if v_closure_workflow_id is not null
       and (
         v_existing.id is null
         or v_closure_workflow_id <> v_existing.id
       ) then
      raise exception using
        errcode = '55000',
        message = 'ERASURE_SUBJECT_ALREADY_CLOSING';
    end if;
  end if;

  if v_existing.id is not null then
    -- Nenhum refresh de diagnostico atravessa um claim, nem mesmo expirado.
    -- O action caller reclamara com CAS e entao gravara sob a nova lease.
    if v_existing.operation_claim_token is not null then
      return v_existing;
    end if;

    update public.account_erasure_requests workflow_row
    set
      user_id = coalesce(p_user_id, workflow_row.user_id),
      data_subject_request_id = coalesce(
        workflow_row.data_subject_request_id,
        p_data_subject_request_id
      ),
      email_hash = p_email_hash,
      target_email_domain = case
        when workflow_row.metadata ->> 'auth_deleted' = 'true'
          then null
        else coalesce(
          workflow_row.target_email_domain,
          pg_catalog.lower(p_target_email_domain)
        )
      end,
      processed_by = p_actor_id,
      counts = p_counts,
      metadata = workflow_row.metadata || p_metadata,
      updated_at = pg_catalog.clock_timestamp()
    where workflow_row.id = v_existing.id
      and workflow_row.operation_claim_token is null
    returning workflow_row.* into v_result;
    if not found then
      raise exception using
        errcode = '40001',
        message = 'ERASURE_WORKFLOW_UPSERT_CONFLICT';
    end if;
    return v_result;
  end if;

  insert into public.account_erasure_requests (
    help_request_id,
    data_subject_request_id,
    user_id,
    email_hash,
    target_email_domain,
    processed_by,
    counts,
    status,
    metadata
  ) values (
    p_help_request_id,
    p_data_subject_request_id,
    p_user_id,
    p_email_hash,
    pg_catalog.lower(p_target_email_domain),
    p_actor_id,
    p_counts,
    'diagnosed',
    p_metadata
  )
  returning * into v_result;
  return v_result;
exception
  when unique_violation then
    select workflow_row.*
    into v_result
    from public.account_erasure_requests workflow_row
    where (
        workflow_row.help_request_id = p_help_request_id
        or (
          p_data_subject_request_id is not null
          and workflow_row.data_subject_request_id =
            p_data_subject_request_id
        )
      )
      and not (workflow_row.metadata ? 'superseded_by')
    order by workflow_row.created_at desc, workflow_row.id desc
    limit 1;
    if found then
      return v_result;
    end if;
    raise;
end;
$$;

revoke all on function public.kc_upsert_account_erasure_workflow(
  uuid, uuid, uuid, text, text, uuid, uuid, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.kc_upsert_account_erasure_workflow(
  uuid, uuid, uuid, text, text, uuid, uuid, jsonb, jsonb
) to service_role;

-- Wrapper de transicao DSR usado por exclusao administrativa. O worker
-- automatico continua usando ator null; toda transicao que atribui admin passa
-- por esta revalidacao transacional de sessao.
create or replace function public.kc_transition_data_subject_request_for_admin_session(
  p_request_id uuid,
  p_expected_status text,
  p_new_status text,
  p_actor_id uuid,
  p_actor_session_id uuid,
  p_event_type text,
  p_public_message text
)
returns public.data_subject_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  perform kc_private.kc_assert_active_admin_session(
    p_actor_id,
    p_actor_session_id
  );
  return kc_private.kc_transition_data_subject_request(
    p_request_id,
    p_expected_status,
    p_new_status,
    p_actor_id,
    p_event_type,
    p_public_message
  );
end;
$$;

revoke all on function public.kc_transition_data_subject_request_for_admin_session(
  uuid, text, text, uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.kc_transition_data_subject_request_for_admin_session(
  uuid, text, text, uuid, uuid, text, text
) to service_role;

-- Mantem a assinatura historica somente para o worker automatico, cujo evento
-- nao atribui uma decisao a um administrador. Qualquer ator humano precisa usar
-- o wrapper acima e provar uma auth.sessions ativa na mesma transacao.
create or replace function public.kc_transition_data_subject_request(
  p_request_id uuid,
  p_expected_status text,
  p_new_status text,
  p_actor_id uuid,
  p_event_type text,
  p_public_message text
)
returns public.data_subject_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_actor_id is not null then
    raise exception using errcode = '42501', message = 'DSR_ADMIN_SESSION_REQUIRED';
  end if;
  return kc_private.kc_transition_data_subject_request(
    p_request_id,
    p_expected_status,
    p_new_status,
    null,
    p_event_type,
    p_public_message
  );
end;
$$;

revoke all on function kc_private.kc_transition_data_subject_request(
  uuid, text, text, uuid, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.kc_transition_data_subject_request(
  uuid, text, text, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.kc_transition_data_subject_request(
  uuid, text, text, uuid, text, text
) to service_role;

create or replace function public.kc_record_account_erasure_copy_decision(
  p_workflow_id uuid,
  p_actor_id uuid,
  p_actor_session_id uuid,
  p_decision text,
  p_reference_hash text,
  p_decided_at timestamptz,
  p_attested boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  perform kc_private.kc_assert_active_admin_session(
    p_actor_id,
    p_actor_session_id
  );
  return public.kc_record_account_erasure_copy_decision(
    p_workflow_id,
    p_actor_id,
    p_decision,
    p_reference_hash,
    p_decided_at,
    p_attested
  );
end;
$$;

revoke all on function public.kc_record_account_erasure_copy_decision(
  uuid, uuid, uuid, text, text, timestamptz, boolean
) from public, anon, authenticated;
grant execute on function public.kc_record_account_erasure_copy_decision(
  uuid, uuid, uuid, text, text, timestamptz, boolean
) to service_role;
revoke all on function public.kc_record_account_erasure_copy_decision(
  uuid, uuid, text, text, timestamptz, boolean
) from public, anon, authenticated, service_role;

create or replace function public.kc_account_erasure_capabilities()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_guard_coverage jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  v_guard_coverage := public.kc_active_session_guard_coverage();
  return pg_catalog.jsonb_build_object(
    'version', 4,
    'write_quiescence',
      coalesce((v_guard_coverage ->> 'ok')::boolean, false),
    'chat_preserving_delete', true,
    'cadu_set_null', true,
    'unit_meta_set_null', true,
    'community_content_preserving_delete', true,
    'safety_records_preserving_delete', true,
    'audit_identifier_redaction', true,
    'audit_personal_email_redaction', true,
    'help_request_redaction_postcondition', true,
    'pre_erasure_copy_gate', true,
    'export_artifact_erasure_purge', true,
    'encrypted_completion_outbox', true,
    'durable_subject_closure', true,
    'renewable_operation_lease', true,
    'admin_session_bound_claims', true,
    'atomic_workflow_upsert', true
  );
end;
$$;

revoke all on function public.kc_account_erasure_capabilities()
  from public, anon, authenticated;
grant execute on function public.kc_account_erasure_capabilities()
  to service_role;

comment on function public.kc_renew_account_erasure_operation(
  uuid, uuid, integer, uuid, uuid, integer
) is
  'Renova apenas uma lease ainda vigente quando token, versao, admin e auth.sessions continuam identicos e ativos.';
comment on function public.kc_upsert_account_erasure_workflow(
  uuid, uuid, uuid, text, text, uuid, uuid, jsonb, jsonb
) is
  'Cria ou recupera atomicamente o workflow canonico por Help/DSR sob locks, unicidade parcial e sessao administrativa revalidada.';
comment on table kc_private.account_erasure_subject_closures is
  'Estado duravel de fechamento irreversivel por chave pseudonimizada do titular; bloqueia novos DSRs e exports apos o claim.';

commit;

-- KinoCampus - prova de posse e entrega idempotente para notificacoes de ajuda.
--
-- Antes desta migracao, kc-help-request-notify aceitava somente o UUID de um
-- help_request e fazia a leitura com service_role. UUID nao e autorizacao:
-- qualquer pessoa que obtivesse ou adivinhasse um identificador poderia
-- provocar leituras privilegiadas e disparos de e-mail.
--
-- O fluxo novo:
--   1. cria o pedido e um segredo aleatorio na mesma transacao;
--   2. devolve o segredo bruto uma unica vez ao cliente;
--   3. persiste somente SHA-256 + TTL em kc_private;
--   4. a Edge Function reserva um lease atomico antes do SMTP;
--   5. replay, corrida, lease stale e retry sao estados explicitos;
--   6. usuario autenticado precisa ser o owner; anonimo precisa do segredo.

begin;

create table if not exists kc_private.help_request_notification_claims (
  help_request_id uuid primary key
    references public.help_requests(id) on delete cascade,
  owner_id uuid null
    references auth.users(id) on delete cascade,
  claim_hash text not null
    check (claim_hash ~ '^[0-9a-f]{64}$'),
  claim_expires_at timestamptz not null,
  status text not null default 'ready'
    check (status in ('ready', 'processing', 'sent', 'failed')),
  attempt_count integer not null default 0
    check (attempt_count between 0 and 10),
  lease_id uuid,
  lease_expires_at timestamptz,
  last_attempt_at timestamptz,
  completed_at timestamptz,
  last_result jsonb not null default '{}'::jsonb
    check (jsonb_typeof(last_result) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'processing' and lease_id is not null and lease_expires_at is not null)
    or
    (status <> 'processing' and lease_id is null and lease_expires_at is null)
  )
);

create index if not exists help_request_notification_claims_expiry_idx
  on kc_private.help_request_notification_claims (claim_expires_at);

create index if not exists help_request_notification_claims_recovery_idx
  on kc_private.help_request_notification_claims (status, lease_expires_at)
  where status in ('processing', 'failed');

revoke all on table kc_private.help_request_notification_claims
  from public, anon, authenticated, service_role;

comment on table kc_private.help_request_notification_claims is
  'Private one-time ownership proof and CAS lease state for help-request email delivery. Stores only a SHA-256 claim digest; never the raw claim.';

-- Cria o pedido pelo worker sanitizador ja existente e, somente para o fluxo
-- canonico de acesso externo, cria a prova de posse na mesma transacao.
create or replace function kc_private.kc_create_help_request_with_notification_claim(
  p_payload jsonb
)
returns table (
  out_id uuid,
  out_created_at timestamptz,
  out_notification_claim text,
  out_notification_claim_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created record;
  v_raw_claim text;
  v_expires_at timestamptz;
  v_type text := lower(btrim(coalesce(p_payload ->> 'type', '')));
begin
  if auth.uid() is not null
     and not kc_private.kc_is_current_session_active() then
    raise exception using
      errcode = '42501',
      message = 'AUTH_SESSION_NOT_ACTIVE';
  end if;

  select *
    into strict v_created
  from kc_private.kc_create_help_request(p_payload);

  out_id := v_created.out_id;
  out_created_at := v_created.out_created_at;
  out_notification_claim := null;
  out_notification_claim_expires_at := null;

  if v_type = 'external_access' then
    v_raw_claim := encode(extensions.gen_random_bytes(32), 'hex');
    v_expires_at := now() + interval '15 minutes';

    insert into kc_private.help_request_notification_claims (
      help_request_id,
      owner_id,
      claim_hash,
      claim_expires_at
    )
    values (
      out_id,
      auth.uid(),
      encode(
        extensions.digest(convert_to(v_raw_claim, 'UTF8'), 'sha256'),
        'hex'
      ),
      v_expires_at
    );

    out_notification_claim := v_raw_claim;
    out_notification_claim_expires_at := v_expires_at;
  end if;

  return next;
end;
$$;

create or replace function public.kc_create_help_request_with_notification_claim(
  p_payload jsonb
)
returns table (
  out_id uuid,
  out_created_at timestamptz,
  out_notification_claim text,
  out_notification_claim_expires_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_create_help_request_with_notification_claim($1)
$$;

revoke all on function
  kc_private.kc_create_help_request_with_notification_claim(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  kc_private.kc_create_help_request_with_notification_claim(jsonb)
  to anon, authenticated, service_role;

revoke all on function
  public.kc_create_help_request_with_notification_claim(jsonb)
  from public;
grant execute on function
  public.kc_create_help_request_with_notification_claim(jsonb)
  to anon, authenticated, service_role;

comment on function
  public.kc_create_help_request_with_notification_claim(jsonb) is
  'Creates a sanitized help request and returns a short-lived raw notification claim once. Only its SHA-256 digest is persisted.';

-- Reserva de entrega. A RPC e service-only; a Edge Function fornece somente
-- caller_id obtido de getUser + sessao ativa, nunca um valor confiado do body.
create or replace function kc_private.kc_claim_help_request_notification(
  p_help_request_id uuid,
  p_claim_token text,
  p_caller_id uuid,
  p_lease_id uuid,
  p_lease_seconds integer default 120
)
returns table (
  out_state text,
  out_help_request jsonb,
  out_attempt integer,
  out_lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim kc_private.help_request_notification_claims%rowtype;
  v_help jsonb;
  v_token_hash text;
  v_now timestamptz := now();
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 120), 300));
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_help_request_id is null or p_lease_id is null then
    raise exception using
      errcode = '22023',
      message = 'NOTIFICATION_CLAIM_INVALID';
  end if;

  select claim_row.*
    into v_claim
  from kc_private.help_request_notification_claims claim_row
  join public.help_requests help_row
    on help_row.id = claim_row.help_request_id
  where claim_row.help_request_id = p_help_request_id
    and (
      help_row.type = 'external_access'
      or coalesce(help_row.metadata ->> 'request_kind', '') = 'external_access'
    )
  for update of claim_row;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'NOTIFICATION_CLAIM_INVALID';
  end if;

  select to_jsonb(help_row)
    into strict v_help
  from public.help_requests help_row
  where help_row.id = p_help_request_id;

  -- Owner autenticado e claim anonimo sao modos mutuamente exclusivos. Isso
  -- impede uma sessao autenticada de "adotar" um pedido anonimo por e-mail.
  if p_caller_id is not null then
    if v_claim.owner_id is null or v_claim.owner_id <> p_caller_id then
      raise exception using
        errcode = '42501',
        message = 'NOTIFICATION_CLAIM_INVALID';
    end if;
  else
    if p_claim_token is null
       or p_claim_token !~ '^[0-9a-f]{64}$' then
      raise exception using
        errcode = '42501',
        message = 'NOTIFICATION_CLAIM_INVALID';
    end if;

    v_token_hash := encode(
      extensions.digest(convert_to(p_claim_token, 'UTF8'), 'sha256'),
      'hex'
    );
    if v_token_hash <> v_claim.claim_hash then
      raise exception using
        errcode = '42501',
        message = 'NOTIFICATION_CLAIM_INVALID';
    end if;
  end if;

  if v_claim.claim_expires_at <= v_now then
    raise exception using
      errcode = 'P0001',
      message = 'NOTIFICATION_CLAIM_EXPIRED';
  end if;

  if v_claim.status = 'sent' then
    out_state := 'already_sent';
    out_help_request := null;
    out_attempt := v_claim.attempt_count;
    out_lease_expires_at := null;
    return next;
    return;
  end if;

  if v_claim.status = 'processing'
     and v_claim.lease_expires_at > v_now
     and v_claim.lease_id <> p_lease_id then
    raise exception using
      errcode = '55P03',
      message = 'NOTIFICATION_DELIVERY_BUSY';
  end if;

  if v_claim.attempt_count >= 10 then
    raise exception using
      errcode = '54000',
      message = 'NOTIFICATION_ATTEMPTS_EXHAUSTED';
  end if;

  update kc_private.help_request_notification_claims
  set
    status = 'processing',
    attempt_count = attempt_count + 1,
    lease_id = p_lease_id,
    lease_expires_at = v_now + make_interval(secs => v_lease_seconds),
    last_attempt_at = v_now,
    updated_at = v_now
  where help_request_id = p_help_request_id
  returning
    'claimed',
    v_help,
    attempt_count,
    lease_expires_at
  into
    out_state,
    out_help_request,
    out_attempt,
    out_lease_expires_at;

  return next;
end;
$$;

create or replace function public.kc_claim_help_request_notification(
  p_help_request_id uuid,
  p_claim_token text,
  p_caller_id uuid,
  p_lease_id uuid,
  p_lease_seconds integer default 120
)
returns table (
  out_state text,
  out_help_request jsonb,
  out_attempt integer,
  out_lease_expires_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_claim_help_request_notification($1, $2, $3, $4, $5)
$$;

revoke all on function
  kc_private.kc_claim_help_request_notification(uuid, text, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function
  kc_private.kc_claim_help_request_notification(uuid, text, uuid, uuid, integer)
  to service_role;
revoke all on function
  public.kc_claim_help_request_notification(uuid, text, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function
  public.kc_claim_help_request_notification(uuid, text, uuid, uuid, integer)
  to service_role;

-- Completa a reserva por compare-and-swap. O resultado persistido e
-- deliberadamente pequeno e sem endereco de e-mail, corpo SMTP ou stack.
create or replace function kc_private.kc_complete_help_request_notification(
  p_help_request_id uuid,
  p_lease_id uuid,
  p_succeeded boolean,
  p_result jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb := coalesce(p_result, '{}'::jsonb);
  v_safe_result jsonb;
  v_new_status text;
  v_updated integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_help_request_id is null or p_lease_id is null
     or jsonb_typeof(v_result) <> 'object'
     or pg_column_size(v_result) > 8192 then
    raise exception using
      errcode = '22023',
      message = 'NOTIFICATION_COMPLETION_INVALID';
  end if;

  v_new_status := case when coalesce(p_succeeded, false) then 'sent' else 'failed' end;
  v_safe_result := jsonb_strip_nulls(jsonb_build_object(
    'admin_notification',
      jsonb_strip_nulls(jsonb_build_object(
        'status', left(coalesce(v_result #>> '{admin_notification,status}', ''), 24),
        'provider', left(coalesce(v_result #>> '{admin_notification,provider}', ''), 40),
        'accepted_at', left(coalesce(v_result #>> '{admin_notification,accepted_at}', ''), 40),
        'error_code', left(coalesce(v_result #>> '{admin_notification,error_code}', ''), 80)
      )),
    'ack_email',
      jsonb_strip_nulls(jsonb_build_object(
        'status', left(coalesce(v_result #>> '{ack_email,status}', ''), 24),
        'provider', left(coalesce(v_result #>> '{ack_email,provider}', ''), 40),
        'accepted_at', left(coalesce(v_result #>> '{ack_email,accepted_at}', ''), 40),
        'error_code', left(coalesce(v_result #>> '{ack_email,error_code}', ''), 80)
      ))
  ));

  update kc_private.help_request_notification_claims
  set
    status = v_new_status,
    lease_id = null,
    lease_expires_at = null,
    completed_at = case when p_succeeded then now() else null end,
    last_result = v_safe_result,
    updated_at = now()
  where help_request_id = p_help_request_id
    and status = 'processing'
    and lease_id = p_lease_id;
  get diagnostics v_updated = row_count;

  if v_updated <> 1 then
    return false;
  end if;

  update public.help_requests
  set
    metadata = coalesce(metadata, '{}'::jsonb) || v_safe_result,
    updated_at = now()
  where id = p_help_request_id;

  return true;
end;
$$;

create or replace function public.kc_complete_help_request_notification(
  p_help_request_id uuid,
  p_lease_id uuid,
  p_succeeded boolean,
  p_result jsonb default '{}'::jsonb
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select kc_private.kc_complete_help_request_notification($1, $2, $3, $4)
$$;

revoke all on function
  kc_private.kc_complete_help_request_notification(uuid, uuid, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function
  kc_private.kc_complete_help_request_notification(uuid, uuid, boolean, jsonb)
  to service_role;
revoke all on function
  public.kc_complete_help_request_notification(uuid, uuid, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function
  public.kc_complete_help_request_notification(uuid, uuid, boolean, jsonb)
  to service_role;

create or replace function kc_private.kc_purge_help_request_notification_claims(
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  with candidates as (
    select claim_row.help_request_id
    from kc_private.help_request_notification_claims claim_row
    where claim_row.claim_expires_at < now() - interval '1 day'
      and not (
        claim_row.status = 'processing'
        and claim_row.lease_expires_at > now()
      )
    order by claim_row.claim_expires_at
    limit greatest(1, least(coalesce(p_limit, 500), 5000))
    for update skip locked
  )
  delete from kc_private.help_request_notification_claims claim_row
  using candidates
  where claim_row.help_request_id = candidates.help_request_id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create or replace function public.kc_purge_help_request_notification_claims(
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'SERVICE_ROLE_REQUIRED';
  end if;
  return kc_private.kc_purge_help_request_notification_claims(p_limit);
end;
$$;

revoke all on function
  kc_private.kc_purge_help_request_notification_claims(integer)
  from public, anon, authenticated, service_role;
revoke all on function
  public.kc_purge_help_request_notification_claims(integer)
  from public, anon, authenticated;
grant execute on function
  public.kc_purge_help_request_notification_claims(integer)
  to service_role;

create table if not exists kc_private.help_notification_retention_schedule_state (
  singleton boolean primary key default true check (singleton),
  cron_available boolean not null,
  scheduled boolean not null,
  job_id bigint,
  schedule text not null default '41 3 * * *',
  checked_at timestamptz not null default now(),
  operational_alert text
);

revoke all on table kc_private.help_notification_retention_schedule_state
  from public, anon, authenticated, service_role;

do $$
declare
  v_job_id bigint;
  v_existing boolean := false;
begin
  if to_regclass('cron.job') is null
     or to_regprocedure('cron.schedule(text,text,text)') is null then
    insert into kc_private.help_notification_retention_schedule_state (
      singleton, cron_available, scheduled, operational_alert
    ) values (
      true, false, false, 'PG_CRON_UNAVAILABLE_HELP_CLAIM_PURGE_NOT_SCHEDULED'
    )
    on conflict (singleton) do update set
      cron_available = excluded.cron_available,
      scheduled = excluded.scheduled,
      job_id = null,
      checked_at = now(),
      operational_alert = excluded.operational_alert;
    raise warning 'PG_CRON_UNAVAILABLE_HELP_CLAIM_PURGE_NOT_SCHEDULED';
    return;
  end if;

  execute
    'select exists (select 1 from cron.job where jobname = $1)'
    into v_existing
    using 'kc-help-notification-claim-purge-daily';
  if v_existing then
    execute 'select cron.unschedule($1)'
      using 'kc-help-notification-claim-purge-daily';
  end if;

  execute 'select cron.schedule($1, $2, $3)'
    into v_job_id
    using
      'kc-help-notification-claim-purge-daily',
      '41 3 * * *',
      'select kc_private.kc_purge_help_request_notification_claims(500);';

  insert into kc_private.help_notification_retention_schedule_state (
    singleton, cron_available, scheduled, job_id, operational_alert
  ) values (
    true, true, true, v_job_id, null
  )
  on conflict (singleton) do update set
    cron_available = excluded.cron_available,
    scheduled = excluded.scheduled,
    job_id = excluded.job_id,
    checked_at = now(),
    operational_alert = excluded.operational_alert;
exception
  when others then
    insert into kc_private.help_notification_retention_schedule_state (
      singleton, cron_available, scheduled, job_id, operational_alert
    ) values (
      true,
      true,
      false,
      null,
      'HELP_CLAIM_PURGE_CRON_SCHEDULE_FAILED:' || sqlstate
    )
    on conflict (singleton) do update set
      cron_available = excluded.cron_available,
      scheduled = excluded.scheduled,
      job_id = excluded.job_id,
      checked_at = now(),
      operational_alert = excluded.operational_alert;
    raise warning 'Help notification claim purge scheduling failed: %', sqlerrm;
end;
$$;

commit;

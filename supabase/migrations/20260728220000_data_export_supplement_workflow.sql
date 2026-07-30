-- ============================================================================
-- KinoCampus - unicidade de exclusao e suplemento privado de exportacao LGPD
-- ============================================================================
-- Contratos:
--   * somente um pedido de exclusao nao terminal por titular;
--   * retries concorrentes reutilizam o protocolo ja aberto;
--   * artefatos usam bucket privado e nomes aleatorios sem UUID/e-mail;
--   * claim/finalize/download/purge usam CAS e tokens guardados apenas por hash;
--   * o ticket de ajuda permanece aberto ate a entrega integral comprovada;
--   * nenhum operador manual pendente permite concluir automaticamente.
-- ============================================================================

begin;

-- Consolida qualquer duplicidade historica antes de instalar a barreira unica.
-- A solicitacao mais antiga permanece como protocolo canonico. Nenhum dado e
-- apagado e os protocolos consolidados continuam auditaveis como cancelados.
create temporary table kc_duplicate_open_erasure_requests
on commit drop
as
select duplicate_row.id, duplicate_row.help_request_id
from (
  select
    request_row.id,
    request_row.help_request_id,
    row_number() over (
      partition by request_row.user_id
      order by request_row.created_at asc, request_row.id asc
    ) as position
  from public.data_subject_requests request_row
  where request_row.user_id is not null
    and request_row.request_kind = 'account_erasure'
    and request_row.status in (
      'received',
      'processing',
      'ready',
      'pending_confirmation',
      'failed',
      'partial_failure'
    )
) duplicate_row
where duplicate_row.position > 1;

update public.data_subject_requests request_row
set
  status = 'cancelled',
  cancelled_at = coalesce(request_row.cancelled_at, now())
from kc_duplicate_open_erasure_requests duplicate_row
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
  'Protocolo duplicado consolidado no pedido de exclusao ja existente.'
from kc_duplicate_open_erasure_requests duplicate_row;

update public.help_requests help_row
set
  status = 'archived',
  metadata = coalesce(help_row.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'data_subject_request_status', 'cancelled',
      'duplicate_request_consolidated', true,
      'duplicate_request_consolidated_at', now()
    )
from kc_duplicate_open_erasure_requests duplicate_row
where help_row.id = duplicate_row.help_request_id;

create unique index data_subject_requests_one_open_erasure_per_user_uidx
  on public.data_subject_requests (user_id)
  where user_id is not null
    and request_kind = 'account_erasure'
    and status in (
      'received',
      'processing',
      'ready',
      'pending_confirmation',
      'failed',
      'partial_failure'
    );

comment on index public.data_subject_requests_one_open_erasure_per_user_uidx is
  'Barreira transacional: um unico protocolo de exclusao aberto, inclusive em revisao/erro parcial, por titular.';

-- Exclusao e exportacao usam a mesma chave transacional por titular. O lock
-- nao substitui as revalidacoes de estado: ele apenas define uma ordem comum
-- para que claim/finalize nunca observem um estado intermediario concorrente.
create or replace function kc_private.kc_lock_privacy_subject(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'PRIVACY_SUBJECT_REQUIRED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'kc_privacy_subject:' || p_user_id::text,
      0
    )
  );
end;
$$;

revoke all on function kc_private.kc_lock_privacy_subject(uuid)
  from public, anon, authenticated, service_role;

-- A triagem generica da Central de Ajuda nao pode encerrar lateralmente um
-- pedido de copia/portabilidade ainda nao entregue.
create or replace function kc_private.kc_guard_open_data_export_help_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('resolved', 'archived')
     and old.status is distinct from new.status
     and exists (
       select 1
       from public.data_subject_requests request_row
       where (
           request_row.help_request_id = new.id
           or request_row.id::text =
             coalesce(new.metadata ->> 'data_subject_request_id', '')
         )
         and request_row.request_kind in ('data_access_copy', 'data_portability')
         and request_row.status not in ('completed', 'cancelled', 'expired')
     ) then
    raise exception using errcode = '23514', message = 'DSR_HELP_MUST_REMAIN_OPEN';
  end if;
  return new;
end;
$$;

revoke all on function kc_private.kc_guard_open_data_export_help_status()
  from public, anon, authenticated;

drop trigger if exists trg_guard_open_data_export_help_status
  on public.help_requests;
create trigger trg_guard_open_data_export_help_status
before update of status on public.help_requests
for each row
execute function kc_private.kc_guard_open_data_export_help_status();

-- Resposta estruturada e idempotencia sem depender da interface. Exportacoes
-- continuam usando o RPC original; exclusoes recebem uma criacao dedicada que
-- reutiliza qualquer protocolo aberto sob advisory lock.
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
  v_email text;
  v_request_kind text := lower(trim(coalesce(p_request_kind, '')));
  v_idempotency_key text := trim(coalesce(p_idempotency_key, ''));
  v_requested_format text := lower(trim(coalesce(p_requested_format, 'json')));
  v_request_source text := lower(trim(coalesce(p_request_source, 'settings')));
  v_request_id uuid;
  v_help_request_id uuid;
  v_protocol text;
  v_existing public.data_subject_requests%rowtype;
  v_result public.data_subject_requests%rowtype;
  v_scope jsonb;
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
    raise exception using errcode = '22023', message = 'DSR_INVALID_REQUEST_KIND';
  end if;
  if v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception using errcode = '22023', message = 'DSR_INVALID_IDEMPOTENCY_KEY';
  end if;
  if v_requested_format <> 'json' then
    raise exception using errcode = '22023', message = 'DSR_UNSUPPORTED_FORMAT';
  end if;
  if v_request_source not in ('settings', 'help', 'api') then
    raise exception using errcode = '22023', message = 'DSR_INVALID_SOURCE';
  end if;

  perform kc_private.kc_lock_privacy_subject(v_uid);

  -- Os outros direitos preservam integralmente o contrato legado.
  if v_request_kind <> 'account_erasure' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_uid::text, 7357)
    );
    select request_row.*
      into v_existing
    from public.data_subject_requests request_row
    where request_row.user_id = v_uid
      and request_row.request_kind = v_request_kind
      and request_row.idempotency_key = v_idempotency_key
    order by request_row.created_at desc
    limit 1;
    if found then
      return jsonb_build_object(
        'request',
          to_jsonb(v_existing)
            - 'user_id'
            - 'subject_hash'
            - 'idempotency_key',
        'reused_existing', true,
        'reuse_reason', 'idempotency_key'
      );
    end if;
    v_result := kc_private.kc_create_data_subject_request(
      v_request_kind,
      v_idempotency_key,
      v_requested_format,
      v_request_source
    );
    return jsonb_build_object(
      'request',
        to_jsonb(v_result)
          - 'user_id'
          - 'subject_hash'
          - 'idempotency_key',
      'reused_existing', false,
      'reuse_reason', null
    );
  end if;

  select lower(trim(user_row.email))
    into v_email
  from auth.users user_row
  where user_row.id = v_uid;
  if v_email is null or v_email = '' then
    raise exception using errcode = '23514', message = 'DSR_ACCOUNT_EMAIL_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('open-erasure:' || v_uid::text, 7357)
  );

  select request_row.*
    into v_existing
  from public.data_subject_requests request_row
  where request_row.user_id = v_uid
    and request_row.request_kind = 'account_erasure'
    and request_row.status in (
      'received',
      'processing',
      'ready',
      'pending_confirmation',
      'failed',
      'partial_failure'
    )
  order by request_row.created_at asc, request_row.id asc
  limit 1
  for update;

  if found then
    return jsonb_build_object(
      'request',
        to_jsonb(v_existing)
          - 'user_id'
          - 'subject_hash'
          - 'idempotency_key',
      'reused_existing', true,
      'reuse_reason', 'open_account_erasure'
    );
  end if;

  -- Estados terminais liberam um novo pedido. Mantemos apenas o teto geral de
  -- abuso; nao aplicamos a janela curta do RPC legado a exclusoes encerradas.
  if (
    select count(*)
    from public.data_subject_requests request_row
    where request_row.user_id = v_uid
      and request_row.created_at > now() - interval '24 hours'
  ) >= 10 then
    raise exception using errcode = 'P0001', message = 'DSR_RATE_LIMIT_24H';
  end if;

  v_request_id := gen_random_uuid();
  v_help_request_id := gen_random_uuid();
  v_protocol := 'KC-DSR-'
    || to_char(now() at time zone 'UTC', 'YYYYMMDD')
    || '-'
    || upper(substr(replace(v_request_id::text, '-', ''), 1, 16));
  v_scope := jsonb_build_array(
    'account',
    'profile',
    'authored_content',
    'interactions',
    'communications',
    'preferences',
    'consents',
    'storage_objects',
    'linked_identifiers'
  );

  insert into public.help_requests (
    id,
    user_id,
    type,
    topic,
    subtopic,
    subject,
    message,
    priority,
    status,
    page_path,
    contact_email,
    allow_contact,
    metadata
  ) values (
    v_help_request_id,
    v_uid,
    'account_access',
    'onboarding_settings',
    'account_deletion',
    'Solicitacao de exclusao de conta e dados',
    'Pedido autenticado criado pela plataforma. Protocolo: ' || v_protocol || '.',
    'normal',
    'new',
    '/settings.html',
    v_email,
    true,
    jsonb_build_object(
      'request_kind', 'account_erasure',
      'protocol', v_protocol,
      'data_subject_request_id', v_request_id,
      'requested_format', 'json',
      'request_source', v_request_source,
      'export_schema_version', 1,
      'identity_source', 'authenticated_account'
    )
  );

  insert into public.data_subject_requests (
    id,
    protocol,
    user_id,
    help_request_id,
    subject_hash,
    request_kind,
    status,
    idempotency_key,
    requested_format,
    request_source,
    export_schema_version,
    scope
  ) values (
    v_request_id,
    v_protocol,
    v_uid,
    v_help_request_id,
    encode(extensions.gen_random_bytes(32), 'hex'),
    'account_erasure',
    'received',
    v_idempotency_key,
    'json',
    v_request_source,
    1,
    v_scope
  )
  returning * into v_result;

  insert into public.data_subject_request_events (
    request_id,
    actor_user_id,
    status,
    event_type,
    public_message
  ) values (
    v_result.id,
    v_uid,
    'received',
    'created',
    'Solicitacao recebida e protocolada.'
  );

  return jsonb_build_object(
    'request',
      to_jsonb(v_result)
        - 'user_id'
        - 'subject_hash'
        - 'idempotency_key',
    'reused_existing', false,
    'reuse_reason', null
  );
exception
  when unique_violation then
    -- A constraint parcial e a ultima linha de defesa. Sob uma chamada
    -- concorrente fora deste RPC, devolvemos o protocolo canonico.
    select request_row.*
      into v_existing
    from public.data_subject_requests request_row
    where request_row.user_id = v_uid
      and request_row.request_kind = 'account_erasure'
      and request_row.status in (
        'received',
        'processing',
        'ready',
        'pending_confirmation',
        'failed',
        'partial_failure'
      )
    order by request_row.created_at asc, request_row.id asc
    limit 1;
    if found then
      return jsonb_build_object(
        'request',
          to_jsonb(v_existing)
            - 'user_id'
            - 'subject_hash'
            - 'idempotency_key',
        'reused_existing', true,
        'reuse_reason', 'unique_open_account_erasure'
      );
    end if;
    raise;
end;
$$;

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

revoke all on function kc_private.kc_create_data_subject_request_v2(text, text, text, text)
  from public, anon, authenticated;
grant execute on function kc_private.kc_create_data_subject_request_v2(text, text, text, text)
  to authenticated;
revoke all on function public.kc_create_data_subject_request_v2(text, text, text, text)
  from public, anon;
grant execute on function public.kc_create_data_subject_request_v2(text, text, text, text)
  to authenticated;

-- Versao aditiva do criador do formulario. Mantem o claim efemero do fluxo
-- legado e, para os tres direitos de privacidade, cria/reutiliza o DSR quando
-- a sessao ja e autenticada. Callers anonimos recebem apenas o Help e seguem
-- para a vinculacao administrativa verificada definida mais abaixo.
create or replace function kc_private.kc_create_help_request_with_notification_claim_v2(
  p_payload jsonb
)
returns table (
  out_id uuid,
  out_created_at timestamptz,
  out_notification_claim text,
  out_notification_claim_expires_at timestamptz,
  out_data_subject_request jsonb,
  out_protocol text,
  out_reused_existing boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_anonymous boolean :=
    coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true';
  v_expected_user_id text :=
    lower(trim(coalesce(p_payload ->> 'expected_user_id', '')));
  v_type text := lower(trim(coalesce(p_payload ->> 'type', '')));
  v_topic text := lower(trim(coalesce(p_payload ->> 'topic', '')));
  v_subtopic text := lower(trim(coalesce(p_payload ->> 'subtopic', '')));
  v_request_kind text;
  v_account_email text;
  v_contact_email text :=
    lower(trim(coalesce(p_payload ->> 'contact_email', '')));
  v_created record;
  v_request public.data_subject_requests%rowtype;
  v_request_id uuid;
  v_protocol text;
  v_scope jsonb;
begin
  if v_expected_user_id <> ''
     and (
       v_uid is null
       or v_expected_user_id <> lower(v_uid::text)
     ) then
    raise exception using
      errcode = '42501',
      message = 'AUTH_ACCOUNT_CHANGED';
  end if;

  v_request_kind := case
    when v_type = 'account_access'
     and v_topic = 'onboarding_settings'
     and v_subtopic = 'account_deletion'
      then 'account_erasure'
    when v_type = 'account_access'
     and v_topic = 'onboarding_settings'
     and v_subtopic = 'account_data_copy'
      then 'data_access_copy'
    when v_type = 'account_access'
     and v_topic = 'onboarding_settings'
     and v_subtopic = 'account_data_portability'
      then 'data_portability'
    else null
  end;

  if v_request_kind is not null
     and v_uid is not null
     and not v_is_anonymous then
    if not kc_private.kc_is_current_session_active() then
      raise exception using errcode = '42501', message = 'AUTH_SESSION_NOT_ACTIVE';
    end if;
    perform kc_private.kc_lock_privacy_subject(v_uid);
  end if;

  select *
    into strict v_created
  from kc_private.kc_create_help_request_with_notification_claim(p_payload);

  out_id := v_created.out_id;
  out_created_at := v_created.out_created_at;
  out_notification_claim := v_created.out_notification_claim;
  out_notification_claim_expires_at :=
    v_created.out_notification_claim_expires_at;
  out_data_subject_request := null;
  out_protocol := null;
  out_reused_existing := false;

  if v_request_kind is null then
    return next;
    return;
  end if;
  if v_uid is null or v_is_anonymous then
    -- Um usuario anonimo do Supabase nao e uma identidade de titular apta a
    -- receber ownership do protocolo da conta.
    update public.help_requests help_row
    set user_id = null
    where help_row.id = out_id;
    return next;
    return;
  end if;

  select lower(trim(user_row.email))
    into v_account_email
  from auth.users user_row
  where user_row.id = v_uid;
  if v_account_email is null
     or v_account_email = ''
     or v_contact_email <> v_account_email then
    raise exception using
      errcode = '23514',
      message = 'DSR_ACCOUNT_EMAIL_MISMATCH';
  end if;

  select request_row.*
    into v_request
  from public.data_subject_requests request_row
  where request_row.user_id = v_uid
    and request_row.request_kind = v_request_kind
    and request_row.status in (
      'received',
      'processing',
      'ready',
      'pending_confirmation',
      'failed',
      'partial_failure'
    )
  order by request_row.created_at asc, request_row.id asc
  limit 1
  for update;

  if found then
    out_reused_existing := true;
    if v_request.request_kind in ('data_access_copy', 'data_portability')
       and v_request.status in ('received', 'failed') then
      update public.data_subject_requests request_row
      set
        status = 'ready',
        ready_at = coalesce(request_row.ready_at, now()),
        expires_at = now() + interval '15 minutes'
      where request_row.id = v_request.id
      returning * into v_request;
      insert into public.data_subject_request_events (
        request_id,
        actor_user_id,
        status,
        event_type,
        public_message
      ) values (
        v_request.id,
        v_uid,
        'ready',
        'status_changed',
        'Exportacao pronta para download por tempo limitado.'
      );
    elsif v_request.request_kind in ('data_access_copy', 'data_portability')
          and v_request.status = 'ready'
          and coalesce(v_request.expires_at, '-infinity'::timestamptz) <= now()
    then
      update public.data_subject_requests request_row
      set
        ready_at = coalesce(request_row.ready_at, now()),
        expires_at = now() + interval '15 minutes'
      where request_row.id = v_request.id
      returning * into v_request;
    end if;
  else
    v_request_id := gen_random_uuid();
    v_protocol := 'KC-DSR-'
      || to_char(now() at time zone 'UTC', 'YYYYMMDD')
      || '-'
      || upper(substr(replace(v_request_id::text, '-', ''), 1, 16));
    v_scope := case
      when v_request_kind = 'account_erasure' then jsonb_build_array(
        'account',
        'profile',
        'authored_content',
        'interactions',
        'communications',
        'preferences',
        'consents',
        'storage_objects',
        'linked_identifiers'
      )
      else jsonb_build_array(
        'authentication',
        'profile',
        'authored_content',
        'interactions',
        'communications_authored',
        'preferences',
        'consents',
        'linked_activity',
        'support_requests',
        'account_operations',
        'media_manifest'
      )
    end;

    insert into public.data_subject_requests (
      id,
      protocol,
      user_id,
      help_request_id,
      subject_hash,
      request_kind,
      status,
      idempotency_key,
      requested_format,
      request_source,
      export_schema_version,
      scope,
      ready_at,
      expires_at
    ) values (
      v_request_id,
      v_protocol,
      v_uid,
      out_id,
      encode(extensions.gen_random_bytes(32), 'hex'),
      v_request_kind,
      case
        when v_request_kind in ('data_access_copy', 'data_portability')
          then 'ready'
        else 'received'
      end,
      'authenticated-help:' || replace(out_id::text, '-', ''),
      'json',
      'help',
      1,
      v_scope,
      case
        when v_request_kind in ('data_access_copy', 'data_portability')
          then now()
        else null
      end,
      case
        when v_request_kind in ('data_access_copy', 'data_portability')
          then now() + interval '15 minutes'
        else null
      end
    )
    returning * into v_request;

    insert into public.data_subject_request_events (
      request_id,
      actor_user_id,
      status,
      event_type,
      public_message
    ) values (
      v_request.id,
      v_uid,
      v_request.status,
      'created',
      case
        when v_request.request_kind in ('data_access_copy', 'data_portability')
          then 'Solicitacao recebida; exportacao pronta por tempo limitado.'
        else 'Solicitacao recebida e protocolada.'
      end
    );
  end if;

  update public.help_requests help_row
  set
    status = case
      when help_row.status = 'new' then 'in_progress'
      else help_row.status
    end,
    metadata = coalesce(help_row.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'request_kind', v_request.request_kind,
        'protocol', v_request.protocol,
        'data_subject_request_id', v_request.id,
        'data_subject_request_status', v_request.status,
        'requested_format', v_request.requested_format,
        'request_source', 'help',
        'export_schema_version', v_request.export_schema_version,
        'identity_source', 'authenticated_account',
        'reused_existing_data_subject_request', out_reused_existing
      )
  where help_row.id = out_id;

  out_data_subject_request :=
    to_jsonb(v_request)
      - 'user_id'
      - 'subject_hash'
      - 'idempotency_key';
  out_protocol := v_request.protocol;
  return next;
end;
$$;

create or replace function public.kc_create_help_request_with_notification_claim_v2(
  p_payload jsonb
)
returns table (
  out_id uuid,
  out_created_at timestamptz,
  out_notification_claim text,
  out_notification_claim_expires_at timestamptz,
  out_data_subject_request jsonb,
  out_protocol text,
  out_reused_existing boolean
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_create_help_request_with_notification_claim_v2($1);
$$;

revoke all on function
  kc_private.kc_create_help_request_with_notification_claim_v2(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  kc_private.kc_create_help_request_with_notification_claim_v2(jsonb)
  to anon, authenticated, service_role;
revoke all on function
  public.kc_create_help_request_with_notification_claim_v2(jsonb)
  from public;
grant execute on function
  public.kc_create_help_request_with_notification_claim_v2(jsonb)
  to anon, authenticated, service_role;

-- Bucket sem acesso direto por policies de usuario. Somente a service role das
-- Edge Functions grava/le; o titular recebe o conteudo depois de nova
-- verificacao de sessao e ownership.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'kino-data-exports',
  'kino-data-exports',
  false,
  16777216,
  array['application/json']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

drop policy if exists storage_data_exports_owner_select on storage.objects;
drop policy if exists storage_data_exports_owner_insert on storage.objects;
drop policy if exists storage_data_exports_owner_update on storage.objects;
drop policy if exists storage_data_exports_owner_delete on storage.objects;

create table kc_private.data_export_artifacts (
  id uuid primary key default gen_random_uuid(),
  artifact_ref text not null unique,
  request_id uuid not null unique
    references public.data_subject_requests(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  bucket_id text not null default 'kino-data-exports',
  object_path text,
  format text not null default 'json',
  status text not null default 'queued',
  row_version bigint not null default 1,
  claim_token_hash text,
  claimed_by uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  upload_authorized_at timestamptz,
  download_token_hash text,
  download_session_id uuid,
  download_reserved_at timestamptz,
  download_expires_at timestamptz,
  sha256 text,
  byte_size bigint,
  manifest jsonb not null default '{}'::jsonb,
  ready_at timestamptz,
  expires_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  last_error_code text,
  purge_reason text,
  purge_erasure_request_id uuid
    references public.account_erasure_requests(id) on delete set null,
  purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint data_export_artifacts_ref_check
    check (artifact_ref ~ '^KEA-[A-F0-9]{32}$'),
  constraint data_export_artifacts_bucket_check
    check (bucket_id = 'kino-data-exports'),
  constraint data_export_artifacts_path_check
    check (
      object_path is null
      or object_path ~ '^objects/[a-f0-9]{64}[.]json$'
    ),
  constraint data_export_artifacts_format_check
    check (format = 'json'),
  constraint data_export_artifacts_status_check
    check (status in (
      'queued',
      'claimed',
      'ready',
      'download_reserved',
      'delivered',
      'failed',
      'expired',
      'purging',
      'purged'
    )),
  constraint data_export_artifacts_version_check
    check (row_version > 0),
  constraint data_export_artifacts_claim_hash_check
    check (claim_token_hash is null or claim_token_hash ~ '^[a-f0-9]{64}$'),
  constraint data_export_artifacts_download_hash_check
    check (download_token_hash is null or download_token_hash ~ '^[a-f0-9]{64}$'),
  constraint data_export_artifacts_sha_check
    check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  constraint data_export_artifacts_size_check
    check (byte_size is null or byte_size between 1 and 16777216),
  constraint data_export_artifacts_manifest_check
    check (jsonb_typeof(manifest) = 'object'),
  constraint data_export_artifacts_error_check
    check (
      last_error_code is null
      or last_error_code ~ '^[A-Z][A-Z0-9_]{2,63}$'
    ),
  constraint data_export_artifacts_purge_reason_check
    check (
      purge_reason is null
      or purge_reason in ('manual', 'retention', 'account_erasure')
    ),
  constraint data_export_artifacts_erasure_purge_check
    check (
      purge_erasure_request_id is null
      or purge_reason = 'account_erasure'
    )
);

comment on table kc_private.data_export_artifacts is
  'Metadados privados de suplementos LGPD. Nomes de objeto sao opacos; tokens brutos nunca sao persistidos.';
comment on column kc_private.data_export_artifacts.manifest is
  'Manifesto estritamente operacional e sem PII: contagens, versao, hash e resultados codificados.';

create index data_export_artifacts_queue_idx
  on kc_private.data_export_artifacts (status, created_at asc);
create index data_export_artifacts_expiry_idx
  on kc_private.data_export_artifacts (expires_at)
  where status in ('ready', 'download_reserved');

create table kc_private.data_export_processor_tasks (
  artifact_id uuid not null
    references kc_private.data_export_artifacts(id) on delete cascade,
  processor text not null,
  treatment text not null,
  status text not null,
  evidence_hash text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (artifact_id, processor),
  constraint data_export_processor_tasks_processor_check
    check (processor ~ '^[a-z0-9][a-z0-9_]{2,79}$'),
  constraint data_export_processor_tasks_treatment_check
    check (treatment ~ '^[a-z0-9][a-z0-9_]{2,119}$'),
  constraint data_export_processor_tasks_status_check
    check (status in (
      'automated',
      'manual_follow_up',
      'not_configured',
      'not_account_linked',
      'sanitized_disclosure',
      'no_account_data'
    )),
  constraint data_export_processor_tasks_evidence_check
    check (
      (
        status in ('sanitized_disclosure', 'no_account_data')
        and coalesce(evidence_hash ~ '^[a-f0-9]{64}$', false)
        and resolved_at is not null
      )
      or (
        status not in ('sanitized_disclosure', 'no_account_data')
        and evidence_hash is null
      )
    )
);

comment on table kc_private.data_export_processor_tasks is
  'Matriz operacional compartilhavel por artefato. Cada linha precisa virar disclosure sanitizado no arquivo; manual_follow_up bloqueia finalize.';

create table kc_private.data_export_media_refs (
  artifact_id uuid not null
    references kc_private.data_export_artifacts(id) on delete cascade,
  media_ref text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  bucket_id text not null,
  object_path text not null,
  created_at timestamptz not null default now(),
  primary key (artifact_id, media_ref),
  unique (artifact_id, bucket_id, object_path),
  constraint data_export_media_refs_ref_check
    check (media_ref ~ '^KEM-[A-F0-9]{32}$'),
  constraint data_export_media_refs_bucket_check
    check (bucket_id in ('kino-chat-media', 'kino-media')),
  constraint data_export_media_refs_path_check
    check (
      object_path !~ '(^|/)[.][.](/|$)'
      and object_path ~ '^chat-media/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,255}$'
    )
);

comment on table kc_private.data_export_media_refs is
  'Mapa privado entre referencias opacas do suplemento e objetos de chat pertencentes ao titular. Nunca e exposto sem reserva de download valida.';

create table kc_private.data_export_ticket_identity_links (
  help_request_id uuid primary key
    references public.help_requests(id) on delete cascade,
  request_id uuid not null unique
    references public.data_subject_requests(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  request_kind text not null,
  verification_channel text not null,
  attestation_hash text not null,
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint data_export_ticket_identity_links_kind_check
    check (request_kind in ('data_access_copy', 'data_portability')),
  constraint data_export_ticket_identity_links_channel_check
    check (verification_channel in (
      'verified_email_challenge',
      'support_mailbox_reply',
      'identity_document_review',
      'in_person_verification'
    )),
  constraint data_export_ticket_identity_links_hash_check
    check (attestation_hash ~ '^[a-f0-9]{64}$'),
  constraint data_export_ticket_identity_links_verified_at_check
    check (verified_at <= created_at + interval '5 minutes')
);

comment on table kc_private.data_export_ticket_identity_links is
  'Auditoria service-only do vinculo entre ticket anonimo e conta apos verificacao. Guarda somente hash da referencia, nunca a evidencia bruta.';

revoke all on table kc_private.data_export_artifacts
  from public, anon, authenticated, service_role;
revoke all on table kc_private.data_export_processor_tasks
  from public, anon, authenticated, service_role;
revoke all on table kc_private.data_export_media_refs
  from public, anon, authenticated, service_role;
revoke all on table kc_private.data_export_ticket_identity_links
  from public, anon, authenticated, service_role;

-- O cancelamento do titular tambem cobre o estado de complemento assistido.
-- O protocolo vira terminal sob o mesmo lock de privacidade e qualquer
-- artefato sem worker ativo entra na fila de expurgo sem perder o caminho
-- antes de a remocao no Storage ser confirmada.
create or replace function kc_private.kc_cancel_data_subject_request(
  p_protocol text
)
returns public.data_subject_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_protocol text := upper(trim(coalesce(p_protocol, '')));
  v_previous_status text;
  v_now timestamptz := now();
  v_result public.data_subject_requests%rowtype;
begin
  if v_uid is null
     or coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true'
     or not kc_private.kc_is_current_session_active() then
    raise exception using errcode = '42501', message = 'DSR_AUTH_REQUIRED';
  end if;
  if v_protocol !~ '^KC-DSR-[0-9]{8}-[A-F0-9]{16}$' then
    raise exception using
      errcode = 'P0002',
      message = 'DSR_NOT_FOUND_OR_NOT_CANCELLABLE';
  end if;

  perform kc_private.kc_lock_privacy_subject(v_uid);

  select request_row.*
    into v_result
  from public.data_subject_requests request_row
  where request_row.protocol = v_protocol
    and request_row.user_id = v_uid
  for update;

  if not found
     or not (
       (
         v_result.request_kind in ('data_access_copy', 'data_portability')
         and v_result.status in (
           'received',
           'processing',
           'ready',
           'failed',
           'partial_failure'
         )
       )
       or (
         v_result.request_kind = 'account_erasure'
         and v_result.status in ('received', 'pending_confirmation')
       )
     ) then
    raise exception using
      errcode = 'P0002',
      message = 'DSR_NOT_FOUND_OR_NOT_CANCELLABLE';
  end if;

  v_previous_status := v_result.status;
  update public.data_subject_requests request_row
  set
    status = 'cancelled',
    cancelled_at = coalesce(request_row.cancelled_at, v_now)
  where request_row.id = v_result.id
  returning * into v_result;

  if v_result.request_kind in ('data_access_copy', 'data_portability') then
    update kc_private.data_export_artifacts artifact_row
    set
      status = 'purging',
      row_version = artifact_row.row_version + 1,
      claim_token_hash = null,
      claimed_by = null,
      claimed_at = null,
      claim_expires_at = null,
      upload_authorized_at = null,
      download_token_hash = null,
      download_session_id = null,
      download_reserved_at = null,
      download_expires_at = null,
      purge_reason = 'retention',
      purge_erasure_request_id = null,
      updated_at = v_now
    where artifact_row.request_id = v_result.id
      and artifact_row.status <> 'purged'
      and not (
        artifact_row.status = 'claimed'
        and artifact_row.claim_expires_at > v_now
      );
  end if;

  if v_result.request_kind = 'account_erasure'
     and v_previous_status = 'pending_confirmation' then
    update public.help_requests help_row
    set
      status = 'in_progress',
      priority = case
        when help_row.priority in ('low', 'normal') then 'high'
        else help_row.priority
      end,
      metadata = coalesce(help_row.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'data_subject_request_status', 'cancelled',
          'cancellation_requested_at', v_now,
          'reversible_restore_required', true
        )
    where help_row.id = v_result.help_request_id;
  else
    update public.help_requests help_row
    set
      status = 'archived',
      metadata = coalesce(help_row.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'data_subject_request_status', 'cancelled',
          'cancelled_at', v_now,
          'reversible_restore_required', false,
          'export_artifact_purge_queued',
            v_result.request_kind in ('data_access_copy', 'data_portability')
        )
    where help_row.id = v_result.help_request_id;
  end if;

  insert into public.data_subject_request_events (
    request_id,
    actor_user_id,
    status,
    event_type,
    public_message
  ) values (
    v_result.id,
    v_uid,
    'cancelled',
    'cancelled',
    case
      when v_result.request_kind = 'account_erasure'
       and v_previous_status = 'pending_confirmation'
        then 'Cancelamento registrado; a restauracao reversivel segue em atendimento.'
      else 'Solicitacao cancelada pelo titular antes da conclusao.'
    end
  );

  return v_result;
end;
$$;

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
        and request_row.request_kind in ('data_access_copy', 'data_portability')
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

create or replace function kc_private.kc_data_export_artifact_shape(
  p_artifact kc_private.data_export_artifacts
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'artifact_ref', p_artifact.artifact_ref,
    'status', p_artifact.status,
    'format', p_artifact.format,
    'version', p_artifact.row_version,
    'sha256', p_artifact.sha256,
    'byte_size', p_artifact.byte_size,
    'manifest', p_artifact.manifest,
    'ready_at', p_artifact.ready_at,
    'expires_at', p_artifact.expires_at,
    'download_available', (
      p_artifact.status = 'ready'
      and p_artifact.expires_at > now()
    ),
    'recovery_available', (
      p_artifact.status in ('ready', 'download_reserved', 'expired')
      and coalesce(p_artifact.expires_at, '-infinity'::timestamptz) <= now()
      and (
        p_artifact.status <> 'download_reserved'
        or coalesce(
          p_artifact.download_expires_at,
          '-infinity'::timestamptz
        ) <= now()
      )
    ),
    'delivered_at', p_artifact.delivered_at,
    'failed_at', p_artifact.failed_at,
    'last_error_code', p_artifact.last_error_code,
    'created_at', p_artifact.created_at,
    'updated_at', p_artifact.updated_at,
    'blocking_processor_count', (
      select count(*)
      from kc_private.data_export_processor_tasks task_row
      where task_row.artifact_id = p_artifact.id
        and task_row.status = 'manual_follow_up'
    ),
    'processors', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'processor', task_row.processor,
          'treatment', task_row.treatment,
          'status', task_row.status,
          'evidence_sha256', task_row.evidence_hash,
          'resolved_at', task_row.resolved_at
        )
        order by task_row.processor
      )
      from kc_private.data_export_processor_tasks task_row
      where task_row.artifact_id = p_artifact.id
    ), '[]'::jsonb)
  );
$$;

revoke all on function kc_private.kc_data_export_artifact_shape(kc_private.data_export_artifacts)
  from public, anon, authenticated, service_role;

create or replace function kc_private.kc_enqueue_data_export_artifact(
  p_request_id uuid,
  p_user_id uuid,
  p_processors jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.data_subject_requests%rowtype;
  v_artifact kc_private.data_export_artifacts%rowtype;
  v_processor jsonb;
  v_processor_name text;
  v_treatment text;
  v_status text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_request_id is null or p_user_id is null then
    raise exception using errcode = '22023', message = 'EXPORT_ARTIFACT_ARGUMENTS_REQUIRED';
  end if;
  if jsonb_typeof(coalesce(p_processors, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_processors, '[]'::jsonb)) > 32 then
    raise exception using errcode = '22023', message = 'EXPORT_PROCESSOR_MATRIX_INVALID';
  end if;

  perform kc_private.kc_lock_privacy_subject(p_user_id);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('data-export-artifact:' || p_request_id::text, 9173)
  );

  if not kc_private.kc_data_export_subject_is_eligible(
    p_request_id,
    p_user_id
  ) then
    raise exception using errcode = '23514', message = 'EXPORT_SUBJECT_NOT_ELIGIBLE';
  end if;

  select request_row.*
    into v_request
  from public.data_subject_requests request_row
  where request_row.id = p_request_id
    and request_row.user_id = p_user_id
    and request_row.request_kind in ('data_access_copy', 'data_portability')
    and request_row.status in ('ready', 'partial_failure')
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'EXPORT_REQUEST_NOT_ELIGIBLE';
  end if;

  select artifact_row.*
    into v_artifact
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.request_id = p_request_id
  for update;
  if found and v_artifact.status <> 'purged' then
    return kc_private.kc_data_export_artifact_shape(v_artifact);
  end if;

  if found then
    update kc_private.data_export_artifacts artifact_row
    set
      artifact_ref =
        'KEA-' || upper(encode(extensions.gen_random_bytes(16), 'hex')),
      owner_user_id = p_user_id,
      object_path =
        'objects/' || encode(extensions.gen_random_bytes(32), 'hex') || '.json',
      status = 'queued',
      row_version = artifact_row.row_version + 1,
      claim_token_hash = null,
      claimed_by = null,
      claimed_at = null,
      claim_expires_at = null,
      upload_authorized_at = null,
      download_token_hash = null,
      download_session_id = null,
      download_reserved_at = null,
      download_expires_at = null,
      sha256 = null,
      byte_size = null,
      manifest = '{}'::jsonb,
      ready_at = null,
      expires_at = null,
      delivered_at = null,
      failed_at = null,
      last_error_code = null,
      purge_reason = null,
      purge_erasure_request_id = null,
      purged_at = null,
      updated_at = now()
    where artifact_row.id = v_artifact.id
    returning * into v_artifact;
    delete from kc_private.data_export_processor_tasks task_row
    where task_row.artifact_id = v_artifact.id;
    delete from kc_private.data_export_media_refs media_row
    where media_row.artifact_id = v_artifact.id;
  else
    insert into kc_private.data_export_artifacts (
      artifact_ref,
      request_id,
      owner_user_id,
      object_path
    ) values (
      'KEA-' || upper(encode(extensions.gen_random_bytes(16), 'hex')),
      p_request_id,
      p_user_id,
      'objects/' || encode(extensions.gen_random_bytes(32), 'hex') || '.json'
    )
    returning * into v_artifact;
  end if;

  for v_processor in
    select value
    from jsonb_array_elements(coalesce(p_processors, '[]'::jsonb))
  loop
    if jsonb_typeof(v_processor) <> 'object' then
      raise exception using errcode = '22023', message = 'EXPORT_PROCESSOR_ENTRY_INVALID';
    end if;
    v_processor_name := lower(trim(coalesce(v_processor ->> 'processor', '')));
    v_treatment := lower(trim(coalesce(v_processor ->> 'treatment', '')));
    v_status := lower(trim(coalesce(v_processor ->> 'status', '')));
    if v_processor_name !~ '^[a-z0-9][a-z0-9_]{2,79}$'
       or v_treatment !~ '^[a-z0-9][a-z0-9_]{2,119}$'
       or v_status not in (
         'automated',
         'manual_follow_up',
         'not_configured',
         'not_account_linked'
       ) then
      raise exception using errcode = '22023', message = 'EXPORT_PROCESSOR_ENTRY_INVALID';
    end if;
    insert into kc_private.data_export_processor_tasks (
      artifact_id,
      processor,
      treatment,
      status
    ) values (
      v_artifact.id,
      v_processor_name,
      v_treatment,
      v_status
    )
    on conflict (artifact_id, processor) do nothing;
  end loop;

  update public.help_requests help_row
  set
    status = 'in_progress',
    priority = case
      when help_row.priority in ('low', 'normal') then 'high'
      else help_row.priority
    end,
    metadata = coalesce(help_row.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'data_subject_request_status', 'partial_failure',
        'manual_supplement_required', true,
        'export_artifact_ref', v_artifact.artifact_ref,
        'export_artifact_status', 'queued'
      )
  where help_row.id = v_request.help_request_id;

  return kc_private.kc_data_export_artifact_shape(v_artifact);
end;
$$;

create or replace function public.kc_enqueue_data_export_artifact(
  p_request_id uuid,
  p_user_id uuid,
  p_processors jsonb default '[]'::jsonb
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_enqueue_data_export_artifact($1, $2, $3);
$$;

create or replace function kc_private.kc_record_data_export_processor_evidence(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid,
  p_processor text,
  p_outcome text,
  p_evidence_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact kc_private.data_export_artifacts%rowtype;
  v_processor text := lower(trim(coalesce(p_processor, '')));
  v_outcome text := lower(trim(coalesce(p_outcome, '')));
  v_reference text := trim(coalesce(p_evidence_reference, ''));
  v_owner_user_id uuid;
  v_stored_outcome text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     or p_actor_id is null
     or not public.kc_is_admin(p_actor_id) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_artifact_ref !~ '^KEA-[A-F0-9]{32}$'
     or p_expected_version is null
     or v_processor !~ '^[a-z0-9][a-z0-9_]{2,79}$'
     or v_outcome not in (
       'supplied',
       'sanitized_disclosure',
       'no_account_data'
     )
     or char_length(v_reference) < 8
     or char_length(v_reference) > 500 then
    raise exception using errcode = '22023', message = 'EXPORT_PROCESSOR_EVIDENCE_INVALID';
  end if;

  select artifact_row.owner_user_id
    into v_owner_user_id
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref;
  if not found or v_owner_user_id is null then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  perform kc_private.kc_lock_privacy_subject(v_owner_user_id);

  select artifact_row.*
    into v_artifact
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  if v_artifact.row_version <> p_expected_version
     or v_artifact.status not in ('queued', 'failed') then
    raise exception using errcode = '40001', message = 'EXPORT_ARTIFACT_VERSION_CONFLICT';
  end if;
  if v_artifact.owner_user_id is distinct from v_owner_user_id
     or not kc_private.kc_data_export_subject_is_eligible(
       v_artifact.request_id,
       v_owner_user_id
     ) then
    raise exception using errcode = '23514', message = 'EXPORT_SUBJECT_NOT_ELIGIBLE';
  end if;

  v_stored_outcome := case
    when v_outcome in ('supplied', 'sanitized_disclosure')
      then 'sanitized_disclosure'
    else 'no_account_data'
  end;
  update kc_private.data_export_processor_tasks task_row
  set
    status = v_stored_outcome,
    evidence_hash = encode(
      extensions.digest(convert_to(v_reference, 'UTF8'), 'sha256'),
      'hex'
    ),
    resolved_by = p_actor_id,
    resolved_at = now(),
    updated_at = now()
  where task_row.artifact_id = v_artifact.id
    and task_row.processor = v_processor
    and task_row.status = 'manual_follow_up';
  if not found then
    raise exception using errcode = '23514', message = 'EXPORT_PROCESSOR_NOT_PENDING';
  end if;

  update kc_private.data_export_artifacts artifact_row
  set row_version = artifact_row.row_version + 1, updated_at = now()
  where artifact_row.id = v_artifact.id
  returning * into v_artifact;

  return kc_private.kc_data_export_artifact_shape(v_artifact);
end;
$$;

create or replace function public.kc_record_data_export_processor_evidence(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid,
  p_processor text,
  p_outcome text,
  p_evidence_reference text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_record_data_export_processor_evidence(
    $1, $2, $3, $4, $5, $6
  );
$$;

create or replace function kc_private.kc_claim_data_export_artifact(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid,
  p_lease_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact kc_private.data_export_artifacts%rowtype;
  v_token text;
  v_lease integer := coalesce(p_lease_seconds, 900);
  v_owner_user_id uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     or p_actor_id is null
     or not public.kc_is_admin(p_actor_id) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_artifact_ref !~ '^KEA-[A-F0-9]{32}$'
     or p_expected_version is null
     or v_lease < 60
     or v_lease > 1800 then
    raise exception using errcode = '22023', message = 'EXPORT_ARTIFACT_CLAIM_INVALID';
  end if;

  select artifact_row.owner_user_id
    into v_owner_user_id
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref;
  if not found or v_owner_user_id is null then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  perform kc_private.kc_lock_privacy_subject(v_owner_user_id);

  select artifact_row.*
    into v_artifact
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  if v_artifact.row_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'EXPORT_ARTIFACT_VERSION_CONFLICT';
  end if;
  if v_artifact.owner_user_id is distinct from v_owner_user_id
     or not kc_private.kc_data_export_subject_is_eligible(
       v_artifact.request_id,
       v_owner_user_id
     ) then
    raise exception using errcode = '23514', message = 'EXPORT_SUBJECT_NOT_ELIGIBLE';
  end if;
  if v_artifact.status not in ('queued', 'failed')
     and not (
       v_artifact.status = 'claimed'
       and v_artifact.claim_expires_at <= now()
     ) then
    raise exception using errcode = '23514', message = 'EXPORT_ARTIFACT_NOT_CLAIMABLE';
  end if;
  if exists (
    select 1
    from kc_private.data_export_processor_tasks task_row
    where task_row.artifact_id = v_artifact.id
      and task_row.status = 'manual_follow_up'
  ) then
    raise exception using errcode = '23514', message = 'EXPORT_PROCESSORS_PENDING';
  end if;
  if not exists (
    select 1
    from kc_private.data_export_processor_tasks task_row
    where task_row.artifact_id = v_artifact.id
      and task_row.processor = 'supabase_db_auth_storage'
      and task_row.status = 'automated'
  ) or exists (
    select 1
    from kc_private.data_export_processor_tasks task_row
    where task_row.artifact_id = v_artifact.id
      and task_row.status not in (
        'automated',
        'not_configured',
        'not_account_linked',
        'sanitized_disclosure',
        'no_account_data'
      )
  ) then
    raise exception using errcode = '23514', message = 'EXPORT_PROCESSOR_OUTCOMES_INVALID';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  delete from kc_private.data_export_media_refs media_row
  where media_row.artifact_id = v_artifact.id;
  update kc_private.data_export_artifacts artifact_row
  set
    status = 'claimed',
    row_version = artifact_row.row_version + 1,
    claim_token_hash = encode(
      extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
      'hex'
    ),
    claimed_by = p_actor_id,
    claimed_at = now(),
    claim_expires_at = now() + make_interval(secs => v_lease),
    upload_authorized_at = null,
    last_error_code = null,
    purge_reason = null,
    purge_erasure_request_id = null,
    updated_at = now()
  where artifact_row.id = v_artifact.id
  returning * into v_artifact;

  return kc_private.kc_data_export_artifact_shape(v_artifact)
    || jsonb_build_object(
      'claim_token', v_token,
      'object_path', v_artifact.object_path,
      'bucket_id', v_artifact.bucket_id
    );
end;
$$;

create or replace function public.kc_claim_data_export_artifact(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid,
  p_lease_seconds integer default 900
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_claim_data_export_artifact($1, $2, $3, $4);
$$;

create or replace function kc_private.kc_store_data_export_media_refs(
  p_artifact_ref text,
  p_expected_version bigint,
  p_claim_token text,
  p_media_refs jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact kc_private.data_export_artifacts%rowtype;
  v_owner_user_id uuid;
  v_entry jsonb;
  v_key text;
  v_media_ref text;
  v_object_path text;
  v_bucket_id text;
  v_count integer := 0;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_artifact_ref !~ '^KEA-[A-F0-9]{32}$'
     or p_expected_version is null
     or p_claim_token !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(coalesce(p_media_refs, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_media_refs) > 10000 then
    raise exception using errcode = '22023', message = 'EXPORT_MEDIA_REFS_INVALID';
  end if;

  select artifact_row.owner_user_id
    into v_owner_user_id
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref;
  if not found or v_owner_user_id is null then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  perform kc_private.kc_lock_privacy_subject(v_owner_user_id);

  select artifact_row.*
    into v_artifact
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  if v_artifact.owner_user_id is distinct from v_owner_user_id
     or not kc_private.kc_data_export_subject_is_eligible(
       v_artifact.request_id,
       v_owner_user_id
     ) then
    raise exception using errcode = '23514', message = 'EXPORT_SUBJECT_NOT_ELIGIBLE';
  end if;
  if v_artifact.row_version <> p_expected_version
     or v_artifact.status <> 'claimed'
     or v_artifact.claim_expires_at <= now()
     or v_artifact.claim_token_hash <> encode(
       extensions.digest(convert_to(p_claim_token, 'UTF8'), 'sha256'),
       'hex'
     ) then
    raise exception using errcode = '40001', message = 'EXPORT_ARTIFACT_CLAIM_CONFLICT';
  end if;

  delete from kc_private.data_export_media_refs media_row
  where media_row.artifact_id = v_artifact.id;

  for v_entry in
    select value
    from jsonb_array_elements(p_media_refs)
  loop
    if jsonb_typeof(v_entry) <> 'object' then
      raise exception using errcode = '22023', message = 'EXPORT_MEDIA_REF_INVALID';
    end if;
    for v_key in select jsonb_object_keys(v_entry)
    loop
      if v_key not in ('media_ref', 'object_path') then
        raise exception using errcode = '22023', message = 'EXPORT_MEDIA_REF_KEY_INVALID';
      end if;
    end loop;
    v_media_ref := upper(trim(coalesce(v_entry ->> 'media_ref', '')));
    v_object_path := trim(coalesce(v_entry ->> 'object_path', ''));
    if v_media_ref !~ '^KEM-[A-F0-9]{32}$'
       or char_length(v_object_path) > 2000
       or v_object_path ~ '(^|/)[.][.](/|$)'
       or v_object_path !~ '^chat-media/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,255}$'
       or split_part(v_object_path, '/', 3) <> v_owner_user_id::text then
      raise exception using errcode = '22023', message = 'EXPORT_MEDIA_REF_INVALID';
    end if;

    select object_row.bucket_id
      into v_bucket_id
    from storage.objects object_row
    where object_row.name = v_object_path
      and object_row.bucket_id in ('kino-chat-media', 'kino-media')
    order by
      case when object_row.bucket_id = 'kino-chat-media' then 0 else 1 end
    limit 1;
    if not found then
      raise exception using errcode = '23514', message = 'EXPORT_MEDIA_OBJECT_MISSING';
    end if;

    insert into kc_private.data_export_media_refs (
      artifact_id,
      media_ref,
      owner_user_id,
      bucket_id,
      object_path
    ) values (
      v_artifact.id,
      v_media_ref,
      v_owner_user_id,
      v_bucket_id,
      v_object_path
    );
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'artifact_ref', v_artifact.artifact_ref,
    'version', v_artifact.row_version,
    'media_ref_count', v_count
  );
end;
$$;

create or replace function public.kc_store_data_export_media_refs(
  p_artifact_ref text,
  p_expected_version bigint,
  p_claim_token text,
  p_media_refs jsonb
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_store_data_export_media_refs($1, $2, $3, $4);
$$;

-- A autorizacao e renovada imediatamente antes do upload HTTP. Enquanto essa
-- lease estiver ativa, o fluxo de exclusao nao pode apagar a metadata/caminho;
-- assim um worker nao consegue recriar um objeto depois do purge.
create or replace function kc_private.kc_authorize_data_export_artifact_upload(
  p_artifact_ref text,
  p_expected_version bigint,
  p_claim_token text,
  p_lease_seconds integer default 1800
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact kc_private.data_export_artifacts%rowtype;
  v_owner_user_id uuid;
  v_lease integer := coalesce(p_lease_seconds, 1800);
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_artifact_ref !~ '^KEA-[A-F0-9]{32}$'
     or p_expected_version is null
     or p_claim_token !~ '^[a-f0-9]{64}$'
     or v_lease < 300
     or v_lease > 1800 then
    raise exception using errcode = '22023', message = 'EXPORT_UPLOAD_AUTH_INVALID';
  end if;

  select artifact_row.owner_user_id
    into v_owner_user_id
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref;
  if not found or v_owner_user_id is null then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;

  perform kc_private.kc_lock_privacy_subject(v_owner_user_id);
  select artifact_row.*
    into v_artifact
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  if v_artifact.owner_user_id is distinct from v_owner_user_id
     or not kc_private.kc_data_export_subject_is_eligible(
       v_artifact.request_id,
       v_owner_user_id
     ) then
    raise exception using errcode = '23514', message = 'EXPORT_SUBJECT_NOT_ELIGIBLE';
  end if;
  if v_artifact.row_version <> p_expected_version
     or v_artifact.status <> 'claimed'
     or v_artifact.claim_expires_at <= now()
     or v_artifact.claim_token_hash <> encode(
       extensions.digest(convert_to(p_claim_token, 'UTF8'), 'sha256'),
       'hex'
     ) then
    raise exception using errcode = '40001', message = 'EXPORT_ARTIFACT_CLAIM_CONFLICT';
  end if;
  if v_artifact.bucket_id <> 'kino-data-exports'
     or v_artifact.object_path !~ '^objects/[a-f0-9]{64}[.]json$' then
    raise exception using errcode = '23514', message = 'EXPORT_UPLOAD_TARGET_INVALID';
  end if;

  update kc_private.data_export_artifacts artifact_row
  set
    upload_authorized_at = now(),
    claim_expires_at = greatest(
      artifact_row.claim_expires_at,
      now() + make_interval(secs => v_lease)
    ),
    updated_at = now()
  where artifact_row.id = v_artifact.id
  returning * into v_artifact;

  return jsonb_build_object(
    'ok', true,
    'artifact_ref', v_artifact.artifact_ref,
    'version', v_artifact.row_version,
    'bucket_id', v_artifact.bucket_id,
    'object_path', v_artifact.object_path,
    'upload_authorized_at', v_artifact.upload_authorized_at,
    'claim_expires_at', v_artifact.claim_expires_at
  );
end;
$$;

create or replace function public.kc_authorize_data_export_artifact_upload(
  p_artifact_ref text,
  p_expected_version bigint,
  p_claim_token text,
  p_lease_seconds integer default 1800
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_authorize_data_export_artifact_upload($1, $2, $3, $4);
$$;

create or replace function kc_private.kc_finalize_data_export_artifact(
  p_artifact_ref text,
  p_expected_version bigint,
  p_claim_token text,
  p_sha256 text,
  p_byte_size bigint,
  p_manifest jsonb,
  p_ttl_seconds integer default 604800
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact kc_private.data_export_artifacts%rowtype;
  v_ttl integer := coalesce(p_ttl_seconds, 604800);
  v_owner_user_id uuid;
  v_ready_expires_at timestamptz;
  v_manifest_key text;
  v_category_key text;
  v_category_value jsonb;
  v_processor_entry jsonb;
  v_processor_key text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_artifact_ref !~ '^KEA-[A-F0-9]{32}$'
     or p_expected_version is null
     or p_claim_token !~ '^[a-f0-9]{64}$'
     or lower(coalesce(p_sha256, '')) !~ '^[a-f0-9]{64}$'
     or p_byte_size is null
     or p_byte_size < 1
     or p_byte_size > 16777216
     or v_ttl < 3600
     or v_ttl > 604800
     or jsonb_typeof(coalesce(p_manifest, 'null'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'EXPORT_ARTIFACT_FINALIZE_INVALID';
  end if;

  for v_manifest_key in
    select jsonb_object_keys(p_manifest)
  loop
    if v_manifest_key not in (
      'schema_version',
      'category_counts',
      'category_count',
      'processor_outcomes',
      'media_ref_count',
      'signed_urls_embedded',
      'completeness'
    ) then
      raise exception using errcode = '22023', message = 'EXPORT_MANIFEST_KEY_INVALID';
    end if;
  end loop;
  if coalesce(p_manifest ->> 'completeness', '') <> 'complete' then
    raise exception using errcode = '23514', message = 'EXPORT_MANIFEST_NOT_COMPLETE';
  end if;
  if coalesce((p_manifest ->> 'signed_urls_embedded')::boolean, true) then
    raise exception using errcode = '23514', message = 'EXPORT_MANIFEST_SIGNED_URLS_FORBIDDEN';
  end if;
  if jsonb_typeof(coalesce(p_manifest -> 'category_counts', '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'EXPORT_MANIFEST_COUNTS_INVALID';
  end if;
  for v_category_key, v_category_value in
    select key, value
    from jsonb_each(coalesce(p_manifest -> 'category_counts', '{}'::jsonb))
  loop
    if v_category_key !~ '^[a-z0-9][a-z0-9_]{1,79}$'
       or jsonb_typeof(v_category_value) <> 'number'
       or (v_category_value #>> '{}')::numeric < 0 then
      raise exception using errcode = '22023', message = 'EXPORT_MANIFEST_COUNTS_INVALID';
    end if;
  end loop;
  if coalesce((p_manifest ->> 'category_count')::integer, -1)
       <> (
         select count(*)
         from jsonb_object_keys(p_manifest -> 'category_counts')
       )
     or coalesce((p_manifest ->> 'media_ref_count')::integer, -1) < 0
     or jsonb_typeof(coalesce(p_manifest -> 'processor_outcomes', 'null'::jsonb))
       <> 'array' then
    raise exception using errcode = '22023', message = 'EXPORT_MANIFEST_SHAPE_INVALID';
  end if;
  for v_processor_entry in
    select value
    from jsonb_array_elements(p_manifest -> 'processor_outcomes')
  loop
    if jsonb_typeof(v_processor_entry) <> 'object' then
      raise exception using errcode = '22023', message = 'EXPORT_PROCESSOR_OUTCOMES_INVALID';
    end if;
    for v_processor_key in select jsonb_object_keys(v_processor_entry)
    loop
      if v_processor_key not in (
        'processor',
        'treatment',
        'outcome',
        'evidence_sha256',
        'resolved_at'
      ) then
        raise exception using errcode = '22023', message = 'EXPORT_PROCESSOR_OUTCOME_KEY_INVALID';
      end if;
    end loop;
  end loop;

  select artifact_row.owner_user_id
    into v_owner_user_id
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref;
  if not found or v_owner_user_id is null then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  perform kc_private.kc_lock_privacy_subject(v_owner_user_id);

  select artifact_row.*
    into v_artifact
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  if v_artifact.owner_user_id is distinct from v_owner_user_id
     or not kc_private.kc_data_export_subject_is_eligible(
       v_artifact.request_id,
       v_owner_user_id
     ) then
    raise exception using errcode = '23514', message = 'EXPORT_SUBJECT_NOT_ELIGIBLE';
  end if;
  if v_artifact.row_version <> p_expected_version
     or v_artifact.status <> 'claimed'
     or v_artifact.claim_expires_at <= now()
     or v_artifact.claim_token_hash <> encode(
       extensions.digest(convert_to(p_claim_token, 'UTF8'), 'sha256'),
       'hex'
     ) then
    raise exception using errcode = '40001', message = 'EXPORT_ARTIFACT_CLAIM_CONFLICT';
  end if;
  if exists (
    select 1
    from kc_private.data_export_processor_tasks task_row
    where task_row.artifact_id = v_artifact.id
      and task_row.status = 'manual_follow_up'
  ) then
    raise exception using errcode = '23514', message = 'EXPORT_PROCESSORS_PENDING';
  end if;
  if (
    select count(*)
    from kc_private.data_export_processor_tasks task_row
    where task_row.artifact_id = v_artifact.id
  ) <> jsonb_array_length(p_manifest -> 'processor_outcomes')
  or (
    select count(distinct outcome_entry ->> 'processor')
    from jsonb_array_elements(p_manifest -> 'processor_outcomes') outcome_entry
  ) <> jsonb_array_length(p_manifest -> 'processor_outcomes')
  or exists (
    select 1
    from kc_private.data_export_processor_tasks task_row
    where task_row.artifact_id = v_artifact.id
      and not exists (
        select 1
        from jsonb_array_elements(
          p_manifest -> 'processor_outcomes'
        ) outcome_entry
        where outcome_entry ->> 'processor' = task_row.processor
          and outcome_entry ->> 'treatment' = task_row.treatment
          and outcome_entry ->> 'outcome' = case task_row.status
            when 'automated' then 'included_in_core_export'
            when 'sanitized_disclosure' then 'sanitized_disclosure'
            when 'no_account_data' then 'no_account_data'
            when 'not_configured' then 'not_configured'
            when 'not_account_linked' then 'not_account_linked'
            else 'invalid'
          end
          and coalesce(outcome_entry ->> 'evidence_sha256', '')
            = coalesce(task_row.evidence_hash, '')
          and (
            task_row.status not in ('sanitized_disclosure', 'no_account_data')
            or (
              outcome_entry ->> 'resolved_at' is not null
              and task_row.resolved_at is not null
            )
          )
      )
  ) then
    raise exception using errcode = '23514', message = 'EXPORT_PROCESSOR_OUTCOMES_INVALID';
  end if;
  if (
    select count(*)
    from kc_private.data_export_media_refs media_row
    where media_row.artifact_id = v_artifact.id
  ) <> (p_manifest ->> 'media_ref_count')::integer then
    raise exception using errcode = '23514', message = 'EXPORT_MEDIA_REF_COUNT_MISMATCH';
  end if;
  if not exists (
    select 1
    from storage.objects object_row
    where object_row.bucket_id = v_artifact.bucket_id
      and object_row.name = v_artifact.object_path
  ) then
    raise exception using errcode = '23514', message = 'EXPORT_ARTIFACT_OBJECT_MISSING';
  end if;

  v_ready_expires_at := now() + make_interval(secs => v_ttl);
  update kc_private.data_export_artifacts artifact_row
  set
    status = 'ready',
    row_version = artifact_row.row_version + 1,
    claim_token_hash = null,
    claim_expires_at = null,
    upload_authorized_at = null,
    sha256 = lower(p_sha256),
    byte_size = p_byte_size,
    manifest = jsonb_build_object(
      'schema_version', coalesce((p_manifest ->> 'schema_version')::integer, 1),
      'category_count', coalesce((p_manifest ->> 'category_count')::integer, 0),
      'category_counts', coalesce(p_manifest -> 'category_counts', '{}'::jsonb),
      'completeness', 'complete',
      'processor_outcomes', p_manifest -> 'processor_outcomes',
      'media_ref_count', (p_manifest ->> 'media_ref_count')::integer,
      'signed_urls_embedded', false
    ),
    ready_at = now(),
    expires_at = v_ready_expires_at,
    failed_at = null,
    last_error_code = null,
    updated_at = now()
  where artifact_row.id = v_artifact.id
  returning * into v_artifact;

  update public.data_subject_requests request_row
  set
    ready_at = coalesce(request_row.ready_at, now()),
    expires_at = greatest(
      coalesce(request_row.expires_at, v_ready_expires_at),
      v_ready_expires_at
    )
  where request_row.id = v_artifact.request_id
    and request_row.user_id = v_owner_user_id
    and request_row.status in ('ready', 'partial_failure');
  if not found then
    raise exception using errcode = '23514', message = 'EXPORT_REQUEST_NOT_ELIGIBLE';
  end if;

  update public.help_requests help_row
  set
    status = 'in_progress',
    metadata = coalesce(help_row.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'manual_supplement_required', true,
        'export_artifact_ref', v_artifact.artifact_ref,
        'export_artifact_status', 'ready',
        'export_artifact_ready_at', v_artifact.ready_at,
        'export_artifact_expires_at', v_artifact.expires_at
      )
  from public.data_subject_requests request_row
  where request_row.id = v_artifact.request_id
    and help_row.id = request_row.help_request_id;

  return kc_private.kc_data_export_artifact_shape(v_artifact);
end;
$$;

create or replace function public.kc_finalize_data_export_artifact(
  p_artifact_ref text,
  p_expected_version bigint,
  p_claim_token text,
  p_sha256 text,
  p_byte_size bigint,
  p_manifest jsonb,
  p_ttl_seconds integer default 604800
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_finalize_data_export_artifact(
    $1, $2, $3, $4, $5, $6, $7
  );
$$;

create or replace function kc_private.kc_fail_data_export_artifact(
  p_artifact_ref text,
  p_expected_version bigint,
  p_claim_token text,
  p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact kc_private.data_export_artifacts%rowtype;
  v_error_code text := upper(trim(coalesce(p_error_code, '')));
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_artifact_ref !~ '^KEA-[A-F0-9]{32}$'
     or p_expected_version is null
     or p_claim_token !~ '^[a-f0-9]{64}$'
     or v_error_code !~ '^[A-Z][A-Z0-9_]{2,63}$' then
    raise exception using errcode = '22023', message = 'EXPORT_ARTIFACT_FAILURE_INVALID';
  end if;

  update kc_private.data_export_artifacts artifact_row
  set
    status = 'failed',
    row_version = artifact_row.row_version + 1,
    claim_token_hash = null,
    claim_expires_at = null,
    upload_authorized_at = null,
    failed_at = now(),
    last_error_code = v_error_code,
    updated_at = now()
  where artifact_row.artifact_ref = p_artifact_ref
    and artifact_row.row_version = p_expected_version
    and artifact_row.status = 'claimed'
    and artifact_row.claim_token_hash = encode(
      extensions.digest(convert_to(p_claim_token, 'UTF8'), 'sha256'),
      'hex'
    )
  returning * into v_artifact;
  if not found then
    raise exception using errcode = '40001', message = 'EXPORT_ARTIFACT_CLAIM_CONFLICT';
  end if;

  return kc_private.kc_data_export_artifact_shape(v_artifact);
end;
$$;

create or replace function public.kc_fail_data_export_artifact(
  p_artifact_ref text,
  p_expected_version bigint,
  p_claim_token text,
  p_error_code text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_fail_data_export_artifact($1, $2, $3, $4);
$$;

create or replace function kc_private.kc_reserve_data_export_artifact_download(
  p_artifact_ref text,
  p_expected_version bigint,
  p_user_id uuid,
  p_session_id uuid,
  p_ttl_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact kc_private.data_export_artifacts%rowtype;
  v_token text;
  v_ttl integer := coalesce(p_ttl_seconds, 120);
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_artifact_ref !~ '^KEA-[A-F0-9]{32}$'
     or p_expected_version is null
     or p_user_id is null
     or p_session_id is null
     or v_ttl < 30
     or v_ttl > 180 then
    raise exception using errcode = '22023', message = 'EXPORT_DOWNLOAD_RESERVATION_INVALID';
  end if;
  perform kc_private.kc_lock_privacy_subject(p_user_id);
  perform 1
  from auth.sessions session_row
  where session_row.id = p_session_id
    and session_row.user_id = p_user_id
  for key share;
  if not found then
    raise exception using errcode = '42501', message = 'SESSION_NOT_ACTIVE';
  end if;

  select artifact_row.*
    into v_artifact
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref
  for update;
  if not found or v_artifact.owner_user_id is distinct from p_user_id then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  if v_artifact.row_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'EXPORT_ARTIFACT_VERSION_CONFLICT';
  end if;
  if not kc_private.kc_data_export_subject_is_eligible(
    v_artifact.request_id,
    p_user_id
  ) then
    raise exception using errcode = '23514', message = 'EXPORT_SUBJECT_NOT_ELIGIBLE';
  end if;
  if v_artifact.status <> 'ready'
     or v_artifact.expires_at is null
     or v_artifact.expires_at <= now()
     or v_artifact.object_path is null
     or v_artifact.sha256 is null
     or v_artifact.byte_size is null
     or not exists (
       select 1
       from storage.objects object_row
       where object_row.bucket_id = v_artifact.bucket_id
         and object_row.name = v_artifact.object_path
     ) then
    raise exception using errcode = '23514', message = 'EXPORT_ARTIFACT_NOT_READY';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  update kc_private.data_export_artifacts artifact_row
  set
    status = 'download_reserved',
    row_version = artifact_row.row_version + 1,
    download_token_hash = encode(
      extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
      'hex'
    ),
    download_session_id = p_session_id,
    download_reserved_at = now(),
    -- A reserva iniciada antes da expiracao recebe toda a janela operacional.
    -- O retention worker respeita download_expires_at e somente purga depois
    -- que a reserva terminar, mesmo se expires_at vencer durante o streaming.
    download_expires_at = now() + make_interval(secs => v_ttl),
    updated_at = now()
  where artifact_row.id = v_artifact.id
  returning * into v_artifact;

  return jsonb_build_object(
    'artifact_ref', v_artifact.artifact_ref,
    'version', v_artifact.row_version,
    'bucket_id', v_artifact.bucket_id,
    'object_path', v_artifact.object_path,
    'format', v_artifact.format,
    'sha256', v_artifact.sha256,
    'byte_size', v_artifact.byte_size,
    'download_token', v_token,
    'download_expires_at', v_artifact.download_expires_at
  );
end;
$$;

create or replace function public.kc_reserve_data_export_artifact_download(
  p_artifact_ref text,
  p_expected_version bigint,
  p_user_id uuid,
  p_session_id uuid,
  p_ttl_seconds integer default 120
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_reserve_data_export_artifact_download(
    $1, $2, $3, $4, $5
  );
$$;

create or replace function kc_private.kc_read_data_export_media_refs_for_download(
  p_artifact_ref text,
  p_expected_version bigint,
  p_user_id uuid,
  p_session_id uuid,
  p_download_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact kc_private.data_export_artifacts%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_artifact_ref !~ '^KEA-[A-F0-9]{32}$'
     or p_expected_version is null
     or p_user_id is null
     or p_session_id is null
     or p_download_token !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'EXPORT_MEDIA_REF_READ_INVALID';
  end if;

  perform kc_private.kc_lock_privacy_subject(p_user_id);
  perform 1
  from auth.sessions session_row
  where session_row.id = p_session_id
    and session_row.user_id = p_user_id
  for key share;
  if not found then
    raise exception using errcode = '42501', message = 'SESSION_NOT_ACTIVE';
  end if;

  select artifact_row.*
    into v_artifact
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref
  for update;
  if not found or v_artifact.owner_user_id is distinct from p_user_id then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  if not kc_private.kc_data_export_subject_is_eligible(
    v_artifact.request_id,
    p_user_id
  ) then
    raise exception using errcode = '23514', message = 'EXPORT_SUBJECT_NOT_ELIGIBLE';
  end if;
  if v_artifact.row_version <> p_expected_version
     or v_artifact.status <> 'download_reserved'
     or v_artifact.download_session_id is distinct from p_session_id
     or v_artifact.download_expires_at <= now()
     or v_artifact.download_token_hash <> encode(
       extensions.digest(convert_to(p_download_token, 'UTF8'), 'sha256'),
       'hex'
     ) then
    raise exception using errcode = '40001', message = 'EXPORT_DOWNLOAD_CONSUME_CONFLICT';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'media_ref', media_row.media_ref,
        'bucket_id', media_row.bucket_id,
        'object_path', media_row.object_path
      )
      order by media_row.media_ref
    )
    from kc_private.data_export_media_refs media_row
    where media_row.artifact_id = v_artifact.id
      and media_row.owner_user_id = p_user_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.kc_read_data_export_media_refs_for_download(
  p_artifact_ref text,
  p_expected_version bigint,
  p_user_id uuid,
  p_session_id uuid,
  p_download_token text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_read_data_export_media_refs_for_download(
    $1, $2, $3, $4, $5
  );
$$;

create or replace function kc_private.kc_consume_data_export_artifact_download(
  p_artifact_ref text,
  p_expected_version bigint,
  p_user_id uuid,
  p_session_id uuid,
  p_download_token text,
  p_observed_sha256 text,
  p_observed_byte_size bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact kc_private.data_export_artifacts%rowtype;
  v_request public.data_subject_requests%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_artifact_ref !~ '^KEA-[A-F0-9]{32}$'
     or p_expected_version is null
     or p_user_id is null
     or p_session_id is null
     or p_download_token !~ '^[a-f0-9]{64}$'
     or lower(coalesce(p_observed_sha256, '')) !~ '^[a-f0-9]{64}$'
     or p_observed_byte_size is null then
    raise exception using errcode = '22023', message = 'EXPORT_DOWNLOAD_CONSUME_INVALID';
  end if;
  perform kc_private.kc_lock_privacy_subject(p_user_id);
  perform 1
  from auth.sessions session_row
  where session_row.id = p_session_id
    and session_row.user_id = p_user_id
  for key share;
  if not found then
    raise exception using errcode = '42501', message = 'SESSION_NOT_ACTIVE';
  end if;

  select artifact_row.*
    into v_artifact
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref
  for update;
  if not found or v_artifact.owner_user_id is distinct from p_user_id then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  if not kc_private.kc_data_export_subject_is_eligible(
    v_artifact.request_id,
    p_user_id
  ) then
    raise exception using errcode = '23514', message = 'EXPORT_SUBJECT_NOT_ELIGIBLE';
  end if;
  if v_artifact.row_version <> p_expected_version
     or v_artifact.status <> 'download_reserved'
     or v_artifact.download_session_id is distinct from p_session_id
     or v_artifact.download_expires_at <= now()
     or v_artifact.download_token_hash <> encode(
       extensions.digest(convert_to(p_download_token, 'UTF8'), 'sha256'),
       'hex'
     )
     or v_artifact.sha256 <> lower(p_observed_sha256)
     or v_artifact.byte_size <> p_observed_byte_size then
    raise exception using errcode = '40001', message = 'EXPORT_DOWNLOAD_CONSUME_CONFLICT';
  end if;

  select request_row.*
    into v_request
  from public.data_subject_requests request_row
  where request_row.id = v_artifact.request_id
    and request_row.user_id = p_user_id
  for update;
  if not found
     or v_request.status not in ('ready', 'partial_failure') then
    raise exception using errcode = '23514', message = 'EXPORT_REQUEST_NOT_DELIVERABLE';
  end if;

  update kc_private.data_export_artifacts artifact_row
  set
    status = 'delivered',
    row_version = artifact_row.row_version + 1,
    download_token_hash = null,
    download_session_id = null,
    delivered_at = now(),
    updated_at = now()
  where artifact_row.id = v_artifact.id
  returning * into v_artifact;

  update public.data_subject_requests request_row
  set
    status = 'completed',
    completed_at = coalesce(request_row.completed_at, now())
  where request_row.id = v_request.id;

  insert into public.data_subject_request_events (
    request_id,
    actor_user_id,
    status,
    event_type,
    public_message
  ) values (
    v_request.id,
    p_user_id,
    'completed',
    'downloaded',
    'Copia integral suplementar entregue ao titular autenticado.'
  );

  update public.help_requests help_row
  set
    status = 'archived',
    metadata = coalesce(help_row.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'data_subject_request_status', 'completed',
        'manual_supplement_required', false,
        'export_artifact_status', 'delivered',
        'export_artifact_delivered_at', v_artifact.delivered_at
      )
  where help_row.id = v_request.help_request_id;

  return kc_private.kc_data_export_artifact_shape(v_artifact);
end;
$$;

create or replace function public.kc_consume_data_export_artifact_download(
  p_artifact_ref text,
  p_expected_version bigint,
  p_user_id uuid,
  p_session_id uuid,
  p_download_token text,
  p_observed_sha256 text,
  p_observed_byte_size bigint
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_consume_data_export_artifact_download(
    $1, $2, $3, $4, $5, $6, $7
  );
$$;

-- Autoriza e transiciona uma entrega direta na mesma transacao. O KEY SHARE na
-- sessao impede que uma revogacao concorrente seja ignorada entre o ultimo
-- check da Edge e a mudanca para completed/partial_failure.
create or replace function kc_private.kc_transition_data_subject_request_for_active_session(
  p_request_id uuid,
  p_expected_status text,
  p_new_status text,
  p_user_id uuid,
  p_session_id uuid,
  p_event_type text,
  p_public_message text
)
returns public.data_subject_requests
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_request_id is null or p_user_id is null or p_session_id is null then
    raise exception using errcode = '22023', message = 'DSR_SESSION_TRANSITION_ARGUMENTS_REQUIRED';
  end if;

  perform 1
  from auth.sessions session_row
  where session_row.id = p_session_id
    and session_row.user_id = p_user_id
  for key share;
  if not found then
    raise exception using errcode = '42501', message = 'SESSION_NOT_ACTIVE';
  end if;

  perform 1
  from public.data_subject_requests request_row
  where request_row.id = p_request_id
    and request_row.user_id = p_user_id
    and request_row.request_kind in ('data_access_copy', 'data_portability')
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'DSR_NOT_FOUND';
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

create or replace function public.kc_transition_data_subject_request_for_active_session(
  p_request_id uuid,
  p_expected_status text,
  p_new_status text,
  p_user_id uuid,
  p_session_id uuid,
  p_event_type text,
  p_public_message text
)
returns public.data_subject_requests
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_transition_data_subject_request_for_active_session(
    $1, $2, $3, $4, $5, $6, $7
  );
$$;

create or replace function kc_private.kc_recover_expired_data_export_artifact(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid,
  p_ttl_seconds integer default 604800
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact kc_private.data_export_artifacts%rowtype;
  v_owner_user_id uuid;
  v_ttl integer := coalesce(p_ttl_seconds, 604800);
  v_expires_at timestamptz;
  v_storage_complete boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     or p_actor_id is null
     or not public.kc_is_admin(p_actor_id) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_artifact_ref !~ '^KEA-[A-F0-9]{32}$'
     or p_expected_version is null
     or v_ttl < 3600
     or v_ttl > 604800 then
    raise exception using errcode = '22023', message = 'EXPORT_ARTIFACT_RECOVERY_INVALID';
  end if;

  select artifact_row.owner_user_id
    into v_owner_user_id
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref;
  if not found or v_owner_user_id is null then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  perform kc_private.kc_lock_privacy_subject(v_owner_user_id);

  select artifact_row.*
    into v_artifact
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  if v_artifact.row_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'EXPORT_ARTIFACT_VERSION_CONFLICT';
  end if;
  if v_artifact.owner_user_id is distinct from v_owner_user_id
     or not kc_private.kc_data_export_subject_is_eligible(
       v_artifact.request_id,
       v_owner_user_id
     ) then
    raise exception using errcode = '23514', message = 'EXPORT_SUBJECT_NOT_ELIGIBLE';
  end if;

  if v_artifact.status = 'ready'
     and v_artifact.expires_at > now() then
    return kc_private.kc_data_export_artifact_shape(v_artifact)
      || jsonb_build_object(
        'reused_existing', true,
        'requires_rebuild', false
      );
  end if;
  if v_artifact.status not in ('ready', 'download_reserved', 'expired')
     or (
       v_artifact.status in ('ready', 'download_reserved')
       and coalesce(v_artifact.expires_at, '-infinity'::timestamptz) > now()
     )
     or (
       v_artifact.status = 'download_reserved'
       and coalesce(
         v_artifact.download_expires_at,
         '-infinity'::timestamptz
       ) > now()
     ) then
    raise exception using errcode = '23514', message = 'EXPORT_ARTIFACT_NOT_RECOVERABLE';
  end if;

  select
    v_artifact.object_path is not null
    and v_artifact.sha256 is not null
    and v_artifact.byte_size is not null
    and v_artifact.manifest ->> 'completeness' = 'complete'
    and exists (
      select 1
      from storage.objects object_row
      where object_row.bucket_id = v_artifact.bucket_id
        and object_row.name = v_artifact.object_path
    )
    and not exists (
      select 1
      from kc_private.data_export_media_refs media_row
      where media_row.artifact_id = v_artifact.id
        and not exists (
          select 1
          from storage.objects object_row
          where object_row.bucket_id = media_row.bucket_id
            and object_row.name = media_row.object_path
        )
    )
    into v_storage_complete;

  if not coalesce(v_storage_complete, false) then
    delete from kc_private.data_export_media_refs media_row
    where media_row.artifact_id = v_artifact.id;
    update kc_private.data_export_artifacts artifact_row
    set
      status = 'failed',
      row_version = artifact_row.row_version + 1,
      claim_token_hash = null,
      claimed_by = null,
      claimed_at = null,
      claim_expires_at = null,
      upload_authorized_at = null,
      download_token_hash = null,
      download_session_id = null,
      download_reserved_at = null,
      download_expires_at = null,
      sha256 = null,
      byte_size = null,
      manifest = '{}'::jsonb,
      ready_at = null,
      expires_at = null,
      failed_at = now(),
      last_error_code = 'EXPORT_RECOVERY_REBUILD_REQUIRED',
      updated_at = now()
    where artifact_row.id = v_artifact.id
    returning * into v_artifact;
    return kc_private.kc_data_export_artifact_shape(v_artifact)
      || jsonb_build_object(
        'reused_existing', false,
        'requires_rebuild', true
      );
  end if;

  v_expires_at := now() + make_interval(secs => v_ttl);
  update kc_private.data_export_artifacts artifact_row
  set
    status = 'ready',
    row_version = artifact_row.row_version + 1,
    download_token_hash = null,
    download_session_id = null,
    download_reserved_at = null,
    download_expires_at = null,
    expires_at = v_expires_at,
    last_error_code = null,
    updated_at = now()
  where artifact_row.id = v_artifact.id
  returning * into v_artifact;

  update public.data_subject_requests request_row
  set expires_at = greatest(
    coalesce(request_row.expires_at, v_expires_at),
    v_expires_at
  )
  where request_row.id = v_artifact.request_id
    and request_row.user_id = v_owner_user_id
    and request_row.status in ('ready', 'partial_failure');

  update public.help_requests help_row
  set metadata = coalesce(help_row.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'export_artifact_status', 'ready',
      'export_artifact_expires_at', v_artifact.expires_at,
      'export_artifact_recovered_at', now()
    )
  from public.data_subject_requests request_row
  where request_row.id = v_artifact.request_id
    and help_row.id = request_row.help_request_id;

  return kc_private.kc_data_export_artifact_shape(v_artifact)
    || jsonb_build_object(
      'reused_existing', true,
      'requires_rebuild', false
    );
end;
$$;

create or replace function public.kc_recover_expired_data_export_artifact(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid,
  p_ttl_seconds integer default 604800
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_recover_expired_data_export_artifact(
    $1, $2, $3, $4
  );
$$;

create or replace function kc_private.kc_purge_data_export_artifact(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact kc_private.data_export_artifacts%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_actor_id is not null and not public.kc_is_admin(p_actor_id) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_artifact_ref !~ '^KEA-[A-F0-9]{32}$'
     or p_expected_version is null then
    raise exception using errcode = '22023', message = 'EXPORT_ARTIFACT_PURGE_INVALID';
  end if;

  select artifact_row.*
    into v_artifact
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  if v_artifact.row_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'EXPORT_ARTIFACT_VERSION_CONFLICT';
  end if;
  if v_artifact.status <> 'purging' then
    raise exception using errcode = '23514', message = 'EXPORT_ARTIFACT_PURGE_NOT_CLAIMED';
  end if;
  if v_artifact.object_path is not null
     and exists (
       select 1
       from storage.objects object_row
       where object_row.bucket_id = v_artifact.bucket_id
         and object_row.name = v_artifact.object_path
     ) then
    raise exception using
      errcode = '23514',
      message = 'EXPORT_ARTIFACT_OBJECT_STILL_PRESENT';
  end if;

  delete from kc_private.data_export_media_refs media_row
  where media_row.artifact_id = v_artifact.id;
  delete from kc_private.data_export_processor_tasks task_row
  where task_row.artifact_id = v_artifact.id;

  update kc_private.data_export_artifacts artifact_row
  set
    status = 'purged',
    row_version = artifact_row.row_version + 1,
    owner_user_id = null,
    object_path = null,
    claim_token_hash = null,
    claimed_by = null,
    claimed_at = null,
    claim_expires_at = null,
    upload_authorized_at = null,
    download_token_hash = null,
    download_session_id = null,
    download_reserved_at = null,
    download_expires_at = null,
    sha256 = null,
    byte_size = null,
    manifest = '{}'::jsonb,
    last_error_code = null,
    purged_at = now(),
    updated_at = now()
  where artifact_row.id = v_artifact.id
  returning * into v_artifact;

  return kc_private.kc_data_export_artifact_shape(v_artifact);
end;
$$;

create or replace function kc_private.kc_claim_data_export_artifact_purge(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact kc_private.data_export_artifacts%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_actor_id is not null and not public.kc_is_admin(p_actor_id) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_artifact_ref !~ '^KEA-[A-F0-9]{32}$'
     or p_expected_version is null then
    raise exception using errcode = '22023', message = 'EXPORT_ARTIFACT_PURGE_INVALID';
  end if;

  select artifact_row.*
    into v_artifact
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  if v_artifact.row_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'EXPORT_ARTIFACT_VERSION_CONFLICT';
  end if;
  if v_artifact.status = 'purging' then
    if v_artifact.purge_reason = 'account_erasure' then
      raise exception using errcode = '23514', message = 'EXPORT_ARTIFACT_NOT_PURGEABLE';
    end if;
    return kc_private.kc_data_export_artifact_shape(v_artifact)
      || jsonb_build_object(
        'bucket_id', v_artifact.bucket_id,
        'object_path', v_artifact.object_path
      );
  end if;
  if v_artifact.status not in ('failed', 'expired', 'delivered')
     and not (
       v_artifact.status = 'ready'
       and v_artifact.expires_at <= now()
     )
     and not (
       v_artifact.status = 'download_reserved'
       and v_artifact.expires_at <= now()
       and coalesce(
         v_artifact.download_expires_at,
         '-infinity'::timestamptz
       ) <= now()
     ) then
    raise exception using errcode = '23514', message = 'EXPORT_ARTIFACT_NOT_PURGEABLE';
  end if;

  update kc_private.data_export_artifacts artifact_row
  set
    status = 'purging',
    row_version = artifact_row.row_version + 1,
    claim_token_hash = null,
    download_token_hash = null,
    download_session_id = null,
    purge_reason = case
      when p_actor_id is null then 'retention'
      else 'manual'
    end,
    purge_erasure_request_id = null,
    updated_at = now()
  where artifact_row.id = v_artifact.id
  returning * into v_artifact;

  return kc_private.kc_data_export_artifact_shape(v_artifact)
    || jsonb_build_object(
      'bucket_id', v_artifact.bucket_id,
      'object_path', v_artifact.object_path
    );
end;
$$;

create or replace function kc_private.kc_claim_expired_data_export_artifacts(
  p_limit integer default 50,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := coalesce(p_limit, 50);
  v_candidate kc_private.data_export_artifacts%rowtype;
  v_claims jsonb := '[]'::jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_actor_id is not null and not public.kc_is_admin(p_actor_id) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if v_limit < 1 or v_limit > 100 then
    raise exception using errcode = '22023', message = 'EXPORT_PURGE_BATCH_LIMIT_INVALID';
  end if;

  for v_candidate in
    select artifact_row.*
    from kc_private.data_export_artifacts artifact_row
    where (
      artifact_row.status = 'ready'
      and artifact_row.expires_at <= now()
    ) or (
      artifact_row.status = 'download_reserved'
      and artifact_row.expires_at <= now()
      and coalesce(
        artifact_row.download_expires_at,
        '-infinity'::timestamptz
      ) <= now()
    ) or (
      artifact_row.status = 'delivered'
      and artifact_row.delivered_at <= now() - interval '1 hour'
    ) or (
      artifact_row.status = 'failed'
      and artifact_row.failed_at <= now() - interval '24 hours'
    ) or (
      artifact_row.status = 'claimed'
      and artifact_row.claim_expires_at <= now()
      and exists (
        select 1
        from public.data_subject_requests request_row
        where request_row.id = artifact_row.request_id
          and request_row.status = 'cancelled'
      )
    ) or artifact_row.status = 'expired'
      or (
      artifact_row.status = 'purging'
        and artifact_row.purge_reason is distinct from 'account_erasure'
        and (
          artifact_row.updated_at <= now() - interval '15 minutes'
          or exists (
            select 1
            from public.data_subject_requests request_row
            where request_row.id = artifact_row.request_id
              and request_row.status = 'cancelled'
          )
        )
      )
    order by coalesce(
      artifact_row.expires_at,
      artifact_row.delivered_at,
      artifact_row.failed_at,
      artifact_row.updated_at
    ) asc, artifact_row.id asc
    for update skip locked
    limit v_limit
  loop
    update kc_private.data_export_artifacts artifact_row
    set
      status = 'purging',
      row_version = artifact_row.row_version + 1,
      claim_token_hash = null,
      claimed_by = null,
      claimed_at = null,
      claim_expires_at = null,
      upload_authorized_at = null,
      download_token_hash = null,
      download_session_id = null,
      download_reserved_at = null,
      download_expires_at = null,
      purge_reason = 'retention',
      purge_erasure_request_id = null,
      updated_at = now()
    where artifact_row.id = v_candidate.id
    returning * into v_candidate;

    v_claims := v_claims || jsonb_build_array(jsonb_build_object(
      'artifact_ref', v_candidate.artifact_ref,
      'version', v_candidate.row_version,
      'bucket_id', v_candidate.bucket_id,
      'object_path', v_candidate.object_path
    ));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'claimed_count', jsonb_array_length(v_claims),
    'artifacts', v_claims,
    'metadata_retained_until_storage_confirmation', true
  );
end;
$$;

create or replace function public.kc_claim_expired_data_export_artifacts(
  p_limit integer default 50,
  p_actor_id uuid default null
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_claim_expired_data_export_artifacts($1, $2);
$$;

create or replace function kc_private.kc_claim_data_export_artifacts_for_erasure(
  p_user_id uuid,
  p_erasure_request_id uuid,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := coalesce(p_limit, 100);
  v_artifact kc_private.data_export_artifacts%rowtype;
  v_claims jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_blocked_active_claim_count integer := 0;
  v_retry_after timestamptz;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null
     or p_erasure_request_id is null
     or v_limit < 1
     or v_limit > 250 then
    raise exception using errcode = '22023', message = 'EXPORT_ERASURE_CLAIM_INVALID';
  end if;

  perform kc_private.kc_lock_privacy_subject(p_user_id);
  if not exists (
    select 1
    from public.account_erasure_requests erasure_row
    left join public.data_subject_requests request_row
      on request_row.id = erasure_row.data_subject_request_id
    where erasure_row.id = p_erasure_request_id
      and erasure_row.user_id = p_user_id
      and erasure_row.status in (
        'confirmed',
        'reversible_applied',
        'partial_failure'
      )
      and (
        erasure_row.data_subject_request_id is null
        or (
          request_row.user_id = p_user_id
          and request_row.request_kind = 'account_erasure'
          and request_row.status in ('processing', 'partial_failure')
        )
      )
  ) then
    raise exception using errcode = '23514', message = 'EXPORT_ERASURE_NOT_ACTIVE';
  end if;

  select count(*)::integer
    into v_total
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.owner_user_id = p_user_id
    and artifact_row.status <> 'purged';

  select
    count(*)::integer,
    min(artifact_row.claim_expires_at)
    into v_blocked_active_claim_count, v_retry_after
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.owner_user_id = p_user_id
    and artifact_row.status = 'claimed'
    and artifact_row.claim_expires_at > now();

  for v_artifact in
    select artifact_row.*
    from kc_private.data_export_artifacts artifact_row
    where artifact_row.owner_user_id = p_user_id
      and artifact_row.status <> 'purged'
      and not (
        artifact_row.status = 'claimed'
        and artifact_row.claim_expires_at > now()
      )
    order by artifact_row.created_at asc, artifact_row.id asc
    for update
    limit v_limit
  loop
    update kc_private.data_export_artifacts artifact_row
    set
      status = 'purging',
      row_version = artifact_row.row_version + 1,
      claim_token_hash = null,
      claimed_by = null,
      claimed_at = null,
      claim_expires_at = null,
      upload_authorized_at = null,
      download_token_hash = null,
      download_session_id = null,
      download_reserved_at = null,
      download_expires_at = null,
      purge_reason = 'account_erasure',
      purge_erasure_request_id = p_erasure_request_id,
      updated_at = now()
    where artifact_row.id = v_artifact.id
    returning * into v_artifact;

    v_claims := v_claims || jsonb_build_array(jsonb_build_object(
      'artifact_ref', v_artifact.artifact_ref,
      'version', v_artifact.row_version,
      'bucket_id', v_artifact.bucket_id,
      'object_path', v_artifact.object_path
    ));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'erasure_request_id', p_erasure_request_id,
    'claimed_count', jsonb_array_length(v_claims),
    'has_more', v_total > jsonb_array_length(v_claims),
    'blocked_active_claim_count', v_blocked_active_claim_count,
    'retry_after', v_retry_after,
    'artifacts', v_claims,
    'metadata_retained_until_storage_confirmation', true
  );
end;
$$;

create or replace function public.kc_claim_data_export_artifacts_for_erasure(
  p_user_id uuid,
  p_erasure_request_id uuid,
  p_limit integer default 100
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_claim_data_export_artifacts_for_erasure($1, $2, $3);
$$;

create or replace function kc_private.kc_complete_data_export_artifact_erasure_purge(
  p_artifact_ref text,
  p_expected_version bigint,
  p_erasure_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact kc_private.data_export_artifacts%rowtype;
  v_owner_user_id uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_artifact_ref !~ '^KEA-[A-F0-9]{32}$'
     or p_expected_version is null
     or p_erasure_request_id is null then
    raise exception using errcode = '22023', message = 'EXPORT_ERASURE_COMPLETE_INVALID';
  end if;

  select artifact_row.owner_user_id
    into v_owner_user_id
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref;
  if not found or v_owner_user_id is null then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  perform kc_private.kc_lock_privacy_subject(v_owner_user_id);

  select artifact_row.*
    into v_artifact
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref
  for update;
  if not found
     or v_artifact.row_version <> p_expected_version
     or v_artifact.owner_user_id is distinct from v_owner_user_id
     or v_artifact.status <> 'purging'
     or v_artifact.purge_reason <> 'account_erasure'
     or v_artifact.purge_erasure_request_id is distinct from p_erasure_request_id then
    raise exception using errcode = '40001', message = 'EXPORT_ERASURE_PURGE_CONFLICT';
  end if;
  if v_artifact.object_path is not null
     and exists (
       select 1
       from storage.objects object_row
       where object_row.bucket_id = v_artifact.bucket_id
         and object_row.name = v_artifact.object_path
     ) then
    raise exception using
      errcode = '23514',
      message = 'EXPORT_ARTIFACT_OBJECT_STILL_PRESENT';
  end if;

  delete from kc_private.data_export_media_refs media_row
  where media_row.artifact_id = v_artifact.id;
  delete from kc_private.data_export_processor_tasks task_row
  where task_row.artifact_id = v_artifact.id;

  update kc_private.data_export_artifacts artifact_row
  set
    status = 'purged',
    row_version = artifact_row.row_version + 1,
    owner_user_id = null,
    object_path = null,
    claim_token_hash = null,
    claimed_by = null,
    claimed_at = null,
    claim_expires_at = null,
    upload_authorized_at = null,
    download_token_hash = null,
    download_session_id = null,
    download_reserved_at = null,
    download_expires_at = null,
    sha256 = null,
    byte_size = null,
    manifest = '{}'::jsonb,
    last_error_code = null,
    purged_at = now(),
    updated_at = now()
  where artifact_row.id = v_artifact.id
  returning * into v_artifact;

  return kc_private.kc_data_export_artifact_shape(v_artifact);
end;
$$;

create or replace function public.kc_complete_data_export_artifact_erasure_purge(
  p_artifact_ref text,
  p_expected_version bigint,
  p_erasure_request_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_complete_data_export_artifact_erasure_purge(
    $1, $2, $3
  );
$$;

create or replace function kc_private.kc_release_data_export_artifact_erasure_purge(
  p_artifact_ref text,
  p_expected_version bigint,
  p_erasure_request_id uuid,
  p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact kc_private.data_export_artifacts%rowtype;
  v_owner_user_id uuid;
  v_error_code text := upper(trim(coalesce(p_error_code, '')));
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_artifact_ref !~ '^KEA-[A-F0-9]{32}$'
     or p_expected_version is null
     or p_erasure_request_id is null
     or v_error_code !~ '^[A-Z][A-Z0-9_]{2,63}$' then
    raise exception using errcode = '22023', message = 'EXPORT_ERASURE_RELEASE_INVALID';
  end if;

  select artifact_row.owner_user_id
    into v_owner_user_id
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref;
  if not found or v_owner_user_id is null then
    raise exception using errcode = 'P0002', message = 'EXPORT_ARTIFACT_NOT_FOUND';
  end if;
  perform kc_private.kc_lock_privacy_subject(v_owner_user_id);

  select artifact_row.*
    into v_artifact
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.artifact_ref = p_artifact_ref
  for update;
  if not found
     or v_artifact.row_version <> p_expected_version
     or v_artifact.owner_user_id is distinct from v_owner_user_id
     or v_artifact.status <> 'purging'
     or v_artifact.purge_reason <> 'account_erasure'
     or v_artifact.purge_erasure_request_id is distinct from p_erasure_request_id then
    raise exception using errcode = '40001', message = 'EXPORT_ERASURE_PURGE_CONFLICT';
  end if;

  update kc_private.data_export_artifacts artifact_row
  set
    status = 'failed',
    row_version = artifact_row.row_version + 1,
    failed_at = now(),
    last_error_code = v_error_code,
    updated_at = now()
  where artifact_row.id = v_artifact.id
  returning * into v_artifact;

  return kc_private.kc_data_export_artifact_shape(v_artifact);
end;
$$;

create or replace function public.kc_release_data_export_artifact_erasure_purge(
  p_artifact_ref text,
  p_expected_version bigint,
  p_erasure_request_id uuid,
  p_error_code text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_release_data_export_artifact_erasure_purge(
    $1, $2, $3, $4
  );
$$;

create or replace function public.kc_claim_data_export_artifact_purge(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid default null
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_claim_data_export_artifact_purge($1, $2, $3);
$$;

create or replace function public.kc_purge_data_export_artifact(
  p_artifact_ref text,
  p_expected_version bigint,
  p_actor_id uuid default null
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_purge_data_export_artifact($1, $2, $3);
$$;

create or replace function kc_private.kc_read_data_export_artifact_for_owner(
  p_request_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact kc_private.data_export_artifacts%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  select artifact_row.*
    into v_artifact
  from kc_private.data_export_artifacts artifact_row
  where artifact_row.request_id = p_request_id
    and artifact_row.owner_user_id = p_user_id
  for update;
  if not found then
    return null;
  end if;
  if v_artifact.status = 'download_reserved'
     and v_artifact.download_expires_at <= now()
     and v_artifact.expires_at > now() then
    update kc_private.data_export_artifacts artifact_row
    set
      status = 'ready',
      row_version = artifact_row.row_version + 1,
      download_token_hash = null,
      download_session_id = null,
      download_reserved_at = null,
      download_expires_at = null,
      updated_at = now()
    where artifact_row.id = v_artifact.id
    returning * into v_artifact;
  end if;
  return kc_private.kc_data_export_artifact_shape(v_artifact);
end;
$$;

create or replace function public.kc_read_data_export_artifact_for_owner(
  p_request_id uuid,
  p_user_id uuid
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_read_data_export_artifact_for_owner($1, $2);
$$;

create or replace function kc_private.kc_admin_read_data_export_artifact(
  p_help_request_id uuid,
  p_artifact_ref text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.data_subject_requests%rowtype;
  v_artifact kc_private.data_export_artifacts%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     or p_actor_id is null
     or not public.kc_is_admin(p_actor_id) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_help_request_id is null
     and coalesce(p_artifact_ref, '') !~ '^KEA-[A-F0-9]{32}$' then
    raise exception using errcode = '22023', message = 'EXPORT_ARTIFACT_LOOKUP_INVALID';
  end if;

  select artifact_row.*
    into v_artifact
  from public.data_subject_requests request_row
  join kc_private.data_export_artifacts artifact_row
    on artifact_row.request_id = request_row.id
  where (
      p_help_request_id is null
      or request_row.help_request_id = p_help_request_id
      or exists (
        select 1
        from public.help_requests help_row
        where help_row.id = p_help_request_id
          and help_row.metadata ->> 'data_subject_request_id' =
            request_row.id::text
      )
    )
    and (
      p_artifact_ref is null
      or artifact_row.artifact_ref = p_artifact_ref
    )
  order by request_row.created_at desc
  limit 1;
  if not found then
    return null;
  end if;
  select request_row.*
    into strict v_request
  from public.data_subject_requests request_row
  where request_row.id = v_artifact.request_id;

  return jsonb_build_object(
    'artifact', kc_private.kc_data_export_artifact_shape(v_artifact),
    'internal', jsonb_build_object(
      'owner_user_id', v_artifact.owner_user_id,
      'object_path', v_artifact.object_path,
      'bucket_id', v_artifact.bucket_id
    ),
    'request', (
      to_jsonb(v_request)
        - 'user_id'
        - 'subject_hash'
        - 'idempotency_key'
    ),
    'owner_user_id', v_request.user_id
  );
end;
$$;

create or replace function public.kc_admin_read_data_export_artifact(
  p_help_request_id uuid,
  p_artifact_ref text,
  p_actor_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select kc_private.kc_admin_read_data_export_artifact($1, $2, $3);
$$;

-- Vincula um ticket anonimo de copia/portabilidade somente depois de uma
-- verificacao administrativa explicita. Todas as divergencias de ticket,
-- e-mail ou conta produzem o mesmo erro para nao oferecer um oracle de contas.
-- A referencia bruta nunca cruza esta RPC: a Edge envia apenas um hash
-- contextualizado e o vinculo + DSR + artefato nascem na mesma transacao.
create or replace function kc_private.kc_link_verified_help_request_to_data_export(
  p_help_request_id uuid,
  p_account_email text,
  p_request_kind text,
  p_actor_id uuid,
  p_verification_channel text,
  p_attestation_sha256 text,
  p_verified_at timestamptz,
  p_processors jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_account_email, '')));
  v_request_kind text := lower(trim(coalesce(p_request_kind, '')));
  v_channel text := lower(trim(coalesce(p_verification_channel, '')));
  v_attestation_hash text :=
    lower(trim(coalesce(p_attestation_sha256, '')));
  v_ticket public.help_requests%rowtype;
  v_request public.data_subject_requests%rowtype;
  v_link kc_private.data_export_ticket_identity_links%rowtype;
  v_owner_user_id uuid;
  v_account_count integer := 0;
  v_expected_kind text;
  v_request_id uuid;
  v_protocol text;
  v_scope jsonb;
  v_artifact jsonb;
  v_reused boolean := false;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     or p_actor_id is null
     or not public.kc_is_admin(p_actor_id) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_help_request_id is null
     or v_request_kind not in ('data_access_copy', 'data_portability')
     or v_channel not in (
       'verified_email_challenge',
       'support_mailbox_reply',
       'identity_document_review',
       'in_person_verification'
     )
     or v_attestation_hash !~ '^[a-f0-9]{64}$'
     or p_verified_at is null
     or p_verified_at < now() - interval '30 days'
     or p_verified_at > now() + interval '5 minutes'
     or jsonb_typeof(coalesce(p_processors, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_processors) < 1
     or jsonb_array_length(p_processors) > 32 then
    raise exception using errcode = '22023', message = 'EXPORT_TICKET_LINK_INPUT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'data-export-ticket-link:' || p_help_request_id::text,
      9173
    )
  );

  select help_row.*
    into v_ticket
  from public.help_requests help_row
  where help_row.id = p_help_request_id;
  if not found then
    raise exception using
      errcode = '23514',
      message = 'EXPORT_TICKET_IDENTITY_NOT_VERIFIED';
  end if;

  v_expected_kind := case
    when v_ticket.type = 'account_access'
     and v_ticket.topic = 'onboarding_settings'
     and v_ticket.subtopic = 'account_data_copy'
      then 'data_access_copy'
    when v_ticket.type = 'account_access'
     and v_ticket.topic = 'onboarding_settings'
     and v_ticket.subtopic = 'account_data_portability'
      then 'data_portability'
    else null
  end;
  if v_expected_kind is distinct from v_request_kind
     or (
       nullif(lower(trim(coalesce(v_ticket.metadata ->> 'request_kind', ''))), '')
         is not null
       and lower(trim(v_ticket.metadata ->> 'request_kind')) <> v_request_kind
     )
     or lower(trim(coalesce(v_ticket.contact_email, ''))) <> v_email
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception using
      errcode = '23514',
      message = 'EXPORT_TICKET_IDENTITY_NOT_VERIFIED';
  end if;

  select
    count(*)::integer,
    min(user_row.id::text)::uuid
    into v_account_count, v_owner_user_id
  from auth.users user_row
  where lower(trim(coalesce(user_row.email, ''))) = v_email;
  if v_account_count <> 1 or v_owner_user_id is null then
    raise exception using
      errcode = '23514',
      message = 'EXPORT_TICKET_IDENTITY_NOT_VERIFIED';
  end if;

  perform kc_private.kc_lock_privacy_subject(v_owner_user_id);
  select help_row.*
    into v_ticket
  from public.help_requests help_row
  where help_row.id = p_help_request_id
  for update;
  if not found
     or lower(trim(coalesce(v_ticket.contact_email, ''))) <> v_email
     or v_ticket.user_id is not null
        and v_ticket.user_id <> v_owner_user_id
     or v_ticket.type <> 'account_access'
     or v_ticket.topic <> 'onboarding_settings'
     or (
       v_request_kind = 'data_access_copy'
       and v_ticket.subtopic <> 'account_data_copy'
     )
     or (
       v_request_kind = 'data_portability'
       and v_ticket.subtopic <> 'account_data_portability'
     )
     or (
       nullif(lower(trim(coalesce(v_ticket.metadata ->> 'request_kind', ''))), '')
         is not null
       and lower(trim(v_ticket.metadata ->> 'request_kind')) <> v_request_kind
     ) then
    raise exception using
      errcode = '23514',
      message = 'EXPORT_TICKET_IDENTITY_NOT_VERIFIED';
  end if;

  select link_row.*
    into v_link
  from kc_private.data_export_ticket_identity_links link_row
  where link_row.help_request_id = p_help_request_id
  for update;
  if found then
    if v_link.owner_user_id is distinct from v_owner_user_id
       or v_link.request_kind <> v_request_kind
       or v_link.verification_channel <> v_channel
       or v_link.attestation_hash <> v_attestation_hash
       or v_link.verified_at <> p_verified_at then
      raise exception using
        errcode = '23514',
        message = 'EXPORT_TICKET_IDENTITY_NOT_VERIFIED';
    end if;
    select request_row.*
      into v_request
    from public.data_subject_requests request_row
    where request_row.id = v_link.request_id
      and request_row.user_id = v_owner_user_id
      and request_row.help_request_id = p_help_request_id
      and request_row.request_kind = v_request_kind;
    if not found then
      raise exception using
        errcode = '23514',
        message = 'EXPORT_TICKET_IDENTITY_NOT_VERIFIED';
    end if;
    select kc_private.kc_data_export_artifact_shape(artifact_row)
      into v_artifact
    from kc_private.data_export_artifacts artifact_row
    where artifact_row.request_id = v_request.id;
    if v_artifact is null then
      raise exception using
        errcode = '23514',
        message = 'EXPORT_TICKET_IDENTITY_NOT_VERIFIED';
    end if;
    v_reused := true;
  else
    if exists (
      select 1
      from public.data_subject_requests request_row
      where request_row.user_id = v_owner_user_id
        and request_row.request_kind = 'account_erasure'
        and request_row.status in (
          'received',
          'processing',
          'ready',
          'pending_confirmation',
          'failed',
          'partial_failure'
        )
    ) then
      raise exception using
        errcode = '23514',
        message = 'EXPORT_TICKET_IDENTITY_NOT_VERIFIED';
    end if;

    v_request_id := gen_random_uuid();
    v_protocol := 'KC-DSR-'
      || to_char(now() at time zone 'UTC', 'YYYYMMDD')
      || '-'
      || upper(substr(replace(v_request_id::text, '-', ''), 1, 16));
    v_scope := jsonb_build_array(
      'authentication',
      'profile',
      'authored_content',
      'interactions',
      'communications_authored',
      'preferences',
      'consents',
      'linked_activity',
      'support_requests',
      'account_operations',
      'media_manifest'
    );

    insert into public.data_subject_requests (
      id,
      protocol,
      user_id,
      help_request_id,
      subject_hash,
      request_kind,
      status,
      idempotency_key,
      requested_format,
      request_source,
      export_schema_version,
      scope
    ) values (
      v_request_id,
      v_protocol,
      v_owner_user_id,
      p_help_request_id,
      encode(extensions.gen_random_bytes(32), 'hex'),
      v_request_kind,
      'partial_failure',
      'verified-help:' || replace(p_help_request_id::text, '-', ''),
      'json',
      'help',
      1,
      v_scope
    )
    returning * into v_request;

    insert into public.data_subject_request_events (
      request_id,
      actor_user_id,
      status,
      event_type,
      public_message
    ) values (
      v_request.id,
      p_actor_id,
      'partial_failure',
      'created',
      'Identidade validada; o complemento integral esta em atendimento.'
    );

    insert into kc_private.data_export_ticket_identity_links (
      help_request_id,
      request_id,
      owner_user_id,
      actor_user_id,
      request_kind,
      verification_channel,
      attestation_hash,
      verified_at
    ) values (
      p_help_request_id,
      v_request.id,
      v_owner_user_id,
      p_actor_id,
      v_request_kind,
      v_channel,
      v_attestation_hash,
      p_verified_at
    );

    update public.help_requests help_row
    set
      user_id = v_owner_user_id,
      status = 'in_progress',
      priority = case
        when help_row.priority in ('low', 'normal') then 'high'
        else help_row.priority
      end,
      metadata = coalesce(help_row.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'request_kind', v_request_kind,
          'protocol', v_protocol,
          'data_subject_request_id', v_request.id,
          'data_subject_request_status', 'partial_failure',
          'manual_supplement_required', true,
          'identity_source', 'admin_verified_anonymous_ticket',
          'identity_verification_channel', v_channel,
          'identity_verified_at', p_verified_at,
          'identity_attestation_recorded', true
        )
    where help_row.id = p_help_request_id;

    v_artifact := kc_private.kc_enqueue_data_export_artifact(
      v_request.id,
      v_owner_user_id,
      p_processors
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'linked', true,
    'reused_existing', v_reused,
    'request',
      to_jsonb(v_request)
        - 'user_id'
        - 'subject_hash'
        - 'idempotency_key',
    'artifact', v_artifact
  );
end;
$$;

create or replace function public.kc_link_verified_help_request_to_data_export(
  p_help_request_id uuid,
  p_account_email text,
  p_request_kind text,
  p_actor_id uuid,
  p_verification_channel text,
  p_attestation_sha256 text,
  p_verified_at timestamptz,
  p_processors jsonb default '[]'::jsonb
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select kc_private.kc_link_verified_help_request_to_data_export(
    $1, $2, $3, $4, $5, $6, $7, $8
  );
$$;

-- Todas as mutacoes de artefato sao exclusivas da service role. A validacao
-- de admin/owner/sessao ocorre novamente dentro de cada RPC.
revoke all on function kc_private.kc_enqueue_data_export_artifact(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_enqueue_data_export_artifact(uuid, uuid, jsonb)
  to service_role;
revoke all on function public.kc_enqueue_data_export_artifact(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.kc_enqueue_data_export_artifact(uuid, uuid, jsonb)
  to service_role;

revoke all on function kc_private.kc_record_data_export_processor_evidence(text, bigint, uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_record_data_export_processor_evidence(text, bigint, uuid, text, text, text)
  to service_role;
revoke all on function public.kc_record_data_export_processor_evidence(text, bigint, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.kc_record_data_export_processor_evidence(text, bigint, uuid, text, text, text)
  to service_role;

revoke all on function kc_private.kc_claim_data_export_artifact(text, bigint, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_claim_data_export_artifact(text, bigint, uuid, integer)
  to service_role;
revoke all on function public.kc_claim_data_export_artifact(text, bigint, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.kc_claim_data_export_artifact(text, bigint, uuid, integer)
  to service_role;

revoke all on function kc_private.kc_store_data_export_media_refs(text, bigint, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_store_data_export_media_refs(text, bigint, text, jsonb)
  to service_role;
revoke all on function public.kc_store_data_export_media_refs(text, bigint, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.kc_store_data_export_media_refs(text, bigint, text, jsonb)
  to service_role;

revoke all on function kc_private.kc_authorize_data_export_artifact_upload(text, bigint, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_authorize_data_export_artifact_upload(text, bigint, text, integer)
  to service_role;
revoke all on function public.kc_authorize_data_export_artifact_upload(text, bigint, text, integer)
  from public, anon, authenticated;
grant execute on function public.kc_authorize_data_export_artifact_upload(text, bigint, text, integer)
  to service_role;

revoke all on function kc_private.kc_finalize_data_export_artifact(text, bigint, text, text, bigint, jsonb, integer)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_finalize_data_export_artifact(text, bigint, text, text, bigint, jsonb, integer)
  to service_role;
revoke all on function public.kc_finalize_data_export_artifact(text, bigint, text, text, bigint, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.kc_finalize_data_export_artifact(text, bigint, text, text, bigint, jsonb, integer)
  to service_role;

revoke all on function kc_private.kc_fail_data_export_artifact(text, bigint, text, text)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_fail_data_export_artifact(text, bigint, text, text)
  to service_role;
revoke all on function public.kc_fail_data_export_artifact(text, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.kc_fail_data_export_artifact(text, bigint, text, text)
  to service_role;

revoke all on function kc_private.kc_reserve_data_export_artifact_download(text, bigint, uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_reserve_data_export_artifact_download(text, bigint, uuid, uuid, integer)
  to service_role;
revoke all on function public.kc_reserve_data_export_artifact_download(text, bigint, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.kc_reserve_data_export_artifact_download(text, bigint, uuid, uuid, integer)
  to service_role;

revoke all on function kc_private.kc_read_data_export_media_refs_for_download(text, bigint, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_read_data_export_media_refs_for_download(text, bigint, uuid, uuid, text)
  to service_role;
revoke all on function public.kc_read_data_export_media_refs_for_download(text, bigint, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.kc_read_data_export_media_refs_for_download(text, bigint, uuid, uuid, text)
  to service_role;

revoke all on function kc_private.kc_consume_data_export_artifact_download(text, bigint, uuid, uuid, text, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_consume_data_export_artifact_download(text, bigint, uuid, uuid, text, text, bigint)
  to service_role;
revoke all on function public.kc_consume_data_export_artifact_download(text, bigint, uuid, uuid, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.kc_consume_data_export_artifact_download(text, bigint, uuid, uuid, text, text, bigint)
  to service_role;

revoke all on function kc_private.kc_transition_data_subject_request_for_active_session(uuid, text, text, uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_transition_data_subject_request_for_active_session(uuid, text, text, uuid, uuid, text, text)
  to service_role;
revoke all on function public.kc_transition_data_subject_request_for_active_session(uuid, text, text, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.kc_transition_data_subject_request_for_active_session(uuid, text, text, uuid, uuid, text, text)
  to service_role;

revoke all on function kc_private.kc_recover_expired_data_export_artifact(text, bigint, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_recover_expired_data_export_artifact(text, bigint, uuid, integer)
  to service_role;
revoke all on function public.kc_recover_expired_data_export_artifact(text, bigint, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.kc_recover_expired_data_export_artifact(text, bigint, uuid, integer)
  to service_role;

revoke all on function kc_private.kc_claim_data_export_artifact_purge(text, bigint, uuid)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_claim_data_export_artifact_purge(text, bigint, uuid)
  to service_role;
revoke all on function public.kc_claim_data_export_artifact_purge(text, bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.kc_claim_data_export_artifact_purge(text, bigint, uuid)
  to service_role;

revoke all on function kc_private.kc_claim_expired_data_export_artifacts(integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_claim_expired_data_export_artifacts(integer, uuid)
  to service_role;
revoke all on function public.kc_claim_expired_data_export_artifacts(integer, uuid)
  from public, anon, authenticated;
grant execute on function public.kc_claim_expired_data_export_artifacts(integer, uuid)
  to service_role;

revoke all on function kc_private.kc_claim_data_export_artifacts_for_erasure(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_claim_data_export_artifacts_for_erasure(uuid, uuid, integer)
  to service_role;
revoke all on function public.kc_claim_data_export_artifacts_for_erasure(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.kc_claim_data_export_artifacts_for_erasure(uuid, uuid, integer)
  to service_role;

revoke all on function kc_private.kc_complete_data_export_artifact_erasure_purge(text, bigint, uuid)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_complete_data_export_artifact_erasure_purge(text, bigint, uuid)
  to service_role;
revoke all on function public.kc_complete_data_export_artifact_erasure_purge(text, bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.kc_complete_data_export_artifact_erasure_purge(text, bigint, uuid)
  to service_role;

revoke all on function kc_private.kc_release_data_export_artifact_erasure_purge(text, bigint, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_release_data_export_artifact_erasure_purge(text, bigint, uuid, text)
  to service_role;
revoke all on function public.kc_release_data_export_artifact_erasure_purge(text, bigint, uuid, text)
  from public, anon, authenticated;
grant execute on function public.kc_release_data_export_artifact_erasure_purge(text, bigint, uuid, text)
  to service_role;

revoke all on function kc_private.kc_purge_data_export_artifact(text, bigint, uuid)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_purge_data_export_artifact(text, bigint, uuid)
  to service_role;
revoke all on function public.kc_purge_data_export_artifact(text, bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.kc_purge_data_export_artifact(text, bigint, uuid)
  to service_role;

revoke all on function kc_private.kc_read_data_export_artifact_for_owner(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_read_data_export_artifact_for_owner(uuid, uuid)
  to service_role;
revoke all on function public.kc_read_data_export_artifact_for_owner(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.kc_read_data_export_artifact_for_owner(uuid, uuid)
  to service_role;

revoke all on function kc_private.kc_admin_read_data_export_artifact(uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_admin_read_data_export_artifact(uuid, text, uuid)
  to service_role;
revoke all on function public.kc_admin_read_data_export_artifact(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.kc_admin_read_data_export_artifact(uuid, text, uuid)
  to service_role;

revoke all on function kc_private.kc_link_verified_help_request_to_data_export(uuid, text, text, uuid, text, text, timestamptz, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_link_verified_help_request_to_data_export(uuid, text, text, uuid, text, text, timestamptz, jsonb)
  to service_role;
revoke all on function public.kc_link_verified_help_request_to_data_export(uuid, text, text, uuid, text, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.kc_link_verified_help_request_to_data_export(uuid, text, text, uuid, text, text, timestamptz, jsonb)
  to service_role;

revoke all on function kc_private.kc_cancel_data_subject_request(text)
  from public, anon, service_role;
grant execute on function kc_private.kc_cancel_data_subject_request(text)
  to authenticated;

-- Reexecuta o instalador global depois de toda mudanca de schema. As tabelas
-- deste fluxo sao privadas, mas esta chamada tambem captura tabelas public
-- eventualmente criadas por migrations concorrentes na mesma janela.
select kc_private.kc_install_active_session_guards();

commit;

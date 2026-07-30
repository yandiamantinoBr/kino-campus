-- ============================================================================
-- KinoCampus - idempotencia transacional do formulario Help para direitos LGPD
-- ============================================================================
-- Escopo deliberadamente estreito:
--   * copia de dados, portabilidade e exclusao via account_access;
--   * Helps genericos e external_access continuam na RPC v2, que pode emitir
--     uma prova efemera de notificacao somente no retorno original;
--   * a chave opaca nunca e persistida em claro, metadata ou resposta;
--   * replay exige o mesmo estado Auth, caller scope, direito e payload
--     canonico, todos comparados sob advisory lock antes de qualquer insert.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists kc_private.help_privacy_submission_idempotency (
  key_hash text primary key,
  payload_fingerprint text,
  caller_scope_hash text not null,
  caller_user_id uuid
    references auth.users(id) on delete cascade,
  auth_state text not null,
  request_kind text not null,
  lifecycle_state text not null default 'committed',
  help_request_id uuid
    references public.help_requests(id) on delete cascade,
  response_created_at timestamptz,
  data_subject_request_id uuid
    references public.data_subject_requests(id) on delete cascade,
  response_protocol text,
  response_reused_existing boolean not null default false,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint help_privacy_submission_key_hash_check
    check (key_hash ~ '^[a-f0-9]{64}$'),
  constraint help_privacy_submission_payload_fingerprint_check
    check (
      payload_fingerprint is null
      or payload_fingerprint ~ '^[a-f0-9]{64}$'
    ),
  constraint help_privacy_submission_caller_scope_hash_check
    check (caller_scope_hash ~ '^[a-f0-9]{64}$'),
  constraint help_privacy_submission_auth_state_check
    check (auth_state in ('anonymous', 'authenticated')),
  constraint help_privacy_submission_lifecycle_state_check
    check (lifecycle_state in ('committed', 'retired')),
  constraint help_privacy_submission_response_shape_check
    check (
      (
        lifecycle_state = 'committed'
        and payload_fingerprint is not null
        and (
          auth_state <> 'authenticated'
          or caller_user_id is not null
        )
        and help_request_id is not null
        and response_created_at is not null
        and retired_at is null
        and (
          (
            auth_state = 'authenticated'
            and data_subject_request_id is not null
            and response_protocol is not null
          )
          or (
            auth_state = 'anonymous'
            and data_subject_request_id is null
            and response_protocol is null
          )
        )
      )
      or (
        lifecycle_state = 'retired'
        and payload_fingerprint is null
        and (
          auth_state <> 'authenticated'
          or caller_user_id is not null
        )
        and help_request_id is null
        and response_created_at is null
        and data_subject_request_id is null
        and response_protocol is null
        and response_reused_existing is false
        and retired_at is not null
      )
    ),
  constraint help_privacy_submission_response_protocol_check
    check (
      response_protocol is null
      or response_protocol ~ '^KC-DSR-[0-9]{8}-[A-F0-9]{16}$'
    ),
  constraint help_privacy_submission_request_kind_check
    check (
      request_kind in (
        'data_access_copy',
        'data_portability',
        'account_erasure'
      )
  )
);

-- Evolucao idempotente para ambientes locais/staging que tenham aplicado uma
-- iteracao anterior deste mesmo timestamp durante validacao pre-release.
alter table kc_private.help_privacy_submission_idempotency
  add column if not exists caller_user_id uuid,
  add column if not exists lifecycle_state text
    not null default 'committed',
  add column if not exists retired_at timestamptz;

alter table kc_private.help_privacy_submission_idempotency
  alter column payload_fingerprint drop not null,
  alter column help_request_id drop not null,
  alter column response_created_at drop not null;

update kc_private.help_privacy_submission_idempotency entry_row
set caller_user_id = coalesce(
  (
    select help_row.user_id
    from public.help_requests help_row
    where help_row.id = entry_row.help_request_id
  ),
  (
    select request_row.user_id
    from public.data_subject_requests request_row
    where request_row.id = entry_row.data_subject_request_id
  )
)
where entry_row.auth_state = 'authenticated'
  and entry_row.caller_user_id is null;

-- Iteracoes pre-release ja podiam ter mapas de Supabase Anonymous Auth sem o
-- UUID auxiliar. O caller_scope_hash e deterministico e permite reconstruir
-- apenas o vinculo exato com um usuario anonimo que ainda existe. O scope
-- anonymous:guest e deliberadamente preservado com caller_user_id nulo.
update kc_private.help_privacy_submission_idempotency entry_row
set caller_user_id = user_row.id
from auth.users user_row
where entry_row.auth_state = 'anonymous'
  and entry_row.caller_user_id is null
  and user_row.is_anonymous is true
  and entry_row.caller_scope_hash = pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        'anonymous:' || user_row.id::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

-- Se Auth e as linhas owner ja foram redigidos, o hash nao permite reconstruir
-- o UUID e nenhum caller legitimo pode recuperar esse mapa autenticado.
delete from kc_private.help_privacy_submission_idempotency entry_row
where entry_row.auth_state = 'authenticated'
  and entry_row.caller_user_id is null;

-- Um mapa anonymous sem guest hash e sem Auth correspondente e irrecuperavel.
-- Nao se infere nem se conserva um pseudo-owner a partir de qualquer outro
-- dado, enquanto o guest real continua valido sem FK de usuario.
delete from kc_private.help_privacy_submission_idempotency entry_row
where entry_row.auth_state = 'anonymous'
  and entry_row.caller_user_id is null
  and entry_row.caller_scope_hash <> pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to('anonymous:guest', 'UTF8'),
      'sha256'
    ),
    'hex'
  );

do $migration$
declare
  v_constraint record;
begin
  for v_constraint in
    select constraint_row.conname
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid =
      'kc_private.help_privacy_submission_idempotency'::regclass
      and constraint_row.contype = 'f'
      and exists (
        select 1
        from pg_catalog.unnest(constraint_row.conkey) key_column(attnum)
        join pg_catalog.pg_attribute attribute_row
          on attribute_row.attrelid = constraint_row.conrelid
          and attribute_row.attnum = key_column.attnum
        where attribute_row.attname in (
          'caller_user_id',
          'data_subject_request_id'
        )
      )
  loop
    execute pg_catalog.format(
      'alter table kc_private.help_privacy_submission_idempotency drop constraint %I',
      v_constraint.conname
    );
  end loop;
end;
$migration$;

alter table kc_private.help_privacy_submission_idempotency
  add constraint help_privacy_submission_caller_user_fkey
    foreign key (caller_user_id)
    references auth.users(id) on delete cascade,
  add constraint help_privacy_submission_dsr_fkey
    foreign key (data_subject_request_id)
    references public.data_subject_requests(id) on delete cascade;

alter table kc_private.help_privacy_submission_idempotency
  drop constraint if exists
    help_privacy_submission_payload_fingerprint_check,
  drop constraint if exists
    help_privacy_submission_lifecycle_state_check,
  drop constraint if exists
    help_privacy_submission_response_shape_check,
  drop constraint if exists
    help_privacy_submission_response_protocol_check;

alter table kc_private.help_privacy_submission_idempotency
  add constraint help_privacy_submission_payload_fingerprint_check
    check (
      payload_fingerprint is null
      or payload_fingerprint ~ '^[a-f0-9]{64}$'
    ),
  add constraint help_privacy_submission_lifecycle_state_check
    check (lifecycle_state in ('committed', 'retired')),
  add constraint help_privacy_submission_response_shape_check
    check (
      (
        lifecycle_state = 'committed'
        and payload_fingerprint is not null
        and (
          auth_state <> 'authenticated'
          or caller_user_id is not null
        )
        and help_request_id is not null
        and response_created_at is not null
        and retired_at is null
        and (
          (
            auth_state = 'authenticated'
            and data_subject_request_id is not null
            and response_protocol is not null
          )
          or (
            auth_state = 'anonymous'
            and data_subject_request_id is null
            and response_protocol is null
          )
        )
      )
      or (
        lifecycle_state = 'retired'
        and payload_fingerprint is null
        and (
          auth_state <> 'authenticated'
          or caller_user_id is not null
        )
        and help_request_id is null
        and response_created_at is null
        and data_subject_request_id is null
        and response_protocol is null
        and response_reused_existing is false
        and retired_at is not null
      )
    ),
  add constraint help_privacy_submission_response_protocol_check
    check (
      response_protocol is null
      or response_protocol ~ '^KC-DSR-[0-9]{8}-[A-F0-9]{16}$'
    );

drop index if exists
  kc_private.help_privacy_submission_idempotency_help_request_uidx;
create unique index
  help_privacy_submission_idempotency_help_request_uidx
  on kc_private.help_privacy_submission_idempotency (help_request_id)
  where help_request_id is not null;

create index if not exists
  help_privacy_submission_idempotency_retired_idx
  on kc_private.help_privacy_submission_idempotency (retired_at)
  where lifecycle_state = 'retired';

create index if not exists
  help_privacy_submission_idempotency_caller_user_idx
  on kc_private.help_privacy_submission_idempotency (caller_user_id)
  where caller_user_id is not null;

create index if not exists
  help_privacy_submission_idempotency_dsr_idx
  on kc_private.help_privacy_submission_idempotency (
    data_subject_request_id
  )
  where data_subject_request_id is not null;

alter table kc_private.help_privacy_submission_idempotency
  enable row level security;

revoke all on table kc_private.help_privacy_submission_idempotency
  from public, anon, authenticated, service_role;

comment on table kc_private.help_privacy_submission_idempotency is
  'Mapa privado para replay de Help LGPD: committed guarda hashes e IDs tecnicos de vinculo; retired e um tombstone temporario contra create atrasado. caller_user_id existe apenas para cascade exato no delete Auth; guest permanece null. A DSR e sempre reprojetada do estado atual, sem chave opaca, e-mail ou notification claim em claro.';

create table if not exists
  kc_private.help_privacy_recovery_rate_buckets (
    caller_scope_hash text not null,
    caller_user_id uuid not null
      references auth.users(id) on delete cascade,
    window_started_at timestamptz not null,
    attempts integer not null,
    updated_at timestamptz not null default pg_catalog.now(),
    primary key (caller_scope_hash, window_started_at),
    constraint help_privacy_recovery_rate_scope_check
      check (caller_scope_hash ~ '^[a-f0-9]{64}$'),
    constraint help_privacy_recovery_rate_attempts_check
      check (attempts between 1 and 25)
  );

create index if not exists
  help_privacy_recovery_rate_caller_user_idx
  on kc_private.help_privacy_recovery_rate_buckets (caller_user_id);
create index if not exists
  help_privacy_recovery_rate_window_idx
  on kc_private.help_privacy_recovery_rate_buckets (
    window_started_at
  );

alter table kc_private.help_privacy_recovery_rate_buckets
  enable row level security;
revoke all on table kc_private.help_privacy_recovery_rate_buckets
  from public, anon, authenticated, service_role;

comment on table kc_private.help_privacy_recovery_rate_buckets is
  'Contador privado por uid e hora para tombstones de recovery. Toda consulta nao resolvida consome a mesma tentativa, inclusive conflito com chave de outro scope, evitando oracle por efeito lateral.';

create table if not exists
  kc_private.help_privacy_guest_rate_buckets (
    window_started_at timestamptz primary key,
    attempts integer not null,
    updated_at timestamptz not null default pg_catalog.now(),
    constraint help_privacy_guest_rate_attempts_check
      check (attempts between 1 and 10000)
  );

alter table kc_private.help_privacy_guest_rate_buckets
  drop constraint if exists
    help_privacy_guest_rate_attempts_check,
  add constraint help_privacy_guest_rate_attempts_check
    check (attempts between 1 and 10000);

alter table kc_private.help_privacy_guest_rate_buckets
  enable row level security;
revoke all on table kc_private.help_privacy_guest_rate_buckets
  from public, anon, authenticated, service_role;

comment on table kc_private.help_privacy_guest_rate_buckets is
  'Circuit breaker emergencial e alertavel de 10000 novos Helps LGPD guest por hora, sem IP/header ou nova PII. O limite primario continua sendo 10/h por e-mail; este teto global nao identifica ator nem substitui CAPTCHA. Nao e usado por recovery.';

create or replace function
  kc_private.kc_cleanup_privacy_help_tombstones_v1(
    p_limit integer default 100
  )
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(
    greatest(coalesce(p_limit, 100), 1),
    1000
  );
  v_deleted integer := 0;
  v_rate_deleted integer := 0;
  v_guest_rate_deleted integer := 0;
begin
  with expired as (
    select entry_row.key_hash
    from kc_private.help_privacy_submission_idempotency entry_row
    where (
      entry_row.lifecycle_state = 'retired'
      and entry_row.retired_at <
        pg_catalog.now() - interval '90 days'
    )
    or (
      entry_row.lifecycle_state = 'committed'
      and entry_row.auth_state = 'anonymous'
      and exists (
        select 1
        from public.help_requests help_row
        where help_row.id = entry_row.help_request_id
          and (
            help_row.metadata ->> 'record_state' =
              'retention_purged'
            or help_row.metadata
              #>> '{lgpd_erasure,content_redacted}' = 'true'
          )
      )
    )
    order by coalesce(entry_row.retired_at, entry_row.created_at) asc
    limit v_limit
    for update skip locked
  )
  delete from kc_private.help_privacy_submission_idempotency entry_row
  using expired
  where entry_row.key_hash = expired.key_hash;
  get diagnostics v_deleted = row_count;
  with expired_rate_buckets as (
    select
      bucket_row.caller_scope_hash,
      bucket_row.window_started_at
    from kc_private.help_privacy_recovery_rate_buckets bucket_row
    where bucket_row.window_started_at <
      pg_catalog.now() - interval '2 days'
    order by
      bucket_row.window_started_at asc,
      bucket_row.caller_scope_hash asc
    limit v_limit
    for update skip locked
  )
  delete from kc_private.help_privacy_recovery_rate_buckets bucket_row
  using expired_rate_buckets expired_row
  where bucket_row.caller_scope_hash =
      expired_row.caller_scope_hash
    and bucket_row.window_started_at =
      expired_row.window_started_at;
  get diagnostics v_rate_deleted = row_count;
  with expired_guest_rate_buckets as (
    select bucket_row.window_started_at
    from kc_private.help_privacy_guest_rate_buckets bucket_row
    where bucket_row.window_started_at <
      pg_catalog.now() - interval '2 days'
    order by bucket_row.window_started_at asc
    limit v_limit
    for update skip locked
  )
  delete from kc_private.help_privacy_guest_rate_buckets bucket_row
  using expired_guest_rate_buckets expired_row
  where bucket_row.window_started_at =
    expired_row.window_started_at;
  get diagnostics v_guest_rate_deleted = row_count;
  return v_deleted + v_rate_deleted + v_guest_rate_deleted;
end;
$$;

revoke all on function
  kc_private.kc_cleanup_privacy_help_tombstones_v1(integer)
  from public, anon, authenticated, service_role;

comment on function
  kc_private.kc_cleanup_privacy_help_tombstones_v1(integer) is
  'Remove por lote tombstones retired com mais de 90 dias, mapas anonimos cujo Help foi redigido e buckets de recovery/guest com mais de 2 dias. Cada classe respeita p_limit; o retorno soma todas as linhas removidas.';

create or replace function
  kc_private.kc_drop_privacy_help_replay_after_redaction_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if new.metadata ->> 'record_state' = 'retention_purged'
     or new.metadata
       #>> '{lgpd_erasure,content_redacted}' = 'true' then
    delete from kc_private.help_privacy_submission_idempotency entry_row
    where entry_row.help_request_id = new.id;
  end if;
  return null;
end;
$$;

revoke all on function
  kc_private.kc_drop_privacy_help_replay_after_redaction_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists
  kc_drop_privacy_help_replay_after_redaction
  on public.help_requests;
create trigger kc_drop_privacy_help_replay_after_redaction
after update of metadata on public.help_requests
for each row
when (
  (
    new.metadata ->> 'record_state' = 'retention_purged'
    and old.metadata ->> 'record_state' is distinct from
      'retention_purged'
  )
  or (
    new.metadata #>> '{lgpd_erasure,content_redacted}' = 'true'
    and old.metadata #>> '{lgpd_erasure,content_redacted}'
      is distinct from 'true'
  )
)
execute function
  kc_private.kc_drop_privacy_help_replay_after_redaction_v1();

-- O purge diario preexistente continua com a mesma assinatura. O wrapper
-- acrescenta limpeza versionada do estado de idempotencia mesmo em dias sem
-- DSR elegivel, sem expor o cleanup privado aos papeis da API.
do $migration$
begin
  if pg_catalog.to_regprocedure(
    'kc_private.kc_purge_expired_data_subject_requests_privacy_base(integer)'
  ) is null then
    execute $ddl$
      alter function
        kc_private.kc_purge_expired_data_subject_requests(integer)
      rename to
        kc_purge_expired_data_subject_requests_privacy_base
    $ddl$;
  end if;
end;
$migration$;

revoke all on function
  kc_private.kc_purge_expired_data_subject_requests_privacy_base(integer)
  from public, anon, authenticated, service_role;

create or replace function
  kc_private.kc_purge_expired_data_subject_requests(
    p_limit integer default 500
  )
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_privacy_state_rows_purged integer;
begin
  v_result :=
    kc_private.kc_purge_expired_data_subject_requests_privacy_base(
      p_limit
    );
  v_privacy_state_rows_purged :=
    kc_private.kc_cleanup_privacy_help_tombstones_v1(
      least(
        greatest(coalesce(p_limit, 500), 1),
        1000
      )
    );
  return coalesce(v_result, '{}'::jsonb)
    || pg_catalog.jsonb_build_object(
      'purged_privacy_help_state_rows',
      v_privacy_state_rows_purged
    );
end;
$$;

revoke all on function
  kc_private.kc_purge_expired_data_subject_requests(integer)
  from public, anon, authenticated, service_role;

comment on function
  kc_private.kc_purge_expired_data_subject_requests(integer) is
  'Wrapper do purge DSR diario que preserva o contrato e limpa tombstones/mapas Help LGPD expirados em lote.';

create or replace function
  kc_private.kc_privacy_help_metadata_v1(
    p_metadata jsonb,
    p_request_kind text
  )
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_result jsonb;
begin
  if pg_catalog.jsonb_typeof(v_metadata) <> 'object'
     or p_request_kind not in (
       'data_access_copy',
       'data_portability',
       'account_erasure'
     ) then
    raise exception using
      errcode = '22023',
      message = 'HELP_IDEMPOTENCY_PAYLOAD_INVALID';
  end if;

  v_result := pg_catalog.jsonb_strip_nulls(
    pg_catalog.jsonb_build_object(
      'route', v_metadata -> 'route',
      'source', v_metadata -> 'source',
      'account_email', v_metadata -> 'account_email',
      'request_kind', pg_catalog.to_jsonb(p_request_kind)
    )
  );
  if p_request_kind = 'data_access_copy' then
    v_result := v_result || pg_catalog.jsonb_strip_nulls(
      pg_catalog.jsonb_build_object(
        'data_scope', v_metadata -> 'data_scope',
        'data_copy_format', v_metadata -> 'data_copy_format'
      )
    );
  elsif p_request_kind = 'data_portability' then
    v_result := v_result || pg_catalog.jsonb_strip_nulls(
      pg_catalog.jsonb_build_object(
        'data_scope', v_metadata -> 'data_scope',
        'portability_context', v_metadata -> 'portability_context'
      )
    );
  else
    v_result := v_result || pg_catalog.jsonb_strip_nulls(
      pg_catalog.jsonb_build_object(
        'export_before_erasure',
          v_metadata -> 'export_before_erasure'
      )
    );
  end if;
  return v_result;
end;
$$;

revoke all on function
  kc_private.kc_privacy_help_metadata_v1(jsonb, text)
  from public, anon, authenticated, service_role;

comment on function
  kc_private.kc_privacy_help_metadata_v1(jsonb, text) is
  'Projeta apenas metadata canonica do formulario LGPD por direito e rederiva request_kind; namespaces operacionais, lifecycle e campos extras do cliente sao descartados.';

create or replace function
  kc_private.kc_privacy_help_payload_fingerprint(
    p_payload jsonb
  )
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_type text;
  v_topic text;
  v_subtopic text;
  v_request_kind text;
  v_metadata jsonb;
  v_canonical jsonb;
begin
  if p_payload is null
     or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'HELP_IDEMPOTENCY_PAYLOAD_INVALID';
  end if;
  if pg_catalog.octet_length(p_payload::text) > 32768
     or pg_catalog.octet_length(
       coalesce(p_payload -> 'metadata', '{}'::jsonb)::text
     ) > 16384 then
    raise exception using
      errcode = '22023',
      message = 'HELP_IDEMPOTENCY_PAYLOAD_TOO_LARGE';
  end if;

  v_type := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_payload ->> 'type', ''))
  );
  v_topic := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_payload ->> 'topic', ''))
  );
  v_subtopic := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_payload ->> 'subtopic', ''))
  );
  v_request_kind := case
    when v_type = 'account_access'
     and v_topic = 'onboarding_settings'
     and v_subtopic = 'account_data_copy'
      then 'data_access_copy'
    when v_type = 'account_access'
     and v_topic = 'onboarding_settings'
     and v_subtopic = 'account_data_portability'
      then 'data_portability'
    when v_type = 'account_access'
     and v_topic = 'onboarding_settings'
     and v_subtopic = 'account_deletion'
      then 'account_erasure'
    else null
  end;
  if v_request_kind is null then
    raise exception using
      errcode = '22023',
      message = 'HELP_IDEMPOTENCY_SCOPE_INVALID';
  end if;

  v_metadata := coalesce(p_payload -> 'metadata', '{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_metadata) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'HELP_IDEMPOTENCY_PAYLOAD_INVALID';
  end if;

  v_metadata := kc_private.kc_privacy_help_metadata_v1(
    v_metadata,
    v_request_kind
  );

  v_canonical := pg_catalog.jsonb_build_object(
    'version', 1,
    'request_kind', v_request_kind,
    'type', v_type,
    'topic', v_topic,
    'subtopic', v_subtopic,
    'subject',
      pg_catalog.btrim(coalesce(p_payload ->> 'subject', '')),
    'message',
      pg_catalog.btrim(coalesce(p_payload ->> 'message', '')),
    'priority',
      pg_catalog.lower(
        pg_catalog.btrim(coalesce(p_payload ->> 'priority', 'normal'))
      ),
    'page_path',
      nullif(
        pg_catalog.btrim(coalesce(p_payload ->> 'page_path', '')),
        ''
      ),
    'contact_email',
      pg_catalog.lower(
        pg_catalog.btrim(coalesce(p_payload ->> 'contact_email', ''))
      ),
    'allow_contact',
      case
        when pg_catalog.lower(
          coalesce(p_payload ->> 'allow_contact', 'true')
        ) = 'false' then false
        else true
      end,
    'metadata', v_metadata
  );

  return pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(v_canonical::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
end;
$$;

revoke all on function
  kc_private.kc_privacy_help_payload_fingerprint(jsonb)
  from public, anon, authenticated, service_role;

comment on function
  kc_private.kc_privacy_help_payload_fingerprint(jsonb) is
  'Produz SHA-256 server-side do payload Help LGPD normalizado; nunca retorna nem persiste os campos pessoais usados como pre-imagem.';

create or replace function
  kc_private.kc_assert_current_anonymous_session_active()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_session_id text := coalesce(auth.jwt() ->> 'session_id', '');
begin
  if v_uid is null
     or pg_catalog.lower(
       coalesce(auth.jwt() ->> 'is_anonymous', 'false')
     ) <> 'true'
     or v_session_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using
      errcode = '42501',
      message = 'AUTH_SESSION_NOT_ACTIVE';
  end if;

  perform 1
  from auth.users user_row
  join auth.sessions session_row
    on session_row.user_id = user_row.id
  where user_row.id = v_uid
    and user_row.is_anonymous is true
    and user_row.deleted_at is null
    and session_row.id = v_session_id::uuid
    and (
      session_row.not_after is null
      or session_row.not_after > pg_catalog.clock_timestamp()
    )
  for share of user_row, session_row;
  if not found then
    raise exception using
      errcode = '42501',
      message = 'AUTH_SESSION_NOT_ACTIVE';
  end if;
end;
$$;

revoke all on function
  kc_private.kc_assert_current_anonymous_session_active()
  from public, anon, authenticated, service_role;

comment on function
  kc_private.kc_assert_current_anonymous_session_active() is
  'Valida e bloqueia auth.users/auth.sessions para um JWT Supabase anonimo; nao altera o helper global reservado a contas reais.';

create or replace function
  kc_private.kc_assert_current_authenticated_session_active()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_session_id text := coalesce(auth.jwt() ->> 'session_id', '');
begin
  if v_uid is null
     or pg_catalog.lower(
       coalesce(auth.jwt() ->> 'is_anonymous', 'false')
     ) = 'true'
     or v_session_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using
      errcode = '42501',
      message = 'AUTH_SESSION_NOT_ACTIVE';
  end if;

  perform 1
  from auth.users user_row
  join auth.sessions session_row
    on session_row.user_id = user_row.id
  where user_row.id = v_uid
    and coalesce(user_row.is_anonymous, false) is false
    and user_row.deleted_at is null
    and session_row.id = v_session_id::uuid
    and (
      session_row.not_after is null
      or session_row.not_after > pg_catalog.clock_timestamp()
    )
  for share of user_row, session_row;
  if not found then
    raise exception using
      errcode = '42501',
      message = 'AUTH_SESSION_NOT_ACTIVE';
  end if;
end;
$$;

revoke all on function
  kc_private.kc_assert_current_authenticated_session_active()
  from public, anon, authenticated, service_role;

comment on function
  kc_private.kc_assert_current_authenticated_session_active() is
  'Valida e mantem FOR SHARE em auth.users/auth.sessions para a conta real e a sessao exata do JWT durante create/recovery Help LGPD.';

-- Fecha o bypass legado: os tres direitos LGPD so podem entrar pela familia
-- idempotente. O worker anterior permanece privado para uso interno do v1.
do $migration$
begin
  if pg_catalog.to_regprocedure(
    'kc_private.kc_help_request_v2_20260729_idempotency_base(jsonb)'
  ) is null then
    execute $ddl$
      alter function
        kc_private.kc_create_help_request_with_notification_claim_v2(jsonb)
      rename to
        kc_help_request_v2_20260729_idempotency_base
    $ddl$;
  end if;
end;
$migration$;

revoke all on function
  kc_private.kc_help_request_v2_20260729_idempotency_base(jsonb)
  from public, anon, authenticated, service_role;

create or replace function
  kc_private.kc_create_help_request_with_notification_claim_v2(
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
volatile
security definer
set search_path = ''
as $$
declare
  v_type text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_payload ->> 'type', ''))
  );
  v_topic text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_payload ->> 'topic', ''))
  );
  v_subtopic text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_payload ->> 'subtopic', ''))
  );
begin
  if p_payload is null
     or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'HELP_IDEMPOTENCY_PAYLOAD_INVALID';
  end if;
  if v_type = 'account_access'
     and v_topic = 'onboarding_settings'
     and v_subtopic in (
       'account_data_copy',
       'account_data_portability',
       'account_deletion'
     ) then
    raise exception using
      errcode = '22023',
      message = 'HELP_PRIVACY_IDEMPOTENT_RPC_REQUIRED';
  end if;

  return query
  select *
  from
    kc_private.kc_help_request_v2_20260729_idempotency_base(
      p_payload
    );
end;
$$;

revoke all on function
  kc_private.kc_create_help_request_with_notification_claim_v2(jsonb)
  from public, anon, authenticated, service_role;

comment on function
  kc_private.kc_create_help_request_with_notification_claim_v2(jsonb) is
  'Compatibilidade para Help generico/external_access; rejeita copia, portabilidade e exclusao, que exigem kc_create_privacy_help_request_v1.';

-- Os wrappers publicos legados precisam continuar disponiveis para Help
-- generico e acesso externo, mas nenhum papel da API deve executar seus
-- workers privados diretamente. SECURITY DEFINER permite fechar essas ACLs e
-- centralizar a guarda das tres rotas LGPD antes de qualquer insert.
create or replace function
  kc_private.kc_is_privacy_help_route_v1(p_payload jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    pg_catalog.lower(
      pg_catalog.btrim(coalesce($1 ->> 'type', ''))
    ) = 'account_access'
    and pg_catalog.lower(
      pg_catalog.btrim(coalesce($1 ->> 'topic', ''))
    ) = 'onboarding_settings'
    and pg_catalog.lower(
      pg_catalog.btrim(coalesce($1 ->> 'subtopic', ''))
    ) in (
      'account_data_copy',
      'account_data_portability',
      'account_deletion'
    );
$$;

revoke all on function
  kc_private.kc_is_privacy_help_route_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  kc_private.kc_create_help_request(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  kc_private.kc_create_help_request_with_notification_claim(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.kc_create_help_request(
  p_payload jsonb
)
returns table (
  out_id uuid,
  out_created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if kc_private.kc_is_privacy_help_route_v1(p_payload) then
    raise exception using
      errcode = '22023',
      message = 'HELP_PRIVACY_IDEMPOTENT_RPC_REQUIRED';
  end if;
  return query
  select *
  from kc_private.kc_create_help_request(p_payload);
end;
$$;

create or replace function
  public.kc_create_help_request_with_notification_claim(
    p_payload jsonb
  )
returns table (
  out_id uuid,
  out_created_at timestamptz,
  out_notification_claim text,
  out_notification_claim_expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if kc_private.kc_is_privacy_help_route_v1(p_payload) then
    raise exception using
      errcode = '22023',
      message = 'HELP_PRIVACY_IDEMPOTENT_RPC_REQUIRED';
  end if;
  return query
  select *
  from
    kc_private.kc_create_help_request_with_notification_claim(
      p_payload
    );
end;
$$;

create or replace function
  public.kc_create_help_request_with_notification_claim_v2(
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
volatile
security definer
set search_path = ''
as $$
begin
  if kc_private.kc_is_privacy_help_route_v1(p_payload) then
    raise exception using
      errcode = '22023',
      message = 'HELP_PRIVACY_IDEMPOTENT_RPC_REQUIRED';
  end if;
  return query
  select *
  from
    kc_private.kc_create_help_request_with_notification_claim_v2(
      p_payload
    );
end;
$$;

revoke all on function public.kc_create_help_request(jsonb)
  from public;
grant execute on function public.kc_create_help_request(jsonb)
  to anon, authenticated, service_role;
revoke all on function
  public.kc_create_help_request_with_notification_claim(jsonb)
  from public;
grant execute on function
  public.kc_create_help_request_with_notification_claim(jsonb)
  to anon, authenticated, service_role;
revoke all on function
  public.kc_create_help_request_with_notification_claim_v2(jsonb)
  from public;
grant execute on function
  public.kc_create_help_request_with_notification_claim_v2(jsonb)
  to anon, authenticated, service_role;

comment on function public.kc_create_help_request(jsonb) is
  'Compatibilidade SECURITY DEFINER para Help generico/external_access; as tres rotas LGPD exigem kc_create_privacy_help_request_v1.';
comment on function
  public.kc_create_help_request_with_notification_claim(jsonb) is
  'Compatibilidade SECURITY DEFINER para claim de external_access; as tres rotas LGPD exigem kc_create_privacy_help_request_v1.';
comment on function
  public.kc_create_help_request_with_notification_claim_v2(jsonb) is
  'Compatibilidade SECURITY DEFINER para Help generico/external_access; as tres rotas LGPD exigem kc_create_privacy_help_request_v1.';

create or replace function
  kc_private.kc_create_privacy_help_request_v1(
    p_payload jsonb
  )
returns table (
  out_id uuid,
  out_created_at timestamptz,
  out_notification_claim text,
  out_notification_claim_expires_at timestamptz,
  out_data_subject_request jsonb,
  out_protocol text,
  out_reused_existing boolean,
  out_idempotency_replayed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_anonymous boolean :=
    pg_catalog.lower(
      coalesce(auth.jwt() ->> 'is_anonymous', 'false')
    ) = 'true';
  v_expected_auth_state text;
  v_expected_user_id text;
  v_type text;
  v_topic text;
  v_subtopic text;
  v_request_kind text;
  v_idempotency_key text;
  v_key_hash text;
  v_payload_fingerprint text;
  v_caller_scope_hash text;
  v_clean_payload jsonb;
  v_clean_metadata jsonb;
  v_original_jwt_claims text;
  v_error_state text;
  v_error_message text;
  v_rate_count integer;
  v_guest_rate_attempts integer;
  v_guest_rate_window timestamptz;
  v_response_dsr_id uuid;
  v_existing kc_private.help_privacy_submission_idempotency%rowtype;
  v_created record;
  v_help_created_at timestamptz;
  v_replay_request public.data_subject_requests%rowtype;
begin
  if p_payload is null
     or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'HELP_IDEMPOTENCY_PAYLOAD_INVALID';
  end if;
  if pg_catalog.octet_length(p_payload::text) > 32768
     or pg_catalog.octet_length(
       coalesce(p_payload -> 'metadata', '{}'::jsonb)::text
     ) > 16384 then
    raise exception using
      errcode = '22023',
      message = 'HELP_IDEMPOTENCY_PAYLOAD_TOO_LARGE';
  end if;

  v_expected_auth_state := pg_catalog.lower(
    pg_catalog.btrim(
      coalesce(p_payload ->> 'expected_auth_state', '')
    )
  );
  v_expected_user_id := pg_catalog.lower(
    pg_catalog.btrim(
      coalesce(p_payload ->> 'expected_user_id', '')
    )
  );
  if v_expected_auth_state not in ('anonymous', 'authenticated') then
    raise exception using
      errcode = '22023',
      message = 'EXPECTED_AUTH_STATE_INVALID';
  end if;

  -- O replay faz sua propria vinculacao Auth antes de consultar a tabela. Nao
  -- depende do wrapper v2, pois o caminho de replay nao chama aquele worker.
  if v_expected_auth_state = 'authenticated' then
    if v_expected_user_id = ''
       or v_uid is null
       or v_is_anonymous
       or v_expected_user_id <> pg_catalog.lower(v_uid::text) then
      raise exception using
        errcode = '42501',
        message = 'AUTH_ACCOUNT_CHANGED';
    end if;
    perform
      kc_private.kc_assert_current_authenticated_session_active();
  elsif v_expected_user_id <> ''
        or (v_uid is not null and not v_is_anonymous) then
    raise exception using
      errcode = '42501',
      message = 'AUTH_ACCOUNT_CHANGED';
  end if;
  if v_uid is not null then
    if v_is_anonymous then
      perform
        kc_private.kc_assert_current_anonymous_session_active();
    end if;
  end if;

  v_type := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_payload ->> 'type', ''))
  );
  v_topic := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_payload ->> 'topic', ''))
  );
  v_subtopic := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_payload ->> 'subtopic', ''))
  );
  v_request_kind := case
    when v_type = 'account_access'
     and v_topic = 'onboarding_settings'
     and v_subtopic = 'account_data_copy'
      then 'data_access_copy'
    when v_type = 'account_access'
     and v_topic = 'onboarding_settings'
     and v_subtopic = 'account_data_portability'
      then 'data_portability'
    when v_type = 'account_access'
     and v_topic = 'onboarding_settings'
     and v_subtopic = 'account_deletion'
      then 'account_erasure'
    else null
  end;
  if v_request_kind is null then
    raise exception using
      errcode = '22023',
      message = 'HELP_IDEMPOTENCY_SCOPE_INVALID';
  end if;

  v_idempotency_key := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_payload ->> 'idempotency_key', ''))
  );
  if v_idempotency_key !~ '^[a-f0-9]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'HELP_IDEMPOTENCY_KEY_INVALID';
  end if;

  v_key_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(v_idempotency_key, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_payload_fingerprint :=
    kc_private.kc_privacy_help_payload_fingerprint(p_payload);
  v_caller_scope_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        v_expected_auth_state
          || ':'
          || coalesce(v_uid::text, 'guest'),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  -- Serializa a primeira gravacao e todos os replays pela chave opaca sem
  -- manter a chave bruta. O lock acontece antes do worker que cria Help/DSR.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'privacy-help-idempotency:' || v_key_hash,
      190653
    )
  );

  select entry_row.*
  into v_existing
  from kc_private.help_privacy_submission_idempotency entry_row
  where entry_row.key_hash = v_key_hash;

  if found then
    -- Para outro caller, a resposta e indistinguivel de uma chave invalida e
    -- nao revela help_request_id, protocolo, kind ou existencia da submissao.
    if v_existing.auth_state <> v_expected_auth_state
       or v_existing.caller_scope_hash <> v_caller_scope_hash then
      raise exception using
        errcode = '22023',
        message = 'HELP_IDEMPOTENCY_KEY_INVALID';
    end if;
    if v_existing.lifecycle_state = 'retired' then
      raise exception using
        errcode = '22023',
        message = 'HELP_IDEMPOTENCY_KEY_RETIRED',
        detail = 'HELP_IDEMPOTENCY_SAFE_TO_REPLACE';
    elsif v_existing.lifecycle_state <> 'committed' then
      raise exception using
        errcode = '55000',
        message = 'HELP_IDEMPOTENCY_REPLAY_INTEGRITY_ERROR';
    end if;

    if v_existing.request_kind <> v_request_kind
       or v_existing.payload_fingerprint <> v_payload_fingerprint then
      raise exception using
        errcode = '22023',
        message = 'HELP_IDEMPOTENCY_PAYLOAD_CONFLICT';
    end if;

    if v_expected_auth_state = 'authenticated' then
      select request_row.*
      into v_replay_request
      from public.data_subject_requests request_row
      where request_row.id = v_existing.data_subject_request_id
        and request_row.user_id = v_uid
        and request_row.request_kind = v_request_kind
        and request_row.protocol = v_existing.response_protocol
      for share;
      if not found then
        raise exception using
          errcode = '55000',
          message = 'HELP_IDEMPOTENCY_REPLAY_INTEGRITY_ERROR';
      end if;
      select help_row.created_at
      into v_help_created_at
      from public.help_requests help_row
      where help_row.id = v_existing.help_request_id
      for share;
      if not found
         or v_help_created_at is distinct from
           v_existing.response_created_at then
        raise exception using
          errcode = '55000',
          message = 'HELP_IDEMPOTENCY_REPLAY_INTEGRITY_ERROR';
      end if;
      out_data_subject_request :=
        pg_catalog.to_jsonb(v_replay_request)
          - 'user_id'
          - 'subject_hash'
          - 'idempotency_key';
      out_protocol := v_replay_request.protocol;
    else
      if v_existing.data_subject_request_id is not null
         or v_existing.response_protocol is not null then
        raise exception using
          errcode = '55000',
          message = 'HELP_IDEMPOTENCY_REPLAY_INTEGRITY_ERROR';
      end if;
      select help_row.created_at
      into v_help_created_at
      from public.help_requests help_row
      where help_row.id = v_existing.help_request_id
      for share;
      if not found
         or v_help_created_at is distinct from
           v_existing.response_created_at then
        raise exception using
          errcode = '55000',
          message = 'HELP_IDEMPOTENCY_REPLAY_INTEGRITY_ERROR';
      end if;
      out_data_subject_request := null;
      out_protocol := null;
    end if;
    out_id := v_existing.help_request_id;
    out_created_at := v_existing.response_created_at;
    out_notification_claim := null;
    out_notification_claim_expires_at := null;
    out_reused_existing := v_existing.response_reused_existing;
    out_idempotency_replayed := true;
    return next;
    return;
  end if;

  v_clean_metadata := coalesce(p_payload -> 'metadata', '{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_clean_metadata) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'HELP_IDEMPOTENCY_PAYLOAD_INVALID';
  end if;
  v_clean_metadata := kc_private.kc_privacy_help_metadata_v1(
    v_clean_metadata,
    v_request_kind
  );
  v_clean_payload := pg_catalog.jsonb_set(
    p_payload
      - 'idempotency_key'
      - 'idempotency_fingerprint'
      - 'submission_key'
      - 'submission_fingerprint',
    '{metadata}',
    v_clean_metadata,
    true
  );
  -- Classificacao e fingerprint usam valores canonicos; o worker legado deve
  -- receber exatamente os mesmos valores para que hash e linha persistida nao
  -- possam divergir por caixa ou espacos.
  v_clean_payload := pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(
        v_clean_payload,
        '{type}',
        pg_catalog.to_jsonb(v_type),
        true
      ),
      '{topic}',
      pg_catalog.to_jsonb(v_topic),
      true
    ),
    '{subtopic}',
    pg_catalog.to_jsonb(v_subtopic),
    true
  );

  if v_expected_auth_state = 'anonymous' and v_uid is null then
    -- Guest nao oferece um identificador confiavel alem do e-mail ja validado
    -- pelo worker legado. Um budget global generoso limita rotacao de
    -- e-mail+chave sem coletar IP/header e sem afetar o recovery ambiguo.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'privacy-help-guest-global-rate',
        190653
      )
    );
    v_guest_rate_window := pg_catalog.date_trunc(
      'hour',
      pg_catalog.now()
    );
    insert into kc_private.help_privacy_guest_rate_buckets (
      window_started_at,
      attempts,
      updated_at
    ) values (
      v_guest_rate_window,
      1,
      pg_catalog.now()
    )
    on conflict (window_started_at)
    do update set
      attempts =
        kc_private.help_privacy_guest_rate_buckets.attempts + 1,
      updated_at = excluded.updated_at
    where kc_private.help_privacy_guest_rate_buckets.attempts < 10000
    returning attempts into v_guest_rate_attempts;
    if v_guest_rate_attempts is null then
      raise exception using
        errcode = 'P0001',
        message = 'HELP_RATE_LIMIT_1H',
        detail = 'HELP_IDEMPOTENCY_SAFE_TO_REPLACE';
    end if;
  end if;

  begin
    if v_expected_auth_state = 'anonymous' and v_uid is not null then
      -- O wrapper de notification claim legado rejeita corretamente qualquer
      -- uid que nao seja uma conta real. Para um JWT anonimo ja validado acima,
      -- cria-se apenas o Help base, sem DSR, owner ou claim.
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'privacy-help-anonymous-rate:' || v_caller_scope_hash,
          190653
        )
      );
      select pg_catalog.count(*)::integer
      into v_rate_count
      from kc_private.help_privacy_submission_idempotency entry_row
      where entry_row.auth_state = 'anonymous'
        and entry_row.lifecycle_state = 'committed'
        and entry_row.caller_scope_hash = v_caller_scope_hash
        and entry_row.created_at >
          pg_catalog.now() - interval '1 hour';
      if v_rate_count >= 10 then
        raise exception using
          errcode = 'P0001',
          message = 'HELP_RATE_LIMIT_1H';
      end if;

      -- O worker base deriva owner e o guard DML a partir do JWT corrente. A
      -- sessao anonima real ja foi validada e bloqueada acima; durante somente
      -- esta chamada, suprima o uid para que o Help nasca guest/unowned sem
      -- afrouxar kc_is_current_session_active() nem seus guards globais.
      v_original_jwt_claims := coalesce(
        pg_catalog.current_setting('request.jwt.claims', true),
        '{}'
      );
      perform pg_catalog.set_config(
        'request.jwt.claims',
        '{"role":"anon"}',
        true
      );
      select
        base_row.out_id,
        base_row.out_created_at,
        null::text as out_notification_claim,
        null::timestamptz as out_notification_claim_expires_at,
        null::jsonb as out_data_subject_request,
        null::text as out_protocol,
        false as out_reused_existing
      into strict v_created
      from kc_private.kc_create_help_request(v_clean_payload) base_row;
      perform pg_catalog.set_config(
        'request.jwt.claims',
        v_original_jwt_claims,
        true
      );
    else
      select *
      into strict v_created
      from kc_private.kc_help_request_v2_20260729_idempotency_base(
        v_clean_payload
      );
    end if;

    -- Esta familia nunca aceita um fluxo que gere claim. Falhar aqui reverte
    -- Help/DSR e impede que uma prova bruta seja armazenada ou reemitida.
    if v_created.out_notification_claim is not null
       or v_created.out_notification_claim_expires_at is not null then
      raise exception using
        errcode = '55000',
        message = 'HELP_IDEMPOTENCY_NOTIFICATION_CLAIM_UNEXPECTED';
    end if;
    if v_expected_auth_state = 'authenticated' then
      if pg_catalog.jsonb_typeof(
        coalesce(v_created.out_data_subject_request, 'null'::jsonb)
      ) <> 'object'
         or coalesce(
           v_created.out_data_subject_request ->> 'id',
           ''
         ) !~
           '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         or coalesce(
           v_created.out_data_subject_request ->> 'protocol',
           ''
         ) <> coalesce(v_created.out_protocol, '') then
        raise exception using
          errcode = '55000',
          message = 'HELP_IDEMPOTENCY_REPLAY_INTEGRITY_ERROR';
      end if;
      v_response_dsr_id :=
        (v_created.out_data_subject_request ->> 'id')::uuid;
    elsif v_created.out_data_subject_request is not null
          or v_created.out_protocol is not null then
      raise exception using
        errcode = '55000',
        message = 'HELP_IDEMPOTENCY_REPLAY_INTEGRITY_ERROR';
    end if;

    insert into kc_private.help_privacy_submission_idempotency (
      key_hash,
      payload_fingerprint,
      caller_scope_hash,
      caller_user_id,
      auth_state,
      request_kind,
      lifecycle_state,
      help_request_id,
      response_created_at,
      data_subject_request_id,
      response_protocol,
      response_reused_existing
    ) values (
      v_key_hash,
      v_payload_fingerprint,
      v_caller_scope_hash,
      v_uid,
      v_expected_auth_state,
      v_request_kind,
      'committed',
      v_created.out_id,
      v_created.out_created_at,
      v_response_dsr_id,
      v_created.out_protocol,
      v_created.out_reused_existing
    );
  exception
    when others then
      get stacked diagnostics
        v_error_state = returned_sqlstate,
        v_error_message = message_text;
      raise exception using
        errcode = v_error_state,
        message = v_error_message,
        detail = 'HELP_IDEMPOTENCY_SAFE_TO_REPLACE';
  end;

  out_id := v_created.out_id;
  out_created_at := v_created.out_created_at;
  out_notification_claim := null;
  out_notification_claim_expires_at := null;
  out_data_subject_request := v_created.out_data_subject_request;
  out_protocol := v_created.out_protocol;
  out_reused_existing := v_created.out_reused_existing;
  out_idempotency_replayed := false;
  return next;
end;
$$;

revoke all on function
  kc_private.kc_create_privacy_help_request_v1(jsonb)
  from public, anon, authenticated, service_role;

drop function if exists
  public.kc_recover_privacy_help_request_v1(jsonb);
drop function if exists
  kc_private.kc_recover_privacy_help_request_v1(jsonb);

create or replace function
  kc_private.kc_recover_privacy_help_request_v1(
    p_payload jsonb
  )
returns table (
  out_id uuid,
  out_created_at timestamptz,
  out_notification_claim text,
  out_notification_claim_expires_at timestamptz,
  out_data_subject_request jsonb,
  out_protocol text,
  out_reused_existing boolean,
  out_idempotency_replayed boolean,
  out_recovery_state text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_anonymous boolean :=
    pg_catalog.lower(
      coalesce(auth.jwt() ->> 'is_anonymous', 'false')
    ) = 'true';
  v_expected_auth_state text;
  v_source_auth_state text;
  v_expected_user_id text;
  v_request_kind text;
  v_idempotency_key text;
  v_key_hash text;
  v_caller_scope_hash text;
  v_existing kc_private.help_privacy_submission_idempotency%rowtype;
  v_rate_attempts integer;
  v_rate_window timestamptz;
  v_help_created_at timestamptz;
  v_replay_request public.data_subject_requests%rowtype;
begin
  if p_payload is null
     or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or pg_catalog.octet_length(p_payload::text) > 2048 then
    raise exception using
      errcode = '22023',
      message = 'HELP_IDEMPOTENCY_PAYLOAD_INVALID';
  end if;

  v_expected_auth_state := pg_catalog.lower(
    pg_catalog.btrim(
      coalesce(p_payload ->> 'expected_auth_state', '')
    )
  );
  v_expected_user_id := pg_catalog.lower(
    pg_catalog.btrim(
      coalesce(p_payload ->> 'expected_user_id', '')
    )
  );
  if v_expected_auth_state not in ('anonymous', 'authenticated') then
    raise exception using
      errcode = '22023',
      message = 'EXPECTED_AUTH_STATE_INVALID';
  end if;

  if v_expected_auth_state = 'authenticated' then
    if v_expected_user_id = ''
       or v_uid is null
       or v_is_anonymous
       or v_expected_user_id <> pg_catalog.lower(v_uid::text) then
      raise exception using
        errcode = '42501',
        message = 'AUTH_ACCOUNT_CHANGED';
    end if;
    perform
      kc_private.kc_assert_current_authenticated_session_active();
  elsif v_expected_user_id <> ''
        or (v_uid is not null and not v_is_anonymous) then
    raise exception using
      errcode = '42501',
      message = 'AUTH_ACCOUNT_CHANGED';
  end if;
  if v_uid is not null then
    if v_is_anonymous then
      perform
        kc_private.kc_assert_current_anonymous_session_active();
    end if;
  end if;

  v_source_auth_state := pg_catalog.lower(
    pg_catalog.btrim(
      coalesce(
        p_payload ->> 'source_auth_state',
        v_expected_auth_state
      )
    )
  );
  if v_source_auth_state not in ('anonymous', 'authenticated')
     or (
       v_source_auth_state <> v_expected_auth_state
       and not (
         v_expected_auth_state = 'authenticated'
         and v_source_auth_state = 'anonymous'
         and v_uid is not null
         and not v_is_anonymous
       )
     ) then
    raise exception using
      errcode = '42501',
      message = 'AUTH_ACCOUNT_CHANGED';
  end if;

  v_request_kind := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_payload ->> 'request_kind', ''))
  );
  if v_request_kind not in (
    'data_access_copy',
    'data_portability',
    'account_erasure'
  ) then
    raise exception using
      errcode = '22023',
      message = 'HELP_IDEMPOTENCY_SCOPE_INVALID';
  end if;
  v_idempotency_key := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_payload ->> 'idempotency_key', ''))
  );
  if v_idempotency_key !~ '^[a-f0-9]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'HELP_IDEMPOTENCY_KEY_INVALID';
  end if;
  v_key_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(v_idempotency_key, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_caller_scope_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        v_source_auth_state
          || ':'
          || coalesce(v_uid::text, 'guest'),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  -- O mesmo lock do create ordena recovery contra qualquer create que ja
  -- chegou ao banco. Para um uid, ausencia vira tombstone duravel. Guest sem
  -- uid permanece ambiguo quando ausente, evitando um rate bucket global e
  -- garantindo que a chave nao seja girada antes de um create atrasado.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'privacy-help-idempotency:' || v_key_hash,
      190653
    )
  );
  select entry_row.*
  into v_existing
  from kc_private.help_privacy_submission_idempotency entry_row
  where entry_row.key_hash = v_key_hash
    and entry_row.auth_state = v_source_auth_state
    and entry_row.caller_scope_hash = v_caller_scope_hash;
  if not found then
    if v_uid is null then
      out_id := null;
      out_created_at := null;
      out_notification_claim := null;
      out_notification_claim_expires_at := null;
      out_data_subject_request := null;
      out_protocol := null;
      out_reused_existing := false;
      out_idempotency_replayed := false;
      out_recovery_state := 'ambiguous';
      return next;
      return;
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'privacy-help-recovery-retire-rate:'
          || v_caller_scope_hash,
        190653
      )
    );
    v_rate_window := pg_catalog.date_trunc(
      'hour',
      pg_catalog.now()
    );
    insert into kc_private.help_privacy_recovery_rate_buckets (
      caller_scope_hash,
      caller_user_id,
      window_started_at,
      attempts,
      updated_at
    ) values (
      v_caller_scope_hash,
      v_uid,
      v_rate_window,
      1,
      pg_catalog.now()
    )
    on conflict (caller_scope_hash, window_started_at)
    do update set
      attempts =
        kc_private.help_privacy_recovery_rate_buckets.attempts + 1,
      updated_at = excluded.updated_at
    where
      kc_private.help_privacy_recovery_rate_buckets.attempts < 25
    returning attempts into v_rate_attempts;
    if v_rate_attempts is null then
      out_id := null;
      out_created_at := null;
      out_notification_claim := null;
      out_notification_claim_expires_at := null;
      out_data_subject_request := null;
      out_protocol := null;
      out_reused_existing := false;
      out_idempotency_replayed := false;
      out_recovery_state := 'ambiguous';
      return next;
      return;
    end if;

    insert into kc_private.help_privacy_submission_idempotency (
      key_hash,
      payload_fingerprint,
      caller_scope_hash,
      caller_user_id,
      auth_state,
      request_kind,
      lifecycle_state,
      help_request_id,
      response_created_at,
      data_subject_request_id,
      response_protocol,
      response_reused_existing,
      retired_at
    ) values (
      v_key_hash,
      null,
      v_caller_scope_hash,
      v_uid,
      v_source_auth_state,
      v_request_kind,
      'retired',
      null,
      null,
      null,
      null,
      false,
      pg_catalog.now()
    )
    on conflict (key_hash) do nothing;

    -- A mesma resposta cobre tanto uma chave nova tombstonada quanto colisao
    -- com outro scope. Assim recovery nao funciona como oracle de existencia.
    out_id := null;
    out_created_at := null;
    out_notification_claim := null;
    out_notification_claim_expires_at := null;
    out_data_subject_request := null;
    out_protocol := null;
    out_reused_existing := false;
    out_idempotency_replayed := false;
    out_recovery_state := 'retired';
    return next;
    return;
  end if;
  if v_existing.request_kind <> v_request_kind then
    raise exception using
      errcode = '22023',
      message = 'HELP_IDEMPOTENCY_PAYLOAD_CONFLICT';
  end if;
  if v_existing.lifecycle_state = 'retired' then
    out_id := null;
    out_created_at := null;
    out_notification_claim := null;
    out_notification_claim_expires_at := null;
    out_data_subject_request := null;
    out_protocol := null;
    out_reused_existing := false;
    out_idempotency_replayed := false;
    out_recovery_state := 'retired';
    return next;
    return;
  elsif v_existing.lifecycle_state <> 'committed' then
    raise exception using
      errcode = '55000',
      message = 'HELP_IDEMPOTENCY_REPLAY_INTEGRITY_ERROR';
  end if;

  if v_source_auth_state = 'authenticated' then
    select request_row.*
    into v_replay_request
    from public.data_subject_requests request_row
    where request_row.id = v_existing.data_subject_request_id
      and request_row.user_id = v_uid
      and request_row.request_kind = v_existing.request_kind
      and request_row.protocol = v_existing.response_protocol
    for share;
    if not found then
      raise exception using
        errcode = '55000',
        message = 'HELP_IDEMPOTENCY_REPLAY_INTEGRITY_ERROR';
    end if;
    select help_row.created_at
    into v_help_created_at
    from public.help_requests help_row
    where help_row.id = v_existing.help_request_id
    for share;
    if not found
       or v_help_created_at is distinct from
         v_existing.response_created_at then
      raise exception using
        errcode = '55000',
        message = 'HELP_IDEMPOTENCY_REPLAY_INTEGRITY_ERROR';
    end if;
    out_data_subject_request :=
      pg_catalog.to_jsonb(v_replay_request)
        - 'user_id'
        - 'subject_hash'
        - 'idempotency_key';
    out_protocol := v_replay_request.protocol;
  else
    if v_existing.data_subject_request_id is not null
       or v_existing.response_protocol is not null then
      raise exception using
        errcode = '55000',
        message = 'HELP_IDEMPOTENCY_REPLAY_INTEGRITY_ERROR';
    end if;
    select help_row.created_at
    into v_help_created_at
    from public.help_requests help_row
    where help_row.id = v_existing.help_request_id
    for share;
    if not found
       or v_help_created_at is distinct from
         v_existing.response_created_at then
      raise exception using
        errcode = '55000',
        message = 'HELP_IDEMPOTENCY_REPLAY_INTEGRITY_ERROR';
    end if;
    out_data_subject_request := null;
    out_protocol := null;
  end if;
  out_id := v_existing.help_request_id;
  out_created_at := v_existing.response_created_at;
  out_notification_claim := null;
  out_notification_claim_expires_at := null;
  out_reused_existing := v_existing.response_reused_existing;
  out_idempotency_replayed := true;
  out_recovery_state := 'recovered';
  return next;
end;
$$;

revoke all on function
  kc_private.kc_recover_privacy_help_request_v1(jsonb)
  from public, anon, authenticated, service_role;

create or replace function
  public.kc_create_privacy_help_request_v1(
    p_payload jsonb
  )
returns table (
  out_id uuid,
  out_created_at timestamptz,
  out_notification_claim text,
  out_notification_claim_expires_at timestamptz,
  out_data_subject_request jsonb,
  out_protocol text,
  out_reused_existing boolean,
  out_idempotency_replayed boolean
)
language sql
volatile
security definer
set search_path = ''
as $$
  select *
  from kc_private.kc_create_privacy_help_request_v1($1);
$$;

revoke all on function
  public.kc_create_privacy_help_request_v1(jsonb)
  from public;
grant execute on function
  public.kc_create_privacy_help_request_v1(jsonb)
  to anon, authenticated, service_role;

comment on function
  public.kc_create_privacy_help_request_v1(jsonb) is
  'Cria ou reproduz atomicamente Help dos tres direitos LGPD sob chave opaca, fingerprint server-side e binding Auth; nunca gera ou reemite notification claim.';

create or replace function
  public.kc_recover_privacy_help_request_v1(
    p_payload jsonb
  )
returns table (
  out_id uuid,
  out_created_at timestamptz,
  out_notification_claim text,
  out_notification_claim_expires_at timestamptz,
  out_data_subject_request jsonb,
  out_protocol text,
  out_reused_existing boolean,
  out_idempotency_replayed boolean,
  out_recovery_state text
)
language sql
volatile
security definer
set search_path = ''
as $$
  select *
  from kc_private.kc_recover_privacy_help_request_v1($1);
$$;

revoke all on function
  public.kc_recover_privacy_help_request_v1(jsonb)
  from public;
grant execute on function
  public.kc_recover_privacy_help_request_v1(jsonb)
  to anon, authenticated, service_role;

comment on function
  public.kc_recover_privacy_help_request_v1(jsonb) is
  'Recupera por chave opaca, request kind e caller Auth o recibo Help LGPD sem reenviar PII. Para uid, ausencia vira tombstone rateado; guest ausente permanece ambiguo e conserva a chave.';

notify pgrst, 'reload schema';

commit;

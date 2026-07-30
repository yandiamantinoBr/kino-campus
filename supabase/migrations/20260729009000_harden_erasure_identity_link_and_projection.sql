-- ============================================================================
-- KinoCampus - vinculo seguro de identidade para exclusao e ACL de workflow
-- ============================================================================
-- Contratos:
--   * o navegador nunca le a tabela operacional account_erasure_requests;
--   * somente service_role, com ator e auth.sessions ativos, vincula identidade;
--   * Help, DSR e workflow sao vinculados atomicamente ao unico Auth do e-mail;
--   * a referencia de verificacao nunca e persistida; somente um hash
--     contextual, separado por Help/canal/versao, cruza a fronteira do worker;
--   * o lock global do titular precede Help, DSR e workflow, como em 04000/07000;
--   * retries identicos sao idempotentes; qualquer divergencia falha fechada.
-- ============================================================================

begin;

-- RLS filtra linhas, nao colunas. A tabela contem checkpoint de exclusao Auth,
-- inventario de reparo e UUIDs internos, portanto nao pode ser projetada
-- diretamente pelo Data API. A Edge Function e a unica fronteira de leitura.
drop policy if exists account_erasure_requests_select_admin
  on public.account_erasure_requests;
revoke all on table public.account_erasure_requests
  from public, anon, authenticated;
do $migration$
declare
  v_columns text;
begin
  select pg_catalog.string_agg(
    pg_catalog.format('%I', attribute_row.attname),
    ', '
    order by attribute_row.attnum
  )
  into v_columns
  from pg_catalog.pg_attribute attribute_row
  where attribute_row.attrelid =
      'public.account_erasure_requests'::regclass
    and attribute_row.attnum > 0
    and not attribute_row.attisdropped;

  if nullif(v_columns, '') is not null then
    execute pg_catalog.format(
      'revoke select (%1$s), insert (%1$s), update (%1$s), references (%1$s) on table public.account_erasure_requests from public, anon, authenticated',
      v_columns
    );
  end if;
end;
$migration$;
grant all on table public.account_erasure_requests
  to service_role;

comment on table public.account_erasure_requests is
  'Maquina de estados LGPD service-only. Leitura e escrita do navegador sao proibidas; respostas administrativas usam projecao explicita na Edge Function.';

-- metadata.account_email era historicamente aceito do payload mesmo quando o
-- Help autenticado ja possuia um titular confiavel. Ele nao pode competir com
-- Auth/contact_email como alvo operacional. Para tickets anonimos o valor nao
-- e promovido: somente o binder verificado abaixo podera normaliza-lo.
create or replace function
  kc_private.kc_normalize_authenticated_privacy_help_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_count integer := 0;
  v_auth_email text;
  v_jwt_role text := coalesce(auth.jwt() ->> 'role', '');
  v_privacy_scope boolean := false;
begin
  v_privacy_scope :=
    new.type = 'account_access'
    and new.topic = 'onboarding_settings'
    and coalesce(new.subtopic, '') in (
      'account_deletion',
      'account_data_copy',
      'account_data_portability'
    );

  if tg_op = 'UPDATE' then
    v_privacy_scope := v_privacy_scope or (
      old.type = 'account_access'
      and old.topic = 'onboarding_settings'
      and coalesce(old.subtopic, '') in (
        'account_deletion',
        'account_data_copy',
        'account_data_portability'
      )
    );
  end if;

  if v_privacy_scope
     and v_jwt_role in ('anon', 'authenticated') then
    if tg_op = 'UPDATE'
       and new.user_id is distinct from old.user_id then
      raise exception using
        errcode = '42501',
        message = 'PRIVACY_HELP_SUBJECT_CHANGE_REQUIRES_SERVICE_ROLE';
    end if;
    if tg_op = 'INSERT'
       and new.user_id is not null
       and (
         v_jwt_role <> 'authenticated'
         or new.user_id is distinct from auth.uid()
       ) then
      raise exception using
        errcode = '42501',
        message = 'PRIVACY_HELP_AUTH_SUBJECT_MISMATCH';
    end if;
  end if;

  -- A redacao LGPD atualiza user_id = null na mesma instrucao que troca os
  -- campos pessoais. O retorno antecipado preserva essa operacao e impede o
  -- trigger de reintroduzir o e-mail Auth antes/depois da exclusao da conta.
  if new.user_id is null
     or new.type is distinct from 'account_access'
     or new.topic is distinct from 'onboarding_settings'
     or coalesce(new.subtopic, '') not in (
       'account_deletion',
       'account_data_copy',
       'account_data_portability'
     ) then
    return new;
  end if;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.min(
      pg_catalog.lower(
        pg_catalog.btrim(coalesce(user_row.email, ''))
      )
    )
  into v_auth_count, v_auth_email
  from auth.users user_row
  where user_row.id = new.user_id
    and user_row.deleted_at is null;

  if v_auth_count <> 1
     or coalesce(v_auth_email, '') !~
       '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception using
      errcode = '23514',
      message = 'PRIVACY_HELP_AUTH_ACCOUNT_NOT_UNIQUE';
  end if;

  new.contact_email := v_auth_email;
  new.metadata := (
    coalesce(new.metadata, '{}'::jsonb)
    - 'account_email'
  ) || pg_catalog.jsonb_build_object(
    'account_email',
    v_auth_email
  );
  return new;
end;
$$;

revoke all on function
  kc_private.kc_normalize_authenticated_privacy_help_email()
  from public, anon, authenticated, service_role;

do $migration$
begin
  if exists (
    select 1
    from public.help_requests help_row
    left join auth.users user_row
      on user_row.id = help_row.user_id
      and user_row.deleted_at is null
    where help_row.user_id is not null
      and help_row.type = 'account_access'
      and help_row.topic = 'onboarding_settings'
      and help_row.subtopic in (
        'account_deletion',
        'account_data_copy',
        'account_data_portability'
      )
      and (
        user_row.id is null
        or coalesce(
          pg_catalog.lower(
            pg_catalog.btrim(user_row.email)
          ),
          ''
        ) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'PRIVACY_HELP_AUTH_ACCOUNT_NOT_UNIQUE';
  end if;
end;
$migration$;

update public.help_requests help_row
set
  contact_email = pg_catalog.lower(
    pg_catalog.btrim(user_row.email)
  ),
  metadata = (
    coalesce(help_row.metadata, '{}'::jsonb)
    - 'account_email'
  ) || pg_catalog.jsonb_build_object(
    'account_email',
    pg_catalog.lower(pg_catalog.btrim(user_row.email))
  )
from auth.users user_row
where help_row.user_id = user_row.id
  and user_row.deleted_at is null
  and help_row.type = 'account_access'
  and help_row.topic = 'onboarding_settings'
  and help_row.subtopic in (
    'account_deletion',
    'account_data_copy',
    'account_data_portability'
  )
  and (
    pg_catalog.lower(
      pg_catalog.btrim(help_row.contact_email)
    ) is distinct from pg_catalog.lower(
      pg_catalog.btrim(user_row.email)
    )
    or help_row.metadata ->> 'account_email' is distinct from
      pg_catalog.lower(pg_catalog.btrim(user_row.email))
  );

drop trigger if exists
  trg_normalize_authenticated_privacy_help_email
  on public.help_requests;
create trigger trg_normalize_authenticated_privacy_help_email
before insert or update of
  user_id,
  contact_email,
  type,
  topic,
  subtopic,
  metadata
on public.help_requests
for each row
execute function
  kc_private.kc_normalize_authenticated_privacy_help_email();

comment on function
  kc_private.kc_normalize_authenticated_privacy_help_email() is
  'Ignora account_email fornecido pelo cliente em Help autenticado de privacidade e normaliza contact/metadata pelo unico Auth vinculado.';

create table kc_private.account_erasure_ticket_identity_links (
  help_request_id uuid primary key
    references public.help_requests(id) on delete cascade,
  request_id uuid not null unique
    references public.data_subject_requests(id) on delete cascade,
  workflow_id uuid not null unique
    references public.account_erasure_requests(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  verification_channel text not null,
  attestation_hash text not null,
  verified_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint account_erasure_ticket_identity_links_channel_check
    check (verification_channel in (
      'verified_email_challenge',
      'support_mailbox_reply',
      'identity_document_review',
      'in_person_verification'
    )),
  constraint account_erasure_ticket_identity_links_hash_check
    check (attestation_hash ~ '^[a-f0-9]{64}$'),
  constraint account_erasure_ticket_identity_links_verified_at_check
    check (verified_at <= created_at + interval '5 minutes')
);

comment on table kc_private.account_erasure_ticket_identity_links is
  'Prova service-only e imutavel do vinculo Help/DSR/workflow. Nao armazena e-mail nem referencia de verificacao em texto puro.';
comment on column
  kc_private.account_erasure_ticket_identity_links.attestation_hash is
  'SHA-256 contextual kc:account-erasure-identity:v1|Help|canal|SHA256(referencia); referencia e hash cru nunca sao persistidos.';

revoke all on table kc_private.account_erasure_ticket_identity_links
  from public, anon, authenticated, service_role;

create or replace function
  public.kc_link_verified_help_request_to_account_erasure(
    p_help_request_id uuid,
    p_account_email text,
    p_actor_id uuid,
    p_actor_session_id uuid,
    p_verification_channel text,
    p_attestation_sha256 text,
    p_verified_at timestamptz
  )
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_email text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_account_email, ''))
  );
  v_channel text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_verification_channel, ''))
  );
  v_attestation_hash text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_attestation_sha256, ''))
  );
  v_target_user_id uuid;
  v_locked_auth_user_id uuid;
  v_account_count integer := 0;
  v_dsr_count integer := 0;
  v_workflow_count integer := 0;
  v_dsr_id uuid;
  v_workflow_id uuid;
  v_help public.help_requests%rowtype;
  v_dsr public.data_subject_requests%rowtype;
  v_workflow public.account_erasure_requests%rowtype;
  v_link kc_private.account_erasure_ticket_identity_links%rowtype;
  v_link_found boolean := false;
  v_identity_assurance jsonb;
  v_email_domain text;
  v_help_kind text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'SERVICE_ROLE_REQUIRED';
  end if;

  if p_help_request_id is null
     or p_actor_id is null
     or p_actor_session_id is null
     or pg_catalog.char_length(v_email) < 3
     or pg_catalog.char_length(v_email) > 254
     or v_email !~
       '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or v_channel not in (
       'verified_email_challenge',
       'support_mailbox_reply',
       'identity_document_review',
       'in_person_verification'
     )
     or v_attestation_hash !~ '^[a-f0-9]{64}$'
     or p_verified_at is null
     or p_verified_at < v_now - interval '30 days'
     or p_verified_at > v_now + interval '5 minutes' then
    raise exception using
      errcode = '22023',
      message = 'ERASURE_IDENTITY_LINK_INPUT_INVALID';
  end if;

  -- Resolver nao basta: o mesmo e-mail normalizado deve continuar apontando
  -- para exatamente um Auth ativo depois que os locks forem adquiridos.
  select
    pg_catalog.count(*)::integer,
    pg_catalog.min(user_row.id::text)::uuid
  into v_account_count, v_target_user_id
  from auth.users user_row
  where user_row.deleted_at is null
    and pg_catalog.lower(
      pg_catalog.btrim(coalesce(user_row.email, ''))
    ) = v_email;

  if v_account_count <> 1 or v_target_user_id is null then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_IDENTITY_ACCOUNT_NOT_UNIQUE';
  end if;

  -- Ordem global: subject -> Help -> DSR -> workflow. O primeiro lock e o
  -- mesmo usado por criacao de DSR, upsert e claim irreversivel.
  perform kc_private.kc_lock_privacy_subject(v_target_user_id);
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

  select user_row.id
  into v_locked_auth_user_id
  from auth.users user_row
  where user_row.id = v_target_user_id
    and user_row.deleted_at is null
    and pg_catalog.lower(
      pg_catalog.btrim(coalesce(user_row.email, ''))
    ) = v_email
  for share;

  select pg_catalog.count(*)::integer
  into v_account_count
  from auth.users user_row
  where user_row.deleted_at is null
    and pg_catalog.lower(
      pg_catalog.btrim(coalesce(user_row.email, ''))
    ) = v_email;

  if v_locked_auth_user_id is null or v_account_count <> 1 then
    raise exception using
      errcode = '40001',
      message = 'ERASURE_IDENTITY_ACCOUNT_CHANGED';
  end if;

  perform 1
  from public.profiles profile_row
  where profile_row.id = v_target_user_id
  for share;
  if not found then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_IDENTITY_PROFILE_MISSING';
  end if;

  select help_row.*
  into v_help
  from public.help_requests help_row
  where help_row.id = p_help_request_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'ERASURE_IDENTITY_HELP_NOT_FOUND';
  end if;

  v_help_kind := pg_catalog.lower(
    pg_catalog.btrim(coalesce(v_help.metadata ->> 'request_kind', ''))
  );
  if v_help.type is distinct from 'account_access'
     or v_help.topic is distinct from 'onboarding_settings'
     or v_help.subtopic is distinct from 'account_deletion'
     or v_help_kind not in ('', 'account_erasure')
     or pg_catalog.lower(
       pg_catalog.btrim(coalesce(v_help.contact_email, ''))
     ) <> v_email
     or (
       v_help.user_id is not null
       and v_help.user_id <> v_target_user_id
     ) then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_IDENTITY_HELP_MISMATCH';
  end if;

  -- Exige um unico DSR, inclusive diante de linhas de outro tipo: escolher o
  -- primeiro silenciosamente permitiria vinculo ambiguo.
  select
    pg_catalog.count(*)::integer,
    pg_catalog.min(request_row.id::text)::uuid
  into v_dsr_count, v_dsr_id
  from public.data_subject_requests request_row
  where request_row.help_request_id = p_help_request_id;
  if v_dsr_count <> 1 or v_dsr_id is null then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_IDENTITY_DSR_NOT_UNIQUE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'kc_erasure_dsr:' || v_dsr_id::text,
      0
    )
  );
  select request_row.*
  into v_dsr
  from public.data_subject_requests request_row
  where request_row.id = v_dsr_id
  for update;
  if not found
     or v_dsr.request_kind <> 'account_erasure'
     or v_dsr.help_request_id is distinct from p_help_request_id
     or (
       v_dsr.user_id is not null
       and v_dsr.user_id <> v_target_user_id
     )
     or (
       nullif(v_help.metadata ->> 'data_subject_request_id', '') is not null
       and v_help.metadata ->> 'data_subject_request_id' <>
         v_dsr.id::text
     ) then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_IDENTITY_DSR_MISMATCH';
  end if;

  select
    pg_catalog.count(distinct workflow_row.id)::integer,
    pg_catalog.min(workflow_row.id::text)::uuid
  into v_workflow_count, v_workflow_id
  from public.account_erasure_requests workflow_row
  where workflow_row.help_request_id = p_help_request_id
     or workflow_row.data_subject_request_id = v_dsr.id;
  if v_workflow_count > 1 then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_IDENTITY_WORKFLOW_NOT_UNIQUE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'kc_erasure_workflow:' ||
        coalesce(v_workflow_id::text, p_help_request_id::text),
      0
    )
  );
  if v_workflow_id is not null then
    select workflow_row.*
    into v_workflow
    from public.account_erasure_requests workflow_row
    where workflow_row.id = v_workflow_id
    for update;
    if not found then
      raise exception using
        errcode = '40001',
        message = 'ERASURE_IDENTITY_WORKFLOW_CHANGED';
    end if;
  end if;

  select link_row.*
  into v_link
  from kc_private.account_erasure_ticket_identity_links link_row
  where link_row.help_request_id = p_help_request_id
  for update;
  v_link_found := found;

  if v_link_found then
    if v_link.owner_user_id is distinct from v_target_user_id
       or v_link.actor_user_id is distinct from p_actor_id
       or v_link.request_id <> v_dsr.id
       or v_link.workflow_id is distinct from v_workflow_id
       or v_link.verification_channel <> v_channel
       or v_link.attestation_hash <> v_attestation_hash
       or v_link.verified_at <> p_verified_at
       or v_help.user_id is distinct from v_target_user_id
       or v_help.metadata ->> 'account_email' is distinct from v_email
       or v_help.metadata ->> 'identity_source' is distinct from
         'admin_verified_anonymous_erasure'
       or v_help.metadata ->> 'identity_verification_channel' is distinct from
         v_channel
       or v_help.metadata ->> 'identity_attestation_hash' is distinct from
         v_attestation_hash
       or v_help.metadata ->> 'identity_attestation_recorded' is distinct from
         'true'
       or v_dsr.user_id is distinct from v_target_user_id
       or v_workflow.id is null
       or v_workflow.help_request_id is distinct from p_help_request_id
       or v_workflow.data_subject_request_id is distinct from v_dsr.id
       or v_workflow.user_id is distinct from v_target_user_id
       or v_workflow.metadata
         #>> '{identity_assurance,verified}' is distinct from 'true'
       or v_workflow.metadata
         #>> '{identity_assurance,source}' is distinct from
           'admin_verified_anonymous_erasure'
       or v_workflow.metadata
         #>> '{identity_assurance,help_user_id}' is distinct from
           v_target_user_id::text
       or v_workflow.metadata
         #>> '{identity_assurance,target_user_id}' is distinct from
           v_target_user_id::text
       or v_workflow.metadata
         #>> '{identity_assurance,evidence,channel}' is distinct from
           v_channel
       or v_workflow.metadata
         #>> '{identity_assurance,evidence,reference_hash}' is distinct from
           v_attestation_hash
       or v_workflow.metadata
         #>> '{identity_assurance,evidence,recorded_by}' is distinct from
           p_actor_id::text then
      raise exception using
        errcode = '23514',
        message = 'ERASURE_IDENTITY_LINK_CONFLICT';
    end if;

    return pg_catalog.jsonb_build_object(
      'ok', true,
      'linked', true,
      'idempotent', true,
      'protocol', v_dsr.protocol,
      'data_subject_request_status', v_dsr.status,
      'workflow_status', v_workflow.status,
      'identity_source', 'admin_verified_anonymous_erasure'
    );
  end if;

  -- A criacao do vinculo e permitida somente antes de qualquer etapa
  -- irreversivel. Retries de um vinculo ja existente foram tratados acima.
  if v_help.status not in ('new', 'triaged', 'in_progress') then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_IDENTITY_HELP_STATE_INVALID';
  end if;
  if v_dsr.status not in ('received', 'failed') then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_IDENTITY_DSR_STATE_INVALID';
  end if;

  if exists (
    select 1
    from kc_private.account_erasure_subject_closures closure_row
    where closure_row.subject_key_hash =
      kc_private.kc_privacy_subject_key(v_target_user_id)
      and closure_row.state in ('closing', 'completed')
  ) then
    raise exception using
      errcode = '55000',
      message = 'ERASURE_IDENTITY_SUBJECT_CLOSED';
  end if;

  if exists (
    select 1
    from public.data_subject_requests request_row
    where request_row.id <> v_dsr.id
      and request_row.user_id = v_target_user_id
      and request_row.request_kind = 'account_erasure'
      and request_row.status in (
        'received',
        'processing',
        'ready',
        'pending_confirmation',
        'failed',
        'partial_failure'
      )
  ) or exists (
    select 1
    from public.account_erasure_requests workflow_row
    where (v_workflow_id is null or workflow_row.id <> v_workflow_id)
      and workflow_row.user_id = v_target_user_id
      and workflow_row.status not in ('erased', 'cancelled')
  ) then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_IDENTITY_SUBJECT_CONFLICT';
  end if;

  if v_workflow_id is not null
     and (
       v_workflow.status <> 'diagnosed'
       or v_workflow.help_request_id is distinct from p_help_request_id
       or (
         v_workflow.data_subject_request_id is not null
         and v_workflow.data_subject_request_id <> v_dsr.id
       )
       or (
         v_workflow.user_id is not null
         and v_workflow.user_id <> v_target_user_id
       )
       or v_workflow.confirmation_requested_at is not null
       or v_workflow.confirmed_at is not null
       or v_workflow.reversible_applied_at is not null
       or v_workflow.erased_at is not null
       or v_workflow.operation_claim_token is not null
       or v_workflow.auth_delete_state is not null
       or v_workflow.auth_delete_intent_token is not null
       or v_workflow.auth_delete_target_user_id is not null
       or v_workflow.metadata ? 'auth_delete_checkpoint'
       or v_workflow.metadata ? 'core_inventory'
       or v_workflow.metadata ? 'repair_target_user_id'
       or v_workflow.metadata ->> 'auth_deleted' = 'true'
       or v_workflow.metadata ? 'pre_erasure_copy_gate'
     ) then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_IDENTITY_WORKFLOW_STATE_INVALID';
  end if;

  if exists (
    select 1
    from kc_private.account_erasure_ticket_identity_links link_row
    where link_row.request_id = v_dsr.id
       or (
         v_workflow_id is not null
         and link_row.workflow_id = v_workflow_id
       )
  ) then
    raise exception using
      errcode = '23514',
      message = 'ERASURE_IDENTITY_LINK_CONFLICT';
  end if;

  v_email_domain := pg_catalog.split_part(v_email, '@', 2);
  v_identity_assurance := pg_catalog.jsonb_build_object(
    'verified', true,
    'source', 'admin_verified_anonymous_erasure',
    'help_user_id', v_target_user_id,
    'target_user_id', v_target_user_id,
    'evidence', pg_catalog.jsonb_build_object(
      'channel', v_channel,
      'reference_hash', v_attestation_hash,
      'event_at', p_verified_at,
      'recorded_at', v_now,
      'recorded_by', p_actor_id
    )
  );

  update public.data_subject_requests request_row
  set user_id = v_target_user_id
  where request_row.id = v_dsr.id
    and (
      request_row.user_id is null
      or request_row.user_id = v_target_user_id
    )
  returning request_row.* into v_dsr;
  if not found then
    raise exception using
      errcode = '40001',
      message = 'ERASURE_IDENTITY_DSR_CHANGED';
  end if;

  insert into public.data_subject_request_events (
    request_id,
    actor_user_id,
    status,
    event_type,
    public_message
  ) values (
    v_dsr.id,
    p_actor_id,
    v_dsr.status,
    'status_changed',
    'Identidade validada; solicitacao vinculada a conta confirmada.'
  );

  update public.help_requests help_row
  set
    user_id = v_target_user_id,
    status = case
      when help_row.status in ('new', 'triaged') then 'in_progress'
      else help_row.status
    end,
    metadata = coalesce(help_row.metadata, '{}'::jsonb)
      || pg_catalog.jsonb_build_object(
        'request_kind', 'account_erasure',
        'protocol', v_dsr.protocol,
        'data_subject_request_id', v_dsr.id,
        'data_subject_request_status', v_dsr.status,
        'identity_source', 'admin_verified_anonymous_erasure',
        'account_email', v_email,
        'identity_verification_channel', v_channel,
        'identity_verified_at', p_verified_at,
        'identity_attestation_hash', v_attestation_hash,
        'identity_attestation_recorded', true
      )
  where help_row.id = p_help_request_id
    and (
      help_row.user_id is null
      or help_row.user_id = v_target_user_id
    )
  returning help_row.* into v_help;
  if not found then
    raise exception using
      errcode = '40001',
      message = 'ERASURE_IDENTITY_HELP_CHANGED';
  end if;

  if v_workflow_id is null then
    insert into public.account_erasure_requests (
      help_request_id,
      data_subject_request_id,
      user_id,
      email_hash,
      target_email_domain,
      status,
      processed_by,
      counts,
      receipt,
      metadata
    ) values (
      p_help_request_id,
      v_dsr.id,
      v_target_user_id,
      v_dsr.subject_hash,
      v_email_domain,
      'diagnosed',
      p_actor_id,
      '{}'::jsonb,
      '{}'::jsonb,
      pg_catalog.jsonb_build_object(
        'source', 'admin-help-requests',
        'request_kind', 'account_erasure',
        'identifier_source',
          'data_subject_request_opaque_subject_token',
        'subject_identifier_kind', 'dsr_opaque_random_v1',
        'legacy_without_data_subject_request', false,
        'identity_binding_source',
          'admin_verified_anonymous_erasure',
        'auth_user_found', true,
        'last_action', 'link_verified_identity',
        'identity_assurance', v_identity_assurance
      )
    )
    returning * into v_workflow;
    v_workflow_id := v_workflow.id;
  else
    update public.account_erasure_requests workflow_row
    set
      help_request_id = p_help_request_id,
      data_subject_request_id = v_dsr.id,
      user_id = v_target_user_id,
      email_hash = v_dsr.subject_hash,
      target_email_domain = v_email_domain,
      processed_by = p_actor_id,
      metadata = (
        workflow_row.metadata
        - 'identity_assurance'
      ) || pg_catalog.jsonb_build_object(
        'source', 'admin-help-requests',
        'request_kind', 'account_erasure',
        'identifier_source',
          'data_subject_request_opaque_subject_token',
        'subject_identifier_kind', 'dsr_opaque_random_v1',
        'legacy_without_data_subject_request', false,
        'identity_binding_source',
          'admin_verified_anonymous_erasure',
        'auth_user_found', true,
        'last_action', 'link_verified_identity',
        'identity_assurance', v_identity_assurance
      ),
      updated_at = v_now
    where workflow_row.id = v_workflow_id
      and workflow_row.status = 'diagnosed'
      and workflow_row.operation_claim_token is null
    returning workflow_row.* into v_workflow;
    if not found then
      raise exception using
        errcode = '40001',
        message = 'ERASURE_IDENTITY_WORKFLOW_CHANGED';
    end if;
  end if;

  insert into kc_private.account_erasure_ticket_identity_links (
    help_request_id,
    request_id,
    workflow_id,
    owner_user_id,
    actor_user_id,
    verification_channel,
    attestation_hash,
    verified_at,
    created_at
  ) values (
    p_help_request_id,
    v_dsr.id,
    v_workflow.id,
    v_target_user_id,
    p_actor_id,
    v_channel,
    v_attestation_hash,
    p_verified_at,
    v_now
  );

  insert into public.audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    payload
  ) values (
    p_actor_id,
    'lgpd_erasure_identity_linked',
    'account_erasure_requests',
    v_workflow.id,
    pg_catalog.jsonb_build_object(
      'subject_hash', v_dsr.subject_hash,
      'verification_channel', v_channel,
      'attestation_hash', v_attestation_hash,
      'identity_source', 'admin_verified_anonymous_erasure',
      'data_subject_request_status', v_dsr.status,
      'workflow_status', v_workflow.status
    )
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'linked', true,
    'idempotent', false,
    'protocol', v_dsr.protocol,
    'data_subject_request_status', v_dsr.status,
    'workflow_status', v_workflow.status,
    'identity_source', 'admin_verified_anonymous_erasure'
  );
exception
  when unique_violation then
    raise exception using
      errcode = '40001',
      message = 'ERASURE_IDENTITY_LINK_CONFLICT';
end;
$$;

revoke all on function
  public.kc_link_verified_help_request_to_account_erasure(
    uuid, text, uuid, uuid, text, text, timestamptz
  )
  from public, anon, authenticated;
grant execute on function
  public.kc_link_verified_help_request_to_account_erasure(
    uuid, text, uuid, uuid, text, text, timestamptz
  )
  to service_role;

comment on function
  public.kc_link_verified_help_request_to_account_erasure(
    uuid, text, uuid, uuid, text, text, timestamptz
  ) is
  'Service-only: vincula Help/DSR/workflow ao unico Auth verificado, sob sessao administrativa ativa e locks deterministas; recebe e persiste apenas hash contextual da evidencia.';

-- Um retry com a mesma chave deve recuperar inclusive o resultado terminal.
-- Sem este lookup anterior ao branch "open", account_erasure terminal chegava
-- ao INSERT da base e colidia para sempre no unique de idempotencia.
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
  v_idempotency_key text := pg_catalog.btrim(
    coalesce(p_idempotency_key, '')
  );
  v_requested_format text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_requested_format, 'json'))
  );
  v_request_source text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_request_source, 'settings'))
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
  if v_idempotency_key !~
       '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception using
      errcode = '22023',
      message = 'DSR_INVALID_IDEMPOTENCY_KEY';
  end if;
  if v_requested_format <> 'json' then
    raise exception using
      errcode = '22023',
      message = 'DSR_UNSUPPORTED_FORMAT';
  end if;
  if v_request_source not in ('settings', 'help', 'api') then
    raise exception using
      errcode = '22023',
      message = 'DSR_INVALID_SOURCE';
  end if;

  perform kc_private.kc_lock_privacy_subject(v_uid);

  select request_row.*
  into v_existing
  from public.data_subject_requests request_row
  where request_row.user_id = v_uid
    and request_row.request_kind = v_request_kind
    and request_row.idempotency_key = v_idempotency_key
  order by request_row.created_at desc, request_row.id desc
  limit 1
  for update;

  if found then
    return pg_catalog.jsonb_build_object(
      'request',
        pg_catalog.to_jsonb(v_existing)
          - 'user_id'
          - 'subject_hash'
          - 'idempotency_key',
      'reused_existing', true,
      'reuse_reason', 'idempotency_key'
    );
  end if;

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

  return kc_private.kc_create_data_subject_request_v2_20260728_base(
    v_request_kind,
    v_idempotency_key,
    v_requested_format,
    v_request_source
  );
end;
$$;

revoke all on function kc_private.kc_create_data_subject_request_v2(
  text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_create_data_subject_request_v2(
  text, text, text, text
) to authenticated;

comment on function kc_private.kc_create_data_subject_request_v2(
  text, text, text, text
) is
  'Recupera primeiro a mesma chave idempotente em qualquer status; somente uma nova chave pode reutilizar/criar o pedido aberto canonico.';

notify pgrst, 'reload schema';

commit;

-- Close browser-side workflow mutation and reconcile verified Help tickets with
-- the one canonical open export request enforced by the previous migration.

begin;

-- account_erasure_requests is an operational state machine. Browser admins may
-- inspect it, but every mutation must pass through the session-bound Edge/RPC
-- contract so claims, evidence, postconditions and receipts cannot be bypassed.
drop policy if exists account_erasure_requests_insert_admin
  on public.account_erasure_requests;
drop policy if exists account_erasure_requests_update_admin
  on public.account_erasure_requests;
drop policy if exists account_erasure_requests_select_admin
  on public.account_erasure_requests;

create policy account_erasure_requests_select_admin
  on public.account_erasure_requests
  for select
  to authenticated
  using (
    public.kc_is_current_session_active()
    and public.kc_is_admin((select auth.uid()))
  );

revoke all on table public.account_erasure_requests
  from public, anon, authenticated;
grant select on table public.account_erasure_requests
  to authenticated;
grant all on table public.account_erasure_requests
  to service_role;

comment on table public.account_erasure_requests is
  'Fluxo LGPD service-write-only. Administradores autenticados podem ler com sessao ativa; toda mutacao exige Edge/RPC com claim, evidencia e pos-condicoes.';

-- One canonical DSR may legitimately be referenced by more than one verified
-- Help ticket. Idempotency remains anchored by the Help primary key, while this
-- non-unique index keeps request-centric audits efficient.
alter table kc_private.data_export_ticket_identity_links
  drop constraint if exists data_export_ticket_identity_links_request_id_key;

create index if not exists data_export_ticket_identity_links_request_idx
  on kc_private.data_export_ticket_identity_links (request_id, created_at);

comment on table kc_private.data_export_ticket_identity_links is
  'Auditoria service-only de tickets anonimos verificados. Cada Help possui um vinculo imutavel; varios Helps podem apontar para a mesma DSR canonica.';

-- Roll the account-switch guard out additively. Editing the already-applied
-- supplement migration is not enough for existing projects, so keep its body as
-- a private base and make the current entry point reject before that body can
-- create either Help or DSR rows.
do $migration$
begin
  if pg_catalog.to_regprocedure(
    'kc_private.kc_create_help_request_with_notification_claim_v2_20260728_base(jsonb)'
  ) is null then
    execute $ddl$
      alter function
        kc_private.kc_create_help_request_with_notification_claim_v2(jsonb)
      rename to
        kc_create_help_request_with_notification_claim_v2_20260728_base
    $ddl$;
  end if;
end;
$migration$;

revoke all on function
  kc_private.kc_create_help_request_with_notification_claim_v2_20260728_base(
    jsonb
  )
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
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_expected_user_id text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_payload ->> 'expected_user_id', ''))
  );
begin
  if v_expected_user_id <> ''
     and (
       v_uid is null
       or v_expected_user_id <> pg_catalog.lower(v_uid::text)
     ) then
    raise exception using
      errcode = '42501',
      message = 'AUTH_ACCOUNT_CHANGED';
  end if;

  return query
  select *
  from
    kc_private.kc_create_help_request_with_notification_claim_v2_20260728_base(
      p_payload
    );
end;
$$;

revoke all on function
  kc_private.kc_create_help_request_with_notification_claim_v2(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  kc_private.kc_create_help_request_with_notification_claim_v2(jsonb)
  to anon, authenticated, service_role;

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
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_create_help_request_with_notification_claim_v2($1);
$$;

revoke all on function
  public.kc_create_help_request_with_notification_claim_v2(jsonb)
  from public;
grant execute on function
  public.kc_create_help_request_with_notification_claim_v2(jsonb)
  to anon, authenticated, service_role;

comment on function
  public.kc_create_help_request_with_notification_claim_v2(jsonb) is
  'Cria Help/DSR somente se expected_user_id ainda corresponder a auth.uid(), antes de qualquer gravacao.';

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
  v_email text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_account_email, ''))
  );
  v_request_kind text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_request_kind, ''))
  );
  v_channel text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_verification_channel, ''))
  );
  v_attestation_hash text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_attestation_sha256, ''))
  );
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
    raise exception using
      errcode = '42501',
      message = 'ADMIN_REQUIRED';
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
     or p_verified_at < pg_catalog.now() - interval '30 days'
     or p_verified_at > pg_catalog.now() + interval '5 minutes'
     or pg_catalog.jsonb_typeof(
       coalesce(p_processors, 'null'::jsonb)
     ) <> 'array'
     or pg_catalog.jsonb_array_length(p_processors) < 1
     or pg_catalog.jsonb_array_length(p_processors) > 32 then
    raise exception using
      errcode = '22023',
      message = 'EXPORT_TICKET_LINK_INPUT_INVALID';
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
       nullif(
         pg_catalog.lower(
           pg_catalog.btrim(
             coalesce(v_ticket.metadata ->> 'request_kind', '')
           )
         ),
         ''
       ) is not null
       and pg_catalog.lower(
         pg_catalog.btrim(v_ticket.metadata ->> 'request_kind')
       ) <> v_request_kind
     )
     or pg_catalog.lower(
       pg_catalog.btrim(coalesce(v_ticket.contact_email, ''))
     ) <> v_email
     or v_email !~
       '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception using
      errcode = '23514',
      message = 'EXPORT_TICKET_IDENTITY_NOT_VERIFIED';
  end if;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.min(user_row.id::text)::uuid
  into v_account_count, v_owner_user_id
  from auth.users user_row
  where pg_catalog.lower(
    pg_catalog.btrim(coalesce(user_row.email, ''))
  ) = v_email;
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
     or pg_catalog.lower(
       pg_catalog.btrim(coalesce(v_ticket.contact_email, ''))
     ) <> v_email
     or (
       v_ticket.user_id is not null
       and v_ticket.user_id <> v_owner_user_id
     )
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
       nullif(
         pg_catalog.lower(
           pg_catalog.btrim(
             coalesce(v_ticket.metadata ->> 'request_kind', '')
           )
         ),
         ''
       ) is not null
       and pg_catalog.lower(
         pg_catalog.btrim(v_ticket.metadata ->> 'request_kind')
       ) <> v_request_kind
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
      from kc_private.account_erasure_subject_closures closure_row
      where closure_row.subject_key_hash =
        kc_private.kc_privacy_subject_key(v_owner_user_id)
        and closure_row.state in ('closing', 'completed')
    ) or exists (
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

    -- The unique open-request index and the shared subject lock make this lookup
    -- deterministic even when Settings/API and Help arrive concurrently.
    select request_row.*
    into v_request
    from public.data_subject_requests request_row
    where request_row.user_id = v_owner_user_id
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
      v_reused := true;

      if v_request.status in ('received', 'failed') then
        update public.data_subject_requests request_row
        set status = 'processing'
        where request_row.id = v_request.id
          and request_row.status = v_request.status
        returning request_row.* into v_request;
        if not found then
          raise exception using
            errcode = '40001',
            message = 'DSR_CANONICAL_EXPORT_CHANGED';
        end if;

        insert into public.data_subject_request_events (
          request_id,
          actor_user_id,
          status,
          event_type,
          public_message
        ) values (
          v_request.id,
          p_actor_id,
          'processing',
          'status_changed',
          'Identidade validada; preparando o complemento integral.'
        );
      end if;

      if v_request.status in ('processing', 'ready') then
        update public.data_subject_requests request_row
        set
          status = 'partial_failure',
          expires_at = null
        where request_row.id = v_request.id
          and request_row.status = v_request.status
        returning request_row.* into v_request;
        if not found then
          raise exception using
            errcode = '40001',
            message = 'DSR_CANONICAL_EXPORT_CHANGED';
        end if;

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
          'status_changed',
          'Identidade validada; o complemento integral esta em atendimento.'
        );
      end if;

      if v_request.status <> 'partial_failure' then
        raise exception using
          errcode = '40001',
          message = 'DSR_CANONICAL_EXPORT_CHANGED';
      end if;
    else
      v_request_id := extensions.gen_random_uuid();
      v_protocol := 'KC-DSR-'
        || pg_catalog.to_char(
          pg_catalog.now() at time zone 'UTC',
          'YYYYMMDD'
        )
        || '-'
        || pg_catalog.upper(
          pg_catalog.substr(
            pg_catalog.replace(v_request_id::text, '-', ''),
            1,
            16
          )
        );
      v_scope := pg_catalog.jsonb_build_array(
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
        pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'),
        v_request_kind,
        'partial_failure',
        'verified-help:'
          || pg_catalog.replace(p_help_request_id::text, '-', ''),
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
    end if;

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

    -- Keep the Help that originally created the canonical request coherent when
    -- a later verified anonymous ticket turns it into an assisted supplement.
    if v_request.help_request_id is not null
       and v_request.help_request_id <> p_help_request_id then
      update public.help_requests help_row
      set
        status = case
          when help_row.status in ('new', 'waiting_user')
            then 'in_progress'
          else help_row.status
        end,
        metadata = coalesce(help_row.metadata, '{}'::jsonb)
          || pg_catalog.jsonb_build_object(
            'data_subject_request_status', v_request.status,
            'manual_supplement_required', true,
            'reused_existing_data_subject_request', true
          )
      where help_row.id = v_request.help_request_id;
    end if;

    update public.help_requests help_row
    set
      user_id = v_owner_user_id,
      status = 'in_progress',
      priority = case
        when help_row.priority in ('low', 'normal') then 'high'
        else help_row.priority
      end,
      metadata = coalesce(help_row.metadata, '{}'::jsonb)
        || pg_catalog.jsonb_build_object(
          'request_kind', v_request_kind,
          'protocol', v_request.protocol,
          'data_subject_request_id', v_request.id,
          'data_subject_request_status', v_request.status,
          'manual_supplement_required', true,
          'identity_source', 'admin_verified_anonymous_ticket',
          'identity_verification_channel', v_channel,
          'identity_verified_at', p_verified_at,
          'identity_attestation_recorded', true,
          'reused_existing_data_subject_request', v_reused
        )
    where help_row.id = p_help_request_id;

    v_artifact := kc_private.kc_enqueue_data_export_artifact(
      v_request.id,
      v_owner_user_id,
      p_processors
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'linked', true,
    'reused_existing', v_reused,
    'request',
      pg_catalog.to_jsonb(v_request)
        - 'user_id'
        - 'subject_hash'
        - 'idempotency_key',
    'artifact', v_artifact
  );
end;
$$;

revoke all on function
  kc_private.kc_link_verified_help_request_to_data_export(
    uuid, text, text, uuid, text, text, timestamptz, jsonb
  )
  from public, anon, authenticated, service_role;
grant execute on function
  kc_private.kc_link_verified_help_request_to_data_export(
    uuid, text, text, uuid, text, text, timestamptz, jsonb
  )
  to service_role;

revoke all on function
  public.kc_link_verified_help_request_to_data_export(
    uuid, text, text, uuid, text, text, timestamptz, jsonb
  )
  from public, anon, authenticated;
grant execute on function
  public.kc_link_verified_help_request_to_data_export(
    uuid, text, text, uuid, text, text, timestamptz, jsonb
  )
  to service_role;

comment on function public.kc_link_verified_help_request_to_data_export(
  uuid, text, text, uuid, text, text, timestamptz, jsonb
) is
  'Vincula Help verificado a DSR canonica aberta sob lock; nunca cria um segundo protocolo para o mesmo titular/direito.';

notify pgrst, 'reload schema';

commit;

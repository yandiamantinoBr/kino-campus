begin;

-- A triagem generica nao e a autoridade do fluxo de exclusao. Impede que um
-- cliente admin contorne o painel e feche o ticket antes do cancelamento formal
-- ou da entrega comprovada do recibo final. A RPC service-role de redacao segue
-- permitida porque ela remove PII antes da entrega e valida sua propria
-- pos-condicao estrutural.
create or replace function kc_private.kc_guard_account_erasure_help_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workflow public.account_erasure_requests%rowtype;
  v_is_erasure boolean;
  v_is_server_redaction boolean;
  v_is_server_retention_purge boolean;
begin
  if new.status not in ('resolved', 'archived')
     or old.status is not distinct from new.status then
    return new;
  end if;

  v_is_erasure :=
    pg_catalog.lower(pg_catalog.btrim(coalesce(old.metadata ->> 'request_kind', ''))) = 'account_erasure'
    or pg_catalog.lower(pg_catalog.btrim(coalesce(new.metadata ->> 'request_kind', ''))) = 'account_erasure'
    or (
      old.type = 'account_access'
      and old.topic = 'onboarding_settings'
      and old.subtopic = 'account_deletion'
    )
    or (
      new.type = 'account_access'
      and new.topic = 'onboarding_settings'
      and new.subtopic = 'account_deletion'
    )
    or exists (
      select 1
      from public.account_erasure_requests workflow_row
      where workflow_row.help_request_id = new.id
        and not (workflow_row.metadata ? 'superseded_by')
    );

  if not v_is_erasure then
    return new;
  end if;

  v_is_server_redaction :=
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    and new.status = 'resolved'
    and new.user_id is null
    and new.type = 'account_access'
    and new.topic = 'onboarding_settings'
    and new.subtopic = 'account_deletion'
    and new.subject = 'Solicitacao LGPD atendida'
    and new.message = 'Conteudo removido por solicitacao LGPD.'
    and new.priority = 'normal'
    and new.page_path is null
    and new.contact_email ~ '^lgpd-[a-f0-9]{12}@redacted[.]kinocampus[.]local$'
    and new.allow_contact is false
    and new.admin_status = 'na'
    and new.admin_decided_at is null
    and new.admin_decided_by is null
    and new.admin_note is null
    and new.metadata ->> 'request_kind' = 'account_erasure'
    and coalesce(new.metadata #>> '{lgpd_erasure,request_id}', '') ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and coalesce(new.metadata #>> '{lgpd_erasure,subject_hash}', '') ~ '^[a-f0-9]{64}$'
    and nullif(
      pg_catalog.btrim(coalesce(new.metadata #>> '{lgpd_erasure,erased_at}', '')),
      ''
    ) is not null
    and new.metadata #>> '{lgpd_erasure,contact_redacted}' = 'true'
    and new.metadata #>> '{lgpd_erasure,content_redacted}' = 'true'
    and new.metadata #>> '{lgpd_erasure,postcondition_version}' = '2'
    and (
      new.metadata - array['request_kind', 'lgpd_erasure']::text[]
    ) = '{}'::jsonb
    and (
      coalesce(new.metadata -> 'lgpd_erasure', '{}'::jsonb)
        - array[
          'request_id',
          'subject_hash',
          'erased_at',
          'contact_redacted',
          'content_redacted',
          'postcondition_version'
        ]::text[]
    ) = '{}'::jsonb;

  v_is_server_retention_purge :=
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    and new.status = 'archived'
    and new.user_id is null
    and new.subtopic is null
    and new.subject = 'Solicitacao de titular expurgada'
    and new.message = 'Registro detalhado removido conforme a politica de retencao.'
    and new.page_path is null
    and new.contact_email ~
      '^purged-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}@invalid[.]local$'
    and new.allow_contact is false
    and new.admin_status = 'na'
    and new.admin_decided_at is null
    and new.admin_decided_by is null
    and new.admin_note is null
    and new.metadata ->> 'record_state' = 'retention_purged'
    and nullif(
      pg_catalog.btrim(coalesce(new.metadata ->> 'retention_purged_at', '')),
      ''
    ) is not null
    and (
      new.metadata - array['record_state', 'retention_purged_at']::text[]
    ) = '{}'::jsonb;

  if v_is_server_redaction or v_is_server_retention_purge then
    return new;
  end if;

  -- The owner-cancellation RPC commits the DSR terminal state before it archives
  -- Help and synchronizes the erasure workflow. Treat that DSR state as the
  -- formal cancellation authority during this short, transactional ordering.
  if exists (
    select 1
    from public.data_subject_requests request_row
    where request_row.request_kind = 'account_erasure'
      and request_row.status in ('cancelled', 'expired')
      and request_row.help_request_id = new.id
  ) then
    return new;
  end if;

  select workflow_row.*
  into v_workflow
  from public.account_erasure_requests workflow_row
  where not (workflow_row.metadata ? 'superseded_by')
    and (
      workflow_row.help_request_id = new.id
      or workflow_row.id::text = coalesce(
        nullif(new.metadata #>> '{lgpd_erasure,request_id}', ''),
        nullif(old.metadata #>> '{lgpd_erasure,request_id}', ''),
        ''
      )
      or workflow_row.data_subject_request_id::text = coalesce(
        nullif(new.metadata ->> 'data_subject_request_id', ''),
        nullif(old.metadata ->> 'data_subject_request_id', ''),
        ''
      )
    )
  order by
    (workflow_row.help_request_id = new.id) desc,
    workflow_row.created_at desc,
    workflow_row.id desc
  limit 1;

  if found and (
    v_workflow.status = 'cancelled'
    or (
      v_workflow.status = 'erased'
      and v_workflow.metadata ->> 'notification_pending' = 'false'
      and v_workflow.metadata ->> 'retryable' = 'false'
      and nullif(
        pg_catalog.btrim(coalesce(v_workflow.metadata ->> 'failure_stage', '')),
        ''
      ) is null
      and v_workflow.metadata ->> 'completion_email_status' in ('sent', 'sent_manual')
    )
  ) then
    return new;
  end if;

  raise exception using
    errcode = '23514',
    message = 'ERASURE_HELP_MUST_REMAIN_OPEN';
end;
$$;

revoke all on function kc_private.kc_guard_account_erasure_help_status()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_guard_account_erasure_help_status
  on public.help_requests;
create trigger trg_guard_account_erasure_help_status
before update of status on public.help_requests
for each row
execute function kc_private.kc_guard_account_erasure_help_status();

comment on function kc_private.kc_guard_account_erasure_help_status() is
  'Bloqueia fechamento administrativo de ticket de exclusao ate cancelamento formal ou comprovante final entregue; preserva somente a redacao service-role validada.';

commit;

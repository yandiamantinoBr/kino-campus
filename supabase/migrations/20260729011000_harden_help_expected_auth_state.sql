-- Bind every Help submission to the authentication state observed by the
-- browser before the request starts. This closes the guest -> account race in
-- which auth.uid() could appear between form composition and the RPC insert.

begin;

do $migration$
begin
  if pg_catalog.to_regprocedure(
    'kc_private.kc_help_request_v2_20260729_auth_base(jsonb)'
  ) is null then
    execute $ddl$
      alter function
        kc_private.kc_create_help_request_with_notification_claim_v2(jsonb)
      rename to
        kc_help_request_v2_20260729_auth_base
    $ddl$;
  end if;
end;
$migration$;

revoke all on function
  kc_private.kc_help_request_v2_20260729_auth_base(
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
  v_is_anonymous boolean :=
    pg_catalog.lower(coalesce(auth.jwt() ->> 'is_anonymous', 'false')) = 'true';
  v_expected_auth_state text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_payload ->> 'expected_auth_state', ''))
  );
  v_expected_user_id text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_payload ->> 'expected_user_id', ''))
  );
  v_created record;
begin
  if v_expected_auth_state not in ('', 'anonymous', 'authenticated') then
    raise exception using
      errcode = '22023',
      message = 'EXPECTED_AUTH_STATE_INVALID';
  end if;

  -- Compatibility for already-published authenticated clients: their previous
  -- contract sent expected_user_id but did not yet send expected_auth_state.
  if v_expected_auth_state = '' and v_expected_user_id <> '' then
    v_expected_auth_state := 'authenticated';
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
    if not kc_private.kc_is_current_session_active() then
      raise exception using
        errcode = '42501',
        message = 'AUTH_SESSION_NOT_ACTIVE';
    end if;
  elsif v_expected_auth_state = 'anonymous' then
    if v_expected_user_id <> ''
       or (v_uid is not null and not v_is_anonymous) then
      raise exception using
        errcode = '42501',
        message = 'AUTH_ACCOUNT_CHANGED';
    end if;
  else
    -- A legacy request with neither expectation is safe only while it remains
    -- anonymous. If an account appeared, reject before the base function can
    -- create either the Help row or a privacy workflow.
    if v_uid is not null and not v_is_anonymous then
      raise exception using
        errcode = '42501',
        message = 'AUTH_ACCOUNT_CHANGED';
    end if;
    v_expected_auth_state := 'anonymous';
  end if;

  select *
    into strict v_created
  from
    kc_private.kc_help_request_v2_20260729_auth_base(
      p_payload
    );

  if v_expected_auth_state = 'anonymous' then
    -- Supabase anonymous users can have auth.uid(). A Help request submitted
    -- under the anonymous contract must nevertheless remain unowned until
    -- explicit identity verification links it through the audited workflow.
    update public.help_requests help_row
    set user_id = null
    where help_row.id = v_created.out_id
      and help_row.user_id is not null;
  end if;

  out_id := v_created.out_id;
  out_created_at := v_created.out_created_at;
  out_notification_claim := v_created.out_notification_claim;
  out_notification_claim_expires_at :=
    v_created.out_notification_claim_expires_at;
  out_data_subject_request := v_created.out_data_subject_request;
  out_protocol := v_created.out_protocol;
  out_reused_existing := v_created.out_reused_existing;
  return next;
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
  'Cria Help/DSR somente se expected_auth_state e expected_user_id ainda corresponderem ao contexto Auth atual, antes de qualquer gravacao.';

commit;

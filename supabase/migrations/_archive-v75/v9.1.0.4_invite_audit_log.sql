-- v9.1.0.4 — Registrar ações de convites no audit_log
-- kc_admin_revoke_invite agora grava invite_revoked no audit_log.
-- Edge Function kc-invite-user grava invite_sent diretamente (service_role).

begin;

-- Recriar com audit_log insert
create or replace function public.kc_admin_revoke_invite(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
begin
  if not exists (
    select 1 from public.profiles where id = v_admin_id and is_admin = true
  ) then
    raise exception 'UNAUTHORIZED';
  end if;

  delete from public.kc_invited_emails
  where lower(trim(email)) = lower(trim(p_email));

  -- Registrar revogação no audit_log
  insert into public.audit_log (action, entity_type, entity_id, actor_id, payload)
  values (
    'invite_revoked',
    'invites',
    lower(trim(p_email)),
    v_admin_id,
    jsonb_build_object('email', lower(trim(p_email)))
  );

  return jsonb_build_object('ok', true, 'email', lower(trim(p_email)));
end;
$$;

comment on function public.kc_admin_revoke_invite(text) is
  'Revoga convite de usuário externo e registra invite_revoked no audit_log.';

commit;

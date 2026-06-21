-- Kino Campus — V8.2.9.1
-- Hardening de moderação/admin e denúncias via RPC (security definer)
-- Objetivo:
--   - Garantir operações de moderação para admins sem depender de combinações frágeis de RLS no client.
--   - Tornar o registro de denúncias mais resiliente via função centralizada.

begin;

create or replace function public.kc_is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = p_user_id
       and p.is_admin = true
  );
$$;

revoke all on function public.kc_is_admin(uuid) from public;
grant execute on function public.kc_is_admin(uuid) to authenticated, service_role;

create or replace function public.kc_admin_set_post_status(
  p_post_id uuid,
  p_status text,
  p_close_reports boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_status text;
  v_post_exists boolean;
  v_updated integer := 0;
  v_closed integer := 0;
begin
  v_uid := auth.uid();
  v_status := lower(trim(coalesce(p_status, '')));

  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Faça login para moderar.');
  end if;

  if not public.kc_is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas administradores podem moderar posts.');
  end if;

  if v_status not in ('published', 'pending', 'hidden', 'deleted') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Status de moderação inválido.');
  end if;

  select exists(select 1 from public.posts where id = p_post_id) into v_post_exists;
  if not v_post_exists then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Post não encontrado.');
  end if;

  update public.posts
     set status = v_status
   where id = p_post_id;

  get diagnostics v_updated = row_count;

  if p_close_reports then
    update public.reports
       set status = 'closed'
     where post_id = p_post_id
       and status = 'open';

    get diagnostics v_closed = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'updated_posts', v_updated,
    'closed_reports', v_closed,
    'post_id', p_post_id,
    'status', v_status
  );
end;
$$;

revoke all on function public.kc_admin_set_post_status(uuid, text, boolean) from public;
grant execute on function public.kc_admin_set_post_status(uuid, text, boolean) to authenticated, service_role;

create or replace function public.kc_admin_close_reports(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_closed integer := 0;
begin
  v_uid := auth.uid();

  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Faça login para moderar denúncias.');
  end if;

  if not public.kc_is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas administradores podem fechar denúncias.');
  end if;

  update public.reports
     set status = 'closed'
   where post_id = p_post_id
     and status = 'open';

  get diagnostics v_closed = row_count;

  return jsonb_build_object(
    'ok', true,
    'closed_reports', v_closed,
    'post_id', p_post_id
  );
end;
$$;

revoke all on function public.kc_admin_close_reports(uuid) from public;
grant execute on function public.kc_admin_close_reports(uuid) to authenticated, service_role;

create or replace function public.kc_report_post(
  p_post_id uuid,
  p_reason text,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_reason text;
  v_details text;
  v_report_id uuid;
begin
  v_uid := auth.uid();
  v_reason := lower(trim(coalesce(p_reason, '')));
  v_details := nullif(left(trim(coalesce(p_details, '')), 1000), '');

  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Faça login para denunciar.');
  end if;

  if v_reason not in ('spam', 'scam', 'inappropriate', 'hate', 'illegal', 'duplicate', 'other') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REASON', 'message', 'Selecione um motivo válido.');
  end if;

  if not exists (select 1 from public.posts where id = p_post_id) then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Post não encontrado para denúncia.');
  end if;

  begin
    insert into public.reports (post_id, reporter_id, reason, details, status)
    values (p_post_id, v_uid, v_reason, v_details, 'open')
    returning id into v_report_id;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'code', 'ALREADY_REPORTED', 'message', 'Você já denunciou este post.');
  end;

  return jsonb_build_object('ok', true, 'id', v_report_id, 'post_id', p_post_id);
end;
$$;

revoke all on function public.kc_report_post(uuid, text, text) from public;
grant execute on function public.kc_report_post(uuid, text, text) to authenticated, service_role;

commit;

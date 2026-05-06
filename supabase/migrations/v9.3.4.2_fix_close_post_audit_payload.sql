-- KinoCampus v9.3.4.2
-- Fix owner close-post audit logging against the canonical audit_log.payload column.

begin;

create or replace function public.kc_close_post(
  p_post_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_post record;
  v_reason text := nullif(left(trim(coalesce(p_reason, 'owner_closed')), 80), '');
  v_closed_at timestamptz := now();
begin
  v_uid := auth.uid();
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Faca login para encerrar a publicacao.');
  end if;

  select id, author_id, status
    into v_post
    from public.posts
   where id = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Publicacao nao encontrada.');
  end if;

  if v_post.author_id is distinct from v_uid then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas o dono pode encerrar esta publicacao.');
  end if;

  if v_post.status = 'closed' then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_CLOSED', 'status', 'closed', 'new_status', 'closed', 'message', 'Publicacao ja encerrada.');
  end if;

  if v_post.status not in ('published', 'hidden', 'expired') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Esta publicacao nao pode ser encerrada neste status.');
  end if;

  update public.posts
     set status = 'closed',
         updated_at = v_closed_at,
         metadata = jsonb_set(
           jsonb_set(
             jsonb_set(coalesce(metadata, '{}'::jsonb), '{closed_at}', to_jsonb(v_closed_at::text), true),
             '{closed_by}', to_jsonb(v_uid::text), true
           ),
           '{closed_reason}', to_jsonb(coalesce(v_reason, 'owner_closed')), true
         )
   where id = p_post_id;

  begin
    perform public.audit_log_insert(
      'post_closed',
      'posts',
      p_post_id,
      jsonb_build_object('source', 'owner', 'reason', coalesce(v_reason, 'owner_closed')),
      v_uid
    );
  exception
    when undefined_table then null;
    when undefined_function then null;
    when insufficient_privilege then null;
  end;

  return jsonb_build_object(
    'ok', true,
    'status', 'closed',
    'new_status', 'closed',
    'closed_at', v_closed_at,
    'message', 'Publicacao encerrada.'
  );
end;
$$;

revoke execute on function public.kc_close_post(uuid, text) from public, anon;
grant execute on function public.kc_close_post(uuid, text) to authenticated, service_role;

commit;

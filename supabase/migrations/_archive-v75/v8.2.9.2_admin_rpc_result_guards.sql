-- Kino Campus — V8.2.9.2
-- Guard rails para RPCs de moderação/admin:
-- - Não retornar sucesso quando UPDATE não afeta linhas.

begin;

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

  if v_updated = 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'UPDATE_NOT_APPLIED',
      'message', 'A atualização não foi aplicada. Verifique políticas RLS/roles no projeto Supabase.',
      'post_id', p_post_id,
      'status', v_status
    );
  end if;

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

commit;

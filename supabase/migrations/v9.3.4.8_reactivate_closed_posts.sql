begin;

create schema if not exists kc_private;

create or replace function kc_private.kc_reactivate_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_post record;
  v_now timestamptz := now();
  v_expires_at timestamptz;
  v_limit int := 5;
  v_count bigint := 0;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'AUTH_REQUIRED',
      'message', U&'Fa\00E7a login para reativar a publica\00E7\00E3o.'
    );
  end if;

  set local row_security = off;

  select id, author_id, status, module, expires_at
    into v_post
    from public.posts
   where id = p_post_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'POST_NOT_FOUND',
      'message', U&'Publica\00E7\00E3o n\00E3o encontrada.'
    );
  end if;

  if v_post.author_id is distinct from v_uid then
    return jsonb_build_object(
      'ok', false,
      'code', 'FORBIDDEN',
      'message', U&'Apenas o dono pode reativar esta publica\00E7\00E3o.'
    );
  end if;

  if v_post.status = 'published' then
    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_ACTIVE',
      'status', 'published',
      'new_status', 'published',
      'expires_at', v_post.expires_at,
      'message', U&'Publica\00E7\00E3o j\00E1 est\00E1 ativa.'
    );
  end if;

  if v_post.status <> 'closed' then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_STATUS',
      'message', U&'Apenas publica\00E7\00F5es encerradas podem ser reativadas.'
    );
  end if;

  select max_active
    into v_limit
    from public.post_limits
   where (user_id = v_uid or user_id is null)
     and (module is not distinct from v_post.module or module is null)
   order by case
     when user_id = v_uid and module is not distinct from v_post.module then 1
     when user_id = v_uid and module is null then 2
     when user_id is null and module is not distinct from v_post.module then 3
     when user_id is null and module is null then 4
     else 5
   end
   limit 1;

  v_limit := coalesce(v_limit, 5);

  select count(*)
    into v_count
    from public.posts
   where author_id = v_uid
     and status = 'published'
     and (v_post.module is null or module = v_post.module);

  if v_count >= v_limit then
    return jsonb_build_object(
      'ok', false,
      'code', 'LIMIT_REACHED',
      'message', U&'Voc\00EA j\00E1 tem o m\00E1ximo de publica\00E7\00F5es ativas (' || v_limit || U&'). Desabilite ou encerre outra publica\00E7\00E3o antes de reativar esta.',
      'limit', v_limit,
      'count', v_count,
      'module', v_post.module
    );
  end if;

  v_expires_at := case
    when v_post.expires_at is not null and v_post.expires_at > v_now then v_post.expires_at
    else v_now + interval '30 days'
  end;

  update public.posts
     set status = 'published',
         expires_at = v_expires_at,
         updated_at = v_now,
         metadata = jsonb_set(
           jsonb_set(
             jsonb_set(
               coalesce(metadata, '{}'::jsonb) - 'closed_at' - 'closed_by' - 'closed_reason',
               '{reactivated_at}', to_jsonb(v_now::text), true
             ),
             '{reactivated_by}', to_jsonb(v_uid::text), true
           ),
           '{reactivated_from}', to_jsonb('closed'::text), true
         )
   where id = p_post_id;

  begin
    perform public.audit_log_insert(
      'post_reactivated',
      'posts',
      p_post_id,
      jsonb_build_object(
        'old_status', 'closed',
        'new_status', 'published',
        'expires_at', v_expires_at,
        'source', 'owner_reactivate'
      ),
      v_uid
    );
  exception
    when undefined_table then null;
    when undefined_function then null;
    when insufficient_privilege then null;
  end;

  return jsonb_build_object(
    'ok', true,
    'status', 'published',
    'new_status', 'published',
    'expires_at', v_expires_at,
    'message', U&'Publica\00E7\00E3o reativada com sucesso.'
  );
end;
$$;

create or replace function public.kc_reactivate_post(p_post_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select kc_private.kc_reactivate_post($1)
$$;

revoke execute on function public.kc_reactivate_post(uuid) from public, anon;
revoke execute on function kc_private.kc_reactivate_post(uuid) from public, anon;
grant execute on function public.kc_reactivate_post(uuid) to authenticated, service_role;
grant execute on function kc_private.kc_reactivate_post(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

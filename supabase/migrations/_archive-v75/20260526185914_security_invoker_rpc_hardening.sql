-- KinoCampus security hardening.
--
-- Supabase Security Advisor lint 0029 flags SECURITY DEFINER functions in
-- exposed schemas when they are executable by the authenticated role. These
-- RPCs still need to be callable from the browser, so the public entrypoints
-- run as SECURITY INVOKER and rely on the existing RLS/admin policies. The
-- only privileged operation kept behind SECURITY DEFINER is audit-log writing,
-- moved to kc_private so it is not exposed as /rest/v1/rpc.

begin;

create schema if not exists kc_private;

revoke all on schema kc_private from public, anon;
grant usage on schema kc_private to authenticated, service_role;

create or replace function kc_private.kc_insert_audit_log(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb default '{}'::jsonb,
  p_actor_id uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(coalesce(p_action, '')), '') is null
     or nullif(btrim(coalesce(p_entity_type, '')), '') is null then
    return;
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (
    p_actor_id,
    left(lower(btrim(p_action)), 120),
    left(lower(btrim(p_entity_type)), 120),
    p_entity_id,
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

revoke all on function kc_private.kc_insert_audit_log(text, text, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function kc_private.kc_insert_audit_log(text, text, uuid, jsonb, uuid) to authenticated, service_role;

create or replace function public.kc_get_post_flood_limit(
  p_user_id uuid,
  p_module text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_is_admin boolean := false;
  v_target_user uuid := coalesce(p_user_id, v_uid);
  v_module text := nullif(btrim(p_module), '');
  v_limit record;
begin
  if v_uid is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;

  v_is_admin := v_role = 'service_role' or public.kc_is_admin(v_uid);
  if v_target_user is distinct from v_uid and not coalesce(v_is_admin, false) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  select pfl.max_posts, pfl.window_minutes, pfl.user_id, pfl.module
    into v_limit
    from public.post_flood_limits pfl
   where (pfl.user_id = v_target_user or pfl.user_id is null)
     and (pfl.module is not distinct from v_module or pfl.module is null)
   order by
     case
       when pfl.user_id = v_target_user and pfl.module is not distinct from v_module then 1
       when pfl.user_id = v_target_user and pfl.module is null then 2
       when pfl.user_id is null and pfl.module is not distinct from v_module then 3
       when pfl.user_id is null and pfl.module is null then 4
       else 5
     end
   limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'max_posts', v_limit.max_posts,
      'window_minutes', v_limit.window_minutes,
      'user_id', v_limit.user_id,
      'module', v_limit.module,
      'source',
        case
          when v_limit.user_id is not null and v_limit.module is not null then 'user_module'
          when v_limit.user_id is not null then 'user'
          when v_limit.module is not null then 'module'
          else 'global'
        end
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'max_posts', 3,
    'window_minutes', 60,
    'user_id', null,
    'module', null,
    'source', 'fallback'
  );
end;
$$;

create or replace function public.kc_check_post_flood_limit(
  p_user_id uuid,
  p_module text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_is_admin boolean := false;
  v_target_user uuid := coalesce(p_user_id, v_uid);
  v_limit jsonb;
  v_max_posts int;
  v_window_minutes int;
  v_count bigint;
  v_reset_at timestamptz;
  v_module text := nullif(btrim(p_module), '');
begin
  if v_uid is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;

  v_is_admin := v_role = 'service_role' or public.kc_is_admin(v_uid);
  if v_target_user is distinct from v_uid and not coalesce(v_is_admin, false) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  v_limit := public.kc_get_post_flood_limit(v_target_user, v_module);
  if coalesce(v_limit->>'ok', 'false') <> 'true' then
    return v_limit;
  end if;

  v_max_posts := coalesce((v_limit->>'max_posts')::int, 3);
  v_window_minutes := coalesce((v_limit->>'window_minutes')::int, 60);

  select count(*)
    into v_count
    from public.posts p
   where p.author_id = v_target_user
     and p.created_at > now() - make_interval(mins => greatest(1, v_window_minutes))
     and (v_module is null or p.module = v_module);

  select min(p.created_at) + make_interval(mins => v_window_minutes)
    into v_reset_at
    from public.posts p
   where p.author_id = v_target_user
     and p.created_at > now() - make_interval(mins => greatest(1, v_window_minutes))
     and (v_module is null or p.module = v_module);

  return jsonb_build_object(
    'ok', v_count < v_max_posts,
    'limit', v_max_posts,
    'max_posts', v_max_posts,
    'count', v_count,
    'remaining', greatest(0, v_max_posts - v_count),
    'window_minutes', v_window_minutes,
    'reset_at', v_reset_at,
    'module', v_module,
    'source', v_limit->>'source'
  );
end;
$$;

create or replace function public.kc_admin_get_post_flood_limits()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_limits jsonb;
begin
  if v_admin_id is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;

  if v_role <> 'service_role' and not public.kc_is_admin(v_admin_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  select jsonb_agg(
           jsonb_build_object(
             'id', pfl.id,
             'user_id', pfl.user_id,
             'module', pfl.module,
             'max_posts', pfl.max_posts,
             'window_minutes', pfl.window_minutes,
             'created_at', pfl.created_at,
             'updated_at', pfl.updated_at,
             'user_name', coalesce(p.display_name, p.full_name, '-')
           )
           order by pfl.user_id nulls first, pfl.module nulls first, pfl.window_minutes
         )
    into v_limits
    from public.post_flood_limits pfl
    left join public.profiles p on p.id = pfl.user_id;

  return jsonb_build_object('ok', true, 'limits', coalesce(v_limits, '[]'::jsonb));
end;
$$;

create or replace function public.kc_admin_set_post_flood_limit(
  p_user_id uuid default null,
  p_module text default null,
  p_max_posts integer default 3,
  p_window_minutes integer default 60
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_module text := nullif(btrim(p_module), '');
  v_rows_updated int;
  v_limit_id uuid;
begin
  if v_admin_id is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Autenticacao necessaria.');
  end if;

  if v_role <> 'service_role' and not public.kc_is_admin(v_admin_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas administradores podem configurar limites.');
  end if;

  if p_max_posts < 0 or p_max_posts > 1000 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_VALUE', 'message', 'Limite deve estar entre 0 e 1000.');
  end if;

  if p_window_minutes < 1 or p_window_minutes > 10080 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_WINDOW', 'message', 'Janela deve estar entre 1 minuto e 7 dias.');
  end if;

  update public.post_flood_limits
     set max_posts = p_max_posts,
         window_minutes = p_window_minutes,
         updated_at = now(),
         created_by = v_admin_id
   where ((p_user_id is null and user_id is null) or user_id = p_user_id)
     and ((v_module is null and module is null) or module = v_module)
   returning id into v_limit_id;

  get diagnostics v_rows_updated = row_count;

  if v_rows_updated = 0 then
    insert into public.post_flood_limits (user_id, module, max_posts, window_minutes, created_by)
    values (p_user_id, v_module, p_max_posts, p_window_minutes, v_admin_id)
    returning id into v_limit_id;
  end if;

  perform kc_private.kc_insert_audit_log(
    'post_flood_limit_changed',
    'post_flood_limits',
    v_limit_id,
    jsonb_build_object(
      'user_id', p_user_id,
      'module', v_module,
      'max_posts', p_max_posts,
      'window_minutes', p_window_minutes
    ),
    v_admin_id
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'Limite de ritmo configurado com sucesso.',
    'id', v_limit_id,
    'user_id', p_user_id,
    'module', v_module,
    'max_posts', p_max_posts,
    'window_minutes', p_window_minutes
  );
end;
$$;

create or replace function public.kc_admin_delete_post_flood_limit(p_limit_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_deleted record;
begin
  if v_admin_id is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;

  if v_role <> 'service_role' and not public.kc_is_admin(v_admin_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  delete from public.post_flood_limits
   where id = p_limit_id
   returning * into v_deleted;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Limite de ritmo nao encontrado.');
  end if;

  perform kc_private.kc_insert_audit_log(
    'post_flood_limit_deleted',
    'post_flood_limits',
    v_deleted.id,
    jsonb_build_object(
      'user_id', v_deleted.user_id,
      'module', v_deleted.module,
      'max_posts', v_deleted.max_posts,
      'window_minutes', v_deleted.window_minutes
    ),
    v_admin_id
  );

  return jsonb_build_object('ok', true, 'code', 'OK', 'message', 'Limite de ritmo removido.');
end;
$$;

create or replace function public.kc_admin_list_audit_logs(
  p_entity_type text default 'all',
  p_action text default 'all',
  p_actor_query text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_since timestamptz default null
)
returns table(
  id uuid,
  created_at timestamptz,
  action text,
  entity_type text,
  entity_id text,
  actor_id uuid,
  payload jsonb
)
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_entity text := lower(coalesce(p_entity_type, 'all'));
  v_action text := lower(coalesce(p_action, 'all'));
  v_actor_query text := lower(nullif(trim(coalesce(p_actor_query, '')), ''));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_role <> 'service_role' and (v_uid is null or not public.kc_is_admin(v_uid)) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select a.id,
         a.created_at,
         a.action,
         a.entity_type,
         a.entity_id::text,
         a.actor_id,
         a.payload
    from public.audit_log a
    left join public.profiles pr on pr.id = a.actor_id
   where (v_entity = 'all' or lower(a.entity_type) = v_entity)
     and (v_action = 'all' or lower(a.action) = v_action)
     and (
       v_actor_query is null
       or cast(a.actor_id as text) ilike '%' || v_actor_query || '%'
       or lower(coalesce(pr.display_name, '')) like '%' || v_actor_query || '%'
       or lower(coalesce(pr.full_name, '')) like '%' || v_actor_query || '%'
     )
     and (p_since is null or a.created_at >= p_since)
   order by a.created_at desc
   offset v_offset
   limit greatest(1, least(coalesce(p_limit, 50), 500));
end;
$$;

create or replace function public.kc_admin_set_post_status(
  p_post_id uuid,
  p_status text,
  p_close_reports boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  v_uid uuid;
  v_role text := coalesce(auth.role(), '');
  v_status text;
  v_post record;
  v_updated integer := 0;
  v_closed integer := 0;
  v_now timestamptz := now();
begin
  v_uid := auth.uid();
  if v_uid is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Faca login para moderar.');
  end if;

  if v_role <> 'service_role' and not public.kc_is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas administradores podem moderar posts.');
  end if;

  v_status := lower(trim(coalesce(p_status, '')));
  if v_status not in ('published', 'pending', 'hidden', 'deleted', 'expired', 'closed') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Status de moderacao invalido: ' || coalesce(v_status, '(vazio)'));
  end if;

  select id, author_id, status, module
    into v_post
    from public.posts
   where id = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Post nao encontrado: ' || coalesce(p_post_id::text, '(null)'));
  end if;

  update public.posts
     set status = v_status,
         moderation_reason = case when v_status = 'published' then null else moderation_reason end,
         updated_at = v_now,
         metadata = case
           when v_status = 'closed' then
             jsonb_set(
               jsonb_set(
                 jsonb_set(coalesce(metadata, '{}'::jsonb), '{closed_at}', to_jsonb(v_now::text), true),
                 '{closed_by}', to_jsonb(coalesce(v_uid::text, 'service_role')), true
               ),
               '{closed_reason}', to_jsonb('admin_closed'::text), true
             )
           else metadata
         end
   where id = p_post_id;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return jsonb_build_object('ok', false, 'code', 'UPDATE_NOT_APPLIED', 'message', 'O UPDATE nao afetou nenhuma linha.', 'post_id', p_post_id, 'status', v_status);
  end if;

  if p_close_reports then
    update public.reports
       set status = 'closed'
     where post_id = p_post_id
       and status = 'open';
    get diagnostics v_closed = row_count;
  end if;

  perform kc_private.kc_insert_audit_log(
    'post_admin_status_changed',
    'posts',
    p_post_id,
    jsonb_build_object(
      'old_status', v_post.status,
      'new_status', v_status,
      'post_author_id', v_post.author_id,
      'post_module', v_post.module,
      'closed_reports', v_closed
    ),
    v_uid
  );

  return jsonb_build_object('ok', true, 'code', 'OK', 'updated_posts', v_updated, 'closed_reports', v_closed, 'post_id', p_post_id, 'status', v_status);
end;
$$;

create or replace function public.kc_record_post_audit_event(
  p_post_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  v_uid uuid;
  v_role text := coalesce(auth.role(), '');
  v_post record;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_allowed boolean := false;
  v_is_admin boolean := false;
begin
  v_uid := auth.uid();
  if v_uid is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Faca login para registrar auditoria.');
  end if;

  if v_action not in ('post_edited', 'post_renewed', 'post_bumped', 'post_admin_action') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ACTION', 'message', 'Acao de auditoria invalida.');
  end if;

  select id, author_id, status, module, title
    into v_post
    from public.posts
   where id = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Post nao encontrado.');
  end if;

  v_is_admin := v_role = 'service_role' or public.kc_is_admin(v_uid);
  v_allowed := v_is_admin or v_post.author_id is not distinct from v_uid;
  if not v_allowed then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Sem permissao para registrar este evento.');
  end if;

  perform kc_private.kc_insert_audit_log(
    v_action,
    'posts',
    p_post_id,
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
      'source', case when v_is_admin and v_post.author_id is distinct from v_uid then 'admin_product_page' else 'owner_product_page' end,
      'post_status', v_post.status,
      'post_module', v_post.module,
      'post_author_id', v_post.author_id
    ),
    v_uid
  );

  return jsonb_build_object('ok', true, 'code', 'OK');
end;
$$;

create or replace function public.kc_bump_post(p_post_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  v_user_id uuid;
  v_role text := coalesce(auth.role(), '');
  v_post record;
  v_cooldown_days int := 7;
  v_next_bump_at timestamptz;
  v_bumped_at timestamptz := now();
  v_is_admin boolean := false;
  v_is_admin_override boolean := false;
begin
  v_user_id := auth.uid();
  if v_user_id is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Autenticacao necessaria.');
  end if;

  select id, author_id, status, bumped_at
    into v_post
    from public.posts
   where id = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Publicacao nao encontrada.');
  end if;

  v_is_admin := v_role = 'service_role' or public.kc_is_admin(v_user_id);
  v_is_admin_override := v_is_admin and v_post.author_id is distinct from v_user_id;

  if v_post.author_id is distinct from v_user_id and not v_is_admin then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas o autor ou administradores podem impulsionar esta publicacao.');
  end if;

  if v_post.status <> 'published' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Apenas publicacoes ativas podem ser impulsionadas.');
  end if;

  if not v_is_admin_override and v_post.bumped_at is not null and v_post.bumped_at > now() - (v_cooldown_days || ' days')::interval then
    v_next_bump_at := v_post.bumped_at + (v_cooldown_days || ' days')::interval;
    return jsonb_build_object(
      'ok', false,
      'code', 'COOLDOWN_ACTIVE',
      'message', 'Publicacao impulsionada recentemente.',
      'next_bump_at', v_next_bump_at,
      'cooldown_days', v_cooldown_days
    );
  end if;

  update public.posts
     set bumped_at = v_bumped_at,
         updated_at = v_bumped_at
   where id = p_post_id;

  perform kc_private.kc_insert_audit_log(
    'post_bumped',
    'posts',
    p_post_id,
    jsonb_build_object(
      'bumped_at', v_bumped_at,
      'source', case when v_is_admin_override then 'admin_bump' else 'user_bump' end,
      'post_author_id', v_post.author_id
    ),
    v_user_id
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'bumped_at', v_bumped_at,
    'next_bump_at', v_bumped_at + (v_cooldown_days || ' days')::interval,
    'message', 'Publicacao impulsionada com sucesso.'
  );
end;
$$;

create or replace function public.kc_close_post(
  p_post_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  v_uid uuid;
  v_role text := coalesce(auth.role(), '');
  v_post record;
  v_reason text;
  v_closed_at timestamptz := now();
  v_is_admin boolean := false;
  v_is_admin_override boolean := false;
begin
  v_uid := auth.uid();
  if v_uid is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Faca login para encerrar a publicacao.');
  end if;

  select id, author_id, status
    into v_post
    from public.posts
   where id = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Publicacao nao encontrada.');
  end if;

  v_is_admin := v_role = 'service_role' or public.kc_is_admin(v_uid);
  v_is_admin_override := v_is_admin and v_post.author_id is distinct from v_uid;
  v_reason := nullif(left(trim(coalesce(p_reason, case when v_is_admin_override then 'admin_closed' else 'owner_closed' end)), 80), '');

  if v_post.author_id is distinct from v_uid and not v_is_admin then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas o dono ou administradores podem encerrar esta publicacao.');
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
             '{closed_by}', to_jsonb(coalesce(v_uid::text, 'service_role')), true
           ),
           '{closed_reason}', to_jsonb(coalesce(v_reason, case when v_is_admin_override then 'admin_closed' else 'owner_closed' end)),
           true
         )
   where id = p_post_id;

  perform kc_private.kc_insert_audit_log(
    'post_closed',
    'posts',
    p_post_id,
    jsonb_build_object(
      'source', case when v_is_admin_override then 'admin' else 'owner' end,
      'reason', coalesce(v_reason, case when v_is_admin_override then 'admin_closed' else 'owner_closed' end),
      'post_author_id', v_post.author_id
    ),
    v_uid
  );

  return jsonb_build_object('ok', true, 'status', 'closed', 'new_status', 'closed', 'closed_at', v_closed_at, 'message', 'Publicacao encerrada.');
end;
$$;

create or replace function public.kc_renew_post(p_post_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  v_user_id uuid;
  v_role text := coalesce(auth.role(), '');
  v_post record;
  v_check jsonb;
  v_expires_at timestamptz;
  v_days int;
  v_is_admin boolean := false;
  v_is_admin_override boolean := false;
begin
  v_user_id := auth.uid();
  if v_user_id is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Autenticacao necessaria.');
  end if;

  select id, author_id, status, module
    into v_post
    from public.posts
   where id = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Publicacao nao encontrada.');
  end if;

  v_is_admin := v_role = 'service_role' or public.kc_is_admin(v_user_id);
  v_is_admin_override := v_is_admin and v_post.author_id is distinct from v_user_id;

  if v_post.author_id is distinct from v_user_id and not v_is_admin then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas o autor ou administradores podem renovar esta publicacao.');
  end if;

  if v_post.status not in ('expired', 'hidden') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Apenas publicacoes expiradas ou desabilitadas podem ser renovadas (status atual: ' || v_post.status || ').');
  end if;

  if not v_is_admin_override then
    v_check := public.kc_check_post_limit(v_post.author_id, v_post.module);
    if not (v_check->>'ok')::boolean then
      return jsonb_build_object(
        'ok', false,
        'code', 'LIMIT_REACHED',
        'message', 'Limite de publicacoes ativas atingido.',
        'limit', (v_check->>'limit')::int,
        'count', (v_check->>'count')::int,
        'module', v_post.module
      );
    end if;
  end if;

  v_days := case when v_post.module = 'caronas' then 7 else 30 end;
  v_expires_at := now() + (v_days || ' days')::interval;

  update public.posts
     set status = 'published',
         expires_at = v_expires_at,
         updated_at = now()
   where id = p_post_id;

  perform kc_private.kc_insert_audit_log(
    'post_renewed',
    'posts',
    p_post_id,
    jsonb_build_object(
      'old_status', v_post.status,
      'new_status', 'published',
      'expires_at', v_expires_at,
      'source', case when v_is_admin_override then 'admin_renew' else 'user_renew' end,
      'post_author_id', v_post.author_id
    ),
    v_user_id
  );

  return jsonb_build_object('ok', true, 'code', 'OK', 'new_status', 'published', 'expires_at', v_expires_at, 'message', 'Publicacao renovada com sucesso.');
end;
$$;

create or replace function public.kc_toggle_post_status(p_post_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  v_user_id uuid;
  v_role text := coalesce(auth.role(), '');
  v_post record;
  v_new_status text;
  v_check jsonb;
  v_expires_at timestamptz;
  v_days int;
  v_is_admin boolean := false;
  v_is_admin_override boolean := false;
begin
  v_user_id := auth.uid();
  if v_user_id is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Autenticacao necessaria para alterar o status da publicacao.');
  end if;

  select id, author_id, status, module, expires_at
    into v_post
    from public.posts
   where id = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Publicacao nao encontrada.');
  end if;

  v_is_admin := v_role = 'service_role' or public.kc_is_admin(v_user_id);
  v_is_admin_override := v_is_admin and v_post.author_id is distinct from v_user_id;

  if v_post.author_id is distinct from v_user_id and not v_is_admin then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas o autor ou administradores podem alterar o status desta publicacao.');
  end if;

  if v_post.status = 'expired' then
    return jsonb_build_object('ok', false, 'code', 'USE_RENEW', 'message', 'Esta publicacao esta expirada. Use Renovar publicacao para reativa-la.');
  end if;

  if v_post.status not in ('published', 'hidden') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Esta publicacao esta em um estado que nao permite ativacao/desativacao (status: ' || v_post.status || ').');
  end if;

  if v_post.status = 'published' then
    v_new_status := 'hidden';
  else
    if not v_is_admin_override then
      v_check := public.kc_check_post_limit(v_post.author_id, v_post.module);
      if not (v_check->>'ok')::boolean then
        return jsonb_build_object(
          'ok', false,
          'code', 'LIMIT_REACHED',
          'message', 'Limite de publicacoes ativas atingido.',
          'limit', (v_check->>'limit')::int,
          'count', (v_check->>'count')::int,
          'module', v_post.module
        );
      end if;
    end if;
    v_new_status := 'published';
    v_days := case when v_post.module = 'caronas' then 7 else 30 end;
    v_expires_at := now() + (v_days || ' days')::interval;
  end if;

  update public.posts
     set status = v_new_status,
         expires_at = case when v_new_status = 'published' then v_expires_at else v_post.expires_at end,
         updated_at = now()
   where id = p_post_id;

  perform kc_private.kc_insert_audit_log(
    'post_status_changed',
    'posts',
    p_post_id,
    jsonb_build_object(
      'old_status', v_post.status,
      'new_status', v_new_status,
      'source', case when v_is_admin_override then 'admin_toggle' else 'user_toggle' end,
      'post_author_id', v_post.author_id
    ),
    v_user_id
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'new_status', v_new_status,
    'expires_at', case when v_new_status = 'published' then v_expires_at else null end,
    'message', case when v_new_status = 'hidden' then 'Publicacao desabilitada.' else 'Publicacao reativada.' end
  );
end;
$$;

revoke all on function public.kc_get_post_flood_limit(uuid, text) from public, anon;
revoke all on function public.kc_check_post_flood_limit(uuid, text) from public, anon;
revoke all on function public.kc_admin_get_post_flood_limits() from public, anon;
revoke all on function public.kc_admin_set_post_flood_limit(uuid, text, integer, integer) from public, anon;
revoke all on function public.kc_admin_delete_post_flood_limit(uuid) from public, anon;
revoke all on function public.kc_admin_list_audit_logs(text, text, text, integer, integer, timestamptz) from public, anon;
revoke all on function public.kc_admin_set_post_status(uuid, text, boolean) from public, anon;
revoke all on function public.kc_record_post_audit_event(uuid, text, jsonb) from public, anon;
revoke all on function public.kc_bump_post(uuid) from public, anon;
revoke all on function public.kc_close_post(uuid, text) from public, anon;
revoke all on function public.kc_renew_post(uuid) from public, anon;
revoke all on function public.kc_toggle_post_status(uuid) from public, anon;

grant execute on function public.kc_get_post_flood_limit(uuid, text) to authenticated, service_role;
grant execute on function public.kc_check_post_flood_limit(uuid, text) to authenticated, service_role;
grant execute on function public.kc_admin_get_post_flood_limits() to authenticated, service_role;
grant execute on function public.kc_admin_set_post_flood_limit(uuid, text, integer, integer) to authenticated, service_role;
grant execute on function public.kc_admin_delete_post_flood_limit(uuid) to authenticated, service_role;
grant execute on function public.kc_admin_list_audit_logs(text, text, text, integer, integer, timestamptz) to authenticated, service_role;
grant execute on function public.kc_admin_set_post_status(uuid, text, boolean) to authenticated, service_role;
grant execute on function public.kc_record_post_audit_event(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.kc_bump_post(uuid) to authenticated, service_role;
grant execute on function public.kc_close_post(uuid, text) to authenticated, service_role;
grant execute on function public.kc_renew_post(uuid) to authenticated, service_role;
grant execute on function public.kc_toggle_post_status(uuid) to authenticated, service_role;

commit;

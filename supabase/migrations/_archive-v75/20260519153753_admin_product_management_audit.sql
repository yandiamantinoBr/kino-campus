-- KinoCampus - admin product management and audit hardening
--
-- Allows admins to use the product detail management actions without relying on
-- frontend owner impersonation. Every server-side mutation keeps the real
-- actor_id and writes an explicit audit source.

begin;

create or replace function public.kc_record_post_audit_event(
  p_post_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_post record;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_allowed boolean := false;
  v_is_admin boolean := false;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Faca login para registrar auditoria.');
  end if;

  if v_action not in ('post_edited', 'post_renewed', 'post_bumped', 'post_admin_action') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ACTION', 'message', 'Acao de auditoria invalida.');
  end if;

  set local row_security = off;

  select id, author_id, status, module, title
    into v_post
    from public.posts
   where id = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Post nao encontrado.');
  end if;

  v_is_admin := public.kc_is_admin(v_uid);
  v_allowed := v_is_admin or v_post.author_id is not distinct from v_uid;
  if not v_allowed then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Sem permissao para registrar este evento.');
  end if;

  perform public.audit_log_insert(
    v_action,
    'posts',
    p_post_id,
    coalesce(p_payload, '{}'::jsonb)
      || jsonb_build_object(
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

revoke all on function public.kc_record_post_audit_event(uuid, text, jsonb) from public, anon;
grant execute on function public.kc_record_post_audit_event(uuid, text, jsonb) to authenticated, service_role;

drop policy if exists post_media_insert_admin on public.post_media;
create policy post_media_insert_admin
  on public.post_media
  for insert
  to authenticated
  with check (public.kc_is_admin((select auth.uid())));

drop policy if exists post_media_update_admin on public.post_media;
create policy post_media_update_admin
  on public.post_media
  for update
  to authenticated
  using (public.kc_is_admin((select auth.uid())))
  with check (public.kc_is_admin((select auth.uid())));

drop policy if exists post_media_delete_admin on public.post_media;
create policy post_media_delete_admin
  on public.post_media
  for delete
  to authenticated
  using (public.kc_is_admin((select auth.uid())));

create or replace function public.kc_admin_list_audit_logs(
  p_entity_type text default 'all',
  p_action text default 'all',
  p_actor_query text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_since timestamptz default null
)
returns table (
  id uuid,
  created_at timestamptz,
  action text,
  entity_type text,
  entity_id text,
  actor_id uuid,
  payload jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_entity text := lower(coalesce(p_entity_type, 'all'));
  v_action text := lower(coalesce(p_action, 'all'));
  v_actor_query text := lower(nullif(trim(coalesce(p_actor_query, '')), ''));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_uid is null or not public.kc_is_admin(v_uid) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    a.id,
    a.created_at,
    a.action,
    a.entity_type,
    a.entity_id::text,
    a.actor_id,
    a.payload
  from public.audit_log a
  left join public.profiles pr
    on pr.id = a.actor_id
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

revoke all on function public.kc_admin_list_audit_logs(text, text, text, integer, integer, timestamptz) from public;
grant execute on function public.kc_admin_list_audit_logs(text, text, text, integer, integer, timestamptz) to authenticated, service_role;

create or replace function public.kc_renew_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_post record;
  v_check jsonb;
  v_expires_at timestamptz;
  v_days int;
  v_is_admin boolean := false;
  v_is_admin_override boolean := false;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Autenticacao necessaria.');
  end if;

  set local row_security = off;

  select id, author_id, status, module
    into v_post
    from public.posts
   where id = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Publicacao nao encontrada.');
  end if;

  v_is_admin := public.kc_is_admin(v_user_id);
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

  begin
    perform public.audit_log_insert(
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
  exception when others then null;
  end;

  return jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'new_status', 'published',
    'expires_at', v_expires_at,
    'message', 'Publicacao renovada com sucesso.'
  );
end;
$$;

grant execute on function public.kc_renew_post(uuid) to authenticated, service_role;

create or replace function public.kc_bump_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_post record;
  v_cooldown_days int := 7;
  v_next_bump_at timestamptz;
  v_bumped_at timestamptz := now();
  v_is_admin boolean := false;
  v_is_admin_override boolean := false;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Autenticacao necessaria.');
  end if;

  set local row_security = off;

  select id, author_id, status, bumped_at
    into v_post
    from public.posts
   where id = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Publicacao nao encontrada.');
  end if;

  v_is_admin := public.kc_is_admin(v_user_id);
  v_is_admin_override := v_is_admin and v_post.author_id is distinct from v_user_id;

  if v_post.author_id is distinct from v_user_id and not v_is_admin then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas o autor ou administradores podem impulsionar esta publicacao.');
  end if;

  if v_post.status <> 'published' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Apenas publicacoes ativas podem ser impulsionadas.');
  end if;

  if not v_is_admin_override
     and v_post.bumped_at is not null
     and v_post.bumped_at > now() - (v_cooldown_days || ' days')::interval then
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

  begin
    perform public.audit_log_insert(
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
  exception when others then null;
  end;

  return jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'bumped_at', v_bumped_at,
    'next_bump_at', v_bumped_at + (v_cooldown_days || ' days')::interval,
    'message', 'Publicacao impulsionada com sucesso.'
  );
end;
$$;

grant execute on function public.kc_bump_post(uuid) to authenticated, service_role;

create or replace function public.kc_toggle_post_status(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_post record;
  v_new_status text;
  v_check jsonb;
  v_expires_at timestamptz;
  v_days int;
  v_is_admin boolean := false;
  v_is_admin_override boolean := false;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Autenticacao necessaria para alterar o status da publicacao.');
  end if;

  set local row_security = off;

  select id, author_id, status, module, expires_at
    into v_post
    from public.posts
   where id = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Publicacao nao encontrada.');
  end if;

  v_is_admin := public.kc_is_admin(v_user_id);
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

  begin
    perform public.audit_log_insert(
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
  exception when others then null;
  end;

  return jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'new_status', v_new_status,
    'expires_at', case when v_new_status = 'published' then v_expires_at else null end,
    'message', case when v_new_status = 'hidden' then 'Publicacao desabilitada.' else 'Publicacao reativada.' end
  );
end;
$$;

grant execute on function public.kc_toggle_post_status(uuid) to authenticated, service_role;

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
  v_reason text;
  v_closed_at timestamptz := now();
  v_is_admin boolean := false;
  v_is_admin_override boolean := false;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Faca login para encerrar a publicacao.');
  end if;

  set local row_security = off;

  select id, author_id, status
    into v_post
    from public.posts
   where id = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Publicacao nao encontrada.');
  end if;

  v_is_admin := public.kc_is_admin(v_uid);
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
             '{closed_by}', to_jsonb(v_uid::text), true
           ),
           '{closed_reason}', to_jsonb(coalesce(v_reason, case when v_is_admin_override then 'admin_closed' else 'owner_closed' end)), true
         )
   where id = p_post_id;

  begin
    perform public.audit_log_insert(
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

revoke all on function public.kc_close_post(uuid, text) from public, anon;
grant execute on function public.kc_close_post(uuid, text) to authenticated, service_role;

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
  v_is_admin boolean := false;
  v_is_admin_override boolean := false;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Faca login para reativar a publicacao.');
  end if;

  set local row_security = off;

  select id, author_id, status, module, expires_at
    into v_post
    from public.posts
   where id = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Publicacao nao encontrada.');
  end if;

  v_is_admin := public.kc_is_admin(v_uid);
  v_is_admin_override := v_is_admin and v_post.author_id is distinct from v_uid;

  if v_post.author_id is distinct from v_uid and not v_is_admin then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas o dono ou administradores podem reativar esta publicacao.');
  end if;

  if v_post.status = 'published' then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_ACTIVE', 'status', 'published', 'new_status', 'published', 'expires_at', v_post.expires_at, 'message', 'Publicacao ja esta ativa.');
  end if;

  if v_post.status <> 'closed' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Apenas publicacoes encerradas podem ser reativadas.');
  end if;

  if not v_is_admin_override then
    select max_active
      into v_limit
      from public.post_limits
     where (user_id = v_post.author_id or user_id is null)
       and (module is not distinct from v_post.module or module is null)
     order by case
       when user_id = v_post.author_id and module is not distinct from v_post.module then 1
       when user_id = v_post.author_id and module is null then 2
       when user_id is null and module is not distinct from v_post.module then 3
       when user_id is null and module is null then 4
       else 5
     end
     limit 1;

    v_limit := coalesce(v_limit, 5);

    select count(*)
      into v_count
      from public.posts
     where author_id = v_post.author_id
       and status = 'published'
       and (v_post.module is null or module = v_post.module);

    if v_count >= v_limit then
      return jsonb_build_object(
        'ok', false,
        'code', 'LIMIT_REACHED',
        'message', 'Limite de publicacoes ativas atingido.',
        'limit', v_limit,
        'count', v_count,
        'module', v_post.module
      );
    end if;
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
        'source', case when v_is_admin_override then 'admin_reactivate' else 'owner_reactivate' end,
        'post_author_id', v_post.author_id
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
    'message', 'Publicacao reativada com sucesso.'
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

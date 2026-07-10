-- Reconcile helpers that exist in production but were omitted from the local
-- baseline, and repair RPC bodies that still reference removed columns or
-- extension functions through an invalid search path.

begin;

create schema if not exists kc_private;
revoke all on schema kc_private from public;
grant usage on schema kc_private to anon, authenticated, service_role;

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

create or replace function kc_private.kc_resolve_post_flood_limit(
  p_user_id uuid,
  p_module text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_module text := nullif(btrim(p_module), '');
  v_limit record;
begin
  select pfl.max_posts, pfl.window_minutes, pfl.user_id, pfl.module
    into v_limit
    from public.post_flood_limits pfl
   where (pfl.user_id = p_user_id or pfl.user_id is null)
     and (pfl.module is not distinct from v_module or pfl.module is null)
   order by
     case
       when pfl.user_id = p_user_id and pfl.module is not distinct from v_module then 1
       when pfl.user_id = p_user_id and pfl.module is null then 2
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

create or replace function kc_private.kc_compute_post_flood_check(
  p_user_id uuid,
  p_module text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_module text := nullif(btrim(p_module), '');
  v_limit jsonb;
  v_max_posts int;
  v_window_minutes int;
  v_window_start timestamptz;
  v_manual_reset_at timestamptz;
  v_effective_since timestamptz;
  v_count bigint;
  v_reset_at timestamptz;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_USER', 'message', 'Usuario invalido para limite de ritmo.');
  end if;

  v_limit := kc_private.kc_resolve_post_flood_limit(p_user_id, v_module);
  v_max_posts := coalesce((v_limit->>'max_posts')::int, 3);
  v_window_minutes := greatest(1, coalesce((v_limit->>'window_minutes')::int, 60));
  v_window_start := now() - make_interval(mins => v_window_minutes);

  select max(fr.reset_at)
    into v_manual_reset_at
    from public.post_flood_resets fr
   where fr.user_id = p_user_id
     and (fr.module is not distinct from v_module or fr.module is null)
     and fr.reset_at >= v_window_start
     and (fr.expires_at is null or fr.expires_at > now());

  v_effective_since := greatest(v_window_start, coalesce(v_manual_reset_at, v_window_start));

  select count(*)
    into v_count
    from public.posts p
   where p.author_id = p_user_id
     and p.created_at > v_effective_since
     and (v_module is null or p.module = v_module);

  select min(p.created_at) + make_interval(mins => v_window_minutes)
    into v_reset_at
    from public.posts p
   where p.author_id = p_user_id
     and p.created_at > v_effective_since
     and (v_module is null or p.module = v_module);

  return jsonb_build_object(
    'ok', v_count < v_max_posts,
    'limit', v_max_posts,
    'max_posts', v_max_posts,
    'count', v_count,
    'remaining', greatest(0, v_max_posts - v_count),
    'window_minutes', v_window_minutes,
    'reset_at', v_reset_at,
    'manual_reset_at', v_manual_reset_at,
    'effective_since', v_effective_since,
    'module', v_module,
    'source', v_limit->>'source'
  );
end;
$$;

create or replace function kc_private.kc_chat_is_new_user(p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select created_at from auth.users where id = p_user_id) > now() - interval '7 days',
    true
  )
$$;

create or replace function kc_private.kc_check_duplicate_post(
  p_user_id uuid,
  p_module text,
  p_title text,
  p_threshold double precision default 0.45
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_candidates jsonb;
  v_threshold double precision := greatest(0.1, least(coalesce(p_threshold, 0.45), 1.0));
begin
  if v_caller_id is null or v_caller_id != p_user_id then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null then
    return jsonb_build_object('ok', true, 'candidates', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(to_jsonb(candidate) order by candidate.similarity desc), '[]'::jsonb)
    into v_candidates
    from (
      select p.id,
             p.title,
             p.status,
             p.module,
             p.created_at,
             round(extensions.similarity(p.title, p_title)::numeric, 2) as similarity
        from public.posts p
       where p.author_id = p_user_id
         and p.module = p_module
         and p.status in ('published', 'hidden', 'expired')
         and extensions.similarity(p.title, p_title) >= v_threshold
       order by extensions.similarity(p.title, p_title) desc
       limit 20
    ) candidate;

  return jsonb_build_object('ok', true, 'candidates', v_candidates);
end;
$$;

create or replace function public.kc_check_duplicate_post(
  p_user_id uuid,
  p_module text,
  p_title text,
  p_threshold double precision default 0.45
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select kc_private.kc_check_duplicate_post($1, $2, $3, $4)
$$;

create or replace function kc_private.kc_admin_list_posts_by_ids(p_ids uuid[])
returns table (id uuid, title text, status text, author_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
begin
  if v_role <> 'service_role' and (v_uid is null or not public.kc_is_admin(v_uid)) then
    raise exception 'FORBIDDEN';
  end if;

  if p_ids is null or cardinality(p_ids) = 0 then
    return;
  end if;

  return query
  select p.id,
         coalesce(p.title, 'Post sem titulo') as title,
         coalesce(p.status, 'indisponivel') as status,
         p.author_id
    from public.posts p
   where p.id = any(p_ids)
   limit 500;
end;
$$;

create or replace function public.kc_admin_list_posts_by_ids(p_ids uuid[])
returns table (id uuid, title text, status text, author_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from kc_private.kc_admin_list_posts_by_ids($1)
$$;

create or replace function kc_private.kc_admin_search_posts_full(
  p_query text default null,
  p_status text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  legacy_id text,
  title text,
  content text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  author_id uuid,
  author_name text,
  module text,
  category text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_query text := nullif(trim(coalesce(p_query, '')), '');
  v_status text := nullif(trim(coalesce(p_status, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_role <> 'service_role' and (v_uid is null or not public.kc_is_admin(v_uid)) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select p.id,
         p.legacy_id,
         coalesce(p.title, 'Post sem titulo') as title,
         coalesce(p.description, '') as content,
         coalesce(p.status, 'pending') as status,
         p.created_at,
         coalesce(p.updated_at, p.created_at) as updated_at,
         p.author_id,
         coalesce(pr.display_name, pr.full_name, 'Usuario') as author_name,
         coalesce(p.module, '') as module,
         coalesce(p.category, '') as category,
         count(*) over() as total_count
    from public.posts p
    left join public.profiles pr on pr.id = p.author_id
   where (v_status is null or p.status = v_status)
     and (
       v_query is null
       or coalesce(p.title, '') ilike '%' || v_query || '%'
       or coalesce(p.description, '') ilike '%' || v_query || '%'
       or coalesce(p.legacy_id, '') ilike '%' || v_query || '%'
       or p.id::text ilike '%' || v_query || '%'
       or coalesce(pr.display_name, '') ilike '%' || v_query || '%'
       or coalesce(pr.full_name, '') ilike '%' || v_query || '%'
     )
   order by p.created_at desc
   limit v_limit
   offset v_offset;
end;
$$;

create or replace function public.kc_admin_search_posts_full(
  p_query text default null,
  p_status text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  legacy_id text,
  title text,
  content text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  author_id uuid,
  author_name text,
  module text,
  category text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from kc_private.kc_admin_search_posts_full($1, $2, $3, $4)
$$;

create or replace function kc_private.kc_admin_revoke_invite(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_deleted integer := 0;
begin
  if v_role <> 'service_role' and (v_admin_id is null or not public.kc_is_admin(v_admin_id)) then
    raise exception 'UNAUTHORIZED';
  end if;

  if v_email = '' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_EMAIL');
  end if;

  delete from public.kc_invited_emails
   where lower(trim(email)) = v_email;
  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    perform kc_private.kc_insert_audit_log(
      'invite_revoked',
      'invites',
      gen_random_uuid(),
      jsonb_build_object('email', v_email, 'deleted_count', v_deleted),
      v_admin_id
    );
  end if;

  return jsonb_build_object('ok', true, 'email', v_email, 'deleted_count', v_deleted);
end;
$$;

create or replace function public.kc_admin_revoke_invite(p_email text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select kc_private.kc_admin_revoke_invite($1)
$$;

create or replace function public.notify_admin_if_reports_threshold(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open_count integer;
  v_function_url text;
  v_function_auth_token text;
  v_hmac_secret text;
  v_timestamp text;
  v_body jsonb;
  v_signature text;
begin
  if p_post_id is null then
    return;
  end if;

  select count(*)
    into v_open_count
    from public.reports
   where post_id = p_post_id
     and status = 'open';

  if v_open_count < 3 then
    return;
  end if;

  v_function_url := nullif(current_setting('app.settings.kc_notify_function_url', true), '');
  v_function_auth_token := nullif(current_setting('app.settings.kc_notify_function_auth_token', true), '');
  v_hmac_secret := nullif(current_setting('app.settings.kc_notify_hmac_secret', true), '');

  if v_function_url is null or v_function_auth_token is null or v_hmac_secret is null then
    return;
  end if;

  v_body := jsonb_build_object('post_id', p_post_id);
  v_timestamp := floor(extract(epoch from now()))::bigint::text;
  v_signature := encode(
    extensions.hmac(v_timestamp || '.' || p_post_id::text, v_hmac_secret, 'sha256'),
    'hex'
  );

  perform net.http_post(
    url := v_function_url,
    body := v_body,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_function_auth_token,
      'x-kc-source', 'reports-trigger',
      'x-kc-post-id', p_post_id::text,
      'x-kc-timestamp', v_timestamp,
      'x-kc-signature', v_signature
    )
  );
end;
$$;

revoke all on function kc_private.kc_insert_audit_log(text, text, uuid, jsonb, uuid)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_insert_audit_log(text, text, uuid, jsonb, uuid)
  to authenticated, service_role;

revoke all on function kc_private.kc_resolve_post_flood_limit(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function kc_private.kc_compute_post_flood_check(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_resolve_post_flood_limit(uuid, text)
  to authenticated, service_role;
grant execute on function kc_private.kc_compute_post_flood_check(uuid, text)
  to authenticated, service_role;

revoke all on function kc_private.kc_chat_is_new_user(uuid)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_chat_is_new_user(uuid) to authenticated;

revoke all on function kc_private.kc_check_duplicate_post(uuid, text, text, double precision)
  from public, anon, authenticated, service_role;
revoke all on function public.kc_check_duplicate_post(uuid, text, text, double precision)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_check_duplicate_post(uuid, text, text, double precision)
  to authenticated, service_role;
grant execute on function public.kc_check_duplicate_post(uuid, text, text, double precision)
  to authenticated, service_role;

revoke all on function kc_private.kc_admin_list_posts_by_ids(uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.kc_admin_list_posts_by_ids(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_admin_list_posts_by_ids(uuid[])
  to authenticated, service_role;
grant execute on function public.kc_admin_list_posts_by_ids(uuid[])
  to authenticated, service_role;

revoke all on function kc_private.kc_admin_search_posts_full(text, text, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.kc_admin_search_posts_full(text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_admin_search_posts_full(text, text, integer, integer)
  to authenticated, service_role;
grant execute on function public.kc_admin_search_posts_full(text, text, integer, integer)
  to authenticated, service_role;

revoke all on function kc_private.kc_admin_revoke_invite(text)
  from public, anon, authenticated, service_role;
revoke all on function public.kc_admin_revoke_invite(text)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_admin_revoke_invite(text)
  to authenticated, service_role;
grant execute on function public.kc_admin_revoke_invite(text)
  to authenticated, service_role;

revoke all on function public.notify_admin_if_reports_threshold(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.notify_admin_if_reports_threshold(uuid) to service_role;

commit;

-- Finalize the moderation admin surface:
--   * make post-limit writes atomic and deterministic;
--   * restore the private external-access listing worker omitted from the
--     consolidated active baseline;
--   * keep SECURITY DEFINER logic outside the exposed public schema;
--   * preserve stable ordering for paged external-access history.

begin;

create schema if not exists kc_private;
revoke all on schema kc_private from public;
grant usage on schema kc_private to anon, authenticated, service_role;

-- Prevent an admin write from landing between normalization/deduplication and
-- unique-index creation. Reads remain available while this short migration
-- lock is held.
lock table public.post_limits in share row exclusive mode;

drop index if exists public.post_limits_unique_scope_idx;

-- Normalize historical module scopes before enforcing one row per logical
-- scope. New writes already use the same btrim/null normalization.
update public.post_limits
set module = nullif(btrim(module), '')
where module is distinct from nullif(btrim(module), '');

-- Keep the most recently updated row if historical concurrent writes produced
-- duplicate scopes. The deterministic tie-breaker makes rebuilds repeatable.
with ranked_scopes as (
  select
    limit_row.id,
    row_number() over (
      partition by limit_row.user_id, limit_row.module
      order by
        limit_row.updated_at desc,
        limit_row.created_at desc,
        limit_row.id desc
    ) as scope_rank
  from public.post_limits as limit_row
)
delete from public.post_limits as duplicate
using ranked_scopes
where duplicate.id = ranked_scopes.id
  and ranked_scopes.scope_rank > 1;

create unique index post_limits_unique_scope_idx
  on public.post_limits (user_id, module) nulls not distinct;

create or replace function kc_private.kc_admin_get_post_limits()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_limits jsonb;
begin
  if v_role <> 'service_role'
     and (v_admin_id is null or not public.kc_is_admin(v_admin_id)) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', limit_row.id,
      'user_id', limit_row.user_id,
      'module', limit_row.module,
      'max_active', limit_row.max_active,
      'created_at', limit_row.created_at,
      'updated_at', limit_row.updated_at,
      'user_name', coalesce(profile_row.display_name, profile_row.full_name, '—')
    )
    order by
      limit_row.user_id nulls first,
      limit_row.module nulls first,
      limit_row.updated_at desc,
      limit_row.id desc
  )
  into v_limits
  from public.post_limits as limit_row
  left join public.profiles as profile_row
    on profile_row.id = limit_row.user_id;

  return jsonb_build_object(
    'ok', true,
    'limits', coalesce(v_limits, '[]'::jsonb)
  );
end;
$$;

create or replace function public.kc_admin_get_post_limits()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select kc_private.kc_admin_get_post_limits()
$$;

create or replace function kc_private.kc_admin_set_post_limit(
  p_user_id uuid default null,
  p_module text default null,
  p_max_active integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_module text := nullif(btrim(p_module), '');
  v_limit_id uuid;
begin
  if v_role <> 'service_role'
     and (v_admin_id is null or not public.kc_is_admin(v_admin_id)) then
    return jsonb_build_object(
      'ok', false,
      'code', case when v_admin_id is null then 'AUTH_REQUIRED' else 'FORBIDDEN' end,
      'message', 'Apenas administradores podem configurar limites.'
    );
  end if;

  if p_max_active is null or p_max_active < 0 or p_max_active > 1000 then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_VALUE',
      'message', 'Limite deve estar entre 0 e 1000.'
    );
  end if;

  insert into public.post_limits (
    user_id,
    module,
    max_active,
    created_by
  )
  values (
    p_user_id,
    v_module,
    p_max_active,
    v_admin_id
  )
  on conflict (user_id, module)
  do update set
    max_active = excluded.max_active,
    updated_at = now(),
    created_by = excluded.created_by
  returning id into v_limit_id;

  perform kc_private.kc_insert_audit_log(
    'post_limit_changed',
    'post_limits',
    v_limit_id,
    jsonb_build_object(
      'user_id', p_user_id,
      'module', v_module,
      'max_active', p_max_active
    ),
    v_admin_id
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'Limite configurado com sucesso.',
    'id', v_limit_id,
    'user_id', p_user_id,
    'module', v_module,
    'max_active', p_max_active
  );
end;
$$;

create or replace function public.kc_admin_set_post_limit(
  p_user_id uuid default null,
  p_module text default null,
  p_max_active integer default 5
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select kc_private.kc_admin_set_post_limit($1, $2, $3)
$$;

create or replace function kc_private.kc_admin_delete_post_limit(
  p_limit_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_deleted public.post_limits%rowtype;
begin
  if v_role <> 'service_role'
     and (v_admin_id is null or not public.kc_is_admin(v_admin_id)) then
    return jsonb_build_object(
      'ok', false,
      'code', case when v_admin_id is null then 'AUTH_REQUIRED' else 'FORBIDDEN' end
    );
  end if;

  delete from public.post_limits
  where id = p_limit_id
  returning * into v_deleted;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'NOT_FOUND',
      'message', 'Limite não encontrado.'
    );
  end if;

  perform kc_private.kc_insert_audit_log(
    'post_limit_deleted',
    'post_limits',
    v_deleted.id,
    jsonb_build_object(
      'user_id', v_deleted.user_id,
      'module', v_deleted.module,
      'max_active', v_deleted.max_active
    ),
    v_admin_id
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'Limite removido.'
  );
end;
$$;

create or replace function public.kc_admin_delete_post_limit(
  p_limit_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select kc_private.kc_admin_delete_post_limit($1)
$$;

-- Freeze the post collection used by PDF/XLSX exports. Keep the existing
-- four-argument public RPC as the interactive endpoint and expose the export
-- snapshot under a distinct name so PostgREST never has to resolve an
-- overloaded public function.
drop function if exists public.kc_admin_search_posts_full(
  text, text, integer, integer, timestamptz
);
drop function if exists kc_private.kc_admin_search_posts_full(
  text, text, integer, integer, timestamptz
);

-- Shared row worker. It is not exposed directly and can return up to the
-- export ceiling; the interactive wrapper below applies its own lower cap.
create or replace function kc_private.kc_admin_search_posts_full_rows(
  p_query text,
  p_status text,
  p_limit integer,
  p_offset integer,
  p_until timestamptz
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
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 2000));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_role <> 'service_role'
     and (v_uid is null or not public.kc_is_admin(v_uid)) then
    raise insufficient_privilege using message = 'admin access required';
  end if;

  return query
  select
    post_row.id,
    post_row.legacy_id,
    coalesce(post_row.title, 'Post sem título'),
    left(coalesce(post_row.description, ''), 500),
    coalesce(post_row.status, 'pending'),
    post_row.created_at,
    coalesce(post_row.updated_at, post_row.created_at),
    post_row.author_id,
    coalesce(profile_row.display_name, profile_row.full_name, 'Usuário'),
    coalesce(post_row.module, ''),
    coalesce(post_row.category, ''),
    count(*) over()
  from public.posts as post_row
  left join public.profiles as profile_row
    on profile_row.id = post_row.author_id
  where (v_status is null or post_row.status = v_status)
    and post_row.created_at <= coalesce(p_until, now())
    and (
      v_query is null
      or coalesce(post_row.title, '') ilike '%' || v_query || '%'
      or coalesce(post_row.description, '') ilike '%' || v_query || '%'
      or coalesce(post_row.legacy_id, '') ilike '%' || v_query || '%'
      or post_row.id::text ilike '%' || v_query || '%'
      or coalesce(profile_row.display_name, '') ilike '%' || v_query || '%'
      or coalesce(profile_row.full_name, '') ilike '%' || v_query || '%'
    )
  order by
    post_row.created_at desc,
    post_row.id desc
  limit v_limit
  offset v_offset;
end;
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
language sql
stable
security definer
set search_path = ''
as $$
  select *
  from kc_private.kc_admin_search_posts_full_rows(
    $1,
    $2,
    greatest(1, least(coalesce($3, 25), 250)),
    greatest(coalesce($4, 0), 0),
    null::timestamptz
  )
$$;

-- Return one envelope row so PostgREST's global max_rows=1000 does not
-- truncate an export containing up to 2,000 posts. The JSON aggregate and
-- total count are produced by one database statement/MVCC snapshot.
create or replace function kc_private.kc_admin_search_posts_full_snapshot(
  p_query text,
  p_status text,
  p_limit integer,
  p_offset integer,
  p_until timestamptz
)
returns table (
  out_rows jsonb,
  out_total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(
      jsonb_agg(
        (to_jsonb(post_row) - 'total_count')
        order by post_row.created_at desc, post_row.id desc
      ),
      '[]'::jsonb
    ) as out_rows,
    coalesce(max(post_row.total_count), 0)::bigint as out_total_count
  from kc_private.kc_admin_search_posts_full_rows(
    $1,
    $2,
    greatest(1, least(coalesce($3, 2000), 2000)),
    greatest(coalesce($4, 0), 0),
    $5
  ) as post_row
$$;

create or replace function public.kc_admin_search_posts_full_snapshot(
  p_query text,
  p_status text,
  p_limit integer,
  p_offset integer,
  p_until timestamptz
)
returns table (
  out_rows jsonb,
  out_total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_admin_search_posts_full_snapshot($1, $2, $3, $4, $5)
$$;

-- The flood-limit table already has an expression unique index. Use it as the
-- arbiter so two simultaneous saves cannot race between UPDATE and INSERT.
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
  v_limit_id uuid;
begin
  if v_admin_id is null and v_role <> 'service_role' then
    return jsonb_build_object(
      'ok', false,
      'code', 'AUTH_REQUIRED',
      'message', 'Autenticação necessária.'
    );
  end if;

  if v_role <> 'service_role' and not public.kc_is_admin(v_admin_id) then
    return jsonb_build_object(
      'ok', false,
      'code', 'FORBIDDEN',
      'message', 'Apenas administradores podem configurar limites.'
    );
  end if;

  if p_max_posts is null or p_max_posts < 0 or p_max_posts > 1000 then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_VALUE',
      'message', 'Limite deve estar entre 0 e 1000.'
    );
  end if;

  if p_window_minutes is null
     or p_window_minutes < 1
     or p_window_minutes > 10080 then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_WINDOW',
      'message', 'Janela deve estar entre 1 minuto e 7 dias.'
    );
  end if;

  insert into public.post_flood_limits (
    user_id,
    module,
    max_posts,
    window_minutes,
    created_by
  )
  values (
    p_user_id,
    v_module,
    p_max_posts,
    p_window_minutes,
    v_admin_id
  )
  on conflict (
    (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    (coalesce(module, '__all__'::text))
  )
  do update set
    max_posts = excluded.max_posts,
    window_minutes = excluded.window_minutes,
    updated_at = now(),
    created_by = excluded.created_by
  returning id into v_limit_id;

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

-- Reconcile the private worker referenced by the active baseline's public
-- wrapper. This makes clean rebuilds behave like the historically upgraded
-- production database.
drop index if exists public.help_requests_admin_status_idx;
drop index if exists public.help_requests_external_access_status_created_id_idx;
create index help_requests_external_access_status_created_id_idx
  on public.help_requests (admin_status, created_at desc, id desc)
  where (
    type = 'external_access'
    or metadata->>'request_kind' = 'external_access'
  );

create or replace function kc_private.kc_admin_list_external_access(
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  out_id uuid,
  out_created_at timestamptz,
  out_admin_status text,
  out_admin_decided_at timestamptz,
  out_admin_note text,
  out_subject text,
  out_message text,
  out_contact_email text,
  out_requester_name text,
  out_affiliation_context text,
  out_metadata jsonb,
  out_total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_filter_status text := lower(nullif(btrim(coalesce(p_status, '')), ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if v_role <> 'service_role'
     and (v_user is null or not public.kc_is_admin(v_user)) then
    raise insufficient_privilege using message = 'admin access required';
  end if;

  return query
  select
    request_row.id,
    request_row.created_at,
    request_row.admin_status,
    request_row.admin_decided_at,
    request_row.admin_note,
    request_row.subject,
    request_row.message,
    request_row.contact_email,
    nullif(request_row.metadata->>'requester_name', ''),
    nullif(request_row.metadata->>'affiliation_context', ''),
    request_row.metadata,
    count(*) over()
  from public.help_requests as request_row
  where (
      request_row.type = 'external_access'
      or request_row.metadata->>'request_kind' = 'external_access'
    )
    and (
      v_filter_status is null
      or v_filter_status = 'all'
      or request_row.admin_status = v_filter_status
    )
  order by
    case when request_row.admin_status = 'pending' then 0 else 1 end,
    request_row.created_at desc,
    request_row.id desc
  limit v_limit
  offset v_offset;
end;
$$;

create or replace function public.kc_admin_list_external_access(
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  out_id uuid,
  out_created_at timestamptz,
  out_admin_status text,
  out_admin_decided_at timestamptz,
  out_admin_note text,
  out_subject text,
  out_message text,
  out_contact_email text,
  out_requester_name text,
  out_affiliation_context text,
  out_metadata jsonb,
  out_total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_admin_list_external_access($1, $2, $3)
$$;

-- Help requests are created through a sanitizing RPC. Restore its private
-- worker in the active migration chain and remove the permissive direct INSERT
-- path whose policies were combined with OR.
create or replace function kc_private.kc_create_help_request(
  p_payload jsonb
)
returns table (
  out_id uuid,
  out_created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_created_at timestamptz;
  v_user uuid := auth.uid();
  v_type text;
  v_topic text;
  v_subject text;
  v_message text;
  v_email text;
  v_priority text;
  v_page_path text;
  v_metadata jsonb;
  v_allow_contact boolean;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise invalid_parameter_value using message = 'payload must be an object';
  end if;

  v_type := nullif(btrim(coalesce(p_payload->>'type', '')), '');
  v_topic := nullif(btrim(coalesce(p_payload->>'topic', '')), '');
  v_subject := btrim(coalesce(p_payload->>'subject', ''));
  v_message := btrim(coalesce(p_payload->>'message', ''));
  v_email := lower(btrim(coalesce(p_payload->>'contact_email', '')));
  v_priority := lower(btrim(coalesce(p_payload->>'priority', 'normal')));
  v_page_path := nullif(btrim(coalesce(p_payload->>'page_path', '')), '');
  v_metadata := coalesce(p_payload->'metadata', '{}'::jsonb);
  v_allow_contact := case lower(coalesce(p_payload->>'allow_contact', 'true'))
    when 'false' then false
    else true
  end;

  if v_type is null then
    raise invalid_parameter_value using message = 'type is required';
  end if;
  if v_topic is null then
    raise invalid_parameter_value using message = 'topic is required';
  end if;
  if char_length(v_subject) < 3 or char_length(v_subject) > 140 then
    raise invalid_parameter_value using message = 'subject must have between 3 and 140 characters';
  end if;
  if char_length(v_message) < 10 or char_length(v_message) > 4000 then
    raise invalid_parameter_value using message = 'message must have between 10 and 4000 characters';
  end if;
  if char_length(v_email) > 255
     or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise invalid_parameter_value using message = 'valid contact_email is required';
  end if;
  if v_page_path is not null and char_length(v_page_path) > 255 then
    raise invalid_parameter_value using message = 'page_path is too long';
  end if;
  if jsonb_typeof(v_metadata) <> 'object' then
    raise invalid_parameter_value using message = 'metadata must be an object';
  end if;
  if v_priority not in ('low', 'normal', 'high') then
    v_priority := 'normal';
  end if;

  insert into public.help_requests (
    user_id,
    type,
    topic,
    subtopic,
    subject,
    message,
    priority,
    status,
    page_path,
    contact_email,
    allow_contact,
    metadata,
    admin_status,
    admin_decided_at,
    admin_decided_by,
    admin_note
  )
  values (
    v_user,
    v_type,
    v_topic,
    nullif(btrim(coalesce(p_payload->>'subtopic', '')), ''),
    v_subject,
    v_message,
    v_priority,
    'new',
    v_page_path,
    v_email,
    v_allow_contact,
    v_metadata,
    'pending',
    null,
    null,
    null
  )
  returning id, created_at into v_id, v_created_at;

  out_id := v_id;
  out_created_at := v_created_at;
  return next;
end;
$$;

create or replace function public.kc_create_help_request(
  p_payload jsonb
)
returns table (
  out_id uuid,
  out_created_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_create_help_request($1)
$$;

drop policy if exists help_requests_insert_public on public.help_requests;
drop policy if exists help_requests_insert_anon on public.help_requests;
drop policy if exists help_requests_insert_authenticated on public.help_requests;

create policy help_requests_insert_anon
  on public.help_requests
  for insert
  to anon
  with check (
    user_id is null
    and admin_status = 'pending'
    and status = 'new'
    and priority in ('low', 'normal', 'high')
    and admin_decided_at is null
    and admin_decided_by is null
    and admin_note is null
  );

create policy help_requests_insert_authenticated
  on public.help_requests
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and admin_status = 'pending'
    and status = 'new'
    and priority in ('low', 'normal', 'high')
    and admin_decided_at is null
    and admin_decided_by is null
    and admin_note is null
  );

revoke insert on table public.help_requests from anon, authenticated;

revoke all on function kc_private.kc_admin_get_post_limits()
  from public, anon, authenticated, service_role;
revoke all on function kc_private.kc_admin_set_post_limit(uuid, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function kc_private.kc_admin_delete_post_limit(uuid)
  from public, anon, authenticated, service_role;
revoke all on function kc_private.kc_admin_search_posts_full(text, text, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function kc_private.kc_admin_search_posts_full_rows(text, text, integer, integer, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function kc_private.kc_admin_search_posts_full_snapshot(text, text, integer, integer, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function kc_private.kc_admin_list_external_access(text, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function kc_private.kc_create_help_request(jsonb)
  from public, anon, authenticated, service_role;

revoke all on function public.kc_admin_get_post_limits()
  from public, anon, authenticated, service_role;
revoke all on function public.kc_admin_set_post_limit(uuid, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.kc_admin_delete_post_limit(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.kc_admin_search_posts_full_snapshot(text, text, integer, integer, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.kc_admin_set_post_flood_limit(uuid, text, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.kc_admin_list_external_access(text, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.kc_create_help_request(jsonb)
  from public, anon, authenticated, service_role;

grant execute on function kc_private.kc_admin_get_post_limits()
  to authenticated, service_role;
grant execute on function kc_private.kc_admin_set_post_limit(uuid, text, integer)
  to authenticated, service_role;
grant execute on function kc_private.kc_admin_delete_post_limit(uuid)
  to authenticated, service_role;
grant execute on function kc_private.kc_admin_search_posts_full(text, text, integer, integer)
  to authenticated, service_role;
grant execute on function kc_private.kc_admin_search_posts_full_snapshot(text, text, integer, integer, timestamptz)
  to authenticated, service_role;
grant execute on function kc_private.kc_admin_list_external_access(text, integer, integer)
  to authenticated, service_role;
grant execute on function kc_private.kc_create_help_request(jsonb)
  to anon, authenticated, service_role;

grant execute on function public.kc_admin_get_post_limits()
  to authenticated, service_role;
grant execute on function public.kc_admin_set_post_limit(uuid, text, integer)
  to authenticated, service_role;
grant execute on function public.kc_admin_delete_post_limit(uuid)
  to authenticated, service_role;
grant execute on function public.kc_admin_search_posts_full_snapshot(text, text, integer, integer, timestamptz)
  to authenticated, service_role;
grant execute on function public.kc_admin_set_post_flood_limit(uuid, text, integer, integer)
  to authenticated, service_role;
grant execute on function public.kc_admin_list_external_access(text, integer, integer)
  to authenticated, service_role;
grant execute on function public.kc_create_help_request(jsonb)
  to anon, authenticated, service_role;

comment on index public.post_limits_unique_scope_idx is
  'One deterministic post-limit row per nullable (user_id,module) scope.';
comment on function public.kc_admin_set_post_limit(uuid, text, integer) is
  'SECURITY INVOKER facade for the atomic private post-limit upsert.';
comment on function public.kc_admin_search_posts_full_snapshot(text, text, integer, integer, timestamptz) is
  'Admin post export snapshot with stable timestamp bound and deterministic created_at/id ordering.';
comment on function public.kc_admin_list_external_access(text, integer, integer) is
  'SECURITY INVOKER facade for deterministic admin-only external-access history.';
comment on function public.kc_create_help_request(jsonb) is
  'SECURITY INVOKER facade for sanitized public help-request creation.';

notify pgrst, 'reload schema';

commit;

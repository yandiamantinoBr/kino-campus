-- KinoCampus - fix post flood limit execution context and admin reset
--
-- The public kc_check_post_flood_limit RPC is intentionally auth-gated.
-- The anti-spam trigger, however, cannot depend on a public RPC that may
-- evaluate auth.uid() as null inside trigger execution. This migration moves
-- the raw cadence calculation to kc_private and lets both the public RPC and
-- the trigger use the same internal helper.

begin;

create schema if not exists kc_private;

create table if not exists public.post_flood_resets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reset_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  module text,
  reason text
);

comment on table public.post_flood_resets is
  'Admin reset markers for post cadence limits. A reset ignores older posts inside the current moving window for the selected user/module.';
comment on column public.post_flood_resets.module is
  'NULL applies to all modules for the user. Specific modules override only that module.';

create index if not exists idx_post_flood_resets_user_module_reset
  on public.post_flood_resets (user_id, module, reset_at desc);

alter table public.post_flood_resets enable row level security;

drop policy if exists post_flood_resets_admin_select on public.post_flood_resets;
create policy post_flood_resets_admin_select
  on public.post_flood_resets for select
  to authenticated
  using (public.kc_is_admin((select auth.uid())));

drop policy if exists post_flood_resets_admin_insert on public.post_flood_resets;
create policy post_flood_resets_admin_insert
  on public.post_flood_resets for insert
  to authenticated
  with check (public.kc_is_admin((select auth.uid())));

drop policy if exists post_flood_resets_admin_delete on public.post_flood_resets;
create policy post_flood_resets_admin_delete
  on public.post_flood_resets for delete
  to authenticated
  using (public.kc_is_admin((select auth.uid())));

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

revoke all on function kc_private.kc_resolve_post_flood_limit(uuid, text) from public, anon, authenticated;
revoke all on function kc_private.kc_compute_post_flood_check(uuid, text) from public, anon, authenticated;
grant execute on function kc_private.kc_resolve_post_flood_limit(uuid, text) to authenticated, service_role;
grant execute on function kc_private.kc_compute_post_flood_check(uuid, text) to authenticated, service_role;

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
  v_target_user uuid := coalesce(p_user_id, v_uid);
begin
  if v_uid is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;

  if v_target_user is distinct from v_uid
     and v_role <> 'service_role'
     and not public.kc_is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  return kc_private.kc_resolve_post_flood_limit(v_target_user, p_module);
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
  v_target_user uuid := coalesce(p_user_id, v_uid);
begin
  if v_uid is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;

  if v_target_user is distinct from v_uid
     and v_role <> 'service_role'
     and not public.kc_is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  return kc_private.kc_compute_post_flood_check(v_target_user, p_module);
end;
$$;

create or replace function public.kc_admin_reset_post_flood_limit(
  p_user_id uuid,
  p_module text default null,
  p_reason text default null
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
  v_reset_id uuid;
  v_check jsonb;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_USER', 'message', 'Selecione um usuario para resetar o limite.');
  end if;

  if v_admin_id is null and v_role <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Autenticacao necessaria.');
  end if;

  if v_role <> 'service_role' and not public.kc_is_admin(v_admin_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas administradores podem resetar limites.');
  end if;

  insert into public.post_flood_resets (user_id, module, reset_at, expires_at, created_by, reason)
  values (
    p_user_id,
    v_module,
    now(),
    now() + interval '24 hours',
    v_admin_id,
    nullif(left(trim(coalesce(p_reason, 'admin_reset')), 160), '')
  )
  returning id into v_reset_id;

  perform kc_private.kc_insert_audit_log(
    'post_flood_limit_reset',
    'post_flood_limits',
    v_reset_id,
    jsonb_build_object(
      'user_id', p_user_id,
      'module', v_module,
      'reason', nullif(left(trim(coalesce(p_reason, 'admin_reset')), 160), '')
    ),
    v_admin_id
  );

  v_check := kc_private.kc_compute_post_flood_check(p_user_id, v_module);

  return jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'Limite de ritmo resetado. O usuario pode publicar novamente.',
    'id', v_reset_id,
    'user_id', p_user_id,
    'module', v_module,
    'check', v_check
  );
end;
$$;

create or replace function public.kc_anti_spam_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_flood_check jsonb;
  v_url_count integer := 0;
  v_approved_count integer := 0;
  v_profile_created_at timestamptz;
  v_flood_limit int := 3;
  v_flood_count int := 0;
  v_flood_window int := 60;
begin
  v_flood_check := kc_private.kc_compute_post_flood_check(new.author_id, new.module);
  v_flood_limit := coalesce((v_flood_check->>'limit')::int, 3);
  v_flood_count := coalesce((v_flood_check->>'count')::int, 0);
  v_flood_window := coalesce((v_flood_check->>'window_minutes')::int, 60);

  if not coalesce((v_flood_check->>'ok')::boolean, true) then
    raise exception 'flood_limit_exceeded'
      using hint = format(
              'Limite de %s publicacoes a cada %s minutos atingido. Aguarde antes de publicar novamente.',
              v_flood_limit,
              v_flood_window
            ),
            detail = v_flood_check::text,
            errcode = 'P0001';
  end if;

  select count(m[1])
    into v_url_count
    from regexp_matches(
      coalesce(new.description, '') || ' ' || coalesce(new.title, ''),
      'https?://[^\s)>\]"'']+',
      'gi'
    ) as m;

  if v_url_count > 3 then
    new.status := 'pending';
    new.moderation_reason := 'link_spam';
  end if;

  select p.created_at
    into v_profile_created_at
    from public.profiles p
   where p.id = new.author_id;

  if v_profile_created_at is not null and v_profile_created_at > now() - interval '7 days' then
    select count(*)
      into v_approved_count
      from public.posts p
     where p.author_id = new.author_id
       and p.status = 'published';

    if v_approved_count = 0 then
      new.status := 'pending';
      new.moderation_reason := coalesce(new.moderation_reason, 'new_user_scrutiny');
    end if;
  end if;

  if new.status = 'pending' then
    begin
      insert into public.audit_log (action, entity_type, entity_id, actor_id, payload)
      values (
        'post_auto_moderated',
        'posts',
        new.id,
        new.author_id,
        jsonb_build_object(
          'reason', new.moderation_reason,
          'original_status', 'published',
          'new_status', 'pending',
          'module', new.module,
          'flood_limit', v_flood_limit,
          'flood_count', v_flood_count,
          'flood_window_minutes', v_flood_window
        )
      );
    exception when others then
      null;
    end;
  end if;

  return new;
end;
$$;

revoke all on function public.kc_get_post_flood_limit(uuid, text) from public, anon;
revoke all on function public.kc_check_post_flood_limit(uuid, text) from public, anon;
revoke all on function public.kc_admin_reset_post_flood_limit(uuid, text, text) from public, anon;
grant execute on function public.kc_get_post_flood_limit(uuid, text) to authenticated, service_role;
grant execute on function public.kc_check_post_flood_limit(uuid, text) to authenticated, service_role;
grant execute on function public.kc_admin_reset_post_flood_limit(uuid, text, text) to authenticated, service_role;
revoke execute on function public.kc_anti_spam_gate() from public, anon, authenticated;

commit;

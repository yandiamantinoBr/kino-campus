begin;

-- Internal helpers and trigger functions must not be callable as public RPCs.
-- Their owners can still invoke them from triggers and SECURITY DEFINER
-- workflows; service_role remains available for explicit maintenance jobs.
revoke all on function public.check_report_rate_limit()
  from public, anon, authenticated, service_role;

revoke all on function public.kc_anti_spam_gate()
  from public, anon, authenticated, service_role;

revoke all on function public.kc_check_comment_depth()
  from public, anon, authenticated, service_role;

revoke all on function public.kc_compute_highlight_score(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_compute_highlight_score(uuid) to service_role;

revoke all on function public.kc_count_active_posts(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_count_active_posts(uuid, text) to service_role;

revoke all on function public.kc_count_recent_posts(uuid, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_count_recent_posts(uuid, text, integer) to service_role;

revoke all on function public.kc_expire_old_posts()
  from public, anon, authenticated, service_role;
grant execute on function public.kc_expire_old_posts() to service_role;

revoke all on function public.kc_get_post_limit(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_get_post_limit(uuid, text) to service_role;

revoke all on function public.kc_handle_new_profile_user()
  from public, anon, authenticated, service_role;

revoke all on function public.kc_handle_new_user()
  from public, anon, authenticated, service_role;

revoke all on function public.kc_is_invited_email(text)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_is_invited_email(text) to service_role;

revoke all on function public.kc_mark_invite_used()
  from public, anon, authenticated, service_role;
grant execute on function public.kc_mark_invite_used()
  to authenticated, service_role;

revoke all on function public.kc_notify_on_comment()
  from public, anon, authenticated, service_role;

revoke all on function public.kc_notify_on_comment_reply()
  from public, anon, authenticated, service_role;

revoke all on function public.kc_notify_on_post_expire(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_notify_on_post_expire(uuid, uuid, text, text)
  to service_role;

revoke all on function public.kc_notify_on_vote()
  from public, anon, authenticated, service_role;

revoke all on function public.kc_profiles_enforce_email_verified()
  from public, anon, authenticated, service_role;

revoke all on function public.kc_refresh_highlight_scores()
  from public, anon, authenticated, service_role;
grant execute on function public.kc_refresh_highlight_scores() to service_role;

revoke all on function public.kc_set_post_expires_at()
  from public, anon, authenticated, service_role;

revoke all on function public.kc_sync_profile_rating_aggregates(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_sync_profile_rating_aggregates(uuid)
  to service_role;

revoke all on function public.kc_trigger_update_highlight_score()
  from public, anon, authenticated, service_role;

revoke all on function public.kc_update_post_last_comment_at()
  from public, anon, authenticated, service_role;

revoke all on function public.kc_user_ratings_set_updated_at()
  from public, anon, authenticated, service_role;

revoke all on function public.kc_user_ratings_sync_target()
  from public, anon, authenticated, service_role;

revoke all on function public.sync_post_votes_count()
  from public, anon, authenticated, service_role;

revoke all on function public.trg_notify_admin_reports_threshold()
  from public, anon, authenticated, service_role;

-- Keep the existing client contract, but prevent a caller from counting another
-- user's posts or learning their custom limit.
create or replace function public.kc_check_post_limit(
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
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_target_user uuid := coalesce(p_user_id, v_uid);
  v_limit bigint;
  v_count bigint;
begin
  if v_role <> 'service_role' and v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;

  if v_role <> 'service_role'
     and v_target_user is distinct from v_uid
     and not public.kc_is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  v_limit := public.kc_get_post_limit(v_target_user, p_module);
  v_count := public.kc_count_active_posts(v_target_user, p_module);

  return jsonb_build_object(
    'ok', v_count < v_limit,
    'limit', v_limit,
    'count', v_count,
    'remaining', greatest(0, v_limit - v_count)
  );
end;
$$;

revoke all on function public.kc_check_post_limit(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_check_post_limit(uuid, text)
  to authenticated, service_role;

-- These two legacy banner reads bypassed RLS without checking that the caller
-- was an administrator. Retain their result shape and fail closed.
create or replace function public.kc_admin_list_banners()
returns setof public.hero_banners
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
begin
  if v_role <> 'service_role'
     and (v_uid is null or not public.kc_is_admin(v_uid)) then
    raise insufficient_privilege using message = 'admin access required';
  end if;

  return query
  select banner_row.*
    from public.hero_banners as banner_row
   order by banner_row.sort_order, banner_row.created_at;
end;
$$;

create or replace function public.kc_admin_banner_audit(p_banner_id uuid)
returns table (
  id bigint,
  action text,
  changed_at timestamptz,
  editor_name text,
  snapshot jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
begin
  if v_role <> 'service_role'
     and (v_uid is null or not public.kc_is_admin(v_uid)) then
    raise insufficient_privilege using message = 'admin access required';
  end if;

  return query
  select
    audit_row.id,
    audit_row.action,
    audit_row.changed_at,
    coalesce(profile_row.full_name, 'Desconhecido'),
    audit_row.snapshot
  from public.hero_banner_audit as audit_row
  left join public.profiles as profile_row
    on profile_row.id = audit_row.changed_by
  where audit_row.banner_id = p_banner_id
  order by audit_row.changed_at desc;
end;
$$;

revoke all on function public.kc_admin_list_banners()
  from public, anon, authenticated, service_role;
grant execute on function public.kc_admin_list_banners()
  to authenticated, service_role;

revoke all on function public.kc_admin_banner_audit(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_admin_banner_audit(uuid)
  to authenticated, service_role;

-- Match the visibility contract already enforced by kc_list_user_ratings:
-- public profiles are visible to everyone; private summaries are visible only
-- to the subject, an administrator, or service_role.
create or replace function public.kc_get_user_rating_summary(
  p_target_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_profile_public boolean := false;
  v_rating_avg numeric;
  v_rating_count integer;
begin
  select
    coalesce(profile_row.profile_public, false),
    profile_row.rating_avg,
    coalesce(profile_row.rating_count, 0)
  into
    v_profile_public,
    v_rating_avg,
    v_rating_count
  from public.profiles as profile_row
  where profile_row.id = p_target_user_id;

  if not found
     or (
       not v_profile_public
       and v_role <> 'service_role'
       and v_actor_id is distinct from p_target_user_id
       and (v_actor_id is null or not public.kc_is_admin(v_actor_id))
     ) then
    return jsonb_build_object(
      'userId', p_target_user_id,
      'average', null,
      'count', 0
    );
  end if;

  return jsonb_build_object(
    'userId', p_target_user_id,
    'average', case
      when v_rating_count > 0 then round(coalesce(v_rating_avg, 0)::numeric, 2)
      else null
    end,
    'count', v_rating_count
  );
end;
$$;

revoke all on function public.kc_get_user_rating_summary(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_get_user_rating_summary(uuid)
  to anon, authenticated, service_role;

-- Anonymous personalization stays in the browser. Server-side affinity is now
-- owner-scoped and requires an affirmative consent event for the same browser
-- session. The legacy p_session_id argument is retained for compatibility and
-- is used only to verify consent; it is never stored in affinity rows.
create or replace function kc_private.kc_home_user_has_analytics_consent(
  p_user_id uuid,
  p_session_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select consent_row.analytics_enabled
      from public.privacy_consent_events as consent_row
      where consent_row.session_hash = encode(
        extensions.digest(btrim(coalesce(p_session_id, '')), 'sha256'),
        'hex'
      )
        and (
          consent_row.user_id is null
          or consent_row.user_id = p_user_id
        )
      order by consent_row.created_at desc, consent_row.id desc
      limit 1
    ),
    false
  )
  and length(btrim(coalesce(p_session_id, ''))) between 12 and 128
$$;

revoke all on function kc_private.kc_home_user_has_analytics_consent(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.kc_track_home_category_affinity(
  p_session_id text default null,
  p_events jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_processed integer := 0;
  v_event jsonb;
  v_module_key text;
  v_category_key text;
  v_delta numeric(12,2);
begin
  if v_user_id is null
     or jsonb_typeof(p_events) is distinct from 'array'
     or not kc_private.kc_home_user_has_analytics_consent(
       v_user_id,
       p_session_id
     ) then
    return 0;
  end if;

  for v_event in
    select event_row.value
    from jsonb_array_elements(p_events) as event_row(value)
    limit 50
  loop
    v_module_key := public.kc_home_normalize_key(
      v_event ->> 'module_key'
    );
    v_category_key := public.kc_home_normalize_key(
      v_event ->> 'category_key'
    );

    begin
      v_delta := greatest(
        0.5,
        least(50, coalesce((v_event ->> 'delta')::numeric, 0))
      );
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        continue;
    end;

    if v_module_key = '' or v_category_key = '' then
      continue;
    end if;

    insert into public.home_category_affinity (
      owner_kind,
      owner_key,
      user_id,
      session_id,
      module_key,
      category_key,
      score,
      interactions_count
    )
    values (
      'user',
      v_user_id::text,
      v_user_id,
      null,
      v_module_key,
      v_category_key,
      v_delta,
      1
    )
    on conflict (owner_kind, owner_key, module_key, category_key)
    do update set
      score = public.home_category_affinity.score + excluded.score,
      interactions_count =
        public.home_category_affinity.interactions_count + 1,
      updated_at = now();

    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$$;

create or replace function public.kc_list_home_category_affinity(
  p_session_id text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  module_key text,
  category_key text,
  score numeric,
  interactions_count bigint,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null
     or not kc_private.kc_home_user_has_analytics_consent(
       v_user_id,
       p_session_id
     ) then
    return;
  end if;

  return query
  select
    affinity_row.module_key,
    affinity_row.category_key,
    sum(affinity_row.score)::numeric,
    sum(affinity_row.interactions_count)::bigint,
    max(affinity_row.updated_at)
  from public.home_category_affinity as affinity_row
  where affinity_row.owner_kind = 'user'
    and affinity_row.user_id = v_user_id
  group by affinity_row.module_key, affinity_row.category_key
  order by
    sum(affinity_row.score) desc,
    sum(affinity_row.interactions_count) desc,
    affinity_row.category_key asc
  offset greatest(coalesce(p_offset, 0), 0)
  limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;

create or replace function public.kc_merge_home_category_affinity(
  p_session_id text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Server-side anonymous affinity is retired. Pending browser events are
  -- uploaded directly to the authenticated owner's rows instead.
  if auth.uid() is null then
    return 0;
  end if;

  return 0;
end;
$$;

revoke all on function public.kc_track_home_category_affinity(text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_track_home_category_affinity(text, jsonb)
  to authenticated;

revoke all on function public.kc_list_home_category_affinity(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_list_home_category_affinity(text, integer, integer)
  to authenticated;

revoke all on function public.kc_merge_home_category_affinity(text)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_merge_home_category_affinity(text)
  to authenticated;

delete from public.home_category_affinity
where owner_kind = 'session';

comment on function public.kc_track_home_category_affinity(text, jsonb) is
  'Registra afinidade somente para o titular autenticado, após consentimento de analytics verificável para a sessão.';
comment on function public.kc_list_home_category_affinity(text, integer, integer) is
  'Lista somente afinidade do titular autenticado; afinidade anônima permanece local no navegador.';
comment on function public.kc_merge_home_category_affinity(text) is
  'Compatibilidade sem efeito após a retirada de afinidade anônima do servidor.';

-- A private profile must be indistinguishable from a missing profile to
-- unrelated callers. The owner, an administrator, and service_role retain the
-- diagnostic state used by account-management screens.
create or replace function public.kc_get_profile_access_state(
  p_profile_id uuid
)
returns table (
  "exists" boolean,
  profile_public boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_profile_public boolean := false;
begin
  select coalesce(profile_row.profile_public, false)
    into v_profile_public
    from public.profiles as profile_row
   where profile_row.id = p_profile_id;

  if not found then
    return query select false, false;
    return;
  end if;

  if v_profile_public
     or v_role = 'service_role'
     or v_actor_id = p_profile_id
     or (
       v_actor_id is not null
       and public.kc_is_admin(v_actor_id)
     ) then
    return query select true, v_profile_public;
    return;
  end if;

  return query select false, false;
end;
$$;

revoke all on function public.kc_get_profile_access_state(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_get_profile_access_state(uuid)
  to anon, authenticated, service_role;

-- Category counts must follow the same post visibility boundary as the feed:
-- anon sees public content; authenticated users may also see community content.
create or replace function public.kc_home_category_post_counts()
returns table (
  module_key text,
  category_key text,
  count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with matched as (
    select
      public.kc_home_match_category(
        post_row.module,
        post_row.category,
        coalesce(
          post_row.metadata ->> 'subcategoria',
          post_row.metadata ->> 'subcategory',
          post_row.metadata ->> 'subcategoriaKey',
          post_row.metadata ->> 'subcategoryKey'
        ),
        post_row.title,
        post_row.description
      ) as category_id
    from public.posts as post_row
    where post_row.status = 'published'
      and (
        coalesce(auth.role(), '') = 'service_role'
        or public.kc_can_read_post(
          post_row.author_id,
          post_row.status,
          post_row.visibility
        )
      )
  )
  select
    split_part(category_id, ':', 1),
    split_part(category_id, ':', 2),
    count(*)::bigint
  from matched
  where category_id is not null
  group by 1, 2
  order by 1, 2
$$;

revoke all on function public.kc_home_category_post_counts()
  from public, anon, authenticated, service_role;
grant execute on function public.kc_home_category_post_counts()
  to anon, authenticated, service_role;

-- The rating-state endpoint now applies both profile privacy and context-post
-- visibility before it reveals whether the target or an interaction exists.
create or replace function public.kc_get_user_rating_state(
  p_target_user_id uuid,
  p_context_post_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_reason text := 'OK';
  v_can_rate boolean := false;
  v_target_exists boolean := false;
  v_target_public boolean := false;
  v_context_valid boolean := true;
  v_has_interaction boolean := false;
  v_my_rating jsonb := null;
begin
  select
    true,
    coalesce(profile_row.profile_public, false)
  into
    v_target_exists,
    v_target_public
  from public.profiles as profile_row
  where profile_row.id = p_target_user_id;

  if v_target_exists
     and not v_target_public
     and v_role <> 'service_role'
     and v_actor_id is distinct from p_target_user_id
     and (
       v_actor_id is null
       or not public.kc_is_admin(v_actor_id)
     ) then
    v_target_exists := false;
  end if;

  if v_target_exists and v_actor_id is not null then
    select jsonb_build_object(
      'id', rating_row.id,
      'targetUserId', rating_row.target_user_id,
      'raterUserId', rating_row.rater_user_id,
      'contextPostId', rating_row.context_post_id,
      'rating', rating_row.rating,
      'comment', rating_row.comment,
      'createdAt', rating_row.created_at,
      'updatedAt', rating_row.updated_at
    )
      into v_my_rating
      from public.user_ratings as rating_row
     where rating_row.target_user_id = p_target_user_id
       and rating_row.rater_user_id = v_actor_id
     limit 1;
  end if;

  if not v_target_exists then
    v_reason := 'TARGET_NOT_FOUND';
  elsif v_actor_id is null then
    v_reason := 'AUTH_REQUIRED';
  elsif v_actor_id = p_target_user_id then
    v_reason := 'SELF';
  else
    if p_context_post_id is not null then
      select exists(
        select 1
        from public.posts as post_row
        where post_row.id = p_context_post_id
          and post_row.author_id = p_target_user_id
          and (
            v_role = 'service_role'
            or public.kc_can_read_post(
              post_row.author_id,
              post_row.status,
              post_row.visibility
            )
          )
      ) into v_context_valid;
    end if;

    if not v_context_valid then
      v_reason := 'INVALID_CONTEXT';
    elsif v_my_rating is not null then
      v_can_rate := true;
      v_reason := 'OK';
    else
      select exists(
        select 1
        from public.posts as post_row
        where post_row.author_id = p_target_user_id
          and (
            p_context_post_id is null
            or post_row.id = p_context_post_id
          )
          and (
            v_role = 'service_role'
            or public.kc_can_read_post(
              post_row.author_id,
              post_row.status,
              post_row.visibility
            )
          )
          and (
            exists(
              select 1
              from public.comments as comment_row
              where comment_row.post_id = post_row.id
                and comment_row.author_id = v_actor_id
            )
            or exists(
              select 1
              from public.post_votes as vote_row
              where vote_row.post_id = post_row.id
                and vote_row.voter_id = v_actor_id
            )
            or exists(
              select 1
              from public.saved_posts as saved_row
              where saved_row.post_id = post_row.id
                and saved_row.user_id = v_actor_id
            )
          )
      ) into v_has_interaction;

      if v_has_interaction then
        v_can_rate := true;
        v_reason := 'OK';
      else
        v_reason := 'NO_INTERACTION';
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'targetUserId', p_target_user_id,
    'contextPostId', p_context_post_id,
    'canRate', v_can_rate,
    'reason', v_reason,
    'myRating', v_my_rating
  );
end;
$$;

-- Owner-scoped RPCs should fail at the API boundary for anonymous callers,
-- instead of exposing their SECURITY DEFINER bodies through default grants.
revoke all on function public.increment_comment_likes(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.increment_comment_likes(uuid)
  to authenticated, service_role;

revoke all on function public.kc_get_my_votes(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.kc_get_my_votes(uuid[])
  to authenticated, service_role;

revoke all on function public.kc_get_post_analytics(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_get_post_analytics(uuid)
  to authenticated, service_role;

revoke all on function public.kc_get_user_rating_state(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_get_user_rating_state(uuid, uuid)
  to authenticated, service_role;

revoke all on function public.kc_report_post(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_report_post(uuid, text, text)
  to authenticated, service_role;

revoke all on function public.kc_track_view(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_track_view(uuid)
  to authenticated, service_role;

revoke all on function public.kc_upsert_user_rating(
  uuid,
  uuid,
  integer,
  text
)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_upsert_user_rating(
  uuid,
  uuid,
  integer,
  text
)
  to authenticated, service_role;

-- RLS policies call these helpers even for anonymous reads. Keep them
-- executable, but make arbitrary UUID probes return false; only self and
-- service_role can evaluate a concrete identity.
create or replace function public.kc_is_operator(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
begin
  if v_role <> 'service_role'
     and (
       v_actor_id is null
       or p_user_id is distinct from v_actor_id
     ) then
    return false;
  end if;

  return p_user_id in (
    'abfb1831-6ad3-4f40-b55b-788e29f146f0'::uuid,
    'bf3a4310-927f-4200-9df7-7478392d6a6e'::uuid,
    '2345582d-8bf7-4393-aa0d-f9953d0e02ca'::uuid,
    '10391c7b-4a6d-4462-becb-e6e0056b7e1d'::uuid
  );
end;
$$;

create or replace function public.kc_is_admin(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
begin
  if v_role <> 'service_role'
     and (
       v_actor_id is null
       or p_user_id is distinct from v_actor_id
     ) then
    return false;
  end if;

  return coalesce(
    (
      select profile_row.is_admin
      from public.profiles as profile_row
      where profile_row.id = p_user_id
    ),
    false
  )
  or public.kc_is_operator(p_user_id);
end;
$$;

revoke all on function public.kc_is_admin(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_is_admin(uuid)
  to anon, authenticated, service_role;

revoke all on function public.kc_is_operator(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_is_operator(uuid)
  to anon, authenticated, service_role;

-- Public share/coupon counters remain available, but one post can consume only
-- a bounded number of increments per UTC day. The limiter stores no caller,
-- device, IP, or session identifier.
create table if not exists public.post_engagement_rate_windows (
  post_id uuid not null
    references public.posts(id) on delete cascade,
  event_type text not null
    check (event_type in ('share', 'coupon_click')),
  window_started_at timestamptz not null,
  event_count integer not null default 0
    check (event_count between 0 and 1000),
  updated_at timestamptz not null default now(),
  primary key (post_id, event_type, window_started_at)
);

create index if not exists post_engagement_rate_windows_prune_idx
  on public.post_engagement_rate_windows (window_started_at);

alter table public.post_engagement_rate_windows enable row level security;
revoke all on table public.post_engagement_rate_windows
  from public, anon, authenticated;
grant all on table public.post_engagement_rate_windows to service_role;

create or replace function public.kc_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_schema = 'public'
     and tg_table_name = 'posts'
     and (
       to_jsonb(new) - array[
         'updated_at',
         'share_count',
         'coupon_clicks',
         'highlight_score'
       ]
     ) is not distinct from (
       to_jsonb(old) - array[
         'updated_at',
         'share_count',
         'coupon_clicks',
         'highlight_score'
       ]
     ) then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;

  return new;
end;
$$;

comment on function public.kc_set_updated_at() is
  'Mantém updated_at editorial estável quando apenas métricas agregadas de engajamento de posts mudam.';

create or replace function kc_private.kc_claim_post_engagement_slot(
  p_post_id uuid,
  p_event_type text,
  p_daily_limit integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_count integer;
  v_window timestamptz := date_trunc('day', now());
begin
  if p_event_type not in ('share', 'coupon_click')
     or p_daily_limit < 1
     or p_daily_limit > 1000 then
    return null;
  end if;

  insert into public.post_engagement_rate_windows (
    post_id,
    event_type,
    window_started_at,
    event_count,
    updated_at
  )
  values (
    p_post_id,
    p_event_type,
    v_window,
    1,
    now()
  )
  on conflict (post_id, event_type, window_started_at)
  do update set
    event_count =
      public.post_engagement_rate_windows.event_count + 1,
    updated_at = now()
  where public.post_engagement_rate_windows.event_count < p_daily_limit
  returning event_count into v_event_count;

  delete from public.post_engagement_rate_windows
  where window_started_at < date_trunc('day', now()) - interval '30 days';

  return v_event_count;
end;
$$;

revoke all on function kc_private.kc_claim_post_engagement_slot(
  uuid,
  text,
  integer
)
  from public, anon, authenticated, service_role;

create or replace function public.kc_track_coupon_click(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot integer;
  v_new_clicks integer;
begin
  if not exists (
    select 1
    from public.posts as post_row
    where post_row.id = p_post_id
      and post_row.status = 'published'
      and (
        coalesce(auth.role(), '') = 'service_role'
        or public.kc_can_read_post(
          post_row.author_id,
          post_row.status,
          post_row.visibility
        )
      )
  ) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  v_slot := kc_private.kc_claim_post_engagement_slot(
    p_post_id,
    'coupon_click',
    50
  );

  if v_slot is null then
    return jsonb_build_object(
      'ok',
      true,
      'code',
      'RATE_LIMITED',
      'counted',
      false
    );
  end if;

  update public.posts
     set coupon_clicks = coalesce(coupon_clicks, 0) + 1
   where id = p_post_id
     and status = 'published'
  returning coupon_clicks into v_new_clicks;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  update public.posts
     set highlight_score = public.kc_compute_highlight_score(id)
   where id = p_post_id;

  return jsonb_build_object(
    'ok',
    true,
    'counted',
    true,
    'coupon_clicks',
    v_new_clicks
  );
end;
$$;

create or replace function public.kc_track_share(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot integer;
  v_new_shares integer;
begin
  if not exists (
    select 1
    from public.posts as post_row
    where post_row.id = p_post_id
      and post_row.status = 'published'
      and (
        coalesce(auth.role(), '') = 'service_role'
        or public.kc_can_read_post(
          post_row.author_id,
          post_row.status,
          post_row.visibility
        )
      )
  ) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  v_slot := kc_private.kc_claim_post_engagement_slot(
    p_post_id,
    'share',
    25
  );

  if v_slot is null then
    return jsonb_build_object(
      'ok',
      true,
      'code',
      'RATE_LIMITED',
      'counted',
      false
    );
  end if;

  update public.posts
     set share_count = coalesce(share_count, 0) + 1
   where id = p_post_id
     and status = 'published'
  returning share_count into v_new_shares;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  update public.posts
     set highlight_score = public.kc_compute_highlight_score(id)
   where id = p_post_id;

  return jsonb_build_object(
    'ok',
    true,
    'counted',
    true,
    'share_count',
    v_new_shares
  );
end;
$$;

revoke all on function public.kc_track_coupon_click(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_track_coupon_click(uuid)
  to anon, authenticated, service_role;

revoke all on function public.kc_track_share(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_track_share(uuid)
  to anon, authenticated, service_role;

commit;

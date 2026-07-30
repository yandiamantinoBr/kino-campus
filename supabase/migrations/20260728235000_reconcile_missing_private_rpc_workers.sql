begin;

create schema if not exists kc_private;

-- ============================================================================
-- Public advertisement configuration
-- ============================================================================

create or replace function kc_private.kc_get_feed_ad_config(
  p_page_path text default '/',
  p_module_key text default '',
  p_placement text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.ad_network_settings%rowtype;
  v_path text := left(
    coalesce(nullif(btrim(p_page_path), ''), '/'),
    180
  );
  v_placement text := nullif(
    lower(btrim(coalesce(p_placement, ''))),
    ''
  );
  v_blocked boolean := false;
begin
  select settings_row.*
  into v_settings
  from public.ad_network_settings as settings_row
  where settings_row.id = 'default';

  if not found or v_settings.status <> 'active' then
    return jsonb_build_object(
      'ok', true,
      'enabled', false,
      'reason', 'disabled'
    );
  end if;

  -- Configuration identifiers and slots are public, but ads must not be
  -- rendered on account, legal, help, private-message, or administration
  -- surfaces.
  v_blocked := v_path ~* (
    '/(admin/|product[.]html|_product[.]html|create-post[.]html'
    || '|my-posts[.]html|profile[.]html|settings[.]html'
    || '|mensagens[.]html|account-setup[.]html|auth-callback[.]html'
    || '|privacidade[.]html|termos[.]html|ajuda[.]html'
    || '|transparencia[.]html)'
  );

  if v_blocked then
    return jsonb_build_object(
      'ok', true,
      'enabled', false,
      'reason', 'blocked_page'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'enabled', true,
    'provider', v_settings.provider,
    'status', v_settings.status,
    'adsense_client_id', v_settings.adsense_client_id,
    'auto_ads_enabled', v_settings.auto_ads_enabled,
    'placement_modes', v_settings.placement_modes,
    'adsense_slots', case
      when v_placement is null then v_settings.adsense_slots
      else jsonb_build_object(
        v_placement,
        v_settings.adsense_slots -> v_placement
      )
    end
  );
end;
$$;

create or replace function public.kc_get_feed_ad_config(
  p_page_path text default '/',
  p_module_key text default '',
  p_placement text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select kc_private.kc_get_feed_ad_config($1, $2, $3)
$$;

-- ============================================================================
-- Personalized tabs
-- ============================================================================

create or replace function kc_private.kc_get_personalized_tabs(
  p_session_id text default null,
  p_limit integer default 8
)
returns table (
  out_tab_key text,
  out_module_key text,
  out_category_key text,
  out_score numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 8), 30));
  v_authenticated boolean;
  v_admin boolean;
  v_use_affinity boolean := false;
begin
  v_authenticated := v_user_id is not null
    and v_role = 'authenticated';
  v_admin := v_role = 'service_role'
    or (
      v_user_id is not null
      and public.kc_is_admin(v_user_id)
    );

  -- Anonymous callers receive only a public, aggregate fallback. A browser
  -- session identifier never authorizes access to stored affinity.
  if v_authenticated then
    v_use_affinity := kc_private.kc_home_user_has_analytics_consent(
      v_user_id,
      p_session_id
    );
  end if;

  return query
  with affinity_raw as materialized (
    select
      affinity_row.module_key,
      affinity_row.category_key,
      sum(affinity_row.score)::numeric as affinity_score
    from public.home_category_affinity as affinity_row
    where v_use_affinity
      and affinity_row.owner_kind = 'user'
      and affinity_row.user_id = v_user_id
    group by
      affinity_row.module_key,
      affinity_row.category_key
  ),
  highlights_raw as materialized (
    select
      public.kc_home_normalize_key(post_row.module) as module_key,
      public.kc_home_normalize_key(post_row.category) as category_key,
      avg(coalesce(post_row.highlight_score, 0))::numeric
        as highlight_score,
      count(*)::numeric as volume,
      max(post_row.created_at) as last_post_at
    from public.posts as post_row
    where post_row.created_at > now() - interval '14 days'
      and post_row.status = 'published'
      and public.kc_home_normalize_key(post_row.module) <> ''
      and (
        v_admin
        or (
          v_authenticated
          and post_row.visibility in ('public', 'community')
        )
        or (
          not v_authenticated
          and post_row.visibility = 'public'
        )
      )
    group by
      public.kc_home_normalize_key(post_row.module),
      public.kc_home_normalize_key(post_row.category)
  ),
  combined as (
    select
      highlight_row.module_key,
      highlight_row.category_key,
      coalesce(affinity_row.affinity_score, 0) as affinity_score,
      coalesce(highlight_row.highlight_score, 0) as highlight_score,
      coalesce(highlight_row.volume, 0) as volume,
      highlight_row.last_post_at
    from highlights_raw as highlight_row
    left join affinity_raw as affinity_row
      on affinity_row.module_key = highlight_row.module_key
     and affinity_row.category_key = highlight_row.category_key
  ),
  normalized as (
    select
      combined_row.*,
      case
        when max(combined_row.affinity_score) over () > 0
          then combined_row.affinity_score
            / max(combined_row.affinity_score) over ()
        else 0
      end as affinity_normalized,
      case
        when max(combined_row.highlight_score) over () > 0
          then combined_row.highlight_score
            / max(combined_row.highlight_score) over ()
        else 0
      end as highlight_normalized,
      case
        when combined_row.last_post_at > now() - interval '48 hours'
          then 1.0
        when combined_row.last_post_at > now() - interval '7 days'
          then 0.5
        else 0
      end as recency_normalized,
      case
        when max(combined_row.volume) over () > 0
          then ln(1 + combined_row.volume)
            / nullif(ln(1 + max(combined_row.volume) over ()), 0)
        else 0
      end as volume_normalized
    from combined as combined_row
  )
  select
    case
      when normalized_row.category_key = ''
        then normalized_row.module_key
      else
        normalized_row.module_key || ':' || normalized_row.category_key
    end,
    normalized_row.module_key,
    nullif(normalized_row.category_key, ''),
    (
      0.45 * normalized_row.affinity_normalized
      + 0.25 * normalized_row.highlight_normalized
      + 0.15 * normalized_row.recency_normalized
      + 0.10 * coalesce(normalized_row.volume_normalized, 0)
      + 0.05
    )::numeric
  from normalized as normalized_row
  order by
    (
      0.45 * normalized_row.affinity_normalized
      + 0.25 * normalized_row.highlight_normalized
      + 0.15 * normalized_row.recency_normalized
      + 0.10 * coalesce(normalized_row.volume_normalized, 0)
      + 0.05
    ) desc nulls last,
    normalized_row.module_key,
    normalized_row.category_key
  limit v_limit;
end;
$$;

create or replace function public.kc_get_personalized_tabs(
  p_session_id text default null,
  p_limit integer default 8
)
returns table (
  out_tab_key text,
  out_module_key text,
  out_category_key text,
  out_score numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from kc_private.kc_get_personalized_tabs($1, $2)
$$;

-- ============================================================================
-- Chat conversation preview consistency
-- ============================================================================

create or replace function kc_private.kc_chat_refresh_conversation_preview(
  p_conversation_id uuid,
  p_reopen boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last public.chat_messages%rowtype;
  v_preview text;
begin
  if p_conversation_id is null then
    return;
  end if;

  -- Serialize refreshes for the same inbox row. This also makes an edit/delete
  -- refresh deterministic when another message is inserted concurrently.
  perform 1
  from public.chat_conversations as conversation_row
  where conversation_row.id = p_conversation_id
  for update;

  if not found then
    return;
  end if;

  select message_row.*
  into v_last
  from public.chat_messages as message_row
  where message_row.conversation_id = p_conversation_id
    and message_row.deleted_at is null
  order by message_row.created_at desc, message_row.id desc
  limit 1;

  if found then
    v_preview := case v_last.message_type
      when 'image' then coalesce(
        nullif(left(v_last.content, 120), ''),
        '[imagem]'
      )
      when 'audio' then coalesce(
        nullif(left(v_last.content, 120), ''),
        '[audio]'
      )
      when 'document' then coalesce(
        nullif(left(v_last.content, 120), ''),
        '[documento]'
      )
      else left(coalesce(v_last.content, ''), 120)
    end;

    update public.chat_conversations as conversation_row
    set
      last_message_at = v_last.created_at,
      last_message_preview = v_preview,
      last_message_sender = v_last.sender_id,
      last_message_type = v_last.message_type,
      archived_by_low = case
        when p_reopen then false
        else conversation_row.archived_by_low
      end,
      archived_by_high = case
        when p_reopen then false
        else conversation_row.archived_by_high
      end
    where conversation_row.id = p_conversation_id;
  else
    update public.chat_conversations as conversation_row
    set
      last_message_at = null,
      last_message_preview = null,
      last_message_sender = null,
      last_message_type = null
    where conversation_row.id = p_conversation_id;
  end if;
end;
$$;

create or replace function kc_private.kc_chat_after_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform kc_private.kc_chat_refresh_conversation_preview(
    new.conversation_id,
    true
  );
  return new;
end;
$$;

create or replace function kc_private.kc_chat_after_message_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform kc_private.kc_chat_refresh_conversation_preview(
    new.conversation_id,
    false
  );
  return new;
end;
$$;

drop trigger if exists chat_msg_after_insert_denormalize
  on public.chat_messages;
create trigger chat_msg_after_insert_denormalize
after insert on public.chat_messages
for each row execute function kc_private.kc_chat_after_message_insert();

drop trigger if exists chat_msg_after_update_refresh_preview
  on public.chat_messages;
create trigger chat_msg_after_update_refresh_preview
after update of content, media_path, edited_at, deleted_at
on public.chat_messages
for each row execute function kc_private.kc_chat_after_message_update();

-- ============================================================================
-- Chat workers omitted from the consolidated baseline
-- ============================================================================

create or replace function kc_private.kc_chat_block_user(
  p_other_user_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_target_id uuid;
  v_low uuid;
  v_high uuid;
  v_reason text := nullif(
    left(btrim(coalesce(p_reason, '')), 500),
    ''
  );
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;
  if p_other_user_id is null then
    raise exception 'invalid_other_user';
  end if;
  if v_user_id = p_other_user_id then
    raise exception 'cannot_block_self';
  end if;

  select profile_row.id
  into v_target_id
  from public.profiles as profile_row
  where profile_row.id = p_other_user_id
  for key share;

  if not found then
    raise exception 'other_user_not_found';
  end if;

  v_low := least(v_user_id, v_target_id);
  v_high := greatest(v_user_id, v_target_id);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'kino-campus:chat-pair:v1:' || v_low::text || ':' || v_high::text,
      20260728
    )
  );

  insert into public.user_blocks (
    blocker_id,
    blocked_id,
    reason
  )
  values (
    v_user_id,
    v_target_id,
    v_reason
  )
  on conflict (blocker_id, blocked_id)
  do update set
    reason = excluded.reason,
    created_at = now();
end;
$$;

create or replace function kc_private.kc_chat_unblock_user(
  p_other_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_low uuid;
  v_high uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;
  if p_other_user_id is null then
    raise exception 'invalid_other_user';
  end if;
  if v_user_id = p_other_user_id then
    raise exception 'cannot_unblock_self';
  end if;

  v_low := least(v_user_id, p_other_user_id);
  v_high := greatest(v_user_id, p_other_user_id);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'kino-campus:chat-pair:v1:' || v_low::text || ':' || v_high::text,
      20260728
    )
  );

  delete from public.user_blocks as block_row
  where block_row.blocker_id = v_user_id
    and block_row.blocked_id = p_other_user_id;
end;
$$;

create or replace function kc_private.kc_chat_is_blocked(
  p_other_user_id uuid
)
returns table (
  out_i_blocked boolean,
  out_they_blocked boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  out_i_blocked := exists (
    select 1
    from public.user_blocks as block_row
    where block_row.blocker_id = v_user_id
      and block_row.blocked_id = p_other_user_id
  );
  out_they_blocked := exists (
    select 1
    from public.user_blocks as block_row
    where block_row.blocker_id = p_other_user_id
      and block_row.blocked_id = v_user_id
  );
  return next;
end;
$$;

create or replace function kc_private.kc_chat_start_conversation(
  p_other_user_id uuid
)
returns table (
  out_conversation_id uuid,
  out_is_new boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_other_id uuid;
  v_low uuid;
  v_high uuid;
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;
  if p_other_user_id is null then
    raise exception 'invalid_other_user';
  end if;
  if v_user_id = p_other_user_id then
    raise exception 'cannot_chat_with_self';
  end if;

  select profile_row.id
  into v_other_id
  from public.profiles as profile_row
  where profile_row.id = p_other_user_id
  for key share;

  if not found then
    raise exception 'other_user_not_found';
  end if;

  v_low := least(v_user_id, v_other_id);
  v_high := greatest(v_user_id, v_other_id);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'kino-campus:chat-pair:v1:' || v_low::text || ':' || v_high::text,
      20260728
    )
  );

  if exists (
    select 1
    from public.user_blocks as block_row
    where (
      block_row.blocker_id = v_user_id
      and block_row.blocked_id = v_other_id
    )
    or (
      block_row.blocker_id = v_other_id
      and block_row.blocked_id = v_user_id
    )
  ) then
    raise exception 'blocked';
  end if;

  select conversation_row.id
  into v_conversation_id
  from public.chat_conversations as conversation_row
  where conversation_row.participant_low = v_low
    and conversation_row.participant_high = v_high;

  if found then
    out_conversation_id := v_conversation_id;
    out_is_new := false;
    return next;
    return;
  end if;

  insert into public.chat_conversations (
    participant_low,
    participant_high
  )
  values (
    v_low,
    v_high
  )
  returning id into v_conversation_id;

  out_conversation_id := v_conversation_id;
  out_is_new := true;
  return next;
end;
$$;

create or replace function kc_private.kc_chat_list_conversations(
  p_limit integer default 30,
  p_before timestamptz default null
)
returns table (
  out_conversation_id uuid,
  out_other_user_id uuid,
  out_other_display_name text,
  out_other_avatar_url text,
  out_last_message_at timestamptz,
  out_last_message_preview text,
  out_last_message_sender uuid,
  out_last_message_type text,
  out_unread_count bigint,
  out_archived boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 100));
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  return query
  with owned_conversations as (
    select
      conversation_row.id,
      case
        when conversation_row.participant_low = v_user_id
          then conversation_row.participant_high
        else conversation_row.participant_low
      end as other_user_id,
      conversation_row.last_message_at,
      conversation_row.last_message_preview,
      conversation_row.last_message_sender,
      conversation_row.last_message_type,
      case
        when conversation_row.participant_low = v_user_id
          then conversation_row.archived_by_low
        else conversation_row.archived_by_high
      end as archived
    from public.chat_conversations as conversation_row
    where (
      conversation_row.participant_low = v_user_id
      or conversation_row.participant_high = v_user_id
    )
      and (
        p_before is null
        or conversation_row.last_message_at < p_before
      )
  )
  select
    owned_row.id,
    owned_row.other_user_id,
    case
      when owned_row.other_user_id is null then 'Conta excluida'
      else coalesce(
        nullif(btrim(profile_row.display_name), ''),
        nullif(btrim(profile_row.full_name), ''),
        'Usuario'
      )
    end,
    case
      when owned_row.other_user_id is null then null
      else profile_row.avatar_url
    end,
    owned_row.last_message_at,
    owned_row.last_message_preview,
    owned_row.last_message_sender,
    owned_row.last_message_type,
    (
      select count(*)::bigint
      from public.chat_messages as message_row
      where message_row.conversation_id = owned_row.id
        and message_row.sender_id is distinct from v_user_id
        and message_row.deleted_at is null
        and message_row.created_at > coalesce(
          (
            select read_row.last_read_at
            from public.chat_read_state as read_row
            where read_row.conversation_id = owned_row.id
              and read_row.user_id = v_user_id
          ),
          'epoch'::timestamptz
        )
    ),
    owned_row.archived
  from owned_conversations as owned_row
  left join public.profiles as profile_row
    on profile_row.id = owned_row.other_user_id
  order by owned_row.last_message_at desc nulls last, owned_row.id
  limit v_limit;
end;
$$;

create or replace function kc_private.kc_chat_mark_read(
  p_conversation_id uuid,
  p_until_message_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_read_at timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  if not exists (
    select 1
    from public.chat_conversations as conversation_row
    where conversation_row.id = p_conversation_id
      and (
        conversation_row.participant_low = v_user_id
        or conversation_row.participant_high = v_user_id
      )
  ) then
    raise exception 'not_a_participant';
  end if;

  if p_until_message_id is not null then
    select least(message_row.created_at, now())
    into v_read_at
    from public.chat_messages as message_row
    where message_row.id = p_until_message_id
      and message_row.conversation_id = p_conversation_id;

    if not found then
      raise exception 'read_marker_wrong_conversation';
    end if;
  end if;

  insert into public.chat_read_state (
    conversation_id,
    user_id,
    last_read_msg_id,
    last_read_at
  )
  values (
    p_conversation_id,
    v_user_id,
    p_until_message_id,
    v_read_at
  )
  on conflict (conversation_id, user_id)
  do update set
    last_read_msg_id = case
      when excluded.last_read_at >= chat_read_state.last_read_at
        then excluded.last_read_msg_id
      else chat_read_state.last_read_msg_id
    end,
    last_read_at = greatest(
      chat_read_state.last_read_at,
      excluded.last_read_at
    );
end;
$$;

create or replace function public.kc_chat_mark_messages_read()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_messages as message_row
  set read_at = new.last_read_at
  where message_row.conversation_id = new.conversation_id
    and message_row.sender_id is distinct from new.user_id
    and message_row.deleted_at is null
    and message_row.read_at is null
    and message_row.created_at <= new.last_read_at;

  return new;
end;
$$;

create or replace function kc_private.kc_chat_unread_total()
returns table (
  out_total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  return query
  select count(*)::bigint
  from public.chat_messages as message_row
  join public.chat_conversations as conversation_row
    on conversation_row.id = message_row.conversation_id
  where (
    conversation_row.participant_low = v_user_id
    or conversation_row.participant_high = v_user_id
  )
    and message_row.sender_id is distinct from v_user_id
    and message_row.deleted_at is null
    and message_row.created_at > coalesce(
      (
        select read_row.last_read_at
        from public.chat_read_state as read_row
        where read_row.conversation_id = conversation_row.id
          and read_row.user_id = v_user_id
      ),
      'epoch'::timestamptz
    );
end;
$$;

create or replace function kc_private.kc_chat_delete_message(
  p_message_id uuid
)
returns table (
  out_media_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_message public.chat_messages%rowtype;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select message_row.*
  into v_message
  from public.chat_messages as message_row
  where message_row.id = p_message_id
  for update;

  if not found then
    raise exception 'message_not_found';
  end if;
  if v_message.sender_id is distinct from v_user_id then
    raise exception 'not_sender';
  end if;
  if v_message.deleted_at is not null then
    raise exception 'already_deleted';
  end if;

  out_media_path := v_message.media_path;

  update public.chat_messages as message_row
  set
    deleted_at = now(),
    content = null,
    media_path = null
  where message_row.id = p_message_id;

  return next;
end;
$$;

create or replace function kc_private.kc_chat_edit_message(
  p_message_id uuid,
  p_new_content text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_message public.chat_messages%rowtype;
  v_new_content text := btrim(coalesce(p_new_content, ''));
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;
  if length(v_new_content) = 0 then
    raise exception 'empty_content';
  end if;
  if length(v_new_content) > 4000 then
    raise exception 'content_too_long';
  end if;

  select message_row.*
  into v_message
  from public.chat_messages as message_row
  where message_row.id = p_message_id
  for update;

  if not found then
    raise exception 'message_not_found';
  end if;
  if v_message.sender_id is distinct from v_user_id then
    raise exception 'not_sender';
  end if;
  if v_message.deleted_at is not null then
    raise exception 'already_deleted';
  end if;
  if v_message.message_type <> 'text' then
    raise exception 'only_text_editable';
  end if;
  if v_message.created_at < now() - interval '24 hours' then
    raise exception 'edit_window_expired';
  end if;

  update public.chat_messages as message_row
  set
    content = v_new_content,
    edited_at = now()
  where message_row.id = p_message_id;
end;
$$;

create or replace function kc_private.kc_chat_report_message(
  p_message_id uuid,
  p_reason text,
  p_details text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_message public.chat_messages%rowtype;
  v_reason text := lower(btrim(coalesce(p_reason, '')));
  v_details text := nullif(
    left(btrim(coalesce(p_details, '')), 1000),
    ''
  );
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;
  if v_reason not in (
    'spam',
    'scam',
    'inappropriate',
    'hate',
    'illegal',
    'duplicate',
    'other',
    'harassment',
    'offensive',
    'misleading',
    'privacy'
  ) then
    raise exception 'invalid_reason';
  end if;

  select message_row.*
  into v_message
  from public.chat_messages as message_row
  where message_row.id = p_message_id;

  if not found then
    raise exception 'message_not_found';
  end if;
  if v_message.sender_id is not distinct from v_user_id then
    raise exception 'cannot_report_own_message';
  end if;
  if not exists (
    select 1
    from public.chat_conversations as conversation_row
    where conversation_row.id = v_message.conversation_id
      and (
        conversation_row.participant_low = v_user_id
        or conversation_row.participant_high = v_user_id
      )
  ) then
    raise exception 'not_a_participant';
  end if;

  begin
    insert into public.reports (
      reporter_id,
      entity_type,
      entity_id,
      reason,
      details,
      status
    )
    values (
      v_user_id,
      'chat_message',
      p_message_id::text,
      v_reason,
      v_details,
      'open'
    );
  exception
    when unique_violation then
      raise exception 'already_reported';
  end;
end;
$$;

-- ============================================================================
-- Closed-post reactivation worker
-- ============================================================================

create or replace function kc_private.kc_reactivate_post(
  p_post_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_post public.posts%rowtype;
  v_now timestamptz := now();
  v_expires_at timestamptz;
  v_limit_check jsonb;
  v_is_admin boolean := false;
  v_is_admin_override boolean := false;
  v_days integer;
begin
  if v_user_id is null and v_role <> 'service_role' then
    return jsonb_build_object(
      'ok', false,
      'code', 'AUTH_REQUIRED',
      'message', 'Faca login para reativar a publicacao.'
    );
  end if;

  select post_row.*
  into v_post
  from public.posts as post_row
  where post_row.id = p_post_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'POST_NOT_FOUND',
      'message', 'Publicacao nao encontrada.'
    );
  end if;

  v_is_admin := v_role = 'service_role'
    or (
      v_user_id is not null
      and public.kc_is_admin(v_user_id)
    );
  v_is_admin_override := v_is_admin
    and v_post.author_id is distinct from v_user_id;

  if v_post.author_id is distinct from v_user_id and not v_is_admin then
    return jsonb_build_object(
      'ok', false,
      'code', 'FORBIDDEN',
      'message', 'Apenas o dono ou administradores podem reativar esta publicacao.'
    );
  end if;

  if v_post.author_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'AUTHOR_DELETED',
      'message', 'Publicacao de conta excluida nao pode ser reativada.'
    );
  end if;

  if v_post.status = 'published' then
    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_ACTIVE',
      'status', 'published',
      'new_status', 'published',
      'expires_at', v_post.expires_at,
      'message', 'Publicacao ja esta ativa.'
    );
  end if;

  if v_post.status <> 'closed' then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_STATUS',
      'message', 'Apenas publicacoes encerradas podem ser reativadas.'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'kino-campus:active-post-limit:v1:'
        || coalesce(v_post.author_id::text, 'deleted')
        || ':'
        || coalesce(v_post.module, ''),
      20260728
    )
  );

  if not v_is_admin_override then
    v_limit_check := public.kc_check_post_limit(
      v_post.author_id,
      v_post.module
    );

    if not coalesce((v_limit_check ->> 'ok')::boolean, false) then
      return jsonb_build_object(
        'ok', false,
        'code', coalesce(
          v_limit_check ->> 'code',
          'LIMIT_REACHED'
        ),
        'message', 'Limite de publicacoes ativas atingido.',
        'limit', v_limit_check -> 'limit',
        'count', v_limit_check -> 'count',
        'module', v_post.module
      );
    end if;
  end if;

  v_days := case
    when v_post.module = 'caronas' then 7
    else 30
  end;
  v_expires_at := case
    when v_post.expires_at is not null
      and v_post.expires_at > v_now
      then v_post.expires_at
    else v_now + make_interval(days => v_days)
  end;

  update public.posts as post_row
  set
    status = 'published',
    expires_at = v_expires_at,
    updated_at = v_now,
    metadata = (
      coalesce(post_row.metadata, '{}'::jsonb)
        - 'closed_at'
        - 'closed_by'
        - 'closed_reason'
    ) || jsonb_build_object(
      'reactivated_at', v_now,
      'reactivated_by', v_user_id,
      'reactivated_from', 'closed'
    )
  where post_row.id = p_post_id;

  perform kc_private.kc_insert_audit_log(
    'post_reactivated',
    'posts',
    p_post_id,
    jsonb_build_object(
      'old_status', 'closed',
      'new_status', 'published',
      'expires_at', v_expires_at,
      'source', case
        when v_is_admin_override then 'admin_reactivate'
        else 'owner_reactivate'
      end,
      'post_author_id', v_post.author_id
    ),
    v_user_id
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'published',
    'new_status', 'published',
    'expires_at', v_expires_at,
    'message', 'Publicacao reativada com sucesso.'
  );
end;
$$;

create or replace function public.kc_reactivate_post(
  p_post_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select kc_private.kc_reactivate_post($1)
$$;

-- ============================================================================
-- Explicit execute surface
-- ============================================================================

revoke all on function kc_private.kc_get_feed_ad_config(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_get_feed_ad_config(text, text, text)
  to anon, authenticated, service_role;

revoke all on function kc_private.kc_get_personalized_tabs(text, integer)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_get_personalized_tabs(text, integer)
  to anon, authenticated, service_role;

revoke all on function public.kc_get_feed_ad_config(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_get_feed_ad_config(text, text, text)
  to anon, authenticated, service_role;

revoke all on function public.kc_get_personalized_tabs(text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_get_personalized_tabs(text, integer)
  to anon, authenticated, service_role;

revoke all on function kc_private.kc_chat_refresh_conversation_preview(
  uuid,
  boolean
)
  from public, anon, authenticated, service_role;

revoke all on function kc_private.kc_chat_after_message_insert()
  from public, anon, authenticated, service_role;

revoke all on function kc_private.kc_chat_after_message_update()
  from public, anon, authenticated, service_role;

revoke all on function kc_private.kc_chat_block_user(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_chat_block_user(uuid, text)
  to authenticated;

revoke all on function kc_private.kc_chat_delete_message(uuid)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_chat_delete_message(uuid)
  to authenticated;

revoke all on function kc_private.kc_chat_edit_message(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_chat_edit_message(uuid, text)
  to authenticated;

revoke all on function kc_private.kc_chat_is_blocked(uuid)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_chat_is_blocked(uuid)
  to authenticated;

revoke all on function kc_private.kc_chat_list_conversations(
  integer,
  timestamptz
)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_chat_list_conversations(
  integer,
  timestamptz
)
  to authenticated;

revoke all on function kc_private.kc_chat_mark_read(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_chat_mark_read(uuid, uuid)
  to authenticated;

revoke all on function kc_private.kc_chat_report_message(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_chat_report_message(uuid, text, text)
  to authenticated;

revoke all on function kc_private.kc_chat_start_conversation(uuid)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_chat_start_conversation(uuid)
  to authenticated;

revoke all on function kc_private.kc_chat_unblock_user(uuid)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_chat_unblock_user(uuid)
  to authenticated;

revoke all on function kc_private.kc_chat_unread_total()
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_chat_unread_total()
  to authenticated;

revoke all on function kc_private.kc_reactivate_post(uuid)
  from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_reactivate_post(uuid)
  to authenticated, service_role;

-- All chat endpoints are authenticated-only, including workers that were
-- already present before this reconciliation.
revoke all on function public.kc_chat_block_user(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_chat_block_user(uuid, text)
  to authenticated;

revoke all on function public.kc_chat_delete_message(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_chat_delete_message(uuid)
  to authenticated;

revoke all on function public.kc_chat_edit_message(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_chat_edit_message(uuid, text)
  to authenticated;

revoke all on function public.kc_chat_is_blocked(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_chat_is_blocked(uuid)
  to authenticated;

revoke all on function public.kc_chat_list_conversations(
  integer,
  timestamptz
)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_chat_list_conversations(
  integer,
  timestamptz
)
  to authenticated;

revoke all on function public.kc_chat_list_messages(
  uuid,
  integer,
  timestamptz
)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_chat_list_messages(
  uuid,
  integer,
  timestamptz
)
  to authenticated;

revoke all on function public.kc_chat_mark_read(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_chat_mark_read(uuid, uuid)
  to authenticated;

revoke all on function public.kc_chat_report_message(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_chat_report_message(uuid, text, text)
  to authenticated;

revoke all on function public.kc_chat_send_message(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_chat_send_message(uuid, text, text, text)
  to authenticated;

revoke all on function public.kc_chat_set_message_reply(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_chat_set_message_reply(uuid, uuid)
  to authenticated;

revoke all on function public.kc_chat_start_conversation(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_chat_start_conversation(uuid)
  to authenticated;

revoke all on function public.kc_chat_toggle_reaction(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_chat_toggle_reaction(uuid, text)
  to authenticated;

revoke all on function public.kc_chat_unblock_user(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_chat_unblock_user(uuid)
  to authenticated;

revoke all on function public.kc_chat_unread_total()
  from public, anon, authenticated, service_role;
grant execute on function public.kc_chat_unread_total()
  to authenticated;

revoke all on function public.kc_chat_mark_messages_read()
  from public, anon, authenticated, service_role;
grant execute on function public.kc_chat_mark_messages_read()
  to service_role;

-- These public wrappers already validate auth.uid()/owner/admin internally.
-- Remove the inherited anonymous EXECUTE grant while preserving service jobs.
revoke all on function public.kc_bump_post(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_bump_post(uuid)
  to authenticated, service_role;

revoke all on function public.kc_check_post_flood_limit(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_check_post_flood_limit(uuid, text)
  to authenticated, service_role;

revoke all on function public.kc_close_post(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_close_post(uuid, text)
  to authenticated, service_role;

revoke all on function public.kc_get_post_flood_limit(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_get_post_flood_limit(uuid, text)
  to authenticated, service_role;

revoke all on function public.kc_reactivate_post(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_reactivate_post(uuid)
  to authenticated, service_role;

revoke all on function public.kc_record_post_audit_event(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_record_post_audit_event(uuid, text, jsonb)
  to authenticated, service_role;

revoke all on function public.kc_renew_post(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_renew_post(uuid)
  to authenticated, service_role;

revoke all on function public.kc_toggle_post_status(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.kc_toggle_post_status(uuid)
  to authenticated, service_role;

comment on function public.kc_get_feed_ad_config(text, text, text) is
  'Retorna somente configuracao publica de anuncios e desabilita superficies sensiveis.';
comment on function public.kc_get_personalized_tabs(text, integer) is
  'Fallback agregado para anon; afinidade autenticada exige consentimento e nunca usa session_id como autorizacao de dados.';
comment on function public.kc_chat_mark_read(uuid, uuid) is
  'Marca leitura apenas para participante e valida que o marcador pertence a mesma conversa.';

notify pgrst, 'reload schema';

commit;

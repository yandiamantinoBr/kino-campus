begin;

-- Expired lifecycle now closes posts instead of moving them to the legacy
-- "expired" status. Closed posts remain public history but do not compete in
-- Destaques.

create or replace function public.kc_compute_highlight_score(p_post_id uuid)
returns double precision
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_votos          int     := 0;
  v_coupon_clicks  int     := 0;
  v_share_count    int     := 0;
  v_created_at     timestamptz;
  v_status         text;
  v_saves_hl       bigint  := 0;
  v_saves_fav      bigint  := 0;
  v_comments       bigint  := 0;
  v_last_comment   timestamptz;
  v_comment_bonus  int     := 0;
  v_age_weeks      double precision;
  v_score          double precision;
begin
  select
    coalesce(votos, 0),
    coalesce(coupon_clicks, 0),
    coalesce(share_count, 0),
    created_at,
    status
  into v_votos, v_coupon_clicks, v_share_count, v_created_at, v_status
  from public.posts
  where id = p_post_id;

  if not found then
    return 0;
  end if;

  if v_status <> 'published' or v_created_at is null then
    return 0;
  end if;

  select count(*) into v_saves_hl
  from public.saved_posts
  where post_id = p_post_id and kind = 'highlight';

  select count(*) into v_saves_fav
  from public.saved_posts
  where post_id = p_post_id and kind = 'favorite';

  begin
    select count(*), max(created_at)
      into v_comments, v_last_comment
      from public.comments
     where post_id = p_post_id;
  exception when others then
    v_comments := 0;
    v_last_comment := null;
  end;

  if v_last_comment is not null then
    if v_last_comment > now() - interval '24 hours' then
      v_comment_bonus := 5;
    elsif v_last_comment > now() - interval '7 days' then
      v_comment_bonus := 3;
    end if;
  end if;

  v_age_weeks := extract(epoch from (now() - v_created_at)) / 604800.0;
  if v_age_weeks < 0 then
    v_age_weeks := 0;
  end if;

  v_score := (
    (v_votos * 10)
    + (v_saves_hl * 8)
    + (v_saves_fav * 5)
    + (v_comments * 3)
    + v_comment_bonus
    + (v_coupon_clicks * 4)
    + (v_share_count * 2)
  )::double precision / (1.0 + v_age_weeks);

  return greatest(v_score, 0);
end;
$$;

create or replace function public.kc_refresh_highlight_scores()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int := 0;
begin
  with scored as (
    select p.id, public.kc_compute_highlight_score(p.id) as new_score
      from public.posts p
     where p.status = 'published'
       and p.created_at > now() - interval '60 days'
  ),
  updated_published as (
    update public.posts p
       set highlight_score = scored.new_score,
           updated_at = now()
      from scored
     where p.id = scored.id
       and p.highlight_score is distinct from scored.new_score
     returning 1
  ),
  updated_closed as (
    update public.posts p
       set highlight_score = 0,
           updated_at = now()
     where p.status = 'closed'
       and coalesce(p.highlight_score, 0) <> 0
     returning 1
  )
  select count(*)::int
    into v_updated
    from (
      select 1 from updated_published
      union all
      select 1 from updated_closed
    ) changed;

  return jsonb_build_object(
    'ok', true,
    'updated_count', v_updated,
    'ran_at', now()
  );
end;
$$;

create or replace function public.kc_expire_old_posts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count bigint := 0;
  v_expired record;
  v_reason text;
begin
  for v_expired in
    select p.id, p.author_id, p.title, p.module, p.status, p.expires_at
      from public.posts p
     where p.expires_at is not null
       and p.expires_at <= now()
       and (
         p.status = 'published'
         or (
           p.status = 'pending'
           and coalesce(p.visibility, 'public') in ('public', 'community')
           and exists (
             select 1
               from public.audit_log al
              where al.entity_type = 'posts'
                and al.entity_id = p.id
                and al.action = 'post_auto_moderated'
                and al.payload->>'original_status' = 'published'
                and al.payload->>'reason' = 'new_user_scrutiny'
           )
         )
       )
     for update of p skip locked
  loop
    v_reason := case
      when v_expired.status = 'pending' then 'auto_expired_pending'
      else 'auto_expired'
    end;

    update public.posts
       set status = 'closed',
           highlight_score = 0,
           updated_at = now(),
           metadata = (coalesce(metadata, '{}'::jsonb) - 'closed_by')
             || jsonb_build_object(
               'closed_at', now()::text,
               'closed_reason', v_reason,
               'closed_from_status', v_expired.status,
               'closed_source', 'system_expiration',
               'expires_at', v_expired.expires_at::text
             )
     where id = v_expired.id;

    if found then
      v_count := v_count + 1;

      begin
        perform public.kc_notify_on_post_expire(
          v_expired.id,
          v_expired.author_id,
          v_expired.title,
          v_expired.module
        );
      exception when others then
        null;
      end;

      begin
        perform public.audit_log_insert(
          'post_closed',
          'posts',
          v_expired.id,
          jsonb_build_object(
            'source', 'system_expiration',
            'reason', v_reason,
            'old_status', v_expired.status,
            'new_status', 'closed',
            'expires_at', v_expired.expires_at
          ),
          null
        );
      exception
        when undefined_function then null;
        when undefined_table then null;
        when insufficient_privilege then null;
      end;
    end if;
  end loop;

  if v_count > 0 then
    begin
      insert into public.audit_log (action, entity_type, entity_id, payload)
      values (
        'posts_auto_closed',
        'system',
        gen_random_uuid(),
        jsonb_build_object('count', v_count, 'ran_at', now()::text)
      );
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'closed_count', v_count,
    'expired_count', v_count
  );
end;
$$;

create or replace function public.kc_get_feed_cursor(
  p_module text default null,
  p_modules text[] default null,
  p_category text default null,
  p_subcategory text default null,
  p_tag text default null,
  p_q text default null,
  p_sort_by text default 'recentes',
  p_limit int default 12,
  p_cursor text default null,
  p_request_params jsonb default null
)
returns jsonb
language plpgsql
set search_path = public
stable
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 12), 50));
  v_sort text := case
    when lower(coalesce(p_sort_by, 'recentes')) = 'votos' then 'votos'
    when lower(coalesce(p_sort_by, 'recentes')) = 'comentados' then 'comentados'
    else 'recentes'
  end;
  v_module_list text[] := array[]::text[];
  v_cursor_json jsonb := null;
  v_cursor_created timestamptz := null;
  v_cursor_id uuid := null;
  v_cursor_highlight double precision := 0;
  v_cursor_votos integer := 0;
  v_cursor_last_comment timestamptz := null;
  v_cursor_effective timestamptz := null;
  v_cursor_status_priority integer := 1;
  v_posts jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_cursor text := null;
  v_date_preset text := null;
  v_price_min numeric := null;
  v_price_max numeric := null;
begin
  if p_modules is not null and array_length(p_modules, 1) > 0 then
    select array_agg(lower(trim(value))) into v_module_list
      from unnest(p_modules) as value
     where nullif(trim(value), '') is not null;
  elsif nullif(trim(coalesce(p_module, '')), '') is not null then
    v_module_list := array[lower(trim(p_module))];
  end if;

  if p_request_params is not null then
    v_date_preset := nullif(trim(coalesce(p_request_params->>'datePreset', p_request_params->>'date_preset', '')), '');
    begin
      v_price_min := nullif(trim(coalesce(p_request_params->>'priceMin', p_request_params->>'price_min', '')), '')::numeric;
    exception when others then
      v_price_min := null;
    end;
    begin
      v_price_max := nullif(trim(coalesce(p_request_params->>'priceMax', p_request_params->>'price_max', '')), '')::numeric;
    exception when others then
      v_price_max := null;
    end;
  end if;

  if nullif(trim(coalesce(p_cursor, '')), '') is not null then
    begin
      v_cursor_json := convert_from(decode(p_cursor, 'base64'), 'utf8')::jsonb;
      v_cursor_created := nullif(v_cursor_json->>'created_at', '')::timestamptz;
      v_cursor_id := nullif(v_cursor_json->>'id', '')::uuid;
      v_cursor_highlight := coalesce(nullif(v_cursor_json->>'highlight_score', '')::double precision, 0);
      v_cursor_votos := coalesce(nullif(v_cursor_json->>'votos', '')::integer, 0);
      v_cursor_last_comment := nullif(v_cursor_json->>'last_comment_at', '')::timestamptz;
      v_cursor_effective := coalesce(
        nullif(v_cursor_json->>'effective_at', '')::timestamptz,
        nullif(v_cursor_json->>'bumped_at', '')::timestamptz,
        v_cursor_created
      );
      v_cursor_status_priority := coalesce(nullif(v_cursor_json->>'status_priority', '')::integer, 1);
    exception when others then
      v_cursor_json := null;
    end;
  end if;

  with filtered as (
    select
      p.id,
      p.legacy_id,
      p.author_id,
      p.title,
      p.description,
      p.price,
      p.location,
      p.module,
      p.category,
      p.status,
      p.visibility,
      case when p.status = 'closed' then 0 else 1 end as status_priority,
      coalesce(p.metadata, '{}'::jsonb) as metadata,
      p.created_at,
      coalesce(p.votos, 0) as votos,
      coalesce(p.highlight_score, 0) as highlight_score,
      p.bumped_at,
      coalesce(p.bumped_at, p.created_at) as effective_at,
      p.last_comment_at,
      case
        when pr.id is null then null
        else jsonb_build_object(
          'id', pr.id,
          'display_name', pr.display_name,
          'full_name', pr.full_name,
          'avatar_url', pr.avatar_url,
          'verified', coalesce(pr.verified, false)
        )
      end as profile_payload,
      coalesce(pm.items, '[]'::jsonb) as media_payload,
      coalesce(cc.comment_count, 0) as comment_count
    from public.posts p
    left join public.profiles pr on pr.id = p.author_id
    left join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('id', m.id, 'url', m.url, 'is_cover', m.is_cover)
          order by m.is_cover desc, m.id asc
        ),
        '[]'::jsonb
      ) as items
      from public.post_media m
      where m.post_id = p.id
    ) pm on true
    left join lateral (
      select count(*)::int as comment_count
      from public.comments c
      where c.post_id = p.id
    ) cc on true
    where p.legacy_id is null
      and p.status in ('published', 'closed')
      and public.kc_can_read_post(p.author_id, p.status, p.visibility)
      and (coalesce(array_length(v_module_list, 1), 0) = 0 or lower(coalesce(p.module, '')) = any(v_module_list))
      and (p_category is null or lower(coalesce(p.category, '')) = lower(p_category))
      and (
        p_subcategory is null
        or lower(coalesce(
          p.metadata->>'subcategory',
          p.metadata->>'subcategoria',
          p.metadata->>'subcategoryKey',
          p.metadata->>'subcategoriaKey',
          ''
        )) = lower(p_subcategory)
      )
      and (
        p_tag is null
        or coalesce(p.metadata->'tagKeys', '[]'::jsonb) @> jsonb_build_array(lower(p_tag))
      )
      and (
        coalesce(nullif(btrim(p_q), ''), null) is null
        or p.title ilike '%' || btrim(p_q) || '%'
        or p.description ilike '%' || btrim(p_q) || '%'
      )
      and public.kc_matches_feed_request_params(
        p.module,
        p.category,
        coalesce(
          p.metadata->>'subcategory',
          p.metadata->>'subcategoria',
          p.metadata->>'subcategoryKey',
          p.metadata->>'subcategoriaKey',
          ''
        ),
        p.title,
        p.description,
        coalesce(p.metadata, '{}'::jsonb),
        coalesce(pr.verified, false),
        p_request_params
      )
      and public.kc_feed_matches_date_preset(
        p.module,
        p.created_at,
        coalesce(p.metadata, '{}'::jsonb),
        v_date_preset
      )
      and (v_price_min is null or (p.price is not null and p.price >= v_price_min))
      and (v_price_max is null or (p.price is not null and p.price <= v_price_max))
      and (
        v_cursor_json is null
        or (
          v_sort = 'votos'
          and row(case when p.status = 'closed' then 0 else 1 end, coalesce(p.highlight_score, 0), coalesce(p.votos, 0), p.created_at, p.id)
              < row(v_cursor_status_priority, v_cursor_highlight, v_cursor_votos, v_cursor_created, v_cursor_id)
        )
        or (
          v_sort = 'comentados'
          and p.last_comment_at is not null
          and row(p.last_comment_at, p.created_at, p.id)
              < row(v_cursor_last_comment, v_cursor_created, v_cursor_id)
        )
        or (
          v_sort = 'recentes'
          and row(coalesce(p.bumped_at, p.created_at), p.created_at, p.id)
              < row(v_cursor_effective, v_cursor_created, v_cursor_id)
        )
      )
      and (v_sort <> 'comentados' or p.last_comment_at is not null)
  ),
  limited as (
    select *
    from filtered
    order by
      case when v_sort = 'votos' then status_priority end desc nulls last,
      case when v_sort = 'votos' then highlight_score end desc nulls last,
      case when v_sort = 'votos' then votos end desc nulls last,
      case when v_sort = 'comentados' then last_comment_at end desc nulls last,
      case when v_sort = 'recentes' then effective_at end desc nulls last,
      created_at desc,
      id desc
    limit v_limit + 1
  ),
  kept as (
    select *
    from limited
    order by
      case when v_sort = 'votos' then status_priority end desc nulls last,
      case when v_sort = 'votos' then highlight_score end desc nulls last,
      case when v_sort = 'votos' then votos end desc nulls last,
      case when v_sort = 'comentados' then last_comment_at end desc nulls last,
      case when v_sort = 'recentes' then effective_at end desc nulls last,
      created_at desc,
      id desc
    limit v_limit
  ),
  cursor_row as (
    select *
    from kept
    order by
      case when v_sort = 'votos' then status_priority end desc nulls last,
      case when v_sort = 'votos' then highlight_score end desc nulls last,
      case when v_sort = 'votos' then votos end desc nulls last,
      case when v_sort = 'comentados' then last_comment_at end desc nulls last,
      case when v_sort = 'recentes' then effective_at end desc nulls last,
      created_at desc,
      id desc
    offset greatest(v_limit - 1, 0)
    limit 1
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', kept.id,
          'legacy_id', kept.legacy_id,
          'author_id', kept.author_id,
          'title', kept.title,
          'description', kept.description,
          'price', kept.price,
          'location', kept.location,
          'module', kept.module,
          'category', kept.category,
          'status', kept.status,
          'visibility', kept.visibility,
          'metadata', kept.metadata,
          'created_at', kept.created_at,
          'votos', kept.votos,
          'highlight_score', kept.highlight_score,
          'bumped_at', kept.bumped_at,
          'effective_at', kept.effective_at,
          'last_comment_at', kept.last_comment_at,
          'profiles', kept.profile_payload,
          'post_media', kept.media_payload,
          'comments', jsonb_build_array(jsonb_build_object('count', kept.comment_count))
        )
        order by
          case when v_sort = 'votos' then kept.status_priority end desc nulls last,
          case when v_sort = 'votos' then kept.highlight_score end desc nulls last,
          case when v_sort = 'votos' then kept.votos end desc nulls last,
          case when v_sort = 'comentados' then kept.last_comment_at end desc nulls last,
          case when v_sort = 'recentes' then kept.effective_at end desc nulls last,
          kept.created_at desc,
          kept.id desc
      ),
      '[]'::jsonb
    ),
    (select count(*) > v_limit from limited),
    case
      when (select count(*) > v_limit from limited) then (
        select encode(
          convert_to(
            jsonb_build_object(
              'sort', v_sort,
              'status_priority', cursor_row.status_priority,
              'highlight_score', cursor_row.highlight_score,
              'votos', cursor_row.votos,
              'last_comment_at', cursor_row.last_comment_at,
              'effective_at', cursor_row.effective_at,
              'bumped_at', cursor_row.bumped_at,
              'created_at', cursor_row.created_at,
              'id', cursor_row.id
            )::text,
            'utf8'
          ),
          'base64'
        )
        from cursor_row
      )
      else null
    end
    into v_posts, v_has_more, v_next_cursor
  from kept;

  return jsonb_build_object(
    'ok', true,
    'posts', coalesce(v_posts, '[]'::jsonb),
    'hasMore', coalesce(v_has_more, false),
    'has_more', coalesce(v_has_more, false),
    'nextCursor', v_next_cursor,
    'next_cursor', v_next_cursor
  );
end;
$$;

with moved as (
  update public.posts p
     set status = 'closed',
         highlight_score = 0,
         updated_at = now(),
         metadata = (coalesce(p.metadata, '{}'::jsonb) - 'closed_by')
           || jsonb_build_object(
             'closed_at', coalesce(p.expires_at, p.updated_at, now())::text,
             'closed_reason', 'closed_from_expired',
             'closed_from_status', 'expired',
             'closed_source', 'data_migration'
           )
   where p.status = 'expired'
   returning p.id
)
insert into public.audit_log (action, entity_type, entity_id, payload)
select
  'posts_closed_from_expired',
  'system',
  gen_random_uuid(),
  jsonb_build_object('count', count(*)::int, 'ran_at', now()::text)
from moved
having count(*) > 0;

with moved as (
  update public.posts p
     set status = 'closed',
         highlight_score = 0,
         updated_at = now(),
         metadata = (coalesce(p.metadata, '{}'::jsonb) - 'closed_by')
           || jsonb_build_object(
             'closed_at', now()::text,
             'closed_reason', 'closed_from_stale_pending',
             'closed_from_status', 'pending',
             'closed_source', 'data_migration',
             'stale_pending_threshold_days', 21
           )
   where p.status = 'pending'
     and p.legacy_id is null
     and coalesce(p.visibility, 'public') in ('public', 'community')
     and (
       p.expires_at <= now()
       or p.created_at <= now() - interval '21 days'
     )
     and exists (
       select 1
         from public.audit_log al
        where al.entity_type = 'posts'
          and al.entity_id = p.id
          and al.action = 'post_auto_moderated'
          and al.payload->>'original_status' = 'published'
          and al.payload->>'reason' = 'new_user_scrutiny'
     )
   returning p.id
)
insert into public.audit_log (action, entity_type, entity_id, payload)
select
  'posts_closed_from_stale_pending',
  'system',
  gen_random_uuid(),
  jsonb_build_object('count', count(*)::int, 'ran_at', now()::text)
from moved
having count(*) > 0;

select public.kc_refresh_highlight_scores();

notify pgrst, 'reload schema';

commit;

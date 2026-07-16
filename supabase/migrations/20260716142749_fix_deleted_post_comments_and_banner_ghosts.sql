begin;

-- Forward-only correction for two analytics edge cases:
-- 1. comments attached to deleted posts must not earn contributor points;
-- 2. non-banner events mislabeled with entity_type = 'banner' must not create
--    zero-valued ghost rows in the banner aggregate.
-- Public RPC signatures and their caller-aware authorization remain unchanged.

create or replace function kc_private.kc_admin_privacy_analytics_impl(
  p_since timestamptz default null,
  p_event_name text default 'all',
  p_page_path text default 'all',
  p_module_key text default 'all',
  p_limit integer default 500,
  p_offset integer default 0
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
  v_since timestamptz := coalesce(p_since, now() - interval '30 days');
  v_event_name text := nullif(
    lower(trim(coalesce(p_event_name, 'all'))),
    'all'
  );
  v_page_path text := nullif(trim(coalesce(p_page_path, 'all')), 'all');
  v_module_key text := nullif(trim(coalesce(p_module_key, 'all')), 'all');
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 1000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if v_role <> 'service_role'
     and (v_uid is null or not public.kc_is_admin(v_uid)) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  with filtered as materialized (
    select event_row.*
    from public.privacy_analytics_events as event_row
    where event_row.created_at >= v_since
      and (v_event_name is null or event_row.event_name = v_event_name)
      and (v_page_path is null or event_row.page_path = v_page_path)
      and (v_module_key is null or event_row.module_key = v_module_key)
  ),
  canonical_searches as materialized (
    select search_row.id
    from public.search_queries as search_row
    where search_row.created_at >= v_since
      and (v_event_name is null or v_event_name = 'search')
      and (
        v_page_path is null
        or lower(ltrim(v_page_path, '/')) = 'search-results.html'
      )
      and v_module_key is null
  ),
  consent_filtered as materialized (
    select consent_row.*
    from public.privacy_consent_events as consent_row
    where consent_row.created_at >= v_since
  )
  select jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'since', v_since,
    'totals', jsonb_build_object(
      'events', (select count(*) from filtered),
      'sessions', (select count(distinct session_hash) from filtered),
      'searches', (
        select count(*) from canonical_searches
      ),
      'banner_impressions', (
        select count(*)
        from filtered
        where event_name = 'banner_impression'
          and entity_type = 'banner'
      ),
      'banner_clicks', (
        select count(*)
        from filtered
        where event_name = 'banner_click'
          and entity_type = 'banner'
      ),
      'help_submits', (
        select count(*) from filtered where event_name = 'help_submit'
      ),
      'report_submits', (
        select count(*) from filtered where event_name = 'report_submit'
      )
    ),
    'consent', jsonb_build_object(
      'updates', (select count(*) from consent_filtered),
      'analytics_accepted', (
        select count(*) from consent_filtered where analytics_enabled is true
      ),
      'analytics_rejected', (
        select count(*) from consent_filtered where analytics_enabled is false
      ),
      'preferences_accepted', (
        select count(*)
        from consent_filtered
        where preferences_enabled is true
      )
    ),
    'by_event', coalesce((
      select jsonb_agg(
        to_jsonb(event_summary)
        order by event_summary.events desc, event_summary.event_name
      )
      from (
        select
          event_name,
          count(*)::bigint as events,
          count(distinct session_hash)::bigint as sessions
        from filtered
        group by event_name
      ) as event_summary
    ), '[]'::jsonb),
    'by_page', coalesce((
      select jsonb_agg(
        to_jsonb(page_summary)
        order by page_summary.events desc, page_summary.page_path
      )
      from (
        select
          page_path,
          count(*)::bigint as events,
          count(distinct session_hash)::bigint as sessions
        from filtered
        group by page_path
        order by events desc
        limit 30
      ) as page_summary
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(to_jsonb(day_summary) order by day_summary.day)
      from (
        select
          (created_at at time zone 'America/Sao_Paulo')::date as day,
          count(*)::bigint as events,
          count(distinct session_hash)::bigint as sessions
        from filtered
        group by 1
        order by 1
      ) as day_summary
    ), '[]'::jsonb),
    'banners', coalesce((
      select jsonb_agg(
        to_jsonb(banner_summary)
        order by banner_summary.ctr desc,
          banner_summary.clicks desc,
          banner_summary.impressions desc
      )
      from (
        select
          coalesce(
            nullif(entity_id, ''),
            metadata ->> 'entity_label',
            'banner'
          ) as entity_id,
          max(
            coalesce(metadata ->> 'entity_label', entity_id, 'Banner')
          ) as label,
          count(*) filter (
            where event_name = 'banner_impression'
          )::bigint as impressions,
          count(*) filter (
            where event_name = 'banner_click'
          )::bigint as clicks,
          case
            when count(*) filter (
              where event_name = 'banner_impression'
            ) = 0 then 0
            else round(
              (
                count(*) filter (where event_name = 'banner_click')
              )::numeric
              / nullif(
                (
                  count(*) filter (where event_name = 'banner_impression')
                )::numeric,
                0
              ) * 100,
              2
            )
          end as ctr
        from filtered
        where entity_type = 'banner'
          and event_name in ('banner_impression', 'banner_click')
        group by coalesce(
          nullif(entity_id, ''),
          metadata ->> 'entity_label',
          'banner'
        )
      ) as banner_summary
    ), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(
        to_jsonb(event_detail)
        order by event_detail.created_at desc
      )
      from (
        select
          created_at,
          event_name,
          page_path,
          entity_type,
          entity_id,
          module_key,
          metadata
        from filtered
        order by created_at desc
        limit v_limit
        offset v_offset
      ) as event_detail
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

create or replace function kc_private.kc_get_top_contributors_impl(
  p_period text default 'month',
  p_module text default null,
  p_limit integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_jwt_role text := coalesce(nullif(auth.jwt() ->> 'role', ''), 'anon');
  v_period text := lower(trim(coalesce(p_period, 'month')));
  v_module text := nullif(trim(coalesce(p_module, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 100));
  v_since timestamptz;
  v_is_admin boolean;
  v_is_authenticated boolean;
  v_result jsonb;
begin
  v_is_admin := v_jwt_role = 'service_role'
    or (v_uid is not null and public.kc_is_admin(v_uid));
  v_is_authenticated := v_is_admin or v_jwt_role = 'authenticated';

  v_since := case v_period
    when 'day' then now() - interval '1 day'
    when 'week' then now() - interval '7 days'
    when 'month' then now() - interval '30 days'
    when 'quarter' then now() - interval '90 days'
    when 'year' then now() - interval '365 days'
    else now() - interval '30 days'
  end;

  with eligible_profiles as materialized (
    select
      profile_row.id,
      profile_row.display_name,
      profile_row.avatar_url
    from public.profiles as profile_row
    where v_is_authenticated
      or profile_row.profile_public is true
  ),
  visible_posts as materialized (
    select post_row.*
    from public.posts as post_row
    where post_row.author_id is not null
      and (v_module is null or post_row.module = v_module)
      and (
        v_is_admin
        or (
          post_row.status in ('published', 'closed')
          and (
            (
              v_is_authenticated
              and post_row.visibility in ('public', 'community')
            )
            or (
              not v_is_authenticated
              and post_row.visibility = 'public'
            )
          )
        )
      )
  ),
  period_posts as materialized (
    select post_row.*
    from visible_posts as post_row
    where post_row.status <> 'deleted'
      and post_row.created_at >= v_since
      and post_row.created_at <= now()
  ),
  user_posts as (
    select
      post_row.author_id,
      count(*)::bigint as posts_count,
      -- Current hot-minus-cold balance on posts created in the selected period.
      coalesce(sum(post_row.votos), 0)::bigint as total_votes,
      coalesce(sum(post_row.coupon_clicks), 0)::bigint as total_coupon_clicks,
      coalesce(sum(post_row.share_count), 0)::bigint as total_shares
    from period_posts as post_row
    inner join eligible_profiles as profile_row
      on profile_row.id = post_row.author_id
    group by post_row.author_id
  ),
  user_comments as (
    select
      comment_row.author_id,
      count(*)::bigint as comments_count
    from public.comments as comment_row
    inner join visible_posts as comment_post
      on comment_post.id = comment_row.post_id
      and comment_post.status <> 'deleted'
    inner join eligible_profiles as profile_row
      on profile_row.id = comment_row.author_id
    where comment_row.created_at >= v_since
      and comment_row.created_at <= now()
      and comment_row.author_id is not null
    group by comment_row.author_id
  ),
  user_penalties as (
    select
      post_row.author_id,
      count(distinct post_row.id)::bigint as penalty_count
    from public.posts as post_row
    inner join public.reports as report_row
      on report_row.post_id = post_row.id
      and report_row.status = 'closed'
    where v_is_admin
      and post_row.status = 'deleted'
      and post_row.created_at >= v_since
      and post_row.created_at <= now()
      and post_row.author_id is not null
      and (v_module is null or post_row.module = v_module)
    group by post_row.author_id
  ),
  scores as (
    select
      coalesce(user_posts.author_id, user_comments.author_id) as user_id,
      coalesce(user_posts.posts_count, 0)::bigint as posts_count,
      coalesce(user_posts.total_votes, 0)::bigint as votes_received,
      coalesce(user_comments.comments_count, 0)::bigint as comments_count,
      coalesce(user_posts.total_coupon_clicks, 0)::bigint as coupon_clicks,
      coalesce(user_posts.total_shares, 0)::bigint as share_count,
      case
        when v_is_admin then coalesce(user_penalties.penalty_count, 0)
        else 0
      end::bigint as penalties,
      greatest(
        0,
        coalesce(user_posts.posts_count, 0) * 15
          + coalesce(user_posts.total_votes, 0) * 10
          + coalesce(user_comments.comments_count, 0) * 5
          + coalesce(user_posts.total_coupon_clicks, 0) * 4
          + coalesce(user_posts.total_shares, 0) * 3
          - case
              when v_is_admin
                then coalesce(user_penalties.penalty_count, 0) * 50
              else 0
            end
      )::bigint as score
    from user_posts
    full outer join user_comments
      on user_posts.author_id = user_comments.author_id
    left join user_penalties
      on coalesce(user_posts.author_id, user_comments.author_id)
        = user_penalties.author_id
  ),
  ranked as (
    select
      scores.*,
      coalesce(
        nullif(trim(profile_row.display_name), ''),
        U&'Usu\00E1rio'
      ) as display_name,
      profile_row.avatar_url,
      row_number() over (
        order by scores.score desc, scores.posts_count desc, scores.user_id
      ) as rank
    from scores
    inner join eligible_profiles as profile_row
      on profile_row.id = scores.user_id
    where scores.score > 0
    order by scores.score desc, scores.posts_count desc, scores.user_id
    limit v_limit
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user_id', ranked.user_id,
      'display_name', ranked.display_name,
      'avatar_url', ranked.avatar_url,
      'rank', ranked.rank,
      'score', ranked.score,
      'posts_count', ranked.posts_count,
      'votes_received', ranked.votes_received,
      'comments_count', ranked.comments_count,
      'coupon_clicks', ranked.coupon_clicks,
      'share_count', ranked.share_count,
      'penalties', ranked.penalties
    )
    order by ranked.rank
  ), '[]'::jsonb)
  into v_result
  from ranked;

  return v_result;
end;
$$;

revoke all on function kc_private.kc_admin_privacy_analytics_impl(
  timestamptz, text, text, text, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_admin_privacy_analytics_impl(
  timestamptz, text, text, text, integer, integer
) to authenticated, service_role;

revoke all on function kc_private.kc_get_top_contributors_impl(
  text, text, integer
) from public, anon, authenticated, service_role;
grant execute on function kc_private.kc_get_top_contributors_impl(
  text, text, integer
) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;

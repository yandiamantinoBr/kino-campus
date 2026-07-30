begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(118);

select extensions.ok(
  not pg_catalog.has_function_privilege('anon', signature, 'execute'),
  signature || ' is not executable by anon'
)
from unnest(array[
  'public.check_report_rate_limit()',
  'public.kc_anti_spam_gate()',
  'public.kc_check_comment_depth()',
  'public.kc_compute_highlight_score(uuid)',
  'public.kc_count_active_posts(uuid,text)',
  'public.kc_count_recent_posts(uuid,text,integer)',
  'public.kc_expire_old_posts()',
  'public.kc_get_post_limit(uuid,text)',
  'public.kc_handle_new_profile_user()',
  'public.kc_handle_new_user()',
  'public.kc_is_invited_email(text)',
  'public.kc_notify_on_comment()',
  'public.kc_notify_on_comment_reply()',
  'public.kc_notify_on_post_expire(uuid,uuid,text,text)',
  'public.kc_notify_on_vote()',
  'public.kc_profiles_enforce_email_verified()',
  'public.kc_refresh_highlight_scores()',
  'public.kc_set_post_expires_at()',
  'public.kc_sync_profile_rating_aggregates(uuid)',
  'public.kc_trigger_update_highlight_score()',
  'public.kc_update_post_last_comment_at()',
  'public.kc_user_ratings_set_updated_at()',
  'public.kc_user_ratings_sync_target()',
  'public.sync_post_votes_count()',
  'public.trg_notify_admin_reports_threshold()'
]::text[]) as internal_rpc(signature);

select extensions.ok(
  not pg_catalog.has_function_privilege('authenticated', signature, 'execute'),
  signature || ' is not executable directly by authenticated'
)
from unnest(array[
  'public.check_report_rate_limit()',
  'public.kc_anti_spam_gate()',
  'public.kc_check_comment_depth()',
  'public.kc_compute_highlight_score(uuid)',
  'public.kc_count_active_posts(uuid,text)',
  'public.kc_count_recent_posts(uuid,text,integer)',
  'public.kc_expire_old_posts()',
  'public.kc_get_post_limit(uuid,text)',
  'public.kc_handle_new_profile_user()',
  'public.kc_handle_new_user()',
  'public.kc_is_invited_email(text)',
  'public.kc_notify_on_comment()',
  'public.kc_notify_on_comment_reply()',
  'public.kc_notify_on_post_expire(uuid,uuid,text,text)',
  'public.kc_notify_on_vote()',
  'public.kc_profiles_enforce_email_verified()',
  'public.kc_refresh_highlight_scores()',
  'public.kc_set_post_expires_at()',
  'public.kc_sync_profile_rating_aggregates(uuid)',
  'public.kc_trigger_update_highlight_score()',
  'public.kc_update_post_last_comment_at()',
  'public.kc_user_ratings_set_updated_at()',
  'public.kc_user_ratings_sync_target()',
  'public.sync_post_votes_count()',
  'public.trg_notify_admin_reports_threshold()'
]::text[]) as internal_rpc(signature);

select extensions.ok(
  case
    when signature = any(array[
      'public.check_report_rate_limit()',
      'public.kc_anti_spam_gate()',
      'public.kc_check_comment_depth()',
      'public.kc_handle_new_profile_user()',
      'public.kc_handle_new_user()',
      'public.kc_notify_on_comment()',
      'public.kc_notify_on_comment_reply()',
      'public.kc_notify_on_vote()',
      'public.kc_profiles_enforce_email_verified()',
      'public.kc_set_post_expires_at()',
      'public.kc_trigger_update_highlight_score()',
      'public.kc_update_post_last_comment_at()',
      'public.kc_user_ratings_set_updated_at()',
      'public.kc_user_ratings_sync_target()',
      'public.sync_post_votes_count()',
      'public.trg_notify_admin_reports_threshold()'
    ]::text[])
      then not pg_catalog.has_function_privilege(
        'service_role',
        signature,
        'execute'
      )
    else pg_catalog.has_function_privilege(
      'service_role',
      signature,
      'execute'
    )
  end,
  signature || ' has the expected service_role boundary'
)
from unnest(array[
  'public.check_report_rate_limit()',
  'public.kc_anti_spam_gate()',
  'public.kc_check_comment_depth()',
  'public.kc_compute_highlight_score(uuid)',
  'public.kc_count_active_posts(uuid,text)',
  'public.kc_count_recent_posts(uuid,text,integer)',
  'public.kc_expire_old_posts()',
  'public.kc_get_post_limit(uuid,text)',
  'public.kc_handle_new_profile_user()',
  'public.kc_handle_new_user()',
  'public.kc_is_invited_email(text)',
  'public.kc_notify_on_comment()',
  'public.kc_notify_on_comment_reply()',
  'public.kc_notify_on_post_expire(uuid,uuid,text,text)',
  'public.kc_notify_on_vote()',
  'public.kc_profiles_enforce_email_verified()',
  'public.kc_refresh_highlight_scores()',
  'public.kc_set_post_expires_at()',
  'public.kc_sync_profile_rating_aggregates(uuid)',
  'public.kc_trigger_update_highlight_score()',
  'public.kc_update_post_last_comment_at()',
  'public.kc_user_ratings_set_updated_at()',
  'public.kc_user_ratings_sync_target()',
  'public.sync_post_votes_count()',
  'public.trg_notify_admin_reports_threshold()'
]::text[]) as internal_rpc(signature);

select extensions.ok(
  not pg_catalog.has_function_privilege('anon', signature, 'execute'),
  signature || ' is not executable by anon'
)
from unnest(array[
  'public.kc_check_post_limit(uuid,text)',
  'public.kc_admin_list_banners()',
  'public.kc_admin_banner_audit(uuid)'
]::text[]) as protected_rpc(signature);

select extensions.ok(
  pg_catalog.has_function_privilege('authenticated', signature, 'execute'),
  signature || ' remains reachable by authenticated callers'
)
from unnest(array[
  'public.kc_check_post_limit(uuid,text)',
  'public.kc_admin_list_banners()',
  'public.kc_admin_banner_audit(uuid)'
]::text[]) as protected_rpc(signature);

select extensions.ok(
  pg_catalog.has_function_privilege('service_role', signature, 'execute'),
  signature || ' remains executable by service_role'
)
from unnest(array[
  'public.kc_check_post_limit(uuid,text)',
  'public.kc_admin_list_banners()',
  'public.kc_admin_banner_audit(uuid)'
]::text[]) as protected_rpc(signature);

select extensions.ok(
  pg_catalog.has_function_privilege('anon', 'public.kc_get_user_rating_summary(uuid)', 'execute'),
  'public rating summaries remain available to anon'
);
select extensions.ok(
  pg_catalog.has_function_privilege('authenticated', 'public.kc_get_user_rating_summary(uuid)', 'execute'),
  'rating summaries remain available to authenticated'
);
select extensions.ok(
  pg_catalog.has_function_privilege('service_role', 'public.kc_get_user_rating_summary(uuid)', 'execute'),
  'rating summaries remain available to service_role'
);

select extensions.ok(
  not pg_catalog.has_function_privilege('anon', signature, 'execute'),
  signature || ' is not executable by anon'
)
from unnest(array[
  'public.kc_track_home_category_affinity(text,jsonb)',
  'public.kc_list_home_category_affinity(text,integer,integer)',
  'public.kc_merge_home_category_affinity(text)'
]::text[]) as affinity_rpc(signature);

select extensions.ok(
  pg_catalog.has_function_privilege('authenticated', signature, 'execute'),
  signature || ' remains available to authenticated'
)
from unnest(array[
  'public.kc_track_home_category_affinity(text,jsonb)',
  'public.kc_list_home_category_affinity(text,integer,integer)',
  'public.kc_merge_home_category_affinity(text)'
]::text[]) as affinity_rpc(signature);

select extensions.ok(
  not pg_catalog.has_function_privilege('service_role', signature, 'execute'),
  signature || ' cannot bypass owner scoping via service_role'
)
from unnest(array[
  'public.kc_track_home_category_affinity(text,jsonb)',
  'public.kc_list_home_category_affinity(text,integer,integer)',
  'public.kc_merge_home_category_affinity(text)'
]::text[]) as affinity_rpc(signature);

select extensions.ok(
  not pg_catalog.has_function_privilege(
    role_name,
    'kc_private.kc_home_user_has_analytics_consent(uuid,text)',
    'execute'
  ),
  'private consent helper is hidden from ' || role_name
)
from unnest(array['anon', 'authenticated', 'service_role']::text[])
  as caller(role_name);

select extensions.ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.kc_mark_invite_used()',
    'execute'
  ),
  'anon cannot mark an invitation as used'
);
select extensions.ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.kc_mark_invite_used()',
    'execute'
  ),
  'authenticated can mark only their own invitation as used'
);
select extensions.ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.kc_mark_invite_used()',
    'execute'
  ),
  'service_role can maintain invitation usage'
);

select extensions.is(
  (
    select count(*)::integer
    from public.home_category_affinity
    where owner_kind = 'session'
  ),
  0,
  'legacy anonymous affinity rows are removed'
);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000501', 'private-owner@example.test'),
  ('00000000-0000-4000-8000-000000000502', 'ordinary-user@example.test'),
  ('00000000-0000-4000-8000-000000000503', 'rpc-admin@example.test'),
  ('00000000-0000-4000-8000-000000000504', 'public-profile@example.test');

insert into auth.sessions (id, user_id)
values
  (
    '10000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000501'
  ),
  (
    '10000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000502'
  ),
  (
    '10000000-0000-4000-8000-000000000503',
    '00000000-0000-4000-8000-000000000503'
  );

insert into public.profiles (
  id,
  full_name,
  is_admin,
  profile_public,
  rating_avg,
  rating_count
)
values
  (
    '00000000-0000-4000-8000-000000000501',
    'Private Owner',
    false,
    false,
    4.75,
    2
  ),
  (
    '00000000-0000-4000-8000-000000000502',
    'Ordinary User',
    false,
    false,
    3.50,
    1
  ),
  (
    '00000000-0000-4000-8000-000000000503',
    'RPC Admin',
    true,
    false,
    null,
    0
  ),
  (
    '00000000-0000-4000-8000-000000000504',
    'Public Profile',
    false,
    true,
    4.25,
    2
  );

insert into public.privacy_consent_events (
  session_hash,
  user_id,
  consent_version,
  preferences_enabled,
  analytics_enabled,
  source
)
values (
  encode(
    extensions.digest('owner-browser-session-20260728', 'sha256'),
    'hex'
  ),
  null,
  'test',
  true,
  true,
  'pgtap'
);

set local role anon;

select extensions.is(
  (
    public.kc_get_user_rating_summary(
      '00000000-0000-4000-8000-000000000501'
    ) ->> 'count'
  )::integer,
  0,
  'anon cannot read a private rating summary'
);
select extensions.is(
  (
    public.kc_get_user_rating_summary(
      '00000000-0000-4000-8000-000000000504'
    ) ->> 'count'
  )::integer,
  2,
  'anon can still read a public rating summary'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000502","role":"authenticated","session_id":"10000000-0000-4000-8000-000000000502"}',
  true
);
set local role authenticated;

select extensions.throws_ok(
  $$select count(*) from public.kc_admin_list_banners()$$,
  '42501',
  'admin access required',
  'an ordinary user cannot list administrative banners'
);
select extensions.throws_ok(
  $$select count(*) from public.kc_admin_banner_audit(gen_random_uuid())$$,
  '42501',
  'admin access required',
  'an ordinary user cannot read banner audit snapshots'
);
select extensions.is(
  public.kc_check_post_limit(
    '00000000-0000-4000-8000-000000000501',
    'eventos'
  ) ->> 'code',
  'FORBIDDEN',
  'an ordinary user cannot inspect another user post limit'
);
select extensions.is(
  public.kc_check_post_limit(
    '00000000-0000-4000-8000-000000000502',
    'eventos'
  ) ->> 'code',
  null,
  'an ordinary user can inspect their own post limit'
);
select extensions.is(
  (
    public.kc_get_user_rating_summary(
      '00000000-0000-4000-8000-000000000501'
    ) ->> 'count'
  )::integer,
  0,
  'another authenticated user cannot read a private rating summary'
);
select extensions.is(
  public.kc_track_home_category_affinity(
    'ordinary-browser-session-20260728',
    '[{"module_key":"eventos","category_key":"academicos","delta":5}]'::jsonb
  ),
  0,
  'server affinity rejects a user without an affirmative session consent'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000501","role":"authenticated","session_id":"10000000-0000-4000-8000-000000000501"}',
  true
);
set local role authenticated;

select extensions.is(
  (
    public.kc_get_user_rating_summary(
      '00000000-0000-4000-8000-000000000501'
    ) ->> 'count'
  )::integer,
  2,
  'the subject can read their own private rating summary'
);
select extensions.is(
  public.kc_track_home_category_affinity(
    'owner-browser-session-20260728',
    '[{"module_key":"eventos","category_key":"academicos","delta":5}]'::jsonb
  ),
  1,
  'a consented authenticated owner can record affinity'
);
select extensions.is(
  (
    select affinity_row.score
    from public.kc_list_home_category_affinity(
      'owner-browser-session-20260728',
      10,
      0
    ) as affinity_row
    where affinity_row.module_key = 'eventos'
      and affinity_row.category_key = 'academicos'
  ),
  5::numeric,
  'a consented owner can read only their recorded affinity'
);
select extensions.is(
  public.kc_merge_home_category_affinity(
    'owner-browser-session-20260728'
  ),
  0,
  'legacy anonymous merge is a safe no-op'
);
select extensions.is(
  (
    select count(*)::integer
    from public.home_category_affinity
    where user_id = '00000000-0000-4000-8000-000000000501'
      and session_id is not null
  ),
  0,
  'authenticated affinity never persists a raw browser session id'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000503","role":"authenticated","session_id":"10000000-0000-4000-8000-000000000503"}',
  true
);
set local role authenticated;

select extensions.lives_ok(
  $$select count(*) from public.kc_admin_list_banners()$$,
  'an administrator can list administrative banners'
);
select extensions.is(
  (
    public.kc_get_user_rating_summary(
      '00000000-0000-4000-8000-000000000501'
    ) ->> 'count'
  )::integer,
  2,
  'an administrator can inspect a private rating summary'
);

reset role;

select * from extensions.finish();

rollback;

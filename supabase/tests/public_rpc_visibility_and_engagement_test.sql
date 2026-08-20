begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(68);

select extensions.ok(
  not pg_catalog.has_function_privilege('anon', signature, 'execute'),
  signature || ' is not executable by anon'
)
from unnest(array[
  'public.increment_comment_likes(uuid)',
  'public.kc_get_my_votes(uuid[])',
  'public.kc_get_post_analytics(uuid)',
  'public.kc_get_user_rating_state(uuid,uuid)',
  'public.kc_report_post(uuid,text,text)',
  'public.kc_upsert_user_rating(uuid,uuid,integer,text)'
]::text[]) as owner_rpc(signature);

select extensions.ok(
  pg_catalog.has_function_privilege('anon', 'public.kc_track_view(uuid)', 'execute'),
  'public.kc_track_view(uuid) is callable by anon as a safe no-op boundary'
);

select pg_catalog.set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select extensions.is(
  public.kc_track_view('00000000-0000-4000-8000-000000000001'::uuid),
  '{"ok": false, "code": "AUTH_REQUIRED"}'::jsonb,
  'anonymous kc_track_view returns AUTH_REQUIRED without touching data'
);
reset role;

select extensions.ok(
  pg_catalog.has_function_privilege('authenticated', signature, 'execute'),
  signature || ' remains available to authenticated'
)
from unnest(array[
  'public.increment_comment_likes(uuid)',
  'public.kc_get_my_votes(uuid[])',
  'public.kc_get_post_analytics(uuid)',
  'public.kc_get_user_rating_state(uuid,uuid)',
  'public.kc_report_post(uuid,text,text)',
  'public.kc_track_view(uuid)',
  'public.kc_upsert_user_rating(uuid,uuid,integer,text)'
]::text[]) as owner_rpc(signature);

select extensions.ok(
  pg_catalog.has_function_privilege('service_role', signature, 'execute'),
  signature || ' remains available to service_role'
)
from unnest(array[
  'public.increment_comment_likes(uuid)',
  'public.kc_get_my_votes(uuid[])',
  'public.kc_get_post_analytics(uuid)',
  'public.kc_get_user_rating_state(uuid,uuid)',
  'public.kc_report_post(uuid,text,text)',
  'public.kc_track_view(uuid)',
  'public.kc_upsert_user_rating(uuid,uuid,integer,text)'
]::text[]) as owner_rpc(signature);

select extensions.ok(
  pg_catalog.has_function_privilege('anon', signature, 'execute'),
  signature || ' remains callable by anonymous RLS policies'
)
from unnest(array[
  'public.kc_is_admin(uuid)',
  'public.kc_is_operator(uuid)'
]::text[]) as identity_helper(signature);

select extensions.ok(
  pg_catalog.has_function_privilege('authenticated', signature, 'execute'),
  signature || ' remains available to authenticated policies'
)
from unnest(array[
  'public.kc_is_admin(uuid)',
  'public.kc_is_operator(uuid)'
]::text[]) as identity_helper(signature);

select extensions.ok(
  pg_catalog.has_function_privilege('service_role', signature, 'execute'),
  signature || ' remains available to service_role'
)
from unnest(array[
  'public.kc_is_admin(uuid)',
  'public.kc_is_operator(uuid)'
]::text[]) as identity_helper(signature);

select extensions.ok(
  pg_catalog.has_function_privilege('anon', signature, 'execute'),
  signature || ' remains available to anon'
)
from unnest(array[
  'public.kc_get_profile_access_state(uuid)',
  'public.kc_home_category_post_counts()',
  'public.kc_track_coupon_click(uuid)',
  'public.kc_track_share(uuid)'
]::text[]) as public_rpc(signature);

select extensions.ok(
  pg_catalog.has_function_privilege('authenticated', signature, 'execute'),
  signature || ' remains available to authenticated'
)
from unnest(array[
  'public.kc_get_profile_access_state(uuid)',
  'public.kc_home_category_post_counts()',
  'public.kc_track_coupon_click(uuid)',
  'public.kc_track_share(uuid)'
]::text[]) as public_rpc(signature);

select extensions.ok(
  pg_catalog.has_function_privilege('service_role', signature, 'execute'),
  signature || ' remains available to service_role'
)
from unnest(array[
  'public.kc_get_profile_access_state(uuid)',
  'public.kc_home_category_post_counts()',
  'public.kc_track_coupon_click(uuid)',
  'public.kc_track_share(uuid)'
]::text[]) as public_rpc(signature);

select extensions.ok(
  not pg_catalog.has_function_privilege(
    role_name,
    'kc_private.kc_claim_post_engagement_slot(uuid,text,integer)',
    'execute'
  ),
  'engagement limiter is hidden from ' || role_name
)
from unnest(array['anon', 'authenticated', 'service_role']::text[])
  as caller(role_name);

select extensions.ok(
  not pg_catalog.has_table_privilege(
    role_name,
    'public.post_engagement_rate_windows',
    'select'
  ),
  'engagement windows are hidden from ' || role_name
)
from unnest(array['anon', 'authenticated']::text[])
  as caller(role_name);

select extensions.ok(
  pg_catalog.has_table_privilege(
    'service_role',
    'public.post_engagement_rate_windows',
    'select'
  ),
  'service_role can maintain engagement windows'
);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000551', 'private-profile@example.test'),
  ('00000000-0000-4000-8000-000000000552', 'ordinary-profile@example.test'),
  ('00000000-0000-4000-8000-000000000553', 'visibility-admin@example.test'),
  ('00000000-0000-4000-8000-000000000554', 'public-profile@example.test');

insert into auth.sessions (id, user_id)
values
  (
    '10000000-0000-4000-8000-000000000551',
    '00000000-0000-4000-8000-000000000551'
  ),
  (
    '10000000-0000-4000-8000-000000000552',
    '00000000-0000-4000-8000-000000000552'
  ),
  (
    '10000000-0000-4000-8000-000000000553',
    '00000000-0000-4000-8000-000000000553'
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
    '00000000-0000-4000-8000-000000000551',
    'Private Profile',
    false,
    false,
    4.5,
    2
  ),
  (
    '00000000-0000-4000-8000-000000000552',
    'Ordinary Profile',
    false,
    false,
    null,
    0
  ),
  (
    '00000000-0000-4000-8000-000000000553',
    'Visibility Admin',
    true,
    false,
    null,
    0
  ),
  (
    '00000000-0000-4000-8000-000000000554',
    'Public Profile',
    false,
    true,
    4.25,
    1
  );

set local session_replication_role = replica;
insert into public.posts (
  id,
  author_id,
  title,
  description,
  module,
  category,
  status,
  visibility,
  updated_at
)
values
  (
    '00000000-0000-4000-8000-000000000561',
    '00000000-0000-4000-8000-000000000554',
    'Evento público',
    'Post público para contagem.',
    'eventos',
    'academicos',
    'published',
    'public',
    '2026-01-01 00:00:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000000562',
    '00000000-0000-4000-8000-000000000554',
    'Evento da comunidade',
    'Post comunitário para contagem.',
    'eventos',
    'academicos',
    'published',
    'community',
    '2026-01-01 00:00:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000000563',
    '00000000-0000-4000-8000-000000000554',
    'Evento pendente',
    'Contexto ainda não visível.',
    'eventos',
    'academicos',
    'pending',
    'community',
    '2026-01-01 00:00:00+00'
  );
set local session_replication_role = origin;

set local role anon;

select extensions.is(
  public.kc_is_admin(
    'abfb1831-6ad3-4f40-b55b-788e29f146f0'
  ),
  false,
  'anonymous callers cannot probe a known operator identity'
);
select extensions.is(
  (
    select access_row."exists"
    from public.kc_get_profile_access_state(
      '00000000-0000-4000-8000-000000000551'
    ) as access_row
  ),
  false,
  'anon cannot distinguish a private profile from a missing profile'
);
select extensions.is(
  (
    select access_row."exists"
    from public.kc_get_profile_access_state(
      '00000000-0000-4000-8000-000000000554'
    ) as access_row
  ),
  true,
  'anon can resolve a public profile'
);
select extensions.is(
  (
    select count_row.count
    from public.kc_home_category_post_counts() as count_row
    where count_row.module_key = 'eventos'
      and count_row.category_key = 'academico'
  ),
  1::bigint,
  'anonymous category counts include only public posts'
);
select extensions.is(
  public.kc_track_share(
    '00000000-0000-4000-8000-000000000562'
  ) ->> 'code',
  'NOT_FOUND',
  'anon cannot use tracking to probe a community-only post'
);
select extensions.is(
  (
    public.kc_track_share(
      '00000000-0000-4000-8000-000000000561'
    ) ->> 'counted'
  )::boolean,
  true,
  'a visible public share is counted'
);
select extensions.is(
  (
    select updated_at
    from public.posts
    where id = '00000000-0000-4000-8000-000000000561'
  ),
  '2026-01-01 00:00:00+00'::timestamptz,
  'engagement tracking does not change editorial updated_at'
);
select extensions.is(
  (
    public.kc_track_coupon_click(
      '00000000-0000-4000-8000-000000000561'
    ) ->> 'counted'
  )::boolean,
  true,
  'a visible public coupon click is counted'
);

reset role;
update public.post_engagement_rate_windows
   set event_count = case
     when event_type = 'share' then 25
     else 50
   end
 where post_id = '00000000-0000-4000-8000-000000000561';

set local role anon;
select extensions.is(
  public.kc_track_share(
    '00000000-0000-4000-8000-000000000561'
  ) ->> 'code',
  'RATE_LIMITED',
  'the daily share ceiling rejects further increments'
);
select extensions.is(
  (
    select share_count
    from public.posts
    where id = '00000000-0000-4000-8000-000000000561'
  ),
  1,
  'a rate-limited share does not change the aggregate'
);
select extensions.is(
  public.kc_track_coupon_click(
    '00000000-0000-4000-8000-000000000561'
  ) ->> 'code',
  'RATE_LIMITED',
  'the daily coupon-click ceiling rejects further increments'
);
select extensions.is(
  (
    select coupon_clicks
    from public.posts
    where id = '00000000-0000-4000-8000-000000000561'
  ),
  1,
  'a rate-limited coupon click does not change the aggregate'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000552","role":"authenticated","session_id":"10000000-0000-4000-8000-000000000552"}',
  true
);
set local role authenticated;

select extensions.is(
  public.kc_is_admin(
    '00000000-0000-4000-8000-000000000553'
  ),
  false,
  'an authenticated user cannot probe another account admin status'
);
select extensions.is(
  (
    select access_row."exists"
    from public.kc_get_profile_access_state(
      '00000000-0000-4000-8000-000000000551'
    ) as access_row
  ),
  false,
  'an unrelated authenticated user cannot enumerate a private profile'
);
select extensions.is(
  public.kc_get_user_rating_state(
    '00000000-0000-4000-8000-000000000551',
    null
  ) ->> 'reason',
  'TARGET_NOT_FOUND',
  'rating state does not reveal a private target to another user'
);
select extensions.is(
  (
    select count_row.count
    from public.kc_home_category_post_counts() as count_row
    where count_row.module_key = 'eventos'
      and count_row.category_key = 'academico'
  ),
  2::bigint,
  'authenticated category counts include public and community posts'
);
select extensions.is(
  (
    public.kc_track_share(
      '00000000-0000-4000-8000-000000000562'
    ) ->> 'counted'
  )::boolean,
  true,
  'an authenticated member can count a visible community share'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000551","role":"authenticated","session_id":"10000000-0000-4000-8000-000000000551"}',
  true
);
set local role authenticated;

select extensions.is(
  (
    select access_row."exists"
    from public.kc_get_profile_access_state(
      '00000000-0000-4000-8000-000000000551'
    ) as access_row
  ),
  true,
  'the owner can resolve their own private profile'
);
select extensions.is(
  public.kc_get_user_rating_state(
    '00000000-0000-4000-8000-000000000551',
    null
  ) ->> 'reason',
  'SELF',
  'the owner can resolve their own rating state'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000553","role":"authenticated","session_id":"10000000-0000-4000-8000-000000000553"}',
  true
);
set local role authenticated;

select extensions.is(
  (
    select access_row."exists"
    from public.kc_get_profile_access_state(
      '00000000-0000-4000-8000-000000000551'
    ) as access_row
  ),
  true,
  'an administrator can resolve a private profile'
);
select extensions.isnt(
  public.kc_get_user_rating_state(
    '00000000-0000-4000-8000-000000000551',
    null
  ) ->> 'reason',
  'TARGET_NOT_FOUND',
  'an administrator can inspect the private target state'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
set local role service_role;

select extensions.is(
  (
    select count_row.count
    from public.kc_home_category_post_counts() as count_row
    where count_row.module_key = 'eventos'
      and count_row.category_key = 'academico'
  ),
  2::bigint,
  'service_role category counts include all published visibility levels'
);

reset role;

select * from extensions.finish();

rollback;

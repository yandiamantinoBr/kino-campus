begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(12);

-- Public facades for advisor-flagged RPCs must be INVOKER (clears 0028/0029).
select extensions.ok(
  (
    select pg_catalog.bool_and(not procedure_row.prosecdef)
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid = any (array[
      'public.kc_is_admin(uuid)'::regprocedure,
      'public.kc_is_operator(uuid)'::regprocedure,
      'public.kc_check_post_limit(uuid,text)'::regprocedure,
      'public.kc_admin_list_banners()'::regprocedure,
      'public.kc_admin_banner_audit(uuid)'::regprocedure,
      'public.kc_get_user_rating_summary(uuid)'::regprocedure,
      'public.kc_get_user_rating_state(uuid,uuid)'::regprocedure,
      'public.kc_get_profile_access_state(uuid)'::regprocedure,
      'public.kc_home_category_post_counts()'::regprocedure,
      'public.kc_track_coupon_click(uuid)'::regprocedure,
      'public.kc_track_share(uuid)'::regprocedure,
      'public.kc_track_home_category_affinity(text,jsonb)'::regprocedure,
      'public.kc_list_home_category_affinity(text,integer,integer)'::regprocedure,
      'public.kc_merge_home_category_affinity(text)'::regprocedure,
      'public.kc_mark_invite_used()'::regprocedure,
      'public.kc_enforce_active_session_pre_request()'::regprocedure,
      'public.kc_create_help_request(jsonb)'::regprocedure,
      'public.kc_create_help_request_with_notification_claim(jsonb)'::regprocedure,
      'public.kc_create_help_request_with_notification_claim_v2(jsonb)'::regprocedure,
      'public.kc_create_privacy_help_request_v1(jsonb)'::regprocedure,
      'public.kc_recover_privacy_help_request_v1(jsonb)'::regprocedure
    ])
  ),
  'all advisor-flagged public entrypoints are SECURITY INVOKER'
);

-- Private implementations stay SECURITY DEFINER.
select extensions.ok(
  (
    select pg_catalog.bool_and(procedure_row.prosecdef)
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid = any (array[
      'kc_private.kc_is_admin_impl(uuid)'::regprocedure,
      'kc_private.kc_is_operator_impl(uuid)'::regprocedure,
      'kc_private.kc_check_post_limit_impl(uuid,text)'::regprocedure,
      'kc_private.kc_admin_list_banners_impl()'::regprocedure,
      'kc_private.kc_admin_banner_audit_impl(uuid)'::regprocedure,
      'kc_private.kc_get_user_rating_summary_impl(uuid)'::regprocedure,
      'kc_private.kc_get_user_rating_state_impl(uuid,uuid)'::regprocedure,
      'kc_private.kc_get_profile_access_state_impl(uuid)'::regprocedure,
      'kc_private.kc_home_category_post_counts_impl()'::regprocedure,
      'kc_private.kc_track_coupon_click_impl(uuid)'::regprocedure,
      'kc_private.kc_track_share_impl(uuid)'::regprocedure,
      'kc_private.kc_track_home_category_affinity_impl(text,jsonb)'::regprocedure,
      'kc_private.kc_list_home_category_affinity_impl(text,integer,integer)'::regprocedure,
      'kc_private.kc_merge_home_category_affinity_impl(text)'::regprocedure,
      'kc_private.kc_mark_invite_used_impl()'::regprocedure,
      'kc_private.kc_enforce_active_session_pre_request_impl()'::regprocedure,
      'kc_private.kc_create_help_request(jsonb)'::regprocedure,
      'kc_private.kc_create_privacy_help_request_v1(jsonb)'::regprocedure
    ])
  ),
  'private workers remain SECURITY DEFINER'
);

-- Client-facing grants on public names stay product-correct.
select extensions.ok(
  pg_catalog.has_function_privilege('anon', 'public.kc_is_admin(uuid)', 'execute')
  and pg_catalog.has_function_privilege(
    'authenticated',
    'public.kc_is_admin(uuid)',
    'execute'
  ),
  'is_admin public facade remains available to RLS roles'
);

select extensions.ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.kc_admin_list_banners()',
    'execute'
  )
  and pg_catalog.has_function_privilege(
    'authenticated',
    'public.kc_admin_list_banners()',
    'execute'
  ),
  'admin banner list stays authenticated-only'
);

select extensions.ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.kc_check_post_limit(uuid,text)',
    'execute'
  )
  and pg_catalog.has_function_privilege(
    'authenticated',
    'public.kc_check_post_limit(uuid,text)',
    'execute'
  ),
  'post limit stays authenticated-only'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'anon',
    'public.kc_get_user_rating_summary(uuid)',
    'execute'
  )
  and pg_catalog.has_function_privilege(
    'anon',
    'public.kc_home_category_post_counts()',
    'execute'
  )
  and pg_catalog.has_function_privilege(
    'anon',
    'public.kc_track_share(uuid)',
    'execute'
  ),
  'public product reads/engagement remain available to anon'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'anon',
    'public.kc_create_help_request(jsonb)',
    'execute'
  )
  and pg_catalog.has_function_privilege(
    'anon',
    'public.kc_create_privacy_help_request_v1(jsonb)',
    'execute'
  ),
  'guest Help RPCs remain available to anon'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'anon',
    'kc_private.kc_is_admin_impl(uuid)',
    'execute'
  )
  and pg_catalog.has_function_privilege(
    'authenticated',
    'kc_private.kc_admin_list_banners_impl()',
    'execute'
  )
  and pg_catalog.has_function_privilege(
    'anon',
    'kc_private.kc_create_help_request(jsonb)',
    'execute'
  ),
  'private impls grant EXECUTE to the roles that run INVOKER facades'
);

select extensions.ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.kc_track_home_category_affinity(text,jsonb)',
    'execute'
  )
  and pg_catalog.has_function_privilege(
    'authenticated',
    'public.kc_track_home_category_affinity(text,jsonb)',
    'execute'
  ),
  'affinity RPCs stay authenticated-only'
);

select extensions.ok(
  pg_catalog.has_function_privilege(
    'authenticator',
    'public.kc_enforce_active_session_pre_request()',
    'execute'
  )
  and pg_catalog.has_function_privilege(
    'authenticator',
    'kc_private.kc_enforce_active_session_pre_request_impl()',
    'execute'
  ),
  'pre-request gate remains executable for PostgREST authenticator'
);

select extensions.ok(
  current_setting('role.authenticator.pgrst.db_pre_request', true)
    is not distinct from 'public.kc_enforce_active_session_pre_request'
  or current_setting('pgrst.db_pre_request', true)
    is not distinct from 'public.kc_enforce_active_session_pre_request'
  or exists (
    select 1
    from pg_catalog.pg_db_role_setting
    where setrole = 'authenticator'::regrole
      and setconfig @> array[
        'pgrst.db_pre_request=public.kc_enforce_active_session_pre_request'
      ]
  ),
  'authenticator still points pre-request at the public facade'
);

select extensions.ok(
  (
    select pg_catalog.bool_and(
      procedure_row.proconfig @> array['search_path=""']
    )
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid = any (array[
      'public.kc_is_admin(uuid)'::regprocedure,
      'public.kc_create_help_request(jsonb)'::regprocedure,
      'kc_private.kc_is_admin_impl(uuid)'::regprocedure
    ])
  ),
  'wrappers and private admin helper pin empty search_path'
);

select extensions.finish();

rollback;

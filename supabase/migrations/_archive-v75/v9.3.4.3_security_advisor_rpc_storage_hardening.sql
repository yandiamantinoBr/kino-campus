-- KinoCampus v9.3.4.3
-- Reduce Security Advisor noise without removing public read surfaces.

begin;

drop policy if exists storage_kino_media_public_read on storage.objects;

do $$
declare
  v_fn regprocedure;
  v_signature text;
begin
  for v_fn in
    select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef = true
  loop
    execute format('revoke execute on function %s from public, anon', v_fn);
  end loop;

  foreach v_signature in array array[
    'public.kc_get_profile_highlights(uuid,integer,integer)',
    'public.kc_get_profile_highlights_count(uuid)',
    'public.kc_get_profile_access_state(uuid)',
    'public.kc_related_posts(uuid,integer)',
    'public.kc_get_top_contributors(text,text,integer)',
    'public.kc_get_user_rating_summary(uuid)',
    'public.kc_list_user_ratings(uuid,integer,integer)',
    'public.kc_home_category_post_counts()',
    'public.kc_list_home_category_affinity(text,integer,integer)',
    'public.kc_track_home_category_affinity(text,jsonb)',
    'public.kc_track_coupon_click(uuid)',
    'public.kc_track_share(uuid)',
    'public.kc_track_view(uuid)'
  ]
  loop
    v_fn := to_regprocedure(v_signature);
    if v_fn is not null then
      execute format('grant execute on function %s to anon, authenticated', v_fn);
    end if;
  end loop;

  foreach v_signature in array array[
    'public.increment_comment_likes(uuid)',
    'public.check_report_rate_limit()',
    'public.kc_is_admin(uuid)',
    'public.kc_admin_get_invites()',
    'public.kc_admin_revoke_invite(text)',
    'public.kc_admin_list_help_requests_paged(text,text,integer,integer)',
    'public.kc_admin_list_banners()',
    'public.kc_admin_save_banner(jsonb)',
    'public.kc_admin_delete_banner(uuid)',
    'public.kc_admin_reorder_banners(jsonb)',
    'public.kc_admin_banner_audit(uuid)',
    'public.kc_admin_list_audit_logs(text,text,text,integer)',
    'public.kc_admin_list_audit_logs(text,text,text,integer,integer,timestamp with time zone)',
    'public.kc_admin_list_reports(text,text,integer)',
    'public.kc_admin_dashboard_daily_metrics(timestamp with time zone)',
    'public.kc_admin_search_trends(integer)',
    'public.kc_admin_search_trends(integer,timestamp with time zone)',
    'public.kc_admin_search_posts_full(text,text,integer,integer)',
    'public.kc_admin_set_post_status(uuid,text,boolean)',
    'public.kc_admin_close_reports(uuid)',
    'public.kc_admin_get_post_limits()',
    'public.kc_admin_set_post_limit(uuid,text,integer)',
    'public.kc_admin_delete_post_limit(uuid)',
    'public.kc_admin_get_user_active_posts_count(uuid)',
    'public.kc_admin_list_posts_by_ids(uuid[])',
    'public.kc_get_notifications(integer,integer)',
    'public.kc_mark_notifications_read(uuid[])',
    'public.kc_mark_all_notifications_read()',
    'public.kc_unread_notification_count()',
    'public.kc_get_my_saved_posts(text,integer,integer)',
    'public.kc_get_my_saved_posts_count(text)',
    'public.kc_get_my_votes(uuid[])',
    'public.kc_check_post_limit(uuid,text)',
    'public.kc_get_post_limit(uuid,text)',
    'public.kc_report_post(uuid,text,text)',
    'public.kc_close_post(uuid,text)',
    'public.kc_toggle_post_status(uuid)',
    'public.kc_renew_post(uuid)',
    'public.kc_bump_post(uuid)',
    'public.kc_get_user_rating_state(uuid,uuid)',
    'public.kc_upsert_user_rating(uuid,uuid,integer,text)',
    'public.kc_merge_home_category_affinity(text)',
    'public.kc_increment_location_usage(text)',
    'public.kc_upsert_custom_location(text,text)',
    'public.kc_check_duplicate_post(uuid,text,text,double precision)',
    'public.kc_get_post_analytics(uuid)'
  ]
  loop
    v_fn := to_regprocedure(v_signature);
    if v_fn is not null then
      execute format('grant execute on function %s to authenticated, service_role', v_fn);
    end if;
  end loop;

  foreach v_signature in array array[
    'public.handle_new_user()',
    'public.kc_handle_new_user()',
    'public.kc_handle_new_profile_user()',
    'public.kc_anti_spam_gate()',
    'public.kc_check_comment_depth()',
    'public.kc_compute_highlight_score(uuid)',
    'public.kc_count_active_posts(uuid,text)',
    'public.kc_count_recent_notification_deliveries(uuid,text,timestamp with time zone)',
    'public.kc_emit_notification_event(uuid,text,text,text,jsonb)',
    'public.kc_enqueue_notification_delivery(uuid,text,text,text,text,jsonb,uuid)',
    'public.kc_claim_notification_delivery_batch(text,integer,text)',
    'public.kc_record_notification_delivery_attempt(uuid,text,text,text,jsonb,text,text,timestamp with time zone)',
    'public.kc_expire_old_posts()',
    'public.kc_notify_on_comment()',
    'public.kc_notify_on_comment_reply()',
    'public.kc_notify_on_post_expire(uuid,uuid,text,text)',
    'public.kc_notify_on_vote()',
    'public.kc_profiles_enforce_email_verified()',
    'public.kc_prune_old_analytics()',
    'public.kc_prune_old_notifications()',
    'public.kc_refresh_highlight_scores()',
    'public.kc_resolve_notification_delivery_destination(uuid,text)',
    'public.kc_set_post_expires_at()',
    'public.kc_sync_profile_rating_aggregates(uuid)',
    'public.kc_toggle_demo_posts(boolean)',
    'public.kc_touch_notification_channel_target_consent()',
    'public.kc_trigger_notification_dispatch(text,integer,boolean,text)',
    'public.kc_trigger_update_highlight_score()',
    'public.kc_update_post_last_comment_at()',
    'public.kc_user_ratings_set_updated_at()',
    'public.kc_user_ratings_sync_target()',
    'public.notify_admin_if_reports_threshold(uuid)',
    'public.sync_post_votes_count()',
    'public.trg_notify_admin_reports_threshold()'
  ]
  loop
    v_fn := to_regprocedure(v_signature);
    if v_fn is not null then
      execute format('grant execute on function %s to service_role', v_fn);
    end if;
  end loop;
end $$;

commit;

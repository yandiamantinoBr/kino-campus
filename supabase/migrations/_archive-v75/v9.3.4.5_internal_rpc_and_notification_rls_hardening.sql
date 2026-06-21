-- KinoCampus v9.3.4.5
-- Restrict internal SECURITY DEFINER routines and add explicit service-role policies.

begin;

do $$
declare
  v_fn regprocedure;
  v_signature text;
begin
  foreach v_signature in array array[
    'public.check_report_rate_limit()',
    'public.handle_new_user()',
    'public.kc_admin_add_invite(text,text)',
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
    'public.kc_handle_new_user()',
    'public.kc_handle_new_profile_user()',
    'public.kc_is_invited_email(text)',
    'public.kc_mark_invite_used()',
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
      execute format('revoke execute on function %s from public, anon, authenticated', v_fn);
      execute format('grant execute on function %s to service_role', v_fn);
    end if;
  end loop;
end $$;

drop policy if exists notification_delivery_attempts_service_role_all on public.notification_delivery_attempts;
create policy notification_delivery_attempts_service_role_all
  on public.notification_delivery_attempts
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists notification_delivery_outbox_service_role_all on public.notification_delivery_outbox;
create policy notification_delivery_outbox_service_role_all
  on public.notification_delivery_outbox
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists notification_dispatch_runs_service_role_all on public.notification_dispatch_runs;
create policy notification_dispatch_runs_service_role_all
  on public.notification_dispatch_runs
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists notification_dispatch_runtime_service_role_all on public.notification_dispatch_runtime;
create policy notification_dispatch_runtime_service_role_all
  on public.notification_dispatch_runtime
  for all
  to service_role
  using (true)
  with check (true);

commit;

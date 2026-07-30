-- Strict post-deploy health probe. Run through the read-only Management API
-- after one authenticated worker invocation; every returned value must be true.
select
  coalesce(
    (
      kc_private.kc_data_export_retention_configuration_status(
        '__KC_EXPECTED_PROJECT_REF__'
      )
        ->> 'ok'
    )::boolean,
    false
  ) as schedule_configuration_healthy,
  exists (
    select 1
    from kc_private.data_export_retention_schedule_state state_row
    where state_row.singleton
      and state_row.last_success_at > now() - interval '2 hours'
      and state_row.consecutive_failures = 0
      and state_row.operational_alert is null
  ) as recent_success_recorded,
  not exists (
    select 1
    from kc_private.data_export_retention_alerts alert_row
    where alert_row.active
  ) as no_active_retention_alert,
  not exists (
    select 1
    from kc_private.data_export_retention_runs run_row
    where run_row.status = 'running'
      and run_row.started_at <= now() - interval '30 minutes'
  ) as no_stale_retention_run,
  not exists (
    select 1
    from kc_private.data_export_artifacts artifact_row
    where (
      artifact_row.status = 'claimed'
      and artifact_row.claim_expires_at <= now() - interval '30 minutes'
    ) or (
      artifact_row.status = 'purging'
      and artifact_row.purge_reason = 'retention'
      and artifact_row.updated_at <= now() - interval '30 minutes'
    )
  ) as no_stale_export_retention_backlog;

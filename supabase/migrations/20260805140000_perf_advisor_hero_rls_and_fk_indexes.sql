-- 20260805140000_perf_advisor_hero_rls_and_fk_indexes.sql
-- Performance Advisor cleanup for project wacyrkwhkvzwkqpolrbg
--
-- WARNs (2):
--   1) auth_rls_initplan on public.hero_banners.banners_admin_select_all
--      (auth.uid() re-evaluated per row)
--   2) multiple_permissive_policies for authenticated SELECT on hero_banners
--      (banners_admin_select_all + banners_anon_authenticated_select_active)
--
-- INFO (16): unindexed_foreign_keys — add covering btree indexes on FK columns.
--
-- INFO unused_index (60): intentionally NOT dropped. Many back admin/chat/report
-- paths that are cold on free-tier traffic but still required operationally.
-- Dropping them would risk regressions without proven write-path benefit.
--
-- INFO auth_db_connections_absolute: Auth config (not SQL). Handled separately
-- via Management API (db_max_pool_size_unit = percent).

begin;

-- ---------------------------------------------------------------------------
-- 1) hero_banners SELECT policies — one per role, initplan-safe admin check
-- ---------------------------------------------------------------------------
-- Preserve visitor contract from 20260804003000:
--   * anon sees only is_active = true (no profiles join, no auth.uid())
--   * authenticated sees active rows; admins also see inactive draft rows
--   * single permissive SELECT policy for authenticated (clears 0006)
--   * admin helper uses (select auth.uid()) (clears 0003)

drop policy if exists banners_anon_authenticated_select_active on public.hero_banners;
drop policy if exists banners_admin_select_all on public.hero_banners;
drop policy if exists banners_select_active_anon on public.hero_banners;
drop policy if exists banners_select_authenticated on public.hero_banners;

create policy banners_select_active_anon
  on public.hero_banners
  for select
  to anon
  using (is_active = true);

create policy banners_select_authenticated
  on public.hero_banners
  for select
  to authenticated
  using (
    is_active = true
    or public.kc_is_admin((select auth.uid()))
  );

comment on policy banners_select_active_anon on public.hero_banners is
  'Visitors see only active hero banners. No auth helpers (avoids profiles RLS join).';

comment on policy banners_select_authenticated on public.hero_banners is
  'Authenticated: active banners for everyone; admins also see inactive. Single permissive SELECT policy; admin check is initplan-safe.';

-- ---------------------------------------------------------------------------
-- 2) Covering indexes for unindexed foreign keys (advisor INFO 0001)
-- ---------------------------------------------------------------------------

-- kc_private.account_erasure_completion_outbox
create index if not exists account_erasure_completion_outbox_data_subject_request_id_idx
  on kc_private.account_erasure_completion_outbox (data_subject_request_id);

-- kc_private.account_erasure_ticket_identity_links
create index if not exists account_erasure_ticket_identity_links_actor_user_id_idx
  on kc_private.account_erasure_ticket_identity_links (actor_user_id);

create index if not exists account_erasure_ticket_identity_links_owner_user_id_idx
  on kc_private.account_erasure_ticket_identity_links (owner_user_id);

-- kc_private.data_export_artifacts
create index if not exists data_export_artifacts_claimed_by_idx
  on kc_private.data_export_artifacts (claimed_by);

create index if not exists data_export_artifacts_owner_user_id_idx
  on kc_private.data_export_artifacts (owner_user_id);

create index if not exists data_export_artifacts_purge_erasure_request_id_idx
  on kc_private.data_export_artifacts (purge_erasure_request_id);

-- kc_private.data_export_media_refs
create index if not exists data_export_media_refs_owner_user_id_idx
  on kc_private.data_export_media_refs (owner_user_id);

-- kc_private.data_export_processor_tasks
create index if not exists data_export_processor_tasks_resolved_by_idx
  on kc_private.data_export_processor_tasks (resolved_by);

-- kc_private.data_export_retention_alerts
create index if not exists data_export_retention_alerts_last_run_id_idx
  on kc_private.data_export_retention_alerts (last_run_id);

-- kc_private.data_export_ticket_identity_links
create index if not exists data_export_ticket_identity_links_actor_user_id_idx
  on kc_private.data_export_ticket_identity_links (actor_user_id);

create index if not exists data_export_ticket_identity_links_owner_user_id_idx
  on kc_private.data_export_ticket_identity_links (owner_user_id);

-- kc_private.help_request_notification_claims
create index if not exists help_request_notification_claims_owner_id_idx
  on kc_private.help_request_notification_claims (owner_id);

-- public.account_erasure_requests
create index if not exists account_erasure_requests_confirmation_recorded_by_idx
  on public.account_erasure_requests (confirmation_recorded_by);

create index if not exists account_erasure_requests_operation_claimed_by_idx
  on public.account_erasure_requests (operation_claimed_by);

-- public.data_subject_request_events
create index if not exists data_subject_request_events_actor_user_id_idx
  on public.data_subject_request_events (actor_user_id);

-- public.data_subject_requests
create index if not exists data_subject_requests_help_request_id_idx
  on public.data_subject_requests (help_request_id);

notify pgrst, 'reload schema';

commit;

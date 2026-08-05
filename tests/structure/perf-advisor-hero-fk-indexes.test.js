/**
 * Contract for Performance Advisor cleanup:
 * - hero_banners SELECT policies split by role (no dual permissive for authenticated)
 * - admin path uses initplan-safe (select auth.uid())
 * - covering indexes for the 16 unindexed FKs from the advisor export
 */
const fs = require('fs');
const path = require('path');

const MIGRATION = fs.readFileSync(
  path.join(
    __dirname,
    '../../supabase/migrations/20260805140000_perf_advisor_hero_rls_and_fk_indexes.sql'
  ),
  'utf8'
);

describe('perf advisor hero RLS + FK indexes migration', () => {
  test('replaces dual authenticated SELECT policies with role-split policies', () => {
    expect(MIGRATION).toContain('drop policy if exists banners_anon_authenticated_select_active');
    expect(MIGRATION).toContain('drop policy if exists banners_admin_select_all');
    expect(MIGRATION).toContain('create policy banners_select_active_anon');
    expect(MIGRATION).toContain('create policy banners_select_authenticated');
    expect(MIGRATION).toMatch(
      /to anon[\s\S]*?using \(is_active = true\)/
    );
    expect(MIGRATION).toMatch(
      /to authenticated[\s\S]*?public\.kc_is_admin\(\(select auth\.uid\(\)\)\)/
    );
  });

  test('adds covering indexes for all 16 advisor unindexed foreign keys', () => {
    const indexes = [
      'account_erasure_completion_outbox_data_subject_request_id_idx',
      'account_erasure_ticket_identity_links_actor_user_id_idx',
      'account_erasure_ticket_identity_links_owner_user_id_idx',
      'data_export_artifacts_claimed_by_idx',
      'data_export_artifacts_owner_user_id_idx',
      'data_export_artifacts_purge_erasure_request_id_idx',
      'data_export_media_refs_owner_user_id_idx',
      'data_export_processor_tasks_resolved_by_idx',
      'data_export_retention_alerts_last_run_id_idx',
      'data_export_ticket_identity_links_actor_user_id_idx',
      'data_export_ticket_identity_links_owner_user_id_idx',
      'help_request_notification_claims_owner_id_idx',
      'account_erasure_requests_confirmation_recorded_by_idx',
      'account_erasure_requests_operation_claimed_by_idx',
      'data_subject_request_events_actor_user_id_idx',
      'data_subject_requests_help_request_id_idx',
    ];
    for (const name of indexes) {
      expect(MIGRATION).toContain(`create index if not exists ${name}`);
    }
  });

  test('documents intentional non-drop of unused_index INFOs', () => {
    expect(MIGRATION).toMatch(/unused_index[\s\S]*?intentionally NOT dropped/i);
  });
});

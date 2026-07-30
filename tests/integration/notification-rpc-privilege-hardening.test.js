'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const MIGRATION = read(
  'supabase/migrations/20260728231500_notification_rpc_privilege_hardening.sql'
);

describe('notification RPC privilege hardening', () => {
  test('makes every destination/outbox worker primitive service-only', () => {
    [
      'kc_build_notification_delivery_payload',
      'kc_claim_notification_delivery_batch',
      'kc_count_recent_notification_deliveries',
      'kc_emit_notification_event',
      'kc_enqueue_notification_delivery',
      'kc_notification_channel_enabled',
      'kc_prune_old_notifications',
      'kc_record_notification_delivery_attempt',
      'kc_resolve_notification_delivery_destination',
      'kc_touch_notification_channel_target_consent',
      'kc_trigger_notification_dispatch',
    ].forEach((functionName) => expect(MIGRATION).toContain(functionName));

    expect(MIGRATION).toContain(
      "'revoke all on function %s from public, anon, authenticated'"
    );
    expect(MIGRATION).toContain(
      "'grant execute on function %s to service_role'"
    );
  });

  test('keeps only owner-scoped read/update RPCs available to authenticated users', () => {
    [
      'kc_get_notifications',
      'kc_mark_all_notifications_read',
      'kc_mark_notifications_read',
      'kc_unread_notification_count',
    ].forEach((functionName) => expect(MIGRATION).toContain(functionName));

    expect(MIGRATION).toContain(
      "'grant execute on function %s to authenticated, service_role'"
    );
    expect(MIGRATION).not.toMatch(
      /grant execute on function public\.kc_resolve_notification_delivery_destination[\s\S]*to authenticated/
    );
  });
});

/**
 * Guards the migration that clears Supabase advisor WARNs 0028/0029 by
 * converting public SECURITY DEFINER RPCs into INVOKER facades over
 * kc_private DEFINER workers (same pattern as analytics/chat banners).
 */
const fs = require('fs');
const path = require('path');

const MIGRATION = fs.readFileSync(
  path.join(
    __dirname,
    '../../supabase/migrations/20260805120000_security_definer_advisor_invoker_wrappers.sql'
  ),
  'utf8'
);

const TEST_SQL = fs.readFileSync(
  path.join(
    __dirname,
    '../../supabase/tests/security_definer_advisor_invoker_wrappers_test.sql'
  ),
  'utf8'
);

describe('security definer advisor invoker wrappers migration', () => {
  test('moves privileged bodies to kc_private *_impl and creates INVOKER facades', () => {
    expect(MIGRATION).toContain('rename to kc_is_admin_impl');
    expect(MIGRATION).toContain('set schema kc_private');
    expect(MIGRATION).toMatch(
      /create function public\.kc_is_admin\([\s\S]*?security invoker/i
    );
    expect(MIGRATION).toMatch(
      /create function public\.kc_enforce_active_session_pre_request\(\)[\s\S]*?security invoker/i
    );
    expect(MIGRATION).toMatch(
      /create or replace function public\.kc_create_help_request\([\s\S]*?security invoker/i
    );
    expect(MIGRATION).toMatch(
      /create or replace function\s+public\.kc_create_privacy_help_request_v1\([\s\S]*?security invoker/i
    );
  });

  test('preserves product grants and opens private EXECUTE for facade callers', () => {
    expect(MIGRATION).toContain(
      'grant execute on function public.kc_create_help_request(jsonb)\n  to anon, authenticated, service_role'
    );
    expect(MIGRATION).toContain(
      'grant execute on function kc_private.kc_create_help_request(jsonb)\n  to anon, authenticated, service_role'
    );
    expect(MIGRATION).toContain(
      'grant execute on function public.kc_admin_list_banners()\n  to authenticated, service_role'
    );
    expect(MIGRATION).not.toMatch(
      /grant execute on function public\.kc_admin_list_banners\(\)\s+to anon/i
    );
    expect(MIGRATION).toContain(
      "set pgrst.db_pre_request = 'public.kc_enforce_active_session_pre_request'"
    );
  });

  test('ships a pgTAP contract for INVOKER facades', () => {
    expect(TEST_SQL).toContain('all advisor-flagged public entrypoints are SECURITY INVOKER');
    expect(TEST_SQL).toContain('private workers remain SECURITY DEFINER');
  });
});

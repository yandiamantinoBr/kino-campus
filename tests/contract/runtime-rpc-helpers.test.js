'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const MIGRATION = path.join(ROOT, 'supabase/migrations/20260710012926_reconcile_runtime_rpc_helpers.sql');
const PRIVACY_HARDENING_MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260728233000_harden_account_erasure_privacy_postconditions.sql',
);
const sql = fs.readFileSync(MIGRATION, 'utf8');
const privacyHardeningSql = fs.readFileSync(PRIVACY_HARDENING_MIGRATION, 'utf8');

describe('runtime RPC helper reconciliation', () => {
  test('promotes private helpers required by active public RPCs', () => {
    [
      'kc_private.kc_insert_audit_log',
      'kc_private.kc_resolve_post_flood_limit',
      'kc_private.kc_compute_post_flood_check',
      'kc_private.kc_chat_is_new_user',
    ].forEach((signature) => expect(sql).toContain(signature));
  });

  test('uses invoker wrappers and explicit extension schemas', () => {
    expect(sql).toContain('extensions.similarity');
    expect(sql).toContain('extensions.hmac');
    expect(sql).toContain('security invoker');
    expect(sql).toContain('revoke all on function public.kc_check_duplicate_post');
  });

  test('removes references to columns that do not exist in posts', () => {
    expect(sql).not.toContain('p.titulo');
    expect(sql).not.toContain('p.content');
    expect(sql).toContain("coalesce(p.description, '') as content");
  });

  test('uses a UUID audit identity and never retains the raw invite e-mail', () => {
    expect(privacyHardeningSql).toContain("'invite_revoked'");
    expect(privacyHardeningSql).toContain('extensions.gen_random_uuid()');
    expect(privacyHardeningSql).toContain("'email_hash', v_email_hash");
    expect(privacyHardeningSql).toContain("'email_redacted', true");
    expect(privacyHardeningSql).not.toContain(
      "jsonb_build_object('email', v_email, 'deleted_count', v_deleted)",
    );
  });
});

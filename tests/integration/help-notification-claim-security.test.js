'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const MIGRATION = read('supabase/migrations/20260728210000_help_request_notification_claims.sql');
const PRIVACY_MIGRATION = read('supabase/migrations/20260728220000_data_export_supplement_workflow.sql');
const PRIVACY_IDEMPOTENCY_MIGRATION = read(
  'supabase/migrations/20260729190653_help_submission_idempotency.sql',
);
const EDGE = read('supabase/functions/kc-help-request-notify/index.ts');
const ADAPTER = read('assets/js/adapters/supabase/supabase.admin.adapter.js');
const CONFIG = read('supabase/config.toml');

describe('help-request notification ownership proof', () => {
  test('creates the request and short-lived proof atomically', () => {
    expect(MIGRATION).toContain('kc_create_help_request_with_notification_claim');
    expect(MIGRATION).toContain('extensions.gen_random_bytes(32)');
    expect(MIGRATION).toContain("interval '15 minutes'");
    expect(MIGRATION).toContain('help_request_notification_claims');
    expect(MIGRATION).toContain('on delete cascade');
  });

  test('persists only a SHA-256 digest in a private table', () => {
    expect(MIGRATION).toContain('claim_hash text not null');
    expect(MIGRATION).toContain("extensions.digest(convert_to(v_raw_claim, 'UTF8'), 'sha256')");
    expect(MIGRATION).not.toMatch(/\braw_claim\s+text\b/i);
    expect(MIGRATION).toMatch(
      /revoke all on table kc_private\.help_request_notification_claims[\s\S]*?from public, anon, authenticated, service_role/
    );
  });

  test('uses an atomic lease and compare-and-swap completion', () => {
    expect(MIGRATION).toContain('for update of claim_row');
    expect(MIGRATION).toContain('NOTIFICATION_DELIVERY_BUSY');
    expect(MIGRATION).toContain("status = 'processing'");
    expect(MIGRATION).toContain('and lease_id = p_lease_id');
    expect(MIGRATION).toContain('attempt_count >= 10');
    expect(MIGRATION).toContain('for update skip locked');
  });

  test('requires owner identity for authenticated requests and proof for anonymous requests', () => {
    expect(MIGRATION).toContain('v_claim.owner_id <> p_caller_id');
    expect(MIGRATION).toContain("p_claim_token !~ '^[0-9a-f]{64}$'");
    expect(MIGRATION).toContain('NOTIFICATION_CLAIM_EXPIRED');
    expect(MIGRATION).toContain("v_claim.status = 'sent'");
    expect(MIGRATION).toContain("out_state := 'already_sent'");
  });

  test('keeps claim and completion RPCs service-only', () => {
    expect(MIGRATION).toMatch(
      /revoke all on function\s+public\.kc_claim_help_request_notification[\s\S]*?from public, anon, authenticated/
    );
    expect(MIGRATION).toMatch(
      /grant execute on function\s+public\.kc_claim_help_request_notification[\s\S]*?to service_role/
    );
    expect(MIGRATION).toMatch(
      /revoke all on function\s+public\.kc_complete_help_request_notification[\s\S]*?from public, anon, authenticated/
    );
  });
});

describe('kc-help-request-notify privileged boundary', () => {
  test('does not fetch arbitrary help rows directly from a browser-supplied UUID', () => {
    expect(EDGE).not.toContain('.from("help_requests")');
    expect(EDGE).toContain('"kc_claim_help_request_notification"');
    expect(EDGE).toContain('"kc_complete_help_request_notification"');
  });

  test('validates a user and the active session before reserving delivery', () => {
    const getUserAt = EDGE.search(/userClient\.auth\s*\.getUser\(\)/);
    const firstSessionAt = EDGE.indexOf('isCurrentSessionActive(userClient)');
    const serviceClientAt = EDGE.indexOf('const serviceClient = createClient');
    const claimAt = EDGE.indexOf('"kc_claim_help_request_notification"');

    expect(getUserAt).toBeGreaterThan(-1);
    expect(firstSessionAt).toBeGreaterThan(getUserAt);
    expect(serviceClientAt).toBeGreaterThan(firstSessionAt);
    expect(claimAt).toBeGreaterThan(serviceClientAt);
    expect((EDGE.match(/isCurrentSessionActive\(userClient\)/g) || [])).toHaveLength(2);
  });

  test('requires a 256-bit anonymous proof and never returns it', () => {
    expect(EDGE).toContain('/^[0-9a-f]{64}$/.test(notificationClaim)');
    expect(EDGE).toContain('p_claim_token: callerId ? null : notificationClaim');
    const responseTail = EDGE.slice(EDGE.lastIndexOf('return json(req, adminAccepted'));
    expect(responseTail).not.toContain('notificationClaim');
    expect(responseTail).not.toContain('contact_email');
  });

  test('limits origin, method, body size and cacheability', () => {
    expect(EDGE).toContain('MAX_REQUEST_BYTES = 2048');
    expect(EDGE).toContain('origin_not_allowed');
    expect(EDGE).not.toContain('"Access-Control-Allow-Origin": "*"');
    expect(EDGE).toContain('"Cache-Control": "no-store, max-age=0"');
    expect(EDGE).toContain('"X-Content-Type-Options": "nosniff"');
    expect(CONFIG).toMatch(
      /\[functions\.kc-help-request-notify\]\s*verify_jwt\s*=\s*true/
    );
  });

  test('persists only provider acceptance evidence and safe error codes', () => {
    expect(EDGE).toContain('accepted_at');
    expect(EDGE).toContain('safeDeliveryErrorCode');
    expect(EDGE).not.toContain('error_message: msg');
    expect(EDGE).not.toContain('reply_to:');
    const persistedEvidence = EDGE.slice(EDGE.indexOf('const completionResult ='));
    expect(persistedEvidence).not.toContain('adminTo');
    expect(persistedEvidence).not.toContain('requesterEmail');
  });
});

describe('help frontend claim handling', () => {
  test('keeps claims on generic/external Help and privacy on the claim-free idempotent path', () => {
    expect(ADAPTER).toContain("'kc_create_help_request_with_notification_claim_v2'");
    expect(ADAPTER).toContain("'kc_create_privacy_help_request_v1'");
    expect(ADAPTER).toContain("'kc-create-privacy-help-guest'");
    expect(PRIVACY_MIGRATION).toContain(
      'kc_create_help_request_with_notification_claim_v2',
    );
    expect(PRIVACY_MIGRATION).toContain(
      'from kc_private.kc_create_help_request_with_notification_claim(p_payload)',
    );
    expect(PRIVACY_IDEMPOTENCY_MIGRATION).toContain(
      'HELP_PRIVACY_IDEMPOTENT_RPC_REQUIRED',
    );
    expect(PRIVACY_IDEMPOTENCY_MIGRATION).toContain(
      'kc_create_privacy_help_request_v1',
    );
    expect(ADAPTER).toContain('row.out_notification_claim');
    expect(ADAPTER).toContain('if (privacyRequestKind && notificationClaim)');
    expect(ADAPTER).toContain('notification_claim: String(notificationClaim || \'\')');
    expect(ADAPTER).toContain(
      'notifyExternalHelpRequest(client, createdRow, notificationClaim)'
    );
    expect(ADAPTER).toContain(
      '!isExternalAccessHelpRequest(row)',
    );
  });

  test('does not add the raw proof to the returned help-request object', () => {
    const createdRowBlock = ADAPTER.match(
      /const createdRow = Object\.assign\([\s\S]*?\n\s*\}\);/
    );
    expect(createdRowBlock).not.toBeNull();
    expect(createdRowBlock[0]).not.toContain('out_notification_claim');
  });
});

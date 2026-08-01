'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(
  path.join(ROOT, relativePath),
  'utf8',
);

const EXPAND_PATH =
  'supabase/migrations/20260729203000_help_privacy_guest_gateway_expand.sql';
const PENDING_CONTRACT_PATH =
  'supabase/contracts/pending/help_privacy_guest_gateway_contract.template.sql';
const EDGE_PATH =
  'supabase/functions/kc-create-privacy-help-guest/index.ts';
const TURNSTILE_OPS_PATH = 'scripts/ops/apply-turnstile-keys.ps1';

describe('guest privacy Help Turnstile rollout contract', () => {
  test('keeps CONTRACT outside the active migration chain until a later promotion', () => {
    expect(fs.existsSync(path.join(ROOT, EXPAND_PATH))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, PENDING_CONTRACT_PATH))).toBe(true);
    const activeContracts = fs.readdirSync(
      path.join(ROOT, 'supabase/migrations'),
    ).filter((name) => (
      /^\d{14}_help_privacy_guest_gateway_contract\.sql$/.test(name)
    ));
    expect(activeContracts).toEqual([]);

    const pendingReadme = read('supabase/contracts/pending/README.md');
    expect(pendingReadme).toContain('não fazem parte da cadeia ativa');
    expect(pendingReadme).toContain('renomeie e mova');
    expect(pendingReadme).toMatch(/não copie/i);
    expect(pendingReadme).toContain('timestamp novo de 14 dígitos');
    expect(pendingReadme).toContain('canário de produção');
  });

  test('EXPAND creates only a service-role bridge and preserves the old anon path', () => {
    const expand = read(EXPAND_PATH);
    expect(expand).toContain(
      'create or replace function public.kc_create_privacy_help_guest_v1(',
    );
    expect(expand).toMatch(/security definer\s+set search_path = ''/i);
    expect(expand).toMatch(
      /revoke all on function\s+public\.kc_create_privacy_help_guest_v1\(jsonb\)[\s\S]*from public, anon, authenticated, service_role;/i,
    );
    expect(expand).toMatch(
      /grant execute on function\s+public\.kc_create_privacy_help_guest_v1\(jsonb\)[\s\S]*to service_role;/i,
    );
    expect(expand).toContain(
      "'public.kc_create_privacy_help_request_v1(jsonb)'",
    );
    expect(expand).toContain(
      "message = 'HELP_GUEST_GATEWAY_EXPAND_BROKE_LEGACY_CANARY'",
    );
    expect(expand).not.toMatch(
      /revoke execute on function\s+public\.kc_create_privacy_help_request_v1/i,
    );
  });

  test('staged CONTRACT closes anon while retaining authenticated and service roles', () => {
    const contract = read(PENDING_CONTRACT_PATH);
    expect(contract).toContain('DO NOT APPLY WITH THE EXPAND RELEASE');
    expect(contract).toContain('fresh 14-digit timestamp');
    expect(contract).toContain('frontend Turnstile path passed its production canary');
    expect(contract).toMatch(
      /revoke execute on function\s+public\.kc_create_privacy_help_request_v1\(jsonb\)[\s\S]*from public, anon;/i,
    );
    expect(contract).toMatch(
      /grant execute on function\s+public\.kc_create_privacy_help_request_v1\(jsonb\)[\s\S]*to authenticated, service_role;/i,
    );
    expect(contract).toContain(
      "message = 'HELP_GUEST_GATEWAY_CONTRACT_PRECONDITION_FAILED'",
    );
    expect(contract).toContain(
      "message = 'HELP_GUEST_GATEWAY_CONTRACT_ACL_INVALID'",
    );
    expect(contract).toContain(
      'Supabase Anonymous Auth remains disabled and is rejected by the global active-session pre-request',
    );
  });

  test('Edge gateway is JWT-free only at the gateway and fails closed around Turnstile', () => {
    const config = read('supabase/config.toml');
    const edge = read(EDGE_PATH);

    expect(config).toMatch(
      /\[functions\.kc-create-privacy-help-guest\]\s*verify_jwt = false/,
    );
    expect(edge).toContain(
      'readBoundedRequestText(request, MAX_REQUEST_BODY_BYTES)',
    );
    expect(edge).toContain('export const MAX_REQUEST_BODY_BYTES = 40_960');
    expect(edge).toContain('export const MAX_PRIVACY_PAYLOAD_BYTES = 32_768');
    expect(edge).toContain('export const MAX_TURNSTILE_TOKEN_CHARS = 2_048');
    expect(edge).toContain(
      'export const MAX_CONCURRENT_SITEVERIFY_REQUESTS = 24',
    );
    expect(edge).toContain('tryAcquireSiteverifySlot()');
    expect(edge).toContain('"GUEST_PRIVACY_BUSY"');
    expect(edge).toContain('"Retry-After"');
    expect(edge).toContain('deployment-level WAF/rate limit is still required');
    expect(edge).toContain('const TURNSTILE_ACTION = "help_privacy_guest"');
    expect(edge).toContain(
      '"https://challenges.cloudflare.com/turnstile/v0/siteverify"',
    );
    expect(edge).toContain('KC_PRIVACY_HELP_ALLOWED_ORIGINS');
    expect(edge).toContain('KC_TURNSTILE_EXPECTED_HOSTNAMES');
    expect(edge).toContain('KC_TURNSTILE_ENVIRONMENT');
    expect(edge).toContain('KC_TURNSTILE_SECRET_KEY');
    expect(edge).toContain('"kc_create_privacy_help_guest_v1"');
    expect(edge).not.toContain('"kc_create_privacy_help_request_v1"');
    expect(edge).not.toContain('remoteip');
    expect(edge).not.toMatch(/\bconsole\./);
  });

  test('production rejects official dummy secrets and loopback settings', () => {
    const edge = read(EDGE_PATH);
    for (const secret of [
      '1x0000000000000000000000000000000AA',
      '2x0000000000000000000000000000000AA',
      '3x0000000000000000000000000000000AA',
    ]) {
      expect(edge).toContain(secret);
    }
    expect(edge).toContain('turnstileEnvironment === "production"');
    expect(edge).toContain('turnstileEnvironment === "test"');
    expect(edge).toContain('productionUsesLoopback');
    expect(edge).toContain('TURNSTILE_TEST_SECRET_KEYS.has(turnstileSecretKey)');
  });

  test('operations configure the complete production-only Turnstile surface', () => {
    const operations = read(TURNSTILE_OPS_PATH);
    expect(operations).toContain('KC_TURNSTILE_SITE_KEY');
    expect(operations).toContain('KC_TURNSTILE_SECRET_KEY');
    expect(operations).toContain('KC_TURNSTILE_ENVIRONMENT');
    expect(operations).toContain('KC_TURNSTILE_EXPECTED_HOSTNAMES');
    expect(operations).toContain('KC_PRIVACY_HELP_ALLOWED_ORIGINS');
    expect(operations).toContain("'production', '--force', '--yes'");
    expect(operations).not.toContain(
      "'preview', '--force', '--yes'",
    );
    expect(operations).toContain('[switch]$SkipDeploy');
    expect(operations).toContain('[string]$CredentialBundlePath');
    expect(operations).toContain('[switch]$DeleteCredentialBundle');
    expect(operations).toContain(
      'Remove-Item -LiteralPath $resolvedBundlePath -Force',
    );
    expect(operations).toContain(
      "-replace [regex]::Escape($InputValue), '[redacted]'",
    );
  });
});

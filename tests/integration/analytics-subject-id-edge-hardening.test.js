'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const INDEX = fs.readFileSync(path.join(ROOT, 'supabase/functions/kc-analytics-subject-id/index.ts'), 'utf8');
const SUBJECT = fs.readFileSync(path.join(ROOT, 'supabase/functions/kc-analytics-subject-id/subject.ts'), 'utf8');
const CONFIG = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8');

describe('analytics subject id Edge Function hardening', () => {
  test('requires gateway JWT and validates the bearer again with Supabase Auth', () => {
    expect(CONFIG).toMatch(/\[functions\.kc-analytics-subject-id\]\s*verify_jwt = true/);
    expect(INDEX).toContain('userClient.auth.getUser(bearer[1])');
    expect(INDEX).toContain('await isCurrentSessionActive(userClient)');
    expect(INDEX).toContain('SESSION_NOT_ACTIVE');
    expect(INDEX).toContain('authentication_required');
  });

  test('allows only production origins, POST and a small request body', () => {
    expect(INDEX).toContain('const MAX_BODY_BYTES = 1024');
    expect(INDEX).toContain('https://www.kinocampus.com.br');
    expect(INDEX).toContain('origin_not_allowed');
    expect(INDEX).toContain('method_not_allowed');
    expect(INDEX).toContain('request_too_large');
    expect(INDEX).not.toContain('"Access-Control-Allow-Origin": "*"');
  });

  test('uses a server-only HMAC and returns no raw Supabase UUID or e-mail', () => {
    expect(INDEX).toContain('KC_ANALYTICS_ID_SECRET');
    expect(SUBJECT).toContain('{ name: "HMAC", hash: "SHA-256" }');
    expect(SUBJECT).toContain('SUBJECT_PREFIX + userId.toLowerCase()');
    // A resposta traz apenas identificadores opacos: subject id (HMAC do UUID) e
    // o hash SHA-256 do e-mail (UPD, calculado no servidor). Nunca dados brutos.
    expect(INDEX).toContain('{ ok: true, subjectId, emailHash }');
    expect(INDEX).toContain('createAnalyticsEmailHash(data?.user?.email ?? "")');
    expect(INDEX).not.toContain('{ ok: true, userId');
    expect(INDEX).not.toContain('{ ok: true, email');
    expect(INDEX).not.toMatch(/console\.(?:log|error|warn)/);
  });

  test('marks every response no-store and exposes only sanitized error codes', () => {
    expect(INDEX).toContain('"Cache-Control": "no-store"');
    expect(INDEX).not.toContain('error.message');
    expect(INDEX).not.toContain('JSON.stringify(error)');
  });
});

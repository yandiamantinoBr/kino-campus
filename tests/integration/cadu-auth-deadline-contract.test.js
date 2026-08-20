/** @jest-environment node */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const AUTH_PATH = path.resolve(__dirname, '../../server/cadu-auth.mjs');
const AUTH_URL = pathToFileURL(AUTH_PATH).href;

function runNativeAuthContract(script) {
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      KC_SUPABASE_URL: 'https://supabase.test',
      KC_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    encoding: 'utf8',
    timeout: 5000,
  });
  expect(result.status).toBe(0, `${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout.trim());
}

describe('Cadu admin authentication deadline and disclosure contract', () => {
  const source = fs.readFileSync(AUTH_PATH, 'utf8');

  test('declares one total deadline and never serializes raw transport messages', () => {
    expect(source).toContain('const ADMIN_AUTH_DEADLINE_MS = 8_000;');
    expect(source).toContain('signal: deadline.signal');
    expect(source).toContain("res.status(503).json({ error: 'admin_auth_unreachable' });");
    expect(source).toContain("res.status(503).json({ error: 'admin_authorization_unreachable' });");
    expect(source).not.toContain('message: String(err');
  });

  test('uses the same native deadline signal for user and role checks, including the profile fallback', () => {
    const outcome = runNativeAuthContract(`
      import { requireCaduAdmin, createCaduAdminDeadline } from ${JSON.stringify(AUTH_URL)};
      const calls = [];
      const response = () => ({ statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
      const upstream = (status, text) => ({ ok: status >= 200 && status < 300, status, headers: { get() { return null; } }, async text() { return text; } });
      globalThis.fetch = async (_url, options) => {
        calls.push(options);
        if (calls.length === 1) return upstream(200, JSON.stringify({ id: 'user-1', email: 'admin@kino.test' }));
        if (calls.length === 2) return upstream(404, '{"internal":"not reflected"}');
        return upstream(200, JSON.stringify([{ is_admin: true }]));
      };
      const res = response();
      const admin = await requireCaduAdmin({ headers: { authorization: 'Bearer browser-token' } }, res);
      if (!admin || admin.id !== 'user-1' || calls.length !== 3 || new Set(calls.map((call) => call.signal)).size !== 1) throw new Error('auth_contract_failed');
      if (!calls.every((call) => call.redirect === 'error')) throw new Error('redirect_contract_failed');
      const deadline = createCaduAdminDeadline(25);
      await new Promise((resolve) => setTimeout(resolve, 40));
      if (!deadline.signal.aborted) throw new Error('deadline_not_aborted');
      deadline.cancel();
      console.log(JSON.stringify({ ok: true, calls: calls.length }));
    `);
    expect(outcome).toEqual({ ok: true, calls: 3 });
  });

  test('fails closed for unreachable or oversized auth upstreams without exposing their contents', () => {
    const outcome = runNativeAuthContract(`
      import { requireCaduAdmin } from ${JSON.stringify(AUTH_URL)};
      const response = () => ({ statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
      const request = { headers: { authorization: 'Bearer browser-token' } };
      globalThis.fetch = async () => { throw new Error('private host token=secret'); };
      const unreachable = response();
      await requireCaduAdmin(request, unreachable);
      if (unreachable.statusCode !== 503 || unreachable.body?.error !== 'admin_auth_unreachable') throw new Error('unreachable_contract_failed');
      globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get(name) { return name === 'content-length' ? '65537' : null; } }, async text() { return '{"id":"user-2"}'; } });
      const oversized = response();
      await requireCaduAdmin(request, oversized);
      if (oversized.statusCode !== 503 || oversized.body?.error !== 'admin_auth_unreachable') throw new Error('oversized_contract_failed');
      if (JSON.stringify(unreachable.body).includes('private host')) throw new Error('disclosure_contract_failed');
      console.log(JSON.stringify({ ok: true }));
    `);
    expect(outcome).toEqual({ ok: true });
  });

  test('treats a successful malformed auth payload as an unavailable upstream, never as an invalid session', () => {
    const outcome = runNativeAuthContract(`
      import { requireCaduAdmin } from ${JSON.stringify(AUTH_URL)};
      const response = () => ({ statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
      const upstream = (status, text) => ({ ok: status >= 200 && status < 300, status, headers: { get() { return null; } }, async text() { return text; } });
      const request = { headers: { authorization: 'Bearer browser-token' } };
      globalThis.fetch = async () => upstream(200, '<html>private upstream detail</html>');
      const malformedUser = response();
      await requireCaduAdmin(request, malformedUser);
      if (malformedUser.statusCode !== 503 || malformedUser.body?.error !== 'admin_auth_unreachable') throw new Error('malformed_user_contract_failed');
      let calls = 0;
      globalThis.fetch = async () => {
        calls += 1;
        return calls === 1
          ? upstream(200, JSON.stringify({ id: 'user-3', email: 'admin@kino.test' }))
          : upstream(200, '<html>private role detail</html>');
      };
      const malformedRole = response();
      await requireCaduAdmin(request, malformedRole);
      if (malformedRole.statusCode !== 503 || malformedRole.body?.error !== 'admin_authorization_unreachable') throw new Error('malformed_role_contract_failed');
      if (JSON.stringify(malformedUser.body).includes('private') || JSON.stringify(malformedRole.body).includes('private')) throw new Error('malformed_disclosure_contract_failed');
      console.log(JSON.stringify({ ok: true, calls }));
    `);
    expect(outcome).toEqual({ ok: true, calls: 2 });
  });
});

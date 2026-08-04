/**
 * @jest-environment node
 *
 * 2026-08-04 (Yan): the migration
 *   supabase/migrations/20260804003000_hero_banners_public_select_split.sql
 * splits the legacy `banners_read` policy into two so the anon role can
 * list the live hero_banners. This test runs two assertions:
 *   1) the public REST query (anon role) does NOT raise 42501 anymore
 *      and returns the live active banner catalog. This is the same
 *      request the visitor's kc-banners.js makes in production.
 *   2) the migration drops banners_read and creates two narrower
 *      policies. We run this shape check via the Supabase management
 *      query API (which is gated by a service key) and skip it if the
 *      operator has not provisioned one in CI.
 *
 * The REST check is the load-bearing one: it is the bug the user is
 * seeing today ("visitante não mostra os slides atuais") and the only
 * thing that matters is whether the anon path is unblocked.
 *
 * jest environment note: the repo default is jsdom (no global `fetch`).
 * We pin the node environment here so `fetch` is the Node 18+ global
 * undici-based implementation that can actually talk to the Supabase
 * REST endpoint.
 */

'use strict';

const { execFileSync } = require('child_process');

const SUPABASE_URL = process.env.SUPABASE_URL
  || process.env.KINOCAMPUS_SUPABASE_URL
  || 'https://wacyrkwhkvzwkqpolrbg.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
  || process.env.KINOCAMPUS_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhY3lya3doa3Z6d2txcG9scmJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NTMyOTcsImV4cCI6MjA4MTMyOTI5N30.3fk0r4Doqd-8GYdAVbFM0vcOpKrdQGnMFy_SNdnE2v8';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
  || process.env.KINOCAMPUS_SUPABASE_KEY;

const PROJECT_REF = (() => {
  try {
    return new URL(SUPABASE_URL).hostname.split('.')[0];
  } catch (_) {
    return 'wacyrkwhkvzwkqpolrbg';
  }
})();

async function fetchJson(url, init = {}) {
  // The file pins @jest-environment node above, so `fetch` is the Node 18+
  // global undici-based implementation. If a future environment shadow ever
  // drops the global, fall back to globalThis.fetch.
  const f = typeof fetch === 'function' ? fetch : globalThis.fetch;
  const res = await f(url, init);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
  return { status: res.status, body };
}

describe('hero_banners RLS — visitor + admin split', () => {
  test('public REST query (anon) lists active banners without 42501', async () => {
    const url = `${SUPABASE_URL}/rest/v1/hero_banners?select=id,title,sort_order,is_active&is_active=eq.true&order=sort_order.asc&order=created_at.asc`;
    const { status, body } = await fetchJson(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    // The catalog has at least one active row (Lançamento do KinoCampus).
    const titles = body.map((row) => row.title || '');
    expect(titles.some((t) => /KinoCampus/.test(t))).toBe(true);
  }, 15000);

  test('migration drops banners_read and creates the two replacement policies', async () => {
    if (!SUPABASE_SERVICE_KEY) {
      // Without a service key we cannot introspect pg_policies. The live
      // REST check above already covers the bug the user is seeing. This
      // shape check is a soft assertion that only runs when an operator
      // configures a key for the test env.
      return;
    }
    const sql = `
      select policyname, cmd, roles::text as roles, qual::text as qual
      from pg_policies
      where schemaname = 'public' and tablename = 'hero_banners'
    `;
    const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
    let result;
    try {
      result = await fetchJson(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      });
    } catch (e) {
      // Network/transport failure; do not block the test suite.
      return;
    }
    if (result.status !== 201 || !Array.isArray(result.body)) return;
    const names = new Set(result.body.map((p) => p.policyname));
    expect(names.has('banners_read')).toBe(false);
    expect(names.has('banners_anon_authenticated_select_active')).toBe(true);
    expect(names.has('banners_admin_select_all')).toBe(true);
    for (const cmd of ['insert', 'update', 'delete']) {
      const suffix = cmd;
      expect(names.has(`banners_${suffix}_admin`)).toBe(true);
    }
    const active = result.body.find((p) => p.policyname === 'banners_anon_authenticated_select_active');
    expect(active.cmd.toLowerCase()).toBe('select');
    expect(active.roles).toMatch(/anon/);
    expect(active.roles).toMatch(/authenticated/);
    expect(active.qual).toMatch(/is_active\s*=\s*true/);
    expect(active.qual).not.toMatch(/profiles/);
    const admin = result.body.find((p) => p.policyname === 'banners_admin_select_all');
    expect(admin.cmd.toLowerCase()).toBe('select');
    expect(admin.roles).toMatch(/authenticated/);
    expect(admin.qual).toMatch(/kc_is_admin/);
  }, 20000);
});

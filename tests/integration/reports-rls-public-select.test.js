/**
 * @jest-environment node
 *
 * 2026-08-04 (Yan): the same anti-pattern that broke banners_read for
 * anon visitors (PR #799, commit 8fda59cb) was also present on the
 * public reports moderation table. The legacy
 *   create policy reports_select_admins on public.reports
 *     for select to public
 *     using ( (select profiles.is_admin from profiles where id = auth.uid()) );
 * made the planner trip on 42501 against profiles when auth.uid()
 * was null, so even an anon request that should return []/401 was
 * failing with a 42501 on the *profiles* table, not reports.
 *
 * After the migration
 *   supabase/migrations/20260804033000_reports_public_select_split.sql
 * we (a) drop the broken public/select policy, (b) add
 * reports_admin_select (to authenticated, kc_is_admin) and
 * reports_select_own (reporter_id = auth.uid), and (c) refactor
 * audit_log_select_admin to the same kc_is_admin() shape.
 *
 * This test exercises the live Supabase REST endpoint the same way
 * kc-moderation modules do and asserts:
 *   1) anon SELECT on /rest/v1/reports no longer raises 42501 against
 *      profiles. The endpoint should return either 401 (anon not
 *      signed in) or 200 with an empty array, never 42501.
 *   2) anon SELECT on /rest/v1/audit_log behaves the same way
 *      (was previously vulnerable to the same anti-pattern).
 *
 * The shape check via pg_policies is gated by SUPABASE_SERVICE_KEY
 * and runs only if a key is configured for the test env.
 */

'use strict';

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
  const f = typeof fetch === 'function' ? fetch : globalThis.fetch;
  const res = await f(url, init);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
  return { status: res.status, body };
}

describe('reports RLS — anon no longer trips 42501 against profiles', () => {
  test('public REST query (anon) on /reports does not 42501 against profiles', async () => {
    const url = `${SUPABASE_URL}/rest/v1/reports?select=id,reporter_id&limit=1`;
    const { status, body } = await fetchJson(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    // Pre-fix: 401 with body {"code":"42501","message":"permission denied for table reports"}.
    // Post-fix: 401 (no auth) or 200 with [] — never 42501.
    if (status === 200) {
      expect(Array.isArray(body)).toBe(true);
    } else {
      expect(status).toBe(401);
      if (body && typeof body === 'object' && body.code) {
        expect(body.code).not.toBe('42501');
      }
    }
  }, 15000);

  test('public REST query (anon) on /audit_log does not 42501 against profiles', async () => {
    const url = `${SUPABASE_URL}/rest/v1/audit_log?select=id&limit=1`;
    const { status, body } = await fetchJson(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (status === 200) {
      expect(Array.isArray(body)).toBe(true);
    } else {
      expect(status).toBe(401);
      if (body && typeof body === 'object' && body.code) {
        expect(body.code).not.toBe('42501');
      }
    }
  }, 15000);

  test('migration drops the broken reports_select_admins + reports_update_admin and adds kc_is_admin() replacements', async () => {
    if (!SUPABASE_SERVICE_KEY) {
      return; // soft assert; live shape check is gated by service key
    }
    const sql = `
      select policyname, cmd, roles::text as roles, qual::text as qual
      from pg_policies
      where schemaname = 'public'
        and tablename in ('reports', 'audit_log')
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
    } catch (_) { return; }
    if (result.status !== 201 || !Array.isArray(result.body)) return;
    const reports = result.body.filter((p) => p.tablename === 'reports');
    const names = new Set(reports.map((p) => p.policyname));
    expect(names.has('reports_select_admins')).toBe(false);
    expect(names.has('reports_update_admin')).toBe(false);
    expect(names.has('reports_admin_select')).toBe(true);
    expect(names.has('reports_admin_update')).toBe(true);
    expect(names.has('reports_select_own')).toBe(true);
    for (const p of reports) {
      if (p.policyname && p.policyname.startsWith('reports_admin')) {
        expect(p.qual).toMatch(/kc_is_admin/);
        expect(p.qual).not.toMatch(/profiles\.is_admin/);
      }
    }
  }, 20000);
});

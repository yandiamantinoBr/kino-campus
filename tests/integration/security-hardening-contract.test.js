'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const MIGRATION = path.join(ROOT, 'supabase/migrations/_archive-v75/20260526185914_security_invoker_rpc_hardening.sql');
const VERCEL_CONFIG = path.join(ROOT, 'vercel.json');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function getGlobalCsp(config) {
  const globalHeaders = (config.headers || []).find((item) => item.source === '/(.*)');
  const headers = globalHeaders ? globalHeaders.headers || [] : [];
  const cspHeader = headers.find((item) => item.key === 'Content-Security-Policy');
  return cspHeader ? cspHeader.value : '';
}

describe('security hardening contract', () => {
  let sql;

  beforeAll(() => {
    sql = read(MIGRATION).toLowerCase();
  });

  test('keeps privileged audit insertion outside the exposed public schema', () => {
    expect(sql).toContain('create schema if not exists kc_private');
    expect(sql).toContain('create or replace function kc_private.kc_insert_audit_log');
    expect(sql).toContain('security definer');
    expect(sql).toContain('revoke all on schema kc_private from public, anon');
  });

  test('converts advisor-flagged public rpc functions to security invoker', () => {
    const functions = [
      'kc_admin_delete_post_flood_limit',
      'kc_admin_get_post_flood_limits',
      'kc_admin_list_audit_logs',
      'kc_admin_set_post_flood_limit',
      'kc_admin_set_post_status',
      'kc_bump_post',
      'kc_check_post_flood_limit',
      'kc_close_post',
      'kc_get_post_flood_limit',
      'kc_record_post_audit_event',
      'kc_renew_post',
      'kc_toggle_post_status',
    ];

    for (const fn of functions) {
      const pattern = new RegExp(`create or replace function public\\.${fn}[\\s\\S]*?\\$\\$;`, 'i');
      const match = sql.match(pattern);
      expect(match).toBeTruthy();
      expect(match[0]).toContain('security invoker');
      expect(match[0]).not.toContain('security definer');
    }
  });

  test('does not expose these rpc functions to anonymous users', () => {
    expect(sql).toContain('revoke all on function public.kc_admin_set_post_status(uuid, text, boolean) from public, anon');
    expect(sql).toContain('revoke all on function public.kc_check_post_flood_limit(uuid, text) from public, anon');
    expect(sql).toContain('grant execute on function public.kc_admin_set_post_status(uuid, text, boolean) to authenticated, service_role');
  });

  test('vercel production build installs only runtime dependencies', () => {
    const config = JSON.parse(read(VERCEL_CONFIG));
    const injectEnv = read(path.join(ROOT, 'scripts', 'inject-env.js'));
    expect(config.buildCommand).toBe('node scripts/inject-env.js');
    expect(config.installCommand).toBe('npm ci --omit=dev --no-audit --no-fund');
    expect(config.outputDirectory).toBe('dist');
    expect(injectEnv).not.toContain("'SUPABASE_KEY',");
    expect(injectEnv).toContain('function readLegacyJwtRole(key)');
    expect(injectEnv).toContain("legacyJwtRole !== 'anon'");
    expect(injectEnv).toContain('TURNSTILE_TEST_SITE_KEYS');
    expect(injectEnv).toContain('TURNSTILE_SITE_KEY_REQUIRED');
    expect(injectEnv).toContain('TURNSTILE_TEST_SITE_KEY_FORBIDDEN');
  });

  test('vercel CSP keeps baseline hardening directives', () => {
    const config = JSON.parse(read(VERCEL_CONFIG));
    const csp = getGlobalCsp(config);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  test('vercel CSP permits only the official Turnstile challenge origin', () => {
    const config = JSON.parse(read(VERCEL_CONFIG));
    const csp = getGlobalCsp(config);
    expect(csp).toContain('script-src');
    expect(csp).toContain('script-src-elem');
    expect(csp).toContain('connect-src');
    expect(csp).toContain('frame-src');
    expect(csp).toContain('https://challenges.cloudflare.com');
    expect(csp).not.toContain('https://*.cloudflare.com');
  });
});

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const INDEX = read('supabase/functions/kc-search-console-reports/index.ts');
const VALIDATION = read('supabase/functions/kc-search-console-reports/validation.ts');

describe('Search Console Edge Function hardening', () => {
  test('fails closed for browser origins instead of emitting wildcard CORS', () => {
    expect(INDEX).toContain('KC_SEARCH_CONSOLE_ALLOWED_ORIGINS');
    expect(INDEX).toContain('KC_GA4_ALLOWED_ORIGINS');
    expect(INDEX).toContain('.filter((value) => value !== "*")');
    expect(INDEX).not.toContain('headers["Access-Control-Allow-Origin"] = "*"');
    expect(INDEX).toContain('error: "origin_not_allowed"');
  });

  test('checks admin before reading Google configuration or calling Google', () => {
    const adminCheck = INDEX.indexOf('const caller = await resolveCaller(req)');
    const configRead = INDEX.indexOf('getEnv("KC_SEARCH_CONSOLE_SA_KEY")');
    const execute = INDEX.indexOf('const data = await executeRequest(');
    expect(adminCheck).toBeGreaterThan(-1);
    expect(configRead).toBeGreaterThan(adminCheck);
    expect(execute).toBeGreaterThan(configRead);
  });

  test('aceita HTTP apenas para loopback local, nunca para origem remota', () => {
    expect(INDEX).toContain('parsed.protocol === "http:"');
    expect(INDEX).toContain('parsed.hostname === "localhost"');
    expect(INDEX).toContain('parsed.hostname === "127.0.0.1"');
    expect(INDEX).not.toContain('parsed.protocol !== "https:" && parsed.protocol !== "http:"');
  });

  test('usa credencial dedicada, separada da conta de runtime do GA4', () => {
    expect(INDEX).toContain('KC_SEARCH_CONSOLE_SA_KEY');
    expect(INDEX).not.toContain('getEnv("KC_GA4_SA_KEY")');
  });

  test('rebuilds bounded Search Analytics payloads without pass-through fields', () => {
    expect(VALIDATION).toContain('SEARCH_ANALYTICS_MAX_DAYS = 500');
    expect(VALIDATION).toContain('SEARCH_ANALYTICS_MAX_DIMENSIONS = 3');
    expect(VALIDATION).toContain('SEARCH_ANALYTICS_MAX_ROW_LIMIT = 5000');
    expect(VALIDATION).toContain('request contains unsupported fields');
    expect(INDEX).toContain('const body: Record<string, unknown> = {');
    expect(INDEX).not.toContain('body: JSON.stringify(request)');
  });

  test('prevents URL inspection outside the configured HTTPS property', () => {
    expect(VALIDATION).toContain('parsed.protocol !== "https:"');
    expect(VALIDATION).toMatch(
      /hostname\s*===\s*site\.hostname\s*\|\|\s*hostname\.endsWith\(`\.\$\{site\.hostname\}`\)/,
    );
    expect(VALIDATION).toContain('parsed.pathname.startsWith(site.pathPrefix)');
    expect(VALIDATION).toContain('inspectionUrl is outside the configured property');
  });

  test('does not expose Google response bodies or secret-derived errors', () => {
    expect(INDEX).not.toContain('response.text()');
    expect(INDEX).not.toContain('errText');
    expect(INDEX).not.toContain('String(error)');
    expect(INDEX).toContain('search_console_not_ready');
    expect(INDEX).toContain(
      'Enable the Search Console API in Google Cloud and grant the service account access to KC_SEARCH_CONSOLE_SITE_URL.',
    );
  });

  test('bounds body, upstream time, cache size, and cache identity', () => {
    expect(INDEX).toContain('MAX_REQUEST_BODY_BYTES = 16 * 1024');
    expect(INDEX).toContain('GOOGLE_REQUEST_TIMEOUT_MS = 15_000');
    expect(INDEX).toContain('while (responseCache.size >= MAX_CACHE_ENTRIES)');
    expect(INDEX).toContain('stableStringify({ siteUrl: site.siteUrl, request })');
  });
});

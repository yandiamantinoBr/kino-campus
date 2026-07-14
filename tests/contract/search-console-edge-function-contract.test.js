'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const INDEX = read('supabase/functions/kc-search-console-reports/index.ts');
const VALIDATION = read('supabase/functions/kc-search-console-reports/validation.ts');
const CONFIG = read('supabase/config.toml');

describe('Search Console Edge Function contract', () => {
  test('keeps gateway JWT verification and in-handler admin authorization', () => {
    expect(CONFIG).toMatch(
      /\[functions\.kc-search-console-reports\]\s*verify_jwt\s*=\s*true/,
    );
    expect(INDEX).toMatch(/admin\.auth\.getUser\(\s*match\[1\],?\s*\)/);
    expect(INDEX).toContain('.from("profiles")');
    expect(INDEX).toContain('.select("is_admin")');
    expect(INDEX).toContain('profile?.is_admin === true');
  });

  test('uses only the configured read-only Google identity and property', () => {
    expect(INDEX).toMatch(
      /const SEARCH_CONSOLE_SCOPE\s*=\s*"https:\/\/www\.googleapis\.com\/auth\/webmasters\.readonly";/,
    );
    expect(INDEX).not.toMatch(/auth\/webmasters(?=["'])/);
    expect(INDEX).toContain('getEnv("KC_SEARCH_CONSOLE_SA_KEY")');
    expect(INDEX).not.toContain('getEnv("KC_GA4_SA_KEY")');
    expect(INDEX).toContain('getEnv("KC_SEARCH_CONSOLE_SITE_URL")');
    expect(VALIDATION).not.toContain('siteUrl: input.');
  });

  test('mounts the three official read-only API calls exactly', () => {
    expect(INDEX).toMatch(
      /`\$\{WEBMASTERS_API_BASE\}\/sites\/\$\{\s*encodeURIComponent\(site\.siteUrl\)\s*\}\/searchAnalytics\/query`/,
    );
    expect(INDEX).toMatch(
      /`\$\{WEBMASTERS_API_BASE\}\/sites\/\$\{\s*encodeURIComponent\(site\.siteUrl\)\s*\}\/sitemaps`/,
    );
    expect(INDEX).toContain(
      '"https://searchconsole.googleapis.com/v1/urlInspection/index:inspect"',
    );
    expect(INDEX).toMatch(/callSitemaps[\s\S]*?method: "GET"/);
    expect(INDEX).toMatch(/callInspectUrl[\s\S]*?siteUrl: site\.siteUrl/);
  });

  test('supports only the three declared, case-sensitive actions', () => {
    expect(VALIDATION).toContain('input.action === "searchAnalytics"');
    expect(VALIDATION).toContain('input.action === "sitemaps"');
    expect(VALIDATION).toContain('input.action === "inspectUrl"');
    expect(VALIDATION).toContain(
      'action must be searchAnalytics, sitemaps, or inspectUrl',
    );
  });
});

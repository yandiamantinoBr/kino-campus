'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '../..');
var EDGE_FUNCTION = fs.readFileSync(path.join(ROOT, 'supabase/functions/kc-ga4-reports/index.ts'), 'utf8');
var GA4_AUDIT_DOC = fs.readFileSync(path.join(ROOT, 'docs/analytics/GA4-AUDIT-2026-07-08.md'), 'utf8');

describe('kc-ga4-reports Edge Function hardening', function () {
  test('CORS depende de allowlist configuravel, nao de header global fixo', function () {
    expect(EDGE_FUNCTION).toContain('KC_GA4_ALLOWED_ORIGINS');
    expect(EDGE_FUNCTION).toContain('function isOriginAllowed');
    expect(EDGE_FUNCTION).toContain('function corsHeadersFor');
    expect(EDGE_FUNCTION).toContain('origin_not_allowed');
    expect(EDGE_FUNCTION).not.toMatch(/const\s+CORS_HEADERS\s*=\s*\{[\s\S]*["']Access-Control-Allow-Origin["']\s*:\s*["']\*["']/);
  });

  test('cache usa serializacao estavel profunda para filtros aninhados', function () {
    expect(EDGE_FUNCTION).toContain('function stableStringify');
    expect(EDGE_FUNCTION).toContain('Object.entries(value as Record<string, unknown>)');
    expect(EDGE_FUNCTION).toContain('sort(([a], [b]) => a.localeCompare(b))');
    expect(EDGE_FUNCTION).not.toContain('JSON.stringify(body, Object.keys(body).sort())');
  });

  test('limite de consulta fica configuravel com hard cap conservador', function () {
    expect(EDGE_FUNCTION).toContain('KC_GA4_MAX_LIMIT');
    expect(EDGE_FUNCTION).toContain('const DEFAULT_MAX_LIMIT = 1000;');
    expect(EDGE_FUNCTION).toContain('const HARD_MAX_LIMIT = 10000;');
    expect(EDGE_FUNCTION).toContain('limit must be integer 1..');
    expect(EDGE_FUNCTION).not.toContain('250000');
  });
});

describe('GA4 audit doc secret hygiene', function () {
  test('nao reintroduz fragmentos de tokens nos documentos versionados', function () {
    expect(GA4_AUDIT_DOC).not.toMatch(/\bgithub_pat_[A-Za-z0-9_]+/);
    expect(GA4_AUDIT_DOC).not.toMatch(/\bvcp_[A-Za-z0-9_]+/);
    expect(GA4_AUDIT_DOC).not.toMatch(/\bsbp_[A-Za-z0-9_]+/);
  });
});

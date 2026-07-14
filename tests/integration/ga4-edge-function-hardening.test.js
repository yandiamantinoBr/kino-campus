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
    expect(EDGE_FUNCTION).toContain('DEFAULT_ALLOWED_ORIGINS');
    expect(EDGE_FUNCTION).toContain('.filter((origin) => origin !== "*")');
  });

  test('limita tempo e tamanho das chamadas sem devolver erros brutos do Google', function () {
    expect(EDGE_FUNCTION).toContain('GOOGLE_REQUEST_TIMEOUT_MS');
    expect(EDGE_FUNCTION).toContain('MAX_REQUEST_BODY_BYTES');
    expect(EDGE_FUNCTION).toContain('fetchWithTimeout');
    expect(EDGE_FUNCTION).toContain('body_too_large');
    expect(EDGE_FUNCTION).not.toContain('errText.slice');
    expect(EDGE_FUNCTION).not.toContain('error: msg');
  });

  test('valida identificadores e formato da credencial antes de chamar o Google', function () {
    expect(EDGE_FUNCTION).toContain('invalid_property_id');
    expect(EDGE_FUNCTION).toContain('saKey.type !== "service_account"');
    expect(EDGE_FUNCTION).toContain('BEGIN PRIVATE KEY');
    expect(EDGE_FUNCTION).toContain('gserviceaccount\\.com');
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

  test('aplica os limites estruturais oficiais do runReport', function () {
    expect(EDGE_FUNCTION).toContain('v.dateRanges.length > 4');
    expect(EDGE_FUNCTION).toContain('v.metrics.length > 10');
    expect(EDGE_FUNCTION).toContain('v.dimensions.length > 9');
    expect(EDGE_FUNCTION).toContain('unsupported request field');
    expect(EDGE_FUNCTION).toContain('validFieldName');
    expect(EDGE_FUNCTION).toContain('responseCache.size >= MAX_RESPONSE_CACHE_ENTRIES');
    expect(EDGE_FUNCTION).not.toContain('responseCache.size > MAX_RESPONSE_CACHE_ENTRIES');
  });

  test('monta o endpoint runReport com a property no path, nunca no body', function () {
    expect(EDGE_FUNCTION).toMatch(
      /const url = `\$\{DATA_API_BASE\}\/properties\/\$\{\s*encodeURIComponent\(propertyId\)\s*\}:runReport`;/,
    );
    expect(EDGE_FUNCTION).toContain('body: JSON.stringify(body),');
    expect(EDGE_FUNCTION).toContain('callDataApi(saKey, propertyId, validation.value)');
    expect(EDGE_FUNCTION).not.toContain('property: `properties/${propertyId}`');
    expect(EDGE_FUNCTION).not.toContain('trimPath(');
    expect(EDGE_FUNCTION).not.toContain('callDataApi(saKey, propertyId, "", validation.value)');
  });
});

describe('GA4 audit doc secret hygiene', function () {
  test('nao reintroduz fragmentos de tokens nos documentos versionados', function () {
    expect(GA4_AUDIT_DOC).not.toMatch(/\bgithub_pat_[A-Za-z0-9_]+/);
    expect(GA4_AUDIT_DOC).not.toMatch(/\bvcp_[A-Za-z0-9_]+/);
    expect(GA4_AUDIT_DOC).not.toMatch(/\bsbp_[A-Za-z0-9_]+/);
  });
});

'use strict';

const fs = require('fs');
const path = require('path');
const { TextDecoder, TextEncoder } = require('util');
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const SEARCH_SOURCE = fs.readFileSync(
  path.join(ROOT, 'assets/js/features/kc-search.js'),
  'utf8'
);
const MIGRATION_SOURCE = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260714121506_harden_search_analytics_ingestion.sql'),
  'utf8'
).toLowerCase();
const SearchAnalytics = require('../../assets/js/shared/search-analytics.shared.js');

function createSearchRuntime(rpc) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://www.kinocampus.com.br/search-results.html',
    runScripts: 'outside-only',
  });
  const { window } = dom;
  Object.defineProperty(window.document, 'readyState', { configurable: true, value: 'loading' });
  window.KCSearchAnalytics = SearchAnalytics;
  window.KCConsent = { hasConsent: jest.fn(() => true) };
  window.KCSupabase = { getClient: () => ({ rpc }) };
  window.KCPrivacyAnalytics = { track: jest.fn(() => Promise.resolve({ ok: true })) };
  window.KCEvents = { track: jest.fn(() => true) };
  window.eval(SEARCH_SOURCE);
  return { dom, window };
}

describe('ingestao privada de analytics da busca', () => {
  test('usa somente a RPC e nunca envia user_id, id ou created_at', async () => {
    const rpc = jest.fn(() => Promise.resolve({ data: { ok: true, inserted: 1 }, error: null }));
    const page = createSearchRuntime(rpc);

    await expect(page.window.kcSearch.__internals.insertTrackedTerms([
      { term: '  monitoria   calculo  ', user_id: 'nao-enviar', created_at: '2099-01-01' },
    ])).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('kc_ingest_search_queries');
    expect(rpc.mock.calls[0][1]).toEqual({
      p_session_id: expect.any(String),
      p_entries: [{ term: 'monitoria calculo' }],
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/user_id|created_at|2099/);
    page.dom.window.close();
  });

  test('descarta contato, URL e credencial antes de transmitir analytics', async () => {
    const rpc = jest.fn(() => Promise.resolve({ data: { ok: true }, error: null }));
    const page = createSearchRuntime(rpc);
    const insert = page.window.kcSearch.__internals.insertTrackedTerms;

    await expect(insert([
      { term: 'alguem@example.com' },
      { term: 'https://example.com/segredo' },
      { term: 'veja(https://example.com/segredo)' },
      { term: 'example.io' },
      { term: 'foo(example.com)' },
      { term: 'access_token=abc123' },
      { term: 'procure fulano 11 99999-9999' },
      { term: 'edital 2026 para fulano 11 99999-9999 protocolo 123456' },
      { term: 'texto\u0001controle' },
    ])).resolves.toBe(true);

    expect(rpc).not.toHaveBeenCalled();
    page.dom.window.close();
  });

  test('KCPrivacyAnalytics recebe somente origem controlada e faixa de tamanho', () => {
    const rpc = jest.fn();
    const page = createSearchRuntime(rpc);

    expect(page.window.kcSearch.track('alguem@example.com', { source: 'results-submit' })).toBe(true);

    expect(page.window.KCPrivacyAnalytics.track).toHaveBeenCalledWith('search', {
      source: 'results-submit',
      query_length_bucket: '17_32',
    });
    expect(JSON.stringify(page.window.KCPrivacyAnalytics.track.mock.calls)).not.toContain('alguem@example.com');
    expect(SearchAnalytics.readQueue(page.window.sessionStorage)).toEqual([]);
    page.dom.window.close();
  });

  test('mantem lote na fila quando a RPC aplica rate limit', async () => {
    const rpc = jest.fn(() => Promise.resolve({
      data: { ok: false, code: 'RATE_LIMITED' },
      error: null,
    }));
    const page = createSearchRuntime(rpc);

    await expect(page.window.kcSearch.__internals.insertTrackedTerms([
      { term: 'bolsa extensao' },
    ])).resolves.toBe(false);
    page.dom.window.close();
  });
});

describe('migration de ingestao da busca', () => {
  test('remove escrita direta e expoe somente RPCs security definer validadas', () => {
    expect(MIGRATION_SOURCE).toContain('create or replace function public.kc_ingest_search_queries');
    expect(MIGRATION_SOURCE).toContain('language plpgsql\nsecurity definer\nset search_path = \'\'');
    expect(MIGRATION_SOURCE).toContain('revoke all privileges on table public.search_queries');
    expect(MIGRATION_SOURCE).toContain('revoke all privileges on table public.privacy_analytics_events');
    expect(MIGRATION_SOURCE).toContain('grant execute on function public.kc_ingest_search_queries(text, jsonb)');
    expect(MIGRATION_SOURCE).toContain('to anon, authenticated;');
    expect(MIGRATION_SOURCE).toContain('pg_advisory_xact_lock');
    expect(MIGRATION_SOURCE).toContain("'rate_limited'");
  });

  test('anonimiza legado e impede persistencia atribuivel ou sensivel', () => {
    expect(MIGRATION_SOURCE).toContain('set user_id = null');
    expect(MIGRATION_SOURCE).toContain('search_queries_user_id_anonymous_check');
    expect(MIGRATION_SOURCE).toContain('search_queries_session_hash_check');
    expect(MIGRATION_SOURCE).toContain("extensions.digest(session_id, 'sha256')");
    expect(MIGRATION_SOURCE).toContain('search_queries_safe_term_check');
    expect(MIGRATION_SOURCE).toContain("- array['value', 'term', 'q', 'query', 'search_term']");
    expect(MIGRATION_SOURCE).not.toContain("'entity_label', 'href'");
    expect(MIGRATION_SOURCE).toContain("javascript:|data:");
    expect(MIGRATION_SOURCE).toContain("item.value !~ '[0-9]([+() .-]*[0-9]){7,14}'");
  });

  test('protege tendencias brutas com autorizacao admin dentro do banco', () => {
    expect(MIGRATION_SOURCE).toContain('create or replace function public.kc_admin_search_trends(');
    expect(MIGRATION_SOURCE).toContain('create or replace function public.kc_admin_search_trends_classified(');
    expect((MIGRATION_SOURCE.match(/not public\.kc_is_admin\(v_uid\)/g) || [])).toHaveLength(2);
    expect(MIGRATION_SOURCE).toContain("raise insufficient_privilege using message = 'admin access required'");
    expect(MIGRATION_SOURCE).toContain('revoke all on function kc_private.kc_admin_search_trends_classified');
  });
});

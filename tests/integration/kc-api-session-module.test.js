/**
 * @file kc-api-session-module.test.js
 * @description Contract tests for assets/js/api/kc-api.session.js (V76)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../assets/js/api/kc-api.session.js');
const PAGE_MANIFEST = require('../../scripts/admin-pages.manifest.js');
const HTML_FILES_WITH_CLIENT = Object.freeze(PAGE_MANIFEST.ALL_HTML_PAGES.concat(['mensagens.html']));

let source;

function loadFreshSessionModule() {
  jest.resetModules();
  delete window._KCAPI;
  delete window.KCSessionStore;
  delete window.KCPostFreshness;
  delete window.KCSupabase;
  window.sessionStorage.clear();
  window.localStorage.clear();
  require('../../assets/js/api/kc-api.session.js');
  return window._KCAPI.session;
}

beforeAll(() => {
  source = fs.readFileSync(SRC, 'utf8');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('kc-api.session.js - source shape', () => {
  test('mantem IIFE, strict mode, namespace interno e globais publicos congelados', () => {
    expect(source).toContain('(function () {');
    expect(source).toContain("'use strict';");
    expect(source).toContain('window._KCAPI = window._KCAPI || {};');
    expect(source).toContain('window._KCAPI.session = Object.freeze({');
    expect(source).toContain('window.KCSessionStore = Object.freeze({');
    expect(source).toContain('window.KCPostFreshness = Object.freeze({');
    expect(source.trim().endsWith('})();')).toBe(true);
  });

  test('nao cria nova fachada KCAPI nem usa require/import', () => {
    expect(source).not.toContain('window.KCAPI =');
    expect(source).not.toContain('require(');
    expect(source).not.toContain('import ');
  });
});

describe('kc-api.session.js - session cache contract', () => {
  let session;

  beforeEach(() => {
    session = loadFreshSessionModule();
  });

  test('exporta os helpers internos esperados e preserva globais existentes', () => {
    expect(Object.isFrozen(session)).toBe(true);
    expect(Object.isFrozen(window.KCSessionStore)).toBe(true);
    expect(Object.isFrozen(window.KCPostFreshness)).toBe(true);
    expect(Object.keys(session).sort()).toEqual([
      'POST_FRESHNESS_CHANNEL',
      'POST_FRESHNESS_EVENT',
      'POST_FRESHNESS_RT_TOPIC',
      'POST_FRESHNESS_STORAGE_KEY',
      'SESSION_STORE_PREFIX',
      'SESSION_STORE_VERSION',
      'buildSessionStoreKey',
      'clearPostFreshnessCaches',
      'clearSessionCachePrefix',
      'clearSessionCacheScopes',
      'dispatchPostFreshness',
      'emitPostFreshness',
      'ensureRealtimeFreshnessChannel',
      'getCachedSessionPayload',
      'getSessionCache',
      'getSessionStore',
      'normalizePostFreshnessChange',
      'persistSessionPayload',
      'publishRealtimeFreshness',
      'removeSessionCache',
      'setSessionCache',
      'setupPostFreshnessTransports',
      'subscribePostFreshness',
      'withPendingSessionRequest',
    ]);
  });

  test('mantem versao, prefixo e formato de chave do KCSessionStore', () => {
    expect(window.KCSessionStore.version).toBe('9.0.0');
    expect(window.KCSessionStore.getStore()).toBe(window.KCSessionStore);
    expect(window.KCSessionStore.key('feeds', 'snapshot')).toBe('kc:9.0.0:feeds:snapshot');

    expect(window.KCSessionStore.set('feeds', 'snapshot', { ok: true })).toBe(true);
    expect(window.KCSessionStore.get('feeds', 'snapshot').value).toEqual({ ok: true });
    expect(window.sessionStorage.getItem('kc:9.0.0:feeds:snapshot')).toContain('"version":"9.0.0"');
    expect(window.KCSessionStore.remove('feeds', 'snapshot')).toBe(true);
    expect(window.KCSessionStore.get('feeds', 'snapshot')).toBeNull();
  });

  test('clearPrefix e clearScopes removem apenas escopos compatíveis', () => {
    window.KCSessionStore.set('feeds', 'a', { ok: true });
    window.KCSessionStore.set('feeds', 'b', { ok: true });
    window.KCSessionStore.set('profile', 'a', { ok: true });

    expect(window.KCSessionStore.clearPrefix('feeds', '')).toBe(2);
    expect(window.KCSessionStore.get('feeds', 'a')).toBeNull();
    expect(window.KCSessionStore.get('profile', 'a').value.ok).toBe(true);
    expect(window.KCSessionStore.clearScopes(['profile'])).toBe(1);
    expect(window.KCSessionStore.get('profile', 'a')).toBeNull();
  });

  test('helpers SWR preservam assinatura, stale e deduplicacao de requests', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1000);
    session.persistSessionPayload('comments', 'post-1', [{ id: 'c1' }], 'sig-1');

    nowSpy.mockReturnValue(1250);
    expect(session.getCachedSessionPayload('comments', 'post-1', 100, 1000)).toBeNull();
    expect(session.getCachedSessionPayload('comments', 'post-1', 100, 1000, { allowStale: true })).toMatchObject({
      data: [{ id: 'c1' }],
      signature: 'sig-1',
      age: 250,
      isFresh: false,
    });

    const bucket = new Map();
    const factory = jest.fn(() => Promise.resolve('ok'));
    const first = session.withPendingSessionRequest(bucket, 'same', factory);
    const second = session.withPendingSessionRequest(bucket, 'same', factory);

    expect(first).toBe(second);
    await expect(first).resolves.toBe('ok');
    expect(factory).toHaveBeenCalledTimes(1);
    expect(bucket.has('same')).toBe(false);
  });
});

describe('kc-api.session.js - post freshness contract', () => {
  let session;

  beforeEach(() => {
    session = loadFreshSessionModule();
  });

  test('normaliza payload sem campos privados e limpa caches de conteudo no emit', () => {
    window.KCSessionStore.set('feeds', 'snapshot', { posts: [{ id: 'p1' }] });
    window.KCSessionStore.set('product-detail', 'supabase:p1', { post: { id: 'p1' } });

    const received = [];
    const off = window.KCPostFreshness.subscribe((change) => received.push(change));
    const normalized = window.KCPostFreshness.emit({
      type: 'soft_deleted',
      eventId: 'evt-1',
      postId: 'p1',
      legacyId: 'legacy-1',
      module: 'eventos',
      status: 'deleted',
      title: 'Titulo sensivel',
      email: 'aluno@ufg.br',
      publicFlag: 'ok',
    });
    off();

    expect(normalized).toMatchObject({
      type: 'soft_deleted',
      eventId: 'evt-1',
      postId: 'p1',
      uuid: 'p1',
      legacyId: 'legacy-1',
      module: 'eventos',
      status: 'deleted',
      source: 'local',
      publicFlag: 'ok',
    });
    expect(normalized.title).toBeUndefined();
    expect(normalized.email).toBeUndefined();
    expect(received).toHaveLength(1);
    expect(window.KCSessionStore.get('feeds', 'snapshot')).toBeNull();
    expect(window.KCSessionStore.get('product-detail', 'supabase:p1')).toBeNull();
  });

  test('deduplica dispatch pelo eventId', () => {
    const received = [];
    const off = window.KCPostFreshness.subscribe((change) => received.push(change));
    const payload = session.normalizePostFreshnessChange({ eventId: 'same-event', postId: 'p1' });

    session.dispatchPostFreshness(payload);
    session.dispatchPostFreshness(payload);
    off();

    expect(received).toHaveLength(1);
  });

  test('publica no broadcast Realtime com topico fixo e sem campos privados', () => {
    const send = jest.fn();
    const subscribe = jest.fn();
    const on = jest.fn(() => ({ send, subscribe, on }));
    const channel = jest.fn(() => ({ send, subscribe, on }));
    window.KCSupabase = { getClient: jest.fn(() => ({ channel })) };

    const payload = session.normalizePostFreshnessChange({
      type: 'updated',
      eventId: 'evt-rt',
      postId: 'p1',
      module: 'moradia',
      status: 'publicado',
      email: 'privado@ufg.br',
    });

    expect(session.publishRealtimeFreshness(payload)).toBe(true);
    expect(channel).toHaveBeenCalledWith('kc-posts-changes', { config: { broadcast: { self: false } } });
    expect(on).toHaveBeenCalledWith('broadcast', { event: 'post_change' }, expect.any(Function));
    expect(send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'post_change',
      payload: {
        type: 'updated',
        eventId: 'evt-rt',
        postId: 'p1',
        legacyId: '',
        module: 'moradia',
        status: 'publicado',
        updated_at: '',
      },
    });
  });
});

describe('kc-api.session.js - html loading order', () => {
  test('os carregadores reais incluem session entre diagnostics e kc-api.client.js', () => {
    HTML_FILES_WITH_CLIENT.forEach((file) => {
      const html = fs.readFileSync(path.resolve(__dirname, '..', '..', file), 'utf8');
      const diagnosticsIdx = html.indexOf('kc-api.diagnostics.js');
      const sessionIdx = html.indexOf('kc-api.session.js');
      const clientIdx = html.indexOf('kc-api.client.js');

      expect(diagnosticsIdx).toBeGreaterThan(-1);
      expect(sessionIdx).toBeGreaterThan(-1);
      expect(clientIdx).toBeGreaterThan(-1);
      expect(diagnosticsIdx).toBeLessThan(sessionIdx);
      expect(sessionIdx).toBeLessThan(clientIdx);
    });
  });
});

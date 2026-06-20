/**
 * @file kc-api-transport-config-contract.test.js
 * @description Behavioral parity contract for KCAPI transport/config core (V76.30).
 */
'use strict';

const CLIENT_PATH = '../../assets/js/api/kc-api.client.js';

let originalGlobalFetch;
let originalWindowFetch;

function loadFreshClient() {
  jest.resetModules();
  delete window.KCAPI;
  delete window._KCAPI;
  delete window.getLastCreatePostError;
  delete window.setLastCreatePostError;
  delete window.clearLastCreatePostError;
  delete window.summarizeCreatePayloadForDiagnostics;

  window.KC_ENV = {
    version: '9.0.0',
    driver: 'local',
    environment: 'development',
    APP_ENV: 'development',
    isProduction: false,
    debug: false,
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-key',
    supabase: {
      url: 'https://test.supabase.co',
      anonKey: 'test-key',
      storageBucket: 'kino-media',
    },
  };

  require(CLIENT_PATH);
  return window.KCAPI;
}

beforeAll(() => {
  originalGlobalFetch = global.fetch;
  originalWindowFetch = window.fetch;
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();

  if (originalGlobalFetch === undefined) delete global.fetch;
  else global.fetch = originalGlobalFetch;

  if (originalWindowFetch === undefined) delete window.fetch;
  else window.fetch = originalWindowFetch;
});

describe('KCAPI transport/config behavioral contract', () => {
  test('setConfig atualiza somente os campos públicos válidos', () => {
    const api = loadFreshClient();

    api.setConfig({
      baseURL: 'https://api.example.test/v1/',
      fallbackDatabaseURLs: ['', 'data/primary.json', null, 'data/backup.json'],
      timeoutMs: 2500,
      ignored: 'fora-do-contrato',
    });

    expect(api.config).toEqual({
      baseURL: 'https://api.example.test/v1/',
      fallbackDatabaseURLs: ['data/primary.json', 'data/backup.json'],
      timeoutMs: 2500,
      debug: false,
    });
    expect(api.config).not.toHaveProperty('ignored');
  });

  test('setConfig ignora payload ausente e tipos inválidos', () => {
    const api = loadFreshClient();
    const baseline = { ...api.config, fallbackDatabaseURLs: [...api.config.fallbackDatabaseURLs] };

    expect(api.setConfig(null)).toBeUndefined();
    api.setConfig({
      baseURL: 42,
      fallbackDatabaseURLs: 'data/invalid.json',
      timeoutMs: Number.POSITIVE_INFINITY,
    });

    expect(api.config).toEqual(baseline);
  });

  test('apiURL mantém caminho relativo quando baseURL está vazio', () => {
    const api = loadFreshClient();

    expect(api.apiURL('/posts?limit=12')).toBe('posts?limit=12');
    expect(api.apiURL('posts/1')).toBe('posts/1');
    expect(api.apiURL(null)).toBe('');
  });

  test('apiURL normaliza uma barra entre baseURL e caminho', () => {
    const api = loadFreshClient();
    api.setConfig({ baseURL: 'https://api.example.test/v1/' });

    expect(api.apiURL('/posts')).toBe('https://api.example.test/v1/posts');
    expect(api.apiURL('posts/1')).toBe('https://api.example.test/v1/posts/1');
  });

  test('fetchJSON preserva URL/opções e retorna o JSON da resposta', async () => {
    const api = loadFreshClient();
    const payload = { ok: true, items: [{ id: 'post-1' }] };
    const response = { ok: true, status: 200, json: jest.fn().mockResolvedValue(payload) };
    const fetchMock = jest.fn().mockResolvedValue(response);
    global.fetch = fetchMock;
    window.fetch = fetchMock;
    api.setConfig({ timeoutMs: 0 });

    const result = await api.fetchJSON('/api/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"title":"Teste"}',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"title":"Teste"}',
    });
    expect(response.json).toHaveBeenCalledTimes(1);
    expect(result).toEqual(payload);
  });

  test('fetchJSON converte resposta HTTP não-ok em KCAPI_HTTP_<status>', async () => {
    const api = loadFreshClient();
    const response = { ok: false, status: 503, json: jest.fn() };
    const fetchMock = jest.fn().mockResolvedValue(response);
    global.fetch = fetchMock;
    window.fetch = fetchMock;
    api.setConfig({ timeoutMs: 0 });

    await expect(api.fetchJSON('/api/unavailable')).rejects.toThrow('KCAPI_HTTP_503');
    expect(response.json).not.toHaveBeenCalled();
  });

  test('fetchJSON propaga rejeição original antes do timeout', async () => {
    const api = loadFreshClient();
    const networkError = new TypeError('network down');
    const fetchMock = jest.fn().mockRejectedValue(networkError);
    global.fetch = fetchMock;
    window.fetch = fetchMock;
    api.setConfig({ timeoutMs: 1000 });

    await expect(api.fetchJSON('/api/network-error')).rejects.toBe(networkError);
  });

  test('fetchJSON rejeita com KCAPI_TIMEOUT quando o prazo configurado expira', async () => {
    jest.useFakeTimers();
    const api = loadFreshClient();
    const fetchMock = jest.fn(() => new Promise(() => {}));
    global.fetch = fetchMock;
    window.fetch = fetchMock;
    api.setConfig({ timeoutMs: 25 });

    const request = api.fetchJSON('/api/slow');
    const rejection = expect(request).rejects.toThrow('KCAPI_TIMEOUT');
    await jest.advanceTimersByTimeAsync(25);

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

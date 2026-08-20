/** @jest-environment node */

'use strict';

jest.mock('../../server/cadu-auth.mjs', () => ({
  requireCaduAdmin: jest.fn(),
  stripCaduAdminQuery: jest.fn((query) => String(query || '')),
}));

const { requireCaduAdmin } = require('../../server/cadu-auth.mjs');
const healthHandler = require('../../api/cadu/health.js').default;
const feedModule = require('../../api/cadu/feed.js');
const feedHandler = feedModule.default;
const publishModule = require('../../api/cadu/publish.js');
const publishHandler = publishModule.default;

function createResponse() {
  const headers = new Map();
  return {
    statusCode: null,
    body: undefined,
    headers,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() { return this; },
  };
}

function upstreamResponse({ status = 200, body = '{}', headers = {} } = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), String(value)]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) { return normalized[String(name).toLowerCase()] || null; },
    },
    text: jest.fn(async () => body),
  };
}

describe('legacy Cadu proxies use bounded, non-reflective transport contracts', () => {
  const originalFetch = global.fetch;
  const originalApiUrl = process.env.CADU_API_URL;
  const originalApiToken = process.env.CADU_API_TOKEN;

  beforeEach(() => {
    process.env.CADU_API_URL = 'https://cadu.test/';
    process.env.CADU_API_TOKEN = 'test-token';
    global.fetch = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    requireCaduAdmin.mockReset();
    requireCaduAdmin.mockResolvedValue({ id: 'admin-user' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalApiUrl === undefined) delete process.env.CADU_API_URL;
    else process.env.CADU_API_URL = originalApiUrl;
    if (originalApiToken === undefined) delete process.env.CADU_API_TOKEN;
    else process.env.CADU_API_TOKEN = originalApiToken;
  });

  test('keeps public health liveness-compatible while removing operational state', async () => {
    global.fetch.mockResolvedValue(upstreamResponse({ body: JSON.stringify({
      status: 'ok',
      version: '0.5.20',
      ts: '2026-08-20T12:00:00.000Z',
      pipeline: { active_run: 'private-run', approval: 'sensitive' },
      alerts: { webhook: 'private' },
    }) }));
    const res = createResponse();

    await healthHandler({ method: 'GET', headers: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      status: 'ok', version: '0.5.20', ts: '2026-08-20T12:00:00.000Z',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/private-run|sensitive|webhook/);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(global.fetch.mock.calls[0][1]).toMatchObject({ method: 'GET', redirect: 'error' });
  });

  test('preserves the numeric health timestamp used by the existing admin panel', () => {
    expect(require('../../api/cadu/health.js').publicCaduHealthPayload({
      status: 'ok', ts: 1_785_000_000,
    })).toEqual({ status: 'ok', ts: 1_785_000_000 });
  });

  test('accepts safe compatible health timestamp encodings without widening the public schema', () => {
    const { publicCaduHealthPayload } = require('../../api/cadu/health.js');
    expect(publicCaduHealthPayload({ status: 'ok', ts: '1785000000' }))
      .toEqual({ status: 'ok', ts: 1_785_000_000 });
    expect(publicCaduHealthPayload({ status: 'ok', ts: '2026-08-20T09:00:00-03:00' }))
      .toEqual({ status: 'ok', ts: '2026-08-20T09:00:00-03:00' });
    expect(publicCaduHealthPayload({ status: 'ok', ts: '4102444801' })).toEqual({ status: 'ok' });
  });

  test('rejects parseable but structurally invalid anonymous health payloads', async () => {
    global.fetch.mockResolvedValue(upstreamResponse({ body: JSON.stringify([]) }));
    const res = createResponse();

    await healthHandler({ method: 'GET', headers: {} }, res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: 'cadu_api_invalid_response' });
  });

  test('health preserves status codes but never reflects upstream error or transport text', async () => {
    global.fetch.mockResolvedValueOnce(upstreamResponse({
      status: 503,
      body: JSON.stringify({ stack: 'hidden', token: 'redacted' }),
    }));
    const upstreamFailure = createResponse();
    await healthHandler({ method: 'GET', headers: {} }, upstreamFailure);
    expect(upstreamFailure.statusCode).toBe(503);
    expect(upstreamFailure.body).toEqual({ error: 'cadu_api_error', status: 503 });

    const timeout = new Error('private endpoint and token');
    timeout.name = 'TimeoutError';
    global.fetch.mockRejectedValueOnce(timeout);
    const transportFailure = createResponse();
    await healthHandler({ method: 'GET', headers: {} }, transportFailure);
    expect(transportFailure.statusCode).toBe(504);
    expect(transportFailure.body).toEqual({ error: 'cadu_api_timeout' });
    expect(JSON.stringify(transportFailure.body)).not.toContain('private endpoint');
  });

  test('feed error and malformed response bodies are bounded and non-reflective', async () => {
    global.fetch.mockResolvedValueOnce(upstreamResponse({
      status: 500,
      body: JSON.stringify({ stack: 'private feed stack', body: 'service-token' }),
    }));
    const upstreamFailure = createResponse();
    await feedHandler({
      method: 'GET', query: {}, url: '/api/cadu/feed?limit=20', headers: {},
    }, upstreamFailure);
    expect(upstreamFailure.statusCode).toBe(500);
    expect(upstreamFailure.body).toEqual({ error: 'cadu_api_error', status: 500 });
    expect(upstreamFailure.headers.has('access-control-allow-origin')).toBe(false);
    expect(upstreamFailure.headers.get('x-content-type-options')).toBe('nosniff');

    global.fetch.mockResolvedValueOnce(upstreamResponse({ body: '<html>private upstream error</html>' }));
    const malformed = createResponse();
    await feedHandler({ method: 'GET', query: {}, url: '/api/cadu/feed', headers: {} }, malformed);
    expect(malformed.statusCode).toBe(502);
    expect(malformed.body).toEqual({ error: 'cadu_api_invalid_response' });
    expect(JSON.stringify(malformed.body)).not.toContain('private upstream');
  });

  test('feed and publish cap outgoing bodies before any upstream request', async () => {
    const tooLarge = { message: 'x'.repeat(64 * 1024 + 1) };
    expect(() => feedModule.serializeCaduFeedBody({ method: 'POST', body: tooLarge }))
      .toThrow('cadu_request_body_too_large');
    expect(() => publishModule.serializeCaduPublishBody(tooLarge))
      .toThrow('cadu_request_body_too_large');
  });

  test('publish maps timeouts to a stable response and does not enable cross-origin bearer use', async () => {
    const timeout = new Error('private publish path token=secret');
    timeout.name = 'TimeoutError';
    global.fetch.mockRejectedValue(timeout);
    const res = createResponse();

    await publishHandler({
      method: 'POST',
      body: { action: 'publish', name: 'UFG', url: 'https://ufg.br/' },
      headers: {},
    }, res);

    expect(res.statusCode).toBe(504);
    expect(res.body).toEqual({ error: 'cadu_api_timeout' });
    expect(res.headers.has('access-control-allow-origin')).toBe(false);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(JSON.stringify(res.body)).not.toContain('private publish');
  });
});

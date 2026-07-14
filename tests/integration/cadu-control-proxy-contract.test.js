'use strict';

jest.mock('../../server/cadu-auth.mjs', () => ({
  requireCaduAdmin: jest.fn(),
}));

const { requireCaduAdmin } = require('../../server/cadu-auth.mjs');
const {
  buildCaduControlTargetUrl,
  classifyCaduOpenclawRequest,
  classifyCaduPipelineRequest,
} = require('../../server/cadu-control-proxy.js');
const directPipelineHandler = require('../../api/cadu/pipeline.js').default;
const pipelineHandler = require('../../api/cadu/pipeline-router.js').default;
const openclawHandler = require('../../api/cadu/openclaw-router.js').default;

function response() {
  const headers = new Map();
  const listeners = new Map();
  return {
    statusCode: null,
    body: undefined,
    chunks: [],
    writableEnded: false,
    destroyed: false,
    headers,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.writableEnded = true;
      return this;
    },
    send(body) {
      this.body = body;
      this.writableEnded = true;
      return this;
    },
    write(chunk) {
      this.chunks.push(chunk);
      return true;
    },
    end(body) {
      if (body !== undefined) this.body = body;
      this.writableEnded = true;
      return this;
    },
    flushHeaders: jest.fn(),
    once(name, listener) {
      listeners.set(name, listener);
      return this;
    },
    off(name, listener) {
      if (listeners.get(name) === listener) listeners.delete(name);
      return this;
    },
  };
}

function request({ method = 'GET', path, query = '', body, headers = {} } = {}) {
  const listeners = new Map();
  return {
    method,
    query: path === undefined ? {} : { path },
    url: `/api/cadu/pipeline-router${query ? `?path=${encodeURIComponent(String(path))}&${query}` : (path === undefined ? '' : `?path=${encodeURIComponent(String(path))}`)}`,
    body,
    headers,
    once(name, listener) {
      listeners.set(name, listener);
      return this;
    },
    off(name, listener) {
      if (listeners.get(name) === listener) listeners.delete(name);
      return this;
    },
  };
}

function upstreamResponse({ status = 200, body = '{}', headers = {} } = {}) {
  const normalized = Object.fromEntries(
    Object.entries({ 'content-type': 'application/json', ...headers })
      .map(([name, value]) => [name.toLowerCase(), value]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return normalized[String(name).toLowerCase()] ?? null;
      },
    },
    text: jest.fn(async () => body),
  };
}

describe('strict Cadu control-plane route contract', () => {
  test.each([
    ['', 'GET', '', 'status', ''],
    ['health', 'GET', '', 'health', ''],
    ['runs', 'GET', 'limit=8', 'runs', 'limit=8'],
    ['readiness', 'GET', '', 'readiness', ''],
    ['alert-status', 'GET', '', 'alert-status', ''],
    ['preflight', 'GET', '', 'preflight', ''],
    ['preflight', 'GET', 'deep=1', 'preflight', 'deep=1'],
    ['run', 'POST', '', 'run', ''],
    ['run/dry-run', 'POST', '', 'run_dry-run', ''],
    ['run/real', 'POST', '', 'run_real', ''],
    ['8192bbbe', 'GET', '', 'run_detail', ''],
    ['run-playwright-1/artifacts', 'GET', '', 'artifacts', ''],
    ['8192bbbe/log', 'GET', 'tail=180', 'log', 'tail=180'],
    ['8192bbbe/log', 'GET', 'download=1', 'log', 'download=1'],
    ['8192bbbe/export', 'GET', '', 'export', ''],
    ['8192bbbe/stream', 'GET', 'follow=true', 'stream', 'follow=true'],
    ['8192bbbe/stream', 'GET', '', 'stream', ''],
    ['8192bbbe/stop', 'POST', '', 'stop', ''],
  ])('accepts UI pipeline route %s', (path, method, query, kind, canonicalQuery) => {
    const route = classifyCaduPipelineRequest(path, method, query);
    expect(route).toMatchObject({ ok: true, namespace: 'pipeline', kind });
    expect(route.query.toString()).toBe(canonicalQuery);
  });

  test.each([
    ['context', 'GET', '', 'context', ''],
    ['context', 'GET', 'refresh=true', 'context', 'refresh=true'],
    ['status', 'GET', '', 'status', ''],
    ['sessions', 'GET', 'limit=8', 'sessions', 'limit=8'],
    ['messages', 'GET', 'limit=10&channel=telegram', 'messages', 'channel=telegram&limit=10'],
    ['logs', 'GET', 'limit=80', 'logs', 'limit=80'],
    ['heartbeat', 'GET', '', 'heartbeat', ''],
    ['agent-send', 'POST', '', 'agent-send', ''],
    ['agent-event', 'POST', '', 'agent-event', ''],
  ])('accepts UI OpenClaw route %s', (path, method, query, kind, canonicalQuery) => {
    const route = classifyCaduOpenclawRequest(path, method, query);
    expect(route).toMatchObject({ ok: true, namespace: 'openclaw', kind });
    expect(route.query.toString()).toBe(canonicalQuery);
  });

  test.each([
    '../status',
    'run/../status',
    '%2e%2e%2fstatus',
    '%252e%252e%252fstatus',
    '%25252e%25252e%25252fstatus',
    'run%2freal',
    'run%252freal',
    'run\\real',
    '/run/real',
    'run//real',
    'run/real/',
    'run?mode=real',
    'run#real',
  ])('rejects pipeline traversal/normalization form %s', (path) => {
    expect(classifyCaduPipelineRequest(path, 'POST', '')).toMatchObject({ ok: false, status: 400 });
  });

  test.each([
    '../status',
    'logs/../status',
    '%2e%2e%2fstatus',
    '%252e%252e%252fstatus',
    'agent-send%2f..%2fstatus',
    'agent-send\\status',
    '/status',
    'status/',
  ])('rejects OpenClaw traversal/normalization form %s', (path) => {
    expect(classifyCaduOpenclawRequest(path, 'GET', '')).toMatchObject({ ok: false, status: 400 });
  });

  test.each([
    ['runs', 'GET', 'limit=8&admin=1'],
    ['runs', 'GET', 'limit=8&limit=9'],
    ['runs', 'GET', 'limit=0'],
    ['runs', 'GET', 'limit=201'],
    ['preflight', 'GET', 'deep=2'],
    ['8192bbbe/log', 'GET', 'tail=80&download=1'],
    ['8192bbbe/log', 'GET', 'tail=-1'],
    ['8192bbbe/stream', 'GET', 'follow=false'],
    ['8192bbbe/stream', 'GET', 'follow=true&token=secret'],
    ['run/real', 'POST', 'kc_admin_token=secret'],
  ])('rejects non-contract pipeline query for %s', (path, method, query) => {
    expect(classifyCaduPipelineRequest(path, method, query)).toMatchObject({ ok: false, status: 400 });
  });

  test('rejects arrays, absent router paths, unknown routes, and wrong methods', () => {
    expect(classifyCaduPipelineRequest(['runs', 'health'], 'GET', '')).toMatchObject({ ok: false });
    expect(classifyCaduPipelineRequest(undefined, 'GET', '')).toMatchObject({ ok: false });
    expect(classifyCaduPipelineRequest('unknown/action', 'GET', '')).toMatchObject({ ok: false });
    expect(classifyCaduPipelineRequest('runs', 'POST', 'limit=8')).toMatchObject({
      ok: false,
      status: 405,
      allow: ['GET'],
    });
    expect(classifyCaduOpenclawRequest('heartbeat', 'POST', '')).toMatchObject({ ok: false });
    expect(classifyCaduOpenclawRequest(['status', 'logs'], 'GET', '')).toMatchObject({ ok: false });
    expect(classifyCaduOpenclawRequest('logs', 'GET', 'limit=80&tail=1')).toMatchObject({ ok: false });
    expect(classifyCaduOpenclawRequest('context', 'GET', 'refresh=1')).toMatchObject({ ok: false });
    expect(classifyCaduOpenclawRequest('messages', 'GET', 'channel=telegram/../../etc')).toMatchObject({ ok: false });
    expect(classifyCaduOpenclawRequest('status', 'POST', '')).toMatchObject({
      ok: false,
      status: 405,
      allow: ['GET'],
    });
    expect(classifyCaduPipelineRequest('', 'GET', 'path=run%2Freal')).toMatchObject({ ok: false });
    expect(classifyCaduPipelineRequest('runs', 'GET', 'path=health&limit=8', {
      allowRoutingPathParam: true,
    })).toMatchObject({ ok: false });
    expect(classifyCaduPipelineRequest('runs', 'GET', 'path=runs&limit=8', {
      allowRoutingPathParam: true,
    })).toMatchObject({ ok: true });
  });

  test('rebuilds target URLs only from classified segments and canonical queries', () => {
    const route = classifyCaduPipelineRequest('run-playwright-1/log', 'GET', 'tail=080');
    expect(route.ok).toBe(true);
    expect(buildCaduControlTargetUrl('https://cadu.example/', route))
      .toBe('https://cadu.example/api/pipeline/run-playwright-1/log?tail=80');
    expect(() => buildCaduControlTargetUrl('https://user:secret@cadu.example/', route)).toThrow();
    expect(() => buildCaduControlTargetUrl('https://cadu.example/?target=other', route)).toThrow();
    expect(() => buildCaduControlTargetUrl('https://cadu.example/', {
      ok: true,
      namespace: 'pipeline',
      segments: ['..', 'openclaw'],
      query: new URLSearchParams(),
    })).toThrow();
  });
});

describe('strict Cadu control-plane proxy runtime', () => {
  const originalFetch = global.fetch;
  const originalApiUrl = process.env.CADU_API_URL;
  const originalApiToken = process.env.CADU_API_TOKEN;

  beforeEach(() => {
    process.env.CADU_API_URL = 'https://cadu.example/';
    process.env.CADU_API_TOKEN = 'server-secret';
    global.fetch = jest.fn();
    requireCaduAdmin.mockReset();
    requireCaduAdmin.mockResolvedValue({ id: 'admin-user' });
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalApiUrl === undefined) delete process.env.CADU_API_URL;
    else process.env.CADU_API_URL = originalApiUrl;
    if (originalApiToken === undefined) delete process.env.CADU_API_TOKEN;
    else process.env.CADU_API_TOKEN = originalApiToken;
  });

  test('forwards an allowed pipeline request with server credentials and bounded fetch options', async () => {
    global.fetch.mockResolvedValue(upstreamResponse({ body: '{"runs":[]}' }));
    const req = request({ path: 'runs', query: 'limit=8', headers: { authorization: 'Bearer browser-jwt' } });
    const res = response();

    await pipelineHandler(req, res);

    expect(requireCaduAdmin).toHaveBeenCalledWith(req, res);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://cadu.example/api/pipeline/runs?limit=8');
    expect(options).toMatchObject({ method: 'GET', redirect: 'error' });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.headers.Authorization).toBe('Bearer server-secret');
    expect(JSON.stringify(options)).not.toContain('browser-jwt');
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"runs":[]}');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  test('keeps the direct pipeline entry point limited to its exact root URL', async () => {
    global.fetch.mockResolvedValue(upstreamResponse({ body: '{"stages":[]}' }));
    const req = request();
    req.url = '/api/cadu/pipeline';
    const res = response();

    await directPipelineHandler(req, res);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://cadu.example/api/pipeline',
      expect.objectContaining({ method: 'GET', redirect: 'error' }),
    );
    expect(res.statusCode).toBe(200);

    global.fetch.mockClear();
    requireCaduAdmin.mockClear();
    const wrongReq = request();
    wrongReq.url = '/api/cadu/pipeline-router';
    const wrongRes = response();
    await directPipelineHandler(wrongReq, wrongRes);
    expect(wrongRes.statusCode).toBe(400);
    expect(requireCaduAdmin).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();

    const injectedReq = request();
    injectedReq.url = '/api/cadu/pipeline?path=run%2Freal';
    const injectedRes = response();
    await directPipelineHandler(injectedReq, injectedRes);
    expect(injectedRes.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('forwards only the allowed OpenClaw POST route and preserves a false JSON body', async () => {
    global.fetch.mockResolvedValue(upstreamResponse({ body: '{"ok":true}' }));
    const req = request({ method: 'POST', path: 'agent-event', body: false });
    req.url = '/api/cadu/openclaw-router?path=agent-event';
    const res = response();

    await openclawHandler(req, res);

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://cadu.example/api/openclaw/agent-event');
    expect(options.body).toBe('false');
    expect(options.redirect).toBe('error');
    expect(res.statusCode).toBe(200);
  });

  test('rejects traversal before auth and never attaches the service token', async () => {
    const req = request({ method: 'POST', path: '%252e%252e%252fopenclaw' });
    const res = response();

    await pipelineHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/^invalid_cadu_pipeline_/);
    expect(requireCaduAdmin).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('rejects OpenClaw traversal before auth and upstream fetch', async () => {
    const req = request({ method: 'POST', path: 'agent-send%2F..%2Fstatus', body: {} });
    req.url = '/api/cadu/openclaw-router?path=agent-send%252F..%252Fstatus';
    const res = response();

    await openclawHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/^invalid_cadu_openclaw_/);
    expect(requireCaduAdmin).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns 405 with an exact Allow header for method confusion', async () => {
    const req = request({ method: 'POST', path: 'runs', query: 'limit=8' });
    const res = response();

    await pipelineHandler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, OPTIONS');
    expect(requireCaduAdmin).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('rejects oversized upstream responses instead of buffering them', async () => {
    global.fetch.mockResolvedValue(upstreamResponse({
      headers: { 'content-length': String(4 * 1024 * 1024 + 1) },
    }));
    const req = request({ path: 'health' });
    const res = response();

    await pipelineHandler(req, res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ ok: false, error: 'cadu_api_response_too_large' });
  });

  test('maps bounded upstream timeouts to a stable 504 without leaking details', async () => {
    const timeout = new Error('internal upstream address and secret');
    timeout.name = 'TimeoutError';
    global.fetch.mockRejectedValue(timeout);
    const req = request({ path: 'health' });
    const res = response();

    await pipelineHandler(req, res);

    expect(res.statusCode).toBe(504);
    expect(res.body).toEqual({ ok: false, error: 'cadu_api_timeout' });
    expect(JSON.stringify(res.body)).not.toContain('internal upstream');
  });

  test('preserves an upstream failure status but never reflects its body', async () => {
    global.fetch.mockResolvedValue(upstreamResponse({
      status: 409,
      body: JSON.stringify({
        error: 'internal stack',
        token: 'service-secret',
        detail: { existing_run_id: 'run-active-1', stderr: 'private command output' },
      }),
    }));
    const req = request({ method: 'POST', path: 'run/real', body: { mode: 'full' } });
    const res = response();

    await pipelineHandler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      ok: false,
      error: 'cadu_api_error',
      status: 409,
      detail: { existing_run_id: 'run-active-1' },
    });
    expect(JSON.stringify(res.body)).not.toContain('service-secret');
    expect(JSON.stringify(res.body)).not.toContain('private command output');
  });

  test('streams only the exact SSE route with redirect blocking and a byte signal', async () => {
    const chunks = [Buffer.from('event: log\ndata: {"line":"ok"}\n\n', 'utf8')];
    let cursor = 0;
    const cancel = jest.fn(async () => {});
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'text/event-stream' },
      body: {
        getReader() {
          return {
            read: jest.fn(async () => (
              cursor < chunks.length ? { value: chunks[cursor++], done: false } : { done: true }
            )),
            cancel,
          };
        },
      },
    });
    const req = request({ path: '8192bbbe/stream', query: 'follow=true' });
    const res = response();

    await pipelineHandler(req, res);

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://cadu.example/api/pipeline/8192bbbe/stream?follow=true');
    expect(options.redirect).toBe('error');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(res.chunks).toHaveLength(1);
    expect(Buffer.isBuffer(res.chunks[0]) || ArrayBuffer.isView(res.chunks[0])).toBe(true);
    expect(cancel).toHaveBeenCalled();
    expect(res.writableEnded).toBe(true);
  });

  test('rejects a non-SSE upstream response with a stable 502 and no leaked detail', async () => {
    const cancel = jest.fn(async () => {});
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      body: {
        cancel,
        getReader: jest.fn(),
      },
    });
    const req = request({ path: '8192bbbe/stream', query: 'follow=true' });
    const res = response();

    await pipelineHandler(req, res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ ok: false, error: 'cadu_api_error' });
    expect(JSON.stringify(res.body)).not.toContain('detail');
    expect(cancel).toHaveBeenCalled();
  });
});

/** @jest-environment node */

'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {
  createCaduUpstreamDispatcher,
  fetchCaduUpstream,
} = require('../../server/cadu-upstream-fetch.js');

const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address());
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe('Cadu upstream transport hardening', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('adds the scoped dispatcher while preserving the request and signal exactly once', async () => {
    const signal = new AbortController().signal;
    const expectedResponse = { ok: true, status: 200 };
    const body = JSON.stringify({ action: 'review', private: 'request-body-secret' });
    global.fetch = jest.fn().mockResolvedValue(expectedResponse);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await fetchCaduUpstream('https://cadu.example/api/publish', {
      method: 'POST',
      headers: { Authorization: 'Bearer server-secret' },
      body,
      redirect: 'error',
      signal,
    }, {
      operation: 'publish.review',
    });

    expect(response).toBe(expectedResponse);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [resource, options] = global.fetch.mock.calls[0];
    expect(resource).toBe('https://cadu.example/api/publish');
    expect(options).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer server-secret' },
      body,
      redirect: 'error',
    });
    expect(options.signal).toBe(signal);
    expect(options.dispatcher).toEqual(expect.objectContaining({
      dispatch: expect.any(Function),
    }));
    expect(consoleError).not.toHaveBeenCalled();
  });

  test('rethrows the same failure without retry and logs only bounded cause metadata', async () => {
    const nestedIpv6 = Object.assign(new Error('IPv6 address secret'), { code: 'ENETUNREACH' });
    const nestedIpv4 = Object.assign(new Error('IPv4 address secret'), { code: 'ETIMEDOUT' });
    const cause = Object.assign(new Error('token=upstream-secret'), {
      name: 'ConnectTimeoutError',
      code: 'UND_ERR_CONNECT_TIMEOUT',
      errors: [nestedIpv6, nestedIpv4],
    });
    const failure = new TypeError('fetch failed at https://private.example/?token=secret', { cause });
    const privateBody = JSON.stringify({ token: 'body-secret' });
    global.fetch = jest.fn().mockRejectedValue(failure);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(fetchCaduUpstream('https://private.example/?token=url-secret', {
      method: 'POST',
      headers: { Authorization: 'Bearer header-secret' },
      body: privateBody,
    }, {
      operation: 'feed.ask',
    })).rejects.toBe(failure);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledTimes(1);
    const logged = consoleError.mock.calls[0][0];
    const event = JSON.parse(logged);
    expect(event).toMatchObject({
      event: 'cadu_upstream_fetch_error',
      operation: 'feed.ask',
      method: 'POST',
      error_name: 'TypeError',
      error_code: 'none',
      cause_name: 'ConnectTimeoutError',
      cause_code: 'UND_ERR_CONNECT_TIMEOUT',
      cause_codes: ['UND_ERR_CONNECT_TIMEOUT', 'ENETUNREACH', 'ETIMEDOUT'],
    });
    expect(event.duration_ms).toEqual(expect.any(Number));
    expect(logged).not.toMatch(/private\.example|url-secret|header-secret|body-secret|upstream-secret|address secret/i);
  });

  test('races an IPv6-first lookup to IPv4 but sends one HTTP request', async () => {
    let requestCount = 0;
    let receivedBody = '';
    const server = http.createServer((req, res) => {
      requestCount += 1;
      req.setEncoding('utf8');
      req.on('data', (chunk) => { receivedBody += chunk; });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json', Connection: 'close' });
        res.end('{"ok":true}');
      });
    });
    const address = await listen(server);
    const lookup = jest.fn((_hostname, options, callback) => {
      expect(options.all).toBe(true);
      callback(null, [
        { address: '::1', family: 6 },
        { address: '127.0.0.1', family: 4 },
      ]);
    });
    const dispatcher = createCaduUpstreamDispatcher({ lookup });

    try {
      const response = await originalFetch(`http://cadu-upstream.test:${address.port}/publish`, {
        method: 'POST',
        body: '{"id":"stable-request"}',
        dispatcher,
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(lookup).toHaveBeenCalled();
      expect(requestCount).toBe(1);
      expect(receivedBody).toBe('{"id":"stable-request"}');
    } finally {
      await dispatcher.close();
      await close(server);
    }
  });

  test('routes all eight Cadu fetch sites through the helper with no global override', () => {
    const surfaces = new Map([
      ['api/cadu/health.js', { calls: 1, deadlines: ['AbortSignal.timeout(15000)'] }],
      ['api/cadu/feed.js', { calls: 1, deadlines: ['285000', '30000'] }],
      ['api/cadu/publish.js', { calls: 1, deadlines: ['AbortSignal.timeout(30000)'] }],
      ['api/cadu/sites.js', { calls: 1, deadlines: ['12000', '25000'] }],
      ['server/cadu-source-reviews-proxy.js', { calls: 1, deadlines: ['AbortSignal.timeout(12000)'] }],
      ['server/cadu-reviews-proxy.js', { calls: 1, deadlines: ['420000', '12000'] }],
      ['server/cadu-control-proxy.js', {
        calls: 2,
        deadlines: [
          'NON_STREAM_TIMEOUT_MS = 25_000',
          'AGENT_SEND_TIMEOUT_MS = 285_000',
          'SSE_TIMEOUT_MS = 285_000',
        ],
      }],
    ]);

    for (const [relativePath, contract] of surfaces) {
      const source = read(relativePath);
      expect(source).toContain('cadu-upstream-fetch.js');
      expect(source).not.toMatch(/\bfetch\s*\(/u);
      expect(source.match(/\bfetchCaduUpstream\s*\(/gu) || []).toHaveLength(contract.calls);
      for (const deadline of contract.deadlines) expect(source).toContain(deadline);
    }

    const helper = read('server/cadu-upstream-fetch.js');
    expect(helper.match(/globalThis\.fetch\s*\(/gu) || []).toHaveLength(1);
    expect(helper).toContain('autoSelectFamily: true');
    expect(helper).toContain('autoSelectFamilyAttemptTimeout: CADU_FAMILY_ATTEMPT_TIMEOUT_MS');
    expect(helper).not.toMatch(/setGlobalDispatcher|setDefaultResultOrder|setDefaultAutoSelectFamily/u);
  });
});

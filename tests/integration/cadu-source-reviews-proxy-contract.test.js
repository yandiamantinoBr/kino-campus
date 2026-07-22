'use strict';

jest.mock('../../server/cadu-auth.mjs', () => ({
  requireCaduAdmin: jest.fn(),
}));

const { createHash, createHmac } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { requireCaduAdmin } = require('../../server/cadu-auth.mjs');
const {
  buildCaduReviewSignatureHeaders,
  buildCaduSourceReviewTargetUrl,
  default: handler,
  parseSourceReviewListQuery,
  serializeSourceReviewResolution,
} = require('../../server/cadu-source-reviews-proxy.js');

const ROOT = path.join(__dirname, '..', '..');

const ADMIN_ID = '123e4567-e89b-42d3-a456-426614174002';
const REQUESTER_ID = '123e4567-e89b-42d3-a456-426614174001';
const REVIEW_ID = '123e4567-e89b-42d3-a456-426614174000';
const REVISION = 'b'.repeat(64);
const REVIEW_SIGNING_SECRET = 'review-signing-secret-fixture-0123456789abcdef';

function createResponse() {
  const headers = new Map();
  return {
    statusCode: null,
    body: undefined,
    ended: false,
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
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

function upstreamResponse(status, body, rawText) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: jest.fn(() => null) },
    text: jest.fn(async () => (
      rawText === undefined ? JSON.stringify(body) : rawText
    )),
  };
}

function streamedUpstreamResponse(status, chunks, headers = {}) {
  let cursor = 0;
  const cancel = jest.fn(async () => undefined);
  const normalizedHeaders = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]),
  );
  return {
    response: {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: jest.fn((name) => normalizedHeaders.get(String(name).toLowerCase()) || null) },
      body: {
        getReader: jest.fn(() => ({
          read: jest.fn(async () => (
            cursor < chunks.length ? { value: chunks[cursor++], done: false } : { done: true }
          )),
          cancel,
        })),
      },
      text: jest.fn(async () => { throw new Error('streaming response must not be buffered'); }),
    },
    cancel,
  };
}

function pendingReview() {
  return {
    id: REVIEW_ID,
    requested_by: REQUESTER_ID,
    source_id: 'web.ufg.fixture-review',
    source_revision: REVISION,
    state: 'pending',
    resolved_by: null,
    resolved_at: null,
  };
}

function reviewList(query, items = [pendingReview()], total = items.length) {
  return {
    items,
    total,
    limit: query.limit,
    offset: query.offset,
    has_more: query.offset + items.length < total,
    filters: {
      state: query.state,
      source_id: query.source_id,
      requested_by: query.requested_by,
      resolved_by: query.resolved_by,
    },
  };
}

describe('Cadu institutional source review queue proxy', () => {
  const originalFetch = global.fetch;
  const originalApiUrl = process.env.CADU_API_URL;
  const originalApiToken = process.env.CADU_API_TOKEN;
  const originalReviewSigningSecret = process.env.CADU_REVIEW_SIGNING_SECRET;

  beforeEach(() => {
    process.env.CADU_API_URL = 'https://cadu.example/';
    process.env.CADU_API_TOKEN = 'internal-cadu-token';
    process.env.CADU_REVIEW_SIGNING_SECRET = REVIEW_SIGNING_SECRET;
    global.fetch = jest.fn();
    requireCaduAdmin.mockReset();
    requireCaduAdmin.mockResolvedValue({ id: ADMIN_ID, email: 'admin@example.test' });
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalApiUrl === undefined) delete process.env.CADU_API_URL;
    else process.env.CADU_API_URL = originalApiUrl;
    if (originalApiToken === undefined) delete process.env.CADU_API_TOKEN;
    else process.env.CADU_API_TOKEN = originalApiToken;
    if (originalReviewSigningSecret === undefined) {
      delete process.env.CADU_REVIEW_SIGNING_SECRET;
    } else {
      process.env.CADU_REVIEW_SIGNING_SECRET = originalReviewSigningSecret;
    }
  });

  test('shares the existing sites function instead of exceeding the Vercel function cap', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    expect(config.rewrites).toContainEqual({
      source: '/api/cadu/source-reviews',
      destination: '/api/cadu/sites?path=source-reviews',
    });
    expect(fs.existsSync(path.join(ROOT, 'api', 'cadu', 'source-reviews.js'))).toBe(false);
    const sitesProxy = fs.readFileSync(path.join(ROOT, 'api', 'cadu', 'sites.js'), 'utf8');
    expect(sitesProxy).toContain("routerPath === 'source-reviews'");
    expect(sitesProxy).toContain('return handleCaduSourceReviews(req, res, { query: sourceReviewQuery });');
  });

  test('allowlists and canonicalizes only supported list filters', () => {
    expect(parseSourceReviewListQuery({})).toEqual({
      state: null,
      source_id: null,
      requested_by: null,
      resolved_by: null,
      limit: 25,
      offset: 0,
    });
    expect(parseSourceReviewListQuery({
      state: 'pending',
      source_id: 'web.ufg.fixture-review',
      requested_by: REQUESTER_ID,
      resolved_by: ADMIN_ID,
      limit: '50',
      offset: '100',
    })).toEqual({
      state: 'pending',
      source_id: 'web.ufg.fixture-review',
      requested_by: REQUESTER_ID,
      resolved_by: ADMIN_ID,
      limit: 50,
      offset: 100,
    });
    for (const invalid of [
      { unknown: 'value' },
      { state: 'published' },
      { state: ['pending', 'approved'] },
      { source_id: '../health' },
      { requested_by: 'not-a-uuid' },
      { limit: '01' },
      { limit: '101' },
      { offset: '-1' },
    ]) {
      expect(parseSourceReviewListQuery(invalid)).toBeNull();
    }
  });

  test('resolution body is strict and never accepts caller-selected resolved_by', () => {
    expect(serializeSourceReviewResolution({
      review_id: REVIEW_ID,
      expected_source_revision: REVISION,
      decision: 'approved',
      resolution_note: '  Revisão concluída.  ',
    })).toEqual({
      reviewId: REVIEW_ID,
      payload: {
        expected_source_revision: REVISION,
        decision: 'approved',
        resolution_note: 'Revisão concluída.',
      },
    });
    expect(serializeSourceReviewResolution({
      review_id: REVIEW_ID,
      expected_source_revision: REVISION,
      decision: 'approved',
      resolved_by: ADMIN_ID,
    })).toBeNull();
    expect(serializeSourceReviewResolution({
      review_id: REVIEW_ID,
      expected_source_revision: REVISION,
      decision: 'publish',
    })).toBeNull();
  });

  test('rebuilds upstream URLs from validated values only', () => {
    const query = parseSourceReviewListQuery({ state: 'pending', limit: '10' });
    expect(buildCaduSourceReviewTargetUrl(
      'https://cadu.example/', { kind: 'list', query },
    )).toBe('https://cadu.example/api/source-reviews?state=pending&limit=10&offset=0');
    expect(buildCaduSourceReviewTargetUrl(
      'https://cadu.example/', { kind: 'resolve', reviewId: REVIEW_ID },
    )).toBe(`https://cadu.example/api/source-reviews/${REVIEW_ID}/resolve`);
    expect(() => buildCaduSourceReviewTargetUrl(
      'file:///etc/passwd?secret=yes', { kind: 'list', query },
    )).toThrow('invalid Cadu API base URL');
    expect(() => buildCaduSourceReviewTargetUrl(
      'http://cadu.example/', { kind: 'list', query },
    )).toThrow('invalid Cadu API base URL');
  });

  test('builds a deterministic HMAC assertion bound to identity, request and bytes', () => {
    const targetUrl = `https://cadu.example/api/source-reviews/${REVIEW_ID}/resolve`;
    const body = '{"decision":"approved"}';
    const timestampSeconds = 1784700000;
    const nonce = 'abcdefghijklmnopqrstuvwxyzABCDEF';
    const headers = buildCaduReviewSignatureHeaders({
      signingSecret: REVIEW_SIGNING_SECRET,
      apiToken: 'internal-cadu-token',
      adminId: ADMIN_ID,
      method: 'POST',
      targetUrl,
      body,
      timestampSeconds,
      nonce,
    });
    const bodySha256 = createHash('sha256').update(Buffer.from(body, 'utf8')).digest('hex');
    const canonical = [
      'v1', String(timestampSeconds), nonce, ADMIN_ID, 'POST',
      `/api/source-reviews/${REVIEW_ID}/resolve`, bodySha256,
    ].join('\n');
    expect(headers).toEqual({
      'X-Kino-Admin-Id': ADMIN_ID,
      'X-Kino-Review-Signature-Version': 'v1',
      'X-Kino-Review-Timestamp': String(timestampSeconds),
      'X-Kino-Review-Nonce': nonce,
      'X-Kino-Review-Body-SHA256': bodySha256,
      'X-Kino-Review-Signature': createHmac('sha256', REVIEW_SIGNING_SECRET)
        .update(canonical, 'utf8').digest('hex'),
    });

    const changedInputs = [
      { body: '{"decision":"rejected"}' },
      { adminId: REQUESTER_ID },
      { targetUrl: `${targetUrl}?unexpected=1` },
      { timestampSeconds: timestampSeconds + 1 },
      { nonce: 'bcdefghijklmnopqrstuvwxyzABCDEFG' },
    ];
    for (const changed of changedInputs) {
      const changedHeaders = buildCaduReviewSignatureHeaders({
        signingSecret: REVIEW_SIGNING_SECRET,
        apiToken: 'internal-cadu-token',
        adminId: ADMIN_ID,
        method: 'POST',
        targetUrl,
        body,
        timestampSeconds,
        nonce,
        ...changed,
      });
      expect(changedHeaders['X-Kino-Review-Signature'])
        .not.toBe(headers['X-Kino-Review-Signature']);
    }
    expect(() => buildCaduReviewSignatureHeaders({
      signingSecret: REVIEW_SIGNING_SECRET,
      apiToken: 'internal-cadu-token',
      adminId: ADMIN_ID,
      method: 'GET',
      targetUrl,
      body,
      timestampSeconds,
      nonce,
    })).toThrow('invalid Cadu review signing configuration');
  });

  test('GET authenticates admin and forwards only canonical filters', async () => {
    const query = parseSourceReviewListQuery({ state: 'pending', limit: '1', offset: '0' });
    global.fetch.mockResolvedValue(upstreamResponse(200, reviewList(query, [pendingReview()], 2)));
    const req = {
      method: 'GET',
      headers: { authorization: 'Bearer browser-admin-jwt' },
      query: { state: 'pending', limit: '1', offset: '0' },
    };
    const res = createResponse();

    await handler(req, res);

    expect(requireCaduAdmin).toHaveBeenCalledWith(req, expect.any(Object));
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.has_more).toBe(true);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://cadu.example/api/source-reviews?state=pending&limit=1&offset=0');
    expect(options.method).toBe('GET');
    expect(options.headers.Authorization).toBe('Bearer internal-cadu-token');
    expect(options.headers['X-Kino-Admin-Id']).toBeUndefined();
    expect(options.cache).toBe('no-store');
    expect(options.redirect).toBe('error');
    expect(res.headers.has('access-control-allow-origin')).toBe(false);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  test('GET needs only the bearer service token, not the resolution signing secret', async () => {
    delete process.env.CADU_REVIEW_SIGNING_SECRET;
    const query = parseSourceReviewListQuery({});
    global.fetch.mockResolvedValue(upstreamResponse(200, reviewList(query)));
    const res = createResponse();

    await handler({ method: 'GET', headers: {}, query: {} }, res);

    expect(res.statusCode).toBe(200);
    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer internal-cadu-token');
    expect(options.headers['X-Kino-Review-Signature']).toBeUndefined();
  });

  test('POST derives resolved_by from the validated admin session', async () => {
    const resolution = {
      id: REVIEW_ID,
      source_id: 'web.ufg.fixture-review',
      source_revision: REVISION,
      state: 'approved',
      resolved_by: ADMIN_ID,
      resolved_at: '2026-07-22T12:10:00+00:00',
      replayed: false,
    };
    global.fetch.mockResolvedValue(upstreamResponse(200, resolution));
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer browser-admin-jwt' },
      query: {},
      body: {
        review_id: REVIEW_ID,
        expected_source_revision: REVISION,
        decision: 'approved',
        resolution_note: 'Conferida manualmente.',
      },
    };
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(resolution);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe(`https://cadu.example/api/source-reviews/${REVIEW_ID}/resolve`);
    expect(options.headers['X-Kino-Admin-Id']).toBe(ADMIN_ID);
    expect(options.headers['X-Kino-Review-Signature-Version']).toBe('v1');
    expect(options.headers['X-Kino-Review-Timestamp']).toMatch(/^[1-9][0-9]{9}$/);
    expect(options.headers['X-Kino-Review-Nonce']).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(options.headers['X-Kino-Review-Body-SHA256']).toBe(
      createHash('sha256').update(Buffer.from(options.body, 'utf8')).digest('hex'),
    );
    expect(options.headers['X-Kino-Review-Signature']).toMatch(/^[a-f0-9]{64}$/);
    expect(options.headers.Authorization).toBe('Bearer internal-cadu-token');
    expect(JSON.parse(options.body)).toEqual({
      expected_source_revision: REVISION,
      decision: 'approved',
      resolution_note: 'Conferida manualmente.',
    });
    expect(options.body).not.toContain('resolved_by');
    expect(options.body).not.toContain('browser-admin-jwt');
  });

  test('fails closed before upstream for non-admin, invalid identity, body or config', async () => {
    requireCaduAdmin.mockResolvedValueOnce(null);
    const nonAdmin = createResponse();
    await handler({ method: 'GET', query: {}, headers: {} }, nonAdmin);
    expect(global.fetch).not.toHaveBeenCalled();

    requireCaduAdmin.mockResolvedValueOnce({ id: 'admin-user' });
    const badIdentity = createResponse();
    await handler({ method: 'GET', query: {}, headers: {} }, badIdentity);
    expect(badIdentity.statusCode).toBe(502);
    expect(badIdentity.body).toEqual({ error: 'invalid_admin_identity' });

    const badBody = createResponse();
    await handler({
      method: 'POST', query: {}, headers: {}, body: { resolved_by: ADMIN_ID },
    }, badBody);
    expect(badBody.statusCode).toBe(422);

    delete process.env.CADU_API_TOKEN;
    const unconfigured = createResponse();
    await handler({ method: 'GET', query: {}, headers: {} }, unconfigured);
    expect(unconfigured.statusCode).toBe(503);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('POST fails closed for missing, malformed, reused or non-HTTPS signing configuration', async () => {
    const request = {
      method: 'POST',
      query: {},
      headers: {},
      body: {
        review_id: REVIEW_ID,
        expected_source_revision: REVISION,
        decision: 'approved',
      },
    };

    delete process.env.CADU_REVIEW_SIGNING_SECRET;
    const missing = createResponse();
    await handler(request, missing);
    expect(missing.statusCode).toBe(503);
    expect(missing.body).toEqual({ error: 'cadu_review_signing_not_configured' });
    expect(global.fetch).not.toHaveBeenCalled();

    process.env.CADU_REVIEW_SIGNING_SECRET = process.env.CADU_API_TOKEN;
    const reused = createResponse();
    await handler(request, reused);
    expect(reused.statusCode).toBe(503);
    expect(global.fetch).not.toHaveBeenCalled();

    for (const malformedSecret of [
      'too-short',
      `${'x'.repeat(16)}\t${'x'.repeat(16)}`,
      `${'x'.repeat(16)}\u0001${'x'.repeat(16)}`,
      'x'.repeat(1025),
    ]) {
      process.env.CADU_REVIEW_SIGNING_SECRET = malformedSecret;
      const malformed = createResponse();
      await handler(request, malformed);
      expect(malformed.statusCode).toBe(503);
      expect(malformed.body).toEqual({ error: 'cadu_review_signing_not_configured' });
      expect(global.fetch).not.toHaveBeenCalled();
    }

    process.env.CADU_REVIEW_SIGNING_SECRET = REVIEW_SIGNING_SECRET;
    process.env.CADU_API_URL = 'http://cadu.example/';
    const insecure = createResponse();
    await handler(request, insecure);
    expect(insecure.statusCode).toBe(503);
    expect(insecure.body).toEqual({ error: 'cadu_api_not_configured' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('auth transport errors cannot expose internal details', async () => {
    requireCaduAdmin.mockImplementationOnce(async (_req, authRes) => {
      authRes.status(502).json({
        error: 'admin_auth_unreachable',
        message: 'secret internal auth URL',
      });
      return null;
    });
    const res = createResponse();

    await handler({ method: 'GET', query: {}, headers: {} }, res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: 'admin_auth_unreachable' });
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('exposes only allowlisted upstream error codes with fixed public messages', async () => {
    global.fetch.mockResolvedValueOnce(upstreamResponse(409, {
      detail: '<script>secret-database-detail</script>',
    }));
    const conflict = createResponse();
    await handler({ method: 'GET', query: {}, headers: {} }, conflict);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.body).toEqual({ error: 'cadu_api_error' });

    global.fetch.mockResolvedValueOnce(upstreamResponse(409, {
      detail: {
        code: 'SOURCE_REVIEW_STALE',
        message: 'A fonte ou seus metadados mudaram desde a criação da revisão; marque-a como superada.',
      },
    }));
    const stale = createResponse();
    await handler({ method: 'GET', query: {}, headers: {} }, stale);
    expect(stale.statusCode).toBe(409);
    expect(stale.body).toEqual({
      error: 'cadu_api_error',
      code: 'SOURCE_REVIEW_STALE',
      detail: 'A fonte mudou desde a solicitação; atualize a fila e marque a revisão como substituída.',
    });

    global.fetch.mockResolvedValueOnce(upstreamResponse(409, {
      detail: { code: 'UNRECOGNIZED_INTERNAL_CODE', message: 'secret table and stack trace' },
      message: 'another internal detail',
    }));
    const unknown = createResponse();
    await handler({ method: 'GET', query: {}, headers: {} }, unknown);
    expect(unknown.statusCode).toBe(409);
    expect(unknown.body).toEqual({ error: 'cadu_api_error' });
    expect(JSON.stringify(unknown.body)).not.toMatch(/secret|stack|internal detail/i);

    global.fetch.mockResolvedValueOnce(upstreamResponse(404, {
      detail: 'institutional review not found',
    }));
    const missing = createResponse();
    await handler({ method: 'GET', query: {}, headers: {} }, missing);
    expect(missing.body).toEqual({
      error: 'cadu_api_error',
      code: 'SOURCE_REVIEW_NOT_FOUND',
      detail: 'A solicitação de revisão não foi encontrada.',
    });
  });

  test('rejects inconsistent successful bodies', async () => {
    global.fetch.mockResolvedValueOnce(upstreamResponse(200, {
      ...reviewList(parseSourceReviewListQuery({})),
      has_more: true,
    }));
    const invalid = createResponse();
    await handler({ method: 'GET', query: {}, headers: {} }, invalid);
    expect(invalid.statusCode).toBe(502);
    expect(invalid.body).toEqual({ error: 'invalid_cadu_api_response' });
  });

  test('rejects an excessive declared Content-Length before reading the body', async () => {
    const large = streamedUpstreamResponse(200, [], { 'Content-Length': '2000001' });
    global.fetch.mockResolvedValueOnce(large.response);
    const res = createResponse();

    await handler({ method: 'GET', query: {}, headers: {} }, res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: 'invalid_cadu_api_response' });
    expect(large.response.body.getReader).not.toHaveBeenCalled();
    expect(large.response.text).not.toHaveBeenCalled();
  });

  test('stops and cancels a chunked response as soon as its byte limit is exceeded', async () => {
    const large = streamedUpstreamResponse(200, [
      new Uint8Array(1_000_000),
      new Uint8Array(1_000_001),
    ]);
    global.fetch.mockResolvedValueOnce(large.response);
    const res = createResponse();

    await handler({ method: 'GET', query: {}, headers: {} }, res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: 'invalid_cadu_api_response' });
    expect(large.cancel).toHaveBeenCalledTimes(1);
    expect(large.response.text).not.toHaveBeenCalled();
  });

  test('OPTIONS and unsupported methods never authenticate or contact upstream', async () => {
    const options = createResponse();
    await handler({ method: 'OPTIONS' }, options);
    expect(options.statusCode).toBe(204);
    expect(options.ended).toBe(true);
    expect(options.headers.has('access-control-allow-origin')).toBe(false);
    expect(options.headers.get('x-content-type-options')).toBe('nosniff');

    const put = createResponse();
    await handler({ method: 'PUT' }, put);
    expect(put.statusCode).toBe(405);
    expect(put.headers.get('allow')).toBe('GET, POST, OPTIONS');
    expect(requireCaduAdmin).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

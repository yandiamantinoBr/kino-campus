'use strict';

jest.mock('../../server/cadu-auth.mjs', () => ({
  requireCaduAdmin: jest.fn(),
}));

const { requireCaduAdmin } = require('../../server/cadu-auth.mjs');
const {
  buildCaduSitesTargetUrl,
  classifyRegistryMirrorFailure,
  classifyCaduSitesPath,
  default: handler,
  isStrongCaduEtag,
  sanitizeCaduErrorDetail,
} = require('../../api/cadu/sites.js');

const ETAG = `"${'a'.repeat(64)}"`;
const NEXT_ETAG = `"${'b'.repeat(64)}"`;
const REGISTRY_SHA = 'c'.repeat(64);
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';

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

function request({ method = 'GET', path, headers = {}, body } = {}) {
  const query = {};
  if (path !== undefined) query.path = path;
  return { method, query, headers, body };
}

function upstreamResponse({
  status = 200,
  body = {},
  rawText,
  headers = {},
} = {}) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return normalizedHeaders[String(name).toLowerCase()] ?? null;
      },
    },
    text: jest.fn(async () => (
      rawText === undefined ? JSON.stringify(body) : rawText
    )),
  };
}

function registryResponse(options = {}) {
  return upstreamResponse({
    ...options,
    headers: {
      etag: ETAG,
      'x-cadu-registry-sha256': REGISTRY_SHA,
      ...(options.headers || {}),
    },
  });
}

describe('Cadu sites/source-registry v2 proxy contract', () => {
  const originalFetch = global.fetch;
  const originalApiUrl = process.env.CADU_API_URL;
  const originalApiToken = process.env.CADU_API_TOKEN;
  const originalReviewSigningSecret = process.env.CADU_REVIEW_SIGNING_SECRET;
  const originalLegacyMetaWriteEnabled = process.env.CADU_LEGACY_META_WRITE_ENABLED;

  beforeEach(() => {
    process.env.CADU_API_URL = 'https://cadu.example/';
    process.env.CADU_API_TOKEN = 'server-secret';
    process.env.CADU_REVIEW_SIGNING_SECRET = 'review-signing-secret-0123456789abcdef';
    delete process.env.CADU_LEGACY_META_WRITE_ENABLED;
    global.fetch = jest.fn();
    requireCaduAdmin.mockReset();
    requireCaduAdmin.mockResolvedValue({ id: ADMIN_ID });
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalApiUrl === undefined) delete process.env.CADU_API_URL;
    else process.env.CADU_API_URL = originalApiUrl;
    if (originalApiToken === undefined) delete process.env.CADU_API_TOKEN;
    else process.env.CADU_API_TOKEN = originalApiToken;
    if (originalReviewSigningSecret === undefined) delete process.env.CADU_REVIEW_SIGNING_SECRET;
    else process.env.CADU_REVIEW_SIGNING_SECRET = originalReviewSigningSecret;
    if (originalLegacyMetaWriteEnabled === undefined) delete process.env.CADU_LEGACY_META_WRITE_ENABLED;
    else process.env.CADU_LEGACY_META_WRITE_ENABLED = originalLegacyMetaWriteEnabled;
  });

  test('classifies only the compatibility and registry route shapes', () => {
    expect(classifyCaduSitesPath(undefined)).toEqual({
      kind: 'sites_list', registry: false, allowedMethods: ['GET'],
    });
    expect(classifyCaduSitesPath('PRPG/meta')).toMatchObject({
      kind: 'legacy_meta', unitId: 'PRPG', allowedMethods: ['GET', 'PATCH'],
    });
    expect(classifyCaduSitesPath('Pró-Reitoria de Pós-Graduação/meta')).toMatchObject({
      kind: 'legacy_meta', unitId: 'Pró-Reitoria de Pós-Graduação',
    });
    expect(classifyCaduSitesPath('source-registry')).toMatchObject({
      kind: 'registry_list', registry: true, allowedMethods: ['GET'],
    });
    expect(classifyCaduSitesPath('source-registry/readiness')).toMatchObject({
      kind: 'registry_readiness', registry: true, requiresStrongEtag: false, allowedMethods: ['GET'],
    });
    expect(classifyCaduSitesPath('source-registry/web.ufg.proad')).toMatchObject({
      kind: 'registry_detail', sourceId: 'web.ufg.proad', allowedMethods: ['GET'],
    });
    expect(classifyCaduSitesPath('source-registry/web.ufg.proad/override')).toMatchObject({
      kind: 'registry_override', sourceId: 'web.ufg.proad', allowedMethods: ['PATCH'],
    });
  });

  test.each([
    [['source-registry']],
    [['PRPG', 'meta']],
    [{}],
    ['../source-registry'],
    ['source-registry/../health'],
    ['source-registry/web.ufg.proad/override/extra'],
    ['/source-registry'],
    ['source-registry/'],
    ['a//meta'],
    ['%2e%2e%2fsource-registry'],
    ['%252e%252e%252fsource-registry'],
    ['source-registry%2f..%2fhealth'],
    ['source-registry%252f..%252fhealth'],
    ['..\\source-registry'],
    ['%5csource-registry'],
    ['%255csource-registry'],
    ['source-registry/web.ufg.PROAD'],
    ['source-registry/meta'],
    ['source-registry/web.ufg.proad?next=health'],
    ['%E0%A4%A'],
  ])('rejects arrays, traversal, encoded syntax and extra segments: %p', (path) => {
    expect(classifyCaduSitesPath(path)).toBeNull();
  });

  test('rebuilds every upstream URL from known encoded segments', () => {
    expect(buildCaduSitesTargetUrl(
      'https://cadu.example/', classifyCaduSitesPath(undefined),
    )).toBe('https://cadu.example/api/sites');
    expect(buildCaduSitesTargetUrl(
      'https://cadu.example/', classifyCaduSitesPath('PRPG/meta'),
    )).toBe('https://cadu.example/api/sites/PRPG/meta');
    expect(buildCaduSitesTargetUrl(
      'https://cadu.example/',
      classifyCaduSitesPath('Pró-Reitoria de Pós-Graduação/meta'),
    )).toBe('https://cadu.example/api/sites/Pr%C3%B3-Reitoria%20de%20P%C3%B3s-Gradua%C3%A7%C3%A3o/meta');
    expect(buildCaduSitesTargetUrl(
      'https://cadu.example/', classifyCaduSitesPath('source-registry'),
    )).toBe('https://cadu.example/api/source-registry');
    expect(buildCaduSitesTargetUrl(
      'https://cadu.example/', classifyCaduSitesPath('source-registry/readiness'),
    )).toBe('https://cadu.example/api/source-registry/readiness');
    expect(buildCaduSitesTargetUrl(
      'https://cadu.example/', classifyCaduSitesPath('source-registry/web.ufg.proad'),
    )).toBe('https://cadu.example/api/source-registry/web.ufg.proad');
    expect(buildCaduSitesTargetUrl(
      'https://cadu.example/',
      classifyCaduSitesPath('source-registry/web.ufg.proad/override'),
    )).toBe('https://cadu.example/api/source-registry/web.ufg.proad/override');
  });

  test('target builder revalidates identifiers instead of trusting a forged route object', () => {
    expect(() => buildCaduSitesTargetUrl('https://cadu.example/', {
      kind: 'legacy_meta', unitId: '../health',
    })).toThrow('invalid legacy unit ID');
    expect(() => buildCaduSitesTargetUrl('https://cadu.example/', {
      kind: 'registry_detail', sourceId: '../health',
    })).toThrow('invalid stable source ID');
  });

  test('returns a CORS preflight that allows and exposes CAS headers', async () => {
    const req = request({ method: 'OPTIONS', path: 'source-registry' });
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(res.headers.get('access-control-allow-headers')).toBe(
      'Authorization, Content-Type, If-Match',
    );
    expect(res.headers.get('access-control-expose-headers')).toBe(
      'ETag, X-Cadu-Canonical-ETag, X-Cadu-Registry-Sha256, X-Cadu-Registry-Origin, X-Cadu-Registry-Audit-Cutoff, X-Cadu-Upstream-Status',
    );
    expect(requireCaduAdmin).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('does not let OPTIONS bypass strict path validation', async () => {
    const res = createResponse();
    await handler(request({ method: 'OPTIONS', path: '%252e%252e%252fhealth' }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_cadu_sites_path' });
    expect(res.ended).toBe(false);
    expect(requireCaduAdmin).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test.each([
    ['POST', undefined, 'GET, PATCH, OPTIONS', 'method_not_allowed'],
    ['PATCH', 'source-registry', 'GET, OPTIONS', 'method_not_allowed_for_cadu_sites_path'],
    ['GET', 'source-registry/web.ufg.proad/override', 'PATCH, OPTIONS', 'method_not_allowed_for_cadu_sites_path'],
  ])('rejects invalid method %s for %p before auth/upstream', async (
    method, path, allow, error,
  ) => {
    const res = createResponse();
    await handler(request({ method, path }), res);

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error });
    expect(res.headers.get('allow')).toBe(allow);
    expect(requireCaduAdmin).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test.each([
    [['source-registry']],
    ['../source-registry'],
    ['source-registry/web.ufg.proad/extra'],
    ['%252e%252e%252fhealth'],
    ['..\\health'],
  ])('rejects invalid request path without invoking auth or fetch: %p', async (path) => {
    const res = createResponse();
    await handler(request({ path }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_cadu_sites_path' });
    expect(requireCaduAdmin).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('removes raw exception messages emitted by the shared auth helper', async () => {
    requireCaduAdmin.mockImplementationOnce(async (_req, authRes) => {
      authRes.status(502).json({
        error: 'admin_auth_unreachable',
        message: '<html>connect ECONNREFUSED token=secret</html>',
      });
      return null;
    });
    const res = createResponse();

    await handler(request({ path: 'source-registry' }), res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: 'admin_auth_unreachable' });
    expect(JSON.stringify(res.body)).not.toMatch(/html|ECONNREFUSED|secret/i);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('preserves GET root compatibility without forwarding the admin JWT', async () => {
    global.fetch.mockResolvedValue(upstreamResponse({ body: [{ name: 'PRPG' }] }));
    const res = createResponse();

    await handler(request({ headers: { authorization: 'Bearer browser-jwt' } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ name: 'PRPG' }]);
    expect(res.headers.get('cache-control')).toBe('private, max-age=300');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://cadu.example/api/sites');
    expect(options.method).toBe('GET');
    expect(options.headers.Authorization).toBe('Bearer server-secret');
    expect(options.headers.Authorization).not.toContain('browser-jwt');
    expect(options.headers['If-Match']).toBeUndefined();
    expect(options.body).toBeUndefined();
    expect(options.redirect).toBe('error');
  });

  test('keeps legacy GET but requires an explicit compatibility flag for legacy PATCH', async () => {
    global.fetch
      .mockResolvedValueOnce(upstreamResponse({ body: { unit_id: 'PRPG', tier: 2 } }))
      .mockResolvedValueOnce(upstreamResponse({ body: { unit_id: 'PRPG', tier: 1 } }));

    const getRes = createResponse();
    await handler(request({ path: 'PRPG/meta' }), getRes);
    expect(global.fetch.mock.calls[0][0]).toBe('https://cadu.example/api/sites/PRPG/meta');
    expect(global.fetch.mock.calls[0][1].method).toBe('GET');

    const patchRes = createResponse();
    await handler(request({
      method: 'PATCH',
      path: 'PRPG/meta',
      headers: { 'if-match': ETAG },
      body: { tier: 1, note: 'linha 1\nlinha 2' },
    }), patchRes);
    expect(patchRes.statusCode).toBe(405);
    expect(patchRes.body).toEqual({ error: 'legacy_cadu_meta_writes_disabled' });
    expect(patchRes.headers.get('allow')).toBe('GET, OPTIONS');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    process.env.CADU_LEGACY_META_WRITE_ENABLED = '1';
    const compatibilityRes = createResponse();
    await handler(request({
      method: 'PATCH',
      path: 'PRPG/meta',
      headers: { 'if-match': ETAG },
      body: { tier: 1, note: 'linha 1\nlinha 2' },
    }), compatibilityRes);
    const [, patchOptions] = global.fetch.mock.calls[1];
    expect(patchOptions.method).toBe('PATCH');
    expect(patchOptions.headers['If-Match']).toBeUndefined();
    expect(JSON.parse(patchOptions.body)).toEqual({ tier: 1, note: 'linha 1\nlinha 2' });
    expect(compatibilityRes.headers.get('cache-control')).toBe('private, no-store');
  });

  test('classifies mirror failures without logging paths, artifact bytes or secrets', () => {
    const missing = new Error('ENOENT at C:\\private\\token=secret\\upstream-manifest.json');
    missing.code = 'ENOENT';
    expect(classifyRegistryMirrorFailure(missing)).toEqual({
      reason: 'missing_artifact', errorName: 'Error', errorCode: 'ENOENT',
    });
    expect(JSON.stringify(classifyRegistryMirrorFailure(missing)))
      .not.toMatch(/private|token|manifest\.json/);

    expect(classifyRegistryMirrorFailure(new SyntaxError('{secret-json'))).toEqual({
      reason: 'invalid_json', errorName: 'SyntaxError', errorCode: null,
    });
  });

  test.each([
    ['source-registry', 'https://cadu.example/api/source-registry'],
    [
      'source-registry/web.ufg.proad',
      'https://cadu.example/api/source-registry/web.ufg.proad',
    ],
  ])('forwards v2 GET %s with immutable identity headers and no cache', async (path, url) => {
    global.fetch.mockResolvedValue(registryResponse({ body: { registryVersion: '2026-07-13.3' } }));
    const res = createResponse();

    await handler(request({ path }), res);

    expect(res.statusCode).toBe(200);
    expect(global.fetch.mock.calls[0][0]).toBe(url);
    expect(res.headers.get('etag')).toBe(ETAG);
    expect(res.headers.get('x-cadu-canonical-etag')).toBe(ETAG);
    expect(res.headers.get('x-cadu-registry-sha256')).toBe(REGISTRY_SHA);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  test('serves the bundled canonical mirror read-only when the upstream registry route is missing', async () => {
    global.fetch.mockResolvedValue(upstreamResponse({
      status: 404,
      body: { detail: 'not found' },
    }));
    const res = createResponse();

    await handler(request({ path: 'source-registry' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      registryVersion: '2026-07-15.10',
      activation: { state: 'candidate', runtimeConsumers: [] },
      administrativeMetadata: {
        available: false,
        state: 'unavailable',
        reason: 'mirror_excludes_runtime_overrides',
      },
    });
    expect(res.body.sources.length).toBeGreaterThan(150);
    expect(res.body.entities.length).toBeGreaterThan(150);
    expect(res.body.instagramProfiles.length).toBeGreaterThan(50);
    expect(res.headers.get('etag')).toMatch(/^"[a-f0-9]{64}"$/);
    expect(res.headers.get('x-cadu-canonical-etag')).toBe(res.headers.get('etag'));
    expect(res.headers.get('x-cadu-registry-sha256')).toMatch(/^[a-f0-9]{64}$/);
    expect(res.headers.get('x-cadu-registry-origin')).toBe('kino-campus-mirror');
    expect(res.headers.get('x-cadu-registry-audit-cutoff')).toBe('2026-07-15');
    expect(res.headers.get('x-cadu-upstream-status')).toBe('404');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(global.fetch.mock.calls[0][1].cache).toBe('no-store');
  });

  test('keeps the read-only map available when registry configuration is absent', async () => {
    delete process.env.CADU_API_TOKEN;
    const res = createResponse();

    await handler(request({ path: 'source-registry' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.headers.get('x-cadu-registry-origin')).toBe('kino-campus-mirror');
    expect(res.headers.get('x-cadu-upstream-status')).toBe('503');
    expect(res.body.activation).toEqual({ state: 'candidate', runtimeConsumers: [] });
    expect(res.body.administrativeMetadata.available).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('keeps the read-only map available when the registry upstream is unreachable', async () => {
    global.fetch.mockRejectedValue(new Error('connect ECONNREFUSED secret=must-not-leak'));
    const res = createResponse();

    await handler(request({ path: 'source-registry' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.headers.get('x-cadu-registry-origin')).toBe('kino-campus-mirror');
    expect(res.headers.get('x-cadu-upstream-status')).toBe('502');
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|must-not-leak/);
  });

  test('never uses the mirror for readiness or mutations', async () => {
    global.fetch.mockResolvedValue(upstreamResponse({ status: 404 }));
    const readiness = createResponse();
    await handler(request({ path: 'source-registry/readiness' }), readiness);
    expect(readiness.statusCode).toBe(404);
    expect(readiness.body).toEqual({ error: 'cadu_api_error', status: 404 });

    const mutation = createResponse();
    await handler(request({
      method: 'PATCH',
      path: 'source-registry/web.ufg.proad/override',
      headers: { 'if-match': ETAG },
      body: { tier: 1, note: null },
    }), mutation);
    expect(mutation.statusCode).toBe(404);
    expect(mutation.body).toEqual({ error: 'cadu_api_error', status: 404 });
  });

  test('forwards readiness with registry hash but without inventing an ETag', async () => {
    global.fetch.mockResolvedValue(upstreamResponse({
      body: { ready: true },
      headers: { 'x-cadu-registry-sha256': REGISTRY_SHA },
    }));
    const res = createResponse();

    await handler(request({ path: 'source-registry/readiness' }), res);

    expect(res.statusCode).toBe(200);
    expect(global.fetch.mock.calls[0][0]).toBe('https://cadu.example/api/source-registry/readiness');
    const readinessHeaders = global.fetch.mock.calls[0][1].headers;
    expect(readinessHeaders['X-Kino-Review-Capability']).toBe('v1');
    expect(readinessHeaders['X-Kino-Admin-Id']).toBe(ADMIN_ID);
    expect(readinessHeaders['X-Kino-Review-Body-SHA256']).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(readinessHeaders['X-Kino-Review-Signature']).toMatch(/^[a-f0-9]{64}$/);
    expect(res.headers.get('x-cadu-registry-sha256')).toBe(REGISTRY_SHA);
    expect(res.headers.get('etag')).toBeUndefined();
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  test('fails readiness closed before upstream when the review HMAC is absent', async () => {
    delete process.env.CADU_REVIEW_SIGNING_SECRET;
    const res = createResponse();

    await handler(request({ path: 'source-registry/readiness' }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'cadu_review_signing_not_configured' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('fails closed when readiness omits the registry hash', async () => {
    global.fetch.mockResolvedValue(upstreamResponse({ body: { ready: true } }));
    const res = createResponse();

    await handler(request({ path: 'source-registry/readiness' }), res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: 'invalid_cadu_registry_headers' });
  });

  test.each([
    [undefined, 428, 'if_match_required'],
    ['W/' + ETAG, 400, 'invalid_if_match'],
    ['*', 400, 'invalid_if_match'],
    [`${ETAG}, ${NEXT_ETAG}`, 400, 'invalid_if_match'],
    [['a', 'b'], 428, 'if_match_required'],
  ])('rejects absent or non-strong If-Match %p without calling upstream', async (
    ifMatch, status, error,
  ) => {
    const headers = {};
    if (ifMatch !== undefined) headers['if-match'] = ifMatch;
    const res = createResponse();
    await handler(request({
      method: 'PATCH',
      path: 'source-registry/web.ufg.proad/override',
      headers,
      body: { tier: 1, note: null },
    }), res);

    expect(res.statusCode).toBe(status);
    expect(res.body).toEqual({ error });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test.each([
    [[]],
    [[{ tier: 1 }]],
    [{ extra: true }],
    [{ tier: Number.NaN }],
    [{ note: 'unsafe\u0001control' }],
    [{}],
  ])('rejects invalid PATCH body without semantic coercion: %p', async (body) => {
    const res = createResponse();
    await handler(request({
      method: 'PATCH',
      path: 'source-registry/web.ufg.proad/override',
      headers: { 'if-match': ETAG },
      body,
    }), res);

    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({ error: 'invalid_cadu_patch_body' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('forwards one exact strong If-Match and returns the replacement ETag', async () => {
    global.fetch.mockResolvedValue(registryResponse({
      body: { id: 'web.ufg.proad', effectiveTier: 1 },
      headers: { etag: NEXT_ETAG },
    }));
    const res = createResponse();

    await handler(request({
      method: 'PATCH',
      path: 'source-registry/web.ufg.proad/override',
      headers: { 'if-match': `  ${ETAG}  ` },
      body: { tier: 1, note: 'linha 1\nlinha 2' },
    }), res);

    expect(res.statusCode).toBe(200);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://cadu.example/api/source-registry/web.ufg.proad/override');
    expect(options.headers['If-Match']).toBe(ETAG);
    expect(JSON.parse(options.body)).toEqual({ tier: 1, note: 'linha 1\nlinha 2' });
    expect(res.headers.get('etag')).toBe(NEXT_ETAG);
    expect(res.headers.get('x-cadu-canonical-etag')).toBe(NEXT_ETAG);
    expect(res.headers.get('x-cadu-registry-sha256')).toBe(REGISTRY_SHA);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  test('preserves upstream precondition status and only a sanitized detail', async () => {
    global.fetch.mockResolvedValue(upstreamResponse({
      status: 412,
      body: {
        detail: 'override changed; reload and retry',
        raw: '<html>secret</html>',
        exception: 'service role key',
      },
    }));
    const res = createResponse();

    await handler(request({
      method: 'PATCH',
      path: 'source-registry/web.ufg.proad/override',
      headers: { 'if-match': ETAG },
      body: { tier: 1, note: null },
    }), res);

    expect(res.statusCode).toBe(412);
    expect(res.body).toEqual({
      error: 'cadu_api_error',
      status: 412,
      detail: 'override changed; reload and retry',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/html|exception|service role/i);
  });

  test('reduces structured 422 validation detail to bounded safe text', () => {
    expect(sanitizeCaduErrorDetail({
      detail: [
        { loc: ['body', 'tier'], msg: 'Input should be 1, 2 or 3', type: 'less_than' },
        { loc: ['body', 'note'], msg: '<script>secret</script>', type: 'string_type' },
      ],
    })).toBe('body.tier: Input should be 1, 2 or 3');
  });

  test.each([
    ['<html><body>upstream stack</body></html>'],
    ['not-json secret upstream response'],
  ])('never returns raw non-JSON upstream errors: %s', async (rawText) => {
    global.fetch.mockResolvedValue(upstreamResponse({ status: 500, rawText }));
    const res = createResponse();
    await handler(request(), res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'cadu_api_error', status: 500 });
    expect(JSON.stringify(res.body)).not.toContain(rawText);
  });

  test('does not return upstream HTML hidden in a JSON error detail', async () => {
    global.fetch.mockResolvedValue(upstreamResponse({
      status: 409,
      body: { detail: '<strong>database conflict</strong>' },
    }));
    const res = createResponse();
    await handler(request({ path: 'PRPG/meta' }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'cadu_api_error', status: 409 });
  });

  test('returns generic errors for network exceptions and invalid success JSON', async () => {
    global.fetch.mockRejectedValueOnce(new Error('<html>token=secret</html>'));
    const unreachable = createResponse();
    await handler(request(), unreachable);
    expect(unreachable.statusCode).toBe(502);
    expect(unreachable.body).toEqual({ error: 'cadu_api_unreachable' });

    global.fetch.mockResolvedValueOnce(upstreamResponse({ status: 200, rawText: '<html>ok</html>' }));
    const invalid = createResponse();
    await handler(request(), invalid);
    expect(invalid.statusCode).toBe(502);
    expect(invalid.body).toEqual({ error: 'invalid_cadu_api_response' });
  });

  test('fails closed when a successful v2 response omits strong identity headers', async () => {
    global.fetch.mockResolvedValue(upstreamResponse({
      status: 200,
      body: { registryVersion: '2026-07-13.3' },
      headers: { etag: 'W/' + ETAG },
    }));
    const res = createResponse();
    await handler(request({ path: 'source-registry' }), res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: 'invalid_cadu_registry_headers' });
    expect(res.headers.get('etag')).toBeUndefined();
    expect(res.headers.get('x-cadu-canonical-etag')).toBeUndefined();
    expect(res.headers.get('x-cadu-registry-sha256')).toBeUndefined();
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  test('rejects malformed API base URLs without returning parser exceptions', async () => {
    process.env.CADU_API_URL = 'file:///etc/passwd?secret=yes';
    const res = createResponse();
    await handler(request(), res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'cadu_api_not_configured' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('recognizes only the strong SHA-256 ETag format used by Cadu', () => {
    expect(isStrongCaduEtag(ETAG)).toBe(true);
    expect(isStrongCaduEtag('W/' + ETAG)).toBe(false);
    expect(isStrongCaduEtag('"short"')).toBe(false);
    expect(isStrongCaduEtag('*')).toBe(false);
  });
});

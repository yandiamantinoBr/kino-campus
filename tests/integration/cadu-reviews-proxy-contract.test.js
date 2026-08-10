'use strict';

jest.mock('../../server/cadu-auth.mjs', () => ({
  requireCaduAdmin: jest.fn(),
}));

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { requireCaduAdmin } = require('../../server/cadu-auth.mjs');
const {
  buildCentralReviewTargetUrl,
  default: handler,
  parseCentralReviewAuditQuery,
  parseCentralReviewListQuery,
  serializeCentralReviewRepass,
  serializeCentralReviewResolution,
} = require('../../server/cadu-reviews-proxy.js');

const ROOT = path.join(__dirname, '..', '..');
const ADMIN_ID = '123e4567-e89b-42d3-a456-426614174002';
const REVIEW_ID = '123e4567-e89b-52d3-a456-426614174000';
const RESOLUTION_ID = '123e4567-e89b-42d3-a456-426614174003';
const RUN_ID = '123e4567-e89b-42d3-a456-426614174004';
const ITEM_VERSION = 'b'.repeat(64);
const PRIOR_ITEM_VERSION = 'c'.repeat(64);
const REVIEW_KEY = 'd'.repeat(64);
const SOURCE_REVISION = 'e'.repeat(64);
const LINKED_REVIEW_ID = '123e4567-e89b-52d3-a456-426614174005';
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

function upstreamResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: jest.fn(() => null) },
    text: jest.fn(async () => JSON.stringify(body)),
  };
}

function pendingItem() {
  return {
    id: REVIEW_ID,
    item_version: ITEM_VERSION,
    origin: 'pipeline',
    kind: 'pipeline_quality',
    title: 'Evento para revisão',
    summary: 'Evidência editorial.',
    source_url: 'https://ufg.br/e/123',
    action_url: null,
    image_url: null,
    run_id: RUN_ID,
    artifact: `_publish_skipped_quality_2026-07-28--${RUN_ID}.json`,
    created_at: 1785200000,
    issues: ['application_deadline_mismatch'],
    allowed_decisions: ['approved', 'changes_requested', 'deferred', 'rejected'],
    metadata: { decision_effect: 'editorial_record_only' },
    state: 'pending',
    resolution: null,
    repass: null,
  };
}

function validItemRepass() {
  return {
    run_id: RUN_ID,
    item_version: ITEM_VERSION,
    origin: 'pipeline',
    kind: 'pipeline_quality',
    created_at: 1785200050,
    score: 0.84,
    previous_score: null,
    delta: null,
    decision_hint: 'review',
    reasons: ['Prazo ainda exige conferência humana.'],
    evidence: { classifier: 'fixture' },
  };
}

function v2PendingItem() {
  const item = pendingItem();
  item.review_identity_version = 'cadu-review-identity-v2';
  item.review_key = REVIEW_KEY;
  item.occurrence_count = 3;
  item.first_seen_at = 1785190000;
  item.last_seen_at = 1785200000;
  item.metadata = {
    decision_effect: 'editorial_record_only',
    score: null,
    identity_scope: 'record',
    carry_policy: 'stable_record',
    review_cluster: {
      occurrence_count: 3,
      version_count: 2,
      item_versions: [ITEM_VERSION, PRIOR_ITEM_VERSION],
      first_seen_at: 1785190000,
      last_seen_at: 1785200000,
      run_ids: [RUN_ID],
      artifacts: [item.artifact],
      provenance_truncated: false,
    },
    review_links: {
      evidence_count: 2,
      item_ids: [REVIEW_ID, LINKED_REVIEW_ID],
      origins: ['pipeline', 'feed'],
      kinds: ['pipeline_quality', 'feed_item'],
      decision_policy: 'independent_version_bound',
    },
  };
  return item;
}

function providers() {
  return [
    { id: 'pipeline', label: 'Pipeline', description: 'Quality gate.', queue: 'central', pending: 1, resolved: 0 },
    { id: 'feed', label: 'Feed Coletado', description: 'Curador.', queue: 'central', pending: 0, resolved: 0 },
    { id: 'sites', label: 'Mapa UFG', description: 'CAS.', queue: 'institutional', pending: 0, resolved: 0 },
    { id: 'openclaw', label: 'OpenClaw', description: 'Incidentes.', queue: 'central', pending: 0, resolved: 0 },
  ];
}

function listResponse(query) {
  return {
    schema_version: 1,
    contract_version: 'cadu-review-center-v1',
    items: [pendingItem()],
    total: 1,
    limit: query.limit,
    offset: query.offset,
    has_more: false,
    providers: providers(),
    diagnostics: { pipeline: { artifacts_loaded: 1 } },
    generated_at: 1785200100,
  };
}

function v2ListResponse(query) {
  return {
    schema_version: 2,
    contract_version: 'cadu-review-center-v2',
    items: [v2PendingItem()],
    total: 1,
    limit: query.limit,
    offset: query.offset,
    has_more: false,
    providers: providers(),
    diagnostics: {
      pipeline: { artifacts_loaded: 1 },
      feed: { reviewable_items: 1 },
      projection: {
        raw_items: 3,
        unique_items: 2,
        collapsed_occurrences: 1,
        linked_evidence_groups: 1,
        linked_evidence_items: 2,
        identity_version: 'cadu-review-identity-v2',
        legacy_resolution_policy: 'audit_only_no_automatic_carry',
      },
    },
    generated_at: 1785200100,
  };
}

function auditResponse(query) {
  return {
    schema_version: 1,
    contract_version: 'cadu-review-center-v1',
    items: [{
      id: RESOLUTION_ID,
      item_id: REVIEW_ID,
      item_version: ITEM_VERSION,
      origin: 'pipeline',
      kind: 'pipeline_quality',
      decision: 'approved',
      resolution_note: 'Conferido.',
      resolved_by: ADMIN_ID,
      resolved_at: 1785200200,
      title: 'Evento para revisão',
      run_id: RUN_ID,
      source_url: 'https://ufg.br/e/123',
    }],
    total: 1,
    limit: query.limit,
    offset: query.offset,
    has_more: false,
    generated_at: 1785200300,
  };
}

function v2AuditResponse(query, legacy = false) {
  const response = auditResponse(query);
  response.schema_version = 2;
  response.contract_version = 'cadu-review-center-v2';
  response.items[0].review_identity_version = legacy
    ? 'legacy-v1'
    : 'cadu-review-identity-v2';
  response.items[0].review_key = legacy ? null : REVIEW_KEY;
  return response;
}

function repassResponse() {
  return {
    run_id: RUN_ID,
    evaluated: 2,
    entries: 2,
    errors: 0,
    with_previous_score: 2,
    increased: 1,
    decreased: 1,
    stable: 0,
    publish_ready: 1,
    review: 0,
    rejected: 1,
    started_at: 1785200500,
    finished_at: 1785200600,
    trigger: 'manual',
    requested_by: ADMIN_ID,
    diagnostics: { pipeline: { artifacts_loaded: 1 } },
  };
}

describe('Cadu central review proxy', () => {
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
    if (originalReviewSigningSecret === undefined) delete process.env.CADU_REVIEW_SIGNING_SECRET;
    else process.env.CADU_REVIEW_SIGNING_SECRET = originalReviewSigningSecret;
  });

  test('shares the sites serverless function and preserves public review routes', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    expect(config.rewrites).toContainEqual({
      source: '/api/cadu/reviews',
      destination: '/api/cadu/sites?path=reviews',
    });
    expect(config.rewrites).toContainEqual({
      source: '/api/cadu/reviews/(.+)',
      destination: '/api/cadu/sites?path=reviews/$1',
    });
    expect(fs.existsSync(path.join(ROOT, 'api', 'cadu', 'reviews.js'))).toBe(false);
    const sitesProxy = fs.readFileSync(path.join(ROOT, 'api', 'cadu', 'sites.js'), 'utf8');
    expect(sitesProxy).toContain("routerPath === 'reviews' || routerPath.startsWith('reviews/')");
    expect(sitesProxy).toContain('return handleCaduReviews(req, res, {');
  });

  test('canonicalizes only the supported list and audit filters', () => {
    expect(parseCentralReviewListQuery({
      origin: 'pipeline',
      state: 'pending',
      search: '  evento UFG  ',
      limit: '25',
      offset: '0',
    })).toEqual({
      origin: 'pipeline',
      state: 'pending',
      search: 'evento UFG',
      limit: 25,
      offset: 0,
    });
    expect(parseCentralReviewAuditQuery({
      origin: 'feed',
      decision: 'rejected',
      limit: '200',
      offset: '10',
    })).toEqual({
      origin: 'feed',
      decision: 'rejected',
      limit: 200,
      offset: 10,
    });
    for (const invalid of [
      { origin: 'telegram' },
      { state: 'published' },
      { search: ['evento'] },
      { search: 'x'.repeat(101) },
      { limit: '01' },
      { offset: '-1' },
      { unexpected: 'value' },
    ]) {
      expect(parseCentralReviewListQuery(invalid)).toBeNull();
    }
  });

  test('binds a strict resolution to the path and item version', () => {
    expect(serializeCentralReviewResolution({
      review_id: REVIEW_ID,
      expected_item_version: ITEM_VERSION,
      decision: 'changes_requested',
      resolution_note: '  Corrigir o prazo.  ',
    }, REVIEW_ID)).toEqual({
      reviewId: REVIEW_ID,
      payload: {
        expected_item_version: ITEM_VERSION,
        decision: 'changes_requested',
        resolution_note: 'Corrigir o prazo.',
      },
    });
    expect(serializeCentralReviewResolution({
      review_id: RUN_ID,
      expected_item_version: ITEM_VERSION,
      decision: 'approved',
    }, REVIEW_ID)).toBeNull();
    expect(serializeCentralReviewResolution({
      review_id: REVIEW_ID,
      expected_item_version: ITEM_VERSION,
      decision: 'publish',
    }, REVIEW_ID)).toBeNull();
    expect(serializeCentralReviewResolution({
      review_id: REVIEW_ID,
      expected_item_version: ITEM_VERSION,
      decision: 'rejected',
    }, REVIEW_ID)).toBeNull();
  });

  test('serializes a strict repass trigger', () => {
    expect(serializeCentralReviewRepass({
      intent: 'repass',
      run_id: RUN_ID,
    })).toEqual({ intent: 'repass', run_id: RUN_ID });
    expect(serializeCentralReviewRepass({})).toEqual({
      intent: 'repass',
      run_id: null,
    });
    expect(serializeCentralReviewRepass({
      intent: 'publish',
      run_id: RUN_ID,
    })).toBeNull();
    expect(serializeCentralReviewRepass({
      intent: 'repass',
      run_id: 'not-a-uuid',
    })).toBeNull();
    expect(serializeCentralReviewRepass({
      intent: 'repass',
      unexpected: true,
    })).toBeNull();
  });

  test('rebuilds upstream URLs from validated values only', () => {
    const list = parseCentralReviewListQuery({ origin: 'pipeline', state: 'pending' });
    const audit = parseCentralReviewAuditQuery({ decision: 'approved' });
    expect(buildCentralReviewTargetUrl(
      'https://cadu.example/', { kind: 'list', query: list },
    )).toBe('https://cadu.example/api/reviews?origin=pipeline&state=pending&limit=25&offset=0');
    expect(buildCentralReviewTargetUrl(
      'https://cadu.example/', { kind: 'audit', query: audit },
    )).toBe('https://cadu.example/api/reviews/audit?decision=approved&limit=50&offset=0');
    expect(buildCentralReviewTargetUrl(
      'https://cadu.example/', { kind: 'resolve', reviewId: REVIEW_ID },
    )).toBe(`https://cadu.example/api/reviews/${REVIEW_ID}/resolve`);
    expect(buildCentralReviewTargetUrl(
      'https://cadu.example/', { kind: 'repass' },
    )).toBe('https://cadu.example/api/reviews/repass');
    expect(() => buildCentralReviewTargetUrl(
      'http://cadu.example/', { kind: 'list', query: list },
    )).toThrow('invalid Cadu API base URL');
  });

  test('GET validates admin, canonical query and the upstream contract', async () => {
    const query = parseCentralReviewListQuery({ origin: 'pipeline', state: 'pending' });
    global.fetch.mockResolvedValue(upstreamResponse(200, listResponse(query)));
    const req = {
      method: 'GET',
      headers: { authorization: 'Bearer browser-admin-jwt' },
      query: {},
    };
    const res = createResponse();

    await handler(req, res, {
      path: 'reviews',
      query: { origin: 'pipeline', state: 'pending' },
    });

    expect(requireCaduAdmin).toHaveBeenCalledWith(req, expect.any(Object));
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.has('access-control-allow-origin')).toBe(false);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://cadu.example/api/reviews?origin=pipeline&state=pending&limit=25&offset=0');
    expect(options.headers.Authorization).toBe('Bearer internal-cadu-token');
    expect(options.headers['X-Kino-Admin-Id']).toBeUndefined();
    expect(options.cache).toBe('no-store');
    expect(options.redirect).toBe('error');
  });

  test('dual-decodes v1 and v2 while validating v2 identity and provenance fail-closed', async () => {
    const query = parseCentralReviewListQuery({ origin: 'pipeline', state: 'pending' });
    global.fetch.mockResolvedValueOnce(upstreamResponse(200, v2ListResponse(query)));
    const accepted = createResponse();

    await handler({ method: 'GET', headers: {}, query: {} }, accepted, {
      path: 'reviews',
      query: { origin: 'pipeline', state: 'pending' },
    });

    expect(accepted.statusCode).toBe(200);
    expect(accepted.body.contract_version).toBe('cadu-review-center-v2');
    expect(accepted.body.items[0].occurrence_count).toBe(3);

    const allowedIdentityModes = [
      ['aggregate_subject', 'subject_bound', 'pipeline_quality'],
      ['aggregate_subject', 'no_automatic_carry', 'pipeline_quality'],
      ['content_unresolved', 'no_automatic_carry', 'pipeline_quality'],
      ['operational_run', 'version_bound', 'pipeline_incident'],
    ];
    for (const [scope, carryPolicy, kind] of allowedIdentityModes) {
      const candidate = v2ListResponse(query);
      candidate.items[0].kind = kind;
      candidate.items[0].metadata.identity_scope = scope;
      candidate.items[0].metadata.carry_policy = carryPolicy;
      delete candidate.items[0].metadata.review_links;
      global.fetch.mockResolvedValueOnce(upstreamResponse(200, candidate));
      const response = createResponse();
      await handler({ method: 'GET', headers: {}, query: {} }, response, {
        path: 'reviews',
        query: { origin: 'pipeline', state: 'pending' },
      });
      expect(response.statusCode).toBe(200);
    }

    const malformedCases = [
      (body) => { body.contract_version = 'cadu-review-center-v1'; },
      (body) => {
        body.schema_version = 999;
        delete body.contract_version;
        body.items = [];
        body.total = 0;
        Object.assign(body.diagnostics.projection, {
          raw_items: 0,
          unique_items: 0,
          collapsed_occurrences: 0,
          linked_evidence_groups: 0,
          linked_evidence_items: 0,
        });
      },
      (body) => { body.items[0].review_key = 'not-a-digest'; },
      (body) => { body.items[0].metadata.review_cluster.occurrence_count = 2; },
      (body) => { body.items[0].metadata.review_cluster.item_versions = [PRIOR_ITEM_VERSION]; },
      (body) => { body.items[0].metadata.review_links.decision_policy = 'carry_resolution'; },
      (body) => { body.items[0].metadata.carry_policy = 'version_bound'; },
      (body) => { body.items[0].metadata.source_identity = 'raw-internal-identity'; },
      (body) => {
        body.items[0].origin = 'feed';
        body.items[0].kind = 'feed_item';
        body.items[0].metadata.source_revision = SOURCE_REVISION;
      },
      (body) => {
        body.items[0].state = 'approved';
        body.items[0].resolution = {
          decision: 'approved',
          resolved_by: ADMIN_ID,
          resolved_at: 1785200100,
        };
      },
      (body) => {
        body.items[0].state = 'resolved';
        body.items[0].resolution = {
          decision: 'resolved',
          resolved_by: ADMIN_ID,
          resolved_at: 1785200100,
        };
      },
      (body) => { body.total = 0; },
      (body) => {
        body.items[0].origin = 'feed';
        body.items[0].kind = 'feed_item';
        delete body.items[0].metadata.source_revision;
      },
      (body) => { body.diagnostics.projection.collapsed_occurrences = 2; },
    ];
    for (const mutate of malformedCases) {
      const malformed = JSON.parse(JSON.stringify(v2ListResponse(query)));
      mutate(malformed);
      global.fetch.mockResolvedValueOnce(upstreamResponse(200, malformed));
      const rejected = createResponse();
      await handler({ method: 'GET', headers: {}, query: {} }, rejected, {
        path: 'reviews',
        query: { origin: 'pipeline', state: 'pending' },
      });
      expect(rejected.statusCode).toBe(502);
      expect(rejected.body).toEqual({ error: 'invalid_cadu_api_response' });
    }

    const feedQuery = parseCentralReviewListQuery({ origin: 'feed', state: 'pending' });
    const feed = v2ListResponse(feedQuery);
    feed.items[0].origin = 'feed';
    feed.items[0].kind = 'feed_item';
    feed.items[0].metadata.source_revision = SOURCE_REVISION;
    global.fetch.mockResolvedValueOnce(upstreamResponse(200, feed));
    const acceptedFeed = createResponse();
    await handler({ method: 'GET', headers: {}, query: {} }, acceptedFeed, {
      path: 'reviews',
      query: { origin: 'feed', state: 'pending' },
    });
    expect(acceptedFeed.statusCode).toBe(200);
  });

  test('validates repass evidence even while a review remains pending', async () => {
    const query = parseCentralReviewListQuery({});
    const valid = listResponse(query);
    valid.items[0].repass = validItemRepass();
    global.fetch.mockResolvedValueOnce(upstreamResponse(200, valid));
    const accepted = createResponse();
    await handler({ method: 'GET', headers: {}, query: {} }, accepted, {
      path: 'reviews',
      query: {},
    });
    expect(accepted.statusCode).toBe(200);

    const malformed = listResponse(query);
    malformed.items[0].repass = { ...validItemRepass(), score: 1.5 };
    global.fetch.mockResolvedValueOnce(upstreamResponse(200, malformed));
    const rejected = createResponse();
    await handler({ method: 'GET', headers: {}, query: {} }, rejected, {
      path: 'reviews',
      query: {},
    });
    expect(rejected.statusCode).toBe(502);
    expect(rejected.body).toEqual({ error: 'invalid_cadu_api_response' });

    for (const mutation of [
      { item_version: PRIOR_ITEM_VERSION },
      { origin: 'feed' },
      { kind: 'feed_item' },
      { previous_score: null, delta: 0.1 },
      { previous_score: 0.9, score: 0.1, delta: 0.8 },
    ]) {
      const mismatched = listResponse(query);
      mismatched.items[0].repass = { ...validItemRepass(), ...mutation };
      global.fetch.mockResolvedValueOnce(upstreamResponse(200, mismatched));
      const mismatchedResponse = createResponse();
      await handler({ method: 'GET', headers: {}, query: {} }, mismatchedResponse, {
        path: 'reviews',
        query: {},
      });
      expect(mismatchedResponse.statusCode).toBe(502);
      expect(mismatchedResponse.body).toEqual({ error: 'invalid_cadu_api_response' });
    }

    const legacyBaseline = listResponse(query);
    legacyBaseline.items[0].metadata.score = null;
    legacyBaseline.items[0].repass = {
      ...validItemRepass(), previous_score: 0, score: 0.1, delta: 0.1,
    };
    global.fetch.mockResolvedValueOnce(upstreamResponse(200, legacyBaseline));
    const legacyResponse = createResponse();
    await handler({ method: 'GET', headers: {}, query: {} }, legacyResponse, {
      path: 'reviews', query: {},
    });
    expect(legacyResponse.statusCode).toBe(200);

    const v2BaselineMismatch = v2ListResponse(query);
    v2BaselineMismatch.items[0].metadata.score = 0.9;
    v2BaselineMismatch.items[0].repass = {
      ...validItemRepass(), previous_score: 0.8, score: 0.1, delta: -0.7,
    };
    global.fetch.mockResolvedValueOnce(upstreamResponse(200, v2BaselineMismatch));
    const v2MismatchResponse = createResponse();
    await handler({ method: 'GET', headers: {}, query: {} }, v2MismatchResponse, {
      path: 'reviews', query: {},
    });
    expect(v2MismatchResponse.statusCode).toBe(502);

    const incidentRepass = listResponse(query);
    incidentRepass.items[0].kind = 'pipeline_incident';
    incidentRepass.items[0].repass = { ...validItemRepass(), kind: 'pipeline_incident' };
    global.fetch.mockResolvedValueOnce(upstreamResponse(200, incidentRepass));
    const incidentResponse = createResponse();
    await handler({ method: 'GET', headers: {}, query: {} }, incidentResponse, {
      path: 'reviews', query: {},
    });
    expect(incidentResponse.statusCode).toBe(502);
  });

  test('audit remains read-only and accepts no resolution signature', async () => {
    const query = parseCentralReviewAuditQuery({ origin: 'pipeline' });
    global.fetch.mockResolvedValue(upstreamResponse(200, auditResponse(query)));
    const res = createResponse();

    await handler({ method: 'GET', headers: {}, query: {} }, res, {
      path: 'reviews/audit',
      query: { origin: 'pipeline' },
    });

    expect(res.statusCode).toBe(200);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://cadu.example/api/reviews/audit?origin=pipeline&limit=50&offset=0');
    expect(options.headers['X-Kino-Review-Signature']).toBeUndefined();
  });

  test('audit rejects evidence outside the requested origin or decision', async () => {
    for (const queryInput of [
      { origin: 'pipeline' },
      { decision: 'approved' },
    ]) {
      const query = parseCentralReviewAuditQuery(queryInput);
      const malformed = auditResponse(query);
      if (query.origin) malformed.items[0].origin = 'feed';
      if (query.decision) malformed.items[0].decision = 'rejected';
      global.fetch.mockResolvedValueOnce(upstreamResponse(200, malformed));
      const response = createResponse();
      await handler({ method: 'GET', headers: {}, query: {} }, response, {
        path: 'reviews/audit',
        query: queryInput,
      });
      expect(response.statusCode).toBe(502);
      expect(response.body).toEqual({ error: 'invalid_cadu_api_response' });
    }
  });

  test('accepts v2 audit identities and marks legacy audit records explicitly', async () => {
    const query = parseCentralReviewAuditQuery({ origin: 'pipeline' });
    for (const legacy of [false, true]) {
      global.fetch.mockResolvedValueOnce(upstreamResponse(200, v2AuditResponse(query, legacy)));
      const response = createResponse();
      await handler({ method: 'GET', headers: {}, query: {} }, response, {
        path: 'reviews/audit',
        query: { origin: 'pipeline' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.body.items[0].review_identity_version).toBe(
        legacy ? 'legacy-v1' : 'cadu-review-identity-v2',
      );
    }

    const malformed = v2AuditResponse(query, true);
    malformed.items[0].review_key = REVIEW_KEY;
    global.fetch.mockResolvedValueOnce(upstreamResponse(200, malformed));
    const rejected = createResponse();
    await handler({ method: 'GET', headers: {}, query: {} }, rejected, {
      path: 'reviews/audit',
      query: { origin: 'pipeline' },
    });
    expect(rejected.statusCode).toBe(502);
  });

  test('POST derives the actor, signs exact bytes and confirms published false', async () => {
    const response = {
      ok: true,
      published: false,
      decision_effect: 'editorial_record_only',
      id: RESOLUTION_ID,
      item_id: REVIEW_ID,
      item_version: ITEM_VERSION,
      decision: 'approved',
      resolution_note: 'Conferido.',
      resolved_by: ADMIN_ID,
      resolved_at: 1785200400,
      replayed: false,
    };
    global.fetch.mockResolvedValue(upstreamResponse(200, response));
    const body = {
      review_id: REVIEW_ID,
      expected_item_version: ITEM_VERSION,
      decision: 'approved',
      resolution_note: 'Conferido.',
    };
    const res = createResponse();

    await handler({ method: 'POST', headers: {}, query: {}, body }, res, {
      path: `reviews/${REVIEW_ID}/resolve`,
      query: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.published).toBe(false);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe(`https://cadu.example/api/reviews/${REVIEW_ID}/resolve`);
    expect(options.headers['X-Kino-Admin-Id']).toBe(ADMIN_ID);
    expect(options.headers['X-Kino-Review-Signature']).toMatch(/^[a-f0-9]{64}$/);
    expect(options.headers['X-Kino-Review-Body-SHA256']).toBe(
      createHash('sha256').update(Buffer.from(options.body, 'utf8')).digest('hex'),
    );
    expect(JSON.parse(options.body)).toEqual({
      expected_item_version: ITEM_VERSION,
      decision: 'approved',
      resolution_note: 'Conferido.',
    });
    expect(options.body).not.toContain('resolved_by');
  });

  test('POST repass signs the trigger and validates the summary contract', async () => {
    global.fetch.mockResolvedValue(upstreamResponse(200, repassResponse()));
    const res = createResponse();

    await handler({
      method: 'POST',
      headers: {},
      query: {},
      body: { intent: 'repass', run_id: null },
    }, res, {
      path: 'reviews/repass',
      query: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.run_id).toBe(RUN_ID);
    expect(res.body.requested_by).toBe(ADMIN_ID);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://cadu.example/api/reviews/repass');
    expect(options.headers['X-Kino-Admin-Id']).toBe(ADMIN_ID);
    expect(options.headers['X-Kino-Review-Signature']).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(options.body)).toEqual({ intent: 'repass', run_id: null });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  test('POST repass rejects internally inconsistent summary counters and times', async () => {
    const malformedCases = [
      (body) => { body.evaluated = 0; },
      (body) => { body.with_previous_score = body.entries + 1; },
      (body) => { body.stable = 1; },
      (body) => { body.publish_ready = body.entries + 1; },
      (body) => { body.finished_at = body.started_at - 1; },
    ];
    for (const mutate of malformedCases) {
      const body = repassResponse();
      mutate(body);
      global.fetch.mockResolvedValueOnce(upstreamResponse(200, body));
      const response = createResponse();
      await handler({
        method: 'POST', headers: {}, query: {}, body: { intent: 'repass', run_id: null },
      }, response, { path: 'reviews/repass', query: {} });
      expect(response.statusCode).toBe(502);
      expect(response.body).toEqual({ error: 'invalid_cadu_api_response' });
    }
  });

  test('repass fails closed for invalid trigger bodies', async () => {
    const invalid = createResponse();
    await handler({
      method: 'POST',
      headers: {},
      query: {},
      body: { intent: 'publish' },
    }, invalid, {
      path: 'reviews/repass',
      query: {},
    });
    expect(invalid.statusCode).toBe(422);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('fails closed for invalid body, stale response and missing signing config', async () => {
    const invalid = createResponse();
    await handler({
      method: 'POST',
      headers: {},
      query: {},
      body: {
        review_id: REVIEW_ID,
        expected_item_version: ITEM_VERSION,
        decision: 'publish',
      },
    }, invalid, {
      path: `reviews/${REVIEW_ID}/resolve`,
      query: {},
    });
    expect(invalid.statusCode).toBe(422);
    expect(global.fetch).not.toHaveBeenCalled();

    delete process.env.CADU_REVIEW_SIGNING_SECRET;
    const unconfigured = createResponse();
    await handler({
      method: 'POST',
      headers: {},
      query: {},
      body: {
        review_id: REVIEW_ID,
        expected_item_version: ITEM_VERSION,
        decision: 'approved',
      },
    }, unconfigured, {
      path: `reviews/${REVIEW_ID}/resolve`,
      query: {},
    });
    expect(unconfigured.statusCode).toBe(503);
    expect(global.fetch).not.toHaveBeenCalled();

    process.env.CADU_REVIEW_SIGNING_SECRET = REVIEW_SIGNING_SECRET;
    const query = parseCentralReviewListQuery({});
    const malformed = listResponse(query);
    malformed.items[0].source_url = 'javascript:alert(1)';
    global.fetch.mockResolvedValue(upstreamResponse(200, malformed));
    const badResponse = createResponse();
    await handler({ method: 'GET', headers: {}, query: {} }, badResponse, {
      path: 'reviews',
      query: {},
    });
    expect(badResponse.statusCode).toBe(502);
    expect(badResponse.body).toEqual({ error: 'invalid_cadu_api_response' });

    const oversized = listResponse(query);
    oversized.items[0].summary = 'x'.repeat(12_001);
    global.fetch.mockResolvedValue(upstreamResponse(200, oversized));
    const oversizedResponse = createResponse();
    await handler({ method: 'GET', headers: {}, query: {} }, oversizedResponse, {
      path: 'reviews',
      query: {},
    });
    expect(oversizedResponse.statusCode).toBe(502);
    expect(oversizedResponse.body).toEqual({ error: 'invalid_cadu_api_response' });
  });
});

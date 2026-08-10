// Admin-only proxy for the durable Mapa UFG institutional review queue.
//
// The browser proves its Supabase admin session to KinoCampus. Only this
// serverless function knows CADU_API_TOKEN and a distinct review-signing
// secret. The UUID returned by the trusted auth helper is carried only inside
// a short-lived HMAC assertion bound to method, target and exact request bytes.
// The cadu-api then uses its server-side service role to execute the CAS RPC.

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { requireCaduAdmin } from './cadu-auth.mjs';
import { fetchCaduUpstream } from './cadu-upstream-fetch.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SOURCE_ID = /^web\.[a-z0-9][a-z0-9.-]{0,115}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const STATES = new Set(['pending', 'approved', 'rejected', 'superseded']);
const DECISIONS = new Set(['approved', 'rejected', 'superseded']);
const LIST_QUERY_KEYS = new Set([
  'state', 'source_id', 'requested_by', 'resolved_by', 'limit', 'offset',
]);
const UNSAFE_NOTE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const REVIEW_SIGNATURE_VERSION = 'v1';
const REVIEW_NONCE = /^[A-Za-z0-9_-]{32}$/;
const UNIX_SECONDS = /^[1-9][0-9]{9}$/;
const MIN_REVIEW_SIGNING_SECRET_BYTES = 32;
const MAX_REVIEW_SIGNING_SECRET_BYTES = 1024;
const MAX_UPSTREAM_BODY = 2_000_000;
const MAX_UPSTREAM_ERROR_BODY = 64 * 1024;
const SAFE_UPSTREAM_STATUSES = new Set([
  400, 401, 403, 404, 409, 412, 422, 429, 500, 502, 503, 504,
]);
const SAFE_UPSTREAM_ERROR_MESSAGES = new Map([
  ['404:institutional review not found', {
    code: 'SOURCE_REVIEW_NOT_FOUND',
    detail: 'A solicitação de revisão não foi encontrada.',
  }],
  ['409:institutional review revision changed; reload and retry', {
    code: 'SOURCE_REVIEW_REVISION_CONFLICT',
    detail: 'A versão da solicitação mudou; atualize a fila e tente novamente.',
  }],
  ['409:institutional review was already resolved differently', {
    code: 'SOURCE_REVIEW_RESOLUTION_CONFLICT',
    detail: 'A solicitação já foi resolvida com outra decisão.',
  }],
  ['403:institutional review resolver is not an administrator', {
    code: 'SOURCE_REVIEW_RESOLVER_FORBIDDEN',
    detail: 'A identidade administrativa não foi aceita para esta decisão.',
  }],
  ['422:institutional review decision is invalid', {
    code: 'INVALID_SOURCE_REVIEW_RESOLUTION',
    detail: 'A decisão editorial informada é inválida.',
  }],
  ['422:institutional review resolution note is too long', {
    code: 'SOURCE_REVIEW_RESOLUTION_NOTE_TOO_LONG',
    detail: 'A nota de resolução excede o limite permitido.',
  }],
  ['503:review store not configured', {
    code: 'SOURCE_REVIEW_STORE_NOT_CONFIGURED',
    detail: 'O armazenamento da fila editorial não está configurado.',
  }],
]);
const SAFE_UPSTREAM_ERROR_CODES = new Map([
  ['409:SOURCE_REVIEW_STALE', {
    code: 'SOURCE_REVIEW_STALE',
    detail: 'A fonte mudou desde a solicitação; atualize a fila e marque a revisão como substituída.',
  }],
]);

export class CaduSourceReviewLimitError extends Error {
  constructor() {
    super('cadu_source_review_response_too_large');
    this.name = 'CaduSourceReviewLimitError';
    this.code = 'cadu_source_review_response_too_large';
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function singleQueryValue(value) {
  if (Array.isArray(value) || (value !== undefined && typeof value !== 'string')) return null;
  return value;
}

function canonicalInteger(value, fallback, { minimum, maximum }) {
  if (value === undefined) return fallback;
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) return null;
  return parsed;
}

export function parseSourceReviewListQuery(query = {}) {
  if (!isPlainObject(query)) return null;
  const keys = Object.keys(query);
  if (keys.some((key) => !LIST_QUERY_KEYS.has(key))) return null;

  const state = singleQueryValue(query.state);
  const sourceId = singleQueryValue(query.source_id);
  const requestedBy = singleQueryValue(query.requested_by);
  const resolvedBy = singleQueryValue(query.resolved_by);
  const rawLimit = singleQueryValue(query.limit);
  const rawOffset = singleQueryValue(query.offset);
  if ([state, sourceId, requestedBy, resolvedBy, rawLimit, rawOffset].includes(null)) return null;
  if (state !== undefined && !STATES.has(state)) return null;
  if (sourceId !== undefined && !SOURCE_ID.test(sourceId)) return null;
  if (requestedBy !== undefined && !UUID.test(requestedBy)) return null;
  if (resolvedBy !== undefined && !UUID.test(resolvedBy)) return null;
  const limit = canonicalInteger(rawLimit, 25, { minimum: 1, maximum: 100 });
  const offset = canonicalInteger(rawOffset, 0, { minimum: 0, maximum: 100_000 });
  if (limit === null || offset === null) return null;
  return {
    state: state ?? null,
    source_id: sourceId ?? null,
    requested_by: requestedBy ?? null,
    resolved_by: resolvedBy ?? null,
    limit,
    offset,
  };
}

export function serializeSourceReviewResolution(body) {
  if (!isPlainObject(body)) return null;
  const allowed = new Set([
    'review_id', 'expected_source_revision', 'decision', 'resolution_note',
  ]);
  const keys = Object.keys(body);
  if (keys.some((key) => !allowed.has(key))) return null;
  if (!UUID.test(body.review_id || '')
      || !SHA256.test(body.expected_source_revision || '')
      || !DECISIONS.has(body.decision)) {
    return null;
  }
  let resolutionNote = null;
  if (body.resolution_note !== undefined && body.resolution_note !== null) {
    if (typeof body.resolution_note !== 'string') return null;
    resolutionNote = body.resolution_note.normalize('NFKC').trim();
    if (!resolutionNote) resolutionNote = null;
    if (resolutionNote !== null
        && (Array.from(resolutionNote).length > 1000 || UNSAFE_NOTE_CONTROL.test(resolutionNote))) {
      return null;
    }
  }
  return {
    reviewId: body.review_id,
    payload: {
      expected_source_revision: body.expected_source_revision,
      decision: body.decision,
      resolution_note: resolutionNote,
    },
  };
}

export function buildCaduSourceReviewTargetUrl(apiUrl, route) {
  const parsedBase = new URL(String(apiUrl || '').trim());
  if (parsedBase.protocol !== 'https:'
      || parsedBase.username || parsedBase.password
      || parsedBase.search || parsedBase.hash) {
    throw new TypeError('invalid Cadu API base URL');
  }
  const base = parsedBase.toString().replace(/\/+$/, '');
  if (route && route.kind === 'list') {
    const target = new URL(`${base}/api/source-reviews`);
    for (const key of ['state', 'source_id', 'requested_by', 'resolved_by']) {
      if (route.query[key] !== null) target.searchParams.set(key, route.query[key]);
    }
    target.searchParams.set('limit', String(route.query.limit));
    target.searchParams.set('offset', String(route.query.offset));
    return target.toString();
  }
  if (route && route.kind === 'resolve' && UUID.test(route.reviewId || '')) {
    return `${base}/api/source-reviews/${encodeURIComponent(route.reviewId)}/resolve`;
  }
  throw new TypeError('invalid Cadu source-review route');
}

function reviewSigningSecretBytes(signingSecret, apiToken) {
  if (typeof signingSecret !== 'string'
      || signingSecret !== signingSecret.trim()
      || signingSecret === apiToken
      || /[\p{White_Space}\p{C}]/u.test(signingSecret)) {
    return null;
  }
  const secret = Buffer.from(signingSecret, 'utf8');
  if (secret.byteLength < MIN_REVIEW_SIGNING_SECRET_BYTES
      || secret.byteLength > MAX_REVIEW_SIGNING_SECRET_BYTES) {
    return null;
  }
  return secret;
}

/**
 * Build the private Kino -> cadu-api identity assertion for one resolution.
 * The target is derived from the final upstream URL, never from browser input.
 */
export function buildCaduReviewSignatureHeaders({
  signingSecret,
  apiToken,
  adminId,
  method,
  targetUrl,
  body,
  timestampSeconds = Math.floor(Date.now() / 1000),
  nonce = randomBytes(24).toString('base64url'),
}) {
  const secret = reviewSigningSecretBytes(signingSecret, apiToken);
  if (!secret || !UUID.test(adminId || '')
      || !['GET', 'POST'].includes(method)
      || typeof body !== 'string'
      || (method === 'GET' && body !== '')) {
    throw new TypeError('invalid Cadu review signing configuration');
  }
  const timestamp = String(timestampSeconds);
  if (!Number.isSafeInteger(timestampSeconds) || !UNIX_SECONDS.test(timestamp)
      || !REVIEW_NONCE.test(nonce)) {
    throw new TypeError('invalid Cadu review signature metadata');
  }
  const target = new URL(targetUrl);
  if (target.protocol !== 'https:' || target.username || target.password || target.hash) {
    throw new TypeError('signed Cadu review target must use HTTPS');
  }
  const requestTarget = `${target.pathname}${target.search}`;
  const bodySha256 = createHash('sha256').update(Buffer.from(body, 'utf8')).digest('hex');
  const canonical = [
    REVIEW_SIGNATURE_VERSION,
    timestamp,
    nonce,
    adminId,
    method,
    requestTarget,
    bodySha256,
  ].join('\n');
  const signature = createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
  return {
    'X-Kino-Admin-Id': adminId,
    'X-Kino-Review-Signature-Version': REVIEW_SIGNATURE_VERSION,
    'X-Kino-Review-Timestamp': timestamp,
    'X-Kino-Review-Nonce': nonce,
    'X-Kino-Review-Body-SHA256': bodySha256,
    'X-Kino-Review-Signature': signature,
  };
}

function byteLength(value) {
  return Buffer.byteLength(String(value || ''), 'utf8');
}

export async function readLimitedSourceReviewResponse(upstream, maximumBytes = MAX_UPSTREAM_BODY) {
  const lengthHeader = upstream?.headers?.get?.('content-length');
  if (lengthHeader && /^[0-9]+$/u.test(lengthHeader) && Number(lengthHeader) > maximumBytes) {
    throw new CaduSourceReviewLimitError();
  }

  if (upstream?.body && typeof upstream.body.getReader === 'function') {
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let total = 0;
    let text = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > maximumBytes) throw new CaduSourceReviewLimitError();
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      return text;
    } finally {
      try { await reader.cancel(); } catch {}
    }
  }

  // Native fetch responses always expose a Web ReadableStream. Keep this
  // fallback for deterministic test doubles while still applying a byte (not
  // UTF-16 character) limit.
  const text = await upstream.text();
  if (byteLength(text) > maximumBytes) throw new CaduSourceReviewLimitError();
  return text;
}

function allowlistedUpstreamDetail(status, body) {
  const detail = isPlainObject(body) ? body.detail : null;
  if (isPlainObject(detail) && typeof detail.code === 'string') {
    return SAFE_UPSTREAM_ERROR_CODES.get(`${status}:${detail.code}`) || null;
  }
  if (typeof detail === 'string') {
    return SAFE_UPSTREAM_ERROR_MESSAGES.get(`${status}:${detail}`) || null;
  }
  return null;
}

function validReviewItem(item) {
  if (!isPlainObject(item)
      || !UUID.test(item.id || '')
      || !UUID.test(item.requested_by || '')
      || !SOURCE_ID.test(item.source_id || '')
      || !SHA256.test(item.source_revision || '')
      || !STATES.has(item.state)) {
    return false;
  }
  if (item.state === 'pending') {
    return item.resolved_by === null && item.resolved_at === null;
  }
  return UUID.test(item.resolved_by || '')
    && typeof item.resolved_at === 'string'
    && item.resolved_at.length > 0;
}

function validateListResponse(body, query) {
  if (!isPlainObject(body)
      || !Array.isArray(body.items)
      || !body.items.every(validReviewItem)
      || !Number.isSafeInteger(body.total) || body.total < 0
      || body.limit !== query.limit
      || body.offset !== query.offset
      || body.items.length > query.limit
      || typeof body.has_more !== 'boolean'
      || body.has_more !== (query.offset + body.items.length < body.total)
      || !isPlainObject(body.filters)) {
    return null;
  }
  for (const key of ['state', 'source_id', 'requested_by', 'resolved_by']) {
    if (body.filters[key] !== query[key]) return null;
  }
  return body;
}

function validateResolutionResponse(body, resolution, adminId) {
  if (!isPlainObject(body)
      || body.id !== resolution.reviewId
      || !SOURCE_ID.test(body.source_id || '')
      || body.source_revision !== resolution.payload.expected_source_revision
      || body.state !== resolution.payload.decision
      || !UUID.test(body.resolved_by || '')
      || typeof body.resolved_at !== 'string' || !body.resolved_at
      || typeof body.replayed !== 'boolean'
      || (body.replayed === false && body.resolved_by !== adminId)) {
    return null;
  }
  return body;
}

function configureResponse(res) {
  // This admin endpoint is consumed same-origin. Deliberately omit
  // Access-Control-Allow-Origin so another site cannot exercise a browser
  // session even if it obtains the request shape.
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function safeStatus(value, fallback = 502) {
  return SAFE_UPSTREAM_STATUSES.has(value) ? value : fallback;
}

function sendError(res, status, error, detail = null) {
  const payload = { error };
  if (detail && typeof detail.code === 'string' && typeof detail.detail === 'string') {
    payload.code = detail.code;
    payload.detail = detail.detail;
  }
  return res.status(status).json(payload);
}

function sanitizedAuthResponse(res) {
  let statusCode = 502;
  return {
    status(value) {
      statusCode = Number.isInteger(value) && value >= 400 && value <= 599 ? value : 502;
      return this;
    },
    json(payload) {
      const error = payload && typeof payload.error === 'string'
        && /^[a-z0-9_]{1,64}$/.test(payload.error)
        ? payload.error
        : 'admin_auth_failed';
      return res.status(statusCode).json({ error });
    },
  };
}

export async function handleCaduSourceReviews(req, res, options = {}) {
  configureResponse(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return sendError(res, 405, 'method_not_allowed');
  }

  let admin;
  try {
    admin = await requireCaduAdmin(req, sanitizedAuthResponse(res));
  } catch {
    return sendError(res, 502, 'admin_auth_unreachable');
  }
  if (!admin) return undefined;
  if (!UUID.test(admin.id || '')) return sendError(res, 502, 'invalid_admin_identity');

  let route;
  let upstreamBody;
  if (req.method === 'GET') {
    const query = parseSourceReviewListQuery(options.query || req.query || {});
    if (!query) return sendError(res, 400, 'invalid_source_review_filters');
    route = { kind: 'list', query };
  } else {
    const resolution = serializeSourceReviewResolution(req.body);
    if (!resolution) return sendError(res, 422, 'invalid_source_review_resolution');
    route = { kind: 'resolve', reviewId: resolution.reviewId, resolution };
    upstreamBody = JSON.stringify(resolution.payload);
  }

  const apiUrl = typeof process.env.CADU_API_URL === 'string'
    ? process.env.CADU_API_URL.trim()
    : '';
  const token = typeof process.env.CADU_API_TOKEN === 'string'
    ? process.env.CADU_API_TOKEN.trim()
    : '';
  if (!apiUrl || !token) return sendError(res, 503, 'cadu_api_not_configured');

  let targetUrl;
  try {
    targetUrl = buildCaduSourceReviewTargetUrl(apiUrl, route);
  } catch {
    return sendError(res, 503, 'cadu_api_not_configured');
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'User-Agent': 'KinoCampus-Admin/2.0',
  };
  if (req.method === 'POST') {
    headers['Content-Type'] = 'application/json';
    try {
      Object.assign(headers, buildCaduReviewSignatureHeaders({
        signingSecret: process.env.CADU_REVIEW_SIGNING_SECRET,
        apiToken: token,
        adminId: admin.id,
        method: req.method,
        targetUrl,
        body: upstreamBody,
      }));
    } catch {
      return sendError(res, 503, 'cadu_review_signing_not_configured');
    }
  }

  try {
    const upstream = await fetchCaduUpstream(targetUrl, {
      method: req.method,
      headers,
      body: upstreamBody,
      cache: 'no-store',
      redirect: 'error',
      // Keep a strict deadline ladder: OpenClaw resolves within 10 s, this
      // proxy gives the upstream 12 s, and the browser waits 15 s before it
      // reloads the authoritative state instead of guessing the outcome.
      signal: AbortSignal.timeout(12000),
    }, {
      operation: `source_reviews.${route.kind}`,
    });
    const text = await readLimitedSourceReviewResponse(
      upstream,
      upstream.ok ? MAX_UPSTREAM_BODY : MAX_UPSTREAM_ERROR_BODY,
    );
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!upstream.ok) {
      const status = safeStatus(upstream.status);
      const detail = allowlistedUpstreamDetail(status, body);
      return sendError(res, status, 'cadu_api_error', detail);
    }
    const validated = route.kind === 'list'
      ? validateListResponse(body, route.query)
      : validateResolutionResponse(body, route.resolution, admin.id);
    if (!validated) return sendError(res, 502, 'invalid_cadu_api_response');
    return res.status(200).json(validated);
  } catch (error) {
    if (error?.code === 'cadu_source_review_response_too_large') {
      return sendError(res, 502, 'invalid_cadu_api_response');
    }
    return sendError(res, 502, 'cadu_api_unreachable');
  }
}

export default handleCaduSourceReviews;

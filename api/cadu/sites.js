// api/cadu/sites.js — strict admin proxy for the Cadu sites and registry APIs.
//
// The browser authenticates with a Supabase admin JWT. Only this server-side
// function receives CADU_API_TOKEN. Raw client paths are never concatenated
// into the upstream URL: every accepted route is rebuilt from known segments.

import { requireCaduAdmin } from '../../server/cadu-auth.mjs';
import { fetchCaduUpstream, normalizeCaduApiToken } from '../../server/cadu-upstream-fetch.js';
import { getCaduSourceRegistryMirror } from '../../server/cadu-source-registry-mirror.js';
import {
  buildCaduReviewSignatureHeaders,
  handleCaduSourceReviews,
} from '../../server/cadu-source-reviews-proxy.js';
import { handleCaduReviews } from '../../server/cadu-reviews-proxy.js';

const STRONG_CADU_ETAG = /^"[a-f0-9]{64}"$/;
const CADU_REGISTRY_SHA256 = /^[a-f0-9]{64}$/;
const STABLE_WEB_SOURCE_ID = /^web\.[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
const UNSAFE_NOTE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const ENCODED_PATH_SYNTAX = /%(?:2e|2f|3f|23|5c)/i;
const MAX_PATH_LENGTH = 512;
const MAX_SEGMENT_LENGTH = 200;

function decodePathForValidation(rawPath) {
  if (typeof rawPath !== 'string' || rawPath.length > MAX_PATH_LENGTH) return null;

  let decoded = rawPath;
  for (let pass = 0; pass < 4; pass += 1) {
    // Encoded dots, separators, query/hash markers and backslashes are never
    // needed by the contract. Reject them at every encoding layer instead of
    // normalizing an attack into a valid-looking route.
    if (ENCODED_PATH_SYNTAX.test(decoded)) return null;

    let next;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return null;
    }
    if (next === decoded) break;
    decoded = next;
  }

  // More encoding layers, or a literal percent, are outside the route contract.
  if (decoded.includes('%')) return null;
  if (decoded.length > MAX_PATH_LENGTH || CONTROL_CHARACTER.test(decoded)) return null;
  if (decoded.includes('\\') || decoded.includes('?') || decoded.includes('#')) return null;
  return decoded;
}

function isSafeLegacyUnitId(value) {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= MAX_SEGMENT_LENGTH
    && value.trim() === value
    && value !== '.'
    && value !== '..'
    && !CONTROL_CHARACTER.test(value)
    && !/[\\/?#]/u.test(value);
}

export function isStrongCaduEtag(value) {
  return typeof value === 'string' && STRONG_CADU_ETAG.test(value);
}

export function classifyCaduSitesPath(rawPath) {
  if (rawPath === undefined || rawPath === null || rawPath === '') {
    return { kind: 'sites_list', registry: false, allowedMethods: ['GET'] };
  }
  // Vercel can represent duplicate query parameters as an array. Joining them
  // would create a new path that the client never sent, so fail closed.
  if (Array.isArray(rawPath)) return null;

  const decoded = decodePathForValidation(rawPath);
  if (decoded === null || decoded === '') return null;
  const segments = decoded.split('/');
  if (segments.some((segment) => !segment || segment.length > MAX_SEGMENT_LENGTH
    || segment === '.' || segment === '..')) {
    return null;
  }

  if (segments[0] === 'source-registry') {
    if (segments.length === 1) {
      return { kind: 'registry_list', registry: true, allowedMethods: ['GET'] };
    }
    if (segments.length === 2 && segments[1] === 'readiness') {
      return {
        kind: 'registry_readiness', registry: true, requiresStrongEtag: false, allowedMethods: ['GET'],
      };
    }
    const sourceId = segments[1];
    if (!STABLE_WEB_SOURCE_ID.test(sourceId || '')) return null;
    if (segments.length === 2) {
      return {
        kind: 'registry_detail', registry: true, sourceId, allowedMethods: ['GET'],
      };
    }
    if (segments.length === 3 && segments[2] === 'override') {
      return {
        kind: 'registry_override', registry: true, sourceId, allowedMethods: ['PATCH'],
      };
    }
    return null;
  }

  if (segments.length === 2 && segments[1] === 'meta'
      && isSafeLegacyUnitId(segments[0])) {
    return {
      kind: 'legacy_meta',
      registry: false,
      unitId: segments[0],
      allowedMethods: ['GET', 'PATCH'],
    };
  }
  return null;
}

function encodeKnownSegment(value) {
  return encodeURIComponent(value);
}

export function buildCaduSitesTargetUrl(apiUrl, route) {
  const parsedBase = new URL(String(apiUrl || ''));
  if (!['http:', 'https:'].includes(parsedBase.protocol)
      || parsedBase.username || parsedBase.password
      || parsedBase.search || parsedBase.hash) {
    throw new TypeError('invalid Cadu API base URL');
  }

  let path;
  switch (route && route.kind) {
    case 'sites_list':
      path = '/api/sites';
      break;
    case 'legacy_meta':
      if (!isSafeLegacyUnitId(route.unitId)) throw new TypeError('invalid legacy unit ID');
      path = `/api/sites/${encodeKnownSegment(route.unitId)}/meta`;
      break;
    case 'registry_list':
      path = '/api/source-registry';
      break;
    case 'registry_readiness':
      path = '/api/source-registry/readiness';
      break;
    case 'registry_detail':
      if (!STABLE_WEB_SOURCE_ID.test(route.sourceId || '')) {
        throw new TypeError('invalid stable source ID');
      }
      path = `/api/source-registry/${encodeKnownSegment(route.sourceId)}`;
      break;
    case 'registry_override':
      if (!STABLE_WEB_SOURCE_ID.test(route.sourceId || '')) {
        throw new TypeError('invalid stable source ID');
      }
      path = `/api/source-registry/${encodeKnownSegment(route.sourceId)}/override`;
      break;
    default:
      throw new TypeError('invalid Cadu sites route');
  }

  return `${parsedBase.toString().replace(/\/+$/, '')}${path}`;
}

function readSingleHeader(req, lowerName, canonicalName) {
  const value = req && req.headers
    ? (req.headers[lowerName] ?? req.headers[canonicalName])
    : undefined;
  if (Array.isArray(value)) return null;
  return typeof value === 'string' ? value.trim() : '';
}

function serializePatchBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const prototype = Object.getPrototypeOf(body);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const fields = Object.keys(body);
  if (fields.length === 0 || fields.some((field) => field !== 'tier' && field !== 'note')) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'tier')
      && body.tier !== null
      && (!Number.isInteger(body.tier) || body.tier < 1 || body.tier > 3)) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'note')) {
    if (body.note !== null && (typeof body.note !== 'string'
        || Array.from(body.note).length > 500 || UNSAFE_NOTE_CONTROL.test(body.note))) {
      return null;
    }
  }
  try {
    return JSON.stringify(body);
  } catch {
    return null;
  }
}

function sanitizeErrorText(value) {
  if (typeof value !== 'string' || !value) return null;
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!normalized || /[<>]/u.test(normalized)
      || /&(?:lt|gt|#0*6[02]|#x0*3[ce]);/iu.test(normalized)) {
    return null;
  }
  return normalized;
}

export function sanitizeCaduErrorDetail(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const direct = sanitizeErrorText(
    typeof body.detail === 'string' ? body.detail : body.message,
  );
  if (direct) return direct.slice(0, 300);

  if (Array.isArray(body.detail)) {
    const issues = body.detail.slice(0, 5).map((issue) => {
      if (!issue || typeof issue !== 'object' || Array.isArray(issue)) return null;
      const message = sanitizeErrorText(issue.msg);
      if (!message) return null;
      const location = Array.isArray(issue.loc)
        ? issue.loc.slice(0, 6).filter((part) => (
          (typeof part === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(part))
          || (Number.isInteger(part) && part >= 0)
        )).join('.')
        : '';
      return `${location ? `${location}: ` : ''}${message}`;
    }).filter(Boolean);
    if (issues.length) return issues.join('; ').slice(0, 300);
  }
  return null;
}

function sendProxyError(res, status, error, detail) {
  const payload = { error };
  if (detail) payload.detail = detail;
  return res.status(status).json(payload);
}

function configureCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, If-Match');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'ETag, X-Cadu-Canonical-ETag, X-Cadu-Registry-Sha256, X-Cadu-Registry-Origin, X-Cadu-Registry-Audit-Cutoff, X-Cadu-Upstream-Status',
  );
}

export function classifyRegistryMirrorFailure(error) {
  const name = error && typeof error.name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(error.name)
    ? error.name
    : 'Error';
  const code = error && typeof error.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(error.code)
    ? error.code
    : null;
  const message = error && typeof error.message === 'string' ? error.message : '';
  let reason = 'validation_failed';
  if (code === 'ENOENT') reason = 'missing_artifact';
  else if (name === 'SyntaxError') reason = 'invalid_json';
  else if (/content drift|does not match/i.test(message)) reason = 'integrity_drift';
  else if (/manifest/i.test(message)) reason = 'invalid_manifest';
  else if (/enabled|shadow|activation/i.test(message)) reason = 'unsafe_activation';
  return { reason, errorName: name, errorCode: code };
}

function serveRegistryMirror(res, upstreamStatus) {
  try {
    const mirror = getCaduSourceRegistryMirror();
    res.setHeader('ETag', mirror.etag);
    // Vercel may replace the HTTP entity ETag with a weak response-body ETag.
    // Keep the exact strong CAS token in a dedicated end-to-end header.
    res.setHeader('X-Cadu-Canonical-ETag', mirror.etag);
    res.setHeader('X-Cadu-Registry-Sha256', mirror.registrySha256);
    res.setHeader('X-Cadu-Registry-Origin', 'kino-campus-mirror');
    res.setHeader('X-Cadu-Registry-Audit-Cutoff', mirror.auditCutoff);
    if (Number.isInteger(upstreamStatus) && upstreamStatus >= 400 && upstreamStatus <= 599) {
      res.setHeader('X-Cadu-Upstream-Status', String(upstreamStatus));
    }
    // A mirror is a continuity view, not the authoritative recovery signal.
    // Never let a browser/CDN retain it after the VPS registry comes back.
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json(mirror.payload);
  } catch (error) {
    try {
      console.error(
        '[KinoCampus:Cadu] registry_mirror_unavailable',
        classifyRegistryMirrorFailure(error),
      );
    } catch (_) { /* logging must never change fail-closed behavior */ }
    return null;
  }
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

function readUpstreamHeader(upstream, name) {
  try {
    return upstream && upstream.headers && typeof upstream.headers.get === 'function'
      ? upstream.headers.get(name)
      : null;
  } catch {
    return null;
  }
}

function forwardRegistryHeaders(upstream, res, requiresStrongEtag = true) {
  const etag = readUpstreamHeader(upstream, 'etag');
  const registrySha = readUpstreamHeader(upstream, 'x-cadu-registry-sha256');
  if ((requiresStrongEtag && !isStrongCaduEtag(etag))
      || !CADU_REGISTRY_SHA256.test(registrySha || '')) {
    return false;
  }
  if (requiresStrongEtag) {
    res.setHeader('ETag', etag);
    res.setHeader('X-Cadu-Canonical-ETag', etag);
  }
  res.setHeader('X-Cadu-Registry-Sha256', registrySha);
  return true;
}

function legacyMetaWritesEnabled() {
  return process.env.CADU_LEGACY_META_WRITE_ENABLED === '1';
}

export default async function handler(req, res) {
  // Reuse this function for the durable review queue so Hobby deployments stay
  // below Vercel's serverless-function limit. The public URL remains
  // /api/cadu/source-reviews through the exact rewrite in vercel.json.
  const routerPath = req && req.query ? req.query.path : undefined;
  if (routerPath === 'source-reviews') {
    const sourceReviewQuery = Object.fromEntries(
      Object.entries(req.query || {}).filter(([key]) => key !== 'path'),
    );
    return handleCaduSourceReviews(req, res, { query: sourceReviewQuery });
  }
  if (typeof routerPath === 'string'
      && (routerPath === 'reviews' || routerPath.startsWith('reviews/'))) {
    const reviewQuery = Object.fromEntries(
      Object.entries(req.query || {}).filter(([key]) => key !== 'path'),
    );
    return handleCaduReviews(req, res, {
      path: routerPath,
      query: reviewQuery,
    });
  }

  configureCors(res);
  // Failures and metadata are never cacheable. The legacy sites list replaces
  // this header with its existing private five-minute cache only after success.
  res.setHeader('Cache-Control', 'private, no-store');

  const rawPath = routerPath;
  const route = classifyCaduSitesPath(rawPath);
  if (!route) return sendProxyError(res, 400, 'invalid_cadu_sites_path');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    res.setHeader('Allow', 'GET, PATCH, OPTIONS');
    return sendProxyError(res, 405, 'method_not_allowed');
  }

  if (!route.allowedMethods.includes(req.method)) {
    res.setHeader('Allow', [...route.allowedMethods, 'OPTIONS'].join(', '));
    return sendProxyError(res, 405, 'method_not_allowed_for_cadu_sites_path');
  }

  let admin;
  try {
    admin = await requireCaduAdmin(req, sanitizedAuthResponse(res));
  } catch {
    return sendProxyError(res, 502, 'admin_auth_unreachable');
  }
  if (!admin) return undefined;

  if (route.kind === 'legacy_meta' && req.method === 'PATCH' && !legacyMetaWritesEnabled()) {
    res.setHeader('Allow', 'GET, OPTIONS');
    return sendProxyError(res, 405, 'legacy_cadu_meta_writes_disabled');
  }

  const apiUrl = typeof process.env.CADU_API_URL === 'string'
    ? process.env.CADU_API_URL.trim()
    : '';
  const token = normalizeCaduApiToken(process.env.CADU_API_TOKEN);
  if (!apiUrl || !token) {
    if (route.kind === 'registry_list') {
      const mirrorResponse = serveRegistryMirror(res, 503);
      if (mirrorResponse) return mirrorResponse;
    }
    return sendProxyError(res, 503, 'cadu_api_not_configured');
  }

  let ifMatch = '';
  if (route.kind === 'registry_override') {
    ifMatch = readSingleHeader(req, 'if-match', 'If-Match');
    if (!ifMatch) return sendProxyError(res, 428, 'if_match_required');
    if (!isStrongCaduEtag(ifMatch)) return sendProxyError(res, 400, 'invalid_if_match');
  }

  let requestBody;
  if (req.method === 'PATCH') {
    requestBody = serializePatchBody(req.body);
    if (requestBody === null) return sendProxyError(res, 422, 'invalid_cadu_patch_body');
  }

  let targetUrl;
  try {
    targetUrl = buildCaduSitesTargetUrl(apiUrl, route);
  } catch {
    if (route.kind === 'registry_list') {
      const mirrorResponse = serveRegistryMirror(res, 503);
      if (mirrorResponse) return mirrorResponse;
    }
    return sendProxyError(res, 503, 'cadu_api_not_configured');
  }

  const upstreamHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'User-Agent': 'KinoCampus-Admin/2.0',
  };
  if (route.kind === 'registry_readiness') {
    try {
      Object.assign(upstreamHeaders, buildCaduReviewSignatureHeaders({
        signingSecret: process.env.CADU_REVIEW_SIGNING_SECRET,
        apiToken: token,
        adminId: admin.id,
        method: 'GET',
        targetUrl,
        body: '',
      }));
      upstreamHeaders['X-Kino-Review-Capability'] = 'v1';
    } catch {
      return sendProxyError(res, 503, 'cadu_review_signing_not_configured');
    }
  }
  if (req.method === 'PATCH') upstreamHeaders['Content-Type'] = 'application/json';
  if (route.kind === 'registry_override') upstreamHeaders['If-Match'] = ifMatch;

  try {
    const upstream = await fetchCaduUpstream(targetUrl, {
      method: req.method,
      headers: upstreamHeaders,
      body: requestBody,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(route.kind === 'registry_readiness' ? 12000 : 25000),
    }, {
      operation: `sites.${route.kind}`,
    });

    const text = await upstream.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }

    if (!upstream.ok) {
      const status = Number.isInteger(upstream.status)
        && upstream.status >= 400 && upstream.status <= 599
        ? upstream.status
        : 502;
      if (route.kind === 'registry_list' && [404, 410, 501, 502, 503, 504].includes(status)) {
        const mirrorResponse = serveRegistryMirror(res, status);
        if (mirrorResponse) return mirrorResponse;
      }
      const payload = { error: 'cadu_api_error', status };
      const detail = sanitizeCaduErrorDetail(body);
      if (detail) payload.detail = detail;
      return res.status(status).json(payload);
    }

    if (body === null) return sendProxyError(res, 502, 'invalid_cadu_api_response');
    if (route.registry && !forwardRegistryHeaders(
      upstream,
      res,
      route.requiresStrongEtag !== false,
    )) {
      return sendProxyError(res, 502, 'invalid_cadu_registry_headers');
    }

    if (!route.registry) {
      res.setHeader(
        'Cache-Control',
        route.kind === 'sites_list' ? 'private, max-age=300' : 'private, no-store',
      );
    }
    return res.status(upstream.status).json(body);
  } catch {
    if (route.kind === 'registry_list') {
      const mirrorResponse = serveRegistryMirror(res, 502);
      if (mirrorResponse) return mirrorResponse;
    }
    return sendProxyError(res, 502, 'cadu_api_unreachable');
  }
}

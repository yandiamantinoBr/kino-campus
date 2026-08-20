// api/cadu/health.js — proxy para cadu-api /health
//
// Endpoint exposto: GET /api/cadu/health
// Sem auth, retorna liveness do cadu-api
//
// ES module (api/package.json contém "type": "module").

import { fetchCaduUpstream, normalizeCaduApiToken } from '../../server/cadu-upstream-fetch.js';
import responseLimits from '../../server/cadu-response-limits.cjs';

const {
  MAX_CADU_ERROR_RESPONSE_BYTES,
  parseCaduJson,
  readLimitedCaduResponse,
  stableCaduTransportFailure,
} = responseLimits;

const SAFE_HEALTH_STATUS = /^[a-z][a-z0-9_-]{0,63}$/iu;
const SAFE_HEALTH_VERSION = /^[a-z0-9][a-z0-9._-]{0,79}$/iu;
const SAFE_HEALTH_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u;
const SAFE_HEALTH_TIMESTAMP_SECONDS = /^\d{1,10}$/u;
const MAX_HEALTH_TIMESTAMP_SECONDS = 4_102_444_800;

function validHealthTimestampSeconds(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_HEALTH_TIMESTAMP_SECONDS;
}

export function isValidCaduHealthPayload(body) {
  return Boolean(
    body
    && typeof body === 'object'
    && !Array.isArray(body)
    && typeof body.status === 'string'
    && SAFE_HEALTH_STATUS.test(body.status),
  );
}

function publicHealthTimestamp(value) {
  if (validHealthTimestampSeconds(value)) return value;

  // The Cadu API has historically emitted Unix seconds as numbers, but a few
  // deployments serialize them as strings. Preserve that compatible form
  // only after bounding it to the same safe range.
  if (typeof value === 'string' && SAFE_HEALTH_TIMESTAMP_SECONDS.test(value)) {
    const seconds = Number(value);
    if (validHealthTimestampSeconds(seconds)) return seconds;
  }

  // ISO dates with a numeric offset are valid RFC 3339 timestamps too. The
  // response is still constrained to a plain safe string and rendered by the
  // panel with textContent, never as HTML.
  if (typeof value === 'string' && SAFE_HEALTH_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value))) {
    return value;
  }

  return undefined;
}

export function publicCaduHealthPayload(body) {
  const source = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const status = typeof source.status === 'string' && SAFE_HEALTH_STATUS.test(source.status)
    ? source.status
    : 'unknown';
  const payload = { status };
  if (typeof source.version === 'string' && SAFE_HEALTH_VERSION.test(source.version)) {
    payload.version = source.version;
  }
  const timestamp = publicHealthTimestamp(source.ts);
  if (timestamp !== undefined) payload.ts = timestamp;
  return payload;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const apiUrl = process.env.CADU_API_URL;
  const token = normalizeCaduApiToken(process.env.CADU_API_TOKEN);
  if (!apiUrl || !token) {
    return res.status(503).json({ error: 'cadu_api_not_configured' });
  }

  try {
    const upstream = await fetchCaduUpstream(`${apiUrl.replace(/\/$/, '')}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': 'KinoCampus-Admin/1.0' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    }, {
      operation: 'health',
    });

    if (!upstream.ok) {
      // Consume at most a small error response so the connection can be
      // released, but never reflect upstream diagnostics to an anonymous
      // liveness caller.
      try { await readLimitedCaduResponse(upstream, MAX_CADU_ERROR_RESPONSE_BYTES); } catch {}
      return res.status(upstream.status).json({ error: 'cadu_api_error', status: upstream.status });
    }

    const text = await readLimitedCaduResponse(upstream, MAX_CADU_ERROR_RESPONSE_BYTES);
    const parsed = parseCaduJson(text);
    if (!parsed.ok || !isValidCaduHealthPayload(parsed.value)) {
      return res.status(502).json({ error: 'cadu_api_invalid_response' });
    }

    // The public health endpoint is intentionally liveness-only. Detailed
    // pipeline, alert and registry state remains behind the admin proxy.
    return res.status(upstream.status).json(publicCaduHealthPayload(parsed.value));
  } catch (error) {
    const failure = stableCaduTransportFailure(error);
    return res.status(failure.status).json({ error: failure.error });
  }
}

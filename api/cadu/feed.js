// api/cadu/feed.js — proxy admin para itens públicos dos artefatos do Curador.
//
// Endpoints expostos:
// - GET  /api/cadu/feed?limit=N
// - GET  /api/cadu/feed?path={chunk_id}
// - POST /api/cadu/feed?path={chunk_id}/ask

import { requireCaduAdmin, stripCaduAdminQuery } from '../../server/cadu-auth.mjs';
import { fetchCaduUpstream, normalizeCaduApiToken } from '../../server/cadu-upstream-fetch.js';
import responseLimits from '../../server/cadu-response-limits.cjs';

const {
  MAX_CADU_ERROR_RESPONSE_BYTES,
  MAX_CADU_RESPONSE_BYTES,
  parseCaduJson,
  readLimitedCaduResponse,
  stableCaduTransportFailure,
} = responseLimits;

const MAX_CADU_FEED_REQUEST_BYTES = 64 * 1024;

export const config = {
  maxDuration: 300,
};

export function classifyCaduFeedPath(subPath) {
  if (subPath === 'admin' || subPath.startsWith('admin/')) return 'retired_admin';
  const segments = subPath ? subPath.split('/') : [];
  const validChunkId = (value) => /^[A-Za-z0-9_-]{1,128}$/.test(value || '');
  if (segments.length === 0) return 'list';
  if (segments.length === 1 && validChunkId(segments[0])) return 'chunk';
  if (segments.length === 2 && validChunkId(segments[0]) && segments[1] === 'ask') {
    return 'ask';
  }
  return null;
}

function byteLength(value) {
  return Buffer.byteLength(String(value || ''), 'utf8');
}

export function serializeCaduFeedBody(req) {
  if (req?.method === 'GET' || req?.method === 'HEAD' || req?.body === undefined || req?.body === null) {
    return undefined;
  }
  let serialized;
  try {
    serialized = JSON.stringify(req.body);
  } catch {
    const error = new Error('invalid_cadu_request_body');
    error.code = 'invalid_cadu_request_body';
    throw error;
  }
  if (typeof serialized !== 'string') {
    const error = new Error('invalid_cadu_request_body');
    error.code = 'invalid_cadu_request_body';
    throw error;
  }
  if (byteLength(serialized) > MAX_CADU_FEED_REQUEST_BYTES) {
    const error = new Error('cadu_request_body_too_large');
    error.code = 'cadu_request_body_too_large';
    throw error;
  }
  return serialized;
}

export default async function handler(req, res) {
  // The admin console is same-origin. Do not make an authenticated bearer
  // usable by arbitrary browser origins if it is ever exposed elsewhere.
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed', message: 'Use GET ou POST' });
  }

  const admin = await requireCaduAdmin(req, res);
  if (!admin) return;

  const rawPath = Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path;
  const subPath = (typeof rawPath === 'string' ? rawPath : '').replace(/^\/+|\/+$/g, '');
  const routeKind = classifyCaduFeedPath(subPath);
  if (routeKind === 'retired_admin') {
    return res.status(410).json({
      error: 'cadu_admin_capability_retired',
      message: 'Operacoes administrativas internas do Cadu foram desativadas.',
    });
  }
  if (!routeKind) {
    return res.status(400).json({ error: 'invalid_cadu_feed_path' });
  }
  if ((routeKind === 'ask' && req.method !== 'POST')
      || (routeKind !== 'ask' && req.method !== 'GET')) {
    return res.status(405).json({ error: 'method_not_allowed_for_cadu_feed_path' });
  }

  const apiUrl = process.env.CADU_API_URL;
  const token = normalizeCaduApiToken(process.env.CADU_API_TOKEN);
  if (!apiUrl || !token) {
    return res.status(503).json({ error: 'cadu_api_not_configured' });
  }

  const clientQueryString = (req.url || '').includes('?') ? req.url.split('?')[1] : '';
  const finalQs = stripCaduAdminQuery(clientQueryString);
  const targetUrl = `${apiUrl.replace(/\/$/, '')}/api/feed${subPath ? '/' + subPath : ''}${finalQs ? '?' + finalQs : ''}`;

  let serializedBody;
  try {
    serializedBody = serializeCaduFeedBody(req);
  } catch (error) {
    if (error?.code === 'cadu_request_body_too_large') {
      return res.status(413).json({ error: error.code });
    }
    return res.status(422).json({ error: 'invalid_cadu_request_body' });
  }

  try {
    const upstream = await fetchCaduUpstream(targetUrl, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'KinoCampus-Admin/1.0',
      },
      body: serializedBody,
      redirect: 'error',
      signal: AbortSignal.timeout(routeKind === 'ask' ? 285000 : 30000),
    }, {
      operation: `feed.${routeKind}`,
    });

    if (!upstream.ok) {
      try { await readLimitedCaduResponse(upstream, MAX_CADU_ERROR_RESPONSE_BYTES); } catch {}
      return res.status(upstream.status).json({
        error: 'cadu_api_error',
        status: upstream.status,
      });
    }

    const text = await readLimitedCaduResponse(upstream, MAX_CADU_RESPONSE_BYTES);
    const parsed = parseCaduJson(text);
    if (!parsed.ok) return res.status(502).json({ error: 'cadu_api_invalid_response' });

    if (!subPath && req.method === 'GET') {
      res.setHeader('Cache-Control', 'private, max-age=60');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }

    return res.status(200).json(parsed.value);
  } catch (error) {
    const failure = stableCaduTransportFailure(error);
    return res.status(failure.status).json({ error: failure.error });
  }
}

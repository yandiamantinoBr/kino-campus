import { requireCaduAdmin } from './cadu-auth.mjs';
import { fetchCaduUpstream, normalizeCaduApiToken } from './cadu-upstream-fetch.js';

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
const ENCODED_PATH_SYNTAX = /%(?:2e|2f|3f|23|5c)/iu;
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_PATH_LENGTH = 512;
const MAX_QUERY_LENGTH = 2048;
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_ERROR_RESPONSE_BYTES = 64 * 1024;
const MAX_SSE_BYTES = 16 * 1024 * 1024;
const NON_STREAM_TIMEOUT_MS = 25_000;
const AGENT_SEND_TIMEOUT_MS = 285_000;
const SSE_TIMEOUT_MS = 285_000;
const SAFE_UPSTREAM_ERROR_STATUS = new Map([
  ['dedup_preview_required', 412],
  ['pipeline_runtime_busy', 409],
]);

export class CaduProxyLimitError extends Error {
  constructor(code) {
    super(code);
    this.name = 'CaduProxyLimitError';
    this.code = code;
  }
}

function decodePathForValidation(rawPath) {
  if (typeof rawPath !== 'string' || rawPath.length > MAX_PATH_LENGTH) return null;

  let decoded = rawPath;
  for (let pass = 0; pass < 4; pass += 1) {
    // Dots, separators, query/hash markers and backslashes never need to be
    // encoded in this route contract. Reject them at every encoding layer.
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

  // A remaining percent means more encoding layers (or an unsupported
  // literal percent). Neither is part of the control-plane route contract.
  if (decoded.includes('%') || decoded.length > MAX_PATH_LENGTH) return null;
  if (CONTROL_CHARACTER.test(decoded) || /[\\?#\s]/u.test(decoded)) return null;
  if (decoded.startsWith('/') || decoded.endsWith('/')) return null;
  return decoded;
}

function safeSegments(rawPath, { allowRoot = false } = {}) {
  if (Array.isArray(rawPath)) return null;
  if (rawPath === '' && allowRoot) return [];
  const decoded = decodePathForValidation(rawPath);
  if (decoded === null || decoded === '') return null;
  const segments = decoded.split('/');
  if (segments.some((segment) => !SAFE_SEGMENT.test(segment) || segment === '.' || segment === '..')) {
    return null;
  }
  return segments;
}

function parseClientQuery(rawQuery, rawPath, allowRoutingPathParam) {
  if (rawQuery === undefined || rawQuery === null || rawQuery === '') {
    return new URLSearchParams();
  }
  if (typeof rawQuery !== 'string' || rawQuery.length > MAX_QUERY_LENGTH
      || CONTROL_CHARACTER.test(rawQuery)) {
    return null;
  }
  const params = new URLSearchParams(rawQuery);
  // Vercel's rewrite adds one routing-only path parameter. Duplicate routing
  // values are ambiguous and query credentials are never accepted.
  const routingPaths = params.getAll('path');
  if (routingPaths.length > 1 || params.has('kc_admin_token') || params.has('token')) {
    return null;
  }
  if (routingPaths.length === 1
      && (!allowRoutingPathParam || routingPaths[0] !== rawPath)) return null;
  params.delete('path');
  return params;
}

function noQuery(params) {
  return Array.from(params.keys()).length === 0 ? new URLSearchParams() : null;
}

function oneIntegerQuery(params, name, minimum, maximum) {
  const keys = Array.from(params.keys());
  if (keys.some((key) => key !== name) || params.getAll(name).length > 1) return null;
  if (!params.has(name)) return new URLSearchParams();
  const raw = params.get(name);
  if (!/^[0-9]+$/u.test(raw || '')) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) return null;
  return new URLSearchParams([[name, String(value)]]);
}

function oneEnumQuery(params, name, allowedValues) {
  const keys = Array.from(params.keys());
  if (keys.some((key) => key !== name) || params.getAll(name).length > 1) return null;
  if (!params.has(name)) return new URLSearchParams();
  const value = params.get(name);
  return allowedValues.includes(value)
    ? new URLSearchParams([[name, value]])
    : null;
}

function pipelineLogQuery(params) {
  const keys = Array.from(params.keys());
  if (keys.some((key) => key !== 'tail' && key !== 'download')) return null;
  if (params.getAll('tail').length > 1 || params.getAll('download').length > 1) return null;
  if (params.has('tail') && params.has('download')) return null;
  if (params.has('download')) {
    return params.get('download') === '1'
      ? new URLSearchParams([['download', '1']])
      : null;
  }
  return oneIntegerQuery(params, 'tail', 1, 1000);
}

function pipelineStreamQuery(params) {
  if (Array.from(params.keys()).some((key) => key !== 'follow')) return null;
  if (!params.has('follow')) return new URLSearchParams();
  if (params.getAll('follow').length !== 1 || params.get('follow') !== 'true') return null;
  return new URLSearchParams([['follow', 'true']]);
}

function openclawMessagesQuery(params) {
  const keys = Array.from(params.keys());
  if (keys.some((key) => key !== 'channel' && key !== 'limit')) return null;
  if (params.getAll('channel').length > 1 || params.getAll('limit').length > 1) return null;

  const normalized = new URLSearchParams();
  if (params.has('channel')) {
    const channel = params.get('channel');
    if (!/^[a-z][a-z0-9_-]{0,31}$/u.test(channel || '')) return null;
    normalized.set('channel', channel);
  }
  if (params.has('limit')) {
    const rawLimit = params.get('limit');
    if (!/^[0-9]+$/u.test(rawLimit || '')) return null;
    const limit = Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) return null;
    normalized.set('limit', String(limit));
  }
  return normalized;
}

function invalid(status, error, allow) {
  return { ok: false, status, error, allow };
}

function validatedRoute(namespace, kind, segments, allowedMethods, query, options = {}) {
  return {
    ok: true,
    namespace,
    kind,
    segments,
    allowedMethods,
    query,
    sse: options.sse === true,
  };
}

function enforceMethod(route, method) {
  if (method === 'OPTIONS') return route;
  if (!route.allowedMethods.includes(method)) {
    return invalid(405, `method_not_allowed_for_cadu_${route.namespace}_path`, route.allowedMethods);
  }
  return route;
}

export function classifyCaduPipelineRequest(rawPath, method, rawQuery = '', options = {}) {
  const segments = safeSegments(rawPath, { allowRoot: true });
  if (!segments) return invalid(400, 'invalid_cadu_pipeline_path');
  const params = parseClientQuery(rawQuery, rawPath, options.allowRoutingPathParam === true);
  if (!params) return invalid(400, 'invalid_cadu_pipeline_query');

  let route = null;
  if (segments.length === 0) {
    const query = noQuery(params);
    if (query) route = validatedRoute('pipeline', 'status', [], ['GET'], query);
  } else if (segments.length === 1 && segments[0] === 'health') {
    const query = noQuery(params);
    if (query) route = validatedRoute('pipeline', 'health', ['health'], ['GET'], query);
  } else if (segments.length === 1 && segments[0] === 'runs') {
    const query = oneIntegerQuery(params, 'limit', 1, 200);
    if (query) route = validatedRoute('pipeline', 'runs', ['runs'], ['GET'], query);
  } else if (segments.length === 1 && segments[0] === 'readiness') {
    const query = noQuery(params);
    if (query) route = validatedRoute('pipeline', 'readiness', ['readiness'], ['GET'], query);
  } else if (segments.length === 1 && segments[0] === 'alert-status') {
    const query = noQuery(params);
    if (query) route = validatedRoute('pipeline', 'alert-status', ['alert-status'], ['GET'], query);
  } else if (segments.length === 1 && segments[0] === 'preflight') {
    const query = oneEnumQuery(params, 'deep', ['0', '1']);
    if (query) route = validatedRoute('pipeline', 'preflight', ['preflight'], ['GET'], query);
  } else if (segments[0] === 'run' && segments.length <= 2) {
    const mode = segments.length === 2 ? segments[1] : null;
    if (mode === null || mode === 'dry-run' || mode === 'real') {
      const query = noQuery(params);
      if (query) route = validatedRoute('pipeline', mode ? `run_${mode}` : 'run', segments, ['POST'], query);
    }
  } else if (segments.length === 1 && SAFE_SEGMENT.test(segments[0])) {
    const query = noQuery(params);
    if (query) route = validatedRoute('pipeline', 'run_detail', segments, ['GET'], query);
  } else if (segments.length === 2 && SAFE_SEGMENT.test(segments[0])) {
    const runId = segments[0];
    const action = segments[1];
    if (action === 'artifacts' || action === 'export') {
      const query = noQuery(params);
      if (query) route = validatedRoute('pipeline', action, [runId, action], ['GET'], query);
    } else if (action === 'log') {
      const query = pipelineLogQuery(params);
      if (query) route = validatedRoute('pipeline', 'log', [runId, 'log'], ['GET'], query);
    } else if (action === 'stream') {
      const query = pipelineStreamQuery(params);
      if (query) route = validatedRoute('pipeline', 'stream', [runId, 'stream'], ['GET'], query, { sse: true });
    } else if (action === 'stop') {
      const query = noQuery(params);
      if (query) route = validatedRoute('pipeline', 'stop', [runId, 'stop'], ['POST'], query);
    }
  }

  if (!route) return invalid(400, 'invalid_cadu_pipeline_request');
  return enforceMethod(route, String(method || '').toUpperCase());
}

export function classifyCaduOpenclawRequest(rawPath, method, rawQuery = '', options = {}) {
  const segments = safeSegments(rawPath);
  if (!segments) return invalid(400, 'invalid_cadu_openclaw_path');
  const params = parseClientQuery(rawQuery, rawPath, options.allowRoutingPathParam === true);
  if (!params) return invalid(400, 'invalid_cadu_openclaw_query');

  let route = null;
  if (segments.length === 1 && (segments[0] === 'context' || segments[0] === 'status')) {
    const query = segments[0] === 'context'
      ? oneEnumQuery(params, 'refresh', ['true', 'false'])
      : noQuery(params);
    if (query) route = validatedRoute('openclaw', segments[0], segments, ['GET'], query);
  } else if (segments.length === 1 && segments[0] === 'sessions') {
    const query = oneIntegerQuery(params, 'limit', 1, 100);
    if (query) route = validatedRoute('openclaw', 'sessions', segments, ['GET'], query);
  } else if (segments.length === 1 && segments[0] === 'messages') {
    const query = openclawMessagesQuery(params);
    if (query) route = validatedRoute('openclaw', 'messages', segments, ['GET'], query);
  } else if (segments.length === 1 && segments[0] === 'logs') {
    const query = oneIntegerQuery(params, 'limit', 1, 500);
    if (query) route = validatedRoute('openclaw', 'logs', segments, ['GET'], query);
  } else if (segments.length === 1 && segments[0] === 'heartbeat') {
    const query = noQuery(params);
    if (query) route = validatedRoute('openclaw', 'heartbeat', segments, ['GET'], query);
  } else if (segments.length === 1 && (segments[0] === 'agent-send' || segments[0] === 'agent-event')) {
    const query = noQuery(params);
    if (query) route = validatedRoute('openclaw', segments[0], segments, ['POST'], query);
  }

  if (!route) return invalid(400, 'invalid_cadu_openclaw_request');
  return enforceMethod(route, String(method || '').toUpperCase());
}

function validatedBaseUrl(apiUrl) {
  const parsed = new URL(String(apiUrl || ''));
  if (!['http:', 'https:'].includes(parsed.protocol)
      || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new TypeError('invalid Cadu API base URL');
  }
  return parsed.toString().replace(/\/+$/u, '');
}

export function buildCaduControlTargetUrl(apiUrl, route) {
  if (!route || route.ok !== true || !['pipeline', 'openclaw'].includes(route.namespace)
      || !Array.isArray(route.segments)
      || route.segments.some((segment) => !SAFE_SEGMENT.test(segment))) {
    throw new TypeError('invalid validated Cadu route');
  }
  const encodedPath = route.segments.map((segment) => encodeURIComponent(segment)).join('/');
  const query = route.query && route.query.toString();
  return `${validatedBaseUrl(apiUrl)}/api/${route.namespace}${encodedPath ? `/${encodedPath}` : ''}${query ? `?${query}` : ''}`;
}

export function extractRawQuery(req) {
  const url = typeof req?.url === 'string' ? req.url : '';
  const marker = url.indexOf('?');
  return marker === -1 ? '' : url.slice(marker + 1);
}

export function extractDirectPipelinePath(req) {
  const url = typeof req?.url === 'string' ? req.url : '';
  const path = url.split('?')[0];
  if (path === '/api/cadu/pipeline' || path === '/api/cadu/pipeline/') return '';
  const prefix = '/api/cadu/pipeline/';
  return path.startsWith(prefix) ? path.slice(prefix.length) : null;
}

function byteLength(value) {
  return Buffer.byteLength(String(value || ''), 'utf8');
}

export async function readLimitedCaduResponse(upstream, maximumBytes = MAX_RESPONSE_BYTES) {
  const lengthHeader = upstream?.headers?.get?.('content-length');
  if (lengthHeader && /^[0-9]+$/u.test(lengthHeader) && Number(lengthHeader) > maximumBytes) {
    throw new CaduProxyLimitError('cadu_api_response_too_large');
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
        if (total > maximumBytes) throw new CaduProxyLimitError('cadu_api_response_too_large');
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      return text;
    } finally {
      try { await reader.cancel(); } catch {}
    }
  }

  const text = await upstream.text();
  if (byteLength(text) > maximumBytes) {
    throw new CaduProxyLimitError('cadu_api_response_too_large');
  }
  return text;
}

function configureControlCors(res) {
  // The admin console uses this proxy same-origin. Deliberately omit
  // Access-Control-Allow-Origin so a leaked bearer cannot be exercised by an
  // arbitrary browser origin.
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function sendError(res, status, error, allow) {
  if (allow) res.setHeader('Allow', [...allow, 'OPTIONS'].join(', '));
  return res.status(status).json({ ok: false, error });
}

function safeUpstreamErrorStatus(upstream) {
  const status = Number(upstream?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 502;
}

async function sanitizedUpstreamFailure(upstream) {
  const status = safeUpstreamErrorStatus(upstream);
  const payload = { ok: false, error: 'cadu_api_error', status };
  let parsed = null;
  try {
    const text = await readLimitedCaduResponse(upstream, MAX_ERROR_RESPONSE_BYTES);
    parsed = text ? JSON.parse(text) : null;
  } catch {}

  // The UI uses this one identifier to point an operator to an already active
  // run after HTTP 409. Preserve only the validated ID, never arbitrary error
  // text, stack traces, stderr, tokens or sibling fields from the upstream.
  const existingRunId = parsed?.detail?.existing_run_id ?? parsed?.existing_run_id;
  if (status === 409 && typeof existingRunId === 'string' && SAFE_SEGMENT.test(existingRunId)) {
    payload.detail = { existing_run_id: existingRunId };
  }
  const errorCode = parsed?.detail?.code ?? parsed?.code;
  if (typeof errorCode === 'string' && SAFE_UPSTREAM_ERROR_STATUS.get(errorCode) === status) {
    payload.detail = { ...(payload.detail || {}), code: errorCode };
  }
  return { status, payload };
}

function serializeRequestBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.body === undefined) return undefined;
  let body;
  try {
    body = JSON.stringify(req.body);
  } catch {
    throw new CaduProxyLimitError('invalid_cadu_request_body');
  }
  if (byteLength(body) > MAX_REQUEST_BYTES) {
    throw new CaduProxyLimitError('cadu_request_body_too_large');
  }
  return body;
}

function stableProxyFailure(res, error) {
  if (error?.code === 'cadu_api_response_too_large') {
    return sendError(res, 502, error.code);
  }
  if (error?.code === 'cadu_request_body_too_large') {
    return sendError(res, 413, error.code);
  }
  if (error?.code === 'invalid_cadu_request_body') {
    return sendError(res, 422, error.code);
  }
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return sendError(res, 504, 'cadu_api_timeout');
  }
  return sendError(res, 502, 'cadu_api_unreachable');
}

async function proxyNonStream(req, res, route, targetUrl, token) {
  const body = serializeRequestBody(req);
  const upstream = await fetchCaduUpstream(targetUrl, {
    method: req.method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      Accept: route.kind === 'log' && route.query.get('download') === '1'
        ? 'text/plain'
        : 'application/json',
    },
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(route.kind === 'agent-send' ? AGENT_SEND_TIMEOUT_MS : NON_STREAM_TIMEOUT_MS),
  }, {
    operation: `control.${route.namespace}.${route.kind}`,
  });
  if (!upstream.ok) {
    const failure = await sanitizedUpstreamFailure(upstream);
    return res.status(failure.status).json(failure.payload);
  }
  const responseBody = await readLimitedCaduResponse(upstream);
  const contentType = upstream.headers.get('content-type') || 'application/json';
  return res.status(upstream.status).setHeader('Content-Type', contentType).send(responseBody);
}

async function proxyPipelineSse(req, res, route, targetUrl, token) {
  const upstreamController = new AbortController();
  const abortUpstream = () => upstreamController.abort();
  const timeoutId = setTimeout(abortUpstream, SSE_TIMEOUT_MS);
  req.once('aborted', abortUpstream);
  res.once('close', abortUpstream);
  let reader = null;
  let streamStarted = false;
  try {
    const upstream = await fetchCaduUpstream(targetUrl, {
      method: 'GET',
      signal: upstreamController.signal,
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    }, {
      operation: `control.${route.namespace}.${route.kind}`,
    });
    const contentType = upstream.headers?.get?.('content-type') || '';
    if (!upstream.ok || !contentType.toLowerCase().startsWith('text/event-stream')
        || !upstream.body || typeof upstream.body.getReader !== 'function') {
      try { await upstream.body?.cancel?.(); } catch {}
      if (!res.writableEnded && !res.destroyed) {
        return res.status(upstream.ok ? 502 : safeUpstreamErrorStatus(upstream)).json({
          ok: false,
          error: 'cadu_api_error',
        });
      }
      return undefined;
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    streamStarted = true;

    reader = upstream.body.getReader();
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_SSE_BYTES) throw new CaduProxyLimitError('cadu_api_stream_too_large');
      res.write(value);
    }
    return undefined;
  } finally {
    clearTimeout(timeoutId);
    if (reader) {
      try { await reader.cancel(); } catch {}
    }
    req.off('aborted', abortUpstream);
    res.off('close', abortUpstream);
    abortUpstream();
    if (streamStarted && !res.writableEnded && !res.destroyed) res.end();
  }
}

async function requireControlAdmin(req, res) {
  try {
    return await requireCaduAdmin(req, res);
  } catch {
    sendError(res, 502, 'admin_auth_unreachable');
    return null;
  }
}

async function handleControlRequest(req, res, route) {
  configureControlCors(res);
  if (!route.ok) return sendError(res, route.status, route.error, route.allow);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const admin = await requireControlAdmin(req, res);
  if (!admin) return undefined;

  const apiUrl = typeof process.env.CADU_API_URL === 'string' ? process.env.CADU_API_URL.trim() : '';
  const token = normalizeCaduApiToken(process.env.CADU_API_TOKEN);
  if (!apiUrl || !token) return sendError(res, 503, 'cadu_api_not_configured');

  let targetUrl;
  try {
    targetUrl = buildCaduControlTargetUrl(apiUrl, route);
  } catch {
    return sendError(res, 503, 'cadu_api_not_configured');
  }

  try {
    if (route.sse) return await proxyPipelineSse(req, res, route, targetUrl, token);
    return await proxyNonStream(req, res, route, targetUrl, token);
  } catch (error) {
    // Once SSE headers have been flushed, the only safe failure behavior is
    // to close the stream. Rewriting the status/body would corrupt the wire
    // response and can trigger ERR_HTTP_HEADERS_SENT in Node.
    if (res.headersSent || res.writableEnded || res.destroyed) return undefined;
    return stableProxyFailure(res, error);
  }
}

export async function handleCaduPipelineProxy(req, res, rawPath, options = {}) {
  const route = classifyCaduPipelineRequest(rawPath, req.method, extractRawQuery(req), options);
  return handleControlRequest(req, res, route);
}

export async function handleCaduOpenclawProxy(req, res, rawPath, options = {}) {
  const route = classifyCaduOpenclawRequest(rawPath, req.method, extractRawQuery(req), options);
  return handleControlRequest(req, res, route);
}

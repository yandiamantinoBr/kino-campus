import { Agent } from 'undici';

const CADU_FAMILY_ATTEMPT_TIMEOUT_MS = 250;
const SAFE_LOG_IDENTIFIER = /^[A-Za-z0-9_.:-]{1,96}$/u;
const MAX_CAUSE_NODES = 8;

function safeLogIdentifier(value, fallback = 'unknown') {
  return typeof value === 'string' && SAFE_LOG_IDENTIFIER.test(value)
    ? value
    : fallback;
}

function safeProperty(value, property) {
  try {
    return value && typeof value === 'object' ? value[property] : undefined;
  } catch {
    return undefined;
  }
}

function collectCauseCodes(error) {
  const firstCause = safeProperty(error, 'cause');
  const queue = firstCause ? [firstCause] : [];
  const seen = new Set();
  const codes = [];

  while (queue.length > 0 && seen.size < MAX_CAUSE_NODES) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);

    const code = safeLogIdentifier(safeProperty(current, 'code'), '');
    if (code && !codes.includes(code)) codes.push(code);

    const nestedCause = safeProperty(current, 'cause');
    if (nestedCause) queue.push(nestedCause);

    const aggregateErrors = safeProperty(current, 'errors');
    if (Array.isArray(aggregateErrors)) {
      queue.push(...aggregateErrors.slice(0, MAX_CAUSE_NODES - seen.size));
    }
  }

  return codes;
}

function logCaduTransportFailure(error, operation, method, startedAt) {
  const cause = safeProperty(error, 'cause');
  const causeCodes = collectCauseCodes(error);
  const event = {
    event: 'cadu_upstream_fetch_error',
    operation: safeLogIdentifier(operation),
    method: safeLogIdentifier(String(method || 'GET').toUpperCase()),
    duration_ms: Math.max(0, Date.now() - startedAt),
    error_name: safeLogIdentifier(safeProperty(error, 'name')),
    error_code: safeLogIdentifier(safeProperty(error, 'code'), 'none'),
    cause_name: safeLogIdentifier(safeProperty(cause, 'name'), 'none'),
    cause_code: causeCodes[0] || 'none',
  };
  if (causeCodes.length > 1) event.cause_codes = causeCodes;

  // Do not let telemetry alter proxy behavior. Deliberately omit URL, headers,
  // request body, error messages and stacks because they may contain secrets.
  try {
    console.error(JSON.stringify(event));
  } catch {}
}

export function createCaduUpstreamDispatcher(options = {}) {
  const lookup = typeof options.lookup === 'function' ? options.lookup : undefined;
  // Address-family racing happens while opening the socket, before HTTP bytes
  // are sent. Do not add request retries here: Cadu includes writes and SSE.
  return new Agent({
    autoSelectFamily: true,
    autoSelectFamilyAttemptTimeout: CADU_FAMILY_ATTEMPT_TIMEOUT_MS,
    ...(lookup ? { connect: { lookup } } : {}),
  });
}

const caduUpstreamDispatcher = createCaduUpstreamDispatcher();

export async function fetchCaduUpstream(resource, init = {}, options = {}) {
  const startedAt = Date.now();
  try {
    // Resolve fetch at call time so route tests and runtime instrumentation can
    // wrap it without replacing this Cadu-only dispatcher.
    return await globalThis.fetch(resource, {
      ...init,
      dispatcher: caduUpstreamDispatcher,
    });
  } catch (error) {
    logCaduTransportFailure(error, options.operation, init.method, startedAt);
    throw error;
  }
}

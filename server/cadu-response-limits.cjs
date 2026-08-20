'use strict';

const DEFAULT_MAX_CADU_RESPONSE_BYTES = 4 * 1024 * 1024;

class CaduProxyLimitError extends Error {
  constructor(code = 'cadu_api_response_too_large') {
    super(code);
    this.name = 'CaduProxyLimitError';
    this.code = code;
  }
}

function byteLength(value) {
  return Buffer.byteLength(String(value || ''), 'utf8');
}

// Stream when the runtime provides a reader so an upstream cannot force the
// serverless function to buffer an arbitrary response before it is rejected.
// The text fallback remains for the small response doubles used by tests and
// older Fetch implementations.
async function readLimitedCaduResponse(
  upstream,
  maximumBytes = DEFAULT_MAX_CADU_RESPONSE_BYTES,
) {
  const limit = Number.isSafeInteger(maximumBytes) && maximumBytes > 0
    ? maximumBytes
    : DEFAULT_MAX_CADU_RESPONSE_BYTES;
  const lengthHeader = upstream?.headers?.get?.('content-length');
  if (lengthHeader && /^[0-9]+$/u.test(lengthHeader) && Number(lengthHeader) > limit) {
    throw new CaduProxyLimitError();
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
        if (total > limit) throw new CaduProxyLimitError();
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      return text;
    } finally {
      try { await reader.cancel(); } catch {}
    }
  }

  const text = await upstream.text();
  if (byteLength(text) > limit) throw new CaduProxyLimitError();
  return text;
}

function parseCaduJson(text) {
  try {
    return { ok: true, value: text ? JSON.parse(text) : null };
  } catch {
    return { ok: false, value: null };
  }
}

function stableCaduTransportFailure(error) {
  if (error?.code === 'cadu_api_response_too_large') {
    return { status: 502, error: 'cadu_api_response_too_large' };
  }
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return { status: 504, error: 'cadu_api_timeout' };
  }
  return { status: 502, error: 'cadu_api_unreachable' };
}

module.exports = {
  CaduProxyLimitError,
  MAX_CADU_ERROR_RESPONSE_BYTES: 64 * 1024,
  MAX_CADU_RESPONSE_BYTES: DEFAULT_MAX_CADU_RESPONSE_BYTES,
  parseCaduJson,
  readLimitedCaduResponse,
  stableCaduTransportFailure,
};

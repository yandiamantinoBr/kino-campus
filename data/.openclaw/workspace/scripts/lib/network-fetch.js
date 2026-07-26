// network-fetch.js
// Helper de HTTP fetch com retry/circuit breaker para blips de rede.
//
// Blips de DNS, timeouts curtos e 5xx transientes sao comuns em ambientes
// de datacenter compartilhado (VPS Hostinger, Supabase Cloud). Antes, qualquer
// network_error matava a pipeline inteira (curador falhava em "cache publicado:
// pagina 1 falhou (network_error)" e o scan IG perdia todos os 76 perfis
// com `net::ERR_NAME_NOT_RESOLVED`).
//
// Este helper expoe fetchWithRetry() que faz exponential backoff com jitter
// e classifica erros como retryable ou nao. Usado em:
//   - cadu-curador-v4.4.js: fetchPublishedPostsPage + fetchUrlResult
//   - pipeline-kino.js:     fetchPublishedUrlPage
//   - scan-ig-browser.js:   wrapper de page.goto com retry
//
// Configuracao via env:
//   CADU_FETCH_MAX_ATTEMPTS  (default 4)
//   CADU_FETCH_BACKOFF_MS    (default 1000)
//   CADU_FETCH_BACKOFF_CAP   (default 30000)
//   CADU_FETCH_JITTER_PCT    (default 20)

'use strict';

const https = require('https');
const http = require('http');

const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BACKOFF_MS = 1000;
const DEFAULT_BACKOFF_CAP_MS = 30000;
const DEFAULT_JITTER_PCT = 20;
const HTTP_TIMEOUT_MS = 12000;
const HTTP_MAX_BODY_BYTES = 16 * 1024 * 1024;

const RETRYABLE_ERROR_KINDS = new Set([
  'network_error',
  'timeout',
  'tls_chain_error',
  'dns_error',
  'connect_error',
  'http_408',
  'http_425',
  'http_429',
  'http_500',
  'http_502',
  'http_503',
  'http_504',
]);

const NON_RETRYABLE_ERROR_KINDS = new Set([
  'http_400',
  'http_401',
  'http_403',
  'http_404',
  'http_410',
  'http_422',
  'response_too_large',
  'invalid_json_or_range',
]);

function getConfig() {
  const cfg = {
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    backoffBaseMs: DEFAULT_BACKOFF_MS,
    backoffCapMs: DEFAULT_BACKOFF_CAP_MS,
    jitterPct: DEFAULT_JITTER_PCT,
  };
  const envAttempts = Number(process.env.CADU_FETCH_MAX_ATTEMPTS);
  if (Number.isInteger(envAttempts) && envAttempts >= 1 && envAttempts <= 20) {
    cfg.maxAttempts = envAttempts;
  }
  const envBackoff = Number(process.env.CADU_FETCH_BACKOFF_MS);
  if (Number.isFinite(envBackoff) && envBackoff >= 100 && envBackoff <= 60000) {
    cfg.backoffBaseMs = envBackoff;
  }
  const envCap = Number(process.env.CADU_FETCH_BACKOFF_CAP);
  if (Number.isFinite(envCap) && envCap >= 1000 && envCap <= 120000) {
    cfg.backoffCapMs = envCap;
  }
  const envJitter = Number(process.env.CADU_FETCH_JITTER_PCT);
  if (Number.isFinite(envJitter) && envJitter >= 0 && envJitter <= 100) {
    cfg.jitterPct = envJitter;
  }
  return cfg;
}

function classifyHttpsError(err) {
  if (!err) return 'network_error';
  const code = err.code || err.cause?.code || '';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ESERVFAIL') {
    return 'dns_error';
  }
  if (code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'EPIPE' ||
      code === 'ETIMEDOUT' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
    return 'connect_error';
  }
  if (code === 'CERT_HAS_EXPIRED' || code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
      code === 'SELF_SIGNED_CERT_IN_CHAIN' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
      code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
    return 'tls_chain_error';
  }
  return 'network_error';
}

function httpStatusToKind(status) {
  if (typeof status !== 'number' || status < 100) return 'network_error';
  if (status >= 500) return `http_${status}`;
  if (status === 408 || status === 425 || status === 429) return `http_${status}`;
  if (status >= 400) return `http_${status}`;
  return null;
}

function isRetryable(kind) {
  if (!kind) return false;
  return RETRYABLE_ERROR_KINDS.has(kind) && !NON_RETRYABLE_ERROR_KINDS.has(kind);
}

function computeBackoffMs(attempt, cfg) {
  // attempt e' 0-indexed: attempt=0 (primeira falha) -> cfg.backoffBaseMs
  const base = Math.min(cfg.backoffBaseMs * (2 ** attempt), cfg.backoffCapMs);
  const jitterRange = base * (cfg.jitterPct / 100);
  const jitter = (Math.random() * 2 - 1) * jitterRange;
  return Math.max(100, Math.floor(base + jitter));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rawHttpGet(url, options = {}) {
  const lib = url.startsWith('https:') ? https : http;
  const timeout = options.timeoutMs || HTTP_TIMEOUT_MS;
  const headers = options.headers || {};
  return new Promise((resolve) => {
    let oversized = false;
    const req = lib.get(url, { headers, timeout }, (res) => {
      let body = '';
      let bodyBytes = 0;
      res.on('data', (chunk) => {
        bodyBytes += Buffer.byteLength(chunk);
        if (bodyBytes > HTTP_MAX_BODY_BYTES) {
          oversized = true;
          req.destroy();
          return;
        }
        body += chunk;
      });
      res.on('end', () => {
        if (oversized) {
          resolve({ ok: false, status: null, body: '', headers: {}, error: 'response_too_large' });
          return;
        }
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          body,
          headers: res.headers,
          error: null,
        });
      });
    });
    req.on('error', (err) => {
      resolve({
        ok: false,
        status: null,
        body: '',
        headers: {},
        error: classifyHttpsError(err),
        rawError: err?.code || err?.message || 'unknown',
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: null, body: '', headers: {}, error: 'timeout' });
    });
  });
}

/**
 * fetchWithRetry - HTTP GET com retry automatico e exponential backoff.
 *
 * @param {string} url
 * @param {object} options
 *   - headers: object com headers adicionais
 *   - timeoutMs: per-attempt timeout
 *   - maxAttempts: override do env (default 4)
 *   - backoffMs: override do env (default 1000)
 *   - backoffCapMs: override do env (default 30000)
 *   - jitterPct: override do env (default 20)
 *   - onRetry: callback(attempt, kind, error, backoffMs) chamado em cada retry
 *
 * @returns {Promise<{ok: boolean, status: number, body: string, headers: object, attempts: number, error: string|null, kind: string|null}>}
 */
async function fetchWithRetry(url, options = {}) {
  const cfg = {
    ...getConfig(),
    ...(Number.isInteger(options.maxAttempts) ? { maxAttempts: options.maxAttempts } : {}),
    ...(Number.isFinite(options.backoffMs) ? { backoffBaseMs: options.backoffMs } : {}),
    ...(Number.isFinite(options.backoffCapMs) ? { backoffCapMs: options.backoffCapMs } : {}),
    ...(Number.isFinite(options.jitterPct) ? { jitterPct: options.jitterPct } : {}),
  };
  const headers = options.headers || {};
  const timeoutMs = options.timeoutMs || HTTP_TIMEOUT_MS;
  const onRetry = typeof options.onRetry === 'function' ? options.onRetry : null;

  let attempt = 0;
  let lastResult = null;
  while (attempt < cfg.maxAttempts) {
    const result = await rawHttpGet(url, { headers, timeoutMs });
    if (result.ok) {
      return { ...result, attempts: attempt + 1, kind: null };
    }
    const kind = result.error || (result.status ? httpStatusToKind(result.status) : 'network_error');
    const retryable = isRetryable(kind);
    lastResult = { ...result, kind, retryable };
    if (!retryable) {
      return { ...lastResult, attempts: attempt + 1 };
    }
    attempt += 1;
    if (attempt >= cfg.maxAttempts) {
      return { ...lastResult, attempts: attempt };
    }
    const backoff = computeBackoffMs(attempt - 1, cfg);
    if (onRetry) {
      try { onRetry(attempt, kind, lastResult.rawError, backoff); } catch (_) { /* swallow */ }
    }
    await sleep(backoff);
  }
  return { ...lastResult, attempts: cfg.maxAttempts };
}

/**
 * pageGotoWithRetry - wrapper de Playwright page.goto() com retry.
 *
 * Detecta `net::ERR_NAME_NOT_RESOLVED`, `net::ERR_CONNECTION_RESET`,
 * `net::ERR_TIMED_OUT` e outros erros transientes do Chromium.
 */
async function pageGotoWithRetry(page, url, options = {}) {
  const cfg = getConfig();
  const maxAttempts = options.maxAttempts || cfg.maxAttempts;
  const backoffMs = options.backoffMs || cfg.backoffBaseMs;
  const onRetry = typeof options.onRetry === 'function' ? options.onRetry : null;
  const gotoOptions = options.gotoOptions || { waitUntil: 'domcontentloaded', timeout: 30000 };

  let attempt = 0;
  let lastErr = null;
  while (attempt < maxAttempts) {
    try {
      const response = await page.goto(url, gotoOptions);
      return { ok: true, response, attempts: attempt + 1, error: null };
    } catch (err) {
      lastErr = err;
      const msg = String(err && err.message || err);
      const isRetryable = /ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_RESET|ERR_CONNECTION_REFUSED|ERR_TIMED_OUT|ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED|ERR_PROXY_CONNECTION|net::ERR_ABORTED|TimeoutError/i.test(msg);
      if (!isRetryable) {
        return { ok: false, error: msg, attempts: attempt + 1 };
      }
      attempt += 1;
      if (attempt >= maxAttempts) {
        return { ok: false, error: msg, attempts: attempt };
      }
      const backoff = Math.min(backoffMs * (2 ** (attempt - 1)), cfg.backoffCapMs);
      if (onRetry) {
        try { onRetry(attempt, msg, backoff); } catch (_) { /* swallow */ }
      }
      await sleep(backoff);
    }
  }
  return { ok: false, error: lastErr ? String(lastErr.message || lastErr) : 'unknown', attempts: maxAttempts };
}

/**
 * retryOnNetworkError - wrapper generico de qualquer funcao async com retry.
 *
 * Detecta erros de rede transientes (string match contra patterns Chromium,
 * DNS, e codigos Node) e retenta com exponential backoff + jitter.
 *
 * @param {Function} attemptFn  - () => Promise<{ok: boolean, error?: string}>
 * @param {object} options
 *   - maxAttempts: numero maximo de tentativas (default 4)
 *   - backoffMs: backoff base (default 1000)
 *   - backoffCapMs: cap do backoff (default 30000)
 *   - jitterPct: % de jitter (default 20)
 *   - onRetry: callback(attempt, errMsg, backoffMs)
 *   - isRetryable: optional custom predicate
 */
async function retryOnNetworkError(attemptFn, options = {}) {
  const cfg = getConfig();
  const maxAttempts = options.maxAttempts || cfg.maxAttempts;
  const backoffMs = options.backoffMs || cfg.backoffBaseMs;
  const backoffCapMs = options.backoffCapMs || cfg.backoffCapMs;
  const jitterPct = options.jitterPct || cfg.jitterPct;
  const onRetry = typeof options.onRetry === 'function' ? options.onRetry : null;
  const customIsRetryable = typeof options.isRetryable === 'function' ? options.isRetryable : null;

  let attempt = 0;
  let lastResult = null;
  while (attempt < maxAttempts) {
    let result;
    try {
      result = await attemptFn();
    } catch (err) {
      result = { ok: false, error: String(err && err.message || err) };
    }
    if (result && result.ok) {
      return { ...result, attempts: attempt + 1 };
    }
    lastResult = result || { ok: false, error: 'unknown' };
    const errMsg = String(lastResult.error || '');
    const isRetryable = customIsRetryable
      ? customIsRetryable(errMsg, lastResult)
      : /ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_RESET|ERR_CONNECTION_REFUSED|ERR_TIMED_OUT|ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED|ERR_PROXY_CONNECTION|net::ERR_ABORTED|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|TimeoutError|timeout|network_error/i.test(errMsg);
    if (!isRetryable) {
      return { ...lastResult, attempts: attempt + 1 };
    }
    attempt += 1;
    if (attempt >= maxAttempts) {
      return { ...lastResult, attempts: attempt };
    }
    const base = Math.min(backoffMs * (2 ** (attempt - 1)), backoffCapMs);
    const jitterRange = base * (jitterPct / 100);
    const jitter = (Math.random() * 2 - 1) * jitterRange;
    const backoff = Math.max(100, Math.floor(base + jitter));
    if (onRetry) {
      try { onRetry(attempt, errMsg, backoff); } catch (_) { /* swallow */ }
    }
    await sleep(backoff);
  }
  return { ...lastResult, attempts: maxAttempts };
}

module.exports = {
  fetchWithRetry,
  pageGotoWithRetry,
  retryOnNetworkError,
  classifyHttpsError,
  httpStatusToKind,
  isRetryable,
  computeBackoffMs,
  getConfig,
  RETRYABLE_ERROR_KINDS,
  NON_RETRYABLE_ERROR_KINDS,
};

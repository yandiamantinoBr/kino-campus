#!/usr/bin/env node
/**
 * formatador-ia.js — Gera descrições ricas para posts do Kino Campus
 * 
 * Recebe itens do curador (JSON) e usa DeepSeek para formatar
 * cada item com: emojis de lead, negrito markdown, datas, público-alvo,
 * requisitos, CTAs, contato.
 *
 * Fluxo: itens crus → formatação IA → publish_auto_v5 → endpoint
 *
 * Uso:
 *   node scripts/formatador-ia.js curadoria-v4-daily-2026-05-31.json
 *   node scripts/formatador-ia.js --stdin              (lê do stdin)
 *   node scripts/formatador-ia.js --item '{...}'        (item único JSON)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { writeJsonAtomic } = require('./lib/atomic-json-file.js');
const {
  collectAllowedUrls,
  descriptionUrls,
  ensureQuality,
  normalizeHttpUrl,
} = require('./lib/quality-gate.js');
const { resolveActionLabel } = require('./lib/curator-action-policy.js');
const {
  isKnownPlaceholderImageUrl,
  normalizeImageUrl,
} = require('./lib/image-utils.js');

// ============================================================
// CONFIG
// ============================================================

function loadEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf8');
    content.split(/\r?\n/).forEach((line) => {
      // Never load commented-out credentials.
      if (/^\s*#/.test(line)) return;
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) return;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    });
  } catch (_) {}
}

[
  path.join(process.cwd(), '.env.local'),
  '/data/.openclaw/workspace/kino-campus/services/cadu-ufg-publisher/.env.local',
].forEach(loadEnvFile);

// ---- API de texto DeepSeek-only ----
// 2026-08-25: switched default to deepseek-v4-flash-vision-exp (V4-Flash
// Vision Exp, 21/ago/2026) with reasoning_effort=max. The Vision Exp model
// inherits V4-Flash text capabilities and adds image input; we do not send
// images from the formatter, but its larger reasoning budget produces more
// stable Portuguese descriptions for the UFG pipeline.
// Old text-only models are kept in ALLOWED_DEEPSEEK_MODELS as a defensive
// fallback so an operator can roll back via env var without a code change.
const DEFAULT_DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash-vision-exp';
const ALLOWED_DEEPSEEK_MODELS = new Set([
  'deepseek-v4-flash-vision-exp',
  'deepseek-v4-flash',
  'deepseek-v4-pro',
]);

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function resolveDeepSeekEndpoint(value = DEFAULT_DEEPSEEK_ENDPOINT) {
  let endpoint;
  try {
    endpoint = new URL(String(value || '').trim());
  } catch (_) {
    throw new Error('DeepSeek endpoint must be a valid URL');
  }
  if (endpoint.protocol !== 'https:'
      || endpoint.hostname !== 'api.deepseek.com'
      || endpoint.port
      || endpoint.username
      || endpoint.password) {
    throw new Error('DeepSeek endpoint must use https://api.deepseek.com');
  }
  if (!['/chat/completions', '/v1/chat/completions'].includes(endpoint.pathname.replace(/\/+$/, ''))) {
    throw new Error('DeepSeek endpoint must target /v1/chat/completions');
  }
  endpoint.pathname = '/v1/chat/completions';
  endpoint.search = '';
  endpoint.hash = '';
  return endpoint.toString();
}

function resolveDeepSeekModel(value = DEFAULT_DEEPSEEK_MODEL) {
  const model = String(value || '').trim() || DEFAULT_DEEPSEEK_MODEL;
  if (!ALLOWED_DEEPSEEK_MODELS.has(model)) {
    throw new Error('DeepSeek model must be deepseek-v4-flash-vision-exp, deepseek-v4-flash, or deepseek-v4-pro');
  }
  return model;
}

function resolveTextProviderConfig(env = process.env) {
  const apiKey = firstNonEmpty(
    env.CADU_DEEPSEEK_API_KEY,
    env.DEEPSEEK_API_KEY,
  );
  const apiUrl = resolveDeepSeekEndpoint(firstNonEmpty(
    env.CADU_DEEPSEEK_ENDPOINT,
    env.CADU_AI_ENDPOINT,
    DEFAULT_DEEPSEEK_ENDPOINT,
  ));
  const model = resolveDeepSeekModel(firstNonEmpty(
    env.CADU_DEEPSEEK_MODEL,
    env.DEEPSEEK_MODEL,
    env.CADU_AI_MODEL,
    DEFAULT_DEEPSEEK_MODEL,
  ));
  return { apiKey, apiUrl, model };
}

const { apiKey: API_KEY, apiUrl: API_URL, model: MODEL } = resolveTextProviderConfig();

function providerMetadata(apiUrl = API_URL, model = MODEL) {
  let host = 'invalid';
  try { host = new URL(apiUrl).hostname.toLowerCase(); } catch (_) {}
  return { provider: 'deepseek', providerHost: host, model: String(model || 'unknown').slice(0, 160) };
}

const PROVIDER = providerMetadata();

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

function providerRuntimeConfig(env = process.env) {
  return {
    // Absolute wall-clock ceiling: operators may shorten it, but never extend
    // a single formatter attempt past the reviewed 120-second maximum.
    requestTimeoutMs: boundedInteger(env.CADU_FORMATTER_REQUEST_TIMEOUT_MS, 120000, 5000, 120000),
    maxRetries: boundedInteger(env.CADU_FORMATTER_MAX_RETRIES, 5, 1, 5),
  };
}

const PROVIDER_RUNTIME = providerRuntimeConfig();

function resolveReasoningEffort(value = 'max') {
  // Vision Exp accepts 'low' | 'high' | 'max'. The default is 'max' per the
  // operator policy; CADU_REASONING_EFFORT / CADU_DEEPSEEK_REASONING_EFFORT
  // env vars let an operator dial it down for cost control without a code
  // change. The legacy 'disabled' (thinking:off) path is not valid for
  // Vision Exp because DeepSeek only reasons at the chosen level; we drop
  // the parameter only when the operator explicitly sets it to 'off' or
  // 'disabled', keeping the door open for a fast path on trivial batches.
  const raw = String(value || '').trim().toLowerCase();
  if (raw === '' || raw === 'max') return { thinking: { type: 'enabled' }, reasoning_effort: 'max' };
  if (raw === 'high') return { thinking: { type: 'enabled' }, reasoning_effort: 'high' };
  if (raw === 'low') return { thinking: { type: 'enabled' }, reasoning_effort: 'low' };
  if (raw === 'off' || raw === 'disabled') return { thinking: { type: 'disabled' } };
  throw new Error('Reasoning effort must be low|high|max|off');
}

function buildProviderPayload(messages, model = MODEL, reasoningEffort = process.env.CADU_REASONING_EFFORT || process.env.CADU_DEEPSEEK_REASONING_EFFORT) {
  // 2026-08-25: V4-Flash Vision Exp runs in "thinking" mode with
  // reasoning_effort=max. The model produces a <think> block followed by
  // JSON content; stripReasoning() cleans it up before JSON.parse runs.
  // The max_tokens ceiling is raised so the rich-thinking tail fits inside
  // the response envelope (Vision Exp supports 384K output).
  // Cache the stable first message (system prompt + stable preamble) on
  // DeepSeek's ephemeral cache so the cost is ~1/50 of cache-miss on every
  // call after the first within a run.
  const messagesWithCache = Array.isArray(messages) && messages.length > 0
    ? messages.map((message, index) => (
        index === 0
          ? { ...message, cache_control: { type: 'ephemeral' } }
          : message
      ))
    : messages;
  const reasoning = resolveReasoningEffort(reasoningEffort);
  const payload = {
    model: resolveDeepSeekModel(model),
    messages: messagesWithCache,
    temperature: 0.4,
    max_tokens: 16000,
    ...reasoning,
    response_format: { type: 'json_object' },
  };
  return payload;
}

// ============================================================
// HELPERS
// ============================================================

function stripReasoning(content) {
  if (!content) return '';
  // Remove reasoning blocks if the response contains them.
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^[\s\n]+/, '')
    .trim();
}

function parseFormatterResponse(response) {
  if (typeof response !== 'string' || !response.trim()) {
    throw new Error('formatter_response_empty');
  }

  let parsed;
  try {
    parsed = JSON.parse(response.trim());
  } catch (_) {
    throw new Error('formatter_response_invalid_json');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('formatter_response_not_object');
  }
  if (typeof parsed.formattedTitle !== 'string' || !parsed.formattedTitle.trim()) {
    throw new Error('formatter_response_invalid_title');
  }
  if (typeof parsed.formattedDescription !== 'string' || !parsed.formattedDescription.trim()) {
    throw new Error('formatter_response_invalid_description');
  }

  return {
    formattedTitle: parsed.formattedTitle.trim().slice(0, 120),
    formattedDescription: parsed.formattedDescription.trim(),
  };
}

const CONTRACT_FAILURE_CODES = Object.freeze({
  formatter_response_empty: 'response_empty',
  formatter_response_invalid_json: 'response_invalid_json',
  formatter_response_not_object: 'response_not_object',
  formatter_response_invalid_title: 'response_invalid_title',
  formatter_response_invalid_description: 'response_invalid_description',
});

function formatterFailure(code, metadata = {}, diagnostic = code) {
  return Object.assign(new Error(diagnostic), { formatCode: code, ...metadata });
}

function normalizeImageCandidates(candidates, limit = 6) {
  const seen = new Set();
  return (Array.isArray(candidates) ? candidates : [])
    .filter(value => typeof value === 'string' && value.trim())
    .filter(value => !isKnownPlaceholderImageUrl(value))
    .map(value => normalizeImageUrl(value))
    .filter(value => /^https?:\/\//i.test(value) && !/\.svg(?:$|[?#])/i.test(value))
    .filter(value => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .slice(0, limit);
}

function normalizedFormatterMedia(item) {
  const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
  const galleryImages = normalizeImageCandidates([
    ...(Array.isArray(source.galleryImages) ? source.galleryImages : []),
    source.igMatch?.image,
  ]);
  const images = normalizeImageCandidates([
    source.image,
    source.imageUrl,
    source.image_url,
    source.cover,
    ...(Array.isArray(source.images) ? source.images : []),
    ...galleryImages,
  ]);
  return { images, galleryImages };
}

function normalizeFormatFailure(error, provider = PROVIDER) {
  const raw = String(error?.message || error || 'formatter failure');
  const statusMatch = raw.match(/\bHTTP\s+(\d{3})\b/i);
  const explicitStatus = Number.isInteger(error?.httpStatus)
    && error.httpStatus >= 100 && error.httpStatus <= 599
    ? error.httpStatus
    : null;
  const httpStatus = explicitStatus ?? (statusMatch ? Number(statusMatch[1]) : null);
  const explicitCode = typeof error?.formatCode === 'string'
    && /^[a-z][a-z0-9_]{1,79}$/.test(error.formatCode)
    ? error.formatCode
    : null;
  const code = explicitCode
    || CONTRACT_FAILURE_CODES[raw]
    || (httpStatus ? `http_${httpStatus}` : null)
    || (/rate.?limit/i.test(raw) ? 'rate_limit' : null)
    || (/timeout/i.test(raw) ? 'transport_timeout' : null)
    || (/\bHTTP\s+0\b|econnreset|enotfound|socket hang up/i.test(raw) ? 'transport_error' : null)
    || (/API_KEY ausente/i.test(raw) ? 'credentials_missing' : 'provider_error');
  const safeMessages = {
    credentials_missing: 'Provider credentials are missing',
    rate_limit: 'Provider rate limit exhausted',
    transport_timeout: 'Provider request timed out',
    transport_error: 'Provider transport failed',
    provider_envelope_invalid_json: 'Provider returned an invalid response envelope',
    provider_envelope_missing_choices: 'Provider response did not contain a completion choice',
    response_empty: 'Provider returned empty formatter content',
    response_invalid_json: 'Provider returned invalid formatter JSON',
    response_not_object: 'Provider formatter JSON was not an object',
    response_invalid_title: 'Provider formatter JSON did not contain a valid title',
    response_invalid_description: 'Provider formatter JSON did not contain a valid description',
    response_truncated: 'Provider formatter response was truncated',
    provider_insufficient_system_resource: 'Provider reported insufficient inference resources',
    content_filtered: 'Provider filtered the formatter response',
    provider_error: 'Provider request failed',
  };
  const message = safeMessages[code]
    || (httpStatus ? `Provider returned HTTP ${httpStatus}` : 'Provider request failed');
  const failure = { ...provider, code, httpStatus, message };
  if (['credentials', 'transport', 'provider_envelope', 'content_contract', 'http'].includes(error?.phase)) {
    failure.phase = error.phase;
  }
  if (Number.isSafeInteger(error?.attempts) && error.attempts >= 1 && error.attempts <= 50) {
    failure.attempts = error.attempts;
  }
  if (typeof error?.finishReason === 'string' && /^[a-z_]{1,64}$/.test(error.finishReason)) {
    failure.finishReason = error.finishReason;
  }
  if (['absolute', 'socket'].includes(error?.timeoutType)) {
    failure.timeoutType = error.timeoutType;
  }
  if (typeof error?.transportCode === 'string' && /^[A-Z0-9_]{2,64}$/.test(error.transportCode)) {
    failure.transportCode = error.transportCode;
  }
  return failure;
}

// ============================================================
// RETRY COM BACKOFF EXPONENCIAL — Resiliencia a rate limit
// ============================================================
// Quando o provedor retorna 429, espera com backoff (10s, 20s, 40s, 80s, 160s)
// ate 5 tentativas antes de desistir. Mantem o pipeline resiliente sem
// depender de modelo alternativo.
// ============================================================

const MAX_RETRIES = PROVIDER_RUNTIME.maxRetries;
const BASE_BACKOFF_MS = 10000; // 10s inicial
const MAX_CONTRACT_ATTEMPTS = 2;
const CONTRACT_BACKOFF_MS = 750;
const MAX_RETRY_AFTER_MS = 60000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isRateLimitError(status, body) {
  if (status === 429) return true;
  if (typeof body === 'string' && /rate.?limit/i.test(body)) return true;
  if (body && typeof body === 'object') {
    const msg = JSON.stringify(body).toLowerCase();
    if (msg.includes('rate limit') || msg.includes('rate_limit')) return true;
  }
  return false;
}

function extractRetryAfter(body, maxMs = MAX_RETRY_AFTER_MS) {
  // Tenta extrair hint de Retry-After do body (algumas APIs retornam)
  if (!body) return null;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const m = text.match(/(?:retry.?after|retry_in|wait)["'\s:=]+(\d+)/i);
  if (!m) return null;
  const seconds = Number(m[1]);
  const ceiling = boundedInteger(maxMs, MAX_RETRY_AFTER_MS, 1000, MAX_RETRY_AFTER_MS);
  if (!Number.isSafeInteger(seconds) || seconds <= 0) return null;
  return Math.min(seconds * 1000, ceiling);
}

function requestProviderAttempt({
  endpoint,
  data,
  apiKey,
  timeoutMs = PROVIDER_RUNTIME.requestTimeoutMs,
}, dependencies = {}) {
  const request = dependencies.request || https.request;
  const setTimer = dependencies.setTimeout || setTimeout;
  const clearTimer = dependencies.clearTimeout || clearTimeout;
  const absoluteTimeoutMs = boundedInteger(timeoutMs, PROVIDER_RUNTIME.requestTimeoutMs, 5000, 120000);

  return new Promise((resolve) => {
    let req = null;
    let absoluteTimer = null;
    let settled = false;

    const settle = (result) => {
      if (settled) return false;
      settled = true;
      if (absoluteTimer !== null) {
        clearTimer(absoluteTimer);
        absoluteTimer = null;
      }
      resolve(result);
      return true;
    };

    const destroyAfterSettlement = (message, timeoutType) => {
      if (!settle({
        status: 0,
        body: message,
        parsed: null,
        timedOut: true,
        timeoutType,
      })) return;
      if (req && !req.destroyed) {
        const error = new Error(message);
        error.code = timeoutType === 'absolute'
          ? 'CADU_FORMATTER_ABSOLUTE_TIMEOUT'
          : 'CADU_FORMATTER_SOCKET_TIMEOUT';
        try { req.destroy(error); } catch (_) {}
      }
    };

    // Node's request "timeout" is an inactivity timer and is refreshed by
    // response bytes. This independent timer starts before the request and can
    // therefore never be extended by a provider that trickles data forever.
    absoluteTimer = setTimer(() => {
      destroyAfterSettlement(
        `provider absolute timeout after ${absoluteTimeoutMs}ms`,
        'absolute',
      );
    }, absoluteTimeoutMs);
    // A deterministic/synchronous timer double used in tests may fire before
    // returning its handle. Do not leak that handle or start a late request.
    if (settled) {
      if (absoluteTimer !== null) clearTimer(absoluteTimer);
      absoluteTimer = null;
      return;
    }

    try {
      const options = {
        hostname: endpoint.hostname,
        port: endpoint.port || undefined,
        path: `${endpoint.pathname}${endpoint.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(data),
        },
        // Defense in depth for a completely idle socket. Unlike the timer
        // above, this value alone is not a wall-clock deadline.
        timeout: absoluteTimeoutMs,
      };
      req = request(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(body); } catch (_) {}
          settle({ status: res.statusCode, body, parsed });
        });
        res.on('error', (err) => {
          settle({ status: 0, body: err.message, parsed: null });
        });
      });
      req.on('error', (err) => {
        settle({ status: 0, body: err.message, parsed: null });
      });
      req.on('timeout', () => {
        destroyAfterSettlement(
          `provider socket timeout after ${absoluteTimeoutMs}ms`,
          'socket',
        );
      });
      req.write(data);
      req.end();
    } catch (error) {
      settle({ status: 0, body: error.message, parsed: null });
      if (req && !req.destroyed) {
        try { req.destroy(); } catch (_) {}
      }
    }
  });
}

const RETRYABLE_CONTRACT_FAILURES = new Set([
  'provider_envelope_invalid_json',
  'provider_envelope_missing_choices',
  ...Object.values(CONTRACT_FAILURE_CODES),
  'response_truncated',
  'provider_insufficient_system_resource',
]);

async function callDeepSeek(messages, dependencies = {}) {
  const apiKey = Object.prototype.hasOwnProperty.call(dependencies, 'apiKey')
    ? dependencies.apiKey
    : API_KEY;
  if (!apiKey) {
    throw formatterFailure('credentials_missing', { phase: 'credentials' });
  }
  const model = resolveDeepSeekModel(dependencies.model || MODEL);
  const endpoint = new URL(resolveDeepSeekEndpoint(dependencies.apiUrl || API_URL));
  const data = JSON.stringify(buildProviderPayload(messages, model));
  const requestAttempt = dependencies.requestProviderAttempt || requestProviderAttempt;
  const wait = dependencies.sleep || sleep;
  const warn = dependencies.warn || console.warn;
  const maxTransportAttempts = boundedInteger(dependencies.maxRetries, MAX_RETRIES, 1, 5);
  const contractBackoffMs = boundedInteger(dependencies.contractBackoffMs, CONTRACT_BACKOFF_MS, 0, 1000);
  let contractAttempts = 0;
  let transportFailures = 0;
  let requestAttempts = 0;

  while (true) {
    requestAttempts += 1;
    const result = await requestAttempt({
      endpoint,
      data,
      apiKey,
      timeoutMs: PROVIDER_RUNTIME.requestTimeoutMs,
    });

    if (result.status >= 200 && result.status < 300) {
      contractAttempts += 1;
      const choice = result.parsed?.choices?.[0];
      const rawFinishReason = typeof choice?.finish_reason === 'string'
        ? choice.finish_reason.toLowerCase()
        : null;
      const finishReason = rawFinishReason && /^[a-z_]{1,64}$/.test(rawFinishReason)
        ? rawFinishReason
        : null;
      const metadata = {
        phase: 'content_contract',
        httpStatus: result.status,
        attempts: requestAttempts,
        finishReason,
      };
      let failure = null;
      if (!result.parsed || typeof result.parsed !== 'object' || Array.isArray(result.parsed)) {
        failure = formatterFailure('provider_envelope_invalid_json', {
          ...metadata,
          phase: 'provider_envelope',
        });
      } else if (!choice || !choice.message || typeof choice.message !== 'object') {
        failure = formatterFailure('provider_envelope_missing_choices', {
          ...metadata,
          phase: 'provider_envelope',
        });
      } else if (finishReason === 'content_filter') {
        failure = formatterFailure('content_filtered', metadata);
      } else if (finishReason === 'length') {
        failure = formatterFailure('response_truncated', metadata);
      } else if (finishReason === 'insufficient_system_resource') {
        failure = formatterFailure('provider_insufficient_system_resource', metadata);
      } else {
        try {
          const content = typeof choice.message.content === 'string' ? choice.message.content : '';
          return parseFormatterResponse(stripReasoning(content));
        } catch (error) {
          failure = formatterFailure(
            CONTRACT_FAILURE_CODES[error.message] || 'provider_error',
            metadata,
            error.message,
          );
        }
      }
      if (RETRYABLE_CONTRACT_FAILURES.has(failure.formatCode)
          && contractAttempts < MAX_CONTRACT_ATTEMPTS) {
        warn(
          `   ⏳ provider contract (${failure.formatCode}, tentativa `
          + `${contractAttempts}/${MAX_CONTRACT_ATTEMPTS}) — aguardando ${contractBackoffMs}ms...`,
        );
        await wait(contractBackoffMs);
        continue;
      }
      throw failure;
    }

    const validHttpStatus = Number.isInteger(result.status)
      && result.status >= 100 && result.status <= 599
      ? result.status
      : null;
    transportFailures += 1;

    // Rate limit → bounded provider hint or exponential backoff.
    if (isRateLimitError(result.status, result.body)) {
      const hint = extractRetryAfter(result.body);
      const backoff = hint || (BASE_BACKOFF_MS * Math.pow(2, transportFailures - 1));
      const waitS = Math.round(backoff / 1000);
      if (transportFailures < maxTransportAttempts) {
        warn(
          `   ⏳ rate limit (tentativa ${transportFailures}/${maxTransportAttempts}) `
          + `— aguardando ${waitS}s...`,
        );
        await wait(backoff);
        continue;
      }
      throw formatterFailure('rate_limit', {
        phase: validHttpStatus ? 'http' : 'transport',
        httpStatus: validHttpStatus,
        attempts: requestAttempts,
      });
    }

    // Transient network / 5xx retry. Permanent 4xx fails closed immediately.
    const transient = isTransientProviderStatus(result.status, result.body);
    if (transient && transportFailures < maxTransportAttempts) {
      const backoff = Math.min(BASE_BACKOFF_MS, 4000) * Math.pow(2, transportFailures - 1);
      const waitS = Math.round(backoff / 1000);
      warn(
        `   ⏳ provider transient (tentativa ${transportFailures}/${maxTransportAttempts}, `
        + `status=${result.status}) — aguardando ${waitS}s...`,
      );
      await wait(backoff);
      continue;
    }

    if (transient && !validHttpStatus) {
      throw formatterFailure(result.timedOut ? 'transport_timeout' : 'transport_error', {
        phase: 'transport',
        attempts: requestAttempts,
        timeoutType: result.timeoutType || null,
      });
    }
    const code = validHttpStatus ? `http_${validHttpStatus}` : 'transport_error';
    throw formatterFailure(code, {
      phase: validHttpStatus ? 'http' : 'transport',
      httpStatus: validHttpStatus,
      attempts: requestAttempts,
      timeoutType: result.timeoutType || null,
    });
  }
}

function isTransientProviderStatus(status, body) {
  if (status === 0 || status === 408 || status === 425 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  const text = typeof body === 'string' ? body : (body ? JSON.stringify(body) : '');
  return /timeout|econnreset|enotfound|socket hang up|temporar|unavailable|overloaded/i.test(text);
}

function normalizedDateOnly(value) {
  const match = String(value || '').match(/^(20\d{2}-\d{2}-\d{2})/);
  if (!match) return '';
  const parsed = new Date(`${match[1]}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === match[1]
    ? match[1]
    : '';
}

function formatterReferenceNow(now = null) {
  if (now instanceof Date && !Number.isNaN(now.getTime())) return now;
  const configuredValue = String(process.env.CADU_REFERENCE_DATE || '').trim();
  const configured = /^20\d{2}-\d{2}-\d{2}$/.test(configuredValue)
    ? new Date(`${configuredValue}T12:00:00-03:00`)
    : (configuredValue ? new Date(configuredValue) : null);
  return configured && !Number.isNaN(configured.getTime()) ? configured : new Date();
}

function formatterTodayIso(now = null) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(formatterReferenceNow(now));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatterTodayDisplay(now = null) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(formatterReferenceNow(now));
}

function extractDateInfo(item, now = null) {
  const dates = item.dates || {};
  const todayIso = formatterTodayIso(now);
  const futureDates = Array.isArray(dates.futureDates)
    ? dates.futureDates
      .map(normalizedDateOnly)
      .filter(date => date && date >= todayIso)
    : [];
  const latestDate = normalizedDateOnly(dates.latestDate);
  const semanticDates = {
    applicationOpensAt: dates.applicationOpensAt || null,
    applicationDeadline: dates.applicationDeadline || null,
    resultPublishedAt: dates.resultPublishedAt || null,
    eventStartsAt: dates.eventStartsAt || dates.beginAt || null,
    eventEndsAt: dates.eventEndsAt || dates.endAt || null,
  };
  const applicationDeadline = normalizedDateOnly(semanticDates.applicationDeadline);
  const applicationStatus = String(dates.applicationStatus || '').trim().toLowerCase();
  const hasDeadline = Boolean(applicationDeadline && applicationDeadline >= todayIso)
    && /^(?:open|scheduled)$/.test(applicationStatus);
  return {
    futureDates,
    hasDeadline,
    latestDate: latestDate && latestDate >= todayIso ? latestDate : '',
    semanticDates,
    todayIso,
  };
}

function formatSemanticDates(dateInfo) {
  const semantic = dateInfo.semanticDates || {};
  const value = key => {
    const raw = semantic[key];
    if (!raw) return 'nao identificada';
    const date = normalizedDateOnly(raw);
    return date && date < dateInfo.todayIso
      ? `${raw} (vencida; nao publicar)`
      : raw;
  };
  return [
    `- abertura das inscricoes/candidaturas (applicationOpensAt): ${value('applicationOpensAt')}`,
    `- prazo final das inscricoes/candidaturas (applicationDeadline): ${value('applicationDeadline')}`,
    `- divulgacao de resultado (resultPublishedAt): ${value('resultPublishedAt')}`,
    `- inicio do evento (eventStartsAt): ${value('eventStartsAt')}`,
    `- fim do evento (eventEndsAt): ${value('eventEndsAt')}`,
  ].join('\n');
}

function formatRelevantLinks(item) {
  const rl = item?.relevantLinks;
  if (!rl) return '  (nenhum link relevante extraido da pagina)';
  const lines = [];
  const dates = item?.dates || {};
  const canApply = dates.canApply === true;
  const actionUrls = new Set((item?.actionEvidence || [])
    .map(evidence => String(evidence?.value || '').trim())
    .filter(Boolean));
  const forms = (rl.formularios || []).filter(link =>
    canApply && actionUrls.has(String(link?.url || '').trim())
  );
  if (forms.length) {
    lines.push('  FORMULÁRIO DE INSCRIÇÃO:');
    for (const f of forms) lines.push(`    - ${f.url}  (label original: "${f.label}")`);
  }
  if (rl.editais && rl.editais.length) {
    lines.push('  EDITAL (PDF):');
    for (const e of rl.editais) lines.push(`    - ${e.url}  (label original: "${e.label}")`);
  }
  if (rl.paginasOficiais && rl.paginasOficiais.length) {
    lines.push('  PÁGINA OFICIAL DO PROGRAMA:');
    for (const p of rl.paginasOficiais) lines.push(`    - ${p.url}  (label original: "${p.label}")`);
  }
  if (rl.outros && rl.outros.length) {
    lines.push('  OUTROS LINKS RELEVANTES:');
    for (const o of rl.outros) lines.push(`    - ${o.url}  (label original: "${o.label}")`);
  }
  return lines.length ? lines.join('\n') : '  (nenhum link relevante extraido da pagina)';
}

function sanitizeFormattedDescriptionLinks(description, item) {
  const allowedUrls = collectAllowedUrls(item || {});
  let unapprovedLinksRemoved = 0;
  const plainLabel = value => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const isApplicationLabel = value => /\b(?:inscreva(?:-se)?|inscricao|candidate(?:-se)?|candidatura|submeta|submissao|matricule(?:-se)?|matricula|aplique|aplicacao)\b/.test(
    plainLabel(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
  );
  const rejectedReplacement = label => {
    unapprovedLinksRemoved += 1;
    return isApplicationLabel(label) ? '' : plainLabel(label);
  };
  const approvedDestination = value => {
    const normalizedUrl = normalizeHttpUrl(value);
    return normalizedUrl && allowedUrls.has(normalizedUrl) ? normalizedUrl : '';
  };
  let sanitizedDescription = String(description || '').replace(
    /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))[^>]*>([\s\S]*?)<\/a\s*>/gi,
    (htmlAnchor, doubleQuotedUrl, singleQuotedUrl, unquotedUrl, label) => {
      const normalizedUrl = approvedDestination(doubleQuotedUrl || singleQuotedUrl || unquotedUrl || '');
      if (normalizedUrl) {
        return `[${plainLabel(label) || normalizedUrl}](${normalizedUrl})`;
      }
      return rejectedReplacement(label);
    },
  );
  sanitizedDescription = sanitizedDescription.replace(
    /(\b(?:href|src|action|formaction|poster|xlink:href)\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi,
    (attribute, prefix, doubleQuotedUrl, singleQuotedUrl, unquotedUrl) => {
      const normalizedUrl = approvedDestination(doubleQuotedUrl || singleQuotedUrl || unquotedUrl || '');
      if (normalizedUrl) return `${prefix}"${normalizedUrl}"`;
      rejectedReplacement('');
      return `${prefix}""`;
    },
  );
  sanitizedDescription = sanitizedDescription.replace(
    /\[([^\]\r\n]+)\]\(\s*(?:<([^>\r\n]+)>|((?:[^()\s]|\([^()\r\n]*\))+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g,
    (markdown, label, angleUrl, plainUrl) => {
      const normalizedUrl = approvedDestination(angleUrl || plainUrl || '');
      if (normalizedUrl) {
        return `[${plainLabel(label) || normalizedUrl}](${normalizedUrl})`;
      }
      return rejectedReplacement(label);
    },
  );
  sanitizedDescription = sanitizedDescription.replace(
    /<((?:[a-z][a-z0-9+.-]*:|\/\/)[^<>\s]*)>/gi,
    (autolink, url) => {
      const normalizedUrl = approvedDestination(url);
      if (normalizedUrl) return `<${normalizedUrl}>`;
      return rejectedReplacement('');
    },
  );
  sanitizedDescription = sanitizedDescription.replace(
    /(^|[\s>=(\[{,:;])((?:(?:[a-z][a-z0-9+.-]*:\/\/)|(?:javascript|data|vbscript|file|blob|ftp|mailto|tel):|(?<!:)\/\/)[^\s<>"'\])}]+)/gi,
    (token, prefix, url) => {
      const trailingPunctuation = (url.match(/[.,;!?]+$/) || [''])[0];
      const destination = trailingPunctuation ? url.slice(0, -trailingPunctuation.length) : url;
      const normalizedUrl = approvedDestination(destination);
      if (normalizedUrl) return `${prefix}${normalizedUrl}${trailingPunctuation}`;
      return `${prefix}${rejectedReplacement('')}${trailingPunctuation}`;
    },
  );

  // Defensive final sweep: the quality gate uses the same extractor and will
  // still block if a future syntax variant escapes the structural replacements.
  // Removing the raw destination here keeps formatter output fail-closed while
  // preserving neutral surrounding prose.
  const residualUnsafe = [...new Set(descriptionUrls(sanitizedDescription)
    .filter(link => !link.normalized || !allowedUrls.has(link.normalized))
    .map(link => link.raw)
    .filter(Boolean))];
  for (const raw of residualUnsafe) {
    if (!sanitizedDescription.includes(raw)) continue;
    sanitizedDescription = sanitizedDescription.split(raw).join('');
    unapprovedLinksRemoved += 1;
  }
  return { description: sanitizedDescription, unapprovedLinksRemoved };
}

// ============================================================
// PROMPT
// ============================================================

const SYSTEM_PROMPT = `Você é o formatador oficial do Kino Campus (UFG). Sua função é transformar dados brutos de EVENTOS FUTUROS e OPORTUNIDADES ACIONAVEIS da UFG em descrições formatadas para posts.

**ESTRUTURA OBRIGATÓRIA (siga exatamente):**
1. 🚨/📢 Lead chamativo com emoji + **informação principal em negrito**
2. 📅 **Datas/prazos** com ícone (uma linha por data) — destaque prazo final em negrito
3. 📊/🎯/💰 **Info-chave** (vagas, valores, requisitos, público) — destaque números em negrito
4. 📝 **Etapas/requisitos** (se houver: provas, análise, defesa, etc)
5. 📍 **Local/modalidade** (se aplicável)
6. 📎 **BLOCO DE LINKS** — sempre que houver links reais disponíveis, liste-os com labels claros:
   - 📝 [Inscreva-se no formulário](URL)  (se houver link de formulário)
   - 📄 [Acesse o edital completo (PDF)](URL)  (se houver PDF)
   - 🌐 [Conheça a página do programa](URL)  (se houver página oficial)
   - 📎 [Mais informações](URL principal)  (sempre, link da notícia)
   NUNCA use "clique aqui" sem URL — use labels descritivos
7. 📌 **Fonte:** Unidade UFG

**REGRAS ABSOLUTAS:**
1. Use **negrito duplo** para informações-chave (prazos, nomes, valores, números de vagas)
2. Use emojis de bloco: 📅 data, 📝 requisito/formulário, 📊 vagas, 💰 valor, 🎯 objetivo, 👥 público, 📍 local, 📎 link, 📌 fonte, 📄 edital, 🌐 página
3. NUNCA use HTML — apenas Markdown puro
4. Mantenha entre 400 e 800 caracteres
5. Use acentos e cedilhas corretamente
6. SEMPRE liste todos os links reais disponíveis no bloco 📎 — cada um com label específico
7. NUNCA invente links que não foram fornecidos
8. Inclua SEMPRE 📌 **Fonte:** no final
9. Seja direto e informativo — cada linha deve ter valor
10. **PRESERVE acentos e capitalização do título original** (ex: "Mamma Mia - O Musical" não "Mamma Mia O Musical"; "XIV Simpósio" não "Xiv Simposio")
11. O Kino Campus tem somente dois módulos neste fluxo: **eventos** e **oportunidades**.
12. Para **eventos**, priorize: o que é, data futura, horário, local/modalidade, entrada/inscrição e público. Não trate cobertura de evento passado como evento.
13. Para **oportunidades**, priorize: edital/chamada, prazo, vagas/bolsas/valor, requisitos, etapas e link de ação. Não transforme release institucional em oportunidade.
14. Se o texto parecer apenas notícia institucional sem data futura, prazo ou ação clara, escreva de forma conservadora e sinalize a necessidade de consultar a fonte oficial, sem exagerar urgência.
15. **IMPORTANTE — Responda com UM ÚNICO OBJETO JSON válido**, sem cercas Markdown ou texto antes/depois, com exatamente duas chaves: formattedTitle (string curta 60-78 chars, sem prefixo institucional redundante — NÃO comece com "UFG,", "UFG:", "UFG —", "UFG -", "UFG |", "SECOM:", "PROEX:", "SECOM," etc.; o nome da fonte vai automaticamente no metadata.source_unit) e formattedDescription (string com Markdown rico, emojis, datas e links reais do bloco de links). Quando o título fonte já está bom, refine-o; quando está truncado, finalize-o; quando é literal demais, reescreva como notícia do Kino Campus.

**EXEMPLO CANÔNICO DO CONTEÚDO DA STRING formattedDescription (post PPGCF — com links reais):**
🚨 **Atenção, pesquisadores!** O **PPGCF** está com inscrições abertas para **mestrado e doutorado**!

📅 **Prazo de inscrição:** até **8 de julho de 2026**
📊 **Vagas:** **34 para mestrado** + **30 para doutorado**

📝 **Etapas da seleção:**
- Exame de suficiência em inglês
- Avaliação do currículo
- Defesa oral do pré-projeto
- Prova escrita

📍 **Modalidade:** Presencial

📝 [Inscreva-se no formulário](https://docs.google.com/forms/d/...)
📄 [Acesse o edital completo (PDF)](https://files.cercomp.ufg.br/.../Edital.pdf)
🌐 [Conheça o PPGCF](https://ppgcf.farmacia.ufg.br/)
📎 [Mais informações](https://prpg.ufg.br/n/201635)

📌 **Fonte:** PRPG/UFG`;

function buildUserPrompt(item, now = null) {
  const referenceNow = formatterReferenceNow(now);
  const dateInfo = extractDateInfo(item, referenceNow);
  const futureDatesStr = dateInfo.futureDates.length > 0
    ? dateInfo.futureDates.join(', ')
    : (dateInfo.latestDate || 'nenhuma data futura válida identificada');
  
  // HARDENING 2026-06-04: Include more context for richer descriptions
  const extras = [];
  if (item.score) extras.push(`Score de relevância: ${item.score}`);
  if (item.site) extras.push(`Unidade UFG: ${item.site.toUpperCase()}`);
  
  const hoje = formatterTodayDisplay(referenceNow);
  
  return `Formate o seguinte item para publicação no Kino Campus:

DATA DE HOJE: ${hoje} — NÃO inclua datas anteriores a esta!

TÍTULO: ${item.title || 'Sem título'}
TEXTO/CONTEUDO DA FONTE: ${(item.text || '').slice(0, 2000)}
FONTE: ${item.site || 'UFG'}
MÓDULO: ${item.module || 'oportunidades'}
CATEGORIA: ${item.category || ''}
URL DA FONTE: ${item.url || item.link || ''}
DATAS POR PAPEL SEMANTICO (fonte autoritativa):
${formatSemanticDates(dateInfo)}
DATAS FUTURAS LEGADAS (somente contexto; nao atribua um papel a elas): ${futureDatesStr}
TEM PRAZO: ${dateInfo.hasDeadline ? 'Sim (urgente!)' : 'Não'}
${extras.join('\n')}
${item.pdfs && item.pdfs.length > 0 ? `PDFS DO EDITAL: ${item.pdfs.join(', ')}` : ''}
STATUS DA JANELA DE INSCRICAO: ${item.dates?.applicationStatus || 'unknown'}
PODE SE INSCREVER/CANDIDATAR AGORA: ${item.dates?.canApply === true ? 'SIM' : 'NAO'}

**LINKS REAIS EXTRAÍDOS DA PÁGINA (use APENAS estes):**
${formatRelevantLinks(item)}
${item.dates?.canApply === true ? '' : 'POLITICA DE CTA: nao use Inscreva-se, Candidate-se, Submeta ou qualquer chamada de aplicacao; os links restantes sao apenas informativos.'}

**IMPORTANTE:** 
- Siga ESTRITAMENTE a estrutura: 🚨 Lead → 📅 Datas → 📊/🎯 Info → 📍 Local → 📎 BLOCO DE LINKS → 📌 Fonte.
- Respeite o MÓDULO informado. Se for eventos, fale como evento futuro; se for oportunidades, fale como edital/chamada/inscrição.
- No bloco 📎, liste CADA link disponível com label especifico (formulário, edital, página do programa, etc).
- NUNCA escreva "clique aqui" sem URL. Use labels descritivos.
- NUNCA invente links. Use SOMENTE os fornecidos acima.
- Use os links REAIS acima, não escreva URLs genéricos.
- Para EVENTOS, use eventStartsAt/eventEndsAt como datas do evento. Para OPORTUNIDADES, use applicationDeadline como prazo final.
- Matrícula, divulgação de resultado, recursos, entrevistas, provas e demais datas de cronograma NÃO são inscrições nem prazo de inscrição.
- Só afirme que as inscrições estão abertas quando STATUS DA JANELA DE INSCRICAO for open E PODE SE INSCREVER/CANDIDATAR AGORA for SIM.
- Quando STATUS DA JANELA DE INSCRICAO for scheduled, informe que ela ABRIRÁ em applicationOpensAt; nunca diga que já está aberta e nunca use CTA de inscrição.
- ⚠️ **DATAS VENCIDAS: HOJE é ${hoje}. NUNCA inclua datas que JÁ PASSARAM.** Se a data limite (deadline) ou data do evento já passou, NÃO a mencione. Em vez disso, escreva "Prazo: consulte o edital oficial" ou omita a data. Apenas inclua datas FUTURAS.
- Retorne UM ÚNICO OBJETO JSON válido, sem cercas Markdown nem texto adicional, com exatamente formattedTitle e formattedDescription, ambas strings não vazias.`;
}

// ============================================================
// FORMAT SINGLE ITEM
// ============================================================

async function formatItem(item, dependencies = {}) {
  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(item) },
    ];
    // O contrato é fail-closed: texto bruto, JSON parcial ou campo vazio nunca
    // pode virar uma descrição publicável por fallback.
    const { formattedTitle, formattedDescription } = await callDeepSeek(messages, dependencies);
    const sanitized = sanitizeFormattedDescriptionLinks(formattedDescription, item);
    const media = normalizedFormatterMedia(item);
    const preservedImage = media.images[0] || '';
    const record = {
      ...item,
      formattedTitle,
      formattedDescription: sanitized.description,
      formatted: true,
      formatSanitization: sanitized.unapprovedLinksRemoved > 0
        ? { unapprovedLinksRemoved: sanitized.unapprovedLinksRemoved }
        : null,
      image: preservedImage,
      image_url: preservedImage,
      images: media.images,
      galleryImages: media.galleryImages,
    };
    // P1-D (2026-06-12): quality gate. Se faltar elementos, enriquece via DeepSeek.
    const qualityResult = await ensureQuality(record, { maxEnrichAttempts: 1 });
    if (qualityResult.ok) {
      return qualityResult.record;
    }
    // Se ainda falhou, devolve mesmo assim mas marca needsReview
    return {
      ...qualityResult.record,
      needsReview: true,
      qualityIssues: qualityResult.issues,
    };
  } catch (e) {
    // Preserve raw text only as diagnostic evidence. The pipeline must never
    // treat this fallback as formatted or send it to publication.
    const rawDesc = (item.description || item.summary || item.text || '').toString().trim();
    const rawTitle = (item.title || '').toString().trim();
    const effectiveProvider = providerMetadata(
      dependencies.apiUrl || API_URL,
      dependencies.model || MODEL,
    );
    const formatFailure = normalizeFormatFailure(e, effectiveProvider);
    console.warn(`   ⚠️ Fallback AI: usando descricao crua (${rawDesc.length}ch) — ${formatFailure.provider}:${formatFailure.code}`);
    return {
      ...item,
      formattedTitle: rawTitle || null,
      formattedDescription: rawDesc || rawTitle,
      formatted: false,
      needsReview: true,
      formatFailure,
    };
  }
}

function buildFormatterOutput(formatted, { timestamp = new Date().toISOString() } = {}) {
  const items = Array.isArray(formatted) ? formatted : [];
  const isSuccessful = item => item.formatted === true
    && typeof item.formattedTitle === 'string'
    && item.formattedTitle.trim().length > 0
    && typeof item.formattedDescription === 'string'
    && item.formattedDescription.trim().length > 0;
  const succeeded = items.filter(isSuccessful).length;
  const failed = items.length - succeeded;
  return {
    formatter: 'formatador-ia.js',
    provider: PROVIDER,
    model: MODEL,
    timestamp,
    summary: { attempted: items.length, succeeded, failed },
    items: items.map(f => {
      const media = normalizedFormatterMedia(f);
      const igImage = normalizeImageCandidates([f.igMatch?.image], 1)[0] || '';
      const igMatch = f.igMatch && typeof f.igMatch === 'object' && !Array.isArray(f.igMatch)
        ? { ...f.igMatch, image: igImage }
        : null;
      return {
      title: f.title,
      formattedTitle: f.formattedTitle || null,
      site: f.site,
      url: f.url,
      module: f.module,
      category: f.category,
      score: f.score,
      description: f.formattedDescription,
      formattedDescription: f.formattedDescription,
      formatted: isSuccessful(f),
      formatFailure: isSuccessful(f) ? null : (f.formatFailure || normalizeFormatFailure('formatter unsuccessful')),
      image: media.images[0] || '',
      images: media.images,
      galleryImages: media.galleryImages,
      igMatch,
      sourceId: f.sourceId || `${f.site}:${f.sourceUrl || f.url}`,
      sourceRegistryId: f.sourceRegistryId || null,
      sourceUrl: f.sourceUrl || f.url,
      sourceName: f.sourceName || f.site || 'UFG',
      source: f.source || null,
      decision: f.decision || null,
      reasons: Array.isArray(f.reasons) ? f.reasons : [],
      needsReview: f.needsReview === true,
      qualityOk: f.qualityOk !== false,
      qualityIssues: Array.isArray(f.qualityIssues) ? f.qualityIssues : [],
      qualityWarnings: Array.isArray(f.qualityWarnings) ? f.qualityWarnings : [],
      qualityBlockingIssues: Array.isArray(f.qualityBlockingIssues) ? f.qualityBlockingIssues : [],
      formatSanitization: f.formatSanitization || null,
      duplicate: f.duplicate === true,
      expired: f.expired === true,
      sourceKind: f.sourceKind || null,
      eventSource: f.eventSource || null,
      place: f.place || null,
      externalUrl: f.externalUrl || null,
      relevantLinks: f.relevantLinks || null,
      actionEvidence: Array.isArray(f.actionEvidence) ? f.actionEvidence : [],
      actionFingerprints: Array.isArray(f.actionFingerprints) ? f.actionFingerprints : [],
      pdfs: Array.isArray(f.pdfs) ? f.pdfs : [],
      pdfLinks: Array.isArray(f.pdfLinks) ? f.pdfLinks : (Array.isArray(f.pdfs) ? f.pdfs : []),
      enrichmentSources: Array.isArray(f.enrichmentSources)
        ? f.enrichmentSources
        : [f.sourceUrl || f.url].filter(Boolean).map(url => ({ url, label: f.site || 'Fonte oficial', type: 'official' })),
      enrichmentCheckedAt: f.enrichmentCheckedAt || null,
      sourcesChecked: Array.isArray(f.sourcesChecked) ? f.sourcesChecked : [],
      provenance: f.provenance && typeof f.provenance === 'object' ? f.provenance : null,
      link: f.link || f.sourceUrl || f.url,
      linkAsCta: true,
      actionLabel: resolveActionLabel(f, f.formattedDescription || f.text || ''),
      contato: extractContato(f),
      dates: f.dates || {},
      };
    }),
  };
}

function formatterExitCode(output) {
  const summary = output?.summary;
  return summary?.attempted > 0 && summary?.succeeded === 0 ? 2 : 0;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  let items = [];
  
  if (process.argv.includes('--stdin')) {
    // Read from stdin
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString());
    items = input.publishable || input.reviewable || [input];
  } else if (process.argv.includes('--item')) {
    const idx = process.argv.indexOf('--item');
    items = [JSON.parse(process.argv[idx + 1])];
  } else {
    // Read from file argument
    const fileArg = process.argv.find(a => a.endsWith('.json'));
    if (!fileArg) {
      console.error('Uso: node formatador-ia.js <arquivo.json>');
      process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(fileArg, 'utf8'));
    items = data.publishable || data.reviewable || [];
  }
  
  if (!items.length) {
    console.log('⚠️  Nenhum item para formatar');
    return;
  }
  
  console.log(`\n🤖 FORMATADOR IA — ${PROVIDER.provider}/${PROVIDER.model}`);
  console.log(`${'='.repeat(50)}`);
  console.log(`  Itens: ${items.length}`);
  console.log(
    `  Retry: transporte ate ${MAX_RETRIES} tentativas; contrato ate ${MAX_CONTRACT_ATTEMPTS}; `
    + `prazo absoluto por tentativa: ${PROVIDER_RUNTIME.requestTimeoutMs / 1000}s\n`,
  );
  
  const formatted = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const pct = Math.round(((i + 1) / items.length) * 100);
    process.stdout.write(`  [${String(pct).padStart(3)}%] ${(item.title || '').slice(0, 60)}... `);
    
    const result = await formatItem(item);
    formatted.push(result);
    
    if (result.formatted) {
      process.stdout.write(`✅ ${result.formattedDescription.length}ch\n`);
    } else {
      process.stdout.write(`⚠️  fallback (${result.formatFailure?.provider || 'unknown'}:${result.formatFailure?.code || 'provider_error'})\n`);
    }
    
    // Pausa entre itens para evitar rate limit proativo
    if (i < items.length - 1) await new Promise(r => setTimeout(r, 1500));
  }
  
  // Output
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 ${formatted.filter(f => f.formatted).length}/${items.length} formatados com sucesso (${PROVIDER.provider})\n`);
  
  for (const item of formatted) {
    console.log(`── ${(item.title || '').slice(0, 60)}`);
    console.log(`${(item.formattedDescription || '').slice(0, 200)}...`);
    console.log();
  }
  
  // Output as JSON for pipeline
  const output = buildFormatterOutput(formatted);
  
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0 && process.argv[outputIndex + 1]) {
    writeJsonAtomic(process.argv[outputIndex + 1], output);
  }
  console.log('__CADU_FORMATADOR_JSON__' + JSON.stringify(output));
  const exitCode = formatterExitCode(output);
  if (exitCode !== 0) {
    console.error(`💥 Nenhum item foi formatado por ${PROVIDER.provider}; encerrando com falha obrigatória`);
    process.exitCode = exitCode;
  }
  return output;
}

function extractContato(item) {
  const desc = (item.formattedDescription || item.text || '');
  const emailMatch = desc.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  return emailMatch ? emailMatch[0] : '';
}

module.exports = {
  SYSTEM_PROMPT,
  DEFAULT_DEEPSEEK_ENDPOINT,
  DEFAULT_DEEPSEEK_MODEL,
  buildProviderPayload,
  buildFormatterOutput,
  buildUserPrompt,
  callDeepSeek,
  extractRetryAfter,
  formatItem,
  formatterExitCode,
  formatterFailure,
  formatterReferenceNow,
  formatterTodayIso,
  normalizeFormatFailure,
  normalizedFormatterMedia,
  parseFormatterResponse,
  providerMetadata,
  providerRuntimeConfig,
  requestProviderAttempt,
  resolveDeepSeekEndpoint,
  resolveDeepSeekModel,
  resolveReasoningEffort,
  resolveTextProviderConfig,
  sanitizeFormattedDescriptionLinks,
};

if (require.main === module) {
  main().catch(e => { console.error('💥', e.message); process.exitCode = 1; });
}

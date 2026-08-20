import * as responseLimits from './cadu-response-limits.cjs';

const { parseCaduJson, readLimitedCaduResponse } = responseLimits.default || responseLimits;

const ADMIN_AUTH_DEADLINE_MS = 8_000;
const MAX_ADMIN_AUTH_RESPONSE_BYTES = 64 * 1024;

class CaduAdminAuthPayloadError extends Error {
  constructor() {
    super('invalid_admin_auth_payload');
    this.name = 'CaduAdminAuthPayloadError';
  }
}

const SUPABASE_URL =
  process.env.KC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  '';

const SUPABASE_ANON_KEY =
  process.env.KC_SUPABASE_ANON_KEY ||
  process.env.KC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLIC_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  '';

function normalizeSupabaseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

function readBearer(req) {
  const header = req && req.headers ? (req.headers.authorization || req.headers.Authorization || '') : '';
  const match = String(header || '').match(/^Bearer\s+(.+)$/i);
  if (match && match[1]) return match[1].trim();
  return '';
}

export function createCaduAdminDeadline(timeoutMs = ADMIN_AUTH_DEADLINE_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Timers must not keep a short-lived Vercel invocation alive after all work
  // has completed. Browser-like timer doubles do not implement unref.
  timer.unref?.();
  return {
    signal: controller.signal,
    cancel() { clearTimeout(timer); },
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    redirect: 'error',
  });
  const text = await readLimitedCaduResponse(response, MAX_ADMIN_AUTH_RESPONSE_BYTES);
  // A non-2xx response is handled by each caller (for example, the RPC
  // fallback). A successful response, however, must carry valid JSON: treating
  // an HTML/WAF/error page as a missing session or role would mislead an
  // authenticated administrator and hide an upstream outage.
  if (!response.ok) return { response, body: null };
  const parsed = parseCaduJson(text);
  if (!parsed.ok || parsed.value === null) throw new CaduAdminAuthPayloadError();
  return { response, body: parsed.value };
}

async function isAdminByRpc(baseUrl, anonKey, jwt, userId, signal) {
  const { response, body } = await fetchJson(`${baseUrl}/rest/v1/rpc/kc_is_admin`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ p_user_id: userId }),
    signal,
  });
  if (!response.ok) return null;
  return body === true || body === 'true';
}

async function isAdminByProfile(baseUrl, anonKey, jwt, userId, signal) {
  const encodedId = encodeURIComponent(userId);
  const { response, body } = await fetchJson(`${baseUrl}/rest/v1/profiles?select=is_admin&id=eq.${encodedId}&limit=1`, {
    method: 'GET',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/json',
    },
    signal,
  });
  if (!response.ok || !Array.isArray(body) || !body[0]) return false;
  return body[0].is_admin === true;
}

export async function requireCaduAdmin(req, res) {
  const baseUrl = normalizeSupabaseUrl(SUPABASE_URL);
  const anonKey = String(SUPABASE_ANON_KEY || '').trim();
  if (!baseUrl || !anonKey) {
    res.status(503).json({ error: 'admin_auth_not_configured' });
    return null;
  }

  const jwt = readBearer(req);
  if (!jwt) {
    res.status(401).json({ error: 'admin_auth_required' });
    return null;
  }

  const deadline = createCaduAdminDeadline();
  try {
    let userResult;
    try {
      userResult = await fetchJson(`${baseUrl}/auth/v1/user`, {
        method: 'GET',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/json',
        },
        signal: deadline.signal,
      });
      if (!userResult.response.ok || !userResult.body || !userResult.body.id) {
        res.status(401).json({ error: 'invalid_admin_session' });
        return null;
      }
    } catch (_) {
      res.status(503).json({ error: 'admin_auth_unreachable' });
      return null;
    }

    const userId = userResult.body.id;
    let isAdmin = false;
    try {
      isAdmin = await isAdminByRpc(baseUrl, anonKey, jwt, userId, deadline.signal);
      if (isAdmin === null) {
        isAdmin = await isAdminByProfile(baseUrl, anonKey, jwt, userId, deadline.signal);
      }
    } catch (_) {
      res.status(503).json({ error: 'admin_authorization_unreachable' });
      return null;
    }
    if (!isAdmin) {
      res.status(403).json({ error: 'admin_required' });
      return null;
    }

    return { id: userId, email: userResult.body.email || null };
  } finally {
    deadline.cancel();
  }
}

export function stripCaduAdminQuery(queryString) {
  const params = new URLSearchParams(queryString || '');
  params.delete('kc_admin_token');
  params.delete('path');
  return params.toString();
}

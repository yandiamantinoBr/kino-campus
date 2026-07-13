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

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  return { response, body };
}

async function isAdminByRpc(baseUrl, anonKey, jwt, userId) {
  const { response, body } = await fetchJson(`${baseUrl}/rest/v1/rpc/kc_is_admin`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ p_user_id: userId }),
  });
  if (!response.ok) return null;
  return body === true || body === 'true';
}

async function isAdminByProfile(baseUrl, anonKey, jwt, userId) {
  const encodedId = encodeURIComponent(userId);
  const { response, body } = await fetchJson(`${baseUrl}/rest/v1/profiles?select=is_admin&id=eq.${encodedId}&limit=1`, {
    method: 'GET',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/json',
    },
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

  let userResult;
  try {
    userResult = await fetchJson(`${baseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/json',
      },
    });
    if (!userResult.response.ok || !userResult.body || !userResult.body.id) {
      res.status(401).json({ error: 'invalid_admin_session' });
      return null;
    }
  } catch (err) {
    res.status(502).json({ error: 'admin_auth_unreachable', message: String(err && err.message ? err.message : err) });
    return null;
  }

  const userId = userResult.body.id;
  let isAdmin = false;
  try {
    isAdmin = await isAdminByRpc(baseUrl, anonKey, jwt, userId);
    if (isAdmin === null) {
      isAdmin = await isAdminByProfile(baseUrl, anonKey, jwt, userId);
    }
  } catch (err) {
    res.status(502).json({ error: 'admin_authorization_unreachable', message: String(err && err.message ? err.message : err) });
    return null;
  }
  if (!isAdmin) {
    res.status(403).json({ error: 'admin_required' });
    return null;
  }

  return { id: userId, email: userResult.body.email || null };
}

export function stripCaduAdminQuery(queryString) {
  const params = new URLSearchParams(queryString || '');
  params.delete('kc_admin_token');
  params.delete('path');
  return params.toString();
}

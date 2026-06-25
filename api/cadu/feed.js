// api/cadu/feed.js — proxy para cadu-api /api/feed (chunks do Cadu)
//
// Endpoint exposto: GET /api/cadu/feed?limit=N
// Vercel roteia automaticamente pelo nome do arquivo.
//
// Também suporta sub-paths via ?path=:
//   GET  /api/cadu/feed?path={chunk_id}        -> cadu-api GET /api/feed/{chunk_id}
//   POST /api/cadu/feed?path={chunk_id}/ask    -> cadu-api POST /api/feed/{chunk_id}/ask
//   POST /api/cadu/feed?path=admin/redeploy    -> cadu-api POST /api/admin/redeploy
//
// Mantém compatibilidade retroativa: GET sem ?path funciona igual antes.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const apiUrl = process.env.CADU_API_URL;
  const token = process.env.CADU_API_TOKEN;
  if (!apiUrl || !token) {
    return res.status(503).json({ error: 'cadu_api_not_configured' });
  }

  const subPath = (typeof req.query.path === 'string' ? req.query.path : '').replace(/^\/+|\/+$/g, '');
  const qs = new URLSearchParams();
  for (const k of Object.keys(req.query)) {
    if (k !== 'path') qs.set(k, String(req.query[k]));
  }
  const finalQs = qs.toString();

  // Detecta namespace (feed vs admin)
  let ns = 'feed';
  let cleanSubPath = subPath;
  if (subPath.startsWith('admin/')) {
    ns = 'admin';
    cleanSubPath = subPath.replace(/^admin\//, '');
  }

  const targetUrl = `${apiUrl.replace(/\/$/, '')}/api/${ns}${cleanSubPath ? '/' + cleanSubPath : ''}${finalQs ? '?' + finalQs : ''}`;

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'KinoCampus-Admin/1.0',
      },
      body: (req.method !== 'GET' && req.method !== 'HEAD')
        ? (req.body ? JSON.stringify(req.body) : undefined)
        : undefined,
      signal: AbortSignal.timeout(30000),
    });

    const text = await upstream.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: 'cadu_api_error',
        status: upstream.status,
        body,
      });
    }

    // Cache: lista do feed muda mais, sub-paths individuais não cacheiam
    if (!subPath && req.method === 'GET') {
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }

    return res.status(200).json(body);
  } catch (err) {
    return res.status(502).json({
      error: 'cadu_api_unreachable',
      message: String(err && err.message ? err.message : err),
    });
  }
}
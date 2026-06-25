// api/cadu/feed-router.js — proxy Vercel: feed chunks (detalhe + ask) + admin
//
// Roteia via rewrite + ?path=<sub-path>:
//   GET  /api/cadu/feed-router/{chunk_id}        → cadu-api GET /api/feed/{chunk_id}
//   POST /api/cadu/feed-router/{chunk_id}/ask    → cadu-api POST /api/feed/{chunk_id}/ask
//   POST /api/cadu/feed-router/admin/redeploy    → cadu-api POST /api/admin/redeploy
//
// Substitui feed.js (mantém /api/cadu/feed via rewrite direto se quiser).

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const CADU_API_URL = process.env.CADU_API_URL || '';
  const CADU_API_TOKEN = process.env.CADU_API_TOKEN || '';
  if (!CADU_API_URL || !CADU_API_TOKEN) {
    return res.status(503).json({ ok: false, error: 'CADU_API_URL/TOKEN not configured' });
  }

  // sub-path via query string
  let subPath = '';
  if (Array.isArray(req.query.path)) {
    subPath = req.query.path.join('/');
  } else if (typeof req.query.path === 'string') {
    subPath = req.query.path;
  } else {
    subPath = (req.url || '').split('?')[0].replace(/^\/api\/cadu\/feed-router\/?/, '').replace(/^\//, '');
  }

  // Strip /path do client query string
  const clientQueryString = (req.url || '').includes('?') ? req.url.split('?')[1] : '';
  const clientQs = new URLSearchParams(clientQueryString);
  clientQs.delete('path');
  const finalQueryString = clientQs.toString();

  // Detecta namespace pelo prefixo (feed vs admin)
  let upstreamNamespace = 'feed';
  if (subPath.startsWith('admin/')) {
    upstreamNamespace = 'admin';
    subPath = subPath.replace(/^admin\//, '');
  }

  const targetUrl = `${CADU_API_URL.replace(/\/$/, '')}/api/${upstreamNamespace}${subPath ? '/' + subPath : ''}${finalQueryString ? '?' + finalQueryString : ''}`;

  console.log(`[api/cadu/feed-router] ${req.method} ${subPath || '(root)'} → ${targetUrl.replace(CADU_API_TOKEN, '***')}`);

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${CADU_API_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: (req.method !== 'GET' && req.method !== 'HEAD')
        ? (req.body ? JSON.stringify(req.body) : undefined)
        : undefined,
      signal: AbortSignal.timeout(30000),
    });
    const ct = upstream.headers.get('content-type') || 'application/json';
    const body = await upstream.text();

  // Cache: lista do feed muda mais, chunks individuais sao raros
  if (!subPath && req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  } else {
    res.setHeader('Cache-Control', 'no-cache');
  }

  res.status(upstream.status).setHeader('Content-Type', ct).send(body);
  } catch (e) {
    res.status(502).json({ ok: false, error: `Upstream unreachable: ${e.message}` });
  }
}
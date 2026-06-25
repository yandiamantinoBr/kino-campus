// KinoCampus — proxy Vercel: /api/cadu/openclaw/[...path] → cadu-api

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

  let subPath = '';
  if (Array.isArray(req.query.path) && req.query.path.length) {
    subPath = req.query.path.join('/');
  } else {
    subPath = (req.url || '').split('?')[0].replace(/^\/api\/cadu\/openclaw\/?/, '').replace(/^\//, '');
  }
  const queryString = (req.url || '').includes('?') ? req.url.split('?')[1] : '';
  const targetUrl = `${CADU_API_URL.replace(/\/$/, '')}/api/openclaw${subPath ? '/' + subPath : ''}${queryString ? '?' + queryString : ''}`;

  try {
    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = req.body ? JSON.stringify(req.body) : undefined;
    }
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${CADU_API_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body,
    });
    const ct = upstream.headers.get('content-type') || 'application/json';
    const responseBody = await upstream.text();
    res.status(upstream.status).setHeader('Content-Type', ct).send(responseBody);
  } catch (e) {
    res.status(502).json({ ok: false, error: `Upstream unreachable: ${e.message}` });
  }
}
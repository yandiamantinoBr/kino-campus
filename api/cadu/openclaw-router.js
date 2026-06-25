// KinoCampus — proxy Vercel: /api/cadu/openclaw-router (1 function)
// Recebe qualquer sub-path via rewrite + query ?path=<sub-path>
// Pega: status, sessions, logs, heartbeat, agent-send (POST), agent-event (POST)

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

  // sub-path via query string (Vercel rewrite)
  let subPath = '';
  if (Array.isArray(req.query.path)) {
    subPath = req.query.path.join('/');
  } else if (typeof req.query.path === 'string') {
    subPath = req.query.path;
  } else {
    subPath = (req.url || '').split('?')[0].replace(/^\/api\/cadu\/openclaw-router\/?/, '').replace(/^\//, '');
  }

  const clientQueryString = (req.url || '').includes('?') ? req.url.split('?')[1] : '';
  const clientQs = new URLSearchParams(clientQueryString);
  clientQs.delete('path');
  const finalQueryString = clientQs.toString();

  const targetUrl = `${CADU_API_URL.replace(/\/$/, '')}/api/openclaw${subPath ? '/' + subPath : ''}${finalQueryString ? '?' + finalQueryString : ''}`;

  console.log(`[api/cadu/openclaw-router] ${req.method} ${subPath || '(root)'} → ${targetUrl.replace(CADU_API_TOKEN, '***')}`);

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${CADU_API_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: (req.method !== 'GET' && req.method !== 'HEAD') ? (req.body ? JSON.stringify(req.body) : undefined) : undefined,
    });
    const ct = upstream.headers.get('content-type') || 'application/json';
    const body = await upstream.text();
    res.status(upstream.status).setHeader('Content-Type', ct).send(body);
  } catch (e) {
    res.status(502).json({ ok: false, error: `Upstream unreachable: ${e.message}` });
  }
}
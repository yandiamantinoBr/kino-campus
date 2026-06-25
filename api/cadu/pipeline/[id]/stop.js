// KinoCampus — POST /api/cadu/pipeline/{id}/stop → cadu-api POST /api/pipeline/{id}/stop

export const config = {
  maxDuration: 30,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const CADU_API_URL = process.env.CADU_API_URL || '';
  const CADU_API_TOKEN = process.env.CADU_API_TOKEN || '';

  if (!CADU_API_URL || !CADU_API_TOKEN) {
    return res.status(503).json({ ok: false, error: 'CADU_API_URL/TOKEN not configured' });
  }

  // req.url é algo como "/api/cadu/pipeline/abc-123/stop" (full path no Vercel)
  const subPath = (req.url || '').split('?')[0].replace(/^\/api\/cadu\/pipeline\/?/, '').replace(/^\//, '');
  const targetUrl = `${CADU_API_URL.replace(/\/$/, '')}/api/pipeline/${subPath}`;
  console.log(`[api/cadu/pipeline/.../stop] POST → ${targetUrl.replace(CADU_API_TOKEN, '***')}`);

  try {
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CADU_API_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
    const ct = upstream.headers.get('content-type') || 'application/json';
    const body = await upstream.text();
    res.status(upstream.status).setHeader('Content-Type', ct).send(body);
  } catch (e) {
    res.status(502).json({ ok: false, error: `Upstream unreachable: ${e.message}` });
  }
}
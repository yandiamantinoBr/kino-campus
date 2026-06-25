// KinoCampus — proxy Vercel catch-all: /api/cadu/pipeline/[...path] → cadu-api
//
// Pega sub-paths: /run, /{id}, /{id}/stop, /{id}/stream
// SSE via res.write() (Node serverless + Fluid Compute, maxDuration:300 = 5min)

export const config = {
  maxDuration: 300,
};

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

  // Detecta sub-path: req.query.path (modo catch-all) ou req.url (modo "exact")
  let subPath = '';
  if (Array.isArray(req.query.path) && req.query.path.length) {
    subPath = req.query.path.join('/');
  } else {
    subPath = (req.url || '').split('?')[0].replace(/^\/api\/cadu\/pipeline\/?/, '').replace(/^\//, '');
  }
  const queryString = (req.url || '').includes('?') ? req.url.split('?')[1] : '';
  const targetUrl = `${CADU_API_URL.replace(/\/$/, '')}/api/pipeline${subPath ? '/' + subPath : ''}${queryString ? '?' + queryString : ''}`;

  // SSE: GET + path termina com "/stream"
  const isSSE = req.method === 'GET' && subPath.endsWith('/stream');

  try {
    if (isSSE) {
      const upstream = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${CADU_API_TOKEN}`,
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      });
      if (!upstream.ok || !upstream.body) {
        const errBody = await upstream.text().catch(() => '');
        res.status(upstream.status).setHeader('Content-Type', 'application/json').end(errBody);
        return;
      }
      // SSE headers
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            res.write(decoder.decode(value, { stream: true }));
          }
        }
      } catch (e) {
        console.error('[api/cadu/pipeline/.../stream] SSE error:', e.message);
      } finally {
        res.end();
      }
      return;
    }

    // Non-SSE
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
// KinoCampus — GET /api/cadu/pipeline/{id}/stream → cadu-api SSE stream
//
// SSE streaming via res.write() — Vercel Node serverless + Fluid Compute
// suporta streaming sem timeout curto (maxDuration:300 = 5min).

export const config = {
  maxDuration: 300, // 5min — suficiente pra runs longos
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const CADU_API_URL = process.env.CADU_API_URL || '';
  const CADU_API_TOKEN = process.env.CADU_API_TOKEN || '';

  if (!CADU_API_URL || !CADU_API_TOKEN) {
    return res.status(503).json({ ok: false, error: 'CADU_API_URL/TOKEN not configured' });
  }

  // req.url é algo como "/api/cadu/pipeline/abc-123/stream"
  const subPath = (req.url || '').split('?')[0].replace(/^\/api\/cadu\/pipeline\/?/, '').replace(/^\//, '');
  const queryString = (req.url || '').includes('?') ? req.url.split('?')[1] : '';
  const targetUrl = `${CADU_API_URL.replace(/\/$/, '')}/api/pipeline/${subPath}${queryString ? '?' + queryString : ''}`;
  console.log(`[api/cadu/pipeline/.../stream] GET → ${targetUrl.replace(CADU_API_TOKEN, '***')}`);

  try {
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

    // Stream chunks do upstream pro response
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
      }
    } catch (e) {
      console.error(`[api/cadu/pipeline/.../stream] SSE error: ${e.message}`);
    } finally {
      res.end();
    }
  } catch (e) {
    res.status(502).json({ ok: false, error: `Upstream unreachable: ${e.message}` });
  }
}
// KinoCampus — proxy Node serverless: /api/cadu/pipeline[/*] → cadu-api (VPS)
//
// Suporta streaming SSE via `res.write()` (Node 20+ Fluid Compute).
//
// Cobre tanto o "root" /api/cadu/pipeline quanto sub-paths:
//   - POST /api/cadu/pipeline/run          → cria run
//   - POST /api/cadu/pipeline/{id}/stop    → mata subprocess
//   - GET  /api/cadu/pipeline/{id}/stream  → SSE ao vivo (esse é o caso crítico)
//   - GET  /api/cadu/pipeline/{id}         → status
//   - GET  /api/cadu/pipeline/runs         → histórico

const CADU_API_URL = process.env.CADU_API_URL || '';
const CADU_API_TOKEN = process.env.CADU_API_TOKEN || '';

export const config = {
  // Fluid compute + Node 20 → suporta streaming via res.write() sem timeout curto.
  // SSE usa Content-Type text/event-stream e mantém conexão aberta.
  maxDuration: 300, // 5min — suficiente pra runs longos (curator, ig, etc)
};

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!CADU_API_URL || !CADU_API_TOKEN) {
    return res.status(503).json({ ok: false, error: 'CADU_API_URL/TOKEN not configured' });
  }

  // Extrai sub-path: req.url vem como "/api/cadu/pipeline/run" ou "/api/cadu/pipeline".
  // Vercel Node serverless: req.url é path completo.
  const fullPath = (req.url || '').split('?')[0];
  const subPath = fullPath.replace(/^\/api\/cadu\/pipeline\/?/, '').replace(/^\//, '');

  // Detecta SSE: GET + path termina com "/stream"
  const isSSE = req.method === 'GET' && subPath.endsWith('/stream');

  // Monta URL upstream (preserva query string ?token=xxx)
  const queryString = (req.url || '').includes('?') ? req.url.split('?')[1] : '';
  const targetUrl = `${CADU_API_URL.replace(/\/$/, '')}/api/pipeline${subPath ? '/' + subPath : ''}${queryString ? '?' + queryString : ''}`;

  console.log(`[api/cadu/pipeline] ${req.method} ${subPath || '(root)'} isSSE=${isSSE}`);

  try {
    // SSE: faz streaming do upstream body pro browser sem buffering
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
      // Headers SSE
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();
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
        console.error(`[api/cadu/pipeline] SSE stream error: ${e.message}`);
      } finally {
        res.end();
      }
      return;
    }

    // Non-SSE: fetch normal + repassa body
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
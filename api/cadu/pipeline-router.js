// KinoCampus — proxy Vercel: /api/cadu/pipeline-router (1 function)
// Recebe qualquer sub-path via rewrite + query ?path=<sub-path>
// Pega: /run, /{id}, /{id}/stop, /{id}/stream
// SSE via res.write() (Node serverless + Fluid Compute, maxDuration:300 = 5min)

export const config = {
  maxDuration: 300,
};

import { requireCaduAdmin, stripCaduAdminQuery } from '../../server/cadu-auth.mjs';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const admin = await requireCaduAdmin(req, res);
  if (!admin) return;

  const CADU_API_URL = process.env.CADU_API_URL || '';
  const CADU_API_TOKEN = process.env.CADU_API_TOKEN || '';
  if (!CADU_API_URL || !CADU_API_TOKEN) {
    return res.status(503).json({ ok: false, error: 'CADU_API_URL/TOKEN not configured' });
  }

  // sub-path vem via query string (Vercel rewrite: ?path=$1)
  let subPath = '';
  if (Array.isArray(req.query.path)) {
    subPath = req.query.path.join('/');
  } else if (typeof req.query.path === 'string') {
    subPath = req.query.path;
  } else {
    // fallback: parse de req.url (caso rewrite não passe ?path)
    subPath = (req.url || '').split('?')[0].replace(/^\/api\/cadu\/pipeline-router\/?/, '').replace(/^\//, '');
  }

  // query string original do cliente. Remove o JWT admin antes de encaminhar
  // para a VPS; a VPS recebe apenas o CADU_API_TOKEN server-side.
  const clientQueryString = (req.url || '').includes('?') ? req.url.split('?')[1] : '';
  const finalQueryString = stripCaduAdminQuery(clientQueryString);

  const targetUrl = `${CADU_API_URL.replace(/\/$/, '')}/api/pipeline${subPath ? '/' + subPath : ''}${finalQueryString ? '?' + finalQueryString : ''}`;

  // SSE: GET + path termina com "/stream"
  const isSSE = req.method === 'GET' && subPath.endsWith('/stream');

  console.log(`[api/cadu/pipeline-router] ${req.method} ${subPath || '(root)'} isSSE=${isSSE} → ${targetUrl.replace(CADU_API_TOKEN, '***')}`);

  try {
    if (isSSE) {
      const upstreamController = new AbortController();
      const abortUpstream = () => upstreamController.abort();
      req.once('aborted', abortUpstream);
      res.once('close', abortUpstream);
      const upstream = await fetch(targetUrl, {
        method: 'GET',
        signal: upstreamController.signal,
        headers: {
          Authorization: `Bearer ${CADU_API_TOKEN}`,
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      });
      if (!upstream.ok || !upstream.body) {
        const errBody = await upstream.text().catch(() => '');
        req.off('aborted', abortUpstream);
        res.off('close', abortUpstream);
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
          if (value) res.write(decoder.decode(value, { stream: true }));
        }
      } catch (e) {
        if (e && e.name !== 'AbortError') {
          console.error('[api/cadu/pipeline-router] SSE error:', e.message);
        }
      } finally {
        try { await reader.cancel(); } catch {}
        req.off('aborted', abortUpstream);
        res.off('close', abortUpstream);
        abortUpstream();
        if (!res.writableEnded && !res.destroyed) res.end();
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
    if (res.writableEnded || res.destroyed) return;
    res.status(502).json({ ok: false, error: `Upstream unreachable: ${e.message}` });
  }
}

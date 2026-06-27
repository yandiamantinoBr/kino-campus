// api/cadu/feed.js — proxy admin para cadu-api /api/feed (chunks do Cadu)
//
// Endpoints expostos:
// - GET  /api/cadu/feed?limit=N
// - GET  /api/cadu/feed?path={chunk_id}
// - POST /api/cadu/feed?path={chunk_id}/ask
// - POST /api/cadu/feed?path=admin/redeploy

import { requireCaduAdmin, stripCaduAdminQuery } from '../../server/cadu-auth.mjs';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed', message: 'Use GET ou POST' });
  }

  const admin = await requireCaduAdmin(req, res);
  if (!admin) return;

  const apiUrl = process.env.CADU_API_URL;
  const token = process.env.CADU_API_TOKEN;
  if (!apiUrl || !token) {
    return res.status(503).json({ error: 'cadu_api_not_configured' });
  }

  const rawPath = Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path;
  const subPath = (typeof rawPath === 'string' ? rawPath : '').replace(/^\/+|\/+$/g, '');
  const clientQueryString = (req.url || '').includes('?') ? req.url.split('?')[1] : '';
  const finalQs = stripCaduAdminQuery(clientQueryString);

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

    if (!subPath && req.method === 'GET') {
      res.setHeader('Cache-Control', 'private, max-age=60');
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

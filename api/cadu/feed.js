// api/cadu/feed.js — proxy admin para itens públicos dos artefatos do Curador.
//
// Endpoints expostos:
// - GET  /api/cadu/feed?limit=N
// - GET  /api/cadu/feed?path={chunk_id}
// - POST /api/cadu/feed?path={chunk_id}/ask

import { requireCaduAdmin, stripCaduAdminQuery } from '../../server/cadu-auth.mjs';

export const config = {
  maxDuration: 300,
};

export function classifyCaduFeedPath(subPath) {
  if (subPath === 'admin' || subPath.startsWith('admin/')) return 'retired_admin';
  const segments = subPath ? subPath.split('/') : [];
  const validChunkId = (value) => /^[A-Za-z0-9_-]{1,128}$/.test(value || '');
  if (segments.length === 0) return 'list';
  if (segments.length === 1 && validChunkId(segments[0])) return 'chunk';
  if (segments.length === 2 && validChunkId(segments[0]) && segments[1] === 'ask') {
    return 'ask';
  }
  return null;
}

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

  const rawPath = Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path;
  const subPath = (typeof rawPath === 'string' ? rawPath : '').replace(/^\/+|\/+$/g, '');
  const routeKind = classifyCaduFeedPath(subPath);
  if (routeKind === 'retired_admin') {
    return res.status(410).json({
      error: 'cadu_admin_capability_retired',
      message: 'Operacoes administrativas internas do Cadu foram desativadas.',
    });
  }
  if (!routeKind) {
    return res.status(400).json({ error: 'invalid_cadu_feed_path' });
  }
  if ((routeKind === 'ask' && req.method !== 'POST')
      || (routeKind !== 'ask' && req.method !== 'GET')) {
    return res.status(405).json({ error: 'method_not_allowed_for_cadu_feed_path' });
  }

  const apiUrl = process.env.CADU_API_URL;
  const token = process.env.CADU_API_TOKEN;
  if (!apiUrl || !token) {
    return res.status(503).json({ error: 'cadu_api_not_configured' });
  }

  const clientQueryString = (req.url || '').includes('?') ? req.url.split('?')[1] : '';
  const finalQs = stripCaduAdminQuery(clientQueryString);
  const targetUrl = `${apiUrl.replace(/\/$/, '')}/api/feed${subPath ? '/' + subPath : ''}${finalQs ? '?' + finalQs : ''}`;

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
      signal: AbortSignal.timeout(routeKind === 'ask' ? 285000 : 30000),
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

// api/cadu/sites.js — proxy admin para cadu-api /api/sites (VPS Hostinger)
//
// Cliente público autentica com JWT Supabase de admin. O serverless valida
// profiles.is_admin/kc_is_admin e só então usa CADU_API_TOKEN server-side.
//
// Endpoints expostos:
// - GET   /api/cadu/sites
// - GET   /api/cadu/sites/{unit_id}/meta       (via rewrite ?path=...)
// - PATCH /api/cadu/sites/{unit_id}/meta       (via rewrite ?path=...)

import { requireCaduAdmin } from '../../server/cadu-auth.mjs';

export default async function handler(req, res) {
  // CORS permissivo para preflight; dados continuam protegidos por JWT admin.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'method_not_allowed', message: 'Use GET ou PATCH' });
  }

  const admin = await requireCaduAdmin(req, res);
  if (!admin) return;

  const apiUrl = process.env.CADU_API_URL;
  const token = process.env.CADU_API_TOKEN;

  if (!apiUrl || !token) {
    return res.status(503).json({
      error: 'cadu_api_not_configured',
      message: 'CADU_API_URL/CADU_API_TOKEN ausentes no servidor',
    });
  }

  try {
    const rawPath = Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path;
    const subPath = (typeof rawPath === 'string' ? rawPath : '').replace(/^\/+|\/+$/g, '');
    const targetUrl = `${apiUrl.replace(/\/$/, '')}/api/sites${subPath ? '/' + subPath : ''}`;

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
      signal: AbortSignal.timeout(25000),
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

    res.setHeader('Cache-Control', req.method === 'GET' && !subPath ? 'private, max-age=300' : 'no-cache');
    return res.status(200).json(body);
  } catch (err) {
    return res.status(502).json({
      error: 'cadu_api_unreachable',
      message: String(err && err.message ? err.message : err),
    });
  }
}

// api/cadu/publish.js — proxy admin para cadu-api POST /api/publish (VPS Hostinger)
//
// Recebe um site sugerido pelo admin Cadu e dispara a publicação no feed
// KinoCampus. O cliente público autentica com JWT Supabase de admin; o
// CADU_API_TOKEN permanece apenas no serverless.

import { requireCaduAdmin } from '../../server/cadu-auth.mjs';
import { fetchCaduUpstream } from '../../server/cadu-upstream-fetch.js';

const REVIEW_POLICY = Object.freeze({
  intent: 'review',
  contentKind: 'institutional_site',
  origin: 'cadu-admin-map-ufg',
});
const UNSAFE_REVIEW_NOTE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

function canonicalReviewNote(value) {
  return String(value ?? '').trim();
}

function canonicalHttpsUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return '';
    return parsed.toString();
  } catch (_) {
    return '';
  }
}

function institutionalReviewPayload(body) {
  const sourceId = String(body.source_id || '').trim();
  const sourceRevision = String(body.source_revision || '').trim();
  const registrySha256 = String(body.registry_sha256 || '').trim();
  const sourceUrl = canonicalHttpsUrl(body.source_url);
  const contentUrl = canonicalHttpsUrl(body.content_url);
  const name = typeof body.name === 'string' ? body.name.normalize('NFKC').trim() : '';
  const instagramHandle = body.instagram_handle == null || String(body.instagram_handle).trim() === ''
    ? null
    : String(body.instagram_handle).trim();
  const expectedKey = `map-ufg-review:${sourceId}:${sourceRevision}`;
  const tier = body.tier == null || body.tier === '' ? null : body.tier;
  const normalizedNote = body.note == null ? '' : canonicalReviewNote(body.note);
  const note = normalizedNote === '' ? null : normalizedNote;
  const category = typeof body.category === 'string' && body.category.trim()
    ? body.category.trim()
    : 'institutional';

  if (body.intent !== REVIEW_POLICY.intent || body.content_kind !== REVIEW_POLICY.contentKind) {
    return { error: 'intent/content_kind incompatíveis com revisão institucional' };
  }
  if (body.source !== REVIEW_POLICY.origin) {
    return { error: 'source deve identificar o Mapa UFG do admin' };
  }
  if (!/^web\.[a-z0-9][a-z0-9.-]{0,115}$/.test(sourceId)) {
    return { error: 'source_id canônico inválido' };
  }
  if (!sourceUrl || !contentUrl) {
    return { error: 'source_url e content_url devem ser URLs HTTPS válidas' };
  }
  if (sourceUrl !== contentUrl) {
    return { error: 'content_url deve coincidir com source_url nesta política' };
  }
  if (!/^[a-f0-9]{64}$/.test(sourceRevision) || !/^[a-f0-9]{64}$/.test(registrySha256)) {
    return { error: 'source_revision e registry_sha256 devem ser SHA-256 lowercase' };
  }
  if (String(body.idempotency_key || '').trim() !== expectedKey) {
    return { error: 'idempotency_key não corresponde à revisão da fonte' };
  }
  if (name.length < 2 || name.length > 200 || /[\u0000-\u001f\u007f]/.test(name)) {
    return { error: 'name inválido para revisão institucional' };
  }
  if (instagramHandle !== null && !/^[a-z0-9._]{1,30}$/.test(instagramHandle)) {
    return { error: 'instagram_handle deve ser canônico, sem @ ou URL' };
  }
  if (tier !== null && (!Number.isInteger(tier) || tier < 1 || tier > 3)) {
    return { error: 'tier deve ser 1, 2, 3 ou null' };
  }
  if (note !== null && (note.length > 500 || UNSAFE_REVIEW_NOTE_CONTROL.test(note))) {
    return { error: 'note inválida para revisão institucional' };
  }

  return {
    payload: {
      action: 'review',
      intent: REVIEW_POLICY.intent,
      source_id: sourceId,
      source_url: sourceUrl,
      content_url: contentUrl,
      instagram_handle: instagramHandle,
      content_kind: REVIEW_POLICY.contentKind,
      idempotency_key: expectedKey,
      source_revision: sourceRevision,
      registry_sha256: registrySha256,
      name,
      note,
      tier,
      category: category.slice(0, 80),
      source: REVIEW_POLICY.origin,
    },
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed', message: 'Use POST' });
  }

  const admin = await requireCaduAdmin(req, res);
  if (!admin) return;

  const apiUrl = process.env.CADU_API_URL;
  const token = process.env.CADU_API_TOKEN;
  if (!apiUrl || !token) {
    return res.status(503).json({ error: 'cadu_api_not_configured', message: 'CADU_API_URL/CADU_API_TOKEN ausentes' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const action = String(body.action || 'publish').trim();
  if (action !== 'publish' && action !== 'review') {
    return res.status(400).json({ error: 'invalid_body', message: 'action deve ser publish ou review' });
  }

  let upstreamBody;
  if (action === 'review') {
    const review = institutionalReviewPayload(body);
    if (review.error) {
      return res.status(400).json({ error: 'invalid_body', message: review.error });
    }
    upstreamBody = review.payload;
  } else {
    // Contrato legado de publish preservado integralmente.
    if (!body.name || typeof body.name !== 'string') {
      return res.status(400).json({ error: 'invalid_body', message: 'Campo "name" é obrigatório' });
    }
    const instagramHandle = String(body.instagram || '')
      .trim()
      .replace(/^@/, '')
      .replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, '')
      .split(/[/?#]/)[0]
      .trim();
    let targetUrl = String(body.url || '').trim();
    if (/^http:\/\//i.test(targetUrl)) targetUrl = targetUrl.replace(/^http:\/\//i, 'https://');
    if (!targetUrl && instagramHandle) targetUrl = `https://www.instagram.com/${instagramHandle}/`;
    if (!/^https:\/\//i.test(targetUrl)) {
      return res.status(400).json({ error: 'invalid_body', message: 'Campo "url" deve ser uma URL HTTPS ou a fonte deve ter Instagram' });
    }
    upstreamBody = {
      name: body.name.trim(),
      url: targetUrl,
      instagram: body.instagram || null,
      note: body.note || null,
      tier: body.tier || null,
      category: body.category || null,
      source: body.source || 'cadu-admin',
    };
  }

  try {
    const upstream = await fetchCaduUpstream(`${apiUrl.replace(/\/$/, '')}/api/publish`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'KinoCampus-Admin/1.0',
      },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(30000),
    }, {
      operation: `publish.${action}`,
    });

    const text = await upstream.text();
    let respBody;
    try { respBody = JSON.parse(text); } catch { respBody = { raw: text }; }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: 'cadu_api_error',
        status: upstream.status,
        body: respBody,
      });
    }

    return res.status(200).json(respBody);
  } catch (err) {
    return res.status(502).json({
      error: 'cadu_api_unreachable',
      message: String(err && err.message ? err.message : err),
    });
  }
}

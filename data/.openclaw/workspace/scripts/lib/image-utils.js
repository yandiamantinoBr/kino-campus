'use strict';

function normalizeImageUrl(raw) {
  const value = String(raw || '').replace(/&amp;/g, '&').trim();
  if (!value) return '';

  // Weby/UFG uses /up/<id>/l/ and /up/<id>/i/ for reduced images.
  // Prefer /o/ so the publisher uploads the best available original.
  const upgraded = value
    .replace(/\/up\/(\d+)\/(?:l|i|m|s)\//i, '/up/$1/o/')
    .replace(/\/up\/(\d+)\/thumb\//i, '/up/$1/o/');

  try {
    const url = new URL(upgraded);
    if (!/^https?:$/.test(url.protocol)) return '';
    if (/\.svg(?:$|[?#])/i.test(url.pathname)) return '';
    return url.toString();
  } catch (_) {
    // Curador resolves relative URLs after this helper runs.
    if (/^\/[^/]/.test(upgraded) && !/\.svg(?:$|[?#])/i.test(upgraded)) return upgraded;
    return upgraded;
  }
}

function isThumbnailUrl(raw) {
  const value = String(raw || '').toLowerCase();
  return /\/up\/\d+\/(?:l|i|m|s|thumb)\//.test(value) ||
    /\b(?:thumb|thumbnail|small|icone|icon)\b/.test(value);
}

async function validateImageUrl(raw, options = {}) {
  const url = String(raw || '').trim();
  const minBytes = Number.isFinite(options.minBytes) ? options.minBytes : 30000;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 12000;
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, bytes: 0, contentType: '', error: 'invalid_url' };
  }

  const fetchWithTimeout = async (method) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        method,
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; KinoCadu/1.0)',
        },
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let resp = await fetchWithTimeout('HEAD');
    if (!resp.ok || !resp.headers.get('content-length')) {
      resp = await fetchWithTimeout('GET');
    }
    if (!resp.ok) {
      return { ok: false, bytes: 0, contentType: '', error: `http_${resp.status}` };
    }
    let bytes = Number(resp.headers.get('content-length') || 0);
    if (!bytes && resp.body && resp.arrayBuffer) {
      const buf = await resp.arrayBuffer();
      bytes = buf.byteLength;
    }
    const contentType = resp.headers.get('content-type') || '';
    if (!/^image\//i.test(contentType)) {
      return { ok: false, bytes, contentType, error: 'not_image' };
    }
    if (bytes > 0 && bytes < minBytes) {
      return { ok: false, bytes, contentType, error: 'too_small' };
    }
    return { ok: true, bytes, contentType };
  } catch (e) {
    const name = e && e.name === 'AbortError' ? 'timeout' : (e && e.message) || 'fetch_failed';
    return { ok: false, bytes: 0, contentType: '', error: String(name).slice(0, 80) };
  }
}

module.exports = {
  normalizeImageUrl,
  isThumbnailUrl,
  validateImageUrl,
};

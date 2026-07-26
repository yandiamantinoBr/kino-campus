#!/usr/bin/env node
'use strict';

const INSTAGRAM_HANDLE_PATTERN = /^[A-Za-z0-9._]{1,30}$/;
const INSTAGRAM_SHORTCODE_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function parseInstagramPostUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const hostname = parsed.hostname.toLowerCase().replace(/^(?:www\.|m\.)/, '');
    if (parsed.protocol !== 'https:'
        || hostname !== 'instagram.com'
        || parsed.username
        || parsed.password
        || parsed.port) return null;

    const segments = parsed.pathname.split('/').filter(Boolean);
    const direct = segments.length === 2
      && ['p', 'reel'].includes(String(segments[0] || '').toLowerCase());
    const prefixed = segments.length === 3
      && INSTAGRAM_HANDLE_PATTERN.test(String(segments[0] || ''))
      && ['p', 'reel'].includes(String(segments[1] || '').toLowerCase());
    if (!direct && !prefixed) return null;

    const kind = String(segments[direct ? 0 : 1]).toLowerCase();
    const shortcode = String(segments[direct ? 1 : 2] || '');
    if (!INSTAGRAM_SHORTCODE_PATTERN.test(shortcode)) return null;
    return {
      kind,
      shortcode,
      handle: prefixed ? String(segments[0]).toLowerCase() : '',
      url: parsed.href,
    };
  } catch (_) {
    return null;
  }
}

function instagramPostShortcode(value) {
  return parseInstagramPostUrl(value)?.shortcode || '';
}

function instagramPermalinkKey(value) {
  const shortcode = instagramPostShortcode(value);
  return shortcode ? `instagram:${shortcode}` : '';
}

function canonicalInstagramPostUrl(value) {
  const parsed = parseInstagramPostUrl(value);
  return parsed
    ? `https://www.instagram.com/${parsed.kind}/${parsed.shortcode}/`
    : '';
}

module.exports = {
  canonicalInstagramPostUrl,
  instagramPermalinkKey,
  instagramPostShortcode,
  parseInstagramPostUrl,
};

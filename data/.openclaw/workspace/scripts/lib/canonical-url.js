#!/usr/bin/env node
'use strict';

/**
 * Canonical URL identity shared by every KinoCampus deduplication stage.
 *
 * Version 2 fixes the destructive ambiguity from treating every
 * `https://ufg.br/events?event=<id>` URL as the same `ufg.br/events` key.
 * Consumers must compare `key` values produced by the same version.
 *
 * Version 3 (2026-07-25, Fix W) added `slug` extraction from Weby URLs.
 * The Weby CMS uses TWO numeric IDs for the same event:
 *   - /e/{event_id}-slug-do-evento (event page, id = the event)
 *   - /n/{news_id}-slug-do-evento (news article about the event, id = the news)
 * Both URLs share the same slug (e.g., "cerise-summit-2026"), which is the
 * canonical identity. Previous version treated /e/ and /n/ as distinct URLs
 * even when they referred to the same event.
 *
 * Version 4 keeps `/events?event={id}` and `/e/{id}-slug` equivalent again.
 * Version 3 appended the slug to only the `/e/` key, which accidentally split
 * those two forms. Cross `/e/` and `/n/` identity remains available through
 * `webySameEvent`, where the shared slug is the appropriate signal.
 *
 * Consumers must compare `key` values produced by the same version.
 */
const URL_IDENTITY_VERSION = 'cadu-url-identity-v4';

const TRACKING_PARAMETER = /^(?:utm_[a-z0-9_]+|fbclid|gclid|dclid|msclkid|igshid|mc_cid|mc_eid)$/i;

function normalizePath(pathname) {
  const path = String(pathname || '/').replace(/\/+$/, '');
  return (path || '').toLowerCase();
}

function normalizedSemanticQuery(searchParams) {
  const entries = [];
  for (const [name, value] of searchParams.entries()) {
    if (TRACKING_PARAMETER.test(name)) continue;
    entries.push([name, value]);
  }
  // Locale-sensitive ordering would make a signed artifact depend on the OS
  // locale. UTF-8 byte ordering is deterministic and can be reproduced by the
  // Python preflight validator byte-for-byte.
  entries.sort(([leftName, leftValue], [rightName, rightValue]) => (
    Buffer.compare(Buffer.from(leftName, 'utf8'), Buffer.from(rightName, 'utf8'))
    || Buffer.compare(Buffer.from(leftValue, 'utf8'), Buffer.from(rightValue, 'utf8'))
  ));
  const normalized = new URLSearchParams();
  for (const [name, value] of entries) normalized.append(name, value);
  return normalized.toString();
}

function normalizeEventId(value) {
  if (!/^\d+$/.test(String(value || ''))) return null;
  return String(value).replace(/^0+(?=\d)/, '');
}

/**
 * Fix W (2026-07-25): Extract the Weby event slug from a URL like
 *   /e/39293-evento-de-extensao-cerise-summit-2026
 *   /n/202881-evento-de-extensao-cerise-summit-2026
 * Both share the slug "evento-de-extensao-cerise-summit-2026", which is
 * the canonical identity (the numeric prefix is the ID, the suffix is the slug).
 *
 * Returns { kind: 'event'|'news', id: string, slug: string } or null.
 */
function extractWebyEvent(value) {
  if (typeof value !== 'string') return null;
  const m = value.match(/\/(e|n)\/(\d+)(?:-([^?#\/]+))?/);
  if (!m) return null;
  return {
    kind: m[1] === 'e' ? 'event' : 'news',
    id: m[2],
    slug: (m[3] || '').toLowerCase(),
  };
}

function canonicalUrlDetails(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return {
      version: URL_IDENTITY_VERSION,
      valid: false,
      key: '',
      kind: 'invalid',
      host: '',
      path: '',
      eventId: null,
      slug: '',
    };
  }

  try {
    const parsed = new URL(value.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
    if (parsed.username || parsed.password || !parsed.hostname) throw new Error('unsafe authority');

    const host = parsed.host.toLowerCase();
    const path = normalizePath(parsed.pathname);
    let eventId = null;
    let slug = '';

    // The Weby event endpoint exists in two equivalent forms:
    //   /events?event=39173 and /e/39173-slug-do-evento.
    // Only interpret the query parameter on the actual /events endpoint;
    // an unrelated page with an `event` parameter remains a distinct URL.
    if (path === '/events') eventId = normalizeEventId(parsed.searchParams.get('event'));
    if (!eventId) {
      const eventPath = path.match(/\/e\/(\d+)(?:-|$)/);
      if (eventPath) eventId = normalizeEventId(eventPath[1]);
    }

    if (eventId) {
      // Fix W: also extract the slug from the URL (e.g., "cerise-summit-2026")
      // so /e/{id} and /n/{id} for the same event share the same canonical key.
      const webyEvent = extractWebyEvent(value);
      slug = (webyEvent && webyEvent.slug) || '';
      // v4: the numeric event ID is canonical for both query and /e/ forms.
      // The slug remains in details for safe /e/ vs /n/ corroboration.
      const key = `${host}/events/${eventId}`;
      return {
        version: URL_IDENTITY_VERSION,
        valid: true,
        key,
        kind: 'weby-event',
        host,
        path,
        eventId,
        slug,
      };
    }

    const semanticQuery = normalizedSemanticQuery(parsed.searchParams);
    const key = `${host}${path}${semanticQuery ? `?${semanticQuery}` : ''}`;
    return {
      version: URL_IDENTITY_VERSION,
      valid: true,
      key,
      kind: 'url',
      host,
      path,
      eventId: null,
      slug: '',
    };
  } catch (_) {
    return {
      version: URL_IDENTITY_VERSION,
      valid: false,
      key: '',
      kind: 'invalid',
      host: '',
      path: '',
      eventId: null,
      slug: '',
    };
  }
}

function canonicalUrl(value) {
  return canonicalUrlDetails(value).key;
}

/**
 * Fix W (2026-07-25): Check if two URLs are Weby URLs that refer to the
 * same event. Both /e/{id} and /n/{id} for the same event share a slug, so
 * we compare by host + slug.
 *
 * Returns true if both URLs:
 *   - are valid
 *   - have the same host
 *   - have non-empty matching slugs
 *   - refer to the same event in Weby (kind in {weby-event, news})
 */
function webySameEvent(urlA, urlB) {
  const a = extractWebyEvent(urlA);
  const b = extractWebyEvent(urlB);
  if (!a || !b) return false;
  if (!a.slug || !b.slug) return false;
  try {
    const hostA = new URL(urlA).host.toLowerCase();
    const hostB = new URL(urlB).host.toLowerCase();
    if (hostA !== hostB) return false;
  } catch (_) {
    return false;
  }
  return a.slug === b.slug;
}

module.exports = {
  URL_IDENTITY_VERSION,
  canonicalUrl,
  canonicalUrlDetails,
  extractWebyEvent,
  webySameEvent,
};

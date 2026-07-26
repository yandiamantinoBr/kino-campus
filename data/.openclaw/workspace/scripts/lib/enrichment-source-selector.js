'use strict';

function normalizeHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
  } catch (_) {
    return '';
  }
}

function nonEnrichableSourceReason(value) {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) return 'invalid_url';
  const parsed = new URL(normalized);
  const host = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();

  if (host === 'forms.gle') return 'form_provider';
  if (host === 'docs.google.com' && (pathname === '/forms' || pathname.startsWith('/forms/'))) {
    return 'form_provider';
  }
  return null;
}

function normalizeSourceEntries(values) {
  return (Array.isArray(values) ? values : [])
    .map((entry) => {
      const source = typeof entry === 'string' ? { url: entry } : (entry || {});
      return {
        url: normalizeHttpUrl(source.url || source.value),
        type: String(source.type || '').trim().toLowerCase(),
      };
    })
    .filter(entry => entry.url);
}

function selectEnrichmentSourceUrl({ preferredUrls = [], enrichmentSources = [], fallbackUrls = [] } = {}) {
  const sources = normalizeSourceEntries(enrichmentSources);
  const official = sources.filter(source => ['official', 'event', 'source'].includes(source.type));
  const supplemental = sources.filter(source => !['official', 'event', 'source'].includes(source.type));
  const candidates = [
    ...(Array.isArray(preferredUrls) ? preferredUrls : []),
    ...official.map(source => source.url),
    ...supplemental.map(source => source.url),
    ...(Array.isArray(fallbackUrls) ? fallbackUrls : []),
  ].map(normalizeHttpUrl).filter(Boolean);
  const unique = [...new Set(candidates)];

  return unique.find(url => nonEnrichableSourceReason(url) === null) || unique[0] || '';
}

module.exports = {
  nonEnrichableSourceReason,
  normalizeHttpUrl,
  selectEnrichmentSourceUrl,
};

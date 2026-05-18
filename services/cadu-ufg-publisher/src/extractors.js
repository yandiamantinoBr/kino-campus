'use strict';

const { canonicalizeUrl, decodeEntities, extractUrls, normalizeWhitespace, stripHtml } = require('./utils');

function buildWebyUrl(source, item, type) {
  if (item.redirect_url) return canonicalizeUrl(item.redirect_url, source.baseUrl);
  if (item.url) return canonicalizeUrl(item.url, source.baseUrl);
  if (item.slug && item.id) return canonicalizeUrl(`/${type === 'event' ? 'e' : 'n'}/${item.id}-${item.slug}`, source.baseUrl);
  if (item.slug) return canonicalizeUrl(`/n/${item.slug}`, source.baseUrl);
  return source.baseUrl;
}

function cleanTitle(value) {
  return normalizeWhitespace(value)
    .replace(/\s*[|-]\s*UFG\s*-\s*Universidade Federal de Goi[aá]s.*$/i, '')
    .replace(/\s*[|-]\s*Universidade Federal de Goi[aá]s.*$/i, '')
    .replace(/\s*[|-]\s*UFG\s*$/i, '');
}

function resolveAssetUrl(value, baseUrl) {
  const raw = decodeEntities(String(value || '').trim());
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('mailto:')) return '';
  if (/^https?:\/\//i.test(raw)) return canonicalizeUrl(raw);
  if (/^\/\//.test(raw)) return canonicalizeUrl(`https:${raw}`);
  return canonicalizeUrl(raw, baseUrl);
}

function extractFirstImageUrl(html, baseUrl) {
  const metaImage = extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image');
  const fromMeta = resolveAssetUrl(metaImage, baseUrl);
  if (fromMeta) return fromMeta;
  const match = String(html || '').match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
  return match ? resolveAssetUrl(match[1], baseUrl) : '';
}

function normalizeWebyItem(source, item, type = 'news') {
  const html = String(item.text || item.body || item.summary || '');
  const title = cleanTitle(decodeEntities(item.title || item.name || ''));
  const text = stripHtml(html || item.summary || '');
  const sourceUrl = buildWebyUrl(source, item, type);
  const updatedAt = item.updated_at || item.date_begin_at || item.created_at || item.published_at || '';
  const rawLinks = extractUrls(html);
  const pdfLinks = rawLinks.filter((url) => /\.pdf(?:$|[?#])/i.test(url)).map((url) => canonicalizeUrl(url, sourceUrl));

  return {
    id: `${source.id}:${type}:${item.id || item.slug || sourceUrl}`,
    sourceId: source.id,
    sourceName: source.name,
    sourceUrl,
    title,
    summary: normalizeWhitespace(stripHtml(item.summary || '')),
    text,
    html,
    imageUrl: resolveAssetUrl(item.image || item.image_url || item.cover || '', sourceUrl),
    updatedAt,
    type,
    pdfLinks,
    raw: item,
  };
}

function extractMeta(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  const match = String(html || '').match(re);
  return match ? decodeEntities(match[1]) : '';
}

function extractHtmlDocument(source, url, html) {
  const titleMatch = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = cleanTitle(extractMeta(html, 'og:title') || (titleMatch ? stripHtml(titleMatch[1]) : ''));
  const description = normalizeWhitespace(extractMeta(html, 'description') || extractMeta(html, 'og:description'));
  const articleMatch = String(html || '').match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = String(html || '').match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const contentHtml = articleMatch ? articleMatch[1] : (mainMatch ? mainMatch[1] : html);
  const links = Array.from(String(html || '').matchAll(/href=["']([^"']+)["']/gi)).map((m) => canonicalizeUrl(m[1], url));
  const pdfLinks = links.filter((link) => /\.pdf(?:$|[?#])/i.test(link));

  return {
    id: `${source.id}:html:${url}`,
    sourceId: source.id,
    sourceName: source.name,
    sourceUrl: canonicalizeUrl(url, source.baseUrl),
    title,
    summary: description,
    text: stripHtml(contentHtml),
    html,
    imageUrl: extractFirstImageUrl(html, url),
    updatedAt: '',
    type: 'html',
    pdfLinks,
    raw: {},
  };
}

module.exports = {
  cleanTitle,
  extractHtmlDocument,
  extractFirstImageUrl,
  normalizeWebyItem,
  resolveAssetUrl,
};

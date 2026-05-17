'use strict';

const crypto = require('crypto');

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripAccents(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeText(value) {
  return stripAccents(normalizeWhitespace(value)).toLowerCase();
}

function slugify(value, maxLength = 80) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function clamp(value, maxLength) {
  const text = normalizeWhitespace(value);
  if (text.length <= maxLength) return text;
  const sliced = text.slice(0, Math.max(0, maxLength - 1));
  const boundary = sliced.lastIndexOf(' ');
  return `${(boundary > 40 ? sliced.slice(0, boundary) : sliced).trim()}...`;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function uniq(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(html) {
  return normalizeWhitespace(
    decodeEntities(String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' '))
  );
}

function canonicalizeUrl(input, baseUrl) {
  try {
    const url = new URL(String(input || ''), baseUrl || undefined);
    url.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach((key) => {
      url.searchParams.delete(key);
    });
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch (_) {
    return '';
  }
}

function extractUrls(text) {
  return uniq(String(text || '').match(/https?:\/\/[^\s)>\]"']+/gi) || []);
}

function extractEmails(text) {
  return uniq(String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []);
}

function parseBrazilianDate(text) {
  const value = String(text || '');
  const match = value.match(/\b([0-3]?\d)[\/.-]([01]?\d)[\/.-]((?:20)?\d{2})\b/);
  if (!match) return '';
  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${month}-${day}`;
}

function parseTime(text) {
  const value = String(text || '');
  const match = value.match(/\b([01]?\d|2[0-3])[:h]([0-5]\d)?\b/i);
  if (!match) return '';
  return `${match[1].padStart(2, '0')}:${(match[2] || '00').padStart(2, '0')}`;
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return fallback;
  }
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = {
  asArray,
  canonicalizeUrl,
  clamp,
  decodeEntities,
  extractEmails,
  extractUrls,
  normalizeText,
  normalizeWhitespace,
  nowIso,
  parseBrazilianDate,
  parseTime,
  safeJsonParse,
  sha256,
  slugify,
  stripAccents,
  stripHtml,
  uniq,
};

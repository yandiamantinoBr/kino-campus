import {
  buildIndexabilityValues,
  canonicalPostId,
  cleanText,
  metadataOf,
  parseDateLike,
  shouldIndexPost,
} from './_lib/product-seo-policy.js';
import { fetchPublicSupabaseJson } from './_lib/supabase-public-request.js';

const SITE_ORIGIN = 'https://www.kinocampus.com.br';
const FEED_URL = `${SITE_ORIGIN}/feed.xml`;

function resolveEnv(candidates) {
  for (const name of candidates) {
    const value = process.env[name];
    if (value && String(value).trim()) return String(value).trim();
  }
  return '';
}

function getSupabaseConfig() {
  return {
    url: resolveEnv(['SUPABASE_URL', 'KC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']),
    key: resolveEnv(['SUPABASE_ANON_KEY', 'KC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_PUBLIC_KEY']),
  };
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(value, max) {
  const text = cleanText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}...`;
}

function isoDate(value) {
  const date = parseDateLike(value) || new Date();
  if (Number.isNaN(date.getTime())) return new Date().toUTCString();
  return date.toUTCString();
}

function getPostDescription(post) {
  const metadata = metadataOf(post);
  return truncate(
    post.description || metadata.summary || metadata.resumo || metadata.excerpt || 'Publicação da comunidade UFG no KinoCampus.',
    500,
  );
}

function getPostCategory(post) {
  const metadata = metadataOf(post);
  return cleanText(post.module || post.category || metadata.moduleLabel || metadata.categoryLabel || 'KinoCampus');
}

async function fetchPublishedPosts() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return { ok: false, reason: 'supabase_not_configured' };

  const select = 'id,legacy_id,title,description,module,category,updated_at,created_at,expires_at,status,metadata';
  const endpoint = `${url}/rest/v1/posts?select=${encodeURI(select)}&status=eq.published&order=updated_at.desc.nullslast&limit=30`;
  const result = await fetchPublicSupabaseJson(endpoint, { key });
  if (!result.ok || !Array.isArray(result.data)) {
    return { ok: false, reason: result.reason || 'supabase_invalid_response' };
  }
  return {
    ok: true,
    posts: result.data.filter((post) => shouldIndexPost(post, buildIndexabilityValues(post))),
  };
}

function buildItem(post) {
  const id = encodeURIComponent(canonicalPostId(post));
  const url = `${SITE_ORIGIN}/product.html?id=${id}`;
  const title = cleanText(post.title || 'Publicação no KinoCampus');
  const description = getPostDescription(post);
  const category = getPostCategory(post);
  const pubDate = isoDate(post.updated_at || post.created_at);

  return [
    '    <item>',
    `      <title>${escapeXml(title)}</title>`,
    `      <link>${escapeXml(url)}</link>`,
    `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
    `      <pubDate>${escapeXml(pubDate)}</pubDate>`,
    `      <category>${escapeXml(category)}</category>`,
    `      <description>${escapeXml(description)}</description>`,
    '    </item>',
  ].join('\n');
}

function buildFeed(posts) {
  const now = new Date().toUTCString();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    '    <title>KinoCampus - Publicações da comunidade UFG</title>',
    `    <link>${SITE_ORIGIN}/</link>`,
    '    <description>Atualizações públicas de eventos, oportunidades, moradia, compra e venda, caronas e achados/perdidos no KinoCampus.</description>',
    '    <language>pt-BR</language>',
    `    <lastBuildDate>${escapeXml(now)}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(FEED_URL)}" rel="self" type="application/rss+xml" />`,
    posts.map(buildItem).join('\n'),
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

export default async function handler(req, res) {
  const result = await fetchPublishedPosts();
  if (!result.ok) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Retry-After', '60');
    res.status(503).send('Service unavailable');
    return;
  }
  const xml = buildFeed(result.posts);
  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  res.status(200).send(xml);
}

export { fetchPublishedPosts };

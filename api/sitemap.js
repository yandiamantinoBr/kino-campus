import {
  buildIndexabilityValues,
  canonicalPostId,
  isoDate,
  metadataOf,
  shouldIndexPost,
} from './_lib/product-seo-policy.js';
import { fetchPublicSupabaseJson } from './_lib/supabase-public-request.js';

const SITE_ORIGIN = 'https://www.kinocampus.com.br';
const POST_PAGE_SIZE = 1000;
const MAX_POST_PAGES = 49;

const STATIC_ROUTES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/eventos', changefreq: 'hourly', priority: '0.9' },
  { path: '/oportunidades', changefreq: 'hourly', priority: '0.9' },
  { path: '/moradia', changefreq: 'daily', priority: '0.8' },
  { path: '/compra-venda', changefreq: 'daily', priority: '0.8' },
  { path: '/caronas', changefreq: 'daily', priority: '0.8' },
  { path: '/achados-perdidos', changefreq: 'daily', priority: '0.8' },
  { path: '/sobre', changefreq: 'monthly', priority: '0.6' },
  { path: '/apresentacao', changefreq: 'monthly', priority: '0.7' },
  { path: '/editorial', changefreq: 'monthly', priority: '0.6' },
  { path: '/ajuda', changefreq: 'monthly', priority: '0.5' },
  { path: '/ods', changefreq: 'monthly', priority: '0.5' },
  { path: '/transparencia', changefreq: 'monthly', priority: '0.5' },
  { path: '/privacidade', changefreq: 'monthly', priority: '0.4' },
  { path: '/termos', changefreq: 'monthly', priority: '0.4' },
];

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

function getPostImage(post) {
  // URLs temporarias de CDNs de redes sociais expiram (HTTP 403 para crawlers)
  // e nao devem aparecer no sitemap. O SSR/og:image usa o mesmo filtro.
  function isTemporaryImageUrl(value) {
    const text = String(value || '').trim();
    if (!text || !/^https?:\/\//i.test(text)) return false;
    try {
      const host = new URL(text).hostname.toLowerCase();
      return /(^|\.)cdninstagram\.com$/.test(host)
        || /(^|\.)fbcdn\.net$/.test(host)
        || /(^|\.)instagram\.com$/.test(host)
        || /(^|\.)cdn-telegram\.org$/.test(host)
        || /(^|\.)telegram\.org$/.test(host);
    } catch (_) {
      return false;
    }
  }
  const metadata = metadataOf(post);
  const image = post.image_url || metadata.cover_url || metadata.coverUrl || metadata.image_url || metadata.imageUrl || '';
  return /^https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|webp|gif|avif)(?:[?#][^\s"'<>]*)?$/i.test(String(image))
    && !isTemporaryImageUrl(image)
    ? String(image)
    : '';
}

function buildUrlNode(entry) {
  return [
    '  <url>',
    `    <loc>${escapeXml(SITE_ORIGIN + entry.path)}</loc>`,
    entry.lastmod && isoDate(entry.lastmod) ? `    <lastmod>${escapeXml(isoDate(entry.lastmod))}</lastmod>` : '',
    entry.changefreq ? `    <changefreq>${escapeXml(entry.changefreq)}</changefreq>` : '',
    entry.priority ? `    <priority>${escapeXml(entry.priority)}</priority>` : '',
    entry.image ? `    <image:image>\n      <image:loc>${escapeXml(entry.image)}</image:loc>\n    </image:image>` : '',
    '  </url>',
  ].filter(Boolean).join('\n');
}

async function fetchPublishedPostRoutes() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return { ok: false, reason: 'supabase_not_configured' };

  const select = 'id,legacy_id,title,description,updated_at,created_at,expires_at,status,image_url,metadata';
  const selectCompat = 'id,legacy_id,title,description,updated_at,created_at,expires_at,status,metadata';
  let activeSelect = select;
  const posts = [];

  for (let page = 0; page < MAX_POST_PAGES; page += 1) {
    const offset = page * POST_PAGE_SIZE;
    const endpoint = `${url}/rest/v1/posts?select=${encodeURI(activeSelect)}&status=eq.published&order=updated_at.desc.nullslast,id.asc&offset=${offset}&limit=${POST_PAGE_SIZE}`;
    let result = await fetchPublicSupabaseJson(endpoint, { key });

    if (page === 0 && !result.ok && result.status === 400 && activeSelect === select) {
      activeSelect = selectCompat;
      const compatEndpoint = `${url}/rest/v1/posts?select=${encodeURI(activeSelect)}&status=eq.published&order=updated_at.desc.nullslast,id.asc&offset=0&limit=${POST_PAGE_SIZE}`;
      result = await fetchPublicSupabaseJson(compatEndpoint, { key });
    }
    if (!result.ok || !Array.isArray(result.data)) {
      return { ok: false, reason: result.reason || 'supabase_invalid_response' };
    }

    posts.push(...result.data);
    if (result.data.length < POST_PAGE_SIZE) break;
    if (page === MAX_POST_PAGES - 1) {
      return { ok: false, reason: 'sitemap_requires_index' };
    }
  }

  return {
    ok: true,
    routes: posts
      .filter((post) => shouldIndexPost(post, buildIndexabilityValues(post)))
      .map((post) => ({
        path: `/product.html?id=${encodeURIComponent(canonicalPostId(post))}`,
        lastmod: post.updated_at || post.created_at,
        changefreq: 'weekly',
        priority: '0.7',
        image: getPostImage(post),
      })),
  };
}

function buildSitemapXml(routes) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    routes.map(buildUrlNode).join('\n'),
    '</urlset>',
    '',
  ].join('\n');
}

export default async function handler(req, res) {
  const result = await fetchPublishedPostRoutes();
  const postRoutes = result.ok ? result.routes : [];
  const seen = new Set();
  const routes = STATIC_ROUTES.concat(postRoutes).filter((entry) => {
    if (!entry || !entry.path || seen.has(entry.path)) return false;
    seen.add(entry.path);
    return true;
  });

  const xml = buildSitemapXml(routes);

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  if (!result.ok) {
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    res.setHeader('Retry-After', '60');
    res.setHeader('X-Kino-Sitemap-Mode', 'static-fallback');
  } else {
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  }
  res.status(200).send(xml);
}

export { buildSitemapXml, fetchPublishedPostRoutes };

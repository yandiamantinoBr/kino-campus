const SITE_ORIGIN = 'https://www.kinocampus.com.br';

const STATIC_ROUTES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/eventos.html', changefreq: 'hourly', priority: '0.9' },
  { path: '/oportunidades.html', changefreq: 'hourly', priority: '0.9' },
  { path: '/moradia.html', changefreq: 'daily', priority: '0.8' },
  { path: '/compra-venda-feed.html', changefreq: 'daily', priority: '0.8' },
  { path: '/caronas-feed.html', changefreq: 'daily', priority: '0.8' },
  { path: '/achados-perdidos.html', changefreq: 'daily', priority: '0.8' },
  { path: '/sobre.html', changefreq: 'monthly', priority: '0.6' },
  { path: '/ajuda.html', changefreq: 'monthly', priority: '0.5' },
  { path: '/ods.html', changefreq: 'monthly', priority: '0.5' },
  { path: '/transparencia.html', changefreq: 'monthly', priority: '0.5' },
  { path: '/privacidade.html', changefreq: 'monthly', priority: '0.4' },
  { path: '/termos.html', changefreq: 'monthly', priority: '0.4' },
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

function isoDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function isFutureOrUnknown(value) {
  if (!value) return true;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return true;
  return date.getTime() >= Date.now() - 24 * 60 * 60 * 1000;
}

function metadataOf(post) {
  return post && post.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata)
    ? post.metadata
    : {};
}

function getPostImage(post) {
  const metadata = metadataOf(post);
  const image = post.image_url || metadata.cover_url || metadata.coverUrl || metadata.image_url || metadata.imageUrl || '';
  return /^https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|webp|gif|avif)(?:[?#][^\s"'<>]*)?$/i.test(String(image))
    ? String(image)
    : '';
}

function getPostExpiry(post) {
  const metadata = metadataOf(post);
  return post.expires_at || metadata.deadline_date || metadata.validThrough || metadata.data_encerramento || '';
}

function buildUrlNode(entry) {
  return [
    '  <url>',
    `    <loc>${escapeXml(SITE_ORIGIN + entry.path)}</loc>`,
    entry.lastmod ? `    <lastmod>${escapeXml(isoDate(entry.lastmod))}</lastmod>` : '',
    entry.changefreq ? `    <changefreq>${escapeXml(entry.changefreq)}</changefreq>` : '',
    entry.priority ? `    <priority>${escapeXml(entry.priority)}</priority>` : '',
    entry.image ? `    <image:image>\n      <image:loc>${escapeXml(entry.image)}</image:loc>\n    </image:image>` : '',
    '  </url>',
  ].filter(Boolean).join('\n');
}

async function fetchPublishedPostRoutes() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return [];

  const select = 'id,title,updated_at,created_at,expires_at,status,image_url,metadata';
  const selectCompat = 'id,title,updated_at,created_at,expires_at,status,metadata';
  const endpoint = `${url}/rest/v1/posts?select=${encodeURI(select)}&status=eq.published&order=updated_at.desc.nullslast&limit=1000`;
  const endpointCompat = `${url}/rest/v1/posts?select=${encodeURI(selectCompat)}&status=eq.published&order=updated_at.desc.nullslast&limit=1000`;
  try {
    let response = await fetch(endpoint, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
    });
    if (!response.ok && response.status === 400) {
      response = await fetch(endpointCompat, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Accept: 'application/json',
        },
      });
    }
    if (!response.ok) return [];
    const rows = await response.json();
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((post) => post && post.id && String(post.status || '').toLowerCase() === 'published')
      .filter((post) => isFutureOrUnknown(getPostExpiry(post)))
      .map((post) => ({
        path: `/product.html?id=${encodeURIComponent(String(post.id))}`,
        lastmod: post.updated_at || post.created_at,
        changefreq: 'weekly',
        priority: '0.7',
        image: getPostImage(post),
      }));
  } catch (_) {
    return [];
  }
}

export default async function handler(req, res) {
  const postRoutes = await fetchPublishedPostRoutes();
  const seen = new Set();
  const routes = STATIC_ROUTES.concat(postRoutes).filter((entry) => {
    if (!entry || !entry.path || seen.has(entry.path)) return false;
    seen.add(entry.path);
    return true;
  });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    routes.map(buildUrlNode).join('\n'),
    '</urlset>',
    '',
  ].join('\n');

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  res.status(200).send(xml);
}

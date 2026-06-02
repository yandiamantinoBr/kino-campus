/*
  KinoCampus - Open Graph SSR for product pages (V8.6.0)

  Vercel Serverless Function that intercepts product.html requests,
  fetches post data from Supabase REST API, and injects proper OG
  meta tags so social media crawlers (WhatsApp, Facebook, Twitter)
  show rich link previews with image, title and description.
*/
import fs from 'node:fs';
import path from 'node:path';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Module-level cache to avoid repeated disk reads within the same container
let cachedHtml = null;

function getProductHtml() {
  if (!cachedHtml) {
    cachedHtml = fs.readFileSync(path.join(process.cwd(), '_product.html'), 'utf8');
  }
  return cachedHtml;
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.KC_SUPABASE_URL
    || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_ANON_KEY || process.env.KC_SUPABASE_ANON_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return { url, key };
}

async function fetchPost(id) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    console.error('[og-product] Supabase config missing — url:', url ? 'OK' : 'EMPTY', '| key:', key ? 'OK' : 'EMPTY');
    return null;
  }

  const select = 'id,legacy_id,title,description,price,module,category,location,image_url,metadata,created_at,updated_at,post_media(url,is_cover)';
  const selectCompat = 'id,legacy_id,title,description,price,module,category,location,metadata,created_at,updated_at,post_media(url,is_cover)';
  const headers = {
    apikey: key,
    Authorization: 'Bearer ' + key,
    Accept: 'application/json',
  };

  // Try UUID first
  const isUuid = UUID_RE.test(id);
  const filter = isUuid ? `id=eq.${id}` : `legacy_id=eq.${id}`;
  const endpoint = `${url}/rest/v1/posts?select=${encodeURI(select)}&${filter}&status=eq.published&limit=1`;
  const endpointCompat = `${url}/rest/v1/posts?select=${encodeURI(selectCompat)}&${filter}&status=eq.published&limit=1`;

  try {
    let resp = await fetch(endpoint, { headers });
    if (!resp.ok && resp.status === 400) resp = await fetch(endpointCompat, { headers });
    if (!resp.ok) return null;
    const rows = await resp.json();
    if (rows && rows.length > 0) return rows[0];

    // If UUID lookup found nothing, try legacy_id fallback
    if (isUuid) {
      const fallback = `${url}/rest/v1/posts?select=${encodeURI(select)}&legacy_id=eq.${id}&status=eq.published&limit=1`;
      const fallbackCompat = `${url}/rest/v1/posts?select=${encodeURI(selectCompat)}&legacy_id=eq.${id}&status=eq.published&limit=1`;
      let resp2 = await fetch(fallback, { headers });
      if (!resp2.ok && resp2.status === 400) resp2 = await fetch(fallbackCompat, { headers });
      if (!resp2.ok) return null;
      const rows2 = await resp2.json();
      return (rows2 && rows2.length > 0) ? rows2[0] : null;
    }
    return null;
  } catch (err) {
    console.error('[og-product] fetchPost error:', err.message || err);
    return null;
  }
}

function getPostImage(post) {
  if (post && post.image_url) return String(post.image_url);
  const metadata = post && post.metadata && typeof post.metadata === 'object' ? post.metadata : {};
  const metadataImage = metadata.cover_url || metadata.coverUrl || metadata.image_url || metadata.imageUrl;
  if (metadataImage) return String(metadataImage);
  const media = post.post_media;
  if (!Array.isArray(media) || media.length === 0) return null;
  // Prefer cover image
  const cover = media.find(m => m.is_cover === true);
  const chosen = cover || media[0];
  return chosen && chosen.url ? String(chosen.url) : null;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(str) {
  return String(str).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function stripMarkdown(str) {
  return String(str)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.+?)\]\(https?:\/\/[^\s)]+\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^-\s+/gm, '• ');
}

function formatPrice(price) {
  if (!price && price !== 0) return '';
  const num = Number(price);
  if (isNaN(num)) return String(price);
  return 'R$ ' + num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getCategoryLabel(module) {
  const labels = {
    'compra-venda': 'Compra e Venda',
    'caronas': 'Caronas',
    'moradia': 'Moradia',
    'eventos': 'Eventos',
    'oportunidades': 'Oportunidades',
    'achados-perdidos': 'Achados e Perdidos',
  };
  return labels[module] || module || '';
}

function replaceMetaContent(html, attr, name, newContent) {
  // Matches <meta property="og:title" content="..." /> or <meta name="twitter:card" content="..." />
  const re = new RegExp(
    `(<meta\\s+${attr}="${name}"\\s+content=")([^"]*)(")`,
    'i'
  );
  return html.replace(re, `$1${escapeHtml(newContent)}$3`);
}

function replaceTitleTag(html, newTitle) {
  return html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(newTitle)}</title>`);
}

function replaceOrInsertCanonical(html, canonicalUrl) {
  const escaped = escapeHtml(canonicalUrl);
  if (/<link\s+rel="canonical"/i.test(html)) {
    return html.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${escaped}" />`);
  }
  return html.replace('</head>', `  <link rel="canonical" href="${escaped}" />\n</head>`);
}

function replaceOrInsertRobots(html, content) {
  const escaped = escapeHtml(content);
  if (/<meta\s+name="robots"/i.test(html)) {
    return html.replace(/<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/i, `<meta name="robots" content="${escaped}" />`);
  }
  return html.replace('</head>', `  <meta name="robots" content="${escaped}" />\n</head>`);
}

function buildProductJsonLd(post, values) {
  const entity = {
    '@type': 'CreativeWork',
    '@id': `${values.url}#post`,
    name: values.title,
    description: values.description,
    url: values.url,
    image: values.image,
    inLanguage: 'pt-BR',
    datePublished: post.created_at || undefined,
    dateModified: post.updated_at || post.created_at || undefined,
    about: [
      post.module ? { '@type': 'Thing', name: getCategoryLabel(post.module) } : null,
      post.category ? { '@type': 'Thing', name: String(post.category) } : null,
    ].filter(Boolean),
  };

  if (post.location) entity.contentLocation = { '@type': 'Place', name: String(post.location) };

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://www.kinocampus.com.br/#organization',
        name: 'KinoCampus',
        url: 'https://www.kinocampus.com.br/',
        logo: 'https://www.kinocampus.com.br/assets/favicon.svg',
      },
      {
        '@type': 'WebSite',
        '@id': 'https://www.kinocampus.com.br/#website',
        name: 'KinoCampus',
        url: 'https://www.kinocampus.com.br/',
        inLanguage: 'pt-BR',
        publisher: { '@id': 'https://www.kinocampus.com.br/#organization' },
      },
      {
        '@type': 'WebPage',
        '@id': `${values.url}#webpage`,
        url: values.url,
        name: values.title,
        description: values.description,
        isPartOf: { '@id': 'https://www.kinocampus.com.br/#website' },
        inLanguage: 'pt-BR',
        image: values.image,
        mainEntity: { '@id': `${values.url}#post` },
      },
      entity,
    ],
  };
}

function replaceOrInsertProductJsonLd(html, data) {
  const script = `<script type="application/ld+json" data-kc-product-structured-data="true">${JSON.stringify(data)}</script>`;
  if (/data-kc-product-structured-data="true"/i.test(html)) {
    return html.replace(/<script\s+type="application\/ld\+json"\s+data-kc-product-structured-data="true">[\s\S]*?<\/script>/i, script);
  }
  return html.replace('</head>', `  ${script}\n</head>`);
}

export default async function handler(req, res) {
  console.log('[og-product] Handler invoked — id:', req.query.id || '(none)');
  const html = getProductHtml();
  const id = req.query.id;

  // No post ID — return original HTML
  if (!id) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }

  try {
    const post = await fetchPost(id);
    console.log('[og-product] Post fetched:', post ? post.title : 'NOT FOUND');

    // Post not found — return original (client-side JS handles 404 UI)
    if (!post) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    }

    const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.kinocampus.com.br';
    const baseUrl = `https://${host}`;

    // Build OG values
    const rawTitle = post.title || 'KinoCampus';
    const categoryLabel = getCategoryLabel(post.module);
    const ogTitle = rawTitle + ' — KinoCampus';

    let ogDesc = stripMarkdown(stripHtml(post.description || ''));
    // Prepend category and price for richer preview
    const priceFmt = formatPrice(post.price);
    const prefix = [categoryLabel, priceFmt].filter(Boolean).join(' | ');
    if (prefix) ogDesc = prefix + ' — ' + ogDesc;
    if (ogDesc.length > 200) ogDesc = ogDesc.substring(0, 197) + '...';
    if (!ogDesc) ogDesc = 'Anuncio na comunidade universitaria da UFG.';

    const ogImageFallback = `${baseUrl}/api/og-image?type=${post.module || 'product'}`;
    const ogImage = getPostImage(post) || ogImageFallback;
    const ogUrl = `${baseUrl}/product.html?id=${post.id}`;
    const canonicalUrl = ogUrl;

    // Replace OG meta tags
    let modified = html;
    modified = replaceMetaContent(modified, 'property', 'og:type', 'article');
    modified = replaceMetaContent(modified, 'property', 'og:title', ogTitle);
    modified = replaceMetaContent(modified, 'property', 'og:description', ogDesc);
    modified = replaceMetaContent(modified, 'property', 'og:image', ogImage);
    modified = replaceMetaContent(modified, 'property', 'og:url', ogUrl);
    modified = replaceMetaContent(modified, 'name', 'twitter:card', 'summary_large_image');
    modified = replaceMetaContent(modified, 'name', 'twitter:title', ogTitle);
    modified = replaceMetaContent(modified, 'name', 'twitter:description', ogDesc);
    modified = replaceMetaContent(modified, 'name', 'twitter:image', ogImage);
    modified = replaceOrInsertCanonical(modified, canonicalUrl);
    modified = replaceOrInsertRobots(modified, 'index,follow,max-image-preview:large,max-snippet:-1');

    // Add og:locale if not present
    if (!modified.includes('og:locale')) {
      modified = modified.replace(
        '<meta property="og:type"',
        '<meta property="og:locale" content="pt_BR" />\n  <meta property="og:type"'
      );
    }

    // Update <title> tag
    modified = replaceTitleTag(modified, ogTitle);

    // Update meta description
    modified = modified.replace(
      /(<meta\s+name="description"\s+content=")([^"]*)(")/i,
      `$1${escapeHtml(ogDesc)}$3`
    );

    modified = replaceOrInsertProductJsonLd(modified, buildProductJsonLd(post, {
      url: canonicalUrl,
      title: ogTitle,
      description: ogDesc,
      image: ogImage,
    }));

    // Cache at CDN level: 5 min cache, stale-while-revalidate for 10 min
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(modified);
  } catch (err) {
    console.error('[og-product] Handler error:', err.message || err);
    // Graceful fallback: return unmodified HTML
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }
}

/*
  KinoCampus - SEO/OG SSR for product pages.

  Intercepts /product.html?id=... on Vercel, fetches one published
  Supabase post, and injects crawlable HTML, Open Graph/Twitter tags,
  canonical/robots directives and JSON-LD.
*/
import fs from 'node:fs';
import path from 'node:path';

const SITE_ORIGIN = 'https://www.kinocampus.com.br';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INDEXABLE_ROBOTS = 'index,follow,max-image-preview:large,max-snippet:-1';
const NOINDEX_ROBOTS = 'noindex,follow,noarchive';

let cachedHtml = null;

function getProductHtml() {
  if (!cachedHtml) {
    cachedHtml = fs.readFileSync(path.join(process.cwd(), '_product.html'), 'utf8');
  }
  return cachedHtml;
}

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

async function fetchPost(id) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    console.error('[og-product] Supabase config missing - url:', url ? 'OK' : 'EMPTY', '| key:', key ? 'OK' : 'EMPTY');
    return null;
  }

  const select = [
    'id',
    'legacy_id',
    'author_id',
    'title',
    'description',
    'price',
    'module',
    'category',
    'location',
    'image_url',
    'metadata',
    'created_at',
    'updated_at',
    'expires_at',
    'status',
    'post_media(url,is_cover)',
  ].join(',');
  const selectCompat = select.replace('image_url,', '');
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
  };

  const isUuid = UUID_RE.test(id);
  const primaryFilter = isUuid ? `id=eq.${encodeURIComponent(id)}` : `legacy_id=eq.${encodeURIComponent(id)}`;
  const primaryEndpoint = `${url}/rest/v1/posts?select=${encodeURI(select)}&${primaryFilter}&status=eq.published&limit=1`;
  const primaryCompat = `${url}/rest/v1/posts?select=${encodeURI(selectCompat)}&${primaryFilter}&status=eq.published&limit=1`;

  try {
    let response = await fetch(primaryEndpoint, { headers });
    if (!response.ok && response.status === 400) response = await fetch(primaryCompat, { headers });
    if (!response.ok) return null;
    const rows = await response.json();
    if (Array.isArray(rows) && rows.length > 0) return rows[0];

    if (isUuid) {
      const fallbackFilter = `legacy_id=eq.${encodeURIComponent(id)}`;
      const fallbackEndpoint = `${url}/rest/v1/posts?select=${encodeURI(select)}&${fallbackFilter}&status=eq.published&limit=1`;
      const fallbackCompat = `${url}/rest/v1/posts?select=${encodeURI(selectCompat)}&${fallbackFilter}&status=eq.published&limit=1`;
      let fallback = await fetch(fallbackEndpoint, { headers });
      if (!fallback.ok && fallback.status === 400) fallback = await fetch(fallbackCompat, { headers });
      if (!fallback.ok) return null;
      const fallbackRows = await fallback.json();
      return Array.isArray(fallbackRows) && fallbackRows.length > 0 ? fallbackRows[0] : null;
    }
    return null;
  } catch (err) {
    console.error('[og-product] fetchPost error:', err && err.message ? err.message : err);
    return null;
  }
}

function metadataOf(post) {
  return post && post.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata)
    ? post.metadata
    : {};
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ');
}

function stripMarkdown(value) {
  return String(value || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.+?)\]\(https?:\/\/[^\s)]+\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*]\s+/gm, '• ');
}

function cleanText(value) {
  return stripMarkdown(stripHtml(String(value || '')))
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function clamp(value, max) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function wordCount(value) {
  const text = cleanText(value);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function canonicalPostId(post) {
  return String((post && post.id) || (post && post.legacy_id) || '').trim();
}

function getPostImage(post) {
  if (post && post.image_url) return String(post.image_url);
  const metadata = metadataOf(post);
  const metadataImage = metadata.cover_url || metadata.coverUrl || metadata.image_url || metadata.imageUrl;
  if (metadataImage) return String(metadataImage);
  const media = post && post.post_media;
  if (!Array.isArray(media) || media.length === 0) return '';
  const cover = media.find((item) => item && item.is_cover === true);
  const selected = cover || media[0];
  return selected && selected.url ? String(selected.url) : '';
}

function isRemoteImageUrl(value) {
  return /^https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|webp|gif|avif)(?:[?#][^\s"'<>]*)?$/i.test(String(value || ''));
}

function beautifyKey(value) {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getCategoryLabel(moduleKey, categoryKey) {
  const moduleLabels = {
    'compra-venda': 'Compra e Venda',
    caronas: 'Caronas',
    moradia: 'Moradia',
    eventos: 'Eventos',
    oportunidades: 'Oportunidades',
    'achados-perdidos': 'Achados e Perdidos',
  };
  if (moduleLabels[moduleKey]) return moduleLabels[moduleKey];
  return beautifyKey(categoryKey || moduleKey || 'Publicação');
}

function formatPrice(price) {
  if (price == null || price === '') return '';
  const number = Number(price);
  if (!Number.isFinite(number)) return String(price);
  if (number === 0) return 'Gratuito';
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function isoDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : '';
}

function dateOnly(value) {
  const iso = isoDate(value);
  return iso ? iso.slice(0, 10) : '';
}

function joinDateAndTime(date, time) {
  const day = dateOnly(date);
  const cleanTime = String(time || '').match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)?.[0] || '';
  if (!day) return '';
  return cleanTime ? `${day}T${cleanTime}:00-03:00` : day;
}

function getDeadline(post) {
  const metadata = metadataOf(post);
  return metadata.deadline_date || metadata.validThrough || metadata.data_encerramento || post.expires_at || '';
}

function getEventDate(post) {
  const metadata = metadataOf(post);
  return metadata.data_evento || metadata.event_date || metadata.eventDate || metadata.event_date_detected || '';
}

function getActionLink(post) {
  const metadata = metadataOf(post);
  const candidates = [
    metadata.link,
    metadata.cta_url,
    metadata.inscricao_url,
    metadata.registration_url,
    metadata.source_url,
  ];
  return candidates.find((url) => /^https?:\/\//i.test(String(url || ''))) || '';
}

function getSourceUrl(post, values) {
  const metadata = metadataOf(post);
  const candidates = [
    metadata.source_url,
    metadata.sourceUrl,
    metadata.original_url,
    metadata.originalUrl,
    values && values.actionLink,
  ];
  return candidates.find((url) => /^https?:\/\//i.test(String(url || ''))) || '';
}

function isExpired(post) {
  const deadline = getDeadline(post);
  if (!deadline) return false;
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now() - 24 * 60 * 60 * 1000;
}

function shouldIndexPost(post, values) {
  if (!post || String(post.status || '').toLowerCase() !== 'published') return false;
  if (isExpired(post)) return false;
  if (!canonicalPostId(post)) return false;
  if (!cleanText(values && values.title)) return false;
  return cleanText(values && values.description).length >= 24;
}

function paragraphHtml(text) {
  const source = String(text || '').trim();
  if (!source) return '';
  return source
    .split(/\n+/)
    .map((line) => cleanText(line))
    .filter(Boolean)
    .slice(0, 8)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('\n');
}

function modulePage(moduleKey) {
  const pages = {
    eventos: 'eventos.html',
    oportunidades: 'oportunidades.html',
    moradia: 'moradia.html',
    'compra-venda': 'compra-venda-feed.html',
    caronas: 'caronas-feed.html',
    'achados-perdidos': 'achados-perdidos.html',
  };
  return pages[moduleKey] || 'index.html';
}

function buildProductValues(post, req) {
  const host = (req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || 'www.kinocampus.com.br';
  const baseUrl = `https://${host}`;
  const id = canonicalPostId(post);
  const rawTitle = cleanText(post.title) || 'Publicação no KinoCampus';
  const title = clamp(rawTitle, 90);
  const categoryLabel = getCategoryLabel(post.module, post.category);
  const priceText = formatPrice(post.price);
  const cleanDescription = cleanText(post.description);
  const prefix = [categoryLabel, priceText && priceText !== 'Gratuito' ? priceText : ''].filter(Boolean).join(' | ');
  const description = clamp(prefix ? `${prefix} - ${cleanDescription}` : cleanDescription, 260)
    || 'Publicação pública da comunidade universitária da UFG no KinoCampus.';
  const imageFallback = `${baseUrl}/api/og-image?type=${encodeURIComponent(post.module || 'product')}`;
  const image = getPostImage(post) || imageFallback;
  const canonicalUrl = `${baseUrl}/product.html?id=${encodeURIComponent(id)}`;

  return {
    id,
    title,
    seoTitle: `${title} - KinoCampus`,
    description,
    rawDescription: String(post.description || '').trim(),
    categoryLabel,
    priceText,
    image,
    canonicalUrl,
    actionLink: getActionLink(post),
    deadline: getDeadline(post),
    eventDate: getEventDate(post),
  };
}

function replaceMetaContent(html, attr, name, content) {
  const re = new RegExp(`(<meta\\s+${attr}="${name}"\\s+content=")([^"]*)(")`, 'i');
  return html.replace(re, `$1${escapeAttr(content)}$3`);
}

function replaceTitleTag(html, title) {
  return html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
}

function replaceOrInsertCanonical(html, canonicalUrl) {
  const tag = `<link rel="canonical" href="${escapeAttr(canonicalUrl)}" />`;
  if (/<link\s+rel="canonical"/i.test(html)) {
    return html.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i, tag);
  }
  return html.replace('</head>', `  ${tag}\n</head>`);
}

function replaceOrInsertRobots(html, content) {
  const tag = `<meta name="robots" content="${escapeAttr(content)}" />`;
  if (/<meta\s+name="robots"/i.test(html)) {
    return html.replace(/<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/i, tag);
  }
  return html.replace('</head>', `  ${tag}\n</head>`);
}

function replaceOrInsertMetaDescription(html, description) {
  const tag = `<meta name="description" content="${escapeAttr(description)}" />`;
  if (/<meta\s+name="description"/i.test(html)) {
    return html.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i, tag);
  }
  return html.replace('</head>', `  ${tag}\n</head>`);
}

function replaceById(html, id, replacement) {
  const re = new RegExp(`<([a-z0-9]+)([^>]*\\sid="${id}"[^>]*)>[\\s\\S]*?<\\/\\1>`, 'i');
  return html.replace(re, replacement);
}

function buildBadgesHtml(post, values) {
  const badges = [];
  if (values.categoryLabel) badges.push(`<span class="kc-badge"><i class="fas fa-layer-group"></i> ${escapeHtml(values.categoryLabel)}</span>`);
  if (post.category) badges.push(`<span class="kc-badge"><i class="fas fa-tag"></i> ${escapeHtml(beautifyKey(post.category))}</span>`);
  if (values.priceText) badges.push(`<span class="kc-badge"><i class="fas fa-money-bill-wave"></i> ${escapeHtml(values.priceText)}</span>`);
  if (values.deadline) badges.push(`<span class="kc-badge"><i class="fas fa-calendar-check"></i> Prazo: ${escapeHtml(dateOnly(values.deadline) || values.deadline)}</span>`);
  return badges.join(' ');
}

function specRowsHtml(post, values) {
  const metadata = metadataOf(post);
  const rows = [
    ['Módulo', values.categoryLabel],
    ['Categoria', metadata.categoria || metadata.area || beautifyKey(post.category || '')],
    ['Local', post.location || metadata.location || metadata.local],
    ['Data do evento', values.eventDate],
    ['Prazo', values.deadline],
    ['Modalidade', metadata.modalidadeTrabalho || metadata.modalidade],
    ['Contato', metadata.contato],
    ['Fonte oficial', metadata.source_url],
    ['Link principal', values.actionLink],
  ].filter((row) => row[1]);

  if (!rows.length) return { blockStyle: 'display:none;', grid: '' };

  const grid = rows.map(([label, value]) => {
    const text = String(value || '').trim();
    const safeValue = /^https?:\/\//i.test(text)
      ? `<a href="${escapeAttr(text)}" rel="noopener noreferrer" target="_blank">${escapeHtml(text)}</a>`
      : escapeHtml(text);
    return `<div class="kc-spec-item"><span>${escapeHtml(label)}</span><strong>${safeValue}</strong></div>`;
  }).join('');

  return { blockStyle: 'display:block;', grid };
}

function replaceMainImage(html, values) {
  const image = isRemoteImageUrl(values.image) ? values.image : '';
  if (!image) {
    return html.replace(
      /<div class="kc-emoji-cover" id="emojiCover" aria-hidden="true">[\s\S]*?<\/div>/i,
      '<div class="kc-emoji-cover" id="emojiCover" aria-hidden="true">✨</div>'
    );
  }

  let modified = html.replace(
    /<img id="mainImage"[\s\S]*?\/>/i,
    `<img id="mainImage" alt="Imagem da publicação: ${escapeAttr(values.title)}" width="1200" height="900" decoding="async" fetchpriority="high" src="${escapeAttr(image)}" style="display:block;" />`
  );
  modified = modified.replace(
    /<div class="kc-emoji-cover" id="emojiCover" aria-hidden="true">[\s\S]*?<\/div>/i,
    '<div class="kc-emoji-cover" id="emojiCover" aria-hidden="true" style="display:none;">✨</div>'
  );
  return modified;
}

function replacePriceBlock(html, values) {
  if (!values.priceText) return html;
  let modified = html.replace(/<div class="kc-product-price" id="priceBlock" style="display:none;">/i, '<div class="kc-product-price" id="priceBlock" style="display:flex;">');
  modified = replaceById(modified, 'priceValue', `<span id="priceValue">${escapeHtml(values.priceText)}</span>`);
  return modified;
}

function injectVisibleProductContent(html, post, values) {
  const specs = specRowsHtml(post, values);
  let modified = html;
  modified = replaceById(
    modified,
    'breadcrumb',
    `<div class="kc-post-breadcrumb" id="breadcrumb"><a href="index.html"><i class="fas fa-home"></i> KinoCampus</a> <i class="fas fa-chevron-right"></i> <a href="${escapeAttr(modulePage(post.module))}">${escapeHtml(values.categoryLabel)}</a> <i class="fas fa-chevron-right"></i> <span>${escapeHtml(values.title)}</span></div>`
  );
  modified = replaceById(modified, 'postTitle', `<h1 class="kc-product-title" id="postTitle">${escapeHtml(values.title)}</h1>`);
  modified = replaceById(modified, 'badges', `<div class="kc-product-badges" id="badges">${buildBadgesHtml(post, values)}</div>`);
  modified = replaceById(modified, 'postDescription', `<div class="kc-product-description" id="postDescription">${paragraphHtml(values.rawDescription || values.description)}</div>`);
  modified = replaceById(modified, 'specsGrid', `<div class="kc-specs-grid" id="specsGrid">${specs.grid}</div>`);
  modified = modified.replace(/<div class="kc-product-specs" id="specsBlock" style="display:none;">/i, `<div class="kc-product-specs" id="specsBlock" style="${specs.blockStyle}">`);
  modified = replacePriceBlock(modified, values);
  modified = replaceMainImage(modified, values);
  return modified;
}

function buildArticleAuthor(post, values) {
  const metadata = metadataOf(post);
  const sourceUrl = getSourceUrl(post, values);
  const name = cleanText(
    metadata.source_unit
      || metadata.sourceUnit
      || metadata.orgao
      || metadata.organizer
      || metadata.publisher
      || metadata.author_name
      || metadata.authorName
      || metadata.source_author
      || metadata.sourceAuthor
      || 'Comunidade UFG'
  );
  const author = {
    '@type': 'Organization',
    name: name || 'Comunidade UFG',
  };
  if (sourceUrl) author.url = sourceUrl;
  return author;
}

function buildArticle(post, values) {
  const metadata = metadataOf(post);
  const body = cleanText(post.description);
  const sourceUrl = getSourceUrl(post, values);
  const entity = {
    '@type': 'Article',
    '@id': `${values.canonicalUrl}#article`,
    mainEntityOfPage: { '@id': `${values.canonicalUrl}#webpage` },
    headline: values.title,
    name: values.title,
    description: values.description,
    articleBody: body || undefined,
    articleSection: values.categoryLabel,
    url: values.canonicalUrl,
    image: [values.image],
    inLanguage: 'pt-BR',
    datePublished: isoDate(post.created_at) || undefined,
    dateModified: isoDate(post.updated_at || post.created_at) || undefined,
    author: buildArticleAuthor(post, values),
    publisher: { '@id': `${SITE_ORIGIN}/#organization` },
    isAccessibleForFree: true,
    wordCount: wordCount(body) || undefined,
    about: [
      post.module ? { '@type': 'Thing', name: getCategoryLabel(post.module, post.category) } : null,
      post.category ? { '@type': 'Thing', name: beautifyKey(post.category) } : null,
    ].filter(Boolean),
  };
  if (post.location) entity.contentLocation = { '@type': 'Place', name: String(post.location) };
  if (sourceUrl) entity.isBasedOn = sourceUrl;
  if (metadata.source_id || metadata.sourceId) entity.identifier = String(metadata.source_id || metadata.sourceId);
  return entity;
}

function buildEvent(post, values) {
  const metadata = metadataOf(post);
  const startDate = joinDateAndTime(values.eventDate, metadata.hora_evento || metadata.horaEvento || metadata.time);
  if (post.module !== 'eventos' || !startDate) return null;
  return {
    '@type': 'Event',
    '@id': `${values.canonicalUrl}#event`,
    name: values.title,
    description: values.description,
    image: [values.image],
    url: values.canonicalUrl,
    startDate,
    endDate: joinDateAndTime(metadata.data_evento_fim || metadata.endDate || metadata.date_end_at, metadata.hora_evento_fim || metadata.endTime) || undefined,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    isAccessibleForFree: metadata.gratuito !== false,
    location: post.location ? { '@type': 'Place', name: String(post.location) } : undefined,
    organizer: {
      '@type': 'Organization',
      name: metadata.source_unit || metadata.organizer || 'Comunidade UFG',
      url: metadata.source_url || values.actionLink || SITE_ORIGIN,
    },
    offers: values.actionLink ? {
      '@type': 'Offer',
      url: values.actionLink,
      price: 0,
      priceCurrency: 'BRL',
      availability: 'https://schema.org/InStock',
    } : undefined,
  };
}

function buildJobPosting(post, values) {
  const metadata = metadataOf(post);
  const moduleKey = String(post.module || '');
  const categoryText = `${post.category || ''} ${values.title}`.toLowerCase();
  if (moduleKey !== 'oportunidades') return null;
  if (!/(emprego|vaga|professor|substituto|contrata|sele[cç][aã]o|processo seletivo)/i.test(categoryText)) return null;
  if (!values.actionLink || !values.deadline) return null;
  return {
    '@type': 'JobPosting',
    '@id': `${values.canonicalUrl}#job`,
    title: values.title,
    description: values.description,
    datePosted: dateOnly(post.created_at || post.updated_at) || dateOnly(new Date()),
    validThrough: joinDateAndTime(values.deadline, '23:59'),
    employmentType: metadata.employmentType || 'CONTRACTOR',
    hiringOrganization: {
      '@type': 'Organization',
      name: metadata.source_unit || metadata.orgao || metadata.organizer || 'Universidade Federal de Goiás',
      sameAs: metadata.source_url || values.actionLink || SITE_ORIGIN,
    },
    jobLocation: post.location ? {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: String(post.location),
        addressCountry: 'BR',
      },
    } : undefined,
    directApply: false,
    url: values.actionLink,
  };
}

function buildProduct(post, values) {
  if (post.module !== 'compra-venda') return null;
  const price = Number(post.price);
  if (!Number.isFinite(price)) return null;
  return {
    '@type': 'Product',
    '@id': `${values.canonicalUrl}#product`,
    name: values.title,
    description: values.description,
    image: values.image,
    offers: {
      '@type': 'Offer',
      url: values.canonicalUrl,
      price,
      priceCurrency: 'BRL',
      availability: 'https://schema.org/InStock',
    },
  };
}

function removeUndefined(value) {
  if (Array.isArray(value)) return value.map(removeUndefined).filter((item) => item !== undefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined && entryValue !== '')
      .map(([key, entryValue]) => [key, removeUndefined(entryValue)])
  );
}

function buildProductJsonLd(post, values) {
  const richEntity = buildEvent(post, values) || buildJobPosting(post, values) || buildProduct(post, values) || buildArticle(post, values);
  const graph = [
    {
      '@type': 'Organization',
      '@id': `${SITE_ORIGIN}/#organization`,
      name: 'KinoCampus',
      url: `${SITE_ORIGIN}/`,
      logo: `${SITE_ORIGIN}/assets/favicon.svg`,
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'contato@kinocampus.com.br',
        availableLanguage: 'pt-BR',
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_ORIGIN}/#website`,
      name: 'KinoCampus',
      url: `${SITE_ORIGIN}/`,
      inLanguage: 'pt-BR',
      publisher: { '@id': `${SITE_ORIGIN}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: `${SITE_ORIGIN}/search-results.html?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${values.canonicalUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'KinoCampus', item: `${SITE_ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: values.categoryLabel, item: `${SITE_ORIGIN}/${modulePage(post.module)}` },
        { '@type': 'ListItem', position: 3, name: values.title, item: values.canonicalUrl },
      ],
    },
    {
      '@type': 'WebPage',
      '@id': `${values.canonicalUrl}#webpage`,
      url: values.canonicalUrl,
      name: values.seoTitle,
      description: values.description,
      isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
      inLanguage: 'pt-BR',
      image: values.image,
      breadcrumb: { '@id': `${values.canonicalUrl}#breadcrumb` },
      mainEntity: { '@id': richEntity['@id'] },
    },
    richEntity,
  ];

  return removeUndefined({
    '@context': 'https://schema.org',
    '@graph': graph,
  });
}

function replaceOrInsertProductJsonLd(html, data) {
  const script = `<script type="application/ld+json" data-kc-product-structured-data="true">${JSON.stringify(data)}</script>`;
  if (/data-kc-product-structured-data="true"/i.test(html)) {
    return html.replace(/<script\s+type="application\/ld\+json"\s+data-kc-product-structured-data="true">[\s\S]*?<\/script>/i, script);
  }
  return html.replace('</head>', `  ${script}\n</head>`);
}

function applyNoindexMeta(html, canonicalUrl) {
  let modified = replaceOrInsertCanonical(html, canonicalUrl || `${SITE_ORIGIN}/product.html`);
  modified = replaceOrInsertRobots(modified, NOINDEX_ROBOTS);
  return modified;
}

function applyIndexableMeta(html, post, values) {
  let modified = html;
  modified = replaceMetaContent(modified, 'property', 'og:type', post.module === 'eventos' ? 'event' : 'article');
  modified = replaceMetaContent(modified, 'property', 'og:title', values.seoTitle);
  modified = replaceMetaContent(modified, 'property', 'og:description', values.description);
  modified = replaceMetaContent(modified, 'property', 'og:image', values.image);
  modified = replaceMetaContent(modified, 'property', 'og:url', values.canonicalUrl);
  modified = replaceMetaContent(modified, 'name', 'twitter:card', 'summary_large_image');
  modified = replaceMetaContent(modified, 'name', 'twitter:title', values.seoTitle);
  modified = replaceMetaContent(modified, 'name', 'twitter:description', values.description);
  modified = replaceMetaContent(modified, 'name', 'twitter:image', values.image);
  modified = replaceTitleTag(modified, values.seoTitle);
  modified = replaceOrInsertMetaDescription(modified, values.description);
  modified = replaceOrInsertCanonical(modified, values.canonicalUrl);
  modified = replaceOrInsertRobots(modified, INDEXABLE_ROBOTS);
  if (!/property="og:locale"/i.test(modified)) {
    modified = modified.replace('<meta property="og:type"', '<meta property="og:locale" content="pt_BR" />\n  <meta property="og:type"');
  }
  return replaceOrInsertProductJsonLd(modified, buildProductJsonLd(post, values));
}

export default async function handler(req, res) {
  const html = getProductHtml();
  const id = req && req.query ? req.query.id : '';

  if (!id) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.send(applyNoindexMeta(html, `${SITE_ORIGIN}/product.html`));
  }

  try {
    const post = await fetchPost(String(id));
    if (!post) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return res.send(applyNoindexMeta(html, `${SITE_ORIGIN}/product.html?id=${encodeURIComponent(String(id))}`));
    }

    const values = buildProductValues(post, req);
    let modified = applyNoindexMeta(html, values.canonicalUrl);
    if (shouldIndexPost(post, values)) {
      modified = applyIndexableMeta(modified, post, values);
      modified = injectVisibleProductContent(modified, post, values);
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(modified);
  } catch (err) {
    console.error('[og-product] Handler error:', err && err.message ? err.message : err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(applyNoindexMeta(html, `${SITE_ORIGIN}/product.html?id=${encodeURIComponent(String(id))}`));
  }
}

export {
  buildProductJsonLd,
  buildProductValues,
  shouldIndexPost,
};

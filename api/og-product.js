/*
  KinoCampus - SEO/OG SSR for product pages.

  Intercepts /product.html?id=... on Vercel, fetches one published
  Supabase post, and injects crawlable HTML, Open Graph/Twitter tags,
  canonical/robots directives and JSON-LD.
*/
import fs from 'node:fs';
import path from 'node:path';
import {
  canonicalPostId,
  cleanText,
  dateOnly,
  getPostDeadline,
  isoDate,
  metadataOf,
  shouldIndexPost,
} from './_lib/product-seo-policy.js';
import {
  fetchPublicSupabaseJson,
  PUBLIC_SUPABASE_TIMEOUT_MS,
} from './_lib/supabase-public-request.js';

const SITE_ORIGIN = 'https://www.kinocampus.com.br';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INDEXABLE_ROBOTS = 'index,follow,max-image-preview:large,max-snippet:-1';
const NOINDEX_ROBOTS = 'noindex,follow,noarchive';
const META_DESCRIPTION_MAX_LENGTH = 180;
const SEO_TITLE_MAX_LENGTH = 70;
const OG_SUPABASE_TIMEOUT_MS = PUBLIC_SUPABASE_TIMEOUT_MS;

let cachedHtml = null;

class BackendUnavailableError extends Error {
  constructor(message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'BackendUnavailableError';
  }
}

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

function createLookupDeadline(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error('OG Supabase lookup timed out')),
    timeoutMs,
  );
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
    },
  };
}

async function fetchPost(id, {
  fetchImpl = globalThis.fetch,
  timeoutMs = OG_SUPABASE_TIMEOUT_MS,
} = {}) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    console.error('[og-product] Supabase config missing - url:', url ? 'OK' : 'EMPTY', '| key:', key ? 'OK' : 'EMPTY');
    throw new BackendUnavailableError('Supabase configuration unavailable');
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
  const isUuid = UUID_RE.test(id);
  const primaryFilter = isUuid ? `id=eq.${encodeURIComponent(id)}` : `legacy_id=eq.${encodeURIComponent(id)}`;
  const primaryEndpoint = `${url}/rest/v1/posts?select=${encodeURI(select)}&${primaryFilter}&status=eq.published&limit=1`;
  const primaryCompat = `${url}/rest/v1/posts?select=${encodeURI(selectCompat)}&${primaryFilter}&status=eq.published&limit=1`;

  const lookupDeadline = createLookupDeadline(timeoutMs);
  const requestRows = async (endpoint, compatEndpoint, label) => {
    let result = await fetchPublicSupabaseJson(endpoint, {
      key,
      fetchImpl,
      timeoutMs,
      signal: lookupDeadline.signal,
    });
    if (!result.ok && result.status === 400) {
      result = await fetchPublicSupabaseJson(compatEndpoint, {
        key,
        fetchImpl,
        timeoutMs,
        signal: lookupDeadline.signal,
      });
    }
    if (!result.ok) {
      const status = Number.isInteger(result.status) ? ` with status ${result.status}` : '';
      throw new BackendUnavailableError(`Supabase ${label} request failed${status}`);
    }
    if (!Array.isArray(result.data)) {
      throw new BackendUnavailableError(`Supabase returned an invalid ${label} payload`);
    }
    return result.data;
  };

  try {
    const rows = await requestRows(primaryEndpoint, primaryCompat, 'post');
    if (Array.isArray(rows) && rows.length > 0) return rows[0];

    if (isUuid) {
      const fallbackFilter = `legacy_id=eq.${encodeURIComponent(id)}`;
      const fallbackEndpoint = `${url}/rest/v1/posts?select=${encodeURI(select)}&${fallbackFilter}&status=eq.published&limit=1`;
      const fallbackCompat = `${url}/rest/v1/posts?select=${encodeURI(selectCompat)}&${fallbackFilter}&status=eq.published&limit=1`;
      const fallbackRows = await requestRows(fallbackEndpoint, fallbackCompat, 'fallback post');
      return fallbackRows.length > 0 ? fallbackRows[0] : null;
    }
    return null;
  } catch (err) {
    console.error('[og-product] fetchPost error:', err && err.message ? err.message : err);
    if (err instanceof BackendUnavailableError) throw err;
    throw new BackendUnavailableError('Supabase post lookup failed', err);
  } finally {
    lookupDeadline.dispose();
  }
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

function formatLinkLabel(url) {
  const text = String(url || '').trim();
  let label = text;
  try {
    const parsed = new URL(text);
    const path = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
    label = parsed.hostname.replace(/^www\./, '') + path;
    if (parsed.search && label.length < 42) label += parsed.search;
  } catch (_) {}
  return label.length > 56 ? `${label.slice(0, 53).trim()}...` : label;
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

function isHttpUrl(value) {
  return /^https?:\/\/[^\s"'<>]+$/i.test(String(value || '').trim());
}

function flattenImageCandidates(value) {
  if (!value) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenImageCandidates);
  if (typeof value === 'object') {
    return flattenImageCandidates(value.url || value.image_url || value.imageUrl || value.src || value.href);
  }
  return [];
}

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
function getPostImage(post) {
  const metadata = metadataOf(post);
  const media = post && post.post_media;
  const mediaCandidates = Array.isArray(media)
    ? flattenImageCandidates([
        media.find((item) => item && item.is_cover === true),
        media,
      ])
    : [];
  // post_media e a fonte canonica da galeria (URLs persistidas no storage).
  // A coluna posts.image_url pode estar stale (URL temporaria/social) - ela
  // entra apenas como candidata de baixa prioridade e e filtrada se temporaria.
  const candidates = flattenImageCandidates([
    mediaCandidates,
    post && post.imagens,
    post && post.images,
    metadata.gallery_image_urls,
    metadata.galleryImageUrls,
    metadata.image_urls,
    metadata.imagens,
    metadata.images,
    metadata.cover_url,
    metadata.coverUrl,
    metadata.image_url,
    metadata.imageUrl,
    metadata.og_image,
    metadata.ogImage,
    metadata.thumbnail_url,
    metadata.thumbnailUrl,
    post && post.gallery_image_urls,
    post && post.image_urls,
    post && post.image_url,
    post && post.imageUrl,
    post && post.cover_url,
    post && post.coverUrl,
  ]);
  return candidates
    .map((item) => String(item || '').trim())
    .filter(isHttpUrl)
    .find((url) => !isTemporaryImageUrl(url)) || '';
}

function isRemoteImageUrl(value) {
  return isHttpUrl(value) && !/\.(?:pdf|docx?|xlsx?|pptx?|zip|html?|php)(?:[?#].*)?$/i.test(String(value || '').trim());
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

function joinDateAndTime(date, time) {
  const day = dateOnly(date);
  const cleanTime = String(time || '').match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)?.[0] || '';
  if (!day) return '';
  return cleanTime ? `${day}T${cleanTime}:00-03:00` : day;
}

function getDeadline(post) {
  return getPostDeadline(post);
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

function buildProductValues(post) {
  const id = canonicalPostId(post);
  const rawTitle = cleanText(post.title) || 'Publicação no KinoCampus';
  const title = clamp(rawTitle, 140);
  const categoryLabel = getCategoryLabel(post.module, post.category);
  const priceText = formatPrice(post.price);
  const cleanDescription = cleanText(post.description);
  const prefix = [categoryLabel, post.location, priceText && priceText !== 'Gratuito' ? priceText : ''].filter(Boolean).join(' | ');
  const description = clamp(prefix ? `${prefix}: ${cleanDescription}` : cleanDescription, META_DESCRIPTION_MAX_LENGTH)
    || 'Publicação pública da comunidade universitária da UFG no KinoCampus.';
  const imageFallback = `${SITE_ORIGIN}/api/og-image?type=${encodeURIComponent(post.module || 'product')}`;
  const image = getPostImage(post) || imageFallback;
  const canonicalUrl = `${SITE_ORIGIN}/product.html?id=${encodeURIComponent(id)}`;

  return {
    id,
    title,
    seoTitle: clamp(`${title} - KinoCampus`, SEO_TITLE_MAX_LENGTH),
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

  const iconByLabel = {
    'M\u00f3dulo': 'fas fa-layer-group',
    Categoria: 'fas fa-tag',
    Local: 'fas fa-map-marker-alt',
    'Data do evento': 'fas fa-calendar-day',
    Prazo: 'fas fa-calendar-check',
    Modalidade: 'fas fa-laptop-house',
    Contato: 'fas fa-envelope',
    'Fonte oficial': 'fas fa-external-link-alt',
    'Link principal': 'fas fa-link',
  };

  const grid = rows.map(([label, value]) => {
    const text = String(value || '').trim();
    const isLink = /^https?:\/\//i.test(text);
    const safeValue = isLink
      ? `<a href="${escapeAttr(text)}" rel="noopener noreferrer" target="_blank" title="${escapeAttr(text)}">${escapeHtml(formatLinkLabel(text))}</a>`
      : escapeHtml(text);
    const itemClass = isLink ? 'kc-spec-item kc-spec-item--link' : 'kc-spec-item';
    const iconClass = iconByLabel[label] || 'fas fa-info-circle';
    return `<div class="${itemClass}"><i class="${escapeAttr(iconClass)}"></i><div class="kc-spec-item__body"><strong>${escapeHtml(label)}</strong><span>${safeValue}</span></div></div>`;
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

function buildArticleAuthor(post) {
  const metadata = metadataOf(post);
  const personName = cleanText(
    metadata.author_name
      || metadata.authorName
      || metadata.source_author
      || metadata.sourceAuthor
  );
  if (personName) {
    const personUrl = [metadata.author_url, metadata.authorUrl]
      .find((url) => /^https?:\/\//i.test(String(url || ''))) || '';
    return {
      '@type': 'Person',
      name: personName,
      url: personUrl || undefined,
    };
  }

  const organizer = metadata.organizer;
  const publisher = metadata.publisher;
  const organizationName = cleanText(
    metadata.source_unit
      || metadata.sourceUnit
      || metadata.orgao
      || (organizer && typeof organizer === 'object' ? organizer.name : organizer)
      || (publisher && typeof publisher === 'object' ? publisher.name : publisher)
  );
  if (!organizationName) return undefined;

  const organizationUrl = [
    organizer && typeof organizer === 'object' ? organizer.url : '',
    publisher && typeof publisher === 'object' ? publisher.url : '',
    metadata.publisher_url,
    metadata.publisherUrl,
  ].find((url) => /^https?:\/\//i.test(String(url || ''))) || '';
  return {
    '@type': 'Organization',
    name: organizationName,
    url: organizationUrl || undefined,
  };
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
    author: buildArticleAuthor(post),
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

function cleanScalar(value) {
  return (typeof value === 'string' || typeof value === 'number') ? cleanText(value) : '';
}

function firstCleanScalar(candidates) {
  for (const candidate of candidates) {
    const value = cleanScalar(candidate);
    if (value) return value;
  }
  return '';
}

function buildExplicitPostalAddress(metadata, scope) {
  const isEvent = scope === 'event';
  const rawAddress = [
    isEvent ? metadata.event_address : metadata.job_address,
    isEvent ? metadata.eventAddress : metadata.jobAddress,
    metadata.address,
    metadata.endereco,
  ].find((value) => value && (typeof value === 'string' || (typeof value === 'object' && !Array.isArray(value))));
  const structured = rawAddress && typeof rawAddress === 'object' ? rawAddress : {};
  const stringAddress = typeof rawAddress === 'string' ? rawAddress : '';

  const streetAddress = firstCleanScalar([
    structured.streetAddress,
    structured.street_address,
    stringAddress,
    isEvent ? metadata.event_street_address : metadata.job_street_address,
    isEvent ? metadata.eventStreetAddress : metadata.jobStreetAddress,
    metadata.street_address,
    metadata.streetAddress,
  ]);
  const addressLocality = firstCleanScalar([
    structured.addressLocality,
    structured.city,
    structured.cidade,
    isEvent ? metadata.event_city : metadata.job_city,
    isEvent ? metadata.eventCity : metadata.jobCity,
    metadata.addressLocality,
    metadata.city,
    metadata.cidade,
  ]);
  const addressRegion = firstCleanScalar([
    structured.addressRegion,
    structured.state,
    structured.estado,
    isEvent ? metadata.event_state : metadata.job_state,
    isEvent ? metadata.eventState : metadata.jobState,
    metadata.addressRegion,
    metadata.state,
    metadata.estado,
  ]);
  const postalCode = firstCleanScalar([
    structured.postalCode,
    structured.postal_code,
    structured.cep,
    isEvent ? metadata.event_postal_code : metadata.job_postal_code,
    isEvent ? metadata.eventPostalCode : metadata.jobPostalCode,
    metadata.postalCode,
    metadata.postal_code,
    metadata.cep,
  ]);
  const addressCountry = firstCleanScalar([
    structured.addressCountry,
    structured.country,
    isEvent ? metadata.event_country : metadata.job_country,
    isEvent ? metadata.eventCountry : metadata.jobCountry,
    metadata.addressCountry,
    metadata.country,
  ]) || 'BR';

  // A venue/campus label alone is not a postal address. Events require an
  // explicit street/full-address value; jobs may use an explicit city.
  if (isEvent ? !streetAddress : (!streetAddress && !addressLocality)) return null;

  return {
    '@type': 'PostalAddress',
    streetAddress: streetAddress || undefined,
    addressLocality: addressLocality || undefined,
    addressRegion: addressRegion || undefined,
    postalCode: postalCode || undefined,
    addressCountry,
  };
}

function firstExplicitNumber(candidates) {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    const value = Number(candidate);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function buildExplicitEventOffer(post, metadata) {
  const offerUrl = [
    metadata.ticket_url,
    metadata.ticketUrl,
    metadata.offer_url,
    metadata.offerUrl,
    metadata.registration_url,
    metadata.inscricao_url,
    metadata.cta_url,
    metadata.link,
  ].find((url) => /^https?:\/\//i.test(String(url || ''))) || '';
  if (!offerUrl) return undefined;
  const explicitPrice = firstExplicitNumber([
    post.price,
    metadata.ticket_price,
    metadata.ticketPrice,
    metadata.preco,
    metadata.price,
  ]);
  const price = metadata.gratuito === true ? 0 : explicitPrice;
  if (price === null || (metadata.gratuito === false && price <= 0)) return undefined;
  const currency = firstCleanScalar([metadata.priceCurrency, metadata.price_currency, metadata.currency]).toUpperCase();

  return {
    '@type': 'Offer',
    url: offerUrl,
    price,
    priceCurrency: /^[A-Z]{3}$/.test(currency) ? currency : 'BRL',
  };
}

function buildEvent(post, values) {
  const metadata = metadataOf(post);
  const startDate = joinDateAndTime(values.eventDate, metadata.hora_evento || metadata.horaEvento || metadata.time);
  const address = buildExplicitPostalAddress(metadata, 'event');
  const locationName = firstCleanScalar([
    metadata.event_venue,
    metadata.eventVenue,
    metadata.event_location,
    metadata.eventLocation,
    post.location,
    address && address.streetAddress,
  ]);
  const description = cleanText(post.description);
  if (post.module !== 'eventos' || !startDate || !address || !locationName || !cleanText(post.title) || !description) {
    return null;
  }

  const organizer = metadata.organizer;
  const organizerName = cleanText(
    metadata.source_unit
      || (organizer && typeof organizer === 'object' ? organizer.name : organizer)
  );
  const organizerUrl = [
    organizer && typeof organizer === 'object' ? organizer.url : '',
    metadata.organizer_url,
    metadata.organizerUrl,
  ]
    .find((url) => /^https?:\/\//i.test(String(url || ''))) || '';

  return {
    '@type': 'Event',
    '@id': `${values.canonicalUrl}#event`,
    name: values.title,
    description,
    image: [values.image],
    url: values.canonicalUrl,
    startDate,
    endDate: joinDateAndTime(metadata.data_evento_fim || metadata.endDate || metadata.date_end_at, metadata.hora_evento_fim || metadata.endTime) || undefined,
    isAccessibleForFree: typeof metadata.gratuito === 'boolean' ? metadata.gratuito : undefined,
    location: {
      '@type': 'Place',
      name: locationName,
      address,
    },
    organizer: organizerName ? {
      '@type': 'Organization',
      name: organizerName,
      url: organizerUrl || undefined,
    } : undefined,
    offers: buildExplicitEventOffer(post, metadata),
  };
}

function normalizedKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

function hasExplicitJobSignal(post, metadata) {
  const explicitFlag = [
    metadata.is_job,
    metadata.isJob,
    metadata.is_job_posting,
    metadata.isJobPosting,
    metadata.job_posting,
    metadata.jobPosting,
  ].some((value) => value === true || String(value).trim().toLowerCase() === 'true');
  const schemaType = normalizedKey(metadata.schema_type || metadata.schemaType || metadata.structured_data_type);
  const employmentType = cleanScalar(metadata.employmentType || metadata.employment_type || metadata.regimeContratacao);
  const categoryCandidates = [
    post.category,
    metadata.category,
    metadata.categoriaKey,
    metadata.subcategory,
    metadata.subcategoriaKey,
    metadata.opportunity_type,
    metadata.opportunityType,
  ].map(normalizedKey);
  const employmentCategories = new Set([
    'emprego',
    'empregos',
    'estagio',
    'estagios',
    'freelancer',
    'trainee',
    'jovem-aprendiz',
  ]);

  return explicitFlag
    || schemaType === 'jobposting'
    || Boolean(employmentType)
    || categoryCandidates.some((category) => employmentCategories.has(category));
}

function buildJobPosting(post, values) {
  const metadata = metadataOf(post);
  const moduleKey = String(post.module || '');
  const datePosted = dateOnly(post.created_at || post.updated_at);
  const validThrough = joinDateAndTime(values.deadline, '23:59');
  const hiringOrganization = metadata.hiringOrganization || metadata.hiring_organization;
  const jobOrganizer = metadata.organizer;
  const hiringOrganizationName = cleanText(
    (hiringOrganization && typeof hiringOrganization === 'object'
      ? hiringOrganization.name
      : hiringOrganization)
      || metadata.source_unit
      || metadata.orgao
      || (jobOrganizer && typeof jobOrganizer === 'object' ? jobOrganizer.name : jobOrganizer)
  );
  const hiringOrganizationUrl = [
    hiringOrganization && typeof hiringOrganization === 'object'
      ? hiringOrganization.sameAs || hiringOrganization.url
      : '',
    metadata.hiring_organization_url,
    metadata.hiringOrganizationUrl,
  ].find((url) => /^https?:\/\//i.test(String(url || ''))) || '';
  const address = buildExplicitPostalAddress(metadata, 'job');
  const locationName = firstCleanScalar([
    metadata.job_location,
    metadata.jobLocation,
    metadata.workplace,
    address && address.addressLocality,
    address && address.streetAddress,
    post.location,
  ]);
  const description = cleanText(post.description);
  const employmentType = String(metadata.employmentType || '').trim().toUpperCase();
  const supportedEmploymentTypes = new Set([
    'FULL_TIME',
    'PART_TIME',
    'CONTRACTOR',
    'TEMPORARY',
    'INTERN',
    'VOLUNTEER',
    'PER_DIEM',
    'OTHER',
  ]);

  if (moduleKey !== 'oportunidades') return null;
  if (!hasExplicitJobSignal(post, metadata)) return null;
  if (
    !values.actionLink
    || !validThrough
    || !datePosted
    || !hiringOrganizationName
    || !address
    || !locationName
    || !cleanText(post.title)
    || !description
  ) return null;

  return {
    '@type': 'JobPosting',
    '@id': `${values.canonicalUrl}#job`,
    title: values.title,
    description,
    datePosted,
    validThrough,
    employmentType: supportedEmploymentTypes.has(employmentType) ? employmentType : undefined,
    hiringOrganization: {
      '@type': 'Organization',
      name: hiringOrganizationName,
      sameAs: hiringOrganizationUrl || undefined,
    },
    jobLocation: {
      '@type': 'Place',
      name: locationName,
      address: {
        ...address,
      },
    },
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

function serializeJsonForHtml(data) {
  return JSON.stringify(data)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function replaceOrInsertProductJsonLd(html, data) {
  const script = `<script type="application/ld+json" data-kc-product-structured-data="true">${serializeJsonForHtml(data)}</script>`;
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
  const imageAlt = `Imagem da publicação: ${values.title}`;
  modified = replaceMetaContent(modified, 'property', 'og:type', post.module === 'eventos' ? 'event' : 'article');
  modified = replaceMetaContent(modified, 'property', 'og:title', values.seoTitle);
  modified = replaceMetaContent(modified, 'property', 'og:description', values.description);
  modified = replaceMetaContent(modified, 'property', 'og:image', values.image);
  modified = replaceMetaContent(modified, 'property', 'og:image:alt', imageAlt);
  modified = replaceMetaContent(modified, 'property', 'og:url', values.canonicalUrl);
  modified = replaceMetaContent(modified, 'name', 'twitter:card', 'summary_large_image');
  modified = replaceMetaContent(modified, 'name', 'twitter:title', values.seoTitle);
  modified = replaceMetaContent(modified, 'name', 'twitter:description', values.description);
  modified = replaceMetaContent(modified, 'name', 'twitter:image', values.image);
  modified = replaceMetaContent(modified, 'name', 'twitter:image:alt', imageAlt);
  modified = replaceTitleTag(modified, values.seoTitle);
  modified = replaceOrInsertMetaDescription(modified, values.description);
  modified = replaceOrInsertCanonical(modified, values.canonicalUrl);
  modified = replaceOrInsertRobots(modified, INDEXABLE_ROBOTS);
  if (!/property="og:locale"/i.test(modified)) {
    modified = modified.replace('<meta property="og:type"', '<meta property="og:locale" content="pt_BR" />\n  <meta property="og:type"');
  }
  return replaceOrInsertProductJsonLd(modified, buildProductJsonLd(post, values));
}

function sendHtmlResponse(res, status, body, cacheControl, retryAfter) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', cacheControl);
  if (retryAfter) res.setHeader('Retry-After', String(retryAfter));
  if (typeof res.status === 'function') res.status(status);
  else res.statusCode = status;
  return res.send(body);
}

export default async function handler(req, res) {
  const html = getProductHtml();
  const id = req && req.query ? req.query.id : '';

  if (!id) {
    return sendHtmlResponse(
      res,
      404,
      applyNoindexMeta(html, `${SITE_ORIGIN}/product.html`),
      'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
    );
  }

  try {
    const post = await fetchPost(String(id));
    if (!post) {
      return sendHtmlResponse(
        res,
        404,
        applyNoindexMeta(html, `${SITE_ORIGIN}/product.html?id=${encodeURIComponent(String(id))}`),
        'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
      );
    }

    const values = buildProductValues(post);
    let modified = applyNoindexMeta(html, values.canonicalUrl);
    // Use the raw shared policy input here. buildProductValues intentionally
    // has a display fallback title, which must never make an untitled record
    // indexable only in SSR while sitemap/RSS exclude it.
    if (shouldIndexPost(post)) {
      modified = applyIndexableMeta(modified, post, values);
      modified = injectVisibleProductContent(modified, post, values);
    }

    return sendHtmlResponse(res, 200, modified, 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
  } catch (err) {
    console.error('[og-product] Handler error:', err && err.message ? err.message : err);
    return sendHtmlResponse(
      res,
      503,
      applyNoindexMeta(html, `${SITE_ORIGIN}/product.html?id=${encodeURIComponent(String(id))}`),
      'private, no-store, max-age=0, s-maxage=0, must-revalidate',
      60
    );
  }
}

export {
  buildProductJsonLd,
  buildProductValues,
  fetchPost,
  serializeJsonForHtml,
  shouldIndexPost,
};

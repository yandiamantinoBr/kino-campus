'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE_ORIGIN = 'https://www.kinocampus.com.br';
const GOOGLE_SITE_VERIFICATION = 'pUhcnFNqCxds-Z6VQcj7g5-IbIcEwSVZ9b2l4_OHIcc';
const GA4_MEASUREMENT_ID = 'G-P9RKYHPB7Z';

const INDEXABLE = {
  'index.html': '/',
  'eventos.html': '/eventos.html',
  'oportunidades.html': '/oportunidades.html',
  'moradia.html': '/moradia.html',
  'compra-venda-feed.html': '/compra-venda-feed.html',
  'caronas-feed.html': '/caronas-feed.html',
  'achados-perdidos.html': '/achados-perdidos.html',
  'sobre.html': '/sobre.html',
  'editorial.html': '/editorial.html',
  'ajuda.html': '/ajuda.html',
  'ods.html': '/ods.html',
  'transparencia.html': '/transparencia.html',
  'privacidade.html': '/privacidade.html',
  'termos.html': '/termos.html',
};

const NOINDEX = [
  '_product.html',
  'account-setup.html',
  'auth-callback.html',
  'create-post.html',
  'mensagens.html',
  'my-posts.html',
  'profile.html',
  'search-results.html',
  'settings.html',
];

const FEED_GUIDE_PAGES = [
  'index.html',
  'eventos.html',
  'oportunidades.html',
  'moradia.html',
  'compra-venda-feed.html',
  'caronas-feed.html',
  'achados-perdidos.html',
];

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function match(html, regex) {
  return (html.match(regex) || [])[1] || '';
}

function textFromHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function canonicalFor(route) {
  return `${SITE_ORIGIN}${route === '/' ? '/' : route}`;
}

function auditHtml(file, expectedRoute, errors, warnings) {
  const html = read(file);
  const title = textFromHtml(match(html, /<title[^>]*>([\s\S]*?)<\/title>/i));
  const description = match(html, /<meta\s+name=["']description["']\s+content=["']([^"']*)/i).trim();
  const canonical = match(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']*)/i).trim();
  const robots = match(html, /<meta\s+name=["']robots["']\s+content=["']([^"']*)/i).trim();
  const h1 = textFromHtml(match(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i));
  const ogTitle = match(html, /<meta\s+property=["']og:title["']\s+content=["']([^"']*)/i).trim();
  const ogDescription = match(html, /<meta\s+property=["']og:description["']\s+content=["']([^"']*)/i).trim();
  const ogImage = match(html, /<meta\s+property=["']og:image["']\s+content=["']([^"']*)/i).trim();
  const rssLink = /<link\s+rel=["']alternate["'][^>]+type=["']application\/rss\+xml["'][^>]+href=["']https:\/\/www\.kinocampus\.com\.br\/feed\.xml["']/i.test(html);

  if (!title || title.length < 8 || title.length > 70) errors.push(`${file}: title ausente ou fora do intervalo recomendado.`);
  if (!description || description.length < 70 || description.length > 180) warnings.push(`${file}: meta description deveria ter entre 70 e 180 caracteres.`);
  if (canonical !== canonicalFor(expectedRoute)) errors.push(`${file}: canonical inesperado (${canonical || 'ausente'}).`);
  if (!/\bindex\b/i.test(robots) || /\bnoindex\b/i.test(robots)) errors.push(`${file}: robots deveria permitir indexacao.`);
  if (!h1 || h1.length < 4) errors.push(`${file}: H1 ausente ou vazio.`);
  if (!ogTitle || !ogDescription || !ogImage) errors.push(`${file}: Open Graph incompleto.`);
  if (!rssLink) errors.push(`${file}: link RSS publico ausente.`);
}

function auditNoindex(file, errors) {
  const html = read(file);
  const robots = match(html, /<meta\s+name=["']robots["']\s+content=["']([^"']*)/i).trim();
  const canonical = match(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']*)/i).trim();
  if (!/\bnoindex\b/i.test(robots)) errors.push(`${file}: deveria estar noindex.`);
  if (!canonical.startsWith(SITE_ORIGIN)) errors.push(`${file}: canonical absoluto ausente.`);
}

function auditRobots(errors) {
  const robots = read('robots.txt');
  if (!robots.includes('Sitemap: https://www.kinocampus.com.br/sitemap.xml')) errors.push('robots.txt: sitemap ausente.');
  if (!/User-agent:\s*OAI-SearchBot[\s\S]*?Allow:\s*\//i.test(robots)) errors.push('robots.txt: OAI-SearchBot nao esta explicitamente liberado.');
  if (!/User-agent:\s*ChatGPT-User[\s\S]*?Allow:\s*\//i.test(robots)) errors.push('robots.txt: ChatGPT-User nao esta explicitamente liberado.');
  if (!/User-agent:\s*GPTBot[\s\S]*?Disallow:\s*\//i.test(robots)) errors.push('robots.txt: GPTBot deveria estar bloqueado.');
  if (!robots.includes('Disallow: /admin/')) errors.push('robots.txt: /admin/ deveria estar bloqueado.');
}

function auditSitemap(errors) {
  const sitemap = read('api/sitemap.js');
  if (!sitemap.includes('xmlns:image')) errors.push('api/sitemap.js: namespace de imagem ausente.');
  if (!sitemap.includes('/editorial.html')) errors.push('api/sitemap.js: pagina editorial ausente.');
  if (!sitemap.includes('status=eq.published')) errors.push('api/sitemap.js: filtro de published ausente.');
  if (!sitemap.includes('/product.html?id=')) errors.push('api/sitemap.js: URL canonica de publicacao ausente.');
  if (!sitemap.includes('expires_at')) errors.push('api/sitemap.js: filtro/consulta de expiracao ausente.');
}

function auditRssFeed(errors) {
  const vercel = read('vercel.json');
  const feed = read('api/feed.js');
  if (!vercel.includes('"source": "/feed.xml"')) errors.push('vercel.json: rewrite /feed.xml ausente.');
  if (!feed.includes('<rss version="2.0"')) errors.push('api/feed.js: raiz RSS 2.0 ausente.');
  if (!feed.includes('application/rss+xml; charset=utf-8')) errors.push('api/feed.js: content-type RSS ausente.');
  if (!feed.includes('limit=30')) errors.push('api/feed.js: limite de itens RSS ausente.');
  if (!feed.includes('status=eq.published')) errors.push('api/feed.js: filtro de published ausente.');
  if (!feed.includes('/product.html?id=')) errors.push('api/feed.js: URL canonica de publicacao ausente.');
}

function auditSearchConsoleVerification(errors) {
  const html = read('index.html');
  const verification = match(html, /<meta\s+name=["']google-site-verification["']\s+content=["']([^"']*)/i).trim();
  if (verification !== GOOGLE_SITE_VERIFICATION) errors.push('index.html: meta google-site-verification ausente ou incorreta.');
}

function hasMojibake(text) {
  return /(?:Ãƒ[\u0080-\u00bf]|Ã‚[\u0080-\u00bf]?|Ã¢[\u0080-\u00bf\u20ac]|ï¿½)/.test(String(text || ''));
}

function auditPublicEncoding(errors) {
  const files = [
    ...Object.keys(INDEXABLE),
    ...NOINDEX,
    'llms.txt',
    'robots.txt',
    'assets/js/boot/kc-seo-structured-data.js',
  ];
  files.forEach((file) => {
    if (hasMojibake(read(file))) errors.push(`${file}: possivel mojibake em texto publico/SEO.`);
  });
}

function auditPublicImageAlt(errors) {
  Object.keys(INDEXABLE).forEach((file) => {
    const html = read(file);
    const tags = html.match(/<img\b[^>]*>/gi) || [];
    tags.forEach((tag, index) => {
      const alt = tag.match(/\balt\s*=\s*(["'])(.*?)\1/i);
      const decorative = /\baria-hidden\s*=\s*["']true["']/i.test(tag)
        || /\brole\s*=\s*["'](?:presentation|none)["']/i.test(tag);
      if (!alt) errors.push(`${file}: imagem estatica ${index + 1} sem atributo alt.`);
      else if (!String(alt[2] || '').trim() && !decorative) errors.push(`${file}: imagem estatica ${index + 1} com alt vazio sem marcacao decorativa.`);
    });
  });

  const cardRenderer = read('assets/js/utils/kc-utils.presentation.js');
  if (!cardRenderer.includes('function buildPostImageAlt(post, moduleKey)')) {
    errors.push('kc-utils.presentation.js: builder de alt contextual dos cards ausente.');
  }
  if (!cardRenderer.includes('Imagem da publicação: ${title}')) {
    errors.push('kc-utils.presentation.js: alt descritivo por titulo ausente nos cards.');
  }

  const related = read('assets/js/controllers/public/product.related.js');
  if (!related.includes('Imagem da publicação relacionada: ')) {
    errors.push('product.related.js: alt contextual das imagens relacionadas ausente.');
  }

  const productTemplate = read('_product.html');
  if (!productTemplate.includes('property="og:image:alt"') || !productTemplate.includes('name="twitter:image:alt"')) {
    errors.push('_product.html: texto alternativo das imagens sociais ausente.');
  }
}

function auditPublicContentDepth(errors) {
  FEED_GUIDE_PAGES.forEach((file) => {
    const html = read(file);
    if (!html.includes('class="kc-feed-guide"')) {
      errors.push(`${file}: guia editorial publico ausente no HTML inicial.`);
    }
    const guideText = textFromHtml(match(html, /<section\s+class=["']kc-feed-guide["'][^>]*>([\s\S]*?)<\/section>/i));
    if (guideText.length < 650) {
      errors.push(`${file}: guia editorial publico muito curto para uma pagina de feed indexavel.`);
    }
    const guideItems = (html.match(/class=["']kc-feed-guide__item["']/g) || []).length;
    if (guideItems < 3) {
      errors.push(`${file}: guia editorial publico deve ter ao menos 3 orientacoes especificas.`);
    }
  });
}

function auditProductSsr(errors) {
  const source = read('api/og-product.js');
  if (!source.includes('const canonicalUrl = `${SITE_ORIGIN}/product.html?id=')) {
    errors.push('api/og-product.js: canonical de produto nao esta ancorada no SITE_ORIGIN.');
  }
  if (source.includes("req.headers['x-forwarded-host']") || source.includes('req.headers.host')) {
    errors.push('api/og-product.js: canonical nao deve depender do Host da requisicao.');
  }
  if (!source.includes('META_DESCRIPTION_MAX_LENGTH = 180') || !source.includes('SEO_TITLE_MAX_LENGTH = 70')) {
    errors.push('api/og-product.js: limites de title/description SEO ausentes.');
  }
}

function auditGoogleTag(errors) {
  const tag = read('assets/js/boot/kc-google-tag.js');
  if (!tag.includes(GA4_MEASUREMENT_ID)) errors.push('kc-google-tag.js: Measurement ID GA4 ausente ou incorreto.');
  if (!tag.includes("window.gtag('consent', 'default', consentPayload(false, false));")) {
    errors.push('kc-google-tag.js: Consent Mode default denied ausente.');
  }
  if (!tag.includes("window.KCConsent.hasConsent('analytics')")) {
    errors.push('kc-google-tag.js: integracao com KCConsent analytics ausente.');
  }
  if (!tag.includes("window.KCConsent.hasConsent('advertising')")) {
    errors.push('kc-google-tag.js: integracao com KCConsent advertising ausente.');
  }
  Object.keys(INDEXABLE).concat(NOINDEX).forEach((file) => {
    const html = read(file);
    if (!html.includes('assets/js/boot/kc-google-tag.js?v=8.6.4')) {
      errors.push(`${file}: tag GA4 consent-aware ausente.`);
    }
    const consentIndex = html.indexOf('assets/js/core/kc-consent.js?v=8.6.4');
    const googleIndex = html.indexOf('assets/js/boot/kc-google-tag.js?v=8.6.4');
    const telemetryIndex = html.indexOf('assets/js/boot/kc-telemetry.js?v=8.6.1');
    if (consentIndex !== -1 && googleIndex !== -1 && telemetryIndex !== -1 && !(consentIndex < googleIndex && googleIndex < telemetryIndex)) {
      errors.push(`${file}: ordem de scripts consent -> google-tag -> telemetry incorreta.`);
    }
  });
}

function main() {
  const errors = [];
  const warnings = [];

  Object.entries(INDEXABLE).forEach(([file, route]) => auditHtml(file, route, errors, warnings));
  NOINDEX.forEach((file) => auditNoindex(file, errors));
  auditRobots(errors);
  auditSitemap(errors);
  auditRssFeed(errors);
  auditSearchConsoleVerification(errors);
  auditGoogleTag(errors);
  auditPublicEncoding(errors);
  auditPublicImageAlt(errors);
  auditPublicContentDepth(errors);
  auditProductSsr(errors);

  const summary = {
    checkedAt: new Date().toISOString(),
    indexablePages: Object.keys(INDEXABLE).length,
    noindexPages: NOINDEX.length,
    integrations: {
      googleSearchConsoleVerification: true,
      googleAnalytics4MeasurementId: GA4_MEASUREMENT_ID,
      consentAwareGoogleTag: true,
    },
    warnings,
    errors,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (errors.length) process.exit(1);
}

main();

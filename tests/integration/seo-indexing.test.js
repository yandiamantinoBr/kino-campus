'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const INDEXABLE_PAGES = {
  'index.html': 'https://www.kinocampus.com.br/',
  'eventos.html': 'https://www.kinocampus.com.br/eventos.html',
  'oportunidades.html': 'https://www.kinocampus.com.br/oportunidades.html',
  'moradia.html': 'https://www.kinocampus.com.br/moradia.html',
  'compra-venda-feed.html': 'https://www.kinocampus.com.br/compra-venda-feed.html',
  'caronas-feed.html': 'https://www.kinocampus.com.br/caronas-feed.html',
  'achados-perdidos.html': 'https://www.kinocampus.com.br/achados-perdidos.html',
  'sobre.html': 'https://www.kinocampus.com.br/sobre.html',
  'editorial.html': 'https://www.kinocampus.com.br/editorial.html',
  'ajuda.html': 'https://www.kinocampus.com.br/ajuda.html',
  'ods.html': 'https://www.kinocampus.com.br/ods.html',
  'transparencia.html': 'https://www.kinocampus.com.br/transparencia.html',
  'privacidade.html': 'https://www.kinocampus.com.br/privacidade.html',
  'termos.html': 'https://www.kinocampus.com.br/termos.html',
};

const NOINDEX_PAGES = [
  'account-setup.html',
  'auth-callback.html',
  'create-post.html',
  'mensagens.html',
  'my-posts.html',
  'profile.html',
  'search-results.html',
  'settings.html',
  '_product.html',
];

const ADMIN_NOINDEX_PAGES = [
  'admin/banners.html',
  'admin/cadu.html',
  'admin/ga4-dashboard.html',
  'admin/help-requests.html',
  'admin/index.html',
  'admin/moderation.html',
  'admin/privacy-analytics.html',
  'admin/reports.html',
];

describe('SEO e indexacao publica', () => {
  test('robots.txt aponta sitemap, bloqueia admin e deixa o noindex ser lido', () => {
    const robots = read('robots.txt');

    expect(robots).toContain('Sitemap: https://www.kinocampus.com.br/sitemap.xml');
    expect(robots).toContain('User-agent: OAI-SearchBot');
    expect(robots).toContain('User-agent: ChatGPT-User');
    expect(robots).toContain('User-agent: GPTBot');
    expect(robots).toMatch(/User-agent:\s*GPTBot\s+Disallow:\s*\//);
    expect(robots).toContain('Disallow: /admin/');
    [
      '/account-setup.html',
      '/auth-callback.html',
      '/create-post.html',
      '/mensagens.html',
      '/my-posts.html',
      '/profile.html',
      '/search-results.html',
      '/settings.html',
    ].forEach((route) => expect(robots).not.toContain(`Disallow: ${route}`));
    expect(robots).not.toContain('User-agent: Googlebot');
  });

  test('rotas legadas de colecoes redirecionam para as URLs canonicas', () => {
    const vercel = read('vercel.json');
    // 2026-09-04: esquema de URLs limpas — .html 308 para a rota canonica
    expect(vercel).toContain('"source": "/compra-venda-feed.html"');
    expect(vercel).toContain('"destination": "/compra-venda"');
    expect(vercel).toContain('"source": "/caronas-feed.html"');
    expect(vercel).toContain('"destination": "/caronas"');
    expect(vercel).toContain('"source": "/eventos.html"');
    expect(vercel).toContain('"destination": "/eventos"');
  });

  test('aliases de conteudo apontam para uma unica URL canonica via redirect', () => {
    const vercel = read('vercel.json');
    expect(vercel).toContain('"source": "/index.html"');
    expect(vercel).toContain('"destination": "/"');
    expect(vercel).toContain('"source": "/apresentacao-institucional"');
    expect(vercel).toContain('"destination": "/apresentacao-institucional.html"');
  });

  test('rota explícita de erro retorna um 404 real e links públicos não criam salto para index.html', () => {
    const vercel = read('vercel.json');
    expect(vercel).toContain('"source": "/404.html"');
    expect(vercel).toContain('"destination": "/api/og-product?kc_not_found=1"');
    expect(vercel).toContain('"api/og-product.js"');
    expect(vercel).toContain('"source": "/(.*)"');

    const publicHtml = fs.readdirSync(ROOT)
      .filter((file) => file.endsWith('.html'));
    publicHtml.forEach((file) => {
      expect(read(file)).not.toContain('href="index.html');
    });
  });

  test('sitemap dinamico lista paginas estaticas e posts published', () => {
    const sitemap = read('api/sitemap.js');
    const vercel = read('vercel.json');

    expect(vercel).toContain('"source": "/sitemap.xml"');
    expect(sitemap).toContain('STATIC_ROUTES');
    expect(sitemap).toContain('/eventos');
    expect(sitemap).toContain('/oportunidades');
    expect(sitemap).toContain('/sobre');
    expect(sitemap).toContain('/editorial');
    expect(sitemap).toContain('/transparencia');
    expect(sitemap).toContain('status=eq.published');
    expect(sitemap).toContain('expires_at');
    expect(sitemap).toContain('xmlns:image');
    expect(sitemap).toContain('<image:image>');
    expect(sitemap).toContain('/product.html?id=');
    expect(sitemap).toContain('application/xml; charset=utf-8');
  });

  test('llms.txt descreve paginas publicas e evita areas privadas', () => {
    const llms = read('llms.txt');

    expect(llms).toContain('KinoCampus');
    expect(llms).toContain('https://www.kinocampus.com.br/sitemap.xml');
    expect(llms).toContain('/admin/');
    expect(llms).toContain('## Publicações');
    expect(llms).toContain('https://www.kinocampus.com.br/sobre.html');
    expect(llms).toContain('https://www.kinocampus.com.br/editorial.html');
    expect(llms).toContain('https://www.kinocampus.com.br/feed.xml');
    expect(llms).toContain('https://www.kinocampus.com.br/transparencia.html');
  });

  test('paginas publicas tem canonical, robots index e JSON-LD compartilhado', () => {
    Object.entries(INDEXABLE_PAGES).forEach(([file, canonical]) => {
      const html = read(file);
      expect(html).toContain(`<link rel="canonical" href="${canonical}" />`);
      expect(html).toContain('<link rel="alternate" type="application/rss+xml" href="https://www.kinocampus.com.br/feed.xml" />');
      expect(html).toContain('<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1" />');
      expect(html).toContain('<meta name="google-adsense-account" content="ca-pub-2776499020194231" />');
      expect(html).toContain('<meta property="og:locale" content="pt_BR" />');
      expect(html).toContain('assets/js/boot/kc-seo-structured-data.js?v=8.6.1');
    });
  });

  test('feed RSS publico esta roteado e filtra apenas publicacoes publicadas', () => {
    const vercel = read('vercel.json');
    const feed = read('api/feed.js');
    const policy = read('api/_lib/product-seo-policy.js');

    expect(vercel).toContain('"source": "/feed.xml"');
    expect(feed).toContain('<rss version="2.0"');
    expect(feed).toContain('application/rss+xml; charset=utf-8');
    expect(feed).toContain('limit=30');
    expect(feed).toContain('status=eq.published');
    expect(feed).toContain('/product.html?id=');
    expect(feed).toContain('shouldIndexPost(post, buildIndexabilityValues(post))');
    expect(policy).toContain('function shouldIndexPost');
  });

  test('home contem verificacao do Google Search Console', () => {
    const html = read('index.html');
    const audit = read('scripts/seo-audit.js');

    expect(html).toContain('<meta name="google-site-verification" content="pUhcnFNqCxds-Z6VQcj7g5-IbIcEwSVZ9b2l4_OHIcc" />');
    expect(audit).toContain('GOOGLE_SITE_VERIFICATION');
  });

  test('ods.html tem H1 e Open Graph completos no HTML inicial', () => {
    const html = read('ods.html');

    expect(html).toContain('<h1 id="kcOdsTitle">ODS e impacto comunitário no KinoCampus</h1>');
    expect(html).toContain('<meta property="og:title" content="ODS e impacto comunitário — KinoCampus" />');
    expect(html).toContain('<meta property="og:image" content="https://www.kinocampus.com.br/api/og-image?type=ods" />');
  });

  test('paginas operacionais ficam fora do indice publico', () => {
    NOINDEX_PAGES.forEach((file) => {
      const html = read(file);
      expect(html).toContain('<meta name="robots" content="noindex');
      expect(html).toContain('<link rel="canonical" href="https://www.kinocampus.com.br/');
      expect(html).not.toContain('google-adsense-account');
      if (file === '_product.html') {
        expect(html).toContain('<link rel="alternate" type="application/rss+xml" href="https://www.kinocampus.com.br/feed.xml" />');
      }
    });
  });

  test('paginas administrativas usam noindex no HTML e no header de producao', () => {
    ADMIN_NOINDEX_PAGES.forEach((file) => {
      expect(read(file)).toContain('<meta name="robots" content="noindex,nofollow" />');
    });

    const vercel = read('vercel.json');
    expect(vercel).toContain('"source": "/admin/(.*)"');
    expect(vercel).toContain('"key": "X-Robots-Tag"');
    expect(vercel).toContain('"value": "noindex, nofollow"');
  });

  test('dados estruturados compartilhados incluem WebSite SearchAction e BreadcrumbList', () => {
    const source = read('assets/js/boot/kc-seo-structured-data.js');

    expect(source).toContain("'@type': 'SearchAction'");
    expect(source).toContain('search-results.html?q={search_term_string}');
    expect(source).toContain("'@type': 'BreadcrumbList'");
    expect(source).toContain("'@type': 'Organization'");
    expect(source).toContain("type: 'AboutPage'");
    expect(source).toContain('/editorial.html');
    expect(source).toContain('Política editorial do KinoCampus');
    expect(source).toContain('Yan Diamantino');
    expect(source).toContain('Universidade Federal de Goias');
    expect(source).toContain("'@type': 'ItemList'");
    expect(source).toContain('/transparencia.html');
  });

  test('SSR de product.html injeta conteudo inicial, canonical, robots e JSON-LD rico', () => {
    const source = read('api/og-product.js');
    const policy = read('api/_lib/product-seo-policy.js');

    expect(source).toContain('replaceOrInsertCanonical');
    expect(source).toContain('replaceOrInsertRobots');
    expect(source).toContain('replaceOrInsertProductJsonLd');
    expect(source).toContain('replaceOrInsertImagePreload');
    expect(source).toContain('injectVisibleProductContent');
    expect(source).toContain('postTitle');
    expect(source).toContain('postDescription');
    expect(source).toContain('specsGrid');
    expect(source).toContain("index,follow,max-image-preview:large,max-snippet:-1");
    expect(source).toContain("'@type': 'Article'");
    expect(source).toContain('mainEntityOfPage');
    expect(source).toContain('articleSection');
    expect(source).toContain('wordCount');
    expect(source).toContain('isBasedOn');
    expect(source).toContain('buildArticleAuthor');
    expect(source).toContain("'@type': 'Event'");
    expect(source).toContain("'@type': 'JobPosting'");
    expect(source).toContain("'@type': 'Product'");
    expect(source).toContain('shouldIndexPost');
    expect(source).toContain("from './_lib/product-seo-policy.js'");
    expect(policy).toContain("status || '').toLowerCase() !== 'published'");
    expect(source).toContain("const canonicalUrl = `${SITE_ORIGIN}/product.html?id=");
    expect(source).not.toContain("req.headers['x-forwarded-host']");
    expect(source).toContain('META_DESCRIPTION_MAX_LENGTH = 180');
    expect(source).toContain('SEO_TITLE_MAX_LENGTH = 70');
    expect(source).toContain("replaceMetaContent(modified, 'property', 'og:image:alt'");
  });

  test('feeds públicos têm estados vazios específicos e acionáveis', () => {
    const expectations = {
      'eventos.html': 'Nenhum evento corresponde aos filtros',
      'oportunidades.html': 'Nenhuma oportunidade corresponde aos filtros',
      'moradia.html': 'Nenhuma moradia corresponde aos filtros',
      'compra-venda-feed.html': 'Nenhum item corresponde aos filtros',
      'caronas-feed.html': 'Nenhuma carona corresponde aos filtros',
      'achados-perdidos.html': 'Nenhum registro corresponde aos filtros',
    };

    Object.entries(expectations).forEach(([file, copy]) => {
      const html = read(file);
      expect(html).toContain(copy);
      expect(html).toContain('Limpar Filtros');
    });
  });

  test('feeds indexáveis têm guias editoriais próprios no HTML inicial', () => {
    const feedPages = [
      'index.html',
      'eventos.html',
      'oportunidades.html',
      'moradia.html',
      'compra-venda-feed.html',
      'caronas-feed.html',
      'achados-perdidos.html',
    ];

    feedPages.forEach((file) => {
      const html = read(file);
      const guide = (html.match(/<section\s+class="kc-feed-guide"[\s\S]*?<\/section>/) || [])[0] || '';
      const guideText = guide.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      expect(html).toContain('class="kc-feed-guide"');
      expect((html.match(/class="kc-feed-guide__item"/g) || [])).toHaveLength(3);
      expect(guideText.length).toBeGreaterThanOrEqual(650);
    });
  });

  test('auditoria local de SEO esta disponivel', () => {
    const pkg = JSON.parse(read('package.json'));
    const audit = read('scripts/seo-audit.js');

    expect(pkg.scripts['seo:audit']).toBe('node scripts/seo-audit.js');
    expect(audit).toContain('auditRobots');
    expect(audit).toContain('auditSitemap');
    expect(audit).toContain('auditRssFeed');
    expect(audit).toContain('auditGoogleTag');
    expect(audit).toContain('kc-consent\\.js\\?v=[0-9A-Za-z._-]+');
    expect(audit).toContain('auditPublicEncoding');
    expect(audit).toContain('auditPublicImageAlt');
    expect(audit).toContain('auditPublicContentDepth');
    expect(audit).toContain('auditProductSsr');
    expect(audit).toContain('ADSENSE_PUBLISHER_ID');
    expect(audit).toContain('G-P9RKYHPB7Z');
    expect(audit).toContain('GPTBot');
  });

  test('textos publicos de SEO e IA nao contem mojibake', () => {
    const files = [
      'llms.txt',
      'robots.txt',
      'assets/js/boot/kc-seo-structured-data.js',
      ...Object.keys(INDEXABLE_PAGES),
      ...NOINDEX_PAGES,
    ];
    const mojibake = /(?:Ã[\u0080-\u00bf]|Â[\u0080-\u00bf]?|â[\u0080-\u00bf\u20ac]|�)/;

    files.forEach((file) => {
      expect(read(file)).not.toMatch(mojibake);
    });
  });
});

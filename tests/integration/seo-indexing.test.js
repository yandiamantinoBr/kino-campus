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
  'ajuda.html': 'https://www.kinocampus.com.br/ajuda.html',
  'ods.html': 'https://www.kinocampus.com.br/ods.html',
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

describe('SEO e indexacao publica', () => {
  test('robots.txt aponta sitemap e bloqueia rotas privadas', () => {
    const robots = read('robots.txt');

    expect(robots).toContain('Sitemap: https://www.kinocampus.com.br/sitemap.xml');
    expect(robots).toContain('User-agent: OAI-SearchBot');
    expect(robots).toContain('User-agent: ChatGPT-User');
    expect(robots).toContain('User-agent: GPTBot');
    expect(robots).toContain('Disallow: /admin/');
    expect(robots).toContain('Disallow: /search-results.html');
  });

  test('sitemap dinamico lista paginas estaticas e posts published', () => {
    const sitemap = read('api/sitemap.js');
    const vercel = read('vercel.json');

    expect(vercel).toContain('"source": "/sitemap.xml"');
    expect(sitemap).toContain('STATIC_ROUTES');
    expect(sitemap).toContain('/eventos.html');
    expect(sitemap).toContain('/oportunidades.html');
    expect(sitemap).toContain('status=eq.published');
    expect(sitemap).toContain('/product.html?id=');
    expect(sitemap).toContain('application/xml; charset=utf-8');
  });

  test('llms.txt descreve paginas publicas e evita areas privadas', () => {
    const llms = read('llms.txt');

    expect(llms).toContain('KinoCampus');
    expect(llms).toContain('https://www.kinocampus.com.br/sitemap.xml');
    expect(llms).toContain('/admin/');
    expect(llms).toContain('Publicações públicas');
  });

  test('paginas publicas tem canonical, robots index e JSON-LD compartilhado', () => {
    Object.entries(INDEXABLE_PAGES).forEach(([file, canonical]) => {
      const html = read(file);
      expect(html).toContain(`<link rel="canonical" href="${canonical}" />`);
      expect(html).toContain('<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1" />');
      expect(html).toContain('<meta property="og:locale" content="pt_BR" />');
      expect(html).toContain('assets/js/boot/kc-seo-structured-data.js?v=8.6.1');
    });
  });

  test('paginas operacionais ficam fora do indice publico', () => {
    NOINDEX_PAGES.forEach((file) => {
      const html = read(file);
      expect(html).toContain('<meta name="robots" content="noindex');
      expect(html).toContain('<link rel="canonical" href="https://www.kinocampus.com.br/');
    });
  });

  test('dados estruturados compartilhados incluem WebSite SearchAction e BreadcrumbList', () => {
    const source = read('assets/js/boot/kc-seo-structured-data.js');

    expect(source).toContain("'@type': 'SearchAction'");
    expect(source).toContain('search-results.html?q={search_term_string}');
    expect(source).toContain("'@type': 'BreadcrumbList'");
    expect(source).toContain("'@type': 'Organization'");
  });

  test('SSR de product.html injeta canonical, robots indexavel e JSON-LD do post', () => {
    const source = read('api/og-product.js');

    expect(source).toContain('replaceOrInsertCanonical');
    expect(source).toContain('replaceOrInsertRobots');
    expect(source).toContain('replaceOrInsertProductJsonLd');
    expect(source).toContain("index,follow,max-image-preview:large,max-snippet:-1");
    expect(source).toContain("'@type': 'CreativeWork'");
  });
});

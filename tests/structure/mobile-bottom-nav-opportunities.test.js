const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PAGES_WITH_STATIC_MOBILE_NAV = [
  '_product.html',
  'achados-perdidos.html',
  'caronas-feed.html',
  'compra-venda-feed.html',
  'create-post.html',
  'eventos.html',
  'index.html',
  'moradia.html',
  'my-posts.html',
  'ods.html',
  'oportunidades.html',
  'search-results.html',
];

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function mobileNav(html) {
  const match = html.match(/<nav[^>]+class="[^"]*\bkc-mobile-nav\b[^"]*"[\s\S]*?<\/nav>/);
  if (!match) throw new Error('kc-mobile-nav not found');
  return match[0];
}

describe('mobile bottom nav', () => {
  test.each(PAGES_WITH_STATIC_MOBILE_NAV)('%s usa Oportunidades como item fixo', (page) => {
    const nav = mobileNav(read(page));

    expect(nav).toContain('href="oportunidades.html"');
    expect(nav).toContain('fas fa-briefcase');
    expect(nav).toContain('Oportunidades');
    expect(nav).not.toContain('href="compra-venda-feed.html"');
    expect(nav).not.toContain('Compra/Venda');
  });

  test('o estado ativo distingue Oportunidades de Compra e Venda', () => {
    const oportunidadesNav = mobileNav(read('oportunidades.html'));
    const compraVendaNav = mobileNav(read('compra-venda-feed.html'));

    expect(oportunidadesNav).toMatch(/<a\s+class="active"\s+href="oportunidades\.html"|<a\s+href="oportunidades\.html"\s+class="active"/);
    expect(compraVendaNav).toContain('kc-menu-toggle active');
    expect(compraVendaNav).not.toMatch(/<a\s+class="active"\s+href="oportunidades\.html"|<a\s+href="oportunidades\.html"\s+class="active"/);
  });

  test('kc-core e kc-public-shell usam o mesmo mapeamento ativo', () => {
    const core = read('assets/js/core/kc-core.js');
    const shell = read('assets/js/core/kc-public-shell.js');

    expect(core).toContain("if (page === 'oportunidades.html') return 'opportunities';");
    expect(core).toContain("'compra-venda-feed.html'");
    expect(shell).toContain("if (page === 'oportunidades.html') return 'opportunities';");
    expect(shell).toContain("'compra-venda-feed.html'");
    expect(shell).toContain('isOpportunities');
  });
});

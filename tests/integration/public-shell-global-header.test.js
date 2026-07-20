const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

describe('header global em paginas de conta e suporte', () => {
  const pages = ['profile.html', 'ajuda.html', 'mensagens.html', 'settings.html'];

  test.each(pages)('%s carrega navegacao principal e busca global', (page) => {
    const html = read(page);

    expect(html).toContain('class="kc-nav-links"');
    expect(html).toContain('href="eventos.html"');
    expect(html).toContain('href="oportunidades.html"');
    expect(html).toContain('id="kcSearchBar"');
    expect(html).toContain('id="searchInput"');
    expect(html).toContain('id="kcSearchMobileBtn"');
    expect(html).toContain('assets/js/core/kc-core.js?v=8.6.3');
    expect(html).toContain('assets/js/features/kc-nav-links-personalized.js?v=8.6.3');
    expect(html).toContain('assets/js/shared/kc-search.shared.js?v=8.6.2');
    expect(html).toContain('assets/js/features/kc-search.js?v=8.6.8');
    expect(html).toContain('assets/js/features/kc-search-modal.js?v=8.6.2');
  });
});

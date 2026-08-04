const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const ASSET_VERSION = '8.6.17';
const PAGES = {
  'achados-perdidos.html': 'achados-perdidos',
  'eventos.html': 'eventos',
  'moradia.html': 'moradia',
  'oportunidades.html': 'oportunidades',
  'compra-venda-feed.html': 'compra-venda',
  'caronas-feed.html': 'caronas',
};

describe('V76.23 - contexto dos módulos', () => {
  test.each(Object.entries(PAGES))('%s usa o trigger e os assets compartilhados', (file, moduleKey) => {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');

    expect(html).toContain(`assets/css/kc-sidebar-context.css?v=${ASSET_VERSION}`);
    expect(html).toContain(`assets/js/features/kc-sidebar-context.js?v=${ASSET_VERSION}`);
    expect(html).toContain('class="kc-module-heading"');
    expect(html).toContain(`data-kc-context-open="${moduleKey}"`);
    expect(html).toMatch(new RegExp(`data-kc-context-open="${moduleKey}"[^>]+aria-haspopup="dialog"`));
    expect(html).toContain('<i class="fas fa-circle-info" aria-hidden="true"></i>');
  });

  test.each(Object.entries(PAGES))('%s posiciona o contexto abaixo do ranking', (file, moduleKey) => {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const rankingPosition = html.indexOf('data-kc-ranking-sidebar');
    const contextPosition = html.indexOf(`data-kc-context-section="${moduleKey}"`);

    expect(rankingPosition).toBeGreaterThan(-1);
    expect(contextPosition).toBeGreaterThan(rankingPosition);
  });
});

describe('V76.27 - home reusa kc-module-heading', () => {
  test('index.html usa o mesmo contrato visual dos módulos', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

    expect(html).toContain(`assets/css/kc-sidebar-context.css?v=${ASSET_VERSION}`);
    expect(html).toContain(`assets/js/features/kc-sidebar-context.js?v=${ASSET_VERSION}`);
    expect(html).toContain('kc-module-heading kc-module-heading--home-context');
    expect(html).toContain('data-kc-context-open="home"');
    expect(html).toContain('data-kc-context-section="home"');
    expect(html).toContain('Sobre o KinoCampus');
    expect(html).not.toContain('kc-home-context-heading');
    expect(html).not.toContain('kc-context-info-btn--context-arrow');
  });
});

const fs = require('fs');
const path = require('path');

const modulePages = [
  'achados-perdidos.html',
  'caronas-feed.html',
  'compra-venda-feed.html',
  'eventos.html',
  'moradia.html',
  'oportunidades.html',
];

describe('module ranking markup', () => {
  test.each(modulePages)('%s carrega kc-ranking.js via script externo deferido', (file) => {
    const html = fs.readFileSync(path.resolve(__dirname, '..', '..', file), 'utf8');

    expect(html).toContain('data-kc-ranking-sidebar');
    expect(html).toContain('<script defer src="assets/js/features/kc-ranking.js?v=8.6.1"></script>');
    expect(html).not.toContain("KCLazyLoader.load('assets/js/features/kc-ranking.js')");
    expect(html).not.toContain("<script>document.addEventListener('DOMContentLoaded'");
  });
});

describe('ranking modal styles', () => {
  test('mantem o botao primario do modal visivel no tema claro', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '..', '..', 'assets', 'css', 'styles.css'), 'utf8');

    expect(css).toContain('.kc-ranking-modal__footer .kc-btn-primary');
    expect(css).toContain('background: linear-gradient(135deg, var(--kc-primary-brand) 0%, #ff8a2a 100%);');
    expect(css).toContain('color: #fff;');
    expect(css).toContain(':root[data-theme="light"] .kc-ranking-modal__footer .kc-btn-primary');
    expect(css).toContain('.kc-ranking-modal__footer .kc-btn-primary:focus-visible');
  });
});

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, '404.html'), 'utf8');

describe('V76.23 - página 404', () => {
  test('mantém contrato SEO de página de erro', () => {
    expect(HTML).toContain('<meta name="robots" content="noindex, follow, noarchive" />');
    expect(HTML).toContain('<link rel="canonical" href="https://www.kinocampus.com.br/" />');
    expect((HTML.match(/<h1\b/g) || [])).toHaveLength(1);
  });

  test('usa layout isolado e assets dedicados', () => {
    expect(HTML).toContain('assets/css/kc-error-page.css?v=8.6.1');
    expect(HTML).toContain('assets/js/features/kc-error-page.js?v=8.6.1');
    expect(HTML).toContain('<main class="kc-error-page" id="kc-main">');
    expect(HTML).not.toContain('kc-main-content kc-error-page');
    expect(HTML).not.toContain('<style>');
  });

  test('evita o rodapé duplicado e mantém seis destinos úteis', () => {
    expect(HTML).not.toContain('<footer class="kc-footer"');
    expect(HTML).toContain('assets/js/core/kc-consent.js?v=8.6.5');
    expect((HTML.match(/class="kc-error-module"/g) || [])).toHaveLength(6);
    expect(HTML).toContain('data-kc-error-back');
  });
});

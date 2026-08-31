'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const STYLES = fs.readFileSync(path.join(ROOT, 'assets/css/styles.css'), 'utf8');
const PRODUCT_CSS = fs.readFileSync(path.join(ROOT, 'assets/css/product.css'), 'utf8');
const PRODUCT_HTML = fs.readFileSync(path.join(ROOT, '_product.html'), 'utf8');
const PRODUCT_LOAD = fs.readFileSync(path.join(ROOT, 'assets/js/controllers/public/product.load.js'), 'utf8');
const FONT_ROOT = path.join(ROOT, 'assets/vendor/fontawesome');
const CDN_REFERENCE = 'cdnjs.cloudflare.com/ajax/libs/font-awesome';

function htmlFiles() {
  const rootFiles = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => path.join(ROOT, entry.name));
  const adminFiles = fs.readdirSync(path.join(ROOT, 'admin'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => path.join(ROOT, 'admin', entry.name));
  return rootFiles.concat(adminFiles);
}

function cssBlock(source, selector, startAt = 0) {
  const start = source.indexOf(selector, startAt);
  if (start < 0) return '';
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  return open >= 0 && close >= 0 ? source.slice(start, close + 1) : '';
}

describe('resiliência visual dos ícones', () => {
  test('Font Awesome 6.4.0 está autocontido com licença e todas as fontes referenciadas', () => {
    const metadata = JSON.parse(fs.readFileSync(path.join(FONT_ROOT, 'package.json'), 'utf8'));
    const css = fs.readFileSync(path.join(FONT_ROOT, 'css/all.min.css'), 'utf8');
    const fonts = [
      'fa-brands-400.ttf',
      'fa-brands-400.woff2',
      'fa-regular-400.ttf',
      'fa-regular-400.woff2',
      'fa-solid-900.ttf',
      'fa-solid-900.woff2',
      'fa-v4compatibility.ttf',
      'fa-v4compatibility.woff2',
    ];

    expect(metadata.name).toBe('@fortawesome/fontawesome-free');
    expect(metadata.version).toBe('6.4.0');
    expect(fs.readFileSync(path.join(FONT_ROOT, 'LICENSE.txt'), 'utf8')).toContain('Font Awesome Free License');
    fonts.forEach((font) => {
      expect(fs.existsSync(path.join(FONT_ROOT, 'webfonts', font))).toBe(true);
      expect(css).toContain('../webfonts/' + font);
    });
  });

  test('páginas com ícones usam o ativo local versionado e não o CDN externo', () => {
    htmlFiles().forEach((file) => {
      const html = fs.readFileSync(file, 'utf8');
      expect(html).not.toContain(CDN_REFERENCE);
      if (!/class=["'][^"']*\bfa(?:s|r|b)\b/u.test(html)) return;
      const relative = path.relative(ROOT, file).replace(/\\/g, '/');
      const expected = relative.startsWith('admin/')
        ? '../assets/vendor/fontawesome/css/all.min.css?v=6.4.0'
        : 'assets/vendor/fontawesome/css/all.min.css?v=6.4.0';
      expect(html).toContain(expected);
    });
  });
});

describe('consentimento móvel', () => {
  test('mantém as três decisões visíveis em duas linhas sem fundir o rodapé do modal', () => {
    const mobileStart = STYLES.indexOf('@media (max-width: 760px)');
    const mobileEnd = STYLES.indexOf('.kc-auth-note', mobileStart);
    const mobile = STYLES.slice(mobileStart, mobileEnd);

    expect(mobileStart).toBeGreaterThan(-1);
    expect(mobile).toContain('max-height: min(calc(100vh - 32px), 480px);');
    expect(mobile).toContain(
      'max-height: min(calc(100dvh - 32px - env(safe-area-inset-bottom, 0px)), 480px);',
    );
    expect(mobile).toContain('overscroll-behavior: contain;');
    expect(STYLES).toContain('[data-theme="light"] .kc-consent-banner__links a');
    expect(STYLES).toContain('text-underline-offset: 0.18em;');
    expect(cssBlock(STYLES, '.kc-consent-btn')).toContain('min-height: 44px;');
    expect(cssBlock(mobile, '.kc-consent-banner__actions')).toContain(
      'grid-template-columns: repeat(2, minmax(0, 1fr));',
    );
    expect(cssBlock(mobile, '.kc-consent-banner__actions .kc-consent-btn--primary')).toContain(
      'grid-column: 1 / -1;',
    );
    expect(cssBlock(mobile, '.kc-consent-modal__footer')).toContain('grid-template-columns: 1fr;');
    expect(mobile).not.toContain('.kc-consent-banner__actions,\n  .kc-consent-modal__footer');
  });
});

describe('miniaturas do detalhe', () => {
  test('preserva a arte completa no desktop e no mobile', () => {
    const base = cssBlock(PRODUCT_CSS, '.kc-thumbnail');
    const mobileStart = PRODUCT_CSS.lastIndexOf('@media (max-width: 640px)');
    const mobile = PRODUCT_CSS.slice(mobileStart);
    const mobileThumb = cssBlock(mobile, '.kc-thumbnail');

    expect(base).toContain('aspect-ratio: 4 / 3;');
    expect(base).toContain('object-fit: contain;');
    expect(mobileThumb).toContain('width: 100%;');
    expect(mobileThumb).toContain('height: auto;');
    expect(PRODUCT_HTML).toContain('assets/css/product.css?v=8.6.5');
  });
});

describe('breadcrumb do detalhe', () => {
  test('agrupa separador e destino para evitar chevron orfao no mobile', () => {
    expect(PRODUCT_HTML).toContain('kc-breadcrumb-segment kc-breadcrumb-segment--current');
    expect(PRODUCT_HTML).toContain('aria-current="page"');
    expect(PRODUCT_CSS).toContain('.kc-breadcrumb-segment {');
    expect(PRODUCT_CSS).toContain('.kc-breadcrumb-segment--current > [aria-current="page"]');
  });
});

describe('cabeçalho estreito e comentários', () => {
  test('oculta o wordmark antes da colisão e mantém o nome opcional legível', () => {
    const shortcut = fs.readFileSync(path.join(ROOT, 'assets/css/kc-chat-shortcut.css'), 'utf8');
    expect(cssBlock(shortcut, '.kc-header:not(.kc-header--admin) .kc-logo .kc-logo-text')).toContain('visibility: hidden;');
    expect(cssBlock(shortcut, '.kc-header:not(.kc-header--admin) .kc-logo .kc-logo-text')).toContain('display: flex !important;');
    expect(cssBlock(shortcut, '.kc-header:not(.kc-header--admin) .kc-logo--wordmark-visible .kc-logo-text')).toContain('visibility: visible;');
    expect(shortcut).not.toContain('@media (max-width: 480px)');
    expect(fs.readFileSync(path.join(ROOT, 'assets/js/core/kc-core-widgets.js'), 'utf8')).toContain('required <= available');
    expect(fs.readFileSync(path.join(ROOT, 'assets/js/core/kc-core.js'), 'utf8')).toContain('window.KCCore.initHeaderWordmarkFit()');
    expect(PRODUCT_LOAD).toContain("setAttribute('placeholder', 'Seu nome (opcional)')");
    expect(PRODUCT_LOAD).not.toContain('Seu nome (opcional no modo local/dev)');
    expect(PRODUCT_HTML).toContain('product.load.js?v=8.6.14');
  });
});

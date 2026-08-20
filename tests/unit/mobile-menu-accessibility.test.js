'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const CORE = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'core', 'kc-core.js'), 'utf8');
const PAGES_WITH_REPAIRED_CLOSE_BUTTON = [
  'achados-perdidos.html',
  'caronas-feed.html',
  'compra-venda-feed.html',
  'eventos.html',
  'moradia.html',
  'oportunidades.html',
];

function bootCore() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <button data-kc-mobile-menu="toggle" aria-expanded="false">Abrir menu</button>
    <div id="mobileMenuDrawer" class="kc-mobile-menu" aria-hidden="true">
      <button data-kc-mobile-menu="close">Fechar</button>
      <a href="#conta">Conta</a>
    </div>
    <div id="mobileMenuOverlay" aria-hidden="true"></div>
  </body></html>`, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://www.kinocampus.com.br/oportunidades.html',
  });
  dom.window.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };
  dom.window.kcInitVotesRealtime = () => {};
  dom.window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
  dom.window.eval(CORE);
  return dom.window;
}

describe('menu móvel — acessibilidade do drawer fechado', () => {
  test('remove o drawer fechado da ordem de foco e devolve o foco ao alternador', () => {
    const window = bootCore();
    const menu = window.document.getElementById('mobileMenuDrawer');
    const toggle = window.document.querySelector('[data-kc-mobile-menu="toggle"]');
    const close = menu.querySelector('[data-kc-mobile-menu="close"]');

    window.closeMobileMenu();
    expect(menu.getAttribute('aria-hidden')).toBe('true');
    expect(menu.hasAttribute('inert')).toBe(true);

    window.openMobileMenu();
    expect(menu.getAttribute('aria-hidden')).toBe('false');
    expect(menu.hasAttribute('inert')).toBe(false);
    expect(window.document.activeElement).toBe(close);

    window.closeMobileMenu();
    expect(menu.hasAttribute('inert')).toBe(true);
    expect(window.document.activeElement).toBe(toggle);
    window.close();
  });

  test.each(PAGES_WITH_REPAIRED_CLOSE_BUTTON)('%s nomeia o botão de fechar menu', (page) => {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    expect(html).toMatch(/<button[^>]+class="kc-close-menu"[^>]+aria-label="Fechar menu"[^>]*>/);
  });
});

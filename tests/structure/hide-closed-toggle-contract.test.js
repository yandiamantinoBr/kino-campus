const fs = require('fs');
const path = require('path');
const { TextDecoder, TextEncoder } = require('util');

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const FEED_PAGES = [
  'index.html',
  'eventos.html',
  'oportunidades.html',
  'moradia.html',
  'compra-venda-feed.html',
  'caronas-feed.html',
  'achados-perdidos.html',
];
const PAGES = [...FEED_PAGES, 'search-results.html'];
const SEARCH_SURFACE_PAGES = [
  ...PAGES,
  '_product.html',
  'ajuda.html',
  'create-post.html',
  'mensagens.html',
  'my-posts.html',
  'ods.html',
  'profile.html',
  'settings.html',
];

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function documentFor(relativePath) {
  return new JSDOM(read(relativePath)).window.document;
}

describe('contrato visual e acessivel de Ocultar encerrados', () => {
  test.each(PAGES)('%s possui um switch nativo, descrito e fora de tablists', (page) => {
    const document = documentFor(page);
    const controls = document.querySelectorAll('[data-kc-hide-closed-toggle]');
    const inputs = document.querySelectorAll('[data-kc-hide-closed-input]');
    const statuses = document.querySelectorAll('[data-kc-hide-closed-status]');

    expect(controls).toHaveLength(1);
    expect(inputs).toHaveLength(1);
    expect(statuses).toHaveLength(1);

    const control = controls[0];
    const input = inputs[0];
    const status = statuses[0];
    const label = control.querySelector(`label[for="${input.id}"]`);

    expect(input.tagName).toBe('INPUT');
    expect(input.type).toBe('checkbox');
    expect(input.getAttribute('role')).toBe('switch');
    expect(input.closest('[role="tablist"]')).toBeNull();
    expect(label).not.toBeNull();
    expect(label.classList.contains('kc-switch')).toBe(true);
    expect(label.textContent).toContain('Ocultar encerrados');
    expect(label.querySelector('.kc-hide-closed__label')).not.toBeNull();
    expect(label.querySelector('.kc-switch__track')).not.toBeNull();

    expect(input.getAttribute('aria-describedby')).toBe(status.id);
    expect(status.id).not.toBe('');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-atomic')).toBe('true');
    expect(status.textContent.trim()).toBe('Encerrados visíveis');
  });

  test.each(FEED_PAGES)('%s mantem o switch fora das abas e dentro da faixa de acoes', (page) => {
    const document = documentFor(page);
    const toolbar = document.querySelector('.kc-feed-toolbar');
    const actions = toolbar && toolbar.querySelector(':scope > .kc-feed-toolbar__actions');
    const control = document.querySelector('[data-kc-hide-closed-toggle]');
    const tabs = toolbar && toolbar.querySelector('.kc-feed-tabs');

    expect(toolbar).not.toBeNull();
    expect(tabs).not.toBeNull();
    expect(actions).not.toBeNull();
    expect(actions.parentElement).toBe(toolbar);
    expect(control.parentElement).toBe(actions);
    expect(tabs.contains(control)).toBe(false);
  });

  test.each(PAGES)('%s carrega ciclo de vida e componente antes da API de filtros', (page) => {
    const document = documentFor(page);
    const scripts = Array.from(document.scripts)
      .map((script) => script.getAttribute('src'))
      .filter(Boolean);
    const lifecycle = scripts.findIndex((src) => src.startsWith('assets/js/shared/kc-post-lifecycle.shared.js?'));
    const toggle = scripts.findIndex((src) => src.startsWith('assets/js/features/kc-hide-closed.js?'));
    const filters = scripts.findIndex((src) => src.startsWith('assets/js/api/kc-api.filters.js?'));

    expect(lifecycle).toBeGreaterThanOrEqual(0);
    expect(toggle).toBeGreaterThan(lifecycle);
    expect(filters).toBeGreaterThan(toggle);
  });

  test.each(SEARCH_SURFACE_PAGES)('%s carrega ciclo de vida antes da busca global', (page) => {
    const document = documentFor(page);
    const scripts = Array.from(document.scripts)
      .map((script) => script.getAttribute('src'))
      .filter(Boolean);
    const lifecycle = scripts.findIndex((src) => src.startsWith('assets/js/shared/kc-post-lifecycle.shared.js?'));
    const searchShared = scripts.findIndex((src) => src.startsWith('assets/js/shared/kc-search.shared.js?'));

    expect(lifecycle).toBeGreaterThanOrEqual(0);
    expect(searchShared).toBeGreaterThan(lifecycle);
  });

  test.each(FEED_PAGES.slice(1))('%s oferece revelar encerrados no estado vazio', (page) => {
    const document = documentFor(page);
    const reveal = document.querySelector('#noResults [data-kc-hide-closed-reveal]');

    expect(reveal).not.toBeNull();
    expect(reveal.tagName).toBe('BUTTON');
    expect(reveal.type).toBe('button');
    expect(reveal.hidden).toBe(true);
    expect(reveal.textContent.trim()).toBe('Mostrar encerrados');
  });

  test('a busca usa o mesmo atomo e remove o checkbox inline legado', () => {
    const html = read('search-results.html');
    const document = documentFor('search-results.html');

    expect(document.querySelector('[data-kc-hide-closed-input]').id).toBe('searchResultsHideClosed');
    expect(document.querySelector('#noResults [data-kc-hide-closed-reveal]')).not.toBeNull();
    expect(html).not.toContain('kc-search-results-toggle');
    expect(html).not.toContain('Ocultar encerradas');
    expect(html).not.toContain('var(--primary-orange)');
    expect(html).not.toContain('var(--kc-bg-dark)');
    expect(html).not.toContain('var(--kc-text-dark)');
  });

  test('CSS preserva hit target, foco, estados, sticky e composicao responsiva', () => {
    const css = read('assets/css/styles.css');

    expect(css).toMatch(/\.kc-feed-toolbar\s*\{[^}]*position:\s*sticky;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/s);
    expect(css).toMatch(/\.kc-feed-toolbar\s*>\s*\.kc-scroll-rail--tabs\s*\{[^}]*position:\s*static\s*!important;/s);
    expect(css).toMatch(/\.kc-hide-closed-toggle\s*\{[^}]*min-height:\s*44px;/s);
    expect(css).toMatch(/\.kc-hide-closed-toggle__input:checked\s*\+\s*\.kc-hide-closed-toggle__track\s*\{[^}]*var\(--kc-primary-brand\)/s);
    expect(css).toMatch(/\.kc-hide-closed-toggle__input:focus-visible\s*\+\s*\.kc-hide-closed-toggle__track\s*\{[^}]*outline:/s);
    expect(css).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.kc-feed-toolbar\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.kc-hide-closed-toggle__track[\s\S]*?transition:\s*none;/s);
  });
});

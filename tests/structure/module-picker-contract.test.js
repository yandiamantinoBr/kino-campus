const fs = require('fs');
const path = require('path');
const { TextDecoder, TextEncoder } = require('util');

global.TextDecoder = global.TextDecoder || TextDecoder;
global.TextEncoder = global.TextEncoder || TextEncoder;

const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function canonicalModules() {
  const dom = new JSDOM('', { runScripts: 'outside-only', url: 'http://localhost/' });
  dom.window.eval(read('assets/js/features/create-post/kc-create-post.schema.js'));
  return Object.entries(dom.window._KCCreatePost.schema.modules).map(([key, definition]) => ({
    key,
    label: definition.label,
    emoji: definition.emoji,
    redirect: definition.redirect,
    page: new URL(definition.redirect, 'http://localhost/').pathname.replace(/^\/+/, ''),
  }));
}

const MODULES = canonicalModules();
const FEED_PAGES = ['index.html', ...MODULES.map((module) => module.page)];

function documentFor(relativePath) {
  return new JSDOM(read(relativePath)).window.document;
}

describe('contrato estrutural do seletor responsivo de módulos', () => {
  test('deriva páginas, rótulos e emojis do schema canônico real', () => {
    expect(MODULES.length).toBeGreaterThan(0);
    expect(new Set(MODULES.map((module) => module.key)).size).toBe(MODULES.length);
    expect(new Set(MODULES.map((module) => module.redirect)).size).toBe(MODULES.length);
    MODULES.forEach((module) => {
      expect(module.label.trim()).not.toBe('');
      expect(module.emoji.trim()).not.toBe('');
      expect(module.page).toMatch(/^[a-z0-9/-]+\.html$/);
      expect(fs.existsSync(path.join(ROOT, module.page))).toBe(true);
    });
  });

  test.each(FEED_PAGES)('%s inclui uma faixa de ações sem contaminar o tablist', (page) => {
    const document = documentFor(page);
    const toolbar = document.querySelector('.kc-feed-toolbar');
    const actions = toolbar && toolbar.querySelector(':scope > .kc-feed-toolbar__actions');
    const trigger = actions && actions.querySelector(':scope > [data-kc-module-picker-open]');
    const hideClosed = actions && actions.querySelector(':scope > [data-kc-hide-closed-toggle]');
    const tabs = toolbar && toolbar.querySelector(':scope > .kc-feed-tabs');

    expect(toolbar).not.toBeNull();
    expect(tabs).not.toBeNull();
    expect(actions).not.toBeNull();
    expect(trigger).not.toBeNull();
    expect(hideClosed).not.toBeNull();
    expect(Array.from(toolbar.children)).toEqual([tabs, actions]);
    expect(Array.from(actions.children)).toEqual([trigger, hideClosed]);
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.type).toBe('button');
    expect(trigger.hidden).toBe(true);
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-controls')).toBe('kcModulePickerModal');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.textContent).toContain('Escolher Módulo');
    expect(trigger.closest('[role="tablist"]')).toBeNull();
  });

  test.each(FEED_PAGES)('%s carrega o picker depois do schema canônico', (page) => {
    const document = documentFor(page);
    const sources = Array.from(document.scripts)
      .map((script) => script.getAttribute('src'))
      .filter(Boolean);
    const schema = sources.findIndex((src) => src.startsWith('assets/js/features/create-post/kc-create-post.schema.js?'));
    const picker = sources.findIndex((src) => src.startsWith('assets/js/features/kc-module-picker.js?'));

    expect(schema).toBeGreaterThanOrEqual(0);
    expect(picker).toBeGreaterThan(schema);
    expect(sources.filter((src) => src.startsWith('assets/js/features/kc-module-picker.js?'))).toHaveLength(1);
  });

  test('a busca mantém seu seletor próprio e não duplica o picker de feed', () => {
    const document = documentFor('search-results.html');

    expect(document.querySelector('#searchResultsModuleFilter')).not.toBeNull();
    expect(document.querySelector('[data-kc-module-picker-open]')).toBeNull();
    expect(Array.from(document.scripts).some((script) =>
      String(script.getAttribute('src') || '').includes('kc-module-picker.js'))).toBe(false);
  });

  test('CSS põe rail antes das ações compactas em qualquer viewport', () => {
    const css = read('assets/css/styles.css');

    expect(css).toMatch(/\.kc-feed-toolbar\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s);
    expect(css).toMatch(/\.kc-feed-toolbar\s*>\s*\.kc-scroll-rail--tabs\s*\{[^}]*grid-row:\s*1;/s);
    expect(css).toMatch(/\.kc-feed-toolbar\s*>\s*\.kc-feed-toolbar__actions\s*\{[^}]*grid-row:\s*2;[^}]*justify-content:\s*space-between;/s);
    expect(css).toMatch(/\.kc-module-picker-trigger:not\(\[hidden\]\)\s*\{[^}]*min-height:\s*44px;/s);
    expect(css).toMatch(/\.kc-module-picker-trigger\s*>\s*i:first-child::before\s*\{[^}]*box-shadow:/s);
    expect(css).toMatch(/\.kc-module-picker-trigger__chevron::before\s*\{[^}]*border-width:\s*0\s+2px\s+2px\s+0;/s);
    expect(css).toMatch(/\.kc-feed-toolbar\s+\.kc-hide-closed-toggle__track\s*\{[^}]*width:\s*40px;[^}]*height:\s*22px;/s);
    expect(css).toMatch(/\.kc-sidebar-context-modal\.kc-module-picker-modal\s*\{[^}]*align-items:\s*flex-end;/s);
    expect(css).toMatch(/\.kc-sidebar-context-modal\.kc-module-picker-modal\s*\{[^}]*z-index:\s*10040;/s);
    expect(css).toMatch(/\.kc-module-picker-list\s*\{[^}]*grid-auto-rows:\s*1fr;/s);
  });
});

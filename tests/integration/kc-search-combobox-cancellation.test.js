'use strict';

const fs = require('fs');
const path = require('path');
const { TextDecoder, TextEncoder } = require('util');
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'assets/js/features/kc-search.js'), 'utf8');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await wait(10);
  }
  throw new Error(`condition_not_met_within_${timeoutMs}ms`);
}

function createSearchPage(searchPosts) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div class="kc-search-bar" id="kcSearchBar">
      <input id="searchInput" type="search" aria-label="Pesquisar">
      <button type="button">Buscar</button>
    </div>
  </body></html>`, {
    url: 'https://www.kinocampus.com.br/index.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const { window } = dom;
  Object.defineProperty(window.document, 'readyState', { configurable: true, value: 'complete' });
  window.KC_ENV = { flags: {}, version: '8.6.1' };
  window.KCFF = { isEnabled: () => false };
  window.KCAPI = {
    searchPosts,
    insertSearchQueries: async () => ({ ok: true })
  };
  window.console.error = jest.fn();
  window.eval(SOURCE);
  return { dom, window };
}

function input(window, value) {
  const element = window.document.getElementById('searchInput');
  element.value = value;
  element.dispatchEvent(new window.Event('input', { bubbles: true }));
  return element;
}

describe('V76.42 — combobox e concorrência do kcSearchDropdown', () => {
  test('expõe listbox e navegação por teclado mantendo foco no input', async () => {
    const page = createSearchPage(async () => [
      { id: 'event-1', titulo: 'Evento de extensão', modulo: 'eventos' },
      { id: 'event-2', titulo: 'Semana acadêmica', modulo: 'eventos' }
    ]);
    const { window } = page;
    const searchInput = input(window, 'evento');
    await waitFor(() => window.document.querySelectorAll('#kcSearchDropdown [role="option"]').length === 2);

    const dropdown = window.document.getElementById('kcSearchDropdown');
    const options = dropdown.querySelectorAll('[role="option"]');
    expect(searchInput.getAttribute('role')).toBe('combobox');
    expect(searchInput.getAttribute('aria-autocomplete')).toBe('list');
    expect(searchInput.getAttribute('aria-controls')).toBe('kcSearchDropdownList');
    expect(searchInput.getAttribute('aria-expanded')).toBe('true');
    expect(searchInput.getAttribute('autocomplete')).toBe('off');
    expect(window.document.getElementById('kcSearchDropdownList').getAttribute('role')).toBe('listbox');
    expect(options).toHaveLength(2);

    searchInput.focus();
    searchInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(searchInput.getAttribute('aria-activedescendant')).toBe(options[0].id);
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(window.document.activeElement).toBe(searchInput);

    searchInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
    expect(searchInput.getAttribute('aria-activedescendant')).toBe(options[1].id);
    searchInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(searchInput.getAttribute('aria-expanded')).toBe('false');
    expect(searchInput.hasAttribute('aria-activedescendant')).toBe(false);
    page.dom.window.close();
  });

  test('aborta a consulta anterior e nunca renderiza resposta obsoleta', async () => {
    let aborted = 0;
    let started = 0;
    const page = createSearchPage((params) => new Promise((resolve, reject) => {
      started += 1;
      const slow = params.q === 'evento';
      const timer = setTimeout(() => resolve([{
        id: slow ? 'old' : 'new',
        titulo: slow ? 'Resultado antigo' : 'Resultado novo',
        modulo: 'eventos'
      }]), slow ? 500 : 10);
      if (params.signal) params.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        aborted += 1;
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }));
    const { window } = page;

    input(window, 'evento');
    await waitFor(() => started === 1);
    input(window, 'eventos');
    await waitFor(() => (
      aborted === 1
      && window.document.getElementById('kcSearchDropdown').textContent.includes('Resultado novo')
    ));

    const dropdownText = window.document.getElementById('kcSearchDropdown').textContent;
    const metrics = window.kcSearch.getPerformanceSnapshot();
    expect(aborted).toBe(1);
    expect(dropdownText).toContain('Resultado novo');
    expect(dropdownText).not.toContain('Resultado antigo');
    expect(metrics.dropdown.aborted).toBe(1);
    expect(metrics.dropdown.completed).toBe(1);
    expect(metrics.dropdown.p95Ms).toBeLessThan(200);
    expect(JSON.stringify(metrics)).not.toContain('eventos');
    page.dom.window.close();
  });
});

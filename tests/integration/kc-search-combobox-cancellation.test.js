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

function createResultsPage(searchPosts, url = 'https://www.kinocampus.com.br/search-results.html?q=evento&closed=1') {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div class="kc-search-bar"><input id="searchInput" type="search" value="evento"><button type="button">Buscar</button></div>
    <span id="searchQueryText"></span><span id="resultsCount"></span>
    <select id="searchResultsModuleFilter"><option value="">Todos</option><option value="eventos">Eventos</option></select>
    <input id="searchResultsHideClosed" type="checkbox" checked>
    <select id="searchResultsSort"><option value="relevance">Relevancia</option></select>
    <button id="searchResultsClearFilters" type="button">Limpar</button>
    <span id="searchResultsActiveFilters"></span><span id="searchResultsVisibleSummary"></span>
    <div id="searchResultsList"></div>
    <div id="noResults" hidden><span id="noResultsMessage"></span></div>
  </body></html>`, {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const { window } = dom;
  Object.defineProperty(window.document, 'readyState', { configurable: true, value: 'complete' });
  window.KC_ENV = { flags: {}, version: '8.6.1' };
  window.KCFF = { isEnabled: () => false };
  window.KCPostLifecycle = require('../../assets/js/shared/kc-post-lifecycle.shared.js');
  window.KCUtils = {
    renderPostCard: (post) => `<article class="kc-card">${post.titulo || post.title || ''}</article>`
  };
  let freshnessHandler = null;
  window.KCPostFreshness = {
    subscribe(handler) {
      freshnessHandler = handler;
      return () => { freshnessHandler = null; };
    }
  };
  window.KCAPI = {
    searchPosts,
    insertSearchQueries: async () => ({ ok: true })
  };
  window.console.error = jest.fn();
  window.eval(SOURCE);
  return {
    dom,
    window,
    emitFreshness(change) {
      if (freshnessHandler) freshnessHandler(change);
    }
  };
}

function input(window, value) {
  const element = window.document.getElementById('searchInput');
  element.value = value;
  element.dispatchEvent(new window.Event('input', { bubbles: true }));
  return element;
}

function closeResultsPage(page) {
  page.window.dispatchEvent(new page.window.Event('pagehide'));
  page.dom.window.close();
}

describe('dropdown ativo antes do limite', () => {
  test('envia hideClosed ao backend antes de limitar a oito resultados', async () => {
    const searchPosts = jest.fn(async () => [
      { id: 'active-event', titulo: 'Evento ativo', modulo: 'eventos' }
    ]);
    const page = createSearchPage(searchPosts);

    input(page.window, 'evento');
    await waitFor(() => searchPosts.mock.calls.length === 1);

    expect(searchPosts).toHaveBeenCalledWith(expect.objectContaining({
      q: 'evento',
      limit: 8,
      hideClosed: true,
      signal: expect.any(Object),
    }));
    page.dom.window.close();
  });
});

describe('resultados ativos no limite temporal', () => {
  test('mantém o estado de carregamento até a busca assíncrona terminar', async () => {
    let resolveSearch;
    const searchPosts = jest.fn(() => new Promise((resolve) => { resolveSearch = resolve; }));
    const page = createResultsPage(searchPosts);
    const { window } = page;

    await waitFor(() => searchPosts.mock.calls.length === 1);
    const list = window.document.getElementById('searchResultsList');
    const noResults = window.document.getElementById('noResults');
    expect(list.getAttribute('aria-busy')).toBe('true');
    expect(list.querySelector('[data-kc-search-loading]')).not.toBeNull();
    expect(noResults.style.display).toBe('none');
    expect(window.document.getElementById('resultsCount').textContent).toBe('—');

    resolveSearch([{ id: 'async-result', titulo: 'Resultado assíncrono', modulo: 'eventos' }]);
    await waitFor(() => list.textContent.includes('Resultado assíncrono'));
    expect(list.hasAttribute('aria-busy')).toBe(false);
    expect(list.querySelector('[data-kc-search-loading]')).toBeNull();
    closeResultsPage(page);
  });

  test('preserva o alias closed=true ao inicializar os controles da busca', async () => {
    const searchPosts = jest.fn(async () => []);
    const page = createResultsPage(
      searchPosts,
      'https://www.kinocampus.com.br/search-results.html?q=evento&closed=true'
    );

    await waitFor(() => searchPosts.mock.calls.length >= 1 && page.window.document.getElementById('searchResultsVisibleSummary').textContent.length > 0);
    expect(page.window.document.getElementById('searchResultsHideClosed').checked).toBe(true);
    expect(searchPosts.mock.calls[0][0]).toEqual(expect.objectContaining({ hideClosed: true }));
    closeResultsPage(page);
  });

  test('rerenderiza e remove um resultado quando ele encerra com a pagina aberta', async () => {
    const eventEndsAt = new Date(Date.now() + 80).toISOString();
    const searchPosts = jest.fn()
      .mockResolvedValueOnce([{
        id: 'ending-event',
        module: 'eventos',
        modulo: 'eventos',
        title: 'Evento terminando',
        titulo: 'Evento terminando',
        status: 'published',
        metadata: { eventEndsAt }
      }])
      .mockResolvedValue([]);
    const page = createResultsPage(searchPosts);

    const list = page.window.document.getElementById('searchResultsList');
    await waitFor(() => list.textContent.includes('Evento terminando'));
    await waitFor(() => (
      searchPosts.mock.calls.length >= 2 &&
      !list.textContent.includes('Evento terminando') &&
      !list.querySelector('[data-kc-search-loading]')
    ));

    expect(searchPosts.mock.calls[0][0]).toEqual(expect.objectContaining({ hideClosed: true }));
    expect(searchPosts.mock.calls[1][0]).toEqual(expect.objectContaining({ hideClosed: true }));
    closeResultsPage(page);
  });

  test('revalida um resultado vencido ao restaurar a pagina pelo bfcache', async () => {
    const eventEndsAt = new Date(Date.now() + 80).toISOString();
    const searchPosts = jest.fn()
      .mockResolvedValueOnce([{
        id: 'cached-ending-event',
        module: 'eventos',
        modulo: 'eventos',
        titulo: 'Evento no cache',
        status: 'published',
        metadata: { eventEndsAt }
      }])
      .mockResolvedValue([]);
    const page = createResultsPage(searchPosts);
    const { window } = page;

    await waitFor(() => window.document.getElementById('searchResultsList').textContent.includes('Evento no cache'));
    const pageHide = new window.Event('pagehide');
    Object.defineProperty(pageHide, 'persisted', { value: true });
    window.dispatchEvent(pageHide);
    await wait(130);
    expect(searchPosts).toHaveBeenCalledTimes(1);

    const pageShow = new window.Event('pageshow');
    Object.defineProperty(pageShow, 'persisted', { value: true });
    window.dispatchEvent(pageShow);
    await waitFor(() => searchPosts.mock.calls.length >= 2 && !window.document.getElementById('searchResultsList').textContent.includes('Evento no cache'));

    closeResultsPage(page);
  });

  test('revalida fechamento explicito sem prazo e ignora ruido de metricas', async () => {
    const searchPosts = jest.fn()
      .mockResolvedValueOnce([{
        id: 'explicitly-closing-event',
        module: 'eventos',
        modulo: 'eventos',
        titulo: 'Evento sem prazo',
        status: 'published'
      }])
      .mockResolvedValue([]);
    const page = createResultsPage(searchPosts);

    const list = page.window.document.getElementById('searchResultsList');
    await waitFor(() => list.textContent.includes('Evento sem prazo'));
    page.emitFreshness({ type: 'metrics_updated', source: 'realtime' });
    await wait(80);
    expect(searchPosts).toHaveBeenCalledTimes(1);

    page.emitFreshness({ type: 'status_changed', status: 'closed', source: 'realtime' });
    await waitFor(() => (
      searchPosts.mock.calls.length >= 2 &&
      !list.textContent.includes('Evento sem prazo') &&
      !list.querySelector('[data-kc-search-loading]')
    ));

    closeResultsPage(page);
  });
});

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

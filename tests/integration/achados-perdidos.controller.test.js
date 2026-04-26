/*
  achados-perdidos.controller.js — Static contract tests (v11.26.2)
  Verifica cache key, KCFeedFilters, date presets, dataset attrs
  e padrão de session store via helper getSessionStore().
*/

const fs = require('fs');
const path = require('path');

const CONTROLLER_PATH = path.resolve(__dirname, '..', '..', 'assets', 'js', 'controllers', 'achados-perdidos.controller.js');

function buildMinimalKCAPI() {
  return {
    normalizePost: jest.fn((raw) => raw),
    ENV: { driver: 'local' },
  };
}

function buildMinimalSessionStore() {
  const store = {};
  return {
    get: jest.fn((key) => store[key] || null),
    set: jest.fn((key, value) => { store[key] = value; }),
    del: jest.fn((key) => { delete store[key]; }),
  };
}

function buildMinimalFeedFilters() {
  return {
    getAllowedDatePresets: jest.fn(() => ['today', 'last7d', 'last30d']),
    normalizeDatePreset: jest.fn((module, value) => value),
    matchesDatePreset: jest.fn(() => true),
    getSearchParams: jest.fn(() => new URLSearchParams()),
    readListParam: jest.fn(() => []),
    readTextParam: jest.fn(() => ''),
    updateSearchParams: jest.fn(),
    writeListParam: jest.fn(),
    writeTextParam: jest.fn(),
  };
}

function loadController() {
  const code = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  // eslint-disable-next-line no-eval
  (0, eval)(code);
}

describe('achados-perdidos.controller — source contracts', () => {
  const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');

  test('define SECTION_CACHE_KEY como achados-perdidos:index', () => {
    expect(source).toContain("'achados-perdidos:index'");
  });

  test('define SECTION_CACHE_MAX_AGE_MS (10 min em ms)', () => {
    expect(source).toContain('SECTION_CACHE_MAX_AGE_MS');
    expect(source).toContain('1000 * 60 * 10');
  });

  test('usa KCFeedFilters.getAllowedDatePresets com achados-perdidos', () => {
    expect(source).toContain("getAllowedDatePresets('achados-perdidos')");
  });

  test('date preset today presente', () => {
    expect(source).toContain("'today'");
  });

  test('date preset last7d presente', () => {
    expect(source).toContain("'last7d'");
  });

  test('date preset last30d presente', () => {
    expect(source).toContain("'last30d'");
  });

  test('usa dataset attr data-kc-achados-date-preset', () => {
    expect(source).toContain('data-kc-achados-date-preset');
  });

  test('usa dataset attr data-kc-achados-filter-kind', () => {
    expect(source).toContain('data-kc-achados-filter-kind');
  });

  test('usa dataset attr data-kc-achados-section', () => {
    expect(source).toContain('data-kc-achados-section');
  });

  test('referencia modal kcLostFoundSectionOverlay', () => {
    expect(source).toContain('kcLostFoundSectionOverlay');
  });

  test('usa padrão getSessionStore() para acessar store', () => {
    expect(source).toContain('getSessionStore');
    expect(source).toContain('KCSessionStore');
  });

  test('chama store.get no ciclo de cache', () => {
    expect(source).toContain('store.get(');
  });

  test('chama store.set no ciclo de cache', () => {
    expect(source).toContain('store.set(');
  });

  test('usa KCAPI.normalizePost', () => {
    expect(source).toContain('normalizePost');
  });

  test('usa KCOverlayLock.lock para modal de seção', () => {
    expect(source).toContain("KCOverlayLock.lock('achados-section-modal')");
  });

  test('status filter: perdido e encontrado presentes', () => {
    expect(source).toContain("'perdido'");
    expect(source).toContain("'encontrado'");
  });

  test('type filter: documento, eletronico, outro presentes', () => {
    expect(source).toContain("'documento'");
    expect(source).toContain("'eletronico'");
    expect(source).toContain("'outro'");
  });
});

describe('achados-perdidos.controller — runtime: carregamento sem lançar', () => {
  beforeEach(() => {
    delete window.KCAPI;
    delete window.KCSessionStore;
    delete window.KCFeedFilters;
    delete window.kcFilters;
    delete window.KCControllers;
    delete window.KCOverlayLock;
    delete window.KCRealtime;
    delete window.KCPullToRefresh;
    document.body.innerHTML = '';

    window.KCAPI = buildMinimalKCAPI();
    window.KCSessionStore = buildMinimalSessionStore();
    window.KCFeedFilters = buildMinimalFeedFilters();
    window.KCOverlayLock = { lock: jest.fn(), unlock: jest.fn() };
  });

  test('não lança ao carregar com dependências mínimas', () => {
    expect(() => loadController()).not.toThrow();
  });

  test('não lança quando KCFeedFilters não está presente', () => {
    delete window.KCFeedFilters;
    expect(() => loadController()).not.toThrow();
  });
});

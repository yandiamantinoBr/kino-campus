/*
  moradia.controller.js — Static contract tests (v11.26.2)
  Verifica cache key, KCFeedFilters, date presets, feature options,
  regions e dataset attrs.
*/

const fs = require('fs');
const path = require('path');

const CONTROLLER_PATH = path.resolve(__dirname, '..', '..', 'assets', 'js', 'controllers', 'moradia.controller.js');

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
    readNumberParam: jest.fn(() => null),
    updateSearchParams: jest.fn(),
    writeListParam: jest.fn(),
    writeTextParam: jest.fn(),
    writePresetParam: jest.fn(),
    writeNumberParam: jest.fn(),
  };
}

function loadController() {
  const code = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  // eslint-disable-next-line no-eval
  (0, eval)(code);
}

describe('moradia.controller — source contracts', () => {
  const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');

  test('define SECTION_CACHE_KEY como moradia:index', () => {
    expect(source).toContain("'moradia:index'");
  });

  test('define SECTION_CACHE_MAX_AGE_MS (10 min em ms)', () => {
    expect(source).toContain('SECTION_CACHE_MAX_AGE_MS');
    expect(source).toContain('1000 * 60 * 10');
  });

  test('usa KCFeedFilters.getAllowedDatePresets com moradia', () => {
    expect(source).toContain("getAllowedDatePresets('moradia')");
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

  test('feature: aceita-pets presente', () => {
    expect(source).toContain("'aceita-pets'");
  });

  test('feature: lgbtqiapn presente', () => {
    expect(source).toContain("'lgbtqiapn'");
  });

  test('feature: apenas-mulheres presente', () => {
    expect(source).toContain("'apenas-mulheres'");
  });

  test('feature: apenas-homens presente', () => {
    expect(source).toContain("'apenas-homens'");
  });

  test('feature: mobiliado presente', () => {
    expect(source).toContain("'mobiliado'");
  });

  test('feature: proximo-ao-campus presente', () => {
    expect(source).toContain("'proximo-ao-campus'");
  });

  test('usa dataset attr data-kc-housing-date-preset', () => {
    expect(source).toContain('data-kc-housing-date-preset');
  });

  test('usa dataset attr data-kc-housing-region-option', () => {
    expect(source).toContain('data-kc-housing-region-option');
  });

  test('usa dataset attr data-kc-housing-feature-list', () => {
    expect(source).toContain('data-kc-housing-feature-list');
  });

  test('referencia modal kcHousingSectionOverlay', () => {
    expect(source).toContain('kcHousingSectionOverlay');
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

  test('região campus-samambaia presente', () => {
    expect(source).toContain("'campus-samambaia'");
  });

  test('região setor-universitario presente', () => {
    expect(source).toContain("'setor-universitario'");
  });
});

describe('moradia.controller — runtime: carregamento sem lançar', () => {
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

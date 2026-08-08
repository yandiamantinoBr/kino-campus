/*
  caronas-feed.controller.js — Static contract tests (v11.26.2)
  Verifica KCFeedFilters, date presets, KCSupabase.getClient(),
  feature options e dataset attrs.
*/

const fs = require('fs');
const path = require('path');

const CONTROLLER_PATH = path.resolve(__dirname, '..', '..', 'assets', 'js', 'controllers', 'public', 'caronas-feed.controller.js');

function buildMinimalFeedFilters() {
  return {
    getAllowedDatePresets: jest.fn(() => ['today', 'last3d', 'last7d']),
    normalizeDatePreset: jest.fn((module, value) => value),
    matchesDatePreset: jest.fn(() => true),
    getSearchParams: jest.fn(() => new URLSearchParams()),
    readListParam: jest.fn(() => []),
    readTextParam: jest.fn(() => ''),
    readBooleanParam: jest.fn(() => false),
    readNumberParam: jest.fn(() => null),
    updateSearchParams: jest.fn(),
    writeListParam: jest.fn(),
    writeTextParam: jest.fn(),
    writeBooleanParam: jest.fn(),
    writePresetParam: jest.fn(),
    writeNumberParam: jest.fn(),
  };
}

function buildMinimalSupabase() {
  const mockFrom = jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    data: [],
    error: null,
  }));
  return {
    getClient: jest.fn(() => ({ from: mockFrom })),
  };
}

function loadController() {
  const code = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  // eslint-disable-next-line no-eval
  (0, eval)(code);
}

describe('caronas-feed.controller — source contracts', () => {
  const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');

  test('usa KCFeedFilters.getAllowedDatePresets com caronas', () => {
    expect(source).toContain("getAllowedDatePresets('caronas')");
  });

  test('date preset today presente', () => {
    expect(source).toContain("'today'");
  });

  test('date preset last3d presente', () => {
    expect(source).toContain("'last3d'");
  });

  test('date preset last7d presente', () => {
    expect(source).toContain("'last7d'");
  });

  test('usa KCSupabase.getClient()', () => {
    expect(source).toContain('getClient()');
  });

  test('consulta tabela caronas_locations', () => {
    expect(source).toContain('caronas_locations');
  });

  test('feature option: ar-condicionado presente', () => {
    expect(source).toContain("'ar-condicionado'");
  });

  test('feature option: aceita-pets presente', () => {
    expect(source).toContain("'aceita-pets'");
  });

  test('feature option: sem-fumar presente', () => {
    expect(source).toContain("'sem-fumar'");
  });

  test('feature option: somente-mulheres presente', () => {
    expect(source).toContain("'somente-mulheres'");
  });

  test('normaliza aliases legados de campus em URLs salvas', () => {
    expect(source).toContain('function normalizeRideCampusKey');
    expect(source).toContain("colemar: 'campus-colemar'");
    expect(source).toContain("'aparecida-fct': 'campus-aparecida'");
    expect(source).toContain("'cidade-ocidental': 'campus-cidade-ocidental'");
    expect(source).toContain("readListParam(params, 'rideCampus').map(normalizeRideCampusKey)");

    const start = source.indexOf('function normalizeRideCampusKey');
    const end = source.indexOf('/*', start);
    const normalizeCampus = new Function('norm', source.slice(start, end) + '\nreturn normalizeRideCampusKey;')(
      (value) => String(value || '').toLowerCase().trim()
    );
    expect([
      'colemar',
      'samambaia',
      'aparecida-fct',
      'goias',
      'cidade-ocidental',
    ].map(normalizeCampus)).toEqual([
      'campus-colemar',
      'campus-samambaia',
      'campus-aparecida',
      'campus-goias',
      'campus-cidade-ocidental',
    ]);
  });

  test('usa dataset attr data-kc-carona-origem', () => {
    expect(source).toContain('data-kc-carona-origem');
  });

  test('usa dataset attr data-kc-carona-destino', () => {
    expect(source).toContain('data-kc-carona-destino');
  });

  test('usa dataset attr data-kc-carona-feature', () => {
    expect(source).toContain('data-kc-carona-feature');
  });

  test('usa dataset attr data-kc-caronas-date-preset', () => {
    expect(source).toContain('data-kc-caronas-date-preset');
  });

  test('referencia modal kcCaronasSectionOverlay', () => {
    expect(source).toContain('kcCaronasSectionOverlay');
  });

  test('define LOCATIONS_TTL', () => {
    expect(source).toContain('LOCATIONS_TTL');
  });

  test('usa KCOverlayLock.lock para scroll lock no modal de seção (iOS)', () => {
    expect(source).toContain("KCOverlayLock.lock('caronas-section-modal')");
  });

  test('usa KCOverlayLock.unlock ao fechar modal de seção (iOS)', () => {
    expect(source).toContain("KCOverlayLock.unlock('caronas-section-modal')");
  });

  test('define LOCATIONS_STORE_KEY para cache KCSessionStore', () => {
    expect(source).toContain("LOCATIONS_STORE_KEY");
    expect(source).toContain("'caronas:locations'");
  });

  test('usa getSessionStore para obter store de sessão', () => {
    expect(source).toContain('getSessionStore');
  });

  test('usa store.get( para leitura do cache de localizações', () => {
    expect(source).toContain('store.get(');
  });

  test('usa store.set( para persistência do cache de localizações', () => {
    expect(source).toContain('persistStore.set(');
  });
});

describe('caronas-feed.controller — runtime: carregamento sem lançar', () => {
  beforeEach(() => {
    delete window.KCAPI;
    delete window.KCSessionStore;
    delete window.KCFeedFilters;
    delete window.kcFilters;
    delete window.KCControllers;
    delete window.KCOverlayLock;
    delete window.KCSupabase;
    delete window.KCRealtime;
    delete window.KCPullToRefresh;
    document.body.innerHTML = '';

    window.KCFeedFilters = buildMinimalFeedFilters();
    window.KCSupabase = buildMinimalSupabase();
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

/*
  eventos.controller.js — Static contract tests (v76.1)
  Verifica KCFeedFilters, date presets, rail mobile (kcEventosSectionOverlay,
  KCOverlayLock 'eventos-section-modal') e dataset attrs do feed.

  NOTA: o calendário foi extraído para assets/js/features/kc-events-calendar.js;
  seus contratos vivem agora em tests/integration/kc-events-calendar.test.js.
*/

const fs = require('fs');
const path = require('path');

const CONTROLLER_PATH = path.resolve(__dirname, '..', '..', 'assets', 'js', 'controllers', 'public', 'eventos.controller.js');

function buildMinimalFeedFilters() {
  return {
    getAllowedDatePresets: jest.fn(() => ['today', 'next7d', 'thisMonth', 'past']),
    normalizeDatePreset: jest.fn((module, value) => value),
    matchesDatePreset: jest.fn(() => true),
    getSearchParams: jest.fn(() => new URLSearchParams()),
    readPresetParam: jest.fn(() => null),
    readTextParam: jest.fn(() => ''),
    updateSearchParams: jest.fn(),
    writePresetParam: jest.fn(),
    writeTextParam: jest.fn(),
  };
}

function loadController() {
  const code = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  // eslint-disable-next-line no-eval
  (0, eval)(code);
}

describe('eventos.controller — source contracts', () => {
  const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');

  test('usa KCFeedFilters.getAllowedDatePresets com eventos', () => {
    expect(source).toContain("getAllowedDatePresets('eventos')");
  });

  test('date preset today presente', () => {
    expect(source).toContain("'today'");
  });

  test('date preset next7d presente', () => {
    expect(source).toContain("'next7d'");
  });

  test('date preset thisMonth presente', () => {
    expect(source).toContain("'thisMonth'");
  });

  test('date preset past presente', () => {
    expect(source).toContain("'past'");
  });

  test('usa dataset attr data-kc-eventos-date-preset', () => {
    expect(source).toContain('data-kc-eventos-date-preset');
  });

  test('usa dataset attr data-kc-eventos-section', () => {
    expect(source).toContain('data-kc-eventos-section');
  });

  test('usa dataset attr data-kc-event-date', () => {
    expect(source).toContain('data-kc-event-date');
  });

  test('referencia modal kcEventosSectionOverlay', () => {
    expect(source).toContain('kcEventosSectionOverlay');
  });

  test('injeta feed do módulo eventos', () => {
    expect(source).toContain("module: 'eventos'");
  });

  test('usa KCOverlayLock.lock para scroll lock no modal de seção/filtros (iOS)', () => {
    expect(source).toContain("KCOverlayLock.lock('eventos-section-modal')");
  });

  test('usa KCOverlayLock.unlock ao fechar modal de seção/filtros (iOS)', () => {
    expect(source).toContain("KCOverlayLock.unlock('eventos-section-modal')");
  });

  test('NÃO contém mais a lógica do calendário (migrada para o módulo compartilhado)', () => {
    // Guard-rail: garante que a extração foi efetiva e não há duplicação de fonte.
    expect(source).not.toContain('kc_events_calendar_month');
    expect(source).not.toContain("'eventos:calendar'");
    expect(source).not.toContain('data-kc-cal-grid');
  });
});

describe('eventos.controller — runtime: carregamento sem lançar', () => {
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
  });

  test('não lança ao carregar com dependências mínimas', () => {
    expect(() => loadController()).not.toThrow();
  });

  test('não lança quando KCFeedFilters não está presente', () => {
    delete window.KCFeedFilters;
    expect(() => loadController()).not.toThrow();
  });
});

/*
  eventos.controller.js — Static contract tests (v11.26.2)
  Verifica KCFeedFilters, date presets, categorias de evento,
  KCSupabase.getClient() e dataset attrs.
*/

const fs = require('fs');
const path = require('path');

const CONTROLLER_PATH = path.resolve(__dirname, '..', 'assets', 'js', 'controllers', 'eventos.controller.js');

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

function buildMinimalSupabase() {
  const mockChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data: [], error: null }),
  };
  return {
    getClient: jest.fn(() => ({ from: jest.fn(() => mockChain) })),
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

  test('categoria sustentabilidade presente', () => {
    expect(source).toContain('sustentabilidade');
  });

  test('categoria academicos presente', () => {
    expect(source).toContain('academicos');
  });

  test('categoria culturais presente', () => {
    expect(source).toContain('culturais');
  });

  test('categoria esportivos presente', () => {
    expect(source).toContain('esportivos');
  });

  test('categoria workshops presente', () => {
    expect(source).toContain('workshops');
  });

  test('categoria festas presente', () => {
    expect(source).toContain('festas');
  });

  test('usa dataset attr data-kc-eventos-date-preset', () => {
    expect(source).toContain('data-kc-eventos-date-preset');
  });

  test('usa dataset attr data-kc-eventos-section', () => {
    expect(source).toContain('data-kc-eventos-section');
  });

  test('usa dataset attr data-kc-cal-grid', () => {
    expect(source).toContain('data-kc-cal-grid');
  });

  test('usa dataset attr data-kc-event-date', () => {
    expect(source).toContain('data-kc-event-date');
  });

  test('referencia modal kcEventosSectionOverlay', () => {
    expect(source).toContain('kcEventosSectionOverlay');
  });

  test('usa KCSupabase.getClient()', () => {
    expect(source).toContain('getClient()');
  });

  test('consulta tabela posts com module eventos', () => {
    expect(source).toContain("'posts'");
    expect(source).toContain("'eventos'");
  });

  test('define STORAGE_KEY para calendário', () => {
    expect(source).toContain('STORAGE_KEY');
    expect(source).toContain('kc_events_calendar_month');
  });

  test('define array de meses em pt-BR', () => {
    expect(source).toContain('Janeiro');
    expect(source).toContain('Dezembro');
  });

  test('usa KCOverlayLock.lock para scroll lock no modal calendário (iOS)', () => {
    expect(source).toContain("KCOverlayLock.lock('eventos-cal-modal')");
  });

  test('usa KCOverlayLock.unlock ao fechar modal calendário (iOS)', () => {
    expect(source).toContain("KCOverlayLock.unlock('eventos-cal-modal')");
  });

  test('usa KCOverlayLock.lock para scroll lock no modal de seção/filtros (iOS)', () => {
    expect(source).toContain("KCOverlayLock.lock('eventos-section-modal')");
  });

  test('usa KCOverlayLock.unlock ao fechar modal de seção/filtros (iOS)', () => {
    expect(source).toContain("KCOverlayLock.unlock('eventos-section-modal')");
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
    window.KCSupabase = buildMinimalSupabase();
  });

  test('não lança ao carregar com dependências mínimas', () => {
    expect(() => loadController()).not.toThrow();
  });

  test('não lança quando KCFeedFilters não está presente', () => {
    delete window.KCFeedFilters;
    expect(() => loadController()).not.toThrow();
  });
});

/*
  index.controller.js — Static contract tests (v11.26.2)
  Verifica contratos KCAPI (getCurrentUser, getMySavedPostsCount),
  modal refs e uso de KCOverlayLock.
*/

const fs = require('fs');
const path = require('path');

const CONTROLLER_PATH = path.resolve(__dirname, '..', '..', 'assets', 'js', 'controllers', 'public', 'index.controller.js');

function buildMinimalKCAPI() {
  return {
    getCurrentUser: jest.fn().mockResolvedValue(null),
    getMySavedPostsCount: jest.fn().mockResolvedValue(0),
    getTopContributors: jest.fn().mockResolvedValue([]),
    getFeedCursor: jest.fn().mockResolvedValue({
      ok: true,
      posts: [],
      next_cursor: null,
      has_more: false,
    }),
    normalizePost: jest.fn((raw) => raw),
    ENV: { driver: 'local' },
  };
}

function loadController() {
  const code = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  // eslint-disable-next-line no-eval
  (0, eval)(code);
}

describe('index.controller — source contracts', () => {
  const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');

  test('chama KCAPI.getCurrentUser', () => {
    expect(source).toContain('getCurrentUser');
  });

  test('chama KCAPI.getMySavedPostsCount com kind: favorite', () => {
    expect(source).toContain("kind: 'favorite'");
  });

  test('chama KCAPI.getMySavedPostsCount com kind: later', () => {
    expect(source).toContain("kind: 'later'");
  });

  test('chama KCAPI.getMySavedPostsCount com kind: highlight', () => {
    expect(source).toContain("kind: 'highlight'");
  });

  test('referencia modal kcHomeCategoriesHelpModal', () => {
    expect(source).toContain('kcHomeCategoriesHelpModal');
  });

  test('referencia backdrop kcHomeCategoriesHelpBackdrop', () => {
    expect(source).toContain('kcHomeCategoriesHelpBackdrop');
  });

  test('usa KCOverlayLock.lock para abrir modal de categorias', () => {
    expect(source).toContain("KCOverlayLock.lock('home-categories-help')");
  });

  test('usa KCOverlayLock.unlock para fechar modal de categorias', () => {
    expect(source).toContain("KCOverlayLock.unlock('home-categories-help')");
  });

  test('define tabs: destaques, recentes, comentados', () => {
    expect(source).toContain("'destaques'");
    expect(source).toContain("'recentes'");
    expect(source).toContain("'comentados'");
  });

  test('usa KCAPI.getTopContributors', () => {
    expect(source).toContain('getTopContributors');
  });

  test('usa dataset attr data-feed-tab', () => {
    expect(source).toContain('data-feed-tab');
  });

  test('usa dataset attr data-kc-ranking-period', () => {
    expect(source).toContain('data-kc-ranking-period');
  });
});

describe('index.controller — runtime: carregamento sem lançar', () => {
  beforeEach(() => {
    delete window.KCAPI;
    delete window.KCSessionStore;
    delete window.KCFeedFilters;
    delete window.kcFilters;
    delete window.KCControllers;
    delete window.KCOverlayLock;
    delete window.KCRanking;
    delete window.KCHomeCategories;
    delete window.KCRealtime;
    delete window.KCPullToRefresh;
    document.body.innerHTML = '';

    window.KCAPI = buildMinimalKCAPI();
    window.KCOverlayLock = {
      lock: jest.fn(),
      unlock: jest.fn(),
    };
  });

  test('não lança ao carregar com KCAPI mínimo', () => {
    expect(() => loadController()).not.toThrow();
  });

  test('não lança quando DOM não tem os modals esperados', () => {
    document.body.innerHTML = '<div id="kc-main"></div>';
    expect(() => loadController()).not.toThrow();
  });
});

/*
  kc-feed.controller.js — Static contract tests (v11.26.1)
  Verifica contratos públicos de KCControllers, constantes, integração
  KCSessionStore e comportamento anti-duplicação por Set de IDs.
*/

const fs = require('fs');
const path = require('path');

const CONTROLLER_PATH = path.resolve(__dirname, '..', '..', 'assets', 'js', 'controllers', 'public', 'kc-feed.controller.js');

function buildMinimalKCAPI() {
  return {
    getFeedCursor: jest.fn().mockResolvedValue({
      ok: true,
      posts: [],
      next_cursor: null,
      has_more: false,
    }),
    getPostById: jest.fn().mockResolvedValue(null),
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

function loadController() {
  const code = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  // eslint-disable-next-line no-eval
  (0, eval)(code);
}

describe('kc-feed.controller — public API surface', () => {
  beforeEach(() => {
    delete window.KCControllers;
    delete window.KCAPI;
    delete window.KCSessionStore;
    delete window.KCPostModel;
    delete window.KCRealtime;
    delete window.KCPullToRefresh;
    delete window.kcFilters;
    delete window.KCFeedFilters;
    document.body.innerHTML = '';

    window.KCAPI = buildMinimalKCAPI();
    window.KCSessionStore = buildMinimalSessionStore();

    loadController();
  });

  test('expõe window.KCControllers como objeto congelado', () => {
    expect(typeof window.KCControllers).toBe('object');
    expect(Object.isFrozen(window.KCControllers)).toBe(true);
  });

  test('KCControllers.injectFeed é uma função', () => {
    expect(typeof window.KCControllers.injectFeed).toBe('function');
  });

  test('KCControllers.createFeedPager é uma função', () => {
    expect(typeof window.KCControllers.createFeedPager).toBe('function');
  });

});

describe('kc-feed.controller — source contracts', () => {
  const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');

  test('POSTS_LIMIT é definido como 12', () => {
    expect(source).toMatch(/const\s+POSTS_LIMIT\s*=\s*12\b/);
  });

  test('FEED_SNAPSHOT_VERSION é definido', () => {
    expect(source).toMatch(/FEED_SNAPSHOT_VERSION\s*=/);
  });

  test('FEED_CACHE_MAX_AGE_MS é definido (10 min em ms)', () => {
    expect(source).toMatch(/FEED_CACHE_MAX_AGE_MS\s*=/);
    expect(source).toContain('1000 * 60 * 2');
    expect(source).toContain('FEED_FOCUS_REVALIDATE_MS');
  });

  test('UUID_RE regex está presente para validação de IDs', () => {
    expect(source).toContain('UUID_RE');
    expect(source).toContain('[0-9a-f]');
  });

  test('usa KCAPI.getFeedCursor', () => {
    expect(source).toContain('getFeedCursor');
  });

  test('usa KCAPI.getPostById', () => {
    expect(source).toContain('getPostById');
  });

  test('usa KCAPI.normalizePost ou KCPostModel.from', () => {
    const hasNormalize = source.includes('normalizePost') || source.includes('KCPostModel.from');
    expect(hasNormalize).toBe(true);
  });

  test('usa KCSessionStore via getSessionStore()', () => {
    expect(source).toContain('KCSessionStore');
    // getSessionStore() retorna a referência ao store e checa .get como tipo
    expect(source).toContain('KCSessionStore.get');
  });

  test('chama store.get e store.set no ciclo de cache', () => {
    expect(source).toContain('store.get(');
    expect(source).toContain('store.set(');
  });

  test('cria kc-feed-realtime-banner com display none inicial', () => {
    expect(source).toContain('kc-feed-realtime-banner');
    expect(source).toContain("style.display = 'none'");
  });

  test('expõe KCControllers com injectFeed e createFeedPager', () => {
    expect(source).toContain('window.KCControllers');
    expect(source).toContain('injectFeed');
    expect(source).toContain('createFeedPager');
  });

  test('renderiza estado vazio útil quando um feed público termina sem posts', () => {
    expect(source).toContain('function syncFeedEmptyState()');
    expect(source).toContain('Nenhuma publicação disponível agora');
    expect(source).toContain('Consulte os módulos da comunidade UFG');
    expect(source).toContain('data-kc-feed-empty');
  });

  test('usa aria-live polite no banner de realtime', () => {
    expect(source).toContain("setAttribute('aria-live', 'polite')");
  });

  test('padrão anti-duplicação usa Set (seenIds)', () => {
    expect(source).toContain('seenIds');
    expect(source).toMatch(/new\s+Set\s*\(\s*\)/);
    expect(source).toContain('replaceRenderedPosts');
    expect(source).toContain('buildRenderedSignature');
    expect(source).toContain('KCPostFreshness.subscribe');
    expect(source).toContain('subscribePostChanges');
  });

  test('não recarrega o feed em metrics_updated nem em realtime updated (voto)', () => {
    expect(source).toContain('shouldHardRefreshOnPostChange');
    expect(source).toContain('applySoftMetricPatch');
    expect(source).toContain("changeType === 'metrics_updated'");
    expect(source).toContain("source === 'realtime'");
    expect(source).toContain('kcUpdateVoteScoreInDOM');
    // Soft guard must appear before hard refresh call.
    const softIdx = source.indexOf('shouldHardRefreshOnPostChange');
    const refreshIdx = source.indexOf('scheduleFreshnessRefresh(change.type || \'post_change\')');
    expect(softIdx).toBeGreaterThan(-1);
    expect(refreshIdx).toBeGreaterThan(softIdx);
  });
});



  test('preserva DOM em pagehide persistido para bfcache', () => {
    const controllerSource = fs.readFileSync(CONTROLLER_PATH, 'utf8');
    expect(controllerSource).toContain('function pauseForBfcache()');
    expect(controllerSource).toContain('event.persisted');
    expect(controllerSource).toContain("window.addEventListener('pageshow', onPageShow)");
  });

describe('kc-feed.controller — KCSessionStore integration', () => {
  let sessionStore;

  beforeEach(() => {
    delete window.KCControllers;
    delete window.KCAPI;
    delete window.KCSessionStore;
    delete window.KCPostModel;
    delete window.KCRealtime;
    delete window.KCPullToRefresh;
    delete window.kcFilters;
    delete window.KCFeedFilters;
    document.body.innerHTML = '<div id="feed-container"></div>';

    window.KCAPI = buildMinimalKCAPI();
    sessionStore = buildMinimalSessionStore();
    window.KCSessionStore = sessionStore;

    loadController();
  });

  test('KCControllers.createFeedPager não lança quando container não existe', () => {
    expect(() => {
      window.KCControllers.createFeedPager({
        container: null,
        module: 'eventos',
        sortBy: 'recentes',
      });
    }).not.toThrow();
  });

  test('injectFeed com opções válidas retorna uma Promise', () => {
    const container = document.getElementById('feed-container');
    const result = window.KCControllers.injectFeed({
      container,
      module: 'eventos',
      sortBy: 'recentes',
    });
    expect(result && typeof result.then === 'function').toBe(true);
  });

  test('feed concluído sem posts mostra fallback útil no DOM', async () => {
    window.KCUtils = { renderPostCard: jest.fn(() => '') };

    const pager = await window.KCControllers.injectFeed({
      containerSelector: '#feed-container',
      module: null,
      pageModule: '',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const empty = document.querySelector('[data-kc-feed-empty="true"]');
    expect(empty).not.toBeNull();
    expect(empty.textContent).toContain('Nenhuma publicação disponível agora');
    expect(empty.textContent).toContain('Consulte os módulos da comunidade UFG');

    pager.destroy();
    delete window.KCUtils;
  });

  test('dependência de renderização ausente nunca deixa o spinner preso', () => {
    document.body.innerHTML = [
      '<div id="feed-container" class="kc-feed-list">',
      '<div><i class="fas fa-spinner fa-spin"></i><p>Carregando publicações...</p></div>',
      '</div>'
    ].join('');
    delete window.KCUtils;

    const pager = window.KCControllers.createFeedPager({
      containerSelector: '#feed-container',
      module: 'eventos',
    });

    const container = document.getElementById('feed-container');
    expect(pager).toBeNull();
    expect(container.querySelector('.fa-spinner')).toBeNull();
    expect(container.getAttribute('aria-busy')).toBe('false');
    expect(container.querySelector('[data-kc-feed-error="renderer-unavailable"]')).not.toBeNull();
    expect(container.textContent).toContain('Não foi possível carregar as publicações');
  });
});

describe('kc-feed.controller — anti-duplication Set behavior', () => {
  const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');

  test('getIdentityAliases gera aliases uuid: e id: para UUIDs', () => {
    expect(source).toContain('uuid:');
    expect(source).toContain('id:');
  });

  test('getIdentityAliases gera alias legacy: para IDs legados', () => {
    expect(source).toContain('legacy:');
  });

  test('hasSeenIdentity verifica seenIds.has para cada alias', () => {
    expect(source).toContain('seenIds.has(');
  });

  test('markSeenIdentity adiciona aliases a seenIds', () => {
    expect(source).toContain('seenIds.add(');
  });

  test('getIdentityAliases usa fallback com título e data quando id é nulo', () => {
    // verifica getPostIdentity fallback formula
    expect(source).toContain('fallback');
    expect(source).toContain('titulo || post.title');
  });
});

describe('kc-feed.controller — realtime banner structure', () => {
  beforeEach(() => {
    delete window.KCControllers;
    delete window.KCAPI;
    delete window.KCSessionStore;
    delete window.KCPostModel;
    delete window.KCRealtime;
    delete window.KCPullToRefresh;
    delete window.kcFilters;
    delete window.KCFeedFilters;
    document.body.innerHTML = '<div id="feed"></div>';

    window.KCAPI = buildMinimalKCAPI();
    window.KCSessionStore = buildMinimalSessionStore();

    loadController();
  });

  test('kc-feed-realtime-banner__msg e __count e __btn existem como classes no source', () => {
    const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');
    expect(source).toContain('kc-feed-realtime-banner__msg');
    expect(source).toContain('kc-feed-realtime-banner__count');
    expect(source).toContain('kc-feed-realtime-banner__btn');
  });
});

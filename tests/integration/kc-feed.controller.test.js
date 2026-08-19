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

async function waitForMockCall(mock, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (mock.mock.calls.length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
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
    delete window.KCHideClosed;
    delete window.KCPostLifecycle;
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
    delete window.KCHideClosed;
    delete window.KCPostLifecycle;
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
    expect(document.querySelector('.kc-feed-pager__status').textContent).toBe('');

    pager.destroy();
    delete window.KCUtils;
  });

  test('feed concluído com posts mantém o indicador de fim da lista', async () => {
    window.KCUtils = {
      renderPostCard: jest.fn((post) => `<article class="kc-card">${post.titulo}</article>`),
    };
    window.KCAPI.getFeedCursor.mockResolvedValueOnce({
      posts: [{ id: 'post-1', titulo: 'Publicação existente' }],
      nextCursor: null,
      hasMore: false,
    });

    const pager = await window.KCControllers.injectFeed({
      containerSelector: '#feed-container',
      module: null,
      pageModule: '',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.querySelector('.kc-feed-pager__status').textContent).toBe('Fim da lista');

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

  test('inclui categoria superior na primeira página e atualiza a consulta ao trocar o chip', async () => {
    document.body.innerHTML = '<div id="feed-container" class="kc-feed-list"></div>';
    window.KCUtils = { renderPostCard: jest.fn(() => '<article class="kc-card"></article>') };
    const coreState = { category: 'palestras', query: '' };
    window.kcFilters = {
      getState: jest.fn(() => ({ ...coreState })),
      canonicalCategory: jest.fn((value) => String(value || '').toLowerCase()),
      apply: jest.fn(),
    };

    const pager = window.KCControllers.createFeedPager({
      containerSelector: '#feed-container',
      module: 'eventos',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(window.KCAPI.getFeedCursor).toHaveBeenLastCalledWith(expect.objectContaining({
      module: 'eventos',
      category: 'palestras',
    }));

    coreState.category = 'culturais';
    document.dispatchEvent(new CustomEvent('kc:feed-core-filter-change', {
      detail: { category: 'culturais', query: '', reason: 'category' },
    }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(window.KCAPI.getFeedCursor).toHaveBeenLastCalledWith(expect.objectContaining({
      module: 'eventos',
      category: 'culturais',
    }));

    pager.destroy();
    delete window.KCUtils;
  });

  test('reinicia a paginação e envia hideClosed antes do LIMIT ao alternar o switch', async () => {
    document.body.innerHTML = '<div id="feed-container" class="kc-feed-list"></div>';
    window.KCUtils = {
      renderPostCard: jest.fn((post) => `<article class="kc-card">${post.titulo || ''}</article>`),
    };
    window.KCHideClosed = { getState: jest.fn(() => false) };
    window.KCPostLifecycle = require('../../assets/js/shared/kc-post-lifecycle.shared.js');
    window.KCAPI.getFeedCursor
      .mockResolvedValueOnce({
        posts: [{ id: 'closed-post', titulo: 'Encerrado', status: 'closed' }],
        nextCursor: 'cursor-closed',
        hasMore: true,
      })
      .mockResolvedValueOnce({
        posts: [
          { id: 'closed-fallback-post', titulo: 'Encerrado no fallback', status: 'closed' },
          { id: 'active-post', titulo: 'Ativo', status: 'published', metadata: { eventEndsAt: '2099-08-20' } },
        ],
        nextCursor: null,
        hasMore: false,
      });

    const pager = window.KCControllers.createFeedPager({
      containerSelector: '#feed-container',
      module: 'eventos',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(window.KCAPI.getFeedCursor).toHaveBeenNthCalledWith(1, expect.not.objectContaining({
      requestParams: expect.objectContaining({ hideClosed: true }),
    }));

    document.dispatchEvent(new CustomEvent('kc:hide-closed-change', {
      detail: { hideClosed: true, reason: 'toggle' },
    }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(window.KCAPI.getFeedCursor).toHaveBeenLastCalledWith(expect.objectContaining({
      hideClosed: true,
    }));
    expect(window.KCAPI.getFeedCursor.mock.calls.at(-1)[0]).not.toHaveProperty('cursor');
    expect(pager.getState()).toEqual(expect.objectContaining({
      hideClosed: true,
      done: true,
      firstPageCount: 1,
    }));
    expect(document.getElementById('feed-container').textContent).toContain('Ativo');
    expect(document.getElementById('feed-container').textContent).not.toContain('Encerrado');
    expect(document.getElementById('feed-container').textContent).not.toContain('Encerrado no fallback');

    pager.destroy();
    delete window.KCUtils;
  });

  test('combina categoria e switch sem perder a ultima mudanca concorrente', async () => {
    document.body.innerHTML = '<div id="feed-container" class="kc-feed-list"></div>';
    window.KCUtils = { renderPostCard: jest.fn(() => '<article class="kc-card"></article>') };
    window.KCHideClosed = { getState: jest.fn(() => false) };
    window.KCAPI.getFeedCursor.mockResolvedValue({ posts: [], nextCursor: null, hasMore: false });

    const pager = window.KCControllers.createFeedPager({
      containerSelector: '#feed-container',
      module: 'eventos',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    window.KCAPI.getFeedCursor.mockClear();

    document.dispatchEvent(new CustomEvent('kc:feed-core-filter-change', {
      detail: { category: 'culturais', query: 'cinema', reason: 'query' },
    }));
    document.dispatchEvent(new CustomEvent('kc:hide-closed-change', {
      detail: { hideClosed: true, reason: 'toggle' },
    }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(window.KCAPI.getFeedCursor).toHaveBeenCalledTimes(1);
    expect(window.KCAPI.getFeedCursor).toHaveBeenLastCalledWith(expect.objectContaining({
      module: 'eventos',
      category: 'culturais',
      q: 'cinema',
      hideClosed: true,
    }));

    window.KCAPI.getFeedCursor.mockClear();
    document.dispatchEvent(new CustomEvent('kc:hide-closed-change', {
      detail: { hideClosed: false, reason: 'toggle' },
    }));
    document.dispatchEvent(new CustomEvent('kc:hide-closed-change', {
      detail: { hideClosed: true, reason: 'toggle' },
    }));
    document.dispatchEvent(new CustomEvent('kc:hide-closed-change', {
      detail: { hideClosed: false, reason: 'toggle' },
    }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(window.KCAPI.getFeedCursor).toHaveBeenCalledTimes(1);
    expect(window.KCAPI.getFeedCursor.mock.calls[0][0]).not.toHaveProperty('hideClosed');
    expect(pager.getState().hideClosed).toBe(false);

    pager.destroy();
    delete window.KCUtils;
  });

  test('remove e revalida um card quando o prazo vence com a pagina aberta', async () => {
    document.body.innerHTML = '<div id="feed-container" class="kc-feed-list"></div>';
    window.KCUtils = {
      renderPostCard: jest.fn((post) => `<article class="kc-card">${post.titulo || ''}</article>`),
    };
    window.KCHideClosed = { getState: jest.fn(() => true) };
    window.KCPostLifecycle = require('../../assets/js/shared/kc-post-lifecycle.shared.js');
    const eventEndsAt = new Date(Date.now() + 80).toISOString();
    window.KCAPI.getFeedCursor
      .mockResolvedValueOnce({
        posts: [{ id: 'ending-post', module: 'eventos', titulo: 'Termina agora', status: 'published', metadata: { eventEndsAt } }],
        nextCursor: null,
        hasMore: false,
      })
      .mockResolvedValue({ posts: [], nextCursor: null, hasMore: false });

    const pager = window.KCControllers.createFeedPager({
      containerSelector: '#feed-container',
      module: 'eventos',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.getElementById('feed-container').textContent).toContain('Termina agora');

    await new Promise((resolve) => setTimeout(resolve, 180));

    expect(window.KCAPI.getFeedCursor.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(document.getElementById('feed-container').textContent).not.toContain('Termina agora');
    expect(pager.getState().firstPageCount).toBe(0);

    pager.destroy();
    delete window.KCUtils;
  });

  test.each([
    ['eventos', 'acadêmico', 'academicos'],
    ['eventos', 'cultural', 'culturais'],
    ['oportunidades', 'edital', 'editais'],
    ['moradia', 'apartamento', 'apartamentos'],
    ['compra-venda', 'móvel', 'moveis'],
    ['caronas', 'ofereço carona', 'ofereco'],
    ['achados-perdidos', 'achado', 'encontrados'],
  ])('normaliza alias legado do chip em %s (%s)', async (moduleKey, legacyCategory, expectedCategory) => {
    document.body.innerHTML = '<div id="feed-container" class="kc-feed-list"></div>';
    window.KCUtils = { renderPostCard: jest.fn(() => '<article class="kc-card"></article>') };
    window.kcFilters = {
      getState: jest.fn(() => ({ category: legacyCategory, query: '' })),
      canonicalCategory: jest.fn((value) => String(value || '').toLowerCase()),
      apply: jest.fn(),
    };

    const pager = window.KCControllers.createFeedPager({
      containerSelector: '#feed-container',
      module: moduleKey,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(window.KCAPI.getFeedCursor).toHaveBeenLastCalledWith(expect.objectContaining({
      module: moduleKey,
      category: expectedCategory,
    }));

    pager.destroy();
    delete window.KCUtils;
  });

  test('descarta resposta antiga quando o filtro muda durante uma requisição', async () => {
    document.body.innerHTML = '<div id="feed-container" class="kc-feed-list"></div>';
    window.KCUtils = {
      renderPostCard: jest.fn((post) => `<article class="kc-card">${post.titulo}</article>`),
    };
    const coreState = { category: 'palestras', query: '' };
    window.kcFilters = {
      getState: jest.fn(() => ({ ...coreState })),
      canonicalCategory: jest.fn((value) => String(value || '').toLowerCase()),
      apply: jest.fn(),
    };

    let resolveOldRequest;
    const oldRequest = new Promise((resolve) => { resolveOldRequest = resolve; });
    window.KCAPI.getFeedCursor
      .mockImplementationOnce(() => oldRequest)
      .mockResolvedValueOnce({
        posts: [{ id: 'new-post', titulo: 'Resultado cultural', status: 'published' }],
        nextCursor: null,
        hasMore: false,
      });

    const pager = window.KCControllers.createFeedPager({
      containerSelector: '#feed-container',
      module: 'eventos',
    });
    coreState.category = 'culturais';
    document.dispatchEvent(new CustomEvent('kc:feed-core-filter-change', {
      detail: { category: 'culturais', query: '', reason: 'category' },
    }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(document.getElementById('feed-container').textContent).toContain('Resultado cultural');
    resolveOldRequest({
      posts: [{ id: 'old-post', titulo: 'Resultado antigo', status: 'published' }],
      nextCursor: null,
      hasMore: false,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('feed-container').textContent).not.toContain('Resultado antigo');
    expect(pager.getState().requestGeneration).toBe(1);

    pager.destroy();

    const callsBeforeRetry = window.KCAPI.getFeedCursor.mock.calls.length;
    coreState.category = 'palestras';
    window.KCAPI.getFeedCursor.mockResolvedValueOnce({
      posts: [{ id: 'fresh-post', titulo: 'Resultado fresco da rede', status: 'published' }],
      nextCursor: null,
      hasMore: false,
    });
    const retryPager = window.KCControllers.createFeedPager({
      containerSelector: '#feed-container',
      module: 'eventos',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(window.KCAPI.getFeedCursor).toHaveBeenCalledTimes(callsBeforeRetry + 1);
    expect(document.getElementById('feed-container').textContent).toContain('Resultado fresco da rede');
    expect(document.getElementById('feed-container').textContent).not.toContain('Resultado antigo');

    retryPager.destroy();
    delete window.KCUtils;
  });

  test('revalidação tardia não apaga uma página carregada enquanto a requisição estava em voo', async () => {
    document.body.innerHTML = '<div id="feed-container" class="kc-feed-list"></div>';
    window.KCUtils = {
      renderPostCard: jest.fn((post) => `<article class="kc-card">${post.titulo}</article>`),
    };

    const snapshotKey = JSON.stringify({
      pathname: '/',
      modules: ['eventos'],
      q: '',
      tag: '',
      limit: 12,
      sortBy: 'recentes',
      request: '',
    });
    window.KCSessionStore = {
      get: jest.fn((namespace, key) => (namespace === 'feeds' && key === snapshotKey ? {
        value: {
          version: 4,
          cursor: null,
          nextCursor: 'cursor-page-2',
          hasMore: true,
          done: false,
          posts: [{ id: 'snapshot-post', titulo: 'Página restaurada', status: 'published' }],
        },
        age: 4 * 60 * 1000,
        timestamp: Date.now() - (4 * 60 * 1000),
      } : null)),
      set: jest.fn(),
      remove: jest.fn(),
    };

    let resolveRevalidation;
    const revalidation = new Promise((resolve) => { resolveRevalidation = resolve; });
    window.KCAPI.getFeedCursor
      .mockImplementationOnce(() => revalidation)
      .mockResolvedValueOnce({
        posts: [{ id: 'page-2-post', titulo: 'Página dois preservada', status: 'published' }],
        nextCursor: null,
        hasMore: false,
      });

    const pager = window.KCControllers.createFeedPager({
      containerSelector: '#feed-container',
      module: 'eventos',
    });
    await new Promise((resolve) => setTimeout(resolve, 55));
    expect(window.KCAPI.getFeedCursor).toHaveBeenCalledTimes(1);

    await pager.loadNextPage();
    expect(document.getElementById('feed-container').textContent).toContain('Página dois preservada');

    resolveRevalidation({
      posts: [{ id: 'snapshot-post', titulo: 'Página um revalidada', status: 'published' }],
      nextCursor: 'cursor-page-2',
      hasMore: true,
    });
    await Promise.resolve();
    await Promise.resolve();

    const feedText = document.getElementById('feed-container').textContent;
    expect(feedText).toContain('Página restaurada');
    expect(feedText).toContain('Página dois preservada');
    expect(feedText).not.toContain('Página um revalidada');

    pager.destroy();
    delete window.KCUtils;
  });

  test('revalidação que substitui cards reaplica o hook de anotações do módulo', async () => {
    document.body.innerHTML = '<div id="feed-container" class="kc-feed-list"></div>';
    window.KCUtils = {
      renderPostCard: jest.fn((post) => `<article class="kc-card">${post.titulo}</article>`),
    };
    window.kcInitVoteStates = jest.fn();
    const onAfterAppend = jest.fn();
    const snapshotKey = JSON.stringify({
      pathname: '/',
      modules: ['eventos'],
      q: '',
      tag: '',
      limit: 12,
      sortBy: 'recentes',
      request: '',
    });
    window.KCSessionStore = {
      get: jest.fn((namespace, key) => (namespace === 'feeds' && key === snapshotKey ? {
        value: {
          version: 4,
          cursor: 'cursor-page-2',
          nextCursor: 'cursor-page-3',
          hasMore: true,
          done: false,
          firstPageCount: 1,
          posts: [
            { id: 'shared-card', titulo: 'Card antigo', status: 'published' },
            { id: 'tail-card', titulo: 'Card da segunda pagina', status: 'published' },
          ],
        },
        age: 4 * 60 * 1000,
        timestamp: Date.now() - (4 * 60 * 1000),
      } : null)),
      set: jest.fn(),
      remove: jest.fn(),
    };
    window.KCAPI.getFeedCursor.mockResolvedValueOnce({
      posts: [{ id: 'shared-card', titulo: 'Card revalidado', status: 'published' }],
      nextCursor: null,
      hasMore: false,
    });

    const pager = window.KCControllers.createFeedPager({
      containerSelector: '#feed-container',
      module: 'eventos',
      onAfterAppend,
    });
    await waitForMockCall(window.kcInitVoteStates);

    expect(document.getElementById('feed-container').textContent).toContain('Card revalidado');
    expect(document.getElementById('feed-container').textContent).toContain('Card da segunda pagina');
    expect(onAfterAppend).toHaveBeenCalledWith(expect.objectContaining({ mode: 'replace' }));
    expect(window.kcInitVoteStates).toHaveBeenCalled();
    expect(pager.getState()).toEqual(expect.objectContaining({
      nextCursor: 'cursor-page-3',
      hasMore: true,
      firstPageCount: 1,
    }));

    pager.destroy();
    delete window.kcInitVoteStates;
    delete window.KCUtils;
  });

  test('revalidação em voo não apaga um post novo ainda pendente no banner de realtime', async () => {
    document.body.innerHTML = '<div id="feed-container" class="kc-feed-list"></div>';
    window.KCUtils = {
      renderPostCard: jest.fn((post) => `<article class="kc-card">${post.titulo}</article>`),
    };
    const snapshotKey = JSON.stringify({
      pathname: '/',
      modules: ['eventos'],
      q: '',
      tag: '',
      limit: 12,
      sortBy: 'recentes',
      request: '',
    });
    window.KCSessionStore = {
      get: jest.fn((namespace, key) => (namespace === 'feeds' && key === snapshotKey ? {
        value: {
          version: 4,
          cursor: null,
          nextCursor: null,
          hasMore: false,
          done: true,
          firstPageCount: 1,
          posts: [{ id: 'snapshot-post', titulo: 'Página restaurada', status: 'published' }],
        },
        age: 4 * 60 * 1000,
        timestamp: Date.now() - (4 * 60 * 1000),
      } : null)),
      set: jest.fn(),
      remove: jest.fn(),
    };

    let onRealtimePost;
    window.KCRealtime = {
      subscribeNewPosts: jest.fn((options) => {
        onRealtimePost = options.onPost;
        return { unsubscribe: jest.fn() };
      }),
    };
    window.KCAPI.getPostById.mockImplementation(async (id) => ({
      id,
      titulo: 'Post novo pendente',
      status: 'published',
    }));
    let resolveRevalidation;
    window.KCAPI.getFeedCursor.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRevalidation = resolve;
    }));

    const pager = window.KCControllers.createFeedPager({
      containerSelector: '#feed-container',
      module: 'eventos',
    });
    await new Promise((resolve) => setTimeout(resolve, 55));
    await onRealtimePost({ row: { id: 'new-post' } });

    expect(pager.getState().pendingRealtimePosts).toHaveLength(1);
    expect(document.querySelector('.kc-feed-realtime-banner__count').textContent).toBe('1');

    resolveRevalidation({
      posts: [{ id: 'snapshot-post', titulo: 'Página revalidada', status: 'published' }],
      nextCursor: null,
      hasMore: false,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(pager.getState().pendingRealtimePosts).toHaveLength(1);
    expect(document.querySelector('.kc-feed-realtime-banner__count').textContent).toBe('1');
    expect(document.getElementById('feed-container').textContent).toContain('Página restaurada');
    expect(document.getElementById('feed-container').textContent).not.toContain('Página revalidada');

    pager.destroy();
    delete window.KCRealtime;
    delete window.KCUtils;
  });

  test('resposta realtime tardia é descartada após troca de filtro e libera os aliases pendentes', async () => {
    document.body.innerHTML = '<div id="feed-container" class="kc-feed-list"></div>';
    window.KCUtils = { renderPostCard: jest.fn((post) => `<article class="kc-card">${post.titulo || ''}</article>`) };
    let onRealtimePost;
    window.KCRealtime = {
      subscribeNewPosts: jest.fn((options) => {
        onRealtimePost = options.onPost;
        return { unsubscribe: jest.fn() };
      }),
    };
    let resolveRealtime;
    window.KCAPI.getPostById.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRealtime = resolve;
    }));

    const pager = window.KCControllers.createFeedPager({
      containerSelector: '#feed-container',
      module: 'eventos',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const pendingRealtime = onRealtimePost({ row: { id: 'late-realtime-post' } });
    window.KCAPI.getFeedCursor.mockResolvedValueOnce({ posts: [], nextCursor: null, hasMore: false });
    await pager.refresh({ coreCategory: 'culturais' });
    resolveRealtime({
      id: 'late-realtime-post',
      titulo: 'Resultado do filtro anterior',
      modulo: 'eventos',
      category: 'palestras',
      status: 'published',
    });
    await pendingRealtime;

    expect(pager.getState().pendingRealtimePosts).toHaveLength(0);
    expect(pager.getState().pendingIds.size).toBe(0);
    expect(document.querySelector('.kc-feed-realtime-banner').style.display).toBe('none');

    pager.destroy();
    delete window.KCRealtime;
    delete window.KCUtils;
  });

  test('realtime só anuncia publicação que corresponde à busca e aos filtros ativos', async () => {
    document.body.innerHTML = '<div id="feed-container" class="kc-feed-list"></div>';
    window.KCUtils = { renderPostCard: jest.fn((post) => `<article class="kc-card">${post.titulo || ''}</article>`) };
    window.KCAPI.filterPosts = jest.fn(() => []);
    window.KCAPI.getPostById.mockResolvedValueOnce({
      id: 'filtered-realtime-post',
      titulo: 'Palestra fora do contexto',
      modulo: 'eventos',
      category: 'palestras',
      status: 'published',
    });
    let onRealtimePost;
    window.KCRealtime = {
      subscribeNewPosts: jest.fn((options) => {
        onRealtimePost = options.onPost;
        return { unsubscribe: jest.fn() };
      }),
    };

    const pager = window.KCControllers.createFeedPager({
      containerSelector: '#feed-container',
      module: 'eventos',
      q: 'congresso',
      requestParams: { category: 'congressos' },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await onRealtimePost({ row: { id: 'filtered-realtime-post' } });

    expect(window.KCAPI.filterPosts).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'filtered-realtime-post' })],
      expect.objectContaining({ module: 'eventos', q: 'congresso', category: 'congressos' }),
    );
    expect(pager.getState().pendingRealtimePosts).toHaveLength(0);
    expect(pager.getState().pendingIds.size).toBe(0);
    expect(document.querySelector('.kc-feed-realtime-banner').style.display).toBe('none');

    pager.destroy();
    delete window.KCRealtime;
    delete window.KCUtils;
  });

  test('pull-to-refresh mantém a promise pendente até a nova página concluir', async () => {
    document.body.innerHTML = '<div id="feed-container" class="kc-feed-list"></div>';
    window.KCUtils = { renderPostCard: jest.fn((post) => `<article class="kc-card">${post.titulo || ''}</article>`) };
    let onRefresh;
    window.KCPullToRefresh = {
      init: jest.fn((options) => { onRefresh = options.onRefresh; }),
    };

    const pager = window.KCControllers.createFeedPager({
      containerSelector: '#feed-container',
      module: 'eventos',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    let resolveRefresh;
    window.KCAPI.getFeedCursor.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRefresh = resolve;
    }));
    const refreshPromise = onRefresh();
    let settled = false;
    refreshPromise.finally(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    resolveRefresh({
      posts: [{ id: 'refreshed', titulo: 'Feed atualizado', status: 'published' }],
      nextCursor: null,
      hasMore: false,
    });
    await refreshPromise;

    expect(settled).toBe(true);
    expect(document.getElementById('feed-container').textContent).toContain('Feed atualizado');

    pager.destroy();
    delete window.KCPullToRefresh;
    delete window.KCUtils;
  });

  test.each([
    ['caronas', 'campus'],
    ['achados-perdidos', 'documentos'],
  ])('não envia chip polimórfico de %s como category (%s)', async (moduleKey, category) => {
    document.body.innerHTML = '<div id="feed-container" class="kc-feed-list"></div>';
    window.KCUtils = { renderPostCard: jest.fn(() => '<article class="kc-card"></article>') };
    window.kcFilters = {
      getState: jest.fn(() => ({ category, query: '' })),
      canonicalCategory: jest.fn((value) => String(value || '').toLowerCase()),
      apply: jest.fn(),
    };

    const pager = window.KCControllers.createFeedPager({
      containerSelector: '#feed-container',
      module: moduleKey,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const request = window.KCAPI.getFeedCursor.mock.calls.at(-1)[0];
    expect(request).not.toHaveProperty('category');

    pager.destroy();
    delete window.KCUtils;
  });

  test.each([
    ['eventos', 'academicos'],
    ['oportunidades', 'editais'],
    ['moradia', 'apartamentos'],
    ['compra-venda', 'eletronicos'],
    ['caronas', 'ofereco'],
  ])('preserva a key plural canônica de %s sem usar a singularização visual', async (moduleKey, category) => {
    document.body.innerHTML = '<div id="feed-container" class="kc-feed-list"></div>';
    window.KCUtils = { renderPostCard: jest.fn(() => '<article class="kc-card"></article>') };
    window.kcFilters = {
      getState: jest.fn(() => ({ category, query: '' })),
      canonicalCategory: jest.fn((value) => String(value || '').toLowerCase().replace(/s$/, '')),
      apply: jest.fn(),
    };

    const pager = window.KCControllers.createFeedPager({
      containerSelector: '#feed-container',
      module: moduleKey,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(window.KCAPI.getFeedCursor).toHaveBeenLastCalledWith(expect.objectContaining({ category }));

    pager.destroy();
    delete window.KCUtils;
  });

  test('canonicaliza alias legado de carona antes de consultar o servidor', async () => {
    document.body.innerHTML = '<div id="feed-container" class="kc-feed-list"></div>';
    window.KCUtils = { renderPostCard: jest.fn(() => '<article class="kc-card"></article>') };
    window.kcFilters = {
      getState: jest.fn(() => ({ category: 'ofereco-carona', query: '' })),
      canonicalCategory: jest.fn((value) => String(value || '').toLowerCase()),
      apply: jest.fn(),
    };

    const pager = window.KCControllers.createFeedPager({
      containerSelector: '#feed-container',
      module: 'caronas',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(window.KCAPI.getFeedCursor).toHaveBeenLastCalledWith(expect.objectContaining({
      module: 'caronas',
      category: 'ofereco',
    }));

    pager.destroy();
    delete window.KCUtils;
  });

  test('preserva category explícita do chamador quando o trilho está em Todas', async () => {
    document.body.innerHTML = '<div id="feed-container" class="kc-feed-list"></div>';
    window.KCUtils = { renderPostCard: jest.fn(() => '<article class="kc-card"></article>') };
    window.kcFilters = {
      getState: jest.fn(() => ({ category: 'todas', query: '' })),
      canonicalCategory: jest.fn((value) => String(value || '').toLowerCase()),
      apply: jest.fn(),
    };

    const pager = window.KCControllers.createFeedPager({
      containerSelector: '#feed-container',
      module: 'eventos',
      requestParams: { category: 'culturais' },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(window.KCAPI.getFeedCursor).toHaveBeenLastCalledWith(expect.objectContaining({
      module: 'eventos',
      category: 'culturais',
    }));

    pager.refresh({ requestParams: { category: 'congressos' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(window.KCAPI.getFeedCursor).toHaveBeenLastCalledWith(expect.objectContaining({
      category: 'congressos',
    }));

    pager.destroy();
    delete window.KCUtils;
  });

  test('propaga busca local ao pager com debounce', async () => {
    jest.useFakeTimers();
    document.body.innerHTML = '<div id="feed-container" class="kc-feed-list"></div>';
    window.KCUtils = { renderPostCard: jest.fn(() => '<article class="kc-card"></article>') };
    const coreState = { category: 'todas', query: '' };
    window.kcFilters = {
      getState: jest.fn(() => ({ ...coreState })),
      canonicalCategory: jest.fn((value) => String(value || '').toLowerCase()),
      apply: jest.fn(),
    };

    const pager = window.KCControllers.createFeedPager({
      containerSelector: '#feed-container',
      module: 'eventos',
    });
    await Promise.resolve();
    coreState.query = 'agentes de ia';
    document.dispatchEvent(new CustomEvent('kc:feed-core-filter-change', {
      detail: { category: 'todas', query: coreState.query, reason: 'query' },
    }));
    jest.advanceTimersByTime(220);
    await Promise.resolve();

    expect(window.KCAPI.getFeedCursor).toHaveBeenLastCalledWith(expect.objectContaining({
      module: 'eventos',
      q: 'agentes de ia',
    }));

    pager.destroy();
    delete window.KCUtils;
    jest.useRealTimers();
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

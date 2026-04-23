'use strict';

let driver;
let store;
let actualSavedModule;

beforeAll(() => {
  global.window = global.window || global;

  store = {};
  const localStorageMock = {
    getItem: (key) => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((key) => delete store[key]); },
  };
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    configurable: true,
  });
  Object.defineProperty(global, 'localStorage', {
    value: localStorageMock,
    configurable: true,
  });

  window.KCAPI = {
    registerAdapter: jest.fn(),
    config: { fallbackDatabaseURLs: [] },
    fetchJSON: jest.fn().mockResolvedValue({ anuncios: [] }),
    filterPosts: jest.fn((posts) => posts),
    normalizePost: jest.fn((post) => (post && typeof post === 'object' ? { ...post } : post)),
    MOCK_USERS_LIST: [],
    MOCK_USERS_BY_ID: {
      USER_SELF: {
        id: 'USER_SELF',
        displayName: 'Voce Teste',
        avatarUrl: 'https://example.com/self.png',
      },
    },
    apiURL: jest.fn((path) => '/api/v1/' + path),
    VERSION: '12.4.3',
    ENV: { driver: 'local', environment: 'development' },
    DEFAULTS: { fallbackDatabaseURLs: [] },
  };

  delete require.cache[require.resolve('../assets/js/adapters/local.notifications.adapter.js')];
  delete require.cache[require.resolve('../assets/js/adapters/local.ratings.adapter.js')];
  delete require.cache[require.resolve('../assets/js/adapters/local.saved.adapter.js')];
  delete require.cache[require.resolve('../assets/js/adapters/local.posts-read.adapter.js')];
  delete require.cache[require.resolve('../assets/js/adapters/local.posts-write.adapter.js')];
  delete require.cache[require.resolve('../assets/js/adapters/local.profile.adapter.js')];
  delete require.cache[require.resolve('../assets/js/adapters/local.adapter.js')];


  require('../assets/js/adapters/local.notifications.adapter.js');
  require('../assets/js/adapters/local.ratings.adapter.js');
  require('../assets/js/adapters/local.saved.adapter.js');
  require('../assets/js/adapters/local.posts-read.adapter.js');
  require('../assets/js/adapters/local.posts-write.adapter.js');
  require('../assets/js/adapters/local.profile.adapter.js');
  require('../assets/js/adapters/local.adapter.js');


  actualSavedModule = window._KCLA.saved;
  driver = window.KCAPI.registerAdapter.mock.calls[0][1];
});

beforeEach(() => {
  global.localStorage.clear();
  window._KCLA.saved = actualSavedModule;
});

const saved = () => window._KCLA.saved;

function buildPosts() {
  return {
    'saved-post-1': {
      id: 'saved-post-1',
      uuid: 'saved-post-1',
      title: 'Post salvo',
      module: 'moradia',
      category: 'quarto',
      authorId: 'USER_SELF',
      created_at: '2026-04-20T10:00:00Z',
      status: 'published',
      visibility: 'public',
    },
    'saved-post-2': {
      id: 'saved-post-2',
      uuid: 'saved-post-2',
      title: 'Outro post',
      module: 'eventos',
      category: 'academicos',
      authorId: 'USER_SELF',
      created_at: '2026-04-19T10:00:00Z',
      status: 'published',
      visibility: 'public',
    },
  };
}

function buildDeps(overrides = {}) {
  const posts = buildPosts();
  const base = {
    viewerId: 'USER_SELF',
    getNowIso: () => '2026-04-22T10:00:00Z',
    getPostById: async (postId) => posts[String(postId || '').trim()] || null,
    buildPostKeys: (post) => {
      const source = (post && typeof post === 'object') ? post : {};
      return Array.from(new Set([
        source.id,
        source.uuid,
        source.legacyId,
        source.legacy_id,
      ].map((value) => String(value || '').trim()).filter(Boolean)));
    },
    mapPostSummary: (post, extras = {}) => {
      const source = (post && typeof post === 'object') ? post : {};
      const summary = {
        id: source.id || null,
        uuid: source.uuid || null,
        title: source.title || 'Sem titulo',
        created_at: source.created_at || null,
        status: source.status || 'published',
        visibility: source.visibility || 'public',
        module: source.module || '',
        category: source.category || '',
      };
      if (Array.isArray(extras.saveKinds)) summary.save_kinds = extras.saveKinds.slice();
      if (extras.savedAt) summary.saved_at = extras.savedAt;
      return summary;
    },
    paginateItems: (items, params = {}) => {
      const page = Math.max(1, Number(params.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(params.limit) || 12));
      const offset = (page - 1) * limit;
      return {
        page,
        limit,
        items: (Array.isArray(items) ? items : []).slice(offset, offset + limit),
      };
    },
    readProfile: () => ({ id: 'USER_SELF', display_name: 'Voce Teste' }),
  };
  return { ...base, ...overrides };
}

describe('local.saved.adapter.js - contrato estatico', () => {
  test('registra window._KCLA.saved como objeto frozen', () => {
    expect(window._KCLA).toBeDefined();
    expect(saved()).toBeDefined();
    expect(Object.isFrozen(saved())).toBe(true);
  });

  test('expoe exatamente 7 chaves publicas', () => {
    expect(Object.keys(saved()).sort()).toEqual([
      'clearSavedPostState',
      'getMySavedPosts',
      'getMySavedPostsCount',
      'getProfileHighlights',
      'getProfileHighlightsCount',
      'getSavedPostState',
      'setSavedPostState',
    ]);
  });

  test('helpers internos nao ficam expostos', () => {
    expect(saved().normalizeSaveKind).toBeUndefined();
    expect(saved().readSavedPosts).toBeUndefined();
    expect(saved().listSavedPostSummaries).toBeUndefined();
  });
});

describe('local.saved.adapter.js - estados e mutacoes', () => {
  test('getSavedPostState retorna shape vazio quando nao ha storage', async () => {
    await expect(saved().getSavedPostState('saved-post-1', buildDeps())).resolves.toEqual({ kinds: [] });
  });

  test('setSavedPostState rejeita tipo invalido', async () => {
    const result = await saved().setSavedPostState('saved-post-1', 'invalid', true, buildDeps());
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('setSavedPostState rejeita post inexistente', async () => {
    const result = await saved().setSavedPostState('missing-post', 'favorite', true, buildDeps());
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('setSavedPostState persiste favorito e getSavedPostState reflete o kind', async () => {
    await expect(saved().setSavedPostState('saved-post-1', 'favorite', true, buildDeps())).resolves.toEqual(
      expect.objectContaining({ ok: true, enabled: true, data: { kind: 'favorite' } })
    );

    await expect(saved().getSavedPostState('saved-post-1', buildDeps())).resolves.toEqual({
      kinds: ['favorite'],
    });
  });

  test('setSavedPostState agrega multiplos kinds no mesmo post', async () => {
    await saved().setSavedPostState('saved-post-1', 'favorite', true, buildDeps());
    await saved().setSavedPostState('saved-post-1', 'highlight', true, buildDeps());

    const state = await saved().getSavedPostState('saved-post-1', buildDeps());
    expect(state.kinds.sort()).toEqual(['favorite', 'highlight']);
  });

  test('clearSavedPostState por kind preserva os demais', async () => {
    await saved().setSavedPostState('saved-post-1', 'favorite', true, buildDeps());
    await saved().setSavedPostState('saved-post-1', 'highlight', true, buildDeps());

    await expect(saved().clearSavedPostState('saved-post-1', 'favorite', buildDeps())).resolves.toEqual({
      ok: true,
      cleared: 'favorite',
    });
    await expect(saved().getSavedPostState('saved-post-1', buildDeps())).resolves.toEqual({
      kinds: ['highlight'],
    });
  });

  test('clearSavedPostState sem kind remove todos os estados do post', async () => {
    await saved().setSavedPostState('saved-post-1', 'favorite', true, buildDeps());
    await saved().setSavedPostState('saved-post-1', 'highlight', true, buildDeps());

    await expect(saved().clearSavedPostState('saved-post-1', null, buildDeps())).resolves.toEqual({
      ok: true,
      cleared: 'all',
    });
    await expect(saved().getSavedPostState('saved-post-1', buildDeps())).resolves.toEqual({ kinds: [] });
  });

  test('clearSavedPostState falha para post vazio', async () => {
    const result = await saved().clearSavedPostState('', null, buildDeps());
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('local.saved.adapter.js - listas e highlights', () => {
  test('getMySavedPosts agrega por post e expone save_kinds', async () => {
    global.localStorage.setItem('kc_saved_posts', JSON.stringify([
      { post_id: 'saved-post-1', kind: 'favorite', created_at: '2026-04-20T10:00:00Z', updated_at: '2026-04-20T10:00:00Z' },
      { post_id: 'saved-post-1', kind: 'highlight', created_at: '2026-04-20T11:00:00Z', updated_at: '2026-04-22T09:00:00Z' },
    ]));

    const items = await saved().getMySavedPosts({ page: 1, limit: 10 }, buildDeps());
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(expect.objectContaining({
      id: 'saved-post-1',
      save_kinds: expect.arrayContaining(['favorite', 'highlight']),
      saved_at: '2026-04-22T09:00:00Z',
    }));
  });

  test('getMySavedPosts aplica filtro por kind', async () => {
    global.localStorage.setItem('kc_saved_posts', JSON.stringify([
      { post_id: 'saved-post-1', kind: 'favorite', created_at: '2026-04-20T10:00:00Z', updated_at: '2026-04-20T10:00:00Z' },
      { post_id: 'saved-post-2', kind: 'highlight', created_at: '2026-04-21T10:00:00Z', updated_at: '2026-04-21T10:00:00Z' },
    ]));

    const items = await saved().getMySavedPosts({ page: 1, limit: 10, kind: 'favorite' }, buildDeps());
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('saved-post-1');
  });

  test('getMySavedPosts retorna lista vazia para storage corrompido', async () => {
    global.localStorage.setItem('kc_saved_posts', '{bad-json');
    await expect(saved().getMySavedPosts({ page: 1, limit: 10 }, buildDeps())).resolves.toEqual([]);
  });

  test('getMySavedPostsCount conta posts unicos e nao entradas duplicadas', async () => {
    global.localStorage.setItem('kc_saved_posts', JSON.stringify([
      { post_id: 'saved-post-1', kind: 'favorite', created_at: '2026-04-20T10:00:00Z', updated_at: '2026-04-20T10:00:00Z' },
      { post_id: 'saved-post-1', kind: 'highlight', created_at: '2026-04-20T11:00:00Z', updated_at: '2026-04-20T11:00:00Z' },
      { post_id: 'saved-post-2', kind: 'later', created_at: '2026-04-21T10:00:00Z', updated_at: '2026-04-21T10:00:00Z' },
    ]));

    await expect(saved().getMySavedPostsCount({}, buildDeps())).resolves.toBe(2);
  });

  test('getProfileHighlights retorna apenas highlights do proprio perfil', async () => {
    global.localStorage.setItem('kc_saved_posts', JSON.stringify([
      { post_id: 'saved-post-1', kind: 'highlight', created_at: '2026-04-20T10:00:00Z', updated_at: '2026-04-20T10:00:00Z' },
      { post_id: 'saved-post-2', kind: 'favorite', created_at: '2026-04-21T10:00:00Z', updated_at: '2026-04-21T10:00:00Z' },
    ]));

    const items = await saved().getProfileHighlights('USER_SELF', { page: 1, limit: 10, kind: 'favorite' }, buildDeps());
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('saved-post-1');
    expect(items[0].save_kinds).toEqual(['highlight']);
  });

  test('getProfileHighlights retorna vazio para outro perfil', async () => {
    global.localStorage.setItem('kc_saved_posts', JSON.stringify([
      { post_id: 'saved-post-1', kind: 'highlight', created_at: '2026-04-20T10:00:00Z', updated_at: '2026-04-20T10:00:00Z' },
    ]));

    await expect(saved().getProfileHighlights('USER_99', { page: 1, limit: 10 }, buildDeps())).resolves.toEqual([]);
  });

  test('getProfileHighlightsCount respeita ownership local e ignora kind externo', async () => {
    global.localStorage.setItem('kc_saved_posts', JSON.stringify([
      { post_id: 'saved-post-1', kind: 'highlight', created_at: '2026-04-20T10:00:00Z', updated_at: '2026-04-20T10:00:00Z' },
    ]));

    await expect(saved().getProfileHighlightsCount('USER_SELF', { page: 2, limit: 1, kind: 'favorite' }, buildDeps())).resolves.toBe(1);
    await expect(saved().getProfileHighlightsCount('USER_99', {}, buildDeps())).resolves.toBe(0);
  });
});

describe('local.saved.adapter.js - integracao com driver local', () => {
  test('driver delega getMySavedPostsCount para o submodulo', async () => {
    const stub = {
      ...actualSavedModule,
      getMySavedPostsCount: jest.fn().mockResolvedValue(7),
    };
    window._KCLA.saved = stub;

    await expect(driver.getMySavedPostsCount({ page: 2 })).resolves.toBe(7);
    expect(stub.getMySavedPostsCount).toHaveBeenCalledWith({ page: 2 }, expect.any(Object));
  });

  test('driver delega clearSavedPostState para o submodulo', async () => {
    const stub = {
      ...actualSavedModule,
      clearSavedPostState: jest.fn().mockResolvedValue({ ok: true, cleared: 'favorite' }),
    };
    window._KCLA.saved = stub;

    await expect(driver.clearSavedPostState('saved-post-1', 'favorite')).resolves.toEqual({
      ok: true,
      cleared: 'favorite',
    });
    expect(stub.clearSavedPostState).toHaveBeenCalledWith('saved-post-1', 'favorite', expect.any(Object));
  });

  test('driver usa fallbacks quando o submodulo saved esta ausente', async () => {
    window._KCLA.saved = {};

    await expect(driver.getSavedPostState('saved-post-1')).resolves.toEqual({ kinds: [] });
    await expect(driver.getMySavedPosts({})).resolves.toEqual([]);
    await expect(driver.getMySavedPostsCount({})).resolves.toBe(0);
    await expect(driver.getProfileHighlights('USER_SELF', {})).resolves.toEqual([]);
    await expect(driver.getProfileHighlightsCount('USER_SELF', {})).resolves.toBe(0);
  });

  test('driver.deletePost limpa referencias em kc_saved_posts via wrapper de saved', async () => {
    global.localStorage.setItem('kc_user_posts', JSON.stringify([
      {
        id: 'saved-post-1',
        title: 'Post salvo',
        module: 'moradia',
        category: 'quarto',
        authorId: 'USER_SELF',
        created_at: '2026-04-20T10:00:00Z',
        status: 'published',
      },
    ]));
    global.localStorage.setItem('kc_saved_posts', JSON.stringify([
      { post_id: 'saved-post-1', kind: 'favorite', created_at: '2026-04-20T10:00:00Z', updated_at: '2026-04-20T10:00:00Z' },
    ]));

    await expect(driver.deletePost('saved-post-1')).resolves.toEqual({ ok: true });
    await expect(driver.getSavedPostState('saved-post-1')).resolves.toEqual({ kinds: [] });
  });
});


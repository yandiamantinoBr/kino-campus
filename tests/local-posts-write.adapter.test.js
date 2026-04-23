'use strict';

let driver;
let store;
let actualPostsWriteModule;

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
    config: { fallbackDatabaseURLs: [], baseURL: '' },
    fetchJSON: jest.fn().mockResolvedValue({ anuncios: [] }),
    filterPosts: jest.fn((posts) => posts),
    normalizePost: jest.fn((post) => (post && typeof post === 'object' ? { ...post } : post)),
    MOCK_USERS_LIST: [
      { id: 'USER_SELF', displayName: 'Voce Teste', avatarUrl: 'https://example.com/self.png' },
      { id: 'USER_01', displayName: 'Ana Moradia', avatarUrl: 'https://example.com/ana.png' },
    ],
    MOCK_USERS_BY_ID: {
      USER_SELF: { id: 'USER_SELF', displayName: 'Voce Teste', avatarUrl: 'https://example.com/self.png' },
      USER_01: { id: 'USER_01', displayName: 'Ana Moradia', avatarUrl: 'https://example.com/ana.png' },
    },
    apiURL: jest.fn((path) => '/api/v1/' + path),
    VERSION: '12.4.5',
    ENV: { driver: 'local', environment: 'development' },
    DEFAULTS: { fallbackDatabaseURLs: [] },
    rankRelatedPosts: jest.fn((currentPost, candidates) => (Array.isArray(candidates) ? candidates.slice() : [])),
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

  actualPostsWriteModule = window._KCLA.postsWrite;
  driver = window.KCAPI.registerAdapter.mock.calls[0][1];
});

beforeEach(() => {
  global.localStorage.clear();
  window._KCLA.postsWrite = actualPostsWriteModule;
  window.KCAPI.fetchJSON.mockReset();
  window.KCAPI.fetchJSON.mockResolvedValue({ anuncios: [] });
});

const postsWrite = () => window._KCLA.postsWrite;

function buildDrafts() {
  return [
    {
      id: 'draft-1',
      uuid: 'draft-1',
      legacy_id: 'legacy-1',
      title: 'Antes',
      description: 'Descricao original',
      module: 'moradia',
      category: 'quarto',
      authorId: 'USER_SELF',
      created_at: '2026-04-22T10:00:00Z',
      status: 'draft',
      visibility: 'private',
    },
  ];
}

function buildDeps(overrides = {}) {
  const base = {
    config: { fallbackDatabaseURLs: [], baseURL: '' },
    fetchJSON: jest.fn().mockResolvedValue({ ok: true }),
    apiURL: (path) => '/api/v1/' + path,
    normalizePost: (post) => (post && typeof post === 'object' ? { ...post, _normalized: true } : post),
    getNowIso: () => '2026-04-22T12:00:00.000Z',
    buildPostKeys: (post) => {
      const source = (post && typeof post === 'object' && !Array.isArray(post)) ? post : {};
      return Array.from(new Set([
        source.id,
        source.uuid,
        source.legacy_id,
        source.legacyId,
      ].map((value) => String(value == null ? '' : value).trim()).filter(Boolean)));
    },
    viewerId: 'USER_SELF',
    mockUsersById: window.KCAPI.MOCK_USERS_BY_ID,
    toSlug: (value) => String(value || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    clearSavedPostState: jest.fn(async () => ({ ok: true })),
  };
  return { ...base, ...overrides };
}

describe('local.posts-write.adapter.js - contrato estatico', () => {
  test('registra window._KCLA.postsWrite como objeto frozen', () => {
    expect(window._KCLA).toBeDefined();
    expect(postsWrite()).toBeDefined();
    expect(Object.isFrozen(postsWrite())).toBe(true);
  });

  test('expoe exatamente 7 chaves publicas', () => {
    expect(Object.keys(postsWrite()).sort()).toEqual([
      'bumpPost',
      'createPost',
      'deletePost',
      'renewPost',
      'reportPost',
      'togglePostStatus',
      'updatePost',
    ]);
  });

  test('helpers internos nao ficam expostos', () => {
    expect(postsWrite().readPostDrafts).toBeUndefined();
    expect(postsWrite().writePostDrafts).toBeUndefined();
    expect(postsWrite().preparePostForPersistence).toBeUndefined();
  });
});

describe('local.posts-write.adapter.js - createPost', () => {
  test('persiste post local com categoria e subcategoria normalizadas', async () => {
    const created = await postsWrite().createPost({
      title: 'Ingresso Calourada',
      description: 'Evento de teste',
      modulo: 'compra-venda',
      category: 'Ingressos',
      subcategory: 'vendo',
      price: '25',
    }, buildDeps());

    expect(created).toEqual(expect.objectContaining({
      _normalized: true,
      title: 'Ingresso Calourada',
      authorId: 'USER_SELF',
      autor: 'Voce Teste',
      autorAvatar: 'https://example.com/self.png',
      categoria: 'ingressos',
      categoriaKey: 'ingressos',
      subcategoriaKey: 'ingressos',
      metadata: expect.objectContaining({
        categoriaKey: 'ingressos',
        subcategory: 'ingressos',
        subcategoryKey: 'ingressos',
      }),
    }));

    const stored = JSON.parse(global.localStorage.getItem('kc_user_posts') || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toEqual(expect.objectContaining({
      title: 'Ingresso Calourada',
      categoriaKey: 'ingressos',
      subcategoriaKey: 'ingressos',
    }));
  });

  test('retorna envelope de erro quando a escrita local falha', async () => {
    const originalSetItem = global.localStorage.setItem;
    global.localStorage.setItem = () => { throw new Error('disk full'); };

    try {
      const result = await postsWrite().createPost({ title: 'Falha local' }, buildDeps());
      expect(result).toEqual(expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: 'LOCAL_STORAGE_SET_ITEM_FAILED' }),
      }));
    } finally {
      global.localStorage.setItem = originalSetItem;
    }
  });

  test('faz POST remoto quando baseURL esta ativo', async () => {
    const fetchJSON = jest.fn().mockResolvedValue({ ok: true, id: 'remote-1' });
    const deps = buildDeps({
      config: { baseURL: 'https://api.example.com' },
      fetchJSON,
    });

    const result = await postsWrite().createPost({ title: 'Remoto' }, deps);

    expect(result).toEqual({ ok: true, id: 'remote-1' });
    expect(fetchJSON).toHaveBeenCalledWith('/api/v1/posts', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Remoto' }),
    }));
  });

  test('preserva categoria e subcategoria quando nao cai na regra actionish', async () => {
    const created = await postsWrite().createPost({
      title: 'Oferta de monitoria',
      modulo: 'oportunidades',
      category: 'Academico',
      subcategory: 'Bolsas',
    }, buildDeps());

    expect(created.categoriaKey).toBe('academico');
    expect(created.subcategoriaKey).toBe('bolsas');
    expect(created.metadata.subcategoryKey).toBe('bolsas');
  });
});

describe('local.posts-write.adapter.js - updatePost e deletePost', () => {
  test('updatePost encontra draft por legacy_id e persiste alteracoes', async () => {
    global.localStorage.setItem('kc_user_posts', JSON.stringify(buildDrafts()));

    const result = await postsWrite().updatePost('legacy-1', {
      title: 'Depois',
      description: 'Descricao atualizada',
    }, buildDeps());

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({ title: 'Depois', _normalized: true }),
    }));

    const stored = JSON.parse(global.localStorage.getItem('kc_user_posts') || '[]');
    expect(stored[0]).toEqual(expect.objectContaining({
      id: 'draft-1',
      title: 'Depois',
      description: 'Descricao atualizada',
    }));
  });

  test('updatePost retorna erro quando o id e invalido', async () => {
    const result = await postsWrite().updatePost('', { title: 'X' }, buildDeps());
    expect(result.ok).toBe(false);
  });

  test('updatePost faz PUT remoto quando baseURL esta ativo', async () => {
    const fetchJSON = jest.fn().mockResolvedValue({ ok: true });
    const deps = buildDeps({
      config: { baseURL: 'https://api.example.com' },
      fetchJSON,
    });

    const result = await postsWrite().updatePost('draft-1', { title: 'Remoto' }, deps);

    expect(result).toEqual({ ok: true });
    expect(fetchJSON).toHaveBeenCalledWith('/api/v1/posts/draft-1', expect.objectContaining({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Remoto' }),
    }));
  });

  test('deletePost remove o draft local e limpa salvos relacionados', async () => {
    global.localStorage.setItem('kc_user_posts', JSON.stringify(buildDrafts()));
    const clearSavedPostState = jest.fn(async () => ({ ok: true }));

    const result = await postsWrite().deletePost('draft-1', buildDeps({ clearSavedPostState }));

    expect(result).toEqual({ ok: true });
    expect(JSON.parse(global.localStorage.getItem('kc_user_posts') || '[]')).toEqual([]);
    expect(clearSavedPostState).toHaveBeenCalledWith('draft-1');
  });

  test('deletePost retorna erro quando nao encontra o draft', async () => {
    global.localStorage.setItem('kc_user_posts', JSON.stringify(buildDrafts()));

    const result = await postsWrite().deletePost('inexistente', buildDeps());

    expect(result.ok).toBe(false);
    expect(result.error.message).toMatch(/nao encontrada/i);
  });

  test('deletePost faz DELETE remoto quando baseURL esta ativo', async () => {
    const fetchJSON = jest.fn().mockResolvedValue({ ok: true });
    const deps = buildDeps({
      config: { baseURL: 'https://api.example.com' },
      fetchJSON,
    });

    const result = await postsWrite().deletePost('draft-1', deps);

    expect(result).toEqual({ ok: true });
    expect(fetchJSON).toHaveBeenCalledWith('/api/v1/posts/draft-1', expect.objectContaining({
      method: 'DELETE',
    }));
  });
});

describe('local.posts-write.adapter.js - stubs de mutacao avancada', () => {
  test('reportPost retorna indisponivel no modo local', async () => {
    const result = await postsWrite().reportPost();
    expect(result.ok).toBe(false);
  });

  test('togglePostStatus retorna UNAVAILABLE', async () => {
    const result = await postsWrite().togglePostStatus();
    expect(result.code).toBe('UNAVAILABLE');
  });

  test('renewPost retorna UNAVAILABLE', async () => {
    const result = await postsWrite().renewPost();
    expect(result.code).toBe('UNAVAILABLE');
  });

  test('bumpPost retorna UNAVAILABLE', async () => {
    const result = await postsWrite().bumpPost();
    expect(result.code).toBe('UNAVAILABLE');
  });
});

describe('local.posts-write.adapter.js - integracao com driver local', () => {
  test('driver delega createPost para o submodulo', async () => {
    const stub = {
      ...actualPostsWriteModule,
      createPost: jest.fn().mockResolvedValue({ id: 'delegado' }),
    };
    window._KCLA.postsWrite = stub;

    const result = await driver.createPost({ title: 'Delegado' });

    expect(result).toEqual({ id: 'delegado' });
    expect(stub.createPost).toHaveBeenCalledWith({ title: 'Delegado' }, expect.any(Object));
  });

  test('driver delega updatePost para o submodulo', async () => {
    const stub = {
      ...actualPostsWriteModule,
      updatePost: jest.fn().mockResolvedValue({ ok: true }),
    };
    window._KCLA.postsWrite = stub;

    const result = await driver.updatePost('draft-1', { title: 'Delegado' });

    expect(result).toEqual({ ok: true });
    expect(stub.updatePost).toHaveBeenCalledWith('draft-1', { title: 'Delegado' }, expect.any(Object));
  });

  test('driver delega deletePost para o submodulo', async () => {
    const stub = {
      ...actualPostsWriteModule,
      deletePost: jest.fn().mockResolvedValue({ ok: true }),
    };
    window._KCLA.postsWrite = stub;

    const result = await driver.deletePost('draft-1');

    expect(result).toEqual({ ok: true });
    expect(stub.deletePost).toHaveBeenCalledWith('draft-1', expect.any(Object));
  });

  test('driver delega togglePostStatus para o submodulo', async () => {
    const stub = {
      ...actualPostsWriteModule,
      togglePostStatus: jest.fn().mockResolvedValue({ ok: false, code: 'UNAVAILABLE' }),
    };
    window._KCLA.postsWrite = stub;

    const result = await driver.togglePostStatus();

    expect(result.code).toBe('UNAVAILABLE');
    expect(stub.togglePostStatus).toHaveBeenCalled();
  });

  test('driver retorna null quando createPost nao esta disponivel no submodulo', async () => {
    window._KCLA.postsWrite = {};
    await expect(driver.createPost({ title: 'Fallback' })).resolves.toBeNull();
  });

  test('driver retorna erro seguro quando updatePost nao esta disponivel no submodulo', async () => {
    window._KCLA.postsWrite = {};
    const result = await driver.updatePost('draft-1', { title: 'Fallback' });
    expect(result.ok).toBe(false);
  });

  test('driver retorna erro seguro quando deletePost nao esta disponivel no submodulo', async () => {
    window._KCLA.postsWrite = {};
    const result = await driver.deletePost('draft-1');
    expect(result.ok).toBe(false);
  });
});

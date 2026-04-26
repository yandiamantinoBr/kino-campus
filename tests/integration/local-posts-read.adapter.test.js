'use strict';

let driver;
let store;
let actualPostsReadModule;

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
      { id: 'USER_01', displayName: 'Ana Moradia', avatarUrl: 'https://example.com/ana.png' },
      { id: 'USER_02', displayName: 'Beto Eventos', avatarUrl: 'https://example.com/beto.png' },
      { id: 'USER_SELF', displayName: 'Voce Teste', avatarUrl: 'https://example.com/self.png' },
    ],
    MOCK_USERS_BY_ID: {
      USER_01: { id: 'USER_01', displayName: 'Ana Moradia', avatarUrl: 'https://example.com/ana.png' },
      USER_02: { id: 'USER_02', displayName: 'Beto Eventos', avatarUrl: 'https://example.com/beto.png' },
      USER_SELF: { id: 'USER_SELF', displayName: 'Voce Teste', avatarUrl: 'https://example.com/self.png' },
    },
    apiURL: jest.fn((path) => '/api/v1/' + path),
    VERSION: '12.4.4',
    ENV: { driver: 'local', environment: 'development' },
    DEFAULTS: { fallbackDatabaseURLs: [] },
    rankRelatedPosts: jest.fn((currentPost, candidates) => (Array.isArray(candidates) ? candidates.slice() : [])),
  };

  delete require.cache[require.resolve('../../assets/js/adapters/local.notifications.adapter.js')];
  delete require.cache[require.resolve('../../assets/js/adapters/local.ratings.adapter.js')];
  delete require.cache[require.resolve('../../assets/js/adapters/local.saved.adapter.js')];
  delete require.cache[require.resolve('../../assets/js/adapters/local.posts-read.adapter.js')];
  delete require.cache[require.resolve('../../assets/js/adapters/local.posts-write.adapter.js')];
  delete require.cache[require.resolve('../../assets/js/adapters/local.profile.adapter.js')];
  delete require.cache[require.resolve('../../assets/js/adapters/local.help.adapter.js')];
  delete require.cache[require.resolve('../../assets/js/adapters/local.adapter.js')];

  require('../../assets/js/adapters/local.notifications.adapter.js');
  require('../../assets/js/adapters/local.ratings.adapter.js');
  require('../../assets/js/adapters/local.saved.adapter.js');
  require('../../assets/js/adapters/local.posts-read.adapter.js');
  require('../../assets/js/adapters/local.posts-write.adapter.js');
  require('../../assets/js/adapters/local.profile.adapter.js');
  require('../../assets/js/adapters/local.help.adapter.js');
  require('../../assets/js/adapters/local.adapter.js');

  actualPostsReadModule = window._KCLA.postsRead;
  driver = window.KCAPI.registerAdapter.mock.calls[0][1];
});

beforeEach(() => {
  global.localStorage.clear();
  window._KCLA.postsRead = actualPostsReadModule;
  window.KCAPI.fetchJSON.mockReset();
  window.KCAPI.fetchJSON.mockResolvedValue({ anuncios: [] });
  window.KCAPI.filterPosts.mockReset();
  window.KCAPI.filterPosts.mockImplementation((posts, params = {}) => {
    const list = Array.isArray(posts) ? posts : [];
    const moduleFilter = Array.isArray(params.module)
      ? params.module.map((value) => String(value).trim().toLowerCase())
      : [String(params.module || '').trim().toLowerCase()].filter(Boolean);
    return list.filter((post) => {
      if (!moduleFilter.length) return true;
      const currentModule = String(post.module || post.modulo || '').trim().toLowerCase();
      return moduleFilter.includes(currentModule);
    });
  });
  window.KCAPI.rankRelatedPosts.mockReset();
  window.KCAPI.rankRelatedPosts.mockImplementation((currentPost, candidates) => (Array.isArray(candidates) ? candidates.slice() : []));
});

const postsRead = () => window._KCLA.postsRead;

function buildSeedPosts() {
  return [
    {
      id: 'seed-1',
      uuid: 'seed-1',
      legacy_id: '101',
      title: 'Quarto mobiliado',
      description: 'Perto do campus',
      module: 'moradia',
      category: 'quarto',
      authorId: 'USER_01',
      author_id: 'USER_01',
      authorName: 'Ana Moradia',
      authorAvatar: 'https://example.com/ana.png',
      created_at: '2026-04-22T10:00:00Z',
      status: 'published',
      visibility: 'public',
      votos: 3,
      comentarios: 1,
      share_count: 2,
      coupon_clicks: 1,
    },
    {
      id: 'seed-2',
      uuid: 'seed-2',
      legacy_id: '102',
      title: 'Evento de Calouros',
      description: 'No auditorio central',
      module: 'eventos',
      category: 'cultural',
      authorId: 'USER_02',
      author_id: 'USER_02',
      authorName: 'Beto Eventos',
      authorAvatar: 'https://example.com/beto.png',
      created_at: '2026-04-21T09:00:00Z',
      status: 'published',
      visibility: 'public',
      votos: 8,
      comentarios: 2,
      share_count: 3,
      coupon_clicks: 0,
    },
    {
      id: 'seed-3',
      uuid: 'seed-3',
      legacy_id: '103',
      title: 'Monitoria de Algebra',
      description: 'Apoio para calculo',
      module: 'oportunidades',
      category: 'estudos',
      authorId: 'USER_01',
      author_id: 'USER_01',
      authorName: 'Ana Moradia',
      authorAvatar: 'https://example.com/ana.png',
      created_at: '2026-04-20T08:00:00Z',
      status: 'published',
      visibility: 'public',
      votos: 6,
      comentarios: 4,
      share_count: 1,
      coupon_clicks: 2,
      timestamp: 'ha 2 dias',
    },
  ];
}

function buildLocalPosts() {
  return [
    {
      id: 'local-1',
      uuid: 'local-1',
      title: 'Rascunho de carona',
      description: 'Campus -> Centro',
      module: 'caronas',
      category: 'ida',
      authorId: 'USER_SELF',
      author_id: 'USER_SELF',
      created_at: '2026-04-22T12:00:00Z',
      status: 'draft',
      visibility: 'private',
      timestamp: 'ha 30 minutos',
    },
    {
      id: 'local-2',
      uuid: 'local-2',
      title: 'Anuncio publicado',
      description: 'Notebook usado',
      module: 'compra-venda',
      category: 'eletronicos',
      authorId: 'USER_SELF',
      author_id: 'USER_SELF',
      created_at: '2026-04-22T11:00:00Z',
      status: 'published',
      visibility: 'public',
      timestamp: 'ha 1 hora',
    },
  ];
}

function buildDeps(overrides = {}) {
  const seedPosts = buildSeedPosts();
  const localPosts = buildLocalPosts();
  const base = {
    config: { fallbackDatabaseURLs: [], baseURL: '' },
    fetchJSON: async () => ({ anuncios: seedPosts }),
    apiURL: (path) => '/api/v1/' + path,
    filterPosts: (posts, params = {}) => {
      const list = Array.isArray(posts) ? posts : [];
      const moduleFilter = Array.isArray(params.module)
        ? params.module.map((value) => String(value).trim().toLowerCase())
        : [String(params.module || '').trim().toLowerCase()].filter(Boolean);
      return list.filter((post) => {
        if (!moduleFilter.length) return true;
        const currentModule = String(post.module || post.modulo || '').trim().toLowerCase();
        return moduleFilter.includes(currentModule);
      });
    },
    normalizePost: (post) => (post && typeof post === 'object' ? { ...post } : post),
    getDatabaseRaw: async () => ({ anuncios: seedPosts }),
    getDatabaseNormalized: async () => ({ posts: seedPosts.map((post) => ({ ...post })) }),
    getSearchShared: () => null,
    readLocalUserPosts: () => localPosts.map((post) => ({ ...post })),
    enrichPostWithRatings: (post) => ({ ...(post || {}), _enriched: true }),
    enrichPostsWithRatings: (posts) => (Array.isArray(posts) ? posts.map((post) => ({ ...(post || {}), _enriched: true })) : []),
    parsePostTime: (post) => Date.parse(String((post && (post.updated_at || post.created_at || post.timestamp_iso)) || '')) || 0,
    mapPostSummary: (post) => ({
      id: post.id || null,
      uuid: post.uuid || null,
      title: post.title || 'Sem titulo',
      created_at: post.created_at || null,
      status: post.status || 'published',
      visibility: post.visibility || 'public',
      module: post.module || post.modulo || '',
      category: post.category || post.categoria || '',
    }),
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
    rankRelatedPosts: (currentPost, candidates) => (Array.isArray(candidates) ? candidates.slice() : []),
    toSlug: (value) => String(value || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    mockUsersList: window.KCAPI.MOCK_USERS_LIST,
    mockUsersById: window.KCAPI.MOCK_USERS_BY_ID,
  };
  return { ...base, ...overrides };
}

describe('local.posts-read.adapter.js - contrato estatico', () => {
  test('registra window._KCLA.postsRead como objeto frozen', () => {
    expect(window._KCLA).toBeDefined();
    expect(postsRead()).toBeDefined();
    expect(Object.isFrozen(postsRead())).toBe(true);
  });

  test('expoe exatamente 8 chaves publicas', () => {
    expect(Object.keys(postsRead()).sort()).toEqual([
      'getFeedCursor',
      'getMyPosts',
      'getPostById',
      'getPosts',
      'getPostsByAuthorId',
      'getRelatedPosts',
      'getTopContributors',
      'searchPosts',
    ]);
  });

  test('helpers internos nao ficam expostos', () => {
    expect(postsRead().normalizeFeedCursorParams).toBeUndefined();
    expect(postsRead().encodeBase64Utf8).toBeUndefined();
    expect(postsRead().resolveRankingUser).toBeUndefined();
  });
});

describe('local.posts-read.adapter.js - leitura e busca', () => {
  test('getPosts pagina e enriquece o resultado local', async () => {
    const result = await postsRead().getPosts({ module: 'eventos', page: 1, limit: 5 }, buildDeps());

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      id: 'seed-2',
      _enriched: true,
    }));
  });

  test('getFeedCursor retorna envelope com nextCursor e hasMore', async () => {
    const first = await postsRead().getFeedCursor({ limit: 2 }, buildDeps());
    const second = await postsRead().getFeedCursor({ limit: 2, cursor: first.nextCursor }, buildDeps());

    expect(first.posts).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(typeof first.nextCursor).toBe('string');
    expect(second.posts).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();
  });

  test('getFeedCursor serializa arrays quando baseURL esta ativo', async () => {
    const fetchJSON = jest.fn().mockResolvedValue({ posts: [], nextCursor: null, hasMore: false });
    await postsRead().getFeedCursor({
      module: ['eventos', 'moradia'],
      limit: 10,
    }, buildDeps({
      config: { baseURL: '/api/v1' },
      fetchJSON,
    }));

    expect(fetchJSON).toHaveBeenCalledWith(expect.stringContaining('feed-cursor?'));
    expect(fetchJSON.mock.calls[0][0]).toContain(encodeURIComponent(JSON.stringify(['eventos', 'moradia'])));
  });

  test('searchPosts usa o search shared quando disponivel', async () => {
    const searchCollection = jest.fn().mockReturnValue([{ id: 'seed-2' }]);
    const searchShared = { searchCollection };

    const result = await postsRead().searchPosts({ q: 'evento' }, buildDeps({
      getSearchShared: () => searchShared,
    }));

    expect(searchCollection).toHaveBeenCalledWith(expect.any(Array), { q: 'evento' });
    expect(result).toEqual([{ id: 'seed-2' }]);
  });

  test('searchPosts faz fallback para getPosts quando nao ha search shared', async () => {
    const result = await postsRead().searchPosts({ module: 'moradia', page: 1, limit: 10 }, buildDeps());

    expect(result).toHaveLength(1);
    expect(result.map((post) => post.id)).toEqual(['seed-1']);
  });
});

describe('local.posts-read.adapter.js - detalhes e related', () => {
  test('getPostById prioriza localStorage via readLocalUserPosts', async () => {
    const result = await postsRead().getPostById('local-2', buildDeps());

    expect(result).toEqual(expect.objectContaining({
      id: 'local-2',
      _enriched: true,
    }));
  });

  test('getPostById resolve legacy_id no seed bruto', async () => {
    const result = await postsRead().getPostById('101', buildDeps());

    expect(result).toEqual(expect.objectContaining({
      id: 'seed-1',
      _enriched: true,
    }));
  });

  test('getPostById faz fallback para listagem quando a rota /posts/:id falha', async () => {
    const fetchJSON = jest.fn().mockImplementation(async (url) => {
      if (url.indexOf('/posts/remote-1') >= 0) throw new Error('not-found');
      return [{ id: 'remote-1', uuid: 'remote-1', title: 'Remoto' }];
    });

    const result = await postsRead().getPostById('remote-1', buildDeps({
      config: { baseURL: '/api/v1' },
      fetchJSON,
    }));

    expect(result).toEqual({ id: 'remote-1', uuid: 'remote-1', title: 'Remoto' });
  });

  test('getRelatedPosts prioriza mesmo autor antes do score bruto', async () => {
    const rankRelatedPosts = jest.fn((currentPost, candidates) => candidates.map((post, index) => ({
      ...post,
      _kcRelatedScore: index === 0 ? 999 : index,
    })));

    const result = await postsRead().getRelatedPosts('seed-1', { limit: 3 }, buildDeps({ rankRelatedPosts }));

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(expect.objectContaining({
      id: 'seed-3',
      authorId: 'USER_01',
      _enriched: true,
    }));
  });
});

describe('local.posts-read.adapter.js - listas resumidas e ranking', () => {
  test('getMyPosts ordena por data e filtra por status', async () => {
    const result = await postsRead().getMyPosts({ status: 'published', page: 1, limit: 10 }, buildDeps());

    expect(result).toEqual([
      expect.objectContaining({ id: 'local-2', status: 'published' }),
    ]);
  });

  test('getPostsByAuthorId reaproveita a colecao combinada e pagina summaries', async () => {
    const result = await postsRead().getPostsByAuthorId('USER_01', { page: 1, limit: 10 }, buildDeps());

    expect(result).toHaveLength(2);
    expect(result.map((post) => post.id)).toEqual(['seed-1', 'seed-3']);
  });

  test('getTopContributors agrega score por autor e respeita filtro de modulo', async () => {
    const result = await postsRead().getTopContributors('month', 'moradia', 10, buildDeps());

    expect(result).toEqual([
      expect.objectContaining({
        user_id: 'USER_01',
        display_name: 'Ana Moradia',
        posts_count: 1,
        rank: 1,
      }),
    ]);
  });

  test('getTopContributors ignora posts fora do periodo', async () => {
    const result = await postsRead().getTopContributors('day', null, 10, buildDeps({
      getSearchCollection: async () => ([
        {
          id: 'fresh-post',
          module: 'moradia',
          authorId: 'USER_01',
          authorName: 'Ana Moradia',
          timestamp: 'ha 30 minutos',
          votos: 2,
        },
        {
          id: 'old-post',
          module: 'eventos',
          authorId: 'USER_02',
          authorName: 'Beto Eventos',
          timestamp: 'ha 2 dias',
          votos: 99,
        },
      ]),
    }));

    expect(result).toHaveLength(1);
    expect(result[0].user_id).toBe('USER_01');
  });
});

describe('local.posts-read.adapter.js - integracao com driver local', () => {
  test('driver delega getFeedCursor para o submodulo', async () => {
    const stub = {
      ...actualPostsReadModule,
      getFeedCursor: jest.fn().mockResolvedValue({ posts: [{ id: 'stub' }], nextCursor: 'abc', hasMore: true }),
    };
    window._KCLA.postsRead = stub;

    const result = await driver.getFeedCursor({ limit: 5 });

    expect(result).toEqual({ posts: [{ id: 'stub' }], nextCursor: 'abc', hasMore: true });
    expect(stub.getFeedCursor).toHaveBeenCalledWith({ limit: 5 }, expect.any(Object));
  });

  test('driver delega getPostById para o submodulo', async () => {
    const stub = {
      ...actualPostsReadModule,
      getPostById: jest.fn().mockResolvedValue({ id: 'post-1' }),
    };
    window._KCLA.postsRead = stub;

    await expect(driver.getPostById('post-1')).resolves.toEqual({ id: 'post-1' });
    expect(stub.getPostById).toHaveBeenCalledWith('post-1', expect.any(Object));
  });

  test('driver delega getTopContributors para o submodulo', async () => {
    const stub = {
      ...actualPostsReadModule,
      getTopContributors: jest.fn().mockResolvedValue([{ user_id: 'USER_01', rank: 1 }]),
    };
    window._KCLA.postsRead = stub;

    await expect(driver.getTopContributors('month', 'moradia', 10)).resolves.toEqual([{ user_id: 'USER_01', rank: 1 }]);
    expect(stub.getTopContributors).toHaveBeenCalledWith('month', 'moradia', 10, expect.any(Object));
  });

  test('driver retorna [] quando getPosts nao esta disponivel no submodulo', async () => {
    window._KCLA.postsRead = {};
    await expect(driver.getPosts({ page: 1 })).resolves.toEqual([]);
  });

  test('driver retorna envelope vazio quando getFeedCursor nao esta disponivel no submodulo', async () => {
    window._KCLA.postsRead = {};
    await expect(driver.getFeedCursor({ limit: 12 })).resolves.toEqual({
      posts: [],
      nextCursor: null,
      hasMore: false,
    });
  });

  test('driver retorna [] quando getTopContributors nao esta disponivel no submodulo', async () => {
    window._KCLA.postsRead = {};
    await expect(driver.getTopContributors('week', null, 5)).resolves.toEqual([]);
  });
});

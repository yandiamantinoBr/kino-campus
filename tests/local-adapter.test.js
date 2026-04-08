let localAdapter;

beforeAll(() => {
  global.window = global.window || global;

  // Mock localStorage
  const store = {};
  global.localStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };

  // Mock KC_ENV antes de carregar constants
  window.KC_ENV = { driver: 'local', environment: 'development' };
  require('../assets/js/kc-constants.js');
  require('../assets/js/kc-utils.js');
  window.KCSearchShared = require('../assets/js/kc-search.shared.js');

  // Mock KCAPI com interface minima antes de carregar o adapter
  window.KCAPI = window.KCAPI || {};
  window.KCAPI.registerAdapter = jest.fn();
  window.KCAPI.ENV = { driver: 'local' };
  window.KCAPI.config = { fallbackDatabaseURLs: [], baseURL: '' };
  window.KCAPI.fetchJSON = jest.fn().mockResolvedValue({ anuncios: [] });
  window.KCAPI.filterPosts = jest.fn((posts) => posts);
  window.KCAPI.normalizePost = jest.fn((p) => p);
  window.KCAPI.MOCK_USERS_LIST = [];
  window.KCAPI.MOCK_USERS_BY_ID = {};
  window.KCAPI.apiURL = jest.fn((path) => '/api/v1/' + path);
  window.KCAPI.VERSION = '9.0.0';
  window.KCAPI.DEFAULTS = { fallbackDatabaseURLs: [] };

  require('../assets/js/adapters/local.adapter.js');
});

describe('Local Adapter - Registro do driver', () => {
  test('registerAdapter foi chamado exatamente uma vez', () => {
    expect(window.KCAPI.registerAdapter).toHaveBeenCalledTimes(1);
  });

  test('registerAdapter foi chamado com nome "local"', () => {
    expect(window.KCAPI.registerAdapter).toHaveBeenCalledWith(
      'local',
      expect.any(Object)
    );
  });

  test('objeto do driver contem a propriedade name = "local"', () => {
    const driverObj = window.KCAPI.registerAdapter.mock.calls[0][1];
    expect(driverObj.name).toBe('local');
  });

  test('driver expoe todas as funcoes obrigatorias da interface', () => {
    const driverObj = window.KCAPI.registerAdapter.mock.calls[0][1];
    const requiredMethods = [
      'getPosts',
      'searchPosts',
      'getFeedCursor',
      'getUserRatingSummary',
      'getUserRatingState',
      'listUserRatings',
      'upsertUserRating',
      'getPostById',
      'getRelatedPosts',
      'createPost',
      'reportPost',
      'getComments',
      'addComment',
      'likeComment',
      'votePost',
      'getMyVote',
      'createHelpRequest',
      'listAdminHelpRequests',
      'updateAdminHelpRequest',
    ];
    requiredMethods.forEach((method) => {
      expect(typeof driverObj[method]).toBe('function');
    });
  });

  test('driver e um objeto congelado (Object.freeze)', () => {
    const driverObj = window.KCAPI.registerAdapter.mock.calls[0][1];
    expect(Object.isFrozen(driverObj)).toBe(true);
  });
});

describe('Local Adapter - Stubs retornam valores seguros', () => {
  let driver;

  beforeAll(() => {
    driver = window.KCAPI.registerAdapter.mock.calls[0][1];
  });

  test('reportPost retorna objeto com ok=false', async () => {
    const result = await driver.reportPost();
    expect(result).toEqual(expect.objectContaining({ ok: false }));
  });

  test('votePost retorna null', async () => {
    const result = await driver.votePost();
    expect(result).toBeNull();
  });

  test('togglePostStatus retorna indisponivel no modo local', async () => {
    const result = await driver.togglePostStatus();
    expect(result.code).toBe('UNAVAILABLE');
  });

  test('getTopContributors retorna array vazio', async () => {
    window.KCAPI.config.fallbackDatabaseURLs = ['/fake-db.json'];
    window.KCAPI.DEFAULTS.fallbackDatabaseURLs = ['/fake-db.json'];
    window.KCAPI.fetchJSON.mockResolvedValue({ anuncios: [] });
    const result = await driver.getTopContributors();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

describe('Local Adapter - getTopContributors', () => {
  let driver;

  beforeAll(() => {
    driver = window.KCAPI.registerAdapter.mock.calls[0][1];
  });

  beforeEach(() => {
    global.localStorage.clear();
    window.KCAPI.config.fallbackDatabaseURLs = ['/fake-db.json'];
    window.KCAPI.DEFAULTS.fallbackDatabaseURLs = ['/fake-db.json'];
    window.KCAPI.fetchJSON.mockResolvedValue({
      anuncios: [
        {
          id: 'm-1',
          module: 'moradia',
          author: 'Ana Moradia',
          authorAvatar: 'https://example.com/ana.png',
          votos: 2,
          comentarios: 1,
          created_at: '2026-04-07T10:00:00Z',
        },
        {
          id: 'm-2',
          module: 'moradia',
          author: 'Ana Moradia',
          authorAvatar: 'https://example.com/ana.png',
          votos: 1,
          comentarios: 0,
          created_at: '2026-04-07T12:00:00Z',
        },
        {
          id: 'e-1',
          module: 'eventos',
          author: 'Bruno Eventos',
          authorAvatar: 'https://example.com/bruno.png',
          votos: 5,
          comentarios: 2,
          created_at: '2026-04-07T09:00:00Z',
        },
      ]
    });
  });

  test('ranqueia contribuidores e respeita o filtro de módulo', async () => {
    const result = await driver.getTopContributors('month', 'moradia', 10);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      display_name: 'Ana Moradia',
      posts_count: 2,
      votes_received: 3,
      comments_count: 1,
      score: 65,
      rank: 1,
    }));
  });
});

describe('Local Adapter - getFeedCursor', () => {
  let driver;

  beforeAll(() => {
    driver = window.KCAPI.registerAdapter.mock.calls[0][1];
  });

  beforeEach(() => {
    global.localStorage.clear();
    window.KCAPI.config.fallbackDatabaseURLs = ['/fake-db.json'];
    window.KCAPI.DEFAULTS.fallbackDatabaseURLs = ['/fake-db.json'];
    window.KCAPI.fetchJSON.mockResolvedValue({
      anuncios: [
        { id: '1', title: 'A', description: 'alpha', module: 'eventos', category: 'academicos', created_at: '2026-04-05T10:00:00Z' },
        { id: '2', title: 'B', description: 'beta', module: 'eventos', category: 'academicos', created_at: '2026-04-05T09:00:00Z' },
        { id: '3', title: 'C', description: 'gamma', module: 'eventos', category: 'academicos', created_at: '2026-04-05T08:00:00Z' },
      ]
    });
    window.KCAPI.filterPosts.mockImplementation((posts, params) => {
      const moduleFilter = Array.isArray(params && params.module)
        ? params.module.map((value) => String(value).toLowerCase())
        : [String((params && params.module) || '').toLowerCase()].filter(Boolean);
      return (posts || []).filter((post) => {
        if (!moduleFilter.length) return true;
        return moduleFilter.includes(String(post.module || post.modulo || '').toLowerCase());
      });
    });
  });

  test('retorna envelope com posts, nextCursor e hasMore', async () => {
    const first = await driver.getFeedCursor({ module: 'eventos', limit: 2 });

    expect(first.posts).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(typeof first.nextCursor).toBe('string');

    const second = await driver.getFeedCursor({ module: 'eventos', limit: 2, cursor: first.nextCursor });

    expect(second.posts).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();
  });

  test('aceita filtro com múltiplos módulos via array', async () => {
    window.KCAPI.fetchJSON.mockResolvedValue({
      anuncios: [
        { id: '1', title: 'A', description: 'alpha', module: 'compra-venda' },
        { id: '2', title: 'B', description: 'beta', module: 'livros' },
        { id: '3', title: 'C', description: 'gamma', module: 'eventos' },
      ]
    });

    const result = await driver.getFeedCursor({ module: ['compra-venda', 'livros'], limit: 10 });

    expect(result.posts.map((post) => post.id)).toEqual(['1', '2']);
    expect(result.hasMore).toBe(false);
  });

  test('encaminha filtros avancados para o filtro local compartilhado', async () => {
    window.KCAPI.fetchJSON.mockResolvedValue({
      anuncios: [
        { id: '1', title: 'Vaga remota', description: 'Tecnologia', module: 'oportunidades' },
      ]
    });

    await driver.getFeedCursor({
      module: 'oportunidades',
      oppArea: 'tecnologia',
      oppMode: ['remoto'],
      datePreset: 'last7d',
      limit: 12,
    });

    expect(window.KCAPI.filterPosts).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        module: 'oportunidades',
        oppArea: 'tecnologia',
        oppMode: ['remoto'],
        datePreset: 'last7d',
      })
    );
  });
});

describe('Local Adapter - searchPosts', () => {
  let driver;

  beforeAll(() => {
    driver = window.KCAPI.registerAdapter.mock.calls[0][1];
  });

  beforeEach(() => {
    global.localStorage.clear();
    window.KCAPI.fetchJSON.mockResolvedValue({
      anuncios: [
        {
          id: '1',
          title: 'Notebook Dell Inspiron',
          description: 'Usado em otimo estado',
          module: 'compra-venda',
          category: 'eletronicos',
          metadata: { subcategoria: 'informatica', tags: ['notebook', 'dell'] },
          created_at: '2026-04-05T10:00:00Z',
        },
        {
          id: '2',
          title: 'Mochila executiva',
          description: 'Cabe notebook e carregador',
          module: 'compra-venda',
          category: 'acessorios',
          metadata: { subcategoria: 'transporte', tags: ['mochila'] },
          created_at: '2026-04-05T09:00:00Z',
        },
        {
          id: '3',
          title: 'Grupo de estudos',
          description: 'Aulas de Matematica aplicada',
          module: 'oportunidades',
          category: 'estudos',
          metadata: { subcategoria: 'Matematica', tags: ['calculo'] },
          created_at: '2026-04-05T08:00:00Z',
        },
      ]
    });
    window.KCAPI.filterPosts.mockImplementation((posts) => posts);
  });

  test('prioriza match no titulo sobre match apenas na descricao', async () => {
    const result = await driver.searchPosts({ q: 'notebook', limit: 10 });

    expect(result.map((post) => post.id)).toEqual(['1', '2']);
  });

  test('encontra resultado por sinonimo expandido', async () => {
    const result = await driver.searchPosts({ q: 'laptop', limit: 10 });

    expect(result.map((post) => post.id)).toContain('1');
  });

  test('encontra resultado por categoria ou subcategoria sem acento', async () => {
    const result = await driver.searchPosts({ q: 'matematica', limit: 10 });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });

  test('aplica filtro de modulo no caminho compartilhado', async () => {
    const result = await driver.searchPosts({ q: 'matematica', module: 'compra-venda', limit: 10 });

    expect(result).toEqual([]);
  });
});

describe('Local Adapter - user ratings', () => {
  let driver;

  beforeAll(() => {
    driver = window.KCAPI.registerAdapter.mock.calls[0][1];
  });

  beforeEach(() => {
    global.localStorage.clear();
    window.KCAPI.fetchJSON.mockResolvedValue({
      anuncios: [
        {
          id: 'post-1',
          uuid: 'post-1',
          title: 'Notebook do João',
          module: 'compra-venda',
          authorId: 'USER_01',
          author_id: 'USER_01',
          created_at: '2026-04-05T10:00:00Z',
        },
      ],
    });
  });

  test('retorna resumo vazio quando não há avaliações salvas', async () => {
    await expect(driver.getUserRatingSummary('USER_01')).resolves.toEqual({
      userId: 'USER_01',
      average: null,
      count: 0,
    });
  });

  test('permite upsert após interação persistida e atualiza resumo', async () => {
    global.localStorage.setItem('kc_user_rating_interactions', JSON.stringify([
      { targetUserId: 'USER_01', contextPostId: 'post-1', type: 'comment' },
    ]));

    const result = await driver.upsertUserRating({
      targetUserId: 'USER_01',
      contextPostId: 'post-1',
      rating: 5,
      comment: 'Ótima interação',
    });

    expect(result.ok).toBe(true);
    expect(result.summary).toEqual({
      userId: 'USER_01',
      average: 5,
      count: 1,
    });

    const list = await driver.listUserRatings('USER_01', { page: 1, limit: 10 });
    expect(list.items).toHaveLength(1);
    expect(list.items[0].comment).toBe('Ótima interação');
  });

  test('bloqueia avaliação sem interação persistida', async () => {
    const result = await driver.upsertUserRating({
      targetUserId: 'USER_01',
      contextPostId: 'post-1',
      rating: 4,
      comment: 'Sem interação',
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('NO_INTERACTION');
  });
});

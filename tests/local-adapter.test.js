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
  require('../assets/js/kc-utils.string.js'); // deve preceder kc-utils.js (v12.2.0)
  require('../assets/js/kc-utils.format.js'); // deve preceder kc-utils.js (v12.2.1)
  require('../assets/js/kc-utils.dom.js'); // deve preceder kc-utils.js (v12.2.2)
  require('../assets/js/kc-utils.identity.js'); // deve preceder kc-utils.js (v12.2.3)
  require('../assets/js/kc-utils.taxonomy.js'); // deve preceder kc-utils.js (v12.2.4)
  require('../assets/js/kc-utils.location.js'); // deve preceder kc-utils.js (v12.2.5)
  require('../assets/js/kc-utils.presentation.js'); // deve preceder kc-utils.js (v12.2.6)
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

  require('../assets/js/adapters/local.notifications.adapter.js');
  require('../assets/js/adapters/local.ratings.adapter.js');
  require('../assets/js/adapters/local.saved.adapter.js');
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
      'updatePost',
      'deletePost',
      'reportPost',
      'getComments',
      'addComment',
      'likeComment',
      'votePost',
      'getMyVote',
      'getMyProfile',
      'updateMyProfile',
      'uploadProfileAvatar',
      'getMyPosts',
      'getPostsByAuthorId',
      'getSavedPostState',
      'setSavedPostState',
      'clearSavedPostState',
      'getMySavedPosts',
      'getMySavedPostsCount',
      'getProfileHighlights',
      'getProfileHighlightsCount',
      'createHelpRequest',
      'listAdminHelpRequests',
      'updateAdminHelpRequest',
      'getNotificationPreferences',
      'updateNotificationPreferences',
      'getNotificationChannelTargets',
      'updateNotificationChannelTargets',
      'getNotifications',
      'markNotificationsRead',
      'markAllNotificationsRead',
      'clearNotifications',
      'getUnreadNotificationCount',
      'subscribeNotifications',
      'unsubscribeNotifications',
      'inviteExternalUser',
      'getInvites',
      'revokeInvite',
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

describe('Local Adapter - Paridade moderna do driver local', () => {
  let driver;

  beforeAll(() => {
    driver = window.KCAPI.registerAdapter.mock.calls[0][1];
  });

  beforeEach(() => {
    global.localStorage.clear();
    window.KCAPI.config.fallbackDatabaseURLs = ['/fake-db.json'];
    window.KCAPI.DEFAULTS.fallbackDatabaseURLs = ['/fake-db.json'];
    window.KCAPI.fetchJSON.mockResolvedValue({ anuncios: [] });
  });

  test('getMyProfile e updateMyProfile persistem perfil localmente', async () => {
    const initial = await driver.getMyProfile();
    expect(initial).toEqual(expect.objectContaining({ id: 'USER_SELF' }));

    const result = await driver.updateMyProfile({
      display_name: 'Perfil Teste',
      bio: 'Bio local',
      avatar_url: 'data:image/png;base64,abc123',
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({
      id: 'USER_SELF',
      display_name: 'Perfil Teste',
      bio: 'Bio local',
      avatar_url: 'data:image/png;base64,abc123',
    }));

    await expect(driver.getMyProfile()).resolves.toEqual(expect.objectContaining({
      display_name: 'Perfil Teste',
      bio: 'Bio local',
    }));
  });

  test('createPost persiste payload local com categoria e subcategoria normalizadas', async () => {
    const created = await driver.createPost({
      title: 'Ingresso Calourada',
      description: 'Ingresso de teste',
      modulo: 'compra-venda',
      category: 'Ingressos',
      subcategory: 'vendo',
      price: '25',
    });

    expect(created).toEqual(expect.objectContaining({
      title: 'Ingresso Calourada',
      modulo: 'compra-venda',
      categoria: 'ingressos',
      categoriaKey: 'ingressos',
      subcategoriaKey: 'ingressos',
      authorId: 'USER_SELF',
      metadata: expect.objectContaining({
        categoriaKey: 'ingressos',
        subcategory: 'ingressos',
        subcategoryKey: 'ingressos',
      }),
    }));
    expect(created.id).toBeTruthy();
    expect(created.created_at || created.createdAt).toBeTruthy();
    expect(created.autor).toBeTruthy();

    const stored = JSON.parse(global.localStorage.getItem('kc_user_posts') || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toEqual(expect.objectContaining({
      title: 'Ingresso Calourada',
      modulo: 'compra-venda',
      categoria: 'ingressos',
      categoriaKey: 'ingressos',
      subcategoriaKey: 'ingressos',
      authorId: 'USER_SELF',
      metadata: expect.objectContaining({
        categoriaKey: 'ingressos',
        subcategory: 'ingressos',
        subcategoryKey: 'ingressos',
      }),
    }));
  });

  test('updatePost, getMyPosts e deletePost mantem consistencia em kc_user_posts', async () => {
    global.localStorage.setItem('kc_user_posts', JSON.stringify([
      {
        id: 'local-post-1',
        title: 'Antes',
        description: 'Descricao original',
        module: 'moradia',
        category: 'republica',
        authorId: 'USER_SELF',
        created_at: '2026-04-07T10:00:00Z',
        status: 'published',
      },
    ]));

    const updateResult = await driver.updatePost('local-post-1', {
      title: 'Depois',
      description: 'Descricao atualizada',
    });

    expect(updateResult).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({ title: 'Depois' }),
    }));

    const myPosts = await driver.getMyPosts({ page: 1, limit: 10 });
    expect(myPosts).toHaveLength(1);
    expect(myPosts[0]).toEqual(expect.objectContaining({
      id: 'local-post-1',
      title: 'Depois',
      module: 'moradia',
    }));

    const deleteResult = await driver.deletePost('local-post-1');
    expect(deleteResult).toEqual(expect.objectContaining({ ok: true }));
    await expect(driver.getMyPosts({ page: 1, limit: 10 })).resolves.toEqual([]);
  });

  test('setSavedPostState agrega tipos por post e alimenta listas/counts locais', async () => {
    global.localStorage.setItem('kc_user_posts', JSON.stringify([
      {
        id: 'saved-post-1',
        title: 'Post salvo',
        module: 'moradia',
        category: 'quarto',
        authorId: 'USER_SELF',
        created_at: '2026-04-07T10:00:00Z',
        status: 'published',
      },
    ]));

    await expect(driver.setSavedPostState('saved-post-1', 'favorite', true)).resolves.toEqual(expect.objectContaining({ ok: true }));
    await expect(driver.setSavedPostState('saved-post-1', 'highlight', true)).resolves.toEqual(expect.objectContaining({ ok: true }));

    const state = await driver.getSavedPostState('saved-post-1');
    expect(state.kinds.sort()).toEqual(['favorite', 'highlight']);

    const saved = await driver.getMySavedPosts({ page: 1, limit: 10 });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toEqual(expect.objectContaining({
      id: 'saved-post-1',
      save_kinds: expect.arrayContaining(['favorite', 'highlight']),
    }));

    await expect(driver.getMySavedPostsCount({})).resolves.toBe(1);
    await expect(driver.getProfileHighlightsCount('USER_SELF')).resolves.toBe(1);
    await expect(driver.getProfileHighlightsCount('USER_SELF', { page: 2, limit: 1, kind: 'favorite' })).resolves.toBe(1);

    await expect(driver.clearSavedPostState('saved-post-1', 'favorite')).resolves.toEqual(expect.objectContaining({
      ok: true,
      cleared: 'favorite',
    }));
    await expect(driver.getSavedPostState('saved-post-1')).resolves.toEqual({ kinds: ['highlight'] });
  });

  test('getPostsByAuthorId reaproveita a colecao local sem depender do Supabase', async () => {
    window.KCAPI.fetchJSON.mockResolvedValue({
      anuncios: [
        {
          id: 'seed-1',
          title: 'Seed publico',
          module: 'eventos',
          category: 'academicos',
          authorId: 'USER_01',
          status: 'published',
          created_at: '2026-04-07T08:00:00Z',
        },
        {
          id: 'seed-2',
          title: 'Seed oculto',
          module: 'eventos',
          category: 'academicos',
          authorId: 'USER_01',
          status: 'hidden',
          created_at: '2026-04-06T08:00:00Z',
        },
      ],
    });

    const posts = await driver.getPostsByAuthorId('USER_01', { page: 1, limit: 10 });
    expect(posts).toHaveLength(1);
    expect(posts[0]).toEqual(expect.objectContaining({
      id: 'seed-1',
      title: 'Seed publico',
    }));
  });

  test('notificacoes e convites retornam shapes seguros no modo local', async () => {
    await expect(driver.getNotificationPreferences()).resolves.toEqual({
      comment_on_post: { in_app: true, email: false, whatsapp: false },
      comment_reply: { in_app: true, email: false, whatsapp: false },
      vote_on_post: { in_app: true, email: false, whatsapp: false },
      post_expired: { in_app: true, email: false, whatsapp: false },
      post_reported: { in_app: true, email: false, whatsapp: false },
      system: { in_app: true, email: false, whatsapp: false },
    });
    await expect(driver.getNotificationChannelTargets()).resolves.toEqual({
      whatsapp: {
        channel: 'whatsapp',
        destination: '',
        country_code: '55',
        local_number: '',
        consent_granted: false,
        consent_at: null,
        configured: false,
        ready: false,
        display: '',
        metadata: { country_code: '55' },
      },
    });
    await expect(driver.updateNotificationPreferences({
      comment_on_post: { in_app: false, email: true },
      system: { whatsapp: true },
    })).resolves.toEqual({
      ok: true,
      data: {
        preferences: {
          comment_on_post: { in_app: false, email: true, whatsapp: false },
          comment_reply: { in_app: true, email: false, whatsapp: false },
          vote_on_post: { in_app: true, email: false, whatsapp: false },
          post_expired: { in_app: true, email: false, whatsapp: false },
          post_reported: { in_app: true, email: false, whatsapp: false },
          system: { in_app: true, email: false, whatsapp: true },
        },
      },
    });
    await expect(driver.updateNotificationChannelTargets({
      whatsapp: {
        country_code: '55',
        local_number: '(62) 99876-5432',
        consent_granted: true,
      },
    })).resolves.toEqual({
      ok: true,
      data: {
        targets: {
          whatsapp: {
            channel: 'whatsapp',
            destination: '+5562998765432',
            country_code: '55',
            local_number: '62998765432',
            consent_granted: true,
            consent_at: null,
            configured: true,
            ready: true,
            display: '+55 (62) 99876-5432',
            metadata: { country_code: '55' },
          },
        },
      },
    });
    await expect(driver.getNotificationPreferences()).resolves.toEqual({
      comment_on_post: { in_app: false, email: true, whatsapp: false },
      comment_reply: { in_app: true, email: false, whatsapp: false },
      vote_on_post: { in_app: true, email: false, whatsapp: false },
      post_expired: { in_app: true, email: false, whatsapp: false },
      post_reported: { in_app: true, email: false, whatsapp: false },
      system: { in_app: true, email: false, whatsapp: true },
    });
    await expect(driver.getNotificationChannelTargets()).resolves.toEqual({
      whatsapp: {
        channel: 'whatsapp',
        destination: '+5562998765432',
        country_code: '55',
        local_number: '62998765432',
        consent_granted: true,
        consent_at: null,
        configured: true,
        ready: true,
        display: '+55 (62) 99876-5432',
        metadata: { country_code: '55' },
      },
    });
    await expect(driver.getNotifications()).resolves.toEqual({
      ok: true,
      notifications: [],
      unread: 0,
      total: 0,
    });
    await expect(driver.markNotificationsRead(['n-1'])).resolves.toEqual({ ok: true });
    await expect(driver.markAllNotificationsRead()).resolves.toEqual({ ok: true });
    await expect(driver.clearNotifications()).resolves.toEqual({ ok: true, deleted: 0 });
    await expect(driver.getUnreadNotificationCount()).resolves.toBe(0);
    expect(driver.subscribeNotifications('USER_SELF', jest.fn())).toBeNull();
    expect(() => driver.unsubscribeNotifications(null)).not.toThrow();
    await expect(driver.getInvites()).resolves.toEqual({ data: [], error: null });
    await expect(driver.inviteExternalUser('a@b.com')).resolves.toEqual({ ok: false, error: 'DRIVER_NAO_SUPORTA' });
    await expect(driver.revokeInvite('a@b.com')).resolves.toEqual({ ok: false, error: 'DRIVER_NAO_SUPORTA' });
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

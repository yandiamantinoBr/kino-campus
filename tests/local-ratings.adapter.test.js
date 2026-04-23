'use strict';

let driver;
let store;
let actualRatingsModule;

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
    VERSION: '12.4.2',
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


  actualRatingsModule = window._KCLA.ratings;
  driver = window.KCAPI.registerAdapter.mock.calls[0][1];
});

beforeEach(() => {
  global.localStorage.clear();
  window._KCLA.ratings = actualRatingsModule;
  window.KCAPI.MOCK_USERS_BY_ID = {
    USER_SELF: {
      id: 'USER_SELF',
      displayName: 'Voce Teste',
      avatarUrl: 'https://example.com/self.png',
    },
  };
});

const ratings = () => window._KCLA.ratings;

function buildDeps(overrides = {}) {
  const base = {
    viewerId: 'USER_SELF',
    normalizePost: (post) => (post && typeof post === 'object' ? { ...post } : post),
    getSearchCollection: async () => ([
      {
        id: 'post-1',
        uuid: 'post-1',
        authorId: 'USER_01',
        author_id: 'USER_01',
        title: 'Notebook do Joao',
        authorProfile: { id: 'USER_01' },
      },
      {
        id: 'post-2',
        uuid: 'post-2',
        authorId: 'USER_02',
        author_id: 'USER_02',
        title: 'Livro de Algebra',
        authorProfile: { id: 'USER_02' },
      },
    ]),
    mockUsersById: {
      USER_SELF: {
        id: 'USER_SELF',
        displayName: 'Voce Teste',
        avatarUrl: 'https://example.com/self.png',
      },
      USER_01: {
        id: 'USER_01',
        displayName: 'Joao',
        avatarUrl: 'https://example.com/joao.png',
      },
    },
  };
  return { ...base, ...overrides };
}

describe('local.ratings.adapter.js - contrato estatico', () => {
  test('registra window._KCLA.ratings como objeto frozen', () => {
    expect(window._KCLA).toBeDefined();
    expect(ratings()).toBeDefined();
    expect(Object.isFrozen(ratings())).toBe(true);
  });

  test('expoe exatamente 6 chaves publicas', () => {
    expect(Object.keys(ratings()).sort()).toEqual([
      'enrichPostWithRatings',
      'enrichPostsWithRatings',
      'getUserRatingState',
      'getUserRatingSummary',
      'listUserRatings',
      'upsertUserRating',
    ]);
  });

  test('helpers internos nao ficam expostos', () => {
    expect(ratings().normalizeRatingEntry).toBeUndefined();
    expect(ratings().buildRatingSummary).toBeUndefined();
    expect(ratings().resolveRatingEligibility).toBeUndefined();
  });
});

describe('local.ratings.adapter.js - resumo e enrich', () => {
  test('getUserRatingSummary retorna shape vazio quando storage esta vazio', async () => {
    await expect(ratings().getUserRatingSummary('USER_01', buildDeps())).resolves.toEqual({
      userId: 'USER_01',
      average: null,
      count: 0,
    });
  });

  test('getUserRatingSummary agrega media e contagem por usuario alvo', async () => {
    global.localStorage.setItem('kc_user_ratings', JSON.stringify([
      { id: 'r1', targetUserId: 'USER_01', raterUserId: 'USER_A', rating: 5, createdAt: '2026-04-10T10:00:00Z' },
      { id: 'r2', targetUserId: 'USER_01', raterUserId: 'USER_B', rating: 4, createdAt: '2026-04-11T10:00:00Z' },
      { id: 'r3', targetUserId: 'USER_02', raterUserId: 'USER_C', rating: 1, createdAt: '2026-04-12T10:00:00Z' },
    ]));

    await expect(ratings().getUserRatingSummary('USER_01', buildDeps())).resolves.toEqual({
      userId: 'USER_01',
      average: 4.5,
      count: 2,
    });
  });

  test('enrichPostWithRatings injeta rating no post e authorProfile', () => {
    const result = ratings().enrichPostWithRatings({
      id: 'post-1',
      authorId: 'USER_01',
      authorProfile: { id: 'USER_01' },
    }, [
      { id: 'r1', targetUserId: 'USER_01', raterUserId: 'USER_A', rating: 5, reviewer: { id: 'USER_A' } },
      { id: 'r2', targetUserId: 'USER_01', raterUserId: 'USER_B', rating: 3, reviewer: { id: 'USER_B' } },
    ], buildDeps());

    expect(result).toEqual(expect.objectContaining({
      rating: 4,
      ratingCount: 2,
      rating_count: 2,
      authorProfile: expect.objectContaining({
        rating_avg: 4,
        rating_count: 2,
        ratingAvg: 4,
        ratingCount: 2,
      }),
    }));
  });

  test('enrichPostsWithRatings retorna lista vazia para entradas invalidas', () => {
    expect(ratings().enrichPostsWithRatings(null, buildDeps())).toEqual([]);
  });

  test('enrichPostsWithRatings aplica o resumo em todos os posts da lista', () => {
    global.localStorage.setItem('kc_user_ratings', JSON.stringify([
      { id: 'r1', targetUserId: 'USER_01', raterUserId: 'USER_A', rating: 5, createdAt: '2026-04-10T10:00:00Z' },
    ]));

    const result = ratings().enrichPostsWithRatings([
      { id: 'post-1', authorId: 'USER_01' },
      { id: 'post-2', authorId: 'USER_02' },
    ], buildDeps());

    expect(result[0]).toEqual(expect.objectContaining({ rating: 5, ratingCount: 1 }));
    expect(result[1]).toEqual(expect.objectContaining({ rating: null, ratingCount: 0 }));
  });
});

describe('local.ratings.adapter.js - gate e estado', () => {
  test('getUserRatingState retorna myRating quando o viewer ja avaliou o alvo', async () => {
    global.localStorage.setItem('kc_user_ratings', JSON.stringify([
      {
        id: 'r1',
        targetUserId: 'USER_01',
        raterUserId: 'USER_SELF',
        rating: 5,
        comment: 'Muito bom',
        createdAt: '2026-04-10T10:00:00Z',
        reviewer: { id: 'USER_SELF', displayName: 'Voce Teste' },
      },
    ]));

    const result = await ratings().getUserRatingState({ targetUserId: 'USER_01' }, buildDeps());

    expect(result).toEqual(expect.objectContaining({
      targetUserId: 'USER_01',
      canRate: true,
      reason: 'OK',
      myRating: expect.objectContaining({ id: 'r1', rating: 5 }),
    }));
  });

  test('getUserRatingState bloqueia autoavaliacao', async () => {
    const result = await ratings().getUserRatingState({ targetUserId: 'USER_SELF' }, buildDeps());

    expect(result).toEqual({
      targetUserId: 'USER_SELF',
      contextPostId: null,
      canRate: false,
      reason: 'SELF',
      myRating: null,
    });
  });

  test('getUserRatingState retorna INVALID_CONTEXT quando o post nao pertence ao alvo', async () => {
    const result = await ratings().getUserRatingState({
      targetUserId: 'USER_01',
      contextPostId: 'post-inexistente',
    }, buildDeps());

    expect(result.reason).toBe('INVALID_CONTEXT');
    expect(result.canRate).toBe(false);
  });

  test('getUserRatingState libera avaliacao via comentario local no post', async () => {
    global.localStorage.setItem('kc_comments_post-1', JSON.stringify([{ id: 'c1', text: 'oi' }]));

    const result = await ratings().getUserRatingState({
      targetUserId: 'USER_01',
      contextPostId: 'post-1',
    }, buildDeps());

    expect(result.reason).toBe('OK');
    expect(result.canRate).toBe(true);
  });

  test('getUserRatingState libera avaliacao via interaction hint persistido', async () => {
    global.localStorage.setItem('kc_user_rating_interactions', JSON.stringify([
      { targetUserId: 'USER_01', contextPostId: 'post-1', type: 'comment' },
    ]));

    const result = await ratings().getUserRatingState({
      targetUserId: 'USER_01',
      contextPostId: 'post-1',
    }, buildDeps());

    expect(result.reason).toBe('OK');
    expect(result.canRate).toBe(true);
  });

  test('getUserRatingState retorna NO_INTERACTION sem comentario nem hint', async () => {
    const result = await ratings().getUserRatingState({
      targetUserId: 'USER_01',
      contextPostId: 'post-1',
    }, buildDeps());

    expect(result.reason).toBe('NO_INTERACTION');
    expect(result.canRate).toBe(false);
  });
});

describe('local.ratings.adapter.js - upsert e listagem', () => {
  test('upsertUserRating valida usuario alvo obrigatorio', async () => {
    const result = await ratings().upsertUserRating({ rating: 5 }, buildDeps());

    expect(result.ok).toBe(false);
    expect(result.error.message).toBe('UsuÃ¡rio alvo invÃ¡lido.');
  });

  test('upsertUserRating valida range da nota', async () => {
    const result = await ratings().upsertUserRating({
      targetUserId: 'USER_01',
      rating: 7,
    }, buildDeps());

    expect(result.ok).toBe(false);
    expect(result.error.message).toBe('A nota deve estar entre 1 e 5 estrelas.');
  });

  test('upsertUserRating valida limite de comentario', async () => {
    const result = await ratings().upsertUserRating({
      targetUserId: 'USER_01',
      rating: 4,
      comment: 'a'.repeat(281),
    }, buildDeps());

    expect(result.ok).toBe(false);
    expect(result.error.message).toBe('O comentÃ¡rio aceita no mÃ¡ximo 280 caracteres.');
  });

  test('upsertUserRating persiste rating e atualiza resumo quando o gate permite', async () => {
    global.localStorage.setItem('kc_user_rating_interactions', JSON.stringify([
      { targetUserId: 'USER_01', contextPostId: 'post-1', type: 'comment' },
    ]));

    const result = await ratings().upsertUserRating({
      targetUserId: 'USER_01',
      contextPostId: 'post-1',
      rating: 5,
      comment: 'Excelente',
    }, buildDeps());

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      summary: { userId: 'USER_01', average: 5, count: 1 },
      rating: expect.objectContaining({
        targetUserId: 'USER_01',
        raterUserId: 'USER_SELF',
        comment: 'Excelente',
        reviewer: expect.objectContaining({
          id: 'USER_SELF',
          displayName: 'Voce Teste',
        }),
      }),
    }));

    expect(JSON.parse(store.kc_user_ratings)).toHaveLength(1);
  });

  test('upsertUserRating atualiza a mesma avaliacao em vez de duplicar', async () => {
    global.localStorage.setItem('kc_user_rating_interactions', JSON.stringify([
      { targetUserId: 'USER_01', contextPostId: 'post-1', type: 'comment' },
    ]));

    await ratings().upsertUserRating({
      targetUserId: 'USER_01',
      contextPostId: 'post-1',
      rating: 5,
      comment: 'Primeira',
    }, buildDeps());

    const result = await ratings().upsertUserRating({
      targetUserId: 'USER_01',
      contextPostId: 'post-1',
      rating: 4,
      comment: 'Atualizada',
    }, buildDeps());

    const saved = JSON.parse(store.kc_user_ratings);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toEqual(expect.objectContaining({ rating: 4, comment: 'Atualizada' }));
    expect(result.summary).toEqual({ userId: 'USER_01', average: 4, count: 1 });
  });

  test('listUserRatings pagina e ordena do mais recente para o mais antigo', async () => {
    global.localStorage.setItem('kc_user_ratings', JSON.stringify([
      { id: 'r1', targetUserId: 'USER_01', raterUserId: 'USER_A', rating: 5, createdAt: '2026-04-10T10:00:00Z' },
      { id: 'r2', targetUserId: 'USER_01', raterUserId: 'USER_B', rating: 4, createdAt: '2026-04-12T10:00:00Z' },
      { id: 'r3', targetUserId: 'USER_01', raterUserId: 'USER_C', rating: 3, createdAt: '2026-04-11T10:00:00Z' },
    ]));

    const page1 = await ratings().listUserRatings('USER_01', { page: 1, limit: 2 }, buildDeps());
    const page2 = await ratings().listUserRatings('USER_01', { page: 2, limit: 2 }, buildDeps());

    expect(page1.items.map((item) => item.id)).toEqual(['r2', 'r3']);
    expect(page1.hasMore).toBe(true);
    expect(page2.items.map((item) => item.id)).toEqual(['r1']);
    expect(page2.hasMore).toBe(false);
  });
});

describe('driver local - delegacao para window._KCLA.ratings', () => {
  test('driver delega getUserRatingSummary para o submodulo ativo', async () => {
    const mockModule = {
      ...actualRatingsModule,
      getUserRatingSummary: jest.fn().mockResolvedValue({ delegated: true }),
    };
    window._KCLA.ratings = mockModule;

    await expect(driver.getUserRatingSummary('USER_01')).resolves.toEqual({ delegated: true });
    expect(mockModule.getUserRatingSummary).toHaveBeenCalledWith(
      'USER_01',
      expect.objectContaining({
        viewerId: 'USER_SELF',
        normalizePost: expect.any(Function),
        getSearchCollection: expect.any(Function),
      })
    );
  });

  test('driver delega upsertUserRating preservando payload e deps', async () => {
    const payload = { targetUserId: 'USER_01', rating: 5 };
    const mockModule = {
      ...actualRatingsModule,
      upsertUserRating: jest.fn().mockResolvedValue({ ok: true }),
    };
    window._KCLA.ratings = mockModule;

    await expect(driver.upsertUserRating(payload)).resolves.toEqual({ ok: true });
    expect(mockModule.upsertUserRating).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({
        viewerId: 'USER_SELF',
        normalizePost: expect.any(Function),
        getSearchCollection: expect.any(Function),
      })
    );
  });

  test('driver retorna fallbacks seguros quando o submodulo nao esta carregado', async () => {
    window._KCLA.ratings = {};

    await expect(driver.getUserRatingSummary('USER_01')).resolves.toEqual({
      userId: 'USER_01',
      average: null,
      count: 0,
    });
    await expect(driver.listUserRatings('USER_01', { page: 1, limit: 10 })).resolves.toEqual({
      items: [],
      page: 1,
      limit: 10,
      total: 0,
      hasMore: false,
    });
    await expect(driver.upsertUserRating({ targetUserId: 'USER_01', rating: 5 })).resolves.toEqual({
      ok: false,
      error: { message: 'Avaliacoes locais indisponiveis.' },
    });
  });
});


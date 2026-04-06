beforeAll(() => {
  jest.resetModules();

  global.window = global.window || global;
  global.KCSupabase = {
    getClient: jest.fn(() => ({})),
    getFeedCursor: jest.fn(),
    searchPosts: jest.fn(),
  };
  window.KCSupabase = global.KCSupabase;
  window.KCAPI = {
    ENV: {
      driver: 'supabase',
      environment: 'development',
      isProduction: false,
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-key',
      supabase: { url: 'https://test.supabase.co', anonKey: 'test-key' },
    },
    normalizePost: jest.fn((post) => post),
    registerAdapter: jest.fn(),
    clearLastCreatePostError: jest.fn(),
    setLastCreatePostError: jest.fn(),
    getLastCreatePostError: jest.fn(),
    summarizeCreatePayloadForDiagnostics: jest.fn(() => ({})),
    rankRelatedPosts: jest.fn((currentPost, candidates) => candidates),
  };

  require('../assets/js/adapters/supabase.adapter.js');
});

describe('Supabase Adapter - getFeedCursor', () => {
  let driver;

  beforeAll(() => {
    driver = window.KCAPI.registerAdapter.mock.calls[0][1];
  });

  beforeEach(() => {
    window.KCSupabase.getFeedCursor.mockReset();
    window.KCSupabase.searchPosts.mockReset();
    window.KCAPI.normalizePost.mockImplementation((post) => post);
  });

  test('registra o driver com getFeedCursor disponível', () => {
    expect(window.KCAPI.registerAdapter).toHaveBeenCalledWith('supabase', expect.any(Object));
    expect(typeof driver.getFeedCursor).toBe('function');
  });

  test('normaliza posts do payload e preserva nextCursor/hasMore', async () => {
    window.KCSupabase.getFeedCursor.mockResolvedValue({
      posts: [
        {
          id: '9a7d0a6c-6351-4dd6-b104-b0f2b5df51d0',
          legacy_id: null,
          author_id: '58e99f2f-3ca2-4893-b879-4d1f456d9bf8',
          title: 'Evento de teste',
          description: 'Detalhes do evento',
          price: null,
          location: 'UFG',
          module: 'eventos',
          category: 'academicos',
          status: 'published',
          visibility: 'public',
          metadata: {},
          created_at: '2026-04-05T10:00:00Z',
          votos: 7,
          profiles: {
            id: '58e99f2f-3ca2-4893-b879-4d1f456d9bf8',
            display_name: 'Ana',
            full_name: 'Ana Teste',
            avatar_url: 'https://example.com/avatar.png',
            verified: true,
          },
          post_media: [],
          comments: [{ count: 3 }],
        },
      ],
      nextCursor: 'cursor_2',
      hasMore: true,
    });

    const result = await driver.getFeedCursor({ module: 'eventos', limit: 12 });

    expect(window.KCSupabase.getFeedCursor).toHaveBeenCalledWith({ module: 'eventos', limit: 12 });
    expect(result.nextCursor).toBe('cursor_2');
    expect(result.hasMore).toBe(true);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].title).toBe('Evento de teste');
    expect(result.posts[0].comentarios).toBe(3);
  });

  test('repassa filtros avancados para o client Supabase', async () => {
    window.KCSupabase.getFeedCursor.mockResolvedValue({
      posts: [],
      nextCursor: null,
      hasMore: false,
    });

    await driver.getFeedCursor({
      module: 'oportunidades',
      oppArea: 'tecnologia',
      oppMode: ['remoto'],
      limit: 12,
    });

    expect(window.KCSupabase.getFeedCursor).toHaveBeenCalledWith(expect.objectContaining({
      module: 'oportunidades',
      oppArea: 'tecnologia',
      oppMode: ['remoto'],
      limit: 12,
    }));
  });

  test('normaliza rows retornadas por searchPosts', async () => {
    window.KCSupabase.searchPosts.mockResolvedValue([
      {
        id: '9a7d0a6c-6351-4dd6-b104-b0f2b5df51d0',
        legacy_id: null,
        author_id: '58e99f2f-3ca2-4893-b879-4d1f456d9bf8',
        title: 'Notebook Dell',
        description: 'Seminovo',
        price: 2500,
        location: 'UFG',
        module: 'compra-venda',
        category: 'eletronicos',
        status: 'published',
        visibility: 'public',
        metadata: { subcategoria: 'informatica', tags: ['notebook'] },
        created_at: '2026-04-05T10:00:00Z',
        votos: 4,
        profiles: {
          id: '58e99f2f-3ca2-4893-b879-4d1f456d9bf8',
          display_name: 'Ana',
          full_name: 'Ana Teste',
          avatar_url: 'https://example.com/avatar.png',
          verified: true,
        },
        post_media: [],
        comments: [{ count: 1 }],
      },
    ]);

    const result = await driver.searchPosts({ q: 'notebook', limit: 8 });

    expect(window.KCSupabase.searchPosts).toHaveBeenCalledWith({ q: 'notebook', limit: 8 });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Notebook Dell');
    expect(result[0].comentarios).toBe(1);
  });
});

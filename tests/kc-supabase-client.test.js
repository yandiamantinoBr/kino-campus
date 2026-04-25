describe('KCSupabase.searchPosts', () => {
  let rpcMock;
  let authMock;

  beforeEach(() => {
    jest.resetModules();

    global.window = global.window || global;
    global.document = {
      addEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    };
    global.CustomEvent = function CustomEvent(type, init) {
      return { type, detail: init && init.detail ? init.detail : null };
    };

    window.KC_ENV = {
      driver: 'supabase',
      DATA_DRIVER: 'supabase',
      environment: 'development',
      APP_ENV: 'development',
      debug: false,
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-key',
      supabase: {
        url: 'https://test.supabase.co',
        anonKey: 'test-key',
        storageBucket: 'kino-media',
      },
    };

    window.KCSearchShared = require('../assets/js/kc-search.shared.js');

    rpcMock = jest.fn();
    authMock = {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      resend: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      signOut: jest.fn(),
    };

    window.supabase = {
      createClient: jest.fn(() => ({
        auth: authMock,
        rpc: rpcMock,
        channel: jest.fn(() => ({
          on: jest.fn().mockReturnThis(),
          subscribe: jest.fn(),
          unsubscribe: jest.fn(),
        })),
        removeChannel: jest.fn(),
      })),
    };

    require('../assets/js/kc-supabase.client.js');
    require('../assets/js/kc-supabase.posts.js');
    require('../assets/js/kc-supabase.ratings.js');
  });

  test('expands synonyms on the client and forwards normalized params to the RPC', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    await window.KCSupabase.searchPosts({
      q: 'laptop',
      module: 'compra-venda',
      category: 'eletronicos',
      subcategory: 'informatica',
      limit: 8,
    });

    expect(rpcMock).toHaveBeenCalledWith('kc_search_posts_fts', expect.objectContaining({
      p_q: 'laptop',
      p_module: 'compra-venda',
      p_category: 'eletronicos',
      p_subcategory: 'informatica',
      p_limit: 8,
    }));

    const params = rpcMock.mock.calls[0][1];
    expect(params.p_terms).toEqual(expect.arrayContaining(['laptop', 'notebook']));
    expect(new Set(params.p_terms).size).toBe(params.p_terms.length);
  });

  test('returns an empty array when the RPC fails', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const result = await window.KCSupabase.searchPosts({ q: 'notebook', limit: 8 });

    expect(result).toEqual([]);
  });
});

describe('KCSupabase.getFeedCursor', () => {
  let rpcMock;
  let authMock;

  beforeEach(() => {
    jest.resetModules();

    global.window = global.window || global;
    global.document = {
      addEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    };
    global.CustomEvent = function CustomEvent(type, init) {
      return { type, detail: init && init.detail ? init.detail : null };
    };

    window.KC_ENV = {
      driver: 'supabase',
      DATA_DRIVER: 'supabase',
      environment: 'development',
      APP_ENV: 'development',
      debug: false,
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-key',
      supabase: {
        url: 'https://test.supabase.co',
        anonKey: 'test-key',
        storageBucket: 'kino-media',
      },
    };

    window.KCSearchShared = require('../assets/js/kc-search.shared.js');

    rpcMock = jest.fn();
    authMock = {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      resend: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      signOut: jest.fn(),
    };

    window.supabase = {
      createClient: jest.fn(() => ({
        auth: authMock,
        rpc: rpcMock,
        channel: jest.fn(() => ({
          on: jest.fn().mockReturnThis(),
          subscribe: jest.fn(),
          unsubscribe: jest.fn(),
        })),
        removeChannel: jest.fn(),
      })),
    };

    require('../assets/js/kc-supabase.client.js');
    require('../assets/js/kc-supabase.posts.js');
    require('../assets/js/kc-supabase.ratings.js');
  });

  test('mescla requestParams com filtros avancados top-level e envia p_request_params ao RPC', async () => {
    rpcMock.mockResolvedValue({
      data: {
        ok: true,
        posts: [{ id: 'post-1' }],
        next_cursor: 'cursor_2',
        has_more: true,
      },
      error: null,
    });

    const result = await window.KCSupabase.getFeedCursor({
      module: 'oportunidades',
      sortBy: 'comentados',
      limit: 12,
      oppArea: 'tecnologia',
      oppMode: ['remoto'],
      datePreset: 'last7d',
      priceMin: 500,
      priceMax: 2500,
      requestParams: {
        oppType: ['emprego-clt'],
      },
    });

    expect(rpcMock).toHaveBeenCalledWith('kc_get_feed_cursor', expect.objectContaining({
      p_module: 'oportunidades',
      p_sort_by: 'comentados',
      p_limit: 12,
      p_request_params: {
        oppType: ['emprego-clt'],
        oppArea: 'tecnologia',
        oppMode: ['remoto'],
        datePreset: 'last7d',
        priceMin: 500,
        priceMax: 2500,
      },
    }));

    expect(result).toEqual({
      posts: [{ id: 'post-1' }],
      nextCursor: 'cursor_2',
      hasMore: true,
    });
  });
});

describe('KCSupabase user ratings', () => {
  let rpcMock;
  let authMock;

  beforeEach(() => {
    jest.resetModules();

    global.window = global.window || global;
    global.document = {
      addEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    };
    global.CustomEvent = function CustomEvent(type, init) {
      return { type, detail: init && init.detail ? init.detail : null };
    };

    window.KC_ENV = {
      driver: 'supabase',
      DATA_DRIVER: 'supabase',
      environment: 'development',
      APP_ENV: 'development',
      debug: false,
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-key',
      supabase: {
        url: 'https://test.supabase.co',
        anonKey: 'test-key',
        storageBucket: 'kino-media',
      },
    };

    window.KCSearchShared = require('../assets/js/kc-search.shared.js');

    rpcMock = jest.fn();
    authMock = {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      resend: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      signOut: jest.fn(),
    };

    window.supabase = {
      createClient: jest.fn(() => ({
        auth: authMock,
        rpc: rpcMock,
        channel: jest.fn(() => ({
          on: jest.fn().mockReturnThis(),
          subscribe: jest.fn(),
          unsubscribe: jest.fn(),
        })),
        removeChannel: jest.fn(),
      })),
    };

    require('../assets/js/kc-supabase.client.js');
    require('../assets/js/kc-supabase.posts.js');
    require('../assets/js/kc-supabase.ratings.js');
  });

  test('normaliza resumo público de reputação vindo do RPC', async () => {
    rpcMock.mockResolvedValue({ data: { user_id: 'USER_01', rating_avg: 4.5, rating_count: 6 }, error: null });

    const result = await window.KCSupabase.getUserRatingSummary('USER_01');

    expect(rpcMock).toHaveBeenCalledWith('kc_get_user_rating_summary', { p_target_user_id: 'USER_01' });
    expect(result).toEqual({
      userId: 'USER_01',
      average: 4.5,
      count: 6,
    });
  });

  test('normaliza estado, listagem e upsert das avaliações', async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: {
          target_user_id: 'USER_01',
          context_post_id: 'post-1',
          can_rate: true,
          reason: 'OK',
          my_rating: {
            id: 'rating-1',
            target_user_id: 'USER_01',
            rater_user_id: 'USER_SELF',
            context_post_id: 'post-1',
            rating: 5,
            comment: 'Ótima experiência',
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'rating-1',
              target_user_id: 'USER_01',
              rater_user_id: 'USER_SELF',
              rating: 5,
              comment: 'Ótima experiência',
            },
          ],
          page: 1,
          limit: 10,
          total: 1,
          has_more: false,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          rating: {
            id: 'rating-1',
            target_user_id: 'USER_01',
            rater_user_id: 'USER_SELF',
            rating: 4,
            comment: 'Confiável',
          },
          summary: {
            user_id: 'USER_01',
            rating_avg: 4.0,
            rating_count: 1,
          },
        },
        error: null,
      });

    const state = await window.KCSupabase.getUserRatingState({ targetUserId: 'USER_01', contextPostId: 'post-1' });
    const list = await window.KCSupabase.listUserRatings('USER_01', { page: 1, limit: 10 });
    const upsert = await window.KCSupabase.upsertUserRating({ targetUserId: 'USER_01', contextPostId: 'post-1', rating: 4, comment: 'Confiável' });

    expect(state).toEqual(expect.objectContaining({
      targetUserId: 'USER_01',
      contextPostId: 'post-1',
      canRate: true,
      myRating: expect.objectContaining({ rating: 5 }),
    }));
    expect(list.total).toBe(1);
    expect(list.items[0]).toEqual(expect.objectContaining({ rating: 5 }));
    expect(upsert.ok).toBe(true);
    expect(upsert.summary).toEqual({
      userId: 'USER_01',
      average: 4,
      count: 1,
    });
  });
});

describe('KCAPI product session SWR', () => {
  let api;
  let supabaseDriver;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.sessionStorage.clear();
    delete window.KCAPI;

    window.KC_ENV = {
      version: '9.0.0',
      driver: 'supabase',
      environment: 'development',
      APP_ENV: 'development',
      isProduction: false,
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-key',
      supabase: { url: 'https://test.supabase.co', anonKey: 'test-key', storageBucket: 'kino-media' },
      clamp: { month: 'February', year: 2026 },
    };

    window.KCSupabase = {
      getUser: jest.fn(() => ({ id: 'user-1' })),
    };

    require('../assets/js/kc-constants.js');
    require('../assets/js/kc-utils.js');
    require('../assets/js/kc-api.notifications.js');
    require('../assets/js/kc-api.saved.js');
    require('../assets/js/kc-api.help.js');
    require('../assets/js/kc-api.posts-read.js');
  require('../assets/js/kc-api.comments-votes.js');
  require('../assets/js/kc-api.ratings.js');
  require('../assets/js/kc-api.posts-feed.js');
    require('../assets/js/kc-api.client.js');

    api = window.KCAPI;
    api.ENV.driver = 'supabase';

    supabaseDriver = {
      name: 'supabase',
      getPostAnalytics: jest.fn(),
      getComments: jest.fn(),
      addComment: jest.fn(),
      likeComment: jest.fn(),
      votePost: jest.fn(),
      trackView: jest.fn(),
      trackShare: jest.fn(),
      trackCouponClick: jest.fn(),
      setSavedPostState: jest.fn(),
      clearSavedPostState: jest.fn(),
    };

    api.registerAdapter('supabase', supabaseDriver);
  });

  test('getPostAnalytics reuses the fresh session snapshot after a refresh', async () => {
    supabaseDriver.getPostAnalytics.mockResolvedValue({
      ok: true,
      views: 12,
      votos: 3,
      comments: 4,
      shares: 1,
      saves: 2,
      coupon_clicks: 0,
    });

    await api.refreshPostAnalytics('post-1', { force: true });
    const secondRead = await api.getPostAnalytics('post-1');
    const cached = api.getCachedPostAnalytics('post-1');

    expect(secondRead.views).toBe(12);
    expect(cached.data.comments).toBe(4);
    expect(cached.isFresh).toBe(true);
    expect(supabaseDriver.getPostAnalytics).toHaveBeenCalledTimes(1);
  });

  test('addComment invalidates the comments snapshot for the same post', async () => {
    supabaseDriver.getComments.mockResolvedValueOnce([
      { id: 'c1', body: 'Primeiro', likes: 0 },
    ]);

    await api.refreshComments('post-1', { force: true });
    await api.getComments('post-1');
    expect(supabaseDriver.getComments).toHaveBeenCalledTimes(1);

    supabaseDriver.addComment.mockResolvedValue({ ok: true, data: { id: 'c2' } });
    supabaseDriver.getComments.mockResolvedValueOnce([
      { id: 'c1', body: 'Primeiro', likes: 0 },
      { id: 'c2', body: 'Segundo', likes: 0 },
    ]);

    await api.addComment('post-1', 'Segundo');
    const refreshed = await api.getComments('post-1');

    expect(refreshed).toHaveLength(2);
    expect(supabaseDriver.getComments).toHaveBeenCalledTimes(2);
  });

  test('likeComment invalidates the targeted post comments snapshot when postId is provided', async () => {
    supabaseDriver.getComments.mockResolvedValueOnce([
      { id: 'c1', body: 'Primeiro', likes: 0 },
    ]);

    await api.refreshComments('post-1', { force: true });
    await api.getComments('post-1');
    expect(supabaseDriver.getComments).toHaveBeenCalledTimes(1);

    supabaseDriver.likeComment.mockResolvedValue({ ok: true, likes: 1 });
    supabaseDriver.getComments.mockResolvedValueOnce([
      { id: 'c1', body: 'Primeiro', likes: 1, liked_by_me: true },
    ]);

    await api.likeComment('c1', { postId: 'post-1' });
    const refreshed = await api.getComments('post-1');

    expect(refreshed[0].likes).toBe(1);
    expect(supabaseDriver.getComments).toHaveBeenCalledTimes(2);
  });
});

/**
 * Testes para analytics de post (v9.3.1)
 * - KCAPI.trackView / KCAPI.getPostAnalytics
 * - Delegacao para driver ativo
 * - Stubs do adapter local
 */

beforeAll(() => {
  global.window = global.window || global;

  window.KC_ENV = {
    version: '9.0.0',
    driver: 'local',
    environment: 'development',
    APP_ENV: 'development',
    isProduction: false,
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-key',
    supabase: { url: 'https://test.supabase.co', anonKey: 'test-key', storageBucket: 'kino-media' },
    clamp: { month: 'February', year: 2026 },
  };

  require('../assets/js/kc-constants.js');
  require('../assets/js/kc-utils.js');
  require('../assets/js/kc-api.notifications.js');
  require('../assets/js/kc-api.saved.js');
  require('../assets/js/kc-api.help.js');
  require('../assets/js/kc-api.posts-read.js');
  require('../assets/js/kc-api.comments-votes.js');
  require('../assets/js/kc-api.ratings.js');
  require('../assets/js/kc-api.client.js');
});

describe('Post Analytics (v9.3.1)', () => {
  let api;

  beforeEach(() => {
    api = window.KCAPI;
    if (api && typeof api.invalidatePostAnalyticsCache === 'function') {
      api.invalidatePostAnalyticsCache('post-uuid-123');
      api.invalidatePostAnalyticsCache('qualquer-id');
    }
  });

  // ── KCAPI.trackView ──────────────────────────────────────────

  describe('trackView', () => {
    test('metodo existe no KCAPI', () => {
      expect(api.trackView).toBeDefined();
    });

    test('delega para o driver ativo quando trackView existe', async () => {
      const payload = { ok: true, counted: true, view_count: 42 };
      api.registerAdapter('local', {
        name: 'local',
        trackView: jest.fn().mockResolvedValue(payload),
      });

      window.KC_ENV.driver = 'local';
      const result = await api.trackView('post-uuid-123');

      expect(result).toEqual(payload);
    });

    test('retorna { ok: false } quando driver nao expoe trackView', async () => {
      api.registerAdapter('local', {
        name: 'local',
      });

      window.KC_ENV.driver = 'local';
      const result = await api.trackView('post-uuid-123');

      expect(result).toEqual({ ok: false });
    });
  });

  // ── KCAPI.getPostAnalytics ───────────────────────────────────

  describe('getPostAnalytics', () => {
    test('metodo existe no KCAPI', () => {
      expect(api.getPostAnalytics).toBeDefined();
    });

    test('delega para o driver ativo quando getPostAnalytics existe', async () => {
      const payload = {
        ok: true,
        post_id: 'post-uuid-123',
        views: 100,
        votos: 5,
        comments: 3,
        shares: 2,
        coupon_clicks: 1,
        saves: 4,
        highlight_score: 15.3,
      };
      api.registerAdapter('local', {
        name: 'local',
        getPostAnalytics: jest.fn().mockResolvedValue(payload),
      });

      window.KC_ENV.driver = 'local';
      const result = await api.getPostAnalytics('post-uuid-123', { force: true });

      expect(result).toEqual(payload);
      expect(result.views).toBe(100);
      expect(result.votos).toBe(5);
      expect(result.comments).toBe(3);
      expect(result.shares).toBe(2);
      expect(result.saves).toBe(4);
    });

    test('retorna { ok: false } quando driver nao expoe getPostAnalytics', async () => {
      api.registerAdapter('local', {
        name: 'local',
      });

      window.KC_ENV.driver = 'local';
      const result = await api.getPostAnalytics('post-uuid-123', { force: true });

      expect(result).toEqual({ ok: false });
    });
  });

  // ── Adapter local stubs ──────────────────────────────────────

  describe('local adapter stubs', () => {
    beforeAll(() => {
      require('../assets/js/adapters/local.adapter.js');
    });

    test('trackView retorna { ok: false } no adapter local', async () => {
      window.KC_ENV.driver = 'local';
      const result = await api.trackView('qualquer-id');
      expect(result).toEqual({ ok: false });
    });

    test('getPostAnalytics retorna { ok: false } no adapter local', async () => {
      window.KC_ENV.driver = 'local';
      const result = await api.getPostAnalytics('qualquer-id', { force: true });
      expect(result).toEqual({ ok: false });
    });
  });
});

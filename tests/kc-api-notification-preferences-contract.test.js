beforeAll(() => {
  global.window = global.window || global;

  window.KC_ENV = window.KC_ENV || {
    version: '9.0.0',
    driver: 'local',
    environment: 'development',
    APP_ENV: 'development',
    isProduction: false,
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-key',
    supabase: { url: 'https://test.supabase.co', anonKey: 'test-key', storageBucket: 'kino-media' },
  };

  require('../assets/js/kc-constants.js');
  require('../assets/js/kc-utils.js');
  require('../assets/js/account-profile.shared.js');
  require('../assets/js/kc-api.client.js');
});

describe('KCAPI notification preferences contract', () => {
  let adapter;

  beforeEach(() => {
    adapter = {
      name: 'local',
      getNotificationPreferences: jest.fn(() => Promise.resolve({
        comment_on_post: { in_app: false, email: true, whatsapp: false },
        comment_reply: { in_app: true, email: false, whatsapp: false },
        vote_on_post: { in_app: true, email: false, whatsapp: false },
        post_expired: { in_app: true, email: false, whatsapp: false },
        post_reported: { in_app: true, email: false, whatsapp: false },
        system: { in_app: true, email: false, whatsapp: true },
      })),
      updateNotificationPreferences: jest.fn((preferences) => Promise.resolve({
        ok: true,
        data: { preferences }
      })),
    };

    window.KCAPI.registerAdapter('local', adapter);
    window.KC_ENV.driver = 'local';
  });

  afterEach(() => {
    window.KC_ENV.driver = 'local';
  });

  test('delegates getNotificationPreferences to the active driver', async () => {
    const result = await window.KCAPI.getNotificationPreferences();

    expect(adapter.getNotificationPreferences).toHaveBeenCalledTimes(1);
    expect(result.comment_on_post).toEqual({
      in_app: false,
      email: true,
      whatsapp: false,
    });
  });

  test('returns canonical defaults when getNotificationPreferences is unavailable', async () => {
    window.KCAPI.registerAdapter('local', { name: 'local' });

    const result = await window.KCAPI.getNotificationPreferences();

    expect(result).toEqual({
      comment_on_post: { in_app: true, email: false, whatsapp: false },
      comment_reply: { in_app: true, email: false, whatsapp: false },
      vote_on_post: { in_app: true, email: false, whatsapp: false },
      post_expired: { in_app: true, email: false, whatsapp: false },
      post_reported: { in_app: true, email: false, whatsapp: false },
      system: { in_app: true, email: false, whatsapp: false },
    });
  });

  test('delegates updateNotificationPreferences to the active driver', async () => {
    const payload = {
      comment_on_post: { in_app: false, email: true, whatsapp: false },
      system: { in_app: true, email: false, whatsapp: true },
    };

    const result = await window.KCAPI.updateNotificationPreferences(payload);

    expect(adapter.updateNotificationPreferences).toHaveBeenCalledWith(payload);
    expect(result).toEqual({
      ok: true,
      data: { preferences: payload },
    });
  });

  test('returns unavailable shape when updateNotificationPreferences is missing', async () => {
    window.KCAPI.registerAdapter('local', { name: 'local' });

    const result = await window.KCAPI.updateNotificationPreferences({});

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(String(result.error.message || '').toLowerCase()).toContain('driver');
  });
});

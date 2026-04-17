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
  require('../assets/js/kc-api.notifications.js');
  require('../assets/js/kc-api.client.js');
});

describe('KCAPI notifications contract', () => {
  let adapter;

  beforeEach(() => {
    adapter = {
      name: 'local',
      getNotifications: jest.fn(() => Promise.resolve({ ok: true, notifications: [], unread: 0, total: 0 })),
      markNotificationsRead: jest.fn(() => Promise.resolve({ ok: true })),
      markAllNotificationsRead: jest.fn(() => Promise.resolve({ ok: true })),
      clearNotifications: jest.fn(() => Promise.resolve({ ok: true, deleted: 4 })),
      getUnreadNotificationCount: jest.fn(() => Promise.resolve(0)),
      subscribeNotifications: jest.fn(() => ({ channel: true })),
      unsubscribeNotifications: jest.fn(),
    };

    window.KCAPI.registerAdapter('local', adapter);
    window.KC_ENV.driver = 'local';
  });

  afterEach(() => {
    window.KC_ENV.driver = 'local';
  });

  test('delegates clearNotifications to the active driver', async () => {
    const result = await window.KCAPI.clearNotifications();

    expect(adapter.clearNotifications).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, deleted: 4 });
  });

  test('returns an unavailable shape when clearNotifications is missing', async () => {
    window.KCAPI.registerAdapter('local', {
      name: 'local',
      getNotifications: adapter.getNotifications,
    });

    const result = await window.KCAPI.clearNotifications();

    expect(result).toEqual({ ok: false, error: 'UNAVAILABLE' });
  });

  test('keeps the notifications subscription contract on the active driver', () => {
    const callback = jest.fn();
    const channel = window.KCAPI.subscribeNotifications('user-1', callback);

    expect(adapter.subscribeNotifications).toHaveBeenCalledWith('user-1', callback);
    expect(channel).toEqual({ channel: true });
  });
});

'use strict';

let driver;
let store;
let actualNotificationsModule;

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
    normalizePost: jest.fn((post) => post),
    MOCK_USERS_LIST: [],
    MOCK_USERS_BY_ID: {},
    apiURL: jest.fn((path) => '/api/v1/' + path),
    VERSION: '12.4.1',
    ENV: { driver: 'local', environment: 'development' },
    DEFAULTS: { fallbackDatabaseURLs: [] },
  };

  delete window.KCAccountProfileUtils;
  delete require.cache[require.resolve('../../assets/js/adapters/local/local.notifications.adapter.js')];
  delete require.cache[require.resolve('../../assets/js/adapters/local/local.ratings.adapter.js')];
  delete require.cache[require.resolve('../../assets/js/adapters/local/local.saved.adapter.js')];
  delete require.cache[require.resolve('../../assets/js/adapters/local/local.posts-read.adapter.js')];
  delete require.cache[require.resolve('../../assets/js/adapters/local/local.posts-write.adapter.js')];
  delete require.cache[require.resolve('../../assets/js/adapters/local/local.profile.adapter.js')];
  delete require.cache[require.resolve('../../assets/js/adapters/local/local.help.adapter.js')];
  delete require.cache[require.resolve('../../assets/js/adapters/local/local.adapter.js')];


  require('../../assets/js/adapters/local/local.notifications.adapter.js');
  require('../../assets/js/adapters/local/local.ratings.adapter.js');
  require('../../assets/js/adapters/local/local.saved.adapter.js');
  require('../../assets/js/adapters/local/local.posts-read.adapter.js');
  require('../../assets/js/adapters/local/local.posts-write.adapter.js');
  require('../../assets/js/adapters/local/local.profile.adapter.js');
  require('../../assets/js/adapters/local/local.help.adapter.js');
  require('../../assets/js/adapters/local/local.adapter.js');


  actualNotificationsModule = window._KCLA.notifications;
  driver = window.KCAPI.registerAdapter.mock.calls[0][1];
});

beforeEach(() => {
  global.localStorage.clear();
  window._KCLA.notifications = actualNotificationsModule;
  delete window.KCAccountProfileUtils;
});

const notifications = () => window._KCLA.notifications;

describe('local.notifications.adapter.js - contrato estatico', () => {
  test('registra window._KCLA.notifications como objeto frozen', () => {
    expect(window._KCLA).toBeDefined();
    expect(notifications()).toBeDefined();
    expect(Object.isFrozen(notifications())).toBe(true);
  });

  test('expoe exatamente 14 chaves publicas', () => {
    expect(Object.keys(notifications()).sort()).toEqual([
      'clearNotifications',
      'getInvites',
      'getNotificationChannelTargets',
      'getNotificationPreferences',
      'getNotifications',
      'getUnreadNotificationCount',
      'inviteExternalUser',
      'markAllNotificationsRead',
      'markNotificationsRead',
      'revokeInvite',
      'subscribeNotifications',
      'unsubscribeNotifications',
      'updateNotificationChannelTargets',
      'updateNotificationPreferences',
    ]);
  });

  test('helpers internos nao ficam expostos no namespace publico', () => {
    expect(notifications().buildDefaultNotificationPreferences).toBeUndefined();
    expect(notifications().normalizeNotificationPreferences).toBeUndefined();
    expect(notifications().formatNotificationWhatsapp).toBeUndefined();
  });
});

describe('local.notifications.adapter.js - preferencias', () => {
  test('retorna preferencias default quando storage esta vazio', async () => {
    await expect(notifications().getNotificationPreferences()).resolves.toEqual({
      comment_on_post: { in_app: true, email: false, whatsapp: false },
      comment_reply: { in_app: true, email: false, whatsapp: false },
      vote_on_post: { in_app: true, email: false, whatsapp: false },
      post_expired: { in_app: true, email: false, whatsapp: false },
      post_reported: { in_app: true, email: false, whatsapp: false },
      system: { in_app: true, email: false, whatsapp: false },
    });
  });

  test('normaliza preferencias ao persistir e preserva eventos faltantes', async () => {
    const result = await notifications().updateNotificationPreferences({
      comment_on_post: { in_app: false, email: true, whatsapp: true },
      system: { email: true },
    });

    expect(result).toEqual({
      ok: true,
      data: {
        preferences: {
          comment_on_post: { in_app: false, email: true, whatsapp: true },
          comment_reply: { in_app: true, email: false, whatsapp: false },
          vote_on_post: { in_app: true, email: false, whatsapp: false },
          post_expired: { in_app: true, email: false, whatsapp: false },
          post_reported: { in_app: true, email: false, whatsapp: false },
          system: { in_app: true, email: true, whatsapp: false },
        },
      },
    });

    expect(JSON.parse(store.kc_notification_preferences)).toEqual(result.data.preferences);
  });

  test('usa KCAccountProfileUtils de forma lazy quando disponivel', async () => {
    window.KCAccountProfileUtils = {
      buildDefaultNotificationPreferences: jest.fn(() => ({
        custom: { in_app: false, email: true, whatsapp: true },
      })),
      normalizeNotificationPreferences: jest.fn((value) => value),
    };

    await expect(notifications().getNotificationPreferences()).resolves.toEqual({
      custom: { in_app: false, email: true, whatsapp: true },
    });
  });

  test('retorna default quando o JSON salvo esta corrompido', async () => {
    store.kc_notification_preferences = '{invalido';

    await expect(notifications().getNotificationPreferences()).resolves.toEqual({
      comment_on_post: { in_app: true, email: false, whatsapp: false },
      comment_reply: { in_app: true, email: false, whatsapp: false },
      vote_on_post: { in_app: true, email: false, whatsapp: false },
      post_expired: { in_app: true, email: false, whatsapp: false },
      post_reported: { in_app: true, email: false, whatsapp: false },
      system: { in_app: true, email: false, whatsapp: false },
    });
  });
});

describe('local.notifications.adapter.js - destinos privados', () => {
  test('retorna targets default quando storage esta vazio', async () => {
    await expect(notifications().getNotificationChannelTargets()).resolves.toEqual({
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
  });

  test('normaliza whatsapp privado em formato E.164 + display pt-BR', async () => {
    const result = await notifications().updateNotificationChannelTargets({
      whatsapp: {
        destination: '(62) 99876-5432',
        consent_granted: true,
      },
    });

    expect(result).toEqual({
      ok: true,
      data: {
        targets: {
          whatsapp: {
            channel: 'whatsapp',
            destination: '+62998765432',
            country_code: '55',
            local_number: '',
            consent_granted: true,
            consent_at: null,
            configured: true,
            ready: true,
            display: '+62998765432',
            metadata: { country_code: '55' },
          },
        },
      },
    });
  });

  test('monta destination a partir de country_code + local_number', async () => {
    const result = await notifications().updateNotificationChannelTargets({
      whatsapp: {
        country_code: '55',
        local_number: '(62) 99876-5432',
        consent_granted: true,
      },
    });

    expect(result.data.targets.whatsapp).toEqual(expect.objectContaining({
      destination: '+5562998765432',
      country_code: '55',
      local_number: '62998765432',
      configured: true,
      ready: true,
      display: '+55 (62) 99876-5432',
    }));
  });

  test('normaliza payload legado vindo direto do storage', async () => {
    store.kc_notification_channel_targets = JSON.stringify({
      whatsapp: {
        destination_normalized: '5562991234567',
        consentGranted: true,
        metadata: { country_code: '55' },
      },
    });

    await expect(notifications().getNotificationChannelTargets()).resolves.toEqual({
      whatsapp: {
        channel: 'whatsapp',
        destination: '+5562991234567',
        country_code: '55',
        local_number: '62991234567',
        consent_granted: true,
        consent_at: null,
        configured: true,
        ready: true,
        display: '+55 (62) 99123-4567',
        metadata: { country_code: '55' },
      },
    });
  });

  test('usa KCAccountProfileUtils para normalizar targets quando disponivel', async () => {
    window.KCAccountProfileUtils = {
      normalizeNotificationChannelTargets: jest.fn(() => ({
        whatsapp: {
          channel: 'whatsapp',
          destination: '+5511999999999',
          country_code: '55',
          local_number: '11999999999',
          consent_granted: true,
          consent_at: '2026-04-22T00:00:00.000Z',
          configured: true,
          ready: true,
          display: '+55 (11) 99999-9999',
          metadata: { country_code: '55' },
        },
      })),
    };

    const result = await notifications().updateNotificationChannelTargets({ whatsapp: { destination: 'x' } });

    expect(window.KCAccountProfileUtils.normalizeNotificationChannelTargets).toHaveBeenCalledTimes(1);
    expect(result.data.targets.whatsapp.display).toBe('+55 (11) 99999-9999');
  });

  test('retorna default quando o JSON salvo dos targets esta corrompido', async () => {
    store.kc_notification_channel_targets = '{invalido';

    await expect(notifications().getNotificationChannelTargets()).resolves.toEqual({
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
  });
});

describe('local.notifications.adapter.js - stubs operacionais', () => {
  test('getNotifications retorna shape vazio estavel', async () => {
    await expect(notifications().getNotifications()).resolves.toEqual({
      ok: true,
      notifications: [],
      unread: 0,
      total: 0,
    });
  });

  test('markNotificationsRead e markAllNotificationsRead retornam ok', async () => {
    await expect(notifications().markNotificationsRead(['n1'])).resolves.toEqual({ ok: true });
    await expect(notifications().markAllNotificationsRead()).resolves.toEqual({ ok: true });
  });

  test('clearNotifications e getUnreadNotificationCount retornam valores neutros', async () => {
    await expect(notifications().clearNotifications()).resolves.toEqual({ ok: true, deleted: 0 });
    await expect(notifications().getUnreadNotificationCount()).resolves.toBe(0);
  });

  test('subscribeNotifications e unsubscribeNotifications sao no-op seguros', () => {
    expect(notifications().subscribeNotifications('USER_SELF', jest.fn())).toBeNull();
    expect(() => notifications().unsubscribeNotifications(null)).not.toThrow();
  });

  test('convites mantem stubs seguros do driver local', async () => {
    await expect(notifications().inviteExternalUser('user@example.com')).resolves.toEqual({
      ok: false,
      error: 'DRIVER_NAO_SUPORTA',
    });
    await expect(notifications().getInvites()).resolves.toEqual({ data: [], error: null });
    await expect(notifications().revokeInvite('user@example.com')).resolves.toEqual({
      ok: false,
      error: 'DRIVER_NAO_SUPORTA',
    });
  });
});

describe('driver local - delegacao para window._KCLA.notifications', () => {
  test('driver delega getNotificationPreferences para o submodulo ativo', async () => {
    const mockModule = {
      ...actualNotificationsModule,
      getNotificationPreferences: jest.fn().mockResolvedValue({ delegated: true }),
    };
    window._KCLA.notifications = mockModule;

    await expect(driver.getNotificationPreferences()).resolves.toEqual({ delegated: true });
    expect(mockModule.getNotificationPreferences).toHaveBeenCalledTimes(1);
  });

  test('driver delega updateNotificationChannelTargets preservando argumentos', async () => {
    const payload = { whatsapp: { local_number: '62999999999' } };
    const mockModule = {
      ...actualNotificationsModule,
      updateNotificationChannelTargets: jest.fn().mockResolvedValue({ ok: true }),
    };
    window._KCLA.notifications = mockModule;

    await expect(driver.updateNotificationChannelTargets(payload)).resolves.toEqual({ ok: true });
    expect(mockModule.updateNotificationChannelTargets).toHaveBeenCalledWith(payload);
  });

  test('driver delega listagem e unread para o submodulo ativo', async () => {
    const mockModule = {
      ...actualNotificationsModule,
      getNotifications: jest.fn().mockResolvedValue({ ok: true, notifications: [{ id: 'n1' }], unread: 1, total: 1 }),
      getUnreadNotificationCount: jest.fn().mockResolvedValue(1),
    };
    window._KCLA.notifications = mockModule;

    await expect(driver.getNotifications(20, 0)).resolves.toEqual({
      ok: true,
      notifications: [{ id: 'n1' }],
      unread: 1,
      total: 1,
    });
    await expect(driver.getUnreadNotificationCount()).resolves.toBe(1);
  });

  test('driver delega convites para o submodulo ativo', async () => {
    const mockModule = {
      ...actualNotificationsModule,
      inviteExternalUser: jest.fn().mockResolvedValue({ ok: true, data: { email: 'user@example.com' } }),
      getInvites: jest.fn().mockResolvedValue({ data: [{ email: 'user@example.com' }], error: null }),
      revokeInvite: jest.fn().mockResolvedValue({ ok: true }),
    };
    window._KCLA.notifications = mockModule;

    await expect(driver.inviteExternalUser('user@example.com', 'oi')).resolves.toEqual({
      ok: true,
      data: { email: 'user@example.com' },
    });
    await expect(driver.getInvites()).resolves.toEqual({
      data: [{ email: 'user@example.com' }],
      error: null,
    });
    await expect(driver.revokeInvite('user@example.com')).resolves.toEqual({ ok: true });
  });
});


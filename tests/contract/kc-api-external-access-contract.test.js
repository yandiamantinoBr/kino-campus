'use strict';

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

  require('../../assets/js/boot/kc-constants.js');
  require('../../assets/js/utils/kc-utils.string.js');
  require('../../assets/js/utils/kc-utils.format.js');
  require('../../assets/js/utils/kc-utils.dom.js');
  require('../../assets/js/utils/kc-utils.identity.js');
  require('../../assets/js/utils/kc-utils.taxonomy.js');
  require('../../assets/js/utils/kc-utils.location.js');
  require('../../assets/js/utils/kc-utils.presentation.js');
  require('../../assets/js/utils/kc-utils.js');
  require('../../assets/js/api/kc-api.notifications.js');
  require('../../assets/js/api/kc-api.saved.js');
  require('../../assets/js/api/kc-api.help.js');
  require('../../assets/js/api/kc-api.posts-read.js');
  require('../../assets/js/api/kc-api.comments-votes.js');
  require('../../assets/js/api/kc-api.ratings.js');
  require('../../assets/js/api/kc-api.posts-feed.js');
  require('../../assets/js/api/kc-api.posts-write.js');
  require('../../assets/js/api/kc-api.profiles.js');
  require('../../assets/js/api/kc-api.related.js');
  require('../../assets/js/api/kc-api.auth.js');
  require('../../assets/js/api/kc-api.diagnostics.js');
  require('../../assets/js/api/kc-api.session.js');
  require('../../assets/js/api/kc-api.filters.js');
  require('../../assets/js/api/kc-api.authors.js');
  require('../../assets/js/api/kc-api.posts-normalize.js');
  require('../../assets/js/api/kc-api.client.js');
});

describe('KCAPI external access admin contract', () => {
  let adapter;

  beforeEach(() => {
    adapter = {
      name: 'local',
      listExternalAccessRequests: jest.fn(() => Promise.resolve({
        ok: true,
        items: [{ id: 'ext_1', status: 'pending' }],
        total: 1,
      })),
      decideExternalAccessRequest: jest.fn(() => Promise.resolve({
        ok: true,
        id: 'ext_1',
        status: 'approved',
      })),
    };

    window.KCAPI.registerAdapter('local', adapter);
    window.KC_ENV.driver = 'local';
  });

  afterEach(() => {
    window.KC_ENV.driver = 'local';
  });

  test('delegates listExternalAccessRequests to the active driver through help module', async () => {
    const filters = { status: 'pending', limit: 100 };
    const result = await window.KCAPI.listExternalAccessRequests(filters);

    expect(adapter.listExternalAccessRequests).toHaveBeenCalledWith(filters);
    expect(result).toEqual({
      ok: true,
      items: [{ id: 'ext_1', status: 'pending' }],
      total: 1,
    });
  });

  test('delegates decideExternalAccessRequest to the active driver through help module', async () => {
    const payload = { id: 'ext_1', decision: 'approved', note: 'ok' };
    const result = await window.KCAPI.decideExternalAccessRequest(payload);

    expect(adapter.decideExternalAccessRequest).toHaveBeenCalledWith(payload);
    expect(result).toEqual({
      ok: true,
      id: 'ext_1',
      status: 'approved',
    });
  });

  test('returns canonical list fallback when external access listing is unavailable', async () => {
    window.KCAPI.registerAdapter('local', { name: 'local' });

    const result = await window.KCAPI.listExternalAccessRequests({ status: 'pending' });

    expect(result.ok).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.error).toEqual({ message: 'Funcionalidade indisponível neste driver.' });
  });

  test('returns canonical decision fallback when external access decision is unavailable', async () => {
    window.KCAPI.registerAdapter('local', { name: 'local' });

    const result = await window.KCAPI.decideExternalAccessRequest({ id: 'ext_1', decision: 'approved' });

    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ message: 'Funcionalidade indisponível neste driver.' });
  });
});

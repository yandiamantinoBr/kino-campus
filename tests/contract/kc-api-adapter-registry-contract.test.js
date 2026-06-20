/**
 * @file kc-api-adapter-registry-contract.test.js
 * @description Behavioral parity contract for KCAPI adapter registry (V76.31).
 */
'use strict';

const CLIENT_PATH = '../../assets/js/api/kc-api.client.js';

function loadFreshClient(driver) {
  jest.resetModules();
  delete window.KCAPI;
  delete window._KCAPI;
  delete window.getLastCreatePostError;
  delete window.setLastCreatePostError;
  delete window.clearLastCreatePostError;
  delete window.summarizeCreatePayloadForDiagnostics;

  window.KC_ENV = {
    version: '9.0.0',
    driver: driver || 'local',
    DATA_DRIVER: driver || 'local',
    environment: 'development',
    APP_ENV: 'development',
    isProduction: false,
    debug: false,
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-key',
    supabase: {
      url: 'https://test.supabase.co',
      anonKey: 'test-key',
      storageBucket: 'kino-media',
    },
  };

  require(CLIENT_PATH);
  return window.KCAPI;
}

function createAdapter(name, postId) {
  return {
    name,
    getPosts: jest.fn().mockResolvedValue([{ id: postId }]),
  };
}

describe('KCAPI adapter registry behavioral contract', () => {
  test('registro mais recente substitui o adapter da mesma chave', async () => {
    const api = loadFreshClient('local');
    const first = createAdapter('local-first', 'first');
    const replacement = createAdapter('local-replacement', 'replacement');

    api.registerAdapter('local', first);
    api.registerAdapter('local', replacement);

    expect(api.activeDriver).toBe('local-replacement');
    await expect(api.getPosts({ limit: 1 })).resolves.toEqual([{ id: 'replacement' }]);
    expect(first.getPosts).not.toHaveBeenCalled();
    expect(replacement.getPosts).toHaveBeenCalledWith({ limit: 1 });
  });

  test('driver local tem precedência em ambiente local independentemente da ordem de registro', async () => {
    const api = loadFreshClient('local');
    const local = createAdapter('local', 'local-post');
    const supabase = createAdapter('supabase', 'supabase-post');

    api.registerAdapter('local', local);
    api.registerAdapter('supabase', supabase);

    expect(api.activeDriver).toBe('local');
    await expect(api.getPosts()).resolves.toEqual([{ id: 'local-post' }]);
    expect(local.getPosts).toHaveBeenCalledTimes(1);
    expect(supabase.getPosts).not.toHaveBeenCalled();
  });

  test('driver Supabase é selecionado quando configurado e registrado', async () => {
    const api = loadFreshClient('supabase');
    const local = createAdapter('local', 'local-post');
    const supabase = createAdapter('supabase', 'supabase-post');

    api.registerAdapter('supabase', supabase);
    api.registerAdapter('local', local);

    expect(api.activeDriver).toBe('supabase');
    await expect(api.getPosts({ page: 2 })).resolves.toEqual([{ id: 'supabase-post' }]);
    expect(supabase.getPosts).toHaveBeenCalledWith({ page: 2 });
    expect(local.getPosts).not.toHaveBeenCalled();
  });

  test('ambiente Supabase usa fallback local quando o adapter remoto não foi registrado', async () => {
    const api = loadFreshClient('supabase');
    const local = createAdapter('local', 'fallback-local');
    api.registerAdapter('local', local);

    expect(api.activeDriver).toBe('local');
    await expect(api.getPosts()).resolves.toEqual([{ id: 'fallback-local' }]);
  });

  test('ausência de adapters expõe pending e falha explicitamente no primeiro acesso', async () => {
    const api = loadFreshClient('local');

    expect(api.activeDriver).toBe('pending');
    await expect(api.getPosts()).rejects.toThrow('No driver adapters loaded!');
  });
});

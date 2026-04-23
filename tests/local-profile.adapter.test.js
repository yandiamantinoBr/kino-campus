'use strict';

let driver;
let store;
let actualProfileModule;
let originalDocument;
let originalCustomEvent;
let originalKCProfiles;
let dispatchEventMock;

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

  originalDocument = global.document;
  originalCustomEvent = global.CustomEvent;
  originalKCProfiles = window.KCProfiles;

  dispatchEventMock = jest.fn();
  const documentMock = {
    dispatchEvent: dispatchEventMock,
  };
  function CustomEventMock(type, options) {
    this.type = type;
    this.detail = options && options.detail ? options.detail : undefined;
  }

  window.document = documentMock;
  global.document = documentMock;
  window.CustomEvent = CustomEventMock;
  global.CustomEvent = CustomEventMock;

  window.KCAPI = {
    registerAdapter: jest.fn(),
    config: { fallbackDatabaseURLs: [], baseURL: '' },
    fetchJSON: jest.fn().mockResolvedValue({ anuncios: [] }),
    filterPosts: jest.fn((posts) => posts),
    normalizePost: jest.fn((post) => (post && typeof post === 'object' ? { ...post } : post)),
    MOCK_USERS_LIST: [
      { id: 'USER_SELF', displayName: 'Voce Teste', avatarUrl: 'https://example.com/self.png', email: 'self@example.com' },
      { id: 'USER_02', displayName: 'Maria Campus', avatarUrl: 'https://example.com/maria.png', email: 'maria@example.com' },
    ],
    MOCK_USERS_BY_ID: {
      USER_SELF: { id: 'USER_SELF', displayName: 'Voce Teste', avatarUrl: 'https://example.com/self.png', email: 'self@example.com' },
      USER_02: { id: 'USER_02', displayName: 'Maria Campus', avatarUrl: 'https://example.com/maria.png', email: 'maria@example.com' },
    },
    apiURL: jest.fn((path) => '/api/v1/' + path),
    VERSION: '12.4.6',
    ENV: { driver: 'local', environment: 'development' },
    DEFAULTS: { fallbackDatabaseURLs: [] },
    rankRelatedPosts: jest.fn((currentPost, candidates) => (Array.isArray(candidates) ? candidates.slice() : [])),
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

  actualProfileModule = window._KCLA.profile;
  driver = window.KCAPI.registerAdapter.mock.calls[0][1];
});

afterAll(() => {
  if (typeof originalDocument === 'undefined') {
    delete global.document;
    delete window.document;
  } else {
    window.document = originalDocument;
    global.document = originalDocument;
  }

  if (typeof originalCustomEvent === 'undefined') {
    delete global.CustomEvent;
    delete window.CustomEvent;
  } else {
    window.CustomEvent = originalCustomEvent;
    global.CustomEvent = originalCustomEvent;
  }

  if (typeof originalKCProfiles === 'undefined') {
    delete window.KCProfiles;
  } else {
    window.KCProfiles = originalKCProfiles;
  }
});

beforeEach(() => {
  global.localStorage.clear();
  window._KCLA.profile = actualProfileModule;
  dispatchEventMock.mockReset();
  if (window.document && typeof window.document === 'object') {
    window.document.dispatchEvent = dispatchEventMock;
  }
  delete window.KCProfiles;
});

const profile = () => window._KCLA.profile;

function buildDeps(overrides = {}) {
  const base = {
    viewerId: 'USER_SELF',
    mockUsersById: window.KCAPI.MOCK_USERS_BY_ID,
    getNowIso: () => '2026-04-23T12:00:00.000Z',
  };
  return { ...base, ...overrides };
}

describe('local.profile.adapter.js - contrato estatico', () => {
  test('registra window._KCLA.profile como objeto frozen', () => {
    expect(window._KCLA).toBeDefined();
    expect(profile()).toBeDefined();
    expect(Object.isFrozen(profile())).toBe(true);
  });

  test('expoe exatamente 4 chaves publicas', () => {
    expect(Object.keys(profile()).sort()).toEqual([
      'getMyProfile',
      'readProfile',
      'updateMyProfile',
      'uploadProfileAvatar',
    ]);
  });

  test('helpers internos nao ficam expostos', () => {
    expect(profile().buildDefaultProfile).toBeUndefined();
    expect(profile().writeProfile).toBeUndefined();
    expect(profile().syncProfile).toBeUndefined();
  });
});

describe('local.profile.adapter.js - leitura de perfil', () => {
  test('readProfile retorna fallback a partir do mock viewer quando nao ha storage', () => {
    expect(profile().readProfile(buildDeps())).toEqual(expect.objectContaining({
      id: 'USER_SELF',
      display_name: 'Voce Teste',
      avatar_url: 'https://example.com/self.png',
      email: 'self@example.com',
    }));
  });

  test('getMyProfile resolve o mesmo fallback padrao', async () => {
    await expect(profile().getMyProfile(buildDeps())).resolves.toEqual(expect.objectContaining({
      id: 'USER_SELF',
      display_name: 'Voce Teste',
    }));
  });

  test('readProfile mescla storage sobre o fallback e normaliza campos principais', () => {
    global.localStorage.setItem('kc_local_profile', JSON.stringify({
      id: 'custom-id',
      display_name: 'Perfil Local',
      avatar_url: 'https://cdn.example.com/avatar.png',
      bio: 'Bio customizada',
      profile_public: false,
    }));

    expect(profile().readProfile(buildDeps())).toEqual(expect.objectContaining({
      id: 'custom-id',
      display_name: 'Perfil Local',
      avatar_url: 'https://cdn.example.com/avatar.png',
      bio: 'Bio customizada',
      profile_public: false,
      email: 'self@example.com',
    }));
  });

  test('readProfile retorna fallback quando o storage esta corrompido', () => {
    global.localStorage.setItem('kc_local_profile', '{invalid-json');

    expect(profile().readProfile(buildDeps())).toEqual(expect.objectContaining({
      id: 'USER_SELF',
      display_name: 'Voce Teste',
    }));
  });
});

describe('local.profile.adapter.js - updateMyProfile', () => {
  test('rejeita patch invalido', async () => {
    const result = await profile().updateMyProfile(null, buildDeps());
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('rejeita patch vazio', async () => {
    const result = await profile().updateMyProfile({}, buildDeps());
    expect(result.ok).toBe(false);
  });

  test('rejeita display_name vazio', async () => {
    const result = await profile().updateMyProfile({ display_name: '   ' }, buildDeps());
    expect(result.ok).toBe(false);
    expect(result.error.message).toContain('nome');
  });

  test('rejeita avatar_url com formato invalido', async () => {
    const result = await profile().updateMyProfile({ avatar_url: 'ftp://avatar.png' }, buildDeps());
    expect(result.ok).toBe(false);
    expect(result.error.message).toContain('avatar');
  });

  test('persiste alteracoes no localStorage e devolve updated_at', async () => {
    const result = await profile().updateMyProfile({
      display_name: 'Perfil Teste',
      bio: 'Bio local',
      avatar_url: 'data:image/png;base64,abc123',
    }, buildDeps());

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({
        id: 'USER_SELF',
        display_name: 'Perfil Teste',
        bio: 'Bio local',
        avatar_url: 'data:image/png;base64,abc123',
        updated_at: '2026-04-23T12:00:00.000Z',
      }),
    }));

    const stored = JSON.parse(global.localStorage.getItem('kc_local_profile') || '{}');
    expect(stored).toEqual(expect.objectContaining({
      display_name: 'Perfil Teste',
      bio: 'Bio local',
    }));
  });

  test('getMyProfile reflete o estado salvo apos update', async () => {
    await profile().updateMyProfile({ display_name: 'Persistido', bio: 'Bio persistida' }, buildDeps());

    await expect(profile().getMyProfile(buildDeps())).resolves.toEqual(expect.objectContaining({
      display_name: 'Persistido',
      bio: 'Bio persistida',
    }));
  });

  test('usa KCProfiles.commitProfile quando disponivel', async () => {
    window.KCProfiles = {
      commitProfile: jest.fn((value) => value),
    };

    const result = await profile().updateMyProfile({ display_name: 'Commitado' }, buildDeps());

    expect(result.ok).toBe(true);
    expect(window.KCProfiles.commitProfile).toHaveBeenCalledTimes(1);
    expect(window.document.dispatchEvent).not.toHaveBeenCalled();
  });

  test('faz fallback para evento kc:profilechange quando KCProfiles nao existe', async () => {
    const result = await profile().updateMyProfile({ display_name: 'Sem facade' }, buildDeps());

    expect(result.ok).toBe(true);
    expect(window.document.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(window.document.dispatchEvent.mock.calls[0][0]).toEqual(expect.objectContaining({
      type: 'kc:profilechange',
      detail: { profile: expect.objectContaining({ display_name: 'Sem facade' }) },
    }));
  });

  test('faz fallback para evento quando KCProfiles.commitProfile falha', async () => {
    window.KCProfiles = {
      commitProfile: jest.fn(() => { throw new Error('boom'); }),
    };

    const result = await profile().updateMyProfile({ display_name: 'Recuperado' }, buildDeps());

    expect(result.ok).toBe(true);
    expect(window.KCProfiles.commitProfile).toHaveBeenCalledTimes(1);
    expect(window.document.dispatchEvent).toHaveBeenCalledTimes(1);
  });
});

describe('local.profile.adapter.js - uploadProfileAvatar', () => {
  test('aceita data URL', async () => {
    await expect(profile().uploadProfileAvatar('data:image/png;base64,abc')).resolves.toEqual({
      ok: true,
      data: { url: 'data:image/png;base64,abc', path: null },
    });
  });

  test('aceita URL remota http/https', async () => {
    await expect(profile().uploadProfileAvatar('https://cdn.example.com/avatar.png')).resolves.toEqual({
      ok: true,
      data: { url: 'https://cdn.example.com/avatar.png', path: null },
    });
  });

  test('rejeita string com formato invalido', async () => {
    const result = await profile().uploadProfileAvatar('avatar.png');
    expect(result.ok).toBe(false);
  });

  test('retorna erro quando nao ha string valida nem FileReader suportado', async () => {
    const result = await profile().uploadProfileAvatar('');
    expect(result.ok).toBe(false);
    expect(result.error.message).toContain('Upload');
  });

  test('converte objeto com FileReader para data URL', async () => {
    const originalFileReader = global.FileReader;

    function FileReaderMock() {
      this.result = null;
    }
    FileReaderMock.prototype.readAsDataURL = function () {
      this.result = 'data:image/png;base64,reader';
      this.onload();
    };

    window.FileReader = FileReaderMock;
    global.FileReader = FileReaderMock;

    try {
      await expect(profile().uploadProfileAvatar({ name: 'avatar.png' })).resolves.toEqual({
        ok: true,
        data: { url: 'data:image/png;base64,reader', path: null },
      });
    } finally {
      if (typeof originalFileReader === 'undefined') {
        delete window.FileReader;
        delete global.FileReader;
      } else {
        window.FileReader = originalFileReader;
        global.FileReader = originalFileReader;
      }
    }
  });

  test('retorna erro quando FileReader falha', async () => {
    const originalFileReader = global.FileReader;

    function FileReaderMock() {}
    FileReaderMock.prototype.readAsDataURL = function () {
      this.onerror();
    };

    window.FileReader = FileReaderMock;
    global.FileReader = FileReaderMock;

    try {
      const result = await profile().uploadProfileAvatar({ name: 'avatar.png' });
      expect(result.ok).toBe(false);
      expect(result.error.message).toContain('ler');
    } finally {
      if (typeof originalFileReader === 'undefined') {
        delete window.FileReader;
        delete global.FileReader;
      } else {
        window.FileReader = originalFileReader;
        global.FileReader = originalFileReader;
      }
    }
  });
});

describe('local.profile.adapter.js - integracao com driver local', () => {
  test('driver delega getMyProfile para o submodulo', async () => {
    const stub = {
      ...actualProfileModule,
      getMyProfile: jest.fn().mockResolvedValue({ id: 'USER_SELF', display_name: 'Driver Perfil' }),
    };
    window._KCLA.profile = stub;

    await expect(driver.getMyProfile()).resolves.toEqual({ id: 'USER_SELF', display_name: 'Driver Perfil' });
    expect(stub.getMyProfile).toHaveBeenCalledTimes(1);
  });

  test('driver delega updateMyProfile para o submodulo', async () => {
    const stub = {
      ...actualProfileModule,
      updateMyProfile: jest.fn().mockResolvedValue({ ok: true, data: { display_name: 'Driver Update' } }),
    };
    window._KCLA.profile = stub;

    await expect(driver.updateMyProfile({ display_name: 'Driver Update' })).resolves.toEqual({
      ok: true,
      data: { display_name: 'Driver Update' },
    });
    expect(stub.updateMyProfile).toHaveBeenCalledWith({ display_name: 'Driver Update' }, expect.any(Object));
  });

  test('driver delega uploadProfileAvatar para o submodulo', async () => {
    const stub = {
      ...actualProfileModule,
      uploadProfileAvatar: jest.fn().mockResolvedValue({ ok: true, data: { url: 'data:image/png;base64,driver', path: null } }),
    };
    window._KCLA.profile = stub;

    await expect(driver.uploadProfileAvatar('data:image/png;base64,driver')).resolves.toEqual({
      ok: true,
      data: { url: 'data:image/png;base64,driver', path: null },
    });
    expect(stub.uploadProfileAvatar).toHaveBeenCalledWith('data:image/png;base64,driver', expect.any(Object));
  });
});

let localAdapter;

beforeAll(() => {
  global.window = global.window || global;

  // Mock localStorage
  const store = {};
  global.localStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };

  // Mock KC_ENV antes de carregar constants
  window.KC_ENV = { driver: 'local', environment: 'development' };
  require('../assets/js/kc-constants.js');
  require('../assets/js/kc-utils.js');

  // Mock KCAPI com interface minima antes de carregar o adapter
  window.KCAPI = window.KCAPI || {};
  window.KCAPI.registerAdapter = jest.fn();
  window.KCAPI.ENV = { driver: 'local' };
  window.KCAPI.config = { fallbackDatabaseURLs: [], baseURL: '' };
  window.KCAPI.fetchJSON = jest.fn().mockResolvedValue({ anuncios: [] });
  window.KCAPI.filterPosts = jest.fn((posts) => posts);
  window.KCAPI.normalizePost = jest.fn((p) => p);
  window.KCAPI.MOCK_USERS_LIST = [];
  window.KCAPI.MOCK_USERS_BY_ID = {};
  window.KCAPI.apiURL = jest.fn((path) => '/api/v1/' + path);
  window.KCAPI.VERSION = '9.0.0';
  window.KCAPI.DEFAULTS = { fallbackDatabaseURLs: [] };

  require('../assets/js/adapters/local.adapter.js');
});

describe('Local Adapter - Registro do driver', () => {
  test('registerAdapter foi chamado exatamente uma vez', () => {
    expect(window.KCAPI.registerAdapter).toHaveBeenCalledTimes(1);
  });

  test('registerAdapter foi chamado com nome "local"', () => {
    expect(window.KCAPI.registerAdapter).toHaveBeenCalledWith(
      'local',
      expect.any(Object)
    );
  });

  test('objeto do driver contem a propriedade name = "local"', () => {
    const driverObj = window.KCAPI.registerAdapter.mock.calls[0][1];
    expect(driverObj.name).toBe('local');
  });

  test('driver expoe todas as funcoes obrigatorias da interface', () => {
    const driverObj = window.KCAPI.registerAdapter.mock.calls[0][1];
    const requiredMethods = [
      'getPosts',
      'getPostById',
      'getRelatedPosts',
      'createPost',
      'reportPost',
      'getComments',
      'addComment',
      'likeComment',
      'votePost',
      'getMyVote',
      'createHelpRequest',
      'listAdminHelpRequests',
      'updateAdminHelpRequest',
    ];
    requiredMethods.forEach((method) => {
      expect(typeof driverObj[method]).toBe('function');
    });
  });

  test('driver e um objeto congelado (Object.freeze)', () => {
    const driverObj = window.KCAPI.registerAdapter.mock.calls[0][1];
    expect(Object.isFrozen(driverObj)).toBe(true);
  });
});

describe('Local Adapter - Stubs retornam valores seguros', () => {
  let driver;

  beforeAll(() => {
    driver = window.KCAPI.registerAdapter.mock.calls[0][1];
  });

  test('reportPost retorna objeto com ok=false', async () => {
    const result = await driver.reportPost();
    expect(result).toEqual(expect.objectContaining({ ok: false }));
  });

  test('votePost retorna null', async () => {
    const result = await driver.votePost();
    expect(result).toBeNull();
  });

  test('togglePostStatus retorna indisponivel no modo local', async () => {
    const result = await driver.togglePostStatus();
    expect(result.code).toBe('UNAVAILABLE');
  });

  test('getTopContributors retorna array vazio', async () => {
    const result = await driver.getTopContributors();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

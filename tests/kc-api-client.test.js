beforeAll(() => {
  global.window = global.window || global;

  // KC_ENV deve ser definido antes de carregar o api client
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
  require('../assets/js/kc-api.client.js');
});

describe('KCAPI - API Client', () => {
  let api;

  beforeEach(() => {
    api = window.KCAPI;
  });

  // ── 1. Existencia e propriedades basicas ─────────────────────────────

  test('KCAPI existe como propriedade de window', () => {
    expect(window.KCAPI).toBeDefined();
  });

  test('KCAPI esta congelado', () => {
    expect(Object.isFrozen(api)).toBe(true);
  });

  // ── 2. VERSION ───────────────────────────────────────────────────────

  describe('VERSION', () => {
    test('existe e e uma string', () => {
      expect(typeof api.VERSION).toBe('string');
    });

    test('possui formato de versao semver', () => {
      expect(api.VERSION).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  // ── 3. ENV ───────────────────────────────────────────────────────────

  describe('ENV', () => {
    test('possui propriedade driver', () => {
      expect(api.ENV).toHaveProperty('driver');
      expect(typeof api.ENV.driver).toBe('string');
    });

    test('possui propriedade environment', () => {
      expect(api.ENV).toHaveProperty('environment');
      expect(typeof api.ENV.environment).toBe('string');
    });

    test('possui propriedade isProduction como boolean', () => {
      expect(api.ENV).toHaveProperty('isProduction');
      expect(typeof api.ENV.isProduction).toBe('boolean');
    });

    test('environment normalizado para development em ambiente de teste', () => {
      expect(api.ENV.environment).toBe('development');
    });

    test('driver e local em ambiente de teste', () => {
      expect(api.ENV.driver).toBe('local');
    });

    test('isProduction e false em ambiente de teste', () => {
      expect(api.ENV.isProduction).toBe(false);
    });

    test('SUPABASE_URL esta presente e normalizado', () => {
      expect(api.ENV.SUPABASE_URL).toBe('https://test.supabase.co');
    });

    test('supabase.url esta presente e normalizado', () => {
      expect(api.ENV.supabase.url).toBe('https://test.supabase.co');
    });
  });

  // ── 4. DEFAULTS ──────────────────────────────────────────────────────

  describe('DEFAULTS', () => {
    test('existe como objeto', () => {
      expect(api.DEFAULTS).toBeDefined();
      expect(typeof api.DEFAULTS).toBe('object');
    });

    test('possui fallbackDatabaseURLs como array', () => {
      expect(Array.isArray(api.DEFAULTS.fallbackDatabaseURLs)).toBe(true);
    });

    test('possui timeoutMs numerico', () => {
      expect(typeof api.DEFAULTS.timeoutMs).toBe('number');
      expect(api.DEFAULTS.timeoutMs).toBeGreaterThan(0);
    });
  });

  // ── 5. config ────────────────────────────────────────────────────────

  describe('config', () => {
    test('existe como objeto', () => {
      expect(api.config).toBeDefined();
      expect(typeof api.config).toBe('object');
    });
  });

  // ── 6. setLastCreatePostError ────────────────────────────────────────

  describe('setLastCreatePostError', () => {
    afterEach(() => {
      api.clearLastCreatePostError();
    });

    test('cria objeto de erro com stage, message, code, details, hint, context, at', () => {
      const err = { message: 'Falha no insert', code: '23505', details: 'duplicated', hint: 'check PK' };
      const result = api.setLastCreatePostError('INSERT', err, { moduleDB: 'moradia' });

      expect(result.stage).toBe('INSERT');
      expect(result.message).toBe('Falha no insert');
      expect(result.code).toBe('23505');
      expect(result.details).toBe('duplicated');
      expect(result.hint).toBe('check PK');
      expect(result.context).toEqual({ moduleDB: 'moradia' });
      expect(result.at).toBeDefined();
      expect(typeof result.at).toBe('string');
    });

    test('normaliza erro null para "Erro desconhecido."', () => {
      const result = api.setLastCreatePostError('VALIDATION', null);
      expect(result.message).toBe('Erro desconhecido.');
      expect(result.code).toBe('UNKNOWN');
      expect(result.details).toBeNull();
      expect(result.hint).toBeNull();
    });

    test('normaliza erro string para message direta', () => {
      const result = api.setLastCreatePostError('PARSE', 'Formato invalido');
      expect(result.message).toBe('Formato invalido');
      expect(result.code).toBe('ERROR_STRING');
    });

    test('normaliza erro com apenas message', () => {
      const result = api.setLastCreatePostError('UPLOAD', { message: 'Timeout' });
      expect(result.message).toBe('Timeout');
      expect(result.code).toBe('UNKNOWN');
    });

    test('normaliza erro com message e code', () => {
      const result = api.setLastCreatePostError('RPC', { message: 'RPC falhou', code: 'P0001' });
      expect(result.message).toBe('RPC falhou');
      expect(result.code).toBe('P0001');
    });

    test('stage default e EXCEPTION quando nao informado', () => {
      const result = api.setLastCreatePostError(null, 'erro');
      expect(result.stage).toBe('EXCEPTION');
    });

    test('context null quando nao e objeto', () => {
      const result = api.setLastCreatePostError('TEST', 'erro', 'string-context');
      expect(result.context).toBeNull();
    });

    test('at e uma string ISO de data', () => {
      const result = api.setLastCreatePostError('TEST', 'erro');
      expect(() => new Date(result.at)).not.toThrow();
      const parsed = new Date(result.at);
      expect(parsed.getTime()).toBeGreaterThan(0);
    });
  });

  // ── 7. getLastCreatePostError ────────────────────────────────────────

  describe('getLastCreatePostError', () => {
    afterEach(() => {
      api.clearLastCreatePostError();
    });

    test('retorna null quando nenhum erro foi registrado', () => {
      expect(api.getLastCreatePostError()).toBeNull();
    });

    test('retorna copia do ultimo erro registrado', () => {
      api.setLastCreatePostError('INSERT', { message: 'fail', code: 'ERR' });
      const err = api.getLastCreatePostError();
      expect(err).not.toBeNull();
      expect(err.message).toBe('fail');
      expect(err.stage).toBe('INSERT');
    });

    test('retorna copia independente (nao a referencia original)', () => {
      api.setLastCreatePostError('TEST', { message: 'original' });
      const err1 = api.getLastCreatePostError();
      const err2 = api.getLastCreatePostError();
      expect(err1).toEqual(err2);
      expect(err1).not.toBe(err2);
    });
  });

  // ── 8. clearLastCreatePostError ──────────────────────────────────────

  describe('clearLastCreatePostError', () => {
    test('limpa o erro armazenado', () => {
      api.setLastCreatePostError('TEST', 'erro de teste');
      expect(api.getLastCreatePostError()).not.toBeNull();

      api.clearLastCreatePostError();
      expect(api.getLastCreatePostError()).toBeNull();
    });

    test('pode ser chamado multiplas vezes sem erro', () => {
      api.clearLastCreatePostError();
      api.clearLastCreatePostError();
      expect(api.getLastCreatePostError()).toBeNull();
    });
  });

  // ── 9. summarizeCreatePayloadForDiagnostics ──────────────────────────

  describe('summarizeCreatePayloadForDiagnostics', () => {
    test('retorna resumo com campos esperados', () => {
      const parsed = {
        moduleDB: 'moradia',
        categoryDB: 'republica',
        subcategoryDB: '',
        title: 'Republica perto da UFG',
        description: 'Descricao detalhada do anuncio de moradia',
        images: ['img1.jpg', 'img2.jpg'],
      };
      const result = api.summarizeCreatePayloadForDiagnostics(parsed);

      expect(result.moduleDB).toBe('moradia');
      expect(result.categoryDB).toBe('republica');
      expect(result.titleLength).toBe(parsed.title.length);
      expect(result.descriptionLength).toBe(parsed.description.length);
      expect(result.imagesCount).toBe(2);
    });

    test('retorna valores padrao para payload vazio', () => {
      const result = api.summarizeCreatePayloadForDiagnostics({});
      expect(result.moduleDB).toBe('');
      expect(result.categoryDB).toBe('');
      expect(result.titleLength).toBe(0);
      expect(result.descriptionLength).toBe(0);
      expect(result.imagesCount).toBe(0);
    });

    test('retorna valores padrao para payload null', () => {
      const result = api.summarizeCreatePayloadForDiagnostics(null);
      expect(result.moduleDB).toBe('');
      expect(result.imagesCount).toBe(0);
    });

    test('imagesCount e 0 quando images nao e array', () => {
      const result = api.summarizeCreatePayloadForDiagnostics({ images: 'nao-e-array' });
      expect(result.imagesCount).toBe(0);
    });

    test('subcategoryDB e preservado quando informado', () => {
      const result = api.summarizeCreatePayloadForDiagnostics({ subcategoryDB: 'exatas' });
      expect(result.subcategoryDB).toBe('exatas');
    });
  });
});

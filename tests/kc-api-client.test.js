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
  require('../assets/js/kc-api.notifications.js');
  require('../assets/js/kc-api.saved.js');
  require('../assets/js/kc-api.help.js');
  require('../assets/js/kc-api.posts-read.js');
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

  describe('getFeedCursor', () => {
    let originalDriver;

    beforeEach(() => {
      originalDriver = window.KC_ENV.driver;
    });

    afterEach(() => {
      window.KC_ENV.driver = originalDriver;
    });

    test('delega para o driver ativo quando getFeedCursor existe', async () => {
      const payload = { posts: [{ id: '1' }], nextCursor: 'abc', hasMore: true };
      api.registerAdapter('local', {
        name: 'local',
        getPosts: jest.fn().mockResolvedValue([]),
        getFeedCursor: jest.fn().mockResolvedValue(payload),
      });

      window.KC_ENV.driver = 'local';
      const result = await api.getFeedCursor({ limit: 12 });

      expect(result).toEqual(payload);
    });

    test('faz fallback para getPosts quando o driver nao expõe getFeedCursor', async () => {
      api.registerAdapter('local', {
        name: 'local',
        getPosts: jest.fn().mockResolvedValue([{ id: 'fallback-post' }]),
      });

      window.KC_ENV.driver = 'local';
      const result = await api.getFeedCursor({ limit: 12 });

      expect(result).toEqual({
        posts: [{ id: 'fallback-post' }],
        nextCursor: null,
        hasMore: false,
      });
    });
  });

  describe('searchPosts', () => {
    let originalDriver;

    beforeEach(() => {
      originalDriver = window.KC_ENV.driver;
    });

    afterEach(() => {
      window.KC_ENV.driver = originalDriver;
    });

    test('delega para o driver ativo quando searchPosts existe', async () => {
      api.registerAdapter('local', {
        name: 'local',
        getPosts: jest.fn().mockResolvedValue([]),
        searchPosts: jest.fn().mockResolvedValue([{ id: 'search-post' }]),
      });

      window.KC_ENV.driver = 'local';
      const result = await api.searchPosts({ q: 'notebook', limit: 8 });

      expect(result).toEqual([{ id: 'search-post' }]);
    });

    test('faz fallback para getPosts quando o driver nao expoe searchPosts', async () => {
      api.registerAdapter('local', {
        name: 'local',
        getPosts: jest.fn().mockResolvedValue([{ id: 'legacy-search' }]),
      });

      window.KC_ENV.driver = 'local';
      const result = await api.searchPosts({ q: 'notebook', limit: 8 });

      expect(result).toEqual([{ id: 'legacy-search' }]);
    });
  });

  describe('capability dispatch beyond Supabase', () => {
    let originalDriver;
    let localAdapter;

    beforeEach(() => {
      originalDriver = window.KC_ENV.driver;
      localAdapter = {
        name: 'local',
        getPosts: jest.fn().mockResolvedValue([]),
        getMyProfile: jest.fn().mockResolvedValue({ id: 'USER_SELF', display_name: 'Perfil Local' }),
        updateMyProfile: jest.fn().mockResolvedValue({ ok: true, data: { id: 'USER_SELF', display_name: 'Novo Nome' } }),
        uploadProfileAvatar: jest.fn().mockResolvedValue({ ok: true, data: { url: 'data:image/png;base64,abc' } }),
        getMyPosts: jest.fn().mockResolvedValue([{ id: 'post-1' }]),
        getSavedPostState: jest.fn().mockResolvedValue({ kinds: ['favorite'] }),
        setSavedPostState: jest.fn().mockResolvedValue({ ok: true, enabled: true }),
        clearSavedPostState: jest.fn().mockResolvedValue({ ok: true, cleared: 'favorite' }),
        getMySavedPosts: jest.fn().mockResolvedValue([{ id: 'post-1', save_kinds: ['favorite'] }]),
        getMySavedPostsCount: jest.fn().mockResolvedValue(1),
        getProfileHighlights: jest.fn().mockResolvedValue([{ id: 'post-1', save_kinds: ['highlight'] }]),
        getProfileHighlightsCount: jest.fn().mockResolvedValue(1),
      };
      api.registerAdapter('local', localAdapter);
      window.KC_ENV.driver = 'local';
    });

    afterEach(() => {
      window.KC_ENV.driver = originalDriver;
    });

    test('usa getMyProfile do driver local quando ele existe', async () => {
      await expect(api.getMyProfile()).resolves.toEqual({ id: 'USER_SELF', display_name: 'Perfil Local' });
    });

    test('delegates saved posts and profile surfaces by capability, not by driver name', async () => {
      await expect(api.getMyPosts({ page: 1 })).resolves.toEqual([{ id: 'post-1' }]);
      await expect(api.getSavedPostState('post-1')).resolves.toEqual({ kinds: ['favorite'] });
      await expect(api.setSavedPostState('post-1', 'favorite', true)).resolves.toEqual({ ok: true, enabled: true });
      await expect(api.clearSavedPostState('post-1', 'favorite')).resolves.toEqual({ ok: true, cleared: 'favorite' });
      await expect(api.getMySavedPosts({})).resolves.toEqual([{ id: 'post-1', save_kinds: ['favorite'] }]);
      await expect(api.getMySavedPostsCount({})).resolves.toBe(1);
      await expect(api.getProfileHighlights('USER_SELF', {})).resolves.toEqual([{ id: 'post-1', save_kinds: ['highlight'] }]);
      await expect(api.getProfileHighlightsCount('USER_SELF', { page: 2, limit: 5 })).resolves.toBe(1);

      expect(localAdapter.getProfileHighlightsCount).toHaveBeenCalledWith('USER_SELF', { page: 2, limit: 5 });
    });

    test('usa updateMyProfile e uploadProfileAvatar do driver local quando disponiveis', async () => {
      await expect(api.updateMyProfile({ display_name: 'Novo Nome' })).resolves.toEqual({
        ok: true,
        data: { id: 'USER_SELF', display_name: 'Novo Nome' },
      });
      await expect(api.uploadProfileAvatar('data:image/png;base64,abc')).resolves.toEqual({
        ok: true,
        data: { url: 'data:image/png;base64,abc' },
      });
    });
  });

  describe('filterPosts - requestParams avancados', () => {
    test('filtra marketplace por categoria, condicao e selo verificado', () => {
      const posts = [
        {
          id: 'market-ok',
          module: 'compra-venda',
          category: 'eletronicos',
          metadata: { condicao: 'Semi-novo' },
          authorVerified: true,
        },
        {
          id: 'market-used',
          module: 'compra-venda',
          category: 'eletronicos',
          metadata: { condicao: 'Usado' },
          authorVerified: true,
        },
        {
          id: 'market-unverified',
          module: 'compra-venda',
          category: 'eletronicos',
          metadata: { condicao: 'Semi-novo' },
          authorVerified: false,
        },
      ];

      const result = api.filterPosts(posts, {
        module: 'compra-venda',
        marketCats: ['eletronicos'],
        marketConds: ['seminovo'],
        marketVerified: true,
      });

      expect(result.map((post) => post.id)).toEqual(['market-ok']);
    });

    test('filtra posts por faixa de preco generica no caminho incremental', () => {
      const posts = [
        { id: 'cheap', module: 'compra-venda', price: 80 },
        { id: 'mid', module: 'compra-venda', price: 250 },
        { id: 'expensive', module: 'compra-venda', price: 1200 },
      ];

      const result = window.KCAPI.filterPosts(posts, {
        module: 'compra-venda',
        priceMin: 100,
        priceMax: 500,
      });

      expect(result.map((post) => post.id)).toEqual(['mid']);
    });

    test('filtra modulos de recencia por datePreset usando created_at em America/Sao_Paulo', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-04-06T12:00:00-03:00'));

      try {
        const posts = [
          { id: 'recent', module: 'moradia', created_at: '2026-04-06T09:00:00-03:00' },
          { id: 'week-old', module: 'moradia', created_at: '2026-04-01T09:00:00-03:00' },
          { id: 'old', module: 'moradia', created_at: '2026-03-01T09:00:00-03:00' },
        ];

        const result = window.KCAPI.filterPosts(posts, {
          module: 'moradia',
          datePreset: 'last7d',
        });

        expect(result.map((post) => post.id)).toEqual(['recent', 'week-old']);
      } finally {
        jest.useRealTimers();
      }
    });

    test('filtra eventos por data_evento e usa created_at como fallback quando metadata esta vazia', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-04-06T12:00:00-03:00'));

      try {
        const posts = [
          {
            id: 'event-next',
            module: 'eventos',
            metadata: { data_evento: '2026-04-10' },
            created_at: '2026-04-01T09:00:00-03:00',
          },
          {
            id: 'event-fallback-today',
            module: 'eventos',
            metadata: {},
            created_at: '2026-04-06T08:30:00-03:00',
          },
          {
            id: 'event-past',
            module: 'eventos',
            metadata: { data: '2026-04-02' },
            created_at: '2026-04-02T08:30:00-03:00',
          },
        ];

        const next7d = window.KCAPI.filterPosts(posts, {
          module: 'eventos',
          datePreset: 'next7d',
        });
        const today = window.KCAPI.filterPosts(posts, {
          module: 'eventos',
          datePreset: 'today',
        });

        expect(next7d.map((post) => post.id)).toEqual(['event-next', 'event-fallback-today']);
        expect(today.map((post) => post.id)).toEqual(['event-fallback-today']);
      } finally {
        jest.useRealTimers();
      }
    });

    test('filtra caronas por periodo, campus, origem, destino, feature e verificado', () => {
      const posts = [
        {
          id: 'ride-ok',
          module: 'caronas',
          category: 'ofereco',
          title: 'Ofereço carona saindo do Campus Samambaia',
          metadata: {
            origem: 'Campus Samambaia',
            destino: 'Centro',
            horario: '07:30',
            caronasFeatureKeys: ['ar-condicionado', 'som'],
          },
          authorVerified: true,
        },
        {
          id: 'ride-late',
          module: 'caronas',
          category: 'ofereco',
          title: 'Ofereço carona saindo do Campus Samambaia',
          metadata: {
            origem: 'Campus Samambaia',
            destino: 'Centro',
            horario: '19:30',
            caronasFeatureKeys: ['ar-condicionado'],
          },
          authorVerified: true,
        },
      ];

      const result = api.filterPosts(posts, {
        module: 'caronas',
        rideType: ['ofereco'],
        rideCampus: ['campus-samambaia'],
        ridePeriod: ['matutino'],
        rideFeatures: ['ar-condicionado'],
        rideVerified: true,
        rideOrigin: 'samambaia',
        rideDestination: 'centro',
      });

      expect(result.map((post) => post.id)).toEqual(['ride-ok']);
    });

    test('filtra moradia por regiao ou zona e exige todas as features selecionadas', () => {
      const originalKCUtils = window.KCUtils;
      window.KCUtils = {
        ...originalKCUtils,
        resolveHousingRegion: jest.fn((post) => ({
          key: post.regionKey || (post.metadata && post.metadata.regionKey) || '',
          zoneKey: post.regionZoneKey || (post.metadata && post.metadata.regionZoneKey) || '',
        })),
        resolveHousingFeatures: jest.fn((post) => {
          const keys = []
            .concat(Array.isArray(post.housingFeatureKeys) ? post.housingFeatureKeys : [])
            .concat(Array.isArray(post.metadata && post.metadata.housingFeatureKeys) ? post.metadata.housingFeatureKeys : []);
          return Array.from(new Set(keys)).map((key) => ({ key, label: key }));
        }),
      };
      try {
        const posts = [
          {
            id: 'housing-ok',
            module: 'moradia',
            regionKey: 'praca-universitaria',
            regionLabel: 'Praça Universitária',
            regionZoneKey: 'leste',
            housingFeatureKeys: ['aceita-pets', 'wifi'],
            housingFeatureLabels: ['Aceita pets', 'Wi-Fi'],
            metadata: {
              regionKey: 'praca-universitaria',
              regionLabel: 'Praça Universitária',
              regionZoneKey: 'leste',
              housingFeatureKeys: ['aceita-pets', 'wifi'],
              housingFeatureLabels: ['Aceita pets', 'Wi-Fi'],
            },
          },
          {
            id: 'housing-missing-feature',
            module: 'moradia',
            regionKey: 'praca-universitaria',
            regionLabel: 'Praça Universitária',
            regionZoneKey: 'leste',
            housingFeatureKeys: ['wifi'],
            housingFeatureLabels: ['Wi-Fi'],
            metadata: {
              regionKey: 'praca-universitaria',
              regionLabel: 'Praça Universitária',
              regionZoneKey: 'leste',
              housingFeatureKeys: ['wifi'],
              housingFeatureLabels: ['Wi-Fi'],
            },
          },
        ];

        const result = api.filterPosts(posts, {
          module: 'moradia',
          housingFeatures: ['aceita-pets'],
          housingRegion: 'praca-universitaria',
        });

        expect(result.map((post) => post.id)).toEqual(['housing-ok']);
      } finally {
        window.KCUtils = originalKCUtils;
      }
    });

    test('filtra oportunidades por tipo, modo e area', () => {
      const posts = [
        {
          id: 'opp-ok',
          module: 'oportunidades',
          category: 'emprego',
          title: 'Vaga remota CLT para desenvolvimento web',
          metadata: {
            areaKey: 'tecnologia',
            workMode: 'remoto',
            employmentType: 'clt',
          },
        },
        {
          id: 'opp-hybrid',
          module: 'oportunidades',
          category: 'emprego',
          title: 'Vaga híbrida CLT para design',
          metadata: {
            areaKey: 'design',
            workMode: 'hibrido',
            employmentType: 'clt',
          },
        },
      ];

      const result = api.filterPosts(posts, {
        module: 'oportunidades',
        oppType: ['emprego-clt'],
        oppMode: ['remoto'],
        oppArea: 'tecnologia',
      });

      expect(result.map((post) => post.id)).toEqual(['opp-ok']);
    });

    test('filtra achados e perdidos por status, tipo e localizacao', () => {
      const originalKCUtils = window.KCUtils;
      window.KCUtils = {
        ...originalKCUtils,
        resolveLostFoundLocation: jest.fn((post) => ({
          key: post.lostFoundLocationKey || (post.metadata && post.metadata.lostFoundLocationKey) || '',
        })),
      };
      try {
        const posts = [
          {
            id: 'lf-ok',
            module: 'achados-perdidos',
            categoria: 'perdido',
            subcategoria: 'documento',
            lostFoundLocationKey: 'biblioteca',
            metadata: {
              lostFoundLocationKey: 'biblioteca',
            },
          },
          {
            id: 'lf-other',
            module: 'achados-perdidos',
            categoria: 'encontrado',
            subcategoria: 'eletronico',
            lostFoundLocationKey: 'ru',
            metadata: {
              lostFoundLocationKey: 'ru',
            },
          },
        ];

        const result = api.filterPosts(posts, {
          module: 'achados-perdidos',
          lfStatus: ['perdido'],
          lfType: ['documento'],
          lfLocation: 'biblioteca',
        });

        expect(result.map((post) => post.id)).toEqual(['lf-ok']);
      } finally {
        window.KCUtils = originalKCUtils;
      }
    });
  });
});

describe('KCAPI - user ratings', () => {
  let api;

  beforeEach(() => {
    api = window.KCAPI;
    api.registerAdapter('local', {
      name: 'local',
      getUserRatingSummary: jest.fn().mockResolvedValue({ user_id: 'USER_01', rating_avg: 4.75, rating_count: 8 }),
      getUserRatingState: jest.fn().mockResolvedValue({
        target_user_id: 'USER_01',
        context_post_id: 'post-1',
        can_rate: true,
        reason: 'OK',
        myRating: {
          id: 'rating-1',
          target_user_id: 'USER_01',
          rater_user_id: 'USER_SELF',
          context_post_id: 'post-1',
          rating: 5,
          comment: 'Ótima experiência',
        },
      }),
      listUserRatings: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'rating-1',
            target_user_id: 'USER_01',
            rater_user_id: 'USER_SELF',
            rating: 5,
            comment: 'Ótima experiência',
          },
        ],
        page: 1,
        limit: 10,
        total: 1,
        has_more: false,
      }),
      upsertUserRating: jest.fn().mockResolvedValue({
        ok: true,
        rating: {
          id: 'rating-1',
          target_user_id: 'USER_01',
          rater_user_id: 'USER_SELF',
          rating: 4,
          comment: 'Confiável',
        },
        summary: {
          user_id: 'USER_01',
          rating_avg: 4.0,
          rating_count: 1,
        },
      }),
    });
  });

  test('normaliza resumo recebido do driver', async () => {
    await expect(api.getUserRatingSummary('USER_01')).resolves.toEqual({
      userId: 'USER_01',
      average: 4.75,
      count: 8,
    });
  });

  test('normaliza estado e avaliação do viewer', async () => {
    const result = await api.getUserRatingState({ targetUserId: 'USER_01', contextPostId: 'post-1' });

    expect(result.canRate).toBe(true);
    expect(result.reason).toBe('OK');
    expect(result.myRating).toEqual(expect.objectContaining({
      targetUserId: 'USER_01',
      contextPostId: 'post-1',
      rating: 5,
    }));
  });

  test('normaliza listagem paginada de avaliações', async () => {
    const result = await api.listUserRatings('USER_01', { page: 1, limit: 10 });

    expect(result.total).toBe(1);
    expect(result.hasMore).toBe(false);
    expect(result.items[0]).toEqual(expect.objectContaining({
      targetUserId: 'USER_01',
      rating: 5,
    }));
  });

  test('normaliza retorno de upsert', async () => {
    const result = await api.upsertUserRating({
      targetUserId: 'USER_01',
      rating: 4,
      comment: 'Confiável',
    });

    expect(result.ok).toBe(true);
    expect(result.rating).toEqual(expect.objectContaining({
      targetUserId: 'USER_01',
      rating: 4,
    }));
    expect(result.summary).toEqual({
      userId: 'USER_01',
      average: 4,
      count: 1,
    });
  });
});

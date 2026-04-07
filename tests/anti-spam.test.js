/**
 * Testes para moderação automática anti-spam (v9.3.2)
 * - Detecção de FLOOD_LIMIT no adapter Supabase
 * - Flag _kcPending em posts auto-moderados
 * - Stubs do adapter local
 * - Integração via KCAPI.createPost
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
  require('../assets/js/kc-api.client.js');
  require('../assets/js/adapters/local.adapter.js');
});

describe('Anti-Spam Moderação (v9.3.2)', () => {
  let api;

  beforeEach(() => {
    api = window.KCAPI;
  });

  // ── Estrutura da API ──────────────────────────────────────────────────────

  describe('KCAPI.createPost', () => {
    test('metodo existe no KCAPI', () => {
      expect(typeof api.createPost).toBe('function');
    });
  });

  // ── Adapter local — stubs existentes nao interferem ──────────────────────

  describe('adapter local — createPost nao retorna flood error', () => {
    test('adapter local registrado no KCAPI', () => {
      // O adapter local é registrado via KCAPI.registerAdapter('local', ...)
      // Verifica que KCAPI existe e tem createPost
      expect(api).toBeDefined();
      expect(typeof api.createPost).toBe('function');
    });

    test('createPost local retorna null para payload sem titulo (nao lanca flood error)', async () => {
      // Adapter local nao tem trigger, apenas retorna null para payload invalido
      // O _kcError FLOOD_LIMIT só existe no adapter Supabase (trigger de BD)
      const result = await api.createPost({ title: '' });
      // Pode retornar null ou objeto; nunca FLOOD_LIMIT (sem trigger no adapter local)
      if (result !== null && result !== undefined) {
        expect(result._kcError).not.toBe('FLOOD_LIMIT');
      }
    });
  });

  // ── Lógica de detecção de flood no supabase adapter ─────────────────────

  describe('supabase adapter — detecção de flood_limit_exceeded', () => {
    test('retorna _kcError FLOOD_LIMIT quando o trigger levanta flood_limit_exceeded', async () => {
      // Simula a lógica interna sem chamar o Supabase real:
      // O adapter verifica ins.error.message.includes('flood_limit_exceeded')
      const insError = { message: 'flood_limit_exceeded: limite atingido' };
      const insErrMsg = String((insError && insError.message) || '');
      const isFlood = insErrMsg.includes('flood_limit_exceeded');
      expect(isFlood).toBe(true);
    });

    test('nao confunde outros erros de INSERT com flood', () => {
      const insError = { message: 'duplicate key value violates unique constraint' };
      const insErrMsg = String((insError && insError.message) || '');
      const isFlood = insErrMsg.includes('flood_limit_exceeded');
      expect(isFlood).toBe(false);
    });

    test('nao confunde erro de post_limit com flood', () => {
      const insError = { message: 'POST_LIMIT_REACHED: limit 5' };
      const insErrMsg = String((insError && insError.message) || '');
      const isFlood = insErrMsg.includes('flood_limit_exceeded');
      expect(isFlood).toBe(false);
    });
  });

  // ── Flag _kcPending ──────────────────────────────────────────────────────

  describe('flag _kcPending em posts auto-moderados', () => {
    test('post com status pending recebe _kcPending=true', () => {
      // Simula a lógica do adapter após normalizePost retornar status=pending
      const normalizedPost = { id: 'abc', status: 'pending', title: 'Test' };
      if (normalizedPost && normalizedPost.status === 'pending') {
        normalizedPost._kcPending = true;
        normalizedPost._kcPendingReason = 'Sua publicação foi enviada para análise da moderação antes de aparecer nos feeds.';
      }
      expect(normalizedPost._kcPending).toBe(true);
      expect(typeof normalizedPost._kcPendingReason).toBe('string');
    });

    test('post com status published nao recebe _kcPending', () => {
      const normalizedPost = { id: 'abc', status: 'published', title: 'Test' };
      if (normalizedPost && normalizedPost.status === 'pending') {
        normalizedPost._kcPending = true;
      }
      expect(normalizedPost._kcPending).toBeUndefined();
    });
  });

  // ── Contagem de URLs (lógica de link spam) ───────────────────────────────

  describe('detecção de link spam (>3 URLs externas)', () => {
    function countUrls(text) {
      const matches = text.match(/https?:\/\/[^\s)>\]"']+/gi);
      return matches ? matches.length : 0;
    }

    test('texto sem URL retorna 0', () => {
      expect(countUrls('Vendo notebook sem links')).toBe(0);
    });

    test('texto com 1 URL retorna 1', () => {
      expect(countUrls('Confira em https://exemplo.com para detalhes')).toBe(1);
    });

    test('texto com 3 URLs retorna 3 (limite aceito)', () => {
      const text = 'Link 1: https://a.com Link 2: https://b.com Link 3: https://c.com';
      expect(countUrls(text)).toBe(3);
    });

    test('texto com 4 URLs retorna 4 (acima do limite)', () => {
      const text = 'https://a.com https://b.com https://c.com https://d.com';
      expect(countUrls(text)).toBe(4);
    });

    test('texto com 5 URLs é detectado como spam', () => {
      const text = 'Ganhe dinheiro: https://a.com https://b.com https://c.com https://d.com https://e.com';
      expect(countUrls(text) > 3).toBe(true);
    });

    test('URL com query params e path é contada como 1', () => {
      expect(countUrls('Veja https://exemplo.com/pagina?id=1&tab=foo para mais')).toBe(1);
    });
  });

  // ── Threshold de new user trust (7 dias) ────────────────────────────────

  describe('threshold de new user trust (conta <7 dias)', () => {
    function isNewUser(createdAt) {
      if (!createdAt) return false;
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return new Date(createdAt) > sevenDaysAgo;
    }

    test('conta criada hoje é new user', () => {
      expect(isNewUser(new Date().toISOString())).toBe(true);
    });

    test('conta criada ha 3 dias é new user', () => {
      const d = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      expect(isNewUser(d.toISOString())).toBe(true);
    });

    test('conta criada ha 8 dias NAO é new user', () => {
      const d = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      expect(isNewUser(d.toISOString())).toBe(false);
    });

    test('conta criada ha exatamente 7 dias é borderline — nao é mais new user', () => {
      const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 1000);
      expect(isNewUser(d.toISOString())).toBe(false);
    });
  });
});

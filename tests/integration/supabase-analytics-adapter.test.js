/**
 * @file supabase-analytics-adapter.test.js
 * @description Static contract tests for supabase.analytics.adapter.js (v11.30.1)
 * Verifica que o sub-adapter exporta todos os métodos esperados via window._KCSA.analytics
 * e que depende de window._KCSA.getClient (não acessa getSupabaseClient diretamente).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ADAPTER_PATH = path.resolve(__dirname, '../../assets/js/adapters/supabase/supabase.analytics.adapter.js');
let source;

beforeAll(() => {
  source = fs.readFileSync(ADAPTER_PATH, 'utf8');
});

describe('supabase.analytics.adapter.js — estrutura IIFE e namespace', () => {
  test('é uma IIFE (function)() ou (() => {})()', () => {
    expect(source).toMatch(/\(function\s*\(\)\s*\{/);
  });

  test("declara 'use strict'", () => {
    expect(source).toContain("'use strict';");
  });

  test('inicializa window._KCSA', () => {
    expect(source).toContain('window._KCSA = window._KCSA || {}');
  });

  test('registra window._KCSA.analytics no final do IIFE', () => {
    expect(source).toContain('window._KCSA.analytics = {');
  });
});

describe('supabase.analytics.adapter.js — helper getClient', () => {
  test('define função getClient() interna', () => {
    expect(source).toContain('function getClient()');
  });

  test('getClient lê window._KCSA.getClient lazily (não usa getSupabaseClient direto)', () => {
    expect(source).toContain('window._KCSA.getClient');
    expect(source).not.toContain('getSupabaseClient()');
  });

  test('resolve getCurrentUser lazily pelo namespace compartilhado', () => {
    expect(source).toContain('function getCurrentUser()');
    expect(source).toContain('window._KCSA.getCurrentUser');
  });
});

describe('supabase.analytics.adapter.js — métodos exportados', () => {
  test('exporta getTopContributors', () => {
    expect(source).toContain('getTopContributors,');
    expect(source).toContain("client.rpc('kc_get_top_contributors'");
  });

  test('exporta trackCouponClick', () => {
    expect(source).toContain('trackCouponClick,');
    expect(source).toContain("client.rpc('kc_track_coupon_click'");
  });

  test('exporta trackShare', () => {
    expect(source).toContain('trackShare,');
    expect(source).toContain("client.rpc('kc_track_share'");
  });

  test('exporta trackView', () => {
    expect(source).toContain('trackView,');
    expect(source).toContain("client.rpc('kc_track_view'");
  });

  test('exporta getPostAnalytics', () => {
    expect(source).toContain('getPostAnalytics,');
    expect(source).toContain("client.rpc('kc_get_post_analytics'");
  });

  test('exporta checkDuplicatePost', () => {
    expect(source).toContain('checkDuplicatePost,');
    expect(source).toContain("client.rpc('kc_check_duplicate_post'");
  });
});

describe('supabase.analytics.adapter.js — padrões defensivos', () => {
  test('retorna [] como fallback de getTopContributors quando sem cliente', () => {
    expect(source).toContain('if (!client) return [];');
  });

  test('retorna { ok: false } como fallback das funções de tracking', () => {
    expect(source).toMatch(/if \(!client\) return \{ ok: false \}/);
  });

  test('usa try/catch em todas as operações RPC', () => {
    const tryCatchCount = (source.match(/} catch \(_\)/g) || []).length;
    expect(tryCatchCount).toBeGreaterThanOrEqual(5);
  });
});

describe('supabase.analytics.adapter.js — autenticação de visualizações', () => {
  function loadAdapter({ user, rpc }) {
    const context = {
      console,
      Promise,
      window: {
        _KCSA: {
          getClient: () => ({ rpc }),
          getCurrentUser: async () => user,
        },
      },
    };
    vm.runInNewContext(source, context, { filename: ADAPTER_PATH });
    return context.window._KCSA.analytics;
  }

  test('não chama kc_track_view para visitante anônimo', async () => {
    const rpc = jest.fn();
    const adapter = loadAdapter({ user: null, rpc });

    await expect(adapter.trackView('11111111-1111-4111-8111-111111111111'))
      .resolves.toEqual({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  test('mantém o tracking para usuário autenticado', async () => {
    const rpc = jest.fn(async () => ({ data: { ok: true }, error: null }));
    const adapter = loadAdapter({
      user: { id: '22222222-2222-4222-8222-222222222222' },
      rpc,
    });

    await expect(adapter.trackView('11111111-1111-4111-8111-111111111111'))
      .resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('kc_track_view', {
      p_post_id: '11111111-1111-4111-8111-111111111111',
    });
  });
});

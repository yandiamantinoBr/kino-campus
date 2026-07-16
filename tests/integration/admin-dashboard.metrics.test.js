'use strict';

const fs = require('fs');
const path = require('path');

const SHARED_PATH = path.resolve(__dirname, '../../assets/js/controllers/admin/admin-dashboard.shared.js');
const METRICS_PATH = path.resolve(__dirname, '../../assets/js/controllers/admin/admin-dashboard.metrics.js');
const CONTROLLER_PATH = path.resolve(__dirname, '../../assets/js/controllers/admin/admin-dashboard.controller.js');
const HTML_PATH = path.resolve(__dirname, '../../admin/index.html');

const REAL_SET_TIMEOUT = global.setTimeout;

function resetRuntime() {
  jest.resetModules();
  global.window = global;
  delete window._KCAD;
  delete window.KCAdminDashboardUtils;
  delete window.KCAPI;
  delete window.KCSupabase;
  delete window.KC_CONSTANTS;
  global.setTimeout = REAL_SET_TIMEOUT;
}

function loadMetricsModule() {
  require(SHARED_PATH);
  require(METRICS_PATH);
  return window._KCAD.metrics;
}

function makeQueryBuilder(handler, initialState) {
  const state = Object.assign({}, initialState);
  const builder = {
    select(columns, options) {
      state.select = { columns, options };
      return builder;
    },
    eq(field, value) {
      state.eq = state.eq || [];
      state.eq.push({ field, value });
      return builder;
    },
    gte(field, value) {
      state.gte = state.gte || [];
      state.gte.push({ field, value });
      return builder;
    },
    lt(field, value) {
      state.lt = state.lt || [];
      state.lt.push({ field, value });
      return builder;
    },
    in(field, value) {
      state.in = state.in || [];
      state.in.push({ field, value });
      return builder;
    },
    limit(value) {
      state.limit = value;
      return builder;
    },
    order(field, options) {
      state.order = { field, options };
      return builder;
    },
    range(from, to) {
      state.range = { from, to };
      return builder;
    },
    maybeSingle() {
      state.maybeSingle = true;
      return builder;
    },
    then(resolve, reject) {
      return Promise.resolve(handler(state)).then((result) => {
        if (result && state.select && state.select.options && state.select.options.count === 'exact'
            && Array.isArray(result.data) && typeof result.count !== 'number') {
          return Object.assign({}, result, { count: result.data.length });
        }
        return result;
      }).then(resolve, reject);
    },
    catch(reject) {
      return Promise.resolve(handler(state)).catch(reject);
    }
  };
  return builder;
}

function makeClient(config) {
  config = config || {};
  return {
    from(table) {
      return makeQueryBuilder(function (state) {
        if (typeof config.fromHandler === 'function') {
          return config.fromHandler(Object.assign({ table }, state));
        }
        return { data: [], error: null };
      }, { table });
    },
    rpc(name, args) {
      if (typeof config.rpcHandler === 'function') {
        return Promise.resolve(config.rpcHandler(name, args));
      }
      return Promise.resolve({ data: [], error: null });
    }
  };
}

let metricsSource;
let controllerSource;
let htmlSource;

beforeAll(() => {
  metricsSource = fs.readFileSync(METRICS_PATH, 'utf8');
  controllerSource = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  htmlSource = fs.readFileSync(HTML_PATH, 'utf8');
});

beforeEach(() => {
  resetRuntime();
});

afterEach(() => {
  resetRuntime();
});

describe('admin-dashboard.metrics.js - contrato estatico', () => {
  test('e uma IIFE com namespace _KCAD.metrics', () => {
    expect(metricsSource).toMatch(/\(function\s*\(\)\s*\{/);
    expect(metricsSource).toContain("'use strict';");
    expect(metricsSource).toContain('window._KCAD = window._KCAD || {}');
    expect(metricsSource).toContain('window._KCAD.metrics = {');
  });

  test('nao usa require/import em runtime', () => {
    expect(metricsSource).not.toMatch(/require\s*\(/);
    expect(metricsSource).not.toMatch(/import\s+/);
  });

  test('expoe exatamente 20 chaves publicas', () => {
    const metrics = loadMetricsModule();
    expect(Object.keys(metrics).sort()).toEqual([
      'checkAccess',
      'classifyTermToModule',
      'loadActiveSessions15m',
      'loadAdOverview',
      'loadAuditEventRows',
      'loadCommentsCount',
      'loadDailyMetrics',
      'loadPostStatusMetrics',
      'loadPostsCreated',
      'loadPostsEdited',
      'loadPostsTotal',
      'loadReportMetrics',
      'loadSavedPostsCount',
      'loadSearchCount',
      'loadSearchTrendsData',
      'loadUsersNew',
      'loadUsersTotal',
      'loadVisiblePostsCount',
      'loadVotesCount',
      'queryCreatedAtRows'
    ]);
  });
});

describe('admin-dashboard.controller.js - contrato do split metrics', () => {
  test('mantem o namespace base e o guard do submodulo', () => {
    expect(controllerSource).toContain('window._KCAD = window._KCAD || {};');
    expect(controllerSource).toContain('window._KCAD.metrics = window._KCAD.metrics || {};');
  });

  test('delega access/loaders ao submodulo extraido', () => {
    expect(controllerSource).toContain("window._KCAD.metrics.checkAccess()");
    expect(controllerSource).toContain("window._KCAD.metrics.classifyTermToModule(term)");
    expect(controllerSource).toContain("window._KCAD.metrics.loadReportMetrics(client, since)");
    expect(controllerSource).toContain("window._KCAD.metrics.loadSearchTrendsData(client, since)");
    expect(controllerSource).toContain("window._KCAD.metrics.loadVisiblePostsCount(client)");
    expect(controllerSource).toContain("window._KCAD.metrics.loadActiveSessions15m(client)");
    expect(controllerSource).toContain("window._KCAD.metrics.loadAdOverview(client, since)");
    expect(controllerSource).toContain("window._KCAD.metrics.loadDailyMetrics(client, since, signal)");
  });

  test('removeu RPCs de metrics do core', () => {
    expect(controllerSource).not.toContain("client.rpc('kc_admin_list_reports'");
    expect(controllerSource).not.toContain("client.rpc('kc_admin_search_trends'");
    expect(controllerSource).not.toContain("client.rpc('kc_admin_dashboard_daily_metrics'");
  });

  test('cards de monetização preservam null como indisponível em vez de converter para zero', () => {
    expect(controllerSource).toContain("'Campanhas ativas', adCampaigns.active");
    expect(controllerSource).toContain("'Cliques em anúncios', adMetrics.clicks");
    expect(controllerSource).toContain("'Impressões de anúncios', adMetrics.impressions");
    expect(controllerSource).not.toContain("'Campanhas ativas', Number(adCampaigns.active) || 0");
    expect(controllerSource).not.toContain("'Cliques em anúncios', Number(adMetrics.clicks) || 0");
    expect(controllerSource).not.toContain("'Impressões de anúncios', Number(adMetrics.impressions) || 0");
  });

  test('preserva o export publico do refresh', () => {
    expect(controllerSource).toContain('window.KCAdminDashboardRefresh = refreshDashboard;');
  });
});

describe('admin/index.html - ordem dos scripts do dashboard admin', () => {
  test('inclui o bloco executivo antes das metricas operacionais', () => {
    const executiveTitle = htmlSource.indexOf('id="admin-executive-title"');
    const executiveGrid = htmlSource.indexOf('id="admin-executive-metrics"');
    const moderationTitle = htmlSource.indexOf('id="admin-moderation-title"');

    expect(executiveTitle).toBeGreaterThan(-1);
    expect(executiveGrid).toBeGreaterThan(executiveTitle);
    expect(moderationTitle).toBeGreaterThan(executiveGrid);
  });

  test('carrega shared -> metrics -> audit -> charts -> kc-ranking -> privacy -> controller', () => {
    const orderedScripts = [
      '<script defer src="../assets/js/controllers/admin/admin-dashboard.shared.js?v=8.6.11"></script>',
      '<script defer src="../assets/js/controllers/admin/admin-dashboard.metrics.js?v=8.6.11"></script>',
      '<script defer src="../assets/js/controllers/admin/admin-dashboard.audit.js?v=8.6.11"></script>',
      '<script defer src="../assets/js/controllers/admin/admin-dashboard.charts.js?v=8.6.11"></script>',
      '<script defer src="../assets/js/features/kc-ranking.js?v=8.6.11"></script>',
      '<script defer src="../assets/js/controllers/admin/admin-dashboard.privacy.js?v=8.6.11"></script>',
      '<script defer src="../assets/js/controllers/admin/admin-dashboard.controller.js?v=8.6.11"></script>'
    ];

    let lastIndex = -1;
    orderedScripts.forEach((scriptTag) => {
      const currentIndex = htmlSource.indexOf(scriptTag);
      expect(currentIndex).toBeGreaterThan(lastIndex);
      lastIndex = currentIndex;
    });
  });
});

describe('window._KCAD.metrics - comportamento', () => {
  test('classifyTermToModule reutiliza o helper compartilhado', () => {
    window.KC_CONSTANTS = { CATEGORY_LABELS: {} };
    const metrics = loadMetricsModule();
    expect(metrics.classifyTermToModule('quartos')).toBe('moradia');
    expect(metrics.classifyTermToModule('celulares')).toBe('compra-venda');
  });

  test('checkAccess falha sem usuario autenticado', async () => {
    window.KCAPI = { getCurrentUser: jest.fn().mockResolvedValue(null) };
    const metrics = loadMetricsModule();

    await expect(metrics.checkAccess()).resolves.toEqual({
      ok: false,
      message: 'Faca login para acessar o dashboard administrativo.'
    });
  });

  test('checkAccess falha sem Supabase client', async () => {
    window.KCAPI = { getCurrentUser: jest.fn().mockResolvedValue({ id: 'user-1' }) };
    const metrics = loadMetricsModule();

    await expect(metrics.checkAccess()).resolves.toEqual({
      ok: false,
      message: 'Supabase client nao disponivel.'
    });
  });

  test('checkAccess valida perfil admin', async () => {
    window.KCAPI = { getCurrentUser: jest.fn().mockResolvedValue({ id: 'user-1' }) };
    window.KCSupabase = {
      getClient: jest.fn().mockReturnValue(makeClient({
        fromHandler(state) {
          if (state.table === 'profiles' && state.maybeSingle) {
            return { data: { is_admin: true }, error: null };
          }
          return { data: null, error: null };
        }
      }))
    };

    const metrics = loadMetricsModule();
    await expect(metrics.checkAccess()).resolves.toEqual({ ok: true });
  });

  test('checkAccess converte rejeicao da sessao em erro controlado', async () => {
    window.KCAPI = {
      getCurrentUser: jest.fn().mockRejectedValue(new Error('network unavailable'))
    };
    const metrics = loadMetricsModule();

    await expect(metrics.checkAccess()).resolves.toEqual({
      ok: false,
      message: 'Nao foi possivel validar o acesso administrativo.'
    });
  });

  test('checkAccess converte rejeicao da consulta de perfil em erro controlado', async () => {
    window.KCAPI = { getCurrentUser: jest.fn().mockResolvedValue({ id: 'user-1' }) };
    window.KCSupabase = {
      getClient: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue(makeQueryBuilder(function () {
          throw new Error('profiles unavailable');
        }, { table: 'profiles' }))
      })
    };
    const metrics = loadMetricsModule();

    await expect(metrics.checkAccess()).resolves.toEqual({
      ok: false,
      message: 'Nao foi possivel validar o acesso administrativo.'
    });
  });

  test('checkAccess nao confunde erro retornado pelo perfil com falta de permissao', async () => {
    window.KCAPI = { getCurrentUser: jest.fn().mockResolvedValue({ id: 'user-1' }) };
    window.KCSupabase = {
      getClient: jest.fn().mockReturnValue(makeClient({
        fromHandler() {
          return { data: null, error: { message: 'timeout' } };
        }
      }))
    };
    const metrics = loadMetricsModule();

    await expect(metrics.checkAccess()).resolves.toEqual({
      ok: false,
      message: 'Nao foi possivel validar o acesso administrativo.'
    });
  });

  test('loadReportMetrics preserva o backlog aberto e filtra apenas recebidas pelo periodo', async () => {
    const metrics = loadMetricsModule();
    const client = makeClient({
      rpcHandler(name) {
        if (name === 'kc_admin_list_reports') {
          return {
            data: [
              { status: 'open', created_at: '2026-04-15T12:00:00Z' },
              { status: 'closed', created_at: '2026-04-16T12:00:00Z' },
              { status: 'open', created_at: '2026-03-10T12:00:00Z' }
            ],
            error: null
          };
        }
        return { data: [], error: null };
      }
    });

    await expect(metrics.loadReportMetrics(client, '2026-04-01T00:00:00Z')).resolves.toEqual({
      open: 2,
      total: 2
    });
  });

  test('loadPostStatusMetrics cai para o fallback quando o count sofre permission error', async () => {
    const metrics = loadMetricsModule();
    const client = makeClient({
      fromHandler(state) {
        if (state.table === 'posts' && state.select && state.select.columns === 'id') {
          return { data: null, error: { message: 'permission denied' }, count: 0 };
        }
        if (state.table === 'posts' && state.select && state.select.columns === 'status, updated_at') {
          return {
            data: [
              { status: 'hidden', updated_at: '2026-04-18T12:00:00Z' },
              { status: 'hidden', updated_at: '2026-04-18T14:00:00Z' },
              { status: 'deleted', updated_at: '2026-04-18T16:00:00Z' }
            ],
            error: null
          };
        }
        return { data: [], error: null, count: 0 };
      }
    });

    await expect(metrics.loadPostStatusMetrics(client, '2026-04-01T00:00:00Z')).resolves.toEqual({
      hidden: 2,
      deleted: 1
    });
  });

  test('loadSearchTrendsData canonicaliza termos vindos do RPC', async () => {
    global.setTimeout = function () { return 0; };
    const metrics = loadMetricsModule();
    const client = makeClient({
      rpcHandler(name) {
        if (name === 'kc_admin_search_trends') {
          return {
            data: [
              { term: 'quartos', count: 2 },
              { term: 'quarto', count: 1 },
              { term: 'celulares', count: 3 }
            ],
            error: null
          };
        }
        return { data: [], error: null };
      }
    });

    const rows = await metrics.loadSearchTrendsData(client, '2026-04-01T00:00:00Z');
    expect(rows).toEqual(expect.arrayContaining([
      { term: 'quarto', count: 3 },
      { term: 'celular', count: 3 }
    ]));
  });

  test('loadSearchTrendsData preserva mais de 10 termos para a paginacao local', async () => {
    global.setTimeout = function () { return 0; };
    const metrics = loadMetricsModule();
    const client = makeClient({
      rpcHandler(name) {
        if (name === 'kc_admin_search_trends_classified') {
          return {
            data: Array.from({ length: 12 }, (_, index) => ({
              term: 'termo ' + String(index + 1),
              count: 20 - index,
              module: index % 2 === 0 ? 'eventos' : 'moradia',
              module_confidence: 1
            })),
            error: null
          };
        }
        return { data: [], error: null };
      }
    });

    const rows = await metrics.loadSearchTrendsData(client, '2026-04-01T00:00:00Z');
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({ term: 'termo 1', module: 'eventos' });
    expect(rows[11]).toMatchObject({ term: 'termo 12', module: 'moradia' });
  });

  test('loadAuditEventRows usa o fallback legacy quando necessario', async () => {
    const metrics = loadMetricsModule();
    const client = makeClient({
      fromHandler() {
        return { data: null, error: { message: 'permission denied' } };
      },
      rpcHandler(name, args) {
        if (name !== 'kc_admin_list_audit_logs') return { data: [], error: null };
        if (Object.prototype.hasOwnProperty.call(args, 'p_offset')) {
          return { data: null, error: { code: '42883', message: 'function missing' } };
        }
        return {
          data: [
            { created_at: '2026-04-05T10:00:00Z' },
            { created_at: '2026-03-20T10:00:00Z' }
          ],
          error: null
        };
      }
    });

    const rows = await metrics.loadAuditEventRows(client, '2026-04-01T00:00:00Z');
    expect(rows).toEqual([{ created_at: '2026-04-05T10:00:00Z' }]);
  });

  test('loadSearchTrendsData solicita janela ampla para paginaÃ§Ã£o local', () => {
    const source = fs.readFileSync(METRICS_PATH, 'utf8');
    expect(source).toContain('var SEARCH_TRENDS_MAX_ROWS = 100');
    expect(source).toContain('var clsArgs = { p_limit: 100 }');
    expect(source).toContain('var rpcArgs = { p_limit: 100 }');
  });

  test('loadVisiblePostsCount conta apenas status visiveis publicamente', async () => {
    const metrics = loadMetricsModule();
    const client = makeClient({
      fromHandler(state) {
        if (state.table === 'posts' && state.select && state.select.options && state.select.options.head) {
          expect(state.in).toEqual([{ field: 'status', value: ['published', 'closed'] }]);
          return { data: null, error: null, count: 7 };
        }
        return { data: [], error: null, count: 0 };
      }
    });

    await expect(metrics.loadVisiblePostsCount(client)).resolves.toBe(7);
  });

  test('loadActiveSessions15m prefere RPC de privacidade agregada', async () => {
    const metrics = loadMetricsModule();
    const client = makeClient({
      rpcHandler(name, args) {
        expect(name).toBe('kc_admin_privacy_analytics');
        expect(args.p_limit).toBe(1);
        return { data: { ok: true, totals: { sessions: 4 } }, error: null };
      }
    });

    await expect(metrics.loadActiveSessions15m(client)).resolves.toMatchObject({
      value: 4,
      available: true,
      source: 'privacy_rpc'
    });
  });

  test('loadActiveSessions15m cai para eventos legados quando RPC e tabela nova falham', async () => {
    const metrics = loadMetricsModule();
    const client = makeClient({
      fromHandler(state) {
        if (state.table === 'privacy_analytics_events') {
          return { data: null, error: { code: '42P01', message: 'missing table' } };
        }
        if (state.table === 'search_queries') {
          return { data: [{ id: 's1', session_id: 'A' }, { id: 's2', session_id: 'A' }], error: null };
        }
        if (state.table === 'post_view_events') {
          return { data: [{ id: 'v1', session_id: 'B' }], error: null };
        }
        return { data: [], error: null };
      },
      rpcHandler() {
        return { data: null, error: { code: '42883', message: 'function missing' } };
      }
    });

    await expect(metrics.loadActiveSessions15m(client)).resolves.toMatchObject({
      value: 2,
      available: true,
      source: 'legacy_events'
    });
  });

  test('loadActiveSessions15m não publica subcontagem quando apenas uma fonte legada responde', async () => {
    const metrics = loadMetricsModule();
    const client = makeClient({
      fromHandler(state) {
        if (state.table === 'privacy_analytics_events') {
          return { data: null, error: { code: '42P01', message: 'missing table' } };
        }
        if (state.table === 'search_queries') {
          return { data: [{ id: 's1', session_id: 'A' }], error: null };
        }
        if (state.table === 'post_view_events') {
          return { data: null, error: { code: '42501', message: 'permission denied' } };
        }
        return { data: [], error: null };
      },
      rpcHandler() {
        return { data: null, error: { code: '42883', message: 'function missing' } };
      }
    });

    await expect(metrics.loadActiveSessions15m(client)).resolves.toMatchObject({
      value: null,
      available: false,
      source: 'unavailable'
    });
  });

  test('loadActiveSessions15m deduplica por usuário e ignora eventos sem sessão nem usuário', async () => {
    const metrics = loadMetricsModule();
    const client = makeClient({
      fromHandler(state) {
        if (state.table === 'privacy_analytics_events') {
          return { data: null, error: { code: '42P01', message: 'missing table' } };
        }
        if (state.table === 'search_queries') {
          expect(state.select.columns).toContain('user_id');
          return {
            data: [
              { id: 's1', session_id: null, user_id: 'user-1' },
              { id: 's2', session_id: null, user_id: 'user-1' },
              { id: 's3', session_id: null, user_id: null }
            ],
            error: null
          };
        }
        if (state.table === 'post_view_events') {
          expect(state.select.columns).toContain('user_id');
          return {
            data: [
              { id: 'v1', session_id: null, user_id: 'user-1' },
              { id: 'v2', session_id: null, user_id: null }
            ],
            error: null
          };
        }
        return { data: [], error: null };
      },
      rpcHandler() {
        return { data: null, error: { code: '42883', message: 'function missing' } };
      }
    });

    await expect(metrics.loadActiveSessions15m(client)).resolves.toMatchObject({
      value: 1,
      available: true,
      source: 'legacy_events'
    });
  });

  test('loadAdOverview normaliza RPC de monetizacao para cards e alertas', async () => {
    const metrics = loadMetricsModule();
    const client = makeClient({
      rpcHandler(name) {
        if (name === 'kc_admin_ads_overview') {
          return {
            data: {
              ok: true,
              settings: { status: 'active', provider: 'hybrid', auto_ads_enabled: false },
              campaigns: { total: 3, active: 2, active_without_impressions: 1, expired_active: 1 },
              metrics: { impressions: 120, clicks: 6, ctr: 5 }
            },
            error: null
          };
        }
        return { data: [], error: null };
      }
    });

    await expect(metrics.loadAdOverview(client, '2026-04-20T00:00:00Z')).resolves.toMatchObject({
      source: 'rpc',
      settings: { status: 'active', provider: 'hybrid' },
      campaigns: { total: 3, active: 2 },
      metrics: { impressions: 120, clicks: 6, ctr: 5 },
      active_without_impressions: 1,
      expired_active: 1
    });
  });

  test('loadAdOverview preserva zero quando todas as fontes fallback confirmam ausência de dados', async () => {
    const metrics = loadMetricsModule();
    const client = makeClient({
      fromHandler() {
        return { data: [], error: null };
      },
      rpcHandler(name) {
        if (name === 'kc_admin_ads_overview') {
          return { data: null, error: { code: '42883', message: 'function missing' } };
        }
        if (name === 'kc_admin_get_ad_network_settings') {
          return {
            data: {
              ok: true,
              settings: { status: 'disabled', provider: 'direct', auto_ads_enabled: false }
            },
            error: null
          };
        }
        return { data: null, error: { code: '42883', message: 'function missing' } };
      }
    });

    await expect(metrics.loadAdOverview(client, '2026-04-20T00:00:00Z')).resolves.toMatchObject({
      ok: true,
      available: true,
      source: 'fallback',
      availability: { complete: true },
      campaigns: { total: 0, active: 0 },
      metrics: { impressions: 0, clicks: 0, ctr: 0 },
      active_without_impressions: 0,
      expired_active: 0
    });
    expect(window._KCAD.__adminMetricsDiagnostics.ads).toEqual({
      available: true,
      source: 'fallback'
    });
  });

  test('loadAdOverview não inventa zeros quando todas as fontes fallback falham', async () => {
    const metrics = loadMetricsModule();
    const client = makeClient({
      fromHandler() {
        return { data: null, error: { code: '42501', message: 'permission denied' } };
      },
      rpcHandler() {
        return { data: null, error: { code: '42883', message: 'function missing' } };
      }
    });

    await expect(metrics.loadAdOverview(client, '2026-04-20T00:00:00Z')).resolves.toMatchObject({
      ok: false,
      available: false,
      source: 'unavailable',
      availability: { complete: false },
      settings: { status: null, provider: null },
      campaigns: { total: null, active: null },
      metrics: { impressions: null, clicks: null, ctr: null },
      active_without_impressions: null,
      expired_active: null
    });
    expect(window._KCAD.__adminMetricsDiagnostics.ads).toEqual({
      available: false,
      source: 'unavailable'
    });
  });

  test('loadAdOverview mantém valores confirmados e null nas fontes parciais', async () => {
    const metrics = loadMetricsModule();
    const client = makeClient({
      fromHandler(state) {
        if (state.table === 'ad_campaigns') return { data: [], error: null };
        return { data: null, error: { code: '42501', message: 'permission denied' } };
      },
      rpcHandler() {
        return { data: null, error: { code: '42883', message: 'function missing' } };
      }
    });

    await expect(metrics.loadAdOverview(client, '2026-04-20T00:00:00Z')).resolves.toMatchObject({
      ok: false,
      available: false,
      source: 'partial',
      availability: {
        complete: false,
        campaigns: true,
        impressions: false,
        clicks: false
      },
      campaigns: { total: 0, active: 0 },
      metrics: { impressions: null, clicks: null, ctr: null },
      active_without_impressions: null,
      expired_active: 0
    });
  });

  test('loadDailyMetrics usa a serie do RPC quando disponivel', async () => {
    const metrics = loadMetricsModule();
    const client = makeClient({
      rpcHandler(name) {
        if (name === 'kc_admin_dashboard_daily_metrics') {
          return {
            data: [
              {
                day: '2026-04-20',
                posts_count: 1,
                comments_count: 2,
                searches_count: 3,
                votes_count: 4,
                admin_actions_count: 1,
                total_count: 11
              }
            ],
            error: null
          };
        }
        return { data: [], error: null };
      }
    });

    const rows = await metrics.loadDailyMetrics(client, '2026-04-20T00:00:00Z', null);
    expect(rows[0]).toMatchObject({
      day: '2026-04-20',
      posts_count: 1,
      total_count: 11
    });
  });

  test('loadDailyMetrics cai para eventos diretos quando o RPC falta', async () => {
    const metrics = loadMetricsModule();
    const client = makeClient({
      fromHandler(state) {
        if (state.table === 'posts') return { data: [{ created_at: '2026-04-20T09:00:00Z' }], error: null };
        if (state.table === 'comments') return { data: [{ created_at: '2026-04-20T10:00:00Z' }], error: null };
        if (state.table === 'search_queries') return { data: [{ created_at: '2026-04-21T11:00:00Z' }], error: null };
        if (state.table === 'post_votes') return { data: [{ created_at: '2026-04-21T12:00:00Z' }], error: null };
        if (state.table === 'audit_log') return { data: [{ created_at: '2026-04-21T13:00:00Z' }], error: null };
        return { data: [], error: null };
      },
      rpcHandler(name) {
        if (name === 'kc_admin_dashboard_daily_metrics') {
          return { data: null, error: { code: '42883', message: 'function missing' } };
        }
        return { data: [], error: null };
      }
    });

    const rows = await metrics.loadDailyMetrics(client, '2026-04-20T00:00:00Z', null);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0]).toMatchObject({
      day: '2026-04-20',
      posts_count: 1,
      comments_count: 1,
      total_count: 2
    });
    expect(rows[1]).toMatchObject({
      day: '2026-04-21',
      searches_count: 1,
      votes_count: 1,
      admin_actions_count: 1,
      total_count: 3
    });
  });

  test('queryCreatedAtRows rejeita amostra limitada como série completa', async () => {
    const metrics = loadMetricsModule();
    const client = makeClient({
      fromHandler() {
        return {
          data: [{ created_at: '2026-04-20T09:00:00Z' }],
          count: 4,
          error: null
        };
      }
    });

    const rows = await metrics.queryCreatedAtRows(client, 'posts', '2026-04-20T00:00:00Z', 1);
    expect(rows).toHaveLength(0);
    expect(rows.__kcAvailable).toBe(false);
  });
});

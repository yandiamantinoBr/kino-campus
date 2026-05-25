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
      return Promise.resolve(handler(state)).then(resolve, reject);
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

  test('expoe exatamente 19 chaves publicas', () => {
    const metrics = loadMetricsModule();
    expect(Object.keys(metrics).sort()).toEqual([
      'checkAccess',
      'classifyTermToModule',
      'loadActiveSessions15m',
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
    expect(controllerSource).toContain("window._KCAD.metrics.loadDailyMetrics(client, since, signal)");
  });

  test('removeu RPCs de metrics do core', () => {
    expect(controllerSource).not.toContain("client.rpc('kc_admin_list_reports'");
    expect(controllerSource).not.toContain("client.rpc('kc_admin_search_trends'");
    expect(controllerSource).not.toContain("client.rpc('kc_admin_dashboard_daily_metrics'");
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
      '<script defer src="../assets/js/controllers/admin/admin-dashboard.shared.js?v=8.6.1"></script>',
      '<script defer src="../assets/js/controllers/admin/admin-dashboard.metrics.js?v=8.6.3"></script>',
      '<script defer src="../assets/js/controllers/admin/admin-dashboard.audit.js?v=8.6.5"></script>',
      '<script defer src="../assets/js/controllers/admin/admin-dashboard.charts.js?v=8.6.1"></script>',
      '<script defer src="../assets/js/features/kc-ranking.js?v=8.6.1"></script>',
      '<script defer src="../assets/js/controllers/admin/admin-dashboard.privacy.js?v=8.6.2"></script>',
      '<script defer src="../assets/js/controllers/admin/admin-dashboard.controller.js?v=8.6.3"></script>'
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

  test('loadReportMetrics usa o RPC e filtra pelo periodo', async () => {
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
      open: 1,
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
});

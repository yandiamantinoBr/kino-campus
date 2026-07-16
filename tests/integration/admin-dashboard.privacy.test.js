'use strict';

const path = require('path');

const MODULE_PATH = path.resolve(__dirname, '../../assets/js/controllers/admin/admin-dashboard.privacy.js');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeFallbackClient(handler) {
  return {
    rpc: jest.fn().mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'RPC unavailable' }
    }),
    from(table) {
      const state = { table, head: false, limit: null };
      const builder = {
        select(_columns, options) {
          state.head = Boolean(options && options.head);
          return builder;
        },
        gte() {
          return builder;
        },
        limit(value) {
          state.limit = value;
          return builder;
        },
        then(resolve, reject) {
          return Promise.resolve().then(function () {
            return handler(Object.assign({}, state));
          }).then(resolve, reject);
        }
      };
      return builder;
    }
  };
}

describe('admin-dashboard.privacy.js', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    document.body.innerHTML = [
      '<div id="admin-privacy-metrics"></div>',
      '<div id="admin-health-list"></div>'
    ].join('');
    delete window._KCAD;
    delete window.KCSupabase;
    window.KCUtils = {
      escapeHtml(value) {
        return String(value);
      }
    };
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    delete window._KCAD;
    delete window.KCSupabase;
    delete window.KCUtils;
  });

  test('resposta standalone antiga não sobrescreve overview do período atual', async () => {
    const rpcDeferred = deferred();
    window.KCSupabase = {
      getClient() {
        return {
          rpc: jest.fn(() => rpcDeferred.promise)
        };
      }
    };

    require(MODULE_PATH);
    const pending = window._KCAD.privacy.loadPrivacySummary({
      periodDays: 30,
      periodLabel: 'últimos 30 dias',
      since: '2026-06-17T03:00:00Z'
    });

    window._KCAD.privacy.refresh({
      overview: { events: 10, sessions: 3, searches: 4, post_views: 6 },
      periodLabel: 'hoje',
      health: [{ label: 'Privacidade', value: 'Overview atual' }]
    });

    rpcDeferred.resolve({
      data: {
        ok: true,
        totals: { events: 999, sessions: 999, banner_clicks: 999 },
        consent: { analytics_accepted: 999 }
      },
      error: null
    });
    await pending;

    const metrics = document.getElementById('admin-privacy-metrics').textContent;
    expect(metrics).toContain('10');
    expect(metrics).not.toContain('999');
    expect(document.getElementById('admin-health-list').textContent).toContain('Overview atual');
  });

  test('standalone respeita since e rótulo fornecidos pelo controller', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        ok: true,
        totals: { events: 7, sessions: 2, banner_clicks: 1 },
        consent: { analytics_accepted: 5 }
      },
      error: null
    });
    window.KCSupabase = {
      getClient() {
        return { rpc };
      }
    };

    require(MODULE_PATH);
    await window._KCAD.privacy.loadPrivacySummary({
      periodDays: 7,
      periodLabel: 'últimos 7 dias',
      since: '2026-07-10T03:00:00Z'
    });

    expect(rpc).toHaveBeenCalledWith('kc_admin_privacy_analytics', expect.objectContaining({
      p_since: '2026-07-10T03:00:00Z'
    }));
    expect(document.getElementById('admin-privacy-metrics').textContent).toContain('últimos 7 dias');
  });

  test('não apresenta zeros quando RPC e todas as fontes de fallback estão indisponíveis', async () => {
    const client = makeFallbackClient(function () {
      return { data: null, count: null, error: { message: 'source unavailable' } };
    });
    window.KCSupabase = {
      getClient() {
        return client;
      }
    };

    require(MODULE_PATH);
    await window._KCAD.privacy.loadPrivacySummary({
      periodDays: 30,
      periodLabel: 'últimos 30 dias',
      since: '2026-06-17T03:00:00Z'
    });

    const metrics = document.getElementById('admin-privacy-metrics').textContent;
    const health = document.getElementById('admin-health-list').textContent;
    expect(metrics).toContain('--');
    expect(metrics).not.toMatch(/\b0\b/);
    expect(health).toContain('Indisponível');
    expect(health).not.toContain('Fallback ativo');
  });

  test('fallback parcial preserva apenas contagens confirmadas e marca as demais como indisponíveis', async () => {
    const client = makeFallbackClient(function (state) {
      if (state.table === 'search_queries' && state.head) {
        return { data: null, count: 3, error: null };
      }
      return { data: null, count: null, error: { message: 'source unavailable' } };
    });
    window.KCSupabase = {
      getClient() {
        return client;
      }
    };

    require(MODULE_PATH);
    await window._KCAD.privacy.loadPrivacySummary({
      periodDays: 7,
      periodLabel: 'últimos 7 dias',
      since: '2026-07-10T03:00:00Z'
    });

    const metrics = document.getElementById('admin-privacy-metrics').textContent;
    const health = document.getElementById('admin-health-list').textContent;
    expect(metrics).toContain('Buscas3');
    expect((metrics.match(/--/g) || [])).toHaveLength(3);
    expect(health).toContain('Fallback parcial');
    expect(health).not.toContain('Fallback ativo');
  });
});

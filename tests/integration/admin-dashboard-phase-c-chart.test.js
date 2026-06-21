'use strict';

/**
 * Revisão profunda do Dashboard Admin — Fase C (gráfico interativo + mais séries).
 * Cobre:
 *  - Migration que estende kc_admin_dashboard_daily_metrics com 3 séries novas
 *    (saves/reports/signups), preservando o padrão wrapper público → kc_private.
 *  - SERIES_KEYS + pulso operacional enriquecido (momentum, dias ativos, pior dia).
 *  - Gráfico interativo: pontos, faixas de hover (data-index), guia, tooltip,
 *    legenda clicável (data-series-key/aria-pressed) e buscável.
 *  - Contrato preservado: exatamente 10 chaves públicas em _KCAD.charts.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const r = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const SHARED = path.join(ROOT, 'assets/js/controllers/admin/admin-dashboard.shared.js');
const CHARTS = path.join(ROOT, 'assets/js/controllers/admin/admin-dashboard.charts.js');

const META8 = [
  { key: 'posts_count', label: 'Posts', color: '#ff6b00', icon: 'fas fa-layer-group' },
  { key: 'comments_count', label: 'Comentários', color: '#0ea5e9', icon: 'fas fa-comment' },
  { key: 'searches_count', label: 'Buscas', color: '#8b5cf6', icon: 'fas fa-magnifying-glass' },
  { key: 'votes_count', label: 'Votos', color: '#10b981', icon: 'fas fa-thumbs-up' },
  { key: 'admin_actions_count', label: 'Ações admin', color: '#f97316', icon: 'fas fa-shield-halved' },
  { key: 'saves_count', label: 'Salvos', color: '#ec4899', icon: 'fas fa-bookmark' },
  { key: 'reports_count', label: 'Denúncias', color: '#ef4444', icon: 'fas fa-flag' },
  { key: 'signups_count', label: 'Cadastros', color: '#14b8a6', icon: 'fas fa-user-plus' }
];

const SERIES = [
  { label: '01/05', total_count: 6, posts_count: 1, comments_count: 1, searches_count: 1, votes_count: 1, admin_actions_count: 1, saves_count: 1, reports_count: 0, signups_count: 0 },
  { label: '02/05', total_count: 8, posts_count: 2, comments_count: 1, searches_count: 1, votes_count: 1, admin_actions_count: 1, saves_count: 1, reports_count: 1, signups_count: 0 }
];

function el(init) {
  const listeners = {};
  return Object.assign({
    innerHTML: '', textContent: '', disabled: false, value: '', style: {}, dataset: {},
    classList: { contains() { return false; } },
    addEventListener(type, handler) { listeners[type] = handler; },
    getListener(type) { return listeners[type]; },
    setAttribute() {}, getAttribute() { return null; }
  }, init || {});
}

function makeDeps(els) {
  return {
    $: (sel) => els[sel] || null,
    escHtmlAdmin: (s) => String(s == null ? '' : s),
    toNumber: (v) => (Number.isFinite(Number(v)) ? Number(v) : 0),
    getSeriesMeta: () => META8.slice(),
    getSeriesKeys: () => META8.map((m) => m.key),
    getData: () => ({ dailyMetrics: SERIES, periodDays: 30 }),
    getSelectedPeriodDays: () => 30,
    getPeriodLabel: () => 'últimos 30 dias',
    getChartModalReturnFocus: () => null,
    setChartModalReturnFocus() {},
    getRankingExpanded: () => false,
    setRankingExpanded() {},
    getRankingRequestSeq: () => 0,
    setRankingRequestSeq() {},
    showStatusToast() {}
  };
}

function reset() {
  jest.resetModules();
  global.window = global;
  delete window._KCAD;
  delete window.KCAdminDashboardUtils;
  delete window.KCUtils;
}

function loadCharts() {
  require(SHARED);
  require(CHARTS);
  return window._KCAD.charts;
}

describe('Fase C — migration daily_metrics estendida', () => {
  let sql;
  beforeAll(() => {
    sql = r('supabase/migrations/_archive-v75/20260531140000_admin_daily_metrics_extended_series.sql');
  });

  test('recria o wrapper público e a implementação privada', () => {
    expect(sql).toContain('drop function if exists public.kc_admin_dashboard_daily_metrics(timestamptz)');
    expect(sql).toContain('drop function if exists kc_private.kc_admin_dashboard_daily_metrics(timestamptz)');
    expect(sql).toContain('create function kc_private.kc_admin_dashboard_daily_metrics');
    expect(sql).toContain('create function public.kc_admin_dashboard_daily_metrics');
  });

  test('adiciona as 3 novas séries', () => {
    ['saves_count', 'reports_count', 'signups_count'].forEach((k) => expect(sql).toContain(k));
    expect(sql).toContain('public.saved_posts');
    expect(sql).toContain('public.reports');
    expect(sql).toContain('public.profiles');
  });

  test('preserva o hardening: wrapper INVOKER (search_path vazio) → privado DEFINER', () => {
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = 'public'");
    expect(sql).toContain('select * from kc_private.kc_admin_dashboard_daily_metrics($1)');
  });

  test('reaplica privilégios (authenticated/service_role; anon revogado)', () => {
    expect(sql).toContain('revoke all on function public.kc_admin_dashboard_daily_metrics(timestamptz) from public, anon');
    expect(sql).toContain('grant execute on function public.kc_admin_dashboard_daily_metrics(timestamptz) to authenticated, service_role');
    expect(sql).toContain('grant execute on function kc_private.kc_admin_dashboard_daily_metrics(timestamptz) to authenticated, service_role');
  });
});

describe('Fase C — séries e pulso (shared.js)', () => {
  let utils;
  beforeEach(() => { reset(); utils = require(SHARED); });
  afterEach(reset);

  test('SERIES_KEYS inclui as 8 séries originais (catálogo ampliado na rodada 2)', () => {
    [
      'posts_count', 'comments_count', 'searches_count', 'votes_count',
      'admin_actions_count', 'saves_count', 'reports_count', 'signups_count'
    ].forEach(function (k) { expect(utils.SERIES_KEYS).toContain(k); });
  });

  test('buildDailyMetricsFromEventSets agrega as novas séries', () => {
    const series = utils.buildDailyMetricsFromEventSets({
      posts: [{ created_at: '2026-05-01T10:00:00Z' }],
      saves: [{ created_at: '2026-05-01T11:00:00Z' }, { created_at: '2026-05-02T11:00:00Z' }],
      reports: [{ created_at: '2026-05-02T12:00:00Z' }],
      signups: [{ created_at: '2026-05-01T09:00:00Z' }]
    }, '2026-05-01T00:00:00Z', '2026-05-02T23:59:59Z');

    expect(series).toHaveLength(2);
    expect(series[0]).toMatchObject({ day: '2026-05-01', saves_count: 1, signups_count: 1, reports_count: 0, total_count: 3 });
    expect(series[1]).toMatchObject({ day: '2026-05-02', saves_count: 1, reports_count: 1, total_count: 2 });
  });

  test('buildActivityPulseSummary calcula momentum, dias ativos e pior dia', () => {
    const summary = utils.buildActivityPulseSummary([
      { day: '2026-05-01', total_count: 2 },
      { day: '2026-05-02', total_count: 0 },
      { day: '2026-05-03', total_count: 8 },
      { day: '2026-05-04', total_count: 10 }
    ]);
    expect(summary.peakTotal).toBe(10);
    expect(summary.worstTotal).toBe(0);
    expect(summary.worstDay.day).toBe('2026-05-02');
    expect(summary.activeDays).toBe(3);
    expect(summary.totalDays).toBe(4);
    expect(summary.momentumDir).toBe('up'); // (8+10) vs (2+0)
    expect(summary.momentumPct).toBe(800);
  });
});

describe('Fase C — gráfico interativo (charts.js)', () => {
  beforeEach(reset);
  afterEach(reset);

  test('mantém exatamente 10 chaves públicas em _KCAD.charts', () => {
    const charts = loadCharts();
    expect(Object.keys(charts)).toHaveLength(10);
  });

  test('renderiza pontos, faixas de hover (data-index) e guia no SVG', () => {
    const charts = loadCharts();
    const els = {
      '#admin-daily-activity-chart': el(),
      '#admin-daily-activity-legend': el(),
      '#admin-chart-expand-btn': el()
    };
    charts.renderDailyActivityChart(SERIES, makeDeps(els));

    const svg = els['#admin-daily-activity-chart'].innerHTML;
    expect(svg).toContain('<svg');
    expect(svg).toContain('<circle');
    expect(svg).toContain('kc-admin-chart-hit');
    expect(svg).toContain('data-index="0"');
    expect(svg).toContain('kc-admin-chart-guide');
  });

  test('legenda é clicável (botões + data-series-key/aria-pressed) e buscável (8 séries)', () => {
    const charts = loadCharts();
    const els = {
      '#admin-daily-activity-chart': el(),
      '#admin-daily-activity-legend': el(),
      '#admin-chart-expand-btn': el()
    };
    charts.renderDailyActivityChart(SERIES, makeDeps(els));

    const legend = els['#admin-daily-activity-legend'].innerHTML;
    expect(legend).toContain('<button');
    expect(legend).toContain('data-series-key="saves_count"');
    expect(legend).toContain('aria-pressed="true"');
    expect(legend).toContain('kc-admin-chart-legend__items');
    expect(legend).toContain('kc-admin-chart-legend__search'); // 8 >= limiar de busca
  });

  test('reflete série oculta no estado (is-hidden + aria-pressed=false)', () => {
    const charts = loadCharts();
    window._KCAD.__adminChartsState = { hiddenSeries: { saves_count: true } };
    const els = {
      '#admin-daily-activity-chart': el(),
      '#admin-daily-activity-legend': el(),
      '#admin-chart-expand-btn': el()
    };
    charts.renderDailyActivityChart(SERIES, makeDeps(els));

    const legend = els['#admin-daily-activity-legend'].innerHTML;
    expect(legend).toMatch(/data-series-key="saves_count"[^>]*aria-pressed="false"/);
    expect(legend).toContain('is-hidden');
  });

  test('estado vazio limpa a legenda e desabilita expandir', () => {
    const charts = loadCharts();
    const els = {
      '#admin-daily-activity-chart': el(),
      '#admin-daily-activity-legend': el(),
      '#admin-chart-expand-btn': el()
    };
    charts.renderDailyActivityChart([], makeDeps(els));

    expect(els['#admin-daily-activity-chart'].innerHTML).toContain('Sem dados suficientes');
    expect(els['#admin-daily-activity-legend'].innerHTML).toBe('');
    expect(els['#admin-chart-expand-btn'].disabled).toBe(true);
  });
});

describe('Fase C — séries sincronizadas (controller + charts)', () => {
  test('SERIES_META do controller tem as 8 séries', () => {
    const src = r('assets/js/controllers/admin/admin-dashboard.controller.js');
    ['saves_count', 'reports_count', 'signups_count'].forEach((k) => expect(src).toContain("'" + k + "'"));
  });

  test('DEFAULT_SERIES_META do charts tem as 8 séries', () => {
    const src = r('assets/js/controllers/admin/admin-dashboard.charts.js');
    ['saves_count', 'reports_count', 'signups_count'].forEach((k) => expect(src).toContain("'" + k + "'"));
    expect(src).toContain('function toggleSeriesHidden');
    expect(src).toContain('function bindChartHover');
    expect(src).toContain('function applyChartState');
  });
});

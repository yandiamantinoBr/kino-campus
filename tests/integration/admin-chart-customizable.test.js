'use strict';

/**
 * Revisão profunda /admin/ (rodada 2) — gráfico customizável + relatório coerente.
 * Cobre:
 *  - Migrations: 3 novas séries (views/curtidas/sessões) e preferências por admin.
 *  - Catálogo de 13 séries (shared/controller/charts) + famílias.
 *  - Customização: seed das prefs (séries visíveis + cores) aplicado ao gráfico;
 *    painel "Configurar séries"; persistência via RPCs; contrato de 10 chaves.
 *  - Exportação coerente (séries dinâmicas + Top Contribuidores) — wiring.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const r = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SHARED = path.join(ROOT, 'assets/js/controllers/admin/admin-dashboard.shared.js');
const CHARTS = path.join(ROOT, 'assets/js/controllers/admin/admin-dashboard.charts.js');

const META11 = [
  { key: 'posts_count', label: 'Posts', color: '#ff6b00', icon: 'fas fa-layer-group', family: 'Conteúdo' },
  { key: 'comments_count', label: 'Comentários', color: '#0ea5e9', icon: 'fas fa-comment', family: 'Conteúdo' },
  { key: 'post_views_count', label: 'Visualizações', color: '#3b82f6', icon: 'fas fa-eye', family: 'Alcance' },
  { key: 'sessions_count', label: 'Sessões ativas', color: '#a855f7', icon: 'fas fa-wifi', family: 'Tráfego' },
  { key: 'votes_count', label: 'Votos', color: '#10b981', icon: 'fas fa-thumbs-up', family: 'Engajamento' },
  { key: 'comment_likes_count', label: 'Curtidas em comentários', color: '#f43f5e', icon: 'fas fa-heart', family: 'Engajamento' },
  { key: 'saves_count', label: 'Salvos', color: '#ec4899', icon: 'fas fa-bookmark', family: 'Intenção' },
  { key: 'searches_count', label: 'Buscas', color: '#8b5cf6', icon: 'fas fa-magnifying-glass', family: 'Demanda' },
  { key: 'signups_count', label: 'Cadastros', color: '#14b8a6', icon: 'fas fa-user-plus', family: 'Crescimento' },
  { key: 'reports_count', label: 'Denúncias', color: '#ef4444', icon: 'fas fa-flag', family: 'Moderação' },
  { key: 'admin_actions_count', label: 'Ações admin', color: '#f97316', icon: 'fas fa-shield-halved', family: 'Operação' },
  { key: 'ad_clicks_count', label: 'Cliques em anúncios', color: '#f59e0b', icon: 'fas fa-arrow-pointer', family: 'Monetização' },
  { key: 'ad_impressions_count', label: 'Impressões de anúncios', color: '#fb923c', icon: 'fas fa-rectangle-ad', family: 'Monetização' }
];

const SERIES = [
  { label: '01/05', total_count: 5, posts_count: 2, post_views_count: 10, sessions_count: 3, reports_count: 1 },
  { label: '02/05', total_count: 7, posts_count: 3, post_views_count: 12, sessions_count: 4, reports_count: 0 }
];

function el(init) {
  const listeners = {};
  return Object.assign({
    innerHTML: '', textContent: '', disabled: false, value: '', style: {}, dataset: {},
    classList: { contains() { return false; } },
    addEventListener(t, h) { listeners[t] = h; },
    getListener(t) { return listeners[t]; },
    setAttribute() {}, getAttribute() { return null; }
  }, init || {});
}

function makeDeps(els, prefs) {
  return {
    $: (sel) => els[sel] || null,
    escHtmlAdmin: (s) => String(s == null ? '' : s),
    toNumber: (v) => (Number.isFinite(Number(v)) ? Number(v) : 0),
    getSeriesMeta: () => META11.slice(),
    getSeriesKeys: () => META11.map((m) => m.key),
    getInitialChartPrefs: () => prefs || null,
    getDefaultVisibleSeries: () => ['post_views_count', 'sessions_count', 'posts_count'],
    saveChartPrefs: () => {},
    getData: () => ({ dailyMetrics: SERIES, periodDays: 30 }),
    getSelectedPeriodDays: () => 30,
    getPeriodLabel: () => 'últimos 30 dias',
    getChartModalReturnFocus: () => null, setChartModalReturnFocus() {},
    getRankingExpanded: () => false, setRankingExpanded() {},
    getRankingRequestSeq: () => 0, setRankingRequestSeq() {},
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

describe('Rodada 2 — migrations', () => {
  test('Migration A adiciona 3 séries (views/curtidas/sessões) preservando o hardening', () => {
    const sql = r('supabase/migrations/20260531160000_admin_daily_metrics_traffic_series.sql');
    ['post_views_count', 'comment_likes_count', 'sessions_count'].forEach((k) => expect(sql).toContain(k));
    expect(sql).toContain('public.post_view_events');
    expect(sql).toContain('public.comment_likes');
    expect(sql).toContain('count(distinct session_id)');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain('security definer');
    expect(sql).toContain('select * from kc_private.kc_admin_dashboard_daily_metrics($1)');
  });

  test('Migration B cria prefs por admin com RLS owner-only + RPCs INVOKER gated', () => {
    const sql = r('supabase/migrations/20260531170000_admin_chart_prefs.sql');
    expect(sql).toContain('create table if not exists public.kc_admin_chart_prefs');
    expect(sql).toContain('enable row level security');
    expect(sql).toMatch(/user_id = \(select auth\.uid\(\)\) and public\.kc_is_admin/);
    expect(sql).toContain('function public.kc_admin_get_chart_prefs()');
    expect(sql).toContain('function public.kc_admin_save_chart_prefs(p_prefs jsonb)');
    expect(sql).toContain('security invoker');
    expect(sql).toContain("'FORBIDDEN'");
    expect(sql).toContain('grant execute on function public.kc_admin_save_chart_prefs(jsonb) to authenticated, service_role');
  });
});

describe('Rodada 2 — catálogo de 13 séries', () => {
  test('SERIES_KEYS tem as 13 séries', () => {
    reset();
    const utils = require(SHARED);
    expect(utils.SERIES_KEYS).toHaveLength(13);
    ['post_views_count', 'comment_likes_count', 'sessions_count', 'ad_clicks_count', 'ad_impressions_count'].forEach((k) => expect(utils.SERIES_KEYS).toContain(k));
    reset();
  });

  test('controller e charts têm SERIES_META/DEFAULT_SERIES_META com famílias', () => {
    const ctrl = r('assets/js/controllers/admin/admin-dashboard.controller.js');
    const charts = r('assets/js/controllers/admin/admin-dashboard.charts.js');
    ['Visualizações', 'Sessões ativas', 'Curtidas em comentários', 'Cliques em anúncios', 'Impressões de anúncios'].forEach((label) => {
      expect(ctrl).toContain(label);
      expect(charts).toContain(label);
    });
    expect(ctrl).toContain("family: 'Tráfego'");
    expect(ctrl).toContain("family: 'Monetização'");
    expect(ctrl).toContain('var DEFAULT_VISIBLE_SERIES');
  });
});

describe('Rodada 2 — customização (charts.js)', () => {
  beforeEach(reset);
  afterEach(reset);

  test('mantém exatamente 10 chaves públicas', () => {
    expect(Object.keys(loadCharts())).toHaveLength(10);
  });

  test('aplica as preferências (séries visíveis + cor) ao renderizar', () => {
    const charts = loadCharts();
    const els = {
      '#admin-daily-activity-chart': el(),
      '#admin-daily-activity-legend': el(),
      '#admin-chart-expand-btn': el()
    };
    const prefs = { visible: ['posts_count', 'post_views_count'], colors: { posts_count: '#abcdef' } };
    charts.renderDailyActivityChart(SERIES, makeDeps(els, prefs));

    const legend = els['#admin-daily-activity-legend'].innerHTML;
    // cor custom aplicada
    expect(legend).toContain('#abcdef');
    // série escolhida visível, série fora da seleção oculta
    expect(legend).toMatch(/data-series-key="posts_count"[^>]*aria-pressed="true"/);
    expect(legend).toMatch(/data-series-key="reports_count"[^>]*aria-pressed="false"/);
    expect(legend).toContain('is-hidden');
  });

  test('usa o padrão quando não há preferências salvas', () => {
    const charts = loadCharts();
    const els = {
      '#admin-daily-activity-chart': el(),
      '#admin-daily-activity-legend': el(),
      '#admin-chart-expand-btn': el()
    };
    charts.renderDailyActivityChart(SERIES, makeDeps(els, null));
    const legend = els['#admin-daily-activity-legend'].innerHTML;
    // default inclui post_views_count visível; admin_actions_count fora do default → oculto
    expect(legend).toMatch(/data-series-key="post_views_count"[^>]*aria-pressed="true"/);
    expect(legend).toMatch(/data-series-key="admin_actions_count"[^>]*aria-pressed="false"/);
  });

  test('expõe o painel "Configurar séries" (toggle + cor + restaurar) e persiste', () => {
    const src = r('assets/js/controllers/admin/admin-dashboard.charts.js');
    expect(src).toContain('function renderSeriesPicker');
    expect(src).toContain('function bindSeriesPicker');
    expect(src).toContain('kc-series-picker__toggle');
    expect(src).toContain('type="color"');
    expect(src).toContain('function setSeriesColor');
    expect(src).toContain('function persistChartPrefs');
    expect(src).toContain('admin-series-reset');
  });
});

describe('Rodada 2 — persistência + export (controller/audit/html)', () => {
  test('controller carrega/salva prefs via RPCs e expõe deps de série/ranking', () => {
    const ctrl = r('assets/js/controllers/admin/admin-dashboard.controller.js');
    expect(ctrl).toContain("client.rpc('kc_admin_get_chart_prefs')");
    expect(ctrl).toContain("client.rpc('kc_admin_save_chart_prefs', { p_prefs: prefs })");
    expect(ctrl).toContain('getInitialChartPrefs');
    expect(ctrl).toContain('getDefaultVisibleSeries');
    expect(ctrl).toContain('getVisibleSeriesKeys');
    expect(ctrl).toContain('getRankingRows');
    expect(ctrl).toContain('await loadChartPrefs();');
  });

  test('export do dashboard reflete séries selecionadas + Top Contribuidores', () => {
    const audit = r('assets/js/controllers/admin/admin-dashboard.audit.js');
    expect(audit).toContain('getVisibleSeriesKeys');
    expect(audit).toContain('var pulseColumns');
    expect(audit).toContain("title: 'Top Contribuidores'");
    expect(audit).toContain("title: 'Séries (totais no período)'");
  });

  test('index.html traz o botão e o painel de configuração de séries', () => {
    const html = r('admin/index.html');
    expect(html).toContain('id="admin-series-config-btn"');
    expect(html).toContain('id="admin-series-picker"');
  });
});

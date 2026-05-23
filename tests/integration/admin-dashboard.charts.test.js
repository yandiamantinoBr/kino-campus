'use strict';

const fs = require('fs');
const path = require('path');

const SHARED_PATH = path.resolve(__dirname, '../../assets/js/controllers/admin/admin-dashboard.shared.js');
const CHARTS_PATH = path.resolve(__dirname, '../../assets/js/controllers/admin/admin-dashboard.charts.js');
const CONTROLLER_PATH = path.resolve(__dirname, '../../assets/js/controllers/admin/admin-dashboard.controller.js');
const HTML_PATH = path.resolve(__dirname, '../../admin/index.html');

const REAL_SET_TIMEOUT = global.setTimeout;

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createElement(initial) {
  const listeners = {};
  const attributes = {};
  const element = Object.assign({
    innerHTML: '',
    textContent: '',
    disabled: false,
    value: '',
    style: {},
    dataset: {},
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    getListener(type) {
      return listeners[type];
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    focus() {
      element.focused = true;
      if (global.document) global.document.activeElement = element;
    }
  }, initial || {});
  return element;
}

function makeDocument(elements) {
  return elements || {};
}

function installDocument(elements) {
  const listeners = {};
  const doc = global.document;
  doc.querySelector = function (selector) {
    return elements[selector] || null;
  };
  doc.getElementById = function (id) {
    return elements['#' + id] || null;
  };
  doc.addEventListener = function (type, handler) {
    listeners[type] = handler;
  };
  doc.getListener = function (type) {
    return listeners[type];
  };
  if (doc.body && doc.body.dataset) {
    delete doc.body.dataset.adminChartEscBound;
    delete doc.body.dataset.kcAdminPtrReady;
  }
  return doc;
}

function createDeps(options) {
  options = options || {};
  let data = options.data || null;
  let chartModalReturnFocus = options.chartModalReturnFocus || null;
  let rankingExpanded = !!options.rankingExpanded;
  let rankingRequestSeq = Number(options.rankingRequestSeq) || 0;
  const elements = options.elements || {};
  const deps = {
    $: function (selector) {
      return elements[selector] || null;
    },
    escHtmlAdmin: escapeHtml,
    toNumber(value) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    },
    getData() {
      return data;
    },
    setData(nextData) {
      data = nextData;
    },
    getSelectedPeriodDays() {
      return Number(options.periodDays) || 30;
    },
    getPeriodLabel(days) {
      if (days <= 1) return 'hoje';
      if (days <= 7) return 'esta semana';
      return 'últimos 30 dias';
    },
    getModuleLabel(moduleKey) {
      if (moduleKey === 'moradia') return 'Moradia';
      if (moduleKey === 'compra-venda') return 'Compra e Venda';
      return moduleKey || '';
    },
    getModuleIcon(moduleKey) {
      if (moduleKey === 'moradia') return 'fas fa-home';
      if (moduleKey === 'compra-venda') return 'fas fa-layer-group';
      return 'fas fa-tag';
    },
    classifyTermToModule(term) {
      return window.KCAdminDashboardUtils.classifyTermToModule(term, window.KC_CONSTANTS || {});
    },
    getSeriesKeys() {
      return ['posts_count', 'comments_count', 'searches_count', 'votes_count', 'admin_actions_count'];
    },
    getSeriesMeta() {
      return [
        { key: 'posts_count', label: 'Posts', color: '#ff6b00', icon: 'fas fa-layer-group' },
        { key: 'comments_count', label: 'Comentários', color: '#0ea5e9', icon: 'fas fa-comment' },
        { key: 'searches_count', label: 'Buscas', color: '#8b5cf6', icon: 'fas fa-magnifying-glass' },
        { key: 'votes_count', label: 'Votos', color: '#10b981', icon: 'fas fa-thumbs-up' },
        { key: 'admin_actions_count', label: 'Ações admin', color: '#f97316', icon: 'fas fa-shield-halved' }
      ];
    },
    getChartModalReturnFocus() {
      return chartModalReturnFocus;
    },
    setChartModalReturnFocus(nextValue) {
      chartModalReturnFocus = nextValue || null;
    },
    getRankingExpanded() {
      return rankingExpanded;
    },
    setRankingExpanded(nextValue) {
      rankingExpanded = !!nextValue;
    },
    getRankingRequestSeq() {
      return rankingRequestSeq;
    },
    setRankingRequestSeq(nextValue) {
      rankingRequestSeq = Number(nextValue) || 0;
    },
    showStatusToast: options.showStatusToast || jest.fn()
  };

  deps.__getRankingExpanded = () => rankingExpanded;
  deps.__getRankingRequestSeq = () => rankingRequestSeq;
  deps.__getChartModalReturnFocus = () => chartModalReturnFocus;
  return deps;
}

function makeRankingUsers(count) {
  return Array.from({ length: count }, function (_, index) {
    return {
      rank: index + 1,
      display_name: 'User ' + (index + 1),
      avatar_url: index === 0 ? 'https://cdn.example/avatar-' + (index + 1) + '.png' : '',
      score: 100 - index,
      posts_count: 10 - index,
      votes_received: 20 - index,
      comments_count: 5 + index,
      coupon_clicks: index,
      share_count: index + 2,
      penalties: index === 0 ? 1 : 0
    };
  });
}

function resetRuntime() {
  jest.resetModules();
  global.window = global;
  delete window._KCAD;
  delete window.KCAdminDashboardUtils;
  delete window.KCUtils;
  delete window.KCAPI;
  delete window.KCRanking;
  delete window.KCAdminShell;
  delete window.KC_CONSTANTS;
  global.setTimeout = REAL_SET_TIMEOUT;
}

function loadChartsModule() {
  require(SHARED_PATH);
  require(CHARTS_PATH);
  return window._KCAD.charts;
}

let chartsSource;
let controllerSource;
let htmlSource;

beforeAll(() => {
  chartsSource = fs.readFileSync(CHARTS_PATH, 'utf8');
  controllerSource = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  htmlSource = fs.readFileSync(HTML_PATH, 'utf8');
});

beforeEach(() => {
  resetRuntime();
  window.KC_CONSTANTS = { CATEGORY_LABELS: {} };
  window.KCUtils = { escapeHtml: escapeHtml };
});

afterEach(() => {
  resetRuntime();
});

describe('admin-dashboard.charts.js - contrato estatico', () => {
  test('é uma IIFE com namespace _KCAD.charts', () => {
    expect(chartsSource).toMatch(/\(function\s*\(\)\s*\{/);
    expect(chartsSource).toContain("'use strict';");
    expect(chartsSource).toContain('window._KCAD = window._KCAD || {}');
    expect(chartsSource).toContain('window._KCAD.charts = {');
  });

  test('não usa require/import em runtime', () => {
    expect(chartsSource).not.toMatch(/require\s*\(/);
    expect(chartsSource).not.toMatch(/import\s+/);
  });

  test('expõe exatamente 10 chaves públicas', () => {
    const charts = loadChartsModule();
    expect(Object.keys(charts).sort()).toEqual([
      'aggregateTrendsByModule',
      'bindAdminRanking',
      'bindDailyActivityChartModal',
      'loadAdminRanking',
      'mapPeriodToRanking',
      'renderDailyActivityChart',
      'renderDailyActivitySummary',
      'renderModuleShareTable',
      'renderOperationalAlerts',
      'renderSearchTrends'
    ]);
  });
});

describe('admin-dashboard.controller.js - contrato do split charts', () => {
  test('mantém o guard do submódulo charts', () => {
    expect(controllerSource).toContain('window._KCAD.charts = window._KCAD.charts || {};');
  });

  test('delega renderers, modal e ranking ao submódulo extraído', () => {
    expect(controllerSource).toContain("window._KCAD.charts.renderSearchTrends(trends, periodDays, buildChartsDeps())");
    expect(controllerSource).toContain("window._KCAD.charts.renderDailyActivitySummary(summary, buildChartsDeps())");
    expect(controllerSource).toContain("window._KCAD.charts.bindDailyActivityChartModal(buildChartsDeps())");
    expect(controllerSource).toContain("window._KCAD.charts.renderDailyActivityChart(series, buildChartsDeps())");
    expect(controllerSource).toContain("window._KCAD.charts.renderModuleShareTable(rows, buildChartsDeps())");
    expect(controllerSource).toContain("window._KCAD.charts.renderOperationalAlerts(alerts, buildChartsDeps())");
    expect(controllerSource).toContain("window._KCAD.charts.loadAdminRanking(options, buildChartsDeps())");
    expect(controllerSource).toContain("window._KCAD.charts.bindAdminRanking(buildChartsDeps())");
  });

  test('removeu o corpo de charts/ranking do core', () => {
    expect(controllerSource).not.toContain('function mapPeriodToRanking(');
    expect(controllerSource).not.toContain('function buildDailyActivityChartSvg(');
    expect(controllerSource).not.toContain('function renderChartInto(');
  });

  test('preserva o export público do refresh', () => {
    expect(controllerSource).toContain('window.KCAdminDashboardRefresh = refreshDashboard;');
  });
});

describe('admin/index.html - ordem dos scripts do dashboard admin', () => {
  test('carrega shared -> metrics -> audit -> charts -> kc-ranking -> privacy -> controller', () => {
    const orderedScripts = [
      '<script defer src="../assets/js/controllers/admin/admin-dashboard.shared.js?v=8.6.1"></script>',
      '<script defer src="../assets/js/controllers/admin/admin-dashboard.metrics.js?v=8.6.3"></script>',
      '<script defer src="../assets/js/controllers/admin/admin-dashboard.audit.js?v=8.6.3"></script>',
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

describe('window._KCAD.charts - comportamento', () => {
  test('aggregateTrendsByModule agrupa por módulo usando os helpers compartilhados', () => {
    const charts = loadChartsModule();

    const rows = charts.aggregateTrendsByModule([
      { term: 'quartos', count: 3 },
      { term: 'celulares', count: 2 }
    ]);

    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ module: 'moradia', label: 'Moradia', count: 3 }),
      expect.objectContaining({ module: 'compra-venda', label: 'Compra e Venda', count: 2 })
    ]));
  });

  test('renderSearchTrends mostra empty state quando não há termos', () => {
    const charts = loadChartsModule();
    const listEl = createElement();
    const modulesEl = createElement();
    const deps = createDeps({
      elements: {
        '#admin-trends-list': listEl,
        '#admin-trends-modules': modulesEl
      }
    });

    charts.renderSearchTrends([], 30, deps);

    expect(listEl.innerHTML).toContain('Nenhuma busca registrada');
    expect(modulesEl.style.display).toBe('none');
  });

  test('renderSearchTrends renderiza lista e agrupamento por módulo', () => {
    const charts = loadChartsModule();
    const listEl = createElement();
    const modulesEl = createElement();
    const deps = createDeps({
      elements: {
        '#admin-trends-list': listEl,
        '#admin-trends-modules': modulesEl
      }
    });

    charts.renderSearchTrends([
      { term: 'quartos', count: 5 },
      { term: 'celulares', count: 2 }
    ], 30, deps);

    expect(listEl.innerHTML).toContain('kc-trend-item');
    expect(listEl.innerHTML).toContain('quartos');
    expect(modulesEl.innerHTML).toContain('Por módulo');
    expect(modulesEl.innerHTML).toContain('kc-trend-module-badge');
  });

  test('renderDailyActivitySummary monta os KPIs do pulso', () => {
    const charts = loadChartsModule();
    const container = createElement();
    const deps = createDeps({
      elements: {
        '#admin-daily-activity-summary': container
      }
    });

    charts.renderDailyActivitySummary({
      peakDay: { label: '15/04' },
      peakTotal: 12,
      averageTotal: '4.5',
      lastDayTotal: 3,
      totals: { searches_count: 9 }
    }, deps);

    expect(container.innerHTML).toContain('Pico diário');
    expect(container.innerHTML).toContain('4.5');
    expect(container.innerHTML).toContain('15/04');
  });

  test('renderDailyActivityChart mostra empty state e desabilita expansão sem série', () => {
    const charts = loadChartsModule();
    const chartEl = createElement();
    const legendEl = createElement();
    const expandBtn = createElement();
    const modal = createElement();
    const modalContent = createElement();
    const modalLegend = createElement();
    const modalMeta = createElement();
    installDocument({
      '#admin-daily-activity-chart': chartEl,
      '#admin-daily-activity-legend': legendEl,
      '#admin-chart-expand-btn': expandBtn,
      '#admin-chart-modal': modal,
      '#admin-chart-modal-content': modalContent,
      '#admin-chart-modal-legend': modalLegend,
      '#admin-chart-modal-meta': modalMeta
    });

    const deps = createDeps({
      elements: {
        '#admin-daily-activity-chart': chartEl,
        '#admin-daily-activity-legend': legendEl,
        '#admin-chart-expand-btn': expandBtn,
        '#admin-chart-modal': modal,
        '#admin-chart-modal-content': modalContent,
        '#admin-chart-modal-legend': modalLegend,
        '#admin-chart-modal-meta': modalMeta
      }
    });

    charts.renderDailyActivityChart([], deps);

    expect(chartEl.innerHTML).toContain('Sem dados suficientes');
    expect(legendEl.innerHTML).toBe('');
    expect(expandBtn.disabled).toBe(true);
  });

  test('bindDailyActivityChartModal abre e fecha o modal expandido', () => {
    const charts = loadChartsModule();
    const expandBtn = createElement();
    const closeBtn = createElement();
    const modal = createElement();
    const modalContent = createElement();
    const modalLegend = createElement();
    const modalMeta = createElement();
    const chartEl = createElement();
    const legendEl = createElement();
    const returnFocusEl = createElement();
    installDocument({
      '#admin-chart-expand-btn': expandBtn,
      '#admin-chart-modal-close': closeBtn,
      '#admin-chart-modal': modal,
      '#admin-chart-modal-content': modalContent,
      '#admin-chart-modal-legend': modalLegend,
      '#admin-chart-modal-meta': modalMeta,
      '#admin-daily-activity-chart': chartEl,
      '#admin-daily-activity-legend': legendEl
    });
    global.setTimeout = function (handler) { handler(); return 0; };
    window.KCAdminShell = { setModalOpen: jest.fn() };

    const deps = createDeps({
      data: {
        periodDays: 30,
        dailyMetrics: [
          {
            label: '01/04',
            posts_count: 1,
            comments_count: 2,
            searches_count: 3,
            votes_count: 4,
            admin_actions_count: 1
          }
        ]
      },
      elements: {
        '#admin-chart-expand-btn': expandBtn,
        '#admin-chart-modal-close': closeBtn,
        '#admin-chart-modal': modal,
        '#admin-chart-modal-content': modalContent,
        '#admin-chart-modal-legend': modalLegend,
        '#admin-chart-modal-meta': modalMeta,
        '#admin-daily-activity-chart': chartEl,
        '#admin-daily-activity-legend': legendEl
      }
    });

    charts.bindDailyActivityChartModal(deps);
    expandBtn.getListener('click')();

    expect(modal.getAttribute('aria-hidden')).toBe('false');
    expect(modalContent.innerHTML).toContain('<svg');
    expect(modalLegend.innerHTML).toContain('Posts');
    expect(modalMeta.textContent).toContain('Período analisado');
    expect(closeBtn.focused).toBe(true);
    expect(window.KCAdminShell.setModalOpen).toHaveBeenCalledWith(true);

    closeBtn.getListener('click')();

    expect(modal.getAttribute('aria-hidden')).toBe('true');
    expect(window.KCAdminShell.setModalOpen).toHaveBeenCalledWith(false);
  });

  test('renderModuleShareTable monta a tabela de share por módulo', () => {
    const charts = loadChartsModule();
    const container = createElement();
    const deps = createDeps({
      elements: {
        '#admin-module-share-table': container
      }
    });

    charts.renderModuleShareTable([
      { module: 'moradia', label: 'Moradia', icon: 'fas fa-home', share: 60, count: 6, topTerms: ['quarto', 'vaga'] }
    ], deps);

    expect(container.innerHTML).toContain('<table>');
    expect(container.innerHTML).toContain('Moradia');
    expect(container.innerHTML).toContain('60%');
  });

  test('renderOperationalAlerts cobre os estados empty e populated', () => {
    const charts = loadChartsModule();
    const container = createElement();
    const deps = createDeps({
      elements: {
        '#admin-operational-alerts': container
      }
    });

    charts.renderOperationalAlerts([], deps);
    expect(container.innerHTML).toContain('Nenhum alerta operacional');

    charts.renderOperationalAlerts([
      { tone: 'warning', title: 'Pico', body: 'Atenção imediata.' }
    ], deps);
    expect(container.innerHTML).toContain('kc-admin-alert--warning');
    expect(container.innerHTML).toContain('Pico');
  });

  test('mapPeriodToRanking converte dia, semana e mês', () => {
    const charts = loadChartsModule();
    expect(charts.mapPeriodToRanking(1)).toBe('day');
    expect(charts.mapPeriodToRanking(7)).toBe('week');
    expect(charts.mapPeriodToRanking(30)).toBe('month');
  });

  test('loadAdminRanking mostra indisponibilidade quando a API não existe', async () => {
    const charts = loadChartsModule();
    const tableEl = createElement();
    const deps = createDeps({
      elements: {
        '#admin-ranking-table': tableEl
      }
    });

    await charts.loadAdminRanking({}, deps);

    expect(tableEl.innerHTML).toContain('API indisponível');
  });

  test('loadAdminRanking renderiza a tabela e habilita o CTA de expandir', async () => {
    const charts = loadChartsModule();
    const tableEl = createElement();
    const showAllBtn = createElement({ style: {} });
    const moduleFilter = createElement({ value: '' });
    const deps = createDeps({
      elements: {
        '#admin-ranking-table': tableEl,
        '#admin-ranking-show-all': showAllBtn,
        '#admin-ranking-module-filter': moduleFilter
      }
    });

    window.KCAPI = {
      getTopContributors: jest.fn().mockResolvedValue(makeRankingUsers(10))
    };

    await charts.loadAdminRanking({}, deps);

    expect(window.KCAPI.getTopContributors).toHaveBeenCalledWith('month', null, 10);
    expect(tableEl.innerHTML).toContain('kc-ranking-score-table');
    expect(showAllBtn.style.display).toBe('block');
    expect(showAllBtn.innerHTML).toContain('Mostrar todos');
    expect(deps.__getRankingRequestSeq()).toBe(1);
  });

  test('loadAdminRanking trata erro e emite toast', async () => {
    const charts = loadChartsModule();
    const tableEl = createElement();
    const toastSpy = jest.fn();
    const deps = createDeps({
      elements: {
        '#admin-ranking-table': tableEl
      },
      showStatusToast: toastSpy
    });

    window.KCAPI = {
      getTopContributors: jest.fn().mockRejectedValue(new Error('boom'))
    };

    await charts.loadAdminRanking({}, deps);

    expect(tableEl.innerHTML).toContain('Erro ao carregar ranking');
    expect(toastSpy).toHaveBeenCalledWith('Não foi possível atualizar o ranking agora.', 'error', { duration: 3600 });
  });

  test('bindAdminRanking reseta expansão no filtro e abre o modal informativo', async () => {
    const charts = loadChartsModule();
    const tableEl = createElement();
    const moduleFilter = createElement({ value: 'moradia', dataset: {} });
    const showAllBtn = createElement({ style: {}, dataset: {} });
    const infoBtn = createElement({ dataset: {} });
    const modal = createElement();
    installDocument({
      '#admin-ranking-table': tableEl,
      '#admin-ranking-module-filter': moduleFilter,
      '#admin-ranking-show-all': showAllBtn,
      '#admin-ranking-info-btn': infoBtn,
      '#kcRankingInfoModal': modal
    });

    window.KCAPI = {
      getTopContributors: jest.fn().mockResolvedValue(makeRankingUsers(3))
    };
    window.KCRanking = {
      ensureInfoModal: jest.fn()
    };

    const deps = createDeps({
      rankingExpanded: true,
      elements: {
        '#admin-ranking-table': tableEl,
        '#admin-ranking-module-filter': moduleFilter,
        '#admin-ranking-show-all': showAllBtn,
        '#admin-ranking-info-btn': infoBtn
      }
    });

    charts.bindAdminRanking(deps);

    moduleFilter.getListener('change')();
    await Promise.resolve();
    await Promise.resolve();

    expect(deps.__getRankingExpanded()).toBe(false);
    expect(window.KCAPI.getTopContributors).toHaveBeenCalledWith('month', 'moradia', 10);

    infoBtn.getListener('click')();
    expect(window.KCRanking.ensureInfoModal).toHaveBeenCalledTimes(1);
    expect(modal.getAttribute('aria-hidden')).toBe('false');
  });

  test('bindAdminRanking alterna entre top 10 e expandido', async () => {
    const charts = loadChartsModule();
    const tableEl = createElement();
    const moduleFilter = createElement({ value: '', dataset: {} });
    const showAllBtn = createElement({ style: {}, dataset: {} });
    const deps = createDeps({
      elements: {
        '#admin-ranking-table': tableEl,
        '#admin-ranking-module-filter': moduleFilter,
        '#admin-ranking-show-all': showAllBtn
      }
    });

    window.KCAPI = {
      getTopContributors: jest.fn()
        .mockResolvedValueOnce(makeRankingUsers(10))
        .mockResolvedValueOnce(makeRankingUsers(12))
    };

    charts.bindAdminRanking(deps);
    showAllBtn.getListener('click')();
    await Promise.resolve();
    await Promise.resolve();

    expect(deps.__getRankingExpanded()).toBe(true);
    expect(window.KCAPI.getTopContributors).toHaveBeenCalledWith('month', null, 100);
  });
});

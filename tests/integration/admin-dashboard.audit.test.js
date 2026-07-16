'use strict';

const fs = require('fs');
const path = require('path');

const AUDIT_PATH = path.resolve(__dirname, '../../assets/js/controllers/admin/admin-dashboard.audit.js');
const CONTROLLER_PATH = path.resolve(__dirname, '../../assets/js/controllers/admin/admin-dashboard.controller.js');
const HTML_PATH = path.resolve(__dirname, '../../admin/index.html');

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
    insertAdjacentHTML(position, html) {
      if (position === 'beforeend') this.innerHTML += html;
    }
  }, initial || {});
  return element;
}

function makeDocument(elements) {
  return {
    querySelector(selector) {
      return elements[selector] || null;
    },
    head: {
      appendChild() {}
    },
    body: {
      appendChild() {}
    },
    createElement() {
      return {
        onload: null,
        onerror: null,
        parentNode: {
          removeChild() {}
        }
      };
    }
  };
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
    in(field, value) {
      state.in = state.in || [];
      state.in.push({ field, value });
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

function createDeps(options) {
  options = options || {};
  let data = options.data || null;
  let auditOffset = options.auditOffset || 0;
  let exportBound = !!options.exportBound;
  let xlsxLoadPromise = null;
  let jspdfLoadPromise = null;
  const actorCache = options.actorCache || {};
  const elements = options.elements || {};

  return {
    $: function (selector) {
      return elements[selector] || null;
    },
    escHtmlAdmin: escapeHtml,
    showError: options.showError || jest.fn(),
    showStatusToast: options.showStatusToast || jest.fn(),
    hideStatusToast: options.hideStatusToast || jest.fn(),
    toNumber(value) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    },
    formatDateBR(value) {
      if (!value) return '-';
      return 'DATE:' + String(value).slice(0, 10);
    },
    formatDateTimeBR(value) {
      if (!value) return '-';
      return 'DT:' + String(value).slice(0, 16);
    },
    getPeriodLabel(days) {
      return days === 7 ? 'esta semana' : 'últimos 30 dias';
    },
    getPeriodRange() {
      return { since: '2026-04-01T00:00:00Z', until: '2026-04-30T23:59:59Z', label: 'últimos 30 dias' };
    },
    getSelectedPeriodDays() {
      return 30;
    },
    getModuleLabel(moduleKey) {
      return moduleKey === 'moradia' ? 'Moradia' : (moduleKey || '');
    },
    classifyTermToModule(term) {
      return String(term || '').includes('quarto') ? 'moradia' : null;
    },
    resolveTermModule(item) {
      return (item && item.module) || (String(item && item.term || '').includes('quarto') ? 'moradia' : null);
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
    getSeriesTotals(series) {
      const totals = {};
      ['posts_count', 'comments_count', 'searches_count', 'votes_count', 'admin_actions_count'].forEach((key) => {
        totals[key] = (series || []).reduce((sum, row) => sum + (Number(row && row[key]) || 0), 0);
      });
      return totals;
    },
    hexToRgb() {
      return { r: 255, g: 107, b: 0 };
    },
    getClient() {
      return options.client || null;
    },
    getAuditPageSize() {
      return options.pageSize || 20;
    },
    getScriptLoadTimeoutMs() {
      return 100;
    },
    getData() {
      return data;
    },
    setData(nextData) {
      data = nextData;
    },
    getAuditOffset() {
      return auditOffset;
    },
    setAuditOffset(nextOffset) {
      auditOffset = nextOffset;
    },
    getExportBound() {
      return exportBound;
    },
    setExportBound(nextValue) {
      exportBound = !!nextValue;
    },
    getXlsxLoadPromise() {
      return xlsxLoadPromise;
    },
    setXlsxLoadPromise(nextValue) {
      xlsxLoadPromise = nextValue;
    },
    getJspdfLoadPromise() {
      return jspdfLoadPromise;
    },
    setJspdfLoadPromise(nextValue) {
      jspdfLoadPromise = nextValue;
    },
    getActorCache() {
      return actorCache;
    },
    getVisibleSeriesKeys() {
      return options.visibleSeriesKeys || ['posts_count', 'comments_count', 'searches_count', 'votes_count', 'admin_actions_count'];
    },
    getRankingRows() {
      return options.rankingRows || [];
    },
    getRankingContext() {
      return options.rankingContext || { module: '', expanded: false };
    },
    getTrendExportSnapshot() {
      return options.trendSnapshot || { rows: (data && data.trends) || [], module: '', query: '' };
    },
    isDashboardBusy() {
      return !!options.dashboardBusy;
    }
  };
}

function sampleData() {
  return {
    periodDays: 30,
    periodLabel: 'últimos 30 dias',
    periodStart: '2026-04-01T00:00:00Z',
    periodEnd: '2026-04-30T23:59:59Z',
    reportMetrics: { open: 3, total: 4 },
    postStatusMetrics: { hidden: 1, deleted: 2 },
    postsTotal: 10,
    postsCreated: 4,
    postsEdited: 2,
    commentsCount: 6,
    searchCount: 8,
    usersTotal: 20,
    usersNew: 2,
    votesCount: 5,
    savedPostsCount: 7,
    dailySummary: {
      peakTotal: 10,
      averageTotal: '4.5',
      lastDayTotal: 3,
      totals: { searches_count: 8 }
    },
    dailyMetrics: [
      {
        day: '2026-04-01',
        label: '01/04',
        posts_count: 1,
        comments_count: 2,
        searches_count: 3,
        votes_count: 4,
        admin_actions_count: 1,
        total_count: 11
      }
    ],
    moduleShareRows: [
      { label: 'Moradia', module: 'moradia', share: 60, count: 6, topTerms: ['quarto'] }
    ],
    alerts: [
      { tone: 'warning', title: 'Pico', body: 'Atenção' }
    ],
    auditRows: [
      {
        created_at: '2026-04-10T10:00:00Z',
        action: 'post_hidden',
        entity_type: 'post',
        actor_id: '123e4567-e89b-12d3-a456-426614174000'
      }
    ],
    trends: [
      { term: 'quartos', count: 5 }
    ]
  };
}

function resetRuntime() {
  jest.resetModules();
  global.window = global;
  delete window._KCAD;
  delete window.KCAdminExport;
  delete window.XLSX;
  delete window.jspdf;
  delete global.document;
}

function loadAuditModule() {
  require(AUDIT_PATH);
  return window._KCAD.audit;
}

let auditSource;
let controllerSource;
let htmlSource;

beforeAll(() => {
  auditSource = fs.readFileSync(AUDIT_PATH, 'utf8');
  controllerSource = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  htmlSource = fs.readFileSync(HTML_PATH, 'utf8');
});

beforeEach(() => {
  resetRuntime();
});

afterEach(() => {
  resetRuntime();
});

describe('admin-dashboard.audit.js - contrato estatico', () => {
  test('e uma IIFE com namespace _KCAD.audit', () => {
    expect(auditSource).toMatch(/\(function\s*\(\)\s*\{/);
    expect(auditSource).toContain("'use strict';");
    expect(auditSource).toContain('window._KCAD = window._KCAD || {}');
    expect(auditSource).toContain('window._KCAD.audit = {');
  });

  test('nao usa require/import em runtime', () => {
    expect(auditSource).not.toMatch(/require\s*\(/);
    expect(auditSource).not.toMatch(/import\s+/);
  });

  test('expoe exatamente 15 chaves publicas', () => {
    const audit = loadAuditModule();
    expect(Object.keys(audit).sort()).toEqual([
      'beginRequest',
      'bindAuditControls',
      'enableExport',
      'exportAuditCSV',
      'exportPDF',
      'exportXLSX',
      'filterAudit',
      'getActorDisplay',
      'isCurrentRequest',
      'loadActorsById',
      'loadAuditLog',
      'loadMoreAudit',
      'normalizeAuditFilters',
      'readAuditFilters',
      'renderAuditRows'
    ]);
  });

  test('sequencia compartilhada invalida respostas antigas do audit', () => {
    const audit = loadAuditModule();
    const first = audit.beginRequest();
    expect(audit.isCurrentRequest(first)).toBe(true);
    const second = audit.beginRequest();
    expect(audit.isCurrentRequest(first)).toBe(false);
    expect(audit.isCurrentRequest(second)).toBe(true);
  });
});

describe('admin-dashboard.controller.js - contrato do split audit', () => {
  test('mantem o guard do submodulo audit', () => {
    expect(controllerSource).toContain('window._KCAD.audit = window._KCAD.audit || {};');
  });

  test('delega audit log e export ao submodulo extraido', () => {
    expect(controllerSource).toContain("window._KCAD.audit.loadActorsById(client, actorIds, buildAuditDeps())");
    expect(controllerSource).toContain("window._KCAD.audit.loadAuditLog(client, limit, offset, actionFilter, since, buildAuditDeps())");
    expect(controllerSource).toContain("window._KCAD.audit.renderAuditRows(rows, append, buildAuditDeps())");
    expect(controllerSource).toContain("window._KCAD.audit.enableExport(buildAuditDeps())");
    expect(controllerSource).toContain("window._KCAD.audit.loadMoreAudit(buildAuditDeps())");
    expect(controllerSource).toContain("window._KCAD.audit.filterAudit(buildAuditDeps())");
    expect(controllerSource).toContain("window._KCAD.audit.bindAuditControls(buildAuditDeps())");
  });

  test('removeu o corpo de exportacao/audit do core', () => {
    expect(controllerSource).not.toContain('window.XLSX');
    expect(controllerSource).not.toContain('window.jspdf.jsPDF');
    expect(controllerSource).not.toContain("client.rpc('kc_admin_list_audit_logs'");
    expect(controllerSource).not.toContain("document.createElement('script')");
  });
});

describe('admin/index.html - ordem dos scripts do dashboard admin', () => {
  test('carrega shared -> metrics -> audit -> charts -> kc-ranking -> privacy -> controller', () => {
    const orderedScripts = [
      '<script defer src="../assets/js/controllers/admin/admin-dashboard.shared.js?v=8.6.10"></script>',
      '<script defer src="../assets/js/controllers/admin/admin-dashboard.metrics.js?v=8.6.10"></script>',
      '<script defer src="../assets/js/controllers/admin/admin-dashboard.audit.js?v=8.6.10"></script>',
      '<script defer src="../assets/js/controllers/admin/admin-dashboard.charts.js?v=8.6.10"></script>',
      '<script defer src="../assets/js/features/kc-ranking.js?v=8.6.10"></script>',
      '<script defer src="../assets/js/controllers/admin/admin-dashboard.privacy.js?v=8.6.10"></script>',
      '<script defer src="../assets/js/controllers/admin/admin-dashboard.controller.js?v=8.6.10"></script>'
    ];

    let lastIndex = -1;
    orderedScripts.forEach((scriptTag) => {
      const currentIndex = htmlSource.indexOf(scriptTag);
      expect(currentIndex).toBeGreaterThan(lastIndex);
      lastIndex = currentIndex;
    });
  });
});

describe('window._KCAD.audit - comportamento', () => {
  test('getActorDisplay retorna system, nome conhecido e fallback truncado', () => {
    const audit = loadAuditModule();
    const deps = createDeps({
      actorCache: {
        '123e4567-e89b-12d3-a456-426614174000': { display_name: 'Mod Ana', full_name: '' }
      }
    });

    expect(audit.getActorDisplay(null, deps)).toBe('system');
    expect(audit.getActorDisplay('123e4567-e89b-12d3-a456-426614174000', deps)).toBe('Mod Ana');
    expect(audit.getActorDisplay('abcdefghi', deps)).toBe('abcdefgh...');
  });

  test('loadActorsById hidrata o cache de atores', async () => {
    const audit = loadAuditModule();
    const actorCache = {};
    const client = makeClient({
      fromHandler(state) {
        if (state.table === 'profiles') {
          return {
            data: [
              { id: '123e4567-e89b-12d3-a456-426614174000', display_name: 'Mod Bia', full_name: 'Bia Silva' }
            ],
            error: null
          };
        }
        return { data: [], error: null };
      }
    });
    const deps = createDeps({ actorCache });

    await audit.loadActorsById(client, ['123e4567-e89b-12d3-a456-426614174000'], deps);

    expect(actorCache['123e4567-e89b-12d3-a456-426614174000']).toEqual({
      display_name: 'Mod Bia',
      full_name: 'Bia Silva'
    });
  });

  test('loadAuditLog usa query direta quando disponivel', async () => {
    const audit = loadAuditModule();
    const client = makeClient({
      fromHandler(state) {
        if (state.table === 'audit_log') {
          return {
            data: [
              { created_at: '2026-04-10T10:00:00Z', action: 'post_hidden', entity_type: 'post', actor_id: '1' }
            ],
            error: null
          };
        }
        return { data: [], error: null };
      }
    });

    await expect(audit.loadAuditLog(client, 20, 0, 'all', '2026-04-01T00:00:00Z')).resolves.toEqual([
      { created_at: '2026-04-10T10:00:00Z', action: 'post_hidden', entity_type: 'post', actor_id: '1' }
    ]);
  });

  test('loadAuditLog cai para RPC quando a query direta falha por permissao', async () => {
    const audit = loadAuditModule();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const client = makeClient({
      fromHandler(state) {
        if (state.table === 'audit_log') {
          return { data: null, error: { message: 'row-level security policy violation' } };
        }
        return { data: [], error: null };
      },
      rpcHandler(name) {
        if (name === 'kc_admin_list_audit_logs') {
          return {
            data: [
              { created_at: '2026-04-11T10:00:00Z', action: 'post_deleted', entity_type: 'post', actor_id: '2' }
            ],
            error: null
          };
        }
        return { data: [], error: null };
      }
    });

    await expect(audit.loadAuditLog(client, 20, 0, 'all', '2026-04-01T00:00:00Z')).resolves.toEqual([
      { created_at: '2026-04-11T10:00:00Z', action: 'post_deleted', entity_type: 'post', actor_id: '2' }
    ]);

    warnSpy.mockRestore();
  });

  test('loadAuditLog marca indisponibilidade quando todas as fontes falham', async () => {
    const audit = loadAuditModule();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const client = makeClient({
      fromHandler() {
        return { data: null, error: { code: '42501', message: 'permission denied' } };
      },
      rpcHandler() {
        return { data: null, error: { code: '42883', message: 'function missing' } };
      }
    });

    const rows = await audit.loadAuditLog(client, 20, 0, 'all', '2026-04-01T00:00:00Z');

    expect(rows).toEqual([]);
    expect(rows.__kcAvailable).toBe(false);
    expect(rows.__kcSource).toBe('unavailable');
    warnSpy.mockRestore();
  });

  test('renderAuditRows distingue fonte indisponível de zero eventos', () => {
    const audit = loadAuditModule();
    const auditBody = createElement();
    const auditSummary = createElement();
    const loadMoreBtn = createElement({ textContent: 'Carregar mais' });
    const rows = [];
    Object.defineProperty(rows, '__kcAvailable', { value: false });
    const deps = createDeps({
      elements: {
        '#admin-audit-body': auditBody,
        '#admin-audit-summary': auditSummary,
        '#admin-audit-load-more': loadMoreBtn
      }
    });

    audit.renderAuditRows(rows, false, deps);

    expect(auditBody.innerHTML).toContain('Auditoria indisponível neste carregamento');
    expect(auditSummary.textContent).toContain('Auditoria indisponível');
    expect(loadMoreBtn.disabled).toBe(true);
    expect(loadMoreBtn.textContent).toBe('Auditoria indisponível');
  });

  test('renderAuditRows escreve linhas e atualiza o botao de carregamento', () => {
    const audit = loadAuditModule();
    const auditBody = createElement();
    const loadMoreBtn = createElement({ textContent: 'Carregar mais' });
    const deps = createDeps({
      elements: {
        '#admin-audit-body': auditBody,
        '#admin-audit-load-more': loadMoreBtn
      },
      actorCache: {
        '123e4567-e89b-12d3-a456-426614174000': { display_name: 'Mod Ana' }
      },
      pageSize: 20
    });

    audit.renderAuditRows([
      {
        created_at: '2026-04-10T10:00:00Z',
        action: 'post_hidden',
        entity_type: 'post',
        actor_id: '123e4567-e89b-12d3-a456-426614174000'
      }
    ], false, deps);

    expect(auditBody.innerHTML).toContain('Ocultado');
    expect(auditBody.innerHTML).toContain('Mod Ana');
    expect(loadMoreBtn.disabled).toBe(true);
    expect(loadMoreBtn.textContent).toBe('Fim do histórico');
  });

  test('renderAuditRows distingue encerramento automático de denúncia', () => {
    const audit = loadAuditModule();
    const auditBody = createElement();
    const loadMoreBtn = createElement({ textContent: 'Carregar mais' });
    const deps = createDeps({
      elements: {
        '#admin-audit-body': auditBody,
        '#admin-audit-load-more': loadMoreBtn
      }
    });

    audit.renderAuditRows([
      { action: 'posts_auto_closed', entity_type: 'post' },
      { action: 'post_auto_moderated', entity_type: 'post' },
      { action: 'report_closed', entity_type: 'report' }
    ], false, deps);

    expect(auditBody.innerHTML).toContain('Encerramento automático');
    expect(auditBody.innerHTML).toContain('Moderação automática');
    expect(auditBody.innerHTML).toContain('Denúncia');
  });

  test('renderAuditRows append vazio sinaliza fim do historico', () => {
    const audit = loadAuditModule();
    const auditBody = createElement({ innerHTML: '<tr></tr>' });
    const loadMoreBtn = createElement({ textContent: 'Carregar mais' });
    const deps = createDeps({
      elements: {
        '#admin-audit-body': auditBody,
        '#admin-audit-load-more': loadMoreBtn
      }
    });

    audit.renderAuditRows([], true, deps);

    expect(auditBody.innerHTML).toBe('<tr></tr>');
    expect(loadMoreBtn.disabled).toBe(true);
    expect(loadMoreBtn.textContent).toBe('Fim do histórico');
  });

  test('loadMoreAudit incrementa offset e concatena auditRows no estado', async () => {
    const audit = loadAuditModule();
    const auditBody = createElement();
    const loadMoreBtn = createElement({ textContent: 'Carregar mais' });
    const filterEl = createElement({ value: 'all' });
    const client = makeClient({
      fromHandler(state) {
        if (state.table === 'audit_log') {
          return {
            data: [
              { created_at: '2026-04-12T10:00:00Z', action: 'post_restored', entity_type: 'post', actor_id: '123e4567-e89b-12d3-a456-426614174000' }
            ],
            error: null
          };
        }
        if (state.table === 'profiles') {
          return {
            data: [
              { id: '123e4567-e89b-12d3-a456-426614174000', display_name: 'Mod Cris', full_name: '' }
            ],
            error: null
          };
        }
        return { data: [], error: null };
      }
    });
    const deps = createDeps({
      client,
      data: { auditRows: [] },
      auditOffset: 0,
      elements: {
        '#admin-audit-body': auditBody,
        '#admin-audit-load-more': loadMoreBtn,
        '#admin-audit-filter': filterEl
      }
    });

    await audit.loadMoreAudit(deps);

    expect(deps.getAuditOffset()).toBe(1);
    expect(deps.getData().auditRows).toHaveLength(1);
    expect(auditBody.innerHTML).toContain('Restaurado');
    expect(auditBody.innerHTML).toContain('Mod Cris');
  });

  test('loadMoreAudit ignora clique enquanto outro ciclo de auditoria está pendente', async () => {
    const audit = loadAuditModule();
    const fromHandler = jest.fn(() => ({ data: [], error: null }));
    const loadMoreBtn = createElement({ textContent: 'Filtrando...', disabled: true });
    const deps = createDeps({
      client: makeClient({ fromHandler }),
      elements: {
        '#admin-audit-load-more': loadMoreBtn
      }
    });
    window._KCAD.__adminAuditState = { pending: true };

    await audit.loadMoreAudit(deps);

    expect(fromHandler).not.toHaveBeenCalled();
    expect(loadMoreBtn.textContent).toBe('Filtrando...');
    expect(loadMoreBtn.disabled).toBe(true);
  });

  test('filterAudit reseta offset e substitui auditRows', async () => {
    const audit = loadAuditModule();
    const auditBody = createElement();
    const loadMoreBtn = createElement({ textContent: 'Carregar mais' });
    const filterEl = createElement({ value: 'post_deleted' });
    const client = makeClient({
      fromHandler(state) {
        if (state.table === 'audit_log') {
          return {
            data: [
              { created_at: '2026-04-13T10:00:00Z', action: 'post_deleted', entity_type: 'post', actor_id: '123e4567-e89b-12d3-a456-426614174000' }
            ],
            error: null
          };
        }
        if (state.table === 'profiles') {
          return {
            data: [
              { id: '123e4567-e89b-12d3-a456-426614174000', display_name: 'Mod Dani', full_name: '' }
            ],
            error: null
          };
        }
        return { data: [], error: null };
      }
    });
    const deps = createDeps({
      client,
      data: { auditRows: [{ action: 'old' }] },
      auditOffset: 5,
      elements: {
        '#admin-audit-body': auditBody,
        '#admin-audit-load-more': loadMoreBtn,
        '#admin-audit-filter': filterEl
      }
    });

    await audit.filterAudit(deps);

    expect(deps.getAuditOffset()).toBe(1);
    expect(deps.getData().auditRows).toEqual([
      { created_at: '2026-04-13T10:00:00Z', action: 'post_deleted', entity_type: 'post', actor_id: '123e4567-e89b-12d3-a456-426614174000' }
    ]);
    expect(auditBody.innerHTML).toContain('Deletado');
  });

  test('filterAudit só publica filtros e linhas juntos ao concluir a requisição', async () => {
    const audit = loadAuditModule();
    const auditBody = createElement();
    const loadMoreBtn = createElement({ textContent: 'Carregar mais' });
    const filterEl = createElement({ value: 'post_deleted' });
    let resolveAudit;
    const client = makeClient({
      fromHandler(state) {
        if (state.table === 'audit_log') {
          return new Promise((resolve) => {
            resolveAudit = resolve;
          });
        }
        return { data: [], error: null };
      }
    });
    const deps = createDeps({
      client,
      data: {
        auditRows: [{ action: 'post_hidden' }],
        auditFilters: { action: 'post_hidden', entityType: 'all', actorQuery: '' }
      },
      elements: {
        '#admin-audit-body': auditBody,
        '#admin-audit-load-more': loadMoreBtn,
        '#admin-audit-filter': filterEl
      }
    });

    const pending = audit.filterAudit(deps);
    expect(window._KCAD.__adminAuditState.pending).toBe(true);
    expect(deps.getData().auditFilters.action).toBe('post_hidden');
    expect(loadMoreBtn.disabled).toBe(true);
    expect(loadMoreBtn.textContent).toBe('Filtrando...');
    await Promise.resolve();

    resolveAudit({
      data: [{ action: 'post_deleted', entity_type: 'post' }],
      error: null
    });
    await pending;

    expect(deps.getData().auditRows[0].action).toBe('post_deleted');
    expect(deps.getData().auditFilters.action).toBe('post_deleted');
    expect(window._KCAD.__adminAuditState.pending).toBe(false);
    expect(loadMoreBtn.textContent).not.toBe('Filtrando...');
  });

  test('filterAudit restaura paginação e botão quando a nova consulta falha', async () => {
    const audit = loadAuditModule();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const loadMoreBtn = createElement({
      textContent: 'Fim do histórico',
      disabled: true,
      style: { display: '' }
    });
    const filterEl = createElement({ value: 'post_deleted' });
    const previousRows = [{ action: 'post_hidden', entity_type: 'post' }];
    const client = makeClient({
      fromHandler() {
        return { data: null, error: { code: '42501', message: 'permission denied' } };
      },
      rpcHandler() {
        return { data: null, error: { code: '42883', message: 'function missing' } };
      }
    });
    const deps = createDeps({
      client,
      data: {
        auditRows: previousRows,
        auditFilters: { action: 'post_hidden', entityType: 'all', actorQuery: '' }
      },
      auditOffset: 5,
      elements: {
        '#admin-audit-load-more': loadMoreBtn,
        '#admin-audit-filter': filterEl
      }
    });

    await audit.filterAudit(deps);

    expect(deps.getAuditOffset()).toBe(5);
    expect(deps.getData().auditRows).toEqual(previousRows);
    expect(deps.getData().auditFilters.action).toBe('post_hidden');
    expect(loadMoreBtn.textContent).toBe('Fim do histórico');
    expect(loadMoreBtn.disabled).toBe(true);
    expect(loadMoreBtn.style.display).toBe('');
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('exportação traduz alerta critical como Crítico', async () => {
    const audit = loadAuditModule();
    const exportReportXLSX = jest.fn().mockResolvedValue(undefined);
    window.KCAdminExport = { exportReportXLSX };
    const data = sampleData();
    data.alerts = [{ tone: 'critical', title: 'Falha crítica', body: 'Requer atenção' }];

    await audit.exportXLSX(data, createDeps({ data }));

    const report = exportReportXLSX.mock.calls[0][1];
    const alerts = report.sections.find((section) => section.title === 'Alertas');
    expect(alerts.rows).toEqual([
      { tom: 'Crítico', titulo: 'Falha crítica', descricao: 'Requer atenção' }
    ]);
  });

  test('exportação preserva janela móvel do ranking e monetização indisponível', async () => {
    const audit = loadAuditModule();
    const exportReportXLSX = jest.fn().mockResolvedValue(undefined);
    window.KCAdminExport = { exportReportXLSX };
    const data = sampleData();
    data.adOverview = {
      source: 'unavailable',
      settings: { status: null, provider: null, auto_ads_enabled: null },
      campaigns: { total: null, active: null },
      metrics: { impressions: null, clicks: null, ctr: null }
    };
    data.visiblePosts = null;
    data.reportMetrics.open = null;
    data.searchCount = null;
    data.usersNew = null;
    data.savedPostsCount = null;
    data.votesCount = null;
    data.auditAvailable = false;
    data.dailyAvailable = false;
    data.trendsAvailable = false;
    data.dailyMetrics = [];
    data.moduleShareRows = [];
    data.trends = [];
    const rankingContext = {
      period: 'month',
      periodLabel: 'Últimos 30 dias corridos (janela móvel)',
      windowType: 'rolling',
      windowDays: 30,
      module: '',
      expanded: false,
      limit: 10,
      available: false,
      status: 'error',
      reason: 'request_failed'
    };

    await audit.exportXLSX(data, createDeps({ data, rankingContext }));

    const report = exportReportXLSX.mock.calls[0][1];
    const ranking = report.sections.find((section) => section.title === 'Top Contribuidores');
    const monetization = report.sections.find((section) => section.title === 'Monetização');
    const summary = report.sections.find((section) => section.title === 'Resumo executivo');
    const auditSection = report.sections.find((section) => section.title === 'Audit log');
    const pulse = report.sections.find((section) => section.title === 'Pulso operacional');
    const series = report.sections.find((section) => section.title === 'Séries (totais no período)');
    const modules = report.sections.find((section) => section.title === 'Módulos');
    const trends = report.sections.find((section) => section.title === 'Tendências');
    const health = report.sections.find((section) => section.title === 'Saúde/Admin');
    expect(report.filters.ranking_periodo).toBe('Últimos 30 dias corridos (janela móvel)');
    expect(report.filters.ranking_disponibilidade).toBe('Indisponível');
    expect(report.filters.pulso_disponibilidade).toBe('Indisponível');
    expect(report.filters.tendencias_disponibilidade).toBe('Indisponível');
    expect(ranking.note).toContain('Últimos 30 dias corridos (janela móvel)');
    expect(ranking.note).toContain('Ranking indisponível');
    expect(ranking.note).toContain('não representa ausência de contribuidores');
    expect(ranking.rows).toEqual([]);
    expect(ranking.emptyMessage).toContain('Ranking indisponível');
    expect(pulse.rows).toEqual([]);
    expect(pulse.chart).toBeNull();
    expect(pulse.emptyMessage).toContain('Pulso diário indisponível');
    expect(series.rows).toEqual([]);
    expect(series.emptyMessage).toContain('Totais das séries indisponíveis');
    expect(modules.rows).toEqual([]);
    expect(modules.emptyMessage).toContain('Participação por módulo indisponível');
    expect(trends.rows).toEqual([]);
    expect(trends.emptyMessage).toContain('Tendências de busca indisponíveis');
    expect(health.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ indicador: 'Pulso diário', estado: 'Indisponível' }),
      expect.objectContaining({ indicador: 'Tendências', estado: 'Indisponível' }),
      expect.objectContaining({ indicador: 'Ranking', estado: 'Indisponível' })
    ]));
    expect(report.kpis.find((item) => item.label === 'Campanhas ativas').value).toBe('Indisponível');
    expect(report.kpis.find((item) => item.label === 'Cliques em anúncios')).toMatchObject({
      value: 'Indisponível',
      detail: 'CTR indisponível'
    });
    expect(monetization.rows).toEqual(expect.arrayContaining([
      { indicador: 'Status AdSense', valor: 'Indisponível', contexto: 'Indisponível' },
      { indicador: 'Auto ads', valor: 'Indisponível', contexto: 'Recomendado: desativado' },
      { indicador: 'Campanhas totais', valor: 'Indisponível', contexto: 'ad_campaigns' },
      { indicador: 'Impressões', valor: 'Indisponível', contexto: data.periodLabel },
      { indicador: 'Cliques', valor: 'Indisponível', contexto: 'CTR indisponível' }
    ]));
    expect(summary.rows).toEqual(expect.arrayContaining([
      { indicador: 'Publicações visíveis', valor: 'Indisponível', contexto: 'Posts publicados ou encerrados visíveis' },
      { indicador: 'Denúncias abertas', valor: 'Indisponível', contexto: 'Backlog atual, sem recorte temporal' },
      { indicador: 'Eventos no audit log', valor: 'Indisponível', contexto: 'A fonte de auditoria não respondeu' }
    ]));
    expect(report.filters.audit_disponibilidade).toBe('Indisponível');
    expect(auditSection.note).toContain('não representa zero eventos');
    expect(auditSection.emptyMessage).toContain('Audit log indisponível');
  });

  test('exportXLSX gera workbook com todas as abas esperadas', async () => {
    const audit = loadAuditModule();
    const data = sampleData();
    const deps = createDeps({
      data,
      actorCache: {
        '123e4567-e89b-12d3-a456-426614174000': { display_name: 'Mod Eva' }
      }
    });
    const writeFile = jest.fn();
    window.XLSX = {
      utils: {
        book_new() {
          return { sheets: [] };
        },
        aoa_to_sheet(rows) {
          return { rows: rows };
        },
        book_append_sheet(workbook, sheet, name) {
          workbook.sheets.push({ name: name, rows: sheet.rows });
        }
      },
      writeFile: writeFile
    };

    await audit.exportXLSX(data, deps);

    expect(writeFile).toHaveBeenCalledTimes(1);
    const workbook = writeFile.mock.calls[0][0];
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual([
      'Resumo Executivo',
      'Tendências',
      'Pulso diário',
      'Séries',
      'Módulos',
      'Alertas',
      'Audit log'
    ]);
    expect(writeFile.mock.calls[0][1]).toMatch(/^kc-dashboard-30d-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  test('exportPDF gera arquivo com nome canonico', async () => {
    const audit = loadAuditModule();
    const data = sampleData();
    const deps = createDeps({
      data,
      actorCache: {
        '123e4567-e89b-12d3-a456-426614174000': { display_name: 'Mod Eva' }
      }
    });

    class FakeJsPDF {
      constructor() {
        this.pages = 1;
        this.internal = {
          pageSize: {
            getWidth: () => 210,
            getHeight: () => 297
          },
          getNumberOfPages: () => this.pages
        };
      }
      addPage() { this.pages += 1; }
      setFontSize() {}
      setTextColor() {}
      text() {}
      splitTextToSize(text) { return [String(text)]; }
      setDrawColor() {}
      line() {}
      roundedRect() {}
      setFillColor() {}
      setLineWidth() {}
      circle() {}
      setPage() {}
      save(filename) { FakeJsPDF.savedAs = filename; }
    }

    window.jspdf = { jsPDF: FakeJsPDF };

    await audit.exportPDF(data, deps);

    expect(FakeJsPDF.savedAs).toMatch(/^kc-dashboard-30d-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  test('enableExport registra listeners uma unica vez', () => {
    const audit = loadAuditModule();
    const xlsxBtn = createElement({ innerHTML: 'XLSX' });
    const pdfBtn = createElement({ innerHTML: 'PDF' });
    const deps = createDeps({
      data: sampleData(),
      elements: {
        '#admin-export-xlsx': xlsxBtn,
        '#admin-export-pdf': pdfBtn
      }
    });

    audit.enableExport(deps);
    const firstXlsxListener = xlsxBtn.getListener('click');
    const firstPdfListener = pdfBtn.getListener('click');
    audit.enableExport(deps);

    expect(typeof firstXlsxListener).toBe('function');
    expect(typeof firstPdfListener).toBe('function');
    expect(xlsxBtn.getListener('click')).toBe(firstXlsxListener);
    expect(pdfBtn.getListener('click')).toBe(firstPdfListener);
  });

  test('enableExport bloqueia snapshot enquanto o dashboard está atualizando', () => {
    const audit = loadAuditModule();
    const xlsxBtn = createElement({ innerHTML: 'XLSX' });
    const pdfBtn = createElement({ innerHTML: 'PDF' });
    const csvBtn = createElement({ innerHTML: 'CSV' });
    const deps = createDeps({
      data: sampleData(),
      dashboardBusy: true,
      elements: {
        '#admin-export-xlsx': xlsxBtn,
        '#admin-export-pdf': pdfBtn,
        '#admin-audit-export-csv': csvBtn
      }
    });

    audit.enableExport(deps);

    expect(xlsxBtn.disabled).toBe(true);
    expect(pdfBtn.disabled).toBe(true);
    expect(csvBtn.disabled).toBe(true);
  });

  test('enableExport mantém relatórios gerais e bloqueia CSV quando a auditoria está indisponível', () => {
    const audit = loadAuditModule();
    const xlsxBtn = createElement({ innerHTML: 'XLSX' });
    const pdfBtn = createElement({ innerHTML: 'PDF' });
    const csvBtn = createElement({ innerHTML: 'CSV' });
    const data = sampleData();
    data.auditAvailable = false;
    const deps = createDeps({
      data,
      elements: {
        '#admin-export-xlsx': xlsxBtn,
        '#admin-export-pdf': pdfBtn,
        '#admin-audit-export-csv': csvBtn
      }
    });

    audit.enableExport(deps);

    expect(xlsxBtn.disabled).toBe(false);
    expect(pdfBtn.disabled).toBe(false);
    expect(csvBtn.disabled).toBe(true);
  });

  test('relatório compartilhado usa apenas séries visíveis e classificação do servidor', async () => {
    const audit = loadAuditModule();
    const data = sampleData();
    data.dailyMetrics[0].posts_count = 1;
    data.dailyMetrics[0].comments_count = 2;
    data.dailyMetrics[0].total_count = 99;
    data.trends = [{ term: 'termo ambíguo', count: 4, module: 'moradia' }];
    const deps = createDeps({
      data,
      visibleSeriesKeys: ['posts_count', 'comments_count'],
      trendSnapshot: { rows: data.trends, module: 'moradia', query: 'termo' }
    });
    let capturedReport = null;
    window.KCAdminExport = {
      exportReportPDF: jest.fn(async (_filename, report) => {
        capturedReport = report;
      })
    };

    await audit.exportPDF(data, deps);

    const pulse = capturedReport.sections.find((section) => section.title === 'Pulso operacional');
    const trends = capturedReport.sections.find((section) => section.title === 'Tendências');
    expect(pulse.rows[0].total).toBe(3);
    expect(pulse.columns[pulse.columns.length - 1].label).toBe('Total das séries exibidas');
    expect(trends.rows[0].modulo).toBe('Moradia');
    expect(capturedReport.filters.tendencias_busca).toBe('termo');
  });

  test('relatorio compartilhado deixa filtros e tendencias sem classe legiveis', async () => {
    const audit = loadAuditModule();
    const data = sampleData();
    data.trends = [{ term: 'sem classificacao', count: 2, module: null }];
    const deps = createDeps({
      data,
      trendSnapshot: { rows: data.trends, module: '', query: '' }
    });
    let capturedReport = null;
    window.KCAdminExport = {
      exportReportPDF: jest.fn(async (_filename, report) => {
        capturedReport = report;
      })
    };

    await audit.exportPDF(data, deps);

    const trends = capturedReport.sections.find((section) => section.title === 'Tendências');
    expect(trends.rows[0].modulo).toBe('Não classificado');
    expect(capturedReport.filters.audit_action).toBe('Todas as ações');
    expect(capturedReport.filters.audit_entity_type).toBe('Todas as entidades');
    expect(capturedReport.filters.audit_actor).toBe('Todos os atores');
    expect(capturedReport.filters.tendencias_modulo).toBe('Todos os módulos');
    expect(capturedReport.filters.tendencias_busca).toBe('Todos os termos');
    expect(capturedReport.filters.ranking_modulo).toBe('Todos os módulos');
  });

  test('relatório exporta o filtro aplicado, não texto ainda não submetido', async () => {
    const audit = loadAuditModule();
    const data = sampleData();
    data.auditFilters = {
      action: 'post_hidden',
      entityType: 'post',
      actorQuery: 'admin-aplicado'
    };
    const deps = createDeps({
      data,
      elements: {
        '#admin-audit-filter': createElement({ value: 'post_deleted' }),
        '#admin-audit-entity-filter': createElement({ value: 'report' }),
        '#admin-audit-actor-filter': createElement({ value: 'texto-ainda-nao-aplicado' })
      }
    });
    let capturedReport = null;
    window.KCAdminExport = {
      exportReportPDF: jest.fn(async (_filename, report) => {
        capturedReport = report;
      })
    };

    await audit.exportPDF(data, deps);

    expect(capturedReport.filters.audit_action).toBe('post_hidden');
    expect(capturedReport.filters.audit_entity_type).toBe('post');
    expect(capturedReport.filters.audit_actor).toBe('admin-aplicado');
  });

  test('audit payload sensível não é serializado no relatório', async () => {
    const audit = loadAuditModule();
    const data = sampleData();
    data.auditRows[0].payload = {
      access_token: 'segredo',
      nested: { cookie: 'raw', status: 'published' }
    };
    const deps = createDeps({ data });
    let capturedReport = null;
    window.KCAdminExport = {
      exportReportPDF: jest.fn(async (_filename, report) => {
        capturedReport = report;
      })
    };

    await audit.exportPDF(data, deps);

    const auditSection = capturedReport.sections.find((section) => section.title === 'Audit log');
    expect(auditSection.rows[0].detalhes).not.toContain('segredo');
    expect(auditSection.rows[0].detalhes).not.toContain('raw');
    expect(auditSection.rows[0].detalhes).toContain('published');
  });
});

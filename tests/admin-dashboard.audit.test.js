'use strict';

const fs = require('fs');
const path = require('path');

const AUDIT_PATH = path.resolve(__dirname, '../assets/js/controllers/admin-dashboard.audit.js');
const CONTROLLER_PATH = path.resolve(__dirname, '../assets/js/controllers/admin-dashboard.controller.js');
const HTML_PATH = path.resolve(__dirname, '../admin/index.html');

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

  test('expoe exatamente 9 chaves publicas', () => {
    const audit = loadAuditModule();
    expect(Object.keys(audit).sort()).toEqual([
      'enableExport',
      'exportPDF',
      'exportXLSX',
      'filterAudit',
      'getActorDisplay',
      'loadActorsById',
      'loadAuditLog',
      'loadMoreAudit',
      'renderAuditRows'
    ]);
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
  });

  test('removeu o corpo de exportacao/audit do core', () => {
    expect(controllerSource).not.toContain('window.XLSX');
    expect(controllerSource).not.toContain('window.jspdf.jsPDF');
    expect(controllerSource).not.toContain("client.rpc('kc_admin_list_audit_logs'");
    expect(controllerSource).not.toContain("document.createElement('script')");
  });
});

describe('admin/index.html - ordem dos scripts do dashboard admin', () => {
  test('carrega shared -> metrics -> audit -> charts -> kc-ranking -> controller', () => {
    const orderedScripts = [
      '<script defer src="../assets/js/controllers/admin-dashboard.shared.js"></script>',
      '<script defer src="../assets/js/controllers/admin-dashboard.metrics.js"></script>',
      '<script defer src="../assets/js/controllers/admin-dashboard.audit.js"></script>',
      '<script defer src="../assets/js/controllers/admin-dashboard.charts.js"></script>',
      '<script defer src="../assets/js/kc-ranking.js"></script>',
      '<script defer src="../assets/js/controllers/admin-dashboard.controller.js?v=8.6.0"></script>'
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
      'Resumo',
      'Tendências',
      'Pulso diário',
      'Séries',
      'Top módulos',
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
});

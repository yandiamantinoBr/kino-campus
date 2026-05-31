(function () {
  'use strict';

  /* Armazena os dados carregados para uso no export */
  let _data = null;
  let _auditOffset = 0;
  let _chartModalReturnFocus = null;
  var _adminRankingExpanded = false;
  var AUDIT_PAGE_SIZE = 20;
  var _exportBound = false;
  var _auditControlsBound = false;
  var _periodRefreshTimer = null;
  var _activeRefreshController = null;
  var _refreshRequestSeq = 0;
  var _rankingRequestSeq = 0;
  var _statusToastTimer = null;
  var _xlsxLoadPromise = null;
  var _jspdfLoadPromise = null;
  var PERIOD_CHANGE_DEBOUNCE_MS = 300;
  var SCRIPT_LOAD_TIMEOUT_MS = 8000;

  /* ── Cache de atores (actor_id → display info) ── */
  var _actorsById = {};
  var DashboardUtils = window.KCAdminDashboardUtils || {};
  window._KCAD = window._KCAD || {};
  window._KCAD.metrics = window._KCAD.metrics || {};
  window._KCAD.audit = window._KCAD.audit || {};
  window._KCAD.charts = window._KCAD.charts || {};
  var SERIES_META = [
    { key: 'posts_count', label: 'Posts', color: '#ff6b00', icon: 'fas fa-layer-group' },
    { key: 'comments_count', label: 'Comentários', color: '#0ea5e9', icon: 'fas fa-comment' },
    { key: 'searches_count', label: 'Buscas', color: '#8b5cf6', icon: 'fas fa-magnifying-glass' },
    { key: 'votes_count', label: 'Votos', color: '#10b981', icon: 'fas fa-thumbs-up' },
    { key: 'admin_actions_count', label: 'Ações admin', color: '#f97316', icon: 'fas fa-shield-halved' }
  ];
  function $(sel, root) { return (root || document).querySelector(sel); }

  function getClient() {
    if (window.KCSupabase && typeof window.KCSupabase.getClient === 'function') return window.KCSupabase.getClient();
    return null;
  }

  function toNumber(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getSeriesKeys() {
    if (Array.isArray(DashboardUtils.SERIES_KEYS) && DashboardUtils.SERIES_KEYS.length) {
      return DashboardUtils.SERIES_KEYS;
    }
    return SERIES_META.map(function (series) { return series.key; });
  }

  function getModuleLabel(moduleKey) {
    var labels = DashboardUtils.MODULE_LABELS || {};
    return labels[moduleKey] || moduleKey || '';
  }

  function getModuleIcon(moduleKey) {
    var icons = DashboardUtils.MODULE_ICONS || {};
    return icons[moduleKey] || 'fas fa-tag';
  }

  function buildAuditDeps() {
    return {
      $: $,
      escHtmlAdmin: escHtmlAdmin,
      showError: showError,
      showStatusToast: showStatusToast,
      hideStatusToast: hideStatusToast,
      toNumber: toNumber,
      formatDateBR: formatDateBR,
      formatDateTimeBR: formatDateTimeBR,
      getPeriodLabel: getPeriodLabel,
      getPeriodRange: getPeriodRange,
      getSelectedPeriodDays: getSelectedPeriodDays,
      getModuleLabel: getModuleLabel,
      classifyTermToModule: classifyTermToModule,
      getSeriesKeys: getSeriesKeys,
      getSeriesTotals: getSeriesTotals,
      getSeriesMeta: function () { return SERIES_META.slice(); },
      hexToRgb: hexToRgb,
      getClient: getClient,
      getAuditPageSize: function () { return AUDIT_PAGE_SIZE; },
      getScriptLoadTimeoutMs: function () { return SCRIPT_LOAD_TIMEOUT_MS; },
      getData: function () { return _data; },
      setData: function (nextData) { _data = nextData; },
      getAuditOffset: function () { return _auditOffset; },
      setAuditOffset: function (nextOffset) { _auditOffset = Number(nextOffset) || 0; },
      getExportBound: function () { return _exportBound; },
      setExportBound: function (nextValue) { _exportBound = !!nextValue; },
      getAuditControlsBound: function () { return _auditControlsBound; },
      setAuditControlsBound: function (nextValue) { _auditControlsBound = !!nextValue; },
      getXlsxLoadPromise: function () { return _xlsxLoadPromise; },
      setXlsxLoadPromise: function (promise) { _xlsxLoadPromise = promise || null; },
      getJspdfLoadPromise: function () { return _jspdfLoadPromise; },
      setJspdfLoadPromise: function (promise) { _jspdfLoadPromise = promise || null; },
      getActorCache: function () { return _actorsById; }
    };
  }

  function buildChartsDeps() {
    return {
      $: $,
      escHtmlAdmin: escHtmlAdmin,
      toNumber: toNumber,
      getData: function () { return _data; },
      setData: function (nextData) { _data = nextData; },
      getSelectedPeriodDays: getSelectedPeriodDays,
      getPeriodLabel: getPeriodLabel,
      getModuleLabel: getModuleLabel,
      getModuleIcon: getModuleIcon,
      classifyTermToModule: classifyTermToModule,
      getSeriesKeys: getSeriesKeys,
      getSeriesMeta: function () { return SERIES_META.slice(); },
      getChartModalReturnFocus: function () { return _chartModalReturnFocus; },
      setChartModalReturnFocus: function (nextValue) { _chartModalReturnFocus = nextValue || null; },
      getRankingExpanded: function () { return _adminRankingExpanded; },
      setRankingExpanded: function (nextValue) { _adminRankingExpanded = !!nextValue; },
      getRankingRequestSeq: function () { return _rankingRequestSeq; },
      setRankingRequestSeq: function (nextValue) { _rankingRequestSeq = Number(nextValue) || 0; },
      showStatusToast: showStatusToast
    };
  }

  function stabilizeHeaderActions() {
    var userActions = document.querySelector('.kc-header--admin .kc-user-actions');
    if (userActions) {
      userActions.style.visibility = 'visible';
      userActions.style.opacity = '1';
      userActions.style.pointerEvents = 'auto';
    }

    var themeToggle = document.querySelector('.kc-header--admin .theme-toggle');
    if (themeToggle) {
      themeToggle.style.visibility = 'visible';
      themeToggle.style.opacity = '1';
      themeToggle.disabled = false;
    }

    var loginBtn = document.querySelector('.kc-header--admin .btn-login');
    if (loginBtn) {
      loginBtn.style.visibility = 'visible';
      loginBtn.style.opacity = '1';
      loginBtn.style.pointerEvents = 'auto';
    }

    if (window.KCAdminShell && typeof window.KCAdminShell.syncHeader === 'function') {
      window.KCAdminShell.syncHeader();
    }
  }

  function showError(message) {
    const el = $('#admin-error');
    if (!el) return;
    el.textContent = String(message || 'Falha ao carregar dashboard.');
    el.style.display = 'block';
  }

  function clearError() {
    const el = $('#admin-error');
    if (!el) return;
    el.textContent = '';
    el.style.display = 'none';
  }

  function ensureStatusToast() {
    var el = document.getElementById('admin-dashboard-toast');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'admin-dashboard-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.position = 'fixed';
    el.style.right = '16px';
    el.style.bottom = '16px';
    el.style.zIndex = '10020';
    el.style.maxWidth = '320px';
    el.style.padding = '12px 14px';
    el.style.borderRadius = '12px';
    el.style.background = 'rgba(17,24,39,.94)';
    el.style.color = '#fff';
    el.style.boxShadow = '0 18px 50px rgba(15,23,42,.28)';
    el.style.fontSize = '.9rem';
    el.style.lineHeight = '1.4';
    el.style.display = 'none';
    document.body.appendChild(el);
    return el;
  }

  function hideStatusToast() {
    if (_statusToastTimer) {
      clearTimeout(_statusToastTimer);
      _statusToastTimer = null;
    }
    var el = document.getElementById('admin-dashboard-toast');
    if (!el) return;
    el.style.display = 'none';
    el.textContent = '';
  }

  function showStatusToast(message, tone, opts) {
    opts = opts || {};
    var el = ensureStatusToast();
    if (!el) return;
    if (_statusToastTimer) {
      clearTimeout(_statusToastTimer);
      _statusToastTimer = null;
    }
    el.textContent = String(message || '');
    el.style.display = 'block';
    el.style.background = tone === 'error'
      ? 'rgba(127,29,29,.96)'
      : tone === 'success'
        ? 'rgba(20,83,45,.96)'
        : 'rgba(17,24,39,.94)';
    if (!opts.sticky) {
      _statusToastTimer = setTimeout(hideStatusToast, opts.duration || 3200);
    }
  }

  function createAbortError() {
    var error = new Error('Dashboard refresh aborted.');
    error.name = 'AbortError';
    return error;
  }

  function throwIfAborted(signal) {
    if (signal && signal.aborted) throw createAbortError();
  }

  function setLoading(isLoading) {
    const loading = $('#admin-loading');
    if (loading) loading.style.display = isLoading ? 'flex' : 'none';
  }

  // Spinner no botão Atualizar durante refresh
  var _refreshOrigHtml = null;
  function setRefreshLoading(isLoading) {
    var btn = $('#admin-refresh-btn');
    if (!btn) return;
    if (isLoading) {
      _refreshOrigHtml = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Atualizando...';
      btn.classList.add('is-loading');
    } else {
      if (_refreshOrigHtml) btn.innerHTML = _refreshOrigHtml;
      btn.classList.remove('is-loading');
    }
  }

  // Marca/desmarca grids de métrica em estado de loading
  var GRID_IDS = ['admin-executive-metrics', 'admin-metrics', 'admin-activity-metrics', 'admin-community-metrics'];
  function setGridsLoading(isLoading) {
    GRID_IDS.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.classList.toggle('is-loading', isLoading);
    });
  }

  function setLastSync() {
    const el = $('#admin-last-sync');
    if (!el) return;
    el.innerHTML = '<i class="fas fa-circle-check" style="color:var(--kc-primary-brand);margin-right:5px;" aria-hidden="true"></i>'
      + 'Atualizado em ' + new Date().toLocaleString('pt-BR')
      + ' &nbsp;<span style="opacity:.6;font-size:.78rem;">- clique para atualizar</span>';
  }

  function checkAccess() {
    return (window._KCAD && window._KCAD.metrics && typeof window._KCAD.metrics.checkAccess === 'function')
      ? window._KCAD.metrics.checkAccess()
      : Promise.resolve({ ok: false, message: 'Modulo de metrics do dashboard indisponivel.' });
  }
  function formatMetricValue(value) {
    if (value === null || typeof value === 'undefined' || value === '') return '--';
    var parsed = Number(value);
    if (Number.isFinite(parsed) && String(value).trim() !== '') {
      return parsed.toLocaleString('pt-BR');
    }
    return String(value);
  }

  function metricCard(icon, label, value, opts) {
    opts = opts || {};
    var href = opts.href || null;
    var highlight = opts.highlight && Number(value || 0) > 0;
    var subtitle = opts.subtitle || null;
    var cardStyle = highlight ? ' style="border-color:rgba(255,107,0,.5);"' : '';
    var titleAttr = opts.tooltip ? ' title="' + escHtmlAdmin(opts.tooltip) + '"' : '';
    var valueLine = '<strong>' + escHtmlAdmin(formatMetricValue(value)) + '</strong>';
    if (opts.delta && opts.delta.text) {
      var deltaColor = opts.delta.dir === 'up' ? '#16a34a' : (opts.delta.dir === 'down' ? '#dc2626' : 'var(--kc-text-dark-secondary)');
      var deltaArrow = opts.delta.dir === 'up' ? '&uarr;' : (opts.delta.dir === 'down' ? '&darr;' : '&rarr;');
      valueLine += ' <span style="font-size:.72rem;font-weight:600;margin-left:6px;color:' + deltaColor + ';" title="Variação vs período anterior">' + deltaArrow + ' ' + escHtmlAdmin(opts.delta.text) + '</span>';
    }
    var inner = '<div class="kc-admin-card__label" title="' + escHtmlAdmin(label) + '">'
      + '<i class="' + icon + '"></i> ' + escHtmlAdmin(label) + '</div>'
      + valueLine;
    if (subtitle) {
      inner += '<div style="font-size:.75rem;color:var(--kc-text-dark-secondary);margin-top:4px;">' + escHtmlAdmin(subtitle) + '</div>';
    }
    if (href) {
      inner += '<div style="margin-top:8px;"><a href="' + escHtmlAdmin(href) + '" style="font-size:.78rem;color:var(--kc-primary-brand);text-decoration:none;">Ver detalhes &rarr;</a></div>';
    }
    return '<article class="kc-admin-card"' + cardStyle + titleAttr + '>' + inner + '</article>';
  }

  // Variação percentual de um KPI vs a janela imediatamente anterior.
  function computeDelta(current, previous) {
    var cur = Number(current) || 0;
    var prev = Number(previous) || 0;
    if (prev <= 0) return null;
    var pct = Math.round(((cur - prev) / prev) * 100);
    if (pct === 0) return { text: '0%', dir: 'flat' };
    return { text: (pct > 0 ? '+' : '') + pct + '%', dir: pct > 0 ? 'up' : 'down' };
  }

  // Skeleton (estado de carregamento) — substitui o texto "Carregando…".
  function skeletonCards(n) {
    var card = '<article class="kc-admin-card kc-skeleton-card" aria-hidden="true">'
      + '<div class="kc-skeleton" style="width:55%;height:10px;"></div>'
      + '<div class="kc-skeleton" style="width:45%;height:26px;"></div>'
      + '<div class="kc-skeleton" style="width:70%;height:10px;"></div>'
      + '</article>';
    var out = '';
    for (var i = 0; i < (Number(n) || 3); i += 1) out += card;
    return out;
  }

  function showDashboardSkeletons() {
    var grids = [
      ['#admin-executive-metrics', 4], ['#admin-metrics', 4], ['#admin-activity-metrics', 4],
      ['#admin-community-metrics', 3], ['#admin-privacy-metrics', 4]
    ];
    grids.forEach(function (pair) {
      var el = $(pair[0]);
      if (el && el.children.length === 0) el.innerHTML = skeletonCards(pair[1]);
    });
  }

  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  }

  // ── Período selecionado ────────────────────────────────────────────────────
  function getSelectedPeriodDays() {
    var el = $('#admin-period-filter');
    return el ? parseInt(el.value, 10) || 30 : 30;
  }

  var PERIOD_LABELS = {
    1: 'hoje',
    7: 'esta semana',
    30: 'últimos 30 dias',
    90: 'últimos 90 dias',
    365: 'este ano',
  };

  function getPeriodLabel(days) {
    return PERIOD_LABELS[days] || ('últimos ' + days + ' dias');
  }

  function getPeriodShortLabel(days) {
    if (days === 1) return 'hoje';
    if (days === 7) return '7d';
    if (days === 365) return 'ano';
    return days + 'd';
  }

  function updateTitles(days) {
    var fullLabel = getPeriodLabel(days);
    var titles = [
      ['#admin-executive-title', '<i class="fas fa-gauge-high" aria-hidden="true"></i> Resumo agora (' + fullLabel + ')'],
      ['#admin-moderation-title', '<i class="fas fa-shield-halved" aria-hidden="true"></i> Moderação (' + fullLabel + ')'],
      ['#admin-activity-title', '<i class="fas fa-chart-bar" aria-hidden="true"></i> Atividade da plataforma (' + fullLabel + ')'],
      ['#admin-community-title', '<i class="fas fa-users" aria-hidden="true"></i> Comunidade (' + fullLabel + ')'],
      ['#admin-trends-title', '<i class="fas fa-magnifying-glass-chart" aria-hidden="true"></i> Tendências de busca (' + fullLabel + ')'],
      ['#admin-audit-title', '<i class="fas fa-clock-rotate-left" aria-hidden="true"></i> Audit log (' + fullLabel + ')'],
      ['#admin-activity-pulse-title', '<i class="fas fa-wave-square" aria-hidden="true"></i> Pulso diário (' + fullLabel + ')'],
      ['#admin-module-share-title', '<i class="fas fa-table-cells" aria-hidden="true"></i> Top módulos (' + fullLabel + ')']
    ];

    titles.forEach(function (entry) {
      var el = $(entry[0]);
      if (el) el.innerHTML = entry[1];
    });
  }

  function getPeriodRange(periodDays) {
    return {
      since: daysAgo(periodDays),
      until: new Date().toISOString(),
      label: getPeriodLabel(periodDays)
    };
  }

  function formatDateTimeBR(value) {
    if (!value) return '-';
    var date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('pt-BR');
  }

  function formatDateBR(value) {
    if (!value) return '-';
    var date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('pt-BR');
  }

  function hexToRgb(hex) {
    var value = String(hex || '').replace('#', '');
    if (value.length === 3) {
      value = value.split('').map(function (part) { return part + part; }).join('');
    }
    if (!/^[0-9a-f]{6}$/i.test(value)) return { r: 15, g: 23, b: 42 };
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16)
    };
  }

  function buildExportFilename(extension, periodDays) {
    var stamp = new Date().toISOString().slice(0, 10);
    return 'kc-dashboard-' + (periodDays || 30) + 'd-' + stamp + '.' + extension;
  }

  // ── Normalização e agrupamento de termos de busca ─────────────────────────

  // Delegação canônica para o submódulo de metrics/shared.
  function classifyTermToModule(term) {
    return (window._KCAD && window._KCAD.metrics && typeof window._KCAD.metrics.classifyTermToModule === 'function')
      ? window._KCAD.metrics.classifyTermToModule(term)
      : (DashboardUtils.classifyTermToModule ? DashboardUtils.classifyTermToModule(term, window.KC_CONSTANTS || {}) : null);
  }

  function loadReportMetrics(client, since) {
    return (window._KCAD && window._KCAD.metrics && typeof window._KCAD.metrics.loadReportMetrics === 'function')
      ? window._KCAD.metrics.loadReportMetrics(client, since)
      : Promise.resolve({ open: 0, total: 0 });
  }

  function loadPostStatusMetrics(client, since) {
    return (window._KCAD && window._KCAD.metrics && typeof window._KCAD.metrics.loadPostStatusMetrics === 'function')
      ? window._KCAD.metrics.loadPostStatusMetrics(client, since)
      : Promise.resolve({ hidden: 0, deleted: 0 });
  }

  function loadPostsCreated(client, since) {
    return (window._KCAD && window._KCAD.metrics && typeof window._KCAD.metrics.loadPostsCreated === 'function')
      ? window._KCAD.metrics.loadPostsCreated(client, since)
      : Promise.resolve(0);
  }

  function loadPostsEdited(client, since) {
    return (window._KCAD && window._KCAD.metrics && typeof window._KCAD.metrics.loadPostsEdited === 'function')
      ? window._KCAD.metrics.loadPostsEdited(client, since)
      : Promise.resolve(0);
  }

  function loadCommentsCount(client, since) {
    return (window._KCAD && window._KCAD.metrics && typeof window._KCAD.metrics.loadCommentsCount === 'function')
      ? window._KCAD.metrics.loadCommentsCount(client, since)
      : Promise.resolve(0);
  }

  function loadSearchCount(client, since) {
    return (window._KCAD && window._KCAD.metrics && typeof window._KCAD.metrics.loadSearchCount === 'function')
      ? window._KCAD.metrics.loadSearchCount(client, since)
      : Promise.resolve(0);
  }

  function loadPostsTotal(client) {
    return (window._KCAD && window._KCAD.metrics && typeof window._KCAD.metrics.loadPostsTotal === 'function')
      ? window._KCAD.metrics.loadPostsTotal(client)
      : Promise.resolve(0);
  }

  function loadVisiblePostsCount(client) {
    return (window._KCAD && window._KCAD.metrics && typeof window._KCAD.metrics.loadVisiblePostsCount === 'function')
      ? window._KCAD.metrics.loadVisiblePostsCount(client)
      : Promise.resolve(0);
  }

  function loadUsersTotal(client) {
    return (window._KCAD && window._KCAD.metrics && typeof window._KCAD.metrics.loadUsersTotal === 'function')
      ? window._KCAD.metrics.loadUsersTotal(client)
      : Promise.resolve(0);
  }

  function loadUsersNew(client, since) {
    return (window._KCAD && window._KCAD.metrics && typeof window._KCAD.metrics.loadUsersNew === 'function')
      ? window._KCAD.metrics.loadUsersNew(client, since)
      : Promise.resolve(0);
  }

  function loadVotesCount(client, since) {
    return (window._KCAD && window._KCAD.metrics && typeof window._KCAD.metrics.loadVotesCount === 'function')
      ? window._KCAD.metrics.loadVotesCount(client, since)
      : Promise.resolve(0);
  }

  function loadSavedPostsCount(client, since) {
    return (window._KCAD && window._KCAD.metrics && typeof window._KCAD.metrics.loadSavedPostsCount === 'function')
      ? window._KCAD.metrics.loadSavedPostsCount(client, since)
      : Promise.resolve(0);
  }

  function loadActiveSessions15m(client) {
    return (window._KCAD && window._KCAD.metrics && typeof window._KCAD.metrics.loadActiveSessions15m === 'function')
      ? window._KCAD.metrics.loadActiveSessions15m(client)
      : Promise.resolve({ value: null, available: false, source: 'unavailable', label: 'Indisponivel', note: 'Modulo de metricas indisponivel.' });
  }

  function loadSearchTrendsData(client, since) {
    return (window._KCAD && window._KCAD.metrics && typeof window._KCAD.metrics.loadSearchTrendsData === 'function')
      ? window._KCAD.metrics.loadSearchTrendsData(client, since)
      : Promise.resolve([]);
  }

  function loadDailyMetrics(client, since, signal) {
    return (window._KCAD && window._KCAD.metrics && typeof window._KCAD.metrics.loadDailyMetrics === 'function')
      ? window._KCAD.metrics.loadDailyMetrics(client, since, signal)
      : Promise.resolve([]);
  }

  async function loadActorsById(client, actorIds) {
    return (window._KCAD && window._KCAD.audit && typeof window._KCAD.audit.loadActorsById === 'function')
      ? window._KCAD.audit.loadActorsById(client, actorIds, buildAuditDeps())
      : Promise.resolve();
  }

  function getActorDisplay(actorId) {
    return (window._KCAD && window._KCAD.audit && typeof window._KCAD.audit.getActorDisplay === 'function')
      ? window._KCAD.audit.getActorDisplay(actorId, buildAuditDeps())
      : (!actorId ? 'system' : String(actorId).slice(0, 8) + '...');
  }

  async function loadAuditLog(client, limit, offset, actionFilter, since) {
    return (window._KCAD && window._KCAD.audit && typeof window._KCAD.audit.loadAuditLog === 'function')
      ? window._KCAD.audit.loadAuditLog(client, limit, offset, actionFilter, since, buildAuditDeps())
      : [];
  }

  function readAuditFilters() {
    return (window._KCAD && window._KCAD.audit && typeof window._KCAD.audit.readAuditFilters === 'function')
      ? window._KCAD.audit.readAuditFilters(buildAuditDeps())
      : 'all';
  }

  function renderSearchTrends(trends, periodDays) {
    if (window._KCAD && window._KCAD.charts && typeof window._KCAD.charts.renderSearchTrends === 'function') {
      window._KCAD.charts.renderSearchTrends(trends, periodDays, buildChartsDeps());
    }
  }

  function renderDailyActivitySummary(summary) {
    if (window._KCAD && window._KCAD.charts && typeof window._KCAD.charts.renderDailyActivitySummary === 'function') {
      window._KCAD.charts.renderDailyActivitySummary(summary, buildChartsDeps());
    }
  }

  function getSeriesTotals(series) {
    var totals = {};
    SERIES_META.forEach(function (meta) {
      totals[meta.key] = (series || []).reduce(function (sum, row) {
        return sum + toNumber(row && row[meta.key]);
      }, 0);
    });
    return totals;
  }

  function bindDailyActivityChartModal() {
    if (window._KCAD && window._KCAD.charts && typeof window._KCAD.charts.bindDailyActivityChartModal === 'function') {
      window._KCAD.charts.bindDailyActivityChartModal(buildChartsDeps());
    }
  }

  function renderDailyActivityChart(series) {
    if (window._KCAD && window._KCAD.charts && typeof window._KCAD.charts.renderDailyActivityChart === 'function') {
      window._KCAD.charts.renderDailyActivityChart(series, buildChartsDeps());
    }
  }

  function renderModuleShareTable(rows) {
    if (window._KCAD && window._KCAD.charts && typeof window._KCAD.charts.renderModuleShareTable === 'function') {
      window._KCAD.charts.renderModuleShareTable(rows, buildChartsDeps());
    }
  }

  function renderOperationalAlerts(alerts) {
    if (window._KCAD && window._KCAD.charts && typeof window._KCAD.charts.renderOperationalAlerts === 'function') {
      window._KCAD.charts.renderOperationalAlerts(alerts, buildChartsDeps());
    }
  }

  function renderAuditRows(rows, append) {
    if (window._KCAD && window._KCAD.audit && typeof window._KCAD.audit.renderAuditRows === 'function') {
      window._KCAD.audit.renderAuditRows(rows, append, buildAuditDeps());
    }
  }

  function enableExport() {
    if (window._KCAD && window._KCAD.audit && typeof window._KCAD.audit.enableExport === 'function') {
      window._KCAD.audit.enableExport(buildAuditDeps());
    }
  }

  function bindAuditControls() {
    if (window._KCAD && window._KCAD.audit && typeof window._KCAD.audit.bindAuditControls === 'function') {
      window._KCAD.audit.bindAuditControls(buildAuditDeps());
    }
  }

  function escHtmlAdmin(str) {
    return window.KCUtils.escapeHtml(String(str == null ? '' : str));
  }

  async function loadMetrics(options) {
    options = options || {};
    var signal = options.signal || null;
    const client = getClient();
    throwIfAborted(signal);
    if (!client) { showError('Supabase client não disponível.'); return; }

    var periodDays = getSelectedPeriodDays();
    var periodRange = getPeriodRange(periodDays);
    var since = periodRange.since;
    var shortLabel = getPeriodShortLabel(periodDays);
    var fullLabel  = periodRange.label;

    // Atualiza títulos das seções com o período selecionado
    var activityTitle = $('#admin-activity-title');
    if (activityTitle) {
      activityTitle.innerHTML = '<i class="fas fa-chart-bar" aria-hidden="true"></i> Atividade da plataforma (' + fullLabel + ')';
    }
    var moderationTitle = $('#admin-moderation-title');
    if (moderationTitle) {
      moderationTitle.innerHTML = '<i class="fas fa-shield-halved" aria-hidden="true"></i> Moderação (' + fullLabel + ')';
    }
    var communityTitle = $('#admin-community-title');
    if (communityTitle) {
      communityTitle.innerHTML = '<i class="fas fa-users" aria-hidden="true"></i> Comunidade (' + fullLabel + ')';
    }
    var trendsTitle = $('#admin-trends-title');
    if (trendsTitle) {
      trendsTitle.innerHTML = '<i class="fas fa-magnifying-glass-chart" aria-hidden="true"></i> Tendências de busca (' + fullLabel + ')';
    }
    var auditTitle = $('#admin-audit-title');
    if (auditTitle) {
      auditTitle.innerHTML = '<i class="fas fa-clock-rotate-left" aria-hidden="true"></i> Audit log (' + fullLabel + ')';
    }

    // Carrega todas as métricas em paralelo para melhor performance
    stabilizeHeaderActions();
    updateTitles(periodDays);
    showDashboardSkeletons();

    // Caminho preferido: 1 RPC agregada (kc_admin_dashboard_overview) substitui
    // ~19 consultas. Fallback defensivo: loaders individuais (se a RPC faltar/falhar).
    var until = (periodRange && periodRange.until) || new Date().toISOString();
    var prevSince = daysAgo(periodDays * 2);

    function prevWindowCount(table) {
      return client.from(table)
        .select('id', { count: 'exact', head: true })
        .gte('created_at', prevSince)
        .lt('created_at', since)
        .then(function (r) { return (r && !r.error && typeof r.count === 'number') ? r.count : 0; })
        .catch(function () { return 0; });
    }

    var reportMetrics, postStatusMetrics, postsCreated, postsEdited, commentsCount,
      searchCount, postsTotal, visiblePosts, usersTotal, usersNew, votesCount,
      savedPostsCount, activeSessions15m, auditRows, trends, dailyMetrics;
    var deltaUsersNew = null, deltaPostsCreated = null, deltaEngagement = null;

    var overview = null;
    try {
      var ovResp = await client.rpc('kc_admin_dashboard_overview', {
        p_since: since, p_until: until, p_prev_since: prevSince
      });
      if (ovResp && !ovResp.error && ovResp.data && ovResp.data.ok !== false) overview = ovResp.data;
    } catch (_) { overview = null; }
    throwIfAborted(signal);

    if (overview) {
      var ovReports = overview.reports || {};
      var ovPosts = overview.posts || {};
      var ovEng = overview.engagement || {};
      var ovUsers = overview.users || {};
      reportMetrics = { open: Number(ovReports.open) || 0, total: Number(ovReports.total) || 0 };
      postStatusMetrics = { hidden: Number(ovPosts.hidden) || 0, deleted: Number(ovPosts.deleted) || 0 };
      postsCreated = Number(ovPosts.created) || 0;
      postsEdited = Number(ovPosts.edited) || 0;
      postsTotal = Number(ovPosts.total) || 0;
      visiblePosts = Number(ovPosts.visible) || 0;
      commentsCount = Number(ovEng.comments) || 0;
      votesCount = Number(ovEng.votes) || 0;
      savedPostsCount = Number(ovEng.saves) || 0;
      searchCount = Number((overview.privacy || {}).searches) || 0;
      usersTotal = Number(ovUsers.total) || 0;
      usersNew = Number(ovUsers.new) || 0;
      activeSessions15m = {
        value: Number(overview.active_15m) || 0,
        available: true,
        source: 'overview_rpc',
        label: 'RPC',
        note: 'Sessões distintas nos últimos 15 min (RPC agregada).'
      };
      deltaUsersNew = computeDelta(usersNew, Number(ovUsers.prev_new) || 0);
      deltaPostsCreated = computeDelta(postsCreated, Number(ovPosts.prev_created) || 0);
      deltaEngagement = computeDelta(
        votesCount + savedPostsCount + commentsCount,
        (Number(ovEng.prev_votes) || 0) + (Number(ovEng.prev_saves) || 0) + (Number(ovEng.prev_comments) || 0)
      );

      var ovRest = await Promise.all([
        loadAuditLog(client, AUDIT_PAGE_SIZE, 0, readAuditFilters(), since),
        loadSearchTrendsData(client, since),
        loadDailyMetrics(client, since, signal),
      ]);
      auditRows = ovRest[0];
      trends = ovRest[1];
      dailyMetrics = ovRest[2];
    } else {
      var full = await Promise.all([
        loadReportMetrics(client, since),
        loadPostStatusMetrics(client, since),
        loadPostsCreated(client, since),
        loadPostsEdited(client, since),
        loadCommentsCount(client, since),
        loadSearchCount(client, since),
        loadPostsTotal(client),
        loadVisiblePostsCount(client),
        loadUsersTotal(client),
        loadUsersNew(client, since),
        loadVotesCount(client, since),
        loadSavedPostsCount(client, since),
        loadActiveSessions15m(client),
        loadAuditLog(client, AUDIT_PAGE_SIZE, 0, readAuditFilters(), since),
        loadSearchTrendsData(client, since),
        loadDailyMetrics(client, since, signal),
      ]);
      reportMetrics = full[0]; postStatusMetrics = full[1]; postsCreated = full[2]; postsEdited = full[3];
      commentsCount = full[4]; searchCount = full[5]; postsTotal = full[6]; visiblePosts = full[7];
      usersTotal = full[8]; usersNew = full[9]; votesCount = full[10]; savedPostsCount = full[11];
      activeSessions15m = full[12]; auditRows = full[13]; trends = full[14]; dailyMetrics = full[15];

      var prevCounts = await Promise.all([
        prevWindowCount('profiles'), prevWindowCount('posts'), prevWindowCount('comments'),
        prevWindowCount('post_votes'), prevWindowCount('saved_posts'),
      ]);
      deltaUsersNew = computeDelta(usersNew, prevCounts[0]);
      deltaPostsCreated = computeDelta(postsCreated, prevCounts[1]);
      deltaEngagement = computeDelta(
        (Number(votesCount) || 0) + (Number(savedPostsCount) || 0) + (Number(commentsCount) || 0),
        (Number(prevCounts[2]) || 0) + (Number(prevCounts[3]) || 0) + (Number(prevCounts[4]) || 0)
      );
    }
    throwIfAborted(signal);

    _auditOffset = auditRows.length;

    // ── Resolve nomes dos atores do audit log ──
    await loadActorsById(client, auditRows.map(r => r.actor_id));
    throwIfAborted(signal);

    var moduleShareRows = DashboardUtils.buildModuleShareRows
      ? DashboardUtils.buildModuleShareRows(trends, window.KC_CONSTANTS || {})
      : [];
    var dailySummary = DashboardUtils.buildActivityPulseSummary
      ? DashboardUtils.buildActivityPulseSummary(dailyMetrics)
      : null;
    var alerts = DashboardUtils.buildOperationalAlerts
      ? DashboardUtils.buildOperationalAlerts({
          openReports: reportMetrics.open,
          hiddenPosts: postStatusMetrics.hidden,
          deletedPosts: postStatusMetrics.deleted,
          searches: searchCount,
          auditEvents: auditRows.length,
          peakTotal: dailySummary ? dailySummary.peakTotal : 0
        })
      : [];

    // ── Renderiza resumo executivo ──
    var activeMetric = activeSessions15m || {};
    var healthValue = activeMetric.available
      ? (activeMetric.source === 'privacy_rpc' ? 'OK' : 'Fallback')
      : 'Atenção';
    var healthSubtitle = activeMetric.available
      ? (activeMetric.note || 'Coleta agregada operacional.')
      : (activeMetric.note || 'Coleta agregada indisponível.');
    var executiveMetrics = $('#admin-executive-metrics');
    if (executiveMetrics) {
      executiveMetrics.innerHTML = [
        metricCard('fas fa-users-viewfinder', 'Ativos agora', activeMetric.available ? activeMetric.value : '--', { subtitle: activeMetric.available ? 'Sessões agregadas nos últimos 15min' : 'Sem dado agregado agora', href: 'privacy-analytics.html', tooltip: 'Sessões anônimas distintas com atividade nos últimos 15 minutos (não identifica usuários).' }),
        metricCard('fas fa-eye', 'Publicações visíveis', visiblePosts, { subtitle: 'Published + closed no feed público' }),
        metricCard('fas fa-flag', 'Denúncias abertas', reportMetrics.open, { href: 'reports.html', highlight: true, subtitle: 'Prioridade operacional' }),
        metricCard('fas fa-stethoscope', 'Saúde da coleta', healthValue, { subtitle: healthSubtitle, href: 'privacy-analytics.html' }),
      ].join('');
    }

    // ── Renderiza métricas de moderação ──
    throwIfAborted(signal);
    const metrics = $('#admin-metrics');
    if (metrics) {
      metrics.innerHTML = [
        metricCard('fas fa-flag',      'Denúncias abertas',  reportMetrics.open,          { href: 'reports.html', highlight: true, subtitle: fullLabel }),
        metricCard('fas fa-list',      'Total de denúncias', reportMetrics.total,         { href: 'reports.html', subtitle: fullLabel }),
        metricCard('fas fa-eye-slash', 'Posts ocultados',    postStatusMetrics.hidden,    { href: 'moderation.html', subtitle: fullLabel }),
        metricCard('fas fa-trash',     'Posts deletados',    postStatusMetrics.deleted,   { href: 'moderation.html', subtitle: fullLabel }),
      ].join('');
    }

    // ── Renderiza métricas de atividade ──
    const activityMetrics = $('#admin-activity-metrics');
    if (activityMetrics) {
      activityMetrics.innerHTML = [
        metricCard('fas fa-layer-group',      'Total de posts',    postsTotal),
        metricCard('fas fa-eye',              'Posts visíveis',    visiblePosts),
        metricCard('fas fa-plus-circle',      'Posts publicados',  postsCreated, { delta: deltaPostsCreated }),
        metricCard('fas fa-pen-to-square',    'Posts editados',    postsEdited),
        metricCard('fas fa-comment',          'Comentários',       commentsCount),
        metricCard('fas fa-magnifying-glass', 'Buscas',            searchCount),
        metricCard('fas fa-thumbs-up',        'Votos',             votesCount),
        metricCard('fas fa-bookmark',         'Posts salvos',      savedPostsCount),
      ].join('');
    }

    // ── Renderiza métricas da comunidade ──
    const communityMetrics = $('#admin-community-metrics');
    if (communityMetrics) {
      communityMetrics.innerHTML = [
        metricCard('fas fa-users',       'Total de usuários',                   usersTotal),
        metricCard('fas fa-user-plus',   'Novos usuários (' + shortLabel + ')', usersNew, { delta: deltaUsersNew }),
        metricCard('fas fa-chart-line',   'Interações (' + shortLabel + ')',     votesCount + savedPostsCount + commentsCount, { subtitle: 'Votos + salvos + comentários', delta: deltaEngagement }),
      ].join('');
    }

    // ── Privacidade + Saúde (vinculadas ao período + dados reais do overview) ──
    var healthItems = [
      { label: 'Métricas', value: overview ? 'RPC agregada' : 'Loaders', tone: overview ? null : 'warn', note: overview ? 'kc_admin_dashboard_overview respondeu (1 chamada).' : 'RPC indisponível; usando loaders individuais.' },
      { label: 'Pulso diário', value: (dailyMetrics && dailyMetrics.length) ? (dailyMetrics.length + ' dias') : 'Sem dados', tone: (dailyMetrics && dailyMetrics.length) ? null : 'warn', note: 'Série de atividade consolidada por dia.' },
      { label: 'Tendências', value: (trends && trends.length) ? (trends.length + ' termos') : 'Sem buscas', note: 'kc_admin_search_trends respondeu.' },
      { label: 'Privacidade', value: 'Dados reais', note: 'Eventos/sessões de search_queries + post_view_events (sem perfil individual).' }
    ];
    try {
      if (window._KCAD && window._KCAD.privacy && typeof window._KCAD.privacy.refresh === 'function') {
        window._KCAD.privacy.refresh({ overview: overview ? overview.privacy : null, periodLabel: fullLabel, health: healthItems });
      }
    } catch (_) { }

    // ── Renderiza audit log ──
    renderAuditRows(auditRows, false);

    // ── Renderiza tendências de busca ──
    renderSearchTrends(trends, periodDays);
    renderDailyActivitySummary(dailySummary);
    renderDailyActivityChart(dailyMetrics);
    renderModuleShareTable(moduleShareRows);
    renderOperationalAlerts(alerts);
    throwIfAborted(signal);

    _data = {
      reportMetrics, postStatusMetrics,
      postsCreated, postsEdited, commentsCount, searchCount, postsTotal, visiblePosts,
      usersTotal, usersNew, votesCount, savedPostsCount, activeSessions15m,
      auditRows, trends, periodDays,
      dailyMetrics, dailySummary, moduleShareRows, alerts,
      periodLabel: fullLabel,
      periodStart: since,
      periodEnd: periodRange.until,
    };
    enableExport();

    setLastSync();
  }

  async function refreshDashboard() {
    if (_periodRefreshTimer) {
      clearTimeout(_periodRefreshTimer);
      _periodRefreshTimer = null;
    }
    if (_activeRefreshController) {
      _activeRefreshController.abort();
    }
    var controller = new AbortController();
    var requestSeq = ++_refreshRequestSeq;
    _activeRefreshController = controller;
    clearError();
    // Primeira carga: spinner principal; refreshes subsequentes: spinner no botão + opacidade nos grids
    var isFirstLoad = !_data;
    if (isFirstLoad) {
      setLoading(true);
    } else {
      setRefreshLoading(true);
      setGridsLoading(true);
    }
    try {
      await loadMetrics({ signal: controller.signal, requestSeq: requestSeq });
      throwIfAborted(controller.signal);
      await loadAdminRanking({ signal: controller.signal, requestSeq: requestSeq });
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      console.error('[Admin dashboard] refreshDashboard:', error);
      showError('Não foi possível atualizar o dashboard no momento.');
    } finally {
      if (_activeRefreshController === controller) {
        _activeRefreshController = null;
        setLoading(false);
        setRefreshLoading(false);
        setGridsLoading(false);
      }
    }
  }

  // ── Audit log: carregar mais ──────────────────────────────────────────────
  async function loadMoreAudit() {
    if (window._KCAD && window._KCAD.audit && typeof window._KCAD.audit.loadMoreAudit === 'function') {
      return window._KCAD.audit.loadMoreAudit(buildAuditDeps());
    }
    return Promise.resolve();
  }

  // ── Audit log: filtrar por ação ───────────────────────────────────────────
  async function filterAudit() {
    if (window._KCAD && window._KCAD.audit && typeof window._KCAD.audit.filterAudit === 'function') {
      return window._KCAD.audit.filterAudit(buildAuditDeps());
    }
    return Promise.resolve();
  }

  async function boot() {
    setLoading(true);
    stabilizeHeaderActions();
    bindDailyActivityChartModal();
    const access = await checkAccess();
    if (!access.ok) {
      setLoading(false);
      showError(access.message);
      setTimeout(() => window.location.replace('../index.html'), 2500);
      return;
    }

    $('#admin-content').style.display = 'block';

    const refreshBtn = $('#admin-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshDashboard);

    // Last sync clicável também dispara atualização
    var lastSyncEl = $('#admin-last-sync');
    if (lastSyncEl) lastSyncEl.addEventListener('click', refreshDashboard);

    bindAuditControls();

    // Period filter triggers full dashboard reload
    var periodFilter = $('#admin-period-filter');
    if (periodFilter) {
      periodFilter.addEventListener('change', function () {
        if (_periodRefreshTimer) clearTimeout(_periodRefreshTimer);
        if (_activeRefreshController) {
          var pendingController = _activeRefreshController;
          _activeRefreshController = null;
          pendingController.abort();
        }
        if (_data) {
          setRefreshLoading(true);
          setGridsLoading(true);
        } else {
          setLoading(true);
        }
        _periodRefreshTimer = window.setTimeout(function () {
          _periodRefreshTimer = null;
          refreshDashboard();
        }, PERIOD_CHANGE_DEBOUNCE_MS);
      });
    }

    bindAdminRanking();

    if (window.KCPullToRefresh && document.body.dataset.kcAdminPtrReady !== '1') {
      document.body.dataset.kcAdminPtrReady = '1';
      window.KCPullToRefresh.init({
        container: document.body,
        onRefresh: refreshDashboard,
      });
    }

    await refreshDashboard();
  }

  // ── Admin Ranking — Top Contribuidores ──────────────────────────────────────

  async function loadAdminRanking(options) {
    return (window._KCAD && window._KCAD.charts && typeof window._KCAD.charts.loadAdminRanking === 'function')
      ? window._KCAD.charts.loadAdminRanking(options, buildChartsDeps())
      : Promise.resolve();
  }

  function bindAdminRanking() {
    if (window._KCAD && window._KCAD.charts && typeof window._KCAD.charts.bindAdminRanking === 'function') {
      window._KCAD.charts.bindAdminRanking(buildChartsDeps());
    }
  }

  window.KCAdminDashboardRefresh = refreshDashboard;
  document.addEventListener('DOMContentLoaded', boot);
})();

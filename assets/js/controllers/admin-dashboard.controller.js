(function () {
  'use strict';

  /* Armazena os dados carregados para uso no export */
  let _data = null;
  let _auditOffset = 0;
  let _chartModalReturnFocus = null;
  var AUDIT_PAGE_SIZE = 20;
  var _exportBound = false;
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
      getXlsxLoadPromise: function () { return _xlsxLoadPromise; },
      setXlsxLoadPromise: function (promise) { _xlsxLoadPromise = promise || null; },
      getJspdfLoadPromise: function () { return _jspdfLoadPromise; },
      setJspdfLoadPromise: function (promise) { _jspdfLoadPromise = promise || null; },
      getActorCache: function () { return _actorsById; }
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

  function syncDailyActivityChartModal(series) {
    var modalChart = $('#admin-chart-modal-content');
    var modalLegend = $('#admin-chart-modal-legend');
    var modalMeta = $('#admin-chart-modal-meta');
    if (modalChart) {
      renderChartInto(modalChart, series, { width: 1024, height: 420, padding: 28, fontSize: 12 });
    }
    if (modalLegend) {
      modalLegend.innerHTML = Array.isArray(series) && series.length ? buildDailyActivityLegendMarkup(series) : '';
    }
    if (modalMeta) {
      if (Array.isArray(series) && series.length) {
        modalMeta.textContent = 'Período analisado: ' + getPeriodLabel((_data && _data.periodDays) || getSelectedPeriodDays()) +
          ' • ' + series.length + ' dias consolidados.';
      } else {
        modalMeta.textContent = 'Visualização detalhada da atividade consolidada por período.';
      }
    }
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
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';
      btn.classList.add('is-loading');
    } else {
      if (_refreshOrigHtml) btn.innerHTML = _refreshOrigHtml;
      btn.classList.remove('is-loading');
    }
  }

  // Marca/desmarca grids de métrica em estado de loading
  var GRID_IDS = ['admin-metrics', 'admin-activity-metrics', 'admin-community-metrics'];
  function setGridsLoading(isLoading) {
    GRID_IDS.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.classList.toggle('is-loading', isLoading);
    });
  }

  function setLastSync() {
    const el = $('#admin-last-sync');
    if (!el) return;
    el.innerHTML = '<i class="fas fa-circle-check" style="color:var(--kc-primary-brand);margin-right:5px;"></i>'
      + 'Atualizado em ' + new Date().toLocaleString('pt-BR')
      + ' &nbsp;<span style="opacity:.6;font-size:.78rem;">- clique para atualizar</span>';
  }

  function checkAccess() {
    return (window._KCAD && window._KCAD.metrics && typeof window._KCAD.metrics.checkAccess === 'function')
      ? window._KCAD.metrics.checkAccess()
      : Promise.resolve({ ok: false, message: 'Modulo de metrics do dashboard indisponivel.' });
  }
  function metricCard(icon, label, value, opts) {
    opts = opts || {};
    var href = opts.href || null;
    var highlight = opts.highlight && Number(value || 0) > 0;
    var subtitle = opts.subtitle || null;
    var cardStyle = highlight ? ' style="border-color:rgba(255,107,0,.5);"' : '';
    var inner = '<div class="kc-admin-card__label" title="' + escHtmlAdmin(label) + '">'
      + '<i class="' + icon + '"></i> ' + escHtmlAdmin(label) + '</div>'
      + '<strong>' + Number(value || 0) + '</strong>';
    if (subtitle) {
      inner += '<div style="font-size:.75rem;color:var(--kc-text-dark-secondary);margin-top:4px;">' + escHtmlAdmin(subtitle) + '</div>';
    }
    if (href) {
      inner += '<div style="margin-top:8px;"><a href="' + escHtmlAdmin(href) + '" style="font-size:.78rem;color:var(--kc-primary-brand);text-decoration:none;">Ver detalhes &rarr;</a></div>';
    }
    return '<article class="kc-admin-card"' + cardStyle + '>' + inner + '</article>';
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
      ['#admin-moderation-title', '<i class="fas fa-shield-halved"></i> Moderação (' + fullLabel + ')'],
      ['#admin-activity-title', '<i class="fas fa-chart-bar"></i> Atividade da plataforma (' + fullLabel + ')'],
      ['#admin-community-title', '<i class="fas fa-users"></i> Comunidade (' + fullLabel + ')'],
      ['#admin-trends-title', '<i class="fas fa-magnifying-glass-chart"></i> Tendências de busca (' + fullLabel + ')'],
      ['#admin-audit-title', '<i class="fas fa-clock-rotate-left"></i> Audit log (' + fullLabel + ')'],
      ['#admin-activity-pulse-title', '<i class="fas fa-wave-square"></i> Pulso diário (' + fullLabel + ')'],
      ['#admin-module-share-title', '<i class="fas fa-table-cells"></i> Top módulos (' + fullLabel + ')']
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

  function aggregateTrendsByModule(trends) {
    if (DashboardUtils.aggregateTrendsByModule) {
      return DashboardUtils.aggregateTrendsByModule(trends, window.KC_CONSTANTS || {});
    }

    var byModule = {};
    (trends || []).forEach(function (trend) {
      var moduleKey = classifyTermToModule(trend && trend.term);
      if (!moduleKey) return;
      if (!byModule[moduleKey]) {
        byModule[moduleKey] = {
          module: moduleKey,
          label: getModuleLabel(moduleKey),
          icon: getModuleIcon(moduleKey),
          count: 0,
          terms: []
        };
      }
      byModule[moduleKey].count += Number(trend && trend.count) || 1;
      if (trend && trend.term) byModule[moduleKey].terms.push(trend.term);
    });

    return Object.values(byModule).sort(function (a, b) { return b.count - a.count; });
  }

  function renderSearchTrendsByModule(trends, periodDays) {
    var container = $('#admin-trends-modules');
    if (!container) return;
    var moduleData = aggregateTrendsByModule(trends);
    if (!moduleData.length) { container.style.display = 'none'; return; }
    container.style.display = 'flex';
    var periodLabel = getPeriodLabel(periodDays || 30);
    var titleHtml = '<div class="kc-trend-module-title" style="width:100%;"><i class="fas fa-table-cells"></i> Por módulo (' + escHtmlAdmin(periodLabel) + ')</div>';
    container.innerHTML = titleHtml + moduleData.map(function (moduleRow) {
      var topTerms = moduleRow.terms.slice(0, 3).map(function (term) { return escHtmlAdmin(term); }).join(', ');
      return '<span class="kc-trend-module-badge" title="' + escHtmlAdmin(topTerms) + '">'
        + '<i class="' + escHtmlAdmin(moduleRow.icon || getModuleIcon(moduleRow.module)) + '"></i> ' + escHtmlAdmin(moduleRow.label || getModuleLabel(moduleRow.module))
        + '<span class="kc-badge-count">' + (Number(moduleRow.count) || 0) + '</span>'
        + '</span>';
    }).join('');
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

  function renderSearchTrends(trends, periodDays) {
    const trendsList = $('#admin-trends-list');
    if (!trendsList) return;
    if (!trends || !trends.length) {
      trendsList.innerHTML = '<li class="kc-trend-empty">Nenhuma busca registrada ainda. As buscas feitas na plataforma aparecerão aqui.</li>';
      var modContainer = $('#admin-trends-modules');
      if (modContainer) modContainer.style.display = 'none';
      return;
    }
    const max = Math.max.apply(null, trends.map(function (trend) { return Number(trend.count) || 1; }).concat([1]));
    trendsList.innerHTML = trends.map(function (trend, index) {
      const pct = Math.round(((Number(trend.count) || 0) / max) * 100);
      var modKey = classifyTermToModule(trend.term);
      var modBadge = modKey
        ? '<span style="font-size:.72rem;color:var(--kc-text-dark-secondary);margin-left:4px;" title="' + escHtmlAdmin(getModuleLabel(modKey)) + '"><i class="' + getModuleIcon(modKey) + '"></i></span>'
        : '';
      return '<li class="kc-trend-item">'
        + '<span class="kc-trend-rank">' + (index + 1) + '</span>'
        + '<span class="kc-trend-term">' + escHtmlAdmin(String(trend.term || '')) + modBadge + '</span>'
        + '<div class="kc-trend-bar-wrap"><div class="kc-trend-bar" style="width:' + pct + '%"></div></div>'
        + '<span class="kc-trend-count">' + (Number(trend.count) || 0) + '</span>'
        + '</li>';
    }).join('');
    renderSearchTrendsByModule(trends, periodDays);
  }
  function renderDailyActivitySummary(summary) {
    var container = $('#admin-daily-activity-summary');
    if (!container) return;
    if (!summary) {
      container.innerHTML = '<div class="kc-admin-empty">Sem dados diários para resumir.</div>';
      return;
    }

    var peakLabel = summary.peakDay && summary.peakDay.label ? summary.peakDay.label : '--';
    container.innerHTML = [
      '<div class="kc-admin-kpi"><span class="kc-admin-kpi__label">Pico diário</span><strong>' + toNumber(summary.peakTotal) + '</strong><small>' + escHtmlAdmin(peakLabel) + '</small></div>',
      '<div class="kc-admin-kpi"><span class="kc-admin-kpi__label">Média diária</span><strong>' + escHtmlAdmin(String(summary.averageTotal || 0)) + '</strong><small>Eventos consolidados</small></div>',
      '<div class="kc-admin-kpi"><span class="kc-admin-kpi__label">Último dia</span><strong>' + toNumber(summary.lastDayTotal) + '</strong><small>Volume mais recente</small></div>',
      '<div class="kc-admin-kpi"><span class="kc-admin-kpi__label">Total de buscas</span><strong>' + toNumber(summary.totals && summary.totals.searches_count) + '</strong><small>Demanda registrada</small></div>'
    ].join('');
  }

  function buildSeriesPath(series, key, maxValue, width, height, padding) {
    var points = [];
    var innerWidth = width - (padding * 2);
    var innerHeight = height - (padding * 2);
    var step = series.length > 1 ? innerWidth / (series.length - 1) : innerWidth;
    var safeMax = Math.max(maxValue || 0, 1);

    series.forEach(function (row, index) {
      var value = toNumber(row[key]);
      var x = padding + (step * index);
      var y = padding + innerHeight - ((value / safeMax) * innerHeight);
      points.push((index === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2));
    });

    return points.join(' ');
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

  function buildDailyActivityLegendMarkup(series) {
    var totals = getSeriesTotals(series);
    return SERIES_META.map(function (meta) {
      return '<span class="kc-admin-chart-legend__item">' +
        '<span class="kc-admin-chart-legend__dot" style="background:' + meta.color + ';"></span>' +
        '<span class="kc-admin-chart-legend__label"><i class="' + meta.icon + '"></i> ' + escHtmlAdmin(meta.label) + '</span>' +
        '<span class="kc-admin-chart-legend__total">' + toNumber(totals[meta.key]) + '</span>' +
        '</span>';
    }).join('');
  }

  function buildDailyActivityChartSvg(series, options) {
    options = options || {};
    var width = options.width || 640;
    var height = options.height || 240;
    var padding = options.padding || 22;
    var fontSize = options.fontSize || 10;
    var maxValue = 0;

    series.forEach(function (row) {
      getSeriesKeys().forEach(function (key) {
        maxValue = Math.max(maxValue, toNumber(row[key]));
      });
    });

    var grid = [0.25, 0.5, 0.75, 1].map(function (ratio) {
      var y = padding + ((height - (padding * 2)) * (1 - ratio));
      return '<line x1="' + padding + '" y1="' + y.toFixed(2) + '" x2="' + (width - padding) + '" y2="' + y.toFixed(2) + '" stroke="rgba(148,163,184,.24)" stroke-dasharray="4 4"></line>';
    }).join('');

    var labels = series.map(function (row, index) {
      if (series.length > 14 && index % 2 === 1 && index !== series.length - 1) return '';
      var innerWidth = width - (padding * 2);
      var step = series.length > 1 ? innerWidth / (series.length - 1) : innerWidth;
      var x = padding + (step * index);
      return '<text x="' + x.toFixed(2) + '" y="' + (height - 6) + '" text-anchor="middle" fill="var(--kc-text-dark-secondary)" font-size="' + fontSize + '">' + escHtmlAdmin(row.label || '') + '</text>';
    }).join('');

    var lines = SERIES_META.map(function (meta) {
      return '<path d="' + buildSeriesPath(series, meta.key, maxValue, width, height, padding) + '" fill="none" stroke="' + meta.color + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path>';
    }).join('');

    return '<svg class="kc-admin-chart-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Gráfico diário de atividade">' +
      grid + lines + labels + '</svg>';
  }

  function renderChartInto(container, series, options) {
    if (!container) return;
    if (!Array.isArray(series) || !series.length) {
      container.innerHTML = '<div class="kc-admin-empty">Sem dados suficientes para montar o gráfico diário.</div>';
      return;
    }
    container.innerHTML = buildDailyActivityChartSvg(series, options);
  }

  function closeDailyActivityChartModal() {
    var modal = $('#admin-chart-modal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
    if (window.KCAdminShell && typeof window.KCAdminShell.setModalOpen === 'function') {
      window.KCAdminShell.setModalOpen(false);
    }
    if (_chartModalReturnFocus && typeof _chartModalReturnFocus.focus === 'function') {
      try { _chartModalReturnFocus.focus(); } catch (_) {}
    }
    _chartModalReturnFocus = null;
  }

  function openDailyActivityChartModal() {
    if (!_data || !Array.isArray(_data.dailyMetrics) || !_data.dailyMetrics.length) return;
    var modal = $('#admin-chart-modal');
    var closeBtn = $('#admin-chart-modal-close');
    if (!modal || !closeBtn) return;
    _chartModalReturnFocus = document.activeElement;
    syncDailyActivityChartModal(_data.dailyMetrics);
    modal.setAttribute('aria-hidden', 'false');
    if (window.KCAdminShell && typeof window.KCAdminShell.setModalOpen === 'function') {
      window.KCAdminShell.setModalOpen(true);
    }
    window.setTimeout(function () {
      try { closeBtn.focus(); } catch (_) {}
    }, 40);
  }

  function bindDailyActivityChartModal() {
    var expandBtn = $('#admin-chart-expand-btn');
    var closeBtn = $('#admin-chart-modal-close');
    var modal = $('#admin-chart-modal');

    if (expandBtn && !expandBtn.dataset.bound) {
      expandBtn.dataset.bound = 'true';
      expandBtn.addEventListener('click', openDailyActivityChartModal);
    }

    if (closeBtn && !closeBtn.dataset.bound) {
      closeBtn.dataset.bound = 'true';
      closeBtn.addEventListener('click', closeDailyActivityChartModal);
    }

    if (modal && !modal.dataset.bound) {
      modal.dataset.bound = 'true';
      modal.addEventListener('click', function (event) {
        if (event.target === modal) closeDailyActivityChartModal();
      });
    }

    if (!document.body.dataset.adminChartEscBound) {
      document.body.dataset.adminChartEscBound = 'true';
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeDailyActivityChartModal();
      });
    }
  }

  function renderDailyActivityChart(series) {
    var chart = $('#admin-daily-activity-chart');
    var legend = $('#admin-daily-activity-legend');
    var expandBtn = $('#admin-chart-expand-btn');
    if (!chart || !legend) return;

    if (!Array.isArray(series) || !series.length) {
      chart.innerHTML = '<div class="kc-admin-empty">Sem dados suficientes para montar o gráfico diário.</div>';
      legend.innerHTML = '';
      syncDailyActivityChartModal([]);
      if (expandBtn) expandBtn.disabled = true;
      closeDailyActivityChartModal();
      return;
    }

    renderChartInto(chart, series, { width: 640, height: 260, padding: 24, fontSize: 10 });
    legend.innerHTML = buildDailyActivityLegendMarkup(series);
    syncDailyActivityChartModal(series);
    if (expandBtn) expandBtn.disabled = false;
  }

  function renderModuleShareTable(rows) {
    var container = $('#admin-module-share-table');
    if (!container) return;
    if (!Array.isArray(rows) || !rows.length) {
      container.innerHTML = '<div class="kc-admin-empty">Sem buscas suficientes para calcular participação por módulo.</div>';
      return;
    }

    container.innerHTML = '<table><thead><tr><th>Módulo</th><th>Share</th><th>Volume</th></tr></thead><tbody>' +
      rows.map(function (row) {
        var topTerms = Array.isArray(row.topTerms) && row.topTerms.length ? row.topTerms.join(', ') : 'Sem termos associados';
        return '<tr>' +
          '<td><span style="display:inline-flex;align-items:center;gap:8px;"><i class="' + escHtmlAdmin(row.icon || 'fas fa-tag') + '"></i> ' + escHtmlAdmin(row.label || row.module || 'Módulo') + '</span><div style="margin-top:4px;font-size:.76rem;color:var(--kc-text-dark-secondary);">' + escHtmlAdmin(topTerms) + '</div></td>' +
          '<td>' + escHtmlAdmin(String(row.share || 0)) + '%</td>' +
          '<td>' + toNumber(row.count) + '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  function renderOperationalAlerts(alerts) {
    var container = $('#admin-operational-alerts');
    if (!container) return;
    if (!Array.isArray(alerts) || !alerts.length) {
      container.innerHTML = '<li class="kc-admin-empty">Nenhum alerta operacional no momento.</li>';
      return;
    }

    container.innerHTML = alerts.map(function (alert) {
      var toneClass = alert && alert.tone ? 'kc-admin-alert--' + alert.tone : 'kc-admin-alert--neutral';
      return '<li class="kc-admin-alert ' + toneClass + '">' +
        '<strong>' + escHtmlAdmin(alert.title || 'Atualização') + '</strong>' +
        '<p>' + escHtmlAdmin(alert.body || '') + '</p>' +
        '</li>';
    }).join('');
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
      activityTitle.innerHTML = '<i class="fas fa-chart-bar"></i> Atividade da plataforma (' + fullLabel + ')';
    }
    var moderationTitle = $('#admin-moderation-title');
    if (moderationTitle) {
      moderationTitle.innerHTML = '<i class="fas fa-shield-halved"></i> Moderação (' + fullLabel + ')';
    }
    var communityTitle = $('#admin-community-title');
    if (communityTitle) {
      communityTitle.innerHTML = '<i class="fas fa-users"></i> Comunidade (' + fullLabel + ')';
    }
    var trendsTitle = $('#admin-trends-title');
    if (trendsTitle) {
      trendsTitle.innerHTML = '<i class="fas fa-magnifying-glass-chart"></i> Tendências de busca (' + fullLabel + ')';
    }
    var auditTitle = $('#admin-audit-title');
    if (auditTitle) {
      auditTitle.innerHTML = '<i class="fas fa-clock-rotate-left"></i> Audit log (' + fullLabel + ')';
    }

    // Carrega todas as métricas em paralelo para melhor performance
    stabilizeHeaderActions();
    updateTitles(periodDays);

    const [
      reportMetrics,
      postStatusMetrics,
      postsCreated,
      postsEdited,
      commentsCount,
      searchCount,
      postsTotal,
      usersTotal,
      usersNew,
      votesCount,
      savedPostsCount,
      auditRows,
      trends,
      dailyMetrics,
    ] = await Promise.all([
      loadReportMetrics(client, since),
      loadPostStatusMetrics(client, since),
      loadPostsCreated(client, since),
      loadPostsEdited(client, since),
      loadCommentsCount(client, since),
      loadSearchCount(client, since),
      loadPostsTotal(client),
      loadUsersTotal(client),
      loadUsersNew(client, since),
      loadVotesCount(client, since),
      loadSavedPostsCount(client, since),
      loadAuditLog(client, AUDIT_PAGE_SIZE, 0, 'all', since),
      loadSearchTrendsData(client, since),
      loadDailyMetrics(client, since, signal),
    ]);
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
        metricCard('fas fa-plus-circle',      'Posts publicados',  postsCreated),
        metricCard('fas fa-pen-to-square',    'Posts editados',    postsEdited),
        metricCard('fas fa-comment',          'Comentários',       commentsCount),
        metricCard('fas fa-magnifying-glass', 'Buscas',            searchCount),
      ].join('');
    }

    // ── Renderiza métricas da comunidade ──
    const communityMetrics = $('#admin-community-metrics');
    if (communityMetrics) {
      communityMetrics.innerHTML = [
        metricCard('fas fa-users',       'Total de usuários',                   usersTotal),
        metricCard('fas fa-user-plus',   'Novos usuários (' + shortLabel + ')', usersNew),
        metricCard('fas fa-thumbs-up',   'Votos (' + shortLabel + ')',          votesCount),
        metricCard('fas fa-bookmark',    'Posts salvos (' + shortLabel + ')',   savedPostsCount),
      ].join('');
    }

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
      postsCreated, postsEdited, commentsCount, searchCount, postsTotal,
      usersTotal, usersNew, votesCount, savedPostsCount,
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

    var loadMoreBtn = $('#admin-audit-load-more');
    if (loadMoreBtn) loadMoreBtn.addEventListener('click', loadMoreAudit);

    var auditFilter = $('#admin-audit-filter');
    if (auditFilter) auditFilter.addEventListener('change', filterAudit);

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

  var _adminRankingExpanded = false;

  function mapPeriodToRanking(days) {
    if (days <= 1) return 'day';
    if (days <= 7) return 'week';
    return 'month';
  }

  async function loadAdminRanking(options) {
    options = options || {};
    var signal = options.signal || null;
    var tableEl = $('#admin-ranking-table');
    if (!tableEl) return;

    var api = window.KCAPI;
    if (!api || typeof api.getTopContributors !== 'function') {
      tableEl.innerHTML = '<div class="kc-admin-empty">API indisponível.</div>';
      return;
    }

    var periodDays = getSelectedPeriodDays();
    var period = mapPeriodToRanking(periodDays);
    var moduleFilter = $('#admin-ranking-module-filter');
    var module = moduleFilter ? (moduleFilter.value || null) : null;
    var limit = _adminRankingExpanded ? 100 : 10;
    var requestSeq = ++_rankingRequestSeq;

    tableEl.innerHTML = '<div class="kc-admin-empty"><i class="fas fa-spinner fa-spin"></i> Carregando ranking...</div>';

    try {
      var users = await api.getTopContributors(period, module, limit);
      if ((signal && signal.aborted) || requestSeq !== _rankingRequestSeq) return;
      var showAllBtn = $('#admin-ranking-show-all');
      if (!users || users.length === 0) {
        tableEl.innerHTML = '<div class="kc-admin-empty">Nenhum contribuidor encontrado no período.</div>';
        if (showAllBtn) showAllBtn.style.display = 'none';
        return;
      }

      var html = '<div class="kc-ranking-table-wrapper"><table class="kc-ranking-score-table">' +
        '<thead><tr>' +
          '<th>#</th><th>Usuário</th><th>Score</th><th title="Publicações"><i class="fas fa-file-alt"></i></th>' +
          '<th title="Votos"><i class="fas fa-thumbs-up"></i></th><th title="Comentários"><i class="fas fa-comment"></i></th>' +
          '<th title="Cupons"><i class="fas fa-ticket"></i></th><th title="Shares"><i class="fas fa-share-nodes"></i></th>' +
          '<th title="Penalidades"><i class="fas fa-flag"></i></th>' +
        '</tr></thead><tbody>';

      users.forEach(function (u) {
        var name = u.display_name || 'Usuário';
        var avatarSrc = u.avatar_url || '';
        var avatarHtml = avatarSrc
          ? '<img src="' + avatarSrc + '" style="width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle;" loading="lazy">'
          : '<i class="fas fa-user" style="font-size:0.8em;"></i>';
        html += '<tr>' +
          '<td style="font-weight:700;color:var(--kc-primary-brand);">' + u.rank + '</td>' +
          '<td style="display:flex;align-items:center;gap:6px;min-width:0;">' + avatarHtml +
            '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + name + '</span></td>' +
          '<td style="font-weight:700;">' + u.score + '</td>' +
          '<td>' + u.posts_count + '</td>' +
          '<td>' + u.votes_received + '</td>' +
          '<td>' + u.comments_count + '</td>' +
          '<td>' + u.coupon_clicks + '</td>' +
          '<td>' + u.share_count + '</td>' +
          '<td style="color:' + (u.penalties > 0 ? '#ef5350' : 'inherit') + ';">' + u.penalties + '</td>' +
        '</tr>';
      });
      html += '</tbody></table></div>';
      tableEl.innerHTML = html;

      if (showAllBtn) {
        if (!_adminRankingExpanded && users.length >= 10) {
          showAllBtn.style.display = 'block';
          showAllBtn.innerHTML = '<i class="fas fa-chevron-down"></i> Mostrar todos';
        } else if (_adminRankingExpanded) {
          showAllBtn.style.display = 'block';
          showAllBtn.innerHTML = '<i class="fas fa-chevron-up"></i> Mostrar top 10';
        } else {
          showAllBtn.style.display = 'none';
        }
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      if ((signal && signal.aborted) || requestSeq !== _rankingRequestSeq) return;
      tableEl.innerHTML = '<div class="kc-admin-empty">Erro ao carregar ranking.</div>';
      showStatusToast('Não foi possível atualizar o ranking agora.', 'error', { duration: 3600 });
    }
  }

  function bindAdminRanking() {
    var moduleFilter = $('#admin-ranking-module-filter');
    if (moduleFilter) moduleFilter.addEventListener('change', function () {
      _adminRankingExpanded = false;
      loadAdminRanking();
    });

    var showAllBtn = $('#admin-ranking-show-all');
    if (showAllBtn) showAllBtn.addEventListener('click', function () {
      _adminRankingExpanded = !_adminRankingExpanded;
      loadAdminRanking();
    });

    var infoBtn = $('#admin-ranking-info-btn');
    if (infoBtn) {
      infoBtn.addEventListener('click', function () {
        // Use kc-ranking.js ensureInfoModal if available, or create inline
        var modal = document.getElementById('kcRankingInfoModal');
        if (!modal && window.KCRanking) {
          // kc-ranking.js will auto-create on DOMContentLoaded if sidebar exists
          // Fallback: create simple alert
        }
        if (modal) {
          modal.setAttribute('aria-hidden', 'false');
        }
      });
    }
  }

  window.KCAdminDashboardRefresh = refreshDashboard;
  document.addEventListener('DOMContentLoaded', boot);
})();

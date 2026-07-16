(function () {
  'use strict';

  /* Armazena os dados carregados para uso no export */
  let _data = null;
  let _auditOffset = 0;
  let _chartModalReturnFocus = null;
  let _chartPrefs = null;
  let _saveChartPrefsTimer = null;
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
  // Séries visíveis por padrão quando o admin ainda não tem preferência salva.
  var DEFAULT_VISIBLE_SERIES = ['post_views_count', 'sessions_count', 'posts_count', 'comments_count', 'signups_count', 'ad_clicks_count'];
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
      resolveTermModule: resolveTermModule,
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
      getVisibleSeriesKeys: function () {
        var st = (window._KCAD && window._KCAD.__adminChartsState) || {};
        var hidden = st.hiddenSeries || {};
        return SERIES_META.map(function (m) { return m.key; }).filter(function (k) { return !hidden[k]; });
      },
      getRankingRows: function () {
        var st = (window._KCAD && window._KCAD.__adminChartsState) || {};
        var snapshot = st.rankingSnapshot || {};
        if (Array.isArray(snapshot.rows)) return snapshot.rows;
        return Array.isArray(st.lastRanking) ? st.lastRanking : [];
      },
      getRankingContext: function () {
        var st = (window._KCAD && window._KCAD.__adminChartsState) || {};
        var snapshot = st.rankingSnapshot || {};
        if (snapshot.context && typeof snapshot.context === 'object') {
          return snapshot.context;
        }
        var moduleFilter = $('#admin-ranking-module-filter');
        var selectedDays = getSelectedPeriodDays();
        var rankingWindow = typeof DashboardUtils.getRankingWindowContext === 'function'
          ? DashboardUtils.getRankingWindowContext(selectedDays)
          : {
              period: selectedDays <= 1 ? 'day' : selectedDays <= 7 ? 'week' : selectedDays <= 30 ? 'month' : selectedDays <= 90 ? 'quarter' : 'year',
              periodDays: selectedDays,
              selectedPeriodDays: selectedDays,
              windowDays: selectedDays,
              windowType: 'rolling',
              periodLabel: selectedDays <= 1 ? 'Últimas 24 horas (janela móvel)' : 'Últimos ' + selectedDays + ' dias corridos (janela móvel)'
            };
        return Object.assign({}, rankingWindow, {
          module: moduleFilter ? (moduleFilter.value || '') : '',
          expanded: _adminRankingExpanded,
          limit: _adminRankingExpanded ? 100 : 10
        });
      },
      getTrendExportSnapshot: function () {
        var st = (window._KCAD && window._KCAD.__adminChartsState) || {};
        var trendState = st.searchTrends || {};
        var query = String(trendState.query || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        var moduleKey = String(trendState.module || '');
        var rows = (Array.isArray(trendState.rows) ? trendState.rows : []).filter(function (row) {
          if (moduleKey && row.__module !== moduleKey) return false;
          if (query && String(row.__searchText || '').indexOf(query) === -1) return false;
          return true;
        });
        return {
          rows: rows,
          module: moduleKey,
          query: String(trendState.query || '').trim()
        };
      },
      isDashboardBusy: function () {
        var content = $('#admin-content');
        var chartsState = (window._KCAD && window._KCAD.__adminChartsState) || {};
        var auditState = (window._KCAD && window._KCAD.__adminAuditState) || {};
        return !!(
          _activeRefreshController ||
          _periodRefreshTimer ||
          chartsState.rankingPending ||
          auditState.pending ||
          (content && content.getAttribute('aria-busy') === 'true')
        );
      },
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
      resolveTermModule: resolveTermModule,
      getSeriesKeys: getSeriesKeys,
      getSeriesMeta: function () { return SERIES_META.slice(); },
      getChartModalReturnFocus: function () { return _chartModalReturnFocus; },
      setChartModalReturnFocus: function (nextValue) { _chartModalReturnFocus = nextValue || null; },
      getRankingExpanded: function () { return _adminRankingExpanded; },
      setRankingExpanded: function (nextValue) { _adminRankingExpanded = !!nextValue; },
      getRankingRequestSeq: function () { return _rankingRequestSeq; },
      setRankingRequestSeq: function (nextValue) { _rankingRequestSeq = Number(nextValue) || 0; },
      refreshExportAvailability: enableExport,
      getInitialChartPrefs: function () { return _chartPrefs; },
      getDefaultVisibleSeries: function () { return DEFAULT_VISIBLE_SERIES.slice(); },
      saveChartPrefs: saveChartPrefs,
      showStatusToast: showStatusToast
    };
  }

  var CHART_PREFS_STORAGE_KEY = 'kc_admin_chart_prefs_v1';

  // Carrega as preferências do gráfico do admin atual (servidor → fallback localStorage).
  async function loadChartPrefs() {
    try {
      var client = getClient();
      if (client && typeof client.rpc === 'function') {
        var resp = await client.rpc('kc_admin_get_chart_prefs');
        if (resp && !resp.error && resp.data && resp.data.ok !== false && resp.data.prefs) {
          _chartPrefs = resp.data.prefs;
          try { window.localStorage.setItem(CHART_PREFS_STORAGE_KEY, JSON.stringify(_chartPrefs)); } catch (_) { }
          return;
        }
      }
    } catch (_) { }
    try {
      var raw = window.localStorage.getItem(CHART_PREFS_STORAGE_KEY);
      if (raw) _chartPrefs = JSON.parse(raw);
    } catch (_) { _chartPrefs = null; }
  }

  // Salva (debounced) as preferências: localStorage imediato + RPC no servidor.
  function saveChartPrefs(prefs) {
    if (!prefs || typeof prefs !== 'object') return;
    _chartPrefs = prefs;
    try { window.localStorage.setItem(CHART_PREFS_STORAGE_KEY, JSON.stringify(prefs)); } catch (_) { }
    if (_saveChartPrefsTimer) window.clearTimeout(_saveChartPrefsTimer);
    _saveChartPrefsTimer = window.setTimeout(function () {
      _saveChartPrefsTimer = null;
      try {
        var client = getClient();
        if (client && typeof client.rpc === 'function') {
          client.rpc('kc_admin_save_chart_prefs', { p_prefs: prefs }).then(function () { }, function () { });
        }
      } catch (_) { }
    }, 600);
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
    const content = $('#admin-content');
    if (loading) {
      loading.style.display = isLoading ? 'flex' : 'none';
      loading.setAttribute('aria-hidden', isLoading ? 'false' : 'true');
    }
    if (content) content.setAttribute('aria-busy', isLoading ? 'true' : 'false');
  }

  // Spinner no botão Atualizar durante refresh
  var _refreshOrigHtml = null;
  var _refreshOrigDisabled = false;
  function setRefreshLoading(isLoading) {
    var btn = $('#admin-refresh-btn');
    if (!btn) return;
    if (isLoading) {
      if (!btn.classList.contains('is-loading')) {
        _refreshOrigHtml = btn.innerHTML;
        _refreshOrigDisabled = !!btn.disabled;
      }
      btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Atualizando...';
      btn.classList.add('is-loading');
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
    } else {
      if (_refreshOrigHtml !== null) btn.innerHTML = _refreshOrigHtml;
      btn.classList.remove('is-loading');
      btn.disabled = _refreshOrigDisabled;
      btn.removeAttribute('aria-busy');
      _refreshOrigHtml = null;
      _refreshOrigDisabled = false;
    }
  }

  // Marca/desmarca grids de métrica em estado de loading
  var GRID_IDS = ['admin-executive-metrics', 'admin-metrics', 'admin-activity-metrics', 'admin-community-metrics', 'admin-privacy-metrics', 'admin-monetization-metrics'];
  function setGridsLoading(isLoading) {
    GRID_IDS.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) {
        el.classList.toggle('is-loading', isLoading);
        el.setAttribute('aria-busy', isLoading ? 'true' : 'false');
      }
    });
    var content = $('#admin-content');
    if (content) content.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    enableExport();
  }

  function setLastSync() {
    const el = $('#admin-last-sync');
    if (!el) return;
    var updatedAt = new Date().toLocaleString('pt-BR');
    el.innerHTML = '<i class="fas fa-circle-check" style="color:var(--kc-primary-brand);margin-right:5px;" aria-hidden="true"></i>'
      + 'Atualizado em ' + updatedAt
      + ' &nbsp;<span style="opacity:.6;font-size:.78rem;">- clique para atualizar</span>';
    el.setAttribute('aria-label', 'Atualizado em ' + updatedAt + '. Ative para atualizar o dashboard.');
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

  function formatPercentMetric(value) {
    var parsed = Number(value);
    if (!Number.isFinite(parsed)) return '0,00%';
    return parsed.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
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
      + '<i class="' + icon + '" aria-hidden="true"></i> ' + escHtmlAdmin(label) + '</div>'
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
    if (current === null || typeof current === 'undefined' ||
        previous === null || typeof previous === 'undefined') return null;
    var cur = Number(current) || 0;
    var prev = Number(previous) || 0;
    if (prev <= 0) return null;
    var pct = Math.round(((cur - prev) / prev) * 100);
    if (pct === 0) return { text: '0%', dir: 'flat' };
    return { text: (pct > 0 ? '+' : '') + pct + '%', dir: pct > 0 ? 'up' : 'down' };
  }

  function sumAvailableMetrics(values) {
    var list = Array.isArray(values) ? values : [];
    if (list.some(function (value) { return value === null || typeof value === 'undefined'; })) return null;
    return list.reduce(function (sum, value) { return sum + (Number(value) || 0); }, 0);
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
      ['#admin-community-metrics', 3], ['#admin-privacy-metrics', 4], ['#admin-monetization-metrics', 4]
    ];
    grids.forEach(function (pair) {
      var el = $(pair[0]);
      if (el && el.children.length === 0) el.innerHTML = skeletonCards(pair[1]);
    });
  }

  function startOfLocalDayDaysAgo(n) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - Math.max(0, Number(n) || 0));
    return d.toISOString();
  }

  // ── Período selecionado ────────────────────────────────────────────────────
  function getSelectedPeriodDays() {
    var el = $('#admin-period-filter');
    return el ? parseInt(el.value, 10) || 30 : 30;
  }

  var PERIOD_LABELS = {
    1: 'hoje',
    7: 'últimos 7 dias',
    30: 'últimos 30 dias',
    90: 'últimos 90 dias',
    365: 'últimos 365 dias',
  };

  function getPeriodLabel(days) {
    return PERIOD_LABELS[days] || ('últimos ' + days + ' dias');
  }

  function getPeriodShortLabel(days) {
    if (days === 1) return 'hoje';
    if (days === 7) return '7d';
    return days + 'd';
  }

  function updateTitles(days) {
    var fullLabel = getPeriodLabel(days);
    var titles = [
      ['#admin-executive-title', '<i class="fas fa-gauge-high" aria-hidden="true"></i> Resumo agora (' + fullLabel + ')'],
      ['#admin-moderation-title', '<i class="fas fa-shield-halved" aria-hidden="true"></i> Moderação (' + fullLabel + ')'],
      ['#admin-activity-title', '<i class="fas fa-chart-bar" aria-hidden="true"></i> Atividade da plataforma (' + fullLabel + ')'],
      ['#admin-community-title', '<i class="fas fa-users" aria-hidden="true"></i> Comunidade (' + fullLabel + ')'],
      ['#admin-monetization-title', '<i class="fas fa-rectangle-ad" aria-hidden="true"></i> Monetização (' + fullLabel + ')'],
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
    var normalizedDays = Math.max(1, Number(periodDays) || 30);
    var since = startOfLocalDayDaysAgo(normalizedDays - 1);
    var until = new Date().toISOString();
    var previousSince = DashboardUtils.getComparablePreviousSince
      ? DashboardUtils.getComparablePreviousSince(since, until)
      : new Date(new Date(since).getTime() - (new Date(until).getTime() - new Date(since).getTime())).toISOString();
    return {
      since: since,
      until: until,
      previousSince: previousSince,
      label: getPeriodLabel(normalizedDays)
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

  function resolveTermModule(item) {
    if (DashboardUtils.resolveTermModule) {
      return DashboardUtils.resolveTermModule(item, window.KC_CONSTANTS || {});
    }
    return item && (item.module || item.module_key)
      ? (item.module || item.module_key)
      : classifyTermToModule(item && item.term);
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

  function loadAdOverview(client, since) {
    return (window._KCAD && window._KCAD.metrics && typeof window._KCAD.metrics.loadAdOverview === 'function')
      ? window._KCAD.metrics.loadAdOverview(client, since)
      : Promise.resolve({
          ok: false,
          available: false,
          source: 'unavailable',
          availability: { complete: false, settings: false, campaigns: false, impressions: false, clicks: false, metrics: false },
          settings: { status: null, provider: null, auto_ads_enabled: null },
          campaigns: { total: null, active: null },
          metrics: { impressions: null, clicks: null, ctr: null },
          active_without_impressions: null,
          expired_active: null,
        });
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

  function beginAuditRequest() {
    return (window._KCAD && window._KCAD.audit && typeof window._KCAD.audit.beginRequest === 'function')
      ? window._KCAD.audit.beginRequest()
      : null;
  }

  function isCurrentAuditRequest(requestSeq) {
    return requestSeq == null
      || !(window._KCAD && window._KCAD.audit && typeof window._KCAD.audit.isCurrentRequest === 'function')
      || window._KCAD.audit.isCurrentRequest(requestSeq);
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
    var auditFiltersSnapshot = readAuditFilters();
    var auditRequestSeq = beginAuditRequest();
    window._KCAD.__adminMetricsDiagnostics = {};

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
    var prevSince = periodRange.previousSince;

    function prevWindowCount(table) {
      return client.from(table)
        .select('id', { count: 'exact', head: true })
        .gte('created_at', prevSince)
        .lt('created_at', since)
        .then(function (r) { return (r && !r.error && typeof r.count === 'number') ? r.count : null; })
        .catch(function () { return null; });
    }

    var reportMetrics, postStatusMetrics, postsCreated, postsEdited, commentsCount,
      searchCount, postsTotal, visiblePosts, usersTotal, usersNew, votesCount,
      savedPostsCount, activeSessions15m, adOverview, auditRows, trends, dailyMetrics;
    var auditAvailable = false;
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
      searchCount = Number(overview.searches);
      if (!Number.isFinite(searchCount)) searchCount = Number((overview.privacy || {}).searches) || 0;
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
        loadAuditLog(client, AUDIT_PAGE_SIZE, 0, auditFiltersSnapshot, since),
        loadSearchTrendsData(client, since),
        loadDailyMetrics(client, since, signal),
        loadAdOverview(client, since),
      ]);
      auditRows = ovRest[0];
      trends = ovRest[1];
      dailyMetrics = ovRest[2];
      adOverview = ovRest[3];
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
        loadAuditLog(client, AUDIT_PAGE_SIZE, 0, auditFiltersSnapshot, since),
        loadSearchTrendsData(client, since),
        loadDailyMetrics(client, since, signal),
        loadAdOverview(client, since),
      ]);
      reportMetrics = full[0]; postStatusMetrics = full[1]; postsCreated = full[2]; postsEdited = full[3];
      commentsCount = full[4]; searchCount = full[5]; postsTotal = full[6]; visiblePosts = full[7];
      usersTotal = full[8]; usersNew = full[9]; votesCount = full[10]; savedPostsCount = full[11];
      activeSessions15m = full[12]; auditRows = full[13]; trends = full[14]; dailyMetrics = full[15]; adOverview = full[16];

      var prevCounts = await Promise.all([
        prevWindowCount('profiles'), prevWindowCount('posts'), prevWindowCount('comments'),
        prevWindowCount('post_votes'), prevWindowCount('saved_posts'),
      ]);
      deltaUsersNew = computeDelta(usersNew, prevCounts[0]);
      deltaPostsCreated = computeDelta(postsCreated, prevCounts[1]);
      deltaEngagement = computeDelta(
        sumAvailableMetrics([votesCount, savedPostsCount, commentsCount]),
        sumAvailableMetrics([prevCounts[2], prevCounts[3], prevCounts[4]])
      );
    }
    throwIfAborted(signal);

    // ── Resolve nomes dos atores do audit log ──
    auditAvailable = !(auditRows && auditRows.__kcAvailable === false);
    await loadActorsById(client, auditRows.map(r => r.actor_id));
    throwIfAborted(signal);
    var auditRequestCurrent = isCurrentAuditRequest(auditRequestSeq);
    if (auditRequestCurrent) {
      _auditOffset = auditRows.length;
    } else if (_data && Array.isArray(_data.auditRows)) {
      auditRows = _data.auditRows.slice();
      auditAvailable = _data.auditAvailable !== false;
      auditFiltersSnapshot = _data.auditFilters || auditFiltersSnapshot;
    } else {
      auditRows = [];
      auditAvailable = false;
    }

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
          auditEvents: auditAvailable ? auditRows.length : null,
          auditAvailable: auditAvailable,
          peakTotal: dailySummary ? dailySummary.peakTotal : 0,
          periodDays: periodDays,
          ads: adOverview
        })
      : [];

    // ── Renderiza resumo executivo ──
    var activeMetric = activeSessions15m || {};
    var healthValue = activeMetric.available
      ? (activeMetric.source === 'privacy_rpc' || activeMetric.source === 'overview_rpc' ? 'OK' : 'Fallback')
      : 'Atenção';
    var healthSubtitle = activeMetric.available
      ? (activeMetric.note || 'Coleta agregada operacional.')
      : (activeMetric.note || 'Coleta agregada indisponível.');
    var executiveMetrics = $('#admin-executive-metrics');
    if (executiveMetrics) {
      executiveMetrics.innerHTML = [
        metricCard('fas fa-users-viewfinder', 'Ativos agora', activeMetric.available ? activeMetric.value : '--', { subtitle: activeMetric.available ? 'Sessões agregadas nos últimos 15min' : 'Sem dado agregado agora', href: 'privacy-analytics.html', tooltip: 'Sessões anônimas distintas com atividade nos últimos 15 minutos (não identifica usuários).' }),
        metricCard('fas fa-eye', 'Publicações visíveis', visiblePosts, { subtitle: 'Status published + closed' }),
        metricCard('fas fa-flag', 'Denúncias abertas', reportMetrics.open, { href: 'reports.html', highlight: true, subtitle: 'Backlog atual, sem recorte temporal' }),
        metricCard('fas fa-stethoscope', 'Saúde da coleta', healthValue, { subtitle: healthSubtitle, href: 'privacy-analytics.html' }),
      ].join('');
    }

    // ── Renderiza métricas de moderação ──
    throwIfAborted(signal);
    const metrics = $('#admin-metrics');
    if (metrics) {
      metrics.innerHTML = [
        metricCard('fas fa-flag',      'Denúncias abertas',    reportMetrics.open,        { href: 'reports.html', highlight: true, subtitle: 'Backlog atual' }),
        metricCard('fas fa-list',      'Denúncias recebidas', reportMetrics.total,       { href: 'reports.html', subtitle: fullLabel }),
        metricCard('fas fa-eye-slash', 'Ocultos atualizados', postStatusMetrics.hidden,  { href: 'moderation.html', subtitle: fullLabel }),
        metricCard('fas fa-trash',     'Deletados atualizados', postStatusMetrics.deleted, { href: 'moderation.html', subtitle: fullLabel }),
      ].join('');
    }

    // ── Renderiza métricas de atividade ──
    const activityMetrics = $('#admin-activity-metrics');
    if (activityMetrics) {
      activityMetrics.innerHTML = [
        metricCard('fas fa-layer-group',      'Total de posts',    postsTotal),
        metricCard('fas fa-eye',              'Posts visíveis',    visiblePosts),
        metricCard('fas fa-plus-circle',      'Posts criados',     postsCreated, { delta: deltaPostsCreated }),
        metricCard('fas fa-pen-to-square',    'Posts anteriores atualizados', postsEdited, { subtitle: 'Criados antes do período; inclui status e renovações' }),
        metricCard('fas fa-comment',          'Comentários',       commentsCount),
        metricCard('fas fa-magnifying-glass', 'Buscas',            searchCount, { subtitle: periodDays > 183 ? 'Retenção disponível: até 6 meses' : fullLabel }),
        metricCard('fas fa-thumbs-up',        'Votos',             votesCount),
        metricCard('fas fa-bookmark',         'Posts salvos',      savedPostsCount),
      ].join('');
    }

    // ── Renderiza métricas da comunidade ──
    const communityMetrics = $('#admin-community-metrics');
    if (communityMetrics) {
      var interactionsTotal = sumAvailableMetrics([votesCount, savedPostsCount, commentsCount]);
      communityMetrics.innerHTML = [
        metricCard('fas fa-users',       'Total de usuários',                   usersTotal),
        metricCard('fas fa-user-plus',   'Novos usuários (' + shortLabel + ')', usersNew, { delta: deltaUsersNew }),
        metricCard('fas fa-chart-line',   'Interações (' + shortLabel + ')',     interactionsTotal, { subtitle: interactionsTotal === null ? 'Uma ou mais fontes estão indisponíveis' : 'Votos + salvos + comentários', delta: deltaEngagement }),
      ].join('');
    }

    // ── Monetização ──
    var ads = adOverview || {};
    var adSettings = ads.settings || {};
    var adCampaigns = ads.campaigns || {};
    var adMetrics = ads.metrics || {};
    var adMode = adSettings.status === null || typeof adSettings.status === 'undefined'
      ? '--'
      : (adSettings.status === 'active' ? 'Ativo' : (adSettings.status === 'testing' ? 'Em teste' : 'Desativado'));
    var adProvider = adSettings.provider === null || typeof adSettings.provider === 'undefined'
      ? null
      : (adSettings.provider === 'hybrid'
          ? 'híbrido'
          : (adSettings.provider === 'adsense' ? 'AdSense' : 'próprio'));
    var adCampaignTotalSubtitle = adCampaigns.total === null || typeof adCampaigns.total === 'undefined'
      ? 'Total indisponível'
      : formatMetricValue(adCampaigns.total) + ' campanhas no total';
    var adCtrSubtitle = adMetrics.ctr === null || typeof adMetrics.ctr === 'undefined'
      ? 'CTR indisponível'
      : 'CTR ' + formatPercentMetric(adMetrics.ctr);
    var adImpressionsSubtitle = adMetrics.impressions === null || typeof adMetrics.impressions === 'undefined'
      ? 'Fonte indisponível no período'
      : fullLabel;
    var monetizationMetrics = $('#admin-monetization-metrics');
    if (monetizationMetrics) {
      monetizationMetrics.innerHTML = [
        metricCard('fab fa-google', 'Modo de anúncios', adMode, { subtitle: adProvider ? 'Provider ' + adProvider : 'Configuração indisponível', href: 'banners.html#feed-ads-admin' }),
        metricCard('fas fa-bullhorn', 'Campanhas ativas', adCampaigns.active, { subtitle: adCampaignTotalSubtitle, href: 'banners.html#feed-ads-admin' }),
        metricCard('fas fa-arrow-pointer', 'Cliques em anúncios', adMetrics.clicks, { subtitle: adCtrSubtitle, href: 'banners.html#feed-ads-admin' }),
        metricCard('fas fa-rectangle-ad', 'Impressões de anúncios', adMetrics.impressions, { subtitle: adImpressionsSubtitle }),
      ].join('');
    }

    // ── Privacidade + Saúde (vinculadas ao período + dados reais do overview) ──
    var metricDiagnostics = (window._KCAD && window._KCAD.__adminMetricsDiagnostics) || {};
    var unavailableMetricKeys = Object.keys(metricDiagnostics).filter(function (key) {
      return metricDiagnostics[key] && metricDiagnostics[key].available === false;
    });
    if (!overview && unavailableMetricKeys.length) {
      showError('Algumas métricas não puderam ser confirmadas e aparecem como “--”. Tente atualizar novamente.');
    }
    var dailyAvailable = !metricDiagnostics.dailyMetrics || metricDiagnostics.dailyMetrics.available !== false;
    var trendsAvailable = !metricDiagnostics.trends || metricDiagnostics.trends.available !== false;
    var adsHealthValue = ads.source === 'rpc'
      ? 'RPC agregada'
      : ads.source === 'fallback'
        ? 'Fallback confirmado'
        : ads.source === 'partial'
          ? 'Fallback parcial'
          : 'Indisponível';
    var adsHealthTone = ads.source === 'rpc' || ads.source === 'fallback' ? null : 'warn';
    var adsHealthNote = ads.source === 'partial'
      ? 'Somente as fontes confirmadas são exibidas; as demais usam “--”.'
      : ads.source === 'unavailable'
        ? 'Nenhuma fonte de campanhas/configuração/eventos respondeu neste carregamento.'
        : 'Campanhas, configuração e eventos agregados de publicidade confirmados.';
    var healthItems = [
      { label: 'Métricas', value: overview ? 'RPC agregada' : (unavailableMetricKeys.length ? 'Loaders parciais' : 'Loaders'), tone: overview ? null : 'warn', note: overview ? 'kc_admin_dashboard_overview respondeu com acesso administrativo validado.' : (unavailableMetricKeys.length ? unavailableMetricKeys.length + ' fonte(s) indisponível(is); valores não confirmados usam “--”.' : 'RPC indisponível; loaders individuais responderam.') },
      { label: 'Pulso diário', value: !dailyAvailable ? 'Indisponível' : ((dailyMetrics && dailyMetrics.length) ? (dailyMetrics.length + ' dias') : 'Sem eventos'), tone: dailyAvailable && dailyMetrics && dailyMetrics.length ? null : 'warn', note: dailyAvailable ? 'Série de atividade consolidada por dia.' : 'Nenhuma fonte temporal respondeu de forma completa.' },
      { label: 'Tendências', value: !trendsAvailable ? 'Indisponível' : ((trends && trends.length) ? (trends.length + ' termos') : 'Sem buscas'), tone: trendsAvailable ? null : 'warn', note: trendsAvailable ? 'Consultas preservam o recorte selecionado.' : 'As fontes com recorte temporal não responderam.' },
      { label: 'Auditoria', value: auditAvailable ? (auditRows.length + ' eventos') : 'Indisponível', tone: auditAvailable ? null : 'warn', note: auditAvailable ? 'Audit log carregado com os filtros aplicados.' : 'A ausência de linhas não representa zero eventos; tente atualizar novamente.' },
      { label: 'Privacidade', value: 'Dados reais', note: 'Eventos/sessões de search_queries + post_view_events (sem perfil individual).' },
      { label: 'Monetização', value: adsHealthValue, tone: adsHealthTone, note: adsHealthNote }
    ];
    if (periodDays > 183) {
      healthItems.push({
        label: 'Cobertura anual',
        value: 'Analytics parcial',
        tone: 'warn',
        note: 'Buscas, visualizações e eventos opcionais têm retenção declarada de até 6 meses; as demais métricas usam o recorte de 365 dias.'
      });
    }
    try {
      if (window._KCAD && window._KCAD.privacy && typeof window._KCAD.privacy.refresh === 'function') {
        window._KCAD.privacy.refresh({
          overview: overview ? overview.privacy : null,
          periodLabel: fullLabel,
          periodDays: periodDays,
          since: since,
          health: healthItems
        });
      }
    } catch (_) { }

    // Publica o snapshot completo antes de renderizar. Assim, o resumo e as
    // exportações leem as mesmas linhas e os mesmos filtros efetivamente aplicados.
    _data = {
      reportMetrics, postStatusMetrics,
      postsCreated, postsEdited, commentsCount, searchCount, postsTotal, visiblePosts,
      usersTotal, usersNew, votesCount, savedPostsCount, activeSessions15m,
      adOverview, auditRows, auditAvailable, auditFilters: auditFiltersSnapshot, trends, periodDays,
      trendsAvailable, dailyMetrics, dailySummary, dailyAvailable, moduleShareRows, alerts,
      periodLabel: fullLabel,
      periodStart: since,
      periodEnd: periodRange.until,
    };

    // ── Renderiza audit log ──
    if (auditRequestCurrent) renderAuditRows(auditRows, false);

    // ── Renderiza tendências de busca ──
    renderSearchTrends(trends, periodDays);
    renderDailyActivitySummary(dailySummary);
    renderDailyActivityChart(dailyMetrics);
    renderModuleShareTable(moduleShareRows);
    renderOperationalAlerts(alerts);
    throwIfAborted(signal);

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
    var access;
    try {
      access = await checkAccess();
    } catch (_) {
      access = { ok: false, message: 'Nao foi possivel validar o acesso administrativo.' };
    }
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
    if (lastSyncEl) {
      lastSyncEl.addEventListener('click', refreshDashboard);
      lastSyncEl.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        refreshDashboard();
      });
    }

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

    await loadChartPrefs();
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

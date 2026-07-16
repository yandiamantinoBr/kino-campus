(function () {
  'use strict';

  window._KCAD = window._KCAD || {};

  var DEFAULT_SERIES_META = [
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

  function getDashboardUtils() {
    return window.KCAdminDashboardUtils || {};
  }

  function select(deps, sel, root) {
    if (deps && typeof deps.$ === 'function') return deps.$(sel, root);
    return (root || document).querySelector(sel);
  }

  function escHtml(deps, value) {
    if (deps && typeof deps.escHtmlAdmin === 'function') return deps.escHtmlAdmin(value);
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') return window.KCUtils.escapeHtml(String(value == null ? '' : value));
    return String(value == null ? '' : value);
  }

  function getSafeAvatarUrl(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw || raw.length > 2048) return '';
    try {
      var base = (window.location && window.location.origin)
        ? window.location.origin
        : 'https://www.kinocampus.com.br';
      var parsed = new URL(raw, base);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
      parsed.username = '';
      parsed.password = '';
      return parsed.href;
    } catch (_) {
      return '';
    }
  }

  function toNumberValue(deps, value) {
    if (deps && typeof deps.toNumber === 'function') return deps.toNumber(value);
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getPeriodLabelValue(deps, days) {
    if (deps && typeof deps.getPeriodLabel === 'function') return deps.getPeriodLabel(days);
    if (days <= 1) return 'hoje';
    if (days <= 7) return 'últimos 7 dias';
    if (days <= 90 && days > 30) return 'últimos 90 dias';
    if (days >= 365) return 'últimos 365 dias';
    return 'últimos ' + (days || 30) + ' dias';
  }

  function getSelectedPeriodDaysValue(deps) {
    if (deps && typeof deps.getSelectedPeriodDays === 'function') return deps.getSelectedPeriodDays();
    return 30;
  }

  function getModuleLabelValue(deps, moduleKey) {
    if (deps && typeof deps.getModuleLabel === 'function') return deps.getModuleLabel(moduleKey);
    var utils = getDashboardUtils();
    var labels = utils.MODULE_LABELS || {};
    return labels[moduleKey] || moduleKey || '';
  }

  function getModuleIconValue(deps, moduleKey) {
    if (deps && typeof deps.getModuleIcon === 'function') return deps.getModuleIcon(moduleKey);
    var utils = getDashboardUtils();
    var icons = utils.MODULE_ICONS || {};
    return icons[moduleKey] || 'fas fa-tag';
  }

  function classifyTermToModuleValue(deps, term) {
    if (deps && typeof deps.classifyTermToModule === 'function') return deps.classifyTermToModule(term);
    var utils = getDashboardUtils();
    if (typeof utils.classifyTermToModule === 'function') {
      return utils.classifyTermToModule(term, window.KC_CONSTANTS || {});
    }
    return null;
  }

  // Módulo do termo priorizando a classificação por conteúdo (servidor) e caindo
  // no dicionário; reusa KCAdminDashboardUtils.resolveTermModule quando disponível.
  function resolveTermModuleValue(deps, trend) {
    if (deps && typeof deps.resolveTermModule === 'function') {
      return deps.resolveTermModule(trend);
    }
    var utils = getDashboardUtils();
    if (typeof utils.resolveTermModule === 'function') {
      return utils.resolveTermModule(trend, window.KC_CONSTANTS || {});
    }
    return classifyTermToModuleValue(deps, trend && trend.term);
  }

  function getSeriesMeta(deps) {
    if (deps && typeof deps.getSeriesMeta === 'function') {
      var seriesMeta = deps.getSeriesMeta();
      if (Array.isArray(seriesMeta) && seriesMeta.length) return seriesMeta;
    }
    return DEFAULT_SERIES_META.slice();
  }

  function getSeriesKeysValue(deps) {
    if (deps && typeof deps.getSeriesKeys === 'function') {
      var seriesKeys = deps.getSeriesKeys();
      if (Array.isArray(seriesKeys) && seriesKeys.length) return seriesKeys;
    }
    return getSeriesMeta(deps).map(function (meta) { return meta.key; });
  }

  function getStateBucket() {
    window._KCAD.__adminChartsState = window._KCAD.__adminChartsState || {};
    return window._KCAD.__adminChartsState;
  }

  function getTrendState() {
    var bucket = getStateBucket();
    bucket.searchTrends = bucket.searchTrends || {
      rows: [],
      periodDays: 30,
      page: 1,
      pageSize: 10,
      module: '',
      query: ''
    };
    return bucket.searchTrends;
  }

  function normalizeSearchText(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function getData(deps) {
    if (deps && typeof deps.getData === 'function') return deps.getData();
    return getStateBucket().data || null;
  }

  function isSourceAvailable(deps, key) {
    var data = getData(deps);
    return !data || data[key] !== false;
  }

  function setData(deps, value) {
    if (deps && typeof deps.setData === 'function') {
      deps.setData(value);
      return;
    }
    getStateBucket().data = value;
  }

  function getChartModalReturnFocus(deps) {
    if (deps && typeof deps.getChartModalReturnFocus === 'function') return deps.getChartModalReturnFocus();
    return getStateBucket().chartModalReturnFocus || null;
  }

  function setChartModalReturnFocus(deps, value) {
    if (deps && typeof deps.setChartModalReturnFocus === 'function') {
      deps.setChartModalReturnFocus(value || null);
      return;
    }
    getStateBucket().chartModalReturnFocus = value || null;
  }

  function getRankingExpanded(deps) {
    if (deps && typeof deps.getRankingExpanded === 'function') return !!deps.getRankingExpanded();
    return !!getStateBucket().rankingExpanded;
  }

  function setRankingExpanded(deps, value) {
    if (deps && typeof deps.setRankingExpanded === 'function') {
      deps.setRankingExpanded(!!value);
      return;
    }
    getStateBucket().rankingExpanded = !!value;
  }

  function getRankingRequestSeq(deps) {
    if (deps && typeof deps.getRankingRequestSeq === 'function') return Number(deps.getRankingRequestSeq()) || 0;
    return Number(getStateBucket().rankingRequestSeq) || 0;
  }

  function setRankingRequestSeq(deps, value) {
    if (deps && typeof deps.setRankingRequestSeq === 'function') {
      deps.setRankingRequestSeq(value);
      return;
    }
    getStateBucket().rankingRequestSeq = Number(value) || 0;
  }

  function bumpRankingRequestSeq(deps) {
    var nextValue = getRankingRequestSeq(deps) + 1;
    setRankingRequestSeq(deps, nextValue);
    return nextValue;
  }

  function refreshExportAvailability(deps) {
    if (deps && typeof deps.refreshExportAvailability === 'function') {
      deps.refreshExportAvailability();
    }
  }

  function setRankingPending(deps, requestSeq, pending) {
    var state = getStateBucket();
    if (pending) {
      state.rankingPending = true;
      state.rankingPendingRequestSeq = requestSeq;
    } else if (Number(state.rankingPendingRequestSeq) === Number(requestSeq)) {
      state.rankingPending = false;
      state.rankingPendingRequestSeq = null;
    }
    refreshExportAvailability(deps);
  }

  function showStatusToast(deps, message, tone, options) {
    if (deps && typeof deps.showStatusToast === 'function') {
      deps.showStatusToast(message, tone, options);
    }
  }

  function aggregateTrendsByModule(trends, deps) {
    var utils = getDashboardUtils();
    if (typeof utils.aggregateTrendsByModule === 'function') {
      return utils.aggregateTrendsByModule(trends, window.KC_CONSTANTS || {});
    }

    var byModule = {};
    (trends || []).forEach(function (trend) {
      var moduleKey = resolveTermModuleValue(deps, trend);
      if (!moduleKey) return;
      if (!byModule[moduleKey]) {
        byModule[moduleKey] = {
          module: moduleKey,
          label: getModuleLabelValue(deps, moduleKey),
          icon: getModuleIconValue(deps, moduleKey),
          count: 0,
          terms: []
        };
      }
      byModule[moduleKey].count += Number(trend && trend.count) || 1;
      if (trend && trend.term) byModule[moduleKey].terms.push(String(trend.term));
    });

    return Object.keys(byModule).map(function (moduleKey) {
      return byModule[moduleKey];
    }).sort(function (a, b) {
      return b.count - a.count;
    });
  }

  function hydrateTrendRows(trends, deps) {
    return (Array.isArray(trends) ? trends : []).map(function (trend) {
      var row = Object.assign({}, trend || {});
      row.__module = resolveTermModuleValue(deps, trend);
      row.__moduleLabel = row.__module ? getModuleLabelValue(deps, row.__module) : '';
      row.__searchText = normalizeSearchText([
        row.term || '',
        row.__module || '',
        row.__moduleLabel || '',
        row.entity || '',
        row.entity_type || '',
        row.post_title || ''
      ].join(' '));
      return row;
    });
  }

  function getFilteredTrendRows(state) {
    var query = normalizeSearchText(state.query || '');
    var moduleFilter = String(state.module || '');
    return (state.rows || []).filter(function (row) {
      if (moduleFilter && row.__module !== moduleFilter) return false;
      if (query && String(row.__searchText || '').indexOf(query) === -1) return false;
      return true;
    });
  }

  function bindSearchTrendControls(deps) {
    var state = getTrendState();
    var queryInput = select(deps, '#admin-trends-query');
    var pageSizeSelect = select(deps, '#admin-trends-page-size');
    var prevBtn = select(deps, '#admin-trends-prev');
    var nextBtn = select(deps, '#admin-trends-next');
    var modulesEl = select(deps, '#admin-trends-modules');

    if (queryInput && !queryInput.dataset.bound) {
      queryInput.dataset.bound = 'true';
      queryInput.addEventListener('input', function () {
        state.query = queryInput.value || '';
        state.page = 1;
        renderSearchTrendPage(deps);
      });
    }

    if (pageSizeSelect && !pageSizeSelect.dataset.bound) {
      pageSizeSelect.dataset.bound = 'true';
      pageSizeSelect.addEventListener('change', function () {
        var value = Number(pageSizeSelect.value) || 10;
        state.pageSize = Math.max(5, Math.min(value, 50));
        state.page = 1;
        renderSearchTrendPage(deps);
      });
    }

    if (prevBtn && !prevBtn.dataset.bound) {
      prevBtn.dataset.bound = 'true';
      prevBtn.addEventListener('click', function () {
        state.page = Math.max(1, (Number(state.page) || 1) - 1);
        renderSearchTrendPage(deps);
      });
    }

    if (nextBtn && !nextBtn.dataset.bound) {
      nextBtn.dataset.bound = 'true';
      nextBtn.addEventListener('click', function () {
        state.page = (Number(state.page) || 1) + 1;
        renderSearchTrendPage(deps);
      });
    }

    if (modulesEl && !modulesEl.dataset.bound) {
      modulesEl.dataset.bound = 'true';
      modulesEl.addEventListener('click', function (event) {
        var target = event && event.target && typeof event.target.closest === 'function'
          ? event.target.closest('[data-trend-module]')
          : null;
        if (!target) return;
        state.module = target.getAttribute('data-trend-module') || '';
        state.page = 1;
        renderSearchTrendPage(deps);
      });
    }
  }

  function renderSearchTrendsByModule(trends, periodDays, deps) {
    var container = select(deps, '#admin-trends-modules');
    if (!container) return;

    var moduleData = aggregateTrendsByModule(trends, deps);
    var state = getTrendState();
    if (!moduleData.length) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    container.style.display = 'flex';
    var periodLabel = getPeriodLabelValue(deps, periodDays || 30);
    var totalCount = (trends || []).reduce(function (acc, row) {
      return acc + (Number(row && row.count) || 0);
    }, 0);
    var titleHtml = '<div class="kc-trend-module-title" style="width:100%;"><i class="fas fa-table-cells" aria-hidden="true"></i> Por módulo (' + escHtml(deps, periodLabel) + ') - clique para filtrar</div>';
    var allButton = '<button type="button" class="kc-trend-module-badge' + (!state.module ? ' is-active' : '') + '" data-trend-module="" aria-pressed="' + (!state.module ? 'true' : 'false') + '" title="Mostrar todos os módulos">'
      + '<i class="fas fa-layer-group" aria-hidden="true"></i> Todos'
      + '<span class="kc-badge-count">' + totalCount + '</span>'
      + '</button>';

    container.innerHTML = titleHtml + allButton + moduleData.map(function (moduleRow) {
      var topTerms = moduleRow.terms.slice(0, 3).map(function (term) {
        return escHtml(deps, term);
      }).join(', ');

      return '<button type="button" class="kc-trend-module-badge' + (state.module === moduleRow.module ? ' is-active' : '') + '" data-trend-module="' + escHtml(deps, moduleRow.module || '') + '" aria-pressed="' + (state.module === moduleRow.module ? 'true' : 'false') + '" title="' + escHtml(deps, topTerms || 'Filtrar por módulo') + '">'
        + '<i class="' + escHtml(deps, moduleRow.icon || getModuleIconValue(deps, moduleRow.module)) + '" aria-hidden="true"></i> ' + escHtml(deps, moduleRow.label || getModuleLabelValue(deps, moduleRow.module))
        + '<span class="kc-badge-count">' + (Number(moduleRow.count) || 0) + '</span>'
        + '</button>';
    }).join('');
  }

  function renderSearchTrendPage(deps) {
    var state = getTrendState();
    var trendsList = select(deps, '#admin-trends-list');
    if (!trendsList) return;

    var filteredRows = getFilteredTrendRows(state);
    var pageSize = Math.max(5, Math.min(Number(state.pageSize) || 10, 50));
    var totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
    state.page = Math.max(1, Math.min(Number(state.page) || 1, totalPages));

    var startIndex = (state.page - 1) * pageSize;
    var pageRows = filteredRows.slice(startIndex, startIndex + pageSize);
    var max = Math.max.apply(null, filteredRows.map(function (trend) {
      return Number(trend && trend.count) || 1;
    }).concat([1]));

    if (!filteredRows.length) {
      trendsList.innerHTML = '<li class="kc-trend-empty">Nenhum termo encontrado para os filtros atuais.</li>';
    } else {
      trendsList.innerHTML = pageRows.map(function (trend, index) {
        var pct = Math.round(((Number(trend && trend.count) || 0) / max) * 100);
        var modKey = trend.__module;
        var modBadge = modKey
          ? '<span style="font-size:.72rem;color:var(--kc-text-dark-secondary);margin-left:4px;" title="' + escHtml(deps, trend.__moduleLabel || getModuleLabelValue(deps, modKey)) + '"><i class="' + escHtml(deps, getModuleIconValue(deps, modKey)) + '" aria-hidden="true"></i></span>'
          : '';

        return '<li class="kc-trend-item">'
          + '<span class="kc-trend-rank">' + (startIndex + index + 1) + '</span>'
          + '<span class="kc-trend-term">' + escHtml(deps, String((trend && trend.term) || '')) + modBadge + '</span>'
          + '<div class="kc-trend-bar-wrap"><div class="kc-trend-bar" style="width:' + pct + '%"></div></div>'
          + '<span class="kc-trend-count">' + (Number(trend && trend.count) || 0) + '</span>'
          + '</li>';
      }).join('');
    }

    var summaryEl = select(deps, '#admin-trends-summary');
    if (summaryEl) {
      var from = filteredRows.length ? startIndex + 1 : 0;
      var to = Math.min(startIndex + pageSize, filteredRows.length);
      var moduleText = state.module ? ' - filtro: ' + getModuleLabelValue(deps, state.module) : '';
      var queryText = state.query ? ' - busca: "' + String(state.query).trim() + '"' : '';
      summaryEl.textContent = 'Mostrando ' + from + '-' + to + ' de ' + filteredRows.length + ' termos' + moduleText + queryText + '.';
    }

    var pageLabel = select(deps, '#admin-trends-page-label');
    if (pageLabel) pageLabel.textContent = 'Página ' + state.page + ' de ' + totalPages;

    var prevBtn = select(deps, '#admin-trends-prev');
    if (prevBtn) prevBtn.disabled = state.page <= 1;
    var nextBtn = select(deps, '#admin-trends-next');
    if (nextBtn) nextBtn.disabled = state.page >= totalPages;

    var pageSizeSelect = select(deps, '#admin-trends-page-size');
    if (pageSizeSelect && String(pageSizeSelect.value || '') !== String(pageSize)) pageSizeSelect.value = String(pageSize);

    renderSearchTrendsByModule(state.rows, state.periodDays, deps);
  }

  function renderSearchTrends(trends, periodDays, deps) {
    var trendsList = select(deps, '#admin-trends-list');
    if (!trendsList) return;
    var sourceAvailable = isSourceAvailable(deps, 'trendsAvailable');

    var state = getTrendState();
    state.rows = hydrateTrendRows(trends, deps);
    state.periodDays = periodDays || 30;
    state.page = 1;
    state.module = '';
    state.query = '';
    state.pageSize = Math.max(5, Math.min(Number(state.pageSize) || 10, 50));

    var queryInput = select(deps, '#admin-trends-query');
    if (queryInput) {
      queryInput.value = '';
      queryInput.disabled = !sourceAvailable;
    }
    var pageSizeSelect = select(deps, '#admin-trends-page-size');
    if (pageSizeSelect) pageSizeSelect.disabled = !sourceAvailable;

    bindSearchTrendControls(deps);

    if (!state.rows.length) {
      trendsList.innerHTML = sourceAvailable
        ? '<li class="kc-trend-empty">Nenhuma busca registrada ainda. As buscas feitas na plataforma aparecerão aqui.</li>'
        : '<li class="kc-trend-empty">Tendências de busca indisponíveis neste carregamento. Tente atualizar novamente.</li>';
      var modContainer = select(deps, '#admin-trends-modules');
      if (modContainer) {
        modContainer.style.display = 'none';
        modContainer.innerHTML = '';
      }
      var coverageEmpty = select(deps, '#admin-trends-coverage');
      if (coverageEmpty) coverageEmpty.textContent = '';
      var summaryEmpty = select(deps, '#admin-trends-summary');
      if (summaryEmpty) {
        summaryEmpty.textContent = sourceAvailable
          ? 'Sem termos no período selecionado.'
          : 'Fonte indisponível; este estado não representa zero buscas.';
      }
      var pageLabelEmpty = select(deps, '#admin-trends-page-label');
      if (pageLabelEmpty) pageLabelEmpty.textContent = 'Página 1 de 1';
      var prevEmpty = select(deps, '#admin-trends-prev');
      if (prevEmpty) prevEmpty.disabled = true;
      var nextEmpty = select(deps, '#admin-trends-next');
      if (nextEmpty) nextEmpty.disabled = true;
      return;
    }

    var totalVolume = state.rows.reduce(function (acc, t) {
      return acc + (Number(t && t.count) || 0);
    }, 0);
    var classifiedVolume = state.rows.reduce(function (acc, t) {
      return acc + (t.__module ? (Number(t && t.count) || 0) : 0);
    }, 0);
    var coverageEl = select(deps, '#admin-trends-coverage');
    if (coverageEl) {
      coverageEl.textContent = (totalVolume > 0 ? Math.round((classifiedVolume / totalVolume) * 100) : 0) + '% do volume classificado';
    }

    renderSearchTrendPage(deps);
  }

  function renderDailyActivitySummary(summary, deps) {
    var container = select(deps, '#admin-daily-activity-summary');
    if (!container) return;

    if (!isSourceAvailable(deps, 'dailyAvailable')) {
      container.innerHTML = '<div class="kc-admin-empty">Pulso diário indisponível neste carregamento. Tente atualizar novamente.</div>';
      return;
    }

    if (!summary) {
      container.innerHTML = '<div class="kc-admin-empty">Sem dados diários para resumir.</div>';
      return;
    }

    var peakLabel = summary.peakDay && summary.peakDay.label ? summary.peakDay.label : '--';

    var momentumPct = summary.momentumPct;
    var momentumDir = summary.momentumDir || 'flat';
    var momentumText;
    var momentumIcon;
    var momentumColor;
    if (momentumPct == null) {
      momentumText = '—';
      momentumIcon = 'fas fa-minus';
      momentumColor = 'var(--kc-text-dark-secondary)';
    } else {
      momentumIcon = momentumDir === 'up' ? 'fas fa-arrow-trend-up' : (momentumDir === 'down' ? 'fas fa-arrow-trend-down' : 'fas fa-minus');
      momentumText = (momentumPct > 0 ? '+' : '') + momentumPct + '%';
      momentumColor = momentumDir === 'up' ? '#22c55e' : (momentumDir === 'down' ? '#ef4444' : 'var(--kc-text-dark-secondary)');
    }

    var activeDays = toNumberValue(deps, summary.activeDays);
    var totalDays = toNumberValue(deps, summary.totalDays);

    container.innerHTML = [
      '<div class="kc-admin-kpi"><span class="kc-admin-kpi__label">Pico diário</span><strong>' + toNumberValue(deps, summary.peakTotal) + '</strong><small>' + escHtml(deps, peakLabel) + '</small></div>',
      '<div class="kc-admin-kpi"><span class="kc-admin-kpi__label">Média diária</span><strong>' + escHtml(deps, String(summary.averageTotal || 0)) + '</strong><small>Ações/dia; sessões e impressões excluídas</small></div>',
      '<div class="kc-admin-kpi"><span class="kc-admin-kpi__label">Momentum</span><strong style="color:' + momentumColor + ';"><i class="' + momentumIcon + '" aria-hidden="true"></i> ' + momentumText + '</strong><small>2ª metade vs. 1ª do período</small></div>',
      '<div class="kc-admin-kpi"><span class="kc-admin-kpi__label">Dias ativos</span><strong>' + activeDays + '</strong><small>de ' + totalDays + ' dias com atividade</small></div>'
    ].join('');
  }

  function buildSeriesPath(series, key, maxValue, width, height, padding, deps) {
    var points = [];
    var innerWidth = width - (padding * 2);
    var innerHeight = height - (padding * 2);
    var step = series.length > 1 ? innerWidth / (series.length - 1) : innerWidth;
    var safeMax = Math.max(maxValue || 0, 1);

    series.forEach(function (row, index) {
      var value = toNumberValue(deps, row && row[key]);
      var x = padding + (step * index);
      var y = padding + innerHeight - ((value / safeMax) * innerHeight);
      points.push((index === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2));
    });

    return points.join(' ');
  }

  function getSeriesTotals(series, deps) {
    var totals = {};
    getSeriesMeta(deps).forEach(function (meta) {
      totals[meta.key] = (series || []).reduce(function (sum, row) {
        return sum + toNumberValue(deps, row && row[meta.key]);
      }, 0);
    });
    return totals;
  }

  // ── Estado de interatividade do gráfico (séries ocultas + busca da legenda) ──
  var LEGEND_SEARCH_THRESHOLD = 7;

  function getHiddenSeries() {
    var bucket = getStateBucket();
    bucket.hiddenSeries = bucket.hiddenSeries || {};
    return bucket.hiddenSeries;
  }

  function isSeriesHidden(key) {
    return !!getHiddenSeries()[key];
  }

  function normalizeSeriesColor(value, fallback) {
    var match = String(value == null ? '' : value).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!match) return fallback || '';
    var hex = match[1].toLowerCase();
    if (hex.length === 3) {
      hex = hex.split('').map(function (part) { return part + part; }).join('');
    }
    return '#' + hex;
  }

  function sanitizeSeriesColors(deps, colors) {
    var source = colors && typeof colors === 'object' ? colors : {};
    var sanitized = {};
    getSeriesMeta(deps).forEach(function (meta) {
      var color = normalizeSeriesColor(source[meta.key], '');
      if (color) sanitized[meta.key] = color;
    });
    return sanitized;
  }

  // Aplica as cores customizadas (salvas pelo admin) sobre o meta base.
  function metaWithColors(deps) {
    var colors = getStateBucket().seriesColors || {};
    return getSeriesMeta(deps).map(function (meta) {
      var baseColor = normalizeSeriesColor(meta.color, '#0f172a');
      var customColor = normalizeSeriesColor(colors[meta.key], '');
      return Object.assign({}, meta, { color: customColor || baseColor });
    });
  }

  function getVisibleSeriesMeta(deps) {
    var hidden = getHiddenSeries();
    return metaWithColors(deps).filter(function (meta) { return !hidden[meta.key]; });
  }

  function toggleSeriesHidden(deps, key) {
    var hidden = getHiddenSeries();
    if (hidden[key]) {
      delete hidden[key];
      return;
    }
    // Nunca deixa o gráfico sem nenhuma série visível.
    var visibleCount = getSeriesMeta(deps).filter(function (meta) { return !hidden[meta.key]; }).length;
    if (visibleCount <= 1) return;
    hidden[key] = true;
  }

  // ── Preferências do admin (séries visíveis + cores), com persistência ──
  // Semeia o estado inicial a partir das preferências salvas (ou do padrão),
  // só uma vez e sem sobrescrever um estado já presente.
  function seedPrefsIfNeeded(deps) {
    var bucket = getStateBucket();
    if (bucket.prefsSeeded) return;
    bucket.prefsSeeded = true;

    var prefs = (deps && typeof deps.getInitialChartPrefs === 'function' && deps.getInitialChartPrefs()) || {};
    if (!bucket.seriesColors) {
      bucket.seriesColors = sanitizeSeriesColors(deps, prefs.colors);
    }
    if (!bucket.hiddenSeries) {
      var allKeys = getSeriesMeta(deps).map(function (m) { return m.key; });
      var visible = (Array.isArray(prefs.visible) && prefs.visible.length)
        ? prefs.visible
        : (deps && typeof deps.getDefaultVisibleSeries === 'function' ? deps.getDefaultVisibleSeries() : allKeys);
      var hidden = {};
      allKeys.forEach(function (k) { if (visible.indexOf(k) === -1) hidden[k] = true; });
      if (allKeys.length && allKeys.every(function (k) { return hidden[k]; })) hidden = {};
      bucket.hiddenSeries = hidden;
    }
  }

  function persistChartPrefs(deps) {
    if (!deps || typeof deps.saveChartPrefs !== 'function') return;
    var bucket = getStateBucket();
    var hidden = bucket.hiddenSeries || {};
    var visible = getSeriesMeta(deps).map(function (m) { return m.key; }).filter(function (k) { return !hidden[k]; });
    try { deps.saveChartPrefs({ visible: visible, colors: bucket.seriesColors || {} }); } catch (_) { }
  }

  // Re-render + persistência + (se aberto) atualização do seletor.
  function afterSeriesChange(deps) {
    applyChartState(deps);
    persistChartPrefs(deps);
    var panel = select(deps, '#admin-series-picker');
    if (panel && panel.getAttribute && panel.getAttribute('data-open') === 'true') renderSeriesPicker(deps);
  }

  function setSeriesColor(deps, key, hex) {
    var normalized = normalizeSeriesColor(hex, '');
    if (!key || !normalized) return;
    var bucket = getStateBucket();
    bucket.seriesColors = bucket.seriesColors || {};
    bucket.seriesColors[key] = normalized;
    applyChartState(deps);
    persistChartPrefs(deps);
  }

  function resetChartPrefs(deps) {
    var bucket = getStateBucket();
    bucket.seriesColors = {};
    var allKeys = getSeriesMeta(deps).map(function (m) { return m.key; });
    var visible = (deps && typeof deps.getDefaultVisibleSeries === 'function') ? deps.getDefaultVisibleSeries() : allKeys;
    var hidden = {};
    allKeys.forEach(function (k) { if (visible.indexOf(k) === -1) hidden[k] = true; });
    bucket.hiddenSeries = hidden;
    afterSeriesChange(deps);
  }

  // Painel "Configurar séries": agrupado por família, com toggle + cor por série.
  function renderSeriesPicker(deps) {
    var panel = select(deps, '#admin-series-picker');
    if (!panel) return;
    var meta = metaWithColors(deps);
    var hidden = getHiddenSeries();
    var groups = [];
    var byFamily = {};
    meta.forEach(function (m) {
      var fam = m.family || 'Outros';
      if (!byFamily[fam]) { byFamily[fam] = []; groups.push(fam); }
      byFamily[fam].push(m);
    });
    var html = '<div class="kc-series-picker__head"><strong>Séries do gráfico</strong>'
      + '<button type="button" class="kc-series-picker__reset" id="admin-series-reset"><i class="fas fa-rotate-left" aria-hidden="true"></i> Restaurar padrão</button></div>';
    groups.forEach(function (fam) {
      html += '<div class="kc-series-picker__group"><div class="kc-series-picker__family">' + escHtml(deps, fam) + '</div>';
      byFamily[fam].forEach(function (m) {
        var on = !hidden[m.key];
        html += '<label class="kc-series-picker__row">'
          + '<input type="checkbox" class="kc-series-picker__toggle"' + (on ? ' checked' : '') + ' data-series-key="' + escHtml(deps, m.key) + '">'
          + '<span class="kc-series-picker__name"><i class="' + escHtml(deps, m.icon) + '" style="color:' + m.color + ';" aria-hidden="true"></i> ' + escHtml(deps, m.label) + '</span>'
          + '<input type="color" class="kc-series-picker__color" value="' + escHtml(deps, m.color) + '" data-series-key="' + escHtml(deps, m.key) + '" aria-label="Cor da série ' + escHtml(deps, m.label) + '">'
          + '</label>';
      });
      html += '</div>';
    });
    panel.innerHTML = html;
  }

  function bindSeriesPicker(deps) {
    var btn = select(deps, '#admin-series-config-btn');
    var panel = select(deps, '#admin-series-picker');

    if (btn && (!btn.dataset || !btn.dataset.bound) && typeof btn.addEventListener === 'function') {
      if (btn.dataset) btn.dataset.bound = 'true';
      btn.addEventListener('click', function () {
        if (!panel) return;
        var open = panel.getAttribute && panel.getAttribute('data-open') === 'true';
        var next = open ? 'false' : 'true';
        if (typeof panel.setAttribute === 'function') panel.setAttribute('data-open', next);
        if (typeof btn.setAttribute === 'function') btn.setAttribute('aria-expanded', next);
        if (next === 'true') renderSeriesPicker(deps);
      });
    }

    if (panel && (!panel.dataset || !panel.dataset.bound) && typeof panel.addEventListener === 'function') {
      if (panel.dataset) panel.dataset.bound = 'true';
      panel.addEventListener('change', function (event) {
        var t = event && event.target;
        if (!t || !t.classList) return;
        var key = t.getAttribute && t.getAttribute('data-series-key');
        if (t.classList.contains('kc-series-picker__toggle')) {
          toggleSeriesHidden(deps, key);
          afterSeriesChange(deps);
        } else if (t.classList.contains('kc-series-picker__color')) {
          setSeriesColor(deps, key, t.value);
        }
      });
      panel.addEventListener('click', function (event) {
        var t = event && event.target;
        var reset = t && typeof t.closest === 'function' ? t.closest('#admin-series-reset') : null;
        if (reset) { resetChartPrefs(deps); renderSeriesPicker(deps); }
      });
    }
  }

  function normalizeLegend(value) {
    var utils = getDashboardUtils();
    if (typeof utils.normalizeText === 'function') return utils.normalizeText(value);
    return String(value == null ? '' : value).toLowerCase();
  }

  function buildDailyActivityLegendMarkup(series, deps, options) {
    options = options || {};
    var totals = getSeriesTotals(series, deps);
    var allMeta = metaWithColors(deps);
    var query = options.query != null ? String(options.query) : '';
    var normalizedQuery = normalizeLegend(query);
    var withSearch = options.withSearch && allMeta.length >= LEGEND_SEARCH_THRESHOLD;

    var items = allMeta.map(function (meta) {
      var hidden = isSeriesHidden(meta.key);
      var matches = !normalizedQuery || normalizeLegend(meta.label).indexOf(normalizedQuery) !== -1;
      return '<button type="button" class="kc-admin-chart-legend__item' + (hidden ? ' is-hidden' : '') + '"'
        + ' data-series-key="' + escHtml(deps, meta.key) + '" aria-pressed="' + (hidden ? 'false' : 'true') + '"'
        + ' title="' + escHtml(deps, (hidden ? 'Mostrar' : 'Ocultar') + ' série: ' + meta.label) + '"'
        + (matches ? '' : ' style="display:none;"') + '>'
        + '<span class="kc-admin-chart-legend__dot" style="background:' + meta.color + ';"></span>'
        + '<span class="kc-admin-chart-legend__label"><i class="' + escHtml(deps, meta.icon) + '" aria-hidden="true"></i> ' + escHtml(deps, meta.label) + '</span>'
        + '<span class="kc-admin-chart-legend__total">' + toNumberValue(deps, totals[meta.key]) + '</span>'
        + '</button>';
    }).join('');

    var search = withSearch
      ? '<div class="kc-admin-chart-legend__search-wrap"><i class="fas fa-magnifying-glass" aria-hidden="true"></i>'
        + '<input type="search" class="kc-admin-chart-legend__search" placeholder="Buscar série..." aria-label="Buscar série no gráfico" value="' + escHtml(deps, query) + '"></div>'
      : '';

    return search + '<div class="kc-admin-chart-legend__items">' + items + '</div>';
  }

  function buildDailyActivityChartSvg(series, options, deps) {
    options = options || {};
    var width = options.width || 640;
    var height = options.height || 240;
    var padding = options.padding || 22;
    var fontSize = options.fontSize || 10;
    var visibleMeta = getVisibleSeriesMeta(deps);
    var innerWidth = width - (padding * 2);
    var innerHeight = height - (padding * 2);
    var step = series.length > 1 ? innerWidth / (series.length - 1) : innerWidth;
    var maxValue = 0;

    series.forEach(function (row) {
      visibleMeta.forEach(function (meta) {
        maxValue = Math.max(maxValue, toNumberValue(deps, row && row[meta.key]));
      });
    });
    var safeMax = Math.max(maxValue || 0, 1);

    var grid = [0, 0.25, 0.5, 0.75, 1].map(function (ratio) {
      var y = padding + (innerHeight * (1 - ratio));
      return '<line x1="' + padding + '" y1="' + y.toFixed(2) + '" x2="' + (width - padding) + '" y2="' + y.toFixed(2) + '" stroke="rgba(148,163,184,.24)" stroke-dasharray="4 4"></line>';
    }).join('');

    var labelStride = Math.max(1, Math.ceil(series.length / 12));
    var labels = series.map(function (row, index) {
      if (index !== 0 && index !== series.length - 1 && index % labelStride !== 0) return '';
      var x = padding + (step * index);
      return '<text x="' + x.toFixed(2) + '" y="' + (height - 6) + '" text-anchor="middle" fill="var(--kc-text-dark-secondary)" font-size="' + fontSize + '">' + escHtml(deps, row && row.label ? row.label : '') + '</text>';
    }).join('');

    var lines = visibleMeta.map(function (meta) {
      return '<path d="' + buildSeriesPath(series, meta.key, maxValue, width, height, padding, deps) + '" fill="none" stroke="' + meta.color + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path>';
    }).join('');

    var points = visibleMeta.map(function (meta) {
      return series.map(function (row, index) {
        var value = toNumberValue(deps, row && row[meta.key]);
        var x = padding + (step * index);
        var y = padding + innerHeight - ((value / safeMax) * innerHeight);
        return '<circle cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="2.6" fill="' + meta.color + '"></circle>';
      }).join('');
    }).join('');

    var guide = '<line class="kc-admin-chart-guide" x1="' + padding + '" y1="' + padding + '" x2="' + padding + '" y2="' + (height - padding) + '" stroke="rgba(255,107,0,.55)" stroke-width="1.2" stroke-dasharray="3 3" style="opacity:0;"></line>';

    var hits = series.map(function (row, index) {
      var x = padding + (step * index);
      var isEdge = index === 0 || index === series.length - 1;
      var bandLeft = index === 0 ? padding : (x - step / 2);
      var bandWidth = series.length === 1 ? innerWidth : (isEdge ? step / 2 : step);
      var accessibleValues = visibleMeta.map(function (meta) {
        return meta.label + ': ' + toNumberValue(deps, row && row[meta.key]);
      }).join(', ');
      return '<rect class="kc-admin-chart-hit" data-index="' + index + '" data-x="' + x.toFixed(2) + '" x="' + bandLeft.toFixed(2) + '" y="' + padding + '" width="' + Math.max(bandWidth, 1).toFixed(2) + '" height="' + innerHeight.toFixed(2) + '" fill="transparent" tabindex="' + (index === 0 ? '0' : '-1') + '" focusable="true" role="button" aria-label="' + escHtml(deps, ((row && row.label) || '') + ': ' + accessibleValues) + '"></rect>';
    }).join('');

    return '<svg class="kc-admin-chart-svg" viewBox="0 0 ' + width + ' ' + height + '" role="group" aria-label="Gráfico diário de atividade; use as setas para navegar entre os dias" preserveAspectRatio="xMidYMid meet">'
      + grid + lines + points + guide
      + '<g class="kc-admin-chart-hits">' + hits + '</g>'
      + labels
      + '</svg>';
  }

  function renderChartInto(container, series, options, deps) {
    if (!container) return;
    if (!Array.isArray(series) || !series.length) {
      container.innerHTML = '<div class="kc-admin-empty">Sem dados suficientes para montar o gráfico diário.</div>';
      return;
    }
    container.innerHTML = buildDailyActivityChartSvg(series, options, deps);
  }

  function ensureTooltip(chartEl) {
    if (!chartEl || typeof chartEl.querySelector !== 'function') return null;
    var tip = chartEl.querySelector('.kc-admin-chart-tooltip');
    if (!tip && typeof document !== 'undefined' && typeof document.createElement === 'function') {
      tip = document.createElement('div');
      tip.className = 'kc-admin-chart-tooltip';
      tip.setAttribute('role', 'status');
      if (tip.style) tip.style.opacity = '0';
      if (typeof chartEl.appendChild === 'function') chartEl.appendChild(tip);
    }
    return tip;
  }

  function buildTooltipHtml(deps, row) {
    var visible = getVisibleSeriesMeta(deps);
    var rows = visible.map(function (meta) {
      return '<div class="kc-admin-chart-tooltip__row">'
        + '<span class="kc-admin-chart-tooltip__dot" style="background:' + meta.color + ';"></span>'
        + '<span class="kc-admin-chart-tooltip__name">' + escHtml(deps, meta.label) + '</span>'
        + '<span class="kc-admin-chart-tooltip__val">' + toNumberValue(deps, row && row[meta.key]) + '</span>'
        + '</div>';
    }).join('');
    return '<div class="kc-admin-chart-tooltip__date">' + escHtml(deps, (row && row.label) || '') + '</div>' + rows;
  }

  // Liga o tooltip de hover ao container do gráfico (delegação — sobrevive a re-renders).
  function bindChartHover(chartEl, deps) {
    if (!chartEl || typeof chartEl.addEventListener !== 'function' || typeof chartEl.querySelector !== 'function') return;
    if (chartEl.dataset && chartEl.dataset.kcHoverBound) return;
    if (chartEl.dataset) chartEl.dataset.kcHoverBound = 'true';

    function hide() {
      var tip = chartEl.querySelector('.kc-admin-chart-tooltip');
      if (tip && tip.style) tip.style.opacity = '0';
      var svg = chartEl.querySelector('svg');
      var guide = svg && typeof svg.querySelector === 'function' ? svg.querySelector('.kc-admin-chart-guide') : null;
      if (guide && guide.style) guide.style.opacity = '0';
    }

    function showHit(hit, event) {
      if (!hit) { hide(); return; }
      var series = getStateBucket().lastSeries || [];
      var row = series[Number(hit.getAttribute('data-index'))];
      if (!row) { hide(); return; }
      var tip = ensureTooltip(chartEl);
      if (!tip) return;
      tip.innerHTML = buildTooltipHtml(deps, row);
      if (typeof chartEl.getBoundingClientRect === 'function' && tip.style) {
        var rect = chartEl.getBoundingClientRect();
        var touch = event && event.touches && event.touches[0] ? event.touches[0] : null;
        var clientX = event && Number.isFinite(event.clientX) && event.clientX
          ? event.clientX
          : (touch ? touch.clientX : null);
        var clientY = event && Number.isFinite(event.clientY) && event.clientY
          ? event.clientY
          : (touch ? touch.clientY : null);
        if (clientX == null || clientY == null) {
          var hitRect = typeof hit.getBoundingClientRect === 'function' ? hit.getBoundingClientRect() : null;
          clientX = hitRect ? hitRect.left + (hitRect.width / 2) : rect.left + 8;
          clientY = hitRect ? hitRect.top + Math.min(hitRect.height / 2, 48) : rect.top + 8;
        }
        var localX = clientX - rect.left;
        var localY = clientY - rect.top;
        var tipW = tip.offsetWidth || 160;
        var left = localX + 14;
        if (left + tipW > rect.width) left = Math.max(8, localX - tipW - 14);
        tip.style.left = left + 'px';
        tip.style.top = Math.max(8, localY - 12) + 'px';
        tip.style.opacity = '1';
      }
      var svg2 = chartEl.querySelector('svg');
      var guide = svg2 && typeof svg2.querySelector === 'function' ? svg2.querySelector('.kc-admin-chart-guide') : null;
      if (guide) {
        var gx = hit.getAttribute('data-x');
        guide.setAttribute('x1', gx);
        guide.setAttribute('x2', gx);
        if (guide.style) guide.style.opacity = '1';
      }
    }

    function move(event) {
      var target = event && event.target;
      var hit = target && typeof target.closest === 'function' ? target.closest('.kc-admin-chart-hit') : null;
      if (!hit) { hide(); return; }
      showHit(hit, event);
    }

    chartEl.addEventListener('mousemove', move);
    chartEl.addEventListener('mouseleave', hide);
    chartEl.addEventListener('touchstart', move, { passive: true });
    chartEl.addEventListener('touchmove', move, { passive: true });
    chartEl.addEventListener('focusin', function (event) {
      var target = event && event.target;
      var hit = target && typeof target.closest === 'function' ? target.closest('.kc-admin-chart-hit') : null;
      if (hit) showHit(hit, event);
    });
    chartEl.addEventListener('focusout', function () {
      window.setTimeout(function () {
        var active = document.activeElement;
        if (!active || !chartEl.contains(active) || !active.closest || !active.closest('.kc-admin-chart-hit')) hide();
      }, 0);
    });
    chartEl.addEventListener('keydown', function (event) {
      var target = event && event.target;
      var hit = target && typeof target.closest === 'function' ? target.closest('.kc-admin-chart-hit') : null;
      if (!hit) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        showHit(hit, event);
        return;
      }
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(event.key) === -1) return;
      var allHits = typeof chartEl.querySelectorAll === 'function'
        ? Array.prototype.slice.call(chartEl.querySelectorAll('.kc-admin-chart-hit'))
        : [];
      if (!allHits.length) return;
      var currentIndex = allHits.indexOf(hit);
      var nextIndex = currentIndex;
      if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = allHits.length - 1;
      else if (event.key === 'ArrowLeft') nextIndex = Math.max(0, currentIndex - 1);
      else if (event.key === 'ArrowRight') nextIndex = Math.min(allHits.length - 1, currentIndex + 1);
      event.preventDefault();
      allHits.forEach(function (item, index) {
        item.setAttribute('tabindex', index === nextIndex ? '0' : '-1');
      });
      if (allHits[nextIndex] && typeof allHits[nextIndex].focus === 'function') allHits[nextIndex].focus();
    });
  }

  // Liga clique (toggle de série) e busca à legenda (delegação no container).
  function bindLegendInteractions(legendEl, deps) {
    if (!legendEl || typeof legendEl.addEventListener !== 'function') return;
    if (legendEl.dataset && legendEl.dataset.kcLegendBound) return;
    if (legendEl.dataset) legendEl.dataset.kcLegendBound = 'true';

    legendEl.addEventListener('click', function (event) {
      var target = event && event.target;
      var btn = target && typeof target.closest === 'function' ? target.closest('[data-series-key]') : null;
      if (!btn) return;
      var key = btn.getAttribute('data-series-key');
      if (!key) return;
      toggleSeriesHidden(deps, key);
      afterSeriesChange(deps);
    });

    legendEl.addEventListener('input', function (event) {
      var target = event && event.target;
      if (!target || !target.classList || !target.classList.contains('kc-admin-chart-legend__search')) return;
      var query = normalizeLegend(target.value || '');
      getStateBucket().legendQuery = target.value || '';
      var items = typeof legendEl.querySelectorAll === 'function' ? legendEl.querySelectorAll('[data-series-key]') : [];
      Array.prototype.forEach.call(items, function (item) {
        var match = !query || normalizeLegend(item.textContent || '').indexOf(query) !== -1;
        if (item.style) item.style.display = match ? '' : 'none';
      });
    });
  }

  // Re-renderiza o gráfico principal e o modal com o estado atual (séries/busca).
  function applyChartState(deps) {
    var series = getStateBucket().lastSeries;
    if (Array.isArray(series) && series.length) {
      renderDailyActivityChart(series, deps);
    }
  }

  function syncDailyActivityChartModal(series, deps) {
    var modalChart = select(deps, '#admin-chart-modal-content');
    var modalLegend = select(deps, '#admin-chart-modal-legend');
    var modalMeta = select(deps, '#admin-chart-modal-meta');
    if (modalChart) {
      renderChartInto(modalChart, series, { width: 1024, height: 420, padding: 28, fontSize: 12 }, deps);
      bindChartHover(modalChart, deps);
    }
    if (modalLegend) {
      modalLegend.innerHTML = Array.isArray(series) && series.length
        ? buildDailyActivityLegendMarkup(series, deps, { withSearch: true, query: getStateBucket().legendQuery || '' })
        : '';
      bindLegendInteractions(modalLegend, deps);
    }
    if (modalMeta) {
      if (Array.isArray(series) && series.length) {
        var data = getData(deps);
        modalMeta.textContent = 'Período analisado: ' + getPeriodLabelValue(deps, (data && data.periodDays) || getSelectedPeriodDaysValue(deps))
          + ' • ' + series.length + ' dias consolidados.';
      } else {
        modalMeta.textContent = 'Visualização detalhada da atividade consolidada por período.';
      }
    }
  }

  function closeDailyActivityChartModal(deps) {
    var modal = select(deps, '#admin-chart-modal');
    if (!modal) return;
    var expandBtn = select(deps, '#admin-chart-expand-btn');

    if (typeof modal.setAttribute === 'function') {
      modal.setAttribute('aria-hidden', 'true');
    }
    if (expandBtn && typeof expandBtn.setAttribute === 'function') {
      expandBtn.setAttribute('aria-expanded', 'false');
    }
    if (window.KCAdminShell && typeof window.KCAdminShell.setModalOpen === 'function') {
      window.KCAdminShell.setModalOpen(false);
    }

    var returnFocus = getChartModalReturnFocus(deps);
    if (returnFocus && typeof returnFocus.focus === 'function') {
      try { returnFocus.focus(); } catch (_) {}
    }
    setChartModalReturnFocus(deps, null);
  }

  function openDailyActivityChartModal(deps) {
    var data = getData(deps);
    if (!data || !Array.isArray(data.dailyMetrics) || !data.dailyMetrics.length) return;

    var modal = select(deps, '#admin-chart-modal');
    var closeBtn = select(deps, '#admin-chart-modal-close');
    if (!modal || !closeBtn) return;

    setChartModalReturnFocus(deps, document.activeElement || null);
    syncDailyActivityChartModal(data.dailyMetrics, deps);
    if (typeof modal.setAttribute === 'function') {
      modal.setAttribute('aria-hidden', 'false');
    }
    var expandBtn = select(deps, '#admin-chart-expand-btn');
    if (expandBtn && typeof expandBtn.setAttribute === 'function') {
      expandBtn.setAttribute('aria-expanded', 'true');
    }
    if (window.KCAdminShell && typeof window.KCAdminShell.setModalOpen === 'function') {
      window.KCAdminShell.setModalOpen(true);
    }
    window.setTimeout(function () {
      if (typeof closeBtn.focus === 'function') {
        try { closeBtn.focus(); } catch (_) {}
      }
    }, 40);
  }

  function bindDailyActivityChartModal(deps) {
    var expandBtn = select(deps, '#admin-chart-expand-btn');
    var closeBtn = select(deps, '#admin-chart-modal-close');
    var modal = select(deps, '#admin-chart-modal');

    if (expandBtn && !expandBtn.dataset.bound) {
      expandBtn.dataset.bound = 'true';
      expandBtn.addEventListener('click', function () {
        openDailyActivityChartModal(deps);
      });
    }

    if (closeBtn && !closeBtn.dataset.bound) {
      closeBtn.dataset.bound = 'true';
      closeBtn.addEventListener('click', function () {
        closeDailyActivityChartModal(deps);
      });
    }

    if (modal && !modal.dataset.bound) {
      modal.dataset.bound = 'true';
      modal.addEventListener('click', function (event) {
        if (event.target === modal) closeDailyActivityChartModal(deps);
      });
    }

    bindSeriesPicker(deps);

    var body = document && document.body ? document.body : null;
    if (body && !body.dataset.adminChartEscBound) {
      body.dataset.adminChartEscBound = 'true';
      document.addEventListener('keydown', function (event) {
        var activeModal = select(deps, '#admin-chart-modal');
        var modalOpen = activeModal && activeModal.getAttribute('aria-hidden') === 'false';
        if (event.key === 'Escape' && modalOpen) {
          closeDailyActivityChartModal(deps);
          return;
        }
        if (event.key !== 'Tab' || !modalOpen || typeof activeModal.querySelectorAll !== 'function') return;
        var focusable = Array.prototype.slice.call(activeModal.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )).filter(function (element) {
          if (element.hidden || (element.hasAttribute && element.hasAttribute('hidden'))) return false;
          if (element.closest && element.closest('[aria-hidden="true"]')) return false;
          var style = window.getComputedStyle ? window.getComputedStyle(element) : null;
          if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
          return typeof element.getClientRects !== 'function' || element.getClientRects().length > 0;
        });
        if (!focusable.length) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });
    }
  }

  function renderDailyActivityChart(series, deps) {
    var chart = select(deps, '#admin-daily-activity-chart');
    var legend = select(deps, '#admin-daily-activity-legend');
    var expandBtn = select(deps, '#admin-chart-expand-btn');
    if (!chart || !legend) return;
    seedPrefsIfNeeded(deps);

    var sourceAvailable = isSourceAvailable(deps, 'dailyAvailable');
    if (!sourceAvailable || !Array.isArray(series) || !series.length) {
      chart.innerHTML = '<div class="kc-admin-empty">'
        + (sourceAvailable
          ? 'Sem dados suficientes para montar o gráfico diário.'
          : 'Gráfico diário indisponível neste carregamento. A ausência de série não representa zero atividade.')
        + '</div>';
      legend.innerHTML = '';
      getStateBucket().lastSeries = [];
      syncDailyActivityChartModal([], deps);
      if (expandBtn) expandBtn.disabled = true;
      closeDailyActivityChartModal(deps);
      return;
    }

    getStateBucket().lastSeries = series;
    renderChartInto(chart, series, { width: 640, height: 260, padding: 24, fontSize: 10 }, deps);
    legend.innerHTML = buildDailyActivityLegendMarkup(series, deps, { withSearch: true, query: getStateBucket().legendQuery || '' });
    bindChartHover(chart, deps);
    bindLegendInteractions(legend, deps);
    syncDailyActivityChartModal(series, deps);
    if (expandBtn) expandBtn.disabled = false;
  }

  function renderModuleShareTable(rows, deps) {
    var container = select(deps, '#admin-module-share-table');
    if (!container) return;

    var sourceAvailable = isSourceAvailable(deps, 'trendsAvailable');
    if (!sourceAvailable || !Array.isArray(rows) || !rows.length) {
      container.innerHTML = '<div class="kc-admin-empty">'
        + (sourceAvailable
          ? 'Sem buscas suficientes para calcular participação por módulo.'
          : 'Participação por módulo indisponível neste carregamento. A fonte de tendências não respondeu.')
        + '</div>';
      return;
    }

    container.innerHTML = '<table><thead><tr><th>Módulo</th><th>Share</th><th>Volume</th></tr></thead><tbody>' +
      rows.map(function (row) {
        var topTerms = Array.isArray(row.topTerms) && row.topTerms.length ? row.topTerms.join(', ') : 'Sem termos associados';
        return '<tr>'
          + '<td><span style="display:inline-flex;align-items:center;gap:8px;"><i class="' + escHtml(deps, row.icon || 'fas fa-tag') + '" aria-hidden="true"></i> ' + escHtml(deps, row.label || row.module || 'Módulo') + '</span><div style="margin-top:4px;font-size:.76rem;color:var(--kc-text-dark-secondary);">' + escHtml(deps, topTerms) + '</div></td>'
          + '<td>' + escHtml(deps, String(row.share || 0)) + '%</td>'
          + '<td>' + toNumberValue(deps, row.count) + '</td>'
          + '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  function renderOperationalAlerts(alerts, deps) {
    var container = select(deps, '#admin-operational-alerts');
    if (!container) return;

    if (!Array.isArray(alerts) || !alerts.length) {
      container.innerHTML = '<li class="kc-admin-empty">Nenhum alerta operacional no momento.</li>';
      return;
    }

    container.innerHTML = alerts.map(function (alert) {
      var toneClass = alert && alert.tone ? 'kc-admin-alert--' + alert.tone : 'kc-admin-alert--neutral';
      return '<li class="kc-admin-alert ' + toneClass + '">'
        + '<strong>' + escHtml(deps, alert && alert.title ? alert.title : 'Atualização') + '</strong>'
        + '<p>' + escHtml(deps, alert && alert.body ? alert.body : '') + '</p>'
        + '</li>';
    }).join('');
  }

  function getRankingWindowContext(days) {
    var utils = getDashboardUtils();
    if (typeof utils.getRankingWindowContext === 'function') {
      return utils.getRankingWindowContext(days);
    }
    var selectedDays = Math.max(1, Number(days) || 30);
    var period = selectedDays <= 1 ? 'day'
      : selectedDays <= 7 ? 'week'
        : selectedDays <= 30 ? 'month'
          : selectedDays <= 90 ? 'quarter'
            : 'year';
    var windowDays = period === 'day' ? 1
      : period === 'week' ? 7
        : period === 'month' ? 30
          : period === 'quarter' ? 90
            : 365;
    return {
      period: period,
      periodDays: windowDays,
      selectedPeriodDays: selectedDays,
      windowDays: windowDays,
      windowType: 'rolling',
      periodLabel: windowDays === 1
        ? 'Últimas 24 horas (janela móvel)'
        : 'Últimos ' + windowDays + ' dias corridos (janela móvel)'
    };
  }

  function mapPeriodToRanking(days) {
    return getRankingWindowContext(days).period;
  }

  function updateRankingPeriodNote(deps, rankingWindow, module, limit) {
    var note = select(deps, '#admin-ranking-period-note');
    if (!note) return;
    var moduleLabel = module ? getModuleLabelValue(deps, module) : 'Todos os módulos';
    note.textContent = 'Ranking: ' + rankingWindow.periodLabel + ' • ' + moduleLabel + ' • Top ' + limit
      + '. Não usa o corte por dia civil do restante do dashboard.';
  }

  function publishRankingSnapshot(rankingWindow, module, limit, rows, status, reason) {
    var rankingRows = Array.isArray(rows) ? rows : [];
    var rankingState = getStateBucket();
    rankingState.lastRanking = rankingRows;
    rankingState.rankingSnapshot = {
      rows: rankingRows,
      context: {
        period: rankingWindow.period,
        periodDays: rankingWindow.periodDays,
        selectedPeriodDays: rankingWindow.selectedPeriodDays,
        windowDays: rankingWindow.windowDays,
        windowType: rankingWindow.windowType,
        periodLabel: rankingWindow.periodLabel,
        module: module || '',
        expanded: limit > 10,
        limit: limit,
        available: status === 'ready',
        status: status,
        reason: reason || null
      }
    };
  }

  async function loadAdminRanking(options, deps) {
    options = options || {};
    var signal = options.signal || null;
    var tableEl = select(deps, '#admin-ranking-table');
    if (!tableEl) return;

    var periodDays = getSelectedPeriodDaysValue(deps);
    var rankingWindow = getRankingWindowContext(periodDays);
    var period = rankingWindow.period;
    var moduleFilter = select(deps, '#admin-ranking-module-filter');
    var module = moduleFilter ? (moduleFilter.value || null) : null;
    var limit = getRankingExpanded(deps) ? 100 : 10;
    var requestSeq = bumpRankingRequestSeq(deps);
    var showAllBtn = select(deps, '#admin-ranking-show-all');

    // Invalida o snapshot anterior no mesmo ciclo síncrono em que o novo
    // contexto é selecionado. Assim, a exportação nunca reutiliza linhas de
    // outro período, módulo ou limite enquanto a atualização está pendente.
    publishRankingSnapshot(rankingWindow, module, limit, [], 'loading', 'request_in_progress');
    setRankingPending(deps, requestSeq, true);
    updateRankingPeriodNote(deps, rankingWindow, module, limit);

    tableEl.innerHTML = '<div class="kc-admin-empty"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Carregando ranking...</div>';
    if (showAllBtn) {
      showAllBtn.style.display = 'none';
      if (typeof showAllBtn.setAttribute === 'function') showAllBtn.setAttribute('aria-expanded', 'false');
    }

    var api = window.KCAPI;
    if (!api || typeof api.getTopContributors !== 'function') {
      publishRankingSnapshot(rankingWindow, module, limit, [], 'unavailable', 'api_unavailable');
      tableEl.innerHTML = '<div class="kc-admin-empty">API indisponível.</div>';
      setRankingPending(deps, requestSeq, false);
      return;
    }

    try {
      var users = await api.getTopContributors(period, module, limit);
      if (requestSeq !== getRankingRequestSeq(deps)) return;
      if (signal && signal.aborted) {
        publishRankingSnapshot(rankingWindow, module, limit, [], 'aborted', 'request_aborted');
        tableEl.innerHTML = '<div class="kc-admin-empty">Atualização cancelada.</div>';
        return;
      }

      // Publica linhas + contexto em uma única operação para que a exportação
      // nunca combine o ranking anterior com o filtro/limite recém-selecionado.
      var rankingRows = Array.isArray(users) ? users : [];
      publishRankingSnapshot(rankingWindow, module, limit, rankingRows, 'ready', null);

      if (!rankingRows.length) {
        tableEl.innerHTML = '<div class="kc-admin-empty">Nenhum contribuidor encontrado no período.</div>';
        if (showAllBtn) {
          showAllBtn.style.display = 'none';
          if (typeof showAllBtn.setAttribute === 'function') showAllBtn.setAttribute('aria-expanded', 'false');
        }
        return;
      }

      var html = '<div class="kc-ranking-table-wrapper"><table class="kc-ranking-score-table">'
        + '<thead><tr>'
        + '<th>#</th><th>Usuário</th><th>Score</th><th title="Publicações"><i class="fas fa-file-alt" aria-hidden="true"></i></th>'
        + '<th title="Votos"><i class="fas fa-thumbs-up" aria-hidden="true"></i></th><th title="Comentários"><i class="fas fa-comment" aria-hidden="true"></i></th>'
        + '<th title="Cupons"><i class="fas fa-ticket" aria-hidden="true"></i></th><th title="Shares"><i class="fas fa-share-nodes" aria-hidden="true"></i></th>'
        + '<th title="Penalidades"><i class="fas fa-flag" aria-hidden="true"></i></th>'
        + '</tr></thead><tbody>';

      rankingRows.forEach(function (user) {
        var name = user && user.display_name ? user.display_name : 'Usuário';
        var avatarSrc = getSafeAvatarUrl(user && user.avatar_url);
        var avatarHtml = avatarSrc
          ? '<img src="' + escHtml(deps, avatarSrc) + '" alt="" style="width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle;" loading="lazy">'
          : '<i class="fas fa-user" style="font-size:0.8em;" aria-hidden="true"></i>';

        html += '<tr>'
          + '<td style="font-weight:700;color:var(--kc-primary-brand);">' + toNumberValue(deps, user && user.rank) + '</td>'
          + '<td style="display:flex;align-items:center;gap:6px;min-width:0;">' + avatarHtml + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(deps, name) + '</span></td>'
          + '<td style="font-weight:700;">' + toNumberValue(deps, user && user.score) + '</td>'
          + '<td>' + toNumberValue(deps, user && user.posts_count) + '</td>'
          + '<td>' + toNumberValue(deps, user && user.votes_received) + '</td>'
          + '<td>' + toNumberValue(deps, user && user.comments_count) + '</td>'
          + '<td>' + toNumberValue(deps, user && user.coupon_clicks) + '</td>'
          + '<td>' + toNumberValue(deps, user && user.share_count) + '</td>'
          + '<td style="color:' + (toNumberValue(deps, user && user.penalties) > 0 ? '#ef5350' : 'inherit') + ';">' + toNumberValue(deps, user && user.penalties) + '</td>'
          + '</tr>';
      });

      html += '</tbody></table></div>';
      tableEl.innerHTML = html;

      if (showAllBtn) {
        if (!getRankingExpanded(deps) && rankingRows.length >= 10) {
          showAllBtn.style.display = 'block';
          showAllBtn.innerHTML = '<i class="fas fa-chevron-down" aria-hidden="true"></i> Mostrar todos';
          if (typeof showAllBtn.setAttribute === 'function') showAllBtn.setAttribute('aria-expanded', 'false');
        } else if (getRankingExpanded(deps)) {
          showAllBtn.style.display = 'block';
          showAllBtn.innerHTML = '<i class="fas fa-chevron-up" aria-hidden="true"></i> Mostrar top 10';
          if (typeof showAllBtn.setAttribute === 'function') showAllBtn.setAttribute('aria-expanded', 'true');
        } else {
          showAllBtn.style.display = 'none';
          if (typeof showAllBtn.setAttribute === 'function') showAllBtn.setAttribute('aria-expanded', 'false');
        }
      }
    } catch (error) {
      if (requestSeq !== getRankingRequestSeq(deps)) return;
      if ((error && error.name === 'AbortError') || (signal && signal.aborted)) {
        publishRankingSnapshot(rankingWindow, module, limit, [], 'aborted', 'request_aborted');
        tableEl.innerHTML = '<div class="kc-admin-empty">Atualização cancelada.</div>';
        return;
      }
      publishRankingSnapshot(rankingWindow, module, limit, [], 'error', 'request_failed');
      tableEl.innerHTML = '<div class="kc-admin-empty">Erro ao carregar ranking.</div>';
      showStatusToast(deps, 'Não foi possível atualizar o ranking agora.', 'error', { duration: 3600 });
    } finally {
      setRankingPending(deps, requestSeq, false);
    }
  }

  function bindAdminRanking(deps) {
    var moduleFilter = select(deps, '#admin-ranking-module-filter');
    if (moduleFilter && !moduleFilter.dataset.bound) {
      moduleFilter.dataset.bound = 'true';
      moduleFilter.addEventListener('change', function () {
        setRankingExpanded(deps, false);
        loadAdminRanking({}, deps);
      });
    }

    var showAllBtn = select(deps, '#admin-ranking-show-all');
    if (showAllBtn && !showAllBtn.dataset.bound) {
      showAllBtn.dataset.bound = 'true';
      showAllBtn.addEventListener('click', function () {
        setRankingExpanded(deps, !getRankingExpanded(deps));
        loadAdminRanking({}, deps);
      });
    }

    var infoBtn = select(deps, '#admin-ranking-info-btn');
    if (infoBtn && !infoBtn.dataset.bound) {
      infoBtn.dataset.bound = 'true';
      infoBtn.addEventListener('click', function () {
        if (window.KCRanking && typeof window.KCRanking.openInfoModal === 'function') {
          window.KCRanking.openInfoModal(infoBtn);
          return;
        }
        if (window.KCRanking && typeof window.KCRanking.ensureInfoModal === 'function') {
          window.KCRanking.ensureInfoModal();
        }
        var modal = document.getElementById('kcRankingInfoModal');
        if (modal && typeof modal.setAttribute === 'function') {
          modal.setAttribute('aria-hidden', 'false');
        }
      });
    }
  }

  window._KCAD.charts = {
    aggregateTrendsByModule: aggregateTrendsByModule,
    bindAdminRanking: bindAdminRanking,
    bindDailyActivityChartModal: bindDailyActivityChartModal,
    loadAdminRanking: loadAdminRanking,
    mapPeriodToRanking: mapPeriodToRanking,
    renderDailyActivityChart: renderDailyActivityChart,
    renderDailyActivitySummary: renderDailyActivitySummary,
    renderModuleShareTable: renderModuleShareTable,
    renderOperationalAlerts: renderOperationalAlerts,
    renderSearchTrends: renderSearchTrends
  };
})();

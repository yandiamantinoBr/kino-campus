(function () {
  'use strict';

  window._KCAD = window._KCAD || {};

  var DEFAULT_SERIES_META = [
    { key: 'posts_count', label: 'Posts', color: '#ff6b00', icon: 'fas fa-layer-group' },
    { key: 'comments_count', label: 'Comentários', color: '#0ea5e9', icon: 'fas fa-comment' },
    { key: 'searches_count', label: 'Buscas', color: '#8b5cf6', icon: 'fas fa-magnifying-glass' },
    { key: 'votes_count', label: 'Votos', color: '#10b981', icon: 'fas fa-thumbs-up' },
    { key: 'admin_actions_count', label: 'Ações admin', color: '#f97316', icon: 'fas fa-shield-halved' },
    { key: 'saves_count', label: 'Salvos', color: '#ec4899', icon: 'fas fa-bookmark' },
    { key: 'reports_count', label: 'Denúncias', color: '#ef4444', icon: 'fas fa-flag' },
    { key: 'signups_count', label: 'Cadastros', color: '#14b8a6', icon: 'fas fa-user-plus' }
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

  function toNumberValue(deps, value) {
    if (deps && typeof deps.toNumber === 'function') return deps.toNumber(value);
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getPeriodLabelValue(deps, days) {
    if (deps && typeof deps.getPeriodLabel === 'function') return deps.getPeriodLabel(days);
    if (days <= 1) return 'hoje';
    if (days <= 7) return 'esta semana';
    if (days <= 90) return 'últimos 90 dias';
    if (days >= 365) return 'este ano';
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

  function getData(deps) {
    if (deps && typeof deps.getData === 'function') return deps.getData();
    return getStateBucket().data || null;
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
      var moduleKey = classifyTermToModuleValue(deps, trend && trend.term);
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

  function renderSearchTrendsByModule(trends, periodDays, deps) {
    var container = select(deps, '#admin-trends-modules');
    if (!container) return;

    var moduleData = aggregateTrendsByModule(trends, deps);
    if (!moduleData.length) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    container.style.display = 'flex';
    var periodLabel = getPeriodLabelValue(deps, periodDays || 30);
    var titleHtml = '<div class="kc-trend-module-title" style="width:100%;"><i class="fas fa-table-cells" aria-hidden="true"></i> Por módulo (' + escHtml(deps, periodLabel) + ')</div>';

    container.innerHTML = titleHtml + moduleData.map(function (moduleRow) {
      var topTerms = moduleRow.terms.slice(0, 3).map(function (term) {
        return escHtml(deps, term);
      }).join(', ');

      return '<span class="kc-trend-module-badge" title="' + escHtml(deps, topTerms) + '">'
        + '<i class="' + escHtml(deps, moduleRow.icon || getModuleIconValue(deps, moduleRow.module)) + '"></i> ' + escHtml(deps, moduleRow.label || getModuleLabelValue(deps, moduleRow.module))
        + '<span class="kc-badge-count">' + (Number(moduleRow.count) || 0) + '</span>'
        + '</span>';
    }).join('');
  }

  function renderSearchTrends(trends, periodDays, deps) {
    var trendsList = select(deps, '#admin-trends-list');
    if (!trendsList) return;

    if (!trends || !trends.length) {
      trendsList.innerHTML = '<li class="kc-trend-empty">Nenhuma busca registrada ainda. As buscas feitas na plataforma aparecerão aqui.</li>';
      var modContainer = select(deps, '#admin-trends-modules');
      if (modContainer) {
        modContainer.style.display = 'none';
        modContainer.innerHTML = '';
      }
      return;
    }

    var max = Math.max.apply(null, trends.map(function (trend) {
      return Number(trend && trend.count) || 1;
    }).concat([1]));

    trendsList.innerHTML = trends.map(function (trend, index) {
      var pct = Math.round(((Number(trend && trend.count) || 0) / max) * 100);
      var modKey = classifyTermToModuleValue(deps, trend && trend.term);
      var modBadge = modKey
        ? '<span style="font-size:.72rem;color:var(--kc-text-dark-secondary);margin-left:4px;" title="' + escHtml(deps, getModuleLabelValue(deps, modKey)) + '"><i class="' + escHtml(deps, getModuleIconValue(deps, modKey)) + '"></i></span>'
        : '';

      return '<li class="kc-trend-item">'
        + '<span class="kc-trend-rank">' + (index + 1) + '</span>'
        + '<span class="kc-trend-term">' + escHtml(deps, String((trend && trend.term) || '')) + modBadge + '</span>'
        + '<div class="kc-trend-bar-wrap"><div class="kc-trend-bar" style="width:' + pct + '%"></div></div>'
        + '<span class="kc-trend-count">' + (Number(trend && trend.count) || 0) + '</span>'
        + '</li>';
    }).join('');

    renderSearchTrendsByModule(trends, periodDays, deps);
  }

  function renderDailyActivitySummary(summary, deps) {
    var container = select(deps, '#admin-daily-activity-summary');
    if (!container) return;

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
      '<div class="kc-admin-kpi"><span class="kc-admin-kpi__label">Média diária</span><strong>' + escHtml(deps, String(summary.averageTotal || 0)) + '</strong><small>Eventos/dia consolidados</small></div>',
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

  function getVisibleSeriesMeta(deps) {
    var hidden = getHiddenSeries();
    return getSeriesMeta(deps).filter(function (meta) { return !hidden[meta.key]; });
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

  function normalizeLegend(value) {
    var utils = getDashboardUtils();
    if (typeof utils.normalizeText === 'function') return utils.normalizeText(value);
    return String(value == null ? '' : value).toLowerCase();
  }

  function buildDailyActivityLegendMarkup(series, deps, options) {
    options = options || {};
    var totals = getSeriesTotals(series, deps);
    var allMeta = getSeriesMeta(deps);
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
        + '<span class="kc-admin-chart-legend__label"><i class="' + escHtml(deps, meta.icon) + '"></i> ' + escHtml(deps, meta.label) + '</span>'
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

    var labels = series.map(function (row, index) {
      if (series.length > 14 && index % 2 === 1 && index !== series.length - 1) return '';
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
      return '<rect class="kc-admin-chart-hit" data-index="' + index + '" data-x="' + x.toFixed(2) + '" x="' + bandLeft.toFixed(2) + '" y="' + padding + '" width="' + Math.max(bandWidth, 1).toFixed(2) + '" height="' + innerHeight.toFixed(2) + '" fill="transparent"></rect>';
    }).join('');

    return '<svg class="kc-admin-chart-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Gráfico diário de atividade" preserveAspectRatio="xMidYMid meet">'
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

    function move(event) {
      var target = event && event.target;
      var hit = target && typeof target.closest === 'function' ? target.closest('.kc-admin-chart-hit') : null;
      if (!hit) { hide(); return; }
      var series = getStateBucket().lastSeries || [];
      var row = series[Number(hit.getAttribute('data-index'))];
      if (!row) { hide(); return; }
      var tip = ensureTooltip(chartEl);
      if (!tip) return;
      tip.innerHTML = buildTooltipHtml(deps, row);
      if (typeof chartEl.getBoundingClientRect === 'function' && tip.style) {
        var rect = chartEl.getBoundingClientRect();
        var localX = (event.clientX || (event.touches && event.touches[0] ? event.touches[0].clientX : 0)) - rect.left;
        var localY = (event.clientY || (event.touches && event.touches[0] ? event.touches[0].clientY : 0)) - rect.top;
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

    chartEl.addEventListener('mousemove', move);
    chartEl.addEventListener('mouseleave', hide);
    chartEl.addEventListener('touchstart', move, { passive: true });
    chartEl.addEventListener('touchmove', move, { passive: true });
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
      applyChartState(deps);
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

    if (typeof modal.setAttribute === 'function') {
      modal.setAttribute('aria-hidden', 'true');
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

    var body = document && document.body ? document.body : null;
    if (body && !body.dataset.adminChartEscBound) {
      body.dataset.adminChartEscBound = 'true';
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeDailyActivityChartModal(deps);
      });
    }
  }

  function renderDailyActivityChart(series, deps) {
    var chart = select(deps, '#admin-daily-activity-chart');
    var legend = select(deps, '#admin-daily-activity-legend');
    var expandBtn = select(deps, '#admin-chart-expand-btn');
    if (!chart || !legend) return;

    if (!Array.isArray(series) || !series.length) {
      chart.innerHTML = '<div class="kc-admin-empty">Sem dados suficientes para montar o gráfico diário.</div>';
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

    if (!Array.isArray(rows) || !rows.length) {
      container.innerHTML = '<div class="kc-admin-empty">Sem buscas suficientes para calcular participação por módulo.</div>';
      return;
    }

    container.innerHTML = '<table><thead><tr><th>Módulo</th><th>Share</th><th>Volume</th></tr></thead><tbody>' +
      rows.map(function (row) {
        var topTerms = Array.isArray(row.topTerms) && row.topTerms.length ? row.topTerms.join(', ') : 'Sem termos associados';
        return '<tr>'
          + '<td><span style="display:inline-flex;align-items:center;gap:8px;"><i class="' + escHtml(deps, row.icon || 'fas fa-tag') + '"></i> ' + escHtml(deps, row.label || row.module || 'Módulo') + '</span><div style="margin-top:4px;font-size:.76rem;color:var(--kc-text-dark-secondary);">' + escHtml(deps, topTerms) + '</div></td>'
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

  function mapPeriodToRanking(days) {
    if (days <= 1) return 'day';
    if (days <= 7) return 'week';
    return 'month';
  }

  async function loadAdminRanking(options, deps) {
    options = options || {};
    var signal = options.signal || null;
    var tableEl = select(deps, '#admin-ranking-table');
    if (!tableEl) return;

    var api = window.KCAPI;
    if (!api || typeof api.getTopContributors !== 'function') {
      tableEl.innerHTML = '<div class="kc-admin-empty">API indisponível.</div>';
      return;
    }

    var periodDays = getSelectedPeriodDaysValue(deps);
    var period = mapPeriodToRanking(periodDays);
    var moduleFilter = select(deps, '#admin-ranking-module-filter');
    var module = moduleFilter ? (moduleFilter.value || null) : null;
    var limit = getRankingExpanded(deps) ? 100 : 10;
    var requestSeq = bumpRankingRequestSeq(deps);

    tableEl.innerHTML = '<div class="kc-admin-empty"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Carregando ranking...</div>';

    try {
      var users = await api.getTopContributors(period, module, limit);
      if ((signal && signal.aborted) || requestSeq !== getRankingRequestSeq(deps)) return;

      var showAllBtn = select(deps, '#admin-ranking-show-all');
      if (!users || !users.length) {
        tableEl.innerHTML = '<div class="kc-admin-empty">Nenhum contribuidor encontrado no período.</div>';
        if (showAllBtn) showAllBtn.style.display = 'none';
        return;
      }

      var html = '<div class="kc-ranking-table-wrapper"><table class="kc-ranking-score-table">'
        + '<thead><tr>'
        + '<th>#</th><th>Usuário</th><th>Score</th><th title="Publicações"><i class="fas fa-file-alt" aria-hidden="true"></i></th>'
        + '<th title="Votos"><i class="fas fa-thumbs-up" aria-hidden="true"></i></th><th title="Comentários"><i class="fas fa-comment" aria-hidden="true"></i></th>'
        + '<th title="Cupons"><i class="fas fa-ticket" aria-hidden="true"></i></th><th title="Shares"><i class="fas fa-share-nodes" aria-hidden="true"></i></th>'
        + '<th title="Penalidades"><i class="fas fa-flag" aria-hidden="true"></i></th>'
        + '</tr></thead><tbody>';

      users.forEach(function (user) {
        var name = user && user.display_name ? user.display_name : 'Usuário';
        var avatarSrc = user && user.avatar_url ? user.avatar_url : '';
        var avatarHtml = avatarSrc
          ? '<img src="' + escHtml(deps, avatarSrc) + '" style="width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle;" loading="lazy">'
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
        if (!getRankingExpanded(deps) && users.length >= 10) {
          showAllBtn.style.display = 'block';
          showAllBtn.innerHTML = '<i class="fas fa-chevron-down" aria-hidden="true"></i> Mostrar todos';
        } else if (getRankingExpanded(deps)) {
          showAllBtn.style.display = 'block';
          showAllBtn.innerHTML = '<i class="fas fa-chevron-up" aria-hidden="true"></i> Mostrar top 10';
        } else {
          showAllBtn.style.display = 'none';
        }
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      if ((signal && signal.aborted) || requestSeq !== getRankingRequestSeq(deps)) return;
      tableEl.innerHTML = '<div class="kc-admin-empty">Erro ao carregar ranking.</div>';
      showStatusToast(deps, 'Não foi possível atualizar o ranking agora.', 'error', { duration: 3600 });
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

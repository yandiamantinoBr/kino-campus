(function () {
  'use strict';

  window._KCAD = window._KCAD || {};

  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var XLSX_URLS = [
    '../assets/vendor/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
  ];
  var JSPDF_URLS = [
    '../assets/vendor/jspdf.umd.min.js',
    'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
    'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js'
  ];
  var DEFAULT_SERIES_META = [
    { key: 'posts_count', label: 'Posts', color: '#ff6b00', icon: 'fas fa-layer-group' },
    { key: 'comments_count', label: 'Comentários', color: '#0ea5e9', icon: 'fas fa-comment' },
    { key: 'searches_count', label: 'Buscas', color: '#8b5cf6', icon: 'fas fa-magnifying-glass' },
    { key: 'votes_count', label: 'Votos', color: '#10b981', icon: 'fas fa-thumbs-up' },
    { key: 'admin_actions_count', label: 'Ações admin', color: '#f97316', icon: 'fas fa-shield-halved' }
  ];

  function select(deps, sel, root) {
    if (deps && typeof deps.$ === 'function') return deps.$(sel, root);
    return (root || document).querySelector(sel);
  }

  function escHtml(deps, value) {
    if (deps && typeof deps.escHtmlAdmin === 'function') return deps.escHtmlAdmin(value);
    return String(value == null ? '' : value);
  }

  function toNumberValue(deps, value) {
    if (deps && typeof deps.toNumber === 'function') return deps.toNumber(value);
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatDateTimeBRValue(deps, value) {
    if (deps && typeof deps.formatDateTimeBR === 'function') return deps.formatDateTimeBR(value);
    if (!value) return '-';
    var date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('pt-BR');
  }

  function formatDateBRValue(deps, value) {
    if (deps && typeof deps.formatDateBR === 'function') return deps.formatDateBR(value);
    if (!value) return '-';
    var date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('pt-BR');
  }

  function getPeriodLabelValue(deps, days) {
    if (deps && typeof deps.getPeriodLabel === 'function') return deps.getPeriodLabel(days);
    if (days === 1) return 'hoje';
    if (days === 7) return 'esta semana';
    if (days === 90) return 'últimos 90 dias';
    if (days === 365) return 'este ano';
    return 'últimos ' + (days || 30) + ' dias';
  }

  function getPeriodRangeValue(deps, days) {
    if (deps && typeof deps.getPeriodRange === 'function') return deps.getPeriodRange(days);
    return {
      since: null,
      until: new Date().toISOString(),
      label: getPeriodLabelValue(deps, days)
    };
  }

  function getSelectedPeriodDaysValue(deps) {
    if (deps && typeof deps.getSelectedPeriodDays === 'function') return deps.getSelectedPeriodDays();
    return 30;
  }

  function getClient(deps) {
    if (deps && typeof deps.getClient === 'function') return deps.getClient();
    if (window.KCSupabase && typeof window.KCSupabase.getClient === 'function') return window.KCSupabase.getClient();
    return null;
  }

  function getAuditPageSize(deps) {
    if (deps && typeof deps.getAuditPageSize === 'function') return deps.getAuditPageSize();
    return 20;
  }

  function getScriptLoadTimeoutMs(deps) {
    if (deps && typeof deps.getScriptLoadTimeoutMs === 'function') return deps.getScriptLoadTimeoutMs();
    return 8000;
  }

  function getStateBucket() {
    window._KCAD.__adminAuditState = window._KCAD.__adminAuditState || {};
    return window._KCAD.__adminAuditState;
  }

  function getActorCache(deps) {
    if (deps && typeof deps.getActorCache === 'function') {
      var cache = deps.getActorCache();
      if (cache && typeof cache === 'object') return cache;
    }
    var state = getStateBucket();
    state.actorsById = state.actorsById || {};
    return state.actorsById;
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

  function getAuditOffset(deps) {
    if (deps && typeof deps.getAuditOffset === 'function') return deps.getAuditOffset();
    return getStateBucket().auditOffset || 0;
  }

  function setAuditOffset(deps, value) {
    if (deps && typeof deps.setAuditOffset === 'function') {
      deps.setAuditOffset(value);
      return;
    }
    getStateBucket().auditOffset = Number(value) || 0;
  }

  function getExportBound(deps) {
    if (deps && typeof deps.getExportBound === 'function') return deps.getExportBound();
    return !!getStateBucket().exportBound;
  }

  function setExportBound(deps, value) {
    if (deps && typeof deps.setExportBound === 'function') {
      deps.setExportBound(value);
      return;
    }
    getStateBucket().exportBound = !!value;
  }

  function getAuditControlsBound(deps) {
    if (deps && typeof deps.getAuditControlsBound === 'function') return deps.getAuditControlsBound();
    return !!getStateBucket().auditControlsBound;
  }

  function setAuditControlsBound(deps, value) {
    if (deps && typeof deps.setAuditControlsBound === 'function') {
      deps.setAuditControlsBound(value);
      return;
    }
    getStateBucket().auditControlsBound = !!value;
  }

  function getXlsxLoadPromise(deps) {
    if (deps && typeof deps.getXlsxLoadPromise === 'function') return deps.getXlsxLoadPromise();
    return getStateBucket().xlsxLoadPromise || null;
  }

  function setXlsxLoadPromise(deps, promise) {
    if (deps && typeof deps.setXlsxLoadPromise === 'function') {
      deps.setXlsxLoadPromise(promise);
      return;
    }
    getStateBucket().xlsxLoadPromise = promise || null;
  }

  function getJspdfLoadPromise(deps) {
    if (deps && typeof deps.getJspdfLoadPromise === 'function') return deps.getJspdfLoadPromise();
    return getStateBucket().jspdfLoadPromise || null;
  }

  function setJspdfLoadPromise(deps, promise) {
    if (deps && typeof deps.setJspdfLoadPromise === 'function') {
      deps.setJspdfLoadPromise(promise);
      return;
    }
    getStateBucket().jspdfLoadPromise = promise || null;
  }

  function showError(deps, message) {
    if (deps && typeof deps.showError === 'function') deps.showError(message);
  }

  function showStatusToast(deps, message, tone, options) {
    if (deps && typeof deps.showStatusToast === 'function') deps.showStatusToast(message, tone, options);
  }

  function hideStatusToast(deps) {
    if (deps && typeof deps.hideStatusToast === 'function') deps.hideStatusToast();
  }

  function getModuleLabelValue(deps, moduleKey) {
    if (deps && typeof deps.getModuleLabel === 'function') return deps.getModuleLabel(moduleKey);
    return moduleKey || '';
  }

  function classifyTermToModuleValue(deps, term) {
    if (deps && typeof deps.classifyTermToModule === 'function') return deps.classifyTermToModule(term);
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

  function getSeriesTotalsValue(deps, series) {
    if (deps && typeof deps.getSeriesTotals === 'function') return deps.getSeriesTotals(series);
    var totals = {};
    getSeriesMeta(deps).forEach(function (meta) {
      totals[meta.key] = (series || []).reduce(function (sum, row) {
        return sum + toNumberValue(deps, row && row[meta.key]);
      }, 0);
    });
    return totals;
  }

  function hexToRgbValue(deps, hex) {
    if (deps && typeof deps.hexToRgb === 'function') return deps.hexToRgb(hex);
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

  function isPermissionError(error) {
    if (!error) return false;
    var message = String(error.message || error.details || error.hint || '').toLowerCase();
    return message.includes('permission') || message.includes('row-level security') || message.includes('rls');
  }

  function isFunctionMissing(error) {
    if (!error) return false;
    var code = String(error.code || '');
    var message = String(error.message || error.details || error.hint || '').toLowerCase();
    return code === '42883' || (message.includes('function') && message.includes('does not exist'));
  }

  function isFunctionAmbiguityError(error) {
    if (!error) return false;
    var code = String(error.code || '');
    var message = String(error.message || error.hint || '').toLowerCase();
    return code === '42725' || message.includes('is not unique') || message.includes('ambiguous');
  }

  function normalizeAuditFilters(input) {
    var source = (input && typeof input === 'object' && !Array.isArray(input)) ? input : { action: input };
    var action = String(source.action || source.actionFilter || 'all').trim() || 'all';
    var entityType = String(source.entityType || source.entity_type || 'all').trim() || 'all';
    var actorQuery = String(source.actorQuery || source.actor_query || '').trim();
    return {
      action: action,
      entityType: entityType,
      actorQuery: actorQuery,
    };
  }

  function readAuditFilters(deps) {
    var actionEl = select(deps, '#admin-audit-filter');
    var entityEl = select(deps, '#admin-audit-entity-filter');
    var actorEl = select(deps, '#admin-audit-actor-filter');
    return normalizeAuditFilters({
      action: actionEl ? actionEl.value : 'all',
      entityType: entityEl ? entityEl.value : 'all',
      actorQuery: actorEl ? actorEl.value : '',
    });
  }

  function auditFiltersLabel(filters) {
    var f = normalizeAuditFilters(filters);
    var parts = [];
    if (f.action && f.action !== 'all') parts.push('ação ' + f.action);
    if (f.entityType && f.entityType !== 'all') parts.push('entidade ' + f.entityType);
    if (f.actorQuery) parts.push('ator "' + f.actorQuery + '"');
    return parts.length ? parts.join(' · ') : 'sem filtros ativos';
  }

  function compactAuditPayload(payload) {
    var source = payload && typeof payload === 'object' ? payload : null;
    var parts = [];
    var keys;
    if (!source) return '';
    if (source.source) parts.push('origem: ' + source.source);
    if (source.old_status || source.new_status) {
      parts.push('status: ' + (source.old_status || '-') + ' → ' + (source.new_status || '-'));
    } else if ((source.before && source.before.status) || (source.after && source.after.status)) {
      parts.push('status: ' + ((source.before && source.before.status) || '-') + ' → ' + ((source.after && source.after.status) || '-'));
    }
    if (source.reason) parts.push('motivo: ' + source.reason);
    if (Array.isArray(source.fields) && source.fields.length) parts.push('campos: ' + source.fields.join(', '));
    if (source.post_author_id) parts.push('autor do post: ' + String(source.post_author_id).slice(0, 8) + '...');
    if (parts.length) return parts.join(' | ');
    try {
      keys = Object.keys(source);
      if (keys.length) return JSON.stringify(source).slice(0, 220);
    } catch (_) { }
    return '';
  }

  function renderAuditSummary(rows, filters, deps) {
    var el = select(deps, '#admin-audit-summary');
    var list = Array.isArray(rows) ? rows : [];
    if (!el) return;
    el.textContent = list.length + (list.length === 1 ? ' evento carregado' : ' eventos carregados') + ' · ' + auditFiltersLabel(filters);
  }

  function setAuditLoadMoreState(options, deps) {
    options = options || {};
    var btn = select(deps, '#admin-audit-load-more');
    if (!btn) return;
    if (!btn.dataset.defaultLabel) {
      btn.dataset.defaultLabel = btn.textContent || 'Carregar mais';
    }
    if (typeof options.visible === 'boolean') {
      btn.style.display = options.visible ? '' : 'none';
    }
    if (typeof options.disabled === 'boolean') {
      btn.disabled = options.disabled;
    }
    if (options.label) {
      btn.textContent = options.label;
    } else if (!options.preserveLabel) {
      btn.textContent = btn.dataset.defaultLabel;
    }
  }

  async function loadActorsById(client, actorIds, deps) {
    var ids = [];
    var cache = getActorCache(deps);
    (actorIds || []).forEach(function (id) {
      var value = String(id || '');
      if (UUID_RE.test(value) && !cache[value] && ids.indexOf(value) === -1) ids.push(value);
    });
    if (!ids.length) return;
    try {
      var result = await client.from('profiles')
        .select('id, display_name, full_name')
        .in('id', ids);
      if (!result.error && Array.isArray(result.data)) {
        result.data.forEach(function (row) {
          cache[row.id] = {
            display_name: row.display_name || '',
            full_name: row.full_name || ''
          };
        });
      }
    } catch (_) { }
  }

  function getActorDisplay(actorId, deps) {
    if (!actorId) return 'system';
    var cache = getActorCache(deps);
    var actor = cache[actorId];
    if (actor) {
      var name = actor.display_name || actor.full_name;
      if (name) return name;
    }
    return String(actorId).slice(0, 8) + '...';
  }

  async function loadAuditLog(client, limit, offset, actionFilter, since) {
    limit = limit || 20;
    offset = offset || 0;
    var filters = normalizeAuditFilters(actionFilter);

    function filterRows(rows) {
      var sinceMs = since ? new Date(since).getTime() : 0;
      var actorQuery = String(filters.actorQuery || '').toLowerCase();
      return (rows || []).filter(function (row) {
        if (!row) return false;
        if (filters.action && filters.action !== 'all' && row.action !== filters.action) return false;
        if (filters.entityType && filters.entityType !== 'all' && row.entity_type !== filters.entityType) return false;
        if (actorQuery && String(row.actor_id || '').toLowerCase().indexOf(actorQuery) === -1) return false;
        if (sinceMs && row.created_at && new Date(row.created_at).getTime() < sinceMs) return false;
        return true;
      });
    }

    try {
      var canUseDirectActorFilter = !filters.actorQuery || UUID_RE.test(filters.actorQuery);
      var query = client.from('audit_log')
        .select('created_at, action, entity_type, entity_id, actor_id, payload')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (filters.action && filters.action !== 'all') query = query.eq('action', filters.action);
      if (filters.entityType && filters.entityType !== 'all') query = query.eq('entity_type', filters.entityType);
      if (filters.actorQuery && canUseDirectActorFilter) query = query.eq('actor_id', filters.actorQuery);
      if (since) query = query.gte('created_at', since);

      if (canUseDirectActorFilter) {
        var result = await query;
        if (!result.error) return Array.isArray(result.data) ? result.data : [];
        if (!isPermissionError(result.error)) {
          console.warn('[Admin audit] Direct query failed:', result.error.message || result.error);
        }
      }
    } catch (error) {
      console.warn('[Admin audit] Direct query exception:', error && error.message ? error.message : error);
    }

    try {
      var rpc = await client.rpc('kc_admin_list_audit_logs', {
        p_entity_type: filters.entityType && filters.entityType !== 'all' ? filters.entityType : 'all',
        p_action: filters.action && filters.action !== 'all' ? filters.action : 'all',
        p_actor_query: filters.actorQuery || null,
        p_limit: limit,
        p_offset: offset,
        p_since: since || null
      });
      if (!rpc.error && Array.isArray(rpc.data)) return rpc.data;
      if (!(isFunctionMissing(rpc.error) || isFunctionAmbiguityError(rpc.error))) {
        console.warn('[Admin audit] New RPC failed:', rpc.error && (rpc.error.message || rpc.error));
      }
    } catch (error2) {
      console.warn('[Admin audit] New RPC exception:', error2 && error2.message ? error2.message : error2);
    }

    try {
      var legacyRpc = await client.rpc('kc_admin_list_audit_logs', {
        p_entity_type: filters.entityType && filters.entityType !== 'all' ? filters.entityType : 'all',
        p_action: filters.action && filters.action !== 'all' ? filters.action : 'all',
        p_actor_query: filters.actorQuery || null,
        p_limit: Math.max(limit + offset, 150)
      });
      if (!legacyRpc.error && Array.isArray(legacyRpc.data)) {
        return filterRows(legacyRpc.data).slice(offset, offset + limit);
      }
      if (legacyRpc.error) {
        console.warn('[Admin audit] Legacy RPC failed:', legacyRpc.error.message || legacyRpc.error);
      }
    } catch (error3) {
      console.warn('[Admin audit] Legacy RPC exception:', error3 && error3.message ? error3.message : error3);
    }

    return [];
  }

  function auditActionBadge(action, deps) {
    var a = String(action || '').toLowerCase();
    var cls = 'kc-audit-badge--default';
    var label = action || '-';
    if (a.includes('edited')) { cls = 'kc-audit-badge--restored'; label = 'Editado'; }
    else if (a.includes('renew')) { cls = 'kc-audit-badge--restored'; label = 'Renovado'; }
    else if (a.includes('bump')) { cls = 'kc-audit-badge--restored'; label = 'Impulsionado'; }
    else if (a.includes('reactivat')) { cls = 'kc-audit-badge--restored'; label = 'Reativado'; }
    else if (a === 'post_closed') { cls = 'kc-audit-badge--hidden'; label = 'Encerrado'; }
    else if (a.includes('delet')) { cls = 'kc-audit-badge--deleted'; label = 'Deletado'; }
    else if (a.includes('hidden') || a.includes('oculto')) { cls = 'kc-audit-badge--hidden'; label = 'Ocultado'; }
    else if (a.includes('restored') || a.includes('restaur')) { cls = 'kc-audit-badge--restored'; label = 'Restaurado'; }
    else if (a.includes('report') || a.includes('closed')) { cls = 'kc-audit-badge--report'; label = 'Denúncia'; }
    else if (a.includes('status')) { cls = 'kc-audit-badge--hidden'; label = 'Status'; }
    return '<span class="kc-audit-badge ' + cls + '" title="' + escHtml(deps, action || '') + '">' + escHtml(deps, label) + '</span>';
  }

  function renderAuditRows(rows, append, deps) {
    var auditBody = select(deps, '#admin-audit-body');
    if (!auditBody) return;
    var list = Array.isArray(rows) ? rows : [];
    if (append && !list.length) {
      setAuditLoadMoreState({ visible: true, disabled: true, label: 'Fim do histórico', preserveLabel: true }, deps);
      return;
    }

    var html = list.length
      ? list.map(function (row) {
          var entity = String((row && row.entity_type) || '-');
          var entityDisplay = entity.length > 28 ? entity.slice(0, 25) + '...' : entity;
          var entityId = String((row && row.entity_id) || '');
          var entityIdDisplay = entityId ? (entityId.length > 14 ? entityId.slice(0, 8) + '...' : entityId) : '-';
          var details = compactAuditPayload(row && row.payload);
          return '<tr>'
            + '<td data-label="Data" style="white-space:nowrap;">' + escHtml(deps, formatDateTimeBRValue(deps, row && row.created_at)) + '</td>'
            + '<td data-label="Ação">' + auditActionBadge(row && row.action, deps) + '</td>'
            + '<td data-label="Entidade" title="' + escHtml(deps, entity) + '"><code>' + escHtml(deps, entityDisplay) + '</code></td>'
            + '<td data-label="ID" title="' + escHtml(deps, entityId) + '"><code>' + escHtml(deps, entityIdDisplay) + '</code></td>'
            + '<td data-label="Ator" title="' + escHtml(deps, row && row.actor_id ? row.actor_id : '') + '">' + escHtml(deps, getActorDisplay(row && row.actor_id, deps)) + '</td>'
            + '<td data-label="Detalhes" title="' + escHtml(deps, details) + '">' + escHtml(deps, details || '-') + '</td>'
            + '</tr>';
        }).join('')
      : '<tr><td colspan="6" style="padding:20px 8px;"><p class="kc-empty" style="margin:0;color:var(--kc-text-dark-secondary);">Nenhum resultado.</p></td></tr>';

    if (append) {
      auditBody.insertAdjacentHTML('beforeend', html);
    } else {
      auditBody.innerHTML = html;
    }

    var pageSize = getAuditPageSize(deps);
    setAuditLoadMoreState({
      visible: true,
      disabled: list.length < pageSize,
      label: list.length < pageSize ? 'Fim do histórico' : null
    }, deps);
    renderAuditSummary(
      append ? ((getData(deps) && Array.isArray(getData(deps).auditRows)) ? getData(deps).auditRows.concat(list) : list) : list,
      readAuditFilters(deps),
      deps
    );
  }

  function loadScript(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      var timer = null;
      var finished = false;

      function cleanup() {
        if (timer) clearTimeout(timer);
        script.onload = null;
        script.onerror = null;
      }

      function fail(error) {
        if (finished) return;
        finished = true;
        cleanup();
        try {
          if (script.parentNode) script.parentNode.removeChild(script);
        } catch (_) { }
        reject(error);
      }

      function succeed() {
        if (finished) return;
        finished = true;
        cleanup();
        resolve();
      }

      script.src = url;
      if (url.indexOf('http') === 0) script.crossOrigin = 'anonymous';
      script.onload = succeed;
      script.onerror = function () { fail(new Error('Falha ao carregar: ' + url)); };
      timer = setTimeout(function () {
        fail(new Error('Timeout ao carregar: ' + url));
      }, timeoutMs || 8000);
      document.head.appendChild(script);
    });
  }

  async function loadScriptWithFallback(urls, label, deps) {
    var lastError;
    showStatusToast(deps, 'Carregando biblioteca de exportação...', 'info', { sticky: true });
    try {
      for (var i = 0; i < urls.length; i += 1) {
        try {
          await loadScript(urls[i], getScriptLoadTimeoutMs(deps));
          hideStatusToast(deps);
          return;
        } catch (error) {
          lastError = error;
          console.warn('[CDN fallback] ' + error.message);
        }
      }
    } finally {
      if (!window.XLSX && !window.jspdf) {
        hideStatusToast(deps);
      }
    }
    showStatusToast(
      deps,
      'Falha ao carregar ' + (label || 'a biblioteca de exportação') + ' após ' + urls.length + ' tentativas.',
      'error',
      { duration: 4800 }
    );
    throw lastError || new Error('Todas as fontes falharam.');
  }

  async function ensureXLSX(deps) {
    if (window.XLSX) return;
    var loadPromise = getXlsxLoadPromise(deps);
    if (!loadPromise) {
      loadPromise = loadScriptWithFallback(XLSX_URLS, 'a biblioteca XLSX', deps).finally(function () {
        if (!window.XLSX) setXlsxLoadPromise(deps, null);
      });
      setXlsxLoadPromise(deps, loadPromise);
    }
    await loadPromise;
  }

  async function ensureJsPDF(deps) {
    if (window.jspdf) return;
    var loadPromise = getJspdfLoadPromise(deps);
    if (!loadPromise) {
      loadPromise = loadScriptWithFallback(JSPDF_URLS, 'a biblioteca jsPDF', deps).finally(function () {
        if (!window.jspdf) setJspdfLoadPromise(deps, null);
      });
      setJspdfLoadPromise(deps, loadPromise);
    }
    await loadPromise;
  }

  function buildSummarySheetRows(data, periodLabel, generatedAt, deps) {
    return [
      ['KinoCampus - Dashboard Administrativo'],
      ['Gerado em', generatedAt],
      ['Período selecionado', periodLabel],
      ['Data inicial', formatDateBRValue(deps, data.periodStart)],
      ['Data final', formatDateBRValue(deps, data.periodEnd)],
      [],
      ['Seção', 'Métrica', 'Valor'],
      ['Moderação', 'Denúncias abertas', toNumberValue(deps, data.reportMetrics && data.reportMetrics.open)],
      ['Moderação', 'Total de denúncias', toNumberValue(deps, data.reportMetrics && data.reportMetrics.total)],
      ['Moderação', 'Posts ocultados', toNumberValue(deps, data.postStatusMetrics && data.postStatusMetrics.hidden)],
      ['Moderação', 'Posts deletados', toNumberValue(deps, data.postStatusMetrics && data.postStatusMetrics.deleted)],
      ['Atividade', 'Total de posts', toNumberValue(deps, data.postsTotal)],
      ['Atividade', 'Posts publicados', toNumberValue(deps, data.postsCreated)],
      ['Atividade', 'Posts editados', toNumberValue(deps, data.postsEdited)],
      ['Atividade', 'Comentários', toNumberValue(deps, data.commentsCount)],
      ['Atividade', 'Buscas realizadas', toNumberValue(deps, data.searchCount)],
      ['Comunidade', 'Total de usuários', toNumberValue(deps, data.usersTotal)],
      ['Comunidade', 'Novos usuários', toNumberValue(deps, data.usersNew)],
      ['Comunidade', 'Votos', toNumberValue(deps, data.votesCount)],
      ['Comunidade', 'Posts salvos', toNumberValue(deps, data.savedPostsCount)],
      ['Pulso diário', 'Pico diário', toNumberValue(deps, data.dailySummary && data.dailySummary.peakTotal)],
      ['Pulso diário', 'Média diária', data.dailySummary ? (data.dailySummary.averageTotal || 0) : 0],
      ['Pulso diário', 'Último dia', toNumberValue(deps, data.dailySummary && data.dailySummary.lastDayTotal)],
      ['Pulso diário', 'Total de buscas', toNumberValue(deps, data.dailySummary && data.dailySummary.totals && data.dailySummary.totals.searches_count)]
    ];
  }

  function buildTrendRows(data, deps) {
    return [
      ['Posição', 'Termo', 'Buscas', 'Módulo'],
      ...(data.trends || []).map(function (item, index) {
        var moduleKey = classifyTermToModuleValue(deps, item && item.term);
        return [
          index + 1,
          item && item.term ? item.term : '',
          toNumberValue(deps, item && item.count),
          moduleKey ? getModuleLabelValue(deps, moduleKey) : ''
        ];
      })
    ];
  }

  function buildDailyRows(data, deps) {
    return [
      ['Dia', 'Rótulo', 'Posts', 'Comentários', 'Buscas', 'Votos', 'Ações admin', 'Total'],
      ...(data.dailyMetrics || []).map(function (row) {
        return [
          row.day || '',
          row.label || '',
          toNumberValue(deps, row.posts_count),
          toNumberValue(deps, row.comments_count),
          toNumberValue(deps, row.searches_count),
          toNumberValue(deps, row.votes_count),
          toNumberValue(deps, row.admin_actions_count),
          toNumberValue(deps, row.total_count)
        ];
      })
    ];
  }

  function buildSeriesTotalsRows(data, deps) {
    var totals = getSeriesTotalsValue(deps, data.dailyMetrics || []);
    return [
      ['Série', 'Total', 'Cor'],
      ...getSeriesMeta(deps).map(function (meta) {
        return [meta.label, toNumberValue(deps, totals[meta.key]), meta.color];
      })
    ];
  }

  function buildModuleRows(data, deps) {
    return [
      ['Módulo', 'Share (%)', 'Volume', 'Top termos'],
      ...(data.moduleShareRows || []).map(function (row) {
        return [
          row.label || row.module || '',
          row.share || 0,
          toNumberValue(deps, row.count),
          Array.isArray(row.topTerms) ? row.topTerms.join(', ') : ''
        ];
      })
    ];
  }

  function buildAlertRows(data) {
    return [
      ['Tom', 'Título', 'Descrição'],
      ...(data.alerts || []).map(function (alert) {
        return [alert.tone || 'neutral', alert.title || '', alert.body || ''];
      })
    ];
  }

  function buildAuditRows(data, deps) {
    return [
      ['Data', 'Ação', 'Entidade', 'Entity ID', 'Ator', 'Detalhes'],
      ...(data.auditRows || []).map(function (row) {
        return [
          formatDateTimeBRValue(deps, row && row.created_at),
          row && row.action ? row.action : '-',
          row && row.entity_type ? row.entity_type : '-',
          row && row.entity_id ? row.entity_id : '',
          getActorDisplay(row && row.actor_id, deps),
          compactAuditPayload(row && row.payload)
        ];
      })
    ];
  }

  async function exportXLSX(data, deps) {
    await ensureXLSX(deps);
    var XLSX = window.XLSX;
    var workbook = XLSX.utils.book_new();
    var generatedAt = formatDateTimeBRValue(deps, new Date());
    var periodLabel = data.periodLabel || getPeriodLabelValue(deps, data.periodDays || 30);

    var summarySheet = XLSX.utils.aoa_to_sheet(buildSummarySheetRows(data, periodLabel, generatedAt, deps));
    summarySheet['!cols'] = [{ wch: 20 }, { wch: 28 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumo');

    var trendsSheet = XLSX.utils.aoa_to_sheet(buildTrendRows(data, deps));
    trendsSheet['!cols'] = [{ wch: 8 }, { wch: 28 }, { wch: 10 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, trendsSheet, 'Tendências');

    var dailySheet = XLSX.utils.aoa_to_sheet(buildDailyRows(data, deps));
    dailySheet['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(workbook, dailySheet, 'Pulso diário');

    var seriesSheet = XLSX.utils.aoa_to_sheet(buildSeriesTotalsRows(data, deps));
    seriesSheet['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(workbook, seriesSheet, 'Séries');

    var modulesSheet = XLSX.utils.aoa_to_sheet(buildModuleRows(data, deps));
    modulesSheet['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 42 }];
    XLSX.utils.book_append_sheet(workbook, modulesSheet, 'Top módulos');

    var alertsSheet = XLSX.utils.aoa_to_sheet(buildAlertRows(data));
    alertsSheet['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 64 }];
    XLSX.utils.book_append_sheet(workbook, alertsSheet, 'Alertas');

    var auditSheet = XLSX.utils.aoa_to_sheet(buildAuditRows(data, deps));
    auditSheet['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 18 }, { wch: 38 }, { wch: 26 }, { wch: 64 }];
    XLSX.utils.book_append_sheet(workbook, auditSheet, 'Audit log');

    XLSX.writeFile(workbook, buildExportFilename('xlsx', data.periodDays));
  }

  async function exportPDF(data, deps) {
    await ensureJsPDF(deps);
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    var generatedAt = formatDateTimeBRValue(deps, new Date());
    var periodLabel = data.periodLabel || getPeriodLabelValue(deps, data.periodDays || 30);
    var pageWidth = doc.internal.pageSize.getWidth();
    var pageHeight = doc.internal.pageSize.getHeight();
    var margin = 14;
    var usableWidth = pageWidth - (margin * 2);
    var y = 18;

    function checkPage(requiredHeight) {
      if (y + (requiredHeight || 0) <= pageHeight - 18) return;
      doc.addPage();
      y = 18;
    }

    function drawSectionHeader(title, subtitle) {
      checkPage(subtitle ? 18 : 10);
      doc.setFontSize(12);
      doc.setTextColor(31, 41, 55);
      doc.text(title, margin, y);
      y += 5;
      if (subtitle) {
        var subtitleLines = doc.splitTextToSize(subtitle, usableWidth);
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text(subtitleLines, margin, y);
        y += subtitleLines.length * 4;
      }
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y, pageWidth - margin, y);
      y += 6;
    }

    function drawMetricCards(items) {
      var cardWidth = (usableWidth - 6) / 2;
      var cardHeight = 18;
      for (var i = 0; i < items.length; i += 2) {
        checkPage(cardHeight + 8);
        var row = items.slice(i, i + 2);
        row.forEach(function (item, index) {
          var x = margin + (index * (cardWidth + 6));
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(226, 232, 240);
          doc.roundedRect(x, y, cardWidth, cardHeight, 4, 4, 'FD');
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          doc.text(item.label, x + 4, y + 5);
          doc.setFontSize(13);
          doc.setTextColor(17, 24, 39);
          doc.text(String(item.value), x + 4, y + 12);
          if (item.detail) {
            doc.setFontSize(7);
            doc.setTextColor(100, 116, 139);
            doc.text(item.detail, x + 4, y + 16);
          }
        });
        y += cardHeight + 6;
      }
    }

    function drawDailyChart(series) {
      if (!Array.isArray(series) || !series.length) return;
      var chartHeight = 58;
      checkPage(chartHeight + 24);
      var chartX = margin;
      var chartY = y;
      var chartWidth = usableWidth;
      var paddingTop = 8;
      var paddingBottom = 10;
      var paddingHorizontal = 8;
      var innerWidth = chartWidth - (paddingHorizontal * 2);
      var innerHeight = chartHeight - paddingTop - paddingBottom;
      var maxValue = 0;

      series.forEach(function (row) {
        getSeriesKeysValue(deps).forEach(function (key) {
          maxValue = Math.max(maxValue, toNumberValue(deps, row[key]));
        });
      });
      maxValue = Math.max(maxValue, 1);

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(chartX, chartY, chartWidth, chartHeight, 5, 5, 'FD');

      for (var gridIndex = 1; gridIndex <= 4; gridIndex += 1) {
        var gridY = chartY + paddingTop + (innerHeight * (gridIndex / 4));
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.15);
        doc.line(chartX + paddingHorizontal, gridY, chartX + chartWidth - paddingHorizontal, gridY);
      }

      getSeriesMeta(deps).forEach(function (meta) {
        var rgb = hexToRgbValue(deps, meta.color);
        doc.setDrawColor(rgb.r, rgb.g, rgb.b);
        doc.setLineWidth(0.55);
        var prevPoint = null;
        series.forEach(function (row, index) {
          var step = series.length > 1 ? innerWidth / (series.length - 1) : innerWidth;
          var x = chartX + paddingHorizontal + (step * index);
          var value = toNumberValue(deps, row[meta.key]);
          var yPoint = chartY + paddingTop + innerHeight - ((value / maxValue) * innerHeight);
          if (prevPoint) {
            doc.line(prevPoint.x, prevPoint.y, x, yPoint);
          }
          prevPoint = { x: x, y: yPoint };
        });
      });

      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      series.forEach(function (row, index) {
        if (series.length > 14 && index % 2 === 1 && index !== series.length - 1) return;
        var step = series.length > 1 ? innerWidth / (series.length - 1) : innerWidth;
        var x = chartX + paddingHorizontal + (step * index);
        doc.text(row.label || '', x, chartY + chartHeight - 2, { align: 'center' });
      });

      y += chartHeight + 8;

      var totals = getSeriesTotalsValue(deps, series);
      var legendWidth = (usableWidth - 6) / 2;
      getSeriesMeta(deps).forEach(function (meta, index) {
        checkPage(8);
        var rgb = hexToRgbValue(deps, meta.color);
        var rowIndex = Math.floor(index / 2);
        var colIndex = index % 2;
        var x = margin + (colIndex * (legendWidth + 6));
        var itemY = y + (rowIndex * 6);
        doc.setFillColor(rgb.r, rgb.g, rgb.b);
        doc.circle(x + 2, itemY + 1.5, 1.3, 'F');
        doc.setFontSize(8);
        doc.setTextColor(31, 41, 55);
        doc.text(meta.label + ': ' + toNumberValue(deps, totals[meta.key]), x + 6, itemY + 2.4);
      });
      y += Math.ceil(getSeriesMeta(deps).length / 2) * 6 + 4;
    }

    function drawWrappedList(title, items, emptyMessage) {
      drawSectionHeader(title);
      if (!items.length) {
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text(emptyMessage, margin, y);
        y += 6;
        return;
      }
      items.forEach(function (item) {
        var lines = doc.splitTextToSize(item, usableWidth);
        checkPage((lines.length * 4) + 2);
        doc.setFontSize(9);
        doc.setTextColor(55, 65, 81);
        doc.text(lines, margin, y);
        y += (lines.length * 4) + 2;
      });
      y += 2;
    }

    doc.setFillColor(255, 107, 0);
    doc.roundedRect(margin, y, usableWidth, 26, 6, 6, 'F');
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text('Dashboard Administrativo', margin + 6, y + 9);
    doc.setFontSize(9);
    doc.text('KinoCampus - relatório consolidado', margin + 6, y + 15);
    doc.text('Gerado em ' + generatedAt + ' | Período: ' + periodLabel, margin + 6, y + 20);
    y += 34;

    drawSectionHeader('Resumo executivo', 'Janela analisada de ' + formatDateBRValue(deps, data.periodStart) + ' até ' + formatDateBRValue(deps, data.periodEnd) + '.');
    drawMetricCards([
      { label: 'Denúncias abertas', value: toNumberValue(deps, data.reportMetrics && data.reportMetrics.open), detail: periodLabel },
      { label: 'Total de denúncias', value: toNumberValue(deps, data.reportMetrics && data.reportMetrics.total), detail: periodLabel },
      { label: 'Posts ocultados', value: toNumberValue(deps, data.postStatusMetrics && data.postStatusMetrics.hidden), detail: periodLabel },
      { label: 'Posts deletados', value: toNumberValue(deps, data.postStatusMetrics && data.postStatusMetrics.deleted), detail: periodLabel },
      { label: 'Buscas registradas', value: toNumberValue(deps, data.searchCount), detail: periodLabel },
      { label: 'Votos', value: toNumberValue(deps, data.votesCount), detail: periodLabel },
      { label: 'Novos usuários', value: toNumberValue(deps, data.usersNew), detail: periodLabel },
      { label: 'Posts salvos', value: toNumberValue(deps, data.savedPostsCount), detail: periodLabel }
    ]);

    drawSectionHeader('Pulso diário', 'Atividade consolidada por dia para posts, comentários, buscas, votos e ações administrativas.');
    drawDailyChart(data.dailyMetrics || []);

    drawWrappedList(
      'Top módulos por demanda',
      (data.moduleShareRows || []).map(function (row) {
        var topTerms = Array.isArray(row.topTerms) && row.topTerms.length ? ' | Termos: ' + row.topTerms.join(', ') : '';
        return (row.label || row.module || 'Módulo') + ' - ' + (row.share || 0) + '% - ' + toNumberValue(deps, row.count) + ' buscas' + topTerms;
      }),
      'Sem dados suficientes para participação por módulo.'
    );

    drawWrappedList(
      'Alertas operacionais',
      (data.alerts || []).map(function (alert) {
        return '[' + String((alert && alert.tone) || 'neutral').toUpperCase() + '] ' + (alert.title || 'Atualização') + ' - ' + (alert.body || '');
      }),
      'Nenhum alerta operacional no período selecionado.'
    );

    drawWrappedList(
      'Tendências de busca',
      (data.trends || []).slice(0, 12).map(function (item, index) {
        var moduleKey = classifyTermToModuleValue(deps, item && item.term);
        return (index + 1) + '. ' + String((item && item.term) || '') + ' - ' + toNumberValue(deps, item && item.count) +
          (moduleKey ? ' (' + getModuleLabelValue(deps, moduleKey) + ')' : '');
      }),
      'Nenhuma busca registrada no período selecionado.'
    );

    drawSectionHeader('Audit log', 'Apêndice com os eventos administrativos carregados na tela para o período selecionado.');
    var auditLines = (data.auditRows || []).map(function (row) {
      return formatDateTimeBRValue(deps, row && row.created_at) + ' | ' +
        String((row && row.action) || '-') + ' | ' +
        String((row && row.entity_type) || '-') + ' | ' +
        String((row && row.entity_id) || '-') + ' | ' +
        getActorDisplay(row && row.actor_id, deps) + ' | ' +
        (compactAuditPayload(row && row.payload) || '-');
    });
    if (!auditLines.length) {
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text('Nenhum evento encontrado.', margin, y);
      y += 6;
    } else {
      auditLines.forEach(function (line) {
        var lines = doc.splitTextToSize(line, usableWidth);
        checkPage((lines.length * 3.6) + 1);
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text(lines, margin, y);
        y += (lines.length * 3.6) + 1.5;
      });
    }

    var totalPages = doc.internal.getNumberOfPages();
    for (var pageIndex = 1; pageIndex <= totalPages; pageIndex += 1) {
      doc.setPage(pageIndex);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('KinoCampus - Página ' + pageIndex + ' / ' + totalPages, pageWidth - margin, pageHeight - 8, { align: 'right' });
    }

    doc.save(buildExportFilename('pdf', data.periodDays));
  }

  function csvCell(value) {
    var text = String(value == null ? '' : value);
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function buildAuditExportFilename(extension, data) {
    var stamp = new Date().toISOString().slice(0, 10);
    var period = data && data.periodDays ? String(data.periodDays) + 'd' : 'selecionado';
    return 'kc-audit-log-' + period + '-' + stamp + '.' + extension;
  }

  function exportAuditCSV(data, deps) {
    var rows = buildAuditRows(data || { auditRows: [] }, deps);
    var csv = rows.map(function (row) {
      return row.map(csvCell).join(',');
    }).join('\r\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = buildAuditExportFilename('csv', data || {});
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(function () {
      try { document.body.removeChild(link); } catch (_) { }
      try { URL.revokeObjectURL(url); } catch (_) { }
    }, 0);
  }

  function bindAuditControls(deps) {
    var loadMoreBtn = select(deps, '#admin-audit-load-more');
    var actionFilter = select(deps, '#admin-audit-filter');
    var entityFilter = select(deps, '#admin-audit-entity-filter');
    var actorFilter = select(deps, '#admin-audit-actor-filter');
    var applyBtn = select(deps, '#admin-audit-apply-filter');
    var clearBtn = select(deps, '#admin-audit-clear-filter');
    var csvBtn = select(deps, '#admin-audit-export-csv');

    if (getAuditControlsBound(deps)) return;
    setAuditControlsBound(deps, true);

    if (loadMoreBtn) loadMoreBtn.addEventListener('click', function () { loadMoreAudit(deps); });
    if (actionFilter) actionFilter.addEventListener('change', function () { filterAudit(deps); });
    if (entityFilter) entityFilter.addEventListener('change', function () { filterAudit(deps); });
    if (applyBtn) applyBtn.addEventListener('click', function () { filterAudit(deps); });
    if (actorFilter) {
      actorFilter.addEventListener('keydown', function (event) {
        if (event && event.key === 'Enter') filterAudit(deps);
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (actionFilter) actionFilter.value = 'all';
        if (entityFilter) entityFilter.value = 'all';
        if (actorFilter) actorFilter.value = '';
        filterAudit(deps);
      });
    }
    if (csvBtn) {
      csvBtn.disabled = !getData(deps);
      csvBtn.addEventListener('click', function () {
        var data = getData(deps);
        if (!data) return;
        exportAuditCSV(data, deps);
      });
    }
  }

  function enableExport(deps) {
    var xlsxBtn = select(deps, '#admin-export-xlsx');
    var pdfBtn = select(deps, '#admin-export-pdf');
    var csvBtn = select(deps, '#admin-audit-export-csv');
    var currentData = getData(deps);

    if (xlsxBtn) xlsxBtn.disabled = !currentData;
    if (pdfBtn) pdfBtn.disabled = !currentData;
    if (csvBtn) csvBtn.disabled = !currentData;
    if (getExportBound(deps)) return;
    setExportBound(deps, true);

    if (xlsxBtn) {
      xlsxBtn.disabled = false;
      xlsxBtn.addEventListener('click', async function () {
        var data = getData(deps);
        if (!data) return;
        xlsxBtn.disabled = true;
        var originalHtml = xlsxBtn.innerHTML;
        xlsxBtn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Exportando...';
        try {
          await exportXLSX(data, deps);
        } catch (error) {
          console.error('[Admin export XLSX]', error);
          showError(deps, 'Falha ao gerar XLSX. Verifique sua conexão e tente novamente.');
        } finally {
          xlsxBtn.innerHTML = originalHtml;
          xlsxBtn.disabled = false;
        }
      });
    }

    if (pdfBtn) {
      pdfBtn.disabled = false;
      pdfBtn.addEventListener('click', async function () {
        var data = getData(deps);
        if (!data) return;
        pdfBtn.disabled = true;
        var originalHtml = pdfBtn.innerHTML;
        pdfBtn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Exportando...';
        try {
          await exportPDF(data, deps);
        } catch (error) {
          console.error('[Admin export PDF]', error);
          showError(deps, 'Falha ao gerar PDF. Verifique sua conexão e tente novamente.');
        } finally {
          pdfBtn.innerHTML = originalHtml;
          pdfBtn.disabled = false;
        }
      });
    }
  }

  async function loadMoreAudit(deps) {
    var client = getClient(deps);
    if (!client) return;
    var auditFilters = readAuditFilters(deps);
    var periodDays = getSelectedPeriodDaysValue(deps);
    var since = getPeriodRangeValue(deps, periodDays).since;
    var btn = select(deps, '#admin-audit-load-more');
    var pageSize = getAuditPageSize(deps);
    setAuditLoadMoreState({ visible: true, disabled: true, label: 'Carregando...', preserveLabel: true }, deps);

    try {
      var rows = await loadAuditLog(client, pageSize, getAuditOffset(deps), auditFilters, since, deps);
      await loadActorsById(client, rows.map(function (row) { return row && row.actor_id; }), deps);
      setAuditOffset(deps, getAuditOffset(deps) + rows.length);
      renderAuditRows(rows, true, deps);
      if (rows.length < pageSize) {
        setAuditLoadMoreState({ visible: true, disabled: true, label: 'Fim do histórico', preserveLabel: true }, deps);
      }
      var data = getData(deps);
      if (data && data.auditRows) {
        data.auditRows = data.auditRows.concat(rows);
        setData(deps, data);
        renderAuditSummary(data.auditRows, auditFilters, deps);
      }
    } catch (error) {
      console.error('[Admin audit] loadMore:', error);
      setAuditLoadMoreState({ visible: true, disabled: false }, deps);
    } finally {
      if (btn && btn.textContent === 'Carregando...') {
        setAuditLoadMoreState({ visible: true, disabled: false }, deps);
      }
    }
  }

  async function filterAudit(deps) {
    var client = getClient(deps);
    if (!client) return;
    var auditFilters = readAuditFilters(deps);
    var periodDays = getSelectedPeriodDaysValue(deps);
    var since = getPeriodRangeValue(deps, periodDays).since;
    var pageSize = getAuditPageSize(deps);
    setAuditOffset(deps, 0);

    try {
      var rows = await loadAuditLog(client, pageSize, 0, auditFilters, since, deps);
      await loadActorsById(client, rows.map(function (row) { return row && row.actor_id; }), deps);
      setAuditOffset(deps, rows.length);
      renderAuditRows(rows, false, deps);
      renderAuditSummary(rows, auditFilters, deps);
      if (!rows.length) {
        setAuditLoadMoreState({ visible: true, disabled: true, label: 'Sem mais resultados', preserveLabel: true }, deps);
      }
      var data = getData(deps);
      if (data) {
        data.auditRows = rows;
        setData(deps, data);
      }
    } catch (error) {
      console.error('[Admin audit] filter:', error);
    }
  }

  window._KCAD.audit = {
    bindAuditControls: bindAuditControls,
    enableExport: enableExport,
    exportAuditCSV: exportAuditCSV,
    exportPDF: exportPDF,
    exportXLSX: exportXLSX,
    filterAudit: filterAudit,
    getActorDisplay: getActorDisplay,
    loadActorsById: loadActorsById,
    loadAuditLog: loadAuditLog,
    loadMoreAudit: loadMoreAudit,
    normalizeAuditFilters: normalizeAuditFilters,
    readAuditFilters: readAuditFilters,
    renderAuditRows: renderAuditRows
  };
})();

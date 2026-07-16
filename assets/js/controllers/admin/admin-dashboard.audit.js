(function () {
  'use strict';

  window._KCAD = window._KCAD || {};

  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var SENSITIVE_AUDIT_KEY_RE = /(token|cookie|authorization|apikey|api_key|password|secret|refresh|access_token|refresh_token|user_agent|user-agent|ip_address|ip\b)/i;
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

  function exportMetricValue(deps, value) {
    if (value === null || typeof value === 'undefined') return 'Indisponível';
    return toNumberValue(deps, value);
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
    if (days === 7) return 'últimos 7 dias';
    if (days === 90) return 'últimos 90 dias';
    if (days === 365) return 'últimos 365 dias';
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

  function bumpAuditRequestSeq() {
    var state = getStateBucket();
    state.requestSeq = (Number(state.requestSeq) || 0) + 1;
    return state.requestSeq;
  }

  function isCurrentAuditRequest(requestSeq) {
    return Number(getStateBucket().requestSeq) === Number(requestSeq);
  }

  function tagAuditRowsAvailability(rows, available, source) {
    var list = Array.isArray(rows) ? rows : [];
    try {
      Object.defineProperty(list, '__kcAvailable', {
        value: available !== false,
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(list, '__kcSource', {
        value: source || (available === false ? 'unavailable' : 'unknown'),
        enumerable: false,
        configurable: true
      });
    } catch (_) { }
    return list;
  }

  function areAuditRowsAvailable(rows) {
    return !(rows && rows.__kcAvailable === false);
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

  function getExportModuleLabel(deps, moduleKey) {
    if (!moduleKey) return 'Não classificado';
    return getModuleLabelValue(deps, moduleKey) || 'Não classificado';
  }

  function getFilterDisplayValue(value, allLabel) {
    var normalized = String(value == null ? '' : value).trim();
    return !normalized || normalized.toLowerCase() === 'all' ? allLabel : normalized;
  }

  function getAdStatusLabel(value) {
    var normalized = String(value == null ? '' : value).trim().toLowerCase();
    if (!normalized) return 'Indisponível';
    if (normalized === 'active' || normalized === 'enabled') return 'Ativo';
    if (normalized === 'disabled') return 'Desativado';
    if (normalized === 'paused') return 'Pausado';
    return String(value);
  }

  function getAdProviderLabel(value) {
    var normalized = String(value == null ? '' : value).trim().toLowerCase();
    if (!normalized) return 'Indisponível';
    if (normalized === 'direct') return 'Direto';
    if (normalized === 'adsense') return 'Google AdSense';
    return String(value);
  }

  function getAdBooleanLabel(value) {
    if (value === null || typeof value === 'undefined') return 'Indisponível';
    return value ? 'Ativado' : 'Desativado';
  }

  function getAdCtrLabel(deps, value) {
    if (value === null || typeof value === 'undefined') return 'CTR indisponível';
    return 'CTR ' + toNumberValue(deps, value) + '%';
  }

  function getAlertToneLabel(value) {
    var normalized = String(value == null ? '' : value).trim().toLowerCase();
    if (normalized === 'warning' || normalized === 'warn') return 'Atenção';
    if (normalized === 'info' || normalized === 'neutral') return 'Informativo';
    if (normalized === 'positive' || normalized === 'success') return 'Positivo';
    if (normalized === 'error' || normalized === 'danger' || normalized === 'critical') return 'Crítico';
    return String(value || 'Informativo');
  }

  function classifyTermToModuleValue(deps, term) {
    if (deps && typeof deps.classifyTermToModule === 'function') return deps.classifyTermToModule(term);
    return null;
  }

  function resolveTermModuleValue(deps, item) {
    if (deps && typeof deps.resolveTermModule === 'function') return deps.resolveTermModule(item);
    return classifyTermToModuleValue(deps, item && item.term);
  }

  function getRankingContext(deps) {
    if (deps && typeof deps.getRankingContext === 'function') return deps.getRankingContext() || {};
    return {};
  }

  function getTrendExportSnapshot(deps, fallbackRows) {
    if (deps && typeof deps.getTrendExportSnapshot === 'function') {
      var snapshot = deps.getTrendExportSnapshot();
      if (snapshot && Array.isArray(snapshot.rows)) return snapshot;
    }
    return { rows: Array.isArray(fallbackRows) ? fallbackRows : [], module: '', query: '' };
  }

  function isDashboardBusy(deps) {
    return !!(deps && typeof deps.isDashboardBusy === 'function' && deps.isDashboardBusy());
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

  function getAppliedAuditFilters(deps) {
    var data = getData(deps);
    if (data && data.auditFilters) return normalizeAuditFilters(data.auditFilters);
    var state = getStateBucket();
    if (state.appliedFilters) return normalizeAuditFilters(state.appliedFilters);
    return readAuditFilters(deps);
  }

  function setAppliedAuditFilters(filters, deps) {
    var normalized = normalizeAuditFilters(filters);
    var state = getStateBucket();
    state.appliedFilters = normalized;
    var data = getData(deps);
    if (data && typeof data === 'object') {
      data.auditFilters = normalized;
      setData(deps, data);
    }
    return normalized;
  }

  function setAuditPending(requestSeq, pending, deps) {
    var state = getStateBucket();
    if (pending) {
      state.pending = true;
      state.pendingRequestSeq = requestSeq;
    } else if (Number(state.pendingRequestSeq) === Number(requestSeq)) {
      state.pending = false;
      state.pendingRequestSeq = null;
    }
    enableExport(deps);
  }

  function auditFiltersLabel(filters) {
    var f = normalizeAuditFilters(filters);
    var parts = [];
    if (f.action && f.action !== 'all') parts.push('ação ' + f.action);
    if (f.entityType && f.entityType !== 'all') parts.push('entidade ' + f.entityType);
    if (f.actorQuery) parts.push('ator "' + f.actorQuery + '"');
    return parts.length ? parts.join(' · ') : 'sem filtros ativos';
  }

  function sanitizeAuditPayload(value, depth) {
    var currentDepth = Number(depth) || 0;
    if (currentDepth > 6) return '[conteúdo truncado]';
    if (Array.isArray(value)) {
      return value.slice(0, 50).map(function (item) {
        return sanitizeAuditPayload(item, currentDepth + 1);
      });
    }
    if (!value || typeof value !== 'object') return value;
    var clean = {};
    Object.keys(value).forEach(function (key) {
      if (SENSITIVE_AUDIT_KEY_RE.test(key)) return;
      clean[key] = sanitizeAuditPayload(value[key], currentDepth + 1);
    });
    return clean;
  }

  function compactAuditPayload(payload) {
    var source = payload && typeof payload === 'object' ? sanitizeAuditPayload(payload, 0) : null;
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
    if (!areAuditRowsAvailable(rows)) {
      el.textContent = 'Auditoria indisponível · ' + auditFiltersLabel(filters);
      return;
    }
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
        if (!result.error) {
          return tagAuditRowsAvailability(Array.isArray(result.data) ? result.data : [], true, 'audit_table');
        }
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
      if (!rpc.error && Array.isArray(rpc.data)) {
        return tagAuditRowsAvailability(rpc.data, true, 'audit_rpc');
      }
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
        return tagAuditRowsAvailability(
          filterRows(legacyRpc.data).slice(offset, offset + limit),
          true,
          'audit_rpc_legacy'
        );
      }
      if (legacyRpc.error) {
        console.warn('[Admin audit] Legacy RPC failed:', legacyRpc.error.message || legacyRpc.error);
      }
    } catch (error3) {
      console.warn('[Admin audit] Legacy RPC exception:', error3 && error3.message ? error3.message : error3);
    }

    return tagAuditRowsAvailability([], false, 'unavailable');
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
    else if (a === 'posts_auto_closed' || a === 'post_auto_closed') { cls = 'kc-audit-badge--hidden'; label = 'Encerramento automático'; }
    else if (a === 'post_auto_moderated') { cls = 'kc-audit-badge--hidden'; label = 'Moderação automática'; }
    else if (a.includes('delet')) { cls = 'kc-audit-badge--deleted'; label = 'Deletado'; }
    else if (a.includes('hidden') || a.includes('oculto')) { cls = 'kc-audit-badge--hidden'; label = 'Ocultado'; }
    else if (a.includes('restored') || a.includes('restaur')) { cls = 'kc-audit-badge--restored'; label = 'Restaurado'; }
    else if (a.includes('report')) { cls = 'kc-audit-badge--report'; label = 'Denúncia'; }
    else if (a.includes('closed')) { cls = 'kc-audit-badge--hidden'; label = 'Encerrado'; }
    else if (a.includes('ad_network')) { cls = 'kc-audit-badge--restored'; label = 'AdSense'; }
    else if (a.includes('ad_campaign')) { cls = 'kc-audit-badge--restored'; label = 'Anúncio'; }
    else if (a.includes('status')) { cls = 'kc-audit-badge--hidden'; label = 'Status'; }
    return '<span class="kc-audit-badge ' + cls + '" title="' + escHtml(deps, action || '') + '">' + escHtml(deps, label) + '</span>';
  }

  function renderAuditRows(rows, append, deps) {
    var auditBody = select(deps, '#admin-audit-body');
    if (!auditBody) return;
    var list = Array.isArray(rows) ? rows : [];
    if (!areAuditRowsAvailable(rows)) {
      auditBody.innerHTML = '<tr><td colspan="6" style="padding:20px 8px;"><p class="kc-empty" style="margin:0;color:var(--kc-text-dark-secondary);">Auditoria indisponível neste carregamento. Tente atualizar novamente.</p></td></tr>';
      setAuditLoadMoreState({ visible: true, disabled: true, label: 'Auditoria indisponível', preserveLabel: true }, deps);
      renderAuditSummary(rows, getAppliedAuditFilters(deps), deps);
      return;
    }
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
      getAppliedAuditFilters(deps),
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
    var dailyAvailable = data.dailyAvailable !== false;
    return [
      ['KinoCampus - Dashboard Administrativo'],
      ['Gerado em', generatedAt],
      ['Período selecionado', periodLabel],
      ['Data inicial', formatDateBRValue(deps, data.periodStart)],
      ['Data final', formatDateBRValue(deps, data.periodEnd)],
      [],
      ['Seção', 'Métrica', 'Valor'],
      ['Resumo agora', 'Ativos agora', data.activeSessions15m && data.activeSessions15m.available ? toNumberValue(deps, data.activeSessions15m.value) : 'Indisponível'],
      ['Resumo agora', 'Publicações visíveis', exportMetricValue(deps, data.visiblePosts)],
      ['Moderação', 'Denúncias abertas (backlog)', exportMetricValue(deps, data.reportMetrics && data.reportMetrics.open)],
      ['Moderação', 'Denúncias recebidas', exportMetricValue(deps, data.reportMetrics && data.reportMetrics.total)],
      ['Moderação', 'Posts ocultos atualizados', exportMetricValue(deps, data.postStatusMetrics && data.postStatusMetrics.hidden)],
      ['Moderação', 'Posts deletados atualizados', exportMetricValue(deps, data.postStatusMetrics && data.postStatusMetrics.deleted)],
      ['Atividade', 'Total de posts', exportMetricValue(deps, data.postsTotal)],
      ['Atividade', 'Posts criados', exportMetricValue(deps, data.postsCreated)],
      ['Atividade', 'Posts anteriores atualizados', exportMetricValue(deps, data.postsEdited)],
      ['Atividade', 'Comentários', exportMetricValue(deps, data.commentsCount)],
      ['Atividade', 'Buscas realizadas', exportMetricValue(deps, data.searchCount)],
      ['Comunidade', 'Total de usuários', exportMetricValue(deps, data.usersTotal)],
      ['Comunidade', 'Novos usuários', exportMetricValue(deps, data.usersNew)],
      ['Comunidade', 'Votos', exportMetricValue(deps, data.votesCount)],
      ['Comunidade', 'Posts salvos', exportMetricValue(deps, data.savedPostsCount)],
      ['Pulso diário', 'Pico diário', dailyAvailable ? toNumberValue(deps, data.dailySummary && data.dailySummary.peakTotal) : 'Indisponível'],
      ['Pulso diário', 'Média diária', dailyAvailable ? (data.dailySummary ? (data.dailySummary.averageTotal || 0) : 0) : 'Indisponível'],
      ['Pulso diário', 'Último dia', dailyAvailable ? toNumberValue(deps, data.dailySummary && data.dailySummary.lastDayTotal) : 'Indisponível'],
      ['Pulso diário', 'Total de buscas', dailyAvailable ? toNumberValue(deps, data.dailySummary && data.dailySummary.totals && data.dailySummary.totals.searches_count) : 'Indisponível']
    ];
  }

  function buildTrendRows(data, deps) {
    if (data.trendsAvailable === false) {
      return [
        ['Posição', 'Termo', 'Buscas', 'Módulo'],
        ['', 'Tendências indisponíveis neste carregamento', '', '']
      ];
    }
    return [
      ['Posição', 'Termo', 'Buscas', 'Módulo'],
      ...(data.trends || []).map(function (item, index) {
        var moduleKey = resolveTermModuleValue(deps, item);
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
    if (data.dailyAvailable === false) {
      return [
        ['Dia', 'Rótulo', 'Posts', 'Comentários', 'Buscas', 'Votos', 'Ações admin', 'Total'],
        ['', 'Pulso diário indisponível neste carregamento', '', '', '', '', '', '']
      ];
    }
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
    if (data.dailyAvailable === false) {
      return [
        ['Série', 'Total', 'Cor'],
        ['Totais das séries indisponíveis neste carregamento', '', '']
      ];
    }
    var totals = getSeriesTotalsValue(deps, data.dailyMetrics || []);
    return [
      ['Série', 'Total', 'Cor'],
      ...getSeriesMeta(deps).map(function (meta) {
        return [meta.label, toNumberValue(deps, totals[meta.key]), meta.color];
      })
    ];
  }

  function buildModuleRows(data, deps) {
    if (data.trendsAvailable === false) {
      return [
        ['Módulo', 'Share (%)', 'Volume', 'Top termos'],
        ['Participação por módulo indisponível neste carregamento', '', '', '']
      ];
    }
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
    if (data.auditAvailable === false || !areAuditRowsAvailable(data.auditRows)) {
      return [
        ['Data', 'Ação', 'Entidade', 'Entity ID', 'Ator', 'Detalhes'],
        ['', 'Audit log indisponível neste carregamento', '', '', '', '']
      ];
    }
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

  function buildDashboardExportReport(data, deps) {
    var periodLabel = data.periodLabel || getPeriodLabelValue(deps, data.periodDays || 30);
    var auditFilters = {};
    try { auditFilters = getAppliedAuditFilters(deps) || {}; } catch (_) { auditFilters = {}; }
    var periodStart = formatDateBRValue(deps, data.periodStart);
    var periodEnd = formatDateBRValue(deps, data.periodEnd);
    var activeSessions = data.activeSessions15m || {};
    var activeAvailable = activeSessions && activeSessions.available;
    var auditAvailable = data.auditAvailable !== false && areAuditRowsAvailable(data.auditRows);
    var dailyAvailable = data.dailyAvailable !== false;
    var trendsAvailable = data.trendsAvailable !== false;
    var adOverview = data.adOverview || {};
    var adSettings = adOverview.settings || {};
    var adCampaigns = adOverview.campaigns || {};
    var adMetrics = adOverview.metrics || {};

    // Séries dinâmicas: o relatório reflete exatamente as séries escolhidas no gráfico.
    var seriesMetaList = (typeof deps.getSeriesMeta === 'function' && deps.getSeriesMeta()) || [];
    var metaByKey = {};
    seriesMetaList.forEach(function (m) { metaByKey[m.key] = m; });
    var visibleSeriesKeys = (typeof deps.getVisibleSeriesKeys === 'function' && deps.getVisibleSeriesKeys()) || [];
    if (!visibleSeriesKeys.length) visibleSeriesKeys = seriesMetaList.map(function (m) { return m.key; });
    var pulseColumns = [{ key: 'dia', label: 'Dia' }].concat(visibleSeriesKeys.map(function (k) {
      return { key: k, label: (metaByKey[k] && metaByKey[k].label) || k };
    })).concat([{ key: 'total', label: 'Total das séries exibidas' }]);
    var pulseRows = (dailyAvailable ? (data.dailyMetrics || []) : []).map(function (row) {
      var visibleTotal = visibleSeriesKeys.reduce(function (sum, key) {
        return sum + toNumberValue(deps, row && row[key]);
      }, 0);
      var r = { dia: row.label || row.day || '', total: visibleTotal };
      visibleSeriesKeys.forEach(function (k) { r[k] = toNumberValue(deps, row[k]); });
      return r;
    });
    var pulseChartSeries = visibleSeriesKeys.map(function (k) {
      return {
        key: k,
        label: (metaByKey[k] && metaByKey[k].label) || k,
        color: (metaByKey[k] && metaByKey[k].color) || '#ff6b00'
      };
    });
    var seriesTotalsRows = dailyAvailable ? visibleSeriesKeys.map(function (k) {
      return {
        serie: (metaByKey[k] && metaByKey[k].label) || k,
        total: (data.dailyMetrics || []).reduce(function (s, row) { return s + toNumberValue(deps, row[k]); }, 0)
      };
    }) : [];
    var rankingRows = (typeof deps.getRankingRows === 'function' && deps.getRankingRows()) || [];
    var rankingContext = getRankingContext(deps);
    var trendSnapshot = getTrendExportSnapshot(deps, data.trends || []);
    var trendRows = trendsAvailable ? trendSnapshot.rows : [];
    var rankingModuleLabel = rankingContext.module ? getModuleLabelValue(deps, rankingContext.module) : 'Todos os módulos';
    var rankingLimit = Number(rankingContext.limit) || (rankingContext.expanded ? 100 : 10);
    var rankingPeriodLabel = rankingContext.periodLabel || 'Janela móvel do ranking';
    var rankingAvailable = rankingContext.available !== false;
    var rankingSection = {
      title: 'Top Contribuidores',
      note: rankingAvailable
        ? 'Ranking carregado no painel: ' + rankingPeriodLabel + ', ' + rankingModuleLabel + ', top ' + rankingLimit
          + '. A janela é móvel e não usa o corte por dia civil do restante do dashboard.'
        : 'Ranking indisponível neste carregamento para ' + rankingPeriodLabel + ', ' + rankingModuleLabel
          + '. A ausência de linhas não representa ausência de contribuidores.',
      emptyMessage: rankingAvailable
        ? 'Nenhum contribuidor encontrado para os filtros selecionados'
        : 'Ranking indisponível neste carregamento; tente atualizar novamente',
      rows: (rankingAvailable ? rankingRows : []).map(function (u, i) {
        return {
          posicao: toNumberValue(deps, u && u.rank) || (i + 1),
          usuario: (u && u.display_name) ? u.display_name : 'Usuário',
          score: toNumberValue(deps, u && u.score),
          publicacoes: toNumberValue(deps, u && u.posts_count),
          votos: toNumberValue(deps, u && u.votes_received),
          comentarios: toNumberValue(deps, u && u.comments_count),
          penalidades: toNumberValue(deps, u && u.penalties)
        };
      }),
      pdfColumns: [{ key: 'posicao', label: '#' }, { key: 'usuario', label: 'Usuário' }, { key: 'score', label: 'Score' }, { key: 'publicacoes', label: 'Posts' }],
      xlsxColumns: [{ key: 'posicao', label: '#' }, { key: 'usuario', label: 'Usuário' }, { key: 'score', label: 'Score' }, { key: 'publicacoes', label: 'Posts' }, { key: 'votos', label: 'Votos' }, { key: 'comentarios', label: 'Comentários' }, { key: 'penalidades', label: 'Penalidades' }],
      maxPdfRows: 20
    };

    return {
      title: 'KinoCampus - Relatório Executivo Admin',
      subtitle: 'Dashboard administrativo consolidado',
      period: periodLabel,
      source: 'admin/index.html — Dashboard Admin',
      filters: {
        periodo: periodLabel,
        inicio: periodStart,
        fim: periodEnd,
        audit_action: getFilterDisplayValue(auditFilters.action, 'Todas as ações'),
        audit_entity_type: getFilterDisplayValue(auditFilters.entityType || auditFilters.entity, 'Todas as entidades'),
        audit_actor: getFilterDisplayValue(auditFilters.actorQuery || auditFilters.actor, 'Todos os atores'),
        audit_disponibilidade: auditAvailable ? 'Disponível' : 'Indisponível',
        tendencias_modulo: trendSnapshot.module ? getExportModuleLabel(deps, trendSnapshot.module) : 'Todos os módulos',
        tendencias_busca: getFilterDisplayValue(trendSnapshot.query, 'Todos os termos'),
        tendencias_disponibilidade: trendsAvailable ? 'Disponível' : 'Indisponível',
        pulso_disponibilidade: dailyAvailable ? 'Disponível' : 'Indisponível',
        ranking_periodo: rankingPeriodLabel,
        ranking_modulo: rankingContext.module ? getExportModuleLabel(deps, rankingContext.module) : 'Todos os módulos',
        ranking_limite: rankingLimit,
        ranking_disponibilidade: rankingAvailable ? 'Disponível' : 'Indisponível',
      },
      kpis: [
        { label: 'Ativos agora', value: activeAvailable ? toNumberValue(deps, activeSessions.value) : 'Indisponível', detail: 'sessões agregadas em 15 min' },
        { label: 'Publicações visíveis', value: exportMetricValue(deps, data.visiblePosts), detail: 'publicadas + encerradas' },
        { label: 'Denúncias abertas', value: exportMetricValue(deps, data.reportMetrics && data.reportMetrics.open), detail: 'backlog atual, sem recorte temporal' },
        { label: 'Denúncias recebidas', value: exportMetricValue(deps, data.reportMetrics && data.reportMetrics.total), detail: periodLabel },
        { label: 'Posts ocultos atualizados', value: exportMetricValue(deps, data.postStatusMetrics && data.postStatusMetrics.hidden), detail: periodLabel },
        { label: 'Posts deletados atualizados', value: exportMetricValue(deps, data.postStatusMetrics && data.postStatusMetrics.deleted), detail: periodLabel },
        { label: 'Buscas registradas', value: exportMetricValue(deps, data.searchCount), detail: periodLabel },
        { label: 'Votos', value: exportMetricValue(deps, data.votesCount), detail: periodLabel },
        { label: 'Novos usuários', value: exportMetricValue(deps, data.usersNew), detail: periodLabel },
        { label: 'Posts salvos', value: exportMetricValue(deps, data.savedPostsCount), detail: periodLabel },
        { label: 'Campanhas ativas', value: exportMetricValue(deps, adCampaigns.active), detail: 'monetização' },
        { label: 'Cliques em anúncios', value: exportMetricValue(deps, adMetrics.clicks), detail: getAdCtrLabel(deps, adMetrics.ctr) },
      ],
      sections: [
        {
          title: 'Resumo executivo',
          note: 'Indicadores principais da seleção atual do Dashboard.',
          rows: [
            { indicador: 'Janela analisada', valor: periodStart + ' até ' + periodEnd, contexto: periodLabel },
            { indicador: 'Ativos agora', valor: activeAvailable ? String(activeSessions.value) : 'Indisponível', contexto: activeSessions.label || activeSessions.source || '-' },
            { indicador: 'Publicações visíveis', valor: exportMetricValue(deps, data.visiblePosts), contexto: 'Posts publicados ou encerrados visíveis' },
            { indicador: 'Denúncias abertas', valor: exportMetricValue(deps, data.reportMetrics && data.reportMetrics.open), contexto: 'Backlog atual, sem recorte temporal' },
            { indicador: 'Buscas registradas', valor: exportMetricValue(deps, data.searchCount), contexto: periodLabel },
            { indicador: 'Novos usuários', valor: exportMetricValue(deps, data.usersNew), contexto: periodLabel },
            { indicador: 'Posts salvos', valor: exportMetricValue(deps, data.savedPostsCount), contexto: periodLabel },
            { indicador: 'Votos', valor: exportMetricValue(deps, data.votesCount), contexto: periodLabel },
            { indicador: 'Modo de anúncios', valor: getAdStatusLabel(adSettings.status), contexto: getAdProviderLabel(adSettings.provider) },
            { indicador: 'Campanhas ativas', valor: exportMetricValue(deps, adCampaigns.active), contexto: 'Monetização' },
            { indicador: 'Cliques em anúncios', valor: exportMetricValue(deps, adMetrics.clicks), contexto: getAdCtrLabel(deps, adMetrics.ctr) },
            { indicador: 'Alertas operacionais', valor: (data.alerts || []).length, contexto: 'Alertas do Dashboard' },
            { indicador: 'Eventos no audit log', valor: auditAvailable ? (data.auditRows || []).length : 'Indisponível', contexto: auditAvailable ? 'Linhas carregadas no painel' : 'A fonte de auditoria não respondeu' },
          ],
          columns: ['indicador', 'valor', 'contexto'],
          maxPdfRows: 12,
        },
        {
          title: 'Pulso operacional',
          note: dailyAvailable
            ? 'Atividade diária das séries selecionadas no gráfico do Dashboard.'
            : 'Fonte do pulso diário indisponível neste carregamento; a ausência de linhas não representa zero atividade.',
          emptyMessage: dailyAvailable
            ? 'Nenhuma atividade diária encontrada para o período selecionado'
            : 'Pulso diário indisponível neste carregamento; tente atualizar novamente',
          rows: pulseRows,
          columns: pulseColumns,
          chart: dailyAvailable ? {
            type: 'line',
            xKey: 'dia',
            xLabel: 'Dia',
            yLabel: 'Eventos',
            rows: pulseRows,
            series: pulseChartSeries
          } : null,
          maxPdfRows: 18,
        },
        {
          title: 'Séries (totais no período)',
          note: dailyAvailable
            ? 'Soma de cada série visível no período selecionado.'
            : 'Totais não calculados porque a fonte do pulso diário não respondeu.',
          emptyMessage: dailyAvailable
            ? 'Nenhuma série diária encontrada para o período selecionado'
            : 'Totais das séries indisponíveis neste carregamento',
          rows: seriesTotalsRows,
          columns: [{ key: 'serie', label: 'Série' }, { key: 'total', label: 'Total' }],
          maxPdfRows: 14,
        },
        {
          title: 'Módulos',
          note: trendsAvailable
            ? 'Participação no volume de buscas classificadas por módulo.'
            : 'Participação por módulo indisponível porque a fonte de tendências não respondeu.',
          emptyMessage: trendsAvailable
            ? 'Nenhuma busca classificada por módulo no período selecionado'
            : 'Participação por módulo indisponível neste carregamento',
          rows: (trendsAvailable ? (data.moduleShareRows || []) : []).map(function (row) {
            return {
              modulo: row.label || row.module || '',
              participacao_percentual: String(row.share || 0) + '%',
              volume: toNumberValue(deps, row.count),
              top_termos: Array.isArray(row.topTerms) ? row.topTerms.join(', ') : '',
            };
          }),
          pdfColumns: ['modulo', 'participacao_percentual', 'volume'],
          xlsxColumns: ['modulo', 'participacao_percentual', 'volume', 'top_termos'],
          maxPdfRows: 12,
        },
        {
          title: 'Tendências',
          note: trendsAvailable
            ? 'Respeita o filtro local de texto e módulo aplicado no painel.'
            : 'Fonte de tendências indisponível neste carregamento; a ausência de linhas não representa zero buscas.',
          emptyMessage: trendsAvailable
            ? 'Nenhuma tendência encontrada para os filtros selecionados'
            : 'Tendências de busca indisponíveis neste carregamento',
          rows: trendRows.slice(0, 50).map(function (item, index) {
            var moduleKey = resolveTermModuleValue(deps, item);
            return {
              posicao: index + 1,
              termo: item && item.term ? item.term : '',
              buscas: toNumberValue(deps, item && item.count),
              modulo: getExportModuleLabel(deps, moduleKey),
            };
          }),
          columns: ['posicao', 'termo', 'buscas', 'modulo'],
          maxPdfRows: 20,
        },
        {
          title: 'Monetização',
          note: 'Resumo de campanhas próprias, AdSense controlado e eventos agregados de publicidade.',
          rows: [
            { indicador: 'Status AdSense', valor: getAdStatusLabel(adSettings.status), contexto: getAdProviderLabel(adSettings.provider) },
            { indicador: 'Auto ads', valor: getAdBooleanLabel(adSettings.auto_ads_enabled), contexto: 'Recomendado: desativado' },
            { indicador: 'Campanhas totais', valor: exportMetricValue(deps, adCampaigns.total), contexto: 'ad_campaigns' },
            { indicador: 'Campanhas ativas', valor: exportMetricValue(deps, adCampaigns.active), contexto: 'disponíveis para feed' },
            { indicador: 'Impressões', valor: exportMetricValue(deps, adMetrics.impressions), contexto: periodLabel },
            { indicador: 'Cliques', valor: exportMetricValue(deps, adMetrics.clicks), contexto: getAdCtrLabel(deps, adMetrics.ctr) },
          ],
          columns: ['indicador', 'valor', 'contexto'],
          maxPdfRows: 8,
        },
        {
          title: 'Alertas',
          rows: (data.alerts || []).map(function (alert) {
            return {
              tom: getAlertToneLabel(alert && alert.tone),
              titulo: alert && alert.title ? alert.title : '',
              descricao: alert && alert.body ? alert.body : '',
            };
          }),
          pdfColumns: ['tom', 'titulo', 'descricao'],
          xlsxColumns: ['tom', 'titulo', 'descricao'],
          maxPdfRows: 12,
        },
        {
          title: 'Saúde/Admin',
          rows: [
            {
              indicador: 'Coleta de ativos 15min',
              estado: activeAvailable ? (activeSessions.label || 'Disponível') : 'Indisponível',
              fonte: activeSessions.source || '-',
              observacao: activeSessions.note || ''
            },
            {
              indicador: 'Rotas admin',
              estado: '8 páginas oficiais',
              fonte: 'manifesto admin',
              observacao: 'Dashboard, Moderação, Denúncias, Banners, Ajuda, Privacidade, GA4 e Cadu'
            },
            {
              indicador: 'Exportações',
              estado: 'PDF/XLSX do snapshot carregado',
              fonte: 'KCAdminExport',
              observacao: 'Dados sanitizados; tendências, ranking e audit log refletem as linhas carregadas no painel'
            },
            {
              indicador: 'Pulso diário',
              estado: dailyAvailable ? 'Disponível' : 'Indisponível',
              fonte: 'dailyMetrics',
              observacao: dailyAvailable ? 'Série temporal confirmada.' : 'A ausência de linhas não representa zero atividade.'
            },
            {
              indicador: 'Tendências',
              estado: trendsAvailable ? 'Disponível' : 'Indisponível',
              fonte: 'search trends',
              observacao: trendsAvailable ? 'Consultas confirmadas para o período.' : 'A ausência de linhas não representa zero buscas.'
            },
            {
              indicador: 'Ranking',
              estado: rankingAvailable ? 'Disponível' : 'Indisponível',
              fonte: rankingContext.status || 'ranking',
              observacao: rankingAvailable ? rankingPeriodLabel : 'A ausência de linhas não representa ausência de contribuidores.'
            }
          ],
          columns: ['indicador', 'estado', 'fonte', 'observacao'],
          maxPdfRows: 8,
        },
        rankingSection,
        {
          title: 'Audit log',
          note: auditAvailable
            ? 'Amostra dos eventos administrativos carregados no Dashboard para o período e filtros selecionados.'
            : 'Fonte de auditoria indisponível neste carregamento; a ausência de linhas não representa zero eventos.',
          emptyMessage: auditAvailable
            ? 'Nenhum evento de auditoria encontrado para os filtros selecionados'
            : 'Audit log indisponível neste carregamento; tente atualizar novamente',
          rows: (data.auditRows || []).map(function (row) {
            return {
              data: formatDateTimeBRValue(deps, row && row.created_at),
              acao: row && row.action ? row.action : '-',
              entidade: row && row.entity_type ? row.entity_type : '-',
              entity_id: row && row.entity_id ? row.entity_id : '',
              ator: getActorDisplay(row && row.actor_id, deps),
              detalhes: compactAuditPayload(row && row.payload),
            };
          }),
          pdfColumns: ['data', 'acao', 'entidade', 'ator'],
          xlsxColumns: ['data', 'acao', 'entidade', 'entity_id', 'ator', 'detalhes'],
          maxPdfRows: 30,
        },
      ],
    };
  }

  async function exportXLSX(data, deps) {
    if (window.KCAdminExport && typeof window.KCAdminExport.exportReportXLSX === 'function') {
      return window.KCAdminExport.exportReportXLSX(buildExportFilename('xlsx', data.periodDays), buildDashboardExportReport(data, deps));
    }
    await ensureXLSX(deps);
    var XLSX = window.XLSX;
    var workbook = XLSX.utils.book_new();
    var generatedAt = formatDateTimeBRValue(deps, new Date());
    var periodLabel = data.periodLabel || getPeriodLabelValue(deps, data.periodDays || 30);
    var dailyAvailable = data.dailyAvailable !== false;
    var trendsAvailable = data.trendsAvailable !== false;
    var auditAvailable = data.auditAvailable !== false && areAuditRowsAvailable(data.auditRows);

    var summarySheet = XLSX.utils.aoa_to_sheet(buildSummarySheetRows(data, periodLabel, generatedAt, deps));
    summarySheet['!cols'] = [{ wch: 20 }, { wch: 28 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumo Executivo');

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
    XLSX.utils.book_append_sheet(workbook, modulesSheet, 'Módulos');

    var alertsSheet = XLSX.utils.aoa_to_sheet(buildAlertRows(data));
    alertsSheet['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 64 }];
    XLSX.utils.book_append_sheet(workbook, alertsSheet, 'Alertas');

    var auditSheet = XLSX.utils.aoa_to_sheet(buildAuditRows(data, deps));
    auditSheet['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 18 }, { wch: 38 }, { wch: 26 }, { wch: 64 }];
    XLSX.utils.book_append_sheet(workbook, auditSheet, 'Audit log');

    XLSX.writeFile(workbook, buildExportFilename('xlsx', data.periodDays));
  }

  async function exportPDF(data, deps) {
    if (window.KCAdminExport && typeof window.KCAdminExport.exportReportPDF === 'function') {
      return window.KCAdminExport.exportReportPDF(buildExportFilename('pdf', data.periodDays), buildDashboardExportReport(data, deps));
    }
    await ensureJsPDF(deps);
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    var generatedAt = formatDateTimeBRValue(deps, new Date());
    var periodLabel = data.periodLabel || getPeriodLabelValue(deps, data.periodDays || 30);
    var dailyAvailable = data.dailyAvailable !== false;
    var trendsAvailable = data.trendsAvailable !== false;
    var auditAvailable = data.auditAvailable !== false && areAuditRowsAvailable(data.auditRows);
    var pageWidth = doc.internal.pageSize.getWidth();
    var pageHeight = doc.internal.pageSize.getHeight();
    var margin = 14;
    var usableWidth = pageWidth - (margin * 2);
    var y = 18;
    var visibleSeriesKeys = (typeof deps.getVisibleSeriesKeys === 'function' && deps.getVisibleSeriesKeys()) || getSeriesKeysValue(deps);
    var visibleSeriesMeta = getSeriesMeta(deps).filter(function (meta) {
      return visibleSeriesKeys.indexOf(meta.key) !== -1;
    });

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
        visibleSeriesKeys.forEach(function (key) {
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

      visibleSeriesMeta.forEach(function (meta) {
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
      var labelStride = Math.max(1, Math.ceil(series.length / 12));
      series.forEach(function (row, index) {
        if (index !== 0 && index !== series.length - 1 && index % labelStride !== 0) return;
        var step = series.length > 1 ? innerWidth / (series.length - 1) : innerWidth;
        var x = chartX + paddingHorizontal + (step * index);
        doc.text(row.label || '', x, chartY + chartHeight - 2, { align: 'center' });
      });

      y += chartHeight + 8;

      var totals = getSeriesTotalsValue(deps, series);
      var legendWidth = (usableWidth - 6) / 2;
      visibleSeriesMeta.forEach(function (meta, index) {
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
      y += Math.ceil(visibleSeriesMeta.length / 2) * 6 + 4;
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
      { label: 'Denúncias abertas', value: exportMetricValue(deps, data.reportMetrics && data.reportMetrics.open), detail: 'Backlog atual' },
      { label: 'Denúncias recebidas', value: exportMetricValue(deps, data.reportMetrics && data.reportMetrics.total), detail: periodLabel },
      { label: 'Posts ocultos atualizados', value: exportMetricValue(deps, data.postStatusMetrics && data.postStatusMetrics.hidden), detail: periodLabel },
      { label: 'Posts deletados atualizados', value: exportMetricValue(deps, data.postStatusMetrics && data.postStatusMetrics.deleted), detail: periodLabel },
      { label: 'Buscas registradas', value: exportMetricValue(deps, data.searchCount), detail: periodLabel },
      { label: 'Votos', value: exportMetricValue(deps, data.votesCount), detail: periodLabel },
      { label: 'Novos usuários', value: exportMetricValue(deps, data.usersNew), detail: periodLabel },
      { label: 'Posts salvos', value: exportMetricValue(deps, data.savedPostsCount), detail: periodLabel }
    ]);

    drawSectionHeader('Pulso diário', 'Atividade consolidada por dia para posts, comentários, buscas, votos e ações administrativas.');
    if (!dailyAvailable || !(data.dailyMetrics || []).length) {
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(
        dailyAvailable
          ? 'Nenhuma atividade diária encontrada no período selecionado.'
          : 'Pulso diário indisponível neste carregamento; a ausência de série não representa zero atividade.',
        margin,
        y
      );
      y += 6;
    } else {
      drawDailyChart(data.dailyMetrics || []);
    }

    drawWrappedList(
      'Top módulos por demanda',
      (trendsAvailable ? (data.moduleShareRows || []) : []).map(function (row) {
        var topTerms = Array.isArray(row.topTerms) && row.topTerms.length ? ' | Termos: ' + row.topTerms.join(', ') : '';
        return (row.label || row.module || 'Módulo') + ' - ' + (row.share || 0) + '% - ' + toNumberValue(deps, row.count) + ' buscas' + topTerms;
      }),
      trendsAvailable
        ? 'Sem dados suficientes para participação por módulo.'
        : 'Participação por módulo indisponível neste carregamento.'
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
      (trendsAvailable ? (data.trends || []) : []).slice(0, 12).map(function (item, index) {
        var moduleKey = resolveTermModuleValue(deps, item);
        return (index + 1) + '. ' + String((item && item.term) || '') + ' - ' + toNumberValue(deps, item && item.count) +
          (moduleKey ? ' (' + getModuleLabelValue(deps, moduleKey) + ')' : '');
      }),
      trendsAvailable
        ? 'Nenhuma busca registrada no período selecionado.'
        : 'Tendências de busca indisponíveis neste carregamento; a ausência de linhas não representa zero buscas.'
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
      doc.text(
        auditAvailable
          ? 'Nenhum evento encontrado para os filtros selecionados.'
          : 'Audit log indisponível neste carregamento; a ausência de linhas não representa zero eventos.',
        margin,
        y
      );
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
    if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = "'" + text;
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
      var initialData = getData(deps);
      csvBtn.disabled = !initialData
        || initialData.auditAvailable === false
        || !areAuditRowsAvailable(initialData.auditRows)
        || isDashboardBusy(deps);
      csvBtn.addEventListener('click', function () {
        var data = getData(deps);
        if (!data || data.auditAvailable === false || !areAuditRowsAvailable(data.auditRows) || isDashboardBusy(deps)) return;
        exportAuditCSV(data, deps);
      });
    }
  }

  function enableExport(deps) {
    var xlsxBtn = select(deps, '#admin-export-xlsx');
    var pdfBtn = select(deps, '#admin-export-pdf');
    var csvBtn = select(deps, '#admin-audit-export-csv');
    var currentData = getData(deps);
    var canExport = !!currentData && !isDashboardBusy(deps);
    var canExportAudit = canExport
      && currentData.auditAvailable !== false
      && areAuditRowsAvailable(currentData.auditRows);

    if (xlsxBtn) xlsxBtn.disabled = !canExport;
    if (pdfBtn) pdfBtn.disabled = !canExport;
    if (csvBtn) csvBtn.disabled = !canExportAudit;
    if (getExportBound(deps)) return;
    setExportBound(deps, true);

    if (xlsxBtn) {
      xlsxBtn.addEventListener('click', async function () {
        var data = getData(deps);
        if (!data || isDashboardBusy(deps)) return;
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
          xlsxBtn.disabled = isDashboardBusy(deps) || !getData(deps);
        }
      });
    }

    if (pdfBtn) {
      pdfBtn.addEventListener('click', async function () {
        var data = getData(deps);
        if (!data || isDashboardBusy(deps)) return;
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
          pdfBtn.disabled = isDashboardBusy(deps) || !getData(deps);
        }
      });
    }
  }

  async function loadMoreAudit(deps) {
    if (getStateBucket().pending) return;
    var client = getClient(deps);
    if (!client) return;
    var auditFilters = getAppliedAuditFilters(deps);
    var periodDays = getSelectedPeriodDaysValue(deps);
    var since = getPeriodRangeValue(deps, periodDays).since;
    var btn = select(deps, '#admin-audit-load-more');
    var pageSize = getAuditPageSize(deps);
    var requestSeq = bumpAuditRequestSeq();
    setAuditPending(requestSeq, true, deps);
    setAuditLoadMoreState({ visible: true, disabled: true, label: 'Carregando...', preserveLabel: true }, deps);

    try {
      var rows = await loadAuditLog(client, pageSize, getAuditOffset(deps), auditFilters, since, deps);
      if (!areAuditRowsAvailable(rows)) throw new Error('Audit log unavailable');
      await loadActorsById(client, rows.map(function (row) { return row && row.actor_id; }), deps);
      if (!isCurrentAuditRequest(requestSeq)) return;
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
      if (!isCurrentAuditRequest(requestSeq)) return;
      console.error('[Admin audit] loadMore:', error);
      setAuditLoadMoreState({ visible: true, disabled: false }, deps);
    } finally {
      if (isCurrentAuditRequest(requestSeq) && btn && btn.textContent === 'Carregando...') {
        setAuditLoadMoreState({ visible: true, disabled: false }, deps);
      }
      setAuditPending(requestSeq, false, deps);
    }
  }

  async function filterAudit(deps) {
    var client = getClient(deps);
    if (!client) return;
    var auditFilters = readAuditFilters(deps);
    var periodDays = getSelectedPeriodDaysValue(deps);
    var since = getPeriodRangeValue(deps, periodDays).since;
    var pageSize = getAuditPageSize(deps);
    var requestSeq = bumpAuditRequestSeq();
    var previousOffset = getAuditOffset(deps);
    var btn = select(deps, '#admin-audit-load-more');
    var previousButtonState = btn ? {
      visible: btn.style.display !== 'none',
      disabled: !!btn.disabled,
      label: btn.textContent || 'Carregar mais',
      preserveLabel: true
    } : null;
    setAuditPending(requestSeq, true, deps);
    setAuditOffset(deps, 0);
    setAuditLoadMoreState({ visible: true, disabled: true, label: 'Filtrando...', preserveLabel: true }, deps);

    try {
      var rows = await loadAuditLog(client, pageSize, 0, auditFilters, since, deps);
      if (!areAuditRowsAvailable(rows)) throw new Error('Audit log unavailable');
      await loadActorsById(client, rows.map(function (row) { return row && row.actor_id; }), deps);
      if (!isCurrentAuditRequest(requestSeq)) return;
      setAuditOffset(deps, rows.length);
      var data = getData(deps) || {};
      data.auditRows = rows;
      setData(deps, data);
      setAppliedAuditFilters(auditFilters, deps);
      renderAuditRows(rows, false, deps);
      renderAuditSummary(rows, auditFilters, deps);
      if (!rows.length) {
        setAuditLoadMoreState({ visible: true, disabled: true, label: 'Sem mais resultados', preserveLabel: true }, deps);
      }
    } catch (error) {
      if (!isCurrentAuditRequest(requestSeq)) return;
      console.error('[Admin audit] filter:', error);
      setAuditOffset(deps, previousOffset);
      setAuditLoadMoreState(previousButtonState || { visible: true, disabled: false }, deps);
    } finally {
      if (isCurrentAuditRequest(requestSeq) && btn && btn.textContent === 'Filtrando...') {
        setAuditLoadMoreState({ visible: true, disabled: false }, deps);
      }
      setAuditPending(requestSeq, false, deps);
    }
  }

  window._KCAD.audit = {
    beginRequest: bumpAuditRequestSeq,
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
    isCurrentRequest: isCurrentAuditRequest,
    normalizeAuditFilters: normalizeAuditFilters,
    readAuditFilters: readAuditFilters,
    renderAuditRows: renderAuditRows
  };
})();

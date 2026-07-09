/*
  KinoCampus - Admin GA4 Dashboard Controller (V8.6.4)

  Reads from Edge Function kc-ga4-reports which proxies Google Analytics 4
  Data API. Requires admin access (profiles.is_admin = true).

  Phase 3 of GA4-AUDIT-2026-07-08.

  Features:
  - Real-time cards: today vs yesterday (views, users, events, sessions)
  - 7-day trend sparkline (page views per day)
  - Top events table (sorted by eventCount)
  - Top pages by views
  - Module breakdown (by pagePath regex)
  - Engagement funnel (views -> shares -> contacts)
  - Auto-refresh every 60s (paused when tab is hidden)
*/

(function () {
  'use strict';

  var REFRESH_INTERVAL_MS = 60_000;
  var MODULE_PATTERNS = [
    { key: 'eventos', label: 'Eventos', test: function (p) { return /^\/eventos\.html/.test(p); } },
    { key: 'oportunidades', label: 'Oportunidades', test: function (p) { return /^\/oportunidades\.html/.test(p); } },
    { key: 'moradia', label: 'Moradia', test: function (p) { return /^\/moradia\.html/.test(p); } },
    { key: 'compra-venda', label: 'Compra/Venda', test: function (p) { return /^\/compra-venda-feed\.html/.test(p); } },
    { key: 'caronas', label: 'Caronas', test: function (p) { return /^\/caronas-feed\.html/.test(p); } },
    { key: 'achados-perdidos', label: 'Achados/Perdidos', test: function (p) { return /^\/achados-perdidos\.html/.test(p); } },
    { key: 'mensagens', label: 'Chat', test: function (p) { return /^\/mensagens\.html/.test(p); } },
    { key: 'profile', label: 'Perfil', test: function (p) { return /^\/profile\.html/.test(p); } },
    { key: 'create', label: 'Criar post', test: function (p) { return /^\/create-post\.html/.test(p); } },
    { key: 'home', label: 'Home', test: function (p) { return /^\/(index\.html)?(\?.*)?$/.test(p); } },
  ];

  // ── DOM helpers ─────────────────────────────────────────────────────────
  function $(sel) { return document.querySelector(sel); }
  function fmtNumber(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    if (Math.abs(n) >= 1000) return n.toLocaleString('pt-BR');
    return String(n);
  }
  function fmtPct(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    var sign = n > 0 ? '+' : '';
    return sign + n.toFixed(1) + '%';
  }
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── Session / auth ─────────────────────────────────────────────────────
  async function getAccessToken() {
    if (window.KCSupabase && typeof window.KCSupabase.refreshSession === 'function') {
      try {
        var r = await window.KCSupabase.refreshSession();
        if (r && r.access_token) return r.access_token;
      } catch (_) {}
    }
    if (window.KCSupabase && typeof window.KCSupabase.getSession === 'function') {
      var s = window.KCSupabase.getSession();
      if (s && s.access_token) return s.access_token;
    }
    if (window.KCSupabase && typeof window.KCSupabase.getClient === 'function') {
      var c = window.KCSupabase.getClient();
      if (c && c.auth && typeof c.auth.getSession === 'function') {
        try {
          var res = await c.auth.getSession();
          var sess = res && res.data && res.data.session;
          if (sess && sess.access_token) return sess.access_token;
        } catch (_) {}
      }
    }
    return '';
  }

  async function checkAdminAccess() {
    if (!window.KCAPI || typeof window.KCAPI.getCurrentUser !== 'function') return false;
    var user = await window.KCAPI.getCurrentUser();
    if (!user) return false;
    if (!window.KCSupabase || typeof window.KCSupabase.getClient !== 'function') return false;
    var client = window.KCSupabase.getClient();
    if (!client) return false;
    try {
      var res = await client.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
      if (res && res.error) return false;
      return !!(res && res.data && res.data.is_admin === true);
    } catch (_) { return false; }
  }

  // ── Edge Function call ─────────────────────────────────────────────────
  function getSupabaseUrl() {
    if (window.KCSupabase && typeof window.KCSupabase.getUrl === 'function') {
      return window.KCSupabase.getUrl();
    }
    if (window.KC_ENV && window.KC_ENV.supabaseUrl) return window.KC_ENV.supabaseUrl;
    // Fallback: read from existing supabase client URL
    if (window.KCSupabase && typeof window.KCSupabase.getClient === 'function') {
      var c = window.KCSupabase.getClient();
      if (c && c.supabaseUrl) return c.supabaseUrl;
    }
    return '';
  }

  async function callGa4Reports(body) {
    var token = await getAccessToken();
    if (!token) throw new Error('no_session');
    var baseUrl = getSupabaseUrl();
    if (!baseUrl) throw new Error('no_supabase_url');
    var url = baseUrl.replace(/\/+$/, '') + '/functions/v1/kc-ga4-reports';
    var res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    var text = await res.text();
    var json = null;
    try { json = JSON.parse(text); } catch (_) {}
    if (!res.ok) {
      var msg = (json && (json.error || json.message)) || ('HTTP ' + res.status);
      throw new Error(msg);
    }
    return json && json.data;
  }

  // ── Renderers ──────────────────────────────────────────────────────────
  function setError(msg) {
    var el = $('#ga4-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
  }
  function clearError() {
    var el = $('#ga4-error');
    if (!el) return;
    el.textContent = '';
    el.style.display = 'none';
  }
  function setStatus(text) {
    var el = $('#ga4LastSync');
    if (el) el.textContent = text;
  }

  function renderSummary(rows) {
    // rows: [{dateRanges:[{startDate,endDate}], metrics:[{name}], value:number}]
    var today = rows.today || {};
    var yesterday = rows.yesterday || {};
    var sevenDays = rows.sevenDays || {};

    var views = today.views || 0;
    var prevViews = yesterday.views || 0;
    var users = today.users || 0;
    var prevUsers = yesterday.users || 0;
    var events = today.events || 0;
    var prevEvents = yesterday.events || 0;
    var sessions = today.sessions || 0;
    var prevSessions = yesterday.sessions || 0;

    var pct = function (cur, prev) {
      if (!prev) return 0;
      return ((cur - prev) / prev) * 100;
    };

    var summary = $('#ga4Summary');
    if (!summary) return;
    summary.innerHTML =
      card('Visualizações', views, prevViews, pct(views, prevViews)) +
      card('Usuários', users, prevUsers, pct(users, prevUsers)) +
      card('Eventos', events, prevEvents, pct(events, prevEvents)) +
      card('Sessões', sessions, prevSessions, pct(sessions, prevSessions)) +
      card('Eventos 7d', sevenDays.events || 0, null, null) +
      card('Usuários 7d', sevenDays.users || 0, null, null);

    function card(label, value, prev, delta) {
      var deltaHtml = '';
      if (prev !== null && prev !== undefined) {
        var cls = delta >= 0 ? 'is-up' : 'is-down';
        var arrow = delta >= 0 ? 'fa-arrow-up' : 'fa-arrow-down';
        deltaHtml = '<small class="' + cls + '"><i class="fas ' + arrow + '"></i> ' + fmtPct(delta) + ' vs ontem</small>';
      } else {
        deltaHtml = '<small>vs ' + fmtNumber(prev || 0) + ' ontem</small>';
      }
      return '<div class="kc-privacy-metric">' +
        '<span>' + escapeHtml(label) + '</span>' +
        '<strong>' + fmtNumber(value) + '</strong>' +
        deltaHtml +
      '</div>';
    }
  }

  function renderTrend(rows) {
    var el = $('#ga4TrendBody');
    if (!el) return;
    if (!rows || rows.length === 0) {
      el.innerHTML = '<tr><td colspan="2" class="kc-admin-empty">Sem dados no período.</td></tr>';
      return;
    }
    var max = Math.max.apply(null, rows.map(function (r) { return r.views || 0; })) || 1;
    var html = rows.map(function (r) {
      var widthPct = Math.max(2, ((r.views || 0) / max) * 100);
      return '<tr>' +
        '<td>' + escapeHtml(r.date || '') + '</td>' +
        '<td><span class="kc-ga4-bar" style="width:' + widthPct.toFixed(1) + '%"></span>' +
        '<span class="kc-ga4-bar-value">' + fmtNumber(r.views || 0) + '</span></td>' +
      '</tr>';
    }).join('');
    el.innerHTML = html;
  }

  function renderEvents(rows) {
    var el = $('#ga4EventsBody');
    if (!el) return;
    if (!rows || rows.length === 0) {
      el.innerHTML = '<tr><td colspan="3" class="kc-admin-empty">Sem eventos customizados no período.</td></tr>';
      return;
    }
    el.innerHTML = rows.map(function (r) {
      var name = String(r.event || '').replace(/^kc_/, '');
      var nameHtml = '<code>kc_' + escapeHtml(name) + '</code>';
      return '<tr>' +
        '<td>' + nameHtml + '</td>' +
        '<td>' + fmtNumber(r.count || 0) + '</td>' +
        '<td>' + fmtNumber(r.users || 0) + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderPages(rows) {
    var el = $('#ga4PagesBody');
    if (!el) return;
    if (!rows || rows.length === 0) {
      el.innerHTML = '<tr><td colspan="2" class="kc-admin-empty">Sem páginas vistas no período.</td></tr>';
      return;
    }
    el.innerHTML = rows.map(function (r) {
      var p = String(r.path || '');
      return '<tr>' +
        '<td><code>' + escapeHtml(p) + '</code></td>' +
        '<td>' + fmtNumber(r.views || 0) + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderModuleBreakdown(rows) {
    var el = $('#ga4ModulesBody');
    if (!el) return;
    var total = rows.reduce(function (acc, r) { return acc + (r.views || 0); }, 0);
    if (total === 0) {
      el.innerHTML = '<tr><td colspan="2" class="kc-admin-empty">Sem dados no período.</td></tr>';
      return;
    }
    el.innerHTML = rows.map(function (r) {
      var pct = total ? ((r.views / total) * 100).toFixed(1) : '0.0';
      return '<tr>' +
        '<td>' + escapeHtml(r.label) + '</td>' +
        '<td>' + fmtNumber(r.views) + ' <small>(' + pct + '%)</small></td>' +
      '</tr>';
    }).join('');
  }

  function renderFunnel(rows) {
    var el = $('#ga4Funnel');
    if (!el) return;
    var v = rows.views || 0;
    var s = rows.shares || 0;
    var c = rows.contacts || 0;
    var ch = rows.chats || 0;
    var step = function (label, n, baseN) {
      var ratio = baseN ? Math.min(100, (n / baseN) * 100) : 0;
      return '<div class="kc-funnel-step">' +
        '<span class="kc-funnel-label">' + escapeHtml(label) + '</span>' +
        '<span class="kc-funnel-bar" style="width:' + ratio.toFixed(1) + '%"></span>' +
        '<span class="kc-funnel-value">' + fmtNumber(n) + '</span>' +
      '</div>';
    };
    el.innerHTML = step('Visualizações', v, v) +
      step('Compartilhamentos', s, v) +
      step('Cliques em contato', c, v) +
      step('Conversas iniciadas', ch, v);
  }

  // ── Data fetch + orchestration ─────────────────────────────────────────
  function rowsToMetricsMap(rows) {
    // rows[0].metricValues: [{value:"123"}] in metrics order
    var out = {};
    if (!rows || rows.length === 0) return out;
    var first = rows[0];
    if (!first.metricValues) return out;
    // We assume metrics are passed in order: [views, users, events, sessions]
    var keys = ['views', 'users', 'events', 'sessions'];
    first.metricValues.forEach(function (mv, i) {
      var key = keys[i];
      if (key) out[key] = parseInt(mv.value, 10) || 0;
    });
    return out;
  }

  function rowsToEventMap(rows) {
    var out = {};
    if (!rows || rows.length === 0) return out;
    rows.forEach(function (r) {
      var name = r.dimensionValues && r.dimensionValues[0] ? r.dimensionValues[0].value : '';
      var count = r.metricValues && r.metricValues[0] ? parseInt(r.metricValues[0].value, 10) || 0 : 0;
      var users = r.metricValues && r.metricValues[1] ? parseInt(r.metricValues[1].value, 10) || 0 : 0;
      if (name) out[name] = { count: count, users: users };
    });
    return out;
  }

  function rowsToPagesMap(rows) {
    var out = [];
    if (!rows) return out;
    rows.forEach(function (r) {
      var path = r.dimensionValues && r.dimensionValues[0] ? r.dimensionValues[0].value : '';
      var views = r.metricValues && r.metricValues[0] ? parseInt(r.metricValues[0].value, 10) || 0 : 0;
      if (path) out.push({ path: path, views: views });
    });
    return out;
  }

  function rowsToTrendMap(rows) {
    var out = [];
    if (!rows) return out;
    rows.forEach(function (r) {
      var date = r.dimensionValues && r.dimensionValues[0] ? r.dimensionValues[0].value : '';
      var views = r.metricValues && r.metricValues[0] ? parseInt(r.metricValues[0].value, 10) || 0 : 0;
      if (date) out.push({ date: date, views: views });
    });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  function aggregateModuleBreakdown(pages) {
    var agg = {};
    MODULE_PATTERNS.forEach(function (m) { agg[m.key] = { key: m.key, label: m.label, views: 0 }; });
    pages.forEach(function (p) {
      for (var i = 0; i < MODULE_PATTERNS.length; i++) {
        var m = MODULE_PATTERNS[i];
        if (m.test(p.path)) {
          agg[m.key].views += p.views;
          return;
        }
      }
      agg.other = agg.other || { key: 'other', label: 'Outros', views: 0 };
      agg.other.views += p.views;
    });
    return Object.values(agg).filter(function (m) { return m.views > 0; }).sort(function (a, b) { return b.views - a.views; });
  }

  async function loadDashboard() {
    clearError();
    setStatus('Carregando métricas...');

    try {
      // 1) Today + yesterday + 7d (single batch of 3 calls)
      var todayRes = await callGa4Reports({
        dateRanges: [{ startDate: 'today', endDate: 'today' }],
        metrics: [
          { name: 'screenPageViews' },
          { name: 'totalUsers' },
          { name: 'eventCount' },
          { name: 'sessions' },
        ],
      });

      var yesterdayRes = await callGa4Reports({
        dateRanges: [{ startDate: 'yesterday', endDate: 'yesterday' }],
        metrics: [
          { name: 'screenPageViews' },
          { name: 'totalUsers' },
          { name: 'eventCount' },
          { name: 'sessions' },
        ],
      });

      var sevenDaysRes = await callGa4Reports({
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        metrics: [
          { name: 'screenPageViews' },
          { name: 'totalUsers' },
          { name: 'eventCount' },
        ],
      });

      renderSummary({
        today: rowsToMetricsMap(todayRes.rows),
        yesterday: rowsToMetricsMap(yesterdayRes.rows),
        sevenDays: rowsToMetricsMap(sevenDaysRes.rows),
      });

      // 2) 7-day trend
      var trendRes = await callGa4Reports({
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
        limit: 8,
      });
      renderTrend(rowsToTrendMap(trendRes.rows));

      // 3) Top events (filter kc_*)
      var eventsRes = await callGa4Reports({
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            stringFilter: { value: 'kc_', matchType: 'BEGINS_WITH' },
          },
        },
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
        limit: 20,
      });
      renderEvents(rowsToEventMap(eventsRes.rows));

      // 4) Top pages
      var pagesRes = await callGa4Reports({
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 10,
      });
      var pagesList = rowsToPagesMap(pagesRes.rows);
      renderPages(pagesList);

      // 5) Module breakdown
      renderModuleBreakdown(aggregateModuleBreakdown(pagesList));

      // 6) Funnel: views / shares / contacts / chats
      var eventMap = rowsToEventMap(eventsRes.rows);
      var pagesMap = {};
      pagesList.forEach(function (p) { pagesMap[p.path] = p.views; });
      var totalViews = pagesList.reduce(function (acc, p) { return acc + (p.views || 0); }, 0);
      renderFunnel({
        views: totalViews,
        shares: (eventMap.kc_share && eventMap.kc_share.count) || 0,
        contacts: (eventMap.kc_contact_click && eventMap.kc_contact_click.count) || 0,
        chats: (eventMap.kc_chat_open && eventMap.kc_chat_open.count) || 0,
      });

      setStatus('Atualizado às ' + new Date().toLocaleTimeString('pt-BR'));
    } catch (err) {
      var msg = err && err.message ? err.message : String(err);
      setError('Falha ao carregar: ' + msg);
      setStatus('Erro às ' + new Date().toLocaleTimeString('pt-BR'));
    }
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────
  var refreshTimer = null;

  async function init() {
    var loading = $('#admin-loading');
    var content = $('#admin-content');

    var ok = await checkAdminAccess();
    if (!ok) {
      if (loading) loading.style.display = 'none';
      setError('Acesso negado. Faça login como administrador para ver o dashboard GA4.');
      return;
    }
    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'block';

    var refreshBtn = $('#ga4RefreshButton');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        loadDashboard().catch(function (e) { console.error('[ga4-dashboard] refresh failed:', e); });
      });
    }

    await loadDashboard();

    // Auto-refresh every 60s, paused when tab hidden
    function scheduleRefresh() {
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = setInterval(function () {
        if (document.visibilityState === 'visible') {
          loadDashboard().catch(function (e) { console.error('[ga4-dashboard] auto-refresh failed:', e); });
        }
      }, REFRESH_INTERVAL_MS);
    }
    scheduleRefresh();
    document.addEventListener('visibilitychange', scheduleRefresh);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init().catch(function (e) { console.error('[ga4-dashboard] init failed:', e); });
    });
  } else {
    init().catch(function (e) { console.error('[ga4-dashboard] init failed:', e); });
  }
})();

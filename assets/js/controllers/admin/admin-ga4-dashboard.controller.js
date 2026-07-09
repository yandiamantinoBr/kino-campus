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
  // setError / clearError target the OUTER #admin-error (outside
  // #admin-content) so all errors (auth denied, data fetch failed,
  // etc.) surface even when the inner content panel is hidden.
  function setError(msg) {
    var el = $('#admin-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
  }
  function clearError() {
    var el = $('#admin-error');
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

  function fmtDuration(seconds) {
    if (typeof seconds !== 'number' || !isFinite(seconds) || seconds < 0) return '—';
    if (seconds < 60) return seconds.toFixed(0) + 's';
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    if (m < 60) return m + 'min' + (s ? ' ' + s + 's' : '');
    var h = Math.floor(m / 60);
    var rm = m % 60;
    return h + 'h' + (rm ? ' ' + rm + 'm' : '');
  }

  function renderEngagement(m) {
    var avg = m.avgSessionDuration || 0;
    var bounce = (m.bounceRate || 0) * 100;
    var eng = (m.engagementRate || 0) * 100;
    var engagedSessions = m.engagedSessions || 0;
    var sessionsPerUser = m.sessionsPerUser || 0;

    var avgEl = $('#ga4AvgSession');
    var bounceEl = $('#ga4BounceRate');
    var engEl = $('#ga4EngagementRate');
    var esEl = $('#ga4EngagedSessions');
    var spuEl = $('#ga4SessionsPerUser');

    if (avgEl) avgEl.textContent = fmtDuration(avg);
    if (bounceEl) bounceEl.textContent = bounce.toFixed(1) + '%';
    if (engEl) engEl.textContent = eng.toFixed(1) + '%';
    if (esEl) esEl.textContent = fmtNumber(engagedSessions);
    if (spuEl) spuEl.textContent = sessionsPerUser.toFixed(2);
  }

  function renderNewVsReturning(m) {
    var el = $('#ga4NewReturningBody');
    if (!el) return;
    var total = m.total || 0;
    if (!total) {
      el.innerHTML = '<tr><td colspan="2" class="kc-admin-empty">Sem dados.</td></tr>';
      return;
    }
    var newPct = total ? ((m.new / total) * 100).toFixed(1) : '0.0';
    var retPct = total ? ((m.returning / total) * 100).toFixed(1) : '0.0';
    el.innerHTML =
      '<tr><td><i class="fas fa-user-plus"></i> Novos</td><td>' + fmtNumber(m.new) + ' <small>(' + newPct + '%)</small></td></tr>' +
      '<tr><td><i class="fas fa-user-check"></i> Recorrentes</td><td>' + fmtNumber(m.returning) + ' <small>(' + retPct + '%)</small></td></tr>';
  }

  function renderDevices(rows) {
    var el = $('#ga4DevicesBody');
    if (!el) return;
    if (!rows || rows.length === 0) {
      el.innerHTML = '<tr><td colspan="2" class="kc-admin-empty">Sem dados.</td></tr>';
      return;
    }
    var labelMap = {
      desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet',
      smart_tv: 'Smart TV', smart_speaker: 'Smart Speaker',
      wearable: 'Wearable', 'connected_tv': 'TV conectada', other: 'Outro',
    };
    var total = rows.reduce(function (acc, r) { return acc + r.count; }, 0);
    el.innerHTML = rows.map(function (r) {
      var label = labelMap[r.key] || r.key;
      var pct = total ? ((r.count / total) * 100).toFixed(1) : '0.0';
      return '<tr><td>' + escapeHtml(label) + '</td><td>' + fmtNumber(r.count) + ' <small>(' + pct + '%)</small></td></tr>';
    }).join('');
  }

  function renderTrafficSources(rows) {
    var el = $('#ga4SourcesBody');
    if (!el) return;
    if (!rows || rows.length === 0) {
      el.innerHTML = '<tr><td colspan="2" class="kc-admin-empty">Sem dados.</td></tr>';
      return;
    }
    var labelMap = {
      'Organic Search': '<i class="fas fa-magnifying-glass"></i> Busca orgânica',
      'Direct': '<i class="fas fa-link"></i> Direto',
      'Referral': '<i class="fas fa-share-nodes"></i> Referral',
      'Organic Social': '<i class="fas fa-hashtag"></i> Social orgânico',
      'Paid Social': '<i class="fas fa-bullhorn"></i> Social pago',
      'Paid Search': '<i class="fas fa-ad"></i> Busca paga',
      'Email': '<i class="fas fa-envelope"></i> E-mail',
      'Display': '<i class="fas fa-image"></i> Display',
      'Affiliates': '<i class="fas fa-handshake"></i> Afiliados',
      'Video': '<i class="fas fa-film"></i> Vídeo',
      'Unassigned': '<i class="fas fa-question"></i> Não atribuído',
    };
    var total = rows.reduce(function (acc, r) { return acc + r.count; }, 0);
    el.innerHTML = rows.map(function (r) {
      var label = labelMap[r.key] || ('<i class="fas fa-tag"></i> ' + escapeHtml(r.key));
      var pct = total ? ((r.count / total) * 100).toFixed(1) : '0.0';
      return '<tr><td>' + label + '</td><td>' + fmtNumber(r.count) + ' <small>(' + pct + '%)</small></td></tr>';
    }).join('');
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

  function rowsToEngagementMap(rows) {
    var out = {};
    if (!rows || rows.length === 0 || !rows[0].metricValues) return out;
    var keys = ['avgSessionDuration', 'bounceRate', 'engagementRate', 'engagedSessions', 'sessionsPerUser'];
    rows[0].metricValues.forEach(function (mv, i) {
      var k = keys[i];
      if (!k) return;
      var v = parseFloat(mv.value);
      out[k] = isNaN(v) ? 0 : v;
    });
    return out;
  }

  function rowsToNewVsReturningMap(rows) {
    var out = { new: 0, returning: 0, total: 0 };
    if (!rows) return out;
    rows.forEach(function (r) {
      var dim = r.dimensionValues && r.dimensionValues[0] ? String(r.dimensionValues[0].value).toLowerCase() : '';
      var val = r.metricValues && r.metricValues[0] ? parseInt(r.metricValues[0].value, 10) || 0 : 0;
      if (dim === 'new') out.new += val;
      else if (dim === 'returning') out.returning += val;
      out.total += val;
    });
    return out;
  }

  function rowsToDimensionCountMap(rows) {
    var out = [];
    if (!rows) return out;
    rows.forEach(function (r) {
      var dim = r.dimensionValues && r.dimensionValues[0] ? r.dimensionValues[0].value : '';
      var val = r.metricValues && r.metricValues[0] ? parseInt(r.metricValues[0].value, 10) || 0 : 0;
      if (dim) out.push({ key: dim, count: val });
    });
    return out;
  }

  // ── CSV export ─────────────────────────────────────────────────────────
  // Build a multi-section CSV from the last loaded data snapshot.
  // Empty snapshot → message in setError.
  function snapshotRowsToCsv(snap) {
    if (!snap || !snap.startedAt) return null;
    var csv = [];
    csv.push('# KinoCampus GA4 dashboard snapshot');
    csv.push('# Generated: ' + snap.startedAt);
    csv.push('');

    // Section: Summary (today vs yesterday)
    if (snap.summary) {
      csv.push('== Summary (today vs yesterday) ==');
      csv.push('metric,today,yesterday,delta_pct');
      var keys = ['views', 'users', 'events', 'sessions'];
      var labels = { views: 'Visualizações', users: 'Usuários', events: 'Eventos', sessions: 'Sessões' };
      keys.forEach(function (k) {
        var t = (snap.summary.today && snap.summary.today[k]) || 0;
        var y = (snap.summary.yesterday && snap.summary.yesterday[k]) || 0;
        var pct = y ? (((t - y) / y) * 100).toFixed(1) : '0.0';
        csv.push([labels[k], t, y, pct].join(','));
      });
      if (snap.summary.sevenDays) {
        csv.push('');
        csv.push('== 7-day totals ==');
        csv.push('metric,value');
        csv.push('Visualizações 7d,' + (snap.summary.sevenDays.views || 0));
        csv.push('Usuários 7d,' + (snap.summary.sevenDays.users || 0));
        csv.push('Eventos 7d,' + (snap.summary.sevenDays.events || 0));
      }
      csv.push('');
    }

    // Section: Trend (7 days page views)
    if (snap.trend) {
      csv.push('== 7-day trend (page views) ==');
      csv.push('date,views');
      snap.trend.forEach(function (t) { csv.push([t.date, t.views].join(',')); });
      csv.push('');
    }

    // Section: Funnel
    if (snap.funnel) {
      csv.push('== Funnel (7 days) ==');
      csv.push('step,count,conversion_pct');
      var f = snap.funnel;
      var base = f.views || 0;
      csv.push(['Visualizações', f.views || 0, '100.0'].join(','));
      csv.push(['Compartilhamentos', f.shares || 0, base ? ((f.shares / base) * 100).toFixed(1) : '0.0'].join(','));
      csv.push(['Cliques em contato', f.contacts || 0, base ? ((f.contacts / base) * 100).toFixed(1) : '0.0'].join(','));
      csv.push(['Conversas iniciadas', f.chats || 0, base ? ((f.chats / base) * 100).toFixed(1) : '0.0'].join(','));
      csv.push('');
    }

    // Section: Top kc_* events
    if (snap.events) {
      csv.push('== Custom events kc_* (7 days) ==');
      csv.push('event,count,users');
      snap.events.forEach(function (r) {
        csv.push([r.key || r.event, r.count, r.users].join(','));
      });
      csv.push('');
    }

    // Section: Top pages
    if (snap.pages) {
      csv.push('== Top pages by views (7 days) ==');
      csv.push('path,views');
      snap.pages.forEach(function (r) { csv.push([r.path, r.views].join(',')); });
      csv.push('');
    }

    // Section: Module breakdown
    if (snap.modules) {
      csv.push('== Module breakdown (7 days) ==');
      csv.push('module,views');
      snap.modules.forEach(function (r) { csv.push([r.label, r.views].join(',')); });
      csv.push('');
    }

    // Section: New vs Returning
    if (snap.newReturning) {
      var n = snap.newReturning;
      csv.push('== New vs Returning (7 days) ==');
      csv.push('type,users,pct');
      var total = (n.new || 0) + (n.returning || 0);
      csv.push(['Novos', n.new || 0, total ? ((n.new / total) * 100).toFixed(1) : '0.0'].join(','));
      csv.push(['Recorrentes', n.returning || 0, total ? ((n.returning / total) * 100).toFixed(1) : '0.0'].join(','));
      csv.push('');
    }

    // Section: Devices
    if (snap.devices) {
      csv.push('== Devices (7 days) ==');
      csv.push('category,views');
      snap.devices.forEach(function (r) { csv.push([r.key, r.count].join(',')); });
      csv.push('');
    }

    // Section: Traffic sources
    if (snap.sources) {
      csv.push('== Traffic sources (7 days) ==');
      csv.push('channel,sessions');
      snap.sources.forEach(function (r) { csv.push([r.key, r.count].join(',')); });
      csv.push('');
    }

    // Engagement
    if (snap.engagement) {
      csv.push('== Engagement (7 days) ==');
      csv.push('metric,value');
      csv.push('avg_session_duration_seconds,' + (snap.engagement.avgSessionDuration || 0));
      csv.push('bounce_rate_pct,' + ((snap.engagement.bounceRate || 0) * 100).toFixed(2));
      csv.push('engagement_rate_pct,' + ((snap.engagement.engagementRate || 0) * 100).toFixed(2));
      csv.push('engaged_sessions,' + (snap.engagement.engagedSessions || 0));
      csv.push('sessions_per_user,' + (snap.engagement.sessionsPerUser || 0).toFixed(2));
    }
    return csv.join('\n');
  }

  function csvEscape(v) {
    var s = String(v == null ? '' : v);
    if (/[,"\n]/.test(s)) return '"' + s.replaceAll('"', '""') + '"';
    return s;
  }

  function exportCsv() {
    var snap = window.__KCGa4Data;
    if (!snap || !snap.startedAt) {
      setError('Sem dados para exportar. Aguarde o carregamento inicial.');
      return;
    }
    var csv = snapshotRowsToCsv(snap);
    if (!csv) { setError('Falha ao gerar CSV'); return; }
    // BOM for Excel UTF-8 detection
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
    a.href = url;
    a.download = 'kc-ga4-' + ts + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
    if (window.KCEvents && typeof window.KCEvents.track === 'function') {
      window.KCEvents.track('kc_csv_export', { source: 'ga4-dashboard' });
    }
  }

  async function loadDashboard() {
    clearError();
    setStatus('Carregando métricas...');

    // Reset snapshot for CSV export
    if (!window.__KCGa4Data) window.__KCGa4Data = {};
    window.__KCGa4Data.startedAt = new Date().toISOString();
    window.__KCGa4Data.queries = {};

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
      window.__KCGa4Data.summary = {
        today: rowsToMetricsMap(todayRes.rows),
        yesterday: rowsToMetricsMap(yesterdayRes.rows),
        sevenDays: rowsToMetricsMap(sevenDaysRes.rows),
      };

      // 2) 7-day trend
      var trendRes = await callGa4Reports({
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
        limit: 8,
      });
      var trendList = rowsToTrendMap(trendRes.rows);
      renderTrend(trendList);
      window.__KCGa4Data.trend = trendList;

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
      var eventsList = rowsToEventMap(eventsRes.rows);
      var eventsListArr = Object.keys(eventsList).map(function (k) { return { key: k, count: eventsList[k].count, users: eventsList[k].users }; }).sort(function (a, b) { return b.count - a.count; });
      renderEvents(eventsList);
      window.__KCGa4Data.events = eventsListArr;

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
      window.__KCGa4Data.pages = pagesList;

      // 5) Module breakdown
      var modulesList = aggregateModuleBreakdown(pagesList);
      renderModuleBreakdown(modulesList);
      window.__KCGa4Data.modules = modulesList;

      // 6) Funnel: views / shares / contacts / chats
      var eventMap = rowsToEventMap(eventsRes.rows);
      var pagesMap = {};
      pagesList.forEach(function (p) { pagesMap[p.path] = p.views; });
      var totalViews = pagesList.reduce(function (acc, p) { return acc + (p.views || 0); }, 0);
      var funnelSnapshot = {
        views: totalViews,
        shares: (eventMap.kc_share && eventMap.kc_share.count) || 0,
        contacts: (eventMap.kc_contact_click && eventMap.kc_contact_click.count) || 0,
        chats: (eventMap.kc_chat_open && eventMap.kc_chat_open.count) || 0,
      };
      renderFunnel(funnelSnapshot);
      window.__KCGa4Data.funnel = funnelSnapshot;

      // 7) Engagement metrics (7d): avg engagement time, bounce rate, engagement rate
      var engagementRes = await callGa4Reports({
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        metrics: [
          { name: 'averageSessionDuration' },
          { name: 'bounceRate' },
          { name: 'engagementRate' },
          { name: 'engagedSessions' },
          { name: 'sessionsPerUser' },
        ],
      });
      var engagementMap = rowsToEngagementMap(engagementRes.rows);
      renderEngagement(engagementMap);
      window.__KCGa4Data.engagement = engagementMap;

      // 8) New vs Returning users (7d)
      var newVsReturningRes = await callGa4Reports({
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'newVsReturning' }],
        metrics: [{ name: 'totalUsers' }],
        orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
        limit: 5,
      });
      var nrMap = rowsToNewVsReturningMap(newVsReturningRes.rows);
      renderNewVsReturning(nrMap);
      window.__KCGa4Data.newReturning = nrMap;

      // 9) Device breakdown (7d)
      var devicesRes = await callGa4Reports({
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'deviceCategory' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 10,
      });
      var devicesList = rowsToDimensionCountMap(devicesRes.rows);
      renderDevices(devicesList);
      window.__KCGa4Data.devices = devicesList;

      // 10) Traffic sources (7d)
      var sourcesRes = await callGa4Reports({
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10,
      });
      var sourcesList = rowsToDimensionCountMap(sourcesRes.rows);
      renderTrafficSources(sourcesList);
      window.__KCGa4Data.sources = sourcesList;

      window.__KCGa4Data.loadedAt = new Date().toISOString();
      setStatus('Atualizado às ' + new Date().toLocaleTimeString('pt-BR'));
      // Update button enabled state
      var csvBtn = $('#ga4ExportCsv');
      if (csvBtn) csvBtn.disabled = false;
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
    var csvBtn = $('#ga4ExportCsv');
    if (csvBtn) {
      csvBtn.disabled = true;
      csvBtn.addEventListener('click', exportCsv);
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

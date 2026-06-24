// assets/js/controllers/admin/admin-cadu.controller.js
// Controlador da página admin/cadu.html — consome /api/cadu/{health,sites,feed}
//
// Estado: allSites (cache), filteredSites, allFeedItems, currentTab
// Persistência: localStorage 'kc:cadu:tab' para lembrar da aba ativa

(function () {
  'use strict';

  var FEED_PAGE_SIZE = 20; // cresce a cada "Carregar mais"
  var STORAGE_TAB = 'kc:cadu:tab';

  var state = {
    allSites: [],
    filteredSites: [],
    allFeedItems: [],
    feedLimit: 20,
    sitesFilter: { q: '', tier: '', ig: '' },
    feedFilter: { q: '' },
    currentTab: 'sites',
    apiHealthy: false
  };

  // ============================================================
  // Helpers
  // ============================================================

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDate(unix) {
    if (!unix) return '—';
    var d = new Date(unix * (unix < 1e12 ? 1000 : 1));
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function setStatus(pill, kind, html) {
    pill.classList.remove('is-loading', 'is-down');
    if (kind) pill.classList.add(kind);
    pill.innerHTML = html;
  }

  function downloadCsv(filename, rows) {
    var csv = rows.map(function (r) {
      return r.map(function (c) {
        var s = c == null ? '' : String(c);
        if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
        return s;
      }).join(',');
    }).join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 100);
  }

  // ============================================================
  // Health
  // ============================================================

  async function checkHealth() {
    var pill = $('#cadu-status-pill');
    try {
      var res = await fetch('/api/cadu/health', { headers: { Accept: 'application/json' } });
      var data = await res.json();
      if (res.ok && data && data.status === 'ok') {
        state.apiHealthy = true;
        setStatus(pill, null,
          '<i class="fas fa-circle-check"></i> cadu-api online (v' + (data.version || '?') + ')');
        // atualiza KPI api
        $('#kpi-api').textContent = 'OK';
        $('#kpi-api-detail').textContent = 'ts ' + new Date(data.ts * 1000).toLocaleTimeString('pt-BR');
      } else {
        state.apiHealthy = false;
        setStatus(pill, 'is-down',
          '<i class="fas fa-triangle-exclamation"></i> cadu-api respondeu ' + res.status);
        $('#kpi-api').textContent = 'OFF';
        $('#kpi-api-detail').textContent = (data && data.error) || 'ver logs';
      }
    } catch (err) {
      state.apiHealthy = false;
      setStatus(pill, 'is-down', '<i class="fas fa-triangle-exclamation"></i> cadu-api inacessível');
      $('#kpi-api').textContent = 'OFF';
      $('#kpi-api-detail').textContent = 'fetch falhou';
    }
  }

  // ============================================================
  // Sites
  // ============================================================

  async function loadSites() {
    var tbody = $('#sites-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="kc-cadu-empty">Carregando…</td></tr>';
    try {
      var res = await fetch('/api/cadu/sites', { headers: { Accept: 'application/json' } });
      var data = await res.json();
      if (!res.ok) throw new Error((data && data.message) || 'status ' + res.status);

      state.allSites = Array.isArray(data) ? data : (data.body || []);
      $('#badge-sites').textContent = String(state.allSites.length);
      applySitesFilter();
      computeKpis();
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6" class="kc-cadu-empty">Erro ao carregar: ' + escapeHtml(err.message || err) + '</td></tr>';
      $('#badge-sites').textContent = '!';
    }
  }

  function applySitesFilter() {
    var f = state.sitesFilter;
    var q = (f.q || '').toLowerCase().trim();
    state.filteredSites = state.allSites.filter(function (s) {
      if (f.tier && String(s.tier || '') !== f.tier) return false;
      if (f.ig && String(s.instagram_status || '') !== f.ig) return false;
      if (q) {
        var hay = (s.name + ' ' + (s.url || '') + ' ' + (s.instagram || '') + ' ' + (s.note || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    renderSitesTable();
  }

  function renderSitesTable() {
    var tbody = $('#sites-tbody');
    if (!state.filteredSites.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="kc-cadu-empty">Nenhuma unidade corresponde ao filtro.</td></tr>';
      return;
    }
    tbody.innerHTML = state.filteredSites.map(function (s) {
      var tierHtml = s.tier
        ? '<span class="kc-cadu-badge kc-cadu-badge--tier-' + s.tier + '">T' + s.tier + '</span>'
        : '<span class="kc-cadu-badge" style="background:rgba(148,163,184,.1);color:#64748b;">—</span>';
      var igStatus = s.instagram_status || 'unknown';
      var igBadge = '<span class="kc-cadu-badge kc-cadu-badge--' + igStatus + '">' + igStatus + '</span>';
      var igCell = s.instagram
        ? '<a href="https://instagram.com/' + escapeHtml(s.instagram.replace(/^@/, '')) + '" target="_blank" rel="noopener" style="color:var(--kc-primary-brand);text-decoration:none;">' + escapeHtml(s.instagram) + '</a>'
        : '<span style="color:var(--kc-text-dark-secondary);">—</span>';
      var urlCell = s.url
        ? '<a href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener" style="color:var(--kc-text-dark-primary);">' + escapeHtml(s.url.replace(/^https?:\/\//, '')) + '</a>'
        : '<span style="color:var(--kc-text-dark-secondary);">—</span>';
      var noteHtml = s.note
        ? '<span style="color:var(--kc-text-dark-secondary);font-size:.82rem;">' + escapeHtml(s.note) + '</span>'
        : '';
      return '<tr>'
        + '<td>' + tierHtml + '</td>'
        + '<td><code>' + escapeHtml(s.name) + '</code></td>'
        + '<td>' + urlCell + '</td>'
        + '<td>' + igCell + '</td>'
        + '<td>' + igBadge + '</td>'
        + '<td>' + noteHtml + '</td>'
        + '</tr>';
    }).join('');
  }

  function computeKpis() {
    var sites = state.allSites;
    $('#kpi-sites').textContent = String(sites.length);
    var igConfirmed = sites.filter(function (s) { return s.instagram_status === 'confirmed'; }).length;
    var igAttempted = sites.filter(function (s) { return s.instagram_status === 'tentative' || s.instagram_status === 'confirmed'; }).length;
    $('#kpi-ig-confirmed').textContent = String(igConfirmed);
    $('#kpi-ig-detail').textContent = igAttempted + ' com perfil atribuído (confirmado ou tentativa)';
    var t1 = sites.filter(function (s) { return String(s.tier) === '1'; }).length;
    $('#kpi-tier1').textContent = String(t1);
  }

  // ============================================================
  // Feed
  // ============================================================

  async function loadFeed(initial) {
    var list = $('#feed-list');
    if (initial) {
      list.innerHTML = '<div class="kc-cadu-empty">Carregando…</div>';
      state.allFeedItems = [];
    }
    var limit = state.feedLimit;
    try {
      var res = await fetch('/api/cadu/feed?limit=' + limit, { headers: { Accept: 'application/json' } });
      var data = await res.json();
      if (!res.ok) throw new Error((data && data.message) || 'status ' + res.status);
      state.allFeedItems = Array.isArray(data) ? data : (data.body || []);
      $('#badge-feed').textContent = String(state.allFeedItems.length);
      $('#kpi-memory').textContent = String(state.allFeedItems.length);
      $('#kpi-memory-detail').textContent = 'amostra carregada (limit=' + limit + ')';
      applyFeedFilter();
    } catch (err) {
      list.innerHTML = '<div class="kc-cadu-empty">Erro ao carregar feed: ' + escapeHtml(err.message || err) + '</div>';
      $('#badge-feed').textContent = '!';
    }
  }

  function applyFeedFilter() {
    var q = (state.feedFilter.q || '').toLowerCase().trim();
    var items = q
      ? state.allFeedItems.filter(function (it) {
          var hay = ((it.snippet || '') + ' ' + (it.heading || '') + ' ' + (it.chunk_id || '')).toLowerCase();
          return hay.indexOf(q) !== -1;
        })
      : state.allFeedItems;

    if (!items.length) {
      $('#feed-list').innerHTML = '<div class="kc-cadu-empty">Nenhum item corresponde ao filtro.</div>';
      return;
    }

    $('#feed-list').innerHTML = items.map(function (it) {
      var heading = it.heading ? escapeHtml(it.heading) : '<span style="color:var(--kc-text-dark-secondary);">—</span>';
      var dt = fmtDate(it.created_at);
      var hash = it.chunk_id ? it.chunk_id.slice(0, 16) : '—';
      var snippet = it.snippet || '(sem conteúdo)';
      return '<article class="kc-cadu-feed-item">'
        + '<div class="kc-cadu-feed-item__head">'
        + '<i class="fas fa-hashtag"></i><code>' + escapeHtml(hash) + '</code>'
        + '<span>·</span><span>' + heading + '</span>'
        + '<span>·</span><span><i class="far fa-clock"></i> ' + dt + '</span>'
        + '</div>'
        + '<pre class="kc-cadu-feed-item__snippet">' + escapeHtml(snippet) + '</pre>'
        + '</article>';
    }).join('');
  }

  // ============================================================
  // Tabs + eventos
  // ============================================================

  function switchTab(name) {
    state.currentTab = name;
    try { localStorage.setItem(STORAGE_TAB, name); } catch (e) {}
    $$('.kc-cadu-tab').forEach(function (t) {
      t.classList.toggle('is-active', t.getAttribute('data-tab') === name);
    });
    $('#tab-sites').style.display = name === 'sites' ? '' : 'none';
    $('#tab-feed').style.display = name === 'feed' ? '' : 'none';
  }

  function bindEvents() {
    $$('.kc-cadu-tab').forEach(function (tab) {
      tab.addEventListener('click', function () { switchTab(tab.getAttribute('data-tab')); });
    });

    var sitesSearch = $('#sites-search');
    var sitesTier = $('#sites-tier');
    var sitesIg = $('#sites-ig');
    sitesSearch.addEventListener('input', function () { state.sitesFilter.q = sitesSearch.value; applySitesFilter(); });
    sitesTier.addEventListener('change', function () { state.sitesFilter.tier = sitesTier.value; applySitesFilter(); });
    sitesIg.addEventListener('change', function () { state.sitesFilter.ig = sitesIg.value; applySitesFilter(); });

    $('#sites-export-csv').addEventListener('click', function () {
      var rows = [['name','tier','category','url','instagram','instagram_status','note']];
      state.filteredSites.forEach(function (s) {
        rows.push([s.name, s.tier || '', s.category || '', s.url || '', s.instagram || '', s.instagram_status || '', s.note || '']);
      });
      downloadCsv('cadu-sites-' + new Date().toISOString().slice(0, 10) + '.csv', rows);
    });

    var feedSearch = $('#feed-search');
    feedSearch.addEventListener('input', function () { state.feedFilter.q = feedSearch.value; applyFeedFilter(); });

    var feedLimit = $('#feed-limit');
    feedLimit.addEventListener('change', function () {
      state.feedLimit = parseInt(feedLimit.value, 10) || 20;
      loadFeed(true);
    });

    $('#feed-refresh-btn').addEventListener('click', function () { loadFeed(true); });
    $('#feed-load-more-btn').addEventListener('click', function () {
      state.feedLimit = Math.min(200, state.feedLimit + FEED_PAGE_SIZE);
      $('#feed-limit').value = String(state.feedLimit);
      loadFeed(true);
    });

    $('#cadu-refresh-btn').addEventListener('click', function () {
      refreshAll();
    });
  }

  async function refreshAll() {
    $('#cadu-status-pill').classList.add('is-loading');
    $('#cadu-status-pill').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando…';
    await Promise.all([checkHealth(), loadSites(), state.currentTab === 'feed' ? loadFeed(true) : Promise.resolve()]);
    if (state.currentTab !== 'feed') loadFeed(true); // atualiza contagem mesmo com tab sites
  }

  // ============================================================
  // Init
  // ============================================================

  function init() {
    if (!document.body || !document.body.classList.contains('kc-admin-page--cadu')) return;
    try {
      state.currentTab = localStorage.getItem(STORAGE_TAB) || 'sites';
    } catch (e) {}
    bindEvents();
    switchTab(state.currentTab);
    refreshAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
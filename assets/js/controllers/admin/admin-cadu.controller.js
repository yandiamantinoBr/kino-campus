// assets/js/controllers/admin/admin-cadu.controller.js
// Controlador da página admin/cadu.html — consome /api/cadu/{health,sites,feed,publish}
//
// Estado: allSites (cache), filteredSites, allFeedItems, currentTab
// Persistência: localStorage 'kc:cadu:tab' para lembrar da aba ativa
//
// Auth: exige profile.is_admin=true (mesmo gate dos outros admin pages).

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
    apiHealthy: false,
    publishingKey: null  // chave do site sendo publicado (evita duplo-clique)
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
    if (!pill) return;
    pill.classList.remove('is-loading', 'is-down');
    if (kind) pill.classList.add(kind);
    pill.innerHTML = html;
  }

  function showCaduError(msg) {
    var wrap = $('#cadu-error');
    if (!wrap) return;
    wrap.style.display = 'block';
    wrap.innerHTML = msg;  // aceita HTML (mensagens vêm com links)
  }

  function hideCaduError() {
    var wrap = $('#cadu-error');
    if (!wrap) return;
    wrap.style.display = 'none';
    wrap.textContent = '';
  }

  function showAccessDenied(msg) {
    var block = $('#cadu-access-denied');
    var loading = $('#cadu-loading');
    var main = $('#cadu-content');
    if (block) {
      block.style.display = 'flex';
      block.innerHTML = '<i class="fas fa-lock" style="font-size:1.6rem;"></i>'
        + '<div style="margin-top:8px;font-weight:600;">Acesso restrito</div>'
        + '<div style="opacity:.8;margin-top:4px;">' + escapeHtml(msg || 'Apenas administradores podem acessar este painel.') + '</div>';
    }
    if (loading) loading.style.display = 'none';
    if (main) main.style.display = 'none';
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
  // Auth gate (mesmo padrão de admin-reports / admin-moderation)
  // ============================================================

  async function checkAdminAccess() {
    var env = window.KC_ENV || (window.KCAPI && window.KCAPI.ENV) || {};
    var drv = env.driver || env.DATA_DRIVER;
    if (drv !== 'supabase') {
      showAccessDenied('Este painel requer driver=supabase. Configure KC_ENV.driver="supabase" e recarregue.');
      return false;
    }

    var supabaseUrl = env.SUPABASE_URL || (env.supabase && env.supabase.url);
    var supabaseKey = env.SUPABASE_ANON_KEY || (env.supabase && env.supabase.anonKey);

    // Pegar cliente Supabase pronto se existir; senão, criar a partir do env
    var client = (window.KCSupabase && window.KCSupabase.client)
      || (window.supabaseClient)
      || (window.supabase && window.supabase.createClient && supabaseUrl && supabaseKey ? window.supabase.createClient(supabaseUrl, supabaseKey) : null);
    if (!client || !client.from) {
      showAccessDenied('Cliente Supabase indisponível.');
      return false;
    }

    // Pegar usuário atual (Supabase Auth via cliente)
    var user = null;
    try {
      var sess = await client.auth.getSession();
      user = sess && sess.data && sess.data.session && sess.data.session.user;
    } catch (e) { /* fall through */ }

    if (!user) {
      // fallback: tentar via KCAPI
      try {
        if (window.KCAPI && typeof window.KCAPI.getCurrentUser === 'function') {
          user = await window.KCAPI.getCurrentUser();
        }
      } catch (e) { /* fall through */ }
    }

    if (!user) {
      showAccessDenied('Você precisa estar autenticado. Redirecionando…');
      setTimeout(function () { window.location.replace('../index.html#login'); }, 2000);
      return false;
    }

    try {
      var res = await client.from('profiles').select('is_admin, display_name, full_name').eq('id', user.id).maybeSingle();
      var profile = res && res.data;
      var error = res && res.error;
      if (error || !profile) {
        showAccessDenied('Não foi possível carregar seu perfil.');
        return false;
      }
      if (!profile.is_admin) {
        showAccessDenied('Apenas administradores podem acessar este painel.');
        return false;
      }
      return true;
    } catch (e) {
      showAccessDenied('Falha ao verificar perfil: ' + (e && e.message ? e.message : e));
      return false;
    }
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
    tbody.innerHTML = '<tr><td colspan="7" class="kc-cadu-empty">Carregando…</td></tr>';
    try {
      var res = await fetch('/api/cadu/sites', { headers: { Accept: 'application/json' } });
      var data = await res.json();
      if (!res.ok) throw new Error((data && data.message) || 'status ' + res.status);

      state.allSites = Array.isArray(data) ? data : (data.body || []);
      $('#badge-sites').textContent = String(state.allSites.length);
      applySitesFilter();
      computeKpis();
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="7" class="kc-cadu-empty">Erro ao carregar: ' + escapeHtml(err.message || err) + '</td></tr>';
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
      tbody.innerHTML = '<tr><td colspan="7" class="kc-cadu-empty">Nenhuma unidade corresponde ao filtro.</td></tr>';
      return;
    }
    tbody.innerHTML = state.filteredSites.map(function (s) {
      var key = s.name + '|' + (s.url || '');
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
        + '<td style="white-space:nowrap;"><button type="button" class="kc-cadu-publish-btn" data-key="' + escapeHtml(key) + '" data-name="' + escapeHtml(s.name) + '" title="Sugerir publicação deste site no feed KinoCampus"><i class="fas fa-paper-plane"></i></button></td>'
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
  // Publish (sugerir um site pra aparecer no feed KinoCampus)
  // ============================================================

  async function publishSite(site) {
    if (state.publishingKey === site.key) return;
    state.publishingKey = site.key;
    var btn = document.querySelector('.kc-cadu-publish-btn[data-key="' + cssEscape(site.key) + '"]');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }
    try {
      var res = await fetch('/api/cadu/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ name: site.name, url: site.url, instagram: site.instagram, note: site.note, tier: site.tier, category: site.category, source: 'cadu-admin' })
      });
      var data = await res.json().catch(function () { return null; });
      if (!res.ok) throw new Error((data && (data.message || data.error)) || ('status ' + res.status));
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        btn.classList.add('is-ok');
        setTimeout(function () {
          btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
          btn.classList.remove('is-ok');
        }, 2500);
      }
      var msg = (data && data.message) ? data.message : 'OK';
      var via = (data && data.published_via) ? ' (' + data.published_via + ')' : '';
      showCaduError('<i class="fas fa-circle-check"></i> ' + escapeHtml(msg) + '<small style="opacity:.7;display:block;margin-top:4px;">via: ' + escapeHtml(via.replace(/[()]/g, '')) + '</small>');
      setTimeout(hideCaduError, 6000);
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-triangle-exclamation"></i>';
        btn.classList.add('is-err');
        setTimeout(function () {
          btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
          btn.classList.remove('is-err');
        }, 3500);
      }
      showCaduError('Erro ao publicar: ' + (err && err.message ? err.message : err));
    } finally {
      state.publishingKey = null;
    }
  }

  function cssEscape(s) {
    return String(s).replace(/[^a-zA-Z0-9_\-]/g, function (c) { return '\\' + c.charCodeAt(0).toString(16) + ' '; });
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

    // Delegação: clicar em qualquer botão de publicar
    var sitesTable = $('#sites-table');
    if (sitesTable) {
      sitesTable.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('.kc-cadu-publish-btn');
        if (!btn) return;
        var key = btn.getAttribute('data-key') || '';
        var parts = key.split('|');
        var name = btn.getAttribute('data-name') || parts[0] || '';
        var url = parts[1] || '';
        var site = state.allSites.find(function (s) { return s.name === name && (s.url || '') === url; }) || { name: name, url: url, key: key };
        publishSite(site);
      });
    }

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
    var loading = $('#cadu-loading');
    if (loading) loading.style.display = 'flex';
    $('#cadu-status-pill').classList.add('is-loading');
    $('#cadu-status-pill').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando…';
    await Promise.all([checkHealth(), loadSites(), state.currentTab === 'feed' ? loadFeed(true) : Promise.resolve()]);
    if (state.currentTab !== 'feed') loadFeed(true); // atualiza contagem mesmo com tab sites
    if (loading) loading.style.display = 'none';
  }

  // ============================================================
  // Init
  // ============================================================

  async function init() {
    if (!document.body || !document.body.classList.contains('kc-admin-page--cadu')) return;
    var loading = $('#cadu-loading');
    var accessDenied = $('#cadu-access-denied');
    var main = $('#cadu-content');
    if (loading) loading.style.display = 'flex';
    if (accessDenied) accessDenied.style.display = 'none';
    if (main) main.style.display = 'none';

    var ok = await checkAdminAccess();
    if (!ok) {
      if (loading) loading.style.display = 'none';
      return;
    }

    try {
      state.currentTab = localStorage.getItem(STORAGE_TAB) || 'sites';
    } catch (e) {}
    bindEvents();
    switchTab(state.currentTab);
    if (main) main.style.display = 'block';
    if (loading) loading.style.display = 'none';
    refreshAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

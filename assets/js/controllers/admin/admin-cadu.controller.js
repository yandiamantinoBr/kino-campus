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
    publishingKey: null,  // chave do site sendo publicado (evita duplo-clique)
    pipelineActive: null,
    pipelineStages: [],
    pipelineHistory: [],
    pipelineHealth: null,
    lastVersion: null
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

  function compareVersions(a, b) {
    var pa = String(a || '').split('.').map(function (part) { return parseInt(part, 10) || 0; });
    var pb = String(b || '').split('.').map(function (part) { return parseInt(part, 10) || 0; });
    var len = Math.max(pa.length, pb.length);
    for (var i = 0; i < len; i++) {
      var da = pa[i] || 0;
      var db = pb[i] || 0;
      if (da > db) return 1;
      if (da < db) return -1;
    }
    return 0;
  }

  function versionAtLeast(version, minimum) {
    return compareVersions(version, minimum) >= 0;
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

  // Emails hardcoded de admins confiáveis (último recurso se profile.is_admin
  // estiver desatualizado). Manter sincronizado com admin-cadu.html.
  function getSupabaseClient() {
    if (window.KCSupabase && typeof window.KCSupabase.getClient === 'function') {
      return window.KCSupabase.getClient();
    }
    return null;
  }

  async function getAdminSession() {
    if (window.KCSupabase && typeof window.KCSupabase.refreshSession === 'function') {
      try {
        var refreshed = await window.KCSupabase.refreshSession();
        if (refreshed && refreshed.access_token) return refreshed;
      } catch (e) {
        console.warn('[cadu-admin] refreshSession falhou:', e);
      }
    }
    if (window.KCSupabase && typeof window.KCSupabase.getSession === 'function') {
      var cached = window.KCSupabase.getSession();
      if (cached && cached.access_token) return cached;
    }
    var supabaseClient = getSupabaseClient();
    if (supabaseClient && supabaseClient.auth && typeof supabaseClient.auth.getSession === 'function') {
      try {
        var result = await supabaseClient.auth.getSession();
        var session = result && result.data && result.data.session;
        if (session && session.access_token) return session;
      } catch (e2) {
        console.warn('[cadu-admin] client.auth.getSession falhou:', e2);
      }
    }
    return null;
  }

  async function getAdminAccessToken() {
    var session = await getAdminSession();
    return session && session.access_token ? session.access_token : '';
  }

  // Não há allowlist de e-mail no cliente: a decisão real vem de
  // profiles.is_admin no Supabase e é revalidada no serverless /api/cadu/*.
  var TRUSTED_ADMIN_EMAILS = [];

  async function checkAdminAccess() {
    // ============================================================
    // CAMADA 1 (mais alta prioridade): BYPASS DEV via query string.
    // Permite testar UI sem login real. NÃO usar em produção.
    // ============================================================
    if (false) {
      console.warn('[cadu-admin] DEV BYPASS ativo (não usar em produção)');
      window.__KC_ADMIN_DEV_BYPASS = true;
      return true;
    }

    // ============================================================
    // CAMADA 2: tenta extrair email do usuário logado de VÁRIAS fontes
    // (kc:user localStorage, KCSupabase.getCurrentUser, KCAPI.getCurrentUser).
    // Se for email confiável, libera IMEDIATAMENTE — sem checar driver,
    // sem checar profile.is_admin. Isso evita lock-out do admin.
    //
    // IMPORTANTE: usar o facade canônico window.KCSupabase (com client de
    // persistSession:true) — NÃO criar um supabase.createClient temporário,
    // pois sem persistência a getSession() não vê a sessão do cookie.
    // ============================================================
    var detectedEmail = '';
    try {
      var stored = localStorage.getItem('kc:user');
      if (stored) {
        try { detectedEmail = (JSON.parse(stored).email || '').toLowerCase(); } catch (e) {}
      }
    } catch (e) {}
    if (!detectedEmail && window.KCSupabase && typeof window.KCSupabase.getCurrentUser === 'function') {
      try {
        var u = await window.KCSupabase.getCurrentUser();
        if (u && u.email) detectedEmail = (u.email || '').toLowerCase();
      } catch (e) { console.warn('[cadu-admin] KCSupabase.getCurrentUser falhou:', e); }
    }
    if (!detectedEmail && window.KCSupabase && typeof window.KCSupabase.refreshSession === 'function') {
      try {
        await window.KCSupabase.refreshSession();
        var u2 = window.KCSupabase.getUser ? window.KCSupabase.getUser() : null;
        if (u2 && u2.email) detectedEmail = (u2.email || '').toLowerCase();
      } catch (e) {}
    }
    if (!detectedEmail && window.KCAPI && typeof window.KCAPI.getCurrentUser === 'function') {
      try {
        var u3 = await window.KCAPI.getCurrentUser();
        if (u3 && u3.email) detectedEmail = (u3.email || '').toLowerCase();
      } catch (e) {}
    }
    if (detectedEmail && TRUSTED_ADMIN_EMAILS.indexOf(detectedEmail) !== -1) {
      console.warn('[cadu-admin] BYPASS email confiável (CAMADA 2): ' + detectedEmail);
      window.__KC_ADMIN_TRUSTED_BYPASS = true;
      window.__KC_ADMIN_EMAIL = detectedEmail;
      return true;
    }

    // ============================================================
    // CAMADA 3: driver check
    // ============================================================
    var env = window.KC_ENV || (window.KCAPI && window.KCAPI.ENV) || {};
    var drv = env.driver || env.DATA_DRIVER;
    if (drv !== 'supabase') {
      showAccessDenied('Este painel requer driver=supabase (atual: "' + drv + '"). Configure KC_ENV.driver="supabase" e recarregue.');
      return false;
    }

    // ============================================================
    // CAMADA 4: Supabase Auth session
    // ============================================================
    var client = getSupabaseClient();
    if (!client) {
      showAccessDenied('Supabase client não disponível. Recarregue a página e tente novamente.');
      return false;
    }

    var user = null;
    try {
      var sess = await client.auth.getSession();
      user = sess && sess.data && sess.data.session && sess.data.session.user;
    } catch (e) { /* fall through */ }
    if (!user && window.KCAPI && typeof window.KCAPI.getCurrentUser === 'function') {
      try { user = await window.KCAPI.getCurrentUser(); } catch (e) {}
    }

    if (!user) {
      showAccessDenied('Você precisa estar autenticado. Redirecionando…');
      setTimeout(function () { window.location.replace('../index.html#login'); }, 2000);
      return false;
    }

    // ============================================================
    // CAMADA 5: re-check bypass com email do user autenticado
    // (caso CAMADA 2 não tenha conseguido extrair)
    // ============================================================
    var userEmail = (user.email || '').toLowerCase();
    if (TRUSTED_ADMIN_EMAILS.indexOf(userEmail) !== -1) {
      console.warn('[cadu-admin] BYPASS email confiável (CAMADA 5): ' + userEmail);
      window.__KC_ADMIN_TRUSTED_BYPASS = true;
      window.__KC_ADMIN_EMAIL = userEmail;
      return true;
    }

    // ============================================================
    // CAMADA 6: profile.is_admin (último recurso)
    // ============================================================
    try {
      var res = await client.from('profiles').select('is_admin, display_name, full_name, email').eq('id', user.id).maybeSingle();
      var profile = res && res.data;
      var error = res && res.error;
      if (error || !profile) {
        showAccessDenied('Não foi possível carregar seu perfil: ' + (error ? error.message : 'not found') + '. Se você é admin, peça grant-admin via `node scripts/grant-admin.js ' + userEmail + '`');
        return false;
      }
      if (!profile.is_admin) {
        showAccessDenied('Sua conta (' + userEmail + ') não tem is_admin=true. Se você é admin, peça grant-admin via `node scripts/grant-admin.js ' + userEmail + '`');
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
    var contextPill = $('#cadu-context-pill');
    var versionPill = $('#cadu-version-pill');
    var versionText = $('#cadu-version-text');
    try {
      var res = await fetch('/api/cadu/health', { headers: { Accept: 'application/json' } });
      var data = await res.json();
      if (res.ok && data && data.status === 'ok') {
        state.apiHealthy = true;
        setStatus(pill, null,
          '<span class="kc-cadu-status-dot kc-cadu-status-dot--ok"></span> <i class="fas fa-circle-check"></i> cadu-api online (v' + (data.version || '?') + ')');
        // atualiza KPI api
        $('#kpi-api').textContent = 'OK';
        $('#kpi-api-detail').textContent = 'ts ' + new Date(data.ts * 1000).toLocaleTimeString('pt-BR');
        if (versionText) versionText.textContent = 'v' + (data.version || '?');
        if (versionPill) versionPill.style.display = '';
        // Probe se context endpoint existe (cadu-api v0.4.6+)
        try {
          var ctx = await apiFetch('/api/cadu/openclaw/context');
          if (ctx && !ctx.__error) {
            state.openclawContext = ctx;
            if (contextPill) {
              contextPill.style.display = '';
              contextPill.innerHTML = '<i class="fas fa-layer-group"></i> Context: ' + ctx.sites.count + ' sites · ' + ctx.feed.count + ' chunks · ' + (ctx.openclaw.openclaw_reachable ? 'OpenClaw OK' : 'OpenClaw ?');
            }
          } else {
            state.openclawContext = null;
            if (contextPill) contextPill.style.display = 'none';
          }
        } catch (_) {
          state.openclawContext = null;
        }
      } else {
        state.apiHealthy = false;
        setStatus(pill, 'is-down',
          '<span class="kc-cadu-status-dot kc-cadu-status-dot--down"></span> <i class="fas fa-triangle-exclamation"></i> cadu-api respondeu ' + res.status);
        $('#kpi-api').textContent = 'OFF';
        $('#kpi-api-detail').textContent = (data && data.error) || 'ver logs';
        if (contextPill) contextPill.style.display = 'none';
        if (versionPill) versionPill.style.display = 'none';
      }
    } catch (err) {
      state.apiHealthy = false;
      setStatus(pill, 'is-down', '<span class="kc-cadu-status-dot kc-cadu-status-dot--down"></span> <i class="fas fa-triangle-exclamation"></i> cadu-api inacessível');
      $('#kpi-api').textContent = 'OFF';
      $('#kpi-api-detail').textContent = 'fetch falhou';
      if (contextPill) contextPill.style.display = 'none';
      if (versionPill) versionPill.style.display = 'none';
    }
  }

  // ============================================================
  // Sites
  // ============================================================

  async function loadSites() {
    var tbody = $('#sites-tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="kc-cadu-empty">Carregando…</td></tr>';
    try {
      var data = await apiFetch('/api/cadu/sites');
      if (data && data.__error) throw new Error((data.data && data.data.message) || (data.data && data.data.error) || 'status ' + data.status);

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

  // Auto-save debounce timers keyed by unit name
  var _saveTimers = {};
  function scheduleSiteSave(site, field, value) {
    var key = site.name;
    var pending = (_saveTimers[key] = _saveTimers[key] || {});
    pending[field] = value;
    clearTimeout(pending._t);
    pending._t = setTimeout(function () {
      commitSiteSave(site, pending);
      delete _saveTimers[key];
    }, 700);
    var statusEl = document.querySelector('[data-site-save-status="' + cssEscape(key) + '"]');
    if (statusEl) { statusEl.innerHTML = '<i class="fas fa-clock"></i>'; }
  }
  async function commitSiteSave(site, payload) {
    var key = site.name;
    var statusEl = document.querySelector('[data-site-save-status="' + cssEscape(key) + '"]');
    try {
      var body = {};
      if (payload.tier !== undefined) body.tier = payload.tier;
      if (payload.note !== undefined) body.note = payload.note;
      var data = await apiFetch('/api/cadu/sites/' + encodeURIComponent(key) + '/meta', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body)
      });
      if (data && data.__error) throw new Error((data.data && (data.data.message || data.data.detail || data.data.error)) || ('status ' + data.status));
      if (statusEl) { statusEl.innerHTML = '<i class="fas fa-check" style="color:#10b981;"></i>'; setTimeout(function(){ if (statusEl) statusEl.innerHTML = ''; }, 2500); }
      if (data && data.tier !== undefined) site.tier = data.tier;
      if (data && data.note !== undefined) site.note = data.note;
      computeKpis();
    } catch (err) {
      if (statusEl) { statusEl.innerHTML = '<i class="fas fa-triangle-exclamation" style="color:#ef4444;"></i>'; setTimeout(function(){ if (statusEl) statusEl.innerHTML = ''; }, 4000); }
      showCaduError('Erro ao salvar ' + key + ': ' + (err && err.message ? err.message : err));
      setTimeout(hideCaduError, 6000);
    }
  }

  function renderSitesTable() {
    var tbody = $('#sites-tbody');
    if (!tbody) return;
    if (!state.filteredSites.length) { tbody.innerHTML = '<tr><td colspan="7" class="kc-cadu-empty">Nenhuma unidade corresponde ao filtro.</td></tr>'; return; }
    tbody.innerHTML = state.filteredSites.map(function (s) {
      var key = s.name + '|' + (s.url || '');
      // TIER: dropdown editável (T1/T2/T3/—)
      var currentTier = s.tier ? String(s.tier) : '';
      var tierHtml = '<select class="kc-cadu-tier-select" data-field="tier" data-name="' + escapeHtml(s.name) + '" title="Editar tier (1=alta prioridade, 3=baixa)">'
        + '<option value="1"' + (currentTier === '1' ? ' selected' : '') + '>T1</option>'
        + '<option value="2"' + (currentTier === '2' ? ' selected' : '') + '>T2</option>'
        + '<option value="3"' + (currentTier === '3' ? ' selected' : '') + '>T3</option>'
        + '<option value=""' + (currentTier === '' ? ' selected' : '') + '>—</option>'
        + '</select>';
      // IG: link clicável @handle
      var igCell = s.instagram
        ? '<a href="https://instagram.com/' + escapeHtml(s.instagram.replace(/^@/, '')) + '" target="_blank" rel="noopener" class="kc-cadu-ig-link">@' + escapeHtml(s.instagram.replace(/^@/, '')) + '</a>'
        : '<span style="color:var(--kc-text-dark-secondary);">—</span>';
      var igStatus = s.instagram_status || 'unknown';
      var igBadgeHtml = '<span class="kc-cadu-badge kc-cadu-badge--' + igStatus + '">' + igStatus + '</span>';
      // URL: link clicável
      var urlCell = s.url
        ? '<a href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener" class="kc-cadu-url-link">' + escapeHtml(s.url.replace(/^https?:\/\//, '')) + '</a>'
        : '<span style="color:var(--kc-text-dark-secondary);">—</span>';
      // OBSERVAÇÃO: textarea editável com auto-save
      var noteVal = s.note ? escapeHtml(s.note) : '';
      var noteHtml = '<div class="kc-cadu-note-cell"><textarea class="kc-cadu-note-input" data-field="note" data-name="' + escapeHtml(s.name) + '" placeholder="Adicionar observação..." rows="1">' + noteVal + '</textarea><span class="kc-cadu-save-status" data-site-save-status="' + escapeHtml(s.name) + '"></span></div>';
      var actionsHtml = '<button type="button" class="kc-cadu-publish-btn" data-key="' + escapeHtml(key) + '" data-name="' + escapeHtml(s.name) + '" title="Sugerir publicação deste site no feed KinoCampus"><i class="fas fa-paper-plane"></i></button>'
        + ' <button type="button" class="kc-cadu-ask-btn" data-ask-kind="site" data-ask-name="' + escapeHtml(s.name) + '" data-ask-url="' + escapeHtml(s.url || '') + '" data-ask-instagram="' + escapeHtml(s.instagram || '') + '" data-ask-tier="' + escapeHtml(currentTier) + '" title="Perguntar ao Cadu sobre este site (vai para a aba OpenClaw)"><i class="fas fa-robot"></i></button>';
      return '<tr data-site-name="' + escapeHtml(s.name) + '">'
        + '<td>' + tierHtml + '</td>'
        + '<td><code>' + escapeHtml(s.name) + '</code></td>'
        + '<td>' + urlCell + '</td>'
        + '<td>' + igCell + '</td>'
        + '<td>' + igBadgeHtml + '</td>'
        + '<td>' + noteHtml + '</td>'
        + '<td style="white-space:nowrap;">' + actionsHtml + '</td>'
        + '</tr>';
    }).join('');

    // Wire up auto-save handlers
    tbody.querySelectorAll('select.kc-cadu-tier-select, textarea.kc-cadu-note-input').forEach(function (el) {
      el.addEventListener('change', function () {
        var field = el.getAttribute('data-field');
        var name = el.getAttribute('data-name');
        var site = state.allSites.find(function (x) { return x.name === name; });
        if (!site) return;
        var rawValue = el.value;
        var value = (rawValue === '' || rawValue === '—') ? null : (field === 'tier' ? parseInt(rawValue, 10) : rawValue);
        scheduleSiteSave(site, field, value);
      });
    });
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
      var data = await apiFetch('/api/cadu/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ name: site.name, url: site.url, instagram: site.instagram, note: site.note, tier: site.tier, category: site.category, source: 'cadu-admin' })
      });
      if (data && data.__error) throw new Error((data.data && (data.data.message || data.data.error)) || ('status ' + data.status));
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
      var data = await apiFetch('/api/cadu/feed?limit=' + limit);
      if (data && data.__error) throw new Error((data.data && data.data.message) || (data.data && data.data.error) || 'status ' + data.status);
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
      var askBtn = '<button type="button" class="kc-cadu-ask-btn" data-ask-kind="feed" data-ask-id="' + escapeHtml(it.chunk_id) + '" data-ask-heading="' + escapeHtml((it.heading || '').replace(/"/g, '&quot;')) + '" title="Perguntar ao Cadu sobre esse chunk (vai para a aba OpenClaw)"><i class="fas fa-robot"></i> Perguntar Cadu</button>';
      return '<article class="kc-cadu-feed-item">'
        + '<div class="kc-cadu-feed-item__head">'
        + '<i class="fas fa-hashtag"></i><code>' + escapeHtml(hash) + '</code>'
        + '<span>·</span><span>' + heading + '</span>'
        + '<span>·</span><span><i class="far fa-clock"></i> ' + dt + '</span>'
        + '<span style="margin-left:auto;">' + askBtn + '</span>'
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
    var tabPipeline = $('#tab-pipeline');
    if (tabPipeline) {
      tabPipeline.style.display = name === 'pipeline' ? '' : 'none';
      if (name === 'pipeline') {
        refreshPipeline();
      }
    }
    var tabOpenclaw = $('#tab-openclaw');
    if (tabOpenclaw) {
      tabOpenclaw.style.display = name === 'openclaw' ? '' : 'none';
      if (name === 'openclaw') {
        refreshOpenclaw();
      }
    }
  }

  // ============================================================
  // OpenClaw (v0.4.3) — integração direta com Cadu agent
  // ============================================================

  var openclawState = {
    lastSessionId: null,
    busy: false,
  };

  function fmtAgeMs(ms) {
    if (!ms && ms !== 0) return '—';
    var s = Math.floor(ms / 1000);
    if (s < 60) return s + 's atrás';
    if (s < 3600) return Math.floor(s / 60) + 'min atrás';
    if (s < 86400) return Math.floor(s / 3600) + 'h atrás';
    return Math.floor(s / 86400) + 'd atrás';
  }

  async function refreshOpenclaw() {
    var statusBadge = $('#badge-openclaw');
    var agentEl = $('#openclaw-stat-agent');
    var tgEl = $('#openclaw-stat-telegram');
    var hbEl = $('#openclaw-stat-heartbeat');
    var tasksEl = $('#openclaw-stat-tasks');
    var agentHint = $('#openclaw-stat-agent-hint');
    var tgHint = $('#openclaw-stat-telegram-hint');
    var hbHint = $('#openclaw-stat-heartbeat-hint');
    var tasksHint = $('#openclaw-stat-tasks-hint');

    try {
      // 1. Status (consolidado: openclaw status --json + health)
      var statusResp = await apiFetch('/api/cadu/openclaw/status');
      if (!statusResp || statusResp.__error) {
        if (statusBadge) statusBadge.textContent = '!';
        if (agentEl) agentEl.textContent = 'offline';
        if (agentHint) agentHint.textContent = statusResp && statusResp.data ? 'cadu-api sem permissão' : 'erro cadu-api';
        return;
      }
      var st = statusResp.status || statusResp.data || statusResp;
      var rawData = st.data || st;
      var agents = rawData.agents && rawData.agents.agents ? rawData.agents.agents : [];
      var defaultAgent = (rawData.heartbeat && rawData.heartbeat.defaultAgentId) || (rawData.agents && rawData.agents.defaultId) || 'main';
      var mainAgent = agents.find(function (a) { return a.id === defaultAgent; }) || agents[0];
      var recentSessions = rawData.sessions && rawData.sessions.recent ? rawData.sessions.recent : [];
      var lastActiveMs = mainAgent ? (mainAgent.lastActiveAgeMs || 0) : (recentSessions[0] ? (recentSessions[0].ageMs || recentSessions[0].age || 0) : 0);
      var hb = rawData.heartbeat || {};
      var hbEvery = hb.agents && hb.agents[0] ? hb.agents[0].every : '—';
      var sessionDefaults = rawData.sessions && rawData.sessions.defaults ? rawData.sessions.defaults : {};
      var modelHint = sessionDefaults.model || (mainAgent && mainAgent.model) || 'deepseek-v4-pro';
      var contextHint = sessionDefaults.contextTokens ? ('ctx ' + Math.round(sessionDefaults.contextTokens / 1000000) + 'M') : 'ctx 1M';

      // Agent
      if (agentEl) agentEl.innerHTML = '<i class="fas fa-circle-check"></i> online';
      if (agentHint) agentHint.innerHTML = escapeHtml(defaultAgent || 'main') + ' · ' + escapeHtml(modelHint) + ' · ' + escapeHtml(contextHint);

      // Tasks
      var tasks = rawData.tasks || {};
      var failures = tasks.failures || 0;
      var total = tasks.total || 0;
      var succeeded = (tasks.byStatus && tasks.byStatus.succeeded) || 0;
      if (tasksEl) {
        tasksEl.innerHTML = (tasks.active || 0) + '/' + total;
        tasksEl.style.color = (tasks.active > 0) ? '#4caf50' : '#888';
      }
      if (tasksHint) tasksHint.innerHTML = succeeded + ' OK · ' + failures + ' falhas';

      // 2. Health (heartbeat, telegram)
      var healthText = statusResp.health && statusResp.health.stdout ? statusResp.health.stdout : '';
      var tgOk = /Telegram:\s*configured/i.test(healthText);
      var hbOk = /Heartbeat/i.test(healthText);
      if (tgEl) {
        tgEl.innerHTML = tgOk ? '<i class="fas fa-circle-check"></i> ON' : '<i class="fas fa-circle-xmark"></i> off';
        tgEl.style.color = tgOk ? '#4caf50' : '#f44336';
      }
      if (tgHint) tgHint.innerHTML = 'Bot: 8746…f8DM · 1/1 account';
      if (hbEl) {
        hbEl.innerHTML = hbOk ? '<i class="fas fa-circle-check"></i> ' + hbEvery : '—';
      }
      if (hbHint) hbHint.innerHTML = mainAgent ? ('última atividade: ' + fmtAgeMs(lastActiveMs)) : '—';

      if (statusBadge) statusBadge.textContent = tasks.active > 0 ? '●' : 'ok';

      // 3. Sessions recentes
      var sessResp = await apiFetch('/api/cadu/openclaw/sessions?limit=8');
      var sessList = $('#openclaw-sessions-list');
      if (sessResp && !sessResp.__error && sessResp.data && sessResp.data.sessions) {
        var sessions = sessResp.data.sessions;
        // lembrar a sessão mais recente "direct" pra próxima msg
        var lastDirect = sessions.find(function (s) { return s.kind === 'direct'; });
        if (lastDirect) {
          openclawState.lastSessionId = lastDirect.sessionId;
          var ls = $('#openclaw-last-session');
          if (ls) ls.textContent = lastDirect.sessionId.slice(0, 8) + '…';
        }
        if (sessList) {
          if (sessions.length === 0) {
            sessList.innerHTML = '<div class="kc-cadu-empty">Nenhuma sessão.</div>';
          } else {
            sessList.innerHTML = sessions.map(function (s) {
              var kindIcon = s.kind === 'cron' ? 'fa-clock' : (s.kind === 'direct' ? 'fa-comments' : 'fa-circle');
              var pct = s.percentUsed != null ? (' · ' + s.percentUsed + '% ctx') : '';
              return '<div class="kc-openclaw-list-item">' +
                '<div class="kc-openclaw-list-item__title"><i class="fas ' + kindIcon + '"></i> ' +
                escapeHtml(s.kind || '?') + ' · ' + escapeHtml((s.model || '?').toString()) + '</div>' +
                '<div class="kc-openclaw-list-item__meta">' +
                escapeHtml((s.key || '').slice(0, 60)) +
                ' · ' + fmtAgeMs(s.ageMs || (s.age ? s.age * 1000 : 0)) +
                pct +
                '</div></div>';
            }).join('');
          }
        }
      } else if (sessList) {
        sessList.innerHTML = '<div class="kc-cadu-empty">Erro ao carregar sessões.</div>';
      }

    } catch (e) {
      if (agentEl) agentEl.textContent = 'erro';
      if (agentHint) agentHint.textContent = String(e && e.message || e);
    }
  }

  async function openclawSendChat(ev) {
    if (ev) ev.preventDefault();
    if (openclawState.busy) return false;
    var input = $('#openclaw-chat-input');
    var log = $('#openclaw-chat-log');
    var status = $('#openclaw-chat-status');
    var btn = $('#openclaw-chat-send-btn');
    var deliverEl = $('#openclaw-chat-deliver');
    if (!input || !log) return false;
    var msg = (input.value || '').trim();
    if (!msg) {
      if (status) status.textContent = '⚠️ mensagem vazia';
      return false;
    }
    openclawState.busy = true;
    if (btn) btn.disabled = true;
    if (status) status.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cadu pensando…';

    // Render user msg
    appendChatMsg('user', msg, null);
    input.value = '';

    try {
      var payload = { message: msg, agent: 'main' };
      if (openclawState.lastSessionId) payload.session_id = openclawState.lastSessionId;
      if (deliverEl && deliverEl.checked) payload.deliver = true;

      var resp = await apiFetch('/api/cadu/openclaw/agent-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!resp || resp.__error) {
        appendChatMsg('cadu', '[erro: ' + (resp ? JSON.stringify(resp.data || resp.message || resp) : 'sem resposta') + ']', null);
        if (status) status.textContent = '❌ Falhou';
        return false;
      }
      var data = resp.data || {};
      var payloads = (data.result && data.result.payloads) || [];
      var text = '';
      for (var i = 0; i < payloads.length; i++) {
        if (payloads[i] && payloads[i].text) text += payloads[i].text + '\n';
      }
      if (!text && data.summary) text = '(sem texto de retorno — summary: ' + escapeHtml(data.summary) + ')';
      var meta = (data.result && data.result.meta) || {};
      var dur = meta.durationMs ? Math.round(meta.durationMs / 1000) + 's' : '?s';
      var usage = meta.agentMeta ? (' · in ' + (meta.agentMeta.usage ? meta.agentMeta.usage.input : '?') + ' / out ' + (meta.agentMeta.usage ? meta.agentMeta.usage.output : '?')) : '';
      appendChatMsg('cadu', text.trim() || '(resposta vazia)', dur + usage);

      // atualizar session_id se o run criou nova
      if (data.runId && meta.agentMeta && meta.agentMeta.sessionId) {
        openclawState.lastSessionId = meta.agentMeta.sessionId;
        var ls = $('#openclaw-last-session');
        if (ls) ls.textContent = meta.agentMeta.sessionId.slice(0, 8) + '…';
      }
      if (status) status.textContent = '✅ ' + (data.summary || 'ok') + ' (' + dur + ')';
      // re-render status pra atualizar lastActive
      setTimeout(refreshOpenclaw, 1500);
    } catch (e) {
      appendChatMsg('cadu', '[exception: ' + String(e && e.message || e) + ']', null);
      if (status) status.textContent = '❌ Exception';
    } finally {
      openclawState.busy = false;
      if (btn) btn.disabled = false;
    }
    return false;
  }

  function appendChatMsg(role, text, meta) {
    var log = $('#openclaw-chat-log');
    if (!log) return;
    if (log.querySelector('.kc-cadu-empty')) log.innerHTML = '';
    var div = document.createElement('div');
    div.className = 'kc-openclaw-chat-msg kc-openclaw-chat-msg--' + role;
    var roleLabel = role === 'user' ? 'VOCÊ' : 'CADU';
    var html = '<div class="kc-openclaw-chat-msg__role">' + roleLabel + '</div>' +
               '<div class="kc-openclaw-chat-msg__text">' + escapeHtml(text || '') + '</div>';
    if (meta) html += '<div class="kc-openclaw-chat-msg__meta">' + escapeHtml(meta) + '</div>';
    div.innerHTML = html;
    log.appendChild(div);
    // auto-scroll
    log.scrollTop = log.scrollHeight;
  }

  async function openclawTriggerHeartbeat() {
    var btn = $('#openclaw-trigger-heartbeat-btn');
    if (btn) btn.disabled = true;
    try {
      var resp = await apiFetch('/api/cadu/openclaw/agent-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Admin trigger from KinoCampus UI', agent: 'main' }),
      });
      if (resp && !resp.__error) {
        setTimeout(refreshOpenclaw, 1500);
      }
    } catch (e) {}
    finally { if (btn) btn.disabled = false; }
  }

  async function openclawShowLogs() {
    var box = $('#openclaw-logs-box');
    var pre = $('#openclaw-logs-pre');
    if (!box || !pre) return;
    if (!box.hidden) { box.hidden = true; return; }
    pre.textContent = 'Carregando…';
    box.hidden = false;
    try {
      var resp = await apiFetch('/api/cadu/openclaw/logs?limit=100');
      if (resp && !resp.__error) {
        pre.textContent = (resp.stdout || '') + (resp.stderr ? '\n[stderr]\n' + resp.stderr : '');
      } else {
        pre.textContent = 'Erro: ' + (resp ? JSON.stringify(resp) : 'sem resposta');
      }
    } catch (e) {
      pre.textContent = 'Exception: ' + e.message;
    }
  }

  // ============================================================
  // Cross-tab: "Perguntar Cadu" a partir de Sites/Feed/Pipeline
  // ============================================================

  async function askCaduContext(ev) {
    if (ev) ev.preventDefault();
    var btn = ev && ev.currentTarget;
    if (btn && btn.disabled) return false;
    if (btn) btn.disabled = true;
    try {
      var kind = btn.getAttribute('data-ask-kind') || 'raw';
      var sessionId = openclawState.lastSessionId || null;
      var agentReq = 'main';
      var message = '';

      if (kind === 'feed') {
        var chunkId = btn.getAttribute('data-ask-id') || '';
        var heading = btn.getAttribute('data-ask-heading') || '';
        message = 'Resume e me diga o que faco com o chunk "' + heading + '" (id=' + chunkId + ').';
        // Tenta endpoint dedicado /api/feed/{id}/ask (cadu-api v0.4.6+)
        // via proxy consolidado /api/cadu/feed?path={chunk_id}/ask
        var resp = await apiFetch('/api/cadu/feed?path=' + encodeURIComponent(chunkId + '/ask'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: message, session_id: sessionId, agent: agentReq }),
        });
        if (!resp || resp.__error) {
          // Fallback: monta contexto inline + agent-send
          message = '<chunk-context id="' + chunkId + '" heading="' + heading.replace(/"/g, "'") + '">' + (btn.getAttribute('data-ask-snippet') || '(conteudo sera carregado pelo Cadu)') + '</chunk-context>\n\n' + message;
          resp = await apiFetch('/api/cadu/openclaw/agent-send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message, session_id: sessionId, agent: agentReq }),
          });
        }
        if (resp && !resp.__error) {
          switchTab('openclaw');
          setTimeout(refreshOpenclaw, 800);
        }
      } else if (kind === 'site') {
        var siteName = btn.getAttribute('data-ask-name') || '';
        var siteUrl = btn.getAttribute('data-ask-url') || '';
        var siteIg = btn.getAttribute('data-ask-instagram') || '';
        var siteTier = btn.getAttribute('data-ask-tier') || '';
        message = '<site-context name="' + siteName + '" url="' + siteUrl + '" instagram="' + siteIg + '" tier="' + siteTier + '"></site-context>\n\nMe de um resumo rapido sobre o que voce sabe do site "' + siteName + '" (' + siteUrl + ') e o que vale destacar. Use os tiers e notas que voce tem em mente.';
        var resp2 = await apiFetch('/api/cadu/openclaw/agent-send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: message, session_id: sessionId, agent: agentReq }),
        });
        if (resp2 && !resp2.__error) {
          switchTab('openclaw');
          setTimeout(refreshOpenclaw, 800);
        }
      } else if (kind === 'pipeline') {
        var runId = btn.getAttribute('data-ask-run-id') || '';
        var stage = btn.getAttribute('data-ask-stage') || '';
        var status = btn.getAttribute('data-ask-status') || '';
        message = '<run-context id="' + runId + '" stage="' + stage + '" status="' + status + '"></run-context>\n\nAnalise a pipeline run "' + runId.slice(0, 8) + '..." (stage=' + stage + ', status=' + status + '). Voce pode buscar detalhes via /api/cadu/pipeline/' + runId + '/export.';
        var resp3 = await apiFetch('/api/cadu/openclaw/agent-send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: message, session_id: sessionId, agent: agentReq }),
        });
        if (resp3 && !resp3.__error) {
          switchTab('openclaw');
          setTimeout(refreshOpenclaw, 800);
        }
      }
    } catch (e) {
      console.error('askCaduContext error:', e);
      try { alert('Erro ao enviar ao Cadu: ' + (e && e.message ? e.message : e)); } catch (_) {}
    } finally {
      if (btn) btn.disabled = false;
    }
    return false;
  }

  // ============================================================
  // Notification bell (cross-tab via Vercel polling - nao Supabase Realtime
  // por causa de RLS + perf). Atualiza bell com runs/publicacoes recentes.
  // ============================================================

  var notifState = { lastCount: 0, runs: [], seen: {} };

  function pollNotifActivity() {
    var bell = $('#kcNotifBell');
    var badge = $('#kcNotifBadge');
    var list = $('#kcNotifList');
    if (!bell || !badge) return;

    apiFetch('/api/cadu/pipeline/runs?limit=8')
      .then(function (r) { return r && !r.__error ? r : null; })
      .then(function (data) {
        if (!data || !Array.isArray(data.runs)) return;
        notifState.runs = data.runs;

        var dayAgo = Math.floor(Date.now() / 1000) - 86400;
        var recent24h = data.runs.filter(function (r) { return (r.started_at || 0) >= dayAgo; });

        try {
          var seenIds = JSON.parse(localStorage.getItem('kc_cadu_seen_runs') || '{}');
          var newOnes = data.runs.filter(function (r) { return !seenIds[r.id]; });
          if (Object.keys(seenIds).length > 0 && newOnes.length > 0) {
            badge.textContent = newOnes.length > 9 ? '9+' : String(newOnes.length);
            badge.style.display = '';
          } else if (recent24h.length > 0) {
            badge.textContent = recent24h.length > 9 ? '9+' : String(recent24h.length);
            badge.style.display = '';
          } else {
            badge.style.display = 'none';
          }
        } catch (e) {
          badge.style.display = 'none';
        }

        try {
          var newSeen = {};
          data.runs.slice(0, 20).forEach(function (r) { newSeen[r.id] = Date.now(); });
          localStorage.setItem('kc_cadu_seen_runs', JSON.stringify(newSeen));
        } catch (e) {}

        if (list && $('#kcNotifDropdown') && !$('#kcNotifDropdown').hasAttribute('hidden')) {
          if (data.runs.length === 0) {
            list.innerHTML = '<div class="kc-cadu-empty">Nenhuma run ainda.</div>';
            return;
          }
          list.innerHTML = data.runs.slice(0, 8).map(function (r) {
            var stClass = r.status === 'finished' ? 'pill--finished'
                       : r.status === 'failed' ? 'pill--failed'
                       : r.status === 'running' ? 'pill--running' : '';
            return '<div class="kc-notif-dropdown__item" data-run="' + r.id + '">'
              + '<div class="kc-notif-dropdown__item__title">' + escapeHtml(r.stage) + '</div>'
              + '<div class="kc-notif-dropdown__item__meta">'
              + '<span class="pill ' + stClass + '">' + escapeHtml(r.status) + '</span>'
              + '<span>' + fmtAgo(r.started_at) + '</span>'
              + (r.exit_code != null ? '<span>exit ' + r.exit_code + '</span>' : '')
              + '</div>'
              + '</div>';
          }).join('');
          $$('.kc-notif-dropdown__item', list).forEach(function (it) {
            it.addEventListener('click', function () {
              switchTab('pipeline');
              $('#kcNotifDropdown').setAttribute('hidden', '');
              var rid = it.getAttribute('data-run');
              setTimeout(function () {
                var target = document.querySelector('[data-run-id="' + rid + '"]');
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 200);
            });
          });
        }
      })
      .catch(function () {});
  }

  // ============================================================
  // Tabs + eventos
  // ============================================================

  function bindEvents() {
    $$('.kc-cadu-tab').forEach(function (tab) {
      tab.addEventListener('click', function () { switchTab(tab.getAttribute('data-tab')); });
    });

    // Delegacao direta para "Perguntar Cadu" em qualquer container
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      var btn = t && t.closest ? t.closest('.kc-cadu-ask-btn') : null;
      if (btn) {
        askCaduContext({ preventDefault: function () {}, currentTarget: btn });
      }
    });

    // Notification bell: toggle dropdown + click-outside close
    var notifBell = $('#kcNotifBell');
    var notifDropdown = $('#kcNotifDropdown');
    if (notifBell && notifDropdown) {
      notifBell.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var isHidden = notifDropdown.hasAttribute('hidden');
        if (isHidden) {
          notifDropdown.removeAttribute('hidden');
          pollNotifActivity();
        } else {
          notifDropdown.setAttribute('hidden', '');
        }
      });
      document.addEventListener('click', function (ev) {
        if (!notifDropdown.hasAttribute('hidden') &&
            !notifDropdown.contains(ev.target) &&
            ev.target !== notifBell) {
          notifDropdown.setAttribute('hidden', '');
        }
      });
    }

    // Periodic status poll (a cada 30s): atualiza cadu-api/version pills + activity bell
    setInterval(function () {
      // Poll silencioso - so atualiza se API saudavel
      fetch('/api/cadu/health', { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) return;
          var vp = $('#cadu-version-text');
          if (vp && data.version && vp.textContent !== 'v' + data.version) {
            vp.textContent = 'v' + data.version;
          }
          if (data.version && data.version !== state.lastVersion) {
            state.lastVersion = data.version;
            // Se a versao mudou (ex: Yan restartou cadu-api), refrescar pills
            var cp = $('#cadu-context-pill');
            if (cp && cp.style.display === 'none' && versionAtLeast(data.version, '0.4.6')) {
              pollNotifActivity();
            }
          }
        })
        .catch(function () {});
    }, 30000);

    // First poll (assincrono, nao bloqueia init)
    setTimeout(pollNotifActivity, 2000);

    var sitesSearch = $('#sites-search');
    var sitesTier = $('#sites-tier');
    var sitesIg = $('#sites-ig');
    sitesSearch.addEventListener('input', function () { state.sitesFilter.q = sitesSearch.value; applySitesFilter(); });
    sitesTier.addEventListener('change', function () { state.sitesFilter.tier = sitesTier.value; applySitesFilter(); });
    sitesIg.addEventListener('change', function () { state.sitesFilter.ig = sitesIg.value; applySitesFilter(); });

    // OpenClaw (v0.4.3)
    var ocRefresh = $('#openclaw-refresh-btn');
    if (ocRefresh) ocRefresh.addEventListener('click', refreshOpenclaw);
    var ocForm = $('#openclaw-chat-form');
    if (ocForm) ocForm.addEventListener('submit', openclawSendChat);
    var ocHeartbeat = $('#openclaw-trigger-heartbeat-btn');
    if (ocHeartbeat) ocHeartbeat.addEventListener('click', openclawTriggerHeartbeat);
    var ocLogs = $('#openclaw-show-logs-btn');
    if (ocLogs) ocLogs.addEventListener('click', openclawShowLogs);
    // Enter no textarea envia (Shift+Enter quebra linha)
    var ocInput = $('#openclaw-chat-input');
    if (ocInput) {
      ocInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          openclawSendChat();
        }
      });
    }

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

  // ============================================================
  // Pipeline (v0.4.0)
  // ============================================================

  function getCaduConfig() {
    // v0.4.3: usa Vercel proxy (mesmo domínio = CSP OK + Edge Function SSE).
    // Fallback pra VPS direta se explicitamente configurado.
    var env = window.KC_ENV || {};
    var direct = env.CADU_API_DIRECT_URL;
    var baseUrl = direct || window.KC_API_URL || '/api/cadu';
    var localDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    return {
      url: String(baseUrl || '').replace(/\/$/, ''),
      direct: !!direct,
      token: localDev ? (env.CADU_API_TOKEN || window.KC_API_TOKEN || '') : '',
    };
  }

  function buildCaduApiUrl(path) {
    var cfg = getCaduConfig();
    var p = String(path || '');
    if (/^https?:\/\//i.test(p)) return p;
    if (cfg.direct) {
      var mapped = p.replace(/^\/api\/cadu\/?/, '/api/');
      return cfg.url + mapped;
    }
    if (cfg.url && cfg.url !== '/api/cadu' && /^\/api\/cadu(\/|$)/.test(p)) {
      return cfg.url + p.replace(/^\/api\/cadu/, '');
    }
    return p;
  }

  function appendQuery(url, params) {
    var pairs = [];
    Object.keys(params || {}).forEach(function (key) {
      var value = params[key];
      if (value !== undefined && value !== null && value !== '') {
        pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
      }
    });
    if (!pairs.length) return url;
    return url + (url.indexOf('?') === -1 ? '?' : '&') + pairs.join('&');
  }

  async function buildCaduUrlForBrowser(path, params) {
    var cfg = getCaduConfig();
    var query = Object.assign({}, params || {});
    if (cfg.direct) {
      if (cfg.token) query.token = cfg.token;
    } else {
      var adminToken = await getAdminAccessToken();
      if (adminToken) query.kc_admin_token = adminToken;
    }
    return appendQuery(buildCaduApiUrl(path), query);
  }

  async function apiFetch(path, opts) {
    var cfg = getCaduConfig();
    var url = buildCaduApiUrl(path);
    try {
      var headers = Object.assign({ 'Accept': 'application/json' }, (opts && opts.headers) || {});
      if (cfg.direct && cfg.token) {
        headers.Authorization = 'Bearer ' + cfg.token;
      } else if (!cfg.direct) {
        var adminToken = await getAdminAccessToken();
        if (adminToken) headers.Authorization = 'Bearer ' + adminToken;
      }
      var res = await fetch(url, Object.assign({}, opts || {}, { headers: headers }));
      var ct = res.headers.get('content-type') || '';
      var data = ct.indexOf('application/json') !== -1 ? await res.json() : await res.text();
      if (!res.ok) {
        console.error('[cadu-api] ' + url + ' HTTP ' + res.status, data);
        // Retorna estrutura com status pra handling de erros no caller
        // (ex: 409 dedup mostra mensagem específica em vez de "sem resposta")
        return { __error: true, status: res.status, data: data };
      }
      return data;
    } catch (e) {
      console.error('[cadu-api] ' + url + ' error:', e);
      return { __error: true, status: 0, data: null, message: String(e && e.message || e) };
    }
  }

  var pipelineEventSource = null;
  var pipelineLogPollTimer = null;
  var pipelineLogPollRunId = null;

  function fmtAgo(unix) {
    if (!unix) return '—';
    var sec = Math.max(0, Math.floor(Date.now() / 1000) - unix);
    if (sec < 60) return sec + 's atrás';
    if (sec < 3600) return Math.floor(sec / 60) + 'min atrás';
    if (sec < 86400) return Math.floor(sec / 3600) + 'h atrás';
    return Math.floor(sec / 86400) + 'd atrás';
  }

  function fmtDur(unixStart, unixEnd) {
    if (!unixStart) return '—';
    var sec = Math.max(0, (unixEnd || Math.floor(Date.now() / 1000)) - unixStart);
    if (sec < 60) return sec + 's';
    return Math.floor(sec / 60) + 'min ' + (sec % 60) + 's';
  }

  function fmtSecondsWindow(sec) {
    if (sec == null) return 'sem sucesso all';
    sec = Math.max(0, Math.floor(sec));
    if (sec < 60) return sec + 's';
    if (sec < 3600) return Math.floor(sec / 60) + 'min';
    if (sec < 86400) return Math.floor(sec / 3600) + 'h';
    return Math.floor(sec / 86400) + 'd';
  }

  function categoryIcon(category) {
    var map = {
      scan: 'fa-magnifying-glass-chart',
      process: 'fa-wand-magic-sparkles',
      publish: 'fa-rocket',
      maintenance: 'fa-screwdriver-wrench',
    };
    return map[category] || 'fa-circle-play';
  }

  async function refreshPipeline() {
    var status = await apiFetch('/api/cadu/pipeline');
    if (!status || status.__error) return;
    state.pipelineActive = status.active_run || null;
    state.pipelineStages = status.stages || [];
    state.pipelineHistory = status.history || [];
    state.pipelineHealth = status.health || state.pipelineHealth;
    renderPipelineStages(status.stages || []);
    renderPipelineActive(state.pipelineActive);
    if (status.health) renderPipelineHealth(status.health);
    else refreshPipelineHealth();
    renderPipelineHistory(state.pipelineHistory);
    updatePipelineBadge(status);

    // Se ha run ativo, acompanha por SSE curto ou polling para runs longos.
    if (status.active_run && status.active_run.status === 'running') {
      if (shouldUsePipelineLogPolling(status.active_run)) {
        connectPipelineLogPolling(status.active_run.id);
      } else {
        stopPipelineLogPolling();
        if (!pipelineEventSource || pipelineEventSource.runId !== status.active_run.id) {
          connectPipelineStream(status.active_run.id);
        }
      }
    } else {
      disconnectPipelineStream();
      stopPipelineLogPolling();
    }
  }

  async function refreshPipelineHealth() {
    var health = await apiFetch('/api/cadu/pipeline/health');
    if (health && !health.__error) {
      state.pipelineHealth = health;
      renderPipelineHealth(health);
    } else {
      renderPipelineHealth(null);
    }
  }

  function findPipelineStage(stageId) {
    return (state.pipelineStages || []).find(function (stage) { return stage && stage.id === stageId; }) || null;
  }

  function stageChip(text, level) {
    return '<span class="kc-pipeline-stage__chip' + (level ? ' is-' + escapeHtml(level) : '') + '">' + escapeHtml(text) + '</span>';
  }

  function effectLabel(effect) {
    var labels = {
      workspace_artifacts: 'gera arquivos',
      supabase_read: 'le Supabase',
      supabase_update: 'altera Supabase',
      supabase_insert: 'insere Supabase',
      edge_publish: 'publica feed',
      post_media_insert: 'adiciona midia',
      browser_cdp: 'usa CDP',
      ig_seen_cache: 'cache IG',
      ai_api: 'usa IA',
      workspace_report: 'gera relatorio',
      sigaa_login: 'login SIGAA',
      captcha_solver: 'captcha',
      google_calendar_write: 'altera Calendar'
    };
    return labels[effect] || effect;
  }

  function renderStagePreflight(s) {
    var pf = s.preflight || {};
    var profile = pf.profile || {};
    var checks = pf.checks || [];
    var missing = checks.filter(function (check) { return check.status === 'missing'; });
    var level = pf.can_run === false ? 'danger' : (missing.length ? 'warning' : 'ok');
    var chips = [];
    chips.push(stageChip(pf.can_run === false ? 'bloqueado' : (missing.length ? 'atencao' : 'preflight ok'), level));
    chips.push(stageChip('risco ' + (profile.risk || 'n/d'), profile.risk === 'high' ? 'danger' : (profile.risk === 'medium' ? 'warning' : 'ok')));
    if (profile.mutates_platform) chips.push(stageChip(profile.default_dry_run ? 'dry-run padrao' : 'altera dados reais', profile.default_dry_run ? 'ok' : 'danger'));
    else chips.push(stageChip('sem mutacao direta', 'ok'));
    (profile.effects || []).slice(0, 3).forEach(function (effect) { chips.push(stageChip(effectLabel(effect), '')); });
    if ((profile.effects || []).length > 3) chips.push(stageChip('+' + ((profile.effects || []).length - 3), ''));
    var script = pf.script || {};
    var scriptHtml = '<div class="kc-pipeline-stage__script" title="' + escapeHtml(script.path || s.script || '') + '">' +
      '<i class="fas fa-file-code"></i> ' + escapeHtml(script.relative_path || s.script || '') +
      (script.exists === false ? ' · ausente' : '') +
      '</div>';
    return '<div class="kc-pipeline-stage__preflight">' + chips.join('') + '</div>' + scriptHtml;
  }

  function renderRunSummary(summary) {
    if (!summary || !summary.metrics) return '';
    var m = summary.metrics || {};
    var parts = [];
    if (m.publishable != null) parts.push('<span>publicaveis ' + escapeHtml(m.publishable) + '</span>');
    if (m.published != null) {
      var cls = (Number(m.published) === 0 && Number(m.publishable || 0) > 0) ? ' class="is-warning"' : '';
      parts.push('<span' + cls + '>publicados ' + escapeHtml(m.published) + '</span>');
    }
    if (m.updated != null) parts.push('<span>atualizados ' + escapeHtml(m.updated) + '</span>');
    if (m.discarded != null) parts.push('<span>descartados ' + escapeHtml(m.discarded) + '</span>');
    if (summary.duration_sec != null) parts.push('<span>' + escapeHtml(Math.round(Number(summary.duration_sec))) + 's</span>');
    if ((summary.warnings || []).length) parts.push('<span class="is-warning">avisos ' + summary.warnings.length + '</span>');
    return parts.length ? '<div class="kc-pipeline-history-item__summary">' + parts.join('') + '</div>' : '';
  }

  function renderPipelineStages(stages) {
    var container = $('#pipeline-stages-list');
    if (!container) return;
    if (!stages.length) { container.innerHTML = '<div class="kc-cadu-empty">Sem estágios disponíveis.</div>'; return; }
    container.innerHTML = stages.map(function (s) {
      var lastTxt = '— sem runs —';
      var lastCls = '';
      if (s.last_run) {
        lastTxt = fmtAgo(s.last_run.started_at) + ' (' + (s.last_run.status || '') + ')';
        lastCls = 'is-' + (s.last_run.status || '');
      }
      var pf = s.preflight || {};
      var profile = pf.profile || {};
      var canRun = pf.can_run !== false;
      var mutatesReal = profile.mutates_platform && !profile.default_dry_run;
      var btnClass = 'kc-pipeline-stage__btn' + (mutatesReal ? ' is-danger' : '');
      var btnTitle = canRun ? 'Executar ' + s.id : 'Indisponivel: ' + ((pf.blockers || []).map(function (b) { return b.detail || b.label || b.id; }).join(', ') || 'preflight falhou');
      var lastSummary = s.last_run && s.last_run.summary ? renderRunSummary(s.last_run.summary) : '';
      return '<div class="kc-pipeline-stage">' +
        '<div class="kc-pipeline-stage__head"><i class="fas ' + categoryIcon(s.category) + '"></i><strong>' + escapeHtml(s.name) + '</strong></div>' +
        '<div class="kc-pipeline-stage__desc">' + escapeHtml(s.description) + '</div>' +
        renderStagePreflight(s) +
        '<div class="kc-pipeline-stage__meta">' +
          '<span class="kc-pipeline-history-item ' + lastCls + '" style="border:none;padding:2px 6px;"><i class="fas fa-clock"></i> ' + lastTxt + '</span>' +
          '<span style="margin-left:auto;">~' + s.estimated_sec + 's</span>' +
        '</div>' +
        lastSummary +
        '<button class="' + btnClass + '" data-stage="' + escapeHtml(s.id) + '" title="' + escapeHtml(btnTitle) + '"' + (canRun ? '' : ' disabled') + '><i class="fas fa-play"></i> ' + (canRun ? 'Executar' : 'Indisponivel') + '</button>' +
      '</div>';
    }).join('');

    // Bind botões (delegação não funciona pq innerHTML é reescrito)
    $$('#pipeline-stages-list .kc-pipeline-stage__btn').forEach(function (btn) {
      btn.addEventListener('click', function () { runPipelineStage(btn.getAttribute('data-stage')); });
    });
  }

  function renderPipelineActive(active) {
    var card = $('#pipeline-active-card');
    var dot = $('#pipeline-status-dot');
    var logBox = $('#pipeline-log');
    if (!card) return;
    if (!active) {
      card.className = 'kc-pipeline-active-card';
      card.innerHTML = '<div class="kc-cadu-empty"><i class="fas fa-moon"></i> Nenhum run ativo. Clique em um estágio à esquerda para iniciar.</div>';
      if (dot) { dot.className = 'kc-pipeline-status-dot'; dot.title = 'Sem run ativo'; }
      if (logBox && (!pipelineEventSource) && (!pipelineLogPollTimer)) logBox.innerHTML = '<div class="kc-cadu-empty" style="padding:30px 0;">Aguardando início do run…</div>';
      return;
    }
    var cls = 'is-' + active.status;
    card.className = 'kc-pipeline-active-card ' + cls;
    if (dot) { dot.className = 'kc-pipeline-status-dot ' + cls; dot.title = active.status + ' (' + fmtAgo(active.started_at) + ')'; }
    var stopBtn = active.status === 'running'
      ? '<button class="kc-pipeline-active-card__stop" data-stop="' + active.id + '"><i class="fas fa-stop"></i> Parar</button>'
      : '';
    card.innerHTML =
      '<div class="kc-pipeline-active-card__head">' +
        '<strong>' + escapeHtml(active.stage) + '</strong>' +
        '<span class="kc-cadu-badge ' + cls + '" style="background:rgba(255,107,0,.12);color:#ff6b00;">' + escapeHtml(active.status) + '</span>' +
        stopBtn +
      '</div>' +
      '<div class="kc-pipeline-active-card__meta">' +
        '<span><i class="fas fa-fingerprint"></i> <code>' + active.id.slice(0, 8) + '</code></span>' +
        '<span><i class="fas fa-clock"></i> Iniciado ' + fmtAgo(active.started_at) + '</span>' +
        '<span><i class="fas fa-hourglass-half"></i> ' + fmtDur(active.started_at, active.finished_at) + '</span>' +
        (active.exit_code != null ? '<span><i class="fas fa-flag-checkered"></i> exit ' + active.exit_code + '</span>' : '') +
      '</div>' +
      renderRunSummary(active.summary);
    var stopEl = card.querySelector('[data-stop]');
    if (stopEl) stopEl.addEventListener('click', function () { stopPipelineRun(active.id); });
  }

  function renderPipelineHealth(health) {
    var card = $('#pipeline-health-card');
    if (!card) return;
    if (!health) {
      card.className = 'kc-pipeline-health-card is-warning';
      card.innerHTML =
        '<div class="kc-pipeline-health-card__head">' +
          '<strong><i class="fas fa-heart-pulse"></i> Saúde da automação</strong>' +
          '<span class="kc-pipeline-health-card__level is-warning">indisponível</span>' +
        '</div>' +
        '<div class="kc-pipeline-health-card__meta">Endpoint de health ainda não respondeu.</div>';
      return;
    }
    var level = health.level || health.status || 'warning';
    if (health.status === 'running' && level === 'ok') level = 'running';
    if (['ok', 'running', 'warning', 'critical'].indexOf(level) === -1) level = 'warning';
    var label = {
      ok: 'ok',
      running: 'rodando',
      warning: 'atenção',
      critical: 'crítico'
    }[level] || level;
    var lastSuccess = health.last_successful_all_run || null;
    var latest = health.latest_run || null;
    var since = fmtSecondsWindow(health.seconds_since_successful_all);
    var failures = health.failures_recent_count || 0;
    var issues = (health.issues || []).slice(0, 3);
    var issueHtml = issues.length
      ? '<ul class="kc-pipeline-health-card__issues">' + issues.map(function (issue) { return '<li>' + escapeHtml(issue) + '</li>'; }).join('') + '</ul>'
      : '';
    card.className = 'kc-pipeline-health-card is-' + level;
    card.innerHTML =
      '<div class="kc-pipeline-health-card__head">' +
        '<strong><i class="fas fa-heart-pulse"></i> Saúde da automação</strong>' +
        '<span class="kc-pipeline-health-card__level is-' + level + '">' + escapeHtml(label) + '</span>' +
      '</div>' +
      '<div class="kc-pipeline-health-card__meta">' +
        '<span><i class="fas fa-rotate"></i> all ok: ' + (lastSuccess ? fmtAgo(lastSuccess.finished_at || lastSuccess.started_at) : 'nunca') + '</span>' +
        '<span><i class="fas fa-hourglass-half"></i> atraso: ' + escapeHtml(since) + '</span>' +
        '<span><i class="fas fa-triangle-exclamation"></i> falhas 24h: ' + failures + '</span>' +
        (latest ? '<span><i class="fas fa-clock"></i> última: ' + escapeHtml(latest.stage || '?') + ' ' + escapeHtml(latest.status || '?') + '</span>' : '') +
      '</div>' +
      issueHtml +
      (health.recommendation ? '<div class="kc-pipeline-health-card__meta"><span><i class="fas fa-screwdriver-wrench"></i> ' + escapeHtml(health.recommendation) + '</span></div>' : '');
  }

  function renderPipelineHistory(history) {
    var container = $('#pipeline-history-list');
    if (!container) return;
    if (!history.length) { container.innerHTML = '<div class="kc-cadu-empty">Sem runs anteriores.</div>'; return; }
    container.innerHTML = history.slice(0, 20).map(function (r) {
      var cls = 'is-' + (r.status || 'unknown');
      var actions = '';
      // só mostra ações pra runs terminados
      if (r.status === 'finished' || r.status === 'failed' || r.status === 'cancelled') {
        actions =
          '<div class="kc-pipeline-history-item__actions">' +
            '<button class="kc-pipeline-history-btn" data-action="view" data-run="' + r.id + '" title="Ver artefatos + log"><i class="fas fa-eye"></i></button>' +
            '<button class="kc-pipeline-history-btn" data-action="download-log" data-run="' + r.id + '" title="Baixar log completo (.log)"><i class="fas fa-download"></i></button>' +
            '<button class="kc-pipeline-history-btn" data-action="export" data-run="' + r.id + '" title="Export consolidado (JSON)"><i class="fas fa-file-export"></i></button>' +
            '<button class="kc-pipeline-history-btn kc-pipeline-history-btn--ask" data-action="ask-cadu" data-run="' + r.id + '" title="Perguntar ao Cadu sobre esta run"><i class="fas fa-robot"></i></button>' +
          '</div>';
      }
      return '<div class="kc-pipeline-history-item ' + cls + '" data-run-id="' + r.id + '">' +
        '<div class="kc-pipeline-history-item__head">' +
          '<strong>' + escapeHtml(r.stage) + '</strong>' +
          '<span style="font-size:.7rem;color:var(--kc-text-dark-secondary);">' + escapeHtml(r.status) + '</span>' +
        '</div>' +
        '<div class="kc-pipeline-history-item__id">' + r.id.slice(0, 8) + ' · ' + fmtAgo(r.started_at) + ' · ' + fmtDur(r.started_at, r.finished_at) + (r.exit_code != null ? ' · exit ' + r.exit_code : '') + '</div>' +
        renderRunSummary(r.summary) +
        actions +
      '</div>';
    }).join('');
    // wire actions
    container.querySelectorAll('button[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.getAttribute('data-action');
        var runId = btn.getAttribute('data-run');
        if (action === 'view') openRunDetailsModal(runId);
        else if (action === 'download-log') downloadRunLog(runId);
        else if (action === 'export') downloadRunExport(runId);
        else if (action === 'ask-cadu') askCaduAboutRun(runId);
      });
    });
  }

  function openRunDetailsModal(runId) {
    var modal = ensureRunDetailsModal();
    modal.body.innerHTML = '<div class="kc-cadu-empty"><i class="fas fa-spinner fa-spin"></i> Carregando artefatos...</div>';
    modal.title.textContent = 'Run ' + runId.slice(0, 8);
    modal.el.style.display = 'flex';
    // fetch artifacts + log tail in parallel
    Promise.all([
      apiFetch('/api/cadu/pipeline/' + runId + '/artifacts').then(function (r) { return r.data || r; }),
      apiFetch('/api/cadu/pipeline/' + runId + '/log?tail=80').then(function (r) { return r.data || r; }),
      apiFetch('/api/cadu/pipeline/' + runId + '/export').then(function (r) { return r.data || r; }),
    ]).then(function (res) {
      var arts = res[0].artifacts || [];
      var log = res[1].content || '';
      var exp = res[2] || {};
      var exportSummary = {
        metrics: exp.summary_metrics || {},
        warnings: exp.summary_warnings || [],
        duration_sec: exp.summary && exp.summary.duration_sec
      };
      var summaryHtml = renderRunSummary(exportSummary) || '<div class="kc-cadu-empty">Resumo operacional ainda não detectado no log.</div>';
      var artifactsHtml = arts.length
        ? arts.map(function (a) {
            return '<div class="kc-pipeline-artifact">' +
              '<i class="fas fa-file-code"></i> ' +
              '<span class="kc-pipeline-artifact__kind">' + escapeHtml(a.kind || 'other') + '</span>' +
              ' <span class="kc-pipeline-artifact__name">' + escapeHtml(a.name) + '</span>' +
              (a.stale_for_run ? ' <span class="kc-pipeline-artifact__kind" title="Arquivo do mesmo dia, mas anterior ao inicio deste run">antes do run</span>' : '') +
              ' <span style="color:var(--kc-text-dark-secondary);font-size:.7rem;">' + (a.size_bytes / 1024).toFixed(1) + ' KB</span>' +
            '</div>';
          }).join('')
        : '<div class="kc-cadu-empty">Nenhum artefato encontrado.</div>';
      var logHtml = '<pre class="kc-pipeline-log-tail">' + escapeHtml(log) + '</pre>';
      modal.body.innerHTML =
        '<h4 style="margin:0 0 8px;font-size:.85rem;">Resumo</h4>' +
        summaryHtml +
        '<h4 style="margin:0 0 8px;font-size:.85rem;">Artefatos (' + arts.length + ')</h4>' +
        artifactsHtml +
        '<h4 style="margin:14px 0 8px;font-size:.85rem;">Log (últimas 80 linhas)</h4>' +
        logHtml +
        '<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">' +
          '<button class="kc-pipeline-history-btn kc-pipeline-history-btn--ask" id="modal-ask-cadu" data-run="' + runId + '"><i class="fas fa-robot"></i> Perguntar ao Cadu</button>' +
          '<button class="kc-pipeline-history-btn" id="modal-download-log" data-run="' + runId + '"><i class="fas fa-download"></i> Baixar log</button>' +
          '<button class="kc-pipeline-history-btn" id="modal-export" data-run="' + runId + '"><i class="fas fa-file-export"></i> Export JSON</button>' +
          '<button class="kc-pipeline-history-btn" id="modal-close" style="margin-left:auto;"><i class="fas fa-times"></i> Fechar</button>' +
        '</div>';
      var closeBtn = document.getElementById('modal-close');
      if (closeBtn) closeBtn.addEventListener('click', function () { modal.el.style.display = 'none'; });
      var askBtn = document.getElementById('modal-ask-cadu');
      if (askBtn) askBtn.addEventListener('click', function () { modal.el.style.display = 'none'; askCaduAboutRun(runId); });
      var dlBtn = document.getElementById('modal-download-log');
      if (dlBtn) dlBtn.addEventListener('click', function () { downloadRunLog(runId); });
      var expBtn = document.getElementById('modal-export');
      if (expBtn) expBtn.addEventListener('click', function () { downloadRunExport(runId); });
    }).catch(function (err) {
      modal.body.innerHTML = '<div style="color:#ef4444;">Erro ao carregar: ' + escapeHtml(err && err.message || String(err)) + '</div>';
    });
  }

  function ensureRunDetailsModal() {
    var el = document.getElementById('run-details-modal');
    if (el) return { el: el, title: el.querySelector('.kc-modal__title'), body: el.querySelector('.kc-modal__body') };
    el = document.createElement('div');
    el.id = 'run-details-modal';
    el.className = 'kc-modal';
    el.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;align-items:center;justify-content:center;padding:20px;';
    el.innerHTML =
      '<div class="kc-modal__inner" style="background:var(--kc-surface-dark);border:1px solid var(--kc-border-dark);border-radius:14px;max-width:900px;width:100%;max-height:90vh;display:flex;flex-direction:column;">' +
        '<div class="kc-modal__head" style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--kc-border-dark);">' +
          '<h3 class="kc-modal__title" style="margin:0;font-size:1rem;">Run</h3>' +
        '</div>' +
        '<div class="kc-modal__body" style="padding:18px;overflow:auto;flex:1;"></div>' +
      '</div>';
    el.addEventListener('click', function (e) { if (e.target === el) el.style.display = 'none'; });
    document.body.appendChild(el);
    return { el: el, title: el.querySelector('.kc-modal__title'), body: el.querySelector('.kc-modal__body') };
  }

  async function downloadRunLog(runId) {
    var url = await buildCaduUrlForBrowser('/api/cadu/pipeline/' + runId + '/log', { download: 1 });
    window.open(url, '_blank');
  }

  function downloadRunExport(runId) {
    apiFetch('/api/cadu/pipeline/' + runId + '/export').then(function (r) {
      var data = r.data || r;
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'pipeline-' + runId + '.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }).catch(function (err) {
      alert('Erro ao exportar: ' + (err && err.message || err));
    });
  }

  function findPipelineRun(runId) {
    if (state.pipelineActive && state.pipelineActive.id === runId) return state.pipelineActive;
    return (state.pipelineHistory || []).find(function (run) { return run && run.id === runId; }) || null;
  }

  function askCaduAboutRun(runId) {
    var run = findPipelineRun(runId) || { id: runId, stage: 'pipeline', status: 'unknown' };
    var attrs = {
      'data-ask-kind': 'pipeline',
      'data-ask-run-id': run.id || runId,
      'data-ask-stage': run.stage || 'pipeline',
      'data-ask-status': run.status || 'unknown'
    };
    return askCaduContext({
      preventDefault: function () {},
      currentTarget: {
        disabled: false,
        getAttribute: function (name) { return attrs[name] || ''; }
      }
    });
  }

  function updatePipelineBadge(status) {
    var badge = $('#badge-pipeline');
    if (!badge) return;
    var running = status.active_run && status.active_run.status === 'running';
    badge.textContent = running ? '● running' : (status.history ? status.history.length : 0);
  }

  function appendLogLine(text) {
    var logBox = $('#pipeline-log');
    if (!logBox) return;
    // Limpa mensagem inicial se for a primeira linha
    if (logBox.querySelector('.kc-cadu-empty')) logBox.innerHTML = '';
    var lineClass = 'kc-log-line';
    var lowText = text.toLowerCase();
    if (lowText.includes('error') || lowText.includes('failed') || lowText.includes('✗')) lineClass += ' kc-log-line--err';
    else if (lowText.includes('ok') || lowText.includes('✓') || lowText.includes('saved')) lineClass += ' kc-log-line--ok';
    var div = document.createElement('div');
    div.className = lineClass;
    div.textContent = text;
    logBox.appendChild(div);
    // Auto-scroll pra última linha (mas só se usuário já estava no fim)
    var wasAtBottom = logBox.scrollHeight - logBox.scrollTop - logBox.clientHeight < 40;
    if (wasAtBottom) logBox.scrollTop = logBox.scrollHeight;
  }

  function shouldUsePipelineLogPolling(active) {
    if (!active) return false;
    var stage = findPipelineStage(active.stage);
    var estimate = stage ? Number(stage.estimated_sec || 0) : 0;
    return active.stage === 'all' || estimate > 260;
  }

  function renderPipelineLogSnapshot(content, marker) {
    var logBox = $('#pipeline-log');
    if (!logBox) return;
    var wasAtBottom = logBox.scrollHeight - logBox.scrollTop - logBox.clientHeight < 40;
    var lines = String(content || '').split(/\r?\n/).filter(Boolean);
    if (marker) lines.push(marker);
    logBox.innerHTML = '';
    if (!lines.length) {
      logBox.innerHTML = '<div class="kc-cadu-empty" style="padding:30px 0;">Aguardando primeira linha de log...</div>';
      return;
    }
    lines.forEach(function (line) {
      var lineClass = 'kc-log-line';
      var lowText = String(line).toLowerCase();
      if (lowText.includes('error') || lowText.includes('failed') || lowText.includes('falhou')) lineClass += ' kc-log-line--err';
      else if (lowText.includes('ok') || lowText.includes('saved') || lowText.includes('concluido')) lineClass += ' kc-log-line--ok';
      var div = document.createElement('div');
      div.className = lineClass;
      div.textContent = line;
      logBox.appendChild(div);
    });
    if (wasAtBottom) logBox.scrollTop = logBox.scrollHeight;
  }

  async function refreshPipelineLogSnapshot(runId) {
    var res = await apiFetch('/api/cadu/pipeline/' + runId + '/log?tail=180');
    if (!res || res.__error) {
      appendLogLine('[log polling] falha ao buscar tail do log');
      return;
    }
    renderPipelineLogSnapshot(res.content || '', '[log polling] atualizado ' + new Date().toLocaleTimeString('pt-BR'));
  }

  function connectPipelineLogPolling(runId) {
    disconnectPipelineStream();
    if (pipelineLogPollRunId === runId && pipelineLogPollTimer) return;
    stopPipelineLogPolling();
    pipelineLogPollRunId = runId;
    refreshPipelineLogSnapshot(runId);
    pipelineLogPollTimer = setInterval(function () {
      if (pipelineLogPollRunId === runId) refreshPipelineLogSnapshot(runId);
    }, 5000);
  }

  function stopPipelineLogPolling() {
    if (pipelineLogPollTimer) clearInterval(pipelineLogPollTimer);
    pipelineLogPollTimer = null;
    pipelineLogPollRunId = null;
  }

  async function connectPipelineStream(runId) {
    stopPipelineLogPolling();
    disconnectPipelineStream();
    // v0.4.4: SSE via Vercel rewrite → pipeline-router.
    // Vercel rewrite manda source path via query ?path=, router parseia e
    // encaminha pra cadu-api com path completo.
    var cfg = getCaduConfig();
    if (!cfg.url) return;
    var url;
    if (cfg.url.replace(/\/$/, '').endsWith('/api/cadu')) {
      // Vercel proxy: URL pública é /pipeline/{id}/stream (rewrite → pipeline-router)
      url = cfg.url.replace(/\/$/, '') + '/pipeline/' + runId + '/stream?follow=true&token=' + encodeURIComponent(cfg.token);
    } else {
      // VPS direta
      url = cfg.url.replace(/\/$/, '') + '/api/pipeline/' + runId + '/stream?follow=true&token=' + encodeURIComponent(cfg.token);
    }

    url = await buildCaduUrlForBrowser('/api/cadu/pipeline/' + runId + '/stream', { follow: 'true' });

    try {
      var es = new EventSource(url, { withCredentials: false });
      pipelineEventSource = es;
      pipelineEventSource.runId = runId;
      es.addEventListener('log', function (e) {
        try { var d = JSON.parse(e.data); if (d.line) appendLogLine(d.line); } catch (err) {}
      });
      es.addEventListener('done', function (e) {
        try {
          var d = JSON.parse(e.data);
          appendLogLine('— run finished (' + d.status + ', exit=' + d.exit_code + ') —');
        } catch (err) {}
        es.close();
        pipelineEventSource = null;
        refreshPipeline();
      });
      es.addEventListener('error', function (e) {
        appendLogLine('[stream error] reconectando em 2s…');
        try { es.close(); } catch (err) {}
        pipelineEventSource = null;
        setTimeout(function () { refreshPipeline(); }, 2000);
      });
    } catch (err) {
      console.warn('SSE connect falhou:', err);
    }
  }

  function parseSSEBlock(block) {
    // Cada bloco SSE tem linhas "event: TYPE\ndata: JSON\n"
    var lines = block.split('\n');
    var eventType = 'message';
    var dataLines = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.indexOf('event:') === 0) eventType = line.substring(6).trim();
      else if (line.indexOf('data:') === 0) dataLines.push(line.substring(5).trim());
    }
    var dataStr = dataLines.join('\n');
    if (!dataStr) return;
    try {
      var d = JSON.parse(dataStr);
      if (eventType === 'log' && d.line) appendLogLine(d.line);
      else if (eventType === 'done') {
        appendLogLine('— run finished (' + d.status + ', exit=' + d.exit_code + ') —');
        disconnectPipelineStream();
        refreshPipeline();
      } else if (eventType === 'error') {
        appendLogLine('[error] ' + (d.message || ''));
      }
    } catch (e) {}
  }

  function disconnectPipelineStream() {
    if (pipelineEventSource) {
      try { pipelineEventSource.close(); } catch (e) {}
      pipelineEventSource = null;
    }
  }

  async function runPipelineStage(stageId) {
    var stage = findPipelineStage(stageId);
    var pf = stage && stage.preflight ? stage.preflight : null;
    if (pf && pf.can_run === false) {
      var blockers = (pf.blockers || []).map(function (b) { return b.detail || b.label || b.id; }).join(', ') || 'preflight falhou';
      alert('Estagio indisponivel: ' + blockers);
      return;
    }
    var profile = pf && pf.profile ? pf.profile : {};
    var warnings = pf ? (pf.warnings || []).map(function (w) { return '- ' + (w.label || w.id) + ': ' + (w.detail || w.status); }).join('\n') : '';
    var msg = 'Iniciar pipeline "' + stageId + '"?\n\nComando: ' + (pf && pf.command ? pf.command : 'node ' + stageId) +
      '\nRisco: ' + (profile.risk || 'n/d') +
      (profile.mutates_platform ? '\n\nATENCAO: este estagio altera dados reais/plataforma.' : '\n\nEste estagio nao declara mutacao direta de plataforma.') +
      (profile.default_dry_run ? '\nModo padrao: dry-run.' : '') +
      (warnings ? '\n\nAvisos:\n' + warnings : '') +
      '\n\nLogs ficarao disponiveis em tempo real abaixo.';
    if (!confirm(msg)) return;
    var btn = $$('#pipeline-stages-list .kc-pipeline-stage__btn[data-stage="' + stageId + '"]')[0];
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Iniciando…'; }
    var resp = await apiFetch('/api/cadu/pipeline/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: stageId }),
    });
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-play"></i> Executar'; }
    if (resp && resp.run_id) {
      // Limpa log box pra nova execução
      var logBox = $('#pipeline-log');
      if (logBox) logBox.innerHTML = '<div class="kc-cadu-empty" style="padding:30px 0;">Aguardando primeira linha de log…</div>';
      disconnectPipelineStream();
      stopPipelineLogPolling();
      refreshPipeline();
    } else if (resp && resp.__error) {
      // Mensagens específicas por status code
      var msg = 'Falha ao iniciar.';
      if (resp.status === 409) {
        var detail = resp.data && (resp.data.detail || resp.data);
        var existingId = (detail && detail.existing_run_id) ? detail.existing_run_id.slice(0, 8) : '?';
        msg = '⛔ Já existe um run ativo para "' + stageId + '" (id ' + existingId + ').\n\nAguarde terminar ou pare-o via botão Parar antes de iniciar novo.';
      } else if (resp.status === 401) {
        msg = '🔒 Token inválido. Verifique KC_CADU_TOKEN.';
      } else if (resp.status === 503) {
        msg = '⚙️ cadu-api não configurado (CADU_API_TOKEN ausente no .env).';
      } else if (resp.status >= 500) {
        msg = '🔥 cadu-api erro interno (HTTP ' + resp.status + '): ' + (resp.data ? (resp.data.detail || JSON.stringify(resp.data)) : 'sem detalhe');
      } else if (resp.message) {
        msg = 'Erro: ' + resp.message;
      }
      alert(msg);
    } else {
      alert('Falha ao iniciar: resposta vazia do cadu-api.');
    }
  }

  async function stopPipelineRun(runId) {
    if (!confirm('Parar este run? O subprocess será morto via SIGTERM.')) return;
    // v0.4.4: Vercel rewrite /api/cadu/pipeline/{id}/stop → pipeline-router
    var resp = await apiFetch('/api/cadu/pipeline/' + runId + '/stop', { method: 'POST' });
    if (resp && resp.ok) {
      refreshPipeline();
    } else if (resp && resp.__error) {
      var msg = 'Falha ao parar.';
      if (resp.status === 409) {
        msg = '⛔ Run não está mais ativo (já terminou ou foi parado).';
      } else if (resp.status === 404) {
        msg = '❓ Run não encontrado no cadu-api.';
      } else {
        msg = 'Erro ao parar (HTTP ' + resp.status + '): ' + (resp.data ? (resp.data.detail || JSON.stringify(resp.data)) : 'sem detalhe');
      }
      alert(msg);
    } else {
      alert('Falha ao parar: resposta vazia do cadu-api.');
    }
  }

  // Auto-refresh do pipeline a cada 5s quando na aba
  setInterval(function () {
    if (state.currentTab === 'pipeline') refreshPipeline();
  }, 5000);

  // Auto-refresh do OpenClaw a cada 15s quando na aba
  setInterval(function () {
    if (state.currentTab === 'openclaw') refreshOpenclaw();
  }, 15000);

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

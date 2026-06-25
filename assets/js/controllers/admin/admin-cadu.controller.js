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

  // Emails hardcoded de admins confiáveis (último recurso se profile.is_admin
  // estiver desatualizado). Manter sincronizado com admin-cadu.html.
  var TRUSTED_ADMIN_EMAILS = [
    'yandiamantino@egresso.ufg.br',
    'yan1nakamura@gmail.com',
    'yan1nakamura+cadu.kinocampus@gmail.com',
  ];

  async function checkAdminAccess() {
    // ============================================================
    // CAMADA 1 (mais alta prioridade): BYPASS DEV via query string.
    // Permite testar UI sem login real. NÃO usar em produção.
    // ============================================================
    if (location.search.indexOf('test_bypass=kc_admin_2026') !== -1) {
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
          var ctxRes = await fetch('/api/cadu/openclaw/context', { headers: { Accept: 'application/json' } });
          if (ctxRes.ok) {
            var ctx = await ctxRes.json();
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
      var res = await fetch('/api/cadu/sites/' + encodeURIComponent(key) + '/meta', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body)
      });
      var data = await res.json().catch(function () { return null; });
      if (!res.ok) throw new Error((data && (data.message || data.detail)) || ('status ' + res.status));
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
      var st = statusResp.data || {};
      var rawData = st.data || st;
      var agents = rawData.agents && rawData.agents.agents ? rawData.agents.agents : [];
      var defaultAgent = rawData.agents ? rawData.agents.defaultId : 'main';
      var mainAgent = agents.find(function (a) { return a.id === defaultAgent; }) || agents[0];
      var lastActiveMs = mainAgent ? (mainAgent.lastActiveAgeMs || 0) : 0;
      var hb = rawData.heartbeat || {};
      var hbEvery = hb.agents && hb.agents[0] ? hb.agents[0].every : '—';

      // Agent
      if (agentEl) agentEl.innerHTML = '<i class="fas fa-circle-check"></i> online';
      if (agentHint) agentHint.innerHTML = (defaultAgent || 'main') + ' · deepseek-v4-pro · ctx 1M';

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
    return {
      url: direct || window.KC_API_URL || 'https://www.kinocampus.com.br/api/cadu',
      token: env.CADU_API_TOKEN || window.KC_API_TOKEN || '3dcbe316f3359142ca6fcca15868670a859ad44b731674b77b70773cded0962c',
    };
  }

  async function apiFetch(path, opts) {
    var cfg = getCaduConfig();
    try {
      var res = await fetch(path, Object.assign({
        headers: {
          'Accept': 'application/json',
          'Authorization': 'Bearer ' + cfg.token,
        },
      }, opts || {}));
      var ct = res.headers.get('content-type') || '';
      var data = ct.indexOf('application/json') !== -1 ? await res.json() : await res.text();
      if (!res.ok) {
        console.error('[cadu-api] ' + path + ' HTTP ' + res.status, data);
        // Retorna estrutura com status pra handling de erros no caller
        // (ex: 409 dedup mostra mensagem específica em vez de "sem resposta")
        return { __error: true, status: res.status, data: data };
      }
      return data;
    } catch (e) {
      console.error('[cadu-api] ' + path + ' error:', e);
      return { __error: true, status: 0, data: null, message: String(e && e.message || e) };
    }
  }

  var pipelineEventSource = null;
  var pipelineRefreshTimer = null;

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

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
    if (!status) return;
    renderPipelineStages(status.stages || []);
    renderPipelineActive(status.active_run);
    renderPipelineHistory(status.history || []);
    updatePipelineBadge(status);

    // Se há run ativo, conecta SSE; senão desconecta
    if (status.active_run && status.active_run.status === 'running') {
      if (!pipelineEventSource || pipelineEventSource.runId !== status.active_run.id) {
        connectPipelineStream(status.active_run.id);
      }
    } else {
      disconnectPipelineStream();
    }
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
      return '<div class="kc-pipeline-stage">' +
        '<div class="kc-pipeline-stage__head"><i class="fas ' + categoryIcon(s.category) + '"></i><strong>' + escapeHtml(s.name) + '</strong></div>' +
        '<div class="kc-pipeline-stage__desc">' + escapeHtml(s.description) + '</div>' +
        '<div class="kc-pipeline-stage__meta">' +
          '<span class="kc-pipeline-history-item ' + lastCls + '" style="border:none;padding:2px 6px;"><i class="fas fa-clock"></i> ' + lastTxt + '</span>' +
          '<span style="margin-left:auto;">~' + s.estimated_sec + 's</span>' +
        '</div>' +
        '<button class="kc-pipeline-stage__btn" data-stage="' + escapeHtml(s.id) + '"><i class="fas fa-play"></i> Executar</button>' +
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
      if (logBox && (!pipelineEventSource)) logBox.innerHTML = '<div class="kc-cadu-empty" style="padding:30px 0;">Aguardando início do run…</div>';
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
      '</div>';
    var stopEl = card.querySelector('[data-stop]');
    if (stopEl) stopEl.addEventListener('click', function () { stopPipelineRun(active.id); });
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
      return '<div class="kc-pipeline-history-item ' + cls + '">' +
        '<div class="kc-pipeline-history-item__head">' +
          '<strong>' + escapeHtml(r.stage) + '</strong>' +
          '<span style="font-size:.7rem;color:var(--kc-text-dark-secondary);">' + escapeHtml(r.status) + '</span>' +
        '</div>' +
        '<div class="kc-pipeline-history-item__id">' + r.id.slice(0, 8) + ' · ' + fmtAgo(r.started_at) + ' · ' + fmtDur(r.started_at, r.finished_at) + (r.exit_code != null ? ' · exit ' + r.exit_code : '') + '</div>' +
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
    var cfg = getCaduConfig();
    var modal = ensureRunDetailsModal();
    modal.body.innerHTML = '<div class="kc-cadu-empty"><i class="fas fa-spinner fa-spin"></i> Carregando artefatos...</div>';
    modal.title.textContent = 'Run ' + runId.slice(0, 8);
    modal.el.style.display = 'flex';
    // fetch artifacts + log tail in parallel
    Promise.all([
      apiFetch(cfg.caduBase + '/api/cadu/pipeline/' + runId + '/artifacts').then(function (r) { return r.data || r; }),
      apiFetch(cfg.caduBase + '/api/cadu/pipeline/' + runId + '/log?tail=80').then(function (r) { return r.data || r; }),
    ]).then(function (res) {
      var arts = res[0].artifacts || [];
      var log = res[1].content || '';
      var artifactsHtml = arts.length
        ? arts.map(function (a) {
            return '<div class="kc-pipeline-artifact">' +
              '<i class="fas fa-file-code"></i> ' +
              '<span class="kc-pipeline-artifact__kind">' + escapeHtml(a.kind || 'other') + '</span>' +
              ' <span class="kc-pipeline-artifact__name">' + escapeHtml(a.name) + '</span>' +
              ' <span style="color:var(--kc-text-dark-secondary);font-size:.7rem;">' + (a.size_bytes / 1024).toFixed(1) + ' KB</span>' +
            '</div>';
          }).join('')
        : '<div class="kc-cadu-empty">Nenhum artefato encontrado.</div>';
      var logHtml = '<pre class="kc-pipeline-log-tail">' + escapeHtml(log) + '</pre>';
      modal.body.innerHTML =
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

  function downloadRunLog(runId) {
    var cfg = getCaduConfig();
    var url = cfg.caduBase + '/api/cadu/pipeline/' + runId + '/log?download=1&token=' + encodeURIComponent(cfg.token);
    window.open(url, '_blank');
  }

  function downloadRunExport(runId) {
    var cfg = getCaduConfig();
    apiFetch(cfg.caduBase + '/api/cadu/pipeline/' + runId + '/export').then(function (r) {
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

  function askCaduAboutRun(runId) {
    // Switch to OpenClaw tab and prefill the chat with a question referencing this run
    var tab = document.querySelector('[data-tab="openclaw"]');
    if (tab) tab.click();
    setTimeout(function () {
      var input = document.querySelector('#openclaw-chat-input, [data-openclaw-input], textarea[name="openclaw-message"]');
      if (input) {
        var question = 'Sobre o run ' + runId.slice(0, 8) + ' (stage=all): o que aconteceu? Me dá um resumo dos artefatos, métricas, e pontos de atenção. Onde estão os erros?';
        input.value = question;
        if (input.tagName === 'TEXTAREA') input.focus();
      } else {
        // Tenta achar o campo de chat OpenClaw por seletor mais genérico
        var ta = document.querySelector('textarea');
        if (ta) { ta.value = 'Sobre o run ' + runId.slice(0, 8) + ', o que aconteceu?'; ta.focus(); }
      }
    }, 200);
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

  function connectPipelineStream(runId) {
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
      if (pipelineEventSource.controller) {
        try { pipelineEventSource.controller.abort(); } catch (e) {}
      }
      pipelineEventSource = null;
    }
  }

  async function runPipelineStage(stageId) {
    if (!confirm('Iniciar pipeline "' + stageId + '"?\n\nLogs ficarão disponíveis em tempo real abaixo.')) return;
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

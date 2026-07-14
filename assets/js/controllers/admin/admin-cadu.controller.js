// assets/js/controllers/admin/admin-cadu.controller.js
// Controlador da página admin/cadu.html — consome /api/cadu/{health,sites,feed,publish}
//
// Estado: allSites (cache), filteredSites, allFeedItems, currentTab
// Persistência: localStorage 'kc:cadu:tab' para lembrar da aba ativa
//
// Auth: exige profile.is_admin=true (mesmo gate dos outros admin pages).

(function () {
  'use strict';

  var FEED_PAGE_SIZE = 25;
  var FEED_STALE_AFTER_MS = 26 * 60 * 60 * 1000;
  var STORAGE_TAB = 'kc:cadu:tab';
  var PIPELINE_CONTROL_CONTRACT = 'cadu-pipeline-control-v1';
  var PIPELINE_SNAPSHOT_TTL_MS = 15000;
  var OPENCLAW_POLL_INTERVAL_MS = 60000;
  var OPENCLAW_REQUEST_TIMEOUT_MS = 10000;

  var state = {
    allSites: [],
    filteredSites: [],
    filteredCatalogRows: [],
    sourceCatalog: null,
    catalogMode: 'loading',
    registryWritable: false,
    registryReadiness: null,
    sitesView: 'sources',
    sitesOrigin: '',
    sourceDrafts: Object.create(null),
    sourceSaveChains: Object.create(null),
    sourceMutationQueue: null,
    catalogRequestGeneration: 0,
    allFeedItems: [],
    feedLimit: FEED_PAGE_SIZE,
    feedPage: 0,
    feedTotal: 0,
    feedHasMore: false,
    feedLatestAt: null,
    feedDiagnostics: null,
    feedDiagnosticsLoading: false,
    sitesFilter: { q: '', tier: '', ig: '' },
    feedFilter: { q: '' },
    currentTab: 'sites',
    apiHealthy: false,
    publishingKey: null,  // chave do site sendo publicado (evita duplo-clique)
    pipelineActive: null,
    pipelineStages: [],
    pipelineHistory: [],
    pipelineCapabilities: {},
    pipelineControlReady: false,
    pipelineControlReason: 'snapshot ainda não validado',
    pipelineSnapshotExpiresAt: 0,
    pipelineRequestGeneration: 0,
    pipelineRefreshPromise: null,
    pipelineStartPending: false,
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
    // Error strings can contain upstream/operator-controlled data. Keep this
    // surface text-only; callers that need richer UI must build explicit DOM.
    wrap.textContent = String(msg == null ? '' : msg);
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
        // Prevent values controlled by upstream/admin notes from becoming a
        // spreadsheet formula when the CSV is opened in Excel/LibreOffice.
        if (/^[\t\r ]*[=+\-@]/.test(s)) s = "'" + s;
        if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
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
        // O endpoint de contexto também consulta o OpenClaw. Na aba OpenClaw,
        // o refresh dedicado já fornece o estado e evitamos CLIs concorrentes.
        try {
          var ctx = state.currentTab === 'openclaw'
            ? null
            : await apiFetch('/api/cadu/openclaw/context', { timeoutMs: OPENCLAW_REQUEST_TIMEOUT_MS });
          if (ctx && !ctx.__error) {
            state.openclawContext = ctx;
            if (contextPill) {
              contextPill.style.display = '';
              contextPill.innerHTML = '<i class="fas fa-layer-group"></i> Contexto legado: ' + ctx.sites.count + ' sites · ' + ctx.feed.count + ' chunks · ' + (ctx.openclaw.openclaw_reachable ? 'OpenClaw OK' : 'OpenClaw ?');
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

  function registryModel() {
    if (!window.KCAdminCaduSources) throw new Error('registry_model_unavailable');
    return window.KCAdminCaduSources;
  }

  function setRegistryStatus(kind, title, detail) {
    var status = $('#sites-registry-status');
    if (!status) return;
    status.className = 'kc-cadu-registry-status' + (kind ? ' is-' + kind : '');
    status.textContent = '';
    var icon = document.createElement('i');
    icon.className = kind === 'ok'
      ? 'fas fa-circle-check'
      : (kind === 'error' || kind === 'fallback' ? 'fas fa-triangle-exclamation' : 'fas fa-spinner fa-spin');
    icon.setAttribute('aria-hidden', 'true');
    var copy = document.createElement('div');
    var strong = document.createElement('strong');
    var small = document.createElement('small');
    strong.textContent = title;
    small.textContent = detail;
    copy.appendChild(strong);
    copy.appendChild(small);
    status.appendChild(icon);
    status.appendChild(copy);
  }

  function appendCatalogMetric(container, value, label) {
    var item = document.createElement('div');
    item.className = 'kc-cadu-catalog-summary__item';
    var strong = document.createElement('strong');
    var small = document.createElement('small');
    strong.textContent = String(value);
    small.textContent = label;
    item.appendChild(strong);
    item.appendChild(small);
    container.appendChild(item);
  }

  function renderCatalogSummary() {
    var container = $('#sites-catalog-summary');
    if (!container) return;
    container.textContent = '';
    if (!state.sourceCatalog) {
      container.style.display = 'none';
      return;
    }
    var summary = state.sourceCatalog.summary;
    appendCatalogMetric(container, summary.entities, 'registros de entidade');
    appendCatalogMetric(container, summary.sources, 'fontes web candidatas');
    appendCatalogMetric(container, summary.instagramProfiles, 'perfis Instagram mapeados');
    appendCatalogMetric(container, summary.instagramConfirmed, 'Instagram confirmados');
    appendCatalogMetric(container, summary.instagramPending, 'Instagram pendentes/tentativos');
    appendCatalogMetric(container, summary.instagramMissing, 'Instagram indisponíveis');
    appendCatalogMetric(container, summary.instagramRetired, 'Instagram aposentados');
    appendCatalogMetric(container, summary.entitiesWithoutWebSource, 'entidades sem site associado');
    appendCatalogMetric(container, summary.deferred, 'conciliações pendentes');
    container.style.display = '';
  }

  function sourceName(source) {
    var entities = (source && source.entities) || [];
    if (!entities.length) return source && source.id ? source.id : 'Fonte sem entidade';
    return entities.map(function (entity) {
      return entity.acronym ? entity.acronym + ' — ' + entity.name : entity.name;
    }).join(' / ');
  }

  function sourceInstagramStatus(source) {
    var profiles = (source && source.instagramProfiles) || [];
    if (!profiles.length || profiles.every(function (profile) { return profile.statusGroup === 'missing'; })) return 'missing';
    if (profiles.some(function (profile) { return profile.status === 'confirmed'; })) return 'confirmed';
    if (profiles.some(function (profile) { return profile.statusGroup === 'pending'; })) return 'pending_verification';
    return profiles[0].status || 'unknown';
  }

  function sourceAsLegacySite(source) {
    var profiles = source.instagramProfiles || [];
    var publishProfile = registryModel().selectUnambiguousConfirmedInstagram(profiles);
    var firstEntity = source.entities && source.entities[0];
    return {
      sourceId: source.id,
      name: sourceName(source),
      tier: source.effectiveTier,
      category: firstEntity ? firstEntity.kind : source.sourceKind,
      url: source.canonicalUrl,
      instagram: publishProfile ? publishProfile.handle : '',
      instagramContext: profiles.map(function (profile) {
        return '@' + profile.handle + ' (' + profile.status + ')';
      }).join(', '),
      instagram_status: sourceInstagramStatus(source),
      note: source.note,
      override_origin: source.overrideOrigin,
      collision: source.collision,
      registrySource: source
    };
  }

  function registryResponseMeta(envelope) {
    return {
      headers: {
        ETag: envelope.headers.etag,
        'X-Cadu-Registry-Sha256': envelope.headers.registrySha256,
        'X-Cadu-Registry-Origin': envelope.headers.registryOrigin
      }
    };
  }

  function formatAuditCutoff(value) {
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(String(value || ''))) return 'data de auditoria não informada';
    var parts = String(value).split('-');
    return 'auditado até ' + parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  function registryFailureLabel(error, envelope) {
    if (error && error.code) return 'contrato inválido (' + String(error.code).replace(/[^a-z0-9_-]/gi, '') + ')';
    if (envelope && envelope.status) return 'HTTP ' + envelope.status;
    return 'serviço indisponível';
  }

  function normalizedConflictFields(fields) {
    var values = Array.isArray(fields) ? fields : [];
    return ['tier', 'note'].filter(function (field) { return values.indexOf(field) !== -1; });
  }

  function sourceDraftsForReload(options) {
    var opts = options || {};
    var drafts = Object.create(null);
    Object.keys(state.sourceDrafts || {}).forEach(function (sourceId) {
      var source = sourceById(sourceId);
      var draft = state.sourceDrafts[sourceId];
      if (
        (source && (sourceDraftIsDirty(source, draft) || draft.conflict)) ||
        (!source && (sourceDraftIsDirtyWithoutSource(draft) || draft.conflict))
      ) {
        drafts[sourceId] = Object.assign({}, draft);
        if (source && !drafts[sourceId].conflictFields) {
          drafts[sourceId].pendingFields = Object.keys(sourceDraftChanges(source, draft));
        }
      }
    });
    Object.keys(opts.preserveDrafts || {}).forEach(function (sourceId) {
      drafts[sourceId] = Object.assign({}, opts.preserveDrafts[sourceId]);
    });
    if (opts.excludeDraftSourceId) delete drafts[opts.excludeDraftSourceId];
    if (opts.conflictSourceId && drafts[opts.conflictSourceId]) {
      drafts[opts.conflictSourceId].conflict = true;
      drafts[opts.conflictSourceId].conflictAcknowledged = false;
      drafts[opts.conflictSourceId].conflictFields = normalizedConflictFields(opts.conflictFields);
    }
    return drafts;
  }

  function retainCatalogDrafts(catalog, drafts) {
    var retained = Object.create(null);
    var sourceIds = Object.create(null);
    (catalog && catalog.sources || []).forEach(function (source) { sourceIds[source.id] = source; });
    Object.keys(drafts || {}).forEach(function (sourceId) {
      var source = sourceIds[sourceId];
      var draft = Object.assign({}, drafts[sourceId]);
      if (!source) {
        draft.conflict = true;
        draft.conflictAcknowledged = false;
        retained[sourceId] = draft;
        return;
      }
      if (draft.initialRevision && draft.initialRevision !== source.revision) {
        draft.conflict = true;
        draft.conflictAcknowledged = false;
        if (!draft.conflictFields) draft.conflictFields = normalizedConflictFields(draft.pendingFields);
      }
      delete draft.pendingFields;
      retained[sourceId] = draft;
    });
    return retained;
  }

  async function loadLegacySites(reason, requestGeneration, options) {
    var legacy = await apiFetchResponse('/api/cadu/sites');
    if (requestGeneration !== state.catalogRequestGeneration) return false;
    var legacyRows = Array.isArray(legacy.data)
      ? legacy.data
      : (legacy.data && Array.isArray(legacy.data.body) ? legacy.data.body : null);
    if (!legacy.ok || !legacyRows) {
      throw new Error('legacy_sites_unavailable_' + String(legacy.status || 0));
    }
    var retainedDrafts = sourceDraftsForReload(options);
    state.catalogMode = 'legacy-readonly';
    state.registryWritable = false;
    state.registryReadiness = null;
    state.sourceCatalog = null;
    state.sitesView = 'sources';
    state.sourceDrafts = retainedDrafts;
    state.filteredCatalogRows = [];
    state.allSites = legacyRows;
    var view = $('#sites-view');
    if (view) { view.value = 'sources'; view.disabled = true; }
    setRegistryStatus(
      'error',
      'Catálogo canônico indisponível — mapa legado somente leitura',
      'Motivo: ' + reason + '. Overrides estão bloqueados para evitar gravar por nomes ambíguos.'
    );
    renderCatalogSummary();
    return true;
  }

  async function loadSites(options) {
    var opts = options || {};
    var requestGeneration = ++state.catalogRequestGeneration;
    var tbody = $('#sites-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="kc-cadu-empty">Carregando e validando catálogo…</td></tr>';
    state.catalogMode = 'loading';
    state.registryWritable = false;
    state.registryReadiness = null;
    setRegistryStatus('loading', 'Validando catálogo canônico', 'Conferindo hash, ETag, IDs, associações e estado shadow.');
    var registryEnvelope = null;
    try {
      var readinessEnvelopePromise = apiFetchResponse(
        '/api/cadu/sites/source-registry/readiness',
        { timeoutMs: 4000 }
      );
      registryEnvelope = await apiFetchResponse('/api/cadu/sites/source-registry');
      if (requestGeneration !== state.catalogRequestGeneration) return 'stale';
      if (!registryEnvelope.ok) throw new Error('registry_http_' + registryEnvelope.status);
      var catalog = registryModel().buildCatalog(registryEnvelope.data, registryResponseMeta(registryEnvelope));
      // Capture against the catalog that was visible when the edit began.
      // Replacing sourceCatalog first can make an explicit null/null draft look
      // clean against a competing stable override and silently discard intent.
      var reloadDrafts = sourceDraftsForReload(opts);
      // Install the validated catalog immediately in read-only mode. Readiness
      // is a separate capability proof and must never hold the map hostage.
      state.sourceCatalog = catalog;
      state.catalogMode = 'registry';
      state.registryReadiness = null;
      state.registryWritable = false;
      state.allSites = catalog.sources.map(sourceAsLegacySite);
      state.sourceDrafts = retainCatalogDrafts(catalog, reloadDrafts);
      var view = $('#sites-view');
      if (view) { view.disabled = false; view.value = state.sitesView; }
      var usingMirror = catalog.registryOrigin === 'kino-campus-mirror';
      if (usingMirror) {
        var upstreamMirrorStatus = registryEnvelope.headers.upstreamStatus
          ? 'rota canônica do cadu-api retornou HTTP ' + registryEnvelope.headers.upstreamStatus
          : 'rota canônica ainda não disponível no backend atual';
        setRegistryStatus(
          'fallback',
          'Espelho canônico local validado — somente leitura',
          catalog.registryVersion + ' · SHA ' + catalog.registrySha256.slice(0, 12) + '… · ' +
          formatAuditCutoff(catalog.auditCutoff) + ' · ' + upstreamMirrorStatus +
          '. Sites e perfis podem ser consultados; overrides permanecem bloqueados.'
        );
      } else {
        setRegistryStatus(
          'loading',
          'Catálogo canônico validado; verificando escrita',
          catalog.registryVersion + ' · SHA ' + catalog.registrySha256.slice(0, 12) + '… · overrides permanecem bloqueados até a prova CAS.'
        );
      }
      renderCatalogSummary();
      applySitesFilter();
      computeKpis();
      var readinessEnvelope = null;
      try { readinessEnvelope = await readinessEnvelopePromise; } catch (readinessFetchError) {}
      if (requestGeneration !== state.catalogRequestGeneration) return 'stale';
      var readiness = null;
      var registryWritable = false;
      try {
        if (usingMirror) throw new Error('mirror_read_only');
        if (!readinessEnvelope || !readinessEnvelope.ok) {
          throw new Error('readiness_http_' + String(readinessEnvelope && readinessEnvelope.status || 0));
        }
        readiness = registryModel().validateRegistryReadiness(
          readinessEnvelope.data,
          { headers: { 'X-Cadu-Registry-Sha256': readinessEnvelope.headers.registrySha256 } },
          catalog
        );
        registryWritable = true;
      } catch (readinessError) {
        readiness = null;
        registryWritable = false;
      }
      state.registryReadiness = readiness;
      state.registryWritable = registryWritable;
      if (usingMirror) {
        // O espelho é deliberadamente candidato e nunca pode habilitar escrita.
        // O status detalhado já foi instalado antes do probe de readiness.
      } else if (state.registryWritable) {
        setRegistryStatus(
          'ok',
          'Catálogo canônico validado em modo shadow',
          catalog.registryVersion + ' · SHA ' + catalog.registrySha256.slice(0, 12) + '… · contrato CAS pronto; fontes e perfis permanecem desativados para execução.'
        );
      } else {
        setRegistryStatus(
          'fallback',
          'Catálogo canônico legível; overrides em modo somente leitura',
          catalog.registryVersion + ' · SHA ' + catalog.registrySha256.slice(0, 12) + '… · readiness/CAS não foi comprovado. Nenhuma escrita foi habilitada.'
        );
      }
      renderCatalogSummary();
    } catch (registryError) {
      if (requestGeneration !== state.catalogRequestGeneration) return 'stale';
      try {
        var legacyLoaded = await loadLegacySites(
          registryFailureLabel(registryError, registryEnvelope),
          requestGeneration,
          opts
        );
        if (!legacyLoaded) return 'stale';
      } catch (legacyError) {
        if (requestGeneration !== state.catalogRequestGeneration) return 'stale';
        var unavailableDrafts = sourceDraftsForReload(opts);
        state.catalogMode = 'error';
        state.registryWritable = false;
        state.registryReadiness = null;
        state.sourceCatalog = null;
        state.sourceDrafts = unavailableDrafts;
        state.allSites = [];
        setRegistryStatus('error', 'Não foi possível carregar o mapa UFG', 'Catálogo canônico e fallback legado estão indisponíveis. Nenhuma edição foi habilitada.');
        renderCatalogSummary();
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="kc-cadu-empty">Mapa indisponível. Tente novamente após verificar o cadu-api.</td></tr>';
        $('#badge-sites').textContent = '!';
        computeKpis();
        return 'error';
      }
    }
    $('#badge-sites').textContent = state.sourceCatalog ? String(state.sourceCatalog.sources.length) : String(state.allSites.length);
    applySitesFilter();
    computeKpis();
    return state.catalogMode;
  }

  function profilesMatchFilter(profiles, filter) {
    if (!filter) return true;
    var values = profiles || [];
    if (filter === 'missing') return !values.length || values.every(function (profile) { return profile.statusGroup === 'missing'; });
    if (filter === 'confirmed') return values.some(function (profile) { return profile.status === 'confirmed'; });
    if (filter === 'pending_verification') return values.some(function (profile) { return profile.statusGroup === 'pending'; });
    return values.some(function (profile) { return profile.status === filter || profile.statusGroup === filter; });
  }

  function updateSitesFilterControls() {
    var sourceView = state.sitesView === 'sources';
    var tier = $('#sites-tier');
    var instagram = $('#sites-ig');
    var origin = $('#sites-origin');
    var pdf = $('#sites-export-pdf');
    if (tier) tier.disabled = state.catalogMode === 'registry' ? !sourceView : false;
    if (instagram) instagram.disabled = state.catalogMode === 'registry' && state.sitesView === 'deferred';
    if (origin) origin.disabled = state.catalogMode !== 'registry' || !sourceView;
    if (pdf) {
      pdf.disabled = state.catalogMode === 'registry' && !sourceView;
      pdf.title = pdf.disabled ? 'PDF disponível na visão Fontes web' : 'Exportar mapa de sites em PDF';
    }
  }

  function applySitesFilter() {
    var f = state.sitesFilter;
    updateSitesFilterControls();
    if (state.catalogMode === 'registry' && state.sourceCatalog) {
      var filters = { view: state.sitesView, query: f.q || '' };
      if (state.sitesView === 'sources' && f.tier) filters.tier = f.tier;
      if (state.sitesView === 'instagram' && f.ig) {
        filters.status = f.ig === 'pending_verification' ? 'pending' : f.ig;
      }
      var rows = registryModel().filterCatalog(state.sourceCatalog, filters);
      if (state.sitesView === 'sources') {
        rows = rows.filter(function (source) {
          if (state.sitesOrigin === 'collision_evidence' && !source.collision) return false;
          if (state.sitesOrigin && state.sitesOrigin !== 'collision_evidence' && source.overrideOrigin !== state.sitesOrigin) return false;
          return profilesMatchFilter(source.instagramProfiles, f.ig);
        });
        state.filteredSites = rows.map(sourceAsLegacySite);
      } else if (state.sitesView === 'entities') {
        rows = rows.filter(function (entity) { return profilesMatchFilter(entity.instagramProfiles, f.ig); });
        state.filteredSites = [];
      } else {
        state.filteredSites = [];
      }
      state.filteredCatalogRows = rows;
    } else {
      var q = (f.q || '').toLowerCase().trim();
      state.filteredSites = state.allSites.filter(function (site) {
        if (f.tier && String(site.tier || '') !== f.tier) return false;
        if (f.ig && String(site.instagram_status || '') !== f.ig) return false;
        if (!q) return true;
        var hay = ((site.name || '') + ' ' + (site.url || '') + ' ' + (site.instagram || '') + ' ' + (site.note || '')).toLowerCase();
        return hay.indexOf(q) !== -1;
      });
      state.filteredCatalogRows = [];
    }
    renderSitesTable();
  }

  function setSitesTableHeaders(headers) {
    var head = $('#sites-thead');
    if (!head) return;
    head.innerHTML = '<tr>' + headers.map(function (header) { return '<th>' + escapeHtml(header) + '</th>'; }).join('') + '</tr>';
  }

  function badgeHtml(label, kind) {
    var safeKind = String(kind || label || 'unknown').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    return '<span class="kc-cadu-badge kc-cadu-badge--' + safeKind + '">' + escapeHtml(label) + '</span>';
  }

  function entityChips(entities) {
    if (!entities || !entities.length) return '<span class="kc-cadu-muted">sem entidade</span>';
    return '<div class="kc-cadu-map-list">' + entities.map(function (entity) {
      return '<span class="kc-cadu-map-chip" title="' + escapeHtml(entity.name) + '">' + escapeHtml(entity.acronym || entity.name) + '</span>';
    }).join('') + '</div>';
  }

  function profileLinks(profiles) {
    if (!profiles || !profiles.length) return '<span class="kc-cadu-muted">sem perfil associado</span>';
    return profiles.map(function (profile) {
      var provenance = profile.viaSourceObservation
        ? 'associação direta observada nesta fonte'
        : 'associação indireta via entidade' + (profile.viaEntityIds && profile.viaEntityIds.length ? ': ' + profile.viaEntityIds.join(', ') : '');
      if (profile.shared) provenance += ' · perfil compartilhado';
      return '<div><a href="' + escapeHtml(profile.profileUrl) + '" target="_blank" rel="noopener" class="kc-cadu-ig-link">@' + escapeHtml(String(profile.handle).replace(/^@/, '')) + '</a> ' + badgeHtml(profile.status, profile.statusGroup)
        + '<small class="kc-cadu-source-id">' + escapeHtml(provenance) + '</small></div>';
    }).join('');
  }

  function ensureSourceDraft(source) {
    var existing = state.sourceDrafts[source.id];
    if (existing) return existing;
    var stable = source.overrideOrigin === 'stable' && source.overrideUnitId === source.id;
    var initialNote = stable && source.note != null ? String(source.note) : null;
    var draft = {
      tier: stable ? source.overrideTier : null,
      tierTouched: false,
      note: initialNote == null ? '' : initialNote,
      noteTouched: false,
      initialTier: stable ? source.overrideTier : null,
      initialNote: initialNote,
      initialRevision: source.revision,
      conflict: false,
      conflictAcknowledged: false,
      conflictFields: null
    };
    state.sourceDrafts[source.id] = draft;
    return draft;
  }

  function tierOptionsHtml(draft, firstStable) {
    var html = '';
    var hasTierChoice = !firstStable || draft.tierTouched;
    if (firstStable && !draft.tierTouched) html += '<option value="__unset__" selected>Escolha explicitamente…</option>';
    html += '<option value=""' + (hasTierChoice && draft.tier === null ? ' selected' : '') + '>Herdar tier base (sem override)</option>';
    [1, 2, 3].forEach(function (tier) {
      html += '<option value="' + tier + '"' + (hasTierChoice && draft.tier === tier ? ' selected' : '') + '>Tier ' + tier + '</option>';
    });
    return html;
  }

  function normalizedDraftNote(note) {
    return String(note == null ? '' : note).trim() === '' ? null : String(note);
  }

  function sourceDraftIsDirtyWithoutSource(draft) {
    if (!draft) return false;
    return Boolean(
      draft.tierTouched || draft.tier !== draft.initialTier ||
      draft.noteTouched ||
      normalizedDraftNote(draft.note) !== draft.initialNote
    );
  }

  function sourceDraftChanges(source, draft) {
    var stable = source.overrideOrigin === 'stable' && source.overrideUnitId === source.id;
    if (!stable) {
      if (!draft.tierTouched) return {};
      return { tier: draft.tier, note: normalizedDraftNote(draft.note) };
    }
    var changes = {};
    var conflictFields = draft.conflict ? normalizedConflictFields(draft.conflictFields) : null;
    if ((conflictFields && conflictFields.indexOf('tier') !== -1) || (!conflictFields && draft.tier !== draft.initialTier)) changes.tier = draft.tier;
    var nextNote = normalizedDraftNote(draft.note);
    if ((conflictFields && conflictFields.indexOf('note') !== -1) || (!conflictFields && nextNote !== draft.initialNote)) changes.note = nextNote;
    return changes;
  }

  function updateConflictFieldIntent(draft, field, differsFromServer) {
    if (!draft.conflict) return;
    var fields = normalizedConflictFields(draft.conflictFields);
    var index = fields.indexOf(field);
    if (differsFromServer && index === -1) fields.push(field);
    if (!differsFromServer && index !== -1) fields.splice(index, 1);
    draft.conflictFields = normalizedConflictFields(fields);
    draft.conflictAcknowledged = false;
  }

  function sourceDraftCanSave(source, draft) {
    return Object.keys(sourceDraftChanges(source, draft)).length > 0;
  }

  function sourceDraftIsDirty(source, draft) {
    var stable = source.overrideOrigin === 'stable' && source.overrideUnitId === source.id;
    if (stable) return sourceDraftCanSave(source, draft);
    return draft.tierTouched || draft.noteTouched || normalizedDraftNote(draft.note) !== null;
  }

  function updateSourceSaveButton(source, draft) {
    var row = document.querySelector('tr[data-source-id="' + source.id + '"]');
    var button = row && row.querySelector('.kc-cadu-save-source-btn');
    if (button) button.disabled = !state.registryWritable || Boolean(state.sourceSaveChains[source.id]) || !sourceDraftCanSave(source, draft);
  }

  function sourceConflictHtml(source, draft) {
    if (!draft.conflict) return '';
    var fields = Object.keys(sourceDraftChanges(source, draft));
    var serverTier = source.overrideTier == null ? 'herdar base' : 'Tier ' + source.overrideTier;
    var draftTier = draft.tier == null ? 'herdar base' : 'Tier ' + draft.tier;
    var serverNote = source.note == null ? 'sem nota' : source.note;
    var draftNote = normalizedDraftNote(draft.note) == null ? 'sem nota' : draft.note;
    return '<div class="kc-cadu-conflict-warning">'
      + '<strong>O servidor mudou desde o início da edição.</strong><br>'
      + 'Atual: ' + escapeHtml(serverTier) + ' · ' + escapeHtml(serverNote) + ' · ETag ' + escapeHtml(source.revision.slice(0, 12)) + '…<br>'
      + 'Rascunho: ' + escapeHtml(draftTier) + ' · ' + escapeHtml(draftNote) + '<br>'
      + 'Campos propostos: ' + escapeHtml(fields.join(', ') || 'nenhum') + '. Compare novamente antes de confirmar.'
      + '</div>';
  }

  function renderSourceRows(rows) {
    setSitesTableHeaders(['Tier', 'Entidade / fonte', 'Site institucional', 'Instagram associado', 'Revisão', 'Override / observação', 'Ações']);
    return rows.map(function (source) {
      var site = sourceAsLegacySite(source);
      var stable = source.overrideOrigin === 'stable' && source.overrideUnitId === source.id;
      var draft = ensureSourceDraft(source);
      var saving = Boolean(state.sourceSaveChains[source.id]);
      var readOnly = !state.registryWritable;
      var busy = readOnly || saving;
      var canSave = sourceDraftCanSave(source, draft);
      var inherited = !stable && source.note
        ? '<div class="kc-cadu-inherited-warning"><strong>Nota herdada (não será copiada):</strong> ' + escapeHtml(source.note) + '</div>'
        : '';
      var conflict = sourceConflictHtml(source, draft);
      var review = badgeHtml(source.reviewState, source.reviewState)
        + '<span class="kc-cadu-source-id">ETag ' + escapeHtml(source.revision.slice(0, 12)) + '…</span>'
        + (source.collision ? '<div class="kc-cadu-review-issues"><strong>Colisão legada:</strong> o override estável prevalece, mas as linhas concorrentes continuam em Pendências.</div>' : '')
        + (source.reviewIssues.length ? '<div class="kc-cadu-review-issues">' + source.reviewIssues.map(escapeHtml).join('<br>') + '</div>' : '');
      var actions = '<button type="button" class="kc-cadu-publish-btn" disabled title="Publicação bloqueada: esta fonte pertence ao catálogo shadow desativado"><i class="fas fa-lock"></i><span>Shadow</span></button>'
        + ' <button type="button" class="kc-cadu-ask-btn" data-ask-kind="site" data-ask-name="' + escapeHtml(site.name) + '" data-ask-url="' + escapeHtml(site.url) + '" data-ask-instagram="' + escapeHtml(site.instagramContext || 'sem perfil associado') + '" data-ask-tier="' + escapeHtml(site.tier || '') + '" title="Enviar todas as associações e seus status ao chat Cadu"><i class="fas fa-robot"></i><span>Perguntar</span></button>';
      return '<tr data-source-id="' + escapeHtml(source.id) + '">'
        + '<td><strong>T' + escapeHtml(source.effectiveTier == null ? '—' : source.effectiveTier) + '</strong><small class="kc-cadu-source-id">base ' + escapeHtml(source.baseTier == null ? '—' : source.baseTier) + ' · ' + escapeHtml(source.overrideOrigin) + '</small></td>'
        + '<td>' + entityChips(source.entities) + '<code class="kc-cadu-source-id">' + escapeHtml(source.id) + '</code></td>'
        + '<td><a href="' + escapeHtml(source.canonicalUrl) + '" target="_blank" rel="noopener" class="kc-cadu-url-link">' + escapeHtml(source.canonicalUrl.replace(/^https?:\/\//, '')) + '</a><small class="kc-cadu-source-id">' + escapeHtml(source.sourceKind) + ' · shadow</small></td>'
        + '<td>' + profileLinks(source.instagramProfiles) + '</td>'
        + '<td>' + review + '</td>'
        + '<td><div class="kc-cadu-note-cell">' + inherited + conflict
        + '<select class="kc-cadu-source-tier-select" data-source-id="' + escapeHtml(source.id) + '" aria-label="Tier estável de ' + escapeHtml(source.id) + '"' + (busy ? ' disabled' : '') + '>' + tierOptionsHtml(draft, !stable) + '</select>'
        + '<textarea class="kc-cadu-source-note-input" data-source-id="' + escapeHtml(source.id) + '" maxlength="500" rows="2" placeholder="Nota estável explícita; vazio remove a nota"' + (busy ? ' disabled' : '') + '>' + escapeHtml(draft.note) + '</textarea>'
        + '<button type="button" class="kc-cadu-save-source-btn" data-source-id="' + escapeHtml(source.id) + '"' + (busy || !canSave ? ' disabled' : '') + '>' + (saving ? 'Salvando…' : (readOnly ? 'Somente leitura' : (stable ? 'Salvar override' : 'Criar override estável'))) + '</button></div></td>'
        + '<td style="white-space:nowrap;">' + actions + '</td></tr>';
    }).join('');
  }

  function renderEntityRows(rows) {
    setSitesTableHeaders(['Entidade UFG', 'Tipo / campus', 'Sites associados', 'Instagram', 'Cobertura']);
    return rows.map(function (entity) {
      var sites = entity.sources.length ? entity.sources.map(function (source) {
        return '<a href="' + escapeHtml(source.canonicalUrl) + '" target="_blank" rel="noopener">' + escapeHtml(source.id) + '</a>';
      }).join('<br>') : '<span class="kc-cadu-muted">sem site associado</span>';
      var entityLabel = entity.acronym ? entity.acronym + ' — ' + entity.name : entity.name;
      return '<tr><td><strong>' + escapeHtml(entityLabel) + '</strong><code class="kc-cadu-source-id">' + escapeHtml(entity.id) + '</code></td>'
        + '<td>' + escapeHtml(entity.kind) + '<small class="kc-cadu-source-id">' + escapeHtml(entity.campus || 'campus não informado') + '</small></td>'
        + '<td>' + sites + '</td><td>' + profileLinks(entity.instagramProfiles) + '</td>'
        + '<td>' + badgeHtml(entity.status, entity.status) + (entity.sources.length ? '' : '<div class="kc-cadu-review-issues">lacuna de fonte web</div>') + '</td></tr>';
    }).join('');
  }

  function renderInstagramRows(rows) {
    setSitesTableHeaders(['Perfil Instagram', 'Entidades', 'Sites associados', 'Status', 'Execução']);
    return rows.map(function (profile) {
      var sources = profile.sources.length ? profile.sources.map(function (source) {
        return '<a href="' + escapeHtml(source.canonicalUrl) + '" target="_blank" rel="noopener">' + escapeHtml(source.id) + '</a>';
      }).join('<br>') : '<span class="kc-cadu-muted">sem fonte web associada</span>';
      return '<tr><td><a href="' + escapeHtml(profile.profileUrl) + '" target="_blank" rel="noopener" class="kc-cadu-ig-link">@' + escapeHtml(String(profile.handle).replace(/^@/, '')) + '</a><code class="kc-cadu-source-id">' + escapeHtml(profile.id) + '</code></td>'
        + '<td>' + entityChips(profile.entities) + '</td><td>' + sources + '</td>'
        + '<td>' + badgeHtml(profile.status, profile.statusGroup) + '</td>'
        + '<td>' + badgeHtml(profile.enabled ? 'ativo' : 'shadow desativado', profile.enabled ? 'confirmed' : 'missing') + '<small class="kc-cadu-source-id">' + escapeHtml((profile.executionModes || []).join(', ') || 'sem modo') + '</small></td></tr>';
    }).join('');
  }

  function renderDeferredRows(rows) {
    setSitesTableHeaders(['Pendência', 'Identidades legadas', 'Fontes candidatas', 'Entidades', 'Metadata / evidência']);
    return rows.map(function (item) {
      var sourceId = item.sourceId || '';
      var sourceIds = item.sourceIds || (sourceId ? [sourceId] : []);
      var entityIds = item.entityIds || [];
      var rowKeys = item.rowKeys || (item.rowKey ? [item.rowKey] : []);
      var unitIds = item.unitIds || (item.unitId ? [item.unitId] : []);
      var matchTypes = item.matchTypes || (item.matchType ? [item.matchType] : []);
      var legacyRows = item.rows || (item.row ? [item.row] : []);
      var metadata = legacyRows.map(function (row, index) {
        var tier = row && row.tier != null ? 'T' + row.tier : 'tier —';
        var revision = row && row.revision != null ? 'rev ' + row.revision : 'rev —';
        var note = row && row.note ? ' · ' + row.note : '';
        return '<div><strong>' + escapeHtml(unitIds[index] || (row && row.unit_id) || '—') + ':</strong> ' + escapeHtml(tier + ' · ' + revision + note) + '</div>';
      }).join('');
      return '<tr><td>' + badgeHtml(item.deferredKind, item.deferredKind) + '</td>'
        + '<td>' + (unitIds.length ? unitIds.map(function (id, index) { return '<div><code>' + escapeHtml(id) + '</code><small class="kc-cadu-source-id">' + escapeHtml(matchTypes[index] || 'sem matchType') + '</small></div>'; }).join('') : '—') + '</td>'
        + '<td>' + (sourceIds.length ? sourceIds.map(function (id) { return '<code class="kc-cadu-source-id">' + escapeHtml(id) + '</code>'; }).join('') : '—') + '</td>'
        + '<td>' + (entityIds.length ? entityIds.map(function (id) { return '<span class="kc-cadu-map-chip">' + escapeHtml(id) + '</span>'; }).join(' ') : '—') + '</td>'
        + '<td>' + (metadata || '<span class="kc-cadu-muted">sem metadata legada</span>') + rowKeys.map(function (key) { return '<code class="kc-cadu-source-id">hash ' + escapeHtml(String(key).slice(0, 16)) + '…</code>'; }).join('') + '</td></tr>';
    }).join('');
  }

  function renderLegacyRows(rows) {
    setSitesTableHeaders(['Tier', 'Unidade legada', 'Site institucional', 'Instagram', 'Status', 'Observação', 'Ações']);
    return rows.map(function (site) {
      var key = siteActionKey(site);
      var safeUrl = normalizeSiteUrl(site.url);
      var instagramUrl = normalizeInstagramUrl(site.instagram);
      return '<tr><td>' + escapeHtml(site.tier ? 'T' + site.tier : '—') + '</td><td><code>' + escapeHtml(site.name || '—') + '</code></td>'
        + '<td>' + (safeUrl ? '<a href="' + escapeHtml(safeUrl) + '" target="_blank" rel="noopener">' + escapeHtml(safeUrl.replace(/^https?:\/\//, '')) + '</a>' : '—') + '</td>'
        + '<td>' + (instagramUrl ? '<a href="' + escapeHtml(instagramUrl) + '" target="_blank" rel="noopener">@' + escapeHtml(String(site.instagram).replace(/^@/, '')) + '</a>' : '—') + '</td>'
        + '<td>' + badgeHtml(site.instagram_status || 'unknown', site.instagram_status || 'unknown') + '</td><td>' + escapeHtml(site.note || '—') + '<small class="kc-cadu-source-id">somente leitura</small></td>'
        + '<td><button type="button" class="kc-cadu-publish-btn" disabled title="Publicação bloqueada: fallback legado em modo somente leitura"><i class="fas fa-lock"></i><span>Somente leitura</span></button> '
        + '<button type="button" class="kc-cadu-ask-btn" data-ask-kind="site" data-ask-name="' + escapeHtml(site.name || '') + '" data-ask-url="' + escapeHtml(safeUrl) + '" data-ask-instagram="' + escapeHtml(site.instagram || '') + '" data-ask-tier="' + escapeHtml(site.tier || '') + '"><i class="fas fa-robot"></i><span>Perguntar</span></button></td></tr>';
    }).join('');
  }

  function renderSitesTable() {
    var tbody = $('#sites-tbody');
    if (!tbody) return;
    var table = $('#sites-table');
    if (table) table.setAttribute('data-view', state.catalogMode === 'registry' ? state.sitesView : 'legacy');
    var rows;
    var html;
    if (state.catalogMode === 'registry') {
      rows = state.filteredCatalogRows;
      if (state.sitesView === 'entities') html = renderEntityRows(rows);
      else if (state.sitesView === 'instagram') html = renderInstagramRows(rows);
      else if (state.sitesView === 'deferred') html = renderDeferredRows(rows);
      else html = renderSourceRows(rows);
    } else {
      rows = state.filteredSites;
      html = renderLegacyRows(rows);
    }
    tbody.innerHTML = html || '<tr><td colspan="7" class="kc-cadu-empty">Nenhum item corresponde aos filtros atuais.</td></tr>';
  }

  function sourceById(sourceId) {
    if (!state.sourceCatalog) return null;
    return state.sourceCatalog.sources.find(function (source) { return source.id === sourceId; }) || null;
  }

  function patchResponseIsValid(envelope, sourceId) {
    var data = envelope && envelope.data;
    var etag = envelope && envelope.headers && envelope.headers.etag;
    return Boolean(
      data && typeof data === 'object' && data.id === sourceId &&
      typeof etag === 'string' && /^"[0-9a-f]{64}"$/.test(etag) &&
      data.etag === etag && state.sourceCatalog &&
      envelope.headers.registrySha256 === state.sourceCatalog.registrySha256
    );
  }

  function revalidatedSourceMatches(source, changes, expectedEtag) {
    if (!source || source.overrideOrigin !== 'stable' || source.overrideUnitId !== source.id) return false;
    if (source.etag !== expectedEtag || source.revision !== expectedEtag.slice(1, -1)) return false;
    if (Object.prototype.hasOwnProperty.call(changes, 'tier') && source.overrideTier !== changes.tier) return false;
    if (Object.prototype.hasOwnProperty.call(changes, 'note') && source.note !== changes.note) return false;
    return true;
  }

  async function performSourceOverrideSave(sourceId, queuedEdit) {
    var source = sourceById(sourceId);
    var draft = queuedEdit && queuedEdit.draft;
    if (!source || !draft || state.catalogMode !== 'registry' || !state.registryWritable) return;
    if (source.revision !== queuedEdit.baseRevision) {
      var currentDraft = state.sourceDrafts[sourceId];
      if (currentDraft) {
        currentDraft.conflict = true;
        currentDraft.conflictAcknowledged = false;
      }
      renderSitesTable();
      showCaduError('A fonte ' + sourceId + ' mudou enquanto a edição aguardava na fila. Revise o ETag atual; nenhuma escrita foi enviada.');
      return;
    }
    var stable = source.overrideOrigin === 'stable' && source.overrideUnitId === source.id;
    if (!stable && !draft.tierTouched) {
      showCaduError('Escolha explicitamente o tier do primeiro override estável.');
      return;
    }
    var changes = sourceDraftChanges(source, draft);
    if (!Object.keys(changes).length) {
      showCaduError('Nenhuma alteração efetiva foi detectada para ' + sourceId + '.');
      return;
    }
    if (draft.conflict && !draft.conflictAcknowledged) {
      if (!window.confirm('O ETag de ' + sourceId + ' mudou desde o início desta edição. Você revisou a versão atual e deseja aplicar somente os campos alterados?')) return;
      draft.conflictAcknowledged = true;
    }
    var mutation;
    try {
      mutation = registryModel().buildOverrideMutation(source, changes);
    } catch (contractError) {
      showCaduError('Override inválido: revise tier e nota antes de salvar.');
      return;
    }
    if (mutation.isFirstStable) {
      var inheritedWarning = source.isInheritedLegacy ? ' O valor legado exibido não será copiado automaticamente.' : '';
      if (!window.confirm('Criar override estável para ' + source.id + '? Tier: ' + (changes.tier == null ? 'herdar base' : changes.tier) + '; nota: ' + (changes.note == null ? 'vazia' : 'informada') + '.' + inheritedWarning)) return;
    }
    renderSitesTable();
    var envelope = await apiFetchResponse('/api/cadu/sites/' + mutation.path, {
      method: mutation.method,
      headers: mutation.headers,
      body: JSON.stringify(mutation.body)
    });
    if (envelope.status === 412 || envelope.status === 409) {
      await loadSites({ conflictSourceId: sourceId, conflictFields: Object.keys(changes) });
      showCaduError('Conflito de versão em ' + sourceId + '. O catálogo foi recarregado; compare os valores e decida manualmente antes de salvar novamente.');
      return;
    }
    if (!envelope.ok) {
      showCaduError('Não foi possível salvar ' + sourceId + ' (HTTP ' + String(envelope.status || 0) + '). Nenhuma repetição automática foi feita.');
      return;
    }
    if (!patchResponseIsValid(envelope, sourceId)) {
      await loadSites({ conflictSourceId: sourceId, conflictFields: Object.keys(changes) });
      showCaduError('A escrita respondeu com contrato inesperado. O catálogo foi recarregado e a operação não será repetida automaticamente.');
      return;
    }
    var expectedEtag = envelope.headers.etag;
    var revalidatedMode = await loadSites();
    if (revalidatedMode !== 'registry') {
      showCaduError('A API confirmou a escrita de ' + sourceId + ', mas o catálogo canônico não pôde ser revalidado. O estado final não foi confirmado; nenhuma repetição automática será feita.');
      return;
    }
    var revalidatedSource = sourceById(sourceId);
    if (!revalidatedSourceMatches(revalidatedSource, changes, expectedEtag)) {
      showCaduError('A API respondeu à escrita de ' + sourceId + ', mas a releitura não confirmou o mesmo ETag e os mesmos campos. Revise o conflito; nenhuma repetição automática será feita.');
      return;
    }
    delete state.sourceDrafts[sourceId];
    renderSitesTable();
    showCaduError('Override de ' + sourceId + ' salvo com ETag/CAS e catálogo revalidado.');
    setTimeout(hideCaduError, 5000);
  }

  function saveSourceOverride(sourceId) {
    if (!state.registryWritable || state.sourceSaveChains[sourceId]) return;
    var source = sourceById(sourceId);
    var draft = source && state.sourceDrafts[sourceId];
    if (!source || !draft || !sourceDraftCanSave(source, draft)) return;
    var queuedEdit = { baseRevision: source.revision, draft: Object.assign({}, draft) };
    var previous = state.sourceMutationQueue || Promise.resolve();
    var task = previous.catch(function () {}).then(function () {
      return performSourceOverrideSave(sourceId, queuedEdit);
    }).catch(function () {
      showCaduError('Falha de rede ao salvar ' + sourceId + '. A operação não será repetida automaticamente.');
    }).finally(function () {
      delete state.sourceSaveChains[sourceId];
      if (state.catalogMode === 'registry') renderSitesTable();
    });
    state.sourceSaveChains[sourceId] = task;
    state.sourceMutationQueue = task.catch(function () {});
    renderSitesTable();
  }

  function computeKpis() {
    if (state.sourceCatalog) {
      var summary = state.sourceCatalog.summary;
      $('#kpi-sites').textContent = String(summary.entities);
      $('#kpi-ig-confirmed').textContent = String(summary.instagramConfirmed);
      $('#kpi-ig-detail').textContent = summary.instagramConfirmed + ' confirmados · '
        + summary.instagramPending + ' pendentes · ' + summary.instagramMissing + ' indisponíveis · '
        + summary.instagramRetired + ' aposentados';
      $('#kpi-tier1').textContent = String(state.sourceCatalog.sources.filter(function (source) { return source.effectiveTier === 1; }).length);
      return;
    }
    var sites = state.allSites;
    $('#kpi-sites').textContent = String(sites.length);
    var igConfirmed = sites.filter(function (site) { return site.instagram_status === 'confirmed'; }).length;
    var igAttempted = sites.filter(function (site) { return site.instagram_status === 'tentative' || site.instagram_status === 'confirmed'; }).length;
    $('#kpi-ig-confirmed').textContent = String(igConfirmed);
    $('#kpi-ig-detail').textContent = igAttempted + ' com perfil atribuído no mapa legado';
    $('#kpi-tier1').textContent = String(sites.filter(function (site) { return String(site.tier) === '1'; }).length);
  }

  function buildSitesCsvRows() {
    if (!state.sourceCatalog || state.catalogMode !== 'registry') {
      var legacyRows = [['name','tier','category','url','instagram','instagram_status','note']];
      state.filteredSites.forEach(function (site) {
        legacyRows.push([site.name, site.tier || '', site.category || '', site.url || '', site.instagram || '', site.instagram_status || '', site.note || '']);
      });
      return legacyRows;
    }
    var rows = state.filteredCatalogRows;
    if (state.sitesView === 'entities') {
      return [['entity_id','name','acronym','kind','campus','status','source_ids','instagram_ids']].concat(rows.map(function (entity) {
        return [entity.id, entity.name, entity.acronym || '', entity.kind, entity.campus || '', entity.status, entity.sourceIds.join(' '), entity.instagramProfileIds.join(' ')];
      }));
    }
    if (state.sitesView === 'instagram') {
      return [['instagram_id','handle','profile_url','status','status_group','entity_ids','source_ids','enabled']].concat(rows.map(function (profile) {
        return [profile.id, profile.handle, profile.profileUrl, profile.status, profile.statusGroup, profile.entityIds.join(' '), profile.sourceIds.join(' '), profile.enabled];
      }));
    }
    if (state.sitesView === 'deferred') {
      return [['kind','unit_ids','match_types','source_id','candidate_source_ids','entity_ids','legacy_rows_json','row_keys']].concat(rows.map(function (item) {
        return [item.deferredKind, (item.unitIds || (item.unitId ? [item.unitId] : [])).join(' '), (item.matchTypes || (item.matchType ? [item.matchType] : [])).join(' '), item.sourceId || '', (item.sourceIds || []).join(' '), (item.entityIds || []).join(' '), JSON.stringify(item.rows || (item.row ? [item.row] : [])), (item.rowKeys || (item.rowKey ? [item.rowKey] : [])).join(' ')];
      }));
    }
    return [['source_id','entities','effective_tier','base_tier','override_tier','override_origin','canonical_url','instagram_handles','instagram_statuses','review_state','review_issues','note','revision']].concat(rows.map(function (source) {
      return [source.id, source.entityIds.join(' '), source.effectiveTier == null ? '' : source.effectiveTier, source.baseTier == null ? '' : source.baseTier, source.overrideTier == null ? '' : source.overrideTier, source.overrideOrigin, source.canonicalUrl, source.instagramProfiles.map(function (profile) { return profile.handle; }).join(' '), source.instagramProfiles.map(function (profile) { return profile.status; }).join(' '), source.reviewState, source.reviewIssues.join(' | '), source.note || '', source.revision];
    }));
  }

  // ============================================================
  // Publish (sugerir um site pra aparecer no feed KinoCampus)
  // ============================================================

  async function publishSite(site) {
    if (state.catalogMode !== 'legacy-writable' || (site && (site.sourceId || site.source_id))) {
      showCaduError('Publicação bloqueada: o catálogo canônico está em shadow ou o fallback legado está em modo somente leitura.');
      return;
    }
    var key = siteActionKey(site);
    if (state.publishingKey === key) return;
    var publishUrl = getSitePublishUrl(site);
    if (!publishUrl) {
      showCaduError('Não foi possível sugerir "' + site.name + '": informe uma URL HTTPS ou Instagram na fonte.');
      setTimeout(hideCaduError, 6000);
      return;
    }
    state.publishingKey = key;
    var btn = document.querySelector('.kc-cadu-publish-btn[data-key="' + cssEscape(key) + '"]');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }
    try {
      var data = await apiFetch('/api/cadu/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ name: site.name, url: publishUrl, instagram: site.instagram, note: site.note, tier: site.tier, category: site.category, source: 'cadu-admin' })
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
      showCaduError(msg + (via ? ' — via: ' + via.replace(/[()]/g, '') : ''));
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

  function loadFeedPage(page) {
    state.feedPage = Math.max(0, page || 0);
    return loadFeed(false);
  }

  function loadFeedMore() {
    if (!state.feedHasMore) return Promise.resolve();
    var limit = state.feedLimit || FEED_PAGE_SIZE;
    var loadedPages = Math.max(1, Math.ceil(state.allFeedItems.length / limit));
    return loadFeed(false, state.feedPage + loadedPages);
  }

  function feedTimestampMs(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number' || /^\d+(?:\.\d+)?$/.test(String(value))) {
      var numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) return null;
      return numeric < 1e12 ? numeric * 1000 : numeric;
    }
    var parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function newestFeedTimestamp(items) {
    return (items || []).reduce(function (latest, item) {
      var timestamp = feedTimestampMs(item && (item.created_at || item.updated_at || item.indexed_at));
      return timestamp && (!latest || timestamp > latest) ? timestamp : latest;
    }, null);
  }

  function renderFeedFreshness(error) {
    var box = $('#feed-freshness-status');
    if (!box) return;
    box.classList.remove('is-fresh', 'is-stale', 'is-error');
    var copy = '';
    if (error) {
      box.classList.add('is-error');
      copy = '<strong>Não foi possível conferir a sincronização.</strong> A consulta ao índice falhou; nenhuma coleta foi iniciada.';
    } else if (!state.feedLatestAt) {
      box.classList.add('is-stale');
      copy = '<strong>Índice sem data recente.</strong> Recarregar apenas consulta o cadu-api; para coletar novos dados, abra a pipeline.';
    } else {
      var ageMs = Math.max(0, Date.now() - state.feedLatestAt);
      var stale = ageMs > FEED_STALE_AFTER_MS;
      box.classList.add(stale ? 'is-stale' : 'is-fresh');
      copy = '<strong>' + (stale ? 'Feed possivelmente desatualizado.' : 'Feed atualizado recentemente.') + '</strong> ' +
        'Chunk mais recente: ' + escapeHtml(new Date(state.feedLatestAt).toLocaleString('pt-BR')) +
        ' (' + escapeHtml(fmtAgeMs(ageMs)) + '). Recarregar consulta o índice; a coleta é executada pela pipeline.';
    }
    var button = '<button type="button" id="feed-open-pipeline-btn" class="kc-btn-secondary"><i class="fas fa-gears"></i> Abrir pipeline</button>';
    box.innerHTML = '<span><i class="fas fa-clock"></i> ' + copy + '</span>' + button;
    var openPipeline = $('#feed-open-pipeline-btn');
    if (openPipeline) openPipeline.addEventListener('click', function () { switchTab('pipeline'); });
  }

  async function loadFeed(initial, appendPage) {
    var list = $('#feed-list');
    if (initial) {
      state.feedPage = 0;
      if (list) list.innerHTML = '<div class="kc-cadu-empty">Carregando…</div>';
      state.allFeedItems = [];
    }
    var limit = state.feedLimit || FEED_PAGE_SIZE;
    var shouldAppend = typeof appendPage === 'number';
    var requestPage = shouldAppend ? appendPage : state.feedPage;
    var offset = requestPage * limit;
    try {
      var data = await apiFetch('/api/cadu/feed?limit=' + limit + '&offset=' + offset + '&with_meta=true', {
        cache: 'no-store',
        timeoutMs: OPENCLAW_REQUEST_TIMEOUT_MS
      });
      if (data && data.__error) throw new Error((data.data && data.data.message) || (data.data && data.data.error) || 'status ' + data.status);
      var items = Array.isArray(data) ? data : (data.items || data.body || []);
      state.allFeedItems = shouldAppend ? state.allFeedItems.concat(items) : items;
      state.feedLatestAt = newestFeedTimestamp(state.allFeedItems);
      state.feedTotal = Array.isArray(data) ? Math.max(offset + items.length, state.allFeedItems.length) : (data.total || state.allFeedItems.length);
      state.feedHasMore = Array.isArray(data) ? items.length >= limit : !!data.has_more;
      $('#badge-feed').textContent = state.feedTotal ? String(state.feedTotal) : String(items.length);
      $('#kpi-memory').textContent = state.feedTotal ? String(state.feedTotal) : String(items.length);
      $('#kpi-memory-detail').textContent = 'memória indexada do Cadu; página ' + (state.feedPage + 1);
      renderFeedFreshness(null);
      applyFeedFilter();
    } catch (err) {
      if (list) list.innerHTML = '<div class="kc-cadu-empty">Erro ao carregar feed: ' + escapeHtml(err.message || err) + '</div>';
      $('#badge-feed').textContent = '!';
      renderFeedFreshness(err);
      updateFeedPager(0);
    }
  }

  function applyFeedFilter() {
    var q = (state.feedFilter.q || '').toLowerCase().trim();
    var items = q
      ? state.allFeedItems.filter(function (it) {
          var hay = ((it.snippet || '') + ' ' + (it.heading || '') + ' ' + (it.chunk_id || '') + ' ' + (it.file_path || '')).toLowerCase();
          return hay.indexOf(q) !== -1;
        })
      : state.allFeedItems;

    if (!items.length) {
      $('#feed-list').innerHTML = '<div class="kc-cadu-empty">Nenhum item corresponde ao filtro nesta página.</div>';
      updateFeedPager(0);
      return;
    }

    $('#feed-list').innerHTML = items.map(function (it) {
      var heading = it.heading ? escapeHtml(it.heading) : '<span style="color:var(--kc-text-dark-secondary);">sem título</span>';
      var dt = fmtDate(it.created_at);
      var hash = it.chunk_id ? it.chunk_id.slice(0, 16) : 'sem id';
      var snippet = it.snippet || '(sem conteúdo)';
      var askBtn = '<button type="button" class="kc-cadu-ask-btn" data-ask-kind="feed" data-ask-id="' + escapeHtml(it.chunk_id) + '" data-ask-heading="' + escapeHtml((it.heading || '').replace(/"/g, '&quot;')) + '" data-ask-snippet="' + escapeHtml(String(snippet).slice(0, 900)) + '" title="Enviar esse chunk para o chat Cadu na aba OpenClaw"><i class="fas fa-robot"></i> Perguntar Cadu</button>';
      return '<article class="kc-cadu-feed-item">'
        + '<div class="kc-cadu-feed-item__head">'
        + '<i class="fas fa-hashtag"></i><code>' + escapeHtml(hash) + '</code>'
        + '<span>-</span><span>' + heading + '</span>'
        + '<span>-</span><span><i class="far fa-clock"></i> ' + dt + '</span>'
        + '<span style="margin-left:auto;">' + askBtn + '</span>'
        + '</div>'
        + '<pre class="kc-cadu-feed-item__snippet">' + escapeHtml(snippet) + '</pre>'
        + '</article>';
    }).join('');
    updateFeedPager(items.length);
  }

  function updateFeedPager(filteredCount) {
    var status = $('#feed-page-status');
    var prev = $('#feed-prev-page-btn');
    var next = $('#feed-next-page-btn');
    // pager bottom (espelha o topo)
    var statusB = $('#feed-page-status-bottom');
    var prevB = $('#feed-prev-page-btn-bottom');
    var nextB = $('#feed-next-page-btn-bottom');
    var moreB = $('#feed-load-more-btn-bottom');
    var limit = state.feedLimit || FEED_PAGE_SIZE;
    var start = state.feedTotal && state.allFeedItems.length ? (state.feedPage * limit + 1) : 0;
    var end = state.feedPage * limit + state.allFeedItems.length;
    var visible = filteredCount == null ? state.allFeedItems.length : filteredCount;
    var statusText = state.feedTotal
      ? ('Mostrando ' + start + '-' + end + ' de ' + state.feedTotal + ' chunks' + (visible !== state.allFeedItems.length ? ' (' + visible + ' após filtro)' : ''))
      : ('Mostrando ' + visible + ' chunks');
    if (status) status.textContent = statusText;
    if (statusB) statusB.textContent = statusText;
    var prevDisabled = state.feedPage <= 0;
    var nextDisabled = !state.feedHasMore;
    if (prev) prev.disabled = prevDisabled;
    if (prevB) prevB.disabled = prevDisabled;
    if (next) next.disabled = nextDisabled;
    if (nextB) nextB.disabled = nextDisabled;
    if (moreB) moreB.disabled = nextDisabled;
  }

  function countFrom(obj, key) {
    return obj && obj[key] ? obj[key] : 0;
  }

  function renderFeedDiagnostics(payload) {
    var summaryEl = $('#feed-diagnostics-summary');
    var listEl = $('#feed-diagnostics-list');
    if (!summaryEl || !listEl) return;
    var report = payload && payload.report ? payload.report : payload;
    var triage = report && report.sample && report.sample.caduTriage;
    if (!triage) {
      summaryEl.innerHTML = '<span class="kc-cadu-feed-diagnostics__chip">Diagnóstico indisponível</span>';
      listEl.innerHTML = '<div class="kc-cadu-feed-diagnostics__empty">Não foi possível montar a triagem do feed.</div>';
      return;
    }
    var byReason = triage.byReason || {};
    var queues = triage.queues || {};
    var suggestions = report && report.sample && report.sample.repairSuggestions && report.sample.repairSuggestions.suggestions || [];
    var suggestionById = {};
    suggestions.forEach(function (suggestion) {
      if (suggestion && suggestion.id) suggestionById[suggestion.id] = suggestion;
    });
    var missing = queues.missingDeadlines || [];
    var eventReview = queues.eventDateReview || [];
    var expired = queues.expired || [];
    summaryEl.innerHTML = [
      '<span class="kc-cadu-feed-diagnostics__chip"><strong>' + escapeHtml(triage.total || 0) + '</strong> problemas</span>',
      '<span class="kc-cadu-feed-diagnostics__chip"><strong>' + escapeHtml(triage.caduMarked || 0) + '</strong> marcados como Cadu</span>',
      '<span class="kc-cadu-feed-diagnostics__chip"><strong>' + escapeHtml(countFrom(byReason, 'missing-deadline')) + '</strong> sem prazo</span>',
      '<span class="kc-cadu-feed-diagnostics__chip"><strong>' + escapeHtml(countFrom(byReason, 'missing-event-date')) + '</strong> eventos sem data</span>',
      '<span class="kc-cadu-feed-diagnostics__chip"><strong>' + escapeHtml(expired.length) + '</strong> expirados na fila</span>',
    ].join('');

    var items = missing.concat(eventReview).concat(expired).slice(0, 12);
    if (!items.length) {
      listEl.innerHTML = '<div class="kc-cadu-feed-diagnostics__empty">Nenhum problema prioritário encontrado na amostra atual.</div>';
      return;
    }
    listEl.innerHTML = items.map(function (item) {
      var title = item.title || item.id || 'Item sem título';
      var action = item.repairAction || 'review_metadata';
      var reason = (item.reasons || []).join(', ') || 'review';
      var source = item.source || '';
      var host = item.sourceHost || '';
      var repair = suggestionById[item.id] || {};
      var metadataPatch = repair.metadataPatch || {};
      var rowPatch = repair.rowPatch || {};
      var patchBits = [];
      Object.keys(metadataPatch).forEach(function (key) { patchBits.push('metadata.' + key + '=' + metadataPatch[key]); });
      Object.keys(rowPatch).forEach(function (key) { patchBits.push(key + '=' + rowPatch[key]); });
      var patchLabel = patchBits.length ? patchBits.slice(0, 2).join(' · ') : '';
      var patchPayload = patchBits.length ? JSON.stringify({ metadata: metadataPatch, row: rowPatch, action: repair.action || '' }) : '';
      var badge = action === 'extract_deadline_date' ? 'Extrair prazo' : (action === 'fill_data_evento_or_reclassify' ? 'Data/reclassificar' : 'Revisar');
      return '<article class="kc-cadu-feed-diagnostics__item">'
        + '<div class="kc-cadu-feed-diagnostics__item-head">'
        + '<code>' + escapeHtml(item.id || '') + '</code>'
        + '<span>' + escapeHtml(item.module || '') + '</span>'
        + '<span>' + escapeHtml(reason) + '</span>'
        + (host ? '<span>' + escapeHtml(host) + '</span>' : '')
        + '</div>'
        + '<div class="kc-cadu-feed-diagnostics__item-title">' + escapeHtml(title) + '</div>'
        + '<div class="kc-cadu-feed-diagnostics__item-actions">'
        + '<span class="kc-cadu-feed-diagnostics__chip">' + escapeHtml(badge) + '</span>'
        + (patchLabel ? '<span class="kc-cadu-feed-diagnostics__chip">Patch sugerido: ' + escapeHtml(patchLabel) + '</span>' : '')
        + (source ? '<a href="' + escapeHtml(source) + '" target="_blank" rel="noopener" class="kc-cadu-feed-diagnostics__chip">Fonte</a>' : '')
        + '<button type="button" class="kc-cadu-ask-btn" data-ask-kind="feed-diagnostic"'
        + ' data-ask-id="' + escapeHtml(item.id || '') + '"'
        + ' data-ask-title="' + escapeHtml(title.replace(/"/g, '&quot;')) + '"'
        + ' data-ask-source="' + escapeHtml(source.replace(/"/g, '&quot;')) + '"'
        + ' data-ask-action="' + escapeHtml(action) + '"'
        + ' data-ask-reason="' + escapeHtml(reason.replace(/"/g, '&quot;')) + '"'
        + ' data-ask-patch="' + escapeHtml(patchPayload) + '">'
        + '<i class="fas fa-robot"></i> Perguntar Cadu</button>'
        + '</div>'
        + '</article>';
    }).join('');
  }

  async function loadFeedDiagnostics() {
    var btn = $('#feed-diagnostics-refresh-btn');
    var summaryEl = $('#feed-diagnostics-summary');
    var listEl = $('#feed-diagnostics-list');
    if (state.feedDiagnosticsLoading) return;
    state.feedDiagnosticsLoading = true;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';
    }
    if (summaryEl) summaryEl.innerHTML = '<span class="kc-cadu-feed-diagnostics__chip">Consultando Supabase read-only...</span>';
    try {
      var data = await apiFetch('/api/cadu/feed-diagnostics?limit=80&rpcLimit=10&triageLimit=12&repairLimit=100');
      if (data && data.__error) throw new Error((data.data && data.data.message) || (data.data && data.data.error) || 'status ' + data.status);
      state.feedDiagnostics = data;
      renderFeedDiagnostics(data);
    } catch (err) {
      if (summaryEl) summaryEl.innerHTML = '<span class="kc-cadu-feed-diagnostics__chip">Erro no diagnóstico</span>';
      if (listEl) listEl.innerHTML = '<div class="kc-cadu-feed-diagnostics__empty">Erro ao carregar diagnóstico: ' + escapeHtml(err.message || err) + '</div>';
    } finally {
      state.feedDiagnosticsLoading = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-chart-line"></i> Atualizar diagnóstico';
      }
    }
  }

  // ============================================================
  // Tabs + eventos
  // ============================================================

  function switchTab(name) {
    if (['sites', 'feed', 'pipeline', 'openclaw'].indexOf(name) === -1) name = 'sites';
    state.currentTab = name;
    try { localStorage.setItem(STORAGE_TAB, name); } catch (e) {}
    $$('.kc-cadu-tab').forEach(function (t) {
      var selected = t.getAttribute('data-tab') === name;
      t.classList.toggle('is-active', selected);
      t.setAttribute('aria-selected', selected ? 'true' : 'false');
      t.setAttribute('tabindex', selected ? '0' : '-1');
    });
    $('#tab-sites').style.display = name === 'sites' ? '' : 'none';
    $('#tab-feed').style.display = name === 'feed' ? '' : 'none';
    if (name === 'feed' && !state.feedDiagnostics && !state.feedDiagnosticsLoading) {
      loadFeedDiagnostics();
    }
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
    selectedSession: null,
    chatFocused: false,
    busy: false,
    refreshPromise: null,
    lastRefreshStartedAt: 0,
  };

  function fmtAgeMs(ms) {
    if (!ms && ms !== 0) return '—';
    var s = Math.floor(ms / 1000);
    if (s < 60) return s + 's atrás';
    if (s < 3600) return Math.floor(s / 60) + 'min atrás';
    if (s < 86400) return Math.floor(s / 3600) + 'h atrás';
    return Math.floor(s / 86400) + 'd atrás';
  }

  function fmtSessionId(sessionId) {
    var sid = String(sessionId || '');
    return sid ? sid.slice(0, 8) + '…' : '—';
  }

  function getOpenclawSessionId(session) {
    return session ? String(session.sessionId || session.session_id || session.id || '') : '';
  }

  function setOpenclawActionStatus(message, kind) {
    var el = $('#openclaw-action-status');
    if (!el) return;
    el.hidden = !message;
    el.classList.remove('is-ok', 'is-error', 'is-loading');
    if (kind) el.classList.add('is-' + kind);
    el.innerHTML = message || '';
  }

  function getSessionLogTerms(session) {
    if (!session) return [];
    var raw = [
      getOpenclawSessionId(session),
      session.key,
      session.runtimePolicySessionKey,
      session.kind,
    ];
    if (getOpenclawSessionId(session)) raw.push(getOpenclawSessionId(session).slice(0, 8));
    if (session.key) {
      var parts = String(session.key).split(/[/:| ]+/).filter(Boolean);
      raw = raw.concat(parts.slice(-3));
    }
    var seen = {};
    return raw.map(function (term) { return String(term || '').trim(); })
      .filter(function (term) {
        if (!term || term.length < 4 || seen[term]) return false;
        seen[term] = true;
        return true;
      });
  }

  function filterLogsForSession(text, session) {
    var terms = getSessionLogTerms(session);
    var lines = String(text || '').split(/\r?\n/);
    if (!terms.length) return text;
    var matches = lines.filter(function (line) {
      return terms.some(function (term) {
        return line.toLowerCase().indexOf(term.toLowerCase()) !== -1;
      });
    });
    if (matches.length) {
      return '[filtro de sessão: ' + fmtSessionId(getOpenclawSessionId(session)) + ' | termos: ' + terms.join(', ') + ']\n\n' + matches.join('\n');
    }
    return '[sem linhas específicas para a sessão ' + fmtSessionId(getOpenclawSessionId(session)) + ' nos últimos logs do Gateway]\n'
      + '[termos buscados: ' + terms.join(', ') + ']\n\n'
      + text;
  }

  function focusOpenclawChat() {
    var input = $('#openclaw-chat-input');
    var chat = $('.kc-openclaw-chat');
    if (chat && chat.scrollIntoView) chat.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(function () {
      if (input && input.focus) input.focus();
    }, 200);
  }

  function toggleOpenclawChatFocus(force) {
    var grid = $('.kc-openclaw-grid');
    var btn = $('#openclaw-chat-focus-btn');
    if (!grid) return;
    var next = typeof force === 'boolean' ? force : !grid.classList.contains('is-chat-focus');
    openclawState.chatFocused = next;
    grid.classList.toggle('is-chat-focus', next);
    if (btn) {
      btn.innerHTML = next
        ? '<i class="fas fa-compress"></i> Recolher'
        : '<i class="fas fa-expand"></i> Foco';
    }
    focusOpenclawChat();
  }

  function renderOpenclawSessionDetail(session) {
    var box = $('#openclaw-session-detail');
    if (!box) return;
    var sid = getOpenclawSessionId(session);
    if (!session || !sid) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    var pct = session.percentUsed != null ? escapeHtml(String(session.percentUsed)) + '% do contexto' : 'contexto n/d';
    var age = fmtAgeMs(session.ageMs || (session.age ? session.age * 1000 : 0));
    box.hidden = false;
    box.innerHTML =
      '<div class="kc-openclaw-session-detail__title"><i class="fas fa-circle-info"></i> Sessão selecionada: <code>' + escapeHtml(fmtSessionId(sid)) + '</code></div>' +
      '<div>O próximo envio do chat incluirá <code>session_id=' + escapeHtml(sid) + '</code>, permitindo continuar o contexto salvo pelo OpenClaw quando a sessão ainda existir no agente.</div>' +
      '<div class="kc-openclaw-session-detail__meta">' +
        '<span>' + escapeHtml(session.kind || 'tipo n/d') + '</span>' +
        '<span>' + escapeHtml(session.model || 'modelo n/d') + '</span>' +
        '<span>' + pct + '</span>' +
        '<span>' + escapeHtml(age) + '</span>' +
      '</div>' +
      '<div><strong>Chave:</strong> <code>' + escapeHtml(session.key || '—') + '</code></div>' +
      '<div class="kc-openclaw-session-detail__actions">' +
        '<button type="button" id="openclaw-session-chat-btn" class="kc-btn-secondary"><i class="fas fa-comments"></i> Usar no chat</button>' +
        '<button type="button" id="openclaw-session-resume-btn" class="kc-btn-secondary"><i class="fas fa-rotate-right"></i> Continuar sessão</button>' +
        '<button type="button" id="openclaw-session-logs-btn" class="kc-btn-secondary"><i class="fas fa-file-lines"></i> Ver logs desta sessão</button>' +
      '</div>';
  }

  function openclawStatusData(statusResponse) {
    var command = statusResponse && statusResponse.status;
    if (!command || command.ok !== true) return null;
    var data = command.data || command.result || command;
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  }

  function renderOpenclawUnavailable(reason) {
    var statusBadge = $('#badge-openclaw');
    var agentEl = $('#openclaw-stat-agent');
    var agentHint = $('#openclaw-stat-agent-hint');
    var tgEl = $('#openclaw-stat-telegram');
    var tgHint = $('#openclaw-stat-telegram-hint');
    if (statusBadge) statusBadge.textContent = '!';
    if (agentEl) agentEl.innerHTML = '<i class="fas fa-circle-xmark"></i> indisponível';
    if (agentHint) agentHint.textContent = reason || 'status real não confirmado';
    if (tgEl) tgEl.innerHTML = '<i class="fas fa-circle-question"></i> não confirmado';
    if (tgEl) tgEl.style.color = '#f59e0b';
    if (tgHint) tgHint.textContent = 'aguardando health válido do Gateway';
  }

  async function performOpenclawRefresh() {
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
      var statusResp = await apiFetch('/api/cadu/openclaw/status', { timeoutMs: OPENCLAW_REQUEST_TIMEOUT_MS });
      if (!statusResp || statusResp.__error) {
        renderOpenclawUnavailable(statusResp && statusResp.status ? 'cadu-api respondeu HTTP ' + statusResp.status : 'erro de comunicação com o cadu-api');
        return;
      }
      var rawData = openclawStatusData(statusResp);
      if (!rawData) {
        renderOpenclawUnavailable('comando de status do OpenClaw falhou ou não comprovou ok=true');
        return;
      }
      var agents = rawData.agents && rawData.agents.agents ? rawData.agents.agents : [];
      var defaultAgent = (rawData.heartbeat && rawData.heartbeat.defaultAgentId) || (rawData.agents && rawData.agents.defaultId) || 'main';
      var mainAgent = agents.find(function (a) { return a.id === defaultAgent; }) || agents[0];
      var recentSessions = rawData.sessions && rawData.sessions.recent ? rawData.sessions.recent : [];
      var lastActiveMs = mainAgent && Number.isFinite(Number(mainAgent.lastActiveAgeMs))
        ? Number(mainAgent.lastActiveAgeMs)
        : (recentSessions[0] ? Number(recentSessions[0].ageMs || recentSessions[0].age || 0) : 0);
      var hb = rawData.heartbeat || {};
      var hbEvery = hb.agents && hb.agents[0] ? hb.agents[0].every : '—';
      var sessionDefaults = rawData.sessions && rawData.sessions.defaults ? rawData.sessions.defaults : {};
      var modelHint = sessionDefaults.model || (mainAgent && mainAgent.model) || 'modelo não informado';
      var contextHint = sessionDefaults.contextTokens
        ? ('ctx ' + Math.round(sessionDefaults.contextTokens / 1000000) + 'M')
        : 'ctx não informado';

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
      var healthCommand = statusResp.health;
      var healthText = healthCommand && healthCommand.ok === true && healthCommand.stdout ? healthCommand.stdout : '';
      var tgConnected = /Telegram[^\n]*(?:connected|healthy|\bok\b)/i.test(healthText);
      var tgConfigured = tgConnected || /Telegram[^\n]*configured/i.test(healthText);
      var heartbeatDisabled = /^(?:0|off|disabled|desativado)/i.test(String(hbEvery || ''));
      if (tgEl) {
        tgEl.innerHTML = tgConnected
          ? '<i class="fas fa-circle-check"></i> conectado'
          : (tgConfigured ? '<i class="fas fa-circle-exclamation"></i> configurado' : '<i class="fas fa-circle-xmark"></i> não confirmado');
        tgEl.style.color = tgConnected ? '#4caf50' : (tgConfigured ? '#f59e0b' : '#f44336');
      }
      if (tgHint) tgHint.textContent = tgConnected ? 'conexão confirmada pelo health do Gateway' : 'o health não confirmou uma conexão ativa';
      if (hbEl) {
        hbEl.innerHTML = heartbeatDisabled
          ? '<i class="fas fa-pause-circle"></i> desativado'
          : '<i class="fas fa-clock"></i> ' + escapeHtml(hbEvery || 'não informado');
      }
      if (hbHint) hbHint.innerHTML = mainAgent ? ('última atividade: ' + fmtAgeMs(lastActiveMs)) : '—';

      if (statusBadge) statusBadge.textContent = tasks.active > 0 ? '●' : 'ok';

      // 3. Sessions recentes
      var sessResp = await apiFetch('/api/cadu/openclaw/sessions?limit=8', { timeoutMs: OPENCLAW_REQUEST_TIMEOUT_MS });
      var sessList = $('#openclaw-sessions-list');
      if (sessResp && !sessResp.__error && sessResp.data && sessResp.data.sessions) {
        var sessions = sessResp.data.sessions;
        // lembrar a sessão mais recente "direct" para próxima mensagem
        var lastDirect = sessions.find(function (s) { return s.kind === 'direct'; });
        if (lastDirect) {
          openclawState.lastSessionId = getOpenclawSessionId(lastDirect);
          var ls = $('#openclaw-last-session');
          if (ls) ls.textContent = fmtSessionId(openclawState.lastSessionId);
        }
        if (sessList) {
          if (sessions.length === 0) {
            sessList.innerHTML = '<div class="kc-cadu-empty">Nenhuma sessão.</div>';
            openclawState.selectedSession = null;
            renderOpenclawSessionDetail(null);
          } else {
            sessList.innerHTML = sessions.map(function (s) {
              var kindIcon = s.kind === 'cron' ? 'fa-clock' : (s.kind === 'direct' ? 'fa-comments' : 'fa-circle');
              var pct = s.percentUsed != null ? (' · ' + s.percentUsed + '% ctx') : '';
              var selectedClass = openclawState.selectedSession && getOpenclawSessionId(openclawState.selectedSession) === getOpenclawSessionId(s) ? ' is-selected' : '';
              return '<div class="kc-openclaw-list-item' + selectedClass + '">' +
                '<div class="kc-openclaw-list-item__title"><i class="fas ' + kindIcon + '"></i> ' +
                escapeHtml(s.kind || '?') + ' · ' + escapeHtml((s.model || '?').toString()) + '</div>' +
                '<div class="kc-openclaw-list-item__meta">' +
                escapeHtml((s.key || '').slice(0, 60)) +
                ' · ' + fmtAgeMs(s.ageMs || (s.age ? s.age * 1000 : 0)) +
                pct +
                '</div></div>';
            }).join('');
            $$('.kc-openclaw-list-item', sessList).forEach(function (item, idx) {
              var session = sessions[idx] || {};
              item.setAttribute('role', 'button');
              item.setAttribute('tabindex', '0');
              item.setAttribute('title', 'Selecionar sessão e ver detalhes');
              function selectSession() {
                var sid = getOpenclawSessionId(session);
                if (!sid) return;
                openclawState.lastSessionId = sid;
                openclawState.selectedSession = session;
                var selected = $('#openclaw-last-session');
                if (selected) selected.textContent = fmtSessionId(sid);
                var chatStatus = $('#openclaw-chat-status');
                if (chatStatus) chatStatus.textContent = 'Sessão selecionada para o próximo envio: ' + fmtSessionId(sid);
                setOpenclawActionStatus('Sessão <code>' + escapeHtml(fmtSessionId(sid)) + '</code> selecionada. Você pode usá-la no chat ou filtrar logs por ela.', 'ok');
                renderOpenclawSessionDetail(session);
                $$('.kc-openclaw-list-item', sessList).forEach(function (el) { el.classList.toggle('is-selected', el === item); });
              }
              item.addEventListener('click', selectSession);
              item.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  selectSession();
                }
              });
            });
            if (openclawState.selectedSession && getOpenclawSessionId(openclawState.selectedSession)) {
              var stillExists = sessions.some(function (s) { return getOpenclawSessionId(s) === getOpenclawSessionId(openclawState.selectedSession); });
              if (!stillExists) renderOpenclawSessionDetail(openclawState.selectedSession);
            }
          }
        }
      } else if (sessList) {
        sessList.innerHTML = '<div class="kc-cadu-empty">Erro ao carregar sessões.</div>';
      }

    } catch (e) {
      renderOpenclawUnavailable(String(e && e.message || e));
    }
  }

  function refreshOpenclaw(options) {
    var opts = options || {};
    if (typeof document !== 'undefined' && document.hidden) return Promise.resolve({ skipped: 'hidden' });
    if (openclawState.refreshPromise) return openclawState.refreshPromise;
    var now = Date.now();
    if (opts.force !== true && now - openclawState.lastRefreshStartedAt < OPENCLAW_POLL_INTERVAL_MS) {
      return Promise.resolve({ skipped: 'cooldown' });
    }
    openclawState.lastRefreshStartedAt = now;
    openclawState.refreshPromise = performOpenclawRefresh().finally(function () {
      openclawState.refreshPromise = null;
    });
    return openclawState.refreshPromise;
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
        if (ls) ls.textContent = fmtSessionId(meta.agentMeta.sessionId);
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

  function parseAgentResponse(resp) {
    var data = resp && (resp.data || resp);
    if (data && data.data && data.data.result) data = data.data;
    var payloads = (data && data.result && data.result.payloads) || [];
    var text = '';
    for (var i = 0; i < payloads.length; i++) {
      if (payloads[i] && payloads[i].text) text += payloads[i].text + '\n';
    }
    if (!text && data && data.summary) text = data.summary;
    if (!text && resp && resp.stderr) text = 'Sem texto de retorno. stderr: ' + resp.stderr;
    var meta = (data && data.result && data.result.meta) || {};
    var dur = meta.durationMs ? Math.round(meta.durationMs / 1000) + 's' : '';
    var usage = meta.agentMeta ? ('in ' + (meta.agentMeta.usage ? meta.agentMeta.usage.input : '?') + ' / out ' + (meta.agentMeta.usage ? meta.agentMeta.usage.output : '?')) : '';
    return { text: (text || '(resposta vazia)').trim(), meta: [dur, usage].filter(Boolean).join(' - ') };
  }

  function showAskCaduResult(label, resp) {
    switchTab('openclaw');
    appendChatMsg('user', label, 'ação do painel');
    var parsed = parseAgentResponse(resp);
    appendChatMsg('cadu', parsed.text, parsed.meta || null);
    setTimeout(refreshOpenclaw, 800);
  }

  async function openclawTriggerHeartbeat() {
    var btn = $('#openclaw-trigger-heartbeat-btn');
    var status = $('#openclaw-chat-status');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Trigger Heartbeat';
    }
    if (status) status.textContent = 'Enviando evento de heartbeat…';
    setOpenclawActionStatus('<i class="fas fa-spinner fa-spin"></i> Enviando heartbeat para o agente principal…', 'loading');
    try {
      var resp = await apiFetch('/api/cadu/openclaw/agent-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Admin trigger from KinoCampus UI', agent: 'main', mode: 'now' }),
      });
      var data = resp && (resp.data || resp);
      var ok = !!(resp && !resp.__error && data && data.ok !== false && Number(data.exit_code || 0) === 0);
      if (ok) {
        var sentAt = new Date().toLocaleTimeString('pt-BR');
        var stdout = data && data.stdout ? String(data.stdout).trim().slice(0, 180) : '';
        if (status) status.textContent = 'Heartbeat confirmado pelo Gateway; atualizando status…';
        setOpenclawActionStatus(
          '<i class="fas fa-circle-check"></i> Heartbeat confirmado às ' + escapeHtml(sentAt) +
          ' com <code>exit_code=' + escapeHtml(data.exit_code == null ? 0 : data.exit_code) + '</code>.' +
          (stdout ? '<br><small>stdout: ' + escapeHtml(stdout) + '</small>' : '') +
          '<br><small>Os cartões serão atualizados em instantes para refletir a última atividade do agente.</small>',
          'ok'
        );
        setTimeout(refreshOpenclaw, 1500);
      } else {
        var detail = data && (data.stderr || data.error || JSON.stringify(data));
        var exitCode = data && data.exit_code != null ? (' exit_code=' + data.exit_code + '.') : '';
        if (status) status.textContent = 'Heartbeat falhou:' + exitCode + ' ' + String(detail || 'sem detalhe').slice(0, 180);
        setOpenclawActionStatus('<i class="fas fa-circle-xmark"></i> Heartbeat não foi confirmado.' + escapeHtml(exitCode) + '<br><small>' + escapeHtml(String(detail || 'sem detalhe').slice(0, 300)) + '</small>', 'error');
      }
    } catch (e) {
      if (status) status.textContent = 'Heartbeat falhou: ' + (e && e.message ? e.message : e);
      setOpenclawActionStatus('<i class="fas fa-circle-xmark"></i> Heartbeat falhou: ' + escapeHtml(e && e.message ? e.message : e), 'error');
    }
    finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-heart-pulse"></i> Trigger Heartbeat';
      }
    }
  }

  async function openclawShowLogs(options) {
    options = options || {};
    var box = $('#openclaw-logs-box');
    var pre = $('#openclaw-logs-pre');
    var btn = $('#openclaw-show-logs-btn');
    var session = options.session || null;
    if (!box || !pre) return;
    if (!session && !box.hidden) { openclawCloseLogs(); return; }
    pre.textContent = session ? ('Carregando logs da sessão ' + fmtSessionId(getOpenclawSessionId(session)) + '…') : 'Carregando logs…';
    box.hidden = false;
    if (btn) btn.innerHTML = '<i class="fas fa-eye-slash"></i> Ocultar logs';
    setOpenclawActionStatus(session
      ? '<i class="fas fa-spinner fa-spin"></i> Buscando logs e filtrando pela sessão <code>' + escapeHtml(fmtSessionId(getOpenclawSessionId(session))) + '</code>…'
      : '<i class="fas fa-spinner fa-spin"></i> Buscando últimos logs do Gateway…', 'loading');
    try {
      var resp = await apiFetch('/api/cadu/openclaw/logs?limit=80');
      if (resp && !resp.__error) {
        var raw = (resp.stdout || '') + (resp.stderr ? '\n[stderr]\n' + resp.stderr : '');
        pre.textContent = session ? filterLogsForSession(raw, session) : raw;
        setOpenclawActionStatus(session
          ? '<i class="fas fa-circle-check"></i> Logs carregados com filtro de sessão. Se não houver linhas específicas, o painel mostra o log geral logo abaixo.'
          : '<i class="fas fa-circle-check"></i> Logs do Gateway carregados.', 'ok');
      } else {
        pre.textContent = 'Erro: ' + (resp ? JSON.stringify(resp) : 'sem resposta');
        setOpenclawActionStatus('<i class="fas fa-circle-xmark"></i> Erro ao carregar logs do Gateway.', 'error');
      }
    } catch (e) {
      pre.textContent = 'Exception: ' + e.message;
      setOpenclawActionStatus('<i class="fas fa-circle-xmark"></i> Erro ao carregar logs: ' + escapeHtml(e.message), 'error');
    }
  }

  function openclawCloseLogs() {
    var box = $('#openclaw-logs-box');
    var btn = $('#openclaw-show-logs-btn');
    if (box) box.hidden = true;
    if (btn) btn.innerHTML = '<i class="fas fa-file-lines"></i> Ver logs do Gateway';
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
        message = 'Resuma e me diga o que faço com o chunk "' + heading + '" (id=' + chunkId + ').';
        // Tenta endpoint dedicado /api/feed/{id}/ask (cadu-api v0.4.6+)
        // via proxy consolidado /api/cadu/feed?path={chunk_id}/ask
        var resp = await apiFetch('/api/cadu/feed?path=' + encodeURIComponent(chunkId + '/ask'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: message, session_id: sessionId, agent: agentReq }),
        });
        if (!resp || resp.__error) {
          // Fallback: monta contexto inline + agent-send
          message = '<chunk-context id="' + chunkId + '" heading="' + heading.replace(/"/g, "'") + '">' + (btn.getAttribute('data-ask-snippet') || '(conteúdo será carregado pelo Cadu)') + '</chunk-context>\n\n' + message;
          resp = await apiFetch('/api/cadu/openclaw/agent-send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message, session_id: sessionId, agent: agentReq }),
          });
        }
        if (resp && !resp.__error) {
          showAskCaduResult('Perguntar sobre chunk: ' + (heading || chunkId), resp);
        } else {
          showCaduError('Erro ao perguntar ao Cadu sobre o chunk: ' + (resp && resp.status ? ('HTTP ' + resp.status) : 'sem resposta'));
        }
      } else if (kind === 'feed-diagnostic') {
        var diagId = btn.getAttribute('data-ask-id') || '';
        var diagTitle = btn.getAttribute('data-ask-title') || '';
        var diagSource = btn.getAttribute('data-ask-source') || '';
        var diagAction = btn.getAttribute('data-ask-action') || '';
        var diagReason = btn.getAttribute('data-ask-reason') || '';
        var diagPatch = btn.getAttribute('data-ask-patch') || '';
        message = '<feed-diagnostic id="' + diagId + '" action="' + diagAction + '" reason="' + diagReason + '" source="' + diagSource + '"></feed-diagnostic>\n\n'
          + 'Analise este problema do feed publico do KinoCampus: "' + diagTitle + '". '
          + 'A acao sugerida e "' + diagAction + '" por causa de "' + diagReason + '". '
          + (diagPatch ? 'Patch dry-run sugerido: ' + diagPatch + '. ' : '')
          + 'Use a fonte oficial quando disponivel (' + (diagSource || 'sem fonte') + ') e diga exatamente qual metadata deve ser corrigida, se e prazo, data de evento, reclassificacao ou arquivamento.';
        var diagResp = await apiFetch('/api/cadu/openclaw/agent-send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: message, session_id: sessionId, agent: agentReq }),
        });
        if (diagResp && !diagResp.__error) {
          showAskCaduResult('Diagnóstico do feed: ' + (diagTitle || diagId), diagResp);
        } else {
          showCaduError('Erro ao perguntar ao Cadu sobre o diagnóstico: ' + (diagResp && diagResp.status ? ('HTTP ' + diagResp.status) : 'sem resposta'));
        }
      } else if (kind === 'site') {
        var siteName = btn.getAttribute('data-ask-name') || '';
        var siteUrl = btn.getAttribute('data-ask-url') || '';
        var siteIg = btn.getAttribute('data-ask-instagram') || '';
        var siteTier = btn.getAttribute('data-ask-tier') || '';
        message = '<site-context name="' + siteName + '" url="' + siteUrl + '" instagram="' + siteIg + '" tier="' + siteTier + '"></site-context>\n\nMe dê um resumo rápido sobre o que você sabe do site "' + siteName + '" (' + siteUrl + ') e o que vale destacar. Use os tiers e notas que você tem em mente.';
        var resp2 = await apiFetch('/api/cadu/openclaw/agent-send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: message, session_id: sessionId, agent: agentReq }),
        });
        if (resp2 && !resp2.__error) {
          showAskCaduResult('Perguntar sobre site: ' + siteName, resp2);
        } else {
          showCaduError('Erro ao perguntar ao Cadu sobre o site: ' + (resp2 && resp2.status ? ('HTTP ' + resp2.status) : 'sem resposta'));
        }
      } else if (kind === 'pipeline') {
        var runId = btn.getAttribute('data-ask-run-id') || '';
        var stage = btn.getAttribute('data-ask-stage') || '';
        var status = btn.getAttribute('data-ask-status') || '';
        message = '<run-context id="' + runId + '" stage="' + stage + '" status="' + status + '"></run-context>\n\nAnalise a pipeline run "' + runId.slice(0, 8) + '…" (stage=' + stage + ', status=' + status + '). Você pode buscar detalhes via /api/cadu/pipeline/' + runId + '/export.';
        var resp3 = await apiFetch('/api/cadu/openclaw/agent-send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: message, session_id: sessionId, agent: agentReq }),
        });
        if (resp3 && !resp3.__error) {
          showAskCaduResult('Perguntar sobre pipeline: ' + runId.slice(0, 8), resp3);
        } else {
          showCaduError('Erro ao perguntar ao Cadu sobre a pipeline: ' + (resp3 && resp3.status ? ('HTTP ' + resp3.status) : 'sem resposta'));
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
  // Notification bell (cross-tab via Vercel polling - não Supabase Realtime
  // por causa de RLS + perf). Atualiza bell com runs/publicações recentes.
  // ============================================================

  var notifState = { lastCount: 0, runs: [], seen: {} };

  function pollNotifActivity() {
    var bell = $('#kcCaduActivityBell');
    var badge = $('#kcCaduActivityBadge');
    var list = $('#kcCaduActivityList');
    if (!bell || !badge) return;

    apiFetch('/api/cadu/pipeline/runs?limit=8')
      .then(function (r) { return r && !r.__error ? r : null; })
      .then(function (data) {
        if (!data || !Array.isArray(data.runs)) return;
        var safeRuns = data.runs.map(normalizePipelineRun).filter(Boolean).slice(0, 20);
        notifState.runs = safeRuns;

        var dayAgo = Math.floor(Date.now() / 1000) - 86400;
        var recent24h = safeRuns.filter(function (r) { return (r.started_at || 0) >= dayAgo; });

        try {
          var seenIds = JSON.parse(localStorage.getItem('kc_cadu_seen_runs') || '{}');
          var newOnes = safeRuns.filter(function (r) { return !seenIds[r.id]; });
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
          safeRuns.forEach(function (r) { newSeen[r.id] = Date.now(); });
          localStorage.setItem('kc_cadu_seen_runs', JSON.stringify(newSeen));
        } catch (e) {}

        if (list && $('#kcCaduActivityDropdown') && !$('#kcCaduActivityDropdown').hasAttribute('hidden')) {
          if (safeRuns.length === 0) {
            list.innerHTML = '<div class="kc-cadu-empty">Nenhuma run ainda.</div>';
            return;
          }
          list.innerHTML = safeRuns.slice(0, 8).map(function (r) {
            var stClass = r.status === 'finished' ? 'pill--finished'
                       : r.status === 'failed' ? 'pill--failed'
                       : r.status === 'running' ? 'pill--running' : '';
            return '<div class="kc-cadu-activity-dropdown__item" data-run="' + r.id + '">'
              + '<div class="kc-cadu-activity-dropdown__item__title">' + escapeHtml(r.stage) + '</div>'
              + '<div class="kc-cadu-activity-dropdown__item__meta">'
              + '<span class="pill ' + stClass + '">' + escapeHtml(r.status) + '</span>'
              + '<span>' + fmtAgo(r.started_at) + '</span>'
              + (r.exit_code != null ? '<span>exit ' + r.exit_code + '</span>' : '')
              + '</div>'
              + '</div>';
          }).join('');
          $$('.kc-cadu-activity-dropdown__item', list).forEach(function (it) {
            it.addEventListener('click', function () {
              switchTab('pipeline');
              $('#kcCaduActivityDropdown').setAttribute('hidden', '');
              bell.setAttribute('aria-expanded', 'false');
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
  // Export PDF — Sites UFG e Feed Coletado
  // ============================================================

  function buildSitesPdfReport() {
    var f = state.sitesFilter || {};
    var sites = state.filteredSites || state.allSites || [];
    var tierCount = { '1': 0, '2': 0, '3': 0, '': 0 };
    var igCount = { confirmed: 0, tentative: 0, missing: 0, unknown: 0 };
    var hasUrl = 0;
    sites.forEach(function (s) {
      var t = s.tier != null ? String(s.tier) : '';
      if (tierCount[t] != null) tierCount[t] = tierCount[t] + 1; else tierCount[''] = (tierCount[''] || 0) + 1;
      var ig = s.instagram_status || 'unknown';
      igCount[ig] = (igCount[ig] || 0) + 1;
      if (s.url) hasUrl += 1;
    });
    var rows = sites.map(function (s) {
      return {
        unidade: s.name || '',
        tier: s.tier ? 'T' + s.tier : '—',
        site: s.url || '—',
        instagram: s.instagramContext || s.instagram || '—',
        ig_status: s.instagram_status || '—',
        categoria: s.category || '—',
        override: s.override_origin
          ? s.override_origin + (s.collision ? ' · evidência de colisão' : '')
          : 'legado somente leitura',
        observacao: s.note || '',
      };
    });
    return {
      title: 'KinoCampus — Mapa de Sites UFG (Cadu)',
      subtitle: 'Inventário institucional curado pelo Cadu (OpenClaw)',
      source: 'admin/cadu.html — aba Sites UFG',
      generatedAt: new Date().toISOString(),
      filters: {
        busca: f.q || '—',
        tier: f.tier ? ('Tier ' + f.tier) : 'todos',
        ig_status: f.ig || 'todos',
        override_origin: state.sitesOrigin || 'todos',
        total_filtrado: sites.length + ' de ' + (state.allSites || []).length,
      },
      kpis: [
        { label: 'Total filtrado', value: sites.length + ' / ' + (state.allSites || []).length, note: 'após aplicar busca, tier e status IG' },
        { label: 'Com site HTTPS', value: hasUrl, note: 'unidades com URL institucional cadastrada' },
        { label: 'IG confirmado', value: igCount.confirmed || 0, note: 'perfil com evidência institucional confirmada' },
        { label: 'IG pendente/tentativo', value: (igCount.pending_verification || 0) + (igCount.tentative || 0), note: 'exige verificação antes de qualquer ativação' },
        { label: 'Tier efetivo 1', value: tierCount['1'] || 0, note: 'consulte origem e override antes de interpretar prioridade' },
        { label: 'Tier efetivo 2', value: tierCount['2'] || 0, note: 'consulte origem e override antes de interpretar prioridade' },
        { label: 'Tier efetivo 3', value: tierCount['3'] || 0, note: 'consulte origem e override antes de interpretar prioridade' },
      ],
      sections: [
        {
          title: 'Sites UFG (lista filtrada)',
          note: 'Tabela exportada da visão Fontes web. Overrides exigem ID estável, confirmação explícita e ETag/CAS; valores legados não são promovidos automaticamente.',
          columns: [
            { key: 'unidade', label: 'Unidade', width: 2 },
            { key: 'tier', label: 'Tier', width: 1 },
            { key: 'site', label: 'Site institucional', width: 4 },
            { key: 'instagram', label: 'Instagram', width: 2 },
            { key: 'ig_status', label: 'Status IG', width: 1 },
            { key: 'categoria', label: 'Categoria', width: 2 },
            { key: 'override', label: 'Origem / colisão', width: 2 },
            { key: 'observacao', label: 'Observação', width: 3 },
          ],
          rows: rows,
          maxPdfRows: 200,
        },
      ],
    };
  }

  function buildFeedPdfReport() {
    var items = state.allFeedItems || [];
    var f = state.feedFilter || {};
    var total = state.feedTotal || items.length;
    var source = items.reduce(function (acc, it) {
      var host = (it.source_host || (it.file_path || '').split('/')[0] || 'desconhecido');
      acc[host] = (acc[host] || 0) + 1;
      return acc;
    }, {});
    var topSources = Object.keys(source).sort(function (a, b) { return source[b] - source[a]; }).slice(0, 5);
    var rows = items.map(function (it) {
      return {
        chunk: it.chunk_id ? it.chunk_id.slice(0, 16) : '—',
        arquivo: it.file_path || '—',
        titulo: it.heading || '(sem título)',
        criado: fmtDate(it.created_at),
        trecho: (it.snippet || '').slice(0, 600),
      };
    });
    return {
      title: 'KinoCampus — Memória indexada do Cadu (Feed Coletado)',
      subtitle: 'Chunks recentes indexados pelo Cadu/OpenClaw (read-only, ' + total + ' chunks no total)',
      source: 'admin/cadu.html — aba Feed Coletado (cadu-api /api/feed)',
      generatedAt: new Date().toISOString(),
      filters: {
        pagina: (state.feedPage || 0) + 1,
        limite: state.feedLimit || FEED_PAGE_SIZE,
        busca: f.q || '—',
        chunks_listados: items.length,
        chunks_total: total,
      },
      kpis: [
        { label: 'Chunks listados', value: items.length, note: 'página atual' },
        { label: 'Total na memória', value: total, note: 'todos os chunks indexados' },
        { label: 'Página', value: ((state.feedPage || 0) + 1), note: 'paginação atual' },
        { label: 'Limite', value: state.feedLimit || FEED_PAGE_SIZE, note: 'itens por página' },
        { label: 'Fontes no top 5', value: topSources.length, note: topSources.slice(0, 5).map(function (h) { return h + ' (' + source[h] + ')'; }).join(' · ') || '—' },
      ],
      sections: [
        {
          title: 'Chunks da página atual',
          note: 'Trechos do que o Cadu (OpenClaw) tem indexado: posts coletados, respostas de IA, mensagens Telegram, logs da pipeline.',
          columns: [
            { key: 'chunk', label: 'Chunk ID', width: 1 },
            { key: 'arquivo', label: 'Arquivo', width: 2 },
            { key: 'titulo', label: 'Título', width: 3 },
            { key: 'criado', label: 'Criado em', width: 1 },
            { key: 'trecho', label: 'Trecho (até 600 chars)', width: 5 },
          ],
          rows: rows,
          maxPdfRows: 200,
        },
      ],
    };
  }

  async function exportSitesPdf(btn) {
    var originalHtml = btn ? btn.innerHTML : '';
    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      }
      var report = buildSitesPdfReport();
      var date = new Date().toISOString().slice(0, 10);
      var filename = 'kc-cadu-sites-' + date + '.pdf';
      if (window.KCAdminExport && typeof window.KCAdminExport.exportReportPDF === 'function') {
        await window.KCAdminExport.exportReportPDF(filename, report);
      } else {
        showCaduError('KCAdminExport.exportReportPDF indisponível nesta página. Verifique se assets/js/controllers/admin/admin-export.shared.js foi carregado.');
      }
    } catch (err) {
      showCaduError('Erro ao exportar PDF: ' + (err && err.message ? err.message : err));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    }
  }

  async function exportFeedPdf(btn) {
    var originalHtml = btn ? btn.innerHTML : '';
    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      }
      var report = buildFeedPdfReport();
      var date = new Date().toISOString().slice(0, 10);
      var filename = 'kc-cadu-feed-' + date + '-p' + ((state.feedPage || 0) + 1) + '.pdf';
      if (window.KCAdminExport && typeof window.KCAdminExport.exportReportPDF === 'function') {
        await window.KCAdminExport.exportReportPDF(filename, report);
      } else {
        showCaduError('KCAdminExport.exportReportPDF indisponível nesta página. Verifique se assets/js/controllers/admin/admin-export.shared.js foi carregado.');
      }
    } catch (err) {
      showCaduError('Erro ao exportar PDF: ' + (err && err.message ? err.message : err));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    }
  }

  // ============================================================
  // Tabs + eventos (bindEvents continua abaixo)
  // ============================================================

  function bindEvents() {
    $$('.kc-cadu-tab').forEach(function (tab) {
      tab.addEventListener('click', function () { switchTab(tab.getAttribute('data-tab')); });
    });

    // KPI strip: cada botão leva à aba correspondente, opcionalmente aplicando um filtro.
    // data-kpi-tab: "sites" | "feed" | "pipeline" | "openclaw" | "" (status, não clicável)
    // data-kpi-filter: "all" | "ig=confirmed" | "tier=1" (opcional)
    $$('.kc-cadu-kpi[data-kpi-tab]').forEach(function (btn) {
      var tabName = btn.getAttribute('data-kpi-tab');
      if (!tabName) return; // kpi-api é status, não vira aba
      btn.addEventListener('click', function () {
        var filter = btn.getAttribute('data-kpi-filter') || '';
        if (tabName === 'sites' && filter) {
          state.sitesFilter = { q: '', tier: '', ig: '' };
          state.sitesOrigin = '';
          if (sitesSearch) sitesSearch.value = '';
          if (sitesTier) sitesTier.value = '';
          if (sitesIg) sitesIg.value = '';
          if (sitesOrigin) sitesOrigin.value = '';
          state.sitesView = 'sources';
          if (filter !== 'all') {
            var parts = filter.split('=');
            var field = parts[0];
            var value = parts[1];
            if (field === 'tier' && sitesTier) { sitesTier.value = value; state.sitesFilter.tier = value; }
            if (field === 'ig' && sitesIg) {
              sitesIg.value = value;
              state.sitesFilter.ig = value;
              if (state.catalogMode === 'registry') state.sitesView = 'instagram';
            }
          }
          if (sitesView) sitesView.value = state.sitesView;
          applySitesFilter();
        }
        switchTab(tabName);
      });
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
    var notifBell = $('#kcCaduActivityBell');
    var notifDropdown = $('#kcCaduActivityDropdown');
    if (notifBell && notifDropdown) {
      notifBell.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var isHidden = notifDropdown.hasAttribute('hidden');
        if (isHidden) {
          notifDropdown.removeAttribute('hidden');
          notifBell.setAttribute('aria-expanded', 'true');
          pollNotifActivity();
        } else {
          notifDropdown.setAttribute('hidden', '');
          notifBell.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('click', function (ev) {
        if (!notifDropdown.hasAttribute('hidden') &&
            !notifDropdown.contains(ev.target) &&
            ev.target !== notifBell) {
          notifDropdown.setAttribute('hidden', '');
          notifBell.setAttribute('aria-expanded', 'false');
        }
      });
    }
    var activityPipelineLink = $('#cadu-activity-pipeline-link');
    if (activityPipelineLink) {
      activityPipelineLink.addEventListener('click', function (event) {
        event.preventDefault();
        switchTab('pipeline');
        if (notifDropdown) notifDropdown.setAttribute('hidden', '');
        if (notifBell) notifBell.setAttribute('aria-expanded', 'false');
      });
    }

    // Poll leve do sidecar. Abas em segundo plano não geram tráfego operacional.
    setInterval(function () {
      if (document.hidden) return;
      // Poll silencioso: atualiza health e atividade recente quando a API está saudável.
      fetch('/api/cadu/health', { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) return;
          pollNotifActivity();
          var vp = $('#cadu-version-text');
          if (vp && data.version && vp.textContent !== 'v' + data.version) {
            vp.textContent = 'v' + data.version;
          }
          if (data.version && data.version !== state.lastVersion) {
            state.lastVersion = data.version;
            // Se a versão mudou (ex: Yan restartou cadu-api), refrescar pills
            var cp = $('#cadu-context-pill');
            if (cp && cp.style.display === 'none' && versionAtLeast(data.version, '0.4.6')) {
              pollNotifActivity();
            }
          }
        })
        .catch(function () {});
    }, 60000);

    // First poll (assíncrono, não bloqueia init)
    setTimeout(pollNotifActivity, 2000);

    var sitesSearch = $('#sites-search');
    var sitesTier = $('#sites-tier');
    var sitesIg = $('#sites-ig');
    var sitesView = $('#sites-view');
    var sitesOrigin = $('#sites-origin');
    sitesSearch.addEventListener('input', function () { state.sitesFilter.q = sitesSearch.value; applySitesFilter(); });
    sitesTier.addEventListener('change', function () { state.sitesFilter.tier = sitesTier.value; applySitesFilter(); });
    sitesIg.addEventListener('change', function () { state.sitesFilter.ig = sitesIg.value; applySitesFilter(); });
    if (sitesOrigin) sitesOrigin.addEventListener('change', function () { state.sitesOrigin = sitesOrigin.value; applySitesFilter(); });
    if (sitesView) sitesView.addEventListener('change', function () {
      state.sitesView = sitesView.value;
      if (state.sitesView !== 'sources') {
        state.sitesFilter.tier = '';
        state.sitesOrigin = '';
        if (sitesTier) sitesTier.value = '';
        if (sitesOrigin) sitesOrigin.value = '';
      }
      if (state.sitesView === 'deferred') {
        state.sitesFilter.ig = '';
        if (sitesIg) sitesIg.value = '';
      }
      applySitesFilter();
    });

    // OpenClaw (v0.4.3)
    var ocRefresh = $('#openclaw-refresh-btn');
    if (ocRefresh) ocRefresh.addEventListener('click', refreshOpenclaw);
    var ocForm = $('#openclaw-chat-form');
    if (ocForm) ocForm.addEventListener('submit', openclawSendChat);
    var ocHeartbeat = $('#openclaw-trigger-heartbeat-btn');
    if (ocHeartbeat) ocHeartbeat.addEventListener('click', openclawTriggerHeartbeat);
    var ocLogs = $('#openclaw-show-logs-btn');
    if (ocLogs) ocLogs.addEventListener('click', openclawShowLogs);
    var ocCloseLogs = $('#openclaw-close-logs-btn');
    if (ocCloseLogs) ocCloseLogs.addEventListener('click', openclawCloseLogs);
    var ocFocus = $('#openclaw-chat-focus-btn');
    if (ocFocus) ocFocus.addEventListener('click', function () { toggleOpenclawChatFocus(); });
    var ocSessionDetail = $('#openclaw-session-detail');
    if (ocSessionDetail) {
      ocSessionDetail.addEventListener('click', function (ev) {
        var target = ev.target && ev.target.closest ? ev.target.closest('button') : null;
        if (!target || !openclawState.selectedSession) return;
        if (target.id === 'openclaw-session-chat-btn') {
          openclawState.lastSessionId = getOpenclawSessionId(openclawState.selectedSession);
          setOpenclawActionStatus('Sessão <code>' + escapeHtml(fmtSessionId(openclawState.lastSessionId)) + '</code> pronta para o próximo envio no chat. O payload incluirá <code>session_id=' + escapeHtml(openclawState.lastSessionId) + '</code>.', 'ok');
          focusOpenclawChat();
        } else if (target.id === 'openclaw-session-resume-btn') {
          openclawState.lastSessionId = getOpenclawSessionId(openclawState.selectedSession);
          var input = $('#openclaw-chat-input');
          if (input) {
            input.value = 'Continue a sessão ' + openclawState.lastSessionId + '. Resuma o histórico/contexto recente disponível, diga o que ficou pendente e proponha o próximo passo operacional no KinoCampus/Cadu.';
          }
          setOpenclawActionStatus('Mensagem de continuação preparada com <code>session_id=' + escapeHtml(openclawState.lastSessionId) + '</code>. Enviando ao Cadu…', 'loading');
          openclawSendChat();
        } else if (target.id === 'openclaw-session-logs-btn') {
          openclawShowLogs({ session: openclawState.selectedSession });
        }
      });
    }
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
      downloadCsv('cadu-' + state.sitesView + '-' + new Date().toISOString().slice(0, 10) + '.csv', buildSitesCsvRows());
    });

    // Delegação: overrides explícitos e ações contextuais da tabela.
    var sitesTable = $('#sites-table');
    if (sitesTable) {
      sitesTable.addEventListener('click', function (e) {
        var saveBtn = e.target.closest && e.target.closest('.kc-cadu-save-source-btn');
        if (saveBtn) {
          saveSourceOverride(saveBtn.getAttribute('data-source-id') || '');
          return;
        }
        var btn = e.target.closest && e.target.closest('.kc-cadu-publish-btn');
        if (!btn) return;
        var sourceId = btn.getAttribute('data-source-id') || '';
        if (sourceId) {
          var mapped = state.allSites.find(function (site) { return site.sourceId === sourceId; });
          if (mapped) { publishSite(mapped); return; }
        }
        var key = btn.getAttribute('data-key') || '';
        var parts = key.split('|');
        var name = btn.getAttribute('data-name') || parts[0] || '';
        var url = parts[1] || '';
        var site = state.allSites.find(function (s) { return s.name === name && (s.url || '') === url; }) || { name: name, url: url, key: key };
        publishSite(site);
      });
      sitesTable.addEventListener('change', function (e) {
        var tierSelect = e.target.closest && e.target.closest('.kc-cadu-source-tier-select');
        if (!tierSelect) return;
        var sourceId = tierSelect.getAttribute('data-source-id') || '';
        var source = sourceById(sourceId);
        if (!source) return;
        var draft = ensureSourceDraft(source);
        if (tierSelect.value === '__unset__') {
          draft.tier = null;
          draft.tierTouched = false;
        } else {
          draft.tier = tierSelect.value === '' ? null : parseInt(tierSelect.value, 10);
          draft.tierTouched = true;
        }
        updateConflictFieldIntent(draft, 'tier', draft.tier !== source.overrideTier);
        renderSitesTable();
      });
      sitesTable.addEventListener('input', function (e) {
        var noteInput = e.target.closest && e.target.closest('.kc-cadu-source-note-input');
        if (!noteInput) return;
        var source = sourceById(noteInput.getAttribute('data-source-id') || '');
        if (source) {
          var draft = ensureSourceDraft(source);
          draft.note = noteInput.value;
          draft.noteTouched = true;
          updateConflictFieldIntent(draft, 'note', normalizedDraftNote(draft.note) !== source.note);
          updateSourceSaveButton(source, draft);
        }
      });
    }

    var feedSearch = $('#feed-search');
    feedSearch.addEventListener('input', function () { state.feedFilter.q = feedSearch.value; applyFeedFilter(); });

    var feedLimit = $('#feed-limit');
    feedLimit.addEventListener('change', function () {
      state.feedLimit = parseInt(feedLimit.value, 10) || FEED_PAGE_SIZE;
      state.feedPage = 0;
      loadFeed(true);
    });

    $('#feed-refresh-btn').addEventListener('click', function () { loadFeed(true); });
    var feedDiagRefresh = $('#feed-diagnostics-refresh-btn');
    if (feedDiagRefresh) feedDiagRefresh.addEventListener('click', loadFeedDiagnostics);
    var feedPrev = $('#feed-prev-page-btn');
    if (feedPrev) feedPrev.addEventListener('click', function () { loadFeedPage(state.feedPage - 1); });
    var feedNext = $('#feed-next-page-btn');
    if (feedNext) feedNext.addEventListener('click', function () { loadFeedPage(state.feedPage + 1); });
    var feedMore = $('#feed-load-more-btn');
    if (feedMore) feedMore.addEventListener('click', loadFeedMore);
    // pager bottom (espelha o topo)
    var feedPrevB = $('#feed-prev-page-btn-bottom');
    if (feedPrevB) feedPrevB.addEventListener('click', function () { loadFeedPage(state.feedPage - 1); });
    var feedNextB = $('#feed-next-page-btn-bottom');
    if (feedNextB) feedNextB.addEventListener('click', function () { loadFeedPage(state.feedPage + 1); });
    var feedMoreB = $('#feed-load-more-btn-bottom');
    if (feedMoreB) feedMoreB.addEventListener('click', loadFeedMore);
    // export PDF
    var sitesExportPdf = $('#sites-export-pdf');
    if (sitesExportPdf) sitesExportPdf.addEventListener('click', function () { exportSitesPdf(sitesExportPdf); });
    var feedExportPdf = $('#feed-export-pdf');
    if (feedExportPdf) feedExportPdf.addEventListener('click', function () { exportFeedPdf(feedExportPdf); });

    $('#cadu-refresh-btn').addEventListener('click', function () {
      refreshAll({ forceOperational: true });
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
      var registryPrefix = '/api/cadu/sites/source-registry';
      if (p === registryPrefix || p.indexOf(registryPrefix + '/') === 0) {
        return cfg.url + '/api/source-registry' + p.slice(registryPrefix.length);
      }
      var mapped = p.replace(/^\/api\/cadu\/?/, '/api/');
      return cfg.url + mapped;
    }
    if (cfg.url && cfg.url !== '/api/cadu' && /^\/api\/cadu(\/|$)/.test(p)) {
      return cfg.url + p.replace(/^\/api\/cadu/, '');
    }
    return p;
  }

  async function caduFetchRaw(path, opts) {
    var cfg = getCaduConfig();
    var headers = Object.assign({ 'Accept': 'application/json' }, (opts && opts.headers) || {});
    if (cfg.direct && cfg.token) {
      headers.Authorization = 'Bearer ' + cfg.token;
    } else if (!cfg.direct) {
      var adminToken = await getAdminAccessToken();
      if (adminToken) headers.Authorization = 'Bearer ' + adminToken;
    }
    return fetch(buildCaduApiUrl(path), Object.assign({}, opts || {}, { headers: headers }));
  }

  async function apiFetchResponse(path, opts) {
    var url = buildCaduApiUrl(path);
    var requestOptions = Object.assign({}, opts || {});
    var timeoutMs = Number(requestOptions.timeoutMs || 0);
    delete requestOptions.timeoutMs;
    var timeoutController = null;
    var timeoutId = null;
    var upstreamSignal = requestOptions.signal;
    var upstreamAbort = null;
    if (Number.isFinite(timeoutMs) && timeoutMs > 0 && typeof AbortController === 'function') {
      timeoutController = new AbortController();
      if (upstreamSignal) {
        upstreamAbort = function () { timeoutController.abort(upstreamSignal.reason); };
        if (upstreamSignal.aborted) upstreamAbort();
        else upstreamSignal.addEventListener('abort', upstreamAbort, { once: true });
      }
      requestOptions.signal = timeoutController.signal;
      timeoutId = setTimeout(function () { timeoutController.abort(); }, timeoutMs);
    }
    try {
      var res = await caduFetchRaw(path, requestOptions);
      var ct = res.headers.get('content-type') || '';
      var data = ct.indexOf('application/json') !== -1 ? await res.json() : await res.text();
      var envelope = {
        ok: res.ok,
        status: res.status,
        data: data,
        headers: {
          etag: res.headers.get('etag') || '',
          registrySha256: res.headers.get('x-cadu-registry-sha256') || '',
          registryOrigin: res.headers.get('x-cadu-registry-origin') || '',
          auditCutoff: res.headers.get('x-cadu-registry-audit-cutoff') || '',
          upstreamStatus: res.headers.get('x-cadu-upstream-status') || '',
          cacheControl: res.headers.get('cache-control') || ''
        }
      };
      if (!res.ok) {
        console.error('[cadu-api] ' + url + ' HTTP ' + res.status, data);
      }
      return envelope;
    } catch (e) {
      console.error('[cadu-api] ' + url + ' error:', e);
      return {
        ok: false,
        status: 0,
        data: null,
        headers: { etag: '', registrySha256: '', registryOrigin: '', auditCutoff: '', upstreamStatus: '', cacheControl: '' },
        message: String(e && e.message || e)
      };
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (upstreamSignal && upstreamAbort) upstreamSignal.removeEventListener('abort', upstreamAbort);
    }
  }

  async function apiFetch(path, opts) {
    var result = await apiFetchResponse(path, opts);
    if (!result.ok) {
      // Preserve the historical caller contract while registry consumers use
      // apiFetchResponse to retain strong ETag/hash response metadata.
      return {
        __error: true,
        status: result.status,
        data: result.data,
        message: result.message
      };
    }
    return result.data;
  }

  var pipelineStreamRequest = null;
  var pipelineLogPollState = null;

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

  function siteActionKey(site) {
    return String((site && site.name) || '') + '|' + String((site && site.url) || '');
  }

  function normalizeSiteUrl(url) {
    var raw = String(url || '').trim();
    if (!raw) return '';
    if (/^http:\/\//i.test(raw)) return raw.replace(/^http:\/\//i, 'https://');
    if (/^https:\/\//i.test(raw)) return raw;
    return '';
  }

  function normalizeInstagramUrl(handle) {
    var raw = String(handle || '').trim().replace(/^@/, '').replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, '');
    raw = raw.split(/[/?#]/)[0].trim();
    if (!raw) return '';
    return 'https://www.instagram.com/' + raw + '/';
  }

  function getSitePublishUrl(site) {
    return normalizeSiteUrl(site && site.url) || normalizeInstagramUrl(site && site.instagram);
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

  function isSafePipelineStageId(value) {
    return typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(value);
  }

  function isSafePipelineRunId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
  }

  function normalizePipelineRun(run) {
    if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
    if (!isSafePipelineRunId(run.id) || !isSafePipelineStageId(run.stage)) return null;
    var status = String(run.status || '');
    if (['pending', 'running', 'stopping', 'finished', 'failed', 'cancelled'].indexOf(status) === -1) return null;
    var startedAt = Number(run.started_at);
    var finishedAt = run.finished_at == null ? null : Number(run.finished_at);
    var exitCode = run.exit_code == null ? null : Number(run.exit_code);
    if (!Number.isFinite(startedAt) || startedAt <= 0) return null;
    if (finishedAt != null && (!Number.isFinite(finishedAt) || finishedAt < startedAt)) return null;
    if (exitCode != null && (!Number.isInteger(exitCode) || Math.abs(exitCode) > 1024)) exitCode = null;
    return {
      id: run.id,
      stage: run.stage,
      status: status,
      started_at: startedAt,
      finished_at: finishedAt,
      exit_code: exitCode,
      dry_run: typeof run.dry_run === 'boolean' ? run.dry_run : null,
      summary: run.summary && typeof run.summary === 'object' && !Array.isArray(run.summary) ? run.summary : null,
    };
  }

  function normalizePipelineStringList(values, maxItems, maxLength, identifiersOnly) {
    if (!Array.isArray(values) || values.length > maxItems) return null;
    var normalized = [];
    for (var index = 0; index < values.length; index += 1) {
      var value = values[index];
      if (typeof value !== 'string' || value.length > maxLength ||
          (identifiersOnly && !/^[a-z][a-z0-9_-]{0,63}$/.test(value))) return null;
      normalized.push(value);
    }
    return normalized;
  }

  function normalizePipelineCheck(check) {
    if (!check || typeof check !== 'object' || Array.isArray(check) ||
        !isSafePipelineStageId(check.id) || typeof check.label !== 'string' ||
        check.label.length > 160 || typeof check.detail !== 'string' ||
        check.detail.length > 1000 || typeof check.blocking !== 'boolean' ||
        ['ok', 'missing', 'warning', 'unchecked', 'error'].indexOf(check.status) < 0) return null;
    return {
      id: check.id,
      label: check.label,
      detail: check.detail,
      blocking: check.blocking,
      status: check.status,
    };
  }

  function normalizePipelineCheckList(values, maxItems) {
    if (!Array.isArray(values) || values.length > maxItems) return null;
    var normalized = [];
    var seen = Object.create(null);
    for (var index = 0; index < values.length; index += 1) {
      var check = normalizePipelineCheck(values[index]);
      if (!check || seen[check.id]) return null;
      seen[check.id] = true;
      normalized.push(check);
    }
    return normalized;
  }

  function normalizePipelinePreflight(preflight, stageId, nowMs) {
    if (!preflight || typeof preflight !== 'object' || Array.isArray(preflight) ||
        preflight.stage !== stageId || typeof preflight.can_run !== 'boolean' ||
        typeof preflight.command !== 'string' || !preflight.command.trim() ||
        preflight.command.length > 1500 || /[\u0000-\u001f\u007f]/.test(preflight.command)) return null;
    var checkedAt = Number(preflight.checked_at) * 1000;
    if (!Number.isFinite(checkedAt) || checkedAt > nowMs + 5000 ||
        nowMs - checkedAt > PIPELINE_SNAPSHOT_TTL_MS) return null;

    var profile = preflight.profile;
    if (!profile || typeof profile !== 'object' || Array.isArray(profile) ||
        ['low', 'medium', 'high', 'unknown'].indexOf(profile.risk) < 0 ||
        !isSafePipelineStageId(profile.mode) ||
        typeof profile.dry_run_available !== 'boolean' ||
        typeof profile.default_dry_run !== 'boolean' ||
        typeof profile.force_dry_run !== 'boolean' ||
        typeof profile.mutates_platform !== 'boolean') return null;
    var effects = normalizePipelineStringList(profile.effects, 32, 64, true);
    var notes = normalizePipelineStringList(profile.notes, 16, 500, false);
    if (!effects || !notes ||
        (profile.force_dry_run && !profile.dry_run_available) ||
        (profile.default_dry_run && !profile.dry_run_available)) return null;

    var checks = normalizePipelineCheckList(preflight.checks, 128);
    var blockers = normalizePipelineCheckList(preflight.blockers, 128);
    var warnings = normalizePipelineCheckList(preflight.warnings, 128);
    if (!checks || checks.length === 0 || !blockers || !warnings) return null;
    var derivedBlockers = checks.filter(function (check) {
      return check.blocking === true && check.status !== 'ok';
    });
    var derivedWarnings = checks.filter(function (check) {
      return check.blocking === false && ['missing', 'warning'].indexOf(check.status) >= 0;
    });
    function sameChecks(actual, expected) {
      if (actual.length !== expected.length) return false;
      return actual.every(function (check, index) {
        var source = expected[index];
        return check.id === source.id && check.label === source.label &&
          check.detail === source.detail && check.blocking === source.blocking &&
          check.status === source.status;
      });
    }
    if (!sameChecks(blockers, derivedBlockers) || !sameChecks(warnings, derivedWarnings) ||
        preflight.can_run !== (derivedBlockers.length === 0)) return null;

    var script = preflight.script;
    if (!script || typeof script !== 'object' || Array.isArray(script) ||
        typeof script.exists !== 'boolean' || typeof script.path !== 'string' ||
        !script.path || script.path.length > 1000 || typeof script.relative_path !== 'string' ||
        !script.relative_path || script.relative_path.length > 500) return null;
    var scriptCheck = checks.find(function (check) { return check.id === 'script'; });
    if (!scriptCheck || scriptCheck.blocking !== true ||
        scriptCheck.detail !== script.relative_path ||
        (script.exists && scriptCheck.status !== 'ok') ||
        (!script.exists && scriptCheck.status !== 'missing')) return null;
    var expectedCommandPrefix = 'node ' + script.relative_path;
    if (preflight.command !== expectedCommandPrefix &&
        preflight.command.indexOf(expectedCommandPrefix + ' ') !== 0) return null;

    return {
      stage: stageId,
      checked_at: checkedAt / 1000,
      can_run: preflight.can_run,
      command: preflight.command,
      profile: {
        risk: profile.risk,
        mode: profile.mode,
        dry_run_available: profile.dry_run_available,
        default_dry_run: profile.default_dry_run,
        force_dry_run: profile.force_dry_run,
        mutates_platform: profile.mutates_platform,
        effects: effects,
        notes: notes,
      },
      checks: checks,
      blockers: derivedBlockers,
      warnings: derivedWarnings,
      script: {
        exists: script.exists,
        path: script.path,
        relative_path: script.relative_path,
      },
    };
  }

  function normalizePipelineStage(stage, nowMs) {
    if (!stage || typeof stage !== 'object' || Array.isArray(stage) ||
        !isSafePipelineStageId(stage.id) || typeof stage.name !== 'string' ||
        stage.name.length > 120 || typeof stage.description !== 'string' ||
        stage.description.length > 500 || typeof stage.script !== 'string' ||
        stage.script.length > 500 || ['scan', 'process', 'publish', 'maintenance'].indexOf(stage.category) < 0) return null;
    var estimatedSeconds = Number(stage.estimated_sec);
    if (!Number.isFinite(estimatedSeconds) || estimatedSeconds < 0 || estimatedSeconds > 86400) return null;
    var lastRun = stage.last_run == null ? null : normalizePipelineRun(stage.last_run);
    if (stage.last_run != null && !lastRun) return null;
    var preflight = normalizePipelinePreflight(stage.preflight, stage.id, nowMs);
    if (!preflight || preflight.script.relative_path !== stage.script) return null;
    return {
      id: stage.id,
      name: stage.name,
      description: stage.description,
      script: stage.script,
      estimated_sec: estimatedSeconds,
      category: stage.category,
      last_run: lastRun,
      preflight: preflight,
    };
  }

  function normalizePipelineStageForDisplay(stage) {
    if (!stage || typeof stage !== 'object' || Array.isArray(stage) ||
        !isSafePipelineStageId(stage.id) || typeof stage.name !== 'string' ||
        !stage.name.trim() || stage.name.length > 120 || typeof stage.description !== 'string' ||
        stage.description.length > 500 || typeof stage.script !== 'string' ||
        stage.script.length > 500 || ['scan', 'process', 'publish', 'maintenance'].indexOf(stage.category) < 0) return null;
    var estimatedSeconds = Number(stage.estimated_sec);
    if (!Number.isFinite(estimatedSeconds) || estimatedSeconds < 0 || estimatedSeconds > 86400) return null;
    return {
      id: stage.id,
      name: stage.name,
      description: stage.description,
      script: stage.script,
      estimated_sec: estimatedSeconds,
      category: stage.category,
      last_run: stage.last_run == null ? null : normalizePipelineRun(stage.last_run),
      preflight: null,
    };
  }

  function pipelineStagesForDisplay(status) {
    if (!status || !Array.isArray(status.stages)) return [];
    var seen = Object.create(null);
    return status.stages.map(normalizePipelineStageForDisplay).filter(function (stage) {
      if (!stage || seen[stage.id]) return false;
      seen[stage.id] = true;
      return true;
    }).slice(0, 64);
  }

  function validatePipelineControlSnapshot(status, nowMs) {
    nowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
    if (!status || typeof status !== 'object' || Array.isArray(status)) return { ok: false, reason: 'payload ausente' };
    if (status.contract_version !== PIPELINE_CONTROL_CONTRACT) return { ok: false, reason: 'versão de contrato ausente ou incompatível' };
    var generatedAt = Date.parse(status.generated_at || '');
    if (!Number.isFinite(generatedAt)) return { ok: false, reason: 'timestamp do snapshot inválido' };
    if (generatedAt > nowMs + 5000 || nowMs - generatedAt > PIPELINE_SNAPSHOT_TTL_MS) {
      return { ok: false, reason: 'snapshot expirado ou com relógio inconsistente' };
    }
    var capabilities = status.capabilities;
    if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities) ||
        Object.keys(capabilities).sort().join('|') !== 'explicit_dry_run|explicit_run_mode_routes' ||
        capabilities.explicit_dry_run !== true || capabilities.explicit_run_mode_routes !== true) {
      return { ok: false, reason: 'capabilities explicitas ausentes' };
    }
    if (!Array.isArray(status.stages) || status.stages.length === 0 || status.stages.length > 64) {
      return { ok: false, reason: 'catálogo de estágios inválido' };
    }
    var seen = Object.create(null);
    var normalizedStages = [];
    for (var index = 0; index < status.stages.length; index += 1) {
      var stage = status.stages[index];
      if (!stage || !isSafePipelineStageId(stage.id) || seen[stage.id]) return { ok: false, reason: 'identidade de estágio inválida' };
      seen[stage.id] = true;
      var normalizedStage = normalizePipelineStage(stage, nowMs);
      if (!normalizedStage) return { ok: false, reason: 'preflight incompleto ou inválido para ' + stage.id };
      normalizedStages.push(normalizedStage);
    }
    return {
      ok: true,
      generatedAt: generatedAt,
      expiresAt: Math.min(nowMs + PIPELINE_SNAPSHOT_TTL_MS, generatedAt + PIPELINE_SNAPSHOT_TTL_MS),
      capabilities: {
        explicit_dry_run: true,
        explicit_run_mode_routes: true,
      },
      stages: normalizedStages,
    };
  }

  function pipelineControlIsReady(nowMs) {
    return state.pipelineControlReady === true &&
      (Number.isFinite(nowMs) ? nowMs : Date.now()) <= state.pipelineSnapshotExpiresAt;
  }

  function invalidatePipelineControl(reason) {
    state.pipelineControlReady = false;
    state.pipelineControlReason = String(reason || 'contrato de controle indisponível').slice(0, 240);
    state.pipelineSnapshotExpiresAt = 0;
    state.pipelineCapabilities = {};
  }

  async function performPipelineRefresh() {
    var requestGeneration = ++state.pipelineRequestGeneration;
    var status = await apiFetch('/api/cadu/pipeline', { timeoutMs: 5000 });
    if (requestGeneration !== state.pipelineRequestGeneration) return;
    if (!status || status.__error) {
      invalidatePipelineControl('falha ao atualizar o snapshot da pipeline');
      renderPipelineStages(state.pipelineStages || []);
      return;
    }
    var validation = validatePipelineControlSnapshot(status, Date.now());
    if (!validation.ok) {
      invalidatePipelineControl(validation.reason);
      state.pipelineStages = pipelineStagesForDisplay(status);
      state.pipelineActive = status.active_run == null ? null : normalizePipelineRun(status.active_run);
      state.pipelineHistory = Array.isArray(status.history)
        ? status.history.map(normalizePipelineRun).filter(Boolean).slice(0, 20)
        : [];
      renderPipelineStages(state.pipelineStages);
      renderPipelineActive(state.pipelineActive);
      renderPipelineHistory(state.pipelineHistory);
      updatePipelineBadge({ active_run: state.pipelineActive, history: state.pipelineHistory });
      if (status.health) renderPipelineHealth(status.health);
      else refreshPipelineHealth();
      return;
    }
    var normalizedStages = validation.stages;
    var normalizedActive = status.active_run == null ? null : normalizePipelineRun(status.active_run);
    var normalizedHistory = Array.isArray(status.history)
      ? status.history.map(normalizePipelineRun).filter(Boolean).slice(0, 20)
      : [];
    state.pipelineActive = normalizedActive;
    state.pipelineStages = normalizedStages;
    state.pipelineHistory = normalizedHistory;
    state.pipelineCapabilities = validation.capabilities;
    state.pipelineControlReady = true;
    state.pipelineControlReason = '';
    state.pipelineSnapshotExpiresAt = validation.expiresAt;
    state.pipelineHealth = status.health || state.pipelineHealth;
    try {
      renderPipelineStages(state.pipelineStages);
      renderPipelineActive(state.pipelineActive);
      if (status.health) renderPipelineHealth(status.health);
      else refreshPipelineHealth();
      renderPipelineHistory(state.pipelineHistory);
      updatePipelineBadge({ active_run: state.pipelineActive, history: state.pipelineHistory });
    } catch (error) {
      invalidatePipelineControl('snapshot rejeitado durante a renderização');
      state.pipelineStages = [];
      state.pipelineActive = null;
      state.pipelineHistory = [];
      renderPipelineStages([]);
      renderPipelineActive(null);
      renderPipelineHistory([]);
      disconnectPipelineStream();
      stopPipelineLogPolling();
      return;
    }

    // Se ha run ativo, acompanha por SSE curto ou polling para runs longos.
    if (state.pipelineActive && state.pipelineActive.status === 'running') {
      if (shouldUsePipelineLogPolling(state.pipelineActive)) {
        connectPipelineLogPolling(state.pipelineActive.id);
      } else {
        stopPipelineLogPolling();
        if (!pipelineStreamRequest || pipelineStreamRequest.runId !== state.pipelineActive.id) {
          connectPipelineStream(state.pipelineActive.id);
        }
      }
    } else {
      disconnectPipelineStream();
      stopPipelineLogPolling();
    }
  }

  function refreshPipeline() {
    if (document.hidden) return Promise.resolve({ skipped: 'hidden' });
    if (state.pipelineRefreshPromise) return state.pipelineRefreshPromise;
    state.pipelineRefreshPromise = performPipelineRefresh().finally(function () {
      state.pipelineRefreshPromise = null;
    });
    return state.pipelineRefreshPromise;
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

  // null significa que a API não oferece um contrato explícito para dry-run.
  // Nesse caso o campo deve ser omitido: backends antigos ignoravam extras e
  // poderiam executar de verdade mesmo recebendo { dry_run: true }.
  function resolvePipelineDryRun(profile, requestedDryRun, capabilities) {
    profile = profile || {};
    if (!capabilities || capabilities.explicit_dry_run !== true || capabilities.explicit_run_mode_routes !== true) return null;
    if (profile.force_dry_run === true) return true;
    if (requestedDryRun !== true && requestedDryRun !== false) return null;
    if (requestedDryRun === true && profile.dry_run_available !== true) return null;
    return requestedDryRun;
  }

  function buildPipelineRunRequest(stageId, dryRun, capabilities) {
    if (!capabilities || capabilities.explicit_dry_run !== true || capabilities.explicit_run_mode_routes !== true || typeof dryRun !== 'boolean') return null;
    var path = '/api/cadu/pipeline/run';
    if (typeof dryRun === 'boolean') {
      // Estas rotas não existem na API antiga. Se houver rollback entre o GET
      // de capabilities e este POST, o request falha com 404 em vez de uma
      // versão antiga ignorar dry_run=true e executar de verdade.
      path += dryRun ? '/dry-run' : '/real';
    }
    return { path: path, payload: { stage: stageId } };
  }

  function pipelineStageActionModes(profile, capabilities) {
    profile = profile || {};
    var supportsExplicitModes = Boolean(
      capabilities &&
      capabilities.explicit_dry_run === true &&
      capabilities.explicit_run_mode_routes === true
    );
    if (!supportsExplicitModes) return [];
    if (supportsExplicitModes && profile.force_dry_run === true) {
      return [{ dryRun: true, label: 'Simular', danger: false }];
    }
    if (supportsExplicitModes && profile.dry_run_available === true) {
      return [
        { dryRun: true, label: 'Dry-run', danger: false },
        { dryRun: false, label: profile.mutates_platform ? 'Executar real' : 'Executar', danger: Boolean(profile.mutates_platform) }
      ];
    }
    return [{
      dryRun: false,
      label: profile.mutates_platform ? 'Executar real' : 'Executar',
      danger: Boolean(profile.mutates_platform)
    }];
  }

  function lockPipelineActionButtons(clickedButton) {
    var parent = clickedButton && clickedButton.parentElement;
    var buttons = parent ? Array.prototype.slice.call(parent.querySelectorAll('.kc-pipeline-stage__btn')) : (clickedButton ? [clickedButton] : []);
    var originals = buttons.map(function (button) {
      return { button: button, disabled: button.disabled, html: button.innerHTML };
    });
    buttons.forEach(function (button) { button.disabled = true; });
    if (clickedButton) clickedButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Iniciando…';
    return function restorePipelineActionButtons() {
      originals.forEach(function (original) {
        original.button.disabled = original.disabled;
        original.button.innerHTML = original.html;
      });
    };
  }

  function stageChip(text, level) {
    return '<span class="kc-pipeline-stage__chip' + (level ? ' is-' + escapeHtml(level) : '') + '">' + escapeHtml(text) + '</span>';
  }

  function effectLabel(effect) {
    var labels = {
      workspace_artifacts: 'gera arquivos',
      supabase_read: 'lê Supabase',
      supabase_update: 'altera Supabase',
      supabase_insert: 'insere Supabase',
      edge_publish: 'publica feed',
      post_media_insert: 'adiciona mídia',
      browser_cdp: 'usa CDP',
      ig_seen_cache: 'cache IG',
      ai_api: 'usa IA',
      workspace_report: 'gera relatório',
      sigaa_login: 'login SIGAA',
      captcha_solver: 'captcha',
      google_calendar_write: 'altera Calendar'
    };
    return labels[effect] || effect;
  }

  function renderStagePreflight(s) {
    if (!s.preflight) {
      return '<div class="kc-pipeline-stage__preflight">' + stageChip('preflight indisponível', 'danger') +
        stageChip('somente leitura', 'warning') + '</div>' +
        '<div class="kc-pipeline-stage__script" title="' + escapeHtml(s.script || '') + '"><i class="fas fa-file-code"></i> ' + escapeHtml(s.script || 'script não informado') + '</div>';
    }
    var pf = s.preflight || {};
    var profile = pf.profile || {};
    var checks = pf.checks || [];
    var missing = checks.filter(function (check) { return check.status === 'missing'; });
    var level = pf.can_run === false ? 'danger' : (missing.length ? 'warning' : 'ok');
    var chips = [];
    chips.push(stageChip(pf.can_run === false ? 'bloqueado' : (missing.length ? 'atenção' : 'preflight ok'), level));
    chips.push(stageChip('risco ' + (profile.risk || 'n/d'), profile.risk === 'high' ? 'danger' : (profile.risk === 'medium' ? 'warning' : 'ok')));
    if (profile.mutates_platform) chips.push(stageChip(profile.default_dry_run ? 'dry-run padrão' : 'altera dados reais', profile.default_dry_run ? 'ok' : 'danger'));
    else chips.push(stageChip('sem mutação direta', 'ok'));
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
    if (m.publishable != null) parts.push('<span>publicáveis ' + escapeHtml(m.publishable) + '</span>');
    if (m.published != null) {
      var cls = (Number(m.published) === 0 && Number(m.publishable || 0) > 0) ? ' class="is-warning"' : '';
      parts.push('<span' + cls + '>publicados ' + escapeHtml(m.published) + '</span>');
    }
    if (m.updated != null) parts.push('<span>atualizados ' + escapeHtml(m.updated) + '</span>');
    if (m.discarded != null) parts.push('<span>descartados ' + escapeHtml(m.discarded) + '</span>');
    if (m.ig_profiles_ok != null || m.ig_profiles_failed != null) {
      var igFail = Number(m.ig_profiles_failed || 0);
      parts.push('<span' + (igFail ? ' class="is-warning"' : '') + '>IG perfis ' + escapeHtml(m.ig_profiles_ok || 0) + '/' + escapeHtml(igFail) + '</span>');
    }
    if (m.ig_new_posts != null) parts.push('<span>IG novos ' + escapeHtml(m.ig_new_posts) + '</span>');
    if (m.ig_relevant_posts != null) parts.push('<span>IG relevantes ' + escapeHtml(m.ig_relevant_posts) + '</span>');
    if (m.ig_seen_skipped != null) parts.push('<span>IG já vistos ' + escapeHtml(m.ig_seen_skipped) + '</span>');
    if (summary.duration_sec != null) parts.push('<span>' + escapeHtml(Math.round(Number(summary.duration_sec))) + 's</span>');
    if ((summary.warnings || []).length) parts.push('<span class="is-warning">avisos ' + summary.warnings.length + '</span>');
    return parts.length ? '<div class="kc-pipeline-history-item__summary">' + parts.join('') + '</div>' : '';
  }

  function renderPipelineStages(stages) {
    var container = $('#pipeline-stages-list');
    if (!container) return;
    var controlReady = pipelineControlIsReady();
    var controlGuard = controlReady ? '' : '<div class="kc-cadu-empty">Controles bloqueados: ' + escapeHtml(state.pipelineControlReason || 'snapshot expirado') + '</div>';
    if (!stages.length) {
      container.innerHTML = controlGuard + '<div class="kc-cadu-empty">O cadu-api não informou estágios seguros para exibição.</div>';
      return;
    }
    container.innerHTML = controlGuard + stages.map(function (s) {
      var lastTxt = '— sem runs —';
      var lastCls = '';
      if (s.last_run) {
        lastTxt = fmtAgo(s.last_run.started_at) + ' (' + (s.last_run.status || '') + ')';
        lastCls = 'is-' + (s.last_run.status || '');
      }
      var pf = s.preflight || {};
      var profile = pf.profile || {};
      var canRun = controlReady && pf && pf.can_run === true;
      var blockedReason = !controlReady
        ? (state.pipelineControlReason || 'snapshot expirado')
        : ((pf.blockers || []).map(function (b) { return b.detail || b.label || b.id; }).join(', ') || 'preflight falhou');
      var actionButtons = [];
      function actionButton(dryRun, label, danger) {
        var btnClass = 'kc-pipeline-stage__btn' + (danger ? ' is-danger' : '');
        var disabled = !canRun || state.pipelineStartPending;
        var btnTitle = state.pipelineStartPending
          ? 'Aguardando resposta da solicitação anterior'
          : (canRun ? label + ' ' + s.id : 'Indisponível: ' + blockedReason);
        var modeAttr = typeof dryRun === 'boolean' ? ' data-dry-run="' + dryRun + '"' : '';
        return '<button class="' + btnClass + '" data-stage="' + escapeHtml(s.id) + '"' + modeAttr + ' title="' + escapeHtml(btnTitle) + '"' + (disabled ? ' disabled' : '') + '>' +
          '<i class="fas ' + (dryRun === true ? 'fa-flask' : 'fa-play') + '"></i> ' + escapeHtml(label) +
        '</button>';
      }
      pipelineStageActionModes(profile, state.pipelineCapabilities).forEach(function (action) {
        actionButtons.push(actionButton(action.dryRun, action.label, action.danger));
      });
      if (!actionButtons.length) actionButtons.push(actionButton(null, 'Execução bloqueada', false));
      var lastSummary = s.last_run && s.last_run.summary ? renderRunSummary(s.last_run.summary) : '';
      return '<div class="kc-pipeline-stage">' +
        '<div class="kc-pipeline-stage__head"><i class="fas ' + categoryIcon(s.category) + '"></i><strong>' + escapeHtml(s.name) + '</strong></div>' +
        '<div class="kc-pipeline-stage__desc">' + escapeHtml(s.description) + '</div>' +
        renderStagePreflight(s) +
        '<div class="kc-pipeline-stage__meta">' +
          '<span class="kc-pipeline-history-item ' + lastCls + '" style="border:none;padding:2px 6px;"><i class="fas fa-clock"></i> ' + escapeHtml(lastTxt) + '</span>' +
          '<span style="margin-left:auto;">~' + escapeHtml(s.estimated_sec) + 's</span>' +
        '</div>' +
        lastSummary +
        '<div class="kc-pipeline-stage__actions">' + actionButtons.join('') + '</div>' +
      '</div>';
    }).join('');

    // Bind botões (delegação não funciona pq innerHTML é reescrito)
    $$('#pipeline-stages-list .kc-pipeline-stage__btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var requestedMode = btn.getAttribute('data-dry-run');
        runPipelineStage(
          btn.getAttribute('data-stage'),
          requestedMode === 'true' ? true : (requestedMode === 'false' ? false : null),
          btn
        );
      });
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
      if (logBox && (!pipelineStreamRequest) && (!pipelineLogPollState)) logBox.innerHTML = '<div class="kc-cadu-empty" style="padding:30px 0;">Aguardando início do run…</div>';
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
        (typeof active.dry_run === 'boolean' ? '<span><i class="fas ' + (active.dry_run ? 'fa-flask' : 'fa-database') + '"></i> ' + (active.dry_run ? 'simulação' : 'execução real') + '</span>' : '') +
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
    var failures = Number.isFinite(Number(health.failures_recent_count)) ? Math.max(0, Math.floor(Number(health.failures_recent_count))) : 0;
    var issues = Array.isArray(health.issues) ? health.issues.slice(0, 3) : [];
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
            '<button class="kc-pipeline-history-btn" data-action="export-pdf" data-run="' + r.id + '" title="Export visual em PDF"><i class="fas fa-file-pdf"></i></button>' +
            '<button class="kc-pipeline-history-btn kc-pipeline-history-btn--ask" data-action="ask-cadu" data-run="' + r.id + '" title="Perguntar ao Cadu sobre esta run"><i class="fas fa-robot"></i></button>' +
          '</div>';
      }
      return '<div class="kc-pipeline-history-item ' + cls + '" data-run-id="' + r.id + '">' +
        '<div class="kc-pipeline-history-item__head">' +
          '<strong>' + escapeHtml(r.stage) + '</strong>' +
          '<span style="font-size:.7rem;color:var(--kc-text-dark-secondary);">' + escapeHtml(r.status) + '</span>' +
        '</div>' +
        '<div class="kc-pipeline-history-item__id">' + r.id.slice(0, 8) + ' · ' + fmtAgo(r.started_at) + ' · ' + fmtDur(r.started_at, r.finished_at) + (typeof r.dry_run === 'boolean' ? (r.dry_run ? ' · simulação' : ' · execução real') : '') + (r.exit_code != null ? ' · exit ' + r.exit_code : '') + '</div>' +
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
        else if (action === 'export-pdf') exportRunPdf(runId, btn);
        else if (action === 'ask-cadu') askCaduAboutRun(runId);
      });
    });
  }

  function openRunDetailsModal(runId) {
    var modal = ensureRunDetailsModal();
    modal.body.innerHTML = '<div class="kc-cadu-empty"><i class="fas fa-spinner fa-spin"></i> Carregando artefatos…</div>';
    modal.title.textContent = 'Run ' + runId.slice(0, 8);
    modal.el.style.display = 'flex';
    // fetch artifacts + log tail in parallel
    Promise.all([
      apiFetch('/api/cadu/pipeline/' + runId + '/artifacts').then(function (r) { return r.data || r; }),
      apiFetch('/api/cadu/pipeline/' + runId + '/log?tail=80').then(function (r) { return r.data || r; }),
      apiFetch('/api/cadu/pipeline/' + runId + '/export').then(function (r) { return r.data || r; }),
    ]).then(function (res) {
      var arts = Array.isArray(res[0] && res[0].artifacts)
        ? res[0].artifacts.filter(function (artifact) { return artifact && typeof artifact === 'object'; }).slice(0, 200)
        : [];
      var log = String(res[1] && res[1].content || '').slice(0, 512000);
      var exp = res[2] && typeof res[2] === 'object' ? res[2] : {};
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
              ' <span style="color:var(--kc-text-dark-secondary);font-size:.7rem;">' + escapeHtml((Number(a.size_bytes) > 0 ? Number(a.size_bytes) / 1024 : 0).toFixed(1)) + ' KB</span>' +
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
          '<button class="kc-pipeline-history-btn" id="modal-export-pdf" data-run="' + runId + '"><i class="fas fa-file-pdf"></i> Export PDF</button>' +
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
      var pdfBtn = document.getElementById('modal-export-pdf');
      if (pdfBtn) pdfBtn.addEventListener('click', function () { exportRunPdf(runId, pdfBtn); });
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
    var objectUrl = '';
    var anchor = null;
    try {
      var path = '/api/cadu/pipeline/' + encodeURIComponent(runId) + '/log?download=1';
      var res = await caduFetchRaw(path, { headers: { 'Accept': 'text/plain' } });
      if (!res.ok) {
        var detail = await res.text().catch(function () { return ''; });
        throw new Error('HTTP ' + res.status + (detail ? ': ' + detail.slice(0, 160) : ''));
      }
      var blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);
      anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = 'pipeline-' + String(runId).replace(/[^a-zA-Z0-9_-]/g, '') + '.log';
      document.body.appendChild(anchor);
      anchor.click();
    } catch (err) {
      console.error('[cadu-api] download log falhou:', err);
      alert('Erro ao baixar log: ' + (err && err.message || err));
    } finally {
      if (anchor && anchor.parentNode) anchor.parentNode.removeChild(anchor);
      if (objectUrl) {
        setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
      }
    }
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

  function metricLabel(key) {
    var labels = {
      scanned: 'Itens escaneados',
      total_items: 'Itens totais',
      total: 'Total',
      publishable: 'Publicáveis',
      published: 'Publicados',
      formatted: 'Formatados',
      relevant: 'Relevantes',
      review: 'Em revisão',
      discarded: 'Descartados',
      duplicates: 'Duplicados',
      already_seen: 'Já vistos',
      ig_profiles: 'Perfis IG',
      ig_ok: 'Perfis IG OK',
      ig_failed: 'Perfis IG com falha',
      duration_sec: 'Duração (s)',
      exit_code: 'Exit code',
    };
    if (labels[key]) return labels[key];
    return String(key || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function exportValue(value) {
    if (value == null) return '—';
    if (typeof value === 'boolean') return value ? 'sim' : 'não';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '—';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') {
      try { return JSON.stringify(value); } catch (_) { return String(value); }
    }
    return String(value);
  }

  function statusPt(status) {
    var map = {
      finished: 'concluída',
      failed: 'falhou',
      running: 'rodando',
      cancelled: 'cancelada',
      queued: 'na fila',
      unknown: 'desconhecido',
    };
    return map[status] || status || 'desconhecido';
  }

  function buildPipelinePdfReport(data, runId) {
    var run = data.run || {};
    var metrics = data.summary_metrics || {};
    var warnings = data.summary_warnings || [];
    var artifacts = data.artifacts || [];
    var logLines = String(data.log_tail || '').split(/\r?\n/).filter(Boolean).slice(-60);
    var runStage = run.stage || data.stage || 'pipeline';
    var runStatus = run.status || data.status || 'unknown';
    var duration = run.started_at ? fmtDur(run.started_at, run.finished_at) : exportValue(data.summary && data.summary.duration_sec);
    var metricRows = Object.keys(metrics).sort().map(function (key) {
      return { chave: key, métrica: metricLabel(key), valor: exportValue(metrics[key]) };
    });
    var artifactRows = artifacts.map(function (a) {
      return {
        tipo: a.kind || 'other',
        arquivo: a.name || '',
        tamanho_kb: a.size_bytes != null ? (Number(a.size_bytes) / 1024).toFixed(1) : '',
        durante_run: a.produced_during_run ? 'sim' : 'não',
        observação: a.stale_for_run ? 'Arquivo anterior ao início desta run' : '',
      };
    });
    var warningRows = warnings.map(function (warning, index) {
      return { item: index + 1, aviso: warning };
    });
    var logRows = logLines.map(function (line, index) {
      return { linha: index + 1, mensagem: line };
    });

    return {
      title: 'KinoCampus - Relatório da Pipeline Cadu',
      subtitle: 'Resumo operacional da execução ' + runId.slice(0, 8) + ' no painel admin/cadu.html',
      source: 'admin/cadu.html — Histórico recente da Pipeline',
      filters: {
        run_id: runId,
        estágio: runStage,
        status: statusPt(runStatus),
      },
      kpis: [
        { label: 'Estágio', value: runStage, note: 'Stage executado' },
        { label: 'Status', value: statusPt(runStatus), note: run.exit_code != null ? ('exit ' + run.exit_code) : 'sem exit code' },
        { label: 'Duração', value: duration, note: fmtDate(run.started_at) + ' até ' + fmtDate(run.finished_at) },
        { label: 'Publicáveis', value: exportValue(metrics.publishable != null ? metrics.publishable : metrics.publicaveis), note: 'Itens aprovados para publicação' },
        { label: 'Publicados', value: exportValue(metrics.published), note: 'Posts efetivamente publicados' },
        { label: 'Artefatos', value: artifacts.length, note: 'Arquivos associados à run' },
      ],
      sections: [
        {
          title: 'Status da execução',
          note: 'Identificação e tempos principais da execução selecionada no histórico recente.',
          rows: [
            { campo: 'Run ID', valor: runId },
            { campo: 'Estágio', valor: runStage },
            { campo: 'Status', valor: statusPt(runStatus) },
            { campo: 'Exit code', valor: run.exit_code == null ? '—' : run.exit_code },
            { campo: 'Início', valor: fmtDate(run.started_at) },
            { campo: 'Fim', valor: fmtDate(run.finished_at) },
            { campo: 'Duração', valor: duration },
          ],
          columns: [{ key: 'campo', label: 'Campo' }, { key: 'valor', label: 'Valor' }],
          maxPdfRows: 12,
        },
        {
          title: 'Métricas',
          note: metricRows.length ? 'Métricas consolidadas extraídas do export operacional da pipeline.' : 'Nenhuma métrica foi detectada no export desta run.',
          rows: metricRows,
          pdfColumns: [{ key: 'métrica', label: 'Métrica' }, { key: 'valor', label: 'Valor' }],
          xlsxColumns: [{ key: 'chave', label: 'Chave técnica' }, { key: 'métrica', label: 'Métrica' }, { key: 'valor', label: 'Valor' }],
          maxPdfRows: 36,
        },
        {
          title: 'Avisos e riscos',
          note: warningRows.length ? 'Avisos registrados na execução.' : 'Sem avisos registrados nesta execução.',
          rows: warningRows,
          columns: [{ key: 'item', label: '#' }, { key: 'aviso', label: 'Aviso' }],
          maxPdfRows: 24,
        },
        {
          title: 'Artefatos',
          note: 'Arquivos localizados pelo cadu-api para auditoria, reprocessamento ou troubleshooting.',
          rows: artifactRows,
          pdfColumns: [
            { key: 'tipo', label: 'Tipo' },
            { key: 'arquivo', label: 'Arquivo' },
            { key: 'durante_run', label: 'Durante a run' },
          ],
          xlsxColumns: [
            { key: 'tipo', label: 'Tipo' },
            { key: 'arquivo', label: 'Arquivo' },
            { key: 'tamanho_kb', label: 'Tamanho (KB)' },
            { key: 'durante_run', label: 'Durante a run' },
            { key: 'observação', label: 'Observação' },
          ],
          maxPdfRows: 24,
        },
        {
          title: 'Log tail',
          note: 'Últimas linhas do log disponíveis no export. Use o botão de log completo para auditoria integral.',
          rows: logRows,
          pdfColumns: [{ key: 'linha', label: '#' }, { key: 'mensagem', label: 'Mensagem' }],
          maxPdfRows: 40,
        },
      ],
    };
  }

  function exportRunPdfFallback(data, runId) {
    var report = buildPipelinePdfReport(data, runId);
    var html = '<!doctype html><html><head><meta charset="utf-8"><title>Pipeline ' + escapeHtml(runId.slice(0, 8)) + '</title>' +
      '<style>body{font-family:Arial,sans-serif;color:#111;margin:28px;line-height:1.45}h1{font-size:22px;margin:0 0 8px}h2{font-size:15px;margin:24px 0 8px}table{width:100%;border-collapse:collapse;margin:8px 0 14px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;font-size:12px;vertical-align:top}th{background:#ff6b00;color:#fff}.muted{color:#666;font-size:12px}</style>' +
      '</head><body><h1>' + escapeHtml(report.title) + '</h1><p class="muted">' + escapeHtml(report.subtitle) + '</p>' +
      report.sections.map(function (section) {
        var columns = section.pdfColumns || section.columns || [];
        var rows = section.rows || [];
        var head = '<tr>' + columns.map(function (col) { return '<th>' + escapeHtml(col.label || col.key || col) + '</th>'; }).join('') + '</tr>';
        var body = rows.length ? rows.map(function (row) {
          return '<tr>' + columns.map(function (col) {
            var key = col.key || col;
            return '<td>' + escapeHtml(row[key]) + '</td>';
          }).join('') + '</tr>';
        }).join('') : '<tr><td>Sem dados.</td></tr>';
        return '<h2>' + escapeHtml(section.title) + '</h2><p class="muted">' + escapeHtml(section.note || '') + '</p><table>' + head + body + '</table>';
      }).join('') +
      '<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},250)})</script></body></html>';
    var w = window.open('', '_blank');
    if (!w) throw new Error('Pop-up bloqueado. Permita pop-ups para exportar PDF.');
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  async function exportRunPdf(runId, btn) {
    var originalHtml = btn ? btn.innerHTML : '';
    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      }
      var r = await apiFetch('/api/cadu/pipeline/' + runId + '/export');
      var data = r.data || r;
      if (!data || data.__error) throw new Error(data && (data.message || data.error) || 'export indisponível');
      if (window.KCAdminExport && typeof window.KCAdminExport.exportReportPDF === 'function') {
        var date = new Date().toISOString().slice(0, 10);
        await window.KCAdminExport.exportReportPDF('kc-cadu-pipeline-' + date + '-' + runId.slice(0, 8) + '.pdf', buildPipelinePdfReport(data, runId));
      } else {
        exportRunPdfFallback(data, runId);
      }
    } catch (err) {
      alert('Erro ao exportar PDF: ' + (err && err.message || err));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    }
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
    var stageCount = Array.isArray(state.pipelineStages) ? state.pipelineStages.length : 0;
    badge.textContent = running ? '● em execução' : String(stageCount);
    badge.title = running
      ? 'Há uma execução ativa'
      : stageCount + (stageCount === 1 ? ' estágio disponível' : ' estágios disponíveis');
  }

  function appendLogLine(text) {
    var logBox = $('#pipeline-log');
    if (!logBox) return;
    text = String(text == null ? '' : text).slice(0, 20000);
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
      logBox.innerHTML = '<div class="kc-cadu-empty" style="padding:30px 0;">Aguardando primeira linha de log…</div>';
      return;
    }
    lines.forEach(function (line) {
      var lineClass = 'kc-log-line';
      var lowText = String(line).toLowerCase();
      if (lowText.includes('error') || lowText.includes('failed') || lowText.includes('falhou')) lineClass += ' kc-log-line--err';
      else if (lowText.includes('ok') || lowText.includes('saved') || lowText.includes('concluido') || lowText.includes('concluído')) lineClass += ' kc-log-line--ok';
      var div = document.createElement('div');
      div.className = lineClass;
      div.textContent = line;
      logBox.appendChild(div);
    });
    if (wasAtBottom) logBox.scrollTop = logBox.scrollHeight;
  }

  async function refreshPipelineLogSnapshot(runId, pollState) {
    if (!pollState || pipelineLogPollState !== pollState || pollState.inFlight) return;
    pollState.inFlight = true;
    try {
      var res = await apiFetch('/api/cadu/pipeline/' + encodeURIComponent(runId) + '/log?tail=180');
      if (pipelineLogPollState !== pollState) return;
      if (!res || res.__error) {
        appendLogLine('[log polling] falha ao buscar tail do log');
        return;
      }
      renderPipelineLogSnapshot(res.content || '', '[log polling] atualizado ' + new Date().toLocaleTimeString('pt-BR'));
    } finally {
      if (pipelineLogPollState === pollState) pollState.inFlight = false;
    }
  }

  function connectPipelineLogPolling(runId) {
    disconnectPipelineStream();
    if (pipelineLogPollState && pipelineLogPollState.runId === runId) return;
    stopPipelineLogPolling();
    var pollState = { runId: runId, inFlight: false, timer: null };
    pipelineLogPollState = pollState;
    refreshPipelineLogSnapshot(runId, pollState);
    pollState.timer = setInterval(function () {
      if (pipelineLogPollState === pollState) refreshPipelineLogSnapshot(runId, pollState);
    }, 5000);
  }

  function stopPipelineLogPolling() {
    var pollState = pipelineLogPollState;
    pipelineLogPollState = null;
    if (pollState && pollState.timer) clearInterval(pollState.timer);
  }

  async function connectPipelineStream(runId) {
    stopPipelineLogPolling();
    disconnectPipelineStream();
    if (typeof AbortController !== 'function' || typeof TextDecoder !== 'function') {
      appendLogLine('[stream indisponível] acompanhando por polling autenticado');
      connectPipelineLogPolling(runId);
      return;
    }

    var controller = new AbortController();
    var request = { runId: runId, controller: controller };
    pipelineStreamRequest = request;
    var reader = null;
    try {
      var path = '/api/cadu/pipeline/' + encodeURIComponent(runId) + '/stream?follow=true';
      var res = await caduFetchRaw(path, {
        signal: controller.signal,
        headers: { 'Accept': 'text/event-stream', 'Cache-Control': 'no-cache' }
      });
      if (pipelineStreamRequest !== request) return;
      if (!res.ok || !res.body || typeof res.body.getReader !== 'function') {
        throw new Error('stream HTTP ' + res.status);
      }
      reader = res.body.getReader();
      var decoder = new TextDecoder('utf-8');
      var buffer = '';
      while (pipelineStreamRequest === request) {
        var chunk = await reader.read();
        if (pipelineStreamRequest !== request) return;
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        var parsed = splitSSEBuffer(buffer);
        buffer = parsed.remainder;
        for (var i = 0; i < parsed.blocks.length; i++) {
          if (parsed.blocks[i].length > 512 * 1024) {
            throw new Error('stream frame excedeu o limite local');
          }
          var event = parseSSEBlock(parsed.blocks[i]);
          if (event) handlePipelineSSEEvent(event);
          if (event && event.type === 'done') return;
        }
        if (buffer.length > 512 * 1024) {
          throw new Error('stream frame excedeu o limite local');
        }
      }
      if (buffer.trim()) {
        var finalEvent = parseSSEBlock(buffer);
        if (finalEvent) handlePipelineSSEEvent(finalEvent);
        if (finalEvent && finalEvent.type === 'done') return;
      }
      if (pipelineStreamRequest === request) {
        throw new Error('stream terminou antes do evento done');
      }
    } catch (err) {
      if (pipelineStreamRequest !== request || (err && err.name === 'AbortError')) return;
      console.warn('SSE via fetch falhou:', err);
      appendLogLine('[stream indisponível] acompanhando por polling autenticado');
      if (pipelineStreamRequest === request) pipelineStreamRequest = null;
      connectPipelineLogPolling(runId);
      setTimeout(function () { refreshPipeline(); }, 2000);
    } finally {
      if (reader) {
        try { await reader.cancel(); } catch (e) {}
      }
      if (pipelineStreamRequest === request) pipelineStreamRequest = null;
    }
  }

  function splitSSEBuffer(buffer) {
    var raw = String(buffer || '');
    var blocks = [];
    var cursor = 0;
    var delimiter = /\r\n\r\n|\n\n|\r\r/g;
    var match;
    while ((match = delimiter.exec(raw)) !== null) {
      blocks.push(raw.slice(cursor, match.index).replace(/\r\n/g, '\n').replace(/\r/g, '\n'));
      cursor = delimiter.lastIndex;
    }
    return { blocks: blocks, remainder: raw.slice(cursor) };
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
    if (!dataStr) return null;
    try {
      return { type: eventType, data: JSON.parse(dataStr) };
    } catch (e) { return null; }
  }

  function handlePipelineSSEEvent(event) {
    var d = event && event.data ? event.data : {};
    if (event.type === 'log' && d.line) appendLogLine(d.line);
    else if (event.type === 'done') {
      appendLogLine('— run finished (' + d.status + ', exit=' + d.exit_code + ') —');
      disconnectPipelineStream();
      refreshPipeline();
      pollNotifActivity();
    } else if (event.type === 'error') {
      appendLogLine('[error] ' + (d.message || ''));
    }
  }

  function disconnectPipelineStream() {
    if (pipelineStreamRequest) {
      var request = pipelineStreamRequest;
      pipelineStreamRequest = null;
      try { request.controller.abort(); } catch (e) {}
    }
  }

  async function runPipelineStage(stageId, dryRun, clickedButton) {
    if (state.pipelineStartPending) return;
    if (!pipelineControlIsReady()) {
      invalidatePipelineControl('snapshot expirado; atualize o painel');
      renderPipelineStages(state.pipelineStages || []);
      alert('Controles da pipeline bloqueados: o contrato/preflight está ausente ou expirou. Atualize o painel; nenhuma execução foi iniciada.');
      return;
    }
    var stage = findPipelineStage(stageId);
    var pf = stage && stage.preflight ? stage.preflight : null;
    if (!stage || !pf || pf.can_run !== true) {
      var blockers = ((pf && pf.blockers) || []).map(function (b) { return b.detail || b.label || b.id; }).join(', ') || 'preflight falhou';
      alert('Estágio indisponível: ' + blockers);
      return;
    }
    var profile = pf && pf.profile ? pf.profile : {};
    dryRun = resolvePipelineDryRun(profile, dryRun, state.pipelineCapabilities);
    if (typeof dryRun !== 'boolean') {
      alert('Modo de execução ausente ou inválido. Nenhum pipeline foi iniciado; atualize o painel e tente novamente.');
      return;
    }
    var warnings = pf ? (pf.warnings || []).map(function (w) { return '- ' + (w.label || w.id) + ': ' + (w.detail || w.status); }).join('\n') : '';
    var modeLabel = dryRun === true
      ? 'DRY-RUN EXPLÍCITO (sem mutação de plataforma)'
      : (dryRun === false ? 'EXECUÇÃO REAL' : 'MODO PADRÃO DO SERVIDOR (dry-run explícito indisponível)');
    var mutationNotice = dryRun === true
      ? '\n\nNenhuma mutação de plataforma foi solicitada.'
      : (profile.mutates_platform && (dryRun === false || !profile.default_dry_run)
        ? '\n\nATENÇÃO: esta execução pode alterar dados reais/plataforma.'
        : '\n\nO servidor aplicará o modo padrão deste estágio.');
    var msg = 'Iniciar pipeline "' + stageId + '"?\n\nComando: ' + (pf && pf.command ? pf.command : 'node ' + stageId) +
      '\nRisco: ' + (profile.risk || 'n/d') +
      '\nModo solicitado: ' + modeLabel +
      mutationNotice +
      (warnings ? '\n\nAvisos:\n' + warnings : '') +
      '\n\nLogs ficarão disponíveis em tempo real abaixo.';
    if (!confirm(msg)) return;
    if (!pipelineControlIsReady()) {
      invalidatePipelineControl('snapshot expirou durante a confirmação');
      renderPipelineStages(state.pipelineStages || []);
      alert('O snapshot expirou antes do envio. Nenhum pipeline foi iniciado; atualize o painel e tente novamente.');
      return;
    }
    var btn = clickedButton || $$('#pipeline-stages-list .kc-pipeline-stage__btn[data-stage="' + stageId + '"]')[0];
    state.pipelineStartPending = true;
    var restoreButtons = lockPipelineActionButtons(btn);
    var request = buildPipelineRunRequest(stageId, dryRun, state.pipelineCapabilities);
    if (!request) {
      state.pipelineStartPending = false;
      restoreButtons();
      invalidatePipelineControl('rota explícita de execução indisponível');
      renderPipelineStages(state.pipelineStages || []);
      alert('Rota explícita de execução indisponível. Nenhuma pipeline foi iniciada.');
      return;
    }
    var resp;
    try {
      resp = await apiFetch(request.path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request.payload),
      });
    } finally {
      state.pipelineStartPending = false;
      restoreButtons();
      // Um refresh pode ter substituído o grupo enquanto o POST aguardava.
      // Reconstrói o DOM atual para não deixar botões novos presos/desbloqueados.
      renderPipelineStages(state.pipelineStages || []);
    }
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
      if (resp.status === 404 && typeof dryRun === 'boolean') {
        msg = '🛡️ O modo explícito não está disponível nesta versão do cadu-api. Nenhum pipeline foi iniciado. Atualize o painel e confirme o deploy do backend.';
      } else if (resp.status === 409) {
        var detail = resp.data && (resp.data.detail || resp.data);
        var existingId = (detail && detail.existing_run_id) ? detail.existing_run_id.slice(0, 8) : '?';
        msg = '⛔ Já existe um run ativo para "' + stageId + '" (id ' + existingId + ').\n\nAguarde terminar ou pare-o via botão Parar antes de iniciar novo.';
      } else if (resp.status === 400 || resp.status === 422) {
        var validationDetail = resp.data && (resp.data.detail || resp.data);
        msg = '⚠️ Requisição recusada pelo cadu-api (HTTP ' + resp.status + '): ' +
          (typeof validationDetail === 'string' ? validationDetail : JSON.stringify(validationDetail || 'sem detalhe'));
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

  // O status do OpenClaw envolve CLI/SQLite no backend. Um minuto, singleflight
  // e suspensão em background evitam tempestades de processos por aba aberta.
  setInterval(function () {
    if (!document.hidden && state.currentTab === 'openclaw') refreshOpenclaw();
  }, OPENCLAW_POLL_INTERVAL_MS);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    if (state.currentTab === 'openclaw') refreshOpenclaw();
    if (state.currentTab === 'pipeline') refreshPipeline();
  });

  async function refreshAll(options) {
    var opts = options || {};
    var loading = $('#cadu-loading');
    if (loading) loading.style.display = 'flex';
    $('#cadu-status-pill').classList.add('is-loading');
    $('#cadu-status-pill').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando…';
    var operationalRefresh = Promise.resolve();
    if (state.currentTab === 'openclaw') {
      operationalRefresh = refreshOpenclaw({ force: opts.forceOperational === true });
    } else if (state.currentTab === 'pipeline') {
      operationalRefresh = refreshPipeline();
    }
    await Promise.all([
      checkHealth(),
      loadSites(),
      state.currentTab === 'feed' ? loadFeed(true) : Promise.resolve(),
      operationalRefresh,
    ]);
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

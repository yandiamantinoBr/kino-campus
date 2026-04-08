(function () {
  'use strict';

  /* Armazena os dados carregados para uso no export */
  let _data = null;
  let _auditOffset = 0;
  let _chartModalReturnFocus = null;
  var AUDIT_PAGE_SIZE = 20;
  var _exportBound = false;
  var _periodRefreshTimer = null;
  var _activeRefreshController = null;
  var _refreshRequestSeq = 0;
  var _rankingRequestSeq = 0;
  var _statusToastTimer = null;
  var _xlsxLoadPromise = null;
  var _jspdfLoadPromise = null;
  var PERIOD_CHANGE_DEBOUNCE_MS = 300;
  var SCRIPT_LOAD_TIMEOUT_MS = 8000;

  /* ── Cache de atores (actor_id → display info) ── */
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var _actorsById = {};
  var DashboardUtils = window.KCAdminDashboardUtils || {};
  var SERIES_META = [
    { key: 'posts_count', label: 'Posts', color: '#ff6b00', icon: 'fas fa-layer-group' },
    { key: 'comments_count', label: 'Comentários', color: '#0ea5e9', icon: 'fas fa-comment' },
    { key: 'searches_count', label: 'Buscas', color: '#8b5cf6', icon: 'fas fa-magnifying-glass' },
    { key: 'votes_count', label: 'Votos', color: '#10b981', icon: 'fas fa-thumbs-up' },
    { key: 'admin_actions_count', label: 'Ações admin', color: '#f97316', icon: 'fas fa-shield-halved' }
  ];
  var SERIES_KEYS = SERIES_META.map(function (series) { return series.key; });

  function $(sel, root) { return (root || document).querySelector(sel); }

  function getClient() {
    if (window.KCSupabase && typeof window.KCSupabase.getClient === 'function') return window.KCSupabase.getClient();
    return null;
  }

  function isPermissionError(error) {
    if (!error) return false;
    const message = String(error.message || error.details || error.hint || '').toLowerCase();
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
    var msg = String(error.message || error.hint || '').toLowerCase();
    return code === '42725' || msg.includes('is not unique') || msg.includes('ambiguous');
  }

  function toNumber(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function stabilizeHeaderActions() {
    var userActions = document.querySelector('.kc-header--admin .kc-user-actions');
    if (userActions) {
      userActions.style.visibility = 'visible';
      userActions.style.opacity = '1';
      userActions.style.pointerEvents = 'auto';
    }

    var themeToggle = document.querySelector('.kc-header--admin .theme-toggle');
    if (themeToggle) {
      themeToggle.style.visibility = 'visible';
      themeToggle.style.opacity = '1';
      themeToggle.disabled = false;
    }

    var loginBtn = document.querySelector('.kc-header--admin .btn-login');
    if (loginBtn) {
      loginBtn.style.visibility = 'visible';
      loginBtn.style.opacity = '1';
      loginBtn.style.pointerEvents = 'auto';
    }

    if (window.KCAdminShell && typeof window.KCAdminShell.syncHeader === 'function') {
      window.KCAdminShell.syncHeader();
    }
  }

  function showError(message) {
    const el = $('#admin-error');
    if (!el) return;
    el.textContent = String(message || 'Falha ao carregar dashboard.');
    el.style.display = 'block';
  }

  function clearError() {
    const el = $('#admin-error');
    if (!el) return;
    el.textContent = '';
    el.style.display = 'none';
  }

  function ensureStatusToast() {
    var el = document.getElementById('admin-dashboard-toast');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'admin-dashboard-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.position = 'fixed';
    el.style.right = '16px';
    el.style.bottom = '16px';
    el.style.zIndex = '10020';
    el.style.maxWidth = '320px';
    el.style.padding = '12px 14px';
    el.style.borderRadius = '12px';
    el.style.background = 'rgba(17,24,39,.94)';
    el.style.color = '#fff';
    el.style.boxShadow = '0 18px 50px rgba(15,23,42,.28)';
    el.style.fontSize = '.9rem';
    el.style.lineHeight = '1.4';
    el.style.display = 'none';
    document.body.appendChild(el);
    return el;
  }

  function hideStatusToast() {
    if (_statusToastTimer) {
      clearTimeout(_statusToastTimer);
      _statusToastTimer = null;
    }
    var el = document.getElementById('admin-dashboard-toast');
    if (!el) return;
    el.style.display = 'none';
    el.textContent = '';
  }

  function showStatusToast(message, tone, opts) {
    opts = opts || {};
    var el = ensureStatusToast();
    if (!el) return;
    if (_statusToastTimer) {
      clearTimeout(_statusToastTimer);
      _statusToastTimer = null;
    }
    el.textContent = String(message || '');
    el.style.display = 'block';
    el.style.background = tone === 'error'
      ? 'rgba(127,29,29,.96)'
      : tone === 'success'
        ? 'rgba(20,83,45,.96)'
        : 'rgba(17,24,39,.94)';
    if (!opts.sticky) {
      _statusToastTimer = setTimeout(hideStatusToast, opts.duration || 3200);
    }
  }

  function createAbortError() {
    var error = new Error('Dashboard refresh aborted.');
    error.name = 'AbortError';
    return error;
  }

  function throwIfAborted(signal) {
    if (signal && signal.aborted) throw createAbortError();
  }

  function setAuditLoadMoreState(options) {
    options = options || {};
    var btn = $('#admin-audit-load-more');
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

  function syncDailyActivityChartModal(series) {
    var modalChart = $('#admin-chart-modal-content');
    var modalLegend = $('#admin-chart-modal-legend');
    var modalMeta = $('#admin-chart-modal-meta');
    if (modalChart) {
      renderChartInto(modalChart, series, { width: 1024, height: 420, padding: 28, fontSize: 12 });
    }
    if (modalLegend) {
      modalLegend.innerHTML = Array.isArray(series) && series.length ? buildDailyActivityLegendMarkup(series) : '';
    }
    if (modalMeta) {
      if (Array.isArray(series) && series.length) {
        modalMeta.textContent = 'Período analisado: ' + getPeriodLabel((_data && _data.periodDays) || getSelectedPeriodDays()) +
          ' • ' + series.length + ' dias consolidados.';
      } else {
        modalMeta.textContent = 'Visualização detalhada da atividade consolidada por período.';
      }
    }
  }

  function setLoading(isLoading) {
    const loading = $('#admin-loading');
    if (loading) loading.style.display = isLoading ? 'flex' : 'none';
  }

  // Spinner no botão Atualizar durante refresh
  var _refreshOrigHtml = null;
  function setRefreshLoading(isLoading) {
    var btn = $('#admin-refresh-btn');
    if (!btn) return;
    if (isLoading) {
      _refreshOrigHtml = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';
      btn.classList.add('is-loading');
    } else {
      if (_refreshOrigHtml) btn.innerHTML = _refreshOrigHtml;
      btn.classList.remove('is-loading');
    }
  }

  // Marca/desmarca grids de métrica em estado de loading
  var GRID_IDS = ['admin-metrics', 'admin-activity-metrics', 'admin-community-metrics'];
  function setGridsLoading(isLoading) {
    GRID_IDS.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.classList.toggle('is-loading', isLoading);
    });
  }

  function setLastSync() {
    const el = $('#admin-last-sync');
    if (!el) return;
    el.innerHTML = '<i class="fas fa-circle-check" style="color:var(--kc-primary-brand);margin-right:5px;"></i>'
      + 'Atualizado em ' + new Date().toLocaleString('pt-BR')
      + ' &nbsp;<span style="opacity:.6;font-size:.78rem;">- clique para atualizar</span>';
  }

  async function checkAccess() {
    const user = await window.KCAPI.getCurrentUser();
    if (!user) return { ok: false, message: 'Faça login para acessar o dashboard administrativo.' };

    const client = getClient();
    if (!client) return { ok: false, message: 'Supabase client não disponível.' };

    const { data: profile, error } = await client
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (error || !profile || !profile.is_admin) {
      return { ok: false, message: 'Acesso restrito a moderadores/administradores.' };
    }

    return { ok: true };
  }

  function metricCard(icon, label, value, opts) {
    opts = opts || {};
    var href = opts.href || null;
    var highlight = opts.highlight && Number(value || 0) > 0;
    var subtitle = opts.subtitle || null;
    var cardStyle = highlight ? ' style="border-color:rgba(255,107,0,.5);"' : '';
    var inner = '<div class="kc-admin-card__label" title="' + escHtmlAdmin(label) + '">'
      + '<i class="' + icon + '"></i> ' + escHtmlAdmin(label) + '</div>'
      + '<strong>' + Number(value || 0) + '</strong>';
    if (subtitle) {
      inner += '<div style="font-size:.75rem;color:var(--kc-text-dark-secondary);margin-top:4px;">' + escHtmlAdmin(subtitle) + '</div>';
    }
    if (href) {
      inner += '<div style="margin-top:8px;"><a href="' + escHtmlAdmin(href) + '" style="font-size:.78rem;color:var(--kc-primary-brand);text-decoration:none;">Ver detalhes &rarr;</a></div>';
    }
    return '<article class="kc-admin-card"' + cardStyle + '>' + inner + '</article>';
  }

  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  }

  // ── Período selecionado ────────────────────────────────────────────────────
  function getSelectedPeriodDays() {
    var el = $('#admin-period-filter');
    return el ? parseInt(el.value, 10) || 30 : 30;
  }

  var PERIOD_LABELS = {
    1: 'hoje',
    7: 'esta semana',
    30: 'últimos 30 dias',
    90: 'últimos 90 dias',
    365: 'este ano',
  };

  function getPeriodLabel(days) {
    return PERIOD_LABELS[days] || ('últimos ' + days + ' dias');
  }

  function getPeriodShortLabel(days) {
    if (days === 1) return 'hoje';
    if (days === 7) return '7d';
    if (days === 365) return 'ano';
    return days + 'd';
  }

  function updateTitles(days) {
    var fullLabel = getPeriodLabel(days);
    var titles = [
      ['#admin-moderation-title', '<i class="fas fa-shield-halved"></i> Moderação (' + fullLabel + ')'],
      ['#admin-activity-title', '<i class="fas fa-chart-bar"></i> Atividade da plataforma (' + fullLabel + ')'],
      ['#admin-community-title', '<i class="fas fa-users"></i> Comunidade (' + fullLabel + ')'],
      ['#admin-trends-title', '<i class="fas fa-magnifying-glass-chart"></i> Tendências de busca (' + fullLabel + ')'],
      ['#admin-audit-title', '<i class="fas fa-clock-rotate-left"></i> Audit log (' + fullLabel + ')'],
      ['#admin-activity-pulse-title', '<i class="fas fa-wave-square"></i> Pulso diário (' + fullLabel + ')'],
      ['#admin-module-share-title', '<i class="fas fa-table-cells"></i> Top módulos (' + fullLabel + ')']
    ];

    titles.forEach(function (entry) {
      var el = $(entry[0]);
      if (el) el.innerHTML = entry[1];
    });
  }

  function getPeriodRange(periodDays) {
    return {
      since: daysAgo(periodDays),
      until: new Date().toISOString(),
      label: getPeriodLabel(periodDays)
    };
  }

  function formatDateTimeBR(value) {
    if (!value) return '-';
    var date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('pt-BR');
  }

  function formatDateBR(value) {
    if (!value) return '-';
    var date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('pt-BR');
  }

  function hexToRgb(hex) {
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

  // ── Normalização e agrupamento de termos de busca ─────────────────────────

  // Mapa de sinônimos: normaliza variações comuns para o termo canônico
  var SYNONYMS = {
    'celulares':    'celular',
    'smartphones':  'smartphone',
    'laptops':      'laptop',
    'notebooks':    'notebook',
    'quartos':      'quarto',
    'vagas':        'vaga',
    'livros':       'livro',
    'caronas':      'carona',
    'eventos':      'evento',
    'perdidos':     'perdido',
    'achados':      'achado',
    'chaves':       'chave',
    'iphones':      'iphone',
    'bolsas':       'bolsa',
    'casas':        'casa',
    'moveis':       'movel',
    'bicicletas':   'bicicleta',
    'fones':        'fone',
    'tablets':      'tablet',
    'monitores':    'monitor',
    'cadeiras':     'cadeira',
    'apostilas':    'apostila',
    'calculos':     'calculo',
    'documentos':   'documento',
    'oculos':       'oculos',
    'mochilas':     'mochila',
    'estagios':     'estagio',
    'republicanas': 'republica',
    'republicas':   'republica',
    'kitnets':      'kitnet',
    'apartamentos': 'apartamento',
    'emprego':      'vaga',
    'empregos':     'vaga',
  };

  function canonicalizeTerm(term) {
    // 1. Lowercase + remove acentos
    var norm = String(term || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (!norm) return '';
    // 2. Aplica mapa de sinônimos
    if (SYNONYMS[norm]) return SYNONYMS[norm];
    // 3. Stemming básico de plural: remove 's' final se palavra tem 5+ letras
    if (norm.length >= 5 && norm.endsWith('s') && !norm.endsWith('ss')) {
      var stem = norm.slice(0, -1);
      if (SYNONYMS[stem]) return SYNONYMS[stem];
      return stem;
    }
    return norm;
  }

  // ── Classificação de termos de busca por módulo ────────────────────────────
  var MODULE_KEYWORDS = {
    'compra-venda':     ['celular','smartphone','notebook','laptop','computador','roupa','movel','eletronico','venda','compro','iphone','tablet','monitor','cadeira','bicicleta','bike','fone','headphone','airpod','jbl','tv','geladeira','fogao','mesa','cama','colchao','camera','drone','video','game','calcado','tenis','maquina','impressora'],
    'moradia':          ['casa','quarto','republica','kitnet','apartamento','aluguel','moradia','dividir','alugar','imovel','vaga','hospedagem','room','flat','pensao','villaggio','morar','condominio','studio','andar'],
    'caronas':          ['carona','ida','volta','transporte','passagem','onibus','conducao','van','moto','buser','uber','99','indriver','carpool','boleia'],
    'eventos':          ['evento','palestra','workshop','semana','feira','festival','show','apresentacao','cerimonia','congresso','simposio','seminario','aula','minicurso','encontro','reuniao','hackathon','exposicao','teatro'],
    'oportunidades':    ['estagio','emprego','vaga','monitoria','bolsa','freelancer','trainee','trabalho','oportunidade','job','contratando','recrutamento','residencia','pesquisa','iniciacao','seletivo','curriculo','clf'],
    'achados-perdidos': ['perdido','achado','encontrei','perdi','carteira','chave','oculos','mochila','documento','identidade','rg','cpf','passaporte','cartao','anel','relogio','airpod','fone','chaves','perda','achou','celular perdido'],
    'livros':           ['livro','apostila','calculo','exatas','didatico','material','caderno','atlas','manual','engenharia','quimica','fisica','biologia','historia','matematica','literatura','pdf','estudo','prova','gabarito'],
  };

  // Pesos de correspondência: exata = 10, containment = 3, KC_CONSTANTS = 5
  var MODULE_ICONS = {
    'compra-venda':     'fas fa-layer-group',
    'moradia':          'fas fa-home',
    'caronas':          'fas fa-car',
    'eventos':          'fas fa-calendar-alt',
    'oportunidades':    'fas fa-briefcase',
    'achados-perdidos': 'fas fa-search',
    'livros':           'fas fa-book',
  };

  var MODULE_LABELS = {
    'compra-venda':     'Compra e Venda',
    'moradia':          'Moradia',
    'caronas':          'Caronas',
    'eventos':          'Eventos',
    'oportunidades':    'Oportunidades',
    'achados-perdidos': 'Achados/Perdidos',
    'livros':           'Livros',
  };

  function normalizeForClassify(str) {
    return String(str || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  function classifyTermToModule(term) {
    var norm = normalizeForClassify(canonicalizeTerm(term));
    if (!norm) return null;
    var bestModule = null;
    var bestScore = 0;
    var modules = Object.keys(MODULE_KEYWORDS);
    for (var i = 0; i < modules.length; i++) {
      var mod = modules[i];
      var keywords = MODULE_KEYWORDS[mod];
      var score = 0;
      for (var j = 0; j < keywords.length; j++) {
        var kw = normalizeForClassify(keywords[j]);
        if (norm === kw) { score += 10; break; }           // exact match — highest
        if (norm.indexOf(kw) !== -1) { score += 3; }       // term contains keyword
        else if (kw.indexOf(norm) !== -1) { score += 2; }  // keyword contains term
      }
      // Also check KC_CONSTANTS category labels if available
      if (score === 0 && window.KC_CONSTANTS && window.KC_CONSTANTS.CATEGORY_LABELS) {
        var cats = window.KC_CONSTANTS.CATEGORY_LABELS[mod];
        if (cats) {
          var catKeys = Object.keys(cats);
          for (var k = 0; k < catKeys.length; k++) {
            var ck = normalizeForClassify(catKeys[k]);
            if (norm === ck || norm.indexOf(ck) !== -1 || ck.indexOf(norm) !== -1) { score += 5; break; }
          }
        }
      }
      if (score > bestScore) { bestScore = score; bestModule = mod; }
    }
    return bestScore > 0 ? bestModule : null;
  }

  function aggregateTrendsByModule(trends) {
    var byModule = {};
    (trends || []).forEach(function(t) {
      var mod = classifyTermToModule(t.term);
      if (!mod) return;
      if (!byModule[mod]) byModule[mod] = { module: mod, count: 0, terms: [] };
      byModule[mod].count += Number(t.count) || 1;
      byModule[mod].terms.push(t.term);
    });
    return Object.values(byModule).sort(function(a, b) { return b.count - a.count; });
  }

  function renderSearchTrendsByModule(trends, periodDays) {
    var container = $('#admin-trends-modules');
    if (!container) return;
    var moduleData = aggregateTrendsByModule(trends);
    if (!moduleData.length) { container.style.display = 'none'; return; }
    container.style.display = 'flex';
    var periodLabel = getPeriodLabel(periodDays || 30);
    var titleHtml = '<div class="kc-trend-module-title" style="width:100%;"><i class="fas fa-table-cells"></i> Por módulo (' + escHtmlAdmin(periodLabel) + ')</div>';
    container.innerHTML = titleHtml + moduleData.map(function(m) {
      var icon = MODULE_ICONS[m.module] || 'fas fa-tag';
      var label = MODULE_LABELS[m.module] || m.module;
      var topTerms = m.terms.slice(0, 3).map(function(t) { return escHtmlAdmin(t); }).join(', ');
      return '<span class="kc-trend-module-badge" title="' + escHtmlAdmin(topTerms) + '">'
        + '<i class="' + icon + '"></i> ' + escHtmlAdmin(label)
        + '<span class="kc-badge-count">' + m.count + '</span>'
        + '</span>';
    }).join('');
  }

  // ── Moderação: Denúncias ────────────────────────────────────────────────────
  async function loadReportMetrics(client, since) {
    try {
      const rpc = await client.rpc('kc_admin_list_reports', { p_status: 'all', p_reason: 'all', p_limit: 2000 });
      if (!rpc.error && Array.isArray(rpc.data)) {
        var rows = rpc.data;
        // Filter by period
        var sinceMs = since ? new Date(since).getTime() : 0;
        if (sinceMs) {
          rows = rows.filter(function(r) {
            return r.created_at && new Date(r.created_at).getTime() >= sinceMs;
          });
        }
        const total = rows.length;
        const open  = rows.filter(r => String(r.status || '').toLowerCase() === 'open').length;
        return { open, total };
      }
    } catch (_) {}

    let open = 0, total = 0;
    try {
      var qOpen  = client.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open');
      var qTotal = client.from('reports').select('id', { count: 'exact', head: true });
      if (since) {
        qOpen  = qOpen.gte('created_at', since);
        qTotal = qTotal.gte('created_at', since);
      }
      const [openRes, totalRes] = await Promise.all([qOpen, qTotal]);
      open  = openRes.count  || 0;
      total = totalRes.count || 0;
    } catch (_) {}
    return { open, total };
  }

  // ── Moderação: Posts ocultos/deletados ──────────────────────────────────────
  async function loadPostStatusMetrics(client, since) {
    let hidden = 0, deleted = 0;
    try {
      var qHidden  = client.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'hidden');
      var qDeleted = client.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'deleted');
      // Filter by when the status was last updated (within period)
      if (since) {
        qHidden  = qHidden.gte('updated_at', since);
        qDeleted = qDeleted.gte('updated_at', since);
      }
      const [hiddenRes, deletedRes] = await Promise.all([qHidden, qDeleted]);

      if ((hiddenRes.error || deletedRes.error) &&
          (isPermissionError(hiddenRes.error) || isPermissionError(deletedRes.error))) {
        var fbQuery = client.from('posts').select('status, updated_at').in('status', ['hidden', 'deleted']).limit(2000);
        if (since) fbQuery = fbQuery.gte('updated_at', since);
        const fallback = await fbQuery;
        if (!fallback.error && Array.isArray(fallback.data)) {
          hidden  = fallback.data.filter(r => r.status === 'hidden').length;
          deleted = fallback.data.filter(r => r.status === 'deleted').length;
          return { hidden, deleted };
        }
      }

      hidden  = hiddenRes.count  || 0;
      deleted = deletedRes.count || 0;
    } catch (_) {}
    return { hidden, deleted };
  }

  // ── Atividade: Posts publicados (criados no período) ───────────────────────
  async function loadPostsCreated(client, since) {
    try {
      const res = await client.from('posts')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      if (!res.error) return res.count || 0;
      const fb = await client.from('posts').select('id').gte('created_at', since).limit(2000);
      if (!fb.error && Array.isArray(fb.data)) return fb.data.length;
    } catch (_) {}
    return 0;
  }

  // ── Atividade: Posts editados no período ───────────────────────────────────
  async function loadPostsEdited(client, since) {
    try {
      const res = await client.from('posts')
        .select('id', { count: 'exact', head: true })
        .gte('updated_at', since)
        .lt('created_at', since);
      if (!res.error) return res.count || 0;
      const fb = await client.from('posts')
        .select('id')
        .gte('updated_at', since)
        .lt('created_at', since)
        .limit(2000);
      if (!fb.error && Array.isArray(fb.data)) return fb.data.length;
    } catch (_) {}
    return 0;
  }

  // ── Atividade: Comentários no período ──────────────────────────────────────
  async function loadCommentsCount(client, since) {
    try {
      const res = await client.from('comments')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      if (!res.error) return res.count || 0;
      const fb = await client.from('comments').select('id').gte('created_at', since).limit(5000);
      if (!fb.error && Array.isArray(fb.data)) return fb.data.length;
    } catch (_) {}
    return 0;
  }

  // ── Atividade: Buscas no período ──────────────────────────────────────────
  async function loadSearchCount(client, since) {
    try {
      const res = await client.from('search_queries')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      if (!res.error) return res.count || 0;
      // Fallback: fetch rows and count
      const fb = await client.from('search_queries').select('created_at').gte('created_at', since).limit(5000);
      if (!fb.error && Array.isArray(fb.data)) return fb.data.length;
    } catch (_) {}
    return 0;
  }

  // ── Atividade: Total de posts ──────────────────────────────────────────────
  async function loadPostsTotal(client) {
    try {
      const res = await client.from('posts')
        .select('id', { count: 'exact', head: true });
      if (!res.error) return res.count || 0;
    } catch (_) {}
    return 0;
  }

  // ── Comunidade: Total de usuários ──────────────────────────────────────────
  async function loadUsersTotal(client) {
    try {
      const res = await client.from('profiles')
        .select('id', { count: 'exact', head: true });
      if (!res.error) return res.count || 0;
    } catch (_) {}
    return 0;
  }

  // ── Comunidade: Novos usuários no período ─────────────────────────────────
  async function loadUsersNew(client, since) {
    try {
      const res = await client.from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      if (!res.error) return res.count || 0;
    } catch (_) {}
    return 0;
  }

  // ── Comunidade: Votos no período ──────────────────────────────────────────
  async function loadVotesCount(client, since) {
    try {
      const res = await client.from('post_votes')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      if (!res.error) return res.count || 0;
    } catch (_) {}
    return 0;
  }

  // ── Comunidade: Posts salvos no período ───────────────────────────────────
  async function loadSavedPostsCount(client, since) {
    try {
      var q = client.from('saved_posts').select('id', { count: 'exact', head: true });
      if (since) q = q.gte('created_at', since);
      const res = await q;
      if (!res.error) return res.count || 0;
    } catch (_) {}
    return 0;
  }

  // ── Resolução de atores (actor_id → nome) ─────────────────────────────────
  async function loadActorsById(client, actorIds) {
    var ids = [];
    (actorIds || []).forEach(function(id) {
      var s = String(id || '');
      if (UUID_RE.test(s) && !_actorsById[s]) ids.push(s);
    });
    if (!ids.length) return;
    try {
      var res = await client.from('profiles')
        .select('id, display_name, full_name')
        .in('id', ids);
      if (!res.error && Array.isArray(res.data)) {
        res.data.forEach(function(row) {
          _actorsById[row.id] = {
            display_name: row.display_name || '',
            full_name: row.full_name || '',
          };
        });
      }
    } catch (_) {}
  }

  function getActorDisplay(actorId) {
    if (!actorId) return 'system';
    var actor = _actorsById[actorId];
    if (actor) {
      var name = actor.display_name || actor.full_name;
      if (name) return name;
    }
    // Fallback: show truncated UUID
    return String(actorId).slice(0, 8) + '...';
  }

  // ── Audit log ─────────────────────────────────────────────────────────────
  async function loadAuditLog(client, limit, offset, actionFilter, since) {
    limit = limit || AUDIT_PAGE_SIZE;
    offset = offset || 0;

    function filterRows(rows) {
      var sinceMs = since ? new Date(since).getTime() : 0;
      return (rows || []).filter(function (row) {
        if (!row) return false;
        if (actionFilter && actionFilter !== 'all' && row.action !== actionFilter) return false;
        if (sinceMs && row.created_at && new Date(row.created_at).getTime() < sinceMs) return false;
        return true;
      });
    }

    try {
      var query = client.from('audit_log')
        .select('created_at, action, entity_type, actor_id')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (actionFilter && actionFilter !== 'all') query = query.eq('action', actionFilter);
      if (since) query = query.gte('created_at', since);

      var res = await query;
      if (!res.error) return Array.isArray(res.data) ? res.data : [];
      if (!isPermissionError(res.error)) {
        console.warn('[Admin audit] Direct query failed:', res.error.message || res.error);
      }
    } catch (error) {
      console.warn('[Admin audit] Direct query exception:', error && error.message ? error.message : error);
    }

    try {
      var rpc = await client.rpc('kc_admin_list_audit_logs', {
        p_entity_type: 'all',
        p_action: actionFilter && actionFilter !== 'all' ? actionFilter : 'all',
        p_actor_query: null,
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
        p_entity_type: 'all',
        p_action: actionFilter && actionFilter !== 'all' ? actionFilter : 'all',
        p_actor_query: null,
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

  // Detecta se o erro é ambiguidade de sobrecarga de função (42725)
  async function loadAuditEventRows(client, since) {
    try {
      var query = client.from('audit_log')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1500);
      if (since) query = query.gte('created_at', since);
      var res = await query;
      if (!res.error && Array.isArray(res.data)) return res.data;
    } catch (_) {}

    try {
      var rpc = await client.rpc('kc_admin_list_audit_logs', {
        p_entity_type: 'all',
        p_action: 'all',
        p_actor_query: null,
        p_limit: 1500,
        p_offset: 0,
        p_since: since || null
      });
      if (!rpc.error && Array.isArray(rpc.data)) {
        return rpc.data.map(function (row) { return { created_at: row.created_at }; });
      }
    } catch (_) {}

    try {
      var legacy = await client.rpc('kc_admin_list_audit_logs', {
        p_entity_type: 'all',
        p_action: 'all',
        p_actor_query: null,
        p_limit: 1500
      });
      if (!legacy.error && Array.isArray(legacy.data)) {
        var sinceMs = since ? new Date(since).getTime() : 0;
        return legacy.data.filter(function (row) {
          return !sinceMs || (row.created_at && new Date(row.created_at).getTime() >= sinceMs);
        }).map(function (row) {
          return { created_at: row.created_at };
        });
      }
    } catch (_) {}

    return [];
  }

  // ── Tendências de busca (com timeout, fallback robusto e filtro de período) ──
  async function loadSearchTrendsData(client, since) {
    let trends = [];
    try {
      // Tentativa 1: RPC dedicado com timeout de 8s e filtro de período
      var rpcArgs = { p_limit: 20 };
      if (since) rpcArgs.p_since = since;
      var rpcPromise = client.rpc('kc_admin_search_trends', rpcArgs);
      var timeoutPromise = new Promise(function(_, reject) {
        setTimeout(function() { reject(new Error('timeout')); }, 8000);
      });
      var res;
      try {
        res = await Promise.race([rpcPromise, timeoutPromise]);
      } catch (rpcErr) {
        console.warn('[Admin trends] RPC falhou ou timeout:', rpcErr && rpcErr.message);
        res = { error: rpcErr };
      }

      if (!res.error && Array.isArray(res.data) && res.data.length > 0) {
        // RPC retorna termos já agrupados — aplica canonicalização e re-agrupa
        trends = canonicalizeTrendsList(res.data);
      } else {
        // Tentativa 2: query direta com filtro de período
        if (res.error) {
          var errMsg = res.error.message || String(res.error);
          // Ambiguidade de sobrecarga (42725) — avisa para aplicar migration v8.3.0.3
          if (isFunctionAmbiguityError(res.error)) {
            console.warn('[Admin trends] Ambiguidade de função (42725) — aplique a migration v8.3.0.3 no Supabase. Usando fallback direto.');
          } else {
            console.warn('[Admin trends] RPC error:', errMsg);
          }
        }
        var rawQuery = client.from('search_queries')
          .select('term')
          .order('created_at', { ascending: false })
          .limit(1000);
        if (since) rawQuery = rawQuery.gte('created_at', since);

        var raw = await rawQuery;

        if (!raw.error && Array.isArray(raw.data)) {
          trends = buildTrendsFromRows(raw.data);
        } else if (raw.error) {
          // Tentativa 3: query sem ordenação nem filtro (caso RLS bloqueie)
          console.warn('[Admin trends] Fallback direto falhou:', raw.error.message || raw.error);
          var raw2 = await client.from('search_queries').select('term').limit(500);
          if (!raw2.error && Array.isArray(raw2.data)) {
            trends = buildTrendsFromRows(raw2.data);
          } else if (raw2.error) {
            console.warn('[Admin trends] Todas as tentativas falharam:', raw2.error.message || raw2.error);
          }
        }
      }
    } catch (e) {
      console.error('[Admin trends] Erro inesperado:', e);
      trends = [];
    }
    return trends;
  }

  // Agrupa lista de rows {term} em [{term, count}] com canonicalização
  function buildTrendsFromRows(rows) {
    var freq = {};
    rows.forEach(function(r) {
      var canonical = canonicalizeTerm(r.term);
      if (canonical) freq[canonical] = (freq[canonical] || 0) + 1;
    });
    return Object.entries(freq)
      .sort(function(a, b) { return b[1] - a[1]; })
      .slice(0, 10)
      .map(function(e) { return { term: e[0], count: e[1] }; });
  }

  // Re-agrupa lista de {term, count} do RPC após canonicalização (merge plurais etc.)
  function canonicalizeTrendsList(list) {
    var freq = {};
    list.forEach(function(item) {
      var canonical = canonicalizeTerm(item.term);
      if (canonical) freq[canonical] = (freq[canonical] || 0) + (Number(item.count) || 1);
    });
    return Object.entries(freq)
      .sort(function(a, b) { return b[1] - a[1]; })
      .slice(0, 10)
      .map(function(e) { return { term: e[0], count: e[1] }; });
  }

  function renderSearchTrends(trends, periodDays) {
    const trendsList = $('#admin-trends-list');
    if (!trendsList) return;
    if (!trends || !trends.length) {
      trendsList.innerHTML = '<li class="kc-trend-empty">Nenhuma busca registrada ainda. As buscas feitas na plataforma aparecerão aqui.</li>';
      var modContainer = $('#admin-trends-modules');
      if (modContainer) modContainer.style.display = 'none';
      return;
    }
    const max = Math.max.apply(null, trends.map(function(t) { return Number(t.count) || 1; }).concat([1]));
    trendsList.innerHTML = trends.map(function(t, i) {
      const pct = Math.round(((Number(t.count) || 0) / max) * 100);
      var modKey = classifyTermToModule(t.term);
      var modBadge = modKey
        ? '<span style="font-size:.72rem;color:var(--kc-text-dark-secondary);margin-left:4px;" title="' + escHtmlAdmin(MODULE_LABELS[modKey] || modKey) + '"><i class="' + (MODULE_ICONS[modKey] || 'fas fa-tag') + '"></i></span>'
        : '';
      return '<li class="kc-trend-item">'
        + '<span class="kc-trend-rank">' + (i + 1) + '</span>'
        + '<span class="kc-trend-term">' + escHtmlAdmin(String(t.term || '')) + modBadge + '</span>'
        + '<div class="kc-trend-bar-wrap"><div class="kc-trend-bar" style="width:' + pct + '%"></div></div>'
        + '<span class="kc-trend-count">' + (Number(t.count) || 0) + '</span>'
        + '</li>';
    }).join('');
    // Renderiza classificação por módulo com período dinâmico
    renderSearchTrendsByModule(trends, periodDays);
  }

  async function queryCreatedAtRows(client, tableName, since, limit) {
    try {
      var query = client.from(tableName)
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(limit || 1500);
      if (since) query = query.gte('created_at', since);
      var res = await query;
      if (!res.error && Array.isArray(res.data)) return res.data;
    } catch (_) {}
    return [];
  }

  async function loadDailyMetrics(client, since, signal) {
    var until = new Date().toISOString();
    try {
      var rpc = await client.rpc('kc_admin_dashboard_daily_metrics', {
        p_since: since || null
      });
      if (!rpc.error && Array.isArray(rpc.data) && rpc.data.length) {
        if (DashboardUtils.buildDailyMetricsSeries) {
          return DashboardUtils.buildDailyMetricsSeries(rpc.data, since, until);
        }
        return rpc.data;
      }
      if (rpc.error && !(isFunctionMissing(rpc.error) || isFunctionAmbiguityError(rpc.error))) {
        console.warn('[Admin daily metrics] RPC failed:', rpc.error.message || rpc.error);
      }
    } catch (error) {
      console.warn('[Admin daily metrics] RPC exception:', error && error.message ? error.message : error);
    }

    var eventSets = await Promise.all([
      queryCreatedAtRows(client, 'posts', since, 1500),
      queryCreatedAtRows(client, 'comments', since, 1500),
      queryCreatedAtRows(client, 'search_queries', since, 1500),
      queryCreatedAtRows(client, 'post_votes', since, 1500),
      loadAuditEventRows(client, since)
    ]);
    throwIfAborted(signal);

    if (DashboardUtils.buildDailyMetricsFromEventSets) {
      return DashboardUtils.buildDailyMetricsFromEventSets({
        posts: eventSets[0],
        comments: eventSets[1],
        searches: eventSets[2],
        votes: eventSets[3],
        admin_actions: eventSets[4]
      }, since, until);
    }

    return [];
  }

  function renderDailyActivitySummary(summary) {
    var container = $('#admin-daily-activity-summary');
    if (!container) return;
    if (!summary) {
      container.innerHTML = '<div class="kc-admin-empty">Sem dados diários para resumir.</div>';
      return;
    }

    var peakLabel = summary.peakDay && summary.peakDay.label ? summary.peakDay.label : '--';
    container.innerHTML = [
      '<div class="kc-admin-kpi"><span class="kc-admin-kpi__label">Pico diário</span><strong>' + toNumber(summary.peakTotal) + '</strong><small>' + escHtmlAdmin(peakLabel) + '</small></div>',
      '<div class="kc-admin-kpi"><span class="kc-admin-kpi__label">Média diária</span><strong>' + escHtmlAdmin(String(summary.averageTotal || 0)) + '</strong><small>Eventos consolidados</small></div>',
      '<div class="kc-admin-kpi"><span class="kc-admin-kpi__label">Último dia</span><strong>' + toNumber(summary.lastDayTotal) + '</strong><small>Volume mais recente</small></div>',
      '<div class="kc-admin-kpi"><span class="kc-admin-kpi__label">Total de buscas</span><strong>' + toNumber(summary.totals && summary.totals.searches_count) + '</strong><small>Demanda registrada</small></div>'
    ].join('');
  }

  function buildSeriesPath(series, key, maxValue, width, height, padding) {
    var points = [];
    var innerWidth = width - (padding * 2);
    var innerHeight = height - (padding * 2);
    var step = series.length > 1 ? innerWidth / (series.length - 1) : innerWidth;
    var safeMax = Math.max(maxValue || 0, 1);

    series.forEach(function (row, index) {
      var value = toNumber(row[key]);
      var x = padding + (step * index);
      var y = padding + innerHeight - ((value / safeMax) * innerHeight);
      points.push((index === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2));
    });

    return points.join(' ');
  }

  function getSeriesTotals(series) {
    var totals = {};
    SERIES_META.forEach(function (meta) {
      totals[meta.key] = (series || []).reduce(function (sum, row) {
        return sum + toNumber(row && row[meta.key]);
      }, 0);
    });
    return totals;
  }

  function buildDailyActivityLegendMarkup(series) {
    var totals = getSeriesTotals(series);
    return SERIES_META.map(function (meta) {
      return '<span class="kc-admin-chart-legend__item">' +
        '<span class="kc-admin-chart-legend__dot" style="background:' + meta.color + ';"></span>' +
        '<span class="kc-admin-chart-legend__label"><i class="' + meta.icon + '"></i> ' + escHtmlAdmin(meta.label) + '</span>' +
        '<span class="kc-admin-chart-legend__total">' + toNumber(totals[meta.key]) + '</span>' +
        '</span>';
    }).join('');
  }

  function buildDailyActivityChartSvg(series, options) {
    options = options || {};
    var width = options.width || 640;
    var height = options.height || 240;
    var padding = options.padding || 22;
    var fontSize = options.fontSize || 10;
    var maxValue = 0;

    series.forEach(function (row) {
      SERIES_KEYS.forEach(function (key) {
        maxValue = Math.max(maxValue, toNumber(row[key]));
      });
    });

    var grid = [0.25, 0.5, 0.75, 1].map(function (ratio) {
      var y = padding + ((height - (padding * 2)) * (1 - ratio));
      return '<line x1="' + padding + '" y1="' + y.toFixed(2) + '" x2="' + (width - padding) + '" y2="' + y.toFixed(2) + '" stroke="rgba(148,163,184,.24)" stroke-dasharray="4 4"></line>';
    }).join('');

    var labels = series.map(function (row, index) {
      if (series.length > 14 && index % 2 === 1 && index !== series.length - 1) return '';
      var innerWidth = width - (padding * 2);
      var step = series.length > 1 ? innerWidth / (series.length - 1) : innerWidth;
      var x = padding + (step * index);
      return '<text x="' + x.toFixed(2) + '" y="' + (height - 6) + '" text-anchor="middle" fill="var(--kc-text-dark-secondary)" font-size="' + fontSize + '">' + escHtmlAdmin(row.label || '') + '</text>';
    }).join('');

    var lines = SERIES_META.map(function (meta) {
      return '<path d="' + buildSeriesPath(series, meta.key, maxValue, width, height, padding) + '" fill="none" stroke="' + meta.color + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path>';
    }).join('');

    return '<svg class="kc-admin-chart-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Gráfico diário de atividade">' +
      grid + lines + labels + '</svg>';
  }

  function renderChartInto(container, series, options) {
    if (!container) return;
    if (!Array.isArray(series) || !series.length) {
      container.innerHTML = '<div class="kc-admin-empty">Sem dados suficientes para montar o gráfico diário.</div>';
      return;
    }
    container.innerHTML = buildDailyActivityChartSvg(series, options);
  }

  function closeDailyActivityChartModal() {
    var modal = $('#admin-chart-modal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
    if (window.KCAdminShell && typeof window.KCAdminShell.setModalOpen === 'function') {
      window.KCAdminShell.setModalOpen(false);
    }
    if (_chartModalReturnFocus && typeof _chartModalReturnFocus.focus === 'function') {
      try { _chartModalReturnFocus.focus(); } catch (_) {}
    }
    _chartModalReturnFocus = null;
  }

  function openDailyActivityChartModal() {
    if (!_data || !Array.isArray(_data.dailyMetrics) || !_data.dailyMetrics.length) return;
    var modal = $('#admin-chart-modal');
    var closeBtn = $('#admin-chart-modal-close');
    if (!modal || !closeBtn) return;
    _chartModalReturnFocus = document.activeElement;
    syncDailyActivityChartModal(_data.dailyMetrics);
    modal.setAttribute('aria-hidden', 'false');
    if (window.KCAdminShell && typeof window.KCAdminShell.setModalOpen === 'function') {
      window.KCAdminShell.setModalOpen(true);
    }
    window.setTimeout(function () {
      try { closeBtn.focus(); } catch (_) {}
    }, 40);
  }

  function bindDailyActivityChartModal() {
    var expandBtn = $('#admin-chart-expand-btn');
    var closeBtn = $('#admin-chart-modal-close');
    var modal = $('#admin-chart-modal');

    if (expandBtn && !expandBtn.dataset.bound) {
      expandBtn.dataset.bound = 'true';
      expandBtn.addEventListener('click', openDailyActivityChartModal);
    }

    if (closeBtn && !closeBtn.dataset.bound) {
      closeBtn.dataset.bound = 'true';
      closeBtn.addEventListener('click', closeDailyActivityChartModal);
    }

    if (modal && !modal.dataset.bound) {
      modal.dataset.bound = 'true';
      modal.addEventListener('click', function (event) {
        if (event.target === modal) closeDailyActivityChartModal();
      });
    }

    if (!document.body.dataset.adminChartEscBound) {
      document.body.dataset.adminChartEscBound = 'true';
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeDailyActivityChartModal();
      });
    }
  }

  function renderDailyActivityChart(series) {
    var chart = $('#admin-daily-activity-chart');
    var legend = $('#admin-daily-activity-legend');
    var expandBtn = $('#admin-chart-expand-btn');
    if (!chart || !legend) return;

    if (!Array.isArray(series) || !series.length) {
      chart.innerHTML = '<div class="kc-admin-empty">Sem dados suficientes para montar o gráfico diário.</div>';
      legend.innerHTML = '';
      syncDailyActivityChartModal([]);
      if (expandBtn) expandBtn.disabled = true;
      closeDailyActivityChartModal();
      return;
    }

    renderChartInto(chart, series, { width: 640, height: 260, padding: 24, fontSize: 10 });
    legend.innerHTML = buildDailyActivityLegendMarkup(series);
    syncDailyActivityChartModal(series);
    if (expandBtn) expandBtn.disabled = false;
  }

  function renderModuleShareTable(rows) {
    var container = $('#admin-module-share-table');
    if (!container) return;
    if (!Array.isArray(rows) || !rows.length) {
      container.innerHTML = '<div class="kc-admin-empty">Sem buscas suficientes para calcular participação por módulo.</div>';
      return;
    }

    container.innerHTML = '<table><thead><tr><th>Módulo</th><th>Share</th><th>Volume</th></tr></thead><tbody>' +
      rows.map(function (row) {
        var topTerms = Array.isArray(row.topTerms) && row.topTerms.length ? row.topTerms.join(', ') : 'Sem termos associados';
        return '<tr>' +
          '<td><span style="display:inline-flex;align-items:center;gap:8px;"><i class="' + escHtmlAdmin(row.icon || 'fas fa-tag') + '"></i> ' + escHtmlAdmin(row.label || row.module || 'Módulo') + '</span><div style="margin-top:4px;font-size:.76rem;color:var(--kc-text-dark-secondary);">' + escHtmlAdmin(topTerms) + '</div></td>' +
          '<td>' + escHtmlAdmin(String(row.share || 0)) + '%</td>' +
          '<td>' + toNumber(row.count) + '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  function renderOperationalAlerts(alerts) {
    var container = $('#admin-operational-alerts');
    if (!container) return;
    if (!Array.isArray(alerts) || !alerts.length) {
      container.innerHTML = '<li class="kc-admin-empty">Nenhum alerta operacional no momento.</li>';
      return;
    }

    container.innerHTML = alerts.map(function (alert) {
      var toneClass = alert && alert.tone ? 'kc-admin-alert--' + alert.tone : 'kc-admin-alert--neutral';
      return '<li class="kc-admin-alert ' + toneClass + '">' +
        '<strong>' + escHtmlAdmin(alert.title || 'Atualização') + '</strong>' +
        '<p>' + escHtmlAdmin(alert.body || '') + '</p>' +
        '</li>';
    }).join('');
  }

  function auditActionBadge(action) {
    var a = String(action || '').toLowerCase();
    var cls = 'kc-audit-badge--default';
    var label = action || '-';
    if (a.includes('delet')) { cls = 'kc-audit-badge--deleted'; label = 'Deletado'; }
    else if (a.includes('hidden') || a.includes('oculto')) { cls = 'kc-audit-badge--hidden'; label = 'Ocultado'; }
    else if (a.includes('restored') || a.includes('restaur')) { cls = 'kc-audit-badge--restored'; label = 'Restaurado'; }
    else if (a.includes('report') || a.includes('closed')) { cls = 'kc-audit-badge--report'; label = 'Denúncia'; }
    else if (a.includes('status')) { cls = 'kc-audit-badge--hidden'; label = 'Status'; }
    return '<span class="kc-audit-badge ' + cls + '" title="' + escHtmlAdmin(action || '') + '">' + escHtmlAdmin(label) + '</span>';
  }

  function renderAuditRows(rows, append) {
    const auditBody = $('#admin-audit-body');
    if (!auditBody) return;
    if (append && (!rows || !rows.length)) {
      setAuditLoadMoreState({ visible: true, disabled: true, label: 'Fim do histórico', preserveLabel: true });
      return;
    }
    var html = rows.length
      ? rows.map(function(row) {
          var dateStr = row.created_at ? new Date(row.created_at).toLocaleString('pt-BR') : '-';
          var entity = String(row.entity_type || '-');
          // Trunca entity longa
          var entityDisplay = entity.length > 28 ? entity.slice(0, 25) + '...' : entity;
          return '<tr>'
            + '<td data-label="Data" style="white-space:nowrap;">' + escHtmlAdmin(dateStr) + '</td>'
            + '<td data-label="Ação">' + auditActionBadge(row.action) + '</td>'
            + '<td data-label="Entidade" title="' + escHtmlAdmin(entity) + '"><code>' + escHtmlAdmin(entityDisplay) + '</code></td>'
            + '<td data-label="Autor" title="' + escHtmlAdmin(row.actor_id || '') + '">' + escHtmlAdmin(getActorDisplay(row.actor_id)) + '</td>'
            + '</tr>';
        }).join('')
      : '<tr><td colspan="4" style="padding:20px 8px;"><p class="kc-empty" style="margin:0;color:var(--kc-text-dark-secondary);">Nenhum resultado.</p></td></tr>';

    if (append) {
      auditBody.insertAdjacentHTML('beforeend', html);
    } else {
      auditBody.innerHTML = html;
    }

    setAuditLoadMoreState({
      visible: true,
      disabled: rows.length < AUDIT_PAGE_SIZE,
      label: rows.length < AUDIT_PAGE_SIZE ? 'Fim do histórico' : null
    });
  }

  // ── Carregamento sob demanda de bibliotecas (local + CDN fallback) ────────
  var XLSX_URLS = [
    '../assets/vendor/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js',
  ];
  var JSPDF_URLS = [
    '../assets/vendor/jspdf.umd.min.js',
    'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
    'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js',
  ];

  function loadScript(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      var timer = null;
      var finished = false;
      function cleanup() {
        if (timer) clearTimeout(timer);
        s.onload = null;
        s.onerror = null;
      }
      function fail(error) {
        if (finished) return;
        finished = true;
        cleanup();
        try {
          if (s.parentNode) s.parentNode.removeChild(s);
        } catch (_) {}
        reject(error);
      }
      function succeed() {
        if (finished) return;
        finished = true;
        cleanup();
        resolve();
      }
      s.src = url;
      if (url.startsWith('http')) s.crossOrigin = 'anonymous';
      s.onload = succeed;
      s.onerror = function () { fail(new Error('Falha ao carregar: ' + url)); };
      timer = setTimeout(function () {
        fail(new Error('Timeout ao carregar: ' + url));
      }, timeoutMs || SCRIPT_LOAD_TIMEOUT_MS);
      document.head.appendChild(s);
    });
  }

  async function loadScriptWithFallback(urls, label) {
    var lastError;
    showStatusToast('Carregando biblioteca de exportação...', 'info', { sticky: true });
    try {
      for (var i = 0; i < urls.length; i++) {
        try {
          await loadScript(urls[i], SCRIPT_LOAD_TIMEOUT_MS);
          hideStatusToast();
          return;
        } catch (e) {
          lastError = e;
          console.warn('[CDN fallback] ' + e.message);
        }
      }
    } finally {
      if (!window.XLSX && !window.jspdf) {
        hideStatusToast();
      }
    }
    showStatusToast('Falha ao carregar ' + (label || 'a biblioteca de exportação') + ' após ' + urls.length + ' tentativas.', 'error', { duration: 4800 });
    throw lastError || new Error('Todas as fontes falharam.');
  }

  async function ensureXLSX() {
    if (window.XLSX) return;
    if (!_xlsxLoadPromise) {
      _xlsxLoadPromise = loadScriptWithFallback(XLSX_URLS, 'a biblioteca XLSX').finally(function () {
        if (!window.XLSX) _xlsxLoadPromise = null;
      });
    }
    await _xlsxLoadPromise;
  }

  async function ensureJsPDF() {
    if (window.jspdf) return;
    if (!_jspdfLoadPromise) {
      _jspdfLoadPromise = loadScriptWithFallback(JSPDF_URLS, 'a biblioteca jsPDF').finally(function () {
        if (!window.jspdf) _jspdfLoadPromise = null;
      });
    }
    await _jspdfLoadPromise;
  }

  // ── Exportação XLSX ──────────────────────────────────────────────────────────
  function buildSummarySheetRows(data, periodLabel, generatedAt) {
    return [
      ['KinoCampus - Dashboard Administrativo'],
      ['Gerado em', generatedAt],
      ['Período selecionado', periodLabel],
      ['Data inicial', formatDateBR(data.periodStart)],
      ['Data final', formatDateBR(data.periodEnd)],
      [],
      ['Seção', 'Métrica', 'Valor'],
      ['Moderação', 'Denúncias abertas', toNumber(data.reportMetrics && data.reportMetrics.open)],
      ['Moderação', 'Total de denúncias', toNumber(data.reportMetrics && data.reportMetrics.total)],
      ['Moderação', 'Posts ocultados', toNumber(data.postStatusMetrics && data.postStatusMetrics.hidden)],
      ['Moderação', 'Posts deletados', toNumber(data.postStatusMetrics && data.postStatusMetrics.deleted)],
      ['Atividade', 'Total de posts', toNumber(data.postsTotal)],
      ['Atividade', 'Posts publicados', toNumber(data.postsCreated)],
      ['Atividade', 'Posts editados', toNumber(data.postsEdited)],
      ['Atividade', 'Comentários', toNumber(data.commentsCount)],
      ['Atividade', 'Buscas realizadas', toNumber(data.searchCount)],
      ['Comunidade', 'Total de usuários', toNumber(data.usersTotal)],
      ['Comunidade', 'Novos usuários', toNumber(data.usersNew)],
      ['Comunidade', 'Votos', toNumber(data.votesCount)],
      ['Comunidade', 'Posts salvos', toNumber(data.savedPostsCount)],
      ['Pulso diário', 'Pico diário', toNumber(data.dailySummary && data.dailySummary.peakTotal)],
      ['Pulso diário', 'Média diária', data.dailySummary ? (data.dailySummary.averageTotal || 0) : 0],
      ['Pulso diário', 'Último dia', toNumber(data.dailySummary && data.dailySummary.lastDayTotal)],
      ['Pulso diário', 'Total de buscas', toNumber(data.dailySummary && data.dailySummary.totals && data.dailySummary.totals.searches_count)]
    ];
  }

  function buildTrendRows(data) {
    return [
      ['Posição', 'Termo', 'Buscas', 'Módulo'],
      ...(data.trends || []).map(function (item, index) {
        var moduleKey = classifyTermToModule(item && item.term);
        return [
          index + 1,
          item && item.term ? item.term : '',
          toNumber(item && item.count),
          moduleKey ? (MODULE_LABELS[moduleKey] || moduleKey) : ''
        ];
      })
    ];
  }

  function buildDailyRows(data) {
    return [
      ['Dia', 'Rótulo', 'Posts', 'Comentários', 'Buscas', 'Votos', 'Ações admin', 'Total'],
      ...(data.dailyMetrics || []).map(function (row) {
        return [
          row.day || '',
          row.label || '',
          toNumber(row.posts_count),
          toNumber(row.comments_count),
          toNumber(row.searches_count),
          toNumber(row.votes_count),
          toNumber(row.admin_actions_count),
          toNumber(row.total_count)
        ];
      })
    ];
  }

  function buildSeriesTotalsRows(data) {
    var totals = getSeriesTotals(data.dailyMetrics || []);
    return [
      ['Série', 'Total', 'Cor'],
      ...SERIES_META.map(function (meta) {
        return [meta.label, toNumber(totals[meta.key]), meta.color];
      })
    ];
  }

  function buildModuleRows(data) {
    return [
      ['Módulo', 'Share (%)', 'Volume', 'Top termos'],
      ...(data.moduleShareRows || []).map(function (row) {
        return [
          row.label || row.module || '',
          row.share || 0,
          toNumber(row.count),
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

  function buildAuditRows(data) {
    return [
      ['Data', 'Ação', 'Entidade', 'Autor'],
      ...(data.auditRows || []).map(function (row) {
        return [
          formatDateTimeBR(row && row.created_at),
          row && row.action ? row.action : '-',
          row && row.entity_type ? row.entity_type : '-',
          getActorDisplay(row && row.actor_id)
        ];
      })
    ];
  }

  async function exportXLSX(data) {
    await ensureXLSX();
    var XLSX = window.XLSX;
    var workbook = XLSX.utils.book_new();
    var generatedAt = formatDateTimeBR(new Date());
    var periodLabel = data.periodLabel || getPeriodLabel(data.periodDays || 30);

    var summarySheet = XLSX.utils.aoa_to_sheet(buildSummarySheetRows(data, periodLabel, generatedAt));
    summarySheet['!cols'] = [{ wch: 20 }, { wch: 28 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumo');

    var trendsSheet = XLSX.utils.aoa_to_sheet(buildTrendRows(data));
    trendsSheet['!cols'] = [{ wch: 8 }, { wch: 28 }, { wch: 10 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, trendsSheet, 'Tendências');

    var dailySheet = XLSX.utils.aoa_to_sheet(buildDailyRows(data));
    dailySheet['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(workbook, dailySheet, 'Pulso diário');

    var seriesSheet = XLSX.utils.aoa_to_sheet(buildSeriesTotalsRows(data));
    seriesSheet['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(workbook, seriesSheet, 'Séries');

    var modulesSheet = XLSX.utils.aoa_to_sheet(buildModuleRows(data));
    modulesSheet['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 42 }];
    XLSX.utils.book_append_sheet(workbook, modulesSheet, 'Top módulos');

    var alertsSheet = XLSX.utils.aoa_to_sheet(buildAlertRows(data));
    alertsSheet['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 64 }];
    XLSX.utils.book_append_sheet(workbook, alertsSheet, 'Alertas');

    var auditSheet = XLSX.utils.aoa_to_sheet(buildAuditRows(data));
    auditSheet['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 18 }, { wch: 26 }];
    XLSX.utils.book_append_sheet(workbook, auditSheet, 'Audit log');

    XLSX.writeFile(workbook, buildExportFilename('xlsx', data.periodDays));
  }

  // ── Exportação PDF ───────────────────────────────────────────────────────────
  async function exportPDF(data) {
    await ensureJsPDF();
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    var generatedAt = formatDateTimeBR(new Date());
    var periodLabel = data.periodLabel || getPeriodLabel(data.periodDays || 30);
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
        SERIES_KEYS.forEach(function (key) {
          maxValue = Math.max(maxValue, toNumber(row[key]));
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

      SERIES_META.forEach(function (meta) {
        var rgb = hexToRgb(meta.color);
        doc.setDrawColor(rgb.r, rgb.g, rgb.b);
        doc.setLineWidth(0.55);
        var prevPoint = null;
        series.forEach(function (row, index) {
          var step = series.length > 1 ? innerWidth / (series.length - 1) : innerWidth;
          var x = chartX + paddingHorizontal + (step * index);
          var value = toNumber(row[meta.key]);
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

      var totals = getSeriesTotals(series);
      var legendWidth = (usableWidth - 6) / 2;
      SERIES_META.forEach(function (meta, index) {
        checkPage(8);
        var rgb = hexToRgb(meta.color);
        var rowIndex = Math.floor(index / 2);
        var colIndex = index % 2;
        var x = margin + (colIndex * (legendWidth + 6));
        var itemY = y + (rowIndex * 6);
        doc.setFillColor(rgb.r, rgb.g, rgb.b);
        doc.circle(x + 2, itemY + 1.5, 1.3, 'F');
        doc.setFontSize(8);
        doc.setTextColor(31, 41, 55);
        doc.text(meta.label + ': ' + toNumber(totals[meta.key]), x + 6, itemY + 2.4);
      });
      y += Math.ceil(SERIES_META.length / 2) * 6 + 4;
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

    drawSectionHeader('Resumo executivo', 'Janela analisada de ' + formatDateBR(data.periodStart) + ' até ' + formatDateBR(data.periodEnd) + '.');
    drawMetricCards([
      { label: 'Denúncias abertas', value: toNumber(data.reportMetrics && data.reportMetrics.open), detail: periodLabel },
      { label: 'Total de denúncias', value: toNumber(data.reportMetrics && data.reportMetrics.total), detail: periodLabel },
      { label: 'Posts ocultados', value: toNumber(data.postStatusMetrics && data.postStatusMetrics.hidden), detail: periodLabel },
      { label: 'Posts deletados', value: toNumber(data.postStatusMetrics && data.postStatusMetrics.deleted), detail: periodLabel },
      { label: 'Buscas registradas', value: toNumber(data.searchCount), detail: periodLabel },
      { label: 'Votos', value: toNumber(data.votesCount), detail: periodLabel },
      { label: 'Novos usuários', value: toNumber(data.usersNew), detail: periodLabel },
      { label: 'Posts salvos', value: toNumber(data.savedPostsCount), detail: periodLabel }
    ]);

    drawSectionHeader('Pulso diário', 'Atividade consolidada por dia para posts, comentários, buscas, votos e ações administrativas.');
    drawDailyChart(data.dailyMetrics || []);

    drawWrappedList(
      'Top módulos por demanda',
      (data.moduleShareRows || []).map(function (row) {
        var topTerms = Array.isArray(row.topTerms) && row.topTerms.length ? ' | Termos: ' + row.topTerms.join(', ') : '';
        return (row.label || row.module || 'Módulo') + ' - ' + (row.share || 0) + '% - ' + toNumber(row.count) + ' buscas' + topTerms;
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
        var moduleKey = classifyTermToModule(item && item.term);
        return (index + 1) + '. ' + String((item && item.term) || '') + ' - ' + toNumber(item && item.count) +
          (moduleKey ? ' (' + (MODULE_LABELS[moduleKey] || moduleKey) + ')' : '');
      }),
      'Nenhuma busca registrada no período selecionado.'
    );

    drawSectionHeader('Audit log', 'Apêndice com os eventos administrativos carregados na tela para o período selecionado.');
    var auditLines = (data.auditRows || []).map(function (row) {
      return formatDateTimeBR(row && row.created_at) + ' | ' +
        String((row && row.action) || '-') + ' | ' +
        String((row && row.entity_type) || '-') + ' | ' +
        getActorDisplay(row && row.actor_id);
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

  // ── Habilita botões de exportação na toolbar ─────────────────────────────────
  function enableExport() {
    const xlsxBtn = $('#admin-export-xlsx');
    const pdfBtn  = $('#admin-export-pdf');
    if (xlsxBtn) xlsxBtn.disabled = !_data;
    if (pdfBtn) pdfBtn.disabled = !_data;
    if (_exportBound) return;
    _exportBound = true;

    if (xlsxBtn) {
      xlsxBtn.disabled = false;
      xlsxBtn.addEventListener('click', async () => {
        if (!_data) return;
        xlsxBtn.disabled = true;
        var origHtml = xlsxBtn.innerHTML;
        xlsxBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exportando...';
        try { await exportXLSX(_data); }
        catch (e) { console.error('[Admin export XLSX]', e); showError('Falha ao gerar XLSX. Verifique sua conexão e tente novamente.'); }
        finally { xlsxBtn.innerHTML = origHtml; xlsxBtn.disabled = false; }
      });
    }

    if (pdfBtn) {
      pdfBtn.disabled = false;
      pdfBtn.addEventListener('click', async () => {
        if (!_data) return;
        pdfBtn.disabled = true;
        var origHtml = pdfBtn.innerHTML;
        pdfBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exportando...';
        try { await exportPDF(_data); }
        catch (e) { console.error('[Admin export PDF]', e); showError('Falha ao gerar PDF. Verifique sua conexão e tente novamente.'); }
        finally { pdfBtn.innerHTML = origHtml; pdfBtn.disabled = false; }
      });
    }
  }

  function escHtmlAdmin(str) {
    return window.KCUtils.escapeHtml(String(str == null ? '' : str));
  }

  async function loadMetrics(options) {
    options = options || {};
    var signal = options.signal || null;
    const client = getClient();
    throwIfAborted(signal);
    if (!client) { showError('Supabase client não disponível.'); return; }

    var periodDays = getSelectedPeriodDays();
    var periodRange = getPeriodRange(periodDays);
    var since = periodRange.since;
    var shortLabel = getPeriodShortLabel(periodDays);
    var fullLabel  = periodRange.label;

    // Atualiza títulos das seções com o período selecionado
    var activityTitle = $('#admin-activity-title');
    if (activityTitle) {
      activityTitle.innerHTML = '<i class="fas fa-chart-bar"></i> Atividade da plataforma (' + fullLabel + ')';
    }
    var moderationTitle = $('#admin-moderation-title');
    if (moderationTitle) {
      moderationTitle.innerHTML = '<i class="fas fa-shield-halved"></i> Moderação (' + fullLabel + ')';
    }
    var communityTitle = $('#admin-community-title');
    if (communityTitle) {
      communityTitle.innerHTML = '<i class="fas fa-users"></i> Comunidade (' + fullLabel + ')';
    }
    var trendsTitle = $('#admin-trends-title');
    if (trendsTitle) {
      trendsTitle.innerHTML = '<i class="fas fa-magnifying-glass-chart"></i> Tendências de busca (' + fullLabel + ')';
    }
    var auditTitle = $('#admin-audit-title');
    if (auditTitle) {
      auditTitle.innerHTML = '<i class="fas fa-clock-rotate-left"></i> Audit log (' + fullLabel + ')';
    }

    // Carrega todas as métricas em paralelo para melhor performance
    stabilizeHeaderActions();
    updateTitles(periodDays);

    const [
      reportMetrics,
      postStatusMetrics,
      postsCreated,
      postsEdited,
      commentsCount,
      searchCount,
      postsTotal,
      usersTotal,
      usersNew,
      votesCount,
      savedPostsCount,
      auditRows,
      trends,
      dailyMetrics,
    ] = await Promise.all([
      loadReportMetrics(client, since),
      loadPostStatusMetrics(client, since),
      loadPostsCreated(client, since),
      loadPostsEdited(client, since),
      loadCommentsCount(client, since),
      loadSearchCount(client, since),
      loadPostsTotal(client),
      loadUsersTotal(client),
      loadUsersNew(client, since),
      loadVotesCount(client, since),
      loadSavedPostsCount(client, since),
      loadAuditLog(client, AUDIT_PAGE_SIZE, 0, 'all', since),
      loadSearchTrendsData(client, since),
      loadDailyMetrics(client, since, signal),
    ]);
    throwIfAborted(signal);

    _auditOffset = auditRows.length;

    // ── Resolve nomes dos atores do audit log ──
    await loadActorsById(client, auditRows.map(r => r.actor_id));
    throwIfAborted(signal);

    var moduleShareRows = DashboardUtils.buildModuleShareRows
      ? DashboardUtils.buildModuleShareRows(trends, window.KC_CONSTANTS || {})
      : [];
    var dailySummary = DashboardUtils.buildActivityPulseSummary
      ? DashboardUtils.buildActivityPulseSummary(dailyMetrics)
      : null;
    var alerts = DashboardUtils.buildOperationalAlerts
      ? DashboardUtils.buildOperationalAlerts({
          openReports: reportMetrics.open,
          hiddenPosts: postStatusMetrics.hidden,
          deletedPosts: postStatusMetrics.deleted,
          searches: searchCount,
          auditEvents: auditRows.length,
          peakTotal: dailySummary ? dailySummary.peakTotal : 0
        })
      : [];

    // ── Renderiza métricas de moderação ──
    throwIfAborted(signal);
    const metrics = $('#admin-metrics');
    if (metrics) {
      metrics.innerHTML = [
        metricCard('fas fa-flag',      'Denúncias abertas',  reportMetrics.open,          { href: 'reports.html', highlight: true, subtitle: fullLabel }),
        metricCard('fas fa-list',      'Total de denúncias', reportMetrics.total,         { href: 'reports.html', subtitle: fullLabel }),
        metricCard('fas fa-eye-slash', 'Posts ocultados',    postStatusMetrics.hidden,    { href: 'moderation.html', subtitle: fullLabel }),
        metricCard('fas fa-trash',     'Posts deletados',    postStatusMetrics.deleted,   { href: 'moderation.html', subtitle: fullLabel }),
      ].join('');
    }

    // ── Renderiza métricas de atividade ──
    const activityMetrics = $('#admin-activity-metrics');
    if (activityMetrics) {
      activityMetrics.innerHTML = [
        metricCard('fas fa-layer-group',      'Total de posts',    postsTotal),
        metricCard('fas fa-plus-circle',      'Posts publicados',  postsCreated),
        metricCard('fas fa-pen-to-square',    'Posts editados',    postsEdited),
        metricCard('fas fa-comment',          'Comentários',       commentsCount),
        metricCard('fas fa-magnifying-glass', 'Buscas',            searchCount),
      ].join('');
    }

    // ── Renderiza métricas da comunidade ──
    const communityMetrics = $('#admin-community-metrics');
    if (communityMetrics) {
      communityMetrics.innerHTML = [
        metricCard('fas fa-users',       'Total de usuários',                   usersTotal),
        metricCard('fas fa-user-plus',   'Novos usuários (' + shortLabel + ')', usersNew),
        metricCard('fas fa-thumbs-up',   'Votos (' + shortLabel + ')',          votesCount),
        metricCard('fas fa-bookmark',    'Posts salvos (' + shortLabel + ')',   savedPostsCount),
      ].join('');
    }

    // ── Renderiza audit log ──
    renderAuditRows(auditRows, false);

    // ── Renderiza tendências de busca ──
    renderSearchTrends(trends, periodDays);
    renderDailyActivitySummary(dailySummary);
    renderDailyActivityChart(dailyMetrics);
    renderModuleShareTable(moduleShareRows);
    renderOperationalAlerts(alerts);
    throwIfAborted(signal);

    _data = {
      reportMetrics, postStatusMetrics,
      postsCreated, postsEdited, commentsCount, searchCount, postsTotal,
      usersTotal, usersNew, votesCount, savedPostsCount,
      auditRows, trends, periodDays,
      dailyMetrics, dailySummary, moduleShareRows, alerts,
      periodLabel: fullLabel,
      periodStart: since,
      periodEnd: periodRange.until,
    };
    enableExport();

    setLastSync();
  }

  async function refreshDashboard() {
    if (_periodRefreshTimer) {
      clearTimeout(_periodRefreshTimer);
      _periodRefreshTimer = null;
    }
    if (_activeRefreshController) {
      _activeRefreshController.abort();
    }
    var controller = new AbortController();
    var requestSeq = ++_refreshRequestSeq;
    _activeRefreshController = controller;
    clearError();
    // Primeira carga: spinner principal; refreshes subsequentes: spinner no botão + opacidade nos grids
    var isFirstLoad = !_data;
    if (isFirstLoad) {
      setLoading(true);
    } else {
      setRefreshLoading(true);
      setGridsLoading(true);
    }
    try {
      await loadMetrics({ signal: controller.signal, requestSeq: requestSeq });
      throwIfAborted(controller.signal);
      await loadAdminRanking({ signal: controller.signal, requestSeq: requestSeq });
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      console.error('[Admin dashboard] refreshDashboard:', error);
      showError('Não foi possível atualizar o dashboard no momento.');
    } finally {
      if (_activeRefreshController === controller) {
        _activeRefreshController = null;
        setLoading(false);
        setRefreshLoading(false);
        setGridsLoading(false);
      }
    }
  }

  // ── Audit log: carregar mais ──────────────────────────────────────────────
  async function loadMoreAudit() {
    var client = getClient();
    if (!client) return;
    var filterEl = $('#admin-audit-filter');
    var actionFilter = filterEl ? filterEl.value : 'all';
    var periodDays = getSelectedPeriodDays();
    var since = getPeriodRange(periodDays).since;
    var btn = $('#admin-audit-load-more');
    setAuditLoadMoreState({ visible: true, disabled: true, label: 'Carregando...', preserveLabel: true });

    try {
      var rows = await loadAuditLog(client, AUDIT_PAGE_SIZE, _auditOffset, actionFilter, since);
      // Resolve actor names before rendering
      await loadActorsById(client, rows.map(r => r.actor_id));
      _auditOffset += rows.length;
      renderAuditRows(rows, true);
      if (rows.length < AUDIT_PAGE_SIZE) {
        setAuditLoadMoreState({ visible: true, disabled: true, label: 'Fim do histórico', preserveLabel: true });
      }
      // Append to _data for export
      if (_data && _data.auditRows) {
        _data.auditRows = _data.auditRows.concat(rows);
      }
    } catch (e) {
      console.error('[Admin audit] loadMore:', e);
      setAuditLoadMoreState({ visible: true, disabled: false });
    } finally {
      if (btn && btn.textContent === 'Carregando...') {
        setAuditLoadMoreState({ visible: true, disabled: false });
      }
    }
  }

  // ── Audit log: filtrar por ação ───────────────────────────────────────────
  async function filterAudit() {
    var client = getClient();
    if (!client) return;
    var filterEl = $('#admin-audit-filter');
    var actionFilter = filterEl ? filterEl.value : 'all';
    var periodDays = getSelectedPeriodDays();
    var since = getPeriodRange(periodDays).since;
    _auditOffset = 0;

    try {
      var rows = await loadAuditLog(client, AUDIT_PAGE_SIZE, 0, actionFilter, since);
      // Resolve actor names before rendering
      await loadActorsById(client, rows.map(r => r.actor_id));
      _auditOffset = rows.length;
      renderAuditRows(rows, false);
      if (!rows.length) {
        setAuditLoadMoreState({ visible: true, disabled: true, label: 'Sem mais resultados', preserveLabel: true });
      }
      if (_data) _data.auditRows = rows;
    } catch (e) {
      console.error('[Admin audit] filter:', e);
    }
  }

  async function boot() {
    setLoading(true);
    stabilizeHeaderActions();
    bindDailyActivityChartModal();
    const access = await checkAccess();
    if (!access.ok) {
      setLoading(false);
      showError(access.message);
      setTimeout(() => window.location.replace('../index.html'), 2500);
      return;
    }

    $('#admin-content').style.display = 'block';

    const refreshBtn = $('#admin-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshDashboard);

    // Last sync clicável também dispara atualização
    var lastSyncEl = $('#admin-last-sync');
    if (lastSyncEl) lastSyncEl.addEventListener('click', refreshDashboard);

    var loadMoreBtn = $('#admin-audit-load-more');
    if (loadMoreBtn) loadMoreBtn.addEventListener('click', loadMoreAudit);

    var auditFilter = $('#admin-audit-filter');
    if (auditFilter) auditFilter.addEventListener('change', filterAudit);

    // Period filter triggers full dashboard reload
    var periodFilter = $('#admin-period-filter');
    if (periodFilter) {
      periodFilter.addEventListener('change', function () {
        if (_periodRefreshTimer) clearTimeout(_periodRefreshTimer);
        if (_activeRefreshController) {
          var pendingController = _activeRefreshController;
          _activeRefreshController = null;
          pendingController.abort();
        }
        if (_data) {
          setRefreshLoading(true);
          setGridsLoading(true);
        } else {
          setLoading(true);
        }
        _periodRefreshTimer = window.setTimeout(function () {
          _periodRefreshTimer = null;
          refreshDashboard();
        }, PERIOD_CHANGE_DEBOUNCE_MS);
      });
    }

    bindAdminRanking();

    if (window.KCPullToRefresh && document.body.dataset.kcAdminPtrReady !== '1') {
      document.body.dataset.kcAdminPtrReady = '1';
      window.KCPullToRefresh.init({
        container: document.body,
        onRefresh: refreshDashboard,
      });
    }

    await refreshDashboard();
  }

  // ── Admin Ranking — Top Contribuidores ──────────────────────────────────────

  var _adminRankingExpanded = false;

  function mapPeriodToRanking(days) {
    if (days <= 1) return 'day';
    if (days <= 7) return 'week';
    return 'month';
  }

  async function loadAdminRanking(options) {
    options = options || {};
    var signal = options.signal || null;
    var tableEl = $('#admin-ranking-table');
    if (!tableEl) return;

    var api = window.KCAPI;
    if (!api || typeof api.getTopContributors !== 'function') {
      tableEl.innerHTML = '<div class="kc-admin-empty">API indisponível.</div>';
      return;
    }

    var periodDays = getSelectedPeriodDays();
    var period = mapPeriodToRanking(periodDays);
    var moduleFilter = $('#admin-ranking-module-filter');
    var module = moduleFilter ? (moduleFilter.value || null) : null;
    var limit = _adminRankingExpanded ? 100 : 10;
    var requestSeq = ++_rankingRequestSeq;

    tableEl.innerHTML = '<div class="kc-admin-empty"><i class="fas fa-spinner fa-spin"></i> Carregando ranking...</div>';

    try {
      var users = await api.getTopContributors(period, module, limit);
      if ((signal && signal.aborted) || requestSeq !== _rankingRequestSeq) return;
      var showAllBtn = $('#admin-ranking-show-all');
      if (!users || users.length === 0) {
        tableEl.innerHTML = '<div class="kc-admin-empty">Nenhum contribuidor encontrado no período.</div>';
        if (showAllBtn) showAllBtn.style.display = 'none';
        return;
      }

      var html = '<div class="kc-ranking-table-wrapper"><table class="kc-ranking-score-table">' +
        '<thead><tr>' +
          '<th>#</th><th>Usuário</th><th>Score</th><th title="Publicações"><i class="fas fa-file-alt"></i></th>' +
          '<th title="Votos"><i class="fas fa-thumbs-up"></i></th><th title="Comentários"><i class="fas fa-comment"></i></th>' +
          '<th title="Cupons"><i class="fas fa-ticket"></i></th><th title="Shares"><i class="fas fa-share-nodes"></i></th>' +
          '<th title="Penalidades"><i class="fas fa-flag"></i></th>' +
        '</tr></thead><tbody>';

      users.forEach(function (u) {
        var name = u.display_name || 'Usuário';
        var avatarSrc = u.avatar_url || '';
        var avatarHtml = avatarSrc
          ? '<img src="' + avatarSrc + '" style="width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle;" loading="lazy">'
          : '<i class="fas fa-user" style="font-size:0.8em;"></i>';
        html += '<tr>' +
          '<td style="font-weight:700;color:var(--kc-primary-brand);">' + u.rank + '</td>' +
          '<td style="display:flex;align-items:center;gap:6px;min-width:0;">' + avatarHtml +
            '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + name + '</span></td>' +
          '<td style="font-weight:700;">' + u.score + '</td>' +
          '<td>' + u.posts_count + '</td>' +
          '<td>' + u.votes_received + '</td>' +
          '<td>' + u.comments_count + '</td>' +
          '<td>' + u.coupon_clicks + '</td>' +
          '<td>' + u.share_count + '</td>' +
          '<td style="color:' + (u.penalties > 0 ? '#ef5350' : 'inherit') + ';">' + u.penalties + '</td>' +
        '</tr>';
      });
      html += '</tbody></table></div>';
      tableEl.innerHTML = html;

      if (showAllBtn) {
        if (!_adminRankingExpanded && users.length >= 10) {
          showAllBtn.style.display = 'block';
          showAllBtn.innerHTML = '<i class="fas fa-chevron-down"></i> Mostrar todos';
        } else if (_adminRankingExpanded) {
          showAllBtn.style.display = 'block';
          showAllBtn.innerHTML = '<i class="fas fa-chevron-up"></i> Mostrar top 10';
        } else {
          showAllBtn.style.display = 'none';
        }
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      if ((signal && signal.aborted) || requestSeq !== _rankingRequestSeq) return;
      tableEl.innerHTML = '<div class="kc-admin-empty">Erro ao carregar ranking.</div>';
      showStatusToast('Não foi possível atualizar o ranking agora.', 'error', { duration: 3600 });
    }
  }

  function bindAdminRanking() {
    var moduleFilter = $('#admin-ranking-module-filter');
    if (moduleFilter) moduleFilter.addEventListener('change', function () {
      _adminRankingExpanded = false;
      loadAdminRanking();
    });

    var showAllBtn = $('#admin-ranking-show-all');
    if (showAllBtn) showAllBtn.addEventListener('click', function () {
      _adminRankingExpanded = !_adminRankingExpanded;
      loadAdminRanking();
    });

    var infoBtn = $('#admin-ranking-info-btn');
    if (infoBtn) {
      infoBtn.addEventListener('click', function () {
        // Use kc-ranking.js ensureInfoModal if available, or create inline
        var modal = document.getElementById('kcRankingInfoModal');
        if (!modal && window.KCRanking) {
          // kc-ranking.js will auto-create on DOMContentLoaded if sidebar exists
          // Fallback: create simple alert
        }
        if (modal) {
          modal.setAttribute('aria-hidden', 'false');
        }
      });
    }
  }

  window.KCAdminDashboardRefresh = refreshDashboard;
  document.addEventListener('DOMContentLoaded', boot);
})();

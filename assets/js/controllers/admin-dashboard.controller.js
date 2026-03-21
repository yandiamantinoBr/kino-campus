(function () {
  'use strict';

  /* Armazena os dados carregados para uso no export */
  let _data = null;
  let _auditOffset = 0;
  var AUDIT_PAGE_SIZE = 20;

  /* ── Cache de atores (actor_id → display info) ── */
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var _actorsById = {};

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
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando…';
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
      + ' &nbsp;<span style="opacity:.6;font-size:.78rem;">— clique para atualizar</span>';
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
      inner += '<div style="margin-top:8px;"><a href="' + escHtmlAdmin(href) + '" style="font-size:.78rem;color:var(--kc-primary-brand);text-decoration:none;">Ver detalhes →</a></div>';
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
    return String(actorId).slice(0, 8) + '…';
  }

  // ── Audit log ─────────────────────────────────────────────────────────────
  async function loadAuditLog(client, limit, offset, actionFilter, since) {
    limit  = limit  || AUDIT_PAGE_SIZE;
    offset = offset || 0;
    try {
      var query = client.from('audit_log')
        .select('created_at, action, entity_type, actor_id')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (actionFilter && actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }
      if (since) {
        query = query.gte('created_at', since);
      }

      const res = await query;
      if (!res.error) return Array.isArray(res.data) ? res.data : [];

      if (isPermissionError(res.error)) {
        const rpc = await client.rpc('kc_admin_list_audit_logs', {
          p_entity_type: 'all',
          p_action: actionFilter && actionFilter !== 'all' ? actionFilter : 'all',
          p_actor_query: null,
          p_limit: limit,
        });
        if (!rpc.error && Array.isArray(rpc.data)) return rpc.data;
      }
    } catch (_) {}
    return [];
  }

  // Detecta se o erro é ambiguidade de sobrecarga de função (42725)
  function isFunctionAmbiguityError(error) {
    if (!error) return false;
    var code = String(error.code || '');
    var msg  = String(error.message || error.hint || '').toLowerCase();
    return code === '42725' || msg.includes('is not unique') || msg.includes('ambiguous');
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

  function auditActionBadge(action) {
    var a = String(action || '').toLowerCase();
    var cls = 'kc-audit-badge--default';
    var label = action || '—';
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
    var html = rows.length
      ? rows.map(function(row) {
          var dateStr = row.created_at ? new Date(row.created_at).toLocaleString('pt-BR') : '—';
          var entity = String(row.entity_type || '—');
          // Trunca entity longa
          var entityDisplay = entity.length > 20 ? entity.slice(0, 18) + '…' : entity;
          return '<tr>'
            + '<td data-label="Data" style="white-space:nowrap;">' + escHtmlAdmin(dateStr) + '</td>'
            + '<td data-label="Ação">' + auditActionBadge(row.action) + '</td>'
            + '<td data-label="Entidade" title="' + escHtmlAdmin(entity) + '"><code>' + escHtmlAdmin(entityDisplay) + '</code></td>'
            + '<td data-label="Autor" title="' + escHtmlAdmin(row.actor_id || '') + '">' + escHtmlAdmin(getActorDisplay(row.actor_id)) + '</td>'
            + '</tr>';
        }).join('')
      : '<tr><td colspan="4" style="color:var(--kc-text-dark-secondary);padding:20px 8px;">Nenhum evento encontrado.</td></tr>';

    if (append) {
      auditBody.insertAdjacentHTML('beforeend', html);
    } else {
      auditBody.innerHTML = html;
    }

    // Hide "load more" if fewer results than page size
    var loadMoreBtn = $('#admin-audit-load-more');
    if (loadMoreBtn) {
      loadMoreBtn.style.display = rows.length < AUDIT_PAGE_SIZE ? 'none' : '';
    }
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
  ];

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      if (url.startsWith('http')) s.crossOrigin = 'anonymous';
      s.onload  = resolve;
      s.onerror = function () { reject(new Error('Falha ao carregar: ' + url)); };
      document.head.appendChild(s);
    });
  }

  async function loadScriptWithFallback(urls) {
    var lastError;
    for (var i = 0; i < urls.length; i++) {
      try { await loadScript(urls[i]); return; }
      catch (e) { lastError = e; console.warn('[CDN fallback] ' + e.message); }
    }
    throw lastError || new Error('Todas as fontes falharam.');
  }

  async function ensureXLSX() { if (!window.XLSX) await loadScriptWithFallback(XLSX_URLS); }
  async function ensureJsPDF() { if (!window.jspdf) await loadScriptWithFallback(JSPDF_URLS); }

  // ── Exportação XLSX ──────────────────────────────────────────────────────────
  async function exportXLSX(data) {
    await ensureXLSX();
    const wb = window.XLSX.utils.book_new();
    const date = new Date().toLocaleString('pt-BR');
    var periodLabel = getPeriodLabel(data.periodDays || 30);

    // Dashboard — métricas
    const metricsRows = [
      ['KinoCampus — Dashboard Administrativo'],
      ['Gerado em: ' + date],
      ['Período: ' + periodLabel],
      [],
      ['MODERAÇÃO (' + periodLabel + ')', ''],
      ['Métrica', 'Valor'],
      ['Denúncias abertas',  data.reportMetrics.open],
      ['Total de denúncias', data.reportMetrics.total],
      ['Posts ocultados',    data.postStatusMetrics.hidden],
      ['Posts deletados',    data.postStatusMetrics.deleted],
      [],
      ['ATIVIDADE (' + periodLabel + ')', ''],
      ['Métrica', 'Valor'],
      ['Total de posts',    data.postsTotal],
      ['Posts publicados',  data.postsCreated],
      ['Posts editados',    data.postsEdited],
      ['Comentários',       data.commentsCount],
      ['Buscas realizadas', data.searchCount],
      [],
      ['COMUNIDADE (' + periodLabel + ')', ''],
      ['Métrica', 'Valor'],
      ['Total de usuários',                            data.usersTotal],
      ['Novos usuários (' + periodLabel + ')',         data.usersNew],
      ['Votos (' + periodLabel + ')',                  data.votesCount],
      ['Posts salvos (' + periodLabel + ')',           data.savedPostsCount],
    ];
    const ws1 = window.XLSX.utils.aoa_to_sheet(metricsRows);
    ws1['!cols'] = [{ wch: 36 }, { wch: 12 }];
    window.XLSX.utils.book_append_sheet(wb, ws1, 'Dashboard');

    // Tendências de busca
    if (data.trends && data.trends.length) {
      const trendRows = [
        ['Termo', 'Buscas', 'Módulo'],
        ...data.trends.map(t => {
          var mod = classifyTermToModule(t.term);
          return [t.term, Number(t.count) || 0, mod ? (MODULE_LABELS[mod] || mod) : ''];
        }),
      ];
      const ws2 = window.XLSX.utils.aoa_to_sheet(trendRows);
      ws2['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 20 }];
      window.XLSX.utils.book_append_sheet(wb, ws2, 'Tendências');
    }

    // Audit log
    if (data.auditRows && data.auditRows.length) {
      const auditRows2 = [
        ['Data', 'Ação', 'Entidade', 'Autor'],
        ...data.auditRows.map(r => [
          new Date(r.created_at).toLocaleString('pt-BR'),
          r.action || '—',
          r.entity_type || '—',
          getActorDisplay(r.actor_id),
        ]),
      ];
      const ws3 = window.XLSX.utils.aoa_to_sheet(auditRows2);
      ws3['!cols'] = [{ wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 24 }];
      window.XLSX.utils.book_append_sheet(wb, ws3, 'Audit Log');
    }

    const filename = `kc-dashboard-${new Date().toISOString().slice(0, 10)}.xlsx`;
    window.XLSX.writeFile(wb, filename);
  }

  // ── Exportação PDF ───────────────────────────────────────────────────────────
  async function exportPDF(data) {
    await ensureJsPDF();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const date = new Date().toLocaleString('pt-BR');
    var periodLabel = getPeriodLabel(data.periodDays || 30);
    const marginL = 14;
    let y = 18;

    function checkPage() { if (y > 265) { doc.addPage(); y = 18; } }

    function renderSection(title, metrics) {
      checkPage();
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);
      doc.text(title, marginL, y); y += 5;
      doc.setDrawColor(220, 220, 220);
      doc.line(marginL, y, 196, y); y += 5;
      doc.setFontSize(10);
      metrics.forEach(function (m) {
        checkPage();
        doc.setTextColor(80, 80, 80);
        doc.text(m[0], marginL + 2, y);
        doc.setTextColor(30, 30, 30);
        doc.text(String(m[1]), 150, y, { align: 'right' });
        y += 6;
      });
      y += 4;
    }

    // Cabeçalho
    doc.setFontSize(16);
    doc.setTextColor(255, 107, 0);
    doc.text('KinoCampus — Dashboard Administrativo', marginL, y); y += 7;
    doc.setFontSize(9);
    doc.setTextColor(130, 130, 130);
    doc.text('Gerado em: ' + date + '  |  Período: ' + periodLabel, marginL, y); y += 10;

    // Seção Moderação
    renderSection('MODERAÇÃO (' + periodLabel + ')', [
      ['Denúncias abertas',  data.reportMetrics.open],
      ['Total de denúncias', data.reportMetrics.total],
      ['Posts ocultados',    data.postStatusMetrics.hidden],
      ['Posts deletados',    data.postStatusMetrics.deleted],
    ]);

    // Seção Atividade
    renderSection('ATIVIDADE (' + periodLabel + ')', [
      ['Total de posts',    data.postsTotal],
      ['Posts publicados',  data.postsCreated],
      ['Posts editados',    data.postsEdited],
      ['Comentários',       data.commentsCount],
      ['Buscas realizadas', data.searchCount],
    ]);

    // Seção Comunidade
    renderSection('COMUNIDADE (' + periodLabel + ')', [
      ['Total de usuários',                            data.usersTotal],
      ['Novos usuários (' + periodLabel + ')',         data.usersNew],
      ['Votos (' + periodLabel + ')',                  data.votesCount],
      ['Posts salvos (' + periodLabel + ')',           data.savedPostsCount],
    ]);

    // Tendências de busca
    if (data.trends && data.trends.length) {
      checkPage();
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);
      doc.text('TENDÊNCIAS DE BUSCA — top 10 (' + periodLabel + ')', marginL, y); y += 5;
      doc.line(marginL, y, 196, y); y += 5;
      doc.setFontSize(10);
      data.trends.forEach(function (t, i) {
        checkPage();
        var modKey = classifyTermToModule(t.term);
        var modLabel = modKey ? ' [' + (MODULE_LABELS[modKey] || modKey) + ']' : '';
        doc.setTextColor(80, 80, 80);
        doc.text((i + 1) + '. ' + String(t.term || '') + modLabel, marginL + 2, y);
        doc.setTextColor(30, 30, 30);
        doc.text(String(Number(t.count) || 0), 150, y, { align: 'right' });
        y += 6;
      });
      y += 4;
    }

    // Audit log
    if (data.auditRows && data.auditRows.length) {
      checkPage();
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);
      doc.text('AUDIT LOG (' + periodLabel + ')', marginL, y); y += 5;
      doc.line(marginL, y, 196, y); y += 5;
      doc.setFontSize(8);
      data.auditRows.forEach(function (row) {
        checkPage();
        var dateStr = new Date(row.created_at).toLocaleString('pt-BR');
        var actorName = getActorDisplay(row.actor_id);
        var line = dateStr + '  |  ' + (row.action || '—') + '  |  ' + (row.entity_type || '—') + '  |  ' + actorName;
        doc.setTextColor(70, 70, 70);
        doc.text(line, marginL + 2, y);
        y += 5;
      });
    }

    // Rodapé
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('KinoCampus — Pág. ' + p + ' / ' + totalPages, 196, 289, { align: 'right' });
    }

    doc.save('kc-dashboard-' + new Date().toISOString().slice(0, 10) + '.pdf');
  }

  // ── Habilita botões de exportação na toolbar ─────────────────────────────────
  function enableExport() {
    const xlsxBtn = $('#admin-export-xlsx');
    const pdfBtn  = $('#admin-export-pdf');

    if (xlsxBtn) {
      xlsxBtn.disabled = false;
      xlsxBtn.addEventListener('click', async () => {
        if (!_data) return;
        xlsxBtn.disabled = true;
        var origHtml = xlsxBtn.innerHTML;
        xlsxBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exportando…';
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
        pdfBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exportando…';
        try { await exportPDF(_data); }
        catch (e) { console.error('[Admin export PDF]', e); showError('Falha ao gerar PDF. Verifique sua conexão e tente novamente.'); }
        finally { pdfBtn.innerHTML = origHtml; pdfBtn.disabled = false; }
      });
    }
  }

  function escHtmlAdmin(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function loadMetrics() {
    const client = getClient();
    if (!client) { showError('Supabase client não disponível.'); return; }

    var periodDays = getSelectedPeriodDays();
    var since = daysAgo(periodDays);
    var shortLabel = getPeriodShortLabel(periodDays);
    var fullLabel  = getPeriodLabel(periodDays);

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
    ]);

    _auditOffset = auditRows.length;

    // ── Resolve nomes dos atores do audit log ──
    await loadActorsById(client, auditRows.map(r => r.actor_id));

    // ── Renderiza métricas de moderação ──
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

    _data = {
      reportMetrics, postStatusMetrics,
      postsCreated, postsEdited, commentsCount, searchCount, postsTotal,
      usersTotal, usersNew, votesCount, savedPostsCount,
      auditRows, trends, periodDays,
    };
    enableExport();

    setLastSync();
  }

  async function refreshDashboard() {
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
      await loadMetrics();
    } catch (error) {
      console.error('[Admin dashboard] refreshDashboard:', error);
      showError('Não foi possível atualizar o dashboard no momento.');
    } finally {
      setLoading(false);
      setRefreshLoading(false);
      setGridsLoading(false);
    }
  }

  // ── Audit log: carregar mais ──────────────────────────────────────────────
  async function loadMoreAudit() {
    var client = getClient();
    if (!client) return;
    var filterEl = $('#admin-audit-filter');
    var actionFilter = filterEl ? filterEl.value : 'all';
    var periodDays = getSelectedPeriodDays();
    var since = daysAgo(periodDays);
    var btn = $('#admin-audit-load-more');
    if (btn) btn.disabled = true;

    try {
      var rows = await loadAuditLog(client, AUDIT_PAGE_SIZE, _auditOffset, actionFilter, since);
      // Resolve actor names before rendering
      await loadActorsById(client, rows.map(r => r.actor_id));
      _auditOffset += rows.length;
      renderAuditRows(rows, true);
      // Append to _data for export
      if (_data && _data.auditRows) {
        _data.auditRows = _data.auditRows.concat(rows);
      }
    } catch (e) {
      console.error('[Admin audit] loadMore:', e);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ── Audit log: filtrar por ação ───────────────────────────────────────────
  async function filterAudit() {
    var client = getClient();
    if (!client) return;
    var filterEl = $('#admin-audit-filter');
    var actionFilter = filterEl ? filterEl.value : 'all';
    var periodDays = getSelectedPeriodDays();
    var since = daysAgo(periodDays);
    _auditOffset = 0;

    try {
      var rows = await loadAuditLog(client, AUDIT_PAGE_SIZE, 0, actionFilter, since);
      // Resolve actor names before rendering
      await loadActorsById(client, rows.map(r => r.actor_id));
      _auditOffset = rows.length;
      renderAuditRows(rows, false);
      if (_data) _data.auditRows = rows;
    } catch (e) {
      console.error('[Admin audit] filter:', e);
    }
  }

  async function boot() {
    setLoading(true);
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
    if (periodFilter) periodFilter.addEventListener('change', refreshDashboard);

    await refreshDashboard();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();

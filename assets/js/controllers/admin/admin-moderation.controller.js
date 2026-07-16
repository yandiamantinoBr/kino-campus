/*
  KinoCampus — Admin Moderation Controller (V8.1.11.0)
  Moderação de posts + observabilidade (audit log).
*/
(function () {
  'use strict';

  const PAGE_SIZE = 25;
  const SEARCH_DEBOUNCE_MS = 350;
  const EXPORT_ROW_LIMIT = 2000;
  const EXPORT_PAGE_SIZE = 250;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const STATUS_LABELS = Object.freeze({
    all: 'Todos',
    published: 'Publicado',
    pending: 'Pendente',
    hidden: 'Oculto',
    closed: 'Encerrado',
    expired: 'Expirado',
    deleted: 'Deletado',
    unknown: 'Desconhecido',
  });
  let _isBusy = false;
  let _searchDebounceTimer = null;
  let _postsRequestSeq = 0;
  let _auditRequestSeq = 0;
  let _userSearchRequestSeq = 0;
  let _limitsRequestSeq = 0;
  let _floodLimitsRequestSeq = 0;
  let _exportInFlight = false;
  const state = {
    statusFilter: 'all',
    search: '',
    offset: 0,
    hasMore: false,
    totalCount: 0,
    posts: [],
    sessionActions: [],
    audit: {
      entityType: 'all',
      action: 'all',
      actorQuery: '',
      rows: [],
      actorsById: {},
      pageSize: 25,
      offset: 0,
      hasMore: false,
    },
  };

  const escape = (str) => window.KCUtils.escapeHtml(str);

  function $(sel, root) { return (root || document).querySelector(sel); }

  function getClient() {
    if (window.KCSupabase && typeof window.KCSupabase.getClient === 'function') return window.KCSupabase.getClient();
    return null;
  }

  function isFunctionMissing(error) {
    if (!error) return false;
    const code = String(error.code || '');
    const message = String(error.message || error.details || error.hint || '').toLowerCase();
    return code === '42883'
      || code === 'PGRST202'
      || (message.includes('function') && (message.includes('does not exist') || message.includes('schema cache')));
  }

  function sanitizeSearchTerm(term) {
    return String(term || '')
      .replace(/[,%()]/g, ' ')
      .trim();
  }

  function debounceSearchRefresh(fn) {
    return function () {
      if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
      _searchDebounceTimer = setTimeout(() => {
        _searchDebounceTimer = null;
        fn();
      }, SEARCH_DEBOUNCE_MS);
    };
  }

  function ensurePostsSummary() {
    let el = document.getElementById('moderation-results-summary');
    if (el) return el;
    const headerBar = document.querySelector('#admin-content .kc-admin-header-bar');
    if (!headerBar || !headerBar.parentNode) return null;
    el = document.createElement('div');
    el.id = 'moderation-results-summary';
    el.style.margin = '10px 0 14px';
    el.style.color = 'var(--kc-text-dark-secondary)';
    el.style.fontSize = '.88em';
    headerBar.parentNode.insertBefore(el, headerBar.nextSibling);
    return el;
  }

  function renderPostsSummary() {
    const el = ensurePostsSummary();
    if (!el) return;
    const loaded = Array.isArray(state.posts) ? state.posts.length : 0;
    const total = Number.isFinite(Number(state.totalCount)) ? Number(state.totalCount) : loaded;
    if (!loaded && !total) {
      el.textContent = state.search
        ? 'Nenhum post encontrado para a busca atual.'
        : 'Nenhum post encontrado para os filtros selecionados.';
      return;
    }
    el.textContent = `Exibindo ${loaded} de ${total} posts${state.search ? ' encontrados' : ''}.`;
  }

  function resetPostsForRequest() {
    // A reset may supersede an in-flight "carregar mais". Normalize its
    // original label/dataset before the stale request skips its own finally.
    setControlBusy($('#moderation-load-more'), false);
    state.posts = [];
    state.offset = 0;
    state.totalCount = 0;
    state.hasMore = false;
  }

  function renderPostsRequestState(message, loading) {
    const body = $('#moderation-posts-body');
    const safeMessage = escape(message || (loading ? 'Carregando publicações…' : 'Lista indisponível.'));
    if (body) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--kc-text-dark-secondary);padding:26px;">
        <span role="${loading ? 'status' : 'alert'}" aria-live="${loading ? 'polite' : 'assertive'}">
          ${loading ? '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> ' : ''}${safeMessage}
        </span>
      </td></tr>`;
    }
    const summary = ensurePostsSummary();
    if (summary) summary.textContent = loading ? 'Atualizando a lista filtrada…' : 'A lista filtrada atual não está disponível.';
    const loadMore = $('#moderation-load-more');
    if (loadMore) {
      loadMore.style.display = 'none';
      loadMore.disabled = true;
    }
  }

  function showError(msg, allowBack) {
    const el = $('#admin-error');
    if (!el) return;
    el.innerHTML = `${escape(msg)}${allowBack ? ' <a href="../index.html" style="color:#ef9a9a;">Voltar ao início</a>' : ''}`;
    el.style.display = 'block';
  }

  function clearError() {
    const el = $('#admin-error');
    if (!el) return;
    el.textContent = '';
    el.style.display = 'none';
  }

  function showFeedback(msg) {
    const el = $('#admin-feedback');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => {
      if (el.textContent === msg) el.style.display = 'none';
    }, 2500);
  }

  function showToastSafe(message, type, duration) {
    const msg = String(message || '').trim();
    if (!msg) return;

    try {
      if (typeof window.showToast === 'function') {
        window.showToast(msg, type || 'info', duration || 2600);
        return;
      }
    } catch (_) { }

    const id = 'kc-admin-moderation-toast-fallback';
    let toast = document.getElementById(id);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = id;
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.style.position = 'fixed';
      toast.style.right = '16px';
      toast.style.bottom = '16px';
      toast.style.padding = '10px 14px';
      toast.style.borderRadius = '10px';
      toast.style.zIndex = '9999';
      toast.style.fontSize = '.9rem';
      toast.style.maxWidth = 'min(92vw, 420px)';
      toast.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.25)';
      document.body.appendChild(toast);
    }

    const t = String(type || 'info').toLowerCase();
    if (t === 'error') {
      toast.style.background = '#b71c1c';
      toast.style.color = '#fff';
    } else if (t === 'success') {
      toast.style.background = '#2e7d32';
      toast.style.color = '#fff';
    } else {
      toast.style.background = '#1565c0';
      toast.style.color = '#fff';
    }

    toast.textContent = msg;
    clearTimeout(toast._kcTimer);
    toast._kcTimer = setTimeout(() => {
      if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
    }, Number.isFinite(duration) ? duration : 2600);
  }

  function setLoading(visible) {
    const el = $('#admin-loading');
    if (el) {
      el.style.display = visible ? 'flex' : 'none';
      el.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    const content = $('#admin-content');
    if (content) content.setAttribute('aria-busy', visible ? 'true' : 'false');
  }

  function setControlBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      if (!button.dataset.kcOriginalHtml) button.dataset.kcOriginalHtml = button.innerHTML;
      if (!button.dataset.kcOriginalDisabled) button.dataset.kcOriginalDisabled = button.disabled ? 'true' : 'false';
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> ' + escape(label || 'Carregando…');
      return;
    }
    if (button.dataset.kcOriginalHtml) button.innerHTML = button.dataset.kcOriginalHtml;
    button.disabled = button.dataset.kcOriginalDisabled === 'true';
    delete button.dataset.kcOriginalHtml;
    delete button.dataset.kcOriginalDisabled;
    button.removeAttribute('aria-busy');
  }

  function renderTableRequestState(tbody, colspan, message, loading) {
    if (!tbody) return;
    const safeMessage = escape(message || (loading ? 'Carregando…' : 'Dados indisponíveis.'));
    tbody.innerHTML = `<tr><td data-label="Status" colspan="${Number(colspan) || 1}" style="text-align:center;color:${loading ? 'var(--kc-text-dark-secondary)' : '#ef9a9a'};padding:14px;">
      <span class="kc-admin-loading-state" role="${loading ? 'status' : 'alert'}" aria-live="${loading ? 'polite' : 'assertive'}" style="display:inline-flex;align-items:center;gap:7px;">
        ${loading ? '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>' : ''}${safeMessage}
      </span>
    </td></tr>`;
  }

  function setTableRegionBusy(tbody, refreshButton, busy, label) {
    const wrap = tbody && tbody.closest ? tbody.closest('.kc-admin-posts-table-wrap') : null;
    if (wrap) wrap.setAttribute('aria-busy', busy ? 'true' : 'false');
    setControlBusy(refreshButton, busy, label || 'Atualizando…');
  }

  function setPostsBusy(busy, append) {
    const wrap = $('.kc-admin-posts-table-wrap');
    if (wrap) wrap.setAttribute('aria-busy', busy ? 'true' : 'false');
    const refresh = $('#moderation-refresh');
    const loadMore = $('#moderation-load-more');
    if (append) {
      setControlBusy(loadMore, busy, 'Carregando…');
      if (!busy && loadMore) loadMore.disabled = !state.hasMore;
    } else {
      setControlBusy(refresh, busy, 'Atualizando…');
      if (!busy && refresh) refresh.disabled = false;
    }
  }

  function setAuditError(msg) {
    const el = $('#audit-log-error');
    if (!el) return;
    if (!msg) {
      el.textContent = '';
      el.style.display = 'none';
      return;
    }
    el.textContent = msg;
    el.style.display = 'block';
  }

  function isPermissionError(error) {
    if (!error) return false;
    const message = String(error.message || error.details || error.hint || '').toLowerCase();
    return message.includes('permission')
      || message.includes('row-level security')
      || message.includes('rls')
      || message.includes('jwt');
  }

  function getErrorMessage(error, fallback) {
    if (!error) return fallback;
    if (typeof error === 'string' && error.trim()) return error.trim();
    if (error.message) return String(error.message);
    return fallback;
  }

  async function checkAdminAccess() {
    const drv = window.KCAPI && window.KCAPI.ENV && window.KCAPI.ENV.driver;
    if (drv !== 'supabase') {
      showError('O painel de administração requer driver=supabase.', true);
      return false;
    }

    const user = await window.KCAPI.getCurrentUser();
    if (!user) {
      // FIX v8.2.9.4: Sessão expirada é a causa mais comum de "nada acontece" ao clicar botões.
      // O token JWT do Supabase expira em ~1h. Após a expiração, getCurrentUser() retorna null,
      // boot() retorna antes de chamar bindEvents(), e os botões ficam sem listener de clique.
      showError('Sessão expirada ou não autenticado. Faça login novamente.', true);
      showToastSafe('Sua sessão expirou. Redirecionando para login…', 'error', 4000);
      return false;
    }

    const client = getClient();
    if (!client) { showError('Supabase client não disponível.', true); return false; }

    const { data: profile, error } = await client
      .from('profiles')
      .select('is_admin, display_name, full_name')
      .eq('id', user.id)
      .maybeSingle();

    if (error || !profile) {
      // Erro ao buscar perfil — pode ser RLS, coluna ausente ou usuário sem perfil.
      const detail = error ? ` (${error.message})` : ' (perfil não encontrado)';
      showError(`Não foi possível validar permissões de administrador.${detail}`, true);
      showToastSafe(`Erro ao carregar perfil: ${error ? error.message : 'não encontrado'}`, 'error', 5000);
      return false;
    }

    if (!profile.is_admin) {
      showError('Acesso negado. Apenas administradores podem acessar este painel.', true);
      return false;
    }

    return true;
  }

  async function searchAuthorIds(client, searchTerm) {
    const term = sanitizeSearchTerm(searchTerm);
    if (!client || !term) return [];
    try {
      const { data, error } = await client
        .from('profiles')
        .select('id')
        .or(`display_name.ilike.%${term}%,full_name.ilike.%${term}%`)
        .limit(50);
      if (error || !Array.isArray(data)) return [];
      return data.map((row) => row.id).filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  async function resolveAuditActorIds(client, actorQuery) {
    const term = sanitizeSearchTerm(actorQuery);
    if (!client || !term) return { ids: [], error: null };
    try {
      const { data, error } = await client
        .from('profiles')
        .select('id')
        .or(`display_name.ilike.%${term}%,full_name.ilike.%${term}%`)
        .order('id', { ascending: true })
        .limit(5000);
      if (error) return { ids: [], error };
      return {
        ids: (Array.isArray(data) ? data : [])
          .map((row) => row && row.id)
          .filter((id) => UUID_RE.test(String(id || ''))),
        error: null,
      };
    } catch (error) {
      return { ids: [], error };
    }
  }

  function mapRpcPost(row) {
    return {
      id: row.id,
      legacy_id: row.legacy_id || '',
      title: row.title || '',
      content: row.content || '',
      module: row.module || '',
      category: row.category || '',
      status: row.status || 'pending',
      created_at: row.created_at || null,
      updated_at: row.updated_at || row.created_at || null,
      author_id: row.author_id || null,
      author: {
        display_name: row.author_name || '',
        full_name: row.author_name || '',
      },
    };
  }

  async function fetchPosts(reset) {
    const append = !reset;
    const requestSeq = ++_postsRequestSeq;
    const requestOffset = reset ? 0 : state.offset;
    const normalizedSearch = sanitizeSearchTerm(state.search);
    const statusFilter = state.statusFilter !== 'all' ? state.statusFilter : null;
    let list = [];
    let totalCount = 0;
    let resolved = false;
    let allowDirectFallback = true;

    if (reset) {
      resetPostsForRequest();
      renderPostsRequestState('Carregando publicações…', true);
    }

    const client = getClient();
    if (!client) {
      if (reset) renderPostsRequestState('Supabase indisponível; não foi possível carregar a lista atual.', false);
      showError('Supabase client não disponível.', false);
      return;
    }

    setPostsBusy(true, append);
    clearError();
    try {
      const rpc = await client.rpc('kc_admin_search_posts_full', {
        p_query: normalizedSearch || null,
        p_status: statusFilter,
        p_limit: PAGE_SIZE,
        p_offset: requestOffset,
      });

      if (requestSeq !== _postsRequestSeq) return;
      if (rpc && !rpc.error && Array.isArray(rpc.data)) {
        list = rpc.data.map(mapRpcPost);
        totalCount = rpc.data.length ? Number(rpc.data[0].total_count || 0) : 0;
        resolved = true;
      } else if (rpc && rpc.error) {
        allowDirectFallback = isFunctionMissing(rpc.error);
        console.error('[Admin moderation] fetchPosts rpc:', rpc.error);
        if (!allowDirectFallback) {
          showError('Não foi possível listar as publicações. Atualize a sessão e tente novamente.', false);
          if (reset) renderPostsRequestState('Não foi possível carregar as publicações deste filtro.', false);
          return;
        }
      }

      if (!resolved && allowDirectFallback) {
        // Compatibilidade com projetos ainda sem a RPC agregada.
        let query = client
          .from('posts')
          .select('id, legacy_id, title, content:description, module, category, status, created_at, updated_at, author_id, author:profiles!posts_author_id_fkey(display_name,full_name)', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(requestOffset, requestOffset + PAGE_SIZE - 1);

        if (statusFilter) query = query.eq('status', statusFilter);

        if (normalizedSearch) {
          const authorIds = await searchAuthorIds(client, normalizedSearch);
          if (requestSeq !== _postsRequestSeq) return;
          const clauses = [
            `title.ilike.%${normalizedSearch}%`,
            `description.ilike.%${normalizedSearch}%`,
            `legacy_id.ilike.%${normalizedSearch}%`,
          ];
          if (UUID_RE.test(normalizedSearch)) clauses.push(`id.eq.${normalizedSearch}`);
          if (authorIds.length) clauses.push(`author_id.in.(${authorIds.join(',')})`);
          query = query.or(clauses.join(','));
        }

        const { data, error, count } = await query;
        if (requestSeq !== _postsRequestSeq) return;
        if (error) {
          console.error('[Admin moderation] fetchPosts:', error);
          showError('Erro ao listar posts. Verifique as permissões administrativas no Supabase.', false);
          if (reset) renderPostsRequestState('Não foi possível carregar as publicações deste filtro.', false);
          return;
        }

        list = data || [];
        totalCount = Number.isFinite(Number(count)) ? Number(count) : requestOffset + list.length;
      }

      if (requestSeq !== _postsRequestSeq) return;
      const effectiveTotalCount = append && !list.length
        ? Math.max(Number(state.totalCount) || 0, requestOffset)
        : totalCount;
      state.totalCount = effectiveTotalCount;
      state.hasMore = list.length > 0 && (requestOffset + list.length) < effectiveTotalCount;
      state.posts = reset ? list : state.posts.concat(list);
      state.offset = requestOffset + list.length;
      renderPosts();
    } catch (error) {
      if (requestSeq !== _postsRequestSeq) return;
      console.error('[Admin moderation] fetchPosts exception:', error);
      showError('Não foi possível atualizar a lista de publicações.', false);
      if (reset) renderPostsRequestState('Não foi possível atualizar as publicações deste filtro.', false);
    } finally {
      if (requestSeq === _postsRequestSeq) setPostsBusy(false, append);
    }
  }

  function formatPayload(payload) {
    try {
      return JSON.stringify(payload || {}, null, 2);
    } catch (_) {
      return '{}';
    }
  }

  function formatAuditEntityId(value) {
    const entityId = String(value || '').trim();
    if (!entityId) return '—';
    return entityId.length > 12 ? `${entityId.slice(0, 12)}…` : entityId;
  }

  async function loadActorsById(actorIds) {
    const client = getClient();
    if (!client) return {};

    const ids = Array.from(new Set((actorIds || []).filter((id) => UUID_RE.test(String(id || '')))));
    if (!ids.length) return {};

    try {
      const { data, error } = await client
        .from('profiles')
        .select('id, display_name, full_name')
        .in('id', ids);

      if (error) {
        console.error('[Admin moderation] loadActorsById:', error);
        return {};
      }

      const map = {};
      (data || []).forEach((row) => {
        map[row.id] = {
          id: row.id,
          display_name: row.display_name || '',
          full_name: row.full_name || '',
        };
      });
      return map;
    } catch (e) {
      console.error('[Admin moderation] loadActorsById exceção:', e);
      return {};
    }
  }

  function renderAuditPagination() {
    const wrap = $('#audit-pagination');
    const prevBtn = $('#audit-prev');
    const nextBtn = $('#audit-next');
    const info = $('#audit-page-info');
    if (!wrap) return;

    const page = Math.floor(state.audit.offset / state.audit.pageSize) + 1;
    const hasRows = state.audit.rows.length > 0;

    wrap.style.display = (hasRows || state.audit.offset > 0) ? 'flex' : 'none';
    if (prevBtn) prevBtn.disabled = state.audit.offset === 0;
    if (nextBtn) nextBtn.disabled = !state.audit.hasMore;
    if (info) {
      const from = hasRows ? state.audit.offset + 1 : 0;
      const to = state.audit.offset + state.audit.rows.length;
      info.textContent = hasRows
        ? `Mostrando ${from}–${to} (página ${page})`
        : 'Nenhum resultado';
    }
  }

  function renderAuditLogs() {
    const body = $('#audit-log-body');
    if (!body) return;

    const rows = Array.isArray(state.audit.rows) ? state.audit.rows : [];
    if (!rows.length) {
      body.innerHTML = '<tr><td data-label="Status" colspan="6" style="text-align:center;color:var(--kc-text-dark-secondary);padding:20px;"><span role="status">Nenhum log encontrado para os filtros selecionados.</span></td></tr>';
      renderAuditPagination();
      return;
    }

    body.innerHTML = rows.map((row, idx) => {
      const detailId = `audit-detail-${idx}`;
      const payload = escape(formatPayload(row.payload));

      return `<tr>
        <td data-label="Data">${escape(fmtDate(row.created_at))}</td>
        <td data-label="Ação"><code>${escape(row.action || '—')}</code></td>
        <td data-label="Entidade"><code>${escape(row.entity_type || '—')}</code></td>
        <td data-label="entity_id"><code style="font-size:.8em;">${escape(formatAuditEntityId(row.entity_id))}</code></td>
        <td data-label="Autor da ação">${(() => {
          const actorId = String(row.actor_id || '');
          if (!actorId) return '<code>service_role/system</code>';
          const actor = state.audit.actorsById && state.audit.actorsById[actorId];
          const actorName = actor ? (actor.display_name || actor.full_name || '') : '';
          if (!actorName) return `<code>${escape(actorId)}</code>`;
          return `<div><strong>${escape(actorName)}</strong></div><div style="font-size:.78em;color:var(--kc-text-dark-secondary);"><code>${escape(actorId)}</code></div>`;
        })()}</td>
        <td data-label="Detalhes">
          <button
            type="button"
            data-audit-detail="${detailId}"
            aria-controls="${detailId}"
            aria-expanded="false"
            style="padding:6px 10px;border-radius:6px;border:1px solid var(--kc-border-dark);background:var(--kc-background-dark);color:var(--kc-text-dark);cursor:pointer;font-size:.82em;"
          >
            Ver detalhes
          </button>
        </td>
      </tr>
      <tr id="${detailId}" class="kc-audit-details-row" style="display:none;">
        <td colspan="6">
          <pre class="kc-audit-details">${payload}</pre>
        </td>
      </tr>`;
    }).join('');

    renderAuditPagination();
  }

  async function fetchAuditLogs() {
    const client = getClient();
    if (!client) return;

    const requestSeq = ++_auditRequestSeq;
    const body = $('#audit-log-body');
    const wrap = body && body.closest ? body.closest('.kc-admin-posts-table-wrap') : null;
    if (wrap) wrap.setAttribute('aria-busy', 'true');
    setControlBusy($('#audit-refresh'), true, 'Atualizando…');
    renderTableRequestState(body, 6, 'Carregando logs…', true);
    setAuditError('');

    const actorQuery = String(state.audit.actorQuery || '').trim();
    const actorQueryIsUuid = actorQuery && UUID_RE.test(actorQuery);
    const limit = state.audit.pageSize;
    const offset = state.audit.offset;

    // Usar RPC paginada — buscar limit+1 para detectar hasMore
    let rows = [];
    let fetchOk = false;

    try {
      try {
        const rpc = await client.rpc('kc_admin_list_audit_logs', {
          p_entity_type: state.audit.entityType,
          p_action: state.audit.action,
          p_actor_query: actorQueryIsUuid ? actorQuery : (actorQuery || null),
          p_limit: limit + 1,
          p_offset: offset,
        });

        if (requestSeq !== _auditRequestSeq) return;
        if (rpc && !rpc.error && Array.isArray(rpc.data)) {
          rows = rpc.data;
          fetchOk = true;
        } else if (rpc && rpc.error) {
          console.error('[Admin moderation] fetchAuditLogs rpc:', rpc.error);
        }
      } catch (rpcErr) {
        console.error('[Admin moderation] fetchAuditLogs rpc exceção:', rpcErr);
      }

      // Fallback paginado para projetos ainda sem a RPC.
      if (!fetchOk) {
        try {
          let actorIdsForFallback = null;
          if (actorQuery && !actorQueryIsUuid) {
            const actorLookup = await resolveAuditActorIds(client, actorQuery);
            if (requestSeq !== _auditRequestSeq) return;
            if (actorLookup.error) throw actorLookup.error;
            actorIdsForFallback = actorLookup.ids;
          }

          if (actorIdsForFallback && !actorIdsForFallback.length) {
            rows = [];
          } else {
            let query = client
              .from('audit_log')
              .select('id, created_at, action, entity_type, entity_id, actor_id, payload')
              .order('created_at', { ascending: false })
              .order('id', { ascending: false });

            if (state.audit.entityType !== 'all') query = query.eq('entity_type', state.audit.entityType);
            if (state.audit.action !== 'all') query = query.eq('action', state.audit.action);
            if (actorQueryIsUuid) query = query.eq('actor_id', actorQuery);
            if (actorIdsForFallback) query = query.in('actor_id', actorIdsForFallback);
            query = query.range(offset, offset + limit);

            const { data, error } = await query;
            if (requestSeq !== _auditRequestSeq) return;
            if (error) {
              console.error('[Admin moderation] fetchAuditLogs direct:', error);
              state.audit.rows = [];
              state.audit.hasMore = false;
              renderAuditLogs();
              setAuditError('Não foi possível carregar o audit log. Verifique migration/RLS no Supabase.');
              return;
            }
            rows = data || [];
          }
        } catch (directErr) {
          console.error('[Admin moderation] fetchAuditLogs direct exceção:', directErr);
          state.audit.rows = [];
          state.audit.hasMore = false;
          renderAuditLogs();
          setAuditError('Não foi possível carregar o audit log.');
          return;
        }
      }

      // Detectar hasMore
      if (rows.length > limit) {
        state.audit.hasMore = true;
        rows = rows.slice(0, limit);
      } else {
        state.audit.hasMore = false;
      }

      const actorIds = rows.map((row) => row.actor_id).filter(Boolean);
      const actorsById = await loadActorsById(actorIds);
      if (requestSeq !== _auditRequestSeq) return;
      state.audit.actorsById = actorsById;
      state.audit.rows = rows;

      renderAuditLogs();
    } finally {
      if (requestSeq === _auditRequestSeq) {
        if (wrap) wrap.setAttribute('aria-busy', 'false');
        setControlBusy($('#audit-refresh'), false);
      }
    }
  }

  function statusBadge(status) {
    const key = String(status || 'unknown').toLowerCase();
    const map = { published: '#2e7d32', pending: '#616161', hidden: '#ef6c00', closed: '#475569', expired: '#6b7280', deleted: '#b71c1c' };
    return `<span class="kc-badge" style="background:${map[key] || '#546e7a'};">${escape(statusLabel(key))}</span>`;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR'); } catch (_) { return iso; }
  }

  function statusLabel(status) {
    const key = String(status || 'unknown').toLowerCase();
    return STATUS_LABELS[key] || status || STATUS_LABELS.unknown;
  }

  function getAuthorName(post) {
    if (!post) return '';
    if (post.author_name) return post.author_name;
    if (post.author && (post.author.display_name || post.author.full_name)) {
      return post.author.display_name || post.author.full_name;
    }
    return post.author_id || '';
  }

  function moduleLabel(moduleKey) {
    const labels = {
      eventos: 'Eventos',
      oportunidades: 'Oportunidades',
      moradia: 'Moradia',
      'compra-venda': 'Compra e Venda',
      caronas: 'Caronas',
      'achados-perdidos': 'Achados e Perdidos',
      ods: 'ODS',
      alugueis: 'Aluguéis',
      vendas: 'Vendas',
      servicos: 'Serviços',
      vagas: 'Vagas',
      achados: 'Achados e Perdidos (legado)',
    };
    return labels[moduleKey] || moduleKey || 'Todos';
  }

  function summarizeAuditPayload(payload) {
    if (!payload || typeof payload !== 'object') return '';
    const parts = [];
    if (payload.old_status || payload.new_status) {
      parts.push([payload.old_status, payload.new_status].filter(Boolean).join(' → '));
    }
    if (payload.module) parts.push('Módulo: ' + payload.module);
    if (payload.reason) parts.push('Motivo: ' + payload.reason);
    if (payload.max_active != null) parts.push('Máx. ativas: ' + payload.max_active);
    if (payload.max_posts != null) parts.push('Máx. posts: ' + payload.max_posts);
    if (payload.window_minutes != null) parts.push('Janela: ' + payload.window_minutes + ' min');
    return parts.slice(0, 4).join(' | ');
  }

  function actionButton(label, action, color, disabled) {
    return `<button type="button" data-action="${action}" style="background:${color};" ${disabled ? 'disabled' : ''}>${label}</button>`;
  }

  function renderPosts() {
    const body = $('#moderation-posts-body');
    if (!body) return;

    if (!state.posts.length) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--kc-text-dark-secondary);padding:26px;">Nenhum post encontrado para os filtros selecionados.</td></tr>';
    } else {
      body.innerHTML = state.posts.map((p) => {
        const author = (p.author && (p.author.display_name || p.author.full_name)) || '—';
        const moduleInfo = [p.module, p.category].filter(Boolean).join(' / ') || '—';
        const idRef = p.legacy_id ? `${escape(p.legacy_id)} · ${escape(p.id)}` : escape(p.id);
        const excerpt = String(p.content || '').replace(/\s+/g, ' ').trim().slice(0, 180);
        const publishLabel = p.status === 'pending' ? 'Aprovar/Publicar' : 'Reativar';

        return `<tr data-id="${escape(p.id)}">
          <td data-label="Post">
            <strong>${escape(p.title || '(sem título)')}</strong><br>
            <span style="font-size:.8em;color:var(--kc-text-dark-secondary);">${idRef}</span>
            ${excerpt ? `<div style="font-size:.82em;color:var(--kc-text-dark-secondary);margin-top:5px;line-height:1.35;">${escape(excerpt)}${String(p.content || '').length > 180 ? '…' : ''}</div>` : ''}
            <a href="../product.html?id=${encodeURIComponent(p.id)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:6px;font-size:.8em;color:var(--kc-primary-brand);">Abrir publicação <span aria-hidden="true">↗</span></a>
          </td>
          <td data-label="Autor">${escape(author)}</td>
          <td data-label="Módulo/Categoria">${escape(moduleLabel(p.module))}${p.category ? ` / ${escape(p.category)}` : ''}</td>
          <td data-label="Status" data-col="status">${statusBadge(p.status)}</td>
          <td data-label="Atualizado em" data-col="updated">${escape(fmtDate(p.updated_at || p.created_at))}</td>
          <td data-label="Ações">
            <div class="kc-admin-actions">
              ${actionButton('Ocultar', 'hidden', '#ef6c00', p.status === 'hidden')}
              ${actionButton(publishLabel, 'published', '#2e7d32', p.status === 'published')}
              ${actionButton('Encerrar', 'closed', '#64748b', p.status === 'closed')}
              ${actionButton('Deletar', 'deleted', '#b71c1c', p.status === 'deleted')}
            </div>
          </td>
        </tr>`;
      }).join('');
    }

    renderPostsSummary();
    const loadMore = $('#moderation-load-more');
    if (loadMore) {
      loadMore.style.display = state.hasMore ? 'inline-block' : 'none';
      loadMore.disabled = !state.hasMore;
    }
  }

  function renderSessionActions() {
    const el = $('#moderation-session-actions');
    if (!el) return;
    if (!state.sessionActions.length) {
      el.innerHTML = '<li>Nenhuma ação nesta sessão.</li>';
      return;
    }
    el.innerHTML = state.sessionActions.slice(0, 10).map((item) =>
      `<li><code>${escape(item.postId)}</code> → <strong>${escape(statusLabel(item.action))}</strong> (${escape(fmtDate(item.timestamp))})</li>`).join('');
  }

  async function updatePostStatus(postId, status) {
    const post = state.posts.find((item) => item.id === postId);
    const postRef = (post && post.title) ? post.title : postId;
    if (status === 'deleted' && !window.confirm(`Deletar post "${postRef}"? Ação não pode ser desfeita.`)) {
      return { ok: false, cancelled: true };
    }
    if (_isBusy) {
      showToastSafe('Aguarde a conclusão da ação anterior.', 'info', 2200);
      return { ok: false, busy: true };
    }
    _isBusy = true;

    try {
      const client = getClient();
      if (!client) {
        showToastSafe(
          'Supabase client não inicializado. Verifique se SUPABASE_URL e SUPABASE_ANON_KEY estão configurados no Vercel.',
          'error',
          5000
        );
        return { ok: false, error: { message: 'Supabase client não disponível.' } };
      }

      let error = null;
      let data = null;

      try {
        const rpc = await client.rpc('kc_admin_set_post_status', {
          p_post_id: postId,
          p_status: status,
          p_close_reports: false,
        });

        if (rpc && !rpc.error && rpc.data && typeof rpc.data === 'object') {
          if (rpc.data.ok && Number(rpc.data.updated_posts || 0) > 0) {
            data = [{ id: postId }];
          } else {
            const fallbackMsg = (rpc.data && rpc.data.code === 'UPDATE_NOT_APPLIED')
              ? 'A ação foi aceita, mas o banco não aplicou a alteração (RLS/role). Rode a migration v8.2.9.3 no projeto Supabase em produção.'
              : 'Não foi possível moderar o post.';
            error = { message: rpc.data.message || fallbackMsg };
          }
        } else {
          const patch = status === 'published'
            ? { status, moderation_reason: null }
            : { status };
          const res = await client
            .from('posts')
            .update(patch)
            .eq('id', postId)
            .select('id');
          error = res ? res.error : null;
          data = res ? res.data : null;
        }
      } catch (e) {
        error = e;
      }

      if (error) {
        console.error('[Admin moderation] updatePostStatus:', {
          postId,
          status,
          error,
        });
        showError(`Falha ao atualizar post ${postId}.`, false);
        showToastSafe(getErrorMessage(error, 'Não foi possível atualizar o status do post.'), 'error', 3200);
        return { ok: false, error };
      }

      if (!Array.isArray(data) || data.length === 0) {
        const noRowsError = { message: 'Nenhum post foi atualizado. Verifique permissões RLS/admin ou se o post existe.' };
        console.error('[Admin moderation] updatePostStatus sem linhas afetadas:', {
          postId,
          status,
        });
        showError(`Falha ao atualizar post ${postId}.`, false);
        showToastSafe(noRowsError.message, 'error', 3200);
        return { ok: false, error: noRowsError };
      }

      if (post) {
        post.status = status;
        post.updated_at = new Date().toISOString();
      }
      try {
        if (window.KCPostFreshness && typeof window.KCPostFreshness.emit === 'function') {
          window.KCPostFreshness.emit({
            type: (status === 'hidden' || status === 'deleted' || status === 'pending') ? 'soft_deleted' : 'status_changed',
            source: 'admin-moderation',
            postId,
            module: post && post.module,
            status,
            updated_at: post && post.updated_at,
          });
        }
      } catch (_) { }

      state.sessionActions.unshift({ postId, action: status, timestamp: new Date().toISOString() });
      if (state.sessionActions.length > 30) state.sessionActions.pop();
      renderPosts();
      renderSessionActions();
      showFeedback(status === 'hidden' ? 'Post ocultado.' : status === 'published' ? 'Post reativado/publicado.' : status === 'closed' ? 'Post encerrado.' : 'Post marcado como deletado.');
      showToastSafe('Ação concluída com sucesso.', 'success', 1800);
      await fetchAuditLogs();
      return { ok: true };
    } finally {
      _isBusy = false;
    }
  }
  function initStatusFilter() {
    const select = $('#moderation-status-filter');
    if (!select) return;
    const statuses = ['all', 'published', 'pending', 'hidden', 'closed', 'expired', 'deleted'];
    select.innerHTML = statuses.map((status) => `<option value="${status}">${escape(statusLabel(status))}</option>`).join('');
  }

  function cloneAndFreezeExportValue(value) {
    if (Array.isArray(value)) {
      return Object.freeze(value.map((item) => cloneAndFreezeExportValue(item)));
    }
    if (value && typeof value === 'object') {
      const clone = {};
      Object.keys(value).forEach((key) => {
        clone[key] = cloneAndFreezeExportValue(value[key]);
      });
      return Object.freeze(clone);
    }
    return value;
  }

  function readExternalAccessSnapshotForExport() {
    try {
      const reader = window.KCAdminExternalAccessSnapshot;
      if (reader && typeof reader.read === 'function') {
        const snapshot = reader.read();
        if (snapshot && typeof snapshot === 'object') return snapshot;
      }
    } catch (error) {
      console.error('[Admin moderation] external access snapshot:', error);
    }
    return {
      available: false,
      incomplete: true,
      refreshing: false,
      updatedAt: null,
      countsByStatus: { pending: 0, approved: 0, rejected: 0 },
      items: [],
    };
  }

  function captureModerationExportContext() {
    const externalAccessSnapshot = readExternalAccessSnapshotForExport();
    return cloneAndFreezeExportValue({
      snapshotAt: new Date().toISOString(),
      filters: {
        statusFilter: state.statusFilter || 'all',
        search: state.search || '',
        auditEntityType: state.audit.entityType || 'all',
        auditAction: state.audit.action || 'all',
        auditActorQuery: state.audit.actorQuery || '',
        auditPageSize: state.audit.pageSize || 25,
      },
      screen: {
        posts: Array.isArray(state.posts) ? state.posts : [],
        totalCount: Number(state.totalCount) || 0,
        auditRows: Array.isArray(state.audit.rows) ? state.audit.rows : [],
        actorsById: state.audit.actorsById || {},
        activeLimits: Array.isArray(limitsState.limits) ? limitsState.limits : [],
        activeLimitsAvailable: limitsState.limitsLoaded === true,
        activeLimitsRefreshing: limitsState.limitsLoading === true,
        floodLimits: Array.isArray(limitsState.floodLimits) ? limitsState.floodLimits : [],
        floodLimitsAvailable: limitsState.floodLimitsLoaded === true,
        floodLimitsRefreshing: limitsState.floodLimitsLoading === true,
        externalAccessSnapshot,
        sessionActions: Array.isArray(state.sessionActions) ? state.sessionActions : [],
      },
    });
  }

  async function fetchPostsForExport(client, warnings, context) {
    const normalizedSearch = sanitizeSearchTerm(context.filters.search);
    const statusFilter = context.filters.statusFilter !== 'all' ? context.filters.statusFilter : null;
    let rows = [];
    let totalCount = 0;
    let resolvedViaRpc = false;
    let rpcFailed = false;

    try {
      const rpc = await client.rpc('kc_admin_search_posts_full_snapshot', {
        p_query: normalizedSearch || null,
        p_status: statusFilter,
        p_limit: EXPORT_ROW_LIMIT,
        p_offset: 0,
        p_until: context.snapshotAt,
      });
      const envelope = rpc && !rpc.error
        ? (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data)
        : null;
      if (!rpc || rpc.error || !envelope || !Array.isArray(envelope.out_rows)) {
        if (rpc && rpc.error && !isFunctionMissing(rpc.error)) warnings.push('RPC de posts falhou; export usando fallback direto.');
        rpcFailed = true;
      } else {
        resolvedViaRpc = true;
        rows = envelope.out_rows.map(mapRpcPost);
        totalCount = Number(envelope.out_total_count || 0);
      }
    } catch (error) {
      warnings.push('Falha ao buscar posts via RPC; export usando fallback direto.');
      rpcFailed = true;
    }

    if (resolvedViaRpc && !rpcFailed) {
      if (totalCount > rows.length) warnings.push(`Export de posts limitado a ${rows.length} de ${totalCount} registros filtrados.`);
      return { rows, totalCount: totalCount || rows.length, source: 'rpc' };
    }
    if (rpcFailed && rows.length) {
      rows = [];
      totalCount = 0;
    }

    try {
      const authorIds = normalizedSearch ? await searchAuthorIds(client, normalizedSearch) : [];
      let query = client
        .from('posts')
        .select('id, legacy_id, title, content:description, module, category, status, created_at, updated_at, author_id, author:profiles!posts_author_id_fkey(display_name,full_name)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .lte('created_at', context.snapshotAt)
        .limit(EXPORT_ROW_LIMIT);

      if (statusFilter) query = query.eq('status', statusFilter);
      if (normalizedSearch) {
        const clauses = [
          `title.ilike.%${normalizedSearch}%`,
          `description.ilike.%${normalizedSearch}%`,
          `legacy_id.ilike.%${normalizedSearch}%`,
        ];
        if (UUID_RE.test(normalizedSearch)) clauses.push(`id.eq.${normalizedSearch}`);
        if (authorIds.length) clauses.push(`author_id.in.(${authorIds.join(',')})`);
        query = query.or(clauses.join(','));
      }

      const { data, error, count } = await query;
      if (error) throw error;
      totalCount = Number.isFinite(Number(count)) ? Number(count) : 0;
      rows = data || [];
      if (totalCount > rows.length) warnings.push(`Export de posts limitado a ${rows.length} de ${totalCount} registros filtrados.`);
      return { rows, totalCount: totalCount || rows.length, source: 'direct' };
    } catch (error) {
      warnings.push('Não foi possível buscar todos os posts filtrados; export usando a página carregada.');
      return {
        rows: context.screen.posts,
        totalCount: context.screen.totalCount || context.screen.posts.length,
        source: 'state_fallback',
      };
    }
  }

  async function fetchAuditRowsForExport(client, warnings, context) {
    const actorQuery = String(context.filters.auditActorQuery || '').trim();
    const actorQueryIsUuid = actorQuery && UUID_RE.test(actorQuery);
    const rows = [];
    let resolvedViaRpc = false;
    let rpcFailed = false;
    let source = 'direct';

    try {
      for (let offset = 0; rows.length < EXPORT_ROW_LIMIT; offset += EXPORT_PAGE_SIZE) {
        const limit = Math.min(EXPORT_PAGE_SIZE, EXPORT_ROW_LIMIT - rows.length);
        const rpc = await client.rpc('kc_admin_list_audit_logs', {
          p_entity_type: context.filters.auditEntityType,
          p_action: context.filters.auditAction,
          p_actor_query: actorQuery || null,
          p_limit: limit,
          p_offset: offset,
          p_since: null,
          p_until: context.snapshotAt,
        });
        if (!rpc || rpc.error || !Array.isArray(rpc.data)) {
          if (rpc && rpc.error) warnings.push('RPC de audit log falhou; export usando fallback direto.');
          rpcFailed = true;
          break;
        }
        resolvedViaRpc = true;
        rows.push(...rpc.data);
        if (rpc.data.length < limit) break;
      }
    } catch (error) {
      warnings.push('Falha ao buscar audit log via RPC; export usando fallback direto.');
      rpcFailed = true;
    }

    if (rpcFailed && rows.length) rows.splice(0, rows.length);

    if (!resolvedViaRpc || rpcFailed) {
      try {
        let actorIdsForFallback = null;
        if (actorQuery && !actorQueryIsUuid) {
          const actorLookup = await resolveAuditActorIds(client, actorQuery);
          if (actorLookup.error) throw actorLookup.error;
          actorIdsForFallback = actorLookup.ids;
        }

        if (!actorIdsForFallback || actorIdsForFallback.length) {
          for (let offset = 0; rows.length < EXPORT_ROW_LIMIT; offset += EXPORT_PAGE_SIZE) {
            const limit = Math.min(EXPORT_PAGE_SIZE, EXPORT_ROW_LIMIT - rows.length);
            let query = client
              .from('audit_log')
              .select('id, created_at, action, entity_type, entity_id, actor_id, payload')
              .order('created_at', { ascending: false })
              .order('id', { ascending: false })
              .lte('created_at', context.snapshotAt);

            if (context.filters.auditEntityType !== 'all') query = query.eq('entity_type', context.filters.auditEntityType);
            if (context.filters.auditAction !== 'all') query = query.eq('action', context.filters.auditAction);
            if (actorQueryIsUuid) query = query.eq('actor_id', actorQuery);
            if (actorIdsForFallback) query = query.in('actor_id', actorIdsForFallback);
            query = query.range(offset, offset + limit - 1);

            const { data, error } = await query;
            if (error) throw error;
            const chunk = data || [];
            rows.push(...chunk);
            if (chunk.length < limit) break;
          }
        }
      } catch (error) {
        warnings.push('Não foi possível buscar todo o audit log filtrado; export usando a página carregada.');
        rows.splice(0, rows.length, ...context.screen.auditRows);
        source = 'state_fallback';
      }
    }

    let actorsById = await loadActorsById(rows.map((row) => row.actor_id).filter(Boolean));
    if (source === 'state_fallback') {
      actorsById = Object.assign({}, context.screen.actorsById, actorsById);
    }
    if (rows.length >= EXPORT_ROW_LIMIT) warnings.push(`Audit log limitado aos ${EXPORT_ROW_LIMIT} registros mais recentes dos filtros congelados.`);
    return { rows, actorsById, source: resolvedViaRpc && !rpcFailed ? 'rpc' : source };
  }

  function collectVisibleAdminSnapshotsForExport(warnings, context) {
    if (!context.screen.activeLimitsAvailable) {
      warnings.push('O snapshot de limites ativos ainda não estava disponível no início do export.');
    } else if (context.screen.activeLimitsRefreshing) {
      warnings.push('Limites ativos estavam sendo atualizados; o export preservou os valores visíveis no clique.');
    }

    if (!context.screen.floodLimitsAvailable) {
      warnings.push('O snapshot de limites de ritmo ainda não estava disponível no início do export.');
    } else if (context.screen.floodLimitsRefreshing) {
      warnings.push('Limites de ritmo estavam sendo atualizados; o export preservou os valores visíveis no clique.');
    }

    const externalSnapshot = context.screen.externalAccessSnapshot || {};
    if (!externalSnapshot.available) {
      warnings.push('O snapshot de acesso externo ainda não estava disponível no início do export.');
    } else {
      if (externalSnapshot.incomplete) {
        warnings.push('O snapshot visível de acesso externo estava parcial; o export preservou somente os itens exibidos no clique.');
      }
      if (externalSnapshot.refreshing) {
        warnings.push('O acesso externo estava sendo atualizado; o export preservou o snapshot visível anterior.');
      }
    }

    return {
      activeLimits: context.screen.activeLimits,
      floodLimits: context.screen.floodLimits,
      externalAccess: externalSnapshot.available && Array.isArray(externalSnapshot.items)
        ? externalSnapshot.items
        : [],
    };
  }

  async function collectModerationExportData(context) {
    const client = getClient();
    const warnings = [];
    const visibleSnapshots = collectVisibleAdminSnapshotsForExport(warnings, context);
    if (!client) {
      warnings.push('Supabase client indisponível; export usando apenas dados carregados na tela.');
      return cloneAndFreezeExportValue({
        context,
        posts: context.screen.posts,
        postsTotalCount: context.screen.totalCount,
        postsSource: 'state_fallback',
        auditRows: context.screen.auditRows,
        auditSource: 'state_fallback',
        actorsById: context.screen.actorsById,
        activeLimits: visibleSnapshots.activeLimits,
        floodLimits: visibleSnapshots.floodLimits,
        externalAccess: visibleSnapshots.externalAccess,
        warnings,
      });
    }

    const [postsPayload, auditPayload] = await Promise.all([
      fetchPostsForExport(client, warnings, context),
      fetchAuditRowsForExport(client, warnings, context),
    ]);

    return cloneAndFreezeExportValue({
      context,
      posts: postsPayload.rows,
      postsTotalCount: postsPayload.totalCount,
      postsSource: postsPayload.source,
      auditRows: auditPayload.rows,
      auditSource: auditPayload.source,
      actorsById: auditPayload.actorsById,
      activeLimits: visibleSnapshots.activeLimits,
      floodLimits: visibleSnapshots.floodLimits,
      externalAccess: visibleSnapshots.externalAccess,
      warnings,
    });
  }

  function extAccessStatusLabel(status) {
    const map = { pending: 'Pendente', approved: 'Aprovada', rejected: 'Recusada' };
    return map[String(status || '').toLowerCase()] || (status || 'Pendente');
  }

  function exportSourceLabel(source) {
    const labels = {
      rpc: 'RPC administrativa',
      direct: 'consulta direta protegida',
      state_fallback: 'dados carregados na tela',
    };
    return labels[String(source || '')] || 'fonte administrativa';
  }

  function buildModerationExportReport(exportData) {
    exportData = exportData || {};
    const context = exportData.context || captureModerationExportContext();
    const posts = Array.isArray(exportData.posts) ? exportData.posts : context.screen.posts;
    const auditRows = Array.isArray(exportData.auditRows) ? exportData.auditRows : context.screen.auditRows;
    const activeLimits = Array.isArray(exportData.activeLimits) ? exportData.activeLimits : context.screen.activeLimits;
    const floodLimits = Array.isArray(exportData.floodLimits) ? exportData.floodLimits : context.screen.floodLimits;
    const sessionActions = context.screen.sessionActions;
    const actorsById = exportData.actorsById || context.screen.actorsById;
    const warnings = Array.isArray(exportData.warnings) ? exportData.warnings : [];
    const externalAccess = Array.isArray(exportData.externalAccess) ? exportData.externalAccess : [];
    const postsTotalCount = Number.isFinite(Number(exportData.postsTotalCount)) ? Number(exportData.postsTotalCount) : (context.screen.totalCount || posts.length);
    const postsSource = exportData.postsSource || 'state_fallback';
    const auditSource = exportData.auditSource || 'state_fallback';
    const statusDistributionIsSample = postsTotalCount > posts.length;
    const statusCounts = posts.reduce((acc, post) => {
      const key = String(post && post.status || 'desconhecido');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const sections = [
      {
        title: statusDistributionIsSample ? 'Distribuição de status (amostra exportada)' : 'Distribuição de status',
        note: statusDistributionIsSample
          ? `A distribuição considera ${posts.length} de ${postsTotalCount} posts filtrados, conforme o limite seguro do export.`
          : `Distribuição calculada sobre os ${posts.length} posts exportados.`,
        rows: Object.keys(statusCounts).map((status) => ({
          status: statusLabel(status),
          total: statusCounts[status],
        })),
        columns: [{ key: 'status', label: 'Status' }, { key: 'total', label: 'Total' }],
        maxPdfRows: 12,
      },
      {
        title: 'Posts filtrados',
        note: 'PDF mostra uma amostra executiva; XLSX contém os registros filtrados coletados até o limite de segurança.',
        rows: posts.map((post) => ({
          post_id: post.id,
          legacy_id: post.legacy_id || '',
          titulo: post.title || post.content || '',
          autor: getAuthorName(post),
          modulo: moduleLabel(post.module),
          categoria: post.category || '',
          status: statusLabel(post.status),
          criado_em: fmtDate(post.created_at),
          atualizado_em: fmtDate(post.updated_at || post.created_at),
        })),
        pdfColumns: [
          { key: 'titulo', label: 'Título' },
          { key: 'status', label: 'Status' },
          { key: 'autor', label: 'Autor' },
          { key: 'atualizado_em', label: 'Atualizado em' },
        ],
        xlsxColumns: [
          { key: 'post_id', label: 'ID do post' },
          { key: 'legacy_id', label: 'ID legado' },
          { key: 'titulo', label: 'Título' },
          { key: 'autor', label: 'Autor' },
          { key: 'modulo', label: 'Módulo' },
          { key: 'categoria', label: 'Categoria' },
          { key: 'status', label: 'Status' },
          { key: 'criado_em', label: 'Criado em' },
          { key: 'atualizado_em', label: 'Atualizado em' },
        ],
        maxPdfRows: 30,
      },
      {
        title: 'Limites ativos',
        rows: activeLimits.map((row) => ({
          id: row.id,
          usuario: row.user_name || 'Global',
          user_id: row.user_id || '',
          modulo: moduleLabel(row.module),
          max_ativas: row.max_active,
          criado_em: fmtDate(row.created_at),
        })),
        pdfColumns: ['usuario', 'modulo', 'max_ativas', 'criado_em'],
        xlsxColumns: ['id', 'usuario', 'user_id', 'modulo', 'max_ativas', 'criado_em'],
        maxPdfRows: 40,
      },
      {
        title: 'Limites de ritmo',
        rows: floodLimits.map((row) => ({
          id: row.id,
          usuario: row.user_name || 'Global',
          user_id: row.user_id || '',
          modulo: moduleLabel(row.module),
          max_posts: row.max_posts,
          janela_minutos: row.window_minutes,
          criado_em: fmtDate(row.created_at),
        })),
        pdfColumns: ['usuario', 'modulo', 'max_posts', 'janela_minutos'],
        xlsxColumns: ['id', 'usuario', 'user_id', 'modulo', 'max_posts', 'janela_minutos', 'criado_em'],
        maxPdfRows: 40,
      },
      {
        title: 'Audit log filtrado',
        note: `Eventos administrativos relacionados aos filtros congelados no início do export. Fonte: ${exportSourceLabel(auditSource)}.`,
        rows: auditRows.map((row) => {
          const actorId = String(row.actor_id || '');
          const actor = actorsById && actorsById[actorId];
          return {
            data: fmtDate(row.created_at),
            acao: row.action || '',
            entidade: row.entity_type || '',
            entity_id: row.entity_id || '',
            ator: actor ? (actor.display_name || actor.full_name || actorId) : (actorId || 'system/service_role'),
            actor_id: actorId,
            detalhes: summarizeAuditPayload(row.payload),
            payload: formatPayload(row.payload),
          };
        }),
        pdfColumns: ['data', 'acao', 'entidade', 'ator'],
        xlsxColumns: ['data', 'acao', 'entidade', 'entity_id', 'ator', 'actor_id', 'detalhes', 'payload'],
        maxPdfRows: 35,
      },
      {
        title: 'Ações da sessão',
        rows: sessionActions.map((item) => ({
          post_id: item.postId,
          acao: statusLabel(item.action),
          data: fmtDate(item.timestamp),
        })),
        columns: ['post_id', 'acao', 'data'],
        maxPdfRows: 20,
      },
    ];

    if (externalAccess.length) {
      sections.push({
        title: 'Acesso externo',
        note: 'Solicitações de acesso externo coletadas com paginação — pendentes, aprovadas e recusadas. Limites ou falhas parciais aparecem na seção de avisos.',
        rows: externalAccess.map((req) => ({
          solicitante: (req && req.requester_name) || 'Solicitante',
          email: (req && req.contact_email) || '',
          status: extAccessStatusLabel(req && req.admin_status),
          vinculo: (req && req.affiliation_context) || '',
          mensagem: (req && req.message) || '',
          criado_em: fmtDate(req && req.created_at),
          decidido_em: (req && req.admin_decided_at) ? fmtDate(req.admin_decided_at) : '',
          nota_admin: (req && req.admin_note) || '',
        })),
        pdfColumns: [
          { key: 'solicitante', label: 'Solicitante' },
          { key: 'email', label: 'E-mail' },
          { key: 'status', label: 'Status' },
          { key: 'criado_em', label: 'Criado em' },
        ],
        xlsxColumns: [
          { key: 'solicitante', label: 'Solicitante' },
          { key: 'email', label: 'E-mail' },
          { key: 'status', label: 'Status' },
          { key: 'vinculo', label: 'Vínculo' },
          { key: 'mensagem', label: 'Mensagem' },
          { key: 'criado_em', label: 'Criado em' },
          { key: 'decidido_em', label: 'Decidido em' },
          { key: 'nota_admin', label: 'Nota do admin' },
        ],
        maxPdfRows: 30,
      });
    }

    if (warnings.length) {
      sections.push({
        title: 'Avisos de exportação',
        rows: warnings.map((warning, index) => ({ item: index + 1, aviso: warning })),
        columns: [{ key: 'item', label: '#' }, { key: 'aviso', label: 'Aviso' }],
        maxPdfRows: 20,
      });
    }

    return {
      title: 'KinoCampus - Moderação Admin',
      subtitle: 'Posts filtrados, limites ativos, ritmo de publicação, audit log e solicitações de acesso externo da seleção atual',
      source: `admin/moderation.html — instantâneo iniciado em ${fmtDate(context.snapshotAt)}; posts: ${exportSourceLabel(postsSource)}; audit log: ${exportSourceLabel(auditSource)}; sujeito aos limites de segurança informados`,
      filters: {
        status: statusLabel(context.filters.statusFilter || 'all'),
        busca: context.filters.search || '',
        audit_entity_type: context.filters.auditEntityType || 'all',
        audit_action: context.filters.auditAction || 'all',
        audit_actor: context.filters.auditActorQuery || '',
        audit_page_size: context.filters.auditPageSize || 25,
        fonte_posts: exportSourceLabel(postsSource),
        fonte_audit: exportSourceLabel(auditSource),
      },
      kpis: {
        posts_carregados: posts.length,
        posts_filtrados_total: postsTotalCount,
        audit_rows_exportadas: auditRows.length,
        limites_ativos: activeLimits.length,
        limites_de_ritmo: floodLimits.length,
        acoes_da_sessao: sessionActions.length,
      },
      sections,
    };
  }

  async function handleModerationExport(kind) {
    if (!window.KCAdminExport) {
      showToastSafe('Exportador admin indisponível.', 'error');
      return;
    }
    if (_exportInFlight) {
      showToastSafe('Já existe uma exportação em andamento.', 'info', 2200);
      return;
    }

    _exportInFlight = true;
    const exportButtons = [
      $('#moderation-export-pdf'),
      $('#moderation-export-xlsx'),
    ].filter(Boolean);
    let buttonsBusy = false;
    try {
      const context = captureModerationExportContext();
      const date = context.snapshotAt.slice(0, 10);
      exportButtons.forEach((button) => setControlBusy(button, true, 'Exportando…'));
      buttonsBusy = true;
      showToastSafe('Preparando relatório com os filtros congelados neste instante...', 'info', 2200);
      const exportData = await collectModerationExportData(context);
      const report = buildModerationExportReport(exportData);
      if (kind === 'pdf') {
        await window.KCAdminExport.exportReportPDF('kc-admin-moderacao-' + date + '.pdf', report);
      } else {
        await window.KCAdminExport.exportReportXLSX('kc-admin-moderacao-' + date + '.xlsx', report);
      }
      showToastSafe('Relatório preparado com sucesso.', 'success', 1800);
    } catch (error) {
      console.error('[Admin moderation] export:', error);
      showToastSafe('Não foi possível gerar o relatório agora.', 'error', 3600);
    } finally {
      if (buttonsBusy) exportButtons.forEach((button) => setControlBusy(button, false));
      _exportInFlight = false;
    }
  }

  function bindEvents() {
    const body = $('#moderation-posts-body');
    if (body) {
      body.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('button[data-action]');
        if (!btn) return;
        const row = ev.target.closest('tr[data-id]');
        if (!row) return;
        if (btn.dataset.kcBusy === '1') return;
        const action = btn.getAttribute('data-action');
        const rowButtons = Array.from(row.querySelectorAll('button[data-action]'));
        const originals = rowButtons.map((item) => ({ item, html: item.innerHTML, disabled: item.disabled }));
        btn.dataset.kcBusy = '1';
        row.setAttribute('aria-busy', 'true');
        rowButtons.forEach((item) => { item.disabled = true; });
        btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> ' + escape(statusLabel(action));
        try {
          await updatePostStatus(row.getAttribute('data-id'), action);
        } finally {
          if (row.isConnected) {
            row.removeAttribute('aria-busy');
            originals.forEach(({ item, html, disabled }) => {
              item.innerHTML = html;
              item.disabled = disabled;
              delete item.dataset.kcBusy;
            });
          }
        }
      });
    }

    const filter = $('#moderation-status-filter');
    if (filter) {
      filter.addEventListener('change', async () => {
        if (_searchDebounceTimer) {
          clearTimeout(_searchDebounceTimer);
          _searchDebounceTimer = null;
        }
        state.statusFilter = filter.value || 'all';
        const search = $('#moderation-search');
        state.search = search ? search.value.trim() : '';
        await fetchPosts(true);
      });
    }

    const search = $('#moderation-search');
    if (search) {
      const runSearch = debounceSearchRefresh(async () => {
        state.search = search.value.trim();
        await fetchPosts(true);
      });
      search.addEventListener('input', runSearch);
      search.addEventListener('search', runSearch);
    }

    const refresh = $('#moderation-refresh');
    if (refresh) refresh.addEventListener('click', async () => {
      if (_searchDebounceTimer) {
        clearTimeout(_searchDebounceTimer);
        _searchDebounceTimer = null;
      }
      const search = $('#moderation-search');
      state.search = search ? search.value.trim() : '';
      await fetchPosts(true);
    });

    const loadMore = $('#moderation-load-more');
    if (loadMore) loadMore.addEventListener('click', () => fetchPosts(false));

    const exportXlsx = $('#moderation-export-xlsx');
    if (exportXlsx) exportXlsx.addEventListener('click', () => handleModerationExport('xlsx').catch(console.error));
    const exportPdf = $('#moderation-export-pdf');
    if (exportPdf) exportPdf.addEventListener('click', () => handleModerationExport('pdf').catch(console.error));

    const auditEntity = $('#audit-entity-type-filter');
    if (auditEntity) {
      auditEntity.addEventListener('change', async () => {
        state.audit.entityType = auditEntity.value || 'all';
        state.audit.offset = 0;
        await fetchAuditLogs();
      });
    }

    const auditAction = $('#audit-action-filter');
    if (auditAction) {
      auditAction.addEventListener('change', async () => {
        state.audit.action = auditAction.value || 'all';
        state.audit.offset = 0;
        await fetchAuditLogs();
      });
    }

    const auditActor = $('#audit-actor-id-filter');
    if (auditActor) {
      auditActor.addEventListener('change', async () => {
        state.audit.actorQuery = String(auditActor.value || '').trim();
        state.audit.offset = 0;
        await fetchAuditLogs();
      });
      auditActor.addEventListener('keydown', async (ev) => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        state.audit.actorQuery = String(auditActor.value || '').trim();
        state.audit.offset = 0;
        await fetchAuditLogs();
      });
    }

    const auditPageSize = $('#audit-page-size');
    if (auditPageSize) {
      auditPageSize.addEventListener('change', async () => {
        state.audit.pageSize = parseInt(auditPageSize.value, 10) || 25;
        state.audit.offset = 0;
        await fetchAuditLogs();
      });
    }

    const auditRefresh = $('#audit-refresh');
    if (auditRefresh) {
      auditRefresh.addEventListener('click', async () => {
        if (auditActor) state.audit.actorQuery = String(auditActor.value || '').trim();
        state.audit.offset = 0;
        await fetchAuditLogs();
      });
    }

    const auditPrev = $('#audit-prev');
    if (auditPrev) {
      auditPrev.addEventListener('click', async () => {
        state.audit.offset = Math.max(0, state.audit.offset - state.audit.pageSize);
        await fetchAuditLogs();
      });
    }

    const auditNext = $('#audit-next');
    if (auditNext) {
      auditNext.addEventListener('click', async () => {
        if (state.audit.hasMore) {
          state.audit.offset += state.audit.pageSize;
          await fetchAuditLogs();
        }
      });
    }

    const auditBody = $('#audit-log-body');
    if (auditBody) {
      auditBody.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-audit-detail]');
        if (!btn) return;
        const detailId = btn.getAttribute('data-audit-detail');
        if (!detailId) return;
        const detail = document.getElementById(detailId);
        if (!detail) return;
        const isOpen = detail.style.display !== 'none';
        if (isOpen) detail.style.display = 'none';
        else detail.style.removeProperty('display');
        btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
        btn.textContent = isOpen ? 'Ver detalhes' : 'Ocultar detalhes';
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Post Limits Panel
  // ─────────────────────────────────────────────────────────────────────────────

  const limitsState = {
    selectedUser: null, // { id, name }
    limits: [],
    limitsLoaded: false,
    limitsLoading: false,
    floodLimits: [],
    floodLimitsLoaded: false,
    floodLimitsLoading: false,
  };

  function showLimitsFeedback(msg, isError) {
    const el = $('#post-limits-feedback');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    el.style.cssText = `display:block;margin-bottom:10px;border-radius:8px;padding:9px 13px;font-size:.88em;${
      isError
        ? 'background:rgba(244,67,54,.12);border:1px solid rgba(244,67,54,.35);color:#ef9a9a;'
        : 'background:rgba(76,175,80,.12);border:1px solid rgba(76,175,80,.35);color:#a5d6a7;'
    }`;
    setTimeout(() => { if (el.textContent === msg) el.style.display = 'none'; }, 3500);
  }

  async function fetchPostLimits() {
    const client = getClient();
    if (!client) return;
    const requestSeq = ++_limitsRequestSeq;
    const tbody = $('#post-limits-body');
    const refreshButton = $('#post-limits-refresh');
    limitsState.limitsLoading = true;
    setTableRegionBusy(tbody, refreshButton, true, 'Atualizando…');
    renderTableRequestState(tbody, 5, 'Carregando limites…', true);
    try {
      const { data, error } = await client.rpc('kc_admin_get_post_limits');
      if (requestSeq !== _limitsRequestSeq) return;
      const responseError = error || (data && data.ok === false ? { message: data.message || data.error } : null);
      if (responseError) {
        renderTableRequestState(tbody, 5, `Erro: ${String(responseError.message || 'Falha ao carregar limites')}`, false);
        return;
      }
      const limits = (data && data.limits) ? data.limits : (Array.isArray(data) ? data : []);
      limitsState.limits = limits;
      limitsState.limitsLoaded = true;
      renderPostLimits(limits);
    } catch (error) {
      if (requestSeq !== _limitsRequestSeq) return;
      renderTableRequestState(tbody, 5, `Erro: ${getErrorMessage(error, 'Falha ao carregar limites')}`, false);
    } finally {
      if (requestSeq === _limitsRequestSeq) {
        limitsState.limitsLoading = false;
        setTableRegionBusy(tbody, refreshButton, false);
      }
    }
  }

  function renderPostLimits(limits) {
    const tbody = $('#post-limits-body');
    if (!tbody) return;
    if (!limits || !limits.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--kc-text-dark-secondary);padding:14px;">Nenhum override configurado. O padrão é 5 para todos.</td></tr>';
      return;
    }
    tbody.innerHTML = limits.map((row) => {
      const userName = row.user_name ? escape(row.user_name) : '<em style="color:var(--kc-text-dark-secondary)">Global (todos)</em>';
      const moduleName = row.module ? escape(row.module) : '<em style="color:var(--kc-text-dark-secondary)">Todos os módulos</em>';
      const createdAt = row.created_at ? new Date(row.created_at).toLocaleDateString('pt-BR') : '—';
      return `<tr>
        <td data-label="Usuário">${userName}</td>
        <td data-label="Módulo">${moduleName}</td>
        <td data-label="Máx. Ativas"><strong>${escape(String(row.max_active))}</strong></td>
        <td data-label="Criado em">${createdAt}</td>
        <td data-label="Ações">
          <button type="button" class="kc-admin-actions" data-limit-delete="${escape(String(row.id))}" style="padding:5px 10px;border:none;border-radius:6px;cursor:pointer;color:#fff;font-size:.8em;background:#c0392b;">
            <i class="fas fa-trash" aria-hidden="true"></i> Remover
          </button>
        </td>
      </tr>`;
    }).join('');
  }

  async function fetchPostFloodLimits() {
    const client = getClient();
    if (!client) return;
    const requestSeq = ++_floodLimitsRequestSeq;
    const tbody = $('#post-flood-limits-body');
    const refreshButton = $('#post-flood-limits-refresh');
    limitsState.floodLimitsLoading = true;
    setTableRegionBusy(tbody, refreshButton, true, 'Atualizando…');
    renderTableRequestState(tbody, 5, 'Carregando limites de ritmo…', true);
    try {
      const { data, error } = await client.rpc('kc_admin_get_post_flood_limits');
      if (requestSeq !== _floodLimitsRequestSeq) return;
      if (error) {
        const msg = isFunctionMissing(error)
          ? 'Migration de ritmo ainda não aplicada no Supabase.'
          : String(error.message || 'Falha ao carregar ritmos');
        renderTableRequestState(tbody, 5, msg, false);
        return;
      }
      const limits = (data && data.limits) ? data.limits : (Array.isArray(data) ? data : []);
      limitsState.floodLimits = limits;
      limitsState.floodLimitsLoaded = true;
      renderPostFloodLimits(limits);
    } catch (error) {
      if (requestSeq !== _floodLimitsRequestSeq) return;
      renderTableRequestState(tbody, 5, `Erro: ${String(error && error.message || error || 'Falha ao carregar ritmos')}`, false);
    } finally {
      if (requestSeq === _floodLimitsRequestSeq) {
        limitsState.floodLimitsLoading = false;
        setTableRegionBusy(tbody, refreshButton, false);
      }
    }
  }

  function renderPostFloodLimits(limits) {
    const tbody = $('#post-flood-limits-body');
    if (!tbody) return;
    if (!limits || !limits.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--kc-text-dark-secondary);padding:14px;">Nenhum ritmo configurado. O padrão anti-spam é 3 posts por 60 minutos.</td></tr>';
      return;
    }
    tbody.innerHTML = limits.map((row) => {
      const userName = row.user_name ? escape(row.user_name) : '<em style="color:var(--kc-text-dark-secondary)">Global (todos)</em>';
      const moduleName = row.module ? escape(row.module) : '<em style="color:var(--kc-text-dark-secondary)">Todos os módulos</em>';
      const createdAt = row.created_at ? new Date(row.created_at).toLocaleDateString('pt-BR') : '—';
      const maxPosts = Number.isFinite(Number(row.max_posts)) ? Number(row.max_posts) : 0;
      const windowMinutes = Number.isFinite(Number(row.window_minutes)) ? Number(row.window_minutes) : 60;
      return `<tr>
        <td data-label="Usuário">${userName}</td>
        <td data-label="Módulo">${moduleName}</td>
        <td data-label="Ritmo"><strong>${escape(String(maxPosts))}</strong> posts / ${escape(String(windowMinutes))} min</td>
        <td data-label="Criado em">${createdAt}</td>
        <td data-label="Ações">
          <button type="button" class="kc-admin-actions" data-flood-limit-delete="${escape(String(row.id))}" style="padding:5px 10px;border:none;border-radius:6px;cursor:pointer;color:#fff;font-size:.8em;background:#c0392b;">
            <i class="fas fa-trash" aria-hidden="true"></i> Remover
          </button>
        </td>
      </tr>`;
    }).join('');
  }

  function parseLimitNumber(selector, options) {
    const el = $(selector);
    const value = el ? parseInt(el.value, 10) : NaN;
    const min = options && Number.isFinite(options.min) ? options.min : 0;
    const max = options && Number.isFinite(options.max) ? options.max : 1000;
    if (!Number.isFinite(value) || value < min || value > max) return null;
    return value;
  }

  async function runLimitOperation(button, loadingLabel, operation, busyRow) {
    if (busyRow) busyRow.setAttribute('aria-busy', 'true');
    setControlBusy(button, true, loadingLabel);
    try {
      return await operation();
    } catch (error) {
      console.error('[Admin moderation] limit operation:', error);
      showLimitsFeedback('Erro de rede: ' + getErrorMessage(error, 'não foi possível concluir a operação.'), true);
      return null;
    } finally {
      setControlBusy(button, false);
      if (busyRow) busyRow.removeAttribute('aria-busy');
    }
  }

  function getRpcOperationError(response, fallback) {
    if (!response) return fallback;
    if (response.error) return getErrorMessage(response.error, fallback);
    if (response.data && response.data.ok === false) {
      return String(response.data.message || response.data.error || fallback);
    }
    return '';
  }

  async function saveGlobalLimit() {
    const client = getClient();
    if (!client) return;
    const moduleEl = $('#limit-global-module');
    const mod = (moduleEl && moduleEl.value) ? moduleEl.value.trim() : null;
    const val = parseLimitNumber('#limit-global-value', { min: 1, max: 1000 });
    if (val == null) { showLimitsFeedback('Informe um valor válido entre 1 e 1000.', true); return; }
    const btn = $('#limit-global-save');
    const response = await runLimitOperation(btn, 'Salvando…', () =>
      client.rpc('kc_admin_set_post_limit', { p_user_id: null, p_module: mod || null, p_max_active: val })
    );
    const errorMessage = getRpcOperationError(response, 'Falha ao salvar limite global.');
    if (errorMessage) { showLimitsFeedback('Erro: ' + errorMessage, true); return; }
    showLimitsFeedback('Limite global salvo com sucesso!', false);
    await fetchPostLimits();
  }

  async function deleteGlobalLimit() {
    const client = getClient();
    if (!client) return;
    const moduleEl = $('#limit-global-module');
    const mod = (moduleEl && moduleEl.value) ? moduleEl.value.trim() : null;
    // Find matching global limit in loaded list
    const match = limitsState.limits.find((r) => !r.user_id && (mod ? r.module === mod : !r.module));
    if (!match) { showLimitsFeedback('Nenhum override global encontrado para remover.', true); return; }
    if (!window.confirm('Remover este limite global e voltar ao padrão da plataforma?')) return;
    const response = await runLimitOperation($('#limit-global-delete'), 'Removendo…', () =>
      client.rpc('kc_admin_delete_post_limit', { p_limit_id: match.id })
    );
    const errorMessage = getRpcOperationError(response, 'Falha ao remover limite global.');
    if (errorMessage) { showLimitsFeedback('Erro: ' + errorMessage, true); return; }
    showLimitsFeedback('Override global removido.', false);
    await fetchPostLimits();
  }

  async function saveUserLimit() {
    const client = getClient();
    if (!client) return;
    if (!limitsState.selectedUser) { showLimitsFeedback('Selecione um usuário antes de salvar.', true); return; }
    const moduleEl = $('#limit-user-module');
    const mod = (moduleEl && moduleEl.value) ? moduleEl.value.trim() : null;
    const val = parseLimitNumber('#limit-user-value', { min: 0, max: 1000 });
    if (val == null) { showLimitsFeedback('Informe um valor válido entre 0 e 1000 (0 = bloqueado).', true); return; }
    const btn = $('#limit-user-save');
    const selectedUser = { ...limitsState.selectedUser };
    const response = await runLimitOperation(btn, 'Salvando…', () =>
      client.rpc('kc_admin_set_post_limit', { p_user_id: selectedUser.id, p_module: mod || null, p_max_active: val })
    );
    const errorMessage = getRpcOperationError(response, 'Falha ao salvar limite do usuário.');
    if (errorMessage) { showLimitsFeedback('Erro: ' + errorMessage, true); return; }
    showLimitsFeedback(`Limite de ${val} salvo para ${selectedUser.name}.`, false);
    await fetchPostLimits();
  }

  async function deleteLimitById(limitId, button, row) {
    const client = getClient();
    if (!client) return;
    const response = await runLimitOperation(
      button,
      'Removendo…',
      () => client.rpc('kc_admin_delete_post_limit', { p_limit_id: limitId }),
      row
    );
    const errorMessage = getRpcOperationError(response, 'Falha ao remover limite.');
    if (errorMessage) { showLimitsFeedback('Erro: ' + errorMessage, true); return; }
    showLimitsFeedback('Override removido com sucesso.', false);
    await fetchPostLimits();
  }

  async function saveFloodLimit(scope) {
    const client = getClient();
    if (!client) return;
    const isUser = scope === 'user';
    if (isUser && !limitsState.selectedUser) {
      showLimitsFeedback('Selecione um usuário antes de salvar o ritmo.', true);
      return;
    }
    const moduleEl = isUser ? $('#flood-user-module') : $('#flood-global-module');
    const mod = (moduleEl && moduleEl.value) ? moduleEl.value.trim() : null;
    const maxPosts = parseLimitNumber(isUser ? '#flood-user-max' : '#flood-global-max', { min: 0, max: 1000 });
    const windowMinutes = parseLimitNumber(isUser ? '#flood-user-window' : '#flood-global-window', { min: 1, max: 10080 });
    if (maxPosts == null) { showLimitsFeedback('Informe um máximo válido de posts entre 0 e 1000.', true); return; }
    if (windowMinutes == null) { showLimitsFeedback('Informe uma janela válida entre 1 minuto e 7 dias.', true); return; }

    const btn = isUser ? $('#flood-user-save') : $('#flood-global-save');
    const selectedUser = isUser ? { ...limitsState.selectedUser } : null;
    const response = await runLimitOperation(btn, 'Salvando…', () =>
      client.rpc('kc_admin_set_post_flood_limit', {
        p_user_id: selectedUser ? selectedUser.id : null,
        p_module: mod || null,
        p_max_posts: maxPosts,
        p_window_minutes: windowMinutes,
      })
    );
    const errorMessage = getRpcOperationError(response, 'Falha ao salvar ritmo.');
    if (errorMessage) { showLimitsFeedback('Erro: ' + errorMessage, true); return; }
    showLimitsFeedback(selectedUser ? `Ritmo salvo para ${selectedUser.name}.` : 'Ritmo global salvo com sucesso!', false);
    await fetchPostFloodLimits();
    await fetchAuditLogs();
  }

  async function resetUserFloodLimit() {
    const client = getClient();
    if (!client) return;
    if (!limitsState.selectedUser) {
      showLimitsFeedback('Selecione um usuário antes de resetar o bloqueio.', true);
      return;
    }
    const moduleEl = $('#flood-user-module');
    const mod = (moduleEl && moduleEl.value) ? moduleEl.value.trim() : null;
    const label = limitsState.selectedUser.name || limitsState.selectedUser.id;
    const selectedUserId = limitsState.selectedUser.id;
    const scopeLabel = mod ? ` no módulo ${mod}` : '';
    if (!window.confirm(`Resetar o bloqueio de ritmo de ${label}${scopeLabel}? Isso permite nova publicação imediatamente.`)) return;

    const btn = $('#flood-user-reset');
    const response = await runLimitOperation(btn, 'Resetando…', () =>
      client.rpc('kc_admin_reset_post_flood_limit', {
        p_user_id: selectedUserId,
        p_module: mod || null,
        p_reason: 'admin_moderation_panel',
      })
    );
    const errorMessage = getRpcOperationError(response, 'Falha ao resetar bloqueio.');
    if (errorMessage) { showLimitsFeedback('Erro: ' + errorMessage, true); return; }
    const data = response && response.data;
    const check = data && data.check ? data.check : {};
    const remaining = Number.isFinite(Number(check.remaining)) ? Number(check.remaining) : null;
    showLimitsFeedback(`Bloqueio resetado para ${label}. ${remaining != null ? `${remaining} publicação(ões) disponíveis na janela atual.` : 'O usuário pode tentar publicar novamente.'}`, false);
    await fetchPostFloodLimits();
    await fetchAuditLogs();
  }

  async function deleteGlobalFloodLimit() {
    const client = getClient();
    if (!client) return;
    const moduleEl = $('#flood-global-module');
    const mod = (moduleEl && moduleEl.value) ? moduleEl.value.trim() : null;
    const match = limitsState.floodLimits.find((r) => !r.user_id && (mod ? r.module === mod : !r.module));
    if (!match) { showLimitsFeedback('Nenhum ritmo global encontrado para remover.', true); return; }
    if (!window.confirm('Remover este ritmo global e voltar ao padrão anti-spam?')) return;
    await deleteFloodLimitById(match.id, $('#flood-global-delete'), null);
  }

  async function deleteFloodLimitById(limitId, button, row) {
    const client = getClient();
    if (!client) return;
    const response = await runLimitOperation(
      button,
      'Removendo…',
      () => client.rpc('kc_admin_delete_post_flood_limit', { p_limit_id: limitId }),
      row
    );
    const errorMessage = getRpcOperationError(response, 'Falha ao remover ritmo.');
    if (errorMessage) { showLimitsFeedback('Erro: ' + errorMessage, true); return; }
    showLimitsFeedback('Ritmo removido com sucesso.', false);
    await fetchPostFloodLimits();
    await fetchAuditLogs();
  }

  async function searchUsersForLimit(query) {
    const client = getClient();
    const normalized = String(query || '').trim();
    if (!client || normalized.length < 2) return [];
    try {
      const { data, error } = await client.rpc('kc_admin_search_profiles_for_limits', {
        p_query: normalized,
        p_limit: 8,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []).map((row) => ({
        id: row.out_id,
        full_name: row.out_full_name || '',
        display_name: row.out_display_name || '',
        email: row.out_email || '',
      }));
    } catch (error) {
      console.error('[Admin moderation] searchUsersForLimit:', error);
      showLimitsFeedback('Não foi possível buscar usuários agora.', true);
      return [];
    }
  }

  function bindPostLimitsEvents() {
    const globalSave = $('#limit-global-save');
    if (globalSave) globalSave.addEventListener('click', saveGlobalLimit);

    const globalDelete = $('#limit-global-delete');
    if (globalDelete) globalDelete.addEventListener('click', deleteGlobalLimit);

    const userSave = $('#limit-user-save');
    if (userSave) userSave.addEventListener('click', saveUserLimit);

    const limitsRefresh = $('#post-limits-refresh');
    if (limitsRefresh) limitsRefresh.addEventListener('click', fetchPostLimits);

    const floodGlobalSave = $('#flood-global-save');
    if (floodGlobalSave) floodGlobalSave.addEventListener('click', () => saveFloodLimit('global'));

    const floodGlobalDelete = $('#flood-global-delete');
    if (floodGlobalDelete) floodGlobalDelete.addEventListener('click', deleteGlobalFloodLimit);

    const floodUserSave = $('#flood-user-save');
    if (floodUserSave) floodUserSave.addEventListener('click', () => saveFloodLimit('user'));

    const floodUserReset = $('#flood-user-reset');
    if (floodUserReset) floodUserReset.addEventListener('click', resetUserFloodLimit);

    const floodRefresh = $('#post-flood-limits-refresh');
    if (floodRefresh) floodRefresh.addEventListener('click', fetchPostFloodLimits);

    const limitsBody = $('#post-limits-body');
    if (limitsBody) {
      limitsBody.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('[data-limit-delete]');
        if (!btn) return;
        const lid = btn.getAttribute('data-limit-delete');
        if (!lid) return;
        if (!window.confirm('Remover este override de limite?')) return;
        await deleteLimitById(lid, btn, btn.closest('tr'));
      });
    }

    const floodLimitsBody = $('#post-flood-limits-body');
    if (floodLimitsBody) {
      floodLimitsBody.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('[data-flood-limit-delete]');
        if (!btn) return;
        const lid = btn.getAttribute('data-flood-limit-delete');
        if (!lid) return;
        if (!window.confirm('Remover este limite de ritmo?')) return;
        await deleteFloodLimitById(lid, btn, btn.closest('tr'));
      });
    }

    // User search autocomplete
    const userSearch = $('#limit-user-search');
    const userResults = $('#limit-user-results');
    const userSelectedEl = $('#limit-user-selected');

    let searchTimer = null;
    if (userSearch && userResults) {
      userSearch.addEventListener('input', () => {
        clearTimeout(searchTimer);
        _userSearchRequestSeq += 1;
        if (limitsState.selectedUser) {
          limitsState.selectedUser = null;
          if (userSelectedEl) {
            userSelectedEl.style.display = 'none';
            userSelectedEl.textContent = 'Nenhum usuário selecionado';
          }
        }
        const q = userSearch.value.trim();
        userSearch.setAttribute('aria-expanded', 'false');
        if (q.length < 2) { userResults.style.display = 'none'; return; }
        const requestSeq = _userSearchRequestSeq;
        searchTimer = setTimeout(async () => {
          const users = await searchUsersForLimit(q);
          if (requestSeq !== _userSearchRequestSeq || userSearch.value.trim() !== q) return;
          if (!users.length) { userResults.style.display = 'none'; return; }
          userResults.innerHTML = users.map((u) => {
            const label = escape(u.display_name || u.full_name || u.email || u.id);
            const sub = escape(u.email || u.id || '');
            return `<div role="option" tabindex="0" data-user-id="${escape(u.id)}" data-user-name="${label}" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--kc-border-dark);font-size:.88em;">
              <strong>${label}</strong>${sub ? `<br><span style="color:var(--kc-text-dark-secondary);font-size:.83em;">${sub}</span>` : ''}
            </div>`;
          }).join('');
          userResults.style.display = 'block';
          userSearch.setAttribute('aria-expanded', 'true');
        }, 300);
      });

      const selectUserResult = (item) => {
        if (!item) return;
        const uid = item.getAttribute('data-user-id');
        const uname = item.getAttribute('data-user-name');
        limitsState.selectedUser = { id: uid, name: uname };
        userSearch.value = uname;
        userResults.style.display = 'none';
        userSearch.setAttribute('aria-expanded', 'false');
        if (userSelectedEl) {
          userSelectedEl.style.display = 'block';
          userSelectedEl.innerHTML = `<i class="fas fa-user" style="margin-right:6px;color:var(--kc-primary-brand);" aria-hidden="true"></i>Usuário selecionado: <strong>${escape(uname)}</strong> <span style="color:var(--kc-text-dark-secondary);font-size:.82em;">(${escape(uid)})</span>`;
        }
      };

      userResults.addEventListener('click', (ev) => {
        selectUserResult(ev.target.closest('[data-user-id]'));
      });
      userResults.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        const item = ev.target.closest('[data-user-id]');
        if (!item) return;
        ev.preventDefault();
        selectUserResult(item);
      });

      document.addEventListener('click', (ev) => {
        if (!userResults.contains(ev.target) && ev.target !== userSearch) {
          userResults.style.display = 'none';
          userSearch.setAttribute('aria-expanded', 'false');
        }
      });
    }
  }

  function showLoadingSkeletons() {
    const posts = $('#moderation-posts-body');
    if (posts && !posts.children.length) {
      posts.innerHTML = '<tr><td colspan="99" style="padding:8px 0;border:0;"><div class="kc-skeleton" style="height:20px;"></div></td></tr>'.repeat(6);
    }
  }

  async function boot() {
    setLoading(true);
    initStatusFilter();
    try {
      const ok = await checkAdminAccess();
      if (!ok) {
        setTimeout(() => { window.location.replace('../index.html'); }, 2500);
        return;
      }

      setLoading(false);
      $('#admin-content').style.display = 'block';
      showLoadingSkeletons();
      bindEvents();
      bindPostLimitsEvents();
      renderSessionActions();

      const results = await Promise.allSettled([
        fetchPosts(true),
        fetchAuditLogs(),
        fetchPostLimits(),
        fetchPostFloodLimits(),
      ]);
      const failures = results.filter((result) => result.status === 'rejected');
      if (failures.length) {
        console.error('[Admin moderation] initial partial failures:', failures);
        showToastSafe('O painel abriu, mas algumas seções não puderam ser atualizadas.', 'error', 4200);
      }
    } catch (error) {
      console.error('[Admin moderation] boot:', error);
      showError('Não foi possível inicializar o painel de moderação.', true);
      showToastSafe('Falha ao carregar a moderação. Tente atualizar a página.', 'error', 4200);
    } finally {
      setLoading(false);
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();

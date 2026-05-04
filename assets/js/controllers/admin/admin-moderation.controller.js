/*
  KinoCampus — Admin Moderation Controller (V8.1.11.0)
  Moderacao de posts + observabilidade (audit log).
*/
(function () {
  'use strict';

  const PAGE_SIZE = 25;
  const SEARCH_DEBOUNCE_MS = 350;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let _isBusy = false;
  let _searchDebounceTimer = null;
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
    return code === '42883' || (message.includes('function') && message.includes('does not exist'));
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

  function showError(msg, allowBack) {
    const el = $('#admin-error');
    if (!el) return;
    el.innerHTML = `${escape(msg)}${allowBack ? ' <a href="../index.html" style="color:#ef9a9a;">Voltar ao início</a>' : ''}`;
    el.style.display = 'block';
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
    if (el) el.style.display = visible ? 'flex' : 'none';
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
    const client = getClient();
    if (!client) return;

    if (reset) {
      state.offset = 0;
      state.posts = [];
      state.totalCount = 0;
    }

    const normalizedSearch = sanitizeSearchTerm(state.search);
    const statusFilter = state.statusFilter !== 'all' ? state.statusFilter : null;
    let list = [];
    let totalCount = 0;
    let resolved = false;

    try {
      const rpc = await client.rpc('kc_admin_search_posts_full', {
        p_query: normalizedSearch || null,
        p_status: statusFilter,
        p_limit: PAGE_SIZE,
        p_offset: state.offset,
      });

      if (rpc && !rpc.error && Array.isArray(rpc.data)) {
        list = rpc.data.map(mapRpcPost);
        totalCount = rpc.data.length ? Number(rpc.data[0].total_count || 0) : 0;
        resolved = true;
      } else if (rpc && rpc.error && !isFunctionMissing(rpc.error)) {
        console.error('[Admin moderation] fetchPosts rpc:', rpc.error);
      }
    } catch (rpcError) {
      console.error('[Admin moderation] fetchPosts rpc exception:', rpcError);
    }

    if (!resolved) {
      let query = client
        .from('posts')
        .select('id, legacy_id, title, content, module, category, status, created_at, updated_at, author_id, author:profiles!posts_author_id_fkey(display_name,full_name)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(state.offset, state.offset + PAGE_SIZE - 1);

      if (statusFilter) query = query.eq('status', statusFilter);

      if (normalizedSearch) {
        const authorIds = await searchAuthorIds(client, normalizedSearch);
        const clauses = [
          `title.ilike.%${normalizedSearch}%`,
          `content.ilike.%${normalizedSearch}%`,
          `legacy_id.ilike.%${normalizedSearch}%`,
        ];
        if (UUID_RE.test(normalizedSearch)) {
          clauses.push(`id.eq.${normalizedSearch}`);
        }
        if (authorIds.length) {
          clauses.push(`author_id.in.(${authorIds.join(',')})`);
        }
        query = query.or(clauses.join(','));
      }

      const { data, error, count } = await query;
      if (error) {
        console.error('[Admin moderation] fetchPosts:', error);
        showError('Erro ao listar posts. Verifique policies/admin no Supabase.', false);
        return;
      }

      list = data || [];
      totalCount = Number.isFinite(Number(count)) ? Number(count) : list.length;
    }

    state.totalCount = totalCount;
    state.hasMore = (state.offset + list.length) < totalCount;
    state.posts = reset ? list : state.posts.concat(list);
    state.offset += list.length;
    renderPosts();
  }

  function formatPayload(payload) {
    try {
      return JSON.stringify(payload || {}, null, 2);
    } catch (_) {
      return '{}';
    }
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

    const empty = $('#audit-log-empty');
    const rows = Array.isArray(state.audit.rows) ? state.audit.rows : [];
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--kc-text-dark-secondary);padding:20px;">Nenhum log encontrado para os filtros selecionados.</td></tr>';
      if (empty) empty.style.display = 'block';
      renderAuditPagination();
      return;
    }

    if (empty) empty.style.display = 'none';
    body.innerHTML = rows.map((row, idx) => {
      const detailId = `audit-detail-${idx}`;
      const payload = escape(formatPayload(row.payload));

      return `<tr>
        <td data-label="Data">${escape(fmtDate(row.created_at))}</td>
        <td data-label="Ação"><code>${escape(row.action || '—')}</code></td>
        <td data-label="Entidade"><code>${escape(row.entity_type || '—')}</code></td>
        <td data-label="entity_id"><code style="font-size:.8em;">${escape((row.entity_id || '—').substring(0,12))}…</code></td>
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

    const body = $('#audit-log-body');
    if (body) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--kc-text-dark-secondary);padding:18px;">Carregando logs…</td></tr>';
    }
    setAuditError('');

    const actorQuery = String(state.audit.actorQuery || '').trim();
    const actorQueryLower = actorQuery.toLowerCase();
    const actorQueryIsUuid = actorQuery && UUID_RE.test(actorQuery);
    const limit = state.audit.pageSize;
    const offset = state.audit.offset;

    // Usar RPC paginada — buscar limit+1 para detectar hasMore
    let rows = [];
    let fetchOk = false;

    try {
      const rpc = await client.rpc('kc_admin_list_audit_logs', {
        p_entity_type: state.audit.entityType,
        p_action: state.audit.action,
        p_actor_query: actorQueryIsUuid ? actorQuery : (actorQuery || null),
        p_limit: limit + 1,
        p_offset: offset,
      });

      if (rpc && !rpc.error && Array.isArray(rpc.data)) {
        rows = rpc.data;
        fetchOk = true;
      } else if (rpc && rpc.error) {
        console.error('[Admin moderation] fetchAuditLogs rpc:', rpc.error);
      }
    } catch (rpcErr) {
      console.error('[Admin moderation] fetchAuditLogs rpc exceção:', rpcErr);
    }

    // Fallback: query direta (sem offset — apenas primeira página)
    if (!fetchOk) {
      try {
        let query = client
          .from('audit_log')
          .select('id, created_at, action, entity_type, entity_id, actor_id, payload')
          .order('created_at', { ascending: false })
          .limit(limit + 1);

        if (state.audit.entityType !== 'all') query = query.eq('entity_type', state.audit.entityType);
        if (state.audit.action !== 'all') query = query.eq('action', state.audit.action);
        if (actorQueryIsUuid) query = query.eq('actor_id', actorQuery);

        const { data, error } = await query;
        if (error) {
          console.error('[Admin moderation] fetchAuditLogs direct:', error);
          state.audit.rows = [];
          state.audit.hasMore = false;
          renderAuditLogs();
          setAuditError('Não foi possível carregar o audit log. Verifique migration/RLS no Supabase.');
          return;
        }
        rows = data || [];
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
    state.audit.actorsById = await loadActorsById(actorIds);

    // Filtro client-side por nome do ator (quando não é UUID)
    if (actorQuery && !actorQueryIsUuid) {
      state.audit.rows = rows.filter((row) => {
        const actorId = String(row.actor_id || '').toLowerCase();
        const actor = state.audit.actorsById[String(row.actor_id || '')] || null;
        const displayName = String(actor && actor.display_name || '').toLowerCase();
        const fullName = String(actor && actor.full_name || '').toLowerCase();
        return actorId.includes(actorQueryLower)
          || displayName.includes(actorQueryLower)
          || fullName.includes(actorQueryLower);
      });
    } else {
      state.audit.rows = rows;
    }

    renderAuditLogs();
  }

  function statusBadge(status) {
    const map = { published: '#4caf50', pending: '#757575', hidden: '#ef6c00', deleted: '#c62828' };
    return `<span class="kc-badge" style="background:${map[status] || '#546e7a'};">${escape(status || 'unknown')}</span>`;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR'); } catch (_) { return iso; }
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

        return `<tr data-id="${escape(p.id)}">
          <td data-label="Post">
            <strong>${escape(p.title || '(sem título)')}</strong><br>
            <span style="font-size:.8em;color:var(--kc-text-dark-secondary);">${idRef}</span>
          </td>
          <td data-label="Autor">${escape(author)}</td>
          <td data-label="Módulo/Categoria">${escape(moduleInfo)}</td>
          <td data-label="Status" data-col="status">${statusBadge(p.status)}</td>
          <td data-label="Atualizado em" data-col="updated">${escape(fmtDate(p.updated_at || p.created_at))}</td>
          <td data-label="Ações">
            <div class="kc-admin-actions">
              ${actionButton('Ocultar', 'hidden', '#ef6c00', p.status === 'hidden')}
              ${actionButton('Restaurar', 'published', '#2e7d32', p.status === 'published')}
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
      `<li><code>${escape(item.postId)}</code> → <strong>${escape(item.action)}</strong> (${escape(fmtDate(item.timestamp))})</li>`).join('');
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
          const res = await client
            .from('posts')
            .update({ status })
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

      state.sessionActions.unshift({ postId, action: status, timestamp: new Date().toISOString() });
      if (state.sessionActions.length > 30) state.sessionActions.pop();
      renderPosts();
      renderSessionActions();
      showFeedback(status === 'hidden' ? 'Post ocultado.' : status === 'published' ? 'Post restaurado/publicado.' : 'Post marcado como deletado.');
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
    const statuses = ['all', 'published', 'pending', 'hidden', 'deleted'];
    select.innerHTML = statuses.map((s) => `<option value="${s}">${s === 'all' ? 'Todos status' : s}</option>`).join('');
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
        btn.dataset.kcBusy = '1';
        btn.disabled = true;
        try {
          await updatePostStatus(row.getAttribute('data-id'), btn.getAttribute('data-action'));
        } finally {
          btn.disabled = false;
          delete btn.dataset.kcBusy;
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
        detail.style.display = isOpen ? 'none' : 'table-row';
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
    const tbody = $('#post-limits-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--kc-text-dark-secondary);padding:14px;">Carregando…</td></tr>';
    const { data, error } = await client.rpc('kc_admin_get_post_limits');
    if (error) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="color:#ef9a9a;padding:10px;">Erro: ${escape(String(error.message || 'Falha ao carregar limites'))}</td></tr>`;
      return;
    }
    const limits = (data && data.limits) ? data.limits : (Array.isArray(data) ? data : []);
    limitsState.limits = limits;
    renderPostLimits(limits);
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

  async function saveGlobalLimit() {
    const client = getClient();
    if (!client) return;
    const moduleEl = $('#limit-global-module');
    const valueEl = $('#limit-global-value');
    const mod = (moduleEl && moduleEl.value) ? moduleEl.value.trim() : null;
    const val = valueEl ? parseInt(valueEl.value, 10) : NaN;
    if (!val || val < 1) { showLimitsFeedback('Informe um valor válido (mínimo 1).', true); return; }
    const btn = $('#limit-global-save');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Salvando…'; }
    const { error } = await client.rpc('kc_admin_set_post_limit', { p_user_id: null, p_module: mod || null, p_max_active: val });
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save" aria-hidden="true"></i> Salvar limite global'; }
    if (error) { showLimitsFeedback('Erro: ' + String(error.message || error), true); return; }
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
    const { error } = await client.rpc('kc_admin_delete_post_limit', { p_limit_id: match.id });
    if (error) { showLimitsFeedback('Erro: ' + String(error.message || error), true); return; }
    showLimitsFeedback('Override global removido.', false);
    await fetchPostLimits();
  }

  async function saveUserLimit() {
    const client = getClient();
    if (!client) return;
    if (!limitsState.selectedUser) { showLimitsFeedback('Selecione um usuário antes de salvar.', true); return; }
    const moduleEl = $('#limit-user-module');
    const valueEl = $('#limit-user-value');
    const mod = (moduleEl && moduleEl.value) ? moduleEl.value.trim() : null;
    const val = valueEl ? parseInt(valueEl.value, 10) : NaN;
    if (isNaN(val) || val < 0) { showLimitsFeedback('Informe um valor válido (0 = bloqueado, mínimo 1 para ativo).', true); return; }
    const btn = $('#limit-user-save');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Salvando…'; }
    const { error } = await client.rpc('kc_admin_set_post_limit', { p_user_id: limitsState.selectedUser.id, p_module: mod || null, p_max_active: val });
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save" aria-hidden="true"></i> Salvar'; }
    if (error) { showLimitsFeedback('Erro: ' + String(error.message || error), true); return; }
    showLimitsFeedback(`Limite de ${val} salvo para ${limitsState.selectedUser.name}.`, false);
    await fetchPostLimits();
  }

  async function deleteLimitById(limitId) {
    const client = getClient();
    if (!client) return;
    const { error } = await client.rpc('kc_admin_delete_post_limit', { p_limit_id: limitId });
    if (error) { showLimitsFeedback('Erro: ' + String(error.message || error), true); return; }
    showLimitsFeedback('Override removido com sucesso.', false);
    await fetchPostLimits();
  }

  async function searchUsersForLimit(query) {
    const client = getClient();
    if (!client || !query || query.length < 2) return [];
    const { data } = await client
      .from('profiles')
      .select('id, full_name, display_name, email')
      .or(`full_name.ilike.%${query}%,display_name.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(8);
    return data || [];
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

    const limitsBody = $('#post-limits-body');
    if (limitsBody) {
      limitsBody.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('[data-limit-delete]');
        if (!btn) return;
        const lid = btn.getAttribute('data-limit-delete');
        if (!lid) return;
        if (!window.confirm('Remover este override de limite?')) return;
        await deleteLimitById(lid);
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
        const q = userSearch.value.trim();
        if (q.length < 2) { userResults.style.display = 'none'; return; }
        searchTimer = setTimeout(async () => {
          const users = await searchUsersForLimit(q);
          if (!users.length) { userResults.style.display = 'none'; return; }
          userResults.innerHTML = users.map((u) => {
            const label = escape(u.display_name || u.full_name || u.email || u.id);
            const sub = escape(u.email || u.id || '');
            return `<div data-user-id="${escape(u.id)}" data-user-name="${label}" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--kc-border-dark);font-size:.88em;">
              <strong>${label}</strong>${sub ? `<br><span style="color:var(--kc-text-dark-secondary);font-size:.83em;">${sub}</span>` : ''}
            </div>`;
          }).join('');
          userResults.style.display = 'block';
        }, 300);
      });

      userResults.addEventListener('click', (ev) => {
        const item = ev.target.closest('[data-user-id]');
        if (!item) return;
        const uid = item.getAttribute('data-user-id');
        const uname = item.getAttribute('data-user-name');
        limitsState.selectedUser = { id: uid, name: uname };
        userSearch.value = uname;
        userResults.style.display = 'none';
        if (userSelectedEl) {
          userSelectedEl.style.display = 'block';
          userSelectedEl.innerHTML = `<i class="fas fa-user" style="margin-right:6px;color:var(--kc-primary-brand);" aria-hidden="true"></i>Usuário selecionado: <strong>${escape(uname)}</strong> <span style="color:var(--kc-text-dark-secondary);font-size:.82em;">(${escape(uid)})</span>`;
        }
      });

      document.addEventListener('click', (ev) => {
        if (!userResults.contains(ev.target) && ev.target !== userSearch) {
          userResults.style.display = 'none';
        }
      });
    }
  }

  async function boot() {
    setLoading(true);
    initStatusFilter();
    const ok = await checkAdminAccess();
    setLoading(false);
    if (!ok) {
      setTimeout(() => { window.location.replace('../index.html'); }, 2500);
      return;
    }

    $('#admin-content').style.display = 'block';
    bindEvents();
    bindPostLimitsEvents();
    renderSessionActions();
    await Promise.all([fetchPosts(true), fetchAuditLogs(), fetchPostLimits()]);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();

/*
  KinoCampus — Admin Moderation Controller (V8.1.11.0)
  Moderacao de posts + observabilidade (audit log).
*/
(function () {
  'use strict';

  const PAGE_SIZE = 25;
  const AUDIT_LIMIT = 50;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const state = {
    statusFilter: 'all',
    search: '',
    offset: 0,
    hasMore: false,
    posts: [],
    sessionActions: [],
    audit: {
      entityType: 'all',
      action: 'all',
      actorId: '',
      rows: [],
    },
  };

  const fallbackEscapeHtml = (str) => String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const escape = (str) => ((window.KCUtils && typeof window.KCUtils.escapeHtml === 'function')
    ? window.KCUtils.escapeHtml(str)
    : fallbackEscapeHtml(str));

  function $(sel, root) { return (root || document).querySelector(sel); }

  function getClient() {
    if (window.KCSupabase && typeof window.KCSupabase.getClient === 'function') return window.KCSupabase.getClient();
    return null;
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

  async function checkAdminAccess() {
    const drv = window.KCAPI && window.KCAPI.ENV && window.KCAPI.ENV.driver;
    if (drv !== 'supabase') {
      showError('O painel de administração requer driver=supabase.', true);
      return false;
    }

    const user = await window.KCAPI.getCurrentUser();
    if (!user) {
      showError('Você precisa estar autenticado para acessar este painel.', true);
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
      showError('Não foi possível validar permissões de administrador.', true);
      return false;
    }

    if (!profile.is_admin) {
      showError('Acesso negado. Apenas administradores podem acessar este painel.', true);
      return false;
    }

    const greeting = $('#admin-greeting');
    if (greeting) greeting.textContent = `Olá, ${profile.display_name || profile.full_name || user.email || 'Admin'}`;
    return true;
  }

  async function fetchPosts(reset) {
    const client = getClient();
    if (!client) return;

    if (reset) {
      state.offset = 0;
      state.posts = [];
    }

    let query = client
      .from('posts')
      .select('id, legacy_id, title, module, category, status, created_at, updated_at, author_id, author:profiles!posts_author_id_fkey(display_name,full_name)')
      .order('created_at', { ascending: false })
      .range(state.offset, state.offset + PAGE_SIZE - 1);

    if (state.statusFilter !== 'all') query = query.eq('status', state.statusFilter);

    const { data, error } = await query;
    if (error) {
      console.error('[Admin moderation] fetchPosts:', error);
      showError('Erro ao listar posts. Verifique policies/admin no Supabase.', false);
      return;
    }

    const list = data || [];
    state.hasMore = list.length === PAGE_SIZE;

    if (state.search) {
      const s = state.search.toLowerCase();
      const filtered = list.filter((p) =>
        String(p.title || '').toLowerCase().includes(s)
        || String(p.legacy_id || '').toLowerCase().includes(s)
        || String(p.id || '').toLowerCase().includes(s));
      state.posts = reset ? filtered : state.posts.concat(filtered);
    } else {
      state.posts = reset ? list : state.posts.concat(list);
    }

    state.offset += PAGE_SIZE;
    renderPosts();
  }

  function formatPayload(payload) {
    try {
      return JSON.stringify(payload || {}, null, 2);
    } catch (_) {
      return '{}';
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
      return;
    }

    if (empty) empty.style.display = 'none';
    body.innerHTML = rows.map((row, idx) => {
      const detailId = `audit-detail-${idx}`;
      const payload = escape(formatPayload(row.payload));

      return `<tr>
        <td>${escape(fmtDate(row.created_at))}</td>
        <td><code>${escape(row.action || '—')}</code></td>
        <td><code>${escape(row.entity_type || '—')}</code></td>
        <td><code>${escape(row.entity_id || '—')}</code></td>
        <td><code>${escape(row.actor_id || 'service_role/system')}</code></td>
        <td>
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
  }

  async function fetchAuditLogs() {
    const client = getClient();
    if (!client) return;

    const body = $('#audit-log-body');
    if (body) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--kc-text-dark-secondary);padding:18px;">Carregando logs…</td></tr>';
    }
    setAuditError('');

    const actor = String(state.audit.actorId || '').trim();
    if (actor && !UUID_RE.test(actor)) {
      state.audit.rows = [];
      renderAuditLogs();
      setAuditError('O filtro actor_id deve ser um UUID completo.');
      return;
    }

    let query = client
      .from('audit_log')
      .select('id, created_at, action, entity_type, entity_id, actor_id, payload')
      .order('created_at', { ascending: false })
      .limit(AUDIT_LIMIT);

    if (state.audit.entityType !== 'all') query = query.eq('entity_type', state.audit.entityType);
    if (state.audit.action !== 'all') query = query.eq('action', state.audit.action);
    if (actor) query = query.eq('actor_id', actor);

    const { data, error } = await query;
    if (error) {
      console.error('[Admin moderation] fetchAuditLogs:', error);
      state.audit.rows = [];
      renderAuditLogs();
      setAuditError('Não foi possível carregar o audit log. Verifique migration/RLS no Supabase.');
      return;
    }

    state.audit.rows = data || [];
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
    return `<button data-action="${action}" style="background:${color};" ${disabled ? 'disabled' : ''}>${label}</button>`;
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
          <td>
            <strong>${escape(p.title || '(sem título)')}</strong><br>
            <span style="font-size:.8em;color:var(--kc-text-dark-secondary);">${idRef}</span>
          </td>
          <td>${escape(author)}</td>
          <td>${escape(moduleInfo)}</td>
          <td data-col="status">${statusBadge(p.status)}</td>
          <td data-col="updated">${escape(fmtDate(p.updated_at || p.created_at))}</td>
          <td>
            <div class="kc-admin-actions">
              ${actionButton('Ocultar', 'hidden', '#ef6c00', p.status === 'hidden')}
              ${actionButton('Restaurar', 'published', '#2e7d32', p.status === 'published')}
              ${actionButton('Deletar', 'deleted', '#b71c1c', p.status === 'deleted')}
            </div>
          </td>
        </tr>`;
      }).join('');
    }

    const loadMore = $('#moderation-load-more');
    if (loadMore) loadMore.style.display = state.hasMore ? 'inline-block' : 'none';
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
    if (status === 'deleted' && !window.confirm('Tem certeza que deseja deletar este post?')) return;

    const client = getClient();
    if (!client) return;

    const { error } = await client.from('posts').update({ status }).eq('id', postId);
    if (error) {
      console.error('[Admin moderation] updatePostStatus:', error);
      showError(`Falha ao atualizar post ${postId}.`, false);
      return;
    }

    const post = state.posts.find((i) => i.id === postId);
    if (post) {
      post.status = status;
      post.updated_at = new Date().toISOString();
    }

    state.sessionActions.unshift({ postId, action: status, timestamp: new Date().toISOString() });
    renderPosts();
    renderSessionActions();
    showFeedback(status === 'hidden' ? 'Post ocultado.' : status === 'published' ? 'Post restaurado/publicado.' : 'Post marcado como deletado.');
    await fetchAuditLogs();
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
        btn.disabled = true;
        await updatePostStatus(row.getAttribute('data-id'), btn.getAttribute('data-action'));
        btn.disabled = false;
      });
    }

    const filter = $('#moderation-status-filter');
    if (filter) {
      filter.addEventListener('change', async () => {
        state.statusFilter = filter.value || 'all';
        await fetchPosts(true);
      });
    }

    const search = $('#moderation-search');
    if (search) {
      search.addEventListener('input', async () => {
        state.search = search.value.trim();
        await fetchPosts(true);
      });
    }

    const refresh = $('#moderation-refresh');
    if (refresh) refresh.addEventListener('click', () => fetchPosts(true));

    const loadMore = $('#moderation-load-more');
    if (loadMore) loadMore.addEventListener('click', () => fetchPosts(false));

    const auditEntity = $('#audit-entity-type-filter');
    if (auditEntity) {
      auditEntity.addEventListener('change', async () => {
        state.audit.entityType = auditEntity.value || 'all';
        await fetchAuditLogs();
      });
    }

    const auditAction = $('#audit-action-filter');
    if (auditAction) {
      auditAction.addEventListener('change', async () => {
        state.audit.action = auditAction.value || 'all';
        await fetchAuditLogs();
      });
    }

    const auditActor = $('#audit-actor-id-filter');
    if (auditActor) {
      auditActor.addEventListener('change', async () => {
        state.audit.actorId = String(auditActor.value || '').trim();
        await fetchAuditLogs();
      });
      auditActor.addEventListener('keydown', async (ev) => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        state.audit.actorId = String(auditActor.value || '').trim();
        await fetchAuditLogs();
      });
    }

    const auditRefresh = $('#audit-refresh');
    if (auditRefresh) {
      auditRefresh.addEventListener('click', async () => {
        if (auditActor) state.audit.actorId = String(auditActor.value || '').trim();
        await fetchAuditLogs();
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

  async function boot() {
    setLoading(true);
    initStatusFilter();
    const ok = await checkAdminAccess();
    setLoading(false);
    if (!ok) return;

    $('#admin-content').style.display = 'block';
    bindEvents();
    renderSessionActions();
    await Promise.all([fetchPosts(true), fetchAuditLogs()]);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();

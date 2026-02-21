/*
  KinoCampus — Admin Moderation Controller (V8.1.9.1)
  Moderação independente de denúncias.
*/
(function () {
  'use strict';

  const PAGE_SIZE = 25;
  const state = {
    statusFilter: 'all',
    search: '',
    offset: 0,
    hasMore: false,
    posts: [],
    sessionActions: [],
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
    await fetchPosts(true);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();

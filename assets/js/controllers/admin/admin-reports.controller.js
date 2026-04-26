/*
  KinoCampus — Admin Reports Controller (V8.1.7.4)

  Painel de triagem de denúncias.

  Dependências:
  - window.KCAPI   (driver check + auth)
  - window.KCSupabase.getClient()  (raw Supabase client para queries admin)

  Acesso: apenas usuários com profiles.is_admin = true.
*/

(function () {
  'use strict';

  let handlersBound = false;
  const LOG_TAG = '[KC][ADMIN_REPORTS]';
  const REPORTS_PAGE_SIZE = 50;
  const MAX_RPC_REPORTS = 500;

  // ---- Helpers ----

  function escHtmlAdmin(value) {
    const raw = String(value == null ? '' : value);
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') {
      return window.KCUtils.escapeHtml(raw);
    }
    return raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const escape = escHtmlAdmin;

  function $(sel, root) { return (root || document).querySelector(sel); }

  function setShellModalOpen(isOpen) {
    if (window.KCAdminShell && typeof window.KCAdminShell.setModalOpen === 'function') {
      window.KCAdminShell.setModalOpen(!!isOpen);
    }
  }

  function syncShellModalState() {
    const hasVisibleModal = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]'))
      .some((node) => !!node && node.getClientRects().length > 0 && window.getComputedStyle(node).visibility !== 'hidden');
    setShellModalOpen(hasVisibleModal);
  }

  function showError(msg) {
    const el = $('#admin-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
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

    const id = 'kc-admin-toast-fallback';
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

  function getClient() {
    if (window.KCSupabase && typeof window.KCSupabase.getClient === 'function') {
      return window.KCSupabase.getClient();
    }
    return null;
  }

  function getErrorMessage(error, fallback) {
    if (!error) return fallback;
    if (typeof error === 'string' && error.trim()) return error.trim();
    if (error.message) return String(error.message);
    return fallback;
  }

  function isPermissionError(error) {
    if (!error) return false;
    const message = String(error.message || error.details || error.hint || '').toLowerCase();
    return message.includes('permission')
      || message.includes('row-level security')
      || message.includes('rls')
      || message.includes('jwt');
  }

  function logAdminError(step, error, data) {
    console.error(LOG_TAG, {
      step: String(step || 'UNKNOWN'),
      error: error || null,
      data: (data && typeof data === 'object') ? data : null,
    });
  }

  // ---- Acesso / Auth ----

  async function checkAdminAccess() {
    const drv = window.KCAPI && window.KCAPI.ENV && window.KCAPI.ENV.driver;
    if (drv !== 'supabase') {
      showError('O painel de administração requer driver=supabase. Configure KC_ENV.driver="supabase" e recarregue.');
      return false;
    }

    const user = await window.KCAPI.getCurrentUser();
    if (!user) {
      showError('Você precisa estar autenticado para acessar este painel.');
      return false;
    }

    const client = getClient();
    if (!client) { showError('Supabase client não disponível.'); return false; }

    const { data: profile, error } = await client
      .from('profiles')
      .select('is_admin, display_name, full_name')
      .eq('id', user.id)
      .maybeSingle();

    if (error || !profile) { showError('Não foi possível carregar seu perfil.'); return false; }
    if (!profile.is_admin) {
      showError('Acesso negado. Apenas administradores podem acessar este painel.');
      return false;
    }


    return true;
  }

  // ---- Data ----

  // Estado de filtros
  const _filters = { status: 'open', reason: 'all' };
  const _reportsState = {
    rows: [],
    totalCount: 0,
    totalCountKnown: false,
    hasMore: false,
    fallbackCapped: false,
    requestSeq: 0,
  };

  function resetReportsState() {
    _reportsState.rows = [];
    _reportsState.totalCount = 0;
    _reportsState.totalCountKnown = false;
    _reportsState.hasMore = false;
    _reportsState.fallbackCapped = false;
  }

  function readFilters() {
    const statusEl = $('#reports-status-filter');
    const reasonEl = $('#reports-reason-filter');
    if (statusEl) _filters.status = statusEl.value || 'open';
    if (reasonEl) _filters.reason = reasonEl.value || 'all';
  }

  function buildReportsQuery(client, offset, limit) {
    let query = client
      .from('reports')
      .select('id, created_at, reason, details, status, post_id, reporter_id', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (_filters.status === 'open') query = query.eq('status', 'open');
    if (_filters.status === 'closed') query = query.eq('status', 'closed');
    if (_filters.reason && _filters.reason !== 'all') query = query.eq('reason', _filters.reason);

    return query;
  }

  async function loadReportsPage(offset, limit) {
    const client = getClient();
    if (!client) {
      return { data: [], totalCount: 0, totalCountKnown: true, hasMore: false, fallbackCapped: false };
    }

    const { data, error, count } = await buildReportsQuery(client, offset, limit);
    if (!error) {
      const rows = Array.isArray(data) ? data : [];
      const totalCount = Number.isFinite(Number(count)) ? Number(count) : rows.length;
      return {
        data: rows,
        totalCount,
        totalCountKnown: true,
        hasMore: (offset + rows.length) < totalCount,
        fallbackCapped: false,
      };
    }

    console.error('[Admin] loadReports:', error);

    if (!isPermissionError(error)) {
      return { data: [], totalCount: 0, totalCountKnown: true, hasMore: false, fallbackCapped: false, error };
    }

    try {
      const requestedLimit = Math.min(Math.max(offset + limit, limit), MAX_RPC_REPORTS);
      const rpc = await client.rpc('kc_admin_list_reports', {
        p_status: _filters.status,
        p_reason: _filters.reason,
        p_limit: requestedLimit,
      });
      if (rpc && !rpc.error && Array.isArray(rpc.data)) {
        const allRows = rpc.data;
        const pageRows = allRows.slice(offset, offset + limit);
        const totalCountKnown = allRows.length < requestedLimit;
        const fallbackCapped = !totalCountKnown && requestedLimit === MAX_RPC_REPORTS;
        return {
          data: pageRows,
          totalCount: allRows.length,
          totalCountKnown,
          hasMore: !fallbackCapped && allRows.length === requestedLimit,
          fallbackCapped,
        };
      }
      if (rpc && rpc.error) console.error('[Admin] loadReports rpc fallback:', rpc.error);
    } catch (rpcError) {
      console.error('[Admin] loadReports rpc exceÃ§Ã£o:', rpcError);
    }

    return { data: [], totalCount: 0, totalCountKnown: true, hasMore: false, fallbackCapped: false, error };
  }

  async function loadReports() {
    const client = getClient();
    if (!client) return [];

    let query = client
      .from('reports')
      .select('id, created_at, reason, details, status, post_id, reporter_id')
      .order('created_at', { ascending: false })
      .limit(200);

    // Filtro de status
    if (_filters.status === 'open')   query = query.eq('status', 'open');
    if (_filters.status === 'closed') query = query.eq('status', 'closed');
    // 'all' -> sem filtro de status

    // Filtro de motivo
    if (_filters.reason && _filters.reason !== 'all') query = query.eq('reason', _filters.reason);

    const { data, error } = await query;
    if (!error) return data || [];

    console.error('[Admin] loadReports:', error);

    if (!isPermissionError(error)) return [];

    // Fallback via RPC SECURITY DEFINER para ambientes com RLS mais restritiva.
    try {
      const rpc = await client.rpc('kc_admin_list_reports', {
        p_status: _filters.status,
        p_reason: _filters.reason,
        p_limit: 200,
      });
      if (rpc && !rpc.error && Array.isArray(rpc.data)) return rpc.data;
      if (rpc && rpc.error) console.error('[Admin] loadReports rpc fallback:', rpc.error);
    } catch (rpcError) {
      console.error('[Admin] loadReports rpc exceção:', rpcError);
    }

    return [];
  }

  async function loadPostTitles(postIds) {
    if (!postIds.length) return {};
    const client = getClient();
    if (!client) return {};

    // Tenta schema moderno primeiro (title)
    let posts = [];
    let modernError = null;
    try {
      const modern = await client
        .from('posts')
        .select('id, title, status, author_id')
        .in('id', postIds);

      modernError = modern && modern.error ? modern.error : null;
      if (!modernError) posts = modern && Array.isArray(modern.data) ? modern.data : [];
    } catch (error) {
      modernError = error;
    }

    // Fallback: schema legado (titulo)
    if (modernError) {
      const message = String(modernError.message || modernError.details || '').toLowerCase();
      const missingTitle = message.includes('column') && message.includes('title') && message.includes('does not exist');

      if (!missingTitle) {
        console.error('[Admin] loadPostTitles modern:', modernError);
      } else {
        try {
          const legacy = await client
            .from('posts')
            .select('id, titulo, status, author_id')
            .in('id', postIds);

          if (legacy && legacy.error) {
            console.error('[Admin] loadPostTitles legacy:', legacy.error);
          } else {
            posts = legacy && Array.isArray(legacy.data) ? legacy.data : [];
          }
        } catch (legacyError) {
          console.error('[Admin] loadPostTitles legacy exceção:', legacyError);
        }
      }
    }

    const map = {};
    (posts || []).forEach((row) => {
      if (!row || !row.id) return;
      map[row.id] = row;
    });

    // Fallback RPC para IDs faltantes (RLS em posts / linhas não retornadas).
    const missingIds = postIds.filter((id) => !map[id]);
    if (missingIds.length) {
      try {
        const rpc = await client.rpc('kc_admin_list_posts_by_ids', { p_ids: missingIds });
        if (rpc && !rpc.error && Array.isArray(rpc.data)) {
          rpc.data.forEach((row) => {
            if (!row || !row.id) return;
            map[row.id] = {
              id: row.id,
              title: row.title || 'Post sem título',
              status: row.status || 'indisponível',
              author_id: row.author_id || '',
            };
          });
        }
      } catch (error) {
        console.error('[Admin] loadPostTitles rpc posts fallback:', error);
      }
    }

    // Segurança extra: placeholder quando realmente não existe mais registro do post.
    postIds.forEach((id) => {
      if (!map[id]) {
        map[id] = {
          id,
          title: 'Post removido',
          status: 'indisponível',
          author_id: '',
        };
      }
    });

    return map;
  }

  async function loadReporterNames(reporterIds) {
    if (!reporterIds || !reporterIds.length) return {};
    const client = getClient();
    if (!client) return {};

    const uniqueIds = [...new Set(reporterIds.filter(Boolean))];
    if (!uniqueIds.length) return {};

    try {
      // Tenta com display_name
      const { data, error } = await client
        .from('profiles')
        .select('id, display_name, full_name')
        .in('id', uniqueIds);

      if (error) {
        // Fallback: só full_name
        const { data: d2 } = await client
          .from('profiles')
          .select('id, full_name')
          .in('id', uniqueIds);
        const map = {};
        (d2 || []).forEach(p => { map[p.id] = { name: p.full_name || '—' }; });
        return map;
      }

      const map = {};
      (data || []).forEach(p => {
        map[p.id] = {
          name: String(p.display_name || p.full_name || '—').trim(),
        };
      });
      return map;
    } catch (_) {
      return {};
    }
  }

  // ---- Ações ----

  async function closeReports(postId) {
    const client = getClient();
    if (!client) return { ok: false, error: { message: 'Supabase client não disponível.' } };

    try {
      const rpc = await client.rpc('kc_admin_close_reports', { p_post_id: postId });
      if (rpc && !rpc.error && rpc.data && typeof rpc.data === 'object') {
        if (rpc.data.ok) return { ok: true };
        return { ok: false, error: { message: rpc.data.message || 'Não foi possível fechar denúncias.' } };
      }

      const { data, error } = await client
        .from('reports')
        .update({ status: 'closed' })
        .eq('post_id', postId)
        .eq('status', 'open')
        .select('id');

      if (error) return { ok: false, error };
      if (!Array.isArray(data) || data.length === 0) {
        return { ok: false, error: { message: 'Nenhuma denúncia aberta foi atualizada para este post.' } };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  async function setPostStatus(postId, status) {
    const client = getClient();
    if (!client) return { ok: false, error: { message: 'Supabase client não disponível.' } };

    try {
      const rpc = await client.rpc('kc_admin_set_post_status', {
        p_post_id: postId,
        p_status: status,
        p_close_reports: false,
      });

      if (rpc && !rpc.error && rpc.data && typeof rpc.data === 'object') {
        if (rpc.data.ok && Number(rpc.data.updated_posts || 0) > 0) return { ok: true };
        const fallbackMsg = (rpc.data && rpc.data.code === 'UPDATE_NOT_APPLIED')
          ? 'A ação foi aceita, mas o banco não aplicou a alteração (RLS/role). Rode a migration v8.2.9.2 no projeto Supabase em produção.'
          : 'Não foi possível moderar o post.';
        return { ok: false, error: { message: rpc.data.message || fallbackMsg } };
      }

      const { data, error } = await client
        .from('posts')
        .update({ status })
        .eq('id', postId)
        .select('id');

      if (error) return { ok: false, error };
      if (!Array.isArray(data) || data.length === 0) {
        return { ok: false, error: { message: 'Nenhum post foi atualizado. Verifique permissões RLS/admin ou se o post existe.' } };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  async function verifyReportsClosed(postId) {
    const client = getClient();
    if (!client) return { ok: false, error: { message: 'Supabase client não disponível para verificação.' } };
    try {
      const { data, error } = await client
        .from('reports')
        .select('id')
        .eq('post_id', postId)
        .eq('status', 'open')
        .limit(1);
      if (error) {
        if (!isPermissionError(error)) return { ok: false, error };

        try {
          const rpc = await client.rpc('kc_admin_list_reports', {
            p_status: 'open',
            p_reason: 'all',
            p_limit: MAX_RPC_REPORTS,
          });
          if (rpc && rpc.error) return { ok: false, error: rpc.error };
          const rows = Array.isArray(rpc && rpc.data) ? rpc.data : [];
          return { ok: !rows.some((row) => String((row && row.post_id) || '') === String(postId || '')) };
        } catch (rpcError) {
          return { ok: false, error: rpcError };
        }
      }
      return { ok: !Array.isArray(data) || data.length === 0 };
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  async function verifyPostStatus(postId, expectedStatus) {
    const client = getClient();
    if (!client) return { ok: false, error: { message: 'Supabase client não disponível para verificação.' } };
    try {
      const { data, error } = await client
        .from('posts')
        .select('id, status')
        .eq('id', postId)
        .maybeSingle();
      let row = data;
      if (error) {
        if (!isPermissionError(error)) return { ok: false, error };

        try {
          const rpc = await client.rpc('kc_admin_list_posts_by_ids', { p_ids: [postId] });
          if (rpc && rpc.error) return { ok: false, error: rpc.error };
          const rows = Array.isArray(rpc && rpc.data) ? rpc.data : [];
          row = rows.find((item) => String((item && item.id) || '') === String(postId || '')) || null;
        } catch (rpcError) {
          return { ok: false, error: rpcError };
        }
      }
      if (!row) return { ok: false, error: { message: 'Post não encontrado para verificação.' } };
      const current = String(row.status || '').toLowerCase();
      const expected = String(expectedStatus || '').toLowerCase();
      if (current !== expected) {
        return { ok: false, error: { message: `Persistência divergente: esperado "${expected}", atual "${current || 'unknown'}".` } };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  async function verifyActionPersistence(action, postId) {
    switch (action) {
      case 'closeReports':
        return verifyReportsClosed(postId);
      case 'hidePost':
        return verifyPostStatus(postId, 'hidden');
      case 'restorePost':
        return verifyPostStatus(postId, 'published');
      case 'deletePost':
        return verifyPostStatus(postId, 'deleted');
      default:
        return { ok: true };
    }
  }

  async function handleAction(action, dataset) {
    const postId = dataset.postId;
    const postTitle = String(dataset.postTitle || '').trim();
    let result = { ok: true };

    switch (action) {
      case 'refresh':
        await render();
        return { ok: true };
      case 'loadMoreReports':
        await render({ append: true });
        return { ok: true };
      case 'closeReports':
        if (!postId) return { ok: false, error: { message: 'post_id ausente para fechar denúncias.' } };
        result = await closeReports(postId);
        break;
      case 'hidePost':
        if (!postId) return { ok: false, error: { message: 'post_id ausente para ocultar post.' } };
        result = await setPostStatus(postId, 'hidden');
        break;
      case 'restorePost':
        if (!postId) return { ok: false, error: { message: 'post_id ausente para restaurar post.' } };
        result = await setPostStatus(postId, 'published');
        break;
      case 'deletePost':
        if (!postId) return { ok: false, error: { message: 'post_id ausente para deletar post.' } };
        if (!window.confirm(`Deletar este post permanentemente? "${postTitle || postId}". Esta acao nao pode ser desfeita pelo painel.`)) {
          return { ok: false, cancelled: true };
        }
        result = await setPostStatus(postId, 'deleted');
        break;
      default:
        return { ok: false, error: { message: `Ação desconhecida: ${action}` } };
    }

    if (result.cancelled) return result;

    if (!result.ok) {
      logAdminError('ACTION_FAILED', result.error || { message: 'Operação retornou ok=false.' }, { action, postId });
      showToastSafe(getErrorMessage(result.error, 'Não foi possível concluir a ação.'), 'error', 3200);
      return result;
    }

    const verification = await verifyActionPersistence(action, postId);
    if (!verification.ok) {
      logAdminError('PERSISTENCE_CHECK_FAILED', verification.error || { message: 'Falha de verificação de persistência.' }, { action, postId });
      showToastSafe('Ação enviada, mas não confirmada no banco. Tente atualizar.', 'error', 3600);
      return { ok: false, error: verification.error || { message: 'Persistência não confirmada.' } };
    }

    await render();
    showToastSafe('Ação concluída com sucesso.', 'success', 1800);
    return result;
  }

  // ---- Render ----

  const REASON_LABELS = {
    spam: 'Spam',
    scam: 'Golpe/Fraude',
    inappropriate: 'Inapropriado',
    hate: 'Discurso de ódio',
    illegal: 'Conteúdo ilegal',
    duplicate: 'Duplicado',
    other: 'Outro',
  };

  function reasonLabel(r) { return REASON_LABELS[r] || r; }


  function renderSummary(reports) {
    const box = $('#reports-summary');
    if (!box) return;

    const list = Array.isArray(reports) ? reports : [];
    const open = list.filter((r) => r.status === 'open').length;
    const closed = list.filter((r) => r.status === 'closed').length;
    const reporters = new Set(list.map((r) => r.reporter_id).filter(Boolean)).size;

    const card = (label, value, icon) => `
      <article style="background:var(--kc-surface-dark);border:1px solid var(--kc-border-dark);border-radius:10px;padding:10px 12px;">
        <div style="font-size:.8em;color:var(--kc-text-dark-secondary);"><i class="${icon}"></i> ${escHtmlAdmin(label)}</div>
        <strong style="font-size:1.2em;">${escHtmlAdmin(value)}</strong>
      </article>`;

    box.innerHTML = [
      card('Total filtrado', list.length, 'fas fa-list'),
      card('Em aberto', open, 'fas fa-flag'),
      card('Fechadas', closed, 'fas fa-check-circle'),
      card('Usuários que denunciaram', reporters, 'fas fa-users')
    ].join('');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR'); } catch (_) { return iso; }
  }

  function renderResultsMeta() {
    const loaded = Array.isArray(_reportsState.rows) ? _reportsState.rows.length : 0;
    if (!loaded && !_reportsState.totalCount) return '';

    let counterText = `Exibindo ${loaded} denuncias filtradas.`;
    if (_reportsState.totalCountKnown) {
      counterText = `Exibindo ${loaded} de ${_reportsState.totalCount} denuncias filtradas.`;
    } else if (_reportsState.fallbackCapped) {
      counterText = `Exibindo ${loaded}+ denuncias filtradas. O fallback RPC atual para em 500 registros.`;
    } else if (_reportsState.hasMore) {
      counterText = `Exibindo ${loaded}+ denuncias filtradas.`;
    }

    return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 16px 0;padding:12px 14px;border:1px solid var(--kc-border-dark);border-radius:10px;background:var(--kc-surface-dark);">
        <strong style="font-size:.92em;">${escHtmlAdmin(counterText)}</strong>
      </div>`;
  }

  function renderLoadMore() {
    if (!_reportsState.hasMore && !_reportsState.fallbackCapped) return '';

    const note = _reportsState.fallbackCapped
      ? '<p style="margin:10px 0 0;color:var(--kc-text-dark-secondary);font-size:.84em;">O fallback administrativo atingiu o limite de 500 registros. Para contagem completa, a consulta direta precisa estar disponivel.</p>'
      : '';

    const button = _reportsState.hasMore
      ? `
        <button type="button" data-action="loadMoreReports"
                style="padding:10px 18px;background:var(--kc-primary-brand);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:.9em;">
          <i class="fas fa-plus"></i> Carregar mais
        </button>`
      : '';

    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;margin:18px 0 0;">
        ${button}
        ${note}
      </div>`;
  }

  async function render(options) {
    const container = $('#admin-reports-container');
    if (!container) return;
    {

    const append = !!(options && options.append);
    if (!append) {
      readFilters();
      resetReportsState();
    }

    const requestSeq = ++_reportsState.requestSeq;
    const offset = append ? _reportsState.rows.length : 0;

    if (!append) setLoading(true);
    const page = await loadReportsPage(offset, REPORTS_PAGE_SIZE);
    if (requestSeq !== _reportsState.requestSeq) return;
    if (!append) setLoading(false);

    if (page.error) {
      showToastSafe(getErrorMessage(page.error, 'Nao foi possivel carregar as denuncias.'), 'error', 3200);
      if (!append && !_reportsState.rows.length) {
        renderSummary([]);
        container.innerHTML = `
          <div style="text-align:center;padding:40px;color:var(--kc-text-dark-secondary);">
            <i class="fas fa-exclamation-triangle" style="font-size:3em;color:#ff9800;margin-bottom:10px;display:block;"></i>
            <p style="font-size:1.1em;">Nao foi possivel carregar as denuncias agora.</p>
          </div>`;
        syncShellModalState();
      }
      return;
    }

    _reportsState.rows = append ? _reportsState.rows.concat(page.data) : page.data.slice();
    _reportsState.totalCount = page.totalCount;
    _reportsState.totalCountKnown = page.totalCountKnown;
    _reportsState.hasMore = page.hasMore;
    _reportsState.fallbackCapped = page.fallbackCapped;

    const reports = _reportsState.rows;
    renderSummary(reports);

    if (!reports.length) {
      const statusLabel = _filters.status === 'open' ? 'em aberto' : _filters.status === 'closed' ? 'fechadas' : '';
      container.innerHTML = `
        <div style="text-align:center;padding:40px;color:var(--kc-text-dark-secondary);">
          <i class="fas fa-check-circle" style="font-size:3em;color:#4caf50;margin-bottom:10px;display:block;"></i>
          <p style="font-size:1.1em;">Nenhuma denuncia ${statusLabel} encontrada${_filters.reason !== 'all' ? ' com este motivo' : ''}.</p>
        </div>`;
      syncShellModalState();
      return;
    }

    const allReporterIds = [...new Set(reports.map((r) => r.reporter_id).filter(Boolean))];
    const reporterMap = await loadReporterNames(allReporterIds);
    const grouped = {};

    reports.forEach((row) => {
      if (!grouped[row.post_id]) grouped[row.post_id] = [];
      grouped[row.post_id].push(row);
    });

    const postIds = Object.keys(grouped).sort((a, b) => {
      const aOpen = grouped[a].filter((row) => row.status === 'open').length;
      const bOpen = grouped[b].filter((row) => row.status === 'open').length;
      return bOpen - aOpen;
    });

    const postMap = await loadPostTitles(postIds);
    const html = postIds.map((pid) => {
      const items = grouped[pid];
      const open = items.filter((row) => row.status === 'open');
      const closed = items.filter((row) => row.status !== 'open');
      const post = postMap[pid] || {};
      const postTitleRaw = post.title || post.titulo || 'Post sem titulo';
      const postTitle = escHtmlAdmin(postTitleRaw);
      const postStatus = String(post.status || 'indisponivel');
      const authorId = post.author_id || '';

      const reasonCounts = {};
      items.forEach((row) => {
        reasonCounts[row.reason] = (reasonCounts[row.reason] || 0) + 1;
      });

      const reasonSummary = Object.entries(reasonCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([reason, count]) => `<span class="kc-badge" style="background:var(--kc-surface-dark);border:1px solid var(--kc-border-dark);padding:2px 8px;border-radius:4px;margin:2px;font-size:.78em;">${escHtmlAdmin(reasonLabel(reason))}: <strong>${count}</strong></span>`)
        .join(' ');

      const statusColor = { published: '#4caf50', hidden: '#ff9800', deleted: '#f44336', pending: '#9c27b0' }[postStatus] || '#757575';
      const postStatusBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:.78em;background:${statusColor};color:#fff;margin-left:6px;">${escHtmlAdmin(postStatus)}</span>`;
      const displayItems = _filters.status === 'open' ? open : _filters.status === 'closed' ? closed : items;
      const rows = displayItems.map((row) => {
        const reporter = reporterMap[row.reporter_id] || {};
        const reporterName = reporter.name || '—';
        return `
        <tr style="border-bottom:1px solid var(--kc-border-dark);">
          <td data-label="Motivo" style="padding:8px;font-size:.85em;white-space:nowrap;">${escHtmlAdmin(reasonLabel(row.reason))}</td>
          <td data-label="Detalhes" style="padding:8px;font-size:.8em;color:var(--kc-text-dark-secondary);max-width:220px;">${escHtmlAdmin(row.details || '—')}</td>
          <td data-label="Quem denunciou" style="padding:8px;font-size:.8em;">
            ${escHtmlAdmin(reporterName)}
            ${row.reporter_id ? `<br><small style="color:var(--kc-text-dark-secondary);font-size:.82em;font-family:monospace;">${escHtmlAdmin(String(row.reporter_id).substring(0, 8))}...</small>` : ''}
          </td>
          <td data-label="Data" style="padding:8px;font-size:.8em;color:var(--kc-text-dark-secondary);white-space:nowrap;">${escHtmlAdmin(formatDate(row.created_at))}</td>
          <td data-label="Status" style="padding:8px;">
            <span style="padding:2px 8px;border-radius:4px;font-size:.78em;background:${row.status === 'open' ? '#ff5722' : '#9e9e9e'};color:#fff;">${escHtmlAdmin(row.status)}</span>
          </td>
        </tr>`;
      }).join('');

      return `
      <div class="kc-admin-report-group" style="background:var(--kc-surface-dark);border:1px solid var(--kc-border-dark);border-radius:12px;padding:20px;margin-bottom:20px;">
        <div class="kc-admin-report-group-head" style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:1.05em;margin-bottom:4px;">
              <i class="fas fa-file-alt" style="margin-right:6px;opacity:.6;"></i>
              ${postTitle}${postStatusBadge}
            </div>
            <div style="font-size:.8em;color:var(--kc-text-dark-secondary);margin-bottom:6px;word-break:break-all;">
              ID: <code style="font-size:.9em;">${escHtmlAdmin(pid)}</code>
              &nbsp;·&nbsp; <strong style="color:var(--kc-text-dark);">${open.length}</strong> em aberto
              &nbsp;·&nbsp; <strong>${items.length}</strong> total
              ${authorId ? `&nbsp;·&nbsp; <a href="../profile.html?id=${encodeURIComponent(authorId)}" target="_blank" style="color:var(--kc-primary-brand);font-size:.95em;">Ver perfil do autor</a>` : ''}
            </div>
            <div style="flex-wrap:wrap;display:flex;gap:2px;">${reasonSummary}</div>
          </div>
          <div class="kc-admin-report-group-actions" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;">
            <a href="../product.html?id=${encodeURIComponent(pid)}" target="_blank"
               style="padding:7px 14px;background:var(--kc-background-dark);border:1px solid var(--kc-border-dark);border-radius:6px;text-decoration:none;font-size:.85em;color:var(--kc-text-dark);display:inline-flex;align-items:center;gap:5px;">
               <i class="fas fa-eye"></i> Ver post
            </a>
            ${open.length > 0 ? `
            <button type="button" data-action="closeReports" data-post-id="${escHtmlAdmin(pid)}" data-post-title="${escHtmlAdmin(postTitleRaw)}"
                    style="padding:7px 14px;background:#1565c0;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.85em;display:inline-flex;align-items:center;gap:5px;">
              <i class="fas fa-check"></i> Fechar denuncias
            </button>` : ''}
            ${postStatus === 'published' ? `
            <button type="button" data-action="hidePost" data-post-id="${escHtmlAdmin(pid)}" data-post-title="${escHtmlAdmin(postTitleRaw)}"
                    style="padding:7px 14px;background:#e65100;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.85em;display:inline-flex;align-items:center;gap:5px;">
              <i class="fas fa-eye-slash"></i> Ocultar
            </button>` : ''}
            ${postStatus === 'hidden' ? `
            <button type="button" data-action="restorePost" data-post-id="${escHtmlAdmin(pid)}" data-post-title="${escHtmlAdmin(postTitleRaw)}"
                    style="padding:7px 14px;background:#2e7d32;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.85em;display:inline-flex;align-items:center;gap:5px;">
              <i class="fas fa-eye"></i> Restaurar
            </button>` : ''}
            ${postStatus !== 'deleted' ? `
            <button type="button" data-action="deletePost" data-post-id="${escHtmlAdmin(pid)}" data-post-title="${escHtmlAdmin(postTitleRaw)}"
                    style="padding:7px 14px;background:#b71c1c;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.85em;display:inline-flex;align-items:center;gap:5px;"
                    title="Esta acao nao pode ser desfeita pelo painel.">
              <i class="fas fa-trash"></i> Deletar
            </button>` : ''}
          </div>
        </div>
        ${displayItems.length > 0 ? `
        <div style="overflow-x:auto;margin-top:10px;">
          <table class="kc-admin-report-table" style="width:100%;border-collapse:collapse;font-size:.9em;min-width:560px;">
            <thead>
              <tr style="border-bottom:2px solid var(--kc-border-dark);">
                <th style="padding:8px;text-align:left;font-weight:600;white-space:nowrap;">Motivo</th>
                <th style="padding:8px;text-align:left;font-weight:600;">Detalhes</th>
                <th style="padding:8px;text-align:left;font-weight:600;">Quem denunciou</th>
                <th style="padding:8px;text-align:left;font-weight:600;white-space:nowrap;">Data</th>
                <th style="padding:8px;text-align:left;font-weight:600;">Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>` : `<div style="color:var(--kc-text-dark-secondary);font-size:.9em;"><i class="fas fa-check" style="color:#4caf50;"></i> Todas as denuncias deste post foram fechadas.</div>`}
      </div>`;
    }).join('');

    container.innerHTML = `${renderResultsMeta()}${html}${renderLoadMore()}`;
    syncShellModalState();
    }
    return;

    readFilters();

    setLoading(true);
    const reports = await loadReports();
    setLoading(false);

    renderSummary(reports);

    if (!reports.length) {
      const statusLabel = _filters.status === 'open' ? 'em aberto' : _filters.status === 'closed' ? 'fechadas' : '';
      container.innerHTML = `
        <div style="text-align:center;padding:40px;color:var(--kc-text-dark-secondary);">
          <i class="fas fa-check-circle" style="font-size:3em;color:#4caf50;margin-bottom:10px;display:block;"></i>
          <p style="font-size:1.1em;">Nenhuma denúncia ${statusLabel} encontrada${_filters.reason !== 'all' ? ' com este motivo' : ''}.</p>
        </div>`;
      return;
    }

    // Carregar nomes dos reporters
    const allReporterIds = [...new Set(reports.map(r => r.reporter_id).filter(Boolean))];
    const reporterMap = await loadReporterNames(allReporterIds);

    // Agrupar por post_id
    const grouped = {};
    reports.forEach(r => {
      if (!grouped[r.post_id]) grouped[r.post_id] = [];
      grouped[r.post_id].push(r);
    });

    // Ordenar grupos: mais denúncias abertas primeiro
    const postIds = Object.keys(grouped).sort((a, b) => {
      const aOpen = grouped[a].filter(r => r.status === 'open').length;
      const bOpen = grouped[b].filter(r => r.status === 'open').length;
      return bOpen - aOpen;
    });

    const postMap = await loadPostTitles(postIds);

    const html = postIds.map(pid => {
      const items = grouped[pid];
      const open = items.filter(r => r.status === 'open');
      const closed = items.filter(r => r.status !== 'open');
      const post = postMap[pid] || {};
      const postTitle = escape(post.title || post.titulo || 'Post sem título');
      const postStatus = String(post.status || 'indisponível');
      const authorId = post.author_id || '';

      // Contagem por motivo (todos)
      const reasonCounts = {};
      items.forEach(r => { reasonCounts[r.reason] = (reasonCounts[r.reason] || 0) + 1; });
      const reasonSummary = Object.entries(reasonCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([r, n]) => `<span class="kc-badge" style="background:var(--kc-surface-dark);border:1px solid var(--kc-border-dark);padding:2px 8px;border-radius:4px;margin:2px;font-size:.78em;">${escape(reasonLabel(r))}: <strong>${n}</strong></span>`)
        .join(' ');

      const statusColor = { published: '#4caf50', hidden: '#ff9800', deleted: '#f44336', pending: '#9c27b0' }[postStatus] || '#757575';
      const postStatusBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:.78em;background:${statusColor};color:#fff;margin-left:6px;">${escape(postStatus)}</span>`;

      // Linhas da tabela de denúncias individuais
      const displayItems = _filters.status === 'open' ? open : _filters.status === 'closed' ? closed : items;
      const rows = displayItems.map(r => {
        const reporter = reporterMap[r.reporter_id] || {};
        const reporterName = reporter.name || '—';
        return `
        <tr style="border-bottom:1px solid var(--kc-border-dark);">
          <td data-label="Motivo" style="padding:8px;font-size:.85em;white-space:nowrap;">${escape(reasonLabel(r.reason))}</td>
          <td data-label="Detalhes" style="padding:8px;font-size:.8em;color:var(--kc-text-dark-secondary);max-width:220px;">${escape(r.details || '—')}</td>
          <td data-label="Quem denunciou" style="padding:8px;font-size:.8em;">
            ${escape(reporterName)}
            ${r.reporter_id ? `<br><small style="color:var(--kc-text-dark-secondary);font-size:.82em;font-family:monospace;">${escape(r.reporter_id.substring(0,8))}…</small>` : ''}
          </td>
          <td data-label="Data" style="padding:8px;font-size:.8em;color:var(--kc-text-dark-secondary);white-space:nowrap;">${escape(formatDate(r.created_at))}</td>
          <td data-label="Status" style="padding:8px;">
            <span style="padding:2px 8px;border-radius:4px;font-size:.78em;background:${r.status === 'open' ? '#ff5722' : '#9e9e9e'};color:#fff;">${escape(r.status)}</span>
          </td>
        </tr>`;
      }).join('');

      return `
      <div class="kc-admin-report-group" style="background:var(--kc-surface-dark);border:1px solid var(--kc-border-dark);border-radius:12px;padding:20px;margin-bottom:20px;">
        <div class="kc-admin-report-group-head" style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:1.05em;margin-bottom:4px;">
              <i class="fas fa-file-alt" style="margin-right:6px;opacity:.6;"></i>
              ${postTitle}${postStatusBadge}
            </div>
            <div style="font-size:.8em;color:var(--kc-text-dark-secondary);margin-bottom:6px;word-break:break-all;">
              ID: <code style="font-size:.9em;">${escape(pid)}</code>
              &nbsp;·&nbsp; <strong style="color:var(--kc-text-dark);">${open.length}</strong> em aberto
              &nbsp;·&nbsp; <strong>${items.length}</strong> total
              ${authorId ? `&nbsp;·&nbsp; <a href="../profile.html?id=${encodeURIComponent(authorId)}" target="_blank" style="color:var(--kc-primary-brand);font-size:.95em;">Ver perfil do autor</a>` : ''}
            </div>
            <div style="flex-wrap:wrap;display:flex;gap:2px;">${reasonSummary}</div>
          </div>
          <div class="kc-admin-report-group-actions" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;">
            <a href="../product.html?id=${encodeURIComponent(pid)}" target="_blank"
               style="padding:7px 14px;background:var(--kc-background-dark);border:1px solid var(--kc-border-dark);border-radius:6px;text-decoration:none;font-size:.85em;color:var(--kc-text-dark);display:inline-flex;align-items:center;gap:5px;">
               <i class="fas fa-eye"></i> Ver post
            </a>
            ${open.length > 0 ? `
            <button type="button" data-action="closeReports" data-post-id="${escape(pid)}"
                    style="padding:7px 14px;background:#1565c0;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.85em;display:inline-flex;align-items:center;gap:5px;">
              <i class="fas fa-check"></i> Fechar denúncias
            </button>` : ''}
            ${postStatus === 'published' ? `
            <button type="button" data-action="hidePost" data-post-id="${escape(pid)}"
                    style="padding:7px 14px;background:#e65100;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.85em;display:inline-flex;align-items:center;gap:5px;">
              <i class="fas fa-eye-slash"></i> Ocultar
            </button>` : ''}
            ${postStatus === 'hidden' ? `
            <button type="button" data-action="restorePost" data-post-id="${escape(pid)}"
                    style="padding:7px 14px;background:#2e7d32;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.85em;display:inline-flex;align-items:center;gap:5px;">
              <i class="fas fa-eye"></i> Restaurar
            </button>` : ''}
            ${postStatus !== 'deleted' ? `
            <button type="button" data-action="deletePost" data-post-id="${escape(pid)}"
                    style="padding:7px 14px;background:#b71c1c;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.85em;display:inline-flex;align-items:center;gap:5px;"
                    title="Esta ação não pode ser desfeita pelo painel.">
              <i class="fas fa-trash"></i> Deletar
            </button>` : ''}
          </div>
        </div>
        ${displayItems.length > 0 ? `
        <div style="overflow-x:auto;margin-top:10px;">
          <table class="kc-admin-report-table" style="width:100%;border-collapse:collapse;font-size:.9em;min-width:560px;">
            <thead>
              <tr style="border-bottom:2px solid var(--kc-border-dark);">
                <th style="padding:8px;text-align:left;font-weight:600;white-space:nowrap;">Motivo</th>
                <th style="padding:8px;text-align:left;font-weight:600;">Detalhes</th>
                <th style="padding:8px;text-align:left;font-weight:600;">Quem denunciou</th>
                <th style="padding:8px;text-align:left;font-weight:600;white-space:nowrap;">Data</th>
                <th style="padding:8px;text-align:left;font-weight:600;">Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>` : `<div style="color:var(--kc-text-dark-secondary);font-size:.9em;"><i class="fas fa-check" style="color:#4caf50;"></i> Todas as denúncias deste post foram fechadas.</div>`}
      </div>`;
    }).join('');

    container.innerHTML = html;
  }

  function setupEventDelegation() {
    if (handlersBound) return;
    handlersBound = true;

    const root = $('#admin-content');
    if (!root) return;

    root.addEventListener('click', async (event) => {
      const actionEl = event.target.closest('[data-action]');
      if (!actionEl || !root.contains(actionEl)) return;

      if (actionEl.dataset.kcBusy === '1') return;
      actionEl.dataset.kcBusy = '1';
      actionEl.disabled = true;
      try {
        await handleAction(actionEl.dataset.action, actionEl.dataset);
      } finally {
        actionEl.disabled = false;
        delete actionEl.dataset.kcBusy;
        requestAnimationFrame(syncShellModalState);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        requestAnimationFrame(syncShellModalState);
      }
    });

    // Filtros: status e motivo
    const statusFilter = $('#reports-status-filter');
    const reasonFilter = $('#reports-reason-filter');
    if (statusFilter) statusFilter.addEventListener('change', () => render());
    if (reasonFilter)  reasonFilter.addEventListener('change', () => render());
  }

  // ---- Boot ----

  async function boot() {
    syncShellModalState();
    setLoading(true);
    const ok = await checkAdminAccess();
    setLoading(false);
    if (!ok) {
      setTimeout(() => { window.location.replace('../index.html'); }, 2500);
      return;
    }

    $('#admin-content').style.display = 'block';
    setupEventDelegation();
    await render();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();

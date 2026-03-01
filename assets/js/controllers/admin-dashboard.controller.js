(function () {
  'use strict';

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

  function setLastSync() {
    const el = $('#admin-last-sync');
    if (!el) return;
    el.textContent = `Atualizado em ${new Date().toLocaleString('pt-BR')}`;
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

  function metricCard(icon, label, value) {
    return `
      <article class="kc-admin-card">
        <div class="kc-admin-card__label"><i class="${icon}"></i> ${label}</div>
        <strong>${Number(value || 0)}</strong>
      </article>
    `;
  }

  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  }

  // ── Moderação: Denúncias ────────────────────────────────────────────────────
  // Prioriza RPC SECURITY DEFINER (bypass RLS) para contagens confiáveis
  async function loadReportMetrics(client) {
    try {
      const rpc = await client.rpc('kc_admin_list_reports', { p_status: 'all', p_reason: 'all', p_limit: 2000 });
      if (!rpc.error && Array.isArray(rpc.data)) {
        const total = rpc.data.length;
        const open  = rpc.data.filter(r => String(r.status || '').toLowerCase() === 'open').length;
        return { open, total };
      }
    } catch (_) {}

    // Fallback: direct count queries
    let open = 0, total = 0;
    try {
      const [openRes, totalRes] = await Promise.all([
        client.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        client.from('reports').select('id', { count: 'exact', head: true }),
      ]);
      open  = openRes.count  || 0;
      total = totalRes.count || 0;
    } catch (_) {}
    return { open, total };
  }

  // ── Moderação: Posts ocultos/deletados ──────────────────────────────────────
  async function loadPostStatusMetrics(client) {
    let hidden = 0, deleted = 0;
    try {
      const [hiddenRes, deletedRes] = await Promise.all([
        client.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'hidden'),
        client.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'deleted'),
      ]);

      if ((hiddenRes.error || deletedRes.error) &&
          (isPermissionError(hiddenRes.error) || isPermissionError(deletedRes.error))) {
        const fallback = await client.from('posts').select('status').in('status', ['hidden', 'deleted']).limit(2000);
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

  // ── Atividade: Posts publicados (criados nos últimos 30d) ───────────────────
  async function loadPostsCreated(client, since30) {
    try {
      const res = await client.from('posts')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since30);
      if (!res.error) return res.count || 0;
      // Fallback sem count
      const fb = await client.from('posts').select('id').gte('created_at', since30).limit(2000);
      if (!fb.error && Array.isArray(fb.data)) return fb.data.length;
    } catch (_) {}
    return 0;
  }

  // ── Atividade: Posts editados nos últimos 30d ───────────────────────────────
  // Conta posts que existiam antes do período (created_at < since30) mas foram
  // atualizados dentro dele (updated_at >= since30), indicando edições reais.
  async function loadPostsEdited(client, since30) {
    try {
      const res = await client.from('posts')
        .select('id', { count: 'exact', head: true })
        .gte('updated_at', since30)
        .lt('created_at', since30);
      if (!res.error) return res.count || 0;
      // Fallback sem count
      const fb = await client.from('posts')
        .select('id')
        .gte('updated_at', since30)
        .lt('created_at', since30)
        .limit(2000);
      if (!fb.error && Array.isArray(fb.data)) return fb.data.length;
    } catch (_) {}
    return 0;
  }

  // ── Atividade: Comentários (últimos 30d) ─────────────────────────────────────
  async function loadCommentsCount(client, since30) {
    try {
      const res = await client.from('comments')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since30);
      if (!res.error) return res.count || 0;
      const fb = await client.from('comments').select('id').gte('created_at', since30).limit(5000);
      if (!fb.error && Array.isArray(fb.data)) return fb.data.length;
    } catch (_) {}
    return 0;
  }

  // ── Atividade: Buscas (últimos 30d) ─────────────────────────────────────────
  // Graceful fail: tabela pode não existir se migration ainda não foi executada
  async function loadSearchCount(client, since30) {
    try {
      const res = await client.from('search_queries')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since30);
      if (!res.error) return res.count || 0;
    } catch (_) {}
    return 0;
  }

  // ── Audit log (últimos 10 eventos) ──────────────────────────────────────────
  async function loadAuditLog(client) {
    try {
      const res = await client.from('audit_log')
        .select('created_at, action, entity_type, actor_id')
        .order('created_at', { ascending: false })
        .limit(10);
      if (!res.error) return Array.isArray(res.data) ? res.data : [];

      if (isPermissionError(res.error)) {
        const rpc = await client.rpc('kc_admin_list_audit_logs', {
          p_entity_type: 'all', p_action: 'all', p_actor_query: null, p_limit: 10,
        });
        if (!rpc.error && Array.isArray(rpc.data)) return rpc.data;
      }
    } catch (_) {}
    return [];
  }

  // ── Tendências de busca ──────────────────────────────────────────────────────
  async function loadSearchTrends(client) {
    const trendsList = $('#admin-trends-list');
    if (!trendsList) return;

    let trends = [];
    try {
      const res = await client.rpc('kc_admin_search_trends', { p_limit: 10 });
      if (!res.error && Array.isArray(res.data)) {
        trends = res.data;
      } else {
        // Fallback: busca direto da tabela e agrupa em JS
        const raw = await client.from('search_queries')
          .select('term')
          .order('created_at', { ascending: false })
          .limit(500);
        if (!raw.error && Array.isArray(raw.data)) {
          const freq = {};
          raw.data.forEach(r => {
            const t = String(r.term || '').trim().toLowerCase();
            if (t) freq[t] = (freq[t] || 0) + 1;
          });
          trends = Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([term, count]) => ({ term, count }));
        }
      }
    } catch (_) { trends = []; }

    if (!trends.length) {
      trendsList.innerHTML = '<li class="kc-trend-empty">Nenhuma busca registrada ainda.</li>';
      return;
    }

    const max = Math.max(...trends.map(t => Number(t.count) || 1), 1);
    trendsList.innerHTML = trends.map(t => {
      const pct = Math.round(((Number(t.count) || 0) / max) * 100);
      return `
        <li class="kc-trend-item">
          <span class="kc-trend-term">${escHtmlAdmin(String(t.term || ''))}</span>
          <div class="kc-trend-bar-wrap"><div class="kc-trend-bar" style="width:${pct}%"></div></div>
          <span class="kc-trend-count">${Number(t.count) || 0}</span>
        </li>
      `;
    }).join('');
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

    const since30 = daysAgo(30);

    // Carrega todas as métricas em paralelo para melhor performance
    const [
      reportMetrics,
      postStatusMetrics,
      postsCreated,
      postsEdited,
      commentsCount,
      searchCount,
      auditRows,
    ] = await Promise.all([
      loadReportMetrics(client),
      loadPostStatusMetrics(client),
      loadPostsCreated(client, since30),
      loadPostsEdited(client, since30),
      loadCommentsCount(client, since30),
      loadSearchCount(client, since30),
      loadAuditLog(client),
    ]);

    // ── Renderiza métricas de moderação ──
    const metrics = $('#admin-metrics');
    if (metrics) {
      metrics.innerHTML = [
        metricCard('fas fa-flag',      'Denúncias abertas',  reportMetrics.open),
        metricCard('fas fa-list',      'Total de denúncias', reportMetrics.total),
        metricCard('fas fa-eye-slash', 'Posts ocultos',      postStatusMetrics.hidden),
        metricCard('fas fa-trash',     'Posts deletados',    postStatusMetrics.deleted),
      ].join('');
    }

    // ── Renderiza métricas de atividade (30 dias) ──
    const activityMetrics = $('#admin-activity-metrics');
    if (activityMetrics) {
      activityMetrics.innerHTML = [
        metricCard('fas fa-plus-circle',     'Posts publicados',  postsCreated),
        metricCard('fas fa-pen-to-square',   'Posts editados',    postsEdited),
        metricCard('fas fa-comment',         'Comentários',       commentsCount),
        metricCard('fas fa-magnifying-glass','Buscas',            searchCount),
      ].join('');
    }

    // ── Renderiza audit log ──
    const auditBody = $('#admin-audit-body');
    if (auditBody) {
      auditBody.innerHTML = auditRows.length
        ? auditRows.map(row => `
          <tr>
            <td data-label="Data">${new Date(row.created_at).toLocaleString('pt-BR')}</td>
            <td data-label="Ação"><code>${row.action || '—'}</code></td>
            <td data-label="Entidade"><code>${row.entity_type || '—'}</code></td>
            <td data-label="Autor"><code>${row.actor_id || 'system'}</code></td>
          </tr>
        `).join('')
        : '<tr><td colspan="4" style="color:var(--kc-text-dark-secondary);">Nenhum evento encontrado.</td></tr>';
    }

    // ── Renderiza tendências de busca ──
    await loadSearchTrends(client);

    setLastSync();
  }

  async function refreshDashboard() {
    clearError();
    setLoading(true);
    try {
      await loadMetrics();
    } catch (error) {
      console.error('[Admin dashboard] refreshDashboard:', error);
      showError('Não foi possível atualizar o dashboard no momento.');
    } finally {
      setLoading(false);
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

    await refreshDashboard();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();

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

  // Returns ISO string for N days ago
  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  }

  async function loadMetrics() {
    const client = getClient();
    const since30 = daysAgo(30);

    const [openRes, totalRes, hiddenRes, deletedRes, auditRes,
           createdRes, editedRes, commentRes] = await Promise.all([
      client.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      client.from('reports').select('id', { count: 'exact', head: true }),
      client.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'hidden'),
      client.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'deleted'),
      client.from('audit_log').select('created_at, action, entity_type, actor_id').order('created_at', { ascending: false }).limit(10),
      // Atividade 30 dias: posts criados
      client.from('audit_log').select('id', { count: 'exact', head: true })
        .eq('action', 'post_created').gte('created_at', since30),
      // Atividade 30 dias: posts editados
      client.from('audit_log').select('id', { count: 'exact', head: true })
        .eq('action', 'post_edited').gte('created_at', since30),
      // Atividade 30 dias: comentários
      client.from('audit_log').select('id', { count: 'exact', head: true })
        .eq('action', 'comment_created').gte('created_at', since30),
    ]);

    let openReports  = openRes.count  || 0;
    let totalReports = totalRes.count || 0;
    let hiddenPosts  = hiddenRes.count || 0;
    let deletedPosts = deletedRes.count || 0;
    let auditRows    = Array.isArray(auditRes.data) ? auditRes.data : [];
    let postsCreated = createdRes.count  || 0;
    let postsEdited  = editedRes.count   || 0;
    let commentsCreated = commentRes.count || 0;

    // Fallback via RPC para erros de RLS em reports
    if ((openRes.error || totalRes.error) && (isPermissionError(openRes.error) || isPermissionError(totalRes.error))) {
      const rpcReports = await client.rpc('kc_admin_list_reports', { p_status: 'all', p_reason: 'all', p_limit: 500 });
      if (!rpcReports.error && Array.isArray(rpcReports.data)) {
        totalReports = rpcReports.data.length;
        openReports  = rpcReports.data.filter((item) => String(item.status || '').toLowerCase() === 'open').length;
      }
    }

    // Fallback via RLS para posts
    if ((hiddenRes.error || deletedRes.error) && (isPermissionError(hiddenRes.error) || isPermissionError(deletedRes.error))) {
      const postRes = await client.from('posts').select('status').in('status', ['hidden', 'deleted']).limit(1000);
      if (!postRes.error && Array.isArray(postRes.data)) {
        hiddenPosts  = postRes.data.filter((row) => row.status === 'hidden').length;
        deletedPosts = postRes.data.filter((row) => row.status === 'deleted').length;
      }
    }

    // Fallback audit_log via RPC
    if (auditRes.error && isPermissionError(auditRes.error)) {
      const rpcAudit = await client.rpc('kc_admin_list_audit_logs', {
        p_entity_type: 'all', p_action: 'all', p_actor_query: null, p_limit: 10,
      });
      if (!rpcAudit.error && Array.isArray(rpcAudit.data)) auditRows = rpcAudit.data;
    }

    // Fallback atividade via audit_log direto (sem count) em caso de RLS
    if ((createdRes.error || editedRes.error || commentRes.error) &&
        (isPermissionError(createdRes.error) || isPermissionError(editedRes.error) || isPermissionError(commentRes.error))) {
      const actRes = await client.from('audit_log')
        .select('action').in('action', ['post_created', 'post_edited', 'comment_created'])
        .gte('created_at', since30).limit(2000);
      if (!actRes.error && Array.isArray(actRes.data)) {
        postsCreated    = actRes.data.filter(r => r.action === 'post_created').length;
        postsEdited     = actRes.data.filter(r => r.action === 'post_edited').length;
        commentsCreated = actRes.data.filter(r => r.action === 'comment_created').length;
      }
    }

    // ── Moderation metrics ──
    const metrics = $('#admin-metrics');
    if (metrics) {
      metrics.innerHTML = [
        metricCard('fas fa-flag',     'Denúncias abertas',  openReports),
        metricCard('fas fa-list',     'Total de denúncias', totalReports),
        metricCard('fas fa-eye-slash','Posts ocultos',      hiddenPosts),
        metricCard('fas fa-trash',    'Posts deletados',    deletedPosts),
      ].join('');
    }

    // ── Activity metrics (30 days) ──
    const activityMetrics = $('#admin-activity-metrics');
    if (activityMetrics) {
      // Total de buscas no período
      let searchCount = 0;
      const searchRes = await client.from('search_queries')
        .select('id', { count: 'exact', head: true }).gte('created_at', since30);
      if (!searchRes.error) searchCount = searchRes.count || 0;

      activityMetrics.innerHTML = [
        metricCard('fas fa-plus-circle', 'Posts publicados',  postsCreated),
        metricCard('fas fa-pen-to-square','Posts editados',   postsEdited),
        metricCard('fas fa-comment',     'Comentários',       commentsCreated),
        metricCard('fas fa-magnifying-glass','Buscas',        searchCount),
      ].join('');
    }

    // ── Audit log table ──
    const auditBody = $('#admin-audit-body');
    if (auditBody) {
      const rows = Array.isArray(auditRows) ? auditRows : [];
      auditBody.innerHTML = rows.length
        ? rows.map((row) => `
          <tr>
            <td data-label="Data">${new Date(row.created_at).toLocaleString('pt-BR')}</td>
            <td data-label="Ação"><code>${row.action || '—'}</code></td>
            <td data-label="Entidade"><code>${row.entity_type || '—'}</code></td>
            <td data-label="Autor"><code>${row.actor_id || 'system'}</code></td>
          </tr>
        `).join('')
        : '<tr><td colspan="4" style="color:var(--kc-text-dark-secondary);">Nenhum evento encontrado.</td></tr>';
    }

    // ── Search trends ──
    await loadSearchTrends(client);

    setLastSync();
  }

  async function loadSearchTrends(client) {
    const trendsList = $('#admin-trends-list');
    if (!trendsList) return;

    let trends = [];
    try {
      // Tenta agrupar por term e contar
      const res = await client.rpc('kc_admin_search_trends', { p_limit: 10 });
      if (!res.error && Array.isArray(res.data)) {
        trends = res.data; // [{ term, count }]
      } else {
        // Fallback: busca direto (sem agrupamento via SQL)
        const raw = await client.from('search_queries')
          .select('term').order('created_at', { ascending: false }).limit(500);
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
    trendsList.innerHTML = trends.map((t) => {
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

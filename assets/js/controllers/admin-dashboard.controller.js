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

  function setLoading(isLoading) {
    const loading = $('#admin-loading');
    if (loading) loading.style.display = isLoading ? 'flex' : 'none';
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
    return `<article class="kc-admin-card"><span><i class="${icon}"></i> ${label}</span><strong>${value}</strong></article>`;
  }

  async function loadMetrics() {
    const client = getClient();

    const [openRes, totalRes, hiddenRes, deletedRes, auditRes] = await Promise.all([
      client.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      client.from('reports').select('id', { count: 'exact', head: true }),
      client.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'hidden'),
      client.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'deleted'),
      client.from('audit_log').select('created_at, action, entity_type, actor_id').order('created_at', { ascending: false }).limit(8)
    ]);

    let openReports = openRes.count || 0;
    let totalReports = totalRes.count || 0;
    let hiddenPosts = hiddenRes.count || 0;
    let deletedPosts = deletedRes.count || 0;
    let auditRows = Array.isArray(auditRes.data) ? auditRes.data : [];

    if ((openRes.error || totalRes.error) && (isPermissionError(openRes.error) || isPermissionError(totalRes.error))) {
      const rpcReports = await client.rpc('kc_admin_list_reports', { p_status: 'all', p_reason: 'all', p_limit: 500 });
      if (!rpcReports.error && Array.isArray(rpcReports.data)) {
        totalReports = rpcReports.data.length;
        openReports = rpcReports.data.filter((item) => String(item.status || '').toLowerCase() === 'open').length;
      }
    }

    if ((hiddenRes.error || deletedRes.error) && (isPermissionError(hiddenRes.error) || isPermissionError(deletedRes.error))) {
      const postRes = await client
        .from('posts')
        .select('status')
        .in('status', ['hidden', 'deleted'])
        .limit(1000);
      if (!postRes.error && Array.isArray(postRes.data)) {
        hiddenPosts = postRes.data.filter((row) => row.status === 'hidden').length;
        deletedPosts = postRes.data.filter((row) => row.status === 'deleted').length;
      }
    }

    if (auditRes.error && isPermissionError(auditRes.error)) {
      const rpcAudit = await client.rpc('kc_admin_list_audit_logs', {
        p_entity_type: 'all',
        p_action: 'all',
        p_actor_query: null,
        p_limit: 8,
      });
      if (!rpcAudit.error && Array.isArray(rpcAudit.data)) {
        auditRows = rpcAudit.data;
      }
    }

    const metrics = $('#admin-metrics');
    if (metrics) {
      metrics.innerHTML = [
        metricCard('fas fa-flag', 'Denúncias em aberto', openReports || 0),
        metricCard('fas fa-list', 'Total de denúncias', totalReports || 0),
        metricCard('fas fa-eye-slash', 'Posts ocultos', hiddenPosts || 0),
        metricCard('fas fa-trash', 'Posts deletados', deletedPosts || 0)
      ].join('');
    }

    const auditBody = $('#admin-audit-body');
    if (auditBody) {
      const rows = Array.isArray(auditRows) ? auditRows : [];
      auditBody.innerHTML = rows.length
        ? rows.map((row) => `<tr><td>${new Date(row.created_at).toLocaleString('pt-BR')}</td><td><code>${row.action || '—'}</code></td><td><code>${row.entity_type || '—'}</code></td><td><code>${row.actor_id || 'system'}</code></td></tr>`).join('')
        : '<tr><td colspan="4" style="color:var(--kc-text-dark-secondary);">Nenhum evento encontrado.</td></tr>';
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
    await loadMetrics();
    setLoading(false);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();

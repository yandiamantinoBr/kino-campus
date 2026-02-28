(function () {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }

  function getClient() {
    if (window.KCSupabase && typeof window.KCSupabase.getClient === 'function') return window.KCSupabase.getClient();
    return null;
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

    const [{ count: openReports }, { count: totalReports }, { count: hiddenPosts }, { count: deletedPosts }, { data: auditRows }] = await Promise.all([
      client.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      client.from('reports').select('id', { count: 'exact', head: true }),
      client.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'hidden'),
      client.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'deleted'),
      client.from('audit_log').select('created_at, action, entity_type, actor_id').order('created_at', { ascending: false }).limit(8)
    ]);

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

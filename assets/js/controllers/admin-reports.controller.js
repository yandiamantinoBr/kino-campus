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

  // ---- Helpers ----

  function escapeHtml(str) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') return window.KCUtils.escapeHtml(str);
    console.error('[KC Admin Reports] KCUtils.escapeHtml indisponível.');
    return '';
  }

  function $(sel, root) { return (root || document).querySelector(sel); }

  function showError(msg) {
    const el = $('#admin-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
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

    const name = profile.display_name || profile.full_name || user.email || 'Admin';
    const greeting = $('#admin-greeting');
    if (greeting) greeting.textContent = `Olá, ${name}`;

    return true;
  }

  // ---- Data ----

  async function loadReports() {
    const client = getClient();
    if (!client) return [];
    const { data, error } = await client
      .from('reports')
      .select(`
        id, created_at, reason, details, status,
        post_id,
        reporter_id
      `)
      .order('created_at', { ascending: false });

    if (error) { console.error('[Admin] loadReports:', error); return []; }
    return data || [];
  }

  async function loadPostTitles(postIds) {
    if (!postIds.length) return {};
    const client = getClient();
    if (!client) return {};
    const { data, error } = await client
      .from('posts')
      .select('id, title, status')
      .in('id', postIds);

    let posts = data || [];

    if (error) {
      const message = String(error.message || '').toLowerCase();
      const details = String(error.details || '').toLowerCase();
      const legacySchemaMissingTitle = (message.includes('column') || details.includes('column'))
        && (message.includes('title') || details.includes('title'))
        && (message.includes('does not exist') || details.includes('does not exist'));

      if (!legacySchemaMissingTitle) {
        console.error('[Admin] loadPostTitles:', error);
        return {};
      }

      const { data: legacyData, error: legacyError } = await client
        .from('posts')
        .select('id, titulo, status')
        .in('id', postIds);

      if (legacyError) {
        console.error('[Admin] loadPostTitles legacy fallback:', legacyError);
        return {};
      }

      posts = legacyData || [];
    }

    const map = {};
    posts.forEach(p => { map[p.id] = p; });
    return map;
  }

  // ---- Ações ----

  async function closeReports(postId) {
    const client = getClient();
    if (!client) return;
    await client.from('reports').update({ status: 'closed' }).eq('post_id', postId).eq('status', 'open');
    await render();
  }

  async function setPostStatus(postId, status) {
    const client = getClient();
    if (!client) return;
    await client.from('posts').update({ status }).eq('id', postId);
    await render();
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

  function formatDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR'); } catch (_) { return iso; }
  }

  async function render() {
    const container = $('#admin-reports-container');
    if (!container) return;

    setLoading(true);
    const reports = await loadReports();
    setLoading(false);

    if (!reports.length) {
      container.innerHTML = `
        <div style="text-align:center;padding:40px;color:var(--kc-text-dark-secondary);">
          <i class="fas fa-check-circle" style="font-size:3em;color:#4caf50;margin-bottom:10px;"></i>
          <p style="font-size:1.1em;">Nenhuma denúncia em aberto.</p>
        </div>`;
      return;
    }

    // Agrupar por post_id
    const grouped = {};
    reports.forEach(r => {
      if (!grouped[r.post_id]) grouped[r.post_id] = [];
      grouped[r.post_id].push(r);
    });

    const postIds = Object.keys(grouped);
    const postMap = await loadPostTitles(postIds);

    const html = postIds.map(pid => {
      const items = grouped[pid];
      const open = items.filter(r => r.status === 'open');
      const post = postMap[pid] || {};
      const postTitle = escapeHtml(post.title || post.titulo || pid);
      const postStatus = post.status || 'unknown';

      // Contagem por motivo
      const reasonCounts = {};
      items.forEach(r => { reasonCounts[r.reason] = (reasonCounts[r.reason] || 0) + 1; });
      const reasonSummary = Object.entries(reasonCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([r, n]) => `<span class="kc-badge" style="background:var(--kc-surface-dark);margin:2px;">${escapeHtml(reasonLabel(r))}: <strong>${n}</strong></span>`)
        .join(' ');

      const statusColor = postStatus === 'published' ? '#4caf50' : postStatus === 'hidden' ? '#ff9800' : '#f44336';
      const postStatusBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:.8em;background:${statusColor};color:#fff;">${escapeHtml(postStatus)}</span>`;

      // Tabela de denúncias individuais (apenas open)
      const rows = open.map(r => `
        <tr>
          <td style="padding:8px;font-size:.85em;">${escapeHtml(reasonLabel(r.reason))}</td>
          <td style="padding:8px;font-size:.8em;color:var(--kc-text-dark-secondary);">${escapeHtml(r.details || '—')}</td>
          <td style="padding:8px;font-size:.8em;color:var(--kc-text-dark-secondary);">${escapeHtml(formatDate(r.created_at))}</td>
          <td style="padding:8px;">
            <span style="padding:2px 8px;border-radius:4px;font-size:.8em;background:${r.status === 'open' ? '#ff5722' : '#9e9e9e'};color:#fff;">${escapeHtml(r.status)}</span>
          </td>
        </tr>`).join('');

      return `
      <div class="kc-admin-report-group" style="background:var(--kc-surface-dark);border:1px solid var(--kc-border-dark);border-radius:12px;padding:20px;margin-bottom:20px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
          <div>
            <div style="font-weight:700;font-size:1.05em;margin-bottom:4px;">
              <i class="fas fa-file-alt" style="margin-right:6px;opacity:.6;"></i>
              ${postTitle} ${postStatusBadge}
            </div>
            <div style="font-size:.8em;color:var(--kc-text-dark-secondary);margin-bottom:6px;">
              ID: <code>${escapeHtml(pid)}</code>
              &nbsp;·&nbsp; Total denúncias: <strong>${items.length}</strong>
              &nbsp;·&nbsp; Em aberto: <strong>${open.length}</strong>
            </div>
            <div>${reasonSummary}</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <a href="../product.html?id=${encodeURIComponent(pid)}" target="_blank"
               style="padding:7px 14px;background:var(--kc-background-dark);border:1px solid var(--kc-border-dark);border-radius:6px;text-decoration:none;font-size:.85em;color:var(--kc-text-dark);">
               <i class="fas fa-eye"></i> Ver post
            </a>
            ${open.length > 0 ? `
            <button onclick="KCAdmin.closeReports('${escapeHtml(pid)}')"
                    style="padding:7px 14px;background:#1565c0;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.85em;">
              <i class="fas fa-check"></i> Fechar denúncias
            </button>` : ''}
            ${postStatus === 'published' ? `
            <button onclick="KCAdmin.setPostStatus('${escapeHtml(pid)}', 'hidden')"
                    style="padding:7px 14px;background:#e65100;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.85em;">
              <i class="fas fa-eye-slash"></i> Ocultar post
            </button>` : ''}
            ${postStatus === 'hidden' ? `
            <button onclick="KCAdmin.setPostStatus('${escapeHtml(pid)}', 'published')"
                    style="padding:7px 14px;background:#2e7d32;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.85em;">
              <i class="fas fa-eye"></i> Restaurar post
            </button>` : ''}
            <button onclick="KCAdmin.setPostStatus('${escapeHtml(pid)}', 'deleted')"
                    style="padding:7px 14px;background:#b71c1c;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.85em;"
                    title="Esta ação não pode ser desfeita pelo painel.">
              <i class="fas fa-trash"></i> Deletar post
            </button>
          </div>
        </div>
        ${open.length > 0 ? `
        <div style="overflow-x:auto;margin-top:10px;">
          <table style="width:100%;border-collapse:collapse;font-size:.9em;">
            <thead>
              <tr style="border-bottom:1px solid var(--kc-border-dark);">
                <th style="padding:8px;text-align:left;font-weight:600;">Motivo</th>
                <th style="padding:8px;text-align:left;font-weight:600;">Detalhes</th>
                <th style="padding:8px;text-align:left;font-weight:600;">Data</th>
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

  // ---- Boot ----

  async function boot() {
    setLoading(true);
    const ok = await checkAdminAccess();
    setLoading(false);
    if (!ok) return;

    $('#admin-content').style.display = 'block';
    await render();
  }

  // Expose actions globally for onclick handlers in rendered HTML
  window.KCAdmin = { closeReports, setPostStatus, _render: render };

  document.addEventListener('DOMContentLoaded', boot);
})();

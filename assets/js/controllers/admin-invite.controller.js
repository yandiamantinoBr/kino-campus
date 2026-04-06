(function () {
  'use strict';

  // Controlador do painel de convites de usuários externos
  // Requer: window.KCAPI, admin autenticado com is_admin = true
  // Usado em: admin/moderation.html

  function $(id) { return document.getElementById(id); }

  function escapeHtml(v) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') {
      return window.KCUtils.escapeHtml(String(v == null ? '' : v));
    }
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch (_) { return String(iso); }
  }

  function setFeedback(message, tone) {
    var el = $('invite-feedback');
    if (!el) return;
    if (!message) { el.style.display = 'none'; el.textContent = ''; return; }
    el.style.display = 'block';
    el.textContent = String(message);
    el.className = 'kc-admin-invite-feedback kc-admin-invite-feedback--' + (tone || 'info');
  }

  function setBtnLoading(loading) {
    var btn = $('invite-btn');
    if (!btn) return;
    btn.disabled = !!loading;
    btn.innerHTML = loading
      ? '<i class="fas fa-spinner fa-spin"></i> Enviando…'
      : '<i class="fas fa-paper-plane"></i> Enviar Convite';
  }

  function renderInviteRow(invite) {
    var statusHtml;
    if (invite.used_at) {
      statusHtml = '<span class="kc-badge" style="background:#22c55e;">Usado</span>';
    } else if (invite.is_expired) {
      statusHtml = '<span class="kc-badge" style="background:#9e9e9e;">Expirado</span>';
    } else {
      statusHtml = '<span class="kc-badge" style="background:#3b82f6;">Pendente</span>';
    }

    return '<tr data-invite-email="' + escapeHtml(invite.email) + '">' +
      '<td style="font-size:.9em;">' + escapeHtml(invite.email) + '</td>' +
      '<td style="font-size:.85em;white-space:nowrap;">' + formatDate(invite.invited_at) + '</td>' +
      '<td style="font-size:.85em;white-space:nowrap;">' + formatDate(invite.expires_at) + '</td>' +
      '<td>' + statusHtml + '</td>' +
      '<td style="font-size:.85em;color:var(--kc-text-dark-secondary);">' + escapeHtml(invite.note || '') + '</td>' +
      '<td>' +
        '<button class="kc-admin-invite-revoke" data-email="' + escapeHtml(invite.email) + '" ' +
          'style="padding:4px 10px;border:none;border-radius:6px;background:#c62828;color:#fff;font-size:.8em;cursor:pointer;" ' +
          'title="Revogar convite">' +
          '<i class="fas fa-times"></i>' +
        '</button>' +
      '</td>' +
    '</tr>';
  }

  async function loadInvites() {
    var tbody = $('invite-table-body');
    var empty = $('invite-list-empty');
    var table = $('invite-table');
    if (!tbody) return;

    if (!window.KCAPI || typeof window.KCAPI.getInvites !== 'function') return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:14px;color:var(--kc-text-dark-secondary);">Carregando…</td></tr>';
    if (table) table.style.display = 'table';
    if (empty) empty.style.display = 'none';

    var result = await window.KCAPI.getInvites();

    if (result.error) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:14px;color:#ef9a9a;">Erro ao carregar convites.</td></tr>';
      return;
    }

    var invites = result.data || [];
    if (!invites.length) {
      if (table) table.style.display = 'none';
      if (empty) { empty.style.display = 'block'; empty.textContent = 'Nenhum convite enviado ainda.'; }
      return;
    }

    if (table) table.style.display = 'table';
    if (empty) empty.style.display = 'none';
    tbody.innerHTML = invites.map(renderInviteRow).join('');
  }

  async function handleInviteSubmit(event) {
    event.preventDefault();
    var emailInput = $('invite-email');
    var noteInput  = $('invite-note');
    if (!emailInput) return;

    var email = String(emailInput.value || '').trim().toLowerCase();
    var note  = String(noteInput ? noteInput.value : '').trim();

    if (!email || !email.includes('@')) {
      setFeedback('Digite um e-mail válido.', 'error');
      return;
    }

    if (!window.KCAPI || typeof window.KCAPI.inviteExternalUser !== 'function') {
      setFeedback('API de convites não disponível.', 'error');
      return;
    }

    setFeedback('', '');
    setBtnLoading(true);

    var result = await window.KCAPI.inviteExternalUser(email, note || null);

    setBtnLoading(false);

    if (!result.ok) {
      setFeedback('Erro: ' + (result.error || 'Não foi possível enviar o convite.'), 'error');
      return;
    }

    var msg = result.data && result.data.already_registered
      ? 'Usuário ' + email + ' já estava cadastrado. Whitelist atualizada.'
      : 'Convite enviado para ' + email + '. O link expira em 7 dias.';

    setFeedback(msg, 'success');
    emailInput.value = '';
    if (noteInput) noteInput.value = '';
    loadInvites();
  }

  async function handleRevokeClick(event) {
    var btn = event.target && event.target.closest ? event.target.closest('.kc-admin-invite-revoke') : null;
    if (!btn) return;

    var email = String(btn.getAttribute('data-email') || '').trim();
    if (!email) return;

    if (!confirm('Revogar convite de ' + email + '?\nO usuário não conseguirá mais usar o link de convite.')) return;

    btn.disabled = true;

    if (!window.KCAPI || typeof window.KCAPI.revokeInvite !== 'function') return;

    var result = await window.KCAPI.revokeInvite(email);
    if (result.ok) {
      setFeedback('Convite de ' + email + ' revogado.', 'success');
      loadInvites();
    } else {
      btn.disabled = false;
      setFeedback('Erro ao revogar: ' + (result.error || 'tente novamente.'), 'error');
    }
  }

  function init() {
    var panel = $('invite-panel');
    if (!panel) return;

    var form = $('invite-form');
    if (form) form.addEventListener('submit', handleInviteSubmit);

    var tbody = $('invite-table-body');
    if (tbody) tbody.addEventListener('click', handleRevokeClick);

    // Aguardar o admin-shell liberar o conteúdo admin antes de carregar
    var attempts = 0;
    function tryLoad() {
      if (window.KCAPI && typeof window.KCAPI.getInvites === 'function') {
        // Verificar se o admin-content já está visível
        var content = document.getElementById('admin-content');
        if (content && content.style.display !== 'none') {
          loadInvites();
          return;
        }
      }
      if (attempts < 20) {
        attempts++;
        setTimeout(tryLoad, 500);
      }
    }
    setTimeout(tryLoad, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

})();

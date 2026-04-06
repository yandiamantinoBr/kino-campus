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
      ? '<i class="fas fa-spinner fa-spin"></i> Gerando link…'
      : '<i class="fas fa-paper-plane"></i> Gerar Link de Convite';
  }

  function hideLinkArea() {
    var area = $('invite-link-area');
    if (area) area.style.display = 'none';
    var input = $('invite-link-input');
    if (input) input.value = '';
  }

  function showLinkArea(link) {
    var area = $('invite-link-area');
    var input = $('invite-link-input');
    if (!area || !input) return;
    input.value = link;
    area.style.display = 'block';
    input.focus();
    input.select();
  }

  function handleCopyLink() {
    var input = $('invite-link-input');
    if (!input || !input.value) return;
    var btn = $('invite-link-copy');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(function () {
        if (btn) {
          var orig = btn.innerHTML;
          btn.innerHTML = '<i class="fas fa-check"></i> Copiado!';
          setTimeout(function () { btn.innerHTML = orig; }, 2000);
        }
      }).catch(function () {
        input.select();
        document.execCommand('copy');
      });
    } else {
      input.select();
      document.execCommand('copy');
      if (btn) {
        var orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Copiado!';
        setTimeout(function () { btn.innerHTML = orig; }, 2000);
      }
    }
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
    var wrap  = $('invite-table-wrap');
    if (!tbody) return;

    if (!window.KCAPI || typeof window.KCAPI.getInvites !== 'function') return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:14px;color:var(--kc-text-dark-secondary);">Carregando…</td></tr>';
    if (wrap) wrap.style.display = '';
    if (empty) empty.style.display = 'none';

    var result;
    try {
      result = await window.KCAPI.getInvites();
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:14px;color:#ef9a9a;">Erro ao carregar convites.</td></tr>';
      return;
    }

    if (result.error) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:14px;color:#ef9a9a;">Erro ao carregar convites.</td></tr>';
      return;
    }

    var invites = result.data || [];
    if (!invites.length) {
      if (wrap) wrap.style.display = 'none';
      if (empty) { empty.style.display = 'block'; empty.textContent = 'Nenhum convite enviado ainda.'; }
      return;
    }

    if (wrap) wrap.style.display = '';
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
    hideLinkArea();
    setBtnLoading(true);

    var result;
    try {
      result = await window.KCAPI.inviteExternalUser(email, note || null);
    } catch (err) {
      setBtnLoading(false);
      setFeedback('Erro inesperado: ' + (err && err.message ? err.message : String(err)), 'error');
      return;
    }

    setBtnLoading(false);

    if (!result.ok) {
      setFeedback('Erro: ' + (result.error || 'Não foi possível gerar o convite.'), 'error');
      return;
    }

    if (result.data && result.data.already_registered) {
      setFeedback('Usuário ' + email + ' já estava cadastrado. Whitelist atualizada — pode fazer login normalmente.', 'success');
    } else {
      setFeedback('Link gerado para ' + email + '. Copie abaixo e envie pelo seu e-mail:', 'success');
      if (result.data && result.data.invite_link) {
        showLinkArea(result.data.invite_link);
      }
    }

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

    var result;
    try {
      result = await window.KCAPI.revokeInvite(email);
    } catch (err) {
      btn.disabled = false;
      setFeedback('Erro ao revogar: ' + (err && err.message ? err.message : String(err)), 'error');
      return;
    }

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

    var copyBtn = $('invite-link-copy');
    if (copyBtn) copyBtn.addEventListener('click', handleCopyLink);

    // Aguardar o admin-shell liberar o conteúdo admin antes de carregar
    var attempts = 0;
    function tryLoad() {
      if (window.KCAPI && typeof window.KCAPI.getInvites === 'function') {
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

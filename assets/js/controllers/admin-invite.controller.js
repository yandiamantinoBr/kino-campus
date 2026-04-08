(function () {
  'use strict';

  var POLL_DELAY_MS = 500;
  var INITIAL_POLL_DELAY_MS = 1000;
  var MAX_POLL_ATTEMPTS = 20;
  var COPY_FEEDBACK_MS = 2000;
  var pollTimer = 0;

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
    if (!iso) return '-';
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
    if (!message) {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }
    el.style.display = 'block';
    el.textContent = String(message);
    el.className = 'kc-admin-invite-feedback kc-admin-invite-feedback--' + (tone || 'info');
  }

  function setTemporaryButtonLabel(button, html) {
    if (!button) return;
    var original = button.getAttribute('data-kc-original-html') || button.innerHTML;
    button.setAttribute('data-kc-original-html', original);
    button.innerHTML = html;
    window.clearTimeout(button._kcLabelTimer);
    button._kcLabelTimer = window.setTimeout(function () {
      button.innerHTML = button.getAttribute('data-kc-original-html') || original;
    }, COPY_FEEDBACK_MS);
  }

  function setBtnLoading(loading) {
    var btn = $('invite-btn');
    if (!btn) return;
    btn.disabled = !!loading;
    btn.innerHTML = loading
      ? '<i class="fas fa-spinner fa-spin"></i> Gerando link...'
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
    input.value = String(link || '');
    area.style.display = 'block';
    input.focus();
    input.select();
  }

  function normalizeResultError(result, fallback) {
    var error = result && result.error;
    if (error && typeof error === 'object' && error.message) return String(error.message);
    if (typeof error === 'string' && error.trim()) return error.trim();
    return fallback;
  }

  function clearPollTimer() {
    if (pollTimer) {
      window.clearTimeout(pollTimer);
      pollTimer = 0;
    }
  }

  function schedulePoll(callback, delay) {
    clearPollTimer();
    pollTimer = window.setTimeout(callback, delay);
  }

  function fallbackCopyFromInput(input) {
    if (!input) return false;
    input.focus();
    input.select();
    try {
      return document.execCommand('copy') === true;
    } catch (_) {
      return false;
    }
  }

  async function copyTextToClipboard(text, input) {
    var normalized = String(text || '');
    if (!normalized) return false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(normalized);
        return true;
      } catch (_) {
        return fallbackCopyFromInput(input);
      }
    }
    return fallbackCopyFromInput(input);
  }

  async function handleCopyLink() {
    var input = $('invite-link-input');
    if (!input || !input.value) {
      setFeedback('Nenhum link disponivel para copiar.', 'error');
      return;
    }

    var button = $('invite-link-copy');
    var copied = await copyTextToClipboard(input.value, input);
    if (copied) {
      setTemporaryButtonLabel(button, '<i class="fas fa-check"></i> Copiado!');
      setFeedback('Link copiado para a area de transferencia.', 'success');
      return;
    }

    setTemporaryButtonLabel(button, '<i class="fas fa-copy"></i> Copie manualmente');
    setFeedback('Nao foi possivel copiar automaticamente. Copie manualmente o link exibido abaixo.', 'error');
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
    var wrap = $('invite-table-wrap');
    if (!tbody) return;

    if (!window.KCAPI || typeof window.KCAPI.getInvites !== 'function') return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:14px;color:var(--kc-text-dark-secondary);">Carregando...</td></tr>';
    if (wrap) wrap.style.display = '';
    if (empty) empty.style.display = 'none';

    var result;
    try {
      result = await window.KCAPI.getInvites();
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:14px;color:#ef9a9a;">Erro ao carregar convites.</td></tr>';
      return;
    }

    if (!result || result.error || !Array.isArray(result.data)) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:14px;color:#ef9a9a;">Erro ao carregar convites.</td></tr>';
      return;
    }

    var invites = result.data;
    if (!invites.length) {
      if (wrap) wrap.style.display = 'none';
      if (empty) {
        empty.style.display = 'block';
        empty.textContent = 'Nenhum convite enviado ainda.';
      }
      return;
    }

    if (wrap) wrap.style.display = '';
    if (empty) empty.style.display = 'none';
    tbody.innerHTML = invites.map(renderInviteRow).join('');
  }

  async function handleInviteSubmit(event) {
    event.preventDefault();
    var emailInput = $('invite-email');
    var noteInput = $('invite-note');
    if (!emailInput) return;

    var email = String(emailInput.value || '').trim().toLowerCase();
    var note = String(noteInput ? noteInput.value : '').trim();

    if (!email || !email.includes('@')) {
      setFeedback('Digite um e-mail valido.', 'error');
      return;
    }

    if (!window.KCAPI || typeof window.KCAPI.inviteExternalUser !== 'function') {
      setFeedback('API de convites nao disponivel.', 'error');
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

    if (!result || result.ok !== true) {
      setFeedback('Erro: ' + normalizeResultError(result, 'Nao foi possivel gerar o convite.'), 'error');
      return;
    }

    var data = result.data && typeof result.data === 'object' ? result.data : null;
    if (!data) {
      setFeedback('Convite processado, mas a resposta veio incompleta. Atualize a lista para conferir o status.', 'info');
      emailInput.value = '';
      if (noteInput) noteInput.value = '';
      loadInvites();
      return;
    }

    if (data.already_registered) {
      setFeedback('Usuario ' + email + ' ja estava cadastrado. Whitelist atualizada e login liberado.', 'success');
    } else if (typeof data.invite_link === 'string' && data.invite_link.trim()) {
      setFeedback('Link gerado para ' + email + '. Copie abaixo e envie pelo seu e-mail.', 'success');
      showLinkArea(data.invite_link.trim());
    } else {
      setFeedback('Convite gerado para ' + email + ', mas o link nao foi retornado. Atualize a lista para acompanhar o status.', 'info');
    }

    emailInput.value = '';
    if (noteInput) noteInput.value = '';
    loadInvites();
  }

  async function handleRevokeClick(event) {
    var button = event.target && event.target.closest ? event.target.closest('.kc-admin-invite-revoke') : null;
    if (!button) return;

    var email = String(button.getAttribute('data-email') || '').trim();
    if (!email) return;

    if (!window.KCAPI || typeof window.KCAPI.revokeInvite !== 'function') {
      setFeedback('API de revogacao nao disponivel.', 'error');
      return;
    }

    if (!confirm('Revogar convite de ' + email + '?\nO usuario nao conseguira mais usar o link de convite.')) return;

    button.disabled = true;

    var result;
    try {
      result = await window.KCAPI.revokeInvite(email);
    } catch (err) {
      button.disabled = false;
      setFeedback('Erro ao revogar: ' + (err && err.message ? err.message : String(err)), 'error');
      return;
    }

    if (result && result.ok) {
      setFeedback('Convite de ' + email + ' revogado.', 'success');
      loadInvites();
      return;
    }

    button.disabled = false;
    setFeedback('Erro ao revogar: ' + normalizeResultError(result, 'tente novamente.'), 'error');
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

    window.addEventListener('pagehide', clearPollTimer, { once: true });

    var attempts = 0;
    function tryLoad() {
      if (window.KCAPI && typeof window.KCAPI.getInvites === 'function') {
        var content = $('admin-content');
        if (content && content.style.display !== 'none') {
          clearPollTimer();
          loadInvites();
          return;
        }
      }
      if (attempts < MAX_POLL_ATTEMPTS) {
        attempts += 1;
        schedulePoll(tryLoad, POLL_DELAY_MS);
      }
    }

    schedulePoll(tryLoad, INITIAL_POLL_DELAY_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}());

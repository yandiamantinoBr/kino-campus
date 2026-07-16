(function () {
  'use strict';

  var POLL_DELAY_MS = 500;
  var INITIAL_POLL_DELAY_MS = 1000;
  var MAX_POLL_ATTEMPTS = 20;
  var SLOW_POLL_DELAY_MS = 2500;
  var COPY_FEEDBACK_MS = 2000;
  var pollTimer = 0;
  var inviteRequestSeq = 0;
  var pageInactive = false;

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
    btn.setAttribute('aria-busy', loading ? 'true' : 'false');
    var form = $('invite-form');
    if (form) form.setAttribute('aria-busy', loading ? 'true' : 'false');
    btn.innerHTML = loading
      ? '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Gerando link...'
      : '<i class="fas fa-paper-plane" aria-hidden="true"></i> Gerar Link de Convite';
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
    if (pageInactive) return;
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
      setFeedback('Nenhum link disponível para copiar.', 'error');
      return;
    }

    var button = $('invite-link-copy');
    var copied = await copyTextToClipboard(input.value, input);
    if (copied) {
      setTemporaryButtonLabel(button, '<i class="fas fa-check" aria-hidden="true"></i> Copiado!');
      setFeedback('Link copiado para a área de transferência.', 'success');
      return;
    }

    setTemporaryButtonLabel(button, '<i class="fas fa-copy" aria-hidden="true"></i> Copie manualmente');
    setFeedback('Não foi possível copiar automaticamente. Copie manualmente o link exibido abaixo.', 'error');
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

    var safeEmail = escapeHtml(invite.email);
    return '<tr data-invite-email="' + safeEmail + '">' +
      '<td data-label="E-mail" style="font-size:.9em;">' + safeEmail + '</td>' +
      '<td data-label="Enviado em" style="font-size:.85em;white-space:nowrap;">' + formatDate(invite.invited_at) + '</td>' +
      '<td data-label="Expira em" style="font-size:.85em;white-space:nowrap;">' + formatDate(invite.expires_at) + '</td>' +
      '<td data-label="Status">' + statusHtml + '</td>' +
      '<td data-label="Nota" style="font-size:.85em;color:var(--kc-text-dark-secondary);">' + escapeHtml(invite.note || '—') + '</td>' +
      '<td data-label="Ação">' +
        '<button type="button" class="kc-admin-invite-revoke" data-email="' + escapeHtml(invite.email) + '" ' +
          'style="padding:4px 10px;border:none;border-radius:6px;background:#c62828;color:#fff;font-size:.8em;cursor:pointer;" ' +
          'title="Revogar convite" aria-label="Revogar convite de ' + safeEmail + '">' +
          '<i class="fas fa-times" aria-hidden="true"></i>' +
        '</button>' +
      '</td>' +
    '</tr>';
  }

  function renderInviteListUnavailable(message) {
    var tbody = $('invite-table-body');
    var empty = $('invite-list-empty');
    var wrap = $('invite-table-wrap');
    inviteRequestSeq += 1;
    if (tbody) tbody.innerHTML = '';
    if (wrap) {
      wrap.style.display = 'none';
      wrap.setAttribute('aria-busy', 'false');
    }
    if (empty) {
      empty.style.display = 'block';
      empty.style.color = '#ef9a9a';
      empty.setAttribute('role', 'alert');
      empty.textContent = String(message || 'A lista de convites está indisponível no momento.');
    }
  }

  async function loadInvites() {
    var tbody = $('invite-table-body');
    var empty = $('invite-list-empty');
    var wrap = $('invite-table-wrap');
    if (!tbody) return;

    if (!window.KCAPI || typeof window.KCAPI.getInvites !== 'function') {
      renderInviteListUnavailable('Não foi possível inicializar a API da lista de convites. Atualize a página e tente novamente.');
      return;
    }

    var requestSeq = ++inviteRequestSeq;
    tbody.innerHTML = '<tr><td data-label="Status" colspan="6" style="text-align:center;padding:14px;color:var(--kc-text-dark-secondary);">' +
      '<span class="kc-admin-loading-state" role="status" aria-live="polite">' +
        '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Carregando convites…' +
      '</span>' +
    '</td></tr>';
    if (wrap) wrap.style.display = '';
    if (wrap) wrap.setAttribute('aria-busy', 'true');
    if (empty) {
      empty.style.display = 'none';
      empty.style.removeProperty('color');
      empty.setAttribute('role', 'status');
    }

    try {
      var result = await window.KCAPI.getInvites();
      if (requestSeq !== inviteRequestSeq) return;

      if (!result || result.error || !Array.isArray(result.data)) {
        tbody.innerHTML = '<tr><td data-label="Status" colspan="6" role="alert" style="text-align:center;padding:14px;color:#ef9a9a;">Erro ao carregar convites.</td></tr>';
        return;
      }

      var invites = result.data;
      if (!invites.length) {
        tbody.innerHTML = '';
        if (wrap) wrap.style.display = 'none';
        if (empty) {
          empty.style.display = 'block';
          empty.style.removeProperty('color');
          empty.setAttribute('role', 'status');
          empty.textContent = 'Nenhum convite enviado ainda.';
        }
        return;
      }

      if (wrap) wrap.style.display = '';
      if (empty) empty.style.display = 'none';
      tbody.innerHTML = invites.map(renderInviteRow).join('');
    } catch (err) {
      if (requestSeq !== inviteRequestSeq) return;
      tbody.innerHTML = '<tr><td data-label="Status" colspan="6" role="alert" style="text-align:center;padding:14px;color:#ef9a9a;">Erro ao carregar convites.</td></tr>';
    } finally {
      if (requestSeq === inviteRequestSeq && wrap) {
        wrap.setAttribute('aria-busy', 'false');
      }
    }
  }

  async function handleInviteSubmit(event) {
    event.preventDefault();
    var emailInput = $('invite-email');
    var noteInput = $('invite-note');
    if (!emailInput) return;

    var email = String(emailInput.value || '').trim().toLowerCase();
    var note = String(noteInput ? noteInput.value : '').trim();

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

    if (!result || result.ok !== true) {
      setFeedback('Erro: ' + normalizeResultError(result, 'Não foi possível gerar o convite.'), 'error');
      return;
    }

    var data = result.data && typeof result.data === 'object' ? result.data : null;
    if (!data) {
      setFeedback('Convite processado, mas a resposta veio incompleta. Atualize a lista para conferir o status.', 'info');
      emailInput.value = '';
      if (noteInput) noteInput.value = '';
      await loadInvites();
      return;
    }

    if (data.already_registered) {
      setFeedback('Usuário ' + email + ' já estava cadastrado. Lista de acesso atualizada e login liberado.', 'success');
    } else if (typeof data.invite_link === 'string' && data.invite_link.trim()) {
      setFeedback('Link gerado para ' + email + '. Copie abaixo e envie pelo seu e-mail.', 'success');
      showLinkArea(data.invite_link.trim());
    } else {
      setFeedback('Convite gerado para ' + email + ', mas o link não foi retornado. Atualize a lista para acompanhar o status.', 'info');
    }

    emailInput.value = '';
    if (noteInput) noteInput.value = '';
    await loadInvites();
  }

  async function handleRevokeClick(event) {
    var button = event.target && event.target.closest ? event.target.closest('.kc-admin-invite-revoke') : null;
    if (!button) return;

    var email = String(button.getAttribute('data-email') || '').trim();
    if (!email) return;

    if (!window.KCAPI || typeof window.KCAPI.revokeInvite !== 'function') {
      setFeedback('API de revogação não disponível.', 'error');
      return;
    }

    if (!confirm('Revogar convite de ' + email + '?\nO usuário não conseguirá mais usar o link de convite.')) return;

    var row = button.closest('tr');
    var originalHtml = button.innerHTML;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>';
    if (row) row.setAttribute('aria-busy', 'true');
    setFeedback('Revogando o convite de ' + email + '…', 'info');

    try {
      var result = await window.KCAPI.revokeInvite(email);
      if (result && result.ok) {
        await loadInvites();
        setFeedback('Convite de ' + email + ' revogado.', 'success');
        return;
      }

      setFeedback('Erro ao revogar: ' + normalizeResultError(result, 'tente novamente.'), 'error');
    } catch (err) {
      setFeedback('Erro ao revogar: ' + (err && err.message ? err.message : String(err)), 'error');
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.innerHTML = originalHtml;
      if (row) row.setAttribute('aria-busy', 'false');
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

    window.addEventListener('pagehide', function () {
      pageInactive = true;
      clearPollTimer();
    }, { once: true });

    var attempts = 0;
    var unavailableShown = false;
    function tryLoad() {
      if (pageInactive) return;
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
        return;
      }
      clearPollTimer();
      if (!unavailableShown) {
        unavailableShown = true;
        renderInviteListUnavailable(
          'A lista de convites ainda não ficou disponível. Continuaremos tentando; verifique sua conexão ou atualize a página.'
        );
      }
      schedulePoll(tryLoad, SLOW_POLL_DELAY_MS);
    }

    schedulePoll(tryLoad, INITIAL_POLL_DELAY_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}());

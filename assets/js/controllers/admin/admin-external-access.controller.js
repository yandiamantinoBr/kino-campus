/*
 * KinoCampus -- admin-external-access.controller.js (v9.3.5.4)
 *
 * Gerencia a seção "Solicitações de Acesso Externo" em /admin/moderation.html.
 * - Lista pendentes / aprovadas / recusadas via KCAPI.listExternalAccessRequests
 * - Aprova/recusa via KCAPI.decideExternalAccessRequest (chama Edge Function
 *   kc-external-access-decide que envia o e-mail apropriado)
 * - Modal de confirmação com nota opcional
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__kcAdminExternalAccessInstalled) return;
  window.__kcAdminExternalAccessInstalled = true;

  const PANEL_SELECTOR = '#external-access-panel';
  const STATE = {
    activeTab: 'pending',
    items: [],
    countsByStatus: { pending: 0, approved: 0, rejected: 0 },
    loading: false,
    modal: { id: null, decision: null, requesterName: '', email: '' },
  };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function formatRelative(value) {
    if (!value) return '-';
    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return '-';
      const diff = Date.now() - date.getTime();
      const sec = Math.floor(diff / 1000);
      if (sec < 60) return 'agora há pouco';
      const min = Math.floor(sec / 60);
      if (min < 60) return `há ${min} min`;
      const hr = Math.floor(min / 60);
      if (hr < 24) return `há ${hr} h`;
      const day = Math.floor(hr / 24);
      if (day < 30) return `há ${day} dia${day > 1 ? 's' : ''}`;
      return date.toLocaleDateString('pt-BR');
    } catch (_) { return '-'; }
  }

  function setFeedback(message, kind) {
    const el = $('#ext-access-feedback');
    if (!el) return;
    if (!message) { el.textContent = ''; el.className = 'kc-admin-invite-feedback'; return; }
    el.textContent = message;
    el.className = `kc-admin-invite-feedback is-${kind || 'info'}`;
  }

  function setLoading(loading) {
    STATE.loading = !!loading;
    const el = $('#ext-access-loading');
    if (el) el.style.display = loading ? 'block' : 'none';
  }

  function setEmpty(empty) {
    const el = $('#ext-access-empty');
    if (el) el.style.display = empty ? 'block' : 'none';
  }

  function updateTabCounts() {
    Object.keys(STATE.countsByStatus).forEach((status) => {
      const el = document.querySelector(`[data-ext-count="${status}"]`);
      if (el) el.textContent = String(STATE.countsByStatus[status] || 0);
    });
  }

  function renderItem(item) {
    const statusClass = `is-${item.admin_status || 'pending'}`;
    const decidedAt = item.admin_decided_at
      ? `<span class="kc-ext-meta-pill"><i class="fas fa-gavel"></i> Decidida ${escapeHtml(formatRelative(item.admin_decided_at))}</span>`
      : '';
    const noteBlock = item.admin_note
      ? `<div class="kc-ext-note"><i class="fas fa-note-sticky"></i> ${escapeHtml(item.admin_note)}</div>`
      : '';
    const affiliation = item.affiliation_context
      ? `<div class="kc-ext-affiliation"><strong>Vínculo:</strong> ${escapeHtml(item.affiliation_context)}</div>`
      : '';
    const showActions = item.admin_status === 'pending';
    const actionsBlock = showActions
      ? `<div class="kc-ext-actions">
           <button type="button" class="kc-btn-primary kc-ext-approve" data-action="approve" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.requester_name || '')}" data-email="${escapeHtml(item.contact_email)}">
             <i class="fas fa-check"></i> Aprovar
           </button>
           <button type="button" class="kc-btn-secondary kc-ext-reject" data-action="reject" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.requester_name || '')}" data-email="${escapeHtml(item.contact_email)}">
             <i class="fas fa-xmark"></i> Recusar
           </button>
         </div>`
      : '';

    // Status do e-mail enviado
    const meta = item.metadata || {};
    let emailBadge = '';
    if (item.admin_status === 'approved' && meta.invite_email) {
      const st = String(meta.invite_email.status || '');
      if (st === 'sent') emailBadge = '<span class="kc-ext-email-status is-ok"><i class="fas fa-envelope-circle-check"></i> Convite enviado</span>';
      else if (st === 'failed') emailBadge = '<span class="kc-ext-email-status is-err"><i class="fas fa-triangle-exclamation"></i> Falha no envio do convite</span>';
    }
    if (item.admin_status === 'rejected' && meta.rejection_email) {
      const st = String(meta.rejection_email.status || '');
      if (st === 'sent') emailBadge = '<span class="kc-ext-email-status is-ok"><i class="fas fa-envelope-circle-check"></i> E-mail de recusa enviado</span>';
      else if (st === 'pending_provider_setup') emailBadge = '<span class="kc-ext-email-status is-warn"><i class="fas fa-hourglass-half"></i> E-mail pendente (configurar Resend)</span>';
      else if (st === 'failed') emailBadge = '<span class="kc-ext-email-status is-err"><i class="fas fa-triangle-exclamation"></i> Falha no envio</span>';
    }

    return `
      <article class="kc-ext-card ${statusClass}" data-id="${escapeHtml(item.id)}">
        <header class="kc-ext-card-head">
          <div class="kc-ext-card-title">
            <strong>${escapeHtml(item.requester_name || 'Solicitante')}</strong>
            <span class="kc-ext-card-email">${escapeHtml(item.contact_email)}</span>
          </div>
          <div class="kc-ext-card-meta">
            <span class="kc-ext-meta-pill"><i class="fas fa-clock"></i> ${escapeHtml(formatRelative(item.created_at))}</span>
            ${decidedAt}
            ${emailBadge}
          </div>
        </header>
        ${affiliation}
        <div class="kc-ext-message">${escapeHtml(item.message)}</div>
        ${noteBlock}
        ${actionsBlock}
      </article>
    `.trim();
  }

  function renderList() {
    const root = $('#ext-access-list');
    if (!root) return;
    const items = STATE.items.filter((i) => i.admin_status === STATE.activeTab);
    if (!items.length) {
      root.innerHTML = '';
      setEmpty(true);
      return;
    }
    setEmpty(false);
    root.innerHTML = items.map(renderItem).join('');
  }

  async function fetchByStatus(status) {
    if (!window.KCAPI || typeof window.KCAPI.listExternalAccessRequests !== 'function') {
      setFeedback('KCAPI.listExternalAccessRequests indisponível.', 'error');
      return { items: [], total: 0 };
    }
    const res = await window.KCAPI.listExternalAccessRequests({ status, limit: 100 });
    if (!res || res.ok === false) {
      setFeedback((res && res.error && res.error.message) || 'Falha ao listar solicitações.', 'error');
      return { items: [], total: 0 };
    }
    return { items: res.items || [], total: res.total || 0 };
  }

  async function refreshAll() {
    setLoading(true);
    setFeedback('');
    try {
      // Conta total por status (pequenos requests)
      const [pending, approved, rejected] = await Promise.all([
        fetchByStatus('pending'),
        fetchByStatus('approved'),
        fetchByStatus('rejected'),
      ]);
      STATE.countsByStatus = {
        pending: pending.total,
        approved: approved.total,
        rejected: rejected.total,
      };
      STATE.items = [].concat(pending.items, approved.items, rejected.items);
      updateTabCounts();
      renderList();
    } catch (e) {
      console.error('[admin-external-access] refresh exception:', e);
      setFeedback('Erro inesperado ao atualizar a lista.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function bindTabs() {
    document.addEventListener('click', (ev) => {
      const tab = ev.target.closest && ev.target.closest('[data-ext-tab]');
      if (!tab) return;
      const newTab = String(tab.getAttribute('data-ext-tab') || '').toLowerCase();
      if (!['pending', 'approved', 'rejected'].includes(newTab)) return;
      STATE.activeTab = newTab;
      $$('[data-ext-tab]').forEach((t) => {
        const isActive = t === tab;
        t.classList.toggle('is-active', isActive);
        t.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      renderList();
    });

    const refreshBtn = $('#ext-access-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshAll);
  }

  function openModal({ id, decision, requesterName, email }) {
    STATE.modal = { id, decision, requesterName: requesterName || '', email: email || '' };
    const modal = $('#ext-access-modal');
    if (!modal) return;
    const title = $('#ext-modal-title');
    const summary = $('#ext-modal-summary');
    const confirm = $('#ext-modal-confirm');
    const note = $('#ext-modal-note');
    if (note) note.value = '';
    if (title) title.textContent = decision === 'approved' ? 'Aprovar solicitação' : 'Recusar solicitação';
    if (summary) {
      summary.innerHTML = decision === 'approved'
        ? `Aprovar acesso para <strong>${escapeHtml(requesterName || email)}</strong> (${escapeHtml(email)})? Um e-mail de convite será enviado automaticamente.`
        : `Recusar a solicitação de <strong>${escapeHtml(requesterName || email)}</strong> (${escapeHtml(email)})?`;
    }
    if (confirm) {
      confirm.className = decision === 'approved' ? 'kc-btn-primary' : 'kc-btn-danger';
      confirm.innerHTML = decision === 'approved'
        ? '<i class="fas fa-check"></i> Aprovar e enviar convite'
        : '<i class="fas fa-xmark"></i> Recusar';
    }
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => { try { note && note.focus(); } catch (_) {} }, 50);
  }

  function closeModal() {
    const modal = $('#ext-access-modal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    STATE.modal = { id: null, decision: null, requesterName: '', email: '' };
  }

  async function confirmModalDecision() {
    const { id, decision } = STATE.modal;
    if (!id || !decision) return;
    const note = String(($('#ext-modal-note') || {}).value || '').trim();
    const confirmBtn = $('#ext-modal-confirm');
    if (confirmBtn) confirmBtn.disabled = true;
    setFeedback(decision === 'approved' ? 'Aprovando solicitação...' : 'Registrando recusa...', 'info');
    try {
      const res = await window.KCAPI.decideExternalAccessRequest({
        help_request_id: id,
        decision,
        admin_note: note,
      });
      if (!res || res.ok === false) {
        const msg = (res && res.error && res.error.message) || 'Falha ao processar decisão.';
        setFeedback(msg, 'error');
        return;
      }
      const data = res.data || {};
      let successMsg = '';
      if (decision === 'approved') {
        if (data.invite_sent === false && data.invite_link) {
          // SMTP falhou -> mostrar o link gerado para envio manual
          showInviteLinkPrompt(data.invite_link, data.invite_sent_to || '', data.smtp_error || '');
          successMsg = 'Solicitação aprovada. SMTP indisponível — link de convite gerado abaixo para envio manual.';
          closeModal();
          await refreshAll();
          setFeedback(successMsg, 'warn');
          return;
        }
        successMsg = `Solicitação aprovada e convite enviado para ${data.invite_sent_to || 'o solicitante'}.`;
      } else {
        if (data.email_sent === false) {
          successMsg = 'Solicitação marcada como recusada. E-mail não enviado (configure Resend para envio automático).';
        } else {
          successMsg = 'Solicitação marcada como recusada e e-mail de recusa enviado.';
        }
      }
      setFeedback(successMsg, 'success');
      closeModal();
      await refreshAll();
    } catch (e) {
      console.error('[admin-external-access] decision exception:', e);
      setFeedback('Erro inesperado. Tente novamente.', 'error');
    } finally {
      if (confirmBtn) confirmBtn.disabled = false;
    }
  }

  function bindModal() {
    document.addEventListener('click', (ev) => {
      const closer = ev.target.closest && ev.target.closest('[data-ext-modal-close]');
      if (closer) { closeModal(); return; }
      const confirm = ev.target.closest && ev.target.closest('#ext-modal-confirm');
      if (confirm) { confirmModalDecision(); return; }
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        const modal = $('#ext-access-modal');
        if (modal && modal.style.display !== 'none') closeModal();
      }
    });
  }

  // v9.3.5.4: quando SMTP falhar, mostra link de convite para envio manual
  function showInviteLinkPrompt(link, email, smtpError) {
    let area = $('#ext-access-invite-link-area');
    if (!area) {
      const panel = $('#external-access-panel');
      if (!panel) return;
      area = document.createElement('div');
      area.id = 'ext-access-invite-link-area';
      area.style.cssText = 'margin:14px 0;padding:14px 16px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:10px;';
      // Insere antes do bloco de tabs
      const tabs = $('#ext-access-tabs');
      if (tabs && tabs.parentNode) tabs.parentNode.insertBefore(area, tabs);
      else panel.appendChild(area);
    }
    const safeEmail = escapeHtml(email);
    const safeLink = escapeHtml(link);
    const errBlock = smtpError
      ? `<p style="margin:6px 0;font-size:0.8em;color:var(--kc-text-dark-secondary);"><i class="fas fa-triangle-exclamation"></i> SMTP: <code style="background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px;">${escapeHtml(smtpError)}</code></p>`
      : '';
    area.innerHTML = `
      <h4 style="margin:0 0 8px;color:#f59e0b;font-size:0.98em;display:flex;align-items:center;gap:6px;">
        <i class="fas fa-link"></i> Link de convite gerado para ${safeEmail}
      </h4>
      <p style="margin:0 0 10px;font-size:0.85em;color:var(--kc-text-dark-secondary);">
        O SMTP do Supabase Auth não conseguiu enviar automaticamente. Copie o link abaixo e envie pelo seu e-mail
        (ex: contato@kinocampus.com.br). O link é válido por 7 dias e leva direto ao onboarding.
      </p>
      ${errBlock}
      <div style="display:flex;gap:6px;align-items:center;margin-top:6px;">
        <input type="text" readonly value="${safeLink}"
          style="flex:1;padding:8px 10px;border-radius:6px;border:1px solid var(--kc-border-dark);background:var(--kc-background-dark);color:var(--kc-text-dark);font-size:0.8em;font-family:monospace;min-width:0;"
          onclick="this.select();" />
        <button type="button" class="kc-btn-primary" data-ext-copy-invite-link
          style="padding:8px 14px;border-radius:6px;border:none;cursor:pointer;white-space:nowrap;flex-shrink:0;">
          <i class="fas fa-copy"></i> Copiar
        </button>
        <button type="button" class="kc-btn-secondary" data-ext-dismiss-invite-link
          style="padding:8px 12px;border-radius:6px;cursor:pointer;flex-shrink:0;" title="Ocultar este aviso">
          <i class="fas fa-xmark"></i>
        </button>
      </div>
    `;
    area.style.display = 'block';
    // Scroll suave até o link
    setTimeout(() => { try { area.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {} }, 100);
  }

  function bindInviteLinkActions() {
    document.addEventListener('click', (ev) => {
      const copyBtn = ev.target.closest && ev.target.closest('[data-ext-copy-invite-link]');
      if (copyBtn) {
        const area = $('#ext-access-invite-link-area');
        if (!area) return;
        const input = area.querySelector('input[readonly]');
        if (!input) return;
        try {
          input.select();
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(input.value);
          } else {
            document.execCommand('copy');
          }
          const original = copyBtn.innerHTML;
          copyBtn.innerHTML = '<i class="fas fa-check"></i> Copiado!';
          setTimeout(() => { copyBtn.innerHTML = original; }, 1800);
        } catch (e) {
          console.error('[admin-external-access] copy error:', e);
        }
        return;
      }
      const dismissBtn = ev.target.closest && ev.target.closest('[data-ext-dismiss-invite-link]');
      if (dismissBtn) {
        const area = $('#ext-access-invite-link-area');
        if (area) area.style.display = 'none';
      }
    });
  }

  function bindActionButtons() {
    document.addEventListener('click', (ev) => {
      const btn = ev.target.closest && ev.target.closest('.kc-ext-approve, .kc-ext-reject');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const name = btn.getAttribute('data-name') || '';
      const email = btn.getAttribute('data-email') || '';
      const action = btn.getAttribute('data-action');
      const decision = action === 'approve' ? 'approved' : 'rejected';
      openModal({ id, decision, requesterName: name, email });
    });
  }

  async function init() {
    if (!$(PANEL_SELECTOR)) return; // Panel não está nesta página
    bindTabs();
    bindActionButtons();
    bindModal();
    bindInviteLinkActions();
    // Atraso curto para garantir que KCAPI esteja pronta
    setTimeout(() => { refreshAll(); }, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

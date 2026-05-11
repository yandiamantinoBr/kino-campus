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
    // Atraso curto para garantir que KCAPI esteja pronta
    setTimeout(() => { refreshAll(); }, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

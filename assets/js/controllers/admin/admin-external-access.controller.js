/*
 * KinoCampus -- admin-external-access.controller.js (v8.6.11)
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
  const LIST_PAGE_SIZE = 200;
  const MAX_LIST_ITEMS_PER_STATUS = 2000;
  let modalTokenSeq = 0;
  let refreshRequestSeq = 0;
  const STATE = {
    activeTab: 'pending',
    items: [],
    countsByStatus: { pending: 0, approved: 0, rejected: 0 },
    loading: false,
    hasLoaded: false,
    snapshotIncomplete: true,
    lastUpdatedAt: null,
    modal: {
      id: null,
      decision: null,
      requesterName: '',
      email: '',
      busy: false,
      token: 0,
    },
    returnFocus: null,
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

  function cloneSnapshotItems(items) {
    try {
      return JSON.parse(JSON.stringify(Array.isArray(items) ? items : []));
    } catch (_) {
      return [];
    }
  }

  function freezeSnapshotValue(value) {
    if (Array.isArray(value)) {
      return Object.freeze(value.map((item) => freezeSnapshotValue(item)));
    }
    if (value && typeof value === 'object') {
      Object.keys(value).forEach((key) => {
        value[key] = freezeSnapshotValue(value[key]);
      });
      return Object.freeze(value);
    }
    return value;
  }

  function readExternalAccessSnapshot() {
    return freezeSnapshotValue({
      available: STATE.hasLoaded,
      incomplete: STATE.snapshotIncomplete,
      refreshing: STATE.loading,
      updatedAt: STATE.lastUpdatedAt,
      activeTab: STATE.activeTab,
      countsByStatus: { ...STATE.countsByStatus },
      items: cloneSnapshotItems(STATE.items),
    });
  }

  window.KCAdminExternalAccessSnapshot = Object.freeze({
    read: readExternalAccessSnapshot,
  });

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
    if (!message) {
      el.textContent = '';
      el.className = 'kc-admin-invite-feedback';
      el.style.display = 'none';
      return;
    }
    el.textContent = message;
    el.className = `kc-admin-invite-feedback is-${kind || 'info'}`;
    el.style.display = 'block';
  }

  function setLoading(loading) {
    STATE.loading = !!loading;
    const el = $('#ext-access-loading');
    if (el) el.style.display = loading ? 'block' : 'none';
    const panel = $(PANEL_SELECTOR);
    if (panel) panel.setAttribute('aria-busy', loading ? 'true' : 'false');
    const list = $('#ext-access-list');
    if (list) list.setAttribute('aria-busy', loading ? 'true' : 'false');
    const refresh = $('#ext-access-refresh');
    if (refresh) {
      refresh.disabled = !!loading;
      refresh.setAttribute('aria-busy', loading ? 'true' : 'false');
    }
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

  function renderProcessingBadge(delivery, label) {
    const claimedAt = delivery && delivery.claimed_at ? new Date(delivery.claimed_at).getTime() : NaN;
    const isStale = Number.isFinite(claimedAt) && (Date.now() - claimedAt) > (15 * 60 * 1000);
    if (isStale) {
      return `<span class="kc-ext-email-status is-err" title="A entrega não foi confirmada. Consulte os logs da Edge Function antes de qualquer envio manual, pois o reenvio automático é bloqueado para evitar duplicidade."><i class="fas fa-triangle-exclamation" aria-hidden="true"></i> ${escapeHtml(label)} sem confirmação</span>`;
    }
    return `<span class="kc-ext-email-status is-warn" title="A entrega foi reivindicada por uma operação em andamento; novas tentativas não enviam outra mensagem."><i class="fas fa-spinner fa-spin" aria-hidden="true"></i> ${escapeHtml(label)} em processamento</span>`;
  }

  function renderItem(item) {
    const statusClass = `is-${item.admin_status || 'pending'}`;
    const decidedAt = item.admin_decided_at
      ? `<span class="kc-ext-meta-pill"><i class="fas fa-gavel" aria-hidden="true"></i> Decidida ${escapeHtml(formatRelative(item.admin_decided_at))}</span>`
      : '';
    const noteBlock = item.admin_note
      ? `<div class="kc-ext-note"><i class="fas fa-note-sticky" aria-hidden="true"></i> ${escapeHtml(item.admin_note)}</div>`
      : '';
    const affiliation = item.affiliation_context
      ? `<div class="kc-ext-affiliation"><strong>Vínculo:</strong> ${escapeHtml(item.affiliation_context)}</div>`
      : '';
    const showActions = item.admin_status === 'pending';
    const actionsBlock = showActions
      ? `<div class="kc-ext-actions">
           <button type="button" class="kc-btn-primary kc-ext-approve" data-action="approve" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.requester_name || '')}" data-email="${escapeHtml(item.contact_email)}">
             <i class="fas fa-check" aria-hidden="true"></i> Aprovar
           </button>
           <button type="button" class="kc-btn-secondary kc-ext-reject" data-action="reject" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.requester_name || '')}" data-email="${escapeHtml(item.contact_email)}">
             <i class="fas fa-xmark" aria-hidden="true"></i> Recusar
           </button>
         </div>`
      : '';

    // Status do e-mail enviado
    const meta = item.metadata || {};
    let emailBadge = '';
    if (item.admin_status === 'approved' && meta.invite_email) {
      const st = String(meta.invite_email.status || '');
      if (st === 'sent') emailBadge = '<span class="kc-ext-email-status is-ok"><i class="fas fa-envelope-circle-check" aria-hidden="true"></i> Convite enviado</span>';
      else if (st === 'failed') emailBadge = '<span class="kc-ext-email-status is-err"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i> Falha no envio do convite</span>';
      else if (st === 'processing') emailBadge = renderProcessingBadge(meta.invite_email, 'Convite');
      else if (st === 'link_generated' && meta.invite_email.invite_link) {
        emailBadge = `<button type="button" class="kc-ext-email-status is-warn" data-ext-recover-invite-link="${escapeHtml(item.id)}"><i class="fas fa-link" aria-hidden="true"></i> Recuperar link manual</button>`;
      }
    }
    if (item.admin_status === 'rejected' && meta.rejection_email) {
      const st = String(meta.rejection_email.status || '');
      if (st === 'sent') emailBadge = '<span class="kc-ext-email-status is-ok"><i class="fas fa-envelope-circle-check" aria-hidden="true"></i> E-mail de recusa enviado</span>';
      else if (st === 'pending_provider_setup') emailBadge = '<span class="kc-ext-email-status is-warn"><i class="fas fa-hourglass-half" aria-hidden="true"></i> E-mail pendente (configurar SMTP administrativo)</span>';
      else if (st === 'failed') emailBadge = '<span class="kc-ext-email-status is-err"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i> Falha no envio</span>';
      else if (st === 'processing') emailBadge = renderProcessingBadge(meta.rejection_email, 'E-mail');
    }

    return `
      <article class="kc-ext-card ${statusClass}" data-id="${escapeHtml(item.id)}">
        <header class="kc-ext-card-head">
          <div class="kc-ext-card-title">
            <strong>${escapeHtml(item.requester_name || 'Solicitante')}</strong>
            <span class="kc-ext-card-email">${escapeHtml(item.contact_email)}</span>
          </div>
          <div class="kc-ext-card-meta">
            <span class="kc-ext-meta-pill"><i class="fas fa-clock" aria-hidden="true"></i> ${escapeHtml(formatRelative(item.created_at))}</span>
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

  function isSupabaseAdminApiReady() {
    const env = window.KCAPI && window.KCAPI.ENV ? window.KCAPI.ENV : {};
    const driver = String(env.driver || env.DATA_DRIVER || '').toLowerCase();
    return driver === 'supabase'
      && !!(window.KCAPI && typeof window.KCAPI.listExternalAccessRequests === 'function')
      && !!(window.KCAPI && typeof window.KCAPI.decideExternalAccessRequest === 'function');
  }

  async function fetchByStatus(status) {
    if (!window.KCAPI || typeof window.KCAPI.listExternalAccessRequests !== 'function') {
      return {
        items: [],
        total: 0,
        failed: true,
        error: 'KCAPI.listExternalAccessRequests indisponível.',
      };
    }
    if (!isSupabaseAdminApiReady()) {
      return {
        items: [],
        total: 0,
        failed: true,
        error: 'Solicitações externas exigem o modo Supabase.',
      };
    }
    let first = null;
    try {
      first = await window.KCAPI.listExternalAccessRequests({
        status,
        limit: LIST_PAGE_SIZE,
        offset: 0,
      });
    } catch (error) {
      return {
        items: [],
        total: 0,
        failed: true,
        error: (error && error.message) || 'Falha ao listar solicitações.',
      };
    }
    if (!first || first.ok === false) {
      return {
        items: [],
        total: 0,
        failed: true,
        error: (first && first.error && first.error.message) || 'Falha ao listar solicitações.',
      };
    }

    const total = Math.max(0, Number(first.total) || 0);
    const target = Math.min(total, MAX_LIST_ITEMS_PER_STATUS);
    const items = Array.isArray(first.items) ? first.items.slice() : [];

    while (items.length < target) {
      let page = null;
      try {
        page = await window.KCAPI.listExternalAccessRequests({
          status,
          limit: Math.min(LIST_PAGE_SIZE, target - items.length),
          offset: items.length,
        });
      } catch (error) {
        console.error('[admin-external-access] partial page exception:', status, error);
        return {
          items: [],
          total,
          failed: true,
          error: (error && error.message) || 'Falha em uma página do histórico.',
        };
      }
      if (!page || page.ok === false) {
        console.error('[admin-external-access] partial page failure:', status, page && page.error);
        return {
          items: [],
          total,
          failed: true,
          error: (page && page.error && page.error.message) || 'Falha em uma página do histórico.',
        };
      }
      const pageItems = Array.isArray(page.items) ? page.items : [];
      if (!pageItems.length) {
        break;
      }
      items.push(...pageItems);
    }

    return {
      items,
      total,
      incomplete: total > MAX_LIST_ITEMS_PER_STATUS || items.length < target,
      failed: false,
    };
  }

  async function refreshAll() {
    const requestSeq = ++refreshRequestSeq;
    if (!isSupabaseAdminApiReady()) {
      STATE.snapshotIncomplete = true;
      setLoading(false);
      setFeedback('Solicitações externas exigem o modo Supabase.', 'warn');
      return;
    }
    const previousItems = Array.isArray(STATE.items) ? STATE.items.slice() : [];
    const previousCounts = { ...STATE.countsByStatus };
    setLoading(true);
    setFeedback('');
    try {
      // Conta total por status (pequenos requests)
      const [pending, approved, rejected] = await Promise.all([
        fetchByStatus('pending'),
        fetchByStatus('approved'),
        fetchByStatus('rejected'),
      ]);
      if (requestSeq !== refreshRequestSeq) return;
      const byStatus = { pending, approved, rejected };
      const failedStatuses = [];
      const incompleteStatuses = [];
      const successfulStatuses = [];
      const nextItems = [];
      const nextCounts = {};
      Object.keys(byStatus).forEach((status) => {
        const result = byStatus[status];
        if (result.failed) {
          failedStatuses.push(status);
          nextCounts[status] = Number(previousCounts[status]) || 0;
          nextItems.push(...previousItems.filter((item) => item.admin_status === status));
          return;
        }
        successfulStatuses.push(status);
        nextCounts[status] = result.total;
        nextItems.push(...result.items);
        if (result.incomplete) incompleteStatuses.push(status);
      });
      STATE.countsByStatus = {
        pending: nextCounts.pending,
        approved: nextCounts.approved,
        rejected: nextCounts.rejected,
      };
      STATE.items = nextItems;
      if (successfulStatuses.length) {
        STATE.hasLoaded = true;
        STATE.lastUpdatedAt = new Date().toISOString();
      }
      STATE.snapshotIncomplete = failedStatuses.length > 0 || incompleteStatuses.length > 0;
      updateTabCounts();
      renderList();
      if (failedStatuses.length) {
        setFeedback(
          'Não foi possível atualizar ' + failedStatuses.join(', ') + '. Os dados anteriores dessas categorias foram preservados.',
          'warn'
        );
      } else if (incompleteStatuses.length) {
        setFeedback(
          'A contagem total foi atualizada, mas parte do histórico não pôde ser carregada. Use Atualizar para tentar novamente.',
          'warn'
        );
      }
    } catch (e) {
      if (requestSeq !== refreshRequestSeq) return;
      console.error('[admin-external-access] refresh exception:', e);
      STATE.snapshotIncomplete = true;
      setFeedback('Erro inesperado ao atualizar a lista. Os dados anteriores foram preservados.', 'error');
    } finally {
      if (requestSeq === refreshRequestSeq) setLoading(false);
    }
  }

  function bindTabs() {
    const tabsRoot = $('#ext-access-tabs');
    if (!tabsRoot) return;

    function activateTab(tab, focusTab) {
      if (!tab) return;
      const newTab = String(tab.getAttribute('data-ext-tab') || '').toLowerCase();
      if (!['pending', 'approved', 'rejected'].includes(newTab)) return;
      STATE.activeTab = newTab;
      $$('[data-ext-tab]', tabsRoot).forEach((t) => {
        const isActive = t === tab;
        t.classList.toggle('is-active', isActive);
        t.setAttribute('aria-selected', isActive ? 'true' : 'false');
        t.setAttribute('tabindex', isActive ? '0' : '-1');
      });
      const list = $('#ext-access-list');
      if (list && tab.id) list.setAttribute('aria-labelledby', tab.id);
      renderList();
      if (focusTab) tab.focus();
    }

    tabsRoot.addEventListener('click', (ev) => {
      const tab = ev.target.closest && ev.target.closest('[data-ext-tab]');
      if (!tab || !tabsRoot.contains(tab)) return;
      activateTab(tab, false);
    });

    tabsRoot.addEventListener('keydown', (ev) => {
      const currentTab = ev.target.closest && ev.target.closest('[data-ext-tab]');
      if (!currentTab || !tabsRoot.contains(currentTab)) return;
      const tabs = $$('[data-ext-tab]', tabsRoot);
      const currentIndex = tabs.indexOf(currentTab);
      if (currentIndex < 0) return;

      let nextIndex = currentIndex;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') {
        nextIndex = (currentIndex + 1) % tabs.length;
      } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if (ev.key === 'Home') {
        nextIndex = 0;
      } else if (ev.key === 'End') {
        nextIndex = tabs.length - 1;
      } else {
        return;
      }

      ev.preventDefault();
      activateTab(tabs[nextIndex], true);
    });

    const refreshBtn = $('#ext-access-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshAll);
  }

  function setModalBusy(busy, expectedToken) {
    if (expectedToken != null && STATE.modal.token !== expectedToken) return false;
    STATE.modal.busy = !!busy;
    const modal = $('#ext-access-modal');
    if (modal) modal.setAttribute('aria-busy', busy ? 'true' : 'false');
    $$('[data-ext-modal-close]', modal || document).forEach((closer) => {
      if ('disabled' in closer) closer.disabled = !!busy;
      closer.setAttribute('aria-disabled', busy ? 'true' : 'false');
    });
    const note = $('#ext-modal-note');
    if (note) note.disabled = !!busy;
    return true;
  }

  function openModal({ id, decision, requesterName, email }) {
    const modal = $('#ext-access-modal');
    if (!modal || STATE.modal.busy || modal.getAttribute('aria-hidden') === 'false') {
      if (STATE.modal.busy) setFeedback('Aguarde a conclusão da decisão em andamento.', 'info');
      return;
    }
    STATE.returnFocus = document.activeElement && typeof document.activeElement.focus === 'function'
      ? document.activeElement
      : null;
    STATE.modal = {
      id,
      decision,
      requesterName: requesterName || '',
      email: email || '',
      busy: false,
      token: ++modalTokenSeq,
    };
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
        ? '<i class="fas fa-check" aria-hidden="true"></i> Aprovar e enviar convite'
        : '<i class="fas fa-xmark" aria-hidden="true"></i> Recusar';
    }
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    modal.setAttribute('aria-busy', 'false');
    setTimeout(() => { try { note && note.focus(); } catch (_) {} }, 50);
  }

  function closeModal(force, expectedToken) {
    const modal = $('#ext-access-modal');
    if (!modal) return false;
    if (expectedToken != null && STATE.modal.token !== expectedToken) return false;
    if (STATE.modal.busy && !force) {
      setFeedback('Aguarde a conclusão da decisão em andamento.', 'info');
      return false;
    }
    const returnFocus = STATE.returnFocus;
    setModalBusy(false, STATE.modal.token);
    const confirm = $('#ext-modal-confirm');
    if (confirm) {
      confirm.disabled = false;
      confirm.removeAttribute('aria-busy');
    }
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('aria-busy', 'false');
    STATE.modal = {
      id: null,
      decision: null,
      requesterName: '',
      email: '',
      busy: false,
      token: ++modalTokenSeq,
    };
    STATE.returnFocus = null;
    if (returnFocus && document.contains(returnFocus)) {
      setTimeout(() => {
        try { returnFocus.focus(); } catch (_) { /* ignore */ }
      }, 0);
    }
    return true;
  }

  async function confirmModalDecision() {
    const { id, decision, token } = STATE.modal;
    if (!id || !decision || STATE.modal.busy) return;
    if (!isSupabaseAdminApiReady()) {
      setFeedback('Solicitações externas exigem o modo Supabase.', 'warn');
      return;
    }
    const note = String(($('#ext-modal-note') || {}).value || '').trim();
    const confirmBtn = $('#ext-modal-confirm');
    const originalConfirmHtml = confirmBtn ? confirmBtn.innerHTML : '';
    setModalBusy(true, token);
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.setAttribute('aria-busy', 'true');
      confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Processando…';
    }
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
      if (data.delivery_status === 'processing') {
        closeModal(true, token);
        await refreshAll();
        setFeedback(
          'A decisão já foi registrada e a entrega continua em processamento. Nenhuma mensagem duplicada foi enviada.',
          'warn'
        );
        return;
      }
      if (decision === 'approved') {
        if (data.invite_sent === false && data.invite_link) {
          // SMTP falhou -> mostrar o link gerado para envio manual
          showInviteLinkPrompt(data.invite_link, data.invite_sent_to || '', data.smtp_error || '');
          successMsg = 'Solicitação aprovada. SMTP indisponível — link de convite gerado abaixo para envio manual.';
        } else if (data.invite_sent === false) {
          successMsg = 'Solicitação aprovada, mas o convite não foi entregue. Nenhuma nova tentativa automática será feita para evitar mensagens duplicadas.';
        } else {
          successMsg = `Solicitação aprovada e convite enviado para ${data.invite_sent_to || 'o solicitante'}.`;
        }
      } else {
        if (data.email_sent === false) {
          successMsg = 'Solicitação marcada como recusada, mas o SMTP administrativo não confirmou o envio.';
        } else {
          successMsg = 'Solicitação marcada como recusada e e-mail de recusa enviado.';
        }
      }
      if (data.delivery_state_persisted === false) {
        successMsg += ' O resultado da entrega não foi confirmado no histórico; revise o item que permanece em processamento antes de qualquer ação manual.';
      }
      closeModal(true, token);
      await refreshAll();
      setFeedback(
        successMsg,
        data.delivery_state_persisted === false
          || data.invite_sent === false
          || data.email_sent === false
          ? 'warn'
          : 'success'
      );
    } catch (e) {
      console.error('[admin-external-access] decision exception:', e);
      setFeedback('Erro inesperado. Tente novamente.', 'error');
    } finally {
      if (STATE.modal.token === token) {
        setModalBusy(false, token);
      }
      if (confirmBtn && STATE.modal.token === token) {
        confirmBtn.disabled = false;
        confirmBtn.removeAttribute('aria-busy');
        confirmBtn.innerHTML = originalConfirmHtml;
      }
    }
  }

  function bindModal() {
    document.addEventListener('click', (ev) => {
      const closer = ev.target.closest && ev.target.closest('[data-ext-modal-close]');
      if (closer) {
        ev.preventDefault();
        closeModal(false);
        return;
      }
      const confirm = ev.target.closest && ev.target.closest('#ext-modal-confirm');
      if (confirm) { confirmModalDecision(); return; }
    });

    document.addEventListener('keydown', (ev) => {
      const modal = $('#ext-access-modal');
      if (!modal || modal.style.display === 'none') return;
      if (ev.key === 'Escape') {
        ev.preventDefault();
        closeModal(false);
        return;
      }
      if (ev.key !== 'Tab') return;
      const focusable = $$(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        modal
      ).filter((node) => node.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) {
        ev.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
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
      ? `<p style="margin:6px 0;font-size:0.8em;color:var(--kc-text-dark-secondary);"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i> SMTP: <code style="background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px;">${escapeHtml(smtpError)}</code></p>`
      : '';
    area.innerHTML = `
      <h4 style="margin:0 0 8px;color:#f59e0b;font-size:0.98em;display:flex;align-items:center;gap:6px;">
        <i class="fas fa-link" aria-hidden="true"></i> Link de convite gerado para ${safeEmail}
      </h4>
      <p style="margin:0 0 10px;font-size:0.85em;color:var(--kc-text-dark-secondary);">
        O SMTP do Supabase Auth não conseguiu enviar automaticamente. Copie o link abaixo e envie pelo seu e-mail
        (ex: contato@kinocampus.com.br). O link é temporário e pode expirar conforme a configuração
        do Supabase Auth; envie-o imediatamente.
      </p>
      ${errBlock}
      <div style="display:flex;gap:6px;align-items:center;margin-top:6px;">
        <input type="text" readonly value="${safeLink}" aria-label="Link de convite gerado para ${safeEmail || 'o solicitante'}"
          style="flex:1;padding:8px 10px;border-radius:6px;border:1px solid var(--kc-border-dark);background:var(--kc-background-dark);color:var(--kc-text-dark);font-size:0.8em;font-family:monospace;min-width:0;"
          onclick="this.select();" />
        <button type="button" class="kc-btn-primary" data-ext-copy-invite-link aria-label="Copiar link de convite"
          style="padding:8px 14px;border-radius:6px;border:none;cursor:pointer;white-space:nowrap;flex-shrink:0;">
          <i class="fas fa-copy" aria-hidden="true"></i> Copiar
        </button>
        <button type="button" class="kc-btn-secondary" data-ext-dismiss-invite-link
          style="padding:8px 12px;border-radius:6px;cursor:pointer;flex-shrink:0;" title="Ocultar este aviso" aria-label="Ocultar link de convite">
          <i class="fas fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
    `;
    area.style.display = 'block';
    const prefersReducedMotion = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => {
      try {
        area.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
      } catch (_) {}
    }, 100);
  }

  function fallbackCopyInviteLink(input) {
    if (!input) return false;
    input.focus();
    input.select();
    try {
      return document.execCommand('copy') === true;
    } catch (_) {
      return false;
    }
  }

  async function copyInviteLink(input) {
    if (!input || !input.value) return false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(input.value);
        return true;
      } catch (_) {
        return fallbackCopyInviteLink(input);
      }
    }
    return fallbackCopyInviteLink(input);
  }

  function bindInviteLinkActions() {
    document.addEventListener('click', async (ev) => {
      const copyBtn = ev.target.closest && ev.target.closest('[data-ext-copy-invite-link]');
      if (copyBtn) {
        if (copyBtn.disabled) return;
        const area = $('#ext-access-invite-link-area');
        if (!area) return;
        const input = area.querySelector('input[readonly]');
        if (!input) return;
        const original = copyBtn.innerHTML;
        copyBtn.disabled = true;
        copyBtn.setAttribute('aria-busy', 'true');
        try {
          const copied = await copyInviteLink(input);
          if (copied) {
            copyBtn.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> Copiado!';
            setFeedback('Link de convite copiado para a área de transferência.', 'success');
          } else {
            copyBtn.innerHTML = '<i class="fas fa-copy" aria-hidden="true"></i> Copie manualmente';
            setFeedback('Não foi possível copiar automaticamente. O link foi selecionado para cópia manual.', 'warn');
          }
        } catch (e) {
          console.error('[admin-external-access] copy error:', e);
          input.focus();
          input.select();
          copyBtn.innerHTML = '<i class="fas fa-copy" aria-hidden="true"></i> Copie manualmente';
          setFeedback('Não foi possível copiar automaticamente. O link foi selecionado para cópia manual.', 'warn');
        } finally {
          setTimeout(() => {
            if (!document.contains(copyBtn)) return;
            copyBtn.innerHTML = original;
            copyBtn.disabled = false;
            copyBtn.removeAttribute('aria-busy');
          }, 1800);
        }
        return;
      }
      const existingLinkBtn = ev.target.closest && ev.target.closest('[data-ext-recover-invite-link]');
      if (existingLinkBtn) {
        const requestId = existingLinkBtn.getAttribute('data-ext-recover-invite-link') || '';
        const item = STATE.items.find((entry) => String(entry && entry.id || '') === requestId);
        const inviteMeta = item && item.metadata && item.metadata.invite_email
          ? item.metadata.invite_email
          : {};
        showInviteLinkPrompt(
          String(inviteMeta.invite_link || ''),
          String(item && item.contact_email || ''),
          String(inviteMeta.smtp_error || inviteMeta.error_message || '')
        );
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

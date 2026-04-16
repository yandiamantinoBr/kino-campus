/**
 * @file product.report.js
 * @description Sub-módulo de denúncias da página de produto (v11.30.10)
 * Extraído de product.controller.js. Registra window._KCProduct.report.
 *
 * Dependências em runtime:
 *   - window._KCProduct  — namespace criado por product.controller.js
 *   - window.KCAPI       — getCurrentUser, reportPost
 *   - window.KC_ENV      — driver check
 *   - window.showToast   — global toast component
 *   - window.KCUtils     — escapeHtml
 *   - window.kcOpenAuthModal — auth modal (opcional)
 *
 * Carregado após product.controller.js em _product.html (defer).
 * Execução: IIFE imediata → window._KCProduct.report disponível antes de DOMContentLoaded.
 */

(function () {
  'use strict';

  window._KCProduct = window._KCProduct || {};

  // ── Utilitário local ──────────────────────────────────────────────────────
  function esc(str) {
    return (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function')
      ? window.KCUtils.escapeHtml(str)
      : String(str || '');
  }

  // ── Estado ────────────────────────────────────────────────────────────────
  var _reportPopover = null;

  var REPORT_REASONS = [
    { value: 'spam',          label: 'Spam / conteúdo repetitivo',   icon: 'fas fa-ban' },
    { value: 'scam',          label: 'Golpe / fraude',               icon: 'fas fa-exclamation-triangle' },
    { value: 'inappropriate', label: 'Conteúdo impróprio',           icon: 'fas fa-eye-slash' },
    { value: 'hate',          label: 'Ódio / assédio',               icon: 'fas fa-frown' },
    { value: 'illegal',       label: 'Ilegal / proibido',            icon: 'fas fa-gavel' },
    { value: 'duplicate',     label: 'Publicação duplicada',         icon: 'fas fa-copy' },
    { value: 'other',         label: 'Outro motivo',                 icon: 'fas fa-comment-dots' },
  ];

  // ── wireReportButton ──────────────────────────────────────────────────────
  function wireReportButton(ctx) {
    var btn = document.getElementById('reportButton');
    if (!btn) return;

    if (btn.dataset.kcReportBound === '1') {
      btn.dataset.kcReportPostId = String(ctx.postId || '');
      btn.dataset.kcReportPostTitle = String(ctx.postTitle || 'Publicação');
      return;
    }

    btn.dataset.kcReportBound = '1';
    btn.dataset.kcReportPostId = String(ctx.postId || '');
    btn.dataset.kcReportPostTitle = String(ctx.postTitle || 'Publicação');

    btn.addEventListener('click', async function (e) {
      e.stopPropagation();

      var payloadCtx = {
        postId: btn.dataset.kcReportPostId || ctx.postId,
        postTitle: btn.dataset.kcReportPostTitle || ctx.postTitle,
      };

      var driver = (window.KC_ENV && window.KC_ENV.driver) ? window.KC_ENV.driver : 'local';
      if (driver !== 'supabase') {
        try { showToast('Denúncias disponíveis apenas no modo Supabase.', 'info', 2200); } catch (_) { }
        return;
      }

      // Requer login
      var user = null;
      try {
        if (window.KCAPI && typeof window.KCAPI.getCurrentUser === 'function') {
          user = await window.KCAPI.getCurrentUser();
        }
      } catch (_) { }

      if (!user) {
        try { showToast('Faça login para denunciar.', 'info', 2200); } catch (_) { }
        try { if (typeof window.kcOpenAuthModal === 'function') window.kcOpenAuthModal(); } catch (_) { }
        return;
      }

      if (!_reportPopover) _reportPopover = buildReportPopover();
      _reportPopover.open(payloadCtx, btn);
    });
  }

  // ── buildReportPopover ────────────────────────────────────────────────────
  // Cria uma vez e reutiliza. Desktop: popover ancorado ao botão.
  // Mobile (≤640px): bottom sheet. Sem injeção de HTML com dados do usuário.
  function buildReportPopover() {
    // ── Backdrop ──────────────────────────────────────────────────
    var backdrop = document.createElement('div');
    backdrop.className = 'kc-report-popover-backdrop';
    backdrop.style.display = 'none';
    document.body.appendChild(backdrop);

    // ── Popover container ──────────────────────────────────────────
    var popover = document.createElement('div');
    popover.className = 'kc-report-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-modal', 'true');
    popover.setAttribute('aria-label', 'Denunciar publicação');
    popover.style.display = 'none';
    document.body.appendChild(popover);

    // ── Shared elements ────────────────────────────────────────────
    var header = document.createElement('div');
    header.className = 'kc-report-popover-header';

    var headerTitle = document.createElement('h3');

    var headerActions = document.createElement('div');
    headerActions.className = 'kc-report-popover-header-actions';

    var btnBack = document.createElement('button');
    btnBack.type = 'button';
    btnBack.className = 'kc-report-btn-back';
    btnBack.setAttribute('aria-label', 'Voltar');
    btnBack.innerHTML = '<i class="fas fa-arrow-left"></i>';
    btnBack.style.display = 'none';

    var btnClose = document.createElement('button');
    btnClose.type = 'button';
    btnClose.className = 'kc-report-btn-close';
    btnClose.setAttribute('aria-label', 'Fechar');
    btnClose.innerHTML = '<i class="fas fa-times"></i>';

    headerActions.appendChild(btnBack);
    headerActions.appendChild(btnClose);
    header.appendChild(headerTitle);
    header.appendChild(headerActions);

    var postLabel = document.createElement('div');
    postLabel.className = 'kc-report-post-label';

    // ── Step 1: lista de motivos ───────────────────────────────────
    var stepReasons = document.createElement('div');

    var reasonList = document.createElement('ul');
    reasonList.className = 'kc-report-reason-list';
    reasonList.setAttribute('role', 'listbox');

    REPORT_REASONS.forEach(function (r, idx) {
      var li = document.createElement('li');
      li.setAttribute('role', 'option');

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kc-report-reason-item';
      btn.dataset.kcReasonValue = r.value;

      var icon = document.createElement('i');
      icon.className = r.icon;
      icon.setAttribute('aria-hidden', 'true');

      var labelSpan = document.createElement('span');
      labelSpan.textContent = r.label;

      var chevron = document.createElement('i');
      chevron.className = 'fas fa-chevron-right kc-report-chevron';
      chevron.setAttribute('aria-hidden', 'true');

      btn.appendChild(icon);
      btn.appendChild(labelSpan);
      btn.appendChild(chevron);
      li.appendChild(btn);

      // Separador entre itens (exceto último)
      if (idx < REPORT_REASONS.length - 1) {
        var sep = document.createElement('hr');
        sep.className = 'kc-report-reason-separator';
        li.appendChild(sep);
      }

      btn.addEventListener('click', function () {
        goToConfirm(r.value, r.label);
      });

      reasonList.appendChild(li);
    });

    stepReasons.appendChild(reasonList);

    // ── Step 2: confirmação + detalhes ────────────────────────────
    var stepConfirm = document.createElement('div');
    stepConfirm.style.display = 'none';

    var confirmBody = document.createElement('div');
    confirmBody.className = 'kc-report-confirm-body';

    var confirmInfo = document.createElement('p');
    confirmInfo.className = 'kc-report-confirm-info';
    confirmInfo.textContent = 'Deseja confirmar esta denúncia? Adicione detalhes se quiser.';

    var detailsLabel = document.createElement('label');
    detailsLabel.className = 'kc-report-details-label';
    detailsLabel.textContent = 'Detalhes adicionais (opcional, máx. 1000 caracteres)';

    var detailsField = document.createElement('textarea');
    detailsField.className = 'kc-report-details-field';
    detailsField.maxLength = 1000;
    detailsField.placeholder = 'Descreva o problema com mais detalhes…';
    detailsField.rows = 3;

    var statusEl = document.createElement('div');
    statusEl.className = 'kc-report-status';

    var confirmActions = document.createElement('div');
    confirmActions.className = 'kc-report-confirm-actions';

    var btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'kc-btn-secondary';
    btnCancel.textContent = 'Cancelar';

    var btnSubmit = document.createElement('button');
    btnSubmit.type = 'button';
    btnSubmit.className = 'kc-btn-primary';
    btnSubmit.innerHTML = '<i class="fas fa-flag"></i> Enviar denúncia';

    confirmActions.appendChild(btnCancel);
    confirmActions.appendChild(btnSubmit);

    confirmBody.appendChild(confirmInfo);
    confirmBody.appendChild(detailsLabel);
    confirmBody.appendChild(detailsField);
    confirmBody.appendChild(statusEl);
    confirmBody.appendChild(confirmActions);
    stepConfirm.appendChild(confirmBody);

    // ── Assemble ───────────────────────────────────────────────────
    popover.appendChild(header);
    popover.appendChild(postLabel);
    popover.appendChild(stepReasons);
    popover.appendChild(stepConfirm);

    // ── State ──────────────────────────────────────────────────────
    var currentPostId = null;
    var currentReason = null;

    // ── Positioning (desktop) ──────────────────────────────────────
    function positionPopover(anchorBtn) {
      var isMobile = window.innerWidth <= 640;
      if (isMobile) {
        // bottom sheet: CSS handles it
        popover.style.removeProperty('top');
        popover.style.removeProperty('left');
        popover.style.removeProperty('right');
        return;
      }

      var rect = anchorBtn.getBoundingClientRect();
      var popW = 310; // matches CSS width
      var margin = 8;

      var left = rect.left;
      var top = rect.bottom + margin;

      // Evita sair pela direita
      if (left + popW > window.innerWidth - margin) {
        left = window.innerWidth - popW - margin;
      }
      // Evita sair pela esquerda
      if (left < margin) left = margin;

      // Se não cabe abaixo, abre acima
      var popH = Math.min(popover.scrollHeight || 400, window.innerHeight * 0.8);
      if (top + popH > window.innerHeight - margin) {
        top = rect.top - popH - margin;
        if (top < margin) top = margin;
      }

      popover.style.top = top + 'px';
      popover.style.left = left + 'px';
      popover.style.right = 'auto';
      popover.style.bottom = 'auto';
    }

    // ── Steps ──────────────────────────────────────────────────────
    function showStep1() {
      headerTitle.innerHTML = '<i class="fas fa-flag" aria-hidden="true"></i> Denunciar';
      btnBack.style.display = 'none';
      stepReasons.style.display = '';
      stepConfirm.style.display = 'none';
      detailsField.value = '';
      statusEl.textContent = '';
      btnSubmit.disabled = false;
      btnCancel.disabled = false;
    }

    function goToConfirm(reasonValue, reasonLabel) {
      currentReason = reasonValue;
      headerTitle.innerHTML = '<i class="fas fa-flag" aria-hidden="true"></i> ' + esc(reasonLabel);
      btnBack.style.display = '';
      stepReasons.style.display = 'none';
      stepConfirm.style.display = '';
      statusEl.textContent = '';
      try { detailsField.focus(); } catch (_) { }
    }

    // ── Open / Close ───────────────────────────────────────────────
    function open(ctx, anchorBtn) {
      currentPostId = ctx.postId;

      var title = String(ctx.postTitle || 'Publicação');
      postLabel.textContent = title;

      showStep1();

      backdrop.style.display = '';
      popover.style.display = '';

      // Positioning must happen after display (to measure dimensions)
      requestAnimationFrame(function () {
        positionPopover(anchorBtn);
      });

      try { reasonList.querySelector('.kc-report-reason-item').focus(); } catch (_) { }
    }

    function closePopover() {
      backdrop.style.display = 'none';
      popover.style.display = 'none';
      currentPostId = null;
      currentReason = null;
      showStep1();
    }

    async function submitReport() {
      if (!currentReason) return;

      btnSubmit.disabled = true;
      btnCancel.disabled = true;
      statusEl.textContent = 'Enviando…';

      var res = null;
      try {
        if (window.KCAPI && typeof window.KCAPI.reportPost === 'function') {
          res = await window.KCAPI.reportPost(currentPostId, {
            reason: currentReason,
            details: detailsField.value,
          });
        }
      } catch (e) {
        res = { ok: false, error: { message: 'Falha ao enviar.' } };
      }

      if (res && res.ok) {
        statusEl.textContent = 'Denúncia registrada. Obrigado!';
        statusEl.style.color = 'var(--kc-green-check, #22c55e)';
        try { showToast('Denúncia registrada. Obrigado!', 'success', 2200); } catch (_) { }
        setTimeout(closePopover, 900);
        return;
      }

      var msg = (res && res.error && res.error.message)
        ? String(res.error.message)
        : 'Não foi possível registrar a denúncia.';
      statusEl.textContent = msg;
      statusEl.style.color = '';
      try { showToast(msg, 'error', 2600); } catch (_) { }
      btnSubmit.disabled = false;
      btnCancel.disabled = false;
    }

    // ── Event wiring ───────────────────────────────────────────────
    btnClose.addEventListener('click', closePopover);
    btnCancel.addEventListener('click', closePopover);
    btnBack.addEventListener('click', showStep1);
    btnSubmit.addEventListener('click', submitReport);

    // Fechar ao clicar no backdrop
    backdrop.addEventListener('click', closePopover);

    // Fechar com Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && popover.style.display !== 'none') closePopover();
    });

    // Reposicionar no resize (desktop)
    window.addEventListener('resize', function () {
      if (popover.style.display !== 'none' && window.innerWidth > 640) {
        var anchorEl = document.getElementById('reportButton');
        if (anchorEl) positionPopover(anchorEl);
      }
    });

    return { open: open, close: closePopover };
  }

  // ── Namespace ─────────────────────────────────────────────────────────────
  window._KCProduct.report = {
    wireReportButton: wireReportButton,
  };

})();

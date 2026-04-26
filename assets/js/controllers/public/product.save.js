/**
 * @file product.save.js
 * @description Sub-modulo de salvamento da pagina de produto (v11.30.13)
 * Extraido de product.controller.js. Registra window._KCProduct.save.
 *
 * Dependencias em runtime:
 *   - window._KCProduct  - namespace criado por product.controller.js
 *   - window.KCAPI       - getSavedPostState, setSavedPostState, clearSavedPostState
 *   - window.showToast   - feedback visual
 *   - window.KCHomeCategories - tracking de eventos de salvamento
 *
 * Carregado apos product.calendar.js em _product.html (defer).
 * Execucao: IIFE imediata -> window._KCProduct.save disponivel antes de DOMContentLoaded.
 */

(function () {
  'use strict';

  window._KCProduct = window._KCProduct || {};

  var SAVE_POPOVER_DESKTOP_BREAKPOINT = 640;
  var SAVE_POPOVER_VIEWPORT_MARGIN = 12;
  var SAVE_POPOVER_GAP = 8;
  var savePopoverViewportBound = false;
  var savedPostState = { kinds: [], loaded: false, pending: false };
  var currentSavedPost = null;
  var currentViewerGetter = null;

  function toast(message, type, duration) {
    try {
      if (typeof window.showToast === 'function') {
        window.showToast(message, type, duration);
      }
    } catch (_) { }
  }

  function getPostIdForMutation(post) {
    if (!post) return null;
    return post.uuid || post.id || null;
  }

  function trackHomeCategoryInteraction(eventType, post) {
    try {
      if (window.KCHomeCategories && typeof window.KCHomeCategories.trackEvent === 'function') {
        window.KCHomeCategories.trackEvent(eventType, { post: post });
      }
    } catch (_) { }
  }

  function getSavedButtons() {
    return Array.from(document.querySelectorAll('[data-kc-save-kind]'));
  }

  function getSaveKindLabel(kind) {
    if (kind === 'favorite') return 'Favorito';
    if (kind === 'later') return 'Lembrar Depois';
    if (kind === 'highlight') return 'Destaque';
    return '';
  }

  function getSaveKinds() {
    return Array.isArray(savedPostState && savedPostState.kinds)
      ? savedPostState.kinds.slice()
      : [];
  }

  function clearSavePopoverPosition(popover) {
    if (!popover) return;
    popover.style.removeProperty('top');
    popover.style.removeProperty('left');
    popover.style.removeProperty('right');
    popover.style.removeProperty('bottom');
    popover.style.removeProperty('width');
    popover.style.removeProperty('max-width');
  }

  function positionSavePopover(anchorBtn) {
    var popover = document.getElementById('savePopover');
    var anchor = anchorBtn || document.getElementById('saveButton');
    if (!popover || !anchor) return;

    if (window.innerWidth <= SAVE_POPOVER_DESKTOP_BREAKPOINT) {
      clearSavePopoverPosition(popover);
      return;
    }

    var rect = anchor.getBoundingClientRect();
    var viewportMargin = SAVE_POPOVER_VIEWPORT_MARGIN;
    var maxWidth = Math.max(180, window.innerWidth - (viewportMargin * 2));
    var preferredWidth = Math.min(330, maxWidth);
    var popoverHeight = Math.min(
      popover.scrollHeight || popover.offsetHeight || 0,
      Math.floor(window.innerHeight * 0.84)
    );

    var left = rect.left;
    if ((left + preferredWidth) > (window.innerWidth - viewportMargin)) {
      left = window.innerWidth - preferredWidth - viewportMargin;
    }
    if (left < viewportMargin) left = viewportMargin;

    var top = rect.bottom + SAVE_POPOVER_GAP;
    if ((top + popoverHeight) > (window.innerHeight - viewportMargin)) {
      top = rect.top - popoverHeight - SAVE_POPOVER_GAP;
      if (top < viewportMargin) top = viewportMargin;
    }

    popover.style.width = preferredWidth + 'px';
    popover.style.maxWidth = maxWidth + 'px';
    popover.style.top = Math.round(top) + 'px';
    popover.style.left = Math.round(left) + 'px';
    popover.style.right = 'auto';
    popover.style.bottom = 'auto';
  }

  function scheduleSavePopoverPosition(anchorBtn) {
    window.requestAnimationFrame(function () {
      var popover = document.getElementById('savePopover');
      if (!popover || !popover.classList.contains('active')) return;
      positionSavePopover(anchorBtn);
    });
  }

  function syncActiveSavePopover() {
    var popover = document.getElementById('savePopover');
    if (!popover || !popover.classList.contains('active')) return;
    positionSavePopover(document.getElementById('saveButton'));
  }

  function ensureSavePopoverViewportBinding() {
    if (savePopoverViewportBound) return;
    savePopoverViewportBound = true;

    var syncScheduled = false;
    var scheduleSync = function () {
      if (syncScheduled) return;
      syncScheduled = true;
      window.requestAnimationFrame(function () {
        syncScheduled = false;
        syncActiveSavePopover();
      });
    };

    window.addEventListener('resize', scheduleSync, { passive: true });
    window.addEventListener('scroll', scheduleSync, { passive: true, capture: true });
  }

  function closeExternalPopover(popoverId, backdropId, buttonId) {
    var popover = document.getElementById(popoverId);
    var backdrop = document.getElementById(backdropId);
    var button = document.getElementById(buttonId);
    if (popover) {
      popover.classList.remove('active');
      popover.setAttribute('aria-hidden', 'true');
      clearSavePopoverPosition(popover);
    }
    if (backdrop) backdrop.classList.remove('active');
    if (button) button.setAttribute('aria-expanded', 'false');
  }

  function openSavePopover(btn) {
    var popover = document.getElementById('savePopover');
    var backdrop = document.getElementById('saveBackdrop');
    if (!popover) return;
    closeExternalPopover('sharePopover', 'shareBackdrop', 'shareButton');
    if (window._KCProduct.calendar && typeof window._KCProduct.calendar.closeCalendarPopover === 'function') {
      window._KCProduct.calendar.closeCalendarPopover();
    } else {
      closeExternalPopover('calendarPopover', 'calendarBackdrop', 'calendarButton');
    }
    popover.classList.add('active');
    popover.setAttribute('aria-hidden', 'false');
    scheduleSavePopoverPosition(btn);
    if (backdrop) backdrop.classList.add('active');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }

  function closeSavePopover() {
    var popover = document.getElementById('savePopover');
    var backdrop = document.getElementById('saveBackdrop');
    var btn = document.getElementById('saveButton');
    if (popover) {
      popover.classList.remove('active');
      popover.setAttribute('aria-hidden', 'true');
      clearSavePopoverPosition(popover);
    }
    if (backdrop) backdrop.classList.remove('active');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function wireSavePopover() {
    var saveBtn = document.getElementById('saveButton');
    var backdrop = document.getElementById('saveBackdrop');
    var closeBtn = document.getElementById('savePopoverClose');
    if (!saveBtn) return;
    ensureSavePopoverViewportBinding();

    saveBtn.addEventListener('click', function (e) {
      var popover;
      e.stopPropagation();
      popover = document.getElementById('savePopover');
      if (popover && popover.classList.contains('active')) closeSavePopover();
      else openSavePopover(saveBtn);
    });

    if (backdrop) backdrop.addEventListener('click', closeSavePopover);
    if (closeBtn) closeBtn.addEventListener('click', closeSavePopover);
  }

  function updateSavedButtonsUI() {
    var activeKinds = new Set(getSaveKinds());
    var loading = !!(savedPostState && savedPostState.pending);
    getSavedButtons().forEach(function (button) {
      var kind = String(button.getAttribute('data-kc-save-kind') || '').trim();
      var active = !!kind && activeKinds.has(kind);
      button.classList.toggle('is-active', active);
      button.classList.toggle('is-loading', loading);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      if (loading) button.setAttribute('aria-busy', 'true');
      else button.removeAttribute('aria-busy');
    });

    var trigger = document.getElementById('saveButton');
    var count = document.getElementById('saveButtonCount');
    var totalActive = activeKinds.size;
    if (trigger) {
      trigger.classList.toggle('is-active', totalActive > 0);
      trigger.classList.toggle('is-loading', loading);
      trigger.setAttribute('aria-pressed', totalActive > 0 ? 'true' : 'false');
    }
    if (count) {
      if (totalActive > 0) {
        count.style.display = 'inline-flex';
        count.textContent = String(totalActive);
      } else {
        count.style.display = 'none';
        count.textContent = '0';
      }
    }
  }

  async function refreshSavedState(post) {
    var postId = getPostIdForMutation(post);
    currentSavedPost = post || null;
    if (!postId || !window.KCAPI || typeof window.KCAPI.getSavedPostState !== 'function') {
      savedPostState = { kinds: [], loaded: true, pending: false };
      updateSavedButtonsUI();
      return;
    }

    try {
      var result = await window.KCAPI.getSavedPostState(postId);
      savedPostState = {
        kinds: Array.isArray(result && result.kinds)
          ? result.kinds.slice()
          : (result && result.kind ? [String(result.kind)] : []),
        loaded: true,
        pending: false
      };
    } catch (_) {
      savedPostState = { kinds: [], loaded: true, pending: false };
    }
    updateSavedButtonsUI();
  }

  function bindSavedActions(post, getViewer) {
    currentSavedPost = post || null;
    currentViewerGetter = getViewer || null;

    getSavedButtons().forEach(function (button) {
      if (button.dataset.kcSaveBound === '1') return;
      button.dataset.kcSaveBound = '1';
      button.addEventListener('click', async function () {
        var activePost = currentSavedPost;
        var postId = getPostIdForMutation(activePost);
        var viewer = typeof currentViewerGetter === 'function' ? currentViewerGetter() : null;
        var kind;
        var result;
        var message;
        if (!postId || !window.KCAPI) return;
        if (!viewer || !viewer.id) {
          toast('Faça login para salvar esta publicação.', 'warn', 2400);
          return;
        }

        kind = String(button.getAttribute('data-kc-save-kind') || '').trim();
        if (!kind) return;

        savedPostState = Object.assign({}, savedPostState, { pending: true });
        updateSavedButtonsUI();

        try {
          if (getSaveKinds().includes(kind)) {
            result = (typeof window.KCAPI.clearSavedPostState === 'function')
              ? await window.KCAPI.clearSavedPostState(postId, kind)
              : { ok: false, error: { message: 'Recurso indisponível.' } };
            if (!result || result.ok === false) {
              message = result && result.error && result.error.message ? String(result.error.message) : 'Não foi possível remover o item salvo.';
              toast(message, 'error', 2600);
            } else {
              savedPostState = {
                kinds: getSaveKinds().filter(function (item) { return item !== kind; }),
                loaded: true,
                pending: false
              };
              toast('Salvamento removido.', 'info', 2000);
            }
          } else {
            result = (typeof window.KCAPI.setSavedPostState === 'function')
              ? await window.KCAPI.setSavedPostState(postId, kind, true)
              : { ok: false, error: { message: 'Recurso indisponível.' } };
            if (!result || result.ok === false) {
              message = result && result.error && result.error.message ? String(result.error.message) : 'Não foi possível salvar a publicação.';
              toast(message, 'error', 2600);
            } else {
              savedPostState = {
                kinds: Array.from(new Set(getSaveKinds().concat(kind))),
                loaded: true,
                pending: false
              };
              toast(getSaveKindLabel(kind) + ' salvo com sucesso.', 'success', 2200);
              trackHomeCategoryInteraction(kind, activePost);
            }
          }
        } catch (_) {
          toast('Não foi possível atualizar este salvamento agora.', 'error', 2600);
        } finally {
          savedPostState = Object.assign({}, savedPostState, { pending: false });
          updateSavedButtonsUI();
        }
      });
    });
  }

  window._KCProduct.save = {
    closeSavePopover: closeSavePopover,
    wireSavePopover: wireSavePopover,
    bindSavedActions: bindSavedActions,
    refreshSavedState: refreshSavedState
  };
})();

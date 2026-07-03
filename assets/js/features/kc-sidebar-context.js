/**
 * KinoCampus contextual module help (V76.24).
 * Reuses each module's sidebar content in an accessible mobile dialog.
 */
(function initKcSidebarContext(global) {
  'use strict';

  var MODAL_ID = 'kcSidebarContextModal';
  var LOCK_KEY = 'sidebar-context-modal';
  var lastTrigger = null;
  var fallbackOverflow = '';

  function getModal() {
    return document.getElementById(MODAL_ID);
  }

  function createModal() {
    var existing = getModal();
    if (existing) return existing;

    var modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'kc-sidebar-context-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = [
      '<button class="kc-sidebar-context-modal__backdrop" type="button" data-kc-context-close aria-label="Fechar informações do módulo"></button>',
      '<section class="kc-sidebar-context-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="kcSidebarContextTitle" tabindex="-1">',
      '  <header class="kc-sidebar-context-modal__header">',
      '    <h2 class="kc-sidebar-context-modal__title" id="kcSidebarContextTitle"><i class="fas fa-circle-info" aria-hidden="true"></i><span>Sobre este módulo</span></h2>',
      '    <button class="kc-sidebar-context-modal__close" type="button" data-kc-context-close aria-label="Fechar"><i class="fas fa-times" aria-hidden="true"></i></button>',
      '  </header>',
      '  <div class="kc-sidebar-context-modal__body" data-kc-context-modal-body></div>',
      '</section>',
    ].join('');
    document.body.appendChild(modal);
    return modal;
  }

  function lockPage() {
    if (global.KCOverlayLock && typeof global.KCOverlayLock.lock === 'function') {
      global.KCOverlayLock.lock(LOCK_KEY);
      return;
    }
    fallbackOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  function unlockPage() {
    if (global.KCOverlayLock && typeof global.KCOverlayLock.unlock === 'function') {
      global.KCOverlayLock.unlock(LOCK_KEY);
      return;
    }
    document.body.style.overflow = fallbackOverflow;
  }

  function getFocusable(modal) {
    return Array.prototype.slice.call(modal.querySelectorAll(
      'a[href], button:not([disabled]), details > summary, [tabindex]:not([tabindex="-1"])'
    )).filter(function (element) {
      return !element.hasAttribute('hidden');
    });
  }

  function closeModal() {
    var modal = getModal();
    if (!modal || modal.getAttribute('aria-hidden') === 'true') return;
    modal.setAttribute('aria-hidden', 'true');
    unlockPage();
    if (lastTrigger && typeof lastTrigger.focus === 'function') lastTrigger.focus();
    lastTrigger = null;
  }

  function populateModal(modal, section) {
    var heading = section.querySelector('h3');
    var contentRoot = section.querySelector('.kc-sidebar-section__body') || section;
    var title = heading ? heading.textContent.trim() : 'Sobre este módulo';
    var titleSlot = modal.querySelector('#kcSidebarContextTitle span');
    var body = modal.querySelector('[data-kc-context-modal-body]');
    titleSlot.textContent = title;
    body.innerHTML = '';

    Array.prototype.forEach.call(contentRoot.children, function (child) {
      if (child === heading || (heading && child.contains(heading))) return;
      var clone = child.cloneNode(true);
      if (clone.tagName === 'DETAILS') clone.removeAttribute('open');
      body.appendChild(clone);
    });
  }

  function openModal(trigger) {
    var key = String(trigger.getAttribute('data-kc-context-open') || '').trim();
    if (!key) return;
    var section = document.querySelector('[data-kc-context-section="' + key + '"]');
    if (!section) return;

    var modal = createModal();
    populateModal(modal, section);
    lastTrigger = trigger;
    modal.setAttribute('aria-hidden', 'false');
    lockPage();

    var closeButton = modal.querySelector('.kc-sidebar-context-modal__close');
    if (closeButton) closeButton.focus();
  }

  function isInteractiveInsideOpener(event, opener) {
    if (!event || !opener || event.target === opener) return false;
    var interactive = event.target.closest && event.target.closest('a, button, input, select, textarea, summary, [role="button"]');
    return !!(interactive && interactive !== opener);
  }

  function onClick(event) {
    var opener = event.target.closest && event.target.closest('[data-kc-context-open]');
    if (opener) {
      if (isInteractiveInsideOpener(event, opener)) return;
      event.preventDefault();
      openModal(opener);
      return;
    }
    if (event.target.closest && event.target.closest('[data-kc-context-close]')) {
      event.preventDefault();
      closeModal();
    }
  }

  function onKeydown(event) {
    var opener = event.target.closest && event.target.closest('[data-kc-context-open]');
    if (opener && (event.key === 'Enter' || event.key === ' ')) {
      if (isInteractiveInsideOpener(event, opener)) return;
      event.preventDefault();
      openModal(opener);
      return;
    }
    var modal = getModal();
    if (!modal || modal.getAttribute('aria-hidden') === 'true') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== 'Tab') return;

    var focusable = getFocusable(modal);
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function init() {
    if (!document.querySelector('[data-kc-context-open]')) return;
    createModal();
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeydown);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})(window);

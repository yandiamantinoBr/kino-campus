(function () {
  'use strict';

  function forceVisible(selector) {
    var node = document.querySelector(selector);
    if (!node) return;
    node.style.visibility = 'visible';
    node.style.opacity = '1';
    node.style.pointerEvents = 'auto';
  }

  function syncHeaderHeight() {
    var header = document.querySelector('.kc-header--admin');
    if (!header) return;
    document.documentElement.style.setProperty('--kc-admin-header-height', header.offsetHeight + 'px');
  }

  function syncHeaderState() {
    if (!document.body || !document.body.classList.contains('kc-admin-page')) return;
    forceVisible('.kc-header--admin .kc-user-actions');
    forceVisible('.kc-header--admin .theme-toggle');
    forceVisible('.kc-header--admin .btn-login');
    forceVisible('.kc-header--admin .kc-header-user');
    syncHeaderHeight();
  }

  function setModalOpen(isOpen) {
    if (!document.body) return;
    document.body.classList.toggle('kc-admin-modal-open', !!isOpen);
  }

  function observeHeaderAuth() {
    var actions = document.querySelector('.kc-header--admin .kc-user-actions');
    if (!actions || typeof MutationObserver !== 'function') return;
    var observer = new MutationObserver(function () {
      syncHeaderState();
    });
    observer.observe(actions, {
      childList: true,
      subtree: true,
      attributes: true
    });
  }

  function init() {
    if (!document.body || !document.body.classList.contains('kc-admin-page')) return;
    syncHeaderState();
    observeHeaderAuth();
    window.addEventListener('resize', syncHeaderHeight);
    window.addEventListener('orientationchange', syncHeaderHeight);
    document.addEventListener('kc:authchange', function () {
      requestAnimationFrame(syncHeaderState);
    });
    document.addEventListener('kc:profilechange', function () {
      requestAnimationFrame(syncHeaderState);
    });
  }

  window.KCAdminShell = Object.freeze({
    syncHeader: syncHeaderState,
    setModalOpen: setModalOpen
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

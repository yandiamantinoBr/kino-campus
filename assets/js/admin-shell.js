(function () {
  'use strict';

  var RESIZE_DEBOUNCE_MS = 150;
  var resizeTimer = null;

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

  function normalizeHref(href) {
    return String(href || '')
      .replace(/^\.\//, '')
      .replace(/\/$/, '')
      .toLowerCase();
  }

  function getCurrentPage() {
    var parts = String(window.location.pathname || '').split('/');
    return normalizeHref(parts.pop() || 'index.html');
  }

  function syncActiveLinks(nav) {
    if (!nav) return;
    var currentPage = getCurrentPage();
    Array.from(nav.querySelectorAll('a[href]')).forEach(function (link) {
      var rawHref = String(link.getAttribute('href') || '').trim();
      var targetPage = rawHref;
      try {
        targetPage = new URL(link.href, window.location.href).pathname.split('/').pop() || rawHref;
      } catch (_) { }
      link.classList.toggle('active', normalizeHref(targetPage) === currentPage);
    });
  }

  function ensureNavLink(nav, href, iconClass, label) {
    if (!nav) return;
    var exists = Array.from(nav.querySelectorAll('a')).some(function (link) {
      return normalizeHref(link.getAttribute('href')) === normalizeHref(href);
    });
    if (exists) {
      syncActiveLinks(nav);
      return;
    }

    var link = document.createElement('a');
    link.href = href;
    link.innerHTML = '<i class="' + iconClass + '"></i><span>' + label + '</span>';
    link.className = nav.classList.contains('kc-admin-nav') ? 'kc-admin-nav__link' : '';
    nav.appendChild(link);
    syncActiveLinks(nav);
  }

  function ensureHelpRequestsLinks() {
    if (!document.body || !document.body.classList.contains('kc-admin-page')) return;
    ensureNavLink(document.querySelector('.kc-admin-nav'), 'help-requests.html', 'fas fa-life-ring', 'Pedidos de ajuda');
    ensureNavLink(document.querySelector('.kc-mobile-nav'), 'help-requests.html', 'fas fa-life-ring', 'Ajuda');
    syncActiveLinks(document.querySelector('.kc-admin-nav'));
    syncActiveLinks(document.querySelector('.kc-mobile-nav'));
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
    ensureHelpRequestsLinks();
    syncHeaderState();
    observeHeaderAuth();
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(syncHeaderHeight, RESIZE_DEBOUNCE_MS);
    });
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

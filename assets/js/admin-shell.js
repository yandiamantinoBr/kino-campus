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

  function ensureNavLink(nav, href, iconClass, label, isActive) {
    if (!nav) return;
    var exists = Array.from(nav.querySelectorAll('a')).some(function (link) {
      var rawHref = String(link.getAttribute('href') || '').trim();
      return rawHref === href || rawHref === ('./' + href);
    });
    if (exists) {
      Array.from(nav.querySelectorAll('a')).forEach(function (link) {
        var rawHref = String(link.getAttribute('href') || '').trim();
        if (rawHref === href || rawHref === ('./' + href)) {
          link.classList.toggle('active', !!isActive);
        }
      });
      return;
    }

    var link = document.createElement('a');
    link.href = href;
    link.innerHTML = '<i class="' + iconClass + '"></i><span>' + label + '</span>';
    link.className = nav.classList.contains('kc-admin-nav') ? 'kc-admin-nav__link' : '';
    if (isActive) link.classList.add('active');
    nav.appendChild(link);
  }

  function ensureHelpRequestsLinks() {
    if (!document.body || !document.body.classList.contains('kc-admin-page')) return;
    var path = String(window.location.pathname || '').toLowerCase();
    var isHelpPage = path.indexOf('/admin/help-requests.html') >= 0;
    ensureNavLink(document.querySelector('.kc-admin-nav'), 'help-requests.html', 'fas fa-life-ring', 'Pedidos de ajuda', isHelpPage);
    ensureNavLink(document.querySelector('.kc-mobile-nav'), 'help-requests.html', 'fas fa-life-ring', 'Ajuda', isHelpPage);
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

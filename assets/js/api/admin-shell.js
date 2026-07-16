(function () {
  'use strict';

  var RESIZE_DEBOUNCE_MS = 150;
  var resizeTimer = null;
  var navRefreshTimer = null;

  function forceVisible(selector) {
    var node = document.querySelector(selector);
    if (!node) return;
    node.style.visibility = 'visible';
    node.style.opacity = '1';
    node.style.pointerEvents = 'auto';
  }

  function releaseBootState() {
    if (!document.documentElement) return;
    requestAnimationFrame(function () {
      document.documentElement.classList.remove('kc-loading');
      document.documentElement.classList.remove('kc-theme-preload');
    });
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

  function scheduleAdminNavRefresh(delay) {
    if (!document.body || !document.body.classList.contains('kc-admin-page')) return;
    window.clearTimeout(navRefreshTimer);
    navRefreshTimer = window.setTimeout(function () {
      applyAdminNavCollapse();
      syncHeaderHeight();
    }, typeof delay === 'number' ? delay : 40);
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
      var isActive = normalizeHref(targetPage) === currentPage;
      link.classList.toggle('active', isActive);
      if (isActive) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function scrollActiveMobileNav() {
    var nav = document.querySelector('.kc-mobile-nav');
    if (!nav) return;
    var active = nav.querySelector('a[aria-current="page"], a.active');
    if (!active) return;
    try {
      active.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
    } catch (_) {
      nav.scrollLeft = Math.max(0, active.offsetLeft - Math.max(0, (nav.clientWidth - active.offsetWidth) / 2));
    }
  }

  function ensureNavLink(nav, href, iconClass, label) {
    if (!nav) return;
    var exists = Array.from(nav.querySelectorAll('a')).some(function (link) {
      return normalizeHref(link.getAttribute('href')) === normalizeHref(href);
    });
    if (exists) {
      syncActiveLinks(nav);
      if (nav.classList.contains('kc-admin-nav')) scheduleAdminNavRefresh();
      return;
    }

    var link = document.createElement('a');
    link.href = href;
    link.innerHTML = '<i class="' + iconClass + '"></i><span>' + label + '</span>';
    link.className = nav.classList.contains('kc-admin-nav') ? 'kc-admin-nav__link' : '';
    nav.appendChild(link);
    syncActiveLinks(nav);
    if (nav.classList.contains('kc-admin-nav')) scheduleAdminNavRefresh();
  }

  function ensureHelpRequestsLinks() {
    if (!document.body || !document.body.classList.contains('kc-admin-page')) return;
    ensureNavLink(document.querySelector('.kc-admin-nav'), 'help-requests.html', 'fas fa-life-ring', 'Pedidos de ajuda');
    ensureNavLink(document.querySelector('.kc-mobile-nav'), 'help-requests.html', 'fas fa-life-ring', 'Ajuda');
    syncActiveLinks(document.querySelector('.kc-admin-nav'));
    syncActiveLinks(document.querySelector('.kc-mobile-nav'));
  }

  function createRailButton(direction) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kc-scroll-rail__btn kc-scroll-rail__btn--' + direction;
    btn.setAttribute(direction === 'prev' ? 'data-kc-rail-prev' : 'data-kc-rail-next', '');
    btn.setAttribute('aria-label', direction === 'prev' ? 'Rolar para o início' : 'Rolar para o fim');
    btn.hidden = true;
    btn.innerHTML = '<i class="fas fa-chevron-' + (direction === 'prev' ? 'left' : 'right') + '" aria-hidden="true"></i>';
    return btn;
  }

  function ensureAdminNavLabels(nav) {
    if (!nav) return;
    Array.from(nav.querySelectorAll('a')).forEach(function (link) {
      var span = link.querySelector('span');
      if (!span) {
        var textNodes = Array.from(link.childNodes).filter(function (node) {
          return node.nodeType === 3 && String(node.nodeValue || '').trim();
        });
        var labelText = textNodes.map(function (node) {
          return String(node.nodeValue || '').trim();
        }).join(' ').replace(/\s+/g, ' ').trim();
        if (labelText) {
          span = document.createElement('span');
          span.textContent = labelText;
          textNodes.forEach(function (node) { node.parentNode.removeChild(node); });
          link.appendChild(span);
        }
      }
      if (link.dataset.kcA11yEnhanced === '1') return;
      var text = span ? String(span.textContent || '').trim() : '';
      if (!text) return;
      if (!link.getAttribute('aria-label')) link.setAttribute('aria-label', text);
      if (!link.getAttribute('title')) link.setAttribute('title', text);
      link.dataset.kcA11yEnhanced = '1';
    });
  }

  function attachAdminNavRail(rail) {
    if (!rail || rail.__kcAdminRailAttached) return;
    var nav = rail.querySelector('.kc-admin-nav');
    if (!nav) return;
    var prev = rail.querySelector('[data-kc-rail-prev]');
    var next = rail.querySelector('[data-kc-rail-next]');
    if (!prev || !next) return;

    function update() {
      var max = nav.scrollWidth - nav.clientWidth;
      var hasOverflow = max > 4;
      var visibleLabels = Array.from(nav.querySelectorAll(':scope > a:not(.is-icon-only)')).length;
      if (hasOverflow && visibleLabels && !rail.__kcAdminCollapsing) {
        rail.__kcAdminCollapsing = true;
        try {
          applyAdminNavCollapse();
        } finally {
          rail.__kcAdminCollapsing = false;
        }
        return;
      }
      var atStart = nav.scrollLeft <= 4;
      var atEnd = nav.scrollLeft >= max - 4;
      rail.classList.toggle('is-overflow-start', hasOverflow && !atStart);
      rail.classList.toggle('is-overflow-end', hasOverflow && !atEnd);
      prev.hidden = !hasOverflow || atStart;
      next.hidden = !hasOverflow || atEnd;
    }

    function scrollByDirection(dir) {
      var amount = Math.max(160, Math.floor(nav.clientWidth * 0.7));
      try {
        nav.scrollBy({ left: dir * amount, behavior: 'smooth' });
      } catch (_) {
        nav.scrollLeft += dir * amount;
      }
    }

    prev.addEventListener('click', function () { scrollByDirection(-1); });
    next.addEventListener('click', function () { scrollByDirection(1); });
    nav.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', function () { scheduleAdminNavRefresh(80); }, { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(function () { scheduleAdminNavRefresh(60); });
      ro.observe(nav);
    }
    if (typeof MutationObserver !== 'undefined') {
      var mo = new MutationObserver(function () { scheduleAdminNavRefresh(30); });
      mo.observe(nav, { childList: true, subtree: false });
    }
    rail.__kcAdminRailAttached = true;
    rail.__kcAdminRailUpdate = update;
    requestAnimationFrame(update);
    setTimeout(function () { scheduleAdminNavRefresh(0); }, 120);
    setTimeout(function () { scheduleAdminNavRefresh(0); }, 400);
    setTimeout(function () { scheduleAdminNavRefresh(0); }, 900);
    setTimeout(function () { scheduleAdminNavRefresh(0); }, 1600);
  }

  function applyAdminNavCollapse() {
    var nav = document.querySelector('.kc-admin-nav');
    if (!nav) return;
    var links = Array.from(nav.querySelectorAll(':scope > a'));
    links.forEach(function (link) { link.classList.remove('is-icon-only'); });
    nav.scrollLeft = 0;
    if (window.innerWidth <= 768.98) return;
    var rail = nav.parentElement && nav.parentElement.matches('[data-kc-scroll-rail]') ? nav.parentElement : null;
    if (rail) {
      rail.classList.remove('is-overflow-start', 'is-overflow-end');
      Array.from(rail.querySelectorAll('.kc-scroll-rail__btn')).forEach(function (btn) { btn.hidden = true; });
    }
    for (var i = links.length - 1; i >= 0; i--) {
      if (nav.scrollWidth <= nav.clientWidth + 2) break;
      links[i].classList.add('is-icon-only');
      void nav.offsetWidth;
    }
    if (rail && typeof rail.__kcAdminRailUpdate === 'function') requestAnimationFrame(rail.__kcAdminRailUpdate);
  }

  function ensureAdminNavRail() {
    var nav = document.querySelector('.kc-admin-nav');
    if (!nav) return;
    ensureAdminNavLabels(nav);
    var rail = nav.parentElement && nav.parentElement.matches('[data-kc-scroll-rail]')
      ? nav.parentElement
      : null;
    if (!rail) {
      rail = document.createElement('div');
      rail.className = 'kc-scroll-rail kc-scroll-rail--admin';
      rail.setAttribute('data-kc-scroll-rail', '');
      var parent = nav.parentNode;
      parent.insertBefore(rail, nav);
      rail.appendChild(createRailButton('prev'));
      rail.appendChild(nav);
      rail.appendChild(createRailButton('next'));
    } else {
      rail.classList.add('kc-scroll-rail', 'kc-scroll-rail--admin');
    }
    attachAdminNavRail(rail);
    applyAdminNavCollapse();
    requestAnimationFrame(function () { scheduleAdminNavRefresh(0); });
    if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
      document.fonts.ready.then(function () {
        scheduleAdminNavRefresh(0);
      }).catch(function () { });
    }
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
      scheduleAdminNavRefresh();
    });
    observer.observe(actions, {
      childList: true,
      subtree: true,
      attributes: true
    });
  }

  function init() {
    if (!document.body || !document.body.classList.contains('kc-admin-page')) return;
    releaseBootState();
    ensureHelpRequestsLinks();
    ensureAdminNavRail();
    requestAnimationFrame(scrollActiveMobileNav);
    syncHeaderState();
    scheduleAdminNavRefresh(0);
    observeHeaderAuth();
    window.addEventListener('load', function () {
      scheduleAdminNavRefresh(0);
      scrollActiveMobileNav();
      setTimeout(function () { scheduleAdminNavRefresh(0); }, 350);
      setTimeout(function () { scheduleAdminNavRefresh(0); }, 1000);
    }, { once: true });
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        syncHeaderHeight();
        applyAdminNavCollapse();
      }, RESIZE_DEBOUNCE_MS);
    });
    window.addEventListener('orientationchange', scheduleAdminNavRefresh);
    document.addEventListener('kc:authchange', function () {
      requestAnimationFrame(function () {
        syncHeaderState();
        scheduleAdminNavRefresh();
      });
    });
    document.addEventListener('kc:profilechange', function () {
      requestAnimationFrame(function () {
        syncHeaderState();
        scheduleAdminNavRefresh();
      });
    });
  }

  window.KCAdminShell = Object.freeze({
    syncHeader: syncHeaderState,
    refreshNavRail: ensureAdminNavRail,
    scrollActiveMobileNav: scrollActiveMobileNav,
    setModalOpen: setModalOpen
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

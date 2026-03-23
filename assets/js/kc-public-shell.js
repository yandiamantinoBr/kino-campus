(function () {
  'use strict';

  let headerVisibilityFrame = 0;
  let initScheduled = false;

  const MODULE_LINKS = [
    { href: 'achados-perdidos.html', icon: 'fas fa-search', label: 'Achados/Perdidos' },
    { href: 'eventos.html', icon: 'fas fa-calendar', label: 'Eventos' },
    { href: 'moradia.html', icon: 'fas fa-home', label: 'Moradia' },
    { href: 'oportunidades.html', icon: 'fas fa-briefcase', label: 'Oportunidades' },
    { href: 'compra-venda-feed.html', icon: 'fas fa-shopping-bag', label: 'Compra e Venda' },
    { href: 'caronas-feed.html', icon: 'fas fa-car', label: 'Caronas' }
  ];
  const SHELL_SNAPSHOT_KEY = 'auth-shell';
  const SHELL_SNAPSHOT_MAX_AGE = 1000 * 60 * 60 * 12;

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function escapeHtml(value) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') {
      return window.KCUtils.escapeHtml(String(value == null ? '' : value));
    }
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getSessionStore() {
    return window.KCSessionStore && typeof window.KCSessionStore.get === 'function'
      ? window.KCSessionStore
      : null;
  }

  function readShellSnapshot() {
    const store = getSessionStore();
    if (!store) return null;
    const entry = store.get('shell', SHELL_SNAPSHOT_KEY, { maxAge: SHELL_SNAPSHOT_MAX_AGE });
    return entry && entry.value && typeof entry.value === 'object' ? entry.value : null;
  }

  function getSnapshotDisplay(snapshot) {
    const profile = snapshot && snapshot.profile ? snapshot.profile : null;
    const user = snapshot && snapshot.user ? snapshot.user : null;
    return String((profile && (profile.display_name || profile.full_name)) || (user && user.email ? String(user.email).split('@')[0] : '') || 'Minha conta').trim();
  }

  function getSnapshotAvatar() {
    return '';
  }

  function buildHeaderAvatarMarkup(avatarUrl, display) {
    if (avatarUrl) {
      return `<img class="kc-header-user__avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(display)}" loading="lazy" decoding="async" />`;
    }
    return '<span class="kc-header-user__avatar kc-header-user__avatar--placeholder" aria-hidden="true"><i class="fas fa-user"></i></span>';
  }

  function buildMobileAvatarMarkup(avatarUrl, display) {
    if (avatarUrl) {
      return `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(display)}" class="kc-mobile-menu-user-avatar" loading="lazy" />`;
    }
    return '<span class="kc-mobile-menu-user-avatar kc-mobile-menu-user-avatar--placeholder" aria-hidden="true"><i class="fas fa-user"></i></span>';
  }

  function buildMobileNav(activeKey) {
    const isEvents = activeKey === 'events';
    const isMarket = activeKey === 'market';
    return [
      '<nav class="kc-mobile-nav" aria-label="Navegação principal móvel">',
      `<a href="index.html"${activeKey === 'home' ? ' class="active"' : ''}><i class="fas fa-home"></i><span>Início</span></a>`,
      `<a href="eventos.html"${isEvents ? ' class="active"' : ''}><i class="fas fa-calendar"></i><span>Eventos</span></a>`,
      '<a class="kc-create-btn" href="create-post.html" aria-label="Criar publicação"><i class="fas fa-plus"></i></a>',
      `<a href="compra-venda-feed.html"${isMarket ? ' class="active"' : ''}><i class="fas fa-shopping-bag"></i><span class="kc-mobile-nav-label-long">Compra/Venda</span></a>`,
      '<button class="kc-menu-toggle" aria-label="Abrir menu" aria-expanded="false" aria-controls="mobileMenuDrawer" data-kc-mobile-menu="toggle"><i class="fas fa-bars"></i><span>Menu</span></button>',
      '</nav>'
    ].join('');
  }

  function buildDrawerHtml() {
    const links = MODULE_LINKS.map((item) => {
      return `<a href="${item.href}"><i class="${item.icon}"></i><span>${item.label}</span></a>`;
    }).join('');

    return [
      '<div class="kc-mobile-menu-drawer kc-mobile-menu" id="mobileMenuDrawer" aria-hidden="true">',
      '  <div class="kc-mobile-menu-header">',
      '    <h3>Menu</h3>',
      '    <button class="kc-close-menu" data-kc-mobile-menu="close" type="button" aria-label="Fechar menu"><i class="fas fa-times"></i></button>',
      '  </div>',
      '  <div class="kc-mobile-menu-content">',
      '    <div class="kc-mobile-menu-user-section" id="mobileMenuUserSection">',
      '      <a href="#login" id="mobileMenuUserLink" class="kc-mobile-menu-user-link" data-kc-login="true">',
      '        <span class="kc-mobile-menu-user-avatar-wrap"><span class="kc-mobile-menu-user-avatar kc-mobile-menu-user-avatar--placeholder" aria-hidden="true"><i class="fas fa-user"></i></span></span>',
      '        <span id="mobileMenuUserName" class="kc-mobile-menu-user-text"><span class="kc-mobile-menu-user-display">Login / Cadastro</span><span class="kc-mobile-menu-user-handle">@minha-conta</span></span>',
      '      </a>',
      '    </div>',
      '    <div id="mobileMenuAccountSection" class="kc-mobile-menu-account-section"></div>',
      links,
      '  </div>',
      '</div>',
      '<div class="kc-mobile-menu-overlay" id="mobileMenuOverlay" data-kc-mobile-menu="close" aria-hidden="true"></div>'
    ].join('');
  }

  function getMobileMenuElements() {
    const menu = document.getElementById('mobileMenuDrawer') || document.getElementById('mobileMenu');
    const overlay = document.getElementById('mobileMenuOverlay');
    return { menu, overlay };
  }

  function openMobileMenu() {
    const { menu, overlay } = getMobileMenuElements();
    if (!menu || !overlay) return;
    menu.classList.add('active');
    overlay.classList.add('active');
    menu.setAttribute('aria-hidden', 'false');
    overlay.setAttribute('aria-hidden', 'false');
    const toggle = document.querySelector('[data-kc-mobile-menu="toggle"]');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    if (window.KCOverlayLock && typeof window.KCOverlayLock.lock === 'function') {
      window.KCOverlayLock.lock('mobile-menu');
    }
  }

  function closeMobileMenu() {
    const { menu, overlay } = getMobileMenuElements();
    if (!menu || !overlay) return;
    menu.classList.remove('active');
    overlay.classList.remove('active');
    menu.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('aria-hidden', 'true');
    const toggle = document.querySelector('[data-kc-mobile-menu="toggle"]');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    if (window.KCOverlayLock && typeof window.KCOverlayLock.unlock === 'function') {
      window.KCOverlayLock.unlock('mobile-menu');
    }
  }

  function bindMobileMenu() {
    if (document.body.dataset.kcShellMenuBound === '1') return;
    document.body.dataset.kcShellMenuBound = '1';

    document.addEventListener('click', function (event) {
      const action = event.target && event.target.closest ? event.target.closest('[data-kc-mobile-menu]') : null;
      if (!action) return;
      const mode = String(action.getAttribute('data-kc-mobile-menu') || '').trim();
      if (!mode) return;
      event.preventDefault();
      if (mode === 'toggle') {
        const { menu } = getMobileMenuElements();
        if (menu && menu.classList.contains('active')) closeMobileMenu();
        else openMobileMenu();
        return;
      }
      closeMobileMenu();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeMobileMenu();
    });

    document.addEventListener('click', function (event) {
      const link = event.target && event.target.closest ? event.target.closest('.kc-mobile-menu-content a[href]:not([href="#login"])') : null;
      if (!link) return;
      closeMobileMenu();
    });
  }

  function injectShellIfNeeded() {
    const body = document.body;
    if (!body || !body.classList.contains('kc-shell-page')) return;
    if (body.dataset.kcShellInjected !== '1') {
      const activeKey = String(body.getAttribute('data-kc-mobile-active') || '').trim();
      if (!document.querySelector('.kc-mobile-nav')) {
        body.insertAdjacentHTML('beforeend', buildMobileNav(activeKey));
      }
      if (!document.getElementById('mobileMenuDrawer') && !document.getElementById('mobileMenu')) {
        body.insertAdjacentHTML('beforeend', buildDrawerHtml());
      }
      body.dataset.kcShellInjected = '1';
    }

    const header = document.querySelector('.kc-header');
    if (header) header.classList.add('kc-header--shell');
  }

  function hydrateAuthShellFromSnapshot() {
    const snapshot = readShellSnapshot();
    if (!snapshot || !snapshot.user || !snapshot.user.id) return;

    const display = getSnapshotDisplay(snapshot);
    const avatarUrl = getSnapshotAvatar(snapshot);
    const verified = snapshot.profile && snapshot.profile.verified === true;

    document.querySelectorAll('.kc-user-actions .btn-login:not([data-kc-shell-hydrated="1"])').forEach(function (button) {
      button.classList.add('is-auth');
      button.setAttribute('data-kc-shell-hydrated', '1');
      button.setAttribute('data-kc-login', 'true');
      button.setAttribute('href', '#login');
      button.innerHTML = `<span class="kc-header-user">${buildHeaderAvatarMarkup(avatarUrl, display)}<span class="kc-header-user__name">${escapeHtml(display)}</span>${verified ? '<i class="fas fa-check-circle kc-header-user__verified" aria-label="Verificado"></i>' : ''}<i class="fas fa-chevron-down kc-header-user__chevron" aria-hidden="true"></i></span>`;
    });

    const mobileUserLink = $('#mobileMenuUserLink');
    const mobileUserName = $('#mobileMenuUserName');
    const avatarWrap = mobileUserLink ? mobileUserLink.querySelector('.kc-mobile-menu-user-avatar-wrap') : null;
    if (avatarWrap) avatarWrap.innerHTML = buildMobileAvatarMarkup(avatarUrl, display);
    if (mobileUserName) {
      const handle = snapshot.user && snapshot.user.email ? `@${String(snapshot.user.email).split('@')[0]}` : '@minha-conta';
      mobileUserName.innerHTML = `<span class="kc-mobile-menu-user-display">${escapeHtml(display)}</span><span class="kc-mobile-menu-user-handle">${escapeHtml(handle)}</span>`;
    }
  }

  function forceHeaderVisibility() {
    ['.kc-user-actions', '.kc-header-user'].forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.style.visibility = 'visible';
        element.style.opacity = '1';
        element.style.pointerEvents = 'auto';
      });
    });
  }

  function syncHeaderHeight() {
    const header = document.querySelector('.kc-header') || document.querySelector('header');
    if (!header) return;
    const height = header.offsetHeight || 72;
    document.documentElement.style.setProperty('--kc-header-height', `${height}px`);
  }

  function scheduleHeaderVisibility() {
    if (headerVisibilityFrame) return;
    headerVisibilityFrame = window.requestAnimationFrame(function () {
      headerVisibilityFrame = 0;
      forceHeaderVisibility();
    });
  }

  function init() {
    if (document.documentElement.dataset.kcPublicShellReady === '1') return;
    document.documentElement.dataset.kcPublicShellReady = '1';
    injectShellIfNeeded();
    bindMobileMenu();
    hydrateAuthShellFromSnapshot();
    syncHeaderHeight();
    forceHeaderVisibility();
  }

  function scheduleInit() {
    if (document.documentElement.dataset.kcPublicShellReady === '1' || initScheduled) return;
    initScheduled = true;
    const run = function () {
      initScheduled = false;
      init();
    };
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(run);
      return;
    }
    window.setTimeout(run, 0);
  }

  window.openMobileMenu = openMobileMenu;
  window.closeMobileMenu = closeMobileMenu;

  document.addEventListener('kc:profilechange', scheduleHeaderVisibility);
  window.addEventListener('resize', syncHeaderHeight);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleInit, { once: true });
  } else {
    scheduleInit();
  }
}());

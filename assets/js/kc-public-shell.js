(function () {
  'use strict';

  const MODULE_LINKS = [
    { href: 'achados-perdidos.html', icon: 'fas fa-search', label: 'Achados/Perdidos' },
    { href: 'eventos.html', icon: 'fas fa-calendar', label: 'Eventos' },
    { href: 'moradia.html', icon: 'fas fa-home', label: 'Moradia' },
    { href: 'oportunidades.html', icon: 'fas fa-briefcase', label: 'Oportunidades' },
    { href: 'compra-venda-feed.html', icon: 'fas fa-shopping-bag', label: 'Compra e Venda' },
    { href: 'caronas-feed.html', icon: 'fas fa-car', label: 'Caronas' }
  ];

  function $(selector, root) {
    return (root || document).querySelector(selector);
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
      '        <span class="kc-mobile-menu-user-avatar-wrap"><i class="fas fa-user-circle" style="font-size:2rem;color:var(--kc-text-dark-secondary);"></i></span>',
      '        <span id="mobileMenuUserName">Login / Cadastro</span>',
      '      </a>',
      '    </div>',
      '    <hr data-kc-divider="top" class="kc-mobile-menu-divider" />',
      '    <div id="mobileMenuAccountSection" class="kc-mobile-menu-account-section"></div>',
      '    <hr id="mobileMenuAccountDivider" data-kc-divider="account" class="kc-mobile-menu-divider" />',
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

    const activeKey = String(body.getAttribute('data-kc-mobile-active') || '').trim();
    const main = document.querySelector('main.kc-main-content') || document.querySelector('main');
    if (!document.querySelector('.kc-mobile-nav')) {
      body.insertAdjacentHTML('beforeend', buildMobileNav(activeKey));
    }
    if (!document.getElementById('mobileMenuDrawer') && !document.getElementById('mobileMenu')) {
      body.insertAdjacentHTML('beforeend', buildDrawerHtml());
    }

    const header = document.querySelector('.kc-header');
    if (header) header.classList.add('kc-header--shell');
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

  function init() {
    injectShellIfNeeded();
    bindMobileMenu();
    forceHeaderVisibility();
  }

  if (typeof window.openMobileMenu !== 'function') window.openMobileMenu = openMobileMenu;
  if (typeof window.closeMobileMenu !== 'function') window.closeMobileMenu = closeMobileMenu;

  document.addEventListener('kc:profilechange', forceHeaderVisibility);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}());

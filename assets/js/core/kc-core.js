// -----------------------------
// Mobile menu
// -----------------------------
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
  // Não usa KCOverlayLock: position:fixed no body quebra position:sticky
  // no kc-header e kc-feed-tabs — o overlay com touch-action:none já
  // impede scroll de fundo no iOS sem remover o sticky do header.
  document.documentElement.classList.add('kc-menu-open');

  menu.setAttribute('aria-hidden', 'false');
  overlay.setAttribute('aria-hidden', 'false');

  const toggleBtn = document.querySelector('[data-kc-mobile-menu="toggle"]');
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
}

function closeMobileMenu() {
  const { menu, overlay } = getMobileMenuElements();
  if (!menu || !overlay) return;

  menu.classList.remove('active');
  overlay.classList.remove('active');
  document.documentElement.classList.remove('kc-menu-open');

  menu.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('aria-hidden', 'true');

  const toggleBtn = document.querySelector('[data-kc-mobile-menu="toggle"]');
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
}

function toggleMobileMenu(event) {
  if (event) event.preventDefault();

  const { menu } = getMobileMenuElements();
  if (!menu) return;

  if (menu.classList.contains('active')) closeMobileMenu();
  else openMobileMenu();
}

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMobileMenu();
});


// -----------------------------
// Ripple effect (event delegation)
// -----------------------------
function installRippleStylesOnce() {
  if (document.getElementById('kc-ripple-style')) return;

  const style = document.createElement('style');
  style.id = 'kc-ripple-style';
  style.textContent = `
    button, .kc-action-button, .kc-btn-primary, .kc-btn-secondary {
      position: relative;
      overflow: hidden;
    }
    .kc-ripple {
      position: absolute;
      border-radius: 50%;
      background-color: rgba(255, 255, 255, 0.28);
      transform: scale(0);
      animation: kc-ripple-animation 0.55s ease-out;
      pointer-events: none;
    }
    @keyframes kc-ripple-animation {
      to { transform: scale(4); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

function createRipple(target, clientX, clientY) {
  const rect = target.getBoundingClientRect();
  const diameter = Math.max(rect.width, rect.height);
  const radius = diameter / 2;

  const ripple = document.createElement('span');
  ripple.className = 'kc-ripple';
  ripple.style.width = ripple.style.height = `${diameter}px`;
  ripple.style.left = `${clientX - rect.left - radius}px`;
  ripple.style.top = `${clientY - rect.top - radius}px`;

  const existing = target.querySelector('.kc-ripple');
  if (existing) existing.remove();
  target.appendChild(ripple);
}

// -----------------------------
// Smooth scroll for anchors
// -----------------------------
function initSmoothAnchors() {
  document.body.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;

    const href = a.getAttribute('href');
    if (!href || href === '#' || href === '#login' || href === '#menu' || href === '#add') return;

    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

// -----------------------------
// Mobile nav active state
// -----------------------------
function initMobileNavActive() {
  const currentPage = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const menuPages = new Set([
    'achados-perdidos.html',
    'caronas-feed.html',
    'moradia.html',
    'oportunidades.html',
    'ajuda.html',
    'search-results.html',
    '_product.html',
    'my-posts.html',
    'profile.html',
    'settings.html',
    'account-setup.html',
    'auth-callback.html',
    'ods.html'
  ]);

  function setLinkActive(link, isActive) {
    if (!link) return;
    link.classList.toggle('active', !!isActive);
    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  function resolveBottomNavKey(page) {
    if (page === 'index.html') return 'home';
    if (page === 'eventos.html') return 'events';
    if (page === 'compra-venda-feed.html') return 'market';
    if (page === 'create-post.html') return 'create';
    if (menuPages.has(page)) return 'menu';
    return '';
  }

  const bottomNavKey = resolveBottomNavKey(currentPage);

  document.querySelectorAll('.kc-nav-links a[href]').forEach((link) => {
    const href = (link.getAttribute('href') || '').split('?')[0].split('#')[0].toLowerCase();
    setLinkActive(link, !!href && href === currentPage);
  });

  document.querySelectorAll('.kc-mobile-menu-content a[href]:not([href="#login"])').forEach((link) => {
    const href = (link.getAttribute('href') || '').split('?')[0].split('#')[0].toLowerCase();
    setLinkActive(link, !!href && href === currentPage);
  });

  document.querySelectorAll('.kc-mobile-nav a[href]').forEach((link) => {
    const href = (link.getAttribute('href') || '').split('?')[0].split('#')[0].toLowerCase();
    const key = href === 'index.html'
      ? 'home'
      : href === 'eventos.html'
        ? 'events'
        : href === 'compra-venda-feed.html'
          ? 'market'
          : href === 'create-post.html'
            ? 'create'
            : '';
    setLinkActive(link, !!key && key === bottomNavKey);
  });

  document.querySelectorAll('.kc-mobile-nav [data-kc-mobile-menu="toggle"], .kc-mobile-nav .kc-menu-toggle').forEach((button) => {
    button.classList.toggle('active', bottomNavKey === 'menu');
  });

  document.querySelectorAll('.theme-toggle, [data-kc-theme-toggle], .kc-search-mobile-btn, .kc-search-bar button, [data-kc-mobile-menu], .kc-menu-toggle, .kc-close-menu').forEach((button) => {
    if (button && button.tagName === 'BUTTON' && !button.getAttribute('type')) {
      button.setAttribute('type', 'button');
    }
  });
}


// -----------------------------
// Responsive UX helpers (V5.5.1)
// -----------------------------
function kcUpdateHeaderHeightVar() {
  const header = document.querySelector("header") || document.querySelector(".kc-header");
  const h = header ? header.offsetHeight : 0;
  if (h) document.documentElement.style.setProperty("--kc-header-height", `${h}px`);
}

function kcEnableDragToScroll(el) {
  if (!el) return;

  // Drag-to-scroll sem quebrar clique em links
  // - Só captura o pointer quando o usuário realmente começa a arrastar
  // - Se for apenas um clique, o link funciona normalmente

  let isDown = false;
  let startX = 0;
  let startScrollLeft = 0;
  let pointerId = null;
  let dragging = false;

  const DRAG_THRESHOLD = 10;

  const start = (e) => {
    if (e.pointerType === 'touch') return;
    // Botão esquerdo apenas
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    isDown = true;
    dragging = false;
    pointerId = e.pointerId;
    startX = e.clientX;
    startScrollLeft = el.scrollLeft;

    // IMPORTANT: não seta pointer capture aqui (isso quebrava clique em <a>)
  };

  const move = (e) => {
    if (!isDown) return;

    const dx = e.clientX - startX;

    // Só considera arrasto quando passar do threshold
    if (!dragging && Math.abs(dx) > DRAG_THRESHOLD) {
      dragging = true;
      el.classList.add('is-dragging');
      document.documentElement.classList.add('kc-no-select');
      try { el.setPointerCapture(pointerId); } catch (_) { }
    }

    if (!dragging) return;
    el.scrollLeft = startScrollLeft - dx;
  };

  const end = () => {
    isDown = false;
    pointerId = null;

    // NÃO zera 'dragging' aqui, para o clickCapture conseguir bloquear navegação
    // (o click é disparado após pointerup)
    setTimeout(() => {
      if (dragging) {
        dragging = false;
        el.classList.remove('is-dragging');
        document.documentElement.classList.remove('kc-no-select');
      }
    }, 0);
  };

  // Evita navegação apenas quando foi arrasto
  const clickCapture = (e) => {
    if (!dragging) return;
    e.preventDefault();
    e.stopPropagation();
  };

  // Pointer events
  el.addEventListener('pointerdown', start, { passive: true });
  el.addEventListener('pointermove', move, { passive: true });
  el.addEventListener('pointerup', end, { passive: true });
  el.addEventListener('pointercancel', end, { passive: true });
  el.addEventListener('lostpointercapture', end, { passive: true });
  el.addEventListener('click', clickCapture, true);
}

function kcInitHorizontalDragAreas() {
  document.querySelectorAll(".kc-feed-tabs, .kc-ranking-users").forEach(kcEnableDragToScroll);
}

function kcInitHeroSwipe() {
  const carousel = document.querySelector(".kc-hero-carousel");
  if (!carousel) return;
  const isInteractiveTarget = (target) => !!(
    target && target.closest('a, button, input, textarea, select, label, .kc-dot, .kc-carousel-btn, [role="button"]')
  );

  let startX = 0;
  let startY = 0;
  let pointerId = null;
  let swipeStartedOnInteractive = false;
  let touchStartX = 0;
  let touchStartY = 0;
  const SWIPE_THRESHOLD = 45;
  const AXIS_LOCK_RATIO = 1.5; // horizontal deve ser 1.5x mais que vertical

  carousel.addEventListener("pointerdown", (e) => {
    if (e.pointerType === 'touch') {
      pointerId = null;
      return;
    }
    swipeStartedOnInteractive = isInteractiveTarget(e.target);
    if (swipeStartedOnInteractive) {
      pointerId = null;
      return;
    }
    // Permite iniciar swipe em qualquer área do carrossel,
    // incluindo nas proximidades dos botões prev/next.
    // A distinção tap vs. swipe é feita pelo threshold de movimento.
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    try { carousel.setPointerCapture(pointerId); } catch (_) { }
  }, { passive: true });

  carousel.addEventListener("pointerup", (e) => {
    if (swipeStartedOnInteractive) {
      swipeStartedOnInteractive = false;
      pointerId = null;
      return;
    }
    if (pointerId == null) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    pointerId = null;

    // Só troca slide se for gesto predominantemente horizontal
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * AXIS_LOCK_RATIO) {
      changeSlide(dx < 0 ? 1 : -1);
    }
  }, { passive: true });

  carousel.addEventListener("pointercancel", () => {
    pointerId = null;
    swipeStartedOnInteractive = false;
  }, { passive: true });

  carousel.addEventListener('touchstart', (e) => {
    swipeStartedOnInteractive = isInteractiveTarget(e.target);
    if (swipeStartedOnInteractive) {
      touchStartX = 0;
      touchStartY = 0;
      return;
    }
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    touchStartX = t.clientX;
    touchStartY = t.clientY;
  }, { passive: true });

  carousel.addEventListener('touchend', (e) => {
    if (swipeStartedOnInteractive) {
      swipeStartedOnInteractive = false;
      return;
    }
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * AXIS_LOCK_RATIO) {
      changeSlide(dx < 0 ? 1 : -1);
    }
  }, { passive: true });

  carousel.addEventListener('touchcancel', () => {
    swipeStartedOnInteractive = false;
    touchStartX = 0;
    touchStartY = 0;
  }, { passive: true });
}




// -----------------------------
// Image fallbacks (offline/local)
// - Quando as imagens remotas não carregam (ex.: abrindo via file:// sem internet),
//   o ALT pode estourar o layout. Aqui substituímos por um emoji consistente.
// -----------------------------
function kcInitImageFallbacks() {
  const map = {
    destaque: '🔥',
    livros: '📚',
    eletronicos: '💻',
    vestuario: '👕',
    moveis: '🛋️',
    caronas: '🚗',
    moradia: '🏠',
    eventos: '📅',
    oportunidades: '💼',
    achados: '🔎',
  };

  const applyFallback = (img) => {
    const wrapper = img.closest('.kc-card__image-wrapper');
    if (!wrapper) return;

    const card = img.closest('.kc-card');
    const cat = (card && card.dataset && card.dataset.category) ? String(card.dataset.category) : '';
    const emoji = map[cat] || '📌';

    img.style.display = 'none';
    wrapper.classList.add('kc-image-fallback');
    if (!wrapper.querySelector('.kc-card__emoji')) {
      const span = document.createElement('span');
      span.className = 'kc-card__emoji';
      span.textContent = emoji;
      wrapper.appendChild(span);
    }
  };

  document.querySelectorAll('.kc-card__image-wrapper img').forEach((img) => {
    // Se já existe emoji no wrapper, não mexe
    const wrapper = img.closest('.kc-card__image-wrapper');
    if (wrapper && wrapper.querySelector('.kc-card__emoji')) return;

    // erro de rede
    img.addEventListener('error', () => applyFallback(img), { once: true });

    // já está "quebrada" no load
    if (img.complete && img.naturalWidth === 0) {
      applyFallback(img);
    }
  });
}

// -----------------------------
// Mobile card micro-polish (V5.5.2)
// - Encurta label de comentários ("23 comentários" -> "23")
// - Encurta CTA do card ("Ver Detalhes" -> "Ver mais")
// -----------------------------
function kcIsMobileViewport() {
  return window.matchMedia && window.matchMedia("(max-width: 576px)").matches;
}

function kcPolishCardsForMobile() {
  const isMobile = kcIsMobileViewport();

  // Comentários: mantém o original para voltar no desktop
  document.querySelectorAll('.kc-comment-link span').forEach((span) => {
    const original = span.getAttribute('data-kc-original') ?? span.textContent;
    if (!span.hasAttribute('data-kc-original')) span.setAttribute('data-kc-original', original);

    if (isMobile) {
      const m = String(original).match(/\d+/);
      if (m) span.textContent = m[0];
      const link = span.closest('a');
      if (link) link.setAttribute('aria-label', original.trim());
    } else {
      span.textContent = original;
    }
  });

  // Botão do card: menor no mobile (sem quebrar layout)
  document.querySelectorAll('.kc-card__footer .kc-action-button').forEach((btn) => {
    const original = btn.getAttribute('data-kc-original') ?? btn.textContent;
    if (!btn.hasAttribute('data-kc-original')) btn.setAttribute('data-kc-original', original);

    if (isMobile) {
      // V8.1.3.1.4: CTA unificado para evitar quebra/sobreposição no mobile
      btn.textContent = 'Ver Mais';
    } else {
      btn.textContent = original;
    }
  });
}

// -----------------------------
// Responsive CSS vars (extracted from V5.5.6 IIFE)
// -----------------------------
function _kcClamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function kcApplyResponsiveVars() {
  const vw = (document.documentElement && document.documentElement.clientWidth)
    ? document.documentElement.clientWidth : (window.innerWidth || 0);
  const w = _kcClamp(vw || 0, 240, 820);

  const gutter = Math.round(_kcClamp(w * 0.035, 10, 16));
  document.documentElement.style.setProperty('--kc-page-gutter', `${gutter}px`);

  const media = Math.round(_kcClamp(w * 0.21, 62, 92));
  document.documentElement.style.setProperty('--kc-card-media', `${media}px`);

  if (w <= 320) {
    document.documentElement.style.setProperty('--kc-chip-pad-x', '12px');
    document.documentElement.style.setProperty('--kc-chip-pad-y', '8px');
  } else {
    document.documentElement.style.removeProperty('--kc-chip-pad-x');
    document.documentElement.style.removeProperty('--kc-chip-pad-y');
  }
}

function kcDebounce(fn, wait = 120) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// -----------------------------
document.addEventListener('DOMContentLoaded', () => {
  // Anti-FOUC: remove loading class after first paint
  requestAnimationFrame(() => {
    document.documentElement.classList.remove('kc-loading');
  });
  if (typeof window.applySavedTheme === 'function') window.applySavedTheme();
  initMobileNavActive();
  initSmoothAnchors();
  installRippleStylesOnce();
  // Layout helpers (sticky tabs, drag-scroll)
  kcUpdateHeaderHeightVar();
  kcApplyResponsiveVars();
  kcInitHorizontalDragAreas();
  kcInitHeroSwipe();
  kcPolishCardsForMobile();
  if (window.KCCore && typeof window.KCCore.initWhatsAppShare === 'function') window.KCCore.initWhatsAppShare();
  kcInitImageFallbacks();

  const onResize = kcDebounce(() => {
    kcUpdateHeaderHeightVar();
    kcApplyResponsiveVars();
    kcPolishCardsForMobile();
    kcInitImageFallbacks();
  }, 140);
  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("orientationchange", onResize, { passive: true });


  // mobile menu data-* delegation
  document.body.addEventListener('click', (e) => {
    if (document.body && document.body.classList.contains('kc-shell-page')) return;
    const menuTrigger = e.target.closest('[data-kc-mobile-menu]');
    if (!menuTrigger) return;

    const action = String(menuTrigger.getAttribute('data-kc-mobile-menu') || '').trim().toLowerCase();
    if (action === 'open') {
      openMobileMenu();
      return;
    }
    if (action === 'toggle') {
      toggleMobileMenu(e);
      return;
    }
    if (action === 'close') {
      closeMobileMenu();
    }
  });

  // card vote data-* delegation
  document.body.addEventListener('click', (e) => {
    const voteTrigger = e.target.closest('[data-action], [data-kc-vote]');
    if (!voteTrigger) return;

    let voteType = '';
    const action = String(voteTrigger.getAttribute('data-action') || '').trim().toLowerCase();
    if (action === 'vote-hot') voteType = 'hot';
    if (action === 'vote-cold') voteType = 'cold';

    if (!voteType) {
      const legacyVote = String(voteTrigger.getAttribute('data-kc-vote') || '').trim().toLowerCase();
      if (legacyVote === 'hot' || legacyVote === 'cold') voteType = legacyVote;
    }

    if (!voteType) return;
    vote(voteTrigger, voteType);
  });

  // ripple delegation
  document.body.addEventListener('click', (e) => {
    const target = e.target.closest('button, .kc-action-button, .kc-btn-primary, .kc-btn-secondary');
    if (!target) return;
    // Ignore disabled
    if (target.hasAttribute('disabled')) return;
    const x = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
    const y = e.clientY || (e.touches && e.touches[0]?.clientY) || 0;
    createRipple(target, x, y);
  }, { passive: true });

  // carousel
  if (document.querySelector('.kc-hero-carousel')) {
    refreshHeroCarousel();
  }

  kcInitVotesRealtime();

  document.addEventListener('kc:authchange', () => {
    kcInitVotesRealtime();
  });

  // auto-inject local user posts
  if (window.kcUserPosts && typeof window.kcUserPosts.inject === 'function') window.kcUserPosts.inject();
});

/* =========================================================
   V5.5.4 - Mobile text truncation (Pelando-like density)
   - Reduz tamanho aparente das descrições no mobile para caber melhor no card
   - Mantém texto original em data-kc-fulltext
   ========================================================= */

(function () {
  function kcTruncateText(el, maxChars) {
    if (!el) return;
    const existing = el.getAttribute('data-kc-fulltext');
    const full = (existing != null ? existing : (el.textContent || '')).trim();
    if (existing == null) el.setAttribute('data-kc-fulltext', full);

    if (!maxChars || maxChars <= 0) {
      el.textContent = full;
      return;
    }

    if (full.length <= maxChars) {
      el.textContent = full;
      return;
    }

    const cut = Math.max(0, maxChars - 1);
    el.textContent = full.slice(0, cut).trimEnd() + '…';
  }

  function kcApplyMobileTextTruncation() {
    const isMobile = window.matchMedia('(max-width: 520px)').matches;

    document.querySelectorAll('.kc-card__title').forEach((el) => {
      // títulos longos ficam mais compactos
      kcTruncateText(el, isMobile ? 80 : null);
    });

    document.querySelectorAll('.kc-card__description-preview').forEach((el) => {
      kcTruncateText(el, isMobile ? 160 : null);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    kcApplyMobileTextTruncation();
    window.addEventListener('resize', kcDebounce(kcApplyMobileTextTruncation, 150));
  });
})();

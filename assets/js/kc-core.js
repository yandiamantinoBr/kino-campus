/* KinoCampus kc-core.js */

/**
 * KinoCampus - Core UI scripts (V8.1.2.4.5)
 *
 * Mantém apenas funcionalidades compartilhadas para evitar conflitos com scripts
 * específicos de páginas (ex.: filtros/feeds inline).
 *
 * NOTE (V7.1.2): renderização de cards centralizada em KCUtils.renderPostCard para preparar MVC.
 */


// -----------------------------
// Model layer (V8.1.2.4.5) - contrato único de Post
// -----------------------------
// Objetivo: garantir que todo post (de API/mock/localStorage) seja normalizado
// com os mesmos campos esperados pela View (KCUtils.renderPostCard).
//
// Exposição: window.KCPostModel.from(raw, { module })
//
// Obs.: não adiciona dependências e mantém compatibilidade com KCAPI.normalizePost.

window.KCPostModel = {
  from: function (raw, context) {
    const ctx = context || {};
    let post = raw || {};


    // --- Time/Badges helpers (V8.1.2.4.5) ---
    function _kcLooksISO(s) {
      return /^\d{4}-\d{2}-\d{2}T/.test(String(s || ''));
    }

    function _kcMonthIndex(name) {
      const n = String(name || '').toLowerCase();
      const map = {
        january: 0, janeiro: 0,
        february: 1, fevereiro: 1,
        march: 2, marco: 2, março: 2,
        april: 3, abril: 3,
        may: 4, maio: 4,
        june: 5, junho: 5,
        july: 6, julho: 6,
        august: 7, agosto: 7,
        september: 8, setembro: 8,
        october: 9, outubro: 9,
        november: 10, novembro: 10,
        december: 11, dezembro: 11,
      };
      return (map[n] != null) ? map[n] : 1;
    }

    function _kcGetNowFor(dateObj) {
      let now = new Date();
      try {
        const clamp = (KC_ENV && KC_ENV.clamp) ? KC_ENV.clamp : null;
        if (clamp && typeof clamp.year === 'number' && clamp.month) {
          const mi = _kcMonthIndex(clamp.month);
          if (dateObj && dateObj.getUTCFullYear && dateObj.getUTCFullYear() === clamp.year && dateObj.getUTCMonth() === mi) {
            // Base fixa para UX do protótipo (temporal clamp)
            now = new Date(Date.UTC(clamp.year, mi, 15, 14, 0, 0));
          }
        }
      } catch (_) { }
      return now;
    }



    // Normalização base (preferir KCAPI)
    if (KCAPI && typeof KCAPI.normalizePost === 'function') {
      post = KCAPI.normalizePost(post);
    } else {
      post = { ...(post || {}) };
    }

    // Garantias mínimas de contrato
    if (post.id == null && post._id != null) post.id = post._id;
    if (post.id == null) post.id = Date.now();

    // módulo
    if (!post.modulo && (post.module || ctx.module)) post.modulo = post.module || ctx.module;

    // authorId: manter string (quando existir)
    if (post.authorId != null) post.authorId = String(post.authorId);

    // Compatibilidade com dados legados
    if (!post._legacyAuthorName && (post.autor || post.author)) post._legacyAuthorName = post.autor || post.author;
    if (!post._legacyAuthorAvatar && (post.autorAvatar || post.authorAvatar)) post._legacyAuthorAvatar = post.autorAvatar || post.authorAvatar;



    // Link de módulo (breadcrumbs/UX do product)
    if (!post._kcModulePage) {
      const mk = String(post.modulo || '').toLowerCase();
      const map = {
        'compra-venda': 'compra-venda-feed.html',
        'livros': 'compra-venda-feed.html?filter=livros',
        'caronas': 'caronas-feed.html',
        'moradia': 'moradia.html',
        'eventos': 'eventos.html',
        'oportunidades': 'oportunidades.html',
        'achados-perdidos': 'achados-perdidos.html'
      };
      post._kcModulePage = map[mk] || 'index.html';
    }

    // V8.1.4.1: applyPresentationRules deve ser aplicado no ponto de renderização
    // (KCUtils.renderPostCard), evitando dupla aplicação entre Model e View.

    return post;
  }
};



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
// User posts (create-post -> localStorage)
// -----------------------------
const KC_USER_POSTS_KEY = 'kc_user_posts';

function kcLoadUserPosts() {
  try {
    const raw = localStorage.getItem(KC_USER_POSTS_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function kcSaveUserPosts(posts) {
  localStorage.setItem(KC_USER_POSTS_KEY, JSON.stringify(posts));
}

function kcCreateUserPost(data) {
  const posts = kcLoadUserPosts();
  const id = `u_${Date.now().toString(36)}`;

  // Modelo (MVC): persistimos no contrato V7.x, mas sem quebrar legado.
  // V8.1.2.4.5: temporal clamp (Fevereiro/2026) para consistência do protótipo
  function _kcMonthIndexLocal(name) {
    const n = String(name || "").toLowerCase();
    const map = {
      january: 0, janeiro: 0,
      february: 1, fevereiro: 1,
      march: 2, marco: 2, março: 2,
      april: 3, abril: 3,
      may: 4, maio: 4,
      june: 5, junho: 5,
      july: 6, julho: 6,
      august: 7, agosto: 7,
      september: 8, setembro: 8,
      october: 9, outubro: 9,
      november: 10, novembro: 10,
      december: 11, dezembro: 11,
    };
    return (map[n] != null) ? map[n] : 1;
  }

  function _kcClampCreatedAtISO() {
    try {
      const clamp = (KC_ENV && KC_ENV.clamp) ? KC_ENV.clamp : null;
      if (clamp && typeof clamp.year === "number" && clamp.month) {
        const mi = _kcMonthIndexLocal(clamp.month);
        const base = Date.UTC(clamp.year, mi, 15, 14, 0, 0);
        const jitter = (Date.now() % 60000);
        return new Date(base - jitter).toISOString();
      }
    } catch (_) { }
    return new Date().toISOString();
  }

  const createdAt = _kcClampCreatedAtISO();
  const raw = {
    id,
    createdAt,
    timestamp: (data && (data.timestamp || data.createdAt)) ? (data.timestamp || data.createdAt) : 'Agora',
    authorId: (data && data.authorId) ? data.authorId : 'USER_SELF',
    // Legado: manter campos "autor" para compatibilidade com páginas antigas.
    autor: (data && (data.autor || data.author)) ? (data.autor || data.author) : 'Você',
    autorAvatar: (data && (data.autorAvatar || data.authorAvatar))
      ? (data.autorAvatar || data.authorAvatar)
      : (() => {
        try {
          if (KCAPI && typeof KCAPI.getAuthorById === 'function') {
            const u = KCAPI.getAuthorById('USER_SELF');
            return (u && (u.avatarUrl || u.avatar)) ? (u.avatarUrl || u.avatar) : '';
          }
        } catch (_) { }
        return '';
      })(),
    ...(data || {}),
  };

  // V8.1.2.4.5: normaliza chaves de categoria/subcategoria para filtros (tabs/checkboxes)
  try {
    const mk = String(raw.modulo || raw.module || '').toLowerCase();
    const meta = (raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)) ? raw.metadata : {};
    raw.metadata = meta;

    if (!raw.categoriaKey && raw.categoryKey) raw.categoriaKey = raw.categoryKey;
    if (!raw.categoryKey && raw.categoriaKey) raw.categoryKey = raw.categoriaKey;
    if (!raw.categoriaKey && meta.categoryKey) raw.categoriaKey = meta.categoryKey;
    if (!meta.categoryKey && raw.categoriaKey) meta.categoryKey = raw.categoriaKey;

    if (!raw.subcategoriaKey && raw.subcategoryKey) raw.subcategoriaKey = raw.subcategoryKey;
    if (!raw.subcategoryKey && raw.subcategoriaKey) raw.subcategoryKey = raw.subcategoriaKey;
    if (!raw.subcategoriaKey && meta.subcategoryKey) raw.subcategoriaKey = meta.subcategoryKey;

    const desiredSub = String(raw.subcategoriaKey || raw.subcategoryKey || meta.subcategory || '').trim();
    if (!meta.subcategory && desiredSub) meta.subcategory = desiredSub;
    if (!meta.subcategoryKey && desiredSub) meta.subcategoryKey = desiredSub;

    // Compra e Venda: tabs são por categoria (ex.: eletronicos), não pela ação (vendo/compro)
    if (mk === 'compra-venda') {
      const actionish = ['vendo', 'compro', 'troco', 'doacao', 'doação', 'procuro'];
      const subk = String(raw.subcategoriaKey || '').toLowerCase();
      if (raw.categoriaKey && actionish.includes(subk)) {
        raw.subcategoriaKey = raw.categoriaKey;
        raw.subcategoryKey = raw.categoriaKey;
        meta.subcategory = raw.categoriaKey;
        meta.subcategoryKey = raw.categoriaKey;
      }
      if (raw.categoriaKey && !meta.subcategory) {
        meta.subcategory = raw.categoriaKey;
        meta.subcategoryKey = raw.categoriaKey;
      }
    }
  } catch (_) { }

  const normalized = (KCAPI && typeof KCAPI.normalizePost === 'function')
    ? KCAPI.normalizePost(raw)
    : raw;

  // Mantém createdAt para ordenação local futura (não interfere no card).
  const post = { ...normalized, createdAt };

  posts.unshift(post);
  kcSaveUserPosts(posts);

  // V7.1.2: pronto para backend (sem quebrar o modo estático)
  // Se existir KCAPI configurado, espelha o post no servidor.
  try {
    if (KCAPI && typeof KCAPI.isBackendEnabled === 'function' && KCAPI.isBackendEnabled()) {
      const apiCreateFn = (window.KCActions && typeof window.KCActions.createPost === 'function') ? window.KCActions.createPost : KCAPI.createPost;
      if (typeof apiCreateFn === 'function') apiCreateFn(post);
    }
  } catch (_) { }

  return post;
}

function kcGetUserPostById(id) {
  const posts = kcLoadUserPosts();
  return posts.find(p => String(p.id) === String(id)) || null;
}

function kcGetModuloFilterForPage() {
  const page = (window.location.pathname.split('/').pop() || '').toLowerCase();
  if (page.includes('caronas')) return 'caronas';
  if (page.includes('achados-perdidos')) return 'achados-perdidos';
  if (page.includes('eventos')) return 'eventos';
  if (page.includes('moradia')) return 'moradia';
  if (page.includes('oportunidades')) return 'oportunidades';
  if (page.includes('compra-venda')) return 'compra-venda';
  // index / search / product: sem filtro
  return null;
}

function kcModuleLabel(modulo) {
  const m = String(modulo || '').toLowerCase();
  const map = {
    'compra-venda': 'Compra e Venda',
    'caronas': 'Caronas',
    'moradia': 'Moradia',
    'eventos': 'Eventos na UFG',
    'oportunidades': 'Oportunidades',
    'achados-perdidos': 'Achados/Perdidos',
    'livros': 'Livros'
  };
  return map[m] || (modulo || 'Publicação');
}

function kcModulePage(modulo) {
  const m = String(modulo || '').toLowerCase();
  const map = {
    'compra-venda': 'compra-venda-feed.html',
    'livros': 'compra-venda-feed.html?filter=livros',
    'caronas': 'caronas-feed.html',
    'oportunidades': 'oportunidades.html',
    'achados-perdidos': 'achados-perdidos.html',
    'eventos': 'eventos.html',
    'moradia': 'moradia.html'
  };
  return map[m] || 'index.html';
}

// Minimal card injection (works on pages with .kc-feed-list)
// NOTE (V7.1.2): A View (HTML do card) fica centralizada em KCUtils.renderPostCard.
function kcInjectUserPostsIntoFeed() {
  const feed = document.querySelector('.kc-feed-list');
  if (!feed) return;

  // Evita duplicação se já tiver sido injetado.
  if (feed.querySelector('[data-kc-user-post="true"]')) return;

  const filterModulo = kcGetModuloFilterForPage();
  const userPosts = kcLoadUserPosts()
    .filter(p => !filterModulo || String(p.modulo) === String(filterModulo))
    .slice(0, 20);

  if (!userPosts.length) return;
  if (!KCUtils || typeof KCUtils.renderPostCard !== 'function') return;

  const normalized = userPosts.map((p) => {
    const np = (KCAPI && typeof KCAPI.normalizePost === 'function')
      ? KCAPI.normalizePost(p)
      : (p || {});
    // Marca como post do usuário para evitar duplicação (e permitir estilo futuro).
    np._kcUserPost = true;
    if (!np.timestamp) np.timestamp = 'Agora';
    return np;
  });

  try {
    const html = normalized.map(KCUtils.renderPostCard).join('\n');
    feed.insertAdjacentHTML('afterbegin', html);
  } catch (e) {
    console.warn('[KinoCampus] Falha ao injetar posts do usuário no feed.', e);
  }
}

// Expose small API
window.kcUserPosts = {
  create: kcCreateUserPost,
  getById: kcGetUserPostById,
  list: kcLoadUserPosts,
};


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
// WhatsApp Share (V8.1.2.4.8)
// - Adiciona botão de compartilhamento em TODOS os kc-card
// - Abre WhatsApp (app/web) com: "Título\nURL"
// -----------------------------
function kcNormalizeShareUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw, window.location.href).href;
  } catch (_) {
    return raw;
  }
}

function kcResolveCardShareData(card) {
  const data = { url: '', title: '' };
  if (!card) return data;

  const titleEl = card.querySelector('.kc-card__title');
  data.title = (titleEl && titleEl.textContent) ? titleEl.textContent.trim() : '';

  const linkEl = card.querySelector('.kc-action-button') || titleEl;
  const href = (linkEl && linkEl.getAttribute) ? (linkEl.getAttribute('href') || '') : '';
  data.url = kcNormalizeShareUrl(href);

  return data;
}

function kcCreateWhatsAppShareButton(card) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'kc-share-whatsapp';
  btn.setAttribute('aria-label', 'Compartilhar no WhatsApp');

  const data = kcResolveCardShareData(card);
  if (data.url) btn.dataset.shareUrl = data.url;
  if (data.title) btn.dataset.shareTitle = data.title;

  btn.innerHTML = '<svg viewBox="0 0 448 512" aria-hidden="true" focusable="false"><path fill="currentColor" d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/></svg>';
  return btn;
}



// Garante que o footer tenha exatamente 2 blocos principais:
// - .kc-card__interactions (esquerda)
// - .kc-card__actions (direita) -> share + CTA
// Isso evita o botão do WhatsApp ficar centralizado no desktop (space-between com 3 filhos)
// e evita bugs no mobile (footer em grid 1fr/auto).
function kcEnsureCardActionsWrapper(card) {
  if (!card) return null;
  const footer = card.querySelector('.kc-card__footer');
  if (!footer) return null;

  let actions = footer.querySelector('.kc-card__actions');
  const interactions = footer.querySelector('.kc-card__interactions');

  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'kc-card__actions';

    if (interactions && interactions.parentNode === footer) {
      // Inserir após interações
      if (interactions.nextSibling) footer.insertBefore(actions, interactions.nextSibling);
      else footer.appendChild(actions);
    } else {
      footer.appendChild(actions);
    }
  }

  // Move CTA para dentro do wrapper (quando ainda estiver como filho direto do footer)
  const cta = footer.querySelector('.kc-action-button');
  if (cta && cta.parentNode !== actions) {
    actions.appendChild(cta);
  }

  // Se já existir share em lugar errado, mover para dentro do wrapper
  const existingShare = footer.querySelector('.kc-share-whatsapp');
  if (existingShare && existingShare.parentNode !== actions) {
    actions.insertBefore(existingShare, actions.firstChild);
  }

  return actions;
}
function kcInjectWhatsAppShareButtonsIntoCards(root) {
  const scope = root || document;
  scope.querySelectorAll('.kc-card').forEach((card) => {
    const footer = card.querySelector('.kc-card__footer');
    if (!footer) return;

    const actions = kcEnsureCardActionsWrapper(card);
    if (!actions) return;

    // Se já existe no wrapper (ou foi movido para lá), não duplicar
    if (actions.querySelector('.kc-share-whatsapp')) return;

    const btn = kcCreateWhatsAppShareButton(card);
    const action = actions.querySelector('.kc-action-button');

    if (action) actions.insertBefore(btn, action);
    else actions.appendChild(btn);
  });
}

function kcOpenWhatsAppShare(url, title) {
  const u = kcNormalizeShareUrl(url);
  const t = String(title || '').trim();
  if (!u) return;

  const text = (t ? (t + '\n') : '') + u;
  const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(wa, '_blank', 'noopener,noreferrer');
}

function kcInitWhatsAppShare() {
  // 1) Inject nos cards estáticos (fallback)
  kcInjectWhatsAppShareButtonsIntoCards(document);

  // 2) Clique via delegation (funciona para cards dinâmicos)
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.kc-share-whatsapp');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const card = btn.closest('.kc-card');
    const fallback = kcResolveCardShareData(card);

    const url = btn.dataset.shareUrl || fallback.url;
    const title = btn.dataset.shareTitle || fallback.title;

    if (!url) return;
    kcOpenWhatsAppShare(url, title);
  });

  // 3) Observer: novos cards injetados pelos controllers (feeds)
  const schedule = kcDebounce(() => kcInjectWhatsAppShareButtonsIntoCards(document), 120);

  try {
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (!n || n.nodeType !== 1) continue;
          const el = /** @type {Element} */ (n);
          if (el.classList?.contains('kc-card') || el.querySelector?.('.kc-card')) {
            schedule();
            return;
          }
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  } catch (_) { }
}
// Init
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
  kcInitWhatsAppShare();
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
  kcInjectUserPostsIntoFeed();
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

// ─────────────────────────────────────────────────────────────────────────────
// KCCore.bindModuleSortTabs — tabs de ordenação (Destaques/Recentes/Comentados)
// para páginas de módulo (eventos, moradia, caronas, etc.).
//
// Uso:
//   window.KCCore.bindModuleSortTabs({ initFeedFn: function(sortBy) { ... } });
//
// O initFeedFn recebe 'votos' | 'recentes' | 'comentados' e deve chamar
// KCControllers.injectFeed com o sortBy correspondente.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  var SORT_MAP = { destaques: 'votos', recentes: 'recentes', comentados: 'comentados' };
  var VALID_TABS = new Set(Object.keys(SORT_MAP));

  function bindModuleSortTabs(opts) {
    if (!opts || typeof opts.initFeedFn !== 'function') return;

    var currentSortBy = 'votos';
    var initialized = false;

    function getSortButtons() {
      return Array.from(document.querySelectorAll('[data-feed-tab]'))
        .filter(function (btn) { return VALID_TABS.has(btn.dataset.feedTab); });
    }

    function setActiveTab(key) {
      getSortButtons().forEach(function (btn) {
        var active = btn.dataset.feedTab === key;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      var hash = key === 'destaques' ? '' : '#' + key;
      try { history.replaceState(null, '', hash || window.location.pathname + window.location.search); } catch (_) {}
    }

    function loadFeed(sortBy) {
      if (initialized) {
        var feedList = document.querySelector('.kc-feed-list');
        if (feedList) feedList.innerHTML = '';
      }
      opts.initFeedFn(sortBy);
      initialized = true;
    }

    // Lê hash para tab inicial
    var initHash = (window.location.hash || '').replace('#', '').toLowerCase();
    if (initHash && VALID_TABS.has(initHash)) {
      currentSortBy = SORT_MAP[initHash];
      setActiveTab(initHash);
    } else {
      setActiveTab('destaques');
    }

    // Carrega feed inicial
    loadFeed(currentSortBy);

    // Bind nos botões de tab
    getSortButtons().forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.dataset.feedTab;
        var sortBy = SORT_MAP[key];
        if (!sortBy || sortBy === currentSortBy) return;
        currentSortBy = sortBy;
        setActiveTab(key);
        loadFeed(sortBy);
      });
    });
  }

  window.KCCore = window.KCCore || {};
  window.KCCore.bindModuleSortTabs = bindModuleSortTabs;
})();


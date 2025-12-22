/* KinoCampus kc-core.js */

/**
 * KinoCampus - Core UI scripts (V7.1.2)
 *
 * Mantém apenas funcionalidades compartilhadas para evitar conflitos com scripts
 * específicos de páginas (ex.: filtros/feeds inline).
 *
 * NOTE (V7.1.2): renderização de cards centralizada em KCUtils.renderPostCard para preparar MVC.
 */

// -----------------------------
// Hero carousel (index)
// -----------------------------
let currentSlide = 0;
let autoSlideInterval = null;

function showSlide(index) {
  const slides = document.querySelectorAll('.kc-hero-banner');
  const dots = document.querySelectorAll('.kc-dot');
  if (!slides.length) return;

  // wrap
  if (index >= slides.length) currentSlide = 0;
  else if (index < 0) currentSlide = slides.length - 1;
  else currentSlide = index;

  slides.forEach(s => s.classList.remove('active'));
  dots.forEach(d => d.classList.remove('active'));

  slides[currentSlide].classList.add('active');
  if (dots[currentSlide]) dots[currentSlide].classList.add('active');
}

function changeSlide(direction) {
  showSlide(currentSlide + direction);
  resetAutoSlide();
}

function goToSlide(index) {
  showSlide(index);
  resetAutoSlide();
}

function startAutoSlide() {
  stopAutoSlide();
  autoSlideInterval = setInterval(() => showSlide(currentSlide + 1), 5000);
}

function stopAutoSlide() {
  if (autoSlideInterval) {
    clearInterval(autoSlideInterval);
    autoSlideInterval = null;
  }
}

function resetAutoSlide() {
  startAutoSlide();
}

// -----------------------------
// Vote box
// -----------------------------
function vote(button, type) {
  const voteBox = button.closest('.kc-vote-box');
  if (!voteBox) return;

  const scoreElement = voteBox.querySelector('span');
  if (!scoreElement) return;

  const currentScore = parseInt(scoreElement.textContent, 10) || 0;
  const isActive = button.classList.contains('active');

  // clear
  voteBox.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));

  let newScore = currentScore;
  if (!isActive) {
    button.classList.add('active');
    newScore = type === 'hot' ? currentScore + 1 : currentScore - 1;
  }

  scoreElement.textContent = String(newScore);

  // micro animation
  scoreElement.style.transform = 'scale(1.15)';
  setTimeout(() => {
    scoreElement.style.transform = 'scale(1)';
  }, 160);
}

// -----------------------------
// Product gallery helper
// -----------------------------
function changeMainImage(thumbnail) {
  const mainImage = document.getElementById('mainImage');
  if (!mainImage || !thumbnail) return;

  const fullSrc = thumbnail.getAttribute('data-full-src');
  mainImage.src = fullSrc || thumbnail.src;

  // Update active thumbnail
  document.querySelectorAll('.kc-thumbnail').forEach(thumb => {
    thumb.classList.remove('active');
  });
  thumbnail.classList.add('active');
}

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
  document.body.style.overflow = 'hidden';

  menu.setAttribute('aria-hidden', 'false');
  overlay.setAttribute('aria-hidden', 'false');
}

function closeMobileMenu() {
  const { menu, overlay } = getMobileMenuElements();
  if (!menu || !overlay) return;

  menu.classList.remove('active');
  overlay.classList.remove('active');
  document.body.style.overflow = '';

  menu.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('aria-hidden', 'true');
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
// Toast
// -----------------------------
function showToast(message, type = 'info', duration = 3000) {
  const existing = document.querySelector('.kc-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `kc-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

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
  const links = document.querySelectorAll('.kc-mobile-nav a');

  links.forEach(link => {
    const href = (link.getAttribute('href') || '').split('?')[0].split('#')[0].toLowerCase();
    if (!href) return;

    if (href === currentPage) link.classList.add('active');
    else link.classList.remove('active');
  });
}

// -----------------------------
// Comments (localStorage per post)
// -----------------------------
function getCurrentPostId() {
  // Prioridades: window.kcCurrentPostId > body[data-post-id] > null
  if (window.kcCurrentPostId != null) return String(window.kcCurrentPostId);
  const bodyId = document.body.getAttribute('data-post-id');
  return bodyId ? String(bodyId) : null;
}

function commentsStorageKey(postId) {
  return `kc_comments_${postId}`;
}

function loadComments(postId) {
  try {
    const raw = localStorage.getItem(commentsStorageKey(postId));
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveComments(postId, comments) {
  localStorage.setItem(commentsStorageKey(postId), JSON.stringify(comments));
}

function addComment(postId, commentText, authorName = 'Anônimo') {
  const id = String(postId);
  const comments = loadComments(id);

  const newComment = {
    id: (comments.reduce((max, c) => Math.max(max, Number(c.id) || 0), 0) + 1),
    author: authorName || 'Anônimo',
    text: commentText,
    timestamp: new Date().toLocaleString('pt-BR'),
    likes: 0,
  };

  comments.push(newComment);
  saveComments(id, comments);
  return newComment;
}

function likeComment(postId, commentId, containerId = 'commentsContainer') {
  const id = String(postId);
  const comments = loadComments(id);
  const comment = comments.find(c => String(c.id) === String(commentId));
  if (!comment) return;

  comment.likes = (comment.likes || 0) + 1;
  saveComments(id, comments);
  renderComments(id, containerId);
}

function renderComments(postId, containerId = 'commentsContainer') {
  const id = String(postId);
  const container = document.getElementById(containerId);
  if (!container) return;

  const comments = loadComments(id);
  if (comments.length === 0) {
    container.innerHTML = `
      <div style="padding: 20px; text-align: center; color: var(--kc-text-dark-secondary);">
        <i class="fas fa-comments" style="font-size: 2em; margin-bottom: 10px; opacity: 0.5;"></i>
        <p>Seja o primeiro a comentar!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = comments.map(c => `
    <div class="kc-comment" style="padding: 15px; border-bottom: 1px solid var(--kc-border-dark); margin-bottom: 10px;">
      <div style="display: flex; gap: 10px; margin-bottom: 10px;">
        <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(c.author)}" alt="${c.author}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background-color: var(--kc-surface-dark);">
        <div style="flex: 1;">
          <div style="font-weight: bold;">${c.author}</div>
          <div style="font-size: 0.85em; color: var(--kc-text-dark-secondary);">${c.timestamp}</div>
        </div>
      </div>
      <div style="margin-left: 50px; margin-bottom: 10px; white-space: pre-wrap;">${escapeHtml(c.text)}</div>
      <div style="margin-left: 50px; display: flex; gap: 15px; font-size: 0.9em;">
        <button onclick="likeComment('${id}', '${c.id}', '${containerId}')" style="background: none; border: none; cursor: pointer; color: var(--kc-text-dark-secondary);">
          <i class="fas fa-thumbs-up"></i> ${c.likes || 0}
        </button>
      </div>
    </div>
  `).join('');
}

function submitComment(postId = null, containerId = 'commentsContainer') {
  const resolved = postId != null ? String(postId) : getCurrentPostId();
  if (!resolved) {
    showToast('Não foi possível identificar esta publicação', 'error');
    return;
  }

  const id = String(resolved);
  const textarea = document.querySelector(`textarea[data-post-id="${cssEscape(id)}"]`);
  if (!textarea || !textarea.value.trim()) {
    showToast('Por favor, escreva um comentário', 'error');
    return;
  }

  const authorInput = document.querySelector(`input[data-post-id="${cssEscape(id)}"][name="author"]`);
  const authorName = authorInput?.value?.trim() || 'Anônimo';

  addComment(id, textarea.value.trim(), authorName);
  textarea.value = '';
  renderComments(id, containerId);
  showToast('Comentário enviado!', 'info', 1800);
}

// Toolbar formatting (Markdown-like)
function formatText(format, postId = null) {
  const id = postId != null ? String(postId) : getCurrentPostId();
  if (!id) return;

  const textarea = document.querySelector(`textarea[data-post-id="${cssEscape(id)}"]`);
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = textarea.value.substring(start, end);
  if (!selectedText) {
    showToast('Selecione um texto para formatar', 'error');
    return;
  }

  let wrapperStart = '';
  let wrapperEnd = '';

  switch (format) {
    case 'bold':
      wrapperStart = '**';
      wrapperEnd = '**';
      break;
    case 'italic':
      wrapperStart = '*';
      wrapperEnd = '*';
      break;
    case 'underline':
      wrapperStart = '__';
      wrapperEnd = '__';
      break;
    case 'strikethrough':
      wrapperStart = '~~';
      wrapperEnd = '~~';
      break;
    default:
      return;
  }

  const formatted = `${wrapperStart}${selectedText}${wrapperEnd}`;
  textarea.value = textarea.value.substring(0, start) + formatted + textarea.value.substring(end);
  textarea.focus();
  textarea.selectionStart = start + formatted.length;
  textarea.selectionEnd = start + formatted.length;
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
  const createdAt = new Date().toISOString();
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
            if (window.KCAPI && typeof window.KCAPI.getAuthorById === 'function') {
              const u = window.KCAPI.getAuthorById('USER_SELF');
              return (u && (u.avatarUrl || u.avatar)) ? (u.avatarUrl || u.avatar) : '';
            }
          } catch (_) {}
          return '';
        })(),
    ...(data || {}),
  };

  const normalized = (window.KCAPI && typeof window.KCAPI.normalizePost === 'function')
    ? window.KCAPI.normalizePost(raw)
    : raw;

  // Mantém createdAt para ordenação local futura (não interfere no card).
  const post = { ...normalized, createdAt };

  posts.unshift(post);
  kcSaveUserPosts(posts);

  // V7.1.2: pronto para backend (sem quebrar o modo estático)
  // Se existir KCAPI configurado, espelha o post no servidor.
  try {
    if (window.KCAPI && typeof window.KCAPI.isBackendEnabled === 'function' && window.KCAPI.isBackendEnabled()) {
      if (typeof window.KCAPI.createPost === 'function') window.KCAPI.createPost(post);
    }
  } catch (_) {}

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
  if (!window.KCUtils || typeof window.KCUtils.renderPostCard !== 'function') return;

  const normalized = userPosts.map((p) => {
    const np = (window.KCAPI && typeof window.KCAPI.normalizePost === 'function')
      ? window.KCAPI.normalizePost(p)
      : (p || {});
    // Marca como post do usuário para evitar duplicação (e permitir estilo futuro).
    np._kcUserPost = true;
    if (!np.timestamp) np.timestamp = 'Agora';
    return np;
  });

  try {
    const html = normalized.map(window.KCUtils.renderPostCard).join('\n');
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
// Create Post Modal (Design React + Form dinâmico por módulo)
// -----------------------------

const KC_CREATE_MODAL_ID = 'kcCreatePostModalOverlay';

// Definições por módulo (tags/subtópicos + campos)
const KC_CREATE_SCHEMA = {
  'compra-venda': {
    label: 'Compra e Venda',
    icon: 'fas fa-shopping-bag',
    emoji: '🛍️',
    categoryGroupId: 'categoria',
    redirect: 'compra-venda-feed.html',
    tagGroups: [
      {
        id: 'categoria',
        label: 'Categoria',
        required: true,
        multi: false,
        options: [
          { key: 'eletronicos', label: 'Eletrônicos' },
          { key: 'livros', label: 'Livros' },
          { key: 'moveis', label: 'Móveis' },
          { key: 'vestuario', label: 'Vestuário' },
          { key: 'outros', label: 'Outros' },
        ]
      },
      {
        id: 'acao',
        label: 'Você quer',
        required: true,
        multi: false,
        options: [
          { key: 'vendo', label: 'Vendo' },
          { key: 'compro', label: 'Compro' },
        ]
      }
    ]
  },
  'caronas': {
    label: 'Caronas',
    icon: 'fas fa-car',
    emoji: '🚗',
    categoryGroupId: 'tipo',
    redirect: 'caronas-feed.html',
    tagGroups: [
      {
        id: 'tipo',
        label: 'Tipo',
        required: true,
        multi: false,
        options: [
          { key: 'ofereco', label: 'Ofereço carona' },
          { key: 'procuro', label: 'Procuro carona' },
        ]
      },
      {
        id: 'regiao',
        label: 'Região',
        required: false,
        multi: false,
        options: [
          { key: 'campus', label: 'Campus' },
          { key: 'centro', label: 'Centro' },
          { key: 'bairros', label: 'Bairros' },
        ]
      }
    ]
  },
  'moradia': {
    label: 'Moradia Estudantil',
    icon: 'fas fa-home',
    emoji: '🏡',
    categoryGroupId: 'tipo',
    redirect: 'moradia.html',
    tagGroups: [
      {
        id: 'tipo',
        label: 'Tipo',
        required: true,
        multi: false,
        options: [
          { key: 'republicas', label: 'Repúblicas' },
          { key: 'quartos', label: 'Quartos' },
          { key: 'apartamentos', label: 'Apartamentos' },
          { key: 'procurando', label: 'Procurando' },
        ]
      }
    ]
  },
  'eventos': {
    label: 'Eventos na UFG',
    icon: 'fas fa-calendar',
    emoji: '📅',
    categoryGroupId: 'topico',
    redirect: 'eventos.html',
    tagGroups: [
      {
        id: 'topico',
        label: 'Subtópico',
        required: true,
        multi: false,
        options: [
          { key: 'sustentabilidade', label: 'Sustentabilidade' },
          { key: 'academicos', label: 'Acadêmicos' },
          { key: 'culturais', label: 'Culturais' },
          { key: 'esportivos', label: 'Esportivos' },
          { key: 'workshops', label: 'Workshops' },
        ]
      }
    ]
  },
  'achados-perdidos': {
    label: 'Achados e Perdidos',
    icon: 'fas fa-search',
    emoji: '🔎',
    categoryGroupId: 'status',
    redirect: 'achados-perdidos.html',
    tagGroups: [
      {
        id: 'status',
        label: 'Status',
        required: true,
        multi: false,
        options: [
          { key: 'perdidos', label: 'Perdidos' },
          { key: 'encontrados', label: 'Encontrados' },
        ]
      },
      {
        id: 'tipo',
        label: 'Tipo do item',
        required: true,
        multi: false,
        options: [
          { key: 'documentos', label: 'Documentos' },
          { key: 'eletronicos', label: 'Eletrônicos' },
          { key: 'outros', label: 'Outros' },
        ]
      }
    ]
  },
  'oportunidades': {
    label: 'Oportunidades',
    icon: 'fas fa-briefcase',
    emoji: '💼',
    categoryGroupId: 'tipo',
    redirect: 'oportunidades.html',
    tagGroups: [
      {
        id: 'tipo',
        label: 'Tipo',
        required: true,
        multi: false,
        options: [
          { key: 'estagios', label: 'Estágio' },
          { key: 'empregos', label: 'Emprego' },
          { key: 'freelancer', label: 'Freelancer' },
          { key: 'monitoria', label: 'Monitoria' },
          { key: 'voluntariado', label: 'Voluntariado' },
        ]
      }
    ]
  }
};

const kcCreateState = {
  open: false,
  moduleKey: null,
  selections: {}, // groupId -> key
  values: {},

  // Imagens (máx 5: 1 capa + 4)
  images: [], // [{ id, dataUrl, name, size }]
  coverImageId: null,
};

let kcLastFocus = null;

function kcParseBRLNumber(input) {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;
  // aceita "1.234,56" ou "1234.56"
  const cleaned = s.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function kcGetSchema(moduleKey) {
  return KC_CREATE_SCHEMA[String(moduleKey || '')] || null;
}

function kcEnsureCreateModal() {
  if (document.getElementById(KC_CREATE_MODAL_ID)) return;

  const overlay = document.createElement('div');
  overlay.id = KC_CREATE_MODAL_ID;
  overlay.className = 'kc-modal-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="kc-create-modal" role="dialog" aria-modal="true" aria-labelledby="kcCreateModalTitle">
      <div class="kc-create-modal__header">
        <h2 id="kcCreateModalTitle"><i class="fas fa-plus-circle"></i> Nova Publicação</h2>
        <button type="button" class="kc-create-modal__close" aria-label="Fechar"><i class="fas fa-times"></i></button>
      </div>
      <div class="kc-create-modal__body">
        <div class="kc-create-step">
          <label class="kc-create-label">O que você vai publicar?</label>
          <div class="kc-create-grid" id="kcCreateModuleGrid"></div>
        </div>

        <form id="kcCreatePostForm" class="kc-create-form" novalidate>
          <div id="kcCreateDynamic"></div>
          <button type="submit" class="kc-create-submit" disabled>Publicar Agora</button>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Click fora fecha
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) kcCloseCreatePostModal();
  });

  const closeBtn = overlay.querySelector('.kc-create-modal__close');
  if (closeBtn) closeBtn.addEventListener('click', kcCloseCreatePostModal);

  // Delegation: módulo / tags
  overlay.addEventListener('click', (e) => {
    const moduleBtn = e.target.closest('[data-kc-module]');
    if (moduleBtn) {
      kcCaptureCreateValues();
      kcCreateState.moduleKey = moduleBtn.getAttribute('data-kc-module');
      kcCreateState.selections = {};
      kcCreateState.values = {};
      kcCreateState.images = [];
      kcCreateState.coverImageId = null;
      kcRenderCreateModal();
      return;
    }

    const chip = e.target.closest('[data-kc-chip]');
    if (chip) {
      kcCaptureCreateValues();
      const groupId = chip.getAttribute('data-kc-group');
      const key = chip.getAttribute('data-kc-chip');
      kcCreateState.selections[groupId] = key;
      // auto-sugestão: Sustentabilidade -> marca "sustentável" por padrão
      if (groupId === 'topico' && key === 'sustentabilidade') kcCreateState.values.sustentavel = true;
      kcRenderCreateModal();
      return;
  }

  const imgActionBtn = e.target.closest('[data-kc-img-action]');
  if (imgActionBtn) {
    const action = imgActionBtn.getAttribute('data-kc-img-action');
    const id = imgActionBtn.getAttribute('data-kc-img-id');
    if (action === 'remove') kcRemoveCreateImageById(id);
    if (action === 'cover') kcSetCreateCoverImageById(id);
    return;
  }

  const openImagesBtn = e.target.closest('[data-kc-open-images]');
  if (openImagesBtn) {
    const input = overlay.querySelector('#kcImagesInput');
    if (input && !input.disabled) input.click();
    return;
  }
});

// Form: input binding
  const form = overlay.querySelector('#kcCreatePostForm');
  if (form) {
    form.addEventListener('input', () => kcCaptureCreateValues());
    form.addEventListener('change', () => kcCaptureCreateValues());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      kcHandleCreateSubmit();
    });
  }

// Imagens: input/drag&drop
overlay.addEventListener('change', async (e) => {
  const target = e.target;
  if (!target || target.id !== 'kcImagesInput') return;
  const files = target.files;
  if (files && files.length) await kcAddImagesFromFiles(files);
  // permite selecionar o mesmo arquivo novamente
  try { target.value = ''; } catch {}
});

overlay.addEventListener('dragover', (e) => {
  const dz = e.target && e.target.closest ? e.target.closest('.kc-img-dropzone') : null;
  if (!dz) return;
  e.preventDefault();
  dz.classList.add('is-dragover');
});

overlay.addEventListener('dragleave', (e) => {
  const dz = e.target && e.target.closest ? e.target.closest('.kc-img-dropzone') : null;
  if (!dz) return;
  dz.classList.remove('is-dragover');
});

overlay.addEventListener('drop', async (e) => {
  const dz = e.target && e.target.closest ? e.target.closest('.kc-img-dropzone') : null;
  if (!dz) return;
  e.preventDefault();
  dz.classList.remove('is-dragover');
  const files = e.dataTransfer ? e.dataTransfer.files : null;
  if (files && files.length) await kcAddImagesFromFiles(files);
});

// ESC fecha

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && kcCreateState.open) kcCloseCreatePostModal();
  });
}

function kcCaptureCreateValues() {
  const overlay = document.getElementById(KC_CREATE_MODAL_ID);
  if (!overlay) return;
  const form = overlay.querySelector('#kcCreatePostForm');
  if (!form) return;
  const fd = new FormData(form);
  const values = { ...kcCreateState.values };
  for (const [k, v] of fd.entries()) values[k] = v;
  form.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    const name = cb.getAttribute('name');
    if (!name) return;
    values[name] = cb.checked;
  });
  kcCreateState.values = values;
}

function kcTagLabel(schema, groupId, key) {
  const group = (schema && Array.isArray(schema.tagGroups)) ? schema.tagGroups.find(g => g.id === groupId) : null;
  const opt = group && Array.isArray(group.options) ? group.options.find(o => o.key === key) : null;
  return opt ? opt.label : '';
}

const KC_CREATE_MAX_IMAGES = 5;

function kcReadFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Falha ao ler imagem'));
      reader.readAsDataURL(file);
    } catch (err) {
      reject(err);
    }
  });
}

async function kcReadAndCompressImage(file, opts = {}) {
  const maxSide = (typeof opts.maxSide === 'number') ? opts.maxSide : 1200;
  const quality = (typeof opts.quality === 'number') ? opts.quality : 0.82;

  const original = await kcReadFileAsDataUrl(file);
  if (!original) return '';

  // Mantém GIF como está (para não quebrar animação)
  if (String(file.type || '').toLowerCase() === 'image/gif') return original;

  try {
    const img = await new Promise((resolve) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => resolve(null);
      i.src = original;
    });

    if (!img) return original;

    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if (!w || !h) return original;

    const scale = Math.min(1, maxSide / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return original;

    ctx.drawImage(img, 0, 0, outW, outH);

    // Converte para JPEG para reduzir tamanho
    const out = canvas.toDataURL('image/jpeg', quality);
    return out || original;
  } catch {
    return original;
  }
}

async function kcAddImagesFromFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  const remaining = KC_CREATE_MAX_IMAGES - kcCreateState.images.length;
  if (remaining <= 0) {
    showToast(`Máximo de ${KC_CREATE_MAX_IMAGES} imagens (1 capa + ${KC_CREATE_MAX_IMAGES - 1}).`, 'warn', 2600);
    return;
  }

  const candidates = files
    .filter(f => f && typeof f.type === 'string' && f.type.startsWith('image/'))
    .slice(0, remaining);

  if (!candidates.length) {
    showToast('Selecione arquivos de imagem (JPG/PNG/WebP).', 'warn', 2400);
    return;
  }

  for (const file of candidates) {
    // Proteção simples: evita localStorage enorme
    if (file.size > 8 * 1024 * 1024) {
      showToast('Imagem muito grande (máx ~8MB). Use uma menor.', 'warn', 2600);
      continue;
    }
    try {
      const dataUrl = await kcReadAndCompressImage(file);
      if (!dataUrl) continue;

      const id = `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      kcCreateState.images.push({ id, dataUrl, name: file.name || '', size: file.size || 0 });

      if (!kcCreateState.coverImageId) kcCreateState.coverImageId = id;
    } catch {
      showToast('Não consegui carregar uma das imagens.', 'warn', 2400);
    }
  }

  kcRenderCreateModal();
}

function kcRemoveCreateImageById(id) {
  const before = kcCreateState.images.length;
  kcCreateState.images = kcCreateState.images.filter(img => String(img.id) !== String(id));
  if (kcCreateState.images.length !== before) {
    if (kcCreateState.coverImageId && String(kcCreateState.coverImageId) === String(id)) {
      kcCreateState.coverImageId = kcCreateState.images.length ? kcCreateState.images[0].id : null;
    }
    kcRenderCreateModal();
  }
}

function kcSetCreateCoverImageById(id) {
  if (!id) return;
  const exists = kcCreateState.images.some(img => String(img.id) === String(id));
  if (!exists) return;
  kcCreateState.coverImageId = id;
  kcRenderCreateModal();
}

function kcGetOrderedCreateImages() {
  const imgs = Array.isArray(kcCreateState.images) ? kcCreateState.images : [];
  if (!imgs.length) return [];

  const coverId = kcCreateState.coverImageId;
  const cover = coverId ? imgs.find(i => String(i.id) === String(coverId)) : null;

  if (!cover) return imgs.map(i => i.dataUrl).filter(Boolean);

  const others = imgs.filter(i => String(i.id) !== String(coverId)).map(i => i.dataUrl).filter(Boolean);
  return [cover.dataUrl, ...others].filter(Boolean);
}

function kcCreateImagesSectionHtml() {
  const count = kcCreateState.images.length;
  const remaining = KC_CREATE_MAX_IMAGES - count;
  const disabled = remaining <= 0;

  const thumbs = kcCreateState.images.map((img) => {
    const isCover = kcCreateState.coverImageId && String(kcCreateState.coverImageId) === String(img.id);
    return `
      <div class="kc-img-thumb${isCover ? ' is-cover' : ''}">
        <img src="${escapeHtml(img.dataUrl)}" alt="Imagem da publicação" loading="lazy" />
        ${isCover ? `<div class="kc-img-badge"><i class="fas fa-star"></i> Capa</div>` : ''}
        <div class="kc-img-actions">
          <button type="button" class="kc-img-action" data-kc-img-action="cover" data-kc-img-id="${escapeHtml(img.id)}" title="Definir como capa">
            <i class="fas fa-star"></i>
          </button>
          <button type="button" class="kc-img-action" data-kc-img-action="remove" data-kc-img-id="${escapeHtml(img.id)}" title="Remover">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="kc-create-group kc-create-images">
      <div class="kc-create-group__head kc-create-group__head--row">
        <span>Imagens</span>
        <small>${count}/${KC_CREATE_MAX_IMAGES}</small>
      </div>

      <input id="kcImagesInput" type="file" accept="image/*" ${disabled ? 'disabled' : ''} multiple hidden />

      <button type="button" class="kc-img-dropzone" data-kc-open-images="true" ${disabled ? 'disabled' : ''}>
        <i class="fas fa-cloud-upload-alt"></i>
        <div>
          <div class="kc-img-dropzone__title">${disabled ? 'Limite de imagens atingido' : 'Clique para adicionar imagens'}</div>
          <div class="kc-img-dropzone__sub">Máximo ${KC_CREATE_MAX_IMAGES} imagens (1 capa + ${KC_CREATE_MAX_IMAGES - 1}).</div>
        </div>
      </button>

      ${count ? `<div class="kc-img-grid">${thumbs}</div>` : ''}
      <div class="kc-img-hint">Dica: clique na estrela para escolher a <strong>capa</strong>.</div>
    </div>
  `;
}

function kcCreateSustainSectionHtml() {
  const checked = (kcCreateState.values.sustentavel === true || kcCreateState.values.sustentavel === 'true') ? 'checked' : '';
  return `
    <label class="kc-check" for="kcField_sustentavel">
      <input id="kcField_sustentavel" name="sustentavel" type="checkbox" ${checked} />
      <span>Esta publicação contribui para a sustentabilidade</span>
    </label>
  `;
}

function kcBuildFieldsForModule(moduleKey, selections, values) {
  const fields = [];

  // comuns
  fields.push({ type: 'text', name: 'titulo', label: 'Título', placeholder: 'Ex: Livro de Cálculo Vol. 1', required: true });
  fields.push({ type: 'textarea', name: 'descricao', label: 'Descrição', placeholder: 'Descreva com detalhes…', required: true, rows: 4 });

  if (moduleKey === 'compra-venda') {
    const acao = selections.acao;
    fields.push({ type: 'text', name: 'localizacao', label: 'Localização', placeholder: 'Ex: Campus Samambaia', required: false });

    if (acao === 'vendo') {
      fields.push({ type: 'text', name: 'preco', label: 'Preço (R$)', placeholder: '0,00', required: true });
      fields.push({ type: 'select', name: 'condicao', label: 'Condição', required: true, options: ['Novo', 'Semi-novo', 'Usado'] });
    } else {
      fields.push({ type: 'text', name: 'preco', label: 'Orçamento (opcional)', placeholder: '0,00', required: false });
    }
  }

  if (moduleKey === 'caronas') {
    fields.push({ type: 'text', name: 'origem', label: 'Origem', placeholder: 'Ex: Campus Samambaia', required: true });
    fields.push({ type: 'text', name: 'destino', label: 'Destino', placeholder: 'Ex: Centro', required: true });
    fields.push({ type: 'text', name: 'horario', label: 'Horário', placeholder: 'Ex: 18h30', required: false });
    fields.push({ type: 'text', name: 'contribuicao', label: 'Contribuição (opcional)', placeholder: 'Ex: 5,00', required: false });
    if (selections.tipo === 'ofereco') {
      fields.push({ type: 'number', name: 'vagas', label: 'Vagas', placeholder: '2', required: false, min: 1, max: 8 });
    }
  }

  if (moduleKey === 'moradia') {
    const t = selections.tipo;
    if (t === 'procurando') {
      fields.push({ type: 'text', name: 'regiao', label: 'Região desejada', placeholder: 'Ex: Setor Universitário', required: true });
      fields.push({ type: 'text', name: 'orcamento', label: 'Orçamento máximo (opcional)', placeholder: 'Ex: 800,00', required: false });
    } else {
      fields.push({ type: 'text', name: 'localizacao', label: 'Localização', placeholder: 'Ex: Setor Universitário', required: true });
      fields.push({ type: 'text', name: 'preco', label: 'Valor mensal (R$)', placeholder: '0,00', required: true });
      fields.push({ type: 'text', name: 'detalhes', label: 'Detalhes (opcional)', placeholder: 'Ex: contas inclusas, mobília, vagas…', required: false });
    }
  }

  if (moduleKey === 'eventos') {
    fields.push({ type: 'text', name: 'localizacao', label: 'Local', placeholder: 'Ex: Centro de Eventos', required: true });
    fields.push({ type: 'date', name: 'data', label: 'Data (opcional)', required: false });
    fields.push({ type: 'time', name: 'hora', label: 'Horário (opcional)', required: false });
    fields.push({ type: 'url', name: 'link', label: 'Link/Inscrição (opcional)', placeholder: 'https://…', required: false });
    fields.push({ type: 'checkbox', name: 'gratuito', label: 'Evento gratuito', required: false });
    if (!values.gratuito) {
      fields.push({ type: 'text', name: 'preco', label: 'Valor (opcional)', placeholder: '0,00', required: false });
    }
  }

  if (moduleKey === 'achados-perdidos') {
    fields.push({ type: 'text', name: 'localizacao', label: 'Local (onde foi perdido/encontrado)', placeholder: 'Ex: Biblioteca Central', required: true });
    if (selections.status === 'perdidos') {
      fields.push({ type: 'text', name: 'recompensa', label: 'Recompensa (opcional)', placeholder: 'Ex: 20,00', required: false });
    } else {
      fields.push({ type: 'text', name: 'entrega', label: 'Onde retirar/entregar', placeholder: 'Ex: Portaria do Bloco B', required: true });
    }
  }

  if (moduleKey === 'oportunidades') {
    fields.push({ type: 'text', name: 'localizacao', label: 'Local/Modalidade', placeholder: 'Ex: Remoto / Híbrido', required: false });
    fields.push({ type: 'text', name: 'remuneracao', label: 'Remuneração (opcional)', placeholder: 'Ex: 1200,00', required: false });
    fields.push({ type: 'text', name: 'contato', label: 'Contato', placeholder: 'Ex: email@ufg.br', required: true });
  }

  return fields;
}

function kcRenderCreateModal() {
  const overlay = document.getElementById(KC_CREATE_MODAL_ID);
  if (!overlay) return;

  const grid = overlay.querySelector('#kcCreateModuleGrid');
  const dynamic = overlay.querySelector('#kcCreateDynamic');
  const submitBtn = overlay.querySelector('.kc-create-submit');

  // módulo grid
  if (grid) {
    grid.innerHTML = '';
    Object.keys(KC_CREATE_SCHEMA).forEach((key) => {
      const schema = KC_CREATE_SCHEMA[key];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kc-create-cat-btn' + (kcCreateState.moduleKey === key ? ' active' : '');
      btn.setAttribute('data-kc-module', key);
      btn.innerHTML = `
        <i class="${schema.icon}"></i>
        <span>${escapeHtml(schema.label.replace(' na UFG', ''))}</span>
      `;
      grid.appendChild(btn);
    });
  }

  const schema = kcGetSchema(kcCreateState.moduleKey);

  // Conteúdo dinâmico
  if (!schema) {
    if (dynamic) {
      dynamic.innerHTML = '<div class="kc-create-hint">Escolha um módulo acima para liberar o formulário.</div>';
    }
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  // Tag groups + fields
  const parts = [];

  // Tags/subtópicos
  if (schema.tagGroups && schema.tagGroups.length) {
    schema.tagGroups.forEach((g) => {
      const selectedKey = kcCreateState.selections[g.id] || '';
      parts.push(`<div class="kc-create-group"><div class="kc-create-group__head"><span>${escapeHtml(g.label)}${g.required ? ' *' : ''}</span></div><div class="kc-chip-row">`);
      g.options.forEach((opt) => {
        const active = selectedKey === opt.key ? ' active' : '';
        parts.push(`<button type="button" class="kc-chip${active}" data-kc-group="${escapeHtml(g.id)}" data-kc-chip="${escapeHtml(opt.key)}">${escapeHtml(opt.label)}</button>`);
      });
      parts.push('</div></div>');
    });
  }

  // Fields
  const fields = kcBuildFieldsForModule(kcCreateState.moduleKey, kcCreateState.selections, kcCreateState.values);
  parts.push('<div class="kc-create-fields">');
  fields.forEach((f) => {
    const val = kcCreateState.values[f.name];
    const required = f.required ? 'required' : '';
    const label = escapeHtml(f.label);
    const id = 'kcField_' + f.name;
    if (f.type === 'textarea') {
      parts.push(`
        <div class="kc-field">
          <label for="${id}">${label}${f.required ? ' *' : ''}</label>
          <textarea id="${id}" name="${escapeHtml(f.name)}" rows="${f.rows || 4}" placeholder="${escapeHtml(f.placeholder || '')}" ${required}>${escapeHtml(val || '')}</textarea>
        </div>
      `);
    } else if (f.type === 'select') {
      const opts = (f.options || []).map(o => {
        const isSel = String(val || '') === String(o);
        return `<option value="${escapeHtml(o)}" ${isSel ? 'selected' : ''}>${escapeHtml(o)}</option>`;
      }).join('');
      parts.push(`
        <div class="kc-field">
          <label for="${id}">${label}${f.required ? ' *' : ''}</label>
          <select id="${id}" name="${escapeHtml(f.name)}" ${required}>
            <option value="" ${!val ? 'selected' : ''} disabled>Selecione...</option>
            ${opts}
          </select>
        </div>
      `);
    } else if (f.type === 'checkbox') {
      const checked = val === true || val === 'true' ? 'checked' : '';
      parts.push(`
        <label class="kc-check" for="${id}">
          <input id="${id}" name="${escapeHtml(f.name)}" type="checkbox" ${checked} />
          <span>${label}</span>
        </label>
      `);
    } else {
      const type = escapeHtml(f.type);
      const placeholder = escapeHtml(f.placeholder || '');
      const valueAttr = (val != null && f.type !== 'file') ? `value="${escapeHtml(val)}"` : '';
      const min = (f.min != null) ? `min="${escapeHtml(f.min)}"` : '';
      const max = (f.max != null) ? `max="${escapeHtml(f.max)}"` : '';
      parts.push(`
        <div class="kc-field">
          <label for="${id}">${label}${f.required ? ' *' : ''}</label>
          <input id="${id}" name="${escapeHtml(f.name)}" type="${type}" placeholder="${placeholder}" ${valueAttr} ${required} ${min} ${max} />
        </div>
      `);
    }
  });
  parts.push('</div>');

  // Imagens (capa + até 4)
  parts.push(kcCreateImagesSectionHtml());
  // Sustentabilidade
  parts.push(kcCreateSustainSectionHtml());

  if (dynamic) dynamic.innerHTML = parts.join('');

  // habilitar submit quando tags obrigatórias selecionadas
  const missingTag = (schema.tagGroups || []).some(g => g.required && !kcCreateState.selections[g.id]);
  if (submitBtn) submitBtn.disabled = missingTag;
}

function kcOpenCreatePostModal(prefModuleKey) {
  kcEnsureCreateModal();
  kcLastFocus = document.activeElement;

  if (prefModuleKey && KC_CREATE_SCHEMA[prefModuleKey]) kcCreateState.moduleKey = prefModuleKey;

  kcCreateState.open = true;
  const overlay = document.getElementById(KC_CREATE_MODAL_ID);
  if (!overlay) return;

  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('kc-modal-open');

  kcRenderCreateModal();

  // foco no fechar
  const closeBtn = overlay.querySelector('.kc-create-modal__close');
  if (closeBtn) closeBtn.focus();
}

function kcCloseCreatePostModal() {
  const overlay = document.getElementById(KC_CREATE_MODAL_ID);
  if (!overlay) return;
  kcCreateState.open = false;
  overlay.classList.remove('active');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('kc-modal-open');

  if (kcLastFocus && typeof kcLastFocus.focus === 'function') {
    try { kcLastFocus.focus(); } catch {}
  }
}

function kcHandleCreateSubmit() {
  kcCaptureCreateValues();
  const schema = kcGetSchema(kcCreateState.moduleKey);
  if (!schema) {
    showToast('Selecione um módulo para publicar.', 'warn', 2200);
    return;
  }

  // valida tags obrigatórias
  const missing = (schema.tagGroups || []).filter(g => g.required && !kcCreateState.selections[g.id]);
  if (missing.length) {
    showToast('Selecione: ' + missing.map(m => m.label).join(', '), 'warn', 2600);
    return;
  }

  const title = String(kcCreateState.values.titulo || '').trim();
  const desc = String(kcCreateState.values.descricao || '').trim();
  if (!title || !desc) {
    showToast('Preencha título e descrição.', 'warn', 2400);
    return;
  }

  const categoryGroupId = schema.categoryGroupId;
  const catKey = categoryGroupId ? kcCreateState.selections[categoryGroupId] : '';
  const catLabel = catKey ? kcTagLabel(schema, categoryGroupId, catKey) : '';

  // subcategoria: tenta usar 2º grupo (quando existir)
  const otherGroups = (schema.tagGroups || []).filter(g => g.id !== categoryGroupId);
  const subKey = otherGroups.length ? kcCreateState.selections[otherGroups[0].id] : '';
  const subLabel = subKey ? kcTagLabel(schema, otherGroups[0].id, subKey) : '';

  const tagKeys = Object.values(kcCreateState.selections).filter(Boolean);
  const tagLabels = Object.entries(kcCreateState.selections)
    .map(([gid, key]) => (key ? kcTagLabel(schema, gid, key) : ''))
    .filter(Boolean);

  // preço (quando existe)
  let preco = null;
  let precoTexto = null;
  if (kcCreateState.moduleKey === 'eventos' && (kcCreateState.values.gratuito === true || kcCreateState.values.gratuito === 'true')) {
    preco = 0;
  } else {
    const n = kcParseBRLNumber(kcCreateState.values.preco);
    if (n != null) preco = n;
  }

  if (kcCreateState.moduleKey === 'achados-perdidos' && kcCreateState.selections.status === 'perdidos') {
    const r = String(kcCreateState.values.recompensa || '').trim();
    if (r) precoTexto = 'Recompensa: R$ ' + r;
  }

  const imagens = kcGetOrderedCreateImages();

  const post = kcCreateUserPost({
    modulo: kcCreateState.moduleKey,
    moduloLabel: schema.label,
    categoria: catLabel || '',
    categoriaKey: catKey || '',
    subcategoria: subLabel || '',
    subcategoriaKey: subKey || '',
    tags: tagLabels,
    tagKeys,
    titulo: title,
    descricao: desc,
    preco,
    precoTexto,
    condicao: kcCreateState.values.condicao ? String(kcCreateState.values.condicao) : '',
    localizacao: kcCreateState.values.localizacao ? String(kcCreateState.values.localizacao) : '',
    verificado: false,
    emoji: schema.emoji,
    imagens,
    sustentavel: !!kcCreateState.values.sustentavel,
  });

  showToast('Publicado com sucesso!', 'success', 2200);
  kcCloseCreatePostModal();

  // Redireciona para o módulo + hash do subtópico
  const base = schema.redirect || kcModulePage(kcCreateState.moduleKey);
  let targetUrl = base;
  if (kcCreateState.moduleKey === 'compra-venda' && catKey) {
    targetUrl += (targetUrl.includes('?') ? '&' : '?') + 'filter=' + encodeURIComponent(catKey);
  } else if (catKey) {
    targetUrl += '#' + encodeURIComponent(catKey);
  }
  window.location.href = targetUrl;
}

function kcInitCreatePostTriggers() {
  // Intercepta links e botões existentes
  document.body.addEventListener('click', (e) => {
    const trigger = e.target.closest('a[href="create-post.html"], .kc-create-btn, .kc-create-post-btn');
    if (!trigger) return;

    // Evita quebrar navegação quando estiver no create-post (abrirá modal)
    e.preventDefault();

    // tenta inferir módulo atual pela página
    const mod = kcGetModuloFilterForPage();
    kcOpenCreatePostModal(mod || null);
  });

  // Autopen: se a pessoa abrir create-post.html direto
  const page = (window.location.pathname.split('/').pop() || '').toLowerCase();
  if (page === 'create-post.html') {
    kcOpenCreatePostModal(kcGetModuloFilterForPage());
  }
}

// -----------------------------
// Helpers
// -----------------------------
function escapeHtml(str) {
  const s = String(str ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cssEscape(str) {
  // Minimal escape for attribute selectors
  return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function formatCurrencyBRL(value) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  } catch {
    return `R$ ${Number(value || 0).toFixed(2)}`;
  }
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
      try { el.setPointerCapture(pointerId); } catch (_) {}
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

  let startX = 0;
  let pointerId = null;

  carousel.addEventListener("pointerdown", (e) => {
    // não iniciar swipe quando interagindo com botões/links do banner
    if (e.target && e.target.closest && e.target.closest("a, button")) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    try { carousel.setPointerCapture(pointerId); } catch (_) {}
  }, { passive: true });

  carousel.addEventListener("pointerup", (e) => {
    if (pointerId == null) return;
    const dx = e.clientX - startX;
    // threshold
    if (Math.abs(dx) > 45) {
      changeSlide(dx < 0 ? 1 : -1);
    }
    pointerId = null;
  }, { passive: true });

  carousel.addEventListener("pointercancel", () => { pointerId = null; }, { passive: true });
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
      // Apenas CTAs genéricos dos cards
      const lower = String(original).toLowerCase();
      if (lower.includes('ver') && (lower.includes('detal') || lower.includes('cupom') || lower.includes('mais'))) {
        btn.textContent = 'Ver mais';
      }
    } else {
      btn.textContent = original;
    }
  });
}

function kcDebounce(fn, wait = 120) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// -----------------------------
// Init
// -----------------------------
document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.applySavedTheme === 'function') window.applySavedTheme();
  initMobileNavActive();
  initSmoothAnchors();
  installRippleStylesOnce();
  kcInitCreatePostTriggers();
  // Layout helpers (sticky tabs, drag-scroll)
  kcUpdateHeaderHeightVar();
  kcInitHorizontalDragAreas();
  kcInitHeroSwipe();
  kcPolishCardsForMobile();
  kcInitImageFallbacks();

  const onResize = kcDebounce(() => {
    kcUpdateHeaderHeightVar();
    kcPolishCardsForMobile();
    kcInitImageFallbacks();
  }, 140);
  window.addEventListener("resize", onResize, { passive: true });


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
    showSlide(0);
    startAutoSlide();
  }

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


/* ---- Patch layer (from script.v556.js) ---- */

/*
  KinoCampus V5.5.6 - Edge Mobile Fit (Responsive Engine)
  Principal função: aplicar variáveis CSS responsivas (gutter / media size)
  e reforçar comportamento de scrollers horizontais em qualquer preset mobile.

  Observação: este script não substitui o script.v554.js; apenas complementa.
*/

(function () {
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function debounce(fn, wait) {
    let t = null;
    return function (...args) {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function updateHeaderHeightVar() {
    const header = document.querySelector('header') || document.querySelector('.kc-header');
    const h = header ? header.offsetHeight : 0;
    if (h) document.documentElement.style.setProperty('--kc-header-height', `${h}px`);
  }

  function applyResponsiveVars() {
    const vw = (document.documentElement && document.documentElement.clientWidth) ? document.documentElement.clientWidth : (window.innerWidth || 0);
    const w = clamp(vw || 0, 240, 820);

    // gutter consistente em qualquer preset mobile do Edge
    const gutter = Math.round(clamp(w * 0.035, 10, 16));
    document.documentElement.style.setProperty('--kc-page-gutter', `${gutter}px`);

    // tamanho do media do card: 62..92
    const media = Math.round(clamp(w * 0.21, 62, 92));
    document.documentElement.style.setProperty('--kc-card-media', `${media}px`);

    // pequenos ajustes extras (telas MUITO estreitas)
    if (w <= 320) {
      document.documentElement.style.setProperty('--kc-chip-pad-x', '12px');
      document.documentElement.style.setProperty('--kc-chip-pad-y', '8px');
    } else {
      document.documentElement.style.removeProperty('--kc-chip-pad-x');
      document.documentElement.style.removeProperty('--kc-chip-pad-y');
    }
  }

  function enableDragToScroll(el) {
    if (!el) return;

    let isDown = false;
    let startX = 0;
    let startScrollLeft = 0;
    let moved = false;

    const THRESHOLD = 8;

    const onDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      isDown = true;
      moved = false;
      startX = e.clientX;
      startScrollLeft = el.scrollLeft;
    };

    const onMove = (e) => {
      if (!isDown) return;
      const dx = e.clientX - startX;

      if (!moved && Math.abs(dx) > THRESHOLD) {
        moved = true;
        el.classList.add('is-dragging');
        document.documentElement.classList.add('kc-no-select');
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
      }

      if (!moved) return;
      el.scrollLeft = startScrollLeft - dx;
    };

    const onUp = () => {
      if (!isDown) return;
      isDown = false;
      setTimeout(() => {
        el.classList.remove('is-dragging');
        document.documentElement.classList.remove('kc-no-select');
      }, 0);
    };

    const onClickCapture = (e) => {
      if (!moved) return;
      e.preventDefault();
      e.stopPropagation();
    };

    el.addEventListener('pointerdown', onDown, { passive: true });
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerup', onUp, { passive: true });
    el.addEventListener('pointercancel', onUp, { passive: true });
    el.addEventListener('lostpointercapture', onUp, { passive: true });
    el.addEventListener('click', onClickCapture, true);
  }

  function initHorizontalAreas() {
    document.querySelectorAll('.kc-feed-tabs, .kc-ranking-users').forEach(enableDragToScroll);
  }

  function init() {
    updateHeaderHeightVar();
    applyResponsiveVars();
    initHorizontalAreas();
  }

  document.addEventListener('DOMContentLoaded', () => {
    init();

    const onResize = debounce(() => {
      updateHeaderHeightVar();
      applyResponsiveVars();
    }, 120);

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });
  });
})();


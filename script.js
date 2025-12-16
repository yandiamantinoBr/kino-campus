/**
 * KinoCampus - Core UI scripts (V5.2 patch)
 *
 * Mantém apenas funcionalidades compartilhadas para evitar conflitos com scripts
 * específicos de páginas (ex.: filtros/feeds inline).
 */

// -----------------------------
// Theme
// -----------------------------
function toggleTheme() {
  const body = document.body;
  const currentTheme = body.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  body.setAttribute('data-theme', newTheme);

  // Update icon
  const themeIcon = document.querySelector('.theme-toggle i');
  if (themeIcon) {
    themeIcon.className = newTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
  }

  localStorage.setItem('theme', newTheme);
}

function applySavedTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.body.setAttribute('data-theme', savedTheme);

  const themeIcon = document.querySelector('.theme-toggle i');
  if (themeIcon) {
    themeIcon.className = savedTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
  }
}

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

  const post = {
    id,
    createdAt: new Date().toISOString(),
    ...data,
  };

  posts.unshift(post);
  kcSaveUserPosts(posts);
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

// Minimal card injection (works on pages with .kc-feed-list)
function kcInjectUserPostsIntoFeed() {
  const feed = document.querySelector('.kc-feed-list');
  if (!feed) return;

  const filterModulo = kcGetModuloFilterForPage();
  const posts = kcLoadUserPosts().filter(p => !filterModulo || String(p.modulo) === String(filterModulo));
  if (!posts.length) return;

  // Avoid duplicating if already injected
  if (feed.querySelector('[data-kc-user-post="true"]')) return;

  const fragment = document.createDocumentFragment();
  posts.slice(0, 5).forEach(p => {
    const article = document.createElement('article');
    article.className = 'kc-card';
    article.setAttribute('data-kc-user-post', 'true');
    if (p.categoria) article.setAttribute('data-category', p.categoria);

    const emoji = p.emoji || '✨';
    const priceValue = p.preco;
    const priceText = (typeof priceValue === 'number')
      ? formatCurrencyBRL(priceValue)
      : (priceValue ? String(priceValue) : '');

    const priceHtml = priceText ? `
      <div class="kc-card__price"><i class="fas fa-money-bill-wave"></i> ${escapeHtml(priceText)}</div>
    ` : '';

    article.innerHTML = `
      <div class="kc-card__main">
        <div class="kc-card__image-wrapper" style="display:flex;align-items:center;justify-content:center;font-size:2.2em;">
          <span aria-hidden="true">${emoji}</span>
        </div>
        <div class="kc-card__content">
          <div class="kc-card__header">
            <div class="kc-card__category-source">${escapeHtml(p.moduloLabel || p.modulo || 'Publicação')}</div>
            <div class="kc-card__timestamp">Agora</div>
          </div>
          <a href="product.html?id=${encodeURIComponent(p.id)}" class="kc-card__title">${escapeHtml(p.titulo || 'Nova publicação')}</a>
          ${priceHtml}
          <div class="kc-card__author">
            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(p.autor || 'Você')}" alt="${escapeHtml(p.autor || 'Você')}">
            <span>Por <strong>${escapeHtml(p.autor || 'Você')}</strong></span>
          </div>
        </div>
      </div>
      <div class="kc-card__footer">
        <div class="kc-card__interactions">
          <div class="kc-vote-box">
            <button class="hot" onclick="vote(this, 'hot')"><i class="fas fa-fire"></i></button>
            <span>0</span>
            <button class="cold" onclick="vote(this, 'cold')"><i class="fas fa-snowflake"></i></button>
          </div>
          <a href="product.html?id=${encodeURIComponent(p.id)}" class="kc-comment-link"><i class="fas fa-comment"></i><span>0</span></a>
        </div>
      </div>
    `;

    fragment.appendChild(article);
  });

  feed.prepend(fragment);
}

// Expose small API
window.kcUserPosts = {
  create: kcCreateUserPost,
  getById: kcGetUserPostById,
  list: kcLoadUserPosts,
};

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
// Init
// -----------------------------
document.addEventListener('DOMContentLoaded', () => {
  applySavedTheme();
  initMobileNavActive();
  initSmoothAnchors();
  installRippleStylesOnce();

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

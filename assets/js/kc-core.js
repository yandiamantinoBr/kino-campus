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

window.KCPostModel = window.KCPostModel || {
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
        const clamp = (window.KC_ENV && window.KC_ENV.clamp) ? window.KC_ENV.clamp : null;
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
    if (window.KCAPI && typeof window.KCAPI.normalizePost === 'function') {
      post = window.KCAPI.normalizePost(post);
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
// Hero carousel (index)
// -----------------------------
let currentSlide = 0;
let autoSlideInterval = null;
let heroControlsBound = false;
const KC_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isProductionRuntime() {
  return !!(window.KC_ENV && window.KC_ENV.isProduction === true);
}

function isSupabaseRuntime() {
  return !!(window.KCAPI && window.KCAPI.ENV && window.KCAPI.ENV.driver === 'supabase');
}

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

function refreshHeroCarousel() {
  if (!document.querySelector('.kc-hero-carousel')) return;
  showSlide(0);
  startAutoSlide();

  if (!heroControlsBound) {
    heroControlsBound = true;

    const carousel = document.querySelector('.kc-hero-carousel');
    const prevBtn = document.querySelector('.kc-carousel-prev[data-kc-slide="prev"]');
    const nextBtn = document.querySelector('.kc-carousel-next[data-kc-slide="next"]');
    const dotsWrap = document.getElementById('kc-carousel-dots');

    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        changeSlide(-1);
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        changeSlide(1);
      });
    }

    if (dotsWrap) {
      dotsWrap.addEventListener('click', (e) => {
        const dot = e.target.closest('.kc-dot[data-kc-slide]');
        if (!dot) return;
        const index = Number.parseInt(String(dot.getAttribute('data-kc-slide') || ''), 10);
        if (!Number.isFinite(index)) return;
        e.preventDefault();
        e.stopPropagation();
        goToSlide(index);
      });
    }

    // Fallback: em alguns devices/cliques o alvo chega como .kc-hero-carousel
    // (e não no botão), então usamos zonas laterais para prev/next.
    if (carousel) {
      carousel.addEventListener('click', (e) => {
        if (e.target.closest('.kc-carousel-prev, .kc-carousel-next, .kc-dot, .kc-btn-primary')) return;
        const r = carousel.getBoundingClientRect();
        const x = e.clientX;
        const edge = Math.max(56, Math.min(88, r.width * 0.12));
        if (x <= r.left + edge) {
          changeSlide(-1);
        } else if (x >= r.right - edge) {
          changeSlide(1);
        }
      });
    }
  }
}

let kcVotesRealtimeChannel = null;
let kcVotesRealtimeRetryTimer = null;
let kcVotesPollingTimer = null;

function kcUpdateVoteScoreInDOM(postId, score) {
  const encoded = encodeURIComponent(String(postId || ''));
  if (!encoded) return;
  const scoreText = String(Number.isFinite(Number(score)) ? Number(score) : 0);

  document.querySelectorAll(`.kc-vote-box [data-post-uuid="${encoded}"], .kc-vote-box [data-post-id="${encoded}"]`).forEach((btn) => {
    const voteBox = btn.closest('.kc-vote-box');
    const scoreEl = voteBox ? voteBox.querySelector('span') : null;
    if (scoreEl) scoreEl.textContent = scoreText;
  });
}

function kcIsUuid(value) {
  return KC_UUID_RE.test(String(value || '').trim());
}

function kcInitVotesRealtime() {
  if (!isSupabaseRuntime()) return;
  if (kcVotesRealtimeChannel) return;

  const client = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
    ? window.KCSupabase.getClient()
    : null;
  if (!client || typeof client.channel !== 'function') {
    if (!kcVotesRealtimeRetryTimer) {
      kcVotesRealtimeRetryTimer = setTimeout(() => {
        kcVotesRealtimeRetryTimer = null;
        kcInitVotesRealtime();
      }, 1200);
    }
    return;
  }

  const refreshVisibleScores = async () => {
    try {
      const ids = Array.from(new Set(Array.from(document.querySelectorAll('.kc-vote-box [data-post-id], .kc-vote-box [data-post-uuid]'))
        .map((el) => {
          const rawUuid = String(el.getAttribute('data-post-uuid') || '').trim();
          const rawId = String(el.getAttribute('data-post-id') || '').trim();
          const chosen = rawUuid || rawId;
          return chosen ? decodeURIComponent(chosen) : '';
        })
        .filter((id) => kcIsUuid(id))));
      if (!ids.length) return;

      const { data, error } = await client
        .from('posts')
        .select('id, votos')
        .in('id', ids);

      if (error || !Array.isArray(data)) return;
      data.forEach((row) => {
        if (!row || !row.id) return;
        kcUpdateVoteScoreInDOM(row.id, row.votos);
      });
    } catch (_) { }
  };

  try {
    kcVotesRealtimeChannel = client
      .channel(`kc-votes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'posts' },
        (payload) => {
          const row = payload && payload.new ? payload.new : null;
          if (!row || !row.id) return;
          if (!Object.prototype.hasOwnProperty.call(row, 'votos')) return;
          kcUpdateVoteScoreInDOM(row.id, row.votos);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_votes' },
        () => { refreshVisibleScores(); }
      )
      .subscribe();

    if (!kcVotesPollingTimer) {
      kcVotesPollingTimer = setInterval(() => {
        if (document.hidden) return;
        refreshVisibleScores();
      }, 5000);
    }

    refreshVisibleScores();
  } catch (_) {
    kcVotesRealtimeChannel = null;
  }
}




// -----------------------------
// Vote box
// -----------------------------
const KC_VOTE_IN_FLIGHT = new Set();

function setVoteBoxPending(voteBox, pending) {
  if (!voteBox) return;
  voteBox.querySelectorAll('button').forEach((btn) => {
    if (pending) btn.setAttribute('disabled', 'disabled');
    else btn.removeAttribute('disabled');
  });
  voteBox.dataset.kcVotePending = pending ? '1' : '0';
}

function restoreVoteUI(voteBox, scoreElement, previousScoreText, previousActiveStates) {
  if (scoreElement) scoreElement.textContent = String(previousScoreText);
  const voteButtons = voteBox ? Array.from(voteBox.querySelectorAll('button')) : [];
  voteButtons.forEach((btn, idx) => {
    btn.classList.toggle('active', !!previousActiveStates[idx]);
  });
}

function vote(button, type) {
  const voteBox = button.closest('.kc-vote-box');
  if (!voteBox) return;

  const scoreElement = voteBox.querySelector('span');
  if (!scoreElement) return;
  const voteButtons = Array.from(voteBox.querySelectorAll('button'));
  if (!voteButtons.length) return;

  const currentScore = parseInt(scoreElement.textContent, 10) || 0;
  const isActive = button.classList.contains('active');
  const previousScoreText = scoreElement.textContent;
  const previousActiveStates = voteButtons.map((btn) => btn.classList.contains('active'));

  const isSupabaseMode = isSupabaseRuntime();
  const buttonUuid = button.getAttribute('data-post-uuid');
  const buttonPostId = button.getAttribute('data-post-id');
  const decodedUuid = buttonUuid ? decodeURIComponent(String(buttonUuid)) : '';
  const decodedPostId = buttonPostId ? decodeURIComponent(String(buttonPostId)) : '';
  const postId = decodedUuid || decodedPostId || button.closest('[data-post-id]')?.dataset.postId || getCurrentPostId();
  const lockKey = String(postId || '').trim();

  if (isSupabaseMode && !lockKey) {
    showToast('Não foi possível identificar a publicação para votar.', 'error');
    return;
  }

  if (isSupabaseMode && KC_VOTE_IN_FLIGHT.has(lockKey)) return;

  // clear
  voteButtons.forEach(btn => btn.classList.remove('active'));

  // Qual tipo estava ativo?
  let previouslyActiveType = null;
  voteButtons.forEach((btn, idx) => {
    if (previousActiveStates[idx]) {
      const action = String(btn.getAttribute('data-action') || '');
      if (action.includes('hot')) previouslyActiveType = 'hot';
      if (action.includes('cold')) previouslyActiveType = 'cold';
    }
  });

  // Reverte o efeito do voto anterior na view local
  let baseScore = currentScore;
  if (previouslyActiveType === 'hot') {
    baseScore -= 1;
  } else if (previouslyActiveType === 'cold') {
    baseScore += 1;
  }

  // Aplica o novo estado otimista
  let newScore = baseScore;
  if (!isActive) {
    button.classList.add('active');
    newScore = type === 'hot' ? baseScore + 1 : baseScore - 1;
  }

  scoreElement.textContent = String(newScore);
  if (postId) kcUpdateVoteScoreInDOM(postId, newScore);

  // micro animation
  scoreElement.style.transform = 'scale(1.15)';
  setTimeout(() => { scoreElement.style.transform = 'scale(1)'; }, 160);

  // Modo local: mantém UX otimista sem escrita remota.
  if (!isSupabaseMode) return;

  KC_VOTE_IN_FLIGHT.add(lockKey);
  setVoteBoxPending(voteBox, true);

  // Supabase: explicita intenção de toggle para reduzir corrida de múltiplos cliques.
  window.KCAPI.votePost(postId, type, { toggleOff: isActive }).then(function (res) {
    if (res && res.ok) {
      if (typeof res.score === 'number') {
        scoreElement.textContent = String(res.score);
        kcUpdateVoteScoreInDOM(postId, res.score);
      }

      if (res.direction === null) {
        voteButtons.forEach((btn) => btn.classList.remove('active'));
      } else {
        voteButtons.forEach((btn) => {
          const action = String(btn.getAttribute('data-action') || '').trim().toLowerCase();
          const btnType = action === 'vote-hot' ? 'hot' : (action === 'vote-cold' ? 'cold' : '');
          btn.classList.toggle('active', btnType === res.direction);
        });
      }
      return;
    }

    restoreVoteUI(voteBox, scoreElement, previousScoreText, previousActiveStates);
    const msg = (res && res.error && res.error.message) ? String(res.error.message) : 'Não foi possível registrar voto.';
    showToast(msg, 'error');
  }).catch(function () {
    restoreVoteUI(voteBox, scoreElement, previousScoreText, previousActiveStates);
    showToast('Não foi possível registrar voto.', 'error');
  }).finally(function () {
    KC_VOTE_IN_FLIGHT.delete(lockKey);
    setVoteBoxPending(voteBox, false);
  });
}

// -----------------------------
// Inicializa estados hot/cold dos vote-boxes visíveis
// Chama a RPC kc_get_my_votes para obter os votos do
// usuário autenticado para todos os posts no feed.
// -----------------------------
async function kcInitVoteStates() {
  if (!isSupabaseRuntime()) return;

  // Coleta todos os post-ids presentes no DOM
  const postIds = [];
  const idSet = new Set();
  document.querySelectorAll('[data-action="vote-hot"][data-post-id], [data-action="vote-hot"][data-post-uuid]').forEach((btn) => {
    const rawUuid = btn.getAttribute('data-post-uuid');
    const rawId = btn.getAttribute('data-post-id');
    const id = rawUuid ? decodeURIComponent(rawUuid) : (rawId ? decodeURIComponent(rawId) : null);
    if (id && kcIsUuid(id) && !idSet.has(id)) {
      idSet.add(id);
      postIds.push(id);
    }
  });
  if (!postIds.length) return;

  try {
    const client = window.KCSupabase && typeof window.KCSupabase.getClient === 'function' ? window.KCSupabase.getClient() : null;
    if (!client) return;

    const { data, error } = await client.rpc('kc_get_my_votes', { p_post_ids: postIds });
    if (error || !Array.isArray(data)) return;

    // Monta mapa: post_id -> direction
    const voteMap = {};
    data.forEach((row) => { voteMap[row.post_id] = row.direction; });

    // Aplica ao DOM
    idSet.forEach((postId) => {
      const dir = voteMap[postId];
      if (!dir) return; // sem voto registrado

      // Localiza o vote-box pelo data-post-id (pode ser encoded)
      const encoded = encodeURIComponent(postId);
      const hotBtn = document.querySelector(`[data-action="vote-hot"][data-post-id="${encoded}"]`);
      const coldBtn = document.querySelector(`[data-action="vote-cold"][data-post-id="${encoded}"]`);
      if (!hotBtn && !coldBtn) return;

      if (hotBtn) hotBtn.classList.toggle('active', dir === 'hot');
      if (coldBtn) coldBtn.classList.toggle('active', dir === 'cold');
    });
  } catch (_) {
    // silencioso — não quebra o feed
  }
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

  const toggleBtn = document.querySelector('[data-kc-mobile-menu="toggle"]');
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
}

function closeMobileMenu() {
  const { menu, overlay } = getMobileMenuElements();
  if (!menu || !overlay) return;

  menu.classList.remove('active');
  overlay.classList.remove('active');
  document.body.style.overflow = '';

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

function resolveCurrentUserDisplayName(user, profile) {
  const normalizedProfile = (profile && typeof profile === 'object') ? profile : null;
  const normalizedUser = (user && typeof user === 'object') ? user : null;
  const userMetadata = (normalizedUser && normalizedUser.user_metadata && typeof normalizedUser.user_metadata === 'object')
    ? normalizedUser.user_metadata
    : null;
  const candidates = [
    normalizedProfile && normalizedProfile.display_name,
    normalizedProfile && normalizedProfile.full_name,
    userMetadata && userMetadata.full_name,
    normalizedUser && normalizedUser.display_name,
    normalizedUser && normalizedUser.full_name,
    normalizedUser && normalizedUser.email,
  ];

  for (let i = 0; i < candidates.length; i += 1) {
    const value = String(candidates[i] || '').trim();
    if (value) return value;
  }

  return '';
}

function renderCommentMarkdownInline(raw) {
  const source = String(raw || '');
  let html = escHtml(source);

  const links = [];
  html = html.replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, function (_, label, url) {
    const safeUrl = String(url || '').trim();
    const safeLabel = String(label || '').trim() || safeUrl;
    const token = `__KC_LINK_${links.length}__`;
    links.push(`<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`);
    return token;
  });

  html = html
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<u>$1</u>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>');

  html = html.replace(/^&gt;\s?(.*)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/(?:^|\n)-\s+(.+)(?=\n|$)/g, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  html = html.replace(/\n/g, '<br>');

  links.forEach((tag, idx) => {
    html = html.replace(`__KC_LINK_${idx}__`, tag);
  });

  return html;
}

function updateCommentPreview(postId = null) {
  const id = postId != null ? String(postId) : getCurrentPostId();
  if (!id) return;
  const textarea = document.querySelector(`textarea[data-post-id="${cssEscape(id)}"]`) || document.getElementById('commentText');
  const preview = document.getElementById('commentPreview');
  if (!textarea || !preview) return;

  const value = String(textarea.value || '').trim();
  if (!value) {
    preview.innerHTML = 'Pré-visualização: use a barra para formatar o comentário.';
    return;
  }

  preview.innerHTML = renderCommentMarkdownInline(value);
}

// Normaliza campos de um comentário independentemente da origem (localStorage ou Supabase)
function normalizeCommentForRender(c) {
  const profile = c.author_profile || c.profiles || null;
  const resolvedAuthor = (
    (profile && (profile.display_name || profile.full_name))
    || c.display_name
    || c.full_name
    || c.author_name
    || c.author
  );
  const normalizedAuthor = String(resolvedAuthor || '').trim();
  if (!normalizedAuthor) {
    console.warn('[KC Comments] Comentário sem autoria preenchida, aplicando fallback.', {
      commentId: c && c.id,
      hasAuthorProfile: !!profile,
      raw: c,
    });
  }

  const resolvedAvatar = String(
    (profile && profile.avatar_url)
    || c.author_avatar
    || c.avatar_url
    || ''
  ).trim();

  return {
    id: c.id,
    author: normalizedAuthor || 'Anônimo',
    avatar: resolvedAvatar,
    text: c.body || c.text || '',
    timestamp: c.created_at
      ? new Date(c.created_at).toLocaleString('pt-BR')
      : (c.timestamp || ''),
    likes: c.likes || 0,
    likedByMe: !!(c && (c.liked_by_me || c.likedByMe)),
    canLike: (c && c._kcCanLike !== false),
  };
}

function getLocalLikeKey(postId, commentId, userId) {
  return `kc_comment_likes_${postId}_${commentId}_${userId}`;
}

async function resolveCurrentLikeUserId() {
  try {
    if (window.KCAPI && typeof window.KCAPI.getCurrentUser === 'function') {
      const user = await window.KCAPI.getCurrentUser();
      if (user && user.id) return String(user.id);
    }
  } catch (_) { }

  try {
    const key = 'kc_local_like_user_id';
    let localId = String(localStorage.getItem(key) || '').trim();
    if (!localId) {
      localId = `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(key, localId);
    }
    return localId;
  } catch (_) {
    return 'guest_fallback';
  }
}

async function likeComment(postId, commentId, containerId = 'commentsContainer') {

  const id = String(postId);

  // Driver Supabase: persiste via KCAPI (async, re-render ao resolver)
  if (isSupabaseRuntime()) {
    window.KCAPI.likeComment(commentId).then(function (res) {
      renderComments(id, containerId);
      if (res && res.ok && res.alreadyLiked) {
        showToast('Você já curtiu este comentário.', 'info', 1800);
        return;
      }
      if (!res || !res.ok) {
        const msg = (res && res.error && res.error.message) || 'Não foi possível curtir este comentário.';
        showToast(msg, 'error', 2200);
      }
    }).catch(function () {
      showToast('Não foi possível curtir este comentário.', 'error', 2200);
    });
    return;
  }

  // Driver local: localStorage
  const comments = loadComments(id);
  const comment = comments.find(c => String(c.id) === String(commentId));
  if (!comment) return;

  const userId = await resolveCurrentLikeUserId();
  const likeKey = getLocalLikeKey(id, commentId, userId);
  try {
    if (localStorage.getItem(likeKey)) {
      showToast('Você já curtiu este comentário.', 'info', 1800);
      return;
    }
  } catch (_) { }

  comment.likes = (comment.likes || 0) + 1;
  saveComments(id, comments);
  try { localStorage.setItem(likeKey, '1'); } catch (_) { }
  renderComments(id, containerId);
}

function _renderCommentList(id, containerId, comments) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!Array.isArray(comments) || comments.length === 0) {
    container.innerHTML = `
      <div style="padding: 20px; text-align: center; color: var(--kc-text-dark-secondary);">
        <i class="fas fa-comments" style="font-size: 2em; margin-bottom: 10px; opacity: 0.5;"></i>
        <p>Seja o primeiro a comentar!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = comments.map(function (raw) {
    const c = normalizeCommentForRender(raw);
    const likeDisabled = !!c.likedByMe || !c.canLike;
    const likeStateColor = likeDisabled ? 'var(--kc-accent, #3b82f6)' : 'var(--kc-text-dark-secondary)';
    const likeStateWeight = likeDisabled ? '600' : '400';
    return `
    <div class="kc-comment" style="padding: 15px; border-bottom: 1px solid var(--kc-border-dark); margin-bottom: 10px;">
      <div style="display: flex; gap: 10px; margin-bottom: 10px;">
        <img src="${escHtml(c.avatar || ('https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(c.author)))}" alt="${escHtml(c.author)}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background-color: var(--kc-surface-dark);">
        <div style="flex: 1;">
          <div style="font-weight: bold;">${escHtml(c.author)}</div>
          <div style="font-size: 0.85em; color: var(--kc-text-dark-secondary);">${escHtml(c.timestamp)}</div>
        </div>
      </div>
      <div style="margin-left: 50px; margin-bottom: 10px; white-space: normal; line-height: 1.6;">${renderCommentMarkdownInline(c.text)}</div>
      <div style="margin-left: 50px; display: flex; gap: 15px; font-size: 0.9em;">
        <button data-post-id="${escHtml(String(id))}" data-comment-id="${escHtml(String(c.id))}" data-container="${escHtml(containerId)}" class="kc-like-comment-btn ${likeDisabled ? 'is-liked' : ''}" ${likeDisabled ? 'disabled aria-disabled="true"' : ''} style="background: none; border: none; cursor: ${likeDisabled ? 'not-allowed' : 'pointer'}; color: ${likeStateColor}; font-weight: ${likeStateWeight}; opacity: ${likeDisabled ? '0.95' : '1'};">
          <i class="fas fa-thumbs-up"></i> ${c.likes || 0}${c.likedByMe ? ' • Curtido' : (c.canLike ? '' : ' • Entrar para curtir')}
        </button>
      </div>
    </div>`;
  }).join('');

  // Event delegation: set up once per container so it persists across re-renders.
  if (!container._kcLikeListenerAttached) {
    container._kcLikeListenerAttached = true;
    container.addEventListener('click', function (e) {
      const btn = e.target.closest('.kc-like-comment-btn');
      if (!btn) return;
      likeComment(btn.dataset.postId, btn.dataset.commentId, btn.dataset.container);
    });
  }
}

function renderComments(postId, containerId = 'commentsContainer') {
  bindCommentPreviewSync();
  const id = String(postId);

  // Driver Supabase: carrega async, depois renderiza
  if (isSupabaseRuntime()) {
    Promise.all([
      window.KCAPI.getComments(id),
      (window.KCAPI && typeof window.KCAPI.getCurrentUser === 'function') ? window.KCAPI.getCurrentUser() : Promise.resolve(null),
    ]).then(function (results) {
      const comments = Array.isArray(results[0]) ? results[0] : [];
      const user = results[1] || null;
      const canLike = !!(user && user.id);
      const enriched = comments.map(function (comment) { return { ...comment, _kcCanLike: canLike }; });
      _renderCommentList(id, containerId, enriched);
    }).catch(function () {
      _renderCommentList(id, containerId, []);
    }).finally(function () {
      updateCommentPreview(id);
    });
    return;
  }

  // Driver local/dev: localStorage + chave de like por usuário
  Promise.resolve(resolveCurrentLikeUserId()).then(function (userId) {
    const comments = (loadComments(id) || []).map(function (comment) {
      const likeKey = getLocalLikeKey(id, comment && comment.id, userId);
      let likedByMe = false;
      try { likedByMe = !!localStorage.getItem(likeKey); } catch (_) { }
      return { ...comment, likedByMe };
    });
    _renderCommentList(id, containerId, comments);
  }).catch(function () {
    _renderCommentList(id, containerId, loadComments(id));
  }).finally(function () {
    updateCommentPreview(id);
  });
}

function bindCommentPreviewSync() {
  if (document.body && document.body.dataset.kcCommentPreviewBound === '1') return;
  if (document.body) document.body.dataset.kcCommentPreviewBound = '1';

  document.addEventListener('input', function (event) {
    const target = event.target;
    if (!target || target.id !== 'commentText') return;
    updateCommentPreview();
  });
}

async function submitComment(postId = null, containerId = 'commentsContainer') {
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

  const text = textarea.value.trim();

  // Driver Supabase: persiste via KCAPI (async)
  if (window.KCAPI && window.KCAPI.ENV && window.KCAPI.ENV.driver === 'supabase') {
    window.KCAPI.addComment(id, text).then(function (res) {
      if (res && res.ok) {
        textarea.value = '';
        updateCommentPreview(id);
        renderComments(id, containerId);
        showToast('Comentário enviado!', 'info', 1800);

        // Audit log: registra comentário (fire-and-forget)
        try {
          const kcClient = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
            ? window.KCSupabase.getClient() : null;
          const commentId = (res.data && res.data.id) ? String(res.data.id) : id;
          if (kcClient) {
            let actorId = null;
            try {
              if (window.KCAPI && typeof window.KCAPI.getCurrentUser === 'function') {
                window.KCAPI.getCurrentUser().then(function (u) {
                  if (u) actorId = u.id;
                  kcClient.from('audit_log').insert({
                    action: 'comment_created',
                    entity_type: 'comments',
                    entity_id: commentId,
                    actor_id: actorId,
                  }).then(() => { }).catch(() => { });
                }).catch(() => { });
              }
            } catch (_) { }
          }
        } catch (_) { }
      } else {
        const msg = (res && res.error && res.error.message) || 'Não foi possível comentar.';
        showToast(msg, 'error');
      }
    }).catch(function () {
      showToast('Erro ao enviar comentário.', 'error');
    });
    return;
  }

  // Política de produção: impedir persistência local de operação crítica.
  if (isProductionRuntime()) {
    showToast('Comentário bloqueado: em produção, use Supabase.', 'error');
    return;
  }

  // Driver local: localStorage
  const authorInput = document.querySelector(`input[data-post-id="${cssEscape(id)}"][name="author"]`);
  let sessionUser = null;
  let sessionProfile = null;
  try {
    if (window.KCAPI && typeof window.KCAPI.getCurrentUser === 'function') {
      sessionUser = await window.KCAPI.getCurrentUser();
    }
  } catch (_) { }

  if (sessionUser) {
    try {
      if (window.KCAPI && typeof window.KCAPI.getMyProfile === 'function') {
        sessionProfile = await window.KCAPI.getMyProfile();
      }
    } catch (_) { }

    if (!sessionProfile) {
      try {
        if (window.KCProfiles && typeof window.KCProfiles.getCurrentProfile === 'function') {
          sessionProfile = window.KCProfiles.getCurrentProfile();
        }
      } catch (_) { }
    }
  }

  const sessionAuthorName = resolveCurrentUserDisplayName(sessionUser, sessionProfile);
  const hasSession = !!(sessionUser && sessionUser.id);
  const authorName = hasSession
    ? (sessionAuthorName || 'Conta autenticada')
    : (sessionAuthorName || authorInput?.value?.trim() || 'Anônimo');
  addComment(id, text, authorName);
  textarea.value = '';
  updateCommentPreview(id);
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
  const hasSelection = !!selectedText;

  const wrapSelection = function (before, after, fallbackText) {
    const baseText = hasSelection ? selectedText : (fallbackText || 'texto');
    const formatted = `${before}${baseText}${after}`;
    textarea.value = textarea.value.substring(0, start) + formatted + textarea.value.substring(end);
    textarea.focus();
    const cursorEnd = start + formatted.length;
    textarea.selectionStart = cursorEnd;
    textarea.selectionEnd = cursorEnd;
  };

  const insertBlock = function (blockText) {
    const prefix = (start > 0 && textarea.value[start - 1] !== '\n') ? '\n' : '';
    const suffix = (end < textarea.value.length && textarea.value[end] !== '\n') ? '\n' : '';
    const formatted = `${prefix}${blockText}${suffix}`;
    textarea.value = textarea.value.substring(0, start) + formatted + textarea.value.substring(end);
    textarea.focus();
    const cursorEnd = start + formatted.length;
    textarea.selectionStart = cursorEnd;
    textarea.selectionEnd = cursorEnd;
  };

  switch (format) {
    case 'bold':
      wrapSelection('**', '**', 'negrito');
      break;
    case 'italic':
      wrapSelection('*', '*', 'itálico');
      break;
    case 'underline':
      wrapSelection('__', '__', 'sublinhado');
      break;
    case 'strikethrough':
      wrapSelection('~~', '~~', 'tachado');
      break;
    case 'inlinecode':
      wrapSelection('`', '`', 'código');
      break;
    case 'quote':
      insertBlock(`> ${hasSelection ? selectedText : 'citação'}`);
      break;
    case 'bullet':
      insertBlock(`- ${hasSelection ? selectedText : 'item da lista'}`);
      break;
    case 'link': {
      const label = hasSelection ? selectedText : 'texto do link';
      const formatted = `[${label}](https://)`;
      textarea.value = textarea.value.substring(0, start) + formatted + textarea.value.substring(end);
      const cursorStart = start + formatted.length - 1;
      textarea.focus();
      textarea.selectionStart = cursorStart;
      textarea.selectionEnd = cursorStart;
      break;
    }
    default:
      return;
  }

  updateCommentPreview(id);
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
      const clamp = (window.KC_ENV && window.KC_ENV.clamp) ? window.KC_ENV.clamp : null;
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
          if (window.KCAPI && typeof window.KCAPI.getAuthorById === 'function') {
            const u = window.KCAPI.getAuthorById('USER_SELF');
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
      const apiCreateFn = (window.KCActions && typeof window.KCActions.createPost === 'function') ? window.KCActions.createPost : window.KCAPI.createPost;
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
  submitting: false,

  // Imagens (máx 5: 1 capa + 4)
  images: [], // [{ id, dataUrl, name, size, isExisting? }]
  coverImageId: null,

  // Modo edição
  editMode: false,
  editPostId: null,
  editCallback: null,
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

function kcNormalizeMoneyInput(input) {
  const n = kcParseBRLNumber(input);
  if (n == null) return null;
  return n.toFixed(2).replace('.', ',');
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

    const areaSuggestion = e.target.closest('[data-kc-area-suggestion]');
    if (areaSuggestion) {
      const value = areaSuggestion.getAttribute('data-kc-area-suggestion') || '';
      kcCreateState.values.areaAtuacao = value;
      const areaInput = overlay.querySelector('input[name="areaAtuacao"]');
      if (areaInput) areaInput.value = value;
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
    if (!target) return;
    if (target.matches && target.matches('[data-kc-opportunity-area-input]')) {
      const resolved = kcResolveOpportunityAreaValue(target.value);
      if (resolved && resolved.label) {
        target.value = resolved.label;
        kcCreateState.values[target.name] = resolved.label;
      }
      return;
    }
    if (target.id !== 'kcImagesInput') return;
    const files = target.files;
    if (files && files.length) await kcAddImagesFromFiles(files);
    // permite selecionar o mesmo arquivo novamente
    try { target.value = ''; } catch { }
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

function kcNormalizeOpportunityTypeKey(value) {
  const canonical = window.KCUtils && typeof window.KCUtils.canonicalCategory === 'function'
    ? window.KCUtils.canonicalCategory(value)
    : String(value || '').trim().toLowerCase();

  if (!canonical) return '';
  if (canonical.includes('estagio')) return 'estagio';
  if (canonical.includes('emprego')) return 'emprego';
  if (canonical.includes('freelancer')) return 'freelancer';
  if (canonical.includes('monitor')) return 'monitoria';
  if (canonical.includes('volunt')) return 'voluntariado';
  return canonical;
}

function kcGetOpportunityTypeOptionKey(value) {
  const normalized = kcNormalizeOpportunityTypeKey(value);
  if (normalized === 'estagio') return 'estagios';
  if (normalized === 'emprego') return 'empregos';
  return normalized;
}

function kcResolveOpportunityAreaValue(value, fallbackSource) {
  if (window.KCUtils && typeof window.KCUtils.resolveOpportunityArea === 'function') {
    const options = fallbackSource ? { textParts: [fallbackSource] } : {};
    return window.KCUtils.resolveOpportunityArea(value || fallbackSource || '', options);
  }

  const raw = String(value || '').trim();
  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return { key, label: raw, icon: 'fas fa-briefcase', isKnown: false };
}

function kcGetOpportunityAreaOptions() {
  if (window.KCUtils && typeof window.KCUtils.getOpportunityAreaDefinitions === 'function') {
    return window.KCUtils.getOpportunityAreaDefinitions();
  }

  return [
    { key: 'tecnologia', label: 'Tecnologia', icon: 'fas fa-laptop-code' },
    { key: 'marketing', label: 'Marketing', icon: 'fas fa-bullhorn' },
    { key: 'design', label: 'Design', icon: 'fas fa-palette' },
    { key: 'educacao', label: 'Educa\u00e7\u00e3o', icon: 'fas fa-graduation-cap' },
  ];
}

function kcResolveOpportunityWorkMode(value) {
  const raw = String(value || '').trim();
  const normalized = (window.KCUtils && typeof window.KCUtils.normalizeText === 'function')
    ? window.KCUtils.normalizeText(raw)
    : raw.toLowerCase();

  if (!normalized) return { key: '', label: '' };
  if (normalized.includes('hibrid')) return { key: 'hibrido', label: 'H\u00edbrido' };
  if (normalized.includes('remot') || normalized.includes('home office')) return { key: 'remoto', label: 'Remoto' };
  if (normalized.includes('presencial') || normalized.includes('onsite') || normalized.includes('on-site')) {
    return { key: 'presencial', label: 'Presencial' };
  }
  return { key: '', label: raw };
}

function kcResolveOpportunityRegime(value) {
  const raw = String(value || '').trim();
  const normalized = (window.KCUtils && typeof window.KCUtils.normalizeText === 'function')
    ? window.KCUtils.normalizeText(raw)
    : raw.toLowerCase();

  if (!normalized) return { key: '', label: '' };
  if (normalized.includes('clt')) return { key: 'clt', label: 'CLT' };
  if (normalized.includes('pj')) return { key: 'pj', label: 'PJ' };
  if (normalized.includes('tempor')) return { key: 'temporario', label: 'Tempor\u00e1rio' };
  if (normalized.includes('aprendiz')) return { key: 'aprendiz', label: 'Jovem Aprendiz' };
  if (normalized.includes('bolsa')) return { key: 'bolsa', label: 'Bolsa' };
  return {
    key: normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    label: raw,
  };
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
        <img src="${escHtml(img.dataUrl)}" alt="Imagem da publicação" loading="lazy" />
        ${isCover ? `<div class="kc-img-badge"><i class="fas fa-star"></i> Capa</div>` : ''}
        <div class="kc-img-actions">
          <button type="button" class="kc-img-action" data-kc-img-action="cover" data-kc-img-id="${escHtml(img.id)}" title="Definir como capa">
            <i class="fas fa-star"></i>
          </button>
          <button type="button" class="kc-img-action" data-kc-img-action="remove" data-kc-img-id="${escHtml(img.id)}" title="Remover">
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
  const moneyFieldMeta = {
    type: 'text',
    inputmode: 'decimal',
    pattern: '^\\d{1,3}(?:\\.\\d{3})*(?:,\\d{1,2})?$|^\\d+(?:[\\.,]\\d{1,2})?$'
  };

  // comuns
  fields.push({ type: 'text', name: 'titulo', label: 'Título', placeholder: 'Ex: Livro de Cálculo Vol. 1', required: true, maxLength: 80 });
  fields.push({ type: 'textarea', name: 'descricao', label: 'Descrição', placeholder: 'Descreva com detalhes…', required: true, rows: 4, maxLength: 2000 });

  if (moduleKey === 'compra-venda') {
    const acao = selections.acao;
    fields.push({ type: 'text', name: 'localizacao', label: 'Localização', placeholder: 'Ex: Campus Samambaia', required: false });

    if (acao === 'vendo') {
      fields.push({ ...moneyFieldMeta, name: 'preco', label: 'Preço (R$)', placeholder: '0,00', required: true });
      fields.push({ type: 'select', name: 'condicao', label: 'Condição', required: true, options: ['Novo', 'Semi-novo', 'Usado'] });
    } else {
      fields.push({ ...moneyFieldMeta, name: 'preco', label: 'Orçamento (opcional)', placeholder: '0,00', required: false });
    }
  }

  if (moduleKey === 'caronas') {
    fields.push({ type: 'text', name: 'origem', label: 'Origem', placeholder: 'Ex: Campus Samambaia', required: true });
    fields.push({ type: 'text', name: 'destino', label: 'Destino', placeholder: 'Ex: Centro', required: true });
    fields.push({ type: 'text', name: 'horario', label: 'Horário', placeholder: 'Ex: 18h30', required: false });
    fields.push({ ...moneyFieldMeta, name: 'contribuicao', label: 'Contribuição (opcional)', placeholder: 'Ex: 5,00', required: false });
    if (selections.tipo === 'ofereco') {
      fields.push({ type: 'number', name: 'vagas', label: 'Vagas', placeholder: '2', required: false, min: 1, max: 8 });
    }
  }

  if (moduleKey === 'moradia') {
    const t = selections.tipo;
    if (t === 'procurando') {
      fields.push({ type: 'text', name: 'regiao', label: 'Região desejada', placeholder: 'Ex: Setor Universitário', required: true });
      fields.push({ ...moneyFieldMeta, name: 'orcamento', label: 'Orçamento máximo (opcional)', placeholder: 'Ex: 800,00', required: false });
    } else {
      fields.push({ type: 'text', name: 'localizacao', label: 'Localização', placeholder: 'Ex: Setor Universitário', required: true });
      fields.push({ ...moneyFieldMeta, name: 'preco', label: 'Valor mensal (R$)', placeholder: '0,00', required: true });
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
      fields.push({ ...moneyFieldMeta, name: 'preco', label: 'Valor (opcional)', placeholder: '0,00', required: false });
    }
  }

  if (moduleKey === 'achados-perdidos') {
    fields.push({ type: 'text', name: 'localizacao', label: 'Local (onde foi perdido/encontrado)', placeholder: 'Ex: Biblioteca Central', required: true });
    if (selections.status === 'perdidos') {
      fields.push({ ...moneyFieldMeta, name: 'recompensa', label: 'Recompensa (opcional)', placeholder: 'Ex: 20,00', required: false });
    } else {
      fields.push({ type: 'text', name: 'entrega', label: 'Onde retirar/entregar', placeholder: 'Ex: Portaria do Bloco B', required: true });
    }
  }

  if (moduleKey === 'oportunidades') {
    fields.push({
      type: 'opportunity-area',
      name: 'areaAtuacao',
      label: 'Área',
      placeholder: 'Ex: Educação',
      required: true,
      options: kcGetOpportunityAreaOptions(),
    });
    fields.push({
      type: 'select',
      name: 'modalidadeTrabalho',
      label: 'Modalidade',
      required: true,
      options: ['Remoto', 'Híbrido', 'Presencial']
    });
    if (kcNormalizeOpportunityTypeKey(selections.tipo) === 'emprego') {
      fields.push({
        type: 'select',
        name: 'regimeContratacao',
        label: 'Regime/Vínculo',
        required: true,
        options: ['CLT', 'PJ', 'Temporário', 'Jovem Aprendiz']
      });
    }
    fields.push({ type: 'text', name: 'localizacao', label: 'Cidade/Campus (opcional)', placeholder: 'Ex: Goiânia / Campus Samambaia', required: false });
    fields.push({ ...moneyFieldMeta, name: 'remuneracao', label: 'Remuneração (opcional)', placeholder: 'Ex: 1200,00', required: false });
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

  // Modo edição: ajusta título e botão, oculta seleção de módulo
  const titleEl = overlay.querySelector('#kcCreateModalTitle');
  const stepEl = overlay.querySelector('.kc-create-step');
  if (kcCreateState.editMode) {
    if (titleEl) titleEl.innerHTML = '<i class="fas fa-pen-to-square"></i> Alterar Publicação';
    if (stepEl) stepEl.style.display = 'none';
  } else {
    if (titleEl) titleEl.innerHTML = '<i class="fas fa-plus-circle"></i> Nova Publicação';
    if (stepEl) stepEl.style.display = '';
  }

  // módulo grid (oculto no modo edição)
  if (grid) {
    if (kcCreateState.editMode) {
      grid.innerHTML = '';
    } else {
      grid.innerHTML = '';
      Object.keys(KC_CREATE_SCHEMA).forEach((key) => {
        const schema = KC_CREATE_SCHEMA[key];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'kc-create-cat-btn' + (kcCreateState.moduleKey === key ? ' active' : '');
        btn.setAttribute('data-kc-module', key);
        btn.innerHTML = `
          <i class="${schema.icon}"></i>
          <span>${escHtml(schema.label.replace(' na UFG', ''))}</span>
        `;
        grid.appendChild(btn);
      });
    }
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
      parts.push(`<div class="kc-create-group"><div class="kc-create-group__head"><span>${escHtml(g.label)}${g.required ? ' *' : ''}</span></div><div class="kc-chip-row">`);
      g.options.forEach((opt) => {
        const active = selectedKey === opt.key ? ' active' : '';
        parts.push(`<button type="button" class="kc-chip${active}" data-kc-group="${escHtml(g.id)}" data-kc-chip="${escHtml(opt.key)}">${escHtml(opt.label)}</button>`);
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
    const label = escHtml(f.label);
    const id = 'kcField_' + f.name;
    if (f.type === 'textarea') {
      const maxlength = (f.maxLength != null) ? `maxlength="${escHtml(f.maxLength)}"` : '';
      parts.push(`
        <div class="kc-field">
          <label for="${id}">${label}${f.required ? ' *' : ''}</label>
          <textarea id="${id}" name="${escHtml(f.name)}" rows="${f.rows || 4}" placeholder="${escHtml(f.placeholder || '')}" ${required} ${maxlength}>${escHtml(val || '')}</textarea>
        </div>
      `);
    } else if (f.type === 'opportunity-area') {
      const suggestions = (Array.isArray(f.options) ? f.options : []).map((opt) => `
        <button type="button" class="kc-field-pill" data-kc-area-suggestion="${escHtml(opt.label)}">
          <i class="${escHtml(opt.icon || 'fas fa-briefcase')}"></i>
          <span>${escHtml(opt.label)}</span>
        </button>
      `).join('');
      const listItems = (Array.isArray(f.options) ? f.options : []).map((opt) => `
        <option value="${escHtml(opt.label)}"></option>
      `).join('');
      parts.push(`
        <div class="kc-field kc-field--opportunity-area">
          <label for="${id}">${label}${f.required ? ' *' : ''}</label>
          <input id="${id}" name="${escHtml(f.name)}" type="text" placeholder="${escHtml(f.placeholder || '')}" value="${escHtml(val || '')}" list="kcOpportunityAreaOptions" data-kc-opportunity-area-input="true" ${required} />
          <datalist id="kcOpportunityAreaOptions">${listItems}</datalist>
          <div class="kc-field-pill-row">${suggestions}</div>
          <small class="kc-field-hint">Escolha uma sugestão ou digite outra área. O sistema corrige variações como "eduucacão" para "Educação".</small>
        </div>
      `);
    } else if (f.type === 'select') {
      const opts = (f.options || []).map(o => {
        const isSel = String(val || '') === String(o);
        return `<option value="${escHtml(o)}" ${isSel ? 'selected' : ''}>${escHtml(o)}</option>`;
      }).join('');
      parts.push(`
        <div class="kc-field">
          <label for="${id}">${label}${f.required ? ' *' : ''}</label>
          <select id="${id}" name="${escHtml(f.name)}" ${required}>
            <option value="" ${!val ? 'selected' : ''} disabled>Selecione...</option>
            ${opts}
          </select>
        </div>
      `);
    } else if (f.type === 'checkbox') {
      const checked = val === true || val === 'true' ? 'checked' : '';
      parts.push(`
        <label class="kc-check" for="${id}">
          <input id="${id}" name="${escHtml(f.name)}" type="checkbox" ${checked} />
          <span>${label}</span>
        </label>
      `);
    } else {
      const type = escHtml(f.type);
      const placeholder = escHtml(f.placeholder || '');
      const valueAttr = (val != null && f.type !== 'file') ? `value="${escHtml(val)}"` : '';
      const min = (f.min != null) ? `min="${escHtml(f.min)}"` : '';
      const max = (f.max != null) ? `max="${escHtml(f.max)}"` : '';
      const maxlength = (f.maxLength != null) ? `maxlength="${escHtml(f.maxLength)}"` : '';
      const step = (f.step != null) ? `step="${escHtml(f.step)}"` : '';
      const inputmode = f.inputmode ? `inputmode="${escHtml(f.inputmode)}"` : '';
      const pattern = f.pattern ? `pattern="${escHtml(f.pattern)}"` : '';
      parts.push(`
        <div class="kc-field">
          <label for="${id}">${label}${f.required ? ' *' : ''}</label>
          <input id="${id}" name="${escHtml(f.name)}" type="${type}" placeholder="${placeholder}" ${valueAttr} ${required} ${min} ${max} ${maxlength} ${step} ${inputmode} ${pattern} />
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

  // Texto do botão de submit (edição vs criação)
  if (submitBtn) {
    submitBtn.textContent = kcCreateState.editMode ? 'Salvar Alterações' : 'Publicar Agora';
    // P0-A fix: botão sempre habilitado; kcHandleCreateSubmit valida e exibe toast
    submitBtn.disabled = false;
  }
}

function kcOpenCreatePostModal(prefModuleKey) {
  try {
    kcEnsureCreateModal();
  } catch (err) {
    console.error('[KinoCampus] Falha ao preparar modal de criação.', err);
    showToast('Não foi possível abrir o formulário agora.', 'error', 2600);
    return false;
  }
  kcLastFocus = document.activeElement;

  if (prefModuleKey && KC_CREATE_SCHEMA[prefModuleKey]) kcCreateState.moduleKey = prefModuleKey;

  kcCreateState.open = true;
  const overlay = document.getElementById(KC_CREATE_MODAL_ID);
  if (!overlay) return;

  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('kc-modal-open');

  try {
    kcRenderCreateModal();
  } catch (err) {
    console.error('[KinoCampus] Erro ao renderizar modal de criação.', err);
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('kc-modal-open');
    showToast('Não foi possível abrir o formulário agora.', 'error', 2800);
    return false;
  }

  // foco no fechar
  const closeBtn = overlay.querySelector('.kc-create-modal__close');
  if (closeBtn) closeBtn.focus();
  return true;
}

function kcCloseCreatePostModal() {
  const overlay = document.getElementById(KC_CREATE_MODAL_ID);
  if (!overlay) return;
  kcCreateState.open = false;
  // Reset edit state
  kcCreateState.editMode = false;
  kcCreateState.editPostId = null;
  kcCreateState.editCallback = null;
  overlay.classList.remove('active');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('kc-modal-open');

  if (kcLastFocus && typeof kcLastFocus.focus === 'function') {
    try { kcLastFocus.focus(); } catch { }
  }
}

/**
 * kcOpenEditPostModal — abre o kc-create-modal preenchido com os dados do post.
 * @param {object} post     Dados normalizados do post (KCPostModel)
 * @param {function} callback  Chamado com os dados atualizados após salvar
 */
function kcOpenEditPostModal(post, callback) {
  if (!post) return;
  kcEnsureCreateModal();
  kcLastFocus = document.activeElement;

  const moduleKey = post.modulo || post.module || '';
  const schema = KC_CREATE_SCHEMA[moduleKey];
  const md = (post.metadata && typeof post.metadata === 'object') ? post.metadata : {};

  // ── State ──
  kcCreateState.moduleKey = moduleKey;
  kcCreateState.editMode = true;
  kcCreateState.editPostId = String(post.uuid || post.id || post.legacyId || '');
  kcCreateState.editCallback = typeof callback === 'function' ? callback : null;
  kcCreateState.open = true;

  // ── Seleções (tags) ──
  kcCreateState.selections = {};
  if (schema) {
    (schema.tagGroups || []).forEach((g) => {
      // Tenta encontrar o valor correspondente nos dados do post
      let key = '';
      if (g.id === schema.categoryGroupId) {
        key = post.categoriaKey || post.categoria || md.categoriaKey || md.categoria || '';
        if (moduleKey === 'oportunidades') key = kcGetOpportunityTypeOptionKey(key);
      } else if (g.id === 'acao') {
        key = post.subcategoriaKey || md.actionKey || md.subcategoriaKey || '';
      } else {
        key = kcCreateState.selections[g.id] || post[g.id] || md[g.id] || md.subcategoriaKey || '';
      }
      // Valida que a key existe nas opções do grupo
      if (key && g.options && g.options.some((o) => o.key === key)) {
        kcCreateState.selections[g.id] = key;
      }
    });
  }

  // ── Valores dos campos ──
  kcCreateState.values = {
    titulo: post.titulo || post.title || '',
    descricao: post.descricao || post.description || '',
    preco: post.preco != null ? String(post.preco) : '',
    localizacao: post.location || post.localizacao || md.localizacao || '',
    condicao: post.condicao || md.condicao || '',
    sustentavel: !!(post.sustentavel || post.sustainable || md.sustentavel),
    // Campos de módulos específicos (extraídos de metadata)
    origem: md.origem || '',
    destino: md.destino || '',
    horario: md.horario || '',
    vagas: md.vagas || '',
    data: md.data || '',
    hora: md.hora || '',
    link: md.link || '',
    gratuito: md.gratuito || false,
    contato: md.contato || '',
    remuneracao: md.remuneracao || '',
    areaAtuacao: md.areaLabel || md.area || post.subcategoriaLabel || post.subcategoria || '',
    modalidadeTrabalho: md.workModeLabel || md.modalidadeTrabalho || (md.workMode ? kcResolveOpportunityWorkMode(md.workMode).label : '') || '',
    regimeContratacao: md.employmentTypeLabel || md.regimeContratacao || (md.employmentType ? kcResolveOpportunityRegime(md.employmentType).label : '') || '',
    recompensa: md.recompensa || '',
    contribuicao: md.contribuicao || '',
    orcamento: md.orcamento || '',
  };

  // ── Imagens existentes ──
  const existingImgs = Array.isArray(post.imagens) ? post.imagens
    : (Array.isArray(post.images) ? post.images : []);
  kcCreateState.images = existingImgs
    .filter(Boolean)
    .map((url, idx) => ({
      id: 'existing_' + idx,
      dataUrl: String(url),
      name: 'imagem_' + (idx + 1) + '.jpg',
      size: 0,
      isExisting: true,
    }));
  kcCreateState.coverImageId = kcCreateState.images.length > 0 ? kcCreateState.images[0].id : null;

  // ── Abre o overlay ──
  const overlay = document.getElementById(KC_CREATE_MODAL_ID);
  if (!overlay) return;
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('kc-modal-open');

  kcRenderCreateModal();

  // Foco no botão fechar
  const closeBtn = overlay.querySelector('.kc-create-modal__close');
  if (closeBtn) closeBtn.focus();
}
window.kcOpenEditPostModal = kcOpenEditPostModal;

async function kcHandleCreateSubmit() {
  if (kcCreateState.submitting === true) return;

  kcCaptureCreateValues();
  const form = document.getElementById('kcCreatePostForm');
  const submitBtn = form ? form.querySelector('.kc-create-submit') : null;
  const originalSubmitText = submitBtn ? submitBtn.textContent : '';

  kcCreateState.submitting = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = kcCreateState.editMode ? 'Salvando...' : 'Publicando...';
  }

  try {
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

    if (form) {
      const titleInput = form.querySelector('input[name="titulo"]');
      const descInput = form.querySelector('textarea[name="descricao"]');

      if (titleInput && typeof titleInput.setCustomValidity === 'function') {
        titleInput.setCustomValidity(String(titleInput.value || '').trim() ? '' : 'Informe um título válido.');
      }
      if (descInput && typeof descInput.setCustomValidity === 'function') {
        const normalizedDesc = String(descInput.value || '').trim();
        if (!normalizedDesc) {
          descInput.setCustomValidity('Informe uma descrição válida.');
        } else if (normalizedDesc.length > 2000) {
          descInput.setCustomValidity('A descrição deve ter no máximo 2000 caracteres.');
        } else {
          descInput.setCustomValidity('');
        }
      }

      const moneyFields = ['preco', 'orcamento', 'recompensa', 'contribuicao', 'remuneracao'];
      moneyFields.forEach((name) => {
        const input = form.querySelector(`input[name="${name}"]`);
        if (!input || typeof input.setCustomValidity !== 'function') return;

        const raw = String(kcCreateState.values[name] || '').trim();
        if (!raw) {
          input.setCustomValidity('');
          return;
        }

        const normalized = kcNormalizeMoneyInput(raw);
        if (normalized == null) {
          input.setCustomValidity('Informe um valor numérico válido (ex.: 10,00).');
          return;
        }

        input.setCustomValidity('');
        input.value = normalized;
        kcCreateState.values[name] = normalized;
      });

      if (!form.checkValidity()) {
        form.reportValidity();
        showToast('Revise os campos destacados e tente novamente.', 'warn', 2600);
        return;
      }
    }

    const title = String(kcCreateState.values.titulo || '').trim();
    const desc = String(kcCreateState.values.descricao || '').trim();
    if (!title || !desc) {
      // Fallback defensivo para payload em caso de DOM inconsistente.
      showToast('Revise os campos destacados e tente novamente.', 'warn', 2600);
      return;
    }

    const categoryGroupId = schema.categoryGroupId;
    const rawCatKey = categoryGroupId ? kcCreateState.selections[categoryGroupId] : '';
    const isOpportunity = kcCreateState.moduleKey === 'oportunidades';
    const catKey = isOpportunity ? kcNormalizeOpportunityTypeKey(rawCatKey) : rawCatKey;
    const catLabel = rawCatKey ? kcTagLabel(schema, categoryGroupId, rawCatKey) : '';

    // subcategoria: tenta usar 2º grupo (quando existir)
    const otherGroups = (schema.tagGroups || []).filter(g => g.id !== categoryGroupId);
    const subKey = otherGroups.length ? kcCreateState.selections[otherGroups[0].id] : '';
    const subLabel = subKey ? kcTagLabel(schema, otherGroups[0].id, subKey) : '';

    // V8.1.2.4.5: Compra e Venda usa tabs por *categoria* (eletronicos, livros...),
    // mas o 2º grupo do formulário é 'ação' (vendo/compro...).
    // - Persistimos a ação em subcategoria/subcategoriaKey (UI)
    // - Persistimos o filtro de sub-módulo em metadata.subcategory (key da categoria)
    const isCompraVenda = kcCreateState.moduleKey === 'compra-venda';
    const actionKey = isCompraVenda ? (subKey || '') : '';
    const actionLabel = isCompraVenda ? (subLabel || '') : '';
    let filterSubKey = isCompraVenda ? (catKey || '') : (subKey || '');
    let filterSubLabel = isCompraVenda ? (catLabel || '') : (subLabel || '');
    let finalSubKey = isCompraVenda ? (actionKey || '') : (subKey || '');
    let finalSubLabel = isCompraVenda ? (actionLabel || '') : (subLabel || '');

    const opportunityArea = isOpportunity
      ? kcResolveOpportunityAreaValue(
        kcCreateState.values.areaAtuacao || subLabel || subKey || '',
        `${title} ${desc} ${kcCreateState.values.localizacao || ''}`
      )
      : { key: '', label: '', icon: '' };
    if (isOpportunity) {
      finalSubKey = opportunityArea.key || '';
      finalSubLabel = opportunityArea.label || '';
      filterSubKey = opportunityArea.key || '';
      filterSubLabel = opportunityArea.label || '';
      if (opportunityArea.label) kcCreateState.values.areaAtuacao = opportunityArea.label;
    }

    const tagMap = new Map();
    Object.entries(kcCreateState.selections).forEach(([gid, key]) => {
      if (!key) return;
      const normalizedKey = (isOpportunity && gid === categoryGroupId) ? kcNormalizeOpportunityTypeKey(key) : key;
      const labelForTag = kcTagLabel(schema, gid, key);
      if (normalizedKey && !tagMap.has(normalizedKey)) tagMap.set(normalizedKey, labelForTag || normalizedKey);
    });

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

    const opportunityTypeKey = isOpportunity ? kcNormalizeOpportunityTypeKey(rawCatKey) : '';
    const opportunityUsesRegime = opportunityTypeKey === 'emprego';
    const opportunityWorkMode = isOpportunity
      ? kcResolveOpportunityWorkMode(kcCreateState.values.modalidadeTrabalho || '')
      : { key: '', label: '' };
    const opportunityRegime = (isOpportunity && opportunityUsesRegime)
      ? kcResolveOpportunityRegime(kcCreateState.values.regimeContratacao || '')
      : { key: '', label: '' };

    if (isOpportunity) {
      const remunValue = kcParseBRLNumber(kcCreateState.values.remuneracao);
      if (remunValue != null) preco = remunValue;

      const remunText = String(kcCreateState.values.remuneracao || '').trim();
      if (remunText) {
        const suffix = opportunityTypeKey === 'freelancer' ? '/projeto' : '/mês';
        precoTexto = 'R$ ' + remunText + suffix;
      }

      if (opportunityArea.key && !tagMap.has(opportunityArea.key)) {
        tagMap.set(opportunityArea.key, opportunityArea.label || opportunityArea.key);
      }
      if (opportunityWorkMode.key) {
        if (!tagMap.has(opportunityWorkMode.key)) tagMap.set(opportunityWorkMode.key, opportunityWorkMode.label || opportunityWorkMode.key);
        if (opportunityWorkMode.key === 'hibrido') {
          if (!tagMap.has('remoto')) tagMap.set('remoto', 'Remoto');
          if (!tagMap.has('presencial')) tagMap.set('presencial', 'Presencial');
        }
      }
      if (opportunityRegime.key && !tagMap.has(opportunityRegime.key)) {
        tagMap.set(opportunityRegime.key, opportunityRegime.label || opportunityRegime.key);
      }
    }

    const tagKeys = Array.from(tagMap.keys()).filter(Boolean);
    const tagLabels = Array.from(tagMap.values()).filter(Boolean);

    const imagens = kcGetOrderedCreateImages();

    // Payload do formulário (contrato legado) - o driver decide como persistir.
    // IMPORTANTE: categoria/subcategoria devem ser persistidos como *keys* para
    // permitir filtros por sub-módulo (ex: Eletrônicos) sem depender de acentos.
    const payload = {
      modulo: kcCreateState.moduleKey,
      moduloLabel: schema.label,

      // categoria/subcategoria (compat: mantém label e key)
      categoria: catKey || (catLabel || ''),
      categoriaLabel: catLabel || '',
      categoriaKey: catKey || '',

      // subcategoria (UI): em compra-venda, isso representa a *ação* (vendo/compro)
      subcategoria: finalSubKey || (finalSubLabel || ''),
      subcategoriaLabel: finalSubLabel || '',
      subcategoriaKey: finalSubKey || '',

      // tags (UI)
      tags: tagLabels,
      tagKeys,

      // conteúdo
      titulo: title,
      descricao: desc,
      preco,
      precoTexto,
      condicao: kcCreateState.values.condicao ? String(kcCreateState.values.condicao) : '',
      localizacao: kcCreateState.values.localizacao ? String(kcCreateState.values.localizacao) : '',
      area: isOpportunity ? (opportunityArea.label || '') : '',
      areaKey: isOpportunity ? (opportunityArea.key || '') : '',
      modalidadeTrabalho: isOpportunity ? (opportunityWorkMode.label || '') : '',
      regimeContratacao: (isOpportunity && opportunityUsesRegime) ? (opportunityRegime.label || '') : '',
      contato: kcCreateState.values.contato ? String(kcCreateState.values.contato) : '',
      remuneracao: kcCreateState.values.remuneracao ? String(kcCreateState.values.remuneracao) : '',

      // flags
      verificado: false,
      emoji: schema.emoji,
      imagens,
      sustentavel: !!kcCreateState.values.sustentavel,

      // metadata (modo local e Supabase): usado para filtros JSONB
      metadata: {
        // subcategory (filtro): chave esperada pelos controllers (.eq('metadata->>subcategory', ...))
        subcategory: filterSubKey || '',
        subcategoryLabel: filterSubLabel || '',

        // categoria principal (UI + filtros)
        categoria: catLabel || '',
        categoriaKey: catKey || '',

        // ação/subcategoria (UI)
        subcategoria: finalSubLabel || '',
        subcategoriaKey: finalSubKey || '',

        // compra-venda: guardar ação explicitamente (útil para futuras buscas e edição)
        actionKey: actionKey || '',
        actionLabel: actionLabel || '',
        area: isOpportunity ? (opportunityArea.label || '') : '',
        areaLabel: isOpportunity ? (opportunityArea.label || '') : '',
        areaKey: isOpportunity ? (opportunityArea.key || '') : '',
        workMode: isOpportunity ? (opportunityWorkMode.key || '') : '',
        workModeLabel: isOpportunity ? (opportunityWorkMode.label || '') : '',
        employmentType: (isOpportunity && opportunityUsesRegime) ? (opportunityRegime.key || '') : '',
        employmentTypeLabel: (isOpportunity && opportunityUsesRegime) ? (opportunityRegime.label || '') : '',
        regimeContratacao: (isOpportunity && opportunityUsesRegime) ? (opportunityRegime.label || '') : '',
        contato: kcCreateState.values.contato ? String(kcCreateState.values.contato) : '',
        remuneracao: kcCreateState.values.remuneracao ? String(kcCreateState.values.remuneracao) : '',
        modalidadeTrabalho: kcCreateState.values.modalidadeTrabalho ? String(kcCreateState.values.modalidadeTrabalho) : '',
      },
    };

    // ── MODO EDIÇÃO ──────────────────────────────────────────────────────────
    if (kcCreateState.editMode && kcCreateState.editPostId) {
      if (submitBtn) submitBtn.textContent = 'Salvando...';
      showToast('Salvando alterações...', 'info', 1600);

      let editRes = null;
      try {
        if (window.KCAPI && typeof window.KCAPI.updatePost === 'function') {
          editRes = await window.KCAPI.updatePost(kcCreateState.editPostId, payload);
        } else {
          editRes = { ok: false, error: { message: 'Edição não suportada neste ambiente.' } };
        }
      } catch (err) {
        editRes = { ok: false, error: { message: (err && err.message) ? String(err.message) : 'Erro inesperado ao salvar.' } };
      }

      if (editRes && editRes.ok) {
        showToast('Publicação atualizada com sucesso!', 'success', 2200);
        const editCb = kcCreateState.editCallback;
        const editedData = editRes.data;
        kcCloseCreatePostModal(); // também zera editMode / editCallback
        if (typeof editCb === 'function') editCb(editedData);
        return;
      }

      const editErrMsg = (editRes && editRes.error && editRes.error.message)
        ? String(editRes.error.message)
        : 'Não foi possível atualizar a publicação.';
      showToast(editErrMsg, 'error', 2800);
      return;
    }
    // ── FIM MODO EDIÇÃO ───────────────────────────────────────────────────────

    const hasApiCreatePost = !!((window.KCActions && typeof window.KCActions.createPost === 'function') || (window.KCAPI && typeof window.KCAPI.createPost === 'function'));
    const useSupabase = !!(window.KCAPI && window.KCAPI.activeDriver === 'supabase' && hasApiCreatePost);
    const blockLocalCriticalPersistence = isProductionRuntime() && !useSupabase;
    let post = null;
    let createError = null;

    const apiCreateFn = (window.KCActions && typeof window.KCActions.createPost === 'function') ? window.KCActions.createPost : (window.KCAPI ? window.KCAPI.createPost : null);

    if (useSupabase) {
      // Exige autenticação no driver Supabase (RLS)
      let user = null;
      try {
        if (typeof window.KCAPI.getCurrentUser === 'function') user = await window.KCAPI.getCurrentUser();
      } catch (_) { }

      if (!user) {
        showToast('Faça login para publicar.', 'warn', 2600);
        // V8.1.3.2.1: não abre o modal automaticamente; direciona o usuário ao botão de Login/Cadastro.
        try {
          const btn = document.querySelector('a.btn-login') || document.querySelector('a[href="#login"]');
          if (btn) {
            btn.classList.add('kc-attention');
            try { btn.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) { }
            try { btn.focus(); } catch (_) { }
            setTimeout(() => btn.classList.remove('kc-attention'), 900);
          }
        } catch (_) { }
        return;
      }

      showToast('Publicando...', 'info', 1600);
      try {
        post = await apiCreateFn(payload);
        if (post && post.ok === false && post.error) {
          createError = post.error;
          post = null;
        }
      } catch (err) {
        console.error('[KinoCampus] Exceção ao criar publicação (supabase):', {
          payload,
          error: err,
        });
        createError = {
          code: 'CREATE_POST_EXCEPTION',
          message: (err && err.message) ? String(err.message) : 'Erro inesperado ao publicar.',
        };
        post = null;
      }

      if (!post) {
        console.error('[KinoCampus] Falha ao criar publicação (supabase) sem retorno de post.', {
          payload,
          createError,
        });
        try {
          if (window.KCAPI && typeof window.KCAPI.getLastCreatePostError === 'function') {
            const createErr = window.KCAPI.getLastCreatePostError();
            console.error('[KinoCampus] createPost retornou null. Diagnóstico:', createErr);
          }
        } catch (_) { }
        const feedbackMessage = (createError && createError.message)
          ? String(createError.message)
          : 'Não foi possível publicar agora. Tente novamente.';
        showToast(feedbackMessage, 'error', 2800);
        return;
      }
    } else {
      if (blockLocalCriticalPersistence) {
        showToast('Publicação bloqueada: em produção, o driver Supabase é obrigatório.', 'error', 3200);
        return;
      }

      // Modo local/offline-first (default): só confirma sucesso após persistência efetiva.
      try {
        if (hasApiCreatePost) {
          post = await apiCreateFn(payload);
        } else {
          post = kcCreateUserPost(payload);
        }
        if (post && post.ok === false && post.error) {
          createError = post.error;
          post = null;
        }
      } catch (err) {
        console.error('[KinoCampus] Exceção no modo local ao criar publicação:', {
          payload,
          error: err,
        });
        createError = {
          code: 'LOCAL_CREATE_POST_EXCEPTION',
          message: (err && err.message) ? String(err.message) : 'Erro inesperado ao salvar publicação.',
        };
        post = null;
      }

      if (!post) {
        console.error('[KinoCampus] Falha ao criar publicação no modo local sem retorno de post.', {
          payload,
          createError,
        });
        const feedbackMessage = (createError && createError.message)
          ? String(createError.message)
          : 'Não foi possível salvar sua publicação no dispositivo.';
        showToast(feedbackMessage, 'error', 3200);
        return;
      }
    }

    showToast('Publicado com sucesso!', 'success', 2200);

    // Audit log: registra criação do post (fire-and-forget)
    try {
      const kcClient = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
        ? window.KCSupabase.getClient() : null;
      const postId = (post && (post.uuid || post.id || post.legacyId)) ? String(post.uuid || post.id || post.legacyId) : '';
      let actorId = null;
      try {
        if (window.KCAPI && typeof window.KCAPI.getCurrentUser === 'function') {
          const u = await window.KCAPI.getCurrentUser();
          if (u) actorId = u.id;
        }
      } catch (_) { }
      if (kcClient && actorId) {
        kcClient.from('audit_log').insert({
          action: 'post_created',
          entity_type: 'posts',
          entity_id: postId,
          actor_id: actorId,
        }).then(() => { }).catch(() => { });
      }
    } catch (_) { }

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
  } catch (err) {
    console.error('[KinoCampus] Erro inesperado no submit de criação:', err);
    showToast('Não foi possível publicar agora. Tente novamente.', 'error', 2800);
  } finally {
    kcCreateState.submitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalSubmitText || (kcCreateState.editMode ? 'Salvar Alterações' : 'Publicar Agora');
    }
  }
}
function kcInitCreatePostTriggers() {
  // Intercepta links e botões existentes
  document.body.addEventListener('click', (e) => {
    const trigger = e.target.closest('a[href="create-post.html"], .kc-create-btn, .kc-create-post-btn');
    if (!trigger) return;

    const href = String(trigger.getAttribute('href') || '').trim();
    const isCreateLink = href.toLowerCase().includes('create-post.html');

    // tenta inferir módulo atual pela página
    const mod = kcGetModuloFilterForPage();
    const opened = kcOpenCreatePostModal(mod || null);

    // Só bloqueia navegação se o modal abriu corretamente.
    if (opened) {
      e.preventDefault();
    } else if (isCreateLink) {
      // fallback explícito
      window.location.href = href;
    }
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
function escHtml(str) {
  return window.KCUtils.escapeHtml(str);
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

  let startX = 0;
  let startY = 0;
  let pointerId = null;
  let touchStartX = 0;
  let touchStartY = 0;
  const SWIPE_THRESHOLD = 45;
  const AXIS_LOCK_RATIO = 1.5; // horizontal deve ser 1.5x mais que vertical

  carousel.addEventListener("pointerdown", (e) => {
    // Permite iniciar swipe em qualquer área do carrossel,
    // incluindo nas proximidades dos botões prev/next.
    // A distinção tap vs. swipe é feita pelo threshold de movimento.
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    try { carousel.setPointerCapture(pointerId); } catch (_) { }
  }, { passive: true });

  carousel.addEventListener("pointerup", (e) => {
    if (pointerId == null) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    pointerId = null;

    // Só troca slide se for gesto predominantemente horizontal
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * AXIS_LOCK_RATIO) {
      changeSlide(dx < 0 ? 1 : -1);
    }
  }, { passive: true });

  carousel.addEventListener("pointercancel", () => { pointerId = null; }, { passive: true });

  carousel.addEventListener('touchstart', (e) => {
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    touchStartX = t.clientX;
    touchStartY = t.clientY;
  }, { passive: true });

  carousel.addEventListener('touchend', (e) => {
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * AXIS_LOCK_RATIO) {
      changeSlide(dx < 0 ? 1 : -1);
    }
  }, { passive: true });
}

window.showSlide = showSlide;
window.changeSlide = changeSlide;
window.goToSlide = goToSlide;
window.startAutoSlide = startAutoSlide;
window.stopAutoSlide = stopAutoSlide;
window.resetAutoSlide = resetAutoSlide;
window.kcRefreshHeroCarousel = refreshHeroCarousel;

window.showSlide = showSlide;
window.changeSlide = changeSlide;
window.goToSlide = goToSlide;
window.startAutoSlide = startAutoSlide;
window.stopAutoSlide = stopAutoSlide;
window.resetAutoSlide = resetAutoSlide;
window.kcRefreshHeroCarousel = refreshHeroCarousel;

window.showSlide = showSlide;
window.changeSlide = changeSlide;
window.goToSlide = goToSlide;
window.startAutoSlide = startAutoSlide;
window.stopAutoSlide = stopAutoSlide;
window.resetAutoSlide = resetAutoSlide;
window.kcRefreshHeroCarousel = refreshHeroCarousel;


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
  kcInitWhatsAppShare();
  kcInitImageFallbacks();

  const onResize = kcDebounce(() => {
    kcUpdateHeaderHeightVar();
    kcPolishCardsForMobile();
    kcInitImageFallbacks();
  }, 140);
  window.addEventListener("resize", onResize, { passive: true });


  // mobile menu data-* delegation
  document.body.addEventListener('click', (e) => {
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

  kcInitVotesRealtime();

  document.addEventListener('kc:authchange', () => {
    kcInitVotesRealtime();
  });

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
        try { el.setPointerCapture(e.pointerId); } catch (_) { }
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

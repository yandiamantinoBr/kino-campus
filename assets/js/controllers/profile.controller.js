/*
  KinoCampus — Profile Controller (V8.2.3.0)

  Funcionalidades:
  - Vista própria (sem ?id) e vista pública (?id=<uuid>)
  - Tabs: Atividades, Posts, Comentários
  - Stats: total de posts publicados, comentários, votos recebidos
  - Edição de nome (somente na vista própria)
  - Paginação nos posts e comentários
*/
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => (typeof window.KCUtils !== 'undefined' && window.KCUtils.escapeHtml)
    ? window.KCUtils.escapeHtml(String(s || ''))
    : String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const state = {
    user: null,
    profile: null,
    profileId: '',
    isPublicView: false,
    // dados carregados
    posts: [],
    postPage: 1,
    postStatus: '',
    postHasMore: false,
    comments: [],
    commentPage: 1,
    commentHasMore: false,
    statsLoaded: false,
    // tab ativa
    activeTab: 'activities',
  };

  const PAGE_SIZE = 12;
  const COMMENT_PAGE_SIZE = 15;

  // ──────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────

  function readProfileIdFromQuery() {
    const raw = new URLSearchParams(window.location.search).get('id');
    return String(raw || '').trim();
  }

  function safeName(profile, user) {
    return String(
      (profile && (profile.display_name || profile.full_name))
      || (user && user.email ? String(user.email).split('@')[0] : '')
      || 'Usuário'
    ).trim() || 'Usuário';
  }

  function safeHandle(profile, user) {
    const email = (profile && profile.email) || (user && user.email) || '';
    if (!email.includes('@')) return '';
    return '@' + email.split('@')[0];
  }

  function avatarUrl(profile, user) {
    if (profile && profile.avatar_url) return String(profile.avatar_url);
    const seed = (user && (user.email || user.id)) ? String(user.email || user.id) : 'kinocampus';
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed.toLowerCase())}`;
  }

  function fmtDate(iso, opts) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('pt-BR', opts || { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (_) { return '—'; }
  }

  function fmtRelative(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60)  return 'agora mesmo';
    const m = Math.floor(s / 60);
    if (m < 60)  return `há ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `há ${h}h`;
    const dy = Math.floor(h / 24);
    if (dy < 30) return `há ${dy} dia${dy > 1 ? 's' : ''}`;
    return fmtDate(iso);
  }

  function statusBadge(status) {
    const labels = { published: 'Publicado', pending: 'Pendente', hidden: 'Oculto', deleted: 'Excluído' };
    const cls = { published: 'published', pending: 'pending', hidden: 'hidden', deleted: 'deleted' };
    const s = String(status || 'published').toLowerCase();
    return `<span class="kc-status-badge kc-status-badge--${cls[s] || 'published'}">${esc(labels[s] || s)}</span>`;
  }

  function setStatus(message, tone) {
    const el = $('#profile-feedback');
    if (!el) return;
    if (!message) { el.style.display = 'none'; el.textContent = ''; el.className = 'kc-profile-feedback'; return; }
    el.style.display = 'block';
    el.textContent = message;
    el.className = `kc-profile-feedback is-${tone || 'info'}`;
  }

  function getClient() {
    if (window.KCSupabase && typeof window.KCSupabase.getClient === 'function') return window.KCSupabase.getClient();
    return null;
  }

  // ──────────────────────────────────────────────
  // Render do cabeçalho
  // ──────────────────────────────────────────────

  function renderHeader() {
    const p = state.profile || {};
    const user = state.user;

    const name = safeName(p, user);
    const handle = safeHandle(p, user);
    const verified = !!(p && p.verified === true);

    const avatar = $('#profile-avatar');
    if (avatar) avatar.src = avatarUrl(p, user);

    const nameEl = $('#profile-display-name');
    if (nameEl) nameEl.textContent = name;

    const handleEl = $('#profile-handle');
    if (handleEl) {
      if (handle) { handleEl.textContent = handle; handleEl.style.display = 'block'; }
      else handleEl.style.display = 'none';
    }

    const verifiedIcon = $('#profile-verified-icon');
    if (verifiedIcon) verifiedIcon.style.display = verified ? 'flex' : 'none';

    const memberSince = $('#profile-member-since');
    const memberDate = p && p.created_at;
    if (memberSince) {
      if (memberDate) {
        const span = memberSince.querySelector('span');
        if (span) span.textContent = 'Desde ' + fmtDate(memberDate, { month: 'short', year: 'numeric' });
        memberSince.style.display = 'inline-flex';
      } else {
        memberSince.style.display = 'none';
      }
    }

    // Editar nome: só na vista própria
    const editSection = $('#profile-edit-section');
    if (editSection) editSection.style.display = state.isPublicView ? 'none' : 'block';

    const nameInput = $('#display-name-input');
    if (nameInput) nameInput.value = p.display_name || p.full_name || '';

    // Filtro de status de posts: só na vista própria
    const postsToolbar = $('#posts-toolbar');
    if (postsToolbar) {
      const statusSelect = postsToolbar.querySelector('#profile-posts-status');
      if (statusSelect) statusSelect.style.display = state.isPublicView ? 'none' : '';
    }
  }

  // ──────────────────────────────────────────────
  // Stats
  // ──────────────────────────────────────────────

  async function loadStats(authorId) {
    if (!authorId) return;
    const client = getClient();
    if (!client) return;

    try {
      // Posts publicados
      const { count: postCount } = await client
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', authorId)
        .eq('status', 'published');

      if (typeof postCount === 'number') {
        const el = $('#stat-posts');
        if (el) el.textContent = postCount;
      }

      // Comentários feitos por este usuário
      const { count: commentCount } = await client
        .from('comments')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', authorId);

      if (typeof commentCount === 'number') {
        const el = $('#stat-comments');
        if (el) el.textContent = commentCount;
        const badge = $('#badge-comments');
        if (badge) badge.textContent = commentCount > 99 ? '99+' : commentCount;
      }

      // Votos recebidos nos posts do autor
      const { data: voteData } = await client
        .from('posts')
        .select('votos')
        .eq('author_id', authorId)
        .eq('status', 'published');

      if (Array.isArray(voteData)) {
        const totalVotes = voteData.reduce((acc, p) => acc + (Number(p.votos) || 0), 0);
        const el = $('#stat-votes');
        if (el) el.textContent = totalVotes;
      }

    } catch (e) {
      console.warn('[Profile] loadStats:', e);
    }
  }

  // ──────────────────────────────────────────────
  // Posts
  // ──────────────────────────────────────────────

  async function loadPosts(reset) {
    const loadingEl = $('#posts-loading');
    const listEl    = $('#posts-list');
    const emptyEl   = $('#posts-empty');
    const moreBtn   = $('#posts-load-more');

    if (reset) {
      state.postPage = 1;
      state.posts = [];
      if (listEl) listEl.innerHTML = '';
    }

    if (loadingEl) loadingEl.style.display = 'block';
    if (emptyEl)   emptyEl.style.display   = 'none';
    if (moreBtn)   moreBtn.style.display   = 'none';

    try {
      const params = { page: state.postPage, limit: PAGE_SIZE };
      if (!state.isPublicView && state.postStatus) params.status = state.postStatus;

      const newPosts = state.isPublicView
        ? await window.KCAPI.getPostsByAuthorId(state.profileId, params)
        : await window.KCAPI.getMyPosts(params);

      if (Array.isArray(newPosts)) {
        state.posts = reset ? newPosts : [...state.posts, ...newPosts];
        state.postHasMore = newPosts.length >= PAGE_SIZE;
      }

      // Badge
      if (reset) {
        const badge = $('#badge-posts');
        if (badge) badge.textContent = state.posts.length > 99 ? '99+' : state.posts.length;
      }

      renderPosts(reset ? state.posts : newPosts, !reset);

    } catch (e) {
      console.warn('[Profile] loadPosts:', e);
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  function renderPosts(posts, append) {
    const listEl  = $('#posts-list');
    const emptyEl = $('#posts-empty');
    const moreBtn = $('#posts-load-more');
    if (!listEl) return;

    if (!append) listEl.innerHTML = '';

    if (!Array.isArray(posts) || posts.length === 0) {
      if (!append && (!state.posts || !state.posts.length)) {
        if (emptyEl) emptyEl.style.display = 'block';
      }
      if (moreBtn) moreBtn.style.display = 'none';
      return;
    }

    posts.forEach(post => {
      const link = document.createElement('a');
      link.className = 'kc-profile-post-card';
      link.href = `product.html?id=${encodeURIComponent(post.uuid || post.id || '')}`;
      const status = String(post.status || 'published').toLowerCase();
      link.innerHTML = `
        <div class="kc-profile-post-card__title">${esc(post.title || 'Sem título')}</div>
        <div class="kc-profile-post-card__meta">
          ${statusBadge(status)}
          ${post.module ? `<span><i class="fas fa-layer-group"></i> ${esc(post.module)}</span>` : ''}
          ${post.category ? `<span>${esc(post.category)}</span>` : ''}
          <span><i class="fas fa-clock"></i> ${fmtRelative(post.created_at)}</span>
        </div>`;
      listEl.appendChild(link);
    });

    if (moreBtn) moreBtn.style.display = state.postHasMore ? 'block' : 'none';
  }

  // ──────────────────────────────────────────────
  // Comentários
  // ──────────────────────────────────────────────

  async function loadComments(reset) {
    const loadingEl = $('#comments-loading');
    const listEl    = $('#comments-list');
    const emptyEl   = $('#comments-empty');
    const moreBtn   = $('#comments-load-more');

    if (reset) {
      state.commentPage = 1;
      state.comments = [];
      if (listEl) listEl.innerHTML = '';
    }

    if (loadingEl) loadingEl.style.display = 'block';
    if (emptyEl)   emptyEl.style.display   = 'none';
    if (moreBtn)   moreBtn.style.display   = 'none';

    const client = getClient();
    if (!client) { if (loadingEl) loadingEl.style.display = 'none'; return; }

    const authorId = state.profileId || (state.user && state.user.id);
    if (!authorId) { if (loadingEl) loadingEl.style.display = 'none'; return; }

    try {
      const from = (state.commentPage - 1) * COMMENT_PAGE_SIZE;
      const to   = from + COMMENT_PAGE_SIZE - 1;

      // Busca comentários do usuário com info do post
      const { data, error } = await client
        .from('comments')
        .select('id, created_at, body, post_id, post:posts!comments_post_id_fkey(id, legacy_id, title, titulo)')
        .eq('author_id', authorId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        // fallback sem join
        const { data: d2 } = await client
          .from('comments')
          .select('id, created_at, body, post_id')
          .eq('author_id', authorId)
          .order('created_at', { ascending: false })
          .range(from, to);
        state.comments = reset ? (d2 || []) : [...state.comments, ...(d2 || [])];
        state.commentHasMore = (d2 || []).length >= COMMENT_PAGE_SIZE;
      } else {
        state.comments = reset ? (data || []) : [...state.comments, ...(data || [])];
        state.commentHasMore = (data || []).length >= COMMENT_PAGE_SIZE;
      }

      renderComments(reset ? state.comments : (data || []), !reset);

    } catch (e) {
      console.warn('[Profile] loadComments:', e);
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  function renderComments(comments, append) {
    const listEl  = $('#comments-list');
    const emptyEl = $('#comments-empty');
    const moreBtn = $('#comments-load-more');
    if (!listEl) return;

    if (!append) listEl.innerHTML = '';

    if (!Array.isArray(comments) || comments.length === 0) {
      if (!append && (!state.comments || !state.comments.length)) {
        if (emptyEl) emptyEl.style.display = 'block';
      }
      if (moreBtn) moreBtn.style.display = 'none';
      return;
    }

    comments.forEach(c => {
      const card = document.createElement('div');
      card.className = 'kc-profile-comment-card';

      const post = c.post || {};
      const postTitle = post.title || post.titulo || 'Post';
      const postId = post.id || c.post_id || '';
      const postLegacyId = post.legacy_id || postId;
      const postUrl = `product.html?id=${encodeURIComponent(postLegacyId || postId)}`;

      card.innerHTML = `
        <div class="kc-profile-comment-card__body">${esc(c.body || '')}</div>
        <div class="kc-profile-comment-card__meta">
          <span><i class="fas fa-clock"></i> ${fmtRelative(c.created_at)}</span>
          ${postId ? `<span>em <a class="kc-profile-comment-card__post-link" href="${esc(postUrl)}">${esc(postTitle)}</a></span>` : ''}
        </div>`;
      listEl.appendChild(card);
    });

    if (moreBtn) moreBtn.style.display = state.commentHasMore ? 'block' : 'none';
  }

  // ──────────────────────────────────────────────
  // Atividades (feed misto: posts + comentários)
  // ──────────────────────────────────────────────

  async function loadActivities() {
    const loadingEl = $('#activities-loading');
    const listEl    = $('#activities-list');
    const emptyEl   = $('#activities-empty');
    if (loadingEl) loadingEl.style.display = 'block';
    if (listEl)    listEl.innerHTML = '';

    const authorId = state.profileId || (state.user && state.user.id);
    const client   = getClient();

    const activities = [];

    // Últimos posts
    try {
      const recentPosts = state.isPublicView
        ? await window.KCAPI.getPostsByAuthorId(authorId, { page: 1, limit: 8 })
        : await window.KCAPI.getMyPosts({ page: 1, limit: 8 });

      if (Array.isArray(recentPosts)) {
        recentPosts.forEach(p => {
          activities.push({
            type: 'post',
            date: p.created_at,
            postTitle: p.title || 'Sem título',
            postId: p.uuid || p.id,
            status: p.status,
          });
        });
      }
    } catch (_) {}

    // Últimos comentários
    if (client && authorId) {
      try {
        const { data: recentComments } = await client
          .from('comments')
          .select('id, created_at, body, post_id, post:posts!comments_post_id_fkey(id, legacy_id, title, titulo)')
          .eq('author_id', authorId)
          .order('created_at', { ascending: false })
          .limit(8);

        if (Array.isArray(recentComments)) {
          recentComments.forEach(c => {
            const post = c.post || {};
            activities.push({
              type: 'comment',
              date: c.created_at,
              body: String(c.body || '').substring(0, 120),
              postTitle: post.title || post.titulo || 'Post',
              postId: post.legacy_id || post.id || c.post_id,
            });
          });
        }
      } catch (_) {}
    }

    // Ordenar por data desc
    activities.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (loadingEl) loadingEl.style.display = 'none';

    if (!activities.length) {
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    const html = activities.slice(0, 20).map(a => {
      if (a.type === 'post') {
        const postUrl = `product.html?id=${encodeURIComponent(a.postId || '')}`;
        return `
          <div class="kc-profile-activity-item">
            <div class="kc-profile-activity-icon"><i class="fas fa-newspaper"></i></div>
            <div class="kc-profile-activity-content">
              <div class="kc-profile-activity-label">
                Publicou <a href="${esc(postUrl)}">${esc(a.postTitle)}</a>
                ${statusBadge(a.status)}
              </div>
              <div class="kc-profile-activity-meta">${fmtRelative(a.date)}</div>
            </div>
          </div>`;
      } else {
        const postUrl = `product.html?id=${encodeURIComponent(a.postId || '')}`;
        return `
          <div class="kc-profile-activity-item">
            <div class="kc-profile-activity-icon"><i class="fas fa-comment"></i></div>
            <div class="kc-profile-activity-content">
              <div class="kc-profile-activity-label">
                Comentou em <a href="${esc(postUrl)}">${esc(a.postTitle)}</a>
              </div>
              ${a.body ? `<div class="kc-profile-activity-meta" style="margin-top:4px;font-style:italic;color:var(--kc-text-dark);">"${esc(a.body)}${a.body.length >= 120 ? '…' : ''}"</div>` : ''}
              <div class="kc-profile-activity-meta" style="margin-top:4px;">${fmtRelative(a.date)}</div>
            </div>
          </div>`;
      }
    }).join('');

    if (listEl) listEl.innerHTML = html;
  }

  // ──────────────────────────────────────────────
  // Tabs
  // ──────────────────────────────────────────────

  function switchTab(tabId) {
    state.activeTab = tabId;

    document.querySelectorAll('.kc-profile-tab').forEach(btn => {
      const active = btn.getAttribute('data-kc-tab') === tabId;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    document.querySelectorAll('.kc-profile-tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `tab-${tabId}`);
    });

    // Carregamento lazy por tab
    if (tabId === 'posts' && state.posts.length === 0) loadPosts(true);
    if (tabId === 'comments' && state.comments.length === 0) loadComments(true);
  }

  // ──────────────────────────────────────────────
  // Edição de nome
  // ──────────────────────────────────────────────

  async function onSaveDisplayName(evt) {
    evt.preventDefault();
    const input  = $('#display-name-input');
    const submit = $('#display-name-submit');
    if (!input) return;

    const displayName = String(input.value || '').trim();
    if (!displayName) { setStatus('Informe um nome válido.', 'warn'); return; }

    setStatus('Salvando…', 'info');
    if (submit) submit.disabled = true;

    try {
      const result = await window.KCAPI.updateMyProfile({ display_name: displayName });
      if (!result || !result.ok) {
        setStatus('Não foi possível alterar seu nome. Tente novamente mais tarde.', 'error');
        return;
      }
      state.profile = result.data || await window.KCAPI.getMyProfile();
      renderHeader();
      setStatus('Nome atualizado com sucesso.', 'success');
    } catch (_) {
      setStatus('Não foi possível alterar seu nome.', 'error');
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  // ──────────────────────────────────────────────
  // Carregar perfil
  // ──────────────────────────────────────────────

  async function loadProfile() {
    try {
      if (state.isPublicView) {
        state.profile = await window.KCAPI.getProfileById(state.profileId);
      } else {
        state.profile = await window.KCAPI.getMyProfile();
        if (!state.profile && typeof window.KCAPI.syncProfile === 'function') {
          await window.KCAPI.syncProfile();
          state.profile = await window.KCAPI.getMyProfile();
        }
      }
    } catch (_) {
      state.profile = null;
    }

    // Injeta is_admin no perfil se disponível (para uso futuro)
    const client = getClient();
    if (client && state.profile && !state.isPublicView && state.user) {
      try {
        const { data: full } = await client
          .from('profiles')
          .select('is_admin, email, created_at')
          .eq('id', state.user.id)
          .maybeSingle();
        if (full) {
          state.profile.is_admin   = full.is_admin;
          state.profile.email      = full.email || state.profile.email;
          state.profile.created_at = full.created_at || state.profile.created_at;
        }
      } catch (_) {}
    }

    // Para vista pública, busca created_at se não tiver
    if (state.isPublicView && state.profile && !state.profile.created_at && client) {
      try {
        const { data: extra } = await client
          .from('profiles')
          .select('created_at, email')
          .eq('id', state.profileId)
          .maybeSingle();
        if (extra) {
          state.profile.created_at = state.profile.created_at || extra.created_at;
          state.profile.email      = state.profile.email || extra.email;
        }
      } catch (_) {}
    }

    renderHeader();
  }

  // ──────────────────────────────────────────────
  // Init
  // ──────────────────────────────────────────────

  async function init() {
    if (!window.KCAPI || typeof window.KCAPI.getCurrentUser !== 'function') return;

    state.profileId = readProfileIdFromQuery();
    state.isPublicView = !!state.profileId;

    if (!state.isPublicView) {
      state.user = await window.KCAPI.getCurrentUser();
      if (!state.user) {
        const loadingEl = $('#profile-loading');
        if (loadingEl) loadingEl.textContent = 'Você precisa estar logado para ver seu perfil.';
        setTimeout(() => { window.location.href = 'index.html#login'; }, 900);
        return;
      }
      state.profileId = state.user.id;
    }

    // Exibe conteúdo, oculta loading
    const loadingEl = $('#profile-loading');
    if (loadingEl) loadingEl.style.display = 'none';
    const contentEl = $('#profile-content');
    if (contentEl) contentEl.style.display = 'block';

    // Carrega perfil e renderiza header
    await loadProfile();

    // Stats
    if (state.profileId) loadStats(state.profileId).catch(() => {});

    // Carrega atividades imediatamente (tab inicial)
    await loadActivities();

    // Listeners de tabs
    document.querySelectorAll('[data-kc-tab]').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.getAttribute('data-kc-tab')));
    });

    // Formulário de edição de nome
    const form = $('#display-name-form');
    if (form && !state.isPublicView) form.addEventListener('submit', onSaveDisplayName);

    // Filtro de status dos posts
    const statusFilter = $('#profile-posts-status');
    if (statusFilter) {
      statusFilter.addEventListener('change', (e) => {
        state.postStatus = String(e.target.value || '').trim().toLowerCase();
        loadPosts(true);
      });
    }

    // Load more — posts
    const postsMoreBtn = $('#posts-load-more');
    if (postsMoreBtn) {
      postsMoreBtn.addEventListener('click', () => {
        state.postPage++;
        loadPosts(false);
      });
    }

    // Load more — comentários
    const commentsMoreBtn = $('#comments-load-more');
    if (commentsMoreBtn) {
      commentsMoreBtn.addEventListener('click', () => {
        state.commentPage++;
        loadComments(false);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();

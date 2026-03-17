/*
  KinoCampus - Profile Controller (V8.8.0.0)

  Funcionalidades:
  - Vista propria (sem ?id) e vista publica (?id=<uuid>)
  - Tabs: Atividades, Posts, Comentarios, Salvos/Destaques
  - Stats: total de posts publicados, comentarios, votos recebidos
  - Edicao de nome (somente na vista propria)
  - Paginacao em posts, comentarios e salvos
*/
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const esc = (value) => (typeof window.KCUtils !== 'undefined' && window.KCUtils.escapeHtml)
    ? window.KCUtils.escapeHtml(String(value || ''))
    : String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const state = {
    user: null,
    profile: null,
    profileId: '',
    isPublicView: false,
    posts: [],
    postPage: 1,
    postStatus: '',
    postHasMore: false,
    comments: [],
    commentPage: 1,
    commentHasMore: false,
    savedItems: [],
    savedPage: 1,
    savedKind: '',
    savedHasMore: false,
    activeTab: 'activities',
  };

  const PAGE_SIZE = 12;
  const COMMENT_PAGE_SIZE = 15;

  function readProfileIdFromQuery() {
    const raw = new URLSearchParams(window.location.search).get('id');
    return String(raw || '').trim();
  }

  function safeName(profile, user) {
    return String(
      (profile && (profile.display_name || profile.full_name))
      || (user && user.email ? String(user.email).split('@')[0] : '')
      || 'Usuario'
    ).trim() || 'Usuario';
  }

  function safeHandle(profile, user) {
    const email = (profile && profile.email) || (user && user.email) || '';
    if (!email.includes('@')) return '';
    return '@' + email.split('@')[0];
  }

  function avatarUrl(profile, user) {
    if (profile && profile.avatar_url) return String(profile.avatar_url);
    const seed = (user && (user.email || user.id)) ? String(user.email || user.id) : 'kinocampus';
    return 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(seed.toLowerCase());
  }

  function fmtDate(iso, opts) {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleDateString('pt-BR', opts || { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (_) {
      return '-';
    }
  }

  function fmtRelative(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'agora mesmo';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return 'ha ' + minutes + ' min';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return 'ha ' + hours + 'h';
    const days = Math.floor(hours / 24);
    if (days < 30) return 'ha ' + days + ' dia' + (days > 1 ? 's' : '');
    return fmtDate(iso);
  }

  function statusBadge(status) {
    const labels = { published: 'Publicado', pending: 'Pendente', hidden: 'Oculto', deleted: 'Excluido' };
    const cls = { published: 'published', pending: 'pending', hidden: 'hidden', deleted: 'deleted' };
    const key = String(status || 'published').toLowerCase();
    return '<span class="kc-status-badge kc-status-badge--' + esc(cls[key] || 'published') + '">' + esc(labels[key] || key) + '</span>';
  }

  function saveKindBadge(kind) {
    const key = String(kind || '').trim().toLowerCase();
    if (!key) return '';
    const map = {
      favorite: { icon: 'fas fa-heart', label: 'Favorito' },
      later: { icon: 'fas fa-clock', label: 'Lembrar Depois' },
      highlight: { icon: 'fas fa-star', label: 'Destaque' },
    };
    const current = map[key];
    if (!current) return '';
    return '<span class="kc-profile-save-badge kc-profile-save-badge--' + esc(key) + '"><i class="' + esc(current.icon) + '"></i> ' + esc(current.label) + '</span>';
  }

  function setStatus(message, tone) {
    const el = $('#profile-feedback');
    if (!el) return;
    if (!message) {
      el.style.display = 'none';
      el.textContent = '';
      el.className = 'kc-profile-feedback';
      return;
    }
    el.style.display = 'block';
    el.textContent = message;
    el.className = 'kc-profile-feedback is-' + (tone || 'info');
  }

  function getClient() {
    if (window.KCSupabase && typeof window.KCSupabase.getClient === 'function') return window.KCSupabase.getClient();
    return null;
  }

  function setBadgeCount(id, count) {
    const badge = $(id);
    if (!badge) return;
    const value = Number(count) || 0;
    badge.textContent = value > 99 ? '99+' : String(value);
  }

  function renderHeader() {
    const profile = state.profile || {};
    const user = state.user;
    const name = safeName(profile, user);
    const handle = safeHandle(profile, user);
    const verified = !!(profile && profile.verified === true);
    const publicSavedLabel = state.isPublicView ? 'Destaques' : 'Salvos';
    const publicSavedTitle = state.isPublicView ? 'Destaques publicos' : 'Salvos';
    const emptySavedText = state.isPublicView
      ? 'Nenhum destaque publico encontrado.'
      : 'Nenhuma publicacao salva ainda.';

    const avatar = $('#profile-avatar');
    if (avatar) avatar.src = avatarUrl(profile, user);

    const nameEl = $('#profile-display-name');
    if (nameEl) nameEl.textContent = name;

    const handleEl = $('#profile-handle');
    if (handleEl) {
      if (handle) {
        handleEl.textContent = handle;
        handleEl.style.display = 'block';
      } else {
        handleEl.style.display = 'none';
      }
    }

    const verifiedIcon = $('#profile-verified-icon');
    if (verifiedIcon) verifiedIcon.style.display = verified ? 'flex' : 'none';

    const memberSince = $('#profile-member-since');
    if (memberSince) {
      const memberDate = profile && profile.created_at;
      if (memberDate) {
        const span = memberSince.querySelector('span');
        if (span) span.textContent = 'Desde ' + fmtDate(memberDate, { month: 'short', year: 'numeric' });
        memberSince.style.display = 'inline-flex';
      } else {
        memberSince.style.display = 'none';
      }
    }

    const editSection = $('#profile-edit-section');
    if (editSection) editSection.style.display = state.isPublicView ? 'none' : 'block';

    const nameInput = $('#display-name-input');
    if (nameInput) nameInput.value = profile.display_name || profile.full_name || '';

    const postsToolbar = $('#posts-toolbar');
    if (postsToolbar) {
      const statusSelect = postsToolbar.querySelector('#profile-posts-status');
      if (statusSelect) statusSelect.style.display = state.isPublicView ? 'none' : '';
    }

    const savedTabLabel = $('#saved-tab-label');
    if (savedTabLabel) savedTabLabel.textContent = publicSavedLabel;

    const savedToolbarTitle = $('#saved-toolbar-title');
    if (savedToolbarTitle) savedToolbarTitle.textContent = publicSavedTitle;

    const savedKindSelect = $('#profile-saved-kind');
    if (savedKindSelect) {
      savedKindSelect.style.display = state.isPublicView ? 'none' : '';
      savedKindSelect.value = state.savedKind || '';
    }

    const savedEmpty = $('#saved-empty');
    if (savedEmpty) {
      const textNode = savedEmpty.lastChild;
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        textNode.textContent = '\n            ' + emptySavedText + '\n          ';
      } else {
        savedEmpty.innerHTML = '<i class="fas fa-bookmark"></i>\n            ' + esc(emptySavedText);
      }
    }
  }

  async function loadStats(authorId) {
    if (!authorId) return;
    const client = getClient();
    if (!client) return;

    try {
      const { count: postCount } = await client
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', authorId)
        .eq('status', 'published');
      if (typeof postCount === 'number') {
        const el = $('#stat-posts');
        if (el) el.textContent = postCount;
      }

      const { count: commentCount } = await client
        .from('comments')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', authorId);
      if (typeof commentCount === 'number') {
        const el = $('#stat-comments');
        if (el) el.textContent = commentCount;
        setBadgeCount('#badge-comments', commentCount);
      }

      const { data: voteData } = await client
        .from('posts')
        .select('votos')
        .eq('author_id', authorId)
        .eq('status', 'published');
      if (Array.isArray(voteData)) {
        const totalVotes = voteData.reduce((acc, post) => acc + (Number(post.votos) || 0), 0);
        const el = $('#stat-votes');
        if (el) el.textContent = totalVotes;
      }
    } catch (e) {
      console.warn('[Profile] loadStats:', e);
    }
  }

  async function loadSavedBadgeCount(authorId) {
    const client = getClient();
    if (!client || !authorId) return;

    try {
      let query = client
        .from('saved_posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', authorId);

      if (state.isPublicView) query = query.eq('kind', 'highlight');

      const { count, error } = await query;
      if (!error && typeof count === 'number') setBadgeCount('#badge-saved', count);
    } catch (e) {
      console.warn('[Profile] loadSavedBadgeCount:', e);
    }
  }

  async function loadPosts(reset) {
    const loadingEl = $('#posts-loading');
    const listEl = $('#posts-list');
    const emptyEl = $('#posts-empty');
    const moreBtn = $('#posts-load-more');

    if (reset) {
      state.postPage = 1;
      state.posts = [];
      if (listEl) listEl.innerHTML = '';
    }

    if (loadingEl) loadingEl.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';
    if (moreBtn) moreBtn.style.display = 'none';

    try {
      const params = { page: state.postPage, limit: PAGE_SIZE };
      if (!state.isPublicView && state.postStatus) params.status = state.postStatus;

      const batch = state.isPublicView
        ? await window.KCAPI.getPostsByAuthorId(state.profileId, params)
        : await window.KCAPI.getMyPosts(params);

      const items = Array.isArray(batch) ? batch : [];
      state.posts = reset ? items : state.posts.concat(items);
      state.postHasMore = items.length >= PAGE_SIZE;

      if (reset) setBadgeCount('#badge-posts', state.posts.length);
      renderPosts(reset ? state.posts : items, !reset);
    } catch (e) {
      console.warn('[Profile] loadPosts:', e);
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  function renderPosts(posts, append) {
    const listEl = $('#posts-list');
    const emptyEl = $('#posts-empty');
    const moreBtn = $('#posts-load-more');
    if (!listEl) return;

    if (!append) listEl.innerHTML = '';

    if (!Array.isArray(posts) || posts.length === 0) {
      if (!append && (!state.posts || !state.posts.length) && emptyEl) emptyEl.style.display = 'block';
      if (moreBtn) moreBtn.style.display = 'none';
      return;
    }

    posts.forEach((post) => {
      const link = document.createElement('a');
      link.className = 'kc-profile-post-card';
      link.href = 'product.html?id=' + encodeURIComponent(post.uuid || post.id || '');
      const status = String(post.status || 'published').toLowerCase();
      link.innerHTML = [
        '<div class="kc-profile-post-card__title">', esc(post.title || 'Sem titulo'), '</div>',
        '<div class="kc-profile-post-card__meta">',
        statusBadge(status),
        post.module ? '<span><i class="fas fa-layer-group"></i> ' + esc(post.module) + '</span>' : '',
        post.category ? '<span>' + esc(post.category) + '</span>' : '',
        '<span><i class="fas fa-clock"></i> ', esc(fmtRelative(post.created_at)), '</span>',
        '</div>'
      ].join('');
      listEl.appendChild(link);
    });

    if (moreBtn) moreBtn.style.display = state.postHasMore ? 'block' : 'none';
  }

  async function loadComments(reset) {
    const loadingEl = $('#comments-loading');
    const listEl = $('#comments-list');
    const emptyEl = $('#comments-empty');
    const moreBtn = $('#comments-load-more');

    if (reset) {
      state.commentPage = 1;
      state.comments = [];
      if (listEl) listEl.innerHTML = '';
    }

    if (loadingEl) loadingEl.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';
    if (moreBtn) moreBtn.style.display = 'none';

    const client = getClient();
    const authorId = state.profileId || (state.user && state.user.id);
    if (!client || !authorId) {
      if (loadingEl) loadingEl.style.display = 'none';
      return;
    }

    try {
      const from = (state.commentPage - 1) * COMMENT_PAGE_SIZE;
      const to = from + COMMENT_PAGE_SIZE - 1;
      let payload = [];

      const { data, error } = await client
        .from('comments')
        .select('id, created_at, body, post_id, post:posts!comments_post_id_fkey(id, legacy_id, title, titulo)')
        .eq('author_id', authorId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        const fallback = await client
          .from('comments')
          .select('id, created_at, body, post_id')
          .eq('author_id', authorId)
          .order('created_at', { ascending: false })
          .range(from, to);
        payload = Array.isArray(fallback && fallback.data) ? fallback.data : [];
      } else {
        payload = Array.isArray(data) ? data : [];
      }

      state.comments = reset ? payload : state.comments.concat(payload);
      state.commentHasMore = payload.length >= COMMENT_PAGE_SIZE;
      renderComments(reset ? state.comments : payload, !reset);
    } catch (e) {
      console.warn('[Profile] loadComments:', e);
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  function renderComments(comments, append) {
    const listEl = $('#comments-list');
    const emptyEl = $('#comments-empty');
    const moreBtn = $('#comments-load-more');
    if (!listEl) return;

    if (!append) listEl.innerHTML = '';

    if (!Array.isArray(comments) || comments.length === 0) {
      if (!append && (!state.comments || !state.comments.length) && emptyEl) emptyEl.style.display = 'block';
      if (moreBtn) moreBtn.style.display = 'none';
      return;
    }

    comments.forEach((comment) => {
      const card = document.createElement('div');
      card.className = 'kc-profile-comment-card';
      const post = comment.post || {};
      const postTitle = post.title || post.titulo || 'Post';
      const postId = post.id || comment.post_id || '';
      const postLegacyId = post.legacy_id || postId;
      const postUrl = 'product.html?id=' + encodeURIComponent(postLegacyId || postId);

      card.innerHTML = [
        '<div class="kc-profile-comment-card__body">', esc(comment.body || ''), '</div>',
        '<div class="kc-profile-comment-card__meta">',
        '<span><i class="fas fa-clock"></i> ', esc(fmtRelative(comment.created_at)), '</span>',
        postId ? '<span>em <a class="kc-profile-comment-card__post-link" href="' + esc(postUrl) + '">' + esc(postTitle) + '</a></span>' : '',
        '</div>'
      ].join('');
      listEl.appendChild(card);
    });

    if (moreBtn) moreBtn.style.display = state.commentHasMore ? 'block' : 'none';
  }

  async function loadSaved(reset) {
    const loadingEl = $('#saved-loading');
    const listEl = $('#saved-list');
    const emptyEl = $('#saved-empty');
    const moreBtn = $('#saved-load-more');

    if (reset) {
      state.savedPage = 1;
      state.savedItems = [];
      if (listEl) listEl.innerHTML = '';
    }

    if (loadingEl) loadingEl.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';
    if (moreBtn) moreBtn.style.display = 'none';

    try {
      const params = { page: state.savedPage, limit: PAGE_SIZE };
      if (!state.isPublicView && state.savedKind) params.kind = state.savedKind;

      const batch = state.isPublicView
        ? await window.KCAPI.getProfileHighlights(state.profileId, params)
        : await window.KCAPI.getMySavedPosts(params);

      const items = Array.isArray(batch) ? batch : [];
      state.savedItems = reset ? items : state.savedItems.concat(items);
      state.savedHasMore = items.length >= PAGE_SIZE;

      renderSaved(reset ? state.savedItems : items, !reset);
    } catch (e) {
      console.warn('[Profile] loadSaved:', e);
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  function renderSaved(items, append) {
    const listEl = $('#saved-list');
    const emptyEl = $('#saved-empty');
    const moreBtn = $('#saved-load-more');
    if (!listEl) return;

    if (!append) listEl.innerHTML = '';

    if (!Array.isArray(items) || items.length === 0) {
      if (!append && (!state.savedItems || !state.savedItems.length) && emptyEl) emptyEl.style.display = 'block';
      if (moreBtn) moreBtn.style.display = 'none';
      return;
    }

    items.forEach((item) => {
      const link = document.createElement('a');
      link.className = 'kc-profile-post-card';
      link.href = 'product.html?id=' + encodeURIComponent(item.uuid || item.id || '');
      const status = String(item.status || 'published').toLowerCase();
      const saveBadge = saveKindBadge(item.save_kind || (state.isPublicView ? 'highlight' : ''));
      const savedLabel = item.saved_at ? fmtRelative(item.saved_at) : fmtRelative(item.created_at);

      link.innerHTML = [
        '<div class="kc-profile-post-card__title">', esc(item.title || 'Sem titulo'), '</div>',
        '<div class="kc-profile-post-card__meta">',
        state.isPublicView ? '' : statusBadge(status),
        saveBadge,
        item.module ? '<span><i class="fas fa-layer-group"></i> ' + esc(item.module) + '</span>' : '',
        item.category ? '<span>' + esc(item.category) + '</span>' : '',
        savedLabel ? '<span><i class="fas fa-bookmark"></i> ' + esc(savedLabel) + '</span>' : '',
        '</div>'
      ].join('');
      listEl.appendChild(link);
    });

    if (moreBtn) moreBtn.style.display = state.savedHasMore ? 'block' : 'none';
  }

  async function loadActivities() {
    const loadingEl = $('#activities-loading');
    const listEl = $('#activities-list');
    const emptyEl = $('#activities-empty');
    if (loadingEl) loadingEl.style.display = 'block';
    if (listEl) listEl.innerHTML = '';

    const authorId = state.profileId || (state.user && state.user.id);
    const client = getClient();
    const activities = [];

    try {
      const recentPosts = state.isPublicView
        ? await window.KCAPI.getPostsByAuthorId(authorId, { page: 1, limit: 8 })
        : await window.KCAPI.getMyPosts({ page: 1, limit: 8 });
      if (Array.isArray(recentPosts)) {
        recentPosts.forEach((post) => {
          activities.push({
            type: 'post',
            date: post.created_at,
            postTitle: post.title || 'Sem titulo',
            postId: post.uuid || post.id,
            status: post.status,
          });
        });
      }
    } catch (_) {}

    if (client && authorId) {
      try {
        const { data: recentComments } = await client
          .from('comments')
          .select('id, created_at, body, post_id, post:posts!comments_post_id_fkey(id, legacy_id, title, titulo)')
          .eq('author_id', authorId)
          .order('created_at', { ascending: false })
          .limit(8);

        if (Array.isArray(recentComments)) {
          recentComments.forEach((comment) => {
            const post = comment.post || {};
            activities.push({
              type: 'comment',
              date: comment.created_at,
              body: String(comment.body || '').substring(0, 120),
              postTitle: post.title || post.titulo || 'Post',
              postId: post.legacy_id || post.id || comment.post_id,
            });
          });
        }
      } catch (_) {}
    }

    activities.sort((left, right) => new Date(right.date) - new Date(left.date));
    if (loadingEl) loadingEl.style.display = 'none';

    if (!activities.length) {
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    const html = activities.slice(0, 20).map((item) => {
      if (item.type === 'post') {
        const postUrl = 'product.html?id=' + encodeURIComponent(item.postId || '');
        return [
          '<div class="kc-profile-activity-item">',
          '<div class="kc-profile-activity-icon"><i class="fas fa-newspaper"></i></div>',
          '<div class="kc-profile-activity-content">',
          '<div class="kc-profile-activity-label">Publicou <a href="', esc(postUrl), '">', esc(item.postTitle), '</a> ', statusBadge(item.status), '</div>',
          '<div class="kc-profile-activity-meta">', esc(fmtRelative(item.date)), '</div>',
          '</div>',
          '</div>'
        ].join('');
      }

      const postUrl = 'product.html?id=' + encodeURIComponent(item.postId || '');
      const commentPreview = item.body
        ? '<div class="kc-profile-activity-meta" style="margin-top:4px;font-style:italic;color:var(--kc-text-dark);">"' + esc(item.body) + (item.body.length >= 120 ? '…' : '') + '"</div>'
        : '';

      return [
        '<div class="kc-profile-activity-item">',
        '<div class="kc-profile-activity-icon"><i class="fas fa-comment"></i></div>',
        '<div class="kc-profile-activity-content">',
        '<div class="kc-profile-activity-label">Comentou em <a href="', esc(postUrl), '">', esc(item.postTitle), '</a></div>',
        commentPreview,
        '<div class="kc-profile-activity-meta" style="margin-top:4px;">', esc(fmtRelative(item.date)), '</div>',
        '</div>',
        '</div>'
      ].join('');
    }).join('');

    if (listEl) listEl.innerHTML = html;
  }

  function switchTab(tabId) {
    state.activeTab = tabId;

    document.querySelectorAll('.kc-profile-tab').forEach((button) => {
      const active = button.getAttribute('data-kc-tab') === tabId;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    document.querySelectorAll('.kc-profile-tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === 'tab-' + tabId);
    });

    if (tabId === 'posts' && state.posts.length === 0) loadPosts(true);
    if (tabId === 'comments' && state.comments.length === 0) loadComments(true);
    if (tabId === 'saved' && state.savedItems.length === 0) loadSaved(true);
  }

  async function onSaveDisplayName(event) {
    event.preventDefault();
    const input = $('#display-name-input');
    const submit = $('#display-name-submit');
    if (!input) return;

    const displayName = String(input.value || '').trim();
    if (!displayName) {
      setStatus('Informe um nome valido.', 'warn');
      return;
    }

    setStatus('Salvando...', 'info');
    if (submit) submit.disabled = true;

    try {
      const result = await window.KCAPI.updateMyProfile({ display_name: displayName });
      if (!result || !result.ok) {
        setStatus('Nao foi possivel alterar seu nome. Tente novamente mais tarde.', 'error');
        return;
      }
      state.profile = result.data || await window.KCAPI.getMyProfile();
      renderHeader();
      setStatus('Nome atualizado com sucesso.', 'success');
    } catch (_) {
      setStatus('Nao foi possivel alterar seu nome.', 'error');
    } finally {
      if (submit) submit.disabled = false;
    }
  }

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

    const client = getClient();
    if (client && state.profile && !state.isPublicView && state.user) {
      try {
        const { data: full } = await client
          .from('profiles')
          .select('is_admin, email, created_at')
          .eq('id', state.user.id)
          .maybeSingle();
        if (full) {
          state.profile.is_admin = full.is_admin;
          state.profile.email = full.email || state.profile.email;
          state.profile.created_at = full.created_at || state.profile.created_at;
        }
      } catch (_) {}
    }

    if (state.isPublicView && state.profile && !state.profile.created_at && client) {
      try {
        const { data: extra } = await client
          .from('profiles')
          .select('created_at, email')
          .eq('id', state.profileId)
          .maybeSingle();
        if (extra) {
          state.profile.created_at = state.profile.created_at || extra.created_at;
          state.profile.email = state.profile.email || extra.email;
        }
      } catch (_) {}
    }

    renderHeader();
  }

  async function init() {
    if (!window.KCAPI || typeof window.KCAPI.getCurrentUser !== 'function') return;

    state.profileId = readProfileIdFromQuery();
    state.isPublicView = !!state.profileId;

    if (!state.isPublicView) {
      state.user = await window.KCAPI.getCurrentUser();
      if (!state.user) {
        const loadingEl = $('#profile-loading');
        if (loadingEl) loadingEl.textContent = 'Voce precisa estar logado para ver seu perfil.';
        setTimeout(() => { window.location.href = 'index.html#login'; }, 900);
        return;
      }
      state.profileId = state.user.id;
    }

    const loadingEl = $('#profile-loading');
    if (loadingEl) loadingEl.style.display = 'none';
    const contentEl = $('#profile-content');
    if (contentEl) contentEl.style.display = 'block';

    await loadProfile();
    if (state.profileId) {
      loadStats(state.profileId).catch(() => {});
      loadSavedBadgeCount(state.profileId).catch(() => {});
    }
    await loadActivities();

    document.querySelectorAll('[data-kc-tab]').forEach((button) => {
      button.addEventListener('click', () => switchTab(button.getAttribute('data-kc-tab')));
    });

    const form = $('#display-name-form');
    if (form && !state.isPublicView) form.addEventListener('submit', onSaveDisplayName);

    const statusFilter = $('#profile-posts-status');
    if (statusFilter) {
      statusFilter.addEventListener('change', (event) => {
        state.postStatus = String(event.target.value || '').trim().toLowerCase();
        loadPosts(true);
      });
    }

    const savedKind = $('#profile-saved-kind');
    if (savedKind) {
      savedKind.addEventListener('change', (event) => {
        state.savedKind = String(event.target.value || '').trim().toLowerCase();
        loadSaved(true);
      });
    }

    const postsMoreBtn = $('#posts-load-more');
    if (postsMoreBtn) {
      postsMoreBtn.addEventListener('click', () => {
        state.postPage += 1;
        loadPosts(false);
      });
    }

    const commentsMoreBtn = $('#comments-load-more');
    if (commentsMoreBtn) {
      commentsMoreBtn.addEventListener('click', () => {
        state.commentPage += 1;
        loadComments(false);
      });
    }

    const savedMoreBtn = $('#saved-load-more');
    if (savedMoreBtn) {
      savedMoreBtn.addEventListener('click', () => {
        state.savedPage += 1;
        loadSaved(false);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();

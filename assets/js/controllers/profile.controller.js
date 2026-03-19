(function () {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const PAGE_SIZE = 12;
  const COMMENT_PAGE_SIZE = 15;
  const BIO_LIMIT = 200;

  const state = {
    user: null,
    profile: null,
    profileId: '',
    isPublicView: false,
    activeTab: 'activities',
    isEditing: false,
    profilePending: false,
    avatarFile: null,
    avatarPreviewUrl: '',
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
  };

  function esc(value) {
    const text = String(value == null ? '' : value);
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') {
      return window.KCUtils.escapeHtml(text);
    }
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function readProfileIdFromQuery() {
    const raw = new URLSearchParams(window.location.search).get('id');
    return String(raw || '').trim();
  }

  function getClient() {
    if (window.KCSupabase && typeof window.KCSupabase.getClient === 'function') {
      return window.KCSupabase.getClient();
    }
    return null;
  }

  function safeName(profile, user) {
    const candidate = profile && (profile.display_name || profile.full_name);
    if (candidate && String(candidate).trim()) return String(candidate).trim();
    const email = user && user.email ? String(user.email) : '';
    if (email.includes('@')) return email.split('@')[0];
    return 'Usuario';
  }

  function buildPublicHandle(profile) {
    const source = profile && (profile.display_name || profile.full_name);
    if (window.KCUtils && typeof window.KCUtils.buildPublicHandle === 'function') {
      return window.KCUtils.buildPublicHandle(source);
    }
    const normalized = String(source || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return normalized ? ('@' + normalized.slice(0, 32)) : '';
  }

  function safeHandle(profile, user) {
    const email = user && user.email ? String(user.email) : '';
    if (!state.isPublicView && email.includes('@')) return '@' + email.split('@')[0];
    return buildPublicHandle(profile);
  }

  function currentAvatarUrl() {
    if (state.avatarPreviewUrl) return state.avatarPreviewUrl;
    const avatarUrl = state.profile && state.profile.avatar_url ? String(state.profile.avatar_url) : '';
    if (avatarUrl) return avatarUrl;
    const seedBase = (state.profile && (state.profile.display_name || state.profile.full_name || state.profile.id))
      || (state.user && (state.user.email || state.user.id))
      || 'kinocampus';
    return 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(String(seedBase).toLowerCase());
  }

  function fmtDate(iso, options) {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleDateString('pt-BR', options || {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch (_) {
      return '-';
    }
  }

  function fmtRelative(iso) {
    if (!iso) return '';
    const target = new Date(iso).getTime();
    if (!Number.isFinite(target)) return '';
    const delta = Date.now() - target;
    const seconds = Math.max(0, Math.floor(delta / 1000));
    if (seconds < 60) return 'agora';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `ha ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `ha ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `ha ${days} dia${days > 1 ? 's' : ''}`;
    return fmtDate(iso);
  }

  function statusBadge(status) {
    const key = String(status || 'published').trim().toLowerCase();
    const labels = {
      published: 'Publicado',
      pending: 'Pendente',
      hidden: 'Oculto',
      deleted: 'Excluido',
    };
    return `<span class="kc-status-badge kc-status-badge--${esc(key)}">${esc(labels[key] || key)}</span>`;
  }

  function normalizeSaveKinds(value) {
    const list = Array.isArray(value)
      ? value
      : (value ? [value] : []);
    const allowed = new Set(['favorite', 'later', 'highlight']);
    return list
      .map((item) => String(item || '').trim().toLowerCase())
      .filter((item, index, array) => item && allowed.has(item) && array.indexOf(item) === index);
  }

  function saveKindBadge(kind) {
    const current = {
      favorite: { icon: 'fas fa-heart', label: 'Favorito' },
      later: { icon: 'fas fa-clock', label: 'Lembrar Depois' },
      highlight: { icon: 'fas fa-star', label: 'Destaque' },
    }[String(kind || '').trim().toLowerCase()];
    if (!current) return '';
    return `<span class="kc-profile-save-badge kc-profile-save-badge--${esc(kind)}"><i class="${esc(current.icon)}"></i> ${esc(current.label)}</span>`;
  }

  function buildSaveBadges(kinds) {
    return normalizeSaveKinds(kinds).map(saveKindBadge).join('');
  }

  function linkifyBio(text) {
    const source = String(text || '').trim();
    if (!source) return '';
    const escaped = esc(source).replace(/\r?\n/g, '<br>');
    return escaped.replace(/((https?:\/\/|www\.)[^\s<]+)/gi, (match) => {
      const href = /^https?:\/\//i.test(match) ? match : `https://${match}`;
      return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${match}</a>`;
    });
  }

  function releaseAvatarPreview() {
    if (state.avatarPreviewUrl && /^blob:/i.test(state.avatarPreviewUrl)) {
      try {
        URL.revokeObjectURL(state.avatarPreviewUrl);
      } catch (_) { }
    }
    state.avatarPreviewUrl = '';
  }

  function clearAvatarDraft() {
    state.avatarFile = null;
    releaseAvatarPreview();
    const input = $('#profile-avatar-input');
    if (input) input.value = '';
  }

  function setStatus(message, tone) {
    const feedback = $('#profile-feedback');
    if (!feedback) return;
    if (!message) {
      feedback.style.display = 'none';
      feedback.textContent = '';
      feedback.className = 'kc-profile-feedback';
      return;
    }
    feedback.style.display = 'block';
    feedback.textContent = message;
    feedback.className = `kc-profile-feedback is-${tone || 'info'}`;
  }

  function setBadgeCount(id, count) {
    const badge = $(id);
    if (!badge) return;
    const value = Math.max(0, Number(count) || 0);
    badge.textContent = value > 99 ? '99+' : String(value);
  }

  function isOwnerView() {
    return !state.isPublicView;
  }

  function syncFormFromProfile() {
    const nameInput = $('#display-name-input');
    const bioInput = $('#profile-bio-input');
    if (nameInput) nameInput.value = state.profile && (state.profile.display_name || state.profile.full_name) ? String(state.profile.display_name || state.profile.full_name) : '';
    if (bioInput) bioInput.value = state.profile && state.profile.bio ? String(state.profile.bio) : '';
    updateBioCounter();
  }

  function updateBioCounter() {
    const bioInput = $('#profile-bio-input');
    const counter = $('#profile-bio-counter');
    if (!counter) return;
    const length = Math.min(BIO_LIMIT, String((bioInput && bioInput.value) || '').length);
    counter.textContent = `${length}/${BIO_LIMIT}`;
  }

  function setEditing(active) {
    if (!isOwnerView()) return;
    state.isEditing = !!active;
    const form = $('#profile-inline-form');
    const bio = $('#profile-bio');
    const editToggle = $('#profile-edit-toggle');

    if (form) {
      form.style.display = state.isEditing ? 'block' : 'none';
      form.classList.toggle('is-active', state.isEditing);
    }
    if (editToggle) {
      editToggle.innerHTML = state.isEditing
        ? '<i class="fas fa-times"></i> Fechar edicao'
        : '<i class="fas fa-pen"></i> Editar perfil';
    }

    if (state.isEditing) {
      syncFormFromProfile();
      if (bio) bio.style.display = 'none';
      setStatus('', 'info');
      return;
    }

    clearAvatarDraft();
    renderHeader();
    setStatus('', 'info');
  }

  function renderHeader() {
    const profile = state.profile || {};
    const user = state.user || null;
    const ownerView = isOwnerView();
    const name = safeName(profile, user);
    const handle = safeHandle(profile, user);
    const bioText = String(profile.bio || '').trim();
    const savedLabel = state.isPublicView ? 'Destaques' : 'Salvos';
    const savedTitle = state.isPublicView ? 'Destaques' : 'Salvos';
    const savedEmptyText = state.isPublicView
      ? 'Nenhum destaque publico encontrado.'
      : 'Nenhuma publicacao salva ainda.';

    const avatar = $('#profile-avatar');
    if (avatar) {
      avatar.src = currentAvatarUrl();
      avatar.alt = `Avatar de ${name}`;
    }

    const verifiedIcon = $('#profile-verified-icon');
    if (verifiedIcon) verifiedIcon.style.display = profile && profile.verified === true ? 'flex' : 'none';

    const avatarEdit = $('#profile-avatar-edit');
    if (avatarEdit) avatarEdit.style.display = ownerView ? 'inline-flex' : 'none';

    const editToggle = $('#profile-edit-toggle');
    if (editToggle) editToggle.style.display = ownerView ? 'inline-flex' : 'none';

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

    const memberSince = $('#profile-member-since');
    if (memberSince) {
      const inner = memberSince.querySelector('span');
      if (profile && profile.created_at && inner) {
        inner.textContent = 'Desde ' + fmtDate(profile.created_at, { month: 'short', year: 'numeric' });
        memberSince.style.display = 'inline-flex';
      } else {
        memberSince.style.display = 'none';
      }
    }

    const bio = $('#profile-bio');
    if (bio) {
      if (bioText) {
        bio.innerHTML = linkifyBio(bioText);
        bio.classList.remove('is-empty');
        bio.style.display = state.isEditing ? 'none' : 'block';
      } else if (ownerView) {
        bio.textContent = 'Adicione uma breve descricao para completar seu perfil.';
        bio.classList.add('is-empty');
        bio.style.display = state.isEditing ? 'none' : 'block';
      } else {
        bio.textContent = '';
        bio.classList.remove('is-empty');
        bio.style.display = 'none';
      }
    }

    if (!state.isEditing) syncFormFromProfile();

    const savedTabLabel = $('#saved-tab-label');
    if (savedTabLabel) savedTabLabel.textContent = savedLabel;

    const savedToolbarTitle = $('#saved-toolbar-title');
    if (savedToolbarTitle) savedToolbarTitle.textContent = savedTitle;

    const savedSelect = $('#profile-saved-kind');
    if (savedSelect) {
      savedSelect.style.display = state.isPublicView ? 'none' : '';
      savedSelect.value = state.savedKind || '';
    }

    const postsStatus = $('#profile-posts-status');
    if (postsStatus) postsStatus.style.display = state.isPublicView ? 'none' : '';

    const savedEmpty = $('#saved-empty');
    if (savedEmpty) savedEmpty.innerHTML = `<i class="fas fa-star"></i> ${esc(savedEmptyText)}`;
  }

  async function loadStats(authorId) {
    const client = getClient();
    if (!client || !authorId) return;

    try {
      let postQuery = client
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', authorId);
      if (state.isPublicView) postQuery = postQuery.eq('status', 'published');
      const postResult = await postQuery;

      if (typeof postResult.count === 'number') {
        const statPosts = $('#stat-posts');
        if (statPosts) statPosts.textContent = String(postResult.count);
        setBadgeCount('#badge-posts', postResult.count);
      }

      const commentResult = await client
        .from('comments')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', authorId);
      if (typeof commentResult.count === 'number') {
        const statComments = $('#stat-comments');
        if (statComments) statComments.textContent = String(commentResult.count);
        setBadgeCount('#badge-comments', commentResult.count);
      }

      const voteResult = await client
        .from('posts')
        .select('votos')
        .eq('author_id', authorId)
        .eq('status', 'published');
      if (Array.isArray(voteResult.data)) {
        const totalVotes = voteResult.data.reduce((sum, item) => sum + (Number(item && item.votos) || 0), 0);
        const statVotes = $('#stat-votes');
        if (statVotes) statVotes.textContent = String(totalVotes);
      }
    } catch (error) {
      console.warn('[Profile] loadStats:', error);
    }
  }

  async function loadSavedBadgeCount(authorId) {
    if (!window.KCAPI || !authorId) return;
    try {
      const count = state.isPublicView
        ? await window.KCAPI.getProfileHighlightsCount(authorId)
        : await window.KCAPI.getMySavedPostsCount({});
      setBadgeCount('#badge-saved', count);
    } catch (error) {
      console.warn('[Profile] loadSavedBadgeCount:', error);
    }
  }

  function renderPosts(items, append) {
    const list = $('#posts-list');
    const empty = $('#posts-empty');
    const loadMore = $('#posts-load-more');
    if (!list) return;

    if (!append) list.innerHTML = '';

    if (!Array.isArray(items) || !items.length) {
      if (!append && empty) empty.style.display = 'block';
      if (loadMore) loadMore.style.display = 'none';
      return;
    }

    if (empty) empty.style.display = 'none';

    items.forEach((post) => {
      const link = document.createElement('a');
      link.className = 'kc-profile-post-card';
      link.href = 'product.html?id=' + encodeURIComponent(post.uuid || post.id || '');
      const meta = [];
      meta.push(statusBadge(post.status || 'published'));
      if (post.module) meta.push(`<span><i class="fas fa-layer-group"></i> ${esc(post.module)}</span>`);
      if (post.category) meta.push(`<span>${esc(post.category)}</span>`);
      if (post.created_at) meta.push(`<span><i class="fas fa-clock"></i> ${esc(fmtRelative(post.created_at))}</span>`);

      link.innerHTML = [
        `<div class="kc-profile-post-card__title">${esc(post.title || 'Sem titulo')}</div>`,
        `<div class="kc-profile-post-card__meta">${meta.join('')}</div>`,
      ].join('');
      list.appendChild(link);
    });

    if (loadMore) loadMore.style.display = state.postHasMore ? 'block' : 'none';
  }

  async function loadPosts(reset) {
    const loading = $('#posts-loading');
    const empty = $('#posts-empty');
    const loadMore = $('#posts-load-more');

    if (reset) {
      state.postPage = 1;
      state.posts = [];
      const list = $('#posts-list');
      if (list) list.innerHTML = '';
    }

    if (loading) loading.style.display = 'block';
    if (empty) empty.style.display = 'none';
    if (loadMore) loadMore.style.display = 'none';

    try {
      const params = { page: state.postPage, limit: PAGE_SIZE };
      if (!state.isPublicView && state.postStatus) params.status = state.postStatus;

      const batch = state.isPublicView
        ? await window.KCAPI.getPostsByAuthorId(state.profileId, params)
        : await window.KCAPI.getMyPosts(params);

      const items = Array.isArray(batch) ? batch : [];
      state.posts = reset ? items : state.posts.concat(items);
      state.postHasMore = items.length >= PAGE_SIZE;
      renderPosts(reset ? state.posts : items, !reset);
    } catch (error) {
      console.warn('[Profile] loadPosts:', error);
    } finally {
      if (loading) loading.style.display = 'none';
    }
  }

  function renderComments(items, append) {
    const list = $('#comments-list');
    const empty = $('#comments-empty');
    const loadMore = $('#comments-load-more');
    if (!list) return;

    if (!append) list.innerHTML = '';

    if (!Array.isArray(items) || !items.length) {
      if (!append && empty) empty.style.display = 'block';
      if (loadMore) loadMore.style.display = 'none';
      return;
    }

    if (empty) empty.style.display = 'none';

    items.forEach((comment) => {
      const card = document.createElement('div');
      card.className = 'kc-profile-comment-card';
      const post = comment.post || {};
      const postTitle = post.title || post.titulo || 'Post';
      const postId = post.legacy_id || post.id || comment.post_id || '';
      const postUrl = postId ? 'product.html?id=' + encodeURIComponent(postId) : '';
      card.innerHTML = [
        `<div class="kc-profile-comment-card__body">${esc(comment.body || '')}</div>`,
        '<div class="kc-profile-comment-card__meta">',
        `<span><i class="fas fa-clock"></i> ${esc(fmtRelative(comment.created_at))}</span>`,
        postUrl ? `<span>em <a class="kc-profile-comment-card__post-link" href="${esc(postUrl)}">${esc(postTitle)}</a></span>` : '',
        '</div>',
      ].join('');
      list.appendChild(card);
    });

    if (loadMore) loadMore.style.display = state.commentHasMore ? 'block' : 'none';
  }

  async function fetchPostsByIds(client, postIds) {
    const ids = Array.from(new Set((Array.isArray(postIds) ? postIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)));

    if (!client || !ids.length) return Object.create(null);

    const postsById = Object.create(null);
    const chunkSize = 50;

    for (let index = 0; index < ids.length; index += chunkSize) {
      const batch = ids.slice(index, index + chunkSize);
      try {
        const result = await client
          .from('posts')
          .select('id, legacy_id, title')
          .in('id', batch);

        if (result && result.error) {
          console.warn('[Profile] fetchPostsByIds:', result.error);
          continue;
        }

        (Array.isArray(result && result.data) ? result.data : []).forEach((post) => {
          if (!post || !post.id) return;
          postsById[String(post.id)] = Object.assign({}, post, {
            titulo: post.title || '',
          });
        });
      } catch (error) {
        console.warn('[Profile] fetchPostsByIds:', error);
      }
    }

    return postsById;
  }

  async function loadProfileComments(client, authorId, options) {
    if (!client || !authorId) return [];

    let query = client
      .from('comments')
      .select('id, created_at, body, post_id')
      .eq('author_id', authorId)
      .order('created_at', { ascending: false });

    if (options && Number.isInteger(options.from) && Number.isInteger(options.to)) {
      query = query.range(options.from, options.to);
    } else if (options && Number.isInteger(options.limit)) {
      query = query.limit(options.limit);
    }

    const result = await query;
    if (result && result.error) throw result.error;

    const comments = Array.isArray(result && result.data) ? result.data : [];
    const postsById = await fetchPostsByIds(client, comments.map((comment) => comment && comment.post_id));

    return comments.map((comment) => {
      const postId = String((comment && comment.post_id) || '').trim();
      return Object.assign({}, comment, {
        post: postsById[postId] || null,
      });
    });
  }

  async function loadComments(reset) {
    const loading = $('#comments-loading');
    const empty = $('#comments-empty');
    const loadMore = $('#comments-load-more');

    if (reset) {
      state.commentPage = 1;
      state.comments = [];
      const list = $('#comments-list');
      if (list) list.innerHTML = '';
    }

    if (loading) loading.style.display = 'block';
    if (empty) empty.style.display = 'none';
    if (loadMore) loadMore.style.display = 'none';

    const client = getClient();
    const authorId = state.profileId || (state.user && state.user.id);
    if (!client || !authorId) {
      if (loading) loading.style.display = 'none';
      return;
    }

    try {
      const from = (state.commentPage - 1) * COMMENT_PAGE_SIZE;
      const to = from + COMMENT_PAGE_SIZE - 1;
      const payload = await loadProfileComments(client, authorId, { from, to });

      state.comments = reset ? payload : state.comments.concat(payload);
      state.commentHasMore = payload.length >= COMMENT_PAGE_SIZE;
      renderComments(reset ? state.comments : payload, !reset);
    } catch (error) {
      console.warn('[Profile] loadComments:', error);
    } finally {
      if (loading) loading.style.display = 'none';
    }
  }

  function renderSaved(items, append) {
    const list = $('#saved-list');
    const empty = $('#saved-empty');
    const loadMore = $('#saved-load-more');
    if (!list) return;

    if (!append) list.innerHTML = '';

    if (!Array.isArray(items) || !items.length) {
      if (!append && empty) empty.style.display = 'block';
      if (loadMore) loadMore.style.display = 'none';
      return;
    }

    if (empty) empty.style.display = 'none';

    items.forEach((item) => {
      const saveKinds = normalizeSaveKinds(item.save_kinds || item.save_kind || (state.isPublicView ? ['highlight'] : []));
      const badges = buildSaveBadges(saveKinds);
      const savedAt = item.saved_at || item.created_at || null;
      const meta = [];
      if (!state.isPublicView) meta.push(statusBadge(item.status || 'published'));
      if (badges) meta.push(badges);
      if (item.module) meta.push(`<span><i class="fas fa-layer-group"></i> ${esc(item.module)}</span>`);
      if (item.category) meta.push(`<span>${esc(item.category)}</span>`);
      if (savedAt) meta.push(`<span><i class="fas fa-clock"></i> ${esc(fmtRelative(savedAt))}</span>`);

      const link = document.createElement('a');
      link.className = 'kc-profile-post-card';
      link.href = 'product.html?id=' + encodeURIComponent(item.uuid || item.id || '');
      link.innerHTML = [
        `<div class="kc-profile-post-card__title">${esc(item.title || 'Sem titulo')}</div>`,
        `<div class="kc-profile-post-card__meta">${meta.join('')}</div>`,
      ].join('');
      list.appendChild(link);
    });

    if (loadMore) loadMore.style.display = state.savedHasMore ? 'block' : 'none';
  }

  async function loadSaved(reset) {
    const loading = $('#saved-loading');
    const empty = $('#saved-empty');
    const loadMore = $('#saved-load-more');

    if (reset) {
      state.savedPage = 1;
      state.savedItems = [];
      const list = $('#saved-list');
      if (list) list.innerHTML = '';
    }

    if (loading) loading.style.display = 'block';
    if (empty) empty.style.display = 'none';
    if (loadMore) loadMore.style.display = 'none';

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
    } catch (error) {
      console.warn('[Profile] loadSaved:', error);
    } finally {
      if (loading) loading.style.display = 'none';
    }
  }

  async function loadActivities() {
    const loading = $('#activities-loading');
    const list = $('#activities-list');
    const empty = $('#activities-empty');
    if (loading) loading.style.display = 'block';
    if (list) list.innerHTML = '';
    if (empty) empty.style.display = 'none';

    const client = getClient();
    const authorId = state.profileId || (state.user && state.user.id);
    const activities = [];

    try {
      const recentPosts = state.isPublicView
        ? await window.KCAPI.getPostsByAuthorId(authorId, { page: 1, limit: 8 })
        : await window.KCAPI.getMyPosts({ page: 1, limit: 8 });
      (Array.isArray(recentPosts) ? recentPosts : []).forEach((post) => {
        activities.push({
          type: 'post',
          date: post.created_at,
          title: post.title || 'Sem titulo',
          postId: post.uuid || post.id || '',
          status: post.status || 'published',
        });
      });
    } catch (_) { }

    if (client && authorId) {
      try {
        const commentPayload = await loadProfileComments(client, authorId, { limit: 8 });
        commentPayload.forEach((comment) => {
          const post = comment.post || {};
          activities.push({
            type: 'comment',
            date: comment.created_at,
            body: String(comment.body || '').slice(0, 120),
            title: post.title || post.titulo || 'Post',
            postId: post.legacy_id || post.id || comment.post_id || '',
          });
        });
      } catch (_) { }
    }

    activities.sort((left, right) => new Date(right.date) - new Date(left.date));
    if (loading) loading.style.display = 'none';

    if (!activities.length) {
      if (empty) empty.style.display = 'block';
      return;
    }

    if (list) {
      list.innerHTML = activities.slice(0, 20).map((item) => {
        const postUrl = 'product.html?id=' + encodeURIComponent(item.postId || '');
        if (item.type === 'post') {
          return [
            '<div class="kc-profile-activity-item">',
            '<div class="kc-profile-activity-icon"><i class="fas fa-newspaper"></i></div>',
            '<div class="kc-profile-activity-content">',
            `<div class="kc-profile-activity-label">Publicou <a href="${esc(postUrl)}">${esc(item.title)}</a> ${statusBadge(item.status)}</div>`,
            `<div class="kc-profile-activity-meta">${esc(fmtRelative(item.date))}</div>`,
            '</div>',
            '</div>',
          ].join('');
        }

        const preview = item.body
          ? `<div class="kc-profile-activity-meta" style="margin-top:4px;font-style:italic;color:var(--kc-text-dark);">"${esc(item.body)}${item.body.length >= 120 ? '...' : ''}"</div>`
          : '';
        return [
          '<div class="kc-profile-activity-item">',
          '<div class="kc-profile-activity-icon"><i class="fas fa-comment"></i></div>',
          '<div class="kc-profile-activity-content">',
          `<div class="kc-profile-activity-label">Comentou em <a href="${esc(postUrl)}">${esc(item.title)}</a></div>`,
          preview,
          `<div class="kc-profile-activity-meta" style="margin-top:4px;">${esc(fmtRelative(item.date))}</div>`,
          '</div>',
          '</div>',
        ].join('');
      }).join('');
    }
  }

  function switchTab(tabId) {
    state.activeTab = String(tabId || 'activities');
    $$('.kc-profile-tab').forEach((button) => {
      const active = button.getAttribute('data-kc-tab') === state.activeTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    $$('.kc-profile-tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === `tab-${state.activeTab}`);
    });

    if (state.activeTab === 'posts' && !state.posts.length) loadPosts(true);
    if (state.activeTab === 'comments' && !state.comments.length) loadComments(true);
    if (state.activeTab === 'saved' && !state.savedItems.length) loadSaved(true);
  }

  function setProfilePending(pending) {
    state.profilePending = !!pending;
    ['#profile-save-submit', '#profile-edit-cancel', '#profile-edit-toggle', '#profile-avatar-input'].forEach((selector) => {
      const element = $(selector);
      if (element) element.disabled = state.profilePending;
    });
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();
    if (!isOwnerView() || state.profilePending) return;

    const nameInput = $('#display-name-input');
    const bioInput = $('#profile-bio-input');
    const displayName = String((nameInput && nameInput.value) || '').trim().slice(0, 80);
    const bio = String((bioInput && bioInput.value) || '').trim().slice(0, BIO_LIMIT);

    if (!displayName) {
      setStatus('Informe um nome valido para o perfil.', 'warn');
      return;
    }

    setProfilePending(true);
    setStatus('Salvando perfil...', 'info');

    try {
      const patch = { display_name: displayName, bio };
      if (state.avatarFile) {
        const upload = await window.KCAPI.uploadProfileAvatar(state.avatarFile);
        if (!upload || !upload.ok || !upload.data || !upload.data.url) {
          setStatus((upload && upload.error && upload.error.message) || 'Nao foi possivel enviar sua foto.', 'error');
          return;
        }
        patch.avatar_url = upload.data.url;
      }

      const result = await window.KCAPI.updateMyProfile(patch);
      if (!result || !result.ok) {
        setStatus((result && result.error && result.error.message) || 'Nao foi possivel atualizar seu perfil.', 'error');
        return;
      }

      state.profile = result.data || state.profile;
      clearAvatarDraft();
      state.isEditing = false;
      renderHeader();
      const form = $('#profile-inline-form');
      if (form) form.classList.remove('is-active');
      setStatus('Perfil atualizado com sucesso.', 'success');
    } catch (error) {
      console.error('[Profile] handleProfileSubmit:', error);
      setStatus('Nao foi possivel atualizar seu perfil.', 'error');
    } finally {
      setProfilePending(false);
    }
  }

  function handleAvatarChange(event) {
    const file = event && event.target && event.target.files && event.target.files[0];
    if (!file) return;

    state.avatarFile = file;
    releaseAvatarPreview();
    try {
      state.avatarPreviewUrl = URL.createObjectURL(file);
    } catch (_) {
      state.avatarPreviewUrl = '';
    }

    if (!state.isEditing) setEditing(true);
    renderHeader();
    setStatus('Foto pronta para salvar.', 'info');
  }

  function bindProfileEditing() {
    const editToggle = $('#profile-edit-toggle');
    if (editToggle) {
      editToggle.addEventListener('click', () => {
        if (state.isEditing) {
          setEditing(false);
        } else {
          setEditing(true);
        }
      });
    }

    const cancel = $('#profile-edit-cancel');
    if (cancel) cancel.addEventListener('click', () => setEditing(false));

    const form = $('#profile-inline-form');
    if (form) form.addEventListener('submit', handleProfileSubmit);

    const bioInput = $('#profile-bio-input');
    if (bioInput) bioInput.addEventListener('input', updateBioCounter);

    const avatarInput = $('#profile-avatar-input');
    if (avatarInput) avatarInput.addEventListener('change', handleAvatarChange);
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
    } catch (error) {
      console.warn('[Profile] loadProfile:', error);
      state.profile = null;
    }

    if (!state.profile) return false;

    const client = getClient();
    if (client && !state.profile.created_at) {
      try {
        const extra = await client
          .from('profiles')
          .select('created_at, bio, avatar_url, display_name, full_name, verified')
          .eq('id', state.profileId)
          .maybeSingle();
        if (extra && extra.data) state.profile = Object.assign({}, state.profile, extra.data);
      } catch (_) { }
    }

    renderHeader();
    return true;
  }

  function showFatal(message) {
    const loading = $('#profile-loading');
    const content = $('#profile-content');
    if (content) content.style.display = 'none';
    if (loading) {
      loading.style.display = 'flex';
      loading.innerHTML = `<i class="fas fa-user-slash"></i> ${esc(message)}`;
    }
  }

  function bindTabsAndLists() {
    $$('[data-kc-tab]').forEach((button) => {
      button.addEventListener('click', () => switchTab(button.getAttribute('data-kc-tab')));
    });

    const postsStatus = $('#profile-posts-status');
    if (postsStatus) {
      postsStatus.addEventListener('change', (event) => {
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

    const postsMore = $('#posts-load-more');
    if (postsMore) postsMore.addEventListener('click', () => { state.postPage += 1; loadPosts(false); });

    const commentsMore = $('#comments-load-more');
    if (commentsMore) commentsMore.addEventListener('click', () => { state.commentPage += 1; loadComments(false); });

    const savedMore = $('#saved-load-more');
    if (savedMore) savedMore.addEventListener('click', () => { state.savedPage += 1; loadSaved(false); });
  }

  function bindProfileSyncListener() {
    document.addEventListener('kc:profilechange', (event) => {
      const profile = event && event.detail ? event.detail.profile : null;
      if (!profile || !state.profileId || String(profile.id || '') !== String(state.profileId)) return;
      state.profile = Object.assign({}, state.profile || {}, profile);
      renderHeader();
    });
  }

  async function init() {
    if (!window.KCAPI || typeof window.KCAPI.getCurrentUser !== 'function') return;

    const queryId = readProfileIdFromQuery();
    state.user = await window.KCAPI.getCurrentUser();

    if (queryId) {
      if (state.user && String(state.user.id) === String(queryId)) {
        state.isPublicView = false;
        state.profileId = state.user.id;
      } else {
        state.isPublicView = true;
        state.profileId = queryId;
      }
    } else {
      if (!state.user) {
        showFatal('Voce precisa estar logado para ver seu perfil.');
        setTimeout(() => { window.location.href = 'index.html#login'; }, 900);
        return;
      }
      state.isPublicView = false;
      state.profileId = state.user.id;
    }

    const loaded = await loadProfile();
    if (!loaded) {
      showFatal(state.isPublicView ? 'Perfil nao encontrado.' : 'Nao foi possivel carregar seu perfil.');
      return;
    }

    const loading = $('#profile-loading');
    if (loading) loading.style.display = 'none';
    const content = $('#profile-content');
    if (content) content.style.display = 'block';

    bindTabsAndLists();
    bindProfileEditing();
    bindProfileSyncListener();

    loadStats(state.profileId).catch(() => {});
    loadSavedBadgeCount(state.profileId).catch(() => {});
    loadActivities().catch(() => {});
    renderHeader();
    switchTab('activities');
  }

  window.addEventListener('beforeunload', releaseAvatarPreview);
  document.addEventListener('DOMContentLoaded', init);
})();

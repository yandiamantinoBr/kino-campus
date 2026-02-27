(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const state = {
    user: null,
    profile: null,
    postStatus: '',
    profileId: '',
    isPublicView: false,
  };

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

  function avatarUrl(profile, user) {
    if (profile && profile.avatar_url) return String(profile.avatar_url);
    const seed = (user && (user.email || user.id)) ? String(user.email || user.id) : 'kinocampus';
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed.toLowerCase())}`;
  }

  function deriveFallbackPublicIdentity(posts) {
    if (!Array.isArray(posts) || posts.length === 0) return null;
    const first = posts.find((post) => post && (post.authorName || post.autor || post.author || post.authorAvatar || post.autorAvatar));
    if (!first) return null;

    const name = String(first.authorName || first.autor || first.author || '').trim();
    const avatar = String(first.authorAvatar || first.autorAvatar || '').trim();
    if (!name && !avatar) return null;

    return {
      id: state.profileId,
      display_name: name || '',
      full_name: name || '',
      avatar_url: avatar || '',
      verified: false,
    };
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
    el.className = `kc-profile-feedback is-${tone || 'info'}`;
  }

  function renderHeader() {
    const p = state.profile || {};
    const user = state.user;

    const name = safeName(p, user);
    const verified = (p && p.verified === true);

    const avatar = $('#profile-avatar');
    if (avatar) avatar.src = avatarUrl(p, user);

    const nameEl = $('#profile-display-name');
    if (nameEl) nameEl.textContent = name;

    const badge = $('#profile-verified-badge');
    if (badge) {
      badge.className = verified ? 'kc-profile-badge is-verified' : 'kc-profile-badge is-unverified';
      badge.textContent = verified ? 'Verificado' : 'Não verificado';
    }

    const input = $('#display-name-input');
    if (input) input.value = p.display_name || p.full_name || '';
  }

  function applyViewModeUI() {
    const isPublic = state.isPublicView;

    const editForm = $('#display-name-form');
    const editCard = editForm ? editForm.closest('.kc-profile-card') : null;
    if (editCard) editCard.style.display = isPublic ? 'none' : 'block';

    const postsStatus = $('#profile-posts-status');
    const postsToolbar = postsStatus ? postsStatus.closest('.kc-profile-posts-toolbar') : null;
    const postsCard = postsToolbar ? postsToolbar.closest('.kc-profile-card') : null;
    const postsTitle = postsCard ? postsCard.querySelector('h2') : null;

    if (postsToolbar) postsToolbar.style.display = isPublic ? 'none' : 'flex';
    if (postsTitle) postsTitle.textContent = isPublic ? 'Posts do autor' : 'Meus posts';
  }

  function renderMyPosts(posts) {
    const loading = $('#profile-posts-loading');
    const empty = $('#profile-posts-empty');
    const list = $('#profile-posts-list');
    if (!list) return;

    if (loading) loading.style.display = 'none';
    list.innerHTML = '';

    if (!Array.isArray(posts) || posts.length === 0) {
      const emptyMsg = state.isPublicView
        ? 'Este autor ainda não publicou nada.'
        : (state.postStatus
          ? 'Você ainda não publicou nada com este status.'
          : 'Você ainda não publicou nada.');
      if (empty) empty.textContent = emptyMsg;
      if (empty) empty.style.display = 'block';
      return;
    }

    if (empty) empty.style.display = 'none';

    posts.forEach((post) => {
      const card = document.createElement('article');
      card.className = 'kc-profile-post';

      const title = document.createElement('a');
      title.className = 'kc-profile-post__title';
      title.href = `product.html?id=${encodeURIComponent(post.id || post.uuid || '')}`;
      title.textContent = post.title || 'Sem título';

      const meta = document.createElement('div');
      meta.className = 'kc-profile-post__meta';
      const dateStr = post.created_at ? new Date(post.created_at).toLocaleDateString('pt-BR') : 'Data indisponível';
      const status = String(post.status || 'published').toLowerCase();
      const label = ({
        published: 'Publicado',
        pending: 'Pendente',
        hidden: 'Oculto',
        deleted: 'Excluído',
      })[status] || status;
      meta.textContent = `${dateStr} • ${label}`;

      card.appendChild(title);
      card.appendChild(meta);
      list.appendChild(card);
    });
  }

  async function loadProfile() {
    const loading = $('#profile-loading');
    if (loading) loading.style.display = 'block';

    try {
      if (state.isPublicView) {
        state.profile = await window.KCAPI.getProfileById(state.profileId);
        if (!state.profile || (!state.profile.display_name && !state.profile.full_name)) {
          const fallbackPosts = await window.KCAPI.getPostsByAuthorId(state.profileId, { page: 1, limit: 1 });
          const fallbackProfile = deriveFallbackPublicIdentity(fallbackPosts);
          if (fallbackProfile) state.profile = fallbackProfile;
        }
      } else {
        state.profile = await window.KCAPI.getMyProfile();
        if (!state.profile && typeof window.KCAPI.syncProfile === 'function') {
          await window.KCAPI.syncProfile();
          state.profile = await window.KCAPI.getMyProfile();
        }
      }
      renderHeader();
    } catch (_) {
      state.profile = null;
      renderHeader();
      setStatus(state.isPublicView ? 'Não foi possível carregar este perfil agora.' : 'Não foi possível carregar seu perfil agora.', 'warn');
    }

    if (loading) loading.style.display = 'none';
    const content = $('#profile-content');
    if (content) content.style.display = 'block';
  }

  async function loadMyPosts() {
    const loading = $('#profile-posts-loading');
    if (loading) loading.style.display = 'block';
    const list = $('#profile-posts-list');
    if (list) list.innerHTML = '';
    const empty = $('#profile-posts-empty');
    if (empty) empty.style.display = 'none';

    try {
      const query = { page: 1, limit: 20 };
      if (!state.isPublicView && state.postStatus) query.status = state.postStatus;
      const posts = state.isPublicView
        ? await window.KCAPI.getPostsByAuthorId(state.profileId, query)
        : await window.KCAPI.getMyPosts(query);
      renderMyPosts(posts);
    } catch (_) {
      if (loading) loading.style.display = 'none';
      setStatus(state.isPublicView ? 'Não foi possível carregar os posts deste autor.' : 'Não foi possível carregar seus posts no momento.', 'warn');
      renderMyPosts([]);
    }
  }

  async function onSaveDisplayName(evt) {
    evt.preventDefault();
    const input = $('#display-name-input');
    const submit = $('#display-name-submit');
    if (!input) return;

    const displayName = String(input.value || '').trim();
    if (!displayName) {
      setStatus('Informe um nome válido.', 'warn');
      return;
    }

    setStatus('Salvando nome…', 'info');
    if (submit) submit.disabled = true;

    try {
      const result = await window.KCAPI.updateMyProfile({ display_name: displayName });

      if (!result || !result.ok) {
        setStatus('No momento, não é possível alterar seu nome. Tente novamente mais tarde.', 'error');
        return;
      }

      if (result.data) {
        state.profile = result.data;
      } else {
        state.profile = await window.KCAPI.getMyProfile();
      }
      renderHeader();
      setStatus('Nome atualizado.', 'success');
    } catch (_) {
      setStatus('No momento, não é possível alterar seu nome. Tente novamente mais tarde.', 'error');
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function onPostsStatusChange(evt) {
    const value = String((evt && evt.target && evt.target.value) || '').trim().toLowerCase();
    state.postStatus = value;
    await loadMyPosts();
  }

  async function init() {
    if (!window.KCAPI || typeof window.KCAPI.getCurrentUser !== 'function') return;

    state.profileId = readProfileIdFromQuery();
    state.isPublicView = !!state.profileId;

    applyViewModeUI();

    if (state.isPublicView) {
      await loadProfile();
      await loadMyPosts();
      return;
    }

    state.user = await window.KCAPI.getCurrentUser();
    if (!state.user) {
      setStatus('Você precisa estar logado para ver seu perfil.', 'warn');
      setTimeout(() => {
        window.location.href = 'index.html#login';
      }, 900);
      return;
    }

    const form = $('#display-name-form');
    if (form) form.addEventListener('submit', onSaveDisplayName);
    const statusFilter = $('#profile-posts-status');
    if (statusFilter) {
      statusFilter.addEventListener('change', onPostsStatusChange);
      state.postStatus = String(statusFilter.value || '').trim().toLowerCase();
    }

    await loadProfile();
    await loadMyPosts();
  }

  document.addEventListener('DOMContentLoaded', init);
})();

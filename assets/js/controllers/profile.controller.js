(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const state = {
    user: null,
    profile: null,
  };

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

  function renderMyPosts(posts) {
    const loading = $('#profile-posts-loading');
    const empty = $('#profile-posts-empty');
    const list = $('#profile-posts-list');
    if (!list) return;

    if (loading) loading.style.display = 'none';
    list.innerHTML = '';

    if (!Array.isArray(posts) || posts.length === 0) {
      if (empty) empty.style.display = 'block';
      return;
    }

    if (empty) empty.style.display = 'none';

    posts.forEach((post) => {
      const card = document.createElement('article');
      card.className = 'kc-profile-post';

      const title = document.createElement('a');
      title.className = 'kc-profile-post__title';
      title.href = `product.html?id=${encodeURIComponent(post.id)}`;
      title.textContent = post.title || 'Sem título';

      const meta = document.createElement('div');
      meta.className = 'kc-profile-post__meta';
      const dateStr = post.created_at ? new Date(post.created_at).toLocaleDateString('pt-BR') : 'Data indisponível';
      meta.textContent = `${dateStr} • ${post.status || 'published'}`;

      card.appendChild(title);
      card.appendChild(meta);
      list.appendChild(card);
    });
  }

  async function loadProfile() {
    const loading = $('#profile-loading');
    if (loading) loading.style.display = 'block';

    state.profile = await window.KCAPI.getMyProfile();
    renderHeader();

    if (loading) loading.style.display = 'none';
    const content = $('#profile-content');
    if (content) content.style.display = 'block';
  }

  async function loadMyPosts() {
    const loading = $('#profile-posts-loading');
    if (loading) loading.style.display = 'block';

    const posts = await window.KCAPI.getMyPosts({ page: 1, limit: 20 });
    renderMyPosts(posts);
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

    const result = await window.KCAPI.updateMyProfile({ display_name: displayName });

    if (!result || !result.ok) {
      setStatus('No momento, não é possível alterar seu nome. Tente novamente mais tarde.', 'error');
      if (submit) submit.disabled = false;
      return;
    }

    state.profile = result.data || state.profile;
    renderHeader();
    setStatus('Nome atualizado.', 'success');
    if (submit) submit.disabled = false;
  }

  async function init() {
    if (!window.KCAPI || typeof window.KCAPI.getCurrentUser !== 'function') return;

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

    await loadProfile();
    await loadMyPosts();
  }

  document.addEventListener('DOMContentLoaded', init);
})();

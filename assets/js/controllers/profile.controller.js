(function () {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const PAGE_SIZE = 12;
  const COMMENT_PAGE_SIZE = 15;
  const BIO_LIMIT = 200;
  const shared = window.KCAccountProfileUtils || {};

  const state = {
    user: null,
    profile: null,
    profileId: '',
    isPublicView: false,
    viewerAuthenticated: false,
    restrictedProfile: false,
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
    ratings: [],
    ratingPage: 1,
    ratingHasMore: false,
    ratingSummary: { average: null, count: 0 },
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
    return 'Usuário';
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

  function buildAccountSetupHref() {
    const base = '/account-setup.html';
    const next = `/profile.html${state.profileId ? `?id=${encodeURIComponent(state.profileId)}` : ''}`;
    if (shared && typeof shared.normalizeNextPath === 'function') {
      return `${base}?next=${encodeURIComponent(shared.normalizeNextPath(next, '/profile.html'))}`;
    }
    return `${base}?next=${encodeURIComponent(next)}`;
  }

  function buildSettingsHref() {
    const base = '/settings.html';
    const next = `/profile.html${state.profileId ? `?id=${encodeURIComponent(state.profileId)}` : ''}`;
    if (shared && typeof shared.normalizeNextPath === 'function') {
      return `${base}?next=${encodeURIComponent(shared.normalizeNextPath(next, '/profile.html'))}`;
    }
    return `${base}?next=${encodeURIComponent(next)}`;
  }

  function formatChoice(field, value) {
    if (!value) return '';
    if (shared && typeof shared.formatProfileValue === 'function') {
      return shared.formatProfileValue(field, value);
    }
    return String(value || '').trim();
  }

  function getProfileVisibleSocialLinks(profile) {
    if (shared && typeof shared.getVisibleSocialLinks === 'function') {
      return shared.getVisibleSocialLinks(profile || {});
    }
    return [];
  }

  function currentAvatarUrl() {
    if (state.avatarPreviewUrl) return state.avatarPreviewUrl;
    const avatarUrl = state.profile && state.profile.avatar_url ? String(state.profile.avatar_url) : '';
    if (avatarUrl) return avatarUrl;
    if (shared && typeof shared.buildDefaultAvatarDataUrl === 'function') {
      return shared.buildDefaultAvatarDataUrl(safeName(state.profile || {}, state.user || null));
    }
    return '';
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
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `há ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `há ${days} dia${days > 1 ? 's' : ''}`;
    return fmtDate(iso);
  }

  function buildPostDetailHref(postId) {
    const normalized = String(postId || '').trim();
    if (!normalized) return '';
    if (window.KCUtils && typeof window.KCUtils.buildProductDetailHref === 'function') {
      return window.KCUtils.buildProductDetailHref(normalized);
    }
    return `_product.html?id=${encodeURIComponent(normalized)}`;
  }

  function statusBadge(status) {
    const key = String(status || 'published').trim().toLowerCase();
    const labels = {
      published: 'Publicado',
      pending: 'Pendente',
      hidden: 'Oculto',
      deleted: 'Excluído',
    };
    return `<span class="kc-status-badge kc-status-badge--${esc(key)}">${esc(labels[key] || key)}</span>`;
  }

  function visibilityBadge(visibility) {
    const key = String(visibility || 'public').trim().toLowerCase();
    const labels = {
      public: 'Público',
      community: 'Comunidade',
    };
    const icon = key === 'community' ? 'fas fa-user-group' : 'fas fa-globe';
    return `<span class="kc-profile-save-badge kc-profile-save-badge--later"><i class="${esc(icon)}"></i> ${esc(labels[key] || 'Público')}</span>`;
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

  function normalizeRatingSummary(raw, fallbackUserId) {
    const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    const averageRaw = source.average != null ? source.average : source.rating_avg;
    const average = (averageRaw != null && averageRaw !== '') ? Number(averageRaw) : null;
    const countRaw = source.count != null ? source.count : source.rating_count;
    const count = Math.max(0, parseInt(String(countRaw != null ? countRaw : 0), 10) || 0);
    return {
      userId: String(source.userId || source.user_id || fallbackUserId || '').trim() || null,
      average: Number.isFinite(average) ? Number(average.toFixed(2)) : null,
      count,
    };
  }

  function getProfileRatingSummaryFromProfile(profile) {
    return normalizeRatingSummary({
      userId: profile && profile.id,
      average: profile && (profile.ratingAvg != null ? profile.ratingAvg : profile.rating_avg),
      count: profile && (profile.ratingCount != null ? profile.ratingCount : profile.rating_count),
    }, profile && profile.id);
  }

  function renderProfileRatingSummary() {
    const summary = normalizeRatingSummary(state.ratingSummary, state.profileId || (state.profile && state.profile.id));
    const statValue = $('#stat-rating');
    const statLabel = $('#stat-rating-label');
    if (statValue) statValue.textContent = (summary.count > 0 && Number.isFinite(summary.average)) ? summary.average.toFixed(1) : '–';
    if (statLabel) statLabel.textContent = summary.count > 0
      ? `Reputação (${summary.count})`
      : 'Reputação';
    setBadgeCount('#badge-ratings', summary.count);
  }

  function buildRatingStars(score) {
    const value = Math.max(0, Math.min(5, parseInt(String(score != null ? score : 0), 10) || 0));
    const output = [];
    for (let index = 1; index <= 5; index += 1) {
      output.push(`<i class="fas fa-star${index <= value ? ' is-active' : ''}"></i>`);
    }
    return output.join('');
  }

  function isOwnerView() {
    return !state.isPublicView;
  }

  async function probeRestrictedProfile(profileId) {
    const client = getClient();
    if (!client || !profileId || state.viewerAuthenticated) return false;

    try {
      const response = await client.rpc('kc_get_profile_access_state', { p_profile_id: profileId });
      if (response && response.error) return false;
      const row = Array.isArray(response && response.data) ? response.data[0] : response && response.data;
      return !!(row && row.exists === true && row.profile_public === false);
    } catch (_) {
      return false;
    }
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
        ? '<i class="fas fa-times"></i> Fechar edição'
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
      ? 'Nenhum destaque público encontrado.'
      : 'Nenhuma publicação salva ainda.';

    const avatar = $('#profile-avatar');
    if (avatar) {
      avatar.src = currentAvatarUrl();
      avatar.alt = `Avatar de ${name}`;
    }

    // Set user ID on avatar wrap for ranking badge decoration
    const avatarWrap = $('#profileAvatarWrap');
    if (avatarWrap && state.profileId) {
      avatarWrap.dataset.userId = state.profileId;
    }

    const verifiedIcon = $('#profile-verified-icon');
    if (verifiedIcon) verifiedIcon.style.display = profile && profile.verified === true ? 'flex' : 'none';

    const avatarEdit = $('#profile-avatar-edit');
    if (avatarEdit) avatarEdit.style.display = ownerView ? 'inline-flex' : 'none';

    const editToggle = $('#profile-edit-toggle');
    if (editToggle) {
      editToggle.style.display = ownerView ? 'inline-flex' : 'none';
      const onboardingComplete = !(shared && typeof shared.isOnboardingComplete === 'function') || shared.isOnboardingComplete(profile);
      editToggle.innerHTML = onboardingComplete
        ? '<i class="fas fa-sliders"></i> Configurações'
        : '<i class="fas fa-list-check"></i> Completar cadastro';
    }

    const nameEl = $('#profile-display-name');
    if (nameEl) nameEl.textContent = name;
    document.title = name + ' — Perfil KinoCampus';

    const legacyBadge = $('#profile-legacy-badge');
    if (legacyBadge) {
      const isLegacy = !!(profile && String(profile.legacy_id || profile.legacyId || '').trim());
      legacyBadge.style.display = isLegacy ? '' : 'none';
    }

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
        bio.textContent = 'Adicione uma breve descrição para completar seu perfil.';
        bio.classList.add('is-empty');
        bio.style.display = state.isEditing ? 'none' : 'block';
      } else {
        bio.textContent = '';
        bio.classList.remove('is-empty');
        bio.style.display = 'none';
      }
    }

    const meta = $('.kc-profile-meta');
    if (meta) {
      meta.innerHTML = '';
      if (profile && profile.created_at) {
        meta.insertAdjacentHTML('beforeend', `<span id="profile-member-since"><i class="fas fa-calendar-alt"></i> <span>Desde ${esc(fmtDate(profile.created_at, { month: 'short', year: 'numeric' }))}</span></span>`);
      }
      if (profile.affiliation) {
        const affiliationLabel = formatChoice('affiliation', profile.affiliation);
        if (affiliationLabel) meta.insertAdjacentHTML('beforeend', `<span><i class="fas fa-user-graduate"></i> ${esc(affiliationLabel)}</span>`);
      }
    }

    const contextPills = $('#profile-context-pills');
    if (contextPills) {
      contextPills.innerHTML = '';
      contextPills.style.display = 'none';
    }

    const socialLinksWrap = $('#profile-social-links');
    const visibleLinks = getProfileVisibleSocialLinks(profile);
    if (socialLinksWrap) {
      socialLinksWrap.innerHTML = visibleLinks.map((entry) => {
        const label = entry.display || entry.handle || entry.label;
        const iconHtml = entry.key === 'x'
          ? `<span class="kc-profile-social-glyph" aria-hidden="true">${esc(entry.emoji || '𝕏')}</span>`
          : `<i class="${esc(entry.iconClass || 'fas fa-link')}" aria-hidden="true"></i>`;
        return `<a class="kc-profile-social-link" href="${esc(entry.href)}" target="_blank" rel="noopener noreferrer">${iconHtml}<span>${esc(label)}</span></a>`;
      }).join('');
      socialLinksWrap.style.display = visibleLinks.length ? 'flex' : 'none';
    }

    const setupHint = $('#profile-setup-hint');
    if (setupHint) {
      const onboardingComplete = !shared.isOnboardingComplete || shared.isOnboardingComplete(profile);
      if (ownerView && (!visibleLinks.length || !onboardingComplete)) {
        setupHint.innerHTML = `Complete seus links e preferências de contato em <a href="${esc(buildAccountSetupHref())}">completar cadastro</a>.`;
        setupHint.style.display = 'block';
      } else if (ownerView) {
        setupHint.innerHTML = `Você pode ajustar seus links públicos e o contato principal dos anúncios em <a href="${esc(buildSettingsHref())}">configurações</a>.`;
        setupHint.style.display = 'block';
      } else {
        setupHint.textContent = '';
        setupHint.style.display = 'none';
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

    state.ratingSummary = normalizeRatingSummary(state.ratingSummary && state.ratingSummary.count
      ? state.ratingSummary
      : getProfileRatingSummaryFromProfile(profile), state.profileId || profile.id);
    renderProfileRatingSummary();
  }

  async function loadStats(authorId) {
    const client = getClient();
    if (!authorId) return;

    try {
      if (client) {
        let postQuery = client
          .from('posts')
          .select('id', { count: 'exact', head: true })
          .eq('author_id', authorId);
        if (state.isPublicView) postQuery = postQuery.eq('status', 'published').eq('visibility', 'public');
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

        let voteQuery = client
          .from('posts')
          .select('votos')
          .eq('author_id', authorId)
          .eq('status', 'published');
        if (state.isPublicView) voteQuery = voteQuery.eq('visibility', 'public');
        const voteResult = await voteQuery;
        if (Array.isArray(voteResult.data)) {
          const totalVotes = voteResult.data.reduce((sum, item) => sum + (Number(item && item.votos) || 0), 0);
          const statVotes = $('#stat-votes');
          if (statVotes) statVotes.textContent = String(totalVotes);
        }
      }

      if (window.KCAPI && typeof window.KCAPI.getUserRatingSummary === 'function') {
        state.ratingSummary = normalizeRatingSummary(await window.KCAPI.getUserRatingSummary(authorId), authorId);
      } else {
        state.ratingSummary = getProfileRatingSummaryFromProfile(state.profile || {});
      }
      renderProfileRatingSummary();
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
      const isLegacy = !!String(post.legacy_id || post.legacyId || '').trim();
      link.className = 'kc-profile-post-card' + (isLegacy ? ' kc-profile-post-card--example' : '');
      link.href = buildPostDetailHref(post.uuid || post.id || '');
      const meta = [];
      meta.push(statusBadge(post.status || 'published'));
      if (!state.isPublicView) meta.push(visibilityBadge(post.visibility || 'public'));
      if (post.module) meta.push(`<span><i class="fas fa-layer-group"></i> ${esc(post.module)}</span>`);
      if (post.category) meta.push(`<span>${esc(post.category)}</span>`);
      if (post.created_at) meta.push(`<span><i class="fas fa-clock"></i> ${esc(fmtRelative(post.created_at))}</span>`);
      if (isLegacy) meta.push(`<span class="kc-badge kc-badge--example"><i class="fas fa-flask"></i> Exemplo</span>`);

      link.innerHTML = [
        `<div class="kc-profile-post-card__title">${esc(post.title || 'Sem título')}</div>`,
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
      if (empty) empty.style.display = 'block';
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
      const postUrl = buildPostDetailHref(postId);
      card.innerHTML = [
        `<div class="kc-profile-comment-card__body">${renderInlineRichText(comment.body || '')}</div>`,
        '<div class="kc-profile-comment-card__meta">',
        `<span><i class="fas fa-clock"></i> ${esc(fmtRelative(comment.created_at))}</span>`,
        postUrl ? `<span>em <a class="kc-profile-comment-card__post-link" href="${esc(postUrl)}">${esc(postTitle)}</a></span>` : '',
        '</div>',
      ].join('');
      list.appendChild(card);
    });

    if (loadMore) loadMore.style.display = state.commentHasMore ? 'block' : 'none';
  }

  function renderInlineRichText(text) {
    const source = String(text || '').trim();
    if (!source) return '';
    if (typeof window.renderCommentMarkdownInline === 'function') {
      return window.renderCommentMarkdownInline(source);
    }
    return linkifyBio(source);
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
      if (empty) empty.style.display = 'block';
    } finally {
      if (loading) loading.style.display = 'none';
    }
  }

  function renderRatings(items, append) {
    const list = $('#ratings-list');
    const empty = $('#ratings-empty');
    const loadMore = $('#ratings-load-more');
    if (!list) return;

    if (!append) list.innerHTML = '';

    if (!Array.isArray(items) || !items.length) {
      if (!append && empty) empty.style.display = 'block';
      if (loadMore) loadMore.style.display = 'none';
      return;
    }

    if (empty) empty.style.display = 'none';

    items.forEach((entry) => {
      const card = document.createElement('article');
      const reviewer = (entry && entry.reviewer && typeof entry.reviewer === 'object') ? entry.reviewer : {};
      const isPublicReviewer = reviewer.public === true;
      const reviewerName = isPublicReviewer
        ? (reviewer.displayName || reviewer.display_name || 'Membro da comunidade')
        : 'Membro da comunidade';
      const avatarHtml = (isPublicReviewer && reviewer.avatarUrl)
        ? `<img class="kc-profile-rating-card__avatar" src="${esc(reviewer.avatarUrl)}" alt="Avatar de ${esc(reviewerName)}" />`
        : '<span class="kc-profile-rating-card__avatar-placeholder" aria-hidden="true"><i class="fas fa-user"></i></span>';
      const comment = String(entry && entry.comment || '').trim();
      const commentHtml = comment
        ? `<div class="kc-profile-rating-card__comment">${renderInlineRichText(comment)}</div>`
        : '<div class="kc-profile-rating-card__comment is-empty">O avaliador não deixou comentário.</div>';

      card.className = 'kc-profile-rating-card';
      card.innerHTML = [
        '<div class="kc-profile-rating-card__top">',
        '<div class="kc-profile-rating-card__reviewer">',
        avatarHtml,
        '<div class="kc-profile-rating-card__reviewer-copy">',
        `<div class="kc-profile-rating-card__reviewer-name">${esc(reviewerName)}</div>`,
        '<div class="kc-profile-rating-card__reviewer-meta">',
        `<span><i class="fas fa-clock"></i> ${esc(fmtRelative(entry && entry.createdAt))}</span>`,
        (entry && entry.contextPostId) ? '<span><i class="fas fa-link"></i> Interação registrada</span>' : '',
        '</div>',
        '</div>',
        '</div>',
        `<div class="kc-profile-rating-card__stars" aria-label="${esc(String(entry && entry.rating || 0))} estrelas">${buildRatingStars(entry && entry.rating)}<span class="kc-profile-rating-card__score">${esc(String(entry && entry.rating || 0))}/5</span></div>`,
        '</div>',
        commentHtml,
      ].join('');
      list.appendChild(card);
    });

    if (loadMore) loadMore.style.display = state.ratingHasMore ? 'block' : 'none';
  }

  async function loadRatings(reset) {
    const loading = $('#ratings-loading');
    const empty = $('#ratings-empty');
    const loadMore = $('#ratings-load-more');

    if (reset) {
      state.ratingPage = 1;
      state.ratings = [];
      const list = $('#ratings-list');
      if (list) list.innerHTML = '';
    }

    if (loading) loading.style.display = 'block';
    if (empty) empty.style.display = 'none';
    if (loadMore) loadMore.style.display = 'none';

    try {
      const payload = await window.KCAPI.listUserRatings(state.profileId, {
        page: state.ratingPage,
        limit: 10,
      });
      const items = Array.isArray(payload && payload.items) ? payload.items : [];
      state.ratings = reset ? items : state.ratings.concat(items);
      state.ratingHasMore = !!(payload && payload.hasMore === true);
      if (payload && typeof payload.total === 'number') {
        const currentSummary = normalizeRatingSummary(state.ratingSummary, state.profileId);
        state.ratingSummary = normalizeRatingSummary({
          userId: state.profileId,
          average: currentSummary.average,
          count: payload.total,
        }, state.profileId);
        renderProfileRatingSummary();
      }
      renderRatings(reset ? state.ratings : items, !reset);
    } catch (error) {
      console.warn('[Profile] loadRatings:', error);
      if (empty) empty.style.display = 'block';
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
      if (!state.isPublicView) meta.push(visibilityBadge(item.visibility || 'public'));
      if (badges) meta.push(badges);
      if (item.module) meta.push(`<span><i class="fas fa-layer-group"></i> ${esc(item.module)}</span>`);
      if (item.category) meta.push(`<span>${esc(item.category)}</span>`);
      if (savedAt) meta.push(`<span><i class="fas fa-clock"></i> ${esc(fmtRelative(savedAt))}</span>`);

      const link = document.createElement('a');
      link.className = 'kc-profile-post-card';
      link.href = buildPostDetailHref(item.uuid || item.id || '');
      link.innerHTML = [
        `<div class="kc-profile-post-card__title">${esc(item.title || 'Sem título')}</div>`,
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
      if (empty) empty.style.display = 'block';
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
          title: post.title || 'Sem título',
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
        const postUrl = buildPostDetailHref(item.postId || '');
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

        const rawPreview = String(item.body || '').trim();
        const bodyPreview = rawPreview.length > 120 ? `${rawPreview.slice(0, 120)}...` : rawPreview;
        const preview = bodyPreview
          ? `<div class="kc-profile-activity-meta kc-profile-activity-meta--excerpt">${renderInlineRichText(bodyPreview)}</div>`
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
    if (state.activeTab === 'ratings' && !state.ratings.length) loadRatings(true);
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
      setStatus('Informe um nome válido para o perfil.', 'warn');
      return;
    }

    setProfilePending(true);
    setStatus('Salvando perfil...', 'info');

    try {
      const patch = { display_name: displayName, bio };
      if (state.avatarFile) {
        const upload = await window.KCAPI.uploadProfileAvatar(state.avatarFile);
        if (!upload || !upload.ok || !upload.data || !upload.data.url) {
          setStatus((upload && upload.error && upload.error.message) || 'Não foi possível enviar sua foto.', 'error');
          return;
        }
        patch.avatar_url = upload.data.url;
      }

      const result = await window.KCAPI.updateMyProfile(patch);
      if (!result || !result.ok) {
        setStatus((result && result.error && result.error.message) || 'Não foi possível atualizar seu perfil.', 'error');
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
      setStatus('Não foi possível atualizar seu perfil.', 'error');
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
        const profile = state.profile || {};
        const target = shared && typeof shared.isOnboardingComplete === 'function' && !shared.isOnboardingComplete(profile)
          ? buildAccountSetupHref()
          : buildSettingsHref();
        window.location.href = target;
      });
    }

    const avatarEdit = $('#profile-avatar-edit');
    if (avatarEdit) {
      avatarEdit.addEventListener('click', () => {
        window.location.href = buildAccountSetupHref();
      });
    }
  }

  async function loadProfile() {
    try {
      if (state.isPublicView) {
        state.profile = await window.KCAPI.getProfileById(state.profileId);
      } else {
        state.profile = typeof window.KCAPI.getCurrentProfile === 'function'
          ? window.KCAPI.getCurrentProfile()
          : null;
        if (state.profile && state.user && String(state.profile.id || '') !== String(state.user.id || '')) {
          state.profile = null;
        }
        if (!state.profile) {
          state.profile = await window.KCAPI.getMyProfile();
        }
        if (!state.profile && typeof window.KCAPI.syncProfile === 'function') {
          await window.KCAPI.syncProfile();
          state.profile = typeof window.KCAPI.getCurrentProfile === 'function'
            ? window.KCAPI.getCurrentProfile()
            : null;
          if (!state.profile) {
            state.profile = await window.KCAPI.getMyProfile();
          }
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
          .select('created_at, bio, avatar_url, display_name, full_name, verified, legacy_id')
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

  function showRestrictedProfile() {
    const loading = $('#profile-loading');
    const content = $('#profile-content');
    if (content) content.style.display = 'none';
    if (loading) {
      loading.style.display = 'flex';
      loading.innerHTML = [
        '<div style="display:grid;gap:12px;justify-items:center;max-width:420px;text-align:center;">',
        '<i class="fas fa-user-lock" style="font-size:2rem;color:var(--kc-primary-brand);"></i>',
        '<strong>Este perfil está visível apenas para quem faz parte da comunidade.</strong>',
        '<span>Entre na plataforma para ver esta página e outros conteúdos restritos à comunidade KinoCampus.</span>',
        '<a href="/index.html#login" data-kc-login="true" style="display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:999px;background:var(--kc-primary-brand);color:#fff;text-decoration:none;font-weight:700;"><i class="fas fa-right-to-bracket"></i>Entrar na comunidade</a>',
        '</div>',
      ].join('');
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

    const ratingsMore = $('#ratings-load-more');
    if (ratingsMore) ratingsMore.addEventListener('click', () => { state.ratingPage += 1; loadRatings(false); });
  }

  function bindProfileSyncListener() {
    document.addEventListener('kc:profilechange', (event) => {
      const profile = event && event.detail ? event.detail.profile : null;
      if (!profile || !state.profileId || String(profile.id || '') !== String(state.profileId)) return;
      state.profile = Object.assign({}, state.profile || {}, profile);
      renderHeader();
    });
  }

  async function refreshProfilePage() {
    setStatus('Atualizando perfil...', 'info');
    try {
      state.user = window.KCSupabase && typeof window.KCSupabase.getUser === 'function'
        ? window.KCSupabase.getUser()
        : state.user;
      if (!state.user && window.KCAPI && typeof window.KCAPI.getCurrentUser === 'function') {
        state.user = await window.KCAPI.getCurrentUser();
      }
      state.viewerAuthenticated = !!state.user;

      const loaded = await loadProfile();
      if (!loaded) {
        setStatus('Não foi possível atualizar este perfil agora.', 'error');
        return;
      }

      const tasks = [
        loadStats(state.profileId),
        loadSavedBadgeCount(state.profileId),
        loadActivities(),
      ];

      if (state.activeTab === 'posts' || state.posts.length) tasks.push(loadPosts(true));
      if (state.activeTab === 'comments' || state.comments.length) tasks.push(loadComments(true));
      if (state.activeTab === 'saved' || state.savedItems.length) tasks.push(loadSaved(true));
      if (state.activeTab === 'ratings' || state.ratings.length) tasks.push(loadRatings(true));

      await Promise.allSettled(tasks);
      renderHeader();
      setStatus('Perfil atualizado.', 'success');
    } catch (error) {
      console.error('[Profile] refresh failed:', error);
      setStatus('Não foi possível atualizar este perfil agora.', 'error');
    }
  }

  function initPullToRefresh() {
    if (!window.KCPullToRefresh || document.body.dataset.kcProfilePtrReady === '1') return;
    document.body.dataset.kcProfilePtrReady = '1';
    window.KCPullToRefresh.init({
      container: document.body,
      onRefresh: refreshProfilePage,
    });
  }

  async function init() {
    if (!window.KCAPI || typeof window.KCAPI.getCurrentUser !== 'function') return;

    const queryId = readProfileIdFromQuery();
    state.user = window.KCSupabase && typeof window.KCSupabase.getUser === 'function'
      ? window.KCSupabase.getUser()
      : null;
    if (!state.user) {
      state.user = await window.KCAPI.getCurrentUser();
    }
    state.viewerAuthenticated = !!state.user;

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
        showFatal('Você precisa estar logado para ver seu perfil.');
        setTimeout(() => { window.location.href = 'index.html#login'; }, 900);
        return;
      }
      state.isPublicView = false;
      state.profileId = state.user.id;
    }

    const loaded = await loadProfile();
    if (!loaded) {
      if (state.isPublicView && !state.viewerAuthenticated) {
        const restricted = await probeRestrictedProfile(state.profileId);
        if (restricted) {
          state.restrictedProfile = true;
          showRestrictedProfile();
          return;
        }
      }
      showFatal(state.isPublicView ? 'Perfil não encontrado.' : 'Não foi possível carregar seu perfil.');
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
    initPullToRefresh();

    // Load ranking badges for this profile user
    if (state.profileId && window.KCAPI && typeof window.KCAPI.getTopContributors === 'function') {
      var pid = state.profileId;
      // Load general ranking + all module rankings to decorate profile avatar
      var modules = [null, 'compra-venda', 'moradia', 'caronas', 'eventos', 'oportunidades', 'achados-perdidos'];
      modules.forEach(function (mod) {
        window.KCAPI.getTopContributors('month', mod, 10).then(function (users) {
          if (users && users.length && window.KCRanking) {
            window.KCRanking.decorateAuthorAvatars(users, mod);
          }
        }).catch(function () {});
      });
    }
  }

  window.KCProfileRefresh = refreshProfilePage;
  window.addEventListener('beforeunload', releaseAvatarPreview);
  document.addEventListener('DOMContentLoaded', init);
})();


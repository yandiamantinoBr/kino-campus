(function () {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const PAGE_SIZE = 12;
  const COMMENT_PAGE_SIZE = 15;
  const BIO_LIMIT = 200;
  const shared = window.KCAccountProfileUtils || {};
  window._KCPR = window._KCPR || {};
  window._KCPR.presentation = window._KCPR.presentation || {};
  window._KCPR.collections = window._KCPR.collections || {};

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

  // ─── SWR / Cache ────────────────────────────────────────────────────────────

  const PROFILE_CACHE_MAX_AGE_MS = 1000 * 60 * 10; // 10 min

  function getSessionStore() {
    return (window.KCSessionStore && typeof window.KCSessionStore.getStore === 'function')
      ? window.KCSessionStore.getStore() : null;
  }

  function profileCacheKey() {
    const prefix = state.isPublicView ? 'profile:public:' : 'profile:own:';
    return prefix + (state.profileId || 'unknown');
  }

  function restoreCachedProfile() {
    const store = getSessionStore();
    if (!store) return false;
    const key = profileCacheKey();
    const cached = store.get('profile', key, { maxAge: PROFILE_CACHE_MAX_AGE_MS });
    const profile = cached && cached.value && cached.value.profile ? cached.value.profile : null;
    if (!profile) return false;
    state.profile = profile;
    renderHeader();
    return true;
  }

  function persistCachedProfile(profile) {
    const store = getSessionStore();
    if (!store || typeof store.set !== 'function') return;
    store.set('profile', profileCacheKey(), { profile: profile });
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

  function getProfilePresentationModule() {
    return (window._KCPR && window._KCPR.presentation) ? window._KCPR.presentation : null;
  }

  function buildPresentationDeps() {
    return {
      $,
      bioLimit: BIO_LIMIT,
      clearAvatarDraft,
      isOwnerView,
      shared,
      state,
    };
  }

  function getProfileCollectionsModule() {
    return (window._KCPR && window._KCPR.collections) ? window._KCPR.collections : null;
  }

  function buildCollectionsDeps() {
    return {
      $,
      $$,
      buildPostDetailHref,
      buildRatingStars,
      buildSaveBadges,
      commentPageSize: COMMENT_PAGE_SIZE,
      esc,
      fmtRelative,
      getClient,
      linkifyBio,
      loadRatings,
      normalizeSaveKinds,
      pageSize: PAGE_SIZE,
      setBadgeCount,
      state,
      statusBadge,
      visibilityBadge,
    };
  }

  function esc(value) {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.esc === 'function') return presentation.esc(value);
    const text = String(value == null ? '' : value);
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeName(profile, user) {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.safeName === 'function') return presentation.safeName(profile, user);
    const candidate = profile && (profile.display_name || profile.full_name);
    if (candidate && String(candidate).trim()) return String(candidate).trim();
    const email = user && user.email ? String(user.email) : '';
    return email.includes('@') ? email.split('@')[0] : 'Usuário';
  }

  function buildPublicHandle(profile) {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.buildPublicHandle === 'function') return presentation.buildPublicHandle(profile);
    return '';
  }

  function safeHandle(profile, user) {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.safeHandle === 'function') return presentation.safeHandle(profile, user, buildPresentationDeps());
    return buildPublicHandle(profile);
  }

  function buildAccountSetupHref() {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.buildAccountSetupHref === 'function') return presentation.buildAccountSetupHref(buildPresentationDeps());
    return '/account-setup.html';
  }

  function buildSettingsHref() {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.buildSettingsHref === 'function') return presentation.buildSettingsHref(buildPresentationDeps());
    return '/settings.html';
  }

  function formatChoice(field, value) {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.formatChoice === 'function') return presentation.formatChoice(field, value, buildPresentationDeps());
    return String(value || '').trim();
  }

  function getProfileVisibleSocialLinks(profile) {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.getProfileVisibleSocialLinks === 'function') return presentation.getProfileVisibleSocialLinks(profile, buildPresentationDeps());
    return [];
  }

  function currentAvatarUrl() {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.currentAvatarUrl === 'function') return presentation.currentAvatarUrl(buildPresentationDeps());
    return '';
  }

  function fmtDate(iso, options) {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.fmtDate === 'function') return presentation.fmtDate(iso, options);
    return iso ? String(iso) : '-';
  }

  function fmtRelative(iso) {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.fmtRelative === 'function') return presentation.fmtRelative(iso);
    return iso ? String(iso) : '';
  }

  function buildPostDetailHref(postId) {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.buildPostDetailHref === 'function') return presentation.buildPostDetailHref(postId);
    const normalized = String(postId || '').trim();
    if (!normalized) return '';
    if (window.KCUtils && typeof window.KCUtils.buildProductDetailHref === 'function') {
      return window.KCUtils.buildProductDetailHref(normalized);
    }
    return `_product.html?id=${encodeURIComponent(normalized)}`;
  }

  function statusBadge(status) {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.statusBadge === 'function') return presentation.statusBadge(status);
    return `<span class="kc-status-badge">${esc(status || 'published')}</span>`;
  }

  function visibilityBadge(visibility) {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.visibilityBadge === 'function') return presentation.visibilityBadge(visibility);
    return `<span class="kc-profile-save-badge">${esc(visibility || 'public')}</span>`;
  }

  function normalizeSaveKinds(value) {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.normalizeSaveKinds === 'function') return presentation.normalizeSaveKinds(value);
    const list = Array.isArray(value) ? value : (value ? [value] : []);
    return list.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean);
  }

  function saveKindBadge(kind) {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.saveKindBadge === 'function') return presentation.saveKindBadge(kind);
    return kind ? `<span class="kc-profile-save-badge">${esc(kind)}</span>` : '';
  }

  function buildSaveBadges(kinds) {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.buildSaveBadges === 'function') return presentation.buildSaveBadges(kinds);
    return normalizeSaveKinds(kinds).map(saveKindBadge).join('');
  }

  function linkifyBio(text) {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.linkifyBio === 'function') return presentation.linkifyBio(text);
    return esc(String(text || '')).replace(/\r?\n/g, '<br>');
  }

  function setStatus(message, tone) {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.setStatus === 'function') {
      presentation.setStatus(message, tone, buildPresentationDeps());
      return;
    }
    const feedback = $('#profile-feedback');
    if (!feedback) return;
    feedback.style.display = message ? 'block' : 'none';
    feedback.textContent = message || '';
    feedback.className = message ? `kc-profile-feedback is-${tone || 'info'}` : 'kc-profile-feedback';
  }

  function setBadgeCount(id, count) {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.setBadgeCount === 'function') {
      presentation.setBadgeCount(id, count, buildPresentationDeps());
      return;
    }
    const badge = $(id);
    if (!badge) return;
    const value = Math.max(0, Number(count) || 0);
    badge.textContent = value > 99 ? '99+' : String(value);
  }

  function normalizeRatingSummary(raw, fallbackUserId) {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.normalizeRatingSummary === 'function') {
      return presentation.normalizeRatingSummary(raw, fallbackUserId);
    }
    return {
      userId: String((raw && (raw.userId || raw.user_id)) || fallbackUserId || '').trim() || null,
      average: null,
      count: Math.max(0, Number(raw && (raw.count != null ? raw.count : raw && raw.rating_count)) || 0),
    };
  }

  function getProfileRatingSummaryFromProfile(profile) {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.getProfileRatingSummaryFromProfile === 'function') {
      return presentation.getProfileRatingSummaryFromProfile(profile);
    }
    return normalizeRatingSummary({}, profile && profile.id);
  }

  function renderProfileRatingSummary() {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.renderProfileRatingSummary === 'function') {
      presentation.renderProfileRatingSummary(buildPresentationDeps());
      return;
    }
    setBadgeCount('#badge-ratings', 0);
  }

  function buildRatingStars(score) {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.buildRatingStars === 'function') return presentation.buildRatingStars(score);
    return score ? '<i class="fas fa-star is-active"></i>' : '';
  }

  function syncFormFromProfile() {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.syncFormFromProfile === 'function') {
      presentation.syncFormFromProfile(buildPresentationDeps());
      return;
    }
    updateBioCounter();
  }

  function updateBioCounter() {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.updateBioCounter === 'function') {
      presentation.updateBioCounter(buildPresentationDeps());
      return;
    }
    const counter = $('#profile-bio-counter');
    if (counter) counter.textContent = `0/${BIO_LIMIT}`;
  }

  function setEditing(active) {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.setEditing === 'function') {
      presentation.setEditing(active, buildPresentationDeps());
      return;
    }
    state.isEditing = !!active;
  }

  function renderHeader() {
    const presentation = getProfilePresentationModule();
    if (presentation && typeof presentation.renderHeader === 'function') {
      presentation.renderHeader(buildPresentationDeps());
      return;
    }
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
    const collections = getProfileCollectionsModule();
    if (collections && typeof collections.loadSavedBadgeCount === 'function') {
      return collections.loadSavedBadgeCount(authorId, buildCollectionsDeps());
    }
    return Promise.resolve();
  }

  function renderInlineRichText(text) {
    const collections = getProfileCollectionsModule();
    if (collections && typeof collections.renderInlineRichText === 'function') {
      return collections.renderInlineRichText(text, buildCollectionsDeps());
    }
    const source = String(text || '').trim();
    if (!source) return '';
    if (typeof window.renderCommentMarkdownInline === 'function') {
      return window.renderCommentMarkdownInline(source);
    }
    return linkifyBio(source);
  }

  async function loadPosts(reset) {
    const collections = getProfileCollectionsModule();
    if (collections && typeof collections.loadPosts === 'function') {
      return collections.loadPosts(reset, buildCollectionsDeps());
    }
    return Promise.resolve();
  }

  async function loadComments(reset) {
    const collections = getProfileCollectionsModule();
    if (collections && typeof collections.loadComments === 'function') {
      return collections.loadComments(reset, buildCollectionsDeps());
    }
    return Promise.resolve();
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

  async function loadSaved(reset) {
    const collections = getProfileCollectionsModule();
    if (collections && typeof collections.loadSaved === 'function') {
      return collections.loadSaved(reset, buildCollectionsDeps());
    }
    return Promise.resolve();
  }

  async function loadActivities() {
    const collections = getProfileCollectionsModule();
    if (collections && typeof collections.loadActivities === 'function') {
      return collections.loadActivities(buildCollectionsDeps());
    }
    return Promise.resolve();
  }

  function switchTab(tabId) {
    const collections = getProfileCollectionsModule();
    if (collections && typeof collections.switchTab === 'function') {
      collections.switchTab(tabId, buildCollectionsDeps());
    }
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
    // SWR: serve from cache for instant back-navigation
    if (restoreCachedProfile()) return true;

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

    persistCachedProfile(state.profile);
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
    const collections = getProfileCollectionsModule();
    if (collections && typeof collections.bindTabsAndLists === 'function') {
      collections.bindTabsAndLists(buildCollectionsDeps());
    }
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


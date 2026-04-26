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
  window._KCPR.ratings = window._KCPR.ratings || {};
  window._KCPR.flow = window._KCPR.flow || {};

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

  function getProfileRatingsModule() {
    return (window._KCPR && window._KCPR.ratings) ? window._KCPR.ratings : null;
  }

  function buildRatingsDeps() {
    return {
      $,
      buildRatingStars,
      esc,
      fmtRelative,
      normalizeRatingSummary,
      ratingsPageSize: 10,
      renderInlineRichText,
      renderProfileRatingSummary,
      state,
    };
  }

  function getProfileFlowModule() {
    return (window._KCPR && window._KCPR.flow) ? window._KCPR.flow : null;
  }

  function buildFlowDeps() {
    return {
      $,
      bioLimit: BIO_LIMIT,
      bindTabsAndLists,
      buildAccountSetupHref,
      buildSettingsHref,
      clearAvatarDraft,
      esc,
      getClient,
      getProfileRatingSummaryFromProfile,
      isOwnerView,
      loadActivities,
      loadComments,
      loadPosts,
      loadRatings,
      loadSaved,
      loadSavedBadgeCount,
      normalizeRatingSummary,
      persistCachedProfile,
      probeRestrictedProfile,
      readProfileIdFromQuery,
      releaseAvatarPreview,
      renderHeader,
      renderProfileRatingSummary,
      restoreCachedProfile,
      setBadgeCount,
      setEditing,
      setStatus,
      shared,
      state,
      switchTab,
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
    const flow = getProfileFlowModule();
    if (flow && typeof flow.loadStats === 'function') {
      return flow.loadStats(authorId, buildFlowDeps());
    }
    return Promise.resolve();
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
    const ratings = getProfileRatingsModule();
    if (ratings && typeof ratings.renderRatings === 'function') {
      return ratings.renderRatings(items, append, buildRatingsDeps());
    }
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
    if (loadMore) loadMore.style.display = state.ratingHasMore ? 'block' : 'none';
  }

  async function loadRatings(reset) {
    const ratings = getProfileRatingsModule();
    if (ratings && typeof ratings.loadRatings === 'function') {
      return ratings.loadRatings(reset, buildRatingsDeps());
    }
    return Promise.resolve();
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
    const flow = getProfileFlowModule();
    if (flow && typeof flow.setProfilePending === 'function') {
      return flow.setProfilePending(pending, buildFlowDeps());
    }
    state.profilePending = !!pending;
  }

  async function handleProfileSubmit(event) {
    const flow = getProfileFlowModule();
    if (flow && typeof flow.handleProfileSubmit === 'function') {
      return flow.handleProfileSubmit(event, buildFlowDeps());
    }
    return Promise.resolve();
  }

  function handleAvatarChange(event) {
    const flow = getProfileFlowModule();
    if (flow && typeof flow.handleAvatarChange === 'function') {
      return flow.handleAvatarChange(event, buildFlowDeps());
    }
  }

  function bindProfileEditing() {
    const flow = getProfileFlowModule();
    if (flow && typeof flow.bindProfileEditing === 'function') {
      return flow.bindProfileEditing(buildFlowDeps());
    }
  }

  async function loadProfile() {
    const flow = getProfileFlowModule();
    if (flow && typeof flow.loadProfile === 'function') {
      return flow.loadProfile(buildFlowDeps());
    }
    return Promise.resolve(false);
  }

  function bindTabsAndLists() {
    const collections = getProfileCollectionsModule();
    if (collections && typeof collections.bindTabsAndLists === 'function') {
      collections.bindTabsAndLists(buildCollectionsDeps());
    }
  }

  function bindProfileSyncListener() {
    const flow = getProfileFlowModule();
    if (flow && typeof flow.bindProfileSyncListener === 'function') {
      return flow.bindProfileSyncListener(buildFlowDeps());
    }
  }

  async function refreshProfilePage() {
    const flow = getProfileFlowModule();
    if (flow && typeof flow.refreshProfilePage === 'function') {
      return flow.refreshProfilePage(buildFlowDeps());
    }
    return Promise.resolve();
  }

  function initPullToRefresh() {
    const flow = getProfileFlowModule();
    if (flow && typeof flow.initPullToRefresh === 'function') {
      return flow.initPullToRefresh(buildFlowDeps());
    }
  }

  async function init() {
    const flow = getProfileFlowModule();
    if (flow && typeof flow.init === 'function') {
      return flow.init(buildFlowDeps());
    }
    return Promise.resolve();
  }

  window.KCProfileRefresh = refreshProfilePage;
  window.addEventListener('beforeunload', releaseAvatarPreview);
  document.addEventListener('DOMContentLoaded', init);
})();

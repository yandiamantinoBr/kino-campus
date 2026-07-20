/* KinoCampus - Local Adapter */
(function () {
  'use strict';

  const {
    config: cfg,
    fetchJSON,
    filterPosts: filterLocalPosts,
    normalizePost,
    MOCK_USERS_LIST,
    MOCK_USERS_BY_ID,
    apiURL,
    VERSION,
    DEFAULTS,
  } = window.KCAPI;
  const LOCAL_RATING_VIEWER_ID = 'USER_SELF';
  const LOCAL_NAMESPACE_KEYS = ['notifications', 'ratings', 'saved', 'postsRead', 'postsWrite', 'profile', 'help'];
  const asyncNull = async function () { return null; };
  const asyncFalse = async function () { return { ok: false }; };

  window._KCLA = window._KCLA || {};
  LOCAL_NAMESPACE_KEYS.forEach((key) => { window._KCLA[key] = window._KCLA[key] || {}; });

  function getLocalModule(key) {
    return window._KCLA && window._KCLA[key] ? window._KCLA[key] : null;
  }

  function toSlug(str) {
    return String(str || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  function getNowIso() {
    return new Date().toISOString();
  }

  function buildRequestId() {
    return 'help_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  async function getDatabaseRaw() {
    const urls = Array.isArray(cfg.fallbackDatabaseURLs) && cfg.fallbackDatabaseURLs.length
      ? cfg.fallbackDatabaseURLs
      : DEFAULTS.fallbackDatabaseURLs;
    let lastErr = null;
    for (const url of urls) {
      try {
        return await fetchJSON(url);
      } catch (error) {
        lastErr = error;
      }
    }
    throw lastErr || new Error('KCAPI_DB_NOT_FOUND');
  }

  async function getDatabaseNormalized() {
    const db = await getDatabaseRaw();
    const anuncios = Array.isArray(db.anuncios) ? db.anuncios : [];
    return { version: VERSION, users: MOCK_USERS_LIST, posts: anuncios.map(normalizePost) };
  }

  function getSearchShared() {
    const shared = typeof window !== 'undefined' ? window.KCSearchShared : null;
    return shared && typeof shared.searchCollection === 'function' ? shared : null;
  }

  function getSearchFieldRegistry() {
    const registry = typeof window !== 'undefined' ? window.KCSearchFieldRegistry : null;
    return registry && typeof registry.projectCollection === 'function' ? registry : null;
  }

  function isFeatureEnabled(name, fallback = false) {
    return !!(window.KCFF && typeof window.KCFF.isEnabled === 'function'
      ? window.KCFF.isEnabled(name, fallback)
      : fallback);
  }

  function readLocalUserPosts() {
    try {
      const raw = localStorage.getItem('kc_user_posts');
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.map(normalizePost) : [];
    } catch (_) {
      return [];
    }
  }

  function buildLocalPostKeys(post) {
    const source = post && typeof post === 'object' && !Array.isArray(post) ? post : {};
    const normalized = normalizePost(source);
    const keys = [
      normalized && normalized.id,
      normalized && normalized.uuid,
      normalized && normalized.legacyId,
      normalized && normalized.legacy_id,
      source.id,
      source.uuid,
      source.legacyId,
      source.legacy_id,
      source._id,
    ];
    return Array.from(new Set(keys.map((value) => String(value == null ? '' : value).trim()).filter(Boolean)));
  }

  function parseLocalPostTime(post) {
    const source = post && typeof post === 'object' && !Array.isArray(post) ? post : {};
    const normalized = normalizePost(source);
    const candidates = [
      normalized && normalized.updatedAt,
      normalized && normalized.updated_at,
      source.updatedAt,
      source.updated_at,
      normalized && normalized.createdAt,
      normalized && normalized.created_at,
      source.createdAt,
      source.created_at,
      source.timestamp_iso,
    ];
    for (let index = 0; index < candidates.length; index += 1) {
      const value = String(candidates[index] || '').trim();
      if (!value) continue;
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  }

  function mapLocalPostSummary(post, extras = {}) {
    const source = post && typeof post === 'object' && !Array.isArray(post) ? post : {};
    const normalized = normalizePost(source);
    const id = normalized && normalized.id != null
      ? normalized.id
      : (source.id != null ? source.id : (source.uuid != null ? source.uuid : null));
    const uuid = String(
      (normalized && (normalized.uuid || normalized.id || normalized.legacyId || normalized.legacy_id))
      || source.uuid
      || source.id
      || source.legacy_id
      || source.legacyId
      || ''
    ).trim();
    const summary = {
      id: id != null ? id : (uuid || null),
      uuid: uuid || null,
      legacy_id: source.legacy_id != null ? source.legacy_id : (source.legacyId != null ? source.legacyId : null),
      title: String((normalized && normalized.title) || source.title || source.titulo || 'Sem titulo').trim() || 'Sem titulo',
      created_at: String((normalized && (normalized.created_at || normalized.createdAt)) || source.created_at || source.createdAt || '').trim() || null,
      status: String((normalized && normalized.status) || source.status || 'published').trim() || 'published',
      visibility: String((normalized && normalized.visibility) || source.visibility || 'public').trim() || 'public',
      module: String((normalized && (normalized.module || normalized.modulo)) || source.module || source.modulo || '').trim(),
      category: String((normalized && (normalized.category || normalized.categoriaKey || normalized.categoria)) || source.category || source.categoriaKey || source.categoria || '').trim(),
      votos: Number((normalized && normalized.votos != null ? normalized.votos : source.votos) != null ? (normalized && normalized.votos != null ? normalized.votos : source.votos) : source.votes) || 0,
      view_count: Number(source.view_count != null ? source.view_count : source.viewCount) || 0,
      share_count: Number(source.share_count != null ? source.share_count : source.shareCount) || 0,
      coupon_clicks: Number(source.coupon_clicks != null ? source.coupon_clicks : source.couponClicks) || 0,
      expires_at: source.expires_at || source.expiresAt || null,
    };
    if (Array.isArray(extras.saveKinds)) summary.save_kinds = extras.saveKinds.slice();
    if (extras.savedAt) summary.saved_at = extras.savedAt;
    return summary;
  }

  function paginateLocalItems(items, params = {}) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(params.limit) || 12));
    const offset = (page - 1) * limit;
    return { page, limit, items: items.slice(offset, offset + limit) };
  }

  function buildUnavailableResult(message) {
    return { ok: false, error: { message } };
  }

  function buildUnavailableCode(message) {
    return { ok: false, code: 'UNAVAILABLE', message };
  }

  function buildDefaultLocalRatingSummaryFallback(userId) {
    const key = String(userId || '').trim();
    return { userId: key || null, average: null, count: 0 };
  }

  function buildDefaultLocalAdminHelpListFallback(filters = {}) {
    const limit = Math.max(1, Math.min(100, Number(filters.limit) || 25));
    const offset = Math.max(0, Number(filters.offset) || 0);
    return Object.assign([], { totalCount: 0, limit, offset, hasMore: false });
  }

  function buildDefaultLocalNotificationPreferencesFallback() {
    return {
      comment_on_post: { in_app: true, email: false, whatsapp: false },
      comment_reply: { in_app: true, email: false, whatsapp: false },
      vote_on_post: { in_app: true, email: false, whatsapp: false },
      post_expired: { in_app: true, email: false, whatsapp: false },
      post_reported: { in_app: true, email: false, whatsapp: false },
      system: { in_app: true, email: false, whatsapp: false },
    };
  }

  function buildDefaultLocalNotificationChannelTargetsFallback() {
    return {
      whatsapp: {
        channel: 'whatsapp',
        destination: '',
        country_code: '55',
        local_number: '',
        consent_granted: false,
        consent_at: null,
        configured: false,
        ready: false,
        display: '',
        metadata: { country_code: '55' },
      },
    };
  }

  function buildUserRatingsListFallback(options = {}) {
    const page = Math.max(1, parseInt(String(options.page != null ? options.page : 1), 10) || 1);
    const limit = Math.max(1, parseInt(String(options.limit != null ? options.limit : 10), 10) || 10);
    return { items: [], page, limit, total: 0, hasMore: false };
  }

  function buildUserRatingStateFallback(params = {}) {
    const targetUserId = String((params.targetUserId || params.target_user_id) || '').trim();
    const contextPostId = String((params.contextPostId || params.context_post_id) || '').trim() || null;
    return { targetUserId: targetUserId || null, contextPostId, canRate: false, reason: 'TARGET_NOT_FOUND', myRating: null };
  }

  function buildLocalRatingsDeps() {
    return {
      viewerId: LOCAL_RATING_VIEWER_ID,
      normalizePost,
      getSearchCollection: getLocalSearchCollection,
      mockUsersById: MOCK_USERS_BY_ID || {},
    };
  }

  function buildLocalProfileDeps() {
    return {
      viewerId: LOCAL_RATING_VIEWER_ID,
      mockUsersById: MOCK_USERS_BY_ID || {},
      getNowIso,
    };
  }

  function readLocalProfileSnapshot() {
    const profileModule = getLocalModule('profile');
    if (profileModule && typeof profileModule.readProfile === 'function') {
      return profileModule.readProfile(buildLocalProfileDeps());
    }
    const viewer = (MOCK_USERS_BY_ID && MOCK_USERS_BY_ID[LOCAL_RATING_VIEWER_ID]) || {};
    const displayName = String(viewer.displayName || viewer.name || 'Voc\u00EA').trim() || 'Voc\u00EA';
    return {
      id: String(viewer.id || LOCAL_RATING_VIEWER_ID).trim() || LOCAL_RATING_VIEWER_ID,
      display_name: displayName,
      social_links: {},
      social_visibility: {},
    };
  }

  function buildLocalSavedDeps() {
    return {
      viewerId: LOCAL_RATING_VIEWER_ID,
      getNowIso,
      buildPostKeys: buildLocalPostKeys,
      getPostById,
      mapPostSummary: mapLocalPostSummary,
      paginateItems: paginateLocalItems,
      readProfile: readLocalProfileSnapshot,
    };
  }

  function buildLocalPostsReadDeps() {
    return {
      config: cfg,
      fetchJSON,
      apiURL,
      filterPosts: filterLocalPosts,
      normalizePost,
      getDatabaseRaw,
      getDatabaseNormalized,
      getSearchShared,
      getSearchFieldRegistry,
      isFeatureEnabled,
      getSearchCollection: getLocalSearchCollection,
      readLocalUserPosts,
      enrichPostWithRatings,
      enrichPostsWithRatings,
      parsePostTime: parseLocalPostTime,
      mapPostSummary: mapLocalPostSummary,
      paginateItems: paginateLocalItems,
      rankRelatedPosts: window.KCAPI && typeof window.KCAPI.rankRelatedPosts === 'function' ? window.KCAPI.rankRelatedPosts : null,
      toSlug,
      mockUsersList: MOCK_USERS_LIST,
      mockUsersById: MOCK_USERS_BY_ID || {},
    };
  }

  function buildLocalPostsWriteDeps() {
    return {
      config: cfg,
      fetchJSON,
      apiURL,
      normalizePost,
      getNowIso,
      buildPostKeys: buildLocalPostKeys,
      viewerId: LOCAL_RATING_VIEWER_ID,
      mockUsersById: MOCK_USERS_BY_ID || {},
      toSlug,
      clearSavedPostState,
    };
  }

  function buildLocalHelpDeps() {
    return { getNowIso, buildRequestId };
  }

  function enrichPostWithRatings(post, ratings) {
    const ratingsModule = getLocalModule('ratings');
    return ratingsModule && typeof ratingsModule.enrichPostWithRatings === 'function'
      ? ratingsModule.enrichPostWithRatings(post, ratings, buildLocalRatingsDeps())
      : normalizePost(post);
  }

  function enrichPostsWithRatings(posts) {
    const ratingsModule = getLocalModule('ratings');
    return ratingsModule && typeof ratingsModule.enrichPostsWithRatings === 'function'
      ? ratingsModule.enrichPostsWithRatings(posts, buildLocalRatingsDeps())
      : (Array.isArray(posts) ? posts.map((item) => normalizePost(item)) : []);
  }

  async function getLocalSearchCollection() {
    const db = await getDatabaseNormalized();
    const posts = Array.isArray(db && db.posts) ? db.posts : [];
    return enrichPostsWithRatings(readLocalUserPosts().concat(posts));
  }

  function ensureObjectArg(index) {
    return function (args) {
      const next = args.slice();
      if (next.length <= index || next[index] == null) next[index] = {};
      return next;
    };
  }

  function tryCallLocalMethod(moduleKey, methodName, argsLike, depsFactory, prepareArgs) {
    const module = getLocalModule(moduleKey);
    if (!module || typeof module[methodName] !== 'function') return { called: false, value: undefined };
    const rawArgs = Array.prototype.slice.call(argsLike);
    const args = typeof prepareArgs === 'function' ? prepareArgs(rawArgs) : rawArgs;
    if (typeof depsFactory === 'function') args.push(depsFactory());
    return { called: true, value: module[methodName].apply(module, args) };
  }

  function resolveFallback(fallback, argsLike) {
    return typeof fallback === 'function' ? fallback.apply(null, Array.prototype.slice.call(argsLike)) : fallback;
  }

  function createAsyncDelegate(moduleKey, methodName, depsFactory, fallback, prepareArgs) {
    return async function () {
      const result = tryCallLocalMethod(moduleKey, methodName, arguments, depsFactory, prepareArgs);
      return result.called ? result.value : resolveFallback(fallback, arguments);
    };
  }

  function createSyncDelegate(moduleKey, methodName, depsFactory, fallback, prepareArgs) {
    return function () {
      const result = tryCallLocalMethod(moduleKey, methodName, arguments, depsFactory, prepareArgs);
      return result.called ? result.value : resolveFallback(fallback, arguments);
    };
  }

  const getFeedCursor = createAsyncDelegate('postsRead', 'getFeedCursor', buildLocalPostsReadDeps, () => ({ posts: [], nextCursor: null, hasMore: false }), ensureObjectArg(0));
  const getPosts = createAsyncDelegate('postsRead', 'getPosts', buildLocalPostsReadDeps, () => [], ensureObjectArg(0));
  const searchPosts = createAsyncDelegate('postsRead', 'searchPosts', buildLocalPostsReadDeps, () => [], ensureObjectArg(0));
  const getPostById = createAsyncDelegate('postsRead', 'getPostById', buildLocalPostsReadDeps, () => null);
  const getRelatedPosts = createAsyncDelegate('postsRead', 'getRelatedPosts', buildLocalPostsReadDeps, () => [], ensureObjectArg(1));
  const getMyPosts = createAsyncDelegate('postsRead', 'getMyPosts', buildLocalPostsReadDeps, () => []);
  const getPostsByAuthorId = createAsyncDelegate('postsRead', 'getPostsByAuthorId', buildLocalPostsReadDeps, () => [], ensureObjectArg(1));
  const getTopContributors = createAsyncDelegate('postsRead', 'getTopContributors', buildLocalPostsReadDeps, () => []);

  const getUserRatingSummary = createAsyncDelegate('ratings', 'getUserRatingSummary', buildLocalRatingsDeps, (userId) => buildDefaultLocalRatingSummaryFallback(userId));
  const getUserRatingState = createAsyncDelegate('ratings', 'getUserRatingState', buildLocalRatingsDeps, (params) => buildUserRatingStateFallback(params || {}), ensureObjectArg(0));
  const listUserRatings = createAsyncDelegate('ratings', 'listUserRatings', buildLocalRatingsDeps, function (_, options) { return buildUserRatingsListFallback(options || {}); }, ensureObjectArg(1));
  const upsertUserRating = createAsyncDelegate('ratings', 'upsertUserRating', buildLocalRatingsDeps, () => buildUnavailableResult('Avaliacoes locais indisponiveis.'), ensureObjectArg(0));

  const createPost = createAsyncDelegate('postsWrite', 'createPost', buildLocalPostsWriteDeps, () => null);
  const updatePost = createAsyncDelegate('postsWrite', 'updatePost', buildLocalPostsWriteDeps, () => buildUnavailableResult('Edi\u00E7\u00E3o local indispon\u00EDvel.'), ensureObjectArg(1));
  const deletePost = createAsyncDelegate('postsWrite', 'deletePost', buildLocalPostsWriteDeps, () => buildUnavailableResult('Exclus\u00E3o local indispon\u00EDvel.'));
  const reportPost = createAsyncDelegate('postsWrite', 'reportPost', buildLocalPostsWriteDeps, () => buildUnavailableResult('Denuncias disponiveis apenas no Supabase.'));
  const togglePostStatus = createAsyncDelegate('postsWrite', 'togglePostStatus', buildLocalPostsWriteDeps, () => buildUnavailableCode('Indispon\u00EDvel no modo local.'));
  const renewPost = createAsyncDelegate('postsWrite', 'renewPost', buildLocalPostsWriteDeps, () => buildUnavailableCode('Indispon\u00EDvel no modo local.'));
  const bumpPost = createAsyncDelegate('postsWrite', 'bumpPost', buildLocalPostsWriteDeps, () => buildUnavailableCode('Indispon\u00EDvel no modo local.'));
  const closePost = createAsyncDelegate('postsWrite', 'closePost', buildLocalPostsWriteDeps, () => buildUnavailableCode('Indispon\u00EDvel no modo local.'));
  const reactivatePost = createAsyncDelegate('postsWrite', 'reactivatePost', buildLocalPostsWriteDeps, () => buildUnavailableCode('Indispon\u00EDvel no modo local.'));

  const getMyProfile = createAsyncDelegate('profile', 'getMyProfile', buildLocalProfileDeps, readLocalProfileSnapshot);
  const updateMyProfile = createAsyncDelegate('profile', 'updateMyProfile', buildLocalProfileDeps, () => buildUnavailableResult('Perfil local indispon\u00EDvel.'), ensureObjectArg(0));
  const uploadProfileAvatar = createAsyncDelegate('profile', 'uploadProfileAvatar', buildLocalProfileDeps, () => buildUnavailableResult('Upload de avatar indispon\u00EDvel no modo local.'));

  const getSavedPostState = createAsyncDelegate('saved', 'getSavedPostState', buildLocalSavedDeps, () => ({ kinds: [] }));
  const clearSavedPostState = createAsyncDelegate('saved', 'clearSavedPostState', buildLocalSavedDeps, () => buildUnavailableResult('Salvos locais indisponiveis.'));
  const setSavedPostState = createAsyncDelegate('saved', 'setSavedPostState', buildLocalSavedDeps, () => buildUnavailableResult('Salvos locais indisponiveis.'));
  const getMySavedPosts = createAsyncDelegate('saved', 'getMySavedPosts', buildLocalSavedDeps, () => [], ensureObjectArg(0));
  const getMySavedPostsCount = createAsyncDelegate('saved', 'getMySavedPostsCount', buildLocalSavedDeps, () => 0, ensureObjectArg(0));
  const getProfileHighlights = createAsyncDelegate('saved', 'getProfileHighlights', buildLocalSavedDeps, () => [], ensureObjectArg(1));
  const getProfileHighlightsCount = createAsyncDelegate('saved', 'getProfileHighlightsCount', buildLocalSavedDeps, () => 0, ensureObjectArg(1));

  const createHelpRequest = createAsyncDelegate('help', 'createHelpRequest', buildLocalHelpDeps, () => buildUnavailableResult('Pedidos de ajuda locais indisponiveis.'), ensureObjectArg(0));
  const listAdminHelpRequests = createAsyncDelegate('help', 'listAdminHelpRequests', buildLocalHelpDeps, (filters) => buildDefaultLocalAdminHelpListFallback(filters || {}), ensureObjectArg(0));
  const updateAdminHelpRequest = createAsyncDelegate('help', 'updateAdminHelpRequest', buildLocalHelpDeps, () => buildUnavailableResult('Gest\u00E3o local de pedidos de ajuda indispon\u00EDvel.'), ensureObjectArg(1));
  const processAccountErasure = createAsyncDelegate('help', 'processAccountErasure', buildLocalHelpDeps, () => buildUnavailableResult('Fluxo LGPD local indisponivel.'), ensureObjectArg(0));

  const getNotificationPreferences = createAsyncDelegate('notifications', 'getNotificationPreferences', null, buildDefaultLocalNotificationPreferencesFallback);
  const updateNotificationPreferences = createAsyncDelegate('notifications', 'updateNotificationPreferences', null, () => buildUnavailableResult('Preferencias de notificacao locais indisponiveis.'), ensureObjectArg(0));
  async function getSearchPreferences() {
    if (window.KCSearchPreferences && typeof window.KCSearchPreferences.load === 'function') {
      return window.KCSearchPreferences.load();
    }
    return {
      version: 1,
      mode: 'standard',
      modules: [],
      features: {},
      localAffinityConsent: false,
      consent: { purpose: 'search-personalization-v1', granted: false, source: 'settings', updatedAt: null },
      updatedAt: null,
      sync: { scope: 'local', remoteUpdatedAt: null, lastSyncedAt: null },
    };
  }
  async function updateSearchPreferences(preferences = {}) {
    if (window.KCSearchPreferences && typeof window.KCSearchPreferences.save === 'function') {
      try {
        const saved = window.KCSearchPreferences.save(preferences);
        return { ok: true, data: { preferences: saved } };
      } catch (error) {
        return { ok: false, error: { message: (error && error.message) || 'Falha ao salvar preferencias locais de busca.' } };
      }
    }
    return buildUnavailableResult('Preferencias de busca locais indisponiveis.');
  }
  const getNotificationChannelTargets = createAsyncDelegate('notifications', 'getNotificationChannelTargets', null, buildDefaultLocalNotificationChannelTargetsFallback);
  const updateNotificationChannelTargets = createAsyncDelegate('notifications', 'updateNotificationChannelTargets', null, () => buildUnavailableResult('Destinos privados locais indisponiveis.'), ensureObjectArg(0));
  const getNotifications = createAsyncDelegate('notifications', 'getNotifications', null, () => ({ ok: true, notifications: [], unread: 0, total: 0 }));
  const markNotificationsRead = createAsyncDelegate('notifications', 'markNotificationsRead', null, () => ({ ok: true }));
  const markAllNotificationsRead = createAsyncDelegate('notifications', 'markAllNotificationsRead', null, () => ({ ok: true }));
  const clearNotifications = createAsyncDelegate('notifications', 'clearNotifications', null, () => ({ ok: true, deleted: 0 }));
  const getUnreadNotificationCount = createAsyncDelegate('notifications', 'getUnreadNotificationCount', null, () => 0);
  const subscribeNotifications = createSyncDelegate('notifications', 'subscribeNotifications', null, () => null);
  const unsubscribeNotifications = createSyncDelegate('notifications', 'unsubscribeNotifications', null, () => undefined);
  const inviteExternalUser = createAsyncDelegate('notifications', 'inviteExternalUser', null, () => ({ ok: false, error: 'DRIVER_NAO_SUPORTA' }));
  const getInvites = createAsyncDelegate('notifications', 'getInvites', null, () => ({ data: [], error: null }));
  const revokeInvite = createAsyncDelegate('notifications', 'revokeInvite', null, () => ({ ok: false, error: 'DRIVER_NAO_SUPORTA' }));

  const driverLocal = Object.freeze({
    name: 'local',
    getPosts,
    searchPosts,
    getFeedCursor,
    getUserRatingSummary,
    getUserRatingState,
    listUserRatings,
    upsertUserRating,
    getPostById,
    getRelatedPosts,
    createPost,
    updatePost,
    deletePost,
    reportPost,
    getComments: asyncNull,
    addComment: asyncNull,
    likeComment: asyncNull,
    votePost: asyncNull,
    getMyVote: asyncNull,
    getMyProfile,
    updateMyProfile,
    uploadProfileAvatar,
    getMyPosts,
    getPostsByAuthorId,
    getSavedPostState,
    setSavedPostState,
    clearSavedPostState,
    getMySavedPosts,
    getMySavedPostsCount,
    getProfileHighlights,
    getProfileHighlightsCount,
    createHelpRequest,
    listAdminHelpRequests,
    updateAdminHelpRequest,
    processAccountErasure,
    getNotificationPreferences,
    updateNotificationPreferences,
    getSearchPreferences,
    updateSearchPreferences,
    getNotificationChannelTargets,
    updateNotificationChannelTargets,
    togglePostStatus,
    renewPost,
    bumpPost,
    closePost,
    reactivatePost,
    getTopContributors,
    trackCouponClick: asyncFalse,
    trackShare: asyncFalse,
    trackView: asyncFalse,
    getPostAnalytics: asyncFalse,
    checkDuplicatePost: async function () { return { ok: false, candidates: [] }; },
    getNotifications,
    markNotificationsRead,
    markAllNotificationsRead,
    clearNotifications,
    getUnreadNotificationCount,
    subscribeNotifications,
    unsubscribeNotifications,
    inviteExternalUser,
    getInvites,
    revokeInvite,
  });

  window.KCAPI.registerAdapter('local', driverLocal);
})();

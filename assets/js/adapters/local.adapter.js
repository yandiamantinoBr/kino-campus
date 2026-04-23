/* KinoCampus - Local Adapter */
(function () {
  'use strict';


const { config: cfg, fetchJSON, filterPosts: filterLocalPosts, normalizePost, MOCK_USERS_LIST, MOCK_USERS_BY_ID, apiURL, VERSION, DEFAULTS } = window.KCAPI;
window._KCLA = window._KCLA || {};
window._KCLA.notifications = window._KCLA.notifications || {};
window._KCLA.ratings = window._KCLA.ratings || {};
window._KCLA.saved = window._KCLA.saved || {};
window._KCLA.postsRead = window._KCLA.postsRead || {};
window._KCLA.postsWrite = window._KCLA.postsWrite || {};
window._KCLA.profile = window._KCLA.profile || {};
  
  // Helper functions that might be missing
  function toSlug(str) { return String(str||'').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''); }


  // ---------- Modo estÃ¡tico (fallback) ----------
  async function getDatabaseRaw() {
    const urls = (Array.isArray(cfg.fallbackDatabaseURLs) && cfg.fallbackDatabaseURLs.length)
      ? cfg.fallbackDatabaseURLs
      : DEFAULTS.fallbackDatabaseURLs;

    let lastErr = null;
    for (const url of urls) {
      try {
        return await fetchJSON(url);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('KCAPI_DB_NOT_FOUND');
  }

  async function getDatabaseNormalized() {
    const db = await getDatabaseRaw();
    const anuncios = Array.isArray(db.anuncios) ? db.anuncios : [];
    const posts = anuncios.map(normalizePost);
    return {
      version: VERSION,
      users: MOCK_USERS_LIST,
      posts,
    };
  }

  function getSearchShared() {
    const shared = (typeof window !== 'undefined' && window.KCSearchShared) ? window.KCSearchShared : null;
    if (shared && typeof shared.searchCollection === 'function') return shared;
    return null;
  }

  function getLocalNotificationsModule() {
    return (window._KCLA && window._KCLA.notifications) ? window._KCLA.notifications : null;
  }

  function getLocalRatingsModule() {
    return (window._KCLA && window._KCLA.ratings) ? window._KCLA.ratings : null;
  }

  function getLocalSavedModule() {
    return (window._KCLA && window._KCLA.saved) ? window._KCLA.saved : null;
  }

  function getLocalPostsReadModule() {
    return (window._KCLA && window._KCLA.postsRead) ? window._KCLA.postsRead : null;
  }

  function getLocalPostsWriteModule() {
    return (window._KCLA && window._KCLA.postsWrite) ? window._KCLA.postsWrite : null;
  }

  function getLocalProfileModule() {
    return (window._KCLA && window._KCLA.profile) ? window._KCLA.profile : null;
  }

  function buildLocalRatingsDeps() {
    return {
      viewerId: LOCAL_RATING_VIEWER_ID,
      normalizePost,
      getSearchCollection: getLocalSearchCollection,
      mockUsersById: MOCK_USERS_BY_ID || {},
    };
  }

  function buildLocalSavedDeps() {
    return {
      viewerId: LOCAL_RATING_VIEWER_ID,
      getNowIso,
      buildPostKeys: buildLocalPostKeys,
      getPostById: localGetPostById,
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
      getSearchCollection: getLocalSearchCollection,
      readLocalUserPosts,
      enrichPostWithRatings: enrichLocalPostWithRatings,
      enrichPostsWithRatings: enrichLocalPostsWithRatings,
      parsePostTime: parseLocalPostTime,
      mapPostSummary: mapLocalPostSummary,
      paginateItems: paginateLocalItems,
      rankRelatedPosts: (window.KCAPI && typeof window.KCAPI.rankRelatedPosts === 'function')
        ? window.KCAPI.rankRelatedPosts
        : null,
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
      clearSavedPostState: localClearSavedPostState,
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
    const profileModule = getLocalProfileModule();
    if (profileModule && typeof profileModule.readProfile === 'function') {
      return profileModule.readProfile(buildLocalProfileDeps());
    }
    const viewer = (MOCK_USERS_BY_ID && MOCK_USERS_BY_ID[LOCAL_RATING_VIEWER_ID]) || {};
    const displayName = String(viewer.displayName || viewer.name || 'Voce').trim() || 'Voce';
    return {
      id: String(viewer.id || LOCAL_RATING_VIEWER_ID).trim() || LOCAL_RATING_VIEWER_ID,
      display_name: displayName,
      social_links: {},
      social_visibility: {},
    };
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

  const LOCAL_RATING_VIEWER_ID = 'USER_SELF';

  function buildDefaultLocalRatingSummaryFallback(userId) {
    const key = String(userId || '').trim();
    return {
      userId: key || null,
      average: null,
      count: 0,
    };
  }

  function enrichLocalPostWithRatings(post, ratings) {
    const ratingsModule = getLocalRatingsModule();
    return ratingsModule && typeof ratingsModule.enrichPostWithRatings === 'function'
      ? ratingsModule.enrichPostWithRatings(post, ratings, buildLocalRatingsDeps())
      : normalizePost(post);
  }

  function enrichLocalPostsWithRatings(posts) {
    const ratingsModule = getLocalRatingsModule();
    return ratingsModule && typeof ratingsModule.enrichPostsWithRatings === 'function'
      ? ratingsModule.enrichPostsWithRatings(posts, buildLocalRatingsDeps())
      : (Array.isArray(posts) ? posts.map((item) => normalizePost(item)) : []);
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

  function getNowIso() {
    return new Date().toISOString();
  }

  function buildLocalPostKeys(post) {
    const source = (post && typeof post === 'object' && !Array.isArray(post)) ? post : {};
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
    const source = (post && typeof post === 'object' && !Array.isArray(post)) ? post : {};
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
    for (let i = 0; i < candidates.length; i += 1) {
      const value = String(candidates[i] || '').trim();
      if (!value) continue;
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  }

  function mapLocalPostSummary(post, extras = {}) {
    const source = (post && typeof post === 'object' && !Array.isArray(post)) ? post : {};
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
      title: String((normalized && normalized.title) || source.title || source.titulo || 'Sem tÃ­tulo').trim() || 'Sem tÃ­tulo',
      created_at: String(
        (normalized && (normalized.created_at || normalized.createdAt))
        || source.created_at
        || source.createdAt
        || ''
      ).trim() || null,
      status: String((normalized && normalized.status) || source.status || 'published').trim() || 'published',
      visibility: String((normalized && normalized.visibility) || source.visibility || 'public').trim() || 'public',
      module: String((normalized && (normalized.module || normalized.modulo)) || source.module || source.modulo || '').trim(),
      category: String(
        (normalized && (normalized.category || normalized.categoriaKey || normalized.categoria))
        || source.category
        || source.categoriaKey
        || source.categoria
        || ''
      ).trim(),
      votos: Number(
        (normalized && normalized.votos != null ? normalized.votos : source.votos) != null
          ? (normalized && normalized.votos != null ? normalized.votos : source.votos)
          : source.votes
      ) || 0,
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
    return {
      page,
      limit,
      items: items.slice(offset, offset + limit),
    };
  }

  async function getLocalSearchCollection() {
    const db = await getDatabaseNormalized();
    const posts = Array.isArray(db && db.posts) ? db.posts : [];
    const userPosts = readLocalUserPosts();
    return enrichLocalPostsWithRatings(userPosts.concat(posts));
  }

  

  

  

  

  

  async function localGetFeedCursor(params = {}) {
    const postsReadModule = getLocalPostsReadModule();
    return postsReadModule && typeof postsReadModule.getFeedCursor === 'function'
      ? postsReadModule.getFeedCursor(params, buildLocalPostsReadDeps())
      : { posts: [], nextCursor: null, hasMore: false };
  }

  // ---------- Endpoints sugeridos (futuro backend) ----------
  // GET /api/v1/posts?module=...&q=...
  async function localGetPosts(params = {}) {
    const postsReadModule = getLocalPostsReadModule();
    return postsReadModule && typeof postsReadModule.getPosts === 'function'
      ? postsReadModule.getPosts(params, buildLocalPostsReadDeps())
      : [];
  }

  async function localSearchPosts(params = {}) {
    const postsReadModule = getLocalPostsReadModule();
    return postsReadModule && typeof postsReadModule.searchPosts === 'function'
      ? postsReadModule.searchPosts(params, buildLocalPostsReadDeps())
      : [];
  }

  // GET /api/v1/posts/:id (ou driver local)
  // - Local-first: busca em localStorage (kc_user_posts) e no seed (data/database.json)
  // - Futuro: preparado para IDs UUID (string) e para backend habilitado
  async function localGetPostById(id) {
    const postsReadModule = getLocalPostsReadModule();
    return postsReadModule && typeof postsReadModule.getPostById === 'function'
      ? postsReadModule.getPostById(id, buildLocalPostsReadDeps())
      : null;
  }

  async function localGetRelatedPosts(postId, options = {}) {
    const postsReadModule = getLocalPostsReadModule();
    return postsReadModule && typeof postsReadModule.getRelatedPosts === 'function'
      ? postsReadModule.getRelatedPosts(postId, options, buildLocalPostsReadDeps())
      : [];
  }

  async function localGetUserRatingSummary(userId) {
    const ratingsModule = getLocalRatingsModule();
    return ratingsModule && typeof ratingsModule.getUserRatingSummary === 'function'
      ? ratingsModule.getUserRatingSummary(userId, buildLocalRatingsDeps())
      : buildDefaultLocalRatingSummaryFallback(userId);
  }

  async function localGetUserRatingState(params = {}) {
    const targetUserId = String((params && (params.targetUserId || params.target_user_id)) || '').trim();
    const contextPostId = String((params && (params.contextPostId || params.context_post_id)) || '').trim() || null;
    const ratingsModule = getLocalRatingsModule();
    return ratingsModule && typeof ratingsModule.getUserRatingState === 'function'
      ? ratingsModule.getUserRatingState(params, buildLocalRatingsDeps())
      : {
          targetUserId: targetUserId || null,
          contextPostId,
          canRate: false,
          reason: 'TARGET_NOT_FOUND',
          myRating: null,
        };
  }

  async function localListUserRatings(userId, options = {}) {
    const page = Math.max(1, parseInt(String(options && options.page != null ? options.page : 1), 10) || 1);
    const limit = Math.max(1, parseInt(String(options && options.limit != null ? options.limit : 10), 10) || 10);
    const ratingsModule = getLocalRatingsModule();
    return ratingsModule && typeof ratingsModule.listUserRatings === 'function'
      ? ratingsModule.listUserRatings(userId, options, buildLocalRatingsDeps())
      : {
          items: [],
          page,
          limit,
          total: 0,
          hasMore: false,
        };
  }

  async function localUpsertUserRating(payload = {}) {
    const ratingsModule = getLocalRatingsModule();
    return ratingsModule && typeof ratingsModule.upsertUserRating === 'function'
      ? ratingsModule.upsertUserRating(payload, buildLocalRatingsDeps())
      : { ok: false, error: { message: 'Avaliacoes locais indisponiveis.' } };
  }
  // POST /api/v1/posts
  async function localCreatePost(body) {
    const postsWriteModule = getLocalPostsWriteModule();
    return postsWriteModule && typeof postsWriteModule.createPost === 'function'
      ? postsWriteModule.createPost(body, buildLocalPostsWriteDeps())
      : null;
  }
  async function localUpdatePost(postId, payload) {
    const postsWriteModule = getLocalPostsWriteModule();
    return postsWriteModule && typeof postsWriteModule.updatePost === 'function'
      ? postsWriteModule.updatePost(postId, payload, buildLocalPostsWriteDeps())
      : { ok: false, error: { message: 'Edicao local indisponivel.' } };
  }
  async function localDeletePost(postId) {
    const postsWriteModule = getLocalPostsWriteModule();
    return postsWriteModule && typeof postsWriteModule.deletePost === 'function'
      ? postsWriteModule.deletePost(postId, buildLocalPostsWriteDeps())
      : { ok: false, error: { message: 'Exclusao local indisponivel.' } };
  }
  async function localReportPost() {
    const postsWriteModule = getLocalPostsWriteModule();
    return postsWriteModule && typeof postsWriteModule.reportPost === 'function'
      ? postsWriteModule.reportPost()
      : { ok: false, error: { message: 'Denuncias disponiveis apenas no Supabase.' } };
  }
  async function localTogglePostStatus() {
    const postsWriteModule = getLocalPostsWriteModule();
    return postsWriteModule && typeof postsWriteModule.togglePostStatus === 'function'
      ? postsWriteModule.togglePostStatus()
      : { ok: false, code: 'UNAVAILABLE', message: 'Indisponivel no modo local.' };
  }
  async function localRenewPost() {
    const postsWriteModule = getLocalPostsWriteModule();
    return postsWriteModule && typeof postsWriteModule.renewPost === 'function'
      ? postsWriteModule.renewPost()
      : { ok: false, code: 'UNAVAILABLE', message: 'Indisponivel no modo local.' };
  }
  async function localBumpPost() {
    const postsWriteModule = getLocalPostsWriteModule();
    return postsWriteModule && typeof postsWriteModule.bumpPost === 'function'
      ? postsWriteModule.bumpPost()
      : { ok: false, code: 'UNAVAILABLE', message: 'Indisponivel no modo local.' };
  }
  async function localGetMyProfile() {
    const profileModule = getLocalProfileModule();
    return profileModule && typeof profileModule.getMyProfile === 'function'
      ? profileModule.getMyProfile(buildLocalProfileDeps())
      : readLocalProfileSnapshot();
  }

  async function localUpdateMyProfile(patch = {}) {
    const profileModule = getLocalProfileModule();
    return profileModule && typeof profileModule.updateMyProfile === 'function'
      ? profileModule.updateMyProfile(patch, buildLocalProfileDeps())
      : { ok: false, error: { message: 'Perfil local indisponivel.' } };
  }

  async function localUploadProfileAvatar(fileOrDataUrl) {
    const profileModule = getLocalProfileModule();
    return profileModule && typeof profileModule.uploadProfileAvatar === 'function'
      ? profileModule.uploadProfileAvatar(fileOrDataUrl, buildLocalProfileDeps())
      : { ok: false, error: { message: 'Upload de avatar indisponivel no modo local.' } };
  }

  async function localGetMyPosts(params = {}) {
    const postsReadModule = getLocalPostsReadModule();
    return postsReadModule && typeof postsReadModule.getMyPosts === 'function'
      ? postsReadModule.getMyPosts(params, buildLocalPostsReadDeps())
      : [];
  }

  async function localGetPostsByAuthorId(authorId, params = {}) {
    const postsReadModule = getLocalPostsReadModule();
    return postsReadModule && typeof postsReadModule.getPostsByAuthorId === 'function'
      ? postsReadModule.getPostsByAuthorId(authorId, params, buildLocalPostsReadDeps())
      : [];
  }

  async function localGetSavedPostState(postId) {
    const savedModule = getLocalSavedModule();
    return savedModule && typeof savedModule.getSavedPostState === 'function'
      ? savedModule.getSavedPostState(postId, buildLocalSavedDeps())
      : { kinds: [] };
  }

  async function localClearSavedPostState(postId, kind) {
    const savedModule = getLocalSavedModule();
    return savedModule && typeof savedModule.clearSavedPostState === 'function'
      ? savedModule.clearSavedPostState(postId, kind, buildLocalSavedDeps())
      : { ok: false, error: { message: 'Salvos locais indisponiveis.' } };
  }

  async function localSetSavedPostState(postId, kind, enabled) {
    const savedModule = getLocalSavedModule();
    return savedModule && typeof savedModule.setSavedPostState === 'function'
      ? savedModule.setSavedPostState(postId, kind, enabled, buildLocalSavedDeps())
      : { ok: false, error: { message: 'Salvos locais indisponiveis.' } };
  }

  async function localGetMySavedPosts(params = {}) {
    const savedModule = getLocalSavedModule();
    return savedModule && typeof savedModule.getMySavedPosts === 'function'
      ? savedModule.getMySavedPosts(params, buildLocalSavedDeps())
      : [];
  }

  async function localGetMySavedPostsCount(params = {}) {
    const savedModule = getLocalSavedModule();
    return savedModule && typeof savedModule.getMySavedPostsCount === 'function'
      ? savedModule.getMySavedPostsCount(params, buildLocalSavedDeps())
      : 0;
  }

  async function localGetProfileHighlights(profileId, params = {}) {
    const savedModule = getLocalSavedModule();
    return savedModule && typeof savedModule.getProfileHighlights === 'function'
      ? savedModule.getProfileHighlights(profileId, params, buildLocalSavedDeps())
      : [];
  }

  async function localGetProfileHighlightsCount(profileId, params = {}) {
    const savedModule = getLocalSavedModule();
    return savedModule && typeof savedModule.getProfileHighlightsCount === 'function'
      ? savedModule.getProfileHighlightsCount(profileId, params, buildLocalSavedDeps())
      : 0;
  }

  async function localGetNotificationPreferences() {

    const notificationsModule = getLocalNotificationsModule();
    return notificationsModule && typeof notificationsModule.getNotificationPreferences === 'function'
      ? notificationsModule.getNotificationPreferences()
      : buildDefaultLocalNotificationPreferencesFallback();
  }

  async function localUpdateNotificationPreferences(preferences = {}) {
    const notificationsModule = getLocalNotificationsModule();
    return notificationsModule && typeof notificationsModule.updateNotificationPreferences === 'function'
      ? notificationsModule.updateNotificationPreferences(preferences)
      : { ok: false, error: { message: 'Preferencias de notificacao locais indisponiveis.' } };
  }

  async function localGetNotificationChannelTargets() {
    const notificationsModule = getLocalNotificationsModule();
    return notificationsModule && typeof notificationsModule.getNotificationChannelTargets === 'function'
      ? notificationsModule.getNotificationChannelTargets()
      : buildDefaultLocalNotificationChannelTargetsFallback();
  }

  async function localUpdateNotificationChannelTargets(targets = {}) {
    const notificationsModule = getLocalNotificationsModule();
    return notificationsModule && typeof notificationsModule.updateNotificationChannelTargets === 'function'
      ? notificationsModule.updateNotificationChannelTargets(targets)
      : { ok: false, error: { message: 'Destinos privados locais indisponiveis.' } };
  }

  async function localGetNotifications() {
    const notificationsModule = getLocalNotificationsModule();
    return notificationsModule && typeof notificationsModule.getNotifications === 'function'
      ? notificationsModule.getNotifications()
      : { ok: true, notifications: [], unread: 0, total: 0 };
  }

  async function localMarkNotificationsRead() {
    const notificationsModule = getLocalNotificationsModule();
    return notificationsModule && typeof notificationsModule.markNotificationsRead === 'function'
      ? notificationsModule.markNotificationsRead.apply(notificationsModule, arguments)
      : { ok: true };
  }

  async function localMarkAllNotificationsRead() {
    const notificationsModule = getLocalNotificationsModule();
    return notificationsModule && typeof notificationsModule.markAllNotificationsRead === 'function'
      ? notificationsModule.markAllNotificationsRead()
      : { ok: true };
  }

  async function localClearNotifications() {
    const notificationsModule = getLocalNotificationsModule();
    return notificationsModule && typeof notificationsModule.clearNotifications === 'function'
      ? notificationsModule.clearNotifications()
      : { ok: true, deleted: 0 };
  }

  async function localGetUnreadNotificationCount() {
    const notificationsModule = getLocalNotificationsModule();
    return notificationsModule && typeof notificationsModule.getUnreadNotificationCount === 'function'
      ? notificationsModule.getUnreadNotificationCount()
      : 0;
  }

  function localSubscribeNotifications() {
    const notificationsModule = getLocalNotificationsModule();
    return notificationsModule && typeof notificationsModule.subscribeNotifications === 'function'
      ? notificationsModule.subscribeNotifications.apply(notificationsModule, arguments)
      : null;
  }

  function localUnsubscribeNotifications() {
    const notificationsModule = getLocalNotificationsModule();
    if (!notificationsModule || typeof notificationsModule.unsubscribeNotifications !== 'function') return;
    notificationsModule.unsubscribeNotifications.apply(notificationsModule, arguments);
  }

  async function localInviteExternalUser() {
    const notificationsModule = getLocalNotificationsModule();
    return notificationsModule && typeof notificationsModule.inviteExternalUser === 'function'
      ? notificationsModule.inviteExternalUser.apply(notificationsModule, arguments)
      : { ok: false, error: 'DRIVER_NAO_SUPORTA' };
  }

  async function localGetInvites() {
    const notificationsModule = getLocalNotificationsModule();
    return notificationsModule && typeof notificationsModule.getInvites === 'function'
      ? notificationsModule.getInvites()
      : { data: [], error: null };
  }

  async function localRevokeInvite() {
    const notificationsModule = getLocalNotificationsModule();
    return notificationsModule && typeof notificationsModule.revokeInvite === 'function'
      ? notificationsModule.revokeInvite.apply(notificationsModule, arguments)
      : { ok: false, error: 'DRIVER_NAO_SUPORTA' };
  }

  const HELP_REQUESTS_STORAGE_KEY = 'kc_help_requests';

  function migrateLegacyHelpPayload(payload) {
    const input = (payload && typeof payload === 'object') ? payload : {};
    const legacyType = String(input.type || '').trim().toLowerCase();
    const legacyTopic = String(input.topic || '').trim().toLowerCase();

    const nextType = (function resolveType() {
      if (legacyType === 'complaint') return 'platform_issue';
      if (legacyType === 'praise') return 'suggestion_praise';
      if (legacyType === 'report') return 'report';
      if (legacyType === 'account_access') return 'account_access';
      if (legacyType === 'question') return 'question';
      return legacyType || 'question';
    }());

    const nextTopic = (function resolveTopic() {
      if (nextType === 'question') {
        if (legacyTopic === 'profile' || legacyTopic === 'contact') return 'profile_contact';
        if (legacyTopic === 'platform_use' || legacyTopic === 'posts') return 'publishing_navigation';
        return 'modules_filters';
      }
      if (nextType === 'platform_issue') {
        if (legacyTopic === 'posts') return 'create_edit_post';
        if (legacyTopic === 'contact') return 'search_filters';
        if (legacyTopic === 'security') return 'slow_performance';
        return 'bugs_crashes';
      }
      if (nextType === 'account_access') {
        if (legacyTopic === 'security') return 'password';
        if (legacyTopic === 'profile' || legacyTopic === 'contact') return 'onboarding_settings';
        return 'login_signup';
      }
      if (nextType === 'report') {
        if (legacyTopic === 'profile') return 'profile_user';
        if (legacyTopic === 'contact') return 'inappropriate_contact';
        if (legacyTopic === 'security') return 'security';
        return 'post';
      }
      if (nextType === 'suggestion_praise') {
        if (legacyTopic === 'posts') return 'specific_module';
        if (legacyTopic === 'payment_benefit') return 'community';
        return 'general_experience';
      }
      return legacyTopic || '';
    }());

    return {
      ...input,
      type: nextType,
      topic: nextTopic,
    };
  }

  function readHelpRequests() {
    try {
      const raw = localStorage.getItem(HELP_REQUESTS_STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return [];
      return list.map((item) => {
        const normalized = normalizeHelpPayload(item);
        return {
          ...(item && typeof item === 'object' ? item : {}),
          ...normalized,
        };
      });
    } catch (_) {
      return [];
    }
  }

  function writeHelpRequests(list) {
    try {
      localStorage.setItem(HELP_REQUESTS_STORAGE_KEY, JSON.stringify(Array.isArray(list) ? list : []));
      return true;
    } catch (_) {
      return false;
    }
  }

  function normalizeHelpPayload(payload) {
    const shared = window.KCHelpUtils || {};
    const migrated = migrateLegacyHelpPayload(payload);
    if (shared && typeof shared.normalizeHelpRequestInput === 'function') {
      return shared.normalizeHelpRequestInput(migrated, {});
    }
    const input = (migrated && typeof migrated === 'object') ? migrated : {};
    return {
      user_id: input.user_id || null,
      type: String(input.type || 'question').trim(),
      topic: String(input.topic || 'publishing_navigation').trim(),
      subtopic: input.subtopic ? String(input.subtopic).trim() : null,
      subject: String(input.subject || '').trim().slice(0, 140),
      message: String(input.message || '').trim().slice(0, 4000),
      priority: String(input.priority || 'normal').trim(),
      status: String(input.status || 'new').trim(),
      page_path: input.page_path ? String(input.page_path).trim().slice(0, 255) : null,
      contact_email: String(input.contact_email || '').trim().toLowerCase(),
      allow_contact: input.allow_contact !== false,
      metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    };
  }

  async function localCreateHelpRequest(payload) {
    const normalized = normalizeHelpPayload(payload);
    if (!normalized.subject || !normalized.message || !normalized.contact_email) {
      return { ok: false, error: { message: 'Preencha assunto, descriÃ§Ã£o e e-mail de retorno.' } };
    }
    const list = readHelpRequests();
    const now = new Date().toISOString();
    const row = {
      id: `help_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ...normalized,
      created_at: now,
      updated_at: now,
    };
    list.unshift(row);
    if (!writeHelpRequests(list)) {
      return { ok: false, error: { message: 'NÃ£o foi possÃ­vel salvar o pedido de ajuda localmente.' } };
    }
    return { ok: true, data: row };
  }

  function attachLocalAdminHelpListMeta(rows, meta = {}) {
    const list = Array.isArray(rows) ? rows.slice() : [];
    const totalCount = Number(meta.totalCount);
    const limit = Number(meta.limit);
    const offset = Number(meta.offset);
    return Object.assign(list, {
      totalCount: Number.isFinite(totalCount) ? totalCount : list.length,
      limit: Number.isFinite(limit) ? limit : list.length,
      offset: Number.isFinite(offset) ? offset : 0,
      hasMore: Boolean(meta.hasMore),
    });
  }

  async function localListAdminHelpRequests(filters = {}) {
    const current = readHelpRequests().slice().sort((a, b) => {
      return new Date(b && b.created_at || 0).getTime() - new Date(a && a.created_at || 0).getTime();
    });
    const query = String(filters.query || '').trim().toLowerCase();
    const limit = Math.max(1, Math.min(100, Number(filters.limit) || 25));
    const offset = Math.max(0, Number(filters.offset) || 0);
    const filtered = current.filter((item) => {
      if (filters.status && filters.status !== 'all' && String(item.status || '') !== String(filters.status)) return false;
      if (filters.type && filters.type !== 'all' && String(item.type || '') !== String(filters.type)) return false;
      if (filters.priority && filters.priority !== 'all' && String(item.priority || '') !== String(filters.priority)) return false;
      if (!query) return true;
      const haystack = [
        item.subject,
        item.message,
        item.contact_email,
        item.page_path,
        item.type,
        item.topic,
        item.subtopic,
      ].join(' ').toLowerCase();
      return haystack.indexOf(query) >= 0;
    });
    const rows = filtered.slice(offset, offset + limit);
    return attachLocalAdminHelpListMeta(rows, {
      totalCount: filtered.length,
      limit,
      offset,
      hasMore: (offset + rows.length) < filtered.length,
    });
  }

  async function localListAdminHelpRequestsLegacy(filters = {}) {
    const current = readHelpRequests();
    const query = String(filters.query || '').trim().toLowerCase();
    return current.filter((item) => {
      if (filters.status && filters.status !== 'all' && String(item.status || '') !== String(filters.status)) return false;
      if (filters.type && filters.type !== 'all' && String(item.type || '') !== String(filters.type)) return false;
      if (filters.priority && filters.priority !== 'all' && String(item.priority || '') !== String(filters.priority)) return false;
      if (!query) return true;
      const haystack = [
        item.subject,
        item.message,
        item.contact_email,
        item.page_path,
        item.type,
        item.topic,
        item.subtopic,
      ].join(' ').toLowerCase();
      return haystack.indexOf(query) >= 0;
    });
  }

  async function localUpdateAdminHelpRequest(id, patch) {
    const targetId = String(id || '').trim();
    if (!targetId) return { ok: false, error: { message: 'Pedido invÃ¡lido.' } };
    const list = readHelpRequests();
    const index = list.findIndex((item) => String(item && item.id || '') === targetId);
    if (index < 0) return { ok: false, error: { message: 'Pedido nÃ£o encontrado.' } };
    list[index] = {
      ...list[index],
      ...(patch && typeof patch === 'object' ? patch : {}),
      updated_at: new Date().toISOString(),
    };
    if (!writeHelpRequests(list)) {
      return { ok: false, error: { message: 'NÃ£o foi possÃ­vel atualizar o pedido localmente.' } };
    }
    return { ok: true, data: list[index] };
  }

  

  

  

  

  async function localGetTopContributors(period, module, limit) {
    const postsReadModule = getLocalPostsReadModule();
    return postsReadModule && typeof postsReadModule.getTopContributors === 'function'
      ? postsReadModule.getTopContributors(period, module, limit, buildLocalPostsReadDeps())
      : [];
  }

  // ---------- Driver Pattern (V8.1.3.1) ----------
  // Objetivo: permitir trocar a fonte de dados (local <-> supabase) alterando apenas KC_ENV.driver.
  const driverLocal = Object.freeze({
    name: 'local',
    getPosts: localGetPosts,
    searchPosts: localSearchPosts,
    getFeedCursor: localGetFeedCursor,
    getUserRatingSummary: localGetUserRatingSummary,
    getUserRatingState: localGetUserRatingState,
    listUserRatings: localListUserRatings,
    upsertUserRating: localUpsertUserRating,
    getPostById: localGetPostById,
    getRelatedPosts: localGetRelatedPosts,
    createPost: localCreatePost,
    updatePost: localUpdatePost,
    deletePost: localDeletePost,
    reportPost: localReportPost,
    // ComentÃ¡rios e votos no driver local sÃ£o geridos diretamente por kc-core.js (localStorage).
    // As funÃ§Ãµes abaixo existem apenas para uniformidade da interface; kc-core.js nÃ£o as usa.
    getComments: async function () { return null; },
    addComment: async function () { return null; },
    likeComment: async function () { return null; },
    votePost: async function () { return null; },
    getMyVote: async function () { return null; },
    getMyProfile: localGetMyProfile,
    updateMyProfile: localUpdateMyProfile,
    uploadProfileAvatar: localUploadProfileAvatar,
    getMyPosts: localGetMyPosts,
    getPostsByAuthorId: localGetPostsByAuthorId,
    getSavedPostState: localGetSavedPostState,
    setSavedPostState: localSetSavedPostState,
    clearSavedPostState: localClearSavedPostState,
    getMySavedPosts: localGetMySavedPosts,
    getMySavedPostsCount: localGetMySavedPostsCount,
    getProfileHighlights: localGetProfileHighlights,
    getProfileHighlightsCount: localGetProfileHighlightsCount,
    createHelpRequest: localCreateHelpRequest,
    listAdminHelpRequests: localListAdminHelpRequests,
    updateAdminHelpRequest: localUpdateAdminHelpRequest,
    getNotificationPreferences: localGetNotificationPreferences,
    updateNotificationPreferences: localUpdateNotificationPreferences,
    getNotificationChannelTargets: localGetNotificationChannelTargets,
    updateNotificationChannelTargets: localUpdateNotificationChannelTargets,
    // Stubs: funcionalidades disponÃ­veis apenas no driver Supabase
    togglePostStatus: localTogglePostStatus,
    renewPost: localRenewPost,
    bumpPost: localBumpPost,
    getTopContributors: localGetTopContributors,
    trackCouponClick: async function () { return { ok: false }; },
    trackShare: async function () { return { ok: false }; },
    trackView: async function () { return { ok: false }; },
    getPostAnalytics: async function () { return { ok: false }; },
    checkDuplicatePost: async function () { return { ok: false, candidates: [] }; },
    getNotifications: localGetNotifications,
    markNotificationsRead: localMarkNotificationsRead,
    markAllNotificationsRead: localMarkAllNotificationsRead,
    clearNotifications: localClearNotifications,
    getUnreadNotificationCount: localGetUnreadNotificationCount,
    subscribeNotifications: localSubscribeNotifications,
    unsubscribeNotifications: localUnsubscribeNotifications,
    inviteExternalUser: localInviteExternalUser,
    getInvites: localGetInvites,
    revokeInvite: localRevokeInvite,
  });


window.KCAPI.registerAdapter('local', driverLocal);

})();



(function () {
  'use strict';
const { ENV } = window.KCAPI;
  // ── normalizeProfilePatchForAdapter, uploadProfileAvatarToSupabaseStorage,
  // supabaseGetMyProfile, syncCurrentProfileCache, supabaseUpdateMyProfile,
  // supabaseUploadProfileAvatar extraídos para supabase.profiles.adapter.js (v11.30.9) ──

  // ---------- Supabase Client Bootstrap (V8.1.3.1) ----------
  // Cria o cliente apenas quando necessário (driver="supabase").
  let supabaseClient = null;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function hasSupabaseLib() {
    return !!(window.supabase && typeof window.supabase.createClient === 'function');
  }

  function getSupabaseClient() {
    if (supabaseClient) return supabaseClient;

    // Preferimos o Facade (Auth/Sessão) para manter o SDK isolado
    try {
      if (KCSupabase && typeof KCSupabase.getClient === 'function') {
        supabaseClient = KCSupabase.getClient();
        return supabaseClient;
      }
    } catch (_) { }

    // Fallback (mantém compatibilidade caso o Facade não esteja carregado)
    if (!hasSupabaseLib()) {
      console.error('[KCAPI][Supabase] Biblioteca supabase-js não carregada (CDN ausente ou sem internet).');
      return null;
    }

    const url = (ENV.SUPABASE_URL || (ENV.supabase && ENV.supabase.url)) ? String(ENV.SUPABASE_URL || ENV.supabase.url).trim() : '';
    const anonKey = (ENV.SUPABASE_ANON_KEY || (ENV.supabase && ENV.supabase.anonKey)) ? String(ENV.SUPABASE_ANON_KEY || ENV.supabase.anonKey).trim() : '';

    if (!url || !anonKey || anonKey.includes('placeholder')) {
      console.error('[KCAPI][Supabase] KC_ENV SUPABASE_URL/SUPABASE_ANON_KEY ausentes ou placeholders. Configure antes de usar driver="supabase".');
      return null;
    }

    try {
      supabaseClient = window.supabase.createClient(url, anonKey);
      return supabaseClient;
    } catch (e) {
      console.error('[KCAPI][Supabase] Falha ao criar cliente supabase:', e);
      return null;
    }
  }

  // Eager init: resolve o client imediatamente para evitar lazy-init na primeira chamada
  try { getSupabaseClient(); } catch (_) {}

  // ---------- Supabase Auth & Storage (V8.1.3.1) ----------
  async function supabaseGetCurrentUser() {
    try {
      if (KCSupabase && typeof KCSupabase.getUser === 'function') {
        const cachedUser = KCSupabase.getUser();
        if (cachedUser && cachedUser.id) return cachedUser;
      }
      if (KCSupabase && typeof KCSupabase.getCurrentUser === 'function') {
        return await KCSupabase.getCurrentUser();
      }
    } catch (_) { }

    const client = getSupabaseClient();
    if (!client) return null;

    try {
      if (client.auth && typeof client.auth.getUser === 'function') {
        const r = await client.auth.getUser();
        if (r && r.error) {
          console.error('[KCAPI][Supabase] getCurrentUser erro:', r.error);
          return null;
        }
        return (r && r.data && r.data.user) ? r.data.user : null;
      }

      if (client.auth && typeof client.auth.getSession === 'function') {
        const r = await client.auth.getSession();
        if (r && r.error) {
          console.error('[KCAPI][Supabase] getSession erro:', r.error);
          return null;
        }
        return (r && r.data && r.data.session && r.data.session.user) ? r.data.session.user : null;
      }
    } catch (e) {
      console.error('[KCAPI][Supabase] getCurrentUser falhou:', e);
    }

    return null;
  }

  // ── Namespace _KCSA: expõe getClient/getCurrentUser para sub-adapters (v11.30.1) ──
  window._KCSA = window._KCSA || {};
  window._KCSA.getClient = getSupabaseClient;
  window._KCSA.getCurrentUser = supabaseGetCurrentUser;

  async function supabaseLogin(email, password) {
    const em = String(email || '').trim();
    const pw = String(password || '').trim();
    if (!em || !pw) return null;

    try {
      if (KCSupabase && typeof KCSupabase.signIn === 'function') {
        const r = await KCSupabase.signIn(em, pw);
        return (r && r.user) ? r.user : null;
      }
    } catch (_) { }

    const client = getSupabaseClient();
    if (!client) return null;

    try {
      const r = await client.auth.signInWithPassword({ email: em, password: pw });
      if (r && r.error) {
        console.error('[KCAPI][Supabase] login erro:', r.error);
        return null;
      }
      return (r && r.data && r.data.user) ? r.data.user : null;
    } catch (e) {
      console.error('[KCAPI][Supabase] login falhou:', e);
      return null;
    }
  }

  async function supabaseSignUp(email, password) {
    const em = String(email || '').trim();
    const pw = String(password || '').trim();
    if (!em || !pw) return { user: null, session: null, error: { message: 'E-mail e senha são obrigatórios.' } };

    // Preferimos o facade (V8.1.3.1) para validação de domínio/erros consistentes
    if (KCSupabase && typeof KCSupabase.signUp === 'function') {
      return KCSupabase.signUp(em, pw);
    }

    const client = getSupabaseClient();
    if (!client) return { user: null, session: null, error: { message: 'Supabase não configurado.' } };

    try {
      const r = await client.auth.signUp({ email: em, password: pw });
      if (r && r.error) return { user: null, session: null, error: r.error };
      return { user: (r && r.data && r.data.user) ? r.data.user : null, session: (r && r.data && r.data.session) ? r.data.session : null, error: null };
    } catch (e) {
      return { user: null, session: null, error: { message: 'Falha no cadastro.' } };
    }
  }


  async function supabaseLogout() {
    try {
      if (KCSupabase && typeof KCSupabase.signOut === 'function') {
        const r = await KCSupabase.signOut();
        return !!(r && r.ok);
      }
    } catch (_) { }

    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const r = await client.auth.signOut();
      if (r && r.error) {
        console.error('[KCAPI][Supabase] logout erro:', r.error);
        return false;
      }
      return true;
    } catch (e) {
      console.error('[KCAPI][Supabase] logout falhou:', e);
      return false;
    }
  }

  // ── Grupo media extraído para supabase.media.adapter.js (v11.30.5) ──────────

  // ── Grupo posts-read extraído para supabase.posts-read.adapter.js (v11.30.7) ──
  // mergeMetadataSafe, pickFirstNonEmpty, resolveNormalizedAuthorName,
  // resolveNormalizedAuthorAvatar, logAuthorDiagnosticsDev, mapSupabasePost,
  // normalizeSupabasePost, buildSupabasePostSelect, buildSupabasePostSelectFallback,
  // isMissingCommentsEmbedError, supabaseGetPostById, buildSupabasePostsQuery,
  // buildSupabasePostsQueryFallback, isMissingVerifiedColumnError,
  // normalizeSupabaseFilters, buildOrILike, supabaseGetPosts, supabaseSearchPosts,
  // supabaseGetFeedCursor
  // → window._KCSA.posts.*

  async function supabaseGetUserRatingSummary(userId) {
    try {
      if (window.KCSupabase && typeof window.KCSupabase.getUserRatingSummary === 'function') {
        return await window.KCSupabase.getUserRatingSummary(userId);
      }
    } catch (error) {
      console.error('[KCAPI][Supabase] getUserRatingSummary falhou:', error);
    }
    return { userId: String(userId || '').trim() || null, average: null, count: 0 };
  }

  async function supabaseGetUserRatingState(params = {}) {
    try {
      if (window.KCSupabase && typeof window.KCSupabase.getUserRatingState === 'function') {
        return await window.KCSupabase.getUserRatingState(params);
      }
    } catch (error) {
      console.error('[KCAPI][Supabase] getUserRatingState falhou:', error);
    }

    return {
      targetUserId: String((params && (params.targetUserId || params.target_user_id)) || '').trim() || null,
      contextPostId: String((params && (params.contextPostId || params.context_post_id)) || '').trim() || null,
      canRate: false,
      reason: 'UNKNOWN',
      myRating: null,
    };
  }

  async function supabaseListUserRatings(userId, options = {}) {
    try {
      if (window.KCSupabase && typeof window.KCSupabase.listUserRatings === 'function') {
        return await window.KCSupabase.listUserRatings(userId, options);
      }
    } catch (error) {
      console.error('[KCAPI][Supabase] listUserRatings falhou:', error);
    }

    const page = Math.max(1, parseInt(String(options && options.page != null ? options.page : 1), 10) || 1);
    const limit = Math.max(1, parseInt(String(options && options.limit != null ? options.limit : 10), 10) || 10);
    return {
      items: [],
      page,
      limit,
      total: 0,
      hasMore: false,
    };
  }

  async function supabaseUpsertUserRating(payload = {}) {
    try {
      if (window.KCSupabase && typeof window.KCSupabase.upsertUserRating === 'function') {
        return await window.KCSupabase.upsertUserRating(payload);
      }
    } catch (error) {
      console.error('[KCAPI][Supabase] upsertUserRating falhou:', error);
      return { ok: false, error };
    }

    return { ok: false, error: { message: 'Avaliações indisponíveis no cliente Supabase.' } };
  }

  // ── Grupo posts-write extraído para supabase.posts-write.adapter.js (v11.30.8) ──
  // parsePriceMaybe, toSlug, clampCreatedAtISO, normalizeCreatePayload,
  // supabaseCreatePost (createPost), kcApiError, enforceSupabaseOnProduction,
  // normalizeUpdatePayload, resolvePostUuid, supabaseUpdatePost (updatePost),
  // syncPostMediaForUpdate, supabaseDeletePost (deletePost),
  // supabaseReportPost (reportPost)
  // → window._KCSA.postsWrite.*

  // ── Comments (V8.1.7.2) — extraídas para supabase.comments.adapter.js (v11.30.3) ──

  // ── Grupo profiles extraído para supabase.profiles.adapter.js (v11.30.9) ──
  // normalizeProfilePatchForAdapter, uploadProfileAvatarToSupabaseStorage,
  // syncCurrentProfileCache, supabaseGetMyProfile (getMyProfile),
  // supabaseUpdateMyProfile (updateMyProfile), supabaseUploadProfileAvatar (uploadProfileAvatar)
  // → window._KCSA.profiles.*

  // ── Admin / Help Requests — extraídas para supabase.admin.adapter.js (v11.30.2) ──

  // ── Grupo posts-read (parte 2) extraído para supabase.posts-read.adapter.js (v11.30.7) ──
  // supabaseGetMyPosts, supabaseGetPostsByAuthorId, supabaseGetRelatedPosts
  // → window._KCSA.posts.*

  // ── Grupo saved extraído para supabase.saved.adapter.js (v11.30.6) ──────────
  // resolvePostUuidForSavedPosts, normalizeSaveKind, normalizeSaveKinds,
  // mapSavedSummaryRow, aggregateSavedRows, paginateList, fetchSavedRowsFallback,
  // supabaseGetSavedPostState(legacy), supabaseSetSavedPostState(legacy),
  // supabaseClearSavedPostState(legacy), supabaseGetMySavedPosts(legacy),
  // supabaseGetProfileHighlights(legacy), supabaseGetSavedPostStateMulti,
  // supabaseClearSavedPostStateMulti, supabaseSetSavedPostStateMulti,
  // supabaseGetMySavedPostsMulti, supabaseGetMySavedPostsCount,
  // supabaseGetProfileHighlightsMulti, supabaseGetProfileHighlightsCount
  // → window._KCSA.saved.*

  // ── Comments / likeComment — extraído para supabase.comments.adapter.js (v11.30.3) ──

  // ── Votes (V8.1.7.3) — extraídas para supabase.votes.adapter.js (v11.30.4) ──

  // ── supabaseTogglePostStatus, supabaseRenewPost, supabaseBumpPost extraídos para supabase.posts-write.adapter.js (v11.30.8) ──
  // → window._KCSA.postsWrite.togglePostStatus, renewPost, bumpPost

  // ── Analytics — extraídas para supabase.analytics.adapter.js (v11.30.1) ──

  // ── Notifications (v9.1.0) — extraídas para supabase.notifications.adapter.js (v11.30.1) ──

  // ── Convites de usuários externos (v9.1.0.3) ─────────────────────────────

  async function supabaseInviteExternalUser(email, note) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: 'SUPABASE_NOT_READY' };
    var em = String(email || '').trim().toLowerCase();
    var nt = String(note || '').trim() || null;
    if (!em || !em.includes('@')) return { ok: false, error: 'EMAIL_INVALIDO' };
    try {
      var result = await client.functions.invoke('kc-invite-user', {
        body: { email: em, note: nt },
      });
      if (result.error) return { ok: false, error: result.error.message || String(result.error) };
      var data = result.data;
      if (data && data.error) return { ok: false, error: data.error };
      return { ok: true, data: data };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  }

  async function supabaseGetInvites() {
    const client = getSupabaseClient();
    if (!client) return { data: null, error: 'SUPABASE_NOT_READY' };
    try {
      var r = await client.rpc('kc_admin_get_invites');
      if (r.error) return { data: null, error: r.error.message || String(r.error) };
      return { data: r.data || [], error: null };
    } catch (e) {
      return { data: null, error: e && e.message ? e.message : String(e) };
    }
  }

  async function supabaseRevokeInvite(email) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: 'SUPABASE_NOT_READY' };
    try {
      var r = await client.rpc('kc_admin_revoke_invite', { p_email: String(email || '').trim().toLowerCase() });
      if (r.error) return { ok: false, error: r.error.message || String(r.error) };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  }

  // Garante namespaces _KCSA para degradação elegante quando sub-adapters não estão carregados (v11.30.1+)
  window._KCSA.analytics = window._KCSA.analytics || {};
  window._KCSA.notifications = window._KCSA.notifications || {};
  window._KCSA.admin = window._KCSA.admin || {};
  window._KCSA.comments = window._KCSA.comments || {};
  window._KCSA.votes = window._KCSA.votes || {};
  window._KCSA.media = window._KCSA.media || {};
  window._KCSA.saved = window._KCSA.saved || {};
  window._KCSA.posts = window._KCSA.posts || {};
  window._KCSA.postsWrite = window._KCSA.postsWrite || {};
  window._KCSA.profiles = window._KCSA.profiles || {};
  window._KCSA.chat = window._KCSA.chat || {};

  // Driver Supabase (V8.1.7.2+)
  const driverSupabase = Object.freeze({
    name: 'supabase',
    chat: window._KCSA.chat,
    getPosts: window._KCSA.posts.getPosts,
    searchPosts: window._KCSA.posts.searchPosts,
    getFeedCursor: window._KCSA.posts.getFeedCursor,
    getUserRatingSummary: supabaseGetUserRatingSummary,
    getUserRatingState: supabaseGetUserRatingState,
    listUserRatings: supabaseListUserRatings,
    upsertUserRating: supabaseUpsertUserRating,
    getPostById: window._KCSA.posts.getPostById,
    createPost: window._KCSA.postsWrite.createPost,
    updatePost: window._KCSA.postsWrite.updatePost,
    deletePost: window._KCSA.postsWrite.deletePost,
    reportPost: window._KCSA.postsWrite.reportPost,
    getComments: window._KCSA.comments.getComments,
    addComment: window._KCSA.comments.addComment,
    likeComment: window._KCSA.comments.likeComment,
    votePost: window._KCSA.votes.votePost,
    getMyVote: window._KCSA.votes.getMyVote,
    getMyProfile: window._KCSA.profiles.getMyProfile,
    updateMyProfile: window._KCSA.profiles.updateMyProfile,
    uploadProfileAvatar: window._KCSA.profiles.uploadProfileAvatar,
    getSearchPreferences: window._KCSA.profiles.getSearchPreferences,
    updateSearchPreferences: window._KCSA.profiles.updateSearchPreferences,
    getMyPosts: window._KCSA.posts.getMyPosts,
    getPostsByAuthorId: window._KCSA.posts.getPostsByAuthorId,
    getRelatedPosts: window._KCSA.posts.getRelatedPosts,
    getSavedPostState: window._KCSA.saved.getSavedPostState,
    setSavedPostState: window._KCSA.saved.setSavedPostState,
    clearSavedPostState: window._KCSA.saved.clearSavedPostState,
    togglePostStatus: window._KCSA.postsWrite.togglePostStatus,
    renewPost: window._KCSA.postsWrite.renewPost,
    bumpPost: window._KCSA.postsWrite.bumpPost,
    closePost: window._KCSA.postsWrite.closePost,
    reactivatePost: window._KCSA.postsWrite.reactivatePost,
    getTopContributors: window._KCSA.analytics.getTopContributors,
    trackCouponClick: window._KCSA.analytics.trackCouponClick,
    trackShare: window._KCSA.analytics.trackShare,
    trackView: window._KCSA.analytics.trackView,
    getPostAnalytics: window._KCSA.analytics.getPostAnalytics,
    checkDuplicatePost: window._KCSA.analytics.checkDuplicatePost,
    getMySavedPosts: window._KCSA.saved.getMySavedPosts,
    getMySavedPostsCount: window._KCSA.saved.getMySavedPostsCount,
    getProfileHighlights: window._KCSA.saved.getProfileHighlights,
    getProfileHighlightsCount: window._KCSA.saved.getProfileHighlightsCount,
    createHelpRequest: window._KCSA.admin.createHelpRequest,
    listAdminHelpRequests: window._KCSA.admin.listAdminHelpRequests,
    updateAdminHelpRequest: window._KCSA.admin.updateAdminHelpRequest,
    processAccountErasure: window._KCSA.admin.processAccountErasure,
    listExternalAccessRequests: window._KCSA.admin.listExternalAccessRequests,
    decideExternalAccessRequest: window._KCSA.admin.decideExternalAccessRequest,
    getNotificationPreferences: window._KCSA.notifications.getNotificationPreferences,
    updateNotificationPreferences: window._KCSA.notifications.updateNotificationPreferences,
    getNotificationChannelTargets: window._KCSA.notifications.getNotificationChannelTargets,
    updateNotificationChannelTargets: window._KCSA.notifications.updateNotificationChannelTargets,
    // Notifications (v9.1.0)
    getNotifications: window._KCSA.notifications.getNotifications,
    markNotificationsRead: window._KCSA.notifications.markNotificationsRead,
    markAllNotificationsRead: window._KCSA.notifications.markAllNotificationsRead,
    clearNotifications: window._KCSA.notifications.clearNotifications,
    getUnreadNotificationCount: window._KCSA.notifications.getUnreadNotificationCount,
    subscribeNotifications: window._KCSA.notifications.subscribeNotifications,
    unsubscribeNotifications: window._KCSA.notifications.unsubscribeNotifications,
    // Convites de usuários externos (v9.1.0.3)
    inviteExternalUser: supabaseInviteExternalUser,
    getInvites: supabaseGetInvites,
    revokeInvite: supabaseRevokeInvite,
  });


window.KCAPI.registerAdapter('supabase', driverSupabase);

// window.KCCompressImage exposto em supabase.media.adapter.js (v11.30.5)

})();


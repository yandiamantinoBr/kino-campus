
(function () {
  'use strict';
const { ENV, normalizePost } = window.KCAPI;
  const profileShared = window.KCAccountProfileUtils || {};
  const OWNER_PROFILE_FIELDS = profileShared.OWNER_PROFILE_SELECT_FIELDS || 'id, display_name, full_name, avatar_url, avatar_path, bio, verified, is_admin, created_at, updated_at, onboarding_completed_at, affiliation, gender_identity, gender_identity_custom, race_color, profile_public, contact_primary_method, contact_cta_enabled, social_links, social_visibility';
  // ── createPostDiagnostics + summarizeCreatePayloadForCreateDiagnostics extraídos para supabase.posts-write.adapter.js (v11.30.8) ──

  function normalizeProfilePatchForAdapter(patch) {
    if (profileShared && typeof profileShared.normalizeProfilePatch === 'function') {
      return profileShared.normalizeProfilePatch(patch);
    }
    return (patch && typeof patch === 'object' && !Array.isArray(patch)) ? { ...patch } : {};
  }


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

  // ── getUserDisplayNameForProfile, getUserAvatarForProfile, ensureSupabaseProfileForCreate extraídos para supabase.posts-write.adapter.js (v11.30.8) ──

  // ── Grupo media extraído para supabase.media.adapter.js (v11.30.5) ──────────
  // dataUrlToBlob, extFromMime, sanitizeFilename, checkImageMagicBytes,
  // compressImage, getPostMediaStorageBucket, escapeRegExp, stripSearchAndHash,
  // safeDecodeUriComponent, extractStoragePathFromPostMediaValue,
  // buildPostMediaCleanupContext, cleanupManagedPostMediaStorage,
  // uploadImagesToSupabaseStorage → window._KCSA.media.*

  async function uploadProfileAvatarToSupabaseStorage(client, fileOrDataUrl, options) {
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };

    const bucket = (ENV && (ENV.STORAGE_BUCKET_POST_MEDIA || (ENV.supabase && ENV.supabase.storageBucket)))
      ? String(ENV.STORAGE_BUCKET_POST_MEDIA || ENV.supabase.storageBucket)
      : 'kino-media';

    const opts = (options && typeof options === 'object') ? options : {};
    const userId = String(opts.userId || '').trim();
    if (!userId) return { ok: false, error: { message: 'Usuário inválido para upload do avatar.' } };

    const maxBytes = (ENV && ENV.supabase && Number.isFinite(ENV.supabase.maxImageBytes))
      ? Number(ENV.supabase.maxImageBytes)
      : (5 * 1024 * 1024);
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

    let blob = null;
    let directUrl = '';

    if (typeof fileOrDataUrl === 'string') {
      const raw = String(fileOrDataUrl || '').trim();
      if (!raw) return { ok: false, error: { message: 'Imagem inválida para avatar.' } };
      if (/^https?:\/\//i.test(raw)) {
        directUrl = raw;
      } else {
        blob = window._KCSA.media.dataUrlToBlob(raw);
      }
    } else if (typeof Blob !== 'undefined' && fileOrDataUrl instanceof Blob) {
      blob = fileOrDataUrl;
    }

    if (directUrl) {
      return { ok: true, data: { url: directUrl } };
    }

    if (!blob) return { ok: false, error: { message: 'Formato de imagem inválido para avatar.' } };

    const mime = String(blob.type || '').toLowerCase();
    if (!allowedTypes.has(mime)) {
      return { ok: false, error: { message: 'Use uma imagem JPG, PNG ou WEBP para o avatar.' } };
    }
    if (blob.size > maxBytes) {
      return { ok: false, error: { message: 'A imagem do avatar excede o limite permitido.' } };
    }
    // Valida magic bytes (defesa contra arquivos maliciosos com MIME falsificado)
    const actualMime = await window._KCSA.media.checkImageMagicBytes(blob);
    if (!actualMime || !allowedTypes.has(actualMime)) {
      return { ok: false, error: { message: 'O arquivo não é uma imagem válida.' } };
    }

    // Comprime avatar antes do upload (v9.4.1) — max 400×400px
    const compressedAvatar = await window._KCSA.media.compressImage(blob, 400, 400, 0.85);
    const avatarMime = compressedAvatar.type || mime;
    const ext = window._KCSA.media.extFromMime(avatarMime);
    const filename = window._KCSA.media.sanitizeFilename(`avatar.${ext}`);
    const path = `profile-avatars/${userId}/${Date.now()}-${filename}`;
    const storage = client.storage.from(bucket);

    const up = await storage.upload(path, compressedAvatar, { contentType: avatarMime || 'application/octet-stream', upsert: false });
    if (up && up.error) {
      return {
        ok: false,
        error: {
          message: 'Falha no upload do avatar.',
          code: (up.error.code != null && String(up.error.code).trim()) ? String(up.error.code).trim() : 'PROFILE_AVATAR_UPLOAD_FAILED',
          details: up.error.details || null,
          hint: up.error.hint || null,
          bucket,
          path,
        },
      };
    }

    const pub = storage.getPublicUrl(path);
    const publicUrl = (pub && pub.data && pub.data.publicUrl) ? pub.data.publicUrl : '';
    if (!publicUrl) {
      return { ok: false, error: { message: 'Não foi possível obter a URL pública do avatar.' } };
    }

    return { ok: true, data: { url: publicUrl, path } };
  }



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

  async function supabaseGetMyProfile() {
    const client = getSupabaseClient();
    if (!client) return null;
    const user = await supabaseGetCurrentUser();
    if (!user) return null;

    try {
      const res = await client
        .from('profiles')
        .select(OWNER_PROFILE_FIELDS)
        .eq('id', user.id)
        .maybeSingle();
      if (res && res.error) {
        console.error('[KCAPI][profile] getMyProfile:', res.error);
        return null;
      }
      if (res && res.data) syncCurrentProfileCache(res.data);
      return (res && res.data) ? res.data : null;
    } catch (e) {
      console.error('[KCAPI][profile] getMyProfile exceção:', e);
      return null;
    }
  }

  function syncCurrentProfileCache(profile) {
    if (window.KCProfiles && typeof window.KCProfiles.commitProfile === 'function') {
      try {
        return window.KCProfiles.commitProfile(profile);
      } catch (_) { }
    }
    try {
      document.dispatchEvent(new CustomEvent('kc:profilechange', { detail: { profile: profile || null } }));
    } catch (_) { }
    return profile || null;
  }

  async function supabaseUpdateMyProfile(patch = {}) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const user = await supabaseGetCurrentUser();
    if (!user) return { ok: false, error: { message: 'Faça login para editar seu perfil.' } };

    const updates = normalizeProfilePatchForAdapter(patch);
    const displayName = Object.prototype.hasOwnProperty.call(updates, 'display_name')
      ? String(updates.display_name || '').trim()
      : '__skip__';
    if (Object.prototype.hasOwnProperty.call(updates, 'display_name') && !String(updates.display_name || '').trim()) {
      return { ok: false, error: { message: 'Informe um nome valido.' } };
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'avatar_url')) {
      const avatarUrl = String(updates.avatar_url || '').trim();
      if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
        return { ok: false, error: { message: 'URL de avatar inválida.' } };
      }
      updates.avatar_url = avatarUrl || null;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'avatar_path')) {
      updates.avatar_path = String(updates.avatar_path || '').trim() || null;
    }
    if (!Object.keys(updates).length) {
      return { ok: false, error: { message: 'Nenhuma alteração informada.' } };
    }
    if (!displayName) return { ok: false, error: { message: 'Informe um nome válido.' } };

    try {
      const { data, error } = await client
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select(OWNER_PROFILE_FIELDS)
        .maybeSingle();

      if (error) {
        console.error('[KCAPI][profile] updateMyProfile:', error);
        return { ok: false, error: { message: error.message || 'Não foi possível atualizar seu perfil.' } };
      }
      if (!data) {
        return { ok: false, error: { message: 'No momento, não é possível alterar seu nome.' } };
      }
      syncCurrentProfileCache(data);
      return { ok: true, data };
    } catch (e) {
      console.error('[KCAPI][profile] updateMyProfile exceção:', e);
      return { ok: false, error: { message: 'Não foi possível atualizar seu perfil.' } };
    }
  }

  async function supabaseUploadProfileAvatar(fileOrDataUrl) {
    const client = getSupabaseClient();
    if (!client) return { ok: false, error: { message: 'Supabase não inicializado.' } };
    const user = await supabaseGetCurrentUser();
    if (!user) return { ok: false, error: { message: 'Faça login para atualizar seu avatar.' } };

    try {
      return await uploadProfileAvatarToSupabaseStorage(client, fileOrDataUrl, { userId: user.id });
    } catch (e) {
      console.error('[KCAPI][profile] uploadProfileAvatar exceção:', e);
      return { ok: false, error: { message: 'Não foi possível enviar o avatar.' } };
    }
  }

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

  // Driver Supabase (V8.1.7.2+)
  const driverSupabase = Object.freeze({
    name: 'supabase',
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
    getMyProfile: supabaseGetMyProfile,
    updateMyProfile: supabaseUpdateMyProfile,
    uploadProfileAvatar: supabaseUploadProfileAvatar,
    getMyPosts: window._KCSA.posts.getMyPosts,
    getPostsByAuthorId: window._KCSA.posts.getPostsByAuthorId,
    getRelatedPosts: window._KCSA.posts.getRelatedPosts,
    getSavedPostState: window._KCSA.saved.getSavedPostState,
    setSavedPostState: window._KCSA.saved.setSavedPostState,
    clearSavedPostState: window._KCSA.saved.clearSavedPostState,
    togglePostStatus: window._KCSA.postsWrite.togglePostStatus,
    renewPost: window._KCSA.postsWrite.renewPost,
    bumpPost: window._KCSA.postsWrite.bumpPost,
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


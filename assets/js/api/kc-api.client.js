/*
  KinoCampus - API Client (V8.6.1)

  Objetivo (Fase 1 - Saneamento):
  - Simular chamadas de API em um ponto único (sem frameworks).
  - Delegar usuarios mock e normalizar posts (contrato padrao com authorId).
  - Manter compatibilidade com modo estático (data/database.json) e localStorage.

  Exposição:
  - window.KCAPI
*/
(function () {
  'use strict';




  const VERSION = '8.6.1';

  // -------- Bootstrap de Configuração (KC_ENV) --------
  // Regra de fallback: se kc-env.js não estiver carregado, assume driver local.
  function readEnv() {
    const env = (window.KC_ENV && typeof window.KC_ENV === 'object') ? window.KC_ENV : null;
    if (!env) {
      console.warn('[KCAPI] window.KC_ENV não encontrado. Usando defaults (driver=local).');
    }

    const fallback = {
      version: VERSION,
      driver: 'local',
      environment: 'development',
      APP_ENV: 'development',
      isProduction: false,
      debug: true,
      SUPABASE_URL: 'https://placeholder-project.supabase.co',
      SUPABASE_ANON_KEY: 'eyJhbG...placeholder',
      supabase: {
        url: 'https://placeholder-project.supabase.co',
        anonKey: 'eyJhbG...placeholder',
        storageBucket: 'kino-media',
      },
      clamp: { month: 'February', year: 2026 },
    };

    const merged = {
      ...fallback,
      ...(env || {}),
      supabase: { ...fallback.supabase, ...(((env || {}).supabase) || {}) },
      clamp: { ...fallback.clamp, ...(((env || {}).clamp) || {}) },
    };

    const rawEnv = String((merged.APP_ENV || merged.environment || '')).trim().toLowerCase();
    const normalizedEnv = (rawEnv === 'production' || rawEnv === 'prod') ? 'production' : 'development';
    merged.environment = normalizedEnv;
    merged.APP_ENV = normalizedEnv;
    merged.isProduction = normalizedEnv === 'production';

    const rawDriver = String((merged.DATA_DRIVER || merged.driver || 'local')).toLowerCase();
    if (rawDriver === '__invalid_production_driver__') {
      merged.driver = '__invalid_production_driver__';
    } else {
      merged.driver = (rawDriver === 'supabase') ? 'supabase' : 'local';
    }
    merged.DATA_DRIVER = merged.driver;

    // Normaliza Supabase (aliases)
    if (!merged.supabase || typeof merged.supabase !== 'object') merged.supabase = {};
    const url = String(merged.SUPABASE_URL || merged.supabase.url || '').trim();
    const anonKey = String(merged.SUPABASE_ANON_KEY || merged.supabase.anonKey || '').trim();
    if (url) merged.supabase.url = url;
    if (anonKey) merged.supabase.anonKey = anonKey;
    merged.SUPABASE_URL = merged.supabase.url;
    merged.SUPABASE_ANON_KEY = merged.supabase.anonKey;

    return merged;
  }

  const ENV = readEnv();

  // Diagnostics split (V76): state lives in window._KCAPI.diagnostics.
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.diagnostics = window._KCAPI.diagnostics || {};

  function getDiagnosticsModule() {
    const diagnostics = window._KCAPI && window._KCAPI.diagnostics;
    if (!diagnostics || typeof diagnostics !== 'object') {
      throw new Error('KCAPI diagnostics module not loaded.');
    }
    return diagnostics;
  }

  function summarizeCreatePayloadForDiagnostics(parsed) {
    return getDiagnosticsModule().summarizeCreatePayloadForDiagnostics(parsed);
  }

  function setLastCreatePostError(stage, err, context) {
    return getDiagnosticsModule().setLastCreatePostError(stage, err, context);
  }

  function clearLastCreatePostError() {
    return getDiagnosticsModule().clearLastCreatePostError();
  }

  function getLastCreatePostError() {
    return getDiagnosticsModule().getLastCreatePostError();
  }

  // Related Posts split (v11.33.5)
  // Implementacoes foram movidas para window._KCAPI.related (kc-api.related.js).
  // A fachada mantem os mesmos nomes/contratos e delega via getRelatedModule().
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.related = window._KCAPI.related || {};

  function getRelatedModule() {
    if (!window._KCAPI || typeof window._KCAPI !== 'object') return null;
    const related = window._KCAPI.related;
    return (related && typeof related === 'object') ? related : null;
  }

  function buildRelatedDeps() {
    return {
      getActiveDriver,
      normalizePost,
    };
  }

  function rankRelatedPosts(currentPost, candidates, options) {
    const relatedModule = getRelatedModule();
    if (relatedModule && typeof relatedModule.rankRelatedPosts === 'function') {
      return relatedModule.rankRelatedPosts(currentPost, candidates, options, buildRelatedDeps());
    }
    return [];
  }

  // Filters split (V76): advanced local filtering lives in window._KCAPI.filters.
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.filters = window._KCAPI.filters || {};

  function getFiltersModule() {
    const filters = window._KCAPI && window._KCAPI.filters;
    if (!filters || typeof filters.filterPosts !== 'function') {
      throw new Error('KCAPI filters module not loaded.');
    }
    return filters;
  }

  function filterPosts(posts, params) {
    return getFiltersModule().filterPosts(posts, params);
  }

  // Authors split (V76): mock users and legacy author lookup live in window._KCAPI.authors.
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.authors = window._KCAPI.authors || {};

  function getAuthorsModule() {
    const authors = window._KCAPI && window._KCAPI.authors;
    if (!authors || typeof authors.getAuthorById !== 'function') {
      throw new Error('KCAPI authors module not loaded.');
    }
    return authors;
  }

  function getMockUsers() {
    return getAuthorsModule().MOCK_USERS;
  }

  function getMockUsersById() {
    return getAuthorsModule().MOCK_USERS_BY_ID;
  }

  function getMockUsersList() {
    return getAuthorsModule().MOCK_USERS_LIST;
  }

  function getAuthorById(id) {
    return getAuthorsModule().getAuthorById(id);
  }

  function resolveAuthorId(legacyName, legacyAvatarUrl) {
    return getAuthorsModule().resolveAuthorId(legacyName, legacyAvatarUrl);
  }

  // Post normalization split (V76): normalizePost lives in window._KCAPI.postsNormalize.
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.postsNormalize = window._KCAPI.postsNormalize || {};

  function getPostsNormalizeModule() {
    const postsNormalize = window._KCAPI && window._KCAPI.postsNormalize;
    if (!postsNormalize || typeof postsNormalize.normalizePost !== 'function') {
      throw new Error('KCAPI posts normalize module not loaded.');
    }
    return postsNormalize;
  }

  function normalizePost(raw) {
    return getPostsNormalizeModule().normalizePost(raw, {
      resolveAuthorId,
      defaultAvatar: (window.KC_CONSTANTS && window.KC_CONSTANTS.DEFAULT_AVATAR_SVG) || '',
    });
  }


  const DEFAULTS = {
    baseURL: '',
    fallbackDatabaseURLs: ['data/database.json'],
    timeoutMs: 10000,
    debug: false,
  };

  const cfg = { ...DEFAULTS };
  // SWR constants moved to the split modules; the facade keeps dependency wiring only.

  // Initial boot: reads KC_ENV and applies debug.
  (function bootstrapConfig() {
    cfg.debug = Boolean(ENV.debug);
  })();

  // Session/freshness split (V76): storage and broadcast logic live in window._KCAPI.session.
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.session = window._KCAPI.session || {};

  function getSessionModule() {
    const session = window._KCAPI && window._KCAPI.session;
    if (!session || typeof session !== 'object') {
      throw new Error('KCAPI session module not loaded.');
    }
    return session;
  }

  function getSessionCache(scope, key, options) {
    return getSessionModule().getSessionCache(scope, key, options);
  }

  function setSessionCache(scope, key, value) {
    return getSessionModule().setSessionCache(scope, key, value);
  }

  function removeSessionCache(scope, key) {
    return getSessionModule().removeSessionCache(scope, key);
  }

  function clearSessionCachePrefix(scope, keyPrefix) {
    return getSessionModule().clearSessionCachePrefix(scope, keyPrefix);
  }

  function clearSessionCacheScopes(scopes) {
    return getSessionModule().clearSessionCacheScopes(scopes);
  }

  function withPendingSessionRequest(bucket, key, factory) {
    return getSessionModule().withPendingSessionRequest(bucket, key, factory);
  }

  function getCachedSessionPayload(scope, key, maxAgeMs, staleMaxAgeMs, options = {}) {
    return getSessionModule().getCachedSessionPayload(scope, key, maxAgeMs, staleMaxAgeMs, options);
  }

  function persistSessionPayload(scope, key, data, signature) {
    return getSessionModule().persistSessionPayload(scope, key, data, signature);
  }
  // getCommentsCacheIdentity, getPostAnalyticsCacheKey, getCommentsCacheKey,
  // buildPostAnalyticsSignature, normalizeCommentsPayload, buildCommentsSignature
  // movidos para os sub-módulos kc-api.posts-read.js e kc-api.comments-votes.js.

  function setConfig(partial) {
    if (!partial) return;
    if (typeof partial.baseURL === 'string') cfg.baseURL = partial.baseURL;
    if (Array.isArray(partial.fallbackDatabaseURLs)) cfg.fallbackDatabaseURLs = partial.fallbackDatabaseURLs.filter(Boolean);
    if (Number.isFinite(partial.timeoutMs)) cfg.timeoutMs = partial.timeoutMs;
  }

  function withTimeout(promise, ms) {
    if (!ms || ms <= 0) return promise;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('KCAPI_TIMEOUT')), ms);
      promise.then(
        (v) => { clearTimeout(t); resolve(v); },
        (e) => { clearTimeout(t); reject(e); }
      );
    });
  }

  async function fetchJSON(url, options = {}) {
    const res = await withTimeout(fetch(url, options), cfg.timeoutMs);
    if (!res.ok) throw new Error('KCAPI_HTTP_' + res.status);
    return res.json();
  }

  function apiURL(path) {
    const base = (cfg.baseURL || '').replace(/\/$/, '');
    const p = String(path || '').replace(/^\//, '');
    return base ? (base + '/' + p) : p; // relativo quando baseURL vazio
  }

  function normalizeUserRatingSummary(raw, fallbackUserId) {
    const ratingsModule = getRatingsModule();
    if (ratingsModule && typeof ratingsModule.normalizeUserRatingSummary === 'function') {
      return ratingsModule.normalizeUserRatingSummary(raw, fallbackUserId);
    }
    return { userId: String(fallbackUserId || '').trim() || null, average: null, count: 0 };
  }

  function normalizeUserRatingEntry(raw) {
    const ratingsModule = getRatingsModule();
    if (ratingsModule && typeof ratingsModule.normalizeUserRatingEntry === 'function') {
      return ratingsModule.normalizeUserRatingEntry(raw);
    }
    return null;
  }

  function normalizeUserRatingState(raw, fallbackTargetUserId, fallbackContextPostId) {
    const ratingsModule = getRatingsModule();
    if (ratingsModule && typeof ratingsModule.normalizeUserRatingState === 'function') {
      return ratingsModule.normalizeUserRatingState(raw, fallbackTargetUserId, fallbackContextPostId);
    }
    return {
      targetUserId: String(fallbackTargetUserId || '').trim() || null,
      contextPostId: String(fallbackContextPostId || '').trim() || null,
      canRate: false,
      reason: 'UNKNOWN',
      myRating: null,
    };
  }

  function normalizeUserRatingList(raw, fallbackPage, fallbackLimit) {
    const ratingsModule = getRatingsModule();
    if (ratingsModule && typeof ratingsModule.normalizeUserRatingList === 'function') {
      return ratingsModule.normalizeUserRatingList(raw, fallbackPage, fallbackLimit);
    }
    const page = Math.max(1, parseInt(String(fallbackPage), 10) || 1);
    const limit = Math.max(1, parseInt(String(fallbackLimit), 10) || 10);
    return {
      items: [],
      page,
      limit,
      total: 0,
      hasMore: false,
    };
  }



  // ---------- Utilidades internas ----------
  function kcApiError(message) {
    return { ok: false, error: { message: String(message || 'Operação não concluída.') } };
  }

  function enforceSupabaseOnProduction(operationName) {
    if (!ENV.isProduction) return null;
    if (ENV.driver === 'supabase') return null;
    return {
      ok: false,
      error: {
        code: 'PRODUCTION_REQUIRES_SUPABASE',
        message: `Operação crítica "${String(operationName || 'unknown')}" bloqueada: em produção, o driver "supabase" é obrigatório.`,
      },
    };
  }

  // ---------- Modo estático (fallback) ----------
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
      users: getMockUsersList(),
      posts,
    };
  }

  // ---------- Supabase Auth Delegates ----------
  // Auth split (v11.33.6): supabase wrappers movidos para kc-api.auth.js

  const _adapters = {};
  function registerAdapter(name, adapter) {
    _adapters[name] = adapter;
  }

  function getActiveDriver() {
    if (ENV.driver === 'supabase' && _adapters['supabase']) return _adapters['supabase'];
    if (_adapters['local']) return _adapters['local'];
    throw new Error('No driver adapters loaded!');
  }


  // Facade pública (mantém a API estável)
  // Posts-Feed split (v11.33.2)
  // Implementacoes foram movidas para window._KCAPI.postsFeed (kc-api.posts-feed.js).
  // A fachada mantem os mesmos nomes/contratos e delega via getPostsFeedModule().
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.postsFeed = window._KCAPI.postsFeed || {};

  function getPostsFeedModule() {
    if (!window._KCAPI || typeof window._KCAPI !== 'object') return null;
    const postsFeed = window._KCAPI.postsFeed;
    return (postsFeed && typeof postsFeed === 'object') ? postsFeed : null;
  }

  function buildPostsFeedDeps() {
    return { getActiveDriver, ENV };
  }

  async function getPosts(params = {}) {
    const postsFeedModule = getPostsFeedModule();
    if (postsFeedModule && typeof postsFeedModule.getPosts === 'function') {
      return postsFeedModule.getPosts(params, buildPostsFeedDeps());
    }
    return getActiveDriver().getPosts(params);
  }
  async function searchPosts(params = {}) {
    const postsFeedModule = getPostsFeedModule();
    if (postsFeedModule && typeof postsFeedModule.searchPosts === 'function') {
      return postsFeedModule.searchPosts(params, buildPostsFeedDeps());
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.searchPosts !== 'function') {
      const posts = await driver.getPosts(params);
      return Array.isArray(posts) ? posts : [];
    }
    const posts = await driver.searchPosts(params);
    return Array.isArray(posts) ? posts : [];
  }
  async function getFeedCursor(params = {}) {
    const postsFeedModule = getPostsFeedModule();
    if (postsFeedModule && typeof postsFeedModule.getFeedCursor === 'function') {
      return postsFeedModule.getFeedCursor(params, buildPostsFeedDeps());
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.getFeedCursor !== 'function') {
      const posts = await driver.getPosts(params);
      return { posts: Array.isArray(posts) ? posts : [], nextCursor: null, hasMore: false };
    }
    return driver.getFeedCursor(params);
  }
  // v75.1 — Abas personalizadas do kc-feed-tabs (RPC kc_get_personalized_tabs).
  async function getPersonalizedTabs(limit = 8) {
    const postsFeedModule = getPostsFeedModule();
    if (postsFeedModule && typeof postsFeedModule.getPersonalizedTabs === 'function') {
      return postsFeedModule.getPersonalizedTabs(limit, buildPostsFeedDeps());
    }
    return [];
  }
  // Ratings split (v11.33.1)
  // Implementacoes foram movidas para window._KCAPI.ratings (kc-api.ratings.js).
  // A fachada mantem os mesmos nomes/contratos e delega via getRatingsModule().
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.ratings = window._KCAPI.ratings || {};

  function getRatingsModule() {
    if (!window._KCAPI || typeof window._KCAPI !== 'object') return null;
    const ratings = window._KCAPI.ratings;
    return (ratings && typeof ratings === 'object') ? ratings : null;
  }

  function buildRatingsDeps() {
    return {
      getActiveDriver,
    };
  }

  async function getUserRatingSummary(userId) {
    const ratingsModule = getRatingsModule();
    if (ratingsModule && typeof ratingsModule.getUserRatingSummary === 'function') {
      return ratingsModule.getUserRatingSummary(userId, buildRatingsDeps());
    }
    return normalizeUserRatingSummary(null, userId);
  }
  async function getUserRatingState(params = {}) {
    const ratingsModule = getRatingsModule();
    if (ratingsModule && typeof ratingsModule.getUserRatingState === 'function') {
      return ratingsModule.getUserRatingState(params, buildRatingsDeps());
    }
    const input = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
    const fallbackTargetUserId = input.targetUserId || input.target_user_id || null;
    const fallbackContextPostId = input.contextPostId || input.context_post_id || null;
    return normalizeUserRatingState(null, fallbackTargetUserId, fallbackContextPostId);
  }
  async function listUserRatings(userId, options = {}) {
    const ratingsModule = getRatingsModule();
    if (ratingsModule && typeof ratingsModule.listUserRatings === 'function') {
      return ratingsModule.listUserRatings(userId, options, buildRatingsDeps());
    }
    const input = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    return normalizeUserRatingList(null, input.page || 1, input.limit || 10);
  }
  async function upsertUserRating(payload = {}) {
    const ratingsModule = getRatingsModule();
    if (ratingsModule && typeof ratingsModule.upsertUserRating === 'function') {
      return ratingsModule.upsertUserRating(payload, buildRatingsDeps());
    }
    return { ok: false, error: { message: 'Avaliações indisponíveis neste driver.' } };
  }
  async function getPostById(id) {
    const postsFeedModule = getPostsFeedModule();
    if (postsFeedModule && typeof postsFeedModule.getPostById === 'function') {
      return postsFeedModule.getPostById(id, buildPostsFeedDeps());
    }
    return getActiveDriver().getPostById(id);
  }
  // Posts-Write split (v11.33.3)
  // Implementacoes foram movidas para window._KCAPI.postsWrite (kc-api.posts-write.js).
  // A fachada mantem os mesmos nomes/contratos e delega via getPostsWriteModule().
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.postsWrite = window._KCAPI.postsWrite || {};

  function getPostsWriteModule() {
    if (!window._KCAPI || typeof window._KCAPI !== 'object') return null;
    const postsWrite = window._KCAPI.postsWrite;
    return (postsWrite && typeof postsWrite === 'object') ? postsWrite : null;
  }

  function buildPostsWriteDeps() {
    return { getActiveDriver, ENV, postFreshness: window.KCPostFreshness };
  }

  function emitPostsWriteMutation(type, postId, result, fallback) {
    const postsWriteModule = getPostsWriteModule();
    if (!postsWriteModule || typeof postsWriteModule.emitPostMutation !== 'function') return;
    postsWriteModule.emitPostMutation(type, postId, result, fallback, buildPostsWriteDeps());
  }

  async function createPost(body) {
    let result;
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.createPost === 'function') {
      result = await postsWriteModule.createPost(body, buildPostsWriteDeps());
      emitPostsWriteMutation('created', null, result, body);
      return result;
    }
    const policyError = enforceSupabaseOnProduction('createPost');
    if (policyError) return policyError;
    result = await getActiveDriver().createPost(body);
    emitPostsWriteMutation('created', null, result, body);
    return result;
  }
  async function updatePost(postId, payload) {
    let result;
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.updatePost === 'function') {
      result = await postsWriteModule.updatePost(postId, payload, buildPostsWriteDeps());
      emitPostsWriteMutation('updated', postId, result, payload);
      return result;
    }
    if (!getActiveDriver().updatePost) return kcApiError('Edição indisponível neste driver.');
    result = await getActiveDriver().updatePost(postId, payload);
    emitPostsWriteMutation('updated', postId, result, payload);
    return result;
  }
  async function deletePost(postId) {
    let result;
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.deletePost === 'function') {
      result = await postsWriteModule.deletePost(postId, buildPostsWriteDeps());
      emitPostsWriteMutation(result && result.softDeleted === false ? 'purged' : 'soft_deleted', postId, result, { status: 'deleted' });
      return result;
    }
    if (!getActiveDriver().deletePost) return kcApiError('Exclusão indisponível neste driver.');
    result = await getActiveDriver().deletePost(postId);
    emitPostsWriteMutation(result && result.softDeleted === false ? 'purged' : 'soft_deleted', postId, result, { status: 'deleted' });
    return result;
  }
  async function reportPost(postId, payload) {
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.reportPost === 'function') {
      return postsWriteModule.reportPost(postId, payload, buildPostsWriteDeps());
    }
    if (!getActiveDriver().reportPost) {
      return { ok: false, error: { message: 'Denúncias indisponíveis neste driver.' } };
    }
    return getActiveDriver().reportPost(postId, payload);
  }
  async function togglePostStatus(postId) {
    let result;
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.togglePostStatus === 'function') {
      result = await postsWriteModule.togglePostStatus(postId, buildPostsWriteDeps());
      emitPostsWriteMutation('status_changed', postId, result, {});
      return result;
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.togglePostStatus !== 'function') {
      return { ok: false, code: 'UNAVAILABLE', message: 'Toggle de status indisponível neste driver.' };
    }
    result = await driver.togglePostStatus(postId);
    emitPostsWriteMutation('status_changed', postId, result, {});
    return result;
  }
  async function renewPost(postId) {
    let result;
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.renewPost === 'function') {
      result = await postsWriteModule.renewPost(postId, buildPostsWriteDeps());
      emitPostsWriteMutation('updated', postId, result, {});
      return result;
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.renewPost !== 'function') {
      return { ok: false, code: 'UNAVAILABLE', message: 'Renovação indisponível neste driver.' };
    }
    result = await driver.renewPost(postId);
    emitPostsWriteMutation('updated', postId, result, {});
    return result;
  }
  async function bumpPost(postId) {
    let result;
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.bumpPost === 'function') {
      result = await postsWriteModule.bumpPost(postId, buildPostsWriteDeps());
      emitPostsWriteMutation('updated', postId, result, {});
      return result;
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.bumpPost !== 'function') {
      return { ok: false, code: 'UNAVAILABLE', message: 'Impulsionamento indisponível neste driver.' };
    }
    result = await driver.bumpPost(postId);
    emitPostsWriteMutation('updated', postId, result, {});
    return result;
  }

  async function closePost(postId, payload = {}) {
    let result;
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.closePost === 'function') {
      result = await postsWriteModule.closePost(postId, payload, buildPostsWriteDeps());
      emitPostsWriteMutation('status_changed', postId, result, { status: 'closed' });
      return result;
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.closePost !== 'function') {
      return { ok: false, code: 'UNAVAILABLE', message: 'Encerramento indispon\u00EDvel neste driver.' };
    }
    result = await driver.closePost(postId, payload);
    emitPostsWriteMutation('status_changed', postId, result, { status: 'closed' });
    return result;
  }

  async function reactivatePost(postId) {
    let result;
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.reactivatePost === 'function') {
      result = await postsWriteModule.reactivatePost(postId, buildPostsWriteDeps());
      emitPostsWriteMutation('status_changed', postId, result, { status: 'published' });
      return result;
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.reactivatePost !== 'function') {
      return { ok: false, code: 'UNAVAILABLE', message: 'Reativa\u00E7\u00E3o indispon\u00EDvel neste driver.' };
    }
    result = await driver.reactivatePost(postId);
    emitPostsWriteMutation('status_changed', postId, result, { status: 'published' });
    return result;
  }

  async function getTopContributors(period, module, limit) {
    const postsFeedModule = getPostsFeedModule();
    if (postsFeedModule && typeof postsFeedModule.getTopContributors === 'function') {
      return postsFeedModule.getTopContributors(period, module, limit, buildPostsFeedDeps());
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.getTopContributors !== 'function') return [];
    return driver.getTopContributors(period, module, limit);
  }

  // Posts-Read/Analytics split (v11.32.5)
  // Implementacoes foram movidas para window._KCAPI.postsRead (kc-api.posts-read.js).
  // A fachada mantem os mesmos nomes/contratos e delega via getPostsReadModule().
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.postsRead = window._KCAPI.postsRead || {};

  function getPostsReadModule() {
    if (!window._KCAPI || typeof window._KCAPI !== 'object') return null;
    const postsRead = window._KCAPI.postsRead;
    return (postsRead && typeof postsRead === 'object') ? postsRead : null;
  }

  function buildPostsReadDeps() {
    return {
      getActiveDriver,
      ENV,
      getCachedSessionPayload,
      persistSessionPayload,
      removeSessionCache,
      withPendingSessionRequest,
    };
  }

  async function trackCouponClick(postId) {
    try {
      if (window.KCEvents && typeof window.KCEvents.track === 'function') {
        window.KCEvents.track('kc_coupon_click', { post_id: postId });
      }
    } catch (_) { }
    const postsReadModule = getPostsReadModule();
    if (postsReadModule && typeof postsReadModule.trackCouponClick === 'function') {
      return postsReadModule.trackCouponClick(postId, buildPostsReadDeps());
    }
    return { ok: false };
  }

  async function trackShare(postId, method) {
    try {
      var safeMethod = String(method || '').trim().toLowerCase();
      if (!/^(?:whatsapp|copy_link|native_share)$/.test(safeMethod)) safeMethod = 'unknown';
      if (window.KCEvents && typeof window.KCEvents.trackRecommended === 'function') {
        window.KCEvents.trackRecommended('share', { item_id: postId, content_type: 'post', method: safeMethod });
      } else if (window.KCEvents && typeof window.KCEvents.track === 'function') {
        window.KCEvents.track('kc_share', { post_id: postId, method: safeMethod });
      }
    } catch (_) { }
    const postsReadModule = getPostsReadModule();
    if (postsReadModule && typeof postsReadModule.trackShare === 'function') {
      return postsReadModule.trackShare(postId, method, buildPostsReadDeps());
    }
    return { ok: false };
  }

  async function checkDuplicatePost(userId, module, title) {
    const postsFeedModule = getPostsFeedModule();
    if (postsFeedModule && typeof postsFeedModule.checkDuplicatePost === 'function') {
      return postsFeedModule.checkDuplicatePost(userId, module, title, buildPostsFeedDeps());
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.checkDuplicatePost !== 'function') return { ok: false, candidates: [] };
    return driver.checkDuplicatePost(userId, module, title);
  }

  // ── Analytics de post (v9.3.1) — delegados via getPostsReadModule() ──
  async function trackView(postId, options) {
    try {
      if (window.KCEvents && typeof window.KCEvents.track === 'function') {
        var payload = { post_id: postId, content_type: 'post' };
        var moduleName = options && options.module
          ? String(options.module).trim().toLowerCase()
          : '';
        if (!moduleName) {
          try {
            var ds = document && document.body && document.body.dataset
              ? document.body.dataset.kcModule || document.body.dataset.module || ''
              : '';
            moduleName = String(ds || '').trim().toLowerCase();
          } catch (_) { moduleName = ''; }
        }
        if (moduleName) payload.module = moduleName;
        window.KCEvents.track('kc_post_view', payload);
      }
    } catch (_) { }
    const postsReadModule = getPostsReadModule();
    if (postsReadModule && typeof postsReadModule.trackView === 'function') {
      return postsReadModule.trackView(postId, buildPostsReadDeps());
    }
    return { ok: false };
  }

  function getCachedPostAnalytics(postId, options = {}) {
    const postsReadModule = getPostsReadModule();
    if (postsReadModule && typeof postsReadModule.getCachedPostAnalytics === 'function') {
      return postsReadModule.getCachedPostAnalytics(postId, options, buildPostsReadDeps());
    }
    return null;
  }

  function invalidatePostAnalyticsCache(postId) {
    const postsReadModule = getPostsReadModule();
    if (postsReadModule && typeof postsReadModule.invalidatePostAnalyticsCache === 'function') {
      return postsReadModule.invalidatePostAnalyticsCache(postId, buildPostsReadDeps());
    }
    return false;
  }

  async function refreshPostAnalytics(postId, options = {}) {
    const postsReadModule = getPostsReadModule();
    if (postsReadModule && typeof postsReadModule.refreshPostAnalytics === 'function') {
      return postsReadModule.refreshPostAnalytics(postId, options, buildPostsReadDeps());
    }
    return { ok: false };
  }

  async function getPostAnalytics(postId, options = {}) {
    const postsReadModule = getPostsReadModule();
    if (postsReadModule && typeof postsReadModule.getPostAnalytics === 'function') {
      return postsReadModule.getPostAnalytics(postId, options, buildPostsReadDeps());
    }
    return { ok: false };
  }


  // Auth split (v11.33.6)
  // Implementacoes foram movidas para window._KCAPI.auth (kc-api.auth.js).
  // A fachada mantem os mesmos nomes/contratos e delega via getAuthModule().
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.auth = window._KCAPI.auth || {};

  function getAuthModule() {
    if (!window._KCAPI || typeof window._KCAPI !== 'object') return null;
    const auth = window._KCAPI.auth;
    return (auth && typeof auth === 'object') ? auth : null;
  }

  function buildAuthDeps() {
    return { ENV };
  }

  async function getCurrentUser() {
    const authModule = getAuthModule();
    if (authModule && typeof authModule.getCurrentUser === 'function') {
      return authModule.getCurrentUser(buildAuthDeps());
    }
    return null;
  }

  async function signIn(email, password) {
    const authModule = getAuthModule();
    if (authModule && typeof authModule.signIn === 'function') {
      return authModule.signIn(email, password, buildAuthDeps());
    }
    return { user: null, error: { message: 'Modo local (Auth desabilitado).' } };
  }

  async function signUp(email, password, options) {
    const authModule = getAuthModule();
    if (authModule && typeof authModule.signUp === 'function') {
      return authModule.signUp(email, password, options, buildAuthDeps());
    }
    return { user: null, error: { message: 'Modo local (Auth desabilitado).' } };
  }

  async function resendConfirmation(email, options) {
    const authModule = getAuthModule();
    if (authModule && typeof authModule.resendConfirmation === 'function') {
      return authModule.resendConfirmation(email, options, buildAuthDeps());
    }
    return { ok: false, error: { message: 'Modo local (Auth desabilitado).' } };
  }

  async function requestPasswordReset(email, options) {
    const authModule = getAuthModule();
    if (authModule && typeof authModule.requestPasswordReset === 'function') {
      return authModule.requestPasswordReset(email, options, buildAuthDeps());
    }
    return { ok: false, error: { message: 'Modo local (Auth desabilitado).' } };
  }

  async function updatePassword(password) {
    const authModule = getAuthModule();
    if (authModule && typeof authModule.updatePassword === 'function') {
      return authModule.updatePassword(password, buildAuthDeps());
    }
    return { ok: false, error: { message: 'Modo local (Auth desabilitado).' } };
  }

  // Aliases (compat)
  async function login(email, password) {
    const authModule = getAuthModule();
    if (authModule && typeof authModule.login === 'function') {
      return authModule.login(email, password, buildAuthDeps());
    }
    return null;
  }

  async function logout() {
    const authModule = getAuthModule();
    if (authModule && typeof authModule.logout === 'function') {
      return authModule.logout(buildAuthDeps());
    }
    return false;
  }


  // Profiles split (v11.33.4)
  // Implementacoes foram movidas para window._KCAPI.profiles (kc-api.profiles.js).
  // A fachada mantem os mesmos nomes/contratos e delega via getProfilesModule().
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.profiles = window._KCAPI.profiles || {};

  function getProfilesModule() {
    if (!window._KCAPI || typeof window._KCAPI !== 'object') return null;
    const profiles = window._KCAPI.profiles;
    return (profiles && typeof profiles === 'object') ? profiles : null;
  }

  function buildProfilesDeps() {
    return { getActiveDriver, ENV, getAuthorById };
  }

  function getCurrentProfile() {
    const profilesModule = getProfilesModule();
    if (profilesModule && typeof profilesModule.getCurrentProfile === 'function') {
      return profilesModule.getCurrentProfile(buildProfilesDeps());
    }
    if (ENV.driver !== 'supabase') return null;
    if (window.KCProfiles && typeof window.KCProfiles.getCurrentProfile === 'function') return window.KCProfiles.getCurrentProfile();
    return null;
  }

  async function getProfileById(id) {
    const profilesModule = getProfilesModule();
    if (profilesModule && typeof profilesModule.getProfileById === 'function') {
      return profilesModule.getProfileById(id, buildProfilesDeps());
    }
    return null;
  }

  async function syncProfile() {
    const profilesModule = getProfilesModule();
    if (profilesModule && typeof profilesModule.syncProfile === 'function') {
      return profilesModule.syncProfile(buildProfilesDeps());
    }
    if (ENV.driver !== 'supabase') return null;
    if (window.KCProfiles && typeof window.KCProfiles.ensureSynced === 'function') return window.KCProfiles.ensureSynced();
    return null;
  }


  function isBackendEnabled() { return !!cfg.baseURL; }

  // Comments-Votes split (v11.32.6)
  // Implementacoes foram movidas para window._KCAPI.commentsVotes (kc-api.comments-votes.js).
  // A fachada mantem os mesmos nomes/contratos e delega via getCommentsVotesModule().
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.commentsVotes = window._KCAPI.commentsVotes || {};

  function getCommentsVotesModule() {
    if (!window._KCAPI || typeof window._KCAPI !== 'object') return null;
    const commentsVotes = window._KCAPI.commentsVotes;
    return (commentsVotes && typeof commentsVotes === 'object') ? commentsVotes : null;
  }

  function buildCommentsVotesDeps() {
    return {
      getActiveDriver,
      ENV,
      invalidatePostAnalyticsCache,
      getCachedSessionPayload,
      persistSessionPayload,
      removeSessionCache,
      clearSessionCachePrefix,
      withPendingSessionRequest,
    };
  }

  // Comments facade (V8.1.7.2) — delegado via getCommentsVotesModule()
  // Em driver=supabase: usa tabela public.comments.
  // Em driver=local: retorna null; kc-core.js usa localStorage diretamente.
  function getCachedComments(postId, options = {}) {
    const m = getCommentsVotesModule();
    if (m && typeof m.getCachedComments === 'function') {
      return m.getCachedComments(postId, options, buildCommentsVotesDeps());
    }
    return null;
  }

  function invalidateCommentsCache(postId) {
    const m = getCommentsVotesModule();
    if (m && typeof m.invalidateCommentsCache === 'function') {
      return m.invalidateCommentsCache(postId, buildCommentsVotesDeps());
    }
    return false;
  }

  async function refreshComments(postId, options = {}) {
    const m = getCommentsVotesModule();
    if (m && typeof m.refreshComments === 'function') {
      return m.refreshComments(postId, options, buildCommentsVotesDeps());
    }
    return null;
  }

  async function getComments(postId, options = {}) {
    const m = getCommentsVotesModule();
    if (m && typeof m.getComments === 'function') {
      return m.getComments(postId, options, buildCommentsVotesDeps());
    }
    return null;
  }

  async function addComment(postId, body, options = {}) {
    const m = getCommentsVotesModule();
    if (m && typeof m.addComment === 'function') {
      return m.addComment(postId, body, options, buildCommentsVotesDeps());
    }
    return null;
  }

  async function likeComment(commentId, options = {}) {
    const m = getCommentsVotesModule();
    if (m && typeof m.likeComment === 'function') {
      return m.likeComment(commentId, options, buildCommentsVotesDeps());
    }
    return null;
  }

  // Votes facade (V8.1.7.3) — delegado via getCommentsVotesModule()
  async function votePost(postId, direction, options = {}) {
    const m = getCommentsVotesModule();
    if (m && typeof m.votePost === 'function') {
      return m.votePost(postId, direction, options, buildCommentsVotesDeps());
    }
    return null;
  }

  async function getMyVote(postId) {
    const m = getCommentsVotesModule();
    if (m && typeof m.getMyVote === 'function') {
      return m.getMyVote(postId, buildCommentsVotesDeps());
    }
    return null;
  }

  async function getMyProfile() {
    const profilesModule = getProfilesModule();
    if (profilesModule && typeof profilesModule.getMyProfile === 'function') {
      return profilesModule.getMyProfile(buildProfilesDeps());
    }
    const activeDriver = getActiveDriver();
    if (!activeDriver || typeof activeDriver.getMyProfile !== 'function') return null;
    return activeDriver.getMyProfile();
  }

  async function updateMyProfile(patch = {}) {
    const profilesModule = getProfilesModule();
    if (profilesModule && typeof profilesModule.updateMyProfile === 'function') {
      return profilesModule.updateMyProfile(patch, buildProfilesDeps());
    }
    return { ok: false, error: { message: 'Perfil indisponível neste driver.' } };
  }

  async function uploadProfileAvatar(fileOrDataUrl) {
    const profilesModule = getProfilesModule();
    if (profilesModule && typeof profilesModule.uploadProfileAvatar === 'function') {
      return profilesModule.uploadProfileAvatar(fileOrDataUrl, buildProfilesDeps());
    }
    return { ok: false, error: { message: 'Upload de avatar indisponível neste driver.' } };
  }

  async function getMyPosts(params = {}) {
    const postsFeedModule = getPostsFeedModule();
    if (postsFeedModule && typeof postsFeedModule.getMyPosts === 'function') {
      return postsFeedModule.getMyPosts(params, buildPostsFeedDeps());
    }
    const driver = getActiveDriver();
    if (ENV.driver !== 'supabase' && driver && typeof driver.getMyPosts === 'function') return driver.getMyPosts(params);
    if (ENV.driver !== 'supabase' || !getActiveDriver().getMyPosts) return [];
    return driver.getMyPosts(params);
  }

  async function getPostsByAuthorId(authorId, params = {}) {
    const postsFeedModule = getPostsFeedModule();
    if (postsFeedModule && typeof postsFeedModule.getPostsByAuthorId === 'function') {
      return postsFeedModule.getPostsByAuthorId(authorId, params, buildPostsFeedDeps());
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.getPostsByAuthorId !== 'function') return [];
    return driver.getPostsByAuthorId(authorId, params);
  }

  async function getRelatedPosts(postId, options = {}) {
    const relatedModule = getRelatedModule();
    if (relatedModule && typeof relatedModule.getRelatedPosts === 'function') {
      return relatedModule.getRelatedPosts(postId, options, buildRelatedDeps());
    }
    return [];
  }

  // Saved/Highlights split (v11.32.3)
  // Implementacoes foram movidas para window._KCAPI.saved (kc-api.saved.js).
  // A fachada mantem os mesmos nomes/contratos e delega via getSavedModule().
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.saved = window._KCAPI.saved || {};

  function getSavedModule() {
    if (!window._KCAPI || typeof window._KCAPI !== 'object') return null;
    const saved = window._KCAPI.saved;
    return (saved && typeof saved === 'object') ? saved : null;
  }

  async function getSavedPostState(postId) {
    const savedModule = getSavedModule();
    if (savedModule && typeof savedModule.getSavedPostState === 'function') {
      return savedModule.getSavedPostState(postId, { getActiveDriver, ENV, invalidatePostAnalyticsCache });
    }
    return { kinds: [] };
  }

  async function setSavedPostState(postId, kind, enabled) {
    const savedModule = getSavedModule();
    if (savedModule && typeof savedModule.setSavedPostState === 'function') {
      return savedModule.setSavedPostState(postId, kind, enabled, { getActiveDriver, ENV, invalidatePostAnalyticsCache });
    }
    return { ok: false, error: { message: 'Salvos indisponíveis neste driver.' } };
  }

  async function clearSavedPostState(postId, kind) {
    const savedModule = getSavedModule();
    if (savedModule && typeof savedModule.clearSavedPostState === 'function') {
      return savedModule.clearSavedPostState(postId, kind, { getActiveDriver, ENV, invalidatePostAnalyticsCache });
    }
    return { ok: false, error: { message: 'Salvos indisponíveis neste driver.' } };
  }

  async function getMySavedPosts(params = {}) {
    const savedModule = getSavedModule();
    if (savedModule && typeof savedModule.getMySavedPosts === 'function') {
      return savedModule.getMySavedPosts(params, { getActiveDriver, ENV, invalidatePostAnalyticsCache });
    }
    return [];
  }

  async function getMySavedPostsCount(params = {}) {
    const savedModule = getSavedModule();
    if (savedModule && typeof savedModule.getMySavedPostsCount === 'function') {
      return savedModule.getMySavedPostsCount(params, { getActiveDriver, ENV, invalidatePostAnalyticsCache });
    }
    return 0;
  }

  async function getProfileHighlights(profileId, params = {}) {
    const savedModule = getSavedModule();
    if (savedModule && typeof savedModule.getProfileHighlights === 'function') {
      return savedModule.getProfileHighlights(profileId, params, { getActiveDriver, ENV, invalidatePostAnalyticsCache });
    }
    return [];
  }

  async function getProfileHighlightsCount(profileId, params = {}) {
    const savedModule = getSavedModule();
    if (savedModule && typeof savedModule.getProfileHighlightsCount === 'function') {
      return savedModule.getProfileHighlightsCount(profileId, params, { getActiveDriver, ENV, invalidatePostAnalyticsCache });
    }
    return 0;
  }

  // Help/Invites split (v11.32.4)
  // Implementacoes foram movidas para window._KCAPI.help (kc-api.help.js).
  // A fachada mantem os mesmos nomes/contratos e delega via getHelpModule().
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.help = window._KCAPI.help || {};

  function getHelpModule() {
    if (!window._KCAPI || typeof window._KCAPI !== 'object') return null;
    const help = window._KCAPI.help;
    return (help && typeof help === 'object') ? help : null;
  }

  async function createHelpRequest(payload = {}) {
    const helpModule = getHelpModule();
    if (helpModule && typeof helpModule.createHelpRequest === 'function') {
      return helpModule.createHelpRequest(payload, { getActiveDriver });
    }
    return { ok: false, error: { message: 'Pedidos de ajuda indisponíveis neste driver.' } };
  }
  async function recoverPrivacyHelpRequest(payload = {}) { const helpModule = getHelpModule(); return helpModule && typeof helpModule.recoverPrivacyHelpRequest === 'function' ? helpModule.recoverPrivacyHelpRequest(payload, { getActiveDriver }) : { ok: false, error: { code: 'BACKEND_REQUIRED', message: 'Recuperação de pedidos indisponível neste driver.' } }; }

  async function listAdminHelpRequests(filters = {}) {
    const helpModule = getHelpModule();
    if (helpModule && typeof helpModule.listAdminHelpRequests === 'function') {
      return helpModule.listAdminHelpRequests(filters, { getActiveDriver });
    }
    return [];
  }

  async function updateAdminHelpRequest(id, patch = {}) {
    const helpModule = getHelpModule();
    if (helpModule && typeof helpModule.updateAdminHelpRequest === 'function') {
      return helpModule.updateAdminHelpRequest(id, patch, { getActiveDriver });
    }
    return { ok: false, error: { message: 'Triagem de ajuda indisponível neste driver.' } };
  }

  async function processAccountErasure(payload = {}) {
    const helpModule = getHelpModule();
    if (helpModule && typeof helpModule.processAccountErasure === 'function') {
      return helpModule.processAccountErasure(payload, { getActiveDriver });
    }
    return { ok: false, error: { message: 'Fluxo LGPD indisponivel neste driver.' } };
  }

  function callPrivacyHelpMethod(method, args) {
    const helpModule = getHelpModule();
    if (helpModule && typeof helpModule[method] === 'function') {
      return helpModule[method](...args, { getActiveDriver });
    }
    return Promise.resolve({ ok: false, data: null, error: { code: 'BACKEND_REQUIRED', message: 'Fluxo de privacidade indisponível neste ambiente.' } });
  }

  function createDataSubjectRequest(payload = {}) { return callPrivacyHelpMethod('createDataSubjectRequest', [payload]); }
  function listDataSubjectRequests(options = {}) { return callPrivacyHelpMethod('listDataSubjectRequests', [options]); }
  function getDataSubjectRequest(protocol, options = {}) { return callPrivacyHelpMethod('getDataSubjectRequest', [protocol, options]); }
  function downloadDataSubjectExport(protocol, options = {}) { return callPrivacyHelpMethod('downloadDataSubjectExport', [protocol, options]); }
  function downloadDataSubjectSupplement(protocol, artifactRef, options = {}) { return callPrivacyHelpMethod('downloadDataSubjectSupplement', [protocol, artifactRef, options]); }
  function cancelDataSubjectRequest(protocol, options = {}) { return callPrivacyHelpMethod('cancelDataSubjectRequest', [protocol, options]); }
  function processDataExportSupplement(payload = {}) { return callPrivacyHelpMethod('processDataExportSupplement', [payload]); }

  // v9.3.5.4: solicitacoes de acesso externo (admin)
  async function listExternalAccessRequests(filters = {}) {
    const helpModule = getHelpModule();
    if (helpModule && typeof helpModule.listExternalAccessRequests === 'function') {
      return helpModule.listExternalAccessRequests(filters, { getActiveDriver });
    }
    return { ok: false, error: { message: 'Funcionalidade indisponível neste driver.' }, items: [], total: 0 };
  }

  async function decideExternalAccessRequest(payload = {}) {
    const helpModule = getHelpModule();
    if (helpModule && typeof helpModule.decideExternalAccessRequest === 'function') {
      return helpModule.decideExternalAccessRequest(payload, { getActiveDriver });
    }
    return { ok: false, error: { message: 'Funcionalidade indisponível neste driver.' } };
  }

  // Notifications split (v11.32.2)
  window._KCAPI = window._KCAPI || {};
  window._KCAPI.notifications = window._KCAPI.notifications || {};

  function getNotificationsModule() {
    if (!window._KCAPI || typeof window._KCAPI !== 'object') return null;
    const notifications = window._KCAPI.notifications;
    return (notifications && typeof notifications === 'object') ? notifications : null;
  }

  async function getNotificationPreferences() {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.getNotificationPreferences === 'function') {
      return notificationsModule.getNotificationPreferences({ getActiveDriver, accountProfileUtils: window.KCAccountProfileUtils });
    }
    if (notificationsModule && typeof notificationsModule.buildFallbackNotificationPreferences === 'function') {
      return notificationsModule.buildFallbackNotificationPreferences({ accountProfileUtils: window.KCAccountProfileUtils });
    }
    if (window.KCAccountProfileUtils && typeof window.KCAccountProfileUtils.buildDefaultNotificationPreferences === 'function') {
      return window.KCAccountProfileUtils.buildDefaultNotificationPreferences();
    }
    return {};
  }

  async function updateNotificationPreferences(preferences = {}) {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.updateNotificationPreferences === 'function') {
      return notificationsModule.updateNotificationPreferences(preferences, { getActiveDriver, accountProfileUtils: window.KCAccountProfileUtils });
    }
    return { ok: false, error: { message: 'Prefer\u00EAncias de notifica\u00E7\u00E3o indispon\u00EDveis neste driver.' } };
  }

  async function getSearchPreferences() {
    const driver = getActiveDriver();
    if (driver && typeof driver.getSearchPreferences === 'function') {
      return driver.getSearchPreferences();
    }
    if (window.KCSearchPreferences && typeof window.KCSearchPreferences.defaultState === 'function') {
      return window.KCSearchPreferences.defaultState();
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
    const driver = getActiveDriver();
    if (driver && typeof driver.updateSearchPreferences === 'function') {
      return driver.updateSearchPreferences(preferences);
    }
    return { ok: false, error: { message: 'Prefer\u00EAncias de busca indispon\u00EDveis neste driver.' } };
  }

  async function getNotificationChannelTargets() {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.getNotificationChannelTargets === 'function') {
      return notificationsModule.getNotificationChannelTargets({ getActiveDriver, accountProfileUtils: window.KCAccountProfileUtils });
    }
    if (notificationsModule && typeof notificationsModule.buildFallbackNotificationChannelTargets === 'function') {
      return notificationsModule.buildFallbackNotificationChannelTargets({ accountProfileUtils: window.KCAccountProfileUtils });
    }
    if (window.KCAccountProfileUtils && typeof window.KCAccountProfileUtils.buildDefaultNotificationChannelTargets === 'function') {
      return window.KCAccountProfileUtils.buildDefaultNotificationChannelTargets();
    }
    return {};
  }

  async function updateNotificationChannelTargets(targets = {}) {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.updateNotificationChannelTargets === 'function') {
      return notificationsModule.updateNotificationChannelTargets(targets, { getActiveDriver, accountProfileUtils: window.KCAccountProfileUtils });
    }
    return { ok: false, error: { message: 'Destinos privados de notifica\u00E7\u00E3o indispon\u00EDveis neste driver.' } };
  }
  // Notifications (v9.1.0)

  async function getNotifications(limit, offset) {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.getNotifications === 'function') {
      return notificationsModule.getNotifications(limit, offset, { getActiveDriver });
    }
    return { ok: false, notifications: [], unread: 0, total: 0 };
  }

  async function markNotificationsRead(ids) {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.markNotificationsRead === 'function') {
      return notificationsModule.markNotificationsRead(ids, { getActiveDriver });
    }
    return { ok: false, error: 'UNAVAILABLE' };
  }

  async function markAllNotificationsRead() {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.markAllNotificationsRead === 'function') {
      return notificationsModule.markAllNotificationsRead({ getActiveDriver });
    }
    return { ok: false, error: 'UNAVAILABLE' };
  }

  async function clearNotifications() {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.clearNotifications === 'function') {
      return notificationsModule.clearNotifications({ getActiveDriver });
    }
    return { ok: false, error: 'UNAVAILABLE' };
  }

  async function getUnreadNotificationCount() {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.getUnreadNotificationCount === 'function') {
      return notificationsModule.getUnreadNotificationCount({ getActiveDriver });
    }
    return 0;
  }

  function subscribeNotifications(userId, callback) {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.subscribeNotifications === 'function') {
      return notificationsModule.subscribeNotifications(userId, callback, { getActiveDriver });
    }
    return null;
  }

  function unsubscribeNotifications(channel) {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.unsubscribeNotifications === 'function') {
      return notificationsModule.unsubscribeNotifications(channel, { getActiveDriver });
    }
  }
  // ── Convites de usuários externos (v9.1.0.3) — delegados via getHelpModule() ─

  async function inviteExternalUser(email, note) {
    const helpModule = getHelpModule();
    if (helpModule && typeof helpModule.inviteExternalUser === 'function') {
      return helpModule.inviteExternalUser(email, note, { getActiveDriver });
    }
    return { ok: false, error: 'DRIVER_NAO_SUPORTA' };
  }

  async function getInvites() {
    const helpModule = getHelpModule();
    if (helpModule && typeof helpModule.getInvites === 'function') {
      return helpModule.getInvites({ getActiveDriver });
    }
    return { data: [], error: null };
  }

  async function revokeInvite(email) {
    const helpModule = getHelpModule();
    if (helpModule && typeof helpModule.revokeInvite === 'function') {
      return helpModule.revokeInvite(email, { getActiveDriver });
    }
    return { ok: false, error: 'DRIVER_NAO_SUPORTA' };
  }

  window._KCAPI = window._KCAPI || {};
  const chat = window._KCAPI.chat || {};
  window._KCAPI.chat = chat;

  window.KCAPI = Object.freeze({
    VERSION,
    ENV,
    config: cfg,
    registerAdapter,
    get activeDriver() { try { return getActiveDriver().name; } catch(e) { return 'pending'; } },

    setConfig,
    fetchJSON,

    // Data access
    getDatabaseRaw,
    getDatabaseNormalized,
    getPosts,
    searchPosts,
    getFeedCursor,
    getPersonalizedTabs,
    getUserRatingSummary,
    getUserRatingState,
    listUserRatings,
    upsertUserRating,
    getPostById,
    createPost,
    updatePost,
    deletePost,
    reportPost,
    togglePostStatus,
    renewPost,
    bumpPost,
    closePost,
    reactivatePost,
    getTopContributors,
    trackCouponClick,
    trackShare,
    trackView,
    getCachedPostAnalytics,
    refreshPostAnalytics,
    invalidatePostAnalyticsCache,
    getPostAnalytics,
    checkDuplicatePost,

    // Comments (Supabase) — V8.1.7.2
    getCachedComments,
    refreshComments,
    invalidateCommentsCache,
    getComments,
    addComment,
    likeComment,

    // Votes (Supabase) — V8.1.7.3
    votePost,
    getMyVote,
    getMyProfile,
    updateMyProfile,
    uploadProfileAvatar,
    getMyPosts,
    getPostsByAuthorId,
    getRelatedPosts,
    getSavedPostState,
    setSavedPostState,
    clearSavedPostState,
    getMySavedPosts,
    getMySavedPostsCount,
    getProfileHighlights,
    getProfileHighlightsCount,
    createHelpRequest,
    recoverPrivacyHelpRequest,
    listAdminHelpRequests,
    updateAdminHelpRequest,
    processAccountErasure,
    createDataSubjectRequest,
    listDataSubjectRequests,
    getDataSubjectRequest,
    downloadDataSubjectExport,
    downloadDataSubjectSupplement,
    cancelDataSubjectRequest,
    processDataExportSupplement,
    listExternalAccessRequests,
    decideExternalAccessRequest,
    getNotificationPreferences,
    updateNotificationPreferences,
    getNotificationChannelTargets,
    updateNotificationChannelTargets,
    getSearchPreferences,
    updateSearchPreferences,

    // Notifications (v9.1.0)
    getNotifications,
    markNotificationsRead,
    markAllNotificationsRead,
    clearNotifications,
    getUnreadNotificationCount,
    subscribeNotifications,
    unsubscribeNotifications,

    // Mensagens diretas (v9.3.5.14)
    chat,

    // Convites externos (v9.1.0.3)
    inviteExternalUser,
    getInvites,
    revokeInvite,

    // Auth (Supabase)
    getCurrentUser,
    signIn,
    signUp,
    resendConfirmation,
    requestPasswordReset,
    updatePassword,
    // compat
    login,
    logout,

    // Profiles (Supabase)
    getCurrentProfile,
    getProfileById,
    syncProfile,
    getLastCreatePostError,
    setLastCreatePostError,
    clearLastCreatePostError,
    summarizeCreatePayloadForDiagnostics,
    rankRelatedPosts,

    // Users
    get MOCK_USERS() { return getMockUsers(); },

    apiURL,
    DEFAULTS,
    get MOCK_USERS_BY_ID() { return getMockUsersById(); },
    get MOCK_USERS_LIST() { return getMockUsersList(); },

    getAuthorById,

    // Utils
    filterPosts,
    normalizePost,
    normalizeUserRatingSummary,
    normalizeUserRatingEntry,
    normalizeUserRatingState,
    normalizeUserRatingList,
    isBackendEnabled,
  });

  window.getLastCreatePostError = getLastCreatePostError;
  window.setLastCreatePostError = setLastCreatePostError;
  window.clearLastCreatePostError = clearLastCreatePostError;
  window.summarizeCreatePayloadForDiagnostics = summarizeCreatePayloadForDiagnostics;

})();

/*
  KinoCampus - KCAPI Comments-Votes Module (v11.32.6)

  Extraído de kc-api.client.js como parte da trilha v11.32.x de split do facade KCAPI.
  Registrado em window._KCAPI.commentsVotes — consumido via getCommentsVotesModule() no facade.

  Métodos exportados (8):
    getCachedComments, invalidateCommentsCache, refreshComments, getComments,
    addComment, likeComment, votePost, getMyVote

  Deps injetadas pelo facade via buildCommentsVotesDeps():
    { getActiveDriver, ENV, invalidatePostAnalyticsCache,
      getCachedSessionPayload, persistSessionPayload,
      removeSessionCache, clearSessionCachePrefix,
      withPendingSessionRequest }
*/
(function () {
  'use strict';

  window._KCAPI = window._KCAPI || {};

  // ── Constantes SWR (auto-contidas neste módulo) ─────────────────────────
  var PRODUCT_COMMENTS_CACHE_MAX_AGE_MS = 15000;
  var PRODUCT_COMMENTS_STALE_MAX_AGE_MS = 2 * 60 * 1000;
  var _pendingProductCommentsRequests = new Map();

  // ── Helpers internos ────────────────────────────────────────────────────

  function getActiveDriverOrNull(deps) {
    try {
      if (!deps || typeof deps.getActiveDriver !== 'function') return null;
      const driver = deps.getActiveDriver();
      return (driver && typeof driver === 'object') ? driver : null;
    } catch (_) {
      return null;
    }
  }

  function getEnvDriver(deps) {
    return (deps && deps.ENV && typeof deps.ENV.driver === 'string') ? deps.ENV.driver : 'local';
  }

  function enforceSupabaseOnProduction(operationName, deps) {
    const env = (deps && deps.ENV && typeof deps.ENV === 'object') ? deps.ENV : {};
    if (!env.isProduction) return null;
    if (env.driver === 'supabase') return null;
    return {
      ok: false,
      error: {
        code: 'PRODUCTION_REQUIRES_SUPABASE',
        message: `Operação crítica "${String(operationName || 'unknown')}" bloqueada: em produção, o driver "supabase" é obrigatório.`,
      },
    };
  }

  function getCommentsCacheIdentity(deps) {
    const envDriver = getEnvDriver(deps);
    if (envDriver !== 'supabase') return `driver:${envDriver}`;
    try {
      if (window.KCSupabase && typeof window.KCSupabase.getUser === 'function') {
        const user = window.KCSupabase.getUser();
        if (user && user.id) return `user:${String(user.id).trim()}`;
      }
    } catch (_) { }
    return 'user:anon';
  }

  function getCommentsCacheKey(postId, deps) {
    return `comments:${getCommentsCacheIdentity(deps)}:${String(postId || '').trim()}`;
  }

  function normalizeCommentsPayload(comments) {
    return Array.isArray(comments)
      ? comments.filter(Boolean).map((comment) => ((comment && typeof comment === 'object') ? { ...comment } : comment))
      : [];
  }

  function buildCommentsSignature(comments) {
    return normalizeCommentsPayload(comments).map((comment) => [
      String(comment && (comment.id || '')).trim(),
      String(comment && (comment.parent_id || comment.parentId || '')).trim(),
      String(comment && (comment.created_at || '')).trim(),
      String(comment && (comment.updated_at || '')).trim(),
      Number(comment && comment.likes) || 0,
      comment && (comment.liked_by_me || comment.likedByMe) ? 1 : 0,
      String(comment && (comment.body || comment.text || '')).trim(),
    ].join('~')).join('|');
  }

  // ── API pública ─────────────────────────────────────────────────────────

  function getCachedComments(postId, options, deps) {
    const id = String(postId || '').trim();
    if (!id) return null;
    if (!deps || typeof deps.getCachedSessionPayload !== 'function') return null;
    const opts = (options && typeof options === 'object') ? options : {};
    return deps.getCachedSessionPayload(
      'product',
      getCommentsCacheKey(id, deps),
      PRODUCT_COMMENTS_CACHE_MAX_AGE_MS,
      PRODUCT_COMMENTS_STALE_MAX_AGE_MS,
      opts
    );
  }

  function invalidateCommentsCache(postId, deps) {
    if (!deps || typeof deps.removeSessionCache !== 'function') return false;
    const id = String(postId || '').trim();
    if (id) {
      return deps.removeSessionCache('product', getCommentsCacheKey(id, deps));
    }
    if (typeof deps.clearSessionCachePrefix === 'function') {
      return deps.clearSessionCachePrefix('product', `comments:${getCommentsCacheIdentity(deps)}:`) > 0;
    }
    return false;
  }

  async function refreshComments(postId, options, deps) {
    const envDriver = getEnvDriver(deps);
    const driver = getActiveDriverOrNull(deps);
    if (envDriver !== 'supabase' || !driver || !driver.getComments) return null;
    const id = String(postId || '').trim();
    if (!id) return [];

    const opts = (options && typeof options === 'object') ? options : {};
    if (opts.force !== true) {
      const cached = getCachedComments(id, {}, deps);
      if (cached) return cached.data;
    }

    const requestKey = getCommentsCacheKey(id, deps);

    if (deps && typeof deps.withPendingSessionRequest === 'function') {
      return deps.withPendingSessionRequest(_pendingProductCommentsRequests, requestKey, async () => {
        const comments = await driver.getComments(id);
        const normalized = normalizeCommentsPayload(comments);
        if (typeof deps.persistSessionPayload === 'function') {
          deps.persistSessionPayload('product', requestKey, normalized, buildCommentsSignature(normalized));
        }
        return normalized;
      });
    }

    const comments = await driver.getComments(id);
    const normalized = normalizeCommentsPayload(comments);
    if (deps && typeof deps.persistSessionPayload === 'function') {
      deps.persistSessionPayload('product', requestKey, normalized, buildCommentsSignature(normalized));
    }
    return normalized;
  }

  async function getComments(postId, options, deps) {
    const envDriver = getEnvDriver(deps);
    const driver = getActiveDriverOrNull(deps);
    if (envDriver !== 'supabase' || !driver || !driver.getComments) return null;
    const opts = (options && typeof options === 'object') ? options : {};
    if (opts.force !== true) {
      const cached = getCachedComments(postId, {}, deps);
      if (cached) return cached.data;
    }
    return refreshComments(postId, options, deps);
  }

  async function addComment(postId, body, options, deps) {
    const policyError = enforceSupabaseOnProduction('addComment', deps);
    if (policyError) return policyError;
    const envDriver = getEnvDriver(deps);
    const driver = getActiveDriverOrNull(deps);
    if (envDriver !== 'supabase' || !driver || !driver.addComment) return null;
    const opts = (options && typeof options === 'object') ? options : {};
    const result = await driver.addComment(postId, body, opts);
    if (result && result.ok) {
      invalidateCommentsCache(postId, deps);
      if (deps && typeof deps.invalidatePostAnalyticsCache === 'function') {
        deps.invalidatePostAnalyticsCache(postId);
      }
    }
    return result;
  }

  async function likeComment(commentId, options, deps) {
    const envDriver = getEnvDriver(deps);
    const driver = getActiveDriverOrNull(deps);
    if (envDriver !== 'supabase' || !driver || !driver.likeComment) return null;
    const result = await driver.likeComment(commentId);
    if (result && result.ok) {
      const postId = (options && typeof options === 'object')
        ? (options.postId || options.post_id || '')
        : '';
      if (postId) invalidateCommentsCache(postId, deps);
      else invalidateCommentsCache(null, deps);
    }
    return result;
  }

  async function votePost(postId, direction, options, deps) {
    const policyError = enforceSupabaseOnProduction('votePost', deps);
    if (policyError) return policyError;
    const envDriver = getEnvDriver(deps);
    const driver = getActiveDriverOrNull(deps);
    if (envDriver !== 'supabase' || !driver || !driver.votePost) return null;
    const opts = (options && typeof options === 'object') ? options : {};
    const result = await driver.votePost(postId, direction, opts);
    if (result && result.ok) {
      if (deps && typeof deps.invalidatePostAnalyticsCache === 'function') {
        deps.invalidatePostAnalyticsCache(postId);
      }
    }
    return result;
  }

  async function getMyVote(postId, deps) {
    const envDriver = getEnvDriver(deps);
    const driver = getActiveDriverOrNull(deps);
    if (envDriver !== 'supabase' || !driver || !driver.getMyVote) return null;
    return driver.getMyVote(postId);
  }

  window._KCAPI.commentsVotes = {
    getCachedComments,
    invalidateCommentsCache,
    refreshComments,
    getComments,
    addComment,
    likeComment,
    votePost,
    getMyVote,
  };
})();

/*
  KinoCampus - KCAPI Posts-Read Module (v11.32.5)

  Sub-modulo do dominio analytics e rastreamento de posts para a fachada KCAPI.
  Registrado em window._KCAPI.postsRead e carregado antes de kc-api.client.js.

  Contrato preservado: os 7 metodos abaixo mantem exatamente a mesma
  semantica das implementacoes previas em kc-api.client.js, incluindo
  SWR (stale-while-revalidate), invalidacao de cache e fallbacks.

  deps esperado (injetado pela fachada):
  {
    getActiveDriver,          // () => driver ativo
    ENV,                      // { driver: 'local'|'supabase', ... }
    getCachedSessionPayload,  // (scope, key, maxAge, staleMax, opts) => payload|null
    persistSessionPayload,    // (scope, key, data, sig) => void
    removeSessionCache,       // (scope, key) => bool
    withPendingSessionRequest // (bucket, key, factory) => Promise
  }
*/
(function () {
  'use strict';

  window._KCAPI = window._KCAPI || {};

  // ── Constantes SWR (espelham as do kc-api.client.js) ──────────
  var PRODUCT_ANALYTICS_CACHE_MAX_AGE_MS = 20000;
  var PRODUCT_ANALYTICS_STALE_MAX_AGE_MS = 5 * 60 * 1000;

  // Mapa de requisicoes pendentes (dedup / evita double-fetch)
  var _pendingProductAnalyticsRequests = new Map();

  // ── Helpers internos ───────────────────────────────────────────

  function getActiveDriverOrNull(deps) {
    if (!deps || typeof deps.getActiveDriver !== 'function') return null;
    try {
      return deps.getActiveDriver();
    } catch (_) {
      return null;
    }
  }

  function getEnvDriver(deps) {
    return (deps && deps.ENV && typeof deps.ENV.driver === 'string')
      ? deps.ENV.driver
      : 'local';
  }

  function getPostAnalyticsCacheKey(postId, deps) {
    return 'post-analytics:' + getEnvDriver(deps) + ':' + String(postId || '').trim();
  }

  function buildPostAnalyticsSignature(result) {
    var source = (result && typeof result === 'object') ? result : {};
    return [
      Number(source.views) || 0,
      Number(source.votos) || 0,
      Number(source.comments) || 0,
      Number(source.shares) || 0,
      Number(source.saves) || 0,
      Number(source.coupon_clicks) || 0,
    ].join('|');
  }

  // ── Metodos exportados ─────────────────────────────────────────

  function getCachedPostAnalytics(postId, options, deps) {
    if (options === undefined) options = {};
    if (deps === undefined) deps = {};
    var id = String(postId || '').trim();
    if (!id) return null;
    if (typeof deps.getCachedSessionPayload !== 'function') return null;
    return deps.getCachedSessionPayload(
      'product',
      getPostAnalyticsCacheKey(id, deps),
      PRODUCT_ANALYTICS_CACHE_MAX_AGE_MS,
      PRODUCT_ANALYTICS_STALE_MAX_AGE_MS,
      options
    );
  }

  function invalidatePostAnalyticsCache(postId, deps) {
    if (deps === undefined) deps = {};
    var id = String(postId || '').trim();
    if (!id) return false;
    if (typeof deps.removeSessionCache !== 'function') return false;
    return deps.removeSessionCache('product', getPostAnalyticsCacheKey(id, deps));
  }

  async function trackView(postId, deps) {
    if (deps === undefined) deps = {};
    var driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.trackView !== 'function') return { ok: false };
    var result = await driver.trackView(postId);
    if (result && result.ok) invalidatePostAnalyticsCache(postId, deps);
    return result;
  }

  async function trackShare(postId, deps) {
    if (deps === undefined) deps = {};
    var driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.trackShare !== 'function') return { ok: false };
    var result = await driver.trackShare(postId);
    if (result && result.ok) invalidatePostAnalyticsCache(postId, deps);
    return result;
  }

  async function trackCouponClick(postId, deps) {
    if (deps === undefined) deps = {};
    var driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.trackCouponClick !== 'function') return { ok: false };
    var result = await driver.trackCouponClick(postId);
    if (result && result.ok) invalidatePostAnalyticsCache(postId, deps);
    return result;
  }

  async function refreshPostAnalytics(postId, options, deps) {
    if (options === undefined) options = {};
    if (deps === undefined) deps = {};
    var driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.getPostAnalytics !== 'function') return { ok: false };
    var id = String(postId || '').trim();
    if (!id) return { ok: false };

    if (options.force !== true) {
      var cached = getCachedPostAnalytics(id, {}, deps);
      if (cached) return cached.data;
    }

    var requestKey = getPostAnalyticsCacheKey(id, deps);

    var doFetch = async function () {
      var result = await driver.getPostAnalytics(id);
      if (result && result.ok) {
        if (typeof deps.persistSessionPayload === 'function') {
          deps.persistSessionPayload('product', requestKey, result, buildPostAnalyticsSignature(result));
        }
      } else if (options.keepStaleOnError !== true) {
        if (typeof deps.removeSessionCache === 'function') {
          deps.removeSessionCache('product', requestKey);
        }
      }
      return result;
    };

    if (typeof deps.withPendingSessionRequest === 'function') {
      return deps.withPendingSessionRequest(_pendingProductAnalyticsRequests, requestKey, doFetch);
    }
    return doFetch();
  }

  async function getPostAnalytics(postId, options, deps) {
    if (options === undefined) options = {};
    if (deps === undefined) deps = {};
    if (options.force !== true) {
      var cached = getCachedPostAnalytics(postId, options, deps);
      if (cached) return cached.data;
    }
    return refreshPostAnalytics(postId, options, deps);
  }

  // ── Registro do sub-modulo ─────────────────────────────────────
  window._KCAPI.postsRead = {
    trackCouponClick,
    trackShare,
    trackView,
    getCachedPostAnalytics,
    invalidatePostAnalyticsCache,
    refreshPostAnalytics,
    getPostAnalytics,
  };
})();

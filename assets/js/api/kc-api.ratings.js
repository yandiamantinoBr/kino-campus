/*
  KinoCampus - KCAPI Ratings Module (v11.33.1)

  Sub-modulo do dominio ratings para a fachada KCAPI.
  Registrado em window._KCAPI.ratings e carregado antes de kc-api.client.js.

  Contrato preservado: os 4 metodos abaixo mantem exatamente a mesma
  semantica das implementacoes previas em kc-api.client.js, incluindo
  fallbacks defensivos e delegacao direta ao driver ativo.

  deps esperado (injetado pela fachada):
  {
    getActiveDriver,              // () => driver ativo
    normalizeUserRatingSummary,   // (raw, fallbackUserId) => shape
    normalizeUserRatingEntry,     // (raw) => shape
    normalizeUserRatingState,     // (raw, tId, cId) => shape
    normalizeUserRatingList,      // (raw, page, limit) => shape
  }
*/
(function () {
  'use strict';

  window._KCAPI = window._KCAPI || {};

  // ── Helper interno ─────────────────────────────────────────────

  function getActiveDriverOrNull(deps) {
    if (!deps || typeof deps.getActiveDriver !== 'function') return null;
    try {
      return deps.getActiveDriver();
    } catch (_) {
      return null;
    }
  }

  // ── Métodos públicos ───────────────────────────────────────────

  async function getUserRatingSummary(userId, deps) {
    const driver = getActiveDriverOrNull(deps);
    const normalize = (deps && typeof deps.normalizeUserRatingSummary === 'function')
      ? deps.normalizeUserRatingSummary
      : function (_, id) { return { userId: id || null, average: null, count: 0 }; };
    if (!driver || typeof driver.getUserRatingSummary !== 'function') {
      return normalize(null, userId);
    }
    const summary = await driver.getUserRatingSummary(userId);
    return normalize(summary, userId);
  }

  async function getUserRatingState(params, deps) {
    const input = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
    const fallbackTargetUserId = input.targetUserId || input.target_user_id || null;
    const fallbackContextPostId = input.contextPostId || input.context_post_id || null;
    const driver = getActiveDriverOrNull(deps);
    const normalize = (deps && typeof deps.normalizeUserRatingState === 'function')
      ? deps.normalizeUserRatingState
      : function (_, tId, cId) {
          return { targetUserId: tId || null, contextPostId: cId || null, canRate: false, reason: 'UNKNOWN', myRating: null };
        };
    if (!driver || typeof driver.getUserRatingState !== 'function') {
      return normalize(null, fallbackTargetUserId, fallbackContextPostId);
    }
    const state = await driver.getUserRatingState(input);
    return normalize(state, fallbackTargetUserId, fallbackContextPostId);
  }

  async function listUserRatings(userId, options, deps) {
    const input = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const fallbackPage = input.page || 1;
    const fallbackLimit = input.limit || 10;
    const driver = getActiveDriverOrNull(deps);
    const normalize = (deps && typeof deps.normalizeUserRatingList === 'function')
      ? deps.normalizeUserRatingList
      : function (_, p, l) { return { items: [], page: p, limit: l, total: 0, hasMore: false }; };
    if (!driver || typeof driver.listUserRatings !== 'function') {
      return normalize(null, fallbackPage, fallbackLimit);
    }
    const payload = await driver.listUserRatings(userId, input);
    return normalize(payload, fallbackPage, fallbackLimit);
  }

  async function upsertUserRating(payload, deps) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.upsertUserRating !== 'function') {
      return { ok: false, error: { message: 'Avaliações indisponíveis neste driver.' } };
    }
    const result = await driver.upsertUserRating(payload);
    const normalizeSummary = (deps && typeof deps.normalizeUserRatingSummary === 'function')
      ? deps.normalizeUserRatingSummary
      : function (_, id) { return { userId: id || null, average: null, count: 0 }; };
    const normalizeEntry = (deps && typeof deps.normalizeUserRatingEntry === 'function')
      ? deps.normalizeUserRatingEntry
      : function () { return null; };
    const summary = normalizeSummary(
      result && result.summary,
      payload && (payload.targetUserId || payload.target_user_id)
    );
    return {
      ok: !!(result && result.ok),
      rating: (result && result.rating) ? normalizeEntry(result.rating) : null,
      summary,
      error: (result && result.error) ? result.error : null,
      reason: (result && result.reason) ? String(result.reason) : '',
    };
  }

  window._KCAPI.ratings = {
    getUserRatingSummary,
    getUserRatingState,
    listUserRatings,
    upsertUserRating,
  };
})();

/*
  KinoCampus - KCAPI Ratings Module (v11.33.1)

  Sub-modulo do dominio ratings para a fachada KCAPI.
  Registrado em window._KCAPI.ratings e carregado antes de kc-api.client.js.

  Contrato preservado: os metodos abaixo mantem exatamente a mesma
  semantica das implementacoes previas em kc-api.client.js, incluindo
  normalizacao de payloads, fallbacks defensivos e delegacao direta ao driver
  ativo.

  deps esperado (injetado pela fachada):
  {
    getActiveDriver,              // () => driver ativo
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

  function normalizeUserRatingSummary(raw, fallbackUserId) {
    const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    const averageRaw = source.average != null ? source.average : source.rating_avg;
    const average = (averageRaw != null && averageRaw !== '') ? Number(averageRaw) : null;
    const countRaw = source.count != null ? source.count : source.rating_count;
    const count = Math.max(0, parseInt(String(countRaw != null ? countRaw : 0), 10) || 0);
    return {
      userId: String(source.userId || source.user_id || fallbackUserId || '').trim() || null,
      average: Number.isFinite(average) ? average : null,
      count,
    };
  }

  function normalizeUserRatingEntry(raw) {
    const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    const reviewer = (source.reviewer && typeof source.reviewer === 'object' && !Array.isArray(source.reviewer))
      ? source.reviewer
      : {};
    const rating = parseInt(String(source.rating != null ? source.rating : 0), 10);
    return {
      id: String(source.id || '').trim() || null,
      targetUserId: String(source.targetUserId || source.target_user_id || '').trim() || null,
      raterUserId: String(source.raterUserId || source.rater_user_id || '').trim() || null,
      contextPostId: String(source.contextPostId || source.context_post_id || '').trim() || null,
      rating: Number.isFinite(rating) ? Math.max(1, Math.min(5, rating)) : 0,
      comment: String(source.comment || '').trim(),
      createdAt: source.createdAt || source.created_at || null,
      updatedAt: source.updatedAt || source.updated_at || null,
      reviewer: {
        id: String(reviewer.id || '').trim() || null,
        displayName: String(reviewer.displayName || reviewer.display_name || '').trim() || 'Membro da comunidade',
        avatarUrl: String(reviewer.avatarUrl || reviewer.avatar_url || '').trim() || null,
        public: reviewer.public === true,
      },
    };
  }

  function normalizeUserRatingState(raw, fallbackTargetUserId, fallbackContextPostId) {
    const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    return {
      targetUserId: String(source.targetUserId || source.target_user_id || fallbackTargetUserId || '').trim() || null,
      contextPostId: String(source.contextPostId || source.context_post_id || fallbackContextPostId || '').trim() || null,
      canRate: source.canRate === true || source.can_rate === true,
      reason: String(source.reason || 'UNKNOWN').trim() || 'UNKNOWN',
      myRating: (source.myRating || source.my_rating) ? normalizeUserRatingEntry(source.myRating || source.my_rating) : null,
    };
  }

  function normalizeUserRatingList(raw, fallbackPage, fallbackLimit) {
    const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    const items = Array.isArray(source.items) ? source.items.map(normalizeUserRatingEntry).filter(Boolean) : [];
    const page = Math.max(1, parseInt(String(source.page != null ? source.page : fallbackPage), 10) || 1);
    const limit = Math.max(1, parseInt(String(source.limit != null ? source.limit : fallbackLimit), 10) || 10);
    const total = Math.max(0, parseInt(String(source.total != null ? source.total : items.length), 10) || 0);
    return {
      items,
      page,
      limit,
      total,
      hasMore: source.hasMore === true || source.has_more === true,
    };
  }

  // ── Métodos públicos ───────────────────────────────────────────

  async function getUserRatingSummary(userId, deps) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.getUserRatingSummary !== 'function') {
      return normalizeUserRatingSummary(null, userId);
    }
    const summary = await driver.getUserRatingSummary(userId);
    return normalizeUserRatingSummary(summary, userId);
  }

  async function getUserRatingState(params, deps) {
    const input = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
    const fallbackTargetUserId = input.targetUserId || input.target_user_id || null;
    const fallbackContextPostId = input.contextPostId || input.context_post_id || null;
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.getUserRatingState !== 'function') {
      return normalizeUserRatingState(null, fallbackTargetUserId, fallbackContextPostId);
    }
    const state = await driver.getUserRatingState(input);
    return normalizeUserRatingState(state, fallbackTargetUserId, fallbackContextPostId);
  }

  async function listUserRatings(userId, options, deps) {
    const input = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const fallbackPage = input.page || 1;
    const fallbackLimit = input.limit || 10;
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.listUserRatings !== 'function') {
      return normalizeUserRatingList(null, fallbackPage, fallbackLimit);
    }
    const payload = await driver.listUserRatings(userId, input);
    return normalizeUserRatingList(payload, fallbackPage, fallbackLimit);
  }

  async function upsertUserRating(payload, deps) {
    const driver = getActiveDriverOrNull(deps);
    if (!driver || typeof driver.upsertUserRating !== 'function') {
      return { ok: false, error: { message: 'Avaliações indisponíveis neste driver.' } };
    }
    const result = await driver.upsertUserRating(payload);
    const summary = normalizeUserRatingSummary(
      result && result.summary,
      payload && (payload.targetUserId || payload.target_user_id)
    );
    return {
      ok: !!(result && result.ok),
      rating: (result && result.rating) ? normalizeUserRatingEntry(result.rating) : null,
      summary,
      error: (result && result.error) ? result.error : null,
      reason: (result && result.reason) ? String(result.reason) : '',
    };
  }

  window._KCAPI.ratings = {
    normalizeUserRatingSummary,
    normalizeUserRatingEntry,
    normalizeUserRatingState,
    normalizeUserRatingList,
    getUserRatingSummary,
    getUserRatingState,
    listUserRatings,
    upsertUserRating,
  };
})();

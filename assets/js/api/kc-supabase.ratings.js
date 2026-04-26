/**
 * KinoCampus — kc-supabase.ratings.js v13.5.1
 *
 * Sub-módulo de avaliações + pesquisa de posts via Supabase.
 * Extraído de kc-supabase.client.js (v13.5.1 split).
 *
 * Contém: normalizeUserRating*, getUserRatingSummary, getUserRatingState,
 *         listUserRatings, upsertUserRating, searchPosts, getFeedCursor
 *
 * Expõe: window.KCSupabase._ratings (Object.freeze)
 * Carregado: após kc-supabase.posts.js (defer)
 */

(function () {
  'use strict';

  window.KCSupabase = window.KCSupabase || {};

  // ── Acesso ao client Supabase via facade pública ──────────────────────────────
  function _client() {
    return (window.KCSupabase && typeof window.KCSupabase.getClient === 'function')
      ? window.KCSupabase.getClient()
      : null;
  }
  function _readEnv() {
    if (window._KCSupabaseInternal && typeof window._KCSupabaseInternal.readEnv === 'function') {
      return window._KCSupabaseInternal.readEnv();
    }
    var env = (window.KC_ENV && typeof window.KC_ENV === 'object') ? window.KC_ENV : {};
    return {
      driver: String(env.DATA_DRIVER || env.driver || 'local').toLowerCase(),
      debug: !!env.debug,
    };
  }


  function normalizeUserRatingSummaryPayload(payload, fallbackUserId) {
    const source = (payload && typeof payload === 'object' && !Array.isArray(payload)) ? payload : {};
    const averageRaw = source.average != null ? source.average : source.rating_avg;
    const average = (averageRaw != null && averageRaw !== '')
      ? Number(averageRaw)
      : null;
    const countRaw = source.count != null ? source.count : source.rating_count;
    const count = Math.max(0, parseInt(String(countRaw != null ? countRaw : 0), 10) || 0);
    return {
      userId: String(source.userId || source.user_id || fallbackUserId || '').trim() || null,
      average: Number.isFinite(average) ? average : null,
      count,
    };
  }

  function normalizeUserRatingEntryPayload(payload) {
    const source = (payload && typeof payload === 'object' && !Array.isArray(payload)) ? payload : {};
    const reviewer = (source.reviewer && typeof source.reviewer === 'object' && !Array.isArray(source.reviewer))
      ? source.reviewer
      : {};
    const rating = parseInt(String(source.rating != null ? source.rating : 0), 10);
    return {
      id: String(source.id || '').trim() || null,
      targetUserId: String(source.targetUserId || source.target_user_id || '').trim() || null,
      raterUserId: String(source.raterUserId || source.rater_user_id || '').trim() || null,
      contextPostId: String(source.contextPostId || source.context_post_id || '').trim() || null,
      rating: Number.isFinite(rating) ? rating : 0,
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

  function normalizeUserRatingStatePayload(payload, targetUserId, contextPostId) {
    const source = (payload && typeof payload === 'object' && !Array.isArray(payload)) ? payload : {};
    return {
      targetUserId: String(source.targetUserId || source.target_user_id || targetUserId || '').trim() || null,
      contextPostId: String(source.contextPostId || source.context_post_id || contextPostId || '').trim() || null,
      canRate: source.canRate === true || source.can_rate === true,
      reason: String(source.reason || 'UNKNOWN').trim() || 'UNKNOWN',
      myRating: (source.myRating || source.my_rating) ? normalizeUserRatingEntryPayload(source.myRating || source.my_rating) : null,
    };
  }

  function normalizeUserRatingListPayload(payload, fallbackPage, fallbackLimit) {
    const source = (payload && typeof payload === 'object' && !Array.isArray(payload)) ? payload : {};
    const items = Array.isArray(source.items) ? source.items.map(normalizeUserRatingEntryPayload).filter(Boolean) : [];
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

  function normalizeUserRatingListParams(userId, options) {
    const input = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const page = Math.max(1, parseInt(String(input.page != null ? input.page : 1), 10) || 1);
    const limit = Math.max(1, parseInt(String(input.limit != null ? input.limit : 10), 10) || 10);
    return {
      userId: String(userId || '').trim(),
      page,
      limit,
    };
  }

  function normalizeUserRatingStateParams(params) {
    const input = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
    return {
      targetUserId: String(input.targetUserId || input.target_user_id || '').trim(),
      contextPostId: String(input.contextPostId || input.context_post_id || '').trim() || null,
    };
  }

  function normalizeUpsertUserRatingPayload(payload) {
    const input = (payload && typeof payload === 'object' && !Array.isArray(payload)) ? payload : {};
    const rating = parseInt(String(input.rating != null ? input.rating : 0), 10);
    const comment = String(input.comment || '').trim();
    return {
      targetUserId: String(input.targetUserId || input.target_user_id || '').trim(),
      contextPostId: String(input.contextPostId || input.context_post_id || '').trim() || null,
      rating: Number.isFinite(rating) ? rating : 0,
      comment: comment || null,
    };
  }

  async function getUserRatingSummary(userId) {
    const { driver } = _readEnv();
    if (driver !== 'supabase') return normalizeUserRatingSummaryPayload(null, userId);

    const client = _client();
    if (!client) return normalizeUserRatingSummaryPayload(null, userId);

    const key = String(userId || '').trim();
    if (!key) return normalizeUserRatingSummaryPayload(null, null);

    const rpc = await client.rpc('kc_get_user_rating_summary', {
      p_target_user_id: key,
    });

    if (rpc && rpc.error) {
      try { console.error('[KCSupabase] getUserRatingSummary erro:', rpc.error); } catch (_) { }
      return normalizeUserRatingSummaryPayload(null, key);
    }

    return normalizeUserRatingSummaryPayload(rpc && rpc.data, key);
  }

  async function getUserRatingState(params = {}) {
    const { driver } = _readEnv();
    const input = normalizeUserRatingStateParams(params);
    if (driver !== 'supabase') return normalizeUserRatingStatePayload(null, input.targetUserId, input.contextPostId);

    const client = _client();
    if (!client || !input.targetUserId) {
      return normalizeUserRatingStatePayload(null, input.targetUserId, input.contextPostId);
    }

    const rpc = await client.rpc('kc_get_user_rating_state', {
      p_target_user_id: input.targetUserId,
      p_context_post_id: input.contextPostId,
    });

    if (rpc && rpc.error) {
      try { console.error('[KCSupabase] getUserRatingState erro:', rpc.error); } catch (_) { }
      return normalizeUserRatingStatePayload(null, input.targetUserId, input.contextPostId);
    }

    return normalizeUserRatingStatePayload(rpc && rpc.data, input.targetUserId, input.contextPostId);
  }

  async function listUserRatings(userId, options = {}) {
    const { driver } = _readEnv();
    const input = normalizeUserRatingListParams(userId, options);
    if (driver !== 'supabase') return normalizeUserRatingListPayload(null, input.page, input.limit);

    const client = _client();
    if (!client || !input.userId) return normalizeUserRatingListPayload(null, input.page, input.limit);

    const rpc = await client.rpc('kc_list_user_ratings', {
      p_target_user_id: input.userId,
      p_page: input.page,
      p_limit: input.limit,
    });

    if (rpc && rpc.error) {
      try { console.error('[KCSupabase] listUserRatings erro:', rpc.error); } catch (_) { }
      return normalizeUserRatingListPayload(null, input.page, input.limit);
    }

    return normalizeUserRatingListPayload(rpc && rpc.data, input.page, input.limit);
  }

  async function upsertUserRating(payload = {}) {
    const { driver } = _readEnv();
    const input = normalizeUpsertUserRatingPayload(payload);
    if (driver !== 'supabase') {
      return { ok: false, error: { message: 'Avaliações indisponíveis neste driver.' } };
    }

    const client = _client();
    if (!client) return { ok: false, error: { message: 'Supabase indisponível.' } };
    if (!input.targetUserId) return { ok: false, error: { message: 'Usuário alvo inválido.' } };

    const rpc = await client.rpc('kc_upsert_user_rating', {
      p_target_user_id: input.targetUserId,
      p_context_post_id: input.contextPostId,
      p_rating: input.rating,
      p_comment: input.comment,
    });

    if (rpc && rpc.error) {
      try { console.error('[KCSupabase] upsertUserRating erro:', rpc.error); } catch (_) { }
      return { ok: false, error: rpc.error };
    }

    const data = (rpc && rpc.data && typeof rpc.data === 'object' && !Array.isArray(rpc.data)) ? rpc.data : {};
    return {
      ok: data.ok === true,
      rating: data.rating ? normalizeUserRatingEntryPayload(data.rating) : null,
      summary: normalizeUserRatingSummaryPayload(data.summary, input.targetUserId),
      error: null,
    };
  }


  // ── Namespace público ──────────────────────────────────────────────────────────
  window.KCSupabase._ratings = Object.freeze({
    normalizeUserRatingSummaryPayload: normalizeUserRatingSummaryPayload,
    normalizeUserRatingEntryPayload:   normalizeUserRatingEntryPayload,
    normalizeUserRatingStatePayload:   normalizeUserRatingStatePayload,
    normalizeUserRatingListPayload:    normalizeUserRatingListPayload,
    normalizeUserRatingStateParams:    normalizeUserRatingStateParams,
    normalizeUpsertUserRatingPayload:  normalizeUpsertUserRatingPayload,
    getUserRatingSummary: getUserRatingSummary,
    getUserRatingState:   getUserRatingState,
    listUserRatings:      listUserRatings,
    upsertUserRating:     upsertUserRating,
  });
})();

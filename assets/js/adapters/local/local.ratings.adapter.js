/* KinoCampus - Local Ratings Adapter */
(function () {
  'use strict';

  const LOCAL_RATINGS_KEY = 'kc_user_ratings';
  const LOCAL_RATING_INTERACTIONS_KEY = 'kc_user_rating_interactions';
  const DEFAULT_VIEWER_ID = 'USER_SELF';

  window._KCLA = window._KCLA || {};

  function getViewerId(deps) {
    return String((deps && deps.viewerId) || DEFAULT_VIEWER_ID).trim() || DEFAULT_VIEWER_ID;
  }

  function getNormalizePost(deps) {
    return (deps && typeof deps.normalizePost === 'function')
      ? deps.normalizePost
      : function (post) { return post; };
  }

  function getSearchCollectionLoader(deps) {
    return (deps && typeof deps.getSearchCollection === 'function')
      ? deps.getSearchCollection
      : async function () { return []; };
  }

  function getMockUsersById(deps) {
    return (deps && deps.mockUsersById && typeof deps.mockUsersById === 'object')
      ? deps.mockUsersById
      : {};
  }

  function normalizeRatingEntry(raw, deps) {
    const viewerId = getViewerId(deps);
    const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    const reviewer = (source.reviewer && typeof source.reviewer === 'object' && !Array.isArray(source.reviewer))
      ? source.reviewer
      : {};
    const rating = parseInt(String(source.rating != null ? source.rating : 0), 10);
    const entry = {
      id: String(source.id || '').trim() || null,
      targetUserId: String(source.targetUserId || source.target_user_id || '').trim() || null,
      raterUserId: String(source.raterUserId || source.rater_user_id || viewerId).trim() || viewerId,
      contextPostId: String(source.contextPostId || source.context_post_id || '').trim() || null,
      rating: Number.isFinite(rating) ? Math.max(1, Math.min(5, rating)) : 0,
      comment: String(source.comment || '').trim(),
      createdAt: source.createdAt || source.created_at || null,
      updatedAt: source.updatedAt || source.updated_at || null,
      reviewer: {
        id: String(reviewer.id || source.raterUserId || source.rater_user_id || viewerId).trim() || viewerId,
        displayName: String(reviewer.displayName || reviewer.display_name || source.reviewerName || 'VocÃª').trim() || 'VocÃª',
        avatarUrl: String(reviewer.avatarUrl || reviewer.avatar_url || source.reviewerAvatar || '').trim() || null,
        public: reviewer.public !== false,
      },
    };

    if (!entry.createdAt) entry.createdAt = new Date().toISOString();
    if (!entry.updatedAt) entry.updatedAt = entry.createdAt;
    if (!entry.id && entry.targetUserId) entry.id = 'local-rating-' + entry.raterUserId + '-' + entry.targetUserId;
    return entry;
  }

  function loadRatings(deps) {
    try {
      const raw = localStorage.getItem(LOCAL_RATINGS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list)
        ? list.map((item) => normalizeRatingEntry(item, deps)).filter((item) => item.targetUserId && item.raterUserId)
        : [];
    } catch (_) {
      return [];
    }
  }

  function saveRatings(list, deps) {
    try {
      const items = Array.isArray(list) ? list.map((item) => normalizeRatingEntry(item, deps)) : [];
      localStorage.setItem(LOCAL_RATINGS_KEY, JSON.stringify(items));
    } catch (_) { }
  }

  function loadRatingInteractions() {
    try {
      const raw = localStorage.getItem(LOCAL_RATING_INTERACTIONS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function buildRatingSummary(userId, ratings, deps) {
    const key = String(userId || '').trim();
    const items = Array.isArray(ratings) ? ratings : loadRatings(deps);
    const matches = items.filter((item) => item && item.targetUserId === key);
    if (!matches.length) {
      return { userId: key || null, average: null, count: 0 };
    }

    const total = matches.reduce((sum, item) => sum + (Number(item && item.rating) || 0), 0);
    const average = matches.length ? total / matches.length : null;
    return {
      userId: key || null,
      average: Number.isFinite(average) ? Number(average.toFixed(2)) : null,
      count: matches.length,
    };
  }

  function enrichPostWithRatings(post, ratings, deps) {
    const normalizePost = getNormalizePost(deps);
    const normalized = normalizePost(post);
    const authorId = String((normalized && (normalized.authorId || normalized.autorId || normalized.author_id)) || '').trim();
    if (!authorId) return normalized;

    const summary = buildRatingSummary(authorId, ratings, deps);
    const authorProfile = (normalized && normalized.authorProfile && typeof normalized.authorProfile === 'object')
      ? { ...normalized.authorProfile }
      : null;

    if (authorProfile) {
      authorProfile.rating_avg = summary.average;
      authorProfile.rating_count = summary.count;
      authorProfile.ratingAvg = summary.average;
      authorProfile.ratingCount = summary.count;
    }

    return normalizePost({
      ...normalized,
      rating: summary.count > 0 ? summary.average : null,
      ratingCount: summary.count,
      rating_count: summary.count,
      authorProfile,
    });
  }

  function enrichPostsWithRatings(posts, deps) {
    const items = Array.isArray(posts) ? posts : [];
    if (!items.length) return [];
    const ratings = loadRatings(deps);
    return items.map((item) => enrichPostWithRatings(item, ratings, deps));
  }

  async function getRatingsTargetPosts(targetUserId, deps) {
    const key = String(targetUserId || '').trim();
    if (!key) return [];
    const loadSearchCollection = getSearchCollectionLoader(deps);
    const collection = await loadSearchCollection();
    return (Array.isArray(collection) ? collection : []).filter((post) => {
      const authorId = String((post && (post.authorId || post.autorId || post.author_id)) || '').trim();
      return authorId === key;
    });
  }

  function hasCommentInteractionForPost(post) {
    const keys = new Set([
      String(post && post.id || '').trim(),
      String(post && post.uuid || '').trim(),
      String(post && (post.legacyId || post.legacy_id) || '').trim(),
    ].filter(Boolean));

    if (!keys.size) return false;

    for (const key of keys) {
      try {
        const raw = localStorage.getItem('kc_comments_' + key);
        const items = raw ? JSON.parse(raw) : [];
        if (Array.isArray(items) && items.length) return true;
      } catch (_) { }
    }

    return false;
  }

  async function resolveRatingEligibility(targetUserId, contextPostId, deps) {
    const viewerId = getViewerId(deps);
    const usersById = getMockUsersById(deps);
    const targetId = String(targetUserId || '').trim();
    const contextId = String(contextPostId || '').trim() || null;
    if (!targetId) return { canRate: false, reason: 'TARGET_NOT_FOUND' };
    if (targetId === viewerId) return { canRate: false, reason: 'SELF' };

    const targetPosts = await getRatingsTargetPosts(targetId, deps);
    if (!targetPosts.length && !usersById[targetId]) {
      return { canRate: false, reason: 'TARGET_NOT_FOUND' };
    }

    const scopedPosts = contextId
      ? targetPosts.filter((post) => {
          const keys = new Set([
            String(post && post.id || '').trim(),
            String(post && post.uuid || '').trim(),
            String(post && (post.legacyId || post.legacy_id) || '').trim(),
          ].filter(Boolean));
          return keys.has(contextId);
        })
      : targetPosts;

    if (contextId && !scopedPosts.length) {
      return { canRate: false, reason: 'INVALID_CONTEXT' };
    }

    if (scopedPosts.some(hasCommentInteractionForPost)) {
      return { canRate: true, reason: 'OK' };
    }

    const hinted = loadRatingInteractions().some((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const targetMatch = String(entry.targetUserId || entry.target_user_id || '').trim() === targetId;
      if (!targetMatch) return false;
      if (!contextId) return true;
      return String(entry.contextPostId || entry.context_post_id || '').trim() === contextId;
    });

    return hinted
      ? { canRate: true, reason: 'OK' }
      : { canRate: false, reason: 'NO_INTERACTION' };
  }

  async function getUserRatingSummary(userId, deps) {
    return buildRatingSummary(userId, loadRatings(deps), deps);
  }

  async function getUserRatingState(params = {}, deps) {
    const viewerId = getViewerId(deps);
    const targetUserId = String((params && (params.targetUserId || params.target_user_id)) || '').trim();
    const contextPostId = String((params && (params.contextPostId || params.context_post_id)) || '').trim() || null;
    const ratings = loadRatings(deps);
    const myRating = ratings.find((item) => item && item.targetUserId === targetUserId && item.raterUserId === viewerId) || null;

    if (myRating) {
      return {
        targetUserId: targetUserId || null,
        contextPostId,
        canRate: true,
        reason: 'OK',
        myRating,
      };
    }

    const eligibility = await resolveRatingEligibility(targetUserId, contextPostId, deps);
    return {
      targetUserId: targetUserId || null,
      contextPostId,
      canRate: eligibility.canRate === true,
      reason: eligibility.reason || 'UNKNOWN',
      myRating: null,
    };
  }

  async function listUserRatings(userId, options = {}, deps) {
    const page = Math.max(1, parseInt(String(options && options.page != null ? options.page : 1), 10) || 1);
    const limit = Math.max(1, parseInt(String(options && options.limit != null ? options.limit : 10), 10) || 10);
    const offset = (page - 1) * limit;
    const items = loadRatings(deps)
      .filter((item) => item && item.targetUserId === String(userId || '').trim())
      .sort((left, right) => {
        const leftTime = new Date(left && left.createdAt || 0).getTime();
        const rightTime = new Date(right && right.createdAt || 0).getTime();
        return rightTime - leftTime;
      });

    return {
      items: items.slice(offset, offset + limit),
      page,
      limit,
      total: items.length,
      hasMore: (offset + limit) < items.length,
    };
  }

  async function upsertUserRating(payload = {}, deps) {
    const viewerId = getViewerId(deps);
    const usersById = getMockUsersById(deps);
    const targetUserId = String((payload && (payload.targetUserId || payload.target_user_id)) || '').trim();
    const contextPostId = String((payload && (payload.contextPostId || payload.context_post_id)) || '').trim() || null;
    const rating = parseInt(String(payload && payload.rating != null ? payload.rating : 0), 10);
    const comment = String(payload && payload.comment || '').trim();

    if (!targetUserId) {
      return { ok: false, error: { message: 'UsuÃ¡rio alvo invÃ¡lido.' } };
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return { ok: false, error: { message: 'A nota deve estar entre 1 e 5 estrelas.' } };
    }
    if (comment.length > 280) {
      return { ok: false, error: { message: 'O comentÃ¡rio aceita no mÃ¡ximo 280 caracteres.' } };
    }

    const state = await getUserRatingState({ targetUserId, contextPostId }, deps);
    if (!state.canRate) {
      const message = state.reason === 'SELF'
        ? 'VocÃª nÃ£o pode avaliar o prÃ³prio perfil.'
        : (state.reason === 'NO_INTERACTION'
          ? 'Interaja com um post deste usuÃ¡rio antes de avaliÃ¡-lo.'
          : 'NÃ£o foi possÃ­vel registrar esta avaliaÃ§Ã£o.');
      return { ok: false, error: { message }, reason: state.reason };
    }

    const items = loadRatings(deps);
    const index = items.findIndex((item) => item && item.targetUserId === targetUserId && item.raterUserId === viewerId);
    const viewer = usersById[viewerId] || {};
    const next = normalizeRatingEntry({
      id: index >= 0 ? items[index].id : null,
      targetUserId,
      raterUserId: viewerId,
      contextPostId,
      rating,
      comment,
      createdAt: index >= 0 ? items[index].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reviewer: {
        id: viewerId,
        displayName: String(viewer.displayName || viewer.name || 'VocÃª').trim() || 'VocÃª',
        avatarUrl: String(viewer.avatarUrl || viewer.avatar || '').trim() || null,
        public: true,
      },
    }, deps);

    if (index >= 0) items[index] = next;
    else items.push(next);
    saveRatings(items, deps);

    return {
      ok: true,
      rating: next,
      summary: buildRatingSummary(targetUserId, items, deps),
      error: null,
    };
  }

  window._KCLA.ratings = Object.freeze({
    enrichPostWithRatings,
    enrichPostsWithRatings,
    getUserRatingSummary,
    getUserRatingState,
    listUserRatings,
    upsertUserRating,
  });
})();

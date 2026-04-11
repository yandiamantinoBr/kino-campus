/* KinoCampus - Local Adapter */
(function () {
  'use strict';


const { config: cfg, fetchJSON, filterPosts: filterLocalPosts, normalizePost, MOCK_USERS_LIST, MOCK_USERS_BY_ID, apiURL, VERSION, ENV, DEFAULTS } = window.KCAPI;
  
  // Helper functions that might be missing
  function toSlug(str) { return String(str||'').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''); }


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
      users: MOCK_USERS_LIST,
      posts,
    };
  }

  function getSearchShared() {
    const shared = (typeof window !== 'undefined' && window.KCSearchShared) ? window.KCSearchShared : null;
    if (shared && typeof shared.searchCollection === 'function') return shared;
    return null;
  }

  const LOCAL_RATINGS_KEY = 'kc_user_ratings';
  const LOCAL_RATING_INTERACTIONS_KEY = 'kc_user_rating_interactions';
  const LOCAL_RATING_VIEWER_ID = 'USER_SELF';
  const LOCAL_PROFILE_STORAGE_KEY = 'kc_local_profile';
  const LOCAL_SAVED_POSTS_STORAGE_KEY = 'kc_saved_posts';
  const LOCAL_NOTIFICATION_PREFERENCES_STORAGE_KEY = 'kc_notification_preferences';

  function buildDefaultLocalNotificationPreferences() {
    if (window.KCAccountProfileUtils && typeof window.KCAccountProfileUtils.buildDefaultNotificationPreferences === 'function') {
      return window.KCAccountProfileUtils.buildDefaultNotificationPreferences();
    }
    return {
      comment_on_post: { in_app: true, email: false, whatsapp: false },
      comment_reply: { in_app: true, email: false, whatsapp: false },
      vote_on_post: { in_app: true, email: false, whatsapp: false },
      post_expired: { in_app: true, email: false, whatsapp: false },
      post_reported: { in_app: true, email: false, whatsapp: false },
      system: { in_app: true, email: false, whatsapp: false },
    };
  }

  function normalizeLocalNotificationPreferences(value) {
    if (window.KCAccountProfileUtils && typeof window.KCAccountProfileUtils.normalizeNotificationPreferences === 'function') {
      return window.KCAccountProfileUtils.normalizeNotificationPreferences(value);
    }
    const defaults = buildDefaultLocalNotificationPreferences();
    const source = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
    const normalized = {};
    Object.keys(defaults).forEach((eventKey) => {
      const sourceEvent = (source[eventKey] && typeof source[eventKey] === 'object' && !Array.isArray(source[eventKey]))
        ? source[eventKey]
        : {};
      normalized[eventKey] = {
        in_app: sourceEvent.in_app !== false,
        email: sourceEvent.email === true,
        whatsapp: sourceEvent.whatsapp === true,
      };
    });
    return normalized;
  }

  function readLocalNotificationPreferences() {
    const defaults = buildDefaultLocalNotificationPreferences();
    try {
      const raw = localStorage.getItem(LOCAL_NOTIFICATION_PREFERENCES_STORAGE_KEY);
      if (!raw) return defaults;
      return normalizeLocalNotificationPreferences(JSON.parse(raw));
    } catch (_) {
      return defaults;
    }
  }

  function writeLocalNotificationPreferences(preferences) {
    const normalized = normalizeLocalNotificationPreferences(preferences);
    try {
      localStorage.setItem(LOCAL_NOTIFICATION_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    } catch (_) {
      return null;
    }
  }

  function normalizeLocalRatingEntry(raw) {
    const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    const reviewer = (source.reviewer && typeof source.reviewer === 'object' && !Array.isArray(source.reviewer))
      ? source.reviewer
      : {};
    const rating = parseInt(String(source.rating != null ? source.rating : 0), 10);
    const entry = {
      id: String(source.id || '').trim() || null,
      targetUserId: String(source.targetUserId || source.target_user_id || '').trim() || null,
      raterUserId: String(source.raterUserId || source.rater_user_id || LOCAL_RATING_VIEWER_ID).trim() || LOCAL_RATING_VIEWER_ID,
      contextPostId: String(source.contextPostId || source.context_post_id || '').trim() || null,
      rating: Number.isFinite(rating) ? Math.max(1, Math.min(5, rating)) : 0,
      comment: String(source.comment || '').trim(),
      createdAt: source.createdAt || source.created_at || null,
      updatedAt: source.updatedAt || source.updated_at || null,
      reviewer: {
        id: String(reviewer.id || source.raterUserId || source.rater_user_id || LOCAL_RATING_VIEWER_ID).trim() || LOCAL_RATING_VIEWER_ID,
        displayName: String(reviewer.displayName || reviewer.display_name || source.reviewerName || 'Você').trim() || 'Você',
        avatarUrl: String(reviewer.avatarUrl || reviewer.avatar_url || source.reviewerAvatar || '').trim() || null,
        public: reviewer.public !== false,
      },
    };

    if (!entry.createdAt) entry.createdAt = new Date().toISOString();
    if (!entry.updatedAt) entry.updatedAt = entry.createdAt;
    if (!entry.id && entry.targetUserId) entry.id = 'local-rating-' + entry.raterUserId + '-' + entry.targetUserId;
    return entry;
  }

  function loadLocalRatings() {
    try {
      const raw = localStorage.getItem(LOCAL_RATINGS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.map(normalizeLocalRatingEntry).filter((item) => item.targetUserId && item.raterUserId) : [];
    } catch (_) {
      return [];
    }
  }

  function saveLocalRatings(list) {
    try {
      const items = Array.isArray(list) ? list.map(normalizeLocalRatingEntry) : [];
      localStorage.setItem(LOCAL_RATINGS_KEY, JSON.stringify(items));
    } catch (_) { }
  }

  function loadLocalRatingInteractions() {
    try {
      const raw = localStorage.getItem(LOCAL_RATING_INTERACTIONS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function buildLocalRatingSummary(userId, ratings) {
    const key = String(userId || '').trim();
    const items = Array.isArray(ratings) ? ratings : loadLocalRatings();
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

  function enrichLocalPostWithRatings(post, ratings) {
    const normalized = normalizePost(post);
    const authorId = String((normalized && (normalized.authorId || normalized.autorId || normalized.author_id)) || '').trim();
    if (!authorId) return normalized;

    const summary = buildLocalRatingSummary(authorId, ratings);
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

  function enrichLocalPostsWithRatings(posts) {
    const items = Array.isArray(posts) ? posts : [];
    if (!items.length) return [];
    const ratings = loadLocalRatings();
    return items.map((item) => enrichLocalPostWithRatings(item, ratings));
  }

  function readLocalUserPostDrafts() {
    try {
      const raw = localStorage.getItem('kc_user_posts');
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function readLocalUserPosts() {
    return readLocalUserPostDrafts().map(normalizePost);
  }

  function writeLocalUserPosts(list) {
    try {
      localStorage.setItem('kc_user_posts', JSON.stringify(Array.isArray(list) ? list : []));
      return true;
    } catch (_) {
      return false;
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

  function matchesLocalPostIdentity(post, postId) {
    const key = String(postId || '').trim();
    if (!key) return false;
    return buildLocalPostKeys(post).includes(key);
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
      title: String((normalized && normalized.title) || source.title || source.titulo || 'Sem título').trim() || 'Sem título',
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

  function buildDefaultLocalProfile() {
    const viewer = (MOCK_USERS_BY_ID && MOCK_USERS_BY_ID[LOCAL_RATING_VIEWER_ID]) || {};
    const displayName = String(viewer.displayName || viewer.name || 'Você').trim() || 'Você';
    const avatarUrl = String(viewer.avatarUrl || viewer.avatar || '').trim() || null;
    return {
      id: String(viewer.id || LOCAL_RATING_VIEWER_ID),
      display_name: displayName,
      avatar_url: avatarUrl,
      avatar_path: null,
      bio: '',
      affiliation: '',
      gender_identity: '',
      gender_identity_custom: '',
      race_color: '',
      contact_primary_method: null,
      contact_cta_enabled: true,
      social_links: {},
      social_visibility: {},
      profile_public: true,
      onboarding_completed: false,
      verified: true,
      email: String(viewer.email || '').trim() || null,
    };
  }

  function readLocalProfile() {
    const fallback = buildDefaultLocalProfile();
    try {
      const raw = localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
      return {
        ...fallback,
        ...parsed,
        id: String(parsed.id || fallback.id || LOCAL_RATING_VIEWER_ID).trim() || LOCAL_RATING_VIEWER_ID,
        display_name: String(parsed.display_name || fallback.display_name || 'Você').trim() || 'Você',
        avatar_url: String(parsed.avatar_url || fallback.avatar_url || '').trim() || null,
      };
    } catch (_) {
      return fallback;
    }
  }

  function writeLocalProfile(profile) {
    const next = {
      ...buildDefaultLocalProfile(),
      ...(profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {}),
    };
    try {
      localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(next));
      return next;
    } catch (_) {
      return null;
    }
  }

  function syncLocalProfile(profile) {
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

  function normalizeLocalSaveKind(kind) {
    const value = String(kind || '').trim().toLowerCase();
    return ['favorite', 'later', 'highlight'].includes(value) ? value : '';
  }

  function readLocalSavedPosts() {
    try {
      const raw = localStorage.getItem(LOCAL_SAVED_POSTS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((entry) => {
          const source = (entry && typeof entry === 'object' && !Array.isArray(entry)) ? entry : {};
          const postId = String(source.post_id || source.postId || '').trim();
          const saveKind = normalizeLocalSaveKind(source.kind);
          if (!postId || !saveKind) return null;
          const createdAt = String(source.created_at || source.createdAt || getNowIso()).trim() || getNowIso();
          const updatedAt = String(source.updated_at || source.updatedAt || createdAt).trim() || createdAt;
          return {
            post_id: postId,
            kind: saveKind,
            created_at: createdAt,
            updated_at: updatedAt,
          };
        })
        .filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  function writeLocalSavedPosts(list) {
    try {
      localStorage.setItem(LOCAL_SAVED_POSTS_STORAGE_KEY, JSON.stringify(Array.isArray(list) ? list : []));
      return true;
    } catch (_) {
      return false;
    }
  }

  async function listLocalSavedPostSummaries(params = {}) {
    const filteredKind = normalizeLocalSaveKind(params.kind);
    const sorted = readLocalSavedPosts()
      .filter((entry) => !filteredKind || entry.kind === filteredKind)
      .sort((left, right) => new Date(right.updated_at || 0).getTime() - new Date(left.updated_at || 0).getTime());
    const byPost = new Map();

    for (let index = 0; index < sorted.length; index += 1) {
      const entry = sorted[index];
      const post = await localGetPostById(entry.post_id);
      if (!post) continue;
      const summary = mapLocalPostSummary(post);
      const key = String(summary.uuid || summary.id || entry.post_id || '').trim();
      if (!key) continue;
      const current = byPost.get(key);
      if (!current) {
        byPost.set(key, {
          ...summary,
          save_kinds: [entry.kind],
          saved_at: entry.updated_at || entry.created_at || null,
        });
        continue;
      }
      if (!current.save_kinds.includes(entry.kind)) current.save_kinds.push(entry.kind);
      const currentSavedAt = current.saved_at ? new Date(current.saved_at).getTime() : 0;
      const nextSavedAt = entry.updated_at ? new Date(entry.updated_at).getTime() : 0;
      if (nextSavedAt > currentSavedAt) current.saved_at = entry.updated_at;
    }

    return Array.from(byPost.values()).sort((left, right) => {
      const leftAt = left.saved_at ? new Date(left.saved_at).getTime() : 0;
      const rightAt = right.saved_at ? new Date(right.saved_at).getTime() : 0;
      return rightAt - leftAt;
    });
  }

  function prepareLocalPostForPersistence(body, currentPost) {
    const existing = (currentPost && typeof currentPost === 'object' && !Array.isArray(currentPost)) ? { ...currentPost } : {};
    const raw = {
      ...existing,
      ...((body && typeof body === 'object' && !Array.isArray(body)) ? body : {}),
    };
    if (!raw.id) raw.id = existing.id || Date.now();
    if (!raw.authorId) raw.authorId = existing.authorId || LOCAL_RATING_VIEWER_ID;
    if (!raw.autor && !raw._legacyAuthorName) raw.autor = existing.autor || 'Você';
    if (!raw.autorAvatar && !raw._legacyAuthorAvatar) raw.autorAvatar = existing.autorAvatar || ((MOCK_USERS_BY_ID.USER_SELF && MOCK_USERS_BY_ID.USER_SELF.avatarUrl) || '');
    if (!raw.created_at && !raw.createdAt) {
      const createdAt = existing.created_at || existing.createdAt || getNowIso();
      raw.created_at = createdAt;
      raw.createdAt = createdAt;
    }
    raw.updated_at = getNowIso();
    raw.updatedAt = raw.updated_at;
    if (!raw.timestamp && !existing.timestamp) raw.timestamp = 'Agora';

    try {
      const moduleKey = String(raw.modulo || raw.module || '').trim();
      const categoryKey = toSlug(raw.categoriaKey || raw.categoryKey || raw.category || raw.categoria || '');
      if (categoryKey) {
        raw.categoriaKey = categoryKey;
        if (!raw.categoria) raw.categoria = categoryKey;
      }

      let subKey = toSlug(raw.subcategoriaKey || raw.subcategoryKey || raw.subcategory || '');
      const actionish = ['vendo', 'compro', 'troco', 'doacao', 'alugo', 'procuro'];
      if (moduleKey === 'compra-venda' && subKey && actionish.includes(subKey) && categoryKey) {
        subKey = categoryKey;
        raw.subcategoriaKey = categoryKey;
      } else if (subKey) {
        raw.subcategoriaKey = subKey;
      }

      if (!raw.metadata || typeof raw.metadata !== 'object') raw.metadata = {};
      if (categoryKey) raw.metadata.categoriaKey = raw.metadata.categoriaKey || categoryKey;
      if (subKey) {
        raw.metadata.subcategory = raw.metadata.subcategory || subKey;
        raw.metadata.subcategoryKey = raw.metadata.subcategoryKey || subKey;
      }
    } catch (_) { }

    return raw;
  }

  async function getLocalSearchCollection() {
    const db = await getDatabaseNormalized();
    const posts = Array.isArray(db && db.posts) ? db.posts : [];
    const userPosts = readLocalUserPosts();
    return enrichLocalPostsWithRatings(userPosts.concat(posts));
  }

  async function getLocalRatingsTargetPosts(targetUserId) {
    const key = String(targetUserId || '').trim();
    if (!key) return [];
    const collection = await getLocalSearchCollection();
    return (Array.isArray(collection) ? collection : []).filter((post) => {
      const authorId = String((post && (post.authorId || post.autorId || post.author_id)) || '').trim();
      return authorId === key;
    });
  }

  function hasLocalCommentInteractionForPost(post) {
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

  async function resolveLocalRatingEligibility(targetUserId, contextPostId) {
    const targetId = String(targetUserId || '').trim();
    const contextId = String(contextPostId || '').trim() || null;
    if (!targetId) return { canRate: false, reason: 'TARGET_NOT_FOUND' };
    if (targetId === LOCAL_RATING_VIEWER_ID) return { canRate: false, reason: 'SELF' };

    const targetPosts = await getLocalRatingsTargetPosts(targetId);
    if (!targetPosts.length && !MOCK_USERS_BY_ID[targetId]) {
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

    if (scopedPosts.some(hasLocalCommentInteractionForPost)) {
      return { canRate: true, reason: 'OK' };
    }

    const hinted = loadLocalRatingInteractions().some((entry) => {
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

  function normalizeLocalFeedCursorParams(params) {
    const p = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
    const limitRaw = (p.limit != null) ? parseInt(String(p.limit), 10) : 20;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 20;
    const cursor = p.cursor != null ? String(p.cursor).trim() : '';
    return {
      ...p,
      limit,
      cursor: cursor || null,
    };
  }

  function encodeBase64Utf8(value) {
    const input = String(value == null ? '' : value);
    try {
      if (typeof Buffer !== 'undefined') return Buffer.from(input, 'utf8').toString('base64');
    } catch (_) { }

    if (typeof TextEncoder !== 'undefined' && typeof btoa === 'function') {
      const bytes = new TextEncoder().encode(input);
      let binary = '';
      bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
      return btoa(binary);
    }

    if (typeof btoa === 'function') return btoa(input);
    return input;
  }

  function decodeBase64Utf8(value) {
    const input = String(value == null ? '' : value);
    try {
      if (typeof Buffer !== 'undefined') return Buffer.from(input, 'base64').toString('utf8');
    } catch (_) { }

    if (typeof TextDecoder !== 'undefined' && typeof atob === 'function') {
      const binary = atob(input);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }

    if (typeof atob === 'function') return atob(input);
    return input;
  }

  function encodeLocalFeedCursor(offset) {
    return encodeBase64Utf8(JSON.stringify({ offset: Math.max(0, Number(offset) || 0) }));
  }

  function decodeLocalFeedCursor(cursor) {
    if (!cursor) return 0;
    try {
      const decoded = JSON.parse(decodeBase64Utf8(cursor));
      const offset = parseInt(String(decoded && decoded.offset != null ? decoded.offset : 0), 10);
      return Number.isFinite(offset) && offset > 0 ? offset : 0;
    } catch (_) {
      return 0;
    }
  }

  async function localGetFeedCursor(params = {}) {
    const p = normalizeLocalFeedCursorParams(params);

    if (!cfg.baseURL) {
      const db = await getDatabaseNormalized();
      const filtered = typeof filterLocalPosts === 'function' ? filterLocalPosts(db.posts, p) : (db.posts || []);
      const rows = Array.isArray(filtered) ? filtered : [];
      const offset = decodeLocalFeedCursor(p.cursor);
      const nextOffset = Math.max(0, offset);
      const posts = enrichLocalPostsWithRatings(rows.slice(nextOffset, nextOffset + p.limit));
      const hasMore = (nextOffset + posts.length) < rows.length;

      try { console.debug(`[KCAPI:local] Serving cursor slice from ${nextOffset} (${posts.length} items) [limit=${p.limit}]`); } catch (_) { }

      return {
        posts,
        nextCursor: hasMore ? encodeLocalFeedCursor(nextOffset + posts.length) : null,
        hasMore,
      };
    }

    const q = new URLSearchParams();
    Object.entries(p || {}).forEach(([k, v]) => {
      if (v == null || v === '') return;
      if (Array.isArray(v)) {
        if (!v.length) return;
        q.set(k, JSON.stringify(v));
        return;
      }
      q.set(k, String(v));
    });
    return fetchJSON(apiURL('feed-cursor?' + q.toString()));
  }

  // ---------- Endpoints sugeridos (futuro backend) ----------
  // GET /api/v1/posts?module=...&q=...
  async function localGetPosts(params = {}) {
    // Se você já tiver um backend rodando, basta configurar baseURL:
    // KCAPI.setConfig({ baseURL: '/api/v1' })
    if (!cfg.baseURL) {
      const db = await getDatabaseNormalized();
      const filtered = typeof filterLocalPosts === 'function' ? filterLocalPosts(db.posts, params) : (db.posts || []);

      // V8.1.4.2: paginação no driver local (paridade com Supabase)
      const p = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
      const pageRaw = (p.page != null) ? parseInt(String(p.page), 10) : 1;
      const limitRaw = (p.limit != null) ? parseInt(String(p.limit), 10) : 20;
      const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 20;
      const start = (page - 1) * limit;
      const end = start + limit;
      const slice = Array.isArray(filtered) ? enrichLocalPostsWithRatings(filtered.slice(start, end)) : [];

      try { console.debug(`[KCAPI:local] Serving page ${page} (${slice.length} items) [limit=${limit}]`); } catch (_) { }

      return slice;
    }

    // Backend: espera-se que o servidor já devolva o contrato padrão do Post
    const q = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v == null || v === '') return;
      q.set(k, String(v));
    });
    return fetchJSON(apiURL('posts?' + q.toString()));
  }

  async function localSearchPosts(params = {}) {
    if (!cfg.baseURL) {
      const searchShared = getSearchShared();
      if (!searchShared) {
        return localGetPosts(params);
      }

      const collection = await getLocalSearchCollection();
      return searchShared.searchCollection(collection, params);
    }

    const q = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v == null || v === '') return;
      q.set(k, String(v));
    });
    return fetchJSON(apiURL('search?' + q.toString()));
  }

  // GET /api/v1/posts/:id (ou driver local)
  // - Local-first: busca em localStorage (kc_user_posts) e no seed (data/database.json)
  // - Futuro: preparado para IDs UUID (string) e para backend habilitado
  async function localGetPostById(id) {
    const key = String(id || '').trim();
    if (!key) return null;

    // Backend mode (quando baseURL estiver configurado)
    if (cfg.baseURL) {
      try {
        return await fetchJSON(apiURL('posts/' + encodeURIComponent(key)));
      } catch (_) {
        // fallback: tenta resolver via listagem (caso rota /:id não exista ainda)
        try {
          const posts = await localGetPosts({});
          return posts.find((p) => {
            const pid = (p && (p.id ?? p._id ?? p.legacy_id ?? p.legacyId ?? p.uuid)) ?? null;
            return pid != null && String(pid) === key;
          }) || null;
        } catch (_) { }
        return null;
      }
    }

    // 1) LocalStorage (posts do usuário)
    try {
      const raw = localStorage.getItem('kc_user_posts');
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) {
        const found = list.find((p) => {
          const pid = (p && (p.id ?? p._id ?? p.legacy_id ?? p.legacyId ?? p.uuid)) ?? null;
          return pid != null && String(pid) === key;
        });
        if (found) return enrichLocalPostWithRatings(found);
      }
    } catch (_) { }

    // 2) Seed JSON (data/database.json)
    try {
      const db = await getDatabaseRaw();
      const items = Array.isArray(db.anuncios) ? db.anuncios : (Array.isArray(db.posts) ? db.posts : []);
      const found = items.find((a) => {
        const pid = (a && (a.id ?? a._id ?? a.legacy_id ?? a.legacyId ?? a.uuid)) ?? null;
        if (pid != null && String(pid) === key) return true;
        // compat: alguns seeds podem usar legacy_id numérico + id uuid
        const legacy = (a && (a.legacy_id ?? a.legacyId)) ?? null;
        if (legacy != null && String(legacy) === key) return true;
        return false;
      });
      if (found) return enrichLocalPostWithRatings(found);
    } catch (_) { }

    return null;
  }

  async function localGetRelatedPosts(postId, options = {}) {
    const current = await localGetPostById(postId);
    if (!current) return [];

    const limit = Math.min(12, Math.max(1, Number(options.limit) || 8));
    const viewerAuthenticated = options.viewerAuthenticated !== false;
    const currentAuthor = String(current.authorId || current.autorId || current.author_id || '').trim();
    const currentModule = String(current.modulo || current.module || '').trim();

    const db = await getDatabaseNormalized();
    const dbItems = Array.isArray(db && db.posts) ? db.posts : [];
    const localItems = (() => {
      try {
        const raw = JSON.parse(localStorage.getItem('kc_user_posts') || '[]');
        return Array.isArray(raw) ? raw.map(normalizePost) : [];
      } catch (_) {
        return [];
      }
    })();

    const candidates = dbItems.concat(localItems).filter((item) => {
      if (!item) return false;
      const candidateId = String(item.uuid || item.id || '').trim();
      const currentId = String(current.uuid || current.id || '').trim();
      if (candidateId && currentId && candidateId === currentId) return false;
      if (String(item.status || 'published').trim().toLowerCase() !== 'published') return false;
      const visibility = String(item.visibility || 'public').trim().toLowerCase();
      if (!viewerAuthenticated && visibility !== 'public') return false;
      return true;
    });

    const ranked = (window.KCAPI && typeof window.KCAPI.rankRelatedPosts === 'function')
      ? window.KCAPI.rankRelatedPosts(current, candidates, { viewerAuthenticated })
      : candidates;

    const prioritized = ranked.sort((left, right) => {
      const leftAuthor = String(left.authorId || left.autorId || left.author_id || '').trim();
      const rightAuthor = String(right.authorId || right.autorId || right.author_id || '').trim();
      const leftModule = String(left.modulo || left.module || '').trim();
      const rightModule = String(right.modulo || right.module || '').trim();

      const leftSameAuthor = leftAuthor && leftAuthor === currentAuthor;
      const rightSameAuthor = rightAuthor && rightAuthor === currentAuthor;
      if (leftSameAuthor !== rightSameAuthor) return leftSameAuthor ? -1 : 1;

      const leftSameModule = leftModule && leftModule === currentModule;
      const rightSameModule = rightModule && rightModule === currentModule;
      if (leftSameModule !== rightSameModule) return leftSameModule ? -1 : 1;

      return Number(right._kcRelatedScore || 0) - Number(left._kcRelatedScore || 0);
    });

    return enrichLocalPostsWithRatings(prioritized.slice(0, limit));
  }

  async function localGetUserRatingSummary(userId) {
    return buildLocalRatingSummary(userId, loadLocalRatings());
  }

  async function localGetUserRatingState(params = {}) {
    const targetUserId = String((params && (params.targetUserId || params.target_user_id)) || '').trim();
    const contextPostId = String((params && (params.contextPostId || params.context_post_id)) || '').trim() || null;
    const ratings = loadLocalRatings();
    const myRating = ratings.find((item) => item && item.targetUserId === targetUserId && item.raterUserId === LOCAL_RATING_VIEWER_ID) || null;

    if (myRating) {
      return {
        targetUserId: targetUserId || null,
        contextPostId,
        canRate: true,
        reason: 'OK',
        myRating,
      };
    }

    const eligibility = await resolveLocalRatingEligibility(targetUserId, contextPostId);
    return {
      targetUserId: targetUserId || null,
      contextPostId,
      canRate: eligibility.canRate === true,
      reason: eligibility.reason || 'UNKNOWN',
      myRating: null,
    };
  }

  async function localListUserRatings(userId, options = {}) {
    const page = Math.max(1, parseInt(String(options && options.page != null ? options.page : 1), 10) || 1);
    const limit = Math.max(1, parseInt(String(options && options.limit != null ? options.limit : 10), 10) || 10);
    const offset = (page - 1) * limit;
    const items = loadLocalRatings()
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

  async function localUpsertUserRating(payload = {}) {
    const targetUserId = String((payload && (payload.targetUserId || payload.target_user_id)) || '').trim();
    const contextPostId = String((payload && (payload.contextPostId || payload.context_post_id)) || '').trim() || null;
    const rating = parseInt(String(payload && payload.rating != null ? payload.rating : 0), 10);
    const comment = String(payload && payload.comment || '').trim();

    if (!targetUserId) {
      return { ok: false, error: { message: 'Usuário alvo inválido.' } };
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return { ok: false, error: { message: 'A nota deve estar entre 1 e 5 estrelas.' } };
    }
    if (comment.length > 280) {
      return { ok: false, error: { message: 'O comentário aceita no máximo 280 caracteres.' } };
    }

    const state = await localGetUserRatingState({ targetUserId, contextPostId });
    if (!state.canRate) {
      const message = state.reason === 'SELF'
        ? 'Você não pode avaliar o próprio perfil.'
        : (state.reason === 'NO_INTERACTION'
          ? 'Interaja com um post deste usuário antes de avaliá-lo.'
          : 'Não foi possível registrar esta avaliação.');
      return { ok: false, error: { message }, reason: state.reason };
    }

    const items = loadLocalRatings();
    const index = items.findIndex((item) => item && item.targetUserId === targetUserId && item.raterUserId === LOCAL_RATING_VIEWER_ID);
    const viewer = MOCK_USERS_BY_ID[LOCAL_RATING_VIEWER_ID] || {};
    const next = normalizeLocalRatingEntry({
      id: index >= 0 ? items[index].id : null,
      targetUserId,
      raterUserId: LOCAL_RATING_VIEWER_ID,
      contextPostId,
      rating,
      comment,
      createdAt: index >= 0 ? items[index].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reviewer: {
        id: LOCAL_RATING_VIEWER_ID,
        displayName: String(viewer.displayName || viewer.name || 'Você').trim() || 'Você',
        avatarUrl: String(viewer.avatarUrl || viewer.avatar || '').trim() || null,
        public: true,
      },
    });

    if (index >= 0) items[index] = next;
    else items.push(next);
    saveLocalRatings(items);

    return {
      ok: true,
      rating: next,
      summary: buildLocalRatingSummary(targetUserId, items),
      error: null,
    };
  }

  // POST /api/v1/posts
  async function localCreatePost(body) {
    if (!cfg.baseURL) {
      // fallback: simula persistência local (para protótipo)
      // Obs.: kc-core.js ainda usa "kc_user_posts" (legado). Mantemos sem regressão.
      const existing = readLocalUserPostDrafts();
      const raw = prepareLocalPostForPersistence(body, null);
      const next = normalizePost(raw);
      existing.unshift(raw);

      try {
        if (!writeLocalUserPosts(existing)) throw new Error('LOCAL_WRITE_FAILED');
      } catch (err) {
        const message = (err && err.message) ? String(err.message) : 'Falha ao persistir publicação no localStorage.';
        const errorPayload = {
          code: 'LOCAL_STORAGE_SET_ITEM_FAILED',
          message,
        };
        console.error('[KCAPI] localCreatePost persist error', {
          driver: ENV.driver,
          storageKey: 'kc_user_posts',
          message,
        });
        return { ok: false, error: errorPayload };
      }

      return next;
    }

    return fetchJSON(apiURL('posts'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
  }

  async function localUpdatePost(postId, payload) {
    const key = String(postId || '').trim();
    if (!key) return { ok: false, error: { message: 'Post inválido para edição.' } };

    if (cfg.baseURL) {
      return fetchJSON(apiURL('posts/' + encodeURIComponent(key)), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
    }

    const drafts = readLocalUserPostDrafts();
    const index = drafts.findIndex((item) => matchesLocalPostIdentity(item, key));
    if (index < 0) return { ok: false, error: { message: 'Publicação não encontrada.' } };

    const nextDraft = prepareLocalPostForPersistence(payload, drafts[index]);
    drafts[index] = nextDraft;
    if (!writeLocalUserPosts(drafts)) {
      return { ok: false, error: { message: 'Não foi possível salvar alterações localmente.' } };
    }

    return { ok: true, data: normalizePost(nextDraft) };
  }

  async function localDeletePost(postId) {
    const key = String(postId || '').trim();
    if (!key) return { ok: false, error: { message: 'Post inválido para exclusão.' } };

    if (cfg.baseURL) {
      return fetchJSON(apiURL('posts/' + encodeURIComponent(key)), {
        method: 'DELETE',
      });
    }

    const drafts = readLocalUserPostDrafts();
    const nextDrafts = drafts.filter((item) => !matchesLocalPostIdentity(item, key));
    if (nextDrafts.length === drafts.length) {
      return { ok: false, error: { message: 'Publicação não encontrada.' } };
    }
    if (!writeLocalUserPosts(nextDrafts)) {
      return { ok: false, error: { message: 'Não foi possível excluir a publicação localmente.' } };
    }

    const nextSaved = readLocalSavedPosts().filter((entry) => entry && String(entry.post_id || '').trim() !== key);
    writeLocalSavedPosts(nextSaved);
    return { ok: true };
  }

  async function localGetMyProfile() {
    return readLocalProfile();
  }

  async function localUpdateMyProfile(patch = {}) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return { ok: false, error: { message: 'Patch de perfil inválido.' } };
    }
    if (!Object.keys(patch).length) {
      return { ok: false, error: { message: 'Nenhuma alteração informada.' } };
    }

    const current = readLocalProfile();
    if (Object.prototype.hasOwnProperty.call(patch, 'display_name') && !String(patch.display_name || '').trim()) {
      return { ok: false, error: { message: 'Informe um nome válido.' } };
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'avatar_url')) {
      const avatarUrl = String(patch.avatar_url || '').trim();
      if (avatarUrl && !/^(https?:\/\/|data:|blob:)/i.test(avatarUrl)) {
        return { ok: false, error: { message: 'URL de avatar inválida.' } };
      }
    }

    const next = {
      ...current,
      ...patch,
      id: current.id || LOCAL_RATING_VIEWER_ID,
      updated_at: getNowIso(),
    };
    const saved = writeLocalProfile(next);
    if (!saved) return { ok: false, error: { message: 'Não foi possível salvar o perfil localmente.' } };
    syncLocalProfile(saved);
    return { ok: true, data: saved };
  }

  async function localUploadProfileAvatar(fileOrDataUrl) {
    const value = String(fileOrDataUrl || '').trim();
    if (value) {
      if (/^(https?:\/\/|data:|blob:)/i.test(value)) {
        return { ok: true, data: { url: value, path: null } };
      }
      return { ok: false, error: { message: 'Formato de avatar inválido.' } };
    }

    if (typeof FileReader !== 'undefined' && fileOrDataUrl && typeof fileOrDataUrl === 'object') {
      return new Promise((resolve) => {
        try {
          const reader = new FileReader();
          reader.onload = function () {
            resolve({ ok: true, data: { url: String(reader.result || ''), path: null } });
          };
          reader.onerror = function () {
            resolve({ ok: false, error: { message: 'Não foi possível ler o avatar selecionado.' } });
          };
          reader.readAsDataURL(fileOrDataUrl);
        } catch (_) {
          resolve({ ok: false, error: { message: 'Não foi possível processar o avatar selecionado.' } });
        }
      });
    }

    return { ok: false, error: { message: 'Upload de avatar indisponível no modo local.' } };
  }

  async function localGetMyPosts(params = {}) {
    const statusFilter = String(params.status || '').trim().toLowerCase();
    const sorted = readLocalUserPosts()
      .slice()
      .sort((left, right) => parseLocalPostTime(right) - parseLocalPostTime(left))
      .filter((post) => {
        if (!statusFilter) return true;
        return String((post && post.status) || 'published').trim().toLowerCase() === statusFilter;
      })
      .map((post) => mapLocalPostSummary(post));
    return paginateLocalItems(sorted, params).items;
  }

  async function localGetPostsByAuthorId(authorId, params = {}) {
    const author = String(authorId || '').trim();
    if (!author) return [];

    const statusFilter = String(params.status || 'published').trim().toLowerCase();
    const collection = await getLocalSearchCollection();
    const items = (Array.isArray(collection) ? collection : [])
      .filter((post) => {
        const normalized = normalizePost(post || {});
        const currentAuthor = String((normalized && (normalized.authorId || normalized.author_id)) || '').trim();
        if (currentAuthor !== author) return false;
        if (!statusFilter) return true;
        return String((normalized && normalized.status) || 'published').trim().toLowerCase() === statusFilter;
      })
      .sort((left, right) => parseLocalPostTime(right) - parseLocalPostTime(left))
      .map((post) => mapLocalPostSummary(post));
    return paginateLocalItems(items, params).items;
  }

  async function localGetSavedPostState(postId) {
    const post = await localGetPostById(postId);
    const keys = post ? buildLocalPostKeys(post) : [String(postId || '').trim()].filter(Boolean);
    const kinds = Array.from(new Set(
      readLocalSavedPosts()
        .filter((entry) => keys.includes(String(entry.post_id || '').trim()))
        .map((entry) => entry.kind)
        .filter(Boolean)
    ));
    return { kinds };
  }

  async function localClearSavedPostState(postId, kind) {
    const saveKind = normalizeLocalSaveKind(kind);
    const post = await localGetPostById(postId);
    const keys = post ? buildLocalPostKeys(post) : [String(postId || '').trim()].filter(Boolean);
    if (!keys.length) return { ok: false, error: { message: 'Publicação inválida.' } };

    const next = readLocalSavedPosts().filter((entry) => {
      const matchesPost = keys.includes(String(entry.post_id || '').trim());
      if (!matchesPost) return true;
      if (!saveKind) return false;
      return entry.kind !== saveKind;
    });
    if (!writeLocalSavedPosts(next)) {
      return { ok: false, error: { message: 'Não foi possível remover o item salvo.' } };
    }
    return { ok: true, cleared: saveKind || 'all' };
  }

  async function localSetSavedPostState(postId, kind, enabled) {
    const saveKind = normalizeLocalSaveKind(kind);
    if (!saveKind) return { ok: false, error: { message: 'Tipo de salvamento inválido.' } };
    if (enabled === false) return localClearSavedPostState(postId, saveKind);

    const post = await localGetPostById(postId);
    if (!post) return { ok: false, error: { message: 'Publicação inválida.' } };
    const keys = buildLocalPostKeys(post);
    const primaryKey = String((post && (post.uuid || post.id || post.legacy_id || post.legacyId)) || keys[0] || '').trim();
    if (!primaryKey) return { ok: false, error: { message: 'Publicação inválida.' } };

    const now = getNowIso();
    const current = readLocalSavedPosts();
    const index = current.findIndex((entry) => String(entry.post_id || '').trim() === primaryKey && entry.kind === saveKind);
    if (index >= 0) current[index].updated_at = now;
    else current.push({ post_id: primaryKey, kind: saveKind, created_at: now, updated_at: now });

    if (!writeLocalSavedPosts(current)) {
      return { ok: false, error: { message: 'Não foi possível salvar a publicação.' } };
    }
    return { ok: true, data: { kind: saveKind }, enabled: true };
  }

  async function localGetMySavedPosts(params = {}) {
    const items = await listLocalSavedPostSummaries(params);
    return paginateLocalItems(items, params).items;
  }

  async function localGetMySavedPostsCount(params = {}) {
    const items = await listLocalSavedPostSummaries(params);
    return items.length;
  }

  async function localGetProfileHighlights(profileId, params = {}) {
    const current = readLocalProfile();
    const target = String(profileId || '').trim();
    if (!target || (target !== String(current.id || '').trim() && target !== LOCAL_RATING_VIEWER_ID)) return [];
    const items = await listLocalSavedPostSummaries({ ...params, kind: 'highlight' });
    return paginateLocalItems(items, params).items;
  }

  async function localGetProfileHighlightsCount(profileId, params = {}) {
    const current = readLocalProfile();
    const target = String(profileId || '').trim();
    if (!target || (target !== String(current.id || '').trim() && target !== LOCAL_RATING_VIEWER_ID)) return 0;
    const items = await listLocalSavedPostSummaries({ ...params, kind: 'highlight' });
    return items.length;
  }

  async function localGetNotificationPreferences() {
    return readLocalNotificationPreferences();
  }

  async function localUpdateNotificationPreferences(preferences = {}) {
    const saved = writeLocalNotificationPreferences(preferences);
    if (!saved) {
      return { ok: false, error: { message: 'NÃ£o foi possÃ­vel salvar as preferÃªncias de notificaÃ§Ã£o localmente.' } };
    }
    return { ok: true, data: { preferences: saved } };
  }

  async function localGetNotifications() {
    return { ok: true, notifications: [], unread: 0, total: 0 };
  }

  async function localMarkNotificationsRead() {
    return { ok: true };
  }

  async function localMarkAllNotificationsRead() {
    return { ok: true };
  }

  async function localClearNotifications() {
    return { ok: true, deleted: 0 };
  }

  async function localGetUnreadNotificationCount() {
    return 0;
  }

  function localSubscribeNotifications() {
    return null;
  }

  function localUnsubscribeNotifications() { }

  async function localInviteExternalUser() {
    return { ok: false, error: 'DRIVER_NAO_SUPORTA' };
  }

  async function localGetInvites() {
    return { data: [], error: null };
  }

  async function localRevokeInvite() {
    return { ok: false, error: 'DRIVER_NAO_SUPORTA' };
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
      return { ok: false, error: { message: 'Preencha assunto, descrição e e-mail de retorno.' } };
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
      return { ok: false, error: { message: 'Não foi possível salvar o pedido de ajuda localmente.' } };
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
    if (!targetId) return { ok: false, error: { message: 'Pedido inválido.' } };
    const list = readHelpRequests();
    const index = list.findIndex((item) => String(item && item.id || '') === targetId);
    if (index < 0) return { ok: false, error: { message: 'Pedido não encontrado.' } };
    list[index] = {
      ...list[index],
      ...(patch && typeof patch === 'object' ? patch : {}),
      updated_at: new Date().toISOString(),
    };
    if (!writeHelpRequests(list)) {
      return { ok: false, error: { message: 'Não foi possível atualizar o pedido localmente.' } };
    }
    return { ok: true, data: list[index] };
  }

  function normalizeRankingModuleKey(value) {
    return toSlug(String(value || '').trim());
  }

  function parseLocalRankingTimestamp(post) {
    const source = (post && typeof post === 'object' && !Array.isArray(post)) ? post : {};
    const absolute = [source.createdAt, source.created_at, source.timestamp_iso].find((value) => value != null && String(value).trim());
    if (absolute) {
      const parsed = Date.parse(String(absolute));
      if (Number.isFinite(parsed)) return parsed;
    }

    const relative = String(source.timestamp || '').trim();
    if (!relative) return null;

    const normalized = relative
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    const match = normalized.match(/^ha\s+(\d+)\s+(minuto|minutos|hora|horas|dia|dias|semana|semanas|mes|meses)$/);
    if (!match) return null;

    const amount = parseInt(match[1], 10);
    const unit = match[2];
    if (!Number.isFinite(amount) || amount < 0) return null;

    const multipliers = {
      minuto: 60 * 1000,
      minutos: 60 * 1000,
      hora: 60 * 60 * 1000,
      horas: 60 * 60 * 1000,
      dia: 24 * 60 * 60 * 1000,
      dias: 24 * 60 * 60 * 1000,
      semana: 7 * 24 * 60 * 60 * 1000,
      semanas: 7 * 24 * 60 * 60 * 1000,
      mes: 30 * 24 * 60 * 60 * 1000,
      meses: 30 * 24 * 60 * 60 * 1000,
    };

    const delta = multipliers[unit];
    if (!delta) return null;
    return Date.now() - (amount * delta);
  }

  function isLocalRankingPostInPeriod(post, period) {
    const parsed = parseLocalRankingTimestamp(post);
    if (!Number.isFinite(parsed)) return true;

    const normalizedPeriod = String(period || 'month').trim().toLowerCase();
    const windows = {
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
    };
    const maxAge = windows[normalizedPeriod] || windows.month;
    return (Date.now() - parsed) <= maxAge;
  }

  function resolveLocalRankingUser(post, index) {
    const normalized = normalizePost(post || {});
    const source = (post && typeof post === 'object' && !Array.isArray(post)) ? post : {};
    const explicitAuthorId = String((normalized && normalized.authorId) || source.authorId || source.author_id || '').trim();
    const displayName = String(
      (normalized && (normalized.authorName || normalized.author || normalized.autor))
      || source.authorName
      || source.author
      || source.autor
      || 'Usuário'
    ).trim() || 'Usuário';
    const avatarUrl = String(
      (normalized && (normalized.authorAvatar || normalized.autorAvatar))
      || source.authorAvatar
      || source.autorAvatar
      || ''
    ).trim();

    let matchedUser = null;
    if (explicitAuthorId && MOCK_USERS_BY_ID && MOCK_USERS_BY_ID[explicitAuthorId]) {
      matchedUser = MOCK_USERS_BY_ID[explicitAuthorId];
    }

    if (!matchedUser && Array.isArray(MOCK_USERS_LIST) && MOCK_USERS_LIST.length) {
      matchedUser = MOCK_USERS_LIST.find((entry) => {
        if (!entry) return false;
        const sameName = String(entry.displayName || '').trim() === displayName;
        if (!sameName) return false;
        if (!avatarUrl) return true;
        return String(entry.avatarUrl || '').trim() === avatarUrl;
      }) || null;
    }

    const fallbackKey = displayName && displayName !== 'Usuário'
      ? displayName + '-' + avatarUrl
      : 'user-' + String(index + 1);
    const userId = explicitAuthorId || (matchedUser && matchedUser.id) || ('LOCAL_' + toSlug(fallbackKey));

    return {
      userId,
      displayName: displayName || (matchedUser && matchedUser.displayName) || 'Usuário',
      avatarUrl: avatarUrl || (matchedUser && matchedUser.avatarUrl) || '',
    };
  }

  async function localGetTopContributors(period, module, limit) {
    const list = await getLocalSearchCollection();
    const entries = Array.isArray(list) ? list : [];
    const normalizedModule = normalizeRankingModuleKey(module);
    const parsedLimit = parseInt(String(limit != null ? limit : 10), 10);
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;
    const scoreMap = new Map();

    entries.forEach((post, index) => {
      const source = (post && typeof post === 'object' && !Array.isArray(post)) ? post : {};
      const postModule = normalizeRankingModuleKey(source.modulo || source.module || source.moduleKey || '');
      if (normalizedModule && postModule !== normalizedModule) return;
      if (!isLocalRankingPostInPeriod(source, period)) return;

      const contributor = resolveLocalRankingUser(source, index);
      if (!contributor.userId) return;

      const current = scoreMap.get(contributor.userId) || {
        user_id: contributor.userId,
        display_name: contributor.displayName,
        avatar_url: contributor.avatarUrl,
        posts_count: 0,
        votes_received: 0,
        comments_count: 0,
        coupon_clicks: 0,
        share_count: 0,
        penalties: 0,
      };

      current.posts_count += 1;
      current.votes_received += Math.max(0, Number(source.votos != null ? source.votos : source.votes) || 0);
      current.comments_count += Math.max(0, Number(
        source.comentarios != null
          ? source.comentarios
          : (source.commentsCount != null ? source.commentsCount : source.comments_count)
      ) || 0);
      current.coupon_clicks += Math.max(0, Number(
        source.couponClicks != null
          ? source.couponClicks
          : (source.coupon_clicks != null
            ? source.coupon_clicks
            : ((source.metadata && (source.metadata.couponClicks != null ? source.metadata.couponClicks : source.metadata.coupon_clicks)) || 0))
      ) || 0);
      current.share_count += Math.max(0, Number(
        source.shareCount != null
          ? source.shareCount
          : (source.share_count != null
            ? source.share_count
            : ((source.metadata && (source.metadata.shareCount != null ? source.metadata.shareCount : source.metadata.share_count)) || 0))
      ) || 0);

      scoreMap.set(contributor.userId, current);
    });

    return Array.from(scoreMap.values())
      .map((entry) => ({
        ...entry,
        score: Math.max(0,
          (entry.posts_count * 15)
          + (entry.votes_received * 10)
          + (entry.comments_count * 5)
          + (entry.coupon_clicks * 4)
          + (entry.share_count * 3)
          - (entry.penalties * 50)
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        if (right.posts_count !== left.posts_count) return right.posts_count - left.posts_count;
        return String(left.display_name || '').localeCompare(String(right.display_name || ''), 'pt-BR');
      })
      .slice(0, safeLimit)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));
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
    reportPost: async function () {
      return { ok: false, error: { message: 'Denúncias disponíveis apenas no Supabase.' } };
    },
    // Comentários e votos no driver local são geridos diretamente por kc-core.js (localStorage).
    // As funções abaixo existem apenas para uniformidade da interface; kc-core.js não as usa.
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
    // Stubs: funcionalidades disponíveis apenas no driver Supabase
    togglePostStatus: async function () { return { ok: false, code: 'UNAVAILABLE', message: 'Indisponível no modo local.' }; },
    renewPost: async function () { return { ok: false, code: 'UNAVAILABLE', message: 'Indisponível no modo local.' }; },
    bumpPost: async function () { return { ok: false, code: 'UNAVAILABLE', message: 'Indisponível no modo local.' }; },
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

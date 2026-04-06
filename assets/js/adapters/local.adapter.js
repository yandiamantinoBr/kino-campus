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

  function readLocalUserPosts() {
    try {
      const raw = localStorage.getItem('kc_user_posts');
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.map(normalizePost) : [];
    } catch (_) {
      return [];
    }
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
      const key = 'kc_user_posts';
      const existing = (() => {
        try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { return []; }
      })();
      // Normaliza o payload para o contrato V7.x e garante autor local.
      const raw = { ...(body || {}) };
      if (!raw.id) raw.id = Date.now();
      if (!raw.authorId) raw.authorId = 'USER_SELF';
      if (!raw.autor && !raw._legacyAuthorName) raw.autor = 'Você';
      if (!raw.autorAvatar && !raw._legacyAuthorAvatar) raw.autorAvatar = (MOCK_USERS_BY_ID.USER_SELF && MOCK_USERS_BY_ID.USER_SELF.avatarUrl) || '';
      if (!raw.timestamp && !raw.createdAt) raw.timestamp = 'Agora';

      // V8.1.3.1: garante persistência consistente de categoria/sub-módulo no modo local
      // (mesma semântica do driver Supabase, para que os filters/tabs funcionem igual).
      try {
        const m = String(raw.modulo || raw.module || '').trim();
        const catKey = toSlug(raw.categoriaKey || raw.categoryKey || raw.category || raw.categoria || '');
        if (catKey) {
          raw.categoriaKey = catKey;
          if (!raw.categoria) raw.categoria = catKey;
        }

        let subKey = toSlug(raw.subcategoriaKey || raw.subcategoryKey || raw.subcategory || '');
        const actionish = ['vendo', 'compro', 'troco', 'doacao', 'alugo', 'procuro'];
        // compra-venda: tabs usam categoria (eletronicos...), não ação
        if (m === 'compra-venda' && subKey && actionish.includes(subKey) && catKey) {
          subKey = catKey;
          raw.subcategoriaKey = catKey;
        } else if (subKey) {
          raw.subcategoriaKey = subKey;
        }

        if (!raw.metadata || typeof raw.metadata !== 'object') raw.metadata = {};
        if (catKey) raw.metadata.categoriaKey = raw.metadata.categoriaKey || catKey;
        if (subKey) {
          raw.metadata.subcategory = raw.metadata.subcategory || subKey;
          raw.metadata.subcategoryKey = raw.metadata.subcategoryKey || subKey;
        }
      } catch (_) { }

      const next = normalizePost(raw);
      existing.unshift(next);

      try {
        localStorage.setItem(key, JSON.stringify(existing));
      } catch (err) {
        const message = (err && err.message) ? String(err.message) : 'Falha ao persistir publicação no localStorage.';
        const errorPayload = {
          code: 'LOCAL_STORAGE_SET_ITEM_FAILED',
          message,
        };
        console.error('[KCAPI] localCreatePost persist error', {
          driver: ENV.driver,
          storageKey: key,
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

  async function localListAdminHelpRequests(filters = {}) {
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
    createHelpRequest: localCreateHelpRequest,
    listAdminHelpRequests: localListAdminHelpRequests,
    updateAdminHelpRequest: localUpdateAdminHelpRequest,
    // Stubs: funcionalidades disponíveis apenas no driver Supabase
    togglePostStatus: async function () { return { ok: false, code: 'UNAVAILABLE', message: 'Indisponível no modo local.' }; },
    renewPost: async function () { return { ok: false, code: 'UNAVAILABLE', message: 'Indisponível no modo local.' }; },
    bumpPost: async function () { return { ok: false, code: 'UNAVAILABLE', message: 'Indisponível no modo local.' }; },
    getTopContributors: async function () { return []; },
    trackCouponClick: async function () { return { ok: false }; },
    trackShare: async function () { return { ok: false }; },
    checkDuplicatePost: async function () { return { ok: false, candidates: [] }; },
  });


window.KCAPI.registerAdapter('local', driverLocal);

})();

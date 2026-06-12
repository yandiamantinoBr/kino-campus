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

  // ---------- Normalização: POSTS ----------
  /**
   * Contrato padrão do Post (V7.x):
   * id, modulo, categoria, titulo, descricao, preco, authorId, timestamp, emoji, verificado
   */
  function normalizePost(raw) {
    const r = raw || {};

    const id = (r.id != null) ? r.id : ((r._id != null) ? r._id : Date.now());
    const modulo = r.modulo || r.module || '';
    const categoria = r.categoria || r.category || '';
    const titulo = r.titulo || r.title || '';
    const descricao = r.descricao || r.description || '';
    const preco = (typeof r.preco === 'number') ? r.preco : ((r.price != null) ? r.price : null);

    const meta = (r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata)) ? { ...r.metadata } : {};
    const authorProfile = (r.authorProfile && typeof r.authorProfile === 'object' && !Array.isArray(r.authorProfile))
      ? { ...r.authorProfile }
      : null;
    const legacyAuthorName = pickFirstNonEmpty([r.autor, r.author, meta.autorNome]);
    const legacyAuthorAvatar = pickFirstNonEmpty([r.autorAvatar, r.authorAvatar, meta.autorAvatar]);

    const authorId = r.authorId
      || resolveAuthorId(legacyAuthorName, legacyAuthorAvatar)
      || null;

    const normalizedAuthorName = pickFirstNonEmpty([r.authorName, legacyAuthorName, 'Autor']);
    const normalizedAuthorAvatar = pickFirstNonEmpty([
      r.authorAvatar,
      legacyAuthorAvatar,
      (window.KC_CONSTANTS && window.KC_CONSTANTS.DEFAULT_AVATAR_SVG) || '',
    ]);

    const createdAt = r.createdAt || r.created_at || null;
    const created_at = r.created_at || r.createdAt || null;
    const bumpedAt = r.bumpedAt || r.bumped_at || null;
    const bumped_at = r.bumped_at || r.bumpedAt || null;
    const effectiveAt = r.effectiveAt || r.effective_at || bumpedAt || createdAt || null;
    const effective_at = r.effective_at || r.effectiveAt || bumped_at || created_at || null;
    const timestamp = r.timestamp || effectiveAt || createdAt || '';
    const emoji = r.emoji || '✨';

    // V8.1.3.2: verificação passa a ser atributo do AUTOR (profiles.verified).
    // Mantém compat com o legado (posts com r.verificado / r.verified no mock/local).
    const authorVerified = Boolean(
      r.authorVerified ??
      r.author_verified ??
      (r.profiles && r.profiles.verified) ??
      (r.author && r.author.verified) ??
      false
    );

    const verificado = (Boolean(r.verificado ?? r.verified ?? false) || authorVerified);

    const status = String(r.status || '').trim().toLowerCase() || 'published';
    const isClosed = status === 'closed';
    const visibility = String(r.visibility || meta.visibility || '').trim().toLowerCase() || 'public';
    const tagLabels = Array.isArray(r.tags) ? r.tags : [];
    const tagKeys = Array.isArray(r.tagKeys) ? r.tagKeys : (tagLabels.length ? tagLabels : []);
    const ratingRaw = (r.rating != null)
      ? r.rating
      : (r.rating_avg != null ? r.rating_avg : (authorProfile && authorProfile.rating_avg != null ? authorProfile.rating_avg : null));
    const rating = (ratingRaw != null && ratingRaw !== '') ? Number(ratingRaw) : null;
    const ratingCountRaw = (r.ratingCount != null)
      ? r.ratingCount
      : (r.rating_count != null ? r.rating_count : (authorProfile && authorProfile.rating_count != null ? authorProfile.rating_count : 0));
    const ratingCount = Math.max(0, parseInt(String(ratingCountRaw != null ? ratingCountRaw : 0), 10) || 0);
    const normalizedImages = (() => {
      const direct = Array.isArray(r.imagens) ? r.imagens : (Array.isArray(r.images) ? r.images : []);
      const fallback = pickFirstNonEmpty([r.cover_url, r.coverUrl, r.image_url, r.imageUrl, meta.cover_url, meta.coverUrl, meta.image_url, meta.imageUrl]);
      const values = direct.length ? direct : (fallback ? [fallback] : []);
      return values.map((value) => String(value || '').trim()).filter(Boolean);
    })();

    if (authorProfile) {
      authorProfile.rating_avg = Number.isFinite(rating) ? rating : null;
      authorProfile.rating_count = ratingCount;
      authorProfile.ratingAvg = authorProfile.rating_avg;
      authorProfile.ratingCount = authorProfile.rating_count;
    }

    const out = {
      // Contrato padrão (campos base)
      id,
      modulo,
      categoria,
      titulo,
      descricao,
      preco,
      authorId,
      // V8.1.3.2: status do autor (profiles.verified)
      authorVerified,
      timestamp,
      // Datas (úteis para badges/ordenação; não quebra o contrato legado)
      createdAt,
      created_at,
      bumpedAt,
      bumped_at,
      effectiveAt,
      effective_at,
      emoji,
      verificado,
      status,
      isClosed,
      visibility,

      // Autor (status)
      authorVerified,

      // Campos auxiliares (mantidos para não haver regressão de conteúdo/UX nos cards)
      categoriaKey: r.categoriaKey || r.categoryKey || '',
      categoriaLabel: r.categoriaLabel || r.categoryLabel || '',
      subcategoria: r.subcategoria || r.subcategory || '',
      subcategoriaKey: r.subcategoriaKey || r.subcategoryKey || '',
      subcategoriaLabel: r.subcategoriaLabel || r.subcategoryLabel || '',
      tags: tagLabels,
      tagKeys,
      rating: Number.isFinite(rating) && ratingCount > 0 ? rating : null,
      ratingCount,
      rating_count: ratingCount,
      votos: (r.votos != null ? r.votos : null),
      comentarios: (r.comentarios != null ? r.comentarios : null),
      condicao: r.condicao || r.condition || null,
      precoOriginal: (r.precoOriginal != null ? r.precoOriginal : null),
      precoTexto: r.precoTexto || r.priceText || null,
      imagens: normalizedImages,
      images: normalizedImages,
      image_url: r.image_url || r.imageUrl || normalizedImages[0] || '',
      imageUrl: r.imageUrl || r.image_url || normalizedImages[0] || '',
      cover_url: r.cover_url || r.coverUrl || normalizedImages[0] || '',
      coverUrl: r.coverUrl || r.cover_url || normalizedImages[0] || '',
      // Metadata (JSONB/local): mantém subcategory e labels para filtros
      metadata: meta,
      authorProfile,
      autor: normalizedAuthorName,
      author: normalizedAuthorName,
      autorAvatar: normalizedAuthorAvatar,
      authorAvatar: normalizedAuthorAvatar,
      authorName: normalizedAuthorName,
      _legacyAuthorName: legacyAuthorName || null,
      _legacyAuthorAvatar: legacyAuthorAvatar || null,
      // V8.4: legacy_id identifica posts de exemplo/fictícios
      legacyId: r.legacyId || r.legacy_id || null,
      legacy_id: r.legacy_id || r.legacyId || null,
    };

    // V8.1.3.1: garante consistência de chaves usadas nos filtros (tabs/checkboxes/JSONB)
    try {
      const mk = String(out.modulo || '').toLowerCase();

      if (!out.categoriaKey && meta.categoryKey) out.categoriaKey = meta.categoryKey;
      if (!meta.categoryKey && out.categoriaKey) meta.categoryKey = out.categoriaKey;

      if (!out.subcategoriaKey && meta.subcategoryKey) out.subcategoriaKey = meta.subcategoryKey;
      if (!out.subcategoriaKey && meta.subcategory) out.subcategoriaKey = meta.subcategory;

      const desiredSub = String(out.subcategoriaKey || meta.subcategory || '').trim();
      if (!meta.subcategory && desiredSub) meta.subcategory = desiredSub;
      if (!meta.subcategoryKey && desiredSub) meta.subcategoryKey = desiredSub;

      if (mk === 'compra-venda') {
        const actionish = ['vendo', 'compro', 'troco', 'doacao', 'doação', 'procuro'];
        const subk = String(out.subcategoriaKey || '').toLowerCase();
        if (out.categoriaKey && actionish.includes(subk)) {
          out.subcategoriaKey = out.categoriaKey;
          meta.subcategory = out.categoriaKey;
          meta.subcategoryKey = out.categoriaKey;
        }
        if (out.categoriaKey && !meta.subcategory) {
          meta.subcategory = out.categoriaKey;
          meta.subcategoryKey = out.categoriaKey;
        }
      }
      if (!meta.visibility && visibility) meta.visibility = visibility;
    } catch (_e) { }

    return out;
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



  // ---------- Utilidades internas ----------
  function pickFirstNonEmpty(values) {
    if (!Array.isArray(values)) return '';
    for (const item of values) {
      const value = String(item == null ? '' : item).trim();
      if (value) return value;
    }
    return '';
  }

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
      normalizeUserRatingSummary,
      normalizeUserRatingEntry,
      normalizeUserRatingState,
      normalizeUserRatingList,
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
    return { getActiveDriver, ENV };
  }

  function isPostMutationOk(result) {
    return !!result && result.ok !== false && !result.error;
  }

  function getPostMutationData(result, fallback) {
    if (result && result.data && typeof result.data === 'object') return result.data;
    if (fallback && typeof fallback === 'object') return fallback;
    return {};
  }

  function emitPostMutation(type, postId, result, fallback) {
    if (!isPostMutationOk(result) || !window.KCPostFreshness || typeof window.KCPostFreshness.emit !== 'function') return;
    const data = getPostMutationData(result, fallback);
    const status = result.status || result.new_status || data.status || data.estado || data.new_status || '';
    const moduleKey = data.module || data.modulo || data.moduleKey || (fallback && (fallback.module || fallback.modulo || fallback.moduleKey)) || '';
    window.KCPostFreshness.emit({
      type,
      source: 'api',
      postId: postId || data.uuid || data.id || result.id || result.uuid,
      legacyId: data.legacy_id || data.legacyId || result.legacy_id || result.legacyId,
      module: moduleKey,
      status,
      updated_at: data.updated_at || data.updatedAt || result.updated_at || result.updatedAt,
    });
  }

  async function createPost(body) {
    let result;
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.createPost === 'function') {
      result = await postsWriteModule.createPost(body, buildPostsWriteDeps());
      emitPostMutation('created', null, result, body);
      return result;
    }
    const policyError = enforceSupabaseOnProduction('createPost');
    if (policyError) return policyError;
    result = await getActiveDriver().createPost(body);
    emitPostMutation('created', null, result, body);
    return result;
  }
  async function updatePost(postId, payload) {
    let result;
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.updatePost === 'function') {
      result = await postsWriteModule.updatePost(postId, payload, buildPostsWriteDeps());
      emitPostMutation('updated', postId, result, payload);
      return result;
    }
    if (!getActiveDriver().updatePost) return kcApiError('Edição indisponível neste driver.');
    result = await getActiveDriver().updatePost(postId, payload);
    emitPostMutation('updated', postId, result, payload);
    return result;
  }
  async function deletePost(postId) {
    let result;
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.deletePost === 'function') {
      result = await postsWriteModule.deletePost(postId, buildPostsWriteDeps());
      emitPostMutation(result && result.softDeleted === false ? 'purged' : 'soft_deleted', postId, result, { status: 'deleted' });
      return result;
    }
    if (!getActiveDriver().deletePost) return kcApiError('Exclusão indisponível neste driver.');
    result = await getActiveDriver().deletePost(postId);
    emitPostMutation(result && result.softDeleted === false ? 'purged' : 'soft_deleted', postId, result, { status: 'deleted' });
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
      emitPostMutation('status_changed', postId, result, {});
      return result;
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.togglePostStatus !== 'function') {
      return { ok: false, code: 'UNAVAILABLE', message: 'Toggle de status indisponível neste driver.' };
    }
    result = await driver.togglePostStatus(postId);
    emitPostMutation('status_changed', postId, result, {});
    return result;
  }
  async function renewPost(postId) {
    let result;
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.renewPost === 'function') {
      result = await postsWriteModule.renewPost(postId, buildPostsWriteDeps());
      emitPostMutation('updated', postId, result, {});
      return result;
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.renewPost !== 'function') {
      return { ok: false, code: 'UNAVAILABLE', message: 'Renovação indisponível neste driver.' };
    }
    result = await driver.renewPost(postId);
    emitPostMutation('updated', postId, result, {});
    return result;
  }
  async function bumpPost(postId) {
    let result;
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.bumpPost === 'function') {
      result = await postsWriteModule.bumpPost(postId, buildPostsWriteDeps());
      emitPostMutation('updated', postId, result, {});
      return result;
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.bumpPost !== 'function') {
      return { ok: false, code: 'UNAVAILABLE', message: 'Impulsionamento indisponível neste driver.' };
    }
    result = await driver.bumpPost(postId);
    emitPostMutation('updated', postId, result, {});
    return result;
  }

  async function closePost(postId, payload = {}) {
    let result;
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.closePost === 'function') {
      result = await postsWriteModule.closePost(postId, payload, buildPostsWriteDeps());
      emitPostMutation('status_changed', postId, result, { status: 'closed' });
      return result;
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.closePost !== 'function') {
      return { ok: false, code: 'UNAVAILABLE', message: 'Encerramento indispon\u00EDvel neste driver.' };
    }
    result = await driver.closePost(postId, payload);
    emitPostMutation('status_changed', postId, result, { status: 'closed' });
    return result;
  }

  async function reactivatePost(postId) {
    let result;
    const postsWriteModule = getPostsWriteModule();
    if (postsWriteModule && typeof postsWriteModule.reactivatePost === 'function') {
      result = await postsWriteModule.reactivatePost(postId, buildPostsWriteDeps());
      emitPostMutation('status_changed', postId, result, { status: 'published' });
      return result;
    }
    const driver = getActiveDriver();
    if (!driver || typeof driver.reactivatePost !== 'function') {
      return { ok: false, code: 'UNAVAILABLE', message: 'Reativa\u00E7\u00E3o indispon\u00EDvel neste driver.' };
    }
    result = await driver.reactivatePost(postId);
    emitPostMutation('status_changed', postId, result, { status: 'published' });
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
    const postsReadModule = getPostsReadModule();
    if (postsReadModule && typeof postsReadModule.trackCouponClick === 'function') {
      return postsReadModule.trackCouponClick(postId, buildPostsReadDeps());
    }
    return { ok: false };
  }

  async function trackShare(postId) {
    const postsReadModule = getPostsReadModule();
    if (postsReadModule && typeof postsReadModule.trackShare === 'function') {
      return postsReadModule.trackShare(postId, buildPostsReadDeps());
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
  async function trackView(postId) {
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

  // v9.3.5.4: solicitacoes de acesso externo (admin)
  async function listExternalAccessRequests(filters = {}) {
    const driver = getActiveDriver();
    if (driver && typeof driver.listExternalAccessRequests === 'function') {
      return driver.listExternalAccessRequests(filters);
    }
    return { ok: false, error: { message: 'Funcionalidade indisponível neste driver.' }, items: [], total: 0 };
  }

  async function decideExternalAccessRequest(payload = {}) {
    const driver = getActiveDriver();
    if (driver && typeof driver.decideExternalAccessRequest === 'function') {
      return driver.decideExternalAccessRequest(payload);
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

  function buildFallbackNotificationPreferences() {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.buildFallbackNotificationPreferences === 'function') {
      return notificationsModule.buildFallbackNotificationPreferences({ accountProfileUtils: window.KCAccountProfileUtils });
    }
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

  function buildFallbackNotificationChannelTargets() {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.buildFallbackNotificationChannelTargets === 'function') {
      return notificationsModule.buildFallbackNotificationChannelTargets({ accountProfileUtils: window.KCAccountProfileUtils });
    }
    if (window.KCAccountProfileUtils && typeof window.KCAccountProfileUtils.buildDefaultNotificationChannelTargets === 'function') {
      return window.KCAccountProfileUtils.buildDefaultNotificationChannelTargets();
    }
    return {
      whatsapp: {
        channel: 'whatsapp',
        destination: '',
        country_code: '55',
        local_number: '',
        consent_granted: false,
        consent_at: null,
        configured: false,
        ready: false,
        display: '',
        metadata: { country_code: '55' },
      },
    };
  }

  async function getNotificationPreferences() {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.getNotificationPreferences === 'function') {
      return notificationsModule.getNotificationPreferences({ getActiveDriver, accountProfileUtils: window.KCAccountProfileUtils });
    }
    return buildFallbackNotificationPreferences();
  }

  async function updateNotificationPreferences(preferences = {}) {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.updateNotificationPreferences === 'function') {
      return notificationsModule.updateNotificationPreferences(preferences, { getActiveDriver, accountProfileUtils: window.KCAccountProfileUtils });
    }
    return { ok: false, error: { message: 'Prefer\u00EAncias de notifica\u00E7\u00E3o indispon\u00EDveis neste driver.' } };
  }

  async function getNotificationChannelTargets() {
    const notificationsModule = getNotificationsModule();
    if (notificationsModule && typeof notificationsModule.getNotificationChannelTargets === 'function') {
      return notificationsModule.getNotificationChannelTargets({ getActiveDriver, accountProfileUtils: window.KCAccountProfileUtils });
    }
    return buildFallbackNotificationChannelTargets();
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
    listAdminHelpRequests,
    updateAdminHelpRequest,
    processAccountErasure,
    listExternalAccessRequests,
    decideExternalAccessRequest,
    getNotificationPreferences,
    updateNotificationPreferences,
    getNotificationChannelTargets,
    updateNotificationChannelTargets,

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

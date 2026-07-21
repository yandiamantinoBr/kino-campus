/**
 * KinoCampus — product.load.js v13.4.1
 *
 * Sub-módulo de load/lifecycle para a página de produto (_product.html).
 * Extraído de product.controller.js (v13.4.1 split).
 *
 * Contém:
 *   - resolveCurrentUserDisplayName, resolveCurrentUserAvatar
 *   - resolveCurrentUserLogin, applyCommentComposerSessionState
 *   - isAuthor, getPostIdForMutation, trackHomeCategoryInteraction
 *   - loadSellerAuthorStats, enrichPostAuthorFromProfile
 *   - refreshViewerState, renderPost, loadPost
 *
 * Expõe: window._KCProduct.load (Object.freeze)
 * Carregado: após product.render.js, antes de product.report.js
 * Inicializado via: window._KCProduct.load.init(deps) chamado no DOMContentLoaded
 * do product.controller.js.
 *
 * Contrato deps:
 *   deps.getPost()         — retorna currentPost
 *   deps.setPost(p)        — define currentPost
 *   deps.getUser()         — retorna currentUser
 *   deps.setUser(u)        — define currentUser
 *   deps.getProfile()      — retorna currentProfile
 *   deps.setProfile(p)     — define currentProfile
 *   deps.getParam(name)    — URLSearchParams.get(name)
 *   deps.incrSellerToken() — retorna ++sellerStatsRequestToken
 *   deps.getSellerToken()  — retorna sellerStatsRequestToken atual
 *   deps.setCTA(post)      — chama setCTA no controller
 *   deps.setSeller(post)   — chama setSeller no controller
 *   deps.resumeContact(post) — chama maybeResumeQueuedContact
 */

(function () {
  'use strict';

  window._KCProduct = window._KCProduct || {};

  var _deps = null;
  var PRODUCT_DETAIL_CACHE_VERSION = 1;
  var PRODUCT_DETAIL_CACHE_SCOPE = 'product-detail';
  var PRODUCT_DETAIL_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
  var PRODUCT_DETAIL_CACHE_STALE_MAX_AGE_MS = 30 * 60 * 1000;
  var _pendingPostLoads = {};
  var _commentsLoadedForId = '';
  var _trackedViewIds = {};
  var _freshnessUnsub = null;
  var _freshnessTimer = null;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function isAuthor(post, user) {
    if (!post || !user || !user.id) return false;
    var postAuthorId = String(post.autorId || post.authorId || post.author_id || '').trim();
    return !!postAuthorId && postAuthorId === String(user.id).trim();
  }

  function getPostIdForMutation(post) {
    if (!post) return null;
    return post.uuid || post.id || null;
  }

  function trackHomeCategoryInteraction(eventType, post) {
    try {
      if (window.KCHomeCategories && typeof window.KCHomeCategories.trackEvent === 'function') {
        window.KCHomeCategories.trackEvent(eventType, { post: post });
      }
    } catch (_) {}
  }

  function getSessionStore() {
    return window.KCSessionStore && typeof window.KCSessionStore.get === 'function'
      ? window.KCSessionStore
      : null;
  }

  function getEnvDriver() {
    var env = window.KC_ENV || {};
    return String(env.DATA_DRIVER || env.driver || 'local').toLowerCase();
  }

  function getProductCacheKey(id) {
    return getEnvDriver() + ':' + String(id || '').trim();
  }

  function collectPostCacheAliases(id, raw, post) {
    var aliases = [];

    function add(value) {
      var text = String(value || '').trim();
      if (text && aliases.indexOf(text) === -1) aliases.push(text);
    }

    add(id);
    add(raw && raw.id);
    add(raw && raw.uuid);
    add(raw && raw.legacy_id);
    add(raw && raw.legacyId);
    add(post && post.id);
    add(post && post.uuid);
    add(post && post.legacy_id);
    add(post && post.legacyId);
    return aliases;
  }

  function buildProductSignature(post) {
    var source = (post && typeof post === 'object') ? post : {};
    return JSON.stringify([
      source.uuid || '',
      source.id || '',
      source.status || source.estado || '',
      source.updated_at || source.updatedAt || '',
      source.bumped_at || source.bumpedAt || '',
      source.effective_at || source.effectiveAt || '',
      source.expires_at || source.expiresAt || '',
      source.titulo || source.title || '',
      source.descricao || source.description || '',
      source.preco || source.price || '',
      source.image_url || source.imageUrl || source.cover_url || source.coverUrl || '',
      source.authorName || source.autor || source.author || '',
      source.authorAvatar || source.autorAvatar || '',
    ]);
  }

  function getCachedProductDetail(id) {
    var store = getSessionStore();
    var cached;
    var value;
    var post;
    var age;
    if (!id || !store || typeof store.get !== 'function') return null;

    cached = store.get(PRODUCT_DETAIL_CACHE_SCOPE, getProductCacheKey(id), {
      maxAge: PRODUCT_DETAIL_CACHE_STALE_MAX_AGE_MS,
      removeExpired: true,
    });
    value = cached && cached.value && typeof cached.value === 'object' ? cached.value : null;
    if (!value || Number(value.version) !== PRODUCT_DETAIL_CACHE_VERSION) return null;

    post = value.post && typeof value.post === 'object' ? value.post : null;
    if (!post) return null;

    age = Number(cached.age) || 0;
    return {
      raw: value.raw && typeof value.raw === 'object' ? value.raw : post,
      post: post,
      signature: String(value.signature || buildProductSignature(post)),
      age: age,
      isFresh: age <= PRODUCT_DETAIL_CACHE_MAX_AGE_MS,
    };
  }

  function persistProductDetailCache(id, raw, post) {
    var store = getSessionStore();
    var payload;
    var signature;
    if (!id || !post || !store || typeof store.set !== 'function') return false;

    signature = buildProductSignature(post);
    payload = {
      version: PRODUCT_DETAIL_CACHE_VERSION,
      raw: raw && typeof raw === 'object' ? raw : null,
      post: post,
      signature: signature,
    };

    collectPostCacheAliases(id, raw, post).forEach(function (alias) {
      try { store.set(PRODUCT_DETAIL_CACHE_SCOPE, getProductCacheKey(alias), payload); } catch (_) { }
    });
    return true;
  }

  function invalidateProductDetailCache(postOrId) {
    var store = getSessionStore();
    if (!store) return false;

    if (!postOrId) {
      if (typeof store.clearPrefix === 'function') {
        try { store.clearPrefix(PRODUCT_DETAIL_CACHE_SCOPE, ''); return true; } catch (_) { return false; }
      }
      return false;
    }

    collectPostCacheAliases(
      typeof postOrId === 'object' ? null : postOrId,
      typeof postOrId === 'object' ? postOrId : null,
      typeof postOrId === 'object' ? postOrId : null
    ).forEach(function (alias) {
      try {
        if (typeof store.remove === 'function') {
          store.remove(PRODUCT_DETAIL_CACHE_SCOPE, getProductCacheKey(alias));
        }
      } catch (_) { }
    });
    return true;
  }

  function normalizeProductPost(raw) {
    return (window.KCPostModel && typeof window.KCPostModel.from === 'function')
      ? window.KCPostModel.from(raw, { pageModule: (raw && raw.modulo) || '', view: 'product' })
      : ((window.KCAPI && typeof window.KCAPI.normalizePost === 'function') ? window.KCAPI.normalizePost(raw) : raw);
  }

  function isRenderableProductPost(post) {
    var status = String(post && (post.status || post.estado) || 'published').trim().toLowerCase();
    return !status || status === 'published' || status === 'closed';
  }

  function applyCurrentPostUuid(post, raw) {
    var postUuid = (post && post.uuid) ? String(post.uuid) : ((raw && raw.uuid) ? String(raw.uuid) : null);
    window.kcCurrentPostUuid = postUuid;
    if (postUuid) document.body.setAttribute('data-post-uuid', postUuid);
  }

  async function fetchRenderablePost(id) {
    var requestKey = getProductCacheKey(id);
    if (_pendingPostLoads[requestKey]) return _pendingPostLoads[requestKey];

    _pendingPostLoads[requestKey] = (async function () {
      var raw = null;
      var post = null;
      if (window.KCAPI && typeof window.KCAPI.getPostById === 'function') {
        raw = await window.KCAPI.getPostById(id);
      }
      if (!raw) return null;

      post = normalizeProductPost(raw);
      post = await enrichPostAuthorFromProfile(post);
      return { raw: raw, post: post };
    }()).finally(function () {
      delete _pendingPostLoads[requestKey];
    });

    return _pendingPostLoads[requestKey];
  }

  function loadProductComments(postId) {
    var id = String(postId || '').trim();
    if (!id || _commentsLoadedForId === id) return;
    _commentsLoadedForId = id;

    if (window.KCLazyLoader && typeof window.KCLazyLoader.load === 'function') {
      window.KCLazyLoader.load('assets/js/features/kc-comments.js', function () {
        if (typeof window.renderComments === 'function') {
          window.renderComments(id, 'commentsContainer');
        }
      });
    } else if (typeof window.renderComments === 'function') {
      window.renderComments(id, 'commentsContainer');
    }
  }

  function trackProductViewOnce(post, fallbackId) {
    var viewPostId = (post && post.uuid) ? post.uuid : (post && post.id) || fallbackId;
    var key = String(viewPostId || '').trim();
    if (!key || _trackedViewIds[key]) return;
    _trackedViewIds[key] = true;

    try {
      if (window.KCAPI && typeof window.KCAPI.trackView === 'function') {
        window.KCAPI.trackView(viewPostId).catch(function () {});
      }
    } catch (_) {}
  }

  // ── Identidade do viewer atual ────────────────────────────────────────────────

  function resolveCurrentUserDisplayName(user, profile) {
    var normalizedProfile = (profile && typeof profile === 'object') ? profile : null;
    var normalizedUser = (user && typeof user === 'object') ? user : null;
    var userMetadata = (normalizedUser && normalizedUser.user_metadata && typeof normalizedUser.user_metadata === 'object')
      ? normalizedUser.user_metadata
      : null;

    var candidates = [
      normalizedProfile && normalizedProfile.display_name,
      normalizedProfile && normalizedProfile.full_name,
      userMetadata && userMetadata.full_name,
      normalizedUser && normalizedUser.display_name,
      normalizedUser && normalizedUser.full_name,
      normalizedUser && normalizedUser.email,
    ];

    for (var i = 0; i < candidates.length; i += 1) {
      var value = String(candidates[i] || '').trim();
      if (value) return value;
    }
    return '';
  }

  function resolveCurrentUserAvatar(user, profile) {
    var normalizedProfile = (profile && typeof profile === 'object') ? profile : null;
    var normalizedUser = (user && typeof user === 'object') ? user : null;
    var userMetadata = (normalizedUser && normalizedUser.user_metadata && typeof normalizedUser.user_metadata === 'object')
      ? normalizedUser.user_metadata
      : null;
    var candidates = [
      normalizedProfile && normalizedProfile.avatar_url,
      normalizedProfile && normalizedProfile.avatarUrl,
      normalizedProfile && normalizedProfile.avatar,
      userMetadata && userMetadata.avatar_url,
      userMetadata && userMetadata.avatar,
      normalizedUser && normalizedUser.avatar_url,
      normalizedUser && normalizedUser.avatarUrl,
      normalizedUser && normalizedUser.avatar,
    ];

    for (var i = 0; i < candidates.length; i += 1) {
      var value = String(candidates[i] || '').trim();
      if (value) return value;
    }
    return '';
  }

  function resolveCurrentUserLogin(user, profile) {
    var ownEmail = String((user && user.email) || '').trim();
    if (ownEmail.includes('@')) return ownEmail.split('@')[0];

    if (window.KCUtils && typeof window.KCUtils.buildPublicHandle === 'function') {
      var publicHandle = window.KCUtils.buildPublicHandle(
        profile && (profile.display_name || profile.full_name), { prefix: false }
      );
      if (publicHandle) return publicHandle;
    }
    return '';
  }

  function applyCommentComposerSessionState(user, profile) {
    var commentAuthorInput = document.getElementById('commentAuthor');
    var commentAuthorHint = document.getElementById('commentAuthorHint');
    var composerAvatar = document.getElementById('commentComposerAvatar');
    if (!commentAuthorInput) return;

    var resolvedIdentity = resolveCurrentUserDisplayName(user, profile);
    var resolvedAvatar = resolveCurrentUserAvatar(user, profile);
    var resolvedLogin = resolveCurrentUserLogin(user, profile);
    var isAuthenticated = !!(user && user.id);

    if (resolvedIdentity) commentAuthorInput.value = resolvedIdentity;

    if (isAuthenticated) {
      commentAuthorInput.setAttribute('readonly', 'readonly');
      commentAuthorInput.setAttribute('aria-readonly', 'true');
      commentAuthorInput.removeAttribute('placeholder');
      if (!commentAuthorInput.value) commentAuthorInput.value = 'Conta autenticada';
      if (commentAuthorHint) {
        commentAuthorHint.textContent = resolvedLogin ? ('@' + resolvedLogin) : '';
        commentAuthorHint.style.display = resolvedLogin ? 'block' : 'none';
      }
    } else {
      commentAuthorInput.removeAttribute('readonly');
      commentAuthorInput.setAttribute('placeholder', 'Seu nome (opcional no modo local/dev)');
      if (commentAuthorHint) {
        commentAuthorHint.textContent = '';
        commentAuthorHint.style.display = 'none';
      }
    }

    if (composerAvatar) {
      if (resolvedAvatar) {
        composerAvatar.src = resolvedAvatar;
      } else {
        composerAvatar.src = (window.KC_CONSTANTS && window.KC_CONSTANTS.DEFAULT_AVATAR_SVG) || '';
      }
    }
  }

  // ── loadSellerAuthorStats ────────────────────────────────────────────────────

  async function loadSellerAuthorStats(post, statsContainer, baseItems) {
    var render = window._KCProduct.render;
    var authorId = render ? render.getPostAuthorId(post) : null;
    if (!authorId || !statsContainer || !window.KCAPI) return;

    var requestToken = _deps ? _deps.incrSellerToken() : 0;

    try {
      var postsPromise = typeof window.KCAPI.getPostsByAuthorId === 'function'
        ? window.KCAPI.getPostsByAuthorId(authorId, { page: 1, limit: 24 })
        : Promise.resolve([]);
      var currentUser = _deps ? _deps.getUser() : null;
      var summaryPromise = typeof window.KCAPI.getUserRatingSummary === 'function'
        ? window.KCAPI.getUserRatingSummary(authorId)
        : Promise.resolve(
            window._KCProduct.ratings && typeof window._KCProduct.ratings.getSellerRatingSummaryFromPost === 'function'
              ? window._KCProduct.ratings.getSellerRatingSummaryFromPost(post)
              : null
          );
      var ratingStatePromise = (currentUser && currentUser.id && typeof window.KCAPI.getUserRatingState === 'function')
        ? window.KCAPI.getUserRatingState({
            targetUserId: authorId,
            contextPostId: getPostIdForMutation(post),
          })
        : Promise.resolve({
            targetUserId: authorId,
            contextPostId: getPostIdForMutation(post),
            canRate: false,
            reason: 'AUTH_REQUIRED',
            myRating: null,
          });

      var results = await Promise.all([postsPromise, summaryPromise, ratingStatePromise]);
      var items = results[0], summary = results[1], ratingState = results[2];

      if (_deps && requestToken !== _deps.getSellerToken()) return;

      var currentPostId = String(getPostIdForMutation(post) || '').trim();
      var authorPostCount = (Array.isArray(items) ? items : []).filter(function (item) {
        if (!item) return false;
        var itemId = String((item.uuid || item.id) || '').trim();
        return !currentPostId || itemId !== currentPostId;
      }).length;

      var rows = Array.isArray(baseItems) ? baseItems.slice() : [];
      if (authorPostCount > 0) {
        rows.push('<span><i class="fas fa-layer-group"></i> ' + authorPostCount + ' publicaç' + (authorPostCount === 1 ? 'ão' : 'ões') + '</span>');
      }
      statsContainer.innerHTML = rows.join('');
      if (window._KCProduct.ratings && typeof window._KCProduct.ratings.refreshSellerRatingUI === 'function') {
        window._KCProduct.ratings.refreshSellerRatingUI(post, summary, ratingState, {
          currentUser: currentUser,
          getCurrentPost: function () { return _deps ? _deps.getPost() : null; },
        });
      }
    } catch (_) {}
  }

  // ── enrichPostAuthorFromProfile ──────────────────────────────────────────────

  async function enrichPostAuthorFromProfile(post) {
    var render = window._KCProduct.render;
    var authorId = render ? render.getPostAuthorId(post) : null;
    if (!authorId || !window.KCAPI || typeof window.KCAPI.getProfileById !== 'function') return post;

    var profile = null;
    try { profile = await window.KCAPI.getProfileById(authorId); } catch (_) { profile = null; }
    if (!profile) return post;

    var profileName = String(profile.display_name || profile.full_name || '').trim();
    var profileAvatar = String(profile.avatar_url || '').trim();
    var fallbackName = String(post.authorName || post.autor || post.author || '').trim();
    var fallbackAvatar = String(post.authorAvatar || post.autorAvatar || '').trim();
    var publicHandle = window.KCUtils && typeof window.KCUtils.buildPublicHandle === 'function'
      ? window.KCUtils.buildPublicHandle(profileName || fallbackName) : '';
    var mergedName = profileName || fallbackName || 'Autor';
    var mergedAvatar = profileAvatar || fallbackAvatar || ((window.KC_CONSTANTS && window.KC_CONSTANTS.DEFAULT_AVATAR_SVG) || '');

    return Object.assign({}, post, {
      authorName: mergedName,
      author: mergedName,
      autor: mergedName,
      authorAvatar: mergedAvatar,
      autorAvatar: mergedAvatar,
      verified: profile.verified === true ? true : post.verified,
      verificado: profile.verified === true ? true : post.verificado,
      authorCreatedAt: profile.created_at || post.authorCreatedAt || null,
      authorHandle: publicHandle || post.authorHandle || '',
      authorProfile: profile,
      authorEmail: post.authorEmail || '',
    });
  }

  // ── refreshViewerState ───────────────────────────────────────────────────────

  async function refreshViewerState() {
    if (!_deps) return;
    var profile = null;
    try {
      if (window.KCAPI && typeof window.KCAPI.getCurrentUser === 'function') {
        _deps.setUser(await window.KCAPI.getCurrentUser());
      }
    } catch (_) { _deps.setUser(null); }

    try {
      if (window.KCAPI && typeof window.KCAPI.getMyProfile === 'function') {
        profile = await window.KCAPI.getMyProfile();
      }
    } catch (_) { profile = null; }

    if (!profile) {
      try {
        if (window.KCProfiles && typeof window.KCProfiles.getCurrentProfile === 'function') {
          profile = window.KCProfiles.getCurrentProfile();
        }
      } catch (_) { profile = null; }
    }

    _deps.setProfile(profile || null);
    applyCommentComposerSessionState(_deps.getUser(), _deps.getProfile());
    var currentPost = _deps.getPost();
    if (currentPost) {
      _deps.setCTA(currentPost);
      _deps.setSeller(currentPost);
      _deps.resumeContact(currentPost);
    }
  }

  // ── renderPost ───────────────────────────────────────────────────────────────

  function renderPost(post) {
    if (!_deps) return;
    _deps.setPost(post);
    window.kcCurrentPostContext = post;
    document.body.setAttribute('data-post-module', String(post && (post.modulo || post.module) || ''));
    document.body.setAttribute('data-post-category', String(post && (post._kcTabCategoryKey || post.categoriaKey || post.categoria || post.categoryKey || post.category) || ''));
    document.body.setAttribute('data-post-subcategory', String(post && (post.subcategoriaKey || post.subcategoria || post.subcategoryKey || post.subcategory) || ''));
    document.body.setAttribute('data-post-tags', Array.isArray(post && post.tagKeys) ? post.tagKeys.join(' ') : (Array.isArray(post && post.tags) ? post.tags.join(' ') : ''));
    trackHomeCategoryInteraction('post_open', post);

    var R = window._KCProduct.render;
    if (R) {
      R.hide('notFound');
      var postTitleText = post.titulo || post.title || 'Detalhes';
      R.setText('postTitle', postTitleText);
      document.title = postTitleText + ' — KinoCampus';
      R.setOpenGraphTags(post);
      R.setBreadcrumb(post);
      R.setBadges(post);
      R.setGallery(post);
      R.setPrice(post);
      R.setLegacyBanner(post);
      R.setDescription(post);
      R.setSpecs(post);
    }

    _deps.setSeller(post);
    _deps.setCTA(post);

    // v11.30.16: isolamento de falhas — cada sub-feature roda em try/catch próprio
    // para que um bug em uma delas (ex.: calendar com descrição que quebra
    // encodeURIComponent) NUNCA impeça as outras de rodar — especialmente o
    // upsertOwnerActions, que monta os botões admin/owner.

    if (window._KCProduct.calendar && typeof window._KCProduct.calendar.setEventCalendar === 'function') {
      try { window._KCProduct.calendar.setEventCalendar(post); }
      catch (e) { try { console.warn('[KC][product] setEventCalendar falhou:', e); } catch (_) { } }
    }
    if (window._KCProduct.related && typeof window._KCProduct.related.setRelated === 'function') {
      try { window._KCProduct.related.setRelated(post, !!(_deps.getUser() && _deps.getUser().id)); }
      catch (e) { try { console.warn('[KC][product] setRelated falhou:', e); } catch (_) { } }
    }
    if (window._KCProduct.edit && typeof window._KCProduct.edit.upsertOwnerActions === 'function') {
      try {
        window._KCProduct.edit.upsertOwnerActions(post, _deps.getUser(), {
          renderPost: function (p) { return renderPost(p); },
          getCurrentUser: function () { return _deps ? _deps.getUser() : null; },
          getCurrentProfile: function () { return _deps ? _deps.getProfile() : null; },
        });
      } catch (e) { try { console.warn('[KC][product] upsertOwnerActions falhou:', e); } catch (_) { } }
    }
    if (window._KCProduct.analytics && typeof window._KCProduct.analytics.renderAuthorAnalytics === 'function') {
      try {
        window._KCProduct.analytics.renderAuthorAnalytics(post, _deps.getUser(), {
          getCurrentProfile: function () { return _deps ? _deps.getProfile() : null; },
        });
      } catch (e) { try { console.warn('[KC][product] renderAuthorAnalytics falhou:', e); } catch (_) { } }
    }
    if (window._KCProduct.save && typeof window._KCProduct.save.bindSavedActions === 'function') {
      try { window._KCProduct.save.bindSavedActions(post, function () { return _deps ? _deps.getUser() : null; }); }
      catch (e) { try { console.warn('[KC][product] bindSavedActions falhou:', e); } catch (_) { } }
    }
    if (window._KCProduct.save && typeof window._KCProduct.save.refreshSavedState === 'function') {
      window._KCProduct.save.refreshSavedState(post).catch(function () {});
    }
    try { _deps.resumeContact(post); }
    catch (e) { try { console.warn('[KC][product] resumeContact falhou:', e); } catch (_) { } }
    if (window._KCProduct.report && typeof window._KCProduct.report.wireReportButton === 'function') {
      try {
        var reportAuthorId = (window._KCProduct.render && typeof window._KCProduct.render.getPostAuthorId === 'function')
          ? window._KCProduct.render.getPostAuthorId(post)
          : String(post && (post.autorId || post.authorId || post.author_id) || '').trim();
        var reportUser = _deps.getUser ? _deps.getUser() : null;
        window._KCProduct.report.wireReportButton({
          postId: (post && post.uuid) ? post.uuid : post.id,
          postTitle: post.titulo || post.title || 'Publicação',
          postStatus: post.status || post.estado || 'published',
          isOwner: !!(reportUser && reportUser.id && reportAuthorId && String(reportUser.id) === String(reportAuthorId)),
        });
      } catch (e) { try { console.warn('[KC][product] wireReportButton falhou:', e); } catch (_) { } }
    }
  }

  // ── loadPost ─────────────────────────────────────────────────────────────────

  function hasServerRenderedProductContent(id) {
    var titleEl = document.getElementById('postTitle');
    var title = String((titleEl && titleEl.textContent) || '').trim();
    var canonical = document.querySelector('link[rel="canonical"]');
    var ogUrl = document.querySelector('meta[property="og:url"]');
    var robots = document.querySelector('meta[name="robots"]');
    var canonicalHref = String((canonical && canonical.getAttribute('href')) || '');
    var ogUrlContent = String((ogUrl && ogUrl.getAttribute('content')) || '');
    var robotsContent = String((robots && robots.getAttribute('content')) || '').toLowerCase();
    var idText = String(id || '').trim();

    if (!idText || !title || /^Carregando/i.test(title)) return false;
    if (title.toLowerCase().indexOf('não encontrado') !== -1 || title.toLowerCase().indexOf('nao encontrado') !== -1) return false;
    if (robotsContent.indexOf('index,follow') !== 0) return false;
    return canonicalHref.indexOf(idText) !== -1 || ogUrlContent.indexOf(idText) !== -1;
  }

  function preserveServerRenderedProduct(id) {
    var R = window._KCProduct.render;
    if (R && typeof R.hide === 'function') R.hide('notFound');
    window.kcCurrentPostId = id;
    document.body.setAttribute('data-post-id', id);
    loadProductComments(id);
    trackProductViewOnce(null, id);
  }

  async function loadPost() {
    if (!_deps) return;
    var id = _deps.getParam('id');
    var cached;
    var hasSsrContent;
    var renderedCached = false;
    var renderedSignature = '';
    var viewerPromise;
    var fetchPromise;
    var fetched;
    var R3;
    if (!id) {
      var R2 = window._KCProduct.render;
      if (R2) R2.showNotFound();
      return;
    }

    window.kcCurrentPostId = id;
    document.body.setAttribute('data-post-id', id);
    hasSsrContent = hasServerRenderedProductContent(id);

    var author = document.getElementById('commentAuthor');
    var text = document.getElementById('commentText');
    if (author) author.setAttribute('data-post-id', id);
    if (text) text.setAttribute('data-post-id', id);

    cached = getCachedProductDetail(id);
    if (cached && cached.post && !isRenderableProductPost(cached.post)) {
      invalidateProductDetailCache(cached.post || id);
      cached = null;
    }
    viewerPromise = refreshViewerState().catch(function () {});
    fetchPromise = fetchRenderablePost(id).catch(function () { return { error: true }; });

    if (cached && cached.post) {
      applyCurrentPostUuid(cached.post, cached.raw);
      renderedSignature = cached.signature || buildProductSignature(cached.post);
      renderPost(cached.post);
      renderedCached = true;
      loadProductComments(id);
      trackProductViewOnce(cached.post, id);
    }

    await viewerPromise;
    if (renderedCached && _deps.getPost()) {
      renderPost(_deps.getPost());
    }

    fetched = await fetchPromise;
    if (fetched && fetched.error) {
      if (renderedCached) return;
      if (hasSsrContent) {
        preserveServerRenderedProduct(id);
        return;
      }
      R3 = window._KCProduct.render;
      if (R3) R3.showNotFound();
      return;
    }
    if (!fetched || !fetched.post) {
      if (hasSsrContent) {
        preserveServerRenderedProduct(id);
        return;
      }
      invalidateProductDetailCache(id);
      R3 = window._KCProduct.render;
      if (R3) R3.showNotFound();
      return;
    }
    if (!isRenderableProductPost(fetched.post)) {
      invalidateProductDetailCache(fetched.post || id);
      R3 = window._KCProduct.render;
      if (R3) R3.showNotFound();
      return;
    }

    applyCurrentPostUuid(fetched.post, fetched.raw);
    persistProductDetailCache(id, fetched.raw, fetched.post);
    if (!renderedCached || buildProductSignature(fetched.post) !== renderedSignature) {
      renderPost(fetched.post);
    } else {
      _deps.setPost(fetched.post);
      window.kcCurrentPostContext = fetched.post;
    }

    loadProductComments(id);
    trackProductViewOnce(fetched.post, id);
  }

  // ── init ─────────────────────────────────────────────────────────────────────

  function init(deps) {
    _deps = deps;
    if (!_freshnessUnsub && window.KCPostFreshness && typeof window.KCPostFreshness.subscribe === 'function') {
      _freshnessUnsub = window.KCPostFreshness.subscribe(function (change) {
        if (!_deps || !change) return;
        var current = _deps.getPost ? _deps.getPost() : null;
        var currentId = String((current && (current.uuid || current.id || current.legacyId || current.legacy_id)) || window.kcCurrentPostUuid || window.kcCurrentPostId || '').trim();
        var changedIds = [
          change.postId,
          change.uuid,
          change.legacyId,
        ].map(function (value) { return String(value || '').trim(); }).filter(Boolean);
        if (!currentId || changedIds.indexOf(currentId) === -1) return;

        // Counter-only / realtime UPDATEs (votes/views/highlight): patch score, do not remount.
        var changeType = String(change.type || '').trim().toLowerCase();
        var changeSource = String(change.source || '').trim().toLowerCase();
        var isSoftRealtime = (
          changeType === 'metrics_updated'
          || changeType === 'vote_metrics'
          || changeType === 'metrics'
          || (
            (changeType === 'updated' || changeType === '')
            && (
              !changeSource
              || changeSource.indexOf('realtime') !== -1
              || changeSource === 'broadcast'
              || changeSource === 'remote'
            )
          )
        );
        if (isSoftRealtime) {
          try {
            var scoreRaw = (change.votos != null)
              ? change.votos
              : (change.row && change.row.votos != null ? change.row.votos : null);
            if (scoreRaw != null && typeof kcUpdateVoteScoreInDOM === 'function') {
              kcUpdateVoteScoreInDOM(currentId, scoreRaw);
            }
          } catch (_) { /* keep product page stable */ }
          return;
        }

        invalidateProductDetailCache(current || currentId);
        if (change.type === 'soft_deleted' || change.type === 'purged' || change.status === 'deleted' || change.status === 'hidden' || change.status === 'pending') {
          var R = window._KCProduct.render;
          if (R) R.showNotFound();
          return;
        }

        if (_freshnessTimer) clearTimeout(_freshnessTimer);
        _freshnessTimer = window.setTimeout(function () {
          _freshnessTimer = null;
          loadPost();
        }, 120);
      });
    }
  }

  // ── Namespace público ─────────────────────────────────────────────────────────

  window._KCProduct.load = Object.freeze({
    init:                            init,
    isAuthor:                        isAuthor,
    getPostIdForMutation:            getPostIdForMutation,
    trackHomeCategoryInteraction:    trackHomeCategoryInteraction,
    resolveCurrentUserDisplayName:   resolveCurrentUserDisplayName,
    resolveCurrentUserAvatar:        resolveCurrentUserAvatar,
    resolveCurrentUserLogin:         resolveCurrentUserLogin,
    applyCommentComposerSessionState: applyCommentComposerSessionState,
    loadSellerAuthorStats:           loadSellerAuthorStats,
    enrichPostAuthorFromProfile:     enrichPostAuthorFromProfile,
    getCachedProductDetail:          getCachedProductDetail,
    persistProductDetailCache:       persistProductDetailCache,
    invalidateProductDetailCache:    invalidateProductDetailCache,
    refreshViewerState:              refreshViewerState,
    renderPost:                      renderPost,
    loadPost:                        loadPost,
  });

})();

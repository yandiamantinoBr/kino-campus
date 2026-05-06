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

    if (window._KCProduct.calendar && typeof window._KCProduct.calendar.setEventCalendar === 'function') {
      window._KCProduct.calendar.setEventCalendar(post);
    }
    if (window._KCProduct.related && typeof window._KCProduct.related.setRelated === 'function') {
      window._KCProduct.related.setRelated(post, !!(_deps.getUser() && _deps.getUser().id));
    }
    if (window._KCProduct.edit && typeof window._KCProduct.edit.upsertOwnerActions === 'function') {
      window._KCProduct.edit.upsertOwnerActions(post, _deps.getUser(), {
        renderPost: function (p) { return renderPost(p); },
        getCurrentUser: function () { return _deps ? _deps.getUser() : null; },
      });
    }
    if (window._KCProduct.analytics && typeof window._KCProduct.analytics.renderAuthorAnalytics === 'function') {
      window._KCProduct.analytics.renderAuthorAnalytics(post, _deps.getUser());
    }
    if (window._KCProduct.save && typeof window._KCProduct.save.bindSavedActions === 'function') {
      window._KCProduct.save.bindSavedActions(post, function () { return _deps ? _deps.getUser() : null; });
    }
    if (window._KCProduct.save && typeof window._KCProduct.save.refreshSavedState === 'function') {
      window._KCProduct.save.refreshSavedState(post).catch(function () {});
    }
    _deps.resumeContact(post);
    if (window._KCProduct.report && typeof window._KCProduct.report.wireReportButton === 'function') {
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
    }
  }

  // ── loadPost ─────────────────────────────────────────────────────────────────

  async function loadPost() {
    if (!_deps) return;
    var id = _deps.getParam('id');
    if (!id) {
      var R2 = window._KCProduct.render;
      if (R2) R2.showNotFound();
      return;
    }

    window.kcCurrentPostId = id;
    document.body.setAttribute('data-post-id', id);

    var author = document.getElementById('commentAuthor');
    var text = document.getElementById('commentText');
    if (author) author.setAttribute('data-post-id', id);
    if (text) text.setAttribute('data-post-id', id);

    var raw = null;
    try {
      if (window.KCAPI && typeof window.KCAPI.getPostById === 'function') {
        raw = await window.KCAPI.getPostById(id);
      }
    } catch (_) {}

    if (!raw) {
      var R3 = window._KCProduct.render;
      if (R3) R3.showNotFound();
      return;
    }

    await refreshViewerState();

    var post = (window.KCPostModel && typeof window.KCPostModel.from === 'function')
      ? window.KCPostModel.from(raw, { pageModule: (raw && raw.modulo) || '', view: 'product' })
      : ((window.KCAPI && typeof window.KCAPI.normalizePost === 'function') ? window.KCAPI.normalizePost(raw) : raw);

    post = await enrichPostAuthorFromProfile(post);

    var postUuid = (post && post.uuid) ? String(post.uuid) : ((raw && raw.uuid) ? String(raw.uuid) : null);
    window.kcCurrentPostUuid = postUuid;
    if (postUuid) document.body.setAttribute('data-post-uuid', postUuid);

    renderPost(post);

    try {
      var viewPostId = (post && post.uuid) ? post.uuid : (post && post.id);
      if (viewPostId && window.KCAPI && typeof window.KCAPI.trackView === 'function') {
        window.KCAPI.trackView(viewPostId).catch(function () {});
      }
    } catch (_) {}

    if (window.KCLazyLoader && typeof window.KCLazyLoader.load === 'function') {
      var _commentPostId = id;
      window.KCLazyLoader.load('assets/js/features/kc-comments.js', function () {
        if (typeof window.renderComments === 'function') {
          window.renderComments(_commentPostId, 'commentsContainer');
        }
      });
    } else if (typeof window.renderComments === 'function') {
      window.renderComments(id, 'commentsContainer');
    }
  }

  // ── init ─────────────────────────────────────────────────────────────────────

  function init(deps) {
    _deps = deps;
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
    refreshViewerState:              refreshViewerState,
    renderPost:                      renderPost,
    loadPost:                        loadPost,
  });

})();

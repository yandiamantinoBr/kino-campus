(function () {
  'use strict';

  window._KCPR = window._KCPR || {};

  function getState(deps) {
    return (deps && deps.state && typeof deps.state === 'object') ? deps.state : {};
  }

  function select(deps, selector) {
    if (deps && typeof deps.$ === 'function') return deps.$(selector);
    if (typeof document !== 'undefined' && document && typeof document.querySelector === 'function') {
      return document.querySelector(selector);
    }
    return null;
  }

  function selectAll(deps, selector) {
    if (deps && typeof deps.$$ === 'function') return deps.$$(selector);
    if (typeof document !== 'undefined' && document && typeof document.querySelectorAll === 'function') {
      return Array.from(document.querySelectorAll(selector));
    }
    return [];
  }

  function createDomElement(tagName) {
    if (typeof document !== 'undefined' && document && typeof document.createElement === 'function') {
      return document.createElement(tagName);
    }
    return null;
  }

  function getPresentation() {
    return (window._KCPR && window._KCPR.presentation) ? window._KCPR.presentation : null;
  }

  function getClient(deps) {
    if (deps && typeof deps.getClient === 'function') return deps.getClient();
    if (window.KCSupabase && typeof window.KCSupabase.getClient === 'function') {
      return window.KCSupabase.getClient();
    }
    return null;
  }

  function getPageSize(deps) {
    return Math.max(1, Number(deps && deps.pageSize) || 12);
  }

  function getCommentPageSize(deps) {
    return Math.max(1, Number(deps && deps.commentPageSize) || 15);
  }

  function _esc(value, deps) {
    if (deps && typeof deps.esc === 'function') return deps.esc(value);
    var presentation = getPresentation();
    if (presentation && typeof presentation.esc === 'function') return presentation.esc(value);
    return String(value == null ? '' : value);
  }

  function _fmtRelative(value, deps) {
    if (deps && typeof deps.fmtRelative === 'function') return deps.fmtRelative(value);
    var presentation = getPresentation();
    if (presentation && typeof presentation.fmtRelative === 'function') return presentation.fmtRelative(value);
    return String(value || '');
  }

  function _buildPostDetailHref(value, deps) {
    if (deps && typeof deps.buildPostDetailHref === 'function') return deps.buildPostDetailHref(value);
    var presentation = getPresentation();
    if (presentation && typeof presentation.buildPostDetailHref === 'function') {
      return presentation.buildPostDetailHref(value);
    }
    var normalized = String(value || '').trim();
    return normalized ? ('product.html?id=' + encodeURIComponent(normalized)) : '';
  }

  function _statusBadge(value, deps) {
    if (deps && typeof deps.statusBadge === 'function') return deps.statusBadge(value);
    var presentation = getPresentation();
    if (presentation && typeof presentation.statusBadge === 'function') return presentation.statusBadge(value);
    return '';
  }

  function _visibilityBadge(value, deps) {
    if (deps && typeof deps.visibilityBadge === 'function') return deps.visibilityBadge(value);
    var presentation = getPresentation();
    if (presentation && typeof presentation.visibilityBadge === 'function') return presentation.visibilityBadge(value);
    return '';
  }

  function _normalizeSaveKinds(value, deps) {
    if (deps && typeof deps.normalizeSaveKinds === 'function') return deps.normalizeSaveKinds(value);
    var presentation = getPresentation();
    if (presentation && typeof presentation.normalizeSaveKinds === 'function') return presentation.normalizeSaveKinds(value);
    var list = Array.isArray(value) ? value : (value ? [value] : []);
    return list.map(function (item) { return String(item || '').trim().toLowerCase(); }).filter(Boolean);
  }

  function _buildSaveBadges(value, deps) {
    if (deps && typeof deps.buildSaveBadges === 'function') return deps.buildSaveBadges(value);
    var presentation = getPresentation();
    if (presentation && typeof presentation.buildSaveBadges === 'function') return presentation.buildSaveBadges(value);
    return '';
  }

  function _buildRatingStars(value, deps) {
    if (deps && typeof deps.buildRatingStars === 'function') return deps.buildRatingStars(value);
    var presentation = getPresentation();
    if (presentation && typeof presentation.buildRatingStars === 'function') return presentation.buildRatingStars(value);
    return '';
  }

  function _linkifyBio(value, deps) {
    if (deps && typeof deps.linkifyBio === 'function') return deps.linkifyBio(value);
    var presentation = getPresentation();
    if (presentation && typeof presentation.linkifyBio === 'function') return presentation.linkifyBio(value);
    return _esc(value, deps);
  }

  function _setBadgeCount(selector, count, deps) {
    if (deps && typeof deps.setBadgeCount === 'function') {
      deps.setBadgeCount(selector, count);
      return;
    }
    var presentation = getPresentation();
    if (presentation && typeof presentation.setBadgeCount === 'function') {
      presentation.setBadgeCount(selector, count, deps || {});
    }
  }

  function _loadRatings(reset, deps) {
    if (deps && typeof deps.loadRatings === 'function') return deps.loadRatings(reset);
    return Promise.resolve();
  }

  function renderInlineRichText(text, deps) {
    var source = String(text || '').trim();
    if (!source) return '';
    if (typeof window.renderCommentMarkdownInline === 'function') {
      return window.renderCommentMarkdownInline(source);
    }
    return _linkifyBio(source, deps);
  }

  function renderPosts(items, append, deps) {
    var state = getState(deps);
    var list = select(deps, '#posts-list');
    var empty = select(deps, '#posts-empty');
    var loadMore = select(deps, '#posts-load-more');
    if (!list) return;

    if (!append) list.innerHTML = '';

    if (!Array.isArray(items) || !items.length) {
      if (!append && empty) empty.style.display = 'block';
      if (loadMore) loadMore.style.display = 'none';
      return;
    }

    if (empty) empty.style.display = 'none';

    items.forEach(function (post) {
      var link = createDomElement('a');
      if (!link) return;
      var isLegacy = !!String((post && (post.legacy_id || post.legacyId)) || '').trim();
      var meta = [];
      link.className = 'kc-profile-post-card' + (isLegacy ? ' kc-profile-post-card--example' : '');
      link.href = _buildPostDetailHref(post && (post.uuid || post.id || ''), deps);
      meta.push(_statusBadge((post && post.status) || 'published', deps));
      if (!state.isPublicView) meta.push(_visibilityBadge((post && post.visibility) || 'public', deps));
      if (post && post.module) meta.push('<span><i class="fas fa-layer-group"></i> ' + _esc(post.module, deps) + '</span>');
      if (post && post.category) meta.push('<span>' + _esc(post.category, deps) + '</span>');
      if (post && post.created_at) meta.push('<span><i class="fas fa-clock"></i> ' + _esc(_fmtRelative(post.created_at, deps), deps) + '</span>');
      if (isLegacy) meta.push('<span class="kc-badge kc-badge--example"><i class="fas fa-flask"></i> Exemplo</span>');
      link.innerHTML = [
        '<div class="kc-profile-post-card__title">' + _esc((post && post.title) || 'Sem t\u00edtulo', deps) + '</div>',
        '<div class="kc-profile-post-card__meta">' + meta.join('') + '</div>'
      ].join('');
      if (typeof list.appendChild === 'function') list.appendChild(link);
    });

    if (loadMore) loadMore.style.display = state.postHasMore ? 'block' : 'none';
  }

  async function loadPosts(reset, deps) {
    var state = getState(deps);
    var loading = select(deps, '#posts-loading');
    var empty = select(deps, '#posts-empty');
    var loadMore = select(deps, '#posts-load-more');
    if (reset) {
      state.postPage = 1;
      state.posts = [];
      var list = select(deps, '#posts-list');
      if (list) list.innerHTML = '';
    }

    if (loading) loading.style.display = 'block';
    if (empty) empty.style.display = 'none';
    if (loadMore) loadMore.style.display = 'none';

    try {
      var params = { page: state.postPage, limit: getPageSize(deps) };
      if (!state.isPublicView && state.postStatus) params.status = state.postStatus;
      var batch = state.isPublicView
        ? await window.KCAPI.getPostsByAuthorId(state.profileId, params)
        : await window.KCAPI.getMyPosts(params);
      var items = Array.isArray(batch) ? batch : [];
      state.posts = reset ? items : state.posts.concat(items);
      state.postHasMore = items.length >= getPageSize(deps);
      renderPosts(reset ? state.posts : items, !reset, deps);
    } catch (error) {
      console.warn('[Profile] loadPosts:', error);
      if (empty) empty.style.display = 'block';
    } finally {
      if (loading) loading.style.display = 'none';
    }
  }

  function renderComments(items, append, deps) {
    var state = getState(deps);
    var list = select(deps, '#comments-list');
    var empty = select(deps, '#comments-empty');
    var loadMore = select(deps, '#comments-load-more');
    if (!list) return;

    if (!append) list.innerHTML = '';

    if (!Array.isArray(items) || !items.length) {
      if (!append && empty) empty.style.display = 'block';
      if (loadMore) loadMore.style.display = 'none';
      return;
    }

    if (empty) empty.style.display = 'none';

    items.forEach(function (comment) {
      var card = createDomElement('div');
      if (!card) return;
      var post = (comment && comment.post) || {};
      var postTitle = post.title || post.titulo || 'Post';
      var postId = post.legacy_id || post.id || (comment && comment.post_id) || '';
      var postUrl = _buildPostDetailHref(postId, deps);
      card.className = 'kc-profile-comment-card';
      card.innerHTML = [
        '<div class="kc-profile-comment-card__body">' + renderInlineRichText(comment && comment.body || '', deps) + '</div>',
        '<div class="kc-profile-comment-card__meta">',
        '<span><i class="fas fa-clock"></i> ' + _esc(_fmtRelative(comment && comment.created_at, deps), deps) + '</span>',
        postUrl ? '<span>em <a class="kc-profile-comment-card__post-link" href="' + _esc(postUrl, deps) + '">' + _esc(postTitle, deps) + '</a></span>' : '',
        '</div>'
      ].join('');
      if (typeof list.appendChild === 'function') list.appendChild(card);
    });

    if (loadMore) loadMore.style.display = state.commentHasMore ? 'block' : 'none';
  }

  async function fetchPostsByIds(client, postIds) {
    var ids = Array.from(new Set((Array.isArray(postIds) ? postIds : [])
      .map(function (value) { return String(value || '').trim(); })
      .filter(Boolean)));

    if (!client || !ids.length) return Object.create(null);

    var postsById = Object.create(null);
    var chunkSize = 50;

    for (var index = 0; index < ids.length; index += chunkSize) {
      var batch = ids.slice(index, index + chunkSize);
      try {
        var result = await client
          .from('posts')
          .select('id, legacy_id, title')
          .in('id', batch);

        if (result && result.error) {
          console.warn('[Profile] fetchPostsByIds:', result.error);
          continue;
        }

        (Array.isArray(result && result.data) ? result.data : []).forEach(function (post) {
          if (!post || !post.id) return;
          var normalizedPost = Object.assign({}, post, {
            titulo: post.title || ''
          });
          postsById[String(post.id)] = normalizedPost;
          if (post.legacy_id) postsById[String(post.legacy_id)] = normalizedPost;
        });
      } catch (error) {
        console.warn('[Profile] fetchPostsByIds:', error);
      }

      var missing = batch.filter(function (id) { return !postsById[String(id)]; });
      if (!missing.length) continue;

      try {
        var legacyResult = await client
          .from('posts')
          .select('id, legacy_id, title')
          .in('legacy_id', missing);

        if (legacyResult && legacyResult.error) {
          console.warn('[Profile] fetchPostsByIds legacy:', legacyResult.error);
          continue;
        }

        (Array.isArray(legacyResult && legacyResult.data) ? legacyResult.data : []).forEach(function (post) {
          if (!post || !post.id) return;
          var normalizedPost = Object.assign({}, post, {
            titulo: post.title || ''
          });
          postsById[String(post.id)] = normalizedPost;
          if (post.legacy_id) postsById[String(post.legacy_id)] = normalizedPost;
        });
      } catch (error) {
        console.warn('[Profile] fetchPostsByIds legacy:', error);
      }
    }

    return postsById;
  }

  async function loadProfileComments(client, authorId, options) {
    if (!client || !authorId) return [];

    var query = client
      .from('comments')
      .select('id, created_at, body, post_id')
      .eq('author_id', authorId)
      .order('created_at', { ascending: false });

    if (options && Number.isInteger(options.from) && Number.isInteger(options.to)) {
      query = query.range(options.from, options.to);
    } else if (options && Number.isInteger(options.limit)) {
      query = query.limit(options.limit);
    }

    var result = await query;
    if (result && result.error) throw result.error;

    var comments = Array.isArray(result && result.data) ? result.data : [];
    var postsById = await fetchPostsByIds(client, comments.map(function (comment) {
      return comment && comment.post_id;
    }));

    return comments.map(function (comment) {
      var postId = String((comment && comment.post_id) || '').trim();
      return Object.assign({}, comment, {
        post: postsById[postId] || null
      });
    });
  }

  async function loadComments(reset, deps) {
    var state = getState(deps);
    var loading = select(deps, '#comments-loading');
    var empty = select(deps, '#comments-empty');
    var loadMore = select(deps, '#comments-load-more');

    if (reset) {
      state.commentPage = 1;
      state.comments = [];
      var list = select(deps, '#comments-list');
      if (list) list.innerHTML = '';
    }

    if (loading) loading.style.display = 'block';
    if (empty) empty.style.display = 'none';
    if (loadMore) loadMore.style.display = 'none';

    var client = getClient(deps);
    var authorId = state.profileId || (state.user && state.user.id);
    if (!client || !authorId) {
      if (loading) loading.style.display = 'none';
      return;
    }

    try {
      var commentPageSize = getCommentPageSize(deps);
      var from = (state.commentPage - 1) * commentPageSize;
      var to = from + commentPageSize - 1;
      var payload = await loadProfileComments(client, authorId, { from: from, to: to });
      state.comments = reset ? payload : state.comments.concat(payload);
      state.commentHasMore = payload.length >= commentPageSize;
      renderComments(reset ? state.comments : payload, !reset, deps);
    } catch (error) {
      console.warn('[Profile] loadComments:', error);
      if (empty) empty.style.display = 'block';
    } finally {
      if (loading) loading.style.display = 'none';
    }
  }

  function renderSaved(items, append, deps) {
    var state = getState(deps);
    var list = select(deps, '#saved-list');
    var empty = select(deps, '#saved-empty');
    var loadMore = select(deps, '#saved-load-more');
    if (!list) return;

    if (!append) list.innerHTML = '';

    if (!Array.isArray(items) || !items.length) {
      if (!append && empty) empty.style.display = 'block';
      if (loadMore) loadMore.style.display = 'none';
      return;
    }

    if (empty) empty.style.display = 'none';

    items.forEach(function (item) {
      var link = createDomElement('a');
      if (!link) return;
      var saveKinds = _normalizeSaveKinds((item && (item.save_kinds || item.save_kind)) || (state.isPublicView ? ['highlight'] : []), deps);
      var badges = _buildSaveBadges(saveKinds, deps);
      var savedAt = (item && (item.saved_at || item.created_at)) || null;
      var meta = [];
      if (!state.isPublicView) meta.push(_statusBadge((item && item.status) || 'published', deps));
      if (!state.isPublicView) meta.push(_visibilityBadge((item && item.visibility) || 'public', deps));
      if (badges) meta.push(badges);
      if (item && item.module) meta.push('<span><i class="fas fa-layer-group"></i> ' + _esc(item.module, deps) + '</span>');
      if (item && item.category) meta.push('<span>' + _esc(item.category, deps) + '</span>');
      if (savedAt) meta.push('<span><i class="fas fa-clock"></i> ' + _esc(_fmtRelative(savedAt, deps), deps) + '</span>');
      link.className = 'kc-profile-post-card';
      link.href = _buildPostDetailHref(item && (item.uuid || item.id || ''), deps);
      link.innerHTML = [
        '<div class="kc-profile-post-card__title">' + _esc((item && item.title) || 'Sem t\u00edtulo', deps) + '</div>',
        '<div class="kc-profile-post-card__meta">' + meta.join('') + '</div>'
      ].join('');
      if (typeof list.appendChild === 'function') list.appendChild(link);
    });

    if (loadMore) loadMore.style.display = state.savedHasMore ? 'block' : 'none';
  }

  async function loadSaved(reset, deps) {
    var state = getState(deps);
    var loading = select(deps, '#saved-loading');
    var empty = select(deps, '#saved-empty');
    var loadMore = select(deps, '#saved-load-more');

    if (reset) {
      state.savedPage = 1;
      state.savedItems = [];
      var list = select(deps, '#saved-list');
      if (list) list.innerHTML = '';
    }

    if (loading) loading.style.display = 'block';
    if (empty) empty.style.display = 'none';
    if (loadMore) loadMore.style.display = 'none';

    try {
      var params = { page: state.savedPage, limit: getPageSize(deps) };
      if (!state.isPublicView && state.savedKind) params.kind = state.savedKind;
      var batch = state.isPublicView
        ? await window.KCAPI.getProfileHighlights(state.profileId, params)
        : await window.KCAPI.getMySavedPosts(params);
      var items = Array.isArray(batch) ? batch : [];
      state.savedItems = reset ? items : state.savedItems.concat(items);
      state.savedHasMore = items.length >= getPageSize(deps);
      renderSaved(reset ? state.savedItems : items, !reset, deps);
    } catch (error) {
      console.warn('[Profile] loadSaved:', error);
      if (empty) empty.style.display = 'block';
    } finally {
      if (loading) loading.style.display = 'none';
    }
  }

  async function loadSavedBadgeCount(authorId, deps) {
    var state = getState(deps);
    if (!window.KCAPI || !authorId) return;
    try {
      var count = state.isPublicView
        ? await window.KCAPI.getProfileHighlightsCount(authorId)
        : await window.KCAPI.getMySavedPostsCount({});
      _setBadgeCount('#badge-saved', count, deps);
    } catch (error) {
      console.warn('[Profile] loadSavedBadgeCount:', error);
    }
  }

  async function loadActivities(deps) {
    var state = getState(deps);
    var loading = select(deps, '#activities-loading');
    var list = select(deps, '#activities-list');
    var empty = select(deps, '#activities-empty');
    if (loading) loading.style.display = 'block';
    if (list) list.innerHTML = '';
    if (empty) empty.style.display = 'none';

    var client = getClient(deps);
    var authorId = state.profileId || (state.user && state.user.id);
    var activities = [];

    try {
      var recentPosts = state.isPublicView
        ? await window.KCAPI.getPostsByAuthorId(authorId, { page: 1, limit: 8 })
        : await window.KCAPI.getMyPosts({ page: 1, limit: 8 });
      (Array.isArray(recentPosts) ? recentPosts : []).forEach(function (post) {
        activities.push({
          type: 'post',
          date: post.created_at,
          title: post.title || 'Sem t\u00edtulo',
          postId: post.uuid || post.id || '',
          status: post.status || 'published'
        });
      });
    } catch (_) { }

    if (client && authorId) {
      try {
        var commentPayload = await loadProfileComments(client, authorId, { limit: 8 });
        commentPayload.forEach(function (comment) {
          var post = comment.post || {};
          var hasPost = !!(post && (post.id || post.legacy_id));
          activities.push({
            type: 'comment',
            date: comment.created_at,
            body: String(comment.body || '').slice(0, 120),
            title: hasPost ? (post.title || post.titulo || 'Publica\u00e7\u00e3o') : 'Publica\u00e7\u00e3o removida ou indispon\u00edvel',
            postId: hasPost ? (post.legacy_id || post.id || comment.post_id || '') : '',
            postAvailable: hasPost
          });
        });
      } catch (_) { }
    }

    activities.sort(function (left, right) {
      return new Date(right.date) - new Date(left.date);
    });
    if (loading) loading.style.display = 'none';

    if (!activities.length) {
      if (empty) empty.style.display = 'block';
      return;
    }

    if (list) {
      list.innerHTML = activities.slice(0, 20).map(function (item) {
        var postUrl = item.postAvailable === false ? '' : _buildPostDetailHref(item.postId || '', deps);
        if (item.type === 'post') {
          return [
            '<div class="kc-profile-activity-item">',
            '<div class="kc-profile-activity-icon"><i class="fas fa-newspaper"></i></div>',
            '<div class="kc-profile-activity-content">',
            '<div class="kc-profile-activity-label">Publicou <a href="' + _esc(postUrl, deps) + '">' + _esc(item.title, deps) + '</a> ' + _statusBadge(item.status, deps) + '</div>',
            '<div class="kc-profile-activity-meta">' + _esc(_fmtRelative(item.date, deps), deps) + '</div>',
            '</div>',
            '</div>'
          ].join('');
        }

        var rawPreview = String(item.body || '').trim();
        var bodyPreview = rawPreview.length > 120 ? (rawPreview.slice(0, 120) + '...') : rawPreview;
        var preview = bodyPreview
          ? '<div class="kc-profile-activity-meta kc-profile-activity-meta--excerpt">' + renderInlineRichText(bodyPreview, deps) + '</div>'
          : '';
        return [
          '<div class="kc-profile-activity-item">',
          '<div class="kc-profile-activity-icon"><i class="fas fa-comment"></i></div>',
          '<div class="kc-profile-activity-content">',
          '<div class="kc-profile-activity-label">Comentou em ' + (postUrl ? '<a href="' + _esc(postUrl, deps) + '">' + _esc(item.title, deps) + '</a>' : '<span>' + _esc(item.title, deps) + '</span>') + '</div>',
          preview,
          '<div class="kc-profile-activity-meta" style="margin-top:4px;">' + _esc(_fmtRelative(item.date, deps), deps) + '</div>',
          '</div>',
          '</div>'
        ].join('');
      }).join('');
    }
  }

  function switchTab(tabId, deps) {
    var state = getState(deps);
    state.activeTab = String(tabId || 'activities');

    selectAll(deps, '.kc-profile-tab').forEach(function (button) {
      var active = button && typeof button.getAttribute === 'function' && button.getAttribute('data-kc-tab') === state.activeTab;
      if (button && button.classList && typeof button.classList.toggle === 'function') {
        button.classList.toggle('active', active);
      }
      if (button && typeof button.setAttribute === 'function') {
        button.setAttribute('aria-selected', active ? 'true' : 'false');
      }
    });

    selectAll(deps, '.kc-profile-tab-panel').forEach(function (panel) {
      if (panel && panel.classList && typeof panel.classList.toggle === 'function') {
        panel.classList.toggle('active', panel.id === ('tab-' + state.activeTab));
      }
    });

    if (state.activeTab === 'posts' && !state.posts.length) loadPosts(true, deps);
    if (state.activeTab === 'comments' && !state.comments.length) loadComments(true, deps);
    if (state.activeTab === 'saved' && !state.savedItems.length) loadSaved(true, deps);
    if (state.activeTab === 'ratings' && !state.ratings.length) _loadRatings(true, deps);
  }

  function bindTabsAndLists(deps) {
    var state = getState(deps);
    selectAll(deps, '[data-kc-tab]').forEach(function (button) {
      if (button && typeof button.addEventListener === 'function') {
        button.addEventListener('click', function () {
          switchTab(button.getAttribute('data-kc-tab'), deps);
        });
      }
    });

    var postsStatus = select(deps, '#profile-posts-status');
    if (postsStatus && typeof postsStatus.addEventListener === 'function') {
      postsStatus.addEventListener('change', function (event) {
        state.postStatus = String(event && event.target && event.target.value || '').trim().toLowerCase();
        loadPosts(true, deps);
      });
    }

    var savedKind = select(deps, '#profile-saved-kind');
    if (savedKind && typeof savedKind.addEventListener === 'function') {
      savedKind.addEventListener('change', function (event) {
        state.savedKind = String(event && event.target && event.target.value || '').trim().toLowerCase();
        loadSaved(true, deps);
      });
    }

    var postsMore = select(deps, '#posts-load-more');
    if (postsMore && typeof postsMore.addEventListener === 'function') {
      postsMore.addEventListener('click', function () {
        state.postPage += 1;
        loadPosts(false, deps);
      });
    }

    var commentsMore = select(deps, '#comments-load-more');
    if (commentsMore && typeof commentsMore.addEventListener === 'function') {
      commentsMore.addEventListener('click', function () {
        state.commentPage += 1;
        loadComments(false, deps);
      });
    }

    var savedMore = select(deps, '#saved-load-more');
    if (savedMore && typeof savedMore.addEventListener === 'function') {
      savedMore.addEventListener('click', function () {
        state.savedPage += 1;
        loadSaved(false, deps);
      });
    }

    var ratingsMore = select(deps, '#ratings-load-more');
    if (ratingsMore && typeof ratingsMore.addEventListener === 'function') {
      ratingsMore.addEventListener('click', function () {
        state.ratingPage += 1;
        _loadRatings(false, deps);
      });
    }
  }

  window._KCPR.collections = Object.freeze({
    bindTabsAndLists: bindTabsAndLists,
    loadActivities: loadActivities,
    loadComments: loadComments,
    loadPosts: loadPosts,
    loadSaved: loadSaved,
    loadSavedBadgeCount: loadSavedBadgeCount,
    renderComments: renderComments,
    renderInlineRichText: renderInlineRichText,
    renderPosts: renderPosts,
    renderSaved: renderSaved,
    switchTab: switchTab
  });
})();

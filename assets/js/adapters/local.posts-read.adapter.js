/* KinoCampus - Local Posts Read Adapter */
(function () {
  'use strict';

  window._KCLA = window._KCLA || {};

  function getConfig(deps) {
    if (deps && deps.config && typeof deps.config === 'object') return deps.config;
    return (window.KCAPI && window.KCAPI.config && typeof window.KCAPI.config === 'object')
      ? window.KCAPI.config
      : {};
  }

  function getFetchJSON(deps) {
    if (deps && typeof deps.fetchJSON === 'function') return deps.fetchJSON;
    if (window.KCAPI && typeof window.KCAPI.fetchJSON === 'function') return window.KCAPI.fetchJSON;
    return async function () { return { anuncios: [] }; };
  }

  function getApiURL(deps) {
    if (deps && typeof deps.apiURL === 'function') return deps.apiURL;
    if (window.KCAPI && typeof window.KCAPI.apiURL === 'function') return window.KCAPI.apiURL;
    return function (path) { return String(path || ''); };
  }

  function getFilterPosts(deps) {
    if (deps && typeof deps.filterPosts === 'function') return deps.filterPosts;
    if (window.KCAPI && typeof window.KCAPI.filterPosts === 'function') return window.KCAPI.filterPosts;
    return function (posts) { return Array.isArray(posts) ? posts : []; };
  }

  function getNormalizePost(deps) {
    if (deps && typeof deps.normalizePost === 'function') return deps.normalizePost;
    if (window.KCAPI && typeof window.KCAPI.normalizePost === 'function') return window.KCAPI.normalizePost;
    return function (post) { return post; };
  }

  function getDatabaseRawLoader(deps) {
    return (deps && typeof deps.getDatabaseRaw === 'function')
      ? deps.getDatabaseRaw
      : async function () { return { anuncios: [] }; };
  }

  function getDatabaseNormalizedLoader(deps) {
    return (deps && typeof deps.getDatabaseNormalized === 'function')
      ? deps.getDatabaseNormalized
      : async function () { return { posts: [] }; };
  }

  function getSearchSharedLoader(deps) {
    return (deps && typeof deps.getSearchShared === 'function')
      ? deps.getSearchShared
      : function () {
          return (typeof window !== 'undefined' && window.KCSearchShared && typeof window.KCSearchShared.searchCollection === 'function')
            ? window.KCSearchShared
            : null;
        };
  }

  function getReadLocalUserPosts(deps) {
    return (deps && typeof deps.readLocalUserPosts === 'function')
      ? deps.readLocalUserPosts
      : function () { return []; };
  }

  function getEnrichPostWithRatings(deps) {
    return (deps && typeof deps.enrichPostWithRatings === 'function')
      ? deps.enrichPostWithRatings
      : function (post) { return post; };
  }

  function getEnrichPostsWithRatings(deps) {
    return (deps && typeof deps.enrichPostsWithRatings === 'function')
      ? deps.enrichPostsWithRatings
      : function (posts) { return Array.isArray(posts) ? posts : []; };
  }

  function getParsePostTime(deps) {
    return (deps && typeof deps.parsePostTime === 'function')
      ? deps.parsePostTime
      : function () { return 0; };
  }

  function getMapPostSummary(deps) {
    return (deps && typeof deps.mapPostSummary === 'function')
      ? deps.mapPostSummary
      : function (post) {
          var source = (post && typeof post === 'object' && !Array.isArray(post)) ? post : {};
          return {
            id: source.id != null ? source.id : (source.uuid || null),
            uuid: source.uuid || null,
            title: String(source.title || source.titulo || 'Sem titulo').trim() || 'Sem titulo',
            created_at: source.created_at || source.createdAt || null,
            status: String(source.status || 'published').trim() || 'published',
            visibility: String(source.visibility || 'public').trim() || 'public',
            module: String(source.module || source.modulo || '').trim(),
            category: String(source.category || source.categoriaKey || source.categoria || '').trim(),
          };
        };
  }

  function getPaginator(deps) {
    return (deps && typeof deps.paginateItems === 'function')
      ? deps.paginateItems
      : function (items, params) {
          var list = Array.isArray(items) ? items : [];
          var page = Math.max(1, Number(params && params.page) || 1);
          var limit = Math.min(50, Math.max(1, Number(params && params.limit) || 12));
          var offset = (page - 1) * limit;
          return {
            page: page,
            limit: limit,
            items: list.slice(offset, offset + limit),
          };
        };
  }

  function getRankRelatedPosts(deps) {
    if (deps && typeof deps.rankRelatedPosts === 'function') return deps.rankRelatedPosts;
    if (window.KCAPI && typeof window.KCAPI.rankRelatedPosts === 'function') return window.KCAPI.rankRelatedPosts;
    return null;
  }

  function getToSlug(deps) {
    return (deps && typeof deps.toSlug === 'function')
      ? deps.toSlug
      : function (value) {
          return String(value || '')
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
        };
  }

  function getMockUsersList(deps) {
    if (deps && Array.isArray(deps.mockUsersList)) return deps.mockUsersList;
    return (window.KCAPI && Array.isArray(window.KCAPI.MOCK_USERS_LIST))
      ? window.KCAPI.MOCK_USERS_LIST
      : [];
  }

  function getMockUsersById(deps) {
    if (deps && deps.mockUsersById && typeof deps.mockUsersById === 'object') return deps.mockUsersById;
    return (window.KCAPI && window.KCAPI.MOCK_USERS_BY_ID && typeof window.KCAPI.MOCK_USERS_BY_ID === 'object')
      ? window.KCAPI.MOCK_USERS_BY_ID
      : {};
  }

  async function getSearchCollection(deps) {
    if (deps && typeof deps.getSearchCollection === 'function') {
      return deps.getSearchCollection();
    }

    var loadDatabaseNormalized = getDatabaseNormalizedLoader(deps);
    var readLocalUserPosts = getReadLocalUserPosts(deps);
    var enrichPostsWithRatings = getEnrichPostsWithRatings(deps);
    var db = await loadDatabaseNormalized();
    var posts = Array.isArray(db && db.posts) ? db.posts : [];
    var userPosts = readLocalUserPosts();
    return enrichPostsWithRatings((Array.isArray(userPosts) ? userPosts : []).concat(posts));
  }

  function normalizeFeedCursorParams(params) {
    var source = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
    var limitRaw = source.limit != null ? parseInt(String(source.limit), 10) : 20;
    var limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 20;
    var cursor = source.cursor != null ? String(source.cursor).trim() : '';
    return Object.assign({}, source, {
      limit: limit,
      cursor: cursor || null,
    });
  }

  function encodeBase64Utf8(value) {
    var input = String(value == null ? '' : value);
    try {
      if (typeof Buffer !== 'undefined') return Buffer.from(input, 'utf8').toString('base64');
    } catch (_) { }

    if (typeof TextEncoder !== 'undefined' && typeof btoa === 'function') {
      var bytes = new TextEncoder().encode(input);
      var binary = '';
      bytes.forEach(function (byte) { binary += String.fromCharCode(byte); });
      return btoa(binary);
    }

    if (typeof btoa === 'function') return btoa(input);
    return input;
  }

  function decodeBase64Utf8(value) {
    var input = String(value == null ? '' : value);
    try {
      if (typeof Buffer !== 'undefined') return Buffer.from(input, 'base64').toString('utf8');
    } catch (_) { }

    if (typeof TextDecoder !== 'undefined' && typeof atob === 'function') {
      var binary = atob(input);
      var bytes = Uint8Array.from(binary, function (char) { return char.charCodeAt(0); });
      return new TextDecoder().decode(bytes);
    }

    if (typeof atob === 'function') return atob(input);
    return input;
  }

  function encodeFeedCursor(offset) {
    return encodeBase64Utf8(JSON.stringify({ offset: Math.max(0, Number(offset) || 0) }));
  }

  function decodeFeedCursor(cursor) {
    if (!cursor) return 0;
    try {
      var decoded = JSON.parse(decodeBase64Utf8(cursor));
      var offset = parseInt(String(decoded && decoded.offset != null ? decoded.offset : 0), 10);
      return Number.isFinite(offset) && offset > 0 ? offset : 0;
    } catch (_) {
      return 0;
    }
  }

  async function getFeedCursor(params, deps) {
    var config = getConfig(deps);
    var loadDatabaseNormalized = getDatabaseNormalizedLoader(deps);
    var filterPosts = getFilterPosts(deps);
    var enrichPostsWithRatings = getEnrichPostsWithRatings(deps);
    var fetchJSON = getFetchJSON(deps);
    var apiURL = getApiURL(deps);
    var normalizedParams = normalizeFeedCursorParams(params);

    if (!config.baseURL) {
      var db = await loadDatabaseNormalized();
      var filtered = typeof filterPosts === 'function'
        ? filterPosts(db.posts, normalizedParams)
        : (db.posts || []);
      var rows = Array.isArray(filtered) ? filtered : [];
      var offset = decodeFeedCursor(normalizedParams.cursor);
      var nextOffset = Math.max(0, offset);
      var posts = enrichPostsWithRatings(rows.slice(nextOffset, nextOffset + normalizedParams.limit));
      var hasMore = (nextOffset + posts.length) < rows.length;

      try {
        console.debug('[KCAPI:local] Serving cursor slice from ' + nextOffset + ' (' + posts.length + ' items) [limit=' + normalizedParams.limit + ']');
      } catch (_) { }

      return {
        posts: posts,
        nextCursor: hasMore ? encodeFeedCursor(nextOffset + posts.length) : null,
        hasMore: hasMore,
      };
    }

    var q = new URLSearchParams();
    Object.entries(normalizedParams || {}).forEach(function (entry) {
      var key = entry[0];
      var value = entry[1];
      if (value == null || value === '') return;
      if (Array.isArray(value)) {
        if (!value.length) return;
        q.set(key, JSON.stringify(value));
        return;
      }
      q.set(key, String(value));
    });
    return fetchJSON(apiURL('feed-cursor?' + q.toString()));
  }

  async function getPosts(params, deps) {
    var config = getConfig(deps);
    var loadDatabaseNormalized = getDatabaseNormalizedLoader(deps);
    var filterPosts = getFilterPosts(deps);
    var enrichPostsWithRatings = getEnrichPostsWithRatings(deps);
    var fetchJSON = getFetchJSON(deps);
    var apiURL = getApiURL(deps);

    if (!config.baseURL) {
      var db = await loadDatabaseNormalized();
      var filtered = typeof filterPosts === 'function'
        ? filterPosts(db.posts, params)
        : (db.posts || []);
      var source = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
      var pageRaw = source.page != null ? parseInt(String(source.page), 10) : 1;
      var limitRaw = source.limit != null ? parseInt(String(source.limit), 10) : 20;
      var page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
      var limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 20;
      var start = (page - 1) * limit;
      var end = start + limit;
      var slice = Array.isArray(filtered)
        ? enrichPostsWithRatings(filtered.slice(start, end))
        : [];

      try {
        console.debug('[KCAPI:local] Serving page ' + page + ' (' + slice.length + ' items) [limit=' + limit + ']');
      } catch (_) { }

      return slice;
    }

    var q = new URLSearchParams();
    Object.entries(params || {}).forEach(function (entry) {
      var key = entry[0];
      var value = entry[1];
      if (value == null || value === '') return;
      q.set(key, String(value));
    });
    return fetchJSON(apiURL('posts?' + q.toString()));
  }

  async function searchPosts(params, deps) {
    var config = getConfig(deps);
    var loadSearchShared = getSearchSharedLoader(deps);
    var fetchJSON = getFetchJSON(deps);
    var apiURL = getApiURL(deps);

    if (!config.baseURL) {
      var searchShared = loadSearchShared();
      if (!searchShared) {
        return getPosts(params, deps);
      }

      var collection = await getSearchCollection(deps);
      return searchShared.searchCollection(collection, params);
    }

    var q = new URLSearchParams();
    Object.entries(params || {}).forEach(function (entry) {
      var key = entry[0];
      var value = entry[1];
      if (value == null || value === '') return;
      q.set(key, String(value));
    });
    return fetchJSON(apiURL('search?' + q.toString()));
  }

  async function getPostById(id, deps) {
    var key = String(id || '').trim();
    var config = getConfig(deps);
    var fetchJSON = getFetchJSON(deps);
    var apiURL = getApiURL(deps);
    var readLocalUserPosts = getReadLocalUserPosts(deps);
    var loadDatabaseRaw = getDatabaseRawLoader(deps);
    var enrichPostWithRatings = getEnrichPostWithRatings(deps);

    if (!key) return null;

    if (config.baseURL) {
      try {
        return await fetchJSON(apiURL('posts/' + encodeURIComponent(key)));
      } catch (_) {
        try {
          var posts = await getPosts({}, deps);
          return posts.find(function (post) {
            var postId = (post && (post.id != null ? post.id : (post._id != null ? post._id : (post.legacy_id != null ? post.legacy_id : (post.legacyId != null ? post.legacyId : post.uuid))))) || null;
            return postId != null && String(postId) === key;
          }) || null;
        } catch (_) { }
        return null;
      }
    }

    try {
      var localPosts = readLocalUserPosts();
      if (Array.isArray(localPosts)) {
        var localFound = localPosts.find(function (post) {
          var postId = (post && (post.id != null ? post.id : (post._id != null ? post._id : (post.legacy_id != null ? post.legacy_id : (post.legacyId != null ? post.legacyId : post.uuid))))) || null;
          return postId != null && String(postId) === key;
        });
        if (localFound) return enrichPostWithRatings(localFound);
      }
    } catch (_) { }

    try {
      var db = await loadDatabaseRaw();
      var items = Array.isArray(db.anuncios) ? db.anuncios : (Array.isArray(db.posts) ? db.posts : []);
      var found = items.find(function (item) {
        var postId = (item && (item.id != null ? item.id : (item._id != null ? item._id : (item.legacy_id != null ? item.legacy_id : (item.legacyId != null ? item.legacyId : item.uuid))))) || null;
        if (postId != null && String(postId) === key) return true;
        var legacyId = (item && (item.legacy_id != null ? item.legacy_id : item.legacyId)) || null;
        return legacyId != null && String(legacyId) === key;
      });
      if (found) return enrichPostWithRatings(found);
    } catch (_) { }

    return null;
  }

  async function getRelatedPosts(postId, options, deps) {
    var current = await getPostById(postId, deps);
    var loadDatabaseNormalized = getDatabaseNormalizedLoader(deps);
    var readLocalUserPosts = getReadLocalUserPosts(deps);
    var normalizePost = getNormalizePost(deps);
    var enrichPostsWithRatings = getEnrichPostsWithRatings(deps);
    var rankRelatedPosts = getRankRelatedPosts(deps);
    var opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    var limit = Math.min(12, Math.max(1, Number(opts.limit) || 8));
    var viewerAuthenticated = opts.viewerAuthenticated !== false;

    if (!current) return [];

    var currentAuthor = String(current.authorId || current.autorId || current.author_id || '').trim();
    var currentModule = String(current.modulo || current.module || '').trim();
    var db = await loadDatabaseNormalized();
    var dbItems = Array.isArray(db && db.posts) ? db.posts : [];
    var localItems = readLocalUserPosts();

    var candidates = dbItems.concat(Array.isArray(localItems) ? localItems : []).filter(function (item) {
      if (!item) return false;
      var candidateId = String(item.uuid || item.id || '').trim();
      var currentId = String(current.uuid || current.id || '').trim();
      if (candidateId && currentId && candidateId === currentId) return false;
      if (String(item.status || 'published').trim().toLowerCase() !== 'published') return false;
      var visibility = String(item.visibility || 'public').trim().toLowerCase();
      if (!viewerAuthenticated && visibility !== 'public') return false;
      return true;
    });

    var ranked = rankRelatedPosts
      ? rankRelatedPosts(current, candidates, { viewerAuthenticated: viewerAuthenticated })
      : candidates;

    var prioritized = ranked.sort(function (left, right) {
      var leftNormalized = normalizePost(left || {});
      var rightNormalized = normalizePost(right || {});
      var leftAuthor = String((leftNormalized && (leftNormalized.authorId || leftNormalized.autorId || leftNormalized.author_id)) || '').trim();
      var rightAuthor = String((rightNormalized && (rightNormalized.authorId || rightNormalized.autorId || rightNormalized.author_id)) || '').trim();
      var leftModule = String((leftNormalized && (leftNormalized.modulo || leftNormalized.module)) || '').trim();
      var rightModule = String((rightNormalized && (rightNormalized.modulo || rightNormalized.module)) || '').trim();

      var leftSameAuthor = leftAuthor && leftAuthor === currentAuthor;
      var rightSameAuthor = rightAuthor && rightAuthor === currentAuthor;
      if (leftSameAuthor !== rightSameAuthor) return leftSameAuthor ? -1 : 1;

      var leftSameModule = leftModule && leftModule === currentModule;
      var rightSameModule = rightModule && rightModule === currentModule;
      if (leftSameModule !== rightSameModule) return leftSameModule ? -1 : 1;

      return Number(right._kcRelatedScore || 0) - Number(left._kcRelatedScore || 0);
    });

    return enrichPostsWithRatings(prioritized.slice(0, limit));
  }

  async function getMyPosts(params, deps) {
    var source = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
    var statusFilter = String(source.status || '').trim().toLowerCase();
    var readLocalUserPosts = getReadLocalUserPosts(deps);
    var parsePostTime = getParsePostTime(deps);
    var mapPostSummary = getMapPostSummary(deps);
    var paginateItems = getPaginator(deps);

    var sorted = readLocalUserPosts()
      .slice()
      .sort(function (left, right) { return parsePostTime(right) - parsePostTime(left); })
      .filter(function (post) {
        if (!statusFilter) return true;
        return String((post && post.status) || 'published').trim().toLowerCase() === statusFilter;
      })
      .map(function (post) { return mapPostSummary(post); });

    return paginateItems(sorted, source).items;
  }

  async function getPostsByAuthorId(authorId, params, deps) {
    var author = String(authorId || '').trim();
    var source = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
    var statusFilter = String(source.status || 'published').trim().toLowerCase();
    var normalizePost = getNormalizePost(deps);
    var parsePostTime = getParsePostTime(deps);
    var mapPostSummary = getMapPostSummary(deps);
    var paginateItems = getPaginator(deps);

    if (!author) return [];

    var collection = await getSearchCollection(deps);
    var items = (Array.isArray(collection) ? collection : [])
      .filter(function (post) {
        var normalized = normalizePost(post || {});
        var currentAuthor = String((normalized && (normalized.authorId || normalized.author_id)) || '').trim();
        if (currentAuthor !== author) return false;
        if (!statusFilter) return true;
        return String((normalized && normalized.status) || 'published').trim().toLowerCase() === statusFilter;
      })
      .sort(function (left, right) { return parsePostTime(right) - parsePostTime(left); })
      .map(function (post) { return mapPostSummary(post); });

    return paginateItems(items, source).items;
  }

  function normalizeRankingModuleKey(value, deps) {
    var toSlug = getToSlug(deps);
    return toSlug(String(value || '').trim());
  }

  function parseRankingTimestamp(post) {
    var source = (post && typeof post === 'object' && !Array.isArray(post)) ? post : {};
    var absolute = [source.createdAt, source.created_at, source.timestamp_iso].find(function (value) {
      return value != null && String(value).trim();
    });
    if (absolute) {
      var parsedAbsolute = Date.parse(String(absolute));
      if (Number.isFinite(parsedAbsolute)) return parsedAbsolute;
    }

    var relative = String(source.timestamp || '').trim();
    if (!relative) return null;

    var normalized = relative.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    var match = normalized.match(/^ha\s+(\d+)\s+(minuto|minutos|hora|horas|dia|dias|semana|semanas|mes|meses)$/);
    if (!match) return null;

    var amount = parseInt(match[1], 10);
    var unit = match[2];
    if (!Number.isFinite(amount) || amount < 0) return null;

    var multipliers = {
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
    var delta = multipliers[unit];
    if (!delta) return null;
    return Date.now() - (amount * delta);
  }

  function isRankingPostInPeriod(post, period) {
    var parsed = parseRankingTimestamp(post);
    if (!Number.isFinite(parsed)) return true;

    var normalizedPeriod = String(period || 'month').trim().toLowerCase();
    var windows = {
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
    };
    var maxAge = windows[normalizedPeriod] || windows.month;
    return (Date.now() - parsed) <= maxAge;
  }

  function resolveRankingUser(post, index, deps) {
    var normalizePost = getNormalizePost(deps);
    var usersById = getMockUsersById(deps);
    var usersList = getMockUsersList(deps);
    var toSlug = getToSlug(deps);
    var normalized = normalizePost(post || {});
    var source = (post && typeof post === 'object' && !Array.isArray(post)) ? post : {};
    var explicitAuthorId = String((normalized && normalized.authorId) || source.authorId || source.author_id || '').trim();
    var displayName = String(
      (normalized && (normalized.authorName || normalized.author || normalized.autor))
      || source.authorName
      || source.author
      || source.autor
      || 'Usuario'
    ).trim() || 'Usuario';
    var avatarUrl = String(
      (normalized && (normalized.authorAvatar || normalized.autorAvatar))
      || source.authorAvatar
      || source.autorAvatar
      || ''
    ).trim();

    var matchedUser = null;
    if (explicitAuthorId && usersById[explicitAuthorId]) {
      matchedUser = usersById[explicitAuthorId];
    }

    if (!matchedUser && Array.isArray(usersList) && usersList.length) {
      matchedUser = usersList.find(function (entry) {
        if (!entry) return false;
        var sameName = String(entry.displayName || '').trim() === displayName;
        if (!sameName) return false;
        if (!avatarUrl) return true;
        return String(entry.avatarUrl || '').trim() === avatarUrl;
      }) || null;
    }

    var fallbackKey = displayName && displayName !== 'Usuario'
      ? displayName + '-' + avatarUrl
      : 'user-' + String(index + 1);
    var userId = explicitAuthorId || (matchedUser && matchedUser.id) || ('LOCAL_' + toSlug(fallbackKey));

    return {
      userId: userId,
      displayName: displayName || (matchedUser && matchedUser.displayName) || 'Usuario',
      avatarUrl: avatarUrl || (matchedUser && matchedUser.avatarUrl) || '',
    };
  }

  async function getTopContributors(period, module, limit, deps) {
    var entries = await getSearchCollection(deps);
    var normalizedModule = normalizeRankingModuleKey(module, deps);
    var parsedLimit = parseInt(String(limit != null ? limit : 10), 10);
    var safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;
    var scoreMap = new Map();

    (Array.isArray(entries) ? entries : []).forEach(function (post, index) {
      var source = (post && typeof post === 'object' && !Array.isArray(post)) ? post : {};
      var postModule = normalizeRankingModuleKey(source.modulo || source.module || source.moduleKey || '', deps);
      var contributor;
      var current;

      if (normalizedModule && postModule !== normalizedModule) return;
      if (!isRankingPostInPeriod(source, period)) return;

      contributor = resolveRankingUser(source, index, deps);
      if (!contributor.userId) return;

      current = scoreMap.get(contributor.userId) || {
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
      .map(function (entry) {
        return Object.assign({}, entry, {
          score: Math.max(0,
            (entry.posts_count * 15)
            + (entry.votes_received * 10)
            + (entry.comments_count * 5)
            + (entry.coupon_clicks * 4)
            + (entry.share_count * 3)
            - (entry.penalties * 50)
          ),
        });
      })
      .filter(function (entry) { return entry.score > 0; })
      .sort(function (left, right) {
        if (right.score !== left.score) return right.score - left.score;
        if (right.posts_count !== left.posts_count) return right.posts_count - left.posts_count;
        return String(left.display_name || '').localeCompare(String(right.display_name || ''), 'pt-BR');
      })
      .slice(0, safeLimit)
      .map(function (entry, index) {
        return Object.assign({}, entry, { rank: index + 1 });
      });
  }

  window._KCLA.postsRead = Object.freeze({
    getPosts: getPosts,
    searchPosts: searchPosts,
    getFeedCursor: getFeedCursor,
    getPostById: getPostById,
    getMyPosts: getMyPosts,
    getPostsByAuthorId: getPostsByAuthorId,
    getRelatedPosts: getRelatedPosts,
    getTopContributors: getTopContributors,
  });
})();

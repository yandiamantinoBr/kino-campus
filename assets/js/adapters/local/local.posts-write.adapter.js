/* KinoCampus - Local Posts Write Adapter */
(function () {
  'use strict';

  var LOCAL_USER_POSTS_STORAGE_KEY = 'kc_user_posts';
  var DEFAULT_VIEWER_ID = 'USER_SELF';

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
    return async function () { return null; };
  }

  function getApiURL(deps) {
    if (deps && typeof deps.apiURL === 'function') return deps.apiURL;
    if (window.KCAPI && typeof window.KCAPI.apiURL === 'function') return window.KCAPI.apiURL;
    return function (path) { return String(path || ''); };
  }

  function getNormalizePost(deps) {
    if (deps && typeof deps.normalizePost === 'function') return deps.normalizePost;
    if (window.KCAPI && typeof window.KCAPI.normalizePost === 'function') return window.KCAPI.normalizePost;
    return function (post) { return post; };
  }

  function getNowIsoFn(deps) {
    return (deps && typeof deps.getNowIso === 'function')
      ? deps.getNowIso
      : function () { return new Date().toISOString(); };
  }

  function getBuildPostKeys(deps) {
    return (deps && typeof deps.buildPostKeys === 'function')
      ? deps.buildPostKeys
      : function (post) {
          var source = (post && typeof post === 'object' && !Array.isArray(post)) ? post : {};
          var keys = [
            source.id,
            source.uuid,
            source.legacyId,
            source.legacy_id,
            source._id,
          ];
          return Array.from(new Set(keys.map(function (value) {
            return String(value == null ? '' : value).trim();
          }).filter(Boolean)));
        };
  }

  function getViewerId(deps) {
    return String((deps && deps.viewerId) || DEFAULT_VIEWER_ID).trim() || DEFAULT_VIEWER_ID;
  }

  function getMockUsersById(deps) {
    if (deps && deps.mockUsersById && typeof deps.mockUsersById === 'object') return deps.mockUsersById;
    return (window.KCAPI && window.KCAPI.MOCK_USERS_BY_ID && typeof window.KCAPI.MOCK_USERS_BY_ID === 'object')
      ? window.KCAPI.MOCK_USERS_BY_ID
      : {};
  }

  function getSlugifier(deps) {
    return (deps && typeof deps.toSlug === 'function')
      ? deps.toSlug
      : function (value) {
          return String(value || '')
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
        };
  }

  function getSavedPostClearer(deps) {
    return (deps && typeof deps.clearSavedPostState === 'function')
      ? deps.clearSavedPostState
      : async function () { return { ok: false, error: { message: 'Salvos locais indispon\u00EDveis.' } }; };
  }

  function readPostDrafts() {
    try {
      var raw = localStorage.getItem(LOCAL_USER_POSTS_STORAGE_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function writePostDrafts(list) {
    try {
      localStorage.setItem(LOCAL_USER_POSTS_STORAGE_KEY, JSON.stringify(Array.isArray(list) ? list : []));
      return true;
    } catch (_) {
      return false;
    }
  }

  function matchesPostIdentity(post, postId, deps) {
    var key = String(postId || '').trim();
    if (!key) return false;
    return getBuildPostKeys(deps)(post).includes(key);
  }

  function preparePostForPersistence(body, currentPost, deps) {
    var existing = (currentPost && typeof currentPost === 'object' && !Array.isArray(currentPost)) ? { ...currentPost } : {};
    var input = (body && typeof body === 'object' && !Array.isArray(body)) ? body : {};
    var raw = {
      ...existing,
      ...input,
    };
    var getNowIso = getNowIsoFn(deps);
    var viewerId = getViewerId(deps);
    var mockUsersById = getMockUsersById(deps);
    var viewer = mockUsersById[viewerId] || mockUsersById.USER_SELF || {};
    var toSlug = getSlugifier(deps);

    if (!raw.id) raw.id = existing.id || Date.now();
    if (!raw.authorId) raw.authorId = existing.authorId || viewerId;
    if (!raw.autor && !raw._legacyAuthorName) {
      raw.autor = existing.autor || String(viewer.displayName || viewer.name || 'Voc\u00EA').trim() || 'Voc\u00EA';
    }
    if (!raw.autorAvatar && !raw._legacyAuthorAvatar) {
      raw.autorAvatar = existing.autorAvatar || String(viewer.avatarUrl || viewer.avatar || '').trim();
    }
    if (!raw.created_at && !raw.createdAt) {
      var createdAt = existing.created_at || existing.createdAt || getNowIso();
      raw.created_at = createdAt;
      raw.createdAt = createdAt;
    }
    raw.updated_at = getNowIso();
    raw.updatedAt = raw.updated_at;
    if (!raw.timestamp && !existing.timestamp) raw.timestamp = 'Agora';

    try {
      var moduleKey = String(raw.modulo || raw.module || '').trim();
      var categoryKey = toSlug(raw.categoriaKey || raw.categoryKey || raw.category || raw.categoria || '');
      if (categoryKey) {
        raw.categoriaKey = categoryKey;
        if (!raw.categoria) raw.categoria = categoryKey;
      }

      var subKey = toSlug(raw.subcategoriaKey || raw.subcategoryKey || raw.subcategory || '');
      var actionish = ['vendo', 'compro', 'troco', 'doacao', 'alugo', 'procuro'];
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

  async function createPost(body, deps) {
    var config = getConfig(deps);
    var fetchJSON = getFetchJSON(deps);
    var apiURL = getApiURL(deps);
    var normalizePost = getNormalizePost(deps);

    if (!config.baseURL) {
      var existing = readPostDrafts();
      var raw = preparePostForPersistence(body, null, deps);
      var next = normalizePost(raw);
      existing.unshift(raw);

      try {
        if (!writePostDrafts(existing)) throw new Error('LOCAL_WRITE_FAILED');
      } catch (err) {
        var message = (err && err.message) ? String(err.message) : 'Falha ao persistir publica\u00E7\u00E3o no localStorage.';
        var errorPayload = {
          code: 'LOCAL_STORAGE_SET_ITEM_FAILED',
          message: message,
        };
        try {
          console.error('[KCAPI] localCreatePost persist error', {
            driver: window.KCAPI && window.KCAPI.ENV ? window.KCAPI.ENV.driver : 'local',
            storageKey: LOCAL_USER_POSTS_STORAGE_KEY,
            message: message,
          });
        } catch (_) { }
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

  async function updatePost(postId, payload, deps) {
    var key = String(postId || '').trim();
    if (!key) return { ok: false, error: { message: 'Post inv\u00E1lido para edi\u00E7\u00E3o.' } };

    var config = getConfig(deps);
    var fetchJSON = getFetchJSON(deps);
    var apiURL = getApiURL(deps);
    var normalizePost = getNormalizePost(deps);

    if (config.baseURL) {
      return fetchJSON(apiURL('posts/' + encodeURIComponent(key)), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
    }

    var drafts = readPostDrafts();
    var index = drafts.findIndex(function (item) {
      return matchesPostIdentity(item, key, deps);
    });
    if (index < 0) return { ok: false, error: { message: 'Publica\u00E7\u00E3o n\u00E3o encontrada.' } };

    var nextDraft = preparePostForPersistence(payload, drafts[index], deps);
    drafts[index] = nextDraft;
    if (!writePostDrafts(drafts)) {
      return { ok: false, error: { message: 'N\u00E3o foi poss\u00EDvel salvar altera\u00E7\u00F5es localmente.' } };
    }

    return { ok: true, data: normalizePost(nextDraft) };
  }

  async function deletePost(postId, deps) {
    var key = String(postId || '').trim();
    if (!key) return { ok: false, error: { message: 'Post inv\u00E1lido para exclus\u00E3o.' } };

    var config = getConfig(deps);
    var fetchJSON = getFetchJSON(deps);
    var apiURL = getApiURL(deps);

    if (config.baseURL) {
      return fetchJSON(apiURL('posts/' + encodeURIComponent(key)), {
        method: 'DELETE',
      });
    }

    var drafts = readPostDrafts();
    var nextDrafts = drafts.filter(function (item) {
      return !matchesPostIdentity(item, key, deps);
    });
    if (nextDrafts.length === drafts.length) {
      return { ok: false, error: { message: 'Publica\u00E7\u00E3o n\u00E3o encontrada.' } };
    }
    if (!writePostDrafts(nextDrafts)) {
      return { ok: false, error: { message: 'N\u00E3o foi poss\u00EDvel excluir a publica\u00E7\u00E3o localmente.' } };
    }

    try {
      await getSavedPostClearer(deps)(key);
    } catch (_) { }

    return { ok: true };
  }

  async function reportPost() {
    return { ok: false, error: { message: 'Den\u00FAncias dispon\u00EDveis apenas no Supabase.' } };
  }

  async function togglePostStatus() {
    return { ok: false, code: 'UNAVAILABLE', message: 'Indispon\u00EDvel no modo local.' };
  }

  async function renewPost() {
    return { ok: false, code: 'UNAVAILABLE', message: 'Indispon\u00EDvel no modo local.' };
  }

  async function bumpPost() {
    return { ok: false, code: 'UNAVAILABLE', message: 'Indispon\u00EDvel no modo local.' };
  }

  async function closePost() {
    return { ok: false, code: 'UNAVAILABLE', message: 'Indispon\u00EDvel no modo local.' };
  }

  async function reactivatePost() {
    return { ok: false, code: 'UNAVAILABLE', message: 'Indispon\u00EDvel no modo local.' };
  }

  window._KCLA.postsWrite = Object.freeze({
    createPost: createPost,
    updatePost: updatePost,
    deletePost: deletePost,
    reportPost: reportPost,
    togglePostStatus: togglePostStatus,
    renewPost: renewPost,
    bumpPost: bumpPost,
    closePost: closePost,
    reactivatePost: reactivatePost,
  });
}());

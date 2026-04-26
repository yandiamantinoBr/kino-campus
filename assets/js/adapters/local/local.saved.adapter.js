/* KinoCampus - Local Saved Adapter */
(function () {
  'use strict';

  const LOCAL_SAVED_POSTS_STORAGE_KEY = 'kc_saved_posts';
  const DEFAULT_VIEWER_ID = 'USER_SELF';

  window._KCLA = window._KCLA || {};

  function getViewerId(deps) {
    return String((deps && deps.viewerId) || DEFAULT_VIEWER_ID).trim() || DEFAULT_VIEWER_ID;
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
          const source = (post && typeof post === 'object' && !Array.isArray(post)) ? post : {};
          const keys = [
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

  function getPostById(deps) {
    return (deps && typeof deps.getPostById === 'function')
      ? deps.getPostById
      : async function () { return null; };
  }

  function getMapPostSummary(deps) {
    return (deps && typeof deps.mapPostSummary === 'function')
      ? deps.mapPostSummary
      : function (post, extras) {
          const source = (post && typeof post === 'object' && !Array.isArray(post)) ? post : {};
          const summary = {
            id: source.id != null ? source.id : (source.uuid || null),
            uuid: source.uuid || null,
            title: String(source.title || source.titulo || 'Sem titulo').trim() || 'Sem titulo',
            created_at: source.created_at || source.createdAt || null,
            status: String(source.status || 'published').trim() || 'published',
            visibility: String(source.visibility || 'public').trim() || 'public',
            module: String(source.module || source.modulo || '').trim(),
            category: String(source.category || source.categoriaKey || source.categoria || '').trim(),
          };
          if (extras && Array.isArray(extras.saveKinds)) summary.save_kinds = extras.saveKinds.slice();
          if (extras && extras.savedAt) summary.saved_at = extras.savedAt;
          return summary;
        };
  }

  function getPaginator(deps) {
    return (deps && typeof deps.paginateItems === 'function')
      ? deps.paginateItems
      : function (items, params) {
          const list = Array.isArray(items) ? items : [];
          const page = Math.max(1, Number(params && params.page) || 1);
          const limit = Math.min(50, Math.max(1, Number(params && params.limit) || 12));
          const offset = (page - 1) * limit;
          return {
            page: page,
            limit: limit,
            items: list.slice(offset, offset + limit),
          };
        };
  }

  function getProfileReader(deps) {
    return (deps && typeof deps.readProfile === 'function')
      ? deps.readProfile
      : function () { return { id: getViewerId(deps) }; };
  }

  function normalizeSaveKind(kind) {
    const value = String(kind || '').trim().toLowerCase();
    return ['favorite', 'later', 'highlight'].includes(value) ? value : '';
  }

  function readSavedPosts(deps) {
    const getNowIso = getNowIsoFn(deps);
    try {
      const raw = localStorage.getItem(LOCAL_SAVED_POSTS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map(function (entry) {
          const source = (entry && typeof entry === 'object' && !Array.isArray(entry)) ? entry : {};
          const postId = String(source.post_id || source.postId || '').trim();
          const saveKind = normalizeSaveKind(source.kind);
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

  function writeSavedPosts(list) {
    try {
      localStorage.setItem(LOCAL_SAVED_POSTS_STORAGE_KEY, JSON.stringify(Array.isArray(list) ? list : []));
      return true;
    } catch (_) {
      return false;
    }
  }

  async function listSavedPostSummaries(params, deps) {
    const loadPostById = getPostById(deps);
    const mapPostSummary = getMapPostSummary(deps);
    const filteredKind = normalizeSaveKind(params && params.kind);
    const sorted = readSavedPosts(deps)
      .filter(function (entry) { return !filteredKind || entry.kind === filteredKind; })
      .sort(function (left, right) {
        return new Date(right.updated_at || 0).getTime() - new Date(left.updated_at || 0).getTime();
      });
    const byPost = new Map();

    for (let index = 0; index < sorted.length; index += 1) {
      const entry = sorted[index];
      const post = await loadPostById(entry.post_id);
      if (!post) continue;
      const summary = mapPostSummary(post);
      const key = String((summary && (summary.uuid || summary.id)) || entry.post_id || '').trim();
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

    return Array.from(byPost.values()).sort(function (left, right) {
      const leftAt = left.saved_at ? new Date(left.saved_at).getTime() : 0;
      const rightAt = right.saved_at ? new Date(right.saved_at).getTime() : 0;
      return rightAt - leftAt;
    });
  }

  async function getSavedPostState(postId, deps) {
    const loadPostById = getPostById(deps);
    const buildPostKeys = getBuildPostKeys(deps);
    const post = await loadPostById(postId);
    const keys = post ? buildPostKeys(post) : [String(postId || '').trim()].filter(Boolean);
    const kinds = Array.from(new Set(
      readSavedPosts(deps)
        .filter(function (entry) { return keys.includes(String(entry.post_id || '').trim()); })
        .map(function (entry) { return entry.kind; })
        .filter(Boolean)
    ));
    return { kinds: kinds };
  }

  async function clearSavedPostState(postId, kind, deps) {
    const loadPostById = getPostById(deps);
    const buildPostKeys = getBuildPostKeys(deps);
    const saveKind = normalizeSaveKind(kind);
    const post = await loadPostById(postId);
    const keys = post ? buildPostKeys(post) : [String(postId || '').trim()].filter(Boolean);
    if (!keys.length) {
      return { ok: false, error: { message: 'Publica\u00e7\u00e3o inv\u00e1lida.' } };
    }

    const next = readSavedPosts(deps).filter(function (entry) {
      const matchesPost = keys.includes(String(entry.post_id || '').trim());
      if (!matchesPost) return true;
      if (!saveKind) return false;
      return entry.kind !== saveKind;
    });

    if (!writeSavedPosts(next)) {
      return { ok: false, error: { message: 'N\u00e3o foi poss\u00edvel remover o item salvo.' } };
    }

    return { ok: true, cleared: saveKind || 'all' };
  }

  async function setSavedPostState(postId, kind, enabled, deps) {
    const loadPostById = getPostById(deps);
    const buildPostKeys = getBuildPostKeys(deps);
    const getNowIso = getNowIsoFn(deps);
    const saveKind = normalizeSaveKind(kind);

    if (!saveKind) {
      return { ok: false, error: { message: 'Tipo de salvamento inv\u00e1lido.' } };
    }
    if (enabled === false) return clearSavedPostState(postId, saveKind, deps);

    const post = await loadPostById(postId);
    if (!post) {
      return { ok: false, error: { message: 'Publica\u00e7\u00e3o inv\u00e1lida.' } };
    }

    const keys = buildPostKeys(post);
    const primaryKey = String((post && (post.uuid || post.id || post.legacy_id || post.legacyId)) || keys[0] || '').trim();
    if (!primaryKey) {
      return { ok: false, error: { message: 'Publica\u00e7\u00e3o inv\u00e1lida.' } };
    }

    const now = getNowIso();
    const current = readSavedPosts(deps);
    const index = current.findIndex(function (entry) {
      return String(entry.post_id || '').trim() === primaryKey && entry.kind === saveKind;
    });
    if (index >= 0) current[index].updated_at = now;
    else current.push({ post_id: primaryKey, kind: saveKind, created_at: now, updated_at: now });

    if (!writeSavedPosts(current)) {
      return { ok: false, error: { message: 'N\u00e3o foi poss\u00edvel salvar a publica\u00e7\u00e3o.' } };
    }

    return { ok: true, data: { kind: saveKind }, enabled: true };
  }

  async function getMySavedPosts(params, deps) {
    const paginateItems = getPaginator(deps);
    const items = await listSavedPostSummaries(params || {}, deps);
    return paginateItems(items, params || {}).items;
  }

  async function getMySavedPostsCount(params, deps) {
    const items = await listSavedPostSummaries(params || {}, deps);
    return items.length;
  }

  async function getProfileHighlights(profileId, params, deps) {
    const readProfile = getProfileReader(deps);
    const paginateItems = getPaginator(deps);
    const current = readProfile();
    const target = String(profileId || '').trim();
    const viewerId = getViewerId(deps);
    if (!target || (target !== String((current && current.id) || '').trim() && target !== viewerId)) return [];
    const items = await listSavedPostSummaries({ ...(params || {}), kind: 'highlight' }, deps);
    return paginateItems(items, params || {}).items;
  }

  async function getProfileHighlightsCount(profileId, params, deps) {
    const readProfile = getProfileReader(deps);
    const current = readProfile();
    const target = String(profileId || '').trim();
    const viewerId = getViewerId(deps);
    if (!target || (target !== String((current && current.id) || '').trim() && target !== viewerId)) return 0;
    const items = await listSavedPostSummaries({ ...(params || {}), kind: 'highlight' }, deps);
    return items.length;
  }

  window._KCLA.saved = Object.freeze({
    getSavedPostState: getSavedPostState,
    setSavedPostState: setSavedPostState,
    clearSavedPostState: clearSavedPostState,
    getMySavedPosts: getMySavedPosts,
    getMySavedPostsCount: getMySavedPostsCount,
    getProfileHighlights: getProfileHighlights,
    getProfileHighlightsCount: getProfileHighlightsCount,
  });
})();

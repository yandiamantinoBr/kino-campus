/* KinoCampus - oportunidades.catalog.js
 * Catálogo leve e progressivo usado pela barra lateral de Oportunidades.
 * Mantém o feed visível fora do caminho crítico e só expande a amostra em
 * tempo ocioso ou quando a pessoa abre a seção de áreas.
 */
(function () {
  'use strict';

  const CACHE_SCOPE = 'feed-index';
  const CACHE_KEY = 'oportunidades:index';
  const CACHE_MAX_AGE_MS = 1000 * 60 * 10;
  const PAGE_SIZE = 50;
  const INITIAL_PAGE_COUNT = 1;
  const MAX_PAGE_COUNT = 4;

  function getSessionStore() {
    return window.KCSessionStore && typeof window.KCSessionStore.get === 'function'
      ? window.KCSessionStore
      : null;
  }

  function getIdentity(post, fallbackIndex) {
    if (typeof window.getPostIdentity === 'function') {
      const normalized = String(window.getPostIdentity(post) || '').trim();
      if (normalized) return normalized;
    }
    const fallback = post && (post.id || post.uuid || post.legacy_id || post.legacyId);
    return String(fallback || `catalog:${fallbackIndex}`).trim();
  }

  function createCatalog() {
    const rawPosts = new Map();
    let pageCount = 0;
    let exhausted = false;
    let inFlight = null;
    let expansionScheduled = false;

    function remember(posts) {
      if (!Array.isArray(posts)) return;
      posts.forEach(function (post, index) {
        if (!post || typeof post !== 'object') return;
        const identity = getIdentity(post, rawPosts.size + index);
        if (!identity) return;
        rawPosts.set(identity, post);
      });
    }

    function allPosts() {
      return Array.from(rawPosts.values()).slice(0, 600);
    }

    function persist() {
      const store = getSessionStore();
      if (!store || typeof store.set !== 'function') return;
      store.set(CACHE_SCOPE, CACHE_KEY, {
        posts: allPosts(),
        catalogPageCount: pageCount,
        catalogExhausted: exhausted,
      });
    }

    function restore() {
      const store = getSessionStore();
      if (!store) return [];
      const cached = store.get(CACHE_SCOPE, CACHE_KEY, { maxAge: CACHE_MAX_AGE_MS });
      const value = cached && cached.value && typeof cached.value === 'object' ? cached.value : null;
      const posts = value && Array.isArray(value.posts) ? value.posts : [];
      if (!posts.length) return [];
      remember(posts);
      const cachedPages = Number(value.catalogPageCount);
      pageCount = Number.isFinite(cachedPages) && cachedPages >= 0
        ? Math.min(MAX_PAGE_COUNT, Math.floor(cachedPages))
        : 0;
      exhausted = value.catalogExhausted === true;
      return allPosts();
    }

    async function fetchCatalog(options) {
      const opts = options && typeof options === 'object' ? options : {};
      const requestedPageCount = Number(opts.targetPages);
      const targetPages = Math.max(
        INITIAL_PAGE_COUNT,
        Math.min(MAX_PAGE_COUNT, Number.isFinite(requestedPageCount) ? Math.floor(requestedPageCount) : INITIAL_PAGE_COUNT)
      );

      if (exhausted || pageCount >= targetPages) return allPosts();
      if (inFlight) {
        await inFlight;
        return fetchCatalog(opts);
      }

      inFlight = (async function () {
        let attemptedCatalogRead = false;
        if (window.KCAPI && typeof window.KCAPI.getPosts === 'function') {
          for (let page = pageCount + 1; page <= targetPages; page += 1) {
            const batch = await window.KCAPI.getPosts({
              module: 'oportunidades',
              page,
              limit: PAGE_SIZE,
              light: true,
            });
            attemptedCatalogRead = true;
            if (!Array.isArray(batch) || batch.length === 0) {
              exhausted = true;
              break;
            }
            remember(batch);
            pageCount = page;
            if (batch.length < PAGE_SIZE) {
              exhausted = true;
              break;
            }
          }
        } else if (window.KCAPI && typeof window.KCAPI.getDatabaseNormalized === 'function') {
          const db = await window.KCAPI.getDatabaseNormalized();
          const posts = Array.isArray(db && db.posts) ? db.posts : [];
          remember(posts.filter(function (post) {
            return String(post && post.modulo || '').trim().toLowerCase() === 'oportunidades';
          }));
          attemptedCatalogRead = true;
          pageCount = MAX_PAGE_COUNT;
          exhausted = true;
        }

        try {
          if (window.kcUserPosts && typeof window.kcUserPosts.list === 'function') {
            const userPosts = window.kcUserPosts.list();
            if (Array.isArray(userPosts)) {
              remember(userPosts.filter(function (post) {
                return String(post && post.modulo || '').trim().toLowerCase() === 'oportunidades';
              }));
            }
          }
        } catch (_) { }

        // Do not replace a useful restored cache when the source was not
        // reachable. A successful read (including an empty catalog) is safe
        // to persist and carries the new paging metadata.
        if (attemptedCatalogRead) persist();
        return allPosts();
      }())
        .catch(function () {
          return allPosts();
        })
        .finally(function () {
          inFlight = null;
        });

      return inFlight;
    }

    function scheduleExpansion(onUpdate) {
      if (expansionScheduled || exhausted || pageCount >= MAX_PAGE_COUNT) return;
      expansionScheduled = true;
      const run = function () {
        expansionScheduled = false;
        fetchCatalog({ targetPages: MAX_PAGE_COUNT }).then(function (posts) {
          if (typeof onUpdate === 'function') onUpdate(posts);
        });
      };
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 5000 });
      } else {
        window.setTimeout(run, 750);
      }
    }

    return Object.freeze({
      restore,
      fetch: fetchCatalog,
      scheduleExpansion,
      getPosts: allPosts,
      getPageCount: function () { return pageCount; },
    });
  }

  window._KCOpCatalog = Object.freeze({ createCatalog });
}());

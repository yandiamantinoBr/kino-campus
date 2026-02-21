/*
  KinoCampus - Feed Controller Helper (V8.1.9.0)
  - Utilitário central de paginação com UX de "Carregar mais"
  - Estados: idle/loading/done/error
  - Sem flicker: append incremental
  - Anti-duplicação por Set de IDs
*/

(function () {
  'use strict';

  const POSTS_LIMIT = 12;
  const DEFAULT_PAGE = 0;

  function warn(msg, err) {
    try { console.warn(msg, err || ''); } catch (_) {}
  }

  function getCtx(options) {
    return (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
  }

  function normalizeModuleKeys(moduleOpt) {
    if (Array.isArray(moduleOpt)) return moduleOpt.filter(Boolean);
    return moduleOpt ? [moduleOpt] : [];
  }

  function reapplyFiltersAndSearch() {
    try {
      if (window.kcFilters && typeof window.kcFilters.apply === 'function') {
        window.kcFilters.apply();
      } else if (typeof window.filterPosts === 'function') {
        window.filterPosts();
      }
    } catch (_) {}
  }

  function getPostIdentity(post, idx) {
    if (post && post.id != null && String(post.id)) return String(post.id);
    const created = post && (post.created_at || post.createdAt || post.data);
    const title = post && (post.titulo || post.title);
    return `${String(title || '')}::${String(created || '')}::${idx}`;
  }

  async function fetchPostsByModule(moduleKeys, page, limit) {
    if (!window.KCAPI || typeof window.KCAPI.getPosts !== 'function') return [];

    if (moduleKeys.length === 0) {
      const posts = await window.KCAPI.getPosts({ page, limit });
      return Array.isArray(posts) ? posts : [];
    }

    if (moduleKeys.length === 1) {
      const posts = await window.KCAPI.getPosts({ module: moduleKeys[0], page, limit });
      return Array.isArray(posts) ? posts : [];
    }

    const merged = [];
    for (const mk of moduleKeys) {
      try {
        const part = await window.KCAPI.getPosts({ module: mk, page, limit });
        if (Array.isArray(part) && part.length) merged.push(...part);
      } catch (_) {}
    }
    return merged;
  }

  function createPagerUI(container) {
    const wrap = document.createElement('div');
    wrap.className = 'kc-feed-pager';

    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.type = 'button';
    loadMoreBtn.className = 'kc-btn-primary kc-feed-pager__btn';
    loadMoreBtn.textContent = 'Carregar mais';

    const status = document.createElement('p');
    status.className = 'kc-feed-pager__status';
    status.setAttribute('aria-live', 'polite');

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'kc-btn-secondary kc-feed-pager__retry';
    retryBtn.textContent = 'Tentar novamente';
    retryBtn.style.display = 'none';

    wrap.appendChild(loadMoreBtn);
    wrap.appendChild(status);
    wrap.appendChild(retryBtn);

    container.insertAdjacentElement('afterend', wrap);

    return { wrap, loadMoreBtn, status, retryBtn };
  }

  function createFeedPager(options) {
    const opt = getCtx(options);
    const containerSelector = opt.containerSelector || '.kc-feed-list';
    const moduleKeys = normalizeModuleKeys(opt.module || '');
    const pageModule = opt.pageModule || (moduleKeys.length === 1 ? moduleKeys[0] : '') || '';
    const limit = (opt.limit != null) ? Math.max(1, parseInt(String(opt.limit), 10) || POSTS_LIMIT) : POSTS_LIMIT;

    const container = document.querySelector(containerSelector);
    if (!container) return null;

    if (!window.KCUtils || typeof window.KCUtils.renderPostCard !== 'function') {
      warn('[KCControllers] KCUtils.renderPostCard não disponível; mantendo fallback estático.');
      return null;
    }

    const fallbackHTML = container.innerHTML;
    const pagerUI = createPagerUI(container);

    const state = {
      page: DEFAULT_PAGE,
      status: 'idle',
      done: false,
      loading: false,
      hydrated: false,
      seenIds: new Set(),
      lastError: null,
    };

    function setStatus(next, message) {
      state.status = next;
      pagerUI.status.textContent = message || '';
      pagerUI.retryBtn.style.display = next === 'error' ? 'inline-flex' : 'none';

      if (next === 'loading') {
        pagerUI.loadMoreBtn.disabled = true;
        pagerUI.loadMoreBtn.textContent = 'Carregando...';
      } else {
        pagerUI.loadMoreBtn.disabled = state.done || state.loading;
        pagerUI.loadMoreBtn.textContent = 'Carregar mais';
      }

      if (state.done) {
        pagerUI.loadMoreBtn.style.display = 'none';
        if (next !== 'error') pagerUI.status.textContent = 'Fim da lista';
      } else {
        pagerUI.loadMoreBtn.style.display = 'inline-flex';
      }
    }

    function normalizePost(raw) {
      return (window.KCPostModel && typeof window.KCPostModel.from === 'function')
        ? window.KCPostModel.from(raw, { pageModule })
        : ((window.KCAPI && typeof window.KCAPI.normalizePost === 'function') ? window.KCAPI.normalizePost(raw) : (raw || {}));
    }

    async function loadNextPage() {
      if (state.loading || state.done) return;
      state.loading = true;
      setStatus('loading', 'Carregando...');

      const apiPage = state.page + 1;

      try {
        const dbPosts = await fetchPostsByModule(moduleKeys, apiPage, limit);

        let userRaw = [];
        if (apiPage === 1) {
          try {
            if (window.kcUserPosts && typeof window.kcUserPosts.list === 'function') userRaw = window.kcUserPosts.list();
          } catch (_) {}
          if (Array.isArray(userRaw) && userRaw.length && moduleKeys.length) {
            const set = new Set(moduleKeys.map(String));
            userRaw = userRaw.filter((p) => set.has(String(p && p.modulo)));
          }
        }

        const rawPosts = [
          ...(Array.isArray(userRaw) ? userRaw.map((p) => ({ ...(p || {}), _kcUserPost: true })) : []),
          ...(Array.isArray(dbPosts) ? dbPosts : [])
        ];

        const normalized = rawPosts.map(normalizePost);
        const fresh = [];
        normalized.forEach((post, idx) => {
          const pid = getPostIdentity(post, idx);
          if (state.seenIds.has(pid)) return;
          state.seenIds.add(pid);
          fresh.push(post);
        });

        if (!state.hydrated) {
          container.innerHTML = '';
          state.hydrated = true;
        }

        if (fresh.length) {
          const html = fresh.map((post) => window.KCUtils.renderPostCard(post, { pageModule })).join('');
          container.insertAdjacentHTML('beforeend', html);

          if (typeof opt.onAfterAppend === 'function') {
            try { opt.onAfterAppend({ container, posts: fresh, state: { ...state } }); } catch (_) {}
          }

          reapplyFiltersAndSearch();
        }

        const reachedEnd = (!Array.isArray(dbPosts) || dbPosts.length === 0 || dbPosts.length < limit);
        if (reachedEnd) {
          state.done = true;
          setStatus('done', 'Fim da lista');
        } else {
          state.page += 1;
          setStatus('idle', '');
        }
      } catch (err) {
        state.lastError = err;
        if (!state.hydrated) container.innerHTML = fallbackHTML;
        warn('[KCControllers] Falha ao carregar próxima página do feed.', err);
        setStatus('error', 'Não foi possível carregar mais posts.');
      } finally {
        state.loading = false;
        if (state.status !== 'error' && !state.done) setStatus('idle', '');
      }
    }

    pagerUI.loadMoreBtn.addEventListener('click', loadNextPage);
    pagerUI.retryBtn.addEventListener('click', loadNextPage);

    loadNextPage();

    return {
      loadNextPage,
      retry: loadNextPage,
      getState: () => ({ ...state }),
    };
  }

  async function injectFeed(options) {
    return createFeedPager(options);
  }

  window.KCControllers = Object.freeze({
    injectFeed,
    createFeedPager,
  });
})();

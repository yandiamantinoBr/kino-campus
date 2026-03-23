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
  const NEW_CARD_HIGHLIGHT_MS = 1500;
  const FEED_CACHE_MAX_AGE_MS = 1000 * 60 * 10;
  const FEED_REVALIDATE_COOLDOWN_MS = 1000 * 45;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let activePager = null;

  function warn(msg, err) {
    try { console.warn(msg, err || ''); } catch (_) { }
  }

  function getCtx(options) {
    return (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
  }

  function normalizeModuleKeys(moduleOpt) {
    if (Array.isArray(moduleOpt)) return moduleOpt.filter(Boolean);
    return moduleOpt ? [moduleOpt] : [];
  }

  function getSessionStore() {
    return window.KCSessionStore && typeof window.KCSessionStore.get === 'function'
      ? window.KCSessionStore
      : null;
  }

  function buildFeedCacheIdentity(moduleKeys, page, q, tag, limit, pathname) {
    const modules = Array.isArray(moduleKeys) ? moduleKeys.slice().sort().join(',') : String(moduleKeys || '');
    return JSON.stringify({
      pathname: String(pathname || window.location.pathname || '').trim() || '/',
      modules,
      page: Number(page) || 0,
      q: String(q || '').trim().toLowerCase(),
      tag: String(tag || '').trim().toLowerCase(),
      limit: Number(limit) || POSTS_LIMIT,
    });
  }

  function buildFeedSnapshotKey(moduleKeys, q, tag, limit, pathname) {
    return JSON.stringify({
      pathname: String(pathname || window.location.pathname || '').trim() || '/',
      modules: Array.isArray(moduleKeys) ? moduleKeys.slice().sort() : [],
      q: String(q || '').trim().toLowerCase(),
      tag: String(tag || '').trim().toLowerCase(),
      limit: Number(limit) || POSTS_LIMIT,
    });
  }

  function reapplyFiltersAndSearch() {
    try {
      if (window.kcFilters && typeof window.kcFilters.apply === 'function') {
        window.kcFilters.apply();
      } else if (typeof window.filterPosts === 'function') {
        window.filterPosts();
      }
    } catch (_) { }
  }

  function getPostIdentity(post, idx) {
    if (post && post.id != null && String(post.id)) return String(post.id);
    const created = post && (post.created_at || post.createdAt || post.data);
    const title = post && (post.titulo || post.title);
    return `${String(title || '')}::${String(created || '')}::${idx}`;
  }

  function identityIsUuid(value) {
    return UUID_RE.test(String(value || '').trim());
  }

  function getIdentityAliases(post, raw, idx) {
    const aliases = new Set();

    function addAlias(value, prefix) {
      if (value == null) return;
      const base = String(value).trim();
      if (!base) return;
      aliases.add(base);
      aliases.add(`${prefix}:${base}`);
      aliases.add(`id:${base}`);
    }

    function addFlexible(value) {
      if (value == null) return;
      const s = String(value).trim();
      if (!s) return;
      if (identityIsUuid(s)) {
        aliases.add(s);
        aliases.add(`uuid:${s}`);
        aliases.add(`id:${s}`);
      } else {
        aliases.add(s);
        aliases.add(`legacy:${s}`);
        aliases.add(`id:${s}`);
      }
    }

    addFlexible(post && post.id);
    addAlias(post && (post.uuid || post.post_uuid), 'uuid');
    addAlias(post && (post.legacyId || post.legacy_id), 'legacy');
    addFlexible(raw && raw.id);
    addAlias(raw && (raw.uuid || raw.post_uuid), 'uuid');
    addAlias(raw && (raw.legacyId || raw.legacy_id), 'legacy');

    const fallback = getPostIdentity(post || raw, idx);
    addAlias(fallback, 'fallback');

    return Array.from(aliases);
  }

  function hasSeenIdentity(state, post, raw, idx) {
    const aliases = getIdentityAliases(post, raw, idx);
    for (const k of aliases) {
      if (state.seenIds.has(k)) return true;
    }
    return false;
  }

  function markSeenIdentity(state, post, raw, idx) {
    const aliases = getIdentityAliases(post, raw, idx);
    aliases.forEach((k) => state.seenIds.add(k));
  }

  function createRealtimeBanner(container) {
    const banner = document.createElement('div');
    banner.className = 'kc-feed-realtime-banner';
    banner.style.display = 'none';
    banner.setAttribute('aria-live', 'polite');

    const msg = document.createElement('span');
    msg.className = 'kc-feed-realtime-banner__msg';
    msg.textContent = 'Novo post disponível';

    const count = document.createElement('span');
    count.className = 'kc-feed-realtime-banner__count';
    count.textContent = '0';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kc-btn-primary kc-feed-realtime-banner__btn';
    btn.textContent = 'Carregar';

    banner.appendChild(msg);
    banner.appendChild(count);
    banner.appendChild(btn);
    container.insertAdjacentElement('beforebegin', banner);

    function update(nextCount) {
      const n = Math.max(0, Number(nextCount) || 0);
      count.textContent = String(n);
      banner.style.display = n > 0 ? 'flex' : 'none';
      msg.textContent = n > 1 ? 'Novos posts disponíveis' : 'Novo post disponível';
    }

    update(0);
    return { banner, msg, count, btn, update };
  }

  function getPostTimestampMs(raw) {
    const ts = raw && (raw.created_at || raw.createdAt || raw.timestamp || raw.data);
    if (!ts) return 0;
    const ms = new Date(String(ts)).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  async function resolveRealtimeRaw(row) {
    if (!row || !row.id) return row || null;
    if (!window.KCAPI || typeof window.KCAPI.getPostById !== 'function') return row;

    try {
      const full = await window.KCAPI.getPostById(row.id);
      if (full && typeof full === 'object') {
        return {
          ...(full || {}),
          status: row.status || full.status || 'published',
          module: row.module || full.module || full.modulo || '',
          modulo: row.module || full.modulo || full.module || '',
          // Alinha identidade ao feed atual (driver Supabase usa legacy_id quando presente).
          id: row.legacy_id || full.legacyId || full.legacy_id || full.id || row.id,
          uuid: row.id,
          legacy_id: row.legacy_id || full.legacy_id || full.legacyId || null,
          legacyId: row.legacy_id || full.legacyId || full.legacy_id || null,
        };
      }
    } catch (_) { }

    return {
      ...(row || {}),
      id: row.legacy_id || row.id,
      uuid: row.id,
      legacy_id: row.legacy_id || null,
      legacyId: row.legacy_id || null,
      modulo: row.module || row.modulo || '',
      module: row.module || row.modulo || '',
      status: row.status || 'published',
    };
  }

  // P1-B fix: aceita parâmetros q (busca textual) e tag (filtro por chave canônica)
  // Cache: module-level post caching with 3-minute TTL
  const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
  const postCache = {};

  function getCacheKey(moduleKeys, page, q, tag, limit, pathname) {
    return buildFeedCacheIdentity(moduleKeys, page, q, tag, limit, pathname);
  }

  function getCachedPosts(moduleKeys, page, q, tag, limit, pathname) {
    const key = getCacheKey(moduleKeys, page, q, tag, limit, pathname);
    const cached = postCache[key];
    if (!cached) return null;
    const now = Date.now();
    if (now - cached.timestamp > CACHE_TTL_MS) {
      delete postCache[key];
      return null;
    }
    return {
      posts: cached.posts,
      timestamp: cached.timestamp,
      age: now - cached.timestamp,
      source: 'memory',
    };
  }

  function setCachedPosts(moduleKeys, page, posts, q, tag, limit, pathname) {
    const key = getCacheKey(moduleKeys, page, q, tag, limit, pathname);
    postCache[key] = {
      posts: posts,
      timestamp: Date.now(),
    };
  }

  function invalidateCache(moduleKeys, q, tag, limit, pathname) {
    const targetPath = String(pathname || window.location.pathname || '').trim() || '/';
    Object.keys(postCache).forEach((key) => {
      try {
        const parsed = JSON.parse(key);
        if (
          parsed &&
          parsed.pathname === targetPath &&
          JSON.stringify((parsed.modules || '').split(',').filter(Boolean).sort()) === JSON.stringify((Array.isArray(moduleKeys) ? moduleKeys.slice().sort() : [])) &&
          String(parsed.q || '') === String(q || '').trim().toLowerCase() &&
          String(parsed.tag || '') === String(tag || '').trim().toLowerCase() &&
          Number(parsed.limit || POSTS_LIMIT) === (Number(limit) || POSTS_LIMIT)
        ) {
          delete postCache[key];
        }
      } catch (_) { }
    });

    const store = getSessionStore();
    if (store && typeof store.remove === 'function') {
      store.remove('feeds', buildFeedSnapshotKey(moduleKeys, q, tag, limit, pathname));
    }
  }

  async function fetchPostsByModule(moduleKeys, page, limit, q, tag, options) {
    if (!window.KCAPI || typeof window.KCAPI.getPosts !== 'function') return [];
    const opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const pathname = String(opts.pathname || window.location.pathname || '').trim() || '/';
    const extra = {
      ...((q && String(q).trim()) ? { q: String(q).trim() } : {}),
      ...((tag && String(tag).trim()) ? { tag: String(tag).trim() } : {}),
    };

    // Only use cache if no search query or tag filter
    if (!q && !tag && opts.forceNetwork !== true) {
      const cached = getCachedPosts(moduleKeys, page, q, tag, limit, pathname);
      if (cached) return cached;
    }

    let posts = [];
    if (moduleKeys.length === 0) {
      posts = await window.KCAPI.getPosts({ page, limit, ...extra });
    } else if (moduleKeys.length === 1) {
      posts = await window.KCAPI.getPosts({ module: moduleKeys[0], page, limit, ...extra });
    } else {
      const merged = [];
      for (const mk of moduleKeys) {
        const part = await window.KCAPI.getPosts({ module: mk, page, limit, ...extra });
        if (Array.isArray(part) && part.length) merged.push(...part);
      }
      posts = merged;
    }

    posts = Array.isArray(posts) ? posts : [];

    // Cache successful fetch if no filters
    if (!q && !tag && posts.length > 0) {
      setCachedPosts(moduleKeys, page, posts, q, tag, limit, pathname);
    }

    return {
      posts,
      timestamp: Date.now(),
      age: 0,
      source: 'network',
    };
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
    const useRealtime = opt.realtime !== false;
    const searchQuery = (opt.q && String(opt.q).trim()) ? String(opt.q).trim() : '';
    const tagFilter = (opt.tag && String(opt.tag).trim()) ? String(opt.tag).trim() : '';

    if (activePager && typeof activePager.destroy === 'function') {
      try { activePager.destroy(); } catch (_) { }
      activePager = null;
    }

    const container = document.querySelector(containerSelector);
    if (!container) return null;

    if (!window.KCUtils || typeof window.KCUtils.renderPostCard !== 'function') {
      warn('[KCControllers] KCUtils.renderPostCard não disponível; mantendo fallback estático.');
      return null;
    }

    const fallbackHTML = container.innerHTML;
    const realtimeUI = createRealtimeBanner(container);
    const pagerUI = createPagerUI(container);

    const state = {
      page: DEFAULT_PAGE,
      status: 'idle',
      done: false,
      loading: false,
      hydrated: false,
      renderedPosts: [],
      seenIds: new Set(),
      pendingIds: new Set(),
      pendingRealtimePosts: [],
      realtimeSub: null,
      destroyed: false,
      lastError: null,
      observer: null,
      snapshotAge: 0,
      lastSnapshotAt: 0,
      revalidateTimer: null,
    };
    const pagePath = String(window.location.pathname || '').trim() || '/';
    const snapshotKey = buildFeedSnapshotKey(moduleKeys, searchQuery, tagFilter, limit, pagePath);

    function persistSnapshot() {
      const store = getSessionStore();
      if (!store || typeof store.set !== 'function' || !state.renderedPosts.length) return;
      store.set('feeds', snapshotKey, {
        page: state.page,
        done: !!state.done,
        posts: state.renderedPosts.slice(0, Math.max(limit * Math.max(state.page, 1), limit * 4)),
      });
    }

    function clearSnapshot() {
      const store = getSessionStore();
      if (!store || typeof store.remove !== 'function') return;
      store.remove('feeds', snapshotKey);
    }

    function setStatus(next, message) {
      state.status = next;
      pagerUI.status.textContent = message || '';
      pagerUI.retryBtn.style.display = next === 'error' ? 'inline-flex' : 'none';

      if (next === 'loading') {
        pagerUI.loadMoreBtn.disabled = true;
        pagerUI.loadMoreBtn.textContent = 'Carregando...';
        pagerUI.loadMoreBtn.style.display = 'inline-flex';
      } else {
        pagerUI.loadMoreBtn.disabled = state.done || state.loading;
        pagerUI.loadMoreBtn.textContent = 'Carregar mais';
        pagerUI.loadMoreBtn.style.display = 'none';
      }

      if (state.done) {
        pagerUI.loadMoreBtn.style.display = 'none';
        if (next !== 'error') pagerUI.status.textContent = 'Fim da lista';
      }
    }

    function normalizePost(raw) {
      return (window.KCPostModel && typeof window.KCPostModel.from === 'function')
        ? window.KCPostModel.from(raw, { pageModule })
        : ((window.KCAPI && typeof window.KCAPI.normalizePost === 'function') ? window.KCAPI.normalizePost(raw) : (raw || {}));
    }

    function appendRenderedPosts(posts, mode) {
      const batch = Array.isArray(posts) ? posts.filter(Boolean) : [];
      if (!batch.length || state.destroyed) return;
      const html = batch.map((post) => window.KCUtils.renderPostCard(post, { pageModule })).join('');
      if (mode === 'prepend') {
        container.insertAdjacentHTML('afterbegin', html);
        state.renderedPosts = batch.concat(state.renderedPosts);
      } else {
        container.insertAdjacentHTML('beforeend', html);
        state.renderedPosts = state.renderedPosts.concat(batch);
      }

      if (typeof opt.onAfterAppend === 'function') {
        try { opt.onAfterAppend({ container, posts: batch, state: { ...state } }); } catch (_) { }
      }

      if (typeof kcInitVoteStates === 'function') {
        setTimeout(() => { try { kcInitVoteStates(); } catch (_) { } }, 0);
      }

      persistSnapshot();
      reapplyFiltersAndSearch();
    }

    function clearPendingRealtime() {
      state.pendingRealtimePosts = [];
      state.pendingIds.clear();
      realtimeUI.update(0);
    }

    function renderPendingRealtimePosts() {
      if (!state.pendingRealtimePosts.length || state.destroyed) return;

      const pending = state.pendingRealtimePosts
        .slice()
        .sort((a, b) => getPostTimestampMs(b.raw || b.post) - getPostTimestampMs(a.raw || a.post));

      const fresh = [];
      pending.forEach((entry, idx) => {
        if (!entry || !entry.post) return;
        if (hasSeenIdentity(state, entry.post, entry.raw, idx)) return;
        markSeenIdentity(state, entry.post, entry.raw, idx);
        fresh.push(entry.post);
      });

      if (!fresh.length) {
        clearPendingRealtime();
        return;
      }

      const firstBefore = container.firstElementChild;
      appendRenderedPosts(fresh, 'prepend');

      const inserted = [];
      let node = container.firstElementChild;
      while (node && node !== firstBefore) {
        if (node.nodeType === 1 && node.classList && node.classList.contains('kc-card')) {
          inserted.push(node);
        }
        node = node.nextElementSibling;
      }
      inserted.forEach((card) => {
        card.classList.add('kc-card--new');
        setTimeout(() => {
          try { card.classList.remove('kc-card--new'); } catch (_) { }
        }, NEW_CARD_HIGHLIGHT_MS);
      });

      clearPendingRealtime();
    }

    function restoreFromSnapshot() {
      const store = getSessionStore();
      if (!store || typeof store.get !== 'function') return false;

      const cached = store.get('feeds', snapshotKey, { maxAge: FEED_CACHE_MAX_AGE_MS });
      const snapshot = cached && cached.value && typeof cached.value === 'object' ? cached.value : null;
      const posts = snapshot && Array.isArray(snapshot.posts) ? snapshot.posts.filter(Boolean) : [];
      if (!posts.length) return false;

      state.page = Math.max(DEFAULT_PAGE, Number(snapshot.page) || 0);
      state.done = snapshot.done === true;
      state.hydrated = true;
      state.snapshotAge = Number(cached.age) || 0;
      state.lastSnapshotAt = Number(cached.timestamp) || 0;
      state.renderedPosts = [];
      state.seenIds.clear();
      container.innerHTML = '';

      const fresh = [];
      posts.forEach((post, idx) => {
        if (hasSeenIdentity(state, post, post, idx)) return;
        markSeenIdentity(state, post, post, idx);
        fresh.push(post);
      });

      appendRenderedPosts(fresh, 'append');
      if (state.done) {
        setStatus('done', 'Fim da lista');
      } else {
        setStatus('idle', '');
      }
      return true;
    }

    async function revalidateSnapshot() {
      if (state.destroyed || state.loading) return;
      const age = state.snapshotAge || (Date.now() - (state.lastSnapshotAt || 0));
      if (age < FEED_REVALIDATE_COOLDOWN_MS) return;

      try {
        const response = await fetchPostsByModule(moduleKeys, 1, limit, searchQuery, tagFilter, {
          forceNetwork: true,
          pathname: pagePath,
        });
        const dbPosts = Array.isArray(response && response.posts) ? response.posts : [];

        let userRaw = [];
        try {
          if (window.kcUserPosts && typeof window.kcUserPosts.list === 'function') userRaw = window.kcUserPosts.list();
        } catch (_) { }
        if (Array.isArray(userRaw) && userRaw.length && moduleKeys.length) {
          const set = new Set(moduleKeys.map(String));
          userRaw = userRaw.filter((p) => set.has(String(p && p.modulo)));
        }

        const rawPosts = [
          ...(Array.isArray(userRaw) ? userRaw.map((p) => ({ ...(p || {}), _kcUserPost: true })) : []),
          ...dbPosts
        ];
        const normalized = rawPosts.map(normalizePost).filter(Boolean);
        const fresh = [];

        normalized.forEach((post, idx) => {
          if (hasSeenIdentity(state, post, rawPosts[idx] || post, idx)) return;
          fresh.push({ post, raw: rawPosts[idx] || post });
        });

        if (fresh.length) {
          fresh.forEach((entry) => state.pendingRealtimePosts.push(entry));
          realtimeUI.update(state.pendingRealtimePosts.length);
        } else {
          persistSnapshot();
        }
      } catch (_) { }
    }

    async function handleRealtimePost(event) {
      if (!event || !event.row || state.destroyed) return;
      const row = event.row;

      const rowId = String(row.id || '').trim();
      if (!rowId) return;
      const rowLegacy = String(row.legacy_id || '').trim();
      const idKeys = [
        `uuid:${rowId}`,
        `id:${rowId}`,
        rowId,
        ...(rowLegacy ? [`legacy:${rowLegacy}`, `id:${rowLegacy}`, rowLegacy] : []),
      ];

      if (idKeys.some((k) => state.seenIds.has(k) || state.pendingIds.has(k))) return;
      idKeys.forEach((k) => state.pendingIds.add(k));

      const raw = await resolveRealtimeRaw(row);
      if (state.destroyed || !raw) return;
      const normalized = normalizePost(raw);
      if (!normalized) return;

      if (hasSeenIdentity(state, normalized, raw, state.pendingRealtimePosts.length)) return;
      state.pendingRealtimePosts.push({ post: normalized, raw });
      realtimeUI.update(state.pendingRealtimePosts.length);
    }

    function startRealtime() {
      if (!useRealtime || state.destroyed) return;
      if (!window.KCRealtime || typeof window.KCRealtime.subscribeNewPosts !== 'function') return;

      try {
        state.realtimeSub = window.KCRealtime.subscribeNewPosts({
          filter: moduleKeys.length ? { module: moduleKeys } : null,
          onPost: handleRealtimePost,
          onError: function (err) { warn('[KCControllers] Realtime do feed falhou.', err); },
        });
      } catch (e) {
        warn('[KCControllers] Não foi possível iniciar Realtime do feed.', e);
      }
    }

    async function loadNextPage() {
      if (state.loading || state.done || state.destroyed) return;
      state.loading = true;
      state.lastError = null;
      /* Limpa placeholder estático do HTML na primeira carga */
      if (!state.hydrated) {
        container.innerHTML = '';
      }
      setStatus('loading');

      const apiPage = state.page + 1;

      try {
        const response = await fetchPostsByModule(moduleKeys, apiPage, limit, searchQuery, tagFilter, {
          pathname: pagePath,
        });
        const dbPosts = Array.isArray(response && response.posts) ? response.posts : [];

        let userRaw = [];
        if (apiPage === 1) {
          try {
            if (window.kcUserPosts && typeof window.kcUserPosts.list === 'function') userRaw = window.kcUserPosts.list();
          } catch (_) { }
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
          const raw = rawPosts[idx];
          if (hasSeenIdentity(state, post, raw, idx)) return;
          markSeenIdentity(state, post, raw, idx);
          fresh.push(post);
        });

        if (!state.hydrated) {
          container.innerHTML = '';
          state.hydrated = true;
        }

        if (fresh.length) {
          appendRenderedPosts(fresh, 'append');
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
        console.error('[KCControllers] Falha ao carregar posts do feed.', {
          page: apiPage,
          limit,
          modules: moduleKeys.length ? moduleKeys.slice() : ['all'],
          message: err && err.message ? err.message : String(err || 'Erro desconhecido'),
        });
        setStatus('error', 'Não foi possível carregar os posts. Tente novamente.');
      } finally {
        state.loading = false;
        if (state.status !== 'error' && !state.done) setStatus('idle', '');
      }
    }

    const onLoadMoreClick = () => { loadNextPage(); };
    const onRetryClick = () => { loadNextPage(); };
    const onRealtimeClick = () => { renderPendingRealtimePosts(); };
    const onPageHide = () => { destroy(); };
    let api = null;

    function destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      if (state.revalidateTimer) {
        clearTimeout(state.revalidateTimer);
        state.revalidateTimer = null;
      }

      try { pagerUI.loadMoreBtn.removeEventListener('click', onLoadMoreClick); } catch (_) { }
      try { pagerUI.retryBtn.removeEventListener('click', onRetryClick); } catch (_) { }
      try { realtimeUI.btn.removeEventListener('click', onRealtimeClick); } catch (_) { }
      try { window.removeEventListener('pagehide', onPageHide); } catch (_) { }
      try {
        if (state.realtimeSub && typeof state.realtimeSub.unsubscribe === 'function') {
          state.realtimeSub.unsubscribe();
        }
      } catch (_) { }
      try {
        if (state.observer) {
          state.observer.disconnect();
          state.observer = null;
        }
      } catch (_) { }

      state.realtimeSub = null;
      clearPendingRealtime();

      try { pagerUI.wrap.remove(); } catch (_) { }
      try { realtimeUI.banner.remove(); } catch (_) { }

      if (activePager && activePager === api) activePager = null;
    }

    pagerUI.loadMoreBtn.addEventListener('click', onLoadMoreClick);
    pagerUI.retryBtn.addEventListener('click', onRetryClick);
    realtimeUI.btn.addEventListener('click', onRealtimeClick);
    window.addEventListener('pagehide', onPageHide);

    function setupObserver() {
      if (!window.IntersectionObserver) return;
      state.observer = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && !state.loading && !state.done && !state.destroyed && state.status !== 'error') {
          loadNextPage();
        }
      }, { rootMargin: '400px' });
      state.observer.observe(pagerUI.wrap);
    }

    setupObserver();

    // Initialize pull-to-refresh
    if (typeof window.KCPullToRefresh !== 'undefined') {
      try {
        window.KCPullToRefresh.init({
          container: document.body,
          onRefresh: () => {
            // Invalidate cache and reload first page
            invalidateCache(moduleKeys, searchQuery, tagFilter, limit, pagePath);
            state.page = DEFAULT_PAGE;
            state.done = false;
            state.renderedPosts = [];
            state.seenIds.clear();
            container.innerHTML = '';
            clearSnapshot();
            clearPendingRealtime();
            loadNextPage();
          }
        });
      } catch (e) {
        warn('[KCControllers] Failed to initialize pull-to-refresh:', e);
      }
    }

    const restored = restoreFromSnapshot();
    if (restored) {
      state.revalidateTimer = window.setTimeout(revalidateSnapshot, 40);
    } else {
      loadNextPage();
    }
    startRealtime();

    api = {
      loadNextPage,
      retry: loadNextPage,
      getState: () => ({ ...state }),
      destroy,
    };
    activePager = api;
    return api;
  }

  async function injectFeed(options) {
    return createFeedPager(options);
  }

  window.KCControllers = Object.freeze({
    injectFeed,
    createFeedPager,
  });
})();

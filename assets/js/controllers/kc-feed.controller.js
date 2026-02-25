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
  async function fetchPostsByModule(moduleKeys, page, limit, q, tag) {
    if (!window.KCAPI || typeof window.KCAPI.getPosts !== 'function') return [];
    const extra = {
      ...((q && String(q).trim()) ? { q: String(q).trim() } : {}),
      ...((tag && String(tag).trim()) ? { tag: String(tag).trim() } : {}),
    };

    if (moduleKeys.length === 0) {
      const posts = await window.KCAPI.getPosts({ page, limit, ...extra });
      return Array.isArray(posts) ? posts : [];
    }

    if (moduleKeys.length === 1) {
      const posts = await window.KCAPI.getPosts({ module: moduleKeys[0], page, limit, ...extra });
      return Array.isArray(posts) ? posts : [];
    }

    const merged = [];
    for (const mk of moduleKeys) {
      const part = await window.KCAPI.getPosts({ module: mk, page, limit, ...extra });
      if (Array.isArray(part) && part.length) merged.push(...part);
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
      seenIds: new Set(),
      pendingIds: new Set(),
      pendingRealtimePosts: [],
      realtimeSub: null,
      destroyed: false,
      lastError: null,
      observer: null,
    };

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
      const html = fresh.map((post) => window.KCUtils.renderPostCard(post, { pageModule })).join('');
      container.insertAdjacentHTML('afterbegin', html);

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
      reapplyFiltersAndSearch();
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
      setStatus('loading', 'Carregando...');

      const apiPage = state.page + 1;

      try {
        const dbPosts = await fetchPostsByModule(moduleKeys, apiPage, limit, searchQuery, tagFilter);

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
          const html = fresh.map((post) => window.KCUtils.renderPostCard(post, { pageModule })).join('');
          container.insertAdjacentHTML('beforeend', html);

          if (typeof opt.onAfterAppend === 'function') {
            try { opt.onAfterAppend({ container, posts: fresh, state: { ...state } }); } catch (_) { }
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
    loadNextPage();
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

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
  const FEED_SNAPSHOT_VERSION = 4;
  const NEW_CARD_HIGHLIGHT_MS = 1500;
  const FEED_CACHE_MAX_AGE_MS = 1000 * 60 * 2;
  const FEED_REVALIDATE_COOLDOWN_MS = 1000 * 60 * 3; // 3 min — menos revalidações agressivas
  const FEED_FOCUS_REVALIDATE_MS = 1000 * 60 * 2;   // 2 min — só revalida ao focar após 2 min fora
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

  function normalizeRequestParamValue(value) {
    if (Array.isArray(value)) {
      return Array.from(new Set(value
        .map((item) => normalizeRequestParamValue(item))
        .filter((item) => item !== null && item !== '')));
    }
    if (value == null) return null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const text = String(value).trim();
    return text || null;
  }

  function sanitizeRequestParams(params) {
    const source = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
    const reserved = new Set(['module', 'modules', 'cursor', 'limit', 'q', 'tag', 'sortBy', 'sort_by']);
    const next = {};

    Object.keys(source).sort().forEach((key) => {
      if (reserved.has(key)) return;
      const normalized = normalizeRequestParamValue(source[key]);
      if (normalized == null) return;
      if (Array.isArray(normalized) && !normalized.length) return;
      next[key] = normalized;
    });

    return next;
  }

  function getCoreFilterState() {
    try {
      if (!window.kcFilters || typeof window.kcFilters.getState !== 'function') return { category: '', query: '' };
      const core = window.kcFilters.getState() || {};
      const rawCategory = String(core.category || '').trim();
      const canonical = typeof window.kcFilters.canonicalCategory === 'function'
        ? window.kcFilters.canonicalCategory(rawCategory)
        : rawCategory.toLowerCase();
      return {
        category: (!canonical || canonical === 'toda' || canonical === 'todas') ? '' : rawCategory,
        query: String(core.query || '').trim(),
      };
    } catch (_) {
      return { category: '', query: '' };
    }
  }

  const CORE_CATEGORY_KEYS = Object.freeze({
    eventos: new Set(['academicos', 'palestras', 'congressos', 'cursos', 'culturais', 'esportivos', 'workshops', 'festas', 'sustentabilidade']),
    oportunidades: new Set(['editais', 'concursos', 'bolsas', 'estagios', 'empregos', 'monitoria', 'pesquisa', 'cursos-capacitacoes', 'voluntariado', 'freelancer']),
    moradia: new Set(['republicas', 'quartos', 'apartamentos', 'casas', 'procurando']),
    'compra-venda': new Set(['eletronicos', 'livros', 'ingressos', 'moveis', 'vestuario', 'outros']),
    caronas: new Set(['ofereco', 'procuro']),
    'achados-perdidos': new Set(['perdidos', 'encontrados']),
  });

  const CORE_CATEGORY_ALIASES = Object.freeze({
    academica: 'academicos',
    academico: 'academicos',
    palestra: 'palestras',
    congresso: 'congressos',
    curso: 'cursos',
    cultural: 'culturais',
    esportivo: 'esportivos',
    workshop: 'workshops',
    festa: 'festas',
    edital: 'editais',
    concurso: 'concursos',
    bolsa: 'bolsas',
    estagio: 'estagios',
    emprego: 'empregos',
    'curso-capacitacao': 'cursos-capacitacoes',
    republica: 'republicas',
    quarto: 'quartos',
    apartamento: 'apartamentos',
    casa: 'casas',
    eletronico: 'eletronicos',
    livro: 'livros',
    ingresso: 'ingressos',
    movel: 'moveis',
    outro: 'outros',
    'ofereco-carona': 'ofereco',
    'procuro-carona': 'procuro',
    perdido: 'perdidos',
    achado: 'encontrados',
    encontrado: 'encontrados',
  });

  function normalizeCoreCategory(moduleKey, value) {
    const raw = String(value || '').trim();
    const canonical = raw.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!canonical || canonical === 'toda' || canonical === 'todas') return '';
    const normalized = CORE_CATEGORY_ALIASES[canonical] || canonical;
    const allowed = CORE_CATEGORY_KEYS[String(moduleKey || '').trim().toLowerCase()];
    return allowed && allowed.has(normalized) ? normalized : '';
  }

  function withCoreCategory(params, category) {
    const next = sanitizeRequestParams(params);
    const rawCategory = String(category || '').trim();
    if (rawCategory) next.category = rawCategory;
    return sanitizeRequestParams(next);
  }

  function getRequestParamsKey(params) {
    const normalized = sanitizeRequestParams(params);
    return Object.keys(normalized).length ? JSON.stringify(normalized) : '';
  }

  function buildFeedCacheIdentity(moduleKeys, cursor, q, tag, limit, pathname, sortBy, requestParams) {
    const modules = Array.isArray(moduleKeys) ? moduleKeys.slice().sort().join(',') : String(moduleKeys || '');
    return JSON.stringify({
      pathname: String(pathname || window.location.pathname || '').trim() || '/',
      modules,
      cursor: String(cursor || ''),
      q: String(q || '').trim().toLowerCase(),
      tag: String(tag || '').trim().toLowerCase(),
      limit: Number(limit) || POSTS_LIMIT,
      sortBy: String(sortBy || 'recentes'),
      request: getRequestParamsKey(requestParams),
    });
  }

  function buildFeedSnapshotKey(moduleKeys, q, tag, limit, pathname, sortBy, requestParams) {
    return JSON.stringify({
      pathname: String(pathname || window.location.pathname || '').trim() || '/',
      modules: Array.isArray(moduleKeys) ? moduleKeys.slice().sort() : [],
      q: String(q || '').trim().toLowerCase(),
      tag: String(tag || '').trim().toLowerCase(),
      limit: Number(limit) || POSTS_LIMIT,
      sortBy: String(sortBy || 'recentes'),
      request: getRequestParamsKey(requestParams),
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
    const ts = raw && (raw.effective_at || raw.effectiveAt || raw.bumped_at || raw.bumpedAt || raw.created_at || raw.createdAt || raw.timestamp || raw.data);
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

  function getCacheKey(moduleKeys, cursor, q, tag, limit, pathname, sortBy, requestParams) {
    return buildFeedCacheIdentity(moduleKeys, cursor, q, tag, limit, pathname, sortBy, requestParams);
  }

  function getCachedPosts(moduleKeys, cursor, q, tag, limit, pathname, sortBy, requestParams) {
    const key = getCacheKey(moduleKeys, cursor, q, tag, limit, pathname, sortBy, requestParams);
    const cached = postCache[key];
    if (!cached) return null;
    const now = Date.now();
    if (now - cached.timestamp > CACHE_TTL_MS) {
      delete postCache[key];
      return null;
    }
    return {
      posts: cached.posts,
      nextCursor: cached.nextCursor,
      hasMore: cached.hasMore === true,
      timestamp: cached.timestamp,
      age: now - cached.timestamp,
      source: 'memory',
    };
  }

  function setCachedPosts(moduleKeys, cursor, payload, q, tag, limit, pathname, sortBy, requestParams) {
    const key = getCacheKey(moduleKeys, cursor, q, tag, limit, pathname, sortBy, requestParams);
    postCache[key] = {
      posts: Array.isArray(payload && payload.posts) ? payload.posts : [],
      nextCursor: payload && payload.nextCursor ? String(payload.nextCursor) : null,
      hasMore: !!(payload && payload.hasMore === true),
      timestamp: Date.now(),
    };
  }

  function invalidateCache(moduleKeys, q, tag, limit, pathname, sortBy, requestParams) {
    const targetPath = String(pathname || window.location.pathname || '').trim() || '/';
    const targetRequest = getRequestParamsKey(requestParams);
    Object.keys(postCache).forEach((key) => {
      try {
        const parsed = JSON.parse(key);
        if (
          parsed &&
          parsed.pathname === targetPath &&
          JSON.stringify((parsed.modules || '').split(',').filter(Boolean).sort()) === JSON.stringify((Array.isArray(moduleKeys) ? moduleKeys.slice().sort() : [])) &&
          String(parsed.q || '') === String(q || '').trim().toLowerCase() &&
          String(parsed.tag || '') === String(tag || '').trim().toLowerCase() &&
          Number(parsed.limit || POSTS_LIMIT) === (Number(limit) || POSTS_LIMIT) &&
          String(parsed.sortBy || 'recentes') === String(sortBy || 'recentes') &&
          String(parsed.request || '') === targetRequest
        ) {
          delete postCache[key];
        }
      } catch (_) { }
    });

    const store = getSessionStore();
    if (store && typeof store.remove === 'function') {
      store.remove('feeds', buildFeedSnapshotKey(moduleKeys, q, tag, limit, pathname, sortBy, requestParams));
    }
  }

  async function fetchPostsByModule(moduleKeys, cursor, limit, q, tag, options) {
    if (!window.KCAPI || typeof window.KCAPI.getFeedCursor !== 'function') {
      return {
        posts: [],
        nextCursor: null,
        hasMore: false,
        timestamp: Date.now(),
        age: 0,
        source: 'network',
      };
    }
    const opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const pathname = String(opts.pathname || window.location.pathname || '').trim() || '/';
    const sortBy = String(opts.sortBy || 'recentes');
    const requestParams = sanitizeRequestParams(opts.requestParams);
    const extra = {
      ...requestParams,
      ...((q && String(q).trim()) ? { q: String(q).trim() } : {}),
      ...((tag && String(tag).trim()) ? { tag: String(tag).trim() } : {}),
      sortBy,
      limit,
      ...(cursor ? { cursor: String(cursor) } : {}),
    };
    if (moduleKeys.length === 1) extra.module = moduleKeys[0];
    else if (moduleKeys.length > 1) extra.module = moduleKeys.slice();

    // Only use cache if no search query or tag filter
    if (!q && !tag && opts.forceNetwork !== true) {
      const cached = getCachedPosts(moduleKeys, cursor, q, tag, limit, pathname, sortBy, requestParams);
      if (cached) return cached;
    }

    const response = await window.KCAPI.getFeedCursor(extra);
    const posts = Array.isArray(response && response.posts) ? response.posts : [];
    const nextCursor = response && response.nextCursor ? String(response.nextCursor) : null;
    const hasMore = !!(response && response.hasMore === true);

    return {
      posts,
      nextCursor,
      hasMore,
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
    const initialCoreFilter = getCoreFilterState();
    let searchQuery = (opt.q && String(opt.q).trim()) ? String(opt.q).trim() : initialCoreFilter.query;
    const tagFilter = (opt.tag && String(opt.tag).trim()) ? String(opt.tag).trim() : '';
    const sortBy = String(opt.sortBy || 'recentes');
    const initialRequestParams = sanitizeRequestParams(
      typeof opt.getRequestParams === 'function' ? opt.getRequestParams() : opt.requestParams
    );
    const initialCoreCategory = normalizeCoreCategory(pageModule, initialCoreFilter.category);

    // keepExisting: true permite múltiplos pagers na mesma página (ex: abas Destaques/Recentes)
    if (!opt.keepExisting && activePager && typeof activePager.destroy === 'function') {
      try { activePager.destroy(); } catch (_) { }
      activePager = null;
    }

    const container = document.querySelector(containerSelector);
    if (!container) return null;

    if (!window.KCUtils || typeof window.KCUtils.renderPostCard !== 'function') {
      const hasLoadingFallback = !container.children.length
        || !!container.querySelector('.fa-spinner, .kc-loading')
        || /\bcarregando\b/i.test(String(container.textContent || ''));
      if (hasLoadingFallback) {
        container.setAttribute('aria-busy', 'false');
        container.setAttribute('aria-live', 'polite');
        container.innerHTML = [
          '<div class="kc-no-results" data-kc-feed-error="renderer-unavailable" role="status">',
          '<i class="fas fa-triangle-exclamation" aria-hidden="true"></i>',
          '<p class="kc-no-results__title">Não foi possível carregar as publicações</p>',
          '<p>Atualize a página. Se o problema continuar, tente novamente em alguns instantes.</p>',
          '</div>'
        ].join('');
      }
      warn('[KCControllers] KCUtils.renderPostCard não disponível; fallback de carregamento encerrado.');
      return null;
    }

    const fallbackHTML = container.innerHTML;
    const realtimeUI = createRealtimeBanner(container);
    const pagerUI = createPagerUI(container);

    const state = {
      cursor: null,
      nextCursor: null,
      hasMore: true,
      status: 'idle',
      done: false,
      loading: false,
      hydrated: false,
      renderedPosts: [],
      seenIds: new Set(),
      pendingIds: new Set(),
      pendingRealtimePosts: [],
      realtimeSub: null,
      postChangesSub: null,
      destroyed: false,
      lastError: null,
      observer: null,
      snapshotAge: 0,
      lastSnapshotAt: 0,
      revalidateTimer: null,
      freshnessTimer: null,
      freshnessUnsub: null,
      requestParams: initialRequestParams,
      coreCategory: initialCoreCategory,
      requestGeneration: 0,
      paginationRevision: 0,
      contentRevision: 0,
      realtimeRevision: 0,
      revalidating: false,
      firstPageCount: 0,
    };
    const pagePath = String(window.location.pathname || '').trim() || '/';

    function getEffectiveRequestParams() {
      return withCoreCategory(state.requestParams, state.coreCategory);
    }

    function getPageEmptyState() {
      const section = typeof container.closest === 'function' ? container.closest('section') : null;
      return section && typeof section.querySelector === 'function' ? section.querySelector('#noResults') : null;
    }

    function removeGeneratedEmptyState() {
      const generated = container.querySelector('[data-kc-feed-empty="true"]');
      if (generated) generated.remove();
    }

    function syncFeedEmptyState() {
      const isEmpty = state.hydrated && state.done && state.renderedPosts.length === 0;
      const pageEmpty = getPageEmptyState();
      if (pageEmpty) {
        if (isEmpty) pageEmpty.style.display = '';
        removeGeneratedEmptyState();
        return;
      }

      removeGeneratedEmptyState();
      if (!isEmpty) return;

      const empty = document.createElement('div');
      empty.className = 'kc-no-results';
      empty.setAttribute('data-kc-feed-empty', 'true');

      const icon = document.createElement('i');
      icon.className = 'fas fa-layer-group';
      icon.setAttribute('aria-hidden', 'true');

      const title = document.createElement('p');
      title.className = 'kc-no-results__title';
      title.textContent = 'Nenhuma publicação disponível agora';

      const description = document.createElement('p');
      description.textContent = 'Consulte os módulos da comunidade UFG ou volte mais tarde para ver novas publicações.';

      empty.appendChild(icon);
      empty.appendChild(title);
      empty.appendChild(description);
      container.appendChild(empty);
    }

    function getSnapshotKey() {
      return buildFeedSnapshotKey(moduleKeys, searchQuery, tagFilter, limit, pagePath, sortBy, getEffectiveRequestParams());
    }

    function persistSnapshot() {
      const store = getSessionStore();
      if (!store || typeof store.set !== 'function' || !state.renderedPosts.length) return;
      state.lastSnapshotAt = Date.now();
      state.snapshotAge = 0;
      store.set('feeds', getSnapshotKey(), {
        version: FEED_SNAPSHOT_VERSION,
        cursor: state.cursor,
        nextCursor: state.nextCursor,
        hasMore: state.hasMore === true,
        done: !!state.done,
        firstPageCount: state.firstPageCount,
        posts: state.renderedPosts.slice(),
      });
    }

    function clearSnapshot() {
      const store = getSessionStore();
      if (!store || typeof store.remove !== 'function') return;
      store.remove('feeds', getSnapshotKey());
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
        const showLoadMore = next !== 'error' && !state.done && state.hasMore && state.hydrated;
        pagerUI.loadMoreBtn.disabled = state.loading;
        pagerUI.loadMoreBtn.textContent = 'Carregar mais';
        pagerUI.loadMoreBtn.style.display = showLoadMore ? 'inline-flex' : 'none';
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

    function isRenderableFeedPost(post) {
      const status = String(post && (post.status || post.estado) || 'published').trim().toLowerCase();
      return !status || status === 'published' || status === 'closed';
    }

    function runPostRenderHooks(batch, mode) {
      if (typeof opt.onAfterAppend === 'function') {
        try { opt.onAfterAppend({ container, posts: batch, state: { ...state }, mode: mode || 'append' }); } catch (_) { }
      }

      if (typeof kcInitVoteStates === 'function') {
        // Debounce: evita múltiplas chamadas ao RPC quando vários posts são appendados rapidamente
        if (typeof window._kcVoteInitTimer !== 'undefined') clearTimeout(window._kcVoteInitTimer);
        window._kcVoteInitTimer = setTimeout(() => {
          try { kcInitVoteStates(); } catch (_) { }
        }, 50);
      }
    }

    function appendRenderedPosts(posts, mode) {
      const batch = Array.isArray(posts) ? posts.filter(Boolean) : [];
      if (!batch.length || state.destroyed) return;
      removeGeneratedEmptyState();
      const html = batch.map((post) => window.KCUtils.renderPostCard(post, { pageModule })).join('');
      if (mode === 'prepend') {
        container.insertAdjacentHTML('afterbegin', html);
        state.renderedPosts = batch.concat(state.renderedPosts);
        state.firstPageCount += batch.length;
      } else {
        container.insertAdjacentHTML('beforeend', html);
        state.renderedPosts = state.renderedPosts.concat(batch);
      }
      state.contentRevision += 1;
      runPostRenderHooks(batch, mode);

      if (mode !== 'restore') persistSnapshot();
      reapplyFiltersAndSearch();
    }

    function replaceRenderedPosts(posts, nextMeta) {
      const batch = Array.isArray(posts) ? posts.filter(isRenderableFeedPost) : [];
      state.renderedPosts = [];
      state.seenIds.clear();
      container.innerHTML = '';
      batch.forEach((post, idx) => {
        markSeenIdentity(state, post, post, idx);
      });
      if (batch.length) {
        container.insertAdjacentHTML('beforeend', batch.map((post) => window.KCUtils.renderPostCard(post, { pageModule })).join(''));
        state.renderedPosts = batch.slice();
      }
      state.contentRevision += 1;
      if (batch.length) runPostRenderHooks(batch, 'replace');
      if (nextMeta && typeof nextMeta === 'object') {
        state.nextCursor = nextMeta.nextCursor || null;
        state.hasMore = nextMeta.hasMore === true;
        state.done = !state.hasMore;
      }
      state.hydrated = true;
      syncFeedEmptyState();
      if (state.done) setStatus('done', 'Fim da lista');
      else setStatus('idle', '');
      reconcilePendingRealtimeAgainstRendered();
      if (batch.length) persistSnapshot();
      else clearSnapshot();
      reapplyFiltersAndSearch();
    }

    function buildRenderedSignature(posts) {
      return (Array.isArray(posts) ? posts : []).map((post) => {
        const id = String(post && (post.uuid || post.id || post.legacyId || post.legacy_id) || '');
        const status = String(post && (post.status || post.estado) || '');
        const updated = String(post && (post.updated_at || post.updatedAt || post.bumped_at || post.bumpedAt || '') || '');
        const title = String(post && (post.title || post.titulo) || '');
        const description = String(post && (post.description || post.descricao) || '');
        const category = String(post && (post.category || post.categoria) || '');
        const location = String(post && (post.location || post.localizacao || post.local) || '');
        const rawPrice = post ? (post.price ?? post.preco) : '';
        const price = String(rawPrice ?? '');
        const image = String(post && (post.image_url || post.imageUrl || post.imagem || post.image) || '');
        let metadata = '';
        try { metadata = JSON.stringify(post && (post.metadata || post.meta || post._meta) || {}); } catch (_) { }
        return [id, status, updated, title, description, category, location, price, image, metadata].join(':');
      }).join('|');
    }

    function clearPendingRealtime() {
      state.pendingRealtimePosts = [];
      state.pendingIds.clear();
      realtimeUI.update(0);
    }

    function reconcilePendingRealtimeAgainstRendered() {
      const remaining = state.pendingRealtimePosts.filter((entry, idx) => {
        return entry && entry.post && !hasSeenIdentity(state, entry.post, entry.raw, idx);
      });
      state.pendingRealtimePosts = remaining;
      state.pendingIds.clear();
      remaining.forEach((entry, idx) => {
        getIdentityAliases(entry.post, entry.raw, idx).forEach((key) => state.pendingIds.add(key));
      });
      realtimeUI.update(remaining.length);
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

      // Scroll para o topo do feed para que os novos posts sejam visíveis
      try {
        const scrollTarget = inserted.length ? inserted[0] : container;
        scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (_) { }
    }

    function realtimePostMatchesContext(post) {
      try {
        if (!window.KCAPI || typeof window.KCAPI.filterPosts !== 'function') return true;
        const params = {
          ...getEffectiveRequestParams(),
          module: moduleKeys.length === 1 ? moduleKeys[0] : moduleKeys,
          q: searchQuery,
          tag: tagFilter,
        };
        const matches = window.KCAPI.filterPosts([post], params);
        return Array.isArray(matches) && matches.length > 0;
      } catch (_) {
        // Não bloqueia o realtime se o módulo de filtros ainda não carregou.
        return true;
      }
    }

    function restoreFromSnapshot() {
      const store = getSessionStore();
      if (!store || typeof store.get !== 'function') return false;

      const cached = store.get('feeds', getSnapshotKey(), { maxAge: FEED_CACHE_MAX_AGE_MS });
      const snapshot = cached && cached.value && typeof cached.value === 'object' ? cached.value : null;
      const isCursorSnapshot = !!(snapshot && Number(snapshot.version) === FEED_SNAPSHOT_VERSION && typeof snapshot.hasMore === 'boolean');
      if (snapshot && !isCursorSnapshot) {
        clearSnapshot();
        return false;
      }
      const posts = snapshot && Array.isArray(snapshot.posts) ? snapshot.posts.filter(Boolean).filter(isRenderableFeedPost) : [];
      if (!posts.length) return false;

      state.cursor = snapshot.cursor ? String(snapshot.cursor) : null;
      state.nextCursor = snapshot.nextCursor ? String(snapshot.nextCursor) : null;
      state.hasMore = snapshot.hasMore === true;
      state.done = snapshot.done === true || snapshot.hasMore === false;
      state.hydrated = true;
      state.snapshotAge = Number(cached.age) || 0;
      state.lastSnapshotAt = Number(cached.timestamp) || 0;
      state.firstPageCount = Number.isFinite(Number(snapshot.firstPageCount))
        ? Math.max(0, Math.min(posts.length, Number(snapshot.firstPageCount)))
        : Math.min(posts.length, limit);
      state.renderedPosts = [];
      state.seenIds.clear();
      container.innerHTML = '';

      const fresh = [];
      posts.forEach((post, idx) => {
        if (hasSeenIdentity(state, post, post, idx)) return;
        markSeenIdentity(state, post, post, idx);
        fresh.push(post);
      });

      appendRenderedPosts(fresh, 'restore');
      if (state.done) {
        setStatus('done', 'Fim da lista');
      } else {
        setStatus('idle', '');
      }
      return true;
    }

    async function revalidateSnapshot() {
      if (state.destroyed || state.loading || state.revalidating) return;
      const age = state.snapshotAge || (Date.now() - (state.lastSnapshotAt || 0));
      if (age < FEED_REVALIDATE_COOLDOWN_MS) return;
      const requestGeneration = state.requestGeneration;
      const paginationRevision = state.paginationRevision;
      const contentRevision = state.contentRevision;
      const realtimeRevision = state.realtimeRevision;
      const requestQuery = searchQuery;
      const requestParams = getEffectiveRequestParams();
      state.revalidating = true;

      try {
        const response = await fetchPostsByModule(moduleKeys, null, limit, requestQuery, tagFilter, {
          forceNetwork: true,
          pathname: pagePath,
          sortBy,
          requestParams,
        });
        if (
          state.destroyed ||
          requestGeneration !== state.requestGeneration ||
          paginationRevision !== state.paginationRevision ||
          contentRevision !== state.contentRevision ||
          realtimeRevision !== state.realtimeRevision
        ) return;
        if (response && response.source === 'network' && !requestQuery && !tagFilter) {
          const cachePosts = Array.isArray(response.posts) ? response.posts : [];
          if (cachePosts.length || response.hasMore === true) {
            setCachedPosts(moduleKeys, null, response, requestQuery, tagFilter, limit, pagePath, sortBy, requestParams);
          }
        }
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
        const normalized = rawPosts.map(normalizePost).filter(Boolean).filter(isRenderableFeedPost);
        const nextMeta = {
          nextCursor: response && response.nextCursor ? String(response.nextCursor) : null,
          hasMore: !!(response && response.hasMore === true),
        };

        // Revalidação em segundo plano que volta vazia (blip de rede ou erro
        // transitório resolvido para []) NÃO deve apagar o feed já renderizado —
        // isso causava o feed "sumir / não carregar". Um feed genuinamente vazio
        // é confirmado por refresh explícito (ex.: pull-to-refresh) ou reload.
        if (!normalized.length && state.renderedPosts.length) {
          return;
        }

        const hasAdditionalPages = state.cursor != null;
        const comparablePosts = hasAdditionalPages
          ? state.renderedPosts.slice(0, state.firstPageCount || Math.min(limit, state.renderedPosts.length))
          : state.renderedPosts;
        if (buildRenderedSignature(normalized) !== buildRenderedSignature(comparablePosts)) {
          if (hasAdditionalPages) {
            const tail = state.renderedPosts.slice(state.firstPageCount || Math.min(limit, state.renderedPosts.length));
            const firstPageIds = new Set(normalized.map((post, idx) => getPostIdentity(post, idx)));
            const preservedTail = tail.filter((post, idx) => !firstPageIds.has(getPostIdentity(post, idx)));
            const currentMeta = { nextCursor: state.nextCursor, hasMore: state.hasMore };
            state.firstPageCount = normalized.length;
            replaceRenderedPosts(normalized.concat(preservedTail), currentMeta);
          } else {
            state.firstPageCount = normalized.length;
            replaceRenderedPosts(normalized, nextMeta);
          }
        } else {
          if (!hasAdditionalPages) {
            state.nextCursor = nextMeta.nextCursor;
            state.hasMore = nextMeta.hasMore;
            state.done = !state.hasMore;
          }
          persistSnapshot();
        }
      } catch (_) { }
      finally {
        state.revalidating = false;
      }
    }

    async function handleRealtimePost(event) {
      if (!event || !event.row || state.destroyed) return;
      const row = event.row;
      const requestGeneration = state.requestGeneration;

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
      let accepted = false;

      try {
        const raw = await resolveRealtimeRaw(row);
        if (state.destroyed || requestGeneration !== state.requestGeneration || !raw) return;
        const normalized = normalizePost(raw);
        if (!normalized || !realtimePostMatchesContext(normalized)) return;

        if (hasSeenIdentity(state, normalized, raw, state.pendingRealtimePosts.length)) return;
        state.pendingRealtimePosts.push({ post: normalized, raw });
        state.realtimeRevision += 1;
        realtimeUI.update(state.pendingRealtimePosts.length);
        accepted = true;
      } catch (error) {
        warn('[KCControllers] Falha ao resolver post novo do realtime.', error);
      } finally {
        if (!accepted) idKeys.forEach((key) => state.pendingIds.delete(key));
      }
    }

    function scheduleFreshnessRefresh(reason) {
      if (state.destroyed) return;
      if (state.freshnessTimer) clearTimeout(state.freshnessTimer);
      state.freshnessTimer = window.setTimeout(function () {
        state.freshnessTimer = null;
        if (state.destroyed || !api || typeof api.refresh !== 'function') return;
        api.refresh({ requestParams: state.requestParams, reason: reason || 'freshness' });
      }, 120);
    }

    function applySoftMetricPatch(change) {
      try {
        const postId = String(
          change.postId || change.uuid || (change.row && (change.row.id || change.row.uuid)) || '',
        ).trim();
        const scoreRaw = (change.votos != null)
          ? change.votos
          : (change.row && change.row.votos != null ? change.row.votos : null);
        if (postId && scoreRaw != null && typeof kcUpdateVoteScoreInDOM === 'function') {
          kcUpdateVoteScoreInDOM(postId, scoreRaw);
        }
      } catch (_) { /* keep feed stable */ }
    }

    function shouldHardRefreshOnPostChange(change) {
      const changeType = String(change && change.type || '').trim().toLowerCase();
      const source = String(change && change.source || '').trim().toLowerCase();

      // New posts are handled by the realtime banner / prepend path.
      if (changeType === 'created') return false;

      // Explicit engagement classification.
      if (
        changeType === 'metrics_updated'
        || changeType === 'vote_metrics'
        || changeType === 'metrics'
      ) {
        return false;
      }

      // Generic "updated" is the default postgres UPDATE label. Voting updates
      // posts.votos + highlight_score (and updated_at) and used to wipe every
      // home tab (#destaques/#recentes/#comentados). Soft-patch only when the
      // event originates from realtime; API mutations still hard-refresh.
      if (changeType === 'updated' || changeType === '') {
        if (
          source === 'realtime'
          || source === 'realtime-broadcast'
          || source.indexOf('realtime') !== -1
          || source === 'broadcast'
          || source === 'remote'
          || !source
        ) {
          return false;
        }
        // source=api | my-posts | admin | moderation → content/status mutation
        return true;
      }

      // soft_deleted, purged, status_changed, edited, etc.
      return true;
    }

    function handlePostChange(change) {
      if (!change || state.destroyed) return;
      const changeModule = String(change.module || '').trim().toLowerCase();
      if (moduleKeys.length && changeModule && moduleKeys.indexOf(changeModule) === -1) return;
      if (change.type === 'created') return;

      // Never wipe the feed (scroll + page state) on vote/view/highlight noise.
      // voting.js already patches .kc-vote-box scores; reinforce as a fallback.
      if (!shouldHardRefreshOnPostChange(change)) {
        applySoftMetricPatch(change);
        return;
      }

      scheduleFreshnessRefresh(change.type || 'post_change');
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
        if (typeof window.KCRealtime.subscribePostChanges === 'function') {
          state.postChangesSub = window.KCRealtime.subscribePostChanges({
            filter: moduleKeys.length ? { module: moduleKeys } : null,
            onChange: handlePostChange,
            onError: function (err) { warn('[KCControllers] Realtime de mudancas falhou.', err); },
          });
        }
      } catch (e) {
        warn('[KCControllers] Não foi possível iniciar Realtime do feed.', e);
      }
    }

    async function loadNextPage() {
      if (state.loading || state.done || state.destroyed || (!state.hasMore && state.hydrated)) return;
      const requestGeneration = state.requestGeneration;
      const requestQuery = searchQuery;
      const requestParams = getEffectiveRequestParams();
      state.loading = true;
      state.lastError = null;
      /* Limpa placeholder estático do HTML na primeira carga */
      if (!state.hydrated) {
        container.innerHTML = '';
      }
      setStatus('loading');

      const requestCursor = state.nextCursor || null;

      try {
        const response = await fetchPostsByModule(moduleKeys, requestCursor, limit, requestQuery, tagFilter, {
          pathname: pagePath,
          sortBy,
          requestParams,
        });
        if (state.destroyed || requestGeneration !== state.requestGeneration) return;
        if (response && response.source === 'network' && !requestQuery && !tagFilter) {
          const cachePosts = Array.isArray(response.posts) ? response.posts : [];
          if (cachePosts.length || response.hasMore === true) {
            setCachedPosts(moduleKeys, requestCursor, response, requestQuery, tagFilter, limit, pagePath, sortBy, requestParams);
          }
        }
        const dbPosts = Array.isArray(response && response.posts) ? response.posts : [];
        const nextCursor = response && response.nextCursor ? String(response.nextCursor) : null;
        const hasMore = !!(response && response.hasMore === true);

        let userRaw = [];
        if (!requestCursor) {
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

        const normalized = rawPosts.map(normalizePost).map((post) => isRenderableFeedPost(post) ? post : null);
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

        state.cursor = requestCursor;
        state.nextCursor = nextCursor;
        state.hasMore = hasMore;
        state.done = !hasMore;
        state.paginationRevision += 1;
        if (!requestCursor) state.firstPageCount = fresh.length;

        if (fresh.length) {
          appendRenderedPosts(fresh, 'append');
        }

        syncFeedEmptyState();

        if (state.done) {
          setStatus('done', 'Fim da lista');
        } else {
          setStatus('idle', '');
        }
        persistSnapshot();
      } catch (err) {
        if (state.destroyed || requestGeneration !== state.requestGeneration) return;
        state.lastError = err;
        console.error('[KCControllers] Falha ao carregar posts do feed.', {
          cursor: requestCursor,
          limit,
          modules: moduleKeys.length ? moduleKeys.slice() : ['all'],
          message: err && err.message ? err.message : String(err || 'Erro desconhecido'),
        });
        setStatus('error', 'Não foi possível carregar os posts. Tente novamente.');
      } finally {
        if (state.destroyed || requestGeneration !== state.requestGeneration) return;
        state.loading = false;
        if (state.status !== 'error' && !state.done) setStatus('idle', '');
      }
    }

    const onLoadMoreClick = () => { loadNextPage(); };
    const onRetryClick = () => { loadNextPage(); };
    const onRealtimeClick = () => { renderPendingRealtimePosts(); };
    const onPageHide = (event) => {
      persistSnapshot();
      if (event && event.persisted) {
        pauseForBfcache();
        return;
      }
      destroy();
    };
    const onPageShow = (event) => {
      if (!event || !event.persisted || state.destroyed) return;
      startRealtime();
      if (state.revalidateTimer) clearTimeout(state.revalidateTimer);
      state.revalidateTimer = window.setTimeout(revalidateSnapshot, 80);
      try {
        if (typeof kcInitVoteStates === 'function') kcInitVoteStates();
      } catch (_) { }
    };
    const onFocus = () => {
      if (state.destroyed) return;
      const age = Date.now() - (state.lastSnapshotAt || 0);
      if (age < FEED_FOCUS_REVALIDATE_MS) return;
      if (state.revalidateTimer) clearTimeout(state.revalidateTimer);
      state.revalidateTimer = window.setTimeout(revalidateSnapshot, 80);
    };
    // Revalida ao voltar para a aba/app (troca de aba sem perder foco da janela e
    // retorno no mobile nao disparam 'focus'; 'visibilitychange' cobre esses casos).
    const onVisibility = () => {
      if (state.destroyed || document.visibilityState !== 'visible') return;
      const age = Date.now() - (state.lastSnapshotAt || 0);
      if (age < FEED_FOCUS_REVALIDATE_MS) return;
      if (state.revalidateTimer) clearTimeout(state.revalidateTimer);
      state.revalidateTimer = window.setTimeout(revalidateSnapshot, 80);
    };
    let api = null;
    let coreFilterTimer = null;

    function onCoreFilterChange(event) {
      const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : getCoreFilterState();
      const nextCategory = normalizeCoreCategory(pageModule, detail.category);
      const nextQuery = String(detail.query || '').trim();
      if (nextCategory === state.coreCategory && nextQuery === searchQuery) return;

      if (coreFilterTimer) window.clearTimeout(coreFilterTimer);
      const delay = detail.reason === 'query' ? 220 : 0;
      coreFilterTimer = window.setTimeout(function () {
        coreFilterTimer = null;
        if (!api || state.destroyed) return;
        api.refresh({
          q: nextQuery,
          coreCategory: nextCategory,
        });
      }, delay);
    }

    function pauseForBfcache() {
      if (state.revalidateTimer) {
        clearTimeout(state.revalidateTimer);
        state.revalidateTimer = null;
      }
      try {
        if (state.realtimeSub && typeof state.realtimeSub.unsubscribe === 'function') {
          state.realtimeSub.unsubscribe();
        }
      } catch (_) { }
      try {
        if (state.postChangesSub && typeof state.postChangesSub.unsubscribe === 'function') {
          state.postChangesSub.unsubscribe();
        }
      } catch (_) { }
      state.realtimeSub = null;
      state.postChangesSub = null;
    }

    function destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      state.requestGeneration += 1;
      if (state.revalidateTimer) {
        clearTimeout(state.revalidateTimer);
        state.revalidateTimer = null;
      }
      if (state.freshnessTimer) {
        clearTimeout(state.freshnessTimer);
        state.freshnessTimer = null;
      }
      if (coreFilterTimer) {
        window.clearTimeout(coreFilterTimer);
        coreFilterTimer = null;
      }

      try { pagerUI.loadMoreBtn.removeEventListener('click', onLoadMoreClick); } catch (_) { }
      try { pagerUI.retryBtn.removeEventListener('click', onRetryClick); } catch (_) { }
      try { realtimeUI.btn.removeEventListener('click', onRealtimeClick); } catch (_) { }
      try { window.removeEventListener('pagehide', onPageHide); } catch (_) { }
      try { window.removeEventListener('pageshow', onPageShow); } catch (_) { }
      try { window.removeEventListener('focus', onFocus); } catch (_) { }
      try { document.removeEventListener('visibilitychange', onVisibility); } catch (_) { }
      try { document.removeEventListener('kc:feed-core-filter-change', onCoreFilterChange); } catch (_) { }
      try {
        if (state.realtimeSub && typeof state.realtimeSub.unsubscribe === 'function') {
          state.realtimeSub.unsubscribe();
        }
      } catch (_) { }
      try {
        if (state.postChangesSub && typeof state.postChangesSub.unsubscribe === 'function') {
          state.postChangesSub.unsubscribe();
        }
      } catch (_) { }
      try {
        if (typeof state.freshnessUnsub === 'function') state.freshnessUnsub();
      } catch (_) { }
      try {
        if (state.observer) {
          state.observer.disconnect();
          state.observer = null;
        }
      } catch (_) { }

      state.realtimeSub = null;
      state.postChangesSub = null;
      state.freshnessUnsub = null;
      clearPendingRealtime();

      try { pagerUI.wrap.remove(); } catch (_) { }
      try { realtimeUI.banner.remove(); } catch (_) { }

      if (activePager && activePager === api) activePager = null;
    }

    pagerUI.loadMoreBtn.addEventListener('click', onLoadMoreClick);
    pagerUI.retryBtn.addEventListener('click', onRetryClick);
    realtimeUI.btn.addEventListener('click', onRealtimeClick);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('kc:feed-core-filter-change', onCoreFilterChange);
    if (window.KCPostFreshness && typeof window.KCPostFreshness.subscribe === 'function') {
      state.freshnessUnsub = window.KCPostFreshness.subscribe(handlePostChange);
    }

    // Initialize pull-to-refresh
    if (typeof window.KCPullToRefresh !== 'undefined') {
      try {
        window.KCPullToRefresh.init({
          container: document.body,
          onRefresh: () => {
            if (api && typeof api.refresh === 'function') {
              return api.refresh({ requestParams: state.requestParams, reason: 'pull-to-refresh' });
            }
            return Promise.resolve();
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
      refresh: function (nextOptions) {
        const cfg = (nextOptions && typeof nextOptions === 'object' && !Array.isArray(nextOptions)) ? nextOptions : {};
        state.requestGeneration += 1;
        const previousKey = getSnapshotKey();
        invalidateCache(moduleKeys, searchQuery, tagFilter, limit, pagePath, sortBy, getEffectiveRequestParams());
        if (Object.prototype.hasOwnProperty.call(cfg, 'q')) {
          searchQuery = String(cfg.q || '').trim();
        }
        if (Object.prototype.hasOwnProperty.call(cfg, 'coreCategory')) {
          state.coreCategory = normalizeCoreCategory(pageModule, cfg.coreCategory);
        }
        if (Object.prototype.hasOwnProperty.call(cfg, 'requestParams')) {
          state.requestParams = sanitizeRequestParams(cfg.requestParams);
        }
        state.cursor = null;
        state.nextCursor = null;
        state.hasMore = true;
        state.done = false;
        state.loading = false;
        state.paginationRevision += 1;
        state.contentRevision += 1;
        state.firstPageCount = 0;
        state.lastError = null;
        state.renderedPosts = [];
        state.seenIds.clear();
        state.pendingIds.clear();
        container.innerHTML = '';
        const store = getSessionStore();
        if (store && typeof store.remove === 'function') {
          store.remove('feeds', previousKey);
        }
        clearSnapshot();
        clearPendingRealtime();
        setStatus('idle', '');
        return loadNextPage();
      },
      getState: () => ({
        ...state,
        query: searchQuery,
        baseRequestParams: { ...state.requestParams },
        requestParams: getEffectiveRequestParams(),
      }),
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

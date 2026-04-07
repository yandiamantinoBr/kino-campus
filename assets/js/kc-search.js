/**
 * KinoCampus - Sistema de Busca Global
 * Busca local/offline-first, pagina de resultados e analytics de buscas.
 */

(function () {
  'use strict';

  const KCUtils = (typeof window !== 'undefined' && window.KCUtils) ? window.KCUtils : null;
  const KCAPI = (typeof window !== 'undefined' && window.KCAPI) ? window.KCAPI : null;
  const KCSearchAnalytics = (typeof window !== 'undefined' && window.KCSearchAnalytics) ? window.KCSearchAnalytics : null;

  const DB_FALLBACK_URL = 'data/database.json';
  const TRACK_BATCH_SIZE = 12;

  let kcDbPosts = null;
  let dropdownDebounceTimer = null;
  let searchFlushTimer = null;

  const MEMORY_STORAGE = (function () {
    const state = {};
    return {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(state, key) ? state[key] : null;
      },
      setItem(key, value) {
        state[key] = String(value);
      },
      removeItem(key) {
        delete state[key];
      }
    };
  })();

  function getSearchShared() {
    const shared = (typeof window !== 'undefined' && window.KCSearchShared) ? window.KCSearchShared : null;
    if (shared && typeof shared.searchCollection === 'function') return shared;
    return null;
  }

  function normalizeText(text) {
    if (KCUtils && typeof KCUtils.normalizeText === 'function') return KCUtils.normalizeText(text);
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function escapeHtml(value) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') {
      return window.KCUtils.escapeHtml(value);
    }
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getSearchStorage() {
    try {
      const testKey = '__kc_search_storage_test__';
      window.sessionStorage.setItem(testKey, '1');
      window.sessionStorage.removeItem(testKey);
      return window.sessionStorage;
    } catch (_) {
      return MEMORY_STORAGE;
    }
  }

  function getSearchSessionId(storage) {
    const bag = storage || getSearchStorage();
    if (KCSearchAnalytics && typeof KCSearchAnalytics.ensureSessionId === 'function') {
      return KCSearchAnalytics.ensureSessionId(bag, function () {
        return Math.random().toString(36).slice(2);
      }, Date.now);
    }

    let sid = '';
    try {
      sid = bag.getItem('kc_search_session_id') || '';
      if (!sid) {
        sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
        bag.setItem('kc_search_session_id', sid);
      }
    } catch (_) {
      sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
    return sid;
  }

  async function getTrackedUserId() {
    try {
      if (window.KCAPI && typeof window.KCAPI.getCurrentUser === 'function') {
        const user = await window.KCAPI.getCurrentUser();
        return user ? user.id : null;
      }
    } catch (_) {}
    return null;
  }

  function getQueryParam(name) {
    try {
      const url = new URL(window.location.href);
      const value = url.searchParams.get(name);
      return value ? String(value) : '';
    } catch (_) {
      return '';
    }
  }

  function getUserPostsRaw() {
    try {
      const list = window.kcUserPosts && window.kcUserPosts.list ? window.kcUserPosts.list() : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function normalizeAnyPost(raw) {
    if (KCAPI && typeof KCAPI.normalizePost === 'function') {
      const normalized = KCAPI.normalizePost(raw);
      if (raw && raw._kcUserPost === true) normalized._kcUserPost = true;
      return normalized;
    }
    return Object.assign({}, raw || {});
  }

  function normalizeUserPost(raw) {
    const base = raw || {};
    const fixed = {
      ...base,
      modulo: base.modulo || 'publicacao',
      titulo: base.titulo || '',
      descricao: base.descricao || '',
      tags: Array.isArray(base.tags) ? base.tags : [],
      emoji: base.emoji || '✨',
      verificado: !!base.verificado,
      votos: base.votos ?? 0,
      comentarios: base.comentarios ?? 0,
      timestamp: base.timestamp || 'Agora',
      autor: base.autor || 'Voce',
      autorAvatar: base.autorAvatar || ((window.KC_CONSTANTS && window.KC_CONSTANTS.DEFAULT_AVATAR_SVG) || '')
    };
    fixed._kcUserPost = true;
    return normalizeAnyPost(fixed);
  }

  async function loadDbPosts() {
    if (kcDbPosts) return kcDbPosts;

    try {
      if (KCAPI && typeof KCAPI.getDatabaseNormalized === 'function') {
        const db = await KCAPI.getDatabaseNormalized();
        const posts = Array.isArray(db && db.posts) ? db.posts : [];
        kcDbPosts = posts.map(normalizeAnyPost);
        return kcDbPosts;
      }

      const res = await fetch(DB_FALLBACK_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const db = await res.json();
      const list = Array.isArray(db && db.anuncios) ? db.anuncios : [];
      kcDbPosts = list.map(normalizeAnyPost);
      return kcDbPosts;
    } catch (err) {
      console.error('[KinoCampus] Erro ao carregar database para busca:', err);
      kcDbPosts = [];
      return kcDbPosts;
    }
  }

  async function getAllPosts() {
    const db = await loadDbPosts();
    const user = getUserPostsRaw().map(normalizeUserPost);
    return [...user, ...db];
  }

  function expandSearchTerm(term) {
    const shared = getSearchShared();
    if (shared && typeof shared.expandSynonyms === 'function') {
      return shared.expandSynonyms(term);
    }

    const normalized = normalizeText(term);
    return normalized ? [normalized] : [];
  }

  async function searchPosts(query, options = {}) {
    const q = String(query || '').trim();
    if (!q) return [];

    const all = await getAllPosts();
    const searchShared = getSearchShared();
    if (searchShared) {
      return searchShared.searchCollection(all, {
        q,
        module: options.module || options.modulo || null,
        category: options.category || options.categoria || null,
        subcategory: options.subcategory || options.subcategoria || null,
        limit: options.limit != null ? options.limit : 50,
        minScore: options.minScore != null ? options.minScore : 0.3
      });
    }

    return [];
  }

  function filterCurrentPageCards(query) {
    const cards = document.querySelectorAll('.kc-card');
    const q = String(query || '').trim();
    const normalizedQuery = normalizeText(q);
    const searchShared = getSearchShared();
    const expandedTerms = q
      ? ((searchShared && typeof searchShared.expandQueryTerms === 'function')
        ? searchShared.expandQueryTerms(normalizedQuery)
        : expandSearchTerm(normalizedQuery))
      : [];

    let visibleCount = 0;

    cards.forEach((card) => {
      const title = card.querySelector('.kc-card__title') ? card.querySelector('.kc-card__title').textContent : '';
      const description = card.querySelector('.kc-card__description-preview') ? card.querySelector('.kc-card__description-preview').textContent : '';
      const categorySource = card.querySelector('.kc-card__category-source') ? card.querySelector('.kc-card__category-source').textContent : '';

      const normalizedTitle = normalizeText(title);
      const normalizedDescription = normalizeText(description);
      const normalizedCategory = normalizeText(categorySource);

      let matches = false;
      if (!q) {
        matches = true;
      } else {
        expandedTerms.forEach((term) => {
          if (matches) return;
          if (normalizedTitle.includes(term) || normalizedDescription.includes(term) || normalizedCategory.includes(term)) {
            matches = true;
          }
        });
      }

      card.style.display = matches ? '' : 'none';
      if (matches) visibleCount += 1;
    });

    const noResults = document.getElementById('noResults');
    if (noResults) noResults.style.display = visibleCount === 0 ? 'block' : 'none';

    return visibleCount;
  }

  async function insertTrackedTerms(entries) {
    const client = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
      ? window.KCSupabase.getClient() : null;
    if (!client || !entries || !entries.length) return false;

    const storage = getSearchStorage();
    const sessionId = getSearchSessionId(storage);
    const userId = await getTrackedUserId();
    const payload = entries.map((entry) => ({
      term: entry.term,
      session_id: sessionId,
      user_id: userId
    }));

    try {
      const res = await client.from('search_queries').insert(payload);
      return !res.error;
    } catch (_) {
      return false;
    }
  }

  async function flushPendingTrackedSearches() {
    if (!KCSearchAnalytics) return false;
    const storage = getSearchStorage();
    const pending = KCSearchAnalytics.consumeQueuedTerms(storage, TRACK_BATCH_SIZE);
    if (!pending.length) return true;

    const ok = await insertTrackedTerms(pending);
    if (ok) {
      KCSearchAnalytics.markTermsFlushed(storage, pending, Date.now());
      const remaining = KCSearchAnalytics.consumeQueuedTerms(storage, TRACK_BATCH_SIZE);
      if (remaining.length) scheduleTrackedSearchFlush(80);
    }
    return ok;
  }

  function scheduleTrackedSearchFlush(delay = 120) {
    if (searchFlushTimer) clearTimeout(searchFlushTimer);
    searchFlushTimer = setTimeout(() => {
      flushPendingTrackedSearches().catch(() => {});
    }, delay);
  }

  function trackSearch(term, meta = {}) {
    const q = String(term || '').replace(/\s+/g, ' ').trim();
    if (!q || q.length < 2) return false;

    try {
      if (window.KCHomeCategories && typeof window.KCHomeCategories.trackEvent === 'function') {
        window.KCHomeCategories.trackEvent('search', { term: q, meta });
      }
    } catch (_) {}

    if (!KCSearchAnalytics) {
      insertTrackedTerms([{ term: q }]).catch(() => {});
      return true;
    }

    const entry = KCSearchAnalytics.queueSearchTerm(
      getSearchStorage(),
      q,
      meta,
      Date.now(),
      KCSearchAnalytics.DEFAULT_DEDUPE_WINDOW_MS
    );

    if (!entry) return false;
    scheduleTrackedSearchFlush(meta && meta.navigate ? 220 : 60);
    return true;
  }

  function navigateToResults(query, meta = {}) {
    const q = String(query || '').trim();
    if (!q) return;
    // trackSearch() is called on search-results.html load to avoid the async
    // insert being aborted by page navigation before the request completes.
    window.location.href = `search-results.html?q=${encodeURIComponent(q)}`;
  }

  function globalSearch(query, redirectToResults = false) {
    const q = String(query || '').trim();
    if (!q) return;

    if (redirectToResults) {
      navigateToResults(q, { source: 'global-search' });
      return;
    }

    if (typeof window.filterPosts === 'function') {
      window.filterPosts(q);
    } else {
      filterCurrentPageCards(q);
    }
  }

  function isResultsPage() {
    const file = (window.location.pathname.split('/').pop() || '').toLowerCase();
    return file === 'search-results.html' || !!document.getElementById('searchResultsList');
  }

  function buildResultCard(raw) {
    const post = normalizeAnyPost(raw);
    const modeled = (window.KCPostModel && typeof window.KCPostModel.from === 'function')
      ? window.KCPostModel.from(post, {})
      : post;

    modeled._kcAuthorPrefix = 'Por';
    modeled._kcCompactComments = true;

    if (KCUtils && typeof KCUtils.renderPostCard === 'function') {
      return KCUtils.renderPostCard(modeled);
    }

    const href = `product.html?id=${encodeURIComponent(post.id ?? '')}`;
    return `
      <article class="kc-card">
        <div class="kc-card__main">
          <div class="kc-card__image-wrapper" style="font-size: 3em; display:flex; align-items:center; justify-content:center;">${escapeHtml(post.emoji || '✨')}</div>
          <div class="kc-card__content">
            <div class="kc-card__header"><div class="kc-card__category-source">${escapeHtml(post.modulo || '')}</div><div class="kc-card__timestamp">${escapeHtml(post.timestamp || '')}</div></div>
            <a class="kc-card__title" href="${href}">${escapeHtml(post.titulo || '')}</a>
            <div class="kc-card__description-preview">${escapeHtml(post.descricao || '')}</div>
            <div class="kc-card__author"><span>Por <strong>${escapeHtml(post.autor || 'Autor')}</strong></span></div>
          </div>
        </div>
      </article>
    `.trim();
  }

  async function renderResultsToPage(query) {
    const listEl = document.getElementById('searchResultsList');
    if (!listEl) return;

    const q = String(query || '').trim();
    const titleEl = document.getElementById('searchQueryText');
    const noEl = document.getElementById('noResults');
    const countEl = document.getElementById('resultsCount');

    if (titleEl) titleEl.textContent = q ? `“${q}”` : '';

    if (!q) {
      listEl.innerHTML = '';
      if (noEl) noEl.style.display = 'block';
      if (countEl) countEl.textContent = '0';
      return;
    }

    const moduleParam = getQueryParam('module') || getQueryParam('modulo');
    const categoryParam = getQueryParam('category') || getQueryParam('categoria');
    const subcategoryParam = getQueryParam('subcategory') || getQueryParam('subcategoria');

    let results = [];
    try {
      if (KCAPI && typeof KCAPI.searchPosts === 'function') {
        const params = { q, limit: 50 };
        if (moduleParam) params.module = moduleParam;
        if (categoryParam) params.category = categoryParam;
        if (subcategoryParam) params.subcategory = subcategoryParam;
        results = await KCAPI.searchPosts(params);
      } else {
        results = await searchPosts(q, { limit: 50, minScore: 0.2 });
      }
    } catch (error) {
      console.error('[KinoCampus] Busca falhou:', error);
      results = [];
    }

    const safeResults = Array.isArray(results) ? results : [];
    listEl.innerHTML = safeResults.map(buildResultCard).join('\n');

    if (noEl) noEl.style.display = safeResults.length ? 'none' : 'block';
    if (countEl) countEl.textContent = String(safeResults.length);
  }

  function getOrCreateDropdown() {
    let dropdown = document.getElementById('kcSearchDropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = 'kcSearchDropdown';
      dropdown.className = 'kc-search-dropdown';
      dropdown.setAttribute('role', 'listbox');
      dropdown.setAttribute('aria-label', 'Sugestoes de busca');
      document.body.appendChild(dropdown);
    }
    return dropdown;
  }

  function positionDropdown(dropdown, searchBarEl) {
    if (!dropdown || !searchBarEl) return;
    const rect = searchBarEl.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth;

    let width = Math.max(rect.width, 280);
    let left = rect.left;

    if (left + width > vw - 8) left = Math.max(8, vw - width - 8);
    if (left < 8) left = 8;
    if (width > vw - 16) width = vw - 16;

    dropdown.style.top = `${rect.bottom + 6}px`;
    dropdown.style.left = `${left}px`;
    dropdown.style.width = `${width}px`;
  }

  function formatPrice(post) {
    if (post.precoTexto) return post.precoTexto;
    if (post.preco === 0 || post.preco === '0') return 'Gratis';
    if (post.preco) return `R$ ${Number(post.preco).toFixed(2).replace('.', ',')}`;
    return '';
  }

  function getPostHref(post) {
    return post && post.id ? `product.html?id=${encodeURIComponent(post.id)}` : '#';
  }

  function renderDropdown(dropdown, results, query) {
    dropdown.innerHTML = '';

    if (!results.length) {
      const empty = document.createElement('div');
      empty.className = 'kc-search-dropdown__empty';
      empty.textContent = `Nenhum resultado para "${query}"`;
      dropdown.appendChild(empty);
      dropdown.classList.add('active');
      return;
    }

    const shown = results.slice(0, 8);

    shown.forEach((post) => {
      const item = document.createElement('a');
      item.className = 'kc-search-dropdown__item';
      item.href = getPostHref(post);
      item.setAttribute('role', 'option');
      item.addEventListener('click', () => {
        trackSearch(query, { source: 'dropdown-item' });
      });

      const emoji = document.createElement('span');
      emoji.className = 'kc-search-dropdown__emoji';
      emoji.textContent = post.emoji || '✨';

      const info = document.createElement('div');
      info.className = 'kc-search-dropdown__info';

      const title = document.createElement('div');
      title.className = 'kc-search-dropdown__title';
      title.textContent = post.titulo || '(sem titulo)';

      const meta = document.createElement('div');
      meta.className = 'kc-search-dropdown__meta';
      const parts = [post.categoria || post.modulo || ''].filter(Boolean);
      if (post.autor) parts.push(`por ${post.autor}`);
      meta.textContent = parts.join(' · ');

      info.appendChild(title);
      info.appendChild(meta);

      item.appendChild(emoji);
      item.appendChild(info);

      const priceStr = formatPrice(post);
      if (priceStr) {
        const price = document.createElement('span');
        price.className = 'kc-search-dropdown__price';
        price.textContent = priceStr;
        item.appendChild(price);
      }

      dropdown.appendChild(item);
    });

    if (results.length > shown.length) {
      const footer = document.createElement('div');
      footer.className = 'kc-search-dropdown__footer';
      footer.textContent = `Ver todos os ${results.length} resultados →`;
      footer.addEventListener('click', () => {
        navigateToResults(query, { source: 'dropdown-footer' });
      });
      dropdown.appendChild(footer);
    }

    dropdown.classList.add('active');
  }

  function closeDropdown() {
    const dropdown = document.getElementById('kcSearchDropdown');
    if (dropdown) dropdown.classList.remove('active');
  }

  async function updateDropdown(query, dropdown, searchBarEl) {
    const q = String(query || '').trim();
    if (q.length < 2) {
      closeDropdown();
      return;
    }

    try {
      let results = [];
      if (KCAPI && typeof KCAPI.searchPosts === 'function') {
        results = await KCAPI.searchPosts({ q, limit: 8 });
      } else {
        results = await searchPosts(q, { limit: 8, minScore: 0.2 });
      }
      if (!Array.isArray(results)) results = [];
      positionDropdown(dropdown, searchBarEl);
      renderDropdown(dropdown, results, q);
    } catch (_) {
      closeDropdown();
    }
  }

  function bindSearchFlushLifecycle() {
    scheduleTrackedSearchFlush(0);
    window.addEventListener('online', () => scheduleTrackedSearchFlush(0));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        scheduleTrackedSearchFlush(0);
      }
    });
  }

  function initSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchBarEl = searchInput ? searchInput.closest('.kc-search-bar') : null;
    const searchButton = document.querySelector('.kc-search-bar button');
    const resultsPage = isResultsPage();
    const hasPageFilter = (!resultsPage) && (typeof window.filterPosts === 'function');
    const dropdown = (!resultsPage && searchBarEl) ? getOrCreateDropdown() : null;

    bindSearchFlushLifecycle();

    if (resultsPage) {
      const qParam = getQueryParam('q');
      if (searchInput && qParam) searchInput.value = qParam;
      renderResultsToPage(searchInput ? searchInput.value : qParam);
      if (qParam && qParam.trim().length >= 2) {
        trackSearch(qParam.trim(), { source: 'results-load' });
      }
    }

    if (dropdown) {
      document.addEventListener('click', function (event) {
        const insideBar = searchBarEl && searchBarEl.contains(event.target);
        const insideDropdown = dropdown.contains(event.target);
        if (!insideBar && !insideDropdown) closeDropdown();
      }, true);

      window.addEventListener('resize', function () {
        if (dropdown.classList.contains('active')) {
          positionDropdown(dropdown, searchBarEl);
        }
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', function (event) {
        const q = event.target.value;

        if (resultsPage) {
          renderResultsToPage(q);
          return;
        }

        if (hasPageFilter) {
          window.filterPosts(q);
        } else {
          filterCurrentPageCards(q);
        }

        if (dropdown) {
          clearTimeout(dropdownDebounceTimer);
          dropdownDebounceTimer = setTimeout(() => updateDropdown(q, dropdown, searchBarEl), 180);
        }
      });

      searchInput.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
          closeDropdown();
          return;
        }
        if (event.key !== 'Enter') return;

        event.preventDefault();
        closeDropdown();
        const q = this.value;

        if (resultsPage) {
          trackSearch(q, { source: 'results-submit' });
          renderResultsToPage(q);
          return;
        }

        if (hasPageFilter) {
          trackSearch(q, { source: 'page-filter-submit' });
          window.filterPosts(q);
          return;
        }

        navigateToResults(q, { source: 'search-enter' });
      });

      searchInput.addEventListener('focus', function () {
        if (dropdown && this.value.trim().length >= 2) {
          updateDropdown(this.value, dropdown, searchBarEl);
        }
      });
    }

    if (searchButton) {
      searchButton.addEventListener('click', function (event) {
        event.preventDefault();
        closeDropdown();
        const q = searchInput ? searchInput.value : '';

        if (resultsPage) {
          trackSearch(q, { source: 'results-submit' });
          renderResultsToPage(q);
          return;
        }

        if (hasPageFilter) {
          trackSearch(q, { source: 'page-filter-submit' });
          window.filterPosts(q);
          return;
        }

        navigateToResults(q, { source: 'search-button' });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearch);
  } else {
    initSearch();
  }

  window.kcSearch = {
    search: (q, opts) => searchPosts(q, opts),
    filter: filterCurrentPageCards,
    globalSearch,
    loadDatabase: loadDbPosts,
    navigateToResults,
    track: trackSearch,
    flushPending: flushPendingTrackedSearches,
    __internals: {
      flushPendingTrackedSearches,
      getSearchSessionId,
      getSearchStorage,
      insertTrackedTerms,
      navigateToResults,
      trackSearch
    }
  };
})();

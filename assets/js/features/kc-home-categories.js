(function () {
  'use strict';

  const Utils = window.KCHomeCategoryUtils;
  if (!Utils) return;

  const MODULE_KEYS = ['compra-venda', 'eventos', 'moradia', 'oportunidades', 'caronas', 'achados-perdidos'];
  const QUEUE_BATCH = 24;
  const CACHE_TTL_MS = 120000;

  const memoryStorage = (function () {
    const state = {};
    return {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(state, key) ? state[key] : null;
      },
      setItem(key, value) {
        state[key] = String(value);
      }
    };
  }());

  let initDone = false;
  let flushTimer = null;
  let mergeInFlight = null;
  let countsCache = { at: 0, rows: null };
  let countsInFlight = null;
  let affinityCache = { at: 0, rows: null };
  let consentListenerBound = false;

  function hasAnalyticsConsent() {
    if (window.KCConsent && typeof window.KCConsent.hasConsent === 'function') {
      return window.KCConsent.hasConsent('analytics');
    }
    return false;
  }

  function bindConsentLifecycle() {
    if (consentListenerBound) return;
    consentListenerBound = true;
    window.addEventListener('kc:consentchange', function () {
      if (hasAnalyticsConsent()) init();
    });
  }

  function getStorage() {
    try {
      const key = '__kc_home_categories__';
      window.localStorage.setItem(key, '1');
      window.localStorage.removeItem(key);
      return window.localStorage;
    } catch (_) {
      return memoryStorage;
    }
  }

  function getSessionId() {
    return Utils.ensureSessionId(getStorage(), function () {
      return Math.random().toString(36).slice(2);
    }, Date.now);
  }

  function getClient() {
    return window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
      ? window.KCSupabase.getClient()
      : null;
  }

  function isSupabaseMode() {
    return !!(window.KCAPI && window.KCAPI.ENV && window.KCAPI.ENV.driver === 'supabase');
  }

  async function getCurrentUser() {
    try {
      if (window.KCAPI && typeof window.KCAPI.getCurrentUser === 'function') {
        return await window.KCAPI.getCurrentUser();
      }
    } catch (_) { }
    return null;
  }

  function buildPseudoPostFromCard(card) {
    if (!card) return null;
    return {
      module: card.getAttribute('data-module') || '',
      category: card.getAttribute('data-category') || '',
      subcategory: card.getAttribute('data-subcategory') || '',
      title: (card.querySelector('.kc-card__title') || {}).textContent || '',
      description: (card.querySelector('.kc-card__description-preview') || {}).textContent || '',
      tagKeys: String(card.getAttribute('data-kc-tags') || '').split(/\s+/).filter(Boolean)
    };
  }

  function resolveCategories(payload) {
    const ctx = (payload && typeof payload === 'object' && !Array.isArray(payload)) ? payload : {};

    if (Array.isArray(ctx.categoryIds) && ctx.categoryIds.length) {
      return ctx.categoryIds.map((id) => Utils.getCategoryById(id)).filter(Boolean);
    }

    if (ctx.moduleKey && ctx.categoryKey) {
      const direct = Utils.findCategory(ctx.moduleKey, ctx.categoryKey);
      if (direct) return [direct];
    }

    if (ctx.post) {
      const fromPost = Utils.resolveCategoriesFromPost(ctx.post);
      if (fromPost.length) return fromPost;
    }

    if (ctx.href || ctx.text) {
      const fromLink = Utils.resolveCategoriesFromLink(ctx.href, ctx.text);
      if (fromLink.length) return fromLink;
    }

    if (ctx.term) {
      const fromSearch = Utils.findCategoriesBySearchTerm(ctx.term, 3);
      if (fromSearch.length) return fromSearch;
    }

    return [];
  }

  function recordLocal(entries) {
    Utils.recordLocalAffinity(getStorage(), entries, Date.now());
    Utils.enqueueAffinityEvents(getStorage(), entries, Date.now(), getSessionId());
    affinityCache.at = 0;
  }

  async function maybeMergeSessionAffinity() {
    if (!hasAnalyticsConsent()) return false;
    if (!isSupabaseMode()) return false;
    if (mergeInFlight) return mergeInFlight;

    mergeInFlight = (async function () {
      const user = await getCurrentUser();
      if (!user || !user.id) return false;

      const storage = getStorage();
      const mergedMarker = storage.getItem(Utils.STORAGE_KEYS.merged);
      const nextMarker = `${getSessionId()}::${user.id}`;
      if (mergedMarker === nextMarker) return true;

      const client = getClient();
      if (!client || typeof client.rpc !== 'function') return false;

      try {
        const response = await client.rpc('kc_merge_home_category_affinity', {
          p_session_id: getSessionId()
        });
        if (response && !response.error) {
          storage.setItem(Utils.STORAGE_KEYS.merged, nextMarker);
          affinityCache.at = 0;
          return true;
        }
      } catch (_) { }
      return false;
    }()).finally(function () {
      mergeInFlight = null;
    });

    return mergeInFlight;
  }

  async function flushPendingEvents() {
    if (!hasAnalyticsConsent()) return false;
    if (!isSupabaseMode()) return false;

    await maybeMergeSessionAffinity();

    const client = getClient();
    if (!client || typeof client.rpc !== 'function') return false;

    const batch = Utils.consumeQueuedAffinityEvents(getStorage(), QUEUE_BATCH);
    if (!batch.length) return true;

    try {
      const response = await client.rpc('kc_track_home_category_affinity', {
        p_session_id: getSessionId(),
        p_events: batch.map((entry) => ({
          module_key: entry.module_key,
          category_key: entry.category_key,
          delta: entry.delta,
          event_type: entry.event_type,
          tracked_at: entry.tracked_at
        }))
      });

      if (response && !response.error) {
        affinityCache.at = 0;
        if (Utils.readQueuedAffinityEvents(getStorage()).length) scheduleFlush(120);
        return true;
      }
    } catch (_) { }

    Utils.restoreQueuedAffinityEvents(getStorage(), batch);
    return false;
  }

  function scheduleFlush(delay) {
    if (flushTimer) window.clearTimeout(flushTimer);
    flushTimer = window.setTimeout(function () {
      flushPendingEvents().catch(function () { });
    }, Math.max(0, Number(delay) || 80));
  }

  async function fetchCountsViaRpc() {
    const client = getClient();
    if (!client || typeof client.rpc !== 'function') return null;
    try {
      const response = await client.rpc('kc_home_category_post_counts');
      if (!(response && response.error) && Array.isArray(response && response.data)) {
        return response.data;
      }
    } catch (_) { }
    return null;
  }

  async function fetchCountsFallback() {
    if (!window.KCAPI || typeof window.KCAPI.getPosts !== 'function') return [];
    const counter = new Map();

    for (let index = 0; index < MODULE_KEYS.length; index += 1) {
      const moduleKey = MODULE_KEYS[index];
      let posts = [];
      try {
        posts = await window.KCAPI.getPosts({ module: moduleKey, page: 1, limit: 200 });
      } catch (_) {
        posts = [];
      }

      (Array.isArray(posts) ? posts : []).forEach((post) => {
        const matches = Utils.resolveCategoriesFromPost(post);
        matches.forEach((entry) => {
          counter.set(entry.id, Number(counter.get(entry.id) || 0) + 1);
        });
      });
    }

    return Array.from(counter.entries()).map((item) => {
      const entry = Utils.getCategoryById(item[0]);
      return entry ? {
        module_key: entry.moduleKey,
        category_key: entry.categoryKey,
        count: item[1]
      } : null;
    }).filter(Boolean);
  }

  async function getCategoryCounts(force) {
    const now = Date.now();
    if (!force && countsCache.rows && now - countsCache.at < CACHE_TTL_MS) return countsCache.rows;
    if (countsInFlight) return countsInFlight;

    const request = (async function () {
      let rows = await fetchCountsViaRpc();
      if (!rows) rows = await fetchCountsFallback();

      countsCache = { at: Date.now(), rows: Array.isArray(rows) ? rows : [] };
      return countsCache.rows;
    }());

    countsInFlight = request;
    try {
      return await request;
    } finally {
      if (countsInFlight === request) countsInFlight = null;
    }
  }

  async function fetchAffinityViaRpc() {
    if (!hasAnalyticsConsent()) return null;
    const client = getClient();
    if (!client || typeof client.rpc !== 'function') return null;

    try {
      const response = await client.rpc('kc_list_home_category_affinity', {
        p_session_id: getSessionId(),
        p_limit: 80,
        p_offset: 0
      });
      if (!(response && response.error) && Array.isArray(response && response.data)) {
        return response.data;
      }
    } catch (_) { }
    return null;
  }

  async function getAffinityRows(force) {
    if (!hasAnalyticsConsent()) return [];
    const now = Date.now();
    if (!force && affinityCache.rows && now - affinityCache.at < CACHE_TTL_MS) return affinityCache.rows;

    await maybeMergeSessionAffinity();
    let rows = await fetchAffinityViaRpc();
    let merged = [];

    if (rows) {
      const queuedRows = Utils.queuedEventsToAffinityRows(Utils.readQueuedAffinityEvents(getStorage()));
      merged = Utils.mergeAffinityRows(rows, queuedRows);
    } else {
      merged = Utils.localAffinityMapToRows(Utils.readLocalAffinity(getStorage()));
    }

    affinityCache = { at: now, rows: merged };
    return merged;
  }

  function trackEvent(eventType, payload) {
    if (!hasAnalyticsConsent()) return false;
    const categories = resolveCategories(payload);
    if (!categories.length) return false;

    const delta = Utils.getEventWeight(eventType);
    const entries = categories.map((entry) => ({
      moduleKey: entry.moduleKey,
      categoryKey: entry.categoryKey,
      delta,
      eventType
    }));

    recordLocal(entries);
    scheduleFlush(60);

    try {
      if (window.KCPrivacyAnalytics && typeof window.KCPrivacyAnalytics.track === 'function') {
        const first = categories[0] || {};
        const privacyEvent = eventType === 'post_open' ? 'post_open' : 'category_click';
        window.KCPrivacyAnalytics.track(privacyEvent, {
          module_key: first.moduleKey || '',
          category_key: first.categoryKey || '',
          source: eventType,
        }).catch(function () {});
      }
    } catch (_) { }

    try {
      window.dispatchEvent(new CustomEvent('kc:home-categories-tracked', {
        detail: { eventType, categories: categories.map((item) => item.id) }
      }));
    } catch (_) { }
    return true;
  }

  async function getSidebarRows(options) {
    const ctx = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    const counts = await getCategoryCounts(!!ctx.force);
    const affinity = await getAffinityRows(!!ctx.force);
    return Utils.buildCategoryRows({
      counts,
      affinity,
      limit: ctx.limit || 10,
      offset: ctx.offset || 0
    });
  }

  function bindTrackingEvents() {
    document.addEventListener('click', function (event) {
      const categoryItem = event.target.closest('[data-kc-home-category-id], .kc-category-list--home .kc-category-item, [data-kc-home-track-category]');
      if (categoryItem) {
        const directId = String(categoryItem.getAttribute('data-kc-home-category-id') || '').trim();
        if (directId && Utils.getCategoryById(directId)) {
          trackEvent('category_click', { categoryIds: [directId] });
        } else {
          trackEvent('category_click', {
            href: categoryItem.getAttribute('href') || '',
            text: categoryItem.textContent || ''
          });
        }
      }

      const tabLink = event.target.closest('.kc-feed-tabs a');
      if (tabLink) {
        trackEvent('tab_click', {
          href: tabLink.getAttribute('href') || '',
          text: tabLink.textContent || ''
        });
      }

      const cardLink = event.target.closest('.kc-card a[href*="product.html"], .kc-card [data-kc-view-profile]');
      if (cardLink) {
        const card = cardLink.closest('.kc-card');
        trackEvent('post_open', { post: buildPseudoPostFromCard(card) });
      }
    }, true);
  }

  function bindLifecycle() {
    window.addEventListener('online', function () {
      scheduleFlush(0);
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') scheduleFlush(0);
    });

    document.addEventListener('kc:authchange', function () {
      maybeMergeSessionAffinity().catch(function () { });
      scheduleFlush(0);
    });
  }

  function init() {
    if (initDone) return;
    if (!hasAnalyticsConsent()) {
      bindConsentLifecycle();
      return;
    }
    initDone = true;
    getSessionId();
    bindTrackingEvents();
    bindLifecycle();
    scheduleFlush(0);
  }

  const api = {
    init,
    trackEvent,
    getSidebarRows,
    getCategoryCounts,
    getAffinityRows,
    resolveCategories,
    refresh() {
      countsCache.at = 0;
      affinityCache.at = 0;
      return getSidebarRows({ force: true, limit: 10, offset: 0 });
    }
  };

  window.KCHomeCategories = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}());

/*
 * KinoCampus - kc-nav-links-personalized.js
 *
 * Reordena a navegacao principal por modulo sem alterar o HTML base.
 * Fallback seguro: se APIs/RPCs/consentimento nao estiverem disponiveis,
 * a ordem estatica do documento permanece intacta.
 */
(function () {
  'use strict';

  const CACHE_KEY = 'kc:navLinksOrder:v1';
  const AFFINITY_KEY = 'kc_nav_module_affinity_v1';
  const CACHE_TTL_MS = 1000 * 60 * 10;

  const STATIC_ORDER = Object.freeze([
    'achados-perdidos',
    'eventos',
    'moradia',
    'oportunidades',
    'compra-venda',
    'caronas',
  ]);

  const MODULE_HREFS = Object.freeze({
    'achados-perdidos': 'achados-perdidos.html',
    eventos: 'eventos.html',
    moradia: 'moradia.html',
    oportunidades: 'oportunidades.html',
    'compra-venda': 'compra-venda-feed.html',
    caronas: 'caronas-feed.html',
  });

  function hasAnalyticsConsent() {
    try {
      return !!(window.KCConsent
        && typeof window.KCConsent.hasConsent === 'function'
        && window.KCConsent.hasConsent('analytics'));
    } catch (_) {
      return false;
    }
  }

  function normalizeModuleKey(value) {
    return String(value || '')
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/_/g, '-');
  }

  function inferModuleFromHref(href) {
    const clean = String(href || '').split('#')[0].split('?')[0].toLowerCase();
    if (clean.includes('achados-perdidos')) return 'achados-perdidos';
    if (clean.includes('eventos')) return 'eventos';
    if (clean.includes('moradia')) return 'moradia';
    if (clean.includes('oportunidades')) return 'oportunidades';
    if (clean.includes('compra-venda-feed')) return 'compra-venda';
    if (clean.includes('caronas-feed')) return 'caronas';
    return '';
  }

  function readJsonStorage(storage, key, fallback) {
    try {
      const raw = storage && storage.getItem ? storage.getItem(key) : '';
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJsonStorage(storage, key, value) {
    try {
      if (storage && storage.setItem) storage.setItem(key, JSON.stringify(value));
    } catch (_) { }
  }

  function readCachedOrder() {
    const cached = readJsonStorage(window.sessionStorage, CACHE_KEY, null);
    if (!cached || !Array.isArray(cached.order)) return null;
    if (Date.now() - Number(cached.t || 0) > CACHE_TTL_MS) return null;
    if (!hasAnalyticsConsent() && cached.personalized === true) return null;
    return cached.order.filter(function (key) { return STATIC_ORDER.includes(key); });
  }

  function writeCachedOrder(order, personalized) {
    writeJsonStorage(window.sessionStorage, CACHE_KEY, {
      t: Date.now(),
      order: order || [],
      personalized: !!personalized,
    });
  }

  function readLocalAffinity() {
    if (!hasAnalyticsConsent()) return {};
    const data = readJsonStorage(window.localStorage, AFFINITY_KEY, {});
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  }

  function trackLocalNavAffinity(moduleKey) {
    if (!hasAnalyticsConsent() || !moduleKey) return;
    const data = readLocalAffinity();
    const current = data[moduleKey] || { score: 0, interactions: 0, updatedAt: null };
    data[moduleKey] = {
      score: Number(current.score || 0) + 4,
      interactions: Number(current.interactions || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    writeJsonStorage(window.localStorage, AFFINITY_KEY, data);
  }

  function createModuleScores() {
    const map = new Map();
    STATIC_ORDER.forEach(function (key, index) {
      map.set(key, {
        moduleKey: key,
        originalIndex: index,
        personal: 0,
        global: 0,
        score: 0,
      });
    });
    return map;
  }

  function normalizeRowsToModuleScores(rows, scoreKey) {
    const result = new Map();
    let max = 0;
    (Array.isArray(rows) ? rows : []).forEach(function (row, index) {
      const moduleKey = normalizeModuleKey(row.out_module_key || row.module_key || row.moduleKey || row.module || '');
      if (!STATIC_ORDER.includes(moduleKey)) return;
      const raw = Number(row[scoreKey] || row.out_score || row.score || row.count || 0) || (1 / (index + 1));
      const previous = Number(result.get(moduleKey) || 0);
      const next = previous + raw;
      result.set(moduleKey, next);
      max = Math.max(max, next);
    });
    if (max <= 0) return result;
    result.forEach(function (value, key) {
      result.set(key, value / max);
    });
    return result;
  }

  async function fetchPersonalizedRows() {
    if (!hasAnalyticsConsent()) return [];
    if (!window.KCAPI || typeof window.KCAPI.getPersonalizedTabs !== 'function') return [];
    try {
      const rows = await window.KCAPI.getPersonalizedTabs(24);
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      return [];
    }
  }

  async function fetchGlobalCountRows() {
    if (window.KCHomeCategories && typeof window.KCHomeCategories.getCategoryCounts === 'function') {
      try {
        const rows = await window.KCHomeCategories.getCategoryCounts(false);
        if (Array.isArray(rows) && rows.length) return rows;
      } catch (_) { }
    }
    return [];
  }

  function buildOrder(personalizedRows, globalRows) {
    const scores = createModuleScores();
    const personalized = normalizeRowsToModuleScores(personalizedRows, 'out_score');
    const global = normalizeRowsToModuleScores(globalRows, 'count');
    const localAffinity = readLocalAffinity();
    let localMax = 0;

    Object.keys(localAffinity).forEach(function (key) {
      if (!STATIC_ORDER.includes(key)) return;
      localMax = Math.max(localMax, Number(localAffinity[key] && localAffinity[key].score || 0));
    });

    scores.forEach(function (entry, moduleKey) {
      const personalFromRpc = Number(personalized.get(moduleKey) || 0);
      const personalFromLocal = localMax > 0 ? (Number(localAffinity[moduleKey] && localAffinity[moduleKey].score || 0) / localMax) : 0;
      const personal = Math.max(personalFromRpc, personalFromLocal);
      const globalScore = Number(global.get(moduleKey) || 0);
      const stableTie = (STATIC_ORDER.length - entry.originalIndex) / (STATIC_ORDER.length * 100);
      entry.personal = personal;
      entry.global = globalScore;
      entry.score = (personal * 0.62) + (globalScore * 0.33) + stableTie;
    });

    const ordered = Array.from(scores.values()).sort(function (left, right) {
      if (right.score !== left.score) return right.score - left.score;
      return left.originalIndex - right.originalIndex;
    }).map(function (row) { return row.moduleKey; });

    const hasSignal = Array.from(scores.values()).some(function (row) {
      return row.personal > 0 || row.global > 0;
    });
    return hasSignal ? ordered : [];
  }

  function applyOrderToNav(nav, order) {
    if (!nav || !Array.isArray(order) || !order.length) return false;
    const links = Array.from(nav.querySelectorAll(':scope > a[href]'));
    if (!links.length) return false;

    const known = [];
    const unknown = [];
    links.forEach(function (link, index) {
      const moduleKey = inferModuleFromHref(link.getAttribute('href'));
      if (moduleKey && order.includes(moduleKey)) {
        link.setAttribute('data-kc-nav-module', moduleKey);
        known.push({ link, moduleKey, index });
      } else {
        unknown.push({ link, index });
      }
    });
    if (!known.length) return false;

    const rank = new Map(order.map(function (key, index) { return [key, index]; }));
    const nextKnown = known.slice().sort(function (left, right) {
      return Number(rank.get(left.moduleKey) || 0) - Number(rank.get(right.moduleKey) || 0)
        || left.index - right.index;
    });
    const current = known.map(function (item) { return item.moduleKey; }).join('|');
    const next = nextKnown.map(function (item) { return item.moduleKey; }).join('|');
    if (current === next) return false;

    nextKnown.concat(unknown).forEach(function (item) {
      nav.appendChild(item.link);
    });

    try {
      if (typeof window.kcApplyProgressiveNavCollapse === 'function') window.kcApplyProgressiveNavCollapse();
      if (typeof window.kcInitScrollIndicators === 'function') window.kcInitScrollIndicators();
    } catch (_) { }
    return true;
  }

  function attachTracking(nav) {
    if (!nav || nav.__kcNavPersonalizedTracking) return;
    nav.__kcNavPersonalizedTracking = true;
    nav.addEventListener('click', function (event) {
      const link = event.target && event.target.closest && event.target.closest('a[href]');
      if (!link || !nav.contains(link)) return;
      const moduleKey = inferModuleFromHref(link.getAttribute('href'));
      if (!moduleKey) return;
      trackLocalNavAffinity(moduleKey);

      try {
        if (hasAnalyticsConsent() && window.KCPrivacyAnalytics && typeof window.KCPrivacyAnalytics.track === 'function') {
          window.KCPrivacyAnalytics.track('category_click', {
            module_key: moduleKey,
            source: 'nav_link',
            href: MODULE_HREFS[moduleKey] || link.getAttribute('href') || '',
          }).catch(function () {});
        }
      } catch (_) { }
    }, true);
  }

  async function hydrate() {
    const navs = Array.from(document.querySelectorAll('.kc-nav-links'));
    if (!navs.length) return;
    navs.forEach(attachTracking);

    const cached = readCachedOrder();
    if (cached && cached.length) {
      navs.forEach(function (nav) { applyOrderToNav(nav, cached); });
    }

    const personalizedRows = await fetchPersonalizedRows();
    const globalRows = await fetchGlobalCountRows();
    const order = buildOrder(personalizedRows, globalRows);
    if (!order.length) return;
    const localAffinity = readLocalAffinity();
    const hasPersonalSignal = hasAnalyticsConsent()
      && (personalizedRows.length > 0 || Object.keys(localAffinity).length > 0);
    writeCachedOrder(order, hasPersonalSignal);
    navs.forEach(function (nav) { applyOrderToNav(nav, order); });
  }

  function start() {
    const run = function () {
      window.setTimeout(function () {
        hydrate().catch(function (error) {
          if (window.KC_ENV && window.KC_ENV.debug) {
            console.warn('[KCNavLinksPersonalized]', error && error.message || error);
          }
        });
      }, 120);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }
  }

  start();
}());

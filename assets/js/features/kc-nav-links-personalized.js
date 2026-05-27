/*
 * KinoCampus - kc-nav-links-personalized.js
 *
 * A ordem visual do kc-nav-links agora é fixa no HTML base para evitar salto
 * entre a navegação inicial e a navegação hidratada. Este script mantém apenas
 * a telemetria consentida de cliques no menu.
 */
(function () {
  'use strict';

  const AFFINITY_KEY = 'kc_nav_module_affinity_v1';

  const FIXED_ORDER = Object.freeze([
    'eventos',
    'oportunidades',
    'moradia',
    'compra-venda',
    'caronas',
    'achados-perdidos',
  ]);

  const MODULE_HREFS = Object.freeze({
    eventos: 'eventos.html',
    oportunidades: 'oportunidades.html',
    moradia: 'moradia.html',
    'compra-venda': 'compra-venda-feed.html',
    caronas: 'caronas-feed.html',
    'achados-perdidos': 'achados-perdidos.html',
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

  function inferModuleFromHref(href) {
    const clean = String(href || '').split('#')[0].split('?')[0].toLowerCase();
    if (clean.includes('eventos')) return 'eventos';
    if (clean.includes('oportunidades')) return 'oportunidades';
    if (clean.includes('moradia')) return 'moradia';
    if (clean.includes('compra-venda-feed')) return 'compra-venda';
    if (clean.includes('caronas-feed')) return 'caronas';
    if (clean.includes('achados-perdidos')) return 'achados-perdidos';
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

  function readLocalAffinity() {
    if (!hasAnalyticsConsent()) return {};
    const data = readJsonStorage(window.localStorage, AFFINITY_KEY, {});
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  }

  function trackLocalNavAffinity(moduleKey) {
    if (!hasAnalyticsConsent() || !moduleKey || !FIXED_ORDER.includes(moduleKey)) return;
    const data = readLocalAffinity();
    const current = data[moduleKey] || { score: 0, interactions: 0, updatedAt: null };
    data[moduleKey] = {
      score: Number(current.score || 0) + 4,
      interactions: Number(current.interactions || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    writeJsonStorage(window.localStorage, AFFINITY_KEY, data);
  }

  function attachTracking(nav) {
    if (!nav || nav.__kcNavLinksTracking) return;
    nav.__kcNavLinksTracking = true;
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

  function hydrateTracking() {
    Array.from(document.querySelectorAll('.kc-nav-links')).forEach(attachTracking);
  }

  function start() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', hydrateTracking, { once: true });
    } else {
      hydrateTracking();
    }
  }

  start();
}());

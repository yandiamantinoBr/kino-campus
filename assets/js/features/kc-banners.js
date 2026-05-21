/*
  KinoCampus - kc-banners.js (v9.2.4.0)
  Carrega os banners ativos do Supabase e substitui o
  carrossel estatico da index.html.
  Fallback: mantem os banners hardcoded se o Supabase falhar
  ou se o driver for 'local'.
*/
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.KCBanners = api;
  }
}(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const HERO_ICON_KEY_MAP = {
    'fas fa-calendar-alt': 'calendar',
    'fas fa-exchange-alt': 'exchange',
    'fas fa-campground': 'launch',
  };

  const HERO_MOBILE_ART = {
    calendar: [
      '<svg viewBox="0 0 120 92" role="presentation" focusable="false" aria-hidden="true">',
      '<rect x="12" y="16" width="86" height="64" rx="18" fill="rgba(255,255,255,0.16)"></rect>',
      '<rect x="12" y="16" width="86" height="18" rx="18" fill="rgba(255,255,255,0.28)"></rect>',
      '<rect x="26" y="10" width="8" height="18" rx="4" fill="rgba(255,255,255,0.78)"></rect>',
      '<rect x="76" y="10" width="8" height="18" rx="4" fill="rgba(255,255,255,0.78)"></rect>',
      '<rect x="26" y="44" width="18" height="12" rx="6" fill="rgba(255,255,255,0.72)"></rect>',
      '<rect x="52" y="44" width="18" height="12" rx="6" fill="rgba(255,255,255,0.26)"></rect>',
      '<rect x="78" y="44" width="8" height="12" rx="4" fill="rgba(255,255,255,0.42)"></rect>',
      '<rect x="52" y="62" width="34" height="8" rx="4" fill="rgba(255,255,255,0.42)"></rect>',
      '</svg>',
    ].join(''),
    exchange: [
      '<svg viewBox="0 0 120 92" role="presentation" focusable="false" aria-hidden="true">',
      '<rect x="16" y="22" width="88" height="48" rx="24" fill="rgba(255,255,255,0.15)"></rect>',
      '<path d="M28 40h42l-8-8" fill="none" stroke="rgba(255,255,255,0.78)" stroke-linecap="round" stroke-linejoin="round" stroke-width="8"></path>',
      '<path d="M92 54H50l8 8" fill="none" stroke="rgba(255,255,255,0.58)" stroke-linecap="round" stroke-linejoin="round" stroke-width="8"></path>',
      '<circle cx="84" cy="40" r="5" fill="rgba(255,255,255,0.26)"></circle>',
      '<circle cx="36" cy="54" r="5" fill="rgba(255,255,255,0.22)"></circle>',
      '</svg>',
    ].join(''),
    launch: [
      '<svg viewBox="0 0 120 92" role="presentation" focusable="false" aria-hidden="true">',
      '<path d="M22 74 54 24 86 74Z" fill="rgba(255,255,255,0.18)"></path>',
      '<path d="M40 74 54 46 68 74Z" fill="rgba(255,255,255,0.76)"></path>',
      '<path d="M54 24v50" fill="none" stroke="rgba(255,255,255,0.42)" stroke-linecap="round" stroke-width="6"></path>',
      '<circle cx="86" cy="24" r="8" fill="rgba(255,255,255,0.24)"></circle>',
      '<rect x="74" y="62" width="26" height="6" rx="3" fill="rgba(255,255,255,0.38)"></rect>',
      '</svg>',
    ].join(''),
    fallback: [
      '<svg viewBox="0 0 120 92" role="presentation" focusable="false" aria-hidden="true">',
      '<rect x="18" y="24" width="72" height="44" rx="22" fill="rgba(255,255,255,0.14)"></rect>',
      '<rect x="34" y="16" width="52" height="14" rx="7" fill="rgba(255,255,255,0.24)"></rect>',
      '<rect x="48" y="54" width="40" height="8" rx="4" fill="rgba(255,255,255,0.42)"></rect>',
      '</svg>',
    ].join(''),
  };

  const BANNER_CACHE_SCOPE = 'home';
  const BANNER_CACHE_KEY = 'hero-banners:v1';
  const BANNER_CACHE_VERSION = 1;
  const BANNER_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
  const BANNER_CACHE_STALE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeIconClass(iconClass) {
    return String(iconClass || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function getHeroIconKey(iconClass) {
    return HERO_ICON_KEY_MAP[normalizeIconClass(iconClass)] || 'fallback';
  }

  function buildDesktopIllustration(iconClass) {
    const safeClass = String(iconClass || '').trim();
    if (!safeClass) return '';
    return [
      '<div aria-hidden="true" class="kc-hero-illustration">',
      `<i class="${esc(safeClass)}"></i>`,
      '</div>',
    ].join('');
  }

  function buildMobileIllustrationByKey(iconKey) {
    const safeKey = HERO_MOBILE_ART[iconKey] ? iconKey : 'fallback';
    return [
      `<div aria-hidden="true" class="kc-hero-illustration-mobile" data-kc-hero-mobile="${esc(safeKey)}">`,
      HERO_MOBILE_ART[safeKey],
      '</div>',
    ].join('');
  }

  function buildMobileIllustration(iconClass) {
    return buildMobileIllustrationByKey(getHeroIconKey(iconClass));
  }

  function buildHeroIllustrations(iconClass) {
    return buildDesktopIllustration(iconClass) + buildMobileIllustration(iconClass);
  }

  function buildBannerHTML(banner, isActive) {
    const gradStyle = `background: linear-gradient(90deg, ${esc(banner.gradient_from)}, ${esc(banner.gradient_to)});`;
    const iconKey = getHeroIconKey(banner.icon_class);
    return [
      `<div class="kc-hero-banner${isActive ? ' active' : ''}" data-hero-icon="${esc(iconKey)}" style="${gradStyle}">`,
      '<div class="kc-hero-inner">',
      '<div class="kc-hero-content">',
      `<span class="kc-hero-pill">${esc(banner.pill_text)}</span>`,
      `<h1>${esc(banner.title)}</h1>`,
      `<p>${esc(banner.subtitle)}</p>`,
      `<a class="kc-btn-primary" href="${esc(banner.button_url)}">${esc(banner.button_text)}</a>`,
      '</div>',
      buildHeroIllustrations(banner.icon_class),
      '</div>',
      '</div>',
    ].join('');
  }

  function buildDotsHTML(count) {
    const dots = [];
    for (let i = 0; i < count; i += 1) {
      dots.push(`<span class="kc-dot${i === 0 ? ' active' : ''}" data-kc-slide="${i}"></span>`);
    }
    return dots.join('');
  }

  function hydrateExistingBanners(doc) {
    const targetDoc = doc || (typeof document !== 'undefined' ? document : null);
    if (!targetDoc) return;

    targetDoc.querySelectorAll('.kc-hero-banner').forEach((banner) => {
      const desktopIcon = banner.querySelector('.kc-hero-illustration i');
      const desktopIconClass = desktopIcon ? desktopIcon.className : '';
      const iconKey = getHeroIconKey(desktopIconClass || banner.getAttribute('data-hero-icon'));
      banner.setAttribute('data-hero-icon', iconKey);

      const inner = banner.querySelector('.kc-hero-inner');
      if (!inner) return;

      if (!banner.querySelector('.kc-hero-illustration-mobile')) {
        inner.insertAdjacentHTML('beforeend', buildMobileIllustrationByKey(iconKey));
      }
    });
  }

  function bindHeroCTAInteractions(doc) {
    const targetDoc = doc || (typeof document !== 'undefined' ? document : null);
    if (!targetDoc) return;

    targetDoc.querySelectorAll('.kc-hero-carousel .kc-btn-primary').forEach((cta) => {
      if (cta.dataset.kcHeroCtaBound === 'true') return;
      cta.dataset.kcHeroCtaBound = 'true';

      const stopHeroGesture = function (event) {
        event.stopPropagation();
      };

      cta.addEventListener('pointerdown', stopHeroGesture, { passive: true });
      cta.addEventListener('pointerup', stopHeroGesture, { passive: true });
      cta.addEventListener('touchstart', stopHeroGesture, { passive: true });
      cta.addEventListener('touchend', stopHeroGesture, { passive: true });
      cta.addEventListener('click', stopHeroGesture);
    });
  }

  function getCarouselEl(doc) {
    const targetDoc = doc || (typeof document !== 'undefined' ? document : null);
    return targetDoc ? targetDoc.querySelector('.kc-hero-carousel') : null;
  }

  function removeSkeletonClass() {
    const el = getCarouselEl();
    if (el) el.classList.remove('kc-hero-loading');
  }

  function getSessionStore() {
    return root.KCSessionStore && typeof root.KCSessionStore.get === 'function'
      ? root.KCSessionStore
      : null;
  }

  function normalizeBannerRow(row) {
    const source = row && typeof row === 'object' ? row : {};
    return {
      id: source.id == null ? '' : String(source.id),
      pill_text: String(source.pill_text || ''),
      title: String(source.title || ''),
      subtitle: String(source.subtitle || ''),
      button_text: String(source.button_text || ''),
      button_url: String(source.button_url || ''),
      icon_class: String(source.icon_class || ''),
      gradient_from: String(source.gradient_from || ''),
      gradient_to: String(source.gradient_to || ''),
      sort_order: Number(source.sort_order) || 0,
    };
  }

  function normalizeBannerRows(rows) {
    return Array.isArray(rows) ? rows.map(normalizeBannerRow).filter((row) => row.title) : [];
  }

  function buildBannerSignature(rows) {
    const normalized = normalizeBannerRows(rows);
    return JSON.stringify(normalized.map((row) => [
      row.id,
      row.pill_text,
      row.title,
      row.subtitle,
      row.button_text,
      row.button_url,
      row.icon_class,
      row.gradient_from,
      row.gradient_to,
      row.sort_order,
    ]));
  }

  function getCachedBanners() {
    const store = getSessionStore();
    if (!store || typeof store.get !== 'function') return null;

    const cached = store.get(BANNER_CACHE_SCOPE, BANNER_CACHE_KEY, {
      maxAge: BANNER_CACHE_STALE_MAX_AGE_MS,
      removeExpired: true,
    });
    const value = cached && cached.value && typeof cached.value === 'object' ? cached.value : null;
    if (!value || Number(value.version) !== BANNER_CACHE_VERSION) return null;

    const banners = normalizeBannerRows(value.banners);
    if (!banners.length) return null;

    const signature = String(value.signature || buildBannerSignature(banners));
    const age = Number(cached.age) || 0;
    return {
      banners,
      signature,
      age,
      isFresh: age <= BANNER_CACHE_MAX_AGE_MS,
    };
  }

  function persistBanners(rows, signature) {
    const store = getSessionStore();
    const banners = normalizeBannerRows(rows);
    if (!store || typeof store.set !== 'function' || !banners.length) return false;

    return store.set(BANNER_CACHE_SCOPE, BANNER_CACHE_KEY, {
      version: BANNER_CACHE_VERSION,
      banners,
      signature: String(signature || buildBannerSignature(banners)),
    });
  }

  function renderBannerRows(rows, signature, doc) {
    const targetDoc = doc || (typeof document !== 'undefined' ? document : null);
    if (!targetDoc) return false;

    const banners = normalizeBannerRows(rows);
    const slidesEl = targetDoc.getElementById('kc-hero-slides');
    const dotsEl = targetDoc.getElementById('kc-carousel-dots');
    if (!banners.length || !slidesEl || !dotsEl) return false;

    const nextSignature = String(signature || buildBannerSignature(banners));
    if (slidesEl.dataset.kcBannersSignature !== nextSignature) {
      slidesEl.innerHTML = banners.map((banner, index) => buildBannerHTML(banner, index === 0)).join('');
      dotsEl.innerHTML = buildDotsHTML(banners.length);
      slidesEl.dataset.kcBannersSignature = nextSignature;
    }

    bindHeroCTAInteractions(targetDoc);
    if (typeof root.kcRefreshHeroCarousel === 'function') {
      root.kcRefreshHeroCarousel();
    } else if (typeof root.showSlide === 'function') {
      root.showSlide(0);
    }
    removeSkeletonClass();
    return true;
  }

  async function loadBanners() {
    const env = root.KC_ENV || {};
    const driver = String(env.DATA_DRIVER || env.driver || 'local').toLowerCase();
    if (driver !== 'supabase') {
      hydrateExistingBanners();
      bindHeroCTAInteractions();
      removeSkeletonClass();
      return;
    }

    const cached = getCachedBanners();
    const renderedCached = !!(cached && renderBannerRows(cached.banners, cached.signature));
    if (cached && cached.isFresh) return;

    const client = root.KCSupabase && typeof root.KCSupabase.getClient === 'function'
      ? root.KCSupabase.getClient()
      : null;
    if (!client) {
      if (!renderedCached) {
        hydrateExistingBanners();
        bindHeroCTAInteractions();
        removeSkeletonClass();
      }
      return;
    }

    try {
      const { data, error } = await client
        .from('hero_banners')
        .select('id, pill_text, title, subtitle, button_text, button_url, icon_class, gradient_from, gradient_to, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        console.warn('[KC Banners] Erro ao carregar banners do Supabase:', error.message || error);
        if (!renderedCached) {
          hydrateExistingBanners();
          removeSkeletonClass();
        }
        return;
      }
      if (!Array.isArray(data) || !data.length) {
        if (!renderedCached) {
          hydrateExistingBanners();
          removeSkeletonClass();
        }
        return;
      }

      const rows = normalizeBannerRows(data);
      const signature = buildBannerSignature(rows);
      if (!renderBannerRows(rows, signature)) {
        removeSkeletonClass();
        return;
      }
      persistBanners(rows, signature);
    } catch (e) {
      console.warn('[KC Banners] Excecao ao carregar banners:', e && e.message || e);
      if (!renderedCached) {
        hydrateExistingBanners();
        removeSkeletonClass();
      }
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      hydrateExistingBanners();
      bindHeroCTAInteractions(document);

      let loaded = false;
      const tryLoad = () => {
        if (loaded) return;
        loaded = true;
        loadBanners();
      };

      if (root.KCSupabase && typeof root.KCSupabase.getClient === 'function'
          && root.KCSupabase.getClient()) {
        tryLoad();
      } else {
        document.addEventListener('kc:authchange', function onFirst() {
          document.removeEventListener('kc:authchange', onFirst);
          tryLoad();
        });
        setTimeout(tryLoad, 300);
      }
    });
  }

  return {
    esc,
    getHeroIconKey,
    buildMobileIllustration,
    buildBannerHTML,
    buildBannerSignature,
    normalizeBannerRows,
    getCachedBanners,
    persistBanners,
    renderBannerRows,
    hydrateExistingBanners,
    bindHeroCTAInteractions,
  };
}));

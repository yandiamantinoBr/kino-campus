/*
  KinoCampus - kc-banners.js (v9.2.5.0)
  Carrega SOMENTE banners ativos (is_active=true) do Supabase e
  popula o carrossel da home. Visitantes e usuarios autenticados
  veem a mesma lista publica ativa.

  Nao ha mais mock hardcoded na index: se o driver for supabase e
  a carga falhar, o carrossel fica vazio (sem slides antigos).
  Cache de sessao/localStorage e publico (nao depende de login).
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
  const BANNER_CACHE_KEY = 'hero-banners:v2';
  const BANNER_CACHE_VERSION = 2;
  const BANNER_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
  const BANNER_CACHE_STALE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const BANNER_PUBLIC_STORAGE_KEY = 'kc:hero-banners:v2:public';
  const CLIENT_RETRY_DELAYS_MS = [0, 200, 500, 1000, 2000];
  let bannerLoadInFlight = null;

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
    const bannerId = banner.id || banner.banner_id || banner.title || '';
    return [
      `<div class="kc-hero-banner${isActive ? ' active' : ''}" data-hero-icon="${esc(iconKey)}" data-kc-banner-id="${esc(bannerId)}" data-kc-banner-title="${esc(banner.title)}" style="${gradStyle}">`,
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

  function getLocalStorage() {
    try {
      return root.localStorage || null;
    } catch (_) {
      return null;
    }
  }

  function readPublicBannerCache() {
    const storage = getLocalStorage();
    if (!storage) return null;
    try {
      const raw = storage.getItem(BANNER_PUBLIC_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (Number(parsed.version) !== BANNER_CACHE_VERSION) return null;
      const banners = normalizeBannerRows(parsed.banners);
      if (!banners.length) return null;
      const timestamp = Number(parsed.timestamp) || 0;
      const age = Date.now() - timestamp;
      if (!Number.isFinite(age) || age < 0 || age > BANNER_CACHE_STALE_MAX_AGE_MS) {
        storage.removeItem(BANNER_PUBLIC_STORAGE_KEY);
        return null;
      }
      return {
        banners,
        signature: String(parsed.signature || buildBannerSignature(banners)),
        age,
        isFresh: age <= BANNER_CACHE_MAX_AGE_MS,
      };
    } catch (_) {
      return null;
    }
  }

  function writePublicBannerCache(rows, signature) {
    const storage = getLocalStorage();
    const banners = normalizeBannerRows(rows);
    if (!storage || !banners.length) return false;
    try {
      storage.setItem(BANNER_PUBLIC_STORAGE_KEY, JSON.stringify({
        version: BANNER_CACHE_VERSION,
        timestamp: Date.now(),
        banners,
        signature: String(signature || buildBannerSignature(banners)),
      }));
      return true;
    } catch (_) {
      return false;
    }
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
    if (store && typeof store.get === 'function') {
      const cached = store.get(BANNER_CACHE_SCOPE, BANNER_CACHE_KEY, {
        maxAge: BANNER_CACHE_STALE_MAX_AGE_MS,
        removeExpired: true,
      });
      const value = cached && cached.value && typeof cached.value === 'object' ? cached.value : null;
      if (value && Number(value.version) === BANNER_CACHE_VERSION) {
        const banners = normalizeBannerRows(value.banners);
        if (banners.length) {
          const signature = String(value.signature || buildBannerSignature(banners));
          const age = Number(cached.age) || 0;
          return {
            banners,
            signature,
            age,
            isFresh: age <= BANNER_CACHE_MAX_AGE_MS,
          };
        }
      }
    }

    // Public cache works for visitors (no login) and for private browsing
    // where session APIs are restricted.
    return readPublicBannerCache();
  }

  function persistBanners(rows, signature) {
    const banners = normalizeBannerRows(rows);
    if (!banners.length) return false;
    const nextSignature = String(signature || buildBannerSignature(banners));
    const payload = {
      version: BANNER_CACHE_VERSION,
      banners,
      signature: nextSignature,
    };

    let ok = false;
    const store = getSessionStore();
    if (store && typeof store.set === 'function') {
      ok = !!store.set(BANNER_CACHE_SCOPE, BANNER_CACHE_KEY, payload) || ok;
    }
    ok = writePublicBannerCache(banners, nextSignature) || ok;
    return ok;
  }

  function clearCarousel(doc) {
    const targetDoc = doc || (typeof document !== 'undefined' ? document : null);
    if (!targetDoc) return false;
    const slidesEl = targetDoc.getElementById('kc-hero-slides');
    const dotsEl = targetDoc.getElementById('kc-carousel-dots');
    const carousel = getCarouselEl(targetDoc);
    if (slidesEl) {
      slidesEl.innerHTML = '';
      slidesEl.dataset.kcBannersSignature = '';
      slidesEl.dataset.kcBannersSource = 'empty';
    }
    if (dotsEl) dotsEl.innerHTML = '';
    if (carousel) {
      carousel.setAttribute('aria-busy', 'false');
      carousel.classList.add('kc-hero-empty');
    }
    removeSkeletonClass();
    return true;
  }

  function renderBannerRows(rows, signature, doc) {
    const targetDoc = doc || (typeof document !== 'undefined' ? document : null);
    if (!targetDoc) return false;

    const banners = normalizeBannerRows(rows);
    const slidesEl = targetDoc.getElementById('kc-hero-slides');
    const dotsEl = targetDoc.getElementById('kc-carousel-dots');
    const carousel = getCarouselEl(targetDoc);
    if (!slidesEl || !dotsEl) return false;

    if (!banners.length) {
      return clearCarousel(targetDoc);
    }

    const nextSignature = String(signature || buildBannerSignature(banners));
    if (slidesEl.dataset.kcBannersSignature !== nextSignature) {
      slidesEl.innerHTML = banners.map((banner, index) => buildBannerHTML(banner, index === 0)).join('');
      dotsEl.innerHTML = buildDotsHTML(banners.length);
      slidesEl.dataset.kcBannersSignature = nextSignature;
      slidesEl.dataset.kcBannersSource = 'active';
    }

    if (carousel) {
      carousel.classList.remove('kc-hero-empty');
      carousel.setAttribute('aria-busy', 'false');
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

  function resolveDriver() {
    const env = root.KC_ENV || {};
    return String(env.DATA_DRIVER || env.driver || 'local').toLowerCase();
  }

  function wait(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, Math.max(0, Number(ms) || 0));
    });
  }

  async function resolveSupabaseClient() {
    if (!root.KCSupabase || typeof root.KCSupabase.getClient !== 'function') {
      return null;
    }
    for (let i = 0; i < CLIENT_RETRY_DELAYS_MS.length; i += 1) {
      if (CLIENT_RETRY_DELAYS_MS[i] > 0) {
        await wait(CLIENT_RETRY_DELAYS_MS[i]);
      }
      try {
        const client = root.KCSupabase.getClient();
        if (client) return client;
      } catch (_) {
        // keep retrying
      }
    }
    return null;
  }

  async function loadBannersOnce() {
    const driver = resolveDriver();
    if (driver !== 'supabase') {
      // Local/dev only: keep any authoring markup if present, no mock injection.
      hydrateExistingBanners();
      bindHeroCTAInteractions();
      removeSkeletonClass();
      return;
    }

    const cached = getCachedBanners();
    const renderedCached = !!(cached && renderBannerRows(cached.banners, cached.signature));
    if (cached && cached.isFresh) return;

    const client = await resolveSupabaseClient();
    if (!client) {
      // Never reintroduce hardcoded mock slides for visitors.
      if (!renderedCached) clearCarousel();
      console.warn('[KC Banners] Supabase client indisponivel; carrossel sem mock.');
      return;
    }

    try {
      // Public active banners only — same query for anon and authenticated.
      const { data, error } = await client
        .from('hero_banners')
        .select('id, pill_text, title, subtitle, button_text, button_url, icon_class, gradient_from, gradient_to, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        console.warn('[KC Banners] Erro ao carregar banners do Supabase:', error.message || error);
        if (!renderedCached) clearCarousel();
        return;
      }
      if (!Array.isArray(data) || !data.length) {
        // Active list is intentionally empty: clear UI (no mock).
        clearCarousel();
        return;
      }

      const rows = normalizeBannerRows(data);
      const signature = buildBannerSignature(rows);
      if (!renderBannerRows(rows, signature)) {
        clearCarousel();
        return;
      }
      persistBanners(rows, signature);
    } catch (e) {
      console.warn('[KC Banners] Excecao ao carregar banners:', e && e.message || e);
      if (!renderedCached) clearCarousel();
    }
  }

  function loadBanners() {
    // Startup and auth-settled events can overlap. They read the same public
    // active catalog, so share only the pending load (not an auth/session cache).
    // Release after every outcome so a later event can retry or revalidate.
    if (!bannerLoadInFlight) {
      bannerLoadInFlight = loadBannersOnce().finally(function () {
        bannerLoadInFlight = null;
      });
    }
    return bannerLoadInFlight;
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      // Do not hydrate mock slides: index ships empty until active banners load.
      bindHeroCTAInteractions(document);

      let started = false;
      const tryLoad = () => {
        if (started) return;
        started = true;
        loadBanners();
      };

      // Load for visitors immediately (anon key). Auth is not required.
      tryLoad();
      // Also refresh after auth settles so login/logout never leaves a stale shell.
      document.addEventListener('kc:authchange', function onAuth() {
        loadBanners();
      });
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
    clearCarousel,
    hydrateExistingBanners,
    bindHeroCTAInteractions,
    loadBanners,
  };
}));

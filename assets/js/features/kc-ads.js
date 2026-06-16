/*
  KinoCampus - Feed Ads (v9.3.7.0)
  Renderiza anuncios contextuais proprios e slots AdSense controlados em paginas de feed.
  Nao usa perfil individual por padrao.
*/
(function (root, factory) {
  const api = factory(root || {});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.KCAds = api;
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function (root) {
  'use strict';

  const VERSION = '9.3.7.0';
  const CACHE_SCOPE = 'ads';
  const CACHE_VERSION = 1;
  const CACHE_MAX_AGE_MS = 5 * 60 * 1000;
  const CACHE_STALE_MAX_AGE_MS = 30 * 60 * 1000;
  const FREQUENCY_STORAGE_KEY = 'kc_ad_frequency_v1';
  const INLINE_AFTER_FIRST = 6;
  const INLINE_INTERVAL = 6;
  const INLINE_MAX_PER_LIST = 8;
  let frequencyMemory = {};
  const safeSetTimeout = typeof root.setTimeout === 'function'
    ? root.setTimeout.bind(root)
    : (typeof setTimeout === 'function' ? setTimeout : function (fn) {
      if (typeof fn === 'function') fn();
      return 0;
    });
  const safeClearTimeout = typeof root.clearTimeout === 'function'
    ? root.clearTimeout.bind(root)
    : (typeof clearTimeout === 'function' ? clearTimeout : function () { });

  const FEED_PAGE_MODULES = Object.freeze({
    '/index.html': '',
    '/': '',
    '/eventos.html': 'eventos',
    '/oportunidades.html': 'oportunidades',
    '/moradia.html': 'moradia',
    '/compra-venda-feed.html': 'compra-venda',
    '/caronas-feed.html': 'caronas',
    '/achados-perdidos.html': 'achados-perdidos',
    '/search-results.html': '',
  });

  const BLOCKED_PATH_RE = /\/(?:admin\/|product\.html|_product\.html|create-post\.html|my-posts\.html|profile\.html|settings\.html|mensagens\.html|account-setup\.html|auth-callback\.html|privacidade\.html|termos\.html|ajuda\.html|transparencia\.html)/i;
  const ADSENSE_CLIENT_FALLBACK = 'ca-pub-2776499020194231';
  const ADSENSE_SCRIPT_ID = 'kcAdsenseScript';
  const VALID_PLACEMENTS = ['feed_inline', 'feed_aside'];
  const VALID_SLOT_PLACEMENTS = ['feed_inline', 'feed_aside_top', 'feed_aside_sticky'];
  const VALID_PROVIDER_MODES = ['direct_only', 'adsense_fallback', 'adsense_only', 'off'];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function asArray(value) {
    if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
    if (typeof value === 'string') {
      return value
        .replace(/[{}"]/g, '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  function asPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function normalizeKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function sanitizeUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, root.location && root.location.origin ? root.location.origin : 'https://www.kinocampus.com.br');
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      if (url.origin === (root.location && root.location.origin)) {
        return url.pathname + url.search;
      }
      return url.href;
    } catch (_) {
      if (/^[./a-z0-9_-][a-z0-9_./?#=&%-]*$/i.test(raw) && !/^javascript:/i.test(raw)) return raw;
      return '';
    }
  }

  function normalizeAdRow(row) {
    const source = row && typeof row === 'object' ? row : {};
    const placements = asArray(source.placements).filter((item) => VALID_PLACEMENTS.indexOf(item) >= 0);
    const frequencyCap = source.frequency_cap_per_session == null || source.frequency_cap_per_session === ''
      ? 4
      : Math.max(0, Math.floor(Number(source.frequency_cap_per_session) || 0));
    return {
      id: source.id == null ? '' : String(source.id),
      name: String(source.name || ''),
      advertiser_name: String(source.advertiser_name || ''),
      sponsor_label: String(source.sponsor_label || 'Patrocinado'),
      title: String(source.title || ''),
      description: String(source.description || ''),
      image_url: sanitizeUrl(source.image_url || ''),
      cta_label: String(source.cta_label || 'Saiba mais'),
      target_url: sanitizeUrl(source.target_url || ''),
      campaign_type: String(source.campaign_type || 'direct'),
      placements: placements.length ? placements : ['feed_inline'],
      module_keys: asArray(source.module_keys).map(normalizeKey),
      tags: asArray(source.tags).map(normalizeKey),
      priority: Number(source.priority) || 0,
      frequency_cap_per_session: frequencyCap,
      starts_at: source.starts_at || '',
      ends_at: source.ends_at || '',
    };
  }

  function normalizeAdRows(rows) {
    return (Array.isArray(rows) ? rows : [])
      .map(normalizeAdRow)
      .filter((ad) => ad.id && ad.title && ad.target_url);
  }

  function normalizeProviderMode(value) {
    const mode = String(value || '').trim().toLowerCase();
    return VALID_PROVIDER_MODES.indexOf(mode) >= 0 ? mode : 'direct_only';
  }

  function normalizeAdConfig(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const data = source.settings && typeof source.settings === 'object' ? source.settings : source;
    const enabled = source.enabled === true || data.enabled === true || data.status === 'active';
    const placementModes = asPlainObject(data.placement_modes);
    const adsenseSlots = asPlainObject(data.adsense_slots);
    const modes = {};
    VALID_SLOT_PLACEMENTS.forEach((placement) => {
      modes[placement] = normalizeProviderMode(placementModes[placement]);
    });
    return {
      ok: source.ok !== false,
      enabled,
      provider: String(data.provider || 'direct'),
      status: String(data.status || (enabled ? 'active' : 'disabled')),
      adsense_client_id: String(data.adsense_client_id || data.adsenseClientId || ADSENSE_CLIENT_FALLBACK).trim(),
      auto_ads_enabled: data.auto_ads_enabled === true,
      placement_modes: modes,
      adsense_slots: VALID_SLOT_PLACEMENTS.reduce((acc, placement) => {
        acc[placement] = String(adsenseSlots[placement] || '').trim();
        return acc;
      }, {}),
    };
  }

  function defaultAdConfig() {
    return normalizeAdConfig({
      enabled: false,
      status: 'disabled',
      provider: 'direct',
      adsense_client_id: ADSENSE_CLIENT_FALLBACK,
      placement_modes: {
        feed_inline: 'direct_only',
        feed_aside_top: 'direct_only',
        feed_aside_sticky: 'direct_only',
      },
      adsense_slots: {},
    });
  }

  function slotPlacementFor(placement, slot) {
    if (placement === 'feed_aside') {
      return slot === 'sticky' ? 'feed_aside_sticky' : 'feed_aside_top';
    }
    return VALID_SLOT_PLACEMENTS.indexOf(placement) >= 0 ? placement : 'feed_inline';
  }

  function hasAdvertisingConsent() {
    try {
      return !!(root.KCConsent
        && typeof root.KCConsent.hasConsent === 'function'
        && root.KCConsent.hasConsent('advertising'));
    } catch (_) {
      return false;
    }
  }

  function canRenderAdsense(config, slotPlacement) {
    const cfg = normalizeAdConfig(config);
    const slot = cfg.adsense_slots[slotPlacement] || '';
    return !!(cfg.enabled
      && cfg.status === 'active'
      && cfg.adsense_client_id
      && slot
      && hasAdvertisingConsent());
  }

  function getPagePath() {
    const path = root.location && root.location.pathname ? root.location.pathname : '/';
    return path === '/' ? '/' : path;
  }

  function isFeedPage(pathname) {
    const path = pathname || getPagePath();
    if (BLOCKED_PATH_RE.test(path)) return false;
    return Object.prototype.hasOwnProperty.call(FEED_PAGE_MODULES, path);
  }

  function getPageModule(pathname) {
    const path = pathname || getPagePath();
    return FEED_PAGE_MODULES[path] || '';
  }

  function getSearchQuery() {
    try {
      return new URLSearchParams(root.location && root.location.search || '').get('q') || '';
    } catch (_) {
      return '';
    }
  }

  function getSessionStore() {
    return root.KCSessionStore && typeof root.KCSessionStore.get === 'function'
      ? root.KCSessionStore
      : null;
  }

  function getClient() {
    return root.KCSupabase && typeof root.KCSupabase.getClient === 'function'
      ? root.KCSupabase.getClient()
      : null;
  }

  function cacheKey(context) {
    const ctx = context || {};
    return [
      'feed-ads:v',
      CACHE_VERSION,
      ctx.page_path || getPagePath(),
      ctx.module_key || getPageModule(),
      ctx.search_query || getSearchQuery(),
    ].join(':');
  }

  function getCachedAds(context) {
    const store = getSessionStore();
    if (!store) return null;
    const cached = store.get(CACHE_SCOPE, cacheKey(context), {
      maxAge: CACHE_STALE_MAX_AGE_MS,
      removeExpired: true,
    });
    const value = cached && cached.value && typeof cached.value === 'object' ? cached.value : null;
    const ads = value && Number(value.version) === CACHE_VERSION ? normalizeAdRows(value.ads) : [];
    if (!ads.length) return null;
    return {
      ads,
      isFresh: (Number(cached.age) || 0) <= CACHE_MAX_AGE_MS,
    };
  }

  function persistAds(context, ads) {
    const store = getSessionStore();
    if (!store || typeof store.set !== 'function') return false;
    return store.set(CACHE_SCOPE, cacheKey(context), {
      version: CACHE_VERSION,
      ads: normalizeAdRows(ads),
    });
  }

  function adMatchesPlacement(ad, placement) {
    return ad && ad.placements && ad.placements.indexOf(placement) >= 0;
  }

  function adMatchesContext(ad, context) {
    const moduleKey = normalizeKey(context && context.module_key);
    if (!ad || !moduleKey || !ad.module_keys.length) return true;
    return ad.module_keys.indexOf(moduleKey) >= 0;
  }

  function readFrequencyState() {
    try {
      const raw = root.sessionStorage && root.sessionStorage.getItem(FREQUENCY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return frequencyMemory;
    }
  }

  function writeFrequencyState(state) {
    const safe = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
    frequencyMemory = safe;
    try {
      if (root.sessionStorage) root.sessionStorage.setItem(FREQUENCY_STORAGE_KEY, JSON.stringify(safe));
    } catch (_) { }
  }

  function getFrequencyCount(adId) {
    const key = String(adId || '');
    if (!key) return 0;
    const state = readFrequencyState();
    return Math.max(0, Number(state[key]) || 0);
  }

  function incrementFrequencyCount(adId) {
    const key = String(adId || '');
    if (!key) return 0;
    const state = readFrequencyState();
    state[key] = getFrequencyCount(key) + 1;
    writeFrequencyState(state);
    return state[key];
  }

  function clearFrequencyCaps() {
    frequencyMemory = {};
    try {
      if (root.sessionStorage) root.sessionStorage.removeItem(FREQUENCY_STORAGE_KEY);
    } catch (_) { }
  }

  function adWithinFrequencyCap(ad) {
    const safe = normalizeAdRow(ad);
    const cap = Number(safe.frequency_cap_per_session) || 0;
    if (!safe.id || cap <= 0) return true;
    return getFrequencyCount(safe.id) < cap;
  }

  function selectAdsForPlacement(ads, placement, context, max) {
    const limit = Math.max(1, Number(max) || 1);
    return normalizeAdRows(ads)
      .filter((ad) => adMatchesPlacement(ad, placement) && adMatchesContext(ad, context || {}))
      .filter(adWithinFrequencyCap)
      .sort((left, right) => (right.priority - left.priority) || left.title.localeCompare(right.title, 'pt-BR'))
      .slice(0, limit);
  }

  function buildInlineSlotAds(selected, slotCount) {
    const ads = normalizeAdRows(selected);
    const total = Math.max(0, Number(slotCount) || 0);
    if (!total) return [];
    if (!ads.length) return Array.from({ length: total }, function () { return null; });
    const planned = {};
    const slots = [];
    let cursor = 0;
    let guard = 0;
    while (slots.length < total && guard < total * Math.max(ads.length, 1) * 2) {
      const ad = ads[cursor % ads.length];
      cursor += 1;
      guard += 1;
      const cap = Number(ad.frequency_cap_per_session) || 0;
      const used = getFrequencyCount(ad.id) + (planned[ad.id] || 0);
      if (cap > 0 && used >= cap) {
        if (ads.every(function (item) {
          const itemCap = Number(item.frequency_cap_per_session) || 0;
          return itemCap > 0 && getFrequencyCount(item.id) + (planned[item.id] || 0) >= itemCap;
        })) break;
        continue;
      }
      planned[ad.id] = (planned[ad.id] || 0) + 1;
      slots.push(ad);
    }
    while (slots.length < total) slots.push(null);
    return slots;
  }

  function isExternalUrl(url) {
    try {
      const parsed = new URL(String(url || ''), root.location && root.location.origin ? root.location.origin : 'https://www.kinocampus.com.br');
      return !!(root.location && parsed.origin !== root.location.origin);
    } catch (_) {
      return false;
    }
  }

  function slugForUtm(value) {
    return normalizeKey(value)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'campanha';
  }

  function buildTrackedTargetUrl(ad, placement) {
    const safe = normalizeAdRow(ad);
    const href = safe.target_url || '';
    if (!href) return '';
    try {
      const base = root.location && root.location.origin ? root.location.origin : 'https://www.kinocampus.com.br';
      const url = new URL(href, base);
      if (root.location && url.origin === root.location.origin) return url.pathname + url.search;
      url.searchParams.set('utm_source', 'kinocampus');
      url.searchParams.set('utm_medium', 'feed_ad');
      url.searchParams.set('utm_campaign', slugForUtm(safe.name || safe.title || safe.id));
      url.searchParams.set('utm_content', placement || 'feed_ad');
      if (safe.id) url.searchParams.set('kc_ad_id', safe.id);
      return url.href;
    } catch (_) {
      return href;
    }
  }

  function shouldRenderAside() {
    if (typeof root.matchMedia === 'function') {
      return root.matchMedia('(min-width: 1024px)').matches;
    }
    if (typeof root.innerWidth === 'number') return root.innerWidth >= 1024;
    return true;
  }

  function getInlineSlotCount(cardsLength) {
    const count = Math.floor(Math.max(0, Number(cardsLength) || 0) / INLINE_INTERVAL);
    return Math.max(0, Math.min(INLINE_MAX_PER_LIST, count));
  }

  function buildAdHTML(ad, placement, slotPlacement) {
    const safe = normalizeAdRow(ad);
    const metricPlacement = slotPlacement || placement;
    const href = buildTrackedTargetUrl(safe, metricPlacement) || safe.target_url || '#';
    const external = isExternalUrl(href);
    const sponsor = safe.advertiser_name || safe.sponsor_label || 'Patrocinado';
    const label = safe.sponsor_label || 'Publicidade';
    const image = safe.image_url
      ? `<a class="kc-ad-card__media" href="${esc(href)}" rel="sponsored noopener noreferrer"${external ? ' target="_blank"' : ''}><img src="${esc(safe.image_url)}" alt="${esc(safe.title)}" loading="lazy" decoding="async"></a>`
      : '<div class="kc-ad-card__media kc-ad-card__media--fallback" aria-hidden="true"><i class="fas fa-bullhorn"></i></div>';
    return [
      `<article class="kc-ad-card kc-ad-card--${placement === 'feed_aside' ? 'aside' : 'inline'}" data-kc-managed-ad="true" data-kc-ad-id="${esc(safe.id)}" data-kc-ad-placement="${esc(metricPlacement)}" data-kc-ad-title="${esc(safe.title)}">`,
      '<div class="kc-ad-card__label">',
      `<span>${esc(label)}</span>`,
      `<small>${esc(sponsor)}</small>`,
      '</div>',
      '<div class="kc-ad-card__body">',
      image,
      '<div class="kc-ad-card__content">',
      `<h3><a href="${esc(href)}" rel="sponsored noopener noreferrer"${external ? ' target="_blank"' : ''}>${esc(safe.title)}</a></h3>`,
      safe.description ? `<p>${esc(safe.description)}</p>` : '',
      `<a class="kc-ad-card__cta" href="${esc(href)}" rel="sponsored noopener noreferrer"${external ? ' target="_blank"' : ''}>${esc(safe.cta_label)} <i class="fas fa-arrow-right" aria-hidden="true"></i></a>`,
      '</div>',
      '</div>',
      '</article>',
    ].join('');
  }

  function buildAdsenseHTML(config, slotPlacement) {
    const cfg = normalizeAdConfig(config);
    const placement = slotPlacementFor(slotPlacement);
    const slot = cfg.adsense_slots[placement] || '';
    if (!slot) return '';
    const aside = placement.indexOf('feed_aside') === 0;
    return [
      `<article class="kc-ad-card kc-ad-card--${aside ? 'aside' : 'inline'} kc-ad-card--adsense" data-kc-managed-ad="true" data-kc-ad-provider="adsense" data-kc-ad-placement="${esc(placement)}">`,
      '<div class="kc-ad-card__label"><span>Publicidade</span><small>Google AdSense</small></div>',
      '<div class="kc-ad-card__body kc-ad-card__body--adsense">',
      `<ins class="adsbygoogle" style="display:block" data-ad-client="${esc(cfg.adsense_client_id)}" data-ad-slot="${esc(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins>`,
      '</div>',
      '</article>',
    ].join('');
  }

  function loadAdsenseScriptOnce(config) {
    const cfg = normalizeAdConfig(config);
    if (!root.document || !cfg.adsense_client_id || !hasAdvertisingConsent()) return false;
    if (root.document.getElementById(ADSENSE_SCRIPT_ID)) return true;
    const script = root.document.createElement('script');
    script.id = ADSENSE_SCRIPT_ID;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(cfg.adsense_client_id);
    if (root.document.head) {
      root.document.head.appendChild(script);
    } else {
      const firstScript = root.document.getElementsByTagName('script')[0];
      if (firstScript && firstScript.parentNode) firstScript.parentNode.insertBefore(script, firstScript);
    }
    return !!script.parentNode;
  }

  function maybeLoadAutoAds(config) {
    const cfg = normalizeAdConfig(config);
    if (!isFeedPage() || !cfg.enabled || cfg.status !== 'active' || !cfg.auto_ads_enabled || !hasAdvertisingConsent()) return false;
    return loadAdsenseScriptOnce(cfg);
  }

  function pushAdsenseSlots(scope) {
    const target = scope || root.document;
    if (!target || !hasAdvertisingConsent()) return;
    const slots = Array.from(target.querySelectorAll ? target.querySelectorAll('ins.adsbygoogle:not([data-kc-adsense-pushed])') : []);
    slots.forEach((slot) => {
      slot.setAttribute('data-kc-adsense-pushed', 'true');
      try {
        root.adsbygoogle = root.adsbygoogle || [];
        root.adsbygoogle.push({});
      } catch (_) { }
    });
  }

  function resolveSlotRender(ad, placement, slotPlacement, config) {
    const cfg = normalizeAdConfig(config);
    const mode = cfg.placement_modes[slotPlacementFor(slotPlacement)] || 'direct_only';
    const hasDirect = !!ad;
    const hasAdsense = canRenderAdsense(cfg, slotPlacementFor(slotPlacement));
    if (mode === 'off') return { provider: 'off', html: '' };
    if (mode === 'adsense_only') {
      return hasAdsense ? { provider: 'adsense', html: buildAdsenseHTML(cfg, slotPlacement) } : { provider: 'off', html: '' };
    }
    if (mode === 'adsense_fallback' && !hasDirect && hasAdsense) {
      return { provider: 'adsense', html: buildAdsenseHTML(cfg, slotPlacement) };
    }
    if (hasDirect) return { provider: 'direct', html: buildAdHTML(ad, placement, slotPlacementFor(slotPlacement)) };
    if (mode === 'adsense_fallback' && hasAdsense) return { provider: 'adsense', html: buildAdsenseHTML(cfg, slotPlacement) };
    return { provider: 'off', html: '' };
  }

  function removeManagedInlineAds(container) {
    if (!container) return;
    container.querySelectorAll('.kc-ad-card--inline[data-kc-managed-ad="true"]').forEach((node) => node.remove());
  }

  function renderInlineAds(container, ads, context, config) {
    const cfg = normalizeAdConfig(config || defaultAdConfig());
    if (!container) return false;
    const cards = Array.from(container.children).filter((node) => node.classList && node.classList.contains('kc-card'));
    if (cards.length < INLINE_AFTER_FIRST) {
      removeManagedInlineAds(container);
      delete container.dataset.kcAdsSignature;
      return false;
    }
    const slotCount = getInlineSlotCount(cards.length);
    const selected = selectAdsForPlacement(ads, 'feed_inline', context, slotCount || 1);
    if (!selected.length && !canRenderAdsense(cfg, 'feed_inline')) return false;
    const slotAds = buildInlineSlotAds(selected, slotCount);
    const slotRenders = slotAds.map((ad) => {
      return resolveSlotRender(ad, 'feed_inline', 'feed_inline', cfg);
    }).filter((item) => item && item.html);
    if (!slotRenders.length) {
      removeManagedInlineAds(container);
      delete container.dataset.kcAdsSignature;
      return false;
    }
    if (slotRenders.some((item) => item.provider === 'adsense')) {
      loadAdsenseScriptOnce(cfg);
    }
    const signature = [
      cards.length,
      slotRenders.map((item, index) => item.provider + ':' + (slotAds[index] ? slotAds[index].id : 'adsense')).join('|'),
    ].join(':');
    if (container.dataset.kcAdsSignature === signature
      && container.querySelectorAll('.kc-ad-card--inline[data-kc-managed-ad="true"]').length === slotRenders.length) {
      bindTracking(container);
      pushAdsenseSlots(container);
      return true;
    }
    removeManagedInlineAds(container);

    slotRenders.forEach((item, index) => {
      const targetIndex = Math.min((INLINE_INTERVAL * (index + 1)) - 1, cards.length - 1);
      const anchor = cards[targetIndex];
      if (anchor) anchor.insertAdjacentHTML('afterend', item.html);
    });
    container.dataset.kcAdsSignature = signature;
    bindTracking(container);
    pushAdsenseSlots(container);
    return true;
  }

  function removeManagedAsideAds(targetDoc) {
    if (!targetDoc || !targetDoc.querySelectorAll) return;
    targetDoc
      .querySelectorAll('[data-kc-ad-aside], [data-kc-ad-aside="true"]')
      .forEach((node) => node.remove());
  }

  function renderAsideSection(sidebar, targetDoc, slot, ad, config) {
    if (!sidebar || !targetDoc) return null;
    const slotPlacement = slotPlacementFor('feed_aside', slot);
    const rendered = resolveSlotRender(ad, 'feed_aside', slotPlacement, config || defaultAdConfig());
    if (!rendered.html) return null;
    if (rendered.provider === 'adsense') loadAdsenseScriptOnce(config);
    let section = sidebar.querySelector('[data-kc-ad-aside="' + slot + '"]');
    if (!section) {
      section = targetDoc.createElement('section');
      section.setAttribute('data-kc-ad-aside', slot);
    }
    section.className = 'kc-sidebar-section kc-sidebar-section--ads kc-sidebar-section--ads-' + slot;
    section.innerHTML = [
      '<div class="kc-ad-sidebar-head">',
      '<h3><i class="fas fa-rectangle-ad" aria-hidden="true"></i> Publicidade</h3>',
      '<span>' + (rendered.provider === 'adsense' ? 'AdSense' : 'Patrocinado') + '</span>',
      '</div>',
      rendered.html,
    ].join('');
    if (slot === 'top') {
      const firstContentSection = Array.from(sidebar.children || []).find((node) => {
        return node !== section && !(node.getAttribute && node.getAttribute('data-kc-ad-aside'));
      });
      if (firstContentSection) {
        sidebar.insertBefore(section, firstContentSection.nextSibling);
      } else if (sidebar.firstElementChild !== section) {
        sidebar.insertBefore(section, sidebar.firstElementChild);
      }
    } else {
      sidebar.appendChild(section);
    }
    return section;
  }

  function renderAsideAds(ads, context, doc, config) {
    const targetDoc = doc || root.document;
    const cfg = normalizeAdConfig(config || defaultAdConfig());
    if (!shouldRenderAside()) {
      removeManagedAsideAds(targetDoc);
      return false;
    }
    if (!targetDoc) return false;
    const sidebar = targetDoc.querySelector('main .kc-sidebar');
    if (!sidebar) return false;
    const selected = selectAdsForPlacement(ads, 'feed_aside', context, 2);
    if (!selected.length && !canRenderAdsense(cfg, 'feed_aside_top') && !canRenderAdsense(cfg, 'feed_aside_sticky')) return false;
    sidebar.querySelectorAll('[data-kc-ad-aside="true"]').forEach((node) => node.remove());
    const topAd = selected[0] || null;
    const stickyAd = selected[1] || (selected.length === 1 ? selected[0] : null);
    const top = renderAsideSection(sidebar, targetDoc, 'top', topAd, cfg);
    const sticky = renderAsideSection(sidebar, targetDoc, 'sticky', stickyAd, cfg);
    bindTracking(top);
    bindTracking(sticky);
    pushAdsenseSlots(top);
    pushAdsenseSlots(sticky);
    return true;
  }

  function renderAllAds(ads, context, doc, config) {
    const targetDoc = doc || root.document;
    if (!targetDoc || !isFeedPage()) return false;
    const feedLists = Array.from(targetDoc.querySelectorAll('.kc-feed-list'));
    const cfg = normalizeAdConfig(config || defaultAdConfig());
    let rendered = maybeLoadAutoAds(cfg);
    rendered = renderAsideAds(ads, context, targetDoc, cfg) || rendered;
    feedLists.forEach((container) => {
      rendered = renderInlineAds(container, ads, context, cfg) || rendered;
    });
    return rendered;
  }

  const trackedImpressions = new Set();

  function recordLocalImpression(adNode) {
    if (!adNode) return 0;
    const adId = adNode.getAttribute('data-kc-ad-id') || '';
    return incrementFrequencyCount(adId);
  }

  function trackAd(eventName, adNode) {
    if (!adNode || !root.KCPrivacyAnalytics || typeof root.KCPrivacyAnalytics.track !== 'function') return;
    const adId = adNode.getAttribute('data-kc-ad-id') || '';
    const placement = adNode.getAttribute('data-kc-ad-placement') || '';
    const title = adNode.getAttribute('data-kc-ad-title') || '';
    root.KCPrivacyAnalytics.track(eventName, {
      entity_type: 'ad_campaign',
      entity_id: adId,
      entity_label: title,
      module_key: getPageModule(),
      page_path: getPagePath(),
      source: placement,
      href: (adNode.querySelector('a[href]') || {}).href || '',
    }).catch(function () { });
  }

  function bindTracking(rootNode) {
    const scope = rootNode || root.document;
    if (!scope) return;

    if (!scope.__kcAdsTrackingBound) {
      scope.__kcAdsTrackingBound = true;
      scope.addEventListener('click', function (event) {
        const link = event.target && event.target.closest && event.target.closest('.kc-ad-card a[href]');
        if (!link) return;
        const card = link.closest('.kc-ad-card');
        trackAd('ad_click', card);
      }, true);
    }

    const cards = Array.from(scope.querySelectorAll ? scope.querySelectorAll('.kc-ad-card[data-kc-ad-id]') : []);
    if (!cards.length) return;
    if (!root.IntersectionObserver) {
      cards.forEach((card) => {
        const key = card.getAttribute('data-kc-ad-id') + ':' + card.getAttribute('data-kc-ad-placement');
        if (trackedImpressions.has(key)) return;
        trackedImpressions.add(key);
        recordLocalImpression(card);
        trackAd('ad_impression', card);
      });
      return;
    }
    const observer = new root.IntersectionObserver(function (entries, obs) {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5) return;
        const card = entry.target;
        const key = card.getAttribute('data-kc-ad-id') + ':' + card.getAttribute('data-kc-ad-placement');
        if (!trackedImpressions.has(key)) {
          trackedImpressions.add(key);
          recordLocalImpression(card);
          trackAd('ad_impression', card);
        }
        obs.unobserve(card);
      });
    }, { threshold: [0.5] });
    cards.forEach((card) => observer.observe(card));
  }

  async function fetchAds(context) {
    const client = getClient();
    if (!client || typeof client.rpc !== 'function') return [];
    const args = {
      p_page_path: context.page_path,
      p_module_key: context.module_key,
      p_search_query: context.search_query,
      p_placement: null,
      p_limit: 8,
    };
    const response = await client.rpc('kc_get_feed_ads', args);
    if (response && response.error) throw response.error;
    return normalizeAdRows(response && response.data);
  }

  async function fetchAdConfig(context) {
    const client = getClient();
    if (!client || typeof client.rpc !== 'function') return defaultAdConfig();
    try {
      const response = await client.rpc('kc_get_feed_ad_config', {
        p_page_path: context.page_path,
        p_module_key: context.module_key,
        p_placement: null,
      });
      if (response && response.error) return defaultAdConfig();
      return normalizeAdConfig(response && response.data);
    } catch (_) {
      return defaultAdConfig();
    }
  }

  function observeFeeds(ads, context, config) {
    if (!root.document || !root.MutationObserver) return;
    const lists = Array.from(root.document.querySelectorAll('.kc-feed-list'));
    lists.forEach((list) => {
      if (list.__kcAdsObserved) return;
      list.__kcAdsObserved = true;
      let timer = null;
      const observer = new root.MutationObserver(function () {
        safeClearTimeout(timer);
        timer = safeSetTimeout(function () {
          renderInlineAds(list, ads, context, config);
        }, 120);
      });
      observer.observe(list, { childList: true });
    });
  }

  async function loadAndRender() {
    if (!root.document || !isFeedPage()) return { ok: false, code: 'NOT_FEED_PAGE' };
    const context = {
      page_path: getPagePath(),
      module_key: getPageModule(),
      search_query: getSearchQuery(),
    };
    const cached = getCachedAds(context);
    const config = await fetchAdConfig(context);
    if (cached && cached.ads.length) {
      renderAllAds(cached.ads, context, null, config);
      observeFeeds(cached.ads, context, config);
      if (cached.isFresh) return { ok: true, source: 'cache' };
    }
    try {
      const ads = await fetchAds(context);
      if (ads.length || config.enabled) {
        persistAds(context, ads);
        renderAllAds(ads, context, null, config);
        observeFeeds(ads, context, config);
      }
      return { ok: true, source: 'supabase', count: ads.length };
    } catch (error) {
      if (cached && cached.ads.length) return { ok: true, source: 'stale-cache', error };
      if (config.enabled) {
        renderAllAds([], context, null, config);
        observeFeeds([], context, config);
        return { ok: true, source: 'adsense-config', error };
      }
      return { ok: false, error };
    }
  }

  function init() {
    if (!root.document || !isFeedPage()) return;
    const run = function () { loadAndRender().catch(function () { }); };
    if (root.KCSupabase && typeof root.KCSupabase.getClient === 'function' && root.KCSupabase.getClient()) {
      safeSetTimeout(run, 250);
    } else {
      root.document.addEventListener('kc:authchange', run, { once: true });
      safeSetTimeout(run, 900);
    }
  }

  if (root && root.document) {
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }
  }

  return Object.freeze({
    VERSION,
    FEED_PAGE_MODULES,
    normalizeAdRow,
    normalizeAdRows,
    sanitizeUrl,
    isFeedPage,
    getPageModule,
    selectAdsForPlacement,
    slugForUtm,
    buildTrackedTargetUrl,
    getInlineSlotCount,
    buildAdHTML,
    renderInlineAds,
    renderAsideAds,
    renderAllAds,
    normalizeAdConfig,
    defaultAdConfig,
    buildAdsenseHTML,
    canRenderAdsense,
    maybeLoadAutoAds,
    getFrequencyCount,
    incrementFrequencyCount,
    clearFrequencyCaps,
    loadAndRender,
  });
}));

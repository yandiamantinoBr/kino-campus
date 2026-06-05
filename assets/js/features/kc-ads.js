/*
  KinoCampus - Feed Ads (v9.3.6.0)
  Renderiza anuncios contextuais proprios em paginas de feed.
  Nao carrega rede externa e nao usa perfil individual por padrao.
*/
(function (root, factory) {
  const api = factory(root || {});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.KCAds = api;
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function (root) {
  'use strict';

  const VERSION = '9.3.6.0';
  const CACHE_SCOPE = 'ads';
  const CACHE_VERSION = 1;
  const CACHE_MAX_AGE_MS = 5 * 60 * 1000;
  const CACHE_STALE_MAX_AGE_MS = 30 * 60 * 1000;
  const INLINE_AFTER_FIRST = 2;
  const INLINE_INTERVAL = 8;
  const INLINE_MAX_PER_LIST = 2;
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
  const VALID_PLACEMENTS = ['feed_inline', 'feed_aside'];

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
      starts_at: source.starts_at || '',
      ends_at: source.ends_at || '',
    };
  }

  function normalizeAdRows(rows) {
    return (Array.isArray(rows) ? rows : [])
      .map(normalizeAdRow)
      .filter((ad) => ad.id && ad.title && ad.target_url);
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

  function selectAdsForPlacement(ads, placement, context, max) {
    const limit = Math.max(1, Number(max) || 1);
    return normalizeAdRows(ads)
      .filter((ad) => adMatchesPlacement(ad, placement) && adMatchesContext(ad, context || {}))
      .sort((left, right) => (right.priority - left.priority) || left.title.localeCompare(right.title, 'pt-BR'))
      .slice(0, limit);
  }

  function isExternalUrl(url) {
    try {
      const parsed = new URL(String(url || ''), root.location && root.location.origin ? root.location.origin : 'https://www.kinocampus.com.br');
      return !!(root.location && parsed.origin !== root.location.origin);
    } catch (_) {
      return false;
    }
  }

  function shouldRenderAside() {
    if (typeof root.matchMedia === 'function') {
      return root.matchMedia('(min-width: 1024px)').matches;
    }
    if (typeof root.innerWidth === 'number') return root.innerWidth >= 1024;
    return true;
  }

  function buildAdHTML(ad, placement) {
    const safe = normalizeAdRow(ad);
    const href = safe.target_url || '#';
    const external = isExternalUrl(href);
    const sponsor = safe.advertiser_name || safe.sponsor_label || 'Patrocinado';
    const label = safe.sponsor_label || 'Publicidade';
    const image = safe.image_url
      ? `<a class="kc-ad-card__media" href="${esc(href)}" rel="sponsored noopener noreferrer"${external ? ' target="_blank"' : ''}><img src="${esc(safe.image_url)}" alt="${esc(safe.title)}" loading="lazy" decoding="async"></a>`
      : '<div class="kc-ad-card__media kc-ad-card__media--fallback" aria-hidden="true"><i class="fas fa-bullhorn"></i></div>';
    return [
      `<article class="kc-ad-card kc-ad-card--${placement === 'feed_aside' ? 'aside' : 'inline'}" data-kc-managed-ad="true" data-kc-ad-id="${esc(safe.id)}" data-kc-ad-placement="${esc(placement)}" data-kc-ad-title="${esc(safe.title)}">`,
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

  function removeManagedInlineAds(container) {
    if (!container) return;
    container.querySelectorAll('.kc-ad-card--inline[data-kc-managed-ad="true"]').forEach((node) => node.remove());
  }

  function renderInlineAds(container, ads, context) {
    if (!container || !ads || !ads.length) return false;
    const cards = Array.from(container.children).filter((node) => node.classList && node.classList.contains('kc-card'));
    if (cards.length < INLINE_AFTER_FIRST) {
      removeManagedInlineAds(container);
      delete container.dataset.kcAdsSignature;
      return false;
    }
    const selected = selectAdsForPlacement(ads, 'feed_inline', context, INLINE_MAX_PER_LIST);
    if (!selected.length) return false;
    const signature = [
      cards.length,
      selected.map((ad) => ad.id).join('|'),
    ].join(':');
    if (container.dataset.kcAdsSignature === signature
      && container.querySelectorAll('.kc-ad-card--inline[data-kc-managed-ad="true"]').length === selected.length) {
      bindTracking(container);
      return true;
    }
    removeManagedInlineAds(container);

    selected.forEach((ad, index) => {
      const targetIndex = index === 0
        ? Math.min(INLINE_AFTER_FIRST - 1, cards.length - 1)
        : Math.min((INLINE_AFTER_FIRST - 1) + (INLINE_INTERVAL * index), cards.length - 1);
      const anchor = cards[targetIndex];
      if (anchor) anchor.insertAdjacentHTML('afterend', buildAdHTML(ad, 'feed_inline'));
    });
    container.dataset.kcAdsSignature = signature;
    bindTracking(container);
    return true;
  }

  function renderAsideAds(ads, context, doc) {
    const targetDoc = doc || root.document;
    if (!shouldRenderAside()) return false;
    if (!targetDoc || !ads || !ads.length) return false;
    const sidebar = targetDoc.querySelector('main .kc-sidebar');
    if (!sidebar) return false;
    const selected = selectAdsForPlacement(ads, 'feed_aside', context, 2);
    if (!selected.length) return false;

    let section = sidebar.querySelector('[data-kc-ad-aside="true"]');
    if (!section) {
      section = targetDoc.createElement('section');
      section.className = 'kc-sidebar-section kc-sidebar-section--ads';
      section.setAttribute('data-kc-ad-aside', 'true');
      const first = sidebar.querySelector('.kc-sidebar-section');
      if (first && first.nextSibling) sidebar.insertBefore(section, first.nextSibling);
      else sidebar.appendChild(section);
    }
    section.innerHTML = [
      '<div class="kc-ad-sidebar-head">',
      '<h3><i class="fas fa-rectangle-ad" aria-hidden="true"></i> Publicidade</h3>',
      '<span>Patrocinado</span>',
      '</div>',
      selected.map((ad) => buildAdHTML(ad, 'feed_aside')).join(''),
    ].join('');
    bindTracking(section);
    return true;
  }

  function renderAllAds(ads, context, doc) {
    const targetDoc = doc || root.document;
    if (!targetDoc || !isFeedPage()) return false;
    const feedLists = Array.from(targetDoc.querySelectorAll('.kc-feed-list'));
    let rendered = renderAsideAds(ads, context, targetDoc);
    feedLists.forEach((container) => {
      rendered = renderInlineAds(container, ads, context) || rendered;
    });
    return rendered;
  }

  const trackedImpressions = new Set();

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

  function observeFeeds(ads, context) {
    if (!root.document || !root.MutationObserver) return;
    const lists = Array.from(root.document.querySelectorAll('.kc-feed-list'));
    lists.forEach((list) => {
      if (list.__kcAdsObserved) return;
      list.__kcAdsObserved = true;
      let timer = null;
      const observer = new root.MutationObserver(function () {
        safeClearTimeout(timer);
        timer = safeSetTimeout(function () {
          renderInlineAds(list, ads, context);
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
    if (cached && cached.ads.length) {
      renderAllAds(cached.ads, context);
      observeFeeds(cached.ads, context);
      if (cached.isFresh) return { ok: true, source: 'cache' };
    }
    try {
      const ads = await fetchAds(context);
      if (ads.length) {
        persistAds(context, ads);
        renderAllAds(ads, context);
        observeFeeds(ads, context);
      }
      return { ok: true, source: 'supabase', count: ads.length };
    } catch (error) {
      if (cached && cached.ads.length) return { ok: true, source: 'stale-cache', error };
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
    buildAdHTML,
    renderInlineAds,
    renderAsideAds,
    renderAllAds,
    loadAndRender,
  });
}));

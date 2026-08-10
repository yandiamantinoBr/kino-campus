/**
 * KinoCampus Service Worker - v12.17.0
 *
 * Estrategia:
 *   - Shell local versionado (CSS + JS core): stale-while-revalidate
 *   - Recursos externos (Supabase, CDN, Fonts): passthrough (sem cache)
 *   - Navegacoes HTML: network-first com fallback controlado
 *   - Demais requisicoes GET: passthrough (sem cache)
 *
 * Ativado somente quando KCFF.isEnabled('sw.enabled') === true (kill-switch).
 * Por padrao disabled; habilitar via KC_ENV.flags.sw.enabled = true.
 *
 * A fonte mantém versões legíveis para desenvolvimento. No dist, o build troca
 * CACHE_VERSION e todos os ?v= de SHELL_ASSETS pela mesma revisão imutável.
 */

'use strict';

var CACHE_PREFIX = 'kc-shell-';
var CACHE_VERSION = 'kc-shell-v12.18.0';
var ASSET_CACHE = CACHE_VERSION + ':assets';
var PAGE_CACHE = CACHE_VERSION + ':pages';

// Keep each URL identical to the version requested by the HTML shell.
// Cache Storage keys include the query string, so one global version would
// pre-cache URLs that the pages never request when assets evolve separately.
var SHELL_ASSETS = [
  '/assets/css/styles.css?v=8.6.18',
  '/assets/css/kc-chat-shortcut.css?v=8.6.1',
  '/assets/css/kc-public-shell.css?v=8.6.15',
  '/assets/js/boot/kc-constants.js?v=8.6.2',
  '/assets/js/boot/kc-env.js?v=8.6.13',
  '/assets/js/boot/kc-feature-flags.js?v=8.6.1',
  '/assets/js/boot/kc-sw-register.js?v=8.6.1',
  '/assets/js/core/kc-i18n.js?v=8.6.13',
  '/assets/js/utils/kc-utils.string.js?v=8.6.4',
  '/assets/js/utils/kc-utils.format.js?v=8.6.1',
  '/assets/js/utils/kc-utils.dom.js?v=8.6.1',
  '/assets/js/utils/kc-utils.js?v=8.6.1',
  '/assets/js/core/kc-core.js?v=8.6.6',
];

/** Padroes que nunca devem ser cacheados (Supabase, CDNs, Fonts). */
var PASSTHROUGH_PATTERNS = [
  /supabase\.co/,
  /cdn\.jsdelivr\.net/,
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/,
  /ka-f\.fontawesome\.com/,
  /kit\.fontawesome\.com/,
];

function isPassthrough(url) {
  return PASSTHROUGH_PATTERNS.some(function (p) { return p.test(url); });
}

function isSameOrigin(url) {
  try { return new URL(url).origin === self.location.origin; } catch (_) { return false; }
}

function isVersionedAsset(request) {
  try {
    var url = new URL(request.url);
    return url.origin === self.location.origin
      && /^\/assets\/.+\.(?:js|css|woff2?|png|jpe?g|webp|svg)$/i.test(url.pathname)
      && url.searchParams.has('v');
  } catch (_) {
    return false;
  }
}

function cacheableResponse(response) {
  return response && response.status === 200 && (response.type === 'basic' || response.type === 'default');
}

function staleWhileRevalidate(request) {
  return caches.open(ASSET_CACHE).then(function (cache) {
    return cache.match(request).then(function (cached) {
      var networkFetch = fetch(request).then(function (response) {
        if (cacheableResponse(response)) {
          cache.put(request, response.clone());
        }
        return response;
      }).catch(function () {
        return cached;
      });
      return cached || networkFetch;
    });
  });
}

function networkFirstNavigation(event) {
  return caches.open(PAGE_CACHE).then(function (cache) {
    var request = event.request;
    var preload = event.preloadResponse || Promise.resolve(null);
    return preload.then(function (preloaded) {
      if (preloaded && cacheableResponse(preloaded)) {
        cache.put(request, preloaded.clone());
        return preloaded;
      }
      return fetch(request).then(function (response) {
        if (cacheableResponse(response)) {
          cache.put(request, response.clone());
        }
        return response;
      });
    }).catch(function () {
      return cache.match(request).then(function (cached) {
        if (cached) return cached;
        return cache.match('/index.html').then(function (indexFallback) {
          return indexFallback || new Response('Offline', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        });
      });
    });
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(ASSET_CACHE)
      .then(function (cache) { return cache.addAll(SHELL_ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) {
              return k.indexOf(CACHE_PREFIX) === 0
                && k !== ASSET_CACHE
                && k !== PAGE_CACHE;
            })
            .map(function (k) { return caches.delete(k); })
        );
      })
      .then(function () {
        if (self.registration && self.registration.navigationPreload) {
          return self.registration.navigationPreload.enable();
        }
        return null;
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;

  if (request.method !== 'GET') return;
  if (request.url.indexOf('chrome-extension') === 0) return;

  if (isPassthrough(request.url) || !isSameOrigin(request.url)) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event));
    return;
  }

  if (isVersionedAsset(request)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  event.respondWith(fetch(request));
});

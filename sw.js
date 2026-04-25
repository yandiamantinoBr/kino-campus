/**
 * KinoCampus Service Worker — v12.11.0
 *
 * Estrategia:
 *   - Shell local (CSS + JS core): cache-first com atualização em background
 *   - Recursos externos (Supabase, CDN, Fonts): passthrough (sem cache)
 *   - Demais requisicoes GET: network-first com cache de fallback
 *
 * Ativado somente quando KCFF.isEnabled('sw.enabled') === true (kill-switch).
 * Por padrão disabled; habilitar via KC_ENV.flags.sw.enabled = true.
 *
 * Atualizar CACHE_VERSION a cada release que muda os shell assets.
 */

'use strict';

var CACHE_VERSION = 'kc-shell-v12.11.0';

var SHELL_ASSETS = [
  '/',
  '/assets/css/styles.css',
  '/assets/css/kc-public-shell.css',
  '/assets/js/kc-constants.js',
  '/assets/js/kc-env.js',
  '/assets/js/kc-feature-flags.js',
  '/assets/js/kc-i18n.js',
  '/assets/js/kc-utils.string.js',
  '/assets/js/kc-utils.format.js',
  '/assets/js/kc-utils.dom.js',
  '/assets/js/kc-utils.js',
  '/assets/js/kc-core.js',
];

/** Padrões que nunca devem ser cacheados (Supabase, CDNs, Fonts). */
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

// ── install: pré-cacheia o shell ─────────────────────────────────────────────

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (cache) { return cache.addAll(SHELL_ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

// ── activate: remove caches de versões anteriores ────────────────────────────

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) { return k !== CACHE_VERSION; })
            .map(function (k) { return caches.delete(k); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

// ── fetch: cache-first para shell; passthrough para externos ─────────────────

self.addEventListener('fetch', function (event) {
  var request = event.request;

  // Ignora métodos não-GET e chrome-extension
  if (request.method !== 'GET') return;
  if (request.url.indexOf('chrome-extension') === 0) return;

  // Passthrough para recursos externos (Supabase, CDNs, Fonts)
  if (isPassthrough(request.url)) {
    event.respondWith(fetch(request));
    return;
  }

  // Cache-first: serve do cache, atualiza em background se encontrado
  event.respondWith(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.match(request).then(function (cached) {
        var networkFetch = fetch(request).then(function (response) {
          if (response && response.status === 200) {
            cache.put(request, response.clone());
          }
          return response;
        });
        return cached || networkFetch;
      });
    })
  );
});

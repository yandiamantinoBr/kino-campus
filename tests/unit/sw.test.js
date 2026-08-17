/**
 * sw.test.js — KinoCampus v12.11.0
 *
 * Testes estáticos para:
 *   1. sw.js  — integridade do Service Worker (CACHE_VERSION, SHELL_ASSETS, PASSTHROUGH_PATTERNS)
 *   2. kc-sw-register.js — contrato do registrador (guards KCFF + sw.enabled + serviceWorker)
 *   3. Cadeia HTML — todos os 22 HTMLs incluem kc-sw-register.js após kc-feature-flags.js
 *
 * Nota: sw.js roda em contexto ServiceWorker (não jsdom); testamos apenas
 *       análise estática do código-fonte (leitura de arquivo), não execução.
 */

'use strict';

var fs   = require('fs');
var path = require('path');
var PAGE_MANIFEST = require('../../scripts/admin-pages.manifest.js');

var ROOT  = path.resolve(__dirname, '../..');
var SW    = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
var REG   = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'boot', 'kc-sw-register.js'), 'utf8');

// ── 1. sw.js — integridade ───────────────────────────────────────────────────

describe('sw.js — integridade', function () {

  test('CACHE_VERSION segue o formato kc-shell-vX.Y.Z', function () {
    var match = SW.match(/var CACHE_VERSION\s*=\s*'(kc-shell-v[\d.]+)'/);
    expect(match).not.toBeNull();
    expect(match[1]).toMatch(/^kc-shell-v\d+\.\d+\.\d+$/);
  });

  test('SHELL_ASSETS nao pre-cacheia HTML estatico', function () {
    expect(SW).not.toContain("'/'");
    expect(SW).toContain("request.mode === 'navigate'");
  });

  test('SHELL_ASSETS inclui os arquivos CSS obrigatórios', function () {
    expect(SW).toContain('/assets/css/styles.css');
    expect(SW).toContain('/assets/css/kc-chat-shortcut.css');
    expect(SW).toContain('/assets/css/kc-public-shell.css');
  });

  test('SHELL_ASSETS inclui os JS core do shell', function () {
    expect(SW).toContain('/assets/js/boot/kc-constants.js');
    expect(SW).toContain('/assets/js/boot/kc-env.js');
    expect(SW).toContain('/assets/js/boot/kc-feature-flags.js');
    expect(SW).toContain('/assets/js/core/kc-core.js');
  });

  test('PASSTHROUGH_PATTERNS cobre Supabase', function () {
    expect(SW).toContain('supabase\\.co');
  });

  test('PASSTHROUGH_PATTERNS cobre CDN jsDelivr', function () {
    expect(SW).toContain('cdn\\.jsdelivr\\.net');
  });

  test('PASSTHROUGH_PATTERNS cobre Google Fonts', function () {
    expect(SW).toContain('fonts\\.googleapis\\.com');
    expect(SW).toContain('fonts\\.gstatic\\.com');
  });

  test('PASSTHROUGH_PATTERNS cobre FontAwesome', function () {
    expect(SW).toContain('ka-f\\.fontawesome\\.com');
    expect(SW).toContain('kit\\.fontawesome\\.com');
  });

  test('eventos install, activate e fetch registrados', function () {
    expect(SW).toContain("'install'");
    expect(SW).toContain("'activate'");
    expect(SW).toContain("'fetch'");
  });

  test('usa navigation preload e assets versionados', function () {
    expect(SW).toContain('navigationPreload.enable()');
    expect(SW).toContain('url.searchParams.has');
    expect(SW).not.toContain('RUNTIME_VERSION');
    expect(SW).toContain("'/assets/css/styles.css?v=8.6.21'");
    expect(SW).toContain("'/assets/js/core/kc-i18n.js?v=8.6.13'");
  });

  test('skipWaiting e clients.claim presentes', function () {
    expect(SW).toContain('self.skipWaiting()');
    expect(SW).toContain('self.clients.claim()');
  });

  test('activate remove revisões antigas sem apagar caches de outros recursos', function () {
    expect(SW).toContain("var CACHE_PREFIX = 'kc-shell-'");
    expect(SW).toContain('k.indexOf(CACHE_PREFIX) === 0');
    expect(SW).toMatch(/k !== ASSET_CACHE\s*&& k !== PAGE_CACHE/);
    expect(SW).not.toContain('k.indexOf(CACHE_VERSION)');
  });

});

// ── 2. kc-sw-register.js — contrato ─────────────────────────────────────────

describe('kc-sw-register.js — contrato', function () {

  test('está envolvido em IIFE (função auto-invocada)', function () {
    expect(REG).toMatch(/\(function\s*\(\)\s*\{/);
    expect(REG).toMatch(/\}\)\(\);/);
  });

  test('guard: verifica suporte a serviceWorker no navigator', function () {
    expect(REG).toContain("'serviceWorker' in navigator");
  });

  test('guard: verifica typeof window.KCFF', function () {
    expect(REG).toContain("typeof window.KCFF");
  });

  test('guard: chama KCFF.isEnabled com flag sw.enabled', function () {
    expect(REG).toContain("KCFF.isEnabled('sw.enabled')");
  });

  test('registra /sw.js como caminho do Service Worker', function () {
    expect(REG).toContain("register('/sw.js'");
  });

  test('usa scope "/"', function () {
    expect(REG).toContain("scope: '/'");
  });

  test('registra no evento load (não bloqueia parse)', function () {
    expect(REG).toContain("addEventListener('load'");
  });

});

// ── 3. Cadeia HTML — todos os 22 HTMLs ──────────────────────────────────────

describe('HTML chain — kc-sw-register injetado após kc-feature-flags', function () {

  var publicPages = PAGE_MANIFEST.PUBLIC_PAGES;
  var adminPages = PAGE_MANIFEST.ADMIN_PAGES;

  publicPages.forEach(function (page) {
    test('página pública "' + page + '" inclui kc-sw-register.js após kc-feature-flags.js', function () {
      var html = fs.readFileSync(path.join(ROOT, page), 'utf8');
      var idxFlags = html.indexOf('assets/js/boot/kc-feature-flags.js');
      var idxSW    = html.indexOf('assets/js/boot/kc-sw-register.js');
      expect(idxFlags).toBeGreaterThan(-1);
      expect(idxSW).toBeGreaterThan(-1);
      expect(idxSW).toBeGreaterThan(idxFlags);
    });
  });

  adminPages.forEach(function (page) {
    test('página admin "' + page + '" inclui kc-sw-register.js após kc-feature-flags.js', function () {
      var html = fs.readFileSync(path.join(ROOT, page), 'utf8');
      var idxFlags = html.indexOf('../assets/js/boot/kc-feature-flags.js');
      var idxSW    = html.indexOf('../assets/js/boot/kc-sw-register.js');
      expect(idxFlags).toBeGreaterThan(-1);
      expect(idxSW).toBeGreaterThan(-1);
      expect(idxSW).toBeGreaterThan(idxFlags);
    });
  });

});

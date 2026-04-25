/**
 * telemetry.test.js — KinoCampus v12.12.0
 *
 * Testes estáticos para:
 *   1. kc-telemetry.js — integridade (guards, namespace _KCT, handlers)
 *   2. Cadeia HTML — todos os 22 HTMLs incluem kc-telemetry.js após kc-sw-register.js
 *
 * Nota: kc-telemetry.js manipula window.onerror e eventos globais — testamos
 *       apenas análise estática do código-fonte, não execução no navegador.
 */

'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var TEL  = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'kc-telemetry.js'), 'utf8');

// ── 1. kc-telemetry.js — integridade ────────────────────────────────────────

describe('kc-telemetry.js — integridade', function () {

  test('está envolvido em IIFE (função auto-invocada)', function () {
    expect(TEL).toMatch(/\(function\s*\(\)\s*\{/);
    expect(TEL).toMatch(/\}\)\(\);/);
  });

  test('guard: verifica typeof window.KCFF', function () {
    expect(TEL).toContain("typeof window.KCFF");
  });

  test('guard: chama KCFF.isEnabled com flag telemetry.enabled', function () {
    expect(TEL).toContain("KCFF.isEnabled('telemetry.enabled')");
  });

  test('define MAX_ERRORS como limite do buffer', function () {
    expect(TEL).toMatch(/var\s+MAX_ERRORS\s*=\s*\d+/);
  });

  test('define window._KCT como namespace público', function () {
    expect(TEL).toContain('window._KCT');
  });

  test('_KCT.errors inicializado como array vazio', function () {
    expect(TEL).toContain('errors:');
    expect(TEL).toContain('[]');
  });

  test('_KCT.push implementado (buffer circular)', function () {
    expect(TEL).toContain('push:');
    expect(TEL).toContain('.shift()');
  });

  test('_KCT.getErrors retorna cópia do buffer (.slice)', function () {
    expect(TEL).toContain('getErrors:');
    expect(TEL).toContain('.slice()');
  });

  test('_KCT.clear limpa o buffer', function () {
    expect(TEL).toContain('clear:');
  });

  test('_KCT.flush usa sendBeacon para envio ao backend', function () {
    expect(TEL).toContain('flush:');
    expect(TEL).toContain('sendBeacon');
  });

  test('window.onerror handler registrado', function () {
    expect(TEL).toContain('window.onerror');
    expect(TEL).toContain("'onerror'");
  });

  test('unhandledrejection listener registrado', function () {
    expect(TEL).toContain("addEventListener('unhandledrejection'");
    expect(TEL).toContain("'unhandledrejection'");
  });

  test('beforeunload chama flush para envio final', function () {
    expect(TEL).toContain("addEventListener('beforeunload'");
    expect(TEL).toContain('flush()');
  });

  test('chain anterior preservada: chama _prevOnError se existir', function () {
    expect(TEL).toContain('_prevOnError');
    expect(TEL).toContain('_prevOnError.apply');
  });

});

// ── 2. Cadeia HTML — todos os 22 HTMLs ──────────────────────────────────────

describe('HTML chain — kc-telemetry injetado após kc-sw-register', function () {

  var publicPages = [
    'index.html', '_product.html', 'account-setup.html', 'achados-perdidos.html',
    'ajuda.html', 'auth-callback.html', 'caronas-feed.html', 'compra-venda-feed.html',
    'create-post.html', 'eventos.html', 'moradia.html', 'my-posts.html',
    'ods.html', 'oportunidades.html', 'profile.html', 'search-results.html', 'settings.html',
  ];

  var adminPages = [
    'admin/index.html', 'admin/banners.html', 'admin/help-requests.html',
    'admin/moderation.html', 'admin/reports.html',
  ];

  publicPages.forEach(function (page) {
    test('pública "' + page + '" — kc-telemetry.js após kc-sw-register.js', function () {
      var html = fs.readFileSync(path.join(ROOT, page), 'utf8');
      var idxSW  = html.indexOf('assets/js/kc-sw-register.js');
      var idxTEL = html.indexOf('assets/js/kc-telemetry.js');
      expect(idxSW).toBeGreaterThan(-1);
      expect(idxTEL).toBeGreaterThan(-1);
      expect(idxTEL).toBeGreaterThan(idxSW);
    });
  });

  adminPages.forEach(function (page) {
    test('admin "' + page + '" — kc-telemetry.js após kc-sw-register.js', function () {
      var html = fs.readFileSync(path.join(ROOT, page), 'utf8');
      var idxSW  = html.indexOf('../assets/js/kc-sw-register.js');
      var idxTEL = html.indexOf('../assets/js/kc-telemetry.js');
      expect(idxSW).toBeGreaterThan(-1);
      expect(idxTEL).toBeGreaterThan(-1);
      expect(idxTEL).toBeGreaterThan(idxSW);
    });
  });

});

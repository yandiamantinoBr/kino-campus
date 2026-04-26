#!/usr/bin/env node
/**
 * validate-script-chains.js — KinoCampus v13.2.0
 *
 * Valida que os scripts de boot obrigatórios aparecem na ordem correta
 * em todos os 22 HTMLs canônicos (17 públicos + 5 admin).
 *
 * Cadeia validada (por posição no HTML):
 *   kc-constants.js → kc-env.js → kc-feature-flags.js →
 *   kc-sw-register.js → kc-telemetry.js
 *
 * Esta é a "cadeia de boot" mínima obrigatória. Scripts subsequentes
 * (Supabase CDN, kc-utils.*, adapters, controllers) não são validados
 * nesta versão — cada um tem seu próprio gate em hygiene-check.js.
 *
 * Uso:
 *   node scripts/validate-script-chains.js
 *
 * Sai com código 0 se tudo OK, 1 se houver erros.
 */

'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT   = path.resolve(__dirname, '..');
var errors = [];

// ── Cadeia de boot mínima (ordem obrigatória) ─────────────────────────────────

var BOOT_CHAIN_PUBLIC = [
  'assets/js/boot/kc-constants.js',
  'assets/js/kc-env.js',
  'assets/js/boot/kc-feature-flags.js',
  'assets/js/boot/kc-sw-register.js',
  'assets/js/boot/kc-telemetry.js',
];

var BOOT_CHAIN_ADMIN = [
  '../assets/js/boot/kc-constants.js',
  '../assets/js/kc-env.js',
  '../assets/js/boot/kc-feature-flags.js',
  '../assets/js/boot/kc-sw-register.js',
  '../assets/js/boot/kc-telemetry.js',
];

// ── Páginas ───────────────────────────────────────────────────────────────────

var PUBLIC_PAGES = [
  'index.html',
  '_product.html',
  'account-setup.html',
  'achados-perdidos.html',
  'ajuda.html',
  'auth-callback.html',
  'caronas-feed.html',
  'compra-venda-feed.html',
  'create-post.html',
  'eventos.html',
  'moradia.html',
  'my-posts.html',
  'ods.html',
  'oportunidades.html',
  'profile.html',
  'search-results.html',
  'settings.html',
];

var ADMIN_PAGES = [
  'admin/index.html',
  'admin/banners.html',
  'admin/help-requests.html',
  'admin/moderation.html',
  'admin/reports.html',
];

// ─────────────────────────────────────────────────────────────────────────────

PUBLIC_PAGES.forEach(function (page) {
  validateChain(page, BOOT_CHAIN_PUBLIC);
});

ADMIN_PAGES.forEach(function (page) {
  validateChain(page, BOOT_CHAIN_ADMIN);
});

report();
process.exit(errors.length ? 1 : 0);

// ─────────────────────────────────────────────────────────────────────────────

function validateChain(relPage, chain) {
  var absPath = path.join(ROOT, relPage);

  if (!fs.existsSync(absPath)) {
    errors.push('[' + relPage + '] arquivo não encontrado');
    return;
  }

  var content = fs.readFileSync(absPath, 'utf8');
  var positions = chain.map(function (script) {
    return {
      script: script,
      pos: content.indexOf('src="' + script + '"'),
    };
  });

  // Verificar que todos os scripts estão presentes
  positions.forEach(function (item) {
    if (item.pos === -1) {
      errors.push('[' + relPage + '] script ausente: ' + item.script);
    }
  });

  // Verificar ordem: cada script deve aparecer após o anterior
  for (var i = 1; i < positions.length; i++) {
    var prev = positions[i - 1];
    var curr = positions[i];
    if (prev.pos === -1 || curr.pos === -1) continue; // já reportado acima
    if (curr.pos < prev.pos) {
      errors.push(
        '[' + relPage + '] ordem incorreta: "' + curr.script +
        '" (pos=' + curr.pos + ') deveria aparecer após "' + prev.script +
        '" (pos=' + prev.pos + ')'
      );
    }
  }
}

function report() {
  var total = PUBLIC_PAGES.length + ADMIN_PAGES.length;
  if (errors.length) {
    console.error('[validate-script-chains] FALHOU — ' + errors.length + ' erro(s):');
    errors.forEach(function (e) { console.error('  - ' + e); });
  } else {
    console.log(
      '[validate-script-chains] OK — cadeia de boot validada em ' +
      total + ' HTMLs (cadeia: ' + BOOT_CHAIN_PUBLIC.join(' → ') + ')'
    );
  }
}

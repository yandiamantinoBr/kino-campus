#!/usr/bin/env node
/**
 * validate-repository-structure.js — KinoCampus v13.2.0
 *
 * Valida a estrutura obrigatória do repositório:
 *   - Arquivos raiz obrigatórios (package.json, vercel.json, sw.js, etc.)
 *   - Diretórios obrigatórios (assets/, scripts/, tests/, docs/, admin/)
 *   - Arquivos JS canônicos em assets/js/
 *   - Scripts de validação (criados em v13)
 *
 * Uso:
 *   node scripts/validate-repository-structure.js
 *
 * Sai com código 0 se tudo OK, 1 se houver erros.
 */

'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT   = path.resolve(__dirname, '..');
var errors = [];

// ── Arquivos obrigatórios na raiz ─────────────────────────────────────────────

var ROOT_FILES = [
  'package.json',
  'vercel.json',
  'sw.js',
  'VERSION.json',
  'jest.config.js',
  'playwright.config.js',
  '.lighthouserc.js',
  'index.html',
  'CHANGELOG.md',
  'README.md',
  'RELATORIO-KINOCAMPUS-V13.md',
];

// ── Diretórios obrigatórios ───────────────────────────────────────────────────

var REQUIRED_DIRS = [
  'assets',
  'assets/js',
  'assets/js/controllers',
  'assets/js/adapters',
  'assets/js/boot',
  'assets/js/core',
  'assets/js/api',
  'assets/js/utils',
  'assets/js/legacy-shims',
  'assets/css',
  'scripts',
  'tests',
  'tests/e2e',
  'docs',
  'docs/audits',
  'docs/audits/refactors',
  'docs/audits/accessibility',
  'docs/architecture',
  'docs/releases',
  'docs/releases/v12',
  'docs/qa',
  'docs/qa/reports',
  'admin',
];

// ── Arquivos JS canônicos do runtime ──────────────────────────────────────────

var CANONICAL_JS = [
  'assets/js/kc-constants.js',
  'assets/js/kc-env.js',
  'assets/js/kc-feature-flags.js',
  'assets/js/kc-sw-register.js',
  'assets/js/kc-telemetry.js',
  'assets/js/kc-supabase.client.js',
  'assets/js/kc-auth.ui.js',
  'assets/js/kc-profiles.client.js',
  'assets/js/kc-utils.string.js',
  'assets/js/kc-utils.format.js',
  'assets/js/kc-utils.dom.js',
  'assets/js/kc-utils.identity.js',
  'assets/js/kc-utils.taxonomy.js',
  'assets/js/kc-utils.location.js',
  'assets/js/kc-utils.presentation.js',
  'assets/js/kc-utils.js',
  'assets/js/kc-i18n.js',
  'assets/js/kc-core.js',
  'assets/js/kc-api.client.js',
  'assets/js/kc-ranking.js',
];

// ── Scripts de manutenção ─────────────────────────────────────────────────────

var SCRIPTS = [
  'scripts/hygiene-check.js',
  'scripts/inject-env.js',
  'scripts/validate-version-map.js',
  'scripts/validate-repository-structure.js',
  'scripts/validate-script-chains.js',
  'scripts/validate-public-routes.js',
];

// ── HTMLs públicos canônicos ──────────────────────────────────────────────────

var PUBLIC_HTMLS = [
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

var ADMIN_HTMLS = [
  'admin/index.html',
  'admin/banners.html',
  'admin/help-requests.html',
  'admin/moderation.html',
  'admin/reports.html',
];

// ─────────────────────────────────────────────────────────────────────────────

checkFiles(ROOT_FILES, 'Arquivo raiz');
checkDirs(REQUIRED_DIRS, 'Diretório');
checkFiles(CANONICAL_JS, 'JS canônico');
checkFiles(SCRIPTS, 'Script de manutenção');
checkFiles(PUBLIC_HTMLS, 'HTML público');
checkFiles(ADMIN_HTMLS, 'HTML admin');

report();
process.exit(errors.length ? 1 : 0);

// ─────────────────────────────────────────────────────────────────────────────

function checkFiles(list, label) {
  list.forEach(function (relPath) {
    var absPath = path.join(ROOT, relPath);
    if (!fs.existsSync(absPath)) {
      errors.push('[' + label + '] não encontrado: ' + relPath);
    }
  });
}

function checkDirs(list, label) {
  list.forEach(function (relPath) {
    var absPath = path.join(ROOT, relPath);
    if (!fs.existsSync(absPath)) {
      errors.push('[' + label + '] não encontrado: ' + relPath);
    } else {
      var stat = fs.statSync(absPath);
      if (!stat.isDirectory()) {
        errors.push('[' + label + '] não é diretório: ' + relPath);
      }
    }
  });
}

function report() {
  if (errors.length) {
    console.error('[validate-repository-structure] FALHOU — ' + errors.length + ' erro(s):');
    errors.forEach(function (e) { console.error('  - ' + e); });
  } else {
    console.log(
      '[validate-repository-structure] OK — ' +
      (ROOT_FILES.length + REQUIRED_DIRS.length + CANONICAL_JS.length +
       SCRIPTS.length + PUBLIC_HTMLS.length + ADMIN_HTMLS.length) +
      ' itens verificados'
    );
  }
}

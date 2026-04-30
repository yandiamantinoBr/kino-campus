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
  'RELATORIO-KINOCAMPUS-V59.md',
  'RELATORIO-KINOCAMPUS-V60.md',
  'RELATORIO-KINOCAMPUS-V61.md',
  'RELATORIO-KINOCAMPUS-V62.md',
  'RELATORIO-KINOCAMPUS-V63.md',
];

// ── Diretórios obrigatórios ───────────────────────────────────────────────────

var REQUIRED_DIRS = [
  'assets',
  'assets/js',
  'assets/js/controllers',
  'assets/js/controllers/public',
  'assets/js/controllers/admin',
  'assets/js/adapters',
  'assets/js/adapters/local',
  'assets/js/adapters/supabase',
  'assets/js/boot',
  'assets/js/core',
  'assets/js/api',
  'assets/js/utils',
  'assets/js/legacy-shims',
  'assets/js/features',
  'assets/js/features/create-post',
  'assets/js/shared',
  'assets/js/components',
  'assets/css',
  'assets/css/future-split',
  'scripts',
  'tests',
  'tests/e2e',
  'tests/unit',
  'tests/integration',
  'tests/contract',
  'tests/structure',
  'tests/a11y',
  'tests/fixtures',
  'docs',
  'docs/planning',
  'docs/architecture',
  'docs/archive',
  'docs/archive/relatorios',
  'docs/archive/audits-v11',
  'docs/archive/audits-v12-v13',
  'docs/archive/audits-accessibility',
  'docs/archive/audits-v15',
  'docs/archive/audits-misc',
  'docs/archive/legacy-v6-v8',
  'docs/archive/reviews',
  'docs/archive/qa-legacy',
  'docs/archive/patches',
  'docs/qa',
  'docs/qa/reports',
  'admin',
];

// ── Arquivos JS canônicos do runtime ──────────────────────────────────────────

var CANONICAL_JS = [
  // boot/
  'assets/js/boot/kc-theme-boot.js',
  'assets/js/boot/kc-constants.js',
  'assets/js/boot/kc-env.js',
  'assets/js/boot/kc-feature-flags.js',
  'assets/js/boot/kc-sw-register.js',
  'assets/js/boot/kc-telemetry.js',
  // core/
  'assets/js/core/kc-i18n.js',
  'assets/js/core/kc-auth.ui.js',
  'assets/js/core/kc-profiles.client.js',
  'assets/js/core/kc-theme.js',
  'assets/js/core/kc-notifications.js',
  'assets/js/core/kc-auth-callback.js',
  'assets/js/core/kc-core.js',
  'assets/js/core/kc-post-model.js',
  'assets/js/core/kc-user-posts.js',
  'assets/js/core/kc-core-widgets.js',
  'assets/js/core/kc-public-shell.js',
  // api/
  'assets/js/api/kc-supabase.client.js',
  'assets/js/api/kc-supabase.posts.js',
  'assets/js/api/kc-supabase.ratings.js',
  'assets/js/api/kc-api.auth.js',
  'assets/js/api/kc-api.comments-votes.js',
  'assets/js/api/kc-api.help.js',
  'assets/js/api/kc-api.notifications.js',
  'assets/js/api/kc-api.posts-feed.js',
  'assets/js/api/kc-api.posts-read.js',
  'assets/js/api/kc-api.posts-write.js',
  'assets/js/api/kc-api.profiles.js',
  'assets/js/api/kc-api.ratings.js',
  'assets/js/api/kc-api.related.js',
  'assets/js/api/kc-api.saved.js',
  'assets/js/api/kc-api.client.js',
  // utils/
  'assets/js/utils/kc-utils.string.js',
  'assets/js/utils/kc-utils.format.js',
  'assets/js/utils/kc-utils.dom.js',
  'assets/js/utils/kc-utils.identity.js',
  'assets/js/utils/kc-utils.taxonomy.js',
  'assets/js/utils/kc-utils.location.js',
  'assets/js/utils/kc-utils.presentation.js',
  'assets/js/utils/kc-utils.js',
  // features/
  'assets/js/features/kc-comments.js',
  'assets/js/features/kc-search.js',
  'assets/js/features/kc-search-modal.js',
  'assets/js/features/kc-ranking.js',
  'assets/js/features/kc-filters.js',
  'assets/js/features/kc-feed-filters.js',
  'assets/js/features/kc-banners.js',
  'assets/js/features/kc-home-categories.js',
  'assets/js/features/kc-lazy-loader.js',
  'assets/js/features/kc-pull-to-refresh.js',
  // features/create-post/
  'assets/js/features/create-post/kc-create-post.js',
  'assets/js/features/create-post/kc-create-post.schema.js',
  'assets/js/features/create-post/kc-create-post.fields.js',
  'assets/js/features/create-post/kc-create-post.render.js',
  'assets/js/features/create-post/kc-create-post.media.js',
  'assets/js/features/create-post/kc-create-post.resolvers.js',
  'assets/js/features/create-post/kc-create-post.submit.js',
  // shared/
  'assets/js/shared/account-profile.shared.js',
  'assets/js/shared/help.shared.js',
  'assets/js/shared/home-categories.shared.js',
  'assets/js/shared/kc-comments.shared.js',
  'assets/js/shared/kc-search.shared.js',
  'assets/js/shared/ods.shared.js',
  'assets/js/shared/search-analytics.shared.js',
  // legacy-shims/
  'assets/js/legacy-shims/kc-migrate.myposts.js',
  // components/
  'assets/js/components/carousel.js',
  'assets/js/components/toast.js',
  'assets/js/components/voting.js',
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
checkJsRootEmpty();

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

function checkJsRootEmpty() {
  var jsRoot = path.join(ROOT, 'assets', 'js');
  var jsFiles = fs.readdirSync(jsRoot).filter(function (f) { return f.endsWith('.js'); });
  if (jsFiles.length > 0) {
    errors.push('[Gate V15] assets/js/ raiz contém arquivos .js: ' + jsFiles.join(', '));
  }
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
      ' itens verificados + raiz assets/js/ limpa'
    );
  }
}

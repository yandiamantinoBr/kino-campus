/**
 * structural-validators.test.js — KinoCampus v13.2.0
 *
 * Testes estáticos para os 3 scripts de validação estrutural:
 *   1. validate-repository-structure.js — integridade
 *   2. validate-script-chains.js — integridade + cadeia real
 *   3. validate-public-routes.js — integridade + rotas reais
 */

'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT         = path.resolve(__dirname, '..');
var STRUCT_SCRIPT = fs.readFileSync(path.join(ROOT, 'scripts', 'validate-repository-structure.js'), 'utf8');
var CHAINS_SCRIPT = fs.readFileSync(path.join(ROOT, 'scripts', 'validate-script-chains.js'), 'utf8');
var ROUTES_SCRIPT = fs.readFileSync(path.join(ROOT, 'scripts', 'validate-public-routes.js'), 'utf8');

// ── 1. validate-repository-structure.js ─────────────────────────────────────

describe('validate-repository-structure.js — integridade', function () {

  test('usa strict mode', function () {
    expect(STRUCT_SCRIPT).toContain("'use strict';");
  });

  test('verifica arquivos obrigatórios na raiz', function () {
    expect(STRUCT_SCRIPT).toContain('ROOT_FILES');
    expect(STRUCT_SCRIPT).toContain('package.json');
    expect(STRUCT_SCRIPT).toContain('vercel.json');
    expect(STRUCT_SCRIPT).toContain('VERSION.json');
  });

  test('verifica diretórios obrigatórios', function () {
    expect(STRUCT_SCRIPT).toContain('REQUIRED_DIRS');
    expect(STRUCT_SCRIPT).toContain('assets/js');
    expect(STRUCT_SCRIPT).toContain('tests/e2e');
  });

  test('verifica arquivos JS canônicos', function () {
    expect(STRUCT_SCRIPT).toContain('CANONICAL_JS');
    expect(STRUCT_SCRIPT).toContain('kc-env.js');
    expect(STRUCT_SCRIPT).toContain('kc-feature-flags.js');
    expect(STRUCT_SCRIPT).toContain('kc-telemetry.js');
  });

  test('verifica scripts de manutenção', function () {
    expect(STRUCT_SCRIPT).toContain('validate-version-map.js');
    expect(STRUCT_SCRIPT).toContain('validate-script-chains.js');
    expect(STRUCT_SCRIPT).toContain('validate-public-routes.js');
  });

  test('verifica todos os 22 HTMLs', function () {
    expect(STRUCT_SCRIPT).toContain('PUBLIC_HTMLS');
    expect(STRUCT_SCRIPT).toContain('ADMIN_HTMLS');
    expect(STRUCT_SCRIPT).toContain('index.html');
    expect(STRUCT_SCRIPT).toContain('admin/index.html');
  });

  test('sai com código 0 em sucesso, 1 em falha', function () {
    expect(STRUCT_SCRIPT).toContain('process.exit');
    expect(STRUCT_SCRIPT).toContain('errors.length ? 1 : 0');
  });

});

// ── 2. validate-script-chains.js — integridade ──────────────────────────────

describe('validate-script-chains.js — integridade', function () {

  test('usa strict mode', function () {
    expect(CHAINS_SCRIPT).toContain("'use strict';");
  });

  test('define cadeia de boot pública (5 scripts)', function () {
    expect(CHAINS_SCRIPT).toContain('BOOT_CHAIN_PUBLIC');
    expect(CHAINS_SCRIPT).toContain('assets/js/kc-constants.js');
    expect(CHAINS_SCRIPT).toContain('assets/js/kc-env.js');
    expect(CHAINS_SCRIPT).toContain('assets/js/kc-feature-flags.js');
    expect(CHAINS_SCRIPT).toContain('assets/js/kc-sw-register.js');
    expect(CHAINS_SCRIPT).toContain('assets/js/kc-telemetry.js');
  });

  test('define cadeia de boot admin (prefixo "../")', function () {
    expect(CHAINS_SCRIPT).toContain('BOOT_CHAIN_ADMIN');
    expect(CHAINS_SCRIPT).toContain('../assets/js/kc-constants.js');
    expect(CHAINS_SCRIPT).toContain('../assets/js/kc-telemetry.js');
  });

  test('lista 17 páginas públicas e 5 admin', function () {
    expect(CHAINS_SCRIPT).toContain('PUBLIC_PAGES');
    expect(CHAINS_SCRIPT).toContain('ADMIN_PAGES');
    expect(CHAINS_SCRIPT).toContain('index.html');
    expect(CHAINS_SCRIPT).toContain('admin/index.html');
    expect(CHAINS_SCRIPT).toContain('oportunidades.html');
  });

  test('valida posição (indexOf) e ordem', function () {
    expect(CHAINS_SCRIPT).toContain('indexOf');
    expect(CHAINS_SCRIPT).toContain('pos');
  });

  test('sai com código correto', function () {
    expect(CHAINS_SCRIPT).toContain('process.exit');
    expect(CHAINS_SCRIPT).toContain('errors.length ? 1 : 0');
  });

});

// ── 3. validate-script-chains.js — cadeia real ──────────────────────────────

describe('validate-script-chains.js — cadeia real nos 22 HTMLs', function () {

  var bootChain = [
    'kc-constants.js',
    'kc-env.js',
    'kc-feature-flags.js',
    'kc-sw-register.js',
    'kc-telemetry.js',
  ];

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
    test('pública "' + page + '" — cadeia de boot em ordem', function () {
      var html = fs.readFileSync(path.join(ROOT, page), 'utf8');
      var positions = bootChain.map(function (script) {
        return { script: script, pos: html.indexOf('assets/js/' + script) };
      });
      positions.forEach(function (item) {
        expect(item.pos).toBeGreaterThan(-1);
      });
      for (var i = 1; i < positions.length; i++) {
        expect(positions[i].pos).toBeGreaterThan(positions[i - 1].pos);
      }
    });
  });

  adminPages.forEach(function (page) {
    test('admin "' + page + '" — cadeia de boot em ordem', function () {
      var html = fs.readFileSync(path.join(ROOT, page), 'utf8');
      var positions = bootChain.map(function (script) {
        return { script: script, pos: html.indexOf('../assets/js/' + script) };
      });
      positions.forEach(function (item) {
        expect(item.pos).toBeGreaterThan(-1);
      });
      for (var i = 1; i < positions.length; i++) {
        expect(positions[i].pos).toBeGreaterThan(positions[i - 1].pos);
      }
    });
  });

});

// ── 4. validate-public-routes.js — integridade ──────────────────────────────

describe('validate-public-routes.js — integridade', function () {

  test('usa strict mode', function () {
    expect(ROUTES_SCRIPT).toContain("'use strict';");
  });

  test('define 17 rotas públicas e 5 admin', function () {
    expect(ROUTES_SCRIPT).toContain('PUBLIC_ROUTES');
    expect(ROUTES_SCRIPT).toContain('ADMIN_ROUTES');
    expect(ROUTES_SCRIPT).toContain("route: '/'");
    expect(ROUTES_SCRIPT).toContain("route: '/admin'");
  });

  test('valida existência dos HTMLs', function () {
    expect(ROUTES_SCRIPT).toContain('existsSync');
    expect(ROUTES_SCRIPT).toContain('stat.size');
  });

  test('valida CSS assets estáticos', function () {
    expect(ROUTES_SCRIPT).toContain('STATIC_ASSETS');
    expect(ROUTES_SCRIPT).toContain('styles.css');
    expect(ROUTES_SCRIPT).toContain('kc-public-shell.css');
  });

  test('valida vercel.json', function () {
    expect(ROUTES_SCRIPT).toContain('vercel.json');
    expect(ROUTES_SCRIPT).toContain('rewrites');
  });

  test('sai com código correto', function () {
    expect(ROUTES_SCRIPT).toContain('process.exit');
    expect(ROUTES_SCRIPT).toContain('errors.length ? 1 : 0');
  });

});

// ── 5. validate-public-routes.js — rotas reais ──────────────────────────────

describe('validate-public-routes.js — rotas reais existem', function () {

  var allPages = [
    'index.html', '_product.html', 'account-setup.html', 'achados-perdidos.html',
    'ajuda.html', 'auth-callback.html', 'caronas-feed.html', 'compra-venda-feed.html',
    'create-post.html', 'eventos.html', 'moradia.html', 'my-posts.html',
    'ods.html', 'oportunidades.html', 'profile.html', 'search-results.html', 'settings.html',
    'admin/index.html', 'admin/banners.html', 'admin/help-requests.html',
    'admin/moderation.html', 'admin/reports.html',
  ];

  allPages.forEach(function (page) {
    test('"' + page + '" existe e tem conteúdo', function () {
      var absPath = path.join(ROOT, page);
      expect(fs.existsSync(absPath)).toBe(true);
      var stat = fs.statSync(absPath);
      expect(stat.size).toBeGreaterThan(100);
    });
  });

  test('assets/css/styles.css existe', function () {
    expect(fs.existsSync(path.join(ROOT, 'assets/css/styles.css'))).toBe(true);
  });

  test('assets/css/kc-public-shell.css existe', function () {
    expect(fs.existsSync(path.join(ROOT, 'assets/css/kc-public-shell.css'))).toBe(true);
  });

  test('vercel.json existe e tem rewrites', function () {
    var vercelPath = path.join(ROOT, 'vercel.json');
    expect(fs.existsSync(vercelPath)).toBe(true);
    var vercel = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
    var hasRouting = vercel.rewrites || vercel.routes;
    expect(hasRouting).toBeTruthy();
  });

});

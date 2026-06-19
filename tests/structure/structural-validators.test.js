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
var childProcess = require('child_process');

var ROOT         = path.resolve(__dirname, '../..');
var STRUCT_SCRIPT = fs.readFileSync(path.join(ROOT, 'scripts', 'validate-repository-structure.js'), 'utf8');
var CHAINS_SCRIPT = fs.readFileSync(path.join(ROOT, 'scripts', 'validate-script-chains.js'), 'utf8');
var ROUTES_SCRIPT = fs.readFileSync(path.join(ROOT, 'scripts', 'validate-public-routes.js'), 'utf8');
var PAGE_MANIFEST = require(path.join(ROOT, 'scripts', 'admin-pages.manifest.js'));
var KCAPI_RESIDUAL_AUDIT = path.join(ROOT, 'scripts', 'audit-kcapi-facade-residual.js');

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
    expect(PAGE_MANIFEST.ADMIN_PAGES).toContain('admin/privacy-analytics.html');
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
    expect(CHAINS_SCRIPT).toContain('assets/js/boot/kc-constants.js');
    expect(CHAINS_SCRIPT).toContain('assets/js/boot/kc-env.js');
    expect(CHAINS_SCRIPT).toContain('assets/js/boot/kc-feature-flags.js');
    expect(CHAINS_SCRIPT).toContain('assets/js/boot/kc-sw-register.js');
    expect(CHAINS_SCRIPT).toContain('assets/js/boot/kc-telemetry.js');
  });

  test('define cadeia de boot admin (prefixo "../")', function () {
    expect(CHAINS_SCRIPT).toContain('BOOT_CHAIN_ADMIN');
    expect(CHAINS_SCRIPT).toContain('../assets/js/boot/kc-constants.js');
    expect(CHAINS_SCRIPT).toContain('../assets/js/boot/kc-env.js');
    expect(CHAINS_SCRIPT).toContain('../assets/js/boot/kc-telemetry.js');
  });

  test('lista 17 páginas públicas e 5 admin', function () {
    expect(CHAINS_SCRIPT).toContain('PUBLIC_PAGES');
    expect(CHAINS_SCRIPT).toContain('ADMIN_PAGES');
    expect(CHAINS_SCRIPT).toContain('PAGE_MANIFEST.PUBLIC_PAGES');
    expect(CHAINS_SCRIPT).toContain('PAGE_MANIFEST.ADMIN_PAGES');
    expect(PAGE_MANIFEST.ADMIN_PAGES).toHaveLength(6);
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
    'boot/kc-constants.js',
    'boot/kc-env.js',
    'boot/kc-feature-flags.js',
    'boot/kc-sw-register.js',
    'boot/kc-telemetry.js',
  ];

  var publicPages = PAGE_MANIFEST.PUBLIC_PAGES;
  var adminPages = PAGE_MANIFEST.ADMIN_PAGES;

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
    expect(ROUTES_SCRIPT).toContain('PAGE_MANIFEST.PUBLIC_ROUTES');
    expect(ROUTES_SCRIPT).toContain('PAGE_MANIFEST.ADMIN_ROUTES');
    expect(PAGE_MANIFEST.ADMIN_ROUTES.map(function (route) { return route.file; })).toContain('admin/privacy-analytics.html');
  });

  test('valida existência dos HTMLs', function () {
    expect(ROUTES_SCRIPT).toContain('existsSync');
    expect(ROUTES_SCRIPT).toContain('stat.size');
  });

  test('valida CSS assets estáticos', function () {
    expect(ROUTES_SCRIPT).toContain('STATIC_ASSETS');
    expect(ROUTES_SCRIPT).toContain('styles.css');
    expect(ROUTES_SCRIPT).toContain('kc-chat-shortcut.css');
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

  var allPages = PAGE_MANIFEST.PUBLIC_PAGES.concat(PAGE_MANIFEST.ADMIN_PAGES);

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

  test('assets/css/kc-chat-shortcut.css existe', function () {
    expect(fs.existsSync(path.join(ROOT, 'assets/css/kc-chat-shortcut.css'))).toBe(true);
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

// ── 6. CSS-C.4 — contrato das páginas legais ───────────────────────────────

describe('CSS-C.4 — ownership legal em kc-public-shell.css', function () {

  var legalPages = [
    'sobre.html',
    'editorial.html',
    'transparencia.html',
    'privacidade.html',
    'termos.html',
  ];
  var styles = fs.readFileSync(path.join(ROOT, 'assets/css/styles.css'), 'utf8');
  var publicShell = fs.readFileSync(path.join(ROOT, 'assets/css/kc-public-shell.css'), 'utf8');
  var baselineScript = fs.readFileSync(path.join(ROOT, 'scripts/capture-css-visual-baseline.js'), 'utf8');

  test('todas as páginas legais carregam kc-public-shell.css após styles.css', function () {
    legalPages.forEach(function (page) {
      var html = fs.readFileSync(path.join(ROOT, page), 'utf8');
      var stylesPosition = html.indexOf('assets/css/styles.css');
      var shellPosition = html.indexOf('assets/css/kc-public-shell.css');
      expect(stylesPosition).toBeGreaterThan(-1);
      expect(shellPosition).toBeGreaterThan(stylesPosition);
    });
  });

  test('bloco kc-legal pertence somente ao CSS público dedicado', function () {
    expect(publicShell).toContain('.kc-legal-page {');
    expect(publicShell).toContain('.kc-legal-section--wide {');
    expect(styles).not.toContain('.kc-legal-page {');
    expect(styles).not.toContain('.kc-legal-section--wide {');
  });

  test('baseline visual inclui as cinco rotas legais', function () {
    legalPages.forEach(function (page) {
      expect(baselineScript).toContain("path: '/" + page + "'");
    });
  });

});

// ── 7. CSS-C.5 — contrato dos badges de ranking do perfil ──────────────────

describe('CSS-C.5 — ownership do ranking de perfil em kc-public-shell.css', function () {

  var styles = fs.readFileSync(path.join(ROOT, 'assets/css/styles.css'), 'utf8');
  var publicShell = fs.readFileSync(path.join(ROOT, 'assets/css/kc-public-shell.css'), 'utf8');
  var profileHtml = fs.readFileSync(path.join(ROOT, 'profile.html'), 'utf8');
  var baselineScript = fs.readFileSync(path.join(ROOT, 'scripts/capture-css-visual-baseline.js'), 'utf8');

  test('profile.html carrega kc-public-shell.css após styles.css', function () {
    var stylesPosition = profileHtml.indexOf('assets/css/styles.css');
    var shellPosition = profileHtml.indexOf('assets/css/kc-public-shell.css');
    expect(stylesPosition).toBeGreaterThan(-1);
    expect(shellPosition).toBeGreaterThan(stylesPosition);
  });

  test('kc-profile-rank-badges pertence somente ao CSS público dedicado', function () {
    expect(publicShell).toContain('.kc-profile-rank-badges {');
    expect(publicShell).toContain('.kc-profile-rank-badges .kc-rank-badge {');
    expect(styles).not.toContain('.kc-profile-rank-badges {');
    expect(styles).not.toContain('.kc-profile-rank-badges .kc-rank-badge {');
  });

  test('baseline usa perfil público determinístico e registra métricas do badge', function () {
    expect(baselineScript).toContain("path: '/profile.html?id=USER_01'");
    expect(baselineScript).toContain("fixture: 'ranked-public-profile'");
    expect(baselineScript).toContain('profileRankBadges:');
    expect(baselineScript).toContain('document.fonts.ready');
  });
});

// ── 8. CSS-B.1 — cobertura integral do public shell ────────────────────────

describe('CSS-B.1 — baseline integral das rotas de kc-public-shell.css', function () {

  var publicShellPages = [
    '404.html',
    'account-setup.html',
    'ajuda.html',
    'auth-callback.html',
    'editorial.html',
    'mensagens.html',
    'privacidade.html',
    'profile.html',
    'settings.html',
    'sobre.html',
    'termos.html',
    'transparencia.html',
  ];
  var baselineScript = fs.readFileSync(path.join(ROOT, 'scripts/capture-css-visual-baseline.js'), 'utf8');

  test('as 12 páginas consumidoras carregam kc-public-shell.css após styles.css', function () {
    publicShellPages.forEach(function (page) {
      var html = fs.readFileSync(path.join(ROOT, page), 'utf8');
      var stylesPosition = html.indexOf('assets/css/styles.css');
      var shellPosition = html.indexOf('assets/css/kc-public-shell.css');
      expect(stylesPosition).toBeGreaterThan(-1);
      expect(shellPosition).toBeGreaterThan(stylesPosition);
    });
  });

  test('baseline inclui 404, ajuda, callback e onboarding', function () {
    ['404.html', 'ajuda.html', 'auth-callback.html', 'account-setup.html'].forEach(function (page) {
      expect(baselineScript).toContain("path: '/" + page + "'");
    });
  });

  test('onboarding usa fixture local explícita sem credencial real', function () {
    expect(baselineScript).toContain("fixture: 'authenticated-local-user'");
    expect(baselineScript).toContain("id: 'USER_01'");
    expect(baselineScript).toContain("localStorage.setItem('kc_local_profile'");
    expect(baselineScript).toContain('finalUrl,');
    expect(baselineScript).not.toContain('service_role');
  });
});

// ── 9. JS-I.4 — dossiê do bootstrap-driver-core ────────────────────────────

describe('JS-I.4 — dossiê automatizado do bootstrap-driver-core', function () {

  var report;

  beforeAll(function () {
    report = JSON.parse(childProcess.execFileSync(process.execPath, [KCAPI_RESIDUAL_AUDIT, '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
    }));
  });

  test('mantém decisão No-Go para as 12 funções e 131 linhas', function () {
    expect(report.bootstrapCore.decision).toBe('no-go-runtime-extraction');
    expect(report.bootstrapCore.functionCount).toBe(12);
    expect(report.bootstrapCore.totalLines).toBe(131);
    expect(report.bootstrapCore.unmappedFunctions).toEqual([]);
    expect(report.candidates[0].totalLines).toBe(131);
  });

  test('separa o core em cinco domínios com decisão keep-in-facade', function () {
    var domains = report.bootstrapCore.domains;
    expect(domains.map(function (entry) { return entry.domain; })).toEqual([
      'environment-policy',
      'transport-config',
      'error-contract',
      'static-database-fallback',
      'adapter-registry',
    ]);
    domains.forEach(function (entry) {
      expect(entry.decision).toBe('keep-in-facade');
      expect(entry.functionCount).toBeGreaterThan(0);
    });
  });

  test('preserva o mapa exato das funções por domínio', function () {
    var names = report.bootstrapCore.domains.reduce(function (acc, entry) {
      acc[entry.domain] = entry.functions.map(function (fn) { return fn.name; });
      return acc;
    }, {});
    expect(names['environment-policy']).toEqual(['readEnv', 'bootstrapConfig', 'enforceSupabaseOnProduction']);
    expect(names['transport-config']).toEqual(['setConfig', 'withTimeout', 'fetchJSON', 'apiURL']);
    expect(names['error-contract']).toEqual(['kcApiError']);
    expect(names['static-database-fallback']).toEqual(['getDatabaseRaw', 'getDatabaseNormalized']);
    expect(names['adapter-registry']).toEqual(['registerAdapter', 'getActiveDriver']);
  });

  test('expõe sinais de risco críticos sem interpretar runtime', function () {
    var functions = report.bootstrapCore.domains.flatMap(function (entry) { return entry.functions; });
    var byName = functions.reduce(function (acc, fn) { acc[fn.name] = fn; return acc; }, {});
    expect(byName.readEnv.riskSignals).toContain('readsEnvironment');
    expect(byName.setConfig.riskSignals).toContain('mutatesMutableConfig');
    expect(byName.withTimeout.riskSignals).toContain('usesTimers');
    expect(byName.fetchJSON.riskSignals).toContain('usesNetwork');
    expect(byName.getDatabaseNormalized.riskSignals).toContain('normalizesDomainData');
    expect(byName.registerAdapter.riskSignals).toContain('mutatesAdapterRegistry');
    expect(byName.getActiveDriver.riskSignals).toContain('selectsDriver');
  });

  test('lista 15 gates antes de reavaliar transport-config', function () {
    expect(report.bootstrapCore.requiredGateCount).toBe(15);
    expect(report.bootstrapCore.requiredGates).toContain('production-fail-closed-policy');
    expect(report.bootstrapCore.requiredGates).toContain('local-supabase-environment-parity');
    expect(report.bootstrapCore.requiredGates).toContain('adapter-registration-order');
    expect(report.bootstrapCore.recommendation.nextAction).toBe('add-dedicated-parity-tests-before-any-extraction');
    expect(report.bootstrapCore.recommendation.firstDomainToReassess).toBe('transport-config');
  });
});

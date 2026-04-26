/**
 * check-scripts.test.js — KinoCampus v13.2.1
 *
 * Valida que package.json contém os scripts check:* obrigatórios
 * e que todos os executáveis referenciados existem.
 */

'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT    = path.resolve(__dirname, '../..');
var PKG     = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
var scripts = PKG.scripts || {};

// ── 1. package.json — scripts check:* ────────────────────────────────────────

describe('package.json — scripts check:* obrigatórios', function () {

  test('check:hygiene definido', function () {
    expect(scripts['check:hygiene']).toBeDefined();
    expect(scripts['check:hygiene']).toContain('hygiene-check.js');
  });

  test('check:structure definido', function () {
    expect(scripts['check:structure']).toBeDefined();
    expect(scripts['check:structure']).toContain('validate-repository-structure.js');
  });

  test('check:scripts definido', function () {
    expect(scripts['check:scripts']).toBeDefined();
    expect(scripts['check:scripts']).toContain('validate-script-chains.js');
  });

  test('check:routes definido', function () {
    expect(scripts['check:routes']).toBeDefined();
    expect(scripts['check:routes']).toContain('validate-public-routes.js');
  });

  test('check:version definido', function () {
    expect(scripts['check:version']).toBeDefined();
    expect(scripts['check:version']).toContain('validate-version-map.js');
  });

  test('check:all definido e inclui todos os checks', function () {
    expect(scripts['check:all']).toBeDefined();
    expect(scripts['check:all']).toContain('check:version');
    expect(scripts['check:all']).toContain('check:structure');
    expect(scripts['check:all']).toContain('check:scripts');
    expect(scripts['check:all']).toContain('check:routes');
    expect(scripts['check:all']).toContain('check:hygiene');
    expect(scripts['check:all']).toContain('npm test');
  });

  test('scripts originais preservados (test, test:e2e, lhci)', function () {
    expect(scripts['test']).toBeDefined();
    expect(scripts['test:e2e']).toBeDefined();
    expect(scripts['lhci']).toBeDefined();
  });

});

// ── 2. Executáveis referenciados existem ─────────────────────────────────────

describe('check:* — executáveis existem no filesystem', function () {

  var validators = [
    'scripts/hygiene-check.js',
    'scripts/validate-repository-structure.js',
    'scripts/validate-script-chains.js',
    'scripts/validate-public-routes.js',
    'scripts/validate-version-map.js',
  ];

  validators.forEach(function (relPath) {
    test('"' + relPath + '" existe', function () {
      expect(fs.existsSync(path.join(ROOT, relPath))).toBe(true);
    });
  });

});

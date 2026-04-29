/**
 * version-map.test.js — KinoCampus v13.1.0
 *
 * Testes estáticos para:
 *   1. VERSION.json — existência, campos obrigatórios e consistência
 *   2. validate-version-map.js — integridade do script
 */

'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT    = path.resolve(__dirname, '../..');
var VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'VERSION.json'), 'utf8'));
var SCRIPT  = fs.readFileSync(path.join(ROOT, 'scripts', 'validate-version-map.js'), 'utf8');

// ── 1. VERSION.json — integridade ───────────────────────────────────────────

describe('VERSION.json — integridade', function () {

  test('existe na raiz do projeto', function () {
    expect(fs.existsSync(path.join(ROOT, 'VERSION.json'))).toBe(true);
  });

  test('é JSON válido e parseável', function () {
    var raw = fs.readFileSync(path.join(ROOT, 'VERSION.json'), 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  test('campo "project" é string não-vazia', function () {
    expect(typeof VERSION.project).toBe('string');
    expect(VERSION.project.trim().length).toBeGreaterThan(0);
  });

  test('campo "appVersion" tem formato X.Y.Z', function () {
    expect(VERSION.appVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('campo "frontendRuntimeVersion" tem formato X.Y.Z', function () {
    expect(VERSION.frontendRuntimeVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('campo "frontendRuntimeVersion" é "8.6.0" (versão canônica)', function () {
    expect(VERSION.frontendRuntimeVersion).toBe('8.6.0');
  });

  test('campo "branch" é "kinocampus-V34.0-foundations"', function () {
    expect(VERSION.branch).toBe('kinocampus-V34.0-foundations');
  });

  test('campo "status" é string não-vazia', function () {
    expect(typeof VERSION.status).toBe('string');
    expect(VERSION.status.trim().length).toBeGreaterThan(0);
  });

  test('campo "updatedAt" tem formato YYYY-MM-DD', function () {
    expect(VERSION.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('todos os 6 campos obrigatórios presentes', function () {
    var required = ['project', 'appVersion', 'frontendRuntimeVersion', 'branch', 'status', 'updatedAt'];
    required.forEach(function (field) {
      expect(VERSION).toHaveProperty(field);
    });
  });

  test('frontendRuntimeVersion bate com kc-env.js VERSION', function () {
    var kcEnv = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'boot', 'kc-env.js'), 'utf8');
    var expected = "const VERSION = '" + VERSION.frontendRuntimeVersion + "';";
    expect(kcEnv).toContain(expected);
  });

});

// ── 2. validate-version-map.js — integridade ────────────────────────────────

describe('validate-version-map.js — integridade do script', function () {

  test('usa strict mode', function () {
    expect(SCRIPT).toContain("'use strict';");
  });

  test('valida existência de VERSION.json', function () {
    expect(SCRIPT).toContain('VERSION.json');
    expect(SCRIPT).toContain('existsSync');
  });

  test('valida todos os 6 campos obrigatórios', function () {
    var required = ['project', 'appVersion', 'frontendRuntimeVersion', 'branch', 'status', 'updatedAt'];
    required.forEach(function (field) {
      expect(SCRIPT).toContain("'" + field + "'");
    });
  });

  test('valida formato semântico de appVersion', function () {
    expect(SCRIPT).toContain('X.Y.Z');
  });

  test('valida formato de updatedAt (YYYY-MM-DD)', function () {
    expect(SCRIPT).toContain('YYYY-MM-DD');
  });

  test('valida consistência com frontendRuntimeVersion canônica', function () {
    expect(SCRIPT).toContain('CANONICAL_RUNTIME_VERSION');
    expect(SCRIPT).toContain('8.6.0');
  });

  test('valida consistência com kc-env.js', function () {
    expect(SCRIPT).toContain('kc-env.js');
    expect(SCRIPT).toContain('frontendRuntimeVersion');
  });

  test('valida branch permanente', function () {
    expect(SCRIPT).toContain('CANONICAL_BRANCH');
    expect(SCRIPT).toContain('kinocampus-V34.0-foundations');
  });

  test('sai com código 0 em sucesso, 1 em falha', function () {
    expect(SCRIPT).toContain('process.exit');
    expect(SCRIPT).toContain('errors.length ? 1 : 0');
  });

  test('imprime mensagem OK quando não há erros', function () {
    expect(SCRIPT).toContain('[validate-version-map] OK');
  });

  test('imprime mensagem FALHOU quando há erros', function () {
    expect(SCRIPT).toContain('[validate-version-map] FALHOU');
  });

});

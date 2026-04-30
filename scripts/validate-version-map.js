#!/usr/bin/env node
/**
 * validate-version-map.js — KinoCampus v13.1.0
 *
 * Valida que VERSION.json existe, tem todos os campos obrigatórios e que
 * frontendRuntimeVersion bate com a versão canônica declarada em kc-env.js.
 *
 * Uso:
 *   node scripts/validate-version-map.js
 *
 * Sai com código 0 se tudo OK, 1 se houver erros.
 */

'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');

var REQUIRED_FIELDS = [
  'project',
  'appVersion',
  'frontendRuntimeVersion',
  'branch',
  'status',
  'updatedAt',
];

var CANONICAL_RUNTIME_VERSION = '8.6.0';
var CANONICAL_BRANCH          = 'kinocampus-V64.0-foundations';

var errors = [];

// ── 1. VERSION.json existe ────────────────────────────────────────────────────

var versionJsonPath = path.join(ROOT, 'VERSION.json');

if (!fs.existsSync(versionJsonPath)) {
  errors.push('VERSION.json não encontrado na raiz do projeto');
  report();
  process.exit(errors.length ? 1 : 0);
}

// ── 2. JSON válido ────────────────────────────────────────────────────────────

var versionData;
try {
  versionData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
} catch (e) {
  errors.push('VERSION.json não é JSON válido: ' + e.message);
  report();
  process.exit(1);
}

// ── 3. Campos obrigatórios presentes e não-vazios ────────────────────────────

REQUIRED_FIELDS.forEach(function (field) {
  if (typeof versionData[field] === 'undefined') {
    errors.push('VERSION.json: campo obrigatório ausente: ' + field);
  } else if (typeof versionData[field] !== 'string' || versionData[field].trim() === '') {
    errors.push('VERSION.json: campo "' + field + '" deve ser string não-vazia');
  }
});

// ── 4. frontendRuntimeVersion bate com versão canônica ───────────────────────

if (
  typeof versionData.frontendRuntimeVersion === 'string' &&
  versionData.frontendRuntimeVersion !== CANONICAL_RUNTIME_VERSION
) {
  errors.push(
    'VERSION.json: frontendRuntimeVersion "' + versionData.frontendRuntimeVersion +
    '" não bate com a versão canônica "' + CANONICAL_RUNTIME_VERSION + '"'
  );
}

// ── 5. branch bate com a branch permanente ───────────────────────────────────

if (
  typeof versionData.branch === 'string' &&
  versionData.branch !== CANONICAL_BRANCH
) {
  errors.push(
    'VERSION.json: branch "' + versionData.branch +
    '" não bate com a branch permanente "' + CANONICAL_BRANCH + '"'
  );
}

// ── 6. appVersion tem formato semântico (X.Y.Z) ──────────────────────────────

if (
  typeof versionData.appVersion === 'string' &&
  !/^\d+\.\d+\.\d+$/.test(versionData.appVersion)
) {
  errors.push(
    'VERSION.json: appVersion "' + versionData.appVersion + '" deve ter formato X.Y.Z'
  );
}

// ── 7. updatedAt tem formato ISO date (YYYY-MM-DD) ───────────────────────────

if (
  typeof versionData.updatedAt === 'string' &&
  !/^\d{4}-\d{2}-\d{2}$/.test(versionData.updatedAt)
) {
  errors.push(
    'VERSION.json: updatedAt "' + versionData.updatedAt + '" deve ter formato YYYY-MM-DD'
  );
}

// ── 8. kc-env.js tem a mesma versão canônica ─────────────────────────────────

var kcEnvPath = path.join(ROOT, 'assets', 'js', 'boot', 'kc-env.js');
if (fs.existsSync(kcEnvPath)) {
  var kcEnvContent = fs.readFileSync(kcEnvPath, 'utf8');
  var expected = "const VERSION = '" + CANONICAL_RUNTIME_VERSION + "';";
  if (!kcEnvContent.includes(expected)) {
    errors.push(
      'kc-env.js não declara VERSION = \'' + CANONICAL_RUNTIME_VERSION +
      '\' — inconsistente com VERSION.json.frontendRuntimeVersion'
    );
  }
} else {
  errors.push('assets/js/boot/kc-env.js não encontrado — impossível validar consistência de versão');
}

// ─────────────────────────────────────────────────────────────────────────────

report();
process.exit(errors.length ? 1 : 0);

function report() {
  if (errors.length) {
    console.error('[validate-version-map] FALHOU — ' + errors.length + ' erro(s):');
    errors.forEach(function (e) { console.error('  - ' + e); });
  } else {
    console.log(
      '[validate-version-map] OK — VERSION.json válido ' +
      '(appVersion=' + (versionData && versionData.appVersion) + ', ' +
      'frontendRuntimeVersion=' + (versionData && versionData.frontendRuntimeVersion) + ')'
    );
  }
}

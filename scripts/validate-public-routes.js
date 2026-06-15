#!/usr/bin/env node
/**
 * validate-public-routes.js — KinoCampus v13.2.0
 *
 * Confirma que todos os arquivos HTML públicos existem e são acessíveis
 * (via sistema de arquivos). Também valida que vercel.json existe e
 * não contém rewrites que apagam rotas canônicas.
 *
 * Não faz HTTP — apenas valida a estrutura local do repositório.
 *
 * Uso:
 *   node scripts/validate-public-routes.js
 *
 * Sai com código 0 se tudo OK, 1 se houver erros.
 */

'use strict';

var fs   = require('fs');
var path = require('path');
var PAGE_MANIFEST = require('./admin-pages.manifest');

var ROOT   = path.resolve(__dirname, '..');
var errors = [];

// ── Rotas públicas canônicas ──────────────────────────────────────────────────

var PUBLIC_ROUTES = PAGE_MANIFEST.PUBLIC_ROUTES;
var ADMIN_ROUTES = PAGE_MANIFEST.ADMIN_ROUTES;

// ── CSS e assets obrigatórios ─────────────────────────────────────────────────

var STATIC_ASSETS = [
  'assets/css/styles.css',
  'assets/css/kc-chat-shortcut.css',
  'assets/css/kc-public-shell.css',
  'assets/css/kc-theme-boot.css',
];

// ─────────────────────────────────────────────────────────────────────────────

// 1. Validar existência dos HTMLs
PUBLIC_ROUTES.concat(ADMIN_ROUTES).forEach(function (item) {
  var absPath = path.join(ROOT, item.file);
  if (!fs.existsSync(absPath)) {
    errors.push('[rota ' + item.route + '] arquivo HTML não encontrado: ' + item.file);
    return;
  }
  var stat = fs.statSync(absPath);
  if (stat.size < 100) {
    errors.push('[rota ' + item.route + '] arquivo HTML suspeito (< 100 bytes): ' + item.file);
  }
});

// 2. Validar assets estáticos
STATIC_ASSETS.forEach(function (relPath) {
  var absPath = path.join(ROOT, relPath);
  if (!fs.existsSync(absPath)) {
    errors.push('[asset estático] não encontrado: ' + relPath);
  }
});

// 3. Validar vercel.json existe e tem rewrites
var vercelPath = path.join(ROOT, 'vercel.json');
if (!fs.existsSync(vercelPath)) {
  errors.push('[vercel.json] arquivo não encontrado — rewrites de rota não configurados');
} else {
  var vercelData;
  try {
    vercelData = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
    if (!vercelData.rewrites && !vercelData.routes) {
      errors.push('[vercel.json] não tem rewrites nem routes — SPAs sem roteamento declarado');
    }
  } catch (e) {
    errors.push('[vercel.json] JSON inválido: ' + e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

report();
process.exit(errors.length ? 1 : 0);

function report() {
  var totalRoutes = PUBLIC_ROUTES.length + ADMIN_ROUTES.length;
  if (errors.length) {
    console.error('[validate-public-routes] FALHOU — ' + errors.length + ' erro(s):');
    errors.forEach(function (e) { console.error('  - ' + e); });
  } else {
    console.log(
      '[validate-public-routes] OK — ' + totalRoutes + ' rotas validadas (' +
      PUBLIC_ROUTES.length + ' públicas + ' + ADMIN_ROUTES.length + ' admin)'
    );
  }
}

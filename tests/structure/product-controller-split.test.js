/**
 * tests/product-controller-split.test.js — v13.4.1
 *
 * Valida o split de product.controller.js em sub-módulos:
 *   - window._KCProduct.render (product.render.js)
 *   - window._KCProduct.load  (product.load.js)
 *
 * Testes:
 *   1. Contrato estático de product.render.js (funções exportadas)
 *   2. Contrato estático de product.load.js  (funções exportadas)
 *   3. Ordem de scripts em _product.html (load após render, render após controller)
 *   4. Gate de tamanho: product.controller.js < 800L
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '../..');
const RENDER  = path.join(ROOT, 'assets/js/controllers/product.render.js');
const LOAD    = path.join(ROOT, 'assets/js/controllers/product.load.js');
const CTRL    = path.join(ROOT, 'assets/js/controllers/product.controller.js');
const HTML    = path.join(ROOT, '_product.html');

// ── Helpers ───────────────────────────────────────────────────────────────────

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function lineCount(filePath) {
  return readFile(filePath).split('\n').length;
}

// ── 1. product.render.js — contrato estático ─────────────────────────────────

describe('product.render.js — contrato estático', () => {
  let code;
  beforeAll(() => { code = readFile(RENDER); });

  test('arquivo existe', () => {
    expect(fs.existsSync(RENDER)).toBe(true);
  });

  test('expõe window._KCProduct.render via Object.freeze', () => {
    expect(code).toContain('window._KCProduct.render = Object.freeze(');
  });

  const RENDER_EXPORTS = [
    'esc', 'setText', 'setHTML', 'show', 'hide', 'moduleLabel', 'formatCurrency',
    'getPostAuthorId', 'showNotFound', 'setBreadcrumb', 'setBadges',
    'isLegacyExamplePost', 'isLegacyExampleProfile',
    'buildLegacyExampleBadgeHtml', 'syncLegacyExampleMarker',
    'setGallery', 'setPrice', 'setDescription', 'addSpec', 'addSpecHtml', 'setSpecs',
    'buildTagEntries', 'buildTagsSpecHtml', 'setOpenGraphTags', 'setLegacyBanner',
  ];

  RENDER_EXPORTS.forEach(fn => {
    test('exporta ' + fn, () => {
      expect(code).toContain(fn + ':');
    });
  });

  test('usa IIFE com "use strict"', () => {
    expect(code).toMatch(/['"]use strict['"]/u);
    expect(code).toMatch(/\(function\s*\(\)\s*\{/);
  });
});

// ── 2. product.load.js — contrato estático ────────────────────────────────────

describe('product.load.js — contrato estático', () => {
  let code;
  beforeAll(() => { code = readFile(LOAD); });

  test('arquivo existe', () => {
    expect(fs.existsSync(LOAD)).toBe(true);
  });

  test('expõe window._KCProduct.load via Object.freeze', () => {
    expect(code).toContain('window._KCProduct.load = Object.freeze(');
  });

  const LOAD_EXPORTS = [
    'init', 'isAuthor', 'getPostIdForMutation', 'trackHomeCategoryInteraction',
    'resolveCurrentUserDisplayName', 'resolveCurrentUserAvatar',
    'resolveCurrentUserLogin', 'applyCommentComposerSessionState',
    'loadSellerAuthorStats', 'enrichPostAuthorFromProfile',
    'refreshViewerState', 'renderPost', 'loadPost',
  ];

  LOAD_EXPORTS.forEach(fn => {
    test('exporta ' + fn, () => {
      expect(code).toContain(fn + ':');
    });
  });

  test('usa padrão deps injection (init + _deps)', () => {
    expect(code).toContain('function init(deps)');
    expect(code).toContain('_deps = deps');
  });

  test('usa IIFE com "use strict"', () => {
    expect(code).toMatch(/['"]use strict['"]/u);
    expect(code).toMatch(/\(function\s*\(\)\s*\{/);
  });
});

// ── 3. _product.html — ordem de carregamento ─────────────────────────────────

describe('_product.html — ordem de carregamento', () => {
  let html;
  beforeAll(() => { html = readFile(HTML); });

  test('carrega product.controller.js', () => {
    expect(html).toContain('product.controller.js');
  });

  test('carrega product.render.js', () => {
    expect(html).toContain('product.render.js');
  });

  test('carrega product.load.js', () => {
    expect(html).toContain('product.load.js');
  });

  test('product.render.js aparece após product.controller.js', () => {
    const idxCtrl   = html.indexOf('product.controller.js');
    const idxRender = html.indexOf('product.render.js');
    expect(idxRender).toBeGreaterThan(idxCtrl);
  });

  test('product.load.js aparece após product.render.js', () => {
    const idxRender = html.indexOf('product.render.js');
    const idxLoad   = html.indexOf('product.load.js');
    expect(idxLoad).toBeGreaterThan(idxRender);
  });

  test('product.report.js aparece após product.load.js', () => {
    const idxLoad   = html.indexOf('product.load.js');
    const idxReport = html.indexOf('product.report.js');
    expect(idxReport).toBeGreaterThan(idxLoad);
  });
});

// ── 4. Gate de tamanho ────────────────────────────────────────────────────────

describe('Gate de tamanho — product.controller.js < 800L', () => {
  test('product.controller.js existe', () => {
    expect(fs.existsSync(CTRL)).toBe(true);
  });

  test('product.controller.js tem menos de 800 linhas', () => {
    const lines = lineCount(CTRL);
    expect(lines).toBeLessThan(800);
  });

  test('product.render.js existe', () => {
    expect(fs.existsSync(RENDER)).toBe(true);
  });

  test('product.load.js existe', () => {
    expect(fs.existsSync(LOAD)).toBe(true);
  });
});

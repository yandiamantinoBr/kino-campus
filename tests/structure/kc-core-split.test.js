/**
 * tests/kc-core-split.test.js — v13.6.1
 *
 * Valida o split de kc-core.js em sub-módulos:
 *   - kc-post-model.js  → window.KCPostModel
 *   - kc-user-posts.js  → window.kcUserPosts
 *   - kc-core-widgets.js → window.KCCore.initWhatsAppShare + window.KCCore.bindModuleSortTabs
 *
 * Testes:
 *   1. Contrato estático de kc-post-model.js
 *   2. Contrato estático de kc-user-posts.js
 *   3. Contrato estático de kc-core-widgets.js
 *   4. kc-core.js residual NÃO define os grupos extraídos inline
 *   5. Ordem de scripts nos HTMLs consumidores
 *   6. Gate de tamanho: kc-core.js < 700L
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = path.resolve(__dirname, '../..');
const CORE       = path.join(ROOT, 'assets/js/kc-core.js');
const POST_MODEL = path.join(ROOT, 'assets/js/kc-post-model.js');
const USER_POSTS = path.join(ROOT, 'assets/js/kc-user-posts.js');
const WIDGETS    = path.join(ROOT, 'assets/js/kc-core-widgets.js');

const HTML_FILES = [
  path.join(ROOT, 'index.html'),
  path.join(ROOT, '_product.html'),
  path.join(ROOT, 'oportunidades.html'),
  path.join(ROOT, 'search-results.html'),
  path.join(ROOT, 'eventos.html'),
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function lineCount(filePath) {
  return readFile(filePath).split('\n').length;
}

// ── 1. kc-post-model.js — contrato estático ───────────────────────────────────

describe('kc-post-model.js — contrato estático', () => {
  let code;
  beforeAll(() => { code = readFile(POST_MODEL); });

  test('arquivo existe', () => {
    expect(fs.existsSync(POST_MODEL)).toBe(true);
  });

  test('expõe window.KCPostModel', () => {
    expect(code).toContain('window.KCPostModel');
  });

  test('expõe função from()', () => {
    expect(code).toContain('from:');
  });

  test('NÃO usa IIFE (é um objeto global direto)', () => {
    // kc-post-model.js is a plain global, not wrapped in IIFE
    expect(code).not.toMatch(/^\s*\(function\s*\(\)\s*\{/m);
  });

  test('referencia KCAPI.normalizePost', () => {
    expect(code).toContain('KCAPI');
  });
});

// ── 2. kc-user-posts.js — contrato estático ───────────────────────────────────

describe('kc-user-posts.js — contrato estático', () => {
  let code;
  beforeAll(() => { code = readFile(USER_POSTS); });

  test('arquivo existe', () => {
    expect(fs.existsSync(USER_POSTS)).toBe(true);
  });

  test('expõe window.kcUserPosts', () => {
    expect(code).toContain('window.kcUserPosts');
  });

  const USER_POSTS_EXPORTS = ['create', 'getById', 'list', 'inject'];

  USER_POSTS_EXPORTS.forEach(fn => {
    test('exporta ' + fn, () => {
      expect(code).toContain(fn + ':');
    });
  });

  test('usa IIFE com "use strict"', () => {
    expect(code).toMatch(/['"]use strict['"]/u);
    expect(code).toMatch(/\(function\s*\(\)\s*\{/);
  });

  test('contém kcCreateUserPost', () => {
    expect(code).toContain('function kcCreateUserPost');
  });

  test('contém kcLoadUserPosts', () => {
    expect(code).toContain('function kcLoadUserPosts');
  });

  test('contém kcInjectUserPostsIntoFeed', () => {
    expect(code).toContain('function kcInjectUserPostsIntoFeed');
  });
});

// ── 3. kc-core-widgets.js — contrato estático ─────────────────────────────────

describe('kc-core-widgets.js — contrato estático', () => {
  let code;
  beforeAll(() => { code = readFile(WIDGETS); });

  test('arquivo existe', () => {
    expect(fs.existsSync(WIDGETS)).toBe(true);
  });

  test('expõe window.KCCore.initWhatsAppShare', () => {
    expect(code).toContain('window.KCCore.initWhatsAppShare');
  });

  test('expõe window.KCCore.bindModuleSortTabs', () => {
    expect(code).toContain('window.KCCore.bindModuleSortTabs');
  });

  test('contém kcInitWhatsAppShare', () => {
    expect(code).toContain('function kcInitWhatsAppShare');
  });

  test('contém kcCreateWhatsAppShareButton', () => {
    expect(code).toContain('function kcCreateWhatsAppShareButton');
  });

  test('contém bindModuleSortTabs', () => {
    expect(code).toContain('function bindModuleSortTabs');
  });

  test('guarda window.KCCore com OR guard', () => {
    expect(code).toContain('window.KCCore = window.KCCore || {}');
  });
});

// ── 4. kc-core.js residual — grupos extraídos removidos ───────────────────────

describe('kc-core.js residual — grupos extraídos não existem inline', () => {
  let code;
  beforeAll(() => { code = readFile(CORE); });

  test('NÃO define window.KCPostModel inline', () => {
    expect(code).not.toContain('window.KCPostModel = {');
  });

  test('NÃO define kcCreateUserPost inline', () => {
    expect(code).not.toContain('function kcCreateUserPost(');
  });

  test('NÃO define window.kcUserPosts inline com shape antigo', () => {
    expect(code).not.toContain('window.kcUserPosts = {');
  });

  test('NÃO define kcInitWhatsAppShare inline', () => {
    expect(code).not.toContain('function kcInitWhatsAppShare(');
  });

  test('NÃO define kcCreateWhatsAppShareButton inline', () => {
    expect(code).not.toContain('function kcCreateWhatsAppShareButton(');
  });

  test('delega kcInitWhatsAppShare via KCCore', () => {
    expect(code).toContain('window.KCCore.initWhatsAppShare');
  });

  test('delega kcInjectUserPostsIntoFeed via kcUserPosts.inject', () => {
    expect(code).toContain('window.kcUserPosts.inject');
  });

  test('mantém initMobileNavActive', () => {
    expect(code).toContain('function initMobileNavActive(');
  });

  test('mantém kcDebounce', () => {
    expect(code).toContain('function kcDebounce(');
  });

  test('mantém kcInitHeroSwipe', () => {
    expect(code).toContain('function kcInitHeroSwipe(');
  });
});

// ── 5. HTMLs consumidores — ordem de carregamento ─────────────────────────────

describe('HTMLs consumidores — scripts carregados na ordem correta', () => {
  HTML_FILES.forEach(htmlPath => {
    const rel = path.relative(ROOT, htmlPath);

    describe(rel, () => {
      let html;
      beforeAll(() => { html = readFile(htmlPath); });

      test('carrega kc-post-model.js', () => {
        expect(html).toContain('kc-post-model.js');
      });

      test('carrega kc-user-posts.js', () => {
        expect(html).toContain('kc-user-posts.js');
      });

      test('carrega kc-core-widgets.js', () => {
        expect(html).toContain('kc-core-widgets.js');
      });

      test('carrega kc-core.js', () => {
        expect(html).toContain('kc-core.js');
      });

      test('kc-post-model.js aparece antes de kc-core.js', () => {
        const idxPM   = html.indexOf('kc-post-model.js');
        const idxCore = html.indexOf('kc-core.js');
        expect(idxPM).toBeLessThan(idxCore);
      });

      test('kc-user-posts.js aparece antes de kc-core.js', () => {
        const idxUP   = html.indexOf('kc-user-posts.js');
        const idxCore = html.indexOf('kc-core.js');
        expect(idxUP).toBeLessThan(idxCore);
      });

      test('kc-core-widgets.js aparece antes de kc-core.js', () => {
        const idxW    = html.indexOf('kc-core-widgets.js');
        const idxCore = html.indexOf('kc-core.js');
        expect(idxW).toBeLessThan(idxCore);
      });
    });
  });
});

// ── 6. Gate de tamanho ────────────────────────────────────────────────────────

describe('Gate de tamanho — kc-core.js < 700L', () => {
  test('kc-core.js existe', () => {
    expect(fs.existsSync(CORE)).toBe(true);
  });

  test('kc-post-model.js existe', () => {
    expect(fs.existsSync(POST_MODEL)).toBe(true);
  });

  test('kc-user-posts.js existe', () => {
    expect(fs.existsSync(USER_POSTS)).toBe(true);
  });

  test('kc-core-widgets.js existe', () => {
    expect(fs.existsSync(WIDGETS)).toBe(true);
  });

  test('kc-core.js tem menos de 700 linhas', () => {
    const lines = lineCount(CORE);
    expect(lines).toBeLessThan(700);
  });

  test('kc-post-model.js tem mais de 50 linhas', () => {
    const lines = lineCount(POST_MODEL);
    expect(lines).toBeGreaterThan(50);
  });

  test('kc-user-posts.js tem mais de 100 linhas', () => {
    const lines = lineCount(USER_POSTS);
    expect(lines).toBeGreaterThan(100);
  });

  test('kc-core-widgets.js tem mais de 100 linhas', () => {
    const lines = lineCount(WIDGETS);
    expect(lines).toBeGreaterThan(100);
  });
});

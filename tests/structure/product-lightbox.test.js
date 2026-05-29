/**
 * tests/structure/product-lightbox.test.js — v8.6.1
 *
 * Valida o visualizador de imagem em tela cheia (lightbox) da página de produto:
 *   - window._KCProduct.lightbox (product.lightbox.js) — contrato estático
 *   - product-lightbox.css existe e contém as classes-âncora do overlay
 *   - _product.html referencia o CSS e o JS do lightbox (com cache-buster)
 *   - ordem de scripts: product.lightbox.js após a cadeia de controllers de produto
 *
 * Convenção do recurso: self-contained, sem acoplar a product.render.js. Lê a
 * galeria (#mainImage + #thumbnails) direto do DOM no momento do clique.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const JS   = path.join(ROOT, 'assets/js/controllers/public/product.lightbox.js');
const CSS  = path.join(ROOT, 'assets/css/product-lightbox.css');
const HTML = path.join(ROOT, '_product.html');

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

// ── 1. product.lightbox.js — contrato estático ───────────────────────────────

describe('product.lightbox.js — contrato estático', () => {
  let code;
  beforeAll(() => { code = readFile(JS); });

  test('arquivo existe', () => {
    expect(fs.existsSync(JS)).toBe(true);
  });

  test('usa IIFE com "use strict"', () => {
    expect(code).toMatch(/['"]use strict['"]/u);
    expect(code).toMatch(/\(function\s*\(\)\s*\{/);
  });

  test('registra namespace window._KCProduct.lightbox', () => {
    expect(code).toContain('window._KCProduct = window._KCProduct || {}');
    expect(code).toContain('window._KCProduct.lightbox');
  });

  const PUBLIC_API = ['open', 'close', 'isOpen'];
  PUBLIC_API.forEach(fn => {
    test('expõe API pública: ' + fn, () => {
      expect(code).toContain(fn + ':');
    });
  });

  test('lê a galeria existente (#thumbnails / data-full-src / #mainImage)', () => {
    expect(code).toContain('#thumbnails .kc-thumbnail');
    expect(code).toContain('data-full-src');
    expect(code).toContain('mainImage');
  });

  test('auto-inicializa via DOMContentLoaded (sem depender de wiring externo)', () => {
    expect(code).toContain("addEventListener('DOMContentLoaded', init)");
  });

  test('faz lock de scroll do body (iOS-safe)', () => {
    expect(code).toContain('kc-lightbox-lock');
  });

  test('suporta gestos via Pointer Events (pinch/pan/swipe)', () => {
    expect(code).toContain('pointerdown');
    expect(code).toContain('pointermove');
    expect(code).toContain('pointerup');
  });
});

// ── 2. product-lightbox.css — classes-âncora ─────────────────────────────────

describe('product-lightbox.css — classes-âncora do overlay', () => {
  let css;
  beforeAll(() => { css = readFile(CSS); });

  test('arquivo existe', () => {
    expect(fs.existsSync(CSS)).toBe(true);
  });

  const ANCHORS = [
    '.kc-lightbox',
    '.kc-lightbox__stage',
    '.kc-lightbox__img',
    '.kc-lightbox__nav',
    '.kc-zoom-hint',
    'body.kc-lightbox-lock',
  ];
  ANCHORS.forEach(sel => {
    test('define seletor: ' + sel, () => {
      expect(css).toContain(sel);
    });
  });
});

// ── 3. _product.html — referências e ordem ───────────────────────────────────

describe('_product.html — integração do lightbox', () => {
  let html;
  beforeAll(() => { html = readFile(HTML); });

  test('referencia product-lightbox.css', () => {
    expect(html).toContain('assets/css/product-lightbox.css');
  });

  test('referencia product.lightbox.js', () => {
    expect(html).toContain('assets/js/controllers/public/product.lightbox.js');
  });

  test('CSS e JS do lightbox usam cache-buster (?v=)', () => {
    expect(html).toMatch(/product-lightbox\.css\?v=/u);
    expect(html).toMatch(/product\.lightbox\.js\?v=/u);
  });

  test('product.lightbox.js carrega após product.controller.js', () => {
    const idxCtrl = html.indexOf('product.controller.js');
    const idxLb   = html.indexOf('product.lightbox.js');
    expect(idxLb).toBeGreaterThan(idxCtrl);
  });
});

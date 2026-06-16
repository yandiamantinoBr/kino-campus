/**
 * @file product.render.test.js
 * @description Static contract tests for product.render.js.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../assets/js/controllers/public/product.render.js');
let source;

beforeAll(() => { source = fs.readFileSync(SRC, 'utf8'); });

describe('product.render.js - estrutura IIFE e namespace', () => {
  test('e uma IIFE sem imports', () => {
    expect(source).toMatch(/\(function\s*\(\)\s*\{/);
    expect(source).toContain("'use strict';");
    expect(source).not.toMatch(/require\s*\(/);
    expect(source).not.toMatch(/import\s+/);
  });

  test('registra window._KCProduct.render', () => {
    expect(source).toContain('window._KCProduct = window._KCProduct || {}');
    expect(source).toContain('window._KCProduct.render = Object.freeze({');
  });
});

describe('product.render.js - galeria acessivel', () => {
  test('imagem principal e miniaturas recebem alt com titulo da publicacao', () => {
    expect(source).toContain("var title = String(post.titulo || post.title || 'publicação').trim() || 'publicação';");
    expect(source).toContain("var imageAlt = 'Imagem da publicação: ' + title;");
    expect(source).toContain('mainImg.alt = imageAlt;');
    expect(source).toContain("img.alt = 'Miniatura ' + (idx + 1) + ' de ' + title;");
    expect(source).toContain('mainImg.alt = img.alt;');
  });
});

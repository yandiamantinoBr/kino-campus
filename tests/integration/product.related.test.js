/**
 * @file product.related.test.js
 * @description Static contract tests for product.related.js (v11.30.11)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../assets/js/controllers/public/product.related.js');
let source;

beforeAll(() => { source = fs.readFileSync(SRC, 'utf8'); });

describe('product.related.js — estrutura IIFE e namespace', () => {
  test('é uma IIFE (function)()', () => {
    expect(source).toMatch(/\(function\s*\(\)\s*\{/);
  });

  test("declara 'use strict'", () => {
    expect(source).toContain("'use strict';");
  });

  test('inicializa window._KCProduct', () => {
    expect(source).toContain('window._KCProduct = window._KCProduct || {}');
  });

  test('registra window._KCProduct.related', () => {
    expect(source).toContain('window._KCProduct.related = {');
  });

  test('fecha o IIFE com })();', () => {
    expect(source).toContain('})();');
  });

  test('não usa require/import', () => {
    expect(source).not.toMatch(/require\s*\(/);
    expect(source).not.toMatch(/import\s+/);
  });
});

describe('product.related.js — utilitários locais', () => {
  test('define esc() delegando a window.KCUtils.escapeHtml', () => {
    expect(source).toContain('function esc(str)');
    expect(source).toContain('window.KCUtils.escapeHtml');
  });

  test('define moduleLabel, formatCurrency, getPostAuthorId, isLegacyExamplePost, buildLegacyExampleBadgeHtml e getPostIdForMutation', () => {
    expect(source).toContain('function moduleLabel(key)');
    expect(source).toContain('function formatCurrency(n)');
    expect(source).toContain('function getPostAuthorId(post)');
    expect(source).toContain('function isLegacyExamplePost(post)');
    expect(source).toContain('function buildLegacyExampleBadgeHtml(label, extraClass)');
    expect(source).toContain('function getPostIdForMutation(post)');
  });
});

describe('product.related.js — getRelatedReasonLabel', () => {
  test('define a função e contém os labels esperados', () => {
    expect(source).toContain('function getRelatedReasonLabel(candidate, currentPost)');
    expect(source).toContain('Mesmo autor neste módulo');
    expect(source).toContain('Publicação relacionada');
  });
});

describe('product.related.js — getRelatedImageHtml', () => {
  test('define a função e usa a estrutura visual esperada', () => {
    expect(source).toContain('function getRelatedImageHtml(post)');
    expect(source).toContain('kc-related-card__media');
    expect(source).toContain('loading="lazy"');
    expect(source).toContain('kc-product-example-ribbon--related');
  });
});

describe('product.related.js — getRelatedPriceLabel', () => {
  test('define a função e trata preço zero como Gratuito', () => {
    expect(source).toContain('function getRelatedPriceLabel(post)');
    expect(source).toContain('formatCurrency(price)');
    expect(source).toContain("'Gratuito'");
  });
});

describe('product.related.js — renderRelatedPosts', () => {
  test('define a função e renderiza os cards esperados', () => {
    expect(source).toContain('function renderRelatedPosts(posts, currentPost)');
    expect(source).toContain('kc-related-card');
    expect(source).toContain('kc-related-card__title');
  });

  test('esconde a seção quando a lista está vazia', () => {
    expect(source).toContain("section.style.display = 'none'");
  });
});

describe('product.related.js — setRelated', () => {
  test('define async function setRelated com viewerAuthenticated', () => {
    expect(source).toContain('async function setRelated(post, viewerAuthenticated)');
  });

  test('usa window.KCAPI.getRelatedPosts e relatedRequestToken', () => {
    expect(source).toContain('window.KCAPI.getRelatedPosts');
    expect(source).toContain('relatedRequestToken');
  });

  test('usa o loader kc-related-loading e repassa viewerAuthenticated', () => {
    expect(source).toContain('kc-related-loading');
    expect(source).toContain('viewerAuthenticated: !!viewerAuthenticated');
  });
});

describe('product.related.js — exports', () => {
  test('exporta setRelated', () => {
    expect(source).toContain('setRelated: setRelated,');
  });
});

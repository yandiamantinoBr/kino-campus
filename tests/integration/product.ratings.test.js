/**
 * @file product.ratings.test.js
 * @description Static contract tests for product.ratings.js (v11.30.14)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../assets/js/controllers/public/product.ratings.js');
let source;

beforeAll(() => { source = fs.readFileSync(SRC, 'utf8'); });

describe('product.ratings.js - estrutura IIFE e namespace', () => {
  test('e uma IIFE (function)()', () => {
    expect(source).toMatch(/\(function\s*\(\)\s*\{/);
  });

  test("declara 'use strict'", () => {
    expect(source).toContain("'use strict';");
  });

  test('inicializa window._KCProduct', () => {
    expect(source).toContain('window._KCProduct = window._KCProduct || {}');
  });

  test('registra window._KCProduct.ratings', () => {
    expect(source).toContain('window._KCProduct.ratings = {');
  });

  test('nao usa require/import', () => {
    expect(source).not.toMatch(/require\s*\(/);
    expect(source).not.toMatch(/import\s+/);
  });
});

describe('product.ratings.js - utilitarios locais', () => {
  test('define helpers duplicados do core', () => {
    expect(source).toContain('function esc(str)');
    expect(source).toContain('window.KCUtils.escapeHtml');
    expect(source).toContain('function toast(message, type, duration)');
    expect(source).toContain('function buildCurrentPagePath()');
    expect(source).toContain('function getPostAuthorId(post)');
    expect(source).toContain('function getPostIdForMutation(post)');
    expect(source).toContain('function isLegacyExamplePost(post)');
    expect(source).toContain('function isLegacyExampleProfile(profile)');
  });
});

describe('product.ratings.js - resumo de avaliacoes', () => {
  test('define normalize, getter e apply do summary', () => {
    expect(source).toContain('function normalizeSellerRatingSummary(raw)');
    expect(source).toContain('function getSellerRatingSummaryFromPost(post)');
    expect(source).toContain('function applySellerRatingSummaryToPost(post, summary)');
  });

  test('define builder do summary html', () => {
    expect(source).toContain('function buildSellerRatingSummaryHtml(summary)');
    expect(source).toContain('kc-seller-rating-summary__empty');
    expect(source).toContain('kc-seller-rating-summary__caption');
  });
});

describe('product.ratings.js - motivos e auth', () => {
  test('define mensagens de reason e fluxo de auth', () => {
    expect(source).toContain('function getUserRatingReasonMessage(reason)');
    expect(source).toContain("if (key === 'AUTH_REQUIRED')");
    expect(source).toContain('Fa');
    expect(source).toContain('function openAuthForUserRating()');
    expect(source).toContain('window.kcOpenAuthModal');
  });
});

describe('product.ratings.js - modal de avaliacao', () => {
  test('define ensureSellerRatingModal com elementos principais', () => {
    expect(source).toContain('function ensureSellerRatingModal()');
    expect(source).toContain('kc-user-rating-modal');
    expect(source).toContain('kc-user-rating-star');
    expect(source).toContain('kcSellerRatingComment');
    expect(source).toContain('kcSellerRatingCounter');
  });
});

describe('product.ratings.js - refresh e mutacao', () => {
  test('define refreshSellerRatingUI com ctx e mutacao KCAPI', () => {
    expect(source).toContain('function refreshSellerRatingUI(post, summary, ratingState, ctx)');
    expect(source).toContain('window.KCAPI.upsertUserRating');
    expect(source).toContain("button.innerHTML = '<i class=\"fas fa-right-to-bracket\"></i> Entrar para avaliar'");
    expect(source).toContain("button.innerHTML = '<i class=\"fas fa-pen\"></i> Editar avalia");
    expect(source).toContain("button.innerHTML = '<i class=\"fas fa-star\"></i> Avaliar usu");
    expect(source).toContain("button.innerHTML = '<i class=\"fas fa-lock\"></i> Avalia");
  });
});

describe('product.ratings.js - exports', () => {
  test('exporta apenas o contrato usado pelo core', () => {
    expect(source).toContain('normalizeSellerRatingSummary: normalizeSellerRatingSummary,');
    expect(source).toContain('getSellerRatingSummaryFromPost: getSellerRatingSummaryFromPost,');
    expect(source).toContain('applySellerRatingSummaryToPost: applySellerRatingSummaryToPost,');
    expect(source).toContain('refreshSellerRatingUI: refreshSellerRatingUI');
  });
});

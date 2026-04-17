/**
 * @file product.analytics.test.js
 * @description Static contract tests for product.analytics.js (v11.30.16)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../assets/js/controllers/product.analytics.js');
let source;

beforeAll(() => { source = fs.readFileSync(SRC, 'utf8'); });

describe('product.analytics.js - estrutura IIFE e namespace', () => {
  test('e uma IIFE com use strict', () => {
    expect(source).toMatch(/\(function\s*\(\)\s*\{/);
    expect(source).toContain("'use strict';");
    expect(source).toContain('window._KCProduct = window._KCProduct || {}');
    expect(source).toContain('window._KCProduct.analytics = {');
  });

  test('nao usa require/import em runtime', () => {
    expect(source).not.toMatch(/require\s*\(/);
    expect(source).not.toMatch(/import\s+/);
  });
});

describe('product.analytics.js - helpers locais', () => {
  test('duplica helpers necessarios do core', () => {
    expect(source).toContain('function esc(str)');
    expect(source).toContain('window.KCUtils.escapeHtml');
    expect(source).toContain('function isAuthor(post, user)');
    expect(source).toContain('function getPostIdForMutation(post)');
  });

  test('define assinatura e badge privados', () => {
    expect(source).toContain('function buildAuthorAnalyticsSignature(result)');
    expect(source).toContain('function statBadge(icon, value, label)');
    expect(source).toContain('white-space:nowrap;');
    expect(source).toContain("esc(label)");
  });
});

describe('product.analytics.js - render do painel', () => {
  test('define setAuthorAnalyticsMarkup com as seis metricas', () => {
    expect(source).toContain('function setAuthorAnalyticsMarkup(panel, result)');
    expect(source).toContain("statBadge('fas fa-eye', result.views, 'Views')");
    expect(source).toContain("statBadge('fas fa-arrow-up', result.votos, 'Votos')");
    expect(source).toContain("statBadge('fas fa-comment', result.comments, 'Coment.')");
    expect(source).toContain("statBadge('fas fa-share-nodes', result.shares, 'Compartilh.')");
    expect(source).toContain("statBadge('fas fa-bookmark', result.saves, 'Salvos')");
    expect(source).toContain("statBadge('fas fa-hand-pointer', result.coupon_clicks, 'Cliques CTA')");
  });

  test('define renderAuthorAnalytics com auth gate e contrato KCAPI', () => {
    expect(source).toContain('function renderAuthorAnalytics(post, user)');
    expect(source).toContain("if (!isAuthor(post, user)) return;");
    expect(source).toContain("panel.id = 'kcAuthorAnalytics'");
    expect(source).toContain("window.KCAPI.getPostAnalytics");
    expect(source).toContain("window.KCAPI.getCachedPostAnalytics");
    expect(source).toContain("window.KCAPI.refreshPostAnalytics");
  });

  test('reaproveita cache e faz refresh silencioso', () => {
    expect(source).toContain("getCachedPostAnalytics(pid, { allowStale: true })");
    expect(source).toContain("refreshPostAnalytics(pid, { force: true, keepStaleOnError: true })");
    expect(source).toContain("if (!renderedSignature) panel.style.display = 'none';");
    expect(source).toContain('nextSignature !== renderedSignature');
  });
});

describe('product.analytics.js - export', () => {
  test('exporta apenas o contrato usado pelo core', () => {
    expect(source).toContain('renderAuthorAnalytics: renderAuthorAnalytics');
  });
});

/**
 * @file product.controller-split-contract.test.js
 * @description Static contract tests for product.controller.js split orchestration (v11.30.18)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CONTROLLER_PATH = path.resolve(__dirname, '../../assets/js/controllers/public/product.controller.js');
const LOAD_PATH       = path.resolve(__dirname, '../../assets/js/controllers/public/product.load.js');
const HTML_PATH       = path.resolve(__dirname, '../../_product.html');

let controllerSource;
let loadSource;
let htmlSource;

beforeAll(() => {
  controllerSource = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  loadSource       = fs.readFileSync(LOAD_PATH, 'utf8');
  htmlSource       = fs.readFileSync(HTML_PATH, 'utf8');
});

describe('product.controller.js - core namespace guards', () => {
  test('mantem o namespace base e os guards dos sub-modulos extraidos', () => {
    expect(controllerSource).toContain('window._KCProduct = window._KCProduct || {}');
    expect(controllerSource).toContain('window._KCProduct.report = window._KCProduct.report || {};');
    expect(controllerSource).toContain('window._KCProduct.related = window._KCProduct.related || {};');
    expect(controllerSource).toContain('window._KCProduct.calendar = window._KCProduct.calendar || {};');
    expect(controllerSource).toContain('window._KCProduct.save = window._KCProduct.save || {};');
    expect(controllerSource).toContain('window._KCProduct.ratings = window._KCProduct.ratings || {};');
    expect(controllerSource).toContain('window._KCProduct.edit = window._KCProduct.edit || {};');
    expect(controllerSource).toContain('window._KCProduct.analytics = window._KCProduct.analytics || {};');
    expect(controllerSource).toContain('window._KCProduct.popovers = window._KCProduct.popovers || {};');
  });
});

// v13.4.1: renderPost e delegações de sub-módulos movidos para product.load.js
describe('product.load.js - renderPost delega para sub-modulos', () => {
  test('delegates related, calendar, edit, analytics, save e report a partir do core', () => {
    expect(loadSource).toContain('function renderPost(post) {');
    expect(loadSource).toContain('window._KCProduct.calendar.setEventCalendar(post);');
    expect(loadSource).toContain('window._KCProduct.related.setRelated(post,');
    expect(loadSource).toContain('window._KCProduct.edit.upsertOwnerActions(post,');
    expect(loadSource).toContain('window._KCProduct.analytics.renderAuthorAnalytics(post,');
    expect(loadSource).toContain('window._KCProduct.save.bindSavedActions(post,');
    expect(loadSource).toContain('window._KCProduct.save.refreshSavedState(post)');
    expect(loadSource).toContain('window._KCProduct.report.wireReportButton(');
  });

  test('mantem cache curto de detalhe do post e invalidacao publica', () => {
    expect(loadSource).toContain('PRODUCT_DETAIL_CACHE_MAX_AGE_MS = 5 * 60 * 1000');
    expect(loadSource).toContain("PRODUCT_DETAIL_CACHE_SCOPE = 'product-detail'");
    expect(loadSource).toContain('function getCachedProductDetail(id)');
    expect(loadSource).toContain('function invalidateProductDetailCache(postOrId)');
    expect(loadSource).toContain('invalidateProductDetailCache:    invalidateProductDetailCache');
    expect(loadSource).toContain('fetchPromise = fetchRenderablePost(id)');
    expect(loadSource).toContain('KCPostFreshness.subscribe');
    expect(loadSource).toContain('function isRenderableProductPost(post)');
  });
});

describe('product.controller.js - bootstrap delega wiring para sub-modulos', () => {
  test('DOMContentLoaded chama popovers e save com guard defensivo', () => {
    expect(controllerSource).toContain("document.addEventListener('DOMContentLoaded', () => {");
    expect(controllerSource).toContain('window._KCProduct.popovers.bindProductGlobalKeydown();');
    expect(controllerSource).toContain('window._KCProduct.popovers.wireSharePopover({');
    expect(controllerSource).toContain('getCurrentPost: function () { return currentPost; }');
    expect(controllerSource).toContain('window._KCProduct.save.wireSavePopover();');
  });

  test('mantem interacoes core residuais no bootstrap', () => {
    expect(controllerSource).toContain('wireCreateSimilarBtn();');
    expect(controllerSource).toContain('bindStaticInteractions();');
    // v13.4.1: loadPost delegado para product.load.js
    expect(controllerSource).toContain('window._KCProduct.load.loadPost()');
  });
});

describe('product.controller.js - implementacoes extraidas nao permanecem inline', () => {
  test('nao mantem definicoes locais dos grupos ja extraidos', () => {
    expect(controllerSource).not.toContain('function wireReportButton(');
    expect(controllerSource).not.toContain('function setRelated(');
    expect(controllerSource).not.toContain('function openCalendarPopover(');
    expect(controllerSource).not.toContain('function openSavePopover(');
    expect(controllerSource).not.toContain('function refreshSellerRatingUI(');
    expect(controllerSource).not.toContain('function upsertOwnerActions(');
    expect(controllerSource).not.toContain('function renderAuthorAnalytics(');
    expect(controllerSource).not.toContain('function openSharePopover(');
    expect(controllerSource).not.toContain('function handleProductGlobalKeydown(');
  });
});

describe('_product.html - ordem canonica dos scripts do split', () => {
  const orderedScripts = [
    'assets/js/controllers/public/product.controller.js',
    'assets/js/controllers/public/product.render.js',
    'assets/js/controllers/public/product.load.js',
    'assets/js/controllers/public/product.report.js',
    'assets/js/controllers/public/product.related.js',
    'assets/js/controllers/public/product.calendar.js',
    'assets/js/controllers/public/product.save.js',
    'assets/js/controllers/public/product.ratings.js',
    'assets/js/controllers/public/product.edit.js',
    'assets/js/controllers/public/product.analytics.js',
    'assets/js/controllers/public/product.popovers.js',
  ];

  // Aceita qualquer versão 8.6.x (cache-buster pode ser incrementado por fix/feature)
  const versionPattern = '\\?v=8\\.6\\.\\d+';

  test('carrega todos os sub-modulos com defer', () => {
    orderedScripts.forEach((src) => {
      const re = new RegExp(`<script defer src="${src.replace(/\./g, '\\.')}${versionPattern}"></script>`);
      expect(htmlSource).toMatch(re);
    });
  });

  test('preserva a ordem incremental do core para os sub-modulos', () => {
    let lastIndex = -1;
    orderedScripts.forEach((src) => {
      const re = new RegExp(`<script defer src="${src.replace(/\./g, '\\.')}${versionPattern}"></script>`);
      const match = htmlSource.match(re);
      const currentIndex = match ? match.index : -1;
      expect(currentIndex).toBeGreaterThan(lastIndex);
      lastIndex = currentIndex;
    });
  });
});

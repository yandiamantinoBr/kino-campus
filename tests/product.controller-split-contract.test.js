/**
 * @file product.controller-split-contract.test.js
 * @description Static contract tests for product.controller.js split orchestration (v11.30.18)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CONTROLLER_PATH = path.resolve(__dirname, '../assets/js/controllers/product.controller.js');
const HTML_PATH = path.resolve(__dirname, '../_product.html');

let controllerSource;
let htmlSource;

beforeAll(() => {
  controllerSource = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  htmlSource = fs.readFileSync(HTML_PATH, 'utf8');
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

describe('product.controller.js - renderPost delega para sub-modulos', () => {
  test('delegates related, calendar, edit, analytics, save e report a partir do core', () => {
    expect(controllerSource).toContain('function renderPost(post) {');
    expect(controllerSource).toContain('window._KCProduct.calendar.setEventCalendar(post);');
    expect(controllerSource).toContain('window._KCProduct.related.setRelated(post, !!(currentUser && currentUser.id));');
    expect(controllerSource).toContain('window._KCProduct.edit.upsertOwnerActions(post, currentUser, {');
    expect(controllerSource).toContain('window._KCProduct.analytics.renderAuthorAnalytics(post, currentUser);');
    expect(controllerSource).toContain('window._KCProduct.save.bindSavedActions(post, function () { return currentUser; });');
    expect(controllerSource).toContain('window._KCProduct.save.refreshSavedState(post).catch(() => { });');
    expect(controllerSource).toContain('window._KCProduct.report.wireReportButton({ postId: (post && post.uuid) ? post.uuid : post.id, postTitle: post.titulo || post.title || \'Publicação\' });');
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
    expect(controllerSource).toContain('loadPost();');
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
    'assets/js/controllers/product.controller.js',
    'assets/js/controllers/product.report.js',
    'assets/js/controllers/product.related.js',
    'assets/js/controllers/product.calendar.js',
    'assets/js/controllers/product.save.js',
    'assets/js/controllers/product.ratings.js',
    'assets/js/controllers/product.edit.js',
    'assets/js/controllers/product.analytics.js',
    'assets/js/controllers/product.popovers.js',
  ];

  test('carrega todos os sub-modulos com defer', () => {
    orderedScripts.forEach((src) => {
      expect(htmlSource).toContain(`<script defer src="${src}"></script>`);
    });
  });

  test('preserva a ordem incremental do core para os sub-modulos', () => {
    let lastIndex = -1;
    orderedScripts.forEach((src) => {
      const currentIndex = htmlSource.indexOf(`<script defer src="${src}"></script>`);
      expect(currentIndex).toBeGreaterThan(lastIndex);
      lastIndex = currentIndex;
    });
  });
});

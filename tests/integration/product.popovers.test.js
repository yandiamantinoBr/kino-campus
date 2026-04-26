/**
 * @file product.popovers.test.js
 * @description Static contract tests for product.popovers.js (v11.30.17)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../assets/js/controllers/product.popovers.js');
let source;

beforeAll(() => { source = fs.readFileSync(SRC, 'utf8'); });

describe('product.popovers.js - estrutura IIFE e namespace', () => {
  test('e uma IIFE com use strict', () => {
    expect(source).toMatch(/\(function\s*\(\)\s*\{/);
    expect(source).toContain("'use strict';");
    expect(source).toContain('window._KCProduct = window._KCProduct || {}');
    expect(source).toContain('window._KCProduct.popovers = {');
  });

  test('nao usa require/import em runtime', () => {
    expect(source).not.toMatch(/require\s*\(/);
    expect(source).not.toMatch(/import\s+/);
  });
});

describe('product.popovers.js - estado e helpers locais', () => {
  test('define estado local do popover', () => {
    expect(source).toContain('var PRODUCT_POPOVER_DESKTOP_BREAKPOINT = 640;');
    expect(source).toContain('var productPopoverViewportBound = false;');
    expect(source).toContain('var productGlobalKeydownBound = false;');
    expect(source).toContain('var currentPostGetter = null;');
  });

  test('duplica helpers necessarios de share e viewport', () => {
    expect(source).toContain('function toast(message, type, duration)');
    expect(source).toContain('window.showToast');
    expect(source).toContain('function getCurrentPost()');
    expect(source).toContain('function getProductPopoverConfig(popoverId)');
    expect(source).toContain('function clearProductPopoverPosition(popover)');
    expect(source).toContain('function positionProductPopover(popoverId, anchorBtn)');
    expect(source).toContain('function ensureProductPopoverViewportBinding()');
  });
});

describe('product.popovers.js - share wiring', () => {
  test('define tracking e copia do link atual', () => {
    expect(source).toContain('function trackCurrentPostShare()');
    expect(source).toContain('window.KCAPI.trackShare');
    expect(source).toContain('function copyCurrentPostLink(options)');
    expect(source).toContain('window.KCUtils.copyTextToClipboard');
  });

  test('define open e close do sharePopover', () => {
    expect(source).toContain('function openSharePopover(btn)');
    expect(source).toContain("document.getElementById('sharePopover')");
    expect(source).toContain("popover.classList.add('active')");
    expect(source).toContain('function closeSharePopover()');
    expect(source).toContain("popover.classList.remove('active')");
    expect(source).toContain('clearProductPopoverPosition(popover)');
  });

  test('wireSharePopover aceita contexto com getCurrentPost', () => {
    expect(source).toContain('function wireSharePopover(context)');
    expect(source).toContain("typeof context.getCurrentPost === 'function'");
    expect(source).toContain("document.getElementById('shareWhatsApp')");
    expect(source).toContain("window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer')");
    expect(source).toContain("toast('Link copiado!', 'info', 1800)");
    expect(source).toContain("toast('Nao foi possivel copiar automaticamente. Tente novamente ou copie o link pela barra do navegador.', 'error', 2600)");
  });
});

describe('product.popovers.js - teclado global e export', () => {
  test('define binding de Escape global e coordena save/calendar', () => {
    expect(source).toContain('function handleProductGlobalKeydown(event)');
    expect(source).toContain("if (!event || event.key !== 'Escape') return;");
    expect(source).toContain('function bindProductGlobalKeydown()');
    expect(source).toContain('window._KCProduct.save.closeSavePopover');
    expect(source).toContain('window._KCProduct.calendar.closeCalendarPopover');
  });

  test('exporta apenas o contrato usado pelo core', () => {
    expect(source).toContain('bindProductGlobalKeydown: bindProductGlobalKeydown');
    expect(source).toContain('wireSharePopover: wireSharePopover');
    expect(source).toContain('closeSharePopover: closeSharePopover');
  });
});

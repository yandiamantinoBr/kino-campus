/**
 * @file product.save.test.js
 * @description Static contract tests for product.save.js (v11.30.13)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../assets/js/controllers/public/product.save.js');
let source;

beforeAll(() => { source = fs.readFileSync(SRC, 'utf8'); });

describe('product.save.js - estrutura IIFE e namespace', () => {
  test('e uma IIFE (function)()', () => {
    expect(source).toMatch(/\(function\s*\(\)\s*\{/);
  });

  test("declara 'use strict'", () => {
    expect(source).toContain("'use strict';");
  });

  test('inicializa window._KCProduct', () => {
    expect(source).toContain('window._KCProduct = window._KCProduct || {}');
  });

  test('registra window._KCProduct.save', () => {
    expect(source).toContain('window._KCProduct.save = {');
  });

  test('nao usa require/import', () => {
    expect(source).not.toMatch(/require\s*\(/);
    expect(source).not.toMatch(/import\s+/);
  });
});

describe('product.save.js - estado e utilitarios locais', () => {
  test('define savedPostState local', () => {
    expect(source).toContain('var savedPostState = { kinds: [], loaded: false, pending: false };');
  });

  test('define helpers locais de save state', () => {
    expect(source).toContain('function toast(message, type, duration)');
    expect(source).toContain('function getPostIdForMutation(post)');
    expect(source).toContain('function trackHomeCategoryInteraction(eventType, post)');
    expect(source).toContain('function getSavedButtons()');
    expect(source).toContain('function getSaveKindLabel(kind)');
    expect(source).toContain('function getSaveKinds()');
  });

  test('define helpers locais de popover', () => {
    expect(source).toContain('function clearSavePopoverPosition(popover)');
    expect(source).toContain('function positionSavePopover(anchorBtn)');
    expect(source).toContain('function scheduleSavePopoverPosition(anchorBtn)');
    expect(source).toContain('function ensureSavePopoverViewportBinding()');
    expect(source).toContain('function closeExternalPopover(popoverId, backdropId, buttonId)');
  });
});

describe('product.save.js - open/close/wire do popover', () => {
  test('define open, close e wire do save popover', () => {
    expect(source).toContain('function openSavePopover(btn)');
    expect(source).toContain('function closeSavePopover()');
    expect(source).toContain('function wireSavePopover()');
  });

  test('fecha share e calendar antes de abrir save', () => {
    expect(source).toContain("closeExternalPopover('sharePopover', 'shareBackdrop', 'shareButton')");
    expect(source).toContain("window._KCProduct.calendar.closeCalendarPopover()");
  });
});

describe('product.save.js - save state', () => {
  test('define updateSavedButtonsUI', () => {
    expect(source).toContain('function updateSavedButtonsUI()');
    expect(source).toContain("document.getElementById('saveButtonCount')");
  });

  test('define refreshSavedState usando KCAPI.getSavedPostState', () => {
    expect(source).toContain('async function refreshSavedState(post)');
    expect(source).toContain('window.KCAPI.getSavedPostState');
  });

  test('define bindSavedActions com getViewer e mutacoes de save', () => {
    expect(source).toContain('function bindSavedActions(post, getViewer)');
    expect(source).toContain("typeof currentViewerGetter === 'function' ? currentViewerGetter() : null");
    expect(source).toContain('window.KCAPI.clearSavedPostState');
    expect(source).toContain('window.KCAPI.setSavedPostState');
  });

  test('preserva mensagens principais de UX', () => {
    expect(source).toContain('Faça login para salvar esta publicação.');
    expect(source).toContain('Salvamento removido.');
    expect(source).toContain('salvo com sucesso.');
    expect(source).toContain('atualizar este salvamento agora.');
  });
});

describe('product.save.js - exports', () => {
  test('exporta apenas o contrato usado pelo core', () => {
    expect(source).toContain('closeSavePopover: closeSavePopover,');
    expect(source).toContain('wireSavePopover: wireSavePopover,');
    expect(source).toContain('bindSavedActions: bindSavedActions,');
    expect(source).toContain('refreshSavedState: refreshSavedState');
  });
});

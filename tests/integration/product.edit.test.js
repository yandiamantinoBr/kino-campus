/**
 * @file product.edit.test.js
 * @description Static contract tests for product.edit.js (v11.30.15)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../assets/js/controllers/public/product.edit.js');
const CALENDAR_SRC = path.resolve(__dirname, '../../assets/js/controllers/public/product.calendar.js');
const CSS_SRC = path.resolve(__dirname, '../../assets/css/product.css');
let source;
let calendarSource;
let cssSource;

beforeAll(() => {
  source = fs.readFileSync(SRC, 'utf8');
  calendarSource = fs.readFileSync(CALENDAR_SRC, 'utf8');
  cssSource = fs.readFileSync(CSS_SRC, 'utf8');
});

describe('product.edit.js - estrutura IIFE e namespace', () => {
  test('e uma IIFE (function)()', () => {
    expect(source).toMatch(/\(function\s*\(\)\s*\{/);
  });

  test("declara 'use strict'", () => {
    expect(source).toContain("'use strict';");
  });

  test('inicializa window._KCProduct e registra o namespace edit', () => {
    expect(source).toContain('window._KCProduct = window._KCProduct || {}');
    expect(source).toContain('window._KCProduct.edit = {');
  });

  test('nao usa require/import em runtime', () => {
    expect(source).not.toMatch(/require\s*\(/);
    expect(source).not.toMatch(/import\s+/);
  });
});

describe('product.edit.js - estado local e helpers', () => {
  test('define editUI e helpers duplicados do core', () => {
    expect(source).toContain('var editUI = null;');
    expect(source).toContain('function toast(message, type, duration)');
    expect(source).toContain('function isAuthor(post, user)');
    expect(source).toContain('function getPostIdForMutation(post)');
    expect(source).toContain('function markPostAsEdited()');
    expect(source).toContain('function buildEditPayload(form, sourcePost)');
    expect(source).toContain('function resolveCurrentUser(context, fallbackUser)');
  });

  test('buildEditPayload preserva metadata e tags', () => {
    expect(source).toContain('metadata.tags = tagsRaw.split');
    expect(source).toContain('delete metadata.tags;');
    expect(source).toContain('price: String(form.price.value || \'\').trim()');
  });
});

describe('product.edit.js - owner actions', () => {
  test('define upsertOwnerActions com os controles do dono', () => {
    expect(source).toContain('function upsertOwnerActions(post, user, context)');
    expect(source).toContain("wrap.id = 'ownerActionsWrap'");
    expect(source).toContain("wrap.className = 'kc-owner-actions-grid'");
    expect(source).toContain("editBtn.id = 'editPostButton'");
    expect(source).toContain("toggleBtn.id = 'togglePostStatusButton'");
    expect(source).toContain("renewBtn.id = 'renewPostButton'");
    expect(source).toContain("bumpBtn.id = 'bumpPostButton'");
    expect(source).toContain("closeBtn.id = 'closePostButton'");
    expect(source).toContain("deleteBtn.id = 'deletePostButton'");
    expect(source).toContain("badge.id = 'ownerStatusBadge'");
  });

  test('mantem grid proporcional: apenas botoes visiveis entram no sub-grid do dono', () => {
    expect(source).toContain('function appendVisibleAction(btn)');
    expect(source).toContain("if (!btn || btn.style.display === 'none') return;");
    expect(source).toContain("wrap.style.cssText = 'display:contents;'");
    expect(source).toContain('appendVisibleAction(editBtn);');
    expect(source).toContain('appendVisibleAction(bumpBtn);');
    expect(source).toContain('appendVisibleAction(deleteBtn);');
  });

  test('mantem o contrato de edit principal e o audit_log', () => {
    expect(source).toContain('window.kcOpenEditPostModal');
    expect(source).toContain("action: 'post_edited'");
    expect(source).toContain("client.from('audit_log').insert");
    expect(source).toContain('markPostAsEdited();');
  });

  test('mantem as mutacoes de owner actions via KCAPI', () => {
    expect(source).toContain('window.KCAPI.deletePost');
    expect(source).toContain('window.KCAPI.togglePostStatus');
    expect(source).toContain('window.KCAPI.renewPost');
    expect(source).toContain('window.KCAPI.bumpPost');
    expect(source).toContain('window.KCAPI.closePost');
    expect(source).toContain('window.KCAPI.reactivatePost');
    expect(source).toContain('Reativar');
    expect(source).toContain("{ reason: 'owner_closed' }");
  });
});

describe('product.edit.js - modal fallback de edicao', () => {
  test('define buildEditUI com estrutura do modal', () => {
    expect(source).toContain('function buildEditUI(context)');
    expect(source).toContain('kc-create-modal-title');
    expect(source).toContain('Editar publica');
    expect(source).toContain('data-action="cancel"');
    expect(source).toContain('data-action="save"');
  });

  test('buildEditUI salva pelo contrato atual do KCAPI', () => {
    expect(source).toContain('editingPost = post;');
    expect(source).toContain("status.textContent = 'Salvando...';");
    expect(source).toContain('window.KCAPI.updatePost');
    expect(source).toContain('liveContext.renderPost(next);');
  });
});

describe('product.edit.js - feedback e navegacao', () => {
  test('mantem feedbacks e redirect pos-exclusao', () => {
    expect(source).toContain('window.confirm(');
    expect(source).toContain("window.location.href = 'index.html'");
    expect(source).toContain("toast('Publica\\u00E7\\u00E3o exclu\\u00EDda com sucesso.'");
    expect(source).toContain("toast(msg, 'error', 2800);");
  });

  test('mantem o fluxo de toggle, renew e bump com estados de botao', () => {
    expect(source).toContain("toggleBtn.innerHTML = '<i class=\"fas fa-spinner fa-spin\"></i> Aguarde...'");
    expect(source).toContain("renewBtn.innerHTML = '<i class=\"fas fa-spinner fa-spin\"></i> Renovando...'");
    expect(source).toContain("bumpBtn.innerHTML = '<i class=\"fas fa-spinner fa-spin\"></i> Impulsionando...'");
    expect(source).toContain("bumpBtn.innerHTML = '<i class=\"fas fa-rocket\"></i> Impulsionado!'");
  });
});

describe('product.edit.js - exports', () => {
  test('exporta apenas o contrato usado pelo core', () => {
    expect(source).toContain('upsertOwnerActions: upsertOwnerActions');
  });
});

describe('product.css - layout proporcional das actions', () => {
  test('mantem grid de 2 colunas sem full-row em compartilhar/excluir', () => {
    expect(cssSource).toContain('.kc-product-actions > #ownerActionsWrap');
    expect(cssSource).toContain('display: contents;');
    expect(cssSource).toMatch(/#ownerActionsWrap > button \{\s*min-height: 44px;/);
    expect(cssSource).not.toContain('.kc-product-actions.kc-product-actions--has-calendar > .kc-share-wrap');
    expect(cssSource).not.toContain('#ownerActionsWrap > button:last-child:nth-child(odd)');
    expect(cssSource).not.toContain('.kc-product-actions > #reportButton,\n      .kc-product-actions > #closedReportButton');
    expect(cssSource).not.toMatch(/\.kc-product-actions > \.kc-save-wrap,\s*\.kc-product-actions > \.kc-share-wrap,\s*\.kc-product-actions > \.kc-calendar-wrap,\s*\.kc-product-actions \.kc-btn-primary/);
  });
});

describe('product.calendar.js - estado de calendario nas actions', () => {
  test('nao usa classe de full-row para compartilhar quando calendario esta presente', () => {
    expect(calendarSource).not.toContain('kc-product-actions--has-calendar');
    expect(calendarSource).toContain('primaryCta.parentNode.insertBefore(wrap, primaryCta.nextSibling)');
  });
});

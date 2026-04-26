/**
 * @file product.edit.test.js
 * @description Static contract tests for product.edit.js (v11.30.15)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../assets/js/controllers/public/product.edit.js');
let source;

beforeAll(() => { source = fs.readFileSync(SRC, 'utf8'); });

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
    expect(source).toContain("editBtn.id = 'editPostButton'");
    expect(source).toContain("toggleBtn.id = 'togglePostStatusButton'");
    expect(source).toContain("renewBtn.id = 'renewPostButton'");
    expect(source).toContain("bumpBtn.id = 'bumpPostButton'");
    expect(source).toContain("deleteBtn.id = 'deletePostButton'");
    expect(source).toContain("badge.id = 'ownerStatusBadge'");
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
    expect(source).toContain("toast('Publicacao excluida com sucesso.'");
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

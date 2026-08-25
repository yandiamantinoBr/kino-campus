/**
 * @file kc-create-post-render.test.js
 * @description Testes de contrato estático para kc-create-post.render.js (v11.31.7).
 *
 * Estratégia: fs.readFileSync → análise de texto; sem DOM, sem eval.
 * Cobre: estrutura IIFE, helpers privados, seções HTML, kcEnsureCreateModal,
 * kcRenderCreateModal, registro de namespace e stubs no core.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const RENDER_PATH = path.join(__dirname, '..', '..', 'assets', 'js', 'features', 'create-post', 'kc-create-post.render.js');
const CORE_PATH   = path.join(__dirname, '..', '..', 'assets', 'js', 'features', 'create-post', 'kc-create-post.js');

let source     = '';
let coreSource = '';

beforeAll(() => {
  source     = fs.readFileSync(RENDER_PATH, 'utf8');
  coreSource = fs.readFileSync(CORE_PATH,   'utf8');
});

// ─── 1. Arquivo e estrutura IIFE ─────────────────────────────────────────────
describe('kc-create-post.render.js — estrutura de arquivo', () => {
  test('arquivo existe e tem tamanho substancial (>10000 chars)', () => {
    expect(source.length).toBeGreaterThan(10000);
  });

  test('inicia com bloco de documentação JSDoc', () => {
    expect(source.trimStart()).toMatch(/^\/\*\*/);
  });

  test('contém IIFE com "use strict"', () => {
    expect(source).toContain("(function () {");
    expect(source).toContain("'use strict';");
  });

  test('IIFE é auto-invocada corretamente', () => {
    expect(source).toContain('})();');
  });

  test('cria ou reutiliza window._KCCreatePost namespace', () => {
    expect(source).toContain("window._KCCreatePost = window._KCCreatePost || {};");
  });
});

// ─── 2. Helpers privados ──────────────────────────────────────────────────────
describe('kc-create-post.render.js — helpers privados', () => {
  test('define _getState() acessando window._KCCreatePost._state', () => {
    expect(source).toContain('function _getState()');
    const idx = source.indexOf('function _getState()');
    const slice = source.slice(idx, idx + 150);
    expect(slice).toContain('window._KCCreatePost');
    expect(slice).toContain('._state');
  });

  test('define _getModalId() lendo window._KCCreatePost.schema.modalId', () => {
    expect(source).toContain('function _getModalId()');
    const idx = source.indexOf('function _getModalId()');
    const slice = source.slice(idx, idx + 200);
    expect(slice).toContain('window._KCCreatePost');
    expect(slice).toContain('schema');
    expect(slice).toContain('modalId');
    expect(slice).toContain("'kcCreatePostModalOverlay'");
  });

  test('define _getModules() lendo window._KCCreatePost.schema.modules', () => {
    expect(source).toContain('function _getModules()');
    const idx = source.indexOf('function _getModules()');
    const slice = source.slice(idx, idx + 150);
    expect(slice).toContain('schema');
    expect(slice).toContain('modules');
  });

  test('define _getVisibilityOptions() lendo schema.visibilityOptions', () => {
    expect(source).toContain('function _getVisibilityOptions()');
    const idx = source.indexOf('function _getVisibilityOptions()');
    const slice = source.slice(idx, idx + 150);
    expect(slice).toContain('visibilityOptions');
  });

  test('define _esc() com fallback defensivo', () => {
    expect(source).toContain('function _esc(str)');
    expect(source).toContain('window.KCUtils.escapeHtml');
  });
});

// ─── 3. _kcFormatDescriptionField ────────────────────────────────────────────
describe('kc-create-post.render.js — _kcFormatDescriptionField', () => {
  test('define a função com assinatura (textarea, format)', () => {
    expect(source).toContain('function _kcFormatDescriptionField(textarea, format)');
  });

  test('implementa case bold com wrapSelection', () => {
    expect(source).toContain("case 'bold':");
    expect(source).toContain("wrapSelection('**', '**', 'negrito');");
  });

  test('implementa case italic', () => {
    expect(source).toContain("case 'italic':");
    expect(source).toContain("wrapSelection('*', '*', 'itálico');");
  });

  test('implementa case link com placeholder https://', () => {
    expect(source).toContain("case 'link':");
    expect(source).toContain('](https://)');
  });

  test('implementa case quote com insertBlock', () => {
    expect(source).toContain("case 'quote':");
    expect(source).toContain("insertBlock(`> ");
  });

  test('implementa case bullet com insertBlock', () => {
    expect(source).toContain("case 'bullet':");
    expect(source).toContain("insertBlock(`- ");
  });

  test('chama _kcUpdateDescPreview(textarea) ao final', () => {
    expect(source).toContain('_kcUpdateDescPreview(textarea);');
  });

  test('dispara evento input com bubbles:true', () => {
    expect(source).toContain("new Event('input', { bubbles: true })");
  });
});

// ─── 4. _kcUpdateDescPreview ─────────────────────────────────────────────────
describe('kc-create-post.render.js — _kcUpdateDescPreview', () => {
  test('define a função com assinatura (textarea)', () => {
    expect(source).toContain('function _kcUpdateDescPreview(textarea)');
  });

  test('acessa o elemento kcDescPreview', () => {
    expect(source).toContain("'kcDescPreview'");
  });

  test('usa window.KCUtils.renderMarkdownInline se disponível', () => {
    expect(source).toContain('window.KCUtils.renderMarkdownInline');
  });

  test('atualiza preview.innerHTML com resultado renderizado', () => {
    expect(source).toContain('preview.innerHTML = renderMd(value);');
  });
});

// ─── 5. kcCreateSustainSectionHtml ───────────────────────────────────────────
describe('kc-create-post.render.js — kcCreateSustainSectionHtml', () => {
  test('define a função', () => {
    expect(source).toContain('function kcCreateSustainSectionHtml()');
  });

  test('acessa estado via _getState()', () => {
    const idx = source.indexOf('function kcCreateSustainSectionHtml()');
    const slice = source.slice(idx, idx + 300);
    expect(slice).toContain('_getState()');
  });

  test('usa campo sustentavel do state', () => {
    expect(source).toContain('state.values.sustentavel === true');
  });

  test('retorna HTML do checkbox sustentável', () => {
    expect(source).toContain('kcField_sustentavel');
    expect(source).toContain('Esta publicação contribui para a sustentabilidade');
  });
});

// ─── 6. kcCreateVisibilitySectionHtml ────────────────────────────────────────
describe('kc-create-post.render.js — kcCreateVisibilitySectionHtml', () => {
  test('define a função', () => {
    expect(source).toContain('function kcCreateVisibilitySectionHtml()');
  });

  test('acessa estado via _getState()', () => {
    const idx = source.indexOf('function kcCreateVisibilitySectionHtml()');
    const slice = source.slice(idx, idx + 300);
    expect(slice).toContain('_getState()');
  });

  test('usa _getVisibilityOptions() em vez de constante local', () => {
    expect(source).toContain('_getVisibilityOptions().map(');
  });

  test('chama kcNormalizePostVisibilityValue', () => {
    expect(source).toContain('kcNormalizePostVisibilityValue(');
  });

  test('gera HTML com classe kc-create-visibility-option', () => {
    expect(source).toContain('kc-create-visibility-option');
    expect(source).toContain('kc-create-visibility-toggle');
  });
});

// ─── 7. kcEnsureCreateModal — estrutura ──────────────────────────────────────
describe('kc-create-post.render.js — kcEnsureCreateModal: estrutura', () => {
  test('define kcEnsureCreateModal', () => {
    expect(source).toContain('function kcEnsureCreateModal()');
  });

  test('guard inicial usa _getModalId()', () => {
    const idx = source.indexOf('function kcEnsureCreateModal()');
    const slice = source.slice(idx, idx + 100);
    expect(slice).toContain('_getModalId()');
  });

  test('seta overlay.id via _getModalId()', () => {
    expect(source).toContain('overlay.id = _getModalId();');
  });

  test('cria modal com role dialog e aria-modal', () => {
    expect(source).toContain('role="dialog" aria-modal="true" aria-labelledby="kcCreateModalTitle"');
  });

  test('inclui formulário kcCreatePostForm novalidate', () => {
    expect(source).toContain('<form id="kcCreatePostForm" class="kc-create-form" novalidate>');
  });

  test('inclui botão submit no rodapé sem sobrepor o formulário', () => {
    expect(source).toContain('<div class="kc-create-modal__footer">');
    expect(source).toContain('<button type="submit" form="kcCreatePostForm" class="kc-create-submit" disabled>Publicar Agora</button>');
  });
});

// ─── 8. kcEnsureCreateModal — handlers de evento ─────────────────────────────
describe('kc-create-post.render.js — kcEnsureCreateModal: event handlers', () => {
  test('pede confirmação antes de fechar com dados preenchidos', () => {
    expect(source).toContain("window.confirm('Descartar publicação? As informações preenchidas serão perdidas.')");
  });

  test('handler de click para módulo usa _getState() para mutação', () => {
    const idx = source.indexOf("data-kc-module]'");
    const slice = source.slice(idx, idx + 300);
    expect(slice).toContain('_getState()');
    expect(slice).toContain('st.moduleKey');
    expect(slice).toContain('st.selections');
  });

  test('handler de chip seleciona tag via _getState()', () => {
    const idx = source.indexOf("data-kc-chip]'");
    const slice = source.slice(idx, idx + 300);
    expect(slice).toContain('_getState()');
    expect(slice).toContain('st.selections[groupId] = key');
  });

  test('handler de submit delega para kcHandleCreateSubmit()', () => {
    expect(source).toContain("form.addEventListener('submit', (e) => {");
    expect(source).toContain('kcHandleCreateSubmit();');
  });

  test('handler ESC chama kcCloseCreatePostModal quando modal aberto', () => {
    expect(source).toContain("e.key === 'Escape'");
    expect(source).toContain('kcCloseCreatePostModal()');
    // usa _getState() em vez de kcCreateState global
    const idx = source.indexOf("e.key === 'Escape'");
    const slice = source.slice(Math.max(0, idx - 200), idx + 150);
    expect(slice).toContain('_getState()');
  });

  test('suporte a drag & drop via .kc-img-dropzone', () => {
    expect(source).toContain('.kc-img-dropzone');
    expect(source).toContain("'dragover'");
    expect(source).toContain("'drop'");
  });

  test('toolbar de descrição com delegação data-kc-desc-format', () => {
    expect(source).toContain('[data-kc-desc-format]');
    expect(source).toContain('_kcFormatDescriptionField(textarea, format)');
  });

  test('input na área de opportunity-area usa _getState() para mutação', () => {
    expect(source).toContain('[data-kc-opportunity-area-input]');
    const idx = source.indexOf('[data-kc-opportunity-area-input]');
    const slice = source.slice(idx, idx + 400);
    expect(slice).toContain('_getState()');
    expect(slice).toContain('st.values[target.name]');
  });
});

// ─── 9. kcRenderCreateModal ──────────────────────────────────────────────────
describe('kc-create-post.render.js — kcRenderCreateModal', () => {
  test('define kcRenderCreateModal', () => {
    expect(source).toContain('function kcRenderCreateModal()');
  });

  test('obtém overlay via _getModalId()', () => {
    const idx = source.indexOf('function kcRenderCreateModal()');
    const slice = source.slice(idx, idx + 200);
    expect(slice).toContain('_getModalId()');
  });

  test('declara kcCreateState = _getState() e guarda contra null', () => {
    expect(source).toContain('const kcCreateState = _getState();');
    expect(source).toContain('if (!kcCreateState) return;');
  });

  test('declara KC_CREATE_SCHEMA = _getModules()', () => {
    expect(source).toContain('const KC_CREATE_SCHEMA = _getModules();');
  });

  test('verifica kcHasCreateSchemaLoaded antes de renderizar', () => {
    expect(source).toContain('kcHasCreateSchemaLoaded()');
  });

  test('itera módulos com Object.keys(KC_CREATE_SCHEMA).forEach', () => {
    expect(source).toContain('Object.keys(KC_CREATE_SCHEMA).forEach((key) => {');
  });

  test('constrói campos via kcBuildFieldsForModule com state', () => {
    // v11.31.6+: 4º parâmetro opts com isAdmin para limite de descrição admin.
    expect(source).toContain('const fields = kcBuildFieldsForModule(kcCreateState.moduleKey, kcCreateState.selections, kcCreateState.values');
  });

  test('adiciona seção de visibilidade ao parts', () => {
    expect(source).toContain('parts.push(kcCreateVisibilitySectionHtml());');
  });

  test('adiciona seção de imagens ao parts', () => {
    expect(source).toContain('parts.push(kcCreateImagesSectionHtml());');
  });

  test('adiciona seção de sustentabilidade ao parts', () => {
    expect(source).toContain('parts.push(kcCreateSustainSectionHtml());');
  });

  test('gera toolbar markdown com data-kc-desc-format="bold"', () => {
    expect(source).toContain('data-kc-desc-format="bold"');
  });

  test('diferencia modo edição no texto do botão submit', () => {
    expect(source).toContain("kcCreateState.editMode ? 'Salvar Alterações' : 'Publicar Agora'");
  });

  test('habilita submitBtn no final da renderização', () => {
    expect(source).toContain('submitBtn.disabled = false;');
  });

  test('aplica replace para normalizar texto de marcadores moradia', () => {
    expect(source).toContain("Marcadores do ambiente");
    expect(source).toContain("'Características do ambiente'");
  });
});

// ─── 10. Registro de namespace window._KCCreatePost.render ───────────────────
describe('kc-create-post.render.js — registro de namespace', () => {
  test('registra window._KCCreatePost.render', () => {
    expect(source).toContain('window._KCCreatePost.render =');
  });

  test('expõe formatDescriptionField', () => {
    const idx = source.indexOf('window._KCCreatePost.render =');
    const slice = source.slice(idx, idx + 500);
    expect(slice).toContain('formatDescriptionField: _kcFormatDescriptionField,');
  });

  test('expõe updateDescPreview', () => {
    const idx = source.indexOf('window._KCCreatePost.render =');
    const slice = source.slice(idx, idx + 500);
    expect(slice).toContain('updateDescPreview: _kcUpdateDescPreview,');
  });

  test('expõe createSustainSectionHtml', () => {
    const idx = source.indexOf('window._KCCreatePost.render =');
    const slice = source.slice(idx, idx + 500);
    expect(slice).toContain('createSustainSectionHtml: kcCreateSustainSectionHtml,');
  });

  test('expõe createVisibilitySectionHtml', () => {
    const idx = source.indexOf('window._KCCreatePost.render =');
    const slice = source.slice(idx, idx + 500);
    expect(slice).toContain('createVisibilitySectionHtml: kcCreateVisibilitySectionHtml,');
  });

  test('expõe ensureCreateModal', () => {
    const idx = source.indexOf('window._KCCreatePost.render =');
    const slice = source.slice(idx, idx + 500);
    expect(slice).toContain('ensureCreateModal: kcEnsureCreateModal,');
  });

  test('expõe renderCreateModal', () => {
    const idx = source.indexOf('window._KCCreatePost.render =');
    const slice = source.slice(idx, idx + 500);
    expect(slice).toContain('renderCreateModal: kcRenderCreateModal,');
  });
});

// ─── 11. kc-create-post.js — stubs de delegação ──────────────────────────────
describe('kc-create-post.js — stub _kcRenderModule + delegações', () => {
  test('define _kcRenderModule() no core', () => {
    expect(coreSource).toContain('function _kcRenderModule()');
  });

  test('_kcRenderModule acessa window._KCCreatePost.render', () => {
    const idx = coreSource.indexOf('function _kcRenderModule()');
    const slice = coreSource.slice(idx, idx + 150);
    expect(slice).toContain('window._KCCreatePost');
    expect(slice).toContain('.render');
  });

  test('stub kcEnsureCreateModal delega para r.ensureCreateModal', () => {
    const idx = coreSource.indexOf('function kcEnsureCreateModal()');
    const slice = coreSource.slice(idx, idx + 200);
    expect(slice).toContain('_kcRenderModule()');
    expect(slice).toContain('r.ensureCreateModal');
  });

  test('stub kcRenderCreateModal delega para r.renderCreateModal', () => {
    const idx = coreSource.indexOf('function kcRenderCreateModal()');
    const slice = coreSource.slice(idx, idx + 200);
    expect(slice).toContain('_kcRenderModule()');
    expect(slice).toContain('r.renderCreateModal');
  });

  test('stub kcCreateSustainSectionHtml retorna string vazia como fallback', () => {
    const idx = coreSource.indexOf('function kcCreateSustainSectionHtml()');
    const slice = coreSource.slice(idx, idx + 200);
    expect(slice).toContain("? r.createSustainSectionHtml() : ''");
  });

  test('stub kcCreateVisibilitySectionHtml retorna string vazia como fallback', () => {
    const idx = coreSource.indexOf('function kcCreateVisibilitySectionHtml()');
    const slice = coreSource.slice(idx, idx + 200);
    expect(slice).toContain("? r.createVisibilitySectionHtml() : ''");
  });

  test('não contém mais a implementação de kcRenderCreateModal no core', () => {
    // strings exclusivas do corpo original que não aparecem em outro lugar
    expect(coreSource).not.toContain('kc-editor-toolbar kc-desc-toolbar');
    expect(coreSource).not.toContain('role="dialog" aria-modal="true"');
    expect(coreSource).not.toContain('const KC_CREATE_SCHEMA = _getModules()');
    expect(coreSource).not.toContain('kc-create-visibility-toggle');
  });

  test('ainda contém comentário de extração v11.31.7', () => {
    expect(coreSource).toContain('kc-create-post.render.js (v11.31.7)');
  });
});

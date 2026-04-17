/**
 * @file kc-create-post-contract.test.js
 * @description Static contract tests for assets/js/kc-create-post.js (v11.31.1)
 * Atualizado em v11.31.6: submit pipeline movido para kc-create-post.submit.js;
 * testes de submit agora verificam submitSource.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC        = path.resolve(__dirname, '..', 'assets', 'js', 'kc-create-post.js');
const SUBMIT_SRC = path.resolve(__dirname, '..', 'assets', 'js', 'kc-create-post.submit.js');
let source;
let submitSource;

beforeAll(() => {
  source       = fs.readFileSync(SRC, 'utf8');
  submitSource = fs.readFileSync(SUBMIT_SRC, 'utf8');
});

describe('kc-create-post — source shape', () => {
  test('keeps the current global-script shape before the split begins', () => {
    const preamble = source.slice(0, 220);

    expect(preamble).not.toMatch(/^\s*\(function\s*\(/);
    expect(preamble).not.toContain("'use strict';");
    expect(preamble).not.toContain('"use strict";');
  });

  test('keeps the 4 current global exports intact', () => {
    expect(source).toContain('window.kcOpenCreatePostModal = kcOpenCreatePostModal;');
    expect(source).toContain('window.kcCloseCreatePostModal = kcCloseCreatePostModal;');
    expect(source).toContain('window.kcOpenEditPostModal = kcOpenEditPostModal;');
    expect(source).toContain('window.kcOpenCreatePostModalPrefilled = kcOpenCreatePostModalPrefilled;');
  });
});

describe('kc-create-post — schema and constants', () => {
  test('consumes the extracted schema namespace with a defensive fallback', () => {
    expect(source).toContain('window._KCCreatePost = window._KCCreatePost || {};');
    expect(source).toContain('window._KCCreatePost.schema = window._KCCreatePost.schema || {};');
    expect(source).toContain("const KC_CREATE_MODAL_ID = window._KCCreatePost.schema.modalId || 'kcCreatePostModalOverlay';");
    expect(source).toContain('const KC_POST_VISIBILITY_OPTIONS = window._KCCreatePost.schema.visibilityOptions || Object.freeze([');
    expect(source).toContain('const KC_CREATE_SCHEMA = window._KCCreatePost.schema.modules || Object.freeze({});');
    expect(source).toContain("value: 'community'");
    expect(source).toContain("value: 'public'");
  });

  test('guards the runtime if the extracted schema asset is unavailable', () => {
    expect(source).toContain('let kcCreateSchemaWarningShown = false;');
    expect(source).toContain('function kcHasCreateSchemaLoaded() {');
    expect(source).toContain("console.error('[KinoCampus] kc-create-post schema unavailable.');");
    expect(source).toContain("showToast('Não foi possível carregar o formulário agora. Recarregue a página.', 'error', 2600);");
  });
});

describe('kc-create-post — modal bootstrap contracts', () => {
  test('defines kcEnsureCreateModal with dialog semantics and form shell', () => {
    expect(source).toContain('function kcEnsureCreateModal() {');
    expect(source).toContain("overlay.id = KC_CREATE_MODAL_ID;");
    expect(source).toContain('role="dialog" aria-modal="true" aria-labelledby="kcCreateModalTitle"');
    expect(source).toContain('<form id="kcCreatePostForm" class="kc-create-form" novalidate>');
    expect(source).toContain('<button type="submit" class="kc-create-submit" disabled>Publicar Agora</button>');
  });

  test('wires close confirmation, submit delegation and escape handling in the modal bootstrap', () => {
    expect(source).toContain("window.confirm('Descartar publicação? As informações preenchidas serão perdidas.')");
    expect(source).toContain("form.addEventListener('submit', (e) => {");
    expect(source).toContain('kcHandleCreateSubmit();');
    expect(source).toContain("if (e.key === 'Escape' && kcCreateState.open) kcCloseCreatePostModal();");
  });
});

describe('kc-create-post — render and active-field pipeline', () => {
  test('keeps the active-field derivation helpers connected to the field builder', () => {
    expect(source).toContain('function kcCaptureCreateValues() {');
    expect(source).toContain('function kcGetActiveCreateFieldNames(moduleKey, selections, values) {');
    expect(source).toContain('const fields = kcBuildFieldsForModule(moduleKey, selections || {}, values || {});');
    expect(source).toContain('function kcReadActiveCreateValue(activeFieldNames, values, name, fallback) {');
  });

  test('defines kcRenderCreateModal on top of schema, visibility and dynamic builders', () => {
    expect(source).toContain('function kcRenderCreateModal() {');
    expect(source).toContain('if (!kcHasCreateSchemaLoaded()) return;');
    expect(source).toContain('Object.keys(KC_CREATE_SCHEMA).forEach((key) => {');
    expect(source).toContain('const fields = kcBuildFieldsForModule(kcCreateState.moduleKey, kcCreateState.selections, kcCreateState.values);');
    expect(source).toContain('parts.push(kcCreateVisibilitySectionHtml());');
    expect(source).toContain('parts.push(kcCreateImagesSectionHtml());');
    expect(source).toContain('parts.push(kcCreateSustainSectionHtml());');
  });
});

describe('kc-create-post — create/edit flow contracts', () => {
  test('keeps open/edit flow bound to auth checks and overlay lock', () => {
    expect(source).toContain('function kcOpenCreatePostModal(prefModuleKey) {');
    expect(source).toContain("const currentUser = window.KCSupabase && typeof window.KCSupabase.getUser === 'function'");
    expect(source).toContain("if (window.KCOverlayLock && typeof window.KCOverlayLock.lock === 'function') {");
    expect(source).toContain("window.KCOverlayLock.lock('create-post-modal');");
    expect(source).toContain('function kcOpenEditPostModal(post, callback) {');
    expect(source).toContain('if (!kcHasCreateSchemaLoaded()) return kcNotifyCreateSchemaUnavailable();');
    expect(source).toContain('kcCreateState.editMode = true;');
    expect(source).toContain("kcCreateState.editPostId = String(post.uuid || post.id || post.legacyId || '');");
  });

  test('keeps close flow resetting edit state and unlocking overlays', () => {
    expect(source).toContain('function kcCloseCreatePostModal() {');
    expect(source).toContain('kcCreateState.editMode = false;');
    expect(source).toContain('kcCreateState.editPostId = null;');
    expect(source).toContain("window.KCOverlayLock.unlock('create-post-modal');");
  });
});

describe('kc-create-post — submit pipeline contracts', () => {
  // v11.31.6: submit pipeline extraído para kc-create-post.submit.js → verificar submitSource
  test('defines kcHandleCreateSubmit as the central async submit entrypoint', () => {
    // stub no core mantém o nome; implementação está em submitSource
    expect(source).toContain('async function kcHandleCreateSubmit()');
    expect(submitSource).toContain('async function handleCreateSubmit()');
    expect(submitSource).toContain('const activeFieldNames = kcGetActiveCreateFieldNames(');
    expect(submitSource).toContain("const activeVisibility = kcReadActiveCreateValue(activeFieldNames, kcCreateState.values, 'visibility', kcCreateState.editMode ? 'public' : 'community');");
    expect(submitSource).toContain('const payload = {');
  });

  test('keeps the critical runtime integrations used by create and edit', () => {
    expect(submitSource).toContain('if (KCAPI && typeof KCAPI.updatePost === \'function\') {');
    expect(submitSource).toContain('const hasApiCreatePost = !!((window.KCActions && typeof window.KCActions.createPost === \'function\') || (KCAPI && typeof KCAPI.createPost === \'function\'));');
    expect(submitSource).toContain('if (KCAPI && typeof KCAPI.checkDuplicatePost === \'function\') {');
    expect(submitSource).toContain('if (KCAPI && typeof KCAPI.getLastCreatePostError === \'function\') {');
    expect(submitSource).toContain('const kcClient = KCSupabase && typeof KCSupabase.getClient === \'function\'');
  });

  test('keeps duplicate-check, audit-log and redirect contracts in the submit pipeline', () => {
    expect(submitSource).toContain("kcClient.from('audit_log').insert({");
    expect(submitSource).toContain("action: 'post_created'");
    expect(submitSource).toContain('window.location.href = targetUrl;');
    expect(submitSource).toContain("showToast('Publicado com sucesso!', 'success', 2200);");
  });
});

describe('kc-create-post — side channels and bootstrap', () => {
  test('keeps the known global history side channels explicit in the source', () => {
    // v11.31.6: side channels agora estão no submit module
    expect(submitSource).toContain('window.__KC_OPPORTUNITY_AREA_HISTORY');
    expect(submitSource).toContain('window.__KC_HOUSING_REGION_HISTORY');
    expect(submitSource).toContain('window.__KC_HOUSING_FEATURE_HISTORY');
    expect(submitSource).toContain('window.__KC_LOST_FOUND_LOCATION_HISTORY');
  });

  test('keeps the trigger bootstrap and DOMContentLoaded wiring intact', () => {
    expect(source).toContain('function kcInitCreatePostTriggers() {');
    expect(source).toContain("const trigger = e.target.closest('a[href=\"create-post.html\"], .kc-create-btn, .kc-create-post-btn');");
    expect(source).toContain('const mod = kcGetModuloFilterForPage();');
    expect(source).toContain("document.addEventListener('DOMContentLoaded', function () {");
    expect(source).toContain('kcInitCreatePostTriggers();');
  });

  test('keeps the prefilled entrypoint contract for Criar parecido', () => {
    expect(source).toContain('function kcOpenCreatePostModalPrefilled(moduleKey, selections) {');
    expect(source).toContain('kcCreateState.selections = (selections && typeof selections === \'object\') ? Object.assign({}, selections) : {};');
    expect(source).toContain('return kcOpenCreatePostModal(moduleKey);');
  });
});

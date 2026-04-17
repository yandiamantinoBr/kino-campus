/**
 * @file kc-create-post-contract.test.js
 * @description Static contract tests for assets/js/kc-create-post.js (v11.31.1)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', 'assets', 'js', 'kc-create-post.js');
let source;

beforeAll(() => {
  source = fs.readFileSync(SRC, 'utf8');
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
  test('defines the modal id and the visibility options contract', () => {
    expect(source).toContain("const KC_CREATE_MODAL_ID = 'kcCreatePostModalOverlay';");
    expect(source).toContain('const KC_POST_VISIBILITY_OPTIONS = Object.freeze([');
    expect(source).toContain("value: 'community'");
    expect(source).toContain("value: 'public'");
  });

  test('keeps the 6 module schemas in KC_CREATE_SCHEMA', () => {
    expect(source).toContain("const KC_CREATE_SCHEMA = {");
    expect(source).toContain("'compra-venda': {");
    expect(source).toContain("'caronas': {");
    expect(source).toContain("'moradia': {");
    expect(source).toContain("'eventos': {");
    expect(source).toContain("'achados-perdidos': {");
    expect(source).toContain("'oportunidades': {");
  });

  test('keeps the compra-venda category contract including ingressos', () => {
    expect(source).toContain("categoryGroupId: 'categoria'");
    expect(source).toContain("{ key: 'ingressos', label: 'Ingressos' }");
    expect(source).toContain("redirect: 'compra-venda-feed.html'");
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
  test('defines kcHandleCreateSubmit as the central async submit entrypoint', () => {
    expect(source).toContain('async function kcHandleCreateSubmit() {');
    expect(source).toContain('const activeFieldNames = kcGetActiveCreateFieldNames(');
    expect(source).toContain("const activeVisibility = kcReadActiveCreateValue(activeFieldNames, kcCreateState.values, 'visibility', kcCreateState.editMode ? 'public' : 'community');");
    expect(source).toContain('const payload = {');
  });

  test('keeps the critical runtime integrations used by create and edit', () => {
    expect(source).toContain('if (KCAPI && typeof KCAPI.updatePost === \'function\') {');
    expect(source).toContain('const hasApiCreatePost = !!((window.KCActions && typeof window.KCActions.createPost === \'function\') || (KCAPI && typeof KCAPI.createPost === \'function\'));');
    expect(source).toContain('if (KCAPI && typeof KCAPI.checkDuplicatePost === \'function\') {');
    expect(source).toContain('if (KCAPI && typeof KCAPI.getLastCreatePostError === \'function\') {');
    expect(source).toContain('const kcClient = KCSupabase && typeof KCSupabase.getClient === \'function\'');
  });

  test('keeps duplicate-check, audit-log and redirect contracts in the submit pipeline', () => {
    expect(source).toContain("kcClient.from('audit_log').insert({");
    expect(source).toContain("action: 'post_created'");
    expect(source).toContain('window.location.href = targetUrl;');
    expect(source).toContain("showToast('Publicado com sucesso!', 'success', 2200);");
  });
});

describe('kc-create-post — side channels and bootstrap', () => {
  test('keeps the known global history side channels explicit in the source', () => {
    expect(source).toContain('window.__KC_OPPORTUNITY_AREA_HISTORY');
    expect(source).toContain('window.__KC_HOUSING_REGION_HISTORY');
    expect(source).toContain('window.__KC_HOUSING_FEATURE_HISTORY');
    expect(source).toContain('window.__KC_LOST_FOUND_LOCATION_HISTORY');
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

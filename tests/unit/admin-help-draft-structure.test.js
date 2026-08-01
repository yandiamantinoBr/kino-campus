'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const CONTROLLER = fs.readFileSync(
  path.join(ROOT, 'assets/js/controllers/admin/admin-help-requests.controller.js'),
  'utf8'
);
const PAGE = fs.readFileSync(
  path.join(ROOT, 'admin/help-requests.html'),
  'utf8'
);

describe('admin help-requests draft structure', () => {
  test('keeps sensitive drafts in memory across renderRows wipe', () => {
    expect(CONTROLLER).toContain('ADMIN_HELP_DRAFT_KEY');
    expect(CONTROLLER).toContain('captureAllVisibleCardDrafts');
    expect(CONTROLLER).toContain('applyAllVisibleCardDrafts');
    expect(CONTROLLER).toContain('flushAdminDraftSave');
    expect(CONTROLLER).toContain('restoreAdminFiltersFromDraft');
    expect(CONTROLLER).toContain('scheduleAdminDraftRestore');
    expect(CONTROLLER).toContain('markAdminDraftFieldDirty');
    expect(CONTROLLER).toContain('mergeTicketDraft');
  });

  test('renderRows snapshots then restores operator fields', () => {
    const idx = CONTROLLER.indexOf('function renderRows');
    expect(idx).toBeGreaterThan(0);
    const end = CONTROLLER.indexOf('function unwrapRowsResponse', idx);
    const slice = CONTROLLER.slice(idx, end > idx ? end : idx + 8000);
    expect(slice).toContain('captureAllVisibleCardDrafts');
    expect(slice).toContain('scheduleAdminDraftRestore');
    expect(slice).toContain('list.innerHTML = cards.join');
  });

  test('persists only safe preferences and purges legacy PII storage', () => {
    expect(CONTROLLER).toContain('sessionStorage');
    expect(CONTROLLER).toContain("ADMIN_HELP_DRAFT_KEY = 'kc_admin_help_preferences_v2'");
    expect(CONTROLLER).toContain("'kc_admin_help_draft_v1'");
    expect(CONTROLLER).toContain('ADMIN_HELP_DRAFT_TTL_MS');
    expect(CONTROLLER).toContain('adminDraftDirty');
    expect(CONTROLLER).toContain('adminFiltersDirty');
    expect(CONTROLLER).not.toContain('localStorage.setItem');
    expect(CONTROLLER).not.toContain('localStorage.getItem');
    const writeStart = CONTROLLER.indexOf('function adminDraftStorageWrite');
    const writeEnd = CONTROLLER.indexOf('function isBlankDraftValue', writeStart);
    const writeSlice = CONTROLLER.slice(writeStart, writeEnd);
    expect(writeSlice).not.toContain('tickets: tickets');
    expect(writeSlice).not.toContain('query:');
  });

  test('restores filters after auth wipe and does not double-paint loadRows success', () => {
    const reauthIdx = CONTROLLER.indexOf('async function reauthorizeAdminView');
    expect(reauthIdx).toBeGreaterThan(0);
    const reauthSlice = CONTROLLER.slice(reauthIdx, reauthIdx + 1200);
    expect(reauthSlice).toContain('clearSensitiveAdminState');
    expect(reauthSlice).toContain('restoreAdminFiltersFromDraft');

    const loadIdx = CONTROLLER.indexOf('async function loadRows');
    expect(loadIdx).toBeGreaterThan(0);
    const loadEnd = CONTROLLER.indexOf('async function saveRow', loadIdx);
    const loadSlice = CONTROLLER.slice(loadIdx, loadEnd > loadIdx ? loadEnd : loadIdx + 4000);
    // Success path must render once (in finally), not try+finally.
    const successRenders = (loadSlice.match(/if \(!loadFailed\) renderRows/g) || []).length;
    expect(successRenders).toBe(1);
    expect(loadSlice).toContain('Single paint path');
  });

  test('cache-busts hardened controller and adapter on admin page', () => {
    expect(PAGE).toContain('admin-help-requests.controller.js?v=8.6.24');
    expect(PAGE).toContain('supabase.admin.adapter.js?v=8.6.15');
  });

  test('soft reauth restores preferences without caching or prepainting queue PII', () => {
    expect(CONTROLLER).toContain('ADMIN_HELP_VIEW_KEY');
    expect(CONTROLLER).toContain('saveAdminViewSnapshot');
    expect(CONTROLLER).toContain('restoreAdminViewSnapshotPaint');
    expect(CONTROLLER).toContain('reauthorizeAdminView({ soft: true })');
    expect(CONTROLLER).toMatch(/showLoading\(true,\s*\{\s*silent:/);
    expect(CONTROLLER).toContain('silent: keepPaint');
    const saveStart = CONTROLLER.indexOf('function saveAdminViewSnapshot');
    const saveEnd = CONTROLLER.indexOf('function readAdminViewSnapshot', saveStart);
    const saveSlice = CONTROLLER.slice(saveStart, saveEnd);
    expect(saveSlice).not.toContain('rows: state.rows');
    expect(saveSlice).not.toContain('admin_user_id');
    expect(saveSlice).not.toContain('query:');
    const restoreStart = CONTROLLER.indexOf('function restoreAdminViewSnapshotPaint');
    const restoreEnd = CONTROLLER.indexOf('function clearSensitiveAdminState', restoreStart);
    const restoreSlice = CONTROLLER.slice(restoreStart, restoreEnd);
    expect(restoreSlice).not.toContain('renderRows(');
    expect(restoreSlice).not.toContain('state.isAuthorized =');
  });

  test('chip triage auto-saves without Salvar triagem button', () => {
    expect(CONTROLLER).toContain('buildStatusTriageChips');
    expect(CONTROLLER).toContain('buildPriorityTriageChips');
    expect(CONTROLLER).toContain('data-help-status-set');
    expect(CONTROLLER).toContain('data-help-priority-set');
    expect(CONTROLLER).toContain('setCardTriageUi');
    expect(CONTROLLER).toContain('async function saveRow(card, overrides = {})');
    expect(CONTROLLER).toContain('kc-admin-help-triage');
    expect(CONTROLLER).not.toMatch(/data-help-save><i class="fas fa-floppy-disk"/);
    expect(CONTROLLER).toMatch(/attr === 'data-help-status' \|\| attr === 'data-help-priority'\) return/);
    expect(PAGE).toContain('kc-admin-help-chip--interactive');
    expect(PAGE).toContain('kc-admin-help-triage');
  });

  test('keeps the seven-step closure guidance and a usable narrow layout', () => {
    expect(CONTROLLER).toContain('Conclua a entrega do comprovante na etapa 6');
    expect(CONTROLLER).toContain('marcar o ticket como Resolvido na etapa 7');
    expect(CONTROLLER).not.toContain('Não marque o ticket como Resolvido antes da etapa 5');
    expect(CONTROLLER).toContain(
      'Ainda não aplicável — o comprovante é enviado após a exclusão'
    );
    expect(PAGE).toContain('@media (max-width: 640px)');
    expect(PAGE).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(PAGE).toContain('.kc-admin-lgpd-danger { grid-template-columns: 1fr; }');
    expect(PAGE).toContain('.kc-admin-lgpd-panel button { min-height: 44px; }');
  });
});

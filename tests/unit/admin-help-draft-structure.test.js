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
  test('persists drafts across renderRows wipe and leave/return', () => {
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

  test('uses dual storage, dirty capture and TTL', () => {
    expect(CONTROLLER).toContain('sessionStorage');
    expect(CONTROLLER).toContain('localStorage');
    expect(CONTROLLER).toContain('ADMIN_HELP_DRAFT_TTL_MS');
    expect(CONTROLLER).toContain('adminDraftDirty');
    expect(CONTROLLER).toContain('adminFiltersDirty');
    expect(CONTROLLER).toMatch(/empty DOM rebuilds[\s\S]{0,80}cannot wipe|cannot wipe operator typing/);
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

  test('cache-busts controller to 8.6.23 on admin page', () => {
    expect(PAGE).toContain('admin-help-requests.controller.js?v=8.6.23');
  });

  test('soft reauth keeps queue painted on leave/return', () => {
    expect(CONTROLLER).toContain('ADMIN_HELP_VIEW_KEY');
    expect(CONTROLLER).toContain('saveAdminViewSnapshot');
    expect(CONTROLLER).toContain('restoreAdminViewSnapshotPaint');
    expect(CONTROLLER).toContain('reauthorizeAdminView({ soft: true })');
    expect(CONTROLLER).toMatch(/showLoading\(true,\s*\{\s*silent:/);
    expect(CONTROLLER).toContain('silent: keepPaint');
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
});

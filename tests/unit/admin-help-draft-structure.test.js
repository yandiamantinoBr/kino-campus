'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const CONTROLLER = fs.readFileSync(
  path.join(ROOT, 'assets/js/controllers/admin/admin-help-requests.controller.js'),
  'utf8'
);

describe('admin help-requests draft structure', () => {
  test('persists drafts across renderRows wipe and leave/return', () => {
    expect(CONTROLLER).toContain('ADMIN_HELP_DRAFT_KEY');
    expect(CONTROLLER).toContain('captureAllVisibleCardDrafts');
    expect(CONTROLLER).toContain('applyAllVisibleCardDrafts');
    expect(CONTROLLER).toContain('flushAdminDraftSave');
    expect(CONTROLLER).toContain('restoreAdminFiltersFromDraft');
  });

  test('renderRows snapshots then restores operator fields', () => {
    const idx = CONTROLLER.indexOf('function renderRows');
    expect(idx).toBeGreaterThan(0);
    const end = CONTROLLER.indexOf('function unwrapRowsResponse', idx);
    const slice = CONTROLLER.slice(idx, end > idx ? end : idx + 8000);
    expect(slice).toContain('captureAllVisibleCardDrafts');
    expect(slice).toContain('applyAllVisibleCardDrafts');
    expect(slice).toContain('list.innerHTML = cards.join');
  });

  test('uses dual storage and TTL', () => {
    expect(CONTROLLER).toContain('sessionStorage');
    expect(CONTROLLER).toContain('localStorage');
    expect(CONTROLLER).toContain('ADMIN_HELP_DRAFT_TTL_MS');
  });
});

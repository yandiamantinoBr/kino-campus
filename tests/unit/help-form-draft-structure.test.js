'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
describe('help.controller form draft structure', () => {
  const code = fs.readFileSync(
    path.join(ROOT, 'assets/js/controllers/public/help.controller.js'),
    'utf8'
  );
  test('exposes draft save/restore lifecycle', () => {
    expect(code).toContain('HELP_FORM_DRAFT_KEY');
    expect(code).toContain('saveHelpFormDraft');
    expect(code).toContain('restoreHelpFormDraft');
    expect(code).toContain('clearHelpFormDraft');
    expect(code).toContain('scheduleHelpFormDraftSave');
    expect(code).toContain('flushHelpFormDraftSave');
    expect(code).toContain('draftStorageWrite');
    expect(code).toContain('localStorage');
  });
  test('hard-resets form only when switching between two signed-in accounts', () => {
    expect(code).toMatch(/previousUserId && userId && previousUserId !== userId/);
    expect(code).toContain('restoreHelpFormDraft({ announce: true })');
  });
  test('empty auto-save does not wipe stored drafts', () => {
    expect(code).toContain('forceClearEmpty');
    expect(code).toMatch(/forceClearEmpty === true[\s\S]{0,40}clearHelpFormDraft/);
  });
  test('clears draft on successful submit and explicit reset', () => {
    const submitIdx = code.indexOf('Pedido enviado com sucesso');
    const clearAfter = code.indexOf('clearHelpFormDraft', submitIdx);
    expect(clearAfter).toBeGreaterThan(submitIdx);
    expect(code).toContain('handleReset');
  });
});

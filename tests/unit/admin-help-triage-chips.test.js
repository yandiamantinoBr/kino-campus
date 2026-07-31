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

describe('admin help-requests chip triage UX', () => {
  test('renders interactive status and priority chips instead of Salvar triagem', () => {
    expect(CONTROLLER).toContain('function buildStatusTriageChips');
    expect(CONTROLLER).toContain('function buildPriorityTriageChips');
    expect(CONTROLLER).toContain('data-help-status-set=');
    expect(CONTROLLER).toContain('data-help-priority-set=');
    expect(CONTROLLER).toContain('kc-admin-help-chip--interactive');
    expect(CONTROLLER).toContain('kc-admin-help-triage');
    expect(CONTROLLER).toContain('Clique em um chip para salvar a triagem automaticamente.');
    expect(CONTROLLER).not.toMatch(/button type="button" data-help-save/);
    expect(CONTROLLER).not.toContain('Salvar triagem');
  });

  test('auto-saves via saveRow overrides with optimistic UI and busy lock', () => {
    expect(CONTROLLER).toContain('async function saveRow(card, overrides = {})');
    expect(CONTROLLER).toContain('function setCardTriageUi');
    expect(CONTROLLER).toContain('function readCardTriageValues');
    expect(CONTROLLER).toContain('state.triageBusy');
    expect(CONTROLLER).toContain('is-triage-saving');
    expect(CONTROLLER).toContain('silent: true');
    expect(CONTROLLER).toMatch(/data-help-status-set.*data-help-priority-set/s);
  });

  test('keeps LGPD close guard on resolved/archived chip clicks', () => {
    const idx = CONTROLLER.indexOf('async function saveRow');
    expect(idx).toBeGreaterThan(0);
    const slice = CONTROLLER.slice(idx, idx + 4500);
    expect(slice).toContain("status === 'resolved' || status === 'archived'");
    expect(slice).toContain('isLgpdErasureRequest');
    expect(slice).toContain('Deseja continuar mesmo assim?');
  });

  test('does not rehydrate triage from drafts (server/chips are source of truth)', () => {
    expect(CONTROLLER).toMatch(
      /attr === 'data-help-status' \|\| attr === 'data-help-priority'\) return/
    );
  });

  test('page styles interactive triage chips and cache-busts assets', () => {
    expect(PAGE).toContain('kc-admin-help-chip--interactive');
    expect(PAGE).toContain('kc-admin-help-triage');
    expect(PAGE).toContain('admin-help-requests.controller.js?v=8.6.20');
    expect(PAGE).toContain('admin-shell.css?v=8.6.13');
  });
});

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
    expect(slice).toContain('getErasureCompletionState');
    expect(slice).toContain('completionState.flowComplete');
    expect(slice).toContain('Fechamento bloqueado');
    expect(slice).not.toContain('Deseja continuar mesmo assim?');
  });

  test('does not rehydrate triage from drafts (server/chips are source of truth)', () => {
    expect(CONTROLLER).toMatch(
      /attr === 'data-help-status' \|\| attr === 'data-help-priority'\) return/
    );
  });

  test('page styles interactive triage chips and cache-busts assets', () => {
    expect(PAGE).toContain('kc-admin-help-chip--interactive');
    expect(PAGE).toContain('kc-admin-help-triage');
    expect(PAGE).toContain('admin-help-requests.controller.js?v=8.6.28');
    expect(PAGE).toContain('admin-shell.css?v=8.6.12');
    expect(PAGE).toContain('is-triage-leaving');
    expect(PAGE).toContain('kc-admin-help-identity');
    expect(PAGE).toContain('kc-admin-help-ticket-ref');
  });

  test('neutralizes the desktop triage flex basis on mobile', () => {
    expect(PAGE).toMatch(
      /@media \(max-width: 640px\)[\s\S]*\.kc-admin-help-chips--triage\s*\{[\s\S]*flex:\s*0 1 auto;[\s\S]*width:\s*100%;/
    );
    expect(PAGE).toMatch(
      /@media \(max-width: 640px\)[\s\S]*\.kc-admin-help-chip--interactive\s*\{\s*min-height:\s*44px;/
    );
  });

  test('supports summary filter shortcuts and clear-filters control', () => {
    expect(CONTROLLER).toContain('function applyQueueFilters');
    expect(CONTROLLER).toContain('function clearQueueFilters');
    expect(CONTROLLER).toContain('data-help-filter-shortcut');
    expect(CONTROLLER).toContain('state.triageJustSaved');
    expect(PAGE).toContain('helpClearFiltersButton');
    expect(PAGE).toContain('Limpar filtros');
  });

  test('chip auto-save stays quiet (no success toast spam)', () => {
    const idx = CONTROLLER.indexOf('async function saveRow');
    expect(idx).toBeGreaterThan(0);
    const slice = CONTROLLER.slice(idx, idx + 8000);
    expect(slice).not.toContain('Triagem atualizada.');
    expect(slice).not.toContain('O pedido saiu do filtro atual');
    expect(CONTROLLER).toContain('function cardMatchesActiveTriageFilters');
    expect(slice).toContain('is-triage-leaving');
    expect(slice).toContain('statusMessage:');
    expect(slice).toContain('Chip auto-save is high-frequency: no success toast');
    // Errors and LGPD warn still toast.
    expect(slice).toContain("showToast('Não foi possível salvar a triagem.', 'error')");
    expect(slice).toContain('Fechamento bloqueado');
  });

  test('exposes ticket identity and blocks archive on open data-export DSR', () => {
    expect(CONTROLLER).toContain('function getHelpTicketIdentity');
    expect(CONTROLLER).toContain('function buildHelpIdentityBlock');
    expect(CONTROLLER).toContain('function isOpenDataExportHelpRequest');
    expect(CONTROLLER).toContain('function friendlyTriageErrorMessage');
    expect(CONTROLLER).toContain('DSR_HELP_MUST_REMAIN_OPEN');
    expect(CONTROLLER).toContain('ID do ticket');
    expect(CONTROLLER).toContain('data-help-copy');
    expect(CONTROLLER).toContain('data-help-status-locked');
    expect(CONTROLLER).toContain('isOpenDataExportHelpRequest(row)');
    expect(CONTROLLER).toMatch(/buildStatusTriageChips\(statusValue,\s*\{/);
  });

  test('visually locks erasure close chips until authoritative completion', () => {
    expect(CONTROLLER).toContain('function getErasureCloseGuard');
    expect(CONTROLLER).toContain('completionState.flowComplete || completionState.cancelled');
    expect(CONTROLLER).toContain('const closeLocked = exportCloseLocked || erasureCloseGuard.locked');
    expect(CONTROLLER).toContain('o núcleo foi excluído, mas a entrega do comprovante final ainda não foi comprovada');
    expect(CONTROLLER).toContain('closeLocked: closeLocked');
    expect(CONTROLLER).toContain('ERASURE_HELP_MUST_REMAIN_OPEN');
    expect(CONTROLLER).toContain('até o cancelamento formal ou até o servidor comprovar a entrega do recibo final');
  });

  test('preserva chips bloqueados depois de salvar outra dimensão da triagem', () => {
    expect(CONTROLLER).toContain("const locked = button.getAttribute('data-help-status-locked') === '1'");
    expect(CONTROLLER).toContain('const disabled = saving || locked');
    expect(CONTROLLER).toContain("button.setAttribute('aria-disabled', disabled ? 'true' : 'false')");
    expect(CONTROLLER).toContain("const disabled = button.getAttribute('data-help-status-locked') === '1'");
  });

  test('exibe estado operacional de acesso externo e navega sem decidir automaticamente', () => {
    expect(CONTROLLER).toContain('function buildExternalAccessPanel');
    expect(CONTROLLER).toContain('Fluxo de acesso externo');
    expect(CONTROLLER).toContain('Abrir decisões de acesso');
    expect(CONTROLLER).toContain("window.location.assign('moderation.html?section=external-access')");
    expect(CONTROLLER).not.toMatch(/openExternalAccessWorkflow[\s\S]{0,500}(approve|reject|decideExternalAccess)/i);
  });

  test('prepara para o Cadu somente contexto operacional efêmero e sem PII', () => {
    const start = CONTROLLER.indexOf('function prepareCaduHelpAnalysis');
    const end = CONTROLLER.indexOf('function renderSummary', start);
    const handoff = CONTROLLER.slice(start, end);
    expect(handoff).toContain('sem dados pessoais');
    expect(handoff).toContain('Não execute ações');
    expect(handoff).toContain("window.location.assign('cadu.html?tab=openclaw&source=help-requests')");
    expect(handoff).not.toContain('contact_email');
    expect(handoff).not.toContain('message');
    expect(handoff).not.toContain('row.id');
    expect(CONTROLLER).toContain('expiresAt: Date.now() + ADMIN_HANDOFF_TTL_MS');
  });

  test('envia versão observada para impedir sobrescrita por outra sessão administrativa', () => {
    expect(CONTROLLER).toContain('expected_updated_at: currentRow && currentRow.updated_at');
    expect(CONTROLLER).toContain("resultCode.indexOf('HELP_REQUEST_STALE') >= 0");
    expect(CONTROLLER).toContain('await loadRows({');
  });
});

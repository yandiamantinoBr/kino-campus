'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const controller = fs.readFileSync(
  path.join(
    ROOT,
    'assets',
    'js',
    'controllers',
    'admin',
    'admin-help-requests.controller.js',
  ),
  'utf8',
);

describe('admin data-export supplement controls', () => {
  test('não apresenta falha de consulta da fila como zero solicitações', () => {
    expect(controller).toContain('if (result && result.ok === false)');
    expect(controller).toContain('function renderUnavailable()');
    expect(controller).toContain('Os totais exibidos não representam o estado atual');
    expect(controller).toContain('if (state.rows.length) renderRows(state.rows)');
    expect(controller).toContain('if (!loadFailed) renderRows(state.rows)');
  });

  test('serializes actions and always restores an operable panel', () => {
    expect(controller).toContain('exportSupplementBusy: {}');
    expect(controller).toContain('state.exportSupplementBusy[id] === true');
    expect(controller).toContain("const allowedActions = ['link_verified_ticket', 'diagnose', 'record_processor', 'build', 'retry', 'purge']");
    expect(controller).toContain("delete state.exportSupplementBusy[id]");
    expect(controller).toContain("if (nextFocus && typeof nextFocus.focus === 'function') nextFocus.focus()");
    expect(controller).toContain('aria-busy="true"');
  });

  test('only offers destructive purge for backend-compatible terminal states', () => {
    expect(controller).toContain('const purgeEligible = isDataExportPurgeEligible(');
    expect(controller).toContain("['failed', 'expired', 'delivered'].includes(normalized)");
    expect(controller).toContain(
      "['ready', 'download_reserved'].includes(normalized) && expired",
    );
    expect(controller).toContain("action === 'purge'");
    expect(controller).toContain('window.confirm');
    expect(controller).toContain('Esta ação não pode ser desfeita.');
    expect(controller).toContain("mutationDisabled || !purgeEligible ? ' disabled' : ''");
  });

  test('does not promise delivery merely because an artifact build returned', () => {
    expect(controller).toContain(
      'Complemento privado íntegro e disponível foi confirmado.',
    );
    expect(controller).not.toContain(
      'Complemento privado gerado; aguarde o download do titular.',
    );
  });

  test('lets an administrator identity-link a canonical help ticket before supplement work', () => {
    expect(controller).toContain('function getDataExportRequestKind(row)');
    expect(controller).toContain("subtopic === 'account_data_copy'");
    expect(controller).toContain("subtopic === 'account_data_portability'");
    expect(controller).toContain('data-export-identity-link');
    expect(controller).toContain('data-export-action="link_verified_ticket"');
    expect(controller).toContain('payload.identity_verified_at = new Date(verifiedAtMs).toISOString()');
    expect(controller).toContain('payload.identity_attested = true');
    expect(controller).toContain('identityReference.length < 8');
    expect(controller).toContain('metadata.data_subject_request_id');
    expect(controller).toContain('function hasCanonicalDataExportLink(row)');
    expect(controller).toContain("UUID_RE.test(String(row && row.user_id || '').trim())");
    expect(controller).toContain("UUID_RE.test(String(metadata.data_subject_request_id || '').trim())");
    expect(controller).toContain('async function reconcileExportMutation(');
    expect(controller).toContain('committed: hasCanonicalDataExportLink(row)');
    expect(controller).toContain('async function settleExportMutationResult(');
    expect(controller).toContain('async function loadHelpRequestById(');
    expect(controller).not.toMatch(/result\.linked\s*===\s*true/);
    expect(controller).toContain("return String(value == null ? '' : value).replace(/[&<>\"']/g");
    expect(controller).toContain('exportSupplementUncertain: {}');
    expect(controller).toContain('markExportOutcomeUncertain(id, action)');
    expect(controller).toContain('state.exportSupplementUncertain[id]');
  });

  test('labels external processor delivery accurately and requires attestation', () => {
    expect(controller).toContain(
      'Entregue fora da plataforma (não incluído no JSON)',
    );
    expect(controller).toContain('value="supplied_out_of_band"');
    expect(controller).toContain('data-export-delivery-channel');
    expect(controller).toContain('data-export-delivered-at');
    expect(controller).toContain('data-export-delivery-attested');
    expect(controller).toContain('payload.delivery_attested = true');
    expect(controller).not.toContain('Dados fornecidos/incluídos');
  });
});

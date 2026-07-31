'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const CONTROLLER = fs.readFileSync(
  path.join(ROOT, 'assets/js/controllers/admin/admin-help-requests.controller.js'),
  'utf8'
);
const MIGRATION = fs.readFileSync(
  path.join(
    ROOT,
    'supabase/migrations/20260731193000_materialize_dsr_for_authenticated_legacy_help.sql'
  ),
  'utf8'
);

describe('admin LGPD legacy authenticated ticket gate', () => {
  test('offers protocol link for authenticated tickets missing DSR', () => {
    expect(CONTROLLER).toContain('function needsErasureProtocolLink');
    expect(CONTROLLER).toContain('Criar protocolo e destravar fluxo LGPD');
    expect(CONTROLLER).toContain('Pedido legado autenticado');
    // Must not require user_id to be empty anymore
    expect(CONTROLLER).not.toMatch(
      /canOfferErasureIdentityLink[\s\S]{0,200}!String\(row && row\.user_id/
    );
  });

  test('link_verified_identity action accepts authenticated legacy tickets', () => {
    // Regression: Christian@UFG tickets have user_id set but no DSR. The old
    // guard rejected any row with user_id before the RPC could materialize.
    expect(CONTROLLER).not.toMatch(
      /action === 'link_verified_identity'[\s\S]{0,120}String\(row\.user_id \|\| ''\)\.trim\(\)/
    );
    expect(CONTROLLER).toContain("action === 'link_verified_identity'");
    expect(CONTROLLER).toContain('canOfferErasureIdentityLink(row)');
    expect(CONTROLLER).toContain(
      'Informe o e-mail exato da conta do titular para protocolar o pedido.'
    );
  });

  test('canonical deletion tuple is accepted without request_kind', () => {
    expect(CONTROLLER).toContain(
      "(!requestKind || requestKind === 'account_erasure')"
    );
  });

  test('migration materializes DSR for authenticated legacy help', () => {
    expect(MIGRATION).toContain('kc_materialize_anonymous_erasure_dsr');
    expect(MIGRATION).toContain('v_was_authenticated_help');
    expect(MIGRATION).toContain('Solicitacao legada autenticada protocolada');
    // Old hard stop must not remain
    expect(MIGRATION).not.toMatch(
      /if v_help\.user_id is not null then[\s\S]{0,120}ERASURE_IDENTITY_DSR_NOT_UNIQUE/
    );
  });
});

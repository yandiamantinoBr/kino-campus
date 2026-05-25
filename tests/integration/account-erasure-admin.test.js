'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const MIGRATION = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260525143000_lgpd_account_erasure_requests.sql'), 'utf8');
const EDGE = fs.readFileSync(path.join(ROOT, 'supabase/functions/kc-account-erasure/index.ts'), 'utf8');
const EMAIL_TEMPLATE = fs.readFileSync(path.join(ROOT, 'supabase/templates/kino-account-erasure-confirmation-email.html'), 'utf8');
const HELP_HTML = fs.readFileSync(path.join(ROOT, 'admin/help-requests.html'), 'utf8');
const HELP_CONTROLLER = fs.readFileSync(path.join(ROOT, 'assets/js/controllers/admin/admin-help-requests.controller.js'), 'utf8');
const RUNBOOK = fs.readFileSync(path.join(ROOT, 'docs/privacy/account-erasure-runbook.md'), 'utf8');

describe('LGPD account erasure - schema e seguranca', () => {
  test('cria tabela admin-only sem coluna de e-mail bruto', () => {
    expect(MIGRATION).toContain('create table if not exists public.account_erasure_requests');
    expect(MIGRATION).toContain('email_hash text not null');
    expect(MIGRATION).not.toMatch(/\bemail text\b/i);
    expect(MIGRATION).toContain('account_erasure_requests_select_admin');
    expect(MIGRATION).toContain('public.kc_is_admin((select auth.uid()))');
  });

  test('mantem estados canonicos do workflow', () => {
    ['diagnosed', 'pending_confirmation', 'reversible_applied', 'erased', 'cancelled', 'failed'].forEach((status) => {
      expect(MIGRATION).toContain(`'${status}'`);
    });
  });
});

describe('LGPD account erasure - Edge Function', () => {
  test('usa service role apenas server-side e valida admin autenticado', () => {
    expect(EDGE).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(EDGE).toContain('auth.getUser()');
    expect(EDGE).toContain(".from(\"profiles\")");
    expect(EDGE).toContain(".select(\"is_admin\")");
  });

  test('implementa as acoes do fluxo e exige frase para erase_confirmed', () => {
    ['diagnose', 'apply_reversible', 'generate_receipt', 'erase_confirmed'].forEach((action) => {
      expect(EDGE).toContain(`"${action}"`);
    });
    expect(EDGE).toContain('EXCLUIR ${opts.email}');
    expect(EDGE).toContain('confirmation_phrase_mismatch');
  });

  test('oculta posts, remove storage e apaga Auth user no final', () => {
    expect(EDGE).toContain('updateOwnedPostsReversible');
    expect(EDGE).toContain('status: "hidden"');
    expect(EDGE).toContain('removeStoragePaths');
    expect(EDGE).toContain('deleteUser(opts.userId)');
    expect(EDGE).toContain('lgpd_erasure_confirmed');
  });
});

describe('LGPD account erasure - admin help UI', () => {
  test('painel LGPD aparece em help-requests e tem os botoes esperados', () => {
    expect(HELP_HTML).toContain('kc-admin-lgpd-panel');
    expect(HELP_CONTROLLER).toContain('function isLgpdErasureRequest');
    [
      'Preparar diagnóstico',
      'Ocultar conta e pedir confirmação',
      'Gerar recibo interno',
      'Exportar relatório LGPD',
      'Executar exclusão confirmada',
    ].forEach((label) => expect(HELP_CONTROLLER).toContain(label));
  });

  test('documenta procedimento manual e confirmacao por e-mail', () => {
    expect(RUNBOOK).toContain('Deleting the Auth user directly');
    expect(RUNBOOK).toContain('CONFIRMO A EXCLUSAO DA MINHA CONTA KINOCAMPUS');
    expect(RUNBOOK).toContain('Rollback is available only before `erase_confirmed`');
  });

  test('mantem template visual versionado para o e-mail LGPD', () => {
    expect(EMAIL_TEMPLATE).toContain('Confirme a remoção da sua conta');
    expect(EMAIL_TEMPLATE).toContain('KinoCampus');
    expect(EMAIL_TEMPLATE).toContain('Comunidade UFG');
    expect(EMAIL_TEMPLATE).toContain('{{ email }}');
    expect(EMAIL_TEMPLATE).toContain('CONFIRMO A EXCLUSÃO DA MINHA CONTA KINOCAMPUS');
  });
});

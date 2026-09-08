'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const edge = read('supabase/functions/kc-external-access-decide/index.ts');
const controller = read('assets/js/controllers/admin/admin-external-access.controller.js');

describe('kc-external-access-decide — fallback de convite aprovado (v9.3.5.7)', () => {
  test('tenta entregar o convite via SMTP direto quando o SMTP do Auth falha', () => {
    expect(edge).toContain('let directSmtpFallback = false;');
    expect(edge).toContain('buildInviteEmail({ requesterName, inviteLink, baseUrl })');
    expect(edge).toContain('[kc-external-access-decide] direct SMTP invite fallback failed; falling back to manual link');
  });

  test('entrega direta marca provider hostinger_smtp_invite_link e limpa smtp_error', () => {
    expect(edge).toContain('"hostinger_smtp_invite_link"');
    expect(edge).toContain('smtp_error: directSmtpFallback ? null : inviteSendError,');
  });

  test('e-mail de convite informa validade de 60 minutos do link', () => {
    expect(edge).toContain('INVITE_LINK_TTL_MINUTES = 60');
    expect(edge).toContain('expira em');
  });

  test('falha total preserva o caminho manual (link_generated) existente', () => {
    expect(edge).toContain('"link_generated"');
    expect(edge).toContain('"supabase_auth_manual_send"');
    expect(edge).toContain('Solicitação aprovada, mas o convite não foi entregue.');
  });
});

describe('UI do painel de acesso externo — mensagem do link manual', () => {
  test('nao alega mais falha fixa do SMTP do Auth', () => {
    expect(controller).not.toContain('O SMTP do Supabase Auth não conseguiu enviar automaticamente');
  });

  test('orienta validade real de 60 minutos e acao de recuperacao', () => {
    expect(controller).toContain('expira em 60 minutos');
    expect(controller).toContain('Recuperar link');
    expect(controller).toContain('contato@kinocampus.com.br');
  });
});

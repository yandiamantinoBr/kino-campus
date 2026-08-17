/**
 * @file auth-card-password-visibility.test.js
 * @description Static contract tests for password visibility and auth link layout.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const AUTH_UI = fs.readFileSync(
  path.join(ROOT, 'assets/js/core/kc-auth.ui.js'),
  'utf8'
);
const STYLES = fs.readFileSync(
  path.join(ROOT, 'assets/css/styles.css'),
  'utf8'
);

describe('auth card - visibilidade de senha', () => {
  test('login, senha e confirmação recebem toggle de visibilidade', () => {
    expect(AUTH_UI).toContain('data-kc-password-toggle="kcAuthLoginPassword"');
    expect(AUTH_UI).toContain('data-kc-password-toggle="kcAuthSignupPassword"');
    expect(AUTH_UI).toContain('data-kc-password-toggle="kcAuthSignupConfirm"');
    expect(AUTH_UI).toContain('function togglePasswordVisibility(button)');
    expect(AUTH_UI).toContain("input.type = show ? 'text' : 'password'");
    expect(AUTH_UI).toContain("button.setAttribute('aria-pressed', show ? 'true' : 'false')");
  });

  test('estrutura do campo de senha preserva autocomplete e espaço para o botão', () => {
    expect(AUTH_UI).toContain('class="kc-auth-field kc-auth-field--password"');
    expect(AUTH_UI).toContain('class="kc-auth-input-wrap"');
    expect(AUTH_UI).toContain('autocomplete="current-password"');
    expect(AUTH_UI).toContain('autocomplete="new-password"');
    expect(STYLES).toContain('.kc-auth-password-toggle');
    expect(STYLES).toContain('padding-right: 48px');
  });
});

describe('auth card - links secundários e responsividade', () => {
  test('links de login e cadastro usam variantes split/quiet/full', () => {
    expect(AUTH_UI).toContain('kc-auth-links kc-auth-links--split');
    expect(AUTH_UI).toContain('kc-auth-link-btn kc-auth-link-btn--inline');
    expect(AUTH_UI).toContain('kc-auth-link-btn kc-auth-link-btn--quiet kc-auth-link-btn--full');
    expect(STYLES).toContain('.kc-auth-links--split');
    expect(STYLES).toContain('.kc-auth-link-btn--inline');
    expect(STYLES).toContain('.kc-auth-link-btn--full');
    expect(STYLES).toContain('overflow-x: hidden');
  });
});

describe('auth card - feedback de cadastro', () => {
  test('mensagem de sucesso do cadastro é exibida após trocar para o painel de reenvio', () => {
    const success = AUTH_UI.indexOf("setStatus(window.KCi18n ? window.KCi18n.t('auth.account-created-email')");
    const panel = AUTH_UI.indexOf("setPanel('resend');");
    expect(success).toBeGreaterThan(-1);
    expect(panel).toBeGreaterThan(-1);
    expect(panel).toBeLessThan(success);
  });
});

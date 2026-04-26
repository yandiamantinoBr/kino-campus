/**
 * Testes estaticos para kc-api.auth.js (v11.33.6)
 *
 * Cobre:
 * - IIFE registra window._KCAPI.auth corretamente
 * - 8 metodos exportados existem
 * - Guards de modo local retornam fallbacks corretos
 * - Delegacao para window.KCSupabase em modo supabase
 * - Validacao de campos obrigatorios (signIn/signUp)
 * - Ordem HTML: auth antes de client, related antes de auth
 */

const fs = require('fs');
const path = require('path');

const AUTH_PATH = path.resolve(__dirname, '../../assets/js/kc-api.auth.js');

describe('kc-api.auth.js — modulo IIFE e namespace', () => {
  test('arquivo existe', () => {
    expect(fs.existsSync(AUTH_PATH)).toBe(true);
  });

  test('usa IIFE com "use strict"', () => {
    const src = fs.readFileSync(AUTH_PATH, 'utf8');
    expect(src).toContain("'use strict'");
    expect(src).toMatch(/\(function\s*\(\s*\)/);
    expect(src).toMatch(/\}\)\(\);/);
  });

  test('registra window._KCAPI.auth', () => {
    const src = fs.readFileSync(AUTH_PATH, 'utf8');
    expect(src).toContain('window._KCAPI = window._KCAPI || {}');
    expect(src).toContain('window._KCAPI.auth = {');
  });

  test('exporta os 8 metodos obrigatorios', () => {
    const src = fs.readFileSync(AUTH_PATH, 'utf8');
    ['getCurrentUser', 'signIn', 'signUp', 'resendConfirmation', 'requestPasswordReset', 'updatePassword', 'login', 'logout']
      .forEach((m) => expect(src).toContain(m));
  });

  test('acessa window.KCSupabase diretamente como global', () => {
    const src = fs.readFileSync(AUTH_PATH, 'utf8');
    expect(src).toContain('window.KCSupabase');
  });

  test('usa deps.ENV para guard de modo local via getEnvDriver', () => {
    const src = fs.readFileSync(AUTH_PATH, 'utf8');
    expect(src).toContain('getEnvDriver');
    expect(src).toContain("!== 'supabase'");
  });
});

describe('kc-api.auth.js — fallbacks em modo local', () => {
  let auth;

  beforeAll(() => {
    global.window = global.window || {};
    window._KCAPI = window._KCAPI || {};
    require('../../assets/js/kc-api.auth.js');
    auth = window._KCAPI.auth;
  });

  const localDeps = { ENV: { driver: 'local' } };

  test('getCurrentUser retorna null em modo local', async () => {
    expect(await auth.getCurrentUser(localDeps)).toBeNull();
  });

  test('signIn retorna erro em modo local', async () => {
    const r = await auth.signIn('a@b.com', '123456', localDeps);
    expect(r.user).toBeNull();
    expect(r.error).toBeTruthy();
  });

  test('signUp retorna erro em modo local', async () => {
    const r = await auth.signUp('a@b.com', '123456', {}, localDeps);
    expect(r.user).toBeNull();
    expect(r.error).toBeTruthy();
  });

  test('resendConfirmation retorna ok:false em modo local', async () => {
    const r = await auth.resendConfirmation('a@b.com', {}, localDeps);
    expect(r.ok).toBe(false);
  });

  test('requestPasswordReset retorna ok:false em modo local', async () => {
    const r = await auth.requestPasswordReset('a@b.com', {}, localDeps);
    expect(r.ok).toBe(false);
  });

  test('updatePassword retorna ok:false em modo local', async () => {
    const r = await auth.updatePassword('novaSenha', localDeps);
    expect(r.ok).toBe(false);
  });

  test('logout retorna false em modo local', async () => {
    expect(await auth.logout(localDeps)).toBe(false);
  });

  test('login retorna null em modo local', async () => {
    expect(await auth.login('a@b.com', '123456', localDeps)).toBeNull();
  });
});

describe('kc-api.auth.js — delegacao ao KCSupabase', () => {
  let auth;

  beforeEach(() => {
    auth = window._KCAPI.auth;
  });

  afterEach(() => {
    delete window.KCSupabase;
  });

  const supaDeps = { ENV: { driver: 'supabase' } };

  test('getCurrentUser delega ao KCSupabase', async () => {
    const mockUser = { id: 'u1', email: 'a@b.com' };
    window.KCSupabase = { getCurrentUser: jest.fn().mockResolvedValue(mockUser) };
    const result = await auth.getCurrentUser(supaDeps);
    expect(window.KCSupabase.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockUser);
  });

  test('signIn delega ao KCSupabase com credenciais validas', async () => {
    const mockResult = { user: { id: 'u1' }, session: {} };
    window.KCSupabase = { signIn: jest.fn().mockResolvedValue(mockResult) };
    const result = await auth.signIn('a@b.com', 'senha123', supaDeps);
    expect(window.KCSupabase.signIn).toHaveBeenCalledWith('a@b.com', 'senha123');
    expect(result).toEqual(mockResult);
  });

  test('signIn retorna erro de validacao para credenciais vazias', async () => {
    window.KCSupabase = { signIn: jest.fn() };
    const result = await auth.signIn('', '', supaDeps);
    expect(window.KCSupabase.signIn).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });

  test('logout delega ao KCSupabase e retorna true em sucesso', async () => {
    window.KCSupabase = { signOut: jest.fn().mockResolvedValue({ ok: true }) };
    const result = await auth.logout(supaDeps);
    expect(window.KCSupabase.signOut).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });
});

describe('kc-api-auth.js — ordem de carregamento no HTML', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

  test('kc-api.auth.js aparece antes de kc-api.client.js no index.html', () => {
    const authIdx = html.indexOf('kc-api.auth.js');
    const clientIdx = html.indexOf('kc-api.client.js');
    expect(authIdx).toBeGreaterThan(-1);
    expect(clientIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeLessThan(clientIdx);
  });

  test('kc-api.related.js aparece antes de kc-api.auth.js no index.html', () => {
    const relatedIdx = html.indexOf('kc-api.related.js');
    const authIdx = html.indexOf('kc-api.auth.js');
    expect(relatedIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeGreaterThan(-1);
    expect(relatedIdx).toBeLessThan(authIdx);
  });
});

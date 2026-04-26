/**
 * Testes estaticos para kc-api.profiles.js (v11.33.4)
 *
 * Cobre:
 * - IIFE registra window._KCAPI.profiles corretamente
 * - 6 metodos exportados existem
 * - getCurrentProfile/syncProfile retornam null em modo local
 * - getProfileById faz fallback para mock via deps.getAuthorById
 * - updateMyProfile/uploadProfileAvatar retornam erro em modo local
 * - Delegacao ao driver quando disponivel
 * - Ordem HTML: profiles antes de client, posts-write antes de profiles
 */

const fs = require('fs');
const path = require('path');

const PROFILES_PATH = path.resolve(__dirname, '../../assets/js/kc-api.profiles.js');

describe('kc-api.profiles.js — modulo IIFE e namespace', () => {
  test('arquivo existe', () => {
    expect(fs.existsSync(PROFILES_PATH)).toBe(true);
  });

  test('usa IIFE com "use strict"', () => {
    const src = fs.readFileSync(PROFILES_PATH, 'utf8');
    expect(src).toContain("'use strict'");
    expect(src).toMatch(/\(function\s*\(\s*\)/);
    expect(src).toMatch(/\}\)\(\);/);
  });

  test('registra window._KCAPI.profiles', () => {
    const src = fs.readFileSync(PROFILES_PATH, 'utf8');
    expect(src).toContain('window._KCAPI = window._KCAPI || {}');
    expect(src).toContain('window._KCAPI.profiles = {');
  });

  test('exporta os 6 metodos obrigatorios', () => {
    const src = fs.readFileSync(PROFILES_PATH, 'utf8');
    ['getCurrentProfile', 'getProfileById', 'syncProfile', 'getMyProfile', 'updateMyProfile', 'uploadProfileAvatar']
      .forEach((m) => expect(src).toContain(m));
  });

  test('getProfileById usa deps.getAuthorById como fallback de mock', () => {
    const src = fs.readFileSync(PROFILES_PATH, 'utf8');
    expect(src).toContain('deps.getAuthorById');
    expect(src).toContain('window.KCProfiles');
  });

  test('updateMyProfile e uploadProfileAvatar usam getEnvDriver para guard supabase', () => {
    const src = fs.readFileSync(PROFILES_PATH, 'utf8');
    expect(src).toContain('getEnvDriver');
    expect(src).toContain("envDriver !== 'supabase'");
  });
});

describe('kc-api.profiles.js — fallbacks e modo local', () => {
  let profiles;

  beforeAll(() => {
    global.window = global.window || {};
    window._KCAPI = window._KCAPI || {};
    require('../../assets/js/kc-api.profiles.js');
    profiles = window._KCAPI.profiles;
  });

  test('getCurrentProfile retorna null em modo local', () => {
    const deps = { ENV: { driver: 'local' } };
    const result = profiles.getCurrentProfile(deps);
    expect(result).toBeNull();
  });

  test('syncProfile retorna null em modo local', async () => {
    const deps = { ENV: { driver: 'local' } };
    const result = await profiles.syncProfile(deps);
    expect(result).toBeNull();
  });

  test('getMyProfile retorna null sem driver', async () => {
    const deps = { getActiveDriver: () => null, ENV: { driver: 'local' } };
    const result = await profiles.getMyProfile(deps);
    expect(result).toBeNull();
  });

  test('updateMyProfile retorna erro em modo local sem driver.updateMyProfile', async () => {
    const deps = { getActiveDriver: () => ({}), ENV: { driver: 'local' } };
    const result = await profiles.updateMyProfile({}, deps);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('uploadProfileAvatar retorna erro em modo local', async () => {
    const deps = { getActiveDriver: () => ({}), ENV: { driver: 'local' } };
    const result = await profiles.uploadProfileAvatar('data:image/png;base64,...', deps);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('getProfileById usa getAuthorById como fallback quando KCProfiles nao disponivel', async () => {
    const mockAuthor = { id: 'USER_01', displayName: 'Fulano', avatarUrl: 'https://example.com/avatar.png' };
    const deps = {
      ENV: { driver: 'local' },
      getAuthorById: jest.fn().mockReturnValue(mockAuthor),
    };
    const result = await profiles.getProfileById('USER_01', deps);
    expect(deps.getAuthorById).toHaveBeenCalledWith('USER_01');
    expect(result).not.toBeNull();
    expect(result.id).toBe('USER_01');
    expect(result.display_name).toBe('Fulano');
  });

  test('getProfileById retorna null quando mock nao encontrado', async () => {
    const deps = {
      ENV: { driver: 'local' },
      getAuthorById: jest.fn().mockReturnValue(null),
    };
    const result = await profiles.getProfileById('NOT_FOUND', deps);
    expect(result).toBeNull();
  });
});

describe('kc-api.profiles.js — delegacao ao driver', () => {
  let profiles;

  beforeAll(() => {
    profiles = window._KCAPI.profiles;
  });

  test('getMyProfile delega ao driver', async () => {
    const mockProfile = { id: 'u1', display_name: 'Teste' };
    const mockDriver = { getMyProfile: jest.fn().mockResolvedValue(mockProfile) };
    const deps = { getActiveDriver: () => mockDriver, ENV: { driver: 'supabase' } };
    const result = await profiles.getMyProfile(deps);
    expect(mockDriver.getMyProfile).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockProfile);
  });

  test('updateMyProfile delega ao driver em modo supabase', async () => {
    const mockDriver = { updateMyProfile: jest.fn().mockResolvedValue({ ok: true }) };
    const deps = { getActiveDriver: () => mockDriver, ENV: { driver: 'supabase' } };
    const result = await profiles.updateMyProfile({ display_name: 'Novo Nome' }, deps);
    expect(mockDriver.updateMyProfile).toHaveBeenCalledWith({ display_name: 'Novo Nome' });
    expect(result.ok).toBe(true);
  });

  test('uploadProfileAvatar delega ao driver em modo supabase', async () => {
    const mockDriver = { uploadProfileAvatar: jest.fn().mockResolvedValue({ ok: true, url: 'https://cdn.example.com/a.png' }) };
    const deps = { getActiveDriver: () => mockDriver, ENV: { driver: 'supabase' } };
    const result = await profiles.uploadProfileAvatar('data:image/png;base64,...', deps);
    expect(mockDriver.uploadProfileAvatar).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });
});

describe('kc-api-profiles.js — ordem de carregamento no HTML', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

  test('kc-api.profiles.js aparece antes de kc-api.client.js no index.html', () => {
    const profilesIdx = html.indexOf('kc-api.profiles.js');
    const clientIdx = html.indexOf('kc-api.client.js');
    expect(profilesIdx).toBeGreaterThan(-1);
    expect(clientIdx).toBeGreaterThan(-1);
    expect(profilesIdx).toBeLessThan(clientIdx);
  });

  test('kc-api.posts-write.js aparece antes de kc-api.profiles.js no index.html', () => {
    const writeIdx = html.indexOf('kc-api.posts-write.js');
    const profilesIdx = html.indexOf('kc-api.profiles.js');
    expect(writeIdx).toBeGreaterThan(-1);
    expect(profilesIdx).toBeGreaterThan(-1);
    expect(writeIdx).toBeLessThan(profilesIdx);
  });
});

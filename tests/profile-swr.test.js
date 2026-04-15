/*
  profile.controller.js — SWR / KCSessionStore contract tests (v11.29.1)
  Verifica presença dos padrões de cache SWR no controller de perfil.
*/

const fs = require('fs');
const path = require('path');

const CONTROLLER_PATH = path.resolve(__dirname, '..', 'assets', 'js', 'controllers', 'profile.controller.js');

describe('profile.controller — SWR / KCSessionStore contracts', () => {
  const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');

  test('define PROFILE_CACHE_MAX_AGE_MS para TTL do cache', () => {
    expect(source).toContain('PROFILE_CACHE_MAX_AGE_MS');
  });

  test('usa getSessionStore para obter store de sessão', () => {
    expect(source).toContain('getSessionStore');
    expect(source).toContain('KCSessionStore.getStore');
  });

  test('define profileCacheKey para chave de cache por perfil', () => {
    expect(source).toContain('profileCacheKey');
    expect(source).toContain("'profile:public:'");
    expect(source).toContain("'profile:own:'");
  });

  test('restaura perfil do cache via restoreCachedProfile', () => {
    expect(source).toContain('restoreCachedProfile');
    expect(source).toContain('store.get(');
  });

  test('persiste perfil no cache via persistCachedProfile', () => {
    expect(source).toContain('persistCachedProfile');
    expect(source).toContain('store.set(');
  });

  test('loadProfile verifica cache antes de chamar a API', () => {
    expect(source).toContain('if (restoreCachedProfile()) return true;');
  });

  test('loadProfile persiste perfil após fetch bem-sucedido', () => {
    expect(source).toContain('persistCachedProfile(state.profile)');
  });
});

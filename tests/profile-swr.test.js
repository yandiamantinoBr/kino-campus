/*
  profile.controller.js — SWR / KCSessionStore contract tests (v11.29.1)
  Verifica presença dos padrões de cache SWR no controller de perfil.
*/

const fs = require('fs');
const path = require('path');

const CONTROLLER_PATH = path.resolve(__dirname, '..', 'assets', 'js', 'controllers', 'profile.controller.js');
const FLOW_PATH = path.resolve(__dirname, '..', 'assets', 'js', 'controllers', 'profile.flow.js');

describe('profile.controller — SWR / KCSessionStore contracts', () => {
  const controllerSource = fs.readFileSync(CONTROLLER_PATH, 'utf8');
  const flowSource = fs.readFileSync(FLOW_PATH, 'utf8');

  test('define PROFILE_CACHE_MAX_AGE_MS para TTL do cache', () => {
    expect(controllerSource).toContain('PROFILE_CACHE_MAX_AGE_MS');
  });

  test('usa getSessionStore para obter store de sessão', () => {
    expect(controllerSource).toContain('getSessionStore');
    expect(controllerSource).toContain('KCSessionStore.getStore');
  });

  test('define profileCacheKey para chave de cache por perfil', () => {
    expect(controllerSource).toContain('profileCacheKey');
    expect(controllerSource).toContain("'profile:public:'");
    expect(controllerSource).toContain("'profile:own:'");
  });

  test('restaura perfil do cache via restoreCachedProfile', () => {
    expect(controllerSource).toContain('restoreCachedProfile');
    expect(controllerSource).toContain('store.get(');
  });

  test('persiste perfil no cache via persistCachedProfile', () => {
    expect(controllerSource).toContain('persistCachedProfile');
    expect(controllerSource).toContain('store.set(');
  });

  test('loadProfile verifica cache antes de chamar a API', () => {
    expect(flowSource).toContain('if (_restoreCachedProfile(deps)) return true;');
  });

  test('loadProfile persiste perfil após fetch bem-sucedido', () => {
    expect(flowSource).toContain('_persistCachedProfile(state.profile, deps)');
  });
});

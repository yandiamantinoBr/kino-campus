/*
  my-posts.controller.js — SWR / KCSessionStore contract tests (v11.29.1)
  Verifica presença dos padrões de cache SWR no controller de minhas publicações.
*/

const fs = require('fs');
const path = require('path');

const CONTROLLER_PATH = path.resolve(__dirname, '..', '..', 'assets', 'js', 'controllers', 'my-posts.controller.js');

describe('my-posts.controller — SWR / KCSessionStore contracts', () => {
  const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');

  test('define SECTION_CACHE_KEY para cache SWR', () => {
    expect(source).toContain('SECTION_CACHE_KEY');
    expect(source).toContain("'my-posts:index'");
  });

  test('define SECTION_CACHE_MAX_AGE_MS para TTL do cache', () => {
    expect(source).toContain('SECTION_CACHE_MAX_AGE_MS');
  });

  test('usa getSessionStore para obter store de sessão', () => {
    expect(source).toContain('getSessionStore');
    expect(source).toContain('KCSessionStore.getStore');
  });

  test('restaura posts do cache via restoreCachedPosts', () => {
    expect(source).toContain('restoreCachedPosts');
    expect(source).toContain('store.get(');
  });

  test('persiste posts no cache via persistCachedPosts', () => {
    expect(source).toContain('persistCachedPosts');
    expect(source).toContain('store.set(');
  });

  test('loadAllMyPosts aceita forceRefresh para bypass de cache', () => {
    expect(source).toContain('forceRefresh');
    expect(source).toContain('!forceRefresh && restoreCachedPosts()');
  });

  test('reloadPosts chama loadAllMyPosts com forceRefresh=true', () => {
    expect(source).toContain('loadAllMyPosts(true)');
  });

  test('persistCachedPosts limita slice a 200 posts', () => {
    expect(source).toContain('posts.slice(0, 200)');
  });
});

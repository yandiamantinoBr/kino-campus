/**
 * Testes estaticos para kc-api.posts-write.js (v11.33.3)
 *
 * Cobre:
 * - IIFE registra window._KCAPI.postsWrite corretamente
 * - 7 metodos exportados existem
 * - enforceSupabaseOnProduction bloqueia createPost em producao sem supabase
 * - Fallbacks corretos quando driver nao disponivel
 * - Delegacao ao driver quando disponivel
 * - Ordem HTML: posts-write antes de client, posts-feed antes de posts-write
 */

const fs = require('fs');
const path = require('path');

const POSTS_WRITE_PATH = path.resolve(__dirname, '../assets/js/kc-api.posts-write.js');

describe('kc-api.posts-write.js — modulo IIFE e namespace', () => {
  test('arquivo existe', () => {
    expect(fs.existsSync(POSTS_WRITE_PATH)).toBe(true);
  });

  test('usa IIFE com "use strict"', () => {
    const src = fs.readFileSync(POSTS_WRITE_PATH, 'utf8');
    expect(src).toContain("'use strict'");
    expect(src).toMatch(/\(function\s*\(\s*\)/);
    expect(src).toMatch(/\}\)\(\);/);
  });

  test('registra window._KCAPI.postsWrite', () => {
    const src = fs.readFileSync(POSTS_WRITE_PATH, 'utf8');
    expect(src).toContain('window._KCAPI = window._KCAPI || {}');
    expect(src).toContain('window._KCAPI.postsWrite = {');
  });

  test('exporta os 7 metodos obrigatorios', () => {
    const src = fs.readFileSync(POSTS_WRITE_PATH, 'utf8');
    ['createPost', 'updatePost', 'deletePost', 'reportPost', 'togglePostStatus', 'renewPost', 'bumpPost']
      .forEach((m) => expect(src).toContain(m));
  });

  test('reimplementa enforceSupabaseOnProduction localmente via deps.ENV', () => {
    const src = fs.readFileSync(POSTS_WRITE_PATH, 'utf8');
    expect(src).toContain('enforceSupabaseOnProduction');
    expect(src).toContain('deps.ENV');
    expect(src).toContain("code: 'PRODUCTION_REQUIRES_SUPABASE'");
  });

  test('reimplementa kcApiError localmente', () => {
    const src = fs.readFileSync(POSTS_WRITE_PATH, 'utf8');
    expect(src).toContain('function kcApiError(message)');
  });
});

describe('kc-api.posts-write.js — fallbacks sem driver', () => {
  let postsWrite;

  beforeAll(() => {
    global.window = global.window || {};
    window._KCAPI = window._KCAPI || {};
    require('../assets/js/kc-api.posts-write.js');
    postsWrite = window._KCAPI.postsWrite;
  });

  test('createPost retorna ok:false em producao sem supabase', async () => {
    const deps = { getActiveDriver: () => null, ENV: { isProduction: true, driver: 'local' } };
    const result = await postsWrite.createPost({}, deps);
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('PRODUCTION_REQUIRES_SUPABASE');
  });

  test('createPost permite continuar em desenvolvimento', async () => {
    const mockDriver = { createPost: jest.fn().mockResolvedValue({ ok: true, id: 'p1' }) };
    const deps = { getActiveDriver: () => mockDriver, ENV: { isProduction: false, driver: 'local' } };
    const result = await postsWrite.createPost({ titulo: 'Bicicleta' }, deps);
    expect(mockDriver.createPost).toHaveBeenCalledWith({ titulo: 'Bicicleta' });
    expect(result.ok).toBe(true);
  });

  test('updatePost retorna erro quando driver nao tem updatePost', async () => {
    const deps = { getActiveDriver: () => ({}), ENV: {} };
    const result = await postsWrite.updatePost('p1', {}, deps);
    expect(result.ok).toBe(false);
  });

  test('deletePost retorna erro quando driver nao tem deletePost', async () => {
    const deps = { getActiveDriver: () => ({}), ENV: {} };
    const result = await postsWrite.deletePost('p1', deps);
    expect(result.ok).toBe(false);
  });

  test('reportPost retorna ok:false sem driver.reportPost', async () => {
    const deps = { getActiveDriver: () => ({}), ENV: {} };
    const result = await postsWrite.reportPost('p1', {}, deps);
    expect(result.ok).toBe(false);
  });

  test('togglePostStatus retorna UNAVAILABLE sem driver', async () => {
    const deps = { getActiveDriver: () => null, ENV: {} };
    const result = await postsWrite.togglePostStatus('p1', deps);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('UNAVAILABLE');
  });

  test('renewPost retorna UNAVAILABLE sem driver', async () => {
    const deps = { getActiveDriver: () => null, ENV: {} };
    const result = await postsWrite.renewPost('p1', deps);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('UNAVAILABLE');
  });

  test('bumpPost retorna UNAVAILABLE sem driver', async () => {
    const deps = { getActiveDriver: () => null, ENV: {} };
    const result = await postsWrite.bumpPost('p1', deps);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('UNAVAILABLE');
  });
});

describe('kc-api.posts-write.js — delegacao ao driver', () => {
  let postsWrite;

  beforeAll(() => {
    postsWrite = window._KCAPI.postsWrite;
  });

  test('updatePost delega ao driver', async () => {
    const mockDriver = { updatePost: jest.fn().mockResolvedValue({ ok: true }) };
    const deps = { getActiveDriver: () => mockDriver, ENV: { isProduction: false } };
    const result = await postsWrite.updatePost('p1', { titulo: 'Novo' }, deps);
    expect(mockDriver.updatePost).toHaveBeenCalledWith('p1', { titulo: 'Novo' });
    expect(result.ok).toBe(true);
  });

  test('deletePost delega ao driver', async () => {
    const mockDriver = { deletePost: jest.fn().mockResolvedValue({ ok: true }) };
    const deps = { getActiveDriver: () => mockDriver, ENV: {} };
    const result = await postsWrite.deletePost('p1', deps);
    expect(mockDriver.deletePost).toHaveBeenCalledWith('p1');
    expect(result.ok).toBe(true);
  });

  test('reportPost delega ao driver', async () => {
    const mockDriver = { reportPost: jest.fn().mockResolvedValue({ ok: true }) };
    const deps = { getActiveDriver: () => mockDriver, ENV: {} };
    const result = await postsWrite.reportPost('p1', { reason: 'spam' }, deps);
    expect(mockDriver.reportPost).toHaveBeenCalledWith('p1', { reason: 'spam' });
    expect(result.ok).toBe(true);
  });

  test('togglePostStatus delega ao driver', async () => {
    const mockDriver = { togglePostStatus: jest.fn().mockResolvedValue({ ok: true }) };
    const deps = { getActiveDriver: () => mockDriver, ENV: {} };
    const result = await postsWrite.togglePostStatus('p1', deps);
    expect(mockDriver.togglePostStatus).toHaveBeenCalledWith('p1');
    expect(result.ok).toBe(true);
  });

  test('createPost em producao com supabase passa o gate', async () => {
    const mockDriver = { createPost: jest.fn().mockResolvedValue({ ok: true, id: 'p2' }) };
    const deps = { getActiveDriver: () => mockDriver, ENV: { isProduction: true, driver: 'supabase' } };
    const result = await postsWrite.createPost({ titulo: 'Prod Post' }, deps);
    expect(mockDriver.createPost).toHaveBeenCalledWith({ titulo: 'Prod Post' });
    expect(result.ok).toBe(true);
  });
});

describe('kc-api-posts-write.js — ordem de carregamento no HTML', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

  test('kc-api.posts-write.js aparece antes de kc-api.client.js no index.html', () => {
    const writeIdx = html.indexOf('kc-api.posts-write.js');
    const clientIdx = html.indexOf('kc-api.client.js');
    expect(writeIdx).toBeGreaterThan(-1);
    expect(clientIdx).toBeGreaterThan(-1);
    expect(writeIdx).toBeLessThan(clientIdx);
  });

  test('kc-api.posts-feed.js aparece antes de kc-api.posts-write.js no index.html', () => {
    const feedIdx = html.indexOf('kc-api.posts-feed.js');
    const writeIdx = html.indexOf('kc-api.posts-write.js');
    expect(feedIdx).toBeGreaterThan(-1);
    expect(writeIdx).toBeGreaterThan(-1);
    expect(feedIdx).toBeLessThan(writeIdx);
  });
});

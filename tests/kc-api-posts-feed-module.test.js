/**
 * Testes estaticos para kc-api.posts-feed.js (v11.33.2)
 *
 * Cobre:
 * - IIFE registra window._KCAPI.postsFeed corretamente
 * - 8 metodos exportados existem
 * - Fallbacks corretos quando driver nao disponivel
 * - Delegacao ao driver quando disponivel
 * - searchPosts tem fallback para getPosts quando driver nao suporta busca nativa
 * - getFeedCursor tem fallback para getPosts sem cursor
 * - Ordem HTML: posts-feed antes de client, ratings antes de posts-feed
 */

const fs = require('fs');
const path = require('path');

const POSTS_FEED_PATH = path.resolve(__dirname, '../assets/js/kc-api.posts-feed.js');

describe('kc-api.posts-feed.js — modulo IIFE e namespace', () => {
  test('arquivo existe', () => {
    expect(fs.existsSync(POSTS_FEED_PATH)).toBe(true);
  });

  test('usa IIFE com "use strict"', () => {
    const src = fs.readFileSync(POSTS_FEED_PATH, 'utf8');
    expect(src).toContain("'use strict'");
    expect(src).toMatch(/\(function\s*\(\s*\)/);
    expect(src).toMatch(/\}\)\(\);/);
  });

  test('registra window._KCAPI.postsFeed', () => {
    const src = fs.readFileSync(POSTS_FEED_PATH, 'utf8');
    expect(src).toContain('window._KCAPI = window._KCAPI || {}');
    expect(src).toContain('window._KCAPI.postsFeed = {');
  });

  test('exporta os 8 metodos obrigatorios', () => {
    const src = fs.readFileSync(POSTS_FEED_PATH, 'utf8');
    const expectedMethods = [
      'getPosts',
      'searchPosts',
      'getFeedCursor',
      'getPostById',
      'getTopContributors',
      'checkDuplicatePost',
      'getMyPosts',
      'getPostsByAuthorId',
    ];
    expectedMethods.forEach((m) => expect(src).toContain(m));
  });

  test('searchPosts tem fallback para driver.getPosts quando searchPosts nao existe', () => {
    const src = fs.readFileSync(POSTS_FEED_PATH, 'utf8');
    expect(src).toContain("typeof driver.searchPosts !== 'function'");
    expect(src).toContain('driver.getPosts(params');
  });

  test('getFeedCursor tem fallback para driver.getPosts quando getFeedCursor nao existe', () => {
    const src = fs.readFileSync(POSTS_FEED_PATH, 'utf8');
    expect(src).toContain("typeof driver.getFeedCursor !== 'function'");
    expect(src).toContain('nextCursor: null');
    expect(src).toContain('hasMore: false');
  });

  test('getMyPosts usa getEnvDriver para guard de supabase', () => {
    const src = fs.readFileSync(POSTS_FEED_PATH, 'utf8');
    expect(src).toContain('getEnvDriver');
    expect(src).toContain("envDriver !== 'supabase'");
  });
});

describe('kc-api.posts-feed.js — fallbacks sem driver', () => {
  let postsFeed;

  beforeAll(() => {
    global.window = global.window || {};
    window._KCAPI = window._KCAPI || {};
    require('../assets/js/kc-api.posts-feed.js');
    postsFeed = window._KCAPI.postsFeed;
  });

  test('getPosts retorna [] sem driver', async () => {
    const result = await postsFeed.getPosts({}, {});
    expect(Array.isArray(result)).toBe(true);
  });

  test('searchPosts retorna [] sem driver', async () => {
    const result = await postsFeed.searchPosts({}, {});
    expect(Array.isArray(result)).toBe(true);
  });

  test('getFeedCursor retorna shape correto sem driver', async () => {
    const result = await postsFeed.getFeedCursor({}, {});
    expect(result).toHaveProperty('posts');
    expect(result).toHaveProperty('nextCursor', null);
    expect(result).toHaveProperty('hasMore', false);
  });

  test('getPostById retorna null sem driver', async () => {
    const result = await postsFeed.getPostById('p1', {});
    expect(result).toBeNull();
  });

  test('getTopContributors retorna [] sem driver', async () => {
    const result = await postsFeed.getTopContributors('week', 'compra-venda', 5, {});
    expect(Array.isArray(result)).toBe(true);
  });

  test('checkDuplicatePost retorna { ok: false, candidates: [] } sem driver', async () => {
    const result = await postsFeed.checkDuplicatePost('u1', 'compra-venda', 'Titulo', {});
    expect(result.ok).toBe(false);
    expect(Array.isArray(result.candidates)).toBe(true);
  });

  test('getMyPosts retorna [] sem driver', async () => {
    const result = await postsFeed.getMyPosts({}, {});
    expect(Array.isArray(result)).toBe(true);
  });

  test('getPostsByAuthorId retorna [] sem driver', async () => {
    const result = await postsFeed.getPostsByAuthorId('u1', {}, {});
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('kc-api.posts-feed.js — delegacao ao driver', () => {
  let postsFeed;

  beforeAll(() => {
    postsFeed = window._KCAPI.postsFeed;
  });

  test('getPosts delega ao driver', async () => {
    const mockPosts = [{ id: 'p1' }, { id: 'p2' }];
    const mockDriver = { getPosts: jest.fn().mockResolvedValue(mockPosts) };
    const deps = { getActiveDriver: () => mockDriver };
    const result = await postsFeed.getPosts({ module: 'compra-venda' }, deps);
    expect(mockDriver.getPosts).toHaveBeenCalledWith({ module: 'compra-venda' });
    expect(result).toEqual(mockPosts);
  });

  test('searchPosts delega ao driver quando searchPosts disponivel', async () => {
    const mockPosts = [{ id: 'p3' }];
    const mockDriver = { searchPosts: jest.fn().mockResolvedValue(mockPosts) };
    const deps = { getActiveDriver: () => mockDriver };
    const result = await postsFeed.searchPosts({ q: 'bicicleta' }, deps);
    expect(mockDriver.searchPosts).toHaveBeenCalledWith({ q: 'bicicleta' });
    expect(result).toEqual(mockPosts);
  });

  test('searchPosts faz fallback para getPosts quando driver nao tem searchPosts', async () => {
    const mockPosts = [{ id: 'p4' }];
    const mockDriver = { getPosts: jest.fn().mockResolvedValue(mockPosts) };
    const deps = { getActiveDriver: () => mockDriver };
    const result = await postsFeed.searchPosts({ q: 'bicicleta' }, deps);
    expect(mockDriver.getPosts).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockPosts);
  });

  test('getFeedCursor delega ao driver quando getFeedCursor disponivel', async () => {
    const mockPayload = { posts: [{ id: 'p5' }], nextCursor: 'abc', hasMore: true };
    const mockDriver = { getFeedCursor: jest.fn().mockResolvedValue(mockPayload) };
    const deps = { getActiveDriver: () => mockDriver };
    const result = await postsFeed.getFeedCursor({ limit: 10 }, deps);
    expect(mockDriver.getFeedCursor).toHaveBeenCalledWith({ limit: 10 });
    expect(result.nextCursor).toBe('abc');
    expect(result.hasMore).toBe(true);
  });

  test('getPostById delega ao driver', async () => {
    const mockPost = { id: 'p6', titulo: 'Bicicleta' };
    const mockDriver = { getPostById: jest.fn().mockResolvedValue(mockPost) };
    const deps = { getActiveDriver: () => mockDriver };
    const result = await postsFeed.getPostById('p6', deps);
    expect(mockDriver.getPostById).toHaveBeenCalledWith('p6');
    expect(result).toEqual(mockPost);
  });
});

describe('kc-api-posts-feed.js — ordem de carregamento no HTML', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

  test('kc-api.posts-feed.js aparece antes de kc-api.client.js no index.html', () => {
    const feedIdx = html.indexOf('kc-api.posts-feed.js');
    const clientIdx = html.indexOf('kc-api.client.js');
    expect(feedIdx).toBeGreaterThan(-1);
    expect(clientIdx).toBeGreaterThan(-1);
    expect(feedIdx).toBeLessThan(clientIdx);
  });

  test('kc-api.ratings.js aparece antes de kc-api.posts-feed.js no index.html', () => {
    const ratingsIdx = html.indexOf('kc-api.ratings.js');
    const feedIdx = html.indexOf('kc-api.posts-feed.js');
    expect(ratingsIdx).toBeGreaterThan(-1);
    expect(feedIdx).toBeGreaterThan(-1);
    expect(ratingsIdx).toBeLessThan(feedIdx);
  });
});

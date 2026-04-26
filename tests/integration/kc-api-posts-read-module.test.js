/**
 * Testes estaticos para kc-api.posts-read.js (v11.32.5)
 *
 * Cobre:
 * - IIFE registra window._KCAPI.postsRead corretamente
 * - 7 metodos exportados existem e sao funcoes
 * - Fallbacks corretos quando driver nao disponivel
 * - Delegacao ao driver quando disponivel
 * - Deps: getCachedSessionPayload, removeSessionCache, withPendingSessionRequest
 * - Ordem HTML: posts-read antes de client, help antes de posts-read
 */

const fs = require('fs');
const path = require('path');

const CLIENT_PATH = path.resolve(__dirname, '../../assets/js/api/kc-api.client.js');
const POSTS_READ_PATH = path.resolve(__dirname, '../../assets/js/api/kc-api.posts-read.js');

describe('kc-api.posts-read.js — modulo IIFE e namespace', () => {
  test('arquivo existe', () => {
    expect(fs.existsSync(POSTS_READ_PATH)).toBe(true);
  });

  test('usa IIFE com "use strict"', () => {
    const src = fs.readFileSync(POSTS_READ_PATH, 'utf8');
    expect(src).toContain("'use strict'");
    expect(src).toMatch(/\(function\s*\(\s*\)/);
    expect(src).toMatch(/\}\)\(\);/);
  });

  test('registra window._KCAPI.postsRead', () => {
    const src = fs.readFileSync(POSTS_READ_PATH, 'utf8');
    expect(src).toContain('window._KCAPI = window._KCAPI || {}');
    expect(src).toContain('window._KCAPI.postsRead = {');
  });

  test('exporta os 7 metodos obrigatorios', () => {
    const src = fs.readFileSync(POSTS_READ_PATH, 'utf8');
    const expectedMethods = [
      'trackCouponClick',
      'trackShare',
      'trackView',
      'getCachedPostAnalytics',
      'invalidatePostAnalyticsCache',
      'refreshPostAnalytics',
      'getPostAnalytics',
    ];
    expectedMethods.forEach((m) => {
      expect(src).toContain(m);
    });
  });

  test('usa getActiveDriverOrNull para isolar falhas de driver', () => {
    const src = fs.readFileSync(POSTS_READ_PATH, 'utf8');
    expect(src).toContain('getActiveDriverOrNull');
    expect(src).toContain('typeof deps.getActiveDriver');
  });

  test('getCachedPostAnalytics usa deps.getCachedSessionPayload', () => {
    const src = fs.readFileSync(POSTS_READ_PATH, 'utf8');
    expect(src).toContain('deps.getCachedSessionPayload');
  });

  test('invalidatePostAnalyticsCache usa deps.removeSessionCache', () => {
    const src = fs.readFileSync(POSTS_READ_PATH, 'utf8');
    expect(src).toContain('deps.removeSessionCache');
  });

  test('refreshPostAnalytics usa deps.withPendingSessionRequest', () => {
    const src = fs.readFileSync(POSTS_READ_PATH, 'utf8');
    expect(src).toContain('deps.withPendingSessionRequest');
  });

  test('refreshPostAnalytics usa deps.persistSessionPayload', () => {
    const src = fs.readFileSync(POSTS_READ_PATH, 'utf8');
    expect(src).toContain('deps.persistSessionPayload');
  });
});

describe('kc-api.posts-read.js — fallbacks sem driver', () => {
  let postsRead;

  beforeAll(() => {
    global.window = global.window || {};
    window._KCAPI = window._KCAPI || {};
    require('../../assets/js/api/kc-api.posts-read.js');
    postsRead = window._KCAPI.postsRead;
  });

  test('trackView retorna { ok: false } sem driver', async () => {
    const result = await postsRead.trackView('post-1', {});
    expect(result).toEqual({ ok: false });
  });

  test('trackShare retorna { ok: false } sem driver', async () => {
    const result = await postsRead.trackShare('post-1', {});
    expect(result).toEqual({ ok: false });
  });

  test('trackCouponClick retorna { ok: false } sem driver', async () => {
    const result = await postsRead.trackCouponClick('post-1', {});
    expect(result).toEqual({ ok: false });
  });

  test('getCachedPostAnalytics retorna null sem deps.getCachedSessionPayload', () => {
    const result = postsRead.getCachedPostAnalytics('post-1', {}, {});
    expect(result).toBeNull();
  });

  test('invalidatePostAnalyticsCache retorna false sem deps.removeSessionCache', () => {
    const result = postsRead.invalidatePostAnalyticsCache('post-1', {});
    expect(result).toBe(false);
  });

  test('refreshPostAnalytics retorna { ok: false } sem driver', async () => {
    const result = await postsRead.refreshPostAnalytics('post-1', { force: true }, {});
    expect(result).toEqual({ ok: false });
  });

  test('getPostAnalytics retorna { ok: false } sem driver', async () => {
    const result = await postsRead.getPostAnalytics('post-1', { force: true }, {});
    expect(result).toEqual({ ok: false });
  });
});

describe('kc-api.posts-read.js — delegacao ao driver', () => {
  let postsRead;
  const analyticsPayload = {
    ok: true,
    post_id: 'post-1',
    views: 50,
    votos: 3,
    comments: 2,
    shares: 1,
    saves: 4,
    coupon_clicks: 0,
    highlight_score: 10,
  };

  beforeAll(() => {
    postsRead = window._KCAPI.postsRead;
  });

  test('trackView delega ao driver e invalida cache', async () => {
    const removeSessionCache = jest.fn().mockReturnValue(true);
    const mockDriver = { trackView: jest.fn().mockResolvedValue({ ok: true }) };
    const deps = {
      getActiveDriver: () => mockDriver,
      ENV: { driver: 'supabase' },
      removeSessionCache,
    };
    const result = await postsRead.trackView('post-1', deps);
    expect(result).toEqual({ ok: true });
    expect(mockDriver.trackView).toHaveBeenCalledWith('post-1');
    expect(removeSessionCache).toHaveBeenCalledTimes(1);
  });

  test('getPostAnalytics delega ao driver com force: true', async () => {
    const mockDriver = { getPostAnalytics: jest.fn().mockResolvedValue(analyticsPayload) };
    const persistSessionPayload = jest.fn();
    const deps = {
      getActiveDriver: () => mockDriver,
      ENV: { driver: 'supabase' },
      getCachedSessionPayload: jest.fn().mockReturnValue(null),
      persistSessionPayload,
      removeSessionCache: jest.fn(),
      withPendingSessionRequest: (bucket, key, factory) => factory(),
    };
    const result = await postsRead.getPostAnalytics('post-1', { force: true }, deps);
    expect(result.views).toBe(50);
    expect(result.votos).toBe(3);
    expect(mockDriver.getPostAnalytics).toHaveBeenCalledWith('post-1');
    expect(persistSessionPayload).toHaveBeenCalledTimes(1);
  });
});

describe('kc-api-posts-read.js — ordem de carregamento no HTML', () => {
  test('kc-api.posts-read.js aparece antes de kc-api.client.js no index.html', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
    const posIdx = html.indexOf('kc-api.posts-read.js');
    const clientIdx = html.indexOf('kc-api.client.js');
    expect(posIdx).toBeGreaterThan(-1);
    expect(clientIdx).toBeGreaterThan(-1);
    expect(posIdx).toBeLessThan(clientIdx);
  });

  test('kc-api.help.js aparece antes de kc-api.posts-read.js no index.html', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
    const helpIdx = html.indexOf('kc-api.help.js');
    const posIdx = html.indexOf('kc-api.posts-read.js');
    expect(helpIdx).toBeGreaterThan(-1);
    expect(posIdx).toBeGreaterThan(-1);
    expect(helpIdx).toBeLessThan(posIdx);
  });
});

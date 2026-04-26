/**
 * Testes estaticos para kc-api.comments-votes.js (v11.32.6)
 *
 * Cobre:
 * - IIFE registra window._KCAPI.commentsVotes corretamente
 * - 8 metodos exportados existem e sao funcoes
 * - Fallbacks corretos quando driver nao disponivel ou deps ausentes
 * - Delegacao ao driver quando disponivel (comments + votes)
 * - Deps: getCachedSessionPayload, removeSessionCache, clearSessionCachePrefix,
 *         withPendingSessionRequest, persistSessionPayload, invalidatePostAnalyticsCache
 * - Ordem HTML: comments-votes antes de client, posts-read antes de comments-votes
 */

const fs = require('fs');
const path = require('path');

const COMMENTS_VOTES_PATH = path.resolve(__dirname, '../../assets/js/kc-api.comments-votes.js');

describe('kc-api.comments-votes.js — modulo IIFE e namespace', () => {
  test('arquivo existe', () => {
    expect(fs.existsSync(COMMENTS_VOTES_PATH)).toBe(true);
  });

  test('usa IIFE com "use strict"', () => {
    const src = fs.readFileSync(COMMENTS_VOTES_PATH, 'utf8');
    expect(src).toContain("'use strict'");
    expect(src).toMatch(/\(function\s*\(\s*\)/);
    expect(src).toMatch(/\}\)\(\);/);
  });

  test('registra window._KCAPI.commentsVotes', () => {
    const src = fs.readFileSync(COMMENTS_VOTES_PATH, 'utf8');
    expect(src).toContain('window._KCAPI = window._KCAPI || {}');
    expect(src).toContain('window._KCAPI.commentsVotes = {');
  });

  test('exporta os 8 metodos obrigatorios', () => {
    const src = fs.readFileSync(COMMENTS_VOTES_PATH, 'utf8');
    const expectedMethods = [
      'getCachedComments',
      'invalidateCommentsCache',
      'refreshComments',
      'getComments',
      'addComment',
      'likeComment',
      'votePost',
      'getMyVote',
    ];
    expectedMethods.forEach((m) => {
      expect(src).toContain(m);
    });
  });

  test('usa getActiveDriverOrNull para isolar falhas de driver', () => {
    const src = fs.readFileSync(COMMENTS_VOTES_PATH, 'utf8');
    expect(src).toContain('getActiveDriverOrNull');
    expect(src).toContain('typeof deps.getActiveDriver');
  });

  test('getCachedComments usa deps.getCachedSessionPayload', () => {
    const src = fs.readFileSync(COMMENTS_VOTES_PATH, 'utf8');
    expect(src).toContain('deps.getCachedSessionPayload');
  });

  test('invalidateCommentsCache usa deps.removeSessionCache e deps.clearSessionCachePrefix', () => {
    const src = fs.readFileSync(COMMENTS_VOTES_PATH, 'utf8');
    expect(src).toContain('deps.removeSessionCache');
    expect(src).toContain('deps.clearSessionCachePrefix');
  });

  test('refreshComments usa deps.withPendingSessionRequest', () => {
    const src = fs.readFileSync(COMMENTS_VOTES_PATH, 'utf8');
    expect(src).toContain('deps.withPendingSessionRequest');
  });

  test('refreshComments usa deps.persistSessionPayload', () => {
    const src = fs.readFileSync(COMMENTS_VOTES_PATH, 'utf8');
    expect(src).toContain('deps.persistSessionPayload');
  });

  test('addComment e votePost usam deps.invalidatePostAnalyticsCache', () => {
    const src = fs.readFileSync(COMMENTS_VOTES_PATH, 'utf8');
    expect(src).toContain('deps.invalidatePostAnalyticsCache');
  });
});

describe('kc-api.comments-votes.js — fallbacks sem driver', () => {
  let commentsVotes;

  beforeAll(() => {
    global.window = global.window || {};
    window._KCAPI = window._KCAPI || {};
    require('../../assets/js/kc-api.comments-votes.js');
    commentsVotes = window._KCAPI.commentsVotes;
  });

  test('getCachedComments retorna null sem deps.getCachedSessionPayload', () => {
    const result = commentsVotes.getCachedComments('post-1', {}, {});
    expect(result).toBeNull();
  });

  test('invalidateCommentsCache retorna false sem deps.removeSessionCache', () => {
    const result = commentsVotes.invalidateCommentsCache('post-1', {});
    expect(result).toBe(false);
  });

  test('refreshComments retorna null sem driver', async () => {
    const result = await commentsVotes.refreshComments('post-1', {}, {});
    expect(result).toBeNull();
  });

  test('getComments retorna null sem driver', async () => {
    const result = await commentsVotes.getComments('post-1', {}, {});
    expect(result).toBeNull();
  });

  test('addComment retorna null sem driver', async () => {
    const result = await commentsVotes.addComment('post-1', 'body', {}, {});
    expect(result).toBeNull();
  });

  test('likeComment retorna null sem driver', async () => {
    const result = await commentsVotes.likeComment('comment-1', {}, {});
    expect(result).toBeNull();
  });

  test('votePost retorna null sem driver', async () => {
    const result = await commentsVotes.votePost('post-1', 'hot', {}, {});
    expect(result).toBeNull();
  });

  test('getMyVote retorna null sem driver', async () => {
    const result = await commentsVotes.getMyVote('post-1', {});
    expect(result).toBeNull();
  });
});

describe('kc-api.comments-votes.js — delegacao ao driver', () => {
  let commentsVotes;

  beforeAll(() => {
    commentsVotes = window._KCAPI.commentsVotes;
  });

  test('refreshComments delega ao driver e persiste no cache', async () => {
    const persistSessionPayload = jest.fn();
    const withPendingSessionRequest = jest.fn((bucket, key, factory) => factory());
    const mockDriver = { getComments: jest.fn().mockResolvedValue([{ id: 'c1', body: 'Ola' }]) };
    const deps = {
      getActiveDriver: () => mockDriver,
      ENV: { driver: 'supabase' },
      getCachedSessionPayload: jest.fn().mockReturnValue(null),
      persistSessionPayload,
      removeSessionCache: jest.fn(),
      withPendingSessionRequest,
    };
    const result = await commentsVotes.refreshComments('post-1', { force: true }, deps);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c1');
    expect(mockDriver.getComments).toHaveBeenCalledWith('post-1');
    expect(persistSessionPayload).toHaveBeenCalledTimes(1);
  });

  test('addComment delega ao driver e invalida comments + analytics', async () => {
    const removeSessionCache = jest.fn().mockReturnValue(true);
    const invalidatePostAnalyticsCache = jest.fn();
    const mockDriver = {
      addComment: jest.fn().mockResolvedValue({ ok: true, data: { id: 'c2' } }),
    };
    const deps = {
      getActiveDriver: () => mockDriver,
      ENV: { driver: 'supabase', isProduction: false },
      removeSessionCache,
      clearSessionCachePrefix: jest.fn(),
      invalidatePostAnalyticsCache,
      getCachedSessionPayload: jest.fn().mockReturnValue(null),
    };
    const result = await commentsVotes.addComment('post-1', 'Novo comentario', {}, deps);
    expect(result).toEqual({ ok: true, data: { id: 'c2' } });
    expect(removeSessionCache).toHaveBeenCalledTimes(1);
    expect(invalidatePostAnalyticsCache).toHaveBeenCalledWith('post-1');
  });

  test('votePost delega ao driver e invalida analytics', async () => {
    const invalidatePostAnalyticsCache = jest.fn();
    const mockDriver = {
      votePost: jest.fn().mockResolvedValue({ ok: true }),
    };
    const deps = {
      getActiveDriver: () => mockDriver,
      ENV: { driver: 'supabase', isProduction: false },
      invalidatePostAnalyticsCache,
    };
    const result = await commentsVotes.votePost('post-1', 'hot', {}, deps);
    expect(result).toEqual({ ok: true });
    expect(mockDriver.votePost).toHaveBeenCalledWith('post-1', 'hot', {});
    expect(invalidatePostAnalyticsCache).toHaveBeenCalledWith('post-1');
  });
});

describe('kc-api-comments-votes.js — ordem de carregamento no HTML', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

  test('kc-api.comments-votes.js aparece antes de kc-api.client.js no index.html', () => {
    const cvIdx = html.indexOf('kc-api.comments-votes.js');
    const clientIdx = html.indexOf('kc-api.client.js');
    expect(cvIdx).toBeGreaterThan(-1);
    expect(clientIdx).toBeGreaterThan(-1);
    expect(cvIdx).toBeLessThan(clientIdx);
  });

  test('kc-api.posts-read.js aparece antes de kc-api.comments-votes.js no index.html', () => {
    const posIdx = html.indexOf('kc-api.posts-read.js');
    const cvIdx = html.indexOf('kc-api.comments-votes.js');
    expect(posIdx).toBeGreaterThan(-1);
    expect(cvIdx).toBeGreaterThan(-1);
    expect(posIdx).toBeLessThan(cvIdx);
  });
});

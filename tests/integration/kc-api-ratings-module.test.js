/**
 * Static and behavioral tests for kc-api.ratings.js.
 *
 * Covers:
 * - IIFE registration at window._KCAPI.ratings
 * - exported rating operations and payload normalizers
 * - fallback shapes when the active driver is unavailable
 * - delegation to the active driver with module-local normalization
 * - HTML loading order before kc-api.client.js
 */

const fs = require('fs');
const path = require('path');

const RATINGS_PATH = path.resolve(__dirname, '../../assets/js/api/kc-api.ratings.js');

function loadRatingsModule() {
  jest.resetModules();
  global.window = {};
  require('../../assets/js/api/kc-api.ratings.js');
  return window._KCAPI.ratings;
}

describe('kc-api.ratings.js - IIFE and namespace', () => {
  test('arquivo existe', () => {
    expect(fs.existsSync(RATINGS_PATH)).toBe(true);
  });

  test('usa IIFE com "use strict"', () => {
    const src = fs.readFileSync(RATINGS_PATH, 'utf8');
    expect(src).toContain("'use strict'");
    expect(src).toMatch(/\(function\s*\(\s*\)/);
    expect(src).toMatch(/\}\)\(\);/);
  });

  test('registra window._KCAPI.ratings', () => {
    const src = fs.readFileSync(RATINGS_PATH, 'utf8');
    expect(src).toContain('window._KCAPI = window._KCAPI || {}');
    expect(src).toContain('window._KCAPI.ratings = {');
  });

  test('exporta metodos de operacao e normalizacao', () => {
    const src = fs.readFileSync(RATINGS_PATH, 'utf8');
    [
      'normalizeUserRatingSummary',
      'normalizeUserRatingEntry',
      'normalizeUserRatingState',
      'normalizeUserRatingList',
      'getUserRatingSummary',
      'getUserRatingState',
      'listUserRatings',
      'upsertUserRating',
    ].forEach((m) => {
      expect(src).toContain(m);
    });
  });

  test('usa getActiveDriverOrNull para isolar falhas de driver', () => {
    const src = fs.readFileSync(RATINGS_PATH, 'utf8');
    expect(src).toContain('getActiveDriverOrNull');
    expect(src).toContain('typeof deps.getActiveDriver');
  });

  test('mantem normalizadores locais e dispensa normalizadores injetados pela fachada', () => {
    const src = fs.readFileSync(RATINGS_PATH, 'utf8');
    expect(src).toContain('function normalizeUserRatingSummary(raw, fallbackUserId)');
    expect(src).toContain('function normalizeUserRatingEntry(raw)');
    expect(src).toContain('function normalizeUserRatingState(raw, fallbackTargetUserId, fallbackContextPostId)');
    expect(src).toContain('function normalizeUserRatingList(raw, fallbackPage, fallbackLimit)');
    expect(src).not.toContain('deps.normalizeUserRating');
    expect(src).toContain('return normalizeUserRatingSummary(summary, userId);');
    expect(src).toContain('return normalizeUserRatingState(state, fallbackTargetUserId, fallbackContextPostId);');
    expect(src).toContain('return normalizeUserRatingList(payload, fallbackPage, fallbackLimit);');
    expect(src).toContain('rating: (result && result.rating) ? normalizeUserRatingEntry(result.rating) : null,');
  });
});

describe('kc-api.ratings.js - normalizers', () => {
  let ratings;

  beforeEach(() => {
    ratings = loadRatingsModule();
  });

  test('normalizeUserRatingSummary aceita camelCase, snake_case e fallback de usuario', () => {
    expect(ratings.normalizeUserRatingSummary({ user_id: 'USER_01', rating_avg: '4.75', rating_count: '8' }, 'fallback')).toEqual({
      userId: 'USER_01',
      average: 4.75,
      count: 8,
    });

    expect(ratings.normalizeUserRatingSummary({ average: '', count: -2 }, 'fallback')).toEqual({
      userId: 'fallback',
      average: null,
      count: 0,
    });
  });

  test('normalizeUserRatingEntry canonicaliza ids, nota e reviewer', () => {
    expect(ratings.normalizeUserRatingEntry({
      id: ' r1 ',
      target_user_id: 'USER_01',
      rater_user_id: 'USER_02',
      context_post_id: 'post-1',
      rating: 9,
      comment: '  Muito bom  ',
      created_at: '2026-06-01T00:00:00Z',
      reviewer: {
        id: ' user-2 ',
        display_name: ' Ana ',
        avatar_url: ' https://cdn.example.com/a.png ',
        public: true,
      },
    })).toEqual({
      id: 'r1',
      targetUserId: 'USER_01',
      raterUserId: 'USER_02',
      contextPostId: 'post-1',
      rating: 5,
      comment: 'Muito bom',
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: null,
      reviewer: {
        id: 'user-2',
        displayName: 'Ana',
        avatarUrl: 'https://cdn.example.com/a.png',
        public: true,
      },
    });
  });

  test('normalizeUserRatingState aplica fallbacks e normaliza myRating', () => {
    const result = ratings.normalizeUserRatingState({
      can_rate: true,
      reason: 'OK',
      my_rating: {
        id: 'rating-1',
        target_user_id: 'USER_01',
        context_post_id: 'post-1',
        rating: 4,
      },
    }, 'USER_01', 'post-1');

    expect(result).toEqual(expect.objectContaining({
      targetUserId: 'USER_01',
      contextPostId: 'post-1',
      canRate: true,
      reason: 'OK',
    }));
    expect(result.myRating).toEqual(expect.objectContaining({
      id: 'rating-1',
      targetUserId: 'USER_01',
      contextPostId: 'post-1',
      rating: 4,
    }));
  });

  test('normalizeUserRatingList normaliza items e paginacao', () => {
    const result = ratings.normalizeUserRatingList({
      items: [
        { id: 'r1', target_user_id: 'u1', rating: 1 },
        { id: 'r2', target_user_id: 'u2', rating: 6 },
      ],
      page: '2',
      limit: '20',
      total: '42',
      has_more: true,
    }, 1, 10);

    expect(result.page).toBe(2);
    expect(result.limit).toBe(20);
    expect(result.total).toBe(42);
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.items[1]).toEqual(expect.objectContaining({ rating: 5 }));
  });
});

describe('kc-api.ratings.js - fallbacks sem driver', () => {
  let ratings;

  beforeEach(() => {
    ratings = loadRatingsModule();
  });

  test('getUserRatingSummary retorna shape minimo sem driver', async () => {
    await expect(ratings.getUserRatingSummary('user-1', {})).resolves.toEqual({
      userId: 'user-1',
      average: null,
      count: 0,
    });
  });

  test('getUserRatingState retorna shape minimo sem driver', async () => {
    await expect(ratings.getUserRatingState({ targetUserId: 'user-1', contextPostId: 'post-1' }, {})).resolves.toEqual({
      targetUserId: 'user-1',
      contextPostId: 'post-1',
      canRate: false,
      reason: 'UNKNOWN',
      myRating: null,
    });
  });

  test('listUserRatings retorna shape minimo sem driver', async () => {
    await expect(ratings.listUserRatings('user-1', { page: 3, limit: 5 }, {})).resolves.toEqual({
      items: [],
      page: 3,
      limit: 5,
      total: 0,
      hasMore: false,
    });
  });

  test('upsertUserRating retorna ok:false sem driver', async () => {
    const result = await ratings.upsertUserRating({}, {});
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('kc-api.ratings.js - delegacao ao driver', () => {
  let ratings;

  beforeEach(() => {
    ratings = loadRatingsModule();
  });

  test('getUserRatingSummary delega ao driver e normaliza no modulo', async () => {
    const mockDriver = {
      getUserRatingSummary: jest.fn().mockResolvedValue({ average: '4.5', count: '10', user_id: 'u1' }),
    };
    const result = await ratings.getUserRatingSummary('u1', { getActiveDriver: () => mockDriver });

    expect(mockDriver.getUserRatingSummary).toHaveBeenCalledWith('u1');
    expect(result).toEqual({ userId: 'u1', average: 4.5, count: 10 });
  });

  test('getUserRatingState delega ao driver e normaliza no modulo', async () => {
    const mockDriver = {
      getUserRatingState: jest.fn().mockResolvedValue({ can_rate: true, reason: 'ELIGIBLE', my_rating: null }),
    };
    const params = { targetUserId: 'u2', contextPostId: 'p1' };
    const result = await ratings.getUserRatingState(params, { getActiveDriver: () => mockDriver });

    expect(mockDriver.getUserRatingState).toHaveBeenCalledWith(params);
    expect(result).toEqual({
      targetUserId: 'u2',
      contextPostId: 'p1',
      canRate: true,
      reason: 'ELIGIBLE',
      myRating: null,
    });
  });

  test('listUserRatings delega ao driver e normaliza no modulo', async () => {
    const mockDriver = {
      listUserRatings: jest.fn().mockResolvedValue({
        items: [{ id: 'r1', target_user_id: 'u2', rating: '5' }],
        page: '2',
        limit: '10',
        total: '11',
        has_more: true,
      }),
    };
    const result = await ratings.listUserRatings('u2', { page: 2, limit: 10 }, { getActiveDriver: () => mockDriver });

    expect(mockDriver.listUserRatings).toHaveBeenCalledWith('u2', { page: 2, limit: 10 });
    expect(result).toEqual(expect.objectContaining({ page: 2, limit: 10, total: 11, hasMore: true }));
    expect(result.items[0]).toEqual(expect.objectContaining({ id: 'r1', targetUserId: 'u2', rating: 5 }));
  });

  test('upsertUserRating delega ao driver e retorna rating + summary normalizados', async () => {
    const mockDriver = {
      upsertUserRating: jest.fn().mockResolvedValue({
        ok: true,
        rating: { id: 'r1', target_user_id: 'u3', rating: 5 },
        summary: { average: 4.8, count: 20 },
      }),
    };
    const payload = { targetUserId: 'u3', contextPostId: 'p2', rating: 5 };
    const result = await ratings.upsertUserRating(payload, { getActiveDriver: () => mockDriver });

    expect(mockDriver.upsertUserRating).toHaveBeenCalledWith(payload);
    expect(result.ok).toBe(true);
    expect(result.rating).toEqual(expect.objectContaining({ id: 'r1', targetUserId: 'u3', rating: 5 }));
    expect(result.summary).toEqual({ userId: 'u3', average: 4.8, count: 20 });
  });
});

describe('kc-api.ratings.js - ordem de carregamento no HTML', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

  test('kc-api.ratings.js aparece antes de kc-api.client.js no index.html', () => {
    const ratingsIdx = html.indexOf('kc-api.ratings.js');
    const clientIdx = html.indexOf('kc-api.client.js');
    expect(ratingsIdx).toBeGreaterThan(-1);
    expect(clientIdx).toBeGreaterThan(-1);
    expect(ratingsIdx).toBeLessThan(clientIdx);
  });

  test('kc-api.comments-votes.js aparece antes de kc-api.ratings.js no index.html', () => {
    const cvIdx = html.indexOf('kc-api.comments-votes.js');
    const ratingsIdx = html.indexOf('kc-api.ratings.js');
    expect(cvIdx).toBeGreaterThan(-1);
    expect(ratingsIdx).toBeGreaterThan(-1);
    expect(cvIdx).toBeLessThan(ratingsIdx);
  });
});

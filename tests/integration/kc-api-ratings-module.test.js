/**
 * Testes estaticos para kc-api.ratings.js (v11.33.1)
 *
 * Cobre:
 * - IIFE registra window._KCAPI.ratings corretamente
 * - 4 metodos exportados existem e sao funcoes
 * - Fallbacks corretos quando driver nao disponivel ou deps ausentes
 * - Delegacao ao driver quando disponivel (ratings)
 * - Deps: getActiveDriver, normalizeUserRatingSummary, normalizeUserRatingEntry,
 *         normalizeUserRatingState, normalizeUserRatingList
 * - Ordem HTML: ratings antes de client, comments-votes antes de ratings
 */

const fs = require('fs');
const path = require('path');

const RATINGS_PATH = path.resolve(__dirname, '../../assets/js/kc-api.ratings.js');

describe('kc-api.ratings.js — modulo IIFE e namespace', () => {
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

  test('exporta os 4 metodos obrigatorios', () => {
    const src = fs.readFileSync(RATINGS_PATH, 'utf8');
    const expectedMethods = [
      'getUserRatingSummary',
      'getUserRatingState',
      'listUserRatings',
      'upsertUserRating',
    ];
    expectedMethods.forEach((m) => {
      expect(src).toContain(m);
    });
  });

  test('usa getActiveDriverOrNull para isolar falhas de driver', () => {
    const src = fs.readFileSync(RATINGS_PATH, 'utf8');
    expect(src).toContain('getActiveDriverOrNull');
    expect(src).toContain('typeof deps.getActiveDriver');
  });

  test('getUserRatingSummary usa deps.normalizeUserRatingSummary', () => {
    const src = fs.readFileSync(RATINGS_PATH, 'utf8');
    expect(src).toContain('deps.normalizeUserRatingSummary');
  });

  test('getUserRatingState usa deps.normalizeUserRatingState', () => {
    const src = fs.readFileSync(RATINGS_PATH, 'utf8');
    expect(src).toContain('deps.normalizeUserRatingState');
  });

  test('listUserRatings usa deps.normalizeUserRatingList', () => {
    const src = fs.readFileSync(RATINGS_PATH, 'utf8');
    expect(src).toContain('deps.normalizeUserRatingList');
  });

  test('upsertUserRating usa deps.normalizeUserRatingEntry', () => {
    const src = fs.readFileSync(RATINGS_PATH, 'utf8');
    expect(src).toContain('deps.normalizeUserRatingEntry');
  });
});

describe('kc-api.ratings.js — fallbacks sem driver', () => {
  let ratings;

  beforeAll(() => {
    global.window = global.window || {};
    window._KCAPI = window._KCAPI || {};
    require('../../assets/js/kc-api.ratings.js');
    ratings = window._KCAPI.ratings;
  });

  test('getUserRatingSummary retorna shape minimo sem driver', async () => {
    const result = await ratings.getUserRatingSummary('user-1', {});
    expect(result).toHaveProperty('userId');
    expect(result).toHaveProperty('average');
    expect(result).toHaveProperty('count');
  });

  test('getUserRatingState retorna shape minimo sem driver', async () => {
    const result = await ratings.getUserRatingState({}, {});
    expect(result).toHaveProperty('canRate');
    expect(result).toHaveProperty('reason');
  });

  test('listUserRatings retorna shape minimo sem driver', async () => {
    const result = await ratings.listUserRatings('user-1', {}, {});
    expect(result).toHaveProperty('items');
    expect(Array.isArray(result.items)).toBe(true);
    expect(result).toHaveProperty('total');
  });

  test('upsertUserRating retorna ok:false sem driver', async () => {
    const result = await ratings.upsertUserRating({}, {});
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('kc-api.ratings.js — delegacao ao driver', () => {
  let ratings;

  beforeAll(() => {
    ratings = window._KCAPI.ratings;
  });

  test('getUserRatingSummary delega ao driver e normaliza', async () => {
    const mockDriver = {
      getUserRatingSummary: jest.fn().mockResolvedValue({ average: 4.5, count: 10, user_id: 'u1' }),
    };
    const deps = {
      getActiveDriver: () => mockDriver,
      normalizeUserRatingSummary: jest.fn((raw, id) => ({
        userId: id,
        average: raw && raw.average != null ? raw.average : null,
        count: raw && raw.count != null ? raw.count : 0,
      })),
    };
    const result = await ratings.getUserRatingSummary('u1', deps);
    expect(mockDriver.getUserRatingSummary).toHaveBeenCalledWith('u1');
    expect(deps.normalizeUserRatingSummary).toHaveBeenCalledTimes(1);
    expect(result.average).toBe(4.5);
    expect(result.count).toBe(10);
  });

  test('getUserRatingState delega ao driver e normaliza', async () => {
    const mockDriver = {
      getUserRatingState: jest.fn().mockResolvedValue({ can_rate: true, reason: 'ELIGIBLE', my_rating: null }),
    };
    const deps = {
      getActiveDriver: () => mockDriver,
      normalizeUserRatingState: jest.fn((raw, tId, cId) => ({
        targetUserId: tId,
        contextPostId: cId,
        canRate: raw && (raw.canRate === true || raw.can_rate === true),
        reason: (raw && raw.reason) ? raw.reason : 'UNKNOWN',
        myRating: null,
      })),
    };
    const params = { targetUserId: 'u2', contextPostId: 'p1' };
    const result = await ratings.getUserRatingState(params, deps);
    expect(mockDriver.getUserRatingState).toHaveBeenCalledWith(params);
    expect(deps.normalizeUserRatingState).toHaveBeenCalledTimes(1);
    expect(result.canRate).toBe(true);
    expect(result.reason).toBe('ELIGIBLE');
  });

  test('upsertUserRating delega ao driver e retorna rating + summary normalizados', async () => {
    const mockDriver = {
      upsertUserRating: jest.fn().mockResolvedValue({
        ok: true,
        rating: { id: 'r1', rating: 5 },
        summary: { average: 4.8, count: 20 },
      }),
    };
    const deps = {
      getActiveDriver: () => mockDriver,
      normalizeUserRatingSummary: jest.fn((raw, id) => ({ userId: id || null, average: raw && raw.average, count: raw && raw.count })),
      normalizeUserRatingEntry: jest.fn((raw) => ({ id: raw && raw.id, rating: raw && raw.rating })),
      normalizeUserRatingState: jest.fn(),
      normalizeUserRatingList: jest.fn(),
    };
    const payload = { targetUserId: 'u3', contextPostId: 'p2', rating: 5 };
    const result = await ratings.upsertUserRating(payload, deps);
    expect(result.ok).toBe(true);
    expect(deps.normalizeUserRatingEntry).toHaveBeenCalledTimes(1);
    expect(deps.normalizeUserRatingSummary).toHaveBeenCalledTimes(1);
    expect(result.rating).toEqual({ id: 'r1', rating: 5 });
    expect(result.summary.average).toBe(4.8);
  });
});

describe('kc-api-ratings.js — ordem de carregamento no HTML', () => {
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

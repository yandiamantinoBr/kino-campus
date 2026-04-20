/**
 * Testes estaticos para kc-api.related.js (v11.33.5)
 *
 * Cobre:
 * - IIFE registra window._KCAPI.related corretamente
 * - 2 metodos exportados existem
 * - rankRelatedPosts: fallbacks, scoring, deduplicacao, filtro de visibilidade
 * - getRelatedPosts: fallback [] e delegacao ao driver
 * - Ordem HTML: related antes de client, profiles antes de related
 */

const fs = require('fs');
const path = require('path');

const RELATED_PATH = path.resolve(__dirname, '../assets/js/kc-api.related.js');

describe('kc-api.related.js — modulo IIFE e namespace', () => {
  test('arquivo existe', () => {
    expect(fs.existsSync(RELATED_PATH)).toBe(true);
  });

  test('usa IIFE com "use strict"', () => {
    const src = fs.readFileSync(RELATED_PATH, 'utf8');
    expect(src).toContain("'use strict'");
    expect(src).toMatch(/\(function\s*\(\s*\)/);
    expect(src).toMatch(/\}\)\(\);/);
  });

  test('registra window._KCAPI.related', () => {
    const src = fs.readFileSync(RELATED_PATH, 'utf8');
    expect(src).toContain('window._KCAPI = window._KCAPI || {}');
    expect(src).toContain('window._KCAPI.related = {');
  });

  test('exporta os 2 metodos obrigatorios', () => {
    const src = fs.readFileSync(RELATED_PATH, 'utf8');
    ['getRelatedPosts', 'rankRelatedPosts'].forEach((m) => expect(src).toContain(m));
  });

  test('internaliza getNormalizedPostValue como helper local', () => {
    const src = fs.readFileSync(RELATED_PATH, 'utf8');
    expect(src).toContain('function getNormalizedPostValue(');
  });

  test('rankRelatedPosts usa deps.normalizePost para normalizar candidatos', () => {
    const src = fs.readFileSync(RELATED_PATH, 'utf8');
    expect(src).toContain('deps.normalizePost');
  });
});

describe('kc-api.related.js — fallbacks e scoring', () => {
  let related;

  beforeAll(() => {
    global.window = global.window || {};
    window._KCAPI = window._KCAPI || {};
    require('../assets/js/kc-api.related.js');
    related = window._KCAPI.related;
  });

  test('getRelatedPosts retorna [] sem driver', async () => {
    const deps = { getActiveDriver: () => null };
    const result = await related.getRelatedPosts('p1', {}, deps);
    expect(result).toEqual([]);
  });

  test('rankRelatedPosts retorna [] quando currentPost e null', () => {
    const result = related.rankRelatedPosts(null, [{ id: 'c1', modulo: 'caronas' }], {}, {});
    expect(result).toEqual([]);
  });

  test('rankRelatedPosts retorna [] quando lista de candidatos vazia', () => {
    const result = related.rankRelatedPosts({ id: 'p1', modulo: 'caronas' }, [], {}, {});
    expect(result).toEqual([]);
  });

  test('rankRelatedPosts filtra candidato com mesmo id que o post atual', () => {
    const current = { id: 'p1', modulo: 'caronas' };
    const candidates = [{ id: 'p1', modulo: 'caronas' }, { id: 'c2', modulo: 'caronas' }];
    const deps = { normalizePost: (p) => p };
    const result = related.rankRelatedPosts(current, candidates, {}, deps);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('c2');
  });

  test('rankRelatedPosts ordena por score (mesmo modulo > sem modulo comum)', () => {
    const current = { id: 'p1', modulo: 'caronas', categoria: 'bh' };
    const candidateA = { id: 'cA', modulo: 'caronas', categoria: 'bh' };
    const candidateB = { id: 'cB', modulo: 'moradia', categoria: 'sp' };
    const deps = { normalizePost: (p) => p };
    const result = related.rankRelatedPosts(current, [candidateB, candidateA], {}, deps);
    expect(result[0].id).toBe('cA');
    expect(result[1].id).toBe('cB');
  });
});

describe('kc-api.related.js — delegacao ao driver', () => {
  let related;

  beforeAll(() => {
    related = window._KCAPI.related;
  });

  test('getRelatedPosts delega ao driver', async () => {
    const mockPosts = [{ id: 'r1', modulo: 'caronas' }];
    const mockDriver = { getRelatedPosts: jest.fn().mockResolvedValue(mockPosts) };
    const deps = { getActiveDriver: () => mockDriver };
    const result = await related.getRelatedPosts('p1', { limit: 5 }, deps);
    expect(mockDriver.getRelatedPosts).toHaveBeenCalledWith('p1', { limit: 5 });
    expect(result).toEqual(mockPosts);
  });

  test('rankRelatedPosts usa normalizePost das deps para normalizar candidatos', () => {
    const normalizePost = jest.fn((p) => ({ ...p, _normalized: true }));
    const current = { id: 'p1', modulo: 'caronas' };
    const candidates = [{ id: 'c1', modulo: 'caronas' }];
    const deps = { normalizePost };
    related.rankRelatedPosts(current, candidates, {}, deps);
    expect(normalizePost).toHaveBeenCalledWith({ id: 'c1', modulo: 'caronas' });
  });

  test('rankRelatedPosts filtra post nao-publico para viewer nao-autenticado', () => {
    const current = { id: 'p1', modulo: 'caronas' };
    const candidates = [
      { id: 'c1', modulo: 'caronas', visibility: 'private' },
      { id: 'c2', modulo: 'caronas', visibility: 'public' },
    ];
    const deps = { normalizePost: (p) => p };
    const result = related.rankRelatedPosts(current, candidates, { viewerAuthenticated: false }, deps);
    expect(result.find((r) => r.id === 'c1')).toBeUndefined();
    expect(result.find((r) => r.id === 'c2')).toBeDefined();
  });
});

describe('kc-api-related.js — ordem de carregamento no HTML', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

  test('kc-api.related.js aparece antes de kc-api.client.js no index.html', () => {
    const relatedIdx = html.indexOf('kc-api.related.js');
    const clientIdx = html.indexOf('kc-api.client.js');
    expect(relatedIdx).toBeGreaterThan(-1);
    expect(clientIdx).toBeGreaterThan(-1);
    expect(relatedIdx).toBeLessThan(clientIdx);
  });

  test('kc-api.profiles.js aparece antes de kc-api.related.js no index.html', () => {
    const profilesIdx = html.indexOf('kc-api.profiles.js');
    const relatedIdx = html.indexOf('kc-api.related.js');
    expect(profilesIdx).toBeGreaterThan(-1);
    expect(relatedIdx).toBeGreaterThan(-1);
    expect(profilesIdx).toBeLessThan(relatedIdx);
  });
});

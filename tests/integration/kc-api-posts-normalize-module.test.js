/**
 * @file kc-api-posts-normalize-module.test.js
 * @description Contract tests for assets/js/api/kc-api.posts-normalize.js (V76)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../assets/js/api/kc-api.posts-normalize.js');
const CLIENT_SRC = path.resolve(__dirname, '../../assets/js/api/kc-api.client.js');
const PAGE_MANIFEST = require('../../scripts/admin-pages.manifest.js');
const HTML_FILES_WITH_CLIENT = Object.freeze(PAGE_MANIFEST.ALL_HTML_PAGES.filter((page) => (
  page !== '404.html' && page !== 'admin/cadu.html'
)));

let source;
let clientSource;

function loadFreshPostsNormalizeModule() {
  jest.resetModules();
  delete window._KCAPI;
  require('../../assets/js/api/kc-api.posts-normalize.js');
  return window._KCAPI.postsNormalize;
}

beforeAll(() => {
  source = fs.readFileSync(SRC, 'utf8');
  clientSource = fs.readFileSync(CLIENT_SRC, 'utf8');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('kc-api.posts-normalize.js - source shape', () => {
  test('mantem IIFE, strict mode e namespace interno congelado', () => {
    expect(source).toContain('(function () {');
    expect(source).toContain("'use strict';");
    expect(source).toContain('window._KCAPI = window._KCAPI || {};');
    expect(source).toContain('window._KCAPI.postsNormalize = Object.freeze({');
    expect(source.trim().endsWith('})();')).toBe(true);
  });

  test('nao cria nova fachada KCAPI nem usa require/import', () => {
    expect(source).not.toContain('window.KCAPI =');
    expect(source).not.toContain('require(');
    expect(source).not.toContain('import ');
  });

  test('kc-api.client.js delega normalizePost sem manter corpo local', () => {
    expect(clientSource).toContain('function getPostsNormalizeModule()');
    expect(clientSource).toContain("throw new Error('KCAPI posts normalize module not loaded.');");
    expect(clientSource).toContain('return getPostsNormalizeModule().normalizePost(raw, {');
    expect(clientSource).toContain('defaultAvatar: (window.KC_CONSTANTS && window.KC_CONSTANTS.DEFAULT_AVATAR_SVG) ||');
    expect(clientSource).not.toContain('function pickFirstNonEmpty(values) {');
    expect(clientSource).not.toContain("const actionish = ['vendo', 'compro', 'troco'");
    expect(source).toContain('function pickFirstNonEmpty(values) {');
    expect(source).toContain("const actionish = ['vendo', 'compro', 'troco'");
  });
});

describe('kc-api.posts-normalize.js - module contract', () => {
  let postsNormalize;

  beforeEach(() => {
    postsNormalize = loadFreshPostsNormalizeModule();
  });

  test('exporta helpers internos esperados', () => {
    expect(Object.isFrozen(postsNormalize)).toBe(true);
    expect(Object.keys(postsNormalize).sort()).toEqual([
      'normalizePost',
      'pickFirstNonEmpty',
    ]);
  });

  test('normaliza com dependencias injetadas de autor e avatar default', () => {
    const resolveAuthorId = jest.fn(() => 'USER_TEST');
    const post = postsNormalize.normalizePost({
      id: 'p1',
      module: 'eventos',
      title: 'Evento',
      author: 'Legacy User',
      metadata: { image_url: 'https://cdn.example.com/image.jpg' },
    }, {
      resolveAuthorId,
      defaultAvatar: 'avatar-default.svg',
    });

    expect(resolveAuthorId).toHaveBeenCalledWith('Legacy User', '');
    expect(post).toMatchObject({
      id: 'p1',
      modulo: 'eventos',
      titulo: 'Evento',
      authorId: 'USER_TEST',
      authorName: 'Legacy User',
      authorAvatar: 'avatar-default.svg',
      image_url: 'https://cdn.example.com/image.jpg',
      cover_url: 'https://cdn.example.com/image.jpg',
      visibility: 'public',
    });
    expect(post.imagens).toEqual(['https://cdn.example.com/image.jpg']);
    expect(post.metadata).toMatchObject({
      image_url: 'https://cdn.example.com/image.jpg',
      visibility: 'public',
    });
  });

  test('preserva helper pickFirstNonEmpty para normalizacao local do modulo', () => {
    expect(postsNormalize.pickFirstNonEmpty(['', null, '  valor  '])).toBe('valor');
    expect(postsNormalize.pickFirstNonEmpty('valor')).toBe('');
  });

  test('preserva expires_at tipado nos dois aliases usados pelo lifecycle', () => {
    const post = postsNormalize.normalizePost({
      id: 'typed-expiry',
      module: 'moradia',
      title: 'Quarto temporario',
      expires_at: '2026-08-20T18:00:00Z',
    });

    expect(post.expires_at).toBe('2026-08-20T18:00:00Z');
    expect(post.expiresAt).toBe('2026-08-20T18:00:00Z');
  });

  test('prioriza expires_at tipado quando payload hibrido traz aliases conflitantes', () => {
    const post = postsNormalize.normalizePost({
      id: 'typed-expiry-conflict',
      module: 'eventos',
      title: 'Evento com aliases conflitantes',
      expires_at: '2026-08-01T18:00:00Z',
      expiresAt: '2026-09-01T18:00:00Z',
    });

    expect(post.expires_at).toBe('2026-08-01T18:00:00Z');
    expect(post.expiresAt).toBe('2026-08-01T18:00:00Z');
  });

  test.each([
    [{ isClosed: true }, 'alias direto'],
    [{ metadata: { isClosed: true } }, 'alias em metadata'],
    [{ isClosed: false, metadata: { is_closed: true } }, 'true posterior nao sombreado por false'],
  ])('preserva fechamento booleano estrito de %s (%s)', (signals) => {
    const post = postsNormalize.normalizePost({
      id: 'closed-signal',
      module: 'moradia',
      title: 'Anuncio encerrado',
      status: 'published',
      ...signals,
    });

    expect(post.isClosed).toBe(true);
  });
});

describe('kc-api.posts-normalize.js - html loading order', () => {
  test('os carregadores reais incluem posts-normalize entre authors e kc-api.client.js', () => {
    HTML_FILES_WITH_CLIENT.forEach((file) => {
      const html = fs.readFileSync(path.resolve(__dirname, '..', '..', file), 'utf8');
      const filtersIdx = html.indexOf('kc-api.filters.js');
      const authorsIdx = html.indexOf('kc-api.authors.js');
      const postsNormalizeIdx = html.indexOf('kc-api.posts-normalize.js');
      const clientIdx = html.indexOf('kc-api.client.js');

      expect(filtersIdx).toBeGreaterThan(-1);
      expect(authorsIdx).toBeGreaterThan(-1);
      expect(postsNormalizeIdx).toBeGreaterThan(-1);
      expect(clientIdx).toBeGreaterThan(-1);
      expect(filtersIdx).toBeLessThan(authorsIdx);
      expect(authorsIdx).toBeLessThan(postsNormalizeIdx);
      expect(postsNormalizeIdx).toBeLessThan(clientIdx);
    });
  });
});

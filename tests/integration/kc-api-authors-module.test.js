/**
 * @file kc-api-authors-module.test.js
 * @description Contract tests for assets/js/api/kc-api.authors.js (V76)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../assets/js/api/kc-api.authors.js');
const CLIENT_SRC = path.resolve(__dirname, '../../assets/js/api/kc-api.client.js');
const PAGE_MANIFEST = require('../../scripts/admin-pages.manifest.js');
const HTML_FILES_WITH_CLIENT = Object.freeze(PAGE_MANIFEST.ALL_HTML_PAGES.filter((page) => (
  page !== '404.html' && page !== 'admin/cadu.html'
)));

let source;
let clientSource;

function loadFreshAuthorsModule() {
  jest.resetModules();
  delete window._KCAPI;
  require('../../assets/js/api/kc-api.authors.js');
  require('../../assets/js/api/kc-api.posts-normalize.js');
  return window._KCAPI.authors;
}

beforeAll(() => {
  source = fs.readFileSync(SRC, 'utf8');
  clientSource = fs.readFileSync(CLIENT_SRC, 'utf8');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('kc-api.authors.js - source shape', () => {
  test('mantem IIFE, strict mode e namespace interno congelado', () => {
    expect(source).toContain('(function () {');
    expect(source).toContain("'use strict';");
    expect(source).toContain('window._KCAPI = window._KCAPI || {};');
    expect(source).toContain('window._KCAPI.authors = Object.freeze({');
    expect(source.trim().endsWith('})();')).toBe(true);
  });

  test('nao cria nova fachada KCAPI nem usa require/import', () => {
    expect(source).not.toContain('window.KCAPI =');
    expect(source).not.toContain('require(');
    expect(source).not.toContain('import ');
  });

  test('kc-api.client.js delega autores e nao mantem indice/mock local', () => {
    expect(clientSource).toContain('function getAuthorsModule()');
    expect(clientSource).toContain("throw new Error('KCAPI authors module not loaded.');");
    expect(clientSource).toContain('return getAuthorsModule().getAuthorById(id);');
    expect(clientSource).toContain('return getAuthorsModule().resolveAuthorId(legacyName, legacyAvatarUrl);');
    expect(clientSource).not.toContain('const MOCK_USERS = Object.freeze({');
    expect(clientSource).not.toContain('const LEGACY_AUTHOR_INDEX =');
    expect(clientSource).not.toContain('function normalizeUserProfile(user) {');
  });
});

describe('kc-api.authors.js - module contract', () => {
  let authors;

  beforeEach(() => {
    authors = loadFreshAuthorsModule();
  });

  test('exporta mocks e helpers internos esperados', () => {
    expect(Object.isFrozen(authors)).toBe(true);
    expect(Object.keys(authors).sort()).toEqual([
      'MOCK_USERS',
      'MOCK_USERS_BY_ID',
      'MOCK_USERS_LIST',
      'getAuthorById',
      'normalizeUserProfile',
      'resolveAuthorId',
    ]);
    expect(Object.isFrozen(authors.MOCK_USERS)).toBe(true);
    expect(Object.isFrozen(authors.MOCK_USERS_BY_ID)).toBe(true);
    expect(Object.isFrozen(authors.MOCK_USERS_LIST)).toBe(true);
  });

  test('mantem 42 usuarios mock mais USER_SELF', () => {
    expect(Object.keys(authors.MOCK_USERS)).toHaveLength(43);
    expect(authors.MOCK_USERS_LIST).toHaveLength(43);
    expect(authors.MOCK_USERS.USER_SELF.displayName).toBe('Voc\u00ea');
  });

  test('normaliza perfil de usuario preservando aliases legado e novo', () => {
    const profile = authors.normalizeUserProfile({
      id: 'u1',
      displayName: 'Nome Legado',
      avatarUrl: 'avatar.png',
    });

    expect(Object.isFrozen(profile)).toBe(true);
    expect(profile).toEqual({
      id: 'u1',
      name: 'Nome Legado',
      avatar: 'avatar.png',
      displayName: 'Nome Legado',
      avatarUrl: 'avatar.png',
    });
  });

  test('resolve autor por id e por indice legado nome/avatar', () => {
    expect(authors.getAuthorById('USER_10')).toMatchObject({
      id: 'USER_10',
      name: 'Jo\u00e3o Pedro',
      displayName: 'Jo\u00e3o Pedro',
    });
    expect(authors.resolveAuthorId('Rafael Almeida', 'https://i.pravatar.cc/150?img=12')).toBe('USER_01');
    expect(authors.resolveAuthorId('Rafael Almeida', '')).toBe('USER_01');
    expect(authors.resolveAuthorId('', '')).toBeNull();
  });

  test('preserva KCAPI.MOCK_USERS e KCAPI.getAuthorById como superficie publica', () => {
    require('../../assets/js/api/kc-api.client.js');

    expect(window.KCAPI.MOCK_USERS.USER_01.displayName).toBe('Rafael Almeida');
    expect(window.KCAPI.MOCK_USERS_LIST).toHaveLength(43);
    expect(window.KCAPI.MOCK_USERS_BY_ID.USER_SELF.displayName).toBe('Voc\u00ea');
    expect(window.KCAPI.getAuthorById('USER_10')).toMatchObject({
      id: 'USER_10',
      name: 'Jo\u00e3o Pedro',
    });
  });
});

describe('kc-api.authors.js - html loading order', () => {
  test('os carregadores reais incluem authors entre filters e kc-api.client.js', () => {
    HTML_FILES_WITH_CLIENT.forEach((file) => {
      const html = fs.readFileSync(path.resolve(__dirname, '..', '..', file), 'utf8');
      const diagnosticsIdx = html.indexOf('kc-api.diagnostics.js');
      const sessionIdx = html.indexOf('kc-api.session.js');
      const filtersIdx = html.indexOf('kc-api.filters.js');
      const authorsIdx = html.indexOf('kc-api.authors.js');
      const clientIdx = html.indexOf('kc-api.client.js');

      expect(diagnosticsIdx).toBeGreaterThan(-1);
      expect(sessionIdx).toBeGreaterThan(-1);
      expect(filtersIdx).toBeGreaterThan(-1);
      expect(authorsIdx).toBeGreaterThan(-1);
      expect(clientIdx).toBeGreaterThan(-1);
      expect(diagnosticsIdx).toBeLessThan(sessionIdx);
      expect(sessionIdx).toBeLessThan(filtersIdx);
      expect(filtersIdx).toBeLessThan(authorsIdx);
      expect(authorsIdx).toBeLessThan(clientIdx);
    });
  });
});

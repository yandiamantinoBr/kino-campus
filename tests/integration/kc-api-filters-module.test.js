/**
 * @file kc-api-filters-module.test.js
 * @description Contract tests for assets/js/api/kc-api.filters.js (V76)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../assets/js/api/kc-api.filters.js');
const CLIENT_SRC = path.resolve(__dirname, '../../assets/js/api/kc-api.client.js');
const PAGE_MANIFEST = require('../../scripts/admin-pages.manifest.js');
const HTML_FILES_WITH_CLIENT = Object.freeze(PAGE_MANIFEST.ALL_HTML_PAGES.concat(['mensagens.html']));

let source;
let clientSource;

function loadFreshFiltersModule() {
  jest.resetModules();
  delete window._KCAPI;
  require('../../assets/js/api/kc-api.filters.js');
  require('../../assets/js/api/kc-api.authors.js');
  return window._KCAPI.filters;
}

beforeAll(() => {
  source = fs.readFileSync(SRC, 'utf8');
  clientSource = fs.readFileSync(CLIENT_SRC, 'utf8');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('kc-api.filters.js - source shape', () => {
  test('mantem IIFE, strict mode e namespace interno congelado', () => {
    expect(source).toContain('(function () {');
    expect(source).toContain("'use strict';");
    expect(source).toContain('window._KCAPI = window._KCAPI || {};');
    expect(source).toContain('window._KCAPI.filters = Object.freeze({');
    expect(source.trim().endsWith('})();')).toBe(true);
  });

  test('nao cria nova fachada KCAPI nem usa require/import', () => {
    expect(source).not.toContain('window.KCAPI =');
    expect(source).not.toContain('require(');
    expect(source).not.toContain('import ');
  });

  test('kc-api.client.js delega filterPosts e nao mantem helpers avancados locais', () => {
    expect(clientSource).toContain('function getFiltersModule()');
    expect(clientSource).toContain('return getFiltersModule().filterPosts(posts, params);');
    expect(clientSource).not.toContain('function matchesAdvancedRequestParams(post, params) {');
    expect(clientSource).not.toContain('function normalizeFilterText(value) {');
  });
});

describe('kc-api.filters.js - module contract', () => {
  let filters;

  beforeEach(() => {
    filters = loadFreshFiltersModule();
  });

  test('exporta os helpers internos esperados', () => {
    expect(Object.isFrozen(filters)).toBe(true);
    expect(Object.keys(filters).sort()).toEqual([
      'filterPosts',
      'getCurrentDateKey',
      'getDateKeyInZone',
      'getEventDateKey',
      'matchesAdvancedRequestParams',
      'matchesDatePresetFilter',
      'normalizeDatePreset',
      'normalizeFilterText',
      'slugifyFilterKey',
    ]);
  });

  test('filtra marketplace por categoria, condicao, preco e verificado', () => {
    const posts = [
      { id: 'ok', module: 'compra-venda', category: 'Eletronicos', price: 250, metadata: { condicao: 'Semi-novo' }, authorVerified: true },
      { id: 'wrong-price', module: 'compra-venda', category: 'Eletronicos', price: 80, metadata: { condicao: 'Semi-novo' }, authorVerified: true },
      { id: 'wrong-condition', module: 'compra-venda', category: 'Eletronicos', price: 250, metadata: { condicao: 'Usado' }, authorVerified: true },
      { id: 'wrong-module', module: 'moradia', category: 'Eletronicos', price: 250, metadata: { condicao: 'Semi-novo' }, authorVerified: true },
    ];

    const result = filters.filterPosts(posts, {
      module: 'compra-venda',
      marketCats: ['eletronicos'],
      marketConds: ['seminovo'],
      marketVerified: true,
      priceMin: 100,
      priceMax: 500,
    });

    expect(result.map((post) => post.id)).toEqual(['ok']);
  });

  test('filtra recencia por datePreset usando created_at em America/Sao_Paulo', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-06T12:00:00-03:00'));

    try {
      const posts = [
        { id: 'recent', module: 'moradia', created_at: '2026-04-06T09:00:00-03:00' },
        { id: 'week-old', module: 'moradia', created_at: '2026-04-01T09:00:00-03:00' },
        { id: 'old', module: 'moradia', created_at: '2026-03-01T09:00:00-03:00' },
      ];

      const result = filters.filterPosts(posts, { module: 'moradia', datePreset: 'last7d' });
      expect(result.map((post) => post.id)).toEqual(['recent', 'week-old']);
    } finally {
      jest.useRealTimers();
    }
  });

  test('filtra eventos por data_evento e usa created_at como fallback', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-06T12:00:00-03:00'));

    try {
      const posts = [
        { id: 'event-next', module: 'eventos', metadata: { data_evento: '2026-04-10' }, created_at: '2026-04-01T09:00:00-03:00' },
        { id: 'event-fallback-today', module: 'eventos', metadata: {}, created_at: '2026-04-06T08:30:00-03:00' },
        { id: 'event-past', module: 'eventos', metadata: { data: '2026-04-02' }, created_at: '2026-04-02T08:30:00-03:00' },
      ];

      const next7d = filters.filterPosts(posts, { module: 'eventos', datePreset: 'next7d' });
      const today = filters.filterPosts(posts, { module: 'eventos', datePreset: 'today' });

      expect(next7d.map((post) => post.id)).toEqual(['event-next', 'event-fallback-today']);
      expect(today.map((post) => post.id)).toEqual(['event-fallback-today']);
    } finally {
      jest.useRealTimers();
    }
  });

  test('preserva KCAPI.filterPosts como delegacao publica', () => {
    require('../../assets/js/api/kc-api.authors.js');
    require('../../assets/js/api/kc-api.client.js');

    const posts = [
      { id: 'hit', module: 'achados-perdidos', categoria: 'perdido', subcategoria: 'documento', lostFoundLocationKey: 'biblioteca' },
      { id: 'miss', module: 'achados-perdidos', categoria: 'encontrado', subcategoria: 'documento', lostFoundLocationKey: 'biblioteca' },
    ];

    const result = window.KCAPI.filterPosts(posts, {
      module: 'achados-perdidos',
      lfStatus: ['perdido'],
      lfType: ['documento'],
      lfLocation: 'biblioteca',
    });

    expect(result.map((post) => post.id)).toEqual(['hit']);
  });
});

describe('kc-api.filters.js - html loading order', () => {
  test('os carregadores reais incluem filters antes de authors e kc-api.client.js', () => {
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

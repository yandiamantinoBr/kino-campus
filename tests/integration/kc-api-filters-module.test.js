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
const HTML_FILES_WITH_CLIENT = Object.freeze(PAGE_MANIFEST.ALL_HTML_PAGES.filter((page) => (
  page !== '404.html' && page !== 'admin/cadu.html'
)));

let source;
let clientSource;

function loadFreshFiltersModule() {
  jest.resetModules();
  delete window._KCAPI;
  delete window.KCFeedFilters;
  require('../../assets/js/api/kc-api.filters.js');
  require('../../assets/js/api/kc-api.authors.js');
  require('../../assets/js/api/kc-api.posts-normalize.js');
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
      'getEventDateRange',
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

  test.each([
    ['eventos', 'academicos', 'academico'],
    ['oportunidades', 'empregos', 'emprego'],
    ['moradia', 'quartos', 'quarto'],
    ['caronas', 'ofereco', 'ofereco carona'],
    ['achados-perdidos', 'encontrados', 'achado'],
    ['compra-venda', 'ingressos', 'ingresso'],
  ])('aceita alias legado de categoria em %s', (moduleKey, requested, stored) => {
    const posts = [{ id: 'legacy', module: moduleKey, category: stored }];
    expect(filters.filterPosts(posts, { module: moduleKey, category: requested }).map((post) => post.id)).toEqual(['legacy']);
  });

  test('busca também em categoria, tags e localização com normalização de acentos', () => {
    const posts = [
      { id: 'category', module: 'compra-venda', title: 'Item', category: 'Eletrônicos' },
      { id: 'location', module: 'caronas', title: 'Viagem', metadata: { origem: 'Câmpus Samambaia' } },
      { id: 'tag', module: 'oportunidades', title: 'Vaga', tagKeys: ['linguistica-aplicada'] },
    ];

    expect(filters.filterPosts(posts, { q: 'eletronicos' }).map((post) => post.id)).toEqual(['category']);
    expect(filters.filterPosts(posts, { q: 'campus samambaia' }).map((post) => post.id)).toEqual(['location']);
    expect(filters.filterPosts(posts, { q: 'linguística' }).map((post) => post.id)).toEqual(['tag']);
  });

  test('trata hífens e pontuação como separadores equivalentes na busca', () => {
    const posts = [
      { id: 'course', module: 'oportunidades', category: 'cursos-capacitacoes', title: 'Formação' },
      { id: 'campus', module: 'caronas', title: 'Trajeto', metadata: { origem: 'Câmpus Samambaia' } },
    ];

    expect(filters.filterPosts(posts, { q: 'cursos capacitações' }).map((post) => post.id)).toEqual(['course']);
    expect(filters.filterPosts(posts, { q: 'campus-samambaia' }).map((post) => post.id)).toEqual(['campus']);
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

  test('filtra eventos pelo intervalo e não usa created_at como data do evento', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-06T12:00:00-03:00'));

    try {
      const posts = [
        { id: 'event-next', module: 'eventos', metadata: { data_evento: '2026-04-10' }, created_at: '2026-04-01T09:00:00-03:00' },
        { id: 'event-ongoing', module: 'eventos', metadata: { data_evento: '2026-04-01', data_fim_evento: '2026-04-10' }, created_at: '2026-04-01T08:30:00-03:00' },
        { id: 'event-no-date', module: 'eventos', metadata: {}, created_at: '2026-04-06T08:30:00-03:00' },
        { id: 'event-past', module: 'eventos', metadata: { data: '2026-04-02' }, created_at: '2026-04-02T08:30:00-03:00' },
      ];

      const next7d = filters.filterPosts(posts, { module: 'eventos', datePreset: 'next7d' });
      const today = filters.filterPosts(posts, { module: 'eventos', datePreset: 'today' });

      expect(next7d.map((post) => post.id)).toEqual(['event-next', 'event-ongoing']);
      expect(today.map((post) => post.id)).toEqual(['event-ongoing']);
    } finally {
      jest.useRealTimers();
    }
  });

  test('normaliza thisMonth no fallback isolado e exclui evento fora do mês', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-06T12:00:00-03:00'));

    try {
      expect(filters.normalizeDatePreset('eventos', 'thisMonth')).toBe('thisMonth');
      const posts = [
        { id: 'april', module: 'eventos', metadata: { data_evento: '2026-04-30' } },
        { id: 'may', module: 'eventos', metadata: { data_evento: '2026-05-01' } },
      ];
      expect(filters.filterPosts(posts, { module: 'eventos', datePreset: 'thisMonth' }).map((post) => post.id)).toEqual(['april']);
    } finally {
      jest.useRealTimers();
    }
  });

  test('preserva KCAPI.filterPosts como delegacao publica', () => {
    require('../../assets/js/api/kc-api.authors.js');
  require('../../assets/js/api/kc-api.posts-normalize.js');
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

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const Parser = require('../../assets/js/shared/kc-search-query-parser.shared.js');
const Registry = require('../../assets/js/shared/kc-search-fields.shared.js');
const corpus = require('../fixtures/search-golden-queries.v1.json');

function buildRegistry() {
  const resolvers = {
    getCaronasCampusOptions: () => [],
    getCaronasFeatureOptions: () => [],
    getHousingRegionOptions: () => [],
    getHousingFeatureOptions: () => [],
    getLostFoundLocationOptions: () => [],
    getOpportunityAreaOptions: () => [],
    normalizeOpportunityTypeKey: (value) => String(value || '').replace(/s$/, '')
  };
  const context = { window: { _KCCreatePost: { resolvers } }, console };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'assets/js/features/create-post/kc-create-post.schema.js'), 'utf8'),
    context
  );
  context.window._KCCreatePost.resolvers = resolvers;
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'assets/js/features/create-post/kc-create-post.fields.js'), 'utf8'),
    context
  );
  return Registry.buildRegistry(context.window._KCCreatePost.schema, context.window._KCCreatePost.fields);
}

const registry = buildRegistry();

describe('KCSearchQueryParser — contrato offline', () => {
  test('é UMD versionado e permanece fora de todos os HTMLs', () => {
    const source = fs.readFileSync(path.join(ROOT, 'assets/js/shared/kc-search-query-parser.shared.js'), 'utf8');
    const htmlFiles = fs.readdirSync(ROOT)
      .filter((name) => name.endsWith('.html'))
      .map((name) => path.join(ROOT, name))
      .concat(fs.readdirSync(path.join(ROOT, 'admin'))
        .filter((name) => name.endsWith('.html'))
        .map((name) => path.join(ROOT, 'admin', name)));

    expect(Parser.VERSION).toBe('1.0.0');
    expect(source).toContain('root.KCSearchQueryParser = factory();');
    htmlFiles.forEach((file) => {
      expect(fs.readFileSync(file, 'utf8')).not.toContain('kc-search-query-parser.shared.js');
    });
  });

  test('consulta vazia produz resultado seguro sem intenção', () => {
    expect(Parser.parse('', { registry })).toEqual({
      version: '1.0.0',
      query: '',
      normalizedQuery: '',
      module: null,
      intent: null,
      filters: {},
      confidence: 0
    });
  });

  test('consulta desconhecida não força módulo ou intenção', () => {
    expect(Parser.parse('xyzabc sem contexto conhecido', { registry })).toEqual(expect.objectContaining({
      module: null,
      intent: null,
      filters: {},
      confidence: 0.2
    }));
  });

  test('limita entrada antes de normalizar e aplicar regras', () => {
    const parsed = Parser.parse('evento ' + 'x'.repeat(500), { registry });
    expect(Parser.MAX_QUERY_LENGTH).toBe(240);
    expect(parsed.query).toHaveLength(240);
    expect(parsed.module).toBe('eventos');
  });

  test.each(corpus.queries)('$id identifica módulo, intenção e filtros da consulta principal', (entry) => {
    const parsed = Parser.parse(entry.query, { registry });
    expect(parsed.module).toBe(entry.expected.module);
    expect(parsed.intent).toBe(entry.expected.intent);
    expect(parsed.filters).toEqual(entry.expected.filters);
    expect(parsed.confidence).toBeGreaterThanOrEqual(0.5);
  });

  test.each(corpus.queries)('$id mantém módulo e intenção nas variantes sintéticas', (entry) => {
    entry.variants.forEach((variant) => {
      const parsed = Parser.parse(variant, { registry });
      expect(parsed.module).toBe(entry.expected.module);
      expect(parsed.intent).toBe(entry.expected.intent);
    });
  });

  test('não produz campos de perfil, contato ou identificadores', () => {
    corpus.queries.forEach((entry) => {
      const serialized = JSON.stringify(Parser.parse(entry.query, { registry })).toLowerCase();
      ['user_id', 'session_id', 'contato', 'email', 'gender', 'race', 'token'].forEach((key) => {
        expect(serialized).not.toContain(key);
      });
    });
  });
});

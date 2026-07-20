/**
 * @file kc-create-post-schema.test.js
 * @description Static contract tests for assets/js/features/create-post/kc-create-post.schema.js (v11.31.2)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', '..', 'assets', 'js', 'features', 'create-post', 'kc-create-post.schema.js');
const HTML_LOADERS = [
  '_product.html',
  'achados-perdidos.html',
  'caronas-feed.html',
  'compra-venda-feed.html',
  'create-post.html',
  'eventos.html',
  'index.html',
  'moradia.html',
  'my-posts.html',
  'ods.html',
  'oportunidades.html',
  'search-results.html',
];

let source;

beforeAll(() => {
  source = fs.readFileSync(SRC, 'utf8');
});

describe('kc-create-post.schema — source shape', () => {
  test('keeps the asset as an IIFE with strict mode and no imports', () => {
    expect(source).toContain('(function () {');
    expect(source).toContain("'use strict';");
    expect(source).toContain('window._KCCreatePost = window._KCCreatePost || {};');
    expect(source).not.toContain('require(');
    expect(source).not.toContain('import ');
  });

  test('exports the schema namespace before the main runtime consumes it', () => {
    expect(source).toContain('window._KCCreatePost.schema = {');
    expect(source).toContain("modalId: 'kcCreatePostModalOverlay'");
    expect(source).toContain('visibilityOptions: Object.freeze([');
    expect(source).toContain('modules: {');
  });
});

describe('kc-create-post.schema — module contracts', () => {
  test('keeps the 6 module schemas and their redirects', () => {
    expect(source).toContain("'compra-venda': {");
    expect(source).toContain("'caronas': {");
    expect(source).toContain("'moradia': {");
    expect(source).toContain("'eventos': {");
    expect(source).toContain("'achados-perdidos': {");
    expect(source).toContain("'oportunidades': {");
    expect(source).toContain("redirect: 'compra-venda-feed.html'");
    expect(source).toContain("redirect: 'oportunidades.html'");
  });

  test('keeps ingressos as a first-class compra-venda category', () => {
    expect(source).toContain("categoryGroupId: 'categoria'");
    expect(source).toContain("key: 'ingressos'");
  });

  test('expande subtópicos de eventos para formatos acadêmicos úteis', () => {
    expect(source).toContain("key: 'palestras'");
    expect(source).toContain("label: 'Palestras'");
    expect(source).toContain("key: 'congressos'");
    expect(source).toContain("label: 'Congressos'");
    expect(source).toContain("key: 'cursos'");
    expect(source).toContain("label: 'Cursos'");
    expect(source).toContain("emoji: '🎓'");
  });

  test('expande tipos de oportunidades além de vagas tradicionais', () => {
    expect(source).toContain("key: 'editais'");
    expect(source).toContain("label: 'Editais'");
    expect(source).toContain("key: 'concursos'");
    expect(source).toContain("label: 'Concursos'");
    expect(source).toContain("key: 'bolsas'");
    expect(source).toContain("label: 'Bolsas'");
    expect(source).toContain("key: 'cursos-capacitacoes'");
    expect(source).toContain("label: 'Cursos e capacitações'");
  });
});

describe('kc-create-post.schema — loader order', () => {
  test.each(HTML_LOADERS)('%s loads kc-create-post.schema.js before kc-create-post.js', (htmlFile) => {
    const html = fs.readFileSync(path.resolve(__dirname, '..', '..', htmlFile), 'utf8');
    const schemaIndex = html.indexOf('assets/js/features/create-post/kc-create-post.schema.js');
    const runtimeIndex = html.indexOf('assets/js/features/create-post/kc-create-post.js');

    expect(schemaIndex).toBeGreaterThanOrEqual(0);
    expect(runtimeIndex).toBeGreaterThanOrEqual(0);
    expect(schemaIndex).toBeLessThan(runtimeIndex);
  });
});

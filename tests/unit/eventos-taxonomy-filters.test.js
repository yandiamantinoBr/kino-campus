'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const PAGE = read('eventos.html');
const FILTERS = read('assets/js/features/kc-filters.js');
const SORT = read('assets/js/core/kc-core-widgets.js');
const HOME = read('assets/js/shared/home-categories.shared.js');
const SCHEMA = read('assets/js/features/create-post/kc-create-post.schema.js');

const CANONICAL = [
  'academicos',
  'palestras',
  'congressos',
  'cursos',
  'culturais',
  'esportivos',
  'workshops',
  'festas',
  'sustentabilidade',
];

describe('eventos taxonomy + filter contracts', () => {
  test('create-post schema, page tabs and sidebar share the same category keys', () => {
    CANONICAL.forEach((key) => {
      expect(SCHEMA).toContain(`key: '${key}'`);
      expect(PAGE).toContain(`data-category="${key}"`);
      expect(PAGE).toContain(`href="#${key}"`);
      expect(HOME).toContain(`createEntry('eventos', '${key}'`);
    });
    expect(PAGE).toContain('data-category="todas"');
    // Removed phantom "tecnologia" tab that never existed in create-post schema.
    expect(HOME).not.toContain("createEntry('eventos', 'tecnologia'");
  });

  test('kc-filters does not wipe sort tabs when rendering dynamic categories', () => {
    expect(FILTERS).toContain("tabsContainer.querySelector('[data-feed-tab]')");
    expect(FILTERS).toContain('return;');
    expect(FILTERS).toContain('.kc-category-item');
    expect(FILTERS).toContain('hashchange');
    expect(FILTERS).toContain('function selectCategory');
  });

  test('module sort tabs use ?sort= and preserve category hash', () => {
    expect(SORT).toContain("params.get('sort')");
    expect(SORT).toContain("searchParams.set('sort'");
    expect(SORT).toContain('Preserve category hash');
    expect(SORT).not.toMatch(/var hash = key === 'destaques' \? '' : '#' \+ key/);
  });

  test('eventos page wires cache-busted filter and sort scripts', () => {
    expect(PAGE).toContain('kc-filters.js?v=8.6.6');
    expect(PAGE).toContain('kc-feed-filters.js?v=8.6.3');
    expect(PAGE).toContain('kc-core-widgets.js?v=8.6.3');
    expect(PAGE).toContain('home-categories.shared.js?v=8.6.2');
  });
});

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const r = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('Busca fuzzy em filtros locais sem ocupar o #searchInput global', () => {
  test('search.js usa KCSearchShared.matchesQueryText no filtro de cards', () => {
    const source = r('assets/js/features/kc-search.js');
    expect(source).toContain('searchShared.matchesQueryText');
  });

  test('kc-filters unificado herda o motor compartilhado', () => {
    const source = r('assets/js/features/kc-filters.js');
    expect(source).toContain('window.KCSearchShared');
    expect(source).toContain('shared.matchesQueryText');
  });

  test('kc-filters reserva #searchInput para a busca global do header', () => {
    const source = r('assets/js/features/kc-filters.js');
    expect(source).toContain('searchInputId: "kcLocalSearchInput"');
    expect(source).not.toContain('searchInputId: "searchInput"');
  });

  test('feeds modulares com filtro próprio não ficam presos em includes puro', () => {
    [
      'assets/js/controllers/public/compra-venda-feed.controller.js',
      'assets/js/controllers/public/moradia.controller.js',
      'assets/js/controllers/public/achados-perdidos.controller.js',
      'assets/js/controllers/public/oportunidades.normalize.js',
    ].forEach((file) => {
      const source = r(file);
      expect(source).toContain('KCSearchShared');
      expect(source).toContain('matchesQueryText');
    });
  });
});

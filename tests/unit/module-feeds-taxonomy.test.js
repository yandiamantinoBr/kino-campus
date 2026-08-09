'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const HOME = read('assets/js/shared/home-categories.shared.js');
const FILTERS = read('assets/js/features/kc-filters.js');
const SORT = read('assets/js/core/kc-core-widgets.js');

const PAGES = {
  moradia: read('moradia.html'),
  oportunidades: read('oportunidades.html'),
  caronas: read('caronas-feed.html'),
  compra: read('compra-venda-feed.html'),
  achados: read('achados-perdidos.html'),
  eventos: read('eventos.html'),
};

describe('module feeds taxonomy + filter contracts', () => {
  test('all module pages load fixed filters and sort widgets', () => {
    Object.entries(PAGES).forEach(([name, html]) => {
      expect(html).toContain('kc-filters.js?v=8.6.5');
      expect(html).toContain('kc-feed-filters.js?v=8.6.3');
      expect(html).toContain('kc-core-widgets.js?v=8.6.3');
      expect(html).toContain('data-kc-filters="tab-search"');
    });
  });

  test('category chips expose data-category keys on every module feed', () => {
    expect(PAGES.moradia).toContain('data-category="republicas"');
    expect(PAGES.moradia).toContain('data-category="todas"');
    expect(PAGES.oportunidades).toContain('data-category="editais"');
    expect(PAGES.oportunidades).toContain('data-category="cursos-capacitacoes"');
    expect(PAGES.caronas).toContain('data-category="ofereco"');
    expect(PAGES.caronas).toContain('data-category="procuro"');
    expect(PAGES.compra).toContain('data-category="ingressos"');
    expect(PAGES.achados).toContain('data-category="perdidos"');
    expect(PAGES.eventos).toContain('data-category="festas"');
  });

  test('home-categories catalog matches create-post schema keys', () => {
    expect(HOME).toContain("createEntry('moradia', 'republicas'");
    expect(HOME).toContain("createEntry('oportunidades', 'editais'");
    expect(HOME).toContain("createEntry('oportunidades', 'cursos-capacitacoes'");
    expect(HOME).toContain("createEntry('compra-venda', 'ingressos'");
    expect(HOME).toContain("createEntry('achados-perdidos', 'perdidos'");
    expect(HOME).not.toContain("createEntry('oportunidades', 'mobilidade'");
    expect(HOME).not.toContain("createEntry('eventos', 'tecnologia'");
  });

  test('shared filter layer preserves sort tabs and wires sidebar categories', () => {
    expect(FILTERS).toContain("tabsContainer.querySelector('[data-feed-tab]')");
    expect(FILTERS).toContain('.kc-category-item');
    expect(FILTERS).toContain('hashchange');
    expect(SORT).toContain("params.get('sort')");
    expect(SORT).toContain('Preserve category hash');
  });
});

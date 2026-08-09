describe('feed category authority', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-kc-filters');
    window.history.replaceState({}, '', '/oportunidades.html');
    delete window.KCFeedFilters;
    delete window.kcFilters;
    delete window.filterPosts;
    delete window.KCHomeCategories;
    window.matchMedia = jest.fn().mockImplementation(() => ({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
    }));
  });

  test('canonicaliza aliases somente dentro da autoridade do modulo', () => {
    require('../../assets/js/features/kc-feed-filters.js');
    const filters = window.KCFeedFilters;

    expect(filters.canonicalCategoryKey('oportunidades', 'cursos-capacitacoes')).toBe('cursos-capacitacoes');
    expect(filters.canonicalCategoryKey('oportunidade', 'curso-capacitacao')).toBe('cursos-capacitacoes');
    expect(filters.canonicalCategoryKey('oportunidades', 'curso-capacitacoes')).toBe('cursos-capacitacoes');
    expect(filters.canonicalCategoryKey('oportunidades', 'cursos-capacitacao')).toBe('cursos-capacitacoes');
    expect(filters.canonicalCategoryKey('oportunidades', 'Cursos e capacitacoes')).toBe('cursos-capacitacoes');
    expect(filters.canonicalCategoryKey('oportunidades', 'cursos')).toBe('cursos-capacitacoes');
    expect(filters.canonicalCategoryKey('oportunidades', 'voluntariados')).toBe('voluntariado');
    expect(filters.canonicalCategoryKey('eventos', 'cursos')).toBe('cursos');
    expect(filters.canonicalCategoryKey('moradia', 'procurando-moradia')).toBe('procurando');

    expect(filters.categoryMatches({
      moduleKey: 'oportunidades',
      selectedCategory: 'cursos-capacitacoes',
      primaryCategory: 'curso-capacitacao',
    })).toBe(true);
    expect(filters.categoryMatches({
      moduleKey: 'oportunidades',
      selectedCategory: 'cursos-capacitacoes',
      tagCategories: 'ufg cursos-capacitacoes remoto',
    })).toBe(true);
    expect(filters.categoryMatches({
      moduleKey: 'oportunidades',
      selectedCategory: 'cursos-capacitacoes',
      primaryCategory: 'pesquisa',
      tagCategories: 'curso-capacitacao-extra',
    })).toBe(false);
    expect(filters.categoryMatches({
      moduleKey: 'oportunidades',
      selectedCategory: 'cursos-capacitacoes',
      tagCategories: 'ufg curso-capacitacao-extra remoto',
    })).toBe(false);
  });

  test('normaliza aliases de URL com o mesmo catalogo usado pelos cards e chips', () => {
    window.history.replaceState({}, '', '/oportunidades.html?tab=Cursos%20e%20capacitacoes');
    document.body.setAttribute('data-kc-filters', 'tab-search');
    document.body.innerHTML = `
      <nav class="kc-feed-tabs">
        <a data-category="todas" href="#todas" class="active">Todas</a>
        <a data-category="cursos-capacitacoes" href="#cursos-capacitacoes">Cursos</a>
      </nav>
      <article class="kc-card" data-module="oportunidades" data-category="curso-capacitacao">
        <h2 class="kc-card__title">Curso</h2>
        <p class="kc-card__description-preview">Descricao</p>
      </article>
      <div id="noResults"></div>
    `;

    require('../../assets/js/features/kc-filters.js');
    require('../../assets/js/features/kc-feed-filters.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(window.kcFilters.getState().category).toBe('cursos-capacitacoes');
    expect(document.querySelector('[data-category="cursos-capacitacoes"]').classList.contains('active')).toBe(true);
    expect(document.querySelector('.kc-card').style.display).toBe('');
  });

  test('decodifica alias externo no hash antes de selecionar categoria', () => {
    window.history.replaceState({}, '', '/oportunidades.html#Cursos%20e%20capacitacoes');
    document.body.setAttribute('data-kc-filters', 'tab-search');
    document.body.innerHTML = `
      <nav class="kc-feed-tabs">
        <a data-category="todas" href="#todas" class="active">Todas</a>
        <a data-category="cursos-capacitacoes" href="#cursos-capacitacoes">Cursos</a>
      </nav>
      <article class="kc-card" data-module="oportunidades" data-category="cursos-capacitacoes">
        <h2 class="kc-card__title">Curso</h2>
        <p class="kc-card__description-preview">Descricao</p>
      </article>
      <div id="noResults"></div>
    `;

    require('../../assets/js/features/kc-filters.js');
    require('../../assets/js/features/kc-feed-filters.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(window.kcFilters.getState().category).toBe('cursos-capacitacoes');
    expect(document.querySelector('[data-category="cursos-capacitacoes"]').classList.contains('active')).toBe(true);
    expect(document.querySelector('.kc-card').style.display).toBe('');
  });

  test('exibe os seis cursos migrados e preserva busca e predicado adicional', () => {
    const fixtures = [
      ['c848f243-077b-4dc8-bf52-86572af7f5fb', 'cursos-capacitacoes', 'ufg iptsp cursos-capacitacoes saude remoto', 'Movimenta: formacao em saude'],
      ['577ea0ba-a7ad-4f01-8a05-fbd0a4b4fbe4', 'curso-capacitacao', 'ufg fen cursos-capacitacoes saude presencial', 'Capacitacao FEN'],
      ['fffdc11c-2855-4a8d-9cb2-c10cad863888', 'cursos-capacitacoes', 'cursos-capacitacoes saude presencial', 'Curso presencial'],
      ['498e0054-31f1-458b-8953-3179decdd033', 'curso-capacitacao', 'ufg ig-posufg cursos-capacitacoes tecnologia presencial', 'Formacao em tecnologia'],
      ['ca10120d-7e9b-42f7-971a-db9861540a5b', 'cursos-capacitacoes', 'ufg iptsp cursos-capacitacoes remoto', 'Capacitacao remota IPTSP'],
      ['080f8237-a8fe-4200-b53a-946b7ea934a3', 'curso-capacitacao', 'ufg iesa cursos-capacitacoes remoto', 'Curso remoto IESA'],
    ];
    const cards = fixtures.map(([id, category, tags, title]) => `
      <article class="kc-card" data-post-id="${id}" data-module="oportunidades" data-category="${category}" data-kc-tags="${tags}">
        <h2 class="kc-card__title">${title}</h2>
        <p class="kc-card__description-preview">Descricao do curso</p>
        <span class="kc-card__category-source">Cursos e capacitacoes</span>
      </article>
    `).join('');

    document.body.setAttribute('data-kc-filters', 'tab-search');
    document.body.innerHTML = `
      <nav class="kc-feed-tabs">
        <a data-category="todas" href="#todas" class="active">Todas</a>
        <a data-category="cursos-capacitacoes" href="#cursos-capacitacoes">Cursos</a>
      </nav>
      <input id="kcLocalSearchInput" />
      <div id="noResults"></div>
      ${cards}
      <article class="kc-card" data-post-id="distractor" data-module="oportunidades" data-category="pesquisa" data-kc-tags="curso-capacitacao-extra">
        <h2 class="kc-card__title">Pesquisa nao relacionada</h2>
        <p class="kc-card__description-preview">Descricao</p>
        <span class="kc-card__category-source">Pesquisa</span>
      </article>
    `;

    // Mirrors the production HTML order. The shared authority is consumed at
    // runtime, after both deferred scripts have evaluated.
    require('../../assets/js/features/kc-filters.js');
    require('../../assets/js/features/kc-feed-filters.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    window.kcFilters.setCategory('cursos-capacitacoes');
    fixtures.forEach(([id]) => {
      expect(document.querySelector(`[data-post-id="${id}"]`).style.display).toBe('');
    });
    expect(document.querySelector('[data-post-id="distractor"]').style.display).toBe('none');

    window.kcFilters.setQuery('movimenta');
    expect(document.querySelector(`[data-post-id="${fixtures[0][0]}"]`).style.display).toBe('');
    fixtures.slice(1).forEach(([id]) => {
      expect(document.querySelector(`[data-post-id="${id}"]`).style.display).toBe('none');
    });

    window.kcFilters.setQuery('');
    const excludedId = fixtures[5][0];
    window.kcFilters.setExtraPredicate((card) => card.getAttribute('data-post-id') !== excludedId);
    expect(document.querySelector(`[data-post-id="${fixtures[0][0]}"]`).style.display).toBe('');
    expect(document.querySelector(`[data-post-id="${excludedId}"]`).style.display).toBe('none');
  });
});

const HomeCategories = require('../../assets/js/shared/home-categories.shared.js');

describe('KCHomeCategoryUtils', () => {
  test('findCategoriesBySearchTerm resolve termos para destinos reais dos modulos', () => {
    const results = HomeCategories.findCategoriesBySearchTerm('sustentabilidade', 3);

    expect(results[0]).toMatchObject({
      moduleKey: 'eventos',
      categoryKey: 'sustentabilidade',
      href: 'eventos.html#sustentabilidade'
    });
  });

  test('resolve categorias de oportunidades usadas pelas abas personalizadas', () => {
    expect(HomeCategories.findCategory('oportunidades', 'estagios')).toMatchObject({
      categoryKey: 'estagio',
      label: 'Estágios'
    });
    expect(HomeCategories.findCategory('oportunidades', 'pesquisa')).toMatchObject({
      categoryKey: 'pesquisa',
      href: 'oportunidades.html#pesquisa'
    });
    expect(HomeCategories.findCategory('oportunidades', 'bolsas')).toMatchObject({
      categoryKey: 'bolsa',
      label: 'Bolsas'
    });
  });

  test('resolveCategoriesFromPost usa modulo e categoria normalizados', () => {
    const results = HomeCategories.resolveCategoriesFromPost({
      module: 'moradia',
      category: 'quartos'
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('moradia:quarto');
  });

  test('queuedEventsToAffinityRows agrega deltas pendentes sem duplicar categorias', () => {
    const rows = HomeCategories.queuedEventsToAffinityRows([
      { module_key: 'compra-venda', category_key: 'livros', delta: 4, tracked_at: '2026-03-22T10:00:00Z' },
      { module_key: 'compra-venda', category_key: 'livros', delta: 6, tracked_at: '2026-03-22T10:05:00Z' },
      { module_key: 'eventos', category_key: 'sustentabilidade', delta: 3, tracked_at: '2026-03-22T10:10:00Z' }
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === 'compra-venda:livros')).toMatchObject({
      score: 10,
      interactions_count: 2
    });
    expect(rows.find((row) => row.id === 'eventos:sustentabilidade')).toMatchObject({
      score: 3,
      interactions_count: 1
    });
  });

  test('buildCategoryRows ordena por afinidade e pagina em blocos de 10', () => {
    const result = HomeCategories.buildCategoryRows({
      affinity: [
        { module_key: 'compra-venda', category_key: 'livros', score: 12, interactions_count: 2 },
        { module_key: 'eventos', category_key: 'sustentabilidade', score: 8, interactions_count: 1 }
      ],
      counts: [
        { module_key: 'compra-venda', category_key: 'livros', count: 7 },
        { module_key: 'eventos', category_key: 'sustentabilidade', count: 3 }
      ],
      offset: 0,
      limit: 10
    });

    expect(result.rows[0]).toMatchObject({
      id: 'compra-venda:livros',
      count: 7,
      score: 12
    });
    expect(result.rows[1]).toMatchObject({
      id: 'eventos:sustentabilidade',
      count: 3,
      score: 8
    });
    expect(result.total).toBeGreaterThan(10);
    expect(result.hasMore).toBe(true);
  });
});

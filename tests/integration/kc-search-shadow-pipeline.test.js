'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const Pipeline = require('../../assets/js/shared/kc-search-shadow-pipeline.shared.js');
const Parser = require('../../assets/js/shared/kc-search-query-parser.shared.js');
const Registry = require('../../assets/js/shared/kc-search-fields.shared.js');
const SearchShared = require('../../assets/js/shared/kc-search.shared.js');

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
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/features/create-post/kc-create-post.schema.js'), 'utf8'), context);
  context.window._KCCreatePost.resolvers = resolvers;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/features/create-post/kc-create-post.fields.js'), 'utf8'), context);
  return Registry.buildRegistry(context.window._KCCreatePost.schema, context.window._KCCreatePost.fields);
}

const registry = buildRegistry();
const dependencies = { parser: Parser, registry, projector: Registry, searchShared: SearchShared, limit: 10 };

function opportunityPosts() {
  return [
    {
      id: 'remote',
      title: 'Oportunidade para estudantes',
      description: 'Confira todos os detalhes',
      module: 'oportunidades',
      category: 'estagios',
      metadata: {
        areaLabel: 'Tecnologia',
        workModeLabel: 'Remoto',
        contato: 'nao-expor@example.com',
        link: 'https://example.com/privado'
      }
    },
    {
      id: 'onsite',
      title: 'Estágio em computação',
      description: 'Vaga presencial',
      module: 'oportunidades',
      category: 'estagios',
      metadata: { areaLabel: 'Tecnologia', workModeLabel: 'Presencial' }
    }
  ];
}

describe('KCSearchShadowPipeline — contrato', () => {
  test('é UMD e permanece fora de todos os HTMLs', () => {
    const source = fs.readFileSync(path.join(ROOT, 'assets/js/shared/kc-search-shadow-pipeline.shared.js'), 'utf8');
    const htmlFiles = fs.readdirSync(ROOT).filter((name) => name.endsWith('.html'))
      .map((name) => path.join(ROOT, name))
      .concat(fs.readdirSync(path.join(ROOT, 'admin')).filter((name) => name.endsWith('.html'))
        .map((name) => path.join(ROOT, 'admin', name)));
    expect(Pipeline.VERSION).toBe('1.0.0');
    expect(source).toContain('root.KCSearchShadowPipeline = factory();');
    htmlFiles.forEach((file) => expect(fs.readFileSync(file, 'utf8')).not.toContain('kc-search-shadow-pipeline.shared.js'));
  });

  test('exige parser, registry, projector e busca explicitamente', () => {
    expect(() => Pipeline.runShadow('teste', [], {})).toThrow('KC_SEARCH_SHADOW_PARSER_REQUIRED');
    expect(() => Pipeline.runShadow('teste', [], { parser: Parser })).toThrow('KC_SEARCH_SHADOW_REGISTRY_REQUIRED');
    expect(() => Pipeline.runShadow('teste', [], { parser: Parser, registry })).toThrow('KC_SEARCH_SHADOW_PROJECTOR_REQUIRED');
    expect(() => Pipeline.runShadow('teste', [], { parser: Parser, registry, projector: Registry })).toThrow('KC_SEARCH_SHADOW_SEARCH_REQUIRED');
  });

  test('coloca oportunidade remota estruturada acima do falso positivo presencial', () => {
    const result = Pipeline.runShadow('estágio remoto computação', opportunityPosts(), dependencies);
    expect(result.legacy.map((row) => row.id)).toContain('onsite');
    expect(result.candidate.map((row) => row.id)).toEqual(['remote']);
    expect(result.comparison.supportedFilters).toEqual(expect.arrayContaining(['workMode', 'area']));
    expect(result.comparison.exited).toContain('onsite');
  });

  test('aplica teto de preço e local canônico em moradia', () => {
    const posts = [
      { id: 'affordable', title: 'Quarto disponível', module: 'moradia', category: 'quartos', price: 850, location: 'Câmpus Samambaia' },
      { id: 'expensive', title: 'Quarto disponível', module: 'moradia', category: 'quartos', price: 1500, location: 'Câmpus Samambaia' }
    ];
    const result = Pipeline.runShadow('quarto até 900 perto do samambaia', posts, dependencies);
    expect(result.candidate.map((row) => row.id)).toEqual(['affordable']);
    expect(result.comparison.supportedFilters).toEqual(expect.arrayContaining(['housingType', 'priceMax', 'locationAlias']));
  });

  test('separa evento gratuito de evento pago e registra filtro temporal pendente', () => {
    const posts = [
      { id: 'free', title: 'Evento no Câmpus Colemar', module: 'eventos', metadata: { gratuito: true }, location: 'Câmpus Colemar' },
      { id: 'paid', title: 'Evento no Câmpus Colemar', module: 'eventos', metadata: { gratuito: false }, location: 'Câmpus Colemar' }
    ];
    const result = Pipeline.runShadow('evento gratuito sábado campus colemar', posts, dependencies);
    expect(result.candidate.map((row) => row.id)).toEqual(['free']);
    expect(result.comparison.supportedFilters).toEqual(expect.arrayContaining(['free', 'locationAlias']));
    expect(result.comparison.unsupportedFilters).toContain('weekday');
  });

  test('mantém data relativa como não suportada sem eliminar rota válida', () => {
    const posts = [{
      id: 'ride', title: 'Carona disponível', module: 'caronas', category: 'ofereco',
      metadata: { origem: 'Câmpus Samambaia', destino: 'Centro', horario: '18:00' }
    }];
    const result = Pipeline.runShadow('carona samambaia centro amanhã 18h', posts, dependencies);
    expect(result.candidate.map((row) => row.id)).toEqual(['ride']);
    expect(result.comparison.unsupportedFilters).toContain('relativeDate');
  });

  test('saída não contém consulta crua, contato, link ou conteúdo do post', () => {
    const result = Pipeline.runShadow('estágio remoto computação', opportunityPosts(), dependencies);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('estágio remoto computação');
    expect(serialized).not.toContain('nao-expor@example.com');
    expect(serialized).not.toContain('https://example.com');
    expect(result.plan).not.toHaveProperty('filters');
    expect(result.plan.filterKeys).toEqual(expect.arrayContaining(['workMode', 'area']));
    expect(result.candidate[0]).toEqual({ id: 'remote', relevanceScore: expect.any(Number) });
  });

  test('não muta a coleção fonte', () => {
    const posts = opportunityPosts();
    const snapshot = JSON.parse(JSON.stringify(posts));
    Pipeline.runShadow('estágio remoto computação', posts, dependencies);
    expect(posts).toEqual(snapshot);
    posts.forEach((post) => expect(post).not.toHaveProperty('kcSearchProjection'));
  });

  test('consulta desconhecida produz comparação neutra e determinística', () => {
    const first = Pipeline.runShadow('xyzabc sem contexto', opportunityPosts(), dependencies);
    const second = Pipeline.runShadow('xyzabc sem contexto', opportunityPosts(), dependencies);
    expect(first.plan.module).toBeNull();
    expect(first.legacy).toEqual([]);
    expect(first.candidate).toEqual([]);
    expect(second).toEqual(first);
  });

  test('limita o tamanho de saída ao parâmetro seguro', () => {
    const posts = Array.from({ length: 20 }, (_, index) => ({
      id: `e-${index}`, title: 'Evento cultural', module: 'eventos', category: 'culturais'
    }));
    const result = Pipeline.runShadow('evento cultural', posts, { ...dependencies, limit: 3 });
    expect(result.legacy).toHaveLength(3);
    expect(result.candidate).toHaveLength(3);
  });
});

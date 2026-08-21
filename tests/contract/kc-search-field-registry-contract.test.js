/**
 * V76.33 — contract for the search field registry and synthetic golden corpus.
 * The registry is intentionally not loaded by HTML pages in this phase.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_PATH = path.join(ROOT, 'assets/js/features/create-post/kc-create-post.schema.js');
const FIELDS_PATH = path.join(ROOT, 'assets/js/features/create-post/kc-create-post.fields.js');
const REGISTRY_PATH = path.join(ROOT, 'assets/js/shared/kc-search-fields.shared.js');
const CORPUS_PATH = path.join(ROOT, 'tests/fixtures/search-golden-queries.v1.json');
const PLAN_PATH = path.join(ROOT, 'docs/planning/v76-search-personalization-architecture-plan.md');
const ENV_PATH = path.join(ROOT, 'assets/js/boot/kc-env.js');

const SearchFieldRegistry = require(REGISTRY_PATH);
const corpus = JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf8'));
const EXPECTED_FIELDS = {
  'compra-venda': ['titulo', 'descricao', 'userTags', 'localizacao', 'preco', 'condicao'],
  caronas: ['titulo', 'descricao', 'userTags', 'origem', 'destino', 'horario', 'contribuicao', 'vagas', 'marcadoresCarona'],
  moradia: ['titulo', 'descricao', 'userTags', 'regiao', 'marcadoresMoradia', 'orcamento', 'localizacao', 'preco', 'detalhes'],
  eventos: ['titulo', 'descricao', 'userTags', 'localizacao', 'data', 'data_fim', 'hora', 'link', 'link_as_cta', 'gratuito', 'preco'],
  'achados-perdidos': ['titulo', 'descricao', 'userTags', 'localizacao', 'recompensa', 'entrega'],
  oportunidades: [
    'titulo', 'descricao', 'userTags', 'areaAtuacao', 'modalidadeTrabalho', 'regimeContratacao',
    'localizacao', 'remuneracao', 'contato', 'link', 'link_as_cta'
  ]
};

function loadCreatePostContracts() {
  const resolvers = {
    getCaronasCampusOptions: () => [{ key: 'campus-samambaia', label: 'Câmpus Samambaia' }],
    getCaronasFeatureOptions: () => [{ key: 'ar-condicionado', label: 'Ar condicionado' }],
    getHousingRegionOptions: () => [{ key: 'setor-universitario', label: 'Setor Universitário' }],
    getHousingFeatureOptions: () => [{ key: 'mobiliado', label: 'Mobiliado' }],
    getLostFoundLocationOptions: () => [{ key: 'biblioteca-central', label: 'Biblioteca Central' }],
    getOpportunityAreaOptions: () => [{ key: 'tecnologia', label: 'Tecnologia' }],
    normalizeOpportunityTypeKey: (value) => {
      const normalized = String(value || '').trim().toLowerCase();
      if (normalized === 'empregos') return 'emprego';
      if (normalized === 'estagios') return 'estagio';
      return normalized;
    }
  };
  const context = {
    window: { _KCCreatePost: { resolvers } },
    console
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(SCHEMA_PATH, 'utf8'), context, { filename: SCHEMA_PATH });
  context.window._KCCreatePost.resolvers = resolvers;
  vm.runInContext(fs.readFileSync(FIELDS_PATH, 'utf8'), context, { filename: FIELDS_PATH });
  return context.window._KCCreatePost;
}

const createPost = loadCreatePostContracts();
const registry = SearchFieldRegistry.buildRegistry(createPost.schema, createPost.fields);

describe('KCSearchFieldRegistry — derivação canônica', () => {
  test('é UMD, versionado e ainda não integra o runtime das páginas', () => {
    const source = fs.readFileSync(REGISTRY_PATH, 'utf8');
    const htmlFiles = fs.readdirSync(ROOT)
      .filter((name) => name.endsWith('.html'))
      .map((name) => path.join(ROOT, name))
      .concat(
        fs.readdirSync(path.join(ROOT, 'admin'))
          .filter((name) => name.endsWith('.html'))
          .map((name) => path.join(ROOT, 'admin', name))
      );

    expect(SearchFieldRegistry.VERSION).toBe('1.0.0');
    expect(source).toContain('root.KCSearchFieldRegistry = factory();');
    htmlFiles.forEach((file) => {
      expect(fs.readFileSync(file, 'utf8')).not.toContain('kc-search-fields.shared.js');
    });
  });

  test('deriva exatamente os seis módulos existentes no schema', () => {
    expect(registry.moduleKeys).toEqual(Object.keys(createPost.schema.modules).sort());
    expect(registry.moduleKeys).toHaveLength(6);
    expect(registry.generatedFrom).toEqual([
      'window._KCCreatePost.schema',
      'window._KCCreatePost.fields.buildFieldsForModule'
    ]);
  });

  test.each(Object.keys(createPost.schema.modules))('%s mantém grupos e opções do schema sem cópia divergente', (moduleKey) => {
    const normalizeOption = (option) => ({
      key: option.key,
      label: option.label,
      emoji: option.emoji || '',
      icon: option.icon || ''
    });
    const sourceGroups = createPost.schema.modules[moduleKey].tagGroups.map((group) => ({
      id: group.id,
      label: group.label,
      required: group.required === true,
      multi: group.multi === true,
      options: group.options.map(normalizeOption)
    }));
    const registryGroups = registry.modules[moduleKey].tagGroups.map((group) => ({
      id: group.id,
      label: group.label,
      required: group.required,
      multi: group.multi,
      options: group.options.map(normalizeOption)
    }));

    expect(registryGroups).toEqual(sourceGroups);
  });

  test.each(Object.keys(createPost.schema.modules))('%s identifica a origem e os paths de cada grupo', (moduleKey) => {
    const moduleEntry = registry.modules[moduleKey];
    moduleEntry.tagGroups.forEach((group) => {
      expect(group.payloadPaths.length).toBeGreaterThan(0);
      expect(group.source).toBe(group.id === moduleEntry.categoryGroupId ? 'category' : 'tag');
    });
  });

  test('ação de compra e venda preserva o path semântico explícito', () => {
    const actionGroup = registry.modules['compra-venda'].tagGroups.find((group) => group.id === 'acao');
    expect(actionGroup.payloadPaths).toEqual(expect.arrayContaining([
      'metadata.actionKey',
      'metadata.actionLabel'
    ]));
  });

  test.each(registry.moduleKeys)('%s inclui título, descrição e Tags derivados do builder', (moduleKey) => {
    const fieldNames = registry.modules[moduleKey].fields.map((field) => field.name);
    expect(fieldNames).toEqual(expect.arrayContaining(['titulo', 'descricao', 'userTags']));
  });

  test.each(Object.entries(EXPECTED_FIELDS))('%s cobre todos os campos pesquisáveis/explicitamente bloqueados', (moduleKey, expected) => {
    const fieldNames = registry.modules[moduleKey].fields.map((field) => field.name);
    expect(fieldNames.sort()).toEqual(expected.slice().sort());
  });

  test('captura campos condicionais sem torná-los universais', () => {
    expect(SearchFieldRegistry.findField(registry, 'compra-venda', 'condicao').activeIn).toEqual(['vendo']);
    expect(SearchFieldRegistry.findField(registry, 'caronas', 'vagas').activeIn).toEqual(['ofereco']);
    expect(SearchFieldRegistry.findField(registry, 'moradia', 'orcamento').activeIn).toEqual(['procurando']);
    expect(SearchFieldRegistry.findField(registry, 'eventos', 'preco').activeIn).toEqual(['pago']);
    expect(SearchFieldRegistry.findField(registry, 'achados-perdidos', 'recompensa').activeIn).toEqual(['perdidos']);
    expect(SearchFieldRegistry.findField(registry, 'achados-perdidos', 'entrega').activeIn).toEqual(['encontrados']);
    expect(SearchFieldRegistry.findField(registry, 'oportunidades', 'regimeContratacao').activeIn).toEqual(['emprego']);
  });

  test('cobre todo campo nomeado gerado pelos cenários sem policy ausente', () => {
    registry.moduleKeys.forEach((moduleKey) => {
      registry.modules[moduleKey].fields.forEach((field) => {
        expect(SearchFieldRegistry.FIELD_POLICIES).toHaveProperty(field.name);
        expect(field.policy.payloadPaths.length).toBeGreaterThan(0);
        expect(field.policy.privacyClass).toBeTruthy();
      });
    });
    expect(SearchFieldRegistry.validateRegistry(registry)).toBe(true);
  });
});

describe('KCSearchFieldRegistry — privacidade e preferências', () => {
  test.each([
    ['oportunidades', 'contato'],
    ['oportunidades', 'link'],
    ['eventos', 'link']
  ])('%s.%s não pode ser indexado, filtrado ou usado como preferência', (moduleKey, fieldName) => {
    const policy = SearchFieldRegistry.findField(registry, moduleKey, fieldName).policy;
    expect(policy.indexable).toBe(false);
    expect(policy.filterable).toBe(false);
    expect(policy.preferenceEligible).toBe(false);
    expect(policy.preferenceFeature).toBeNull();
  });

  test('nenhum valor livre de campo é preferência direta', () => {
    registry.moduleKeys.forEach((moduleKey) => {
      registry.modules[moduleKey].fields.forEach((field) => {
        expect(field.policy.preferenceEligible).toBe(false);
        if (field.policy.preferenceFeature) {
          expect(field.policy.requiresCanonicalValue).toBe(true);
        }
      });
    });
  });

  test('preferência explícita fica limitada a grupos categóricos aprovados', () => {
    const eligible = [];
    registry.moduleKeys.forEach((moduleKey) => {
      registry.modules[moduleKey].tagGroups.forEach((group) => {
        if (group.preferenceEligible) eligible.push(`${moduleKey}:${group.id}`);
      });
    });
    // All create-modal tag groups are preference-eligible (Assuntos e temas parity).
    expect(eligible.sort()).toEqual([
      'achados-perdidos:status',
      'achados-perdidos:tipo',
      'caronas:tipo',
      'compra-venda:acao',
      'compra-venda:categoria',
      'eventos:topico',
      'moradia:tipo',
      'oportunidades:tipo'
    ]);
  });

  test('atributos sensíveis não existem nas políticas nem no corpus', () => {
    const serialized = JSON.stringify({ policies: SearchFieldRegistry.FIELD_POLICIES, corpus }).toLowerCase();
    [
      'gender_identity', 'race_color', 'orientacao_sexual', 'religiao',
      'opiniao_politica', 'deficiencia', 'token', 'password'
    ].forEach((forbidden) => expect(serialized).not.toContain(forbidden));
  });

  test('projeção inclui somente conteúdo pesquisável e filtros permitidos', () => {
    const projection = SearchFieldRegistry.projectPost({
      module: 'oportunidades',
      title: 'Vaga de estágio',
      description: 'Atuação em produto digital',
      location: 'Câmpus Samambaia',
      price: 1200,
      metadata: {
        areaLabel: 'Tecnologia',
        workModeLabel: 'Remoto',
        employmentTypeLabel: 'CLT',
        contato: 'privado@example.com',
        link: 'https://example.com/inscricao'
      }
    });

    expect(projection.searchText).toContain('Tecnologia');
    expect(projection.searchText).toContain('Remoto');
    expect(projection.searchText).not.toContain('Vaga de estágio');
    expect(projection.searchText).not.toContain('Atuação em produto digital');
    expect(projection.searchText).not.toContain('privado@example.com');
    expect(projection.searchText).not.toContain('https://example.com');
    expect(projection.fields).not.toHaveProperty('contato');
    expect(projection.fields).not.toHaveProperty('link');
    expect(projection.filters.modalidadeTrabalho).toEqual(['Remoto']);
  });

  test('projeção traduz gratuidade sem expor outros booleanos operacionais', () => {
    const free = SearchFieldRegistry.projectPost({ module: 'eventos', metadata: { gratuito: true, link_as_cta: true } });
    const paid = SearchFieldRegistry.projectPost({ module: 'eventos', metadata: { gratuito: false } });

    expect(free.searchText).toContain('gratuito gratis');
    expect(free.fields).not.toHaveProperty('link_as_cta');
    expect(paid.searchText).toContain('pago');
  });

  test('projectCollection não muta posts e congela cada projeção', () => {
    const source = [{ id: 'p1', module: 'moradia', metadata: { regionLabel: 'Setor Universitário' } }];
    const projected = SearchFieldRegistry.projectCollection(source);

    expect(source[0]).not.toHaveProperty('kcSearchProjection');
    expect(projected[0]).not.toBe(source[0]);
    expect(projected[0].kcSearchProjection.searchText).toContain('Setor Universitário');
    expect(Object.isFrozen(projected[0].kcSearchProjection)).toBe(true);
  });

  test('flag da projeção local existe desligada por padrão', () => {
    const envSource = fs.readFileSync(ENV_PATH, 'utf8');
    expect(envSource).toContain("'search.schemaFields': false");
  });
});

describe('corpus dourado de consultas', () => {
  test('é sintético, versionado e cobre três consultas por módulo', () => {
    expect(corpus.version).toBe('1.0.0');
    expect(corpus.locale).toBe('pt-BR');
    expect(corpus.purpose).toContain('sintético');
    expect(corpus.queries).toHaveLength(18);

    registry.moduleKeys.forEach((moduleKey) => {
      expect(corpus.queries.filter((entry) => entry.expected.module === moduleKey)).toHaveLength(3);
    });
  });

  test('IDs são únicos e todas as entradas têm variantes e expectativa auditável', () => {
    const ids = corpus.queries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    corpus.queries.forEach((entry) => {
      expect(entry.query.length).toBeGreaterThan(5);
      expect(entry.variants.length).toBeGreaterThan(0);
      expect(registry.moduleKeys).toContain(entry.expected.module);
      expect(entry.expected.intent).toBeTruthy();
      expect(entry.expected.filters).toEqual(expect.any(Object));
    });
  });

  test('não contém identificadores pessoais, contatos ou URLs', () => {
    const text = corpus.queries
      .flatMap((entry) => [entry.query].concat(entry.variants))
      .join('\n');
    expect(text).not.toMatch(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
    expect(text).not.toMatch(/https?:\/\//i);
    expect(text).not.toMatch(/\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}\b/);
  });

  test('permanece rastreado no plano antes de existir parser em produção', () => {
    const plan = fs.readFileSync(PLAN_PATH, 'utf8');
    expect(plan).toContain('Corpus dourado de consultas');
    expect(plan).toContain('KCSearchFieldRegistry');
    expect(plan).toContain('Fase 1 — índice orientado ao schema, sem personalização');
  });
});

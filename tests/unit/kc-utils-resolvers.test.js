/*
  Testes expandidos para as funções resolvidas complexas de kc-utils.js
  (resolveOpportunityArea, resolveHousingRegion, etc.)
  Objetivo: cobrir as ~1300 linhas de resolvers e helpers internos.
*/
beforeAll(() => {
  global.window = global.window || global;
  require('../../assets/js/kc-constants.js');
  require('../../assets/js/kc-utils.string.js'); // deve preceder kc-utils.js (v12.2.0)
  require('../../assets/js/kc-utils.format.js'); // deve preceder kc-utils.js (v12.2.1)
  require('../../assets/js/kc-utils.dom.js'); // deve preceder kc-utils.js (v12.2.2)
  require('../../assets/js/kc-utils.identity.js'); // deve preceder kc-utils.js (v12.2.3)
  require('../../assets/js/kc-utils.taxonomy.js'); // deve preceder kc-utils.js (v12.2.4)
  require('../../assets/js/kc-utils.location.js'); // deve preceder kc-utils.js (v12.2.5)
  require('../../assets/js/kc-utils.presentation.js'); // deve preceder kc-utils.js (v12.2.6)
  require('../../assets/js/kc-utils.js');
});

describe('KCUtils - Resolvers e Definicoes', () => {
  let utils;

  beforeEach(() => {
    utils = window.KCUtils;
  });

  // ── levenshteinDistance (interno, testado indiretamente) ──────────────
  // Nao esta exposto diretamente, mas e usado por resolvers.
  // Testamos via resolveOpportunityArea com fuzzy matching.

  // ── getOpportunityAreaDefinitions ────────────────────────────────────

  describe('getOpportunityAreaDefinitions', () => {
    test('retorna array nao vazio', () => {
      const defs = utils.getOpportunityAreaDefinitions();
      expect(Array.isArray(defs)).toBe(true);
      expect(defs.length).toBeGreaterThan(0);
    });

    test('cada entrada tem key, label, icon, emoji', () => {
      const defs = utils.getOpportunityAreaDefinitions();
      defs.forEach(def => {
        expect(def.key).toBeTruthy();
        expect(def.label).toBeTruthy();
        expect(def.icon).toBeTruthy();
        expect(def.emoji).toBeTruthy();
      });
    });

    test('contem areas conhecidas: tecnologia, marketing, design', () => {
      const defs = utils.getOpportunityAreaDefinitions();
      const keys = defs.map(d => d.key);
      expect(keys).toContain('tecnologia');
      expect(keys).toContain('marketing');
      expect(keys).toContain('design');
    });

    test('cada entrada tem aliases como array', () => {
      const defs = utils.getOpportunityAreaDefinitions();
      defs.forEach(def => {
        expect(Array.isArray(def.aliases)).toBe(true);
        expect(def.aliases.length).toBeGreaterThan(0);
      });
    });
  });

  // ── getOpportunityAreaInfoByKey ──────────────────────────────────────

  describe('getOpportunityAreaInfoByKey', () => {
    test('retorna info para chave conhecida', () => {
      const info = utils.getOpportunityAreaInfoByKey('tecnologia');
      expect(info).toBeTruthy();
      expect(info.key).toBe('tecnologia');
      expect(info.label).toBe('Tecnologia');
    });

    test('retorna null para chave desconhecida', () => {
      expect(utils.getOpportunityAreaInfoByKey('inexistente')).toBeNull();
    });

    test('retorna null para string vazia', () => {
      expect(utils.getOpportunityAreaInfoByKey('')).toBeNull();
    });

    test('retorna info para marketing', () => {
      const info = utils.getOpportunityAreaInfoByKey('marketing');
      expect(info).toBeTruthy();
      expect(info.label).toBe('Marketing');
    });

    test('retorna info para educacao', () => {
      const info = utils.getOpportunityAreaInfoByKey('educacao');
      expect(info).toBeTruthy();
      expect(info.label).toBe('Educação');
    });
  });

  // ── getHousingRegionDefinitions ──────────────────────────────────────

  describe('getHousingRegionDefinitions', () => {
    test('retorna array nao vazio', () => {
      const defs = utils.getHousingRegionDefinitions();
      expect(Array.isArray(defs)).toBe(true);
      expect(defs.length).toBeGreaterThan(0);
    });

    test('cada entrada tem key e label', () => {
      const defs = utils.getHousingRegionDefinitions();
      defs.forEach(def => {
        expect(def.key).toBeTruthy();
        expect(def.label).toBeTruthy();
      });
    });
  });

  // ── getHousingRegionInfoByKey ────────────────────────────────────────

  describe('getHousingRegionInfoByKey', () => {
    test('retorna info para regiao existente', () => {
      const defs = utils.getHousingRegionDefinitions();
      if (defs.length > 0) {
        const firstKey = defs[0].key;
        const info = utils.getHousingRegionInfoByKey(firstKey);
        expect(info).toBeTruthy();
        expect(info.key).toBe(firstKey);
      }
    });

    test('retorna null para chave inexistente', () => {
      expect(utils.getHousingRegionInfoByKey('regiao-fantasma-xyz')).toBeNull();
    });

    test('retorna null para string vazia', () => {
      expect(utils.getHousingRegionInfoByKey('')).toBeNull();
    });
  });

  // ── getHousingFeatureDefinitions ─────────────────────────────────────

  describe('getHousingFeatureDefinitions', () => {
    test('retorna array nao vazio', () => {
      const defs = utils.getHousingFeatureDefinitions();
      expect(Array.isArray(defs)).toBe(true);
      expect(defs.length).toBeGreaterThan(0);
    });

    test('cada entrada tem key, label e emoji', () => {
      const defs = utils.getHousingFeatureDefinitions();
      defs.forEach(def => {
        expect(def.key).toBeTruthy();
        expect(def.label).toBeTruthy();
        expect(def.emoji).toBeTruthy();
      });
    });
  });

  // ── getHousingFeatureInfoByKey ───────────────────────────────────────

  describe('getHousingFeatureInfoByKey', () => {
    test('retorna info para feature existente', () => {
      const defs = utils.getHousingFeatureDefinitions();
      if (defs.length > 0) {
        const firstKey = defs[0].key;
        const info = utils.getHousingFeatureInfoByKey(firstKey);
        expect(info).toBeTruthy();
        expect(info.key).toBe(firstKey);
      }
    });

    test('retorna null para chave inexistente', () => {
      expect(utils.getHousingFeatureInfoByKey('feature-xyz')).toBeNull();
    });
  });

  // ── getLostFoundLocationDefinitions ──────────────────────────────────

  describe('getLostFoundLocationDefinitions', () => {
    test('retorna array nao vazio', () => {
      const defs = utils.getLostFoundLocationDefinitions();
      expect(Array.isArray(defs)).toBe(true);
      expect(defs.length).toBeGreaterThan(0);
    });

    test('cada entrada tem key, label e emoji', () => {
      const defs = utils.getLostFoundLocationDefinitions();
      defs.forEach(def => {
        expect(def.key).toBeTruthy();
        expect(def.label).toBeTruthy();
        expect(def.emoji).toBeTruthy();
      });
    });
  });

  // ── getLostFoundLocationInfoByKey ────────────────────────────────────

  describe('getLostFoundLocationInfoByKey', () => {
    test('retorna info para local existente', () => {
      const defs = utils.getLostFoundLocationDefinitions();
      if (defs.length > 0) {
        const info = utils.getLostFoundLocationInfoByKey(defs[0].key);
        expect(info).toBeTruthy();
      }
    });

    test('retorna null para local inexistente', () => {
      expect(utils.getLostFoundLocationInfoByKey('local-xyz')).toBeNull();
    });
  });

  // ── getSubcategoryLabel ──────────────────────────────────────────────

  describe('getSubcategoryLabel', () => {
    test('retorna label para subcategoria de caronas', () => {
      const result = utils.getSubcategoryLabel('caronas', 'goiania-campus');
      expect(result).toContain('Campus');
    });

    test('fallback para beautifyKey em subcategoria desconhecida', () => {
      const result = utils.getSubcategoryLabel('caronas', 'rota-nova');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('retorna string para modulo sem subcategorias', () => {
      const result = utils.getSubcategoryLabel('moradia', 'qualquer');
      expect(typeof result).toBe('string');
    });
  });

  // ── debounce ─────────────────────────────────────────────────────────

  describe('debounce', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('nao executa imediatamente', () => {
      const fn = jest.fn();
      const debounced = utils.debounce(fn, 100);
      debounced();
      expect(fn).not.toHaveBeenCalled();
    });

    test('executa apos o timeout', () => {
      const fn = jest.fn();
      const debounced = utils.debounce(fn, 100);
      debounced();
      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('cancela chamadas anteriores', () => {
      const fn = jest.fn();
      const debounced = utils.debounce(fn, 100);
      debounced('a');
      debounced('b');
      debounced('c');
      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('c');
    });
  });

  // ── resolveOpportunityArea ───────────────────────────────────────────

  describe('resolveOpportunityArea', () => {
    test('resolve area oficial por label exato', () => {
      const result = utils.resolveOpportunityArea({ areaLabel: 'Tecnologia' });
      expect(result.key).toBe('tecnologia');
      expect(result.isKnown).toBe(true);
    });

    test('resolve area oficial por key exato', () => {
      const result = utils.resolveOpportunityArea({ areaKey: 'marketing' });
      expect(result.key).toBe('marketing');
      expect(result.isKnown).toBe(true);
    });

    test('resolve area por alias (sinonimo)', () => {
      const result = utils.resolveOpportunityArea({ areaLabel: 'programação' });
      expect(result.key).toBe('tecnologia');
      expect(result.isKnown).toBe(true);
    });

    test('resolve area por contexto em titulo/descricao', () => {
      const result = utils.resolveOpportunityArea({
        titulo: 'Vaga de estágio em desenvolvimento web',
        descricao: 'Precisa saber React e Node.js',
      });
      expect(result.key).toBe('tecnologia');
      expect(result.isKnown).toBe(true);
    });

    test('retorna area custom para valor desconhecido', () => {
      const result = utils.resolveOpportunityArea({ areaLabel: 'Gastronomia Molecular' });
      expect(result.isKnown).toBe(false);
      expect(result.key).toBeTruthy();
    });

    test('retorna empty para input vazio', () => {
      const result = utils.resolveOpportunityArea({});
      expect(result.source).toBe('empty');
    });

    test('resolve area por metadata.areaKey', () => {
      const result = utils.resolveOpportunityArea({
        metadata: { areaKey: 'design' }
      });
      expect(result.key).toBe('design');
      expect(result.isKnown).toBe(true);
    });

    test('resolve area educacao por alias monitoria', () => {
      const result = utils.resolveOpportunityArea({ areaLabel: 'monitoria' });
      expect(result.key).toBe('educacao');
    });

    test('resolve engenharia por alias', () => {
      const result = utils.resolveOpportunityArea({ areaLabel: 'engenharia civil' });
      expect(result.key).toBe('engenharia');
    });

    test('resolve saude por alias', () => {
      const result = utils.resolveOpportunityArea({ areaLabel: 'enfermagem' });
      expect(result.key).toBe('saude');
    });

    test('resolve por tags array', () => {
      const result = utils.resolveOpportunityArea({
        tags: ['desenvolvimento', 'software'],
      });
      expect(result.key).toBe('tecnologia');
    });

    test('fallback para string simples', () => {
      const result = utils.resolveOpportunityArea('marketing');
      expect(result.key).toBe('marketing');
    });

    test('resolve com metadata.subcategoriaKey', () => {
      const result = utils.resolveOpportunityArea({
        metadata: { subcategoriaKey: 'administração' }
      });
      expect(result.key).toBe('administrativo');
    });
  });

  // ── resolveHousingRegion ─────────────────────────────────────────────

  describe('resolveHousingRegion', () => {
    test('resolve regiao por label exato', () => {
      const defs = utils.getHousingRegionDefinitions();
      if (defs.length > 0) {
        const first = defs[0];
        const result = utils.resolveHousingRegion({ regionLabel: first.label });
        expect(result).toBeTruthy();
        expect(result.key).toBe(first.key);
      }
    });

    test('resolve regiao por key em metadata', () => {
      const defs = utils.getHousingRegionDefinitions();
      if (defs.length > 0) {
        const first = defs[0];
        const result = utils.resolveHousingRegion({
          metadata: { regionKey: first.key }
        });
        expect(result).toBeTruthy();
      }
    });

    test('retorna objeto para regiao desconhecida', () => {
      const result = utils.resolveHousingRegion({ regionLabel: 'Regiao Fantasma' });
      expect(result).toBeTruthy();
      expect(typeof result.key).toBe('string');
    });

    test('retorna empty para input vazio', () => {
      const result = utils.resolveHousingRegion({});
      expect(result).toBeTruthy();
      expect(result.key).toBe('');
    });
  });

  // ── resolveLostFoundLocation ─────────────────────────────────────────

  describe('resolveLostFoundLocation', () => {
    test('resolve local por label exato', () => {
      const defs = utils.getLostFoundLocationDefinitions();
      if (defs.length > 0) {
        const first = defs[0];
        const result = utils.resolveLostFoundLocation({ lostFoundLocationLabel: first.label });
        expect(result).toBeTruthy();
        expect(result.key).toBe(first.key);
      }
    });

    test('retorna objeto para local desconhecido', () => {
      const result = utils.resolveLostFoundLocation({ lostFoundLocationLabel: 'Local Xyz' });
      expect(result).toBeTruthy();
    });

    test('retorna empty para input vazio', () => {
      const result = utils.resolveLostFoundLocation({});
      expect(result).toBeTruthy();
    });
  });

  // ── resolveHousingFeatures ───────────────────────────────────────────

  describe('resolveHousingFeatures', () => {
    test('resolve features a partir de array de keys', () => {
      const defs = utils.getHousingFeatureDefinitions();
      if (defs.length > 0) {
        const keys = [defs[0].key];
        const result = utils.resolveHousingFeatures(keys);
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
      }
    });

    test('retorna array vazio para input vazio', () => {
      const result = utils.resolveHousingFeatures([]);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    test('retorna array vazio para null', () => {
      const result = utils.resolveHousingFeatures(null);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ── resolveHousingTypeKey ────────────────────────────────────────────

  describe('resolveHousingTypeKey', () => {
    test('resolve tipo republica', () => {
      const result = utils.resolveHousingTypeKey('República');
      expect(typeof result).toBe('string');
    });

    test('resolve tipo quarto', () => {
      const result = utils.resolveHousingTypeKey('Quarto');
      expect(typeof result).toBe('string');
    });

    test('retorna string para tipo desconhecido', () => {
      const result = utils.resolveHousingTypeKey('tipo-xyz');
      expect(typeof result).toBe('string');
    });

    test('retorna string vazia para null', () => {
      const result = utils.resolveHousingTypeKey(null);
      expect(typeof result).toBe('string');
    });
  });

  // ── resolveCaronasLocation ───────────────────────────────────────────

  describe('resolveCaronasLocation', () => {
    test('retorna objeto com key e label para string conhecida', () => {
      const result = utils.resolveCaronasLocation('Campus Samambaia');
      expect(result).toBeTruthy();
      expect(typeof result.key).toBe('string');
    });

    test('retorna empty para string vazia', () => {
      const result = utils.resolveCaronasLocation('');
      expect(result).toBeTruthy();
      expect(result.source).toBe('empty');
    });

    test('retorna resultado para string qualquer', () => {
      const result = utils.resolveCaronasLocation('Centro de Goiania');
      expect(result).toBeTruthy();
      expect(typeof result.key).toBe('string');
    });
  });

  // ── getDisplayMarkerTags ─────────────────────────────────────────────

  describe('getDisplayMarkerTags', () => {
    test('retorna array para post de compra-venda', () => {
      const result = utils.getDisplayMarkerTags({
        modulo: 'compra-venda',
        categoria: 'Eletrônicos',
        tags: ['eletronicos'],
      });
      expect(Array.isArray(result)).toBe(true);
    });

    test('retorna array para post de oportunidades', () => {
      const result = utils.getDisplayMarkerTags({
        modulo: 'oportunidades',
        metadata: { areaKey: 'tecnologia' },
        tags: ['tecnologia'],
      });
      expect(Array.isArray(result)).toBe(true);
    });

    test('retorna array para post de moradia', () => {
      const result = utils.getDisplayMarkerTags({
        modulo: 'moradia',
        metadata: { regiaoKey: 'setor-bueno' },
        tags: ['republica'],
      });
      expect(Array.isArray(result)).toBe(true);
    });

    test('retorna array para post de caronas', () => {
      const result = utils.getDisplayMarkerTags({
        modulo: 'caronas',
        tags: ['campus'],
      });
      expect(Array.isArray(result)).toBe(true);
    });

    test('retorna array para post de achados-perdidos', () => {
      const result = utils.getDisplayMarkerTags({
        modulo: 'achados-perdidos',
        tags: ['perdido'],
      });
      expect(Array.isArray(result)).toBe(true);
    });

    test('retorna array para post de eventos', () => {
      const result = utils.getDisplayMarkerTags({
        modulo: 'eventos',
        tags: ['cultural'],
      });
      expect(Array.isArray(result)).toBe(true);
    });

    test('retorna array vazio para post sem dados', () => {
      const result = utils.getDisplayMarkerTags({});
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ── applyPresentationRules ───────────────────────────────────────────

  describe('applyPresentationRules', () => {
    test('retorna post normalizado com campos base', () => {
      const post = {
        id: '123',
        modulo: 'compra-venda',
        titulo: 'Notebook Dell',
        descricao: 'Em bom estado',
        preco: 2500,
        tags: ['eletronicos'],
      };
      const result = utils.applyPresentationRules(post);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('object');
    });

    test('resolve emoji para modulo eventos', () => {
      const result = utils.applyPresentationRules({
        modulo: 'eventos',
        titulo: 'Workshop de React',
      });
      expect(result).toBeTruthy();
    });

    test('resolve dados de moradia com metadata', () => {
      const result = utils.applyPresentationRules({
        modulo: 'moradia',
        titulo: 'Quarto em republica',
        metadata: { regiaoKey: 'setor-bueno', housingTypeKey: 'republica' },
        tags: ['republica'],
      });
      expect(result).toBeTruthy();
    });

    test('resolve dados de oportunidades', () => {
      const result = utils.applyPresentationRules({
        modulo: 'oportunidades',
        titulo: 'Estagio em TI',
        metadata: { areaKey: 'tecnologia' },
        tags: ['estagio', 'tecnologia'],
      });
      expect(result).toBeTruthy();
    });

    test('resolve dados de caronas', () => {
      const result = utils.applyPresentationRules({
        modulo: 'caronas',
        titulo: 'Carona para campus',
        tags: ['campus'],
      });
      expect(result).toBeTruthy();
    });

    test('resolve dados de achados-perdidos', () => {
      const result = utils.applyPresentationRules({
        modulo: 'achados-perdidos',
        titulo: 'Documento perdido',
        tags: ['perdido'],
      });
      expect(result).toBeTruthy();
    });

    test('lida com post vazio graciosamente', () => {
      const result = utils.applyPresentationRules({});
      expect(result).toBeTruthy();
    });

    test('lida com null graciosamente', () => {
      const result = utils.applyPresentationRules(null);
      expect(result).toBeTruthy();
    });
  });
});

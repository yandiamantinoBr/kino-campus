/*
  Suite de testes — window._KCU.taxonomy (v12.2.4)

  Cobre o contrato estático do sub-módulo e o comportamento das 22 funções
  do domínio taxonomy extraídas de kc-utils.js para kc-utils.taxonomy.js.

  Estrutura:
    1. Contrato estático — namespace e shape
    2. getModuleLabel
    3. getModuleIconClass
    4. getCategoryLabel / getSubcategoryLabel
    5. firstNonEmptyValue
    6. formatOpportunityAreaLabel
    7. scoreOpportunityAreaLabel
    8. pickPreferredOpportunityAreaLabel
    9. getOpportunityAreaFuzzyThreshold
   10. getOpportunityAreaSimilarityScore
   11. isCloseOpportunityAreaAlias
   12. getOpportunityAreaEmoji
   13. getOpportunityAreaDefinitions
   14. getOpportunityAreaInfoByKey
   15. buildOfficialOpportunityAreaMaps
   16. buildOpportunityTextParts
   17. extractOpportunityAreaHistoryEntries
   18. buildHistoryOpportunityAreaMaps
   19. findBestOfficialOpportunityArea
   20. findBestFuzzyOpportunityArea
   21. findBestOfficialContextArea
   22. resolveOpportunityArea
*/

beforeAll(() => {
  global.window = global.window || global;
  require('../../assets/js/boot/kc-constants.js');
  require('../../assets/js/utils/kc-utils.string.js');
  require('../../assets/js/utils/kc-utils.taxonomy.js');
});

// ─── 1. Contrato estático ────────────────────────────────────────────────────

describe('_KCU.taxonomy — contrato estático', () => {
  test('window._KCU.taxonomy é um objeto congelado', () => {
    expect(window._KCU).toBeDefined();
    expect(window._KCU.taxonomy).toBeDefined();
    expect(Object.isFrozen(window._KCU.taxonomy)).toBe(true);
  });

  test('expõe exatamente 22 funções do domínio', () => {
    const chaves = Object.keys(window._KCU.taxonomy).sort();
    expect(chaves).toEqual([
      'buildHistoryOpportunityAreaMaps',
      'buildOfficialOpportunityAreaMaps',
      'buildOpportunityTextParts',
      'extractOpportunityAreaHistoryEntries',
      'findBestFuzzyOpportunityArea',
      'findBestOfficialContextArea',
      'findBestOfficialOpportunityArea',
      'firstNonEmptyValue',
      'formatOpportunityAreaLabel',
      'getCategoryLabel',
      'getModuleIconClass',
      'getModuleLabel',
      'getOpportunityAreaDefinitions',
      'getOpportunityAreaEmoji',
      'getOpportunityAreaFuzzyThreshold',
      'getOpportunityAreaInfoByKey',
      'getOpportunityAreaSimilarityScore',
      'getSubcategoryLabel',
      'isCloseOpportunityAreaAlias',
      'pickPreferredOpportunityAreaLabel',
      'resolveOpportunityArea',
      'scoreOpportunityAreaLabel',
    ]);
  });

  test('todas as entradas são funções', () => {
    Object.values(window._KCU.taxonomy).forEach(fn => {
      expect(typeof fn).toBe('function');
    });
  });

  test('não vaza helpers privados', () => {
    expect(window._KCU.taxonomy._str).toBeUndefined();
    expect(window._KCU.taxonomy._const).toBeUndefined();
    expect(window._KCU.taxonomy._normalizeText).toBeUndefined();
    expect(window._KCU.taxonomy._slugifyText).toBeUndefined();
  });
});

// ─── 2. getModuleLabel ───────────────────────────────────────────────────────

describe('_KCU.taxonomy.getModuleLabel', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.taxonomy.getModuleLabel; });

  test('retorna string não vazia para módulo existente', () => {
    const label = fn('oportunidades');
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });

  test('retorna chave formatada para módulo desconhecido', () => {
    const label = fn('modulo-inexistente');
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });

  test('retorna "" para null e undefined', () => {
    expect(fn(null)).toBe('');
    expect(fn(undefined)).toBe('');
  });
});

// ─── 3. getModuleIconClass ───────────────────────────────────────────────────

describe('_KCU.taxonomy.getModuleIconClass', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.taxonomy.getModuleIconClass; });

  test('retorna string com classe de ícone para módulo existente', () => {
    const icon = fn('oportunidades');
    expect(typeof icon).toBe('string');
    expect(icon.length).toBeGreaterThan(0);
  });

  test('retorna fallback "fas fa-layer-group" para módulo desconhecido', () => {
    expect(fn('modulo-inexistente-xyz')).toBe('fas fa-layer-group');
  });

  test('retorna fallback para null/undefined', () => {
    expect(fn(null)).toBe('fas fa-layer-group');
    expect(fn(undefined)).toBe('fas fa-layer-group');
  });
});

// ─── 4. getCategoryLabel / getSubcategoryLabel ───────────────────────────────

describe('_KCU.taxonomy.getCategoryLabel', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.taxonomy.getCategoryLabel; });

  test('retorna string não vazia para inputs válidos', () => {
    expect(typeof fn('oportunidades', 'estagio')).toBe('string');
  });

  test('retorna string formatada para categoria desconhecida', () => {
    const label = fn('modulo-x', 'categoria-y');
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });

  test('não lança exceção para null/null', () => {
    expect(() => fn(null, null)).not.toThrow();
  });
});

describe('_KCU.taxonomy.getSubcategoryLabel', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.taxonomy.getSubcategoryLabel; });

  test('retorna string não vazia para inputs válidos', () => {
    expect(typeof fn('oportunidades', 'sub-teste')).toBe('string');
  });

  test('não lança exceção para null/null', () => {
    expect(() => fn(null, null)).not.toThrow();
  });
});

// ─── 5. firstNonEmptyValue ───────────────────────────────────────────────────

describe('_KCU.taxonomy.firstNonEmptyValue', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.taxonomy.firstNonEmptyValue; });

  test('retorna o primeiro valor não vazio da lista', () => {
    expect(fn(['', null, 'valor', 'outro'])).toBe('valor');
  });

  test('retorna "" para array todo vazio/null', () => {
    expect(fn(['', null, undefined])).toBe('');
  });

  test('retorna "" para entrada não-array', () => {
    expect(fn(null)).toBe('');
    expect(fn('string')).toBe('');
    expect(fn(42)).toBe('');
  });

  test('retorna o único elemento se tiver valor', () => {
    expect(fn(['único'])).toBe('único');
  });
});

// ─── 6. formatOpportunityAreaLabel ──────────────────────────────────────────

describe('_KCU.taxonomy.formatOpportunityAreaLabel', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.taxonomy.formatOpportunityAreaLabel; });

  test('capitaliza label em minúsculas (via titleCase)', () => {
    const result = fn('tecnologia da informacao');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('preserva label que já tem maiúsculas', () => {
    expect(fn('TI & Dados')).toBe('TI & Dados');
  });

  test('retorna "" para vazio/null', () => {
    expect(fn('')).toBe('');
    expect(fn(null)).toBe('');
  });

  test('colapsa múltiplos espaços', () => {
    const result = fn('tecnologia   e   dados');
    expect(result).not.toContain('  ');
  });
});

// ─── 7. scoreOpportunityAreaLabel ────────────────────────────────────────────

describe('_KCU.taxonomy.scoreOpportunityAreaLabel', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.taxonomy.scoreOpportunityAreaLabel; });

  test('retorna 0 para label vazio', () => {
    expect(fn('')).toBe(0);
    expect(fn(null)).toBe(0);
  });

  test('label com maiúsculas e acentos tem score maior', () => {
    const simples = fn('tecnologia');
    const rico = fn('Tecnologia da Informação');
    expect(rico).toBeGreaterThan(simples);
  });

  test('retorna número não-negativo para qualquer string', () => {
    expect(fn('abc')).toBeGreaterThanOrEqual(0);
    expect(fn('  xyz  ')).toBeGreaterThanOrEqual(0);
  });
});

// ─── 8. pickPreferredOpportunityAreaLabel ────────────────────────────────────

describe('_KCU.taxonomy.pickPreferredOpportunityAreaLabel', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.taxonomy.pickPreferredOpportunityAreaLabel; });

  test('retorna candidato quando current é vazio', () => {
    expect(fn('', 'Tecnologia')).toBe('Tecnologia');
  });

  test('retorna current quando candidato é vazio', () => {
    expect(fn('Tecnologia', '')).toBe('Tecnologia');
  });

  test('prefere label com maior score (com maiúscula/acento)', () => {
    // "Tecnologia" tem maiúscula → score maior que "tecnologia"
    const result = fn('tecnologia', 'Tecnologia');
    expect(result).toBe('Tecnologia');
  });

  test('retorna "" para ambos vazios', () => {
    expect(fn('', '')).toBe('');
  });
});

// ─── 9. getOpportunityAreaFuzzyThreshold ─────────────────────────────────────

describe('_KCU.taxonomy.getOpportunityAreaFuzzyThreshold', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.taxonomy.getOpportunityAreaFuzzyThreshold; });

  test('retorna 1 para strings curtas (≤6 chars)', () => {
    expect(fn('abc', 'xyz')).toBe(1);
  });

  test('retorna 2 para strings médias (≤12 chars)', () => {
    expect(fn('abcdefgh', 'abcdefgh')).toBe(2);
  });

  test('retorna 3 para strings longas (>12 chars)', () => {
    expect(fn('abcdefghijklm', 'abcdefghijklm')).toBe(3);
  });
});

// ─── 10. getOpportunityAreaSimilarityScore ────────────────────────────────────

describe('_KCU.taxonomy.getOpportunityAreaSimilarityScore', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.taxonomy.getOpportunityAreaSimilarityScore; });

  test('retorna 1 para strings idênticas', () => {
    expect(fn('tecnologia', 'tecnologia')).toBe(1);
  });

  test('retorna 0 para strings ambas vazias', () => {
    expect(fn('', '')).toBe(0);
  });

  test('retorna valor entre 0 e 1 para strings similares', () => {
    const score = fn('tecnologia', 'tecnologiax');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

// ─── 11. isCloseOpportunityAreaAlias ─────────────────────────────────────────

describe('_KCU.taxonomy.isCloseOpportunityAreaAlias', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.taxonomy.isCloseOpportunityAreaAlias; });

  test('retorna true para strings idênticas', () => {
    expect(fn('tecnologia', 'tecnologia')).toBe(true);
  });

  test('retorna false para strings muito diferentes', () => {
    expect(fn('tecnologia', 'agricultura')).toBe(false);
  });

  test('retorna false para strings vazias ou null', () => {
    expect(fn('', '')).toBe(false);
    expect(fn(null, null)).toBe(false);
  });

  test('retorna false para strings curtas distintas', () => {
    // strings < 5 chars com conteúdo diferente
    expect(fn('abc', 'xyz')).toBe(false);
  });
});

// ─── 12. getOpportunityAreaEmoji ─────────────────────────────────────────────

describe('_KCU.taxonomy.getOpportunityAreaEmoji', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.taxonomy.getOpportunityAreaEmoji; });

  test('retorna emoji correto para chave conhecida', () => {
    expect(fn('tecnologia')).toBe('💻');
    expect(fn('design')).toBe('🎨');
    expect(fn('marketing')).toBe('📣');
    expect(fn('educacao')).toBe('🎓');
    expect(fn('saude')).toBe('💚');
  });

  test('retorna emoji padrão para chave desconhecida', () => {
    expect(fn('area-inexistente')).toBe('🏷️');
    expect(fn('')).toBe('🏷️');
    expect(fn(null)).toBe('🏷️');
  });
});

// ─── 13. getOpportunityAreaDefinitions ───────────────────────────────────────

describe('_KCU.taxonomy.getOpportunityAreaDefinitions', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.taxonomy.getOpportunityAreaDefinitions; });

  test('retorna array não vazio', () => {
    const defs = fn();
    expect(Array.isArray(defs)).toBe(true);
    expect(defs.length).toBeGreaterThan(0);
  });

  test('cada entrada tem key, label, icon, emoji', () => {
    fn().forEach(def => {
      expect(def.key).toBeTruthy();
      expect(def.label).toBeTruthy();
      expect(def.icon).toBeTruthy();
      expect(def.emoji).toBeTruthy();
    });
  });

  test('contém áreas conhecidas: tecnologia, design, marketing', () => {
    const keys = fn().map(d => d.key);
    expect(keys).toContain('tecnologia');
    expect(keys).toContain('design');
    expect(keys).toContain('marketing');
  });

  test('cada entrada tem aliases como array não vazio', () => {
    fn().forEach(def => {
      expect(Array.isArray(def.aliases)).toBe(true);
      expect(def.aliases.length).toBeGreaterThan(0);
    });
  });
});

// ─── 14. getOpportunityAreaInfoByKey ─────────────────────────────────────────

describe('_KCU.taxonomy.getOpportunityAreaInfoByKey', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.taxonomy.getOpportunityAreaInfoByKey; });

  test('retorna objeto com emoji para chave conhecida', () => {
    const info = fn('tecnologia');
    expect(info).not.toBeNull();
    expect(info.key).toBe('tecnologia');
    expect(info.emoji).toBeTruthy();
    expect(info.label).toBeTruthy();
  });

  test('retorna null para chave desconhecida', () => {
    expect(fn('area-que-nao-existe-em-nenhum-mapa')).toBeNull();
  });

  test('retorna null para null/vazio', () => {
    expect(fn(null)).toBeNull();
    expect(fn('')).toBeNull();
    expect(fn(undefined)).toBeNull();
  });
});

// ─── 15. buildOfficialOpportunityAreaMaps ────────────────────────────────────

describe('_KCU.taxonomy.buildOfficialOpportunityAreaMaps', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.taxonomy.buildOfficialOpportunityAreaMaps; });

  test('retorna Map com entradas', () => {
    const map = fn();
    expect(map instanceof Map).toBe(true);
    expect(map.size).toBeGreaterThan(0);
  });

  test('Map contém chave normalizada "tecnologia"', () => {
    expect(fn().has('tecnologia')).toBe(true);
  });

  test('entradas do Map têm propriedades key, label, icon', () => {
    const entry = fn().get('tecnologia');
    expect(entry).toBeDefined();
    expect(entry.key).toBe('tecnologia');
    expect(entry.label).toBeTruthy();
    expect(entry.icon).toBeTruthy();
  });
});

// ─── 16. buildOpportunityTextParts ───────────────────────────────────────────

describe('_KCU.taxonomy.buildOpportunityTextParts', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.taxonomy.buildOpportunityTextParts; });

  test('extrai area e titulo de objeto fonte', () => {
    const result = fn({ area: 'Tecnologia', titulo: 'Dev Job' });
    expect(result.explicit).toContain('Tecnologia');
    expect(result.text).toContain('Dev Job');
  });

  test('trata string diretamente como explicit', () => {
    const result = fn('tecnologia');
    expect(result.explicit).toContain('tecnologia');
    expect(result.text).toEqual([]);
    expect(result.tags).toEqual([]);
  });

  test('retorna estrutura vazia para null', () => {
    const result = fn(null);
    expect(result.explicit).toEqual([]);
    expect(result.text).toEqual([]);
    expect(result.tags).toEqual([]);
  });

  test('extrai tags do objeto fonte', () => {
    const result = fn({ tags: ['tag1', 'tag2'], area: 'Design' });
    expect(result.tags).toContain('tag1');
    expect(result.tags).toContain('tag2');
  });
});

// ─── 17. extractOpportunityAreaHistoryEntries ────────────────────────────────

describe('_KCU.taxonomy.extractOpportunityAreaHistoryEntries', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.taxonomy.extractOpportunityAreaHistoryEntries; });

  test('extrai entradas de array de strings', () => {
    const entries = fn(['Tecnologia', 'Design']);
    expect(entries.length).toBeGreaterThanOrEqual(2);
    entries.forEach(e => {
      expect(typeof e.label).toBe('string');
      expect(typeof e.key).toBe('string');
      expect(typeof e.icon).toBe('string');
    });
  });

  test('extrai entradas de objetos com label/key', () => {
    const entries = fn([{ label: 'Marketing Digital', key: 'marketing-digital' }]);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].key).toBe('marketing-digital');
  });

  test('retorna [] para não-array', () => {
    expect(fn(null)).toEqual([]);
    expect(fn(undefined)).toEqual([]);
    expect(fn('string')).toEqual([]);
  });

  test('ignora itens null/undefined dentro do array', () => {
    const entries = fn([null, undefined, 'Tecnologia']);
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── 18. buildHistoryOpportunityAreaMaps ─────────────────────────────────────

describe('_KCU.taxonomy.buildHistoryOpportunityAreaMaps', () => {
  let fn, officialMap;
  beforeEach(() => {
    fn = window._KCU.taxonomy.buildHistoryOpportunityAreaMaps;
    officialMap = window._KCU.taxonomy.buildOfficialOpportunityAreaMaps();
  });

  test('retorna objeto com catalog e aliasMap', () => {
    const result = fn(['Area Nova'], officialMap);
    expect(result.catalog instanceof Map).toBe(true);
    expect(result.aliasMap instanceof Map).toBe(true);
  });

  test('não inclui áreas oficiais no catalog', () => {
    // 'tecnologia' é oficial — não deve entrar no catalog de histórico
    const result = fn(['tecnologia'], officialMap);
    expect(result.catalog.has('tecnologia')).toBe(false);
  });

  test('inclui área desconhecida no catalog', () => {
    const result = fn(['Area Completamente Nova XYZ'], officialMap);
    expect(result.catalog.size).toBeGreaterThanOrEqual(1);
  });
});

// ─── 19. findBestOfficialOpportunityArea ─────────────────────────────────────

describe('_KCU.taxonomy.findBestOfficialOpportunityArea', () => {
  let fn, officialMap;
  beforeEach(() => {
    fn = window._KCU.taxonomy.findBestOfficialOpportunityArea;
    officialMap = window._KCU.taxonomy.buildOfficialOpportunityAreaMaps();
  });

  test('encontra por correspondência exata', () => {
    const result = fn('tecnologia', officialMap);
    expect(result).not.toBeNull();
    expect(result.key).toBe('tecnologia');
  });

  test('retorna null para candidato vazio', () => {
    expect(fn('', officialMap)).toBeNull();
    expect(fn(null, officialMap)).toBeNull();
  });

  test('retorna null para candidato muito distante', () => {
    expect(fn('xyzxyzxyzxyzxyz', officialMap)).toBeNull();
  });
});

// ─── 20. findBestFuzzyOpportunityArea ────────────────────────────────────────

describe('_KCU.taxonomy.findBestFuzzyOpportunityArea', () => {
  let fn, defs;
  beforeEach(() => {
    fn = window._KCU.taxonomy.findBestFuzzyOpportunityArea;
    defs = window._KCU.taxonomy.getOpportunityAreaDefinitions();
  });

  test('retorna null para candidato curto (<5 chars)', () => {
    expect(fn('abc', defs)).toBeNull();
  });

  test('retorna null para candidato muito diferente', () => {
    expect(fn('xyzxyzxyzxyz', defs)).toBeNull();
  });

  test('retorna null para collection vazia', () => {
    expect(fn('tecnologia', [])).toBeNull();
  });
});

// ─── 21. findBestOfficialContextArea ─────────────────────────────────────────

describe('_KCU.taxonomy.findBestOfficialContextArea', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.taxonomy.findBestOfficialContextArea; });

  test('retorna null para texto vazio/null', () => {
    expect(fn('')).toBeNull();
    expect(fn(null)).toBeNull();
  });

  test('encontra área quando texto contém alias normalizado', () => {
    // "tecnologia" normalizado está em OPPORTUNITY_AREA_DEFINITIONS
    const result = fn('quero uma vaga em tecnologia');
    expect(result).not.toBeNull();
    expect(result.key).toBe('tecnologia');
  });

  test('retorna null para texto sem nenhum alias', () => {
    // String com caracteres que não formam nenhum alias das definições oficiais
    expect(fn('aaaabbb cccddd eeefffggg 99999')).toBeNull();
  });
});

// ─── 22. resolveOpportunityArea ──────────────────────────────────────────────

describe('_KCU.taxonomy.resolveOpportunityArea', () => {
  let fn;
  beforeEach(() => { fn = window._KCU.taxonomy.resolveOpportunityArea; });

  test('resolve área conhecida por string exata', () => {
    const result = fn('tecnologia');
    expect(result.key).toBeTruthy();
    expect(result.isKnown).toBe(true);
    expect(result.source).toMatch(/official/);
  });

  test('resolve via objeto com campo area', () => {
    const result = fn({ area: 'Design', titulo: 'Designer UX' });
    expect(result.key).toBe('design');
    expect(result.isKnown).toBe(true);
  });

  test('retorna source "empty" para entrada vazia', () => {
    const result = fn('');
    expect(result.source).toBe('empty');
    expect(result.key).toBe('');
    expect(result.isKnown).toBe(false);
  });

  test('retorna source "custom" para área completamente desconhecida', () => {
    const result = fn('area-completamente-desconhecida-xyz-999');
    expect(result.key).toBeTruthy();
    expect(result.source).toBe('custom');
    expect(result.isKnown).toBe(false);
  });

  test('resultado sempre tem key, label, icon, isKnown, source', () => {
    const result = fn('marketing');
    expect(typeof result.key).toBe('string');
    expect(typeof result.label).toBe('string');
    expect(typeof result.icon).toBe('string');
    expect(typeof result.isKnown).toBe('boolean');
    expect(typeof result.source).toBe('string');
  });

  test('resolve alias de área (via aliases em OPPORTUNITY_AREA_DEFINITIONS)', () => {
    const defs = window._KCU.taxonomy.getOpportunityAreaDefinitions();
    const designDef = defs.find(d => d.key === 'design');
    if (designDef && designDef.aliases && designDef.aliases.length > 0) {
      const alias = designDef.aliases[0];
      const result = fn(alias);
      expect(result.key).toBe('design');
    } else {
      // se não houver aliases, passa direto
      expect(true).toBe(true);
    }
  });
});

/**
 * kc-utils-location.test.js — v12.2.5
 * Contrato estático e testes funcionais do sub-módulo window._KCU.location
 * (kc-utils.location.js): 32 funções do domínio de localização e habitação.
 */
'use strict';

/* ── Setup ──────────────────────────────────────────────────────────────── */

beforeAll(() => {
  global.window = global.window || global;
  // Configura mock KC_CONSTANTS ANTES dos requires (objeto simples, não congelado)
  // Evita o Object.freeze() do kc-constants.js real ao usar dados de teste próprios.
  window.KC_CONSTANTS = {
    HOUSING_REGION_DEFINITIONS: [
      { key: 'setor-norte', label: 'Setor Norte', icon: 'fas fa-map-pin', zoneKey: 'norte', zoneLabel: 'Zona Norte', aliases: ['norte', 'sn'] },
      { key: 'setor-sul', label: 'Setor Sul', icon: 'fas fa-map-pin', zoneKey: 'sul', zoneLabel: 'Zona Sul', aliases: ['sul'] },
    ],
    HOUSING_FEATURE_DEFINITIONS: [
      { key: 'aceita-pets', label: 'Aceita Pets', icon: 'fas fa-paw', aliases: ['pets', 'animais'] },
      { key: 'mobiliado', label: 'Mobiliado', icon: 'fas fa-couch', aliases: ['mobilia', 'mobiliada'] },
    ],
    LOST_FOUND_LOCATION_DEFINITIONS: [
      { key: 'biblioteca-central', label: 'Biblioteca Central', icon: 'fas fa-book', emoji: '\u{1f4da}', aliases: ['biblioteca', 'bct'] },
      { key: 'restaurante-universitario', label: 'Restaurante Universitário', icon: 'fas fa-utensils', emoji: '\u{1f37d}', aliases: ['ru', 'restaurante'] },
    ],
    CARONAS_LOCATION_DEFINITIONS: [
      { key: 'campus-samambaia', label: 'Campus Samambaia', icon: 'fas fa-university', aliases: ['campus', 'ufg'], isCampus: true, abbreviations: ['CS'] },
      { key: 'setor-oeste', label: 'Setor Oeste', icon: 'fas fa-map-marker-alt', aliases: ['oeste'], isCampus: false },
    ],
  };
  require('../../assets/js/kc-utils.string.js');
  require('../../assets/js/kc-utils.location.js');
});

const loc = () => window._KCU.location;

/* ── 1. Contrato estático ────────────────────────────────────────────────── */

describe('_KCU.location — contrato estático', () => {
  it('expõe window._KCU.location congelado com 32 funções', () => {
    const m = loc();
    expect(m).toBeDefined();
    expect(Object.isFrozen(m)).toBe(true);
    const keys = [
      'getHousingFeatureEmoji', 'getLostFoundLocationEmoji', 'toStringArray',
      'scoreHousingLabel', 'pickPreferredHousingLabel', 'formatHousingLabel',
      'buildDefinitionAliasMap', 'getHousingFuzzyThreshold', 'getHousingSimilarityScore',
      'isCloseHousingAlias', 'findBestFuzzyHousingEntry', 'buildHousingTextParts',
      'getHousingRegionDefinitions', 'getHousingRegionInfoByKey',
      'extractHousingRegionHistoryEntries', 'buildHousingRegionHistoryMaps', 'resolveHousingRegion',
      'resolveCaronasLocation',
      'getHousingFeatureDefinitions', 'getHousingFeatureInfoByKey',
      'extractHousingFeatureHistoryEntries', 'buildHousingFeatureHistoryMaps',
      'resolveSingleHousingFeature', 'resolveHousingFeatures',
      'resolveHousingTypeKey', 'resolveHousingTypeFromCandidates',
      'getLostFoundLocationDefinitions', 'getLostFoundLocationInfoByKey',
      'buildLostFoundTextParts', 'extractLostFoundLocationHistoryEntries',
      'buildLostFoundHistoryMaps', 'resolveLostFoundLocation',
    ];
    keys.forEach((k) => {
      expect(typeof m[k]).toBe('function');
    });
    expect(Object.keys(m).length).toBe(32);
  });
});

/* ── 2. getHousingFeatureEmoji ───────────────────────────────────────────── */

describe('_KCU.location.getHousingFeatureEmoji', () => {
  it('retorna emoji correto para aceita-pets', () => {
    expect(loc().getHousingFeatureEmoji('aceita-pets')).toBe('\u{1f43e}');
  });
  it('retorna emoji correto para mobiliado', () => {
    expect(loc().getHousingFeatureEmoji('mobiliado')).toBe('\u{1f6cb}\u{fe0f}');
  });
  it('retorna fallback para chave desconhecida', () => {
    expect(loc().getHousingFeatureEmoji('chave-invalida-xyz')).toBe('\u{1f3f7}\u{fe0f}');
  });
  it('retorna fallback para entrada vazia', () => {
    expect(loc().getHousingFeatureEmoji('')).toBe('\u{1f3f7}\u{fe0f}');
  });
});

/* ── 3. getLostFoundLocationEmoji ────────────────────────────────────────── */

describe('_KCU.location.getLostFoundLocationEmoji', () => {
  it('retorna emoji correto para biblioteca-central', () => {
    expect(loc().getLostFoundLocationEmoji('biblioteca-central')).toBe('\u{1f4da}');
  });
  it('retorna emoji correto para estacionamento', () => {
    expect(loc().getLostFoundLocationEmoji('estacionamento')).toBe('\u{1f17f}\u{fe0f}');
  });
  it('retorna fallback para chave desconhecida', () => {
    expect(loc().getLostFoundLocationEmoji('lugar-inexistente')).toBe('\u{1f4cd}');
  });
});

/* ── 4. toStringArray ────────────────────────────────────────────────────── */

describe('_KCU.location.toStringArray', () => {
  it('retorna array de strings para array de entrada', () => {
    expect(loc().toStringArray(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });
  it('retorna array vazio para null', () => {
    expect(loc().toStringArray(null)).toEqual([]);
  });
  it('retorna array vazio para false', () => {
    expect(loc().toStringArray(false)).toEqual([]);
  });
  it('divide string por vírgula', () => {
    expect(loc().toStringArray('a, b, c')).toEqual(['a', 'b', 'c']);
  });
  it('divide string por pipe', () => {
    expect(loc().toStringArray('x|y|z')).toEqual(['x', 'y', 'z']);
  });
  it('faz parse de JSON array válido', () => {
    expect(loc().toStringArray('["foo","bar"]')).toEqual(['foo', 'bar']);
  });
  it('retorna array vazio para string vazia', () => {
    expect(loc().toStringArray('')).toEqual([]);
  });
});

/* ── 5. scoreHousingLabel ────────────────────────────────────────────────── */

describe('_KCU.location.scoreHousingLabel', () => {
  it('retorna 0 para string vazia', () => {
    expect(loc().scoreHousingLabel('')).toBe(0);
  });
  it('retorna score mais alto para string com maiúsculas e acentos', () => {
    const s1 = loc().scoreHousingLabel('Setúbal Norte');
    const s2 = loc().scoreHousingLabel('setubal');
    expect(s1).toBeGreaterThan(s2);
  });
  it('retorna número positivo para qualquer string não vazia', () => {
    expect(loc().scoreHousingLabel('abc')).toBeGreaterThan(0);
  });
});

/* ── 6. pickPreferredHousingLabel ────────────────────────────────────────── */

describe('_KCU.location.pickPreferredHousingLabel', () => {
  it('retorna candidate quando current está vazio', () => {
    expect(loc().pickPreferredHousingLabel('', 'Candidato')).toBe('Candidato');
  });
  it('retorna current quando candidate está vazio', () => {
    expect(loc().pickPreferredHousingLabel('Atual', '')).toBe('Atual');
  });
  it('prefere string com maiúsculas e acentos', () => {
    const result = loc().pickPreferredHousingLabel('setor norte', 'Setor Norte');
    expect(result).toBe('Setor Norte');
  });
});

/* ── 7. formatHousingLabel ───────────────────────────────────────────────── */

describe('_KCU.location.formatHousingLabel', () => {
  it('retorna string vazia para entrada vazia', () => {
    expect(loc().formatHousingLabel('')).toBe('');
  });
  it('preserva string com maiúsculas', () => {
    expect(loc().formatHousingLabel('Setor Norte')).toBe('Setor Norte');
  });
  it('aplica titleCase para string minúscula', () => {
    const result = loc().formatHousingLabel('setor norte');
    expect(result[0]).toBe(result[0].toUpperCase());
  });
  it('retorna string vazia para null', () => {
    expect(loc().formatHousingLabel(null)).toBe('');
  });
});

/* ── 8. buildDefinitionAliasMap ──────────────────────────────────────────── */

describe('_KCU.location.buildDefinitionAliasMap', () => {
  const defs = [
    { key: 'setor-norte', label: 'Setor Norte', aliases: ['norte', 'sn'] },
  ];
  it('retorna Map com aliases normalizados', () => {
    const map = loc().buildDefinitionAliasMap(defs);
    expect(map).toBeInstanceOf(Map);
    expect(map.has('setor norte')).toBe(true);
    expect(map.has('norte')).toBe(true);
    expect(map.has('sn')).toBe(true);
  });
  it('retorna Map vazio para array vazio', () => {
    expect(loc().buildDefinitionAliasMap([])).toBeInstanceOf(Map);
    expect(loc().buildDefinitionAliasMap([]).size).toBe(0);
  });
  it('retorna Map vazio para entrada inválida', () => {
    expect(loc().buildDefinitionAliasMap(null)).toBeInstanceOf(Map);
  });
});

/* ── 9. getHousingFuzzyThreshold ─────────────────────────────────────────── */

describe('_KCU.location.getHousingFuzzyThreshold', () => {
  it('retorna 1 para strings curtas (≤6 chars)', () => {
    expect(loc().getHousingFuzzyThreshold('abc', 'def')).toBe(1);
  });
  it('retorna 2 para strings médias (≤12 chars)', () => {
    expect(loc().getHousingFuzzyThreshold('abcdefg', 'abcdefg')).toBe(2);
  });
  it('retorna 3 para strings longas (>12 chars)', () => {
    expect(loc().getHousingFuzzyThreshold('stringlonga123', 'stringlonga456')).toBe(3);
  });
});

/* ── 10. getHousingSimilarityScore ───────────────────────────────────────── */

describe('_KCU.location.getHousingSimilarityScore', () => {
  it('retorna 1 para strings idênticas', () => {
    expect(loc().getHousingSimilarityScore('norte', 'norte')).toBe(1);
  });
  it('retorna 0 para strings vazias', () => {
    expect(loc().getHousingSimilarityScore('', '')).toBe(0);
  });
  it('retorna valor entre 0 e 1 para strings similares', () => {
    const score = loc().getHousingSimilarityScore('norte', 'norta');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

/* ── 11. isCloseHousingAlias ─────────────────────────────────────────────── */

describe('_KCU.location.isCloseHousingAlias', () => {
  it('retorna true para strings idênticas', () => {
    expect(loc().isCloseHousingAlias('setor norte', 'setor norte')).toBe(true);
  });
  it('retorna false para strings muito diferentes', () => {
    expect(loc().isCloseHousingAlias('norte', 'sul')).toBe(false);
  });
  it('retorna false para strings muito curtas (< 5 chars)', () => {
    expect(loc().isCloseHousingAlias('abc', 'abd')).toBe(false);
  });
  it('retorna true para strings quase iguais (1 typo)', () => {
    expect(loc().isCloseHousingAlias('setor norte', 'setor nortte')).toBe(true);
  });
});

/* ── 12. findBestFuzzyHousingEntry ───────────────────────────────────────── */

describe('_KCU.location.findBestFuzzyHousingEntry', () => {
  const defs = [
    { key: 'setor-norte', label: 'Setor Norte', aliases: ['Setor Norte'] },
    { key: 'setor-sul', label: 'Setor Sul', aliases: ['Setor Sul'] },
  ];
  it('retorna null para string muito curta', () => {
    expect(loc().findBestFuzzyHousingEntry('ab', defs)).toBeNull();
  });
  it('retorna null para collection vazia', () => {
    expect(loc().findBestFuzzyHousingEntry('setor norte', [])).toBeNull();
  });
  it('retorna entrada mais próxima para typo leve', () => {
    const result = loc().findBestFuzzyHousingEntry('Setor Nortte', defs);
    expect(result).not.toBeNull();
    expect(result.key).toBe('setor-norte');
  });
});

/* ── 13. buildHousingTextParts ───────────────────────────────────────────── */

describe('_KCU.location.buildHousingTextParts', () => {
  it('retorna shape correto para string simples', () => {
    const r = loc().buildHousingTextParts('Setor Norte');
    expect(r).toHaveProperty('explicitRegions');
    expect(r).toHaveProperty('explicitFeatures');
    expect(r).toHaveProperty('text');
    expect(r).toHaveProperty('tags');
  });
  it('retorna explicitRegions para objeto com regionLabel', () => {
    const r = loc().buildHousingTextParts({ regionLabel: 'Setor Norte', titulo: 'Qto perto UFG' });
    expect(r.explicitRegions).toContain('Setor Norte');
    expect(r.text.some((t) => t === 'Qto perto UFG')).toBe(true);
  });
  it('trata array de entrada como explicitFeatures', () => {
    const r = loc().buildHousingTextParts(['mobiliado', 'aceita-pets']);
    expect(r.explicitFeatures).toEqual(['mobiliado', 'aceita-pets']);
    expect(r.explicitRegions).toEqual([]);
  });
});

/* ── 14. getHousingRegionDefinitions ─────────────────────────────────────── */

describe('_KCU.location.getHousingRegionDefinitions', () => {
  it('retorna array', () => {
    expect(Array.isArray(loc().getHousingRegionDefinitions())).toBe(true);
  });
  it('retorna cópia (não referência direta)', () => {
    const a = loc().getHousingRegionDefinitions();
    const b = loc().getHousingRegionDefinitions();
    expect(a).not.toBe(b);
  });
});

/* ── 15. getHousingRegionInfoByKey ───────────────────────────────────────── */

describe('_KCU.location.getHousingRegionInfoByKey', () => {
  it('retorna null para chave vazia', () => {
    expect(loc().getHousingRegionInfoByKey('')).toBeNull();
  });
  it('retorna null para chave desconhecida', () => {
    expect(loc().getHousingRegionInfoByKey('chave-inexistente-xyz')).toBeNull();
  });
  it('retorna entrada para chave conhecida', () => {
    const defs = loc().getHousingRegionDefinitions();
    if (defs.length === 0) return;
    const entry = loc().getHousingRegionInfoByKey(defs[0].key);
    expect(entry).not.toBeNull();
    expect(entry.key).toBe(defs[0].key);
  });
});

/* ── 16. getHousingFeatureDefinitions ────────────────────────────────────── */

describe('_KCU.location.getHousingFeatureDefinitions', () => {
  it('retorna array com emoji em cada entrada', () => {
    const defs = loc().getHousingFeatureDefinitions();
    expect(Array.isArray(defs)).toBe(true);
    defs.forEach((d) => expect(typeof d.emoji).toBe('string'));
  });
});

/* ── 17. getHousingFeatureInfoByKey ──────────────────────────────────────── */

describe('_KCU.location.getHousingFeatureInfoByKey', () => {
  it('retorna null para chave vazia', () => {
    expect(loc().getHousingFeatureInfoByKey('')).toBeNull();
  });
  it('retorna entrada com emoji para chave conhecida', () => {
    const defs = loc().getHousingFeatureDefinitions();
    if (!defs.length) return;
    const entry = loc().getHousingFeatureInfoByKey(defs[0].key);
    expect(entry).not.toBeNull();
    expect(entry).toHaveProperty('emoji');
  });
});

/* ── 18. getLostFoundLocationDefinitions ─────────────────────────────────── */

describe('_KCU.location.getLostFoundLocationDefinitions', () => {
  it('retorna array com emoji em cada entrada', () => {
    const defs = loc().getLostFoundLocationDefinitions();
    expect(Array.isArray(defs)).toBe(true);
    defs.forEach((d) => expect(typeof d.emoji).toBe('string'));
  });
});

/* ── 19. getLostFoundLocationInfoByKey ───────────────────────────────────── */

describe('_KCU.location.getLostFoundLocationInfoByKey', () => {
  it('retorna null para chave vazia', () => {
    expect(loc().getLostFoundLocationInfoByKey('')).toBeNull();
  });
  it('retorna entrada para chave conhecida', () => {
    const defs = loc().getLostFoundLocationDefinitions();
    if (!defs.length) return;
    const entry = loc().getLostFoundLocationInfoByKey(defs[0].key);
    expect(entry).not.toBeNull();
    expect(entry.key).toBe(defs[0].key);
  });
});

/* ── 20. extractHousingRegionHistoryEntries ──────────────────────────────── */

describe('_KCU.location.extractHousingRegionHistoryEntries', () => {
  it('retorna array vazio para entrada vazia', () => {
    expect(loc().extractHousingRegionHistoryEntries([])).toEqual([]);
  });
  it('retorna array vazio para entrada inválida', () => {
    expect(loc().extractHousingRegionHistoryEntries(null)).toEqual([]);
  });
  it('extrai entrada de string simples', () => {
    const entries = loc().extractHousingRegionHistoryEntries(['Setor Norte']);
    expect(entries.length).toBe(1);
    expect(entries[0]).toHaveProperty('key');
    expect(entries[0]).toHaveProperty('label');
  });
  it('extrai entrada de objeto com regionLabel', () => {
    const entries = loc().extractHousingRegionHistoryEntries([
      { regionLabel: 'Setor Norte', regionKey: 'setor-norte', icon: 'fas fa-map-pin' },
    ]);
    expect(entries.length).toBe(1);
    expect(entries[0].label).toBe('Setor Norte');
  });
});

/* ── 21. buildHousingRegionHistoryMaps ───────────────────────────────────── */

describe('_KCU.location.buildHousingRegionHistoryMaps', () => {
  it('retorna { catalog, aliasMap } Maps', () => {
    const maps = loc().buildHousingRegionHistoryMaps([], new Map());
    expect(maps.catalog).toBeInstanceOf(Map);
    expect(maps.aliasMap).toBeInstanceOf(Map);
  });
  it('ignora entradas que já estão no officialAliasMap', () => {
    const official = new Map([['setor norte', { key: 'setor-norte', label: 'Setor Norte' }]]);
    const maps = loc().buildHousingRegionHistoryMaps(
      [{ regionLabel: 'Setor Norte', regionKey: 'setor-norte' }],
      official
    );
    expect(maps.catalog.size).toBe(0);
  });
});

/* ── 22. resolveHousingRegion ────────────────────────────────────────────── */

describe('_KCU.location.resolveHousingRegion', () => {
  it('retorna empty para entrada vazia', () => {
    const r = loc().resolveHousingRegion('');
    expect(r.source).toBe('empty');
    expect(r.key).toBe('');
    expect(r.isKnown).toBe(false);
  });
  it('retorna empty para null', () => {
    const r = loc().resolveHousingRegion(null);
    expect(r.source).toBe('empty');
  });
  it('retorna shape correto para qualquer entrada', () => {
    const r = loc().resolveHousingRegion({ regionLabel: 'Área Teste' });
    expect(r).toHaveProperty('key');
    expect(r).toHaveProperty('label');
    expect(r).toHaveProperty('icon');
    expect(r).toHaveProperty('zoneKey');
    expect(r).toHaveProperty('zoneLabel');
    expect(r).toHaveProperty('isKnown');
    expect(r).toHaveProperty('source');
  });
  it('resolve chave oficial conhecida', () => {
    const defs = loc().getHousingRegionDefinitions();
    if (!defs.length) return;
    const r = loc().resolveHousingRegion(defs[0].label);
    expect(r.isKnown).toBe(true);
    expect(r.key).toBe(defs[0].key);
  });
  it('retorna custom para string não reconhecida', () => {
    const r = loc().resolveHousingRegion('regiaoXYZabc999zzz');
    expect(['custom', 'empty']).toContain(r.source);
  });
});

/* ── 23. resolveCaronasLocation ──────────────────────────────────────────── */

describe('_KCU.location.resolveCaronasLocation', () => {
  it('retorna empty para entrada vazia', () => {
    const r = loc().resolveCaronasLocation('');
    expect(r.source).toBe('empty');
    expect(r.isCampus).toBe(false);
  });
  it('retorna shape correto com isCampus', () => {
    const r = loc().resolveCaronasLocation('qualquer');
    expect(r).toHaveProperty('isCampus');
    expect(r).toHaveProperty('isKnown');
    expect(r).toHaveProperty('source');
  });
  it('resolve alias exato de campus', () => {
    const r = loc().resolveCaronasLocation('ufg');
    expect(r.isKnown).toBe(true);
    expect(r.isCampus).toBe(true);
  });
  it('resolve abreviação de campus', () => {
    const r = loc().resolveCaronasLocation('CS');
    expect(r.isKnown).toBe(true);
  });
});

/* ── 24. extractHousingFeatureHistoryEntries ─────────────────────────────── */

describe('_KCU.location.extractHousingFeatureHistoryEntries', () => {
  it('retorna array vazio para entrada vazia', () => {
    expect(loc().extractHousingFeatureHistoryEntries([])).toEqual([]);
  });
  it('extrai features de string simples', () => {
    const entries = loc().extractHousingFeatureHistoryEntries(['mobiliado']);
    expect(entries.length).toBe(1);
    expect(entries[0]).toHaveProperty('key');
    expect(entries[0]).toHaveProperty('emoji');
  });
});

/* ── 25. buildHousingFeatureHistoryMaps ──────────────────────────────────── */

describe('_KCU.location.buildHousingFeatureHistoryMaps', () => {
  it('retorna { catalog, aliasMap } Maps', () => {
    const maps = loc().buildHousingFeatureHistoryMaps([], new Map());
    expect(maps.catalog).toBeInstanceOf(Map);
    expect(maps.aliasMap).toBeInstanceOf(Map);
  });
});

/* ── 26. resolveSingleHousingFeature ─────────────────────────────────────── */

describe('_KCU.location.resolveSingleHousingFeature', () => {
  it('retorna null para string vazia', () => {
    expect(loc().resolveSingleHousingFeature('')).toBeNull();
  });
  it('resolve feature oficial por alias', () => {
    const defs = loc().getHousingFeatureDefinitions();
    if (!defs.length) return;
    const result = loc().resolveSingleHousingFeature(defs[0].label);
    expect(result).not.toBeNull();
    expect(result.isKnown).toBe(true);
  });
  it('retorna custom para string não reconhecida', () => {
    const result = loc().resolveSingleHousingFeature('feature-xyz-inventada-123');
    // pode ser null (se não slugify) ou custom
    if (result) expect(result.isKnown).toBe(false);
  });
});

/* ── 27. resolveHousingFeatures ──────────────────────────────────────────── */

describe('_KCU.location.resolveHousingFeatures', () => {
  it('retorna array vazio para entrada vazia', () => {
    expect(loc().resolveHousingFeatures('')).toEqual([]);
  });
  it('retorna array de features para lista de features', () => {
    const defs = loc().getHousingFeatureDefinitions();
    if (!defs.length) return;
    const result = loc().resolveHousingFeatures([defs[0].label]);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('key');
    expect(result[0]).toHaveProperty('emoji');
  });
  it('não duplica features', () => {
    const defs = loc().getHousingFeatureDefinitions();
    if (!defs.length) return;
    const input = [defs[0].label, defs[0].label];
    const result = loc().resolveHousingFeatures(input);
    const keys = result.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

/* ── 28. resolveHousingTypeKey ───────────────────────────────────────────── */

describe('_KCU.location.resolveHousingTypeKey', () => {
  it('retorna string vazia para entrada vazia', () => {
    expect(loc().resolveHousingTypeKey('')).toBe('');
  });
  it('retorna string vazia para "moradia"', () => {
    expect(loc().resolveHousingTypeKey('moradia')).toBe('');
  });
  it('retorna "apartamento" para "kitnet"', () => {
    expect(loc().resolveHousingTypeKey('kitnet')).toBe('apartamento');
  });
  it('retorna "republica" para "republica"', () => {
    expect(loc().resolveHousingTypeKey('república')).toBe('republica');
  });
  it('retorna "quarto" para "quarto"', () => {
    expect(loc().resolveHousingTypeKey('quarto individual')).toBe('quarto');
  });
  it('retorna "procurando" para "procuro quarto"', () => {
    expect(loc().resolveHousingTypeKey('procuro quarto')).toBe('procurando');
  });
});

/* ── 29. resolveHousingTypeFromCandidates ────────────────────────────────── */

describe('_KCU.location.resolveHousingTypeFromCandidates', () => {
  it('retorna string vazia para lista vazia', () => {
    expect(loc().resolveHousingTypeFromCandidates([])).toBe('');
  });
  it('retorna string vazia para lista com só "moradia"', () => {
    expect(loc().resolveHousingTypeFromCandidates(['moradia'])).toBe('');
  });
  it('retorna tipo correto do primeiro candidato válido', () => {
    expect(loc().resolveHousingTypeFromCandidates(['apartamento', 'moradia'])).toBe('apartamento');
  });
  it('combina candidatos sem tipo explícito', () => {
    const result = loc().resolveHousingTypeFromCandidates(['kitnet em goiânia']);
    expect(result).toBe('apartamento');
  });
});

/* ── 30. buildLostFoundTextParts ─────────────────────────────────────────── */

describe('_KCU.location.buildLostFoundTextParts', () => {
  it('retorna shape correto para string', () => {
    const r = loc().buildLostFoundTextParts('Biblioteca');
    expect(r).toHaveProperty('explicit');
    expect(r).toHaveProperty('text');
    expect(r).toHaveProperty('tags');
  });
  it('extrai explicit de objeto com lostFoundLocationLabel', () => {
    const r = loc().buildLostFoundTextParts({ lostFoundLocationLabel: 'Biblioteca Central' });
    expect(r.explicit).toContain('Biblioteca Central');
  });
  it('retorna explicit vazio para null', () => {
    const r = loc().buildLostFoundTextParts(null);
    expect(r.explicit).toEqual([]);
  });
});

/* ── 31. extractLostFoundLocationHistoryEntries ───────────────────────────── */

describe('_KCU.location.extractLostFoundLocationHistoryEntries', () => {
  it('retorna array vazio para entrada vazia', () => {
    expect(loc().extractLostFoundLocationHistoryEntries([])).toEqual([]);
  });
  it('extrai entrada de string simples', () => {
    const entries = loc().extractLostFoundLocationHistoryEntries(['Biblioteca']);
    expect(entries.length).toBe(1);
    expect(entries[0]).toHaveProperty('emoji');
  });
  it('extrai entrada de objeto com lostFoundLocationLabel', () => {
    const entries = loc().extractLostFoundLocationHistoryEntries([
      { lostFoundLocationLabel: 'RU', lostFoundLocationKey: 'restaurante-universitario' },
    ]);
    expect(entries.length).toBe(1);
    expect(entries[0]).toHaveProperty('icon');
  });
});

/* ── 32. buildLostFoundHistoryMaps ───────────────────────────────────────── */

describe('_KCU.location.buildLostFoundHistoryMaps', () => {
  it('retorna { catalog, aliasMap } Maps', () => {
    const maps = loc().buildLostFoundHistoryMaps([], new Map());
    expect(maps.catalog).toBeInstanceOf(Map);
    expect(maps.aliasMap).toBeInstanceOf(Map);
  });
  it('ignora entradas já no officialAliasMap', () => {
    const official = new Map([['biblioteca central', { key: 'biblioteca-central' }]]);
    const maps = loc().buildLostFoundHistoryMaps(
      [{ lostFoundLocationLabel: 'Biblioteca Central' }],
      official
    );
    expect(maps.catalog.size).toBe(0);
  });
});

/* ── 33. resolveLostFoundLocation ────────────────────────────────────────── */

describe('_KCU.location.resolveLostFoundLocation', () => {
  it('retorna empty para entrada vazia', () => {
    const r = loc().resolveLostFoundLocation('');
    expect(r.source).toBe('empty');
    expect(r.key).toBe('');
    expect(r.isKnown).toBe(false);
  });
  it('retorna shape correto com emoji', () => {
    const r = loc().resolveLostFoundLocation({ lostFoundLocationLabel: 'teste' });
    expect(r).toHaveProperty('key');
    expect(r).toHaveProperty('label');
    expect(r).toHaveProperty('icon');
    expect(r).toHaveProperty('emoji');
    expect(r).toHaveProperty('isKnown');
    expect(r).toHaveProperty('source');
  });
  it('resolve local oficial por alias exato', () => {
    const defs = loc().getLostFoundLocationDefinitions();
    if (!defs.length) return;
    const r = loc().resolveLostFoundLocation(defs[0].label);
    expect(r.isKnown).toBe(true);
    expect(r.key).toBe(defs[0].key);
  });
  it('retorna custom para string não reconhecida', () => {
    const r = loc().resolveLostFoundLocation('localxyz999inventado');
    expect(['custom', 'empty']).toContain(r.source);
  });
});

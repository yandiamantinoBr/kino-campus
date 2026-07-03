/**
 * @file kc-create-post-resolvers.test.js
 * @description Static contract tests for assets/js/features/create-post/kc-create-post.resolvers.js (v11.31.4)
 * Verifica estrutura IIFE, namespace, utilitários, resolvers de oportunidades,
 * moradia, caronas, achados/perdidos e funções de sync DOM.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../assets/js/features/create-post/kc-create-post.resolvers.js');
let source;

beforeAll(() => {
  source = fs.readFileSync(SRC, 'utf8');
});

// ── Estrutura IIFE e namespace ────────────────────────────────────────────────

describe('kc-create-post.resolvers — estrutura IIFE e namespace', () => {
  test('é uma IIFE (function(){})()', () => {
    expect(source).toMatch(/\(function\s*\(\)\s*\{/);
  });

  test("declara 'use strict'", () => {
    expect(source).toContain("'use strict';");
  });

  test('inicializa window._KCCreatePost', () => {
    expect(source).toContain('window._KCCreatePost = window._KCCreatePost || {};');
  });

  test('registra window._KCCreatePost.resolvers no final do IIFE', () => {
    expect(source).toContain('window._KCCreatePost.resolvers = {');
  });

  test('fecha o IIFE com })();', () => {
    expect(source).toContain('})();');
  });

  test('não usa require/import', () => {
    expect(source).not.toMatch(/require\s*\(/);
    expect(source).not.toMatch(/^import\s/m);
  });
});

// ── Utilitários locais ────────────────────────────────────────────────────────

describe('kc-create-post.resolvers — utilitários locais', () => {
  test('define _esc() delegando a window.KCUtils.escapeHtml', () => {
    expect(source).toContain('function _esc(str)');
    expect(source).toContain('window.KCUtils.escapeHtml');
  });

  test('define _getState() lendo window._KCCreatePost._state', () => {
    expect(source).toContain('function _getState()');
    expect(source).toContain('window._KCCreatePost._state');
  });
});

// ── Oportunidades: tipo ───────────────────────────────────────────────────────

describe('kc-create-post.resolvers — kcNormalizeOpportunityTypeKey', () => {
  test('define a função', () => {
    expect(source).toContain('function kcNormalizeOpportunityTypeKey(value)');
  });

  test('delega a KCUtils.canonicalCategory', () => {
    expect(source).toContain('KCUtils.canonicalCategory');
  });

  test('normaliza estagio, emprego, freelancer, monitoria, voluntariado', () => {
    expect(source).toContain("'estagio'");
    expect(source).toContain("'emprego'");
    expect(source).toContain("'freelancer'");
    expect(source).toContain("'monitoria'");
    expect(source).toContain("'voluntariado'");
  });

  test('normaliza edital, concurso, bolsa e cursos/capacitações', () => {
    expect(source).toContain("'edital'");
    expect(source).toContain("'concurso'");
    expect(source).toContain("'bolsa'");
    expect(source).toContain("'curso-capacitacao'");
  });

  test('exporta normalizeOpportunityTypeKey no namespace', () => {
    expect(source).toContain('normalizeOpportunityTypeKey: kcNormalizeOpportunityTypeKey,');
  });
});

describe('kc-create-post.resolvers — kcGetOpportunityTypeOptionKey', () => {
  test('define a função', () => {
    expect(source).toContain('function kcGetOpportunityTypeOptionKey(value)');
  });

  test('mapeia tipos singulares para opções plurais do schema', () => {
    expect(source).toContain("'editais'");
    expect(source).toContain("'concursos'");
    expect(source).toContain("'bolsas'");
    expect(source).toContain("'cursos-capacitacoes'");
    expect(source).toContain("'estagios'");
    expect(source).toContain("'empregos'");
  });

  test('exporta getOpportunityTypeOptionKey no namespace', () => {
    expect(source).toContain('getOpportunityTypeOptionKey: kcGetOpportunityTypeOptionKey,');
  });
});

// ── Oportunidades: área ───────────────────────────────────────────────────────

describe('kc-create-post.resolvers — kcResolveOpportunityAreaValue', () => {
  test('define a função', () => {
    expect(source).toContain('function kcResolveOpportunityAreaValue(value, fallbackSource)');
  });

  test('lê window.__KC_OPPORTUNITY_AREA_HISTORY', () => {
    expect(source).toContain('window.__KC_OPPORTUNITY_AREA_HISTORY');
  });

  test('delega a KCUtils.resolveOpportunityArea', () => {
    expect(source).toContain('KCUtils.resolveOpportunityArea');
  });

  test('exporta resolveOpportunityAreaValue no namespace', () => {
    expect(source).toContain('resolveOpportunityAreaValue: kcResolveOpportunityAreaValue,');
  });
});

describe('kc-create-post.resolvers — kcGetOpportunityAreaOptions', () => {
  test('define a função', () => {
    expect(source).toContain('function kcGetOpportunityAreaOptions()');
  });

  test('delega a KCUtils.getOpportunityAreaDefinitions', () => {
    expect(source).toContain('KCUtils.getOpportunityAreaDefinitions');
  });

  test('exporta getOpportunityAreaOptions no namespace', () => {
    expect(source).toContain('getOpportunityAreaOptions: kcGetOpportunityAreaOptions,');
  });
});

// ── Oportunidades: modalidade e regime ────────────────────────────────────────

describe('kc-create-post.resolvers — kcResolveOpportunityWorkMode', () => {
  test('define a função', () => {
    expect(source).toContain('function kcResolveOpportunityWorkMode(value)');
  });

  test('reconhece hibrido, remoto, presencial', () => {
    expect(source).toContain("'hibrido'");
    expect(source).toContain("'remoto'");
    expect(source).toContain("'presencial'");
  });

  test('exporta resolveOpportunityWorkMode no namespace', () => {
    expect(source).toContain('resolveOpportunityWorkMode: kcResolveOpportunityWorkMode,');
  });
});

describe('kc-create-post.resolvers — kcResolveOpportunityRegime', () => {
  test('define a função', () => {
    expect(source).toContain('function kcResolveOpportunityRegime(value)');
  });

  test('reconhece clt, pj, temporario, aprendiz, bolsa', () => {
    expect(source).toContain("'clt'");
    expect(source).toContain("'pj'");
    expect(source).toContain("'temporario'");
    expect(source).toContain("'aprendiz'");
    expect(source).toContain("'bolsa'");
  });

  test('exporta resolveOpportunityRegime no namespace', () => {
    expect(source).toContain('resolveOpportunityRegime: kcResolveOpportunityRegime,');
  });
});

// ── Moradia: tipo ─────────────────────────────────────────────────────────────

describe('kc-create-post.resolvers — kcNormalizeHousingTypeKey', () => {
  test('define a função', () => {
    expect(source).toContain('function kcNormalizeHousingTypeKey(value)');
  });

  test('normaliza republica, quarto, apartamento, casa, procurando', () => {
    expect(source).toContain("'republica'");
    expect(source).toContain("'quarto'");
    expect(source).toContain("'apartamento'");
    expect(source).toContain("'casa'");
    expect(source).toContain("'procurando'");
  });

  test('exporta normalizeHousingTypeKey no namespace', () => {
    expect(source).toContain('normalizeHousingTypeKey: kcNormalizeHousingTypeKey,');
  });
});

describe('kc-create-post.resolvers — kcGetHousingTypeOptionKey', () => {
  test('define a função', () => {
    expect(source).toContain('function kcGetHousingTypeOptionKey(value)');
  });

  test('mapeia republica->republicas, quarto->quartos, etc.', () => {
    expect(source).toContain("'republicas'");
    expect(source).toContain("'quartos'");
    expect(source).toContain("'apartamentos'");
    expect(source).toContain("'casas'");
  });

  test('exporta getHousingTypeOptionKey no namespace', () => {
    expect(source).toContain('getHousingTypeOptionKey: kcGetHousingTypeOptionKey,');
  });
});

// ── Utilitário de array de strings ────────────────────────────────────────────

describe('kc-create-post.resolvers — kcParseStringArrayValue', () => {
  test('define a função', () => {
    expect(source).toContain('function kcParseStringArrayValue(value)');
  });

  test('delega a KCUtils.toStringArray', () => {
    expect(source).toContain('KCUtils.toStringArray');
  });

  test('trata Array, JSON e string separada por pipe/vírgula', () => {
    expect(source).toContain('Array.isArray(value)');
    expect(source).toContain('JSON.parse(raw)');
    expect(source).toMatch(/split\(.*\[|,\]/);
  });

  test('exporta parseStringArray no namespace', () => {
    expect(source).toContain('parseStringArray: kcParseStringArrayValue,');
  });
});

describe('kc-create-post.resolvers — kcSerializeHousingFeatureValues', () => {
  test('define a função', () => {
    expect(source).toContain('function kcSerializeHousingFeatureValues(values)');
  });

  test('usa JSON.stringify e kcParseStringArrayValue internamente', () => {
    expect(source).toContain('JSON.stringify(kcParseStringArrayValue(values))');
  });

  test('exporta serializeHousingFeatureValues no namespace', () => {
    expect(source).toContain('serializeHousingFeatureValues: kcSerializeHousingFeatureValues,');
  });
});

// ── Moradia: região ───────────────────────────────────────────────────────────

describe('kc-create-post.resolvers — kcResolveHousingRegionValue', () => {
  test('define a função', () => {
    expect(source).toContain('function kcResolveHousingRegionValue(value, fallbackSource)');
  });

  test('lê window.__KC_HOUSING_REGION_HISTORY', () => {
    expect(source).toContain('window.__KC_HOUSING_REGION_HISTORY');
  });

  test('delega a KCUtils.resolveHousingRegion', () => {
    expect(source).toContain('KCUtils.resolveHousingRegion');
  });

  test('exporta resolveHousingRegionValue no namespace', () => {
    expect(source).toContain('resolveHousingRegionValue: kcResolveHousingRegionValue,');
  });
});

describe('kc-create-post.resolvers — kcGetHousingRegionOptions', () => {
  test('define a função', () => {
    expect(source).toContain('function kcGetHousingRegionOptions()');
  });

  test('delega a KCUtils.getHousingRegionDefinitions', () => {
    expect(source).toContain('KCUtils.getHousingRegionDefinitions');
  });

  test('exporta getHousingRegionOptions no namespace', () => {
    expect(source).toContain('getHousingRegionOptions: kcGetHousingRegionOptions,');
  });
});

// ── Moradia: marcadores ───────────────────────────────────────────────────────

describe('kc-create-post.resolvers — kcResolveHousingFeatureValues', () => {
  test('define a função', () => {
    expect(source).toContain('function kcResolveHousingFeatureValues(values, fallbackSource)');
  });

  test('lê window.__KC_HOUSING_FEATURE_HISTORY', () => {
    expect(source).toContain('window.__KC_HOUSING_FEATURE_HISTORY');
  });

  test('delega a KCUtils.resolveHousingFeatures', () => {
    expect(source).toContain('KCUtils.resolveHousingFeatures');
  });

  test('exporta resolveHousingFeatureValues no namespace', () => {
    expect(source).toContain('resolveHousingFeatureValues: kcResolveHousingFeatureValues,');
  });
});

describe('kc-create-post.resolvers — kcGetHousingFeatureOptions', () => {
  test('define a função', () => {
    expect(source).toContain('function kcGetHousingFeatureOptions()');
  });

  test('delega a KCUtils.getHousingFeatureDefinitions', () => {
    expect(source).toContain('KCUtils.getHousingFeatureDefinitions');
  });

  test('exporta getHousingFeatureOptions no namespace', () => {
    expect(source).toContain('getHousingFeatureOptions: kcGetHousingFeatureOptions,');
  });
});

describe('kc-create-post.resolvers — kcSyncHousingFeatureField', () => {
  test('define a função', () => {
    expect(source).toContain('function kcSyncHousingFeatureField(fieldRoot, values)');
  });

  test('usa _getState() para atualizar state.values', () => {
    const fnStart = source.indexOf('function kcSyncHousingFeatureField');
    const fnBody = source.slice(fnStart, fnStart + 800);
    expect(fnBody).toContain('_getState()');
    expect(fnBody).toContain('state.values[');
  });

  test('renderiza kc-field-chip e kc-field-chip__empty', () => {
    expect(source).toContain('kc-field-chip');
    expect(source).toContain('kc-field-chip__empty');
  });

  test('usa _esc() para escapar entry.key e entry.label', () => {
    expect(source).toContain('_esc(entry.key)');
    expect(source).toContain('_esc(entry.label)');
  });

  test('exporta syncHousingFeatureField no namespace', () => {
    expect(source).toContain('syncHousingFeatureField: kcSyncHousingFeatureField,');
  });
});

describe('kc-create-post.resolvers — kcAppendHousingFeatureFromInput', () => {
  test('define a função', () => {
    expect(source).toContain('function kcAppendHousingFeatureFromInput(input)');
  });

  test('usa kcGetHousingFeatureFieldContext e kcSyncHousingFeatureField internamente', () => {
    const fnStart = source.indexOf('function kcAppendHousingFeatureFromInput');
    const fnBody = source.slice(fnStart, fnStart + 500);
    expect(fnBody).toContain('kcGetHousingFeatureFieldContext');
    expect(fnBody).toContain('kcSyncHousingFeatureField');
  });

  test('exporta appendHousingFeatureFromInput no namespace', () => {
    expect(source).toContain('appendHousingFeatureFromInput: kcAppendHousingFeatureFromInput,');
  });
});

// ── Caronas ───────────────────────────────────────────────────────────────────

describe('kc-create-post.resolvers — caronas', () => {
  test('define kcResolveCaronasLocationValue delegando a KCUtils.resolveCaronasLocation', () => {
    expect(source).toContain('function kcResolveCaronasLocationValue(value)');
    expect(source).toContain('KCUtils.resolveCaronasLocation');
  });

  test('define kcGetCaronasCampusOptions lendo KC_CONSTANTS.CARONAS_LOCATION_DEFINITIONS', () => {
    expect(source).toContain('function kcGetCaronasCampusOptions()');
    expect(source).toContain('KC_CONSTANTS.CARONAS_LOCATION_DEFINITIONS');
  });

  test('define kcGetCaronasFeatureOptions com pelo menos 5 opções fixas', () => {
    expect(source).toContain('function kcGetCaronasFeatureOptions()');
    expect(source).toContain('ar-condicionado');
    expect(source).toContain('aceita-pets');
    expect(source).toContain('sem-fumar');
  });

  test('exporta resolveCaronasLocationValue no namespace', () => {
    expect(source).toContain('resolveCaronasLocationValue: kcResolveCaronasLocationValue,');
  });

  test('exporta getCaronasCampusOptions no namespace', () => {
    expect(source).toContain('getCaronasCampusOptions: kcGetCaronasCampusOptions,');
  });

  test('exporta getCaronasFeatureOptions no namespace', () => {
    expect(source).toContain('getCaronasFeatureOptions: kcGetCaronasFeatureOptions,');
  });
});

describe('kc-create-post.resolvers — kcSyncHousingRegionInput', () => {
  test('define a função', () => {
    expect(source).toContain('function kcSyncHousingRegionInput(input)');
  });

  test('detecta campo de caronas (origem/destino) e roteia para kcResolveCaronasLocationValue', () => {
    expect(source).toContain("'origem'");
    expect(source).toContain("'destino'");
    expect(source).toContain('kcResolveCaronasLocationValue');
  });

  test('usa _getState() para atualizar state.values', () => {
    const fnStart = source.indexOf('function kcSyncHousingRegionInput');
    const fnBody = source.slice(fnStart, fnStart + 600);
    expect(fnBody).toContain('_getState()');
    expect(fnBody).toContain('state.values[');
  });

  test('exporta syncHousingRegionInput no namespace', () => {
    expect(source).toContain('syncHousingRegionInput: kcSyncHousingRegionInput,');
  });
});

// ── Achados e Perdidos ────────────────────────────────────────────────────────

describe('kc-create-post.resolvers — achados e perdidos', () => {
  test('define kcResolveLostFoundLocationValue lendo __KC_LOST_FOUND_LOCATION_HISTORY', () => {
    expect(source).toContain('function kcResolveLostFoundLocationValue(value, fallbackSource)');
    expect(source).toContain('window.__KC_LOST_FOUND_LOCATION_HISTORY');
  });

  test('delega a KCUtils.resolveLostFoundLocation', () => {
    expect(source).toContain('KCUtils.resolveLostFoundLocation');
  });

  test('define kcGetLostFoundLocationOptions delegando a KCUtils.getLostFoundLocationDefinitions', () => {
    expect(source).toContain('function kcGetLostFoundLocationOptions()');
    expect(source).toContain('KCUtils.getLostFoundLocationDefinitions');
  });

  test('define kcSyncLostFoundLocationInput usando _getState()', () => {
    expect(source).toContain('function kcSyncLostFoundLocationInput(input)');
    const fnStart = source.indexOf('function kcSyncLostFoundLocationInput');
    const fnBody = source.slice(fnStart, fnStart + 300);
    expect(fnBody).toContain('_getState()');
    expect(fnBody).toContain('state.values[');
  });

  test('exporta resolveLostFoundLocationValue no namespace', () => {
    expect(source).toContain('resolveLostFoundLocationValue: kcResolveLostFoundLocationValue,');
  });

  test('exporta getLostFoundLocationOptions no namespace', () => {
    expect(source).toContain('getLostFoundLocationOptions: kcGetLostFoundLocationOptions,');
  });

  test('exporta syncLostFoundLocationInput no namespace', () => {
    expect(source).toContain('syncLostFoundLocationInput: kcSyncLostFoundLocationInput,');
  });
});

// ── Contagem de membros do namespace ─────────────────────────────────────────

describe('kc-create-post.resolvers — membros do namespace', () => {
  test('namespace exporta todos os 25 membros esperados', () => {
    const nsStart = source.indexOf('window._KCCreatePost.resolvers = {');
    const nsBody = source.slice(nsStart, nsStart + 1800);
    const expected = [
      'normalizeOpportunityTypeKey',
      'getOpportunityTypeOptionKey',
      'resolveOpportunityAreaValue',
      'getOpportunityAreaOptions',
      'resolveOpportunityWorkMode',
      'resolveOpportunityRegime',
      'normalizeHousingTypeKey',
      'getHousingTypeOptionKey',
      'parseStringArray',
      'serializeHousingFeatureValues',
      'resolveHousingRegionValue',
      'getHousingRegionOptions',
      'resolveHousingFeatureValues',
      'getHousingFeatureOptions',
      'getHousingFeatureFieldContext',
      'resolveHousingFeatureEntries',
      'syncHousingFeatureField',
      'appendHousingFeatureFromInput',
      'resolveCaronasLocationValue',
      'getCaronasCampusOptions',
      'getCaronasFeatureOptions',
      'syncHousingRegionInput',
      'resolveLostFoundLocationValue',
      'getLostFoundLocationOptions',
      'syncLostFoundLocationInput',
    ];
    expected.forEach((key) => {
      expect(nsBody).toContain(key + ':');
    });
  });
});

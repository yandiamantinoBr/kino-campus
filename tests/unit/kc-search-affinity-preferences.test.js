'use strict';

const Affinity = require('../../assets/js/shared/kc-search-affinity.shared.js');
const Preferences = require('../../assets/js/shared/kc-search-preferences.shared.js');
const Registry = require('../../assets/js/shared/kc-search-registry.generated.js');

const registry = Registry.registry || Registry;

function prefs(partial) {
  return Preferences.normalizeState(Object.assign({
    mode: 'personalized',
    modules: [],
    features: {},
    consent: { purpose: 'search-personalization-v1', granted: true }
  }, partial), Registry);
}

describe('personalização de busca — ranking real', () => {
  test('preferência explícita de módulo reordena resultados próximos', () => {
    const posts = [
      { id: 'housing', modulo: 'moradia', categoria: 'republicas', relevanceScore: 1 },
      { id: 'event', modulo: 'eventos', categoria: 'academicos', metadata: { categoryKey: 'academicos' }, relevanceScore: 0.96 }
    ];
    const ranked = Affinity.rerank(posts, {
      preferences: prefs({ modules: ['eventos'], features: { 'eventos:topico': ['academicos'] } }),
      registry,
      sortBy: 'relevance'
    });
    expect(ranked.map((post) => post.id)).toEqual(['event', 'housing']);
    expect(ranked[0]._kcPersonalization.boost).toBeGreaterThan(0);
    expect(ranked[0]._kcPersonalization.primary).toBeTruthy();
    expect(ranked[0]._kcPersonalization.primary.shortLabel).toBeTruthy();
    expect(ranked[0]._kcPersonalization.primary.tone).toMatch(/prioritized|match|sustainable|affinity|cashback/);
    expect(ranked[0]._kcPersonalization.reasons.some((reason) => /Eventos|Acadêmicos|escolhido|Priorizado/i.test(reason.label + reason.shortLabel))).toBe(true);
  });

  test('modo standard não altera a ordem original', () => {
    const posts = [
      { id: 'housing', modulo: 'moradia', relevanceScore: 1 },
      { id: 'event', modulo: 'eventos', relevanceScore: 0.99 }
    ];
    const ranked = Affinity.rerank(posts, {
      preferences: Preferences.defaultState(),
      registry,
      sortBy: 'relevance'
    });
    expect(ranked.map((post) => post.id)).toEqual(['housing', 'event']);
    expect(ranked[0]._kcPersonalization).toBeUndefined();
  });

  test('novo grupo do create-modal (caronas:tipo) entra no ranking', () => {
    const posts = [
      { id: 'housing', modulo: 'moradia', relevanceScore: 1 },
      {
        id: 'ride',
        modulo: 'caronas',
        // categoryGroupId de caronas é "tipo" → payload usa category/categoriaKey
        category: 'ofereco',
        categoria: 'ofereco',
        metadata: { categoryKey: 'ofereco' },
        relevanceScore: 0.94
      }
    ];
    const ranked = Affinity.rerank(posts, {
      preferences: prefs({ modules: ['caronas'], features: { 'caronas:tipo': ['ofereco'] } }),
      registry,
      sortBy: 'relevance'
    });
    expect(ranked[0].id).toBe('ride');
    expect(ranked[0]._kcPersonalization.reasons.length).toBeGreaterThan(0);
    expect(ranked[0]._kcPersonalization.boost).toBeGreaterThanOrEqual(0.09);
  });
});

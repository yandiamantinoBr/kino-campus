'use strict';

const Affinity = require('../../assets/js/shared/kc-search-affinity.shared.js');
const Registry = require('../../assets/js/shared/kc-search-registry.generated.js');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: jest.fn((key) => values.has(key) ? values.get(key) : null),
    setItem: jest.fn((key, value) => values.set(key, String(value))),
    removeItem: jest.fn((key) => values.delete(key)),
    snapshot: () => Object.fromEntries(values)
  };
}

function preferences(overrides = {}) {
  return Object.assign({
    mode: 'personalized',
    modules: [],
    features: {},
    localAffinityConsent: false,
    consent: { purpose: 'search-personalization-v1', granted: true }
  }, overrides);
}

function eventPost(id, score, topic = 'academicos') {
  return {
    id,
    module: 'eventos',
    category: topic,
    relevanceScore: score,
    metadata: { categoryKey: topic }
  };
}

describe('afinidade local e reranking responsável', () => {
  const now = '2026-06-20T12:00:00.000Z';

  test('extrai somente módulo e grupos canônicos elegíveis', () => {
    const signals = Affinity.extractSignals(eventPost('e1', 1), Registry);
    expect(signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'module:eventos', type: 'module' }),
      expect.objectContaining({ key: 'feature:eventos:topico:academicos', type: 'feature' })
    ]));
    // status group is preference-eligible (synced with create-modal), so category maps to a feature signal.
    expect(Affinity.extractSignals({ module: 'achados-perdidos', category: 'perdidos' }, Registry))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ key: 'module:achados-perdidos', type: 'module' }),
        expect.objectContaining({ key: 'feature:achados-perdidos:status:perdidos', type: 'feature' })
      ]));
  });

  test('não registra sem opt-in separado, em automação ou fora de clique deliberado', () => {
    const storage = memoryStorage();
    const post = eventPost('e1', 1);
    expect(Affinity.recordInteraction(post, {
      preferences: preferences(), registry: Registry, storage, source: 'results-click', now
    })).toBe(false);
    expect(Affinity.recordInteraction(post, {
      preferences: preferences({ localAffinityConsent: true }), registry: Registry, storage,
      source: 'impression', now
    })).toBe(false);
    expect(Affinity.recordInteraction(post, {
      preferences: preferences({ localAffinityConsent: true }), registry: Registry, storage,
      source: 'dropdown-click', automated: true, now
    })).toBe(false);
    expect(storage.snapshot()).toEqual({});
  });

  test('agrega clique em sinais mínimos, sem query, identidade ou log de eventos', () => {
    const storage = memoryStorage();
    const opts = {
      preferences: preferences({ localAffinityConsent: true }), registry: Registry, storage,
      source: 'results-click', now
    };
    expect(Affinity.recordInteraction(eventPost('e1', 1), opts)).toBeTruthy();
    expect(Affinity.recordInteraction(eventPost('e2', 0.9), opts)).toBeTruthy();
    const stored = JSON.parse(storage.getItem(Affinity.STORAGE_KEY));
    expect(stored).toMatchObject({
      version: 1,
      purpose: 'search-personalization-v1',
      features: {
        'module:eventos': { count: 2 },
        'feature:eventos:topico:academicos': { count: 2 }
      }
    });
    expect(JSON.stringify(stored)).not.toMatch(/query|user|email|identity|events/i);
    expect(Date.parse(stored.features['module:eventos'].expiresAt) - Date.parse(now)).toBe(Affinity.TTL_MS);
  });

  test('poda expirados, payload inválido e limita o número de features', () => {
    const features = {
      expired: { count: 20, updatedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-02T00:00:00.000Z' },
      invalid: { count: 2, updatedAt: 'nope', expiresAt: 'nope' }
    };
    for (let index = 0; index < 40; index += 1) {
      features[`module:item${index}`] = {
        count: 999,
        updatedAt: `2026-06-${String((index % 19) + 1).padStart(2, '0')}T00:00:00.000Z`,
        expiresAt: '2026-09-30T00:00:00.000Z'
      };
    }
    const normalized = Affinity.normalizeState({ features }, { now });
    expect(Object.keys(normalized.features)).toHaveLength(Affinity.MAX_FEATURES);
    expect(normalized.features).not.toHaveProperty('expired');
    expect(normalized.features).not.toHaveProperty('invalid');
    expect(Math.max(...Object.values(normalized.features).map((entry) => entry.count))).toBe(Affinity.MAX_COUNT);
  });

  test('preferência explícita só desempata candidatos próximos e nunca adiciona candidato', () => {
    const input = [
      { id: 'strong-query', module: 'moradia', relevanceScore: 1 },
      eventPost('preferred-but-weaker', 0.94)
    ];
    const ranked = Affinity.rerank(input, {
      preferences: preferences({ modules: ['eventos'] }), registry: Registry, now
    });
    expect(ranked.map((post) => post.id)).toEqual(['strong-query', 'preferred-but-weaker']);
    expect(ranked).toHaveLength(input.length);
    expect(ranked[1]._kcPersonalization.boost).toBeLessThanOrEqual(Affinity.MAX_EXPLICIT_BOOST);

    const nearTie = Affinity.rerank([input[0], eventPost('near-tie', 0.98)], {
      preferences: preferences({ modules: ['eventos'], features: { 'eventos:topico': ['academicos'] } }),
      registry: Registry, now
    });
    expect(nearTie[0].id).toBe('near-tie');
    expect(nearTie[0]._kcPersonalization.reasons.map((reason) => reason.label).join(' '))
      .toMatch(/escolhido por você/);
  });

  test('afinidade decai, satura e mantém teto total de 7%', () => {
    const storage = memoryStorage();
    storage.setItem(Affinity.STORAGE_KEY, JSON.stringify({
      version: 1,
      purpose: 'search-personalization-v1',
      updatedAt: now,
      features: {
        'module:eventos': { count: 20, updatedAt: now, expiresAt: '2026-09-18T12:00:00.000Z' }
      }
    }));
    const ranked = Affinity.rerank([eventPost('e1', 1)], {
      preferences: preferences({
        modules: ['eventos'],
        features: { 'eventos:topico': ['academicos'] },
        localAffinityConsent: true
      }),
      registry: Registry,
      storage,
      now
    });
    expect(ranked[0]._kcPersonalization.boost).toBeLessThanOrEqual(Affinity.MAX_TOTAL_BOOST);
    expect(ranked[0]._kcPersonalization.affinityBoost).toBeLessThanOrEqual(Affinity.MAX_AFFINITY_BOOST);
    expect(ranked[0]._kcPersonalization.reasons.map((reason) => reason.type)).toContain('local-affinity');
    expect(Affinity.affinityStrength({ count: 20, updatedAt: '2026-05-21T12:00:00.000Z' }, Date.parse(now)))
      .toBeLessThan(Affinity.affinityStrength({ count: 20, updatedAt: now }, Date.parse(now)));
  });

  test('modo padrão e ordenações explícitas preservam integralmente a ordem', () => {
    const input = [eventPost('a', 0.8), eventPost('b', 1)];
    expect(Affinity.rerank(input, {
      preferences: preferences({ mode: 'standard', consent: { granted: false } }), registry: Registry, now
    }).map((post) => post.id)).toEqual(['a', 'b']);
    expect(Affinity.rerank(input, {
      preferences: preferences({ modules: ['eventos'] }), registry: Registry, sortBy: 'recent', now
    }).map((post) => post.id)).toEqual(['a', 'b']);
  });
});

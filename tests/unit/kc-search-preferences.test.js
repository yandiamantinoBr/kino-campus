'use strict';

const Preferences = require('../../assets/js/shared/kc-search-preferences.shared.js');
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

describe('preferências explícitas de busca', () => {
  test('começa no modo não personalizado e sem consentimento implícito', () => {
    expect(Preferences.defaultState()).toMatchObject({
      mode: 'standard',
      modules: [],
      features: {},
      localAffinityConsent: false,
      consent: { purpose: 'search-personalization-v1', granted: false }
    });
  });

  test('aceita apenas módulos e opções canônicas elegíveis do create schema', () => {
    const normalized = Preferences.normalizeState({
      mode: 'personalized',
      modules: ['eventos', 'eventos', 'inexistente'],
      features: {
        'eventos:topico': ['academicos', 'academicos', 'inventado'],
        'achados-perdidos:tipo': ['documentos'],
        'caronas:tipo': ['ofereco'],
        contato: ['telefone']
      },
      localAffinityConsent: true,
      query: 'texto que nunca deve persistir',
      campus: 'inferência proibida'
    }, Registry);

    expect(normalized.modules).toEqual(['eventos']);
    // Todos os tagGroups do create-modal são elegíveis; valores inválidos caem fora.
    expect(normalized.features).toEqual({
      'eventos:topico': ['academicos'],
      'achados-perdidos:tipo': ['documentos'],
      'caronas:tipo': ['ofereco']
    });
    expect(normalized.localAffinityConsent).toBe(true);
    expect(normalized).not.toHaveProperty('query');
    expect(normalized).not.toHaveProperty('campus');
  });

  test('catalogo de assuntos cobre todos os tagGroups do create-modal com emoji', () => {
    const catalog = Preferences.preferenceCatalog(Registry);
    const keys = Object.keys(catalog).sort();
    expect(keys).toEqual([
      'achados-perdidos:status',
      'achados-perdidos:tipo',
      'caronas:tipo',
      'compra-venda:acao',
      'compra-venda:categoria',
      'eventos:topico',
      'moradia:tipo',
      'oportunidades:tipo'
    ]);
    expect(catalog['eventos:topico'].moduleEmoji).toBe('📅');
    expect(catalog['eventos:topico'].options.every((option) => option.emoji)).toBe(true);
    expect(catalog['eventos:topico'].options.find((option) => option.key === 'academicos').emoji).toBe('🎓');
  });

  test('modo padrão remove preferências e afinidade mesmo com payload residual', () => {
    expect(Preferences.normalizeState({
      mode: 'standard',
      modules: ['eventos'],
      features: { 'eventos:topico': ['academicos'] },
      localAffinityConsent: true
    }, Registry)).toMatchObject({ modules: [], features: {}, localAffinityConsent: false });
  });

  test('salva consentimento versionado e revogação apaga afinidade local', () => {
    const storage = memoryStorage();
    storage.setItem(Preferences.AFFINITY_STORAGE_KEY, '{"events":[]}');
    const now = () => '2026-06-20T12:00:00.000Z';

    const saved = Preferences.save({
      mode: 'personalized',
      modules: ['moradia'],
      localAffinityConsent: false
    }, { storage, registry: Registry, now });

    expect(saved).toMatchObject({
      version: 1,
      mode: 'personalized',
      modules: ['moradia'],
      consent: { purpose: 'search-personalization-v1', granted: true, updatedAt: now() },
      updatedAt: now()
    });
    expect(storage.getItem(Preferences.AFFINITY_STORAGE_KEY)).toBeNull();
    expect(JSON.parse(storage.getItem(Preferences.STORAGE_KEY))).not.toHaveProperty('query');
  });

  test('exporta o escopo atual e clear remove os dois stores', () => {
    const storage = memoryStorage();
    Preferences.save({ mode: 'personalized', modules: ['oportunidades'], localAffinityConsent: true }, {
      storage, registry: Registry, now: () => '2026-06-20T12:00:00.000Z'
    });
    storage.setItem(Preferences.AFFINITY_STORAGE_KEY, JSON.stringify({ version: 1, features: {} }));

    const exported = Preferences.exportData({
      storage, registry: Registry, now: () => '2026-06-20T12:01:00.000Z'
    });
    expect(exported).toMatchObject({
      exportVersion: 2,
      scope: 'local-browser-only',
      preferences: { modules: ['oportunidades'] },
      localAffinity: { version: 1, features: {} }
    });

    Preferences.clear({ storage });
    expect(storage.snapshot()).toEqual({});
  });

  test('mergeLocalAndRemote prioriza conta mais recente e sinaliza push quando o local venceu', () => {
    const local = Preferences.normalizeState({
      mode: 'personalized',
      modules: ['moradia'],
      updatedAt: '2026-07-20T12:00:00.000Z'
    }, Registry);
    const remote = Preferences.normalizeState({
      mode: 'personalized',
      modules: ['eventos'],
      updatedAt: '2026-07-20T13:00:00.000Z'
    }, Registry);

    const remoteWins = Preferences.mergeLocalAndRemote(local, remote, Registry);
    expect(remoteWins.shouldWriteLocal).toBe(true);
    expect(remoteWins.shouldPushRemote).toBe(false);
    expect(remoteWins.state.modules).toEqual(['eventos']);

    const localWins = Preferences.mergeLocalAndRemote(local, {
      ...remote,
      updatedAt: '2026-07-20T11:00:00.000Z'
    }, Registry);
    expect(localWins.shouldPushRemote).toBe(true);
    expect(localWins.state.modules).toEqual(['moradia']);
  });

  test('falha fechada quando storage está indisponível ou corrompido', () => {
    const broken = {
      getItem: () => '{not-json',
      setItem: () => { throw new Error('blocked'); },
      removeItem: jest.fn()
    };
    expect(Preferences.load({ storage: broken, registry: Registry })).toEqual(Preferences.defaultState());
    expect(() => Preferences.save({ mode: 'personalized' }, { storage: broken, registry: Registry }))
      .toThrow('blocked');
  });
});

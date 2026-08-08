'use strict';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

describe('kc-create-post.resolvers — características de caronas', () => {
  let resolvers;

  beforeEach(() => {
    jest.resetModules();
    window._KCCreatePost = { _state: { values: {} } };
    window.KCUtils = { normalizeText };
    global.KCUtils = window.KCUtils;
    global.kcUserPosts = null;
    global.KC_CONSTANTS = { CARONAS_LOCATION_DEFINITIONS: [] };
    require('../../assets/js/features/create-post/kc-create-post.resolvers.js');
    resolvers = window._KCCreatePost.resolvers;
  });

  afterEach(() => {
    delete global.KCUtils;
    delete global.kcUserPosts;
    delete global.KC_CONSTANTS;
    delete window.KCUtils;
    delete window._KCCreatePost;
  });

  test('canonicaliza aliases legados sem convertê-los em características de moradia', () => {
    const result = resolvers.resolveCaronasFeatureValues([
      '4-mais-lugares',
      'Não fumantes',
      'Apenas mulheres',
    ]);

    expect(result.map((entry) => entry.key)).toEqual([
      'quatro-mais-lugares',
      'sem-fumar',
      'somente-mulheres',
    ]);
  });

  test('o componente compartilhado mantém as keys do catálogo de caronas', () => {
    document.body.innerHTML = [
      '<div data-kc-housing-features-field="true">',
      '  <input name="marcadoresCarona" data-kc-housing-features-value>',
      '  <div data-kc-housing-features-selected></div>',
      '  <button data-kc-housing-feature-suggestion data-kc-housing-feature-key="sem-fumar"></button>',
      '</div>',
    ].join('');
    const root = document.querySelector('[data-kc-housing-features-field="true"]');

    const entries = resolvers.syncHousingFeatureField(root, ['Sem fumar', '4+ lugares']);

    expect(entries.map((entry) => entry.key)).toEqual(['sem-fumar', 'quatro-mais-lugares']);
    expect(window._KCCreatePost._state.values.marcadoresCarona).toEqual(['Sem fumar', '4+ lugares']);
    expect(root.querySelector('[data-kc-housing-feature-key="sem-fumar"]').getAttribute('aria-pressed')).toBe('true');
  });
});

beforeAll(() => {
  global.window = global.window || global;
  require('../assets/js/kc-constants.js');
});

describe('KC_CONSTANTS - Constantes Globais', () => {
  let KC;

  beforeEach(() => {
    KC = window.KC_CONSTANTS;
  });

  // ── 1. Existencia e congelamento do objeto raiz ──────────────────────

  test('KC_CONSTANTS existe como propriedade de window', () => {
    expect(window.KC_CONSTANTS).toBeDefined();
  });

  test('KC_CONSTANTS esta congelado (Object.isFrozen)', () => {
    expect(Object.isFrozen(KC)).toBe(true);
  });

  // ── 2. MODULE_LABEL_MAP ──────────────────────────────────────────────

  describe('MODULE_LABEL_MAP', () => {
    test('contem todas as chaves de modulo esperadas', () => {
      const expectedKeys = [
        'moradia', 'eventos', 'oportunidades',
        'achados-perdidos', 'caronas', 'compra-venda',
      ];
      expectedKeys.forEach((key) => {
        expect(KC.MODULE_LABEL_MAP).toHaveProperty(key);
      });
    });

    test('labels sao strings nao-vazias', () => {
      Object.values(KC.MODULE_LABEL_MAP).forEach((label) => {
        expect(typeof label).toBe('string');
        expect(label.length).toBeGreaterThan(0);
      });
    });

    test('esta congelado', () => {
      expect(Object.isFrozen(KC.MODULE_LABEL_MAP)).toBe(true);
    });

    test('mapeia moradia para Moradia', () => {
      expect(KC.MODULE_LABEL_MAP['moradia']).toBe('Moradia');
    });

    test('mapeia eventos para Eventos', () => {
      expect(KC.MODULE_LABEL_MAP['eventos']).toBe('Eventos');
    });

    test('mapeia compra-venda para Compra e Venda', () => {
      expect(KC.MODULE_LABEL_MAP['compra-venda']).toBe('Compra e Venda');
    });
  });

  // ── 3. MODULE_ICON_MAP ───────────────────────────────────────────────

  describe('MODULE_ICON_MAP', () => {
    test('contem entrada para cada chave de MODULE_LABEL_MAP', () => {
      Object.keys(KC.MODULE_LABEL_MAP).forEach((key) => {
        expect(KC.MODULE_ICON_MAP).toHaveProperty(key);
      });
    });

    test('icones sao strings Font Awesome validas (prefixo fas/far/fab)', () => {
      Object.values(KC.MODULE_ICON_MAP).forEach((icon) => {
        expect(typeof icon).toBe('string');
        expect(icon).toMatch(/^fa[srb]\s+fa-/);
      });
    });

    test('esta congelado', () => {
      expect(Object.isFrozen(KC.MODULE_ICON_MAP)).toBe(true);
    });
  });

  // ── 4. CATEGORY_LABELS ──────────────────────────────────────────────

  describe('CATEGORY_LABELS', () => {
    test('contem entrada para cada modulo principal', () => {
      const expectedModules = [
        'compra-venda', 'achados-perdidos', 'caronas',
        'oportunidades', 'eventos', 'moradia',
      ];
      expectedModules.forEach((mod) => {
        expect(KC.CATEGORY_LABELS).toHaveProperty(mod);
        expect(typeof KC.CATEGORY_LABELS[mod]).toBe('object');
      });
    });

    test('cada sub-mapa de categorias esta congelado', () => {
      Object.values(KC.CATEGORY_LABELS).forEach((subMap) => {
        expect(Object.isFrozen(subMap)).toBe(true);
      });
    });

    test('labels de categoria sao strings nao-vazias', () => {
      Object.values(KC.CATEGORY_LABELS).forEach((subMap) => {
        Object.values(subMap).forEach((label) => {
          expect(typeof label).toBe('string');
          expect(label.length).toBeGreaterThan(0);
        });
      });
    });

    test('objeto raiz esta congelado', () => {
      expect(Object.isFrozen(KC.CATEGORY_LABELS)).toBe(true);
    });
  });

  // ── 5. OPPORTUNITY_AREA_DEFINITIONS ──────────────────────────────────

  describe('OPPORTUNITY_AREA_DEFINITIONS', () => {
    test('e um array nao-vazio', () => {
      expect(Array.isArray(KC.OPPORTUNITY_AREA_DEFINITIONS)).toBe(true);
      expect(KC.OPPORTUNITY_AREA_DEFINITIONS.length).toBeGreaterThan(0);
    });

    test('cada entrada possui key, label, icon e aliases', () => {
      KC.OPPORTUNITY_AREA_DEFINITIONS.forEach((entry) => {
        expect(typeof entry.key).toBe('string');
        expect(entry.key.length).toBeGreaterThan(0);
        expect(typeof entry.label).toBe('string');
        expect(entry.label.length).toBeGreaterThan(0);
        expect(typeof entry.icon).toBe('string');
        expect(entry.icon.length).toBeGreaterThan(0);
        expect(Array.isArray(entry.aliases)).toBe(true);
        expect(entry.aliases.length).toBeGreaterThan(0);
      });
    });

    test('cada entrada esta congelada', () => {
      KC.OPPORTUNITY_AREA_DEFINITIONS.forEach((entry) => {
        expect(Object.isFrozen(entry)).toBe(true);
      });
    });

    test('contem a area tecnologia', () => {
      const tech = KC.OPPORTUNITY_AREA_DEFINITIONS.find((e) => e.key === 'tecnologia');
      expect(tech).toBeDefined();
      expect(tech.label).toBe('Tecnologia');
    });

    test('array raiz esta congelado', () => {
      expect(Object.isFrozen(KC.OPPORTUNITY_AREA_DEFINITIONS)).toBe(true);
    });
  });

  // ── 6. HOUSING_REGION_DEFINITIONS ────────────────────────────────────

  describe('HOUSING_REGION_DEFINITIONS', () => {
    test('e um array nao-vazio', () => {
      expect(Array.isArray(KC.HOUSING_REGION_DEFINITIONS)).toBe(true);
      expect(KC.HOUSING_REGION_DEFINITIONS.length).toBeGreaterThan(0);
    });

    test('cada entrada possui key, label e aliases', () => {
      KC.HOUSING_REGION_DEFINITIONS.forEach((entry) => {
        expect(typeof entry.key).toBe('string');
        expect(typeof entry.label).toBe('string');
        expect(Array.isArray(entry.aliases)).toBe(true);
      });
    });

    test('esta congelado', () => {
      expect(Object.isFrozen(KC.HOUSING_REGION_DEFINITIONS)).toBe(true);
    });
  });

  // ── 7. HOUSING_FEATURE_DEFINITIONS ───────────────────────────────────

  describe('HOUSING_FEATURE_DEFINITIONS', () => {
    test('e um array nao-vazio', () => {
      expect(Array.isArray(KC.HOUSING_FEATURE_DEFINITIONS)).toBe(true);
      expect(KC.HOUSING_FEATURE_DEFINITIONS.length).toBeGreaterThan(0);
    });

    test('cada entrada possui key, label e aliases', () => {
      KC.HOUSING_FEATURE_DEFINITIONS.forEach((entry) => {
        expect(typeof entry.key).toBe('string');
        expect(typeof entry.label).toBe('string');
        expect(Array.isArray(entry.aliases)).toBe(true);
      });
    });

    test('esta congelado', () => {
      expect(Object.isFrozen(KC.HOUSING_FEATURE_DEFINITIONS)).toBe(true);
    });
  });

  // ── 8. DEFAULT_AVATAR_SVG ────────────────────────────────────────────

  describe('DEFAULT_AVATAR_SVG', () => {
    test('e uma string nao-vazia', () => {
      expect(typeof KC.DEFAULT_AVATAR_SVG).toBe('string');
      expect(KC.DEFAULT_AVATAR_SVG.length).toBeGreaterThan(0);
    });

    test('inicia com data:image/svg+xml', () => {
      expect(KC.DEFAULT_AVATAR_SVG).toMatch(/^data:image\/svg\+xml/);
    });
  });

  // ── 9. Outros arrays congelados ──────────────────────────────────────

  describe('LOST_FOUND_LOCATION_DEFINITIONS', () => {
    test('e um array nao-vazio e congelado', () => {
      expect(Array.isArray(KC.LOST_FOUND_LOCATION_DEFINITIONS)).toBe(true);
      expect(KC.LOST_FOUND_LOCATION_DEFINITIONS.length).toBeGreaterThan(0);
      expect(Object.isFrozen(KC.LOST_FOUND_LOCATION_DEFINITIONS)).toBe(true);
    });
  });

  describe('CARONAS_LOCATION_DEFINITIONS', () => {
    test('e um array nao-vazio e congelado', () => {
      expect(Array.isArray(KC.CARONAS_LOCATION_DEFINITIONS)).toBe(true);
      expect(KC.CARONAS_LOCATION_DEFINITIONS.length).toBeGreaterThan(0);
      expect(Object.isFrozen(KC.CARONAS_LOCATION_DEFINITIONS)).toBe(true);
    });
  });

  describe('SUBCATEGORY_LABELS', () => {
    test('existe e esta congelado', () => {
      expect(KC.SUBCATEGORY_LABELS).toBeDefined();
      expect(Object.isFrozen(KC.SUBCATEGORY_LABELS)).toBe(true);
    });
  });

  // ── 10. Nenhuma chave de modulo duplicada ────────────────────────────

  test('nao ha chaves duplicadas em MODULE_LABEL_MAP', () => {
    const keys = Object.keys(KC.MODULE_LABEL_MAP);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });

  test('nao ha chaves duplicadas em MODULE_ICON_MAP', () => {
    const keys = Object.keys(KC.MODULE_ICON_MAP);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });

  test('nao ha keys duplicadas em OPPORTUNITY_AREA_DEFINITIONS', () => {
    const keys = KC.OPPORTUNITY_AREA_DEFINITIONS.map((e) => e.key);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });
});

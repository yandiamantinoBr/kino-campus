beforeAll(() => {
  global.window = global.window || global;
  // kc-filters.js usa window.KCUtils se disponivel, mas tem fallback interno
  require('../assets/js/kc-constants.js');
  require('../assets/js/kc-utils.string.js'); // deve preceder kc-utils.js (v12.2.0)
  require('../assets/js/kc-utils.format.js'); // deve preceder kc-utils.js (v12.2.1)
  require('../assets/js/kc-utils.dom.js'); // deve preceder kc-utils.js (v12.2.2)
  require('../assets/js/kc-utils.identity.js'); // deve preceder kc-utils.js (v12.2.3)
  require('../assets/js/kc-utils.taxonomy.js'); // deve preceder kc-utils.js (v12.2.4)
  require('../assets/js/kc-utils.location.js'); // deve preceder kc-utils.js (v12.2.5)
  require('../assets/js/kc-utils.presentation.js'); // deve preceder kc-utils.js (v12.2.6)
  require('../assets/js/kc-utils.js');
  require('../assets/js/kc-feed-filters.js');
  // jsdom fornece document para o DOMContentLoaded
  require('../assets/js/kc-filters.js');
});

describe('kcFilters - Filtros unificados (tabs + busca)', () => {
  let filters;

  beforeEach(() => {
    filters = window.kcFilters;
  });

  describe('normalizeText', () => {
    test('remove acentos, converte para minusculas e faz trim', () => {
      expect(filters.normalizeText(' Arvore ')).toBe('arvore');
      expect(filters.normalizeText('Comunicacao')).toBe('comunicacao');
      expect(filters.normalizeText('MAIUSCULO')).toBe('maiusculo');
    });

    test('lida com null e undefined', () => {
      expect(filters.normalizeText(null)).toBe('');
      expect(filters.normalizeText(undefined)).toBe('');
    });

    test('lida com string vazia', () => {
      expect(filters.normalizeText('')).toBe('');
    });

    test('lida com numeros convertidos para string', () => {
      expect(filters.normalizeText(123)).toBe('123');
    });
  });

  describe('canonicalCategory', () => {
    test('remove prefixo # da categoria', () => {
      expect(filters.canonicalCategory('#eletronicos')).toBe('eletronico');
    });

    test('remove s final para plural basico pt-BR', () => {
      expect(filters.canonicalCategory('livros')).toBe('livro');
      expect(filters.canonicalCategory('eventos')).toBe('evento');
    });

    test('nao remove s de strings curtas (3 chars ou menos)', () => {
      expect(filters.canonicalCategory('gas')).toBe('gas');
    });

    test('normaliza acentos', () => {
      expect(filters.canonicalCategory('Moveis')).toBe('movei');
      expect(filters.canonicalCategory('Eletronicos')).toBe('eletronico');
    });

    test('Todas retorna toda', () => {
      expect(filters.canonicalCategory('Todas')).toBe('toda');
    });

    test('lida com string vazia e null', () => {
      expect(filters.canonicalCategory('')).toBe('');
      expect(filters.canonicalCategory(null)).toBe('');
    });
  });

  describe('getState / setCategory / setQuery', () => {
    test('setCategory atualiza state.category', () => {
      filters.setCategory('moradia');
      const s = filters.getState();
      expect(s.category).toBe('moradia');
    });

    test('setCategory com valor vazio retorna todas', () => {
      filters.setCategory('');
      expect(filters.getState().category).toBe('todas');
    });

    test('setQuery atualiza state.query', () => {
      filters.setQuery('notebook');
      expect(filters.getState().query).toBe('notebook');
    });

    test('setQuery com valor vazio limpa a query', () => {
      filters.setQuery('teste');
      filters.setQuery('');
      expect(filters.getState().query).toBe('');
    });

    test('getState retorna copia do estado com propriedades esperadas', () => {
      const s = filters.getState();
      expect(s).toHaveProperty('category');
      expect(s).toHaveProperty('query');
      expect(s).toHaveProperty('ready');
      expect(s).toHaveProperty('opts');
    });
  });
});

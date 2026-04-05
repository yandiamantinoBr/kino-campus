const SearchShared = require('../assets/js/kc-search.shared.js');

describe('KCSearchShared - Funcoes puras de busca', () => {

  describe('SYNONYMS', () => {
    test('e um objeto nao-vazio', () => {
      expect(typeof SearchShared.SYNONYMS).toBe('object');
      expect(Object.keys(SearchShared.SYNONYMS).length).toBeGreaterThan(0);
    });

    test('possui chaves esperadas', () => {
      const keys = Object.keys(SearchShared.SYNONYMS);
      expect(keys).toContain('notebook');
      expect(keys).toContain('celular');
      expect(keys).toContain('livro');
      expect(keys).toContain('carona');
      expect(keys).toContain('fone');
      expect(keys).toContain('bicicleta');
    });

    test('cada valor e um array de strings', () => {
      Object.values(SearchShared.SYNONYMS).forEach(arr => {
        expect(Array.isArray(arr)).toBe(true);
        arr.forEach(item => expect(typeof item).toBe('string'));
      });
    });
  });

  describe('normalizeText', () => {
    test('converte para minusculas e remove acentos', () => {
      expect(SearchShared.normalizeText('Computacao')).toBe('computacao');
      expect(SearchShared.normalizeText('Cafe')).toBe('cafe');
      expect(SearchShared.normalizeText('MAIUSCULO')).toBe('maiusculo');
    });

    test('lida com null e undefined', () => {
      expect(SearchShared.normalizeText(null)).toBe('');
      expect(SearchShared.normalizeText(undefined)).toBe('');
    });

    test('remove espacos extras nas bordas', () => {
      expect(SearchShared.normalizeText('  texto  ')).toBe('texto');
    });

    test('preserva espacos internos', () => {
      expect(SearchShared.normalizeText('duas palavras')).toBe('duas palavras');
    });
  });

  describe('expandSynonyms', () => {
    test('notebook expande para incluir laptop e computador', () => {
      const result = SearchShared.expandSynonyms('notebook');
      expect(result).toContain('notebook');
      expect(result).toContain('laptop');
      expect(result).toContain('computador');
    });

    test('laptop (sinonimo) expande para incluir notebook e outros sinonimos', () => {
      const result = SearchShared.expandSynonyms('laptop');
      expect(result).toContain('laptop');
      expect(result).toContain('notebook');
      expect(result).toContain('computador');
    });

    test('termo desconhecido retorna apenas o termo normalizado', () => {
      const result = SearchShared.expandSynonyms('xyzabc');
      expect(result).toEqual(['xyzabc']);
    });

    test('string vazia retorna array vazio', () => {
      expect(SearchShared.expandSynonyms('')).toEqual([]);
    });

    test('celular inclui smartphone e iphone', () => {
      const result = SearchShared.expandSynonyms('celular');
      expect(result).toContain('smartphone');
      expect(result).toContain('iphone');
    });

    test('carona expande para transporte e viagem', () => {
      const result = SearchShared.expandSynonyms('carona');
      expect(result).toContain('transporte');
      expect(result).toContain('viagem');
    });

    test('sinonimo reverso: smartphone expande para celular', () => {
      const result = SearchShared.expandSynonyms('smartphone');
      expect(result).toContain('celular');
      expect(result).toContain('smartphone');
    });
  });

  describe('matchesExpandedTerms', () => {
    test('retorna true quando texto contem um dos termos', () => {
      const terms = SearchShared.expandSynonyms('notebook');
      expect(SearchShared.matchesExpandedTerms('Vendo notebook Dell', terms)).toBe(true);
      expect(SearchShared.matchesExpandedTerms('Laptop seminovo', terms)).toBe(true);
    });

    test('retorna false quando texto nao contem nenhum termo', () => {
      const terms = SearchShared.expandSynonyms('notebook');
      expect(SearchShared.matchesExpandedTerms('Vendo bicicleta', terms)).toBe(false);
    });

    test('lida com texto vazio', () => {
      const terms = SearchShared.expandSynonyms('notebook');
      expect(SearchShared.matchesExpandedTerms('', terms)).toBe(false);
    });

    test('lida com termos vazios/nulos', () => {
      expect(SearchShared.matchesExpandedTerms('qualquer texto', [])).toBe(false);
      expect(SearchShared.matchesExpandedTerms('qualquer texto', null)).toBe(false);
    });
  });
});

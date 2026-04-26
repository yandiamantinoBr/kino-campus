const SearchShared = require('../../assets/js/kc-search.shared.js');

describe('KCSearchShared', () => {
  describe('SYNONYMS', () => {
    test('is a non-empty object', () => {
      expect(typeof SearchShared.SYNONYMS).toBe('object');
      expect(Object.keys(SearchShared.SYNONYMS).length).toBeGreaterThan(0);
    });

    test('contains expected keys', () => {
      expect(Object.keys(SearchShared.SYNONYMS)).toEqual(expect.arrayContaining([
        'notebook',
        'celular',
        'livro',
        'carona',
        'fone',
        'bicicleta',
      ]));
    });
  });

  describe('normalizeText', () => {
    test('lowercases and removes accents', () => {
      expect(SearchShared.normalizeText('Matematica')).toBe('matematica');
      expect(SearchShared.normalizeText('MATEMATICA')).toBe('matematica');
      expect(SearchShared.normalizeText(' Matemática Aplicada ')).toBe('matematica aplicada');
    });

    test('handles nullish values', () => {
      expect(SearchShared.normalizeText(null)).toBe('');
      expect(SearchShared.normalizeText(undefined)).toBe('');
    });
  });

  describe('expandSynonyms', () => {
    test('expands notebook to laptop and computador', () => {
      const result = SearchShared.expandSynonyms('notebook');
      expect(result).toEqual(expect.arrayContaining(['notebook', 'laptop', 'computador']));
    });

    test('expands reverse synonym smartphone to celular', () => {
      const result = SearchShared.expandSynonyms('smartphone');
      expect(result).toEqual(expect.arrayContaining(['smartphone', 'celular']));
    });

    test('returns only the normalized term for unknown words', () => {
      expect(SearchShared.expandSynonyms('xyzabc')).toEqual(['xyzabc']);
    });
  });

  describe('expandQueryTerms', () => {
    test('expands each token and deduplicates the final list', () => {
      const result = SearchShared.expandQueryTerms('Laptop Dell');
      expect(result).toEqual(expect.arrayContaining(['laptop', 'notebook', 'dell', 'notebook dell']));
      expect(new Set(result).size).toBe(result.length);
    });
  });

  describe('matchesExpandedTerms', () => {
    test('matches any expanded term in text', () => {
      const terms = SearchShared.expandSynonyms('notebook');
      expect(SearchShared.matchesExpandedTerms('Vendo laptop seminovo', terms)).toBe(true);
      expect(SearchShared.matchesExpandedTerms('Vendo bicicleta', terms)).toBe(false);
    });
  });

  describe('scorePost and searchCollection', () => {
    const posts = [
      {
        id: '1',
        title: 'Notebook Dell Inspiron',
        description: 'Perfeito para aulas e trabalho',
        category: 'eletronicos',
        module: 'compra-venda',
        metadata: { subcategoria: 'informatica', tags: ['notebook', 'dell'] },
        created_at: '2026-04-05T10:00:00Z',
      },
      {
        id: '2',
        title: 'Mochila resistente',
        description: 'Cabe notebook e varios acessorios',
        category: 'acessorios',
        module: 'compra-venda',
        metadata: { subcategoria: 'transporte', tags: ['mochila'] },
        created_at: '2026-04-05T09:00:00Z',
      },
      {
        id: '3',
        title: 'Grupo de estudo',
        description: 'Encontros de Matematica aplicada',
        category: 'estudos',
        module: 'oportunidades',
        metadata: { subcategoria: 'Matemática', tags: ['calculo'] },
        created_at: '2026-04-05T08:00:00Z',
      },
      {
        id: '4',
        title: 'Capa protetora',
        description: 'Ideal para laptop de 15 polegadas',
        category: 'acessorios',
        module: 'compra-venda',
        metadata: { subcategoria: 'informatica', tags: ['capa'] },
        created_at: '2026-04-05T11:00:00Z',
      },
    ];

    test('gives title matches more weight than description-only matches', () => {
      const titleScore = SearchShared.scorePost(posts[0], { q: 'notebook' });
      const descriptionScore = SearchShared.scorePost(posts[1], { q: 'notebook' });

      expect(titleScore).toBeGreaterThan(descriptionScore);
    });

    test('keeps tags above lower-weight description/category matches', () => {
      const results = SearchShared.searchCollection(posts, { q: 'calculo', limit: 10 });
      expect(results[0].id).toBe('3');
    });

    test('supports accent-insensitive matching on subcategory', () => {
      const results = SearchShared.searchCollection(posts, { q: 'matematica', limit: 10 });
      expect(results.map((post) => post.id)).toContain('3');
    });

    test('supports synonym expansion between laptop and notebook', () => {
      const results = SearchShared.searchCollection(posts, { q: 'laptop', limit: 10 });
      expect(results.map((post) => post.id)).toEqual(expect.arrayContaining(['1', '4']));
      expect(results[0].id).toBe('1');
    });

    test('keeps deterministic ordering by created_at when relevance ties', () => {
      const results = SearchShared.searchCollection(posts, {
        q: 'informatica',
        module: 'compra-venda',
        limit: 10,
      });

      expect(results[0].id).toBe('4');
      expect(results[1].id).toBe('1');
    });
  });
});

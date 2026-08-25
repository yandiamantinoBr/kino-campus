const SearchShared = require('../../assets/js/shared/kc-search.shared.js');

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

    test('encontra tags adicionais e suas chaves normalizadas', () => {
      const results = SearchShared.searchCollection([{
        id: 'user-tag-only',
        title: 'Oportunidade',
        module: 'oportunidades',
        metadata: { userTags: ['Acessibilidade'], userTagKeys: ['acessibilidade'] },
      }], { q: 'acessibilidade', limit: 10 });
      expect(results.map((post) => post.id)).toEqual(['user-tag-only']);
    });

    test('mantém tags históricas pesquisáveis enquanto o backfill ainda não alcançou uma linha', () => {
      const results = SearchShared.searchCollection([{
        id: 'legacy-tags-only',
        title: 'Edital institucional',
        module: 'oportunidades',
        metadata: {
          tags: ['Direito', 'Concursos', 'UFG', 'institutoverbena', 'Presencial'],
          tagKeys: ['direito', 'concursos', 'ufg', 'institutoverbena', 'presencial'],
        },
      }], { q: 'institutoverbena', limit: 10 });
      expect(results.map((post) => post.id)).toEqual(['legacy-tags-only']);
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

    test('supports search result filters for closed and non-public posts', () => {
      const list = [
        { id: 'active', title: 'CONPEEX Congresso de Pesquisa', module: 'eventos', status: 'published', created_at: '2026-06-01T10:00:00Z' },
        { id: 'closed', title: 'CONPEEX Congresso encerrado', module: 'eventos', status: 'closed', created_at: '2026-06-02T10:00:00Z' },
        { id: 'hidden', title: 'CONPEEX oculto', module: 'eventos', status: 'hidden', created_at: '2026-06-03T10:00:00Z' },
        { id: 'expired-date', title: 'CONPEEX com prazo vencido', module: 'eventos', status: 'published', metadata: { data_evento: '2026-05-01' } },
      ];

      const results = SearchShared.searchCollection(list, {
        q: 'conpeex',
        hideClosed: true,
        publicOnly: true,
        now: '2026-06-02T12:00:00Z',
        limit: 10,
      });

      expect(results.map((post) => post.id)).toEqual(['active']);
    });

    test('supports recent and engagement sorting modes', () => {
      const list = [
        { id: 'older-popular', title: 'CONPEEX congresso', module: 'eventos', votos: 8, view_count: 100, created_at: '2026-05-01T10:00:00Z' },
        { id: 'newer', title: 'CONPEEX congresso', module: 'eventos', votos: 1, view_count: 0, created_at: '2026-06-01T10:00:00Z' },
      ];

      expect(SearchShared.searchCollection(list, { q: 'conpeex', sortBy: 'recent', limit: 10 })[0].id).toBe('newer');
      expect(SearchShared.searchCollection(list, { q: 'conpeex', sortBy: 'engagement', limit: 10 })[0].id).toBe('older-popular');
    });

    test('usa a projeção estruturada quando ela foi anexada pelo driver', () => {
      const list = [
        {
          id: 'remote-job',
          title: 'Oportunidade para estudantes',
          description: 'Confira os detalhes',
          module: 'oportunidades',
          kcSearchProjection: { searchText: 'Tecnologia Remoto CLT' }
        }
      ];

      expect(SearchShared.searchCollection(list, { q: 'remoto' }).map((post) => post.id)).toEqual(['remote-job']);
    });

    test('sem projeção preserva o comportamento lexical anterior', () => {
      const list = [{ id: 'legacy', title: 'Oportunidade para estudantes', module: 'oportunidades' }];
      expect(SearchShared.searchCollection(list, { q: 'remoto' })).toEqual([]);
    });
  });

  describe('fuzzy matching (tolerância a erros)', () => {
    test('trigramSimilarity é alto para typos próximos e baixo para termos distintos', () => {
      expect(SearchShared.trigramSimilarity('conpex', 'conpeex')).toBeGreaterThanOrEqual(0.6);
      expect(SearchShared.trigramSimilarity('notbook', 'notebook')).toBeGreaterThanOrEqual(0.6);
      expect(SearchShared.trigramSimilarity('celular', 'conpeex')).toBeLessThan(0.3);
    });

    test('levenshtein conta a distância de edição', () => {
      expect(SearchShared.levenshtein('conpex', 'conpeex')).toBe(1);
      expect(SearchShared.levenshtein('abc', 'abc')).toBe(0);
      expect(SearchShared.levenshtein('', 'abc')).toBe(3);
    });

    test('fuzzyBestSimilarity casa o token contra a melhor palavra do texto', () => {
      expect(SearchShared.fuzzyBestSimilarity('conpex', 'CONPEEX 2024 congresso')).toBeGreaterThanOrEqual(0.6);
      expect(SearchShared.fuzzyBestSimilarity('xy', 'qualquer texto')).toBe(0); // token < 3 ignorado
    });

    test('matchesQueryText reaproveita sinônimos e fuzzy em filtros locais', () => {
      expect(SearchShared.matchesQueryText('23º CONPEEX - Congresso de Pesquisa', 'conpex')).toBe(true);
      expect(SearchShared.matchesQueryText('Grupo de estudo em Matemática Aplicada', 'matemtica')).toBe(true);
      expect(SearchShared.matchesQueryText('Kitnet próxima ao Campus Samambaia', 'quarto')).toBe(true);
      expect(SearchShared.matchesQueryText('Vendo quadro branco pequeno', 'quarto')).toBe(false);
    });

    test('searchCollection encontra posts mesmo com erro de digitação', () => {
      const list = [
        { id: 'a', title: 'CONPEEX 2024 - Congresso de Pesquisa', module: 'eventos' },
        { id: 'b', title: 'Notebook Dell i5', module: 'compra-venda' }
      ];
      expect(SearchShared.searchCollection(list, { q: 'conpex' }).map((p) => p.id)).toContain('a');
      expect(SearchShared.searchCollection(list, { q: 'notbook' }).map((p) => p.id)).toContain('b');
    });

    test('match exato rankeia acima de match fuzzy', () => {
      const list = [
        { id: 'exact', title: 'Conpeex', module: 'eventos' },
        { id: 'fuzzy', title: 'Conpex evento', module: 'eventos' }
      ];
      const results = SearchShared.searchCollection(list, { q: 'conpeex' });
      expect(results[0].id).toBe('exact');
    });
  });

  describe('expansão semântica (sinônimos enriquecidos)', () => {
    test('conpeex expande para congresso/pesquisa', () => {
      expect(SearchShared.expandSynonyms('conpeex')).toEqual(expect.arrayContaining(['conpeex', 'congresso', 'pesquisa']));
    });

    test('quarto expande para república/moradia', () => {
      expect(SearchShared.expandSynonyms('quarto')).toEqual(expect.arrayContaining(['quarto', 'republica', 'moradia']));
    });

    test('mantém os sinônimos legados', () => {
      expect(SearchShared.expandSynonyms('notebook')).toEqual(expect.arrayContaining(['notebook', 'laptop', 'computador']));
    });
  });
});

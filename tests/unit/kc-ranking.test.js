beforeAll(() => {
  global.window = global.window || global;
  // KCRanking precisa de KCAPI mockado
  window.KCAPI = { getTopContributors: jest.fn().mockResolvedValue([]) };
  require('../../assets/js/kc-ranking.js');
});

describe('KCRanking - Componente de ranking', () => {
  let ranking;

  beforeEach(() => {
    ranking = window.KCRanking;
  });

  describe('getModuleIcon', () => {
    test('compra-venda retorna fas fa-shopping-bag', () => {
      expect(ranking.getModuleIcon('compra-venda')).toBe('fas fa-shopping-bag');
    });

    test('moradia retorna fas fa-home', () => {
      expect(ranking.getModuleIcon('moradia')).toBe('fas fa-home');
    });

    test('caronas retorna fas fa-car', () => {
      expect(ranking.getModuleIcon('caronas')).toBe('fas fa-car');
    });

    test('eventos retorna fas fa-calendar-alt', () => {
      expect(ranking.getModuleIcon('eventos')).toBe('fas fa-calendar-alt');
    });

    test('oportunidades retorna fas fa-briefcase', () => {
      expect(ranking.getModuleIcon('oportunidades')).toBe('fas fa-briefcase');
    });

    test('null retorna icone padrao fas fa-campground', () => {
      expect(ranking.getModuleIcon(null)).toBe('fas fa-campground');
    });

    test('modulo desconhecido retorna icone padrao fas fa-campground', () => {
      expect(ranking.getModuleIcon('inexistente')).toBe('fas fa-campground');
    });

    test('undefined retorna icone padrao', () => {
      expect(ranking.getModuleIcon(undefined)).toBe('fas fa-campground');
    });
  });

  describe('getModuleLabel', () => {
    test('compra-venda retorna Compra e Venda', () => {
      expect(ranking.getModuleLabel('compra-venda')).toBe('Compra e Venda');
    });

    test('moradia retorna Moradia', () => {
      expect(ranking.getModuleLabel('moradia')).toBe('Moradia');
    });

    test('caronas retorna Caronas', () => {
      expect(ranking.getModuleLabel('caronas')).toBe('Caronas');
    });

    test('modulo desconhecido retorna string vazia', () => {
      expect(ranking.getModuleLabel('desconhecido')).toBe('');
    });

    test('null retorna string vazia', () => {
      expect(ranking.getModuleLabel(null)).toBe('');
    });
  });

  describe('getUserRanks', () => {
    test('retorna array vazio quando nao ha cache', () => {
      const result = ranking.getUserRanks('user-inexistente');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });
});

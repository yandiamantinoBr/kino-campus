beforeAll(() => {
  global.window = global.window || global;
  // KCRanking precisa de KCAPI mockado
  window.KCAPI = { getTopContributors: jest.fn().mockResolvedValue([]) };
  require('../../assets/js/features/kc-ranking.js');
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

  describe('renderização segura de perfis', () => {
    test.each([
      ['sidebar', 'renderSidebarRanking'],
      ['home', 'renderHomeRanking']
    ])('%s neutraliza HTML, atributos e URLs controlados pelo perfil', (_label, rendererName) => {
      document.body.innerHTML = '<div id="ranking"></div>';
      const container = document.getElementById('ranking');
      const maliciousName = '<img src=x onerror="window.__kcRankingXss=1">';

      ranking[rendererName](container, [{
        user_id: 'user" onclick="window.__kcRankingXss=2',
        display_name: maliciousName,
        avatar_url: 'javascript:window.__kcRankingXss=3',
        score: '<svg onload="window.__kcRankingXss=4">'
      }], 'moradia');

      expect(container.querySelector('script, [onerror], [onload], [onclick]')).toBeNull();
      expect(container.querySelector('img')).toBeNull();
      expect(container.textContent).toContain(maliciousName);
      expect(container.textContent).toContain('0 pts');
      expect(container.querySelector('a').getAttribute('href')).toContain(
        'user%22%20onclick%3D%22window.__kcRankingXss%3D2'
      );
      expect(window.__kcRankingXss).toBeUndefined();
    });
  });

  describe('modal informativo acessível', () => {
    test('usa semântica de diálogo, fecha com Escape e devolve o foco', () => {
      jest.useFakeTimers();
      document.body.innerHTML = '<button id="ranking-trigger">Abrir</button>';
      const trigger = document.getElementById('ranking-trigger');
      trigger.focus();

      ranking.openInfoModal(trigger);
      jest.runOnlyPendingTimers();

      const modal = document.getElementById('kcRankingInfoModal');
      expect(modal.getAttribute('role')).toBe('dialog');
      expect(modal.getAttribute('aria-modal')).toBe('true');
      expect(modal.getAttribute('aria-labelledby')).toBe('kcRankingInfoTitle');
      expect(modal.getAttribute('aria-hidden')).toBe('false');

      modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(modal.getAttribute('aria-hidden')).toBe('true');
      expect(document.activeElement).toBe(trigger);
      jest.useRealTimers();
    });
  });
});

/**
 * @jest-environment jsdom
 */

const FEATURE_PATH = '../../assets/js/features/kc-feed-tabs-personalized.js';
const HomeCategories = require('../../assets/js/shared/home-categories.shared.js');

function setupTabsDom() {
  document.body.innerHTML = `
    <nav id="kc-home-feed-tabs" class="kc-feed-tabs">
      <button type="button" data-feed-tab="destaques">Destaques</button>
      <button type="button" data-feed-tab="recentes">Recentes</button>
      <button type="button" data-feed-tab="comentados">Comentados</button>
      <span class="kc-feed-tabs__divider"></span>
      <a href="eventos.html"><i class="fas fa-calendar"></i><span>Eventos</span></a>
      <a href="oportunidades.html"><i class="fas fa-briefcase"></i><span>Oportunidades</span></a>
    </nav>
  `;
}

async function loadFeature(rows) {
  jest.resetModules();
  jest.useFakeTimers();
  setupTabsDom();
  window.KCHomeCategoryUtils = HomeCategories;
  window.KCAPI = {
    getPersonalizedTabs: jest.fn().mockResolvedValue(rows),
  };
  window.kcInitScrollIndicators = jest.fn();
  window.sessionStorage.clear();

  require(FEATURE_PATH);
  jest.advanceTimersByTime(60);
  await Promise.resolve();
  await Promise.resolve();
}

function renderedLabels() {
  return Array.from(document.querySelectorAll('#kc-home-feed-tabs a span'))
    .map((node) => node.textContent.trim());
}

describe('kc-feed-tabs-personalized', () => {
  afterEach(() => {
    jest.useRealTimers();
    delete window.KCAPI;
    delete window.KCHomeCategoryUtils;
    delete window.kcInitScrollIndicators;
    document.body.innerHTML = '';
    window.sessionStorage.clear();
  });

  test('resolve categorias reais do RPC sem cair em Eventos/Oportunidades repetidos', async () => {
    await loadFeature([
      { out_module_key: 'oportunidades', out_category_key: 'estagios' },
      { out_module_key: 'oportunidades', out_category_key: 'pesquisa' },
      { out_module_key: 'eventos', out_category_key: 'workshops' },
      { out_module_key: 'oportunidades', out_category_key: 'empregos' },
      { out_module_key: 'eventos', out_category_key: 'culturais' },
      { out_module_key: 'oportunidades', out_category_key: 'bolsas' },
      { out_module_key: 'eventos', out_category_key: 'academicos' },
      { out_module_key: 'oportunidades', out_category_key: 'monitoria' },
    ]);

    const labels = renderedLabels();
    expect(labels).toEqual(expect.arrayContaining([
      'Estágios',
      'Pesquisa',
      'Workshops',
      'Empregos',
      'Culturais',
      'Bolsas',
      'Acadêmicos',
      'Monitoria e aulas',
    ]));
    expect(labels).not.toContain('Eventos');
    expect(labels).not.toContain('Oportunidades');
    expect(new Set(labels).size).toBe(labels.length);
  });

  test('deduplica fallback visual quando categorias desconhecidas caem no modulo', async () => {
    await loadFeature([
      { out_module_key: 'eventos', out_category_key: 'categoria-x' },
      { out_module_key: 'eventos', out_category_key: 'categoria-y' },
      { out_module_key: 'oportunidades', out_category_key: 'categoria-x' },
      { out_module_key: 'oportunidades', out_category_key: 'categoria-y' },
      { out_module_key: 'compra-venda', out_category_key: 'eletronicos' },
    ]);

    const labels = renderedLabels();
    expect(labels.filter((label) => label === 'Eventos')).toHaveLength(1);
    expect(labels.filter((label) => label === 'Oportunidades')).toHaveLength(1);
    expect(labels).toContain('Eletrônicos');
  });
});

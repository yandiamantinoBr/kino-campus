describe('KCFeedFilters', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-kc-filters');
    window.history.replaceState({}, '', '/eventos.html');
    delete window.KCFeedFilters;
    delete window.kcFilters;
    window.matchMedia = jest.fn().mockImplementation(() => ({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
    }));
  });

  test('readCoreState e writeCoreState sincronizam q e tab na URL', () => {
    window.history.replaceState({}, '', '/eventos.html?q=feira&tab=culturais');
    require('../../assets/js/features/kc-feed-filters.js');

    expect(window.KCFeedFilters.readCoreState()).toEqual({
      query: 'feira',
      category: 'culturais',
    });

    window.KCFeedFilters.writeCoreState({
      query: 'workshop',
      category: 'academicos',
    });

    const params = new URLSearchParams(window.location.search);
    expect(params.get('q')).toBe('workshop');
    expect(params.get('tab')).toBe('academicos');
  });

  test('readNumberParam e writeNumberParam tratam valores numéricos na URL', () => {
    window.history.replaceState({}, '', '/eventos.html?priceMin=12.5&priceMax=99');
    require('../../assets/js/features/kc-feed-filters.js');

    const params = window.KCFeedFilters.getSearchParams();
    expect(window.KCFeedFilters.readNumberParam(params, 'priceMin')).toBe(12.5);
    expect(window.KCFeedFilters.readNumberParam(params, 'priceMax')).toBe(99);

    window.KCFeedFilters.updateSearchParams((nextParams) => {
      window.KCFeedFilters.writeNumberParam(nextParams, 'priceMin', 45);
      window.KCFeedFilters.writeNumberParam(nextParams, 'priceMax', null);
    });

    const updated = new URLSearchParams(window.location.search);
    expect(updated.get('priceMin')).toBe('45');
    expect(updated.has('priceMax')).toBe(false);
  });

  test('readPresetParam e writePresetParam sincronizam datePreset com allowlist por modulo', () => {
    window.history.replaceState({}, '', '/eventos.html?datePreset=next7d');
    require('../../assets/js/features/kc-feed-filters.js');

    const utils = window.KCFeedFilters;
    const params = utils.getSearchParams();
    const allowed = utils.getAllowedDatePresets('eventos');

    expect(allowed).toEqual(['today', 'next7d', 'thisMonth', 'past']);
    expect(utils.readPresetParam(params, 'datePreset', allowed)).toBe('next7d');

    utils.updateSearchParams((nextParams) => {
      utils.writePresetParam(nextParams, 'datePreset', 'past', allowed);
    });
    expect(new URLSearchParams(window.location.search).get('datePreset')).toBe('past');

    utils.updateSearchParams((nextParams) => {
      utils.writePresetParam(nextParams, 'datePreset', 'invalid', allowed);
    });
    expect(new URLSearchParams(window.location.search).has('datePreset')).toBe(false);
  });

  test('normalizeDatePreset preserva o valor canonico thisMonth para eventos', () => {
    require('../../assets/js/features/kc-feed-filters.js');

    const utils = window.KCFeedFilters;

    expect(utils.normalizeDatePreset('eventos', 'thisMonth')).toBe('thisMonth');
    expect(utils.normalizeDatePreset('eventos', 'thismonth')).toBe('thisMonth');

    window.history.replaceState({}, '', '/eventos.html?datePreset=thismonth');
    const params = utils.getSearchParams();
    expect(utils.readPresetParam(params, 'datePreset', utils.getAllowedDatePresets('eventos'))).toBe('thisMonth');
  });

  test('matchesDatePreset respeita recencia generica e datas de eventos com fallback', () => {
    require('../../assets/js/features/kc-feed-filters.js');

    const utils = window.KCFeedFilters;
    const now = new Date('2026-04-06T12:00:00-03:00');

    expect(utils.matchesDatePreset({
      moduleKey: 'caronas',
      preset: 'last7d',
      createdAt: '2026-04-05T10:00:00-03:00',
      now,
    })).toBe(true);

    expect(utils.matchesDatePreset({
      moduleKey: 'caronas',
      preset: 'last7d',
      createdAt: '2026-03-28T10:00:00-03:00',
      now,
    })).toBe(false);

    expect(utils.matchesDatePreset({
      moduleKey: 'eventos',
      preset: 'next7d',
      post: {
        metadata: { data_evento: '2026-04-10' },
        created_at: '2026-04-01T10:00:00Z',
      },
      now,
    })).toBe(true);

    expect(utils.matchesDatePreset({
      moduleKey: 'eventos',
      preset: 'today',
      post: {
        metadata: {},
        created_at: '2026-04-06T08:00:00-03:00',
      },
      now,
    })).toBe(true);

    expect(utils.matchesDatePreset({
      moduleKey: 'eventos',
      preset: 'past',
      post: {
        metadata: { data: '2026-04-02' },
        created_at: '2026-04-01T10:00:00Z',
      },
      now,
    })).toBe(true);
  });

  test('bindDesktopAccordion cria toggle e recolhe a secao no desktop', () => {
    document.body.setAttribute('data-kc-filters', 'tab-search');
    document.body.innerHTML = `
      <aside class="kc-sidebar">
        <div class="kc-sidebar-section" data-kc-test-section="filtros">
          <h3>Filtros</h3>
          <p>Conteudo</p>
        </div>
      </aside>
    `;

    require('../../assets/js/features/kc-feed-filters.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const toggle = document.querySelector('[data-kc-sidebar-toggle="true"]');
    const body = document.querySelector('.kc-sidebar-section__body');
    expect(toggle).not.toBeNull();
    expect(body).not.toBeNull();
    expect(body.hidden).toBe(false);

    toggle.click();

    expect(document.querySelector('.kc-sidebar-section').classList.contains('is-collapsed')).toBe(true);
    expect(body.hidden).toBe(true);
  });
});

describe('kcFilters URL bootstrap', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div class="kc-feed-tabs">
        <a data-category="todas" href="#todas" class="active">Todas</a>
        <a data-category="culturais" href="#culturais">Culturais</a>
      </div>
      <input id="searchInput" />
      <input id="kcLocalSearchInput" />
      <div id="noResults"></div>
    `;
    document.body.setAttribute('data-kc-filters', 'tab-search');
    window.history.replaceState({}, '', '/eventos.html?q=feira&tab=culturais');
    delete window.KCFeedFilters;
    delete window.kcFilters;
    window.matchMedia = jest.fn().mockImplementation(() => ({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
    }));
  });

  test('init restaura query e categoria sem ocupar a busca global do header', () => {
    require('../../assets/js/features/kc-feed-filters.js');
    require('../../assets/js/features/kc-filters.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(window.kcFilters.getState().query).toBe('feira');
    expect(window.kcFilters.getState().category).toBe('culturais');
    expect(document.getElementById('searchInput').value).toBe('');
    expect(document.getElementById('kcLocalSearchInput').value).toBe('feira');
  });
});

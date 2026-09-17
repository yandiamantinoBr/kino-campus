const { test, expect } = require('@playwright/test');

const STRUCTURED_ASSETS = [
  'kc-search-registry.generated.js',
  'kc-search-fields.shared.js',
  'kc-search-query-parser.shared.js',
  'kc-search-shadow-pipeline.shared.js'
];

const opportunityFixtures = ({ remote = true, onsite = true } = {}) => [
  remote && {
    id: 'job-remote', titulo: 'Estágio em computação', descricao: 'Vaga remota para estudantes',
    modulo: 'oportunidades', categoria: 'estagios',
    metadata: { workModeLabel: 'Remoto', areaLabel: 'Tecnologia' }
  },
  onsite && {
    id: 'job-onsite', titulo: 'Estágio em computação', descricao: 'Vaga presencial para estudantes',
    modulo: 'oportunidades', categoria: 'estagios',
    metadata: { workModeLabel: 'Presencial', areaLabel: 'Tecnologia' }
  }
].filter(Boolean);

async function enablePilotWithPosts(page, posts) {
  await page.evaluate((fixturePosts) => {
    window.KC_ENV.flags['search.structuredRuntime'] = true;
    window.KC_ENV.flags['search.structuredPilot'] = true;
    window.KCAPI.registerAdapter('local', {
      searchPosts: async () => fixturePosts,
      getPosts: async () => fixturePosts,
      getFeedCursor: async () => ({ posts: fixturePosts, nextCursor: null, hasMore: false }),
      getPostById: async (id) => fixturePosts.find((post) => String(post.id) === String(id)) || null
    });
  }, posts);
}

async function isolateLocalDatabase(page) {
  await page.route('**/data/database.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ anuncios: [] })
  }));
}

test.describe('V76.42 - busca estruturada, combobox e concorrência', () => {
  test('defaults desligados não fazem requisições estruturadas nas duas superfícies', async ({ page }) => {
    // Registry may load for search personalization (affinity/preferences), but the
    // structured pilot parser/pipeline must stay lazy until their flags are enabled.
    const pilotOnlyAssets = [
      'kc-search-query-parser.shared.js',
      'kc-search-shadow-pipeline.shared.js'
    ];
    const requested = [];
    page.on('request', (request) => {
      if (pilotOnlyAssets.some((asset) => request.url().includes(asset))) requested.push(request.url());
    });
    await page.goto('/search-results.html?q=evento');
    await page.waitForLoadState('networkidle');
    await page.goto('/index.html');
    await page.locator('#searchInput').fill('evento');
    await page.waitForTimeout(350);
    expect(requested).toEqual([]);
  });

  test('flags de piloto carregam contratos locais e mantêm dropdown operacional', async ({ page }) => {
    const requested = [];
    const pageErrors = [];
    page.on('request', (request) => {
      if (STRUCTURED_ASSETS.some((asset) => request.url().includes(asset))) requested.push(request.url());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto('/index.html');
    await page.evaluate(() => {
      window.KC_ENV.flags['search.structuredRuntime'] = true;
      window.KC_ENV.flags['search.structuredPilot'] = true;
    });
    await page.locator('#searchInput').fill('estágio remoto computação');
    await page.waitForFunction(() => !!window.KCSearchShadowPipeline);
    expect(STRUCTURED_ASSETS.every((asset) => requested.some((url) => url.includes(asset)))).toBe(true);
    await expect(page.locator('#kcSearchDropdown')).toHaveClass(/active/);
    expect(pageErrors).toEqual([]);
  });

  test('resultados exibem critérios removíveis e facetas coerentes', async ({ page }) => {
    await isolateLocalDatabase(page);
    await page.goto('/search-results.html');
    await enablePilotWithPosts(page, opportunityFixtures());
    await page.locator('#searchInput').evaluate((input) => {
      input.value = 'estágio remoto computação';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const structured = page.locator('#searchResultsStructured');
    await expect(structured).toBeVisible();
    await expect(structured).toContainText('Módulo: Oportunidades');
    await expect(structured).toContainText('Modalidade: Remoto');
    await expect(page.locator('#searchResultsModuleFilter option[value="oportunidades"]'))
      .toHaveText('Oportunidades (1)');
    await expect(page.locator('#resultsCount')).toHaveText('1');

    await page.locator('[data-kc-structured-signal="filter:workMode"]').click();
    await expect(page.locator('[data-kc-structured-signal="filter:workMode"]')).toHaveCount(0);
    await expect(page.locator('#searchResultsModuleFilter option[value="oportunidades"]'))
      .toHaveText('Oportunidades (2)');
    await expect(page.locator('#resultsCount')).toHaveText('2');
    await expect(page.locator('#searchResultsStructuredRestore')).toBeVisible();
  });

  test('zero-results explica o bloqueio e permite ampliar sem alterar a consulta', async ({ page }) => {
    await isolateLocalDatabase(page);
    await page.goto('/search-results.html');
    await enablePilotWithPosts(page, opportunityFixtures({ remote: false }));
    await page.locator('#searchInput').fill('estágio remoto computação');

    await expect(page.locator('#noResults')).toBeVisible();
    await expect(page.locator('#noResultsMessage')).toContainText('nenhuma atende a todos os critérios entendidos');
    await expect(page.locator('#searchResultsRelaxStructured')).toBeVisible();
    await page.locator('#searchResultsRelaxStructured').click();

    await expect(page.locator('#noResults')).toBeHidden();
    await expect(page.locator('#resultsCount')).toHaveText('1');
    await expect(page.locator('#searchInput')).toHaveValue('estágio remoto computação');
    await expect(page.locator('#searchResultsStructuredRestore')).toBeVisible();
  });

  test('dropdown vazio resume critérios e encaminha para ajuste', async ({ page }) => {
    await isolateLocalDatabase(page);
    await page.goto('/index.html');
    await enablePilotWithPosts(page, opportunityFixtures({ remote: false }));
    await page.locator('#searchInput').fill('estágio remoto computação');

    const dropdown = page.locator('#kcSearchDropdown');
    await expect(dropdown).toHaveClass(/active/);
    await expect(dropdown).toContainText('Nenhum resultado com os critérios entendidos.');
    await expect(dropdown).toContainText('Modalidade: Remoto');
    await expect(dropdown.getByRole('option', { name: /Ajustar filtros na busca/ })).toBeVisible();
  });

  test('chips permanecem operáveis no mobile sem overflow horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await isolateLocalDatabase(page);
    await page.goto('/search-results.html');
    await enablePilotWithPosts(page, opportunityFixtures());
    await page.locator('#searchInput').evaluate((input) => {
      input.value = 'estágio remoto computação';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const chip = page.locator('[data-kc-structured-signal="filter:workMode"]');
    await expect(chip).toBeVisible();
    const metrics = await page.evaluate(() => ({
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      chipHeight: document.querySelector('[data-kc-structured-signal="filter:workMode"]')?.getBoundingClientRect().height || 0
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewport);
    expect(metrics.chipHeight).toBeGreaterThanOrEqual(36);
    await chip.click();
    await expect(chip).toHaveCount(0);
  });

  test('dropdown segue o padrão combobox e mantém foco durante navegação por teclado', async ({ page }) => {
    await isolateLocalDatabase(page);
    await page.goto('/index.html');
    await enablePilotWithPosts(page, opportunityFixtures());
    const input = page.locator('#searchInput');
    await input.fill('estágio computação');

    const dropdown = page.locator('#kcSearchDropdown');
    const options = dropdown.locator('[role="option"]');
    await expect(dropdown).toHaveClass(/active/);
    await expect(input).toHaveAttribute('role', 'combobox');
    await expect(input).toHaveAttribute('aria-autocomplete', 'list');
    await expect(input).toHaveAttribute('aria-controls', 'kcSearchDropdownList');
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#kcSearchDropdownList')).toHaveAttribute('role', 'listbox');
    await expect(options).toHaveCount(2);

    await input.press('ArrowDown');
    const firstId = await options.nth(0).getAttribute('id');
    await expect(input).toHaveAttribute('aria-activedescendant', firstId);
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
    await expect(input).toBeFocused();
    await input.press('End');
    const lastId = await options.nth(1).getAttribute('id');
    await expect(input).toHaveAttribute('aria-activedescendant', lastId);
    await input.press('Escape');
    await expect(input).toHaveAttribute('aria-expanded', 'false');
    await expect(input).not.toHaveAttribute('aria-activedescendant');
  });

  test('nova consulta aborta a anterior e métricas não armazenam o texto', async ({ page }) => {
    await isolateLocalDatabase(page);
    await page.goto('/index.html');
    await page.evaluate(() => {
      window.__kcSearchAbortCount = 0;
      window.KCAPI.registerAdapter('local', {
        searchPosts: (params) => new Promise((resolve, reject) => {
          const slow = params.q === 'evento';
          const timer = setTimeout(() => resolve([{
            id: slow ? 'old-result' : 'new-result',
            titulo: slow ? 'Evento antigo' : 'Eventos novos',
            descricao: slow ? 'Resposta lenta' : 'Resposta atual',
            modulo: 'eventos'
          }]), slow ? 600 : 20);
          if (params.signal) params.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            window.__kcSearchAbortCount += 1;
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        }),
        getPosts: async () => [],
        getFeedCursor: async () => ({ posts: [], nextCursor: null, hasMore: false }),
        getPostById: async () => null
      });
    });

    const input = page.locator('#searchInput');
    await input.fill('evento');
    await page.waitForTimeout(220);
    await input.fill('eventos');
    const dropdown = page.locator('#kcSearchDropdown');
    await expect(dropdown).toContainText('Eventos novos');
    await expect(dropdown).not.toContainText('Evento antigo');

    const state = await page.evaluate(() => ({
      aborts: window.__kcSearchAbortCount,
      metrics: window.kcSearch.getPerformanceSnapshot()
    }));
    expect(state.aborts).toBe(1);
    expect(state.metrics.dropdown.aborted).toBeGreaterThanOrEqual(1);
    expect(state.metrics.dropdown.completed).toBeGreaterThanOrEqual(1);
    expect(state.metrics.dropdown.p95Ms).toBeLessThan(1000);
    expect(JSON.stringify(state.metrics)).not.toContain('eventos');
  });

  test('página de resultados também cancela resposta obsoleta', async ({ page }) => {
    await isolateLocalDatabase(page);
    await page.goto('/search-results.html');
    await page.evaluate(() => {
      window.__kcResultsAbortCount = 0;
      window.KCAPI.registerAdapter('local', {
        searchPosts: (params) => new Promise((resolve, reject) => {
          const slow = params.q === 'evento';
          const timer = setTimeout(() => resolve([{
            id: slow ? 'old-page-result' : 'new-page-result',
            titulo: slow ? 'Evento antigo' : 'Eventos novos',
            descricao: slow ? 'Resposta lenta' : 'Resposta atual',
            modulo: 'eventos'
          }]), slow ? 600 : 20);
          if (params.signal) params.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            window.__kcResultsAbortCount += 1;
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        }),
        getPosts: async () => [],
        getFeedCursor: async () => ({ posts: [], nextCursor: null, hasMore: false }),
        getPostById: async () => null
      });
    });

    const input = page.locator('#searchInput');
    await input.fill('evento');
    await page.waitForTimeout(20);
    await input.fill('eventos');
    const list = page.locator('#searchResultsList');
    await expect(list).toContainText('Eventos novos');
    await expect(list).not.toContainText('Evento antigo');
    const state = await page.evaluate(() => ({
      aborts: window.__kcResultsAbortCount,
      metrics: window.kcSearch.getPerformanceSnapshot().results
    }));
    expect(state.aborts).toBe(1);
    expect(state.metrics.aborted).toBeGreaterThanOrEqual(1);
    expect(state.metrics.completed).toBeGreaterThanOrEqual(1);
    expect(state.metrics.p95Ms).toBeLessThan(1000);
  });

  test('modal mobile também opera o combobox sem fechar no primeiro Escape', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await isolateLocalDatabase(page);
    await page.goto('/index.html');
    await enablePilotWithPosts(page, opportunityFixtures());
    await page.locator('#kcSearchMobileBtn').click();
    const modal = page.locator('#kcSearchModalOverlay');
    const input = page.locator('#kcSearchModalInput');
    await expect(modal).toHaveClass(/active/);
    await input.fill('estágio computação');
    await expect(input).toHaveAttribute('role', 'combobox');
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    await input.press('ArrowDown');
    await expect(input).toHaveAttribute('aria-activedescendant', /kc-search-option-/);
    await expect(input).toBeFocused();
    await input.press('Escape');
    await expect(input).toHaveAttribute('aria-expanded', 'false');
    await expect(modal).toHaveClass(/active/);
    await input.press('Escape');
    await expect(modal).not.toHaveClass(/active/);
  });
});

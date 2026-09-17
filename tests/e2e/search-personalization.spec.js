const { test, expect } = require('@playwright/test');

const posts = [
  {
    id: 'housing-strong', titulo: 'República perto do campus', descricao: 'Moradia estudantil',
    modulo: 'moradia', categoria: 'republicas', relevanceScore: 1, timestamp: 'Há 1 min'
  },
  {
    id: 'event-near', titulo: 'Evento perto do campus', descricao: 'Encontro acadêmico',
    modulo: 'eventos', categoria: 'academicos', relevanceScore: 0.98,
    metadata: { categoryKey: 'academicos' }, timestamp: 'Há 2 min'
  }
];

async function prepare(page, path, options = {}) {
  const personalized = options.personalized !== false;
  const affinity = options.affinity === true;
  await page.addInitScript(({ personalizedMode, affinityMode, fixturePosts }) => {
    Object.defineProperty(navigator, 'webdriver', { configurable: true, get: () => false });
    try {
      localStorage.setItem('kc_search_preferences_v1', JSON.stringify({
        version: 1,
        mode: personalizedMode ? 'personalized' : 'standard',
        modules: personalizedMode ? ['eventos'] : [],
        features: personalizedMode ? { 'eventos:topico': ['academicos'] } : {},
        localAffinityConsent: personalizedMode && affinityMode,
        consent: {
          purpose: 'search-personalization-v1',
          granted: personalizedMode,
          source: 'settings',
          updatedAt: '2026-06-20T12:00:00.000Z'
        },
        updatedAt: '2026-06-20T12:00:00.000Z'
      }));
      if (!affinityMode) localStorage.removeItem('kc_search_affinity_v1');
    } catch (_) {}
    window.__KC_SEARCH_E2E_FIXTURES__ = fixturePosts;
  }, {
    personalizedMode: personalized,
    affinityMode: affinity,
    fixturePosts: posts
  });
  await page.route('**/data/database.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ anuncios: [] })
  }));
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const fixturePosts = window.__KC_SEARCH_E2E_FIXTURES__ || [];
    // Force local driver so fixture posts drive ranking (production KC_ENV uses supabase).
    if (window.KCAPI && window.KCAPI.ENV) {
      window.KCAPI.ENV.driver = 'local';
      window.KCAPI.ENV.DATA_DRIVER = 'local';
    }
    if (window.KC_ENV) {
      window.KC_ENV.driver = 'local';
      window.KC_ENV.DATA_DRIVER = 'local';
    }
    window.dispatchEvent(new CustomEvent('kc:search-preferences-change'));
    if (window.KCAPI && typeof window.KCAPI.registerAdapter === 'function') {
      window.KCAPI.registerAdapter('local', {
        name: 'local',
        searchPosts: async () => fixturePosts.map((post) => Object.assign({}, post)),
        getPosts: async () => fixturePosts.map((post) => Object.assign({}, post)),
        getFeedCursor: async () => ({
          posts: fixturePosts.map((post) => Object.assign({}, post)),
          nextCursor: null,
          hasMore: false
        }),
        getPostById: async (id) => {
          const found = fixturePosts.find((post) => String(post.id) === String(id));
          return found ? Object.assign({}, found) : null;
        }
      });
    }
  });
}

test.describe('V76.44/V76.46 - personalização local opt-in', () => {
  test('resultados próximos usam preferência explícita com explicação e teto', async ({ page }) => {
    await prepare(page, '/search-results.html');
    await page.locator('#searchInput').fill('campus');
    const cards = page.locator('#searchResultsList [data-kc-search-result-id]');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toHaveAttribute('data-kc-search-result-id', 'event-near');
    // Compact corner badge (not a footer bar under the card)
    await expect(cards.nth(0).locator('.kc-result-signal-badge')).toBeVisible();
    await expect(cards.nth(0).locator('.kc-result-signal-badge')).toContainText(/Acadêmicos|Eventos/i);
    await expect(cards.nth(0).locator('.kc-result-signal-badge')).not.toContainText(/escolhido/i);
    await expect(cards.nth(0).locator('.kc-search-personalization-reason')).toHaveCount(0);

    // Personalization lives inside the filters toolbar; details stay collapsed until click
    const summary = page.locator('#searchResultsPersonalizationSummary');
    const controls = page.locator('.kc-search-results-controls');
    await expect(controls.locator('#searchResultsPersonalization')).toBeVisible();
    await expect(page.locator('#searchResultsPersonalizationSlot')).toBeVisible();
    await expect(summary).toBeVisible();
    await expect(page.locator('#searchResultsPersonalizationPanel')).toBeHidden();
    // Filtros count must match cards actually rendered in the feed
    await expect(page.locator('#resultsCount')).toHaveText('2');
    await expect(page.locator('#searchResultsVisibleSummary')).toHaveText(/2 resultados/);
    await summary.click();
    await expect(page.locator('#searchResultsPersonalizationPanel')).toBeVisible();
    await expect(page.locator('#searchResultsPersonalization')).toContainText(/Eventos|Acadêmicos|escolhido/i);

    const state = await page.evaluate(() => {
      const cardsNow = [...document.querySelectorAll('[data-kc-search-result-id]')];
      return {
        ids: cardsNow.map((card) => card.dataset.kcSearchResultId),
        affinity: localStorage.getItem('kc_search_affinity_v1')
      };
    });
    expect(state.ids).toEqual(['event-near', 'housing-strong']);
    expect(state.affinity).toBeNull();

    const toggle = page.locator('#searchResultsPersonalizationToggle');
    await expect(toggle).toContainText(/Ordem padrão|padrão/i);
    await toggle.click();
    await expect(cards.nth(0)).toHaveAttribute('data-kc-search-result-id', 'housing-strong');
    await expect(page.locator('#searchResultsPersonalizationSummaryText')).toContainText(/padrão/i);
    await expect(cards.nth(0).locator('.kc-result-signal-badge')).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('kc_search_preferences_v1')).mode))
      .toBe('personalized');

    // Re-open panel if collapsed and restore personalization
    if (await page.locator('#searchResultsPersonalizationPanel').isHidden()) {
      await summary.click();
    }
    await toggle.click();
    await expect(cards.nth(0)).toHaveAttribute('data-kc-search-result-id', 'event-near');

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
      explanation: document.querySelector('#searchResultsPersonalization').getBoundingClientRect().width
    }));
    expect(mobile.content).toBeLessThanOrEqual(mobile.viewport + 1);
    expect(mobile.explanation).toBeLessThanOrEqual(mobile.viewport);
  });

  test('clique deliberado agrega afinidade canônica sem guardar consulta ou identidade', async ({ page }) => {
    await prepare(page, '/search-results.html', { affinity: true });
    await page.locator('#searchInput').fill('campus');
    await expect(page.locator('[data-kc-search-result-id="event-near"]')).toBeVisible();
    await page.locator('#searchResultsList').evaluate((list) => {
      list.addEventListener('click', (event) => event.preventDefault());
    });
    await page.locator('[data-kc-search-result-id="event-near"] a[href*="id="]').first().click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('kc_search_affinity_v1'))).not.toBeNull();

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('kc_search_affinity_v1')));
    expect(stored.features['module:eventos'].count).toBe(1);
    expect(stored.features['feature:eventos:topico:academicos'].count).toBe(1);
    expect(JSON.stringify(stored)).not.toMatch(/campus|event-near|Evento perto|query|user|email/i);
  });

  test('dropdown explica prioridade e modo padrão preserva ranking comum', async ({ page }) => {
    await prepare(page, '/index.html');
    await page.locator('#searchInput').fill('campus');
    const options = page.locator('#kcSearchDropdown [role="option"]');
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toContainText('Evento perto do campus');
    await expect(options.nth(0)).toContainText(/Acadêmicos|Eventos/i);
    await expect(options.nth(0)).not.toContainText(/escolhido/i);

    await page.evaluate(() => {
      localStorage.setItem('kc_search_preferences_v1', JSON.stringify({
        version: 1, mode: 'standard', modules: [], features: {}, localAffinityConsent: false,
        consent: { purpose: 'search-personalization-v1', granted: false, source: 'settings', updatedAt: null },
        updatedAt: null
      }));
      localStorage.removeItem('kc_search_affinity_v1');
      window.dispatchEvent(new CustomEvent('kc:search-preferences-change'));
    });
    await page.locator('#searchInput').fill('campu');
    await page.locator('#searchInput').fill('campus');
    await expect(options.nth(0)).toContainText('República perto do campus');
    await expect(page.locator('#kcSearchDropdown')).not.toContainText('Prioridade:');
  });
});

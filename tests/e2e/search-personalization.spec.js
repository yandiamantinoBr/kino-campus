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
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { configurable: true, get: () => false });
  });
  await page.route('**/data/database.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ anuncios: [] })
  }));
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ fixturePosts, personalized, affinity }) => {
    localStorage.setItem('kc_search_preferences_v1', JSON.stringify({
      version: 1,
      mode: personalized ? 'personalized' : 'standard',
      modules: personalized ? ['eventos'] : [],
      features: personalized ? { 'eventos:topico': ['academicos'] } : {},
      localAffinityConsent: personalized && affinity,
      consent: {
        purpose: 'search-personalization-v1',
        granted: personalized,
        source: 'settings',
        updatedAt: '2026-06-20T12:00:00.000Z'
      },
      updatedAt: '2026-06-20T12:00:00.000Z'
    }));
    window.dispatchEvent(new CustomEvent('kc:search-preferences-change'));
    window.KCAPI.registerAdapter('local', {
      searchPosts: async () => fixturePosts,
      getPosts: async () => fixturePosts,
      getFeedCursor: async () => ({ posts: fixturePosts, nextCursor: null, hasMore: false }),
      getPostById: async (id) => fixturePosts.find((post) => String(post.id) === String(id)) || null
    });
  }, { fixturePosts: posts, personalized: options.personalized !== false, affinity: options.affinity === true });
}

test.describe('V76.44 - personalização local opt-in', () => {
  test('resultados próximos usam preferência explícita com explicação e teto', async ({ page }) => {
    await prepare(page, '/search-results.html');
    await page.locator('#searchInput').fill('campus');
    const cards = page.locator('#searchResultsList [data-kc-search-result-id]');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toHaveAttribute('data-kc-search-result-id', 'event-near');
    await expect(page.locator('#searchResultsPersonalization')).toBeVisible();
    await expect(page.locator('#searchResultsPersonalization')).toContainText('Eventos escolhido por você');
    await expect(cards.nth(0).locator('.kc-search-personalization-reason')).toContainText('Priorizado');

    const state = await page.evaluate(() => {
      const cardsNow = [...document.querySelectorAll('[data-kc-search-result-id]')];
      return {
        ids: cardsNow.map((card) => card.dataset.kcSearchResultId),
        affinity: localStorage.getItem('kc_search_affinity_v1')
      };
    });
    expect(state.ids).toEqual(['event-near', 'housing-strong']);
    expect(state.affinity).toBeNull();

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
    await expect(options.nth(0)).toContainText('Prioridade: Eventos escolhido por você');

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

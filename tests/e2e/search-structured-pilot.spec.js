const { test, expect } = require('@playwright/test');

const STRUCTURED_ASSETS = [
  'kc-search-registry.generated.js',
  'kc-search-fields.shared.js',
  'kc-search-query-parser.shared.js',
  'kc-search-shadow-pipeline.shared.js'
];

test.describe('V76.39 - piloto estruturado da busca', () => {
  test('defaults desligados não fazem requisições estruturadas nas duas superfícies', async ({ page }) => {
    const requested = [];
    page.on('request', (request) => {
      if (STRUCTURED_ASSETS.some((asset) => request.url().includes(asset))) requested.push(request.url());
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
});

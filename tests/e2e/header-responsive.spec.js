const { test, expect } = require('@playwright/test');

async function seedAuthShell(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    sessionStorage.setItem('kc:9.0.0:shell:auth-shell', JSON.stringify({
      version: '9.0.0',
      timestamp: Date.now(),
      value: {
        user: { id: 'u1', email: 'yan@example.com' },
        profile: {
          id: 'u1',
          display_name: 'Yan Diamantino',
          full_name: 'Yan Diamantino',
          avatar_url: '',
          verified: true,
          is_admin: true,
        },
      },
    }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function headerMetrics(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        display: getComputedStyle(element).display,
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    };

    return {
      header: rect('.kc-header'),
      container: rect('.kc-header-container'),
      logo: rect('.kc-logo'),
      nav: rect('.kc-nav-links'),
      search: rect('.kc-search-bar'),
      mobileSearch: rect('.kc-search-mobile-btn'),
      actions: rect('.kc-user-actions'),
    };
  });
}

test.describe('Header responsivo', () => {
  for (const width of [1366, 1024, 900, 769]) {
    test(`mantem header desktop/tablet em uma linha em ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await seedAuthShell(page);
      await page.waitForTimeout(120);

      const metrics = await headerMetrics(page);
      expect(metrics.header.height).toBeLessThanOrEqual(76);
      expect(metrics.search.display).toBe('flex');
      expect(metrics.search.width).toBeGreaterThanOrEqual(width <= 1120 ? 220 : 260);
      expect(metrics.nav.y).toBeLessThanOrEqual(metrics.container.y + 8);
      expect(metrics.search.y).toBeLessThanOrEqual(metrics.container.y + 8);
      expect(metrics.actions.y).toBeLessThanOrEqual(metrics.container.y + 8);
    });
  }

  test('usa busca movel abaixo do breakpoint sem exibir a barra desktop', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await seedAuthShell(page);
    await page.waitForTimeout(120);

    const metrics = await headerMetrics(page);
    expect(metrics.header.height).toBeLessThanOrEqual(64);
    expect(metrics.search.display).toBe('none');
    expect(metrics.mobileSearch.display).toBe('flex');
  });
});

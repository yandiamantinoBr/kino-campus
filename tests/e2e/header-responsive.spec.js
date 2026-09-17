const { test, expect } = require('@playwright/test');

async function seedAuthShell(page, path = '/oportunidades.html') {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
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
      authButton: rect('.kc-user-actions .btn-login'),
      authText: (document.querySelector('.kc-user-actions .btn-login')?.textContent || '').trim(),
      navSpanWidths: Array.from(document.querySelectorAll('.kc-nav-links a span')).map((element) => {
        const box = element.getBoundingClientRect();
        return Math.round(box.width);
      }),
    };
  });
}

test.describe('Header responsivo', () => {
  test('mantem logo, navegacao, busca e usuario em uma linha no desktop largo', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await seedAuthShell(page);
    await page.waitForSelector('.kc-user-actions .btn-login.is-auth');

    const metrics = await headerMetrics(page);
    expect(metrics.header.height).toBeLessThanOrEqual(88);
    expect(metrics.nav.x - (metrics.logo.x + metrics.logo.width)).toBeLessThanOrEqual(18);
    expect(metrics.search.display).toBe('flex');
    expect(metrics.search.width).toBeGreaterThanOrEqual(280);
    expect(metrics.search.width).toBeLessThanOrEqual(430);
    expect(metrics.actions.display).toBe('flex');
    expect(metrics.authText).toContain('Yan Diamantino');
    expect(metrics.navSpanWidths.some((width) => width > 40)).toBe(true);
    expect(Math.abs(metrics.nav.y - metrics.logo.y)).toBeLessThanOrEqual(8);
    expect(Math.abs(metrics.search.y - metrics.logo.y)).toBeLessThanOrEqual(8);
    expect(Math.abs(metrics.actions.y - metrics.logo.y)).toBeLessThanOrEqual(8);
  });

  for (const width of [1366, 1024, 900, 769]) {
    test(`mantem header em uma linha com links textuais em ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await seedAuthShell(page);
      await page.waitForSelector('.kc-user-actions .btn-login.is-auth');

      const metrics = await headerMetrics(page);
      expect(metrics.header.height).toBeLessThanOrEqual(88);
      expect(metrics.nav.display).toBe('flex');
      expect(metrics.nav.x - (metrics.logo.x + metrics.logo.width)).toBeLessThanOrEqual(18);
      expect(metrics.search.display).toBe('flex');
      expect(metrics.search.width).toBeGreaterThanOrEqual(width <= 1120 ? 200 : 260);
      expect(metrics.search.width).toBeLessThanOrEqual(width <= 1120 ? 330 : 410);
      expect(metrics.actions.display).toBe('flex');
      expect(metrics.authText).toContain('Yan Diamantino');
      expect(metrics.navSpanWidths.some((spanWidth) => spanWidth > 40)).toBe(true);
      expect(Math.abs(metrics.nav.y - metrics.logo.y)).toBeLessThanOrEqual(8);
      expect(Math.abs(metrics.search.y - metrics.logo.y)).toBeLessThanOrEqual(8);
      expect(Math.abs(metrics.actions.y - metrics.logo.y)).toBeLessThanOrEqual(8);
    });
  }

  test('usa busca movel abaixo do breakpoint sem exibir a barra desktop', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await seedAuthShell(page);
    await page.waitForTimeout(120);

    const metrics = await headerMetrics(page);
    // The mobile header must remain compact and on a single shared axis.
    expect(metrics.header.height).toBeLessThanOrEqual(64);
    expect(Math.abs((metrics.actions.y + metrics.actions.height / 2) - (metrics.logo.y + metrics.logo.height / 2))).toBeLessThanOrEqual(2);
    await expect(page.locator('.kc-header .kc-logo-name')).toBeVisible();
    expect(metrics.search.display).toBe('none');
    expect(metrics.mobileSearch.display).toBe('flex');
  });
});

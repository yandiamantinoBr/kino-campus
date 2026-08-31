const { test, expect } = require('@playwright/test');

for (const width of [390, 1280]) {
  test(`consent paints before later deferred scripts and survives late auth boot at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const optionalRequests = [];
    page.on('request', (request) => {
      if (/googletagmanager\.com|google-analytics\.com|googlesyndication\.com|\/_vercel\/(?:insights|speed-insights)\//.test(request.url())) {
        optionalRequests.push(request.url());
      }
    });
    // Do not contact production APIs or collect analytics while exercising boot.
    await page.route('**/*', async (route) => {
      const host = new URL(route.request().url()).hostname;
      if (host === 'localhost' || host === '127.0.0.1') await route.continue();
      else await route.abort('blockedbyclient');
    });
    let releaseBoot;
    const laterScript = new Promise((resolve) => { releaseBoot = resolve; });
    await page.route('**/assets/js/boot/kc-speed-insights.js*', async (route) => {
      await laterScript;
      await route.continue();
    });

    try {
      await page.goto('/', { waitUntil: 'commit' });
      const banner = page.locator('#kcConsentBanner');
      await expect(banner).toBeVisible();
      await expect(banner.locator('button')).toHaveCount(3);
      expect(await page.evaluate(() => ({
        readyState: document.readyState,
        hasEnvironment: Boolean(window.KC_ENV),
        hasOverlayManager: Boolean(window.KCOverlayLock),
        footerBeforeNav: document.querySelector('#kcPlatformFooter').nextElementSibling === document.querySelector('.kc-mobile-nav'),
        analytics: window.KCConsent.hasConsent('analytics'),
        advertising: window.KCConsent.hasConsent('advertising'),
      }))).toEqual({
        readyState: 'interactive',
        hasEnvironment: false,
        hasOverlayManager: false,
        footerBeforeNav: true,
        analytics: false,
        advertising: false,
      });
      await banner.locator('[data-consent-config]').click();
      await expect(page.locator('#kcConsentModal')).toBeVisible();
      await expect(page.locator('body')).toHaveClass(/kc-modal-open/);
      await expect(page.locator('main')).toHaveAttribute('inert', '');

      releaseBoot();
      await page.waitForLoadState('domcontentloaded');
      await expect.poll(() => page.evaluate(() => typeof window.KCOverlayLock?.lock)).toBe('function');
      await expect(page.locator('#kcAuthModal')).toBeAttached();
      await expect(page.locator('#kcAuthModal')).toHaveAttribute('inert', '');
      await page.locator('.kc-consent-modal__close').click();
      await expect(page.locator('#kcConsentModal')).toBeHidden();
      await expect(page.locator('body')).not.toHaveClass(/kc-modal-open|kc-scroll-locked/);
      await expect(page.locator('html')).not.toHaveClass(/kc-scroll-locked/);
      await expect(page.locator('#kcAuthModal')).not.toHaveAttribute('inert', '');
      await expect(page.locator('main')).not.toHaveAttribute('inert', '');
      const drawer = page.locator('#mobileMenuDrawer');
      await expect(drawer).toHaveAttribute('aria-hidden', 'true');
      await expect(drawer).toHaveAttribute('inert', '');

      // Rejecting optional processing still leaves authentication usable.
      await banner.locator('[data-consent-reject]').click();
      await expect(banner).toBeHidden();
      if (width < 768) {
        await page.locator('[data-kc-mobile-menu="toggle"]').click();
        await expect(drawer).toHaveAttribute('aria-hidden', 'false');
        await expect(drawer).not.toHaveAttribute('inert', '');
        await drawer.locator('[data-kc-mobile-menu="close"]').click();
        await expect(drawer).toHaveAttribute('aria-hidden', 'true');
        await expect(drawer).toHaveAttribute('inert', '');
      }
      await page.locator('.kc-user-actions [data-kc-login]').click();
      await expect(page.locator('#kcAuthModal')).toHaveClass(/active/);
      await expect(page.locator('#kcAuthModal')).toBeVisible();
      expect(optionalRequests).toEqual([]);
    } finally {
      releaseBoot();
    }
  });
}

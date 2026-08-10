const { test, expect } = require('@playwright/test');

const FEED_PAGES = [
  'index.html',
  'eventos.html',
  'oportunidades.html',
  'moradia.html',
  'compra-venda-feed.html',
  'caronas-feed.html',
  'achados-perdidos.html',
];

async function prepareReadOnlyPage(page) {
  await page.addInitScript(() => {
    localStorage.setItem('kc_consent_v1', JSON.stringify({
      version: '2026-06-05',
      necessary: true,
      preferences: false,
      analytics: false,
      advertising: false,
      updatedAt: '2026-08-10T00:00:00.000Z',
      source: 'e2e-read-only',
    }));
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      await route.continue();
      return;
    }
    await route.abort('blockedbyclient');
  });
}

test.describe('Seletor responsivo de módulos', () => {
  for (const pagePath of FEED_PAGES) {
    test(`${pagePath} mantém rail acima das ações no mobile`, async ({ page }) => {
      await prepareReadOnlyPage(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/${pagePath}`, { waitUntil: 'domcontentloaded' });

      const toolbar = page.locator('.kc-feed-toolbar').first();
      const rail = toolbar.locator(':scope > .kc-scroll-rail--tabs');
      const actions = toolbar.locator(':scope > .kc-feed-toolbar__actions');
      const picker = actions.locator('[data-kc-module-picker-open]');
      const hideClosed = actions.locator('[data-kc-hide-closed-toggle]');

      await expect(rail).toBeVisible();
      await expect(actions).toBeVisible();
      await expect(picker).toBeVisible();
      await expect(hideClosed).toBeVisible();

      const metrics = await toolbar.evaluate((element) => {
        const railRect = element.querySelector(':scope > .kc-scroll-rail--tabs').getBoundingClientRect();
        const actionsRect = element.querySelector(':scope > .kc-feed-toolbar__actions').getBoundingClientRect();
        const pickerRect = element.querySelector('[data-kc-module-picker-open]').getBoundingClientRect();
        const hideRect = element.querySelector('[data-kc-hide-closed-toggle]').getBoundingClientRect();
        const trackRect = element.querySelector('.kc-hide-closed-toggle__track').getBoundingClientRect();
        return {
          railBottom: railRect.bottom,
          actionsTop: actionsRect.top,
          pickerLeft: pickerRect.left,
          hideLeft: hideRect.left,
          pickerHeight: pickerRect.height,
          hideHeight: hideRect.height,
          trackWidth: trackRect.width,
          trackHeight: trackRect.height,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      });

      expect(metrics.actionsTop).toBeGreaterThanOrEqual(metrics.railBottom - 1);
      expect(metrics.pickerLeft).toBeLessThan(metrics.hideLeft);
      expect(metrics.pickerHeight).toBeGreaterThanOrEqual(44);
      expect(metrics.hideHeight).toBeGreaterThanOrEqual(44);
      expect(metrics.trackWidth).toBeCloseTo(40, 0);
      expect(metrics.trackHeight).toBeCloseTo(22, 0);
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    });
  }

  test('abre bottom sheet acessível, preserva closed=1 e restaura foco', async ({ page }) => {
    await prepareReadOnlyPage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/oportunidades.html?closed=1', { waitUntil: 'domcontentloaded' });

    const trigger = page.locator('[data-kc-module-picker-open]');
    await expect(page.locator('#kcConsentBanner')).toBeHidden();
    await trigger.focus();
    await trigger.click();

    const modal = page.locator('#kcModulePickerModal');
    const dialog = modal.locator('[role="dialog"]');
    const options = modal.locator('[data-kc-module-picker-option]');
    const backdrop = modal.locator('.kc-sidebar-context-modal__backdrop');

    await expect(modal).toHaveAttribute('aria-hidden', 'false');
    await expect(dialog).toBeVisible();
    await expect(options).toHaveCount(6);
    await expect(modal.locator('[aria-current="page"]')).toContainText('Oportunidades');
    await expect(backdrop).toHaveJSProperty('tagName', 'DIV');
    const closeButton = modal.locator('.kc-sidebar-context-modal__close');
    await expect(closeButton).toBeFocused();
    await expect(closeButton.locator('.kc-module-picker-close__glyph')).toHaveText('×');
    expect((await closeButton.locator('.kc-module-picker-close__glyph').boundingBox())?.width || 0).toBeGreaterThan(0);

    const destinations = await options.evaluateAll((links) => links.map((link) => ({
      href: link.getAttribute('href'),
      emoji: link.querySelector('.kc-module-picker-option__emoji')?.textContent || '',
    })));
    expect(destinations.every(({ href }) => new URL(href, page.url()).searchParams.get('closed') === '1')).toBe(true);
    expect(destinations.every(({ emoji }) => emoji.trim().length > 0)).toBe(true);

    const optionHeights = await options.evaluateAll((links) => links.map((link) => link.getBoundingClientRect().height));
    expect(Math.max(...optionHeights) - Math.min(...optionHeights)).toBeLessThanOrEqual(1);

    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => page.evaluate(() => {
      const dialogElement = document.querySelector('#kcModulePickerModal [role="dialog"]');
      return dialogElement?.contains(document.activeElement) || false;
    })).toBe(true);

    await page.keyboard.press('Escape');
    await expect(modal).toHaveAttribute('aria-hidden', 'true');
    await expect(trigger).toBeFocused();
  });

  test('nomes de módulos permanecem dentro dos cards em 320 px', async ({ page }) => {
    await prepareReadOnlyPage(page);
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/oportunidades.html', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-kc-module-picker-open]').click();

    const measurements = await page.locator('[data-kc-module-picker-option]').evaluateAll((links) => links.map((link) => {
      const label = link.querySelector('.kc-module-picker-option__label');
      const linkRect = link.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      return {
        labelScrollWidth: label.scrollWidth,
        labelClientWidth: label.clientWidth,
        labelRight: labelRect.right,
        linkRight: linkRect.right,
      };
    }));

    measurements.forEach((measurement) => {
      expect(measurement.labelScrollWidth).toBeLessThanOrEqual(measurement.labelClientWidth + 1);
      expect(measurement.labelRight).toBeLessThanOrEqual(measurement.linkRight + 1);
    });
  });

  test('respeita a fronteira mobile e não duplica a navegação no desktop', async ({ page }) => {
    await prepareReadOnlyPage(page);
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto('/eventos.html', { waitUntil: 'domcontentloaded' });
    const trigger = page.locator('[data-kc-module-picker-open]');
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.locator('#kcModulePickerModal')).toHaveAttribute('aria-hidden', 'false');

    await page.setViewportSize({ width: 769, height: 900 });
    await expect(trigger).toBeHidden();
    await expect(page.locator('#kcModulePickerModal')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.kc-nav-links a[href="eventos.html"]')).toBeFocused();
    await expect(page.locator('.kc-feed-toolbar__actions [data-kc-hide-closed-toggle]')).toBeVisible();

    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
  });
});

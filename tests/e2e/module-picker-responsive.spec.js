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

const TOOLBAR_VIEWPORTS = [
  { label: 'mobile 390', width: 390, height: 844 },
  { label: 'desktop 769', width: 769, height: 900 },
  { label: 'desktop 1024', width: 1024, height: 900 },
  { label: 'desktop 1280', width: 1280, height: 900 },
  { label: 'desktop 1920', width: 1920, height: 1080 },
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

async function blockExternalRequests(page) {
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
    for (const viewport of TOOLBAR_VIEWPORTS) {
      test(`${pagePath} mantém rail acima das ações em ${viewport.label} px`, async ({ page }) => {
        await prepareReadOnlyPage(page);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
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
          const toolbarRect = element.getBoundingClientRect();
          const railRect = element.querySelector(':scope > .kc-scroll-rail--tabs').getBoundingClientRect();
          const tabsRect = element.querySelector(':scope > .kc-scroll-rail--tabs > .kc-feed-tabs').getBoundingClientRect();
          const actionsRect = element.querySelector(':scope > .kc-feed-toolbar__actions').getBoundingClientRect();
          const pickerRect = element.querySelector('[data-kc-module-picker-open]').getBoundingClientRect();
          const hideRect = element.querySelector('[data-kc-hide-closed-toggle]').getBoundingClientRect();
          const trackRect = element.querySelector('.kc-hide-closed-toggle__track').getBoundingClientRect();
          const nextButton = element.querySelector('.kc-scroll-rail__btn--next');
          const nextRect = nextButton.getBoundingClientRect();
          const nextVisible = !nextButton.hidden && getComputedStyle(nextButton).display !== 'none';
          return {
            toolbarLeft: toolbarRect.left,
            toolbarRight: toolbarRect.right,
            railBottom: railRect.bottom,
            actionsTop: actionsRect.top,
            actionsLeft: actionsRect.left,
            actionsRight: actionsRect.right,
            pickerLeft: pickerRect.left,
            hideLeft: hideRect.left,
            pickerHeight: pickerRect.height,
            hideHeight: hideRect.height,
            trackWidth: trackRect.width,
            trackHeight: trackRect.height,
            scrollAreaRight: tabsRect.right,
            nextLeft: nextRect.left,
            nextVisible,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          };
        });

        expect(metrics.actionsTop).toBeGreaterThanOrEqual(metrics.railBottom - 1);
        expect(metrics.actionsLeft).toBeGreaterThanOrEqual(metrics.toolbarLeft - 1);
        expect(metrics.actionsRight).toBeLessThanOrEqual(metrics.toolbarRight + 1);
        expect(metrics.pickerLeft).toBeLessThan(metrics.hideLeft);
        expect(metrics.pickerHeight).toBeGreaterThanOrEqual(44);
        expect(metrics.hideHeight).toBeGreaterThanOrEqual(44);
        expect(metrics.trackWidth).toBeCloseTo(40, 0);
        expect(metrics.trackHeight).toBeCloseTo(22, 0);
        if (metrics.nextVisible) {
          expect(metrics.scrollAreaRight).toBeLessThanOrEqual(metrics.nextLeft + 1);
        }
        expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
      });
    }
  }

  test('em 769 px o controle do rail não recorta o chip Todas', async ({ page }) => {
    await prepareReadOnlyPage(page);
    await page.setViewportSize({ width: 769, height: 900 });
    await page.goto('/eventos.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.kc-feed-toolbar .kc-scroll-rail__btn--next')).toBeVisible();

    const geometry = await page.locator('.kc-feed-toolbar').first().evaluate((toolbar) => {
      const tabs = toolbar.querySelector('.kc-scroll-rail--tabs > .kc-feed-tabs');
      const allCategories = tabs.querySelector('[data-category="todas"]');
      const next = toolbar.querySelector('.kc-scroll-rail__btn--next');
      const tabsRect = tabs.getBoundingClientRect();
      const allRect = allCategories.getBoundingClientRect();
      const nextRect = next.getBoundingClientRect();
      return {
        allLabel: allCategories.textContent.trim(),
        allLeft: allRect.left,
        allRight: allRect.right,
        tabsLeft: tabsRect.left,
        tabsRight: tabsRect.right,
        nextLeft: nextRect.left,
        nextVisible: !next.hidden && getComputedStyle(next).display !== 'none',
        railMask: getComputedStyle(tabs).maskImage || getComputedStyle(tabs).webkitMaskImage,
      };
    });

    expect(geometry.nextVisible).toBe(true);
    expect(geometry.allLabel).toBe('Todas');
    expect(geometry.allLeft).toBeGreaterThanOrEqual(geometry.tabsLeft - 1);
    expect(geometry.allRight).toBeLessThanOrEqual(geometry.tabsRight - 1);
    expect(geometry.tabsRight).toBeLessThanOrEqual(geometry.nextLeft - 12);
    expect(geometry.railMask).toContain('linear-gradient');
  });

  test('renderiza ícone e chevron locais do seletor com recursos externos bloqueados', async ({ page }) => {
    await prepareReadOnlyPage(page);
    await page.setViewportSize({ width: 769, height: 900 });
    await page.goto('/eventos.html', { waitUntil: 'domcontentloaded' });

    const glyphs = await page.locator('[data-kc-module-picker-open]').evaluate((trigger) => {
      const icon = trigger.querySelector(':scope > i:first-child');
      const chevron = trigger.querySelector('.kc-module-picker-trigger__chevron');
      const iconBefore = getComputedStyle(icon, '::before');
      const chevronBefore = getComputedStyle(chevron, '::before');
      return {
        iconWidth: icon.getBoundingClientRect().width,
        iconHeight: icon.getBoundingClientRect().height,
        iconFill: iconBefore.backgroundColor,
        iconBoxShadow: iconBefore.boxShadow,
        chevronWidth: chevron.getBoundingClientRect().width,
        chevronHeight: chevron.getBoundingClientRect().height,
        chevronBorderRight: chevronBefore.borderRightWidth,
        chevronBorderBottom: chevronBefore.borderBottomWidth,
      };
    });

    expect(glyphs.iconWidth).toBeGreaterThanOrEqual(14);
    expect(glyphs.iconHeight).toBeGreaterThanOrEqual(14);
    expect(glyphs.iconFill).not.toBe('rgba(0, 0, 0, 0)');
    expect(glyphs.iconBoxShadow).not.toBe('none');
    expect(glyphs.chevronWidth).toBeGreaterThanOrEqual(8);
    expect(glyphs.chevronHeight).toBeGreaterThanOrEqual(8);
    expect(glyphs.chevronBorderRight).toBe('2px');
    expect(glyphs.chevronBorderBottom).toBe('2px');
  });

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

  test('permanece utilizável acima do consentimento pendente na primeira visita', async ({ page }) => {
    await blockExternalRequests(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/oportunidades.html', { waitUntil: 'domcontentloaded' });

    const consent = page.locator('#kcConsentBanner');
    const trigger = page.locator('[data-kc-module-picker-open]');
    await expect(consent).toBeVisible();
    await trigger.click();

    const modal = page.locator('#kcModulePickerModal');
    const closeButton = modal.locator('.kc-sidebar-context-modal__close');
    await expect(modal).toHaveAttribute('aria-hidden', 'false');
    await expect(closeButton).toBeFocused();
    await expect(modal.locator('[data-kc-module-picker-option]')).toHaveCount(6);
    const closeBox = await closeButton.boundingBox();
    expect(closeBox?.width || 0).toBeGreaterThanOrEqual(44);
    expect(closeBox?.height || 0).toBeGreaterThanOrEqual(44);

    const layers = await page.evaluate(() => {
      const picker = document.getElementById('kcModulePickerModal');
      const banner = document.getElementById('kcConsentBanner');
      const dialog = picker.querySelector('[role="dialog"]');
      const rect = dialog.getBoundingClientRect();
      const topElement = document.elementFromPoint(
        Math.round(rect.left + rect.width / 2),
        Math.round(rect.top + 24),
      );
      return {
        pickerZ: Number(getComputedStyle(picker).zIndex),
        bannerZ: Number(getComputedStyle(banner).zIndex),
        bannerInert: banner.closest('[inert]') !== null,
        topInsidePicker: picker.contains(topElement),
      };
    });
    expect(layers.pickerZ).toBeGreaterThan(layers.bannerZ);
    expect(layers.bannerInert).toBe(true);
    expect(layers.topInsidePicker).toBe(true);
    await page.keyboard.press('Escape');
    await expect(modal).toHaveAttribute('aria-hidden', 'true');
    await expect(consent).toBeVisible();
    expect(await consent.evaluate((element) => element.closest('[inert]') !== null)).toBe(false);

    await consent.locator('[data-consent-config]').click();
    const consentModal = page.locator('#kcConsentModal');
    const consentClose = consentModal.locator('.kc-consent-modal__close');
    await expect(consentModal).toHaveAttribute('aria-hidden', 'false');
    await expect(consentClose.locator('.kc-consent-modal__close-glyph')).toHaveText('×');
    const consentCloseBox = await consentClose.boundingBox();
    expect(consentCloseBox?.width || 0).toBeGreaterThanOrEqual(42);
    expect(consentCloseBox?.height || 0).toBeGreaterThanOrEqual(42);
    await expect(consentModal.locator('#kcConsentPreferences')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(consentClose).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(consentModal.locator('[data-consent-save]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(consentModal).toHaveAttribute('aria-hidden', 'true');
    await expect(consent).toBeVisible();
    await expect(consent.locator('[data-consent-config]')).toBeFocused();
    expect(await consent.evaluate((element) => element.closest('[inert]') !== null)).toBe(false);
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

  test('mantém seletor e modal funcionais ao atravessar 768/769 px', async ({ page }) => {
    await prepareReadOnlyPage(page);
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto('/eventos.html', { waitUntil: 'domcontentloaded' });
    const trigger = page.locator('[data-kc-module-picker-open]');
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.locator('#kcModulePickerModal')).toHaveAttribute('aria-hidden', 'false');

    await page.setViewportSize({ width: 769, height: 900 });
    await expect(trigger).toBeVisible();
    await expect(page.locator('#kcModulePickerModal')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#kcModulePickerModal [role="dialog"]')).toBeVisible();
    await expect(page.locator('#kcModulePickerModal .kc-sidebar-context-modal__close')).toBeFocused();
    await expect(page.locator('.kc-feed-toolbar__actions [data-kc-hide-closed-toggle]')).toBeVisible();

    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
  });
});

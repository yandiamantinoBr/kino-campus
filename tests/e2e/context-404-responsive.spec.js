const { test, expect } = require('@playwright/test');

const MODULE_PAGES = [
  ['achados-perdidos.html', 'achados-perdidos', 'Informações sobre Achados e Perdidos'],
  ['eventos.html', 'eventos', 'Informações sobre Eventos'],
  ['moradia.html', 'moradia', 'Informações sobre Moradia'],
  ['oportunidades.html', 'oportunidades', 'Informações sobre Oportunidades'],
  ['compra-venda-feed.html', 'compra-venda', 'Informações sobre Compra e Venda'],
  ['caronas-feed.html', 'caronas', 'Informações sobre Caronas'],
];

test.describe('V76.25 - Sobre o KinoCampus compacto no mobile', () => {
  test('index abre o contexto completo em modal a partir da faixa compacta', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/index.html');

    const section = page.locator('[data-kc-context-section="home"]');
    // The home context opener is now a single <button data-kc-context-open="home">
    // (was an <h3 role="button"> + a nested <button> arrow). The arrow
    // is rendered as a <span aria-hidden="true"> inside the button so
    // the keyboard/screen-reader experience stays one trigger.
    const triggers = section.locator('[data-kc-context-open="home"]');
    const trigger = triggers.first();
    const arrowIcon = section.locator('.kc-context-info-btn--context-arrow');
    await expect(section).toBeVisible();
    await expect(triggers).toHaveCount(1);
    await expect(trigger).toBeVisible();
    await expect(arrowIcon).toBeVisible();
    await expect(section.locator('.kc-sidebar-help')).toBeHidden();
    await expect(section.locator('details')).toBeHidden();

    const compactMetrics = await page.evaluate(() => {
      const context = document.querySelector('[data-kc-context-section="home"]');
      const button = context.querySelector('.kc-context-info-btn--context-arrow');
      return {
        sectionHeight: context.getBoundingClientRect().height,
        buttonHeight: button.getBoundingClientRect().height,
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      };
    });
    expect(compactMetrics.sectionHeight).toBeLessThanOrEqual(52);
    expect(compactMetrics.buttonHeight).toBeLessThanOrEqual(38);
    expect(compactMetrics.scroll).toBeLessThanOrEqual(compactMetrics.client + 1);

    await trigger.click();

    const modal = page.locator('#kcSidebarContextModal');
    await expect(modal).toHaveAttribute('aria-hidden', 'false');
    await expect(modal.locator('#kcSidebarContextTitle')).toContainText('Sobre o KinoCampus');
    await expect(modal.locator('.kc-sidebar-help')).toBeVisible();
    await expect(modal.locator('details')).toBeVisible();
    await expect(modal.locator('details')).not.toHaveAttribute('open', '');

    await page.keyboard.press('Escape');
    await expect(modal).toHaveAttribute('aria-hidden', 'true');
    await expect(trigger).toBeFocused();
  });
});

test.describe('V76.24 - contexto mobile compacto dos módulos', () => {
  for (const [pagePath, moduleKey, label] of MODULE_PAGES) {
    test(`${pagePath} abre o contexto compacto no mobile`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/${pagePath}`);

      const trigger = page.locator(`[data-kc-context-open="${moduleKey}"]`);
      await expect(trigger).toBeVisible();
      await expect(page.locator('aside.kc-sidebar--contextual')).toBeHidden();

      const compactMetrics = await page.evaluate((key) => {
        const heading = document.querySelector('.kc-module-heading');
        const button = document.querySelector(`[data-kc-context-open="${key}"]`);
        const headingStyle = getComputedStyle(heading);
        return {
          headingHeight: heading.getBoundingClientRect().height,
          headingMarginBottom: parseFloat(headingStyle.marginBottom),
          buttonHeight: button.getBoundingClientRect().height,
        };
      }, moduleKey);
      expect(compactMetrics.headingHeight).toBeLessThanOrEqual(52);
      expect(compactMetrics.headingMarginBottom).toBeLessThanOrEqual(10);
      expect(compactMetrics.buttonHeight).toBeLessThanOrEqual(38);

      await trigger.click();

      const modal = page.locator('#kcSidebarContextModal');
      await expect(modal).toHaveAttribute('aria-hidden', 'false');
      await expect(modal.locator('[role="dialog"]')).toBeVisible();
      await expect(modal.locator('[data-kc-context-modal-body]')).not.toBeEmpty();
      await expect(modal.locator('[data-kc-context-modal-body] h3')).toHaveCount(0);
      await expect(modal.locator('[data-kc-context-modal-body] [data-kc-sidebar-toggle]')).toHaveCount(0);
      await expect(modal.locator('details')).not.toHaveAttribute('open', '');

      const dialogHeight = await modal.locator('[role="dialog"]').evaluate((dialog) => dialog.getBoundingClientRect().height);
      expect(dialogHeight).toBeLessThanOrEqual(280);

      await page.keyboard.press('Escape');
      await expect(modal).toHaveAttribute('aria-hidden', 'true');
      await expect(trigger).toBeFocused();

      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
    });
  }
});

test.describe('V76.23 - página 404 responsiva', () => {
  test('desktop usa painel único e somente o rodapé institucional', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/404.html');

    await expect(page.locator('h1')).toHaveText('Esta página não está por aqui');
    await expect(page.locator('.kc-error-module')).toHaveCount(6);
    await expect(page.locator('.kc-platform-footer')).toHaveCount(1);
    await expect(page.locator('.kc-footer')).toHaveCount(0);

    const layout = await page.evaluate(() => {
      const panel = document.querySelector('.kc-error-panel').getBoundingClientRect();
      return {
        panelWidth: panel.width,
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      };
    });
    expect(layout.panelWidth).toBeLessThanOrEqual(1120);
    expect(layout.scroll).toBeLessThanOrEqual(layout.client + 1);
  });

  test('mobile empilha ações e destinos sem overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/404.html');

    await expect(page.locator('.kc-error-panel')).toBeVisible();
    await expect(page.locator('.kc-error-module')).toHaveCount(6);

    const layout = await page.evaluate(() => ({
      heroColumns: getComputedStyle(document.querySelector('.kc-error-hero')).gridTemplateColumns.split(' ').length,
      moduleColumns: getComputedStyle(document.querySelector('.kc-error-grid')).gridTemplateColumns.split(' ').length,
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(layout.heroColumns).toBe(1);
    expect(layout.moduleColumns).toBe(1);
    expect(layout.scroll).toBeLessThanOrEqual(layout.client + 1);
  });
});

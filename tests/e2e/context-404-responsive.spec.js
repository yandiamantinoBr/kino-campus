const { test, expect } = require('@playwright/test');

const MODULE_PAGES = [
  ['achados-perdidos.html', 'achados-perdidos', 'Informações sobre Achados e Perdidos'],
  ['eventos.html', 'eventos', 'Informações sobre Eventos'],
  ['moradia.html', 'moradia', 'Informações sobre Moradia'],
  ['oportunidades.html', 'oportunidades', 'Informações sobre Oportunidades'],
  ['compra-venda-feed.html', 'compra-venda', 'Informações sobre Compra e Venda'],
  ['caronas-feed.html', 'caronas', 'Informações sobre Caronas'],
];

test.describe('V76.23 - contexto responsivo dos módulos', () => {
  for (const [pagePath, moduleKey, label] of MODULE_PAGES) {
    test(`${pagePath} abre o contexto compacto no mobile`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/${pagePath}`);

      const trigger = page.locator(`[data-kc-context-open="${moduleKey}"]`);
      await expect(trigger).toBeVisible();
      await expect(page.locator('aside.kc-sidebar--contextual')).toBeHidden();
      await trigger.click();

      const modal = page.locator('#kcSidebarContextModal');
      await expect(modal).toHaveAttribute('aria-hidden', 'false');
      await expect(modal.locator('[role="dialog"]')).toBeVisible();
      await expect(modal.locator('[data-kc-context-modal-body]')).not.toBeEmpty();

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

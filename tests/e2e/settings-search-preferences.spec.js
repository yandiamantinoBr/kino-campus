const { test, expect } = require('@playwright/test');

test.describe('preferências locais de busca', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#settingsSearchPreferences')).toBeVisible();
    await expect(page.locator('[data-search-preference-module="eventos"]')).toBeAttached();
  });

  test('visitante escolhe, persiste, exporta e revoga sem analytics', async ({ page }) => {
    const mode = page.locator('#settingsSearchPersonalized');
    const eventModule = page.locator('[data-search-preference-module="eventos"]');
    const academicTopic = page.locator('[data-search-preference-feature="eventos:topico"][value="academicos"]');
    const affinity = page.locator('#settingsSearchAffinity');

    await expect(mode).not.toBeChecked();
    await expect(eventModule).toBeDisabled();
    await mode.check();
    await eventModule.check();
    await academicTopic.check();
    await affinity.check();
    await page.locator('#settingsSaveSearchPreferences').click();
    await expect(page.locator('#settingsSearchPreferencesStatus')).toContainText('somente neste navegador');

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('kc_search_preferences_v1')));
    expect(stored).toMatchObject({
      mode: 'personalized',
      modules: ['eventos'],
      features: { 'eventos:topico': ['academicos'] },
      localAffinityConsent: true,
      consent: { purpose: 'search-personalization-v1', granted: true }
    });
    expect(JSON.stringify(stored)).not.toContain('query');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#settingsExportSearchPreferences').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('kinocampus-preferencias-busca.json');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-search-preference-module="eventos"]')).toBeChecked();
    await expect(page.locator('[data-search-preference-feature="eventos:topico"][value="academicos"]')).toBeChecked();

    await page.evaluate(() => localStorage.setItem('kc_search_affinity_v1', '{"version":1}'));
    await page.locator('#settingsSearchPersonalized').uncheck();
    await page.locator('#settingsSaveSearchPreferences').click();
    const revoked = await page.evaluate(() => ({
      preferences: JSON.parse(localStorage.getItem('kc_search_preferences_v1')),
      affinity: localStorage.getItem('kc_search_affinity_v1')
    }));
    expect(revoked.preferences).toMatchObject({
      mode: 'standard', modules: [], features: {}, localAffinityConsent: false
    });
    expect(revoked.affinity).toBeNull();
  });

  test('layout mobile não cria rolagem horizontal e mantém ações acessíveis', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-search-preference-module="eventos"]')).toBeAttached();
    const metrics = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
      cardWidth: document.querySelector('#settingsSearchPreferences').getBoundingClientRect().width,
      saveWidth: document.querySelector('#settingsSaveSearchPreferences').getBoundingClientRect().width
    }));
    expect(metrics.content).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.cardWidth).toBeLessThanOrEqual(metrics.viewport);
    expect(metrics.saveWidth).toBeGreaterThan(250);
  });
});

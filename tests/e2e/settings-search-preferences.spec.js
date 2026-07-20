const { test, expect } = require('@playwright/test');

test.describe('preferências de busca', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#settingsSearchPreferences')).toBeVisible();
    await expect(page.locator('[data-search-preference-module="eventos"]')).toBeAttached({ timeout: 15000 });
    // Wait until controller finished hydrate (status not stuck on loading)
    await page.waitForFunction(() => {
      const hint = document.getElementById('settingsSearchPreferencesSyncHint');
      return hint && !/Carregando|Verificando/i.test(hint.textContent || '');
    }, null, { timeout: 15000 }).catch(() => {});
  });

  test('visitante escolhe, salva e revoga com emojis dos tópicos', async ({ page }) => {
    // Drive the form via DOM to avoid sticky-header intercepts and hidden inputs.
    await page.evaluate(() => {
      const mode = document.getElementById('settingsSearchPersonalized');
      mode.checked = true;
      mode.dispatchEvent(new Event('change', { bubbles: true }));
      const eventModule = document.querySelector('[data-search-preference-module="eventos"]');
      eventModule.checked = true;
      const academic = document.querySelector('[data-search-preference-feature="eventos:topico"][value="academicos"]');
      if (academic) academic.checked = true;
      const affinity = document.getElementById('settingsSearchAffinity');
      if (affinity) affinity.checked = true;
    });

    await expect(page.locator('#settingsSearchPersonalized')).toBeChecked();
    await expect(page.locator('[data-search-preference-module="eventos"]')).toBeChecked();
    await expect(page.locator('[data-search-preference-feature="eventos:topico"][value="academicos"]')).toBeChecked();

    // Emojis dos tópicos do create-modal devem aparecer nos chips
    await expect(page.locator('.kc-search-preference-option__emoji').first()).toBeVisible();
    await expect(page.locator('[data-search-preference-module-block="eventos"]')).toContainText('🎓');
    await expect(page.locator('[data-search-preference-module-block="eventos"]')).toContainText('Acadêmicos');

    await page.evaluate(() => {
      document.getElementById('settingsSaveSearchPreferences').click();
    });
    await expect(page.locator('#settingsSearchPreferencesStatus')).toContainText(/navegador|salvas|conta/i, { timeout: 10000 });

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('kc_search_preferences_v1')));
    expect(stored).toMatchObject({
      mode: 'personalized',
      modules: ['eventos'],
      features: { 'eventos:topico': ['academicos'] },
      localAffinityConsent: true,
      consent: { purpose: 'search-personalization-v1', granted: true }
    });
    expect(JSON.stringify(stored)).not.toContain('query');

    // Export JSON removido
    await expect(page.locator('#settingsExportSearchPreferences')).toHaveCount(0);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-search-preference-module="eventos"]')).toBeChecked({ timeout: 15000 });
    await expect(page.locator('[data-search-preference-feature="eventos:topico"][value="academicos"]')).toBeChecked();

    await page.evaluate(() => {
      localStorage.setItem('kc_search_affinity_v1', '{"version":1}');
      const mode = document.getElementById('settingsSearchPersonalized');
      mode.checked = false;
      mode.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('settingsSaveSearchPreferences').click();
    });
    await expect(page.locator('#settingsSearchPreferencesStatus')).toContainText(/padrão|desligada|removid|navegador|conta/i, { timeout: 10000 });

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
    await expect(page.locator('[data-search-preference-module="eventos"]')).toBeAttached({ timeout: 15000 });
    const metrics = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
      cardWidth: document.querySelector('#settingsSearchPreferences').getBoundingClientRect().width,
      saveWidth: document.querySelector('#settingsSaveSearchPreferences').getBoundingClientRect().width
    }));
    expect(metrics.content).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.cardWidth).toBeLessThanOrEqual(metrics.viewport);
    expect(metrics.saveWidth).toBeGreaterThan(200);
  });
});

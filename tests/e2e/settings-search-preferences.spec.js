const { test, expect } = require('@playwright/test');
const fs = require('fs');

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

    const downloadPromise = page.waitForEvent('download');
    await page.evaluate(() => {
      document.getElementById('settingsExportSearchPreferences').click();
    });
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^kinocampus-preferencias-busca-\d{4}-\d{2}-\d{2}\.json$/);
    const downloadPath = await download.path();
    const exported = JSON.parse(fs.readFileSync(downloadPath, 'utf8'));
    expect(exported).toMatchObject({
      dataKind: 'kinocampus-search-preferences',
      scope: 'local-browser-only',
      preferences: {
        mode: 'personalized',
        modules: ['eventos'],
        features: { 'eventos:topico': ['academicos'] }
      }
    });
    expect(exported.excludes).toContain('full-account-data');
    expect(JSON.stringify(exported)).not.toContain('"query"');
    await expect(page.locator('#settingsSearchPreferencesStatus')).toContainText(/não contém os demais dados/i);

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

  test('troca de conta não mistura preferências, afinidade, exportação ou limpeza', async ({ page }) => {
    const accountA = '11111111-1111-4111-8111-111111111111';
    const accountB = '22222222-2222-4222-8222-222222222222';
    await page.route('**/assets/js/api/kc-supabase.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.__activeSearchUser = {
            id: '${accountA}',
            email: 'account-a@example.invalid'
          };
          window.KCSupabase = {
            getUser: function () { return window.__activeSearchUser; },
            getCurrentUser: async function () { return window.__activeSearchUser; }
          };
        `
      });
    });
    await page.route('**/assets/js/api/kc-api.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.__remoteSearchPreferences = {};
          window.__delayAccountBSearchPreferences = false;
          window.__resolveAccountBSearchPreferences = null;
          window.KCAPI = {
            ENV: { driver: 'supabase', DATA_DRIVER: 'supabase', isProduction: false },
            registerAdapter: function () {},
            getCurrentUser: async function () { return window.__activeSearchUser; },
            getCurrentProfile: function () { return null; },
            getSearchPreferences: async function () {
              if (
                window.__activeSearchUser.id === '${accountB}' &&
                window.__delayAccountBSearchPreferences
              ) {
                return new Promise(function (resolve) {
                  window.__resolveAccountBSearchPreferences = resolve;
                });
              }
              return window.__remoteSearchPreferences[window.__activeSearchUser.id] || null;
            },
            updateSearchPreferences: async function (preferences) {
              var saved = Object.assign({}, preferences, {
                updatedAt: preferences.updatedAt || new Date().toISOString()
              });
              window.__remoteSearchPreferences[window.__activeSearchUser.id] = saved;
              return { ok: true, data: { preferences: saved }, error: null };
            },
            listDataSubjectRequests: async function () {
              return { ok: true, data: { items: [], total: 0 }, error: null };
            }
          };
        `
      });
    });
    await page.addInitScript(({ accountA: ownerA, accountB: ownerB }) => {
      const state = (module, updatedAt) => ({
        version: 1,
        mode: 'personalized',
        modules: [module],
        features: {},
        localAffinityConsent: true,
        consent: {
          purpose: 'search-personalization-v1',
          granted: true,
          source: 'account',
          updatedAt
        },
        updatedAt,
        sync: { scope: 'account', remoteUpdatedAt: updatedAt, lastSyncedAt: updatedAt }
      });
      localStorage.setItem('kc_search_preferences_v1', JSON.stringify(
        state('eventos', '2026-07-29T08:00:00.000Z')
      ));
      localStorage.setItem(`kc_search_preferences_v1:${ownerA}`, JSON.stringify({
        envelopeVersion: 1,
        ownerUserId: ownerA,
        preferences: state('moradia', '2026-07-29T09:00:00.000Z')
      }));
      localStorage.setItem(`kc_search_preferences_v1:${ownerB}`, JSON.stringify({
        envelopeVersion: 1,
        ownerUserId: ownerB,
        preferences: state('oportunidades', '2026-07-29T10:00:00.000Z')
      }));
      localStorage.setItem(`kc_search_affinity_v1:${ownerA}`, JSON.stringify({
        version: 1,
        purpose: 'search-personalization-v1',
        features: { 'module:moradia': { count: 2 } }
      }));
      localStorage.setItem(`kc_search_affinity_v1:${ownerB}`, JSON.stringify({
        version: 1,
        purpose: 'search-personalization-v1',
        features: { 'module:oportunidades': { count: 3 } }
      }));
    }, { accountA, accountB });

    await page.goto('/settings.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-search-preference-module="moradia"]')).toBeChecked();
    await expect(page.locator('[data-search-preference-module="eventos"]')).not.toBeChecked();

    await page.evaluate(({ id, email }) => {
      window.__delayAccountBSearchPreferences = true;
      window.__activeSearchUser = { id, email };
      document.dispatchEvent(new CustomEvent('kc:authchange', {
        detail: { user: window.__activeSearchUser, session: { user: window.__activeSearchUser } }
      }));
    }, { id: accountB, email: 'account-b@example.invalid' });
    await expect(page.locator('[data-search-preference-module="oportunidades"]')).toBeChecked();
    await expect(page.locator('[data-search-preference-module="moradia"]')).not.toBeChecked();
    await expect(page.locator('#settingsSearchPreferences')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#settingsSaveSearchPreferences')).toBeDisabled();

    await page.evaluate(() => {
      window.__delayAccountBSearchPreferences = false;
      window.__resolveAccountBSearchPreferences(null);
    });
    await expect(page.locator('#settingsSearchPreferences')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#settingsSaveSearchPreferences')).toBeEnabled();

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#settingsExportSearchPreferences').click();
    const exported = JSON.parse(fs.readFileSync(await (await downloadPromise).path(), 'utf8'));
    expect(exported.preferences.modules).toEqual(['oportunidades']);
    expect(JSON.stringify(exported)).not.toContain('moradia');

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#settingsClearSearchPreferences').click();
    await expect(page.locator('[data-search-preference-module="oportunidades"]')).not.toBeChecked();
    const afterClear = await page.evaluate(({ ownerA, ownerB }) => ({
      accountA: JSON.parse(localStorage.getItem(`kc_search_preferences_v1:${ownerA}`)),
      accountB: JSON.parse(localStorage.getItem(`kc_search_preferences_v1:${ownerB}`)),
      affinityA: localStorage.getItem(`kc_search_affinity_v1:${ownerA}`),
      affinityB: localStorage.getItem(`kc_search_affinity_v1:${ownerB}`),
      guest: JSON.parse(localStorage.getItem('kc_search_preferences_v1'))
    }), { ownerA: accountA, ownerB: accountB });
    expect(afterClear.accountA.preferences.modules).toEqual(['moradia']);
    expect(afterClear.accountB.preferences).toMatchObject({ mode: 'standard', modules: [] });
    expect(afterClear.affinityA).not.toBeNull();
    expect(afterClear.affinityB).toBeNull();
    expect(afterClear.guest.modules).toEqual(['eventos']);

    await page.evaluate(({ id, email }) => {
      window.__activeSearchUser = { id, email };
      document.dispatchEvent(new CustomEvent('kc:authchange', {
        detail: { user: window.__activeSearchUser, session: { user: window.__activeSearchUser } }
      }));
    }, { id: accountA, email: 'account-a@example.invalid' });
    await expect(page.locator('[data-search-preference-module="moradia"]')).toBeChecked();
  });

  test('layout mobile não cria rolagem horizontal e mantém ações acessíveis', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-search-preference-module="eventos"]')).toBeAttached({ timeout: 15000 });
    const metrics = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
      cardWidth: document.querySelector('#settingsSearchPreferences').getBoundingClientRect().width,
      saveWidth: document.querySelector('#settingsSaveSearchPreferences').getBoundingClientRect().width,
      exportWidth: document.querySelector('#settingsExportSearchPreferences').getBoundingClientRect().width
    }));
    expect(metrics.content).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.cardWidth).toBeLessThanOrEqual(metrics.viewport);
    expect(metrics.saveWidth).toBeGreaterThan(200);
    expect(metrics.exportWidth).toBeGreaterThan(200);
  });
});

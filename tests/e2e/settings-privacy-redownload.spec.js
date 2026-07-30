const { test, expect } = require('@playwright/test');

test.describe('novo download do complemento de privacidade', () => {
  test('sobrevive ao refresh e serializa tentativas concorrentes por protocolo', async ({ page }) => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const protocol = 'KC-DSR-20260729-ABCDEF0123456789';
    const artifactRef = 'KEA-0123456789ABCDEF0123456789ABCDEF';
    const expiresAt = '2099-07-29T12:00:00.000Z';

    await page.route('**/assets/js/api/kc-supabase.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.__privacyUser = {
            id: '${userId}',
            email: 'privacy-owner@example.invalid'
          };
          window.KCSupabase = {
            getUser: function () { return window.__privacyUser; },
            getCurrentUser: async function () { return window.__privacyUser; }
          };
        `,
      });
    });

    await page.route('**/assets/js/api/kc-api.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.__resolvePrivacyDownload = null;
          window.__privacyExport = {
            schema_version: 1,
            manifest: { completeness: 'complete' },
            data: {}
          };
          window.__privacyDownloadResult = function () {
            return {
              ok: true,
              data: {
                filename: 'kino-campus-dados-completos.json',
                export: window.__privacyExport
              },
              error: null
            };
          };
          window.KCAPI = {
            ENV: { driver: 'supabase', DATA_DRIVER: 'supabase', isProduction: false },
            registerAdapter: function () {},
            getCurrentUser: async function () { return window.__privacyUser; },
            getCurrentProfile: function () { return null; },
            getSearchPreferences: async function () { return null; },
            listDataSubjectRequests: async function () {
              return {
                ok: true,
                data: {
                  items: [{
                    protocol: '${protocol}',
                    request_kind: 'data_access_copy',
                    status: 'completed',
                    created_at: '2026-07-29T09:00:00.000Z',
                    expires_at: '${expiresAt}'
                  }],
                  total: 1,
                  has_more: false
                },
                error: null
              };
            },
            getDataSubjectRequest: async function () {
              return {
                ok: true,
                data: {
                  supplement: {
                    artifact_ref: '${artifactRef}',
                    status: 'delivered',
                    expires_at: '${expiresAt}',
                    version: 9
                  }
                },
                error: null
              };
            },
            downloadDataSubjectSupplement: async function () {
              var calls = Number(sessionStorage.getItem('privacyTestDownloadCalls') || '0') + 1;
              sessionStorage.setItem('privacyTestDownloadCalls', String(calls));
              if (calls === 1) {
                return new Promise(function (resolve) {
                  window.__resolvePrivacyDownload = resolve;
                });
              }
              return window.__privacyDownloadResult();
            }
          };
        `,
      });
    });

    await page.goto('/settings.html', { waitUntil: 'domcontentloaded' });
    const supplementButton = page.getByRole('button', {
      name: `Baixar complemento integral do protocolo ${protocol}`,
    });
    await expect(supplementButton).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#settingsDataSubjectRequests')).toContainText(
      'Complemento integral já preparado',
    );
    await page.evaluate(() => {
      localStorage.setItem('theme', 'dark');
      window.__privacyClearConfirmCalls = 0;
      window.confirm = function () {
        window.__privacyClearConfirmCalls += 1;
        return true;
      };
    });

    const firstDownload = page.waitForEvent('download');
    await page.evaluate(() => {
      const button = document.querySelector(
        '[aria-label^="Baixar complemento integral do protocolo"]',
      );
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await expect.poll(
      () => page.evaluate(() => sessionStorage.getItem('privacyTestDownloadCalls')),
    ).toBe('1');
    await expect(page.locator('#settingsClearBrowserPrivacyData')).toBeDisabled();
    await page.evaluate(() => {
      document.getElementById('settingsClearBrowserPrivacyData').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    await expect.poll(
      () => page.evaluate(() => window.__privacyClearConfirmCalls),
    ).toBe(0);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
    await expect(page.locator('#settingsPrivacyDataStatus')).toContainText(
      'Nenhuma chave da operação em andamento foi removida',
    );

    await page.evaluate(() => {
      window.__resolvePrivacyDownload(window.__privacyDownloadResult());
    });
    await firstDownload;
    await expect(page.locator('#settingsPrivacyDataStatus')).toContainText(
      'preparado e download iniciado',
    );
    await expect(page.locator('#settingsClearBrowserPrivacyData')).toBeEnabled();
    await expect(supplementButton).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    const reloadedButton = page.getByRole('button', {
      name: `Baixar complemento integral do protocolo ${protocol}`,
    });
    await expect(reloadedButton).toBeVisible({ timeout: 15000 });

    const secondDownload = page.waitForEvent('download');
    await reloadedButton.click();
    await secondDownload;
    await expect.poll(
      () => page.evaluate(() => sessionStorage.getItem('privacyTestDownloadCalls')),
    ).toBe('2');
  });

  test('preserva chave diante de lista terminal e só rotaciona após replay comprovado', async ({ page }) => {
    const userId = '22222222-2222-4222-8222-222222222222';
    const storageKey = `kc_privacy_action_keys_v1:${userId}`;

    await page.route('**/assets/js/api/kc-supabase.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.__privacyUser = {
            id: '${userId}',
            email: 'privacy-terminal@example.invalid'
          };
          window.KCSupabase = {
            getUser: function () { return window.__privacyUser; },
            getCurrentUser: async function () { return window.__privacyUser; }
          };
        `,
      });
    });

    await page.route('**/assets/js/api/kc-api.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.KCAPI = {
            ENV: { driver: 'supabase', DATA_DRIVER: 'supabase', isProduction: false },
            registerAdapter: function () {},
            getCurrentUser: async function () { return window.__privacyUser; },
            getCurrentProfile: function () { return null; },
            getSearchPreferences: async function () { return null; },
            listDataSubjectRequests: async function () {
              var createCalls = Number(
                sessionStorage.getItem('privacyTestCreateCalls') || '0'
              );
              var request = createCalls >= 2
                ? {
                    protocol: 'KC-DSR-20260729-2222222222222222',
                    request_kind: 'account_erasure',
                    status: 'received',
                    created_at: '2026-07-29T10:00:00.000Z'
                  }
                : {
                    protocol: 'KC-DSR-20260729-1111111111111111',
                    request_kind: 'account_erasure',
                    status: 'completed',
                    created_at: '2026-07-29T09:00:00.000Z'
                  };
              return {
                ok: true,
                data: {
                  items: [request],
                  total: 1,
                  has_more: false
                },
                error: null
              };
            },
            createDataSubjectRequest: async function (payload) {
              var calls = Number(
                sessionStorage.getItem('privacyTestCreateCalls') || '0'
              ) + 1;
              sessionStorage.setItem('privacyTestCreateCalls', String(calls));
              if (calls === 1) {
                return {
                  ok: true,
                  data: {
                    request: {
                      protocol: 'KC-DSR-20260729-1111111111111111',
                      request_kind: 'account_erasure',
                      status: 'completed'
                    },
                    reused_existing: true,
                    reuse_reason: 'idempotency_key',
                    echoed_key: payload.idempotency_key
                  },
                  error: null
                };
              }
              return {
                ok: true,
                data: {
                  request: {
                    protocol: 'KC-DSR-20260729-2222222222222222',
                    request_kind: 'account_erasure',
                    status: 'received'
                  },
                  reused_existing: false,
                  reuse_reason: null,
                  echoed_key: payload.idempotency_key
                },
                error: null
              };
            }
          };
        `,
      });
    });

    await page.addInitScript(({ key, ownerId }) => {
      if (sessionStorage.getItem('privacyTestReconcileInitialized') !== '1') {
        sessionStorage.setItem(key, JSON.stringify({
          version: 1,
          user_id: ownerId,
          keys: {
            account_erasure: 'settings-account_erasure-stale-from-other-tab',
          },
        }));
        sessionStorage.setItem('privacyTestReconcileInitialized', '1');
      }
    }, { key: storageKey, ownerId: userId });

    await page.goto('/settings.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#settingsDataSubjectRequests')).toContainText(
      'KC-DSR-20260729-1111111111111111',
      { timeout: 15000 },
    );
    await expect.poll(
      () => page.evaluate((key) => sessionStorage.getItem(key), storageKey),
    ).not.toBeNull();

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#settingsRequestAccountErasure').click();
    await expect(page.locator('#settingsPrivacyDataStatus')).toContainText(
      'KC-DSR-20260729-2222222222222222',
      { timeout: 15000 },
    );
    await expect.poll(
      () => page.evaluate(() => sessionStorage.getItem('privacyTestCreateCalls')),
    ).toBe('2');
    await expect.poll(
      () => page.evaluate((key) => sessionStorage.getItem(key), storageKey),
    ).toBeNull();
  });
});

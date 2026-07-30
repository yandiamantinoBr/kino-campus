const { test, expect } = require('@playwright/test');

const ACCOUNT_A = '11111111-aaaa-4111-8111-111111111111';
const ACCOUNT_B = '22222222-bbbb-4222-8222-222222222222';
const ACCOUNT_C = '33333333-cccc-4333-8333-333333333333';

function account(id, label) {
  return {
    id,
    email: `${label}@example.invalid`,
  };
}

async function mockSettingsSession(page, initialUser) {
  await page.route('**/assets/js/api/kc-supabase.client.js*', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript; charset=utf-8',
      body: `
        window.__settingsActiveUser = ${JSON.stringify(initialUser)};
        window.KCSupabase = {
          getUser: function () { return window.__settingsActiveUser; },
          getCurrentUser: async function () { return window.__settingsActiveUser; }
        };
      `,
    });
  });
}

test.describe('isolamento das operações da conta em configurações', () => {
  test('ignora erro tardio de outra geração e restaura o shell degradado da conta atual', async ({ page }) => {
    const accountA = account(ACCOUNT_A, 'refresh-a');
    const accountB = account(ACCOUNT_B, 'refresh-b');
    const accountC = account(ACCOUNT_C, 'refresh-c');
    await mockSettingsSession(page, accountA);

    await page.route('**/assets/js/api/kc-api.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.__profileMode = 'normal';
          window.__rejectAccountAProfile = null;
          window.__rejectAccountCProfile = null;
          window.KCAPI = {
            ENV: { driver: 'supabase', DATA_DRIVER: 'supabase', isProduction: false },
            registerAdapter: function () {},
            getCurrentUser: async function () { return window.__settingsActiveUser; },
            getCurrentProfile: function () { return null; },
            getSearchPreferences: async function () { return null; },
            getMyProfile: async function () {
              var current = window.__settingsActiveUser;
              if (window.__profileMode === 'hold-a' && current.id === '${ACCOUNT_A}') {
                window.__accountAProfilePending = true;
                return new Promise(function (_resolve, reject) {
                  window.__rejectAccountAProfile = reject;
                });
              }
              if (window.__profileMode === 'reject-c' && current.id === '${ACCOUNT_C}') {
                window.__accountCProfilePending = true;
                return new Promise(function (_resolve, reject) {
                  window.__rejectAccountCProfile = reject;
                });
              }
              return {
                id: current.id,
                email: current.email,
                display_name: 'Perfil ' + current.id,
                contact_primary_method: current.id === '${ACCOUNT_B}' ? 'instagram' : 'whatsapp',
                contact_cta_enabled: true,
                profile_public: current.id === '${ACCOUNT_B}'
              };
            },
            listDataSubjectRequests: async function () {
              return { ok: true, data: { items: [], total: 0, has_more: false }, error: null };
            }
          };
        `,
      });
    });

    await page.goto('/settings.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#settingsContent')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#settingsUserSummary')).toContainText(accountA.email);

    await page.evaluate(() => {
      window.__profileMode = 'hold-a';
      void window.KCSettingsRefresh();
    });
    await page.waitForFunction(() => window.__accountAProfilePending === true);

    await page.evaluate((nextUser) => {
      window.__profileMode = 'normal';
      window.__settingsActiveUser = nextUser;
      document.dispatchEvent(new CustomEvent('kc:authchange', {
        detail: { user: nextUser, session: { user: nextUser } },
      }));
    }, accountB);
    await expect(page.locator('#settingsContent')).toBeVisible();
    await expect(page.locator('#settingsUserSummary')).toContainText(accountB.email);
    await expect(page.locator('#settingsStatus')).toContainText('Configurações atualizadas');

    await page.evaluate(() => {
      window.__rejectAccountAProfile(new Error('late account A failure'));
    });
    await page.waitForTimeout(50);
    await expect(page.locator('#settingsContent')).toBeVisible();
    await expect(page.locator('#settingsUserSummary')).toContainText(accountB.email);
    await expect(page.locator('#settingsStatus')).toContainText('Configurações atualizadas');

    await page.evaluate((nextUser) => {
      window.__profileMode = 'reject-c';
      window.__settingsActiveUser = nextUser;
      document.dispatchEvent(new CustomEvent('kc:authchange', {
        detail: { user: nextUser, session: { user: nextUser } },
      }));
    }, accountC);
    await page.waitForFunction(() => window.__accountCProfilePending === true);
    await page.evaluate(() => {
      window.__rejectAccountCProfile(new Error('current account C failure'));
    });

    await expect(page.locator('#settingsContent')).toBeVisible();
    await expect(page.locator('#settingsGuest')).toBeHidden();
    await expect(page.locator('#settingsUserSummary')).toContainText(accountC.email);
    await expect(page.locator('#settingsStatus')).toContainText(
      'Os controles disponíveis permanecem visíveis',
    );
    await expect(page.locator('#settingsDataSubjectRequests')).toContainText(
      'Não foi possível consultar seus protocolos agora',
    );
  });

  test('não limpa a chave local enquanto a criação do protocolo está em andamento', async ({ page }) => {
    const currentAccount = account(ACCOUNT_A, 'privacy-create');
    const storageKey = `kc_privacy_action_keys_v1:${currentAccount.id}`;
    await mockSettingsSession(page, currentAccount);

    await page.route('**/assets/js/api/kc-api.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.__createdErasureRequest = null;
          window.__resolveErasureCreate = null;
          window.KCAPI = {
            ENV: { driver: 'supabase', DATA_DRIVER: 'supabase', isProduction: false },
            registerAdapter: function () {},
            getCurrentUser: async function () { return window.__settingsActiveUser; },
            getCurrentProfile: function () { return null; },
            getSearchPreferences: async function () { return null; },
            getMyProfile: async function () {
              return {
                id: window.__settingsActiveUser.id,
                email: window.__settingsActiveUser.email
              };
            },
            listDataSubjectRequests: async function () {
              return {
                ok: true,
                data: {
                  items: window.__createdErasureRequest ? [window.__createdErasureRequest] : [],
                  total: window.__createdErasureRequest ? 1 : 0,
                  has_more: false
                },
                error: null
              };
            },
            createDataSubjectRequest: async function (payload) {
              window.__erasureCreatePayload = payload;
              window.__erasureCreatePending = true;
              return new Promise(function (resolve) {
                window.__resolveErasureCreate = function (result) {
                  window.__createdErasureRequest = result.data.request;
                  resolve(result);
                };
              });
            }
          };
        `,
      });
    });

    await page.goto('/settings.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#settingsContent')).toBeVisible({ timeout: 15000 });
    await page.evaluate(() => {
      localStorage.setItem('theme', 'dark');
      window.__confirmCalls = 0;
      window.confirm = function () {
        window.__confirmCalls += 1;
        return true;
      };
    });

    await page.locator('#settingsRequestAccountErasure').click();
    await page.waitForFunction(() => window.__erasureCreatePending === true);
    await expect(page.locator('#settingsClearBrowserPrivacyData')).toBeDisabled();
    await expect.poll(
      () => page.evaluate((key) => sessionStorage.getItem(key), storageKey),
    ).not.toBeNull();

    await page.evaluate(() => {
      document.getElementById('settingsClearBrowserPrivacyData').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    await expect.poll(() => page.evaluate(() => window.__confirmCalls)).toBe(1);
    await expect.poll(
      () => page.evaluate((key) => sessionStorage.getItem(key), storageKey),
    ).not.toBeNull();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
    await expect(page.locator('#settingsPrivacyDataStatus')).toContainText(
      'Nenhuma chave da operação em andamento foi removida',
    );

    await page.evaluate(() => {
      window.__resolveErasureCreate({
        ok: true,
        data: {
          request: {
            protocol: 'KC-DSR-20260729-CREATE0000000001',
            request_kind: 'account_erasure',
            status: 'received',
            created_at: '2026-07-29T12:00:00.000Z'
          },
          reused_existing: false,
          reuse_reason: null
        },
        error: null
      });
    });
    await expect(page.locator('#settingsDataSubjectRequests')).toContainText(
      'KC-DSR-20260729-CREATE0000000001',
    );
    await expect(page.locator('#settingsClearBrowserPrivacyData')).toBeEnabled();
    await expect.poll(
      () => page.evaluate((key) => sessionStorage.getItem(key), storageKey),
    ).toBeNull();
  });

  test('serializa e-mails de segurança e descarta a resposta da conta anterior', async ({ page }) => {
    const accountA = account(ACCOUNT_A, 'security-a');
    const accountB = account(ACCOUNT_B, 'security-b');
    await mockSettingsSession(page, accountA);

    await page.route('**/assets/js/api/kc-api.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.__resendCalls = 0;
          window.__resetCalls = 0;
          window.__resolveResend = null;
          window.__resolveReset = null;
          window.KCAPI = {
            ENV: { driver: 'supabase', DATA_DRIVER: 'supabase', isProduction: false },
            registerAdapter: function () {},
            getCurrentUser: async function () { return window.__settingsActiveUser; },
            getCurrentProfile: function () { return null; },
            getSearchPreferences: async function () { return null; },
            getMyProfile: async function () {
              return {
                id: window.__settingsActiveUser.id,
                email: window.__settingsActiveUser.email
              };
            },
            listDataSubjectRequests: async function () {
              return { ok: true, data: { items: [], total: 0, has_more: false }, error: null };
            },
            resendConfirmation: async function (email) {
              window.__resendCalls += 1;
              window.__resendEmail = email;
              return new Promise(function (resolve) {
                window.__resolveResend = resolve;
              });
            },
            requestPasswordReset: async function (email) {
              window.__resetCalls += 1;
              window.__resetEmail = email;
              return new Promise(function (resolve) {
                window.__resolveReset = resolve;
              });
            }
          };
        `,
      });
    });

    await page.goto('/settings.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#settingsContent')).toBeVisible({ timeout: 15000 });
    await page.evaluate(() => {
      const button = document.getElementById('settingsResendConfirmation');
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => window.__resendCalls)).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__resendEmail)).toBe(accountA.email);
    await expect(page.locator('#settingsResendConfirmation')).toBeDisabled();

    await page.evaluate((nextUser) => {
      window.__settingsActiveUser = nextUser;
      document.dispatchEvent(new CustomEvent('kc:authchange', {
        detail: { user: nextUser, session: { user: nextUser } },
      }));
    }, accountB);
    await expect(page.locator('#settingsUserSummary')).toContainText(accountB.email);
    await expect(page.locator('#settingsStatus')).toContainText('Configurações atualizadas');
    await page.evaluate(() => {
      window.__resolveResend({ ok: true, data: true, error: null });
    });
    await page.waitForTimeout(50);
    await expect(page.locator('#settingsUserSummary')).toContainText(accountB.email);
    await expect(page.locator('#settingsStatus')).toContainText('Configurações atualizadas');
    await expect(page.locator('#settingsResendConfirmation')).toBeEnabled();

    await page.evaluate(() => {
      const button = document.getElementById('settingsRequestReset');
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => window.__resetCalls)).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__resetEmail)).toBe(accountB.email);
    await expect(page.locator('#settingsRequestReset')).toBeDisabled();
    await page.evaluate(() => {
      window.__resolveReset({ ok: true, data: true, error: null });
    });
    await expect(page.locator('#settingsStatus')).toContainText(
      'Link de nova senha enviado para o seu e-mail institucional',
    );
  });
});

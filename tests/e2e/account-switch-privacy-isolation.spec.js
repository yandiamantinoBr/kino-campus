const { test, expect } = require('@playwright/test');

const ACCOUNT_A = '11111111-aaaa-4111-8111-111111111111';
const ACCOUNT_B = '22222222-bbbb-4222-8222-222222222222';

function user(id, label) {
  return {
    id,
    email: `${label}@example.invalid`,
  };
}

test.describe('isolamento de privacidade na troca de conta', () => {
  test('descarta protocolos atrasados da conta anterior', async ({ page }) => {
    const accountA = user(ACCOUNT_A, 'account-a');
    const accountB = user(ACCOUNT_B, 'account-b');

    await page.route('**/assets/js/api/kc-supabase.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.__activePrivacyUser = ${JSON.stringify(accountA)};
          window.KCSupabase = {
            getUser: function () { return window.__activePrivacyUser; },
            getCurrentUser: async function () { return window.__activePrivacyUser; }
          };
        `,
      });
    });
    await page.route('**/assets/js/api/kc-api.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.__resolveAccountARequests = null;
          window.__accountARequestsStarted = false;
          window.KCAPI = {
            ENV: { driver: 'supabase', DATA_DRIVER: 'supabase', isProduction: false },
            registerAdapter: function () {},
            getCurrentUser: async function () { return window.__activePrivacyUser; },
            getCurrentProfile: function () { return null; },
            getMyProfile: async function () {
              var current = window.__activePrivacyUser;
              return {
                id: current.id,
                email: current.email,
                display_name: current.id === '${ACCOUNT_A}' ? 'Perfil A' : 'Perfil B',
                contact_primary_method: current.id === '${ACCOUNT_A}' ? 'whatsapp' : 'instagram',
                contact_cta_enabled: true,
                profile_public: current.id === '${ACCOUNT_B}'
              };
            },
            listDataSubjectRequests: async function () {
              var ownerId = window.__activePrivacyUser.id;
              if (ownerId === '${ACCOUNT_A}') {
                window.__accountARequestsStarted = true;
                return new Promise(function (resolve) {
                  window.__resolveAccountARequests = resolve;
                });
              }
              return {
                ok: true,
                data: {
                  items: [{
                    request_kind: 'data_portability',
                    status: 'processing',
                    protocol: 'KC-B-CURRENT',
                    created_at: '2026-07-29T12:00:00.000Z'
                  }],
                  total: 1
                },
                error: null
              };
            }
          };
        `,
      });
    });

    await page.goto('/settings.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__accountARequestsStarted === true);
    await page.evaluate(() => {
      const status = document.getElementById('settingsPrivacyDataStatus');
      status.textContent = 'Protocolo sensível da conta A';
      status.className = 'kc-settings-status is-visible is-success';
      const button = document.getElementById('settingsDownloadAccountData');
      button.dataset.defaultHtml = button.innerHTML;
      button.disabled = true;
      button.classList.add('is-loading');
      button.innerHTML = '<span>Operação da conta A</span>';
    });

    await page.evaluate((nextUser) => {
      window.__activePrivacyUser = nextUser;
      document.dispatchEvent(new CustomEvent('kc:authchange', {
        detail: { user: nextUser, session: { user: nextUser } },
      }));
    }, accountB);

    await expect(page.locator('#settingsContent')).toBeVisible();
    await expect(page.locator('#settingsUserSummary')).toContainText(accountB.email);
    await expect(page.locator('#settingsProfileLink')).toHaveAttribute(
      'href',
      `/profile.html?id=${encodeURIComponent(ACCOUNT_B)}`
    );
    await expect(page.locator('#settingsPrimaryMethod')).toHaveValue('instagram');
    await expect(page.locator('#settingsDataSubjectRequests')).toContainText('KC-B-CURRENT');
    await expect(page.locator('#settingsDataSubjectRequests')).not.toContainText('KC-A-STALE');
    await expect(page.locator('#settingsPrivacyDataStatus')).toHaveText('');
    await expect(page.locator('#settingsDownloadAccountData')).toBeEnabled();
    await expect(page.locator('#settingsDownloadAccountData')).toContainText('Baixar meus dados');
    await expect(page.getByRole('button', {
      name: /Cancelar Portabilidade do protocolo KC-B-CURRENT/i,
    })).toBeVisible();

    await page.evaluate(() => {
      window.__resolveAccountARequests({
        ok: true,
        data: {
          items: [{
            request_kind: 'data_access_copy',
            status: 'ready',
            protocol: 'KC-A-STALE',
            created_at: '2026-07-29T11:00:00.000Z'
          }],
          total: 1
        },
        error: null
      });
    });
    await page.waitForTimeout(50);

    await expect(page.locator('#settingsUserSummary')).toContainText(accountB.email);
    await expect(page.locator('#settingsPrimaryMethod')).toHaveValue('instagram');
    await expect(page.locator('#settingsDataSubjectRequests')).toContainText('KC-B-CURRENT');
    await expect(page.locator('#settingsDataSubjectRequests')).not.toContainText('KC-A-STALE');
  });

  test('descarta perfil atrasado da conta anterior', async ({ page }) => {
    const accountA = user(ACCOUNT_A, 'account-a');
    const accountB = user(ACCOUNT_B, 'account-b');

    await page.route('**/assets/js/api/kc-supabase.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.__activePrivacyUser = ${JSON.stringify(accountA)};
          window.KCSupabase = {
            getUser: function () { return window.__activePrivacyUser; },
            getCurrentUser: async function () { return window.__activePrivacyUser; }
          };
        `,
      });
    });
    await page.route('**/assets/js/api/kc-api.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.__resolveAccountAProfile = null;
          window.__accountAProfileStarted = false;
          window.KCAPI = {
            ENV: { driver: 'supabase', DATA_DRIVER: 'supabase', isProduction: false },
            registerAdapter: function () {},
            getCurrentUser: async function () { return window.__activePrivacyUser; },
            getCurrentProfile: function () { return null; },
            getMyProfile: async function () {
              var ownerId = window.__activePrivacyUser.id;
              if (ownerId === '${ACCOUNT_A}') {
                window.__accountAProfileStarted = true;
                return new Promise(function (resolve) {
                  window.__resolveAccountAProfile = resolve;
                });
              }
              return {
                id: '${ACCOUNT_B}',
                email: 'account-b@example.invalid',
                display_name: 'Perfil B',
                contact_primary_method: 'instagram',
                contact_cta_enabled: true,
                profile_public: true
              };
            },
            listDataSubjectRequests: async function () {
              return { ok: true, data: { items: [], total: 0 }, error: null };
            }
          };
        `,
      });
    });

    await page.goto('/settings.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__accountAProfileStarted === true);

    await page.evaluate((nextUser) => {
      window.__activePrivacyUser = nextUser;
      document.dispatchEvent(new CustomEvent('kc:authchange', {
        detail: { user: nextUser, session: { user: nextUser } },
      }));
    }, accountB);

    await expect(page.locator('#settingsContent')).toBeVisible();
    await expect(page.locator('#settingsPrimaryMethod')).toHaveValue('instagram');
    await expect(page.locator('#settingsProfilePublic')).toBeChecked();

    await page.evaluate((accountAId) => {
      window.__resolveAccountAProfile({
        id: accountAId,
        email: 'account-a@example.invalid',
        display_name: 'Perfil A',
        contact_primary_method: 'whatsapp',
        contact_cta_enabled: false,
        profile_public: false
      });
    }, ACCOUNT_A);
    await page.waitForTimeout(50);

    await expect(page.locator('#settingsUserSummary')).toContainText(accountB.email);
    await expect(page.locator('#settingsPrimaryMethod')).toHaveValue('instagram');
    await expect(page.locator('#settingsProfilePublic')).toBeChecked();
  });

  test('limpa protocolo e rascunho ao trocar de conta e reaplica apenas o contexto atual', async ({ page }) => {
    const accountA = user(ACCOUNT_A, 'account-a');
    const accountB = user(ACCOUNT_B, 'account-b');

    await page.route('**/assets/js/api/kc-supabase.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.__activePrivacyUser = ${JSON.stringify(accountA)};
          window.KCSupabase = {
            getUser: function () { return window.__activePrivacyUser; },
            getCurrentUser: async function () { return window.__activePrivacyUser; }
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
            getCurrentProfile: function () { return null; },
            getMyProfile: async function () {
              return {
                id: window.__activePrivacyUser.id,
                email: window.__activePrivacyUser.email
              };
            }
          };
        `,
      });
    });

    await page.goto('/ajuda.html?request=data_access_copy#helpRequestForm', {
      waitUntil: 'domcontentloaded',
    });
    const contactEmail = page.locator('#helpContactEmail');
    const accountEmail = page.locator('[data-help-conditional="account_email"]');
    await expect(contactEmail).toHaveValue(accountA.email);
    await expect(accountEmail).toHaveValue(accountA.email);
    await page.locator('#helpSubject').fill('Rascunho privado da conta A');
    await page.locator('#helpMessage').fill('Conteúdo privado da conta A');
    await page.evaluate(() => {
      const protocol = document.getElementById('helpProtocol');
      const value = document.getElementById('helpProtocolValue');
      value.textContent = 'KC-A-PRIVATE';
      protocol.hidden = false;
      protocol.style.display = '';
    });

    await page.evaluate((nextUser) => {
      window.__activePrivacyUser = nextUser;
      document.dispatchEvent(new CustomEvent('kc:authchange', {
        detail: { user: nextUser, session: { user: nextUser } },
      }));
    }, accountB);
    await expect(contactEmail).toHaveValue(accountB.email);
    await expect(accountEmail).toHaveValue(accountB.email);
    await expect(page.locator('#helpProtocol')).toBeHidden();
    await expect(page.locator('#helpProtocolValue')).toHaveText('');
    await expect(page.locator('#helpSubject')).toHaveValue('Solicitação de cópia dos meus dados');
    await expect(page.locator('#helpMessage')).toHaveValue('');

    await contactEmail.fill('manual-contact@example.invalid');
    await page.locator('#helpMessage').fill('Conteúdo privado da conta B');
    await page.evaluate((nextUser) => {
      window.__activePrivacyUser = nextUser;
      document.dispatchEvent(new CustomEvent('kc:authchange', {
        detail: { user: nextUser, session: { user: nextUser } },
      }));
    }, accountA);

    await expect(contactEmail).toHaveValue(accountA.email);
    await expect(accountEmail).toHaveValue(accountA.email);
    await expect(page.locator('#helpMessage')).toHaveValue('');
    await expect(page.locator('#helpProtocol')).toBeHidden();
  });
});

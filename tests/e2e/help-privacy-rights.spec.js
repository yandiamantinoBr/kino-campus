const { test, expect } = require('@playwright/test');
const crypto = require('crypto');
const fs = require('fs');

const cases = [
  {
    request: 'data_access_copy',
    subtopic: 'account_data_copy',
    requestKind: 'data_access_copy',
    requiredFields: ['account_email', 'data_scope', 'data_copy_format']
  },
  {
    request: 'data_portability',
    subtopic: 'account_data_portability',
    requestKind: 'data_portability',
    requiredFields: ['account_email', 'data_scope']
  },
  {
    request: 'account_erasure',
    subtopic: 'account_deletion',
    requestKind: 'account_erasure',
    requiredFields: ['account_email', 'export_before_erasure']
  }
];

test.describe('direitos de privacidade na Central de Ajuda', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: 'window.supabase = window.supabase || {};'
    }));
  });

  for (const item of cases) {
    test(`deep link ${item.request} usa somente valores canônicos`, async ({ page }) => {
      await page.goto(`/ajuda.html?request=${item.request}#helpRequestForm`, { waitUntil: 'domcontentloaded' });

      await expect(page.locator('#helpType')).toHaveValue('account_access');
      await expect(page.locator('#helpTopic')).toHaveValue('onboarding_settings');
      await expect(page.locator('#helpSubtopic')).toHaveValue(item.subtopic);
      await expect(page.locator('#helpPriority')).toHaveValue('normal');
      await expect(page.locator('#helpRequestPresetNotice')).toBeVisible();

      for (const field of item.requiredFields) {
        const locator = page.locator(`[data-help-conditional="${field}"]`);
        await expect(locator).toBeVisible();
        await expect(locator).toHaveAttribute('required', '');
      }

      const kind = await page.evaluate(() => (
        window.KCHelpUtils.getPrivacyRequestKind(
          document.getElementById('helpType').value,
          document.getElementById('helpTopic').value,
          document.getElementById('helpSubtopic').value
        )
      ));
      expect(kind).toBe(item.requestKind);
      await expect(page.locator('[data-help-conditional="page_path"]')).toHaveCount(0);
      await expect(page.locator('[data-help-conditional="error_message"]')).toHaveCount(0);
    });
  }

  test('ignora parâmetros não permitidos e não reflete PII no formulário', async ({ page }) => {
    const pii = 'segredo+url@example.com';
    await page.goto(`/ajuda.html?request=not_allowed&email=${encodeURIComponent(pii)}`, {
      waitUntil: 'domcontentloaded'
    });

    await expect(page.locator('#helpType')).toHaveValue('');
    await expect(page.locator('#helpRequestPresetNotice')).toBeHidden();
    await expect(page.locator('body')).not.toContainText(pii);
    await expect(page.locator('#helpContactEmail')).toHaveValue('');
  });

  test('resposta confirmada mostra e preserva protocolo acessível', async ({ page }) => {
    await page.goto('/ajuda.html?request=data_access_copy#helpRequestForm', {
      waitUntil: 'domcontentloaded'
    });
    await page.evaluate(() => {
      if (window.KCAPI && window.KCAPI.ENV) {
        window.KCAPI.ENV.driver = 'local';
        window.KCAPI.ENV.DATA_DRIVER = 'local';
        window.KCAPI.ENV.isProduction = false;
        window.KCAPI.registerAdapter('local', {
          createHelpRequest: async (payload) => {
            window.__privacyRequestPayload = payload;
            return new Promise((resolve) => {
              window.__resolvePrivacyHelpRequest = () => resolve({
                ok: true,
                data: {
                  id: 'privacy-test-protocol-001',
                  protocol: 'KC-DSR-20260729-ABCDEF0123456789',
                  created_at: '2026-07-28T12:00:00.000Z'
                }
              });
            });
          }
        });
        document.dispatchEvent(new CustomEvent('kc:authchange', {
          detail: {
            user: {
              id: '11111111-1111-4111-8111-111111111111',
              email: 'titular@example.com',
              is_anonymous: false
            }
          }
        }));
      }
    });

    await expect(page.locator('#helpContactEmail')).toHaveValue('titular@example.com');
    await page.locator('[data-help-conditional="account_email"]').fill('titular@example.com');
    await page.locator('[data-help-conditional="data_scope"]').selectOption('all_account_data');
    await page.locator('[data-help-conditional="data_copy_format"]').selectOption('structured');
    await page.locator('#helpMessage').fill('Solicito uma cópia dos dados associados à minha conta.');
    await page.locator('#helpContactEmail').fill('titular@example.com');
    await page.locator('#helpSubmitButton').click();

    await expect(page.locator('#helpRequestForm')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#helpSubmitButton')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#helpSubmitButton')).toBeDisabled();
    await page.evaluate(() => window.__resolvePrivacyHelpRequest());
    await expect(page.locator('#helpProtocol')).toBeVisible();
    await expect(page.locator('#helpProtocolValue')).not.toHaveText('');
    await expect(page.locator('#helpProtocolLabel')).toHaveText('Protocolo do titular');
    await expect(page.locator('#helpProtocolGuidance')).toContainText(/Configurações/);
    await expect(page.locator('#helpStatus')).toContainText(/Protocolo do titular:/);
    await expect(page.locator('#helpRequestForm')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#helpSubmitButton')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#helpSubmitButton')).toBeEnabled();

    const stored = await page.evaluate(() => window.__privacyRequestPayload || null);
    expect(stored).toMatchObject({
      expected_auth_state: 'authenticated',
      expected_user_id: '11111111-1111-4111-8111-111111111111',
      type: 'account_access',
      topic: 'onboarding_settings',
      subtopic: 'account_data_copy',
      metadata: {
        request_kind: 'data_access_copy',
        account_email: 'titular@example.com',
        data_scope: 'all_account_data',
        data_copy_format: 'structured'
      }
    });
    expect(stored.metadata).not.toHaveProperty('user_agent');
  });

  test('visitante envia prova efêmera somente no transporte e o widget é resetado', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await page.addInitScript(() => {
      window.KC_ENV = {
        TURNSTILE_SITE_KEY: 'turnstile-public-test-site-key'
      };
    });
    await page.route('**/assets/js/api/kc-supabase.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.KCSupabase = {
            getUser: function () { return null; },
            getCurrentUser: async function () { return null; }
          };
        `
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
            getMyProfile: async function () { return null; },
            recoverPrivacyHelpRequest: async function () {
              return { ok: false, error: { idempotency: { safe_to_replace: false } } };
            },
            createHelpRequest: async function (payload) {
              window.__guestPrivacyPayload = JSON.parse(JSON.stringify(payload));
              return {
                ok: true,
                data: {
                  id: '66666666-6666-4666-8666-666666666666',
                  created_at: '2026-07-29T20:00:00.000Z'
                }
              };
            }
          };
        `
      });
    });
    await page.route(
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
      async (route) => {
        await route.fulfill({
          contentType: 'application/javascript; charset=utf-8',
          body: `
            window.__turnstileResetCount = 0;
            window.__turnstileRenderCount = 0;
            window.turnstile = {
              render: function (target, options) {
                window.__turnstileRenderCount += 1;
                window.__turnstileOptions = options;
                target.setAttribute('data-test-widget', 'ready');
                return 'help-privacy-widget';
              },
              reset: function () {
                window.__turnstileResetCount += 1;
              },
              remove: function () {}
            };
          `
        });
      }
    );

    await page.goto('/ajuda.html?request=account_erasure#helpRequestForm', {
      waitUntil: 'domcontentloaded'
    });
    await expect(page.locator('#helpPrivacyVerification')).toBeVisible();
    await expect(page.locator('#helpPrivacyTurnstileWidget')).toHaveAttribute(
      'data-test-widget',
      'ready'
    );
    await expect.poll(
      async () => page.evaluate(() => window.__turnstileOptions.size)
    ).toBe('compact');
    await page.locator('#helpSubtopic').dispatchEvent('change');
    await page.evaluate(() => {
      window.__turnstileOptions.callback('turnstile-one-time-proof');
    });
    await expect(page.locator('#helpPrivacyVerificationStatus')).toContainText(
      'Verificação concluída'
    );
    const verifiedRenderCount = await page.evaluate(() => window.__turnstileRenderCount);
    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('kc:authchange', {
        detail: { user: null }
      }));
    });
    await expect(page.locator('#helpStatus')).toContainText('Central de ajuda atualizada');
    await expect.poll(
      async () => page.evaluate(() => window.__turnstileRenderCount)
    ).toBe(verifiedRenderCount);
    await expect(page.locator('#helpPrivacyVerificationStatus')).toContainText(
      'Verificação concluída'
    );
    await page.locator('[data-help-conditional="account_email"]').fill('guest@example.com');
    await page.locator('[data-help-conditional="export_before_erasure"]').selectOption('no_copy_needed');
    await page.locator('#helpMessage').fill(
      'Solicito a exclusão da conta e dos dados associados após a verificação.'
    );
    await page.locator('#helpContactEmail').fill('guest@example.com');
    await page.locator('#helpSubmitButton').click();

    await expect.poll(async () => page.evaluate(() => ({
      payloadCreated: Boolean(window.__guestPrivacyPayload),
      status: document.getElementById('helpStatus')?.textContent || '',
      verification: document.getElementById('helpPrivacyVerificationStatus')?.textContent || '',
      buttonDisabled: document.getElementById('helpSubmitButton')?.disabled === true,
      buttonBusy: document.getElementById('helpSubmitButton')?.getAttribute('aria-busy') || ''
    }))).toMatchObject({ payloadCreated: true });
    await expect(page.locator('#helpProtocolValue')).toHaveText(
      '66666666-6666-4666-8666-666666666666'
    );
    await expect.poll(
      async () => page.evaluate(() => window.__turnstileResetCount)
    ).toBe(1);

    const transport = await page.evaluate(() => {
      const payload = window.__guestPrivacyPayload;
      const storageDump = [];
      for (const storage of [window.localStorage, window.sessionStorage]) {
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          storageDump.push(`${key}:${storage.getItem(key)}`);
        }
      }
      return {
        token: payload.turnstile_token,
        metadata: payload.metadata,
        storageDump,
        action: window.__turnstileOptions.action,
        scriptCount: document.querySelectorAll(
          'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]'
        ).length
      };
    });
    expect(transport.token).toBe('turnstile-one-time-proof');
    expect(transport.action).toBe('help_privacy_guest');
    expect(transport.metadata).not.toHaveProperty('turnstile_token');
    expect(transport.storageDump.join('\n')).not.toContain('turnstile-one-time-proof');
    expect(transport.scriptCount).toBe(1);
  });

  test('troca A→B não permite que a resposta tardia de A libere a operação de B', async ({ page }) => {
    const accountA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const accountB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await page.addInitScript(({ accountA: initialAccount }) => {
      window.__helpCurrentUser = {
        id: initialAccount,
        email: 'a@example.com',
        is_anonymous: false
      };
    }, { accountA });
    await page.route('**/assets/js/api/kc-supabase.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.KCSupabase = {
            getUser: function () { return window.__helpCurrentUser; },
            getCurrentUser: async function () { return window.__helpCurrentUser; }
          };
        `
      });
    });
    await page.route('**/assets/js/api/kc-api.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.__helpCreateResolvers = {};
          window.__helpCreateCalls = [];
          window.KCAPI = {
            ENV: { driver: 'supabase', DATA_DRIVER: 'supabase', isProduction: false },
            registerAdapter: function () {},
            getCurrentProfile: function () { return null; },
            getMyProfile: async function () { return null; },
            recoverPrivacyHelpRequest: async function () {
              return { ok: false, error: { idempotency: { safe_to_replace: false } } };
            },
            createHelpRequest: function (payload) {
              var owner = payload.expected_user_id;
              window.__helpCreateCalls.push(owner);
              return new Promise(function (resolve) {
                window.__helpCreateResolvers[owner] = resolve;
              });
            }
          };
        `
      });
    });
    await page.goto('/ajuda.html?request=data_access_copy#helpRequestForm', {
      waitUntil: 'domcontentloaded'
    });

    const fillCopyRequest = async (email, message) => {
      await page.locator('[data-help-conditional="account_email"]').fill(email);
      await page.locator('[data-help-conditional="data_scope"]').selectOption('all_account_data');
      await page.locator('[data-help-conditional="data_copy_format"]').selectOption('structured');
      await page.locator('#helpMessage').fill(message);
      await page.locator('#helpContactEmail').fill(email);
    };

    await fillCopyRequest('a@example.com', 'Solicito a cópia referente à conta A antes da troca.');
    await page.locator('#helpSubmitButton').click();
    await expect(page.locator('#helpSubmitButton')).toBeDisabled();

    await page.evaluate(({ accountB: nextAccount }) => {
      window.__helpCurrentUser = {
        id: nextAccount,
        email: 'b@example.com',
        is_anonymous: false
      };
      document.dispatchEvent(new CustomEvent('kc:authchange', {
        detail: { user: window.__helpCurrentUser }
      }));
    }, { accountB });
    await expect(page.locator('#helpContactEmail')).toHaveValue('b@example.com');
    await fillCopyRequest('b@example.com', 'Solicito a cópia referente à conta B após a troca.');
    await page.locator('#helpSubmitButton').click();
    await expect.poll(
      async () => page.evaluate(() => window.__helpCreateCalls)
    ).toEqual([accountA, accountB]);
    await expect(page.locator('#helpSubmitButton')).toBeDisabled();

    await page.evaluate(({ accountA: previousAccount }) => {
      window.__helpCreateResolvers[previousAccount]({
        ok: true,
        data: { id: 'aaaaaaaa-0000-4000-8000-000000000001' }
      });
    }, { accountA });
    await expect(page.locator('#helpSubmitButton')).toBeDisabled();
    await expect(page.locator('#helpRequestForm')).toHaveAttribute('aria-busy', 'true');

    await page.evaluate(({ accountB: currentAccount }) => {
      window.__helpCreateResolvers[currentAccount]({
        ok: true,
        data: { id: 'bbbbbbbb-0000-4000-8000-000000000002' }
      });
    }, { accountB });
    await expect(page.locator('#helpSubmitButton')).toBeEnabled();
    await expect(page.locator('#helpRequestForm')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#helpProtocolValue')).toHaveText(
      'bbbbbbbb-0000-4000-8000-000000000002'
    );
  });

  test('refresh da mesma conta não solta submit pendente antes da própria resposta', async ({ page }) => {
    const accountId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await page.addInitScript(({ accountId: initialAccount }) => {
      window.__helpCurrentUser = {
        id: initialAccount,
        email: 'same@example.com',
        is_anonymous: false
      };
    }, { accountId });
    await page.route('**/assets/js/api/kc-supabase.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.KCSupabase = {
            getUser: function () { return window.__helpCurrentUser; },
            getCurrentUser: async function () { return window.__helpCurrentUser; }
          };
        `
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
            getMyProfile: async function () { return null; },
            recoverPrivacyHelpRequest: async function () {
              return { ok: false, error: { idempotency: { safe_to_replace: false } } };
            },
            createHelpRequest: function () {
              return new Promise(function (resolve) {
                window.__sameAccountSubmitResolve = resolve;
              });
            }
          };
        `
      });
    });
    await page.goto('/ajuda.html?request=data_access_copy#helpRequestForm', {
      waitUntil: 'domcontentloaded'
    });
    await page.locator('[data-help-conditional="account_email"]').fill('same@example.com');
    await page.locator('[data-help-conditional="data_scope"]').selectOption('all_account_data');
    await page.locator('[data-help-conditional="data_copy_format"]').selectOption('structured');
    await page.locator('#helpMessage').fill(
      'Solicito a cópia e mantenho o mesmo usuário durante a atualização.'
    );
    await page.locator('#helpContactEmail').fill('same@example.com');
    await page.locator('#helpSubmitButton').click();
    await expect(page.locator('#helpSubmitButton')).toBeDisabled();

    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('kc:authchange', {
        detail: { user: window.__helpCurrentUser }
      }));
    });
    await expect(page.locator('#helpSubmitButton')).toBeDisabled();
    await expect(page.locator('#helpRequestForm')).toHaveAttribute('aria-busy', 'true');

    await page.evaluate(() => {
      window.__sameAccountSubmitResolve({
        ok: true,
        data: { id: 'cccccccc-0000-4000-8000-000000000003' }
      });
    });
    await expect(page.locator('#helpSubmitButton')).toBeEnabled();
    await expect(page.locator('#helpRequestForm')).toHaveAttribute('aria-busy', 'false');
  });

  test('card de Configurações permanece dentro do layout e sem rolagem horizontal no mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/settings.html', { waitUntil: 'domcontentloaded' });

    const metrics = await page.evaluate(() => {
      const card = document.getElementById('settingsPrivacyData');
      card.style.display = '';
      card.closest('#settingsContent').style.display = 'grid';
      return {
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
        cardWidth: card.getBoundingClientRect().width,
        copyTag: document.getElementById('settingsDownloadAccountData').tagName,
        portabilityTag: document.getElementById('settingsRequestDataPortability').tagName,
        deletionTag: document.getElementById('settingsRequestAccountErasure').tagName,
        copyFallbackHref: document.getElementById('settingsPrivacyHelpFallback').getAttribute('href'),
        portabilityFallbackHref: document.getElementById('settingsPortabilityHelpFallback').getAttribute('href'),
        deletionFallbackHref: document.getElementById('settingsErasureHelpFallback').getAttribute('href')
      };
    });

    expect(metrics.content).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.cardWidth).toBeLessThanOrEqual(metrics.viewport);
    expect(metrics.copyTag).toBe('BUTTON');
    expect(metrics.portabilityTag).toBe('BUTTON');
    expect(metrics.deletionTag).toBe('BUTTON');
    expect(metrics.copyFallbackHref).toBe('ajuda.html?request=data_access_copy#helpRequestForm');
    expect(metrics.portabilityFallbackHref).toBe('ajuda.html?request=data_portability#helpRequestForm');
    expect(metrics.deletionFallbackHref).toBe('ajuda.html?request=account_erasure#helpRequestForm');
  });

  test('logout que falha mantém sessão, página e menu autenticado ativos', async ({ page }) => {
    await page.route('**/assets/js/api/kc-supabase.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.KCSupabase = {
            getUser: function () {
              return { id: '77777777-7777-4777-8777-777777777777', email: 'titular@example.com' };
            },
            getCurrentUser: async function () {
              return { id: '77777777-7777-4777-8777-777777777777', email: 'titular@example.com' };
            }
          };
        `
      });
    });
    await page.route('**/assets/js/api/kc-api.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.__kcLogoutAttempts = 0;
          window.KCAPI = {
            ENV: { driver: 'supabase', DATA_DRIVER: 'supabase', isProduction: false },
            registerAdapter: function () {},
            getCurrentProfile: function () { return null; },
            listDataSubjectRequests: async function () {
              return { ok: true, data: { items: [], total: 0 }, error: null };
            },
            logout: async function () {
              window.__kcLogoutAttempts += 1;
              return false;
            }
          };
        `
      });
    });

    await page.goto('/settings.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#settingsContent')).toBeVisible();

    await page.locator('#settingsLogout').click();
    await expect(page.locator('#settingsStatus')).toContainText('Sua sessão continua ativa');
    await expect(page).toHaveURL(/\/settings\.html(?:[?#].*)?$/);
    await expect(page.locator('#settingsLogout')).toBeEnabled();

    const accountTrigger = page.locator('a.btn-login');
    await expect(accountTrigger).toHaveClass(/is-auth/);
    await accountTrigger.click();
    const dropdownLogout = page.locator('#kcDropdownLogoutBtn');
    await expect(dropdownLogout).toBeVisible();
    await dropdownLogout.click();
    const globalLogoutStatus = page.locator('#kcAuthGlobalStatus');
    await expect(globalLogoutStatus).toBeVisible();
    await expect(globalLogoutStatus).toContainText('Sua sessão continua ativa');
    await expect(globalLogoutStatus).toHaveAttribute('role', 'status');
    await expect(globalLogoutStatus).toHaveAttribute('aria-live', 'assertive');
    expect(await globalLogoutStatus.evaluate((node) => node.closest('#kcAuthModal'))).toBeNull();
    await expect(dropdownLogout).toBeVisible();
    await expect(dropdownLogout).toBeEnabled();
    await expect(dropdownLogout).toHaveAttribute('aria-busy', 'false');
    await expect(accountTrigger).toHaveClass(/is-auth/);
    expect(await page.evaluate(() => window.__kcLogoutAttempts)).toBe(2);

    await dropdownLogout.click();
    await expect(globalLogoutStatus).toContainText('Sua sessão continua ativa');
    await expect(dropdownLogout).toBeEnabled();
    expect(await page.evaluate(() => window.__kcLogoutAttempts)).toBe(3);
  });

  test('logout global serializa modal, mobile e dropdown e restaura todos após falha', async ({ page }) => {
    await page.route('**/assets/js/api/kc-supabase.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.KCSupabase = {
            getUser: function () {
              return { id: '88888888-8888-4888-8888-888888888888', email: 'titular@example.com' };
            },
            getCurrentUser: async function () {
              return { id: '88888888-8888-4888-8888-888888888888', email: 'titular@example.com' };
            }
          };
        `
      });
    });
    await page.route('**/assets/js/api/kc-api.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.__kcLogoutAttempts = 0;
          window.__kcLogoutResolvers = [];
          window.__kcResolveNextLogout = function (result) {
            var resolve = window.__kcLogoutResolvers.shift();
            if (resolve) resolve(result);
          };
          window.KCAPI = {
            ENV: { driver: 'supabase', DATA_DRIVER: 'supabase', isProduction: false },
            registerAdapter: function () {},
            getCurrentProfile: function () { return null; },
            listDataSubjectRequests: async function () {
              return { ok: true, data: { items: [], total: 0 }, error: null };
            },
            logout: function () {
              window.__kcLogoutAttempts += 1;
              return new Promise(function (resolve) {
                window.__kcLogoutResolvers.push(resolve);
              });
            }
          };
        `
      });
    });

    await page.goto('/settings.html', { waitUntil: 'domcontentloaded' });
    const accountTrigger = page.locator('a.btn-login');
    await expect(accountTrigger).toHaveClass(/is-auth/);
    await accountTrigger.click();
    await expect(page.locator('#kcDropdownLogoutBtn')).toBeVisible();

    await page.evaluate(() => {
      [
        'kcDropdownLogoutBtn',
        'mobileMenuLogoutBtn',
        'kcAuthLogoutBtn',
      ].forEach((id) => {
        document.getElementById(id).dispatchEvent(new MouseEvent('click'));
      });
    });

    await expect.poll(() => page.evaluate(() => window.__kcLogoutAttempts)).toBe(1);
    for (const selector of [
      '#kcDropdownLogoutBtn',
      '#mobileMenuLogoutBtn',
      '#kcAuthLogoutBtn',
    ]) {
      await expect(page.locator(selector)).toBeDisabled();
      await expect(page.locator(selector)).toHaveAttribute('aria-busy', 'true');
    }
    await expect(page.locator('#kcAuthGlobalStatus')).toBeVisible();
    await expect(page.locator('#kcAuthGlobalStatus')).toContainText('Saindo');

    await page.evaluate(() => window.__kcResolveNextLogout(false));
    await expect(page.locator('#kcAuthGlobalStatus')).toContainText('Sua sessão continua ativa');
    for (const selector of [
      '#kcDropdownLogoutBtn',
      '#mobileMenuLogoutBtn',
      '#kcAuthLogoutBtn',
    ]) {
      await expect(page.locator(selector)).toBeEnabled();
      await expect(page.locator(selector)).toHaveAttribute('aria-busy', 'false');
    }
    await expect(page.locator('#kcDropdownLogoutBtn')).toBeVisible();
    await expect(accountTrigger).toHaveClass(/is-auth/);
    await expect(page).toHaveURL(/\/settings\.html(?:[?#].*)?$/);

    await page.locator('#kcDropdownLogoutBtn').click();
    await expect.poll(() => page.evaluate(() => window.__kcLogoutAttempts)).toBe(2);
    await expect(page.locator('#kcDropdownLogoutBtn')).toBeDisabled();
    await page.evaluate(() => window.__kcResolveNextLogout(false));
    await expect(page.locator('#kcDropdownLogoutBtn')).toBeEnabled();
    await expect(page.locator('#kcAuthGlobalStatus')).toContainText('Sua sessão continua ativa');
  });

  test('download autenticado combina dados locais sem tokens e recalcula a integridade final', async ({ page }) => {
    await page.route('**/assets/js/api/kc-supabase.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.KCSupabase = {
            getUser: function () {
              return { id: '11111111-1111-4111-8111-111111111111', email: 'titular@example.com' };
            },
            getCurrentUser: async function () {
              return { id: '11111111-1111-4111-8111-111111111111', email: 'titular@example.com' };
            }
          };
        `
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
            listDataSubjectRequests: async function () {
              return {
                ok: true,
                data: {
                  items: [{
                    protocol: 'KC-DSR-20260728-ABCDEF0123456789',
                    request_kind: 'data_access_copy',
                    status: 'ready',
                    expires_at: '2099-07-28T12:00:00.000Z'
                  }],
                  total: 1
                },
                error: null
              };
            },
            createDataSubjectRequest: async function () {
              return {
                ok: true,
                data: {
                  request: {
                    protocol: 'KC-DSR-20260728-ABCDEF0123456789',
                    request_kind: 'data_access_copy',
                    status: 'ready',
                    expires_at: '2099-07-28T12:00:00.000Z'
                  }
                },
                error: null
              };
            },
            downloadDataSubjectExport: async function () {
              return {
                ok: true,
                data: {
                  filename: 'kino-campus-meus-dados.json',
                  export: {
                    schema: 'kino-campus-data-export',
                    schema_version: 1,
                    protocol: 'KC-DSR-20260728-ABCDEF0123456789',
                    data: { profile: [{ display_name: 'Titular' }] },
                    manifest: { completeness: 'complete_within_automated_scope' },
                    integrity: {
                      algorithm: 'SHA-256',
                      payload_sha256: 'server-hash-placeholder',
                      payload_bytes: 123
                    }
                  }
                },
                error: null
              };
            },
            cancelDataSubjectRequest: async function () {
              return { ok: true, data: {}, error: null };
            }
          };
        `
      });
    });
    await page.addInitScript(() => {
      localStorage.setItem('kc_consent_v1', JSON.stringify({ version: 1, analytics: false }));
      localStorage.setItem('kc_search_affinity_v1', JSON.stringify({ version: 1, features: {} }));
      localStorage.setItem(
        'kc_search_affinity_v1:11111111-1111-4111-8111-111111111111',
        JSON.stringify({ version: 1, purpose: 'search-personalization-v1', features: {} })
      );
      localStorage.setItem(
        'kc:chat:draft:11111111-1111-4111-8111-111111111111:conversation-a',
        'Rascunho próprio'
      );
      localStorage.setItem(
        'kc:chat:draft:22222222-2222-4222-8222-222222222222:conversation-b',
        'Rascunho de outra conta'
      );
      localStorage.setItem(
        'kc_home_category_merged_v1',
        'browser-session-a::22222222-2222-4222-8222-222222222222'
      );
      localStorage.setItem(
        'kc_home_category_queue_v1',
        JSON.stringify([{
          id: 'pending-a',
          session_id: 'browser-session-a',
          module_key: 'eventos'
        }])
      );
      localStorage.setItem('kc_home_category_session_v1', 'browser-session-a');
      sessionStorage.setItem('kc_search_session_id', 'search-session-a');
      sessionStorage.setItem(
        'kc_privacy_action_keys_v1:11111111-1111-4111-8111-111111111111',
        JSON.stringify({
          version: 1,
          user_id: '11111111-1111-4111-8111-111111111111',
          keys: { account_erasure: 'settings-account_erasure-current-account-key' }
        })
      );
      sessionStorage.setItem(
        'kc_privacy_action_keys_v1:22222222-2222-4222-8222-222222222222',
        JSON.stringify({
        version: 1,
        user_id: '22222222-2222-4222-8222-222222222222',
        keys: { data_access_copy: 'settings-data_access_copy-other-account-key' }
        })
      );
      localStorage.setItem('sb-project-auth-token', 'refresh-token-que-nao-pode-sair');
    });

    await page.goto('/settings.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#settingsPrivacyData')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#settingsDownloadAccountData').click();
    const download = await downloadPromise;
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    const localItems = exported.browser_local_data.items;
    const exportedKeys = localItems.map((item) => item.key);

    expect(exportedKeys).toContain('kc_consent_v1');
    expect(exportedKeys).toContain(
      'kc_search_affinity_v1:11111111-1111-4111-8111-111111111111'
    );
    expect(exportedKeys).not.toContain('kc_search_affinity_v1');
    expect(exportedKeys).toContain(
      'kc:chat:draft:11111111-1111-4111-8111-111111111111:conversation-a'
    );
    expect(exportedKeys).not.toContain(
      'kc:chat:draft:22222222-2222-4222-8222-222222222222:conversation-b'
    );
    expect(exportedKeys).not.toContain('kc_home_category_merged_v1');
    expect(exportedKeys).not.toContain('kc_home_category_queue_v1');
    expect(exportedKeys).not.toContain('kc_home_category_session_v1');
    expect(exportedKeys).not.toContain('kc_search_session_id');
    expect(exportedKeys).not.toContain(
      'kc_privacy_action_keys_v1:22222222-2222-4222-8222-222222222222'
    );
    expect(exportedKeys).not.toContain(
      'kc_privacy_action_keys_v1:11111111-1111-4111-8111-111111111111'
    );
    expect(JSON.stringify(exported)).not.toContain('settings-account_erasure-current-account-key');
    expect(JSON.stringify(exported)).not.toContain('settings-data_access_copy-other-account-key');
    expect(JSON.stringify(exported)).not.toContain('22222222-2222-4222-8222-222222222222');
    expect(JSON.stringify(exported)).not.toContain('refresh-token-que-nao-pode-sair');
    expect(exported.server_integrity).toMatchObject({
      algorithm: 'SHA-256',
      payload_sha256: 'server-hash-placeholder',
      scope: 'server_export_core_before_integrity_and_browser_local_data'
    });

    const withoutFinalIntegrity = { ...exported };
    delete withoutFinalIntegrity.integrity;
    const expectedHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(withoutFinalIntegrity), 'utf8')
      .digest('hex');
    expect(exported.integrity).toMatchObject({
      algorithm: 'SHA-256',
      scope: 'all_top_level_fields_except_integrity_serialized_as_utf8_json',
      payload_sha256: expectedHash
    });

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#settingsClearBrowserPrivacyData').click();
    const remaining = await page.evaluate(() => ({
      consent: localStorage.getItem('kc_consent_v1'),
      affinity: localStorage.getItem('kc_search_affinity_v1'),
      accountAffinity: localStorage.getItem(
        'kc_search_affinity_v1:11111111-1111-4111-8111-111111111111'
      ),
      ownDraft: localStorage.getItem(
        'kc:chat:draft:11111111-1111-4111-8111-111111111111:conversation-a'
      ),
      otherDraft: localStorage.getItem(
        'kc:chat:draft:22222222-2222-4222-8222-222222222222:conversation-b'
      ),
      authToken: localStorage.getItem('sb-project-auth-token'),
      homeMergedMarker: localStorage.getItem('kc_home_category_merged_v1'),
      homeQueue: localStorage.getItem('kc_home_category_queue_v1'),
      homeSession: localStorage.getItem('kc_home_category_session_v1'),
      searchSession: sessionStorage.getItem('kc_search_session_id'),
      ownPrivacyAction: sessionStorage.getItem(
        'kc_privacy_action_keys_v1:11111111-1111-4111-8111-111111111111'
      ),
      otherPrivacyAction: sessionStorage.getItem(
        'kc_privacy_action_keys_v1:22222222-2222-4222-8222-222222222222'
      )
    }));
    expect(remaining).toEqual({
      consent: null,
      affinity: null,
      accountAffinity: null,
      ownDraft: null,
      otherDraft: 'Rascunho de outra conta',
      authToken: 'refresh-token-que-nao-pode-sair',
      homeMergedMarker: null,
      homeQueue: null,
      homeSession: null,
      searchSession: null,
      ownPrivacyAction: null,
      otherPrivacyAction: JSON.stringify({
        version: 1,
        user_id: '22222222-2222-4222-8222-222222222222',
        keys: { data_access_copy: 'settings-data_access_copy-other-account-key' }
      })
    });
  });

  test('download parcial alerta sobre categorias truncadas e complemento manual', async ({ page }) => {
    const protocol = 'KC-DSR-20260728-PARTIAL00000001';
    await page.route('**/assets/js/api/kc-supabase.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.KCSupabase = {
            getUser: function () {
              return { id: '11111111-1111-4111-8111-111111111111', email: 'titular@example.com' };
            },
            getCurrentUser: async function () {
              return { id: '11111111-1111-4111-8111-111111111111', email: 'titular@example.com' };
            }
          };
        `
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
            listDataSubjectRequests: async function () {
              return {
                ok: true,
                data: {
                  items: [{
                    protocol: '${protocol}',
                    request_kind: 'data_access_copy',
                    status: 'partial_failure',
                    expires_at: '2099-07-28T12:00:00.000Z'
                  }],
                  total: 1
                },
                error: null
              };
            },
            createDataSubjectRequest: async function () {
              throw new Error('a solicitação existente deve ser reutilizada');
            },
            downloadDataSubjectExport: async function () {
              return {
                ok: true,
                data: {
                  filename: 'kino-campus-meus-dados-parcial.json',
                  export: {
                    schema: 'kino-campus-data-export',
                    schema_version: 1,
                    protocol: '${protocol}',
                    data: {},
                    media_manifest: { unavailable_chat_media_count: 2, items: [] },
                    manifest: {
                      completeness: 'partial_manual_supplement_required',
                      manual_supplement_required: true,
                      category_results: [
                        {
                          key: 'privacy_analytics_events',
                          status: 'included',
                          included_count: 2500,
                          truncated: true,
                          omitted_fields: []
                        }
                      ]
                    }
                  }
                },
                error: null
              };
            },
            cancelDataSubjectRequest: async function () {
              return { ok: true, data: {}, error: null };
            }
          };
        `
      });
    });

    await page.goto('/settings.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#settingsPrivacyData')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#settingsDownloadAccountData').click();
    await downloadPromise;

    const status = page.locator('#settingsPrivacyDataStatus');
    await expect(status).toHaveClass(/is-warn/);
    await expect(status).toContainText('é parcial');
    await expect(status).toContainText('complemento manual continua necessário');
    await expect(status).toContainText('privacy analytics events');
    await expect(status).toContainText('2 anexo(s)');
    await expect(page.locator('#settingsDownloadAccountData')).not.toHaveClass(/is-success/);
  });

  test('reutiliza a chave idempotente após perda de resposta e recarregamento', async ({ page }) => {
    await page.route('**/assets/js/api/kc-supabase.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.KCSupabase = {
            getUser: function () {
              return { id: '33333333-3333-4333-8333-333333333333', email: 'titular@example.com' };
            },
            getCurrentUser: async function () {
              return { id: '33333333-3333-4333-8333-333333333333', email: 'titular@example.com' };
            }
          };
        `
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
            listDataSubjectRequests: async function () {
              return { ok: true, data: { items: [], total: 0 }, error: null };
            },
            createDataSubjectRequest: async function (payload) {
              var attempts = JSON.parse(sessionStorage.getItem('__kc_privacy_attempts') || '[]');
              attempts.push(payload.idempotency_key);
              sessionStorage.setItem('__kc_privacy_attempts', JSON.stringify(attempts));
              if (sessionStorage.getItem('__kc_privacy_server_accepted') !== '1') {
                sessionStorage.setItem('__kc_privacy_server_accepted', '1');
                throw new Error('resposta perdida depois do aceite');
              }
              return {
                ok: true,
                data: {
                  request: {
                    protocol: 'KC-DSR-20260728-FEDCBA9876543210',
                    request_kind: 'data_access_copy',
                    status: 'ready',
                    expires_at: '2099-07-28T12:00:00.000Z'
                  }
                },
                error: null
              };
            },
            downloadDataSubjectExport: async function () {
              return {
                ok: true,
                data: {
                  filename: 'kino-campus-meus-dados.json',
                  export: {
                    schema: 'kino-campus-data-export',
                    schema_version: 1,
                    protocol: 'KC-DSR-20260728-FEDCBA9876543210',
                    data: {},
                    manifest: { completeness: 'complete_within_automated_scope' }
                  }
                },
                error: null
              };
            },
            cancelDataSubjectRequest: async function () {
              return { ok: true, data: {}, error: null };
            }
          };
        `
      });
    });

    await page.goto('/settings.html', { waitUntil: 'domcontentloaded' });
    await page.locator('#settingsDownloadAccountData').click();
    await expect(page.locator('#settingsPrivacyDataStatus')).toContainText(
      'Não foi possível gerar sua cópia agora'
    );

    const pendingBeforeReload = await page.evaluate(() => (
      JSON.parse(
        sessionStorage.getItem(
          'kc_privacy_action_keys_v1:33333333-3333-4333-8333-333333333333'
        ) || 'null'
      )
    ));
    expect(pendingBeforeReload).toMatchObject({
      version: 1,
      user_id: '33333333-3333-4333-8333-333333333333',
      keys: { data_access_copy: expect.stringMatching(/^settings-data_access_copy-/) }
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#settingsDownloadAccountData').click();
    await downloadPromise;

    const recovery = await page.evaluate(() => ({
      attempts: JSON.parse(sessionStorage.getItem('__kc_privacy_attempts') || '[]'),
      pending: sessionStorage.getItem(
        'kc_privacy_action_keys_v1:33333333-3333-4333-8333-333333333333'
      )
    }));
    expect(recovery.attempts).toHaveLength(2);
    expect(recovery.attempts[0]).toBe(recovery.attempts[1]);
    expect(recovery.pending).toBeNull();
  });

  test('reconcilia protocolo aceito no reload e usa nova chave após estado terminal', async ({ page }) => {
    const userId = '44444444-4444-4444-8444-444444444444';
    const storageKey = `kc_privacy_action_keys_v1:${userId}`;

    await page.route('**/assets/js/api/kc-supabase.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.KCSupabase = {
            getUser: function () {
              return { id: '${userId}', email: 'titular@example.com' };
            },
            getCurrentUser: async function () {
              return { id: '${userId}', email: 'titular@example.com' };
            }
          };
        `
      });
    });
    await page.route('**/assets/js/api/kc-api.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          function readExportState() {
            return JSON.parse(sessionStorage.getItem('__kc_reconciled_export_state') || 'null');
          }
          function writeExportState(value) {
            sessionStorage.setItem('__kc_reconciled_export_state', JSON.stringify(value));
          }
          function exportRequest(state) {
            return {
              protocol: state.protocol,
              request_kind: 'data_access_copy',
              status: state.status,
              created_at: '2026-07-29T12:00:00.000Z',
              expires_at: state.status === 'ready' ? '2099-07-29T12:00:00.000Z' : null
            };
          }
          window.KCAPI = {
            ENV: { driver: 'supabase', DATA_DRIVER: 'supabase', isProduction: false },
            registerAdapter: function () {},
            getCurrentProfile: function () { return null; },
            listDataSubjectRequests: async function () {
              var state = readExportState();
              return {
                ok: true,
                data: { items: state ? [exportRequest(state)] : [], total: state ? 1 : 0 },
                error: null
              };
            },
            createDataSubjectRequest: async function (payload) {
              var attempts = JSON.parse(sessionStorage.getItem('__kc_reconciled_export_attempts') || '[]');
              attempts.push(payload.idempotency_key);
              sessionStorage.setItem('__kc_reconciled_export_attempts', JSON.stringify(attempts));
              var state = readExportState();
              if (!state) {
                writeExportState({
                  protocol: 'KC-DSR-20260729-ACCEPTED00000001',
                  status: 'ready'
                });
                throw new Error('resposta perdida depois do aceite');
              }
              if (state.status === 'completed') {
                state = {
                  protocol: 'KC-DSR-20260729-NEWREQUEST000002',
                  status: 'ready'
                };
                writeExportState(state);
              }
              return { ok: true, data: { request: exportRequest(state) }, error: null };
            },
            downloadDataSubjectExport: async function (protocol) {
              var state = readExportState();
              if (!state || state.protocol !== protocol || state.status !== 'ready') {
                return { ok: false, error: { message: 'Protocolo indisponível.' } };
              }
              state.status = 'completed';
              writeExportState(state);
              return {
                ok: true,
                data: {
                  filename: 'kino-campus-meus-dados.json',
                  export: {
                    schema: 'kino-campus-data-export',
                    schema_version: 1,
                    protocol: protocol,
                    data: {},
                    manifest: { completeness: 'complete_within_automated_scope' }
                  }
                },
                error: null
              };
            },
            cancelDataSubjectRequest: async function () {
              return { ok: true, data: {}, error: null };
            }
          };
        `
      });
    });

    await page.goto('/settings.html', { waitUntil: 'domcontentloaded' });
    await page.locator('#settingsDownloadAccountData').click();
    await expect(page.locator('#settingsPrivacyDataStatus')).toContainText(
      'Não foi possível gerar sua cópia agora'
    );
    const firstKey = await page.evaluate((key) => (
      JSON.parse(sessionStorage.getItem(key) || 'null').keys.data_access_copy
    ), storageKey);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(async () => page.evaluate((key) => sessionStorage.getItem(key), storageKey))
      .toBeNull();
    await expect(page.locator('#settingsDataSubjectRequests')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#settingsDataSubjectRequests [role="listitem"]')).toHaveCount(1);

    const recoveredDownload = page.waitForEvent('download');
    await page.locator('#settingsDownloadAccountData').click();
    await recoveredDownload;
    expect(await page.evaluate(() => (
      JSON.parse(sessionStorage.getItem('__kc_reconciled_export_attempts') || '[]').length
    ))).toBe(1);

    const newDownload = page.waitForEvent('download');
    await page.locator('#settingsDownloadAccountData').click();
    await newDownload;
    const recovery = await page.evaluate((key) => ({
      attempts: JSON.parse(sessionStorage.getItem('__kc_reconciled_export_attempts') || '[]'),
      pending: sessionStorage.getItem(key)
    }), storageKey);
    expect(recovery.attempts).toHaveLength(2);
    expect(recovery.attempts[0]).toBe(firstKey);
    expect(recovery.attempts[1]).not.toBe(firstKey);
    expect(recovery.pending).toBeNull();
  });

  test('cancelamento de exclusão reconciliada libera chave nova para outro pedido', async ({ page }) => {
    const userId = '55555555-5555-4555-8555-555555555555';
    const storageKey = `kc_privacy_action_keys_v1:${userId}`;

    await page.route('**/assets/js/api/kc-supabase.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.KCSupabase = {
            getUser: function () {
              return { id: '${userId}', email: 'titular@example.com' };
            },
            getCurrentUser: async function () {
              return { id: '${userId}', email: 'titular@example.com' };
            }
          };
        `
      });
    });
    await page.route('**/assets/js/api/kc-api.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          function readErasureState() {
            return JSON.parse(sessionStorage.getItem('__kc_reconciled_erasure_state') || 'null');
          }
          function writeErasureState(value) {
            sessionStorage.setItem('__kc_reconciled_erasure_state', JSON.stringify(value));
          }
          function erasureRequest(state) {
            return {
              protocol: state.protocol,
              request_kind: 'account_erasure',
              status: state.status,
              created_at: '2026-07-29T12:00:00.000Z',
              expires_at: null
            };
          }
          window.KCAPI = {
            ENV: { driver: 'supabase', DATA_DRIVER: 'supabase', isProduction: false },
            registerAdapter: function () {},
            getCurrentProfile: function () { return null; },
            listDataSubjectRequests: async function () {
              var state = readErasureState();
              return {
                ok: true,
                data: { items: state ? [erasureRequest(state)] : [], total: state ? 1 : 0 },
                error: null
              };
            },
            createDataSubjectRequest: async function (payload) {
              var attempts = JSON.parse(sessionStorage.getItem('__kc_reconciled_erasure_attempts') || '[]');
              attempts.push(payload.idempotency_key);
              sessionStorage.setItem('__kc_reconciled_erasure_attempts', JSON.stringify(attempts));
              var state = readErasureState();
              if (!state) {
                writeErasureState({
                  protocol: 'KC-DSR-20260729-ERASUREOLD000001',
                  status: 'received'
                });
                throw new Error('resposta perdida depois do aceite');
              }
              if (state.status === 'cancelled') {
                state = {
                  protocol: 'KC-DSR-20260729-ERASURENEW000002',
                  status: 'received'
                };
                writeErasureState(state);
              }
              return { ok: true, data: { request: erasureRequest(state) }, error: null };
            },
            cancelDataSubjectRequest: async function (protocol) {
              var state = readErasureState();
              if (!state || state.protocol !== protocol) {
                return { ok: false, error: { message: 'Protocolo indisponível.' } };
              }
              state.status = 'cancelled';
              writeErasureState(state);
              return { ok: true, data: { request: erasureRequest(state) }, error: null };
            }
          };
        `
      });
    });

    await page.goto('/settings.html', { waitUntil: 'domcontentloaded' });
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('ainda não registra');
      await dialog.accept();
    });
    await page.locator('#settingsRequestAccountErasure').click();
    await expect(page.locator('#settingsPrivacyDataStatus')).toContainText(
      'Não foi possível abrir o pedido de exclusão agora'
    );
    const firstKey = await page.evaluate((key) => (
      JSON.parse(sessionStorage.getItem(key) || 'null').keys.account_erasure
    ), storageKey);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(async () => page.evaluate((key) => sessionStorage.getItem(key), storageKey))
      .toBeNull();
    const cancelButton = page.locator('#settingsDataSubjectRequests button.is-danger');
    await expect(cancelButton).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await cancelButton.click();
    await expect(page.locator('#settingsPrivacyDataStatus')).toContainText('cancelado');

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#settingsRequestAccountErasure').click();
    await expect(page.locator('#settingsPrivacyDataStatus')).toContainText('Pedido recebido');

    const recovery = await page.evaluate((key) => ({
      attempts: JSON.parse(sessionStorage.getItem('__kc_reconciled_erasure_attempts') || '[]'),
      pending: sessionStorage.getItem(key)
    }), storageKey);
    expect(recovery.attempts).toHaveLength(2);
    expect(recovery.attempts[0]).toBe(firstKey);
    expect(recovery.attempts[1]).not.toBe(firstKey);
    expect(recovery.pending).toBeNull();
  });

  test('isola retries e limpeza local entre contas no mesmo navegador', async ({ page }) => {
    const accountA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const accountB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const storageKeyA = `kc_privacy_action_keys_v1:${accountA}`;
    const storageKeyB = `kc_privacy_action_keys_v1:${accountB}`;

    await page.addInitScript((initialAccount) => {
      if (!sessionStorage.getItem('__kc_test_account_id')) {
        sessionStorage.setItem('__kc_test_account_id', initialAccount);
      }
    }, accountA);
    await page.route('**/assets/js/api/kc-supabase.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          function kcTestUser() {
            return {
              id: sessionStorage.getItem('__kc_test_account_id'),
              email: 'titular@example.com'
            };
          }
          window.KCSupabase = {
            getUser: kcTestUser,
            getCurrentUser: async function () { return kcTestUser(); }
          };
        `
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
            listDataSubjectRequests: async function () {
              return { ok: true, data: { items: [], total: 0 }, error: null };
            },
            createDataSubjectRequest: async function (payload) {
              var attempts = JSON.parse(sessionStorage.getItem('__kc_isolation_attempts') || '[]');
              attempts.push({
                user_id: sessionStorage.getItem('__kc_test_account_id'),
                kind: payload.request_kind,
                key: payload.idempotency_key
              });
              sessionStorage.setItem('__kc_isolation_attempts', JSON.stringify(attempts));
              throw new Error('resposta perdida depois do aceite');
            },
            cancelDataSubjectRequest: async function () {
              return { ok: true, data: {}, error: null };
            }
          };
        `
      });
    });

    await page.goto('/settings.html', { waitUntil: 'domcontentloaded' });
    await page.locator('#settingsDownloadAccountData').click();
    await expect.poll(async () => page.evaluate(() => (
      JSON.parse(sessionStorage.getItem('__kc_isolation_attempts') || '[]').length
    ))).toBe(1);
    const firstAKey = await page.evaluate((key) => (
      JSON.parse(sessionStorage.getItem(key) || 'null').keys.data_access_copy
    ), storageKeyA);

    await page.evaluate((accountId) => {
      sessionStorage.setItem('__kc_test_account_id', accountId);
    }, accountB);
    await page.reload({ waitUntil: 'domcontentloaded' });
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#settingsClearBrowserPrivacyData').click();
    await expect(page.locator('#settingsPrivacyDataStatus')).toHaveClass(/is-success/);
    expect(await page.evaluate((key) => sessionStorage.getItem(key), storageKeyA)).not.toBeNull();

    await page.locator('#settingsDownloadAccountData').click();
    await expect.poll(async () => page.evaluate(() => (
      JSON.parse(sessionStorage.getItem('__kc_isolation_attempts') || '[]').length
    ))).toBe(2);
    expect(await page.evaluate((key) => sessionStorage.getItem(key), storageKeyA)).not.toBeNull();

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#settingsClearBrowserPrivacyData').click();
    expect(await page.evaluate((key) => sessionStorage.getItem(key), storageKeyB)).toBeNull();
    expect(await page.evaluate((key) => sessionStorage.getItem(key), storageKeyA)).not.toBeNull();

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#settingsRequestAccountErasure').click();
    await expect.poll(async () => page.evaluate(() => (
      JSON.parse(sessionStorage.getItem('__kc_isolation_attempts') || '[]').length
    ))).toBe(3);
    const accountBAfterClear = await page.evaluate((key) => (
      JSON.parse(sessionStorage.getItem(key) || 'null')
    ), storageKeyB);
    expect(accountBAfterClear.keys).toEqual({
      account_erasure: expect.stringMatching(/^settings-account_erasure-/)
    });

    await page.evaluate((accountId) => {
      sessionStorage.setItem('__kc_test_account_id', accountId);
    }, accountA);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#settingsDownloadAccountData').click();
    await expect.poll(async () => page.evaluate(() => (
      JSON.parse(sessionStorage.getItem('__kc_isolation_attempts') || '[]').length
    ))).toBe(4);

    const attempts = await page.evaluate(() => (
      JSON.parse(sessionStorage.getItem('__kc_isolation_attempts') || '[]')
    ));
    expect(attempts.map((attempt) => attempt.user_id)).toEqual([
      accountA,
      accountB,
      accountB,
      accountA
    ]);
    expect(attempts[0].key).toBe(firstAKey);
    expect(attempts[3].key).toBe(firstAKey);
    expect(attempts[1].key).not.toBe(firstAKey);
  });
});

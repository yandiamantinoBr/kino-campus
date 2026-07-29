const { test, expect } = require('@playwright/test');

const FUTURE_EXPIRY = '2099-07-29T12:00:00.000Z';

async function mockSettingsSession(page, user) {
  await page.route('**/assets/js/api/kc-supabase.client.js*', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript; charset=utf-8',
      body: `
        window.__settingsPrivacyUser = ${JSON.stringify(user)};
        window.KCSupabase = {
          getUser: function () { return window.__settingsPrivacyUser; },
          getCurrentUser: async function () { return window.__settingsPrivacyUser; }
        };
      `,
    });
  });
}

test.describe('concorrência e foco dos protocolos em configurações', () => {
  test('serializa ações irmãs, mantém protocolos distintos paralelos e restaura foco com fallback', async ({ page }) => {
    const user = {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'privacy-lease@example.invalid',
    };
    const protocolA = 'KC-DSR-20260729-AAAAAAAAAAAAAAAA';
    const protocolB = 'KC-DSR-20260729-BBBBBBBBBBBBBBBB';
    const artifactRef = 'KEA-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    await mockSettingsSession(page, user);

    await page.route('**/assets/js/api/kc-api.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.__showProtocolA = true;
          window.__privacyConfirmCalls = 0;
          window.__exportCalls = Object.create(null);
          window.__supplementCalls = 0;
          window.__cancelCalls = 0;
          window.__resolveExportA = null;
          window.__resolveExportB = null;
          window.__resolveSupplementA = null;
          window.__resolveCancelA = null;
          window.__privacyResult = function (filename) {
            return {
              ok: true,
              data: {
                filename: filename,
                export: {
                  schema_version: 1,
                  manifest: { completeness: 'complete_within_automated_scope' },
                  data: {}
                }
              },
              error: null
            };
          };
          window.confirm = function () {
            window.__privacyConfirmCalls += 1;
            return true;
          };
          window.KCAPI = {
            ENV: { driver: 'supabase', DATA_DRIVER: 'supabase', isProduction: false },
            registerAdapter: function () {},
            getCurrentUser: async function () { return window.__settingsPrivacyUser; },
            getCurrentProfile: function () { return null; },
            getSearchPreferences: async function () { return null; },
            listDataSubjectRequests: async function () {
              var items = [{
                protocol: '${protocolB}',
                request_kind: 'data_access_copy',
                status: 'ready',
                created_at: '2026-07-29T09:05:00.000Z',
                expires_at: '${FUTURE_EXPIRY}'
              }];
              if (window.__showProtocolA) {
                items.unshift({
                  protocol: '${protocolA}',
                  request_kind: 'data_access_copy',
                  status: 'partial_failure',
                  created_at: '2026-07-29T09:00:00.000Z',
                  expires_at: '${FUTURE_EXPIRY}'
                });
              }
              return {
                ok: true,
                data: { items: items, total: items.length, has_more: false },
                error: null
              };
            },
            getDataSubjectRequest: async function (protocol) {
              return {
                ok: true,
                data: {
                  supplement: protocol === '${protocolA}' ? {
                    artifact_ref: '${artifactRef}',
                    status: 'delivered',
                    expires_at: '${FUTURE_EXPIRY}',
                    version: 2
                  } : null
                },
                error: null
              };
            },
            downloadDataSubjectExport: async function (protocol) {
              window.__exportCalls[protocol] = Number(window.__exportCalls[protocol] || 0) + 1;
              return new Promise(function (resolve) {
                if (protocol === '${protocolA}') window.__resolveExportA = resolve;
                if (protocol === '${protocolB}') window.__resolveExportB = resolve;
              });
            },
            downloadDataSubjectSupplement: async function () {
              window.__supplementCalls += 1;
              return new Promise(function (resolve) {
                window.__resolveSupplementA = resolve;
              });
            },
            cancelDataSubjectRequest: async function () {
              window.__cancelCalls += 1;
              return new Promise(function (resolve) {
                window.__resolveCancelA = resolve;
              });
            }
          };
        `,
      });
    });

    let downloadCount = 0;
    page.on('download', () => {
      downloadCount += 1;
    });
    await page.goto('/settings.html', { waitUntil: 'domcontentloaded' });

    const rowA = page.locator(
      `[data-privacy-request-row][data-privacy-request-protocol="${protocolA}"]`,
    );
    const rowB = page.locator(
      `[data-privacy-request-row][data-privacy-request-protocol="${protocolB}"]`,
    );
    const exportA = rowA.locator('[data-privacy-request-action="download_export"]');
    const supplementA = rowA.locator('[data-privacy-request-action="download_supplement"]');
    const cancelA = rowA.locator('[data-privacy-request-action="cancel"]');
    const exportB = rowB.locator('[data-privacy-request-action="download_export"]');
    await expect(rowA).toBeVisible({ timeout: 15000 });
    await expect(rowA.locator('[data-privacy-request-action]')).toHaveCount(3);

    await exportA.focus();
    await page.evaluate((protocol) => {
      const row = Array.from(document.querySelectorAll('[data-privacy-request-row]')).find(
        (item) => item.dataset.privacyRequestProtocol === protocol,
      );
      row.querySelector('[data-privacy-request-action="download_export"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
      row.querySelector('[data-privacy-request-action="cancel"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    }, protocolA);

    await expect.poll(
      () => page.evaluate((protocol) => window.__exportCalls[protocol] || 0, protocolA),
    ).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__cancelCalls)).toBe(0);
    await expect.poll(() => page.evaluate(() => window.__privacyConfirmCalls)).toBe(0);
    await expect(rowA).toHaveAttribute('aria-busy', 'true');
    expect(await rowA.locator('[data-privacy-request-action]').evaluateAll(
      (buttons) => buttons.every(
        (button) => button.disabled && button.getAttribute('aria-disabled') === 'true',
      ),
    )).toBe(true);
    await expect(page.locator('#settingsClearBrowserPrivacyData')).toBeDisabled();
    await page.evaluate(() => {
      document.getElementById('settingsClearBrowserPrivacyData').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    await expect.poll(() => page.evaluate(() => window.__privacyConfirmCalls)).toBe(0);

    await page.evaluate(() => {
      window.__resolveExportA(window.__privacyResult('protocol-a.json'));
    });
    await expect.poll(() => downloadCount).toBe(1);
    await expect(page.locator('#settingsClearBrowserPrivacyData')).toBeEnabled();
    await expect.poll(() => page.evaluate(() => ({
      protocol: document.activeElement &&
        document.activeElement.dataset.privacyRequestProtocol,
      action: document.activeElement &&
        document.activeElement.dataset.privacyRequestAction,
    }))).toEqual({
      protocol: protocolA,
      action: 'download_export',
    });
    expect(await rowA.locator('[data-privacy-request-action]').evaluateAll(
      (buttons) => buttons.every((button) => !button.disabled),
    )).toBe(true);

    await supplementA.focus();
    await supplementA.dispatchEvent('click');
    await exportB.focus();
    await exportB.dispatchEvent('click');
    await expect.poll(() => page.evaluate(() => window.__supplementCalls)).toBe(1);
    await expect.poll(
      () => page.evaluate((protocol) => window.__exportCalls[protocol] || 0, protocolB),
    ).toBe(1);
    expect(await rowA.locator('[data-privacy-request-action]').evaluateAll(
      (buttons) => buttons.every((button) => button.disabled),
    )).toBe(true);
    expect(await rowB.locator('[data-privacy-request-action]').evaluateAll(
      (buttons) => buttons.every((button) => button.disabled),
    )).toBe(true);
    await expect(page.locator('#settingsClearBrowserPrivacyData')).toBeDisabled();

    await page.evaluate(() => {
      window.__resolveExportB(window.__privacyResult('protocol-b.json'));
      window.__resolveSupplementA(window.__privacyResult('protocol-a-supplement.json'));
    });
    await expect.poll(() => downloadCount).toBe(3);
    await expect(page.locator('#settingsClearBrowserPrivacyData')).toBeEnabled();

    await cancelA.focus();
    await cancelA.dispatchEvent('click');
    await expect.poll(() => page.evaluate(() => window.__cancelCalls)).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__privacyConfirmCalls)).toBe(1);
    await expect(rowA).toHaveAttribute('aria-busy', 'true');
    expect(await rowA.locator('[data-privacy-request-action]').evaluateAll(
      (buttons) => buttons.every(
        (button) => button.disabled && button.getAttribute('aria-disabled') === 'true',
      ),
    )).toBe(true);
    expect(await rowB.locator('[data-privacy-request-action]').evaluateAll(
      (buttons) => buttons.every((button) => !button.disabled),
    )).toBe(true);

    await page.evaluate((protocol) => {
      const row = Array.from(document.querySelectorAll('[data-privacy-request-row]')).find(
        (item) => item.dataset.privacyRequestProtocol === protocol,
      );
      row.querySelector('[data-privacy-request-action="download_export"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
      document.getElementById('settingsClearBrowserPrivacyData').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    }, protocolA);
    await expect.poll(
      () => page.evaluate((protocol) => window.__exportCalls[protocol] || 0, protocolA),
    ).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__privacyConfirmCalls)).toBe(1);
    await expect(page.locator('#settingsClearBrowserPrivacyData')).toBeDisabled();
    await expect(page.locator('#settingsPrivacyDataStatus')).toContainText(
      'Aguarde a operação do protocolo terminar',
    );

    await page.evaluate(() => {
      window.__showProtocolA = false;
      window.__resolveCancelA({ ok: true, data: { status: 'cancelled' }, error: null });
    });
    await expect(rowA).toHaveCount(0);
    await expect(page.locator('#settingsClearBrowserPrivacyData')).toBeEnabled();
    await expect.poll(() => page.evaluate(() => ({
      id: document.activeElement && document.activeElement.id,
      isBody: document.activeElement === document.body,
    }))).toEqual({
      id: 'settingsRefreshDataRequests',
      isBody: false,
    });
  });

  test('descarta resposta antiga da mesma conta e não rouba foco movido durante a espera', async ({ page }) => {
    const user = {
      id: '22222222-2222-4222-8222-222222222222',
      email: 'privacy-sequence@example.invalid',
    };
    const initialProtocol = 'KC-DSR-20260729-INITIAL0000000001';
    const newerProtocol = 'KC-DSR-20260729-NEWER000000000001';
    const olderProtocol = 'KC-DSR-20260729-OLDER000000000001';
    await mockSettingsSession(page, user);

    await page.route('**/assets/js/api/kc-api.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.__listCalls = 0;
          window.__pendingListResolvers = Object.create(null);
          window.__requestListResult = function (protocol) {
            return {
              ok: true,
              data: {
                items: [{
                  protocol: protocol,
                  request_kind: 'data_access_copy',
                  status: 'ready',
                  created_at: '2026-07-29T10:00:00.000Z',
                  expires_at: '${FUTURE_EXPIRY}'
                }],
                total: 1,
                has_more: false
              },
              error: null
            };
          };
          window.KCAPI = {
            ENV: { driver: 'supabase', DATA_DRIVER: 'supabase', isProduction: false },
            registerAdapter: function () {},
            getCurrentUser: async function () { return window.__settingsPrivacyUser; },
            getCurrentProfile: function () { return null; },
            getSearchPreferences: async function () { return null; },
            listDataSubjectRequests: async function () {
              window.__listCalls += 1;
              var call = window.__listCalls;
              if (call === 1) return window.__requestListResult('${initialProtocol}');
              return new Promise(function (resolve) {
                window.__pendingListResolvers[call] = resolve;
              });
            }
          };
        `,
      });
    });

    await page.goto('/settings.html', { waitUntil: 'domcontentloaded' });
    const initialAction = page.locator('[data-privacy-request-action="download_export"]');
    await expect(initialAction).toBeVisible({ timeout: 15000 });
    await initialAction.focus();
    await page.evaluate(() => {
      const refresh = document.getElementById('settingsRefreshDataRequests');
      refresh.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      refresh.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => window.__listCalls)).toBe(3);

    const helpLink = page.locator('#settingsPrivacyHelpFallback');
    await helpLink.focus();
    await page.evaluate((protocol) => {
      window.__pendingListResolvers[3](window.__requestListResult(protocol));
    }, newerProtocol);
    await expect(page.locator('#settingsDataSubjectRequests')).toContainText(newerProtocol);
    await expect.poll(() => page.evaluate(() => document.activeElement &&
      document.activeElement.id)).toBe('settingsPrivacyHelpFallback');

    await page.evaluate((protocol) => {
      window.__pendingListResolvers[2](window.__requestListResult(protocol));
    }, olderProtocol);
    await page.waitForTimeout(50);
    await expect(page.locator('#settingsDataSubjectRequests')).toContainText(newerProtocol);
    await expect(page.locator('#settingsDataSubjectRequests')).not.toContainText(olderProtocol);
    await expect.poll(() => page.evaluate(() => document.activeElement &&
      document.activeElement.id)).toBe('settingsPrivacyHelpFallback');
  });

  test('finally antigo de outra conta não libera nem focaliza o lease novo', async ({ page }) => {
    const accountA = {
      id: '33333333-3333-4333-8333-333333333333',
      email: 'privacy-account-a@example.invalid',
    };
    const accountB = {
      id: '44444444-4444-4444-8444-444444444444',
      email: 'privacy-account-b@example.invalid',
    };
    const protocol = 'KC-DSR-20260729-SAME000000000001';
    await mockSettingsSession(page, accountA);

    await page.route('**/assets/js/api/kc-api.client.js*', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: `
          window.__accountDownloadCalls = Object.create(null);
          window.__resolveAccountA = null;
          window.__resolveAccountB = null;
          window.__accountExportResult = function () {
            return {
              ok: true,
              data: {
                filename: 'account-export.json',
                export: {
                  schema_version: 1,
                  manifest: { completeness: 'complete_within_automated_scope' },
                  data: {}
                }
              },
              error: null
            };
          };
          window.KCAPI = {
            ENV: { driver: 'supabase', DATA_DRIVER: 'supabase', isProduction: false },
            registerAdapter: function () {},
            getCurrentUser: async function () { return window.__settingsPrivacyUser; },
            getCurrentProfile: function () { return null; },
            getSearchPreferences: async function () { return null; },
            listDataSubjectRequests: async function () {
              return {
                ok: true,
                data: {
                  items: [{
                    protocol: '${protocol}',
                    request_kind: 'data_access_copy',
                    status: 'ready',
                    created_at: '2026-07-29T11:00:00.000Z',
                    expires_at: '${FUTURE_EXPIRY}'
                  }],
                  total: 1,
                  has_more: false
                },
                error: null
              };
            },
            downloadDataSubjectExport: async function (_protocol, options) {
              var owner = options && options.expected_user_id;
              window.__accountDownloadCalls[owner] =
                Number(window.__accountDownloadCalls[owner] || 0) + 1;
              return new Promise(function (resolve) {
                if (owner === '${accountA.id}') window.__resolveAccountA = resolve;
                if (owner === '${accountB.id}') window.__resolveAccountB = resolve;
              });
            }
          };
        `,
      });
    });

    let downloadCount = 0;
    page.on('download', () => {
      downloadCount += 1;
    });
    await page.goto('/settings.html', { waitUntil: 'domcontentloaded' });
    const downloadAction = page.locator('[data-privacy-request-action="download_export"]');
    await expect(downloadAction).toBeVisible({ timeout: 15000 });
    await downloadAction.focus();
    await downloadAction.dispatchEvent('click');
    await expect.poll(
      () => page.evaluate((userId) => window.__accountDownloadCalls[userId] || 0, accountA.id),
    ).toBe(1);

    await page.evaluate((nextUser) => {
      window.__settingsPrivacyUser = nextUser;
      document.dispatchEvent(new CustomEvent('kc:authchange', {
        detail: { user: nextUser, session: { user: nextUser } },
      }));
    }, accountB);
    await expect(page.locator('#settingsUserSummary')).toContainText(accountB.email);
    await expect(downloadAction).toBeEnabled();

    await downloadAction.focus();
    await downloadAction.dispatchEvent('click');
    await expect.poll(
      () => page.evaluate((userId) => window.__accountDownloadCalls[userId] || 0, accountB.id),
    ).toBe(1);
    await expect(downloadAction).toBeDisabled();
    await expect(page.locator('#settingsClearBrowserPrivacyData')).toBeDisabled();

    await page.evaluate(() => {
      window.__resolveAccountA(window.__accountExportResult());
    });
    await page.waitForTimeout(75);
    await expect(page.locator('#settingsUserSummary')).toContainText(accountB.email);
    await expect(downloadAction).toBeDisabled();
    await expect(downloadAction).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#settingsClearBrowserPrivacyData')).toBeDisabled();
    await expect.poll(() => downloadCount).toBe(0);

    await page.evaluate(() => {
      window.__resolveAccountB(window.__accountExportResult());
    });
    await expect.poll(() => downloadCount).toBe(1);
    await expect(downloadAction).toBeEnabled();
    await expect.poll(() => page.evaluate(() => ({
      protocol: document.activeElement &&
        document.activeElement.dataset.privacyRequestProtocol,
      action: document.activeElement &&
        document.activeElement.dataset.privacyRequestAction,
    }))).toEqual({
      protocol,
      action: 'download_export',
    });
  });
});

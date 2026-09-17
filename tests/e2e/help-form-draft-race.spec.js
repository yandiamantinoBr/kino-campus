const { test, expect } = require('@playwright/test');

const ACCOUNT_ID = '44444444-4444-4444-8444-444444444444';
const EMAIL = 'draft-fixture@example.invalid';
const MESSAGE = 'Solicito a exclusão da conta após a verificação dos dados informados.';

// Execute the existing callbacks in a deterministic, valid ordering. There is
// no sleep/refill: the 400 ms restore runs while the 200 ms input save is pending.
async function prepareForm(page, baseURL, { authenticated = false } = {}) {
  const origin = new URL(baseURL).origin;
  await page.setViewportSize({ width: 360, height: 844 });
  await page.addInitScript(({ accountId, email, authenticated }) => {
    window.KC_ENV = { TURNSTILE_SITE_KEY: 'turnstile-public-test-site-key' };
    window.__draftFixtureUser = authenticated
      ? { id: accountId, email, is_anonymous: false }
      : null;
    window.__draftFixtureTimers = [];
    window.__draftFixtureWrites = [];
    const originalSetTimeout = window.setTimeout;
    const originalClearTimeout = window.clearTimeout;
    window.setTimeout = function (callback, delay, ...args) {
      const source = String(callback);
      const restore = Number(delay) === 400 && source.includes('restoreHelpFormDraft');
      const save = Number(delay) === 200 && source.includes('saveHelpFormDraft');
      if (!restore && !save) return originalSetTimeout.call(this, callback, delay, ...args);
      const entry = {
        id: 1000000 + window.__draftFixtureTimers.length,
        kind: restore ? 'restore' : 'save',
        callback,
        args,
        cancelled: false,
        done: false,
      };
      window.__draftFixtureTimers.push(entry);
      return entry.id;
    };
    window.clearTimeout = function (id) {
      const entry = window.__draftFixtureTimers.find((timer) => timer.id === id);
      if (entry) entry.cancelled = true;
      else originalClearTimeout.call(this, id);
    };
    window.__runDraftFixtureTimer = function (kind) {
      const entry = window.__draftFixtureTimers.find((timer) => (
        timer.kind === kind && !timer.cancelled && !timer.done
      ));
      if (!entry) throw new Error(`Missing pending draft ${kind} callback`);
      entry.done = true;
      entry.callback(...entry.args);
    };
  }, { accountId: ACCOUNT_ID, email: EMAIL, authenticated });

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['GET', 'HEAD'].includes(request.method())) {
      await page.evaluate((method) => window.__draftFixtureWrites.push(method), request.method());
      return route.abort();
    }
    if (url.hostname === 'cdn.jsdelivr.net') {
      return route.fulfill({ contentType: 'application/javascript', body: 'window.supabase = {};' });
    }
    if (url.hostname === 'challenges.cloudflare.com') {
      return route.fulfill({
        contentType: 'application/javascript',
        body: `window.__draftTurnstileResets = 0;
          window.turnstile = {
            render: function (target, options) {
              window.__draftTurnstileOptions = options;
              target.setAttribute('data-test-widget', 'ready');
              return 'draft-test-widget';
            },
            reset: function () { window.__draftTurnstileResets += 1; },
            remove: function () {}
          };`,
      });
    }
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/assets/js/api/kc-supabase.client.js') {
      return route.fulfill({
        contentType: 'application/javascript',
        body: `window.KCSupabase = {
          getUser: function () { return window.__draftFixtureUser; },
          getCurrentUser: async function () { return window.__draftFixtureUser; }
        };`,
      });
    }
    if (url.pathname === '/assets/js/api/kc-api.client.js') {
      return route.fulfill({
        contentType: 'application/javascript',
        body: `window.KCAPI = {
          ENV: { driver: 'supabase', DATA_DRIVER: 'supabase', isProduction: false },
          registerAdapter: function () {},
          getCurrentProfile: function () { return null; },
          getMyProfile: async function () { return null; },
          recoverPrivacyHelpRequest: async function () {
            return { ok: false, error: { idempotency: { safe_to_replace: false } } };
          },
          createHelpRequest: function (payload) {
            window.__draftFixturePayload = JSON.parse(JSON.stringify(payload));
            return new Promise(function (resolve) {
              window.__resolveDraftFixtureSubmit = function () {
                resolve({ ok: true, data: { id: '66666666-6666-4666-8666-666666666666' } });
              };
            });
          }
        };`,
      });
    }
    return route.continue();
  });

  await page.goto('/ajuda.html?request=account_erasure#helpRequestForm', {
    waitUntil: 'domcontentloaded',
  });
  await expect.poll(() => page.evaluate(() => window.__draftFixtureTimers.some(
    (timer) => timer.kind === 'restore' && !timer.done
  ))).toBe(true);
  if (!authenticated) {
    await expect(page.locator('#helpPrivacyTurnstileWidget')).toHaveAttribute('data-test-widget', 'ready');
    await page.evaluate(() => window.__draftTurnstileOptions.callback('fixture-one-time-proof'));
    await expect(page.locator('#helpPrivacyVerificationStatus')).toContainText('Verificação concluída');
  }
  // Mirrors a same-session refresh, which persists only the initial preset.
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('kc:authchange', {
    detail: { user: window.__draftFixtureUser },
  })));
  await expect(page.locator('#helpStatus')).toContainText('Central de ajuda atualizada');
}

async function fillRequest(page) {
  await page.locator('[data-help-conditional="account_email"]').fill(EMAIL);
  await page.locator('[data-help-conditional="export_before_erasure"]').selectOption('no_copy_needed');
  await page.locator('#helpContactEmail').fill(EMAIL);
  await page.locator('#helpMessage').fill(MESSAGE);
  await page.evaluate(() => {
    window.__draftOriginalAccountField = document.querySelector('[data-help-conditional="account_email"]');
    document.getElementById('helpMessage').setSelectionRange(7, 13);
  });
}

async function expectLiveRequest(page) {
  await expect(page.locator('[data-help-conditional="account_email"]')).toHaveValue(EMAIL);
  await expect(page.locator('[data-help-conditional="export_before_erasure"]')).toHaveValue('no_copy_needed');
  await expect(page.locator('#helpMessage')).toHaveValue(MESSAGE);
  await expect(page.locator('#helpContactEmail')).toHaveValue(EMAIL);
  expect(await page.evaluate(() => (
    window.__draftOriginalAccountField === document.querySelector('[data-help-conditional="account_email"]')
  ))).toBe(true);
}

test('late draft restore preserves pending guest input, focus and ephemeral proof', async ({ page, baseURL }) => {
  await prepareForm(page, baseURL);
  await fillRequest(page);
  await page.evaluate(() => window.__runDraftFixtureTimer('restore'));
  await expectLiveRequest(page);
  await expect(page.locator('#helpMessage')).toBeFocused();
  expect(await page.locator('#helpMessage').evaluate((element) => [element.selectionStart, element.selectionEnd])).toEqual([7, 13]);
  await expect(page.locator('#helpPrivacyVerificationStatus')).toContainText('Verificação concluída');
  await page.locator('#helpSubmitButton').click();
  await expect.poll(() => page.evaluate(() => window.__draftFixturePayload || null)).toMatchObject({
    expected_auth_state: 'anonymous',
    message: MESSAGE,
    turnstile_token: 'fixture-one-time-proof',
    metadata: { account_email: EMAIL, export_before_erasure: 'no_copy_needed' },
  });
  expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain('fixture-one-time-proof');
  expect(await page.evaluate(() => window.__draftFixtureWrites)).toEqual([]);
});

test('late draft restore preserves pending edits even when storage writes fail', async ({ page, baseURL }) => {
  await prepareForm(page, baseURL);
  await fillRequest(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'kc_help_form_draft_v1') throw new DOMException('Fixture quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
    window.__runDraftFixtureTimer('restore');
  });
  await expectLiveRequest(page);
  expect(await page.evaluate(() => window.__draftFixtureWrites)).toEqual([]);
});

test('late restore cannot rebuild an active submit after its save timer has fired', async ({ page, baseURL }) => {
  await prepareForm(page, baseURL, { authenticated: true });
  await fillRequest(page);
  await page.locator('#helpSubmitButton').click();
  await expect(page.locator('#helpRequestForm')).toHaveAttribute('aria-busy', 'true');
  await expect.poll(() => page.evaluate(() => Boolean(window.__resolveDraftFixtureSubmit))).toBe(true);
  await page.evaluate(() => {
    window.__runDraftFixtureTimer('save');
    window.__runDraftFixtureTimer('restore');
  });
  await expectLiveRequest(page);
  await expect(page.locator('#helpSubmitButton')).toBeDisabled();
  await expect(page.locator('#helpRequestForm')).toHaveAttribute('aria-busy', 'true');
  await page.evaluate(() => window.__resolveDraftFixtureSubmit());
  await expect(page.locator('#helpProtocolValue')).toHaveText('66666666-6666-4666-8666-666666666666');
  await expect(page.locator('#helpSubmitButton')).toBeEnabled();
  expect(await page.evaluate(() => window.__draftFixtureWrites)).toEqual([]);
});

test('late restore still restores a compatible saved draft without pending edits', async ({ page, baseURL }) => {
  await prepareForm(page, baseURL);
  await page.evaluate(({ email, message }) => {
    const draft = JSON.parse(sessionStorage.getItem('kc_help_form_draft_v1'));
    draft.message = message;
    draft.contact_email = email;
    draft.conditional.account_email = email;
    draft.conditional.export_before_erasure = 'no_copy_needed';
    sessionStorage.setItem('kc_help_form_draft_v1', JSON.stringify(draft));
    window.__runDraftFixtureTimer('restore');
  }, { email: EMAIL, message: MESSAGE });
  await expect(page.locator('[data-help-conditional="account_email"]')).toHaveValue(EMAIL);
  await expect(page.locator('[data-help-conditional="export_before_erasure"]')).toHaveValue('no_copy_needed');
  await expect(page.locator('#helpMessage')).toHaveValue(MESSAGE);
  await expect(page.locator('#helpContactEmail')).toHaveValue(EMAIL);
  expect(await page.evaluate(() => window.__draftFixtureWrites)).toEqual([]);
});

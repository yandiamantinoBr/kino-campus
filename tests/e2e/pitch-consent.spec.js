const { test, expect } = require('@playwright/test');

const csp = require('../../vercel.json').headers.flatMap((entry) => entry.headers)
  .find((header) => header.key === 'Content-Security-Policy').value;
const liveOrigin = 'https://kino-campus-pitch.vercel.app';
const hostPath = '/apresentacao-institucional.html?read=15-interativo#read-contexto';

async function openPitch(page, stored) {
  const telemetry = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript((stored) => {
    if (stored !== null) {
      localStorage.setItem('kc_consent_v1', stored === 'invalid' ? '{invalid' : JSON.stringify({
        version: '2026-06-05', necessary: true, preferences: false,
        analytics: stored, advertising: false, updatedAt: '2026-08-31T00:00:00Z', source: 'test',
      }));
    }
  }, stored);
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (/^\/_vercel\/(?:insights|speed-insights)\//.test(url.pathname) ||
        /va\.vercel-scripts\.com|googletagmanager|google-analytics|googlesyndication|doubleclick/.test(url.hostname)) {
      telemetry.push({ path: url.pathname, host: url.hostname });
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* telemetry test double: never sends data */' });
    }
    if (url.origin === liveOrigin) {
      // A deterministic cross-origin frame verifies host navigation, dimensions
      // and read controls without collecting analytics or posting production data.
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="pt-BR"><body><h1>Apresentação de teste</h1><button id="next" type="button">Próximo</button><p id="slide">1</p><script>document.querySelector("#next").addEventListener("click",function(){document.querySelector("#slide").textContent="2";});</script></body></html>' });
    }
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      if (request.isNavigationRequest() && url.pathname === '/apresentacao-institucional.html') {
        const response = await route.fetch();
        return route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
      }
      return route.continue();
    }
    return route.abort('blockedbyclient');
  });
  await page.goto(hostPath);
  await expect(page.locator('body')).toHaveClass(/is-pitch-ready/);
  await expect(page.locator('#kc-main')).toBeVisible();
  await expect(page.locator('#kc-pitch-frame')).toHaveAttribute('src', liveOrigin + '?read=15-interativo#read-contexto');
  const box = await page.locator('#kc-pitch-frame').boundingBox();
  expect(box.width).toBeGreaterThan(300);
  expect(box.height).toBeGreaterThan(300);
  return { telemetry, errors, box };
}

async function expectTelemetryOnce(page, telemetry) {
  await expect.poll(() => telemetry.filter((request) => request.path === '/_vercel/insights/script.js').length).toBe(1);
  await expect.poll(() => telemetry.filter((request) => /speed-insights\/script/.test(request.path)).length).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('kc:consentchange', { detail: { preferences: { analytics: true } } })));
  expect(telemetry.filter((request) => request.path === '/_vercel/insights/script.js')).toHaveLength(1);
  expect(telemetry.filter((request) => /speed-insights\/script/.test(request.path))).toHaveLength(1);
}

test('fresh pitch loads no telemetry before choice, rejection preserves host/frame controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await openPitch(page, null);
  await expect(page.locator('#kcConsentBanner')).toBeVisible();
  expect(fixture.telemetry).toEqual([]);
  await page.locator('#kcConsentBanner [data-consent-reject]').click();
  await expect(page.locator('#kcConsentBanner')).toBeHidden();
  expect(fixture.telemetry).toEqual([]);
  expect(await page.locator('#kc-pitch-frame').boundingBox()).toEqual(fixture.box);
  await page.frameLocator('#kc-pitch-frame').locator('#next').click();
  await expect(page.frameLocator('#kc-pitch-frame').locator('#slide')).toHaveText('2');
  await expect(page.locator('[data-kc-pitch-direct]').first()).toHaveAttribute('href', liveOrigin + '?read=15-interativo#read-contexto');
  await expect(page.locator('[data-kc-pitch-direct]').first()).toHaveAttribute('target', '_blank');
  await expect(page.locator('[data-kc-pitch-fullscreen]')).toBeEnabled();
  expect(fixture.errors).toEqual([]);
});

test('accepting analytics loads shared telemetry once without changing frame geometry', async ({ page }) => {
  const fixture = await openPitch(page, null);
  expect(fixture.telemetry).toEqual([]);
  await page.locator('#kcConsentBanner [data-consent-accept]').click();
  await expectTelemetryOnce(page, fixture.telemetry);
  expect(await page.locator('#kc-pitch-frame').boundingBox()).toEqual(fixture.box);
  expect(fixture.errors).toEqual([]);
});

test('stored analytics consent enables the existing shared boot once', async ({ page }) => {
  const fixture = await openPitch(page, true);
  await expect(page.locator('#kcConsentBanner')).toBeHidden();
  await expectTelemetryOnce(page, fixture.telemetry);
  expect(fixture.errors).toEqual([]);
});

for (const stored of [false, 'invalid']) {
  test(`stored ${stored === false ? 'denial' : 'invalid consent'} never starts telemetry`, async ({ page }) => {
    const fixture = await openPitch(page, stored);
    expect(fixture.telemetry).toEqual([]);
    expect(await page.evaluate(() => window.KCConsent.hasConsent('analytics'))).toBe(false);
    expect(fixture.errors).toEqual([]);
  });
}

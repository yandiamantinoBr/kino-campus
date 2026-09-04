const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const root = path.join(__dirname, '../..');
const vercel = require('../../vercel.json');
const csp = vercel.headers.flatMap((entry) => entry.headers).find((header) => header.key === 'Content-Security-Policy').value;
const origin = 'https://ranking-fixture.supabase.co';
const original = origin + '/storage/v1/object/public/kino-media/profile-avatars/fixture/avatar.png';
// 2026-09-04: thumbnails passam por /api/media (sharp na Vercel) em vez de
// /render/image — URL relativa ao site sob teste.
const thumbnail = '/api/media?path=' + encodeURIComponent('kino-media/profile-avatars/fixture/avatar.png') + '&w=144&h=144&fit=cover&q=80';
const users = [{ user_id: 'avatar-fixture', display_name: 'Ana Campus', avatar_url: original, score: 42 }];

test.use({ deviceScaleFactor: 3 });

async function mountRanking(page, { pagePath = 'index.html', optimized = true, failThumbnail = false, failOriginal = false, theme = 'dark' } = {}) {
  // A deterministic raster fixture lets us compare the exact same rendered
  // pixels/layout. No production profiles or Storage objects are written.
  const imageBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 144;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ff6b00';
    context.fillRect(0, 0, 144, 144);
    context.fillStyle = '#ffffff';
    context.fillRect(48, 24, 48, 48);
    context.fillRect(24, 88, 96, 56);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const image = Buffer.from(imageBase64, 'base64');
  const imageRequests = [];
  await page.addInitScript(() => {
    window.__rankingCspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__rankingCspViolations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
    });
  });
  const html = fs.readFileSync(path.join(root, pagePath), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  await page.route('**/ranking-avatar-fixture', (route) => route.fulfill({
    contentType: 'text/html',
    headers: { 'Content-Security-Policy': csp },
    body: html,
  }));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) {
      imageRequests.push(url.href);
      const failed = url.href === original && failOriginal;
      await route.fulfill(failed
        ? { status: 503, contentType: 'text/plain', body: 'controlled image failure' }
        : { status: 200, contentType: 'image/png', body: image });
    } else if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      if (url.pathname === '/api/media') {
        const mediaUrl = url.pathname + url.search;
        imageRequests.push(mediaUrl);
        const failed = mediaUrl === thumbnail && failThumbnail;
        await route.fulfill(failed
          ? { status: 503, contentType: 'text/plain', body: 'controlled image failure' }
          : { status: 200, contentType: 'image/png', body: image });
        return;
      }
      await route.fallback();
    } else {
      await route.abort('blockedbyclient');
    }
  });
  await page.goto('/ranking-avatar-fixture');
  await page.evaluate(({ optimized, origin, users, theme }) => {
    document.documentElement.setAttribute('data-theme', theme);
    window.KC_ENV = optimized ? { SUPABASE_URL: origin } : {};
    window.__rankingUsers = Object.freeze(users.map((user) => Object.freeze(user)));
    window.KCAPI = { getTopContributors: () => Promise.resolve(window.__rankingUsers) };
  }, { optimized, origin, users, theme });
  await page.addScriptTag({ url: '/assets/js/features/kc-ranking.js' });
  const isHome = pagePath === 'index.html';
  const selector = isHome ? '[data-kc-ranking-container]' : '.kc-ranking-sidebar-users';
  await page.evaluate(({ selector, isHome }) => {
    window.KCRanking[isHome ? 'renderHomeRanking' : 'renderSidebarRanking'](
      document.querySelector(selector), window.__rankingUsers, isHome ? null : 'oportunidades'
    );
  }, { selector, isHome });
  const container = page.locator(selector);
  await container.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  return { container, image: container.locator('img'), imageRequests, selector, isHome };
}

for (const configuration of [
  { pagePath: 'index.html', width: 390 },
  { pagePath: 'index.html', width: 1280 },
  { pagePath: 'oportunidades.html', width: 1280 },
]) {
  for (const theme of ['light', 'dark']) {
    test(`keeps ${configuration.pagePath} pixels/layout at ${configuration.width}px DPR3 ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: configuration.width, height: 844 });
      const fixture = await mountRanking(page, { ...configuration, optimized: false, theme });
      await expect.poll(() => fixture.image.evaluate((image) => image.complete && image.naturalWidth)).toBe(144);
      const before = await fixture.image.boundingBox();
      const beforePixels = await fixture.container.screenshot({ animations: 'disabled' });
      await page.evaluate(({ origin, selector, isHome }) => {
        window.KC_ENV = { SUPABASE_URL: origin };
        const container = document.querySelector(selector);
        delete container.dataset.kcRankingSignature;
        window.KCRanking[isHome ? 'renderHomeRanking' : 'renderSidebarRanking'](
          container, window.__rankingUsers, isHome ? null : 'oportunidades'
        );
      }, { origin, selector: fixture.selector, isHome: fixture.isHome });
      await expect(fixture.image).toHaveAttribute('src', thumbnail);
      await expect.poll(() => fixture.image.evaluate((image) => image.complete && image.naturalWidth)).toBe(144);
      expect(await fixture.image.boundingBox()).toEqual(before);
      expect(before.width).toBeLessThanOrEqual(44);
      expect(before.height).toBeLessThanOrEqual(44);
      expect(await fixture.image.evaluate((image) => image.naturalWidth >= image.getBoundingClientRect().width * devicePixelRatio)).toBe(true);
      expect((await fixture.container.screenshot({ animations: 'disabled' })).equals(beforePixels)).toBe(true);
      await expect(fixture.container.locator('a').first()).toHaveAttribute('href', 'profile.html?id=avatar-fixture');
      await expect(fixture.container).toContainText('Ana Campus');
      await expect(fixture.container).toContainText('42 pts');
      await expect(fixture.container.locator('[onerror]')).toHaveCount(0);
      expect(await page.evaluate(() => window.__rankingUsers[0].avatar_url)).toBe(original);
      expect(await page.evaluate(() => window.__rankingCspViolations)).toEqual([]);
      expect(fixture.imageRequests.filter((url) => url === thumbnail)).toHaveLength(1);
    });
  }
}

for (const pagePath of ['index.html', 'oportunidades.html']) {
  for (const failOriginal of [false, true]) {
    test(`${pagePath} falls back once under CSP when thumbnail fails (original fails: ${failOriginal})`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 844 });
      const fixture = await mountRanking(page, { pagePath, failThumbnail: true, failOriginal });
      await expect(fixture.image).toHaveAttribute('src', original);
      await expect.poll(() => fixture.image.evaluate((image) => image.complete)).toBe(true);
      expect(await fixture.image.evaluate((image) => image.naturalWidth)).toBe(failOriginal ? 0 : 144);
      await expect(fixture.image).not.toHaveAttribute('data-kc-ranking-avatar-original', original);
      // A second error must not restart either request or reset a newer src.
      await fixture.image.evaluate((image) => image.dispatchEvent(new Event('error')));
      await expect(fixture.image).toHaveAttribute('src', original);
      expect(fixture.imageRequests.filter((url) => url === thumbnail)).toHaveLength(1);
      expect(fixture.imageRequests.filter((url) => url === original)).toHaveLength(1);
      expect(await page.evaluate(() => window.__rankingCspViolations)).toEqual([]);
    });
  }
}

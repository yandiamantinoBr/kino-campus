const { test, expect } = require('@playwright/test');

// Use the real home markup/CSS and feed controller, with a deliberately
// pending data source. This makes slow/empty/error/retry states deterministic
// without writing posts, requiring credentials, or changing production data.
async function mountPendingHome(page, request) {
  const response = await request.get('/');
  const html = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  await page.route('**/loading-stability-fixture', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => document.documentElement.setAttribute('data-theme', 'light'));
    window.__feedRequests = [];
    window.KCAPI = {
      ENV: { driver: 'local' },
      getFeedCursor: () => new Promise((resolve, reject) => window.__feedRequests.push({ resolve, reject })),
      normalizePost: post => post,
    };
    window.KCUtils = {
      renderPostCard: post => `<article class="kc-card" data-post-id="${post.id}"><h2>Publicação de teste</h2></article>`,
    };
  });
  await page.goto('/loading-stability-fixture');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const initial = page.locator('#kc-feed-destaques');
  await expect(initial).toHaveAttribute('data-kc-feed-state', 'loading');
  await expect(initial).toHaveAttribute('aria-busy', 'true');
  await page.addScriptTag({ url: '/assets/js/controllers/public/kc-feed.controller.js' });
  await page.evaluate(() => {
    window.__feedPager = window.KCControllers.createFeedPager({ containerSelector: '#kc-feed-destaques', realtime: false });
  });
  await expect.poll(() => page.evaluate(() => window.__feedRequests.length)).toBe(1);
  return initial;
}

for (const width of [320, 390, 768, 1280]) {
  test(`feed pending reserves space and releases terminal states at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 844 });
    const feed = await mountPendingHome(page, request);
    await expect(feed).toHaveCSS('min-height', '844px');
    expect((await page.locator('.kc-feed-guide').boundingBox()).y).toBeGreaterThan(844);
    // The reserve survives the end of the unrelated anti-FOUC boot class.
    await page.evaluate(() => document.documentElement.classList.remove('kc-loading'));
    await expect(feed).toHaveCSS('min-height', '844px');
    // A real terminal empty result must not leave a viewport of blank space.
    await page.evaluate(() => window.__feedRequests.shift().resolve({ ok: true, posts: [], hasMore: false, nextCursor: null }));
    await expect(feed).toHaveAttribute('data-kc-feed-state', 'done');
    await expect(feed).toHaveAttribute('aria-busy', 'false');
    await expect(feed.locator('[data-kc-feed-empty]')).toBeVisible();
    await expect(feed).not.toHaveCSS('min-height', '844px');
    // A new filter/refresh starts another pending request, then surfaces errors.
    await page.evaluate(() => { window.__feedPager.refresh({ q: 'retry-fixture' }); });
    await expect(feed).toHaveAttribute('data-kc-feed-state', 'loading');
    await expect(feed).toHaveCSS('min-height', '844px');
    await page.evaluate(() => window.__feedRequests.shift().reject(new Error('controlled network failure')));
    await expect(feed).toHaveAttribute('data-kc-feed-state', 'error');
    await expect(feed).toHaveAttribute('aria-busy', 'false');
    await expect(feed).not.toHaveCSS('min-height', '844px');
    await expect(page.getByRole('button', { name: 'Tentar novamente', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await expect(feed).toHaveCSS('min-height', '844px');
    await page.evaluate(() => window.__feedRequests.shift().resolve({ ok: true, posts: [{ id: 'fixture-post', status: 'published' }], hasMore: true, nextCursor: 'next' }));
    await expect(feed.locator('.kc-card')).toHaveCount(1);
    await expect(feed).not.toHaveCSS('min-height', '844px');
    // Pagination must keep existing cards in place, without reapplying a reserve.
    await feed.locator('.kc-card').evaluate(async card => {
      const animations = new Set();
      for (let element = card; element; element = element.parentElement) {
        element.getAnimations().forEach(animation => {
          if (Number.isFinite(animation.effect.getComputedTiming().endTime)) animations.add(animation);
        });
      }
      await Promise.all([...animations].map(animation => animation.finished.catch(() => {})));
    });
    const layoutBox = card => {
      const box = card.getBoundingClientRect();
      const feedBox = card.closest('.kc-feed-list').getBoundingClientRect();
      const precision = value => Math.round(value * 1000) / 1000;
      return {
        top: precision(box.top + window.scrollY),
        left: precision(box.left + window.scrollX),
        relativeTop: precision(box.top - feedBox.top),
        relativeLeft: precision(box.left - feedBox.left),
        width: precision(box.width),
        height: precision(box.height),
      };
    };
    const before = await feed.locator('.kc-card').evaluate(layoutBox);
    await page.evaluate(() => { window.__feedPager.loadNextPage(); });
    await expect(feed).toHaveAttribute('data-kc-feed-state', 'loading');
    await expect(feed).not.toHaveCSS('min-height', '844px');
    // The feed's entrance transform temporarily makes it the offsetParent.
    // After it finishes, offsetTop/Left switch reference to body without any
    // layout shift. Compare document AND feed-relative geometry instead;
    // document coordinates also cancel the retry button's smooth scrolling.
    expect(await feed.locator('.kc-card').evaluate(layoutBox)).toEqual(before);
    await page.evaluate(() => window.__feedRequests.shift().resolve({ ok: true, posts: [], hasMore: false, nextCursor: null }));
    await expect(feed).toHaveAttribute('data-kc-feed-state', 'done');
    await page.evaluate(() => window.__feedPager.destroy());
  });
}

test('pending reserve is home-only and not applied without JavaScript boot', async ({ page, request }) => {
  const feed = await mountPendingHome(page, request);
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await expect(feed).not.toHaveCSS('min-height', '720px');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    document.querySelector('main').classList.remove('kc-main-content--home');
  });
  await expect(feed).not.toHaveCSS('min-height', '720px');
  await page.evaluate(() => window.__feedPager.destroy());
});

test('critical icon font preload matches the compact stylesheet request without duplication', async ({ page }) => {
  await page.goto('/');
  const preload = page.locator('link[rel="preload"][as="font"]');
  await expect(preload).toHaveCount(1);
  await expect(preload).toHaveAttribute('type', 'font/woff2');
  await expect(preload).toHaveAttribute('crossorigin', '');
  const icons = require('../../assets/fonts/kc-ui-icons/manifest.json');
  await expect(preload).toHaveAttribute('href', 'assets/fonts/kc-ui-icons/' + icons.subsetFile);
  await page.evaluate(() => document.fonts.ready);
  const requests = await page.evaluate(file => performance.getEntriesByType('resource').filter(entry => entry.name.includes('/fonts/kc-ui-icons/' + file)).map(entry => entry.name), icons.subsetFile);
  expect(requests).toHaveLength(1);
});

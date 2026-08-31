const { test, expect } = require('@playwright/test');

const csp = require('../../vercel.json').headers.flatMap((entry) => entry.headers)
  .find((header) => header.key === 'Content-Security-Policy').value;
const listSelector = '[data-kc-ranking-container]';
const fixturePath = '/home-ranking-loading-fixture';

function fixtureUsers(count) {
  return Array.from({ length: count }, (_, index) => ({
    user_id: `ranking-layout-${index + 1}`,
    display_name: `Pessoa Campus ${index + 1}`,
    avatar_url: '/assets/favicon.svg',
    score: 1234 - index,
  }));
}

async function mountRanking(page, { width = 412, fontScale = 100, theme = 'dark', noScript = false } = {}) {
  await page.setViewportSize({ width, height: 1000 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort('blockedbyclient');
    if (url.pathname === fixturePath) {
      // Use the served HTML/CSS (including a production artifact when selected),
      // not a copied mock. Isolate ranking from unrelated asynchronous panels.
      const response = await route.fetch({ url: new URL('/index.html', url.origin).href });
      const html = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
      return route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp }, body: html });
    }
    return route.continue();
  });
  await page.goto(fixturePath);
  if (!noScript) {
    await page.evaluate(({ fontScale, theme }) => {
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.fontSize = `${fontScale}%`;
      window.__rankingPending = [];
      window.__rankingRequestCount = 0;
      window.KCAPI = {
        getTopContributors: () => {
          window.__rankingRequestCount += 1;
          return new Promise((resolve, reject) => window.__rankingPending.push({ resolve, reject }));
        },
      };
      window.__rankingCspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__rankingCspViolations.push(event.effectiveDirective);
      });
    }, { fontScale, theme });
    await page.addScriptTag({ url: '/assets/js/features/kc-ranking.js' });
  }
  if (!noScript) await settleRanking(page);
  return { errors };
}

async function settleRanking(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const elements = new Set();
    for (const root of document.querySelectorAll('.kc-ranking-banner, .kc-feed-toolbar')) {
      for (let node = root; node; node = node.parentElement) elements.add(node);
      root.querySelectorAll('*').forEach((node) => elements.add(node));
    }
    const finite = [...elements].flatMap((node) => node.getAnimations()).filter((animation) => {
      const timing = animation.effect && animation.effect.getComputedTiming();
      return timing && Number.isFinite(timing.endTime);
    });
    await Promise.all(finite.map((animation) => animation.finished.catch(() => {})));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function geometry(page) {
  await settleRanking(page);
  return page.evaluate((selector) => {
    const list = document.querySelector(selector);
    const banner = list.closest('.kc-ranking-banner');
    const toolbar = document.querySelector('.kc-feed-toolbar');
    const row = list.getBoundingClientRect();
    const parent = banner.getBoundingClientRect();
    const following = toolbar.getBoundingClientRect();
    return {
      rowHeight: row.height,
      bannerHeight: parent.height,
      rowTopFromBanner: row.top - parent.top,
      toolbarTopFromBanner: following.top - parent.top,
      bannerDocumentTop: parent.top + scrollY,
      toolbarDocumentTop: following.top + scrollY,
      minHeight: getComputedStyle(list).minHeight,
    };
  }, listSelector);
}

async function startLoad(page, period = 'month') {
  await page.evaluate(({ selector, period }) => {
    window.__rankingLoad = window.KCRanking.loadHomeRanking(document.querySelector(selector), period, null);
  }, { selector: listSelector, period });
}

async function finishLoad(page, users, reject = false) {
  await page.evaluate(async ({ users, reject }) => {
    const pending = window.__rankingPending.shift();
    if (!pending) throw new Error('Expected a pending real ranking-loader request');
    if (reject) pending.reject(new Error('controlled ranking failure'));
    else pending.resolve(users);
    await window.__rankingLoad;
  }, { users, reject });
  await settleRanking(page);
}

function expectStable(before, after) {
  // Document AND ancestor-relative positions avoid offsetParent/animation and
  // scroll-anchoring false positives while still detecting actual feed shifts.
  for (const key of ['rowHeight', 'bannerHeight', 'toolbarTopFromBanner', 'bannerDocumentTop', 'toolbarDocumentTop']) {
    expect(Math.abs(after[key] - before[key]), `${key}: ${before[key]} -> ${after[key]}`).toBeLessThanOrEqual(1);
  }
}

async function expectUnreservedFinal(page) {
  const natural = await geometry(page);
  expect(natural.minHeight).toBe('0px');
  await setPendingReservation(page, false);
  expect(await geometry(page)).toEqual(natural);
  await setPendingReservation(page, true);
}

async function setPendingReservation(page, enabled) {
  await page.evaluate((enabled) => {
    if (enabled) {
      for (const entry of window.__rankingReservationRules || []) {
        entry.style.setProperty('min-height', entry.value, entry.priority);
      }
      window.__rankingReservationRules = [];
      return;
    }
    window.__rankingReservationRules = [];
    function visit(rules) {
      for (const rule of rules) {
        if (rule.selectorText && rule.selectorText.includes('.kc-ranking-users') && rule.selectorText.includes(':empty')) {
          window.__rankingReservationRules.push({
            style: rule.style,
            value: rule.style.getPropertyValue('min-height'),
            priority: rule.style.getPropertyPriority('min-height'),
          });
          rule.style.setProperty('min-height', '0px', 'important');
        }
        if (rule.cssRules) visit(rule.cssRules);
      }
    }
    for (const sheet of document.styleSheets) visit(sheet.cssRules);
  }, enabled);
}

for (const width of [320, 360, 390, 412, 520]) {
  for (const fontScale of [100, 125, 150]) {
    test(`pending ranking reserves its row at ${width}px and font ${fontScale}%`, async ({ page }, testInfo) => {
      const fixture = await mountRanking(page, { width, fontScale });
      await setPendingReservation(page, false);
      const baselineEmpty = await geometry(page);
      await setPendingReservation(page, true);
      const empty = await geometry(page);
      await startLoad(page);
      await expect(page.locator(`${listSelector} [role="status"]`)).toHaveCount(1);
      const loading = await geometry(page);
      await setPendingReservation(page, false);
      const baselineLoading = await geometry(page);
      await setPendingReservation(page, true);
      await finishLoad(page, fixtureUsers(10));
      await expect(page.locator(`${listSelector} .kc-ranking-user`)).toHaveCount(10);
      const ready = await geometry(page);
      const extraScoreLineHeight = await page.locator(`${listSelector} .kc-ranking-user-score`).evaluateAll((scores) => Math.max(
        0, ...scores.map((score) => score.getBoundingClientRect().height - parseFloat(getComputedStyle(score).lineHeight)),
      ));
      await testInfo.attach('ranking-layout-states', {
        body: JSON.stringify({ baselineEmpty, baselineLoading, empty, loading, ready, extraScoreLineHeight }),
        contentType: 'application/json',
      });
      expectStable(empty, loading);
      // Large font settings can wrap an unknown score onto another line. Keep
      // that existing accessible layout, eliminate the earlier spinner shift,
      // and allow only the actual additional score line after data arrives.
      for (const key of ['rowHeight', 'bannerHeight', 'toolbarTopFromBanner', 'toolbarDocumentTop']) {
        expect(Math.abs(ready[key] - loading[key] - extraScoreLineHeight), key).toBeLessThanOrEqual(1);
        const improvedTravel = Math.abs(loading[key] - empty[key]) + Math.abs(ready[key] - loading[key]);
        const baselineTravel = Math.abs(baselineLoading[key] - baselineEmpty[key]) + Math.abs(ready[key] - baselineLoading[key]);
        expect(improvedTravel, `${key}: reservation must not increase total movement`).toBeLessThanOrEqual(baselineTravel + 1);
      }
      expect(Math.abs(ready.bannerDocumentTop - loading.bannerDocumentTop)).toBeLessThanOrEqual(1);
      if (extraScoreLineHeight < 1) expectStable(loading, ready);
      expect(fixture.errors).toEqual([]);
      expect(await page.evaluate(() => window.__rankingCspViolations)).toEqual([]);
      await expectUnreservedFinal(page);
    });
  }
}

for (const width of [320, 412, 520, 768, 1280]) {
  test(`ready one-user and ten-user layouts stay natural at ${width}px`, async ({ page }) => {
    await mountRanking(page, { width, theme: 'light' });
    await startLoad(page);
    await finishLoad(page, fixtureUsers(1));
    const one = await geometry(page);
    await expectUnreservedFinal(page);
    await page.evaluate((users) => {
      window.KCRanking.renderHomeRanking(document.querySelector('[data-kc-ranking-container]'), users, null);
    }, fixtureUsers(10));
    const ten = await geometry(page);
    expectStable(one, ten);
    await expectUnreservedFinal(page);
  });
}

for (const terminal of ['empty', 'error', 'unavailable']) {
  test(`terminal ${terminal} releases reserved space and supports a later retry`, async ({ page }) => {
    await mountRanking(page);
    const pending = await geometry(page);
    if (terminal === 'unavailable') {
      await page.evaluate(() => { delete window.KCAPI; });
      await startLoad(page);
      await expect(page.locator(listSelector)).toContainText('Indisponivel.');
    } else {
      await startLoad(page);
      await finishLoad(page, [], terminal === 'error');
      await expect(page.locator(listSelector)).toContainText(terminal === 'empty' ? 'Nenhum contribuidor' : 'Erro ao carregar ranking.');
    }
    const done = await geometry(page);
    expect(done.minHeight).toBe('0px');
    expect(done.rowHeight).toBeLessThan(pending.rowHeight);
    await page.evaluate(() => {
      window.KCAPI = { getTopContributors: () => new Promise((resolve, reject) => window.__rankingPending.push({ resolve, reject })) };
    });
    await startLoad(page, 'week');
    const retry = await geometry(page);
    await finishLoad(page, fixtureUsers(1));
    expectStable(retry, await geometry(page));
    await expectUnreservedFinal(page);
  });
}

test('fresh cached ranking paints immediately without a pending request or retained reserve', async ({ page }) => {
  await mountRanking(page);
  await startLoad(page);
  await finishLoad(page, fixtureUsers(10));
  const before = await geometry(page);
  await startLoad(page);
  expect(await page.evaluate(() => window.__rankingRequestCount)).toBe(1);
  await expect(page.locator(`${listSelector} [role="status"]`)).toHaveCount(0);
  expectStable(before, await geometry(page));
  await expectUnreservedFinal(page);
});

test('no-JavaScript HTML retains its existing compact empty ranking', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport: { width: 412, height: 1000 } });
  try {
    const page = await context.newPage();
    await mountRanking(page, { noScript: true });
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    await expect(page.locator(listSelector)).toBeEmpty();
    expect(await page.locator(listSelector).evaluate((list) => getComputedStyle(list).minHeight)).toBe('0px');
  } finally {
    await context.close();
  }
});

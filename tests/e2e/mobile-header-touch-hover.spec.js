const { test, expect } = require('@playwright/test');

async function settleHeader(page) {
  await expect(page.locator('html')).not.toHaveClass(/kc-loading/);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.kc-header').evaluate(async header => {
    const finite = header.getAnimations({ subtree: true }).filter(animation => Number.isFinite(animation.effect.getComputedTiming().endTime));
    await Promise.all(finite.map(animation => animation.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function prepare(page, baseURL, authenticated) {
  const origin = new URL(baseURL).origin;
  await page.route('**/*', route => {
    const request = route.request();
    // This is a layout/interaction fixture, never a real account or write.
    if (!['GET', 'HEAD'].includes(request.method()) || new URL(request.url()).origin !== origin) return route.abort();
    return route.continue();
  });
  await page.addInitScript(() => localStorage.setItem('kc_consent_v1', JSON.stringify({ version: '2026-06-05', necessary: true, preferences: false, analytics: false, advertising: false, updatedAt: new Date().toISOString() })));
  await page.goto('/', { waitUntil: 'load' });
  await settleHeader(page);
  if (authenticated) {
    // Same public-header layout fixture used by the existing touch-target
    // suite. It does not create a session or change any persisted user data.
    await page.locator('.kc-header .btn-login').evaluate(element => {
      element.classList.add('is-auth');
      element.innerHTML = '<span class="kc-header-user"><span class="kc-header-user__avatar">Y</span><span class="kc-header-user__name">Perfil de teste</span><i class="fas fa-check-circle kc-header-user__verified" aria-label="Verificado"></i><i class="fas fa-chevron-down kc-header-user__chevron" aria-hidden="true"></i></span>';
      document.getElementById('kcNotifBell').style.display = 'inline-flex';
      document.dispatchEvent(new CustomEvent('kc:profilechange'));
    });
    await settleHeader(page);
  }
}

async function captureTargets(page, points) {
  return page.locator('.kc-header').evaluate((header, savedPoints) => {
    const controls = [...header.querySelectorAll('.kc-search-mobile-btn, .kc-user-actions > *')].filter(element => element.getClientRects().length);
    const boxes = controls.map(element => {
      const r = element.getBoundingClientRect();
      return { name: element.className, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    });
    const probes = savedPoints || boxes.flatMap(box => [
      [box.left + box.width / 2, box.top + 1],
      [box.left + box.width / 2, box.bottom - 1],
      [box.left + 1, box.top + box.height / 2],
      [box.right - 1, box.top + box.height / 2],
    ].map(([x, y]) => ({ x, y, expected: box.name })));
    const theme = header.querySelector('.theme-toggle');
    return {
      boxes,
      probes: probes.map(point => ({ ...point, actual: document.elementFromPoint(point.x, point.y)?.closest('.kc-search-mobile-btn, .kc-user-actions > *')?.className || null })),
      themeTransform: getComputedStyle(theme).transform,
      stickyHover: theme.matches(':hover'),
      media: { hover: matchMedia('(hover: hover)').matches, fine: matchMedia('(pointer: fine)').matches, touch: navigator.maxTouchPoints },
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      height: header.offsetHeight,
    };
  }, points || null);
}

test.describe('mobile touch hover does not steal adjacent targets', () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 412, height: 844 } });

  for (const width of [384, 412, 430]) for (const authenticated of [false, true]) {
    test(`${width}px ${authenticated ? 'authenticated layout fixture' : 'guest'} retains hit targets after a theme tap`, async ({ page, baseURL }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await prepare(page, baseURL, authenticated);
      const before = await captureTargets(page);
      expect(before.media).toEqual({ hover: false, fine: false, touch: 1 });
      expect(before.probes.filter(point => point.actual !== point.expected)).toEqual([]);
      const previousTheme = await page.locator('html').getAttribute('data-theme');
      await page.locator('.kc-header .theme-toggle').tap();
      await expect(page.locator('html')).toHaveAttribute('data-theme', previousTheme === 'light' ? 'dark' : 'light');
      await settleHeader(page);
      // Do not move a mouse or tap elsewhere: Chromium keeps :hover after the
      // touch. Compare the exact pre-tap target coordinates, not new DOMRects.
      const after = await captureTargets(page, before.probes.map(({ x, y, expected }) => ({ x, y, expected })));
      await testInfo.attach('touch-hover-hit-targets', { body: JSON.stringify({ width, authenticated, before, after }, null, 2), contentType: 'application/json' });
      expect(after.probes.filter(point => point.actual !== point.expected)).toEqual([]);
      expect(after.themeTransform).toBe('none');
      expect(after.boxes).toEqual(before.boxes);
      expect(after.overflow).toBe(false);
      expect(after.height).toBeLessThanOrEqual(64);
      const chatBox = before.boxes.find(box => box.name.includes('kc-chat-shortcut'));
      expect(chatBox).toBeTruthy();
      // The strict DOM hit checks above retain the 1px edge. Chromium's touch
      // adjustment can retarget a 1px-edge gesture even when elementFromPoint
      // is correct; verify actual navigation 4px inside, without moving the
      // pointer or clearing the theme button's sticky hover first.
      await page.touchscreen.tap(chatBox.right - 4, chatBox.top + chatBox.height / 2);
      await expect(page).toHaveURL(/\/mensagens\.html$/);
      await expect(page.locator('.kc-header .kc-chat-shortcut')).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('.kc-header .kc-chat-shortcut')).toHaveCSS('color', 'rgb(255, 107, 0)');
    });
  }
});

test.describe('desktop hover remains unchanged', () => {
  test.use({ isMobile: false, hasTouch: false, viewport: { width: 1280, height: 844 } });

  test('fine-pointer theme hover retains the established scale and login motion', async ({ page, baseURL }) => {
    await prepare(page, baseURL, false);
    expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(true);
    await page.locator('.kc-header .theme-toggle').hover();
    await expect(page.locator('.kc-header .theme-toggle')).toHaveCSS('transform', 'matrix(1.1, 0, 0, 1.1, 0, 0)');
    await page.locator('.kc-header .btn-login').hover();
    await expect(page.locator('.kc-header .btn-login')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -3)');
  });
});

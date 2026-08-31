const { test, expect } = require('@playwright/test');

test('redistribui espaço do cabeçalho para toque sem ocultar marca ou criar outra linha', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('kc_consent_v1', JSON.stringify({ version: '2026-06-05', necessary: true, preferences: false, analytics: false, advertising: false, updatedAt: new Date().toISOString() })));
  await page.setViewportSize({ width: 412, height: 844 });
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('html')).not.toHaveClass(/kc-loading/);
  await page.evaluate(() => document.fonts.ready);
  const login = page.locator('.kc-header .btn-login');
  const initialLogin = await login.innerHTML();
  const observations = [];
  for (const width of [360, 384, 390, 412, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const authenticated of [false, true]) {
      await login.evaluate((element, state) => {
        element.classList.toggle('is-auth', state.authenticated);
        element.innerHTML = state.authenticated
          ? '<span class="kc-header-user"><span class="kc-header-user__avatar">Y</span><span class="kc-header-user__name">Usuário de nome comprido</span><i class="fas fa-check-circle kc-header-user__verified" aria-label="Verificado"></i><i class="fas fa-chevron-down kc-header-user__chevron" aria-hidden="true"></i></span>'
          : state.initialLogin;
        document.getElementById('kcNotifBell').style.display = state.authenticated ? 'inline-flex' : 'none';
      }, { authenticated, initialLogin });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
      await page.locator('.kc-header').evaluate(async header => {
        const animations = header.getAnimations({ subtree: true }).filter(animation => Number.isFinite(animation.effect.getComputedTiming().endTime));
        await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      const result = await page.locator('.kc-header').evaluate(header => {
        const actions = header.querySelector('.kc-user-actions');
        const controls = [...header.querySelectorAll('.kc-search-mobile-btn, .kc-user-actions > *')].filter(node => node.getClientRects().length);
        const square = controls.filter(node => !node.matches('.btn-login'));
        const name = header.querySelector('.kc-logo-name');
        const search = header.querySelector('.kc-search-mobile-btn');
        const measurements = controls.map(node => {
          const r = node.getBoundingClientRect();
          const points = [[r.left + r.width / 2, r.top + 1], [r.left + r.width / 2, r.bottom - 1], [r.left + 1, r.top + r.height / 2], [r.right - 1, r.top + r.height / 2]];
          return { width: r.width, height: r.height, edgeHits: points.every(([x, y]) => { const hit = document.elementFromPoint(x, y); return !!hit && (node === hit || node.contains(hit)); }) };
        });
        const container = header.querySelector('.kc-header-container');
        return { measurements, authenticated: header.querySelector('.btn-login').classList.contains('is-auth'), bellVisible: header.querySelector('.kc-notif-bell').getClientRects().length > 0, squareWidths: square.map(node => node.getBoundingClientRect().width), iconSizes: square.map(node => parseFloat(getComputedStyle(node).fontSize)), gap: parseFloat(getComputedStyle(actions).columnGap), columnGap: parseFloat(getComputedStyle(container).columnGap), compactLogin: container.classList.contains('kc-header-container--compact-login'), nameVisible: getComputedStyle(name.parentElement).visibility === 'visible', spaceAfterName: search.getBoundingClientRect().left - name.getBoundingClientRect().right, height: header.offsetHeight, heightVariable: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--kc-header-height')), overflow: header.scrollWidth > header.clientWidth + 1 };
      });
      observations.push({ width, authenticated, ...result });
      const context = `${width}px auth=${authenticated}: ${JSON.stringify(result)}`;
      expect(result.authenticated, context).toBe(authenticated);
      expect(result.bellVisible, context).toBe(authenticated);
      expect(result.squareWidths, context).toHaveLength(authenticated ? 4 : 3);
      if (authenticated) expect(result.compactLogin, context).toBe(false);
      expect(result.nameVisible, context).toBe(true);
      expect(result.overflow, context).toBe(false);
      expect(result.height, context).toBeLessThanOrEqual(64);
      expect(result.heightVariable, context).toBe(result.height);
      for (const target of result.measurements) {
        expect(target.height, context).toBeGreaterThanOrEqual(44);
        expect(target.edgeHits, context).toBe(true);
      }
      expect(Math.max(...result.squareWidths) - Math.min(...result.squareWidths), context).toBeLessThanOrEqual(0.1);
      for (const targetWidth of result.squareWidths) {
        // The same full label is wider in Liberation Sans than Segoe UI. The
        // measured 43–44px comfort band preserves it on both, still requiring
        // 44px height, equal widths, edge hit testing and no unused narrow fit.
        const minimum = authenticated && width < 412 ? 36 : !authenticated && width === 412 ? 43 : 43.9;
        expect(targetWidth, context).toBeGreaterThanOrEqual(minimum);
        expect(targetWidth, context).toBeLessThanOrEqual(44.1);
      }
      for (const iconSize of result.iconSizes) {
        expect(iconSize, context).toBeGreaterThanOrEqual(18);
        expect(iconSize, context).toBeLessThanOrEqual(22);
      }
      // Once the 44px ceiling and comfortable gaps are saturated, a wider
      // viewport may legitimately leave space. Below that, use it for touch.
      if (Math.min(...result.squareWidths) < 43.9) expect(result.spaceAfterName, context).toBeLessThanOrEqual(8);
      if (!authenticated && width === 412) {
        expect(result.compactLogin, context).toBe(false);
        await expect(login).toHaveAccessibleName('Login/Cadastro');
      }
      if ([384, 412, 430].includes(width)) {
        await testInfo.attach(`header-${width}-${authenticated ? 'auth-fixture' : 'guest'}`, { body: await page.locator('.kc-header').screenshot(), contentType: 'image/png' });
      }
    }
  }
  await testInfo.attach('header-touch-measurements', { body: JSON.stringify(observations, null, 2), contentType: 'application/json' });
});

for (const authenticated of [false, true]) {
  test(`teclado e painéis do cabeçalho continuam funcionais: ${authenticated ? 'auth isolado' : 'visitante'}`, async ({ page, baseURL }) => {
    const outboundWrites = [];
    const applicationOrigin = new URL(baseURL).origin;
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      const applicationRequest = url.origin === applicationOrigin || ['kinocampus.com.br', 'www.kinocampus.com.br'].includes(url.hostname) || url.hostname.endsWith('.supabase.co');
      // Protect the application/data APIs without intercepting unrelated
      // browser extensions or the machine's security software traffic.
      if (applicationRequest && !['GET', 'HEAD'].includes(route.request().method())) {
        outboundWrites.push(`${route.request().method()} ${url.pathname}`);
        return route.abort();
      }
      return route.continue();
    });
    await page.addInitScript(() => localStorage.setItem('kc_consent_v1', JSON.stringify({ version: '2026-06-05', necessary: true, preferences: false, analytics: false, advertising: false, updatedAt: new Date().toISOString() })));
    await page.setViewportSize({ width: 384, height: 844 });
    await page.goto('/', { waitUntil: 'load' });
    await expect(page.locator('html')).not.toHaveClass(/kc-loading/);
    await page.evaluate(() => document.fonts.ready);
    if (authenticated) {
      await page.evaluate(() => {
        const user = { id: '33333333-cccc-4333-8333-333333333333', email: 'header-fixture@example.invalid' };
        const profile = { ...user, display_name: 'Perfil QA', verified: true, onboarding_completed_at: '2026-08-01T00:00:00Z' };
        window.__headerFixtureWrites = [];
        const rejectWrite = name => async () => { window.__headerFixtureWrites.push(name); return { ok: false }; };
        window.KCSupabase = { ...window.KCSupabase, getUser: () => user, getCurrentUser: async () => user };
        window.KCAPI = {
          ...window.KCAPI,
          getCurrentUser: async () => user,
          getCurrentProfile: () => profile,
          getMyProfile: async () => profile,
          getNotifications: async () => ({ ok: true, notifications: [], unread: 0 }),
          getUnreadNotificationCount: async () => 0,
          subscribeNotifications: () => null,
          unsubscribeNotifications: () => {},
          markNotificationsRead: rejectWrite('markNotificationsRead'),
          markAllNotificationsRead: rejectWrite('markAllNotificationsRead'),
          clearNotifications: rejectWrite('clearNotifications'),
          chat: { ...window.KCAPI.chat, unreadTotal: async () => 0 },
        };
        document.dispatchEvent(new CustomEvent('kc:authchange', { detail: { user, session: { user } } }));
      });
      await expect(page.locator('.kc-header .btn-login')).toHaveClass(/is-auth/);
      await expect(page.locator('#kcNotifBell')).toBeVisible();
    } else {
      await expect(page.locator('.kc-header .btn-login')).not.toHaveClass(/is-auth/);
      await expect(page.locator('#kcNotifBell')).toBeHidden();
    }
    const search = page.locator('.kc-header .kc-search-mobile-btn');
    const chat = page.locator('.kc-header .kc-chat-shortcut');
    const theme = page.locator('.kc-header .theme-toggle');
    const login = page.locator('.kc-header .btn-login');
    const order = [search, ...(authenticated ? [page.locator('#kcNotifBell')] : []), chat, theme, login];
    await search.focus();
    for (let index = 0; index < order.length; index += 1) {
      await expect(order[index]).toBeFocused();
      if (index < order.length - 1) await page.keyboard.press('Tab');
    }
    await search.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#kcSearchModalOverlay')).toHaveClass(/active/);
    await expect(page.locator('#kcSearchModalInput')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#kcSearchModalOverlay')).not.toHaveClass(/active/);
    const beforeTheme = await page.locator('html').getAttribute('data-theme');
    await theme.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', beforeTheme === 'light' ? 'dark' : 'light');
    if (authenticated) {
      const bell = page.locator('#kcNotifBell');
      await bell.focus();
      await page.keyboard.press('Enter');
      await expect(bell).toHaveAttribute('aria-expanded', 'true');
      await expect(bell).toHaveClass(/kc-notif-bell--active/);
      await expect(page.locator('#kcNotifDropdown')).toHaveAttribute('aria-hidden', 'false');
      await expect(page.locator('#kcNotifDropdown')).toContainText('Nenhuma notificação');
      await page.keyboard.press('Escape');
      await expect(bell).toHaveAttribute('aria-expanded', 'false');
      await login.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#mobileMenuDrawer')).toHaveClass(/active/);
      await expect(page.locator('#mobileMenuDrawer')).toHaveAttribute('aria-hidden', 'false');
      await page.keyboard.press('Escape');
      await expect(page.locator('#mobileMenuDrawer')).not.toHaveClass(/active/);
      expect(await page.evaluate(() => window.__headerFixtureWrites)).toEqual([]);
    } else {
      await login.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#kcAuthModal')).toBeVisible();
      await expect(page.locator('#kcAuthLoginEmail')).toBeVisible();
      await expect(page.locator('#kcAuthLoginPassword')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#kcAuthModal')).not.toBeVisible();
    }
    await expect(chat).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await chat.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/mensagens\.html$/);
    await expect(page.locator('.kc-header .kc-chat-shortcut')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.kc-header .kc-chat-shortcut')).toHaveCSS('color', 'rgb(255, 107, 0)');
    expect(outboundWrites).toEqual([]);
  });
}

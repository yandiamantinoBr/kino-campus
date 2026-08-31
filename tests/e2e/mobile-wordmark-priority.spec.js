const { test, expect } = require('@playwright/test');

for (const route of ['/', '/mensagens.html']) {
  test(`nome obrigatório no mobile com fontes, temas e controles reais: ${route}`, async ({ page }) => {
    test.setTimeout(90000);
    await page.addInitScript(() => localStorage.setItem('kc_consent_v1', JSON.stringify({ version: '2026-06-05', necessary: true, preferences: false, analytics: false, advertising: false, updatedAt: new Date().toISOString() })));
    await page.setViewportSize({ width: 412, height: 844 });
    await page.goto(route, { waitUntil: 'load' });
    await expect(page.locator('html')).not.toHaveClass(/kc-loading/);
    await page.evaluate(() => document.fonts.ready);
    if (process.env.WORDMARK_QA_REVISION) {
      for (const selector of ['link[href*="kc-chat-shortcut.css"]', 'script[src*="/kc-core-widgets.js?"]']) {
        const element = page.locator(selector);
        const asset = await element.getAttribute(selector.startsWith('link') ? 'href' : 'src');
        expect(asset).toContain(`?v=${process.env.WORDMARK_QA_REVISION}`);
      }
    }
    const login = page.locator('.kc-header .btn-login');
    const initialLogin = await login.innerHTML();
    for (const width of [320, 360, 375, 390, 400, 412, 414, 430, 440, 480, 576, 577, 767, 768, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const authenticated of [false, true]) {
        await login.evaluate((element, state) => {
          element.classList.toggle('is-auth', state.authenticated);
          element.innerHTML = state.authenticated
            ? '<span class="kc-header-user"><span class="kc-header-user__avatar">Y</span><span class="kc-header-user__name">Usuário de nome comprido</span><i class="fas fa-check-circle kc-header-user__verified" aria-label="Verificado"></i><i class="fas fa-chevron-down kc-header-user__chevron" aria-hidden="true"></i></span>'
            : state.initialLogin;
          document.getElementById('kcNotifBell').style.display = state.authenticated ? 'inline-flex' : 'none';
        }, { authenticated, initialLogin });
        for (const theme of ['dark', 'light']) {
          for (const scale of [1, 1.25, 1.5]) {
            await page.evaluate(({ theme, scale }) => {
              window.kcSetTheme(theme);
              document.documentElement.style.fontSize = `${16 * scale}px`;
            }, { theme, scale });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
            // Theme/font transitions can still alter subpixel header height.
            // Wait for finite header animations; do not wait for page skeletons.
            await page.locator('.kc-header').evaluate(async header => {
              const animations = header.getAnimations({ subtree: true }).filter(animation => Number.isFinite(animation.effect.getComputedTiming().endTime));
              await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
              await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            });
            const result = await page.locator('.kc-header').evaluate(header => {
              const name = header.querySelector('.kc-logo-name');
              const text = header.querySelector('.kc-logo-text');
              const nameBox = name.getBoundingClientRect();
              const range = document.createRange();
              range.selectNodeContents(name);
              const ink = range.getBoundingClientRect();
              const bounds = header.getBoundingClientRect();
              const nodes = [...header.querySelectorAll('.kc-logo-mark, .kc-logo-name, .kc-search-mobile-btn, .kc-user-actions > *')]
                .filter(node => node.getClientRects().length && getComputedStyle(node).visibility === 'visible');
              const collisions = [];
              for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i].getBoundingClientRect(); const b = nodes[j].getBoundingClientRect();
                if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) collisions.push([nodes[i].className, nodes[j].className]);
              }
              return {
                name: name.textContent.trim(), visible: getComputedStyle(text).visibility === 'visible',
                fontSize: parseFloat(getComputedStyle(name).fontSize), clipped: ink.right > nameBox.right + 1 || ink.left < nameBox.left - 1,
                collisions, outside: nodes.filter(node => { const r = node.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth + 1 || r.top < bounds.top - 2 || r.bottom > bounds.bottom + 1; }).map(node => node.className),
                blocked: nodes.filter(node => { const r = node.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !hit || !(node.contains(hit) || hit.contains(node)); }).map(node => node.className),
                height: header.offsetHeight, heightVar: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--kc-header-height')),
                mainTop: document.querySelector('main').getBoundingClientRect().top, headerBottom: bounds.bottom,
              };
            });
            const context = `${route} ${width}px auth=${authenticated} ${theme} scale=${scale}: ${JSON.stringify(result)}`;
            expect(result.name, context).toBe('KinoCampus');
            expect(result.visible, context).toBe(true);
            expect(result.fontSize, context).toBeGreaterThanOrEqual(16 * scale);
            expect(result.clipped, context).toBe(false);
            expect(result.collisions, context).toEqual([]);
            expect(result.outside, context).toEqual([]);
            expect(result.blocked, context).toEqual([]);
            expect(result.heightVar, context).toBe(result.height);
            expect(result.mainTop, context).toBeGreaterThanOrEqual(result.headerBottom - 1);
          }
        }
      }
    }
  });
}

const { test, expect } = require('@playwright/test');

const MOBILE_WIDTHS = [360, 361, 375, 390, 412, 440];
const fixturePosts = [
  {
    id: 'mobile-nutri-result',
    titulo: 'Nutrição no campus',
    descricao: 'Atendimento de nutrição para a comunidade acadêmica.',
    modulo: 'oportunidades',
    categoria: 'servicos',
    relevanceScore: 3,
    timestamp: 'Há 1 min'
  },
  {
    id: 'mobile-nutri-closed-result',
    titulo: 'Nutrição: seleção encerrada com título propositalmente longo',
    descricao: 'Resultado encerrado para verificar o histórico e a contenção do rodapé.',
    modulo: 'oportunidades',
    categoria: 'servicos',
    status: 'closed',
    relevanceScore: 2,
    timestamp: 'Há 2 meses'
  },
  {
    id: 'mobile-nutri-signal-result',
    titulo: 'Nutrição esportiva e saúde acadêmica com título longo',
    descricao: 'Acompanhamento nutricional para a comunidade acadêmica.',
    modulo: 'oportunidades',
    categoria: 'servicos',
    relevanceScore: 1,
    timestamp: 'Há 2 min',
    metadata: {
      cashbackBadgeText: 'Benefício'
    },
    _kcPersonalization: {
      boost: 2,
      primary: {
        label: 'Saúde escolhido por você',
        shortLabel: 'Saúde',
        tone: 'match',
        icon: 'fas fa-heart'
      }
    }
  }
];

async function installSearchFixture(page) {
  await page.route('**/data/database.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ anuncios: [] })
  }));
  await page.goto('/search-results.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate((posts) => {
    if (window.KCAPI && window.KCAPI.ENV) {
      window.KCAPI.ENV.driver = 'local';
      window.KCAPI.ENV.DATA_DRIVER = 'local';
    }
    if (window.KC_ENV) {
      window.KC_ENV.driver = 'local';
      window.KC_ENV.DATA_DRIVER = 'local';
    }
    if (window.KCAPI && typeof window.KCAPI.registerAdapter === 'function') {
      window.KCAPI.registerAdapter('local', {
        name: 'local',
        searchPosts: async () => posts.map((post) => ({ ...post })),
        getPosts: async () => posts.map((post) => ({ ...post })),
        getFeedCursor: async () => ({
          posts: posts.map((post) => ({ ...post })),
          nextCursor: null,
          hasMore: false
        }),
        getPostById: async (id) => posts.find((post) => post.id === id) || null
      });
    }
    const input = document.getElementById('searchInput');
    input.value = 'Nutri';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, fixturePosts);
  await expect(page.locator('[data-kc-search-result-id="mobile-nutri-result"]')).toBeVisible();
}

test.describe('mobile public layout regressions', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: 'window.supabase = window.supabase || {};'
    }));
  });

  for (const width of MOBILE_WIDTHS) {
    test(`search filters stay compact and contained at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await installSearchFixture(page);

      const toggle = page.locator('#searchResultsFiltersToggle');
      const panel = page.locator('#searchResultsFiltersPanel');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(panel).toBeHidden();

      const collapsed = await page.evaluate(() => {
        document.getElementById('searchQueryText').textContent = `"${'Nutri'.repeat(28)}"`;
        const controls = document.querySelector('.kc-search-results-controls');
        const header = document.querySelector('.kc-search-results-header');
        const card = document.querySelector('[data-kc-search-result-id]');
        const controlsRect = controls.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        return {
          controlsHeight: controlsRect.height,
          controlsBottom: controlsRect.bottom,
          cardTop: cardRect.top,
          headerScrollWidth: header.scrollWidth,
          headerClientWidth: header.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth
        };
      });
      expect(collapsed.controlsHeight).toBeLessThan(100);
      expect(collapsed.cardTop).toBeGreaterThanOrEqual(collapsed.controlsBottom - 1);
      expect(collapsed.headerScrollWidth).toBeLessThanOrEqual(collapsed.headerClientWidth + 1);
      expect(collapsed.documentWidth).toBeLessThanOrEqual(collapsed.viewportWidth + 1);

      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(panel).toBeVisible();

      const expanded = await page.evaluate(() => {
        const controls = document.querySelector('.kc-search-results-controls');
        const toolbar = document.querySelector('.kc-search-results-controls__toolbar');
        const active = document.getElementById('searchResultsActiveFilters');
        const rootRect = controls.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        return {
          controlsScrollWidth: controls.scrollWidth,
          controlsClientWidth: controls.clientWidth,
          toolbarScrollWidth: toolbar.scrollWidth,
          toolbarClientWidth: toolbar.clientWidth,
          activeLeft: activeRect.left,
          activeRight: activeRect.right,
          rootLeft: rootRect.left,
          rootRight: rootRect.right
        };
      });
      expect(expanded.controlsScrollWidth).toBeLessThanOrEqual(expanded.controlsClientWidth + 1);
      expect(expanded.toolbarScrollWidth).toBeLessThanOrEqual(expanded.toolbarClientWidth + 1);
      expect(expanded.activeLeft).toBeGreaterThanOrEqual(expanded.rootLeft - 1);
      expect(expanded.activeRight).toBeLessThanOrEqual(expanded.rootRight + 1);

      const cardLayout = await page.evaluate(() => {
        const rect = (element) => {
          if (!element) return null;
          const bounds = element.getBoundingClientRect();
          return {
            left: bounds.left,
            right: bounds.right,
            top: bounds.top,
            bottom: bounds.bottom
          };
        };
        const overlaps = (left, right) => Boolean(
          left && right &&
          left.left < right.right && left.right > right.left &&
          left.top < right.bottom && left.bottom > right.top
        );
        const closedCard = document.querySelector(
          '[data-kc-search-result-id="mobile-nutri-closed-result"]'
        );
        const signalCard = document.querySelector(
          '[data-kc-search-result-id="mobile-nutri-signal-result"]'
        );
        const footer = closedCard.querySelector('.kc-card__footer');
        const comment = rect(closedCard.querySelector('.kc-comment-link'));
        const whatsapp = rect(closedCard.querySelector('.kc-share-whatsapp'));
        const footerRect = rect(footer);
        const signal = rect(signalCard.querySelector('.kc-card__corner-signals'));
        const cashback = rect(signalCard.querySelector('.kc-cashback-badge'));
        const category = rect(signalCard.querySelector('.kc-card__category-source'));
        const title = rect(signalCard.querySelector('.kc-card__title'));
        return {
          footerScrollWidth: footer.scrollWidth,
          footerClientWidth: footer.clientWidth,
          footerRect,
          comment,
          whatsapp,
          footerActionsOverlap: overlaps(comment, whatsapp),
          signalCategoryOverlap: overlaps(signal, category),
          signalTitleOverlap: overlaps(signal, title),
          cashbackPresent: Boolean(cashback),
          signalStateClass: signalCard.classList.contains('kc-card--has-corner-badge')
        };
      });
      expect(cardLayout.footerScrollWidth).toBeLessThanOrEqual(cardLayout.footerClientWidth + 1);
      expect(cardLayout.comment.right).toBeLessThanOrEqual(cardLayout.whatsapp.left + 1);
      expect(cardLayout.footerActionsOverlap).toBe(false);
      expect(cardLayout.signalCategoryOverlap).toBe(false);
      expect(cardLayout.signalTitleOverlap).toBe(false);
      expect(cardLayout.cashbackPresent).toBe(true);
      expect(cardLayout.signalStateClass).toBe(true);
    });

    test(`help stacks both columns without overlap at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/ajuda.html', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('html')).not.toHaveClass(/kc-loading/);

      const layout = await page.evaluate(() => {
        const grid = document.querySelector('.kc-help-grid');
        const main = document.querySelector('.kc-help-stack--main');
        const aside = document.querySelector('.kc-help-stack--aside');
        const firstCard = main.querySelector('.kc-help-card');
        const gridRect = grid.getBoundingClientRect();
        const mainRect = main.getBoundingClientRect();
        const asideRect = aside.getBoundingClientRect();
        return {
          columns: getComputedStyle(grid).gridTemplateColumns,
          gridWidth: gridRect.width,
          mainLeft: mainRect.left,
          mainWidth: mainRect.width,
          asideLeft: asideRect.left,
          asideWidth: asideRect.width,
          asideTop: asideRect.top,
          mainBottom: mainRect.bottom,
          firstCardScrollWidth: firstCard.scrollWidth,
          firstCardClientWidth: firstCard.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth
        };
      });
      expect(layout.columns.trim().split(/\s+/)).toHaveLength(1);
      expect(layout.mainWidth).toBeGreaterThanOrEqual(layout.gridWidth - 1);
      expect(layout.asideWidth).toBeGreaterThanOrEqual(layout.gridWidth - 1);
      expect(Math.abs(layout.mainLeft - layout.asideLeft)).toBeLessThanOrEqual(1);
      expect(layout.asideTop).toBeGreaterThanOrEqual(layout.mainBottom - 1);
      expect(layout.firstCardScrollWidth).toBeLessThanOrEqual(layout.firstCardClientWidth + 1);
      expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
    });
  }

  test('search filters are compact before the deferred controller loads', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/assets/js/features/kc-search.js*', (route) => route.abort());
    await page.goto('/search-results.html?q=Nutri', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#searchResultsFiltersToggle')).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await expect(page.locator('#searchResultsFiltersPanel')).toBeHidden();
    const controlsHeight = await page.locator('.kc-search-results-controls').evaluate(
      (element) => element.getBoundingClientRect().height
    );
    expect(controlsHeight).toBeLessThan(100);
  });

  test('Mensagens fica visível no cabeçalho e no menu sem cobrir conteúdo mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    for (const route of ['/', '/eventos.html', '/oportunidades.html', '/moradia.html', '/compra-venda-feed.html', '/search-results.html', '/ajuda.html', '/create-post.html', '/mensagens.html']) {
      const response = await page.goto(route, { waitUntil: 'load' });
      expect(response && response.status(), route).toBe(200);
      if (route === '/create-post.html') await expect(page.locator('h1')).toHaveText('Criar Publicação');
      await expect(page.locator('.kc-chat-mobile-fab')).toHaveCount(0);
      await expect(page.locator('.kc-header .kc-chat-shortcut')).toBeVisible();
      await expect(page.locator('.kc-header .kc-chat-shortcut')).toHaveAccessibleName('Mensagens');
      if (route === '/mensagens.html') {
        await expect(page.locator('.kc-header .kc-chat-shortcut')).toHaveAttribute('aria-current', 'page');
        await expect(page.locator('.kc-header .kc-chat-shortcut')).toHaveCSS('color', 'rgb(255, 107, 0)');
        await expect(page.locator('.kc-header .kc-chat-shortcut')).toHaveCSS('background-color', 'rgba(255, 107, 0, 0.12)');
      } else {
        await expect(page.locator('.kc-header .kc-chat-shortcut')).not.toHaveAttribute('aria-current');
      }
      await expect(page.locator('.kc-mobile-menu-content a[href="mensagens.html"]')).toHaveCount(1);
      await expect(page.locator('.kc-chat-mobile-menu-link .kc-chat-shortcut__badge')).toHaveCount(1);
    }
  });

  test('ícone de Mensagens cabe entre os controles em mobile, tablet e desktop nos dois temas', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await expect(page.locator('html')).not.toHaveClass(/kc-loading/);
    const login = page.locator('.kc-header .btn-login');
    const originalLogin = await login.innerHTML();

    for (const width of [320, 360, 390, 412, 440, 480, 481, 576, 577, 767, 768, 769, 1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const loggedIn of [false, true]) {
        // Exercise the real header styles with both anonymous and authenticated
        // identity markup, without credentials or a production auth session.
        await login.evaluate((element, state) => {
          element.classList.toggle('is-auth', state.loggedIn);
          element.innerHTML = state.loggedIn
            ? '<span class="kc-header-user"><span class="kc-header-user__avatar">Y</span><span class="kc-header-user__name">Nome de usuário longo para testar</span><i class="kc-header-user__chevron"></i></span>'
            : state.originalLogin;
          document.getElementById('kcNotifBell').style.display = state.loggedIn ? 'inline-flex' : 'none';
        }, { loggedIn, originalLogin });

        for (const light of [false, true]) {
          await page.evaluate((isLight) => window.kcSetTheme(isLight ? 'light' : 'dark'), light);
          await expect(page.locator('html')).toHaveAttribute('data-theme', light ? 'light' : 'dark');
          await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const shortcut = page.locator('.kc-header .kc-chat-shortcut');
          await expect(shortcut).toBeVisible();
          const layout = await shortcut.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const controls = [...document.querySelectorAll('.kc-header .kc-logo-mark, .kc-header .kc-logo-text, .kc-header .kc-search-mobile-btn, .kc-header .kc-user-actions > *')];
            const overlaps = controls.filter((other) => {
              if (other === element || !other.getClientRects().length || getComputedStyle(other).visibility === 'hidden') return false;
              const bounds = other.getBoundingClientRect();
              return rect.left < bounds.right && rect.right > bounds.left
                && rect.top < bounds.bottom && rect.bottom > bounds.top;
            }).map((other) => other.className);
            const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
            const logo = document.querySelector('.kc-header .kc-logo');
            const text = logo.querySelector('.kc-logo-text');
            const mark = logo.querySelector('.kc-logo-mark');
            const gap = parseFloat(getComputedStyle(logo.querySelector('a')).columnGap) || 0;
            const logoVisible = getComputedStyle(text).visibility === 'visible' && text.getClientRects().length > 0;
            const search = document.querySelector('.kc-search-mobile-btn').getBoundingClientRect();
            return {
              width: rect.width, height: rect.height, left: rect.left, right: rect.right,
              viewportWidth: document.documentElement.clientWidth,
              contentWidth: document.documentElement.scrollWidth,
              clickable: Boolean(hit && element.contains(hit)), overlaps,
              position: getComputedStyle(element).position,
              background: getComputedStyle(element).backgroundColor,
              border: getComputedStyle(element).borderTopWidth,
              logoVisible,
              logoFits: mark.offsetWidth + text.offsetWidth + gap + 1 <= logo.clientWidth,
              logoSearchOverlap: logoVisible && text.getBoundingClientRect().right > search.left,
            };
          });
          const context = `${width}px loggedIn=${loggedIn} light=${light}: ${JSON.stringify(layout)}`;
          expect(layout.width, context).toBeGreaterThanOrEqual(width <= 768 ? 36 : 20);
          expect(layout.height, context).toBeGreaterThanOrEqual(width <= 768 ? 36 : 20);
          expect(layout.left, context).toBeGreaterThanOrEqual(0);
          expect(layout.right, context).toBeLessThanOrEqual(width);
          expect(layout.contentWidth, context).toBeLessThanOrEqual(layout.viewportWidth + 1);
          expect(layout.clickable, context).toBe(true);
          expect(layout.overlaps, context).toEqual([]);
          expect(layout.position, context).not.toBe('fixed');
          if (width <= 768) {
            expect(layout.background, context).toBe('rgba(0, 0, 0, 0)');
            expect(layout.border, context).toBe('0px');
            expect(layout.logoVisible, context).toBe(layout.logoFits);
            expect(layout.logoSearchOverlap, context).toBe(false);
          }
        }
      }
    }
  });

  test('atalho visível abre Mensagens com um toque e preserva o login do visitante', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'load' });
    await page.locator('.kc-header .kc-chat-shortcut').click();
    await expect(page).toHaveURL(/\/mensagens\.html$/);
    await expect(page.locator('body')).toHaveClass(/kc-chat-route/);
    await expect(page.locator('.kc-header .btn-login')).toBeVisible();
  });

  test('desktop search and help layouts remain expanded and two-column', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await installSearchFixture(page);
    await expect(page.locator('#searchResultsFiltersToggle')).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    await expect(page.locator('#searchResultsFiltersPanel')).toBeVisible();
    await expect.poll(
      async () => page.locator('.kc-search-results-controls__toolbar').evaluate(
        (element) => getComputedStyle(element).flexDirection
      )
    ).toBe('row');

    await page.goto('/ajuda.html', { waitUntil: 'domcontentloaded' });
    const columns = await page.locator('.kc-help-grid').evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length
    );
    expect(columns).toBe(2);
  });
});

'use strict';

const { test, expect } = require('@playwright/test');
const { ALL_HTML_PAGES } = require('../../scripts/admin-pages.manifest');

const MOBILE_CRITICAL_PAGES = Object.freeze([
  'index.html',
  '_product.html',
  'account-setup.html',
  'ajuda.html',
  'eventos.html',
  'my-posts.html',
  'oportunidades.html',
  'search-results.html',
  'settings.html',
]);

const RUNTIME_PUBLIC_PAGES = Object.freeze([
  'index.html',
  'ajuda.html',
  'eventos.html',
  'oportunidades.html',
  'search-results.html',
  'sobre.html',
]);

function routeFor(file) {
  return file === 'index.html' ? '/' : `/${file}`;
}

function contextOptionsForProject(testInfo) {
  const use = testInfo.project.use || {};
  return {
    viewport: use.viewport,
    userAgent: use.userAgent,
    deviceScaleFactor: use.deviceScaleFactor,
    hasTouch: use.hasTouch,
    isMobile: use.isMobile,
    locale: use.locale,
    colorScheme: use.colorScheme,
  };
}

async function readLayout(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return {
      hasBody: Boolean(body),
      lang: root.lang,
      title: document.title.trim(),
      viewportWidth: root.clientWidth,
      contentWidth: Math.max(root.scrollWidth, body ? body.scrollWidth : 0),
    };
  });
}

function collectLayoutFailures(failures, route, metrics) {
  if (!metrics.hasBody) failures.push(`${route}: body ausente`);
  if (metrics.lang.toLowerCase() !== 'pt-br') failures.push(`${route}: lang=${metrics.lang || 'ausente'}`);
  if (!metrics.title) failures.push(`${route}: title vazio`);
  if (metrics.contentWidth > metrics.viewportWidth + 1) {
    failures.push(`${route}: overflow ${metrics.contentWidth}px > ${metrics.viewportWidth}px`);
  }
}

test('todas as rotas canônicas preservam layout estático compatível', async ({ browser }, testInfo) => {
  const isMobile = testInfo.project.name.startsWith('mobile-');
  const pages = isMobile ? MOBILE_CRITICAL_PAGES : ALL_HTML_PAGES;
  const failures = [];
  const context = await browser.newContext({
    ...contextOptionsForProject(testInfo),
    javaScriptEnabled: false,
  });

  try {
    for (const file of pages) {
      const page = await context.newPage();
      await page.route(/^https:\/\//, (route) => route.abort('blockedbyclient'));
      const route = routeFor(file);
      try {
        // Layout metrics are only meaningful after blocking stylesheets have
        // settled. `domcontentloaded` can race CSS application in Chromium.
        const response = await page.goto(route, { waitUntil: 'load' });
        if (!response || response.status() !== 200) {
          failures.push(`${route}: HTTP ${response ? response.status() : 'sem resposta'}`);
          continue;
        }
        collectLayoutFailures(failures, route, await readLayout(page));
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
  }

  expect(failures, failures.join('\n')).toEqual([]);
});

test('runtime público crítico inicializa sem exceção nos motores principais', async ({ context }) => {
  const failures = [];

  for (const file of RUNTIME_PUBLIC_PAGES) {
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route(/^https:\/\//, (route) => route.abort('blockedbyclient'));

    const route = routeFor(file);
    try {
      const response = await page.goto(route, { waitUntil: 'load' });
      if (!response || response.status() !== 200) {
        failures.push(`${route}: HTTP ${response ? response.status() : 'sem resposta'}`);
        continue;
      }
      collectLayoutFailures(failures, route, await readLayout(page));
      if (pageErrors.length) failures.push(`${route}: ${pageErrors.join(' | ')}`);
    } finally {
      await page.close();
    }
  }

  expect(failures, failures.join('\n')).toEqual([]);
});

test('abas do feed preservam semântica, contraste AA e largura nos dois temas', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('kc_consent_v1', JSON.stringify({
      version: '2026-06-05',
      necessary: true,
      preferences: false,
      analytics: false,
      advertising: false,
      updatedAt: '2026-08-27T00:00:00.000Z',
      source: 'cross-browser-read-only',
    }));
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      await route.continue();
      return;
    }
    await route.abort('blockedbyclient');
  });

  const response = await page.goto('/eventos.html', { waitUntil: 'load' });
  expect(response && response.status()).toBe(200);

  const semantics = await page.locator('.kc-feed-tabs').evaluate((tabs) => {
    const tablist = tabs.querySelector(':scope > .kc-feed-tabs__view[role="tablist"]');
    const divider = tabs.querySelector(':scope > .kc-feed-tabs__divider');
    const navigation = tabs.querySelector(':scope > .kc-feed-tabs__nav');
    return {
      outerRole: tabs.getAttribute('role'),
      directOrder: Array.from(tabs.children).map((element) => (
        element.classList.contains('kc-feed-tabs__view') ? 'tablist'
          : element.classList.contains('kc-feed-tabs__divider') ? 'divider'
            : element.classList.contains('kc-feed-tabs__nav') ? 'navigation'
              : 'unexpected'
      )),
      tabCount: tablist ? tablist.querySelectorAll(':scope > [role="tab"]').length : 0,
      anchorsInTablist: tablist ? tablist.querySelectorAll(':scope > a').length : -1,
      navigationLabel: navigation ? navigation.getAttribute('aria-label') : null,
      navigationLinks: navigation ? navigation.querySelectorAll(':scope > a').length : 0,
      tabsInNavigation: navigation ? navigation.querySelectorAll('[role="tab"]').length : -1,
      hasDivider: Boolean(divider),
    };
  });

  expect(semantics).toEqual({
    outerRole: null,
    directOrder: ['tablist', 'divider', 'navigation'],
    tabCount: 3,
    anchorsInTablist: 0,
    navigationLabel: 'Categorias do feed',
    navigationLinks: 10,
    tabsInNavigation: 0,
    hasDivider: true,
  });

  for (const theme of ['dark', 'light']) {
    const visualContract = await page.evaluate(async (activeTheme) => {
      document.documentElement.setAttribute('data-theme', activeTheme);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const tab = document.querySelector('.kc-feed-tabs button[data-feed-tab].active');
      const login = document.querySelector('.kc-user-actions a.btn-login');
      const root = document.documentElement;
      const body = document.body;
      const parseRgb = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const luminance = (rgb) => {
        const channels = rgb.map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
      };
      const contrast = (foreground, background) => {
        const values = [luminance(parseRgb(foreground)), luminance(parseRgb(background))]
          .sort((first, second) => second - first);
        return (values[0] + 0.05) / (values[1] + 0.05);
      };
      const stylesFor = (element) => {
        const style = getComputedStyle(element);
        return {
          color: style.color,
          background: style.backgroundColor,
          contrast: contrast(style.color, style.backgroundColor),
        };
      };

      return {
        theme: activeTheme,
        tab: stylesFor(tab),
        login: stylesFor(login),
        viewportWidth: root.clientWidth,
        contentWidth: Math.max(root.scrollWidth, body.scrollWidth),
      };
    }, theme);

    expect(visualContract.theme).toBe(theme);
    expect(visualContract.tab.color).toBe('rgb(34, 34, 34)');
    expect(visualContract.tab.background).toBe('rgb(255, 107, 0)');
    expect(visualContract.tab.contrast).toBeGreaterThanOrEqual(4.5);
    expect(visualContract.login.color).toBe('rgb(34, 34, 34)');
    expect(visualContract.login.background).toBe('rgb(255, 107, 0)');
    expect(visualContract.login.contrast).toBeGreaterThanOrEqual(4.5);
    expect(visualContract.contentWidth).toBeLessThanOrEqual(visualContract.viewportWidth + 1);
  }
});

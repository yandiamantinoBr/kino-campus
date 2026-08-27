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

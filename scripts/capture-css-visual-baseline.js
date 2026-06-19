#!/usr/bin/env node
/* eslint-disable no-console */

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('@playwright/test');

const DEFAULT_PORT = Number(process.env.KC_CSS_BASELINE_PORT || 4000);
const DEFAULT_BASE_URL = process.env.KC_CSS_BASELINE_BASE_URL || `http://localhost:${DEFAULT_PORT}`;
const DEFAULT_RUN_ID = process.env.KC_CSS_BASELINE_RUN_ID || `v76-css-b-${new Date().toISOString().slice(0, 10)}`;
const DEFAULT_OUTPUT_DIR = path.join('output', 'playwright', 'css-baseline', DEFAULT_RUN_ID);

const ROUTES = Object.freeze([
  { id: 'home', path: '/', group: 'public-core' },
  { id: 'product', path: '/_product.html', group: 'public-core' },
  { id: 'my-posts', path: '/my-posts.html', group: 'user' },
  { id: 'mensagens', path: '/mensagens.html', group: 'chat' },
  { id: 'profile', path: '/profile.html', group: 'public-shell' },
  { id: 'settings', path: '/settings.html', group: 'public-shell' },
  { id: 'sobre', path: '/sobre.html', group: 'public-legal' },
  { id: 'editorial', path: '/editorial.html', group: 'public-legal' },
  { id: 'transparencia', path: '/transparencia.html', group: 'public-legal' },
  { id: 'privacidade', path: '/privacidade.html', group: 'public-legal' },
  { id: 'termos', path: '/termos.html', group: 'public-legal' },
  { id: 'admin-index', path: '/admin/index.html', group: 'admin' },
  { id: 'admin-moderation', path: '/admin/moderation.html', group: 'admin' },
  { id: 'admin-reports', path: '/admin/reports.html', group: 'admin' },
  { id: 'admin-banners', path: '/admin/banners.html', group: 'admin' },
  { id: 'admin-help-requests', path: '/admin/help-requests.html', group: 'admin' },
  { id: 'admin-privacy-analytics', path: '/admin/privacy-analytics.html', group: 'admin' },
]);

const VIEWPORTS = Object.freeze([
  { id: 'desktop-1366x900', width: 1366, height: 900, isMobile: false, hasTouch: false },
  { id: 'mobile-390x844', width: 390, height: 844, isMobile: true, hasTouch: true },
]);

const MIME_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
});

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    outputDir: DEFAULT_OUTPUT_DIR,
    json: false,
    noServer: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base-url') {
      options.baseUrl = argv[index + 1];
      index += 1;
    } else if (arg === '--out') {
      options.outputDir = argv[index + 1];
      index += 1;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--no-server') {
      options.noServer = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Argumento desconhecido: ${arg}`);
    }
  }

  options.baseUrl = String(options.baseUrl || '').replace(/\/+$/, '');
  options.outputDir = path.normalize(options.outputDir || DEFAULT_OUTPUT_DIR);
  return options;
}

function printHelp() {
  console.log(`Uso: node scripts/capture-css-visual-baseline.js [opcoes]

Opcoes:
  --base-url <url>   Reusa um servidor existente. Padrao: ${DEFAULT_BASE_URL}
  --out <dir>        Diretorio de saida. Padrao: ${DEFAULT_OUTPUT_DIR}
  --no-server        Nao sobe http-server automaticamente.
  --json             Imprime o manifest completo em JSON.
`);
}

function requestUrl(url, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      res.on('end', () => resolve({ ok: true, status: res.statusCode || 0 }));
    });
    req.on('error', () => resolve({ ok: false, status: 0 }));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ ok: false, status: 0 });
    });
  });
}

async function waitForServer(baseUrl, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await requestUrl(baseUrl, 1000);
    if (result.ok && result.status < 500) return true;
    await delay(300);
  }
  return false;
}

async function ensureServer(options) {
  const reachable = await waitForServer(options.baseUrl, 1200);
  if (reachable || options.noServer) {
    return { instance: null, reused: reachable };
  }

  const base = new URL(options.baseUrl);
  const port = Number(base.port || (base.protocol === 'https:' ? 443 : 80));
  const hostname = ['localhost', '127.0.0.1', '::1'].includes(base.hostname)
    ? '127.0.0.1'
    : base.hostname;
  const root = process.cwd();
  const instance = http.createServer((req, res) => serveStatic(req, res, root));

  await new Promise((resolve, reject) => {
    instance.once('error', reject);
    instance.listen(port, hostname, () => {
      instance.off('error', reject);
      resolve();
    });
  });

  const started = await waitForServer(options.baseUrl, 30000);
  if (!started) {
    await closeServer(instance);
    throw new Error(`Nao foi possivel iniciar servidor local em ${options.baseUrl}`);
  }
  return { instance, reused: false };
}

function serveStatic(req, res, root) {
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch (error) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  let filePath = pathname === '/'
    ? path.join(root, 'index.html')
    : path.resolve(root, '.' + pathname.replace(/\//g, path.sep));

  if (!filePath.startsWith(root + path.sep) && filePath !== root) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  } else if (!fs.existsSync(filePath) && !path.extname(filePath)) {
    const htmlCandidate = filePath + '.html';
    if (fs.existsSync(htmlCandidate)) filePath = htmlCandidate;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': contentType,
  });
  fs.createReadStream(filePath).pipe(res);
}

function closeServer(instance) {
  return new Promise((resolve, reject) => {
    instance.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toOutputPath(outputDir, route, viewport) {
  return path.join(outputDir, `${route.id}-${viewport.id}.png`);
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function toRelative(filePath) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}

function summarizeConsole(messages) {
  return messages
    .filter((entry) => entry.type === 'error')
    .map((entry) => entry.text)
    .slice(0, 10);
}

async function captureRoute(browser, options, route, viewport) {
  const outputPath = toOutputPath(options.outputDir, route, viewport);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });

  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  page.on('console', (message) => {
    consoleMessages.push({ type: message.type(), text: message.text() });
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const response = await page.goto(options.baseUrl + route.path, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await page.addStyleTag({
    content: [
      '*, *::before, *::after {',
      '  animation-duration: 0s !important;',
      '  animation-delay: 0s !important;',
      '  transition-duration: 0s !important;',
      '  scroll-behavior: auto !important;',
      '}',
      'input, textarea { caret-color: transparent !important; }',
    ].join('\n'),
  });
  await delay(250);

  await page.screenshot({ path: outputPath, fullPage: true, animations: 'disabled' });
  const metrics = await page.evaluate(() => {
    const cssLinks = Array.from(document.querySelectorAll('link[rel~="stylesheet"]')).map((link, index) => ({
      index,
      href: link.getAttribute('href') || '',
      resolvedPath: new URL(link.href, window.location.href).pathname +
        new URL(link.href, window.location.href).search,
    }));
    const main = document.querySelector('#kc-main, main');
    const header = document.querySelector('header, .kc-header');
    const mainRect = main ? main.getBoundingClientRect() : null;
    const headerRect = header ? header.getBoundingClientRect() : null;
    const doc = document.documentElement;
    const body = document.body;

    return {
      title: document.title,
      h1Text: (document.querySelector('h1') && document.querySelector('h1').textContent || '').trim(),
      bodyClass: body ? body.className : '',
      cssLinks,
      stylesCssLinkCount: cssLinks.filter((link) => /\/assets\/css\/styles\.css(?:\?|$)/.test(link.resolvedPath)).length,
      futureSplitLinkCount: cssLinks.filter((link) => /\/assets\/css\/future-split\//.test(link.resolvedPath)).length,
      clientWidth: doc.clientWidth,
      scrollWidth: doc.scrollWidth,
      scrollHeight: doc.scrollHeight,
      overflowX: doc.scrollWidth > doc.clientWidth + 1,
      mainBounds: mainRect ? {
        x: Math.round(mainRect.x),
        y: Math.round(mainRect.y),
        width: Math.round(mainRect.width),
        height: Math.round(mainRect.height),
      } : null,
      headerBounds: headerRect ? {
        x: Math.round(headerRect.x),
        y: Math.round(headerRect.y),
        width: Math.round(headerRect.width),
        height: Math.round(headerRect.height),
      } : null,
    };
  });

  await context.close();
  const screenshotBytes = fs.statSync(outputPath).size;

  return {
    route: route.path,
    routeId: route.id,
    group: route.group,
    viewport: viewport.id,
    viewportSize: { width: viewport.width, height: viewport.height },
    status: response ? response.status() : 0,
    ok: response ? response.ok() : false,
    screenshot: toRelative(outputPath),
    screenshotBytes,
    screenshotSha256: sha256File(outputPath),
    consoleErrors: summarizeConsole(consoleMessages),
    pageErrors,
    metrics,
  };
}

function buildSummary(entries) {
  return {
    captures: entries.length,
    routes: new Set(entries.map((entry) => entry.routeId)).size,
    viewports: new Set(entries.map((entry) => entry.viewport)).size,
    failedResponses: entries.filter((entry) => !entry.ok).map((entry) => `${entry.route} ${entry.viewport} ${entry.status}`),
    overflowX: entries.filter((entry) => entry.metrics.overflowX).map((entry) => `${entry.route} ${entry.viewport}`),
    consoleErrorCaptures: entries.filter((entry) => entry.consoleErrors.length || entry.pageErrors.length).length,
    futureSplitCaptures: entries.filter((entry) => entry.metrics.futureSplitLinkCount > 0).length,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.outputDir, { recursive: true });

  const server = await ensureServer(options);
  const browser = await chromium.launch();
  const entries = [];

  try {
    for (const viewport of VIEWPORTS) {
      for (const route of ROUTES) {
        const entry = await captureRoute(browser, options, route, viewport);
        entries.push(entry);
        console.log(
          `[css-baseline] ${entry.ok ? 'OK' : 'FAIL'} ${route.path} ${viewport.id} ` +
          `status=${entry.status} overflowX=${entry.metrics.overflowX ? 'yes' : 'no'}`
        );
      }
    }
  } finally {
    await browser.close();
    if (server.instance) await closeServer(server.instance);
  }

  const manifest = {
    schema: 1,
    kind: 'kino-campus-css-visual-baseline',
    runId: path.basename(options.outputDir),
    createdAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
    server: server.reused ? 'reused' : 'spawned',
    scope: {
      cssRuntimeChanged: false,
      htmlRuntimeChanged: false,
      futureSplitLoaded: false,
      routes: ROUTES,
      viewports: VIEWPORTS.map((viewport) => ({
        id: viewport.id,
        width: viewport.width,
        height: viewport.height,
      })),
    },
    entries,
  };
  manifest.summary = buildSummary(entries);

  const manifestPath = path.join(options.outputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  if (options.json) {
    console.log(JSON.stringify(manifest, null, 2));
  } else {
    console.log(`[css-baseline] screenshots: ${entries.length}`);
    console.log(`[css-baseline] manifest: ${toRelative(manifestPath)}`);
    console.log(`[css-baseline] failedResponses: ${manifest.summary.failedResponses.length}`);
    console.log(`[css-baseline] overflowX: ${manifest.summary.overflowX.length}`);
    console.log(`[css-baseline] futureSplitCaptures: ${manifest.summary.futureSplitCaptures}`);
  }

  if (manifest.summary.failedResponses.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[css-baseline] FALHOU: ${error.message}`);
  process.exit(1);
});

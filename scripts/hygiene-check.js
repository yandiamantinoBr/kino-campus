#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const canonicalVersion = '8.6.0';
const profileControllerLineGate = 700;
const errors = [];
const warnings = [];

const versionFiles = [
  'assets/js/kc-env.js',
  'assets/js/kc-api.client.js',
  'assets/js/kc-supabase.client.js',
  'assets/js/kc-auth.ui.js',
  'assets/js/kc-profiles.client.js',
];

const htmlFiles = [
  ...readHtmlFiles(rootDir),
  ...readHtmlFiles(path.join(rootDir, 'admin'), 'admin'),
];

const kcuScriptChain = [
  'kc-utils.string.js',
  'kc-utils.format.js',
  'kc-utils.dom.js',
  'kc-utils.identity.js',
  'kc-utils.taxonomy.js',
  'kc-utils.location.js',
  'kc-utils.presentation.js',
  'kc-utils.js',
];

const kcadAdminDashboardScriptChain = [
  '../assets/js/controllers/admin-dashboard.shared.js',
  '../assets/js/controllers/admin-dashboard.metrics.js',
  '../assets/js/controllers/admin-dashboard.audit.js',
  '../assets/js/controllers/admin-dashboard.charts.js',
  '../assets/js/kc-ranking.js',
  '../assets/js/controllers/admin-dashboard.controller.js',
];

const kclaScriptChain = [
  'local.notifications.adapter.js',
  'local.ratings.adapter.js',
  'local.saved.adapter.js',
  'local.posts-read.adapter.js',
  'local.posts-write.adapter.js',
  'local.profile.adapter.js',
  'local.help.adapter.js',
];

const kcprProfileScriptChain = [
  'assets/js/controllers/profile.presentation.js',
  'assets/js/controllers/profile.collections.js',
  'assets/js/controllers/profile.ratings.js',
  'assets/js/controllers/profile.flow.js',
  'assets/js/controllers/profile.controller.js',
];

const inlineHandlers = new Set([
  'onabort', 'onauxclick', 'onbeforeinput', 'onbeforematch', 'onbeforetoggle',
  'onblur', 'oncancel', 'oncanplay', 'oncanplaythrough', 'onchange', 'onclick',
  'onclose', 'oncontextlost', 'oncontextmenu', 'oncontextrestored', 'oncopy',
  'oncuechange', 'oncut', 'ondblclick', 'ondrag', 'ondragend', 'ondragenter',
  'ondragleave', 'ondragover', 'ondragstart', 'ondrop', 'ondurationchange',
  'onemptied', 'onended', 'onerror', 'onfocus', 'onformdata', 'oninput',
  'oninvalid', 'onkeydown', 'onkeypress', 'onkeyup', 'onload', 'onloadeddata',
  'onloadedmetadata', 'onloadstart', 'onmousedown', 'onmouseenter',
  'onmouseleave', 'onmousemove', 'onmouseout', 'onmouseover', 'onmouseup',
  'onpaste', 'onpause', 'onplay', 'onplaying', 'onprogress', 'onratechange',
  'onreset', 'onresize', 'onscroll', 'onsecuritypolicyviolation', 'onseeked',
  'onseeking', 'onselect', 'onslotchange', 'onstalled', 'onsubmit',
  'onsuspend', 'ontimeupdate', 'ontoggle', 'onvolumechange', 'onwaiting',
  'onwheel',
]);

runVersionChecks();
runThemeBootChecks();
runKcffScriptChainChecks();
runKcuScriptChainChecks();
runKcadScriptChainChecks();
runKclaScriptChainChecks();
runKcprProfileScriptChainChecks();
runLocalAdapterGateChecks();
runProfileControllerGateChecks();
runInlineHandlerChecks();
runProfileContractChecks();
runDeployInvariantChecks();
runQaWarnings();

if (warnings.length) {
  console.warn('Warnings:');
  warnings.forEach((warning) => console.warn(`- ${warning}`));
}

if (errors.length) {
  console.error('Hygiene check failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Hygiene check passed for version ${canonicalVersion}.`);
}

function runVersionChecks() {
  versionFiles.forEach((file) => {
    const content = read(file);
    const expected = `const VERSION = '${canonicalVersion}';`;
    if (!content.includes(expected)) {
      errors.push(`${file} is missing canonical VERSION ${canonicalVersion}`);
    }
  });

  const readme = normalize(read('README.md'));
  if (!readme.includes(`versao-alvo unica atual: **\`${canonicalVersion}\`**`)) {
    errors.push('README.md is missing the canonical front version map header');
  }
  if (!readme.includes(`assets/js/kc-profiles.client.js`) || !readme.includes(`auth ui v${canonicalVersion}`)) {
    errors.push('README.md is missing the canonical version references for kc-profiles/auth UI');
  }

  const changelog = read('CHANGELOG.md');
  if (!new RegExp(`^## \\[${escapeRegExp(canonicalVersion)}\\] - 2026-03-30$`, 'm').test(changelog)) {
    errors.push(`CHANGELOG.md is missing the top entry for ${canonicalVersion}`);
  }
}

function runThemeBootChecks() {
  htmlFiles.forEach(({ relPath, absPath }) => {
    const content = fs.readFileSync(absPath, 'utf8');
    const hasBootJs = /kc-theme-boot\.js/.test(content);
    const hasBootCss = /kc-theme-boot\.css/.test(content);
    if (hasBootJs && !hasBootCss) {
      errors.push(`${relPath} loads kc-theme-boot.js without kc-theme-boot.css`);
    }
  });
}

function runKcffScriptChainChecks() {
  htmlFiles.forEach(({ relPath, absPath }) => {
    const content = fs.readFileSync(absPath, 'utf8');
    const expected = buildExpectedKcffScriptChain(relPath);
    const found = extractKcffScriptChain(content);

    if (!sameStringArray(found, expected)) {
      errors.push(
        `${relPath} has invalid KCFF script chain. expected: ${expected.join(' -> ')}; found: ${found.length ? found.join(' -> ') : '(none)'}`
      );
    }
  });
}

function runKcuScriptChainChecks() {
  htmlFiles.forEach(({ relPath, absPath }) => {
    const content = fs.readFileSync(absPath, 'utf8');
    const expected = buildExpectedKcuScriptChain(relPath);
    const found = extractKcuScriptChain(content);

    if (!sameStringArray(found, expected)) {
      errors.push(
        `${relPath} has invalid _KCU.* script chain. expected: ${expected.join(' -> ')}; found: ${found.length ? found.join(' -> ') : '(none)'}`
      );
    }
  });
}

function runKcadScriptChainChecks() {
  htmlFiles
    .filter(({ relPath }) => relPath === 'admin/index.html')
    .forEach(({ relPath, absPath }) => {
      const content = fs.readFileSync(absPath, 'utf8');
      const expected = kcadAdminDashboardScriptChain.slice();
      const found = extractKcadScriptChain(content);

      if (!sameStringArray(found, expected)) {
        errors.push(
          `${relPath} has invalid _KCAD.* admin dashboard chain. expected: ${expected.join(' -> ')}; found: ${found.length ? found.join(' -> ') : '(none)'}`
        );
      }
    });
}

function runKclaScriptChainChecks() {
  htmlFiles.forEach(({ relPath, absPath }) => {
    const content = fs.readFileSync(absPath, 'utf8');
    const expected = buildExpectedKclaScriptChain(relPath);
    const found = extractKclaScriptChain(content);

    if (!sameStringArray(found, expected)) {
      errors.push(
        `${relPath} has invalid _KCLA.* script chain. expected: ${expected.join(' -> ')}; found: ${found.length ? found.join(' -> ') : '(none)'}`
      );
    }
  });
}

function runKcprProfileScriptChainChecks() {
  htmlFiles
    .filter(({ relPath }) => relPath === 'profile.html')
    .forEach(({ relPath, absPath }) => {
      const content = fs.readFileSync(absPath, 'utf8');
      const expected = kcprProfileScriptChain.slice();
      const found = extractKcprProfileScriptChain(content);

      if (!sameStringArray(found, expected)) {
        errors.push(
          `${relPath} has invalid _KCPR.* profile script chain. expected: ${expected.join(' -> ')}; found: ${found.length ? found.join(' -> ') : '(none)'}`
        );
      }
    });
}

function runLocalAdapterGateChecks() {
  const content = read('assets/js/adapters/local.adapter.js');
  const lineCount = countLines(content);

  if (lineCount >= 500) {
    errors.push(`assets/js/adapters/local.adapter.js must stay below 500 lines for the v12.4.8 gate (found ${lineCount})`);
  }
}

function runProfileControllerGateChecks() {
  const content = read('assets/js/controllers/profile.controller.js');
  const lineCount = countLines(content);

  if (lineCount >= profileControllerLineGate) {
    errors.push(
      `assets/js/controllers/profile.controller.js must stay below ${profileControllerLineGate} lines for the v12.5.5 gate (found ${lineCount})`
    );
  }
}

function runInlineHandlerChecks() {
  htmlFiles.forEach(({ relPath, absPath }) => {
    const content = fs.readFileSync(absPath, 'utf8');
    const matches = [...content.matchAll(/\s([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=/g)];
    matches.forEach((match) => {
      const attr = String(match[1] || '').toLowerCase();
      if (inlineHandlers.has(attr)) {
        errors.push(`${relPath} contains inline handler ${attr}`);
      }
    });
  });
}

function runProfileContractChecks() {
  const profilesClient = read('assets/js/kc-profiles.client.js');
  const apiClient = read('assets/js/kc-api.client.js');

  const disallowedProfilesPatterns = [
    /\bemail\s*:\s*u\.email\b/,
    /\bemail\s*:\s*user\.email\b/,
    /\bconst email = r\.email\b/,
    /\br\.email\b/,
    /\bfb\.email\b/,
  ];

  disallowedProfilesPatterns.forEach((pattern) => {
    if (pattern.test(profilesClient)) {
      errors.push(`assets/js/kc-profiles.client.js still exposes profile email contract: ${pattern}`);
    }
  });

  if (/\bemail\s*:\s*user\.email\b/.test(apiClient)) {
    errors.push('assets/js/kc-api.client.js still persists email in the profile sync fallback');
  }
}

function runDeployInvariantChecks() {
  const vercel = JSON.parse(read('vercel.json'));

  if (vercel.buildCommand !== 'node scripts/inject-env.js') {
    errors.push('vercel.json must keep buildCommand = node scripts/inject-env.js');
  }

  const hasAuthCallbackRewrite = Array.isArray(vercel.rewrites) && vercel.rewrites.some((rewrite) =>
    rewrite &&
    rewrite.source === '/auth/callback' &&
    rewrite.destination === '/auth-callback.html'
  );
  if (!hasAuthCallbackRewrite) {
    errors.push('vercel.json must keep the /auth/callback rewrite');
  }

  const cspHeader = findCspHeader(vercel);
  if (!cspHeader) {
    errors.push('vercel.json is missing the global Content-Security-Policy header');
  } else {
    const csp = String(cspHeader);
    if (!csp.includes('connect-src')) {
      errors.push('vercel.json CSP is missing connect-src');
    }
    if (!csp.includes('https://*.supabase.co') || !csp.includes('wss://*.supabase.co')) {
      errors.push('vercel.json CSP connect-src must allow Supabase HTTPS and WSS endpoints');
    }
    if (!csp.includes("script-src 'self' https://cdn.jsdelivr.net")) {
      errors.push('vercel.json CSP must preserve script-src compatibility for the Supabase/browser runtime');
    }
  }

  const kcEnv = read('assets/js/kc-env.js');
  ['__KC_SUPABASE_URL__', '__KC_SUPABASE_ANON_KEY__', '__KC_DRIVER__', '__KC_APP_ENV__'].forEach((token) => {
    if (!kcEnv.includes(token)) {
      errors.push(`assets/js/kc-env.js is missing placeholder ${token}`);
    }
  });
}

function runQaWarnings() {
  const qaDir = path.join(rootDir, 'docs', 'qa');
  if (!fs.existsSync(qaDir)) return;

  const reportFiles = fs.readdirSync(qaDir).filter((name) => /^report-v.+\.md$/i.test(name));
  const groups = new Map();

  reportFiles.forEach((name) => {
    const normalized = name.replace(/\.0(?=-run\d+\.md$)/g, '');
    const current = groups.get(normalized) || [];
    current.push(name);
    groups.set(normalized, current);
  });

  groups.forEach((group) => {
    if (group.length > 1) {
      warnings.push(`Potentially redundant QA report naming preserved for history: ${group.join(', ')}`);
    }
  });
}

function read(relPath) {
  return fs.readFileSync(path.join(rootDir, relPath), 'utf8');
}

function readHtmlFiles(dir, prefix = '') {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.html'))
    .map((name) => ({
      relPath: toPosix(path.join(prefix, name)),
      absPath: path.join(dir, name),
    }));
}

function buildExpectedKcuScriptChain(relPath) {
  const prefix = relPath.startsWith('admin/') ? '../assets/js' : 'assets/js';
  return kcuScriptChain.map((file) => `${prefix}/${file}`);
}

function buildExpectedKclaScriptChain(relPath) {
  const prefix = relPath.startsWith('admin/') ? '../assets/js/adapters' : 'assets/js/adapters';
  return kclaScriptChain.map((file) => `${prefix}/${file}`);
}

function buildExpectedKcffScriptChain(relPath) {
  const prefix = relPath.startsWith('admin/') ? '../assets/js' : 'assets/js';
  return [
    `${prefix}/kc-env.js`,
    `${prefix}/kc-feature-flags.js`,
  ];
}

function extractKcffScriptChain(content) {
  return extractDeferredScriptSrcs(content).filter((src) => isKcffScriptSrc(src));
}

function isKcffScriptSrc(src) {
  return /(?:^|\/)kc-(?:env|feature-flags)\.js$/i.test(String(src || ''));
}

function extractKcuScriptChain(content) {
  return extractDeferredScriptSrcs(content).filter((src) => isKcuScriptSrc(src));
}

function isKcuScriptSrc(src) {
  return /(?:^|\/)kc-utils(?:\.[a-z-]+)?\.js$/i.test(String(src || ''));
}

function extractKcadScriptChain(content) {
  return extractDeferredScriptSrcs(content).filter((src) => isKcadScriptSrc(src));
}

function isKcadScriptSrc(src) {
  return /(?:^|\/)(?:controllers\/admin-dashboard\.(?:shared|metrics|audit|charts|controller)\.js|kc-ranking\.js)$/i.test(String(src || ''));
}

function extractKclaScriptChain(content) {
  return extractDeferredScriptSrcs(content).filter((src) => isKclaScriptSrc(src));
}

function isKclaScriptSrc(src) {
  return /(?:^|\/)adapters\/local\.(?:notifications|ratings|saved|posts-read|posts-write|profile|help)\.adapter\.js$/i.test(String(src || ''));
}

function extractKcprProfileScriptChain(content) {
  return extractDeferredScriptSrcs(content).filter((src) => isKcprProfileScriptSrc(src));
}

function isKcprProfileScriptSrc(src) {
  return /(?:^|\/)controllers\/profile\.(?:presentation|collections|ratings|flow|controller)\.js$/i.test(String(src || ''));
}

function extractDeferredScriptSrcs(content) {
  const scriptTags = [...String(content).matchAll(/<script\b[^>]*>\s*<\/script>/gi)];

  return scriptTags
    .map((match) => String(match[0] || ''))
    .filter((tag) => /\bdefer\b/i.test(tag))
    .map((tag) => {
      const srcMatch = tag.match(/\bsrc=(['"])([^'"]+)\1/i);
      return srcMatch ? stripQueryHash(toPosix(srcMatch[2])) : '';
    })
    .filter(Boolean);
}

function findCspHeader(vercelConfig) {
  const headers = Array.isArray(vercelConfig.headers) ? vercelConfig.headers : [];
  for (const block of headers) {
    const blockHeaders = Array.isArray(block && block.headers) ? block.headers : [];
    for (const header of blockHeaders) {
      if (header && header.key === 'Content-Security-Policy') {
        return header.value;
      }
    }
  }
  return '';
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function stripQueryHash(value) {
  return String(value || '').split(/[?#]/, 1)[0];
}

function normalize(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function countLines(content) {
  const lines = String(content).split(/\r?\n/);
  return lines.length && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
}

function sameStringArray(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

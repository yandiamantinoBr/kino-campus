#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const canonicalVersion = '8.2.6.2';
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
  if (!new RegExp(`^## \\[${escapeRegExp(canonicalVersion)}\\] - 2026-03-19$`, 'm').test(changelog)) {
    errors.push('CHANGELOG.md is missing the top entry for 8.2.6.2');
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

function normalize(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

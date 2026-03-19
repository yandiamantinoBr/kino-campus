#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const canonicalVersion = '8.2.6.1';
const errors = [];
const warnings = [];

const versionChecks = [
  {
    file: 'README.md',
    patterns: [
      /V8\.2\.6\.1/,
      /Versao-alvo unica atual:\s+\*\*`8\.2\.6\.1`\*\*/,
      /`assets\/js\/kc-profiles\.client\.js`[\s\S]{0,24}`8\.2\.6\.1`/,
    ],
  },
  {
    file: 'CHANGELOG.md',
    patterns: [
      /^## \[8\.2\.6\.1\] - 2026-03-19$/m,
    ],
  },
  {
    file: 'assets/js/kc-env.js',
    patterns: [
      /const VERSION = '8\.2\.6\.1';/,
      /Environment Bootstrap \(V8\.2\.6\.1\)/,
    ],
  },
  {
    file: 'assets/js/kc-api.client.js',
    patterns: [
      /const VERSION = '8\.2\.6\.1';/,
      /API Client \(V8\.2\.6\.1\)/,
    ],
  },
  {
    file: 'assets/js/kc-supabase.client.js',
    patterns: [
      /const VERSION = '8\.2\.6\.1';/,
      /Supabase Client \+ Auth Session \(V8\.2\.6\.1\)/,
    ],
  },
  {
    file: 'assets/js/kc-auth.ui.js',
    patterns: [
      /const VERSION = '8\.2\.6\.1';/,
      /Auth UI \(Modal no Header\) \(V8\.2\.6\.1\)/,
    ],
  },
  {
    file: 'assets/js/kc-profiles.client.js',
    patterns: [
      /const VERSION = '8\.2\.6\.1';/,
      /Profiles Client \(V8\.2\.6\.1\)/,
    ],
  },
];

const runtimeHtmlFiles = [
  ...readHtmlFiles(rootDir),
  ...readHtmlFiles(path.join(rootDir, 'admin'), 'admin'),
];

const knownInlineHandlers = new Set([
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
runQaNamingWarnings();

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

function readHtmlFiles(baseDir, prefix = '') {
  if (!fs.existsSync(baseDir)) return [];

  return fs.readdirSync(baseDir)
    .filter((name) => name.endsWith('.html'))
    .map((name) => ({
      relPath: toPosixPath(path.join(prefix, name)),
      absPath: path.join(baseDir, name),
    }));
}

function runVersionChecks() {
  versionChecks.forEach(({ file, patterns }) => {
    const absolutePath = path.join(rootDir, file);
    const content = safeRead(absolutePath);

    patterns.forEach((pattern) => {
      if (!pattern.test(content)) {
        errors.push(`${file} is missing expected version invariant: ${pattern}`);
      }
    });
  });
}

function runThemeBootChecks() {
  runtimeHtmlFiles.forEach(({ relPath, absPath }) => {
    const content = safeRead(absPath);
    const hasBootJs = /kc-theme-boot\.js/.test(content);
    const hasBootCss = /kc-theme-boot\.css/.test(content);

    if (hasBootJs && !hasBootCss) {
      errors.push(`${relPath} loads kc-theme-boot.js without kc-theme-boot.css`);
    }
  });
}

function runInlineHandlerChecks() {
  runtimeHtmlFiles.forEach(({ relPath, absPath }) => {
    const content = safeRead(absPath);
    const matches = [...content.matchAll(/\s([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=/g)];

    matches.forEach((match) => {
      const attributeName = String(match[1] || '').toLowerCase();
      if (knownInlineHandlers.has(attributeName)) {
        errors.push(`${relPath} contains inline handler attribute ${attributeName}`);
      }
    });
  });
}

function runQaNamingWarnings() {
  const qaDir = path.join(rootDir, 'docs', 'qa');
  if (!fs.existsSync(qaDir)) return;

  const reportFiles = fs.readdirSync(qaDir)
    .filter((name) => /^report-v.+\.md$/i.test(name));

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

function safeRead(absolutePath) {
  return fs.readFileSync(absolutePath, 'utf8');
}

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

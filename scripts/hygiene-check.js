#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const canonicalVersion = '8.6.0';
const profileControllerLineGate = 700;

// Pisos de regressao da trilha B2 — estabelecidos em v12.7.3.
// Ajustar APENAS se houver adicao intencional documentada.
const I18N_B2_GATE = {
  minKeys: 440,         // chaves unicas no dicionario (grep por ':' para excluir referencias)
  minLines: 800,        // linhas de kc-i18n.js (previne stripping)
  minAriaMarkings: 189, // data-i18n-aria-label nos 22 HTMLs
  minPlaceholderMarkings: 59,  // data-i18n-placeholder nos 22 HTMLs
  minTooltipMarkings: 55,      // data-i18n-tooltip nos 22 HTMLs
  minAltMarkings: 5,           // data-i18n-alt nos 22 HTMLs
};

const errors = [];
const warnings = [];

const versionFiles = [
  'assets/js/boot/kc-env.js',
  'assets/js/api/kc-api.client.js',
  'assets/js/api/kc-supabase.client.js',
  'assets/js/core/kc-auth.ui.js',
  'assets/js/core/kc-profiles.client.js',
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
  '../assets/js/controllers/admin/admin-dashboard.shared.js',
  '../assets/js/controllers/admin/admin-dashboard.metrics.js',
  '../assets/js/controllers/admin/admin-dashboard.audit.js',
  '../assets/js/controllers/admin/admin-dashboard.charts.js',
  '../assets/js/features/kc-ranking.js',
  '../assets/js/controllers/admin/admin-dashboard.controller.js',
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
  'assets/js/controllers/public/profile.presentation.js',
  'assets/js/controllers/public/profile.collections.js',
  'assets/js/controllers/public/profile.ratings.js',
  'assets/js/controllers/public/profile.flow.js',
  'assets/js/controllers/public/profile.controller.js',
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

runVersionJsonChecks();
runVersionChecks();
runThemeBootChecks();
runI18nMetadataChecks();
runI18nAriaPlaceholderChecks();
runI18nTooltipChecks();
runI18nB2GateChecks();
runA11yStructureChecks();
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

// v13.1.0 — gate VERSION.json (fonte única de versão)
function runVersionJsonChecks() {
  const versionJsonPath = path.join(rootDir, 'VERSION.json');
  if (!fs.existsSync(versionJsonPath)) {
    errors.push('VERSION.json não encontrado na raiz do projeto');
    return;
  }
  let versionData;
  try {
    versionData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
  } catch (e) {
    errors.push('VERSION.json não é JSON válido: ' + e.message);
    return;
  }
  const required = ['project', 'appVersion', 'frontendRuntimeVersion', 'branch', 'status', 'updatedAt'];
  required.forEach((field) => {
    if (typeof versionData[field] !== 'string' || versionData[field].trim() === '') {
      errors.push('VERSION.json: campo "' + field + '" deve ser string não-vazia');
    }
  });
  if (versionData.frontendRuntimeVersion && versionData.frontendRuntimeVersion !== canonicalVersion) {
    errors.push(
      'VERSION.json: frontendRuntimeVersion "' + versionData.frontendRuntimeVersion +
      '" não bate com canonicalVersion "' + canonicalVersion + '"'
    );
  }
  if (versionData.branch && versionData.branch !== 'kinocampus-V47.0-foundations') {
    errors.push(
      'VERSION.json: branch "' + versionData.branch + '" não bate com "kinocampus-V47.0-foundations"'
    );
  }
}

function runVersionChecks() {
  versionFiles.forEach((file) => {
    const content = read(file);
    const expected = `const VERSION = '${canonicalVersion}';`;
    if (!content.includes(expected)) {
      errors.push(`${file} is missing canonical VERSION ${canonicalVersion}`);
    }
  });

  // Nota v17.3.0: checks do README removidos — "Mapa de Versão Canônica" foi
  // extraído do README para VERSION.json + ai-development-guide.md (drift resolvido).
  // A versão canônica 8.6.0 continua validada pelo loop de versionFiles acima.

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

function runI18nMetadataChecks() {
  htmlFiles.forEach(({ relPath, absPath }) => {
    const content = fs.readFileSync(absPath, 'utf8');
    const htmlTag = String(content).match(/<html\b[^>]*>/i);

    if (!htmlTag || !/\sdata-i18n-title="meta-title\.[a-z0-9-]+"/i.test(htmlTag[0])) {
      errors.push(`${relPath} is missing data-i18n-title metadata for the v12.7.0 i18n gate`);
    }
    if (!htmlTag || !/\sdata-i18n-description="meta-description\.[a-z0-9-]+"/i.test(htmlTag[0])) {
      errors.push(`${relPath} is missing data-i18n-description metadata for the v12.7.0 i18n gate`);
    }

    const imageTags = [...String(content).matchAll(/<img\b[^>]*>/gi)].map((match) => String(match[0] || ''));
    imageTags.forEach((tag) => {
      const altMatch = tag.match(/\salt="([^"]*)"/i);
      const alt = altMatch ? altMatch[1] : '';
      if (alt && !/\sdata-i18n-alt="alt\.[a-z0-9-]+"/i.test(tag)) {
        errors.push(`${relPath} has static img alt without data-i18n-alt: ${alt}`);
      }
    });
  });
}

// v12.7.1 — fase 2 i18n runtime: valida marcação declarativa de aria-label e placeholder
function runI18nAriaPlaceholderChecks() {
  const tagWithAriaLabelRe = /<[^>]*\saria-label="[^"]+"[^>]*>/gi;
  const tagWithPlaceholderRe = /<[^>]*\splaceholder="[^"]+"[^>]*>/gi;

  htmlFiles.forEach(({ relPath, absPath }) => {
    const content = fs.readFileSync(absPath, 'utf8');

    // Toda tag com aria-label precisa ter data-i18n-aria-label="aria-label.<key>"
    const ariaTags = [...String(content).matchAll(tagWithAriaLabelRe)].map((match) => String(match[0] || ''));
    ariaTags.forEach((tag) => {
      if (!/\sdata-i18n-aria-label="aria-label\.[a-z0-9-]+"/i.test(tag)) {
        const excerpt = tag.slice(0, 140).replace(/\s+/g, ' ');
        errors.push(`${relPath} has static aria-label without data-i18n-aria-label: ${excerpt}`);
      }
    });

    // Todo input/textarea com placeholder precisa ter data-i18n-placeholder="placeholder.<key>"
    const placeholderTags = [...String(content).matchAll(tagWithPlaceholderRe)].map((match) => String(match[0] || ''));
    placeholderTags.forEach((tag) => {
      if (!/\sdata-i18n-placeholder="placeholder\.[a-z0-9-]+"/i.test(tag)) {
        const excerpt = tag.slice(0, 140).replace(/\s+/g, ' ');
        errors.push(`${relPath} has static placeholder without data-i18n-placeholder: ${excerpt}`);
      }
    });
  });
}

function runI18nTooltipChecks() {
  // Toda tag com title="..." (atributo de elemento, nao <title> nem data-i18n-title no <html>)
  // precisa ter data-i18n-tooltip="tooltip.<key>" correspondente.
  // A regex exclui a linha "<title>..." e o atributo "data-i18n-title" do <html>.
  const tagWithTitleRe = /<(?!title\b)[^>]*\s+title="[^"]+"[^>]*>/gi;

  htmlFiles.forEach(({ relPath, absPath }) => {
    const content = fs.readFileSync(absPath, 'utf8');

    const tags = [...String(content).matchAll(tagWithTitleRe)]
      .map((match) => String(match[0] || ''))
      // ignora o elemento <html> (que tem data-i18n-title para o page-title, nao tooltip)
      .filter((tag) => !/^<html\b/i.test(tag.trim()));

    tags.forEach((tag) => {
      if (!/\sdata-i18n-tooltip="tooltip\.[a-z0-9-]+"/i.test(tag)) {
        const excerpt = tag.slice(0, 140).replace(/\s+/g, ' ');
        errors.push(`${relPath} has static title attribute without data-i18n-tooltip: ${excerpt}`);
      }
    });
  });
}

function runI18nB2GateChecks() {
  const i18nContent = read('assets/js/core/kc-i18n.js');

  // 1. Gate de linhas do modulo
  const lineCount = countLines(i18nContent);
  if (lineCount < I18N_B2_GATE.minLines) {
    errors.push(
      `assets/js/core/kc-i18n.js must stay above ${I18N_B2_GATE.minLines} lines for the v12.7.3 B2 gate (found ${lineCount})`
    );
  }

  // 2. Gate de total de chaves no dicionario (conta entradas 'chave.*': no IIFE)
  const keyMatches = [...i18nContent.matchAll(/'[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*'\s*:/g)];
  const keyCount = new Set(keyMatches.map((m) => m[0].replace(/'\s*:$/, '').replace(/'/g, ''))).size;
  if (keyCount < I18N_B2_GATE.minKeys) {
    errors.push(
      `assets/js/core/kc-i18n.js must have at least ${I18N_B2_GATE.minKeys} unique dictionary keys for the v12.7.3 B2 gate (found ${keyCount})`
    );
  }

  // 3. Gate de totais de markings nos 22 HTMLs
  const counts = { aria: 0, placeholder: 0, tooltip: 0, alt: 0 };
  htmlFiles.forEach(({ absPath }) => {
    const html = fs.readFileSync(absPath, 'utf8');
    counts.aria += (html.match(/data-i18n-aria-label=/g) || []).length;
    counts.placeholder += (html.match(/data-i18n-placeholder=/g) || []).length;
    counts.tooltip += (html.match(/data-i18n-tooltip=/g) || []).length;
    counts.alt += (html.match(/data-i18n-alt=/g) || []).length;
  });

  if (counts.aria < I18N_B2_GATE.minAriaMarkings) {
    errors.push(`data-i18n-aria-label markings dropped below ${I18N_B2_GATE.minAriaMarkings} (found ${counts.aria})`);
  }
  if (counts.placeholder < I18N_B2_GATE.minPlaceholderMarkings) {
    errors.push(`data-i18n-placeholder markings dropped below ${I18N_B2_GATE.minPlaceholderMarkings} (found ${counts.placeholder})`);
  }
  if (counts.tooltip < I18N_B2_GATE.minTooltipMarkings) {
    errors.push(`data-i18n-tooltip markings dropped below ${I18N_B2_GATE.minTooltipMarkings} (found ${counts.tooltip})`);
  }
  if (counts.alt < I18N_B2_GATE.minAltMarkings) {
    errors.push(`data-i18n-alt markings dropped below ${I18N_B2_GATE.minAltMarkings} (found ${counts.alt})`);
  }
}

function runA11yStructureChecks() {
  // Gates estruturais da trilha B3 (v12.8.1) — WCAG 2.1 AA
  htmlFiles.forEach(({ relPath, absPath }) => {
    const html = fs.readFileSync(absPath, 'utf8');

    // 1. Exatamente 1 h1 por pagina
    const h1Count = (html.match(/<h1\b/gi) || []).length;
    if (h1Count !== 1) {
      errors.push(`${relPath}: esperado exatamente 1 <h1>, encontrado ${h1Count} (WCAG 1.3.1, 2.4.6)`);
    }

    // 2. Skip link presente
    if (!html.includes('kc-skip-link') || !html.includes('href="#kc-main"')) {
      errors.push(`${relPath}: skip link ausente — adicionar <a href="#kc-main" class="kc-skip-link"> (WCAG 2.4.1)`);
    }

    // 3. <main id="kc-main"> presente
    if (!/<main\b[^>]*\bid="kc-main"/.test(html)) {
      errors.push(`${relPath}: <main id="kc-main"> ausente — alvo do skip link (WCAG 2.4.1)`);
    }

    // 4. Todo <nav> tem aria-label ou aria-labelledby
    const navTags = (html.match(/<nav\b[^>]*>/gi) || []);
    navTags.forEach((tag) => {
      const hasLabel = /\baria-label="[^"]+"/.test(tag) || /\baria-labelledby="[^"]+"/.test(tag);
      if (!hasLabel) {
        errors.push(`${relPath}: <nav> sem aria-label — "${tag.slice(0, 80)}" (WCAG 1.3.6)`);
      }
    });
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
  const content = read('assets/js/adapters/local/local.adapter.js');
  const lineCount = countLines(content);

  if (lineCount >= 500) {
    errors.push(`assets/js/adapters/local/local.adapter.js must stay below 500 lines for the v12.4.8 gate (found ${lineCount})`);
  }
}

function runProfileControllerGateChecks() {
  const content = read('assets/js/controllers/public/profile.controller.js');
  const lineCount = countLines(content);

  if (lineCount >= profileControllerLineGate) {
    errors.push(
      `assets/js/controllers/public/profile.controller.js must stay below ${profileControllerLineGate} lines for the v12.5.5 gate (found ${lineCount})`
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
  const profilesClient = read('assets/js/core/kc-profiles.client.js');
  const apiClient = read('assets/js/api/kc-api.client.js');

  const disallowedProfilesPatterns = [
    /\bemail\s*:\s*u\.email\b/,
    /\bemail\s*:\s*user\.email\b/,
    /\bconst email = r\.email\b/,
    /\br\.email\b/,
    /\bfb\.email\b/,
  ];

  disallowedProfilesPatterns.forEach((pattern) => {
    if (pattern.test(profilesClient)) {
      errors.push(`assets/js/core/kc-profiles.client.js still exposes profile email contract: ${pattern}`);
    }
  });

  if (/\bemail\s*:\s*user\.email\b/.test(apiClient)) {
    errors.push('assets/js/api/kc-api.client.js still persists email in the profile sync fallback');
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

  const kcEnv = read('assets/js/boot/kc-env.js');
  ['__KC_SUPABASE_URL__', '__KC_SUPABASE_ANON_KEY__', '__KC_DRIVER__', '__KC_APP_ENV__'].forEach((token) => {
    if (!kcEnv.includes(token)) {
      errors.push(`assets/js/boot/kc-env.js is missing placeholder ${token}`);
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
  const prefix = relPath.startsWith('admin/') ? '../assets/js/utils' : 'assets/js/utils';
  return kcuScriptChain.map((file) => `${prefix}/${file}`);
}

function buildExpectedKclaScriptChain(relPath) {
  const prefix = relPath.startsWith('admin/') ? '../assets/js/adapters/local' : 'assets/js/adapters/local';
  return kclaScriptChain.map((file) => `${prefix}/${file}`);
}

function buildExpectedKcffScriptChain(relPath) {
  const prefix = relPath.startsWith('admin/') ? '../assets/js' : 'assets/js';
  return [
    `${prefix}/boot/kc-env.js`,
    `${prefix}/boot/kc-feature-flags.js`,
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
  return /(?:^|\/)(?:controllers\/admin\/admin-dashboard\.(?:shared|metrics|audit|charts|controller)\.js|kc-ranking\.js)$/i.test(String(src || ''));
}

function extractKclaScriptChain(content) {
  return extractDeferredScriptSrcs(content).filter((src) => isKclaScriptSrc(src));
}

function isKclaScriptSrc(src) {
  return /(?:^|\/)adapters\/local\/local\.(?:notifications|ratings|saved|posts-read|posts-write|profile|help)\.adapter\.js$/i.test(String(src || ''));
}

function extractKcprProfileScriptChain(content) {
  return extractDeferredScriptSrcs(content).filter((src) => isKcprProfileScriptSrc(src));
}

function isKcprProfileScriptSrc(src) {
  return /(?:^|\/)controllers\/public\/profile\.(?:presentation|collections|ratings|flow|controller)\.js$/i.test(String(src || ''));
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

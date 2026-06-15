#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FACADE_PATH = path.join(ROOT, 'assets/js/api/kc-api.client.js');
const API_DIR = path.join(ROOT, 'assets/js/api');

const MODULE_FILES = Object.freeze({
  auth: 'kc-api.auth.js',
  authors: 'kc-api.authors.js',
  chat: 'kc-api.chat.js',
  commentsVotes: 'kc-api.comments-votes.js',
  diagnostics: 'kc-api.diagnostics.js',
  filters: 'kc-api.filters.js',
  help: 'kc-api.help.js',
  notifications: 'kc-api.notifications.js',
  postsFeed: 'kc-api.posts-feed.js',
  postsNormalize: 'kc-api.posts-normalize.js',
  postsRead: 'kc-api.posts-read.js',
  postsWrite: 'kc-api.posts-write.js',
  profiles: 'kc-api.profiles.js',
  ratings: 'kc-api.ratings.js',
  related: 'kc-api.related.js',
  saved: 'kc-api.saved.js',
  session: 'kc-api.session.js',
});

const BOOTSTRAP_CORE = new Set([
  'readEnv',
  'bootstrapConfig',
  'setConfig',
  'withTimeout',
  'fetchJSON',
  'apiURL',
  'kcApiError',
  'enforceSupabaseOnProduction',
  'getDatabaseRaw',
  'getDatabaseNormalized',
  'registerAdapter',
  'getActiveDriver',
]);

const MUTATION_BRIDGE = new Set([
  'isPostMutationOk',
  'getPostMutationData',
  'emitPostMutation',
]);

const GLOBAL_ALIASES = new Set([
  'getLastCreatePostError',
  'setLastCreatePostError',
  'clearLastCreatePostError',
  'summarizeCreatePayloadForDiagnostics',
]);

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function lineCount(text) {
  return text.split(/\r?\n/u).length;
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r?\n/u).length;
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }

    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function findMatchingParen(source, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }

    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function extractFacadeMembers(source) {
  const facadeStart = source.indexOf('window.KCAPI = Object.freeze({');
  const globalsStart = source.indexOf('window.getLastCreatePostError = getLastCreatePostError;');
  if (facadeStart < 0 || globalsStart < facadeStart) {
    throw new Error('Bloco window.KCAPI nao encontrado.');
  }

  const block = source.slice(facadeStart, globalsStart);
  const members = block.split(/\r?\n/u).reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('window.KCAPI') || trimmed === '});') {
      return acc;
    }

    const getter = trimmed.match(/^get\s+([A-Za-z0-9_$]+)\s*\(/u);
    if (getter) {
      acc.push(getter[1]);
      return acc;
    }

    const alias = trimmed.match(/^([A-Za-z0-9_$]+)\s*:/u);
    if (alias) {
      acc.push(alias[1]);
      return acc;
    }

    const shorthand = trimmed.match(/^([A-Za-z0-9_$]+),$/u);
    if (shorthand) acc.push(shorthand[1]);
    return acc;
  }, []);

  return {
    count: members.length,
    members,
    startLine: lineNumberAt(source, facadeStart),
    endLine: lineNumberAt(source, globalsStart) - 1,
  };
}

function extractNamespaces(source) {
  const matches = new Map();
  const addNamespace = (name, index) => {
    if (matches.has(name)) return;
    matches.set(name, {
      name,
      line: lineNumberAt(source, index),
      file: MODULE_FILES[name] || null,
      fileExists: Boolean(MODULE_FILES[name] && fs.existsSync(path.join(API_DIR, MODULE_FILES[name]))),
    });
  };

  const initRegex = /window\._KCAPI\.([A-Za-z0-9_$]+)\s*=\s*window\._KCAPI\.([A-Za-z0-9_$]+)\s*\|\|\s*\{\};/gu;
  let match;
  while ((match = initRegex.exec(source))) {
    addNamespace(match[1], match.index);
  }

  const passthroughRegex = /window\._KCAPI\.([A-Za-z0-9_$]+)\s*=\s*[A-Za-z0-9_$]+\s*;/gu;
  while ((match = passthroughRegex.exec(source))) {
    addNamespace(match[1], match.index);
  }

  return Array.from(matches.values()).sort((a, b) => a.line - b.line);
}

function extractFunctions(source, publicMembers) {
  const functions = [];
  const regex = /\b(async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gu;
  let match;
  while ((match = regex.exec(source))) {
    const signatureOpenIndex = source.indexOf('(', match.index);
    const signatureCloseIndex = signatureOpenIndex >= 0
      ? findMatchingParen(source, signatureOpenIndex)
      : -1;
    const openIndex = signatureCloseIndex >= 0
      ? source.indexOf('{', signatureCloseIndex)
      : -1;
    if (openIndex < 0) continue;
    const closeIndex = findMatchingBrace(source, openIndex);
    if (closeIndex < 0) continue;

    const block = source.slice(match.index, closeIndex + 1);
    const name = match[2];
    const startLine = lineNumberAt(source, match.index);
    const endLine = lineNumberAt(source, closeIndex);
    const isAsync = Boolean(match[1]);

    functions.push({
      name,
      async: isAsync,
      startLine,
      endLine,
      lines: endLine - startLine + 1,
      exported: publicMembers.has(name) || GLOBAL_ALIASES.has(name),
      bucket: classifyFunction(name, block, publicMembers),
      flags: buildFunctionFlags(name, block),
    });

    regex.lastIndex = closeIndex + 1;
  }
  return functions;
}

function classifyFunction(name, block, publicMembers) {
  if (BOOTSTRAP_CORE.has(name)) return 'bootstrap-driver-core';
  if (MUTATION_BRIDGE.has(name)) return 'post-mutation-bridge';
  if (/^get[A-Za-z0-9_$]+Module$/u.test(name)) return 'module-accessors';
  if (/^build[A-Za-z0-9_$]+Deps$/u.test(name)) return 'dependency-builders';
  if (/^normalizeUserRating/u.test(name)) return 'rating-normalizer-wrappers';
  if (name === 'normalizePost' || name === 'filterPosts') return 'public-normalizer-filter-wrappers';
  if (/^getMockUsers/u.test(name) || name === 'getAuthorById' || name === 'resolveAuthorId') return 'author-public-wrappers';
  if (GLOBAL_ALIASES.has(name)) return 'diagnostics-global-wrappers';
  if (publicMembers.has(name)) return block.includes('getActiveDriver') || block.includes('Module')
    ? 'public-delegation-wrappers'
    : 'public-facade-helpers';
  return 'internal-helpers';
}

function buildFunctionFlags(name, block) {
  return {
    delegatesToModule: /Module\(\)|[A-Za-z0-9_$]+Module\./u.test(block),
    usesActiveDriver: /getActiveDriver\s*\(/u.test(block),
    hasUnavailableFallback: /ok:\s*false|return\s+\[\]|return\s+null|return\s+0|UNAVAILABLE|DRIVER_NAO_SUPORTA|Modo local/u.test(block),
    mutatesFacadeState: /cfg\.|_adapters|window\._KCAPI|window\.KCAPI|window\.get/u.test(block),
    exportedAlias: GLOBAL_ALIASES.has(name),
  };
}

function aggregateByBucket(functions) {
  const buckets = new Map();
  functions.forEach((fn) => {
    if (!buckets.has(fn.bucket)) {
      buckets.set(fn.bucket, {
        bucket: fn.bucket,
        functions: 0,
        lines: 0,
        exported: 0,
        delegatesToModule: 0,
        usesActiveDriver: 0,
        hasUnavailableFallback: 0,
        names: [],
      });
    }

    const bucket = buckets.get(fn.bucket);
    bucket.functions += 1;
    bucket.lines += fn.lines;
    if (fn.exported) bucket.exported += 1;
    if (fn.flags.delegatesToModule) bucket.delegatesToModule += 1;
    if (fn.flags.usesActiveDriver) bucket.usesActiveDriver += 1;
    if (fn.flags.hasUnavailableFallback) bucket.hasUnavailableFallback += 1;
    bucket.names.push(fn.name);
  });

  return Array.from(buckets.values()).sort((a, b) => {
    if (b.lines !== a.lines) return b.lines - a.lines;
    return a.bucket.localeCompare(b.bucket);
  });
}

function buildModuleInventory() {
  return Object.entries(MODULE_FILES).map(([namespace, file]) => {
    const fullPath = path.join(API_DIR, file);
    const exists = fs.existsSync(fullPath);
    const text = exists ? readText(fullPath) : '';
    return {
      namespace,
      file: `assets/js/api/${file}`,
      exists,
      lines: exists ? lineCount(text) : 0,
      bytes: exists ? Buffer.byteLength(text) : 0,
    };
  }).sort((a, b) => a.namespace.localeCompare(b.namespace));
}

function buildCandidates(functions) {
  const byName = new Map(functions.map((fn) => [fn.name, fn]));

  return [
    {
      id: 'post-mutation-bridge',
      priority: 'P1',
      title: 'Reavaliar ponte emitPostMutation apos wrappers de posts-write',
      functions: ['isPostMutationOk', 'getPostMutationData', 'emitPostMutation'],
      target: 'assets/js/api/kc-api.posts-write.js',
      rationale: 'A ponte de eventos de mutacao ainda vive no facade por compatibilidade com fallbacks de escrita.',
      risk: 'Medio/alto: eventos publicos de freshness e UI de posts podem depender da ordem atual.',
    },
    {
      id: 'bootstrap-driver-core',
      priority: 'P3',
      title: 'Manter bootstrap/env/driver no facade por enquanto',
      functions: ['readEnv', 'setConfig', 'withTimeout', 'fetchJSON', 'apiURL', 'getDatabaseRaw', 'getDatabaseNormalized', 'registerAdapter', 'getActiveDriver'],
      target: 'Sem extracao imediata',
      rationale: 'E a base de boot local/supabase e tem maior raio de regressao.',
      risk: 'Alto: qualquer mudanca pode afetar todas as paginas e drivers.',
    },
  ].map((candidate) => {
    const present = candidate.functions
      .map((name) => byName.get(name))
      .filter(Boolean);
    return {
      ...candidate,
      presentFunctions: present.map((fn) => ({
        name: fn.name,
        lines: fn.lines,
        startLine: fn.startLine,
        endLine: fn.endLine,
      })),
      totalLines: present.reduce((sum, fn) => sum + fn.lines, 0),
    };
  });
}

function buildReport() {
  const source = readText(FACADE_PATH);
  const facade = extractFacadeMembers(source);
  const publicMembers = new Set(facade.members);
  const functions = extractFunctions(source, publicMembers);
  const buckets = aggregateByBucket(functions);
  const namespaces = extractNamespaces(source);
  const modules = buildModuleInventory();
  const candidates = buildCandidates(functions);

  return {
    generatedAt: new Date().toISOString(),
    facade: {
      path: 'assets/js/api/kc-api.client.js',
      lines: lineCount(source),
      bytes: Buffer.byteLength(source),
      publicMembers: facade.count,
      publicFacadeStartLine: facade.startLine,
      publicFacadeEndLine: facade.endLine,
      functionCount: functions.length,
      exportedFunctionCount: functions.filter((fn) => fn.exported).length,
      moduleNamespaceCount: namespaces.length,
    },
    namespaces,
    modules,
    buckets,
    candidates,
    functions,
  };
}

function toMarkdown(report) {
  const lines = [];
  lines.push(`# KCAPI residual facade inventory`);
  lines.push('');
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push('');
  lines.push(`- Facade: \`${report.facade.path}\``);
  lines.push(`- Size: ${report.facade.lines.toLocaleString('pt-BR')} lines / ${report.facade.bytes.toLocaleString('pt-BR')} bytes`);
  lines.push(`- Public members: ${report.facade.publicMembers}`);
  lines.push(`- Function declarations: ${report.facade.functionCount}`);
  lines.push(`- Exported/global wrapper functions: ${report.facade.exportedFunctionCount}`);
  lines.push(`- _KCAPI namespaces initialized: ${report.facade.moduleNamespaceCount}`);
  lines.push('');

  lines.push('## Buckets');
  lines.push('');
  lines.push('| Bucket | Functions | Lines | Exported | Delegates | Driver | Fallbacks |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  report.buckets.forEach((bucket) => {
    lines.push(`| ${bucket.bucket} | ${bucket.functions} | ${bucket.lines} | ${bucket.exported} | ${bucket.delegatesToModule} | ${bucket.usesActiveDriver} | ${bucket.hasUnavailableFallback} |`);
  });
  lines.push('');

  lines.push('## Candidates');
  lines.push('');
  lines.push('| Priority | Candidate | Lines | Target | Risk |');
  lines.push('|---|---|---:|---|---|');
  report.candidates.forEach((candidate) => {
    lines.push(`| ${candidate.priority} | ${candidate.title} | ${candidate.totalLines} | \`${candidate.target}\` | ${candidate.risk} |`);
  });
  lines.push('');

  lines.push('## Namespaces');
  lines.push('');
  lines.push('| Namespace | File | Exists |');
  lines.push('|---|---|---|');
  report.namespaces.forEach((namespace) => {
    lines.push(`| \`${namespace.name}\` | ${namespace.file ? `\`${namespace.file}\`` : '-'} | ${namespace.fileExists ? 'yes' : 'no'} |`);
  });

  return lines.join('\n');
}

function main() {
  const json = process.argv.includes('--json');
  const report = buildReport();
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(toMarkdown(report));
}

main();

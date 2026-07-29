'use strict';

const fs = require('fs');
const path = require('path');

const VERSIONED_HTML_ASSET_RE = /((?:src|href)\s*=\s*["'][^"']*assets\/[^"'?]+\?v=)[0-9A-Za-z._-]+/gi;
const HTML_ASSET_REF_RE = /(?:src|href)\s*=\s*["']([^"']*assets\/[^"']+)["']/gi;
const CACHE_VERSION_RE = /var\s+CACHE_VERSION\s*=\s*['"][^'"]+['"]\s*;/;
const SHELL_ASSETS_RE = /var\s+SHELL_ASSETS\s*=\s*\[([\s\S]*?)\]\s*;/;
const VERSION_VALUE_RE = /[?&]v=([^&#"']+)/i;

function normalizeBuildRevision(value) {
  return String(value || '')
    .trim()
    .replace(/[^0-9A-Za-z._-]/g, '')
    .slice(0, 40);
}

function resolveBuildRevision(env = process.env) {
  const source = env && typeof env === 'object' ? env : {};
  const candidates = [
    source.KC_BUILD_REVISION,
    source.VERCEL_GIT_COMMIT_SHA,
    source.GITHUB_SHA,
    source.VERCEL_DEPLOYMENT_ID,
    source.BUILD_ID,
  ];
  for (const candidate of candidates) {
    const revision = normalizeBuildRevision(candidate);
    if (revision) return revision;
  }
  return '';
}

function collectHtmlFiles(root) {
  const files = [];
  function walk(directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
        files.push(fullPath);
      }
    }
  }
  walk(path.resolve(root));
  return files.sort();
}

function rewriteHtmlAssetRevisions(html, revision) {
  return String(html || '').replace(VERSIONED_HTML_ASSET_RE, `$1${revision}`);
}

function rewriteServiceWorkerRevision(source, revision) {
  const cacheVersion = `kc-shell-${revision}`;
  let next = String(source || '');
  const shellMatch = next.match(SHELL_ASSETS_RE);
  if (!shellMatch) throw new Error('DIST_SW_SHELL_ASSETS_MISSING');
  if (!CACHE_VERSION_RE.test(next)) throw new Error('DIST_SW_CACHE_VERSION_MISSING');

  const rewrittenShell = shellMatch[0].replace(
    /(\?v=)[0-9A-Za-z._-]+/g,
    `$1${revision}`,
  );
  next = next.replace(shellMatch[0], rewrittenShell);
  next = next.replace(
    CACHE_VERSION_RE,
    `var CACHE_VERSION = '${cacheVersion}';`,
  );
  return next;
}

function versionedHtmlAssets(html) {
  const assets = [];
  const source = String(html || '');
  let match;
  HTML_ASSET_REF_RE.lastIndex = 0;
  while ((match = HTML_ASSET_REF_RE.exec(source)) !== null) {
    const asset = String(match[1] || '');
    if (!/\.(?:js|css)(?:[?#]|$)/i.test(asset)) continue;
    assets.push(asset);
  }
  return assets;
}

function shellAssetUrls(serviceWorker) {
  const match = String(serviceWorker || '').match(SHELL_ASSETS_RE);
  if (!match) throw new Error('DIST_SW_SHELL_ASSETS_MISSING');
  return Array.from(match[1].matchAll(/['"]([^'"]*\/assets\/[^'"]+)['"]/g))
    .map((entry) => String(entry[1] || ''))
    .filter(Boolean);
}

function readRevisionFromCacheVersion(serviceWorker) {
  const match = String(serviceWorker || '').match(
    /var\s+CACHE_VERSION\s*=\s*['"]kc-shell-([^'"]+)['"]\s*;/,
  );
  return match ? normalizeBuildRevision(match[1]) : '';
}

function assertAssetRevision(asset, revision, context) {
  const versionMatch = String(asset || '').match(VERSION_VALUE_RE);
  if (!versionMatch) {
    throw new Error(`DIST_ASSET_REVISION_MISSING:${context}:${asset}`);
  }
  if (versionMatch[1] !== revision) {
    throw new Error(
      `DIST_ASSET_REVISION_MISMATCH:${context}:${versionMatch[1]}!=${revision}:${asset}`,
    );
  }
}

function verifyStaticCacheArtifact(options = {}) {
  const outputRoot = path.resolve(options.outputRoot || path.join(__dirname, '..', 'dist'));
  const swPath = path.join(outputRoot, 'sw.js');
  if (!fs.existsSync(outputRoot)) throw new Error(`DIST_OUTPUT_MISSING:${outputRoot}`);
  if (!fs.existsSync(swPath)) throw new Error(`DIST_SW_MISSING:${swPath}`);

  const serviceWorker = fs.readFileSync(swPath, 'utf8');
  const cacheRevision = readRevisionFromCacheVersion(serviceWorker);
  const expectedRevision = normalizeBuildRevision(options.revision || cacheRevision);
  if (!expectedRevision) throw new Error('DIST_BUILD_REVISION_MISSING');
  if (cacheRevision !== expectedRevision) {
    throw new Error(`DIST_CACHE_REVISION_MISMATCH:${cacheRevision}!=${expectedRevision}`);
  }

  const shellAssets = shellAssetUrls(serviceWorker);
  if (!shellAssets.length) throw new Error('DIST_SW_SHELL_ASSETS_EMPTY');
  shellAssets.forEach((asset) => assertAssetRevision(asset, expectedRevision, 'sw'));

  const htmlFiles = collectHtmlFiles(outputRoot);
  if (!htmlFiles.length) throw new Error('DIST_HTML_MISSING');
  let htmlAssetCount = 0;
  htmlFiles.forEach((htmlPath) => {
    const relativePath = path.relative(outputRoot, htmlPath).replace(/\\/g, '/');
    const assets = versionedHtmlAssets(fs.readFileSync(htmlPath, 'utf8'));
    htmlAssetCount += assets.length;
    assets.forEach((asset) => assertAssetRevision(asset, expectedRevision, relativePath));
  });
  if (!htmlAssetCount) throw new Error('DIST_HTML_VERSIONED_ASSETS_MISSING');

  return Object.freeze({
    outputRoot,
    revision: expectedRevision,
    cacheVersion: `kc-shell-${expectedRevision}`,
    htmlFiles: htmlFiles.length,
    htmlAssets: htmlAssetCount,
    shellAssets: shellAssets.length,
  });
}

function applyStaticCacheRevision(options = {}) {
  const outputRoot = path.resolve(options.outputRoot || path.join(__dirname, '..', 'dist'));
  const revision = normalizeBuildRevision(options.revision);
  if (!revision) throw new Error('DIST_BUILD_REVISION_REQUIRED');

  const htmlFiles = collectHtmlFiles(outputRoot);
  if (!htmlFiles.length) throw new Error('DIST_HTML_MISSING');
  let changedHtml = 0;
  htmlFiles.forEach((htmlPath) => {
    const current = fs.readFileSync(htmlPath, 'utf8');
    const next = rewriteHtmlAssetRevisions(current, revision);
    if (next !== current) {
      fs.writeFileSync(htmlPath, next, 'utf8');
      changedHtml += 1;
    }
  });

  const swPath = path.join(outputRoot, 'sw.js');
  if (!fs.existsSync(swPath)) throw new Error(`DIST_SW_MISSING:${swPath}`);
  const currentSw = fs.readFileSync(swPath, 'utf8');
  const nextSw = rewriteServiceWorkerRevision(currentSw, revision);
  fs.writeFileSync(swPath, nextSw, 'utf8');

  const verified = verifyStaticCacheArtifact({ outputRoot, revision });
  return Object.freeze({
    ...verified,
    changedHtml,
  });
}

if (require.main === module) {
  const mode = String(process.argv[2] || '');
  const outputRoot = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.join(__dirname, '..', 'dist');
  if (mode !== '--check') {
    console.error('Usage: node scripts/static-cache-revision.js --check [dist-directory]');
    process.exit(2);
  }
  try {
    const result = verifyStaticCacheArtifact({ outputRoot });
    console.log(
      `Static cache artifact valid: ${result.revision} `
      + `(${result.htmlFiles} HTML, ${result.htmlAssets} asset refs, ${result.shellAssets} precache refs).`,
    );
  } catch (error) {
    console.error(`Static cache artifact invalid: ${error && error.message ? error.message : error}`);
    process.exit(1);
  }
}

module.exports = Object.freeze({
  normalizeBuildRevision,
  resolveBuildRevision,
  collectHtmlFiles,
  rewriteHtmlAssetRevisions,
  rewriteServiceWorkerRevision,
  verifyStaticCacheArtifact,
  applyStaticCacheRevision,
});

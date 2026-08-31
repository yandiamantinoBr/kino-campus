'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const { minify_sync: minifySync } = require('terser');

// These are classic scripts with shared globals and per-file strict-mode
// boundaries. This formatter only removes formatting/comments: never concatenate, wrap,
// rename, transpile, drop code or change evaluation/loading order.
// A separate guarded build step may group the reviewed home definition IIFEs
// AFTER this formatter; initializers and all other scripts stay separate.
// https://terser.org/docs/api-reference/
const MINIFY_OPTIONS = Object.freeze({
  compress: false,
  mangle: false,
  module: false,
  toplevel: false,
  keep_classnames: true,
  keep_fnames: true,
  sourceMap: false,
  format: Object.freeze({
    comments: /^!|@preserve|@license|@cc_on|copyright|spdx-license-identifier|\blicense\b/i,
    ascii_only: false,
    keep_quoted_props: true,
    quote_style: 3,
    semicolons: true,
  }),
});

function assertChildPath(parent, child) {
  const relative = path.relative(parent, child);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error(`STATIC_JAVASCRIPT_OUTPUT_UNSAFE:${child}`);
  }
}

function minifyJavaScript(source, filename = 'asset.js') {
  const original = String(source);
  try {
    const result = minifySync({ [filename]: original }, MINIFY_OPTIONS);
    if (!result || typeof result.code !== 'string') {
      throw new Error('Minifier did not return JavaScript');
    }
    // Parse as a classic script without executing it. A malformed artifact must
    // fail the build, rather than silently publish an untested fallback.
    const output = result.code ? result.code + '\n' : '';
    new vm.Script(output, { filename });
    return Buffer.byteLength(output) <= Buffer.byteLength(original) ? output : original;
  } catch (cause) {
    throw new Error(`STATIC_JAVASCRIPT_MINIFY_FAILED:${filename}`, { cause });
  }
}

function minifyStaticJavaScript({ sourceRoot, outputRoot }) {
  const source = fs.realpathSync(sourceRoot);
  const output = fs.realpathSync(outputRoot);
  assertChildPath(source, output);
  // An explicit output root may not overlap any original frontend sources.
  const sourceAssets = path.join(source, 'assets');
  const assetsRelative = path.relative(sourceAssets, output);
  if (!assetsRelative || (!assetsRelative.startsWith('..' + path.sep) && assetsRelative !== '..' && !path.isAbsolute(assetsRelative))) {
    throw new Error(`STATIC_JAVASCRIPT_OUTPUT_UNSAFE:${output}`);
  }

  const scriptsRoot = path.join(output, 'assets', 'js');
  const files = [];
  function collect(directory) {
    if (!fs.existsSync(directory)) return;
    if (fs.lstatSync(directory).isSymbolicLink()) {
      throw new Error(`STATIC_JAVASCRIPT_SYMLINK:${directory}`);
    }
    assertChildPath(output, fs.realpathSync(directory));
    fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).forEach((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`STATIC_JAVASCRIPT_SYMLINK:${target}`);
      if (entry.isDirectory()) collect(target);
      else if (entry.isFile() && entry.name.endsWith('.js')) files.push(target);
    });
  }
  collect(scriptsRoot);

  // Prepare every artifact first. A parse error leaves all copied JS intact;
  // the caller fails closed and no partial optimized output is deployed.
  const artifacts = files.map((filename) => {
    const before = fs.readFileSync(filename, 'utf8');
    const relativePath = path.relative(output, filename).split(path.sep).join('/');
    return { filename, before, after: minifyJavaScript(before, relativePath) };
  });
  const result = { files: artifacts.length, changedFiles: 0, bytesBefore: 0, bytesAfter: 0, gzipBefore: 0, gzipAfter: 0 };
  artifacts.forEach(({ filename, before, after }) => {
    result.bytesBefore += Buffer.byteLength(before);
    result.bytesAfter += Buffer.byteLength(after);
    result.gzipBefore += zlib.gzipSync(before).length;
    result.gzipAfter += zlib.gzipSync(after).length;
    if (after !== before) {
      fs.writeFileSync(filename, after, 'utf8');
      result.changedFiles += 1;
    }
  });
  return Object.freeze(result);
}

module.exports = Object.freeze({ MINIFY_OPTIONS, minifyJavaScript, minifyStaticJavaScript });

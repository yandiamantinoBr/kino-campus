'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { isDeepStrictEqual, TextDecoder } = require('util');
const { tokenize, TokenType } = require('@csstools/css-tokenizer');

// Deliberately not a CSS optimizer: only compact explanations BETWEEN complete
// top-level rules. Even comments inside values can be observable through CSSOM
// (custom properties, @property initial-value, var() fallbacks). Keep all tokens
// inside blocks/functions/preludes, plus whitespace, raw escapes, URLs and order.
// Empty comments retain token boundaries: `a/* explanation */b` must NOT become
// `ab` or `a b`. The tokenizer is pinned and its raw round trip is checked.
// https://github.com/csstools/postcss-plugins/tree/main/packages/css-tokenizer
// https://www.w3.org/TR/css-syntax-3/#consume-comments
const COMPACT_COMMENT = '/**/';
const SOURCE_MAP_DIRECTIVE = /\bsourceMappingURL\s*=|\bsourceURL\s*=/i;
const PROTECTED_COMMENT = /^\/\*!|@(?:license|preserve|cc_on)\b|\bcopyright\b|\bspdx(?:-license-identifier)?\b|\blicen[cs]e\b/i;
const LEGACY_COMMENT = /\b(?:hack|ie[0-9]*|internet\s+explorer|macie|tantek|opera|netscape|konqueror)\b|\[\s*(?:if|endif)\b|<!--|-->/i;

function preserveCssComment(comment) {
  const body = comment.slice(2, -2);
  return PROTECTED_COMMENT.test(comment) || SOURCE_MAP_DIRECTIVE.test(comment)
    // CSS comment hacks may rely on an empty body, a backslash before */ or
    // nested-looking delimiters. Do not reinterpret any such legacy syntax.
    || /[\\/]/.test(body) || LEGACY_COMMENT.test(body)
    || !/[\p{L}\p{N}]/u.test(body) || body.trim().length < 8;
}

function checkedTokens(source) {
  const errors = [];
  const tokens = tokenize({ css: source }, { onParseError: (error) => errors.push(error) });
  if (errors.length) throw new Error('CSS tokenizer reported a parse error');
  if (tokens.map((token) => token[1]).join('') !== source) {
    throw new Error('CSS tokenizer did not preserve the exact raw source');
  }
  return tokens;
}

function compactableCommentIndexes(tokens) {
  const comments = new Set();
  const closing = new Map([
    [TokenType.Function, TokenType.CloseParen],
    [TokenType.OpenParen, TokenType.CloseParen],
    [TokenType.OpenSquare, TokenType.CloseSquare],
    [TokenType.OpenCurly, TokenType.CloseCurly],
  ]);
  const closingTypes = new Set(closing.values());
  const stack = [];
  let ruleBoundary = true;
  tokens.forEach((token, index) => {
    const type = token[0];
    if (type === TokenType.Comment) {
      if (!stack.length && ruleBoundary && !preserveCssComment(token[1])) comments.add(index);
      return;
    }
    if (type === TokenType.Whitespace || type === TokenType.EOF) return;
    if (closing.has(type)) {
      stack.push(closing.get(type));
      ruleBoundary = false;
    } else if (closingTypes.has(type)) {
      // Browsers recover from unmatched delimiters. Leave such a stylesheet
      // wholly unchanged instead of guessing which later comments are safe.
      if (stack.pop() !== type) throw new Error('CSS_UNBALANCED_BLOCK');
      if (!stack.length) ruleBoundary = type === TokenType.CloseCurly;
    } else if (!stack.length) {
      if (type === TokenType.Semicolon) ruleBoundary = true;
      else if (type !== TokenType.CDO && type !== TokenType.CDC) ruleBoundary = false;
    }
  });
  if (stack.length) throw new Error('CSS_UNBALANCED_BLOCK');
  return comments;
}

function assertIdenticalCssTokens(before, after) {
  if (before.length !== after.length) throw new Error('CSS token count changed');
  const compactable = compactableCommentIndexes(before);
  for (let index = 0; index < before.length; index += 1) {
    const original = before[index];
    const output = after[index];
    if (original[0] === TokenType.Comment) {
      const expected = compactable.has(index) ? COMPACT_COMMENT : original[1];
      if (output[0] !== TokenType.Comment || output[1] !== expected) {
        throw new Error(`CSS comment contract changed at token ${index}`);
      }
    } else if (!isDeepStrictEqual([original[0], original[1], original[4]], [output[0], output[1], output[4]])) {
      // Only source offsets [2]/[3] may change. Raw whitespace and decoded token
      // data are both observable and are compared without normalization.
      throw new Error(`CSS non-comment token changed at token ${index}`);
    }
  }
}

function minifyCssComments(source, filename = 'asset.css') {
  const original = String(source);
  try {
    const before = checkedTokens(original);
    // Keeping a sourceMappingURL while moving columns/lines would invalidate
    // that map. Preserve the entire file until a map-aware build is requested.
    if (before.some((token) => token[0] === TokenType.Comment && SOURCE_MAP_DIRECTIVE.test(token[1]))) return original;
    let compactable;
    try { compactable = compactableCommentIndexes(before); }
    catch (error) {
      if (error.message === 'CSS_UNBALANCED_BLOCK') return original;
      throw error;
    }
    const output = before.map((token, index) => compactable.has(index) ? COMPACT_COMMENT : token[1]).join('');
    assertIdenticalCssTokens(before, checkedTokens(output));
    if (Buffer.byteLength(output) > Buffer.byteLength(original)) throw new Error('CSS output grew');
    return output;
  } catch (cause) {
    throw new Error(`STATIC_CSS_MINIFY_FAILED:${filename}`, { cause });
  }
}

function assertChildPath(parent, child) {
  const relative = path.relative(parent, child);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error(`STATIC_CSS_OUTPUT_UNSAFE:${child}`);
  }
}

function minifyStaticCssComments({ sourceRoot, outputRoot }) {
  if (fs.lstatSync(outputRoot).isSymbolicLink()) throw new Error(`STATIC_CSS_SYMLINK:${outputRoot}`);
  const source = fs.realpathSync(sourceRoot);
  const output = fs.realpathSync(outputRoot);
  assertChildPath(source, output);
  const sourceAssets = path.join(source, 'assets');
  const assetsRelative = path.relative(sourceAssets, output);
  if (!assetsRelative || (!assetsRelative.startsWith('..' + path.sep) && assetsRelative !== '..' && !path.isAbsolute(assetsRelative))) {
    throw new Error(`STATIC_CSS_OUTPUT_UNSAFE:${output}`);
  }

  const assetsRoot = path.join(output, 'assets');
  try {
    if (fs.lstatSync(assetsRoot).isSymbolicLink()) throw new Error(`STATIC_CSS_SYMLINK:${assetsRoot}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const cssRoot = path.join(assetsRoot, 'css');
  const files = [];
  function collect(directory) {
    let stats;
    try { stats = fs.lstatSync(directory); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (stats.isSymbolicLink()) throw new Error(`STATIC_CSS_SYMLINK:${directory}`);
    assertChildPath(output, fs.realpathSync(directory));
    fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).forEach((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`STATIC_CSS_SYMLINK:${target}`);
      if (entry.isDirectory()) collect(target);
      else if (entry.isFile() && entry.name.endsWith('.css')) {
        if (fs.statSync(target).nlink > 1) throw new Error(`STATIC_CSS_HARDLINK:${target}`);
        files.push(target);
      }
    });
  }
  collect(cssRoot);

  // Prepare and validate EVERY stylesheet before replacing any copied CSS.
  // Invalid UTF-8 must also fail closed, rather than silently replacing bytes.
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const artifacts = files.map((filename) => {
    const relativePath = path.relative(output, filename).split(path.sep).join('/');
    let before;
    try { before = decoder.decode(fs.readFileSync(filename)); }
    catch (cause) { throw new Error(`STATIC_CSS_MINIFY_FAILED:${relativePath}`, { cause }); }
    return { filename, before, after: minifyCssComments(before, relativePath) };
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

module.exports = Object.freeze({
  COMPACT_COMMENT,
  preserveCssComment,
  assertIdenticalCssTokens,
  minifyCssComments,
  minifyStaticCssComments,
});

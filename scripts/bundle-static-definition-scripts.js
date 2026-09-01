'use strict';

// Reviewed, explicitly enabled by the production build. Run AFTER format-only JS minification and
// BEFORE static-cache-revision. Never concatenate boot code or lazy-load APIs.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { TextDecoder } = require('util');
const acorn = require('acorn');
const parse5 = require('parse5');
const { minifyJavaScript } = require('./minify-static-javascript');

const GROUPS = Object.freeze([
  ['utils', [
    'utils/kc-utils.string.js', 'utils/kc-utils.format.js', 'utils/kc-utils.dom.js',
    'utils/kc-utils.identity.js', 'utils/kc-utils.taxonomy.js', 'utils/kc-utils.location.js',
    'utils/kc-utils.presentation.js',
  ]],
  ['api-definitions', [
    'api/kc-supabase.posts.js', 'api/kc-supabase.ratings.js', 'api/kc-api.notifications.js',
    'api/kc-api.saved.js', 'api/kc-api.help.js', 'api/kc-api.posts-read.js',
    'api/kc-api.comments-votes.js', 'api/kc-api.ratings.js', 'api/kc-api.posts-feed.js',
    'api/kc-api.posts-write.js', 'api/kc-api.profiles.js', 'api/kc-api.related.js',
    'api/kc-api.auth.js', 'api/kc-api.diagnostics.js',
  ]],
  ['adapter-definitions', [
    'adapters/local/local.notifications.adapter.js', 'adapters/local/local.ratings.adapter.js',
    'adapters/local/local.saved.adapter.js', 'adapters/local/local.posts-read.adapter.js',
    'adapters/local/local.posts-write.adapter.js', 'adapters/local/local.profile.adapter.js',
    'adapters/local/local.help.adapter.js', 'adapters/supabase/supabase.analytics.adapter.js',
    'adapters/supabase/supabase.admin.adapter.js', 'adapters/supabase/supabase.comments.adapter.js',
    'adapters/supabase/supabase.votes.adapter.js', 'adapters/supabase/supabase.media.adapter.js',
  ]],
  ['create-definitions', [
    'features/create-post/kc-create-post.media.js', 'features/create-post/kc-create-post.resolvers.js',
    'features/create-post/kc-create-post.fields.js', 'features/create-post/kc-create-post.submit.js',
    'features/create-post/kc-create-post.render.js',
  ]],
].map(([name, files]) => Object.freeze({ name, files: Object.freeze(files.map(file => 'assets/js/' + file)) })));

const ERROR_PREFIX = 'STATIC_DEFINITION_BUNDLE';
function fail(reason, detail) { throw new Error(`${ERROR_PREFIX}_${reason}:${detail}`); }

function walkAst(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(entry => walkAst(entry, visit)); return; }
  if (node.type) visit(node);
  Object.entries(node).forEach(([key, value]) => {
    if (!['start', 'end', 'loc', 'range'].includes(key)) walkAst(value, visit);
  });
}

function memberPath(node) {
  if (node && node.type === 'Identifier') return node.name;
  if (!node || node.type !== 'MemberExpression' || node.optional) return '';
  const property = node.computed
    ? (node.property.type === 'Literal' ? node.property.value : null)
    : node.property.name;
  return typeof property === 'string' ? `${memberPath(node.object)}.${property}` : '';
}

function parseScript(source, filename) {
  const comments = [];
  let program;
  try {
    program = acorn.parse(source, { ecmaVersion: 2022, sourceType: 'script', allowHashBang: false, onComment: comments });
  } catch (cause) {
    throw new Error(`${ERROR_PREFIX}_SYNTAX:${filename}`, { cause });
  }
  if (comments.some(comment => /[#@]\s*source(?:Mapping)?URL\s*=/.test(comment.value))) fail('SOURCE_MAP', filename);
  return program;
}

// Structural evaluation allowlist, not an automatically refreshed source hash.
// Function bodies are definitions, but ALL code is scanned for script identity,
// eval/import/document.write. Only a few built-ins may run while registering.
function assertDefinitionScript(source, filename = 'definition.js') {
  const program = parseScript(String(source), filename);
  const statements = program.body.filter(node => node.type !== 'EmptyStatement');
  let expression = statements.length === 1 && statements[0].type === 'ExpressionStatement' && statements[0].expression;
  if (expression && expression.type === 'UnaryExpression' && ['!', 'void'].includes(expression.operator)) expression = expression.argument;
  const fn = expression && expression.type === 'CallExpression' && expression.callee;
  if (!fn || fn.type !== 'FunctionExpression' || fn.id || fn.async || fn.generator || fn.params.length || expression.arguments.length) {
    fail('NOT_DEFINITION_IIFE', filename);
  }
  if (!fn.body.body[0] || fn.body.body[0].directive !== 'use strict') fail('INNER_STRICT_REQUIRED', filename);

  walkAst(program, node => {
    if (node.type === 'ImportExpression' || node.type === 'MetaProperty'
      || (node.type === 'Identifier' && ['eval', 'Function', 'currentScript'].includes(node.name))
      || (node.type === 'Literal' && ['eval', 'Function', 'currentScript'].includes(node.value))) fail('SCRIPT_IDENTITY', filename);
    if (node.type === 'MemberExpression') {
      const name = memberPath(node);
      if (/(^|\.)(?:document)\.(?:write|writeln)$/.test(name)
        || (node.computed && /(^|\.)document$/.test(memberPath(node.object)))) fail('SCRIPT_IDENTITY', filename);
    }
  });

  const builtins = new Set(['window', 'document', 'Object', 'Map', 'Set']);
  const bindings = new Set();
  function collectBindings(node) {
    if (node.type === 'FunctionDeclaration') {
      if (node.id) bindings.add(node.id.name);
      return;
    }
    if (node.type === 'VariableDeclaration') node.declarations.forEach(declaration => {
      if (declaration.id.type !== 'Identifier') fail('EVALUATION_BINDING', filename);
      bindings.add(declaration.id.name);
    });
    if (node.type === 'BlockStatement') node.body.forEach(collectBindings);
    if (node.type === 'IfStatement') {
      collectBindings(node.consequent);
      if (node.alternate) collectBindings(node.alternate);
    }
  }
  fn.body.body.forEach(collectBindings);
  if ([...bindings].some(name => builtins.has(name))) fail('SHADOWED_BUILTIN', filename);
  const namespace = /^window\.(?:_KCU|_KCAPI|_KCSA|_KCLA|_KCCreatePost|KCSupabase)$/;
  const assignment = /^window\.(?:_KCU|_KCAPI|_KCSA|_KCLA|_KCCreatePost|KCSupabase)(?:\.[A-Za-z_$][\w$]*)?$/;
  function primitive(node) {
    if (node.type === 'Literal') return !node.regex;
    if (node.type === 'UnaryExpression' && ['+', '-'].includes(node.operator)) return primitive(node.argument);
    if (node.type === 'BinaryExpression') return primitive(node.left) && primitive(node.right);
    return false;
  }

  function safeExpression(node) {
    if (!node) return;
    switch (node.type) {
      case 'Literal': return;
      case 'Identifier':
        if (!bindings.has(node.name) && !['undefined', 'document'].includes(node.name)) fail('EVALUATION_IDENTIFIER', filename);
        return;
      case 'FunctionExpression': case 'ArrowFunctionExpression': return;
      case 'MemberExpression':
        if (node.computed || node.optional || (!namespace.test(memberPath(node))
          && !(filename === 'assets/js/utils/kc-utils.presentation.js' && memberPath(node) === 'document.addEventListener'))) fail('EVALUATION_MEMBER', filename);
        return;
      case 'ArrayExpression': node.elements.forEach(safeExpression); return;
      case 'ObjectExpression':
        node.properties.forEach(property => {
          if (property.type !== 'Property' || property.computed || property.kind !== 'init'
            || ['__proto__', 'prototype', 'constructor'].includes(property.key.name || property.key.value)) fail('EVALUATION_PROPERTY', filename);
          safeExpression(property.value);
        });
        return;
      case 'UnaryExpression':
        if (!['typeof', '!', 'void'].includes(node.operator) && !primitive(node)) fail('EVALUATION_UNARY', filename);
        safeExpression(node.argument);
        return;
      case 'BinaryExpression':
        if (!['===', '!=='].includes(node.operator) && !primitive(node)) fail('EVALUATION_COERCION', filename);
        safeExpression(node.left); safeExpression(node.right); return;
      case 'LogicalExpression':
        safeExpression(node.left); safeExpression(node.right); return;
      case 'ConditionalExpression':
        safeExpression(node.test); safeExpression(node.consequent); safeExpression(node.alternate); return;
      case 'AssignmentExpression':
        if (node.operator !== '=' || (!assignment.test(memberPath(node.left))
          && !(filename === 'assets/js/adapters/supabase/supabase.media.adapter.js' && memberPath(node.left) === 'window.KCCompressImage'))
          || node.left.computed || /\.(?:__proto__|prototype|constructor)$/.test(memberPath(node.left))) fail('EVALUATION_ASSIGNMENT', filename);
        safeExpression(node.right); return;
      case 'NewExpression':
        if (node.callee.type !== 'Identifier' || !['Map', 'Set'].includes(node.callee.name)
          || node.arguments.length > 1 || node.arguments.some(argument => argument.type !== 'ArrayExpression'
            || argument.elements.some(element => !element || element.type !== 'Literal' || element.regex))) fail('EVALUATION_NEW', filename);
        node.arguments.forEach(safeExpression); return;
      case 'CallExpression':
        if (memberPath(node.callee) === 'Object.freeze' && node.arguments.length === 1
          && ['ObjectExpression', 'ArrayExpression'].includes(node.arguments[0].type)) {
          safeExpression(node.arguments[0]); return;
        }
        // Existing CSP-safe avatar fallback must be installed before first render.
        // data-kc-image-candidates: o fallback de imagem do card usa o mesmo
        // padrao (capture 'error' + handler nomeado + capture=true).
        if (filename === 'assets/js/utils/kc-utils.presentation.js' && memberPath(node.callee) === 'document.addEventListener'
          && node.arguments.length === 3 && node.arguments[0].value === 'error'
          && node.arguments[1].type === 'Identifier'
          && ['_handleFeedAvatarError', '_handlePostCardImageError'].includes(node.arguments[1].name)
          && node.arguments[2].value === true) return;
        fail('EVALUATION_CALL', filename);
        break;
      default: fail('EVALUATION_EXPRESSION', `${filename}:${node.type}`);
    }
  }

  function safeStatement(node) {
    switch (node.type) {
      case 'EmptyStatement': case 'FunctionDeclaration': return;
      case 'VariableDeclaration':
        node.declarations.forEach(declaration => {
          if (declaration.id.type !== 'Identifier') fail('EVALUATION_BINDING', filename);
          safeExpression(declaration.init);
        });
        return;
      case 'ExpressionStatement': safeExpression(node.expression); return;
      case 'BlockStatement': node.body.forEach(safeStatement); return;
      case 'IfStatement':
        safeExpression(node.test); safeStatement(node.consequent);
        if (node.alternate) safeStatement(node.alternate);
        return;
      default: fail('EVALUATION_STATEMENT', `${filename}:${node.type}`);
    }
  }
  fn.body.body.forEach(safeStatement);
  return program;
}

function wrapDefinition(source, filename) {
  if (!/^[A-Za-z0-9_./-]+\.js$/.test(filename)) fail('FILENAME', filename);
  assertDefinitionScript(source, filename);
  // No function wrapper, directive propagation, eval, or change to original
  // function text. Native reportError preserves synchronous/cancelable error
  // reporting while allowing the next file to register. Unsupported engines
  // report the SAME thrown value on a later timer task (ordering differs).
  return `/* ${filename} */\ntry {\n${source}\n} catch (kcDefinitionBundleError) {\n`
    + `  if (typeof window.reportError === 'function') window.reportError(kcDefinitionBundleError);\n`
    + `  else window.setTimeout(function () { throw kcDefinitionBundleError; }, 0);\n}\n`;
}

function inspectHtml(html) {
  const errors = [];
  const tree = parse5.parse(html, { sourceCodeLocationInfo: true, onParseError: error => errors.push(error) });
  if (errors.some(error => error.code === 'duplicate-attribute')) fail('HTML_DUPLICATE_ATTRIBUTE', 'index.html');
  const scripts = [];
  function visit(node) {
    if (node.tagName === 'script') scripts.push(node);
    (node.childNodes || []).forEach(visit);
  }
  visit(tree);
  return scripts;
}

function scriptSource(node) { return (node.attrs || []).find(attribute => attribute.name === 'src')?.value || ''; }
function assetPath(node) { return scriptSource(node).split('?')[0]; }
function assertTag(node) {
  const attrs = node.attrs || [];
  const location = node.sourceCodeLocation;
  if (node.parentNode?.tagName !== 'body' || !location?.startTag || !location?.endTag
    || attrs.length !== 2 || !attrs.some(attribute => attribute.name === 'src')
    || !attrs.some(attribute => attribute.name === 'defer' && attribute.value === '')
    || node.childNodes?.some(child => child.value && child.value.trim())) fail('HTML_SCRIPT_ATTRIBUTES', scriptSource(node));
  if (!/^assets\/js\/[A-Za-z0-9_./-]+\.js(?:\?v=[0-9A-Za-z._-]+)?$/.test(scriptSource(node))) fail('HTML_SCRIPT_URL', scriptSource(node));
}

function groupNodes(html, scripts, group) {
  const nodes = group.files.map(file => {
    const matches = scripts.filter(node => assetPath(node) === file);
    if (matches.length !== 1) fail('HTML_GROUP_MEMBERS', `${group.name}:${file}`);
    assertTag(matches[0]);
    return matches[0];
  });
  for (let i = 1; i < nodes.length; i += 1) {
    const before = nodes[i - 1].sourceCodeLocation.endOffset;
    const after = nodes[i].sourceCodeLocation.startOffset;
    if (after < before || !/^\s*$/.test(html.slice(before, after))) fail('HTML_GROUP_NOT_CONTIGUOUS', group.name);
  }
  return nodes;
}

function inside(root, target) {
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) fail('UNSAFE_PATH', target);
  return relative;
}

function checkedPath(root, relative, allowMissing = false) {
  const target = path.resolve(root, relative);
  inside(root, target);
  let cursor = root;
  for (const part of path.relative(root, target).split(path.sep)) {
    cursor = path.join(cursor, part);
    if (!fs.existsSync(cursor)) {
      // existsSync is false for dangling symbolic links; lstat still detects one.
      try { fs.lstatSync(cursor); fail('SYMLINK', cursor); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (allowMissing) continue;
      fail('MISSING', cursor);
    }
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) fail('SYMLINK', cursor);
    if (!stat.isDirectory() && !stat.isFile()) fail('NOT_REGULAR', cursor);
    if (stat.isFile() && stat.nlink !== 1) fail('HARDLINK', cursor);
    inside(root, fs.realpathSync(cursor));
  }
  return target;
}

function readUtf8(filename) {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(fs.readFileSync(filename)); }
  catch (cause) { throw new Error(`${ERROR_PREFIX}_UTF8:${filename}`, { cause }); }
}

function extendDefinitionShellPrecache(serviceWorker, groups) {
  const program = parseScript(serviceWorker, 'sw.js');
  const declarations = [];
  walkAst(program, node => { if (node.type === 'VariableDeclarator' && node.id?.name === 'SHELL_ASSETS') declarations.push(node); });
  const array = declarations.length === 1 && declarations[0].init;
  if (!array || array.type !== 'ArrayExpression' || array.elements.some(node => !node || node.type !== 'Literal' || typeof node.value !== 'string')) {
    fail('SW_SHELL_ARRAY', 'sw.js');
  }
  const urls = array.elements.map(node => node.value);
  const paths = new Set(urls.map(url => url.split('?')[0].replace(/^\//, '')));
  // Other pages retain their original files. If the previous install precached
  // a definition now contained in a home bundle, preserve that offline coverage
  // by ALSO precaching the corresponding bundle, not by removing the originals.
  const additions = groups.filter(group => group.sources.some(file => paths.has(file)))
    .map(group => {
      if (!/^assets\/js\/bundles\/kc-home-[a-z-]+\.[a-f0-9]{20}\.js\?v=[0-9A-Za-z._-]{1,40}$/.test(group.url)) fail('SW_BUNDLE_URL', group.url);
      return '/' + group.url;
    }).filter(url => !urls.includes(url));
  if (!additions.length) return serviceWorker;
  const newline = serviceWorker.includes('\r\n') ? '\r\n' : '\n';
  const replacement = '[' + newline + urls.concat(additions).map(url => '  ' + JSON.stringify(url) + ',').join(newline) + newline + ']';
  return serviceWorker.slice(0, array.start) + replacement + serviceWorker.slice(array.end);
}

function bundleStaticDefinitionScripts(options = {}) {
  const source = path.resolve(options.sourceRoot || path.join(__dirname, '..'));
  const output = path.resolve(options.outputRoot || path.join(source, 'dist'));
  for (const root of [source, output]) {
    const stat = fs.lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('UNSAFE_ROOT', root);
  }
  const relativeOutput = inside(source, output);
  const firstPart = relativeOutput.split(path.sep)[0];
  if (!/^dist(?:[-_][A-Za-z0-9_-]+)?$/.test(firstPart)
    && !(firstPart === 'output' && relativeOutput.split(path.sep).length > 1)) fail('UNSAFE_OUTPUT', output);
  checkedPath(source, relativeOutput);
  if (fs.realpathSync(source) !== source || fs.realpathSync(output) !== output) fail('UNSAFE_ROOT', output);
  const sourceHtmlPath = checkedPath(source, 'index.html');
  const outputHtmlPath = checkedPath(output, 'index.html');
  const sourceHtml = readUtf8(sourceHtmlPath);
  const html = readUtf8(outputHtmlPath);
  const originalScripts = inspectHtml(sourceHtml);
  const scripts = inspectHtml(html);
  const replacements = [];
  const artifacts = [];

  // Prepare and validate ALL groups before creating a directory or writing.
  for (const group of GROUPS) {
    groupNodes(sourceHtml, originalScripts, group);
    const parts = group.files.map(file => {
      const original = readUtf8(checkedPath(source, file));
      const copied = readUtf8(checkedPath(output, file));
      assertDefinitionScript(original, file);
      assertDefinitionScript(copied, file);
      // Accept only the unchanged source or the exact existing format-only
      // formatter output. Do not normalize AST differences into presumed
      // equivalence (e.g. shorthand/object-method/quoted-property semantics).
      if (copied !== original && copied !== minifyJavaScript(original, file)) fail('OUTPUT_PROGRAM_CHANGED', file);
      return wrapDefinition(copied, file);
    });
    const code = parts.join('\n;\n');
    parseScript(code, group.name + '.bundle.js');
    const hash = crypto.createHash('sha256').update(code).digest('hex');
    const file = `assets/js/bundles/kc-home-${group.name}.${hash.slice(0, 20)}.js`;
    const target = checkedPath(output, file, true);
    if (fs.existsSync(target) && readUtf8(target) !== code) fail('HASH_COLLISION', file);
    const bundled = scripts.filter(node => assetPath(node) === file);
    const remaining = scripts.filter(node => group.files.includes(assetPath(node)));
    if (bundled.length) {
      if (bundled.length !== 1 || remaining.length) fail('HTML_PARTIAL_GROUP', group.name);
      assertTag(bundled[0]);
      if (!fs.existsSync(target)) fail('MISSING', target);
    } else {
      const nodes = groupNodes(html, scripts, group);
      const versions = nodes.map(node => scriptSource(node).split('?v=')[1] || '');
      const revision = options.revision || (versions.every(value => value === versions[0]) && versions[0]) || hash.slice(0, 20);
      if (!/^[0-9A-Za-z._-]{1,40}$/.test(revision)) fail('INVALID_REVISION', revision);
      replacements.push({
        start: nodes[0].sourceCodeLocation.startOffset,
        end: nodes[nodes.length - 1].sourceCodeLocation.endOffset,
        text: `<script defer src="${file}?v=${revision}"></script>`,
      });
    }
    artifacts.push({ file, target, code, hash, sources: group.files });
  }
  let nextHtml = html;
  replacements.sort((a, b) => b.start - a.start).forEach(replacement => {
    nextHtml = nextHtml.slice(0, replacement.start) + replacement.text + nextHtml.slice(replacement.end);
  });
  inspectHtml(nextHtml);
  checkedPath(output, 'index.html');
  artifacts.forEach(artifact => checkedPath(output, artifact.file, true));
  const bundleDir = checkedPath(output, 'assets/js/bundles', true);
  fs.mkdirSync(bundleDir, { recursive: true });
  for (const artifact of artifacts) {
    checkedPath(output, artifact.file, true);
    if (!fs.existsSync(artifact.target)) fs.writeFileSync(artifact.target, artifact.code, { encoding: 'utf8', flag: 'wx' });
  }
  if (nextHtml !== html) {
    const temporary = path.join(output, `.definition-bundles-${crypto.randomBytes(12).toString('hex')}.tmp`);
    try {
      fs.writeFileSync(temporary, nextHtml, { encoding: 'utf8', flag: 'wx' });
      checkedPath(output, 'index.html');
      fs.renameSync(temporary, outputHtmlPath);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  return Object.freeze({
    outputRoot: output,
    changed: replacements.length > 0,
    groups: artifacts.map(({ file, hash, sources, code }) => Object.freeze({
      file, hash, sources, bytes: Buffer.byteLength(code),
      url: scriptSource(inspectHtml(nextHtml).find(node => assetPath(node) === file)),
    })),
    scriptsBefore: scripts.length,
    scriptsAfter: inspectHtml(nextHtml).length,
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 1) throw new Error('Usage: node scripts/bundle-static-definition-scripts.js <copied-output-root>');
  console.log(JSON.stringify(bundleStaticDefinitionScripts({ outputRoot: path.resolve(args[0]) }), null, 2));
}

module.exports = Object.freeze({ GROUPS, assertDefinitionScript, wrapDefinition, bundleStaticDefinitionScripts, extendDefinitionShellPrecache });

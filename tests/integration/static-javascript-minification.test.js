/** @jest-environment node */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const parser = require('@babel/parser');
const { buildStaticOutput } = require('../../scripts/build-static-output');
const { MINIFY_OPTIONS, minifyJavaScript, minifyStaticJavaScript } = require('../../scripts/minify-static-javascript');
const { minifyCssComments } = require('../../scripts/minify-static-css-comments');

const ROOT = path.resolve(__dirname, '../..');

function normalizedAst(code) {
  function normalize(value, parentType) {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((entry) => normalize(entry, parentType));
    const next = {};
    Object.entries(value).forEach(([key, entry]) => {
      if (['start', 'end', 'loc', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments', 'shorthand'].includes(key)) return;
      // An empty standalone statement and object shorthand have no semantic
      // effect. Preserve EmptyStatement when it is the body of a loop/branch.
      if (key === 'body' && Array.isArray(entry)) entry = entry.filter((node) => node.type !== 'EmptyStatement');
      next[key] = normalize(entry, value.type);
    });
    // Cooked text is observable for ordinary templates; raw text is ALSO
    // observable for tagged templates, so only normalize the former.
    if (value.type === 'TemplateLiteral' && parentType !== 'TaggedTemplateExpression') {
      next.quasis.forEach((quasi) => { delete quasi.value.raw; });
    }
    // Non-computed object keys use the same property name whether written as
    // an identifier, a number or a string. Computed keys stay untouched.
    if (value.type === 'ObjectProperty' && !value.computed && ['Identifier', 'StringLiteral', 'NumericLiteral'].includes(value.key.type)) {
      next.key = { type: 'StringLiteral', value: String(value.key.type === 'Identifier' ? value.key.name : value.key.value) };
    }
    if (value.type === 'ArrowFunctionExpression' && next.body.type === 'BlockStatement'
      && !next.body.directives.length && next.body.body.length === 1
      && next.body.body[0].type === 'ReturnStatement' && next.body.body[0].argument) {
      next.body = next.body.body[0].argument;
    }
    return next;
  }
  return normalize(parser.parse(code, { sourceType: 'script' }));
}

describe('format-only JavaScript minification', () => {
  test('pins the synchronous minifier as a production build dependency', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
    expect(manifest.dependencies.terser).toBe('5.51.2');
    expect(lock.packages['node_modules/terser'].version).toBe('5.51.2');
    expect(lock.packages['node_modules/terser'].dev).not.toBe(true);
    expect(typeof require('terser').minify_sync).toBe('function');
  });

  test('disables code transformations, scope changes, renaming and source maps', () => {
    expect(MINIFY_OPTIONS).toMatchObject({ compress: false, mangle: false, module: false, toplevel: false, sourceMap: false, keep_classnames: true, keep_fnames: true });
    expect(Object.isFrozen(MINIFY_OPTIONS)).toBe(true);
    expect(Object.isFrozen(MINIFY_OPTIONS.format)).toBe(true);
  });

  test('is synchronous, preserves licenses, names, quoted keys and Unicode', () => {
    const original = `
      /*! KinoCampus - BSD-2-Clause */
      /* Copyright 2026 KinoCampus */
      // SPDX-License-Identifier: MIT
      // @license Preserved license notice
      // Implementation explanation removed from the public artifact.
      function describeCampus(firstName, lastName) {
        return { 'nome-completo': firstName + ' ' + lastName, 'emoji': '⛺', 'accent': 'São João' };
      }
      class CampusMember { constructor(name) { this.name = name; } }
      globalThis.result = [describeCampus.name, describeCampus.length, CampusMember.name, describeCampus('Ana', 'Silva')];
    `;
    const output = minifyJavaScript(original);
    expect(typeof output).toBe('string');
    expect(output).toContain('/*! KinoCampus - BSD-2-Clause */');
    expect(output).toContain('Copyright 2026 KinoCampus');
    expect(output).toContain('SPDX-License-Identifier: MIT');
    expect(output).toContain('@license Preserved license notice');
    expect(output).not.toContain('Implementation explanation');
    expect(output).toContain("'nome-completo'");
    expect(output).toContain('São João');
    expect(normalizedAst(output)).toEqual(normalizedAst(original));
    const expected = vm.createContext({});
    const actual = vm.createContext({});
    vm.runInContext(original, expected);
    vm.runInContext(output, actual);
    expect(actual.result).toEqual(expected.result);
    expect(Buffer.byteLength(output)).toBeLessThan(Buffer.byteLength(original));
  });

  test('keeps separate classic-script globals and strict/sloppy boundaries', () => {
    const sources = [
      "'use strict'; const sharedCount = 3; function sharedAdd(value) { return sharedCount + value; }",
      'implicitGlobal = sharedAdd(4); globalThis.result = { implicitGlobal, sharedCount, name: sharedAdd.name };',
    ];
    const expected = vm.createContext({});
    const actual = vm.createContext({});
    sources.forEach((source, index) => {
      vm.runInContext(source, expected);
      vm.runInContext(minifyJavaScript(source, `part-${index}.js`), actual);
    });
    expect(actual.result).toEqual(expected.result);
    expect(actual.result).toEqual({ implicitGlobal: 7, sharedCount: 3, name: 'sharedAdd' });
  });

  test('preserves UMD browser and CommonJS exports without adding a wrapper', () => {
    const original = `(function (root, factory) {
      const api = factory();
      if (typeof module !== 'undefined' && module.exports) module.exports = api;
      if (root) root.KCTest = api;
    })(typeof window !== 'undefined' ? window : globalThis, function () {
      'use strict';
      return Object.freeze({ getValue: function getValue() { return 42; } });
    });`;
    for (const globals of [{ window: {} }, { module: { exports: {} } }]) {
      const expected = vm.createContext(structuredClone(globals));
      const actual = vm.createContext(structuredClone(globals));
      vm.runInContext(original, expected);
      vm.runInContext(minifyJavaScript(original), actual);
      const originalApi = expected.window ? expected.window.KCTest : expected.module.exports;
      const outputApi = actual.window ? actual.window.KCTest : actual.module.exports;
      expect(outputApi.getValue()).toBe(originalApi.getValue());
      expect(outputApi.getValue.name).toBe('getValue');
      expect(Object.isFrozen(outputApi)).toBe(true);
    }
  });

  test('preserves template literals, regexes, automatic semicolons and optional chaining', () => {
    const original = "function newlineReturn() { return\n { value: 1 }; }\nconst text = `Primeira linha\nSegunda linha`;\nconst raw = String.raw`Primeira linha\nSegunda linha`;\nconst match = /[a-z]+\\/fim/u.test('abc/fim');\nglobalThis.result = [newlineReturn(), text, raw, match, ({ value: 0 })?.value ?? 99];";
    const output = minifyJavaScript(original);
    expect(normalizedAst(output)).toEqual(normalizedAst(original));
    const expected = vm.createContext({});
    const actual = vm.createContext({});
    vm.runInContext(original, expected);
    vm.runInContext(output, actual);
    expect(actual.result).toEqual(expected.result);
  });

  test('is deterministic and does not expand already compact or empty assets', () => {
    for (const original of ['', 'var x=1;', '/* explanation only */', '/*! license */', 'function campus() { return 3; }']) {
      const output = minifyJavaScript(original);
      expect(minifyJavaScript(original)).toBe(output);
      expect(minifyJavaScript(output)).toBe(output);
      expect(Buffer.byteLength(output)).toBeLessThanOrEqual(Buffer.byteLength(original));
    }
  });

  test('fails closed on malformed input and module-only syntax', () => {
    expect(() => minifyJavaScript('function broken(', 'broken.js')).toThrow('STATIC_JAVASCRIPT_MINIFY_FAILED:broken.js');
    expect(() => minifyJavaScript('export const value = 1;', 'module.js')).toThrow('STATIC_JAVASCRIPT_MINIFY_FAILED:module.js');
  });

  test('preserves the normalized semantic syntax tree of every first-party browser script', () => {
    const files = [];
    function collect(directory) {
      fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) collect(target);
        else if (entry.isFile() && entry.name.endsWith('.js')) files.push(target);
      });
    }
    collect(path.join(ROOT, 'assets/js'));
    expect(files.length).toBeGreaterThan(150);
    for (const filename of files) {
      const source = fs.readFileSync(filename, 'utf8');
      const output = minifyJavaScript(source, path.relative(ROOT, filename));
      const outputAst = JSON.stringify(normalizedAst(output));
      const sourceAst = JSON.stringify(normalizedAst(source));
      expect({ filename, equivalent: outputAst === sourceAst }).toEqual({ filename, equivalent: true });
    }
  }, 30000);

  test('shrinks the Home script transfer without dropping any script', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const files = [...new Set([...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)]
      .map((match) => match[1].split('?')[0]).filter((file) => file.startsWith('assets/js/')))];
    const totals = files.reduce((total, file) => {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      const output = minifyJavaScript(source, file);
      total.before += zlib.gzipSync(source).length;
      total.after += zlib.gzipSync(output).length;
      return total;
    }, { before: 0, after: 0 });
    expect(files.length).toBeGreaterThan(90);
    expect(totals.after).toBeLessThan(totals.before * 0.85);
  });
});

describe('static build artifact boundary', () => {
  let fixtureRoot;
  let outputRoot;
  function write(relative, content) {
    const filename = path.join(fixtureRoot, relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, content);
  }

  beforeEach(() => {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-js-minification-'));
    outputRoot = path.join(fixtureRoot, 'dist');
    ['index.html', '_product.html', 'admin/index.html'].forEach((file) => write(file, '<script src="assets/js/app.js?v=1"></script>'));
    ['ads.txt', 'llms.txt', 'robots.txt', 'data/database.json'].forEach((file) => write(file, '{}'));
    write('sw.js', '/* original service worker */ var CACHE_VERSION = "fixed";');
    write('assets/js/boot/kc-env.js', '/* environment explanation */ var KC_ENV = { driver: "local" };');
    write('assets/js/app.js', '/* application explanation */ function getCampus() { return "Kino Campus"; }');
    write('assets/css/styles.css', '/* unchanged CSS */ body { color: white; }');
    write('assets/vendor/official.js', '/* untouched official bundle */ var Vendor = { value: 7 };');
    write('api/server.js', '/* server-only code */ module.exports = function () { return 7; };');
  });

  afterEach(() => {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });

  test('build is synchronous and keeps JS optimization isolated from source/vendor/HTML', () => {
    const originals = ['index.html', 'admin/index.html', 'assets/css/styles.css', 'assets/vendor/official.js', 'sw.js', 'assets/js/app.js', 'assets/js/boot/kc-env.js', 'api/server.js'];
    const originalContents = Object.fromEntries(originals.map((file) => [file, fs.readFileSync(path.join(fixtureRoot, file), 'utf8')]));
    const result = buildStaticOutput({ sourceRoot: fixtureRoot, outputRoot });
    expect(result.then).toBeUndefined();
    expect(result.javascript.files).toBe(2);
    expect(result.javascript.changedFiles).toBe(2);
    expect(result.javascript.bytesAfter).toBeLessThan(result.javascript.bytesBefore);
    originals.forEach((file) => expect(fs.readFileSync(path.join(fixtureRoot, file), 'utf8')).toBe(originalContents[file]));
    ['index.html', 'admin/index.html', 'assets/vendor/official.js', 'sw.js'].forEach((file) => {
      expect(fs.readFileSync(path.join(outputRoot, file), 'utf8')).toBe(originalContents[file]);
    });
    expect(fs.readFileSync(path.join(outputRoot, 'assets/css/styles.css'), 'utf8')).toBe(minifyCssComments(originalContents['assets/css/styles.css']));
    expect(fs.readFileSync(path.join(outputRoot, 'assets/js/app.js'), 'utf8')).toBe(minifyJavaScript(originalContents['assets/js/app.js']));
    expect(fs.existsSync(path.join(outputRoot, 'api/server.js'))).toBe(false);
  });

  test('a second optimization is byte-identical and build statistics are consistent', () => {
    const result = buildStaticOutput({ sourceRoot: fixtureRoot, outputRoot });
    const next = minifyStaticJavaScript({ sourceRoot: fixtureRoot, outputRoot });
    expect(next.changedFiles).toBe(0);
    expect(next.bytesBefore).toBe(result.javascript.bytesAfter);
    expect(next.bytesAfter).toBe(next.bytesBefore);
  });

  test('syntax failure stops the build before writing any optimized JS', () => {
    write('assets/js/z-broken.js', 'function broken(');
    expect(() => buildStaticOutput({ sourceRoot: fixtureRoot, outputRoot })).toThrow('STATIC_JAVASCRIPT_MINIFY_FAILED:assets/js/z-broken.js');
    expect(fs.readFileSync(path.join(outputRoot, 'assets/js/app.js'), 'utf8')).toBe(fs.readFileSync(path.join(fixtureRoot, 'assets/js/app.js'), 'utf8'));
  });

  test('refuses to optimize the source tree or an output inside original assets', () => {
    expect(() => minifyStaticJavaScript({ sourceRoot: fixtureRoot, outputRoot: fixtureRoot })).toThrow('STATIC_JAVASCRIPT_OUTPUT_UNSAFE');
    expect(() => minifyStaticJavaScript({ sourceRoot: fixtureRoot, outputRoot: path.join(fixtureRoot, 'assets') })).toThrow('STATIC_JAVASCRIPT_OUTPUT_UNSAFE');
    expect(() => minifyStaticJavaScript({ sourceRoot: fixtureRoot, outputRoot: path.join(fixtureRoot, 'assets/js') })).toThrow('STATIC_JAVASCRIPT_OUTPUT_UNSAFE');
  });

  test('refuses symlinks instead of following them back to original source', () => {
    buildStaticOutput({ sourceRoot: fixtureRoot, outputRoot });
    const sourceScript = path.join(fixtureRoot, 'assets/js/app.js');
    const original = fs.readFileSync(sourceScript, 'utf8');
    fs.symlinkSync(path.join(fixtureRoot, 'assets/js'), path.join(outputRoot, 'assets/js/source-link'), 'junction');
    expect(() => minifyStaticJavaScript({ sourceRoot: fixtureRoot, outputRoot })).toThrow('STATIC_JAVASCRIPT_SYMLINK');
    expect(fs.readFileSync(sourceScript, 'utf8')).toBe(original);
  });
});

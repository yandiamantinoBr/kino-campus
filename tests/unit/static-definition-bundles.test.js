/** @jest-environment node */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const acorn = require('acorn');
const { GROUPS, assertDefinitionScript, wrapDefinition } = require('../../scripts/bundle-static-definition-scripts');
const { minifyJavaScript } = require('../../scripts/minify-static-javascript');
const ROOT = path.resolve(__dirname, '../..');
const iife = body => `(function () { 'use strict'; ${body} })();`;

function createRealm() {
  const listeners = [];
  const errors = [];
  const timers = [];
  const sandbox = {
    document: { addEventListener: (...args) => listeners.push(args) },
    reportError: error => errors.push(error),
    setTimeout: callback => timers.push(callback),
  };
  sandbox.window = sandbox;
  return { context: vm.createContext(sandbox), listeners, errors, timers };
}

function describeValue(value, seen = new Set()) {
  if (typeof value === 'function') return { type: 'function', name: value.name, length: value.length, source: String(value) };
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  return { frozen: Object.isFrozen(value), properties: Object.fromEntries(Object.keys(value).sort().map(key => [key, describeValue(value[key], seen)])) };
}

describe('static definition bundle AST contract', () => {
  test('is explicitly restricted to 38 definition files and excludes boot, SDK and API clients', () => {
    expect(GROUPS.map(group => group.files.length)).toEqual([7, 14, 12, 5]);
    expect(Object.isFrozen(GROUPS)).toBe(true);
    expect(GROUPS.every(group => Object.isFrozen(group) && Object.isFrozen(group.files))).toBe(true);
    const names = GROUPS.flatMap(group => group.files);
    expect(new Set(names).size).toBe(38);
    expect(names.join('\n')).not.toMatch(/kc-env|kc-consent|kc-api\.client|kc-supabase\.client|kc-users|kc-search|kc-core|vendor/);
  });

  test.each(GROUPS.flatMap(group => group.files))('accepts original and existing format-only minified %s', file => {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    expect(() => assertDefinitionScript(source, file)).not.toThrow();
    expect(() => assertDefinitionScript(minifyJavaScript(source, file), file)).not.toThrow();
  });

  test.each([
    ['top-level directive', `'use strict'; ${iife('')}`],
    ['top-level variable', `var globalName = 1; ${iife('')}`],
    ['top-level function', `function globalName() {} ${iife('')}`],
    ['missing inner directive', '(function () { window._KCU = {}; })();'],
    ['async IIFE', '(async function () { "use strict"; })();'],
    ['generator IIFE', '(function* () { "use strict"; })();'],
    ['arrow IIFE', '(() => { "use strict"; })();'],
    ['IIFE arguments', '(function (arg) { "use strict"; })(window);'],
    ['named IIFE', '(function registration() { "use strict"; })();'],
    ['initializer function', iife('function boot() {} boot();')],
    ['nested IIFE call', iife('(function () {})();')],
    ['Promise.resolve', iife('Promise.resolve().then(function () {});')],
    ['new Promise', iife('const ready = new Promise(function () {});')],
    ['queueMicrotask', iife('queueMicrotask(function () {});')],
    ['setTimeout', iife('setTimeout(function () {}, 0);')],
    ['fetch', iife('fetch("/api");')],
    ['await', iife('await Promise.resolve();')],
    ['dynamic import', iife('function later() { return import("./later.js"); }')],
    ['direct eval', iife('function later() { eval("window.x=1"); }')],
    ['indirect eval', iife('function later() { window["eval"]("x"); }')],
    ['Function constructor', iife('function later() { return new Function("return 1"); }')],
    ['currentScript in deferred body', iife('function later() { return document.currentScript; }')],
    ['currentScript computed literal', iife('function later() { return document["currentScript"]; }')],
    ['dynamic document member', iife('function later(name) { return document[name]; }')],
    ['document.write', iife('function later() { document.write("<h1>changed</h1>"); }')],
    ['document.writeln', iife('function later() { window.document.writeln("changed"); }')],
    ['import.meta', iife('function later() { return import.meta.url; }')],
    ['getter object', iife('const item = { get value() { return 1; } };')],
    ['object computed key', iife('const item = { [window.name]: 1 };')],
    ['object spread', iife('const item = { ...window._KCU };')],
    ['destructuring', iife('const { value = fetch("/") } = {};')],
    ['property getter read', iife('const value = window.location;')],
    ['local property getter read', iife('const item = {}; const value = item.result;')],
    ['implicit coercion', iife('const item = { valueOf() { queueMicrotask(function () {}); } }; const value = +item;')],
    ['template coercion', iife('const item = {}; const value = `${item}`;')],
    ['loose equality coercion', iife('const item = {}; const value = item == 1;')],
    ['builtin shadowing', iife('const Object = { freeze: function () { queueMicrotask(function () {}); } }; Object.freeze({});')],
    ['Map shadowing function', iife('function Map() { queueMicrotask(function () {}); } const state = new Map();')],
    ['window shadowing', iife('const window = {}; window._KCU = {};')],
    ['document shadowing', iife('const document = {};')],
    ['custom iterable', iife('const item = {}; const state = new Set(item);')],
    ['Set item expression', iife('const state = new Set([window._KCU]);')],
    ['prototype write', iife('window._KCU.__proto__ = {};')],
    ['prototype object', iife('window._KCU = { __proto__: {} };')],
    ['computed write', iife('window["_KCU"] = {};')],
    ['increment', iife('let value = 0; value++;')],
    ['loop', iife('for (;;) {}')],
    ['new initializer', iife('class App {} const item = new App();')],
    ['top-level throw', iife('throw new Error("failed");')],
    ['sourceURL', iife('') + '\n//# sourceURL=other.js'],
    ['source map', iife('') + '\n/*# sourceMappingURL=other.map */'],
  ])('fails closed for %s', (_name, source) => {
    expect(() => assertDefinitionScript(source)).toThrow(/STATIC_DEFINITION_BUNDLE_/);
  });

  test('accepts definitions, simple constants, original namespace registration and primitive collections', () => {
    expect(() => assertDefinitionScript(iife(`
      const stale = 5 * 60 * 1000;
      const values = new Set(['module', 'category']);
      const pending = new Map();
      function later() { return Promise.resolve(stale); }
      window._KCU = window._KCU || {};
      window._KCU.example = Object.freeze({ later, values, pending });
    `))).not.toThrow();
  });

  test('existing capture listener is allowed only in its reviewed source file', () => {
    const source = iife("function _handleFeedAvatarError() {} document.addEventListener('error', _handleFeedAvatarError, true);");
    expect(() => assertDefinitionScript(source, 'assets/js/utils/kc-utils.presentation.js')).not.toThrow();
    expect(() => assertDefinitionScript(source, 'other.js')).toThrow(/EVALUATION_CALL/);
    expect(() => assertDefinitionScript(source.replace("'error'", "'DOMContentLoaded'"), 'assets/js/utils/kc-utils.presentation.js')).toThrow();
  });

  test('wrapper does not introduce an outer function or rewrite original function text', () => {
    const source = iife('function same(a, b) { return this; } window._KCU = { same };');
    const wrapped = wrapDefinition(source, 'test.js');
    expect(wrapped).toContain(source);
    const parsed = acorn.parse(wrapped, { ecmaVersion: 2022 });
    expect(parsed.body).toHaveLength(1);
    expect(parsed.body[0].type).toBe('TryStatement');
    const realm = createRealm();
    vm.runInContext(wrapped, realm.context);
    const fn = realm.context._KCU.same;
    expect(fn.call(undefined)).toBeUndefined();
    expect(fn.name).toBe('same');
    expect(fn.length).toBe(2);
    expect(String(fn)).toBe('function same(a, b) { return this; }');
    expect(Object.keys(realm.context)).not.toContain('same');
  });

  test.each(GROUPS)('real $name exports, closures, frozen shape and listeners match separate scripts', group => {
    const originals = group.files.map(file => minifyJavaScript(fs.readFileSync(path.join(ROOT, file), 'utf8'), file));
    const baseline = createRealm();
    const candidate = createRealm();
    originals.forEach(source => vm.runInContext(source, baseline.context));
    vm.runInContext(originals.map((source, index) => wrapDefinition(source, group.files[index])).join('\n;\n'), candidate.context);
    for (const name of ['_KCU', 'KCSupabase', '_KCAPI', '_KCLA', '_KCSA', '_KCCreatePost', 'KCCompressImage']) {
      expect(describeValue(candidate.context[name])).toEqual(describeValue(baseline.context[name]));
    }
    expect(candidate.listeners.map(args => args.map(value => describeValue(value)))).toEqual(baseline.listeners.map(args => args.map(value => describeValue(value))));
    expect(candidate.errors).toEqual([]);
    expect(candidate.timers).toEqual([]);
  });

  test.each([true, false])('one failed registration does not stop following definitions (reportError=%s)', native => {
    const realm = createRealm();
    if (!native) delete realm.context.reportError;
    const expected = { message: 'original thrown value, not wrapped' };
    realm.context._KCU = {};
    Object.defineProperty(realm.context._KCU, 'failed', { set() { throw expected; } });
    const sources = [iife('window._KCU.before = 1;'), iife('window._KCU.failed = 1;'), iife('window._KCU.after = 2;')];
    vm.runInContext(sources.map((source, index) => wrapDefinition(source, `file-${index}.js`)).join('\n;\n'), realm.context);
    expect(realm.context._KCU.before).toBe(1);
    expect(realm.context._KCU.after).toBe(2);
    if (native) expect(realm.errors).toEqual([expected]);
    else {
      expect(realm.errors).toEqual([]);
      expect(realm.timers).toHaveLength(1);
      try { realm.timers[0](); throw new Error('Expected original value'); } catch (caught) { expect(caught).toBe(expected); }
    }
  });

  test('filename comment injection is rejected', () => {
    expect(() => wrapDefinition(iife(''), 'file */ bad.js')).toThrow(/FILENAME/);
  });
});

/** @jest-environment node */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { applySupabasePreconnect } = require('../../scripts/static-resource-hints');
const ROOT = path.resolve(__dirname, '../..');
const ORIGIN = 'https://fixture-project.supabase.co';
const POLICY = "default-src 'self'; connect-src 'self' https://*.supabase.co";
const HTML = '<!doctype html><html><head><meta charset="utf-8"><link href="assets/css/styles.css?v=source" rel="stylesheet"></head><body><main>Fixture</main></body></html>';
let sourceRoot;
let outputRoot;
function write(root, relative, bytes) {
  const filename = path.join(root, relative);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, bytes);
}
function read(root, relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
function run(options = {}) { return applySupabasePreconnect({ sourceRoot, outputRoot, supabaseUrl: ORIGIN, ...options }); }
beforeEach(() => {
  sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-resource-hints-'));
  outputRoot = path.join(sourceRoot, 'dist');
  for (const root of [sourceRoot, outputRoot]) {
    write(root, 'index.html', HTML);
    write(root, 'other.html', '<main>Other page untouched</main>');
    write(root, 'assets/css/styles.css', 'body { color: orange; }');
    write(root, 'assets/js/boot/kc-env.js', 'window.KC_ENV={url:"__KC_SUPABASE_URL__",key:"__KC_SUPABASE_ANON_KEY__",turnstile:"__KC_TURNSTILE_SITE_KEY__",driver:"__KC_DRIVER__"};');
  }
  write(sourceRoot, 'vercel.json', JSON.stringify({ headers: [{ source: '/(.*)', headers: [{ key: 'Content-Security-Policy', value: POLICY }] }] }));
});
afterEach(() => {
  jest.restoreAllMocks();
  const target = path.resolve(sourceRoot);
  if (path.dirname(target) === os.tmpdir() && path.basename(target).startsWith('kc-resource-hints-')) fs.rmSync(target, { recursive: true, force: true });
});

test('changes only copied index, not source, other pages, CSS, configuration or runtime JS', () => {
  const before = ['index.html', 'other.html', 'assets/css/styles.css', 'assets/js/boot/kc-env.js'].map(file => ({ file, source: read(sourceRoot, file), output: read(outputRoot, file) }));
  expect(run()).toEqual({ changed: true, reason: 'added' });
  for (const entry of before) {
    expect(read(sourceRoot, entry.file)).toBe(entry.source);
    if (entry.file !== 'index.html') expect(read(outputRoot, entry.file)).toBe(entry.output);
  }
  const html = read(outputRoot, 'index.html');
  expect(html).toContain(`rel="preconnect" href="${ORIGIN}" crossorigin="anonymous"`);
  expect(html).not.toMatch(/SUPABASE_ANON_KEY|apikey|authorization|__KC_/i);
  const stamp = fs.statSync(path.join(outputRoot, 'index.html')).mtimeMs;
  expect(run()).toEqual({ changed: false, reason: 'already-present' });
  expect(fs.statSync(path.join(outputRoot, 'index.html')).mtimeMs).toBe(stamp);
});

test.each(['https://api.custom.example', `${ORIGIN}/rest/v1?apikey=fixture`, '', undefined])('unsupported endpoint skips without changing copied files: %s', supabaseUrl => {
  expect(run({ supabaseUrl })).toEqual({ changed: false, reason: 'unsupported-url' });
  expect(read(outputRoot, 'index.html')).toBe(HTML);
});

test('restrictive or absent CSP skips safely without modifying its policy', () => {
  for (const config of [{}, { headers: [null, { headers: [null] }] }, { headers: [{ headers: [{ key: 'Content-Security-Policy', value: "connect-src 'none'" }] }] }]) {
    const serialized = JSON.stringify(config);
    write(sourceRoot, 'vercel.json', serialized);
    expect(run()).toEqual({ changed: false, reason: 'csp-not-authorized' });
    expect(read(outputRoot, 'index.html')).toBe(HTML);
    expect(read(sourceRoot, 'vercel.json')).toBe(serialized);
  }
});

test('rejects source/parent/original-assets output roots before writing', () => {
  write(sourceRoot, 'admin/index.html', HTML);
  for (const target of [sourceRoot, path.dirname(sourceRoot), path.join(sourceRoot, 'assets'), path.join(sourceRoot, 'admin')]) {
    expect(() => run({ outputRoot: target })).toThrow(/STATIC_RESOURCE_HINT_UNSAFE/);
  }
  expect(read(sourceRoot, 'index.html')).toBe(HTML);
  expect(read(sourceRoot, 'admin/index.html')).toBe(HTML);
});

test('rejects output junction and index hardlink without modifying the linked source', () => {
  const alias = path.join(sourceRoot, 'dist-alias');
  fs.symlinkSync(outputRoot, alias, 'junction');
  expect(() => run({ outputRoot: alias })).toThrow('STATIC_RESOURCE_HINT_UNSAFE_ROOT');
  const linkedOutput = path.join(sourceRoot, 'dist-linked-output');
  fs.mkdirSync(linkedOutput);
  fs.linkSync(path.join(sourceRoot, 'index.html'), path.join(linkedOutput, 'index.html'));
  expect(() => run({ outputRoot: linkedOutput })).toThrow('STATIC_RESOURCE_HINT_HARDLINK');
  expect(read(sourceRoot, 'index.html')).toBe(HTML);
});

test('rejects non-regular index and invalid UTF-8 before creating any temporary artifact', () => {
  const directoryOutput = path.join(sourceRoot, 'dist-directory-output');
  fs.mkdirSync(path.join(directoryOutput, 'index.html'), { recursive: true });
  expect(() => run({ outputRoot: directoryOutput })).toThrow('STATIC_RESOURCE_HINT_NOT_REGULAR');
  write(outputRoot, 'index.html', Buffer.from([0x61, 0xff]));
  expect(() => run()).toThrow('STATIC_RESOURCE_HINT_UTF8');
  expect(fs.readdirSync(outputRoot).some(name => name.startsWith('.resource-hint-'))).toBe(false);
});

test('rejects an intermediate output junction without touching its target', () => {
  const actual = path.join(sourceRoot, 'actual-output');
  write(actual, 'child/index.html', HTML);
  const alias = path.join(sourceRoot, 'output');
  fs.symlinkSync(actual, alias, 'junction');
  expect(() => run({ outputRoot: path.join(alias, 'child') })).toThrow('STATIC_RESOURCE_HINT_UNSAFE_ROOT');
  expect(read(actual, 'child/index.html')).toBe(HTML);
});

test('atomic replacement failure keeps copied HTML intact and cleans only its temporary file', () => {
  jest.spyOn(fs, 'renameSync').mockImplementation(() => { throw new Error('controlled rename failure'); });
  expect(() => run()).toThrow('controlled rename failure');
  expect(read(outputRoot, 'index.html')).toBe(HTML);
  expect(fs.readdirSync(outputRoot).some(name => name.startsWith('.resource-hint-'))).toBe(false);
});

test('production injection explicitly enables definition bundles, then applies hint, then cache revision', () => {
  const order = [];
  const build = jest.fn(options => {
    order.push('build');
    expect(options).toMatchObject({ sourceRoot, outputRoot, definitionBundles: true });
    return { outputRoot, rootFiles: 2 };
  });
  const hint = jest.fn(options => {
    order.push('hint');
    expect(options).toEqual({ sourceRoot, outputRoot, supabaseUrl: ORIGIN });
    return applySupabasePreconnect(options);
  });
  const cache = jest.fn(() => {
    order.push('cache');
    expect(read(outputRoot, 'index.html')).toContain('rel="preconnect"');
    return { revision: 'fixture', htmlFiles: 2, htmlAssets: 1, shellAssets: 1 };
  });
  const context = {
    __dirname: path.join(sourceRoot, 'scripts'),
    console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    process: { env: { CI: 'true', SUPABASE_URL: ORIGIN, SUPABASE_PUBLIC_KEY: 'sb_publishable_fixture_only_not_a_real_key' }, stdout: { isTTY: false }, exit: code => { throw new Error(`unexpected exit ${code}`); } },
    Buffer,
    require(name) {
      if (name === './vercel-production-guard') return { assertVercelProductionOrigin: jest.fn() };
      if (name === './static-cache-revision') return { resolveBuildRevision: () => 'fixture', applyStaticCacheRevision: cache };
      if (name === './build-static-output') return { buildStaticOutput: build };
      if (name === './static-resource-hints') return { applySupabasePreconnect: hint };
      return require(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'scripts/inject-env.js'), 'utf8'), context);
  expect(order).toEqual(['build', 'hint', 'cache']);
  expect(read(sourceRoot, 'index.html')).toBe(HTML);
  expect(read(outputRoot, 'index.html')).not.toContain(context.process.env.SUPABASE_PUBLIC_KEY);
});
